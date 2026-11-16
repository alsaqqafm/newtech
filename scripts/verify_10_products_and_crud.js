const http = require('http');
const fs = require('fs');
const path = require('path');

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
  console.log('====================================================');
  console.log(' Comprehensive Testing: 10 Products, CRUD & Bilingual');
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Fetch products from /api/products
  console.log('\n--- Test 1: Fetching Products from API ---');
  const prodsRes = await request('http://localhost:3000/api/products');
  assert(prodsRes.statusCode === 200, 'GET /api/products returned 200 OK');
  const products = JSON.parse(prodsRes.data);
  assert(products.length >= 10, `Products array has at least 10 items (actual: ${products.length})`);

  // 2. Verify all 10 official products exist with accurate data
  console.log('\n--- Test 2: Verifying the 10 Official Products ---');
  const expectedProducts = [
    {
      nameSubstring: 'Hipro A1 Pro',
      company: 'Hipro',
      model: 'A1 Pro',
      image: 'images/hipro-a1-pro.png',
      hasArabicDesc: true,
      hasEnglishDesc: true
    },
    {
      nameSubstring: 'Hipro Hurricane',
      company: 'Hipro',
      model: 'Hurricane',
      image: 'images/hipro-hurricane.png',
      hasArabicDesc: true,
      hasEnglishDesc: true
    },
    {
      nameSubstring: 'PT1000',
      company: 'EasyDiagnosis',
      model: 'PT1000',
      image: 'images/pt1000.jpeg',
      hasArabicDesc: true,
      hasEnglishDesc: true
    },
    {
      nameSubstring: 'DX',
      company: 'EasyDiagnosis',
      model: 'DX',
      image: 'images/dx-electrolyte.jpeg',
      hasArabicDesc: true,
      hasEnglishDesc: true
    },
    {
      nameSubstring: 'QFT9000',
      company: 'EasyDiagnosis',
      model: 'QFT9000 Pro II',
      image: 'images/qft9000.jpeg',
      hasArabicDesc: true,
      hasEnglishDesc: true
    },
    {
      nameSubstring: 'Hipro A1',
      company: 'Hipro',
      model: 'A1',
      image: 'images/placeholder-product.svg',
      hasArabicDesc: true,
      hasEnglishDesc: true
    },
    {
      nameSubstring: 'Seamaty SG1',
      company: 'Seamaty',
      model: 'SG1',
      image: 'images/seamaty-sg1.jpeg',
      hasArabicDesc: true,
      hasEnglishDesc: true
    },
    {
      nameSubstring: 'Thrombotimer',
      company: 'Behnk Elektronik',
      model: 'Thrombotimer',
      image: 'images/thrombotimer.jpeg',
      hasArabicDesc: true,
      hasEnglishDesc: true
    },
    {
      nameSubstring: 'Thrombostat',
      company: 'Behnk Elektronik',
      model: 'Thrombostat',
      image: 'images/thrombostat.jpeg',
      hasArabicDesc: true,
      hasEnglishDesc: true
    },
    {
      nameSubstring: 'Behnk Reagents',
      company: 'Behnk Elektronik',
      model: 'Reagents',
      image: 'images/behnk-reagents.jpeg',
      hasArabicDesc: true,
      hasEnglishDesc: true
    }
  ];

  for (const exp of expectedProducts) {
    const p = products.find(prod => 
      prod.model === exp.model || 
      (prod.name && prod.name.includes(exp.nameSubstring)) ||
      (prod.name_en && prod.name_en.includes(exp.nameSubstring))
    );

    assert(p !== undefined, `Found product matching "${exp.nameSubstring}" (model: ${exp.model})`);
    if (p) {
      assert(p.agent === exp.company, `Company/Agent for ${exp.model} matches "${exp.company}" (got: "${p.agent}")`);
      assert(p.description && p.description.length > 20, `Arabic description present for ${exp.model}`);
      assert(p.description_en && p.description_en.length > 20, `English description present for ${exp.model}`);
      assert(p.name_en && p.name_en.length > 3, `English name present for ${exp.model}: "${p.name_en}"`);
      assert(p.price === 0, `No invented price (price === 0) for ${exp.model}`);

      // Verify file exists on disk
      const cleanImgPath = exp.image.replace(/^\.\.\//, '');
      const fullDiskPath = path.join(__dirname, '..', cleanImgPath);
      assert(fs.existsSync(fullDiskPath), `Image file exists on disk: ${cleanImgPath}`);
    }
  }

  // 3. Admin Authentication & Role-based CRUD
  console.log('\n--- Test 3: Admin Authentication & Product CRUD ---');
  const loginRes = await request('http://localhost:3000/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    username: 'mohammed.f.saqqaf@gmail.com',
    password: '772522233'
  });
  assert(loginRes.statusCode === 200, 'Admin login succeeded (200 OK)');
  const adminToken = JSON.parse(loginRes.data).token;
  assert(adminToken !== undefined, 'Admin token acquired');

  // Test unauthorized product creation (No token)
  const unauthAdd = await request('http://localhost:3000/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { name: 'Test Unauthorized Product' });
  assert(unauthAdd.statusCode === 401 || unauthAdd.statusCode === 403, 'Unauthorized product addition rejected (401/403)');

  // Test authorized product creation (Admin)
  const newProductPayload = {
    name: 'جهاز تحليل فحص عشوائي تجريبي',
    name_en: 'Experimental Random Diagnostic Unit',
    model: 'EXP-999',
    category: 'أجهزة مخبرية',
    agent: 'NewTech Labs',
    manufacturer: 'NewTech Labs',
    price: 0,
    stock: 2,
    status: 'متوفر',
    description: 'جهاز تجريبي لاختبار دورة حياة المنتجات في النظام.',
    description_en: 'An experimental product to test creation, modification, and deletion lifecycle.',
    keywords: 'test, experimental, crud'
  };

  const createRes = await request('http://localhost:3000/api/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, newProductPayload);

  assert(createRes.statusCode === 201, `Authorized product created (201 Created): ID ${JSON.parse(createRes.data).id}`);
  const createdId = JSON.parse(createRes.data).id;

  // Test editing the created product
  console.log('\n--- Test 4: Editing Product via PUT ---');
  const editPayload = {
    name: 'جهاز تحليل فحص عشوائي تجريبي - معدل',
    name_en: 'Experimental Diagnostic Unit - Modified',
    price: 0,
    stock: 5,
    status: 'متوفر'
  };
  const editRes = await request(`http://localhost:3000/api/products/${createdId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, editPayload);
  assert(editRes.statusCode === 200, `Product #${createdId} updated successfully (200 OK)`);
  const updatedProduct = JSON.parse(editRes.data);
  assert(updatedProduct.name === 'جهاز تحليل فحص عشوائي تجريبي - معدل', 'Product Arabic name verified after update');
  assert(updatedProduct.name_en === 'Experimental Diagnostic Unit - Modified', 'Product English name verified after update');

  // Test deleting the product
  console.log('\n--- Test 5: Deleting Product via DELETE ---');
  const deleteRes = await request(`http://localhost:3000/api/products/${createdId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${adminToken}`
    }
  });
  assert(deleteRes.statusCode === 200, `Product #${createdId} deleted successfully (200 OK)`);

  // Verify deletion in DB
  const getDeletedRes = await request(`http://localhost:3000/api/products/${createdId}`);
  assert(getDeletedRes.statusCode === 404, `Product #${createdId} no longer exists (404 Not Found)`);

  // 4. Test Cart and Quote submission for Official Products
  console.log('\n--- Test 6: Public Storefront Order & Quote Submissions ---');
  const publicQuoteRes = await request('http://localhost:3000/api/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    name: 'د. يحيى الشامي',
    email: 'yahya@clinic.ye',
    phone: '+967 770 000 111',
    product: 'Hipro A1 Pro – Automated Immunoassay System',
    message: 'نرجو تزويدنا بعرض سعر وتفاصيل التوريد لجهاز Hipro A1 Pro.'
  });
  assert(publicQuoteRes.statusCode === 201, 'Public quotation for official product submitted successfully (201)');

  const publicOrderRes = await request('http://localhost:3000/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    customer_name: 'مستوصف السلام الدولي',
    phone: '+967 712 345 678',
    notes: 'طلب توريد جهاز PT1000 وجهاز DX Electrolyte',
    store_id: 1,
    items: [
      { product_id: 4, quantity: 1, price: 0 },
      { product_id: 5, quantity: 1, price: 0 }
    ]
  });
  assert(publicOrderRes.statusCode === 201, 'Public storefront order with official products created successfully (201)');

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================');

  if (failed === 0) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
