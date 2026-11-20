var express = require('express');
var { authenticateToken, requireRole } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  // List transfers
  router.get('/', authenticateToken, async function (req, res) {
    try {
      var storeId = req.query.store_id || req.user.store_id;
      var query = `
        SELECT 
          t.*,
          s1.name as from_store_name,
          s1.code as from_store_code,
          s2.name as to_store_name,
          s2.code as to_store_code,
          (SELECT COUNT(*) FROM transfer_items WHERE transfer_id = t.id) as total_items,
          (SELECT COALESCE(SUM(quantity_sent), 0) FROM transfer_items WHERE transfer_id = t.id) as total_units_sent,
          (SELECT COALESCE(SUM(quantity_received), 0) FROM transfer_items WHERE transfer_id = t.id) as total_units_received
        FROM stock_transfers t
        JOIN stores s1 ON t.from_store_id = s1.id
        JOIN stores s2 ON t.to_store_id = s2.id
      `;
      var params = [];
      if (storeId && req.user.role !== 'admin') {
        query += ' WHERE (t.from_store_id = ? OR t.to_store_id = ?)';
        params.push(storeId, storeId);
      } else if (req.query.store_id) {
        query += ' WHERE (t.from_store_id = ? OR t.to_store_id = ?)';
        params.push(req.query.store_id, req.query.store_id);
      }
      query += ' ORDER BY t.id DESC';

      var transfers = await db.prepare(query).all.apply(null, params);
      res.json(transfers);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get transfer details with items
  router.get('/:id', authenticateToken, async function (req, res) {
    try {
      var transfer = await db.prepare(`
        SELECT 
          t.*,
          s1.name as from_store_name,
          s1.code as from_store_code,
          s2.name as to_store_name,
          s2.code as to_store_code
        FROM stock_transfers t
        JOIN stores s1 ON t.from_store_id = s1.id
        JOIN stores s2 ON t.to_store_id = s2.id
        WHERE t.id = ?
      `).get(req.params.id);

      if (!transfer) return res.status(404).json({ error: 'طلب التحويل غير موجود' });

      if (req.user.store_id && req.user.role !== 'admin') {
        if (req.user.store_id !== transfer.from_store_id && req.user.store_id !== transfer.to_store_id) {
          return res.status(403).json({ error: 'غير مصرح لك بالاطلاع على هذا التحويل' });
        }
      }

      var items = await db.prepare(`
        SELECT ti.*, p.model, p.category
        FROM transfer_items ti
        JOIN products p ON ti.product_id = p.id
        WHERE ti.transfer_id = ?
      `).all(req.params.id);

      transfer.items = items;
      res.json(transfer);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create new transfer request - ATOMIC TRANSACTION
  router.post('/', authenticateToken, requireRole('admin', 'store_manager', 'inventory'), async function (req, res) {
    try {
      var { from_store_id, to_store_id, items, notes } = req.body;

      if (!from_store_id || !to_store_id || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'بيانات التحويل غير مكتملة (المحل المرسل والمستلم والأصناف مطلوبة)' });
      }

      if (String(from_store_id) === String(to_store_id)) {
        return res.status(400).json({ error: 'لا يمكن التحويل لنفس المحل' });
      }

      if (req.user.store_id && String(req.user.store_id) !== String(from_store_id) && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'لا يمكنك إنشاء تحويل من محل لست مصرحاً بإدارته' });
      }

      // Validate stock availability
      for (var i = 0; i < items.length; i++) {
        var itm = items[i];
        var inv = await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = ? AND product_id = ?').get(from_store_id, itm.product_id);
        var currentQty = inv ? inv.stock_quantity : 0;
        if (currentQty < itm.quantity) {
          var prod = await db.prepare('SELECT name FROM products WHERE id = ?').get(itm.product_id);
          var prodName = prod ? prod.name : 'الصنف';
          return res.status(400).json({
            error: `الرصيد المتاح من (${prodName}) في المحل المرسل هو (${currentQty}) ولا يكفي لتحويل (${itm.quantity})`
          });
        }
      }

      var countRow = await db.prepare('SELECT COUNT(*) as count FROM stock_transfers').get();
      var seq = (countRow ? countRow.count : 0) + 1;
      var transferNumber = `TR-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`;

      var transferId = null;

      var executeCreate = async function(ctx) {
        var result = await ctx.prepare(`
          INSERT INTO stock_transfers (transfer_number, from_store_id, to_store_id, status, notes, created_by, created_by_name)
          VALUES (?, ?, ?, 'pending', ?, ?, ?)
        `).run(
          transferNumber, from_store_id, to_store_id, notes || '', req.user.id, req.user.name
        );

        transferId = result.lastInsertRowid;

        for (var j = 0; j < items.length; j++) {
          var itm2 = items[j];
          var prod2 = await ctx.prepare('SELECT name FROM products WHERE id = ?').get(itm2.product_id);
          await ctx.prepare(`
            INSERT INTO transfer_items (transfer_id, product_id, product_name, quantity_sent, quantity_received, quantity_damaged, notes)
            VALUES (?, ?, ?, ?, 0, 0, ?)
          `).run(transferId, itm2.product_id, prod2 ? prod2.name : 'منتج', itm2.quantity, itm2.notes || '');
        }

        await ctx.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
          req.user.id, req.user.name, 'create_transfer', 'transfer', transferId, JSON.stringify({ transfer_number: transferNumber, from: from_store_id, to: to_store_id })
        );
      };

      if (typeof db.transaction === 'function') {
        await db.transaction(executeCreate);
      } else {
        await executeCreate(db);
      }

      var created = await db.prepare('SELECT * FROM stock_transfers WHERE id = ?').get(transferId);
      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Approve transfer
  router.post('/:id/approve', authenticateToken, requireRole('admin', 'store_manager', 'inventory'), async function (req, res) {
    try {
      var transfer = await db.prepare('SELECT * FROM stock_transfers WHERE id = ?').get(req.params.id);
      if (!transfer) return res.status(404).json({ error: 'التحويل غير موجود' });
      if (transfer.status !== 'pending') return res.status(400).json({ error: 'التحويل ليس في حالة انتظار للموافقة' });

      await db.prepare("UPDATE stock_transfers SET status = 'approved', approved_by = ?, approved_by_name = ? WHERE id = ?").run(
        req.user.id, req.user.name, req.params.id
      );

      res.json({ message: 'تمت الموافقة على التحويل', status: 'approved' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dispatch transfer - ATOMIC TRANSACTION
  router.post('/:id/dispatch', authenticateToken, requireRole('admin', 'store_manager', 'inventory'), async function (req, res) {
    try {
      var transfer = await db.prepare('SELECT * FROM stock_transfers WHERE id = ?').get(req.params.id);
      if (!transfer) return res.status(404).json({ error: 'التحويل غير موجود' });
      if (transfer.status !== 'pending' && transfer.status !== 'approved') {
        return res.status(400).json({ error: 'لا يمكن إرسال تحويل غير معتمد أو تم شحنه مسبقاً' });
      }

      var items = await db.prepare('SELECT * FROM transfer_items WHERE transfer_id = ?').all(req.params.id);

      for (var i = 0; i < items.length; i++) {
        var itm = items[i];
        var inv = await db.prepare('SELECT stock_quantity FROM store_inventory WHERE store_id = ? AND product_id = ?').get(transfer.from_store_id, itm.product_id);
        var currentQty = inv ? inv.stock_quantity : 0;
        if (currentQty < itm.quantity_sent) {
          return res.status(400).json({ error: `رصيد (${itm.product_name}) غير كافٍ للشحن حالياً` });
        }
      }

      var executeDispatch = async function(ctx) {
        for (var j = 0; j < items.length; j++) {
          var itm2 = items[j];
          var inv2 = await ctx.prepare('SELECT id, stock_quantity FROM store_inventory WHERE store_id = ? AND product_id = ?').get(transfer.from_store_id, itm2.product_id);
          var newQty = inv2.stock_quantity - itm2.quantity_sent;

          await ctx.prepare("UPDATE store_inventory SET stock_quantity = ?, updated_at = datetime('now') WHERE id = ?").run(newQty, inv2.id);

          await ctx.prepare(`
            INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, reference_id, user_id, user_name, notes)
            VALUES (?, ?, 'transfer_out', ?, ?, 'transfer', ?, ?, ?, ?)
          `).run(
            transfer.from_store_id, itm2.product_id, -itm2.quantity_sent, newQty, transfer.id, req.user.id, req.user.name,
            `خروج بضاعة للتحويل رقم ${transfer.transfer_number} إلى المحل #${transfer.to_store_id}`
          );
        }

        await ctx.prepare("UPDATE stock_transfers SET status = 'in_transit', dispatched_at = datetime('now') WHERE id = ?").run(req.params.id);
      };

      if (typeof db.transaction === 'function') {
        await db.transaction(executeDispatch);
      } else {
        await executeDispatch(db);
      }

      res.json({ message: 'تم إخراج البضاعة وأصبحت بحالة (في الطريق)', status: 'in_transit' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Receive transfer - ATOMIC TRANSACTION
  router.post('/:id/receive', authenticateToken, requireRole('admin', 'store_manager', 'inventory'), async function (req, res) {
    try {
      var transfer = await db.prepare('SELECT * FROM stock_transfers WHERE id = ?').get(req.params.id);
      if (!transfer) return res.status(404).json({ error: 'التحويل غير موجود' });
      if (transfer.status !== 'in_transit') {
        return res.status(400).json({ error: 'التحويل ليس في حالة (في الطريق)' });
      }

      if (req.user.store_id && String(req.user.store_id) !== String(transfer.to_store_id) && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح لك بتأكيد الاستلام نيابة عن المحل المستلم' });
      }

      var receivedItems = req.body.items || [];
      var items = await db.prepare('SELECT * FROM transfer_items WHERE transfer_id = ?').all(req.params.id);
      var hasDispute = false;

      var executeReceive = async function(ctx) {
        for (var i = 0; i < items.length; i++) {
          var itm = items[i];
          var report = receivedItems.find(function (r) { return r.id === itm.id || r.product_id === itm.product_id; });
          var qtyReceived = report && report.quantity_received !== undefined ? parseInt(report.quantity_received) : itm.quantity_sent;
          var qtyDamaged = report && report.quantity_damaged !== undefined ? parseInt(report.quantity_damaged) : 0;

          if (qtyReceived + qtyDamaged !== itm.quantity_sent) {
            hasDispute = true;
          }

          await ctx.prepare('UPDATE transfer_items SET quantity_received = ?, quantity_damaged = ? WHERE id = ?').run(
            qtyReceived, qtyDamaged, itm.id
          );

          var inv = await ctx.prepare('SELECT id, stock_quantity FROM store_inventory WHERE store_id = ? AND product_id = ?').get(transfer.to_store_id, itm.product_id);
          var newQty;
          if (inv) {
            newQty = inv.stock_quantity + qtyReceived;
            await ctx.prepare("UPDATE store_inventory SET stock_quantity = ?, updated_at = datetime('now') WHERE id = ?").run(newQty, inv.id);
          } else {
            newQty = qtyReceived;
            var prod = await ctx.prepare('SELECT price FROM products WHERE id = ?').get(itm.product_id);
            var purchaseCost = prod && prod.price ? Math.round(prod.price * 0.7) : 0;
            await ctx.prepare(`
              INSERT INTO store_inventory (store_id, product_id, stock_quantity, min_stock_alert, purchase_price, retail_price)
              VALUES (?, ?, ?, 5, ?, ?)
            `).run(transfer.to_store_id, itm.product_id, newQty, purchaseCost, prod ? prod.price : 0);
          }

          await ctx.prepare(`
            INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, reference_id, user_id, user_name, notes)
            VALUES (?, ?, 'transfer_in', ?, ?, 'transfer', ?, ?, ?, ?)
          `).run(
            transfer.to_store_id, itm.product_id, qtyReceived, newQty, transfer.id, req.user.id, req.user.name,
            `استلام بضاعة محولة برقم ${transfer.transfer_number} من المحل #${transfer.from_store_id}` + (qtyDamaged > 0 ? ` (تالف: ${qtyDamaged})` : '')
          );
        }

        var finalStatus = hasDispute ? 'disputed' : 'completed';
        await ctx.prepare(`
          UPDATE stock_transfers
          SET status = ?, received_by = ?, received_by_name = ?, received_at = datetime('now')
          WHERE id = ?
        `).run(finalStatus, req.user.id, req.user.name, req.params.id);
      };

      if (typeof db.transaction === 'function') {
        await db.transaction(executeReceive);
      } else {
        await executeReceive(db);
      }

      res.json({
        message: hasDispute ? 'تم تأكيد الاستلام وتسجيل فروقات/تالف' : 'تم تأكيد الاستلام وإضافة البضاعة للمخزون بنجاح',
        status: hasDispute ? 'disputed' : 'completed'
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
