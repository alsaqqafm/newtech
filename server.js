var express = require('express');
var cors = require('cors');
var path = require('path');
var fs = require('fs');
var rateLimit = require('express-rate-limit');
var { getDatabase } = require('./database/schema');

var app = express();
var PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Anti-Cache headers for API and Graceful Shutdown Request Tracking
var isShuttingDown = false;
var activeRequests = 0;

app.use('/api', function (req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  if (isShuttingDown && (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE' || req.method === 'PATCH')) {
    res.set('Connection', 'close');
    return res.status(503).json({ error: 'الخادم قيد إعادة التشغيل الآمن، يرجى المحاولة بعد لحظات.' });
  }
  activeRequests++;
  res.on('finish', function () { activeRequests--; });
  next();
});

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

getDatabase().then(async function (db) {
  console.log('Database connected and initialized.');

  // Idempotent Phase B Product Management Migration
  try {
    var { applyPhaseBMigration } = require('./database/migration_phase_b');
    await applyPhaseBMigration(db);
    console.log('[Migration] Phase B product management schema active.');
  } catch (mErr) {
    console.warn('[Migration] Note:', mErr.message);
  }

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

  app.get('/api/all', async function (req, res) {
    try {
      var storeId = req.query.store_id;
      var data = {
        stores: await db.prepare('SELECT * FROM stores ORDER BY id ASC').all(),
        products: await db.prepare('SELECT * FROM products ORDER BY id DESC').all(),
        orders: storeId
          ? await db.prepare("SELECT *, customer_name as customer, created_at as date FROM orders WHERE store_id = ? ORDER BY id DESC").all(storeId)
          : await db.prepare("SELECT *, customer_name as customer, created_at as date FROM orders ORDER BY id DESC").all(),
        customers: await db.prepare("SELECT *, orders_count as orders FROM customers ORDER BY id DESC").all(),
        partners: await db.prepare('SELECT * FROM partners ORDER BY id DESC').all(),
        quotes: await db.prepare("SELECT *, created_at as date FROM quotes ORDER BY id DESC").all(),
        users: await db.prepare('SELECT id, name, email, role, status, store_id, created_at, last_login FROM users ORDER BY id DESC').all()
      };
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/stats', async function (req, res) {
    try {
      var storeId = req.query.store_id;
      var ordersWhere = storeId ? ' WHERE store_id = ' + parseInt(storeId) : '';

      var totalSales = 0;
      if (storeId) {
        var invSales = await db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE store_id = ? AND status != 'cancelled'").get(storeId);
        totalSales = invSales ? invSales.total : 0;
      } else {
        var invSales = await db.prepare("SELECT COALESCE(SUM(total_amount), 0) as total FROM invoices WHERE status != 'cancelled'").get();
        totalSales = invSales ? invSales.total : 0;
      }

      var storeCount = await db.prepare('SELECT COUNT(*) as count FROM stores').get();
      var prodCount = await db.prepare('SELECT COUNT(*) as count FROM products').get();
      var availProd = await db.prepare("SELECT COUNT(*) as count FROM products WHERE status = 'متوفر'").get();
      var totalOrd = await db.prepare('SELECT COUNT(*) as count FROM orders' + ordersWhere).get();
      var compOrd = await db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'" + (storeId ? ' AND store_id = ' + parseInt(storeId) : '')).get();
      var procOrd = await db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'processing'" + (storeId ? ' AND store_id = ' + parseInt(storeId) : '')).get();
      var pendOrd = await db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pending'" + (storeId ? ' AND store_id = ' + parseInt(storeId) : '')).get();
      var cancOrd = await db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'cancelled'" + (storeId ? ' AND store_id = ' + parseInt(storeId) : '')).get();
      var custCount = await db.prepare('SELECT COUNT(*) as count FROM customers').get();
      var actCust = await db.prepare("SELECT COUNT(*) as count FROM customers WHERE status = 'active'").get();
      var quoteCount = await db.prepare('SELECT COUNT(*) as count FROM quotes').get();
      var newQuote = await db.prepare("SELECT COUNT(*) as count FROM quotes WHERE status = 'new'").get();
      var repQuote = await db.prepare("SELECT COUNT(*) as count FROM quotes WHERE status = 'replied'").get();
      var partCount = await db.prepare('SELECT COUNT(*) as count FROM partners').get();

      var stats = {
        totalStores: storeCount ? storeCount.count : 0,
        totalProducts: prodCount ? prodCount.count : 0,
        availableProducts: availProd ? availProd.count : 0,
        totalOrders: totalOrd ? totalOrd.count : 0,
        completedOrders: compOrd ? compOrd.count : 0,
        processingOrders: procOrd ? procOrd.count : 0,
        pendingOrders: pendOrd ? pendOrd.count : 0,
        cancelledOrders: cancOrd ? cancOrd.count : 0,
        totalCustomers: custCount ? custCount.count : 0,
        activeCustomers: actCust ? actCust.count : 0,
        totalQuotes: quoteCount ? quoteCount.count : 0,
        newQuotes: newQuote ? newQuote.count : 0,
        repliedQuotes: repQuote ? repQuote.count : 0,
        totalPartners: partCount ? partCount.count : 0,
        totalSales: totalSales
      };
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/activity', async function (req, res) {
    try {
      var logs = await db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT 50').all();
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

  // On-demand verified backup endpoint (Admin only)
  var { authenticateToken, requireRole } = require('./middleware/auth');
  app.post('/api/backups/run', authenticateToken, requireRole('admin'), async function (req, res) {
    try {
      if (process.env.TURSO_DATABASE_URL) {
        var { runBackup } = require('./scripts/backup_turso');
        var bRes = await runBackup();
        return res.json({ message: 'تم إنشاء النسخة الاحتياطية بنجاح على سحابة Turso', filename: path.basename(bRes.file), sha256: bRes.sha256 });
      }

      var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      if (typeof db.save === 'function') db.save();
      var backupDir = path.join(__dirname, 'database', 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      var backupFile = path.join(backupDir, 'newtechmed_backup_' + timestamp + '.db');
      var crypto = require('crypto');
      var fileBuf = fs.readFileSync(path.join(__dirname, 'database', 'newtechmed.db'));
      fs.writeFileSync(backupFile, fileBuf);
      var hash = crypto.createHash('sha256').update(fileBuf).digest('hex');
      res.json({ message: 'تم إنشاء النسخة الاحتياطية بنجاح', filename: path.basename(backupFile), sha256: hash });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  var server = app.listen(PORT, function () {
    console.log('=================================');
    console.log('  New Tech Medical Server');
    console.log('  Running on http://localhost:' + PORT);
    console.log('  Database: ' + (process.env.TURSO_DATABASE_URL ? 'Turso Cloud' : 'SQLite Local'));
    console.log('=================================');
  });

  function gracefulShutdown(signal) {
    console.log(`[Shutdown] Received ${signal}. Draining active requests...`);
    isShuttingDown = true;
    server.close(function () {
      console.log('[Shutdown] Closed server to new connections.');
    });
    var drainTimer = setInterval(function () {
      if (activeRequests <= 0) {
        clearInterval(drainTimer);
        try {
          if (typeof db.save === 'function') db.save();
          console.log('[Shutdown] Database flushed atomically. Exiting cleanly.');
        } catch (e) {}
        process.exit(0);
      }
    }, 200);
    setTimeout(function () {
      console.warn('[Shutdown] Timeout forced exit.');
      process.exit(0);
    }, 10000);
  }

  process.on('SIGTERM', function () { gracefulShutdown('SIGTERM'); });
  process.on('SIGINT', function () { gracefulShutdown('SIGINT'); });

}).catch(function (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
