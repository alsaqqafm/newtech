var express = require('express');
var { authenticateToken, optionalAuth, requireRole, requireStoreAccess } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  router.get('/', optionalAuth, async function (req, res) {
    try {
      var storeId = req.query.store_id || (req.user ? req.user.store_id : null);
      var query = "SELECT o.*, o.customer_name as customer, o.created_at as date, s.name as store_name, s.code as store_code FROM orders o LEFT JOIN stores s ON o.store_id = s.id";
      var params = [];

      if (storeId && (!req.user || req.user.role !== 'admin')) {
        query += " WHERE o.store_id = ?";
        params.push(storeId);
      } else if (req.query.store_id) {
        query += " WHERE o.store_id = ?";
        params.push(req.query.store_id);
      }
      query += " ORDER BY o.id DESC";

      var orders = await db.prepare(query).all.apply(null, params);
      res.json(orders);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', optionalAuth, async function (req, res) {
    try {
      var order = await db.prepare('SELECT o.*, o.customer_name as customer, o.created_at as date, s.name as store_name, s.code as store_code FROM orders o LEFT JOIN stores s ON o.store_id = s.id WHERE o.id = ?').get(req.params.id);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });

      if (req.user && req.user.store_id && req.user.role !== 'admin' && req.user.store_id !== order.store_id) {
        return res.status(403).json({ error: 'غير مصرح بالاطلاع على طلبات هذا المحل' });
      }

      res.json(order);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', optionalAuth, async function (req, res) {
    try {
      var { customer_id, customer_name, phone, products, amount, status, notes, store_id } = req.body;
      if (!customer_name) return res.status(400).json({ error: 'اسم العميل مطلوب' });

      var targetStoreId = store_id || (req.user && req.user.store_id) || 1;

      var result = await db.prepare('INSERT INTO orders (customer_id, customer_name, phone, products, amount, status, notes, store_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        customer_id || null, customer_name, phone || '', products || '', amount || 0, status || 'pending', notes || '', targetStoreId
      );

      var order = await db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(order);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', authenticateToken, async function (req, res) {
    try {
      var existing = await db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'الطلب غير موجود' });

      if (req.user.store_id && req.user.role !== 'admin' && req.user.store_id !== existing.store_id) {
        return res.status(403).json({ error: 'غير مصرح بتعديل طلبات محل آخر' });
      }

      var { customer_id, customer_name, phone, products, amount, status, notes, store_id } = req.body;

      await db.prepare('UPDATE orders SET customer_id = ?, customer_name = ?, phone = ?, products = ?, amount = ?, status = ?, notes = ?, store_id = ? WHERE id = ?').run(
        customer_id !== undefined ? customer_id : existing.customer_id,
        customer_name || existing.customer_name,
        phone !== undefined ? phone : existing.phone,
        products !== undefined ? products : existing.products,
        amount !== undefined ? amount : existing.amount,
        status || existing.status,
        notes !== undefined ? notes : existing.notes,
        store_id || existing.store_id,
        req.params.id
      );

      var order = await db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
      res.json(order);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/:id/toggle', authenticateToken, async function (req, res) {
    try {
      var order = await db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
      if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });

      if (req.user.store_id && req.user.role !== 'admin' && req.user.store_id !== order.store_id) {
        return res.status(403).json({ error: 'غير مصرح بتعديل طلبات محل آخر' });
      }

      var newActive = order.active ? 0 : 1;
      await db.prepare('UPDATE orders SET active = ? WHERE id = ?').run(newActive, req.params.id);

      res.json({ message: newActive ? 'تم تفعيل الطلب' : 'تم إيقاف تنشيط الطلب', active: newActive });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
