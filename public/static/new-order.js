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
    var upEl = tr.querySelector('.inp-unit-price');
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
  var lpEl  = tr.querySelector('.inp-list-price');
  var rtEl  = tr.querySelector('.inp-rate');
  var upEl  = tr.querySelector('.inp-unit-price');
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

  // セルを個別に生成（文字列連結でエスケープ問題を回避）
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

  var fIC  = mkTd('item_category',  p.item_category,  '品目',   '72px');
  var fMF  = mkTd('manufacturer',   p.manufacturer,   'メーカー', '90px');
  var fNM  = mkTd('product_name',   p.name,           '商品名',  '150px');
  var fSP  = mkTd('spec',           p.spec,           '仕様',   '60px');
  var fCL  = mkTd('color',          '',               '色',    '55px');
  var fCT  = mkTd('club_type',      p.club_type,      '種類',   '65px');

  // 数値系セル
  function mkNumTd(name, extraClass, step, min, max, val, minW, placeholder) {
    var td = document.createElement('td');
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

  var fQty = mkNumTd('quantity',   'inp-qty text-center',        '1',     '1',   null,   1,           '55px');
  var fLP  = mkNumTd('list_price', 'inp-list-price text-end',    '1',     '0',   null,   p.list_price,'80px');
  var fRT  = mkNumTd('rate',       'inp-rate text-end',          '0.001', '0',   '1',    p.default_rate, '68px', '0.55');
  var fUP  = mkNumTd('unit_price', 'inp-unit-price text-end',    '1',     '0',   null,   null,        '80px');
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
  btnRem.addEventListener('click', function() { tr.remove(); recalcTotal(); });

  fLP.inp.addEventListener('input', function() { calcUnitPrice(tr); });
  fRT.inp.addEventListener('input', function() { calcUnitPrice(tr); });
  fUP.inp.addEventListener('input', function() {
    fUP.inp.dataset.manual = '1'; // 手動入力フラグ
    recalcTotal();
  });
  fQty.inp.addEventListener('input', recalcTotal);

  // 商品が事前設定されていれば単価計算
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
  if (lpEl) lpEl.value = p.list_price ? String(p.list_price) : '';
  if (rtEl) rtEl.value = p.default_rate ? String(p.default_rate) : '';
  if (upEl) { delete upEl.dataset.manual; upEl.value = ''; }
  calcUnitPrice(tr);
}

// ─── モーダル状態 ──────────────────────────────────────────
var _modalTr = null;
var _selCategory = null;
var _selManufacturer = null;

function getManufacturers(category) {
  var map = {};
  PRODUCTS.forEach(function(p) {
    if (!category || (p.item_category || '未分類') === category) {
      map[p.manufacturer || '(メーカー不明)'] = 1;
    }
  });
  return Object.keys(map).sort();
}

function getFilteredProducts(category, manufacturer, searchQ) {
  var q = (searchQ || '').toLowerCase();
  return PRODUCTS.filter(function(p) {
    var catOk = !category || (p.item_category || '未分類') === category;
    var mfOk  = !manufacturer || (p.manufacturer || '(メーカー不明)') === manufacturer;
    var qOk   = !q ||
      (p.name || '').toLowerCase().indexOf(q) >= 0 ||
      (p.manufacturer || '').toLowerCase().indexOf(q) >= 0 ||
      (p.spec || '').toLowerCase().indexOf(q) >= 0 ||
      (p.club_type || '').toLowerCase().indexOf(q) >= 0;
    return catOk && mfOk && qOk;
  });
}

// ─── モーダルを開く ───────────────────────────────────────
function openProductModal(tr) {
  _modalTr = tr;
  _selCategory = null;
  _selManufacturer = null;
  document.getElementById('modal-search').value = '';
  document.getElementById('modal-search-wrap').style.display = 'none';
  renderModalStep('category');
  var el = document.getElementById('productModal');
  var modal = bootstrap.Modal.getOrCreateInstance(el);
  modal.show();
}

// ─── モーダルのステップを描画 ─────────────────────────────
function renderModalStep(step) {
  var body     = document.getElementById('modal-body');
  var titleEl  = document.getElementById('modal-title');
  var backBtn  = document.getElementById('modal-back');
  var searchWrap = document.getElementById('modal-search-wrap');
  var searchQ  = document.getElementById('modal-search').value;

  // 検索欄は商品一覧ステップのみ表示
  searchWrap.style.display = (step === 'product') ? '' : 'none';

  if (step === 'category') {
    titleEl.textContent = 'カテゴリーを選択';
    backBtn.style.display = 'none';
    backBtn.onclick = null;

    var ul = document.createElement('div');
    ul.className = 'list-group list-group-flush';

    CATEGORIES.forEach(function(cat) {
      var cnt = PRODUCTS.filter(function(p) { return (p.item_category || '未分類') === cat; }).length;
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
    btnAll.className = 'list-group-item list-group-item-action text-muted';
    btnAll.innerHTML = '<i class="fas fa-list me-2"></i>全商品から選ぶ (' + PRODUCTS.length + '点)';
    btnAll.addEventListener('click', function() {
      _selCategory = null;
      renderModalStep('manufacturer');
    });
    ul.appendChild(btnAll);

    body.innerHTML = '';
    body.appendChild(ul);

  } else if (step === 'manufacturer') {
    titleEl.textContent = (_selCategory || '全商品') + ' › メーカーを選択';
    backBtn.style.display = '';
    backBtn.onclick = function() { renderModalStep('category'); };

    var mfs = getManufacturers(_selCategory);
    var ul2 = document.createElement('div');
    ul2.className = 'list-group list-group-flush';

    mfs.forEach(function(mf) {
      var cnt = PRODUCTS.filter(function(p) {
        return (!_selCategory || (p.item_category || '未分類') === _selCategory) &&
               (p.manufacturer || '(メーカー不明)') === mf;
      }).length;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
      btn.innerHTML =
        '<span><i class="fas fa-industry me-2 text-success"></i>' + escH(mf) + '</span>' +
        '<span class="badge bg-secondary rounded-pill">' + cnt + '点</span>';
      btn.addEventListener('click', function() {
        _selManufacturer = mf;
        renderModalStep('product');
      });
      ul2.appendChild(btn);
    });

    // 全メーカー
    var btnAllMf = document.createElement('button');
    btnAllMf.type = 'button';
    btnAllMf.className = 'list-group-item list-group-item-action text-muted';
    btnAllMf.innerHTML = '<i class="fas fa-th me-2"></i>全メーカーを表示';
    btnAllMf.addEventListener('click', function() {
      _selManufacturer = null;
      renderModalStep('product');
    });
    ul2.appendChild(btnAllMf);

    body.innerHTML = '';
    body.appendChild(ul2);

  } else if (step === 'product') {
    var label = (_selCategory || '全商品') + (_selManufacturer ? ' › ' + _selManufacturer : '') + ' › 商品を選択';
    titleEl.textContent = label;
    backBtn.style.display = '';
    backBtn.onclick = function() { renderModalStep('manufacturer'); };

    var prods = getFilteredProducts(_selCategory, _selManufacturer, searchQ);

    body.innerHTML = '';
    if (!prods.length) {
      body.innerHTML = '<div class="text-center text-muted py-5"><i class="fas fa-box-open fa-2x mb-2 d-block"></i>該当商品がありません</div>';
      return;
    }

    var ul3 = document.createElement('div');
    ul3.className = 'list-group list-group-flush';

    prods.forEach(function(p) {
      var price = p.list_price ? '\u00a5' + Number(p.list_price).toLocaleString('ja-JP') : '';
      var rate  = p.default_rate ? '掛率 ' + p.default_rate : '';
      var spec  = [p.spec, p.club_type].filter(Boolean).join(' / ');

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'list-group-item list-group-item-action py-2';
      btn.innerHTML =
        '<div class="d-flex justify-content-between align-items-start gap-2">' +
          '<div class="flex-grow-1">' +
            '<div class="fw-bold">' + escH(p.name) + '</div>' +
            '<div class="small text-muted">' +
              escH(p.manufacturer || '') +
              (spec ? ' &nbsp;|&nbsp; ' + escH(spec) : '') +
            '</div>' +
          '</div>' +
          '<div class="text-end flex-shrink-0">' +
            '<div class="fw-bold text-primary small">' + escH(price) + '</div>' +
            (rate ? '<div class="small text-muted">' + escH(rate) + '</div>' : '') +
          '</div>' +
        '</div>';

      btn.addEventListener('click', function() {
        if (_modalTr) fillRow(_modalTr, p);
        bootstrap.Modal.getInstance(document.getElementById('productModal')).hide();
      });
      ul3.appendChild(btn);
    });

    body.appendChild(ul3);
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
      product_id:    form.querySelector('[name="product_id_' + idx + '"]') ? (form.querySelector('[name="product_id_' + idx + '"]').value || null) : null,
      item_category: val('item_category'),
      manufacturer:  val('manufacturer'),
      product_name:  val('product_name'),
      spec:          val('spec'),
      color:         val('color'),
      club_type:     val('club_type'),
      quantity:      parseInt(val('quantity'), 10) || 0,
      list_price:    parseFloat(val('list_price')) || null,
      rate:          parseFloat(val('rate'))       || null,
      unit_price:    parseFloat(val('unit_price')) || null,
      line_note:     val('line_note')
    };
  }).filter(function(l) { return (l.product_name || l.item_category) && l.quantity > 0; });

  if (!lines.length) { showFlash('発注明細を1件以上入力してください。', 'danger'); return; }

  var payload = {
    ordered_by:               form.querySelector('[name="ordered_by"]').value,
    order_date:               form.querySelector('[name="order_date"]').value,
    customer_name:            form.querySelector('[name="customer_name"]').value,
    usage_type:               form.querySelector('[name="usage_type"]').value,
    requested_delivery_date:  form.querySelector('[name="requested_delivery_date"]').value,
    order_note:               form.querySelector('[name="order_note"]').value,
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
  }).then(function(resp) {
    return resp.json().then(function(result) {
      if (!resp.ok) {
        showFlash(result.error || '発注作成に失敗しました', 'danger');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>発注データとメール下書きを作成';
        return;
      }
      window.location.href = '/mail-batch/' + result.batch_code;
    });
  }).catch(function(err) {
    showFlash('通信エラー: ' + err.message, 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>発注データとメール下書きを作成';
  });
}

// ─── 初期化 ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
  buildCategories();

  // モーダル検索
  document.getElementById('modal-search').addEventListener('input', function() {
    renderModalStep('product');
  });

  // 行追加ボタン
  document.getElementById('add-row').addEventListener('click', function() { addRow(); });

  // フォーム送信
  document.getElementById('order-form').addEventListener('submit', submitOrderForm);

  // 初期行を2行追加
  addRow();
  addRow();
});
