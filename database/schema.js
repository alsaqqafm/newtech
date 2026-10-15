var initSqlJs = require('sql.js');
var bcrypt = require('bcryptjs');
var fs = require('fs');
var path = require('path');

var DB_PATH = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.join(__dirname, 'newtechmed.db');

function createWrapper(SQL, fileData) {
  var db;
  if (fileData) {
    db = new SQL.Database(Buffer.from(fileData));
  } else {
    db = new SQL.Database();
  }

  function save() {
    var data = db.export();
    var buffer = Buffer.from(data);
    var dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    }
    fs.writeFileSync(DB_PATH, buffer);
  }

  function toObjects(result) {
    if (!result || result.length === 0) return [];
    var columns = result[0].columns;
    var values = result[0].values;
    return values.map(function (row) {
      var obj = {};
      columns.forEach(function (col, i) { obj[col] = row[i]; });
      return obj;
    });
  }

  function toObject(result) {
    var arr = toObjects(result);
    return arr.length > 0 ? arr[0] : null;
  }

  return {
    _raw: db,
    save: save,

    exec: function (sql) {
      db.run(sql);
    },

    prepare: function (sql) {
      return {
        run: function () {
          var args = Array.prototype.slice.call(arguments);
          db.run(sql, args);
          var lastIdResult = db.exec('SELECT last_insert_rowid() as id');
          var lastInsertRowid = lastIdResult.length > 0 ? lastIdResult[0].values[0][0] : 0;
          save();
          return { lastInsertRowid: lastInsertRowid };
        },
        get: function () {
          var args = Array.prototype.slice.call(arguments);
          var stmt = db.prepare(sql);
          stmt.bind(args);
          var result = null;
          if (stmt.step()) {
            result = stmt.getAsObject();
          }
          stmt.free();
          return result;
        },
        all: function () {
          var args = Array.prototype.slice.call(arguments);
          var stmt = db.prepare(sql);
          stmt.bind(args);
          var results = [];
          while (stmt.step()) {
            results.push(stmt.getAsObject());
          }
          stmt.free();
          return results;
        }
      };
    },

    pragma: function () {}
  };
}

function initDatabase(fileData) {
  return initSqlJs().then(function (SQL) {
    var db = createWrapper(SQL, fileData);

    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'editor',
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        model TEXT,
        category TEXT,
        description TEXT,
        image TEXT,
        agent TEXT,
        price REAL DEFAULT 0,
        stock INTEGER DEFAULT 0,
        status TEXT DEFAULT 'متوفر',
        features TEXT,
        keywords TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        customer_name TEXT NOT NULL,
        phone TEXT,
        products TEXT,
        amount REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        city TEXT,
        address TEXT,
        orders_count INTEGER DEFAULT 0,
        total REAL DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS partners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        country TEXT,
        specialty TEXT,
        description TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        notes TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add description column if missing (for existing databases)
    try { db.exec("ALTER TABLE partners ADD COLUMN description TEXT"); } catch(e) {}

    db.exec(`
      CREATE TABLE IF NOT EXISTS quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        product TEXT,
        message TEXT,
        status TEXT DEFAULT 'new',
        response TEXT,
        response_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add active column for toggle/deactivate support
    try { db.exec("ALTER TABLE products ADD COLUMN active INTEGER DEFAULT 1"); } catch(e) {}
    try { db.exec("ALTER TABLE orders ADD COLUMN active INTEGER DEFAULT 1"); } catch(e) {}
    try { db.exec("ALTER TABLE quotes ADD COLUMN active INTEGER DEFAULT 1"); } catch(e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN avatar TEXT"); } catch(e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN last_login DATETIME"); } catch(e) {}
    try { db.exec("ALTER TABLE users ADD COLUMN store_id INTEGER"); } catch(e) {}
    try { db.exec("ALTER TABLE orders ADD COLUMN store_id INTEGER DEFAULT 1"); } catch(e) {}
    try { db.exec("ALTER TABLE orders ADD COLUMN invoice_number TEXT"); } catch(e) {}

    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        user_name TEXT,
        action TEXT,
        entity_type TEXT,
        entity_id INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Multi-Store Tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        address TEXT,
        phone TEXT,
        email TEXT,
        tax_number TEXT,
        invoice_prefix TEXT DEFAULT 'INV-S',
        invoice_footer TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS store_inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        stock_quantity INTEGER DEFAULT 0,
        min_stock_alert INTEGER DEFAULT 5,
        purchase_price REAL DEFAULT 0,
        wholesale_price REAL DEFAULT 0,
        retail_price REAL DEFAULT 0,
        batch_number TEXT,
        expiry_date TEXT,
        unit TEXT DEFAULT 'قطعة',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(store_id, product_id)
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS inventory_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        change_type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        reference_type TEXT,
        reference_id INTEGER,
        user_id INTEGER,
        user_name TEXT,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transfer_number TEXT UNIQUE NOT NULL,
        from_store_id INTEGER NOT NULL,
        to_store_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        notes TEXT,
        created_by INTEGER,
        created_by_name TEXT,
        approved_by INTEGER,
        approved_by_name TEXT,
        received_by INTEGER,
        received_by_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        dispatched_at DATETIME,
        received_at DATETIME
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS transfer_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transfer_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        quantity_sent INTEGER NOT NULL,
        quantity_received INTEGER DEFAULT 0,
        quantity_damaged INTEGER DEFAULT 0,
        notes TEXT
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT UNIQUE NOT NULL,
        store_id INTEGER NOT NULL,
        customer_id INTEGER,
        customer_name TEXT NOT NULL,
        customer_phone TEXT,
        payment_type TEXT DEFAULT 'cash',
        payment_status TEXT DEFAULT 'paid',
        subtotal REAL DEFAULT 0,
        discount REAL DEFAULT 0,
        tax REAL DEFAULT 0,
        total_amount REAL DEFAULT 0,
        paid_amount REAL DEFAULT 0,
        remaining_amount REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        status TEXT DEFAULT 'completed',
        notes TEXT,
        created_by INTEGER,
        created_by_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        active INTEGER DEFAULT 1
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        unit_cost REAL DEFAULT 0,
        total_price REAL NOT NULL,
        returned_quantity INTEGER DEFAULT 0
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS sales_returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        return_number TEXT UNIQUE NOT NULL,
        invoice_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        customer_id INTEGER,
        refund_amount REAL NOT NULL,
        reason TEXT,
        created_by INTEGER,
        created_by_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS sales_return_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        return_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        refund_price REAL NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_number TEXT UNIQUE NOT NULL,
        store_id INTEGER NOT NULL,
        supplier_id INTEGER,
        supplier_name TEXT NOT NULL,
        total_amount REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'received',
        notes TEXT,
        created_by INTEGER,
        created_by_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_cost REAL NOT NULL,
        total_cost REAL NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        date TEXT NOT NULL,
        created_by INTEGER,
        created_by_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS customer_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        invoice_id INTEGER,
        amount REAL NOT NULL,
        payment_method TEXT DEFAULT 'cash',
        notes TEXT,
        created_by INTEGER,
        created_by_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        system_quantity INTEGER NOT NULL,
        actual_quantity INTEGER NOT NULL,
        difference INTEGER NOT NULL,
        reason TEXT NOT NULL,
        created_by INTEGER,
        created_by_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    return db;
  });
}

function seedDatabase(db) {
  var row = db.prepare('SELECT COUNT(*) as count FROM users').get();
  var userCount = row ? row.count : 0;
  if (userCount > 0) return;

  var salt = bcrypt.genSaltSync(10);

  db.prepare('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)').run('م. محمد السقاف', 'mohammed.f.saqqaf@gmail.com', bcrypt.hashSync('772522233', salt), 'admin', 'active');
  db.prepare('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)').run('علي محمد', 'ali@newtechmed.com', bcrypt.hashSync('manager123', salt), 'manager', 'active');
  db.prepare('INSERT INTO users (name, email, password, role, status) VALUES (?, ?, ?, ?, ?)').run('سارة علي', 'sara@newtechmed.com', bcrypt.hashSync('editor123', salt), 'editor', 'active');

  db.prepare('INSERT INTO products (name, model, category, description, image, agent, price, stock, status, features, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('Hipro A1 Pro', 'A1 Pro', 'تحاليل مناعية', 'نظام تحاليل مناعية أوتوماتيكي للمختبرات المتوسطة والعالية الإنتاجية. يدوم التحليل بدقة عالية وسرعة في الإجراءات، موفر وسهل الاستخدام مع واجهة مريحة. مناسب للمختبرات ذات الإنتاجية العالية.', '../images/hipro-a1-pro.png', 'Hipro Biotechnology', 0, 10, 'متوفر', 'نظام تحاليل مناعية أوتوماتيكي|دقة عالية|سرعة في الإجراءات|موفر وسهل الاستخدام|واجهة مريحة|مناسب للمختبرات العالية الإنتاجية', 'Automated Immunoassay, Hipro, High Throughput, A1 Pro');
  db.prepare('INSERT INTO products (name, model, category, description, image, agent, price, stock, status, features, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('Hipro Hurricane', 'Hurricane', 'POCT', 'جهاز POCT مدمج للفحوصات السريعة بجانب المريض. نتائج سريعة ودقيقة مناسب للمستشفيات والعيادات والطوارئ. يعطي نتائج فورية بجانب المريض.', '../images/hipro-hurricane.png', 'Hipro Biotechnology', 0, 15, 'متوفر', 'جهاز POCT مدمج|فحوصات سريعة بجانب المريض|نتائج فورية|دقة عالية|مناسب للمستشفيات والعيادات|الطوارئ', 'POCT, Rapid Test, Hipro, Hurricane');
  db.prepare('INSERT INTO products (name, model, category, description, image, agent, price, stock, status, features, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('Hipro A1', 'A1', 'تحاليل مناعية', 'جهاز اقتصادي للفحوصات المناعية الروتينية. دقة عالية في النتائج مع تكلفة منخفضة، مناسب للمختبرات المتوسطة والإنتاجية المحدودة.', '../images/hipro-a1.png', 'Hipro Biotechnology', 0, 8, 'متوفر', 'جهاز اقتصادي|فحوصات مناعية روتينية|دقة عالية|تكلفة منخفضة|مناسب للمختبرات المتوسطة', 'Immunoassay, Routine Diagnostics, Hipro A1');
  db.prepare('INSERT INTO products (name, model, category, description, image, agent, price, stock, status, features, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('PT1000', 'PT1000', 'غازات الدم', 'محلل غازات دم متكامل يعمل بنظام كارتريج شامل. نتائج دقيقة وسريعة، مناسب لغرف العناية المركزة والطوارئ. يعطي نتائج فورية بوقت قصير.', '../images/pt1000.jpeg', 'EasyDiagnosis', 0, 12, 'متوفر', 'محلل غازات دم متكامل|نظام كارتريج شامل|نتائج دقيقة وسريعة|مناسب للعناية المركزة والطوارئ|وقت قصير للتحليل', 'Blood Gas Analyzer, Cartridge, ICU, ER');
  db.prepare('INSERT INTO products (name, model, category, description, image, agent, price, stock, status, features, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('DX Electrolyte Analyzer', 'DX', 'الإلكتروليت', 'جهاز DX لتحليل الإلكتروليت يعتمد تقنية ISE الدقيقة. نتائج سريعة وموثوقة مع مراقبة المريض أثناء الفحص.', '../images/dx-electrolyte.jpeg', 'EasyDiagnosis', 0, 6, 'متوفر', 'تقنية ISE الدقيقة|تحليل الإلكتروليت|نتائج سريعة وموثوقة|مراقبة المريض|مناسب للمختبرات', 'Electrolyte Analyzer, ISE, Na, K, Cl, Ca2+, pH');
  db.prepare('INSERT INTO products (name, model, category, description, image, agent, price, stock, status, features, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('QFT9000 Pro II', 'QFT9000', 'تحاليل مناعية', 'جهاز مناعي فلوري متعدد الفحوصات FIA. سريع وموثوق للفحوصات العاجلة مع علامات التخثر والكبد والكلى.', '../images/qft9000.jpeg', 'EasyDiagnosis', 0, 9, 'متوفر', 'جهاز مناعي فلوري FIA|متعدد الفحوصات|سريع وموثوق|مناسب للفحوصات العاجلة|علامات التخثر والكبد والكلى', 'FIA, Immunoassay, Cardiac Markers, POCT');
  db.prepare('INSERT INTO products (name, model, category, description, image, agent, price, stock, status, features, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('Seamaty SG1', 'SG1', 'POCT', 'محلل متنقل يعمل بكارتريج أحادي الاستخدام لغازات الدم. نتائج دقيقة وسريعة في مكان واحد، مناسب للفحوصات الميدانية.', '../images/seamaty-sg1.jpeg', 'Seamaty Diagnostic', 0, 7, 'متوفر', 'محلل متنقل|كارتريج أحادي الاستخدام|نتائج دقيقة وسريعة|مناسب للفحوصات الميدانية|غازات الدم', 'Blood Gas POCT, Cartridge, Seamaty, SG1');
  db.prepare('INSERT INTO products (name, model, category, description, image, agent, price, stock, status, features, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('Thrombotimer', 'Thrombotimer', 'أجهزة التخثر', 'محلل تخثر شبه أوتوماتيكي يعتمد قياس بصري-ميكانيكي. يقيس PT و APTT مع نتائج دقيقة وموثوقة.', '../images/thrombotimer.jpeg', 'Behnk Elektronik', 0, 5, 'متوفر', 'محلل تخثر شبه أوتوماتيكي|قياس بصري-ميكانيكي|يقيس PT و APTT|نتائج دقيقة وموثوقة|سهولة الاستخدام', 'Coagulation Analyzer, PT, APTT, Thrombotimer');
  db.prepare('INSERT INTO products (name, model, category, description, image, agent, price, stock, status, features, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('Thrombostat', 'Thrombostat', 'أجهزة التخثر', 'جهاز حضانة/ترموستات لدعم اختبارات التخثر. يوفر بيئة حرارية ثابتة لاختبارات PT و APTT.', '../images/thrombostat.jpeg', 'Behnk Elektronik', 0, 4, 'متوفر', 'جهاز حضانة/ترموستات|بيئة حرارية ثابتة|يدعم اختبارات PT و APTT|موثوق ودقيق', 'Thrombostat, Coagulation, Behnk');
  db.prepare('INSERT INTO products (name, model, category, description, image, agent, price, stock, status, features, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('Behnk Reagents', 'Reagents', 'كواشف التخثر', 'محاليل التجلط (كواشف) عالية الجودة من Behnk Elektronik. مناسبة لجميع اختبارات التخثر.', '../images/behnk-reagents.jpeg', 'Behnk Elektronik', 0, 20, 'متوفر', 'كواشف التخثر عالية الجودة|محاليل تجلط موثوقة|مناسبة لاختبارات التخثر', 'Behnk Reagents, Coagulation, Reagents');

  db.prepare('INSERT INTO orders (customer_id, customer_name, phone, products, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(null, 'أحمد محمد علي', '0771234567', 'Hipro A1 Pro, PT1000', 0, 'processing', '2026-07-08');
  db.prepare('INSERT INTO orders (customer_id, customer_name, phone, products, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(null, 'سالم عبدالله', '0773456789', 'Seamaty SG1', 0, 'completed', '2026-07-07');
  db.prepare('INSERT INTO orders (customer_id, customer_name, phone, products, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(null, 'فاطمة أحمد', '0775678901', 'Thrombotimer', 0, 'pending', '2026-07-06');
  db.prepare('INSERT INTO orders (customer_id, customer_name, phone, products, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(null, 'عمر حسن', '0777890123', 'Hipro Hurricane', 0, 'completed', '2026-07-05');
  db.prepare('INSERT INTO orders (customer_id, customer_name, phone, products, amount, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(null, 'خالد سعيد', '0779012345', 'QFT9000 Pro II, Thrombostat', 0, 'cancelled', '2026-07-04');

  db.prepare('INSERT INTO customers (name, email, phone, city, address, orders_count, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('أحمد محمد علي', 'ahmed@email.com', '0771234567', 'صنعاء', '', 3, 0, 'active');
  db.prepare('INSERT INTO customers (name, email, phone, city, address, orders_count, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('سالم عبدالله', 'salem@email.com', '0773456789', 'عدن', '', 2, 0, 'active');
  db.prepare('INSERT INTO customers (name, email, phone, city, address, orders_count, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('فاطمة أحمد', 'fatima@email.com', '0775678901', 'تعز', '', 1, 0, 'active');
  db.prepare('INSERT INTO customers (name, email, phone, city, address, orders_count, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('عمر حسن', 'omar@email.com', '0777890123', 'الحديدة', '', 1, 0, 'inactive');
  db.prepare('INSERT INTO customers (name, email, phone, city, address, orders_count, total, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('خالد سعيد', 'khalid@email.com', '0779012345', 'المكلا', '', 2, 0, 'active');

  db.prepare('INSERT INTO partners (name, country, specialty, description, phone, email, address, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('Hipro Biotechnology', 'الصين', 'تحاليل مناعية وغازات الدم', 'شركة صينية رائدة في تصنيع أنظمة التحاليل المناعية (Immunoassay) وأجهزة POCT. توفر حلولاً متكاملة للمختبرات منخفضة ومتوسطة وعالية الإنتاجية.', '', '', '', 'أنظمة التحاليل المناعية وغازات الدم، אלקتروليت، POCT', 'active');
  db.prepare('INSERT INTO partners (name, country, specialty, description, phone, email, address, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('EasyDiagnosis', 'الصين', 'غازات الدم POCT', 'شركة صينية متخصصة في أنظمة غازات الدم (Blood Gas) والإلكتروليت (Electrolyte) بنظام POCT. توفر أجهزة تحليل سريعة ودقيقة بجانب المريض.', '', '', '', 'غازات الدم والإلكتروليت بنظام POCT الكرتريج', 'active');
  db.prepare('INSERT INTO partners (name, country, specialty, description, phone, email, address, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('Seamaty Diagnostic', 'الصين', 'أجهزة POCT محمولة', 'شركة صينية مبتكرة في مجال أجهزة التشخيص المحمولة POCT. توفر أجهزة تحليل غازات الدم والإلكتروليت المتنقلة التي تعمل بكارتريج أحادي الاستخدام.', '', '', '', 'أجهزة ومحللات الدم المحمولة POCT، أنظمة التشخيص السريع', 'active');
  db.prepare('INSERT INTO partners (name, country, specialty, description, phone, email, address, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('Behnk Elektronik', 'ألمانيا', 'أجهزة التخثر', 'شركة ألمانية عريقة متخصصة في أجهزة تحليل التخثر (Coagulation Analyzers). توفر حلولاً شبه أوتوماتيكية وكاملة مع الكواشف عالية الجودة.', '', '', '', 'أجهزة وكواف التخثر - شبه الأوتوماتيكية والترموستات', 'active');

  db.prepare('INSERT INTO quotes (name, email, phone, product, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('محمد علي', 'mohamed@email.com', '0771111111', 'Hipro A1 Pro', 'أريد سعر جهاز تحاليل مناعي لعيادتي', 'new', '2026-07-08T10:30:00');
  db.prepare('INSERT INTO quotes (name, email, phone, product, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('سارة أحمد', 'sara@email.com', '0772222222', 'PT1000', 'ما سعر محلل غازات الدم PT1000؟', 'replied', '2026-07-07T14:15:00');

  db.save();
  console.log('Database seeded successfully.');
}

function getDatabase() {
  var fileData = null;
  try {
    if (fs.existsSync(DB_PATH)) {
      fileData = fs.readFileSync(DB_PATH);
    }
  } catch (e) {
    fileData = null;
  }

  return initDatabase(fileData).then(function (db) {
    seedDatabase(db);
    console.log('Database loaded from: ' + DB_PATH);
    return db;
  });
}

module.exports = { getDatabase: getDatabase };
