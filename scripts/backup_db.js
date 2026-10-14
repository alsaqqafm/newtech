const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function createBackup() {
  const dbPath = path.join(__dirname, '..', 'database', 'newtechmed.db');
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `newtechmed_backup_pre_migration_${timestamp}.db`;
  const backupPath = path.join(backupDir, backupFileName);

  fs.copyFileSync(dbPath, backupPath);

  // Validate the backup by reading it with sql.js
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(backupPath);
  const db = new SQL.Database(fileBuffer);
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table';");
  const count = tables.length > 0 ? tables[0].values.length : 0;

  const metadata = {
    originalPath: dbPath,
    backupFile: backupFileName,
    backupPath: backupPath,
    createdAt: new Date().toISOString(),
    sizeBytes: fs.statSync(backupPath).size,
    tableCount: count,
    verified: true
  };

  const metaPath = path.join(backupDir, `backup_metadata_${timestamp}.json`);
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

  console.log('Backup created and verified successfully:');
  console.log(JSON.stringify(metadata, null, 2));
  return backupPath;
}

createBackup().catch(err => {
  console.error('Backup failed:', err);
  process.exit(1);
});
