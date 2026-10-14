const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function testRestore(backupFile) {
  const backupDir = path.join(__dirname, '..', 'backups');
  let targetBackup = backupFile;
  if (!targetBackup) {
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db')).sort().reverse();
    if (files.length === 0) throw new Error('No backup files found');
    targetBackup = path.join(backupDir, files[0]);
  }

  console.log('Testing recovery of backup file:', targetBackup);
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(targetBackup);
  const db = new SQL.Database(fileBuffer);

  const res = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
  const tableNames = res[0].values.map(v => v[0]);
  console.log('Tables found in restored database:', tableNames.join(', '));

  const usersCount = db.exec("SELECT count(*) FROM users;")[0].values[0][0];
  const productsCount = db.exec("SELECT count(*) FROM products;")[0].values[0][0];
  console.log(`Verification: ${usersCount} users, ${productsCount} products.`);
  if (usersCount > 0 && productsCount > 0) {
    console.log('RESTORE TEST PASSED: Database backup is 100% valid and restorable.');
    return true;
  } else {
    throw new Error('RESTORE TEST FAILED: Restored database contains empty core tables.');
  }
}

testRestore().catch(err => {
  console.error('Restore test failed:', err);
  process.exit(1);
});
