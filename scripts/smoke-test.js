const base = process.env.BASE_URL || "http://localhost:3000";

async function main() {
  const login = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@trade.local", password: "password123" })
  });
  if (!login.ok) throw new Error(`Admin login failed: ${login.status}`);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const headers = { cookie, "content-type": "application/json" };
  const dashboard = await fetch(`${base}/api/dashboard`, { headers });
  if (!dashboard.ok) throw new Error(`Dashboard failed: ${dashboard.status}`);
  const sales = await fetch(`${base}/api/sales-orders`, { headers });
  const salesData = await sales.json();
  if (!salesData.total) throw new Error("No sales orders returned");
  const po = await fetch(`${base}/api/purchase-orders`, { headers });
  const poData = await po.json();
  if (!poData.total) throw new Error("No purchase orders returned");
  const factoryLogin = await fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "factory-a@trade.local", password: "password123" })
  });
  const factoryCookie = factoryLogin.headers.get("set-cookie").split(";")[0];
  const factoryOrders = await fetch(`${base}/api/purchase-orders`, { headers: { cookie: factoryCookie } });
  const factoryData = await factoryOrders.json();
  const leaked = JSON.stringify(factoryData).includes("salesUnitPrice") || JSON.stringify(factoryData).includes("profit");
  if (leaked) throw new Error("Factory API leaked customer price or profit");
  console.log("Smoke test passed: dashboard, sales orders, purchase orders, factory visibility.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
