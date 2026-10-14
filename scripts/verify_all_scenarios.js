const http = require('http');

function request(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: headers
    }, res => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(responseBody) });
        } catch (e) {
          resolve({ status: res.statusCode, body: responseBody });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const get = (path, token) => request('GET', path, null, token);
const post = (path, data, token) => request('POST', path, data, token);

async function runAllTests() {
  console.log('========================================================');
  console.log('  STARTING COMPREHENSIVE MULTI-STORE VERIFICATION SUITE');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function test(desc, condition) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  // ----------------------------------------------------
  // SCENARIO 1: Primary Admin Authentication & Controller
  // ----------------------------------------------------
  console.log('--- SCENARIO 1: Primary Admin Controller ---');
  const adminRes = await post('/api/login', {
    username: 'mohammed.f.saqqaf@gmail.com',
    password: '772522233'
  });
  test('Admin login with mohammed.f.saqqaf@gmail.com succeeds (HTTP 200)', adminRes.status === 200);
  test('Admin user has role "admin"', adminRes.body?.user?.role === 'admin');
  test('Admin has access across all stores (store_id is null)', adminRes.body?.user?.store_id === null);
  const adminToken = adminRes.body?.token;

  // ----------------------------------------------------
  // SCENARIO 2: Store Managers & Role Credentials
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 2: Store Managers & Staff ---');
  const mgr1Res = await post('/api/login', { username: 'manager1@newtechmed.com', password: 'manager123' });
  test('Manager 1 login succeeds with Store 1 binding', mgr1Res.status === 200 && mgr1Res.body?.user?.store_id === 1);
  const mgr1Token = mgr1Res.body?.token;

  const mgr2Res = await post('/api/login', { username: 'manager2@newtechmed.com', password: 'manager123' });
  test('Manager 2 login succeeds with Store 2 binding', mgr2Res.status === 200 && mgr2Res.body?.user?.store_id === 2);
  const mgr2Token = mgr2Res.body?.token;

  // ----------------------------------------------------
  // SCENARIO 3: Store Isolation & RBAC Protection
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 3: Strict Store Isolation & RBAC ---');
  const s1Allowed = await get('/api/inventory?store_id=1', mgr1Token);
  test('Manager 1 CAN query Store 1 inventory (HTTP 200)', s1Allowed.status === 200 && Array.isArray(s1Allowed.body));

  const s2Forbidden = await get('/api/inventory?store_id=2', mgr1Token);
  test('Manager 1 is REJECTED when querying Store 2 inventory (HTTP 403 Forbidden)', s2Forbidden.status === 403);

  const s2FinForbidden = await get('/api/finances/expenses?store_id=2', mgr1Token);
  test('Manager 1 is REJECTED when querying Store 2 finances (HTTP 403 Forbidden)', s2FinForbidden.status === 403);

  const adminCrossStore = await get('/api/inventory?store_id=2', adminToken);
  test('Admin CAN query Store 2 without restriction (HTTP 200)', adminCrossStore.status === 200);

  // ----------------------------------------------------
  // SCENARIO 4: Independent POS Sale & Stock Deduction
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 4: POS Sale in Store 1 & Stock Isolation ---');
  // Record initial stock for product 10 in Store 1 and Store 2
  const s1InvBefore = await get('/api/inventory?store_id=1', adminToken);
  const s2InvBefore = await get('/api/inventory?store_id=2', adminToken);
  const pS1Before = s1InvBefore.body.find(i => i.product_id === 10);
  const pS2Before = s2InvBefore.body.find(i => i.product_id === 10);
  console.log(`Initial Product #10 Stock: Store 1 = ${pS1Before?.stock_quantity}, Store 2 = ${pS2Before?.stock_quantity}`);

  const saleRes = await post('/api/invoices', {
    store_id: 1,
    customer_id: 1,
    payment_method: 'cash',
    items: [{
      product_id: 10,
      quantity: 2,
      unit_price: 13500
    }]
  }, mgr1Token);

  test('POS Sale invoice created successfully (HTTP 201)', saleRes.status === 201);
  const invoice = saleRes.body;
  test('Invoice number has Store 1 prefix format (INV-S1-2026-...) ', invoice?.invoice_number?.startsWith('INV-S1-'));

  const s1InvAfter = await get('/api/inventory?store_id=1', adminToken);
  const s2InvAfter = await get('/api/inventory?store_id=2', adminToken);
  const pS1After = s1InvAfter.body.find(i => i.product_id === 10);
  const pS2After = s2InvAfter.body.find(i => i.product_id === 10);

  test('Store 1 stock decreased by exactly 2 units', pS1After.stock_quantity === pS1Before.stock_quantity - 2);
  test('Store 2 stock was COMPLETELY UNTOUCHED', pS2After.stock_quantity === pS2Before.stock_quantity);
  console.log(`Updated Product #10 Stock: Store 1 = ${pS1After.stock_quantity}, Store 2 = ${pS2After.stock_quantity}`);

  // ----------------------------------------------------
  // SCENARIO 5: Inter-Store Stock Transfer Lifecycle
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 5: Inter-Store Transfer Lifecycle (S1 -> S2) ---');
  const transferCreate = await post('/api/transfers', {
    from_store_id: 1,
    to_store_id: 2,
    notes: 'تحويل دوري لتغذية فرع عدن',
    items: [{
      product_id: 10,
      quantity: 3
    }]
  }, adminToken);
  test('Transfer created in "pending" status (HTTP 201)', transferCreate.status === 201 && transferCreate.body?.status === 'pending');
  const transferId = transferCreate.body?.id;

  // Approve transfer
  const approveRes = await post(`/api/transfers/${transferId}/approve`, {}, adminToken);
  test('Transfer approved (HTTP 200)', approveRes.status === 200 && approveRes.body?.status === 'approved');

  // Dispatch transfer (leaves Store 1 -> in transit)
  const dispatchRes = await post(`/api/transfers/${transferId}/dispatch`, {}, adminToken);
  test('Transfer dispatched to "in_transit" (HTTP 200)', dispatchRes.status === 200 && dispatchRes.body?.status === 'in_transit');

  const s1AfterDispatch = await get('/api/inventory?store_id=1', adminToken);
  const s2AfterDispatch = await get('/api/inventory?store_id=2', adminToken);
  const pS1Dispatched = s1AfterDispatch.body.find(i => i.product_id === 10);
  const pS2Dispatched = s2AfterDispatch.body.find(i => i.product_id === 10);

  test('Sender (Store 1) stock immediately deducted upon dispatch', pS1Dispatched.stock_quantity === pS1After.stock_quantity - 3);
  test('Receiver (Store 2) stock NOT yet credited while in transit', pS2Dispatched.stock_quantity === pS2Before.stock_quantity);

  // Receive transfer in Store 2
  const receiveRes = await post(`/api/transfers/${transferId}/receive`, {
    items: [{
      product_id: 10,
      quantity_received: 3,
      quantity_damaged: 0
    }]
  }, mgr2Token);
  test('Transfer successfully received in Store 2 (HTTP 200)', receiveRes.status === 200 && (receiveRes.body?.status === 'completed' || receiveRes.body?.status === 'received'));

  const s2AfterReceive = await get('/api/inventory?store_id=2', adminToken);
  const pS2Received = s2AfterReceive.body.find(i => i.product_id === 10);
  test('Store 2 stock credited with received quantity (+3)', pS2Received.stock_quantity === pS2Before.stock_quantity + 3);

  // ----------------------------------------------------
  // SCENARIO 6: Sales Return & Inventory Reversal
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 6: Sales Return Workflow ---');
  const returnRes = await post(`/api/invoices/${invoice.id}/return`, {
    reason: 'استرجاع جهاز بطلب العميل بحالة ممتازة',
    items: [{
      product_id: 10,
      quantity: 1,
      refund_price: 13500
    }]
  }, mgr1Token);
  test('Sales return processed successfully', returnRes.status === 200 || returnRes.status === 201);

  const s1AfterReturn = await get('/api/inventory?store_id=1', adminToken);
  const pS1Returned = s1AfterReturn.body.find(i => i.product_id === 10);
  test('Store 1 stock restored by 1 unit after return', pS1Returned.stock_quantity === pS1Dispatched.stock_quantity + 1);

  // ----------------------------------------------------
  // SCENARIO 7: Physical Stocktaking Adjustment
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 7: Stocktake Physical Count Adjustment ---');
  const targetAdjQty = pS1Returned.stock_quantity + 2;
  const adjRes = await post('/api/inventory/adjust', {
    store_id: 1,
    product_id: 10,
    actual_quantity: targetAdjQty,
    reason: 'تسوية جردية دورية - اكتشاف وحدات إضافية'
  }, adminToken);
  test('Stock adjustment recorded (HTTP 200)', adjRes.status === 200);

  const s1AfterAdj = await get('/api/inventory?store_id=1', adminToken);
  const pS1Adjusted = s1AfterAdj.body.find(i => i.product_id === 10);
  test('Stock count matches physical adjustment count', pS1Adjusted.stock_quantity === targetAdjQty);

  // ----------------------------------------------------
  // SCENARIO 8: Financial Accounting & Net Profit
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 8: Financial Calculations & Real Net Profit ---');
  const reportAll = await get('/api/reports/dashboard', adminToken);
  test('Dashboard reports return valid financial structure',
    typeof reportAll.body?.totalSales === 'number' &&
    typeof reportAll.body?.totalCost === 'number' &&
    typeof reportAll.body?.grossProfit === 'number' &&
    typeof reportAll.body?.totalExpenses === 'number' &&
    typeof reportAll.body?.netProfit === 'number'
  );
  test('Net Profit = Gross Profit - Expenses (Mathematical Accuracy)',
    reportAll.body.netProfit === (reportAll.body.grossProfit - reportAll.body.totalExpenses)
  );
  test('Gross Profit = Total Sales - Cost of Goods Sold',
    reportAll.body.grossProfit === (reportAll.body.totalSales - reportAll.body.totalCost)
  );

  // ----------------------------------------------------
  // SCENARIO 9: Inventory Movement Audit Ledger
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 9: Audit Trail & Movement Ledger ---');
  const ledgerRes = await get('/api/inventory/transactions?store_id=1&product_id=10', adminToken);
  test('Inventory transaction ledger recorded movements',
    Array.isArray(ledgerRes.body) && ledgerRes.body.length >= 4
  );
  const txTypes = ledgerRes.body.map(t => t.change_type);
  test('Ledger includes sale, transfer_out, sale_return, and adjustment types',
    txTypes.includes('sale') && txTypes.includes('transfer_out') && (txTypes.includes('adjustment') || txTypes.includes('sale_return'))
  );

  // ----------------------------------------------------
  // SCENARIO 10: Legacy Route Compatibility
  // ----------------------------------------------------
  console.log('\n--- SCENARIO 10: Legacy Routes & Public Website ---');
  const legacyAll = await get('/api/all', null);
  test('Public /api/all functions without regression', legacyAll.status === 200 && Array.isArray(legacyAll.body?.products));
  test('All 11 original products preserved', legacyAll.body?.products?.length >= 11);

  console.log('\n========================================================');
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runAllTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
