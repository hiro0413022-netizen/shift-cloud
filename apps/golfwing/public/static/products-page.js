// ============================================================
// 商品マスタページ JS
// ============================================================

// ライブ絞り込み
document.addEventListener('DOMContentLoaded', function() {
  var liveQ = document.getElementById('live-q');
  if (!liveQ) return;
  liveQ.addEventListener('input', function() {
    var q = this.value.toLowerCase();
    var count = 0;
    document.querySelectorAll('#product-tbody tr').forEach(function(tr) {
      var show = !q || tr.textContent.toLowerCase().indexOf(q) >= 0;
      tr.style.display = show ? '' : 'none';
      if (show) count++;
    });
    var lbl = document.getElementById('row-count-label');
    if (lbl) lbl.textContent = count + ' 件表示';
  });
  document.getElementById('live-q-clear').addEventListener('click', function() {
    liveQ.value = '';
    document.querySelectorAll('#product-tbody tr').forEach(function(tr){ tr.style.display = ''; });
    var lbl = document.getElementById('row-count-label');
    if (lbl) lbl.textContent = window._PRODUCTS_PAGE_COUNT || '' ;
  });
});

// ============================================================
// 商品 追加・編集・インポート
// ============================================================
var productModal, importModal, varHelpModal;
var editingId = null;
var _importRows = [];

function openAddProduct(){
  editingId = null;
  document.getElementById('pmTitle').textContent = '商品を追加';
  document.getElementById('productForm').reset();
  productModal.show();
}

function initProductPage() {
try {

var pmEl = document.getElementById('productModal');
var imEl = document.getElementById('importModal');
var vmEl = document.getElementById('varHelpModal');
if (!pmEl) { console.error('productModal not found'); return; }
if (!imEl) { console.error('importModal not found'); return; }
if (!vmEl) { console.error('varHelpModal not found'); return; }
productModal = new bootstrap.Modal(pmEl);
importModal  = new bootstrap.Modal(imEl);
varHelpModal = new bootstrap.Modal(vmEl);

document.querySelectorAll('.btn-edit-product').forEach(function(btn){
  btn.addEventListener('click', async function(){
    var id = this.dataset.id;
    var resp = await fetch('/api/products/' + id);
    if (!resp.ok) { showFlash('商品データの取得に失敗しました', 'danger'); return; }
    var r = await resp.json();
    editingId = r.id;
    document.getElementById('pmTitle').textContent = '商品を編集';
    var f = document.getElementById('productForm');
    ['product_code','barcode','item_category','manufacturer','name','spec','color','club_type',
     'list_price','default_rate','unit','source'].forEach(function(k){ if(f[k]) f[k].value = r[k]!=null?r[k]:''; });
    f['default_supplier_id'].value = r['default_supplier_id'] != null ? r['default_supplier_id'] : '';
    productModal.show();
  });
});

document.querySelectorAll('.btn-del-product').forEach(function(btn){
  btn.addEventListener('click', function(){
    if(!confirm(this.dataset.name + ' を無効化しますか？')) return;
    var id = this.dataset.id;
    fetch('/api/products/'+id, {method:'DELETE'}).then(function(r){
      if(r.ok){ showFlash('削除しました','success'); setTimeout(function(){ location.reload(); },800); }
      else showFlash('削除に失敗しました','danger');
    });
  });
});

document.getElementById('productForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var fd = new FormData(this);
  var body = {};
  fd.forEach(function(v,k){ body[k]=v; });
  var url = editingId ? '/api/products/'+editingId : '/api/products';
  var method = editingId ? 'PUT' : 'POST';
  var resp = await fetch(url, {method:method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  if(resp.ok){
    showFlash(editingId?'更新しました':'追加しました','success');
    productModal.hide();
    setTimeout(function(){ location.reload(); },800);
  } else {
    var err = await resp.json().catch(function(){ return {}; });
    showFlash(err.error||'保存に失敗しました','danger');
  }
});

// ============================================================
// テンプレート CSV ダウンロード
// ============================================================
function doDownloadTemplate() {
  var headers = ['品目','メーカー','商品名','仕様','色','種類','定価','掛率','単位','バーコード','品番','出典','仕入先名','バリエーション'];
  var examples = [
    ['シャフト','フジクラ','SPEEDER NX 50','5S','','DR',38000,0.55,'本','','SNXDR50S','','ワークス',''],
    ['グリップ','Golf Pride','CP2 Pro','M60','','',1800,0.60,'個','','','','アクシネット','BL無:ブラック/レッド/ホワイト|BL有:ブラック/レッド/ホワイト'],
    ['グリップ','Golf Pride','Tour Velvet','M60','','',1200,0.60,'個','','','','アクシネット','ブラック/レッド/ホワイト/ブルー'],
    ['ボール','タイトリスト','Pro V1','','','',8800,0.65,'ダース','','','','アクシネット',''],
  ];
  var rows = [headers].concat(examples);
  var csv = rows.map(function(row){
    return row.map(function(cell){
      var s = String(cell === null || cell === undefined ? '' : cell);
      if(s.indexOf(',')>=0 || s.indexOf('"')>=0 || s.indexOf('\n')>=0){
        s = '"' + s.replace(/"/g,'""') + '"';
      }
      return s;
    }).join(',');
  }).join('\r\n');
  var bom = '\uFEFF';
  var blob = new Blob([bom + csv], {type:'text/csv;charset=utf-8'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '商品マスタ_インポートテンプレート.csv';
  a.click();
}
document.getElementById('btn-dl-template').addEventListener('click', doDownloadTemplate);

document.getElementById('btn-template-help').addEventListener('click', function() {
  varHelpModal.show();
});
document.getElementById('btn-dl-template-from-help').addEventListener('click', function() {
  varHelpModal.hide();
  doDownloadTemplate();
});

// ============================================================
// Excel / CSV 一括インポート
// ============================================================
var COL_MAP = {
  '品目':'item_category','item_category':'item_category',
  'メーカー':'manufacturer','manufacturer':'manufacturer',
  '商品名':'name','name':'name',
  '仕様':'spec','spec':'spec',
  '色':'color','color':'color',
  '種類':'club_type','club_type':'club_type',
  '定価':'list_price','list_price':'list_price',
  '掛率':'default_rate','default_rate':'default_rate',
  '単位':'unit','unit':'unit',
  'バーコード':'barcode','barcode':'barcode',
  '品番':'product_code','product_code':'product_code',
  '出典':'source','source':'source',
  '仕入先名':'supplier_name','supplier_name':'supplier_name',
  '仕入先':'supplier_name','発注先':'supplier_name','発注先名':'supplier_name',
  'バリエーション':'variations','variations':'variations','バリエ':'variations',
};

document.getElementById('btn-import').addEventListener('click', function() {
  document.getElementById('import-file').value = '';
  document.getElementById('import-preview-wrap').style.display = 'none';
  document.getElementById('import-result').style.display = 'none';
  document.getElementById('btn-do-import').style.display = 'none';
  document.getElementById('import-step-file').classList.add('active');
  document.getElementById('import-step-preview').classList.remove('active');
  document.getElementById('import-step-done').classList.remove('active');
  _importRows = [];
  importModal.show();
});

document.getElementById('import-file').addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (!file) return;
  var ext = file.name.split('.').pop().toLowerCase();
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var wb;
      if (ext === 'csv') {
        wb = XLSX.read(ev.target.result, {type:'string', codepage:65001});
      } else {
        wb = XLSX.read(new Uint8Array(ev.target.result), {type:'array'});
      }
      var ws  = wb.Sheets[wb.SheetNames[0]];
      var raw = XLSX.utils.sheet_to_json(ws, {defval:'', raw:false});
      if (raw.length === 0) {
        showImportError('データが見つかりませんでした。ヘッダー行 + データ行が必要です。');
        return;
      }
      _importRows = raw.map(function(row) {
        var mapped = {};
        Object.keys(row).forEach(function(k) {
          var canonical = COL_MAP[k.trim()] || COL_MAP[k.trim().toLowerCase()];
          if (canonical) mapped[canonical] = row[k];
        });
        return mapped;
      });
      renderImportPreview(_importRows);
    } catch(err) {
      showImportError('ファイルの読み込みに失敗しました: ' + err.message);
    }
  };
  if (ext === 'csv') {
    reader.readAsText(file, 'UTF-8');
  } else {
    reader.readAsArrayBuffer(file);
  }
});

function showImportError(msg) {
  var el = document.getElementById('import-file-error');
  el.textContent = msg;
  el.style.display = '';
}

function renderImportPreview(rows) {
  document.getElementById('import-file-error').style.display = 'none';
  var cols = ['item_category','manufacturer','name','spec','color','club_type',
              'list_price','default_rate','unit','barcode','product_code','source','supplier_name','variations'];
  var labels = {
    'item_category':'品目','manufacturer':'メーカー','name':'商品名',
    'spec':'仕様','color':'色','club_type':'種類',
    'list_price':'定価','default_rate':'掛率','unit':'単位',
    'barcode':'バーコード','product_code':'品番','source':'出典',
    'supplier_name':'仕入先名','variations':'バリエーション'
  };
  var thead = '<tr>' + cols.map(function(c){
    var req = (c==='item_category'||c==='name') ? ' <span class="text-danger">*</span>' : '';
    return '<th class="small text-nowrap">' + labels[c] + req + '</th>';
  }).join('') + '</tr>';

  var MAX_PREVIEW = 200;
  var previewRows = rows.slice(0, MAX_PREVIEW);
  var tbody = previewRows.map(function(row, i) {
    var hasError = !row['item_category'] || !row['name'];
    var trCls = hasError ? 'table-danger' : (i%2===0?'':'table-light');
    return '<tr class="' + trCls + '">' + cols.map(function(c) {
      var val = row[c] !== undefined ? String(row[c]) : '';
      var isEmpty = val === '' && (c==='item_category'||c==='name');
      if (isEmpty) return '<td class="small text-nowrap text-danger fw-bold">⚠ 空</td>';
      if (c === 'variations' && val) {
        var varCount = val.split('|').filter(function(s){ return s.trim(); }).length;
        var tipText = val.replace(/\|/g, '\n').replace(/:/g, ': ');
        return '<td class="small text-nowrap">'
          + '<span class="badge bg-primary" title="' + escapeHtml(tipText) + '" '
          + 'data-bs-toggle="tooltip" data-bs-placement="left" style="cursor:pointer">'
          + varCount + 'レコード展開</span></td>';
      }
      return '<td class="small text-nowrap">' + escapeHtml(val.length>30 ? val.slice(0,30)+'…' : val) + '</td>';
    }).join('') + '</tr>';
  }).join('');

  var errCount = rows.filter(function(r){ return !r['item_category']||!r['name']; }).length;
  var expandedCount = rows.reduce(function(sum, r) {
    var v = r['variations'] ? String(r['variations']).trim() : '';
    if (!v) return sum + 1;
    var varCount = v.split('|').filter(function(x){ return x.trim(); }).length;
    return sum + (varCount > 0 ? varCount : 1);
  }, 0);

  document.getElementById('import-preview-thead').innerHTML = thead;
  document.getElementById('import-preview-tbody').innerHTML = tbody;
  document.getElementById('import-row-count').textContent = rows.length + '行（展開後 ' + expandedCount + '件）';
  document.getElementById('import-err-count').textContent  = errCount;
  document.getElementById('import-preview-more').style.display = rows.length > MAX_PREVIEW ? '' : 'none';
  document.getElementById('import-preview-more-count').textContent = rows.length - MAX_PREVIEW;
  document.getElementById('import-preview-wrap').style.display = '';
  document.getElementById('btn-do-import').style.display = '';
  document.getElementById('import-step-preview').classList.add('active');
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.getElementById('btn-do-import').addEventListener('click', async function() {
  if (_importRows.length === 0) return;
  var mode = document.getElementById('import-mode').value;
  var btn  = this;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>インポート中…';
  try {
    var resp = await fetch('/api/products/bulk-import', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ rows: _importRows, mode: mode })
    });
    var result = await resp.json();
    if (!resp.ok) {
      showFlash(result.error || 'インポートに失敗しました', 'danger');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-file-import me-1"></i>インポート実行';
      return;
    }
    var resEl = document.getElementById('import-result');
    var summary = '<div class="alert alert-success mb-2"><i class="fas fa-check-circle me-1"></i>'
      + '<strong>インポート完了！</strong> '
      + '追加: <strong>' + result.inserted + '件</strong>　'
      + (mode==='upsert' ? '更新: <strong>' + result.updated + '件</strong>　' : '')
      + (result.skipped > 0 ? 'スキップ: <strong class="text-warning">' + result.skipped + '件</strong>' : '')
      + '</div>';
    var errHtml = '';
    if (result.errors && result.errors.length > 0) {
      errHtml = '<div class="alert alert-warning py-2"><strong>エラー詳細:</strong><ul class="mb-0 mt-1 small">'
        + result.errors.slice(0,20).map(function(e){
            return '<li>行' + e.row + ': ' + escapeHtml(e.msg) + '</li>';
          }).join('')
        + (result.errors.length > 20 ? '<li>… 他 ' + (result.errors.length-20) + '件</li>' : '')
        + '</ul></div>';
    }
    resEl.innerHTML = summary + errHtml
      + '<button class="btn btn-primary" onclick="location.reload()">'
      + '<i class="fas fa-sync me-1"></i>ページを再読み込み</button>';
    resEl.style.display = '';
    document.getElementById('import-step-done').classList.add('active');
    document.getElementById('import-preview-wrap').style.display = 'none';
    document.getElementById('btn-do-import').style.display = 'none';
  } catch(err) {
    showFlash('通信エラー: ' + err.message, 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-file-import me-1"></i>インポート実行';
  }
});

// ============================================================
// 選択チェックボックス & 一括編集
// ============================================================

var bulkEditModal;
var _selectedIds = new Set();

function updateBulkBar() {
  var bar   = document.getElementById('bulk-action-bar');
  var countEl = document.getElementById('bulk-count');
  if (!bar) return;
  if (_selectedIds.size > 0) {
    bar.classList.remove('d-none');
    if (countEl) countEl.textContent = _selectedIds.size;
  } else {
    bar.classList.add('d-none');
  }
  // 全選択チェックボックスの状態を同期
  var chkAll = document.getElementById('chk-all');
  if (!chkAll) return;
  var allChks = document.querySelectorAll('.chk-product');
  var checkedCount = document.querySelectorAll('.chk-product:checked').length;
  chkAll.checked       = allChks.length > 0 && checkedCount === allChks.length;
  chkAll.indeterminate = checkedCount > 0 && checkedCount < allChks.length;
}

// 全選択チェックボックス
var chkAllEl = document.getElementById('chk-all');
if (chkAllEl) {
  chkAllEl.addEventListener('change', function() {
    document.querySelectorAll('.chk-product').forEach(function(chk) {
      chk.checked = chkAllEl.checked;
      var id = parseInt(chk.value);
      if (chkAllEl.checked) {
        _selectedIds.add(id);
        chk.closest('tr').classList.add('table-active');
      } else {
        _selectedIds.delete(id);
        chk.closest('tr').classList.remove('table-active');
      }
    });
    updateBulkBar();
  });
}

// 行チェックボックス（イベント委譲）
document.getElementById('product-tbody').addEventListener('change', function(e) {
  if (!e.target.classList.contains('chk-product')) return;
  var id = parseInt(e.target.value);
  var tr = e.target.closest('tr');
  if (e.target.checked) {
    _selectedIds.add(id);
    tr.classList.add('table-active');
  } else {
    _selectedIds.delete(id);
    tr.classList.remove('table-active');
  }
  updateBulkBar();
});

// 選択解除ボタン
var clearBtn = document.getElementById('btn-bulk-clear');
if (clearBtn) {
  clearBtn.addEventListener('click', function() {
    _selectedIds.clear();
    document.querySelectorAll('.chk-product').forEach(function(chk) {
      chk.checked = false;
      chk.closest('tr').classList.remove('table-active');
    });
    updateBulkBar();
  });
}

// 一括廃盤ボタン
var bulkDiscBtn = document.getElementById('btn-bulk-disc');
if (bulkDiscBtn) {
  bulkDiscBtn.addEventListener('click', async function() {
    var ids = Array.from(_selectedIds);
    if (!confirm(ids.length + ' 件の商品を廃盤にしますか？')) return;
    this.disabled = true;
    var ok = 0;
    for (var id of ids) {
      var r = await fetch('/api/products/' + id, {method:'DELETE'});
      if (r.ok) ok++;
    }
    showFlash(ok + ' 件を廃盤にしました', 'success');
    setTimeout(function(){ location.reload(); }, 900);
  });
}

// 一括復活ボタン（廃盤タブ用）
var bulkRestoreBtn = document.getElementById('btn-bulk-restore');
if (bulkRestoreBtn) {
  bulkRestoreBtn.addEventListener('click', async function() {
    var ids = Array.from(_selectedIds);
    if (!confirm(ids.length + ' 件の商品を有効に戻しますか？')) return;
    this.disabled = true;
    var ok = 0;
    for (var id of ids) {
      var r = await fetch('/api/products/' + id + '/restore', {method:'PATCH'});
      if (r.ok) ok++;
    }
    showFlash(ok + ' 件を復活させました', 'success');
    setTimeout(function(){ location.reload(); }, 900);
  });
}

// 一括編集モーダルを開く
var beModalEl = document.getElementById('bulkEditModal');
if (beModalEl) {
  bulkEditModal = new bootstrap.Modal(beModalEl);
}

var bulkEditBtn = document.getElementById('btn-bulk-edit');
if (bulkEditBtn) {
  bulkEditBtn.addEventListener('click', function() {
    var ids = Array.from(_selectedIds);
    if (ids.length === 0) return;
    // フォームリセット
    ['be-item-category','be-manufacturer','be-list-price','be-rate'].forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.value = '';
    });
    ['be-club-type','be-supplier','be-unit'].forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.value = '';
    });
    // バッジ件数
    var badge = document.getElementById('bulk-edit-count-badge');
    if (badge) badge.textContent = ids.length + '件';
    // プレビューリスト生成（選択行のテキストを収集）
    var preview = document.getElementById('bulk-edit-preview');
    if (preview) {
      var items = [];
      ids.forEach(function(id) {
        var tr = document.querySelector('#product-tbody tr[data-id="' + id + '"]');
        if (tr) {
          var cells = tr.querySelectorAll('td');
          // [0]=chk [1]=ID [2]=品目 [3]=メーカー [4]=商品名 [5]=仕様 [6]=種類
          var cat  = cells[2] ? cells[2].textContent.trim() : '';
          var mfr  = cells[3] ? cells[3].textContent.trim() : '';
          var name = cells[4] ? cells[4].textContent.trim() : '';
          var spec = cells[5] ? cells[5].textContent.trim() : '';
          items.push('<span class="badge bg-secondary me-1">' + escapeHtml(cat) + '</span>'
            + escapeHtml(mfr) + ' ' + escapeHtml(name)
            + (spec ? ' <span class="text-muted">' + escapeHtml(spec) + '</span>' : ''));
        }
      });
      preview.innerHTML = items.map(function(s){ return '<div class="py-1 border-bottom">' + s + '</div>'; }).join('');
    }
    if (bulkEditModal) bulkEditModal.show();
  });
}

// 一括更新実行
var doBulkEditBtn = document.getElementById('btn-do-bulk-edit');
if (doBulkEditBtn) {
  doBulkEditBtn.addEventListener('click', async function() {
    var ids = Array.from(_selectedIds);
    if (ids.length === 0) return;

    var fields = {};
    var itemCat  = document.getElementById('be-item-category').value.trim();
    var mfr      = document.getElementById('be-manufacturer').value.trim();
    var clubType = document.getElementById('be-club-type').value;
    var rateStr  = document.getElementById('be-rate').value.trim();
    var priceStr = document.getElementById('be-list-price').value.trim();
    var suppId   = document.getElementById('be-supplier').value;
    var unit     = document.getElementById('be-unit').value;

    if (itemCat)  fields['item_category']       = itemCat;
    if (mfr)      fields['manufacturer']         = mfr;
    if (clubType) fields['club_type']            = clubType;
    if (rateStr)  fields['default_rate']         = parseFloat(rateStr);
    if (priceStr) fields['list_price']           = parseFloat(priceStr);
    if (suppId)   fields['default_supplier_id']  = parseInt(suppId);
    if (unit)     fields['unit']                 = unit;

    if (Object.keys(fields).length === 0) {
      showFlash('変更する項目を1つ以上入力してください', 'warning');
      return;
    }

    this.disabled = true;
    this.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>更新中…';

    try {
      var resp = await fetch('/api/products/bulk-update', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ ids: ids, fields: fields })
      });
      var result = await resp.json();
      if (resp.ok) {
        if (bulkEditModal) bulkEditModal.hide();
        showFlash(result.updated + ' 件を更新しました', 'success');
        setTimeout(function(){ location.reload(); }, 900);
      } else {
        showFlash(result.error || '更新に失敗しました', 'danger');
        this.disabled = false;
        this.innerHTML = '<i class="fas fa-save me-1"></i>一括更新を実行';
      }
    } catch(err) {
      showFlash('通信エラー: ' + err.message, 'danger');
      this.disabled = false;
      this.innerHTML = '<i class="fas fa-save me-1"></i>一括更新を実行';
    }
  });
}

// ============================================================
// 複数仕入先管理モーダル
// ============================================================
(function(){
  var suppliersModal = document.getElementById('suppliersModal')
    ? new bootstrap.Modal(document.getElementById('suppliersModal')) : null;
  if (!suppliersModal) return;

  var currentProductId = null;

  // 仕入先セレクトを初期化
  var supAddSel = document.getElementById('sup-add-supplier');
  if (supAddSel && window._SUPPLIERS) {
    window._SUPPLIERS.forEach(function(s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      supAddSel.appendChild(opt);
    });
  }

  // 「仕入先」ボタンクリック → モーダルを開いてリストをロード
  document.querySelectorAll('.btn-manage-suppliers').forEach(function(btn) {
    btn.addEventListener('click', function() {
      currentProductId = btn.dataset.productId;
      var pName = btn.dataset.productName || '';
      var nameEl = document.getElementById('sup-modal-product-name');
      if (nameEl) nameEl.textContent = pName;
      loadSupplierList(currentProductId);
      suppliersModal.show();
    });
  });

  // 仕入先リストを取得してモーダル内に描画
  function loadSupplierList(productId) {
    var listDiv = document.getElementById('sup-modal-list');
    if (!listDiv) return;
    listDiv.innerHTML = '<div class="text-center py-3"><span class="spinner-border spinner-border-sm me-1"></span>読み込み中...</div>';
    fetch('/api/product-suppliers/' + productId, { credentials: 'include' })
      .then(function(r) { return r.json(); })
      .then(function(rows) {
        if (!rows || rows.length === 0) {
          listDiv.innerHTML = '<div class="text-muted small py-2"><i class="fas fa-info-circle me-1"></i>仕入先が設定されていません。下のフォームから追加してください。</div>';
          return;
        }
        var html = '<table class="table table-sm mb-0 align-middle"><thead><tr>'
          + '<th>仕入先</th><th class="text-center">掛率</th><th class="text-center">デフォルト</th><th>備考</th><th></th>'
          + '</tr></thead><tbody>';
        rows.forEach(function(row) {
          var rateStr = row.rate != null ? (row.rate * 100).toFixed(1) + '%' : '<span class="text-muted">&#x2015;</span>';
          var defaultBadge = row.is_default
            ? '<span class="badge bg-success">デフォルト</span>'
            : '<button class="btn btn-xs btn-outline-secondary py-0 px-1 btn-set-default" data-ps-id="' + row.id + '" style="font-size:0.7rem">デフォルトに設定</button>';
          html += '<tr>'
            + '<td class="fw-semibold">' + escHtml(row.supplier_name) + '</td>'
            + '<td class="text-center">' + rateStr + '</td>'
            + '<td class="text-center">' + defaultBadge + '</td>'
            + '<td class="small text-muted">' + escHtml(row.notes || '') + '</td>'
            + '<td><button class="btn btn-xs btn-outline-danger py-0 px-1 btn-del-ps" data-ps-id="' + row.id + '" title="削除"><i class="fas fa-trash"></i></button></td>'
            + '</tr>';
        });
        html += '</tbody></table>';
        listDiv.innerHTML = html;

        // 削除ボタン
        listDiv.querySelectorAll('.btn-del-ps').forEach(function(b) {
          b.addEventListener('click', function() {
            if (!confirm('この仕入先設定を削除しますか？')) return;
            fetch('/api/product-suppliers/' + b.dataset.psId, { method: 'DELETE', credentials: 'include' })
              .then(function(r) {
                if (r.ok) { loadSupplierList(currentProductId); showFlash('削除しました', 'success'); }
                else showFlash('削除に失敗しました', 'danger');
              });
          });
        });

        // デフォルト設定ボタン
        listDiv.querySelectorAll('.btn-set-default').forEach(function(b) {
          b.addEventListener('click', function() {
            fetch('/api/product-suppliers/' + b.dataset.psId, {
              method: 'PUT', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ is_default: 1,
                // 他フィールドを保持するため再取得ではなく、is_defaultだけ変更
                supplier_id: 0 // API側でsupplier_idが必須のため暫定値（後で改善）
              })
            })
            .then(function(r) {
              if (r.ok) { loadSupplierList(currentProductId); showFlash('デフォルトを変更しました', 'success'); }
              else showFlash('更新に失敗しました', 'danger');
            });
          });
        });
      })
      .catch(function() {
        listDiv.innerHTML = '<div class="text-danger small">読み込みに失敗しました</div>';
      });
  }

  // 追加ボタン
  var addBtn = document.getElementById('btn-sup-add');
  if (addBtn) {
    addBtn.addEventListener('click', async function() {
      var supplierId = document.getElementById('sup-add-supplier').value;
      var rate       = document.getElementById('sup-add-rate').value;
      var notes      = document.getElementById('sup-add-notes').value.trim();
      var isDefault  = document.getElementById('sup-add-default').checked;
      if (!supplierId) { showFlash('仕入先を選択してください', 'danger'); return; }
      addBtn.disabled = true;
      addBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>追加中...';
      try {
        var r = await fetch('/api/product-suppliers', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id:  currentProductId,
            supplier_id: supplierId,
            rate:        rate ? parseFloat(rate) : null,
            notes:       notes || null,
            is_default:  isDefault ? 1 : 0,
          })
        });
        if (r.ok) {
          // フォームリセット
          document.getElementById('sup-add-supplier').value = '';
          document.getElementById('sup-add-rate').value = '';
          document.getElementById('sup-add-notes').value = '';
          document.getElementById('sup-add-default').checked = false;
          loadSupplierList(currentProductId);
          showFlash('仕入先を追加しました', 'success');
        } else {
          var err = await r.json().catch(function(){ return {}; });
          showFlash(err.error || '追加に失敗しました', 'danger');
        }
      } catch(e) {
        showFlash('通信エラーが発生しました', 'danger');
      }
      addBtn.disabled = false;
      addBtn.innerHTML = '<i class="fas fa-plus me-1"></i>追加';
    });
  }

  // HTMLエスケープヘルパー
  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();

} catch(e) { console.error('initProductPage error:', e.message, e.stack); }
} // initProductPage end

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProductPage);
} else {
  initProductPage();
}
