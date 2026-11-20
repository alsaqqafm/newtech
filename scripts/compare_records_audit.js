var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var initSqlJs;
try {
  initSqlJs = require('sql.js/dist/sql-asm.js');
} catch (e) {
  initSqlJs = require('sql.js');
}

async function runAudit() {
  var SQL = await initSqlJs();
  
  var dbPath = path.join(__dirname, '..', 'database', 'newtechmed.db');
  var pristinePath = 'C:\\Users\\Owner\\.gemini\\antigravity\\brain\\9db3f4da-1edb-4238-a849-6409fd1c5d76\\newtechmed_production_pristine_20261119.db';
  var verifiedBackupPath = path.join(__dirname, '..', 'database', 'backups', 'newtechmed_pre_turso_verified_2026-11-19T23-58-49-622Z.db');

  var bufCurrent = fs.readFileSync(dbPath);
  var bufPristine = fs.existsSync(pristinePath) ? fs.readFileSync(pristinePath) : null;
  var bufVerified = fs.existsSync(verifiedBackupPath) ? fs.readFileSync(verifiedBackupPath) : null;

  var hashCurrent = crypto.createHash('sha256').update(bufCurrent).digest('hex').toUpperCase();
  console.log('Current DB SHA-256:         ', hashCurrent);
  if (bufPristine) {
    var hashPristine = crypto.createHash('sha256').update(bufPristine).digest('hex').toUpperCase();
    console.log('Pristine Backup SHA-256:    ', hashPristine);
  }
  if (bufVerified) {
    var hashVerified = crypto.createHash('sha256').update(bufVerified).digest('hex').toUpperCase();
    console.log('Pre-Turso Backup SHA-256:   ', hashVerified);
  }

  var dbCur = new SQL.Database(bufCurrent);
  var tables = dbCur.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0].values.map(function(r) { return r[0]; });

  var curCounts = {};
  var totalCur = 0;
  tables.forEach(function(t) {
    var cnt = dbCur.exec('SELECT COUNT(*) FROM ' + t)[0].values[0][0];
    curCounts[t] = cnt;
    totalCur += cnt;
  });

  var prisCounts = {};
  var totalPris = 0;
  if (bufPristine) {
    var dbPris = new SQL.Database(bufPristine);
    tables.forEach(function(t) {
      try {
        var cnt = dbPris.exec('SELECT COUNT(*) FROM ' + t)[0].values[0][0];
        prisCounts[t] = cnt;
        totalPris += cnt;
      } catch (e) {
        prisCounts[t] = 'N/A';
      }
    });
  }

  console.log('\n--- Table by Table Comparison ---');
  console.log('Table'.padEnd(25) + 'Current'.padEnd(10) + 'Pristine'.padEnd(10) + 'Diff');
  var totalDiff = 0;
  tables.forEach(function(t) {
    var cur = curCounts[t];
    var pris = prisCounts[t] !== undefined ? prisCounts[t] : 0;
    var diff = (typeof pris === 'number') ? (cur - pris) : 'N/A';
    if (typeof diff === 'number') totalDiff += diff;
    var diffStr = diff > 0 ? ('+' + diff) : String(diff);
    console.log(t.padEnd(25) + String(cur).padEnd(10) + String(pris).padEnd(10) + diffStr);
  });
  console.log('----------------------------------------------------');
  console.log('Total Records Current:  ' + totalCur);
  console.log('Total Records Pristine: ' + totalPris);
  console.log('Net Difference:         ' + totalDiff);

  // Check activity_log, product_versions, etc. to see what the 27 records are
  console.log('\nAnalyzing specific tables where diff occurs:');
  tables.forEach(function(t) {
    var cur = curCounts[t];
    var pris = prisCounts[t] !== undefined ? prisCounts[t] : 0;
    if (cur !== pris) {
      console.log('-> Table ' + t + ': Current = ' + cur + ', Pristine = ' + pris + ' (Difference: ' + (cur - pris) + ')');
    }
  });
}

runAudit().catch(console.error);
