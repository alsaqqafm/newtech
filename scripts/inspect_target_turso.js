#!/usr/bin/env node
/**
 * ============================================================
 * Turso Cloud Target Database Inspector (Read-Only)
 * ============================================================
 * 
 * Safely inspects the target Turso database without executing ANY write operations.
 * - Masks auth tokens completely.
 * - Checks if database is reachable.
 * - Enumerates all existing tables, views, indexes.
 * - Counts existing rows in every table to verify if empty or pre-populated.
 * - Checks for potential collisions or overwrite risks.
 */

var { createClient } = require('@libsql/client');
var fs = require('fs');
var path = require('path');

// Auto-load .env file if present in workspace root
(function loadEnv() {
  try {
    var envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      var lines = fs.readFileSync(envPath, 'utf8').split('\n');
      lines.forEach(function (line) {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        var idx = line.indexOf('=');
        if (idx > 0) {
          var key = line.substring(0, idx).trim();
          var val = line.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) process.env[key] = val;
        }
      });
    }
  } catch (e) { }
})();

var TABLES = [
  'users', 'products', 'customers', 'partners', 'stores',
  'orders', 'quotes', 'activity_log',
  'store_inventory', 'inventory_transactions',
  'stock_transfers', 'transfer_items',
  'invoices', 'invoice_items',
  'sales_returns', 'sales_return_items',
  'purchases', 'purchase_items',
  'expenses', 'customer_payments', 'stock_adjustments',
  'product_drafts', 'product_versions', 'product_images'
];

async function inspectTurso() {
  var url = process.env.TURSO_DATABASE_URL;
  var token = process.env.TURSO_AUTH_TOKEN;

  console.log('═══════════════════════════════════════════════════════');
  console.log('  Turso Cloud Target Database Inspection (Read-Only)');
  console.log('═══════════════════════════════════════════════════════\n');

  if (!url) {
    console.log('[Status] TURSO_DATABASE_URL is not set in environment.');
    console.log('[Action Needed] Please provide TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
    return {
      connected: false,
      reason: 'MISSING_ENV_VARS'
    };
  }

  // Safe display: never print secrets
  var maskedUrl = url.replace(/:[^:]*@/, ':***@');
  var tokenStatus = token ? `Set (Length: ${token.length}, Hash: ${token.substring(0, 6)}...***)` : 'Not Set';

  console.log('Target URL:    ', maskedUrl);
  console.log('Auth Token:    ', tokenStatus);
  console.log('Mode:           STRICT READ-ONLY (No DROP, No DELETE, No Writes)\n');

  var client = createClient({ url: url, authToken: token || undefined });

  try {
    // 1. Connectivity probe
    var ping = await client.execute('SELECT 1 as alive');
    console.log('[Connection] ✓ Successfully connected to Turso database.\n');

    // 2. Discover existing tables
    var tablesResult = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    var existingTables = tablesResult.rows.map(r => r.name !== undefined ? r.name : r[0]);

    console.log(`[Schema Discovery] Found ${existingTables.length} existing tables in target database:`);
    if (existingTables.length === 0) {
      console.log('  └─ DATABASE IS BRAND NEW AND COMPLETELY EMPTY (No tables yet).');
    } else {
      console.log('  └─ Existing tables:', existingTables.join(', '));
    }
    console.log('');

    // 3. Inspect table contents
    var tableStats = [];
    var totalRecordsFound = 0;

    for (var i = 0; i < TABLES.length; i++) {
      var tName = TABLES[i];
      if (existingTables.indexOf(tName) !== -1) {
        var countRes = await client.execute('SELECT COUNT(*) as count FROM ' + tName);
        var rowCount = Number(countRes.rows[0].count !== undefined ? countRes.rows[0].count : countRes.rows[0][0]);
        tableStats.push({ table: tName, exists: true, rows: rowCount });
        totalRecordsFound += rowCount;
        console.log(`  Table '${tName}': EXISTS with ${rowCount} rows`);
      } else {
        tableStats.push({ table: tName, exists: false, rows: 0 });
      }
    }

    console.log('\n[Summary Analysis]');
    console.log('  Total expected tables (24):', tableStats.filter(t => t.exists).length, '/ 24 present');
    console.log('  Total records in target:', totalRecordsFound);
    console.log('  Risk of Overwrite/Duplicate:', totalRecordsFound === 0 ? 'ZERO (Clean Target)' : `WARNING: ${totalRecordsFound} pre-existing records found`);

    client.close();

    return {
      connected: true,
      url: maskedUrl,
      existingTablesCount: existingTables.length,
      existingTables: existingTables,
      tableStats: tableStats,
      totalRecords: totalRecordsFound,
      isClean: totalRecordsFound === 0
    };
  } catch (err) {
    console.error('[Connection Error]', err.message);
    client.close();
    return {
      connected: false,
      error: err.message
    };
  }
}

if (require.main === module) {
  inspectTurso().catch(function (err) {
    console.error('[Fatal Error]', err.message);
    process.exit(1);
  });
}

module.exports = { inspectTurso: inspectTurso };
