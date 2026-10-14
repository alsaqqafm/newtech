var express = require('express');
var { authenticateToken, requireRole, requireStoreAccess } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  // -----------------------------------------------------------
  // Expenses (المصروفات)
  // -----------------------------------------------------------
  router.get('/expenses', authenticateToken, requireStoreAccess, function (req, res) {
    try {
      var storeId = req.query.store_id || req.user.store_id;
      var query = `
        SELECT e.*, s.name as store_name, s.code as store_code
        FROM expenses e
        JOIN stores s ON e.store_id = s.id
      `;
      var params = [];
      if (storeId && req.user.role !== 'admin') {
        query += ' WHERE e.store_id = ?';
        params.push(storeId);
      } else if (req.query.store_id) {
        query += ' WHERE e.store_id = ?';
        params.push(req.query.store_id);
      }
      query += ' ORDER BY e.date DESC, e.id DESC';

      var expenses = db.prepare(query).all.apply(null, params);
      res.json(expenses);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/expenses', authenticateToken, requireRole('admin', 'accountant', 'store_manager'), function (req, res) {
    try {
      var { store_id, category, amount, description, date } = req.body;
      var targetStoreId = store_id || req.user.store_id || 1;

      if (!category || !amount || !description) {
        return res.status(400).json({ error: 'التصنيف والمبلغ والوصف مطلوبة' });
      }

      if (req.user.store_id && String(req.user.store_id) !== String(targetStoreId) && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح بتسجيل مصروف لمحل آخر' });
      }

      var result = db.prepare(`
        INSERT INTO expenses (store_id, category, amount, description, date, created_by, created_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetStoreId, category, parseFloat(amount), description, date || new Date().toISOString().split('T')[0], req.user.id, req.user.name
      );

      var created = db.prepare('SELECT * FROM expenses WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // -----------------------------------------------------------
  // Purchases (المشتريات وتوريد البضاعة للمخزن)
  // -----------------------------------------------------------
  router.get('/purchases', authenticateToken, requireStoreAccess, function (req, res) {
    try {
      var storeId = req.query.store_id || req.user.store_id;
      var query = `
        SELECT pur.*, s.name as store_name, s.code as store_code
        FROM purchases pur
        JOIN stores s ON pur.store_id = s.id
      `;
      var params = [];
      if (storeId && req.user.role !== 'admin') {
        query += ' WHERE pur.store_id = ?';
        params.push(storeId);
      } else if (req.query.store_id) {
        query += ' WHERE pur.store_id = ?';
        params.push(req.query.store_id);
      }
      query += ' ORDER BY pur.id DESC';

      var purchases = db.prepare(query).all.apply(null, params);
      res.json(purchases);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/purchases', authenticateToken, requireRole('admin', 'accountant', 'store_manager'), function (req, res) {
    try {
      var { store_id, supplier_id, supplier_name, items, notes } = req.body;
      var targetStoreId = store_id || req.user.store_id || 1;

      if (!supplier_name || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'اسم المورد وقائمة الأصناف مطلوبة' });
      }

      var countRow = db.prepare('SELECT COUNT(*) as count FROM purchases WHERE store_id = ?').get(targetStoreId);
      var seq = (countRow ? countRow.count : 0) + 1;
      var purchaseNumber = `PUR-S${targetStoreId}-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

      var totalAmount = 0;
      items.forEach(function (itm) {
        totalAmount += itm.unit_cost * itm.quantity;
      });

      var result = db.prepare(`
        INSERT INTO purchases (purchase_number, store_id, supplier_id, supplier_name, total_amount, paid_amount, status, notes, created_by, created_by_name)
        VALUES (?, ?, ?, ?, ?, ?, 'received', ?, ?, ?)
      `).run(
        purchaseNumber, targetStoreId, supplier_id || null, supplier_name, totalAmount, totalAmount, notes || '', req.user.id, req.user.name
      );

      var purchaseId = result.lastInsertRowid;

      // Add stock to store_inventory and log transaction
      items.forEach(function (itm) {
        var prod = db.prepare('SELECT name, price FROM products WHERE id = ?').get(itm.product_id);
        var prodName = prod ? prod.name : 'منتج';

        db.prepare(`
          INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, unit_cost, total_cost)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(purchaseId, itm.product_id, prodName, itm.quantity, itm.unit_cost, itm.unit_cost * itm.quantity);

        // Update inventory stock and purchase price
        var inv = db.prepare('SELECT id, stock_quantity FROM store_inventory WHERE store_id = ? AND product_id = ?').get(targetStoreId, itm.product_id);
        var newQty;
        if (inv) {
          newQty = inv.stock_quantity + itm.quantity;
          db.prepare("UPDATE store_inventory SET stock_quantity = ?, purchase_price = ?, updated_at = datetime('now') WHERE id = ?").run(
            newQty, itm.unit_cost, inv.id
          );
        } else {
          newQty = itm.quantity;
          db.prepare(`
            INSERT INTO store_inventory (store_id, product_id, stock_quantity, min_stock_alert, purchase_price, retail_price)
            VALUES (?, ?, ?, 5, ?, ?)
          `).run(targetStoreId, itm.product_id, newQty, itm.unit_cost, prod ? prod.price : Math.round(itm.unit_cost * 1.3));
        }

        // Ledger entry
        db.prepare(`
          INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, reference_id, user_id, user_name, notes)
          VALUES (?, ?, 'purchase', ?, ?, 'purchase', ?, ?, ?, ?)
        `).run(
          targetStoreId, itm.product_id, itm.quantity, newQty, purchaseId, req.user.id, req.user.name,
          `فاتورة مشتريات رقم ${purchaseNumber} من المورد ${supplier_name}`
        );
      });

      res.status(201).json({
        message: 'تم تسجيل فاتورة الشراء وتوريد البضاعة للمخزن بنجاح',
        purchase_number: purchaseNumber,
        total_amount: totalAmount
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // -----------------------------------------------------------
  // Receivables / Customer Debts (المديونيات والتحصيل)
  // -----------------------------------------------------------
  router.get('/debts', authenticateToken, requireStoreAccess, function (req, res) {
    try {
      var storeId = req.query.store_id || req.user.store_id;
      var query = `
        SELECT 
          inv.id as invoice_id,
          inv.invoice_number,
          inv.store_id,
          s.name as store_name,
          inv.customer_id,
          inv.customer_name,
          inv.customer_phone,
          inv.total_amount,
          inv.paid_amount,
          inv.remaining_amount,
          inv.created_at as invoice_date
        FROM invoices inv
        JOIN stores s ON inv.store_id = s.id
        WHERE inv.remaining_amount > 0 AND inv.status != 'cancelled'
      `;
      var params = [];
      if (storeId && req.user.role !== 'admin') {
        query += ' AND inv.store_id = ?';
        params.push(storeId);
      } else if (req.query.store_id) {
        query += ' AND inv.store_id = ?';
        params.push(req.query.store_id);
      }
      query += ' ORDER BY inv.id DESC';

      var debts = db.prepare(query).all.apply(null, params);
      res.json(debts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Record customer debt payment (سداد مديونية)
  router.post('/pay-debt', authenticateToken, requireRole('admin', 'accountant', 'store_manager', 'cashier'), function (req, res) {
    try {
      var { invoice_id, amount, payment_method, notes } = req.body;
      if (!invoice_id || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'رقم الفاتورة ومبلغ السداد مطلوبان' });
      }

      var inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice_id);
      if (!inv) return res.status(404).json({ error: 'الفاتورة غير موجودة' });

      var payAmount = parseFloat(amount);
      if (payAmount > inv.remaining_amount) {
        return res.status(400).json({ error: `مبلغ السداد (${payAmount}) أكبر من المتبقي على الفاتورة (${inv.remaining_amount})` });
      }

      var newPaid = inv.paid_amount + payAmount;
      var newRemaining = Math.max(0, inv.remaining_amount - payAmount);
      var newStatus = newRemaining === 0 ? 'paid' : 'partial';

      db.prepare(`
        UPDATE invoices
        SET paid_amount = ?, remaining_amount = ?, payment_status = ?
        WHERE id = ?
      `).run(newPaid, newRemaining, newStatus, inv.id);

      db.prepare(`
        INSERT INTO customer_payments (customer_id, store_id, invoice_id, amount, payment_method, notes, created_by, created_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        inv.customer_id || 0, inv.store_id, inv.id, payAmount, payment_method || 'cash', notes || 'سداد دفعة من المديونية', req.user.id, req.user.name
      );

      res.json({
        message: 'تم تسجيل سداد الدفعة بنجاح',
        invoice_number: inv.invoice_number,
        paid_amount: payAmount,
        remaining_balance: newRemaining
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
