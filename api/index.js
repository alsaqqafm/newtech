var express = require('express');
var cors = require('cors');
var { getDatabase } = require('../database/schema');

var app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Normalize URL path if Vercel strips /api prefix
app.use(function (req, res, next) {
  if (req.url && !req.url.startsWith('/api') && req.url !== '/') {
    req.url = '/api' + req.url;
  }
  next();
});

var initPromise = null;
var initialized = false;

async function setup() {
  if (initialized) return;
  var db = await getDatabase();

  app.use('/api', require('../routes/auth')(db));
  app.use('/api/products', require('../routes/products')(db));
  app.use('/api/orders', require('../routes/orders')(db));
  app.use('/api/customers', require('../routes/customers')(db));
  app.use('/api/partners', require('../routes/partners')(db));
  app.use('/api/quotes', require('../routes/quotes')(db));
  app.use('/api/users', require('../routes/users')(db));
  app.use('/api/stores', require('../routes/stores')(db));
  app.use('/api/inventory', require('../routes/inventory')(db));
  app.use('/api/transfers', require('../routes/transfers')(db));
  app.use('/api/invoices', require('../routes/invoices')(db));
  app.use('/api/finances', require('../routes/finances')(db));
  app.use('/api/reports', require('../routes/reports')(db));

  app.get('/api/all', function (req, res) {
    try {
      var storeId = req.query.store_id;
      var data = {
        stores: db.prepare('SELECT * FROM stores ORDER BY id ASC').all(),
        products: db.prepare('SELECT * FROM products ORDER BY id DESC').all(),
        orders: storeId
          ? db.prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY id DESC').all(storeId)
          : db.prepare('SELECT * FROM orders ORDER BY id DESC').all(),
        customers: db.prepare('SELECT * FROM customers ORDER BY id DESC').all(),
        partners: db.prepare('SELECT * FROM partners ORDER BY id DESC').all(),
        quotes: db.prepare('SELECT * FROM quotes ORDER BY id DESC').all(),
        users: db.prepare('SELECT id, name, email, role, status, store_id, created_at, last_login FROM users ORDER BY id DESC').all()
      };
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/stats', function (req, res) {
    try {
      var storeId = req.query.store_id;
      var stats = {
        totalProducts: db.prepare('SELECT COUNT(*) as count FROM products').get().count,
        totalOrders: storeId
          ? db.prepare('SELECT COUNT(*) as count FROM orders WHERE store_id = ?').get(storeId).count
          : db.prepare('SELECT COUNT(*) as count FROM orders').get().count,
        totalCustomers: db.prepare('SELECT COUNT(*) as count FROM customers').get().count,
        totalQuotes: db.prepare('SELECT COUNT(*) as count FROM quotes').get().count,
        totalPartners: db.prepare('SELECT COUNT(*) as count FROM partners').get().count,
        totalStores: db.prepare('SELECT COUNT(*) as count FROM stores').get().count,
        pendingOrders: storeId
          ? db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'قيد الانتظار' AND store_id = ?").get(storeId).count
          : db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'قيد الانتظار'").get().count,
        pendingQuotes: db.prepare("SELECT COUNT(*) as count FROM quotes WHERE status = 'قيد الانتظار'").get().count
      };
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/logs', function (req, res) {
    try {
      var logs = db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 100').all();
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  initialized = true;
}

module.exports = async function (req, res) {
  try {
    if (!initPromise) {
      initPromise = setup();
    }
    await initPromise;
    return app(req, res);
  } catch (err) {
    console.error('API Error in Vercel Serverless Function:', err);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: err.message
    });
  }
};
