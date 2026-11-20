var express = require('express');
var { authenticateToken, requireRole, requireStoreAccess } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  // List invoices
  router.get('/', authenticateToken, requireStoreAccess, async function (req, res) {
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

      var invoices = await db.prepare(`
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
  router.get('/:id', authenticateToken, async function (req, res) {
    try {
      var invoice = await db.prepare(`
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

      if (req.user.store_id && req.user.role !== 'admin' && req.user.store_id !== invoice.store_id) {
        return res.status(403).json({ error: 'غير مصرح لك بالاطلاع على فاتورة محل آخر' });
      }

      var items = await db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(req.params.id);
      invoice.items = items;

      res.json(invoice);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create new sale invoice - ATOMIC TRANSACTION WITH AUTOMATIC ROLLBACK
  router.post('/', authenticateToken, requireRole('admin', 'store_manager', 'cashier'), async function (req, res) {
    try {
      var {
        store_id, customer_id, customer_name, customer_phone,
        items, payment_type, discount, tax, paid_amount, notes
      } = req.body;

      var targetStoreId = store_id || req.user.store_id || 1;

      if (req.user.store_id && String(req.user.store_id) !== String(targetStoreId) && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'لا يمكنك إصدار فاتورة لمحل آخر غير محلك' });
      }

      if (!customer_name && customer_id) {
        var cust = await db.prepare('SELECT name, phone FROM customers WHERE id = ?').get(customer_id);
        if (cust) {
          customer_name = cust.name;
          if (!customer_phone) customer_phone = cust.phone;
        }
      }
      if (!customer_name) customer_name = 'عميل نقدي';

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'قائمة المنتجات والكميات مطلوبة' });
      }

      var store = await db.prepare('SELECT * FROM stores WHERE id = ?').get(targetStoreId);
      if (!store) return res.status(404).json({ error: 'المحل المحدد غير موجود' });

      // 1. Validate stock availability
      for (var i = 0; i < items.length; i++) {
        var itm = items[i];
        var inv = await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = ? AND product_id = ?').get(targetStoreId, itm.product_id);
        var avail = inv ? inv.stock_quantity : 0;
        if (avail < itm.quantity) {
          var prod = await db.prepare('SELECT name FROM products WHERE id = ?').get(itm.product_id);
          var prodName = prod ? prod.name : 'المنتج';
          return res.status(400).json({
            error: `الرصيد المتاح من (${prodName}) في ${store.name} هو (${avail}) فقط ولا يكفي لبيع (${itm.quantity})`
          });
        }
      }

      // 2. Generate unique sequential invoice number
      var year = new Date().getFullYear();
      var countRow = await db.prepare('SELECT COUNT(*) as count FROM invoices WHERE store_id = ?').get(targetStoreId);
      var seq = (countRow ? countRow.count : 0) + 1;
      var invoiceNumber = `${store.invoice_prefix || ('INV-' + store.code)}-${year}-${String(seq).padStart(4, '0')}`;

      var checkDup = await db.prepare('SELECT id FROM invoices WHERE invoice_number = ?').get(invoiceNumber);
      if (checkDup) {
        invoiceNumber = `${store.invoice_prefix || ('INV-' + store.code)}-${year}-${String(seq + 1).padStart(4, '0')}`;
      }

      // 3. Calculate financial totals
      var subtotal = 0;
      var totalCost = 0;
      for (var k = 0; k < items.length; k++) {
        var itmCalc = items[k];
        var invCalc = await db.prepare('SELECT purchase_price, retail_price FROM store_inventory WHERE store_id = ? AND product_id = ?').get(targetStoreId, itmCalc.product_id);
        var unitPrice = itmCalc.unit_price !== undefined ? parseFloat(itmCalc.unit_price) : (invCalc ? invCalc.retail_price : 0);
        var unitCost = invCalc ? invCalc.purchase_price : 0;
        itmCalc.unit_price = unitPrice;
        itmCalc.unit_cost = unitCost;
        itmCalc.total_price = unitPrice * itmCalc.quantity;
        subtotal += itmCalc.total_price;
        totalCost += unitCost * itmCalc.quantity;
      }

      var disc = parseFloat(discount) || 0;
      var tx = parseFloat(tax) || 0;
      var totalAmount = Math.max(0, subtotal - disc + tx);
      var pType = payment_type || 'cash';
      var paid = paid_amount !== undefined ? parseFloat(paid_amount) : (pType === 'cash' ? totalAmount : 0);
      var remaining = Math.max(0, totalAmount - paid);
      var pStatus = remaining <= 0 ? 'paid' : (paid > 0 ? 'partial' : 'unpaid');

      var invoiceId = null;

      // ATOMIC TRANSACTION EXECUTION
      var executeSale = async function (ctx) {
        var invResult = await ctx.prepare(`
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

        invoiceId = invResult.lastInsertRowid;

        var productSummaryArr = [];
        for (var j = 0; j < items.length; j++) {
          var itemObj = items[j];
          var pData = await ctx.prepare('SELECT name FROM products WHERE id = ?').get(itemObj.product_id);
          var pName = pData ? pData.name : 'منتج';
          productSummaryArr.push(pName + ' (' + itemObj.quantity + ')');

          await ctx.prepare(`
            INSERT INTO invoice_items (invoice_id, product_id, product_name, quantity, unit_price, unit_cost, total_price)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(invoiceId, itemObj.product_id, pName, itemObj.quantity, itemObj.unit_price, itemObj.unit_cost, itemObj.total_price);

          // Deduct from store_inventory
          var currentInv = await ctx.prepare('SELECT id, stock_quantity FROM store_inventory WHERE store_id = ? AND product_id = ?').get(targetStoreId, itemObj.product_id);
          var newStock = currentInv.stock_quantity - itemObj.quantity;
          await ctx.prepare("UPDATE store_inventory SET stock_quantity = ?, updated_at = datetime('now') WHERE id = ?").run(newStock, currentInv.id);

          // Record in inventory ledger
          await ctx.prepare(`
            INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, reference_id, user_id, user_name, notes)
            VALUES (?, ?, 'sale', ?, ?, 'invoice', ?, ?, ?, ?)
          `).run(
            targetStoreId, itemObj.product_id, -itemObj.quantity, newStock, invoiceId, req.user.id, req.user.name,
            `مبيعات فاتورة رقم ${invoiceNumber} للعميل ${customer_name}`
          );
        }

        // Bridge to orders table
        var prodSummaryStr = productSummaryArr.join('، ');
        await ctx.prepare(`
          INSERT INTO orders (customer_id, customer_name, phone, products, amount, status, notes, store_id, invoice_number)
          VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?)
        `).run(customer_id || null, customer_name, customer_phone || '', prodSummaryStr, totalAmount, notes || '', targetStoreId, invoiceNumber);

        // Update customer total
        if (customer_id) {
          await ctx.prepare(`
            UPDATE customers 
            SET orders_count = orders_count + 1, total = total + ?
            WHERE id = ?
          `).run(totalAmount, customer_id);
        }

        // Log activity
        await ctx.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
          req.user.id, req.user.name, 'create_invoice', 'invoice', invoiceId,
          JSON.stringify({ invoice_number: invoiceNumber, store_id: targetStoreId, amount: totalAmount })
        );
      };

      if (typeof db.transaction === 'function') {
        await db.transaction(executeSale);
      } else {
        await executeSale(db);
      }

      var fullInvoice = await db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
      fullInvoice.items = await db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId);

      res.status(201).json(fullInvoice);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sales return - ATOMIC TRANSACTION WITH AUTOMATIC ROLLBACK
  router.post('/:id/return', authenticateToken, requireRole('admin', 'store_manager'), async function (req, res) {
    try {
      var invoice = await db.prepare('SELECT * FROM invoices WHERE id = ?').get(req.params.id);
      if (!invoice) return res.status(404).json({ error: 'الفاتورة غير موجودة' });

      if (req.user.store_id && req.user.role !== 'admin' && req.user.store_id !== invoice.store_id) {
        return res.status(403).json({ error: 'غير مصرح بتسجيل مرتجع لمحل آخر' });
      }

      var return_items = req.body.return_items || req.body.items;
      var reason = req.body.reason;
      if (!return_items || !Array.isArray(return_items) || return_items.length === 0) {
        return res.status(400).json({ error: 'قائمة الأصناف المرتجعة مطلوبة' });
      }

      var countRow = await db.prepare('SELECT COUNT(*) as count FROM sales_returns').get();
      var seq = (countRow ? countRow.count : 0) + 1;
      var returnNumber = `RET-${invoice.store_id}-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

      var totalRefund = 0;
      for (var rIdx = 0; rIdx < return_items.length; rIdx++) {
        var ri = return_items[rIdx];
        var itm = await db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? AND product_id = ?').get(invoice.id, ri.product_id);
        if (itm) {
          totalRefund += itm.unit_price * ri.quantity;
        }
      }

      var returnId = null;

      var executeReturn = async function (ctx) {
        var retResult = await ctx.prepare(`
          INSERT INTO sales_returns (return_number, invoice_id, store_id, customer_id, refund_amount, reason, created_by, created_by_name)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          returnNumber, invoice.id, invoice.store_id, invoice.customer_id, totalRefund, reason || 'إرجاع بضاعة', req.user.id, req.user.name
        );

        returnId = retResult.lastInsertRowid;

        for (var j = 0; j < return_items.length; j++) {
          var ri2 = return_items[j];
          var itm2 = await ctx.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? AND product_id = ?').get(invoice.id, ri2.product_id);
          if (!itm2) continue;

          await ctx.prepare(`
            INSERT INTO sales_return_items (return_id, product_id, quantity, refund_price)
            VALUES (?, ?, ?, ?)
          `).run(returnId, ri2.product_id, ri2.quantity, itm2.unit_price);

          await ctx.prepare('UPDATE invoice_items SET returned_quantity = returned_quantity + ? WHERE id = ?').run(ri2.quantity, itm2.id);

          var inv = await ctx.prepare('SELECT id, stock_quantity FROM store_inventory WHERE store_id = ? AND product_id = ?').get(invoice.store_id, ri2.product_id);
          var newQty = inv.stock_quantity + ri2.quantity;
          await ctx.prepare("UPDATE store_inventory SET stock_quantity = ?, updated_at = datetime('now') WHERE id = ?").run(newQty, inv.id);

          await ctx.prepare(`
            INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, reference_id, user_id, user_name, notes)
            VALUES (?, ?, 'sale_return', ?, ?, 'sales_return', ?, ?, ?, ?)
          `).run(
            invoice.store_id, ri2.product_id, ri2.quantity, newQty, returnId, req.user.id, req.user.name,
            `مرتجع مبيعات رقم ${returnNumber} للفاتورة ${invoice.invoice_number}`
          );
        }
      };

      if (typeof db.transaction === 'function') {
        await db.transaction(executeReturn);
      } else {
        await executeReturn(db);
      }

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
