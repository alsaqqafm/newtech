var express = require('express');
var { authenticateToken, requireRole, requireStoreAccess } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  // List invoices
  router.get('/', authenticateToken, requireStoreAccess, function (req, res) {
    try {
      var storeId = req.query.store_id || req.user.store_id;
      var paymentStatus = req.query.payment_status;
      var paymentType = req.query.payment_type;
      var status = req.query.status;

      var whereClauses = [];
      var params = [];

      if (storeId) {
        if (req.user.store_id && String(req.user.store_id) !== String(storeId) && req.user.role !== 'admin') {
          return res.status(403).json({ error: 'غير مصرح بالاطلاع على فواتير هذا المحل' });
        }
        whereClauses.push('inv.store_id = ?');
        params.push(storeId);
      } else if (req.user.store_id && req.user.role !== 'admin') {
        whereClauses.push('inv.store_id = ?');
        params.push(req.user.store_id);
      }

      if (paymentStatus) {
        whereClauses.push('inv.payment_status = ?');
        params.push(paymentStatus);
      }
      if (paymentType) {
        whereClauses.push('inv.payment_type = ?');
        params.push(paymentType);
      }
      if (status) {
        whereClauses.push('inv.status = ?');
        params.push(status);
      }

      var whereSql = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

      var invoices = db.prepare(`
        SELECT 
          inv.*,
          s.name as store_name,
          s.code as store_code,
          (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = inv.id) as items_count,
          (SELECT GROUP_CONCAT(product_name || ' (' || quantity || ')', '، ') FROM invoice_items WHERE invoice_id = inv.id) as products_summary
        FROM invoices inv
        JOIN stores s ON inv.store_id = s.id
        ${whereSql}
        ORDER BY inv.id DESC
      `).all.apply(null, params);

      res.json(invoices);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get single invoice for viewing and printing
  router.get('/:id', authenticateToken, function (req, res) {
    try {
      var invoice = db.prepare(`
        SELECT 
          inv.*,
          s.name as store_name,
          s.code as store_code,
          s.address as store_address,
          s.phone as store_phone,
          s.email as store_email,
          s.tax_number as store_tax_number,
          s.invoice_footer as store_invoice_footer
        FROM invoices inv
        JOIN stores s ON inv.store_id = s.id
        WHERE inv.id = ?
      `).get(req.params.id);

      if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' });

      // Check access
      if (req.user.store_id && req.user.role !== 'admin' && req.user.store_id !== invoice.store_id) {
        return res.status(403).json({ error: 'غير مصرح لك بالاطلاع على فاتورة محل آخر' });
      }

      var items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(req.params.id);
      invoice.items = items;

      res.json(invoice);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create new sale invoice (اعتماد عملية البيع وخصم المخزون الحقيقي)
  router.post('/', authenticateToken, requireRole('admin', 'store_manager', 'cashier'), function (req, res) {
    try {
      var {
        store_id, customer_id, customer_name, customer_phone,
        items, payment_type, discount, tax, paid_amount, notes
      } = req.body;

      var targetStoreId = store_id || req.user.store_id || 1;

      // Enforce store isolation
      if (req.user.store_id && String(req.user.store_id) !== String(targetStoreId) && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'لا يمكنك إصدار فاتورة لمحل آخر غير محلك' });
      }

      if (!customer_name && customer_id) {
        var cust = db.prepare('SELECT name, phone FROM customers WHERE id = ?').get(customer_id);
        if (cust) {
          customer_name = cust.name;
          if (!customer_phone) customer_phone = cust.phone;
        }
      }
      if (!customer_name) customer_name = 'عميل نقدي';

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'قائمة المنتجات والكميات مطلوبة' });
      }

      var store = db.prepare('SELECT * FROM stores WHERE id = ?').get(targetStoreId);
      if (!store) return res.status(404).json({ error: 'المحل المحدد غير موجود' });

      // 1. Validate stock availability in this specific store
      for (var i = 0; i < items.length; i++) {
        var itm = items[i];
        var inv = db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = ? AND product_id = ?').get(targetStoreId, itm.product_id);
        var avail = inv ? inv.stock_quantity : 0;
        if (avail < itm.quantity) {
          var prod = db.prepare('SELECT name FROM products WHERE id = ?').get(itm.product_id);
          var prodName = prod ? prod.name : 'المنتج';
          return res.status(400).json({
            error: `الرصيد المتاح من (${prodName}) في ${store.name} هو (${avail}) فقط ولا يكفي لبيع (${itm.quantity})`
          });
        }
      }

      // 2. Generate unique sequential invoice number for this store
      var year = new Date().getFullYear();
      var countRow = db.prepare('SELECT COUNT(*) as count FROM invoices WHERE store_id = ?').get(targetStoreId);
      var seq = (countRow ? countRow.count : 0) + 1;
      var invoiceNumber = `${store.invoice_prefix || ('INV-' + store.code)}-${year}-${String(seq).padStart(4, '0')}`;

      // Check if duplicate exists (concurrency safety)
      var checkDup = db.prepare('SELECT id FROM invoices WHERE invoice_number = ?').get(invoiceNumber);
      if (checkDup) {
        invoiceNumber = `${store.invoice_prefix || ('INV-' + store.code)}-${year}-${String(seq + 1).padStart(4, '0')}`;
      }

      // 3. Calculate financial totals
      var subtotal = 0;
      var totalCost = 0;
      items.forEach(function (itm) {
        var inv = db.prepare('SELECT purchase_price, retail_price FROM store_inventory WHERE store_id = ? AND product_id = ?').get(targetStoreId, itm.product_id);
        var unitPrice = itm.unit_price !== undefined ? parseFloat(itm.unit_price) : (inv ? inv.retail_price : 0);
        var unitCost = inv ? inv.purchase_price : 0;
        itm.unit_price = unitPrice;
        itm.unit_cost = unitCost;
        itm.total_price = unitPrice * itm.quantity;
        subtotal += itm.total_price;
        totalCost += unitCost * itm.quantity;
      });

      var disc = parseFloat(discount) || 0;
      var tx = parseFloat(tax) || 0;
      var totalAmount = Math.max(0, subtotal - disc + tx);
      var pType = payment_type || 'cash';
      var paid = paid_amount !== undefined ? parseFloat(paid_amount) : (pType === 'cash' ? totalAmount : 0);
      var remaining = Math.max(0, totalAmount - paid);
      var pStatus = remaining <= 0 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');

      // 4. Insert Invoice
      var invResult = db.prepare(`
        INSERT INTO invoices (
          invoice_number, store_id, customer_id, customer_name, customer_phone,
          payment_type, payment_status, subtotal, discount, tax, total_amount,
          paid_amount, remaining_amount, total_cost, status, notes, created_by, created_by_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)
      `).run(
        invoiceNumber, targetStoreId, customer_id || null, customer_name, customer_phone || '',
        pType, pStatus, subtotal, disc, tx, totalAmount,
        paid, remaining, totalCost, notes || '', req.user.id, req.user.name
      );

      var invoiceId = invResult.lastInsertRowid;

      // 5. Insert Items & Deduct Stock from this store
      var productSummaryArr = [];
      items.forEach(function (itm) {
        var prod = db.prepare('SELECT name FROM products WHERE id = ?').get(itm.product_id);
        var prodName = prod ? prod.name : 'منتج';
        productSummaryArr.push(prodName + ' (' + itm.quantity + ')');

        db.prepare(`
          INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, unit_cost, total_price)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(invoiceId, itm.product_id, prodName, itm.quantity, itm.unit_price, itm.unit_cost, itm.total_price);

        // Deduct from store_inventory
        var inv = db.prepare('SELECT id, stock_quantity FROM store_inventory WHERE store_id = ? AND product_id = ?').get(targetStoreId, itm.product_id);
        var newQty = inv.stock_quantity - itm.quantity;
        db.prepare("UPDATE store_inventory SET stock_quantity = ?, updated_at = datetime('now') WHERE id = ?").run(newQty, inv.id);

        // Record in inventory ledger
        db.prepare(`
          INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, reference_id, user_id, user_name, notes)
          VALUES (?, ?, 'sale', ?, ?, 'invoice', ?, ?, ?, ?)
        `).run(
          targetStoreId, itm.product_id, -itm.quantity, newQty, invoiceId, req.user.id, req.user.name,
          `مبيعات فاتورة رقم ${invoiceNumber} للعميل ${customer_name}`
        );
      });

      // 6. Bridge to legacy orders table so all legacy screens stay updated
      var prodSummaryStr = productSummaryArr.join('، ');
      db.prepare(`
        INSERT INTO orders (customer_id, customer_name, phone, products, amount, status, notes, store_id, invoice_number)
        VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?)
      `).run(customer_id || null, customer_name, customer_phone || '', prodSummaryStr, totalAmount, notes || '', targetStoreId, invoiceNumber);

      // 7. Update customer statistics if customer exists
      if (customer_id) {
        db.prepare(`
          UPDATE customers 
          SET orders_count = orders_count + 1, total = total + ?
          WHERE id = ?
        `).run(totalAmount, customer_id);
      }

      // 8. Log activity
      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, 'create_invoice', 'invoice', invoiceId,
        JSON.stringify({ invoice_number: invoiceNumber, store_id: targetStoreId, amount: totalAmount })
      );

      var fullInvoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
      fullInvoice.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId);

      res.status(201).json(fullInvoice);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sales return (مرتجع مبيعات وإعادة البضاعة لمخزون المحل الصحيح)
  router.post('/:id/return', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
      if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' });

      // Check store access
      if (req.user.store_id && req.user.role !== 'admin' && req.user.store_id !== invoice.store_id) {
        return res.status(403).json({ error: 'غير مصرح بتسجيل مرتجع لمحل آخر' });
      }

      var return_items = req.body.return_items || req.body.items;
      var reason = req.body.reason;
      if (!return_items || !Array.isArray(return_items) || return_items.length === 0) {
        return res.status(400).json({ error: 'قائمة الأصناف المرتجعة مطلوبة' });
      }

      var countRow = db.prepare('SELECT COUNT(*) as count FROM sales_returns').get();
      var seq = (countRow ? countRow.count : 0) + 1;
      var returnNumber = `RET-${invoice.store_id}-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

      var totalRefund = 0;
      return_items.forEach(function (ri) {
        var itm = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? AND product_id = ?').get(invoice.id, ri.product_id);
        if (itm) {
          totalRefund += itm.unit_price * ri.quantity;
        }
      });

      var retResult = db.prepare(`
        INSERT INTO sales_returns (return_number, invoice_id, store_id, customer_id, refund_amount, reason, created_by, created_by_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        returnNumber, invoice.id, invoice.store_id, invoice.customer_id, totalRefund, reason || 'إرجاع بضاعة', req.user.id, req.user.name
      );

      var returnId = retResult.lastInsertRowid;

      // Restore inventory in this store and log transaction
      return_items.forEach(function (ri) {
        var itm = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? AND product_id = ?').get(invoice.id, ri.product_id);
        if (!itm) return;

        db.prepare(`
          INSERT INTO sales_return_items (return_id, product_id, quantity, refund_price)
          VALUES (?, ?, ?, ?)
        `).run(returnId, ri.product_id, ri.quantity, itm.unit_price);

        // Mark returned quantity on invoice item
        db.prepare('UPDATE invoice_items SET returned_quantity = returned_quantity + ? WHERE id = ?').run(ri.quantity, itm.id);

        // Restore stock in store_inventory
        var inv = db.prepare('SELECT id, stock_quantity FROM store_inventory WHERE store_id = ? AND product_id = ?').get(invoice.store_id, ri.product_id);
        var newQty = inv.stock_quantity + ri.quantity;
        db.prepare("UPDATE store_inventory SET stock_quantity = ?, updated_at = datetime('now') WHERE id = ?").run(newQty, inv.id);

        // Ledger entry
        db.prepare(`
          INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, reference_id, user_id, user_name, notes)
          VALUES (?, ?, 'sale_return', ?, ?, 'sales_return', ?, ?, ?, ?)
        `).run(
          invoice.store_id, ri.product_id, ri.quantity, newQty, returnId, req.user.id, req.user.name,
          `مرتجع مبيعات رقم ${returnNumber} للفاتورة ${invoice.invoice_number}`
        );
      });

      res.json({
        message: 'تم تسجيل المرتجع وإعادة الكميات لمخزون المحل بنجاح',
        return_number: returnNumber,
        refund_amount: totalRefund
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
