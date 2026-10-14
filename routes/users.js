var express = require('express');
var bcrypt = require('bcryptjs');
var { authenticateToken, requireRole } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  router.get('/', authenticateToken, requireRole('admin'), function (req, res) {
    try {
      var users = db.prepare(`
        SELECT 
          u.id, u.name, u.email, u.role, u.status, u.created_at, u.last_login, u.store_id,
          s.name as store_name, s.code as store_code
        FROM users u
        LEFT JOIN stores s ON u.store_id = s.id
        ORDER BY u.id DESC
      `).all();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', authenticateToken, requireRole('admin'), function (req, res) {
    try {
      var user = db.prepare(`
        SELECT 
          u.id, u.name, u.email, u.role, u.status, u.created_at, u.last_login, u.store_id,
          s.name as store_name, s.code as store_code
        FROM users u
        LEFT JOIN stores s ON u.store_id = s.id
        WHERE u.id = ?
      `).get(req.params.id);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', authenticateToken, requireRole('admin'), function (req, res) {
    try {
      var { name, email, password, role, status, store_id } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'الاسم والبريد الإلكتروني وكلمة المرور مطلوبة' });
      }

      var existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existing) {
        return res.status(400).json({ error: 'البريد الإلكتروني مستخدم بالفعل' });
      }

      var salt = bcrypt.genSaltSync(10);
      var hashedPassword = bcrypt.hashSync(password, salt);

      var assignedStoreId = (role === 'admin' || !store_id) ? null : parseInt(store_id);

      var result = db.prepare(`
        INSERT INTO users (name, email, password, role, status, store_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        name, email, hashedPassword, role || 'editor', status || 'active', assignedStoreId
      );

      var user = db.prepare('SELECT id, name, email, role, status, store_id, created_at, last_login FROM users WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', authenticateToken, requireRole('admin'), function (req, res) {
    try {
      var existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'المستخدم غير موجود' });

      var { name, email, password, role, status, store_id } = req.body;

      var newRole = role || existing.role;
      var newStoreId = (newRole === 'admin' || store_id === null) ? null : (store_id !== undefined ? parseInt(store_id) : existing.store_id);

      if (password) {
        var salt = bcrypt.genSaltSync(10);
        var hashedPassword = bcrypt.hashSync(password, salt);
        db.prepare('UPDATE users SET name = ?, email = ?, password = ?, role = ?, status = ?, store_id = ? WHERE id = ?').run(
          name || existing.name,
          email || existing.email,
          hashedPassword,
          newRole,
          status || existing.status,
          newStoreId,
          req.params.id
        );
      } else {
        db.prepare('UPDATE users SET name = ?, email = ?, role = ?, status = ?, store_id = ? WHERE id = ?').run(
          name || existing.name,
          email || existing.email,
          newRole,
          status || existing.status,
          newStoreId,
          req.params.id
        );
      }

      var user = db.prepare('SELECT id, name, email, role, status, store_id, created_at, last_login FROM users WHERE id = ?').get(req.params.id);
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/:id/toggle', authenticateToken, requireRole('admin'), function (req, res) {
    try {
      var user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

      if (user.role === 'admin' && user.status === 'active') {
        var activeAdminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND status = 'active'").get().count;
        if (activeAdminCount <= 1) {
          return res.status(400).json({ error: 'لا يمكن تعطيل آخر مسؤول نظام نشط' });
        }
      }

      var newStatus = user.status === 'active' ? 'inactive' : 'active';
      db.prepare("UPDATE users SET status = ? WHERE id = ?").run(newStatus, req.params.id);

      res.json({ message: newStatus === 'active' ? 'تم تفعيل المستخدم' : 'تم تعطيل المستخدم', status: newStatus });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
