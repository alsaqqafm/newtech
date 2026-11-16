var express = require('express');
var { authenticateToken, requireRole } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  router.get('/', function (req, res) {
    try {
      var storeId = req.query.store_id;
      var products;

      if (storeId) {
        // Return products with stock specifically from this store
        products = db.prepare(`
          SELECT 
            p.*,
            COALESCE(si.stock_quantity, 0) as stock,
            COALESCE(si.retail_price, p.price) as store_price,
            COALESCE(si.purchase_price, 0) as purchase_price,
            COALESCE(si.wholesale_price, 0) as wholesale_price,
            COALESCE(si.unit, 'قطعة') as unit,
            COALESCE(si.min_stock_alert, 5) as min_stock_alert,
            CASE 
              WHEN COALESCE(si.stock_quantity, 0) <= 0 THEN 'غير متوفر'
              WHEN COALESCE(si.stock_quantity, 0) <= COALESCE(si.min_stock_alert, 5) THEN 'مخزون منخفض'
              ELSE 'متوفر'
            END as status
          FROM products p
          LEFT JOIN store_inventory si ON p.id = si.product_id AND si.store_id = ?
          ORDER BY p.id DESC
        `).all(storeId);
      } else {
        // Consolidated view across all stores
        products = db.prepare(`
          SELECT 
            p.*,
            (SELECT COALESCE(SUM(stock_quantity), 0) FROM store_inventory WHERE product_id = p.id) as total_stock
          FROM products p
          ORDER BY p.id DESC
        `).all().map(function (p) {
          // If total_stock is available from store_inventory, use it
          if (p.total_stock !== null && p.total_stock !== undefined) {
            p.stock = p.total_stock;
          }
          return p;
        });
      }

      res.json(products);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/:id', function (req, res) {
    try {
      var storeId = req.query.store_id;
      var product;
      if (storeId) {
        product = db.prepare(`
          SELECT 
            p.*,
            COALESCE(si.stock_quantity, 0) as stock,
            COALESCE(si.retail_price, p.price) as store_price,
            COALESCE(si.purchase_price, 0) as purchase_price,
            COALESCE(si.wholesale_price, 0) as wholesale_price,
            COALESCE(si.unit, 'قطعة') as unit,
            COALESCE(si.min_stock_alert, 5) as min_stock_alert
          FROM products p
          LEFT JOIN store_inventory si ON p.id = si.product_id AND si.store_id = ?
          WHERE p.id = ?
        `).get(storeId, req.params.id);
      } else {
        product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
        if (product) {
          var totalStock = db.prepare('SELECT COALESCE(SUM(stock_quantity), 0) as total FROM store_inventory WHERE product_id = ?').get(product.id).total;
          product.stock = totalStock;
        }
      }

      if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
      res.json(product);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/', authenticateToken, requireRole('admin', 'store_manager', 'inventory', 'editor'), function (req, res) {
    try {
      var { name, name_en, model, category, description, description_en, image, agent, manufacturer, price, stock, status, features, keywords, store_id, purchase_price, wholesale_price, unit } = req.body;
      if (!name) return res.status(400).json({ error: 'اسم المنتج مطلوب' });

      var result = db.prepare(`
        INSERT INTO products (name, name_en, model, category, description, description_en, image, agent, manufacturer, price, stock, status, features, keywords, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        name,
        name_en || '',
        model || '',
        category || '',
        description || '',
        description_en || '',
        image || '',
        agent || manufacturer || '',
        manufacturer || agent || '',
        price || 0,
        stock || 0,
        status || 'متوفر',
        features || '',
        keywords || ''
      );

      var newProductId = result.lastInsertRowid;
      var initialStock = parseInt(stock) || 0;
      var purchaseCost = purchase_price !== undefined ? parseFloat(purchase_price) : (price > 0 ? Math.round(price * 0.7) : 0);
      var wholesale = wholesale_price !== undefined ? parseFloat(wholesale_price) : (price > 0 ? Math.round(price * 0.88) : 0);
      var primaryStoreId = store_id || req.user.store_id || 1;

      // Initialize in all stores
      var stores = db.prepare('SELECT id FROM stores').all();
      stores.forEach(function (s) {
        var qty = s.id === parseInt(primaryStoreId) ? initialStock : 0;
        db.prepare(`
          INSERT INTO store_inventory (store_id, product_id, stock_quantity, min_stock_alert, purchase_price, wholesale_price, retail_price, unit)
          VALUES (?, ?, ?, 5, ?, ?, ?, ?)
        `).run(s.id, newProductId, qty, purchaseCost, wholesale, price || 0, unit || 'قطعة');

        if (qty > 0) {
          db.prepare(`
            INSERT INTO inventory_transactions (store_id, product_id, change_type, quantity, balance_after, reference_type, user_id, user_name, notes)
            VALUES (?, ?, 'opening', ?, ?, 'new_product', ?, ?, 'رصيد افتتاحي عند إضافة الصنف')
          `).run(s.id, newProductId, qty, qty, req.user.id, req.user.name);
        }
      });

      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, 'create', 'product', newProductId, JSON.stringify({ name: name })
      );

      var product = db.prepare('SELECT * FROM products WHERE id = ?').get(newProductId);
      res.status(201).json(product);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/:id', authenticateToken, requireRole('admin', 'store_manager', 'inventory', 'editor'), function (req, res) {
    try {
      var existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'المنتج غير موجود' });

      var { name, name_en, model, category, description, description_en, image, agent, manufacturer, price, stock, status, features, keywords, store_id } = req.body;

      db.prepare(`
        UPDATE products 
        SET name = ?, name_en = ?, model = ?, category = ?, description = ?, description_en = ?, 
            image = ?, agent = ?, manufacturer = ?, price = ?, stock = ?, status = ?, features = ?, keywords = ? 
        WHERE id = ?
      `).run(
        name !== undefined ? name : existing.name,
        name_en !== undefined ? name_en : existing.name_en,
        model !== undefined ? model : existing.model,
        category !== undefined ? category : existing.category,
        description !== undefined ? description : existing.description,
        description_en !== undefined ? description_en : existing.description_en,
        image !== undefined ? image : existing.image,
        agent !== undefined ? agent : (existing.agent || existing.manufacturer),
        manufacturer !== undefined ? manufacturer : (existing.manufacturer || existing.agent),
        price !== undefined ? price : existing.price,
        stock !== undefined ? stock : existing.stock,
        status !== undefined ? status : existing.status,
        features !== undefined ? features : existing.features,
        keywords !== undefined ? keywords : existing.keywords,
        req.params.id
      );

      // If a specific store stock was provided and user has permission, update store inventory
      if (store_id && stock !== undefined) {
        db.prepare("UPDATE store_inventory SET stock_quantity = ?, updated_at = datetime('now') WHERE store_id = ? AND product_id = ?").run(
          parseInt(stock), store_id, req.params.id
        );
      }

      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, 'update', 'product', req.params.id, JSON.stringify({ name: name || existing.name })
      );

      var product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      res.json(product);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/:id', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!existing) return res.status(404).json({ error: 'المنتج غير موجود' });

      // Clean up store inventory and adjustments
      db.prepare('DELETE FROM store_inventory WHERE product_id = ?').run(req.params.id);
      db.prepare('DELETE FROM stock_adjustments WHERE product_id = ?').run(req.params.id);

      // Delete the product
      db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);

      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, 'delete', 'product', req.params.id, JSON.stringify({ name: existing.name })
      );

      res.json({ message: 'تم حذف المنتج بنجاح', id: req.params.id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/:id/toggle', authenticateToken, requireRole('admin', 'store_manager'), function (req, res) {
    try {
      var product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
      if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });

      var newActive = product.active ? 0 : 1;
      db.prepare('UPDATE products SET active = ? WHERE id = ?').run(newActive, req.params.id);

      db.prepare('INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(
        req.user.id, req.user.name, newActive ? 'activate' : 'deactivate', 'product', req.params.id, JSON.stringify({ name: product.name })
      );

      res.json({ message: newActive ? 'تم تفعيل المنتج' : 'تم تعطيل المنتج', active: newActive });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
