var express = require('express');
var fs = require('fs');
var path = require('path');
var { authenticateToken, requireRole } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  // Helper: check table column existence safely
  function getTableColumns(tableName) {
    try {
      var rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
      return rows.map(function (r) { return r.name; });
    } catch (e) {
      return [];
    }
  }

  // ============================================================
  // 1. GET /summary - Product Management Dashboard Statistics
  // ============================================================
  router.get('/summary', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var stats = {
        total_products: 0,
        published_count: 0,
        hidden_count: 0,
        archived_count: 0,
        drafts_count: 0,
        versions_count: 0,
        low_stock_count: 0
      };

      try {
        var prodRow = db.prepare(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN (publish_status = 'published' OR publish_status IS NULL) AND active = 1 AND (is_archived = 0 OR is_archived IS NULL) THEN 1 ELSE 0 END) as published,
            SUM(CASE WHEN active = 0 OR publish_status = 'hidden' THEN 1 ELSE 0 END) as hidden,
            SUM(CASE WHEN is_archived = 1 THEN 1 ELSE 0 END) as archived
          FROM products
        `).get();
        if (prodRow) {
          stats.total_products = prodRow.total || 0;
          stats.published_count = prodRow.published || 0;
          stats.hidden_count = prodRow.hidden || 0;
          stats.archived_count = prodRow.archived || 0;
        }
      } catch (e) {
        var simpleRow = db.prepare('SELECT COUNT(*) as total FROM products').get();
        stats.total_products = simpleRow ? simpleRow.total : 0;
      }

      try {
        var draftRow = db.prepare("SELECT COUNT(*) as count FROM product_drafts WHERE status = 'draft'").get();
        stats.drafts_count = draftRow ? draftRow.count : 0;
      } catch (e) {
        stats.drafts_count = 0;
      }

      try {
        var verRow = db.prepare('SELECT COUNT(*) as count FROM product_versions').get();
        stats.versions_count = verRow ? verRow.count : 0;
      } catch (e) {
        stats.versions_count = 0;
      }

      try {
        var lowRow = db.prepare(`
          SELECT COUNT(DISTINCT product_id) as count 
          FROM store_inventory 
          WHERE stock_quantity <= min_stock_alert
        `).get();
        stats.low_stock_count = lowRow ? lowRow.count : 0;
      } catch (e) {
        stats.low_stock_count = 0;
      }

      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // 2. Draft Management Endpoints (Strictly Isolated)
  // ============================================================

  // GET /drafts - List all drafts
  router.get('/drafts', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var drafts = db.prepare(`
        SELECT d.*, p.name as original_product_name, p.current_version as live_version
        FROM product_drafts d
        LEFT JOIN products p ON d.product_id = p.id
        WHERE d.status = 'draft'
        ORDER BY d.updated_at DESC
      `).all();
      res.json(drafts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /drafts/:draftId - Get single draft
  router.get('/drafts/:draftId', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var draft = db.prepare('SELECT * FROM product_drafts WHERE id = ?').get(req.params.draftId);
      if (!draft) return res.status(404).json({ error: 'المسودة غير موجودة' });
      res.json(draft);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /drafts - Create or update draft
  router.post('/drafts', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var b = req.body;
      if (!b.name || !b.name.trim()) {
        return res.status(400).json({ error: 'اسم المنتج مطلوب لحفظ المسودة' });
      }

      var existingDraft = null;
      if (b.product_id) {
        existingDraft = db.prepare("SELECT id FROM product_drafts WHERE product_id = ? AND status = 'draft'").get(b.product_id);
      }

      var draftId;
      var now = new Date().toISOString();

      if (existingDraft) {
        draftId = existingDraft.id;
        db.prepare(`
          UPDATE product_drafts SET
            name = ?, name_en = ?, model = ?, category = ?,
            manufacturer = ?, agent = ?, description = ?, description_en = ?,
            price = ?, stock = ?, main_image = ?, gallery_images = ?,
            features = ?, technical_specs = ?, is_featured = ?, sort_order = ?,
            change_summary = ?, updated_at = ?
          WHERE id = ?
        `).run(
          b.name, b.name_en || '', b.model || '', b.category || '',
          b.manufacturer || b.agent || '', b.agent || b.manufacturer || '',
          b.description || '', b.description_en || '',
          parseFloat(b.price) || 0, parseInt(b.stock) || 0,
          b.main_image || b.image || '',
          typeof b.gallery_images === 'string' ? b.gallery_images : JSON.stringify(b.gallery_images || []),
          b.features || '', b.technical_specs || '',
          b.is_featured ? 1 : 0, parseInt(b.sort_order) || 0,
          b.change_summary || 'تحديث مسودة',
          now, draftId
        );
      } else {
        var info = db.prepare(`
          INSERT INTO product_drafts (
            product_id, name, name_en, model, category,
            manufacturer, agent, description, description_en,
            price, stock, main_image, gallery_images,
            features, technical_specs, is_featured, sort_order,
            status, change_summary, created_by, created_by_name,
            created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            'draft', ?, ?, ?,
            ?, ?
          )
        `).run(
          b.product_id || null, b.name, b.name_en || '', b.model || '', b.category || '',
          b.manufacturer || b.agent || '', b.agent || b.manufacturer || '',
          b.description || '', b.description_en || '',
          parseFloat(b.price) || 0, parseInt(b.stock) || 0,
          b.main_image || b.image || '',
          typeof b.gallery_images === 'string' ? b.gallery_images : JSON.stringify(b.gallery_images || []),
          b.features || '', b.technical_specs || '',
          b.is_featured ? 1 : 0, parseInt(b.sort_order) || 0,
          b.change_summary || 'إنشاء مسودة جديدة',
          req.user.id, req.user.name,
          now, now
        );
        draftId = info.lastInsertRowid;
      }

      var saved = db.prepare('SELECT * FROM product_drafts WHERE id = ?').get(draftId);
      res.json({ message: 'تم حفظ المسودة بنجاح', draft: saved });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /drafts/:draftId - Discard draft
  router.delete('/drafts/:draftId', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var draft = db.prepare('SELECT * FROM product_drafts WHERE id = ?').get(req.params.draftId);
      if (!draft) return res.status(404).json({ error: 'المسودة غير موجودة' });

      db.prepare('DELETE FROM product_drafts WHERE id = ?').run(req.params.draftId);
      res.json({ message: 'تم حذف المسودة بنجاح', id: req.params.draftId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // 3. Image Upload & Management (External/URL & File Handling)
  // ============================================================
  router.post('/images/upload', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var { image_data, image_url, filename, product_id, draft_id, image_type } = req.body;
      var finalUrl = '';
      var fileSize = 0;
      var mimeType = 'image/jpeg';

      if (image_url && image_url.trim()) {
        finalUrl = image_url.trim();
        fileSize = 0;
      } else if (image_data && image_data.startsWith('data:')) {
        // Base64 payload -> decode and write to disk, never save raw blob in SQLite!
        var matches = image_data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
          return res.status(400).json({ error: 'تنسيق صورة Base64 غير صالح' });
        }
        mimeType = matches[1];
        var buffer = Buffer.from(matches[2], 'base64');
        fileSize = buffer.length;

        var ext = 'jpg';
        if (mimeType === 'image/png') ext = 'png';
        else if (mimeType === 'image/webp') ext = 'webp';
        else if (mimeType === 'image/jpeg') ext = 'jpeg';

        var cleanName = (filename || 'product_' + Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_');
        var safeFilename = `${cleanName}_${Date.now()}.${ext}`;
        var uploadDir = path.join(__dirname, '..', 'images', 'products');

        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        fs.writeFileSync(path.join(uploadDir, safeFilename), buffer);
        finalUrl = `/images/products/${safeFilename}`;
      } else {
        return res.status(400).json({ error: 'يرجى تزويد رابط الصورة أو بيانات الصورة' });
      }

      // Record metadata in product_images
      var imgRecord = db.prepare(`
        INSERT INTO product_images (
          product_id, draft_id, image_type, image_url, filename, file_size, mime_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        product_id || null,
        draft_id || null,
        image_type || 'main',
        finalUrl,
        filename || path.basename(finalUrl),
        fileSize,
        mimeType
      );

      res.json({
        message: 'تم حفظ الصورة بنجاح',
        image_id: imgRecord.lastInsertRowid,
        image_url: finalUrl,
        filename: filename || path.basename(finalUrl),
        file_size: fileSize,
        mime_type: mimeType
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // 4. Secure Preview Endpoint
  // ============================================================
  router.get('/:id/preview', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var prod = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!prod) return res.status(404).json({ error: 'المنتج غير موجود' });

      // Check if there is an active draft for this product
      var draft = db.prepare("SELECT * FROM product_drafts WHERE product_id = ? AND status = 'draft'").get(req.params.id);

      res.json({
        live_product: prod,
        has_draft: !!draft,
        draft: draft || null,
        preview_data: draft || prod
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // 5. Version History & Restore Endpoints
  // ============================================================

  // GET /:id/versions - List full immutable version history
  router.get('/:id/versions', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var versions = db.prepare(`
        SELECT * FROM product_versions 
        WHERE product_id = ? 
        ORDER BY version_number DESC
      `).all(req.params.id);
      res.json(versions);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /:id/versions/:ver - Get single version snapshot
  router.get('/:id/versions/:ver', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var snapshot = db.prepare(`
        SELECT * FROM product_versions 
        WHERE product_id = ? AND version_number = ?
      `).get(req.params.id, req.params.ver);

      if (!snapshot) return res.status(404).json({ error: 'رقم النسخة غير موجود' });
      res.json(snapshot);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /:id/versions/:ver/restore - Non-destructive restore
  router.post('/:id/versions/:ver/restore', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var targetVer = db.prepare(`
        SELECT * FROM product_versions 
        WHERE product_id = ? AND version_number = ?
      `).get(req.params.id, req.params.ver);

      if (!targetVer) {
        return res.status(404).json({ error: 'النسخة التاريخية المطلوب استعادتها غير موجودة' });
      }

      var currentProd = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!currentProd) return res.status(404).json({ error: 'المنتج غير موجود' });

      var maxVerRow = db.prepare('SELECT MAX(version_number) as max_ver FROM product_versions WHERE product_id = ?').get(req.params.id);
      var newVersionNumber = (maxVerRow && maxVerRow.max_ver ? maxVerRow.max_ver : (currentProd.current_version || 1)) + 1;

      // Update live product with snapshot data
      db.prepare(`
        UPDATE products SET
          name = ?, name_en = ?, model = ?, category = ?,
          description = ?, description_en = ?, price = ?,
          image = ?, features = ?, publish_status = ?,
          current_version = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        targetVer.name, targetVer.name_en || '', targetVer.model || '', targetVer.category || '',
        targetVer.description || '', targetVer.description_en || '', targetVer.price || 0,
        targetVer.main_image || '', targetVer.features || '', targetVer.publish_status || 'published',
        newVersionNumber, req.params.id
      );

      var currentFull = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);

      // Create new immutable revision for the restore action (never delete history!)
      db.prepare(`
        INSERT INTO product_versions (
          product_id, version_number, name, name_en, model, category,
          manufacturer, agent, description, description_en, price, stock,
          status, main_image, gallery_images, features, keywords, technical_specs,
          publish_status, is_featured, sort_order, active, snapshot_json,
          change_summary, action_type, created_by, created_by_name
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, 1, ?,
          ?, ?, ?, ?
        )
      `).run(
        req.params.id, newVersionNumber, targetVer.name, targetVer.name_en || '',
        targetVer.model || '', targetVer.category || '',
        targetVer.manufacturer || '', targetVer.agent || '',
        targetVer.description || '', targetVer.description_en || '',
        targetVer.price || 0, currentProd.stock || 0,
        targetVer.status || 'متوفر',
        targetVer.main_image || '', targetVer.gallery_images || '[]',
        targetVer.features || '', targetVer.keywords || '', targetVer.technical_specs || '',
        targetVer.publish_status || 'published',
        targetVer.is_featured || 0, targetVer.sort_order || 0,
        JSON.stringify(currentFull),
        `استعادة غير تدميرية من النسخة #${req.params.ver}`,
        `restore_v${req.params.ver}`,
        req.user.id, req.user.name
      );

      // Log activity
      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, 'restore_version', 'product', req.params.id,
        JSON.stringify({ restored_from: req.params.ver, new_version: newVersionNumber })
      );

      var updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      res.json({
        message: `تم استعادة النسخة #${req.params.ver} بنجاح وإنشاء النسخة الجديدة #${newVersionNumber}`,
        new_version: newVersionNumber,
        product: updated
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // 6. Atomic Publish Endpoints (with Optimistic Locking)
  // ============================================================

  // POST /:id/publish - Publish changes to an existing product
  router.post('/:id/publish', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var currentProd = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!currentProd) return res.status(404).json({ error: 'المنتج غير موجود' });

      var b = req.body;

      // Optimistic locking check: prevent concurrent overwrite collisions
      if (b.expected_version !== undefined && b.expected_version !== null) {
        var curVer = currentProd.current_version || 1;
        if (parseInt(b.expected_version) !== curVer) {
          return res.status(409).json({
            error: `تعارض في التعديل: تم تحديث هذا المنتج من قبل مستخدم آخر (النسخة الحالية ${curVer} وليست ${b.expected_version}). يرجى تحديث الصفحة وإعادة المحاولة.`,
            current_version: curVer
          });
        }
      }

      var maxVerRow = db.prepare('SELECT MAX(version_number) as max_ver FROM product_versions WHERE product_id = ?').get(req.params.id);
      var newVersionNumber = (maxVerRow && maxVerRow.max_ver ? maxVerRow.max_ver : (currentProd.current_version || 1)) + 1;

      var name = b.name !== undefined ? b.name : currentProd.name;
      var name_en = b.name_en !== undefined ? b.name_en : currentProd.name_en;
      var model = b.model !== undefined ? b.model : currentProd.model;
      var category = b.category !== undefined ? b.category : currentProd.category;
      var description = b.description !== undefined ? b.description : currentProd.description;
      var description_en = b.description_en !== undefined ? b.description_en : currentProd.description_en;
      var price = b.price !== undefined ? parseFloat(b.price) : currentProd.price;
      var main_image = b.main_image || b.image || currentProd.image;
      var features = b.features !== undefined ? b.features : currentProd.features;
      var publish_status = b.publish_status || 'published';
      var is_featured = b.is_featured !== undefined ? (b.is_featured ? 1 : 0) : (currentProd.is_featured || 0);
      var sort_order = b.sort_order !== undefined ? parseInt(b.sort_order) : (currentProd.sort_order || 0);
      var technical_specs = b.technical_specs !== undefined ? b.technical_specs : (currentProd.technical_specs || '');
      var gallery_images = b.gallery_images !== undefined ? (typeof b.gallery_images === 'string' ? b.gallery_images : JSON.stringify(b.gallery_images)) : (currentProd.gallery_images || '[]');
      var change_summary = b.change_summary || 'تحديث ونشر المنتج';

      // Perform atomic update on products table
      db.prepare(`
        UPDATE products SET
          name = ?, name_en = ?, model = ?, category = ?,
          description = ?, description_en = ?, price = ?,
          image = ?, features = ?, publish_status = ?,
          current_version = ?, is_featured = ?, sort_order = ?,
          gallery_images = ?, technical_specs = ?,
          active = 1, is_archived = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        name, name_en || '', model || '', category || '',
        description || '', description_en || '', price || 0,
        main_image || '', features || '', publish_status,
        newVersionNumber, is_featured, sort_order,
        gallery_images, technical_specs,
        req.params.id
      );

      var currentFull = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);

      // Create immutable version record in product_versions
      db.prepare(`
        INSERT INTO product_versions (
          product_id, version_number, name, name_en, model, category,
          manufacturer, agent, description, description_en, price, stock,
          status, main_image, gallery_images, features, keywords, technical_specs,
          publish_status, is_featured, sort_order, active, snapshot_json,
          change_summary, action_type, created_by, created_by_name
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          'متوفر', ?, ?, ?, ?, ?,
          ?, ?, ?, 1, ?,
          ?, 'publish', ?, ?
        )
      `).run(
        req.params.id, newVersionNumber, name, name_en || '',
        model || '', category || '',
        b.manufacturer || b.agent || currentProd.manufacturer || '',
        b.agent || b.manufacturer || currentProd.agent || '',
        description || '', description_en || '',
        price || 0, currentProd.stock || 0,
        main_image || '', gallery_images,
        features || '', currentProd.keywords || '', technical_specs,
        publish_status, is_featured, sort_order,
        JSON.stringify(currentFull),
        change_summary,
        req.user.id, req.user.name
      );

      // Clean up draft if this was published from a draft
      if (b.draft_id) {
        db.prepare("UPDATE product_drafts SET status = 'published' WHERE id = ?").run(b.draft_id);
      } else {
        db.prepare("UPDATE product_drafts SET status = 'published' WHERE product_id = ? AND status = 'draft'").run(req.params.id);
      }

      // Log activity
      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, 'publish', 'product', req.params.id,
        JSON.stringify({ version: newVersionNumber, summary: change_summary })
      );

      var updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      res.json({
        message: 'تم نشر التعديلات بنجاح',
        version: newVersionNumber,
        product: updated
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /publish-new - Publish a new product from draft or direct form
  router.post('/publish-new', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var b = req.body;
      if (!b.name || !b.name.trim()) {
        return res.status(400).json({ error: 'اسم المنتج مطلوب للنشر' });
      }

      var store_id = b.store_id || 1;
      var stock = parseInt(b.stock) || 0;
      var price = parseFloat(b.price) || 0;
      var gallery_images = typeof b.gallery_images === 'string' ? b.gallery_images : JSON.stringify(b.gallery_images || []);

      var info = db.prepare(`
        INSERT INTO products (
          name, name_en, model, category, description, description_en,
          price, image, features, active, publish_status, current_version,
          is_featured, sort_order, gallery_images, technical_specs, is_archived
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, 1, 'published', 1,
          ?, ?, ?, ?, 0
        )
      `).run(
        b.name, b.name_en || '', b.model || '', b.category || '',
        b.description || '', b.description_en || '',
        price, b.main_image || b.image || '', b.features || '',
        b.is_featured ? 1 : 0, parseInt(b.sort_order) || 0,
        gallery_images, b.technical_specs || ''
      );

      var newProductId = info.lastInsertRowid;

      // Seed store_inventory for POS compatibility with INITIAL 0 STOCK (decoupled from catalog)
      var existingInv = db.prepare('SELECT id FROM store_inventory WHERE store_id = ? AND product_id = ?').get(store_id, newProductId);
      if (existingInv) {
        db.prepare('UPDATE store_inventory SET retail_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
          price, existingInv.id
        );
      } else {
        db.prepare(`
          INSERT INTO store_inventory (store_id, product_id, stock_quantity, retail_price, wholesale_price, purchase_price, unit, min_stock_alert)
          VALUES (?, ?, 0, ?, ?, ?, ?, ?)
        `).run(store_id, newProductId, price, price * 0.85, price * 0.70, b.unit || 'قطعة', 5);
      }

      var currentFull = db.prepare('SELECT * FROM products WHERE id = ?').get(newProductId);

      // Create foundational version 1 record with complete field snapshot
      db.prepare(`
        INSERT INTO product_versions (
          product_id, version_number, name, name_en, model, category,
          manufacturer, agent, description, description_en, price, stock,
          status, main_image, gallery_images, features, keywords, technical_specs,
          publish_status, is_featured, sort_order, active, snapshot_json,
          change_summary, action_type, created_by, created_by_name
        ) VALUES (
          ?, 1, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, 0,
          'متوفر', ?, ?, ?, '', ?,
          'published', ?, ?, 1, ?,
          'النسخة التأسيسية الأولى للمنتج الجديد', 'initial_publish', ?, ?
        )
      `).run(
        newProductId, b.name, b.name_en || '', b.model || '', b.category || '',
        b.manufacturer || b.agent || '', b.agent || b.manufacturer || '',
        b.description || '', b.description_en || '', price,
        b.main_image || b.image || '', gallery_images,
        b.features || '', b.technical_specs || '',
        b.is_featured ? 1 : 0, parseInt(b.sort_order) || 0,
        JSON.stringify(currentFull),
        req.user.id, req.user.name
      );

      // Clean up draft if applicable
      if (b.draft_id) {
        db.prepare("UPDATE product_drafts SET status = 'published', product_id = ? WHERE id = ?").run(newProductId, b.draft_id);
      }

      // Log activity
      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, 'publish_new', 'product', newProductId,
        JSON.stringify({ name: b.name, price: price })
      );

      var created = db.prepare('SELECT * FROM products WHERE id = ?').get(newProductId);
      res.status(201).json({
        message: 'تم نشر المنتج الجديد بنجاح',
        product: created,
        version: 1
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ============================================================
  // 7. Core Catalog Endpoints (100% Backward Compatible)
  // ============================================================

  // GET / - List products (respects POS store_id and filters)
  router.get('/', function (req, res) {
    try {
      var storeId = req.query.store_id;
      var includeArchived = req.query.include_archived === 'true';
      var products;

      var archiveFilter = includeArchived ? '1=1' : '(p.is_archived = 0 OR p.is_archived IS NULL)';

      if (storeId) {
        products = db.prepare(`
          SELECT 
            p.*,
            COALESCE(si.stock_quantity, 0) as stock,
            COALESCE(si.retail_price, p.price) as store_price,
            COALESCE(si.purchase_price, 0) as purchase_price,
            COALESCE(si.wholesale_price, 0) as wholesale_price,
            COALESCE(si.unit, 'قطعة') as unit,
            COALESCE(si.min_stock_alert, 5) as min_stock_alert,
            CASE 
              WHEN COALESCE(si.stock_quantity, 0) <= 0 THEN 'غير متوفر'
              WHEN COALESCE(si.stock_quantity, 0) <= COALESCE(si.min_stock_alert, 5) THEN 'مخزون منخفض'
              ELSE 'متوفر'
            END as status
          FROM products p
          LEFT JOIN store_inventory si ON p.id = si.product_id AND si.store_id = ?
          WHERE ${archiveFilter}
          ORDER BY p.id DESC
        `).all(storeId);
      } else {
        products = db.prepare(`
          SELECT 
            p.*,
            (SELECT COALESCE(SUM(stock_quantity), 0) FROM store_inventory WHERE product_id = p.id) as total_stock
          FROM products p
          WHERE ${archiveFilter}
          ORDER BY p.id DESC
        `).all().map(function (p) {
          if (p.total_stock !== null && p.total_stock !== undefined) {
            p.stock = p.total_stock;
          }
          return p;
        });
      }

      res.json(products);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /categories - List categories
  router.get('/categories', function (req, res) {
    try {
      var categories = db.prepare("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' AND (is_archived = 0 OR is_archived IS NULL)").all();
      res.json(categories.map(function (c) { return c.category; }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /search - Search catalog
  router.get('/search', function (req, res) {
    try {
      var q = req.query.q;
      if (!q) return res.json([]);
      var term = '%' + q + '%';
      var products = db.prepare(`
        SELECT * FROM products 
        WHERE (name LIKE ? OR name_en LIKE ? OR model LIKE ? OR category LIKE ? OR description LIKE ?)
          AND (is_archived = 0 OR is_archived IS NULL)
        ORDER BY id DESC
      `).all(term, term, term, term, term);
      res.json(products);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /:id - Single product details
  router.get('/:id', function (req, res) {
    try {
      var storeId = req.query.store_id;
      var product;

      if (storeId) {
        product = db.prepare(`
          SELECT 
            p.*,
            COALESCE(si.stock_quantity, 0) as stock,
            COALESCE(si.retail_price, p.price) as store_price,
            COALESCE(si.purchase_price, 0) as purchase_price,
            COALESCE(si.wholesale_price, 0) as wholesale_price,
            COALESCE(si.unit, 'قطعة') as unit,
            COALESCE(si.min_stock_alert, 5) as min_stock_alert
          FROM products p
          LEFT JOIN store_inventory si ON p.id = si.product_id AND si.store_id = ?
          WHERE p.id = ?
        `).get(storeId, req.params.id);
      } else {
        product = db.prepare(`
          SELECT 
            p.*,
            (SELECT COALESCE(SUM(stock_quantity), 0) FROM store_inventory WHERE product_id = p.id) as total_stock
          FROM products p
          WHERE p.id = ?
        `).get(req.params.id);

        if (product && product.total_stock !== null && product.total_stock !== undefined) {
          product.stock = product.total_stock;
        }
      }

      if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
      res.json(product);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST / - Create product (legacy support)
  router.post('/', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var { name, name_en, model, category, description, description_en, price, stock, image, features, store_id } = req.body;
      if (!name) return res.status(400).json({ error: 'اسم المنتج مطلوب' });

      var info = db.prepare(`
        INSERT INTO products (name, name_en, model, category, description, description_en, price, image, features, active, publish_status, current_version, is_archived)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'published', 1, 0)
      `).run(
        name, name_en || '', model || '', category || '',
        description || '', description_en || '',
        parseFloat(price) || 0, image || '', features || ''
      );

      var productId = info.lastInsertRowid;
      var sid = store_id || 1;
      var sQty = parseInt(stock) || 0;
      var sPrice = parseFloat(price) || 0;

      var existingInv = db.prepare('SELECT id FROM store_inventory WHERE store_id = ? AND product_id = ?').get(sid, productId);
      if (existingInv) {
        db.prepare('UPDATE store_inventory SET stock_quantity = ?, retail_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(sQty, sPrice, existingInv.id);
      } else {
        db.prepare(`
          INSERT INTO store_inventory (store_id, product_id, stock_quantity, retail_price, wholesale_price, purchase_price, unit, min_stock_alert)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(sid, productId, sQty, sPrice, sPrice * 0.85, sPrice * 0.70, 'قطعة', 5);
      }

      // Initial baseline version
      try {
        db.prepare(`
          INSERT INTO product_versions (
            product_id, version_number, name, name_en, model, category,
            manufacturer, agent, description, description_en, price, stock,
            main_image, gallery_images, features, technical_specs,
            publish_status, is_featured, sort_order, change_summary,
            action_type, created_by, created_by_name
          ) VALUES (
            ?, 1, ?, ?, ?, ?,
            '', '', ?, ?, ?, ?,
            ?, '[]', ?, '',
            'published', 0, 0, 'إنشاء المنتج',
            'legacy_create', ?, ?
          )
        `).run(
          productId, name, name_en || '', model || '', category || '',
          description || '', description_en || '', sPrice, sQty,
          image || '', features || '', req.user.id, req.user.name
        );
      } catch (e) {}

      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, 'create', 'product', productId, JSON.stringify({ name: name, price: price })
      );

      var product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
      res.status(201).json(product);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /:id - Update product (legacy support)
  router.put('/:id', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'المنتج غير موجود' });

      var { name, name_en, model, category, description, description_en, price, stock, image, features, active, store_id } = req.body;

      db.prepare(`
        UPDATE products SET
          name = COALESCE(?, name),
          name_en = COALESCE(?, name_en),
          model = COALESCE(?, model),
          category = COALESCE(?, category),
          description = COALESCE(?, description),
          description_en = COALESCE(?, description_en),
          price = COALESCE(?, price),
          image = COALESCE(?, image),
          features = COALESCE(?, features),
          active = COALESCE(?, active),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        name, name_en, model, category, description, description_en,
        price !== undefined ? parseFloat(price) : null,
        image, features,
        active !== undefined ? (active ? 1 : 0) : null,
        req.params.id
      );

      if (stock !== undefined && store_id) {
        db.prepare('UPDATE store_inventory SET stock_quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE store_id = ? AND product_id = ?').run(
          parseInt(stock), store_id, req.params.id
        );
      }

      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, 'update', 'product', req.params.id, JSON.stringify({ name: name || existing.name })
      );

      var product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      res.json(product);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /:id - Audit-safe delete or archive
  router.delete('/:id', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'المنتج غير موجود' });

      // Check if product is referenced in invoices, purchases, or returns
      var invoiceRefs = 0;
      var purchaseRefs = 0;
      var returnRefs = 0;

      try {
        var invRow = db.prepare('SELECT COUNT(*) as count FROM invoice_items WHERE product_id = ?').get(req.params.id);
        invoiceRefs = invRow ? invRow.count : 0;
      } catch (e) {}

      try {
        var purRow = db.prepare('SELECT COUNT(*) as count FROM purchase_items WHERE product_id = ?').get(req.params.id);
        purchaseRefs = purRow ? purRow.count : 0;
      } catch (e) {}

      try {
        var retRow = db.prepare('SELECT COUNT(*) as count FROM sales_return_items WHERE product_id = ?').get(req.params.id);
        returnRefs = retRow ? retRow.count : 0;
      } catch (e) {}

      var totalRefs = invoiceRefs + purchaseRefs + returnRefs;

      if (totalRefs > 0) {
        // Safe logical archive: protect relational integrity!
        db.prepare(`
          UPDATE products SET
            is_archived = 1,
            active = 0,
            publish_status = 'archived',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(req.params.id);

        db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
          req.user.id, req.user.name, 'archive', 'product', req.params.id,
          JSON.stringify({ name: existing.name, reason: 'مرتبط بحركات مالية وفواتير', references_count: totalRefs })
        );

        return res.json({
          message: 'تم أرشفة المنتج بنجاح بدلاً من الحذف الفعلي لوجود سجلات فواتير ومبيعات مرتبطة به',
          archived: true,
          references_count: totalRefs,
          id: req.params.id
        });
      }

      // No financial references -> safe to remove
      db.prepare('DELETE FROM store_inventory WHERE product_id = ?').run(req.params.id);
      db.prepare('DELETE FROM stock_adjustments WHERE product_id = ?').run(req.params.id);
      db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);

      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, 'delete', 'product', req.params.id, JSON.stringify({ name: existing.name })
      );

      res.json({ message: 'تم حذف المنتج بنجاح', id: req.params.id, archived: false });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /:id/toggle - Toggle product active status
  router.patch('/:id/toggle', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });

      var newActive = product.active ? 0 : 1;
      var newStatus = newActive ? 'published' : 'hidden';

      db.prepare('UPDATE products SET active = ?, publish_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        newActive, newStatus, req.params.id
      );

      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, newActive ? 'activate' : 'deactivate', 'product', req.params.id, JSON.stringify({ name: product.name })
      );

      res.json({
        message: newActive ? 'تم تفعيل المنتج' : 'تم تعطيل المنتج',
        active: newActive,
        publish_status: newStatus
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
