var express = require('express');
var bcrypt = require('bcryptjs');
var jwt = require('jsonwebtoken');
var { authenticateToken, JWT_SECRET, JWT_EXPIRES } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  router.post('/login', async function (req, res) {
    try {
      var { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      var user = await db.prepare('SELECT * FROM users WHERE email = ? OR name = ?').get(username, username);

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      var validPassword = bcrypt.compareSync(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      var store = user.store_id ? await db.prepare('SELECT id, name, code FROM stores WHERE id = ?').get(user.store_id) : null;

      var permissions = {
        all_stores: user.role === 'admin' || !user.store_id,
        manage_stores: user.role === 'admin',
        products: ['admin', 'store_manager', 'inventory', 'editor'].includes(user.role) ? ['read', 'write', 'delete'] : ['read'],
        inventory: ['admin', 'store_manager', 'inventory'].includes(user.role) ? ['read', 'write'] : ['read'],
        transfers: ['admin', 'store_manager', 'inventory'].includes(user.role) ? ['read', 'write', 'approve'] : ['read'],
        orders: ['admin', 'store_manager', 'cashier'].includes(user.role) ? ['read', 'write', 'delete'] : ['read'],
        invoices: ['admin', 'store_manager', 'cashier', 'accountant'].includes(user.role) ? ['read', 'write'] : ['read'],
        purchases: ['admin', 'accountant', 'store_manager'].includes(user.role) ? ['read', 'write'] : ['read'],
        expenses: ['admin', 'accountant', 'store_manager'].includes(user.role) ? ['read', 'write'] : ['read'],
        customers: ['admin', 'store_manager', 'cashier'].includes(user.role) ? ['read', 'write'] : ['read'],
        partners: ['admin', 'store_manager'].includes(user.role) ? ['read', 'write'] : ['read'],
        quotes: ['admin', 'store_manager', 'editor'].includes(user.role) ? ['read', 'write'] : ['read'],
        users: user.role === 'admin' ? ['read', 'write', 'delete'] : [],
        settings: user.role === 'admin' ? ['read', 'write'] : [],
        reports: ['admin', 'store_manager', 'accountant'].includes(user.role) ? ['read'] : [],
        profile: ['read', 'write']
      };

      var token = jwt.sign(
        { id: user.id, name: user.name, email: user.email, role: user.role, store_id: user.store_id },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES }
      );

      await db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)').run(
        user.id, user.name, 'login', 'user', user.id
      );

      await db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

      res.json({
        token: token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          store_id: user.store_id || null,
          store_name: store ? store.name : 'جميع المحلات (إدارة عامة)',
          store_code: store ? store.code : 'ALL',
          status: user.status,
          created_at: user.created_at,
          permissions: permissions
        }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/profile', authenticateToken, async function (req, res) {
    try {
      var authHeader = req.headers['authorization'];
      var token = authHeader && authHeader.split(' ')[1];
      var decoded = jwt.verify(token, JWT_SECRET);

      var { name, email } = req.body;
      if (!name || !email) return res.status(400).json({ error: 'الاسم والبريد الإلكتروني مطلوبان' });

      var existing = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, decoded.id);
      if (existing) return res.status(400).json({ error: 'البريد الإلكتروني مستخدم من قبل' });

      await db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(name, email, decoded.id);
      var user = await db.prepare('SELECT id, name, email, role, status, created_at, last_login FROM users WHERE id = ?').get(decoded.id);

      await db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)').run(
        decoded.id, name, 'update', 'profile', decoded.id
      );

      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/profile/password', authenticateToken, async function (req, res) {
    try {
      var authHeader = req.headers['authorization'];
      var token = authHeader && authHeader.split(' ')[1];
      var decoded = jwt.verify(token, JWT_SECRET);

      var { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'كلمة المرور الحالية والجديدة مطلوبتان' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });
      }

      var user = await db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
      if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

      var valid = bcrypt.compareSync(currentPassword, user.password);
      if (!valid) return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });

      var salt = bcrypt.genSaltSync(10);
      var hashed = bcrypt.hashSync(newPassword, salt);
      await db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, decoded.id);

      await db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)').run(
        decoded.id, user.name, 'update', 'password', decoded.id
      );

      res.json({ message: 'Password updated successfully' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/profile/avatar', authenticateToken, async function (req, res) {
    try {
      var authHeader = req.headers['authorization'];
      var token = authHeader && authHeader.split(' ')[1];
      var decoded = jwt.verify(token, JWT_SECRET);

      var { avatar } = req.body;
      await db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(avatar || '', decoded.id);
      res.json({ message: 'Avatar updated' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/me', async function (req, res) {
    var authHeader = req.headers['authorization'];
    var token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
      var decoded = jwt.verify(token, JWT_SECRET);
      var user = await db.prepare('SELECT id, name, email, role, status, created_at, last_login, store_id FROM users WHERE id = ?').get(decoded.id);
      if (!user) return res.status(401).json({ error: 'User not found' });

      var store = user.store_id ? await db.prepare('SELECT id, name, code FROM stores WHERE id = ?').get(user.store_id) : null;

      var permissions = {
        all_stores: user.role === 'admin' || !user.store_id,
        manage_stores: user.role === 'admin',
        products: ['admin', 'store_manager', 'inventory', 'editor'].includes(user.role) ? ['read', 'write', 'delete'] : ['read'],
        inventory: ['admin', 'store_manager', 'inventory'].includes(user.role) ? ['read', 'write'] : ['read'],
        transfers: ['admin', 'store_manager', 'inventory'].includes(user.role) ? ['read', 'write', 'approve'] : ['read'],
        orders: ['admin', 'store_manager', 'cashier'].includes(user.role) ? ['read', 'write', 'delete'] : ['read'],
        invoices: ['admin', 'store_manager', 'cashier', 'accountant'].includes(user.role) ? ['read', 'write'] : ['read'],
        purchases: ['admin', 'accountant', 'store_manager'].includes(user.role) ? ['read', 'write'] : ['read'],
        expenses: ['admin', 'accountant', 'store_manager'].includes(user.role) ? ['read', 'write'] : ['read'],
        customers: ['admin', 'store_manager', 'cashier'].includes(user.role) ? ['read', 'write'] : ['read'],
        partners: ['admin', 'store_manager'].includes(user.role) ? ['read', 'write'] : ['read'],
        quotes: ['admin', 'store_manager', 'editor'].includes(user.role) ? ['read', 'write'] : ['read'],
        users: user.role === 'admin' ? ['read', 'write', 'delete'] : [],
        settings: user.role === 'admin' ? ['read', 'write'] : [],
        reports: ['admin', 'store_manager', 'accountant'].includes(user.role) ? ['read'] : [],
        profile: ['read', 'write']
      };

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          store_id: user.store_id || null,
          store_name: store ? store.name : 'جميع المحلات (إدارة عامة)',
          store_code: store ? store.code : 'ALL',
          status: user.status,
          created_at: user.created_at,
          permissions: permissions
        }
      });
    } catch (err) {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  return router;
};
