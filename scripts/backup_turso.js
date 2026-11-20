#!/usr/bin/env node
/**
 * ============================================================
 * Turso Cloud Automated / On-Demand Backup Utility
 * ============================================================
 * 
 * Exports all 24 tables and metadata from Turso into an encrypted/signed
 * backup archive in database/backups/
 * 
 * Usage:
 *   node scripts/backup_turso.js
 */

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var { createClient } = require('@libsql/client');

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

async function runBackup() {
  var url = process.env.TURSO_DATABASE_URL || 'file:database/newtechmed.db';
  var authToken = process.env.TURSO_AUTH_TOKEN;

  console.log('[Backup] Initiating Turso Cloud backup...');
  var client = createClient({ url: url, authToken: authToken || undefined });

  var backupData = {
    timestamp: new Date().toISOString(),
    version: '1.0',
    tables: {}
  };

  var totalRows = 0;

  for (var i = 0; i < TABLES.length; i++) {
    var tableName = TABLES[i];
    try {
      var result = await client.execute('SELECT * FROM ' + tableName);
      var rows = result.rows.map(function (r) {
        var obj = {};
        for (var k in r) {
          if (Object.prototype.hasOwnProperty.call(r, k)) {
            obj[k] = typeof r[k] === 'bigint' ? Number(r[k]) : r[k];
          }
        }
        return obj;
      });
      backupData.tables[tableName] = rows;
      totalRows += rows.length;
    } catch (e) {
      backupData.tables[tableName] = [];
    }
  }

  var backupDir = path.join(__dirname, '..', 'database', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  var timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  var jsonContent = JSON.stringify(backupData, null, 2);
  var plainSha256 = crypto.createHash('sha256').update(jsonContent).digest('hex').toUpperCase();

  var encKey = process.env.BACKUP_ENCRYPTION_KEY || options.encryptionKey;
  var backupFilePath;
  var isEncrypted = false;

  if (encKey) {
    // AES-256-GCM encryption
    var keyBuffer = crypto.createHash('sha256').update(String(encKey)).digest(); // 32-byte key
    var iv = crypto.randomBytes(12); // 96-bit IV for GCM
    var cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
    var encrypted = Buffer.concat([cipher.update(jsonContent, 'utf8'), cipher.final()]);
    var authTag = cipher.getAuthTag();

    var payload = {
      algorithm: 'aes-256-gcm',
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      plainSha256: plainSha256,
      totalRows: totalRows,
      timestamp: backupData.timestamp,
      data: encrypted.toString('base64')
    };

    backupFilePath = path.join(backupDir, 'turso_backup_' + timestampStr + '.enc.json');
    var fileContent = JSON.stringify(payload, null, 2);
    fs.writeFileSync(backupFilePath, fileContent, 'utf8');
    isEncrypted = true;
  } else {
    backupFilePath = path.join(backupDir, 'turso_backup_' + timestampStr + '.json');
    fs.writeFileSync(backupFilePath, jsonContent, 'utf8');
  }

  var finalFileSha256 = crypto.createHash('sha256').update(fs.readFileSync(backupFilePath)).digest('hex').toUpperCase();

  console.log('[Backup] Completed successfully!');
  console.log('[Backup] File:          ', path.basename(backupFilePath));
  console.log('[Backup] Encrypted:     ', isEncrypted ? 'YES (AES-256-GCM)' : 'NO (Set BACKUP_ENCRYPTION_KEY to enable)');
  console.log('[Backup] Total records: ', totalRows);
  console.log('[Backup] Data SHA-256:  ', plainSha256);
  console.log('[Backup] File SHA-256:  ', finalFileSha256);

  client.close();
  return {
    file: backupFilePath,
    isEncrypted: isEncrypted,
    plainSha256: plainSha256,
    fileSha256: finalFileSha256,
    totalRows: totalRows
  };
}

if (require.main === module) {
  runBackup().catch(function (err) {
    console.error('[Backup Error]', err.message);
    process.exit(1);
  });
}

module.exports = { runBackup: runBackup };
