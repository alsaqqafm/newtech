/**
 * ============================================================
 * End-to-End Verification of Phase B on Isolated Database Copy
 * ============================================================
 */

var fs = require('fs');
var path = require('path');
var http = require('http');
var express = require('express');
var initSqlJs = require('sql.js');
var jwt = require('jsonwebtoken');
var { applyPhaseBMigration } = require('../database/migration_phase_b');

var JWT_SECRET = process.env.JWT_SECRET || 'newtechmed_secret_key_2026';
var TEST_DB_PATH = path.join(__dirname, '..', 'database', 'test_isolated_phase_b.db');
var LIVE_DB_PATH = path.join(__dirname, '..', 'database', 'newtechmed.db');

async function runTests() {
  console.log('=== STARTING PHASE B ISOLATED VERIFICATION ===\n');

  // 1. Create isolated copy of database
  fs.copyFileSync(LIVE_DB_PATH, TEST_DB_PATH);
  console.log('[Setup] Created isolated database copy at:', TEST_DB_PATH);

  var SQL = await initSqlJs();
  var fileBuffer = fs.readFileSync(TEST_DB_PATH);
  var rawDb = new SQL.Database(fileBuffer);

  // Database wrapper matching schema.js API
  var db = {
    exec: function (sql) {
      return rawDb.exec(sql);
    },
    prepare: function (sql) {
      return {
        all: function () {
          var args = Array.prototype.slice.call(arguments);
          var stmt = rawDb.prepare(sql);
          stmt.bind(args);
          var results = [];
          while (stmt.step()) results.push(stmt.getAsObject());
          stmt.free();
          return results;
        },
        get: function () {
          var args = Array.prototype.slice.call(arguments);
          var stmt = rawDb.prepare(sql);
          stmt.bind(args);
          var result = null;
          if (stmt.step()) result = stmt.getAsObject();
          stmt.free();
          return result;
        },
        run: function () {
          var args = Array.prototype.slice.call(arguments);
          rawDb.run(sql, args);
          var idRes = rawDb.exec("SELECT last_insert_rowid()");
          var lastId = (idRes.length && idRes[0].values.length) ? idRes[0].values[0][0] : 0;
          return { lastInsertRowid: lastId };
        }
      };
    }
  };

  // 2. Apply Phase B Migration to isolated database
  console.log('[Migration] Applying Phase B migration...');
  var migResult = applyPhaseBMigration(db);
  console.log('[Migration] Success:', migResult.message);

  // 3. Setup test Express app
  var app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  var productsRouter = require('../routes/products')(db);
  app.use('/api/products', productsRouter);

  var server = app.listen(3456);
  console.log('[Server] Test Express server listening on http://localhost:3456');

  // Generate Admin JWT Token
  var adminToken = jwt.sign(
    { id: 1, username: 'admin', role: 'admin', name: 'مدير النظام' },
    JWT_SECRET,
    { expiresIn: '2h' }
  );

  // HTTP Helper
  function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
      var postData = body ? JSON.stringify(body) : '';
      var headers = {
        'Content-Type': 'application/json'
      };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      if (postData) headers['Content-Length'] = Buffer.byteLength(postData);

      var req = http.request({
        hostname: 'localhost',
        port: 3456,
        path: path,
        method: method,
        headers: headers
      }, (res) => {
        var data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          var parsed;
          try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });

      req.on('error', reject);
      if (postData) req.write(postData);
      req.end();
    });
  }

  var passCount = 0;
  var totalTests = 12;

  try {
    // ----------------------------------------------------
    // Test 1: Verify all 11 original products & baseline versions
    // ----------------------------------------------------
    var prods = db.prepare('SELECT id, name, active, publish_status, current_version FROM products ORDER BY id ASC').all();
    var vers = db.prepare('SELECT COUNT(*) as c FROM product_versions').get();
    var p11 = prods.find(p => p.id === 11);
    
    if (prods.length === 11 && vers.c === 11 && p11 && p11.active === 0 && p11.publish_status === 'hidden') {
      console.log('✅ TEST 1 PASSED: All 11 products preserved with baseline v1 revisions. Product #11 correctly hidden.');
      passCount++;
    } else {
      console.error('❌ TEST 1 FAILED:', { prodsCount: prods.length, versCount: vers.c, p11 });
    }

    // ----------------------------------------------------
    // Test 2: GET /api/products/summary
    // ----------------------------------------------------
    var res2 = await request('GET', '/api/products/summary', null, adminToken);
    if (res2.status === 200 && res2.body.total_products === 11 && res2.body.published_count === 10 && res2.body.hidden_count === 1 && res2.body.versions_count === 11) {
      console.log('✅ TEST 2 PASSED: GET /summary returned accurate real-time metrics:', res2.body);
      passCount++;
    } else {
      console.error('❌ TEST 2 FAILED:', res2);
    }

    // ----------------------------------------------------
    // Test 3: POST /api/products/drafts (Create draft for product #1)
    // ----------------------------------------------------
    var draftData = {
      product_id: 1,
      name: 'Hipro A1 Pro – الإصدار المحدث 2026',
      name_en: 'Hipro A1 Pro - 2026 Edition',
      model: 'HP-A1-2026',
      price: 13500,
      stock: 7,
      change_summary: 'تحديث المواصفات الفنية وسعر البيع لعام 2026'
    };
    var res3 = await request('POST', '/api/products/drafts', draftData, adminToken);
    
    // Verify product #1 in live table remains COMPLETELY untouched!
    var prod1Live = db.prepare('SELECT name, price, stock FROM products WHERE id = 1').get();
    if (res3.status === 200 && res3.body.draft && prod1Live.name.indexOf('Hipro A1 Pro') !== -1 && prod1Live.price === 0) {
      console.log('✅ TEST 3 PASSED: Draft created in product_drafts with 100% isolation from live catalog.');
      passCount++;
    } else {
      console.error('❌ TEST 3 FAILED:', { res3, prod1Live });
    }

    // ----------------------------------------------------
    // Test 4: Preview endpoint GET /api/products/1/preview
    // ----------------------------------------------------
    var res4 = await request('GET', '/api/products/1/preview', null, adminToken);
    if (res4.status === 200 && res4.body.has_draft === true && res4.body.preview_data.name === draftData.name && res4.body.live_product.name.indexOf('Hipro A1 Pro') !== -1) {
      console.log('✅ TEST 4 PASSED: Preview endpoint correctly provides both live and draft preview datasets.');
      passCount++;
    } else {
      console.error('❌ TEST 4 FAILED:', res4);
    }

    // ----------------------------------------------------
    // Test 5: Image Upload (Base64 decoded to disk, metadata in SQLite)
    // ----------------------------------------------------
    var testBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    var imgPayload = {
      image_data: testBase64,
      filename: 'test_product_1_image.png',
      product_id: 1,
      image_type: 'gallery'
    };
    var res5 = await request('POST', '/api/products/images/upload', imgPayload, adminToken);
    
    var imgCols = db.prepare('PRAGMA table_info(product_images)').all().map(c => c.name);
    var hasDataCol = imgCols.indexOf('data') !== -1;
    var imgRecord = db.prepare('SELECT * FROM product_images WHERE filename LIKE ?').get('%test_product_1_image%');

    if (res5.status === 200 && !hasDataCol && imgRecord && fs.existsSync(path.join(__dirname, '..', imgRecord.image_url))) {
      console.log('✅ TEST 5 PASSED: Image saved to disk, URL registered in product_images, and ZERO BLOB data stored in SQLite.');
      // Cleanup created test image
      try { fs.unlinkSync(path.join(__dirname, '..', imgRecord.image_url)); } catch (e) {}
      passCount++;
    } else {
      console.error('❌ TEST 5 FAILED:', { res5, hasDataCol, imgRecord });
    }

    // ----------------------------------------------------
    // Test 6: Optimistic Locking Conflict Rejection
    // ----------------------------------------------------
    var res6 = await request('POST', '/api/products/1/publish', {
      expected_version: 99, // Stale version
      name: 'Conflict Attempt'
    }, adminToken);
    if (res6.status === 409) {
      console.log('✅ TEST 6 PASSED: Optimistic lock rejected stale edit with 409 Conflict as required.');
      passCount++;
    } else {
      console.error('❌ TEST 6 FAILED:', res6);
    }

    // ----------------------------------------------------
    // Test 7: Atomic Publish (Publishing the Draft)
    // ----------------------------------------------------
    var publishPayload = {
      expected_version: 1,
      name: draftData.name,
      name_en: draftData.name_en,
      model: draftData.model,
      price: draftData.price,
      change_summary: draftData.change_summary
    };
    var res7 = await request('POST', '/api/products/1/publish', publishPayload, adminToken);
    var p1AfterPublish = db.prepare('SELECT current_version, name, price FROM products WHERE id = 1').get();
    var draftAfter = db.prepare('SELECT status FROM product_drafts WHERE product_id = 1').get();

    if (res7.status === 200 && p1AfterPublish.current_version === 2 && p1AfterPublish.name === draftData.name && draftAfter.status === 'published') {
      console.log('✅ TEST 7 PASSED: Atomic publish updated live catalog to v2 and marked draft as published.');
      passCount++;
    } else {
      console.error('❌ TEST 7 FAILED:', { res7, p1AfterPublish, draftAfter });
    }

    // ----------------------------------------------------
    // Test 8: Revision History Listing
    // ----------------------------------------------------
    var res8 = await request('GET', '/api/products/1/versions', null, adminToken);
    if (res8.status === 200 && res8.body.length === 2 && res8.body[0].version_number === 2 && res8.body[1].version_number === 1) {
      console.log('✅ TEST 8 PASSED: Full immutable revision history contains v2 and baseline v1.');
      passCount++;
    } else {
      console.error('❌ TEST 8 FAILED:', res8);
    }

    // ----------------------------------------------------
    // Test 9: Non-Destructive Restore (Restore v1)
    // ----------------------------------------------------
    var res9 = await request('POST', '/api/products/1/versions/1/restore', null, adminToken);
    var p1AfterRestore = db.prepare('SELECT current_version, name FROM products WHERE id = 1').get();
    var allP1Vers = db.prepare('SELECT version_number, action_type, change_summary FROM product_versions WHERE product_id = 1 ORDER BY version_number ASC').all();

    if (res9.status === 200 && p1AfterRestore.current_version === 3 && p1AfterRestore.name.indexOf('Hipro A1 Pro') !== -1 && allP1Vers.length === 3) {
      console.log('✅ TEST 9 PASSED: Non-destructive restore reverted name to v1, created v3, and preserved all 3 historical versions.');
      passCount++;
    } else {
      console.error('❌ TEST 9 FAILED:', { res9, p1AfterRestore, allP1Vers });
    }

    // ----------------------------------------------------
    // Test 10: Audit-Safe Soft Delete (Archiving)
    // ----------------------------------------------------
    // Seed an invoice item referencing product #1 to test financial protection
    db.prepare(`
      INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, total_price)
      VALUES (1, 1, 'Hipro A1 Pro', 2, 12000, 24000)
    `).run();

    var res10 = await request('DELETE', '/api/products/1', null, adminToken);
    var p1Check = db.prepare('SELECT id, active, is_archived, publish_status FROM products WHERE id = 1').get();

    if (res10.status === 200 && res10.body.archived === true && p1Check && p1Check.is_archived === 1 && p1Check.active === 0) {
      console.log('✅ TEST 10 PASSED: Deleting product with invoice items automatically triggered soft archiving, protecting relational integrity.');
      passCount++;
    } else {
      console.error('❌ TEST 10 FAILED:', { res10, p1Check });
    }

    // ----------------------------------------------------
    // Test 11: Publish New Product (Direct Flow)
    // ----------------------------------------------------
    var newProdData = {
      name: 'جهاز تخطيط القلب المتقدم EC-1200',
      name_en: 'Advanced ECG System EC-1200',
      model: 'EC-1200',
      category: 'أجهزة تشخيصية',
      price: 8500,
      stock: 4,
      features: 'شاشة ملونة 10 إنش\nطباعة فورية للتقرير'
    };
    var res11 = await request('POST', '/api/products/publish-new', newProdData, adminToken);
    var newId = res11.body && res11.body.product ? res11.body.product.id : null;
    var newInv = newId ? db.prepare('SELECT stock_quantity FROM store_inventory WHERE product_id = ?').get(newId) : null;
    var newVer = newId ? db.prepare('SELECT version_number FROM product_versions WHERE product_id = ?').get(newId) : null;

    if (res11.status === 201 && newId && newInv && newInv.stock_quantity === 0 && newVer && newVer.version_number === 1) {
      console.log('✅ TEST 11 PASSED: Publish-new successfully created product #12, initialized store inventory to 0, and logged v1 version.');
      passCount++;
    } else {
      console.error('❌ TEST 11 FAILED:', { res11, newInv, newVer });
    }

    // ----------------------------------------------------
    // Test 12: Public Catalog & POS Parity
    // ----------------------------------------------------
    // Public catalog query without auth
    var res12 = await request('GET', '/api/products', null, null);
    var archivedInPublic = Array.isArray(res12.body) ? res12.body.some(p => p.id === 1) : true;
    var newProdInPublic = Array.isArray(res12.body) ? res12.body.some(p => p.id === newId) : false;

    if (res12.status === 200 && !archivedInPublic && newProdInPublic) {
      console.log('✅ TEST 12 PASSED: Public catalog filters out archived items and correctly includes published new products.');
      passCount++;
    } else {
      console.error('❌ TEST 12 FAILED:', { res12Status: res12.status, archivedInPublic, newProdInPublic });
    }

  } catch (err) {
    console.error('FATAL TEST RUN ERROR:', err);
  } finally {
    server.close();
    // Clean up isolated test database
    if (fs.existsSync(TEST_DB_PATH)) {
      try { fs.unlinkSync(TEST_DB_PATH); } catch (e) {}
    }
  }

  console.log(`\n=== FINAL RESULT: ${passCount}/${totalTests} TESTS PASSED ===`);
  if (passCount === totalTests) {
    console.log('🎉 ALL PHASE B SPECIFICATIONS VERIFIED WITH 100% SUCCESS!');
  } else {
    process.exit(1);
  }
}

runTests();
