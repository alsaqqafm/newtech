var express = require('express');
var { authenticateToken, requireRole, requireStoreAccess } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  // Get inventory for a specific store
  router.get('/', authenticateToken, requireStoreAccess, function (req, res) {
    try {
      var storeId = req.query.store_id || (req.user.store_id ? req.user.store_id : 1);

      // Verify user has access to this store
      if (req.user.store_id && String(req.user.store_id) !== String(storeId) && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح لك بالوصول لمخزون هذا المحل' });
      }

      var items = db.prepare(`
        SELECT 
          si.id,
          si.store_id,
          s.name as store_name,
          s.code as store_code,
          si.product_id,
          p.name as product_name,
          p.model,
          p.category,
          p.image,
          p.agent,
          si.stock_quantity,
          si.min_stock_alert,
          si.purchase_price,
          si.wholesale_price,
          si.retail_price,
          si.batch_number,
          si.expiry_date,
          si.unit,
          si.updated_at,
          CASE 
            WHEN si.stock_quantity <= 0 THEN 'نفذ المخزون'
            WHEN si.stock_quantity <= si.min_stock_alert THEN 'مخزون منخفض'
            ELSE 'متوفر'
          END as stock_status
        FROM store_inventory si
        JOIN products p ON si.product_id = p.id
        JOIN stores s ON si.store_id = s.id
        WHERE si.store_id = ?
        ORDER BY p.name ASC
      `).all(storeId);

      res.json(items);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get low stock alerts for store
  router.get('/alerts', authenticateToken, requireStoreAccess, function (req, res) {
    try {
      var storeId = req.query.store_id || req.user.store_id;
      var query = `
        SELECT 
          si.id,
          si.store_id,
          s.name as store_name,
          p.id as product_id,
          p.name as product_name,
          si.stock_quantity,
          si.min_stock_alert
        FROM store_inventory si
        JOIN products p ON si.product_id = p.id
        JOIN stores s ON si.store_id = s.id
        WHERE si.stock_quantity <= si.min_stock_alert
      `;
      var params = [];
      if (storeId) {
        query += ' AND si.store_id = ?';
        params.push(storeId);
      }
      query += ' ORDER BY si.stock_quantity ASC';
      var alerts = db.prepare(query).all.apply(null, params);
      res.json(alerts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get inventory movement transactions ledger
  router.get('/transactions', authenticateToken, requireStoreAccess, function (req, res) {
    try {
      var storeId = req.query.store_id || req.user.store_id;
      var productId = req.query.product_id;
      var changeType = req.query.change_type;
      var limit = parseInt(req.query.limit) || 100;

      var whereClauses = [];
      var params = [];

      if (storeId) {
        // Enforce store isolation
        if (req.user.store_id && String(req.user.store_id) !== String(storeId) && req.user.role !== 'admin') {
          return res.status(403).json({ error: 'غير مصرح بالاطلاع على حركات هذا المحل' });
        }
        whereClauses.push('it.store_id = ?');
        params.push(storeId);
      } else if (req.user.store_id && req.user.role !== 'admin') {
        whereClauses.push('it.store_id = ?');
        params.push(req.user.store_id);
      }

      if (productId) {
        whereClauses.push('it.product_id = ?');
        params.push(productId);
      }
      if (changeType) {
        whereClauses.push('it.change_type = ?');
        params.push(changeType);
      }

      var whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

      var transactions = db.prepare(`
        SELECT 
          it.*,
          s.name as store_name,
          s.code as store_code,
          p.name as product_name,
          p.model
        FROM inventory_transactions it
        JOIN stores s ON it.store_id = s.id
        JOIN products p ON it.product_id = p.id
        ${whereSql}
        ORDER BY it.id DESC
        LIMIT ?
      `).all.apply(null, params.concat([limit]));

      res.json(transactions);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update inventory pricing / unit / batch / expiry
  router.put('/:id', authenticateToken, requireRole('admin', 'store_manager', 'inventory'), function (req, res) {
    try {
      var item = db.prepare('SELECT * FROM store_inventory WHERE id = ?').get(req.params.id);
      if (!item) return res.status(404).json({ error: 'سجل المخزون غير موجود' });

      // Check store access
      if (req.user.store_id && req.user.store_id !== item.store_id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح بتعديل مخزون هذا المحل' });
      }

      var { min_stock_alert, purchase_price, wholesale_price, retail_price, batch_number, expiry_date, unit } = req.body;

      db.prepare(`
        UPDATE store_inventory
        SET min_stock_alert = ?, purchase_price = ?, wholesale_price = ?, retail_price = ?, batch_number = ?, expiry_date = ?, unit = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(
        min_stock_alert !== undefined ? min_stock_alert : item.min_stock_alert,
        purchase_price !== undefined ? purchase_price : item.purchase_price,
        wholesale_price !== undefined ? wholesale_price : item.wholesale_price,
        retail_price !== undefined ? retail_price : item.retail_price,
        batch_number !== undefined ? batch_number : item.batch_number,
        expiry_date !== undefined ? expiry_date : item.expiry_date,
        unit || item.unit,
        req.params.id
      );

      var updated = db.prepare('SELECT * FROM store_inventory WHERE id = ?').get(req.params.id);
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Physical stocktaking adjustment (تسوية الجرد)
  router.post('/adjust', authenticateToken, requireRole('admin', 'store_manager', 'inventory'), function (req, res) {
    try {
      var store_id = req.body.store_id;
      var product_id = req.body.product_id;
      var actual_quantity = req.body.actual_quantity !== undefined ? req.body.actual_quantity : req.body.physical_qty;
      var reason = req.body.reason;
      if (!store_id || !product_id || actual_quantity === undefined) {
        return res.status(400).json({ error: 'المحل والمنتج والكمية الفعلية مطلوبة' });
      }

      if (req.user.store_id && String(req.user.store_id) !== String(store_id) && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح لك بإجراء تسوية جرد لهذا المحل' });
      }

      var inv = db.prepare('SELECT * FROM store_inventory WHERE store_id = ? AND product_id = ?').get(store_id, product_id);
      if (!inv) return res.status(404).json({ error: 'المنتج غير معرف في مخزون هذا المحل' });

      var systemQty = inv.stock_quantity;
      var difference = actual_quantity - systemQty;

      // Update actual stock
      db.prepare("UPDATE store_inventory SET stock_quantity = ?, updated_at = datetime('now') WHERE id = ?").run(actual_quantity, inv.id);

      // Record in stock adjustments
      var adjResult = db.prepare(`
        INSERT INTO stock_adjustments (store_id, product_id, system_quantity, actual_quantity, difference, reason, created_by, created_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        store_id, product_id, systemQty, actual_quantity, difference, reason || 'تسوية جرد دوري', req.user.id, req.user.name
      );

      // Log in inventory transaction ledger
      db.prepare(`
        INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, reference_id, user_id, user_name, notes)
        VALUES (?, ?, 'adjustment', ?, ?, 'stock_adjustment', ?, ?, ?, ?)
      `).run(
        store_id, product_id, difference, actual_quantity, adjResult.lastInsertRowid, req.user.id, req.user.name,
        'تسوية جرد: ' + (reason || 'فارق جرد فعلي') + ` (السابق: ${systemQty}، الفعلي: ${actual_quantity})`
      );

      res.json({
        message: 'تمت تسوية الجرد وتحديث المخزون بنجاح',
        previous_quantity: systemQty,
        actual_quantity: actual_quantity,
        difference: difference
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
