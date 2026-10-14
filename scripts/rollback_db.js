const fs = require('fs');
const path = require('path');

function rollback() {
  const backupDir = path.join(__dirname, '..', 'backups');
  const dbPath = path.join(__dirname, '..', 'database', 'newtechmed.db');

  const files = fs.readdirSync(backupDir).filter(f => f.startsWith('newtechmed_backup_pre_migration_') && f.endsWith('.db')).sort().reverse();
  if (files.length === 0) {
    console.error('No pre-migration backup found!');
    process.exit(1);
  }

  const latestBackup = path.join(backupDir, files[0]);
  console.log('Rolling back database from:', latestBackup);
  fs.copyFileSync(latestBackup, dbPath);
  console.log('Database successfully rolled back to pre-migration state.');
}

rollback();
