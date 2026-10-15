const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function testRestore() {
  const externalDir = 'C:\\Users\\Owner\\.gemini\\antigravity-ide\\brain\\8a855b5e-77fe-4f4b-9893-831e26504f1a\\secure_db_backups';
  const files = fs.readdirSync(externalDir).filter(f => f.endsWith('.db'));
  if (files.length === 0) throw new Error('No backup files found in ' + externalDir);

  const latestBackup = files.sort().reverse()[0];
  const backupPath = path.join(externalDir, latestBackup);
  console.log('Testing restoration of:', backupPath);

  const buffer = fs.readFileSync(backupPath);
  const SQL = await initSqlJs();
  const db = new SQL.Database(buffer);

  // Run integrity check
  const integrity = db.exec('PRAGMA integrity_check;');
  console.log('Integrity check result:', integrity[0].values[0][0]);
  if (integrity[0].values[0][0] !== 'ok') {
    throw new Error('Database integrity check failed!');
  }

  // Verify Admin user exists
  const adminUser = db.exec("SELECT id, name, email, role FROM users WHERE email = 'mohammed.f.saqqaf@gmail.com'");
  if (adminUser.length === 0 || adminUser[0].values.length === 0) {
    throw new Error('Admin user mohammed.f.saqqaf@gmail.com not found in backup!');
  }
  console.log('Admin user verified in restored DB:', adminUser[0].values[0]);

  // Verify Stores exist
  const stores = db.exec("SELECT id, name, code FROM stores");
  console.log('Stores verified in restored DB:', stores[0].values);

  console.log('RESTORATION TEST PASSED: 100% SUCCESS');
}

testRestore().catch(err => {
  console.error('Restore test failed:', err);
  process.exit(1);
});
