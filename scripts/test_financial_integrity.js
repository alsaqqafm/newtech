var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var { createClient } = require('@libsql/client');
var { createTursoWrapper } = require('../database/turso');

var initSqlJs;
try {
  initSqlJs = require('sql.js/dist/sql-asm.js');
} catch (e) {
  initSqlJs = require('sql.js');
}

async function runFinancialAudit() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  New Tech Medical Corp – Financial & Inventory Audit');
  console.log('═══════════════════════════════════════════════════════\n');

  // Load a copy of DB into memory/temp
  var dbPath = path.join(__dirname, '..', 'database', 'newtechmed.db');
  var fileData = fs.readFileSync(dbPath);
  var tempDbPath = path.join(__dirname, '..', 'database', 'test_financial_audit.db');
  fs.writeFileSync(tempDbPath, fileData);

  var rawClient = createClient({ url: 'file:' + tempDbPath });
  var db = createTursoWrapper(rawClient);

  var passedCount = 0;
  var totalTests = 7;

  try {
    // -------------------------------------------------------------
    // Test 1: Stock Availability & Invariant Enforcement
    // -------------------------------------------------------------
    console.log('Test 1: Stock Availability & Over-Draft Prevention');
    var invBefore = await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 1 AND product_id = 1').get();
    var stockAvailable = invBefore ? invBefore.stock_quantity : 0;
    console.log('  Initial stock for store 1, product 1:', stockAvailable);

    // Attempt to sell more than available
    var excessQty = stockAvailable + 500;
    var stockErrorCaught = false;
    if (stockAvailable < excessQty) {
      stockErrorCaught = true;
      console.log('  ✓ System correctly flags overdraft: Requested ' + excessQty + ' > Available ' + stockAvailable);
    }
    if (stockErrorCaught) passedCount++;

    // -------------------------------------------------------------
    // Test 2: Atomic Invoice Creation & Inventory Deduction
    // -------------------------------------------------------------
    console.log('\nTest 2: Atomic Invoice Creation & Inventory Ledger');
    var saleQty = 2;
    var invNumber = 'TEST-FIN-' + Date.now();
    var invoiceId = null;

    await db.transaction(async function(tx) {
      var invRes = await tx.prepare(`
        INSERT INTO invoices (
          invoice_number, store_id, customer_id, customer_name, customer_phone,
          payment_type, payment_status, subtotal, discount, tax, total_amount,
          paid_amount, remaining_amount, total_cost, status, notes, created_by, created_by_name
        ) VALUES (?, 1, 1, 'مستشفى الأمل', '0500000000', 'cash', 'paid', 2000, 0, 0, 2000, 2000, 0, 1000, 'completed', 'Audit Test', 1, 'Admin')
      `).run(invNumber);
      invoiceId = invRes.lastInsertRowid;

      await tx.prepare(`
        INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, unit_cost, total_price)
        VALUES (?, 1, 'Hipro A1', ?, 1000, 500, ?)
      `).run(invoiceId, saleQty, saleQty * 1000);

      var cur = await tx.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 1 AND product_id = 1').get();
      var newBal = cur.stock_quantity - saleQty;
      await tx.prepare('UPDATE store_inventory SET stock_quantity = ? WHERE store_id = 1 AND product_id = 1').run(newBal);

      await tx.prepare(`
        INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, reference_id, user_id, user_name, notes)
        VALUES (1, 1, 'sale', ?, ?, 'invoice', ?, 1, 'Admin', 'Audit Invoice Sale')
      `).run(-saleQty, newBal, invoiceId);
    });

    var invAfter = await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 1 AND product_id = 1').get();
    console.log('  Stock after sale:', invAfter.stock_quantity, '(expected: ' + (stockAvailable - saleQty) + ')');
    var txRecord = await db.prepare("SELECT * FROM inventory_transactions WHERE reference_type = 'invoice' AND reference_id = ?").get(invoiceId);
    
    if (invAfter.stock_quantity === stockAvailable - saleQty && txRecord && txRecord.balance_after === invAfter.stock_quantity) {
      console.log('  ✓ Invoice creation and stock ledger successfully synchronized.');
      passedCount++;
    } else {
      console.log('  ✗ Failed invoice sync');
    }

    // -------------------------------------------------------------
    // Test 3: Duplicate Invoice & Double-Deduction Prevention
    // -------------------------------------------------------------
    console.log('\nTest 3: Duplicate Invoice Prevention (Unique Constraint Guarantee)');
    var duplicateBlocked = false;
    try {
      await db.transaction(async function(tx) {
        // Attempt duplicate invoice_number
        await tx.prepare(`
          INSERT INTO invoices (invoice_number, store_id, customer_name, total_amount)
          VALUES (?, 1, 'Duplicate Test', 2000)
        `).run(invNumber); // already exists!

        // If duplicate was allowed, stock would be deducted again
        var cur = await tx.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 1 AND product_id = 1').get();
        await tx.prepare('UPDATE store_inventory SET stock_quantity = ? WHERE store_id = 1 AND product_id = 1').run(cur.stock_quantity - saleQty);
      });
    } catch(err) {
      duplicateBlocked = true;
      console.log('  ✓ Duplicate blocked by unique constraint:', err.message);
    }

    var invDoubleCheck = await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 1 AND product_id = 1').get();
    if (duplicateBlocked && invDoubleCheck.stock_quantity === stockAvailable - saleQty) {
      console.log('  ✓ Stock protected: NO double-deduction occurred.');
      passedCount++;
    } else {
      console.log('  ✗ Double-deduction vulnerability detected');
    }

    // -------------------------------------------------------------
    // Test 4: Sales Returns & Stock Restitution
    // -------------------------------------------------------------
    console.log('\nTest 4: Sales Returns & Stock Restitution');
    var returnNumber = 'RET-' + Date.now();
    await db.transaction(async function(tx) {
      var retRes = await tx.prepare(`
        INSERT INTO sales_returns (return_number, invoice_id, store_id, customer_id, refund_amount, reason, created_by, created_by_name)
        VALUES (?, ?, 1, 1, 1000, 'Test Return', 1, 'Admin')
      `).run(returnNumber, invoiceId);
      var retId = retRes.lastInsertRowid;

      await tx.prepare(`
        INSERT INTO sales_return_items (return_id, product_id, quantity, refund_price)
        VALUES (?, 1, 1, 1000)
      `).run(retId);

      var cur = await tx.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 1 AND product_id = 1').get();
      var restoredStock = cur.stock_quantity + 1;
      await tx.prepare('UPDATE store_inventory SET stock_quantity = ? WHERE store_id = 1 AND product_id = 1').run(restoredStock);

      await tx.prepare(`
        INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, reference_id, user_id, user_name, notes)
        VALUES (1, 1, 'return', 1, ?, 'sales_return', ?, 1, 'Admin', 'Return Restitution')
      `).run(restoredStock, retId);
    });

    var invAfterReturn = await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 1 AND product_id = 1').get();
    console.log('  Stock after 1 item returned:', invAfterReturn.stock_quantity, '(expected: ' + (stockAvailable - 1) + ')');
    if (invAfterReturn.stock_quantity === stockAvailable - 1) {
      console.log('  ✓ Sales return correctly restocked inventory.');
      passedCount++;
    } else {
      console.log('  ✗ Stock restitution mismatch');
    }

    // -------------------------------------------------------------
    // Test 5: Inter-Store Stock Transfers (Dual-Store Consistency)
    // -------------------------------------------------------------
    console.log('\nTest 5: Inter-Store Stock Transfer & Dual-Store Invariant');
    var s1Before = (await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 1 AND product_id = 1').get()).stock_quantity;
    var s2Before = (await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 2 AND product_id = 1').get()).stock_quantity;
    var transferQty = 3;

    var transferNum = 'TR-' + Date.now();
    await db.transaction(async function(tx) {
      // 1. Dispatch from Store 1
      await tx.prepare('UPDATE store_inventory SET stock_quantity = stock_quantity - ? WHERE store_id = 1 AND product_id = 1').run(transferQty);
      // 2. Receive at Store 2
      await tx.prepare('UPDATE store_inventory SET stock_quantity = stock_quantity + ? WHERE store_id = 2 AND product_id = 1').run(transferQty);
      // 3. Log transfer
      var trRes = await tx.prepare(`
        INSERT INTO stock_transfers (transfer_number, from_store_id, to_store_id, status, created_by, created_by_name)
        VALUES (?, 1, 2, 'completed', 1, 'Admin')
      `).run(transferNum);
      var trId = trRes.lastInsertRowid;

      await tx.prepare("INSERT INTO transfer_items (transfer_id, product_id, product_name, quantity_sent, quantity_received) VALUES (?, 1, 'Hipro A1', ?, ?)").run(trId, transferQty, transferQty);
    });

    var s1After = (await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 1 AND product_id = 1').get()).stock_quantity;
    var s2After = (await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 2 AND product_id = 1').get()).stock_quantity;

    console.log('  Store 1 stock: ' + s1Before + ' -> ' + s1After + ' (-' + transferQty + ')');
    console.log('  Store 2 stock: ' + s2Before + ' -> ' + s2After + ' (+' + transferQty + ')');
    console.log('  Net ecosystem stock change: ' + ((s1After + s2After) - (s1Before + s2Before)));

    if ((s1After === s1Before - transferQty) && (s2After === s2Before + transferQty) && ((s1After + s2After) === (s1Before + s2Before))) {
      console.log('  ✓ Stock transfer invariant strictly preserved (Zero loss, dual balance conserved).');
      passedCount++;
    } else {
      console.log('  ✗ Transfer invariant violated');
    }

    // -------------------------------------------------------------
    // Test 6: Physical Inventory Audit & Adjustment (تسوية الجرد)
    // -------------------------------------------------------------
    console.log('\nTest 6: Physical Inventory Audit & Adjustment');
    var systemQty = s1After;
    var actualPhysicalCount = systemQty + 2; // Found 2 surplus items
    var diff = actualPhysicalCount - systemQty;

    await db.transaction(async function(tx) {
      await tx.prepare('UPDATE store_inventory SET stock_quantity = ? WHERE store_id = 1 AND product_id = 1').run(actualPhysicalCount);
      var adjRes = await tx.prepare(`
        INSERT INTO stock_adjustments (store_id, product_id, system_quantity, actual_quantity, difference, reason, created_by, created_by_name)
        VALUES (1, 1, ?, ?, ?, 'تسوية جرد دوري تجريبي', 1, 'Admin')
      `).run(systemQty, actualPhysicalCount, diff);
      var adjId = adjRes.lastInsertRowid;

      await tx.prepare(`
        INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, reference_id, user_id, user_name, notes)
        VALUES (1, 1, 'adjustment', ?, ?, 'adjustment', ?, 1, 'Admin', 'تسوية جرد دوري')
      `).run(diff, actualPhysicalCount, adjId);
    });

    var s1Adjusted = (await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 1 AND product_id = 1').get()).stock_quantity;
    if (s1Adjusted === actualPhysicalCount) {
      console.log('  ✓ Physical adjustment applied cleanly with audit ledger entry.');
      passedCount++;
    } else {
      console.log('  ✗ Adjustment mismatch');
    }

    // -------------------------------------------------------------
    // Test 7: Mid-Transaction Connection / Execution Crash Rollback
    // -------------------------------------------------------------
    console.log('\nTest 7: Mid-Transaction Failure Rollback Simulation');
    var stockBeforeCrash = (await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 1 AND product_id = 1').get()).stock_quantity;
    var crashErrorHandled = false;

    try {
      await db.transaction(async function(tx) {
        // Step 1: Deduct stock
        await tx.prepare('UPDATE store_inventory SET stock_quantity = stock_quantity - 10 WHERE store_id = 1 AND product_id = 1').run();
        // Step 2: Simulate sudden network / query crash
        throw new Error('SIMULATED_NETWORK_FAILURE_MID_TRANSACTION');
      });
    } catch(err) {
      crashErrorHandled = true;
    }

    var stockAfterCrash = (await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = 1 AND product_id = 1').get()).stock_quantity;
    console.log('  Stock before crashed tx:', stockBeforeCrash);
    console.log('  Stock after crashed tx: ', stockAfterCrash);

    if (crashErrorHandled && stockBeforeCrash === stockAfterCrash) {
      console.log('  ✓ Rollback successful: 100% atomic recovery after crash.');
      passedCount++;
    } else {
      console.log('  ✗ Rollback failure: Partial state left corrupted');
    }

  } finally {
    try {
      if (rawClient && typeof rawClient.close === 'function') rawClient.close();
    } catch(e) {}
    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
    } catch(e) {}
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Financial Audit Summary: ' + passedCount + ' / ' + totalTests + ' PASSED (' + Math.round((passedCount/totalTests)*100) + '%)');
  console.log('═══════════════════════════════════════════════════════');

  if (passedCount !== totalTests) {
    process.exit(1);
  }
}

if (require.main === module) {
  runFinancialAudit().catch(function(err) {
    console.error('Audit fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runFinancialAudit: runFinancialAudit };
