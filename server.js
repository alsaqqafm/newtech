var express = require('express');
var cors = require('cors');
var path = require('path');
var rateLimit = require('express-rate-limit');
var { getDatabase } = require('./database/schema');

var app = express();
var PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

var apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api', apiLimiter);

app.use('/css', express.static(path.join(__dirname, 'css')));
app.use('/js', express.static(path.join(__dirname, 'js')));
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use('/pages', express.static(path.join(__dirname, 'pages')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use(express.static(path.join(__dirname)));

getDatabase().then(function (db) {
  console.log('Database connected and seeded.');

  var authRoutes = require('./routes/auth')(db);
  var productsRoutes = require('./routes/products')(db);
  var ordersRoutes = require('./routes/orders')(db);
  var customersRoutes = require('./routes/customers')(db);
  var partnersRoutes = require('./routes/partners')(db);
  var quotesRoutes = require('./routes/quotes')(db);
  var usersRoutes = require('./routes/users')(db);
  var storesRoutes = require('./routes/stores')(db);
  var inventoryRoutes = require('./routes/inventory')(db);
  var transfersRoutes = require('./routes/transfers')(db);
  var invoicesRoutes = require('./routes/invoices')(db);
  var financesRoutes = require('./routes/finances')(db);
  var reportsRoutes = require('./routes/reports')(db);

  app.use('/api', authRoutes);
  app.use('/api/products', productsRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/customers', customersRoutes);
  app.use('/api/partners', partnersRoutes);
  app.use('/api/quotes', quotesRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/stores', storesRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/transfers', transfersRoutes);
  app.use('/api/invoices', invoicesRoutes);
  app.use('/api/finances', financesRoutes);
  app.use('/api/reports', reportsRoutes);

  app.get('/api/all', function (req, res) {
    try {
      var storeId = req.query.store_id;
      var data = {
        stores: db.prepare('SELECT * FROM stores ORDER BY id ASC').all(),
        products: db.prepare('SELECT * FROM products ORDER BY id DESC').all(),
        orders: storeId
          ? db.prepare("SELECT *, customer_name as customer, created_at as date FROM orders WHERE store_id = ? ORDER BY id DESC").all(storeId)
          : db.prepare("SELECT *, customer_name as customer, created_at as date FROM orders ORDER BY id DESC").all(),
        customers: db.prepare("SELECT *, orders_count as orders FROM customers ORDER BY id DESC").all(),
        partners: db.prepare('SELECT * FROM partners ORDER BY id DESC').all(),
        quotes: db.prepare("SELECT *, created_at as date FROM quotes ORDER BY id DESC").all(),
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
      var ordersWhere = storeId ? ' WHERE store_id = ' + parseInt(storeId) : '';
      var invWhere = storeId ? ' WHERE store_id = ' + parseInt(storeId) : '';

      var totalSales = 0;
      if (storeId) {
        var invSales = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE store_id = ? AND status != 'cancelled'").get(storeId);
        totalSales = invSales ? invSales.total : 0;
      } else {
        var invSales = db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE status != 'cancelled'").get();
        totalSales = invSales ? invSales.total : 0;
      }

      var stats = {
        totalStores: db.prepare('SELECT COUNT(*) as count FROM stores').get().count,
        totalProducts: db.prepare('SELECT COUNT(*) as count FROM products').get().count,
        availableProducts: db.prepare("SELECT COUNT(*) as count FROM products WHERE status = 'متوفر'").get().count,
        totalOrders: db.prepare('SELECT COUNT(*) as count FROM orders' + ordersWhere).get().count,
        completedOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'" + (storeId ? ' AND store_id = ' + parseInt(storeId) : '')).get().count,
        processingOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'processing'" + (storeId ? ' AND store_id = ' + parseInt(storeId) : '')).get().count,
        pendingOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'" + (storeId ? ' AND store_id = ' + parseInt(storeId) : '')).get().count,
        cancelledOrders: db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'cancelled'" + (storeId ? ' AND store_id = ' + parseInt(storeId) : '')).get().count,
        totalCustomers: db.prepare('SELECT COUNT(*) as count FROM customers').get().count,
        activeCustomers: db.prepare("SELECT COUNT(*) as count FROM customers WHERE status = 'active'").get().count,
        totalQuotes: db.prepare('SELECT COUNT(*) as count FROM quotes').get().count,
        newQuotes: db.prepare("SELECT COUNT(*) as count FROM quotes WHERE status = 'new'").get().count,
        repliedQuotes: db.prepare("SELECT COUNT(*) as count FROM quotes WHERE status = 'replied'").get().count,
        totalPartners: db.prepare('SELECT COUNT(*) as count FROM partners').get().count,
        totalSales: totalSales
      };
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/activity', function (req, res) {
    try {
      var logs = db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT 50').all();
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('*', function (req, res) {
    if (req.path.includes('.') && !req.path.endsWith('.html')) {
      return res.status(404).send('Not found');
    }
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  app.listen(PORT, function () {
    console.log('=================================');
    console.log('  New Tech Medical Server');
    console.log('  Running on http://localhost:' + PORT);
    console.log('  Database: SQLite (newtechmed.db)');
    console.log('=================================');
  });

}).catch(function (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
