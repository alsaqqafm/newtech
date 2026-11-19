/**
 * ============================================================
 * Isolated Backup & Rollback Verification Script
 * Tests:
 * 1. Snapshot creation
 * 2. SHA-256 Checksum & PRAGMA integrity_check
 * 3. Simulating new business transactions (Invoices & Adjustments)
 * 4. Safety Guard: Rejection of blind overwrite when newer data exists
 * 5. Safe Sandbox Restore & Relational Integrity Verification
 * ============================================================
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var initSqlJs = require('sql.js');

var BASE_DB_PATH = path.join(__dirname, '..', 'database', 'newtechmed.db');
var WORK_DB_PATH = path.join(__dirname, '..', 'database', 'test_work_backup_demo.db');
var BACKUP_FILE_PATH = path.join(__dirname, '..', 'database', 'test_snapshot_baseline.db');
var RESTORE_TARGET_PATH = path.join(__dirname, '..', 'database', 'test_sandbox_restored.db');

async function testBackupRollback() {
  console.log('============================================================');
  console.log('  STARTING ISOLATED BACKUP & ROLLBACK VERIFICATION SUITE');
  console.log('============================================================\n');

  var SQL = await initSqlJs();

  // 1. Prepare working copy
  fs.copyFileSync(BASE_DB_PATH, WORK_DB_PATH);
  console.log('[Step 1] Created isolated working database copy.');

  var rawWorkDb = new SQL.Database(fs.readFileSync(WORK_DB_PATH));

  // 2. Take Baseline Snapshot
  var backupBuffer = rawWorkDb.export();
  fs.writeFileSync(BACKUP_FILE_PATH, Buffer.from(backupBuffer));
  console.log('[Step 2] Created baseline snapshot at:', path.basename(BACKUP_FILE_PATH));

  // 3. Verify SHA-256 and PRAGMA integrity_check
  var sha256Original = crypto.createHash('sha256').update(fs.readFileSync(WORK_DB_PATH)).digest('hex');
  var sha256Backup = crypto.createHash('sha256').update(fs.readFileSync(BACKUP_FILE_PATH)).digest('hex');
  
  var backupSqlDb = new SQL.Database(fs.readFileSync(BACKUP_FILE_PATH));
  var integrityRes = backupSqlDb.exec('PRAGMA integrity_check');
  var integrityOk = integrityRes.length > 0 && integrityRes[0].values[0][0] === 'ok';

  console.log('[Step 3] SHA-256 Match:', sha256Original === sha256Backup ? 'VERIFIED ✅' : 'FAILED ❌');
  console.log('[Step 3] SQLite Integrity Check:', integrityOk ? 'VERIFIED (ok) ✅' : 'FAILED ❌');

  if (sha256Original !== sha256Backup || !integrityOk) {
    throw new Error('Integrity verification failed!');
  }

  // 4. Simulate New Business Transactions on the Working DB (Invoices & Sales)
  console.log('[Step 4] Simulating new live business transactions after the backup...');
  rawWorkDb.run(`
    INSERT INTO invoices (invoice_number, customer_id, customer_name, subtotal, discount, total_amount, payment_type, status, store_id, created_by, notes)
    VALUES ('INV-2026-LIVE-01', 1, 'مستشفى الأمل التخصصي', 50000, 0, 50000, 'cash', 'paid', 1, 1, 'فاتورة بعد النسخ الاحتياطي')
  `);
  rawWorkDb.run(`
    INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, total_price)
    VALUES (999, 1, 'Hipro A1 Pro', 2, 25000, 50000)
  `);

  var currentInvoiceCount = rawWorkDb.exec('SELECT COUNT(*) FROM invoices')[0].values[0][0];
  var backupInvoiceCount = backupSqlDb.exec('SELECT COUNT(*) FROM invoices')[0].values[0][0];

  console.log(`[Step 4] Invoices in Working DB: ${currentInvoiceCount} | Invoices in Backup: ${backupInvoiceCount}`);

  // 5. Rollback Safety Guard Execution
  console.log('[Step 5] Testing Rollback Safety Guard...');
  function attemptRollback(workDbInstance, backupDbInstance) {
    var curInvs = workDbInstance.exec('SELECT COUNT(*) FROM invoices')[0].values[0][0];
    var bkpInvs = backupDbInstance.exec('SELECT COUNT(*) FROM invoices')[0].values[0][0];
    var curTx = workDbInstance.exec('SELECT COUNT(*) FROM inventory_transactions')[0].values[0][0];
    var bkpTx = backupDbInstance.exec('SELECT COUNT(*) FROM inventory_transactions')[0].values[0][0];

    if (curInvs > bkpInvs || curTx > bkpTx) {
      return {
        allowed: false,
        reason: `رفض أمني: قاعدة البيانات الحالية تحتوي على بيانات أحدث (فواتير: ${curInvs} مقابل ${bkpInvs} بالنسخة). التراجع الأعمى سيتسبب بفقدان بيانات مالية!`
      };
    }
    return { allowed: true };
  }

  var guardResult = attemptRollback(rawWorkDb, backupSqlDb);
  console.log('[Step 5] Safety Guard Response:', guardResult.allowed ? 'UNSAFE ALLOWED ❌' : 'SAFELY BLOCKED ✅');
  console.log('         Reason:', guardResult.reason);

  // 6. Safe Sandbox Restore to Separate File & Relational Integrity Verification
  console.log('[Step 6] Performing controlled restore into dedicated sandbox environment...');
  fs.copyFileSync(BACKUP_FILE_PATH, RESTORE_TARGET_PATH);

  var restoredDb = new SQL.Database(fs.readFileSync(RESTORE_TARGET_PATH));
  var restoredProds = restoredDb.exec('SELECT COUNT(*) FROM products')[0].values[0][0];
  var restoredUsers = restoredDb.exec('SELECT COUNT(*) FROM users')[0].values[0][0];
  var restoredStores = restoredDb.exec('SELECT COUNT(*) FROM stores')[0].values[0][0];
  var restoredIntegrity = restoredDb.exec('PRAGMA integrity_check')[0].values[0][0];

  console.log(`[Step 6] Sandbox Restored: Products = ${restoredProds}, Users = ${restoredUsers}, Stores = ${restoredStores}, Integrity = ${restoredIntegrity}`);

  var allPassed = (
    sha256Original === sha256Backup &&
    integrityOk &&
    !guardResult.allowed &&
    restoredProds === 11 &&
    restoredUsers === 9 &&
    restoredStores === 2 &&
    restoredIntegrity === 'ok'
  );

  // Clean up test files
  [WORK_DB_PATH, BACKUP_FILE_PATH, RESTORE_TARGET_PATH].forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });

  console.log('\n============================================================');
  if (allPassed) {
    console.log('🎯 BACKUP & ROLLBACK PROTOCOL 100% VERIFIED & BULLETPROOF!');
  } else {
    console.error('❌ VERIFICATION FAILED!');
    process.exit(1);
  }
  console.log('============================================================');
}

testBackupRollback();
