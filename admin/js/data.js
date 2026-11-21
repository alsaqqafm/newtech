// ============================================================
//  Data Management - Multi-Store API Client & Local Mirror
// ============================================================

var API_BASE = '/api';

function getToken() {
  return localStorage.getItem('adminToken') || '';
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem('adminUser') || '{}');
  } catch (e) {
    return {};
  }
}

function getCurrentStoreId() {
  var user = getCurrentUser();
  if (user.store_id) return String(user.store_id);
  return localStorage.getItem('activeStoreId') || '';
}

function setCurrentStoreId(storeId) {
  var user = getCurrentUser();
  if (user.store_id) {
    localStorage.setItem('activeStoreId', String(user.store_id));
    return;
  }
  if (!storeId || storeId === 'all') {
    localStorage.removeItem('activeStoreId');
  } else {
    localStorage.setItem('activeStoreId', String(storeId));
  }
  if (window.onStoreChange) window.onStoreChange();
}

function api(method, path, body) {
  if (window.location.protocol === 'file:') {
    return Promise.reject(new Error('No server'));
  }
  var opts = {
    method: method,
    headers: { 'Content-Type': 'application/json' }
  };
  var token = getToken();
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body !== undefined) opts.body = JSON.stringify(body);

  return fetch(API_BASE + path, opts).then(function (r) {
    if (r.status === 403) {
      if (window.showToast) showToast('لا تملك صلاحية للقيام بهذه العملية أو الوصول لبيانات هذا المحل', 'error');
      throw new Error('HTTP 403 Forbidden');
    }
    if (r.status === 401) {
      localStorage.removeItem('adminLoggedIn');
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      window.location.href = 'login.html';
      throw new Error('HTTP 401 Unauthorized');
    }
    return r.json().then(function (data) {
      if (!r.ok) {
        var msg = data && data.error ? data.error : ('HTTP ' + r.status);
        if (window.showToast) showToast(msg, 'error');
        throw new Error(msg);
      }
      return data;
    });
  });
}

// Local cache helpers
function cacheGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
}
function cacheSet(key, arr) {
  localStorage.setItem(key, JSON.stringify(arr));
}
function cacheUpsert(key, item) {
  var arr = cacheGet(key);
  var i = arr.findIndex(function (x) { return String(x.id) === String(item.id); });
  if (i >= 0) arr[i] = item; else arr.push(item);
  cacheSet(key, arr);
  return arr;
}
function cacheRemove(key, id) {
  var arr = cacheGet(key).filter(function (x) { return String(x.id) !== String(id); });
  cacheSet(key, arr);
  return arr;
}
function cacheDelete(key, id) {
  return cacheRemove(key, id);
}

var DataStore = {
  _ready: false,

  init: function () {
    var storeId = getCurrentStoreId();
    var query = storeId ? '?store_id=' + storeId : '';

    return api('GET', '/all' + query).then(function (data) {
      cacheSet('stores', data.stores || []);
      cacheSet('products', data.products || []);
      cacheSet('products_trash', data.products_trash || []);
      cacheSet('orders', data.orders || []);
      cacheSet('customers', data.customers || []);
      cacheSet('partners', data.partners || []);
      cacheSet('quotes', data.quotes || []);
      cacheSet('users', data.users || []);
      DataStore._ready = true;
      return data;
    }).catch(function (err) {
      console.warn('DataStore.init using local cache:', err);
      DataStore._ready = true;
    });
  },

  refresh: function () {
    DataStore._ready = false;
    return this.init();
  },

  // ---- Stores (المحلات) ----
  getStores: function () { return cacheGet('stores'); },
  getStore: function (id) {
    return this.getStores().find(function (s) { return String(s.id) === String(id); });
  },
  addStore: function (store) {
    return api('POST', '/stores', store).then(function (saved) {
      cacheUpsert('stores', saved);
      return saved;
    });
  },
  updateStore: function (id, data) {
    return api('PUT', '/stores/' + id, data).then(function (saved) {
      cacheUpsert('stores', saved);
      return saved;
    });
  },
  toggleStore: function (id) {
    return api('PATCH', '/stores/' + id + '/toggle').then(function (r) {
      var stores = cacheGet('stores');
      var item = stores.find(function (s) { return String(s.id) === String(id); });
      if (item) { item.status = r.status; cacheSet('stores', stores); }
      return r;
    });
  },

  // ---- Products ----
  getProducts: function () { return cacheGet('products'); },
  getProduct: function (id) { return this.getProducts().find(function (p) { return p.id === id; }); },
  addProduct: function (product) {
    var item = Object.assign({ id: Date.now() }, product);
    cacheUpsert('products', item);
    return api('POST', '/products', product).then(function (saved) {
      cacheUpsert('products', saved);
      return saved;
    });
  },
  updateProduct: function (id, data) {
    var existing = this.getProduct(id) || {};
    var item = Object.assign({}, existing, data, { id: id });
    cacheUpsert('products', item);
    return api('PUT', '/products/' + id, data).then(function (saved) {
      cacheUpsert('products', saved);
      return saved;
    });
  },
  toggleProduct: function (id) {
    return api('PATCH', '/products/' + id + '/toggle').then(function (r) {
      var items = cacheGet('products');
      var item = items.find(function (p) { return String(p.id) === String(id); });
      if (item) { item.active = r.active; cacheSet('products', items); }
      return r;
    });
  },
  deleteProduct: function (id) {
    var prod = this.getProduct(id);
    cacheRemove('products', id);
    if (prod) {
      prod.is_deleted = 1;
      prod.deleted_at = new Date().toISOString();
      cacheUpsert('products_trash', prod);
    }
    return api('DELETE', '/products/' + id).then(function (r) {
      return r;
    });
  },
  getTrashProducts: function () {
    return cacheGet('products_trash');
  },
  restoreProduct: function (id) {
    var trashed = cacheGet('products_trash');
    var item = trashed.find(function (p) { return String(p.id) === String(id); });
    cacheRemove('products_trash', id);
    if (item) {
      item.is_deleted = 0;
      item.deleted_at = null;
      item.active = 1;
      item.publish_status = 'published';
      cacheUpsert('products', item);
    }
    return api('POST', '/products/' + id + '/restore').then(function (r) {
      return r;
    });
  },
  permanentDeleteProduct: function (id) {
    cacheRemove('products_trash', id);
    return api('DELETE', '/products/' + id + '/permanent').then(function (r) {
      return r;
    });
  },

  // ---- Store Inventory (مخزون المحلات والجرد) ----
  getStoreInventory: function (storeId) {
    var sId = storeId || getCurrentStoreId() || 1;
    return api('GET', '/inventory?store_id=' + sId);
  },
  getInventoryAlerts: function (storeId) {
    var sId = storeId || getCurrentStoreId();
    var q = sId ? '?store_id=' + sId : '';
    return api('GET', '/inventory/alerts' + q);
  },
  getInventoryTransactions: function (storeId, productId) {
    var q = [];
    if (storeId) q.push('store_id=' + storeId);
    if (productId) q.push('product_id=' + productId);
    var query = q.length > 0 ? '?' + q.join('&') : '';
    return api('GET', '/inventory/transactions' + query);
  },
  updateInventoryItem: function (id, data) {
    return api('PUT', '/inventory/' + id, data);
  },
  adjustInventory: function (adjustment) {
    return api('POST', '/inventory/adjust', adjustment);
  },

  // ---- Inter-Store Transfers (التحويل بين المحلين) ----
  getTransfers: function (storeId) {
    var sId = storeId || getCurrentStoreId();
    var q = sId ? '?store_id=' + sId : '';
    return api('GET', '/transfers' + q);
  },
  getTransfer: function (id) {
    return api('GET', '/transfers/' + id);
  },
  createTransfer: function (transferData) {
    return api('POST', '/transfers', transferData);
  },
  approveTransfer: function (id) {
    return api('POST', '/transfers/' + id + '/approve');
  },
  dispatchTransfer: function (id) {
    return api('POST', '/transfers/' + id + '/dispatch');
  },
  receiveTransfer: function (id, items) {
    return api('POST', '/transfers/' + id + '/receive', { items: items });
  },

  // ---- Invoices & Sales (المبيعات والفواتير والمرتجعات) ----
  getInvoices: function (storeId) {
    var sId = storeId || getCurrentStoreId();
    var q = sId ? '?store_id=' + sId : '';
    return api('GET', '/invoices' + q);
  },
  getInvoice: function (id) {
    return api('GET', '/invoices/' + id);
  },
  createInvoice: function (invoiceData) {
    return api('POST', '/invoices', invoiceData);
  },
  returnInvoice: function (invoiceId, returnData) {
    return api('POST', '/invoices/' + invoiceId + '/return', returnData);
  },

  // ---- Finances (المصروفات والمشتريات والمديونيات) ----
  getExpenses: function (storeId) {
    var sId = storeId || getCurrentStoreId();
    var q = sId ? '?store_id=' + sId : '';
    return api('GET', '/finances/expenses' + q);
  },
  addExpense: function (expenseData) {
    return api('POST', '/finances/expenses', expenseData);
  },
  getPurchases: function (storeId) {
    var sId = storeId || getCurrentStoreId();
    var q = sId ? '?store_id=' + sId : '';
    return api('GET', '/finances/purchases' + q);
  },
  addPurchase: function (purchaseData) {
    return api('POST', '/finances/purchases', purchaseData);
  },
  getDebts: function (storeId) {
    var sId = storeId || getCurrentStoreId();
    var q = sId ? '?store_id=' + sId : '';
    return api('GET', '/finances/debts' + q);
  },
  payDebt: function (paymentData) {
    return api('POST', '/finances/pay-debt', paymentData);
  },

  // ---- Real Reports & Analytics ----
  getDashboardReports: function (storeId) {
    var sId = storeId || getCurrentStoreId();
    var q = sId ? '?store_id=' + sId : '';
    return api('GET', '/reports/dashboard' + q);
  },
  getSalesReports: function (storeId) {
    var sId = storeId || getCurrentStoreId();
    var q = sId ? '?store_id=' + sId : '';
    return api('GET', '/reports/sales' + q);
  },

  // ---- Orders (Legacy Compatibility) ----
  getOrders: function () { return cacheGet('orders'); },
  getOrder: function (id) { return this.getOrders().find(function (o) { return o.id === id; }); },
  addOrder: function (order) {
    var item = Object.assign({ id: Date.now() }, order);
    cacheUpsert('orders', item);
    return api('POST', '/orders', order).then(function (saved) {
      cacheUpsert('orders', saved);
      return saved;
    });
  },
  updateOrder: function (id, data) {
    var existing = this.getOrder(id) || {};
    var item = Object.assign({}, existing, data, { id: id });
    cacheUpsert('orders', item);
    return api('PUT', '/orders/' + id, data).then(function (saved) {
      cacheUpsert('orders', saved);
      return saved;
    });
  },
  toggleOrder: function (id) {
    return api('PATCH', '/orders/' + id + '/toggle').then(function (r) {
      var items = cacheGet('orders');
      var item = items.find(function (o) { return String(o.id) === String(id); });
      if (item) { item.active = r.active; cacheSet('orders', items); }
      return r;
    });
  },

  // ---- Customers ----
  getCustomers: function () { return cacheGet('customers'); },
  getCustomer: function (id) { return this.getCustomers().find(function (c) { return c.id === id; }); },
  addCustomer: function (customer) {
    var item = Object.assign({ id: Date.now() }, customer);
    cacheUpsert('customers', item);
    return api('POST', '/customers', customer).then(function (saved) {
      cacheUpsert('customers', saved);
      return saved;
    });
  },
  updateCustomer: function (id, data) {
    var existing = this.getCustomer(id) || {};
    var item = Object.assign({}, existing, data, { id: id });
    cacheUpsert('customers', item);
    return api('PUT', '/customers/' + id, data).then(function (saved) {
      cacheUpsert('customers', saved);
      return saved;
    });
  },

  // ---- Partners ----
  getPartners: function () { return cacheGet('partners'); },
  getPartner: function (id) { return this.getPartners().find(function (p) { return p.id === id; }); },
  addPartner: function (partner) {
    var item = Object.assign({ id: Date.now() }, partner);
    cacheUpsert('partners', item);
    return api('POST', '/partners', partner).then(function (saved) {
      cacheUpsert('partners', saved);
      return saved;
    });
  },
  updatePartner: function (id, data) {
    var existing = this.getPartner(id) || {};
    var item = Object.assign({}, existing, data, { id: id });
    cacheUpsert('partners', item);
    return api('PUT', '/partners/' + id, data).then(function (saved) {
      cacheUpsert('partners', saved);
      return saved;
    });
  },

  // ---- Quotes ----
  getQuotes: function () { return cacheGet('quotes'); },
  getQuote: function (id) { return this.getQuotes().find(function (q) { return q.id === id; }); },
  addQuote: function (quote) {
    return api('POST', '/quotes', quote);
  },
  updateQuote: function (id, data) {
    var existing = this.getQuote(id) || {};
    var item = Object.assign({}, existing, data, { id: id });
    cacheUpsert('quotes', item);
    return api('PUT', '/quotes/' + id, data).then(function (saved) {
      cacheUpsert('quotes', saved);
      return saved;
    });
  },
  toggleQuote: function (id) {
    return api('PATCH', '/quotes/' + id + '/toggle').then(function (r) {
      var items = cacheGet('quotes');
      var item = items.find(function (q) { return String(q.id) === String(id); });
      if (item) { item.active = r.active; cacheSet('quotes', items); }
      return r;
    });
  },

  // ---- Users ----
  getUsers: function () { return cacheGet('users'); },
  getUser: function (id) { return this.getUsers().find(function (u) { return u.id === id; }); },
  addUser: function (user) {
    return api('POST', '/users', user).then(function (saved) {
      cacheUpsert('users', saved);
      return saved;
    });
  },
  updateUser: function (id, data) {
    return api('PUT', '/users/' + id, data).then(function (saved) {
      cacheUpsert('users', saved);
      return saved;
    });
  },
  toggleUser: function (id) {
    return api('PATCH', '/users/' + id + '/toggle').then(function (r) {
      var items = cacheGet('users');
      var item = items.find(function (u) { return String(u.id) === String(id); });
      if (item) { item.status = r.status; cacheSet('users', items); }
      return r;
    });
  },

  // ---- Stats & Helpers ----
  getStats: function (storeId) {
    var sId = storeId || getCurrentStoreId();
    var q = sId ? '?store_id=' + sId : '';
    return api('GET', '/stats' + q);
  },
  getRecentOrders: function (limit) {
    var orders = cacheGet('orders') || [];
    return orders.slice(0, limit || 5);
  },
  getTopProducts: function (limit) {
    var products = cacheGet('products') || [];
    return products.slice(0, limit || 5);
  }
};

