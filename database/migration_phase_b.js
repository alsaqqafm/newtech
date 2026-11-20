/**
 * ============================================================
 * Phase B Database Migration: Product Management & Versioning
 * ============================================================
 * Safe, idempotent migration script.
 * Can be run standalone or invoked programmatically with a database wrapper.
 */

var fs = require('fs');
var path = require('path');

async function applyPhaseBMigration(db) {
  if (!db) throw new Error('Database instance is required for migration');

  // 1. Safe ALTER TABLE additions for 'products' table
  var columnsToAdd = [
    { name: 'publish_status', def: "TEXT DEFAULT 'published'" },
    { name: 'current_version', def: 'INTEGER DEFAULT 1' },
    { name: 'is_featured', def: 'INTEGER DEFAULT 0' },
    { name: 'sort_order', def: 'INTEGER DEFAULT 0' },
    { name: 'gallery_images', def: "TEXT DEFAULT '[]'" },
    { name: 'technical_specs', def: "TEXT DEFAULT ''" },
    { name: 'is_archived', def: 'INTEGER DEFAULT 0' },
    { name: 'updated_at', def: 'DATETIME' }
  ];

  var existingCols = [];
  try {
    var colsResult = await db.prepare("PRAGMA table_info(products)").all();
    existingCols = colsResult.map(function (c) { return c.name; });
  } catch (e) {}

  for (var i = 0; i < columnsToAdd.length; i++) {
    var col = columnsToAdd[i];
    if (existingCols.indexOf(col.name) === -1) {
      try {
        await db.exec("ALTER TABLE products ADD COLUMN " + col.name + " " + col.def);
      } catch (err) {}
    }
  }

  // Ensure inactive product #11 is marked correctly as 'hidden'
  try {
    await db.prepare("UPDATE products SET publish_status = 'hidden' WHERE id = 11 AND active = 0").run();
  } catch (e) {}

  // Populate updated_at for existing records
  try {
    await db.exec("UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;");
  } catch (e) {}

  // 2. Create 'product_drafts' table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_drafts (
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
    );
  `);

  // 3. Create 'product_versions' table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_versions (
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
    );
  `);

  // 4. Create 'product_images' table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_images (
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
    );
  `);

  // 5. Seed baseline v1 revisions for existing products if empty
  var countRow = await db.prepare("SELECT COUNT(*) as count FROM product_versions").get();
  var existingVersionsCount = countRow ? countRow.count : 0;

  if (existingVersionsCount === 0) {
    var allProducts = await db.prepare("SELECT * FROM products ORDER BY id ASC").all();
    for (var pIdx = 0; pIdx < allProducts.length; pIdx++) {
      var p = allProducts[pIdx];
      var action = p.active !== 0 ? 'initial_baseline_active' : 'initial_baseline_inactive';
      var pubStatus = p.active !== 0 ? 'published' : 'hidden';

      await db.prepare(`
        INSERT INTO product_versions (
          product_id, version_number, name, name_en, model, category,
          manufacturer, agent, description, description_en, price, stock,
          status, main_image, gallery_images, features, keywords, technical_specs,
          publish_status, is_featured, sort_order, active, snapshot_json,
          change_summary, action_type, created_by, created_by_name
        ) VALUES (
          ?, 1, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, '[]', ?, ?, '',
          ?, 0, 0, ?, ?,
          'النسخة التأسيسية المعتمدة للمنتج v1', ?, 1, 'مدير النظام'
        )
      `).run(
        p.id,
        p.name,
        p.name_en || '',
        p.model || '',
        p.category || '',
        p.manufacturer || p.agent || '',
        p.agent || p.manufacturer || '',
        p.description || '',
        p.description_en || '',
        p.price || 0,
        p.stock || 0,
        p.status || 'متوفر',
        p.image || '',
        p.features || '',
        p.keywords || '',
        pubStatus,
        p.active !== 0 ? 1 : 0,
        JSON.stringify(p),
        action
      );
    }
  }

  // Ensure 'images/products' folder exists
  var productsImgDir = path.join(__dirname, '..', 'images', 'products');
  if (!fs.existsSync(productsImgDir)) {
    try { fs.mkdirSync(productsImgDir, { recursive: true }); } catch (e) {}
  }

  return { success: true, message: 'Phase B migration completed successfully' };
}

module.exports = {
  applyPhaseBMigration: applyPhaseBMigration
};
