var express = require('express');
var { authenticateToken } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  router.get('/', function (req, res) {
    try {
      var quotes = db.prepare("SELECT *, created_at as date FROM quotes ORDER BY id DESC").all();
      res.json(quotes);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', function (req, res) {
    try {
      var quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
      if (!quote) return res.status(404).json({ error: 'Quote not found' });
      res.json(quote);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', function (req, res) {
    try {
      var { name, email, phone, product, message } = req.body;
      if (!name || !email || !phone) {
        return res.status(400).json({ error: 'Name, email and phone are required' });
      }

      var result = db.prepare('INSERT INTO quotes (name, email, phone, product, message, status) VALUES (?, ?, ?, ?, ?, ?)').run(
        name, email, phone, product || '', message || '', 'new'
      );

      var quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(quote);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', authenticateToken, function (req, res) {
    try {
      var existing = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Quote not found' });

      var { name, email, phone, product, message, status, response } = req.body;

      var responseDate = response && response !== existing.response ? new Date().toISOString() : existing.response_date;

      db.prepare('UPDATE quotes SET name = ?, email = ?, phone = ?, product = ?, message = ?, status = ?, response = ?, response_date = ? WHERE id = ?').run(
        name || existing.name,
        email !== undefined ? email : existing.email,
        phone !== undefined ? phone : existing.phone,
        product !== undefined ? product : existing.product,
        message !== undefined ? message : existing.message,
        status || existing.status,
        response !== undefined ? response : existing.response,
        responseDate,
        req.params.id
      );

      var quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
      res.json(quote);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/:id/toggle', authenticateToken, function (req, res) {
    try {
      var quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
      if (!quote) return res.status(404).json({ error: 'Quote not found' });

      var newActive = quote.active ? 0 : 1;
      db.prepare('UPDATE quotes SET active = ? WHERE id = ?').run(newActive, req.params.id);

      res.json({ message: newActive ? 'Quote activated' : 'Quote deactivated', active: newActive });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
