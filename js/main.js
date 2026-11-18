/* ========================================
   New Tech Medical - Main JavaScript
   ======================================== */

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize all components
    initLoader();
    initHeader();
    initMobileMenu();
    initScrollAnimations();
    initCountUp();
    initCookieConsent();
    initScrollToTop();
    initContactForm();
    initQuoteForm();
    initDarkMode();
    initLanguageToggle();
    initBrokenImages();
    initCardTilt();
    initHeroParallax();
    initLogoTilt();
    initOrderForm();
    updateCartBadge();
    if (document.getElementById('homeProductsGrid')) loadHomeProducts();
    if (document.getElementById('homePartnersTrack')) loadHomePartners();
    if (document.getElementById('productsGrid')) loadAllProducts();
    if (document.getElementById('partnersContainer')) loadAllPartners();
    startAutoRefresh();
});

/* ========================================
   Broken Images Handler
   ======================================== */
function handleBrokenImage(img) {
    if (img.dataset.brokenHandled) return;
    img.dataset.brokenHandled = 'true';
    img.onerror = function() {
        this.onerror = null;
        this.style.display = 'none';
        var placeholder = document.createElement('div');
        placeholder.style.cssText = 'display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:linear-gradient(135deg,#f0f7ff,#e3f2fd);border-radius:8px;';
        placeholder.innerHTML = '<div style="text-align:center;"><i class="fas fa-image" style="font-size:48px;color:#adb5bd;"></i><p style="color:#6c757d;margin-top:8px;font-size:12px;">' + this.alt + '</p></div>';
        this.parentElement.appendChild(placeholder);
    };
}

function initBrokenImages() {
    document.querySelectorAll('.product-image img').forEach(handleBrokenImage);

    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) {
                    var imgs = node.matches && node.matches('.product-image img') ? [node] : [];
                    if (imgs.length === 0 && node.querySelectorAll) {
                        imgs = node.querySelectorAll('.product-image img');
                    }
                    imgs.forEach(handleBrokenImage);
                }
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

/* ========================================
   Loader
   ======================================== */
function initLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        window.addEventListener('load', function() {
            setTimeout(function() {
                loader.classList.add('hidden');
            }, 500);
        });
        
        // Fallback - hide loader after 3 seconds even if load event hasn't fired
        setTimeout(function() {
            loader.classList.add('hidden');
        }, 3000);
    }
}

/* ========================================
   Header Scroll Effect
   ======================================== */
function initHeader() {
    const header = document.getElementById('header');
    if (header) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 20) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        });
    }
}

/* ========================================
   Mobile Menu with Scroll Lock & Backdrop
   ======================================== */
function initMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navMenu = document.getElementById('navMenu');
    
    if (!mobileMenuBtn || !navMenu) return;

    // Ensure backdrop exists in the DOM
    let backdrop = document.getElementById('mobileNavBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'mobileNavBackdrop';
        backdrop.className = 'mobile-nav-backdrop';
        document.body.appendChild(backdrop);
    }

    function preventTouchScroll(e) {
        if (!navMenu.contains(e.target)) {
            e.preventDefault();
        }
    }

    function openMenu() {
        navMenu.classList.add('active');
        backdrop.classList.add('active');
        document.body.classList.add('menu-open');
        document.documentElement.classList.add('menu-open');

        const icon = mobileMenuBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
        }
        mobileMenuBtn.setAttribute('aria-expanded', 'true');
        document.addEventListener('touchmove', preventTouchScroll, { passive: false });
    }

    function closeMenu() {
        navMenu.classList.remove('active');
        backdrop.classList.remove('active');
        document.body.classList.remove('menu-open');
        document.documentElement.classList.remove('menu-open');

        const icon = mobileMenuBtn.querySelector('i');
        if (icon) {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('touchmove', preventTouchScroll);
    }

    // Toggle button click
    mobileMenuBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (navMenu.classList.contains('active')) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    // Close when clicking on backdrop
    backdrop.addEventListener('click', closeMenu);

    // Close menu when clicking on any navigation link
    const navLinks = navMenu.querySelectorAll('a');
    navLinks.forEach(function(link) {
        link.addEventListener('click', closeMenu);
    });

    // Close on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && navMenu.classList.contains('active')) {
            closeMenu();
        }
    });

    // Close if resized to desktop breakpoint
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768 && navMenu.classList.contains('active')) {
            closeMenu();
        }
    });
}

/* ========================================
   Scroll Animations
   ======================================== */
function initScrollAnimations() {
    const animatedElements = document.querySelectorAll('.fade-in, .slide-in-left, .slide-in-right');
    
    if (animatedElements.length > 0) {
        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });
        
        animatedElements.forEach(function(element) {
            observer.observe(element);
        });
    }
}

/* ========================================
   Count Up Animation
   ======================================== */
function initCountUp() {
    const statNumbers = document.querySelectorAll('.stat-number');
    
    if (statNumbers.length > 0) {
        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    const target = parseInt(entry.target.getAttribute('data-target'));
                    animateCount(entry.target, target);
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.5
        });
        
        statNumbers.forEach(function(stat) {
            observer.observe(stat);
        });
    }
}

function animateCount(element, target) {
    let current = 0;
    const increment = target / 50;
    const duration = 2000;
    const stepTime = duration / 50;
    
    const timer = setInterval(function() {
        current += increment;
        if (current >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(current);
        }
    }, stepTime);
}

/* ========================================
   Cookie Consent
   ======================================== */
function initCookieConsent() {
    // Disabled per user request
    return;
}

function acceptCookies() {
    const cookieConsent = document.getElementById('cookieConsent');
    if (cookieConsent) {
        cookieConsent.classList.remove('show');
        localStorage.setItem('cookiesAccepted', 'true');
    }
}

// Make function globally available
window.acceptCookies = acceptCookies;

/* ========================================
   Scroll to Top with Dynamic Progress
   ======================================== */
function initScrollToTop() {
    const scrollTopBtn = document.getElementById('scrollTop');
    
    if (scrollTopBtn) {
        function updateScroll() {
            const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const progress = docHeight > 0 ? (scrollY / docHeight) * 100 : 0;
            const clamped = Math.min(100, Math.max(0, Math.round(progress)));
            
            scrollTopBtn.style.setProperty('--scroll-progress', clamped + '%');
            
            if (scrollY > 120) {
                scrollTopBtn.classList.add('visible');
            } else {
                scrollTopBtn.classList.remove('visible');
            }
        }

        window.addEventListener('scroll', updateScroll, { passive: true });
        updateScroll();
        
        scrollTopBtn.addEventListener('click', function() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
}

/* ========================================
   Contact Form
   ======================================== */
function initContactForm() {
    const contactForm = document.getElementById('contactForm');
    
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(contactForm);
            const data = {};
            formData.forEach(function(value, key) {
                data[key] = value;
            });
            
            if (!data.name || !data.email || !data.phone || !data.message) {
                alert(typeof t === 'function' ? t('alert_fill_required') : 'يرجى ملء جميع الحقول المطلوبة');
                return;
            }
            
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalHtml = submitBtn.innerHTML;
            const isEn = document.documentElement.lang === 'en';
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (isEn ? 'Sending...' : 'جاري الإرسال...');
            submitBtn.disabled = true;

            const contactData = {
                name: data.name,
                email: data.email,
                phone: data.phone,
                product: (contactForm.querySelector('#subject') || {}).value || (data.company ? data.company : 'استفسار عام'),
                message: (data.company ? '[منشأة: ' + data.company + '] ' : '') + data.message,
                status: 'new'
            };
            
            fetch('/api/quotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(contactData)
            }).then(function(r) {
                if (!r.ok) throw new Error('Failed to send contact request');
                return r.json();
            }).then(function() {
                alert(typeof t === 'function' ? t('alert_contact_success') : 'تم إرسال رسالتك بنجاح! سنتواصل معك قريباً.');
                contactForm.reset();
            }).catch(function(err) {
                console.error('Contact submit error:', err);
                alert(typeof t === 'function' ? t('alert_error') : 'حدث خطأ أثناء الإرسال، يرجى المحاولة لاحقاً');
            }).finally(function() {
                submitBtn.innerHTML = originalHtml;
                submitBtn.disabled = false;
            });
        });
    }
}

/* ========================================
   Quote Modal
   ======================================== */
function openQuoteModal(productName) {
    const modal = document.getElementById('quoteModal');
    const productNameElement = document.getElementById('quoteProductName');
    const isEn = document.documentElement.lang === 'en';
    
    if (modal && productNameElement) {
        productNameElement.textContent = (isEn ? 'Product: ' : 'المنتج المطلوب: ') + productName;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeQuoteModal() {
    const modal = document.getElementById('quoteModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Make functions globally available
window.openQuoteModal = openQuoteModal;
window.closeQuoteModal = closeQuoteModal;

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('quoteModal');
    if (modal && e.target === modal) {
        closeQuoteModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeQuoteModal();
    }
});

/* ========================================
   Quote Form
   ======================================== */
function initQuoteForm() {
    const quoteForm = document.getElementById('quoteForm');
    
    if (quoteForm) {
        quoteForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const formData = new FormData(quoteForm);
            const data = {};
            formData.forEach(function(value, key) {
                data[key] = value;
            });
            
            if (!data.quoteName || !data.quoteEmail || !data.quotePhone) {
                alert(typeof t === 'function' ? t('alert_fill_required') : 'يرجى ملء جميع الحقول المطلوبة');
                return;
            }
            
            const submitBtn = quoteForm.querySelector('button[type="submit"]');
            const originalHtml = submitBtn.innerHTML;
            const isEn = document.documentElement.lang === 'en';
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (isEn ? 'Sending...' : 'جاري الإرسال...');
            submitBtn.disabled = true;
            
            var productName = (document.getElementById('quoteProductName')?.textContent || '')
                .replace(/^المنتج المطلوب:\s*/, '')
                .replace(/^المنتج:\s*/, '')
                .replace(/^Product:\s*/, '')
                .trim() || 'طلب عام';

            var newQuote = {
                name: data.quoteName,
                email: data.quoteEmail,
                phone: data.quotePhone,
                product: productName,
                message: data.quoteMessage || ''
            };

            fetch('/api/quotes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newQuote)
            }).then(function(r) {
                if (!r.ok) throw new Error('Failed to submit quote');
                return r.json();
            }).then(function() {
                alert(typeof t === 'function' ? t('alert_quote_success') : 'تم إرسال طلب عرض السعر بنجاح! سنتواصل معك قريباً.');
                quoteForm.reset();
                closeQuoteModal();
            }).catch(function(err) {
                console.error('Quote submit error:', err);
                alert(typeof t === 'function' ? t('alert_error') : 'حدث خطأ أثناء إرسال طلب عرض السعر');
            }).finally(function() {
                submitBtn.innerHTML = originalHtml;
                submitBtn.disabled = false;
            });
        });
    }
}

/* ========================================
   Cart / Order System
   ======================================== */
function getCart() {
  try { return JSON.parse(localStorage.getItem('orderCart') || '[]'); } catch(e) { return []; }
}
function saveCart(cart) {
  localStorage.setItem('orderCart', JSON.stringify(cart));
  updateCartBadge();
}
function updateCartBadge() {
  var cart = getCart();
  var badge = document.getElementById('cartBadge');
  if (badge) { badge.textContent = cart.length; badge.style.display = cart.length > 0 ? 'flex' : 'none'; }
}
function addToCart(productId, productName) {
  var cart = getCart();
  var isEn = document.documentElement.lang === 'en';
  if (cart.some(function(item) { return item.id === productId; })) {
    alert(isEn ? 'This product is already in your basket' : 'المنتج موجود بالفعل في السلة');
    return;
  }
  cart.push({ id: productId, name: productName });
  saveCart(cart);
  showCartFeedback(isEn ? 'Added "' + productName + '" to basket' : ('تمت إضافة "' + productName + '" إلى السلة'));
}
function removeFromCart(productId) {
  var cart = getCart().filter(function(item) { return item.id !== productId; });
  saveCart(cart);
  renderCartItems();
}
function showCartFeedback(msg) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--primary-blue);color:#fff;padding:10px 20px;border-radius:8px;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:fadeSlideUp 0.3s ease';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(function() { el.style.opacity='0'; el.style.transition='opacity 0.3s'; setTimeout(function() { el.remove(); }, 300); }, 2000);
}
function renderCartItems() {
  var cart = getCart();
  var container = document.getElementById('cartItems');
  var empty = document.getElementById('cartEmpty');
  var form = document.getElementById('orderForm');
  if (!container) return;
  if (cart.length === 0) {
    container.innerHTML = '';
    if (empty) empty.style.display = 'block';
    if (form) form.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (form) form.style.display = 'block';
    container.innerHTML = cart.map(function(item, i) {
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--bg-gray)">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        '<span style="width:24px;height:24px;border-radius:50%;background:var(--primary-blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600">' + (i + 1) + '</span>' +
        '<span style="font-weight:500">' + item.name + '</span>' +
      '</div>' +
      '<button class="btn btn-sm" style="background:rgba(220,53,69,0.1);color:var(--primary-red);border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px" onclick="removeFromCart(' + item.id + ')"><i class="fas fa-trash"></i></button>' +
    '</div>';
  }).join('');
}
function openCartModal() {
  var modal = document.getElementById('orderModal');
  if (!modal) return;
  renderCartItems();
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeOrderModal() {
  var modal = document.getElementById('orderModal');
  if (modal) { modal.classList.remove('active'); document.body.style.overflow = ''; }
}
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.openCartModal = openCartModal;
window.closeOrderModal = closeOrderModal;

function initOrderForm() {
  var form = document.getElementById('orderForm');
  if (!form) return;
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    var cart = getCart();
    var isEn = document.documentElement.lang === 'en';
    if (cart.length === 0) { 
      alert(typeof t === 'function' ? t('cart_empty') : (isEn ? 'Cart is empty' : 'السلة فارغة')); 
      return; 
    }
    var name = document.getElementById('orderName').value.trim();
    var phone = document.getElementById('orderPhone').value.trim();
    var notes = document.getElementById('orderNotes').value.trim();
    if (!name || !phone) { 
      alert(typeof t === 'function' ? t('alert_fill_required') : (isEn ? 'Please fill required fields' : 'يرجى ملء جميع الحقول المطلوبة')); 
      return; 
    }
    var productsStr = cart.map(function(item) { return item.name; }).join(', ');
    var submitBtn = form.querySelector('button[type="submit"]');
    var originalHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (isEn ? 'Submitting...' : 'جاري الإرسال...');
    submitBtn.disabled = true;
    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_name: name, phone: phone, products: productsStr, notes: notes, status: 'pending' })
    }).then(function(r) {
      if (!r.ok) throw new Error('Order submission failed');
      return r.json();
    }).then(function() {
      alert(typeof t === 'function' ? t('alert_order_success') : 'تم إرسال طلبكم بنجاح! سنتواصل معكم قريباً.');
      localStorage.removeItem('orderCart');
      updateCartBadge();
      form.reset();
      closeOrderModal();
    }).catch(function(err) {
      console.error('Order submit error:', err);
      alert(typeof t === 'function' ? t('alert_error') : 'حدث خطأ أثناء إرسال الطلب، يرجى المحاولة لاحقاً');
    }).finally(function() {
      submitBtn.innerHTML = originalHtml;
      submitBtn.disabled = false;
    });
  });
}

/* ========================================
   Dark Mode Toggle
   ======================================== */
function initDarkMode() {
    // Check if user has a preference
    const isDarkMode = localStorage.getItem('darkMode') === 'true';
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        // Set correct icon
        setTimeout(function() {
            const icon = document.querySelector('.dark-mode-toggle i');
            if (icon) {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            }
        }, 100);
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    // Toggle icon
    const icon = document.querySelector('.dark-mode-toggle i');
    if (icon) {
        if (document.body.classList.contains('dark-mode')) {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }
}

// Make function globally available
window.toggleDarkMode = toggleDarkMode;

/* ========================================
   Language Toggle
   ======================================== */
function initLanguageToggle() {
    const currentLang = localStorage.getItem('language') || 'ar';
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === 'en' ? 'ltr' : 'rtl';
    if (typeof applyTranslations === 'function') {
        applyTranslations(currentLang);
    }
}

function toggleLanguage() {
    const html = document.documentElement;
    const newLang = html.lang === 'ar' ? 'en' : 'ar';
    html.lang = newLang;
    html.dir = newLang === 'en' ? 'ltr' : 'rtl';
    localStorage.setItem('language', newLang);
    if (typeof applyTranslations === 'function') {
        applyTranslations(newLang);
    }
    if (document.getElementById('productsGrid') && typeof renderProducts === 'function') {
        renderProducts();
    }
    if (document.getElementById('homeProductsGrid') && typeof loadHomeProducts === 'function') {
        loadHomeProducts();
    }
    if (document.getElementById('homePartnersTrack') && typeof loadHomePartners === 'function') {
        loadHomePartners();
    }
    if (document.getElementById('partnersContainer') && typeof loadAllPartners === 'function') {
        loadAllPartners();
    }
    if (typeof updateCartBadge === 'function') {
        updateCartBadge();
    }
}

// Make function globally available
window.toggleLanguage = toggleLanguage;

/* ========================================
   Smooth Scroll for Anchor Links
   ======================================== */
document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
    anchor.addEventListener('click', function(e) {
        const targetId = this.getAttribute('href');
        if (targetId !== '#') {
            e.preventDefault();
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                const headerHeight = document.querySelector('.header')?.offsetHeight || 0;
                const targetPosition = targetElement.offsetTop - headerHeight;
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        }
    });
});

function formatNumber(num) {
  if (num === undefined || num === null) return '0';
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* ========================================
    Product Filter (for Products page)
   ======================================== */
let currentFilter = 'all';
let currentSearch = '';

function filterProducts(category) {
    currentFilter = category;
    currentSearch = '';
    document.querySelectorAll('.filter-btn').forEach(function(b) {
        b.classList.remove('active');
        if (b.getAttribute('onclick') && b.getAttribute('onclick').indexOf("'" + category + "'") !== -1) {
            b.classList.add('active');
        }
    });
    var searchInput = document.querySelector('.search-box input');
    if (searchInput) searchInput.value = '';
    applyFilters();
}

function searchProducts(query) {
    currentSearch = query.toLowerCase();
    applyFilters();
}

function applyFilters() {
    filteredProducts = allProductsCache.filter(function(product) {
        var matchCategory = false;
        if (currentFilter === 'all') {
            matchCategory = true;
        } else {
            var filterLower = currentFilter.toLowerCase();
            var agent = (product.agent || '').toLowerCase();
            var mfg = (product.manufacturer || '').toLowerCase();
            var cat = (product.category || '').toLowerCase();
            var model = (product.model || '').toLowerCase();
            matchCategory = (
                agent.indexOf(filterLower) !== -1 || 
                mfg.indexOf(filterLower) !== -1 || 
                cat.indexOf(filterLower) !== -1 ||
                model.indexOf(filterLower) !== -1 ||
                (filterLower === 'hipro' && agent.indexOf('hipro') !== -1) ||
                (filterLower === 'seamaty' && agent.indexOf('seamaty') !== -1) ||
                (filterLower === 'behnk elektronik' && (agent.indexOf('behnk') !== -1 || mfg.indexOf('behnk') !== -1))
            );
        }

        var matchSearch = true;
        if (currentSearch) {
            var text = (
                (product.name || '') + ' ' + 
                (product.name_en || '') + ' ' + 
                (product.agent || '') + ' ' + 
                (product.manufacturer || '') + ' ' + 
                (product.description || '') + ' ' + 
                (product.description_en || '') + ' ' + 
                (product.category || '') + ' ' + 
                (product.model || '') + ' ' + 
                (product.keywords || '')
            ).toLowerCase();
            matchSearch = text.indexOf(currentSearch) !== -1;
        }
        return matchCategory && matchSearch;
    });
    currentPage = 1;
    renderProducts();
}

// Make functions globally available
window.filterProducts = filterProducts;
window.searchProducts = searchProducts;

function renderProducts() {
    var grid = document.getElementById('productsGrid');
    if (!grid) return;
    var isEn = document.documentElement.lang === 'en';
    var dict = typeof translations !== 'undefined' ? (translations[isEn ? 'en' : 'ar'] || {}) : {};
    var total = filteredProducts.length;
    var totalPages = Math.ceil(total / PRODUCTS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    var start = (currentPage - 1) * PRODUCTS_PER_PAGE;
    var pageProducts = filteredProducts.slice(start, start + PRODUCTS_PER_PAGE);

    grid.innerHTML = pageProducts.map(function(p) {
        var name = (isEn && p.name_en) ? p.name_en : (p.name || '');
        if (isEn && !p.name_en && typeof productTranslations !== 'undefined' && productTranslations[p.name]) {
            name = productTranslations[p.name].name || name;
        }
        var agent = p.agent || p.manufacturer || '';
        var desc = (isEn && p.description_en) ? p.description_en : (p.description || '');
        if (isEn && !p.description_en && typeof productTranslations !== 'undefined' && productTranslations[p.name]) {
            desc = productTranslations[p.name].description || desc;
        }
        var badgeCategory = p.category || '';
        if (isEn) {
            if (badgeCategory === 'تحاليل مناعية') badgeCategory = 'Immunoassay';
            else if (badgeCategory === 'غازات الدم') badgeCategory = 'Blood Gas';
            else if (badgeCategory === 'الإلكتروليت') badgeCategory = 'Electrolytes';
            else if (badgeCategory === 'أجهزة التخثر') badgeCategory = 'Coagulation';
            else if (badgeCategory === 'كواشف التخثر') badgeCategory = 'Reagents';
        }
        var badgeHtml = badgeCategory ? '<span class="product-badge">' + badgeCategory + '</span>' : '';
        // Category icon mapping (no product images – text+icon cards only)
        var catIcon = 'fa-flask';
        var catColor = 'var(--brand-blue)';
        var cat = p.category || '';
        if (cat === 'POCT') { catIcon = 'fa-heartbeat'; catColor = 'var(--brand-pink)'; }
        else if (cat === 'غازات الدم') { catIcon = 'fa-tint'; catColor = 'var(--brand-cyan)'; }
        else if (cat === 'الإلكتروليت') { catIcon = 'fa-microchip'; catColor = 'var(--brand-blue)'; }
        else if (cat === 'أجهزة التخثر') { catIcon = 'fa-dna'; catColor = 'var(--brand-burgundy)'; }
        else if (cat === 'كواشف التخثر') { catIcon = 'fa-vials'; catColor = '#6c5ce7'; }
        var priceCurrency = isEn ? 'YER' : 'ر.ي';
        var priceHtml = p.price > 0 ? '<p class="product-price"><i class="fas fa-tag"></i> ' + formatNumber(p.price) + ' ' + priceCurrency + '</p>' : '';
        var btnAddOrder = dict['btn_add_order'] || (isEn ? 'Add to Order' : 'أضف للطلب');
        var btnGetQuote = dict['btn_get_quote'] || (isEn ? 'Request Quote' : 'طلب عرض سعر');
        var btnDetails = dict['btn_details'] || (isEn ? 'Details' : 'التفاصيل');

        return '<div class="product-card visible" data-category="' + (p.category || '') + '">' +
            '<div class="product-icon-header" style="background:linear-gradient(135deg,color-mix(in srgb,' + catColor + ' 12%,white),color-mix(in srgb,' + catColor + ' 6%,white));border-bottom:3px solid ' + catColor + ';padding:22px;text-align:center;border-radius:var(--radius-lg) var(--radius-lg) 0 0;">' +
                '<i class="fas ' + catIcon + '" style="font-size:38px;color:' + catColor + ';display:block;margin-bottom:10px;"></i>' +
                badgeHtml +
            '</div>' +
            '<div class="product-info">' +
                '<h3>' + name + '</h3>' +
                '<p class="product-agent"><i class="fas fa-building" style="color:var(--brand-blue);margin-inline-end:4px"></i> ' + agent + '</p>' +
                priceHtml +
                '<p class="product-desc">' + desc + '</p>' +
                '<div class="product-btn-group">' +
                    '<button class="product-btn product-btn-order" onclick="addToCart(' + p.id + ',\'' + name.replace(/'/g, "\\'") + '\')"><i class="fas fa-cart-plus"></i> ' + btnAddOrder + '</button>' +
                    '<button class="product-btn product-btn-outline" onclick="openQuoteModal(\'' + name.replace(/'/g, "\\'") + '\')"><i class="fas fa-paper-plane"></i> ' + btnGetQuote + '</button>' +
                '</div>' +
                '<button class="product-btn product-btn-details" onclick="openProductDetailsById(' + p.id + ')" style="margin-top:6px"><i class="fas fa-info-circle"></i> ' + btnDetails + '</button>' +
            '</div>' +
        '</div>';
    }).join('');
    updateCartBadge();
    if (!pageProducts.length) {
        var noResText = dict['no_results'] || 'لا توجد نتائج مطابقة';
        grid.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-secondary);grid-column:1/-1;">' + noResText + '</p>';
    }
    renderPagination(totalPages);
    initCardTilt();
}

function renderPagination(totalPages) {
    const paginationEl = document.getElementById('pagination');
    if (!paginationEl) return;
    const isEn = document.documentElement.lang === 'en';
    const dict = typeof translations !== 'undefined' ? (translations[isEn ? 'en' : 'ar'] || {}) : {};
    
    let html = '';
    const prevText = dict['prev_page'] || 'السابق';
    const nextText = dict['next_page'] || 'التالي';
    const showingText = dict['showing_info'] || 'عرض';
    const ofText = dict['of_info'] || 'من';
    const prevIcon = isEn ? 'fa-chevron-left' : 'fa-chevron-right';
    const nextIcon = isEn ? 'fa-chevron-right' : 'fa-chevron-left';
    
    // Previous button
    html += `<button class="pagination-btn" onclick="goToPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}><i class="fas ${prevIcon}"></i> ${prevText}</button>`;
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
    
    // Next button
    html += `<button class="pagination-btn" onclick="goToPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>${nextText} <i class="fas ${nextIcon}"></i></button>`;
    
    // Info
    const start = (currentPage - 1) * PRODUCTS_PER_PAGE + 1;
    const end = Math.min(currentPage * PRODUCTS_PER_PAGE, filteredProducts.length);
    html += `<span class="pagination-info">${showingText} ${start}-${end} ${ofText} ${filteredProducts.length}</span>`;
    paginationEl.innerHTML = html;
}

function goToPage(page) {
    currentPage = page;
    renderProducts();
    // Scroll to products section
    const section = document.getElementById('products');
    if (section) {
        const headerHeight = document.querySelector('.header')?.offsetHeight || 0;
        window.scrollTo({
            top: section.offsetTop - headerHeight - 20,
            behavior: 'smooth'
        });
    }
}

// Make functions globally available
window.goToPage = goToPage;

/* ========================================
    Initialize Pagination on Page Load
   ======================================== */

/* ========================================
   Partner Filter (for Partners page)
   ======================================== */
function filterPartners(country) {
    const partners = document.querySelectorAll('.partner-card');
    
    partners.forEach(function(partner) {
        if (country === 'all' || partner.getAttribute('data-country') === country) {
            partner.style.display = 'block';
            setTimeout(function() {
                partner.style.opacity = '1';
                partner.style.transform = 'translateY(0)';
            }, 10);
        } else {
            partner.style.opacity = '0';
            partner.style.transform = 'translateY(20px)';
            setTimeout(function() {
                partner.style.display = 'none';
            }, 300);
        }
    });
}

// Make function globally available
window.filterPartners = filterPartners;

/* ========================================
   Compare Products
   ======================================== */
let compareList = [];

function addToCompare(productId) {
    if (compareList.length >= 3) {
        alert('يمكنك مقارنة 3 منتجات كحد أقصى');
        return;
    }
    
    if (!compareList.includes(productId)) {
        compareList.push(productId);
        updateCompareButton();
        alert('تمت إضافة المنتج إلى قائمة المقارنة');
    } else {
        alert('المنتج موجود بالفعل في قائمة المقارنة');
    }
}

function removeFromCompare(productId) {
    compareList = compareList.filter(function(id) {
        return id !== productId;
    });
    updateCompareButton();
}

function updateCompareButton() {
    const compareBtn = document.getElementById('compareBtn');
    if (compareBtn) {
        if (compareList.length > 0) {
            compareBtn.style.display = 'block';
            compareBtn.textContent = 'مقارنة (' + compareList.length + ')';
        } else {
            compareBtn.style.display = 'none';
        }
    }
}

function openCompareModal() {
    if (compareList.length < 2) {
        alert('يرجى إضافة منتجين على الأقل للمقارنة');
        return;
    }
    
    // Here you would typically open a modal with the comparison
    alert('سيتم فتح نافذة المقارنة مع ' + compareList.length + ' منتجات');
}

// Make functions globally available
window.addToCompare = addToCompare;
window.removeFromCompare = removeFromCompare;
window.openCompareModal = openCompareModal;

/* ========================================
   Lazy Loading for Images
   ======================================== */
function initLazyLoading() {
    const images = document.querySelectorAll('img[data-src]');
    
    if (images.length > 0) {
        const imageObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.getAttribute('data-src');
                    img.removeAttribute('data-src');
                    imageObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px 0px'
        });
        
        images.forEach(function(img) {
            imageObserver.observe(img);
        });
    }
}

// Initialize lazy loading when DOM is ready
document.addEventListener('DOMContentLoaded', initLazyLoading);

/* ========================================
    Active Navigation Link
   ======================================== */
function updateActiveNavLink() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-menu a');
    
    let currentSection = '';
    
    sections.forEach(function(section) {
        const sectionTop = section.offsetTop - 100;
        const sectionHeight = section.offsetHeight;
        
        if (window.scrollY >= sectionTop && window.scrollY < sectionTop + sectionHeight) {
            currentSection = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(function(link) {
        link.classList.remove('active');
        if (link.getAttribute('href') === '#' + currentSection || 
            (link.getAttribute('href') === 'index.html' && currentSection === 'hero')) {
            link.classList.add('active');
        }
    });
}

window.addEventListener('scroll', updateActiveNavLink);

/* ========================================
   Print Page
   ======================================== */
function printPage() {
    window.print();
}

// Make function globally available
window.printPage = printPage;

/* ========================================
   Share Functionality
   ======================================== */
function shareOnFacebook() {
    const url = encodeURIComponent(window.location.href);
    window.open('https://www.facebook.com/sharer/sharer.php?u=' + url, '_blank', 'width=600,height=400');
}

function shareOnTwitter() {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent('نيوتك الطبية - شريككم في الرعاية الصحية');
    window.open('https://twitter.com/intent/tweet?url=' + url + '&text=' + text, '_blank', 'width=600,height=400');
}

function shareOnWhatsApp() {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent('نيوتك الطبية - شريككم في الرعاية الصحية: ' + window.location.href);
    window.open('https://wa.me/?text=' + text, '_blank');
}

// Make functions globally available
window.shareOnFacebook = shareOnFacebook;
window.shareOnTwitter = shareOnTwitter;
window.shareOnWhatsApp = shareOnWhatsApp;

/* ========================================
   Newsletter Subscription
   ======================================== */
function subscribeNewsletter(email) {
    if (!email) {
        alert('يرجى إدخال البريد الإلكتروني');
        return;
    }
    
    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('يرجى إدخال بريد إلكتروني صحيح');
        return;
    }
    
    // Simulate subscription
    alert('تم الاشتراك بنجاح! شكراً لك.');
}

// Make function globally available
window.subscribeNewsletter = subscribeNewsletter;

/* ========================================
    Dynamic Loading from Database
   ======================================== */
var isSubPage = window.location.pathname.includes('/pages/');
var imgBase = isSubPage ? '../' : '';
var PRODUCTS_PER_PAGE = 4;
var currentPage = 1;
var filteredProducts = [];
var allProductsCache = [];
var allPartnersCache = [];

var partnerIcons = ['fa-microchip', 'fa-flask', 'fa-heartbeat', 'fa-tint', 'fa-stethoscope', 'fa-medkit'];
var partnerColors = ['#0284c7', '#dc2626', '#10b981', '#f59e0b', '#8b5cf6', '#0d9488'];

function loadHomeProducts() {
    var grid = document.getElementById('homeProductsGrid');
    if (!grid) return;
    var isEn = document.documentElement.lang === 'en';
    var dict = typeof translations !== 'undefined' ? (translations[isEn ? 'en' : 'ar'] || {}) : {};

    fetch('/api/products').then(function(r) { return r.json(); }).then(function(products) {
        if (!products.length) { 
            grid.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-secondary);grid-column:1/-1;">' + (dict['no_products'] || 'لا توجد منتجات حالياً') + '</p>'; 
            return; 
        }
        var shown = products.filter(function(p) { return p.active !== 0 && p.status === 'متوفر'; }).slice(0, 4);
        grid.innerHTML = shown.map(function(p) {
            var name = (isEn && p.name_en) ? p.name_en : (p.name || '');
            if (isEn && !p.name_en && typeof productTranslations !== 'undefined' && productTranslations[p.name]) {
                name = productTranslations[p.name].name || name;
            }
            var agent = p.agent || p.manufacturer || '';
            var desc = (isEn && p.description_en) ? p.description_en : (p.description || '');
            if (isEn && !p.description_en && typeof productTranslations !== 'undefined' && productTranslations[p.name]) {
                desc = productTranslations[p.name].description || desc;
            }
            var badgeCategory = p.category || '';
            if (isEn) {
                if (badgeCategory === 'تحاليل مناعية') badgeCategory = 'Immunoassay';
                else if (badgeCategory === 'غازات الدم') badgeCategory = 'Blood Gas';
                else if (badgeCategory === 'الإلكتروليت') badgeCategory = 'Electrolytes';
                else if (badgeCategory === 'أجهزة التخثر') badgeCategory = 'Coagulation';
                else if (badgeCategory === 'كواشف التخثر') badgeCategory = 'Reagents';
            }
            var badgeHtml = badgeCategory ? '<span class="product-badge">' + badgeCategory + '</span>' : '';
            // Category icon (no product images – text+icon cards only)
            var catIcon = 'fa-flask';
            var catColor = 'var(--brand-blue)';
            var cat = p.category || '';
            if (cat === 'POCT') { catIcon = 'fa-heartbeat'; catColor = 'var(--brand-pink)'; }
            else if (cat === 'غازات الدم') { catIcon = 'fa-tint'; catColor = 'var(--brand-cyan)'; }
            else if (cat === 'الإلكتروليت') { catIcon = 'fa-microchip'; catColor = 'var(--brand-blue)'; }
            else if (cat === 'أجهزة التخثر') { catIcon = 'fa-dna'; catColor = 'var(--brand-burgundy)'; }
            else if (cat === 'كواشف التخثر') { catIcon = 'fa-vials'; catColor = '#6c5ce7'; }
            var priceHtml2 = p.price > 0 ? '<p class="product-price" style="font-size:13px;font-weight:600;color:var(--primary-blue);margin-bottom:8px"><i class="fas fa-tag"></i> ' + formatNumber(p.price) + ' ' + (isEn ? 'YER' : 'ر.ي') + '</p>' : '';
            var btnAddOrder = dict['btn_add_order'] || (isEn ? 'Add to Order' : 'أضف للطلب');
            var btnGetQuote = dict['btn_get_quote'] || (isEn ? 'Request Quote' : 'عرض سعر');
            var btnDetails = dict['btn_details'] || (isEn ? 'Details' : 'التفاصيل');

            return '<div class="product-card visible" data-category="' + (p.category || '') + '">' +
                '<div class="product-icon-header" style="background:linear-gradient(135deg,color-mix(in srgb,' + catColor + ' 12%,white),color-mix(in srgb,' + catColor + ' 6%,white));border-bottom:3px solid ' + catColor + ';padding:22px;text-align:center;border-radius:var(--radius-lg) var(--radius-lg) 0 0;">' +
                    '<i class="fas ' + catIcon + '" style="font-size:38px;color:' + catColor + ';display:block;margin-bottom:10px;"></i>' +
                    badgeHtml +
                '</div>' +
                '<div class="product-info">' +
                    '<h3>' + name + '</h3>' +
                    '<p class="product-agent"><i class="fas fa-building" style="color:var(--brand-blue);margin-inline-end:4px"></i> ' + agent + '</p>' +
                    priceHtml2 +
                    '<p>' + desc.substring(0, 85) + (desc.length > 85 ? '...' : '') + '</p>' +
                    '<div class="product-btn-group">' +
                        '<button class="product-btn product-btn-order" onclick="addToCart(' + p.id + ',\'' + name.replace(/'/g, "\\'") + '\')"><i class="fas fa-cart-plus"></i> ' + btnAddOrder + '</button>' +
                        '<button class="product-btn product-btn-outline" onclick="openQuoteModal(\'' + name.replace(/'/g, "\\'") + '\')"><i class="fas fa-paper-plane"></i> ' + btnGetQuote + '</button>' +
                    '</div>' +
                    '<button class="product-btn product-btn-details" onclick="openProductDetailsById(' + p.id + ')" style="margin-top:6px"><i class="fas fa-info-circle"></i> ' + btnDetails + '</button>' +
                '</div>' +
            '</div>';
        }).join('');
        initCardTilt();
        updateCartBadge();
    }).catch(function() {
        grid.innerHTML = '<p style="text-align:center;padding:40px;color:var(--text-secondary);grid-column:1/-1;">' + (dict['no_products'] || 'تعذر تحميل المنتجات') + '</p>';
    });
}

function loadHomePartners() {
    var track = document.getElementById('homePartnersTrack');
    if (!track) return;
    var isEn = document.documentElement.lang === 'en';
    fetch('/api/partners').then(function(r) { return r.json(); }).then(function(partners) {
        if (!partners.length) { track.innerHTML = ''; return; }
        var html = partners.map(function(p, i) {
            var icon = partnerIcons[i % partnerIcons.length];
            var color = partnerColors[i % partnerColors.length];
            var name = p.name;
            var country = p.country || '';
            var specialty = p.specialty || '';
            if (isEn && typeof partnerTranslations !== 'undefined' && partnerTranslations[name]) {
                country = partnerTranslations[name].country || country;
                specialty = partnerTranslations[name].specialty || specialty;
            }
            return '<div class="partner-item">' +
                '<div style="text-align: center; font-weight: 600;">' +
                    '<i class="fas ' + icon + '" style="font-size: 30px; color: ' + color + '; margin-bottom: 10px; display: block;"></i>' +
                    name +
                    '<small style="display: block; color: var(--text-secondary); font-size: 12px; margin-top: 4px;">' + (country ? country + ' - ' : '') + specialty + '</small>' +
                '</div>' +
            '</div>';
        }).join('');
        track.innerHTML = html;
    }).catch(function() {});
}

function loadAllProducts() {
    var grid = document.getElementById('productsGrid');
    if (!grid) return;
    var isEn = document.documentElement.lang === 'en';
    var dict = typeof translations !== 'undefined' ? (translations[isEn ? 'en' : 'ar'] || {}) : {};
    fetch('/api/products').then(function(r) { return r.json(); }).then(function(products) {
        var active = products.filter(function(p) { return p.active !== 0; });
        allProductsCache = active;
        filteredProducts = active;
        if (!active.length) { 
            grid.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-secondary);grid-column:1/-1;">' + (dict['no_products'] || 'لا توجد منتجات متوفرة حالياً') + '</p>'; 
            return; 
        }
        currentPage = 1;
        renderProducts();
    }).catch(function() {
        grid.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-secondary);grid-column:1/-1;">' + (dict['no_products'] || 'تعذر تحميل المنتجات') + '</p>';
    });
}

function loadAllPartners() {
    var container = document.getElementById('partnersContainer');
    if (!container) return;
    var isEn = document.documentElement.lang === 'en';
    var dict = typeof translations !== 'undefined' ? (translations[isEn ? 'en' : 'ar'] || {}) : {};
    fetch('/api/partners').then(function(r) { return r.json(); }).then(function(partners) {
        if (!partners.length) { 
            var noPartText = dict['no_partners'] || 'لا توجد وكالات حالياً';
            container.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-secondary);">' + noPartText + '</p>'; 
            return; 
        }
        container.innerHTML = partners.map(function(p, i) {
            var name = p.name || '';
            var country = p.country || '';
            var specialty = p.specialty || '';
            var desc = p.description || p.notes || '';
            if (isEn && typeof partnerTranslations !== 'undefined' && partnerTranslations[name]) {
                country = partnerTranslations[name].country || country;
                specialty = partnerTranslations[name].specialty || specialty;
                desc = partnerTranslations[name].description || desc;
            }
            var icon = partnerIcons[i % partnerIcons.length];
            var color = partnerColors[i % partnerColors.length];
            var notes = p.notes || '';
            var coverageItems = notes.split(/،|,/).map(function(s) {
                return '<span class="coverage-item">' + s.trim() + '</span>';
            }).filter(function(s) { return s.length > 10; }).join('');
            if (!coverageItems) coverageItems = '<span class="coverage-item">' + specialty + '</span>';
            var agentTag = dict['partner_type'] || (isEn ? 'Authorized Agency / Global Partner' : 'وكالة معتمدة / شريك دولي');
            var fieldsTitle = dict['fields_title'] || (isEn ? 'Specialties:' : 'المجالات:');

            return '<div class="agency-card-modern visible">' +
                '<div class="acm-top" style="background: linear-gradient(135deg, ' + color + ' 0%, ' + color + 'cc 100%)"></div>' +
                '<div class="acm-body">' +
                    '<div class="acm-header">' +
                        '<div class="acm-logo" style="background: ' + color + '15;color:' + color + '"><i class="fas ' + icon + '"></i></div>' +
                        '<div class="acm-info">' +
                            '<h3>' + name + '</h3>' +
                            '<span class="acm-country"><i class="fas fa-globe"></i> ' + country + '</span>' +
                        '</div>' +
                    '</div>' +
                    (desc ? '<p class="acm-desc">' + desc + '</p>' : '') +
                    '<div class="acm-tags">' +
                        '<span class="acm-tag"><i class="fas fa-award"></i> ' + agentTag + '</span>' +
                        '<span class="acm-tag acm-tag-spec"><i class="fas fa-cogs"></i> ' + specialty + '</span>' +
                    '</div>' +
                    '<div class="acm-coverage">' +
                        '<p class="acm-coverage-title"><i class="fas fa-layer-group"></i> ' + fieldsTitle + '</p>' +
                        '<div class="acm-coverage-list">' + coverageItems + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }).join('');
        initCardTilt();
    }).catch(function() {
        container.innerHTML = '<p style="text-align:center;padding:60px;color:var(--text-secondary);">' + (dict['no_partners'] || 'تعذر تحميل الوكالات') + '</p>';
    });
}

/* ========================================
    Product Details Modal (from Database)
   ======================================== */
function openProductDetailsById(productId) {
    var modal = document.getElementById('productDetailsModal');
    if (!modal) return;
    var isEn = document.documentElement.lang === 'en';
    var dict = typeof translations !== 'undefined' ? (translations[isEn ? 'en' : 'ar'] || {}) : {};

    fetch('/api/products/' + productId).then(function(r) { return r.json(); }).then(function(product) {
        if (!product || product.error || product.active === 0) { closeProductDetails(); return; }
        
        var name = (isEn && product.name_en) ? product.name_en : (product.name || '');
        var desc = (isEn && product.description_en) ? product.description_en : (product.description || '');
        var category = product.category || '';
        var features = [];
        var specs = [];

        if (isEn) {
            if (category === 'تحاليل مناعية') category = 'Immunoassay';
            else if (category === 'غازات الدم') category = 'Blood Gas';
            else if (category === 'الإلكتروليت') category = 'Electrolytes';
            else if (category === 'أجهزة التخثر') category = 'Coagulation';
            else if (category === 'كواشف التخثر') category = 'Reagents';

            if (typeof productTranslations !== 'undefined') {
                var pt = productTranslations[product.name] || productTranslations[name];
                if (pt) {
                    if (!product.description_en && pt.description) desc = pt.description;
                    if (pt.category) category = pt.category;
                    if (pt.features) features = pt.features;
                    if (pt.specs) specs = pt.specs;
                }
            }
        }

        if (features.length === 0 && product.features) {
            features = product.features.split('|');
        }

        document.getElementById('detailProductName').textContent = name;
        document.getElementById('detailProductAgent').textContent = product.agent || (isEn ? 'New Tech Medical' : 'نيوتك الطبية');
        document.getElementById('detailProductCategory').textContent = category || (isEn ? 'Medical Equipment' : 'أجهزة طبية');
        
        var img = document.getElementById('detailProductImage');
        var imgContainer = document.querySelector('.product-details-image');
        var imgSrc = product.image || '';
        if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('data:')) {
            imgSrc = imgBase + imgSrc.replace(/^\.\.\//, '');
        }
        if (imgSrc && img) {
            img.src = imgSrc;
            if (imgContainer) imgContainer.style.display = 'block';
        } else {
            if (img) { img.src = ''; img.style.display = 'none'; }
            if (imgContainer) imgContainer.style.display = 'none';
        }

        document.getElementById('detailProductDescription').textContent = desc;
        
        var featuresList = document.getElementById('detailProductFeatures');
        var specsList = document.getElementById('detailProductSpecs');

        if (features.length > 0) {
            featuresList.innerHTML = features.map(function(f) {
                return '<li><i class="fas fa-check-circle" style="color: var(--brand-blue);"></i> ' + f.trim() + '</li>';
            }).join('');
            if (featuresList.previousElementSibling) featuresList.previousElementSibling.style.display = 'block';
        } else {
            featuresList.innerHTML = '';
            if (featuresList.previousElementSibling) featuresList.previousElementSibling.style.display = 'none';
        }

        var priceRow = document.getElementById('detailProductPriceRow');
        var priceEl = document.getElementById('detailProductPrice');
        if (product.price > 0) {
            priceRow.style.display = 'block';
            priceEl.textContent = formatNumber(product.price) + ' ' + (isEn ? 'YER' : 'ر.ي');
        } else {
            priceRow.style.display = 'none';
        }

        if (specs.length === 0) {
            if (category) specs.push((isEn ? 'Category: ' : 'الفئة: ') + category);
            if (product.model) specs.push((isEn ? 'Model: ' : 'الطراز: ') + product.model);
            if (product.agent) specs.push((isEn ? 'Manufacturer: ' : 'الشركة المصنعة: ') + product.agent);
            if (product.status) specs.push((isEn ? 'Availability: ' : 'الحالة: ') + (isEn ? (product.status === 'متوفر' ? 'Available' : product.status) : product.status));
        }

        specsList.innerHTML = specs.map(function(s) {
            return '<li><i class="fas fa-cog" style="color: var(--brand-fuchsia);"></i> ' + s + '</li>';
        }).join('');

        var detailQuoteBtn = document.getElementById('detailQuoteBtn');
        if (detailQuoteBtn) {
            detailQuoteBtn.innerHTML = '<i class="fas fa-paper-plane"></i> ' + (dict['btn_get_quote'] || (isEn ? 'Request Quote' : 'طلب عرض سعر'));
            detailQuoteBtn.setAttribute('onclick', "closeProductDetails(); openQuoteModal('" + name.replace(/'/g, "\\'") + "');");
        }

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }).catch(function() {});
}

function openProductDetails(productId) {
    openProductDetailsById(productId);
}

function closeProductDetails() {
    var modal = document.getElementById('productDetailsModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

window.openProductDetails = openProductDetails;
window.openProductDetailsById = openProductDetailsById;
window.closeProductDetails = closeProductDetails;

document.addEventListener('click', function(e) {
    var modal = document.getElementById('productDetailsModal');
    if (modal && e.target === modal) closeProductDetails();
});
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeProductDetails();
});

/* ========================================
   3D Interactive Effects
   ======================================== */

/* --- 1. Card Tilt with Glare Effect --- */
function initCardTilt() {
    var tiltCards = document.querySelectorAll('.product-card, .service-card, .why-card, .agency-card, .stat-box');
    
    tiltCards.forEach(function(card) {
        card.addEventListener('mousemove', function(e) {
            var rect = card.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            var centerX = rect.width / 2;
            var centerY = rect.height / 2;
            var rotateX = ((y - centerY) / centerY) * -5;
            var rotateY = ((x - centerX) / centerX) * 5;
            var percentX = (x / rect.width) * 100;
            var percentY = (y / rect.height) * 100;
            
            card.style.setProperty('--mouse-x', percentX + '%');
            card.style.setProperty('--mouse-y', percentY + '%');
            card.style.transform = 'perspective(800px) rotateX(' + rotateX + 'deg) rotateY(' + rotateY + 'deg) scale(1.02)';
        });
        
        card.addEventListener('mouseleave', function() {
            card.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)';
        });
    });
}

/* --- 4. Hero Parallax Effect --- */
function initHeroParallax() {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    
    var h1 = hero.querySelector('h1');
    var subtitle = hero.querySelector('.subtitle');
    var tagline = hero.querySelector('.tagline');
    var buttons = hero.querySelector('.hero-buttons');
    var stats = hero.querySelector('.hero-stats');
    
    hero.addEventListener('mousemove', function(e) {
        var rect = hero.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width - 0.5;
        var y = (e.clientY - rect.top) / rect.height - 0.5;
        
        if (h1) h1.style.transform = 'translate(' + (x * 15) + 'px, ' + (y * 10) + 'px)';
        if (subtitle) subtitle.style.transform = 'translate(' + (x * 10) + 'px, ' + (y * 7) + 'px)';
        if (tagline) tagline.style.transform = 'translate(' + (x * 8) + 'px, ' + (y * 5) + 'px)';
        if (buttons) buttons.style.transform = 'translate(' + (x * 5) + 'px, ' + (y * 3) + 'px)';
        if (stats) stats.style.transform = 'translate(' + (x * 3) + 'px, ' + (y * 2) + 'px)';
    });
    
    hero.addEventListener('mouseleave', function() {
        if (h1) h1.style.transform = 'translate(0, 0)';
        if (subtitle) subtitle.style.transform = 'translate(0, 0)';
        if (tagline) tagline.style.transform = 'translate(0, 0)';
        if (buttons) buttons.style.transform = 'translate(0, 0)';
        if (stats) stats.style.transform = 'translate(0, 0)';
    });
}

/* --- 6. Logo 3D Hover --- */
function initLogoTilt() {
    var logo = document.querySelector('.header .logo');
    if (!logo) return;
    
    logo.addEventListener('mousemove', function(e) {
        var rect = logo.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width - 0.5;
        var y = (e.clientY - rect.top) / rect.height - 0.5;
        
        logo.style.transform = 'perspective(500px) rotateY(' + (x * 15) + 'deg) rotateX(' + (y * -10) + 'deg)';
    });
    
    logo.addEventListener('mouseleave', function() {
        logo.style.transform = 'perspective(500px) rotateY(0deg) rotateX(0deg)';
    });
}

/* ========================================
    Auto-Refresh: reflect admin changes live
   ======================================== */
var refreshInterval = 30; // seconds
var refreshTimer = null;

function refreshProductsSilent() {
    var savedPage = currentPage;
    var savedFilter = currentFilter;
    var savedSearch = currentSearch;
    fetch('/api/products').then(function(r) { return r.json(); }).then(function(products) {
        var active = products.filter(function(p) { return p.active !== 0; });
        allProductsCache = active;
        filteredProducts = active.filter(function(product) {
            var matchCategory = (savedFilter === 'all' || product.agent === savedFilter || product.category === savedFilter);
            var matchSearch = true;
            if (savedSearch) {
                var text = ((product.name || '') + ' ' + (product.agent || '') + ' ' + (product.description || '') + ' ' + (product.category || '')).toLowerCase();
                matchSearch = text.indexOf(savedSearch) !== -1;
            }
            return matchCategory && matchSearch;
        });
        currentPage = savedPage;
        var totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
        if (currentPage > totalPages) currentPage = totalPages || 1;
        renderProducts();
    }).catch(function() {});
}

function refreshPartnersSilent() {
    fetch('/api/partners').then(function(r) { return r.json(); }).then(function(partners) {
        var container = document.getElementById('partnersContainer');
        if (container) loadAllPartners();
        var track = document.getElementById('homePartnersTrack');
        if (track) loadHomePartners();
    }).catch(function() {});
}

function refreshHomeProductsSilent() {
    if (document.getElementById('homeProductsGrid')) loadHomeProducts();
}

function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function() {
        if (document.getElementById('homeProductsGrid')) refreshHomeProductsSilent();
        if (document.getElementById('productsGrid')) refreshProductsSilent();
        refreshPartnersSilent();
    }, refreshInterval * 1000);
}

/* --- Initialize All 3D Effects + Dynamic Loading --- */
// All initialization moved to the main DOMContentLoaded listener above.
