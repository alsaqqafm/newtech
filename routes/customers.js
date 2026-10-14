var express = require('express');
var { authenticateToken } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  router.get('/', function (req, res) {
    try {
      var customers = db.prepare("SELECT *, orders_count as orders FROM customers ORDER BY id DESC").all();
      res.json(customers);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', function (req, res) {
    try {
      var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      res.json(customer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', authenticateToken, function (req, res) {
    try {
      var { name, email, phone, city, address, orders_count, total, status } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });

      var result = db.prepare('INSERT INTO customers (name, email, phone, city, address, orders_count, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        name, email || '', phone || '', city || '', address || '', orders_count || 0, total || 0, status || 'active'
      );

      var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(customer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', authenticateToken, function (req, res) {
    try {
      var existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Customer not found' });

      var { name, email, phone, city, address, orders_count, total, status } = req.body;

      db.prepare('UPDATE customers SET name = ?, email = ?, phone = ?, city = ?, address = ?, orders_count = ?, total = ?, status = ? WHERE id = ?').run(
        name || existing.name,
        email !== undefined ? email : existing.email,
        phone !== undefined ? phone : existing.phone,
        city !== undefined ? city : existing.city,
        address !== undefined ? address : existing.address,
        orders_count !== undefined ? orders_count : existing.orders_count,
        total !== undefined ? total : existing.total,
        status || existing.status,
        req.params.id
      );

      var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
      res.json(customer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/:id/toggle', authenticateToken, function (req, res) {
    try {
      var customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });

      var newStatus = customer.status === 'active' ? 'inactive' : 'active';
      db.prepare("UPDATE customers SET status = ? WHERE id = ?").run(newStatus, req.params.id);

      res.json({ message: newStatus === 'active' ? 'Customer activated' : 'Customer deactivated', status: newStatus });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
