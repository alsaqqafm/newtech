/**
 * ============================================================
 * New Tech Medical - Product Settings & Versioning Engine
 * Phase C Frontend Controller
 * Connects directly to Phase B REST endpoints
 * ============================================================
 */

(function () {
  'use strict';

  var productsList = [];
  var draftsList = [];
  var trashList = [];
  var isTrashView = false;
  var currentEditingProduct = null;
  var currentDraftId = null;
  var galleryImagesArray = [];

  // Authentication Helper: retrieve admin JWT token
  function getAuthToken() {
    var token = localStorage.getItem('adminToken') || localStorage.getItem('token') || '';
    if (!token) {
      try {
        var u = JSON.parse(localStorage.getItem('adminUser') || '{}');
        if (u.token) token = u.token;
      } catch (e) { }
    }
    return token;
  }

  function getAuthHeaders(includeContentType) {
    var headers = {};
    if (includeContentType !== false) {
      headers['Content-Type'] = 'application/json';
    }
    var token = getAuthToken();
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    return headers;
  }

  // Toast Notification helper
  function notify(message, type) {
    if (typeof showToast === 'function') {
      showToast(message, type || 'success');
    } else {
      alert(message);
    }
  }

  // ============================================================
  // 1. Data Loading & Dashboard Metrics
  // ============================================================

  window.loadProductsSettingsData = async function () {
    var tbody = document.getElementById('productsSettingsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;color:var(--primary)"></i><div style="margin-top:10px;color:var(--text-secondary)">جاري تحميل المنتجات والمسودات...</div></td></tr>';

    try {
      // 1. Fetch Summary Stats
      fetch('/api/products/summary', { headers: getAuthHeaders() })
        .then(function (r) { return r.json(); })
        .then(function (stats) {
          if (stats && !stats.error) {
            var elPub = document.getElementById('psStatPublished');
            var elDft = document.getElementById('psStatDrafts');
            var elHid = document.getElementById('psStatHidden');
            var elVer = document.getElementById('psStatVersions');

            if (elPub) elPub.textContent = stats.published_count || 0;
            if (elDft) elDft.textContent = stats.drafts_count || 0;
            if (elHid) elHid.textContent = stats.hidden_count || 0;
            if (elVer) elVer.textContent = stats.versions_count || 0;
          }
        })
        .catch(function (e) { console.warn('Summary fetch note:', e); });

      // 2. Fetch Live Products, Drafts, and Trash concurrently
      var prodsPromise = fetch('/api/products?include_archived=true', { headers: getAuthHeaders() }).then(function (r) { return r.json(); });
      var draftsPromise = fetch('/api/products/drafts', { headers: getAuthHeaders() }).then(function (r) { return r.json(); }).catch(function () { return []; });
      var trashPromise = fetch('/api/products/trash', { headers: getAuthHeaders() }).then(function (r) { return r.json(); }).catch(function () { return []; });

      var results = await Promise.all([prodsPromise, draftsPromise, trashPromise]);
      productsList = Array.isArray(results[0]) ? results[0] : [];
      draftsList = Array.isArray(results[1]) ? results[1] : [];
      trashList = Array.isArray(results[2]) ? results[2] : [];

      var elTrash = document.getElementById('psStatTrash');
      if (elTrash) elTrash.textContent = trashList.length;

      // Populate Categories Dropdown
      populateCategoryFilters();

      // Render Table Rows
      renderProductsSettingsTable();
    } catch (err) {
      console.error('Error loading product settings:', err);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--danger)"><i class="fas fa-exclamation-circle" style="font-size:24px;margin-bottom:8px"></i><div>فشل تحميل البيانات: ' + (err.message || 'خطأ في الاتصال') + '</div><button class="btn btn-outline btn-sm" onclick="loadProductsSettingsData()" style="margin-top:10px"><i class="fas fa-redo"></i> إعادة المحاولة</button></td></tr>';
    }
  };

  window.toggleTrashView = function () {
    isTrashView = !isTrashView;
    var btn = document.getElementById('psTrashToggleBtn');
    var label = document.getElementById('psTrashBtnLabel');
    if (btn && label) {
      if (isTrashView) {
        btn.style.background = '#dc2626';
        btn.style.color = '#fff';
        label.textContent = 'العودة للمنتجات';
      } else {
        btn.style.background = 'transparent';
        btn.style.color = '#dc2626';
        label.textContent = 'سلة المحذوفات';
      }
    }
    renderProductsSettingsTable();
  };

  function populateCategoryFilters() {
    var select = document.getElementById('psCategoryFilter');
    if (!select) return;

    var categories = {};
    productsList.forEach(function (p) {
      if (p.category && p.category.trim()) {
        categories[p.category.trim()] = true;
      }
    });

    var currentVal = select.value;
    select.innerHTML = '<option value="">جميع التصنيفات</option>';
    Object.keys(categories).sort().forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      if (cat === currentVal) opt.selected = true;
      select.appendChild(opt);
    });
  }

  // ============================================================
  // 2. Table Rendering with Filtering
  // ============================================================

  window.renderProductsSettingsTable = function () {
    var tbody = document.getElementById('productsSettingsTableBody');
    if (!tbody) return;

    if (isTrashView) {
      if (trashList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary)"><i class="fas fa-trash-alt" style="font-size:36px;margin-bottom:12px;opacity:0.4;display:block"></i><div style="font-size:15px;margin-bottom:14px;font-weight:600;">سلة المحذوفات فارغة حالياً</div><button type="button" class="btn btn-primary btn-sm" onclick="toggleTrashView()"><i class="fas fa-arrow-right"></i> العودة لقائمة المنتجات</button></td></tr>';
        return;
      }

      var trashHtml = `
        <tr style="background:#fef2f2;">
          <td colspan="6" style="padding:10px 16px;border-bottom:2px solid #fecaca;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div style="font-weight:700;color:#dc2626;display:flex;align-items:center;gap:8px;">
                <i class="fas fa-trash-alt"></i>
                <span>أنت الآن في سلة المحذوفات (${trashList.length} منتج) - يمكنك استرجاع المنتج أو حذفه نهائياً</span>
              </div>
              <button type="button" class="btn btn-sm btn-primary" onclick="toggleTrashView()" style="background:#dc2626;border:none;font-weight:600;">
                <i class="fas fa-arrow-right"></i> العودة لقائمة المنتجات
              </button>
            </div>
          </td>
        </tr>
      `;
      trashList.forEach(function (p) {
        var imgSrc = p.image || p.main_image || '../images/logo.png';
        trashHtml += `
          <tr data-id="${p.id}" style="background:#fffaf0;">
            <td style="width:60px;text-align:center;">
              <img src="${imgSrc}" alt="${p.name}" style="width:44px;height:44px;object-fit:contain;border-radius:6px;border:1px solid var(--border-color);background:#fff;padding:2px;" onerror="this.src='../images/logo.png'">
            </td>
            <td>
              <div style="font-weight:600;color:var(--text-primary);">${p.name}</div>
              <div style="font-size:12px;color:var(--text-secondary);direction:ltr;text-align:right;">${p.name_en || p.model || ''}</div>
            </td>
            <td><span style="display:inline-block;padding:3px 8px;border-radius:4px;background:var(--bg-main);font-size:12px;border:1px solid var(--border-color);">${p.category || 'عام'}</span></td>
            <td>
              <span class="status" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca"><i class="fas fa-trash-alt"></i> في سلة المحذوفات</span>
            </td>
            <td>
              <div style="font-size:11px;color:var(--text-secondary);">${p.deleted_at ? p.deleted_at.substring(0, 16) : 'مؤخراً'}</div>
            </td>
            <td style="text-align:center;">
              <div style="display:inline-flex;gap:6px;">
                <button class="btn btn-outline btn-sm" onclick="restoreFromTrash(${p.id})" title="استرجاع المنتج وإعادته للظهور" style="padding:4px 10px;color:#059669;border-color:#a7f3d0;font-weight:600;">
                  <i class="fas fa-undo"></i> استرجاع
                </button>
                <button class="btn btn-outline btn-sm" onclick="permanentDeleteProduct(${p.id})" title="حذف نهائي بلا رجعة" style="padding:4px 10px;color:#dc2626;border-color:#fca5a5;font-weight:600;">
                  <i class="fas fa-times-circle"></i> حذف نهائي
                </button>
              </div>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = trashHtml;
      return;
    }

    var searchVal = (document.getElementById('psSearchInput') ? document.getElementById('psSearchInput').value : '').toLowerCase().trim();
    var catVal = document.getElementById('psCategoryFilter') ? document.getElementById('psCategoryFilter').value : '';
    var statusVal = document.getElementById('psStatusFilter') ? document.getElementById('psStatusFilter').value : '';

    var filtered = productsList.filter(function (p) {
      var matchesSearch = !searchVal ||
        (p.name && p.name.toLowerCase().includes(searchVal)) ||
        (p.name_en && p.name_en.toLowerCase().includes(searchVal)) ||
        (p.model && p.model.toLowerCase().includes(searchVal)) ||
        (p.manufacturer && p.manufacturer.toLowerCase().includes(searchVal));

      var matchesCat = !catVal || (p.category === catVal);

      var matchesStatus = true;
      if (statusVal === 'published') {
        matchesStatus = (p.publish_status === 'published' || !p.publish_status) && p.active === 1 && !p.is_archived;
      } else if (statusVal === 'hidden') {
        matchesStatus = (p.publish_status === 'hidden' || p.active === 0) && !p.is_archived;
      } else if (statusVal === 'archived') {
        matchesStatus = p.is_archived === 1 || p.publish_status === 'archived';
      } else if (statusVal === 'has_draft') {
        matchesStatus = draftsList.some(function (d) { return d.product_id === p.id; });
      }

      return matchesSearch && matchesCat && matchesStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-secondary)"><i class="fas fa-box-open" style="font-size:32px;margin-bottom:10px;opacity:0.5"></i><div>لا توجد منتجات مطابقة لمعايير البحث الحالية</div></td></tr>';
      return;
    }

    var html = '';
    filtered.forEach(function (p) {
      var hasDraft = draftsList.find(function (d) { return d.product_id === p.id; });
      var versionNum = p.current_version || 1;
      var imgSrc = p.image || p.main_image || '../images/logo.png';

      // Status badge
      var statusBadge = '';
      if (p.is_archived === 1) {
        statusBadge = '<span class="status" style="background:#f1f5f9;color:#64748b;border:1px solid #cbd5e1"><i class="fas fa-archive"></i> مؤرشف</span>';
      } else if (p.active === 0 || p.publish_status === 'hidden') {
        statusBadge = '<span class="status" style="background:#fff1f2;color:#e11d48;border:1px solid #fecdd3"><i class="fas fa-eye-slash"></i> مخفي</span>';
      } else {
        statusBadge = '<span class="status status-active" style="background:#ecfdf5;color:#059669;border:1px solid #a7f3d0"><i class="fas fa-check-circle"></i> منشور</span>';
      }

      var draftBadge = hasDraft
        ? '<span class="status" style="background:#fffbeb;color:#d97706;border:1px solid #fde68a;margin-right:4px;" title="يوجد مسودة غير منشورة قيد التعديل"><i class="fas fa-edit"></i> مسودة نشطة</span>'
        : '';

      html += `
        <tr data-id="${p.id}">
          <td style="width:60px;text-align:center;">
            <img src="${imgSrc}" alt="${p.name}" style="width:44px;height:44px;object-fit:contain;border-radius:6px;border:1px solid var(--border-color);background:#fff;padding:2px;" onerror="this.src='../images/logo.png'">
          </td>
          <td>
            <div style="font-weight:600;color:var(--text-primary);">${p.name}</div>
            <div style="font-size:12px;color:var(--text-secondary);direction:ltr;text-align:right;">${p.name_en || p.model || ''}</div>
          </td>
          <td><span style="display:inline-block;padding:3px 8px;border-radius:4px;background:var(--bg-main);font-size:12px;border:1px solid var(--border-color);">${p.category || 'عام'}</span></td>
          <td>
            <span style="display:inline-block;padding:2px 8px;border-radius:12px;background:linear-gradient(135deg,var(--brand-burgundy),var(--brand-fuchsia));color:#fff;font-size:11px;font-weight:700;margin-left:6px;">v${versionNum}</span>
            ${statusBadge}
            ${draftBadge}
          </td>
          <td>
            <div style="font-size:11px;color:var(--text-secondary);">${p.updated_at ? p.updated_at.substring(0, 10) : 'تأسيسي'}</div>
          </td>
          <td style="text-align:center;">
            <div style="display:inline-flex;gap:4px;">
              <button class="btn btn-outline btn-sm" onclick="openProductEditor(${p.id})" title="تعديل المنتج أو حفظ مسودة" style="padding:4px 8px;color:var(--primary);border-color:var(--primary);">
                <i class="fas fa-edit"></i> تعديل
              </button>
              <button class="btn btn-outline btn-sm" onclick="openProductPreview(${p.id})" title="معاينة آمنة قبل النشر" style="padding:4px 8px;color:#0284c7;border-color:#bae6fd;">
                <i class="fas fa-eye"></i> معاينة
              </button>
              <button class="btn btn-outline btn-sm" onclick="openVersionHistoryModal(${p.id})" title="سجل الإصدارات التاريخية والاستعادة" style="padding:4px 8px;color:#7c3aed;border-color:#ddd6fe;">
                <i class="fas fa-history"></i> النسخ
              </button>
              <button class="btn btn-outline btn-sm" onclick="moveToTrash(${p.id})" title="حذف ونقل إلى سلة المحذوفات" style="padding:4px 8px;color:#dc2626;border-color:#fca5a5;">
                <i class="fas fa-trash"></i> حذف
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  };

  // ============================================================
  // 3. Product Editor Modal & 3-Stage Workflow
  // ============================================================

  window.openProductEditor = async function (productId) {
    currentEditingProduct = null;
    currentDraftId = null;
    galleryImagesArray = [];

    var modal = document.getElementById('psEditorModal');
    if (!modal) return;

    var titleEl = document.getElementById('psEditorModalTitle');
    var draftNotice = document.getElementById('psEditorDraftNotice');
    if (draftNotice) draftNotice.style.display = 'none';

    // Reset Form
    document.getElementById('psFormName').value = '';
    document.getElementById('psFormNameEn').value = '';
    document.getElementById('psFormModel').value = '';
    document.getElementById('psFormCategory').value = '';
    document.getElementById('psFormManufacturer').value = '';
    document.getElementById('psFormPrice').value = '0';
    document.getElementById('psFormDescription').value = '';
    document.getElementById('psFormDescriptionEn').value = '';
    document.getElementById('psFormFeatures').value = '';
    document.getElementById('psFormTechnicalSpecs').value = '';
    document.getElementById('psFormMainImageUrl').value = '';
    document.getElementById('psFormChangeSummary').value = '';
    document.getElementById('psMainImagePreview').src = '../images/logo.png';
    renderGalleryThumbnails();

    if (productId) {
      titleEl.innerHTML = '<i class="fas fa-edit" style="margin-left:8px;color:var(--primary)"></i>تعديل المنتج وإدارة النشر';
      var prod = productsList.find(function (p) { return p.id === productId; });
      if (prod) {
        currentEditingProduct = prod;
        // Check for active draft
        var activeDraft = draftsList.find(function (d) { return d.product_id === productId; });
        var activeData = activeDraft || prod;

        if (activeDraft) {
          currentDraftId = activeDraft.id;
          if (draftNotice) {
            draftNotice.style.display = 'flex';
            draftNotice.innerHTML = '<i class="fas fa-info-circle" style="margin-left:8px"></i>توجد مسودة غير منشورة محفوظة لهذا المنتج (آخر تحديث: ' + (activeDraft.updated_at || '').substring(0, 16) + '). يتم عرض بيانات المسودة حالياً.';
          }
        }

        document.getElementById('psFormName').value = activeData.name || '';
        document.getElementById('psFormNameEn').value = activeData.name_en || '';
        document.getElementById('psFormModel').value = activeData.model || '';
        document.getElementById('psFormCategory').value = activeData.category || '';
        document.getElementById('psFormManufacturer').value = activeData.manufacturer || activeData.agent || '';
        document.getElementById('psFormPrice').value = activeData.price || 0;
        document.getElementById('psFormDescription').value = activeData.description || '';
        document.getElementById('psFormDescriptionEn').value = activeData.description_en || '';
        document.getElementById('psFormFeatures').value = activeData.features ? activeData.features.replace(/\|/g, '\n') : '';
        document.getElementById('psFormTechnicalSpecs').value = activeData.technical_specs || '';

        var mainImg = activeData.main_image || activeData.image || '';
        document.getElementById('psFormMainImageUrl').value = mainImg;
        if (mainImg) document.getElementById('psMainImagePreview').src = mainImg;

        try {
          galleryImagesArray = typeof activeData.gallery_images === 'string' ? JSON.parse(activeData.gallery_images || '[]') : (activeData.gallery_images || []);
        } catch (e) { galleryImagesArray = []; }
        renderGalleryThumbnails();

        document.getElementById('psFormChangeSummary').value = activeDraft ? (activeDraft.change_summary || '') : '';
      }
    } else {
      titleEl.innerHTML = '<i class="fas fa-plus-circle" style="margin-left:8px;color:var(--success)"></i>إضافة منتج جديد (إنشاء مسودة أو نشر مباشر)';
    }

    modal.style.display = 'flex';
  };

  window.closeProductEditor = function () {
    var modal = document.getElementById('psEditorModal');
    if (modal) modal.style.display = 'none';
  };

  function getEditorFormData() {
    var name = document.getElementById('psFormName').value.trim();
    if (!name) {
      notify('يرجى إدخال اسم المنتج باللغة العربية', 'error');
      return null;
    }

    var featuresRaw = document.getElementById('psFormFeatures').value.trim();
    var featuresFormatted = featuresRaw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).join('|');

    return {
      product_id: currentEditingProduct ? currentEditingProduct.id : null,
      draft_id: currentDraftId,
      name: name,
      name_en: document.getElementById('psFormNameEn').value.trim(),
      model: document.getElementById('psFormModel').value.trim(),
      category: document.getElementById('psFormCategory').value.trim(),
      manufacturer: document.getElementById('psFormManufacturer').value.trim(),
      agent: document.getElementById('psFormManufacturer').value.trim(),
      price: parseFloat(document.getElementById('psFormPrice').value) || 0,
      description: document.getElementById('psFormDescription').value.trim(),
      description_en: document.getElementById('psFormDescriptionEn').value.trim(),
      features: featuresFormatted,
      technical_specs: document.getElementById('psFormTechnicalSpecs').value.trim(),
      main_image: document.getElementById('psFormMainImageUrl').value.trim(),
      gallery_images: galleryImagesArray,
      change_summary: document.getElementById('psFormChangeSummary').value.trim() || 'تحديث مواصفات المنتج'
    };
  }

  // 1. Stage 1: Save as Draft (Isolated)
  window.saveCurrentAsDraft = async function () {
    var payload = getEditorFormData();
    if (!payload) return;

    var btn = document.getElementById('psSaveDraftBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الحفظ...'; }

    try {
      var res = await fetch('/api/products/drafts', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      var result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشل حفظ المسودة');

      notify('✅ تم حفظ المسودة بنجاح! لم يتأثر الكتالوج العام أو الموقع الحي.');
      closeProductEditor();
      loadProductsSettingsData();
    } catch (err) {
      notify('خطأ أثناء حفظ المسودة: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> حفظ كمسودة'; }
    }
  };

  // 2. Stage 2: Preview
  window.previewCurrentEditorData = function () {
    var payload = getEditorFormData();
    if (!payload) return;

    var previewData = Object.assign({}, currentEditingProduct || {}, payload);
    showPreviewModal(previewData, !!currentEditingProduct);
  };

  // 3. Stage 3: Confirm and Publish (Atomic)
  window.publishCurrentProduct = async function () {
    var payload = getEditorFormData();
    if (!payload) return;

    var summary = payload.change_summary;
    if (!summary || summary === 'تحديث مواصفات المنتج') {
      var userPrompt = prompt('يرجى إدخال ملخص مختصر للتعديلات المدخلة في هذه النسخة:', 'تحديث المواصفات والأسعار');
      if (userPrompt === null) return;
      payload.change_summary = userPrompt.trim() || 'تحديث مواصفات المنتج';
    }

    var isNew = !currentEditingProduct;
    var publishEndpoint = isNew ? '/api/products/publish-new' : `/api/products/${currentEditingProduct.id}/publish`;

    if (!isNew) {
      payload.expected_version = currentEditingProduct.current_version || 1;
    }

    var btn = document.getElementById('psPublishBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري النشر...'; }

    try {
      var res = await fetch(publishEndpoint, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      var result = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          throw new Error('تعارض في التعديل: قام مستخدم آخر بنشر تعديلات على هذا المنتج. يرجى تحديث الصفحة والمحاولة مجدداً.');
        }
        throw new Error(result.error || 'فشل نشر المنتج');
      }

      notify(`🎉 تم نشر التعديلات بنجاح وترقية الإصدار إلى v${result.version || (payload.expected_version + 1)}!`);
      closeProductEditor();
      loadProductsSettingsData();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> اعتماد ونشر التعديلات'; }
    }
  };

  // ============================================================
  // 4. Cloudinary / Image Upload Management
  // ============================================================

  window.handleMainImageUpload = function (input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];
    if (file.size > 8 * 1024 * 1024) {
      notify('حجم الصورة كبير جداً، الحد الأقصى 8 ميجابايت', 'error');
      return;
    }

    var reader = new FileReader();
    reader.onload = async function (e) {
      var base64Data = e.target.result;
      document.getElementById('psMainImagePreview').src = base64Data;

      // Upload to server / Cloudinary endpoint
      try {
        var uploadRes = await fetch('/api/products/images/upload', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            image_data: base64Data,
            filename: file.name,
            product_id: currentEditingProduct ? currentEditingProduct.id : null,
            image_type: 'main'
          })
        });
        var uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || 'فشل رفع الصورة');

        document.getElementById('psFormMainImageUrl').value = uploadData.image_url;
        notify('✅ تم رفع الصورة بنجاح وتجهيز الرابط الدائم!');
      } catch (err) {
        notify('تنبيه: ' + err.message, 'warning');
      }
    };
    reader.readAsDataURL(file);
  };

  window.addGalleryImageFromPrompt = function () {
    var url = prompt('أدخل رابط الصورة الإضافية (Cloudinary / CDN URL):', 'https://');
    if (url && url.startsWith('http')) {
      galleryImagesArray.push(url.trim());
      renderGalleryThumbnails();
    }
  };

  window.handleGalleryFileUpload = function (input) {
    if (!input.files || !input.files[0]) return;
    var file = input.files[0];

    var reader = new FileReader();
    reader.onload = async function (e) {
      var base64Data = e.target.result;
      try {
        var uploadRes = await fetch('/api/products/images/upload', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            image_data: base64Data,
            filename: file.name,
            product_id: currentEditingProduct ? currentEditingProduct.id : null,
            image_type: 'gallery'
          })
        });
        var uploadData = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadData.error || 'فشل رفع الصورة');

        galleryImagesArray.push(uploadData.image_url);
        renderGalleryThumbnails();
        notify('تم إضافة الصورة للمعرض بنجاح');
      } catch (err) {
        notify(err.message, 'error');
      }
    };
    reader.readAsDataURL(file);
  };

  function renderGalleryThumbnails() {
    var container = document.getElementById('psGalleryThumbnails');
    if (!container) return;

    if (galleryImagesArray.length === 0) {
      container.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);padding:10px;">لا توجد صور إضافية في المعرض</div>';
      return;
    }

    var html = '';
    galleryImagesArray.forEach(function (url, index) {
      html += `
        <div style="position:relative;display:inline-block;width:70px;height:70px;border-radius:6px;border:1px solid var(--border-color);overflow:hidden;background:#fff;margin-left:8px;">
          <img src="${url}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='../images/logo.png'">
          <button onclick="removeGalleryImage(${index})" type="button" style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,0.85);color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;">&times;</button>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  window.removeGalleryImage = function (index) {
    galleryImagesArray.splice(index, 1);
    renderGalleryThumbnails();
  };

  // ============================================================
  // 5. Version History & Non-Destructive Restore
  // ============================================================

  window.openVersionHistoryModal = async function (productId) {
    var modal = document.getElementById('psVersionsModal');
    if (!modal) return;

    var prod = productsList.find(function (p) { return p.id === productId; });
    var titleEl = document.getElementById('psVersionsModalTitle');
    var listContainer = document.getElementById('psVersionsList');

    if (titleEl) titleEl.textContent = 'سجل الإصدارات التاريخية: ' + (prod ? prod.name : '#' + productId);
    listContainer.innerHTML = '<div style="text-align:center;padding:30px;"><i class="fas fa-spinner fa-spin fa-2x" style="color:var(--primary)"></i></div>';

    modal.style.display = 'flex';

    try {
      var res = await fetch(`/api/products/${productId}/versions`, { headers: getAuthHeaders() });
      var versions = await res.json();

      if (!Array.isArray(versions) || versions.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-secondary)">لا توجد نسخ تاريخية مسجلة لهذا المنتج</div>';
        return;
      }

      var html = '<div style="display:flex;flex-direction:column;gap:12px;">';
      versions.forEach(function (v) {
        var isCurrent = (prod && prod.current_version === v.version_number);
        html += `
          <div style="border:1px solid ${isCurrent ? 'var(--primary)' : 'var(--border-color)'};border-radius:8px;padding:14px;background:${isCurrent ? '#f0f9ff' : '#fff'};box-shadow:var(--shadow-sm);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="background:linear-gradient(135deg,var(--brand-burgundy),var(--brand-fuchsia));color:#fff;padding:2px 8px;border-radius:12px;font-weight:700;font-size:12px;">الإصدار v${v.version_number}</span>
                ${isCurrent ? '<span class="status status-active" style="background:#ecfdf5;color:#059669;font-size:11px;">النسخة النشطة حالياً</span>' : ''}
              </div>
              <div style="font-size:12px;color:var(--text-secondary);"><i class="fas fa-clock" style="margin-left:4px;"></i>${(v.created_at || '').substring(0, 16)}</div>
            </div>
            <div style="font-size:13px;color:var(--text-primary);margin-bottom:6px;"><strong>ملخص التغيير:</strong> ${v.change_summary || 'تحديث بيانات المنتج'}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;color:var(--text-secondary);background:var(--bg-main);padding:8px;border-radius:6px;margin-bottom:8px;">
              <div>الاسم: ${v.name}</div>
              <div>السعر: ${v.price ? Number(v.price).toLocaleString() + ' $' : 'غير محدد'}</div>
              <div>المسؤول: ${v.created_by_name || 'مدير النظام'}</div>
              <div>نوع الإجراء: ${v.action_type || 'نشر'}</div>
            </div>
            ${!isCurrent ? `
              <div style="text-align:left;">
                <button class="btn btn-primary btn-sm" onclick="restoreVersionConfirm(${productId}, ${v.version_number})" style="font-size:11px;padding:4px 10px;">
                  <i class="fas fa-undo"></i> استعادة هذه النسخة
                </button>
              </div>
            ` : ''}
          </div>
        `;
      });
      html += '</div>';
      listContainer.innerHTML = html;
    } catch (err) {
      listContainer.innerHTML = '<div style="color:var(--danger);padding:20px;text-align:center;">فشل تحميل سجل النسخ: ' + err.message + '</div>';
    }
  };

  window.closeVersionHistoryModal = function () {
    var modal = document.getElementById('psVersionsModal');
    if (modal) modal.style.display = 'none';
  };

  window.restoreVersionConfirm = async function (productId, versionNumber) {
    if (!confirm(`هل أنت متأكد من استعادة النسخة رقم #${versionNumber}؟\n\nملاحظة أمان: الاستعادة غير تدميرية؛ ستنشئ نسخة جديدة تستعيد مواصفات تلك النسخة دون المساس بحسابات المخزون أو الفواتير.`)) {
      return;
    }

    try {
      var res = await fetch(`/api/products/${productId}/versions/${versionNumber}/restore`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      var result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشل استعادة النسخة');

      notify(`✅ ${result.message}`);
      closeVersionHistoryModal();
      loadProductsSettingsData();
    } catch (err) {
      notify('خطأ أثناء الاستعادة: ' + err.message, 'error');
    }
  };

  // ============================================================
  // 6. Preview Modal
  // ============================================================

  window.openProductPreview = async function (productId) {
    try {
      var res = await fetch(`/api/products/${productId}/preview`, { headers: getAuthHeaders() });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل بيانات المعاينة');

      showPreviewModal(data.preview_data || data.live_product, data.has_draft);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  function showPreviewModal(prod, isDraft) {
    var modal = document.getElementById('psPreviewModal');
    if (!modal) return;

    var container = document.getElementById('psPreviewContainer');
    var badge = isDraft
      ? '<span style="background:#fffbeb;color:#d97706;border:1px solid #fde68a;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;"><i class="fas fa-edit"></i> معاينة مسودة غير منشورة</span>'
      : '<span style="background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;"><i class="fas fa-check-circle"></i> النسخة المنشورة حالياً</span>';

    var featuresList = (prod.features || '').split(/[|\n]/).map(function (f) { return f.trim(); }).filter(Boolean);
    var featuresHtml = featuresList.map(function (f) {
      return `<li style="padding:4px 0;display:flex;align-items:center;gap:6px;"><i class="fas fa-check" style="color:var(--primary);font-size:11px;"></i>${f}</li>`;
    }).join('');

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;border-bottom:1px solid var(--border-color);padding-bottom:12px;">
        <div>
          <h2 style="font-size:18px;margin:0;color:var(--text-primary);">${prod.name}</h2>
          <div style="font-size:13px;color:var(--text-secondary);direction:ltr;text-align:right;">${prod.name_en || prod.model || ''}</div>
        </div>
        <div>${badge}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div style="text-align:center;">
          <img src="${prod.main_image || prod.image || '../images/logo.png'}" style="max-height:220px;max-width:100%;object-fit:contain;border-radius:8px;border:1px solid var(--border-color);background:#fff;padding:8px;" onerror="this.src='../images/logo.png'">
          <div style="font-size:20px;font-weight:700;color:var(--primary);margin-top:12px;">${prod.price ? Number(prod.price).toLocaleString() + ' $' : 'السعر عند الطلب'}</div>
        </div>
        <div>
          <div style="font-weight:600;margin-bottom:4px;">الوصف:</div>
          <p style="font-size:13px;line-height:1.6;color:var(--text-secondary);margin-bottom:12px;">${prod.description || 'لا يوجد وصف مدخل.'}</p>
          <div style="font-weight:600;margin-bottom:4px;">المميزات الرئيسية:</div>
          <ul style="list-style:none;padding:0;margin:0 0 12px 0;font-size:12px;">
            ${featuresHtml || '<li style="color:var(--text-secondary);">لم يتم إدخال مميزات.</li>'}
          </ul>
          ${prod.technical_specs ? `
            <div style="font-weight:600;margin-bottom:4px;">المواصفات الفنية:</div>
            <div style="font-size:12px;background:var(--bg-main);padding:8px;border-radius:6px;border:1px solid var(--border-color);white-space:pre-wrap;">${prod.technical_specs}</div>
          ` : ''}
        </div>
      </div>
    `;

    modal.style.display = 'flex';
  }

  window.closeProductPreview = function () {
    var modal = document.getElementById('psPreviewModal');
    if (modal) modal.style.display = 'none';
  };

  // ============================================================
  // 7. Recycle Bin (Move to Trash, Restore, and Permanent Delete)
  // ============================================================

  window.moveToTrash = async function (productId) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج ونقله إلى سلة المحذوفات؟\n\n(سيختفي فوراً من واجهة الموقع والكتالوج العام، ويمكنك استرجاعه في أي وقت من سلة المحذوفات)')) {
      return;
    }
    try {
      var res = await fetch(`/api/products/${productId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      var result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشلت عملية الحذف');

      notify('🗑️ تم نقل المنتج إلى سلة المحذوفات بنجاح');
      await loadProductsSettingsData();
    } catch (err) {
      notify('خطأ أثناء الحذف: ' + err.message, 'error');
    }
  };

  window.restoreFromTrash = async function (productId) {
    try {
      var res = await fetch(`/api/products/${productId}/restore`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      var result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشل استرجاع المنتج');

      notify('✅ ' + (result.message || 'تم استرجاع المنتج بنجاح وإعادته للموقع'));
      await loadProductsSettingsData();
    } catch (err) {
      notify('خطأ في الاسترجاع: ' + err.message, 'error');
    }
  };

  window.permanentDeleteProduct = async function (productId) {
    if (!confirm('تحذير نهائي: هل أنت متأكد تماماً من حذف هذا المنتج نهائياً من قاعدة البيانات؟\n\nلن يمكنك استعادة هذا المنتج بعد الآن وسيتم إزالته كلياً.')) {
      return;
    }
    try {
      var res = await fetch(`/api/products/${productId}/permanent`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      var result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشل الحذف النهائي');

      notify('🗑️ تم الحذف النهائي للمنتج بنجاح');
      await loadProductsSettingsData();
    } catch (err) {
      notify('خطأ في الحذف النهائي: ' + err.message, 'error');
    }
  };

  window.toggleProductArchive = async function (productId, isCurrentlyArchived) {
    var actionName = isCurrentlyArchived ? 'إلغاء أرشفة' : 'أرشفة';
    if (!confirm(`هل أنت متأكد من ${actionName} هذا المنتج؟\n\nنظام حماية العلاقات: إذا كان المنتج مرتبطاً بفواتير أو مبيعات، فسيتم حمايته عبر الأرشفة المنطقية ولن يُحذف من سجلات المحاسبة.`)) {
      return;
    }

    try {
      var res = await fetch(`/api/products/${productId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      var result = await res.json();
      if (!res.ok) throw new Error(result.error || 'فشلت العملية');

      notify(`✅ ${result.message}`);
      loadProductsSettingsData();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  // ============================================================
  // 8. Auto-Activate Tab if requested in URL
  // ============================================================

  document.addEventListener('DOMContentLoaded', function () {
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'products-settings') {
      var btn = document.getElementById('productSettingsTabBtn');
      if (btn && typeof switchTab === 'function') {
        switchTab(btn, 'products-settings');
      }
    }
  });

})();
