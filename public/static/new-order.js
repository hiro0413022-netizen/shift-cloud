// ゴルフウィング 発注管理 - 新規発注フォーム JS
// PRODUCTS は pages.ts 側でインラインで注入される

// ─── カテゴリーリスト ─────────────────────────────────────
var CATEGORIES = [];
function buildCategories() {
  var set = {};
  PRODUCTS.forEach(function(p) { set[p.item_category || '未分類'] = 1; });
  CATEGORIES = Object.keys(set).sort();
}

// ─── 合計金額の再計算 ──────────────────────────────────────
function recalcTotal() {
  var total = 0;
  document.querySelectorAll('#line-table tbody tr').forEach(function(tr) {
    var upEl  = tr.querySelector('.inp-unit-price');
    var qtyEl = tr.querySelector('.inp-qty');
    var up  = upEl  ? (parseFloat(upEl.value)  || 0) : 0;
    var qty = qtyEl ? (parseInt(qtyEl.value, 10) || 0) : 0;
    total += up * qty;
  });
  var el = document.getElementById('total-amount');
  if (el) el.textContent = total > 0 ? '\u00a5' + total.toLocaleString('ja-JP') : '\u2015';
}

// ─── 単価を自動計算（定価×掛率）─────────────────────────
function calcUnitPrice(tr) {
  var lpEl = tr.querySelector('.inp-list-price');
  var rtEl = tr.querySelector('.inp-rate');
  var upEl = tr.querySelector('.inp-unit-price');
  var lp = lpEl ? (parseFloat(lpEl.value) || 0) : 0;
  var rt = rtEl ? (parseFloat(rtEl.value) || 0) : 0;
  if (lp > 0 && rt > 0 && upEl && !upEl.dataset.manual) {
    upEl.value = Math.round(lp * rt);
  }
  recalcTotal();
}

// ─── HTML エスケープ ───────────────────────────────────────
function escH(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── 行インデックス ────────────────────────────────────────
var rowIndex = 0;

// ─── 行を追加 ─────────────────────────────────────────────
function addRow(prefill) {
  var tbody = document.querySelector('#line-table tbody');
  var idx   = rowIndex++;
  var p     = prefill || {};
  var tr    = document.createElement('tr');
  tr.dataset.idx = String(idx);

  // [0] 商品選択セル
  var tdPick = document.createElement('td');
  tdPick.style.whiteSpace = 'nowrap';

  var hidIdx = document.createElement('input');
  hidIdx.type = 'hidden'; hidIdx.name = 'row_index'; hidIdx.value = String(idx);

  var hidPid = document.createElement('input');
  hidPid.type = 'hidden'; hidPid.className = 'inp-product-id';
  hidPid.name = 'product_id_' + idx; hidPid.value = p.id ? String(p.id) : '';

  var btnPick = document.createElement('button');
  btnPick.type = 'button';
  btnPick.className = 'btn btn-sm btn-outline-success btn-pick me-1';
  btnPick.title = '商品を選択';
  btnPick.innerHTML = '<i class="fas fa-search"></i>';

  var lblPick = document.createElement('span');
  lblPick.className = 'picked-label text-primary small fw-bold';
  if (p.id) {
    lblPick.textContent = [p.item_category, p.manufacturer, p.name].filter(Boolean).join(' / ');
  }

  tdPick.appendChild(hidIdx);
  tdPick.appendChild(hidPid);
  tdPick.appendChild(btnPick);
  tdPick.appendChild(lblPick);

  // テキスト系セルを一括生成
  function mkTd(name, val, placeholder, minW) {
    var td = document.createElement('td');
    var inp = document.createElement('input');
    inp.className = 'form-control form-control-sm';
    inp.name = name + '_' + idx;
    inp.value = val || '';
    inp.placeholder = placeholder || '';
    inp.style.minWidth = minW || '80px';
    td.appendChild(inp);
    return { td: td, inp: inp };
  }

  var fIC  = mkTd('item_category', p.item_category, '品目',    '72px');
  var fMF  = mkTd('manufacturer',  p.manufacturer,  'メーカー', '90px');
  var fNM  = mkTd('product_name',  p.name,          '商品名',  '150px');
  var fSP  = mkTd('spec',          p.spec,          '仕様',    '60px');
  var fCL  = mkTd('color',         '',              '色',      '55px');
  var fCT  = mkTd('club_type',     p.club_type,     '種類',    '65px');

  // 数値系セル
  function mkNumTd(name, extraClass, step, min, max, val, minW, placeholder) {
    var td  = document.createElement('td');
    var inp = document.createElement('input');
    inp.type = 'number';
    inp.className = 'form-control form-control-sm ' + (extraClass || '');
    inp.name = name + '_' + idx;
    inp.step = step || '1';
    inp.min  = min  || '0';
    if (max) inp.max = max;
    if (val !== undefined && val !== null && val !== '') inp.value = String(val);
    if (placeholder) inp.placeholder = placeholder;
    inp.style.minWidth = minW || '80px';
    td.appendChild(inp);
    return { td: td, inp: inp };
  }

  var fQty = mkNumTd('quantity',   'inp-qty text-center',      '1',     '1',  null, 1,              '55px');
  var fLP  = mkNumTd('list_price', 'inp-list-price text-end',  '1',     '0',  null, p.list_price,   '80px');
  var fRT  = mkNumTd('rate',       'inp-rate text-end',        '0.001', '0',  '1',  p.default_rate, '68px', '0.55');
  var fUP  = mkNumTd('unit_price', 'inp-unit-price text-end',  '1',     '0',  null, null,           '80px');
  var fLN  = mkTd('line_note', '', '備考', '90px');

  // 削除ボタンセル
  var tdRem = document.createElement('td');
  tdRem.style.whiteSpace = 'nowrap';
  var btnRem = document.createElement('button');
  btnRem.type = 'button';
  btnRem.className = 'btn btn-sm btn-outline-danger btn-rem';
  btnRem.title = '削除';
  btnRem.innerHTML = '<i class="fas fa-trash"></i>';
  tdRem.appendChild(btnRem);

  // 行に追加
  [tdPick, fIC.td, fMF.td, fNM.td, fSP.td, fCL.td, fCT.td,
   fQty.td, fLP.td, fRT.td, fUP.td, fLN.td, tdRem].forEach(function(td) {
    tr.appendChild(td);
  });
  tbody.appendChild(tr);

  // イベント
  btnPick.addEventListener('click', function() { openProductModal(tr); });
  btnRem.addEventListener('click',  function() { tr.remove(); recalcTotal(); });

  fLP.inp.addEventListener('input', function() { calcUnitPrice(tr); });
  fRT.inp.addEventListener('input', function() { calcUnitPrice(tr); });
  fUP.inp.addEventListener('input', function() {
    fUP.inp.dataset.manual = '1';
    recalcTotal();
  });
  fQty.inp.addEventListener('input', recalcTotal);

  if (p.list_price && p.default_rate) calcUnitPrice(tr);

  return tr;
}

// ─── 商品を行にセット ──────────────────────────────────────
function fillRow(tr, p) {
  var idx = tr.dataset.idx;
  tr.querySelector('.inp-product-id').value = p.id ? String(p.id) : '';
  var lbl = tr.querySelector('.picked-label');
  lbl.textContent = [p.item_category, p.manufacturer, p.name].filter(Boolean).join(' / ');

  var fields = {
    item_category: p.item_category || '',
    manufacturer:  p.manufacturer  || '',
    product_name:  p.name          || '',
    spec:          p.spec          || '',
    club_type:     p.club_type     || ''
  };
  Object.keys(fields).forEach(function(k) {
    var el = tr.querySelector('[name="' + k + '_' + idx + '"]');
    if (el) el.value = fields[k];
  });

  var lpEl = tr.querySelector('.inp-list-price');
  var rtEl = tr.querySelector('.inp-rate');
  var upEl = tr.querySelector('.inp-unit-price');
  if (lpEl) lpEl.value = p.list_price    ? String(p.list_price)    : '';
  if (rtEl) rtEl.value = p.default_rate  ? String(p.default_rate)  : '';
  if (upEl) { delete upEl.dataset.manual; upEl.value = ''; }
  calcUnitPrice(tr);
}

// ══════════════════════════════════════════════════════════
// モーダル状態管理
// ══════════════════════════════════════════════════════════
var _modalTr       = null;
var _selCategory   = null;
var _selManufacturer = null;
// ソート状態
var _mfSort   = 'name';   // 'name' | 'count'  メーカーソート
var _prodSort = 'name';   // 'name' | 'price'  商品ソート
var _prodSortDir = 1;     // 1=昇順 / -1=降順

// ─── メーカー一覧を取得（ソート済み）────────────────────
function getManufacturers(category) {
  var map = {};
  PRODUCTS.forEach(function(p) {
    if (!category || (p.item_category || '未分類') === category) {
      var mf = p.manufacturer || '(メーカー不明)';
      map[mf] = (map[mf] || 0) + 1;
    }
  });
  var list = Object.keys(map).map(function(k) { return { name: k, count: map[k] }; });
  if (_mfSort === 'count') {
    list.sort(function(a, b) { return b.count - a.count || a.name.localeCompare(b.name, 'ja'); });
  } else {
    list.sort(function(a, b) { return a.name.localeCompare(b.name, 'ja'); });
  }
  return list;
}

// ─── 商品一覧をフィルタ＆ソート ──────────────────────────
function getFilteredProducts(category, manufacturer, searchQ) {
  var q = (searchQ || '').trim().toLowerCase();
  var result = PRODUCTS.filter(function(p) {
    var catOk = !category     || (p.item_category || '未分類') === category;
    var mfOk  = !manufacturer || (p.manufacturer  || '(メーカー不明)') === manufacturer;
    var qOk   = !q ||
      (p.name         || '').toLowerCase().indexOf(q) >= 0 ||
      (p.manufacturer || '').toLowerCase().indexOf(q) >= 0 ||
      (p.spec         || '').toLowerCase().indexOf(q) >= 0 ||
      (p.club_type    || '').toLowerCase().indexOf(q) >= 0;
    return catOk && mfOk && qOk;
  });

  // ソート
  result.sort(function(a, b) {
    var va, vb;
    if (_prodSort === 'price') {
      va = a.list_price || 0;
      vb = b.list_price || 0;
      if (va !== vb) return (va - vb) * _prodSortDir;
      return (a.name || '').localeCompare(b.name || '', 'ja');
    } else {
      // name ソート: メーカー→商品名
      var mfCmp = (a.manufacturer || '').localeCompare(b.manufacturer || '', 'ja') * _prodSortDir;
      if (mfCmp !== 0) return mfCmp;
      return (a.name || '').localeCompare(b.name || '', 'ja') * _prodSortDir;
    }
  });
  return result;
}

// ─── モーダルを開く ───────────────────────────────────────
function openProductModal(tr) {
  _modalTr         = tr;
  _selCategory     = null;
  _selManufacturer = null;
  var si = document.getElementById('modal-search');
  if (si) si.value = '';
  document.getElementById('modal-search-wrap').style.display = 'none';
  renderModalStep('category');
  var el    = document.getElementById('productModal');
  var modal = bootstrap.Modal.getOrCreateInstance(el);
  modal.show();
  // モーダルが開いてからカテゴリ検索欄にフォーカス
  el.addEventListener('shown.bs.modal', function onShown() {
    var cs = document.getElementById('cat-search');
    if (cs) cs.focus();
    el.removeEventListener('shown.bs.modal', onShown);
  });
}

// ─── ソートアイコン文字列 ────────────────────────────────
function sortIcon(active, dir) {
  if (!active) return '<i class="fas fa-sort text-muted ms-1" style="opacity:.4"></i>';
  return dir === 1
    ? '<i class="fas fa-sort-up text-primary ms-1"></i>'
    : '<i class="fas fa-sort-down text-primary ms-1"></i>';
}

// ══════════════════════════════════════════════════════════
// モーダル各ステップ描画
// ══════════════════════════════════════════════════════════
function renderModalStep(step) {
  var body      = document.getElementById('modal-body');
  var titleEl   = document.getElementById('modal-title');
  var backBtn   = document.getElementById('modal-back');
  var searchWrap = document.getElementById('modal-search-wrap');

  // 商品ステップのみ右上検索欄を表示
  searchWrap.style.display = (step === 'product') ? '' : 'none';

  // ────────────────────────────────────────────────────────
  // STEP 1: カテゴリー選択
  // ────────────────────────────────────────────────────────
  if (step === 'category') {
    titleEl.textContent = 'カテゴリーを選択';
    backBtn.style.display = 'none';
    backBtn.onclick = null;

    var wrap = document.createElement('div');

    // ── インライン検索ボックス
    var searchDiv = document.createElement('div');
    searchDiv.className = 'px-3 pt-2 pb-1 border-bottom';
    searchDiv.innerHTML =
      '<div class="input-group input-group-sm">' +
        '<span class="input-group-text bg-white border-end-0"><i class="fas fa-search text-muted"></i></span>' +
        '<input id="cat-search" type="text" class="form-control border-start-0 ps-0" placeholder="カテゴリーを絞り込み…">' +
      '</div>';
    wrap.appendChild(searchDiv);

    var ul = document.createElement('div');
    ul.id = 'cat-list';
    ul.className = 'list-group list-group-flush';
    wrap.appendChild(ul);

    function renderCatList(filter) {
      ul.innerHTML = '';
      var filtered = CATEGORIES.filter(function(cat) {
        return !filter || cat.toLowerCase().indexOf(filter.toLowerCase()) >= 0;
      });

      filtered.forEach(function(cat) {
        var cnt = PRODUCTS.filter(function(p) {
          return (p.item_category || '未分類') === cat;
        }).length;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
        btn.innerHTML =
          '<span><i class="fas fa-tag me-2 text-primary"></i>' + escH(cat) + '</span>' +
          '<span class="badge bg-secondary rounded-pill">' + cnt + '点</span>';
        btn.addEventListener('click', function() {
          _selCategory = cat;
          renderModalStep('manufacturer');
        });
        ul.appendChild(btn);
      });

      // 全商品
      var btnAll = document.createElement('button');
      btnAll.type = 'button';
      btnAll.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center text-muted';
      btnAll.innerHTML =
        '<span><i class="fas fa-layer-group me-2 text-secondary"></i>全商品から選ぶ</span>' +
        '<span class="badge bg-light text-dark rounded-pill border">' + PRODUCTS.length + '点</span>';
      btnAll.addEventListener('click', function() {
        _selCategory = null;
        renderModalStep('manufacturer');
      });
      ul.appendChild(btnAll);
    }

    renderCatList('');
    body.innerHTML = '';
    body.appendChild(wrap);

    // カテゴリ検索イベント
    var catSearchEl = document.getElementById('cat-search');
    catSearchEl.addEventListener('input', function() {
      renderCatList(this.value);
    });

  // ────────────────────────────────────────────────────────
  // STEP 2: メーカー選択
  // ────────────────────────────────────────────────────────
  } else if (step === 'manufacturer') {
    titleEl.textContent = (_selCategory || '全商品') + ' › メーカーを選択';
    backBtn.style.display = '';
    backBtn.onclick = function() { renderModalStep('category'); };

    var wrap2 = document.createElement('div');

    // ── ツールバー（件数表示 + ソート切り替え）
    var toolbar2 = document.createElement('div');
    toolbar2.className = 'px-3 py-2 border-bottom d-flex align-items-center justify-content-between bg-light';
    toolbar2.innerHTML =
      '<small class="text-muted" id="mf-count-label"></small>' +
      '<div class="btn-group btn-group-sm" role="group">' +
        '<button type="button" id="mf-sort-name" class="btn ' + (_mfSort === 'name' ? 'btn-primary' : 'btn-outline-secondary') + '">' +
          '<i class="fas fa-sort-alpha-down me-1"></i>あいうえお順' +
        '</button>' +
        '<button type="button" id="mf-sort-count" class="btn ' + (_mfSort === 'count' ? 'btn-primary' : 'btn-outline-secondary') + '">' +
          '<i class="fas fa-sort-amount-down me-1"></i>件数順' +
        '</button>' +
      '</div>';
    wrap2.appendChild(toolbar2);

    // ── メーカー検索ボックス
    var mfSearchDiv = document.createElement('div');
    mfSearchDiv.className = 'px-3 pt-2 pb-1 border-bottom';
    mfSearchDiv.innerHTML =
      '<div class="input-group input-group-sm">' +
        '<span class="input-group-text bg-white border-end-0"><i class="fas fa-industry text-muted"></i></span>' +
        '<input id="mf-search" type="text" class="form-control border-start-0 ps-0" placeholder="メーカーを絞り込み…">' +
      '</div>';
    wrap2.appendChild(mfSearchDiv);

    var ul2 = document.createElement('div');
    ul2.id = 'mf-list';
    ul2.className = 'list-group list-group-flush';
    wrap2.appendChild(ul2);

    function renderMfList(filter) {
      ul2.innerHTML = '';
      var mfs = getManufacturers(_selCategory);
      if (filter) {
        mfs = mfs.filter(function(m) {
          return m.name.toLowerCase().indexOf(filter.toLowerCase()) >= 0;
        });
      }
      document.getElementById('mf-count-label').textContent = mfs.length + 'メーカー';

      mfs.forEach(function(mf) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
        btn.innerHTML =
          '<span class="text-truncate" style="max-width:220px">' +
            '<i class="fas fa-industry me-2 text-success"></i>' + escH(mf.name) +
          '</span>' +
          '<span class="badge bg-secondary rounded-pill flex-shrink-0">' + mf.count + '点</span>';
        btn.addEventListener('click', function() {
          _selManufacturer = mf.name;
          renderModalStep('product');
        });
        ul2.appendChild(btn);
      });

      // 全メーカー
      var total = PRODUCTS.filter(function(p) {
        return !_selCategory || (p.item_category || '未分類') === _selCategory;
      }).length;
      var btnAllMf = document.createElement('button');
      btnAllMf.type = 'button';
      btnAllMf.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center text-muted';
      btnAllMf.innerHTML =
        '<span><i class="fas fa-th me-2 text-secondary"></i>全メーカーを表示</span>' +
        '<span class="badge bg-light text-dark rounded-pill border">' + total + '点</span>';
      btnAllMf.addEventListener('click', function() {
        _selManufacturer = null;
        renderModalStep('product');
      });
      ul2.appendChild(btnAllMf);
    }

    body.innerHTML = '';
    body.appendChild(wrap2);
    renderMfList('');

    // ソートボタン
    document.getElementById('mf-sort-name').addEventListener('click', function() {
      _mfSort = 'name';
      renderModalStep('manufacturer');
    });
    document.getElementById('mf-sort-count').addEventListener('click', function() {
      _mfSort = 'count';
      renderModalStep('manufacturer');
    });

    // メーカー検索
    document.getElementById('mf-search').addEventListener('input', function() {
      renderMfList(this.value);
    });
    document.getElementById('mf-search').focus();

  // ────────────────────────────────────────────────────────
  // STEP 3: 商品選択
  // ────────────────────────────────────────────────────────
  } else if (step === 'product') {
    var label = (_selCategory || '全商品') + (_selManufacturer ? ' › ' + _selManufacturer : ' › 全メーカー');
    titleEl.textContent = label;
    backBtn.style.display = '';
    backBtn.onclick = function() { renderModalStep('manufacturer'); };

    // 右上の検索欄
    var searchQ = (document.getElementById('modal-search').value || '').trim();

    var wrap3 = document.createElement('div');

    // ── ツールバー（件数 + ソート切り替え）
    var toolbar3 = document.createElement('div');
    toolbar3.className = 'px-3 py-2 border-bottom d-flex align-items-center justify-content-between bg-light flex-wrap gap-1';
    toolbar3.innerHTML =
      '<small class="text-muted" id="prod-count-label"></small>' +
      '<div class="d-flex gap-1 align-items-center">' +
        // ソート列選択
        '<div class="btn-group btn-group-sm" role="group">' +
          '<button type="button" id="ps-name"  class="btn ' + (_prodSort === 'name'  ? 'btn-primary' : 'btn-outline-secondary') + '">' +
            '<i class="fas fa-sort-alpha-down me-1"></i>名前順' +
          '</button>' +
          '<button type="button" id="ps-price" class="btn ' + (_prodSort === 'price' ? 'btn-primary' : 'btn-outline-secondary') + '">' +
            '<i class="fas fa-yen-sign me-1"></i>定価順' +
          '</button>' +
        '</div>' +
        // 昇順/降順
        '<button type="button" id="ps-dir" class="btn btn-sm btn-outline-secondary" title="昇順/降順切り替え">' +
          (_prodSortDir === 1 ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>') +
        '</button>' +
      '</div>';
    wrap3.appendChild(toolbar3);

    var ul3 = document.createElement('div');
    ul3.id = 'prod-list';
    ul3.className = 'list-group list-group-flush';
    wrap3.appendChild(ul3);

    function renderProdList(q) {
      ul3.innerHTML = '';
      var prods = getFilteredProducts(_selCategory, _selManufacturer, q);
      var countEl = document.getElementById('prod-count-label');
      if (countEl) countEl.textContent = prods.length + '件';

      if (!prods.length) {
        ul3.innerHTML =
          '<div class="text-center text-muted py-5">' +
            '<i class="fas fa-box-open fa-2x mb-2 d-block"></i>該当商品がありません' +
          '</div>';
        return;
      }

      // メーカーが混在する場合（全メーカー表示時）はメーカー別グループヘッダーを出す
      var showMfHeader = !_selManufacturer && _prodSort === 'name';
      var lastMf = null;

      prods.forEach(function(p) {
        // メーカーグループヘッダー
        if (showMfHeader) {
          var mf = p.manufacturer || '(メーカー不明)';
          if (mf !== lastMf) {
            lastMf = mf;
            var hdr = document.createElement('div');
            hdr.className = 'list-group-item bg-light py-1 px-3 d-flex align-items-center border-start border-3 border-success';
            hdr.style.cssText = 'position:sticky;top:0;z-index:1';
            hdr.innerHTML =
              '<i class="fas fa-industry me-2 text-success small"></i>' +
              '<span class="fw-bold small">' + escH(mf) + '</span>';
            ul3.appendChild(hdr);
          }
        }

        var price = p.list_price
          ? '<span class="fw-bold text-primary">\u00a5' + Number(p.list_price).toLocaleString('ja-JP') + '</span>'
          : '<span class="text-muted">—</span>';
        var rate = p.default_rate
          ? '<small class="text-muted ms-1">掛率 ' + (Math.round(p.default_rate * 1000) / 10).toFixed(1) + '%</small>'
          : '';
        var badges = '';
        if (p.club_type) {
          var ctColors = { DR: 'danger', FW: 'success', UT: 'warning', IR: 'secondary', PT: 'dark', 'DR/FW': 'info' };
          var ctColor = ctColors[p.club_type] || 'secondary';
          badges += '<span class="badge bg-' + ctColor + ' ms-1">' + escH(p.club_type) + '</span>';
        }
        var specTxt = p.spec ? '<small class="text-muted"> / ' + escH(p.spec) + '</small>' : '';

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'list-group-item list-group-item-action py-2 px-3';
        btn.innerHTML =
          '<div class="d-flex justify-content-between align-items-start gap-2">' +
            '<div class="flex-grow-1 overflow-hidden">' +
              '<div class="fw-semibold text-truncate">' + escH(p.name) + badges + '</div>' +
              '<div class="small text-muted text-truncate">' +
                escH(p.manufacturer || '') + specTxt +
              '</div>' +
            '</div>' +
            '<div class="text-end flex-shrink-0">' +
              price + rate +
            '</div>' +
          '</div>';

        btn.addEventListener('click', function() {
          if (_modalTr) fillRow(_modalTr, p);
          bootstrap.Modal.getInstance(document.getElementById('productModal')).hide();
        });
        ul3.appendChild(btn);
      });
    }

    body.innerHTML = '';
    body.appendChild(wrap3);
    renderProdList(searchQ);

    // ソートボタンのイベント
    document.getElementById('ps-name').addEventListener('click', function() {
      if (_prodSort === 'name') { _prodSortDir *= -1; }
      else { _prodSort = 'name'; _prodSortDir = 1; }
      renderModalStep('product');
    });
    document.getElementById('ps-price').addEventListener('click', function() {
      if (_prodSort === 'price') { _prodSortDir *= -1; }
      else { _prodSort = 'price'; _prodSortDir = 1; }
      renderModalStep('product');
    });
    document.getElementById('ps-dir').addEventListener('click', function() {
      _prodSortDir *= -1;
      renderModalStep('product');
    });

    // 右上検索欄のリアルタイム絞り込み
    var modalSearch = document.getElementById('modal-search');
    modalSearch.oninput = function() {
      renderProdList(this.value.trim());
    };
    modalSearch.focus();
  }
}

// ─── 発注フォーム送信 ──────────────────────────────────────
function submitOrderForm(e) {
  e.preventDefault();
  var form = e.target;
  var indexes = Array.from(form.querySelectorAll('input[name="row_index"]')).map(function(el) { return el.value; });
  var lines = indexes.map(function(idx) {
    function val(name) {
      var el = form.querySelector('[name="' + name + '_' + idx + '"]');
      return el ? el.value : '';
    }
    return {
      product_id:    form.querySelector('[name="product_id_' + idx + '"]')
                       ? (form.querySelector('[name="product_id_' + idx + '"]').value || null) : null,
      item_category: val('item_category'),
      manufacturer:  val('manufacturer'),
      product_name:  val('product_name'),
      spec:          val('spec'),
      color:         val('color'),
      club_type:     val('club_type'),
      quantity:      parseInt(val('quantity'), 10) || 0,
      list_price:    parseFloat(val('list_price')) || null,
      rate:          parseFloat(val('rate'))        || null,
      unit_price:    parseFloat(val('unit_price'))  || null,
      line_note:     val('line_note')
    };
  }).filter(function(l) { return (l.product_name || l.item_category) && l.quantity > 0; });

  if (!lines.length) { showFlash('発注明細を1件以上入力してください。', 'danger'); return; }

  var payload = {
    ordered_by:              form.querySelector('[name="ordered_by"]').value,
    order_date:              form.querySelector('[name="order_date"]').value,
    customer_name:           form.querySelector('[name="customer_name"]').value,
    usage_type:              form.querySelector('[name="usage_type"]').value,
    requested_delivery_date: form.querySelector('[name="requested_delivery_date"]').value,
    order_note:              form.querySelector('[name="order_note"]').value,
    lines: lines
  };

  if (!payload.ordered_by) { showFlash('発注者を入力してください。', 'danger'); return; }

  var btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>処理中...';

  fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
  .then(function(res) {
    if (res.ok) {
      showFlash('発注を作成しました！', 'success');
      var firstId = res.d.order_ids ? res.d.order_ids[0] : res.d.id;
      setTimeout(function() { location.href = '/orders/' + firstId; }, 800);
    } else {
      showFlash(res.d.error || '発注作成に失敗しました', 'danger');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>発注を確定する';
    }
  })
  .catch(function() {
    showFlash('通信エラーが発生しました', 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>発注を確定する';
  });
}

// ─── フラッシュメッセージ ─────────────────────────────────
function showFlash(msg, type) {
  var el = document.getElementById('flash-msg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'flash-msg';
    el.style.cssText = 'position:fixed;top:70px;right:20px;z-index:9999;min-width:260px';
    document.body.appendChild(el);
  }
  el.innerHTML =
    '<div class="alert alert-' + type + ' alert-dismissible shadow-sm fade show mb-0" role="alert">' +
      escH(msg) +
      '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>' +
    '</div>';
}

// ─── 初期化 ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  buildCategories();
  addRow();  // 初期1行

  var form = document.getElementById('order-form');
  if (form) form.addEventListener('submit', submitOrderForm);

  var addBtn = document.getElementById('add-row');
  if (addBtn) addBtn.addEventListener('click', function() { addRow(); });
});
