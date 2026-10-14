const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'newtechmed.db');

async function runMigration() {
  console.log('Starting safe database migration for Multi-Store...');
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuffer);

  function exec(sql) {
    db.run(sql);
  }

  // 1. Stores Table
  exec(`
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
    );
  `);

  // 2. Extend Users Table
  try { exec("ALTER TABLE users ADD COLUMN store_id INTEGER;"); } catch(e) {}

  // 3. Store Inventory Table
  exec(`
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
    );
  `);

  // 4. Inventory Transactions Ledger
  exec(`
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
    );
  `);

  // 5. Stock Transfers
  exec(`
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
    );
  `);

  exec(`
    CREATE TABLE IF NOT EXISTS transfer_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transfer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity_sent INTEGER NOT NULL,
      quantity_received INTEGER DEFAULT 0,
      quantity_damaged INTEGER DEFAULT 0,
      notes TEXT
    );
  `);

  // 6. Invoices & Invoice Items
  exec(`
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
    );
  `);

  exec(`
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
    );
  `);

  // 7. Sales Returns
  exec(`
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
    );
  `);

  exec(`
    CREATE TABLE IF NOT EXISTS sales_return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      refund_price REAL NOT NULL
    );
  `);

  // 8. Purchases & Purchase Items
  exec(`
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
    );
  `);

  exec(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_cost REAL NOT NULL,
      total_cost REAL NOT NULL
    );
  `);

  // 9. Expenses Table
  exec(`
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
    );
  `);

  // 10. Customer Payments Table (Debt collection)
  exec(`
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
    );
  `);

  // 11. Stock Adjustments Table
  exec(`
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
    );
  `);

  // 12. Add store_id to existing orders table if missing
  try { exec("ALTER TABLE orders ADD COLUMN store_id INTEGER DEFAULT 1;"); } catch(e) {}
  try { exec("ALTER TABLE orders ADD COLUMN invoice_number TEXT;"); } catch(e) {}

  // -------------------------------------------------------------
  // Seed Stores (Shop 1 and Shop 2)
  // -------------------------------------------------------------
  const existingStoresRes = db.exec("SELECT COUNT(*) FROM stores");
  const storeCount = existingStoresRes[0].values[0][0];

  if (storeCount === 0) {
    console.log('Seeding initial stores: Shop 1 and Shop 2...');
    db.run(
      "INSERT INTO stores (id, name, code, address, phone, email, tax_number, invoice_prefix, invoice_footer, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [1, 'المحل الأول - المركز الرئيسي (صنعاء)', 'S1', 'صنعاء - شارع الزبيري بجوار المستشفى الجمهوري', '+967 772 000 577', 'sanaa@newtechmed.com', 'TX-77201', 'INV-S1', 'شكراً لتعاملكم مع فرع صنعاء الرئيسي - البضاعة المباعة ترد أو تستبدل خلال 3 أيام', 'active']
    );
    db.run(
      "INSERT INTO stores (id, name, code, address, phone, email, tax_number, invoice_prefix, invoice_footer, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [2, 'المحل الثاني - فرع عدن', 'S2', 'عدن - المعلا الشارع الرئيسي', '+967 773 456 789', 'aden@newtechmed.com', 'TX-77202', 'INV-S2', 'شكراً لتعاملكم مع فرع عدن - يسعدنا دائماً خدمتكم', 'active']
    );
  }

  // -------------------------------------------------------------
  // Seed Store Inventory for both stores
  // -------------------------------------------------------------
  const productsRes = db.exec("SELECT id, name, price, stock FROM products");
  if (productsRes.length > 0) {
    const products = productsRes[0].values;
    const invCountRes = db.exec("SELECT COUNT(*) FROM store_inventory");
    const invCount = invCountRes[0].values[0][0];

    if (invCount === 0) {
      console.log('Populating initial store inventory for Shop 1 and Shop 2...');
      products.forEach(p => {
        const [prodId, prodName, price, originalStock] = p;
        const purchaseCost = price > 0 ? Math.round(price * 0.7) : 10000;
        const retail = price > 0 ? price : Math.round(purchaseCost * 1.35);
        const wholesale = Math.round(retail * 0.88);

        // Store 1 gets original stock
        const s1Stock = originalStock > 0 ? originalStock : 10;
        db.run(
          `INSERT INTO store_inventory (store_id, product_id, stock_quantity, min_stock_alert, purchase_price, wholesale_price, retail_price, batch_number, expiry_date, unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [1, prodId, s1Stock, 3, purchaseCost, wholesale, retail, `BATCH-S1-${prodId}01`, '2027-12-31', 'قطعة']
        );
        db.run(
          `INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, notes, user_name)
           VALUES (?, ?, 'opening', ?, ?, 'opening_balance', 'الرصيد الافتتاحي - فرع صنعاء', 'مدير النظام')`,
          [1, prodId, s1Stock, s1Stock]
        );

        // Store 2 gets independent initial stock
        const s2Stock = Math.max(3, Math.round(s1Stock * 0.6));
        db.run(
          `INSERT INTO store_inventory (store_id, product_id, stock_quantity, min_stock_alert, purchase_price, wholesale_price, retail_price, batch_number, expiry_date, unit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [2, prodId, s2Stock, 2, purchaseCost, wholesale, retail, `BATCH-S2-${prodId}02`, '2028-06-30', 'قطعة']
        );
        db.run(
          `INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, notes, user_name)
           VALUES (?, ?, 'opening', ?, ?, 'opening_balance', 'الرصيد الافتتاحي - فرع عدن', 'مدير النظام')`,
          [2, prodId, s2Stock, s2Stock]
        );
      });
    }
  }

  // -------------------------------------------------------------
  // Seed Multi-Store Users
  // -------------------------------------------------------------
  const salt = bcrypt.genSaltSync(10);
  const hash = pw => bcrypt.hashSync(pw, salt);

  const newUsers = [
    { name: 'مدير فرع صنعاء', email: 'manager1@newtechmed.com', pw: 'manager123', role: 'store_manager', store_id: 1 },
    { name: 'مدير فرع عدن', email: 'manager2@newtechmed.com', pw: 'manager123', role: 'store_manager', store_id: 2 },
    { name: 'كاشير صنعاء', email: 'cashier1@newtechmed.com', pw: 'cashier123', role: 'cashier', store_id: 1 },
    { name: 'كاشير عدن', email: 'cashier2@newtechmed.com', pw: 'cashier123', role: 'cashier', store_id: 2 },
    { name: 'مسؤول المخزون العام', email: 'inventory@newtechmed.com', pw: 'stock123', role: 'inventory', store_id: null },
    { name: 'المحاسب المالي', email: 'accountant@newtechmed.com', pw: 'acc123', role: 'accountant', store_id: null }
  ];

  newUsers.forEach(u => {
    const existing = db.exec(`SELECT id FROM users WHERE email = '${u.email}'`);
    if (existing.length === 0 || existing[0].values.length === 0) {
      db.run(
        "INSERT INTO users (name, email, password, role, status, store_id) VALUES (?, ?, ?, ?, 'active', ?)",
        [u.name, u.email, hash(u.pw), u.role, u.store_id]
      );
    }
  });

  // Ensure admin user has store_id = null (all stores access)
  db.run("UPDATE users SET store_id = NULL WHERE role = 'admin'");

  // -------------------------------------------------------------
  // Seed sample real Invoices & Expenses for both stores
  // -------------------------------------------------------------
  const invCountRes = db.exec("SELECT COUNT(*) FROM invoices");
  if (invCountRes[0].values[0][0] === 0) {
    console.log('Seeding initial invoices and expenses for realistic reports...');

    // Invoice 1 - Store 1 (Cash)
    db.run(
      `INSERT INTO invoices (invoice_number, store_id, customer_id, customer_name, customer_phone, payment_type, payment_status, subtotal, discount, tax, total_amount, paid_amount, remaining_amount, total_cost, status, notes, created_by_name)
       VALUES (?, 1, 1, 'أحمد محمد علي', '0771234567', 'cash', 'paid', 250000, 10000, 0, 240000, 240000, 0, 160000, 'completed', 'فاتورة مبيعات نقدية - فرع صنعاء', 'مدير فرع صنعاء')`,
      ['INV-S1-2026-0001']
    );
    db.run(
      `INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, unit_cost, total_price)
       VALUES (1, 1, 'Hipro A1 Pro', 1, 250000, 160000, 250000)`
    );

    // Invoice 2 - Store 2 (Cash)
    db.run(
      `INSERT INTO invoices (invoice_number, store_id, customer_id, customer_name, customer_phone, payment_type, payment_status, subtotal, discount, tax, total_amount, paid_amount, remaining_amount, total_cost, status, notes, created_by_name)
       VALUES (?, 2, 2, 'سالم عبدالله', '0773456789', 'cash', 'paid', 180000, 0, 0, 180000, 180000, 0, 120000, 'completed', 'فاتورة مبيعات نقدية - فرع عدن', 'مدير فرع عدن')`,
      ['INV-S2-2026-0001']
    );
    db.run(
      `INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, unit_cost, total_price)
       VALUES (2, 2, 'Hipro Hurricane', 2, 90000, 60000, 180000)`
    );

    // Invoice 3 - Store 1 (Credit - آجل)
    db.run(
      `INSERT INTO invoices (invoice_number, store_id, customer_id, customer_name, customer_phone, payment_type, payment_status, subtotal, discount, tax, total_amount, paid_amount, remaining_amount, total_cost, status, notes, created_by_name)
       VALUES (?, 1, 3, 'فاطمة أحمد', '0775678901', 'credit', 'partial', 320000, 20000, 0, 300000, 100000, 200000, 210000, 'completed', 'فاتورة بيع آجل - مستشفى السلام', 'مدير فرع صنعاء')`,
      ['INV-S1-2026-0002']
    );
    db.run(
      `INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, unit_cost, total_price)
       VALUES (3, 4, 'PT1000', 1, 320000, 210000, 320000)`
    );

    // Initial expenses
    db.run("INSERT INTO expenses (store_id, category, amount, description, date, created_by_name) VALUES (1, 'إيجار', 50000, 'إيجار مقر فرع صنعاء لشهر أكتوبر', '2026-10-01', 'المحاسب المالي')");
    db.run("INSERT INTO expenses (store_id, category, amount, description, date, created_by_name) VALUES (1, 'كهرباء وإنترنت', 15000, 'فاتورة الكهرباء والإنترنت', '2026-10-05', 'المحاسب المالي')");
    db.run("INSERT INTO expenses (store_id, category, amount, description, date, created_by_name) VALUES (2, 'إيجار', 40000, 'إيجار مقر فرع عدن لشهر أكتوبر', '2026-10-01', 'المحاسب المالي')");
    db.run("INSERT INTO expenses (store_id, category, amount, description, date, created_by_name) VALUES (2, 'شحن ونقل', 12000, 'مصاريف نقل وتوصيل بضاعة للمستودع', '2026-10-06', 'المحاسب المالي')");
  }

  // Save changes to disk
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log('Multi-Store database migration completed successfully and persisted to:', DB_PATH);
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
