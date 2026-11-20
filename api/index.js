var express = require('express');
var cors = require('cors');
var path = require('path');
var { getDatabase } = require('../database/schema');

var app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Anti-Cache headers for sensitive API responses
app.use('/api', function (req, res, next) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Optional Reverse Proxy to dedicated Render backend if configured in Vercel environment
var backendUrl = process.env.BACKEND_API_URL || process.env.RENDER_API_URL;
if (backendUrl) {
  backendUrl = backendUrl.replace(/\/$/, '');
  app.use('/api', function (req, res) {
    var targetUrl = backendUrl + req.originalUrl;
    var parsedUrl = new URL(targetUrl);
    var isHttps = parsedUrl.protocol === 'https:';
    var client = isHttps ? require('https') : require('http');

    var headers = Object.assign({}, req.headers);
    delete headers.host;

    var proxyReq = client.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: req.method,
      headers: headers
    }, function (proxyRes) {
      res.status(proxyRes.statusCode);
      Object.keys(proxyRes.headers).forEach(function (h) {
        res.setHeader(h, proxyRes.headers[h]);
      });
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
      proxyRes.pipe(res);
    });

    proxyReq.on('error', function (err) {
      res.status(502).json({ error: 'Backend gateway connection failed', message: err.message });
    });

    if (req.body && Object.keys(req.body).length > 0) {
      var bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.write(bodyData);
    }
    proxyReq.end();
  });
}

app.use('/css', express.static(path.join(__dirname, '..', 'css')));
app.use('/js', express.static(path.join(__dirname, '..', 'js')));
app.use('/images', express.static(path.join(__dirname, '..', 'images')));
app.use('/pages', express.static(path.join(__dirname, '..', 'pages')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));

var initPromise = null;
var initialized = false;

async function setup() {
  if (initialized) return;
  var db = await getDatabase();

  try {
    var { applyPhaseBMigration } = require('../database/migration_phase_b');
    await applyPhaseBMigration(db);
  } catch (e) {}

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

  app.get('/api/all', async function (req, res) {
    try {
      var storeId = req.query.store_id;
      var data = {
        stores: await db.prepare('SELECT * FROM stores ORDER BY id ASC').all(),
        products: await db.prepare('SELECT * FROM products ORDER BY id DESC').all(),
        orders: storeId
          ? await db.prepare('SELECT * FROM orders WHERE store_id = ? ORDER BY id DESC').all(storeId)
          : await db.prepare('SELECT * FROM orders ORDER BY id DESC').all(),
        customers: await db.prepare('SELECT * FROM customers ORDER BY id DESC').all(),
        partners: await db.prepare('SELECT * FROM partners ORDER BY id DESC').all(),
        quotes: await db.prepare('SELECT * FROM quotes ORDER BY id DESC').all(),
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
      var prodCount = await db.prepare('SELECT COUNT(*) as count FROM products').get();
      var orderCount = storeId
        ? await db.prepare('SELECT COUNT(*) as count FROM orders WHERE store_id = ?').get(storeId)
        : await db.prepare('SELECT COUNT(*) as count FROM orders').get();
      var custCount = await db.prepare('SELECT COUNT(*) as count FROM customers').get();
      var quoteCount = await db.prepare('SELECT COUNT(*) as count FROM quotes').get();
      var partnerCount = await db.prepare('SELECT COUNT(*) as count FROM partners').get();
      var storeCount = await db.prepare('SELECT COUNT(*) as count FROM stores').get();
      var pendingOrder = storeId
        ? await db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'قيد الانتظار' AND store_id = ?").get(storeId)
        : await db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'قيد الانتظار'").get();
      var pendingQuote = await db.prepare("SELECT COUNT(*) as count FROM quotes WHERE status = 'قيد الانتظار'").get();

      var stats = {
        totalProducts: prodCount ? prodCount.count : 0,
        totalOrders: orderCount ? orderCount.count : 0,
        totalCustomers: custCount ? custCount.count : 0,
        totalQuotes: quoteCount ? quoteCount.count : 0,
        totalPartners: partnerCount ? partnerCount.count : 0,
        totalStores: storeCount ? storeCount.count : 0,
        pendingOrders: pendingOrder ? pendingOrder.count : 0,
        pendingQuotes: pendingQuote ? pendingQuote.count : 0
      };
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/logs', async function (req, res) {
    try {
      var logs = await db.prepare('SELECT * FROM activity_log ORDER BY id DESC LIMIT 100').all();
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
