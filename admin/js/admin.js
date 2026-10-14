document.addEventListener('DOMContentLoaded', function() {
  try {
    // Authentication check
  var isLoggedIn = localStorage.getItem('adminLoggedIn');
  var token = localStorage.getItem('adminToken');

  if ((!isLoggedIn || !token) && !window.location.pathname.includes('login.html')) {
    window.location.href = 'login.html';
    return;
  }

  // Verify token against server
  if (isLoggedIn && token && !window.location.pathname.includes('login.html')) {
    if (window.location.protocol === 'file:') {
      loadUserInfo();
    } else {
      fetch('/api/me', {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      .then(function(r) {
        if (!r.ok) throw new Error('unauthorized');
        return r.json();
      })
      .then(function(data) {
        if (data.user) {
          localStorage.setItem('adminUser', JSON.stringify(data.user));
        }
        loadUserInfo();
      })
      .catch(function() {
        localStorage.removeItem('adminLoggedIn');
        localStorage.removeItem('adminToken');
        localStorage.removeItem('adminUser');
        localStorage.removeItem('adminRemember');
        window.location.href = 'login.html';
      });
    }
  }

  // Load user info with role translation & store info
  function loadUserInfo() {
    var userJson = localStorage.getItem('adminUser');
    if (userJson) {
      try {
        var user = JSON.parse(userJson);
        var roleNames = {
          'admin': 'المدير العام',
          'store_manager': 'مدير المحل',
          'cashier': 'موظف مبيعات',
          'inventory': 'مسؤول المخزون',
          'accountant': 'المحاسب المالي',
          'editor': 'محرر منتجات'
        };

        var userNameEl = document.querySelector('.sidebar-user-name');
        var userRoleEl = document.querySelector('.sidebar-user-role');
        var userAvatarEl = document.querySelector('.sidebar-user-avatar');

        if (userNameEl) userNameEl.textContent = user.name;
        if (userRoleEl) {
          var storeTxt = user.store_name ? ' (' + user.store_name + ')' : '';
          userRoleEl.textContent = (roleNames[user.role] || user.role) + storeTxt;
        }
        if (userAvatarEl) {
          var parts = user.name.split(' ');
          userAvatarEl.textContent = parts.map(function(p) { return p.charAt(0); }).join(' ');
        }
      } catch(e) {}
    }
  }
  loadUserInfo();

  // ---- Store Switcher in Topbar ----
  window.initStoreSelector = function() {
    var topbarLeft = document.querySelector('.topbar-left');
    if (!topbarLeft || document.getElementById('storeSelectorWrapper')) return;

    var user = getCurrentUser();
    var wrapper = document.createElement('div');
    wrapper.id = 'storeSelectorWrapper';
    wrapper.className = 'store-selector-wrapper';

    // If user is locked to a specific store
    if (user.store_id) {
      wrapper.innerHTML = '<i class="fas fa-store"></i><span>' + (user.store_name || ('محل #' + user.store_id)) + '</span><span class="badge" style="background:var(--primary);color:#fff;font-size:10px">مقيد بمحلك</span>';
      topbarLeft.insertBefore(wrapper, topbarLeft.firstChild);
      return;
    }

    // If user is Admin / General Manager: full store switcher
    wrapper.innerHTML = '<i class="fas fa-store-alt"></i><select id="globalStoreSelector" class="store-select-dropdown"><option value="all">🏢 جميع المحلات (إجمالي موحد)</option></select>';
    topbarLeft.insertBefore(wrapper, topbarLeft.firstChild);

    var select = document.getElementById('globalStoreSelector');

    // Populate stores from DataStore or API
    function populate(stores) {
      if (!stores || stores.length === 0) return;
      select.innerHTML = '<option value="all">🏢 جميع المحلات (إجمالي موحد)</option>';
      stores.forEach(function(s) {
        var opt = document.createElement('option');
        opt.value = String(s.id);
        opt.textContent = '🏪 ' + s.name + ' (' + s.code + ')';
        select.appendChild(opt);
      });

      var current = getCurrentStoreId();
      select.value = current || 'all';
    }

    if (window.DataStore && DataStore.getStores().length > 0) {
      populate(DataStore.getStores());
    } else {
      fetch('/api/stores', {
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('adminToken') || '') }
      }).then(function(r) { return r.json(); }).then(function(stores) {
        if (Array.isArray(stores)) populate(stores);
      }).catch(function() {});
    }

    select.addEventListener('change', function() {
      var val = select.value;
      setCurrentStoreId(val);
      if (window.showToast) {
        var txt = val === 'all' ? 'تم التبديل إلى العرض الموحد لجميع المحلات' : select.options[select.selectedIndex].textContent;
        showToast(txt, 'info');
      }
      setTimeout(function() {
        if (window.onStoreChange) window.onStoreChange();
        else window.location.reload();
      }, 200);
    });
  };

  setTimeout(initStoreSelector, 100);

  // ---- Navigation Sync & Multi-Store Menu ----
  window.syncSidebarNav = function() {
    var sidebarNav = document.querySelector('.sidebar-nav');
    if (!sidebarNav || document.getElementById('nav-stores')) return;

    var currentPage = window.location.pathname.split('/').pop() || 'index.html';

    var sectionsHtml = `
      <div class="nav-section">الرئيسية</div>
      <a class="nav-item ${currentPage === 'index.html' ? 'active' : ''}" data-page="index.html" href="index.html">
        <i class="fas fa-th-large"></i><span>لوحة التحكم</span>
      </a>

      <div class="nav-section">إدارة الفروع والمخزون</div>
      <a class="nav-item ${currentPage === 'stores.html' ? 'active' : ''}" id="nav-stores" data-page="stores.html" href="stores.html">
        <i class="fas fa-store-alt"></i><span>المحلات والفروع</span>
      </a>
      <a class="nav-item ${currentPage === 'products.html' ? 'active' : ''}" data-page="products.html" href="products.html">
        <i class="fas fa-boxes"></i><span>دليل الأصناف</span>
      </a>
      <a class="nav-item ${currentPage === 'inventory.html' ? 'active' : ''}" data-page="inventory.html" href="inventory.html">
        <i class="fas fa-warehouse"></i><span>مخزون المحلات والجرد</span>
      </a>
      <a class="nav-item ${currentPage === 'transfers.html' ? 'active' : ''}" data-page="transfers.html" href="transfers.html">
        <i class="fas fa-dolly"></i><span>التحويل بين المحلين</span>
      </a>

      <div class="nav-section">المبيعات والمالية</div>
      <a class="nav-item ${currentPage === 'invoices.html' ? 'active' : ''}" data-page="invoices.html" href="invoices.html">
        <i class="fas fa-cash-register"></i><span>المبيعات والفواتير</span>
      </a>
      <a class="nav-item ${currentPage === 'finances.html' ? 'active' : ''}" data-page="finances.html" href="finances.html">
        <i class="fas fa-wallet"></i><span>المصروفات والمشتريات</span>
      </a>
      <a class="nav-item ${currentPage === 'customers.html' ? 'active' : ''}" data-page="customers.html" href="customers.html">
        <i class="fas fa-users"></i><span>العملاء والمديونيات</span>
      </a>
      <a class="nav-item ${currentPage === 'quotes.html' ? 'active' : ''}" data-page="quotes.html" href="quotes.html">
        <i class="fas fa-file-invoice"></i><span>عروض الأسعار</span>
      </a>
      <a class="nav-item ${currentPage === 'partners.html' ? 'active' : ''}" data-page="partners.html" href="partners.html">
        <i class="fas fa-handshake"></i><span>الشركات والوكالات</span>
      </a>

      <div class="nav-section">التقارير والإدارة</div>
      <a class="nav-item ${currentPage === 'reports.html' ? 'active' : ''}" data-page="reports.html" href="reports.html">
        <i class="fas fa-chart-line"></i><span>التقارير المالية والأرباح</span>
      </a>
      <a class="nav-item ${currentPage === 'users.html' ? 'active' : ''}" data-page="users.html" href="users.html">
        <i class="fas fa-user-shield"></i><span>المستخدمين والصلاحيات</span>
      </a>
      <a class="nav-item ${currentPage === 'profile.html' ? 'active' : ''}" data-page="profile.html" href="profile.html">
        <i class="fas fa-id-card"></i><span>الملف الشخصي</span>
      </a>
      <a class="nav-item ${currentPage === 'settings.html' ? 'active' : ''}" data-page="settings.html" href="settings.html">
        <i class="fas fa-cog"></i><span>الإعدادات</span>
      </a>
    `;

    sidebarNav.innerHTML = sectionsHtml;
  };

  setTimeout(syncSidebarNav, 50);

  // ---- Permission System ----
  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('adminUser') || '{}');
    } catch(e) { return {}; }
  }

  window.hasPermission = function(resource, action) {
    var user = getCurrentUser();
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (!user.permissions) return false;
    var perms = user.permissions[resource];
    return perms ? perms.includes(action) : false;
  };

  window.canRead = function(resource) { return hasPermission(resource, 'read'); };
  window.canWrite = function(resource) { return hasPermission(resource, 'write'); };
  window.canDelete = function(resource) { return hasPermission(resource, 'delete'); };

  window.applyPermissions = function(resource) {
    document.querySelectorAll('[data-perm-read="' + resource + '"]').forEach(function(el) {
      el.style.display = canRead(resource) ? '' : 'none';
    });
    document.querySelectorAll('[data-perm-write="' + resource + '"]').forEach(function(el) {
      el.style.display = canWrite(resource) ? '' : 'none';
    });
    document.querySelectorAll('[data-perm-delete="' + resource + '"]').forEach(function(el) {
      el.style.display = canDelete(resource) ? '' : 'none';
    });
    document.querySelectorAll('[data-perm-disabled="' + resource + '"]').forEach(function(el) {
      el.disabled = !canWrite(resource);
      if (el.style) el.style.opacity = canWrite(resource) ? '1' : '0.5';
    });
  };

  // Apply sidebar navigation permissions
  window.applyNavPermissions = function() {
    var navMap = {
      'stores.html': 'manage_stores',
      'products.html': 'products',
      'inventory.html': 'inventory',
      'transfers.html': 'transfers',
      'invoices.html': 'invoices',
      'finances.html': 'expenses',
      'orders.html': 'orders',
      'quotes.html': 'quotes',
      'partners.html': 'partners',
      'customers.html': 'customers',
      'users.html': 'users',
      'settings.html': 'settings',
      'reports.html': 'reports',
      'profile.html': 'profile'
    };
    document.querySelectorAll('.nav-item[data-page]').forEach(function(item) {
      var page = item.getAttribute('data-page');
      var resource = navMap[page];
      if (resource && !canRead(resource)) {
        item.style.display = 'none';
      }
    });

    var currentPage = window.location.pathname.split('/').pop() || 'index.html';
    var currentResource = navMap[currentPage];
    if (currentResource && !canRead(currentResource)) {
      window.location.href = 'index.html';
      return;
    }
  };

  const sidebar = document.querySelector('.sidebar');
  const toggleBtn = document.querySelector('.toggle-sidebar-btn');
  const darkToggle = document.getElementById('darkModeToggle');
  const notificationsBtn = document.getElementById('notificationsBtn');
  const notificationsDropdown = document.getElementById('notificationsDropdown');
  const userBtn = document.getElementById('userBtn');
  const userDropdown = document.getElementById('userDropdown');
  const mobileOverlay = document.getElementById('mobileOverlay');

  // Sidebar Toggle
  if (toggleBtn) {
    toggleBtn.addEventListener('click', function() {
      var icon = toggleBtn.querySelector('i');
      if (window.innerWidth <= 768) {
        sidebar.classList.toggle('mobile-open');
        if (mobileOverlay) mobileOverlay.classList.toggle('show');
        if (icon) {
          if (sidebar.classList.contains('mobile-open')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
          } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
          }
        }
      } else {
        sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
        if (icon) {
          if (sidebar.classList.contains('collapsed')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-indent');
          } else {
            icon.classList.remove('fa-indent');
            icon.classList.add('fa-bars');
          }
        }
      }
    });
  }

  // Mobile overlay close
  if (mobileOverlay) {
    mobileOverlay.addEventListener('click', function() {
      sidebar.classList.remove('mobile-open');
      mobileOverlay.classList.remove('show');
      if (toggleBtn) {
        var icon = toggleBtn.querySelector('i');
        if (icon) {
          icon.classList.remove('fa-times');
          icon.classList.add('fa-bars');
        }
      }
    });
  }

  // Restore sidebar state
  if (localStorage.getItem('sidebarCollapsed') === 'true' && window.innerWidth > 768) {
    sidebar.classList.add('collapsed');
  }

  // Dark Mode
  if (darkToggle) {
    const isDark = localStorage.getItem('adminDarkMode') === 'true';
    if (isDark) {
      document.body.classList.add('dark-mode');
      darkToggle.checked = true;
    }

    darkToggle.addEventListener('change', function() {
      document.body.classList.toggle('dark-mode');
      localStorage.setItem('adminDarkMode', document.body.classList.contains('dark-mode'));
    });
  }

  // Notifications Dropdown
  if (notificationsBtn && notificationsDropdown) {
    notificationsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      notificationsDropdown.classList.toggle('show');
      if (userDropdown) userDropdown.classList.remove('show');
    });
  }

  // User Dropdown
  if (userBtn && userDropdown) {
    userBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      userDropdown.classList.toggle('show');
      if (notificationsDropdown) notificationsDropdown.classList.remove('show');
    });
  }

  // Close dropdowns on outside click
  document.addEventListener('click', function() {
    if (notificationsDropdown) notificationsDropdown.classList.remove('show');
    if (userDropdown) userDropdown.classList.remove('show');
  });

  // Sidebar user click → profile
  document.querySelectorAll('.sidebar-user').forEach(function(el) {
    el.addEventListener('click', function() {
      window.location.href = 'profile.html';
    });
    el.style.cursor = 'pointer';
  });

  // Dropdown actions
  document.querySelectorAll('[data-action="logout"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      localStorage.removeItem('adminLoggedIn');
      localStorage.removeItem('adminUser');
      localStorage.removeItem('adminRemember');
      localStorage.removeItem('adminToken');
      window.location.href = 'login.html';
    });
  });
  document.querySelectorAll('[data-action="profile"]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      window.location.href = 'profile.html';
    });
  });

  // ---- Notification System ----
  function getReadNotifs() {
    try { return JSON.parse(localStorage.getItem('_readNotifs') || '[]'); } catch(e) { return []; }
  }
  function saveReadNotifs(ids) { localStorage.setItem('_readNotifs', JSON.stringify(ids)); }

  function getTimeAgo(date) {
    var seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'الآن';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return 'منذ ' + minutes + ' دقيقة';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return 'منذ ' + hours + ' ساعة';
    var days = Math.floor(hours / 24);
    return 'منذ ' + days + ' يوم';
  }

  window.loadNotifications = function() {
    var notifs = [];
    var readIds = getReadNotifs();

    var products = DataStore.getProducts ? DataStore.getProducts() : [];
    var orders = DataStore.getOrders ? DataStore.getOrders() : [];
    var quotes = DataStore.getQuotes ? DataStore.getQuotes() : [];

    // New quotes
    quotes.filter(function(q) { return q.active !== 0 && q.status === 'new'; }).forEach(function(q) {
      notifs.push({
        id: 'quote-' + q.id,
        type: 'quote',
        link: 'quotes.html?highlight=quote-' + q.id,
        icon: 'fa-file-invoice',
        iconBg: 'rgba(255,193,7,0.1)',
        iconColor: 'var(--warning)',
        title: 'طلب عرض سعر جديد',
        desc: q.name + (q.product ? ' - ' + q.product : ''),
        time: getTimeAgo(new Date(q.date || q.created_at))
      });
    });

    // Pending orders
    orders.filter(function(o) { return o.status === 'pending' || o.status === 'processing'; }).forEach(function(o) {
      notifs.push({
        id: 'order-' + o.id,
        type: 'order',
        link: 'orders.html?highlight=order-' + o.id,
        icon: 'fa-shopping-cart',
        iconBg: 'rgba(13,110,253,0.1)',
        iconColor: 'var(--primary)',
        title: o.status === 'pending' ? 'طلب جديد' : 'طلب قيد التنفيذ',
        desc: '#' + o.id + ' - ' + (o.customer || o.customer_name || ''),
        time: getTimeAgo(new Date(o.date || o.created_at))
      });
    });

    // Low stock products
    products.filter(function(p) { return p.status === 'مخزون منخفض' && p.active !== 0; }).forEach(function(p) {
      notifs.push({
        id: 'product-' + p.id,
        type: 'product',
        link: 'products.html?highlight=product-' + p.id,
        icon: 'fa-exclamation-triangle',
        iconBg: 'rgba(220,53,69,0.1)',
        iconColor: 'var(--danger)',
        title: 'مخزون منخفض',
        desc: p.name + ' - ' + (p.stock || 0) + ' قطعة',
        time: ''
      });
    });

    notifs.sort(function(a, b) {
      if (a.time === '' && b.time !== '') return -1;
      if (b.time === '' && a.time !== '') return 1;
      if (a.type === 'product' && b.type !== 'product') return -1;
      if (b.type === 'product' && a.type !== 'product') return 1;
      return 0;
    });

    var totalUnread = notifs.filter(function(n) { return readIds.indexOf(n.id) === -1; }).length;
    var notifBadge = document.getElementById('notifCount');
    if (notifBadge) {
      notifBadge.textContent = notifs.length;
      notifBadge.style.display = notifs.length > 0 ? 'flex' : 'none';
    }

    // Update sidebar quotes badge
    var quotesBadge = document.getElementById('quotesBadge');
    if (quotesBadge) {
      var newQuotesCount = notifs.filter(function(n) { return n.type === 'quote'; }).length;
      quotesBadge.textContent = newQuotesCount;
      quotesBadge.style.display = newQuotesCount > 0 ? 'inline' : 'none';
    }

    // Update sidebar orders badge
    var ordersBadge = document.getElementById('ordersBadge');
    if (ordersBadge) {
      var pendingOrdersCount = notifs.filter(function(n) { return n.type === 'order'; }).length;
      ordersBadge.textContent = pendingOrdersCount;
      ordersBadge.style.display = pendingOrdersCount > 0 ? 'inline' : 'none';
    }

    var dropdown = document.getElementById('notificationsDropdown');
    if (!dropdown) return;

    var header = dropdown.querySelector('.notifications-header');
    var listHtml = '';
    if (notifs.length === 0) {
      listHtml = '<div style="padding:24px;text-align:center;color:var(--text-secondary);font-size:13px">لا توجد إشعارات</div>';
    } else {
      notifs.slice(0, 10).forEach(function(n) {
        var isRead = readIds.indexOf(n.id) !== -1;
        listHtml += '<div class="notification-item' + (isRead ? '' : ' notif-unread') + '" data-notif-id="' + n.id + '" data-link="' + n.link + '" onclick="window.clickNotif(this)">' +
          '<div class="notif-icon" style="background:' + n.iconBg + ';color:' + n.iconColor + '"><i class="fas ' + n.icon + '"></i></div>' +
          '<div style="flex:1"><div class="notif-text">' + n.title + (n.desc ? '<br><strong>' + n.desc + '</strong>' : '') + '</div>' +
          (n.time ? '<div class="notif-time">' + n.time + '</div>' : '') + '</div></div>';
      });
    }
    if (header) {
      var markAll = header.querySelector('.mark-all-read');
      if (markAll) markAll.style.display = notifs.length > 0 ? 'inline' : 'none';
    }
    var listContainer = dropdown.querySelector('#notificationsList');
    if (!listContainer) {
      listContainer = document.createElement('div');
      listContainer.id = 'notificationsList';
      if (header) header.parentNode.insertBefore(listContainer, header.nextSibling);
      else dropdown.insertBefore(listContainer, dropdown.firstChild);
    }
    listContainer.innerHTML = listHtml;
  };

  window.clickNotif = function(el) {
    var id = el.getAttribute('data-notif-id');
    var link = el.getAttribute('data-link');
    if (id) {
      var read = getReadNotifs();
      if (read.indexOf(id) === -1) {
        read.push(id);
        saveReadNotifs(read);
      }
    }
    if (link) window.location.href = link;
  };

  window.markAllRead = function() {
    var items = document.querySelectorAll('.notification-item[data-notif-id]');
    var read = getReadNotifs();
    items.forEach(function(el) {
      var id = el.getAttribute('data-notif-id');
      if (id && read.indexOf(id) === -1) {
        read.push(id);
        el.classList.remove('notif-unread');
      }
    });
    saveReadNotifs(read);
    var badge = document.getElementById('notifCount');
    if (badge) badge.textContent = '0';
    if (badge) badge.style.display = 'none';
  };

  window.loadNotifications();
  window.handleHighlight = function() {
    var match = window.location.href.match(/[?&]highlight=(\w+)-(\d+)/);
    if (!match) return;
    var type = match[1];
    var id = match[2];
    setTimeout(function() {
      var row = document.querySelector('tr[data-id="' + type + '-' + id + '"]');
      if (row) {
        row.classList.add('row-highlight');
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 300);
  };

  // Auto-refresh notifications

  // Auto-refresh notifications
  setInterval(window.loadNotifications, 15000);

  // Refresh after DataStore init
  if (window.DataStore && DataStore.init) {
    DataStore.init().then(window.loadNotifications).catch(function(err) {
      console.warn('DataStore.init in admin.js:', err);
    });
  }

  // Active nav item highlighting
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-item[data-page]').forEach(function(item) {
    item.classList.remove('active');
    if (item.dataset.page === currentPage) {
      item.classList.add('active');
    }
  });

  // Nav item click handling
  document.querySelectorAll('.nav-item[data-page]').forEach(function(item) {
    item.addEventListener('click', function() {
      const page = this.dataset.page;
      if (page) {
        window.location.href = page;
      }
    });
  });

  // Modal functions
  window.openModal = function(id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.add('show');
  };

  window.closeModal = function(id) {
    var modal = document.getElementById(id);
    if (modal) modal.classList.remove('show');
  };

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(function(overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        overlay.classList.remove('show');
      }
    });
  });

  // Table row selection
  document.querySelectorAll('.select-row').forEach(function(checkbox) {
    checkbox.addEventListener('change', function() {
      const row = this.closest('tr');
      if (row) {
        row.style.background = this.checked ? 'rgba(13,110,253,0.05)' : '';
      }
      updateBulkActions();
    });
  });

  // Select all checkbox
  var selectAll = document.getElementById('selectAll');
  if (selectAll) {
    selectAll.addEventListener('change', function() {
      document.querySelectorAll('.select-row').forEach(function(cb) {
        cb.checked = selectAll.checked;
        var row = cb.closest('tr');
        if (row) row.style.background = selectAll.checked ? 'rgba(13,110,253,0.05)' : '';
      });
      updateBulkActions();
    });
  }

  function updateBulkActions() {
    var checked = document.querySelectorAll('.select-row:checked').length;
    var bulkBar = document.getElementById('bulkActions');
    if (bulkBar) {
      bulkBar.style.display = checked > 0 ? 'flex' : 'none';
      var countEl = document.getElementById('selectedCount');
      if (countEl) countEl.textContent = checked;
    }
  }

  // Delete confirmation
  window.confirmDelete = function(name, callback) {
    var confirmed = confirm('هل أنت متأكد من حذف "' + name + '"؟');
    if (confirmed && callback) callback();
  };

  // Toast notification
  window.showToast = function(message, type) {
    type = type || 'success';
    var icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
    var colors = { success: '#10b981', error: '#dc2626', info: '#06b6d4' };
    var c = colors[type];
    var toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#fff;color:#1a1a2e;border-radius:10px;font-size:13px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.18);animation:toastIn 0.35s ease;display:flex;align-items:center;gap:0;min-width:280px;max-width:420px;overflow:hidden;border-right:4px solid ' + c + ';direction:rtl;font-family:inherit';
    toast.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:' + c + '20;color:' + c + ';flex-shrink:0;margin:12px 12px 12px 12px"><i class="fas ' + (icons[type] || 'fa-check-circle') + '" style="font-size:16px"></i></div><div style="flex:1;padding:12px 0;font-weight:500;line-height:1.4">' + message + '</div><div class="toast-progress" style="position:absolute;bottom:0;left:0;height:3px;background:' + c + ';animation:toastProgress 3s linear forwards"></div>';
    document.body.appendChild(toast);
    setTimeout(function() {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  };

  // Auto-hide alerts
  document.querySelectorAll('.alert-dismissible').forEach(function(alert) {
    setTimeout(function() {
      alert.style.opacity = '0';
      alert.style.transition = 'opacity 0.3s';
      setTimeout(function() { alert.remove(); }, 300);
    }, 5000);
  });

  // Format numbers
  window.formatNumber = function(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  // Format currency
  window.formatCurrency = function(amount) {
    return formatNumber(amount) + ' ر.ي';
  };

  // Date formatting
  window.formatDate = function(dateStr) {
    var d = new Date(dateStr);
    var months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  };

  window.formatDateTime = function(dateStr) {
    var d = new Date(dateStr);
    return formatDate(dateStr) + ' ' + d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
  };

  // Print table
  window.printTable = function() {
    window.print();
  };

  // Export CSV
  window.exportCSV = function(tableId, filename) {
    var table = document.getElementById(tableId);
    if (!table) return;
    var rows = [];
    table.querySelectorAll('tr').forEach(function(tr) {
      var cols = [];
      tr.querySelectorAll('th, td').forEach(function(cell) {
        cols.push('"' + cell.textContent.trim().replace(/"/g, '""') + '"');
      });
      rows.push(cols.join(','));
    });
    var csv = rows.join('\n');
    var BOM = '\uFEFF';
    var blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = (filename || 'export') + '.csv';
    link.click();
    showToast('تم التصدير بنجاح');
  };

  // Simple Chart rendering helpers
  window.renderBarChart = function(canvasId, data, options) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    var W = rect.width;
    var H = rect.height;
    var padding = { top: 20, right: 20, bottom: 40, left: 50 };
    var chartW = W - padding.left - padding.right;
    var chartH = H - padding.top - padding.bottom;

    var values = data.map(function(d) { return d.value; });
    var maxVal = Math.max.apply(null, values) * 1.1;
    var barW = (chartW / data.length) * 0.6;
    var gap = (chartW / data.length) * 0.4;

    // Grid lines
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border-color') || '#e2e8f0';
    ctx.lineWidth = 0.5;
    for (var i = 0; i <= 4; i++) {
      var y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(W - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary') || '#6c757d';
      ctx.font = '11px Segoe UI';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal - (maxVal / 4) * i).toLocaleString(), padding.left - 8, y + 4);
    }

    // Bars
    var isDark = document.body.classList.contains('dark-mode');
    var colors = data.map(function(d) { return d.color || (isDark ? '#79c0ff' : '#0284c7'); });

    data.forEach(function(d, i) {
      var x = padding.left + (chartW / data.length) * i + gap / 2;
      var barH = (d.value / maxVal) * chartH;
      var y = padding.top + chartH - barH;

      ctx.fillStyle = colors[i];
      ctx.beginPath();
      var r = 4;
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + barW - r, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r);
      ctx.lineTo(x + barW, padding.top + chartH);
      ctx.lineTo(x, padding.top + chartH);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.fill();

      // Label
      ctx.fillStyle = isDark ? '#94a3b8' : '#6c757d';
      ctx.font = '11px Segoe UI';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x + barW / 2, H - padding.bottom + 20);
    });
  };

  window.renderLineChart = function(canvasId, data, options) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    var W = rect.width;
    var H = rect.height;
    var padding = { top: 20, right: 20, bottom: 40, left: 50 };
    var chartW = W - padding.left - padding.right;
    var chartH = H - padding.top - padding.bottom;

    var values = data.map(function(d) { return d.value; });
    var maxVal = Math.max.apply(null, values) * 1.1;
    var isDark = document.body.classList.contains('dark-mode');

    // Grid
    ctx.strokeStyle = isDark ? '#334155' : '#e2e8f0';
    ctx.lineWidth = 0.5;
    for (var i = 0; i <= 4; i++) {
      var y = padding.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(W - padding.right, y);
      ctx.stroke();

      ctx.fillStyle = isDark ? '#94a3b8' : '#6c757d';
      ctx.font = '11px Segoe UI';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(maxVal - (maxVal / 4) * i).toLocaleString(), padding.left - 8, y + 4);
    }

    // Line
    var lineColor = options && options.color ? options.color : (isDark ? '#79c0ff' : '#0284c7');
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();

    var points = [];
    data.forEach(function(d, i) {
      var x = padding.left + (chartW / (data.length - 1)) * i;
      var yy = padding.top + chartH - (d.value / maxVal) * chartH;
      points.push({ x: x, y: yy });
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    });
    ctx.stroke();

    // Fill gradient
    var gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    gradient.addColorStop(0, lineColor + '30');
    gradient.addColorStop(1, lineColor + '05');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(points[0].x, padding.top + chartH);
    points.forEach(function(p) { ctx.lineTo(p.x, p.y); });
    ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
    ctx.fill();

    // Dots + labels
    points.forEach(function(p, i) {
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = isDark ? '#0f172a' : '#fff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isDark ? '#94a3b8' : '#6c757d';
      ctx.font = '11px Segoe UI';
      ctx.textAlign = 'center';
      ctx.fillText(data[i].label, p.x, H - padding.bottom + 20);
    });
  };

  window.renderDoughnutChart = function(canvasId, data) {
    var canvas = document.getElementById(canvasId);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    var W = rect.width;
    var H = rect.height;
    var cx = W / 2;
    var cy = H / 2;
    var radius = Math.min(cx, cy) - 20;
    var innerRadius = radius * 0.6;

    var total = data.reduce(function(s, d) { return s + d.value; }, 0);
    var startAngle = -Math.PI / 2;

    data.forEach(function(d) {
      var sliceAngle = (d.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
      ctx.arc(cx, cy, innerRadius, startAngle + sliceAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();
      startAngle += sliceAngle;
    });

    // Center text
    var isDark = document.body.classList.contains('dark-mode');
    ctx.fillStyle = isDark ? '#e2e8f0' : '#1a1a2e';
    ctx.font = 'bold 20px Segoe UI';
    ctx.textAlign = 'center';
    ctx.fillText(total.toLocaleString(), cx, cy + 4);
    ctx.fillStyle = isDark ? '#94a3b8' : '#6c757d';
    ctx.font = '11px Segoe UI';
    ctx.fillText('إجمالي', cx, cy + 20);
  };

  // Resize handler for charts
  var chartResizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(function() {
      if (typeof window.redrawCharts === 'function') {
        window.redrawCharts();
      }
    }, 250);
  });

  // Product image preview
  window.previewImage = function(input, previewId) {
    var preview = document.getElementById(previewId);
    if (preview && input.files && input.files[0]) {
      var reader = new FileReader();
      reader.onload = function(e) {
        preview.src = e.target.result;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(input.files[0]);
    }
  };

  // Search filter for tables
  window.filterTable = function(searchId, tableId) {
    var searchInput = document.getElementById(searchId);
    var table = document.getElementById(tableId);
    if (!searchInput || !table) return;

    var filter = searchInput.value.toLowerCase();
    table.querySelectorAll('tbody tr').forEach(function(row) {
      var text = row.textContent.toLowerCase();
      row.style.display = text.includes(filter) ? '' : 'none';
    });
  };

  // Apply sidebar navigation permissions on page load
  if (typeof applyNavPermissions === 'function') {
    applyNavPermissions();
  }

  } catch (e) {
    console.error('❌ admin.js error:', e);
    if (window.showToast) showToast('حدث خطأ: ' + e.message, 'error');
  }
});

// ============================================================
//  Pagination Utility
// ============================================================
window.createPagination = function(containerId, currentPage, totalPages, onPageChange) {
  var container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (totalPages <= 1) { container.style.display = 'none'; return; }
  container.style.display = 'flex';

  var html = '<button class="pagination-btn" ' + (currentPage === 1 ? 'disabled' : '') + ' data-page="' + (currentPage - 1) + '"><i class="fas fa-chevron-right"></i></button>';
  for (var i = 1; i <= totalPages; i++) {
    html += '<button class="pagination-btn ' + (i === currentPage ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';
  }
  html += '<button class="pagination-btn" ' + (currentPage === totalPages ? 'disabled' : '') + ' data-page="' + (currentPage + 1) + '"><i class="fas fa-chevron-left"></i></button>';
  container.innerHTML = html;

  container.querySelectorAll('.pagination-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var page = parseInt(this.dataset.page);
      if (page && page >= 1 && page <= totalPages) {
        onPageChange(page);
      }
    });
  });
};

window.renderPaginatedTable = function(allRows, tbodySelector, paginationId, currentPage, perPage, renderRow) {
  var totalPages = Math.ceil(allRows.length / perPage);
  if (currentPage > totalPages) currentPage = totalPages || 1;
  var start = (currentPage - 1) * perPage;
  var pageRows = allRows.slice(start, start + perPage);
  var tbody = document.querySelector(tbodySelector);
  if (tbody) tbody.innerHTML = pageRows.map(renderRow).join('');
  createPagination(paginationId, currentPage, totalPages, function(page) {
    renderPaginatedTable(allRows, tbodySelector, paginationId, page, perPage, renderRow);
  });
  return { currentPage: currentPage, totalPages: totalPages, total: allRows.length };
};
