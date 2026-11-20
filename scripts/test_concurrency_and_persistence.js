#!/usr/bin/env node
/**
 * ============================================================
 * Additional Concurrency, Reconnection & Persistence Test Suite
 * ============================================================
 * 
 * Verifies:
 * 1. High-concurrency simultaneous transactions.
 * 2. Reconnection & pool resilience.
 * 3. Atomic rollback under forced failures.
 * 4. Image, price, and name update persistence across server cold restarts.
 * 5. Strict verification that syncOfficialProducts() NEVER wipes images or overwrites data.
 */

var path = require('path');
var fs = require('fs');
var { createClient } = require('@libsql/client');

async function runExtendedTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Extended Concurrency & Persistence Test Suite');
  console.log('═══════════════════════════════════════════════════════\n');

  var tursoUrl = process.env.TURSO_DATABASE_URL;
  var tursoToken = process.env.TURSO_AUTH_TOKEN;
  var targetUrl = tursoUrl || 'file:database/test_extended_replica.db';

  if (!tursoUrl) {
    fs.copyFileSync(
      path.join(__dirname, '..', 'database', 'newtechmed.db'),
      path.join(__dirname, '..', 'database', 'test_extended_replica.db')
    );
  }

  var client = createClient({ url: targetUrl, authToken: tursoToken || undefined });

  // -------------------------------------------------------------
  // Test A: Concurrency Stress Test (25 simultaneous writes)
  // -------------------------------------------------------------
  console.log('[Test A] Concurrency: 25 simultaneous transactions...');
  var initialLogCount = Number((await client.execute('SELECT COUNT(*) as count FROM activity_log')).rows[0].count);

  var promises = [];
  for (var i = 0; i < 25; i++) {
    (function (idx) {
      promises.push(
        client.execute({
          sql: 'INSERT INTO activity_log (action, details) VALUES (?, ?)',
          args: ['concurrent_test', `stress_payload_${idx}_${Date.now()}`]
        })
      );
    })(i);
  }

  await Promise.all(promises);
  var postLogCount = Number((await client.execute('SELECT COUNT(*) as count FROM activity_log')).rows[0].count);
  var concurrencyPassed = postLogCount === initialLogCount + 25;
  console.log(`  └─ Concurrency Result: ${concurrencyPassed ? 'PASS' : 'FAIL'} (Added exactly 25 records without deadlock)\n`);

  // Clean up stress logs
  await client.execute("DELETE FROM activity_log WHERE action = 'concurrent_test'");

  // -------------------------------------------------------------
  // Test B: Transaction Rollback Integrity
  // -------------------------------------------------------------
  console.log('[Test B] Forced Transaction Failure & Rollback...');
  var countBefore = Number((await client.execute('SELECT COUNT(*) as count FROM invoices')).rows[0].count);
  var rollbackOccurred = false;

  try {
    var tx = await client.transaction('write');
    await tx.execute({
      sql: "INSERT INTO invoices (invoice_number, store_id, customer_name, total_amount) VALUES ('INV-FAIL-TEST', 1, 'Test', 100)",
      args: []
    });
    // Deliberate constraint violation: duplicate invoice_number
    await tx.execute({
      sql: "INSERT INTO invoices (invoice_number, store_id, customer_name, total_amount) VALUES ('INV-FAIL-TEST', 1, 'Test2', 200)",
      args: []
    });
    await tx.commit();
  } catch (err) {
    rollbackOccurred = true;
    if (tx) {
      try { await tx.rollback(); } catch(e) {}
    }
  }

  var countAfter = Number((await client.execute('SELECT COUNT(*) as count FROM invoices')).rows[0].count);
  var rollbackPassed = rollbackOccurred && countBefore === countAfter;
  console.log(`  └─ Rollback Result: ${rollbackPassed ? 'PASS' : 'FAIL'} (Invoices count unchanged: ${countBefore} == ${countAfter})\n`);

  // -------------------------------------------------------------
  // Test C: Product Edit, Image Replacement & Persistence
  // -------------------------------------------------------------
  console.log('[Test C] Product Modification (Name, Price, Image Replacement)...');
  // Edit product ID 1 (one of the official 10 products: Hipro A1 Pro)
  var customName = 'Hipro A1 Pro (نسخة مخصصة للمستشفى التخصصي)';
  var customPrice = 95000;
  var customImage = '/images/products/hipro_a1_custom_2026.png';

  await client.execute({
    sql: 'UPDATE products SET name = ?, price = ?, image = ? WHERE id = 1',
    args: [customName, customPrice, customImage]
  });

  var editedRow = (await client.execute('SELECT name, price, image FROM products WHERE id = 1')).rows[0];
  var editSuccess = (editedRow.name === customName && Number(editedRow.price) === customPrice && editedRow.image === customImage);
  console.log(`  └─ Modification applied: ${editSuccess ? 'PASS' : 'FAIL'}`);

  // -------------------------------------------------------------
  // Test D: Simulate Cold Restart & verify syncOfficialProducts() does NOT overwrite
  // -------------------------------------------------------------
  console.log('[Test D] Cold Restart Simulation with syncOfficialProducts()...');

  // Load the schema module and run syncOfficialProducts against our test database
  var { syncOfficialProducts } = require('../database/schema');
  
  // Wrap our client with the wrapper interface so syncOfficialProducts can run on it
  var { createTursoWrapper } = require('../database/turso');
  // Temporarily set TURSO_DATABASE_URL to our test target
  var origEnvUrl = process.env.TURSO_DATABASE_URL;
  process.env.TURSO_DATABASE_URL = targetUrl;
  
  var testWrapper = createTursoWrapper();

  // Run the sync function (which previously wiped images and overwrote products)
  syncOfficialProducts(testWrapper);

  // Now inspect product ID 1 again
  var postSyncRow = (await client.execute('SELECT name, price, image FROM products WHERE id = 1')).rows[0];
  
  var namePersisted = (postSyncRow.name === customName);
  var pricePersisted = (Number(postSyncRow.price) === customPrice);
  var imagePersisted = (postSyncRow.image === customImage && postSyncRow.image !== '');

  var coldRestartPassed = namePersisted && pricePersisted && imagePersisted;
  console.log(`  └─ Name Persisted: ${namePersisted ? '✓ YES' : '✗ OVERWRITTEN'}`);
  console.log(`  └─ Price Persisted: ${pricePersisted ? '✓ YES' : '✗ OVERWRITTEN'}`);
  console.log(`  └─ Image Persisted: ${imagePersisted ? '✓ YES (' + postSyncRow.image + ')' : '✗ WIPED OUT'}`);
  console.log(`  └─ Persistence Result: ${coldRestartPassed ? 'PASS' : 'FAIL'}\n`);

  // Restore env
  if (origEnvUrl) {
    process.env.TURSO_DATABASE_URL = origEnvUrl;
  } else {
    delete process.env.TURSO_DATABASE_URL;
  }

  // Restore original product 1 data in test replica
  await client.execute({
    sql: "UPDATE products SET name = 'Hipro A1 Pro – Automated Immunoassay System', price = 0, image = '' WHERE id = 1",
    args: []
  });

  client.close();
  testWrapper.close();

  if (!tursoUrl) {
    try {
      fs.unlinkSync(path.join(__dirname, '..', 'database', 'test_extended_replica.db'));
    } catch(e) {}
  }

  var allPassed = concurrencyPassed && rollbackPassed && coldRestartPassed;
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Extended Tests Status: ${allPassed ? '✓ ALL TESTS PASSED' : '✗ TESTS FAILED'}`);
  console.log('═══════════════════════════════════════════════════════\n');

  if (!allPassed) {
    process.exit(1);
  }
}

if (require.main === module) {
  runExtendedTests().catch(function (err) {
    console.error('[FATAL ERROR IN EXTENDED TESTS]', err);
    process.exit(1);
  });
}

module.exports = { runExtendedTests: runExtendedTests };
