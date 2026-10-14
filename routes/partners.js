var express = require('express');
var { authenticateToken } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  router.get('/', function (req, res) {
    try {
      var partners = db.prepare('SELECT * FROM partners ORDER BY id DESC').all();
      res.json(partners);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', function (req, res) {
    try {
      var partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
      if (!partner) return res.status(404).json({ error: 'Partner not found' });
      res.json(partner);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', authenticateToken, function (req, res) {
    try {
      var { name, country, specialty, description, phone, email, address, notes, status } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });

      var result = db.prepare('INSERT INTO partners (name, country, specialty, description, phone, email, address, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        name, country || '', specialty || '', description || '', phone || '', email || '', address || '', notes || '', status || 'active'
      );

      var partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(partner);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', authenticateToken, function (req, res) {
    try {
      var existing = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Partner not found' });

      var { name, country, specialty, description, phone, email, address, notes, status } = req.body;

      db.prepare('UPDATE partners SET name = ?, country = ?, specialty = ?, description = ?, phone = ?, email = ?, address = ?, notes = ?, status = ? WHERE id = ?').run(
        name || existing.name,
        country !== undefined ? country : existing.country,
        specialty !== undefined ? specialty : existing.specialty,
        description !== undefined ? description : existing.description,
        phone !== undefined ? phone : existing.phone,
        email !== undefined ? email : existing.email,
        address !== undefined ? address : existing.address,
        notes !== undefined ? notes : existing.notes,
        status || existing.status,
        req.params.id
      );

      var partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
      res.json(partner);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/:id/toggle', authenticateToken, function (req, res) {
    try {
      var partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(req.params.id);
      if (!partner) return res.status(404).json({ error: 'Partner not found' });

      var newStatus = partner.status === 'active' ? 'inactive' : 'active';
      db.prepare("UPDATE partners SET status = ? WHERE id = ?").run(newStatus, req.params.id);

      res.json({ message: newStatus === 'active' ? 'Partner activated' : 'Partner deactivated', status: newStatus });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
