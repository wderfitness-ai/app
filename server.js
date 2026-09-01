import http from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { get as blobGet, issueSignedToken, presignUrl, put as blobPut } from "@vercel/blob";
import PDFDocument from "pdfkit";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const DATA_FILE = process.env.DATA_FILE || (process.env.VERCEL ? path.join("/tmp", "trade-order-database.json") : path.join(__dirname, "data", "database.json"));
const PUBLIC_DIR = path.join(__dirname, "public");
const UPLOAD_DIR = process.env.UPLOAD_DIR || (process.env.VERCEL ? path.join("/tmp", "trade-order-uploads") : path.join(__dirname, "uploads"));
const FACTORY_LICENSE_DIR = path.join(UPLOAD_DIR, "factory_licenses");
const PDF_SCRIPT = path.join(__dirname, "scripts", "render-pdf.py");
const PDF_EXTRACT_SCRIPT = path.join(__dirname, "scripts", "extract-order-pdf.py");
const LOGO_PATH = path.join(PUBLIC_DIR, "assets", "wder-logo.jpg");
const PDF_FONT_PATH = path.join(PUBLIC_DIR, "assets", "fonts", "NotoSansSC-Regular.ttf");
const PYTHON_BIN = process.env.PYTHON_BIN || "python3";
const PORT = Number(process.env.PORT || 3000);
const CNY_PER_USD = Number(process.env.CNY_PER_USD || 7.2);
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.BOOTSTRAP_ADMIN_PASSWORD || "local-development-session-secret";
const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || 18_000_000);
const BLOB_DB_PATH = process.env.BLOB_DB_PATH || "data/trade-order-database.json";
const USE_BLOB_DB = Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID));

const BUYER_INFO = {
  company: "青岛维德立机械制造有限公司",
  contact: "朱经理",
  phone: "13616427825"
};

const ROLE = {
  ADMIN: "Admin",
  SALES: "Sales",
  MERCH: "Merchandiser",
  FINANCE: "Finance",
  FACTORY: "Factory"
};

const BOOTSTRAP_ADMIN = {
  id: "user-wderfitness-admin",
  name: "WdeFitness",
  email: process.env.BOOTSTRAP_ADMIN_EMAIL || "wderfitness@gmail.com",
  password: process.env.BOOTSTRAP_ADMIN_PASSWORD || "",
  role: ROLE.ADMIN,
  approvalStatus: "approved"
};

const ORDER_STATUS = [
  "Inquiry Received",
  "Quoted",
  "Customer Confirmed",
  "Deposit Received",
  "Factory Order Placed",
  "Factory Confirmed",
  "Logo / Artwork Confirmed",
  "Sample / Pre-production Confirmed",
  "Mass Production",
  "Production Inspection",
  "Packing Inspection",
  "Balance Payment Pending",
  "Ready to Ship",
  "Shipped",
  "Delivered",
  "After-sales",
  "Closed",
  "Cancelled"
];

const STATUS_ZH = {
  "Inquiry Received": "询盘中",
  Quoted: "已报价",
  "Customer Confirmed": "客户已确认",
  "Deposit Received": "已收定金",
  "Factory Order Placed": "已安排工厂",
  "Factory Confirmed": "工厂已确认",
  "Logo / Artwork Confirmed": "Logo或设计已确认",
  "Sample / Pre-production Confirmed": "产前样已确认",
  "Mass Production": "批量生产中",
  "Production Inspection": "生产质检中",
  "Packing Inspection": "包装质检中",
  "Balance Payment Pending": "待收尾款",
  "Ready to Ship": "待发货",
  Shipped: "已发货",
  Delivered: "已送达",
  "After-sales": "售后处理中",
  Closed: "订单关闭",
  Cancelled: "已取消"
};

const EXTRA_STATUS_ZH = {
  Pending: "待处理",
  Confirmed: "已确认",
  Paid: "付款完成",
  Unpaid: "未付款",
  "Deposit Paid": "支付预付款",
  "Balance Pending": "待付尾款",
  "Deposit Pending": "待收定金",
  "Not Started": "未开始",
  Passed: "通过",
  Failed: "不通过",
  "Need Rework": "需要返工"
};

async function ensureDataFile() {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  try {
    await stat(DATA_FILE);
  } catch {
    await writeFile(DATA_FILE, JSON.stringify(emptyDb(), null, 2));
  }
}

function emptyDb() {
  return {
    users: [],
    roles: Object.values(ROLE).map((name, index) => ({ id: `role-${index + 1}`, name })),
    customers: [],
    factories: [],
    products: [],
    sales_orders: [],
    sales_order_items: [],
    purchase_orders: [],
    purchase_order_items: [],
    order_files: [],
    order_timeline: [],
    qc_reports: [],
    qc_report_items: [],
    payments: [],
    reminders: [],
    audit_logs: []
  };
}

async function readDb() {
  if (USE_BLOB_DB) {
    const stored = await blobGet(BLOB_DB_PATH, { access: "private", useCache: false });
    const db = stored?.stream ? JSON.parse(await new Response(stored.stream).text()) : emptyDb();
    const changed = ensureBootstrapAdmin(db);
    if (!stored || changed) await writeDb(db);
    return db;
  }
  await ensureDataFile();
  const db = JSON.parse(await readFile(DATA_FILE, "utf8"));
  if (ensureBootstrapAdmin(db)) await writeDb(db);
  return db;
}

async function writeDb(db) {
  if (USE_BLOB_DB) {
    await blobPut(BLOB_DB_PATH, JSON.stringify(db, null, 2), {
      access: "private",
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60
    });
    return;
  }
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(db, null, 2));
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function now() {
  return new Date().toISOString();
}

function ensureBootstrapAdmin(db) {
  if (!BOOTSTRAP_ADMIN.password) return false;
  const existing = db.users.find((user) => String(user.email || "").toLowerCase() === BOOTSTRAP_ADMIN.email);
  if (existing) {
    let changed = false;
    for (const [key, value] of Object.entries(BOOTSTRAP_ADMIN)) {
      if (existing[key] !== value) {
        existing[key] = value;
        changed = true;
      }
    }
    if (!existing.approvedAt) {
      existing.approvedAt = now();
      changed = true;
    }
    return changed;
  }
  db.users.push({ ...BOOTSTRAP_ADMIN, createdAt: now(), approvedAt: now() });
  return true;
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));
}

function signSessionToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, issuedAt: Date.now() })).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes(".")) return "";
  const [payload, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
  if (signature.length !== expected.length) return "";
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return "";
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return String(parsed.userId || "");
  } catch {
    return "";
  }
}

async function getUser(req, db) {
  const userId = verifySessionToken(parseCookies(req).session);
  return userId ? db.users.find((user) => user.id === userId) || null : null;
}

function canViewFinance(user) {
  return [ROLE.ADMIN, ROLE.FINANCE].includes(user?.role);
}

function statusText(status) {
  return STATUS_ZH[status] || EXTRA_STATUS_ZH[status] || status || "";
}

function canManageCore(user) {
  return [ROLE.ADMIN, ROLE.SALES].includes(user?.role);
}

function canManageOps(user) {
  return [ROLE.ADMIN, ROLE.MERCH].includes(user?.role);
}

function canManageFinance(user) {
  return [ROLE.ADMIN, ROLE.FINANCE].includes(user?.role);
}

function canEditPurchasePayment(user) {
  return [ROLE.ADMIN, ROLE.SALES].includes(user?.role);
}

function isFactory(user) {
  return user?.role === ROLE.FACTORY;
}

function isApprovedUser(user) {
  return !user?.approvalStatus || user.approvalStatus === "approved";
}

function bodyJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      raw += chunk;
      if (raw.length > MAX_JSON_BODY_BYTES) {
        tooLarge = true;
        const error = new Error("上传文件过大，请压缩图片或选择小于 4MB 的文件后再上传");
        error.statusCode = 413;
        reject(error);
      }
    });
    req.on("end", () => {
      if (tooLarge) return;
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function json(res, status, data, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(data));
}

function text(res, status, content, contentType = "text/plain; charset=utf-8", headers = {}) {
  res.writeHead(status, { "content-type": contentType, ...headers });
  res.end(content);
}

function requireAuth(user, res) {
  if (!user) {
    json(res, 401, { error: "Unauthorized" });
    return false;
  }
  return true;
}

function requireRole(user, res, roles) {
  if (!requireAuth(user, res)) return false;
  if (!roles.includes(user.role)) {
    json(res, 403, { error: "Forbidden" });
    return false;
  }
  return true;
}

function audit(db, user, entityType, entityId, action, before, after) {
  db.audit_logs.push({
    id: id("audit"),
    entityType,
    entityId,
    action,
    actorId: user?.id || "system",
    actorName: user?.name || "System",
    createdAt: now(),
    before,
    after
  });
}

function addTimeline(db, orderId, orderType, user, oldStatus, newStatus, note) {
  db.order_timeline.push({
    id: id("tl"),
    orderId,
    orderType,
    actorId: user?.id || "system",
    actorName: user?.name || "System",
    createdAt: now(),
    oldStatus,
    newStatus,
    note: note || ""
  });
}

function salesItems(db, orderId) {
  return db.sales_order_items.filter((item) => item.salesOrderId === orderId);
}

function poItems(db, orderId) {
  return db.purchase_order_items.filter((item) => item.purchaseOrderId === orderId);
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function profitForSalesOrder(db, salesOrder) {
  const purchaseOrders = db.purchase_orders.filter((po) => po.salesOrderId === salesOrder.id);
  const purchaseCostCny = purchaseOrders.reduce((total, po) => total + sum(poItems(db, po.id), "purchaseTotal"), 0);
  const purchaseCost = CNY_PER_USD ? purchaseCostCny / CNY_PER_USD : purchaseCostCny;
  const salesTotal = sum(salesItems(db, salesOrder.id), "salesTotal");
  const freight = Number(salesOrder.freight || 0);
  const otherCost = Number(salesOrder.otherFees || 0);
  const profit = salesTotal - purchaseCost - freight - otherCost;
  return {
    salesTotal,
    purchaseCostCny,
    purchaseCost,
    exchangeRateCnyPerUsd: CNY_PER_USD,
    freight,
    otherCost,
    estimatedProfit: profit,
    actualProfit: profit,
    profitRate: salesTotal ? Number(((profit / salesTotal) * 100).toFixed(2)) : 0
  };
}

function visibleSalesOrder(db, order, user) {
  const customer = db.customers.find((c) => c.id === order.customerId);
  const base = {
    ...order,
    statusZh: STATUS_ZH[order.status] || order.status,
    customerName: customer?.name || "",
    customerCompany: customer?.company || "",
    items: salesItems(db, order.id),
    purchaseOrders: db.purchase_orders.filter((po) => po.salesOrderId === order.id).map((po) => visiblePurchaseOrder(db, po, user)),
    timeline: db.order_timeline.filter((tl) => tl.orderId === order.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    files: db.order_files.filter((file) => file.salesOrderId === order.id && fileBelongsToAccessibleOrder(db, file, user)).map(enrichOrderFile)
  };
  if (canViewFinance(user)) base.profit = profitForSalesOrder(db, order);
  if (user?.role === ROLE.SALES && order.salesId !== user.id) base.restricted = true;
  return base;
}

function visiblePurchaseOrder(db, po, user) {
  const factory = db.factories.find((f) => f.id === po.factoryId);
  const salesOrder = db.sales_orders.find((so) => so.id === po.salesOrderId);
  const base = {
    ...po,
    factoryName: factory?.name || "",
    salesOrderNumber: salesOrder?.orderNo || "",
    statusZh: STATUS_ZH[po.productionStatus] || po.productionStatus,
    items: poItems(db, po.id),
    purchaseTotalCny: sum(poItems(db, po.id), "purchaseTotal"),
    qcReports: db.qc_reports.filter((qc) => qc.purchaseOrderId === po.id),
    files: db.order_files.filter((file) => file.purchaseOrderId === po.id && fileBelongsToAccessibleOrder(db, file, user)).map(enrichOrderFile),
    timeline: db.order_timeline.filter((tl) => tl.orderId === po.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
  if (isFactory(user)) {
    delete base.salesOrderId;
    delete base.salesOrderNumber;
  }
  if (user?.role === ROLE.SALES) {
    base.items = base.items.map(({ purchaseUnitPrice, purchaseTotal, ...item }) => item);
  }
  return base;
}

function fileBelongsToAccessibleOrder(db, file, user) {
  if (!file) return false;
  if (!isFactory(user)) return true;
  if (!file.purchaseOrderId) return false;
  const po = db.purchase_orders.find((order) => order.id === file.purchaseOrderId);
  return Boolean(po && po.factoryId === user.factoryId);
}

function enrichOrderFile(file) {
  const { contentBase64, path: storedPath, ...safeFile } = file;
  const ext = path.extname(file.fileName || "").toLowerCase();
  const imageExts = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
  return {
    ...safeFile,
    isImage: imageExts.has(ext) || String(file.contentType || "").startsWith("image/"),
    downloadUrl: `/api/files/${file.id}/download`
  };
}

function isDeleted(record) {
  return Boolean(record?.deletedAt);
}

function markPurchaseOrderDeleted(db, purchaseOrderId, user, note = "管理员归档采购单") {
  const po = db.purchase_orders.find((item) => item.id === purchaseOrderId);
  if (!po || isDeleted(po)) return po;
  const oldStatus = po.productionStatus;
  po.deletedAt = now();
  po.deletedBy = user.id;
  po.deletedByName = user.name;
  po.deletedReason = note;
  po.productionStatus = "Cancelled";
  po.updatedAt = now();
  addTimeline(db, po.id, "purchase_order", user, oldStatus, po.productionStatus, `${note}，系统保留采购单、明细、文件、QC、付款和时间线记录`);
  return po;
}

function markSalesOrderDeleted(db, salesOrderId, user) {
  const order = db.sales_orders.find((item) => item.id === salesOrderId);
  if (!order || isDeleted(order)) return order;
  const relatedPurchaseOrders = db.purchase_orders.filter((po) => po.salesOrderId === salesOrderId);
  for (const po of relatedPurchaseOrders) markPurchaseOrderDeleted(db, po.id, user, "客户订单删除后关联归档采购单");
  const oldStatus = order.status;
  order.deletedAt = now();
  order.deletedBy = user.id;
  order.deletedByName = user.name;
  order.deletedReason = "管理员删除客户订单";
  order.status = "Cancelled";
  order.updatedAt = now();
  addTimeline(db, order.id, "sales_order", user, oldStatus, order.status, "管理员删除客户订单，系统保留订单、明细、文件、采购单、QC、付款和时间线记录");
  return order;
}

function listQuery(url) {
  const q = url.searchParams.get("q")?.trim().toLowerCase() || "";
  const status = url.searchParams.get("status") || "";
  const sort = url.searchParams.get("sort") || "createdAt";
  const dir = url.searchParams.get("dir") === "asc" ? 1 : -1;
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(50, Math.max(5, Number(url.searchParams.get("pageSize") || 10)));
  return { q, status, sort, dir, page, pageSize };
}

function paginate(items, query) {
  const sorted = [...items].sort((a, b) => String(a[query.sort] || "").localeCompare(String(b[query.sort] || "")) * query.dir);
  const start = (query.page - 1) * query.pageSize;
  return {
    items: sorted.slice(start, start + query.pageSize),
    total: sorted.length,
    page: query.page,
    pageSize: query.pageSize,
    pages: Math.max(1, Math.ceil(sorted.length / query.pageSize))
  };
}

function filterGeneric(items, query, keys, statusKey = "status") {
  return items.filter((item) => {
    const matchesText = !query.q || keys.some((key) => String(item[key] || "").toLowerCase().includes(query.q));
    const matchesStatus = !query.status || item[statusKey] === query.status;
    return matchesText && matchesStatus;
  });
}

function createReminderRecords(db) {
  const today = new Date();
  const reminders = [];
  for (const po of db.purchase_orders.filter((item) => !isDeleted(item))) {
    const ageDays = (today - new Date(po.orderDate)) / 86400000;
    if (po.factoryConfirmStatus !== "Confirmed" && ageDays > 2) reminders.push(rem("工厂超过2天未确认订单", "high", po.salesOrderId, po.id));
    if (po.qcStatus !== "Passed" && ["Production Inspection", "Packing Inspection", "Ready to Ship"].includes(po.productionStatus)) reminders.push(rem("质检未完成", "medium", po.salesOrderId, po.id));
    if (po.factoryPaymentStatus !== "Paid" && ["Ready to Ship", "Shipped"].includes(po.productionStatus)) reminders.push(rem("工厂尾款未付", "medium", po.salesOrderId, po.id));
  }
  for (const so of db.sales_orders.filter((item) => !isDeleted(item))) {
    const daysLeft = (new Date(so.expectedDeliveryDate) - today) / 86400000;
    const files = db.order_files.filter((file) => file.salesOrderId === so.id);
    if (!files.some((file) => file.fileType === "Logo File")) reminders.push(rem("标志文件未上传", "medium", so.id));
    if (!["Sample / Pre-production Confirmed", "Mass Production", "Production Inspection", "Packing Inspection", "Ready to Ship", "Shipped", "Delivered", "Closed"].includes(so.status)) reminders.push(rem("产前样未确认", "low", so.id));
    if (daysLeft < 5 && daysLeft >= 0 && !["Shipped", "Delivered", "Closed"].includes(so.status)) reminders.push(rem("订单距离预计交期少于5天", "high", so.id));
    if (daysLeft < 0 && !["Shipped", "Delivered", "Closed"].includes(so.status)) reminders.push(rem("订单已经超过预计交期", "critical", so.id));
    if (so.paymentStatus !== "Paid" && ["Balance Payment Pending", "Ready to Ship", "Shipped"].includes(so.status)) reminders.push(rem("尾款未收", "high", so.id));
    if (so.status === "Shipped" && !files.some((file) => ["Bill of Lading", "Logistics File"].includes(file.fileType))) reminders.push(rem("已发货但未上传物流文件", "medium", so.id));
  }
  return reminders;
}

function rem(title, severity, salesOrderId, purchaseOrderId = "") {
  return { id: id("rem"), title, severity, salesOrderId, purchaseOrderId, createdAt: now(), resolved: false };
}

function csv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.join(","), ...rows.map((row) => headers.map((header) => esc(row[header])).join(","))].join("\n");
}

function downloadFileName(...parts) {
  return parts
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9._-]/g, "_");
}

const PDFKIT_COLORS = {
  text: "#111827",
  muted: "#6B7280",
  border: "#D1D5DB",
  red: "#C9181E",
  dark: "#111827",
  softRed: "#FDE2E2",
  summary: "#FEF2F2"
};

const PDF_MARGIN = 42;
const pt = (mmValue) => mmValue * 2.8346456693;

function pdfMoney(value, currency = "$") {
  const numeric = Number(value || 0);
  return `${currency}${numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pdfImageBuffer(source) {
  if (!source || typeof source !== "string") return null;
  if (source.startsWith("data:image/")) {
    const encoded = source.split(",", 2)[1];
    return encoded ? Buffer.from(encoded, "base64") : null;
  }
  if (source.startsWith("/") && existsSync(source)) return readFileSync(source);
  return null;
}

function pdfCellText(value, currency, isMoney) {
  if (value && typeof value === "object") return "";
  if (isMoney && (value === "" || value === null || value === undefined)) return "";
  return isMoney ? pdfMoney(value, currency) : String(value ?? "");
}

function drawPdfFooter(doc) {
  const y = doc.page.height - PDF_MARGIN - 20;
  doc.fontSize(8).fillColor(PDFKIT_COLORS.muted);
  doc.text("Wder Fitness Equipment Manufacturer", PDF_MARGIN, y, { lineBreak: false });
  doc.text(`Page ${doc.bufferedPageRange().count}`, doc.page.width - PDF_MARGIN - 70, y, { width: 70, align: "right", lineBreak: false });
}

function ensurePdfPageSpace(doc, height) {
  if (!doc.page) doc.addPage();
  if (doc.y + height <= doc.page.height - PDF_MARGIN - 24) return;
  doc.addPage();
}

function drawBoxedColumns(doc, leftTitle, leftRows, rightTitle, rightRows) {
  const x = PDF_MARGIN;
  const y = doc.y;
  const width = doc.page.width - PDF_MARGIN * 2;
  const colWidth = width / 2;
  const compact = Boolean(doc._pdfCompact);
  const titleSize = compact ? 10 : 11;
  const bodySize = compact ? 8 : 9;
  const minHeight = compact ? 68 : 84;
  const titleTop = compact ? 8 : 10;
  const bodyTop = compact ? 24 : 28;
  const leftText = [leftTitle, ...leftRows.map(([label, value]) => `${label}: ${value}`)].join("\n");
  const rightText = [rightTitle, ...rightRows.map(([label, value]) => `${label}: ${value}`)].join("\n");
  const height = Math.max(
    doc.heightOfString(leftText, { width: colWidth - 18 }) + 12,
    doc.heightOfString(rightText, { width: colWidth - 18 }) + 12,
    minHeight
  );
  ensurePdfPageSpace(doc, height);
  doc.rect(x, y, width, height).stroke(PDFKIT_COLORS.border);
  doc.moveTo(x + colWidth, y).lineTo(x + colWidth, y + height).stroke(PDFKIT_COLORS.border);
  doc.fontSize(titleSize).fillColor(PDFKIT_COLORS.text).text(leftTitle, x + 9, y + titleTop, { width: colWidth - 18 });
  doc.fontSize(bodySize).text(leftRows.map(([label, value]) => `${label}: ${value}`).join("\n"), x + 9, y + bodyTop, { width: colWidth - 18 });
  doc.fontSize(titleSize).text(rightTitle, x + colWidth + 9, y + titleTop, { width: colWidth - 18 });
  doc.fontSize(bodySize).text(rightRows.map(([label, value]) => `${label}: ${value}`).join("\n"), x + colWidth + 9, y + bodyTop, { width: colWidth - 18 });
  doc.y = y + height + (compact ? 8 : 10);
}

function drawKeyValueGrid(doc, rows, currency) {
  if (!rows?.length) return;
  const x = PDF_MARGIN;
  const width = doc.page.width - PDF_MARGIN * 2;
  const colCount = 4;
  const colWidth = width / colCount;
  const compact = Boolean(doc._pdfCompact);
  const rowHeight = compact ? 36 : 44;
  for (let i = 0; i < rows.length; i += colCount) {
    ensurePdfPageSpace(doc, rowHeight);
    const y = doc.y;
    const slice = rows.slice(i, i + colCount);
    slice.forEach(([label, value], index) => {
      const cellX = x + index * colWidth;
      doc.rect(cellX, y, colWidth, rowHeight).stroke(PDFKIT_COLORS.border);
      doc.fontSize(compact ? 7 : 7.5).fillColor(PDFKIT_COLORS.muted).text(label, cellX + 6, y + 6, { width: colWidth - 12 });
      doc.fontSize(compact ? 8.5 : 9).fillColor(PDFKIT_COLORS.text).text(typeof value === "number" ? pdfMoney(value, currency) : String(value ?? ""), cellX + 6, y + (compact ? 21 : 23), { width: colWidth - 12 });
    });
    doc.y = y + rowHeight;
  }
  doc.moveDown(compact ? 0.55 : 0.8);
}

function drawSummary(doc, items = []) {
  if (!items.length) return;
  const x = PDF_MARGIN;
  const y = doc.y;
  const width = doc.page.width - PDF_MARGIN * 2;
  const colWidth = width / items.length;
  const compact = Boolean(doc._pdfCompact);
  const rowHeight = compact ? 28 : 32;
  ensurePdfPageSpace(doc, rowHeight * 2 + 10);
  items.forEach((item, index) => {
    const cellX = x + index * colWidth;
    doc.rect(cellX, y, colWidth, rowHeight).fillAndStroke(PDFKIT_COLORS.dark, PDFKIT_COLORS.border);
    doc.fillColor("#FFFFFF").fontSize(compact ? 7.2 : 8).text(item.label || "", cellX + 5, y + (compact ? 9 : 11), { width: colWidth - 10, align: "center" });
    doc.rect(cellX, y + rowHeight, colWidth, rowHeight).fillAndStroke(PDFKIT_COLORS.summary, PDFKIT_COLORS.border);
    doc.fillColor(PDFKIT_COLORS.text).fontSize(compact ? 8.5 : 9).text(item.value || "", cellX + 5, y + rowHeight + (compact ? 9 : 10), { width: colWidth - 10, align: "center" });
  });
  doc.y = y + rowHeight * 2 + (compact ? 10 : 14);
}

function drawPdfTable(doc, section, currency) {
  const x = PDF_MARGIN;
  const widths = section.widths.map(pt);
  const tableWidth = widths.reduce((total, width) => total + width, 0);
  const availableWidth = doc.page.width - PDF_MARGIN * 2;
  const scale = tableWidth > 0 ? availableWidth / tableWidth : 1;
  const scaled = widths.map((width) => width * scale);
  const compact = Boolean(doc._pdfCompact);
  const headerHeight = compact ? 28 : 30;
  const tableDrawWidth = scaled.reduce((a, b) => a + b, 0);
  const drawHeader = () => {
    const headerY = doc.y;
    doc.rect(x, headerY, tableDrawWidth, headerHeight).fill(PDFKIT_COLORS.red);
    let headerX = x;
    section.columns.forEach((label, index) => {
      doc.fillColor("#FFFFFF").fontSize(compact ? 6.5 : 6.8).text(label, headerX + 4, headerY + (compact ? 6 : 7), { width: scaled[index] - 8, align: "center" });
      headerX += scaled[index];
    });
    doc.y = headerY + headerHeight;
  };
  ensurePdfPageSpace(doc, headerHeight + 24);
  drawHeader();
  for (const row of section.rows || []) {
    const values = row._keys.map((key, index) => ({ key, value: row[key], money: section.moneyCols?.includes(index) }));
    const textHeight = Math.max(...values.map(({ value, money }, index) => doc.heightOfString(pdfCellText(value, section.currencySymbol || currency, money), { width: scaled[index] - 8 })), 20);
    const hasImage = values.some(({ value }) => value?.type === "image" && value.source);
    const rowHeight = Math.max(row._summary ? 26 : compact ? 22 : 24, hasImage ? 40 : textHeight + (compact ? 10 : 12));
    const pageCountBefore = doc.bufferedPageRange().count;
    ensurePdfPageSpace(doc, rowHeight + 8);
    if (doc.bufferedPageRange().count > pageCountBefore) drawHeader();
    const y = doc.y;
    let currentX = x;
    if (row._summary) doc.rect(x, y, tableDrawWidth, rowHeight).fill(PDFKIT_COLORS.softRed);
    values.forEach(({ key, value, money }, index) => {
      const cellWidth = scaled[index];
      doc.rect(currentX, y, cellWidth, rowHeight).stroke(PDFKIT_COLORS.border);
      if (value?.type === "image") {
        const image = pdfImageBuffer(value.source);
        if (image) {
          try {
            doc.image(image, currentX + 5, y + 6, { fit: [cellWidth - 10, rowHeight - 12], align: "center", valign: "center" });
          } catch {
            doc.fillColor(PDFKIT_COLORS.muted).fontSize(8).text("-", currentX, y + 14, { width: cellWidth, align: "center" });
          }
        } else {
          doc.fillColor(PDFKIT_COLORS.muted).fontSize(8).text("-", currentX, y + 14, { width: cellWidth, align: "center" });
        }
      } else {
        const align = money || key === "quantity" || key === "no" ? "center" : "left";
        doc.fillColor(PDFKIT_COLORS.text).fontSize(compact ? 7.2 : 7.5).text(pdfCellText(value, section.currencySymbol || currency, money), currentX + 4, y + (compact ? 6 : 7), { width: cellWidth - 8, align });
      }
      currentX += cellWidth;
    });
    doc.y = y + rowHeight;
  }
  doc.moveDown(1);
}

async function renderStructuredPdfWithJs(document, options = {}) {
  try {
    const doc = new PDFDocument({ size: "LETTER", layout: document.layout || "portrait", margin: PDF_MARGIN, bufferPages: true, autoFirstPage: true });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    const done = new Promise((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });
    doc.registerFont("main", existsSync(PDF_FONT_PATH) ? PDF_FONT_PATH : "Helvetica");
    doc.font("main");
    doc._pdfCompact = Boolean(document.compact);
    const titleX = document.layout === "landscape" ? 360 : 270;
    const titleWidth = doc.page.width - titleX - PDF_MARGIN;
    const compact = Boolean(document.compact);
    if (options.logoPath && existsSync(options.logoPath)) doc.image(options.logoPath, 42, compact ? 34 : 40, { fit: compact ? [135, 58] : [155, 70] });
    doc.fillColor(PDFKIT_COLORS.text).fontSize(compact ? 22 : 24).text(document.title || "ORDER DOCUMENT", titleX, compact ? 46 : 54, { width: titleWidth, align: "center" });
    doc.fontSize(compact ? 8.5 : 9).fillColor(PDFKIT_COLORS.text).text(document.subtitle || "", titleX, compact ? 86 : 98, { width: titleWidth, align: "left" });
    doc.x = PDF_MARGIN;
    doc.y = compact ? 128 : 145;
    if (document.info) drawBoxedColumns(doc, document.info.leftTitle, document.info.leftRows || [], document.info.rightTitle, document.info.rightRows || []);
    drawKeyValueGrid(doc, document.terms || [], document.currencySymbol || "$");
    drawSummary(doc, document.summary || []);
    for (const section of document.sections || []) {
      ensurePdfPageSpace(doc, section.kind === "kv" ? 104 : 52);
      doc.fontSize(compact ? 12 : 13).fillColor(PDFKIT_COLORS.text).text(section.title || "", PDF_MARGIN, doc.y, { width: doc.page.width - PDF_MARGIN * 2 });
      doc.moveDown(compact ? 0.25 : 0.4);
      if (section.kind === "table") drawPdfTable(doc, section, document.currencySymbol || "$");
      if (section.kind === "kv") drawKeyValueGrid(doc, section.rows || [], section.currencySymbol || document.currencySymbol || "$");
      if (!section.kind || section.kind === "lines") {
        for (const line of section.lines || []) doc.fontSize(9).fillColor(PDFKIT_COLORS.text).text(line);
      }
    }
    if (document.notes?.length) {
      ensurePdfPageSpace(doc, 48);
      doc.x = PDF_MARGIN;
      doc.fontSize(13).fillColor(PDFKIT_COLORS.text).text("Notes / 备注", PDF_MARGIN, doc.y, { width: doc.page.width - PDF_MARGIN * 2 });
      doc.fontSize(8).fillColor(PDFKIT_COLORS.muted).text(document.notes.join("\n"), PDF_MARGIN, doc.y, { width: doc.page.width - PDF_MARGIN * 2 });
    }
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(i);
      doc.font("main").fontSize(8).fillColor(PDFKIT_COLORS.muted);
      const footerY = doc.page.height - PDF_MARGIN - 20;
      doc.text("Wder Fitness Equipment Manufacturer", PDF_MARGIN, footerY, { lineBreak: false });
      doc.text(`Page ${i + 1}`, doc.page.width - PDF_MARGIN - 70, footerY, { width: 70, align: "right", lineBreak: false });
    }
    doc.end();
    return await done;
  } catch (error) {
    console.error("PDFKit renderer failed:", error.stack || error.message);
    return null;
  }
}

function minimalPdf(title, lines, options = {}) {
  const rendered = renderPdfWithPython(title, lines, options);
  if (rendered) return rendered;
  const toHex = (value) => Buffer.from(String(value), "utf16le").swap16().toString("hex").toUpperCase();
  const textLines = [`BT /F1 18 Tf 50 780 Td <${toHex(title)}> Tj`, "/F1 10 Tf 0 -28 Td"];
  for (const line of lines.slice(0, 45)) textLines.push(`<${toHex(line)}> Tj 0 -16 Td`);
  textLines.push("ET");
  const stream = textLines.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
    "4 0 obj << /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [6 0 R] >> endobj",
    `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
    "6 0 obj << /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> >> endobj"
  ];
  let out = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(out));
    out += `${object}\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) out += `${String(offset).padStart(10, "0")} 00000 n \n`;
  out += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}

function renderPdfWithPython(title, lines, options = {}) {
  try {
    const result = spawnSync(PYTHON_BIN, [PDF_SCRIPT], {
      input: JSON.stringify({ title, lines, logoPath: options.logoPath || "", document: options.document || null }),
      maxBuffer: 10 * 1024 * 1024
    });
    if (result.status === 0 && result.stdout?.length) return result.stdout;
    console.error("PDF renderer failed:", result.stderr?.toString() || result.error?.message || "unknown error");
  } catch (error) {
    console.error("PDF renderer failed:", error.message);
  }
  return null;
}

async function structuredPdf(title, document, options = {}) {
  return await renderStructuredPdfWithJs(document, options) || renderPdfWithPython(title, [], { ...options, document }) || minimalPdf(title, reportLines(options.db, document.type, document.id, options.user), options);
}

async function extractPdfText(contentBase64) {
  return extractPdfTextFromBuffer(Buffer.from(contentBase64, "base64"));
}

async function extractPdfTextFromBuffer(buffer) {
  const pdfParse = require("pdf-parse/lib/pdf-parse.js");
  const result = await pdfParse(buffer);
  return { pages: result.numpages || result.numrender || 0, text: result.text || "" };
}

async function readBlobBuffer(urlOrPathname) {
  const stored = await blobGet(urlOrPathname, { access: "private", useCache: false });
  if (!stored?.stream) {
    const error = new Error("上传文件未找到，请重新上传后再导入。");
    error.statusCode = 404;
    throw error;
  }
  return Buffer.from(await new Response(stored.stream).arrayBuffer());
}

const PRODUCT_ZH = {
  "Chrome Rack (20 pair)": "电镀哑铃架（20副）",
  "3 Tier Kettlebell Rack": "三层壶铃架",
  "Horizontal Curl Bar Rack Chrome": "电镀卧式弯杆架",
  "Mens Olympic 1500lb 4 Bearing": "男士奥杆1500磅四轴承",
  "Rubber Bumper Plate": "橡胶杠铃片",
  "Cast Iron Weight Plate": "铸铁杠铃片",
  "Rubber Hex Dumbbell": "六角橡胶哑铃",
  "Standard 2 Tier Dumbbell Rack (10 pair)": "标准双层哑铃架（10副）",
  "Chrome Dumbbell": "电镀哑铃",
  "Cast Iron Kettlebell": "铸铁壶铃",
  "Fixed Barbell Chrome EZ": "电镀固定EZ弯杆"
};

const PRODUCT_NAME_BY_MODEL = {
  "IGB-20L": ["保温购物袋", "Insulated Grocery Bag"],
  "FCC-01": ["折叠露营椅", "Folding Camping Chair"],
  "SFC-6": ["硅胶食品盒套装", "Silicone Food Container Set"],
  "CDB-12": ["棉布抽绳袋", "Cotton Drawstring Bag"],
  "PPM-150": ["便携野餐垫", "Portable Picnic Mat"],
  "DR-006": ["电镀哑铃架（20副）", "Chrome Rack (20 pair)"],
  "DR-008": ["标准双层哑铃架（10副）", "Standard 2 Tier Dumbbell Rack (10 pair)"],
  "KR-02": ["三层壶铃架", "3 Tier Kettlebell Rack"],
  "CR-001": ["电镀卧式弯杆架", "Horizontal Curl Bar Rack Chrome"],
  "BB-005": ["男士奥杆1500磅四轴承", "Mens Olympic 1500lb 4 Bearing"],
  "PL-002": ["橡胶杠铃片", "Rubber Bumper Plate"],
  "PL-001": ["铸铁杠铃片", "Cast Iron Weight Plate"],
  "DB-006": ["六角橡胶哑铃", "Rubber Hex Dumbbell"],
  "DB-001": ["电镀哑铃", "Chrome Dumbbell"],
  "KB-037": ["铸铁壶铃", "Cast Iron Kettlebell"],
  "CB-003": ["电镀固定EZ弯杆", "Fixed Barbell Chrome EZ"],
  "DB-008": ["圆头聚氨酯哑铃", "Round Urethane Dumbbell (5-50 lb)"],
  "DB-004": ["电镀金色哑铃", "Chrome Golden Dumbbell (5-150 lb)"]
};

function bilingualProductName(name, model = "") {
  const byModel = PRODUCT_NAME_BY_MODEL[String(model || "").trim()];
  if (byModel) return `${byModel[0]} / ${byModel[1]}`;
  const clean = String(name || "").trim();
  if (!clean) return "";
  if (clean.includes(" / ")) return clean;
  return `${PRODUCT_ZH[clean] || clean} / ${clean}`;
}

function moneyNumber(value) {
  return Number(String(value || "0").replace(/[$,]/g, ""));
}

function formatWeightValue(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return Number.isInteger(numeric) ? String(numeric) : String(Number(numeric.toFixed(3)));
}

function calculateFreightWeight(raw = {}) {
  const quantity = Number(raw.quantity ?? raw.pieces ?? 0);
  const specText = String(raw.specification || raw.spec || "").replace(/；/g, ";");
  const explicit = specText.match(/(?:重量|Freight Weight|Weight)\s*[:：]?\s*([\d,.]+)\s*(lb|lbs|kg)\b/i);
  if (explicit) return `${formatWeightValue(Number(explicit[1].replace(/,/g, "")))} ${explicit[2].toLowerCase().replace("lbs", "lb")}`;
  const unitWeight = specText.match(/(^|[^\d])([\d,.]+)\s*(lb|lbs|kg)\b/i);
  if (unitWeight && quantity > 0) {
    return `${formatWeightValue(Number(unitWeight[2].replace(/,/g, "")) * quantity)} ${unitWeight[3].toLowerCase().replace("lbs", "lb")}`;
  }
  const fallback = String(raw.freightWeight || raw.weight || "").trim();
  return fallback;
}

function freightWeightAmount(value) {
  const match = String(value || "").match(/([\d,.]+)/);
  return match ? Number(match[1].replace(/,/g, "")) : 0;
}

function purchaseLineTotal(freightWeight, unitPrice) {
  return Number((freightWeightAmount(freightWeight) * Number(unitPrice || 0)).toFixed(2));
}

function normalizePdfDate(value) {
  const match = String(value || "").match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (!match) return today();
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function normalizeImportedOrderNo(value = "") {
  const textValue = String(value || "").trim();
  const prefixed = textValue.match(/(?:ORD|SO|PO|Q)-(\d{8})-(\d{1,3})/i);
  if (prefixed) return `SO-${prefixed[1]}-${prefixed[2].padStart(3, "0")}`;
  const fullDate = textValue.match(/(\d{8})[-_](\d{1,3})/);
  if (fullDate) return `SO-${fullDate[1]}-${fullDate[2].padStart(3, "0")}`;
  const shortDate = textValue.match(/(\d{2})(\d{2})(\d{2})[-_](\d{1,3})/);
  if (shortDate) return `SO-20${shortDate[1]}${shortDate[2]}${shortDate[3]}-${shortDate[4].padStart(3, "0")}`;
  return "";
}

function extractOrderNoFromFileName(fileName = "") {
  return normalizeImportedOrderNo(String(fileName || "").replace(/\.[^.]+$/, ""));
}

function addDays(dateValue, days) {
  const d = new Date(dateValue);
  d.setDate(d.getDate() + Number(days || 30));
  return d.toISOString().slice(0, 10);
}

function parseImportedSalesOrderPdf(textContent) {
  const textValue = String(textContent || "").replace(/\r/g, "");
  const lines = textValue.split("\n").map((line) => line.trim()).filter(Boolean);
  const rawQuoteRef = textValue.match(/(?:Quote|Order) Reference:\s*((?:ORD|SO|PO|Q)-\d{8}-\d{1,3})/i)?.[1] || "";
  const quoteRef = normalizeImportedOrderNo(rawQuoteRef);
  const quoteDate = normalizePdfDate(textValue.match(/Quote Date:\s*([0-9/-]+)/i)?.[1]);
  const deliveryTerm = (textValue.match(/Trade term:\s*([A-Z]+)/i)?.[1] || "FOB").toUpperCase();
  const currency = textValue.match(/Currency:\s*([A-Z]+)/i)?.[1] || "USD";
  const leadTimeDays = Number(textValue.match(/Lead time:\s*(\d+)/i)?.[1] || 30);
  const productAmount = moneyNumber(textValue.match(/Product amount\s+DDP freight\s+Grand total\s+[\d,]+\s+[\d,]+\s+lb\s+(\$[\d,.]+)/i)?.[1]);
  const freight = moneyNumber(textValue.match(/Product amount\s+DDP freight\s+Grand total\s+[\d,]+\s+[\d,]+\s+lb\s+\$[\d,.]+\s+(\$[\d,.]+)/i)?.[1]);
  const grandTotal = moneyNumber(textValue.match(/Total order amount:\s*(\$[\d,.]+)/i)?.[1]);

  const supplierCustomerStart = lines.findIndex((line) => line === "Supplier Customer");
  const productsTermsStart = lines.findIndex((line) => line === "Products Terms");
  const customerBlock = supplierCustomerStart >= 0 && productsTermsStart > supplierCustomerStart
    ? lines.slice(supplierCustomerStart + 1, productsTermsStart)
    : [];
  const customerValues = customerBlock.map((line) => line
    .replace(/^Wder Fitness Equipment Manufacturer\s*/i, "")
    .replace(/^Abner Zhu\s*/i, "")
    .replace(/^\+?\d[\d\s-]+\s*/, "")
    .replace(/^wderfitness@gmail\.com\s*/i, "")
    .trim()
  ).filter(Boolean);
  const customerName = customerValues[0] || "Imported Customer";
  const country = customerValues.find((line) => /^United States$/i.test(line)) || customerValues.at(-1) || "";
  const address = customerValues.slice(1).filter((line) => line !== country).join(", ");

  const itemStart = lines.findIndex((line) => line === "Item Details");
  const notesStart = lines.findIndex((line, index) => index > itemStart && line === "Notes");
  const rawItemLines = itemStart >= 0 ? lines.slice(itemStart + 1, notesStart > itemStart ? notesStart : undefined) : [];
  const itemLines = [];
  let itemBuffer = "";
  for (const line of rawItemLines) {
    if (line.startsWith("ProductSKU") || line.startsWith("Product SKU") || line.startsWith("Total ")) continue;
    itemBuffer = `${itemBuffer}${itemBuffer ? " " : ""}${line}`.trim();
    if (/\$[\d,.]+\s*$/.test(itemBuffer)) {
      itemLines.push(itemBuffer);
      itemBuffer = "";
    }
  }
  const items = [];
  const itemPattern = /^(.+?)\s+([A-Z]{2,}-\d{3})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(pc|pcs|pair|pairs|set|sets|kg|lb)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+lb\s+\$([\d,.]+)\/([A-Z]+)\s+\$([\d,.]+)$/i;
  const compactItemPattern = /^(.+?)\s+([A-Z]{2,}-\d{3})\s+(\d+(?:\.\d+)?)\s+(pc|pcs|pair|pairs|set|sets|kg|lb)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+lb\s+\$([\d,.]+)\/([A-Z]+)\s+\$([\d,.]+)$/i;
  for (const line of itemLines) {
    if (line.startsWith("Product SKU") || line.startsWith("Total ")) continue;
    const compactLine = line.replace(/\s+/g, " ");
    const match = compactLine.match(itemPattern);
    const compactMatch = match ? null : compactLine.match(compactItemPattern);
    const detectedModel = compactLine.match(/[A-Z]{2,}-\d{3}/)?.[0] || "";
    const knownModel = Object.keys(PRODUCT_NAME_BY_MODEL).sort((a, b) => b.length - a.length).find((sku) => compactLine.includes(sku)) || detectedModel;
    const fusedMatch = match || compactMatch || !knownModel ? null : compactLine.match(new RegExp(`^(.+?)${knownModel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(.+?)\\$([\\d,.]+)\\/([A-Z]+)\\$([\\d,.]+)$`, "i"));
    let productName;
    let model;
    let spec;
    let orderQty;
    let orderUnit;
    let pieces;
    let weightLb;
    let unitPrice;
    let priceUnit;
    let amount;
    if (match || compactMatch) {
      [, productName, model, spec, orderQty, orderUnit, pieces, weightLb, unitPrice, priceUnit, amount] = match
        || [null, compactMatch[1], compactMatch[2], "-", compactMatch[3], compactMatch[4], compactMatch[5], compactMatch[6], compactMatch[7], compactMatch[8], compactMatch[9]];
    } else if (fusedMatch) {
      [, productName, spec, unitPrice, priceUnit, amount] = fusedMatch;
      model = knownModel;
      const qtyMatch = spec.match(/(\d+(?:\.\d+)?)\s*(pc|pcs|pair|pairs|set|sets|kg|lb)(\d+)\s*lb\s*$/i);
      if (!qtyMatch) continue;
      orderQty = qtyMatch[1];
      orderUnit = qtyMatch[2];
      pieces = qtyMatch[3].slice(0, 1);
      weightLb = qtyMatch[3].slice(1) || "0";
      spec = spec.slice(0, qtyMatch.index).trim() || "-";
      if (!["lb", "kg"].includes(orderUnit.toLowerCase()) && /^\d{2,}$/.test(orderQty)) {
        spec = `${spec === "-" ? "" : `${spec} `}${orderQty.slice(0, -1)}`.trim() || "-";
        orderQty = orderQty.slice(-1);
      }
    } else {
      continue;
    }
    const quantity = Number(String(pieces).replace(/,/g, ""));
    const salesTotal = moneyNumber(amount);
    const cleanSpec = String(spec || "-").trim() || "-";
    const qtyLabel = `${orderQty} ${orderUnit}`;
    const freightWeight = `${formatWeightValue(Number(String(weightLb).replace(/,/g, "")))} lb`;
    items.push({
      productName: bilingualProductName(productName, model),
      model,
      specification: cleanSpec,
      qtyLabel,
      quantity,
      freightWeight: calculateFreightWeight({ specification: cleanSpec, quantity, freightWeight }),
      salesUnitPrice: quantity ? Number((salesTotal / quantity).toFixed(4)) : moneyNumber(unitPrice),
      salesTotal,
      logoRequirement: "按客户确认要求",
      colorRequirement: "按客户确认要求",
      packagingRequirement: "出口包装"
    });
  }

  if (!items.length) throw new Error("PDF 中未识别到产品明细");

  return {
    quoteRef,
    quoteDate,
    deliveryTerm,
    currency,
    leadTimeDays,
    productAmount,
    freight,
    grandTotal,
    customer: {
      name: customerName,
      company: customerName,
      country,
      contact: customerName,
      address,
      source: "Other",
      level: "B",
      remark: `PDF 导入客户：${quoteRef || "无报价号"}`
    },
    order: {
      orderNo: quoteRef,
      orderDate: quoteDate,
      deliveryTerm,
      destinationCountry: country,
      destinationAddress: address,
      freight,
      otherFees: 0,
      depositAmount: 0,
      balanceAmount: grandTotal || productAmount + freight,
      paymentStatus: "Deposit Pending",
      status: "Customer Confirmed",
      expectedDeliveryDate: addDays(quoteDate, leadTimeDays),
      remark: `从客户订单 PDF 导入。报价号：${quoteRef || "-"}；币种：${currency}；产品金额：${productAmount}；运费：${freight}；总金额：${grandTotal || productAmount + freight}`
    },
    items
  };
}

function ensureImportedCustomer(db, parsed) {
  const customer = parsed.customer;
  const existing = db.customers.find((item) =>
    String(item.company || "").toLowerCase() === String(customer.company || "").toLowerCase()
    && String(item.contact || "").toLowerCase() === String(customer.contact || "").toLowerCase()
  );
  if (existing) return existing;
  const created = {
    id: id("customer"),
    ...customer,
    email: "",
    whatsapp: "",
    phone: "",
    createdAt: now(),
    lastFollowUpAt: today(),
    updatedAt: now()
  };
  db.customers.push(created);
  return created;
}

function ensureImportedProduct(db, raw) {
  const existing = db.products.find((product) => product.model === raw.model);
  if (existing) return existing;
  const created = {
    id: id("product"),
    name: raw.productName,
    model: raw.model,
    category: "PDF导入",
    image: "",
    defaultSalesPrice: raw.salesUnitPrice,
    defaultPurchasePrice: 0,
    unit: "piece",
    weight: "",
    packageSize: "",
    remark: "客户订单 PDF 自动导入",
    createdAt: now(),
    updatedAt: now()
  };
  db.products.push(created);
  return created;
}

function buyerRows() {
  return [
    ["采购商", BUYER_INFO.company],
    ["联系人", BUYER_INFO.contact],
    ["联系电话", BUYER_INFO.phone]
  ];
}

function salesProductRows(db, salesOrder) {
  return salesItems(db, salesOrder.id).map((item, index) => ({
    _keys: ["no", "productName", "model", "specification", "quantity", "salesUnitPrice", "salesTotal"],
    no: index + 1,
    productName: item.productName,
    model: item.model,
    specification: item.specification || "-",
    quantity: item.quantity,
    salesUnitPrice: item.salesUnitPrice,
    salesTotal: item.salesTotal
  }));
}

function purchaseProductRows(db, purchaseOrder) {
  const items = poItems(db, purchaseOrder.id);
  const rows = items.map((item) => ({
    _keys: ["productName", "logoImage", "model", "specification", "qtyLabel", "quantity", "freightWeight", "purchaseUnitPrice", "purchaseTotal"],
    productName: item.productName,
    logoImage: { type: "image", source: item.logoImageData || "" },
    model: item.model,
    specification: item.specification || "-",
    qtyLabel: item.qtyLabel || `${item.quantity || 0} pcs`,
    quantity: item.quantity,
    freightWeight: item.freightWeight || "-",
    purchaseUnitPrice: item.purchaseUnitPrice,
    purchaseTotal: item.purchaseTotal
  }));
  rows.push({
    _keys: ["productName", "logoImage", "model", "specification", "qtyLabel", "quantity", "freightWeight", "purchaseUnitPrice", "purchaseTotal"],
    _summary: true,
    productName: "Total",
    logoImage: "",
    model: "",
    specification: "",
    qtyLabel: "",
    quantity: sum(items, "quantity"),
    freightWeight: purchaseTotalFreightWeight(items),
    purchaseUnitPrice: "",
    purchaseTotal: sum(items, "purchaseTotal")
  });
  return rows;
}

function purchaseTotalFreightWeight(items) {
  const parsed = items.map((item) => String(item.freightWeight || "").match(/^([\d,.]+)\s*([a-zA-Z\u4e00-\u9fa5]+)$/)).filter(Boolean);
  if (!parsed.length || parsed.length !== items.length) return "";
  const unit = parsed[0][2];
  if (!parsed.every((match) => match[2] === unit)) return "";
  const total = parsed.reduce((sumValue, match) => sumValue + Number(match[1].replace(/,/g, "")), 0);
  return `${total.toLocaleString("en-US")} ${unit}`;
}

function salesTotalsRows(db, salesOrder) {
  const items = salesItems(db, salesOrder.id);
  const groups = new Map();
  for (const item of items) {
    const key = `${item.productName}|${item.model}`;
    const current = groups.get(key) || { productName: item.productName, model: item.model, quantity: 0, total: 0 };
    current.quantity += Number(item.quantity || 0);
    current.total += Number(item.salesTotal || 0);
    groups.set(key, current);
  }
  return [...groups.values()].map((item, index) => ({
    _keys: ["no", "productName", "model", "quantity", "total"],
    no: index + 1,
    productName: item.productName,
    model: item.model,
    quantity: item.quantity,
    total: item.total
  }));
}

function purchaseTotalsRows(db, purchaseOrder) {
  const items = poItems(db, purchaseOrder.id);
  const groups = new Map();
  for (const item of items) {
    const key = `${item.productName}|${item.model}`;
    const current = groups.get(key) || { productName: item.productName, model: item.model, quantity: 0, total: 0 };
    current.quantity += Number(item.quantity || 0);
    current.total += Number(item.purchaseTotal || 0);
    groups.set(key, current);
  }
  const rows = [...groups.values()].map((item, index) => ({
    _keys: ["no", "productName", "model", "quantity", "total"],
    no: index + 1,
    productName: item.productName,
    model: item.model,
    quantity: item.quantity,
    total: item.total
  }));
  rows.push({
    _keys: ["no", "productName", "model", "quantity", "total"],
    _summary: true,
    no: "",
    productName: "Total Purchase Amount / 采购总金额",
    model: "",
    quantity: sum(items, "quantity"),
    total: sum(items, "purchaseTotal")
  });
  return rows;
}

function pdfDocumentPayload(db, type, idValue, user) {
  if (type === "pi" || type === "order") {
    const so = db.sales_orders.find((o) => o.id === idValue);
    if (!so) return null;
    const customer = db.customers.find((c) => c.id === so.customerId);
    const sales = db.users.find((u) => u.id === so.salesId);
    const profit = profitForSalesOrder(db, so);
    const isPi = type === "pi";
    const sections = [
      {
        title: "Product Totals / 产品汇总",
        kind: "table",
        columns: ["#", "Product / 产品", "SKU", "Qty", "Amount"],
        widths: [9, 75, 22, 20, 42],
        moneyCols: [4],
        rows: salesTotalsRows(db, so)
      },
      {
        title: "Item Details / 产品明细",
        kind: "table",
        columns: ["#", "Product / 产品", "SKU", "Spec / 规格", "Qty", "Unit Price", "Amount"],
        widths: [8, 43, 18, 43, 14, 20, 22],
        moneyCols: [5, 6],
        rows: salesProductRows(db, so)
      },
      {
        title: "Amount Summary / 金额汇总",
        kind: "kv",
        rows: [
          ["Product Amount / 产品金额", profit.salesTotal],
          ["Freight / 运费", so.freight],
          ["Other Fees / 其他费用", so.otherFees],
          ["Grand Total / 总金额", profit.salesTotal + Number(so.freight || 0) + Number(so.otherFees || 0)],
          ["Deposit / 定金", so.depositAmount],
          ["Balance / 尾款", so.balanceAmount]
        ]
      }
    ];
    if (!isPi && canViewFinance(user)) {
      sections.push({
        title: "Profit / 利润核算",
        kind: "kv",
        rows: [
          ["Sales Total / 销售额", profit.salesTotal],
          ["Purchase Cost CNY / 采购成本人民币", `${profit.purchaseCostCny.toFixed(2)} CNY`],
          ["Purchase Cost USD / 采购成本折美元", profit.purchaseCost],
          ["Freight / 运费", profit.freight],
          ["Other Cost / 其他成本", profit.otherCost],
          ["Estimated Profit / 预估利润", profit.estimatedProfit],
          ["Profit Rate / 利润率", `${profit.profitRate}%`]
        ]
      });
    }
    return {
      type,
      id: idValue,
      orderNo: so.orderNo,
      title: isPi ? "PROFORMA INVOICE / 客户形式发票" : `ORDER REPORT / 客户订单 ${so.orderNo}`,
      subtitle: `${so.orderNo} | Date: ${so.orderDate} | Sales: ${sales?.name || ""}`,
      currencySymbol: "$",
      info: {
        leftTitle: "Supplier / 供应商",
        leftRows: buyerRows(),
        rightTitle: "Customer / 客户",
        rightRows: [
          ["客户名称", customer?.name || ""],
          ["公司名称", customer?.company || ""],
          ["联系人", customer?.contact || ""],
          ["国家", customer?.country || ""],
          ["邮箱", customer?.email || ""],
          ["电话", customer?.phone || ""],
          ["地址", customer?.address || ""]
        ]
      },
      terms: [
        ["Trade Term / 贸易条款", so.deliveryTerm],
        ["Currency / 币种", "USD"],
        ["Payment Status / 付款状态", statusText(so.paymentStatus)],
        ["Order Status / 订单状态", statusText(so.status)],
        ["Destination / 目的地", `${so.destinationCountry} ${so.destinationAddress}`],
        ["Expected Delivery / 预计交期", so.expectedDeliveryDate]
      ],
      sections,
      notes: [so.remark || "Please confirm all product details, packing requirements and payment terms before production."]
    };
  }

  if (type === "po") {
    const po = db.purchase_orders.find((o) => o.id === idValue);
    if (!po) return null;
    const factory = db.factories.find((f) => f.id === po.factoryId);
    const relatedSalesOrder = db.sales_orders.find((so) => so.id === po.salesOrderId);
    const rows = poItems(db, po.id);
    const total = sum(rows, "purchaseTotal");
    const totalQty = sum(rows, "quantity");
    return {
      type,
      id: idValue,
      poNo: po.poNo,
      title: "PURCHASE ORDER",
      subtitle: `PO Reference: ${po.poNo}\nPO Date: ${po.orderDate}\nRelated Sales Order: ${relatedSalesOrder?.orderNo || "Direct PO"}`,
      layout: "landscape",
      compact: true,
      currencySymbol: "¥",
      info: {
        leftTitle: "Supplier / 采购商",
        leftRows: buyerRows(),
        rightTitle: "Factory / 工厂",
        rightRows: [
          ["工厂名称", factory?.name || ""],
          ["联系人", factory?.contact || ""],
          ["联系电话", factory?.phone || ""],
          ["微信", factory?.wechat || ""],
          ["邮箱", factory?.email || ""],
          ["地址", factory?.address || ""]
        ]
      },
      terms: [
        ["PO No. / 采购单号", po.poNo],
        ["Related SO / 关联客户订单", relatedSalesOrder?.orderNo || "无"],
        ["Currency / 币种", "CNY"],
        ["Factory Delivery / 工厂交期", po.factoryDeliveryDate],
        ["Payment Status / 付款状态", statusText(po.factoryPaymentStatus)],
        ["Confirm Status / 确认状态", statusText(po.factoryConfirmStatus)],
        ["Production Status / 生产状态", statusText(po.productionStatus)]
      ],
      summary: [
        { label: "Total Items / 产品行数", value: String(rows.length) },
        { label: "Total Qty / 总数量", value: String(totalQty) },
        { label: "Purchase Amount / 采购金额", value: `¥${total.toFixed(2)}` },
        { label: "QC Status / 质检状态", value: statusText(po.qcStatus) },
        { label: "Factory Delivery / 工厂交期", value: po.factoryDeliveryDate || "-" }
      ],
      sections: [
        {
          title: "Item Details / 采购产品明细",
          kind: "table",
          columns: ["Product / 产品", "Logo / 标志", "SKU / 型号", "Spec / 规格", "Qty / 数量", "Pieces / 件数", "Freight Weight / 计费重量", "Unit Price / 单价", "Product Amount / 金额"],
          widths: [46, 22, 18, 24, 20, 16, 28, 24, 30],
          moneyCols: [7, 8],
          rows: purchaseProductRows(db, po)
        }
      ],
      notes: [po.remark || "Factory must confirm delivery date, product details, logo/artwork and packing before mass production."]
    };
  }

  if (type === "qc") {
    const qc = db.qc_reports.find((item) => item.id === idValue);
    if (!qc) return null;
    return {
      type,
      id: idValue,
      reportNo: qc.reportNo,
      poNo: db.purchase_orders.find((po) => po.id === qc.purchaseOrderId)?.poNo || "",
      title: "QC REPORT / 质检报告",
      subtitle: `${qc.reportNo} | Date: ${qc.inspectionDate}`,
      info: {
        leftTitle: "Inspector / 检查人",
        leftRows: [["检查人", qc.inspectorName], ["结果", statusText(qc.result)]],
        rightTitle: "Order / 订单",
        rightRows: [["采购单ID", qc.purchaseOrderId]]
      },
      sections: [
        {
          title: "Inspection Checklist / 质检清单",
          kind: "table",
          columns: ["#", "Check Item / 检查项", "Result", "Remark"],
          widths: [10, 78, 28, 52],
          rows: db.qc_report_items.filter((item) => item.qcReportId === qc.id).map((item, index) => ({
            _keys: ["no", "checkItem", "result", "note"],
            no: index + 1,
            checkItem: item.checkItem,
            result: item.passed ? "OK" : "NG",
            note: item.note || ""
          }))
        }
      ],
      notes: [qc.remark || ""]
    };
  }

  return null;
}

function reportLines(db, type, idValue, user) {
  if (type === "order") {
    const so = db.sales_orders.find((o) => o.id === idValue);
    if (!so) return ["未找到订单"];
    const customer = db.customers.find((c) => c.id === so.customerId);
    const sales = db.users.find((u) => u.id === so.salesId);
    const lines = [
      `客户订单：${so.orderNo}`,
      `客户：${customer?.company || customer?.name || ""}`,
      `联系人：${customer?.contact || ""}`,
      `订单日期：${so.orderDate}`,
      `销售人员：${sales?.name || ""}`,
      `订单状态：${statusText(so.status)}`,
      `付款状态：${statusText(so.paymentStatus)}`,
      `交货方式：${so.deliveryTerm}`,
      `目的地：${so.destinationCountry} ${so.destinationAddress}`,
      `预计交货日期：${so.expectedDeliveryDate}`,
      "",
      "产品明细：",
      ...salesItems(db, so.id).map((item, index) => `${index + 1}. ${item.productName} / ${item.model}，规格：${item.specification || "-"}，数量：${item.quantity}，销售单价：${item.salesUnitPrice}，销售总价：${item.salesTotal}，标志：${item.logoRequirement || "-"}，颜色：${item.colorRequirement || "-"}，包装：${item.packagingRequirement || "-"}`),
      "",
      "工厂采购单：",
      ...db.purchase_orders.filter((po) => po.salesOrderId === so.id).map((po, index) => `${index + 1}. ${po.poNo}，工厂：${db.factories.find((f) => f.id === po.factoryId)?.name || ""}，生产状态：${statusText(po.productionStatus)}，质检：${statusText(po.qcStatus)}，工厂交期：${po.factoryDeliveryDate}`)
    ];
    if (canViewFinance(user)) {
      const profit = profitForSalesOrder(db, so);
      lines.push("", "利润核算：");
      lines.push(`销售总额：${profit.salesTotal}`);
      lines.push(`工厂采购成本：${profit.purchaseCost}`);
      lines.push(`运费：${profit.freight}`);
      lines.push(`其他成本：${profit.otherCost}`);
      lines.push(`预估利润：${profit.estimatedProfit}`);
      lines.push(`利润率：${profit.profitRate}%`);
    }
    if (so.remark) lines.push("", `备注：${so.remark}`);
    return lines;
  }
  if (type === "pi") {
    const so = db.sales_orders.find((o) => o.id === idValue);
    if (!so) return ["Not found"];
    const customer = db.customers.find((c) => c.id === so.customerId);
    return [
      `PI / Proforma Invoice: ${so.orderNo}`,
      `Customer: ${customer?.company || customer?.name || ""}`,
      `Date: ${so.orderDate}`,
      `Delivery: ${so.deliveryTerm} to ${so.destinationCountry}`,
      ...salesItems(db, so.id).map((item) => `${item.productName} ${item.model} x ${item.quantity} @ ${item.salesUnitPrice} = ${item.salesTotal}`),
      `Total: ${profitForSalesOrder(db, so).salesTotal}`,
      `Deposit: ${so.depositAmount}`,
      `Balance: ${so.balanceAmount}`
    ];
  }
  if (type === "po") {
    const po = db.purchase_orders.find((o) => o.id === idValue);
    if (!po) return ["未找到采购单"];
    const factory = db.factories.find((f) => f.id === po.factoryId);
    const relatedSalesOrder = db.sales_orders.find((so) => so.id === po.salesOrderId);
    return [
      `采购单号：${po.poNo}`,
      `关联客户订单：${relatedSalesOrder?.orderNo || "无"}`,
      `下单日期：${po.orderDate}`,
      `工厂交期：${po.factoryDeliveryDate}`,
      "",
      "采购商信息：",
      `采购商：${BUYER_INFO.company}`,
      `联系人：${BUYER_INFO.contact}`,
      `联系电话：${BUYER_INFO.phone}`,
      "",
      "工厂信息：",
      `工厂名称：${factory?.name || ""}`,
      `联系人：${factory?.contact || ""}`,
      `联系电话：${factory?.phone || ""}`,
      `微信：${factory?.wechat || ""}`,
      `邮箱：${factory?.email || ""}`,
      `地址：${factory?.address || ""}`,
      "",
      "采购产品明细：",
      ...poItems(db, po.id).map((item, index) => `${index + 1}. ${item.productName} / ${item.model}，规格：${item.specification || "-"}，数量：${item.quantity}，采购单价：${item.purchaseUnitPrice}，采购总价：${item.purchaseTotal}，标志：${item.logoRequirement || "-"}，颜色：${item.colorRequirement || "-"}，包装：${item.packagingRequirement || "-"}`),
      "",
      `工厂付款状态：${statusText(po.factoryPaymentStatus)}`,
      `工厂确认状态：${statusText(po.factoryConfirmStatus)}`,
      `生产状态：${statusText(po.productionStatus)}`,
      `质检状态：${statusText(po.qcStatus)}`,
      po.remark ? `备注：${po.remark}` : ""
    ];
  }
  const qc = db.qc_reports.find((item) => item.id === idValue);
  if (!qc) return ["Not found"];
  return [
    `QC Report: ${qc.reportNo}`,
    `Result: ${qc.result}`,
    `Inspector: ${qc.inspectorName}`,
    `Date: ${qc.inspectionDate}`,
    ...db.qc_report_items.filter((item) => item.qcReportId === qc.id).map((item) => `${item.checkItem}: ${item.passed ? "OK" : "NG"} - ${item.note || ""}`),
    `Remark: ${qc.remark || ""}`
  ];
}

async function handleApi(req, res, db, user, url) {
  const method = req.method;
  const parts = url.pathname.split("/").filter(Boolean).slice(1);
  const resource = parts[0];
  const resourceId = parts[1];
  const action = parts[2];

  if (resource === "login" && method === "POST") {
    const body = await bodyJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const found = db.users.find((u) => String(u.email || "").toLowerCase() === email && u.password === body.password);
    if (!found) return json(res, 401, { error: "邮箱或密码错误；如果刚注册，请确认注册已提交成功，并等待管理员审核。" });
    if (!isApprovedUser(found)) return json(res, 403, { error: found.approvalStatus === "rejected" ? "账号审核未通过，请联系管理员" : "账号正在等待管理员审核" });
    const token = signSessionToken(found.id);
    return json(res, 200, { user: publicUser(found) }, { "set-cookie": `session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` });
  }

  if (resource === "register" && method === "POST") {
    const body = await bodyJson(req);
    const email = String(body.email || "").trim().toLowerCase();
    const name = String(body.name || "").trim();
    const password = String(body.password || "");
    const allowedRoles = [ROLE.SALES, ROLE.FACTORY];
    const role = allowedRoles.includes(body.role) ? body.role : ROLE.SALES;
    if (!name || !email || !password) return json(res, 400, { error: "请填写用户名、注册邮箱和注册密码" });
    if (password.length < 6) return json(res, 400, { error: "注册密码至少需要 6 位" });
    if (db.users.some((u) => u.email.toLowerCase() === email)) return json(res, 409, { error: "该邮箱已经注册，请等待审核或直接登录" });
    let factoryId = "";
    let businessLicenseFileName = "";
    let businessLicensePath = "";
    if (role === ROLE.FACTORY) {
      if (!body.businessLicenseBase64 || !body.businessLicenseFileName) return json(res, 400, { error: "工厂注册必须上传营业执照照片" });
      await mkdir(FACTORY_LICENSE_DIR, { recursive: true });
      businessLicenseFileName = String(body.businessLicenseFileName).replace(/[^\w.\- \u4e00-\u9fa5]/g, "_");
      businessLicensePath = path.join(FACTORY_LICENSE_DIR, `${Date.now()}_${businessLicenseFileName}`);
      await writeFile(businessLicensePath, Buffer.from(body.businessLicenseBase64, "base64"));
      factoryId = String(body.factoryId || "");
      if (factoryId && !db.factories.some((factory) => factory.id === factoryId)) return json(res, 400, { error: "Factory account must bind a valid factory" });
      if (!factoryId) {
        const factoryName = String(body.factoryName || "").trim();
        const factoryContact = String(body.factoryContact || name).trim();
        const factoryPhone = String(body.factoryPhone || "").trim();
        if (!factoryName || !factoryContact || !factoryPhone) return json(res, 400, { error: "Factory name, contact and phone are required" });
        const factory = {
          id: id("fac"),
          name: factoryName,
          contact: factoryContact,
          phone: factoryPhone,
          wechat: String(body.factoryWechat || "").trim(),
          email,
          address: String(body.factoryAddress || "").trim(),
          mainProducts: String(body.factoryMainProducts || "").trim(),
          paymentTerms: String(body.factoryPaymentTerms || "").trim(),
          leadTimeDays: Number(body.factoryLeadTimeDays || 30),
          qualityScore: 80,
          deliveryScore: 80,
          cooperationScore: 80,
          businessLicenseFileName,
          businessLicensePath,
          remark: "工厂账号注册时创建",
          enabled: false,
          createdAt: now(),
          updatedAt: now()
        };
        db.factories.push(factory);
        factoryId = factory.id;
      }
    }
    const created = {
      id: id("user"),
      name,
      email,
      password,
      role,
      factoryId,
      approvalStatus: "pending",
      approvedBy: "",
      approvedAt: "",
      rejectedReason: "",
      businessLicenseFileName,
      businessLicensePath,
      createdAt: now(),
      updatedAt: now()
    };
    db.users.push(created);
    audit(db, created, "user", created.id, "register", null, publicUser(created));
    await writeDb(db);
    return json(res, 201, { pending: true, message: "注册申请已提交，请等待管理员审核", user: publicUser(created) });
  }

  if (resource === "logout" && method === "POST") {
    return json(res, 200, { ok: true }, { "set-cookie": "session=; Path=/; Max-Age=0" });
  }

  if (resource === "session" && method === "GET") return json(res, 200, { user: user ? publicUser(user) : null, orderStatuses: ORDER_STATUS, statusZh: STATUS_ZH, roles: Object.values(ROLE), factories: db.factories.map((factory) => ({ id: factory.id, name: factory.name })) });
  if (!requireAuth(user, res)) return;

  if (resource === "blob-upload-url" && method === "POST") {
    const body = await bodyJson(req);
    if (!USE_BLOB_DB) return json(res, 501, { error: "当前环境未配置文件直传存储，请使用较小文件或联系管理员配置 Blob。"});
    const rawFileName = String(body.fileName || "").trim();
    const contentType = String(body.contentType || "application/octet-stream").trim();
    if (!rawFileName) return json(res, 400, { error: "缺少文件名" });
    const safeFileName = rawFileName.replace(/[^\w.\- \u4e00-\u9fa5]/g, "_");
    const pathname = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomBytes(8).toString("hex")}-${safeFileName}`;
    const validUntil = Date.now() + 10 * 60 * 1000;
    const token = await issueSignedToken({
      pathname,
      operations: ["put", "get"],
      validUntil,
      allowedContentTypes: ["application/pdf", "application/octet-stream"],
      maximumSizeInBytes: 40 * 1024 * 1024
    });
    const { presignedUrl } = await presignUrl(token, {
      access: "private",
      operation: "put",
      pathname,
      validUntil,
      allowedContentTypes: ["application/pdf", "application/octet-stream"],
      maximumSizeInBytes: 40 * 1024 * 1024,
      allowOverwrite: false
    });
    return json(res, 200, { pathname, presignedUrl, fileName: safeFileName });
  }

  if (resource === "users") {
    if (method === "GET") {
      if (!requireRole(user, res, [ROLE.ADMIN])) return;
      const status = url.searchParams.get("status") || "";
      const users = db.users
        .filter((item) => !status || (item.approvalStatus || "approved") === status)
        .map((item) => ({
          ...publicUser(item),
          approvalStatus: item.approvalStatus || "approved",
          factoryName: db.factories.find((factory) => factory.id === item.factoryId)?.name || ""
        }));
      return json(res, 200, { items: users, total: users.length });
    }
    if (method === "PATCH" && resourceId) {
      if (!requireRole(user, res, [ROLE.ADMIN])) return;
      const target = db.users.find((item) => item.id === resourceId);
      if (!target) return json(res, 404, { error: "User not found" });
      const body = await bodyJson(req);
      const before = { ...target };
      if (body.approvalStatus === "approved") {
        target.approvalStatus = "approved";
        target.approvedBy = user.id;
        target.approvedAt = now();
        target.rejectedReason = "";
        if (target.role === ROLE.FACTORY && target.factoryId) {
          const factory = db.factories.find((item) => item.id === target.factoryId);
          if (factory) {
            factory.enabled = true;
            factory.updatedAt = now();
          }
        }
      } else if (body.approvalStatus === "rejected") {
        target.approvalStatus = "rejected";
        target.rejectedReason = String(body.rejectedReason || "管理员拒绝");
        target.approvedBy = user.id;
        target.approvedAt = now();
      } else {
        return json(res, 400, { error: "Invalid approval status" });
      }
      target.updatedAt = now();
      audit(db, user, "user", target.id, "approval", before, publicUser(target));
      await writeDb(db);
      return json(res, 200, publicUser(target));
    }
  }

  if (resource === "dashboard" && method === "GET") {
    const visibleSales = db.sales_orders.filter((so) => !isDeleted(so) && (user.role !== ROLE.SALES || so.salesId === user.id));
    const visiblePo = db.purchase_orders.filter((po) => !isDeleted(po) && (!isFactory(user) || po.factoryId === user.factoryId));
    const month = new Date().toISOString().slice(0, 7);
    if (isFactory(user)) {
      const monthPo = visiblePo.filter((po) => po.orderDate.startsWith(month));
      const purchaseTotalCny = visiblePo.reduce((total, po) => total + sum(poItems(db, po.id), "purchaseTotal"), 0);
      const monthPurchaseCny = monthPo.reduce((total, po) => total + sum(poItems(db, po.id), "purchaseTotal"), 0);
      return json(res, 200, {
        mode: "factory",
        cards: {
          totalOrders: visiblePo.length,
          inProgress: visiblePo.filter((o) => !["Closed", "Cancelled", "Delivered"].includes(o.productionStatus)).length,
          factoryPending: visiblePo.filter((o) => o.factoryConfirmStatus !== "Confirmed").length,
          producing: visiblePo.filter((o) => o.productionStatus === "Mass Production").length,
          qcPending: visiblePo.filter((o) => o.qcStatus !== "Passed").length,
          readyToShip: visiblePo.filter((o) => o.productionStatus === "Ready to Ship").length,
          shipped: visiblePo.filter((o) => o.productionStatus === "Shipped").length,
          purchaseTotalCny,
          monthPurchaseCny
        },
        reminders: createReminderRecords(db).filter((r) => visiblePo.some((po) => po.id === r.purchaseOrderId)).slice(0, 12),
        recentOrders: visiblePo.slice(-8).reverse().map((po) => visiblePurchaseOrder(db, po, user)),
        recentFactoryUpdates: db.order_timeline.filter((tl) => tl.orderType === "purchase_order" && visiblePo.some((po) => po.id === tl.orderId)).slice(-8).reverse()
      });
    }
    const monthSales = visibleSales.filter((so) => so.orderDate.startsWith(month));
    const finance = monthSales.reduce((acc, so) => {
      const p = profitForSalesOrder(db, so);
      acc.sales += p.salesTotal;
      acc.purchase += p.purchaseCostCny;
      acc.profit += p.estimatedProfit;
      return acc;
    }, { sales: 0, purchase: 0, profit: 0 });
    return json(res, 200, {
      cards: {
        totalOrders: visibleSales.length,
        inProgress: visibleSales.filter((o) => !["Closed", "Cancelled", "Delivered"].includes(o.status)).length,
        factoryPending: visiblePo.filter((o) => o.factoryConfirmStatus !== "Confirmed").length,
        producing: visiblePo.filter((o) => o.productionStatus === "Mass Production").length,
        qcPending: visiblePo.filter((o) => o.qcStatus !== "Passed").length,
        balancePending: visibleSales.filter((o) => o.paymentStatus !== "Paid").length,
        readyToShip: visibleSales.filter((o) => o.status === "Ready to Ship").length,
        shipped: visibleSales.filter((o) => o.status === "Shipped").length,
        monthSales: finance.sales,
        monthPurchase: canViewFinance(user) ? finance.purchase : null,
        monthProfit: canViewFinance(user) ? finance.profit : null
      },
      reminders: createReminderRecords(db).slice(0, 12),
      recentOrders: visibleSales.slice(-8).reverse().map((o) => visibleSalesOrder(db, o, user)),
      recentFactoryUpdates: db.order_timeline.filter((tl) => tl.orderType === "purchase_order").slice(-8).reverse()
    });
  }

  if (resource === "import-sales-order" && method === "POST") {
    if (!requireRole(user, res, [ROLE.ADMIN, ROLE.SALES])) return;
    const body = await bodyJson(req);
    const blobRef = body.blobUrl || body.blobPath || "";
    if ((!body.contentBase64 && !blobRef) || !body.fileName) return json(res, 400, { error: "请上传客户订单 PDF 文件" });
    const fileOrderNo = extractOrderNoFromFileName(body.fileName);
    let pdfBuffer;
    let extracted;
    let parsed;
    try {
      pdfBuffer = blobRef ? await readBlobBuffer(blobRef) : Buffer.from(body.contentBase64, "base64");
      extracted = await extractPdfTextFromBuffer(pdfBuffer);
      parsed = parseImportedSalesOrderPdf(extracted.text);
    } catch (error) {
      return json(res, error.statusCode || 400, { error: `PDF 识别失败：${error.message}` });
    }
    const preferredOrderNo = fileOrderNo || parsed.order.orderNo || nextNo(db.sales_orders, "SO");
    if (db.sales_orders.some((item) => item.orderNo === preferredOrderNo)) {
      return json(res, 409, { error: `订单号 ${preferredOrderNo} 已存在，请确认上传文件是否重复导入。` });
    }
    const customer = ensureImportedCustomer(db, parsed);
    const order = {
      id: id("so"),
      ...parsed.order,
      orderNo: preferredOrderNo,
      customerId: customer.id,
      salesId: user.id,
      createdAt: now(),
      updatedAt: now()
    };
    db.sales_orders.push(order);
    for (const raw of parsed.items) {
      const product = ensureImportedProduct(db, raw);
      db.sales_order_items.push(salesItem(order.id, { ...raw, productId: product.id }));
    }
    const orderDir = path.join(UPLOAD_DIR, order.orderNo.replace(/[^a-zA-Z0-9_-]/g, "_"));
    await mkdir(orderDir, { recursive: true });
    const safeFileName = String(body.fileName).replace(/[^\w.\- \u4e00-\u9fa5]/g, "_");
    const storedPath = blobRef ? blobRef : path.join(orderDir, safeFileName);
    if (!blobRef) await writeFile(storedPath, pdfBuffer);
    db.order_files.push({
      id: id("file"),
      salesOrderId: order.id,
      purchaseOrderId: "",
      fileType: "Customer Quotation",
      fileName: safeFileName,
      path: storedPath,
      storage: blobRef ? "blob" : "local",
      uploadedBy: user.id,
      uploadedByName: user.name,
      createdAt: now()
    });
    addTimeline(db, order.id, "sales_order", user, "", order.status, `导入客户订单 PDF：${body.fileName}`);
    audit(db, user, "sales_order", order.id, "import_pdf", null, { order, quoteRef: parsed.quoteRef, itemCount: parsed.items.length });
    await writeDb(db);
    return json(res, 201, {
      order: visibleSalesOrder(db, order, user),
      parsed: {
        quoteRef: parsed.quoteRef,
        fileOrderNo,
        pages: extracted.pages,
        itemCount: parsed.items.length,
        grandTotal: parsed.grandTotal
      }
    });
  }

  if (["customers", "factories", "products"].includes(resource)) {
    const table = resource;
    if (method === "GET") {
      if (isFactory(user)) return json(res, 403, { error: "Forbidden" });
      const query = listQuery(url);
      const keys = resource === "customers" ? ["name", "company", "country", "contact"] : resource === "factories" ? ["name", "contact", "mainProducts"] : ["name", "model", "category"];
      return json(res, 200, paginate(filterGeneric(db[table], query, keys, resource === "factories" ? "enabled" : "status"), query));
    }
    if (method === "POST") {
      if (!requireRole(user, res, [ROLE.ADMIN, ROLE.SALES, ROLE.MERCH])) return;
      const body = await bodyJson(req);
      if (resource === "products") body.name = bilingualProductName(body.name, body.model);
      const record = { id: id(resource.slice(0, -1)), ...body, createdAt: now(), updatedAt: now() };
      db[table].push(record);
      audit(db, user, resource, record.id, "create", null, record);
      await writeDb(db);
      return json(res, 201, record);
    }
  }

  if (resource === "sales-orders") {
    if (method === "GET" && !resourceId) {
      const query = listQuery(url);
      let orders = db.sales_orders.filter((order) => !isDeleted(order));
      if (user.role === ROLE.SALES) orders = orders.filter((order) => order.salesId === user.id);
      if (isFactory(user)) return json(res, 403, { error: "Forbidden" });
      const visible = filterGeneric(orders.map((o) => visibleSalesOrder(db, o, user)), query, ["orderNo", "customerName", "destinationCountry"], "status");
      return json(res, 200, paginate(visible, query));
    }
    if (method === "GET" && resourceId) {
      const order = db.sales_orders.find((o) => o.id === resourceId);
      if (!order) return json(res, 404, { error: "Not found" });
      if (user.role === ROLE.SALES && order.salesId !== user.id) return json(res, 403, { error: "Forbidden" });
      if (isFactory(user)) return json(res, 403, { error: "Forbidden" });
      return json(res, 200, visibleSalesOrder(db, order, user));
    }
    if (method === "POST") {
      if (!requireRole(user, res, [ROLE.ADMIN, ROLE.SALES])) return;
      const body = await bodyJson(req);
      const order = {
        id: id("so"),
        orderNo: body.orderNo || nextNo(db.sales_orders, "SO"),
        customerId: body.customerId,
        orderDate: body.orderDate || today(),
        salesId: body.salesId || user.id,
        deliveryTerm: body.deliveryTerm || "FOB",
        destinationCountry: body.destinationCountry || "",
        destinationAddress: body.destinationAddress || "",
        freight: Number(body.freight || 0),
        otherFees: Number(body.otherFees || 0),
        depositAmount: Number(body.depositAmount || 0),
        balanceAmount: Number(body.balanceAmount || 0),
        paymentStatus: body.paymentStatus || "Deposit Pending",
        status: body.status || "Inquiry Received",
        expectedDeliveryDate: body.expectedDeliveryDate || today(30),
        remark: body.remark || "",
        createdAt: now(),
        updatedAt: now()
      };
      db.sales_orders.push(order);
      for (const raw of body.items || []) db.sales_order_items.push(salesItem(order.id, raw));
      addTimeline(db, order.id, "sales_order", user, "", order.status, "创建客户订单");
      audit(db, user, "sales_order", order.id, "create", null, order);
      await writeDb(db);
      return json(res, 201, visibleSalesOrder(db, order, user));
    }
    if (method === "PATCH" && resourceId) {
      const order = db.sales_orders.find((o) => o.id === resourceId);
      if (!order) return json(res, 404, { error: "Not found" });
      if (!requireRole(user, res, [ROLE.ADMIN, ROLE.SALES, ROLE.MERCH, ROLE.FINANCE])) return;
      const before = { ...order };
      const body = await bodyJson(req);
      const oldStatus = order.status;
      const allowed = canManageFinance(user) ? body : Object.fromEntries(Object.entries(body).filter(([key]) => !["freight", "otherFees", "depositAmount", "balanceAmount"].includes(key)));
      Object.assign(order, allowed, { updatedAt: now() });
      if (body.status && body.status !== oldStatus) addTimeline(db, order.id, "sales_order", user, oldStatus, body.status, body.note || "订单状态更新");
      audit(db, user, "sales_order", order.id, "update", before, order);
      await writeDb(db);
      return json(res, 200, visibleSalesOrder(db, order, user));
    }
    if (method === "DELETE" && resourceId) {
      if (!requireRole(user, res, [ROLE.ADMIN])) return;
      const confirm = url.searchParams.get("confirm");
      if (confirm !== "DELETE") return json(res, 400, { error: "Deletion requires confirm=DELETE" });
      const before = db.sales_orders.find((o) => o.id === resourceId);
      if (!before) return json(res, 404, { error: "Not found" });
      if (isDeleted(before)) return json(res, 200, { ok: true, archived: true });
      const relatedPurchaseOrders = db.purchase_orders.filter((po) => po.salesOrderId === resourceId);
      const beforeSnapshot = { ...before };
      markSalesOrderDeleted(db, resourceId, user);
      audit(db, user, "sales_order", resourceId, "soft_delete", beforeSnapshot, { ...before });
      audit(db, user, "sales_order", resourceId, "preserve_related_records", { purchaseOrderCount: relatedPurchaseOrders.length }, { retained: true });
      await writeDb(db);
      return json(res, 200, { ok: true, archived: true });
    }
  }

  if (resource === "purchase-orders") {
    if (method === "GET" && !resourceId) {
      const query = listQuery(url);
      let orders = db.purchase_orders.filter((po) => !isDeleted(po));
      if (isFactory(user)) orders = orders.filter((po) => po.factoryId === user.factoryId);
      const visible = filterGeneric(orders.map((po) => visiblePurchaseOrder(db, po, user)), query, ["poNo", "factoryName", "productionStatus"], "productionStatus");
      return json(res, 200, paginate(visible, query));
    }
    if (method === "GET" && resourceId) {
      const po = db.purchase_orders.find((o) => o.id === resourceId);
      if (!po) return json(res, 404, { error: "Not found" });
      if (isFactory(user) && po.factoryId !== user.factoryId) return json(res, 403, { error: "Forbidden" });
      return json(res, 200, visiblePurchaseOrder(db, po, user));
    }
    if (method === "POST") {
      if (!requireRole(user, res, [ROLE.ADMIN, ROLE.MERCH])) return;
      const body = await bodyJson(req);
      const so = body.salesOrderId ? db.sales_orders.find((o) => o.id === body.salesOrderId) : null;
      if (body.salesOrderId && !so) return json(res, 404, { error: "Sales order not found" });
      const sourceItems = body.items?.length ? body.items : so ? salesItems(db, so.id) : [];
      if (!sourceItems.length) return json(res, 400, { error: "Purchase order requires at least one product item" });
      const po = {
        id: id("po"),
        poNo: so?.orderNo || body.poNo || nextNo(db.purchase_orders, "PO"),
        salesOrderId: body.salesOrderId || "",
        factoryId: body.factoryId,
        orderDate: body.orderDate || today(),
        factoryDeliveryDate: body.factoryDeliveryDate || so?.expectedDeliveryDate || today(30),
        factoryPaymentStatus: body.factoryPaymentStatus || "Unpaid",
        factoryConfirmStatus: body.factoryConfirmStatus || "Pending",
        productionStatus: body.productionStatus || "Factory Order Placed",
        qcStatus: body.qcStatus || "Not Started",
        remark: body.remark || "",
        createdAt: now(),
        updatedAt: now()
      };
      db.purchase_orders.push(po);
      for (const raw of sourceItems) db.purchase_order_items.push(poItem(po.id, raw));
      if (so) {
        const oldStatus = so.status;
        so.status = "Factory Order Placed";
        so.updatedAt = now();
        addTimeline(db, so.id, "sales_order", user, oldStatus, so.status, `生成工厂采购订单 ${po.poNo}`);
      }
      addTimeline(db, po.id, "purchase_order", user, "", po.productionStatus, "创建工厂采购订单");
      audit(db, user, "purchase_order", po.id, "create", null, po);
      await writeDb(db);
      return json(res, 201, visiblePurchaseOrder(db, po, user));
    }
    if (method === "PATCH" && resourceId) {
      const po = db.purchase_orders.find((o) => o.id === resourceId);
      if (!po) return json(res, 404, { error: "Not found" });
      if (isFactory(user) && po.factoryId !== user.factoryId) return json(res, 403, { error: "Forbidden" });
      if (!isFactory(user) && ![ROLE.ADMIN, ROLE.SALES, ROLE.MERCH, ROLE.FINANCE].includes(user.role)) return json(res, 403, { error: "Forbidden" });
      const before = { ...po };
      const body = await bodyJson(req);
      const oldStatus = po.productionStatus;
      const oldFactoryDeliveryDate = po.factoryDeliveryDate;
      const allowedKeys = isFactory(user)
        ? ["factoryConfirmStatus", "productionStatus", "qcStatus", "remark", "factoryDeliveryDate"]
        : user.role === ROLE.ADMIN
          ? Object.keys(body)
          : user.role === ROLE.SALES
            ? ["factoryPaymentStatus"]
            : user.role === ROLE.MERCH
              ? ["factoryConfirmStatus", "productionStatus", "qcStatus", "remark", "factoryDeliveryDate"]
              : [];
      if ("factoryPaymentStatus" in body && !canEditPurchasePayment(user)) return json(res, 403, { error: "只有管理员和销售可以修改采购单付款状态" });
      for (const key of allowedKeys) if (key in body) po[key] = body[key];
      if (Array.isArray(body.items) && (isFactory(user) || [ROLE.ADMIN, ROLE.MERCH, ROLE.FINANCE].includes(user.role))) {
        for (const raw of body.items) {
          const item = db.purchase_order_items.find((entry) => entry.id === raw.id && entry.purchaseOrderId === po.id);
          if (!item) continue;
          const quantity = isFactory(user) ? Number(item.quantity || 0) : Number(raw.quantity ?? item.quantity ?? 0);
          const unitPrice = Number(raw.purchaseUnitPrice ?? item.purchaseUnitPrice ?? 0);
          if (!isFactory(user)) item.quantity = quantity;
          item.purchaseUnitPrice = unitPrice;
          if (!isFactory(user)) {
            if ("specification" in raw) item.specification = raw.specification;
            if ("qtyLabel" in raw) item.qtyLabel = raw.qtyLabel;
            item.freightWeight = calculateFreightWeight({ ...item, ...raw, quantity });
            if ("logoRequirement" in raw) item.logoRequirement = raw.logoRequirement;
            if ("logoImageData" in raw) item.logoImageData = raw.logoImageData;
            if ("logoImageName" in raw) item.logoImageName = raw.logoImageName;
            if ("colorRequirement" in raw) item.colorRequirement = raw.colorRequirement;
            if ("packagingRequirement" in raw) item.packagingRequirement = raw.packagingRequirement;
          }
          item.purchaseTotal = purchaseLineTotal(item.freightWeight, unitPrice);
        }
      }
      po.updatedAt = now();
      if (body.productionStatus && body.productionStatus !== oldStatus) addTimeline(db, po.id, "purchase_order", user, oldStatus, body.productionStatus, body.note || "生产状态更新");
      if (body.factoryDeliveryDate && body.factoryDeliveryDate !== oldFactoryDeliveryDate) addTimeline(db, po.id, "purchase_order", user, oldFactoryDeliveryDate, body.factoryDeliveryDate, "工厂提交/更新交期");
      audit(db, user, "purchase_order", po.id, "update", before, po);
      await writeDb(db);
      return json(res, 200, visiblePurchaseOrder(db, po, user));
    }
    if (method === "DELETE" && resourceId) {
      if (!requireRole(user, res, [ROLE.ADMIN])) return;
      const confirm = url.searchParams.get("confirm");
      if (confirm !== "DELETE") return json(res, 400, { error: "Deletion requires confirm=DELETE" });
      const before = db.purchase_orders.find((o) => o.id === resourceId);
      if (!before) return json(res, 404, { error: "Not found" });
      if (isDeleted(before)) return json(res, 200, { ok: true, archived: true });
      const beforeSnapshot = { ...before };
      markPurchaseOrderDeleted(db, resourceId, user);
      audit(db, user, "purchase_order", resourceId, "soft_delete", beforeSnapshot, { ...before });
      await writeDb(db);
      return json(res, 200, { ok: true, archived: true });
    }
  }

  if (resource === "qc" && method === "GET") {
    const reports = db.qc_reports.map((qc) => ({ ...qc, items: db.qc_report_items.filter((item) => item.qcReportId === qc.id) }));
    return json(res, 200, { items: reports, total: reports.length });
  }
  if (resource === "qc" && method === "POST") {
    if (!requireRole(user, res, [ROLE.ADMIN, ROLE.MERCH])) return;
    const body = await bodyJson(req);
    const report = { id: id("qc"), reportNo: body.reportNo || nextNo(db.qc_reports, "QC"), purchaseOrderId: body.purchaseOrderId, result: body.result || "Passed", inspectorName: user.name, inspectionDate: body.inspectionDate || today(), remark: body.remark || "", createdAt: now() };
    db.qc_reports.push(report);
    for (const item of body.items || defaultQcItems()) db.qc_report_items.push({ id: id("qci"), qcReportId: report.id, ...item });
    const po = db.purchase_orders.find((item) => item.id === report.purchaseOrderId);
    if (po) {
      const old = po.qcStatus;
      po.qcStatus = report.result;
      addTimeline(db, po.id, "purchase_order", user, old, report.result, "完成 QC 检查");
    }
    audit(db, user, "qc_report", report.id, "create", null, report);
    await writeDb(db);
    return json(res, 201, report);
  }

  if (resource === "payments") {
    if (method === "GET") {
      if (!requireRole(user, res, [ROLE.ADMIN, ROLE.FINANCE])) return;
      return json(res, 200, { items: db.payments, total: db.payments.length });
    }
    if (method === "POST") {
      if (!requireRole(user, res, [ROLE.ADMIN, ROLE.FINANCE])) return;
      const body = await bodyJson(req);
      const payment = { id: id("pay"), ...body, amount: Number(body.amount || 0), paymentDate: body.paymentDate || today(), createdAt: now() };
      db.payments.push(payment);
      if (body.salesOrderId) {
        const so = db.sales_orders.find((o) => o.id === body.salesOrderId);
        if (so) so.paymentStatus = body.markPaid ? "Paid" : so.paymentStatus;
      }
      if (body.purchaseOrderId) {
        const po = db.purchase_orders.find((o) => o.id === body.purchaseOrderId);
        if (po) po.factoryPaymentStatus = body.markPaid ? "Paid" : po.factoryPaymentStatus;
      }
      audit(db, user, "payment", payment.id, "create", null, payment);
      await writeDb(db);
      return json(res, 201, payment);
    }
  }

  if (resource === "files" && method === "POST") {
    const body = await bodyJson(req);
    if (body.purchaseOrderId) {
      const po = db.purchase_orders.find((order) => order.id === body.purchaseOrderId);
      if (!po) return json(res, 404, { error: "Purchase order not found" });
      if (isFactory(user) && po.factoryId !== user.factoryId) return json(res, 403, { error: "Forbidden" });
    }
    if (body.salesOrderId && isFactory(user)) return json(res, 403, { error: "Forbidden" });
    const orderNo = body.orderNo || "unassigned";
    const orderDir = path.join(UPLOAD_DIR, orderNo.replace(/[^a-zA-Z0-9_-]/g, "_"));
    await mkdir(orderDir, { recursive: true });
    let storedPath = "";
    if (body.contentBase64 && body.fileName) {
      storedPath = path.join(orderDir, body.fileName.replace(/[^\w.\- ]/g, "_"));
      await writeFile(storedPath, Buffer.from(body.contentBase64, "base64"));
    }
    const file = {
      id: id("file"),
      salesOrderId: body.salesOrderId || "",
      purchaseOrderId: body.purchaseOrderId || "",
      fileType: body.fileType || "Other Attachment",
      fileName: body.fileName || "manual-note.txt",
      contentType: body.contentType || "application/octet-stream",
      contentBase64: body.contentBase64 || "",
      path: storedPath,
      uploadedBy: user.id,
      uploadedByName: user.name,
      createdAt: now()
    };
    db.order_files.push(file);
    const { contentBase64, ...fileAudit } = file;
    audit(db, user, "order_file", file.id, "create", null, fileAudit);
    await writeDb(db);
    return json(res, 201, enrichOrderFile(file));
  }

  if (resource === "files" && method === "GET" && resourceId && action === "download") {
    const file = db.order_files.find((item) => item.id === resourceId);
    if (!file) return json(res, 404, { error: "Not found" });
    if (!fileBelongsToAccessibleOrder(db, file, user)) return json(res, 403, { error: "Forbidden" });
    let buffer = null;
    if (file.contentBase64) {
      buffer = Buffer.from(file.contentBase64, "base64");
    } else if (file.path && existsSync(file.path)) {
      buffer = await readFile(file.path);
    }
    if (!buffer) return json(res, 404, { error: "文件不存在或存储已失效" });
    const disposition = url.searchParams.get("preview") === "1" ? "inline" : "attachment";
    res.writeHead(200, {
      "content-type": file.contentType || "application/octet-stream",
      "content-disposition": `${disposition}; filename="${downloadFileName(file.fileName || "order-file")}"`
    });
    return res.end(buffer);
  }

  if (resource === "reminders" && method === "GET") return json(res, 200, { items: createReminderRecords(db) });
  if (resource === "audit-logs" && method === "GET") {
    if (!requireRole(user, res, [ROLE.ADMIN])) return;
    return json(res, 200, { items: db.audit_logs.slice(-100).reverse() });
  }

  if (resource === "export" && method === "GET") {
    const type = url.searchParams.get("type");
    if (type === "profit" && !canViewFinance(user)) return json(res, 403, { error: "Forbidden" });
    if (type === "sales-orders") {
      const rows = db.sales_orders.filter((so) => !isDeleted(so)).map((so) => ({ orderNo: so.orderNo, customer: db.customers.find((c) => c.id === so.customerId)?.company || "", status: so.status, paymentStatus: so.paymentStatus, totalUsd: profitForSalesOrder(db, so).salesTotal }));
      return text(res, 200, csv(rows), "text/csv; charset=utf-8", { "content-disposition": "attachment; filename=sales-orders.csv" });
    }
    if (type === "purchase-orders") {
      const rows = db.purchase_orders.filter((po) => !isDeleted(po) && (!isFactory(user) || po.factoryId === user.factoryId)).map((po) => ({ poNo: po.poNo, factory: db.factories.find((f) => f.id === po.factoryId)?.name || "", productionStatus: po.productionStatus, qcStatus: po.qcStatus, factoryPaymentStatus: po.factoryPaymentStatus, purchaseTotalCny: sum(poItems(db, po.id), "purchaseTotal") }));
      return text(res, 200, csv(rows), "text/csv; charset=utf-8", { "content-disposition": "attachment; filename=purchase-orders.csv" });
    }
    if (type === "profit") {
      const rows = db.sales_orders.filter((so) => !isDeleted(so)).map((so) => {
        const p = profitForSalesOrder(db, so);
        return { orderNo: so.orderNo, salesTotalUsd: p.salesTotal, purchaseCostCny: p.purchaseCostCny, purchaseCostUsd: p.purchaseCost, freightUsd: p.freight, otherCostUsd: p.otherCost, estimatedProfitUsd: p.estimatedProfit, profitRate: p.profitRate, exchangeRateCnyPerUsd: p.exchangeRateCnyPerUsd };
      });
      return text(res, 200, csv(rows), "text/csv; charset=utf-8", { "content-disposition": "attachment; filename=profit-report.csv" });
    }
    if (type === "order") {
      const so = db.sales_orders.find((o) => o.id === url.searchParams.get("id"));
      if (!so) return json(res, 404, { error: "Not found" });
      if (isFactory(user)) return json(res, 403, { error: "Forbidden" });
      if (user.role === ROLE.SALES && so.salesId !== user.id) return json(res, 403, { error: "Forbidden" });
      const document = pdfDocumentPayload(db, type, so.id, user);
      const pdf = await structuredPdf(`订单 ${so.orderNo}`, document, { logoPath: LOGO_PATH, db, user });
      res.writeHead(200, { "content-type": "application/pdf", "content-disposition": `attachment; filename="${downloadFileName("ORDER", so.orderNo)}.pdf"` });
      return res.end(pdf);
    }
    if (["pi", "po", "qc"].includes(type)) {
      const title = type === "po" ? "工厂采购单" : type.toUpperCase();
      const document = pdfDocumentPayload(db, type, url.searchParams.get("id"), user);
      if (!document) return json(res, 404, { error: "Not found" });
      const pdf = await structuredPdf(title, document, { logoPath: LOGO_PATH, db, user });
      const fileName = type === "pi"
        ? downloadFileName("PI", document.orderNo)
        : type === "po"
          ? downloadFileName(document.poNo)
          : downloadFileName("QC", document.reportNo, document.poNo || document.id);
      res.writeHead(200, { "content-type": "application/pdf", "content-disposition": `attachment; filename="${fileName}.pdf"` });
      return res.end(pdf);
    }
  }

  json(res, 404, { error: "API not found" });
}

function publicUser(user) {
  const { password, ...safe } = user;
  return safe;
}

function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function nextNo(records, prefix) {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const count = records.filter((item) => String(item.orderNo || item.poNo || item.reportNo || "").includes(date)).length + 1;
  return `${prefix}-${date}-${String(count).padStart(3, "0")}`;
}

function salesItem(orderId, raw) {
  const quantity = Number(raw.quantity || 0);
  const unit = Number(raw.salesUnitPrice ?? raw.defaultSalesPrice ?? 0);
  const model = raw.model || "";
  return {
    id: id("soi"),
    salesOrderId: orderId,
    productId: raw.productId || "",
    productName: bilingualProductName(raw.productName || raw.name || "", model),
    model,
    specification: raw.specification || "",
    qtyLabel: raw.qtyLabel || raw.orderQty || `${quantity || 0} pcs`,
    quantity,
    freightWeight: calculateFreightWeight(raw),
    salesUnitPrice: unit,
    salesTotal: Number(raw.salesTotal ?? quantity * unit),
    logoRequirement: raw.logoRequirement || "",
    colorRequirement: raw.colorRequirement || "",
    packagingRequirement: raw.packagingRequirement || ""
  };
}

function poItem(orderId, raw) {
  const quantity = Number(raw.quantity || 0);
  const unit = Number(raw.purchaseUnitPrice ?? raw.defaultPurchasePrice ?? raw.factoryPurchasePrice ?? 0);
  const model = raw.model || "";
  const freightWeight = calculateFreightWeight(raw);
  return {
    id: id("poi"),
    purchaseOrderId: orderId,
    productId: raw.productId || "",
    productName: bilingualProductName(raw.productName || raw.name || "", model),
    model,
    specification: raw.specification || "",
    qtyLabel: raw.qtyLabel || raw.orderQty || `${quantity || 0} pcs`,
    quantity,
    freightWeight,
    purchaseUnitPrice: unit,
    purchaseTotal: purchaseLineTotal(freightWeight, unit),
    logoRequirement: raw.logoRequirement || "",
    logoImageData: raw.logoImageData || "",
    logoImageName: raw.logoImageName || "",
    colorRequirement: raw.colorRequirement || "",
    packagingRequirement: raw.packagingRequirement || ""
  };
}

function defaultQcItems() {
  return [
    "产品型号是否正确",
    "数量是否正确",
    "标志是否正确",
    "颜色是否正确",
    "尺寸是否正确",
    "包装是否正确",
    "标签是否正确",
    "是否有明显划痕",
    "是否有破损",
    "是否符合客户确认样品",
    "是否可以出货"
  ].map((checkItem) => ({ checkItem, passed: true, note: "" }));
}

async function serveStatic(req, res, url) {
  let filePath = url.pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) return text(res, 403, "Forbidden");
  try {
    const st = await stat(filePath);
    if (st.isDirectory()) filePath = path.join(PUBLIC_DIR, "index.html");
    const ext = path.extname(filePath);
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
    text(res, 200, await readFile(filePath), types[ext] || "application/octet-stream");
  } catch {
    text(res, 200, await readFile(path.join(PUBLIC_DIR, "index.html")), "text/html; charset=utf-8");
  }
}

async function appHandler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await readDb();
    const user = await getUser(req, db);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, db, user, url);
    return serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    json(res, error.statusCode || 500, { error: error.message || "Internal server error" });
  }
}

export default appHandler;

if (!process.env.VERCEL) {
  const server = http.createServer(appHandler);
  server.listen(PORT, () => {
    console.log(`Trade order system running at http://localhost:${PORT}`);
  });
}
