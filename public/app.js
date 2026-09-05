const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  user: null,
  orderStatuses: [],
  purchaseProductionStatuses: [],
  statusZh: {},
  roles: [],
  factories: [],
  notifications: { items: [], unread: 0 },
  navSummary: { deliveryDueTodayCount: 0, unreadNotifications: 0, unreadChats: 0, deliveryDueToday: [], notifications: [] },
  cache: {},
  dashboardScrollTimers: []
};

const navAdmin = [
  ["/admin/dashboard", "首页看板"],
  ["/admin/delivery", "交期管理"],
  ["/admin/notifications", "通知中心"],
  ["/admin/chats", "订单沟通"],
  ["/admin/orders", "订单总览"],
  ["/admin/orders/new", "新建客户订单"],
  ["/admin/sales-orders", "客户订单"],
  ["/admin/purchase-orders", "工厂采购订单"],
  ["/admin/purchase-orders/new", "新建采购单"],
  ["/admin/customers", "客户管理"],
  ["/admin/factories", "工厂管理"],
  ["/admin/products", "产品管理"],
  ["/admin/qc", "质检管理"],
  ["/admin/payments", "付款管理"],
  ["/admin/reports", "报表导出"],
  ["/admin/settings", "设置与审计"]
];

const navFactory = [
  ["/factory/dashboard", "工厂看板"],
  ["/factory/notifications", "通知中心"],
  ["/factory/chats", "订单沟通"],
  ["/factory/delivery", "交期管理"],
  ["/factory/orders", "我的采购订单"]
];

const ROLE_LABELS = {
  Admin: "管理员",
  Sales: "销售",
  Merchandiser: "跟单",
  Finance: "财务",
  Factory: "工厂账号"
};

const STATUS_LABELS = {
  "Inquiry Received": "询盘中",
  Quoted: "已报价",
  "Customer Confirmed": "客户已确认",
  "Deposit Received": "已收定金",
  "Factory Order Placed": "已安排工厂",
  "Factory Confirmed": "工厂已确认",
  "Logo / Artwork Confirmed": "Logo或设计已确认",
  "Sample / Pre-production Confirmed": "产前样已确认",
  "Mass Production": "生产中",
  "Production Inspection": "生产质检中",
  "Packing Inspection": "包装质检中",
  "Production Completed": "生产完成",
  "Balance Payment Pending": "待收尾款",
  "Ready to Ship": "待发货",
  Shipped: "已发货",
  Delivered: "已送达",
  "After-sales": "售后处理中",
  Closed: "订单关闭",
  Cancelled: "已取消",
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
  "Need Rework": "需要返工",
  Approved: "已通过",
  Rejected: "已拒绝"
};

const PAYMENT_TYPE_LABELS = {
  "Customer Deposit": "客户定金",
  "Customer Balance": "客户尾款",
  "Factory Deposit": "工厂定金",
  "Factory Balance": "工厂尾款",
  Freight: "运费",
  "Other Cost": "其他成本"
};

const FILE_TYPE_LABELS = {
  "Customer Quotation": "客户报价单",
  PI: "形式发票",
  Contract: "合同",
  "Logo File": "标志文件",
  "Product Image": "产品图片",
  "Factory Production Image": "工厂生产图片",
  "QC Image": "质检图片",
  "QC Product Image": "质检产品照片",
  "QC Packing Image": "质检包装照片",
  "QC Sample Image": "质检样品图片",
  "Packing Image": "包装图片",
  "Loading Image": "装柜图片",
  "Bill of Lading": "提单",
  Invoice: "发票",
  "Logistics File": "物流文件",
  "Payment Screenshot": "付款截图",
  "Factory Deposit Voucher": "预付款凭证",
  "Factory Balance Voucher": "尾款凭证",
  "Other Attachment": "其他附件"
};

const DELIVERY_LABELS = {
  EXW: "EXW（工厂交货）",
  FOB: "FOB（离岸价）",
  CIF: "CIF（成本保险运费）",
  DDP: "DDP（完税后交货）"
};

const SOURCE_LABELS = {
  LinkedIn: "领英",
  Website: "官网",
  Alibaba: "阿里巴巴",
  WhatsApp: "WhatsApp",
  Referral: "客户转介绍",
  Other: "其他"
};

const UNIT_LABELS = {
  piece: "个",
  pair: "双",
  set: "套",
  kg: "千克",
  lb: "磅"
};

const CHINA_TIMEZONE = "Asia/Shanghai";
const THEME_STORAGE_KEY = "wder-theme-mode";

function chinaHour(date = new Date()) {
  const hourText = new Intl.DateTimeFormat("en-US", {
    timeZone: CHINA_TIMEZONE,
    hour: "2-digit",
    hour12: false
  }).format(date);
  const hour = Number(hourText);
  return hour === 24 ? 0 : hour;
}

function getThemeMode() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return ["auto", "light", "dark"].includes(saved) ? saved : "auto";
  } catch {
    return "auto";
  }
}

function resolveThemeMode(mode = getThemeMode()) {
  if (mode === "light" || mode === "dark") return mode;
  const hour = chinaHour();
  return hour >= 7 && hour < 19 ? "light" : "dark";
}

function applyTheme(mode = getThemeMode()) {
  const nextMode = ["auto", "light", "dark"].includes(mode) ? mode : "auto";
  const resolved = resolveThemeMode(nextMode);
  document.documentElement.dataset.themeMode = nextMode;
  document.documentElement.dataset.theme = resolved;
  updateThemeControls(nextMode, resolved);
}

function setThemeMode(mode) {
  const nextMode = ["auto", "light", "dark"].includes(mode) ? mode : "auto";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextMode);
  } catch {
    // Theme preference is non-critical; continue with the selected runtime value.
  }
  applyTheme(nextMode);
}

function themeControlHtml(extraClass = "") {
  return `
    <label class="theme-control ${extraClass}">
      <span data-theme-current>自动</span>
      <select class="select theme-select" data-theme-select aria-label="主题模式">
        <option value="auto">自动</option>
        <option value="light">白天</option>
        <option value="dark">夜间</option>
      </select>
    </label>`;
}

function updateThemeControls(mode = getThemeMode(), resolved = resolveThemeMode(mode)) {
  const resolvedLabel = resolved === "dark" ? "夜间" : "白天";
  const label = mode === "auto" ? `自动：${resolvedLabel}` : resolvedLabel;
  $$("[data-theme-current]").forEach((node) => { node.textContent = label; });
  $$("[data-theme-select]").forEach((select) => { select.value = mode; });
}

function bindThemeControls() {
  $$("[data-theme-select]").forEach((select) => {
    select.value = getThemeMode();
    select.addEventListener("change", () => setThemeMode(select.value));
  });
  applyTheme();
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const type = res.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

async function boot() {
  try {
    const session = await api("/api/session");
    state.user = session.user;
    state.orderStatuses = session.orderStatuses || [];
    state.purchaseProductionStatuses = session.purchaseProductionStatuses || [];
    state.statusZh = session.statusZh || {};
    state.roles = session.roles || [];
    state.factories = session.factories || [];
    render();
  } catch {
    renderLogin();
  }
}

function pathNow() {
  const path = window.location.pathname;
  if (path === "/") return state.user?.role === "Factory" ? "/factory/dashboard" : "/admin/dashboard";
  return path;
}

function go(path) {
  history.pushState(null, "", path);
  render();
}

window.addEventListener("popstate", render);

function renderLogin() {
  $("#app").innerHTML = `
    <main class="login">
      <form class="login-card" id="loginForm">
        <img class="login-logo" src="/assets/wder-logo.jpg" alt="WDER Fitness Equipment">
        <h1>跟单管理系统</h1>
        <p>订单、采购、生产、质检、付款、利润与导出。</p>
        <div class="toolbar" style="justify-content:flex-start;margin-bottom:14px">
          <button class="btn small primary" type="button" id="showLogin">登录</button>
          <button class="btn small" type="button" id="showRegister">注册</button>
          ${themeControlHtml("login-theme-control")}
        </div>
        <div id="loginFields">
        <label>邮箱 / 用户名<input class="input" name="email" value="wderfitness@gmail.com" autocomplete="username"></label>
        <div style="height:10px"></div>
        <label>密码
          <span class="password-row">
            <input class="input" id="loginPassword" name="password" value="" type="password" autocomplete="current-password">
            <button class="btn small" id="toggleLoginPassword" type="button">显示</button>
          </span>
        </label>
        </div>
        <div id="registerFields" class="hidden">
          <label>用户名<input class="input" name="name" value="" autocomplete="name"></label>
          <div style="height:10px"></div>
          <label>注册邮箱<input class="input" name="registerEmail" value="" autocomplete="email"></label>
          <div style="height:10px"></div>
          <label>注册密码<input class="input" name="registerPassword" value="" type="password" autocomplete="new-password"></label>
          <div style="height:10px"></div>
          <label>申请账号类型<select class="select" name="role" id="roleSelect">
            ${["Sales", "Factory"].map((role) => `<option value="${role}">${role === "Sales" ? "公司销售" : "工厂账号"}</option>`).join("")}
          </select></label>
          <div style="height:10px"></div>
          <div id="factoryBind" class="hidden">
            <label>绑定已有工厂<select class="select" name="factoryId">
              <option value="">注册新工厂资料</option>
              ${state.factories.map((factory) => `<option value="${factory.id}">${factory.name}</option>`).join("")}
            </select></label>
            <div style="height:10px"></div>
            <label>工厂名称<input class="input" name="factoryName" placeholder="例如：某某制品厂"></label>
            <div style="height:10px"></div>
            <label>工厂联系人<input class="input" name="factoryContact" placeholder="工厂联系人"></label>
            <div style="height:10px"></div>
            <label>工厂联系电话<input class="input" name="factoryPhone" placeholder="手机号或座机"></label>
            <div style="height:10px"></div>
            <label>工厂微信<input class="input" name="factoryWechat" placeholder="微信号"></label>
            <div style="height:10px"></div>
            <label>工厂地址<input class="input" name="factoryAddress" placeholder="详细地址"></label>
            <div style="height:10px"></div>
            <label>主营产品<input class="input" name="factoryMainProducts" placeholder="例如：箱包、五金、包装"></label>
            <div style="height:10px"></div>
            <label>营业执照照片<input class="input" type="file" name="businessLicense" id="businessLicense" accept="image/*,.pdf"></label>
            <p class="muted" style="margin:6px 0 0">手机照片会自动压缩后上传；PDF 建议小于 4MB。</p>
          </div>
        </div>
        <div style="height:14px"></div>
        <button class="btn primary" style="width:100%" id="authSubmit">登录</button>
      </form>
    </main>`;
  bindThemeControls();
  let mode = "login";
  const setMode = (next) => {
    mode = next;
    $("#loginFields").classList.toggle("hidden", mode !== "login");
    $("#registerFields").classList.toggle("hidden", mode !== "register");
    $("#showLogin").classList.toggle("primary", mode === "login");
    $("#showRegister").classList.toggle("primary", mode === "register");
    $("#authSubmit").textContent = mode === "login" ? "登录" : "提交注册申请";
  };
  $("#showLogin").addEventListener("click", () => setMode("login"));
  $("#showRegister").addEventListener("click", () => setMode("register"));
  $("#toggleLoginPassword").addEventListener("click", () => {
    const passwordInput = $("#loginPassword");
    const visible = passwordInput.type === "text";
    passwordInput.type = visible ? "password" : "text";
    $("#toggleLoginPassword").textContent = visible ? "显示" : "隐藏";
  });
  $("#roleSelect").addEventListener("change", () => {
    $("#factoryBind").classList.toggle("hidden", $("#roleSelect").value !== "Factory");
  });
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    try {
      if (mode === "login") {
        const data = await api("/api/login", { method: "POST", body: JSON.stringify({ email: fd.get("email"), password: fd.get("password") }) });
        state.user = data.user;
        go(state.user.role === "Factory" ? "/factory/dashboard" : "/admin/dashboard");
        return;
      }
      const licenseFile = $("#businessLicense")?.files?.[0];
      const businessLicenseBase64 = licenseFile ? await fileToUploadBase64(licenseFile, { compressImages: true, maxRawBytes: 4_000_000 }) : "";
      const data = await api("/api/register", { method: "POST", body: JSON.stringify({
          name: fd.get("name"),
          email: fd.get("registerEmail"),
          password: fd.get("registerPassword"),
          role: fd.get("role"),
          factoryId: fd.get("factoryId"),
          factoryName: fd.get("factoryName"),
          factoryContact: fd.get("factoryContact"),
          factoryPhone: fd.get("factoryPhone"),
          factoryWechat: fd.get("factoryWechat"),
          factoryAddress: fd.get("factoryAddress"),
          factoryMainProducts: fd.get("factoryMainProducts"),
          businessLicenseFileName: licenseFile?.name || "",
          businessLicenseBase64
        }) });
      alert(data.message || "注册申请已提交，请等待管理员审核");
      setMode("login");
    } catch (error) {
      alert(error.message);
    }
  });
}

function shell(content) {
  const isFactory = state.user.role === "Factory";
  const nav = isFactory ? navFactory : navAdmin;
  $("#app").innerHTML = `
    <div class="shell ${isFactory ? "factory-shell" : ""}">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-logo-box"><img src="/assets/wder-logo.jpg" alt="WDER Fitness Equipment"></div>
          <div><strong>跟单管理系统</strong><span>订单与工厂生产管理</span></div>
        </div>
        <div class="nav-section">${isFactory ? "工厂端" : "管理后台"}</div>
        ${nav.map(([href, label]) => navLinkHtml(href, label)).join("")}
        ${isFactory ? `
          <div class="factory-sidebar-notice">
            <strong>新采购单处理要求</strong>
            <p>收到新采购单后，请在 24 小时内确认交期并完善人民币单价。逾期未确认的采购单，系统将视为无法承接，公司有权取消或重新分配。</p>
          </div>
        ` : ""}
      </aside>
      <section class="main">
        <header class="topbar">
          <div><strong>${state.user.name}</strong><span class="tag blue" style="margin-left:8px">${roleLabel(state.user.role)}</span></div>
          <div class="topbar-actions">
            ${themeControlHtml()}
            <div class="notification-wrap">
              <button class="btn small notification-btn" id="notificationBtn" type="button">通知 <span id="notificationBadge" class="badge hidden">0</span></button>
              <div class="notification-menu hidden" id="notificationMenu">
                <div class="notification-menu-head">
                  <strong>通知中心</strong>
                  <button class="btn small" id="markAllNotificationsRead" type="button">全部已读</button>
                </div>
                <div id="notificationPreview" class="notification-list"><p class="muted">加载中...</p></div>
                <button class="btn small" id="openNotificationsPage" type="button">查看全部通知</button>
              </div>
            </div>
            <button class="btn small" id="logoutBtn">退出</button>
          </div>
        </header>
        <div class="global-announcement" id="globalAnnouncement">
          <strong>今日提醒</strong>
          <div class="announcement-marquee"><span id="announcementText">正在加载今日通告...</span></div>
        </div>
        <main class="page">${content}</main>
      </section>
    </div>`;
  $$("[data-link]").forEach((a) => a.addEventListener("click", (event) => {
    event.preventDefault();
    go(a.getAttribute("href"));
  }));
  $("#logoutBtn").addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    state.user = null;
    if (window.__navSummaryTimer) {
      clearInterval(window.__navSummaryTimer);
      window.__navSummaryTimer = null;
    }
    history.pushState(null, "", "/");
    renderLogin();
  });
  bindNotificationMenu();
  bindThemeControls();
  refreshNotifications();
  refreshNavSummary();
}

function navLinkHtml(href, label) {
  const key = href.includes("/delivery") ? "delivery" : href.includes("/notifications") ? "notifications" : href.includes("/chats") ? "chats" : "";
  const badgeId = key ? `navBadge-${key}` : "";
  return `<a class="nav-link ${pathNow() === href ? "active" : ""}" href="${href}" data-link>${label}${key ? `<span class="nav-badge hidden" id="${badgeId}">0</span>` : ""}<span>›</span></a>`;
}

function bindNotificationMenu() {
  $("#notificationBtn")?.addEventListener("click", async () => {
    $("#notificationMenu")?.classList.toggle("hidden");
    await refreshNotifications();
  });
  $("#markAllNotificationsRead")?.addEventListener("click", async () => {
    await api("/api/notifications", { method: "PATCH", body: JSON.stringify({ all: true }) });
    await refreshNotifications();
    await refreshNavSummary();
    if (pathNow().endsWith("/notifications")) renderNotificationsPage();
  });
  $("#openNotificationsPage")?.addEventListener("click", () => {
    go(state.user.role === "Factory" ? "/factory/notifications" : "/admin/notifications");
  });
  if (!window.__notificationOutsideClickBound) {
    window.__notificationOutsideClickBound = true;
    document.addEventListener("click", (event) => {
      const wrap = $(".notification-wrap");
      if (wrap && !wrap.contains(event.target)) $("#notificationMenu")?.classList.add("hidden");
    });
  }
}

async function refreshNotifications() {
  if (!state.user) return;
  try {
    const data = await api("/api/notifications?limit=8");
    state.notifications = data;
    updateNotificationBadges(data.unread);
    const preview = $("#notificationPreview");
    if (preview) preview.innerHTML = notificationListHtml(data.items || [], true);
    bindNotificationClicks();
  } catch {
    const preview = $("#notificationPreview");
    if (preview) preview.innerHTML = `<p class="muted">通知加载失败</p>`;
  }
}

async function refreshNavSummary() {
  if (!state.user) return;
  try {
    const data = await api("/api/nav-summary");
    state.navSummary = data;
    updateDeliveryNavBadge(data.deliveryDueTodayCount);
    updateNotificationBadges(data.unreadNotifications);
    updateChatNavBadge(data.unreadChats);
    updateGlobalAnnouncement(data);
    if (!window.__navSummaryTimer) {
      window.__navSummaryTimer = setInterval(() => {
        if (state.user) refreshNavSummary();
      }, 60_000);
    }
  } catch {
    updateGlobalAnnouncement({ deliveryDueToday: [], notifications: [] });
  }
}

function updateDeliveryNavBadge(count = 0) {
  const badge = $("#navBadge-delivery");
  if (!badge) return;
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.classList.toggle("hidden", !count);
}

function updateNotificationBadges(count = 0) {
  const value = count > 99 ? "99+" : String(count);
  ["#notificationBadge", "#navBadge-notifications"].forEach((selector) => {
    const badge = $(selector);
    if (!badge) return;
    badge.textContent = value;
    badge.classList.toggle("hidden", !count);
  });
}

function updateChatNavBadge(count = 0) {
  const badge = $("#navBadge-chats");
  if (!badge) return;
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.classList.toggle("hidden", !count);
}

function updateGlobalAnnouncement(data = {}) {
  const wrapper = $("#globalAnnouncement");
  const target = $("#announcementText");
  if (!target) return;
  const dueOrders = data.deliveryDueToday || [];
  const notifications = data.notifications || [];
  wrapper?.classList.remove("ready");
  if (dueOrders.length) {
    target.textContent = `今日需发货 ${dueOrders.length} 单：${dueOrders.map((order) => `${order.poNo}${order.factoryName ? `（${order.factoryName}）` : ""}`).join("、")}`;
    requestAnimationFrame(() => wrapper?.classList.add("ready"));
    return;
  }
  if (notifications.length) {
    target.textContent = notifications.map((item) => `${item.title}：${item.message}`).join("　|　");
    requestAnimationFrame(() => wrapper?.classList.add("ready"));
    return;
  }
  target.textContent = "今日暂无到期发货订单，通知中心暂无未读消息。";
  requestAnimationFrame(() => wrapper?.classList.add("ready"));
}

async function renderNotificationsPage() {
  shell(pageTitle("通知中心", "按当前账号权限显示订单相关通知。", `<button class="btn" id="readAllOnPage">全部标记已读</button>`) + `<section class="panel"><div id="notificationPageList">加载中...</div></section>`);
  const data = await api("/api/notifications?limit=100");
  state.notifications = data;
  $("#notificationPageList").innerHTML = notificationListHtml(data.items || [], false);
  $("#readAllOnPage")?.addEventListener("click", async () => {
    await api("/api/notifications", { method: "PATCH", body: JSON.stringify({ all: true }) });
    await renderNotificationsPage();
  });
  bindNotificationClicks();
  updateNotificationBadges(data.unread);
  refreshNavSummary();
}

function notificationListHtml(items = [], compact = false) {
  if (!items.length) return `<p class="muted">暂无通知</p>`;
  return items.map((item) => `
    <button class="notification-item ${item.unread ? "unread" : ""}" data-notification-id="${item.id}" data-entity-type="${escapeAttr(item.entityType || "")}" data-entity-id="${escapeAttr(item.entityId || "")}">
      <span class="notification-dot ${item.unread ? "" : "read"}"></span>
      <span>
        <strong>${displayValue(item.title)}</strong>
        <em>${displayValue(item.message)}</em>
        <small>${displayValue(item.createdAt)}${item.orderNo ? ` · 单号 ${displayValue(item.orderNo)}` : ""}</small>
      </span>
    </button>`).join(compact ? "" : "");
}

function bindNotificationClicks() {
  $$("[data-notification-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.notificationId;
      await api(`/api/notifications/${id}`, { method: "PATCH", body: JSON.stringify({ ids: [id] }) });
      const type = button.dataset.entityType;
      const entityId = button.dataset.entityId;
      if (type === "sales_order" && entityId) return go(`/admin/orders/${entityId}`);
      if (type === "purchase_order" && entityId) return go(state.user.role === "Factory" ? `/factory/orders/${entityId}` : `/admin/purchase-orders/${entityId}`);
      await refreshNotifications();
      await refreshNavSummary();
    });
  });
}

async function render() {
  if (!state.user) {
    const session = await api("/api/session");
    state.user = session.user;
    state.orderStatuses = session.orderStatuses || [];
    state.purchaseProductionStatuses = session.purchaseProductionStatuses || [];
    state.statusZh = session.statusZh || {};
    state.roles = session.roles || [];
    state.factories = session.factories || [];
    if (!state.user) return renderLogin();
  }
  const path = pathNow();
  if (state.user.role === "Factory" && !path.startsWith("/factory")) return go("/factory/dashboard");
  if (path === "/admin/dashboard" || path === "/factory/dashboard") return renderDashboard();
  if (path === "/admin/notifications" || path === "/factory/notifications") return renderNotificationsPage();
  if (path === "/admin/chats" || path === "/factory/chats") return renderChatsPage();
  if (path === "/admin/delivery" || path === "/factory/delivery") return renderDeliveryManagement();
  if (path === "/admin/orders" || path === "/admin/sales-orders") return renderSalesOrders();
  if (path === "/admin/orders/new") return renderNewSalesOrder();
  if (path.startsWith("/admin/orders/")) return renderSalesOrderDetail(path.split("/").pop());
  if (path === "/admin/purchase-orders/new") return renderNewPurchaseOrder();
  if (path === "/admin/purchase-orders" || path === "/factory/orders") return renderPurchaseOrders();
  if (path.startsWith("/admin/purchase-orders/")) return renderPurchaseOrderDetail(path.split("/").pop());
  if (path.startsWith("/factory/orders/")) return renderPurchaseOrderDetail(path.split("/").pop());
  if (path === "/admin/customers") return renderCrud("customers", "客户管理", customerFields());
  if (path === "/admin/factories") return renderCrud("factories", "工厂管理", factoryFields());
  if (path === "/admin/products") return renderCrud("products", "产品管理", productFields());
  if (path === "/admin/qc") return renderQc();
  if (path === "/admin/payments") return renderPayments();
  if (path === "/admin/reports") return renderReports();
  if (path === "/admin/settings") return renderSettings();
  return go(state.user.role === "Factory" ? "/factory/dashboard" : "/admin/dashboard");
}

async function renderDashboard() {
  const dashboardAction = state.user.role === "Factory" ? `<button class="btn primary" data-go="/factory/delivery">进入交期管理</button>` : `<button class="btn primary" data-go="/admin/delivery">进入交期管理</button>`;
  shell(pageTitle("首页看板", "订单进度、付款、质检、延期与工厂更新集中查看。", dashboardAction) + `<div id="dashboard">加载中...</div>`);
  bindGoButtons();
  const data = await api("/api/dashboard");
  const factoryMode = data.mode === "factory" || state.user.role === "Factory";
  const cards = factoryMode
    ? [
        ["我的采购单数量", data.cards.totalOrders],
        ["进行中采购单", data.cards.inProgress],
        ["待确认采购单", data.cards.factoryPending],
        ["生产中采购单", data.cards.producing],
        ["待质检采购单", data.cards.qcPending],
        ["待发货采购单", data.cards.readyToShip],
        ["已发货采购单", data.cards.shipped],
        ["采购总金额（CNY）", moneyCny(data.cards.purchaseTotalCny)],
        ["本月采购金额（CNY）", moneyCny(data.cards.monthPurchaseCny)],
        ["提醒数量", data.reminders.length]
      ]
    : [
        ["总订单数量", data.cards.totalOrders],
        ["进行中订单", data.cards.inProgress],
        ["待工厂确认", data.cards.factoryPending],
        ["生产中订单", data.cards.producing],
        ["待质检订单", data.cards.qcPending],
        ["待收尾款", data.cards.balancePending],
        ["待发货", data.cards.readyToShip],
        ["已发货", data.cards.shipped],
        ["本月销售额", moneyUsd(data.cards.monthSales)],
        ["本月采购成本", data.cards.monthPurchase == null ? "无权限" : moneyCny(data.cards.monthPurchase)],
        ["本月预估利润", data.cards.monthProfit == null ? "无权限" : moneyUsd(data.cards.monthProfit)],
        ["提醒数量", data.reminders.length]
      ];
  const recentTable = factoryMode
    ? simpleTable(data.recentOrders, ["poNo", "productionStatus", "qcStatus", "factoryDeliveryDate", "purchaseTotalCny"], ["采购单号", "生产状态", "质检", "工厂交期", "采购金额（CNY）"], (row, key) => key === "purchaseTotalCny" ? moneyCny(row[key]) : displayValue(row[key]))
    : simpleTable(data.recentOrders, ["poNo", "factoryName", "productionStatus", "factoryPaymentStatus", "factoryDeliveryDate"], ["采购单号", "工厂", "生产状态", "工厂付款", "工厂交期"]);
  const reminderHtml = data.reminders.map((r) => `<div class="timeline-item reminder-item ${reminderSeverityClass(r.severity)}"><strong>${r.title}</strong><span>${severityLabel(r.severity)} · ${formatChinaDate(r.createdAt)}</span></div>`).join("") || `<p class="muted">暂无提醒</p>`;
  const hasManyReminders = data.reminders.length > 4;
  $("#dashboard").innerHTML = `
    <section class="grid cards">${cards.map(([label, value]) => `<div class="card"><div class="label">${label}</div><div class="value">${value}</div></div>`).join("")}</section>
    <section class="split">
      <div class="panel">
        <div class="panel-title-row">
          <h2>${factoryMode ? "最近需要处理的采购单" : "最近需要处理的工厂采购单"}</h2>
          <button class="btn small" id="toggleDashboardRecentOrders" type="button">更多</button>
        </div>
        <div class="dashboard-scroll dashboard-table-scroll" data-auto-scroll data-seamless-scroll>${recentTable}</div>
      </div>
      <div class="panel">
        <div class="panel-title-row">
          <h2>延期与待办提醒</h2>
          ${hasManyReminders ? `<button class="btn small" id="toggleDashboardReminders" type="button">更多</button>` : ""}
        </div>
        <div class="dashboard-scroll dashboard-reminder-scroll" data-auto-scroll data-seamless-scroll>
          <div class="timeline">${reminderHtml}</div>
        </div>
      </div>
    </section>
    <section class="panel" style="margin-top:14px">
      <div class="panel-title-row">
        <h2>最近工厂更新记录</h2>
        <button class="btn small" data-go="${factoryMode ? "/factory/notifications" : "/admin/notifications"}">更多</button>
      </div>
      <div class="dashboard-scroll dashboard-factory-updates-scroll" data-auto-scroll>
        ${simpleTable(data.recentFactoryUpdates, ["actorName", "oldStatus", "newStatus", "note", "createdAt"], ["操作人", "原状态", "新状态", "备注", "时间"], (row, key) => key === "createdAt" ? formatChinaDateTime(row[key]) : displayValue(row[key]))}
      </div>
    </section>`;
  bindDashboardAutoScroll();
  bindGoButtons();
  bindDashboardReminderToggle();
  bindDashboardRecentOrdersToggle();
}

function bindDashboardAutoScroll() {
  state.dashboardScrollTimers.forEach((timer) => clearInterval(timer));
  state.dashboardScrollTimers = [];
  $$("[data-auto-scroll]").forEach((container) => {
    if (container.scrollHeight <= container.clientHeight + 2) return;
    let loopHeight = 0;
    if (container.dataset.seamlessScroll !== undefined) {
      const content = container.firstElementChild;
      const body = content?.matches(".table-wrap") ? content.querySelector("tbody") : content;
      if (content && body && body.children.length > 1) {
        content.dataset.originalHtml = content.innerHTML;
        body.insertAdjacentHTML("beforeend", body.innerHTML);
        loopHeight = Math.ceil(content.scrollHeight / 2);
      }
    }
    let paused = false;
    container.addEventListener("mouseenter", () => { paused = true; });
    container.addEventListener("mouseleave", () => { paused = false; });
    const timer = setInterval(() => {
      if (paused || container.classList.contains("expanded")) return;
      if (loopHeight && container.scrollTop >= loopHeight) {
        container.scrollTop = 0;
      }
      if (container.scrollTop >= container.scrollHeight - container.clientHeight - 1) {
        container.scrollTop = 0;
        return;
      }
      container.scrollTop += 1;
    }, 70);
    state.dashboardScrollTimers.push(timer);
  });
}

function toggleDashboardScrollPanel(button, selector) {
  const container = $(selector);
  const content = container?.firstElementChild;
  if (!container || !content) return;
  container.classList.toggle("expanded");
  if (container.classList.contains("expanded")) {
    content.innerHTML = content.dataset.originalHtml || content.innerHTML;
    container.scrollTop = 0;
    button.textContent = "收起";
    return;
  }
  button.textContent = "更多";
  const body = content.matches(".table-wrap") ? content.querySelector("tbody") : content;
  if (body && content.dataset.originalHtml) {
    content.innerHTML = content.dataset.originalHtml;
    const restoredBody = content.matches(".table-wrap") ? content.querySelector("tbody") : content;
    restoredBody?.insertAdjacentHTML("beforeend", restoredBody.innerHTML);
  }
}

function bindDashboardRecentOrdersToggle() {
  $("#toggleDashboardRecentOrders")?.addEventListener("click", (event) => {
    const container = $(".dashboard-table-scroll");
    if (!container || container.scrollHeight <= container.clientHeight + 2) {
      go(state.user.role === "Factory" ? "/factory/orders" : "/admin/orders");
      return;
    }
    toggleDashboardScrollPanel(event.currentTarget, ".dashboard-table-scroll");
  });
}

function bindDashboardReminderToggle() {
  $("#toggleDashboardReminders")?.addEventListener("click", (event) => {
    toggleDashboardScrollPanel(event.currentTarget, ".dashboard-reminder-scroll");
  });
}

function pageTitle(title, desc, action = "") {
  return `<div class="page-title"><div><h1>${title}</h1><p>${desc}</p></div><div>${action}</div></div>`;
}

async function renderSalesOrders() {
  shell(pageTitle("客户订单", "记录客户销售价格，并与工厂采购价分开管理。", `<button class="btn" id="showImportOrder">导入客户订单 PDF</button> <button class="btn primary" data-go="/admin/orders/new">新建订单</button>`) + importSalesOrderPanel() + listShell("sales-orders"));
  bindGoButtons();
  bindSalesOrderImport();
  await loadSalesOrders();
}

function importSalesOrderPanel() {
  return `
    <section class="panel hidden" id="importOrderPanel">
      <h2>导入客户订单 PDF</h2>
      <div class="toolbar">
        <div class="filters">
          <input class="input" type="file" id="salesOrderPdf" accept="application/pdf,.pdf">
        </div>
        <button class="btn primary" id="importSalesOrderPdf">识别并生成客户订单</button>
      </div>
      <p class="muted">系统会识别客户、地址、贸易条款、运费、总金额和产品明细；产品名称会保存为中文 / English。</p>
      <div id="importOrderResult"></div>
    </section>`;
}

function bindSalesOrderImport() {
  $("#showImportOrder")?.addEventListener("click", () => {
    $("#importOrderPanel")?.classList.toggle("hidden");
  });
  $("#importSalesOrderPdf")?.addEventListener("click", async () => {
    const file = $("#salesOrderPdf").files[0];
    if (!file) return alert("请选择客户订单 PDF");
    $("#importOrderResult").innerHTML = `<p class="notice">正在上传并识别 PDF，请稍候...</p>`;
    try {
      const result = await importSalesOrderPdfFile(file);
      $("#importOrderResult").innerHTML = `<p class="notice">已识别 ${result.parsed.itemCount} 条产品明细，订单号 ${result.order.orderNo}。</p>`;
      go(`/admin/orders/${result.order.id}`);
    } catch (error) {
      $("#importOrderResult").innerHTML = `<p class="notice">导入失败：${error.message}</p>`;
    }
  });
}

async function importSalesOrderPdfFile(file) {
  try {
    const upload = await api("/api/blob-upload-url", {
      method: "POST",
      body: JSON.stringify({ fileName: file.name, contentType: file.type || "application/pdf" })
    });
    const uploaded = await fetch(upload.presignedUrl, {
      method: "PUT",
      headers: { "content-type": file.type || "application/pdf" },
      body: file
    });
    if (!uploaded.ok) throw new Error(`PDF 上传失败：${uploaded.status}`);
    const uploadedData = await uploaded.json().catch(() => ({}));
    return api("/api/import-sales-order", {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        blobUrl: uploadedData.url || "",
        blobPath: uploadedData.pathname || upload.pathname
      })
    });
  } catch (error) {
    if (file.size > 4_000_000) throw error;
    return api("/api/import-sales-order", {
      method: "POST",
      body: JSON.stringify({ fileName: file.name, contentBase64: await toBase64(file) })
    });
  }
}

async function loadSalesOrders() {
  const params = listParams("sales-orders");
  const data = await api(`/api/sales-orders?${params}`);
  data.scope = "sales-ordersPage";
  $("#listBody").innerHTML = `
    ${simpleTable(data.items, ["orderNo", "customerCompany", "statusZh", "paymentStatus", "expectedDeliveryDate", "actions"], ["订单号", "客户", "状态", "付款", "预计交期", "操作"], (row, key) => {
      if (key === "statusZh") return tag(row.statusZh, row.status);
      if (key === "actions") return `<button class="btn small" data-go="/admin/orders/${row.id}">快速查看</button>${state.user.role === "Admin" ? ` <button class="btn small danger" data-delete-sales-order="${row.id}" data-order-no="${row.orderNo}">归档</button>` : ""}`;
      return displayValue(row[key]);
    })}
    ${pager(data, loadSalesOrders)}`;
  bindGoButtons();
  bindSalesOrderDeleteButtons();
}

async function renderPurchaseOrders() {
  const factory = state.user.role === "Factory";
  shell(pageTitle(factory ? "我的采购订单" : "工厂采购订单", factory ? "这里只显示分配给当前工厂的采购订单，不显示客户资料、客户售价和利润。" : "管理工厂生产进度、确认、质检、付款和发货准备。", factory ? "" : `<button class="btn primary" data-go="/admin/purchase-orders/new">新建采购单</button>`) + listShell("purchase-orders"));
  bindGoButtons();
  await loadPurchaseOrders();
}

async function loadPurchaseOrders() {
  const data = await api(`/api/purchase-orders?${listParams("purchase-orders")}`);
  data.scope = "purchase-ordersPage";
  $("#listBody").innerHTML = `
    ${simpleTable(data.items, ["poNo", "factoryName", "productionStatus", "qcStatus", "factoryPaymentStatus", "factoryDeliveryDate", "purchaseTotalCny", "actions"], ["采购单号", "工厂", "生产状态", "质检", "工厂付款", "工厂交期", "采购金额（CNY）", "操作"], (row, key) => {
      if (["productionStatus", "qcStatus", "factoryPaymentStatus"].includes(key)) return tag(row[key], row[key]);
      if (key === "purchaseTotalCny") return moneyCny(row[key]);
      if (key === "actions") return `<button class="btn small" data-po="${row.id}">快速查看</button> <button class="btn small" data-chat-po="${row.id}">留言</button>${state.user.role === "Admin" ? ` <button class="btn small danger" data-delete-purchase-order="${row.id}" data-order-no="${row.poNo}">归档</button>` : ""}`;
      return displayValue(row[key]);
    })}
    ${pager(data, loadPurchaseOrders)}`;
  $$("[data-po]").forEach((btn) => btn.addEventListener("click", () => {
    if (state.user.role === "Factory") go(`/factory/orders/${btn.dataset.po}`);
    else renderPurchaseOrderModal(btn.dataset.po);
  }));
  $$("[data-chat-po]").forEach((btn) => btn.addEventListener("click", () => renderChatsPage(btn.dataset.chatPo)));
  bindPurchaseOrderDeleteButtons();
}

async function renderChatsPage(selectedPurchaseOrderId = "") {
  const factoryMode = state.user.role === "Factory";
  shell(pageTitle("订单沟通", factoryMode ? "按采购单与贸易公司沟通交期、价格、生产、质检和发货问题。" : "按采购单与对应工厂沟通交期、价格、生产、质检和发货问题。") + `
    <section class="panel chat-page-panel">
      <div class="chat-layout">
        <div class="chat-thread-list" id="chatThreadList">加载中...</div>
        <div class="chat-panel" id="chatPanel">请选择一个采购单开始沟通。</div>
      </div>
    </section>`);
  await loadChatThreads(selectedPurchaseOrderId);
}

async function loadChatThreads(selectedPurchaseOrderId = "") {
  const data = await api("/api/chats");
  const threads = data.threads || [];
  const activeId = selectedPurchaseOrderId || threads[0]?.purchaseOrderId || "";
  $("#chatThreadList").innerHTML = threads.length
    ? threads.map((thread) => chatThreadHtml(thread, activeId)).join("")
    : `<p class="muted">暂无可沟通的采购单</p>`;
  $$("[data-open-chat]").forEach((btn) => btn.addEventListener("click", () => loadChatThreads(btn.dataset.openChat)));
  if (activeId) await loadChatMessages(activeId);
  else $("#chatPanel").innerHTML = `<p class="muted">暂无采购单</p>`;
  updateChatNavBadge(data.unread || 0);
}

function chatThreadHtml(thread, activeId) {
  return `<button class="chat-thread ${thread.purchaseOrderId === activeId ? "active" : ""}" type="button" data-open-chat="${thread.purchaseOrderId}">
    <strong>${escapeHtml(thread.poNo || "未命名采购单")}${thread.unread ? `<span class="nav-badge">${thread.unread > 99 ? "99+" : thread.unread}</span>` : ""}</strong>
    <span>${escapeHtml(thread.factoryName || "未绑定工厂")} · ${statusLabel(thread.productionStatus)}</span>
    <small>${thread.lastMessage ? escapeHtml(thread.lastMessage) : "暂无留言"}${thread.lastMessageAt ? ` · ${formatChinaDateTime(thread.lastMessageAt)}` : ""}</small>
  </button>`;
}

async function loadChatMessages(purchaseOrderId) {
  const data = await api(`/api/chats?purchaseOrderId=${encodeURIComponent(purchaseOrderId)}`);
  $("#chatPanel").innerHTML = chatPanelHtml(data.thread, data.messages || []);
  bindChatComposer(purchaseOrderId);
  updateChatNavBadge(data.unread || 0);
  refreshNavSummary();
  const body = $(".chat-messages");
  if (body) body.scrollTop = body.scrollHeight;
}

function chatPanelHtml(thread, messages) {
  if (!thread) return `<p class="muted">采购单不存在或无权限查看。</p>`;
  return `
    <div class="chat-panel-head">
      <div>
        <h2>${escapeHtml(thread.poNo)}</h2>
        <p>${escapeHtml(thread.factoryName || "工厂")} · 交期 ${escapeHtml(thread.factoryDeliveryDate || "-")}</p>
      </div>
      <button class="btn small" data-po="${thread.purchaseOrderId}">查看订单</button>
    </div>
    <div class="chat-messages">
      ${messages.length ? messages.map(chatMessageHtml).join("") : `<p class="muted">暂无留言，输入内容后可与对方沟通。</p>`}
    </div>
    <form class="chat-compose" id="chatCompose">
      <div class="chat-compose-main">
        <textarea class="input" id="chatMessageInput" rows="3" maxlength="1000" placeholder="输入留言，例如：请确认交期、单价、包装方式或质检问题。"></textarea>
        <div class="chat-attachment-list muted" id="chatAttachmentList">未选择附件</div>
      </div>
      <div class="chat-compose-actions">
        <label class="btn small chat-attach-btn">
          添加附件
          <input id="chatAttachmentInput" type="file" multiple accept="image/*,application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.svg,.tif,.tiff,.heic,.heif">
        </label>
        <button class="btn primary" id="chatSendButton" type="submit">发送留言</button>
      </div>
    </form>`;
}

function chatMessageHtml(message) {
  const own = message.authorId === state.user.id;
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  return `<div class="chat-message ${own ? "own" : ""}">
    <div class="chat-bubble">
      <div class="chat-meta">${escapeHtml(message.authorName || "用户")} · ${roleLabel(message.authorRole)} · ${formatChinaDateTime(message.createdAt)}</div>
      ${message.message ? `<div class="chat-text">${escapeHtml(message.message || "")}</div>` : ""}
      ${attachments.length ? `<div class="chat-attachments">${attachments.map(chatAttachmentHtml).join("")}</div>` : ""}
    </div>
  </div>`;
}

function isImageFile(file) {
  return Boolean(file?.isImage || String(file?.contentType || "").startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|svg|tiff?|heic|heif)$/i.test(file?.fileName || ""));
}

function chatAttachmentHtml(file) {
  const name = escapeHtml(file.fileName || "附件");
  const url = escapeAttr(file.downloadUrl || "#");
  if (isImageFile(file)) {
    return `<a class="chat-attachment-card image" href="${url}" download>
      <img src="${url}?preview=1" alt="${name}" loading="lazy">
      <span>${name}</span>
    </a>`;
  }
  return `<a class="chat-attachment-card file" href="${url}" download>
    <strong>PDF</strong>
    <span>${name}</span>
  </a>`;
}

function bindChatComposer(purchaseOrderId) {
  let selectedFiles = [];
  const fileInput = $("#chatAttachmentInput");
  const attachmentList = $("#chatAttachmentList");
  const sendButton = $("#chatSendButton");

  const renderSelectedFiles = () => {
    if (!attachmentList) return;
    if (!selectedFiles.length) {
      attachmentList.classList.add("muted");
      attachmentList.innerHTML = "未选择附件";
      return;
    }
    attachmentList.classList.remove("muted");
    attachmentList.innerHTML = selectedFiles.map((file, index) => `
      <span class="chat-attachment-chip">
        ${escapeHtml(file.name)}
        <button type="button" data-remove-chat-file="${index}" aria-label="移除附件 ${escapeAttr(file.name)}">×</button>
      </span>
    `).join("");
    $$("[data-remove-chat-file]", attachmentList).forEach((btn) => btn.addEventListener("click", () => {
      selectedFiles.splice(Number(btn.dataset.removeChatFile), 1);
      renderSelectedFiles();
    }));
  };

  fileInput?.addEventListener("change", () => {
    selectedFiles = [...selectedFiles, ...Array.from(fileInput.files || [])].slice(0, 6);
    fileInput.value = "";
    renderSelectedFiles();
  });

  $("#chatCompose")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = $("#chatMessageInput");
    const message = String(input?.value || "").trim();
    if (!message && !selectedFiles.length) return alert("请输入留言内容或选择附件");
    try {
      if (sendButton) {
        sendButton.disabled = true;
        sendButton.textContent = "发送中...";
      }
      const attachments = [];
      for (const file of selectedFiles) {
        const isAllowed = file.type === "application/pdf" || file.type.startsWith("image/") || /\.(pdf|jpe?g|png|webp|gif|bmp|svg|tiff?|heic|heif)$/i.test(file.name);
        if (!isAllowed) throw new Error("留言附件仅支持 PDF 和图片格式");
        const canCompress = /^image\/(jpeg|jpg|png|webp|bmp)$/i.test(file.type);
        const contentBase64 = await fileToUploadBase64(file, { compressImages: canCompress, maxRawBytes: 8_000_000 });
        attachments.push({ fileName: file.name, contentType: file.type || "application/octet-stream", contentBase64 });
      }
      await api("/api/chats", {
        method: "POST",
        body: JSON.stringify({ purchaseOrderId, message, attachments })
      });
      input.value = "";
      selectedFiles = [];
      renderSelectedFiles();
      await loadChatMessages(purchaseOrderId);
    } catch (error) {
      alert(error.message || "发送失败");
    } finally {
      if (sendButton) {
        sendButton.disabled = false;
        sendButton.textContent = "发送留言";
      }
    }
  });
  $$("[data-po]", $("#chatPanel")).forEach((btn) => btn.addEventListener("click", () => {
    if (state.user.role === "Factory") return go(`/factory/orders/${btn.dataset.po}`);
    return renderPurchaseOrderModal(btn.dataset.po);
  }));
}

async function renderDeliveryManagement() {
  const factoryMode = state.user.role === "Factory";
  shell(pageTitle("交期管理", factoryMode ? "查看本厂采购单交期；如需调整交期，请提交申请，管理员审核通过后正式生效。" : "集中查看每个采购单交期；临近交期自动颜色提醒，并可快速标记发货或调整交期。") + `
    <section class="panel">
      <div class="toolbar">
        <div class="filters">
          <input class="input" id="deliverySearch" placeholder="搜索采购单号、工厂、状态">
          <select class="select" id="deliveryStatus">
            <option value="">全部交期</option>
            <option value="red">今天到期 / 已逾期</option>
            <option value="yellow">剩余 2 天</option>
            <option value="blue">剩余 3 天</option>
            <option value="green">已处理</option>
          </select>
        </div>
        <button class="btn" id="refreshDelivery">刷新</button>
      </div>
      <div id="deliveryRequests"></div>
      <div id="deliveryBoard">加载中...</div>
    </section>`);
  $("#deliverySearch")?.addEventListener("input", debounce(loadDeliveryBoard, 250));
  $("#deliveryStatus")?.addEventListener("change", loadDeliveryBoard);
  $("#refreshDelivery")?.addEventListener("click", loadDeliveryBoard);
  await loadDeliveryBoard();
}

async function loadDeliveryBoard() {
  const factoryMode = state.user.role === "Factory";
  const [data, requestsData] = await Promise.all([
    api("/api/purchase-orders?sort=factoryDeliveryDate&dir=asc&page=1&pageSize=50"),
    api("/api/delivery-change-requests?status=Pending")
  ]);
  const q = String($("#deliverySearch")?.value || "").trim().toLowerCase();
  const status = $("#deliveryStatus")?.value || "";
  let rows = data.items || [];
  if (q) {
    rows = rows.filter((row) => [row.poNo, row.salesOrderNumber, row.factoryName, row.productionStatus, row.qcStatus, row.factoryDeliveryDate]
      .some((value) => String(value || "").toLowerCase().includes(q)));
  }
  if (status) rows = rows.filter((row) => deliveryAlert(row).color === status);
  $("#deliveryRequests").innerHTML = renderDeliveryRequests(requestsData.items || [], factoryMode);
  $("#deliveryBoard").innerHTML = `
    <div class="delivery-legend">
      <span>${deliveryBadge("blue", "剩余 3 天")}</span>
      <span>${deliveryBadge("yellow", "剩余 2 天")}</span>
      <span>${deliveryBadge("red", "当天 / 已逾期")}</span>
      <span>${deliveryBadge("green", "已处理")}</span>
    </div>
    ${simpleTable(rows, ["poNo", "factoryName", "factoryDeliveryDate", "daysLeft", "productionStatus", "qcStatus", "purchaseTotalCny", "actions"], ["采购单号", "工厂", "交期", "提醒", "生产状态", "质检", "金额（CNY）", "操作"], (row, key) => {
      const alert = deliveryAlert(row);
      if (key === "poNo") return `<strong>${displayValue(row.poNo)}</strong><div class="muted">${displayValue(row.salesOrderNumber)}</div>`;
      if (key === "factoryDeliveryDate") return `<span class="delivery-date ${alert.color}">${displayValue(row.factoryDeliveryDate)}</span>${row.pendingDeliveryChange ? `<div class="delivery-pending">待审核：${displayValue(row.pendingDeliveryChange.requestedDate)}</div>` : ""}`;
      if (key === "daysLeft") return deliveryBadge(alert.color, alert.text);
      if (["productionStatus", "qcStatus"].includes(key)) return tag(row[key], row[key]);
      if (key === "purchaseTotalCny") return moneyCny(row[key]);
      if (key === "actions") return `
        <div class="delivery-actions">
          <button class="btn small primary" data-delivery-ship="${row.id}">已按时发货</button>
          <span class="delivery-adjust">
            <input class="input" type="date" value="${escapeAttr(row.factoryDeliveryDate || "")}" data-delivery-date="${row.id}">
            <button class="btn small" data-delivery-adjust="${row.id}">${factoryMode ? "提交交期申请" : "调整交期"}</button>
          </span>
          <button class="btn small" data-po="${row.id}">查看</button>
        </div>`;
      return displayValue(row[key]);
    })}`;
  bindDeliveryActions();
}

function renderDeliveryRequests(requests = [], factoryMode = false) {
  if (!requests.length) return `<div class="delivery-request-panel"><p class="muted">${factoryMode ? "暂无待审核交期申请" : "暂无需要审核的交期申请"}</p></div>`;
  const keys = factoryMode
    ? ["poNo", "currentDeliveryDate", "requestedDate", "status", "createdAt", "note"]
    : ["poNo", "factoryName", "currentDeliveryDate", "requestedDate", "requestedByName", "createdAt", "actions"];
  const labels = factoryMode
    ? ["采购单号", "当前正式交期", "申请交期", "审核状态", "提交时间", "备注"]
    : ["采购单号", "工厂", "当前正式交期", "申请交期", "申请人", "提交时间", "审核"];
  return `<div class="delivery-request-panel">
    <h2>${factoryMode ? "我的待审核交期申请" : "待审核交期申请"}</h2>
    ${simpleTable(requests, keys, labels, (row, key) => {
      if (key === "status") return tag(statusLabel(row.status), row.status);
      if (key === "actions") return `<button class="btn small primary" data-delivery-approve="${row.id}">通过</button> <button class="btn small danger" data-delivery-reject="${row.id}">拒绝</button>`;
      return displayValue(row[key]);
    })}
  </div>`;
}

function bindDeliveryActions() {
  $$("[data-delivery-ship]").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm("确认该采购单已按时发货吗？系统会记录到时间线。")) return;
    await api(`/api/purchase-orders/${btn.dataset.deliveryShip}`, {
      method: "PATCH",
      body: JSON.stringify({
        productionStatus: "Production Completed",
        factoryConfirmStatus: "Confirmed",
        note: "已按时发货"
      })
    });
    alert("已保存：该采购单已标记为按时发货");
    await loadDeliveryBoard();
  }));
  $$("[data-delivery-adjust]").forEach((btn) => btn.addEventListener("click", async () => {
    const id = btn.dataset.deliveryAdjust;
    const date = $(`[data-delivery-date="${id}"]`)?.value;
    if (!date) return alert("请先选择新的交期");
    await api(`/api/purchase-orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ factoryDeliveryDate: date, note: "交期管理页面调整交期" })
    });
    alert(state.user.role === "Factory" ? "已提交交期调整申请，等待管理员审核通过后生效" : "保存成功：交期已调整");
    await loadDeliveryBoard();
  }));
  $$("[data-delivery-approve]").forEach((btn) => btn.addEventListener("click", async () => {
    await api(`/api/delivery-change-requests/${btn.dataset.deliveryApprove}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "Approved" })
    });
    alert("审核通过：交期已正式生效");
    await loadDeliveryBoard();
  }));
  $$("[data-delivery-reject]").forEach((btn) => btn.addEventListener("click", async () => {
    const note = prompt("请输入拒绝原因（可选）", "");
    if (note === null) return;
    await api(`/api/delivery-change-requests/${btn.dataset.deliveryReject}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "Rejected", note })
    });
    alert("已拒绝该交期调整申请");
    await loadDeliveryBoard();
  }));
  $$("[data-po]").forEach((btn) => btn.addEventListener("click", () => {
    if (state.user.role === "Factory") return go(`/factory/orders/${btn.dataset.po}`);
    return renderPurchaseOrderModal(btn.dataset.po);
  }));
}

function deliveryAlert(row) {
  if (["Production Completed", "Shipped", "Delivered", "Closed"].includes(row.productionStatus)) return { color: "green", text: "已处理" };
  const days = daysUntilChinaDate(row.factoryDeliveryDate);
  if (days === null) return { color: "neutral", text: "未设置交期" };
  if (days <= 0) return { color: "red", text: days < 0 ? `已逾期 ${Math.abs(days)} 天` : "今天到期" };
  if (days === 2) return { color: "yellow", text: "剩余 2 天" };
  if (days === 3) return { color: "blue", text: "剩余 3 天" };
  return { color: "neutral", text: `剩余 ${days} 天` };
}

function daysUntilChinaDate(dateValue) {
  if (!dateValue) return null;
  const date = String(dateValue).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const todayDate = formatChinaDate(new Date());
  const target = new Date(`${date}T00:00:00+08:00`);
  const todayStart = new Date(`${todayDate}T00:00:00+08:00`);
  return Math.round((target - todayStart) / 86400000);
}

function deliveryBadge(color, text) {
  return `<span class="delivery-badge ${color}">${displayValue(text)}</span>`;
}

function listShell(kind) {
  return `
    <section class="panel">
      <div class="toolbar">
        <div class="filters">
          <input class="input" id="searchBox" placeholder="搜索订单号、客户、工厂、状态">
          <select class="select" id="sortBox">
            <option value="createdAt">按创建时间</option>
            <option value="orderNo">按订单号</option>
            <option value="poNo">按PO号</option>
            <option value="expectedDeliveryDate">按交期</option>
          </select>
          <select class="select" id="dirBox"><option value="desc">降序</option><option value="asc">升序</option></select>
        </div>
        <button class="btn" id="refreshBtn">刷新</button>
      </div>
      <div id="listBody"></div>
    </section>`;
}

function listParams(prefix) {
  const page = state[`${prefix}Page`] || 1;
  const q = encodeURIComponent($("#searchBox")?.value || "");
  const sort = $("#sortBox")?.value || "createdAt";
  const dir = $("#dirBox")?.value || "desc";
  setTimeout(() => {
    $("#searchBox")?.addEventListener("input", debounce(() => { state[`${prefix}Page`] = 1; prefix === "sales-orders" ? loadSalesOrders() : loadPurchaseOrders(); }, 250));
    $("#sortBox")?.addEventListener("change", () => prefix === "sales-orders" ? loadSalesOrders() : loadPurchaseOrders());
    $("#dirBox")?.addEventListener("change", () => prefix === "sales-orders" ? loadSalesOrders() : loadPurchaseOrders());
    $("#refreshBtn")?.addEventListener("click", () => prefix === "sales-orders" ? loadSalesOrders() : loadPurchaseOrders());
  });
  return `q=${q}&sort=${sort}&dir=${dir}&page=${page}&pageSize=10`;
}

function pager(data, reload) {
  setTimeout(() => {
    $$(".pager-btn").forEach((btn) => btn.addEventListener("click", () => {
      state[btn.dataset.scope] = Number(btn.dataset.page);
      reload();
    }));
  });
  const scope = data.scope || "sales-ordersPage";
  return `<div class="toolbar" style="margin-top:12px"><span class="muted">共 ${data.total} 条，第 ${data.page}/${data.pages} 页</span><div><button class="btn small pager-btn" data-scope="${scope}" data-page="${Math.max(1, data.page - 1)}">上一页</button> <button class="btn small pager-btn" data-scope="${scope}" data-page="${Math.min(data.pages, data.page + 1)}">下一页</button></div></div>`;
}

async function renderNewSalesOrder() {
  const [customers, products] = await Promise.all([api("/api/customers?pageSize=50"), api("/api/products?pageSize=50")]);
  const productOptions = products.items.map((p) => `<option value="${p.id}" data-name="${escapeAttr(p.name)}" data-model="${escapeAttr(p.model)}" data-price="${escapeAttr(p.defaultSalesPrice)}" data-purchase="${escapeAttr(p.defaultPurchasePrice)}">${escapeHtml(p.name)} / ${escapeHtml(p.model)}</option>`).join("");
  const defaultSalesPrice = products.items[0]?.defaultSalesPrice || 1;
  shell(pageTitle("新建客户订单", "创建客户订单后，可在详情页一键生成工厂采购订单。") + `
    <form class="panel" id="newOrderForm">
      <div class="form-grid">
        <label>关联客户<select class="select" name="customerId">${customers.items.map((c) => `<option value="${c.id}">${c.company} / ${c.contact}</option>`).join("")}</select></label>
        <label>交货方式<select class="select" name="deliveryTerm">${Object.keys(DELIVERY_LABELS).map((term) => `<option value="${term}" ${term === "FOB" ? "selected" : ""}>${DELIVERY_LABELS[term]}</option>`).join("")}</select></label>
        <label>目的地国家<input class="input" name="destinationCountry" value="美国"></label>
        <label>目的地地址<input class="input" name="destinationAddress" value="客户仓库"></label>
        <label>运费<input class="input" name="freight" type="number" value="1000"></label>
        <label>其他费用<input class="input" name="otherFees" type="number" value="120"></label>
        <label>定金金额<input class="input" name="depositAmount" type="number" value="1000"></label>
        <label>尾款金额<input class="input" name="balanceAmount" type="number" value="2000"></label>
        <label>预计交货日期<input class="input" name="expectedDeliveryDate" type="date" value="${future(30)}"></label>
        <label class="full">备注<textarea name="remark">新建测试订单</textarea></label>
      </div>
      <h2>产品明细</h2>
      <div class="table-wrap"><table><thead><tr><th>产品名称（中文 / English）</th><th>数量</th><th>销售单价</th><th>标志要求</th><th>颜色</th><th>包装</th><th>操作</th></tr></thead><tbody id="salesOrderItemsBody">
        <tr data-sales-item-row>
          <td><select class="select" name="productId">${productOptions}</select></td>
          <td><input class="input" name="quantity" type="number" value="500"></td>
          <td><input class="input" name="salesUnitPrice" type="number" step="0.01" value="${defaultSalesPrice}" placeholder="USD"></td>
          <td><input class="input" name="logoRequirement" value="按客户文件"></td>
          <td><input class="input" name="colorRequirement" value="黑色"></td>
          <td><input class="input" name="packagingRequirement" value="出口纸箱"></td>
          <td><button class="btn small danger" type="button" data-remove-sales-item>删除</button></td>
        </tr>
      </tbody></table></div>
      <div class="form-actions">
        <button class="btn" type="button" id="addSalesOrderItem">手动添加产品</button>
        <button class="btn primary">创建客户订单</button>
      </div>
    </form>`);
  const itemBody = $("#salesOrderItemsBody");
  const createSalesItemRow = () => {
    const tr = document.createElement("tr");
    tr.dataset.salesItemRow = "1";
    tr.innerHTML = `
      <td><select class="select" name="productId">${productOptions}</select></td>
      <td><input class="input" name="quantity" type="number" value="1"></td>
      <td><input class="input" name="salesUnitPrice" type="number" step="0.01" value="${defaultSalesPrice}" placeholder="USD"></td>
      <td><input class="input" name="logoRequirement" value="按客户文件"></td>
      <td><input class="input" name="colorRequirement" value="黑色"></td>
      <td><input class="input" name="packagingRequirement" value="出口纸箱"></td>
      <td><button class="btn small danger" type="button" data-remove-sales-item>删除</button></td>`;
    return tr;
  };
  $("#addSalesOrderItem").addEventListener("click", () => itemBody.appendChild(createSalesItemRow()));
  itemBody.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-sales-item]");
    if (!removeButton) return;
    if ($$("[data-sales-item-row]", itemBody).length <= 1) return alert("至少保留一条产品明细");
    removeButton.closest("[data-sales-item-row]")?.remove();
  });
  itemBody.addEventListener("change", (event) => {
    const select = event.target.closest("select[name=productId]");
    if (!select) return;
    const row = select.closest("[data-sales-item-row]");
    const priceInput = row?.querySelector("[name=salesUnitPrice]");
    const selectedPrice = Number(select.selectedOptions[0]?.dataset.price || 0);
    if (priceInput && selectedPrice) priceInput.value = selectedPrice;
  });
  $("#newOrderForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const body = Object.fromEntries(fd);
    body.items = $$("[data-sales-item-row]", itemBody).map((row) => {
      const productSelect = row.querySelector("[name=productId]");
      const opt = productSelect.selectedOptions[0];
      const quantity = Number(row.querySelector("[name=quantity]")?.value || 0);
      const price = Number(row.querySelector("[name=salesUnitPrice]")?.value || 0);
      return {
        productId: productSelect.value,
        productName: opt.dataset.name,
        model: opt.dataset.model,
        quantity,
        salesUnitPrice: price,
        salesTotal: quantity * price,
        defaultPurchasePrice: Number(opt.dataset.purchase),
        logoRequirement: row.querySelector("[name=logoRequirement]")?.value || "",
        colorRequirement: row.querySelector("[name=colorRequirement]")?.value || "",
        packagingRequirement: row.querySelector("[name=packagingRequirement]")?.value || ""
      };
    }).filter((item) => item.productId && item.quantity > 0);
    if (!body.items.length) return alert("请至少填写一条有效的产品明细");
    const order = await api("/api/sales-orders", { method: "POST", body: JSON.stringify(body) });
    go(`/admin/orders/${order.id}`);
  });
}

async function renderNewPurchaseOrder() {
  const [factories, products, salesOrders] = await Promise.all([
    api("/api/factories?pageSize=50"),
    api("/api/products?pageSize=50"),
    api("/api/sales-orders?pageSize=50")
  ]);
  shell(pageTitle("新建工厂采购单", "贸易公司可直接把采购单分配给对应工厂，工厂账号登录后只能看到分配给自己的采购单。", `<button class="btn" data-go="/admin/purchase-orders">返回采购单列表</button>`) + `
    <form class="panel" id="newPoForm">
      <div class="form-grid">
        <label>分配工厂<select class="select" name="factoryId" required>
          ${factories.items.map((factory) => `<option value="${factory.id}">${factory.name}</option>`).join("")}
        </select></label>
        <label>关联客户订单（可选）<select class="select" name="salesOrderId">
          <option value="">不关联客户订单，直接生成采购单</option>
          ${salesOrders.items.map((order) => `<option value="${order.id}">${order.orderNo} / ${order.customerCompany}</option>`).join("")}
        </select></label>
        <label>下单日期<input class="input" name="orderDate" type="date" value="${future(0)}"></label>
        <label>工厂交期<input class="input" name="factoryDeliveryDate" type="date" value="${future(30)}"></label>
        <label>工厂付款状态<select class="select" name="factoryPaymentStatus">
          <option value="Unpaid">未付款</option>
          <option value="Deposit Paid">支付预付款</option>
          <option value="Paid">付款完成</option>
        </select></label>
        <label>工厂确认状态<select class="select" name="factoryConfirmStatus">
          <option value="Pending">待工厂确认</option>
          <option value="Confirmed">工厂已确认</option>
        </select></label>
        <label class="full">定制 Logo 文件<input class="input" type="file" id="customLogoFile" accept="image/*,.pdf,.ai,.eps,.svg,.cdr,.psd"></label>
        <label class="full">备注<textarea name="remark">请工厂确认交期，并按要求上传生产图片。</textarea></label>
      </div>
      <div class="toolbar">
        <h2 style="margin:0">采购产品明细</h2>
        <div class="filters">
          <button class="btn small" type="button" id="bulkPoPrice">一键填充单价</button>
          <label class="btn small">一键填充 Logo 图片<input class="visually-hidden bulk-po-logo-file" type="file" accept="image/*"></label>
          <button class="btn" type="button" id="addPoItem">添加一行</button>
        </div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Product / 产品</th><th>SKU / 型号</th><th>Spec / 规格</th><th>Qty / 数量</th><th>Pieces / 件数</th><th>Freight Weight / 计费重量</th><th>Unit Price / 单价（人民币）</th><th>Product Amount / 金额（人民币）</th><th>产品 Logo</th><th>包装</th><th>操作</th></tr></thead><tbody id="poItemsBody">
        ${poItemRowTemplate(products.items)}
      </tbody></table></div>
      <div style="height:14px"></div>
      <button class="btn primary">创建并分配给工厂</button>
    </form>`);
  bindGoButtons();
  const poItemsBody = $("#poItemsBody");
  let newPoBulkLogo = null;
  const recalcNewPoRow = (row, options = {}) => {
    const price = Number($(".po-purchase-price", row)?.value || 0);
    const total = $(".po-line-total", row);
    updateFreightWeightCell(row, ".po-specification", ".po-quantity", ".po-freight-weight", options);
    if (total) total.textContent = moneyCny(readFreightWeightAmount($(".po-freight-weight", row)?.value) * price);
  };
  const bindPoItemRows = () => {
    $$(".po-product", poItemsBody).forEach((select) => {
      select.onchange = () => {
        const row = select.closest("tr");
        const purchaseInput = $(".po-purchase-price", row);
        purchaseInput.value = select.selectedOptions[0].dataset.purchase || purchaseInput.value;
        const modelInput = $(".po-model", row);
        if (modelInput) modelInput.value = select.selectedOptions[0].dataset.model || "";
        recalcNewPoRow(row);
      };
    });
    $$(".po-specification, .po-quantity", poItemsBody).forEach((input) => {
      input.oninput = () => recalcNewPoRow(input.closest("tr"), { forceAuto: true });
    });
    $$(".po-purchase-price", poItemsBody).forEach((input) => {
      input.oninput = () => recalcNewPoRow(input.closest("tr"));
    });
    $$(".po-freight-weight", poItemsBody).forEach((input) => {
      input.oninput = () => {
        const row = input.closest("tr");
        row.dataset.manualFreightWeight = "1";
        row.dataset.freightWeight = input.value;
        recalcNewPoRow(row);
      };
    });
    $$(".po-logo-file", poItemsBody).forEach((input) => {
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          applyPoLogoToRows([input.closest("tr")], await readPoLogo(file));
        } catch (error) {
          alert(error.message);
        }
      };
    });
    $$(".remove-po-item", poItemsBody).forEach((button) => {
      button.onclick = () => {
        if ($$("tr", poItemsBody).length <= 1) return alert("至少保留一条采购产品明细");
        button.closest("tr").remove();
      };
    });
  };
  $("#bulkPoPrice").addEventListener("click", () => {
    const value = prompt("请输入要填充到全部产品行的单价（人民币）", "");
    if (value === null) return;
    const price = Number(String(value).trim());
    if (!Number.isFinite(price) || price < 0) return alert("请输入有效的人民币单价");
    $$(".po-purchase-price", poItemsBody).forEach((input) => {
      input.value = price;
      recalcNewPoRow(input.closest("tr"));
    });
  });
  $("#addPoItem").addEventListener("click", () => {
    poItemsBody.insertAdjacentHTML("beforeend", poItemRowTemplate(products.items));
    bindPoItemRows();
    if (newPoBulkLogo) applyPoLogoToRows([poItemsBody.lastElementChild], newPoBulkLogo);
    recalcNewPoRow(poItemsBody.lastElementChild);
  });
  bindPoItemRows();
  $$("#poItemsBody tr").forEach(recalcNewPoRow);
  $(".bulk-po-logo-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      newPoBulkLogo = await readPoLogo(file);
      applyPoLogoToRows($$("#poItemsBody tr"), newPoBulkLogo);
    } catch (error) {
      alert(error.message);
    }
  });
  $("#newPoForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const body = Object.fromEntries(fd);
    if (!body.salesOrderId) delete body.salesOrderId;
    const logoPayloadRefs = new Map();
    body.items = await Promise.all($$("#poItemsBody tr").map(async (row) => {
      const productSelect = $(".po-product", row);
      const opt = productSelect.selectedOptions[0];
      const quantity = Number($(".po-quantity", row).value || 0);
      const purchaseUnitPrice = Number($(".po-purchase-price", row).value || 0);
      const freightWeight = ($(".po-freight-weight", row).value || "").trim() || calculateFreightWeight($(".po-specification", row).value, quantity);
      return {
        productId: productSelect.value,
        productName: opt.dataset.name,
        model: opt.dataset.model,
        specification: $(".po-specification", row).value,
        qtyLabel: $(".po-qty-label", row).value,
        quantity,
        freightWeight,
        purchaseUnitPrice,
        purchaseTotal: readFreightWeightAmount(freightWeight) * purchaseUnitPrice,
        logoRequirement: $(".po-logo", row).value,
        colorRequirement: "",
        packagingRequirement: $(".po-packaging", row).value
      };
      if (row.dataset.logoImageData) {
        const logoKey = row.dataset.logoImageData;
        const existingRef = logoPayloadRefs.get(logoKey);
        if (existingRef) {
          item.logoImageCopyFrom = existingRef;
        } else {
          item.logoImageData = row.dataset.logoImageData;
          item.logoImageName = row.dataset.logoImageName || "product-logo";
          logoPayloadRefs.set(logoKey, item.productId || item.model || item.productName);
        }
      }
      return item;
    }));
    body.items = body.items.filter((item) => item.productId && item.quantity > 0);
    if (!body.items.length) return alert("请至少填写一条有效的采购产品明细");
    try {
      const po = await api("/api/purchase-orders", { method: "POST", body: JSON.stringify(body) });
      const logoFile = $("#customLogoFile").files[0];
      if (logoFile) {
        await api("/api/files", { method: "POST", body: JSON.stringify({
          salesOrderId: "",
          purchaseOrderId: po.id,
          orderNo: po.poNo,
          fileType: "Logo File",
          fileName: logoFile.name,
          contentBase64: await toBase64(logoFile)
        }) });
      }
      renderPurchaseOrderModal(po.id);
    } catch (error) {
      alert(error.message);
    }
  });
}

function poItemRowTemplate(products) {
  return `<tr>
    <td><select class="select po-product">${products.map((p) => `<option value="${p.id}" data-name="${p.name}" data-model="${p.model}" data-purchase="${p.defaultPurchasePrice}">${p.name} / ${p.model}</option>`).join("")}</select></td>
    <td><input class="input po-model" value="${products[0]?.model || ""}" disabled></td>
    <td><input class="input po-specification" value="按确认样生产"></td>
    <td><input class="input po-qty-label" value="1 pc"></td>
    <td><input class="input po-quantity" type="number" min="1" value="1"></td>
    <td><input class="input po-freight-weight" value="" placeholder="例如 200 lb"></td>
    <td><input class="input po-purchase-price" type="number" step="0.01" min="0" value="${products[0]?.defaultPurchasePrice || 1}"></td>
    <td class="po-line-total">${moneyCny(products[0]?.defaultPurchasePrice || 1)}</td>
    <td class="po-logo-cell"><span class="muted po-logo-empty">未上传</span><input class="input po-logo-file" type="file" accept="image/*"><input class="input po-logo" type="hidden" value="按确认稿"></td>
    <td><input class="input po-packaging" value="出口纸箱"></td>
    <td><button class="btn small danger remove-po-item" type="button">删除</button></td>
  </tr>`;
}

async function renderSalesOrderDetail(id) {
  const order = await api(`/api/sales-orders/${id}`);
  const factories = await api("/api/factories?pageSize=50");
  shell(pageTitle(`客户订单 ${order.orderNo}`, "订单详情、时间线、采购单、文件、利润与状态更新。", `<button class="btn" data-go="/admin/sales-orders">返回列表</button>`) + `
    <section class="panel">
      <div class="toolbar">
        <div>${tag(order.statusZh, order.status)} ${tag(order.paymentStatus, order.paymentStatus)}</div>
        <div class="filters">
          <select class="select" id="statusSelect">${state.orderStatuses.map((s) => `<option value="${s}" ${s === order.status ? "selected" : ""}>${statusLabel(s)}</option>`).join("")}</select>
          <button class="btn primary" id="updateStatus">更新状态</button>
          ${state.user.role === "Admin" ? `<button class="btn danger" id="deleteOrder">归档订单</button>` : ""}
        </div>
      </div>
      <div class="detail-grid">
        ${field("客户", `${order.customerCompany} / ${order.customerName}`)}
        ${field("交货方式", deliveryLabel(order.deliveryTerm))}
        ${field("目的地", `${order.destinationCountry} ${order.destinationAddress}`)}
        ${field("预计交期", order.expectedDeliveryDate)}
        ${field("定金/尾款（USD）", `${moneyUsd(order.depositAmount)} / ${moneyUsd(order.balanceAmount)}`)}
        ${field("运费/其他费用（USD）", `${moneyUsd(order.freight)} / ${moneyUsd(order.otherFees)}`)}
      </div>
      ${order.profit ? `<h2>利润核算</h2><div class="detail-grid">${field("产品销售额（USD）", moneyUsd(order.profit.salesTotal))}${field("DDP运费收入（USD）", moneyUsd(order.profit.ddpFreightRevenue || 0))}${field("销售总额含DDP运费（USD）", moneyUsd(order.profit.grossSalesTotal || order.profit.salesTotal))}${field("采购成本（CNY）", moneyCny(order.profit.purchaseCostCny))}${field("采购折算（USD）", moneyUsd(order.profit.purchaseCost))}${field("预估利润（USD）", moneyUsd(order.profit.estimatedProfit))}${field("利润率", `${order.profit.profitRate}%`)}</div>` : `<p class="notice">当前角色无权查看工厂采购成本和利润。</p>`}
      <h2>产品明细</h2>${simpleTable(order.items, ["productName", "model", "quantity", "salesUnitPrice", "salesTotal", "logoRequirement", "colorRequirement"], ["产品名称（中文 / English）", "型号", "数量", "销售单价（USD）", "销售总价（USD）", "标志要求", "颜色"], (row, key) => ["salesUnitPrice", "salesTotal"].includes(key) ? moneyUsd(row[key]) : displayValue(row[key]))}
    </section>
    <section class="split">
      <div class="panel">
        <h2>工厂采购订单</h2>
        <div class="toolbar">
          <select class="select" id="factorySelect">${factories.items.map((f) => `<option value="${f.id}">${f.name}</option>`).join("")}</select>
          <button class="btn primary" id="makePo">从客户订单生成采购单</button>
        </div>
        ${simpleTable(order.purchaseOrders, ["poNo", "factoryName", "productionStatus", "qcStatus", "actions"], ["采购单号", "工厂", "生产状态", "质检", "操作"], (row, key) => key === "actions" ? `<button class="btn small" data-po="${row.id}">查看</button> <button class="btn small" data-chat-po="${row.id}">留言</button>` : displayValue(row[key]))}
      </div>
      <div class="panel">
        <h2>订单时间线</h2>
        <div class="timeline">${order.timeline.map((tl) => `<div class="timeline-item"><strong>${tl.oldStatus ? statusLabel(tl.oldStatus) : "创建"} → ${statusLabel(tl.newStatus)}</strong><span>${tl.actorName} · ${formatChinaDateTime(tl.createdAt)}</span><p>${tl.note || ""}</p></div>`).join("")}</div>
      </div>
    </section>
    ${filePanel(order)}
    <section class="panel" style="margin-top:14px">
      <h2>导出</h2>
      <a class="btn primary" href="/api/export?type=order&id=${order.id}">导出订单 PDF</a>
      <a class="btn" href="/api/export?type=pi&id=${order.id}">导出客户形式发票 PDF</a>
      <a class="btn" href="/api/export?type=sales-orders">导出客户订单表格</a>
    </section>`);
  bindGoButtons();
  $("#updateStatus").addEventListener("click", async () => {
    await api(`/api/sales-orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ status: $("#statusSelect").value, note: "页面手动更新" }) });
    renderSalesOrderDetail(order.id);
  });
  $("#deleteOrder")?.addEventListener("click", async () => deleteSalesOrder(order.id, order.orderNo, () => go("/admin/sales-orders")));
  $("#makePo").addEventListener("click", async () => {
    await api("/api/purchase-orders", { method: "POST", body: JSON.stringify({ salesOrderId: order.id, factoryId: $("#factorySelect").value }) });
    renderSalesOrderDetail(order.id);
  });
  bindFiles(order);
  $$("[data-po]").forEach((btn) => btn.addEventListener("click", () => renderPurchaseOrderModal(btn.dataset.po)));
  $$("[data-chat-po]").forEach((btn) => btn.addEventListener("click", () => renderChatsPage(btn.dataset.chatPo)));
}

async function renderPurchaseOrderDetail(id) {
  const po = await api(`/api/purchase-orders/${id}`);
  shell(pageTitle(`工厂订单 ${po.poNo}`, "工厂端只显示生产、质检、包装、发货准备相关信息。", `<button class="btn" data-go="/factory/orders">返回</button>`) + purchaseOrderView(po, true));
  bindGoButtons();
  bindPoActions(po, true);
}

async function renderPurchaseOrderModal(id) {
  const po = await api(`/api/purchase-orders/${id}`);
  shell(pageTitle(`工厂采购订单 ${po.poNo}`, "采购价和工厂付款仅对授权角色显示；工厂端不会看到客户价格和利润。", `<button class="btn" data-go="/admin/purchase-orders">返回列表</button>`) + purchaseOrderView(po, false));
  bindGoButtons();
  bindPoActions(po, false);
}

function purchaseOrderView(po, factoryMode) {
  const financeColumns = po.items.some((item) => item.purchaseUnitPrice !== undefined);
  const canEditPayment = canEditPurchasePaymentStatus();
  const poStatuses = state.purchaseProductionStatuses?.length ? state.purchaseProductionStatuses : ["Factory Order Placed", "Mass Production", "Production Completed"];
  const statusOptions = poStatuses.includes(po.productionStatus) ? poStatuses : [po.productionStatus, ...poStatuses];
  return `
    <section class="panel">
      <div class="toolbar">
        <div>${tag(po.productionStatus, po.productionStatus)} ${tag(po.qcStatus, po.qcStatus)}</div>
        <div class="filters">
          <select class="select" id="poStatus">${statusOptions.map((s) => `<option value="${s}" ${s === po.productionStatus ? "selected" : ""}>${statusLabel(s)}</option>`).join("")}</select>
          <button class="btn primary" id="savePoStatus">${factoryMode ? "保存并提交交期申请" : "保存交期/状态/单价"}</button>
          ${state.user.role === "Admin" && !factoryMode ? `<button class="btn danger" id="deletePurchaseOrder">归档采购单</button>` : ""}
        </div>
      </div>
      <div class="detail-grid">
        ${field("工厂", po.factoryName)}
        <label class="field"><span>工厂交期</span><input class="input" id="factoryDeliveryDate" type="date" value="${po.factoryDeliveryDate || ""}"></label>
        ${field("确认状态", statusLabel(po.factoryConfirmStatus))}
        ${canEditPayment ? purchasePaymentStatusField(po.factoryPaymentStatus) : field("付款状态", statusLabel(po.factoryPaymentStatus))}
        ${field("生产状态", statusLabel(po.productionStatus))}
        ${field("质检状态", statusLabel(po.qcStatus))}
      </div>
      ${po.pendingDeliveryChange ? `<div class="notice">交期调整待审核：当前正式交期 ${displayValue(po.factoryDeliveryDate)}，申请交期 ${displayValue(po.pendingDeliveryChange.requestedDate)}。管理员审核通过后才会生效。</div>` : ""}
      <h2>产品明细</h2>
      ${financeColumns ? purchaseItemsEditTable(po.items, factoryMode) : simpleTable(po.items, ["productName", "model", "quantity", "logoRequirement", "packagingRequirement"], ["产品名称（中文 / English）", "型号", "数量", "标志要求", "包装"])}
      ${purchaseFinanceSummary(po)}
    </section>
    <section class="panel" style="margin-top:14px">
      <div class="panel-title-row">
        <h2>订单留言</h2>
        <button class="btn primary" type="button" data-chat-po="${po.id}">进入订单沟通</button>
      </div>
      <p class="muted">围绕当前采购单与工厂沟通交期、单价、生产、质检、包装和发货问题。</p>
    </section>
    <section class="split">
      <div class="panel">
        <h2>质检报告</h2>
        ${simpleTable(po.qcReports || [], ["reportNo", "result", "inspectorName", "inspectionDate", "actions"], ["报告号", "结果", "检查人", "日期", "操作"], (row, key) => key === "actions" ? `<a class="btn small" href="/api/export?type=qc&id=${row.id}">导出 PDF</a>` : displayValue(row[key]))}
        ${qcPhotoPanel(po)}
        ${factoryMode ? "" : `<button class="btn primary" id="createQc">完成质检</button>`}
      </div>
      <div class="panel">
        <h2>时间线</h2>
        <div class="timeline">${po.timeline.map((tl) => `<div class="timeline-item"><strong>${tl.oldStatus ? statusLabel(tl.oldStatus) : "创建"} → ${statusLabel(tl.newStatus)}</strong><span>${tl.actorName} · ${formatChinaDateTime(tl.createdAt)}</span><p>${tl.note || ""}</p></div>`).join("")}</div>
      </div>
    </section>
    ${filePanel(po, true)}
    <section class="panel" style="margin-top:14px">
      <h2>导出</h2>
      <a class="btn" href="/api/export?type=po&id=${po.id}">导出工厂采购单 PDF</a>
      <a class="btn" href="/api/export?type=purchase-orders">导出采购订单表格</a>
    </section>`;
}

function purchaseItemsEditTable(items = [], factoryMode = false) {
  if (!items.length) return `<p class="muted">暂无数据</p>`;
  return `<div class="filters po-logo-actions">
    <button class="btn small" id="bulkEditPoPrice" type="button">一键填充单价</button>
    ${factoryMode ? "" : `<label class="btn small">一键填充 Logo 图片<input class="visually-hidden bulk-edit-po-logo-file" type="file" accept="image/*"></label><span class="muted">选择一次图片，可填充到当前采购单全部产品行。</span>`}
  </div>
  <div class="table-wrap"><table>
    <thead><tr><th>Product / 产品</th><th>SKU / 型号</th><th>Spec / 规格</th><th>Qty / 数量</th><th>Pieces / 件数</th><th>Freight Weight / 计费重量</th><th>Unit Price / 单价（CNY）</th><th>Product Amount / 金额（CNY）</th><th>产品 Logo</th><th>包装</th></tr></thead>
    <tbody>
      ${items.map((item) => `<tr data-po-item-id="${item.id}" data-po-qty="${Number(item.quantity || 0)}" data-freight-weight="${escapeAttr(item.freightWeight || "")}">
        <td>${displayValue(item.productName)}</td>
        <td>${displayValue(item.model)}</td>
        <td>${factoryMode ? displayValue(item.specification) : `<input class="input po-edit-specification" value="${escapeAttr(item.specification || "")}">`}</td>
        <td>${factoryMode ? displayValue(item.qtyLabel || `${Number(item.quantity || 0)} pcs`) : `<input class="input po-edit-qty-label" value="${escapeAttr(item.qtyLabel || `${Number(item.quantity || 0)} pcs`)}">`}</td>
        <td>${factoryMode ? `<strong>${Number(item.quantity || 0)}</strong>` : `<input class="input po-edit-qty" type="number" min="0" step="1" value="${Number(item.quantity || 0)}">`}</td>
        <td><input class="input po-edit-freight-weight" value="${escapeAttr(item.freightWeight || "")}" placeholder="例如 200 lb"></td>
        <td><input class="input po-edit-price" type="number" min="0" step="0.01" value="${Number(item.purchaseUnitPrice || 0)}"></td>
        <td class="po-edit-total">${moneyCny(item.purchaseTotal || 0)}</td>
        <td class="po-logo-cell">
          ${item.logoImageData ? `<img class="product-logo-thumb" src="${item.logoImageData}" alt="产品 Logo">` : `<span class="muted">未上传</span>`}
          ${factoryMode ? "" : `<input class="input po-edit-logo-file" type="file" accept="image/*">`}
        </td>
        <td>${displayValue(item.packagingRequirement)}</td>
      </tr>`).join("")}
    </tbody>
  </table></div>`;
}

function purchaseFinanceSummary(po = {}) {
  const items = po.items || [];
  const files = po.files || [];
  const depositVouchers = files.filter((file) => file.fileType === "Factory Deposit Voucher");
  const balanceVouchers = files.filter((file) => file.fileType === "Factory Balance Voucher");
  const total = purchaseTotalAmount(items);
  const deposit = total * 0.3;
  const balance = total - deposit;
  return `<div class="purchase-finance" id="purchaseFinanceSummary">
    <h2>财务核算</h2>
    <div class="finance-card-grid">
      ${financeCard("总金额", "purchaseFinanceTotal", total)}
      ${financeCard("30%预付款金额", "purchaseFinanceDeposit", deposit, {
        uploadId: "factoryDepositVoucherInput",
        hint: "上传入款凭证",
        files: depositVouchers
      })}
      ${financeCard("尾款金额", "purchaseFinanceBalance", balance, {
        uploadId: "factoryBalanceVoucherInput",
        hint: "上传付款凭证",
        files: balanceVouchers
      })}
    </div>
  </div>`;
}

function financeCard(label, id, value, options = {}) {
  const voucherList = (options.files || []).length
    ? `<div class="voucher-list">${options.files.map((file) => `<a href="${file.downloadUrl || `/api/files/${file.id}/download`}" download="${escapeAttr(file.fileName || "payment-voucher")}">${fileTypeLabel(file.fileType)}：${displayValue(file.fileName)}</a>`).join("")}</div>`
    : "";
  return `<div class="finance-card">
    <span>${label}</span>
    <strong id="${id}">${moneyCny(value)}</strong>
    ${options.uploadId ? `<label class="btn small voucher-upload">${options.hint || "上传凭证"}<input id="${options.uploadId}" type="file" accept="image/*,.pdf" multiple></label>${voucherList || `<small class="muted">暂无凭证</small>`}` : ""}
  </div>`;
}

function purchaseTotalAmount(items = []) {
  return items.reduce((total, item) => total + Number(item.purchaseTotal || 0), 0);
}

function canEditPurchasePaymentStatus() {
  return ["Admin", "Sales"].includes(state.user?.role);
}

function purchasePaymentStatusField(value) {
  const options = [
    ["Unpaid", "未付款"],
    ["Deposit Paid", "支付预付款"],
    ["Paid", "付款完成"]
  ];
  return `<label class="field"><span>付款状态</span><select class="select" id="factoryPaymentStatus">
    ${options.map(([status, label]) => `<option value="${status}" ${status === value ? "selected" : ""}>${label}</option>`).join("")}
  </select></label>`;
}

function qcPhotoPanel(po) {
  const files = po.files || [];
  const samplePhotos = files.filter((file) => file.fileType === "QC Sample Image");
  const productPhotos = files.filter((file) => file.fileType === "QC Product Image");
  const packingPhotos = files.filter((file) => file.fileType === "QC Packing Image");
  return `
    <div class="qc-photo-panel">
      <div class="qc-upload-grid">
        ${qcUploadBox("qcSamplePhotoInput", "质检样品图片", "上传客户确认样、产前样或对照样品照片")}
        ${qcUploadBox("qcProductPhotoInput", "质检产品照片", "上传产品正面、侧面、细节照片")}
        ${qcUploadBox("qcPackingPhotoInput", "质检包装照片", "上传外箱、标签、包装方式照片")}
      </div>
      <div class="qc-gallery-grid">
        ${fileGallery("样品图片", samplePhotos)}
        ${fileGallery("产品照片", productPhotos)}
        ${fileGallery("包装照片", packingPhotos)}
      </div>
    </div>`;
}

function qcUploadBox(inputId, title, hint) {
  return `<div class="qc-upload-box">
    <strong>${title}</strong>
    <span>${hint}</span>
    <input class="input" id="${inputId}" type="file" accept="image/*" multiple>
  </div>`;
}

function fileGallery(title, files = []) {
  if (!files.length) return `<div class="qc-gallery"><h3>${title}</h3><p class="muted">暂无图片</p></div>`;
  return `<div class="qc-gallery">
    <h3>${title}</h3>
    <div class="file-card-grid">
      ${files.map((file) => fileCard(file)).join("")}
    </div>
  </div>`;
}

function fileCard(file) {
  const downloadUrl = file.downloadUrl || `/api/files/${file.id}/download`;
  const previewUrl = `${downloadUrl}?preview=1`;
  return `<div class="file-card">
    ${file.isImage ? `<img src="${previewUrl}" alt="${escapeAttr(file.fileName || "质检图片")}">` : `<div class="file-placeholder">文件</div>`}
    <div class="file-meta">
      <strong title="${escapeAttr(file.fileName || "")}">${displayValue(file.fileName)}</strong>
      <span>${fileTypeLabel(file.fileType)} · ${displayValue(file.createdAt)}</span>
    </div>
    <div class="file-actions">
      <a class="btn small" href="${downloadUrl}" download="${escapeAttr(file.fileName || "order-file")}">下载</a>
      <button class="btn small danger" data-delete-qc-file="${file.id}" data-file-name="${escapeAttr(file.fileName || "质检图片")}">删除</button>
    </div>
  </div>`;
}

function renderCurrentPurchaseOrder(po, factoryMode) {
  return factoryMode ? renderPurchaseOrderDetail(po.id) : renderPurchaseOrderModal(po.id);
}

function bindQcPhotoUploads(po, factoryMode) {
  const uploadInput = (selector, fileType) => {
    const input = $(selector);
    if (!input) return;
    input.addEventListener("change", async () => {
      const files = [...(input.files || [])];
      if (!files.length) return;
      try {
        for (const file of files) {
          if (!file.type.startsWith("image/")) throw new Error("只能上传 JPG、PNG、WebP 等图片文件");
          const contentBase64 = await fileToUploadBase64(file, { compressImages: true, maxRawBytes: 4_000_000 });
          await api("/api/files", { method: "POST", body: JSON.stringify({
            salesOrderId: "",
            purchaseOrderId: po.id,
            orderNo: po.poNo,
            fileType,
            fileName: file.name,
            contentType: "image/jpeg",
            contentBase64
          }) });
        }
        await renderCurrentPurchaseOrder(po, factoryMode);
      } catch (error) {
        alert(error.message);
      }
    });
  };
  uploadInput("#qcSamplePhotoInput", "QC Sample Image");
  uploadInput("#qcProductPhotoInput", "QC Product Image");
  uploadInput("#qcPackingPhotoInput", "QC Packing Image");
  bindQcFileDeletes(po, factoryMode);
}

function bindFinanceVoucherUploads(po, factoryMode) {
  const uploadInput = (selector, fileType) => {
    const input = $(selector);
    if (!input) return;
    input.addEventListener("change", async () => {
      const files = [...(input.files || [])];
      if (!files.length) return;
      try {
        for (const file of files) {
          const isImage = file.type.startsWith("image/");
          const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
          if (!isImage && !isPdf) throw new Error("凭证仅支持图片或 PDF 文件");
          const contentBase64 = await fileToUploadBase64(file, { compressImages: isImage, maxRawBytes: 6_000_000 });
          await api("/api/files", { method: "POST", body: JSON.stringify({
            salesOrderId: "",
            purchaseOrderId: po.id,
            orderNo: po.poNo,
            fileType,
            fileName: file.name,
            contentType: isPdf ? "application/pdf" : "image/jpeg",
            contentBase64
          }) });
        }
        alert("上传成功");
        await renderCurrentPurchaseOrder(po, factoryMode);
      } catch (error) {
        alert(error.message || "上传失败");
      } finally {
        input.value = "";
      }
    });
  };
  uploadInput("#factoryDepositVoucherInput", "Factory Deposit Voucher");
  uploadInput("#factoryBalanceVoucherInput", "Factory Balance Voucher");
}

function bindQcFileDeletes(po, factoryMode) {
  $$("[data-delete-qc-file]").forEach((btn) => btn.addEventListener("click", async () => {
    const fileName = btn.dataset.fileName || "质检图片";
    if (!confirm(`确认删除这张质检图片吗？\n${fileName}`)) return;
    try {
      await api(`/api/files/${btn.dataset.deleteQcFile}`, { method: "DELETE" });
      alert("删除成功");
      await renderCurrentPurchaseOrder(po, factoryMode);
    } catch (error) {
      alert(error.message || "删除失败");
    }
  }));
}

function bindPoActions(po, factoryMode) {
  $$("[data-chat-po]").forEach((btn) => btn.addEventListener("click", () => renderChatsPage(btn.dataset.chatPo)));
  const readPoQuantity = (row) => Number($(".po-edit-qty", row)?.value ?? row.dataset.poQty ?? 0);
  const updateFinanceSummary = () => {
    const total = $$("[data-po-item-id]").reduce((sumValue, row) => {
      const price = Number($(".po-edit-price", row)?.value || 0);
      return sumValue + readPoRowFreightWeightAmount(row) * price;
    }, 0);
    const deposit = total * 0.3;
    const balance = total - deposit;
    if ($("#purchaseFinanceTotal")) $("#purchaseFinanceTotal").textContent = moneyCny(total);
    if ($("#purchaseFinanceDeposit")) $("#purchaseFinanceDeposit").textContent = moneyCny(deposit);
    if ($("#purchaseFinanceBalance")) $("#purchaseFinanceBalance").textContent = moneyCny(balance);
  };
  const recalcPoTotals = (options = {}) => {
    $$("[data-po-item-id]").forEach((row) => {
      const price = Number($(".po-edit-price", row)?.value || 0);
      const target = $(".po-edit-total", row);
      updateFreightWeightCell(row, ".po-edit-specification", ".po-edit-qty", ".po-edit-freight-weight", options);
      if (target) target.textContent = moneyCny(readPoRowFreightWeightAmount(row) * price);
    });
    updateFinanceSummary();
  };
  $$(".po-edit-specification, .po-edit-qty").forEach((input) => input.addEventListener("input", () => recalcPoTotals({ forceAuto: true })));
  $$(".po-edit-price").forEach((input) => input.addEventListener("input", () => recalcPoTotals()));
  $$(".po-edit-freight-weight").forEach((input) => input.addEventListener("input", () => {
    const row = input.closest("tr");
    row.dataset.manualFreightWeight = "1";
    row.dataset.freightWeight = input.value;
    recalcPoTotals();
  }));
  recalcPoTotals();
  $("#bulkEditPoPrice")?.addEventListener("click", () => {
    const value = prompt("请输入要填充到全部产品行的单价（人民币）", "");
    if (value === null) return;
    const price = Number(String(value).trim());
    if (!Number.isFinite(price) || price < 0) return alert("请输入有效的人民币单价");
    $$(".po-edit-price").forEach((input) => {
      input.value = price;
    });
    recalcPoTotals();
  });
  $(".bulk-edit-po-logo-file")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      applyPoLogoToRows($$("[data-po-item-id]"), await readPoLogo(file));
    } catch (error) {
      alert(error.message);
    }
  });
  $$(".po-edit-logo-file").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        applyPoLogoToRows([input.closest("tr")], await readPoLogo(file));
      } catch (error) {
        alert(error.message);
      }
    });
  });
  $("#savePoStatus").addEventListener("click", async () => {
    try {
      const logoPayloadRefs = new Map();
      const items = await Promise.all($$("[data-po-item-id]").map(async (row) => {
        const item = {
          id: row.dataset.poItemId,
          quantity: readPoQuantity(row),
          purchaseUnitPrice: Number($(".po-edit-price", row)?.value || 0)
        };
        if (!factoryMode) {
          item.specification = $(".po-edit-specification", row)?.value || "";
          item.qtyLabel = $(".po-edit-qty-label", row)?.value || "";
          item.freightWeight = ($(".po-edit-freight-weight", row)?.value || "").trim() || calculateFreightWeight(item.specification, item.quantity);
        } else {
          item.freightWeight = ($(".po-edit-freight-weight", row)?.value || "").trim() || row.dataset.freightWeight || "";
        }
        if (row.dataset.logoImageDirty === "1" && row.dataset.logoImageData) {
          const logoKey = row.dataset.logoImageData;
          const existingRef = logoPayloadRefs.get(logoKey);
          if (existingRef) {
            item.logoImageCopyFrom = existingRef;
          } else {
            item.logoImageData = row.dataset.logoImageData;
            item.logoImageName = row.dataset.logoImageName || "product-logo";
            logoPayloadRefs.set(logoKey, item.id);
          }
        }
        return item;
      }));
      const payload = {
        productionStatus: $("#poStatus").value,
        factoryConfirmStatus: "Confirmed",
        factoryDeliveryDate: $("#factoryDeliveryDate")?.value || po.factoryDeliveryDate,
        items,
        note: "页面更新工厂交期、生产状态、付款状态和采购单价"
      };
      if (canEditPurchasePaymentStatus()) payload.factoryPaymentStatus = $("#factoryPaymentStatus")?.value || po.factoryPaymentStatus;
      await api(`/api/purchase-orders/${po.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      const deliveryChanged = factoryMode && payload.factoryDeliveryDate && payload.factoryDeliveryDate !== po.factoryDeliveryDate;
      alert(deliveryChanged ? "保存成功：交期调整申请已提交，等待管理员审核通过后生效" : "保存成功");
      factoryMode ? renderPurchaseOrderDetail(po.id) : renderPurchaseOrderModal(po.id);
    } catch (error) {
      alert(error.message || "保存失败");
    }
  });
  $("#createQc")?.addEventListener("click", async () => {
    await api("/api/qc", { method: "POST", body: JSON.stringify({ purchaseOrderId: po.id, result: "Passed", remark: "页面快速创建 QC：全部通过" }) });
    renderPurchaseOrderModal(po.id);
  });
  bindQcPhotoUploads(po, factoryMode);
  bindFinanceVoucherUploads(po, factoryMode);
  $("#deletePurchaseOrder")?.addEventListener("click", async () => deletePurchaseOrder(po.id, po.poNo, () => go("/admin/purchase-orders")));
  bindFiles(po, true);
}

async function deleteSalesOrder(id, orderNo, onDone = loadSalesOrders) {
  if (state.user.role !== "Admin") return;
  const ok = confirm(`确定归档客户订单 ${orderNo}？系统会从常规列表隐藏它，但完整保留订单、采购单、产品明细、付款记录、文件记录、QC 和时间线。`);
  if (!ok) return;
  await api(`/api/sales-orders/${id}?confirm=DELETE`, { method: "DELETE" });
  await onDone();
}

async function deletePurchaseOrder(id, poNo, onDone = loadPurchaseOrders) {
  if (state.user.role !== "Admin") return;
  const ok = confirm(`确定归档采购单 ${poNo}？系统会从常规列表隐藏它，但完整保留采购单、产品明细、付款记录、文件记录、QC 和时间线。`);
  if (!ok) return;
  await api(`/api/purchase-orders/${id}?confirm=DELETE`, { method: "DELETE" });
  await onDone();
}

function bindSalesOrderDeleteButtons() {
  $$("[data-delete-sales-order]").forEach((btn) => btn.addEventListener("click", () => deleteSalesOrder(btn.dataset.deleteSalesOrder, btn.dataset.orderNo)));
}

function bindPurchaseOrderDeleteButtons() {
  $$("[data-delete-purchase-order]").forEach((btn) => btn.addEventListener("click", () => deletePurchaseOrder(btn.dataset.deletePurchaseOrder, btn.dataset.orderNo)));
}

function filePanel(order, isPo = false) {
  const fileTypes = state.user.role === "Factory"
    ? ["Factory Production Image", "QC Product Image", "QC Packing Image", "QC Image", "Packing Image", "Loading Image", "Logistics File", "Other Attachment"]
    : ["Customer Quotation", "PI", "Contract", "Logo File", "Product Image", "Factory Production Image", "QC Product Image", "QC Packing Image", "QC Image", "Packing Image", "Loading Image", "Bill of Lading", "Invoice", "Logistics File", "Payment Screenshot", "Other Attachment"];
  return `<section class="panel" style="margin-top:14px">
    <h2>文件和图片归档</h2>
    <div class="toolbar">
      <div class="filters">
        <select class="select" id="fileType">
          ${fileTypes.map((x) => `<option value="${x}">${fileTypeLabel(x)}</option>`).join("")}
        </select>
        <input class="input" type="file" id="fileInput">
      </div>
      <button class="btn primary" id="uploadFile">上传并按订单号归档</button>
    </div>
    ${simpleTable(order.files || [], ["fileType", "fileName", "uploadedByName", "createdAt", "actions"], ["类型", "文件名", "上传人", "时间", "操作"], (row, key) => key === "actions" ? `<a class="btn small" href="${row.downloadUrl || `/api/files/${row.id}/download`}" download="${escapeAttr(row.fileName || "order-file")}">下载</a>` : displayValue(row[key]))}
  </section>`;
}

function bindFiles(order, isPo = false) {
  $("#uploadFile")?.addEventListener("click", async () => {
    const file = $("#fileInput").files[0];
    if (!file) return alert("请选择文件");
    const contentBase64 = await fileToUploadBase64(file, { compressImages: true, maxRawBytes: 4_000_000 });
    await api("/api/files", { method: "POST", body: JSON.stringify({
      salesOrderId: isPo ? "" : order.id,
      purchaseOrderId: isPo ? order.id : "",
      orderNo: order.orderNo || order.poNo,
      fileType: $("#fileType").value,
      fileName: file.name,
      contentType: file.type.startsWith("image/") ? "image/jpeg" : (file.type || "application/octet-stream"),
      contentBase64
    }) });
    isPo ? (state.user.role === "Factory" ? renderPurchaseOrderDetail(order.id) : renderPurchaseOrderModal(order.id)) : renderSalesOrderDetail(order.id);
  });
}

function toBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}

async function readPoLogo(file) {
  return {
    name: file.name,
    data: await fileToDataUrl(file, { maxRawBytes: 350_000 })
  };
}

function applyPoLogoToRows(rows, logo) {
  rows.filter(Boolean).forEach((row) => {
    row.dataset.logoImageData = logo.data;
    row.dataset.logoImageName = logo.name;
    row.dataset.logoImageDirty = "1";
    const cell = $(".po-logo-cell", row);
    if (!cell) return;
    const existing = $(".product-logo-thumb", cell);
    if (existing) {
      existing.src = logo.data;
      existing.alt = logo.name;
      return;
    }
    const empty = $(".po-logo-empty", cell) || $(".muted", cell);
    const image = document.createElement("img");
    image.className = "product-logo-thumb";
    image.src = logo.data;
    image.alt = logo.name;
    cell.insertBefore(image, empty || cell.firstChild);
    if (empty) empty.remove();
  });
}

async function fileToDataUrl(file, options = {}) {
  const maxRawBytes = options.maxRawBytes || 2_000_000;
  if (!file.type.startsWith("image/")) throw new Error("产品 Logo 只支持 JPG、PNG、WebP 等图片格式");
  if (file.size > maxRawBytes) {
    return compressImageToDataUrl(file, 420, 0.68);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败，请重新选择文件"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

async function fileToUploadBase64(file, options = {}) {
  const maxRawBytes = options.maxRawBytes || 4_000_000;
  if (options.compressImages && file.type.startsWith("image/")) {
    return compressImageToBase64(file);
  }
  if (file.size > maxRawBytes) {
    throw new Error(`文件过大，请压缩到 ${Math.round(maxRawBytes / 1024 / 1024)}MB 以内后再上传。`);
  }
  return toBase64(file);
}

function compressImageToDataUrl(file, maxSide = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败，请重新选择文件"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("图片格式暂不支持，请改用 JPG/PNG 或压缩后再上传"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function compressImageToBase64(file, maxSide = 1600, quality = 0.74) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败，请重新选择文件"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("图片格式暂不支持，请改用 JPG/PNG 或压缩后再上传"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        if (dataUrl.length > 3_500_000 && maxSide > 900) {
          compressImageToBase64(file, 1100, 0.68).then(resolve).catch(reject);
          return;
        }
        resolve(dataUrl.split(",")[1]);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function renderCrud(resource, title, fields) {
  shell(pageTitle(title, "支持搜索、分页、快速新增。") + `
    <section class="split">
      <form class="panel" id="crudForm">
        <h2>新增</h2>
        <div class="form-grid">${fields.map((f) => fieldInput(f)).join("")}</div>
        <div style="height:14px"></div><button class="btn primary">保存</button>
      </form>
      <div class="panel">
        <h2>列表</h2>
        <input class="input" id="crudSearch" placeholder="搜索">
        <div id="crudList" style="margin-top:12px"></div>
      </div>
    </section>`);
  const load = async () => {
    const data = await api(`/api/${resource}?q=${encodeURIComponent($("#crudSearch").value || "")}&pageSize=50`);
    $("#crudList").innerHTML = simpleTable(data.items, fields.slice(0, 5).map((f) => f.name), fields.slice(0, 5).map((f) => f.label));
  };
  $("#crudSearch").addEventListener("input", debounce(load, 250));
  $("#crudForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    await api(`/api/${resource}`, { method: "POST", body: JSON.stringify(body) });
    event.currentTarget.reset();
    load();
  });
  load();
}

async function renderQc() {
  shell(pageTitle("质检模块", "创建质检报告、记录检查项、上传质检图片并导出 PDF。") + `<section class="panel"><div id="qcList">加载中...</div></section>`);
  const data = await api("/api/qc");
  $("#qcList").innerHTML = simpleTable(data.items, ["reportNo", "purchaseOrderId", "result", "inspectorName", "inspectionDate", "actions"], ["报告号", "采购单", "结果", "检查人", "日期", "导出"], (row, key) => key === "actions" ? `<a class="btn small" href="/api/export?type=qc&id=${row.id}">导出 PDF</a>` : displayValue(row[key]));
}

async function renderPayments() {
  shell(pageTitle("付款管理", "财务角色管理客户收款、工厂付款、付款截图和付款状态。") + `
    <section class="split">
      <form class="panel" id="payForm">
        <h2>新增付款记录</h2>
        <div class="form-grid">
          <label>类型<select class="select" name="type">${Object.entries(PAYMENT_TYPE_LABELS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}</select></label>
          <label>客户订单编号<input class="input" name="salesOrderId" placeholder="如 so-1"></label>
          <label>采购订单编号<input class="input" name="purchaseOrderId" placeholder="如 po-1"></label>
          <label>金额<input class="input" name="amount" type="number"></label>
          <label>方式<input class="input" name="method" value="T/T"></label>
          <label>标记已结清<select class="select" name="markPaid"><option value="">否</option><option value="true">是</option></select></label>
        </div><div style="height:14px"></div><button class="btn primary">保存付款</button>
      </form>
      <div class="panel"><h2>付款记录</h2><div id="payList"></div></div>
    </section>`);
  const load = async () => {
    const data = await api("/api/payments");
    $("#payList").innerHTML = simpleTable(data.items, ["type", "salesOrderId", "purchaseOrderId", "amount", "paymentDate", "method"], ["类型", "客户订单", "采购订单", "金额", "日期", "方式"]);
  };
  $("#payForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.currentTarget));
    body.markPaid = body.markPaid === "true";
    await api("/api/payments", { method: "POST", body: JSON.stringify(body) });
    event.currentTarget.reset();
    load();
  });
  load();
}

function renderReports() {
  shell(pageTitle("报表导出", "第一版支持表格文件、客户形式发票、工厂采购单和质检报告 PDF。") + `
    <section class="panel">
      <h2>表格报表</h2>
      <a class="btn" href="/api/export?type=sales-orders">客户订单表格</a>
      <a class="btn" href="/api/export?type=purchase-orders">工厂采购订单表格</a>
      <a class="btn" href="/api/export?type=profit">订单利润报表</a>
      <p class="muted">客户形式发票、工厂采购单、质检报告 PDF 可在对应订单详情页按单导出。</p>
    </section>`);
}

async function renderSettings() {
  shell(pageTitle("设置与审计", "角色权限说明、账号注册审核和最近操作日志。") + `
    <section class="panel">
      <h2>注册审核</h2>
      <div id="userApprovalList">加载中...</div>
    </section>
    <section class="panel" style="margin-top:14px">
      <h2>账号管理</h2>
      <p class="muted">管理员可为已注册账号重置密码。系统不会显示用户原密码。</p>
      <div id="userAccountList">加载中...</div>
    </section>
    <section class="panel" style="margin-top:14px">
      <h2>权限矩阵</h2>
      ${permissionMatrix()}
      <h2>最近审计日志</h2>
      <div id="auditList"></div>
    </section>`);
  const [logs, pending, users] = await Promise.all([api("/api/audit-logs"), api("/api/users?status=pending"), api("/api/users")]);
  $("#userApprovalList").innerHTML = simpleTable(pending.items, ["name", "email", "role", "factoryName", "businessLicenseFileName", "createdAt", "actions"], ["用户名", "邮箱", "类型", "工厂", "营业执照", "申请时间", "操作"], (row, key) => {
    if (key === "role") return roleLabel(row.role);
    if (key === "actions") return `<button class="btn small primary" data-approve-user="${row.id}">通过</button> <button class="btn small danger" data-reject-user="${row.id}">拒绝</button>`;
    return displayValue(row[key]);
  });
  $("#userAccountList").innerHTML = simpleTable(users.items, ["name", "email", "role", "approvalStatus", "factoryName", "actions"], ["用户名", "邮箱", "类型", "审核状态", "工厂", "操作"], (row, key) => {
    if (key === "role") return roleLabel(row.role);
    if (key === "approvalStatus") return tag(statusLabel(row.approvalStatus), row.approvalStatus);
    if (key === "actions") return `<button class="btn small" data-reset-password="${row.id}" data-reset-email="${escapeAttr(row.email)}">重置密码</button> <button class="btn small danger" data-delete-user="${row.id}" data-delete-email="${escapeAttr(row.email)}">删除账号</button>`;
    return displayValue(row[key]);
  });
  $$("[data-approve-user]").forEach((btn) => btn.addEventListener("click", async () => {
    await api(`/api/users/${btn.dataset.approveUser}`, { method: "PATCH", body: JSON.stringify({ approvalStatus: "approved" }) });
    renderSettings();
  }));
  $$("[data-reject-user]").forEach((btn) => btn.addEventListener("click", async () => {
    const rejectedReason = prompt("请输入拒绝原因", "资料不完整") || "管理员拒绝";
    await api(`/api/users/${btn.dataset.rejectUser}`, { method: "PATCH", body: JSON.stringify({ approvalStatus: "rejected", rejectedReason }) });
    renderSettings();
  }));
  $$("[data-reset-password]").forEach((btn) => btn.addEventListener("click", async () => {
    const newPassword = prompt(`请输入 ${btn.dataset.resetEmail} 的新密码（至少 6 位）`, "");
    if (!newPassword) return;
    await api(`/api/users/${btn.dataset.resetPassword}`, { method: "PATCH", body: JSON.stringify({ newPassword }) });
    alert("密码已重置");
  }));
  $$("[data-delete-user]").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm(`确认删除账号 ${btn.dataset.deleteEmail}？此操作只删除账号信息，不删除订单、采购单和文件。`)) return;
    await api(`/api/users/${btn.dataset.deleteUser}`, { method: "DELETE" });
    alert("账号已删除");
    renderSettings();
  }));
  $("#auditList").innerHTML = simpleTable(logs.items, ["createdAt", "actorName", "entityType", "action"], ["时间", "操作人", "对象", "动作"]);
}

function permissionMatrix() {
  const rows = [
    { role: "Admin", scope: "全部数据、财务、利润、删除、审计" },
    { role: "Sales", scope: "只能查看和管理自己提交的客户订单；可以查看全部工厂列表；无采购价和利润" },
    { role: "Merchandiser", scope: "订单/采购单进度、质检、文件；不能修改核心财务字段" },
    { role: "Finance", scope: "收付款、成本、利润、财务报表" },
    { role: "Factory", scope: "仅自己的采购订单；可提交交期和人民币采购单价；无客户联系方式、客户售价、利润" }
  ];
  return simpleTable(rows, ["role", "scope"], ["角色", "权限"]);
}

function simpleTable(rows = [], keys = [], labels = keys, cell = (row, key) => displayValue(row[key])) {
  if (!rows.length) return `<p class="muted">暂无数据</p>`;
  return `<div class="table-wrap"><table><thead><tr>${labels.map((label) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${keys.map((key) => `<td>${cell(row, key)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function field(label, value) {
  return `<div class="field"><span>${label}</span><strong>${displayValue(value)}</strong></div>`;
}

function escapeAttr(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(value) {
  return escapeAttr(value);
}

function tag(label, status = "") {
  const s = String(status || label);
  let color = "blue";
  if (/Paid|Passed|Confirmed|Delivered|Closed|Shipped/.test(s)) color = "green";
  if (/Pending|Inspection|Production|Need/.test(s)) color = "yellow";
  if (/Failed|Cancelled|Overdue|Rework/.test(s)) color = "red";
  return `<span class="tag ${color}">${displayValue(label)}</span>`;
}

function roleLabel(role) {
  return ROLE_LABELS[role] || role || "";
}

function statusLabel(status) {
  return state.statusZh?.[status] || STATUS_LABELS[status] || status || "";
}

function paymentTypeLabel(type) {
  return PAYMENT_TYPE_LABELS[type] || type || "";
}

function fileTypeLabel(type) {
  return FILE_TYPE_LABELS[type] || type || "";
}

function deliveryLabel(term) {
  return DELIVERY_LABELS[term] || term || "";
}

function severityLabel(level) {
  return { low: "低", medium: "中", high: "高", critical: "紧急" }[level] || level || "";
}

function reminderSeverityClass(level) {
  return {
    critical: "severity-critical",
    high: "severity-high",
    medium: "severity-medium",
    low: "severity-low"
  }[level] || "severity-medium";
}

function formatChinaDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: CHINA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function formatChinaDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "").slice(0, 10);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: CHINA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function displayValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return value;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return formatChinaDateTime(value);
  if (ROLE_LABELS[value]) return roleLabel(value);
  if (STATUS_LABELS[value] || state.statusZh?.[value]) return statusLabel(value);
  if (PAYMENT_TYPE_LABELS[value]) return paymentTypeLabel(value);
  if (FILE_TYPE_LABELS[value]) return fileTypeLabel(value);
  if (DELIVERY_LABELS[value]) return deliveryLabel(value);
  if (SOURCE_LABELS[value]) return SOURCE_LABELS[value];
  if (UNIT_LABELS[value]) return UNIT_LABELS[value];
  if (value === "create") return "创建";
  if (value === "update") return "更新";
  if (value === "delete") return "删除";
  if (value === "register") return "注册";
  if (value === "sales_order") return "客户订单";
  if (value === "purchase_order") return "工厂采购订单";
  if (value === "qc_report") return "质检报告";
  if (value === "payment") return "付款记录";
  if (value === "order_file") return "订单文件";
  if (value === "user") return "用户";
  return value;
}

function money(value, symbol = "$") {
  if (value === null || value === undefined || value === "") return "-";
  return `${symbol}${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function moneyUsd(value) {
  return money(value, "$");
}

function moneyCny(value) {
  return money(value, "¥");
}

function formatWeightValue(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  return Number.isInteger(numeric) ? String(numeric) : String(Number(numeric.toFixed(3)));
}

function calculateFreightWeight(specification, pieces) {
  const qty = Number(pieces || 0);
  const spec = String(specification || "").replace(/；/g, ";");
  const explicit = spec.match(/(?:重量|Freight Weight|Weight)\s*[:：]?\s*([\d,.]+)\s*(lb|lbs|kg)\b/i);
  if (explicit) return `${formatWeightValue(Number(explicit[1].replace(/,/g, "")))} ${explicit[2].toLowerCase().replace("lbs", "lb")}`;
  const unitWeight = spec.match(/(^|[^\d])([\d,.]+)\s*(lb|lbs|kg)\b/i);
  if (!unitWeight || qty <= 0) return "";
  return `${formatWeightValue(Number(unitWeight[2].replace(/,/g, "")) * qty)} ${unitWeight[3].toLowerCase().replace("lbs", "lb")}`;
}

function readFreightWeightAmount(value) {
  const match = String(value || "").match(/([\d,.]+)/);
  return match ? Number(match[1].replace(/,/g, "")) : 0;
}

function readPoRowFreightWeightAmount(row) {
  return readFreightWeightAmount($(".po-edit-freight-weight", row)?.value || row.dataset.freightWeight || "");
}

function updateFreightWeightCell(row, specSelector, qtySelector, targetSelector, options = {}) {
  const target = $(targetSelector, row);
  if (!target) return;
  if (row.dataset.manualFreightWeight === "1" || (!options.forceAuto && target.value)) {
    row.dataset.freightWeight = target.value;
    return;
  }
  const freightWeight = calculateFreightWeight($(specSelector, row)?.value, $(qtySelector, row)?.value);
  target.value = freightWeight;
  row.dataset.freightWeight = freightWeight;
}

function future(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatChinaDate(d.toISOString());
}

function bindGoButtons() {
  $$("[data-go]").forEach((btn) => btn.addEventListener("click", () => go(btn.dataset.go)));
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function fieldInput(field) {
  const common = `name="${field.name}" ${field.required ? "required" : ""}`;
  if (field.type === "select") return `<label>${field.label}<select class="select" ${common}>${field.options.map((o) => `<option value="${o}">${displayValue(o)}</option>`).join("")}</select></label>`;
  if (field.type === "textarea") return `<label class="full">${field.label}<textarea ${common}></textarea></label>`;
  return `<label>${field.label}<input class="input" ${common} type="${field.type || "text"}" value="${field.value || ""}"></label>`;
}

function customerFields() {
  return [
    { name: "name", label: "客户名称", required: true },
    { name: "company", label: "公司名称" },
    { name: "country", label: "国家" },
    { name: "contact", label: "联系人" },
    { name: "email", label: "邮箱" },
    { name: "whatsapp", label: "WhatsApp" },
    { name: "phone", label: "电话" },
    { name: "address", label: "地址" },
    { name: "source", label: "客户来源", type: "select", options: ["LinkedIn", "Website", "Alibaba", "WhatsApp", "Referral", "Other"] },
    { name: "level", label: "客户等级", type: "select", options: ["A", "B", "C"] },
    { name: "remark", label: "备注", type: "textarea" }
  ];
}

function factoryFields() {
  return [
    { name: "name", label: "工厂名称", required: true },
    { name: "contact", label: "联系人" },
    { name: "phone", label: "电话" },
    { name: "wechat", label: "微信" },
    { name: "email", label: "邮箱" },
    { name: "address", label: "地址" },
    { name: "mainProducts", label: "主营产品" },
    { name: "paymentTerms", label: "付款方式" },
    { name: "leadTimeDays", label: "常规交期", type: "number" },
    { name: "qualityScore", label: "质量评分", type: "number" },
    { name: "deliveryScore", label: "交期评分", type: "number" },
    { name: "cooperationScore", label: "配合度评分", type: "number" },
    { name: "remark", label: "备注", type: "textarea" }
  ];
}

function productFields() {
  return [
    { name: "name", label: "产品名称（中文 / English）", required: true },
    { name: "model", label: "产品型号" },
    { name: "category", label: "产品分类" },
    { name: "image", label: "产品图片" },
    { name: "defaultSalesPrice", label: "默认销售单价", type: "number" },
    { name: "defaultPurchasePrice", label: "默认工厂采购价", type: "number" },
    { name: "unit", label: "单位", type: "select", options: ["piece", "pair", "set", "kg", "lb"] },
    { name: "weight", label: "重量", type: "number" },
    { name: "packageSize", label: "包装尺寸" },
    { name: "remark", label: "备注", type: "textarea" }
  ];
}

applyTheme();
setInterval(() => {
  if (getThemeMode() === "auto") applyTheme("auto");
}, 60_000);

boot();
