const http = require('http');

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  console.log('--- Testing Frontend & API Routes ---');
  const urls = [
    'http://localhost:3000/',
    'http://localhost:3000/pages/about.html',
    'http://localhost:3000/pages/products.html',
    'http://localhost:3000/pages/services.html',
    'http://localhost:3000/pages/partners.html',
    'http://localhost:3000/pages/contact.html',
    'http://localhost:3000/admin/login.html',
    'http://localhost:3000/css/style.css',
    'http://localhost:3000/js/translations.js',
    'http://localhost:3000/js/main.js',
    'http://localhost:3000/images/logo.png',
    'http://localhost:3000/api/products',
    'http://localhost:3000/api/partners',
    'http://localhost:3000/api/all'
  ];

  let failures = 0;
  for (const u of urls) {
    try {
      const res = await request(u);
      if (res.statusCode >= 200 && res.statusCode < 400) {
        console.log(`[PASS] ${res.statusCode} ${u}`);
      } else {
        console.error(`[FAIL] ${res.statusCode} ${u}`);
        failures++;
      }
    } catch (err) {
      console.error(`[ERROR] ${u}: ${err.message}`);
      failures++;
    }
  }

  // Test submitting a quote as a storefront visitor
  console.log('\n--- Testing Storefront Quote Submission ---');
  try {
    const quotePayload = {
      name: 'د. سامي العواضي - مستشفى الأمل',
      email: 'sami@hope-hospital.ye',
      phone: '+967 777 123 456',
      product: 'جهاز تحليل الكيمياء الحيوية الآلي',
      message: 'يرجى تقديم عرض سعر للجهاز مع الضمان والصيانة لمدة سنتين'
    };
    const quoteRes = await request('http://localhost:3000/api/quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, quotePayload);

    if (quoteRes.statusCode === 201 || quoteRes.statusCode === 200) {
      console.log(`[PASS] Quote created successfully: ${quoteRes.statusCode}`);
      console.log('Response:', quoteRes.data);
    } else {
      console.error(`[FAIL] Quote creation failed: ${quoteRes.statusCode}`, quoteRes.data);
      failures++;
    }
  } catch (err) {
    console.error(`[ERROR] Quote creation error: ${err.message}`);
    failures++;
  }

  // Test submitting an order from storefront cart as a guest
  console.log('\n--- Testing Storefront Cart Order Submission ---');
  try {
    const orderPayload = {
      customer_name: 'مركز النخبة للعيادات',
      phone: '+967 711 222 333',
      notes: 'طلب توريد تجريبي للمركز - الدفع عند الاستلام',
      store_id: 1,
      items: [
        { product_id: 1, quantity: 2, price: 15000 },
        { product_id: 2, quantity: 1, price: 8500 }
      ]
    };
    const orderRes = await request('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, orderPayload);

    if (orderRes.statusCode === 201 || orderRes.statusCode === 200) {
      console.log(`[PASS] Order created successfully: ${orderRes.statusCode}`);
      console.log('Response:', orderRes.data);
    } else {
      console.error(`[FAIL] Order creation failed: ${orderRes.statusCode}`, orderRes.data);
      failures++;
    }
  } catch (err) {
    console.error(`[ERROR] Order creation error: ${err.message}`);
    failures++;
  }

  // Test admin verification of the created quote and order
  console.log('\n--- Testing Admin Verification of Submitted Records ---');
  try {
    // Admin Login at /api/login
    const loginRes = await request('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      username: 'mohammed.f.saqqaf@gmail.com',
      password: '772522233'
    });

    const loginData = JSON.parse(loginRes.data);
    if (!loginData.token) {
      throw new Error('Admin login failed: ' + loginRes.data);
    }
    const token = loginData.token;
    console.log(`[PASS] Admin logged in. Token acquired.`);

    // Fetch quotes as admin
    const quotesRes = await request('http://localhost:3000/api/quotes', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const quotes = JSON.parse(quotesRes.data);
    console.log(`[PASS] Fetched quotes count: ${quotes.length}`);
    const foundQuote = quotes.find(q => q.email === 'sami@hope-hospital.ye');
    if (foundQuote) {
      console.log(`[PASS] Found submitted quote ID: ${foundQuote.id}, Status: ${foundQuote.status}`);
    } else {
      console.error('[FAIL] Could not find recently submitted quote!');
      failures++;
    }

    // Fetch orders as admin
    const ordersRes = await request('http://localhost:3000/api/orders', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const ordersData = JSON.parse(ordersRes.data);
    const ordersList = ordersData.orders || ordersData;
    console.log(`[PASS] Fetched orders count: ${ordersList.length}`);
    const foundOrder = ordersList.find(o => o.customer_name === 'مركز النخبة للعيادات');
    if (foundOrder) {
      console.log(`[PASS] Found submitted order ID: ${foundOrder.id}, Total/Amount: ${foundOrder.amount || foundOrder.total_amount}`);
    } else {
      console.error('[FAIL] Could not find recently submitted order!');
      failures++;
    }
  } catch (err) {
    console.error(`[ERROR] Admin verification error: ${err.message}`);
    failures++;
  }

  console.log('\n=======================================');
  if (failures === 0) {
    console.log('ALL FRONTEND & API FLOW TESTS PASSED! (0 failures)');
  } else {
    console.log(`TESTS FINISHED WITH ${failures} FAILURE(S)`);
    process.exit(1);
  }
}

run();
