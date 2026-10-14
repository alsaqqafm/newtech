const http = require('http');

function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data || {});
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('Testing Multi-Store APIs...');

  // 1. Admin login
  const adminLogin = await post('/api/login', { username: 'admin@newtechmed.com', password: 'admin123' });
  console.log('Admin login status:', adminLogin.status, 'User:', adminLogin.body.user.name, 'Store:', adminLogin.body.user.store_name);
  const adminToken = adminLogin.body.token;

  // 2. Manager 1 login (Store 1)
  const mgr1Login = await post('/api/login', { username: 'manager1@newtechmed.com', password: 'manager123' });
  console.log('Manager 1 login status:', mgr1Login.status, 'Store ID:', mgr1Login.body.user.store_id);
  const mgr1Token = mgr1Login.body.token;

  // 3. Manager 2 login (Store 2)
  const mgr2Login = await post('/api/login', { username: 'manager2@newtechmed.com', password: 'manager123' });
  console.log('Manager 2 login status:', mgr2Login.status, 'Store ID:', mgr2Login.body.user.store_id);
  const mgr2Token = mgr2Login.body.token;

  // 4. Stores list
  const stores = await get('/api/stores', adminToken);
  console.log(`Stores found (${stores.body.length}):`);
  stores.body.forEach(s => {
    console.log(` - Store #${s.id}: ${s.name} (${s.code}) | Stock units: ${s.total_units} | Sales: ${s.total_sales} YER`);
  });

  // 5. Check store isolation on inventory
  const s1Inv = await get('/api/inventory?store_id=1', mgr1Token);
  console.log(`Manager 1 inventory query (Store 1): ${s1Inv.body.length} products`);

  const s2Unauthorized = await get('/api/inventory?store_id=2', mgr1Token);
  console.log(`Manager 1 trying to query Store 2 (Unauthorized check): status ${s2Unauthorized.status} -`, s2Unauthorized.body.error);

  // 6. Reports Dashboard
  const dashboard = await get('/api/reports/dashboard', adminToken);
  console.log('Dashboard aggregated report:');
  console.log(` - Total Sales: ${dashboard.body.totalSales} YER`);
  console.log(` - Cost of Goods: ${dashboard.body.totalCost} YER`);
  console.log(` - Gross Profit: ${dashboard.body.grossProfit} YER`);
  console.log(` - Total Expenses: ${dashboard.body.totalExpenses} YER`);
  console.log(` - Net Profit: ${dashboard.body.netProfit} YER`);
  console.log(` - Total Customer Debts: ${dashboard.body.totalDebts} YER`);
  console.log(` - Stores Breakdown (${dashboard.body.storesBreakdown.length} stores)`);

  console.log('API verification completed successfully!');
}

run().catch(console.error);
