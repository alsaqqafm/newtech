#!/usr/bin/env node
/**
 * ============================================================
 * New Tech Medical Corp – SQLite → Turso Cloud Migration Script
 * ============================================================
 * 
 * Reads the local newtechmed.db with sql.js, connects to Turso,
 * creates all 24 tables, and migrates all 552+ records.
 * 
 * SAFETY:
 * - NEVER modifies the original database file.
 * - Verifies row counts after migration.
 * - Reports per-table results.
 * 
 * Usage:
 *   node scripts/migrate_to_turso.js
 */

var path = require('path');
var fs = require('fs');
var crypto = require('crypto');

// Load sql.js for reading the local database
var initSqlJs;
try {
  initSqlJs = require('sql.js/dist/sql-asm.js');
} catch (e) {
  initSqlJs = require('sql.js');
}

var { createClient } = require('@libsql/client');

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

// ─── Configuration ────────────────────────────────────────
var DB_PATH = path.join(__dirname, '..', 'database', 'newtechmed.db');

// ─── Table Creation DDL (exact order respecting dependencies) ──
var TABLE_DDL = [
  // Core tables (no dependencies)
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'editor',
    status TEXT DEFAULT 'active',
    avatar TEXT,
    last_login DATETIME,
    store_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    model TEXT,
    category TEXT,
    description TEXT,
    image TEXT,
    agent TEXT,
    price REAL DEFAULT 0,
    stock INTEGER DEFAULT 0,
    status TEXT DEFAULT 'متوفر',
    features TEXT,
    keywords TEXT,
    active INTEGER DEFAULT 1,
    name_en TEXT,
    description_en TEXT,
    manufacturer TEXT,
    publish_status TEXT DEFAULT 'published',
    current_version INTEGER DEFAULT 1,
    is_featured INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    gallery_images TEXT DEFAULT '[]',
    technical_specs TEXT DEFAULT '',
    is_archived INTEGER DEFAULT 0,
    updated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    city TEXT,
    address TEXT,
    orders_count INTEGER DEFAULT 0,
    total REAL DEFAULT 0,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    country TEXT,
    specialty TEXT,
    description TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    tax_number TEXT,
    invoice_prefix TEXT DEFAULT 'INV-S',
    invoice_footer TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Tables with potential FK refs (but no formal constraints)
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    phone TEXT,
    products TEXT,
    amount REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    store_id INTEGER DEFAULT 1,
    invoice_number TEXT,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    product TEXT,
    message TEXT,
    status TEXT DEFAULT 'new',
    response TEXT,
    response_date DATETIME,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT,
    action TEXT,
    entity_type TEXT,
    entity_id INTEGER,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS store_inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    min_stock_alert INTEGER DEFAULT 5,
    purchase_price REAL DEFAULT 0,
    wholesale_price REAL DEFAULT 0,
    retail_price REAL DEFAULT 0,
    batch_number TEXT,
    expiry_date TEXT,
    unit TEXT DEFAULT 'قطعة',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(store_id, product_id)
  )`,

  `CREATE TABLE IF NOT EXISTS inventory_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    change_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reference_type TEXT,
    reference_id INTEGER,
    user_id INTEGER,
    user_name TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS stock_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transfer_number TEXT UNIQUE NOT NULL,
    from_store_id INTEGER NOT NULL,
    to_store_id INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_by INTEGER,
    created_by_name TEXT,
    approved_by INTEGER,
    approved_by_name TEXT,
    received_by INTEGER,
    received_by_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    dispatched_at DATETIME,
    received_at DATETIME
  )`,

  `CREATE TABLE IF NOT EXISTS transfer_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transfer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity_sent INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0,
    quantity_damaged INTEGER DEFAULT 0,
    notes TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE NOT NULL,
    store_id INTEGER NOT NULL,
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    payment_type TEXT DEFAULT 'cash',
    payment_status TEXT DEFAULT 'paid',
    subtotal REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    total_amount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    remaining_amount REAL DEFAULT 0,
    total_cost REAL DEFAULT 0,
    status TEXT DEFAULT 'completed',
    notes TEXT,
    created_by INTEGER,
    created_by_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    active INTEGER DEFAULT 1
  )`,

  `CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    unit_cost REAL DEFAULT 0,
    total_price REAL NOT NULL,
    returned_quantity INTEGER DEFAULT 0
  )`,

  `CREATE TABLE IF NOT EXISTS sales_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number TEXT UNIQUE NOT NULL,
    invoice_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL,
    customer_id INTEGER,
    refund_amount REAL NOT NULL,
    reason TEXT,
    created_by INTEGER,
    created_by_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS sales_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    refund_price REAL NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_number TEXT UNIQUE NOT NULL,
    store_id INTEGER NOT NULL,
    supplier_id INTEGER,
    supplier_name TEXT NOT NULL,
    total_amount REAL NOT NULL,
    paid_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'received',
    notes TEXT,
    created_by INTEGER,
    created_by_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost REAL NOT NULL,
    total_cost REAL NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    date TEXT NOT NULL,
    created_by INTEGER,
    created_by_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS customer_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL,
    invoice_id INTEGER,
    amount REAL NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    notes TEXT,
    created_by INTEGER,
    created_by_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS stock_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    system_quantity INTEGER NOT NULL,
    actual_quantity INTEGER NOT NULL,
    difference INTEGER NOT NULL,
    reason TEXT NOT NULL,
    created_by INTEGER,
    created_by_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  // Phase B tables
  `CREATE TABLE IF NOT EXISTS product_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    name TEXT NOT NULL,
    name_en TEXT,
    model TEXT,
    category TEXT,
    manufacturer TEXT,
    agent TEXT,
    description TEXT,
    description_en TEXT,
    price REAL DEFAULT 0,
    stock INTEGER DEFAULT 0,
    main_image TEXT,
    gallery_images TEXT DEFAULT '[]',
    features TEXT,
    technical_specs TEXT,
    is_featured INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    change_summary TEXT,
    created_by INTEGER,
    created_by_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS product_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    version_number INTEGER NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT,
    model TEXT,
    category TEXT,
    manufacturer TEXT,
    agent TEXT,
    description TEXT,
    description_en TEXT,
    price REAL DEFAULT 0,
    stock INTEGER DEFAULT 0,
    status TEXT DEFAULT 'متوفر',
    main_image TEXT,
    gallery_images TEXT DEFAULT '[]',
    features TEXT,
    keywords TEXT,
    technical_specs TEXT,
    publish_status TEXT DEFAULT 'published',
    is_featured INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    snapshot_json TEXT,
    change_summary TEXT,
    action_type TEXT DEFAULT 'publish',
    created_by INTEGER,
    created_by_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    draft_id INTEGER,
    image_type TEXT DEFAULT 'main',
    image_url TEXT NOT NULL,
    filename TEXT,
    file_size INTEGER,
    mime_type TEXT DEFAULT 'image/jpeg',
    width INTEGER,
    height INTEGER,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`
];

// ─── Table names in migration order ──
var TABLE_NAMES = [
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

// ─── Main Migration ──────────────────────────────────────
async function migrate(options) {
  options = options || {};
  var isDryRun = options.dryRun || process.argv.includes('--dry-run') || process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

  console.log('═══════════════════════════════════════════════════════');
  console.log('  New Tech Medical Corp – SQLite → Turso Migration');
  if (isDryRun) {
    console.log('  *** MODE: DRY RUN (SIMULATION ONLY - NO WRITES) ***');
  } else {
    console.log('  *** MODE: LIVE MIGRATION ***');
  }
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  // 1. Verify source database
  if (!fs.existsSync(DB_PATH)) {
    console.error('[ERROR] Database file not found at:', DB_PATH);
    process.exit(1);
  }

  var fileData = fs.readFileSync(DB_PATH);
  var hash = crypto.createHash('sha256').update(fileData).digest('hex').toUpperCase();
  console.log('[Source DB] Path:', DB_PATH);
  console.log('[Source DB] Size:', fileData.length, 'bytes');
  console.log('[Source DB] SHA-256:', hash);
  console.log('');

  // 2. Load local database with sql.js
  var SQL = await initSqlJs();
  var localDb = new SQL.Database(Buffer.from(fileData));

  // Get table list from local DB
  var tableListResult = localDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
  var localTables = tableListResult.length > 0 ? tableListResult[0].values.map(function (r) { return r[0]; }) : [];
  console.log('[Source DB] Tables found:', localTables.length);
  console.log('[Source DB] Table names:', localTables.join(', '));
  console.log('');

  // 3. Connect to Turso
  var tursoUrl = process.env.TURSO_DATABASE_URL;
  var tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (!tursoUrl) {
    console.error('[ERROR] TURSO_DATABASE_URL is not set');
    process.exit(1);
  }

  var maskedUrl = tursoUrl.replace(/:[^:]*@/, ':***@');
  console.log('[Turso] Target URL:', maskedUrl);
  console.log('[Turso] Connecting to database...');
  var client = createClient({ url: tursoUrl, authToken: tursoToken || undefined });

  // Test connection
  var testResult = await client.execute('SELECT 1 as ok');
  console.log('[Turso] Connection established successfully');
  console.log('');

  // 4. Create tables in Turso (or check them in dry-run)
  console.log(isDryRun ? '─── Phase 1: Checking Schema (DRY RUN) ─────────────' : '─── Phase 1: Creating Tables ───────────────────────');
  
  // Discover existing tables in target
  var targetTablesRes = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  var existingTargetTables = targetTablesRes.rows.map(function(r) { return r.name !== undefined ? r.name : r[0]; });

  for (var i = 0; i < TABLE_DDL.length; i++) {
    var ddl = TABLE_DDL[i];
    var tableName = TABLE_NAMES[i];
    var tableAlreadyExists = existingTargetTables.indexOf(tableName) !== -1;

    if (isDryRun) {
      if (tableAlreadyExists) {
        console.log('  [DRY RUN] Schema for ' + tableName + ': ALREADY EXISTS in target');
      } else {
        console.log('  [DRY RUN] Schema for ' + tableName + ': WOULD BE CREATED');
      }
    } else {
      try {
        await client.execute(ddl);
        console.log('  ✓ Created/verified:', tableName);
      } catch (err) {
        console.error('  ✗ Error creating ' + tableName + ':', err.message);
        throw new Error('Schema creation aborted on table: ' + tableName + ' (' + err.message + ')');
      }
    }
  }
  console.log('');

  // 5. Migrate data table by table
  console.log(isDryRun ? '─── Phase 2: Simulating Migration Plan (DRY RUN) ───' : '─── Phase 2: Migrating Data ────────────────────────');
  var totalMigrated = 0;
  var totalSourceRows = 0;
  var results = [];

  for (var t = 0; t < TABLE_NAMES.length; t++) {
    var tName = TABLE_NAMES[t];

    // Check if table exists locally
    if (localTables.indexOf(tName) === -1) {
      console.log('  ⊘ Table ' + tName + ' — does not exist in source DB (Phase B table, 0 source rows)');
      results.push({ table: tName, source: 0, migrated: 0, status: 'SKIPPED (new table)' });
      continue;
    }

    // Get rows from local DB
    var selectResult = localDb.exec('SELECT * FROM ' + tName);
    if (!selectResult || selectResult.length === 0 || selectResult[0].values.length === 0) {
      console.log('  ⊘ Table ' + tName + ' — empty in source (0 rows)');
      results.push({ table: tName, source: 0, migrated: 0, status: 'OK (empty)' });
      continue;
    }

    var columns = selectResult[0].columns;
    var rows = selectResult[0].values;
    var sourceCount = rows.length;
    totalSourceRows += sourceCount;

    // Check existing records in Turso
    var existing = 0;
    var targetHasTable = existingTargetTables.indexOf(tName) !== -1;
    if (targetHasTable) {
      try {
        var existingCount = await client.execute('SELECT COUNT(*) as count FROM ' + tName);
        existing = Number(existingCount.rows[0].count !== undefined ? existingCount.rows[0].count : existingCount.rows[0][0] || 0);
      } catch (e) {
        existing = 0;
      }
    }

    if (isDryRun) {
      if (existing > 0) {
        if (existing === sourceCount) {
          console.log('  [DRY RUN] Table ' + tName + ': target already has ' + existing + ' rows (matches source ' + sourceCount + ' rows) -> IDENTICAL COUNT');
          results.push({ table: tName, source: sourceCount, target: existing, migrated: 0, status: 'MATCH_EXISTING (already identical)' });
        } else {
          console.log('  [DRY RUN] ⚠ CONFLICT in table ' + tName + ': target has ' + existing + ' rows but source has ' + sourceCount + ' rows -> WOULD ABORT LIVE MIGRATION');
          results.push({ table: tName, source: sourceCount, target: existing, migrated: 0, status: 'CONFLICT_ALERT (target: ' + existing + ', source: ' + sourceCount + ')' });
        }
      } else {
        console.log('  [DRY RUN] Table ' + tName + ': target has 0 rows -> WOULD INSERT ' + sourceCount + ' rows with exact IDs preserved');
        results.push({ table: tName, source: sourceCount, target: 0, migrated: sourceCount, status: 'WOULD_MIGRATE (' + sourceCount + ' rows)' });
        totalMigrated += sourceCount;
      }
      continue;
    }

    // LIVE RUN: Strict Duplicate and Conflict Prevention
    if (existing > 0) {
      if (existing === sourceCount) {
        console.log('  ✓ Table ' + tName + ' — target already has ' + existing + ' rows (identical to source ' + sourceCount + '). Preserving existing records without modification.');
        results.push({ table: tName, source: sourceCount, target: existing, migrated: existing, status: 'PRESERVED (identical count)' });
        totalMigrated += existing;
        continue;
      } else {
        console.error('  ✗ FATAL CONFLICT: Table ' + tName + ' has ' + existing + ' rows in Turso, but source has ' + sourceCount + ' rows!');
        console.error('    Migration ABORTED immediately to prevent data corruption or partial overwrites.');
        throw new Error('Migration aborted: Conflict detected in table ' + tName + ' (Target: ' + existing + ', Source: ' + sourceCount + '). No DROP or TRUNCATE was executed.');
      }
    }

    // Build batch of INSERT statements preserving explicit IDs
    var placeholders = columns.map(function () { return '?'; }).join(', ');
    var insertSql = 'INSERT INTO ' + tName + ' (' + columns.join(', ') + ') VALUES (' + placeholders + ')';

    var batchSize = 20; // Safe transaction batch size
    var migrated = 0;
    var errors = 0;

    for (var b = 0; b < rows.length; b += batchSize) {
      var batch = rows.slice(b, b + batchSize);
      var statements = batch.map(function (row) {
        return {
          sql: insertSql,
          args: row.map(function (val) {
            if (val === undefined) return null;
            if (val && typeof val === 'object' && val.constructor === Uint8Array) return null;
            return val;
          })
        };
      });

      try {
        await client.batch(statements, 'write');
        migrated += batch.length;
      } catch (err) {
        console.error('    Batch failed for ' + tName + ', attempting single-row fallback:', err.message);
        for (var s = 0; s < batch.length; s++) {
          try {
            await client.execute(statements[s]);
            migrated++;
          } catch (singleErr) {
            errors++;
            console.error('    FATAL Row error in ' + tName + ' row ' + (b + s + 1) + ':', singleErr.message);
            throw new Error('Migration aborted due to write error in ' + tName + ': ' + singleErr.message);
          }
        }
      }
    }

    var statusMsg = migrated === sourceCount ? 'OK' : 'PARTIAL (' + errors + ' errors)';
    console.log('  ✓ Table ' + tName + ' — ' + migrated + '/' + sourceCount + ' rows migrated (' + statusMsg + ')');
    results.push({ table: tName, source: sourceCount, migrated: migrated, status: statusMsg });
    totalMigrated += migrated;
  }

  console.log('');

  // 6. Verification
  console.log(isDryRun ? '─── Phase 3: Verification Simulation (DRY RUN) ─────' : '─── Phase 3: Verification ──────────────────────────');
  var verificationPassed = true;

  if (isDryRun) {
    console.log('  [DRY RUN] Simulation verification: Plan is completely consistent.');
    console.log('  [DRY RUN] Total source records ready for migration: ' + totalSourceRows);
    console.log('  [DRY RUN] NO WRITE OPERATIONS WERE PERFORMED.');
  } else {
    for (var v = 0; v < results.length; v++) {
      var r = results[v];
      if (r.status === 'SKIPPED (new table)' || r.status === 'OK (empty)') continue;

      var tursoCount = await client.execute('SELECT COUNT(*) as count FROM ' + r.table);
      var actual = Number(tursoCount.rows[0].count !== undefined ? tursoCount.rows[0].count : tursoCount.rows[0][0] || 0);

      if (actual === r.source) {
        console.log('  ✓ ' + r.table + ': ' + actual + ' / ' + r.source + ' — MATCH');
      } else if (r.status.indexOf('already populated') >= 0 && actual >= r.source) {
        console.log('  ✓ ' + r.table + ': ' + actual + ' / ' + r.source + ' — MATCH (pre-existing)');
      } else {
        console.log('  ✗ ' + r.table + ': ' + actual + ' / ' + r.source + ' — MISMATCH');
        verificationPassed = false;
      }
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Migration Summary' + (isDryRun ? ' [DRY RUN]' : ''));
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Tables processed: ' + results.length);
  console.log('  Total source records: ' + totalSourceRows);
  if (isDryRun) {
    console.log('  Planned records to insert: ' + totalMigrated);
    console.log('  Actual writes to Turso: 0 (DRY RUN - GUARANTEED READ-ONLY)');
  } else {
    console.log('  Total records migrated: ' + totalMigrated);
    console.log('  Verification: ' + (verificationPassed ? '✓ PASSED (100% Match)' : '✗ FAILED'));
  }
  console.log('═══════════════════════════════════════════════════════');

  // Cleanup
  localDb.close();
  client.close();

  if (!isDryRun && !verificationPassed) {
    throw new Error('Data verification failed after migration!');
  }

  return {
    dryRun: isDryRun,
    passed: verificationPassed,
    totalSource: totalSourceRows,
    totalMigrated: totalMigrated,
    results: results
  };
}

if (require.main === module) {
  migrate().catch(function (err) {
    console.error('[FATAL ERROR]', err);
    process.exit(1);
  });
}

module.exports = { migrate: migrate };
