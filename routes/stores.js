var express = require('express');
var { authenticateToken, requireRole, requireStoreAccess } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  // List all stores
  router.get('/', authenticateToken, function (req, res) {
    try {
      var stores;
      // If user is locked to a specific store, only return that store unless they are admin/no store assigned
      if (req.user.store_id && req.user.role !== 'admin') {
        stores = db.prepare('SELECT * FROM stores WHERE id = ?').all(req.user.store_id);
      } else {
        stores = db.prepare('SELECT * FROM stores ORDER BY id ASC').all();
      }

      // Append summary stats for each store
      stores = stores.map(function (s) {
        var invStats = db.prepare(`
          SELECT 
            COUNT(*) as total_items,
            COALESCE(SUM(stock_quantity), 0) as total_units,
            COALESCE(SUM(stock_quantity * purchase_price), 0) as inventory_value
          FROM store_inventory
          WHERE store_id = ?
        `).get(s.id);

        var salesStats = db.prepare(`
          SELECT 
            COUNT(*) as total_invoices,
            COALESCE(SUM(total_amount), 0) as total_sales,
            COALESCE(SUM(paid_amount), 0) as total_collected,
            COALESCE(SUM(remaining_amount), 0) as total_receivables
          FROM invoices
          WHERE store_id = ? AND status != 'cancelled'
        `).get(s.id);

        return Object.assign({}, s, {
          total_items: invStats ? invStats.total_items : 0,
          total_units: invStats ? invStats.total_units : 0,
          inventory_value: invStats ? invStats.inventory_value : 0,
          total_invoices: salesStats ? salesStats.total_invoices : 0,
          total_sales: salesStats ? salesStats.total_sales : 0,
          total_collected: salesStats ? salesStats.total_collected : 0,
          total_receivables: salesStats ? salesStats.total_receivables : 0
        });
      });

      res.json(stores);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single store details
  router.get('/:id', authenticateToken, requireStoreAccess, function (req, res) {
    try {
      var store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
      if (!store) return res.status(404).json({ error: 'المحل غير موجود' });
      res.json(store);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create new store (Admin only)
  router.post('/', authenticateToken, requireRole('admin'), function (req, res) {
    try {
      var { name, code, address, phone, email, tax_number, invoice_prefix, invoice_footer } = req.body;
      if (!name || !code) {
        return res.status(400).json({ error: 'اسم المحل ورمز المحل مطلوبان' });
      }

      var existing = db.prepare('SELECT id FROM stores WHERE code = ?').get(code.trim().toUpperCase());
      if (existing) {
        return res.status(400).json({ error: 'رمز المحل مستخدم بالفعل لمحل آخر' });
      }

      var prefix = invoice_prefix || ('INV-' + code.trim().toUpperCase());
      var result = db.prepare(`
        INSERT INTO stores (name, code, address, phone, email, tax_number, invoice_prefix, invoice_footer, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        name.trim(),
        code.trim().toUpperCase(),
        address || '',
        phone || '',
        email || '',
        tax_number || '',
        prefix,
        invoice_footer || ''
      );

      var newStoreId = result.lastInsertRowid;

      // Automatically create store inventory records for all existing products with 0 stock
      var products = db.prepare('SELECT id, price FROM products').all();
      products.forEach(function (p) {
        var purchaseCost = p.price > 0 ? Math.round(p.price * 0.7) : 0;
        var wholesale = p.price > 0 ? Math.round(p.price * 0.88) : 0;
        db.prepare(`
          INSERT OR IGNORE INTO store_inventory (store_id, product_id, stock_quantity, min_stock_alert, purchase_price, wholesale_price, retail_price, unit)
          VALUES (?, ?, 0, 5, ?, ?, ?, 'قطعة')
        `).run(newStoreId, p.id, purchaseCost, wholesale, p.price || 0);
      });

      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, 'create', 'store', newStoreId, JSON.stringify({ name: name, code: code })
      );

      var createdStore = db.prepare('SELECT * FROM stores WHERE id = ?').get(newStoreId);
      res.status(201).json(createdStore);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update store (Admin or Store Manager of this store)
  router.put('/:id', authenticateToken, requireStoreAccess, function (req, res) {
    try {
      var existing = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'المحل غير موجود' });

      var { name, address, phone, email, tax_number, invoice_prefix, invoice_footer, status } = req.body;

      db.prepare(`
        UPDATE stores
        SET name = ?, address = ?, phone = ?, email = ?, tax_number = ?, invoice_prefix = ?, invoice_footer = ?, status = ?
        WHERE id = ?
      `).run(
        name || existing.name,
        address !== undefined ? address : existing.address,
        phone !== undefined ? phone : existing.phone,
        email !== undefined ? email : existing.email,
        tax_number !== undefined ? tax_number : existing.tax_number,
        invoice_prefix || existing.invoice_prefix,
        invoice_footer !== undefined ? invoice_footer : existing.invoice_footer,
        status || existing.status,
        req.params.id
      );

      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, 'update', 'store', req.params.id, JSON.stringify({ name: name || existing.name })
      );

      var updated = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Toggle store active/inactive (Admin only - preserves historical data)
  router.patch('/:id/toggle', authenticateToken, requireRole('admin'), function (req, res) {
    try {
      var store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
      if (!store) return res.status(404).json({ error: 'المحل غير موجود' });

      var newStatus = store.status === 'active' ? 'inactive' : 'active';
      db.prepare('UPDATE stores SET status = ? WHERE id = ?').run(newStatus, req.params.id);

      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, newStatus === 'active' ? 'activate' : 'deactivate', 'store', req.params.id, JSON.stringify({ name: store.name })
      );

      res.json({ message: newStatus === 'active' ? 'تم تفعيل المحل بنجاح' : 'تم تعطيل المحل بنجاح', status: newStatus });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
