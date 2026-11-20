var express = require('express');
var { authenticateToken, requireRole, requireStoreAccess } = require('../middleware/auth');

module.exports = function (db) {
  var router = express.Router();

  // Unified / Per-store Dashboard KPI summary from real database records
  router.get('/dashboard', authenticateToken, requireStoreAccess, async function (req, res) {
    try {
      var storeId = req.query.store_id || req.user.store_id;

      // Sales query
      var salesQuery = "SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total_sales, COALESCE(SUM(total_cost), 0) as total_cost, COALESCE(SUM(paid_amount), 0) as total_collected, COALESCE(SUM(remaining_amount), 0) as total_debts FROM invoices WHERE status != 'cancelled'";
      // Expenses query
      var expensesQuery = "SELECT COALESCE(SUM(amount), 0) as total_expenses FROM expenses";
      // Inventory query
      var invQuery = "SELECT COUNT(*) as total_items, COALESCE(SUM(stock_quantity), 0) as total_units, COALESCE(SUM(stock_quantity * purchase_price), 0) as inventory_cost_value, COALESCE(SUM(stock_quantity * retail_price), 0) as inventory_retail_value FROM store_inventory";
      // Low stock query
      var lowStockQuery = "SELECT COUNT(*) as count FROM store_inventory WHERE stock_quantity <= min_stock_alert";

      var salesParams = [];
      var expensesParams = [];
      var invParams = [];
      var lowStockParams = [];

      if (storeId && req.user.role !== 'admin') {
        salesQuery += ' AND store_id = ?';
        salesParams.push(storeId);
        expensesQuery += ' WHERE store_id = ?';
        expensesParams.push(storeId);
        invQuery += ' WHERE store_id = ?';
        invParams.push(storeId);
        lowStockQuery += ' AND store_id = ?';
        lowStockParams.push(storeId);
      } else if (req.query.store_id) {
        salesQuery += ' AND store_id = ?';
        salesParams.push(req.query.store_id);
        expensesQuery += ' WHERE store_id = ?';
        expensesParams.push(req.query.store_id);
        invQuery += ' WHERE store_id = ?';
        invParams.push(req.query.store_id);
        lowStockQuery += ' AND store_id = ?';
        lowStockParams.push(req.query.store_id);
      }

      var salesStats = (await db.prepare(salesQuery).get.apply(null, salesParams)) || {};
      var expensesStats = (await db.prepare(expensesQuery).get.apply(null, expensesParams)) || {};
      var invStats = (await db.prepare(invQuery).get.apply(null, invParams)) || {};
      var lowStockStats = (await db.prepare(lowStockQuery).get.apply(null, lowStockParams)) || {};

      var totalSales = salesStats.total_sales || 0;
      var totalCost = salesStats.total_cost || 0;
      var grossProfit = totalSales - totalCost;
      var totalExpenses = expensesStats.total_expenses || 0;
      var netProfit = grossProfit - totalExpenses;

      // Per-store breakdown (for Admin or multi-store comparison)
      var rawStores = await db.prepare(`
        SELECT 
          s.id,
          s.name,
          s.code,
          COALESCE((SELECT SUM(total_amount) FROM invoices WHERE store_id = s.id AND status != 'cancelled'), 0) as sales,
          COALESCE((SELECT SUM(total_cost) FROM invoices WHERE store_id = s.id AND status != 'cancelled'), 0) as cogs,
          COALESCE((SELECT SUM(amount) FROM expenses WHERE store_id = s.id), 0) as expenses,
          COALESCE((SELECT SUM(remaining_amount) FROM invoices WHERE store_id = s.id AND status != 'cancelled'), 0) as receivables,
          COALESCE((SELECT SUM(stock_quantity) FROM store_inventory WHERE store_id = s.id), 0) as stock_units,
          COALESCE((SELECT SUM(stock_quantity * purchase_price) FROM store_inventory WHERE store_id = s.id), 0) as inventory_value
        FROM stores s
        ORDER BY s.id ASC
      `).all();

      var storesBreakdown = rawStores.map(function (sb) {
        var gp = sb.sales - sb.cogs;
        return Object.assign({}, sb, {
          gross_profit: gp,
          net_profit: gp - sb.expenses
        });
      });

      // Top selling products from real invoices
      var topProductsQuery = `
        SELECT 
          ii.product_id,
          ii.product_name,
          p.category,
          p.model,
          SUM(ii.quantity) as total_sold,
          SUM(ii.total_price) as total_revenue
        FROM invoice_items ii
        JOIN invoices inv ON ii.invoice_id = inv.id
        LEFT JOIN products p ON ii.product_id = p.id
        WHERE inv.status != 'cancelled'
      `;
      var topParams = [];
      if (storeId && req.user.role !== 'admin') {
        topProductsQuery += ' AND inv.store_id = ?';
        topParams.push(storeId);
      } else if (req.query.store_id) {
        topProductsQuery += ' AND inv.store_id = ?';
        topParams.push(req.query.store_id);
      }
      topProductsQuery += ' GROUP BY ii.product_id ORDER BY total_sold DESC LIMIT 6';
      var topProducts = await db.prepare(topProductsQuery).all.apply(null, topParams);

      // Recent transfers count
      var transfersCountRow = await db.prepare("SELECT COUNT(*) as count FROM stock_transfers").get();
      var transfersCount = transfersCountRow ? transfersCountRow.count : 0;

      res.json({
        totalSales: totalSales,
        totalCost: totalCost,
        grossProfit: grossProfit,
        totalExpenses: totalExpenses,
        netProfit: netProfit,
        totalCollected: salesStats.total_collected || 0,
        totalDebts: salesStats.total_debts || 0,
        invoicesCount: salesStats.count || 0,
        inventoryUnits: invStats.total_units || 0,
        inventoryCostValue: invStats.inventory_cost_value || 0,
        inventoryRetailValue: invStats.inventory_retail_value || 0,
        lowStockCount: lowStockStats.count || 0,
        transfersCount: transfersCount,
        storesBreakdown: storesBreakdown,
        topProducts: topProducts
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sales Trends & Analytics
  router.get('/sales', authenticateToken, requireStoreAccess, async function (req, res) {
    try {
      var storeId = req.query.store_id || req.user.store_id;
      var query = `
        SELECT 
          strftime('%Y-%m', inv.created_at) as month,
          COUNT(*) as invoice_count,
          SUM(inv.total_amount) as total_sales,
          SUM(inv.total_cost) as total_cost,
          SUM(inv.paid_amount) as total_paid,
          SUM(inv.remaining_amount) as total_debts
        FROM invoices inv
        WHERE inv.status != 'cancelled'
      `;
      var params = [];
      if (storeId && req.user.role !== 'admin') {
        query += ' AND inv.store_id = ?';
        params.push(storeId);
      } else if (req.query.store_id) {
        query += ' AND inv.store_id = ?';
        params.push(req.query.store_id);
      }
      query += " GROUP BY strftime('%Y-%m', inv.created_at) ORDER BY month DESC LIMIT 12";

      var rows = await db.prepare(query).all.apply(null, params);
      var salesReport = rows.map(function (m) {
        return Object.assign({}, m, {
          gross_profit: m.total_sales - m.total_cost
        });
      });

      res.json(salesReport);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
