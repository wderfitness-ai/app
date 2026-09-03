import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_FILE = path.join(ROOT, "data", "database.json");
const CHINA_TIME_OFFSET_MS = 8 * 60 * 60 * 1000;

const today = (offset = 0) => {
  const d = new Date(Date.now() + offset * 86400000 + CHINA_TIME_OFFSET_MS);
  return d.toISOString().slice(0, 10);
};
const now = () => {
  const shifted = new Date(Date.now() + CHINA_TIME_OFFSET_MS);
  return `${shifted.toISOString().slice(0, 10)}T${shifted.toISOString().slice(11, 19)}+08:00`;
};

const users = [
  { id: "user-wdefitness", name: "WdeFitness", email: "wdefitness@trade.local", password: "password123", role: "Admin", approvalStatus: "approved", approvedAt: now() },
  { id: "user-admin", name: "系统管理员", email: "admin@trade.local", password: "password123", role: "Admin", approvalStatus: "approved", approvedAt: now() },
  { id: "user-sales", name: "销售小苏", email: "sales@trade.local", password: "password123", role: "Sales", approvalStatus: "approved", approvedAt: now() },
  { id: "user-merch", name: "跟单小明", email: "merch@trade.local", password: "password123", role: "Merchandiser", approvalStatus: "approved", approvedAt: now() },
  { id: "user-finance", name: "财务小方", email: "finance@trade.local", password: "password123", role: "Finance", approvalStatus: "approved", approvedAt: now() },
  { id: "user-factory-a", name: "亮彩包装工厂账号", email: "factory-a@trade.local", password: "password123", role: "Factory", factoryId: "fac-1", approvalStatus: "approved", approvedAt: now() },
  { id: "user-factory-b", name: "宁波户外工厂账号", email: "factory-b@trade.local", password: "password123", role: "Factory", factoryId: "fac-2", approvalStatus: "approved", approvedAt: now() }
];

const customers = [
  { id: "cus-1", name: "绿集客户", company: "绿集商贸有限公司", country: "美国", contact: "艾玛", email: "emma@greenmart.example", whatsapp: "+1 555 201 3344", phone: "+1 555 201 3344", address: "美国奥斯汀市场街214号", source: "LinkedIn", level: "A", remark: "户外零售连锁客户。", createdAt: now(), lastFollowUpAt: today(-3) },
  { id: "cus-2", name: "北欧家居", company: "北欧家居有限公司", country: "瑞典", contact: "拉尔斯", email: "lars@nordichome.example", whatsapp: "+46 70 112 221", phone: "+46 70 112 221", address: "瑞典斯德哥尔摩主街12号", source: "Website", level: "B", remark: "偏好深圳 FOB 条款。", createdAt: now(), lastFollowUpAt: today(-7) },
  { id: "cus-3", name: "沙漠装备", company: "沙漠装备贸易公司", country: "阿联酋", contact: "奥马尔", email: "omar@desertgear.example", whatsapp: "+971 55 432 7788", phone: "+971 55 432 7788", address: "迪拜商业湾", source: "Alibaba", level: "A", remark: "决策速度快。", createdAt: now(), lastFollowUpAt: today(-1) }
];

const factories = [
  { id: "fac-1", name: "深圳亮彩包装厂", contact: "陈伟", phone: "13800001111", wechat: "brightpack88", email: "sales@brightpack.example", address: "深圳市宝安区", mainProducts: "保温袋、冰包", paymentTerms: "30%定金，70%出货前付清", leadTimeDays: 25, qualityScore: 91, deliveryScore: 88, cooperationScore: 94, remark: "返单产品稳定可靠。", enabled: true, createdAt: now() },
  { id: "fac-2", name: "宁波户外用品厂", contact: "刘芳", phone: "13900002222", wechat: "nboutdoor", email: "liu@nboutdoor.example", address: "宁波市鄞州区", mainProducts: "露营椅、折叠桌", paymentTerms: "电汇 30/70", leadTimeDays: 35, qualityScore: 86, deliveryScore: 82, cooperationScore: 89, remark: "尾款前必须安排质检。", enabled: true, createdAt: now() },
  { id: "fac-3", name: "东莞印刷包装厂", contact: "黄磊", phone: "13700003333", wechat: "dgprint", email: "huang@dgprint.example", address: "东莞市虎门镇", mainProducts: "标志印刷、包装盒", paymentTerms: "出货前付清", leadTimeDays: 10, qualityScore: 84, deliveryScore: 90, cooperationScore: 85, remark: "适合紧急标志和包装订单。", enabled: true, createdAt: now() }
];

const products = [
  { id: "prod-1", name: "保温购物袋 / Insulated Grocery Bag", model: "IGB-20L", category: "箱包", image: "", defaultSalesPrice: 8.8, defaultPurchasePrice: 5.1, unit: "piece", weight: 0.45, packageSize: "42x20x34cm", remark: "可重复使用保温袋。" },
  { id: "prod-2", name: "折叠露营椅 / Folding Camping Chair", model: "FCC-01", category: "户外用品", image: "", defaultSalesPrice: 19.5, defaultPurchasePrice: 12.4, unit: "piece", weight: 2.8, packageSize: "90x18x18cm", remark: "钢管支架。" },
  { id: "prod-3", name: "硅胶食品盒套装 / Silicone Food Container Set", model: "SFC-6", category: "厨房用品", image: "", defaultSalesPrice: 6.2, defaultPurchasePrice: 3.7, unit: "set", weight: 0.62, packageSize: "24x18x12cm", remark: "六件套。" },
  { id: "prod-4", name: "棉布抽绳袋 / Cotton Drawstring Bag", model: "CDB-12", category: "包装用品", image: "", defaultSalesPrice: 1.25, defaultPurchasePrice: 0.62, unit: "piece", weight: 0.04, packageSize: "12x18cm", remark: "可印刷客户标志。" },
  { id: "prod-5", name: "便携野餐垫 / Portable Picnic Mat", model: "PPM-150", category: "户外用品", image: "", defaultSalesPrice: 11.6, defaultPurchasePrice: 7.25, unit: "piece", weight: 0.9, packageSize: "38x18x18cm", remark: "底部防水。" }
];

const sales_orders = [
  { id: "so-1", orderNo: "SO-20260708-001", customerId: "cus-1", orderDate: today(-12), salesId: "user-sales", deliveryTerm: "FOB", destinationCountry: "美国", destinationAddress: "奥斯汀仓库", freight: 1250, otherFees: 180, depositAmount: 2600, balanceAmount: 5200, paymentStatus: "Deposit Received", status: "Mass Production", expectedDeliveryDate: today(12), remark: "绿色标志，零售彩盒。", createdAt: now(), updatedAt: now() },
  { id: "so-2", orderNo: "SO-20260708-002", customerId: "cus-2", orderDate: today(-20), salesId: "user-sales", deliveryTerm: "CIF", destinationCountry: "瑞典", destinationAddress: "斯德哥尔摩配送仓", freight: 2100, otherFees: 260, depositAmount: 3200, balanceAmount: 6400, paymentStatus: "Balance Pending", status: "Balance Payment Pending", expectedDeliveryDate: today(4), remark: "必须严格做包装质检。", createdAt: now(), updatedAt: now() },
  { id: "so-3", orderNo: "SO-20260708-003", customerId: "cus-3", orderDate: today(-8), salesId: "user-sales", deliveryTerm: "DDP", destinationCountry: "阿联酋", destinationAddress: "迪拜商业湾", freight: 1650, otherFees: 390, depositAmount: 1800, balanceAmount: 3600, paymentStatus: "Deposit Received", status: "Factory Confirmed", expectedDeliveryDate: today(25), remark: "需要阿拉伯语贴纸。", createdAt: now(), updatedAt: now() }
];

const sales_order_items = [
  { id: "soi-1", salesOrderId: "so-1", productId: "prod-1", productName: "保温购物袋 / Insulated Grocery Bag", model: "IGB-20L", specification: "20L，600D 牛津布", quantity: 1000, salesUnitPrice: 8.8, salesTotal: 8800, logoRequirement: "正面居中印绿集标志", colorRequirement: "森林绿", packagingRequirement: "零售彩盒" },
  { id: "soi-2", salesOrderId: "so-2", productId: "prod-2", productName: "折叠露营椅 / Folding Camping Chair", model: "FCC-01", specification: "黑色支架，600D 面料", quantity: 600, salesUnitPrice: 19.5, salesTotal: 11700, logoRequirement: "织唛标签", colorRequirement: "藏青色", packagingRequirement: "单个收纳袋加外箱" },
  { id: "soi-3", salesOrderId: "so-3", productId: "prod-3", productName: "硅胶食品盒套装 / Silicone Food Container Set", model: "SFC-6", specification: "六件套", quantity: 1200, salesUnitPrice: 6.2, salesTotal: 7440, logoRequirement: "无标志", colorRequirement: "混合马卡龙色", packagingRequirement: "阿拉伯语彩盒" }
];

const purchase_orders = [
  { id: "po-1", poNo: "SO-20260708-001", salesOrderId: "so-1", factoryId: "fac-1", orderDate: today(-10), factoryDeliveryDate: today(8), factoryPaymentStatus: "Deposit Paid", factoryConfirmStatus: "Confirmed", productionStatus: "Mass Production", qcStatus: "Not Started", remark: "每周五发送生产图片。", createdAt: now(), updatedAt: now() },
  { id: "po-2", poNo: "SO-20260708-002", salesOrderId: "so-2", factoryId: "fac-2", orderDate: today(-18), factoryDeliveryDate: today(2), factoryPaymentStatus: "Balance Pending", factoryConfirmStatus: "Confirmed", productionStatus: "Production Completed", qcStatus: "Need Rework", remark: "椅子收纳袋车线需要返工。", createdAt: now(), updatedAt: now() },
  { id: "po-3", poNo: "SO-20260708-003", salesOrderId: "so-3", factoryId: "fac-1", orderDate: today(-6), factoryDeliveryDate: today(20), factoryPaymentStatus: "Deposit Paid", factoryConfirmStatus: "Confirmed", productionStatus: "Factory Order Placed", qcStatus: "Not Started", remark: "等待彩盒设计稿。", createdAt: now(), updatedAt: now() }
];

const purchase_order_items = [
  { id: "poi-1", purchaseOrderId: "po-1", productId: "prod-1", productName: "保温购物袋 / Insulated Grocery Bag", model: "IGB-20L", specification: "20L，600D 牛津布", quantity: 1000, purchaseUnitPrice: 5.1, purchaseTotal: 5100, logoRequirement: "正面居中印绿集标志", colorRequirement: "森林绿", packagingRequirement: "零售彩盒" },
  { id: "poi-2", purchaseOrderId: "po-2", productId: "prod-2", productName: "折叠露营椅 / Folding Camping Chair", model: "FCC-01", specification: "黑色支架，600D 面料", quantity: 600, purchaseUnitPrice: 12.4, purchaseTotal: 7440, logoRequirement: "织唛标签", colorRequirement: "藏青色", packagingRequirement: "单个收纳袋加外箱" },
  { id: "poi-3", purchaseOrderId: "po-3", productId: "prod-3", productName: "硅胶食品盒套装 / Silicone Food Container Set", model: "SFC-6", specification: "六件套", quantity: 1200, purchaseUnitPrice: 3.7, purchaseTotal: 4440, logoRequirement: "无标志", colorRequirement: "混合马卡龙色", packagingRequirement: "阿拉伯语彩盒" }
];

const qc_reports = [
  { id: "qc-1", reportNo: "QC-20260708-001", purchaseOrderId: "po-2", result: "Need Rework", inspectorName: "跟单小明", inspectionDate: today(-1), remark: "15 个收纳袋车线松，需要返工。", createdAt: now() }
];

const qc_report_items = [
  { id: "qci-1", qcReportId: "qc-1", checkItem: "产品型号是否正确", passed: true, note: "" },
  { id: "qci-2", qcReportId: "qc-1", checkItem: "数量是否正确", passed: true, note: "" },
  { id: "qci-3", qcReportId: "qc-1", checkItem: "包装是否正确", passed: false, note: "收纳袋车线需要返工。" },
  { id: "qci-4", qcReportId: "qc-1", checkItem: "是否可以出货", passed: false, note: "返工完成前暂不出货。" }
];

const payments = [
  { id: "pay-1", type: "Customer Deposit", salesOrderId: "so-1", amount: 2600, paymentDate: today(-11), method: "电汇", screenshot: "", markPaid: false, createdAt: now() },
  { id: "pay-2", type: "Factory Deposit", purchaseOrderId: "po-1", amount: 1530, paymentDate: today(-9), method: "银行转账", screenshot: "", markPaid: false, createdAt: now() },
  { id: "pay-3", type: "Customer Deposit", salesOrderId: "so-3", amount: 1800, paymentDate: today(-7), method: "电汇", screenshot: "", markPaid: false, createdAt: now() }
];

const order_timeline = [
  { id: "tl-1", orderId: "so-1", orderType: "sales_order", actorId: "user-sales", actorName: "销售小苏", createdAt: now(), oldStatus: "", newStatus: "Customer Confirmed", note: "客户确认形式发票" },
  { id: "tl-2", orderId: "so-1", orderType: "sales_order", actorId: "user-finance", actorName: "财务小方", createdAt: now(), oldStatus: "Customer Confirmed", newStatus: "Deposit Received", note: "收到定金" },
  { id: "tl-3", orderId: "po-1", orderType: "purchase_order", actorId: "user-factory-a", actorName: "亮彩包装工厂账号", createdAt: now(), oldStatus: "Factory Order Placed", newStatus: "Mass Production", note: "开始生产" },
  { id: "tl-4", orderId: "po-2", orderType: "purchase_order", actorId: "user-merch", actorName: "跟单小明", createdAt: now(), oldStatus: "Mass Production", newStatus: "Production Completed", note: "生产完成，等待质检复核" }
];

const db = {
  users,
  roles: ["Admin", "Sales", "Merchandiser", "Finance", "Factory"].map((name, index) => ({ id: `role-${index + 1}`, name })),
  customers,
  factories,
  products,
  sales_orders,
  sales_order_items,
  purchase_orders,
  purchase_order_items,
  order_files: [],
  order_timeline,
  qc_reports,
  qc_report_items,
  payments,
  reminders: [],
  delivery_change_requests: [],
  notifications: [],
  audit_logs: []
};

await mkdir(path.dirname(DATA_FILE), { recursive: true });
await mkdir(path.join(ROOT, "uploads"), { recursive: true });
await writeFile(DATA_FILE, JSON.stringify(db, null, 2));
console.log(`Seeded database at ${DATA_FILE}`);
