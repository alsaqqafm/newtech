const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

async function inspect() {
  const dbPath = path.join(__dirname, '..', 'database', 'newtechmed.db');
  if (!fs.existsSync(dbPath)) {
    console.log('DB file does not exist at:', dbPath);
    return;
  }
  const stats = fs.statSync(dbPath);
  console.log('DB File size:', stats.size, 'bytes');

  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  const tablesRes = db.exec("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;");
  console.log('--- TABLES ---');
  if (tablesRes.length > 0) {
    tablesRes[0].values.forEach(row => {
      console.log('Table:', row[0]);
      console.log('SQL:', row[1]);
      try {
        const countRes = db.exec(`SELECT count(*) FROM "${row[0]}"`);
        console.log('Row count:', countRes[0].values[0][0]);
      } catch (e) {
        console.log('Could not count:', e.message);
      }
      console.log('---------------------------');
    });
  }
}

inspect().catch(console.error);
