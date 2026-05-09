import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// ============================================================
// ユーティリティ
// ============================================================
function yen(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  const n = parseFloat(String(v))
  if (isNaN(n)) return ''
  return `¥${n.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`
}

function statusLabel(v: string): string {
  const m: Record<string, string> = {
    draft: '下書き', draft_created: '下書き作成済', ordered: '発注済',
    partial: '一部入荷', completed: '完納', cancelled: 'キャンセル',
  }
  return m[v] ?? v
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    draft: 'secondary', draft_created: 'info', ordered: 'primary',
    partial: 'warning', completed: 'success', cancelled: 'dark',
  }
  return `<span class="badge text-bg-${colors[status] ?? 'secondary'}">${statusLabel(status)}</span>`
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ============================================================
// 共通レイアウト
// ============================================================
function layout(title: string, content: string, extraScripts = '', username = ''): Response {
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | ゴルフウィング 発注管理</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/style.css" rel="stylesheet">
  <link rel="icon" href="/favicon.ico" type="image/x-icon">
</head>
<body>
<nav class="navbar navbar-expand-lg navbar-dark bg-dark sticky-top">
  <div class="container-fluid px-4">
    <a class="navbar-brand fw-bold" href="/"><i class="fas fa-golf-ball me-2"></i>ゴルフウィング 発注管理</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="navMenu">
      <div class="navbar-nav gap-1 ms-auto align-items-lg-center">
        <a class="nav-link" href="/"><i class="fas fa-chart-line me-1"></i>ダッシュボード</a>
        <a class="nav-link" href="/orders/new"><i class="fas fa-plus me-1"></i>新規発注</a>
        <a class="nav-link" href="/orders"><i class="fas fa-list me-1"></i>発注一覧</a>
        <a class="nav-link" href="/backorders"><i class="fas fa-exclamation-triangle me-1"></i>残注一覧</a>
        <a class="nav-link" href="/receipts"><i class="fas fa-truck me-1"></i>納品履歴</a>
        <a class="nav-link" href="/products"><i class="fas fa-box me-1"></i>商品マスタ</a>
        <a class="nav-link" href="/suppliers"><i class="fas fa-building me-1"></i>仕入先</a>
        <a class="nav-link" href="/rules"><i class="fas fa-cog me-1"></i>判定ルール</a>
        <div class="nav-item dropdown ms-lg-2">
          <a class="nav-link dropdown-toggle d-flex align-items-center gap-1 border border-secondary rounded px-2"
             href="#" data-bs-toggle="dropdown">
            <i class="fas fa-user-circle"></i>
            <span class="small">${username || 'admin'}</span>
          </a>
          <ul class="dropdown-menu dropdown-menu-end shadow">
            <li><h6 class="dropdown-header"><i class="fas fa-user me-1"></i>${username || 'admin'}</h6></li>
            <li><a class="dropdown-item" href="/admin/backup"><i class="fas fa-database me-2 text-primary"></i>バックアップ管理</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger" href="/logout"><i class="fas fa-sign-out-alt me-2"></i>ログアウト</a></li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</nav>
<div class="container-fluid px-4 py-4">
  <div id="flash-container"></div>
  ${content}
</div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script>
function showFlash(message, type) {
  type = type || 'success';
  var el = document.getElementById('flash-container');
  var div = document.createElement('div');
  div.className = 'alert alert-' + type + ' alert-dismissible fade show';
  div.innerHTML = message + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>';
  el.appendChild(div);
  setTimeout(function(){ div.remove(); }, 5000);
}
</script>
${extraScripts}
</body>
</html>`
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    }
  })
}

// ============================================================
// ダッシュボード
// ============================================================
app.get('/', async (c) => {
  const db = c.env.DB
  const [p, s, o, b] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS c FROM products WHERE is_active=1').first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM suppliers WHERE is_active=1').first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM purchase_orders').first<{c:number}>(),
    db.prepare(`SELECT COUNT(*) AS c FROM (
      SELECT poi.id FROM purchase_order_items poi
      LEFT JOIN receipt_items ri ON ri.purchase_order_item_id=poi.id
      GROUP BY poi.id, poi.quantity
      HAVING COALESCE(SUM(ri.received_quantity),0) < poi.quantity
    )`).first<{c:number}>(),
  ])

  const recent = await db.prepare(`
    SELECT po.id, po.order_no, po.order_date, po.status, po.customer_name,
           s.name AS supplier_name,
           COUNT(poi.id) AS line_count,
           COALESCE(SUM(poi.amount),0) AS total_amount,
           COALESCE(SUM(poi.quantity),0) AS total_qty
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id=s.id
    LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
    GROUP BY po.id ORDER BY po.id DESC LIMIT 10
  `).all<Record<string,unknown>>()

  const rows = recent.results.map(r => `<tr>
    <td><a href="/orders/${r['id']}">${esc(r['order_no'])}</a></td>
    <td>${esc(r['order_date'])}</td>
    <td>${esc(r['supplier_name'])}</td>
    <td>${esc(r['customer_name'])}</td>
    <td class="text-center">${r['line_count']}</td>
    <td class="text-center">${r['total_qty']}</td>
    <td class="text-end">${yen(r['total_amount'])}</td>
    <td>${statusBadge(String(r['status']))}</td>
  </tr>`).join('')

  const content = `
<div class="d-flex justify-content-between align-items-center mb-4">
  <div>
    <h1 class="h3 mb-1"><i class="fas fa-chart-line me-2 text-primary"></i>ダッシュボード</h1>
    <p class="text-muted mb-0">発注・納品・残注の状況を横断的に確認できます。</p>
  </div>
  <a class="btn btn-primary" href="/orders/new"><i class="fas fa-plus me-1"></i>新規発注を作成</a>
</div>
<div class="row g-3 mb-4">
  <div class="col-6 col-md-3"><div class="card metric-card h-100"><div class="card-body text-center">
    <div class="metric-label"><i class="fas fa-box me-1"></i>商品マスタ</div>
    <div class="metric-value">${p?.c ?? 0}</div>
  </div></div></div>
  <div class="col-6 col-md-3"><div class="card metric-card h-100"><div class="card-body text-center">
    <div class="metric-label"><i class="fas fa-building me-1"></i>仕入先</div>
    <div class="metric-value">${s?.c ?? 0}</div>
  </div></div></div>
  <div class="col-6 col-md-3"><div class="card metric-card h-100"><div class="card-body text-center">
    <div class="metric-label"><i class="fas fa-file-alt me-1"></i>発注件数</div>
    <div class="metric-value">${o?.c ?? 0}</div>
  </div></div></div>
  <div class="col-6 col-md-3"><div class="card metric-card danger h-100"><div class="card-body text-center">
    <div class="metric-label"><i class="fas fa-exclamation-triangle me-1"></i>残注明細</div>
    <div class="metric-value">${b?.c ?? 0}</div>
  </div></div></div>
</div>
<div class="card shadow-sm">
  <div class="card-header bg-white d-flex justify-content-between align-items-center">
    <strong><i class="fas fa-clock me-1"></i>最近の発注</strong>
    <a href="/orders" class="btn btn-sm btn-outline-secondary">すべて見る</a>
  </div>
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead class="table-light"><tr>
        <th>発注番号</th><th>発注日</th><th>仕入先</th><th>顧客名</th>
        <th class="text-center">明細数</th><th class="text-center">数量</th>
        <th class="text-end">金額</th><th>状態</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="text-center text-muted py-4">まだ発注データがありません。</td></tr>'}</tbody>
    </table>
  </div>
</div>`
  return layout('ダッシュボード', content)
})

// ============================================================
// 商品マスタ
// ============================================================
app.get('/products', async (c) => {
  const db = c.env.DB
  const q   = (c.req.query('q')   || '').replace(/　/g, ' ').trim()
  const cat = (c.req.query('cat') || '').trim()

  // ソートパラメータ
  const ALLOWED_COLS: Record<string, string> = {
    manufacturer:  'p.manufacturer',
    name:          'p.name',
    list_price:    'p.list_price',
    club_type:     'p.club_type',
    item_category: 'p.item_category',
  }
  const sortKey = c.req.query('sort') || 'item_category'
  const sortCol = ALLOWED_COLS[sortKey] || 'p.item_category'
  const sortDir = c.req.query('dir') === 'desc' ? 'DESC' : 'ASC'
  const nextDir = (col: string) => {
    if (sortCol !== ALLOWED_COLS[col]) return 'asc'
    return sortDir === 'ASC' ? 'desc' : 'asc'
  }

  // ページネーションパラメータ
  const PAGE_SIZE = 100
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1)

  // WHERE句を共通化
  let whereSql = 'WHERE p.is_active=1'
  const whereParams: unknown[] = []
  if (cat) { whereSql += ' AND p.item_category=?'; whereParams.push(cat) }
  if (q) {
    whereSql += ' AND (p.name LIKE ? OR p.manufacturer LIKE ? OR p.barcode LIKE ? OR p.item_category LIKE ? OR p.club_type LIKE ? OR p.spec LIKE ?)'
    const like = `%${q}%`
    whereParams.push(like, like, like, like, like, like)
  }

  // 総件数取得
  const countSql = `SELECT COUNT(*) AS c FROM products p ${whereSql}`
  const countRes = whereParams.length
    ? await db.prepare(countSql).bind(...whereParams).first<{ c: number }>()
    : await db.prepare(countSql).first<{ c: number }>()
  const totalCount = countRes?.c ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const currentOffset = (currentPage - 1) * PAGE_SIZE

  // データ取得（ページ分のみ）
  const secondary = sortCol === 'p.manufacturer' ? ', p.name ASC'
                  : sortCol === 'p.name'          ? ', p.manufacturer ASC'
                  : ', p.manufacturer ASC, p.name ASC'
  let sql = `SELECT p.*, s.name AS supplier_name, s.id AS supplier_id
    FROM products p LEFT JOIN suppliers s ON p.default_supplier_id=s.id
    ${whereSql} ORDER BY ${sortCol} ${sortDir}${secondary} LIMIT ? OFFSET ?`
  const params: unknown[] = [...whereParams, PAGE_SIZE, currentOffset]

  const stmt = db.prepare(sql)
  const res = await stmt.bind(...params).all<Record<string,unknown>>()

  // カテゴリ一覧
  const cats = await db.prepare('SELECT DISTINCT item_category FROM products WHERE is_active=1 ORDER BY item_category').all<{item_category:string}>()
  // 仕入先一覧（モーダル用）
  const suppliers = await db.prepare('SELECT id, name FROM suppliers WHERE is_active=1 ORDER BY name').all<Record<string,unknown>>()
  const supplierOpts = suppliers.results.map(s => `<option value="${s['id']}">${esc(s['name'])}</option>`).join('')
  const catOpts = cats.results.map(c2 => `<option value="${esc(c2.item_category)}">${esc(c2.item_category)}</option>`).join('')
  const catFilter = cats.results.map(c2 => {
    const sp2 = new URLSearchParams()
    sp2.set('cat', c2.item_category)
    if (q) sp2.set('q', q)
    if (sortKey !== 'item_category') sp2.set('sort', sortKey)
    if (sortDir === 'DESC') sp2.set('dir', 'desc')
    return `<a class="btn btn-sm ${cat===c2.item_category?'btn-primary':'btn-outline-secondary'}" href="/products?${sp2.toString()}">${esc(c2.item_category)}</a>`
  }).join('')

  // club_type バッジ色マップ
  const ctColorMap: Record<string,string> = {
    DR: 'danger', FW: 'success', UT: 'warning text-dark',
    IR: 'secondary', PT: 'dark', 'DR/FW': 'info text-dark'
  }
  // ページネーションリンク生成ヘルパー
  const pageUrl = (p: number) => {
    const sp = new URLSearchParams()
    if (q)   sp.set('q',   q)
    if (cat) sp.set('cat', cat)
    if (sortKey !== 'item_category') sp.set('sort', sortKey)
    if (sortDir === 'DESC') sp.set('dir', 'desc')
    if (p > 1) sp.set('page', String(p))
    return '/products?' + sp.toString()
  }

  // ページネーションHTML生成
  const buildPager = () => {
    if (totalPages <= 1) return ''
    const WINDOW = 2  // 現在ページの前後N件を表示
    const pages: (number | '...')[] = []
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages ||
          (i >= currentPage - WINDOW && i <= currentPage + WINDOW)) {
        pages.push(i)
      } else if (pages[pages.length - 1] !== '...') {
        pages.push('...')
      }
    }
    const items = pages.map(p => {
      if (p === '...') return `<li class="page-item disabled"><span class="page-link">…</span></li>`
      const active = p === currentPage
      return `<li class="page-item ${active ? 'active' : ''}">
        <a class="page-link" href="${pageUrl(p)}">${p}</a></li>`
    }).join('')
    const prev = currentPage > 1
      ? `<li class="page-item"><a class="page-link" href="${pageUrl(currentPage - 1)}"><i class="fas fa-chevron-left"></i></a></li>`
      : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-chevron-left"></i></span></li>`
    const next = currentPage < totalPages
      ? `<li class="page-item"><a class="page-link" href="${pageUrl(currentPage + 1)}"><i class="fas fa-chevron-right"></i></a></li>`
      : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-chevron-right"></i></span></li>`
    return `<nav aria-label="ページネーション" class="mt-3">
  <ul class="pagination pagination-sm justify-content-center mb-0">
    ${prev}${items}${next}
  </ul>
</nav>`
  }

  // ソートリンク生成
  const sortLink = (col: string, label: string, extraCls = '') => {
    const active = sortCol === ALLOWED_COLS[col]
    const nd = nextDir(col)
    const sp = new URLSearchParams()
    if (q)   sp.set('q',   q)
    if (cat) sp.set('cat', cat)
    sp.set('sort', col)
    sp.set('dir',  nd)
    const icon = active
      ? (sortDir === 'ASC'
          ? '<i class="fas fa-sort-up ms-1 text-warning small"></i>'
          : '<i class="fas fa-sort-down ms-1 text-warning small"></i>')
      : '<i class="fas fa-sort ms-1 text-white-50 small"></i>'
    return `<a href="/products?${sp.toString()}" class="text-decoration-none text-white ${extraCls}">${label}${icon}</a>`
  }

  const rows = res.results.map(r => {
    const ct = String(r['club_type'] || '')
    const ctBadge = ct
      ? `<span class="badge bg-${ctColorMap[ct] || 'secondary'}">${esc(ct)}</span>`
      : '<span class="text-muted">—</span>'
    return `<tr data-id="${r['id']}">
    <td class="text-muted small">${r['id']}</td>
    <td><span class="badge bg-secondary">${esc(r['item_category'])}</span></td>
    <td class="fw-semibold">${esc(r['manufacturer'])}</td>
    <td><strong>${esc(r['name'])}</strong></td>
    <td class="text-muted small">${esc(r['spec'])}</td>
    <td>${ctBadge}</td>
    <td class="text-end fw-semibold text-primary">${yen(r['list_price'])}</td>
    <td class="text-center">${r['default_rate'] != null ? (Number(r['default_rate'])*100).toFixed(1)+'%' : ''}</td>
    <td class="small">${esc(r['supplier_name'])}</td>
    <td class="text-muted small">${esc(r['barcode'])}</td>
    <td style="white-space:nowrap">
      <button class="btn btn-xs btn-outline-primary btn-edit-product py-0 px-2" data-row='${JSON.stringify(r)}'><i class="fas fa-edit"></i></button>
      <button class="btn btn-xs btn-outline-danger btn-del-product py-0 px-2 ms-1" data-id="${r['id']}" data-name="${esc(r['name'])}"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`
  }).join('')

  const scripts = `<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<script>
// ════════════════════════════════════════════════════════════
// ライブ絞り込み
// ════════════════════════════════════════════════════════════
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
    if (lbl) lbl.textContent = '${res.results.length} 件表示（このページ）';
  });
});

// ════════════════════════════════════════════════════════════
// 商品 追加・編集モーダル
// ════════════════════════════════════════════════════════════
var productModal = new bootstrap.Modal(document.getElementById('productModal'));
var editingId = null;

function openAddProduct(){
  editingId = null;
  document.getElementById('pmTitle').textContent = '商品を追加';
  document.getElementById('productForm').reset();
  productModal.show();
}

document.querySelectorAll('.btn-edit-product').forEach(function(btn){
  btn.addEventListener('click', function(){
    var r = JSON.parse(this.dataset.row);
    editingId = r.id;
    document.getElementById('pmTitle').textContent = '商品を編集';
    var f = document.getElementById('productForm');
    ['product_code','barcode','item_category','manufacturer','name','spec','color','club_type',
     'list_price','default_rate','unit','source'].forEach(function(k){ if(f[k]) f[k].value = r[k]??''; });
    f['default_supplier_id'].value = r['default_supplier_id']??'';
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

// ════════════════════════════════════════════════════════════
// テンプレート CSV ダウンロード
// ════════════════════════════════════════════════════════════
document.getElementById('btn-dl-template').addEventListener('click', function() {
  var headers = ['品目','メーカー','商品名','仕様','色','種類','定価','掛率','単位','バーコード','品番','出典'];
  var examples = [
    ['シャフト','フジクラ','SPEEDER NX 50','5S','','DR',38000,0.55,'本','','',''],
    ['グリップ','Golf Pride','CP2 Pro','M60','',' ',1800,0.60,'個','','',''],
    ['ボール','タイトリスト','Pro V1','','','',8800,0.65,'ダース','','',''],
  ];
  var rows = [headers].concat(examples);
  var csv = rows.map(function(row){
    return row.map(function(cell){
      var s = String(cell === null || cell === undefined ? '' : cell);
      if(s.indexOf(',')>=0 || s.indexOf('"')>=0 || s.indexOf('\\n')>=0){
        s = '"' + s.replace(/"/g,'""') + '"';
      }
      return s;
    }).join(',');
  }).join('\\r\\n');
  var bom = '\\uFEFF';
  var blob = new Blob([bom + csv], {type:'text/csv;charset=utf-8'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '商品マスタ_インポートテンプレート.csv';
  a.click();
});

// ════════════════════════════════════════════════════════════
// Excel / CSV 一括インポート
// ════════════════════════════════════════════════════════════
var importModal  = new bootstrap.Modal(document.getElementById('importModal'));
var _importRows  = [];   // パース済み行データ

// ヘッダー列マッピング（日本語 / 英語どちらでも受け付ける）
var COL_MAP = {
  '品目':         'item_category',
  'item_category':'item_category',
  'メーカー':     'manufacturer',
  'manufacturer': 'manufacturer',
  '商品名':       'name',
  'name':         'name',
  '仕様':         'spec',
  'spec':         'spec',
  '色':           'color',
  'color':        'color',
  '種類':         'club_type',
  'club_type':    'club_type',
  '定価':         'list_price',
  'list_price':   'list_price',
  '掛率':         'default_rate',
  'default_rate': 'default_rate',
  '単位':         'unit',
  'unit':         'unit',
  'バーコード':   'barcode',
  'barcode':      'barcode',
  '品番':         'product_code',
  'product_code': 'product_code',
  '出典':         'source',
  'source':       'source',
};

document.getElementById('btn-import').addEventListener('click', function() {
  // 毎回リセット
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
      var ws   = wb.Sheets[wb.SheetNames[0]];
      var raw  = XLSX.utils.sheet_to_json(ws, {defval:'', raw:false});

      if (raw.length === 0) {
        showImportError('データが見つかりませんでした。ヘッダー行 + データ行が必要です。');
        return;
      }

      // ヘッダーを正規化してマッピング
      _importRows = raw.map(function(row) {
        var mapped = {};
        Object.keys(row).forEach(function(k) {
          var canonical = COL_MAP[k.trim()] || COL_MAP[k.trim().toLowerCase()];
          if (canonical) mapped[canonical] = row[k];
        });
        return mapped;
      }).filter(function(row) {
        // 品目・商品名どちらかでも空なら除外（後でエラー表示）
        return true;  // APIサーバー側でバリデーション
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
              'list_price','default_rate','unit','barcode','product_code','source'];
  var labels = {'item_category':'品目','manufacturer':'メーカー','name':'商品名',
                'spec':'仕様','color':'色','club_type':'種類',
                'list_price':'定価','default_rate':'掛率','unit':'単位',
                'barcode':'バーコード','product_code':'品番','source':'出典'};

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
      return '<td class="small text-nowrap' + (isEmpty?' text-danger fw-bold':'') + '">'
        + (isEmpty ? '⚠ 空' : escapeHtml(val.length>30 ? val.slice(0,30)+'…' : val))
        + '</td>';
    }).join('') + '</tr>';
  }).join('');

  var errCount = rows.filter(function(r){ return !r['item_category']||!r['name']; }).length;

  document.getElementById('import-preview-thead').innerHTML = thead;
  document.getElementById('import-preview-tbody').innerHTML = tbody;
  document.getElementById('import-row-count').textContent = rows.length;
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

// インポート実行
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

    // 結果表示
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
</script>`

  const currentSortLabel = (sortKey === 'manufacturer' ? 'メーカー'
    : sortKey === 'name'         ? '商品名'
    : sortKey === 'list_price'   ? '定価'
    : sortKey === 'club_type'    ? '種類'
    : '品目')
  const content = `
<div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
  <div>
    <h1 class="h3 mb-1"><i class="fas fa-box me-2 text-primary"></i>商品マスタ</h1>
    <p class="text-muted mb-0" id="row-count-label"><strong>${totalCount.toLocaleString()}</strong> 件中 ${res.results.length} 件表示（${currentPage}/${totalPages} ページ）</p>
  </div>
  <div class="d-flex gap-2 flex-wrap">
    <button class="btn btn-outline-secondary" id="btn-dl-template" title="CSVテンプレートをダウンロード">
      <i class="fas fa-download me-1"></i>テンプレート
    </button>
    <button class="btn btn-outline-primary" id="btn-import">
      <i class="fas fa-file-import me-1"></i>Excel/CSV一括追加
    </button>
    <button class="btn btn-success" onclick="openAddProduct()">
      <i class="fas fa-plus me-1"></i>1件追加
    </button>
  </div>
</div>

<!-- カテゴリフィルタ -->
<div class="d-flex gap-2 flex-wrap mb-2">
  <a class="btn btn-sm ${!cat?'btn-dark':'btn-outline-secondary'}" href="/products${q?'?q='+encodeURIComponent(q):''}">すべて</a>
  ${catFilter}
</div>

<!-- 検索バー -->
<div class="row g-2 mb-3">
  <div class="col-md-6">
    <form class="d-flex gap-2" method="GET" action="/products">
      ${cat ? `<input type="hidden" name="cat" value="${esc(cat)}">` : ''}
      ${sortKey !== 'item_category' ? `<input type="hidden" name="sort" value="${esc(sortKey)}">` : ''}
      ${sortDir === 'DESC' ? `<input type="hidden" name="dir" value="desc">` : ''}
      <input class="form-control" type="text" name="q" value="${esc(q)}"
        placeholder="サーバー検索（メーカー・商品名・仕様…）">
      <button class="btn btn-primary flex-shrink-0"><i class="fas fa-search"></i></button>
      ${(q||cat) ? `<a href="/products" class="btn btn-outline-secondary flex-shrink-0"><i class="fas fa-times"></i></a>` : ''}
    </form>
  </div>
  <div class="col-md-6">
    <div class="input-group">
      <span class="input-group-text bg-success text-white border-success">
        <i class="fas fa-bolt"></i>
      </span>
      <input id="live-q" type="text" class="form-control border-success"
        placeholder="ページ内瞬時絞り込み（入力するだけ・サーバー通信なし）" autocomplete="off">
      <button id="live-q-clear" class="btn btn-outline-secondary" type="button">
        <i class="fas fa-times"></i>
      </button>
    </div>
  </div>
</div>

<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0" id="product-table">
      <thead class="table-dark">
        <tr>
          <th class="text-white-50 small" style="width:46px">ID</th>
          <th>${sortLink('item_category', '品目')}</th>
          <th>${sortLink('manufacturer', 'メーカー')}</th>
          <th>${sortLink('name', '商品名')}</th>
          <th class="text-white-50">仕様</th>
          <th>${sortLink('club_type', '種類')}</th>
          <th class="text-end">${sortLink('list_price', '定価', 'text-end d-block')}</th>
          <th class="text-center text-white-50">掛率</th>
          <th class="text-white-50">標準仕入先</th>
          <th class="text-white-50">バーコード</th>
          <th class="text-white-50">操作</th>
        </tr>
      </thead>
      <tbody id="product-tbody">
        ${rows || '<tr><td colspan="11" class="text-center py-4 text-muted">対象データがありません。</td></tr>'}
      </tbody>
    </table>
  </div>
  <div class="card-footer text-muted small d-flex justify-content-between align-items-center">
    <span>
      <i class="fas fa-sort me-1"></i>
      ソート: <strong>${currentSortLabel}</strong>
      ${sortDir === 'ASC' ? '<i class="fas fa-arrow-up ms-1 text-success"></i> 昇順' : '<i class="fas fa-arrow-down ms-1 text-danger"></i> 降順'}
    </span>
    <span class="text-muted">全 ${totalCount.toLocaleString()} 件 / ${PAGE_SIZE}件/ページ</span>
  </div>
</div>
${buildPager()}

<!-- ════ Excel/CSV 一括インポートモーダル ════ -->
<div class="modal fade" id="importModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-xl modal-dialog-scrollable">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white py-2">
        <h5 class="modal-title mb-0">
          <i class="fas fa-file-import me-2"></i>Excel / CSV 一括インポート
        </h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body p-3">

        <!-- ステップインジケーター -->
        <div class="d-flex align-items-center gap-2 mb-3">
          <span id="import-step-file" class="badge rounded-pill bg-primary active px-3 py-2">
            <i class="fas fa-upload me-1"></i>① ファイル選択
          </span>
          <i class="fas fa-chevron-right text-muted small"></i>
          <span id="import-step-preview" class="badge rounded-pill bg-secondary px-3 py-2">
            <i class="fas fa-table me-1"></i>② プレビュー確認
          </span>
          <i class="fas fa-chevron-right text-muted small"></i>
          <span id="import-step-done" class="badge rounded-pill bg-secondary px-3 py-2">
            <i class="fas fa-check me-1"></i>③ 完了
          </span>
        </div>

        <!-- ① ファイル選択エリア -->
        <div class="card border-primary mb-3">
          <div class="card-body py-3">
            <div class="row g-3 align-items-start">
              <div class="col-md-8">
                <label class="form-label fw-semibold">
                  <i class="fas fa-file-excel me-1 text-success"></i>
                  ファイルを選択 <span class="text-muted small fw-normal">（.xlsx / .xls / .csv 対応）</span>
                </label>
                <input type="file" class="form-control" id="import-file"
                  accept=".xlsx,.xls,.csv">
                <div class="text-danger small mt-1" id="import-file-error" style="display:none"></div>
                <div class="text-muted small mt-2">
                  <i class="fas fa-info-circle me-1"></i>
                  ヘッダー行（1行目）に列名が必要です。
                  日本語列名（品目・メーカー・商品名…）と英語列名（item_category・manufacturer・name…）どちらも使えます。
                </div>
              </div>
              <div class="col-md-4">
                <label class="form-label fw-semibold">
                  <i class="fas fa-cog me-1"></i>インポートモード
                </label>
                <select class="form-select" id="import-mode">
                  <option value="insert">新規追加のみ（既存は変更しない）</option>
                  <option value="upsert">追加 ＋ 更新（品番が一致したら上書き）</option>
                </select>
                <div class="text-muted small mt-1">
                  「更新」モードは品番(product_code)で既存レコードを照合します
                </div>
              </div>
            </div>

            <!-- 列マッピング早見表 -->
            <div class="mt-3">
              <button class="btn btn-sm btn-outline-secondary" type="button"
                data-bs-toggle="collapse" data-bs-target="#col-mapping-help">
                <i class="fas fa-question-circle me-1"></i>列名の対応表を表示
              </button>
              <div class="collapse mt-2" id="col-mapping-help">
                <table class="table table-sm table-bordered small mb-0" style="max-width:700px">
                  <thead class="table-light"><tr>
                    <th>日本語列名</th><th>英語列名</th><th>必須</th><th>説明</th>
                  </tr></thead>
                  <tbody>
                    <tr><td class="fw-semibold">品目</td><td><code>item_category</code></td><td><span class="text-danger">必須</span></td><td>シャフト / グリップ / ボール など</td></tr>
                    <tr><td class="fw-semibold">メーカー</td><td><code>manufacturer</code></td><td></td><td>フジクラ / グラファイトデザイン など</td></tr>
                    <tr><td class="fw-semibold">商品名</td><td><code>name</code></td><td><span class="text-danger">必須</span></td><td>例: SPEEDER NX 50</td></tr>
                    <tr><td class="fw-semibold">仕様</td><td><code>spec</code></td><td></td><td>例: 5S, 6X, R</td></tr>
                    <tr><td class="fw-semibold">色</td><td><code>color</code></td><td></td><td>例: 白, 黒</td></tr>
                    <tr><td class="fw-semibold">種類</td><td><code>club_type</code></td><td></td><td>DR / FW / UT / IR / PT</td></tr>
                    <tr><td class="fw-semibold">定価</td><td><code>list_price</code></td><td></td><td>数値（円）</td></tr>
                    <tr><td class="fw-semibold">掛率</td><td><code>default_rate</code></td><td></td><td>0〜1の小数（例: 0.55）</td></tr>
                    <tr><td class="fw-semibold">単位</td><td><code>unit</code></td><td></td><td>省略時は「本」</td></tr>
                    <tr><td class="fw-semibold">バーコード</td><td><code>barcode</code></td><td></td><td>JANコードなど</td></tr>
                    <tr><td class="fw-semibold">品番</td><td><code>product_code</code></td><td></td><td>更新モードの照合キー</td></tr>
                    <tr><td class="fw-semibold">出典</td><td><code>source</code></td><td></td><td>メモ・出典など</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- ② プレビューテーブル -->
        <div id="import-preview-wrap" style="display:none">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <div>
              <strong><i class="fas fa-table me-1 text-primary"></i>プレビュー</strong>
              <span class="text-muted small ms-2">
                全 <strong id="import-row-count">0</strong> 行
                <span id="import-err-badge" class="ms-1"></span>
              </span>
              <span class="text-danger small ms-2" id="import-err-count-wrap">
                （<span id="import-err-count">0</span>行にエラーあり — スキップされます）
              </span>
            </div>
          </div>
          <div class="table-responsive border rounded" style="max-height:320px;overflow-y:auto">
            <table class="table table-sm table-hover mb-0" style="font-size:0.8rem">
              <thead class="table-dark sticky-top" id="import-preview-thead"></thead>
              <tbody id="import-preview-tbody"></tbody>
            </table>
          </div>
          <div class="text-muted small mt-1" id="import-preview-more" style="display:none">
            <i class="fas fa-ellipsis-h me-1"></i>先頭200行のみ表示（残り <span id="import-preview-more-count"></span> 行は非表示）
          </div>
        </div>

        <!-- ③ 結果表示 -->
        <div id="import-result" style="display:none"></div>

      </div>
      <div class="modal-footer py-2">
        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">閉じる</button>
        <button type="button" class="btn btn-primary" id="btn-do-import" style="display:none">
          <i class="fas fa-file-import me-1"></i>インポート実行
        </button>
      </div>
    </div>
  </div>
</div>

<!-- 商品追加・編集モーダル -->
<div class="modal fade" id="productModal" tabindex="-1">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white">
        <h5 class="modal-title" id="pmTitle">商品を追加</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <form id="productForm">
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label fw-semibold">品目 <span class="text-danger">*</span></label>
              <input class="form-control" name="item_category" list="dl-cat" placeholder="シャフト / スリーブ..." required>
              <datalist id="dl-cat">${catOpts}</datalist>
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">メーカー</label>
              <input class="form-control" name="manufacturer" placeholder="フジクラ, グラファイトデザイン...">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">種類 (club_type)</label>
              <input class="form-control" name="club_type" placeholder="DR / FW / IRON...">
            </div>
            <div class="col-md-8">
              <label class="form-label fw-semibold">商品名 <span class="text-danger">*</span></label>
              <input class="form-control" name="name" placeholder="例: Tour AD CQ 6X" required>
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">仕様</label>
              <input class="form-control" name="spec" placeholder="例: 6X, S, R">
            </div>
            <div class="col-md-3">
              <label class="form-label fw-semibold">色</label>
              <input class="form-control" name="color" placeholder="例: 白, 黒">
            </div>
            <div class="col-md-3">
              <label class="form-label fw-semibold">定価 (円)</label>
              <input class="form-control text-end" name="list_price" type="number" min="0" step="100" placeholder="50000">
            </div>
            <div class="col-md-3">
              <label class="form-label fw-semibold">掛率 (例: 0.54)</label>
              <input class="form-control text-end" name="default_rate" type="number" min="0" max="1" step="0.01" placeholder="0.54">
            </div>
            <div class="col-md-3">
              <label class="form-label fw-semibold">単位</label>
              <input class="form-control" name="unit" value="本" placeholder="本 / 個 / 組">
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">標準仕入先</label>
              <select class="form-select" name="default_supplier_id">
                <option value="">― 未設定 ―</option>
                ${supplierOpts}
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">バーコード</label>
              <input class="form-control" name="barcode" placeholder="JANコードなど">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">品番 (product_code)</label>
              <input class="form-control" name="product_code">
            </div>
            <div class="col-md-8">
              <label class="form-label fw-semibold">出典 / メモ</label>
              <input class="form-control" name="source">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">キャンセル</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save me-1"></i>保存</button>
        </div>
      </form>
    </div>
  </div>
</div>`
  return layout('商品マスタ', content, scripts)
})

// ============================================================
// 仕入先マスタ
// ============================================================
app.get('/suppliers', async (c) => {
  const db = c.env.DB
  const res = await db.prepare('SELECT * FROM suppliers WHERE is_active=1 ORDER BY name').all<Record<string,unknown>>()

  // 発注方法バッジ
  function omBadge(m: unknown, detail: unknown): string {
    const d = String(detail||m||'').toLowerCase()
    if(d==='line'||d.includes('ライン')) return '<span class="badge" style="background:#06C755"><i class="fab fa-line me-1"></i>LINE</span>'
    if(d==='fax'||d.includes('ファックス')||d.includes('fax')) return '<span class="badge bg-secondary"><i class="fas fa-fax me-1"></i>FAX</span>'
    if(d==='email'||d==='mail'||d.includes('メール')) return '<span class="badge bg-primary"><i class="fas fa-envelope me-1"></i>メール</span>'
    if(d==='tel'||d.includes('電話')) return '<span class="badge bg-warning text-dark"><i class="fas fa-phone me-1"></i>電話</span>'
    if(d) return `<span class="badge bg-light text-dark border">${esc(String(m||detail))}</span>`
    return '<span class="text-muted small">未設定</span>'
  }

  const rows = res.results.map(r => `<tr data-id="${r['id']}">
    <td>
      <div class="fw-semibold">${esc(r['name'])}</div>
      ${esc(r['alias_names']) ? `<div class="text-muted small">${esc(r['alias_names'])}</div>` : ''}
    </td>
    <td>${esc(r['contact_name'])||''}${esc(r['honorific'])||''}</td>
    <td>${omBadge(r['order_method'], r['order_method_detail'])}</td>
    <td class="small">
      ${r['email'] ? `<a href="mailto:${esc(r['email'])}" class="text-decoration-none">${esc(r['email'])}</a>` : ''}
      ${r['line_id'] ? `<br><span class="badge" style="background:#06C755;font-size:0.7rem"><i class="fab fa-line me-1"></i>${esc(r['line_id'])}</span>` : ''}
      ${r['fax']||r['fax_number'] ? `<br><span class="text-muted"><i class="fas fa-fax me-1"></i>${esc(r['fax']||r['fax_number'])}</span>` : ''}
    </td>
    <td class="small">${r['phone'] ? `<a href="tel:${esc(r['phone'])}" class="text-decoration-none">${esc(r['phone'])}</a>` : ''}</td>
    <td class="small">${esc(r['payment_method'])}</td>
    <td class="small">${esc(r['shipping_rule'])}</td>
    <td class="small text-muted">${esc(r['notes'])}</td>
    <td>
      <button class="btn btn-xs btn-outline-primary btn-edit-sup py-0 px-2" data-row='${JSON.stringify(r).replace(/'/g,'&#39;')}'><i class="fas fa-edit"></i></button>
      <button class="btn btn-xs btn-outline-danger btn-del-sup py-0 px-2 ms-1" data-id="${r['id']}" data-name="${esc(r['name'])}"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join('')

  const scripts = `<script>
var supModal = new bootstrap.Modal(document.getElementById('supModal'));
var editingSupId = null;

function openAddSup(){
  editingSupId = null;
  document.getElementById('supTitle').textContent = '仕入先を追加';
  document.getElementById('supForm').reset();
  document.getElementById('fld-honorific').value='様';
  updateMethodFields();
  supModal.show();
}

function updateMethodFields(){
  var v = document.getElementById('fld-om-detail').value.toLowerCase();
  document.getElementById('row-email').style.display = (v===''||v==='email'||v==='mail') ? '' : 'none';
  document.getElementById('row-line').style.display  = (v==='line') ? '' : 'none';
  document.getElementById('row-fax').style.display   = (v==='fax') ? '' : 'none';
}
document.getElementById('fld-om-detail').addEventListener('change', updateMethodFields);

document.querySelectorAll('.btn-edit-sup').forEach(function(btn){
  btn.addEventListener('click', function(){
    var r = JSON.parse(this.dataset.row);
    editingSupId = r.id;
    document.getElementById('supTitle').textContent = '仕入先を編集';
    var f = document.getElementById('supForm');
    ['name','alias_names','contact_name','honorific','order_method','order_method_detail',
     'phone','fax','fax_number','email','line_id','line_group_id',
     'payment_method','shipping_rule','website','postal_code','address','notes'
    ].forEach(function(k){ if(f[k]) f[k].value = r[k]??''; });
    updateMethodFields();
    supModal.show();
  });
});

document.querySelectorAll('.btn-del-sup').forEach(function(btn){
  btn.addEventListener('click', function(){
    if(!confirm(this.dataset.name + ' を無効化しますか？')) return;
    fetch('/api/suppliers/'+this.dataset.id, {method:'DELETE'}).then(function(r){
      if(r.ok){ showFlash('無効化しました','success'); setTimeout(function(){ location.reload(); },800); }
      else showFlash('削除に失敗しました','danger');
    });
  });
});

document.getElementById('supForm').addEventListener('submit', async function(e){
  e.preventDefault();
  var fd = new FormData(this); var body = {};
  fd.forEach(function(v,k){ body[k]=v; });
  var url = editingSupId ? '/api/suppliers/'+editingSupId : '/api/suppliers';
  var resp = await fetch(url, {method: editingSupId?'PUT':'POST',
    headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
  if(resp.ok){
    showFlash(editingSupId?'更新しました':'追加しました','success');
    supModal.hide(); setTimeout(function(){ location.reload(); },800);
  } else {
    var err = await resp.json().catch(function(){ return {}; });
    showFlash(err.error||'保存に失敗しました','danger');
  }
});
</script>`

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <div><h1 class="h3 mb-1"><i class="fas fa-building me-2 text-primary"></i>仕入先マスタ</h1>
  <p class="text-muted mb-0">${res.results.length} 件登録</p></div>
  <button class="btn btn-success" onclick="openAddSup()"><i class="fas fa-plus me-1"></i>仕入先を追加</button>
</div>
<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0">
      <thead class="table-dark"><tr>
        <th>仕入先名</th><th>担当者</th><th>発注方法</th><th>連絡先</th>
        <th>電話</th><th>支払い</th><th>送料条件</th><th>備考</th><th>操作</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="text-center py-4 text-muted">仕入先データがありません。</td></tr>'}</tbody>
    </table>
  </div>
</div>

<!-- 仕入先モーダル -->
<div class="modal fade" id="supModal" tabindex="-1">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white">
        <h5 class="modal-title" id="supTitle">仕入先を追加</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <form id="supForm">
        <div class="modal-body">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label fw-semibold">仕入先名 <span class="text-danger">*</span></label>
              <input class="form-control" name="name" required placeholder="例: フジクラシャフト株式会社">
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">別名 / 略称</label>
              <input class="form-control" name="alias_names" placeholder="例: フジクラ, Fujikura">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">担当者名</label>
              <input class="form-control" name="contact_name" id="fld-contact" placeholder="山田">
            </div>
            <div class="col-md-2">
              <label class="form-label fw-semibold">敬称</label>
              <select class="form-select" name="honorific" id="fld-honorific">
                <option value="様">様</option><option value="御中">御中</option>
                <option value="さん">さん</option><option value="">なし</option>
              </select>
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">発注方法</label>
              <div class="d-flex gap-2">
                <input class="form-control" name="order_method" placeholder="メール / LINE / FAX など">
                <select class="form-select" name="order_method_detail" id="fld-om-detail" style="min-width:120px">
                  <option value="">― 区分 ―</option>
                  <option value="email">📧 メール</option>
                  <option value="line">💬 LINE</option>
                  <option value="fax">📠 FAX</option>
                  <option value="tel">📞 電話</option>
                  <option value="other">その他</option>
                </select>
              </div>
              <div class="form-text">区分を選ぶと関連フォームが表示されます</div>
            </div>

            <!-- メール -->
            <div class="col-12" id="row-email">
              <label class="form-label fw-semibold"><i class="fas fa-envelope text-primary me-1"></i>メールアドレス</label>
              <input class="form-control" name="email" type="email" placeholder="order@example.com">
            </div>
            <!-- LINE -->
            <div class="col-md-6" id="row-line" style="display:none">
              <label class="form-label fw-semibold"><i class="fab fa-line me-1" style="color:#06C755"></i>LINE ID / トークID</label>
              <input class="form-control" name="line_id" placeholder="@xxxx または個人ID">
            </div>
            <div class="col-md-6" id="row-line2" style="display:none">
              <label class="form-label fw-semibold">LINEグループID (任意)</label>
              <input class="form-control" name="line_group_id">
            </div>
            <!-- FAX -->
            <div class="col-md-6" id="row-fax" style="display:none">
              <label class="form-label fw-semibold"><i class="fas fa-fax me-1"></i>FAX番号</label>
              <input class="form-control" name="fax_number" placeholder="03-XXXX-XXXX">
            </div>

            <div class="col-md-4">
              <label class="form-label fw-semibold">電話番号</label>
              <input class="form-control" name="phone" placeholder="03-XXXX-XXXX">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">FAX (旧フィールド)</label>
              <input class="form-control" name="fax" placeholder="03-XXXX-XXXX">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">支払い方法</label>
              <input class="form-control" name="payment_method" placeholder="売掛 / 現金 / 振込">
            </div>
            <div class="col-12">
              <label class="form-label fw-semibold">送料条件</label>
              <input class="form-control" name="shipping_rule" placeholder="例: 3万円以上送料無料">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">Webサイト</label>
              <input class="form-control" name="website" type="url" placeholder="https://...">
            </div>
            <div class="col-md-2">
              <label class="form-label fw-semibold">郵便番号</label>
              <input class="form-control" name="postal_code" placeholder="000-0000">
            </div>
            <div class="col-md-6">
              <label class="form-label fw-semibold">住所</label>
              <input class="form-control" name="address">
            </div>
            <div class="col-12">
              <label class="form-label fw-semibold">備考</label>
              <textarea class="form-control" name="notes" rows="2"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">キャンセル</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save me-1"></i>保存</button>
        </div>
      </form>
    </div>
  </div>
</div>`
  return layout('仕入先マスタ', content, scripts)
})

// ============================================================
// 判定ルール
// ============================================================
app.get('/rules', async (c) => {
  const db = c.env.DB
  const res = await db.prepare(`
    SELECT sr.*, s.name AS supplier_name FROM supplier_rules sr
    JOIN suppliers s ON sr.supplier_id=s.id
    ORDER BY sr.item_category, sr.manufacturer, sr.club_type, sr.priority
  `).all<Record<string,unknown>>()

  const suppliers = await db.prepare('SELECT id, name FROM suppliers WHERE is_active=1 ORDER BY name').all<Record<string,unknown>>()
  const supplierOpts = suppliers.results.map(s => `<option value="${s['id']}">${esc(s['name'])}</option>`).join('')

  const cats = await db.prepare('SELECT DISTINCT item_category FROM products WHERE is_active=1 ORDER BY item_category').all<{item_category:string}>()
  const catOpts = cats.results.map(c2 => `<option value="${esc(c2.item_category)}">${esc(c2.item_category)}</option>`).join('')

  const rows = res.results.map(r => `<tr data-id="${r['id']}">
    <td>${r['item_category'] ? `<span class="badge bg-secondary">${esc(r['item_category'])}</span>` : '<span class="text-muted small">全品目</span>'}</td>
    <td>${r['manufacturer'] ? esc(r['manufacturer']) : '<span class="text-muted small">全メーカー</span>'}</td>
    <td>${r['club_type'] ? esc(r['club_type']) : '<span class="text-muted small">全種類</span>'}</td>
    <td><strong>${esc(r['supplier_name'])}</strong></td>
    <td class="text-center">${r['rate'] != null ? (Number(r['rate'])*100).toFixed(1)+'%' : '―'}</td>
    <td class="text-center"><span class="badge bg-light text-dark border">${r['priority']}</span></td>
    <td class="small text-muted">${esc(r['notes'])}</td>
    <td>
      <button class="btn btn-xs btn-outline-primary btn-edit-rule py-0 px-2" data-row='${JSON.stringify(r).replace(/'/g,"&#39;")}'>  <i class="fas fa-edit"></i></button>
      <button class="btn btn-xs btn-outline-danger btn-del-rule py-0 px-2 ms-1" data-id="${r['id']}"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join('')

  const scripts = `<script>
var ruleModal = new bootstrap.Modal(document.getElementById('ruleModal'));
var editingRuleId = null;

function openAddRule(){
  editingRuleId=null;
  document.getElementById('ruleTitle').textContent='ルールを追加';
  document.getElementById('ruleForm').reset();
  document.getElementById('rl-priority').value=100;
  ruleModal.show();
}

document.querySelectorAll('.btn-edit-rule').forEach(function(btn){
  btn.addEventListener('click',function(){
    var r=JSON.parse(this.dataset.row);
    editingRuleId=r.id;
    document.getElementById('ruleTitle').textContent='ルールを編集';
    var f=document.getElementById('ruleForm');
    f['item_category'].value=r.item_category??'';
    f['manufacturer'].value=r.manufacturer??'';
    f['club_type'].value=r.club_type??'';
    f['supplier_id'].value=r.supplier_id;
    f['rate'].value=r.rate!=null?r.rate:'';
    f['priority'].value=r.priority??100;
    f['notes'].value=r.notes??'';
    ruleModal.show();
  });
});

document.querySelectorAll('.btn-del-rule').forEach(function(btn){
  btn.addEventListener('click',function(){
    if(!confirm('このルールを削除しますか？')) return;
    fetch('/api/rules/'+this.dataset.id,{method:'DELETE'}).then(function(r){
      if(r.ok){showFlash('削除しました','success');setTimeout(function(){location.reload();},800);}
      else showFlash('削除に失敗しました','danger');
    });
  });
});

document.getElementById('ruleForm').addEventListener('submit',async function(e){
  e.preventDefault();
  var fd=new FormData(this);var body={};
  fd.forEach(function(v,k){body[k]=v;});
  var url=editingRuleId?'/api/rules/'+editingRuleId:'/api/rules';
  var resp=await fetch(url,{method:editingRuleId?'PUT':'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(resp.ok){
    showFlash(editingRuleId?'更新しました':'追加しました','success');
    ruleModal.hide();setTimeout(function(){location.reload();},800);
  }else{showFlash('保存に失敗しました','danger');}
});
</script>`

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <div>
    <h1 class="h3 mb-1"><i class="fas fa-sitemap me-2 text-primary"></i>仕入先判定ルール</h1>
    <p class="text-muted mb-0">品目・メーカー・種類から発注先を自動判定するルールです。優先順位の小さい方が優先されます。</p>
  </div>
  <button class="btn btn-success" onclick="openAddRule()"><i class="fas fa-plus me-1"></i>ルールを追加</button>
</div>

<div class="alert alert-info py-2 small mb-3">
  <i class="fas fa-info-circle me-1"></i>
  <strong>判定ロジック:</strong> 商品を発注する際、品目 → メーカー → 種類の順に絞り込み、最も優先度の高いルールの仕入先に自動振り分けされます。空欄は「すべて」にマッチします。
</div>

<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0">
      <thead class="table-dark"><tr>
        <th>品目</th><th>メーカー</th><th>種類</th><th>仕入先</th>
        <th class="text-center">掛率</th><th class="text-center">優先順位</th><th>備考</th><th>操作</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="text-center py-4 text-muted">ルールがありません。</td></tr>'}</tbody>
    </table>
  </div>
</div>

<!-- ルール追加・編集モーダル -->
<div class="modal fade" id="ruleModal" tabindex="-1">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header bg-primary text-white">
        <h5 class="modal-title" id="ruleTitle">ルールを追加</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <form id="ruleForm">
        <div class="modal-body">
          <div class="alert alert-warning py-2 small"><i class="fas fa-lightbulb me-1"></i>空欄にすると「すべての品目 / メーカー / 種類」にマッチします。</div>
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label fw-semibold">品目</label>
              <input class="form-control" name="item_category" list="rl-cat" placeholder="空欄=全品目">
              <datalist id="rl-cat">${catOpts}</datalist>
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">メーカー</label>
              <input class="form-control" name="manufacturer" placeholder="空欄=全メーカー">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">種類</label>
              <input class="form-control" name="club_type" placeholder="空欄=全種類">
            </div>
            <div class="col-md-8">
              <label class="form-label fw-semibold">仕入先 <span class="text-danger">*</span></label>
              <select class="form-select" name="supplier_id" required>
                <option value="">― 選択 ―</option>
                ${supplierOpts}
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">掛率 (例: 0.54)</label>
              <input class="form-control text-end" name="rate" type="number" min="0" max="1" step="0.01" placeholder="0.54">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">優先順位 <small class="text-muted">(小=優先)</small></label>
              <input class="form-control text-end" name="priority" id="rl-priority" type="number" min="1" value="100">
            </div>
            <div class="col-md-8">
              <label class="form-label fw-semibold">備考</label>
              <input class="form-control" name="notes">
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">キャンセル</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save me-1"></i>保存</button>
        </div>
      </form>
    </div>
  </div>
</div>`
  return layout('判定ルール', content, scripts)
})

// ============================================================
// 発注一覧
// ============================================================
app.get('/orders', async (c) => {
  const db = c.env.DB
  const status = (c.req.query('status') || '').trim()
  const supplier = (c.req.query('supplier') || '').trim()
  const q = (c.req.query('q') || '').trim()

  let sql = `SELECT po.id, po.order_no, po.order_date, po.status, po.customer_name, po.usage_type,
    s.name AS supplier_name,
    COUNT(DISTINCT poi.id) AS line_count,
    COALESCE(SUM(poi.amount),0) AS total_amount,
    COALESCE(SUM(poi.quantity),0) AS total_qty
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id=s.id
    LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
    WHERE 1=1`
  const params: unknown[] = []
  if (status) { sql += ' AND po.status=?'; params.push(status) }
  if (supplier) { sql += ' AND s.name LIKE ?'; params.push(`%${supplier}%`) }
  if (q) {
    sql += ' AND (po.order_no LIKE ? OR po.customer_name LIKE ? OR po.ordered_by LIKE ?)'
    const like = `%${q}%`; params.push(like, like, like)
  }
  sql += ' GROUP BY po.id ORDER BY po.id DESC'

  const stmt = db.prepare(sql)
  const res = params.length ? await stmt.bind(...params).all<Record<string,unknown>>() : await stmt.all<Record<string,unknown>>()

  const statusOpts = ['draft_created','ordered','partial','completed','cancelled']
  const statusNames: Record<string,string> = {
    draft_created:'下書き作成済', ordered:'発注済', partial:'一部入荷', completed:'完納', cancelled:'キャンセル'
  }

  const rows = res.results.map(r => `<tr>
    <td><a href="/orders/${r['id']}">${esc(r['order_no'])}</a></td>
    <td>${esc(r['order_date'])}</td>
    <td>${esc(r['supplier_name'])}</td>
    <td>${esc(r['customer_name'])}</td>
    <td>${esc(r['usage_type'])}</td>
    <td class="text-center">${r['line_count']}</td>
    <td class="text-center">${r['total_qty']}</td>
    <td class="text-end">${yen(r['total_amount'])}</td>
    <td>${statusBadge(String(r['status']))}</td>
  </tr>`).join('')

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <div><h1 class="h3 mb-1"><i class="fas fa-list me-2 text-primary"></i>発注一覧</h1>
  <p class="text-muted mb-0">発注履歴とステータスを一覧で確認できます。</p></div>
  <a class="btn btn-primary" href="/orders/new"><i class="fas fa-plus me-1"></i>新規発注</a>
</div>
<form class="row g-2 mb-3">
  <div class="col-md-2">
    <select name="status" class="form-select">
      <option value="">全ステータス</option>
      ${statusOpts.map(s => `<option value="${s}" ${status===s?'selected':''}>${statusNames[s]}</option>`).join('')}
    </select>
  </div>
  <div class="col-md-2"><input class="form-control" name="supplier" value="${esc(supplier)}" placeholder="仕入先"></div>
  <div class="col-md-3"><input class="form-control" name="q" value="${esc(q)}" placeholder="発注番号・顧客名・発注者"></div>
  <div class="col-auto"><button class="btn btn-outline-primary"><i class="fas fa-search me-1"></i>検索</button></div>
  ${(status||supplier||q) ? '<div class="col-auto"><a href="/orders" class="btn btn-outline-secondary">クリア</a></div>' : ''}
</form>
<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead class="table-light"><tr>
        <th>発注番号</th><th>発注日</th><th>仕入先</th><th>顧客名</th><th>用途</th>
        <th class="text-center">明細</th><th class="text-center">数量</th>
        <th class="text-end">金額</th><th>状態</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="9" class="text-center text-muted py-4">対象データがありません。</td></tr>'}</tbody>
    </table>
  </div>
  <div class="card-footer text-muted small">${res.results.length}件</div>
</div>`
  return layout('発注一覧', content)
})

// ============================================================
// 新規発注フォーム  ★ルートを /orders/:id より前に定義
// ============================================================
app.get('/orders/new', async (c) => {
  const db = c.env.DB
  const products = await db.prepare(`
    SELECT p.id, p.item_category, p.manufacturer, p.name, p.spec, p.club_type,
           p.list_price, p.default_rate, s.name AS supplier_name
    FROM products p LEFT JOIN suppliers s ON p.default_supplier_id=s.id
    WHERE p.is_active=1 ORDER BY p.item_category, p.manufacturer, p.name LIMIT 5000
  `).all<Record<string,unknown>>()

  // 外部JSに商品データを渡すインライン変数のみ定義
  const dataScript = `<script>var PRODUCTS = ${JSON.stringify(products.results)};</script>`

  // モーダル HTML
  const modalHtml = `
<div class="modal fade" id="productModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-scrollable">
    <div class="modal-content">
      <div class="modal-header py-2">
        <div class="d-flex align-items-center gap-2 flex-grow-1">
          <button type="button" id="modal-back" class="btn btn-sm btn-outline-secondary" style="display:none">
            <i class="fas fa-chevron-left me-1"></i>戻る
          </button>
          <h6 class="modal-title mb-0 fw-bold" id="modal-title">カテゴリーを選択</h6>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="px-3 pt-2 pb-1" id="modal-search-wrap" style="display:none">
        <input type="text" id="modal-search" class="form-control form-control-sm"
               placeholder="商品名・仕様・種類で絞り込み…">
      </div>
      <div class="modal-body p-0" id="modal-body" style="max-height:440px;overflow-y:auto"></div>
    </div>
  </div>
</div>`

  const content = `
${dataScript}
${modalHtml}
<div class="mb-3">
  <h1 class="h3 mb-1"><i class="fas fa-plus-circle me-2 text-primary"></i>新規発注</h1>
  <p class="text-muted mb-0">
    <i class="fas fa-search me-1 text-success"></i>ボタンでカテゴリーから商品を選択し、発注明細を作成してください。
  </p>
</div>
<form id="order-form">
  <div class="card shadow-sm mb-3">
    <div class="card-header bg-white"><strong><i class="fas fa-info-circle me-1"></i>発注ヘッダ</strong></div>
    <div class="card-body row g-3">
      <div class="col-6 col-md-2">
        <label class="form-label">発注日</label>
        <input class="form-control" type="date" name="order_date" value="${todayStr()}">
      </div>
      <div class="col-6 col-md-2">
        <label class="form-label">発注者 <span class="text-danger">*</span></label>
        <input class="form-control" name="ordered_by" placeholder="古川" required>
      </div>
      <div class="col-6 col-md-2">
        <label class="form-label">顧客名</label>
        <input class="form-control" name="customer_name" placeholder="上田様">
      </div>
      <div class="col-6 col-md-2">
        <label class="form-label">用途</label>
        <input class="form-control" name="usage_type" placeholder="取り寄せ / 在庫用">
      </div>
      <div class="col-6 col-md-2">
        <label class="form-label">希望納期</label>
        <input class="form-control" type="date" name="requested_delivery_date">
      </div>
      <div class="col-12">
        <label class="form-label">発注備考</label>
        <textarea class="form-control" name="order_note" rows="2"
                  placeholder="メール本文へ差し込む全体備考"></textarea>
      </div>
    </div>
  </div>

  <div class="card shadow-sm">
    <div class="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div class="d-flex align-items-center gap-3">
        <strong><i class="fas fa-table me-1"></i>発注明細</strong>
        <span class="text-muted small">
          合計金額：<strong id="total-amount" class="text-primary fs-6">―</strong>
        </span>
      </div>
      <button type="button" class="btn btn-sm btn-outline-primary" id="add-row">
        <i class="fas fa-plus me-1"></i>行を追加
      </button>
    </div>
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-0" id="line-table">
        <thead class="table-light">
          <tr>
            <th style="min-width:160px">選択商品</th>
            <th style="min-width:72px">品目</th>
            <th style="min-width:90px">メーカー</th>
            <th style="min-width:150px">商品名</th>
            <th style="min-width:60px">仕様</th>
            <th style="min-width:55px">色</th>
            <th style="min-width:65px">種類</th>
            <th style="min-width:55px">数量</th>
            <th style="min-width:80px">定価</th>
            <th style="min-width:68px">掛率</th>
            <th style="min-width:80px">単価</th>
            <th style="min-width:90px">備考</th>
            <th></th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="card-footer bg-white d-flex justify-content-between align-items-center py-3">
      <p class="text-muted small mb-0">
        <i class="fas fa-lightbulb me-1 text-warning"></i>
        定価・掛率を入力すると単価が自動計算されます
      </p>
      <button type="submit" class="btn btn-primary btn-lg px-4">
        <i class="fas fa-paper-plane me-1"></i>発注データとメール下書きを作成
      </button>
    </div>
  </div>
</form>`

  // Bootstrap JS より後に読み込む必要があるため extraScripts として渡す
  const newOrderScripts = `<script src="/static/new-order.js"></script>`

  return layout('新規発注', content, newOrderScripts)
})

// ============================================================
// メールバッチ
// ============================================================
app.get('/mail-batch/:batch_code', async (c) => {
  const db = c.env.DB
  const batchCode = c.req.param('batch_code')

  const orders = await db.prepare(`
    SELECT po.*, s.name AS supplier_name, s.email AS supplier_email,
           s.contact_name, s.order_method
    FROM purchase_orders po JOIN suppliers s ON po.supplier_id=s.id
    WHERE po.batch_code=? ORDER BY po.id
  `).bind(batchCode).all<Record<string,unknown>>()

  const cards: string[] = []
  for (const order of orders.results) {
    const items = await db.prepare(
      'SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id'
    ).bind(order['id']).all<Record<string,unknown>>()

    const itemRows = items.results.map(item => `<tr>
      <td>${esc(item['item_category'])}</td><td>${esc(item['manufacturer'])}</td>
      <td>${esc(item['product_name'])}</td><td>${esc(item['spec'])}</td>
      <td>${esc(item['club_type'])}</td>
      <td class="text-center">${item['quantity']}</td>
      <td class="text-end">${yen(item['unit_price'])}</td>
      <td class="text-end">${yen(item['amount'])}</td>
    </tr>`).join('')

    const emailBody = String(order['email_body'] ?? '')
    const emailSubject = String(order['email_subject'] ?? '')
    const supplierEmail = String(order['supplier_email'] ?? '')

    const mailtoLink = supplierEmail
      ? `<a class="btn btn-outline-secondary" href="mailto:${esc(supplierEmail)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}"><i class="fas fa-envelope me-1"></i>メールソフトで開く</a>`
      : ''

    const bodyEscaped = emailBody.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const bodyJson = JSON.stringify(emailBody)

    cards.push(`
    <div class="card shadow-sm mb-4">
      <div class="card-header bg-white d-flex justify-content-between align-items-center">
        <div><strong><i class="fas fa-building me-1"></i>${esc(order['supplier_name'])}</strong>
          <span class="text-muted ms-2">${esc(order['order_no'])}</span></div>
        <div class="small text-muted">発注方法: ${esc(order['order_method']) || '未設定'}</div>
      </div>
      <div class="card-body">
        <div class="row g-3 mb-3">
          <div class="col-md-5"><label class="form-label fw-bold">宛先</label>
            <input class="form-control" readonly value="${esc(order['supplier_email'])}"></div>
          <div class="col-md-7"><label class="form-label fw-bold">件名</label>
            <input class="form-control" readonly value="${esc(emailSubject)}"></div>
        </div>
        <div class="mb-3"><label class="form-label fw-bold">本文</label>
          <textarea class="form-control font-monospace" rows="12" readonly>${bodyEscaped}</textarea></div>
        <div class="table-responsive mb-3">
          <table class="table table-sm mb-0">
            <thead class="table-light"><tr>
              <th>品目</th><th>メーカー</th><th>商品名</th><th>仕様</th><th>種類</th>
              <th class="text-center">数量</th><th class="text-end">単価</th><th class="text-end">金額</th>
            </tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <a class="btn btn-primary" href="/orders/${order['id']}"><i class="fas fa-file-alt me-1"></i>発注詳細を見る</a>
          ${mailtoLink}
          <button class="btn btn-outline-success" onclick="copyBody(this,${bodyJson})">
            <i class="fas fa-copy me-1"></i>本文をコピー
          </button>
        </div>
      </div>
    </div>`)
  }

  const scripts = `<script>
function copyBody(btn, text){
  navigator.clipboard.writeText(text).then(function(){
    var orig = btn.innerHTML;
    btn.innerHTML='<i class="fas fa-check me-1"></i>コピーしました';
    btn.classList.replace('btn-outline-success','btn-success');
    setTimeout(function(){ btn.innerHTML=orig; btn.classList.replace('btn-success','btn-outline-success'); },2000);
  });
}
</script>`

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <div><h1 class="h3 mb-1"><i class="fas fa-envelope-open-text me-2 text-primary"></i>メール下書き一覧</h1>
  <p class="text-muted mb-0">仕入先ごとに作成した発注メールの件名・本文です。Outlookへ転記して利用できます。</p></div>
  <a class="btn btn-outline-secondary" href="/orders"><i class="fas fa-list me-1"></i>発注一覧へ</a>
</div>
${cards.length ? cards.join('') : '<div class="alert alert-warning">該当するメール下書きがありません。</div>'}`
  return layout('メール下書き', content, scripts)
})

// ============================================================
// 発注詳細
// ============================================================
app.get('/orders/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return layout('エラー', '<div class="alert alert-danger">不正なIDです。</div>')

  const order = await db.prepare(`
    SELECT po.*, s.name AS supplier_name, s.email AS supplier_email,
           s.contact_name, s.honorific, s.order_method, s.order_method_detail,
           s.phone, s.line_id, s.fax, s.fax_number, s.website
    FROM purchase_orders po JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=?
  `).bind(id).first<Record<string,unknown>>()
  if (!order) return layout('エラー', '<div class="alert alert-danger">発注データが見つかりません。</div>')

  const items = await db.prepare(`
    SELECT poi.*,
      COALESCE((SELECT SUM(ri.received_quantity) FROM receipt_items ri WHERE ri.purchase_order_item_id=poi.id),0) AS received_qty
    FROM purchase_order_items poi WHERE poi.purchase_order_id=? ORDER BY poi.id
  `).bind(id).all<Record<string,unknown>>()

  const receipts = await db.prepare(
    'SELECT * FROM receipts WHERE purchase_order_id=? ORDER BY id DESC'
  ).bind(id).all<Record<string,unknown>>()

  // 合計金額
  const totalAmount = items.results.reduce((s, i) => s + (Number(i['amount'])||0), 0)

  const itemRows = items.results.map(item => {
    const remaining = Number(item['quantity']||0) - Number(item['received_qty']||0)
    const pct = Number(item['quantity']||0) > 0
      ? Math.round(Number(item['received_qty']||0) / Number(item['quantity']||0) * 100) : 0
    // data-poi-id を付与 → JS側でAjax更新対象を特定
    return `<tr data-poi-id="${item['id']}">
      <td><span class="badge bg-secondary">${esc(item['item_category'])}</span></td>
      <td class="small">${esc(item['manufacturer'])}</td>
      <td><strong>${esc(item['product_name'])}</strong></td>
      <td class="small text-muted">${[esc(item['spec']), esc(item['color'])].filter(Boolean).join(' / ')}</td>
      <td class="small">${esc(item['club_type'])}</td>
      <td class="text-center fw-semibold">${item['quantity']}</td>
      <td class="text-center cell-received">
        <span class="text-success fw-semibold recv-qty">${item['received_qty']}</span>
        <div class="progress" style="height:4px;width:48px;margin:2px auto 0">
          <div class="progress-bar bg-success recv-bar" style="width:${pct}%"></div>
        </div>
      </td>
      <td class="text-center cell-remaining ${remaining>0?'text-danger fw-bold':'text-muted'}">${remaining}</td>
      <td class="text-end">${yen(item['unit_price'])}</td>
      <td class="text-end fw-semibold">${yen(item['amount'])}</td>
      <td class="small text-muted">${esc(item['line_note'])}</td>
    </tr>`
  }).join('')

  const receiptRows = receipts.results.length
    ? receipts.results.map(r => `<tr>
        <td>${esc(r['received_date'])}</td><td>${esc(r['slip_date'])||'―'}</td>
        <td>${esc(r['inspected_by'])||'―'}</td><td>${esc(r['note'])}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="text-center py-3 text-muted">まだ納品登録がありません。</td></tr>'

  // ── 発注方法別アクションパネル ───────────────────────────────
  const emailBody    = String(order['email_body']    ?? '')
  const emailSubject = String(order['email_subject'] ?? '')
  const supplierEmail = String(order['supplier_email'] ?? '')
  const lineId       = String(order['line_id']       ?? '')
  const faxNum       = String((order['fax_number'] || order['fax']) ?? '')
  const phone        = String(order['phone']         ?? '')
  const omDetail     = String(order['order_method_detail'] ?? order['order_method'] ?? '').toLowerCase()
  const bodyEsc      = emailBody.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  const bodyJson     = JSON.stringify(emailBody)

  // メールパネル
  const emailPanel = `
<div class="mb-2 d-flex gap-2 flex-wrap align-items-center">
  <span class="fw-semibold text-muted small">宛先:</span>
  <span>${supplierEmail ? `<a href="mailto:${esc(supplierEmail)}">${esc(supplierEmail)}</a>` : '<em class="text-muted">未設定</em>'}</span>
</div>
<div class="mb-2">
  <span class="fw-semibold text-muted small">件名:</span>
  <span class="ms-1">${esc(emailSubject)}</span>
</div>
<div class="mb-2 position-relative">
  <textarea id="email-body-ta" class="form-control font-monospace" rows="10" readonly>${bodyEsc}</textarea>
</div>
<div class="d-flex gap-2 flex-wrap">
  ${supplierEmail ? `<a class="btn btn-primary btn-sm" href="mailto:${esc(supplierEmail)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}"><i class="fas fa-envelope me-1"></i>メールソフトで開く</a>` : ''}
  <button class="btn btn-outline-success btn-sm" id="btn-copy-body"><i class="fas fa-copy me-1"></i>本文をコピー</button>
</div>`

  // LINEパネル
  const linePanel = `
<div class="alert alert-success py-2 mb-2">
  <i class="fab fa-line me-1"></i>
  LINE ID: <strong>${lineId || '未設定'}</strong>
  ${lineId ? `<a class="btn btn-sm btn-success ms-3" href="https://line.me/R/ti/p/${esc(lineId)}" target="_blank"><i class="fab fa-line me-1"></i>LINEで開く</a>` : ''}
</div>
<div class="mb-2 position-relative">
  <label class="form-label fw-semibold small text-muted">送信テキスト（コピーしてLINEに貼り付け）</label>
  <textarea id="line-body-ta" class="form-control font-monospace" rows="10" readonly>${bodyEsc}</textarea>
</div>
<div class="d-flex gap-2">
  <button class="btn btn-success btn-sm" id="btn-copy-line"><i class="fas fa-copy me-1"></i>テキストをコピー</button>
</div>`

  // FAXパネル
  const faxPanel = `
<div class="alert alert-secondary py-2 mb-2">
  <i class="fas fa-fax me-1"></i>
  FAX番号: <strong>${faxNum || '未設定'}</strong>
  ${phone ? ` / TEL: <strong>${esc(phone)}</strong>` : ''}
</div>
<div class="mb-2">
  <label class="form-label fw-semibold small text-muted">FAX本文（印刷またはコピーしてご利用ください）</label>
  <textarea id="fax-body-ta" class="form-control font-monospace" rows="10" readonly>${bodyEsc}</textarea>
</div>
<div class="d-flex gap-2">
  <button class="btn btn-secondary btn-sm" onclick="window.print()"><i class="fas fa-print me-1"></i>印刷</button>
  <button class="btn btn-outline-secondary btn-sm" id="btn-copy-fax"><i class="fas fa-copy me-1"></i>本文をコピー</button>
</div>`

  // 発注方法に応じてパネルを選択
  let orderPanel: string
  let orderPanelTitle: string
  let orderPanelIcon: string
  if (omDetail === 'line' || omDetail.includes('ライン')) {
    orderPanel = linePanel; orderPanelTitle = 'LINE送信'; orderPanelIcon = 'fab fa-line text-success'
  } else if (omDetail === 'fax' || omDetail.includes('fax') || omDetail.includes('ファックス')) {
    orderPanel = faxPanel; orderPanelTitle = 'FAX送信'; orderPanelIcon = 'fas fa-fax text-secondary'
  } else {
    orderPanel = emailPanel; orderPanelTitle = 'メール下書き'; orderPanelIcon = 'fas fa-envelope text-primary'
  }

  // ステータス変更ボタン群
  const statusButtons: Record<string,string> = {
    ordered: '<button class="btn btn-sm btn-primary" id="btn-s-ordered"><i class="fas fa-paper-plane me-1"></i>発注済に更新</button>',
    completed: '<button class="btn btn-sm btn-success" id="btn-s-completed"><i class="fas fa-check-double me-1"></i>完納にする</button>',
    cancelled: '<button class="btn btn-sm btn-outline-danger" id="btn-s-cancelled"><i class="fas fa-ban me-1"></i>キャンセル</button>',
  }
  const curStatus = String(order['status'])
  const showButtons = curStatus === 'draft_created' ? [statusButtons.ordered, statusButtons.cancelled]
    : curStatus === 'ordered'  ? [statusButtons.completed, statusButtons.cancelled]
    : curStatus === 'partial'  ? [statusButtons.completed, statusButtons.cancelled]
    : []

  const scripts = `<script>
// ============================================================
// 納品履歴・入荷済数をAjaxで即時更新
// ============================================================
(function(){
  var ORDER_ID = ${id};

  function yenFmt(v){
    if(v===null||v===undefined||v==='') return '';
    var n = parseFloat(String(v));
    return isNaN(n) ? '' : '\u00a5' + n.toLocaleString('ja-JP',{maximumFractionDigits:0});
  }

  function refreshReceipts(){
    var spinner = document.getElementById('receipt-updating');
    if(spinner) spinner.style.display = '';

    fetch('/api/orders/' + ORDER_ID, {cache:'no-store', credentials:'include'})
      .then(function(r){ return r.json(); })
      .then(function(data){
        // ── 発注明細の入荷済・残数を更新 ──
        (data.items||[]).forEach(function(item){
          var tr = document.querySelector('#order-items-tbody tr[data-poi-id="'+item.id+'"]');
          if(!tr) return;
          var qty = Number(item.quantity||0);
          var recv = Number(item.received_qty||0);
          var rem  = qty - recv;
          var pct  = qty > 0 ? Math.round(recv/qty*100) : 0;

          var recvSpan = tr.querySelector('.recv-qty');
          if(recvSpan) recvSpan.textContent = recv;

          var recvBar = tr.querySelector('.recv-bar');
          if(recvBar) recvBar.style.width = pct + '%';

          var remCell = tr.querySelector('.cell-remaining');
          if(remCell){
            remCell.textContent = rem;
            remCell.className = 'text-center cell-remaining ' + (rem>0?'text-danger fw-bold':'text-muted');
          }
        });

        // ── 納品履歴テーブルを更新 ──
        var tbody = document.getElementById('receipt-tbody');
        if(!tbody) return;
        var receipts = data.receipts||[];
        if(receipts.length === 0){
          tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-muted">まだ納品登録がありません。</td></tr>';
        } else {
          tbody.innerHTML = receipts.map(function(r){
            return '<tr>'+
              '<td>'+(r.received_date||'')+'</td>'+
              '<td>'+(r.slip_date||'―')+'</td>'+
              '<td>'+(r.inspected_by||'―')+'</td>'+
              '<td>'+(r.note||'')+'</td>'+
            '</tr>';
          }).join('');
        }
      })
      .catch(function(err){ console.warn('receipt refresh error', err); })
      .finally(function(){
        if(spinner) spinner.style.display = 'none';
      });
  }

  // ページロード直後に1回更新（URLに ?_r= が付いている場合＝納品登録直後）
  var isAfterReceipt = location.search.indexOf('_r=') >= 0;
  if(isAfterReceipt){
    // URLから ?_r= を除去（URLSearchParamsを使って正規表現のエスケープ問題を回避）
    var params = new URLSearchParams(location.search);
    params.delete('_r');
    var qs = params.toString();
    var cleanUrl = location.pathname + (qs ? '?' + qs : '');
    history.replaceState(null,'',cleanUrl);
    // 納品登録直後は確実に最新データを取得
    refreshReceipts();
  }

  // 「納品登録」リンクから戻った際にも更新（ページ表示イベント）
  window.addEventListener('pageshow', function(e){
    if(e.persisted){
      // bfcache から復元された場合は強制更新
      refreshReceipts();
    }
  });
})();

// コピーボタン汎用
function makeCopyBtn(btnId, taId){
  var btn = document.getElementById(btnId);
  if(!btn) return;
  btn.addEventListener('click', function(){
    var text = document.getElementById(taId).value;
    navigator.clipboard.writeText(text).then(function(){
      var orig = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check me-1"></i>コピーしました';
      btn.classList.add('btn-success'); btn.classList.remove('btn-outline-success','btn-outline-secondary');
      setTimeout(function(){ btn.innerHTML=orig; btn.classList.remove('btn-success'); btn.classList.add('btn-outline-success'); },2000);
    });
  });
}
makeCopyBtn('btn-copy-body','email-body-ta');
makeCopyBtn('btn-copy-line','line-body-ta');
makeCopyBtn('btn-copy-fax','fax-body-ta');

// ステータス変更
function bindStatus(btnId, status, label){
  var btn = document.getElementById(btnId);
  if(!btn) return;
  btn.addEventListener('click', async function(){
    if(!confirm(label + 'に変更しますか？')) return;
    btn.disabled=true;
    var r = await fetch('/api/orders/${id}/status', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({status: status})
    });
    if(r.ok){ showFlash(label+'に更新しました','success'); setTimeout(function(){ location.reload(); },900); }
    else { showFlash('更新に失敗しました','danger'); btn.disabled=false; }
  });
}
bindStatus('btn-s-ordered','ordered','発注済');
bindStatus('btn-s-completed','completed','完納');
bindStatus('btn-s-cancelled','cancelled','キャンセル');

// 発注コピー
document.getElementById('btn-copy-order').addEventListener('click', async function(){
  if(!confirm('この発注をコピーして再発注データを作成しますか？')) return;
  this.disabled=true;
  var r = await fetch('/api/orders/${id}/copy',{method:'POST'});
  var res = await r.json();
  if(r.ok){
    showFlash('再発注データを作成しました（発注番号: '+res.order_id+'）','success');
    setTimeout(function(){ location.href='/orders/'+res.order_id; },1200);
  } else { showFlash(res.error||'コピーに失敗しました','danger'); this.disabled=false; }
});
</script>`

  const content = `
<!-- ページヘッダ -->
<div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
  <div>
    <h1 class="h3 mb-1"><i class="fas fa-file-alt me-2 text-primary"></i>発注詳細</h1>
    <div class="d-flex align-items-center gap-2 flex-wrap">
      <span class="text-muted">${esc(order['order_no'])}</span>
      <span class="mx-1 text-muted">|</span>
      <strong>${esc(order['supplier_name'])}</strong>
      ${statusBadge(curStatus)}
    </div>
  </div>
  <div class="d-flex gap-2 flex-wrap">
    ${showButtons.join('')}
    <a class="btn btn-sm btn-outline-primary" href="/receipts/new/${id}"><i class="fas fa-truck me-1"></i>納品登録</a>
    <button class="btn btn-sm btn-outline-secondary" id="btn-copy-order"><i class="fas fa-copy me-1"></i>再発注</button>
    <a class="btn btn-sm btn-outline-secondary" href="/orders"><i class="fas fa-arrow-left me-1"></i>一覧へ</a>
  </div>
</div>

<!-- 上段: ヘッダ情報 + 発注方法別パネル -->
<div class="row g-3 mb-3">
  <div class="col-lg-4">
    <div class="card shadow-sm h-100">
      <div class="card-header bg-white py-2"><strong><i class="fas fa-info-circle me-1 text-primary"></i>発注情報</strong></div>
      <div class="card-body py-2">
        <dl class="row mb-0 small">
          <dt class="col-5 text-muted">発注日</dt><dd class="col-7 fw-semibold">${esc(order['order_date'])}</dd>
          <dt class="col-5 text-muted">発注者</dt><dd class="col-7">${esc(order['ordered_by'])}</dd>
          <dt class="col-5 text-muted">顧客名</dt><dd class="col-7">${esc(order['customer_name'])||'―'}</dd>
          <dt class="col-5 text-muted">用途</dt><dd class="col-7">${esc(order['usage_type'])||'―'}</dd>
          <dt class="col-5 text-muted">希望納期</dt><dd class="col-7">${esc(order['requested_delivery_date'])||'―'}</dd>
          <dt class="col-5 text-muted">合計金額</dt><dd class="col-7 fw-bold text-primary fs-6">${yen(totalAmount)}</dd>
          <dt class="col-5 text-muted">担当者</dt><dd class="col-7">${esc(order['contact_name'])||''} ${esc(order['honorific'])||''}</dd>
          <dt class="col-5 text-muted">発注方法</dt><dd class="col-7">${esc(order['order_method'])||'―'}</dd>
          <dt class="col-5 text-muted">備考</dt><dd class="col-7 text-muted">${esc(order['order_note'])||'―'}</dd>
        </dl>
      </div>
    </div>
  </div>
  <div class="col-lg-8">
    <div class="card shadow-sm h-100">
      <div class="card-header bg-white py-2">
        <strong><i class="${orderPanelIcon} me-1"></i>${orderPanelTitle}</strong>
        <span class="ms-2 badge bg-light text-dark border small">${esc(order['order_method'])||'方法未設定'}</span>
      </div>
      <div class="card-body">${orderPanel}</div>
    </div>
  </div>
</div>

<!-- 発注明細 -->
<div class="card shadow-sm mb-3">
  <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center">
    <strong><i class="fas fa-table me-1 text-primary"></i>発注明細</strong>
    <span class="badge bg-primary">${items.results.length} 品目 / 合計 ${yen(totalAmount)}</span>
  </div>
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0" id="order-items-table">
      <thead class="table-dark"><tr>
        <th>品目</th><th>メーカー</th><th>商品名</th><th>仕様・色</th><th>種類</th>
        <th class="text-center">発注数</th>
        <th class="text-center">入荷済</th>
        <th class="text-center">残数</th>
        <th class="text-end">単価</th><th class="text-end">金額</th><th>備考</th>
      </tr></thead>
      <tbody id="order-items-tbody">${itemRows || '<tr><td colspan="11" class="text-center text-muted py-3">明細がありません。</td></tr>'}</tbody>
    </table>
  </div>
</div>

<!-- 納品履歴 -->
<div class="card shadow-sm">
  <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center">
    <div class="d-flex align-items-center gap-2">
      <strong><i class="fas fa-truck me-1 text-success"></i>納品履歴</strong>
      <span id="receipt-updating" class="spinner-border spinner-border-sm text-success" style="display:none" title="更新中"></span>
    </div>
    <a class="btn btn-sm btn-outline-primary" href="/receipts/new/${id}"><i class="fas fa-plus me-1"></i>納品登録</a>
  </div>
  <div class="table-responsive">
    <table class="table table-sm mb-0">
      <thead class="table-light"><tr><th>入荷日</th><th>納品書日付</th><th>検品者</th><th>備考</th></tr></thead>
      <tbody id="receipt-tbody">${receiptRows}</tbody>
    </table>
  </div>
</div>`
  return layout(`発注詳細 ${esc(order['order_no'])}`, content, scripts)
})

// ============================================================
// 納品履歴
// ============================================================
app.get('/receipts', async (c) => {
  const db = c.env.DB

  // 絞り込みパラメータ
  const from       = c.req.query('from')        || ''
  const to         = c.req.query('to')          || ''
  const supplierId = c.req.query('supplier_id') || ''

  // 仕入先一覧（フィルタ用）
  const supplierRes = await db.prepare(
    'SELECT id, name FROM suppliers ORDER BY name'
  ).all<Record<string,unknown>>()
  const supplierOptions = supplierRes.results.map(s =>
    `<option value="${esc(s['id'])}" ${supplierId === String(s['id']) ? 'selected' : ''}>${esc(s['name'])}</option>`
  ).join('')

  // 絞り込み付きクエリ
  let sql = `
    SELECT r.id, r.received_date, r.slip_date, r.inspected_by, r.note,
           po.order_no, po.id AS purchase_order_id, po.customer_name,
           s.name AS supplier_name, s.id AS supplier_id,
           COUNT(ri.id) AS item_count,
           SUM(ri.received_quantity) AS total_qty,
           SUM(ri.received_quantity * poi.unit_price) AS total_amount
    FROM receipts r
    JOIN purchase_orders po ON r.purchase_order_id=po.id
    JOIN suppliers s ON po.supplier_id=s.id
    LEFT JOIN receipt_items ri ON ri.receipt_id=r.id
    LEFT JOIN purchase_order_items poi ON ri.purchase_order_item_id=poi.id
    WHERE 1=1`
  const binds: unknown[] = []
  if (from) { sql += ` AND r.received_date >= ?`; binds.push(from) }
  if (to)   { sql += ` AND r.received_date <= ?`; binds.push(to) }
  if (supplierId) { sql += ` AND po.supplier_id = ?`; binds.push(Number(supplierId)) }
  sql += ` GROUP BY r.id ORDER BY r.received_date DESC, r.id DESC LIMIT 300`

  let stmt = db.prepare(sql)
  if (binds.length) stmt = (stmt.bind as (...a: unknown[]) => typeof stmt)(...binds)
  const res = await stmt.all<Record<string,unknown>>()

  // サマリー計算
  const totalQty    = res.results.reduce((s, r) => s + (Number(r['total_qty'])    || 0), 0)
  const totalAmount = res.results.reduce((s, r) => s + (Number(r['total_amount']) || 0), 0)

  const rows = res.results.map(r => `<tr>
    <td class="fw-semibold">${esc(r['received_date'])}</td>
    <td class="text-muted">${esc(r['slip_date']) || '―'}</td>
    <td><a href="/orders/${r['purchase_order_id']}" class="text-decoration-none fw-semibold">${esc(r['order_no'])}</a></td>
    <td>${esc(r['supplier_name'])}</td>
    <td>${esc(r['customer_name']) || '―'}</td>
    <td class="text-center">${esc(r['item_count'])}</td>
    <td class="text-end">${Number(r['total_qty'])||0} 個</td>
    <td class="text-end fw-semibold">${yen(r['total_amount'])}</td>
    <td>${esc(r['inspected_by']) || '―'}</td>
    <td class="text-muted small">${esc(r['note']) || ''}</td>
  </tr>`).join('')

  // ダウンロードURL組み立て
  const dlParams = new URLSearchParams()
  if (from) dlParams.set('from', from)
  if (to)   dlParams.set('to', to)
  if (supplierId) dlParams.set('supplier_id', supplierId)
  const dlUrl = `/api/receipts/download${dlParams.toString() ? '?' + dlParams.toString() : ''}`

  const content = `
<div class="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
  <div>
    <h1 class="h3 mb-1"><i class="fas fa-truck me-2 text-primary"></i>納品履歴</h1>
    <p class="text-muted mb-0">登録済みの納品データ一覧です。</p>
  </div>
  <a href="${dlUrl}" class="btn btn-success btn-sm px-3">
    <i class="fas fa-file-excel me-1"></i>Excel ダウンロード
  </a>
</div>

<!-- フィルタカード -->
<div class="card shadow-sm mb-3">
  <div class="card-body py-2">
    <form method="GET" action="/receipts" class="row g-2 align-items-end">
      <div class="col-auto">
        <label class="form-label form-label-sm mb-1">入荷日 From</label>
        <input type="date" name="from" value="${esc(from)}" class="form-control form-control-sm">
      </div>
      <div class="col-auto">
        <label class="form-label form-label-sm mb-1">To</label>
        <input type="date" name="to" value="${esc(to)}" class="form-control form-control-sm">
      </div>
      <div class="col-auto">
        <label class="form-label form-label-sm mb-1">仕入先</label>
        <select name="supplier_id" class="form-select form-select-sm" style="min-width:160px">
          <option value="">― すべて ―</option>
          ${supplierOptions}
        </select>
      </div>
      <div class="col-auto d-flex gap-2">
        <button type="submit" class="btn btn-primary btn-sm"><i class="fas fa-search me-1"></i>絞り込み</button>
        <a href="/receipts" class="btn btn-outline-secondary btn-sm">リセット</a>
      </div>
    </form>
  </div>
</div>

<!-- サマリーバッジ -->
<div class="d-flex gap-3 mb-2 flex-wrap">
  <span class="badge bg-secondary fs-6 fw-normal px-3 py-2">
    <i class="fas fa-list me-1"></i>件数: <strong>${res.results.length}</strong> 件
  </span>
  <span class="badge bg-info text-dark fs-6 fw-normal px-3 py-2">
    <i class="fas fa-boxes me-1"></i>合計入荷数: <strong>${totalQty}</strong> 個
  </span>
  <span class="badge bg-success fs-6 fw-normal px-3 py-2">
    <i class="fas fa-yen-sign me-1"></i>合計金額: <strong>${yen(totalAmount)}</strong>
  </span>
</div>

<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0 small">
      <thead class="table-dark">
        <tr>
          <th>入荷日</th><th>納品書日付</th><th>発注番号</th><th>仕入先</th>
          <th>顧客名</th><th class="text-center">品目数</th>
          <th class="text-end">入荷数</th><th class="text-end">金額</th>
          <th>検品者</th><th>備考</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="10" class="text-center text-muted py-4">納品履歴がありません。</td></tr>'}</tbody>
    </table>
  </div>
</div>`
  return layout('納品履歴', content)
})

// ============================================================
// 納品登録フォーム  ★ /receipts より後・/receipts/:id の前に定義
// ============================================================
app.get('/receipts/new/:order_id', async (c) => {
  const db = c.env.DB
  const orderId = parseInt(c.req.param('order_id'))
  if (isNaN(orderId)) return layout('エラー', '<div class="alert alert-danger">不正なIDです。</div>')

  const order = await db.prepare(`
    SELECT po.*, s.name AS supplier_name FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=?
  `).bind(orderId).first<Record<string,unknown>>()
  if (!order) return layout('エラー', '<div class="alert alert-danger">発注データが見つかりません。</div>')

  const items = await db.prepare(`
    SELECT poi.*,
      COALESCE((SELECT SUM(ri.received_quantity) FROM receipt_items ri WHERE ri.purchase_order_item_id=poi.id),0) AS received_qty
    FROM purchase_order_items poi WHERE poi.purchase_order_id=? ORDER BY poi.id
  `).bind(orderId).all<Record<string,unknown>>()

  const itemRows = items.results.map(item => {
    const remaining = Number(item['quantity']||0) - Number(item['received_qty']||0)
    return `<tr>
      <td>${esc(item['item_category'])} / ${esc(item['manufacturer'])} / <strong>${esc(item['product_name'])}</strong>${item['spec'] ? ' / '+esc(item['spec']) : ''}</td>
      <td class="text-center">${item['quantity']}</td>
      <td class="text-center text-success">${item['received_qty']}</td>
      <td class="text-center ${remaining<=0?'text-muted':'text-danger fw-bold'}">${remaining}</td>
      <td><input class="form-control form-control-sm text-center" type="number" min="0" max="${remaining}" name="rq_${item['id']}" value="${remaining<=0?0:remaining}"></td>
      <td><input class="form-control form-control-sm" name="rn_${item['id']}" placeholder="備考"></td>
    </tr>`
  }).join('')

  const itemIds = items.results.map(i => i['id'])

  const scripts = `<script>
document.getElementById('receipt-form').addEventListener('submit', async function(e){
  e.preventDefault();
  var form = e.target;
  var itemIds = ${JSON.stringify(itemIds)};
  var receiptItems = itemIds.map(function(id){
    return {
      purchase_order_item_id: id,
      received_quantity: parseInt(form.querySelector('[name="rq_'+id+'"]')?.value||'0'),
      note: form.querySelector('[name="rn_'+id+'"]')?.value||''
    };
  }).filter(function(i){ return i.received_quantity > 0; });
  var payload = {
    order_id: ${orderId},
    received_date: form.querySelector('[name="received_date"]').value,
    slip_date: form.querySelector('[name="slip_date"]').value,
    inspected_by: form.querySelector('[name="inspected_by"]').value,
    note: form.querySelector('[name="note"]').value,
    items: receiptItems
  };
  var btn = form.querySelector('button[type=submit]');
  btn.disabled=true;
  btn.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>保存中...';
  try {
    var resp = await fetch('/api/receipts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    var result = await resp.json();
    if(!resp.ok){ showFlash(result.error||'登録に失敗しました','danger'); btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>納品登録を保存'; return; }
    // 保存完了 → 即リダイレクト（キャッシュバスト付き）
    window.location.replace('/orders/${orderId}?_r=' + Date.now());
  } catch(err){
    showFlash('通信エラー: '+err.message,'danger');
    btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>納品登録を保存';
  }
});
</script>`

  const content = `
<div class="mb-3">
  <h1 class="h3 mb-1"><i class="fas fa-truck me-2 text-primary"></i>納品登録</h1>
  <p class="text-muted mb-0">${esc(order['order_no'])} / ${esc(order['supplier_name'])}</p>
</div>
<form id="receipt-form">
  <div class="card shadow-sm mb-3">
    <div class="card-header bg-white"><strong><i class="fas fa-info-circle me-1"></i>納品ヘッダ</strong></div>
    <div class="card-body row g-3">
      <div class="col-md-3"><label class="form-label">入荷日</label><input class="form-control" type="date" name="received_date" value="${todayStr()}"></div>
      <div class="col-md-3"><label class="form-label">納品書記載日</label><input class="form-control" type="date" name="slip_date"></div>
      <div class="col-md-3"><label class="form-label">検品者</label><input class="form-control" name="inspected_by" placeholder="古川"></div>
      <div class="col-12"><label class="form-label">備考</label><textarea class="form-control" name="note" rows="2"></textarea></div>
    </div>
  </div>
  <div class="card shadow-sm">
    <div class="card-header bg-white"><strong><i class="fas fa-table me-1"></i>入荷明細</strong></div>
    <div class="table-responsive">
      <table class="table align-middle mb-0">
        <thead class="table-light"><tr>
          <th>商品</th><th class="text-center">発注数</th><th class="text-center">入荷済</th>
          <th class="text-center">残数</th><th class="text-center" style="min-width:100px">今回入荷数</th><th>行備考</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
    <div class="sticky-actions text-end">
      <a href="/orders/${orderId}" class="btn btn-outline-secondary me-2"><i class="fas fa-arrow-left me-1"></i>キャンセル</a>
      <button type="submit" class="btn btn-primary btn-lg"><i class="fas fa-save me-1"></i>納品登録を保存</button>
    </div>
  </div>
</form>`
  return layout('納品登録', content, scripts)
})

// ============================================================
// 残注一覧
// ============================================================
app.get('/backorders', async (c) => {
  const db = c.env.DB
  const res = await db.prepare(`
    SELECT po.order_no, po.order_date, po.customer_name, po.usage_type,
           po.requested_delivery_date, po.id AS purchase_order_id,
           s.name AS supplier_name,
           poi.id AS poi_id, poi.item_category, poi.manufacturer, poi.product_name,
           poi.spec, poi.color, poi.club_type, poi.quantity,
           COALESCE(SUM(ri.received_quantity),0) AS received_qty,
           (poi.quantity - COALESCE(SUM(ri.received_quantity),0)) AS backorder_qty,
           MAX(r.received_date) AS last_received_date
    FROM purchase_order_items poi
    JOIN purchase_orders po ON poi.purchase_order_id=po.id
    JOIN suppliers s ON po.supplier_id=s.id
    LEFT JOIN receipt_items ri ON ri.purchase_order_item_id=poi.id
    LEFT JOIN receipts r ON ri.receipt_id=r.id
    GROUP BY poi.id
    HAVING COALESCE(SUM(ri.received_quantity),0) < poi.quantity
    ORDER BY po.order_date DESC, po.order_no DESC
  `).all<Record<string,unknown>>()

  const rows = res.results.map(r => `<tr>
    <td>${esc(r['order_date'])}</td>
    <td><a href="/orders/${r['purchase_order_id']}">${esc(r['order_no'])}</a></td>
    <td>${esc(r['supplier_name'])}</td>
    <td>${esc(r['customer_name'])}</td>
    <td>${esc(r['usage_type'])}</td>
    <td>${esc(r['item_category'])}</td>
    <td>${esc(r['manufacturer'])}</td>
    <td><strong>${esc(r['product_name'])}</strong></td>
    <td>${esc(r['spec'])} ${esc(r['color'])} ${esc(r['club_type'])}</td>
    <td class="text-center">${r['quantity']}</td>
    <td class="text-center text-success">${r['received_qty']}</td>
    <td class="text-center text-danger fw-bold">${r['backorder_qty']}</td>
    <td>${esc(r['last_received_date'])}</td>
    <td>${esc(r['requested_delivery_date'])}</td>
  </tr>`).join('')

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <div><h1 class="h3 mb-1"><i class="fas fa-exclamation-triangle me-2 text-warning"></i>残注一覧</h1>
  <p class="text-muted mb-0">未入荷・一部入荷の明細を一覧表示します。</p></div>
  <a class="btn btn-outline-primary" href="/orders"><i class="fas fa-list me-1"></i>発注一覧へ</a>
</div>
<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead class="table-light"><tr>
        <th>発注日</th><th>発注番号</th><th>仕入先</th><th>顧客名</th><th>用途</th>
        <th>品目</th><th>メーカー</th><th>商品名</th><th>仕様</th>
        <th class="text-center">発注</th><th class="text-center">入荷済</th><th class="text-center">残数</th>
        <th>最終入荷日</th><th>希望納期</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="14" class="text-center py-4 text-muted"><i class="fas fa-check-circle text-success me-2"></i>残注はありません。</td></tr>'}</tbody>
    </table>
  </div>
  <div class="card-footer text-muted small">${res.results.length}件の残注明細</div>
</div>`
  return layout('残注一覧', content)
})

// ============================================================
// バックアップ管理ページ
// ============================================================
app.get('/admin/backup', async (c) => {
  const db = c.env.DB

  // 各テーブルの件数を取得
  const [p, s, po, poi, sr, r, ri] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS c FROM products WHERE is_active=1').first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM suppliers WHERE is_active=1').first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM purchase_orders').first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM purchase_order_items').first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM supplier_rules').first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM receipts').first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM receipt_items').first<{c:number}>(),
  ])

  const tables = [
    { key: 'products',             label: '商品マスタ',     icon: 'fa-box',               count: p?.c ?? 0,   color: 'primary' },
    { key: 'suppliers',            label: '仕入先マスタ',   icon: 'fa-building',          count: s?.c ?? 0,   color: 'success' },
    { key: 'purchase_orders',      label: '発注ヘッダー',   icon: 'fa-file-alt',          count: po?.c ?? 0,  color: 'info' },
    { key: 'purchase_order_items', label: '発注明細',       icon: 'fa-list',              count: poi?.c ?? 0, color: 'info' },
    { key: 'supplier_rules',       label: '判定ルール',     icon: 'fa-cog',               count: sr?.c ?? 0,  color: 'warning' },
    { key: 'receipts',             label: '納品ヘッダー',   icon: 'fa-truck',             count: r?.c ?? 0,   color: 'secondary' },
    { key: 'receipt_items',        label: '納品明細',       icon: 'fa-clipboard-list',    count: ri?.c ?? 0,  color: 'secondary' },
  ]

  const tableRows = tables.map(t => `
    <tr>
      <td><i class="fas ${t.icon} me-2 text-${t.color}"></i>${t.label}</td>
      <td class="text-center"><span class="badge bg-secondary">${t.count.toLocaleString('ja-JP')}件</span></td>
      <td>
        <a href="/api/backup/csv/${t.key}" class="btn btn-xs btn-outline-primary py-0 px-2">
          <i class="fas fa-download me-1"></i>CSV
        </a>
      </td>
    </tr>`).join('')

  const content = `
<div class="d-flex justify-content-between align-items-center mb-4">
  <div>
    <h1 class="h3 mb-1"><i class="fas fa-database me-2 text-primary"></i>バックアップ管理</h1>
    <p class="text-muted mb-0">データのエクスポート・インポートを行います。定期的なバックアップを推奨します。</p>
  </div>
</div>

<div class="row g-4">
  <!-- エクスポート -->
  <div class="col-lg-6">
    <div class="card shadow-sm h-100">
      <div class="card-header bg-primary text-white">
        <h5 class="mb-0"><i class="fas fa-download me-2"></i>エクスポート（バックアップ）</h5>
      </div>
      <div class="card-body">
        <p class="text-muted small mb-3">
          <i class="fas fa-info-circle me-1 text-primary"></i>
          全テーブルを一括でCSV（ZIP）としてダウンロードします。<br>
          個別テーブルのみダウンロードすることもできます。
        </p>
        <a href="/api/backup/all" class="btn btn-primary w-100 mb-3">
          <i class="fas fa-file-archive me-2"></i>全データを一括エクスポート（JSON）
        </a>
        <div class="card border-0 bg-light">
          <div class="card-body p-2">
            <p class="small fw-semibold mb-2 text-muted">テーブル別CSVダウンロード</p>
            <table class="table table-sm mb-0">
              <thead class="table-light"><tr>
                <th>テーブル</th><th class="text-center">件数</th><th>DL</th>
              </tr></thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- インポート（リストア） -->
  <div class="col-lg-6">
    <div class="card shadow-sm h-100">
      <div class="card-header bg-warning text-dark">
        <h5 class="mb-0"><i class="fas fa-upload me-2"></i>インポート（リストア）</h5>
      </div>
      <div class="card-body">
        <div class="alert alert-warning py-2 small mb-3">
          <i class="fas fa-exclamation-triangle me-1"></i>
          <strong>注意:</strong> リストアは既存データを<strong>完全に削除</strong>してから復元します。<br>
          必ずエクスポートでバックアップを取ってから実行してください。
        </div>

        <!-- 全体リストア -->
        <div class="card border-danger mb-3">
          <div class="card-body py-3">
            <p class="fw-semibold mb-2"><i class="fas fa-database me-1 text-danger"></i>全データ一括リストア（JSON）</p>
            <div class="mb-2">
              <input type="file" class="form-control form-control-sm" id="restore-file-all" accept=".json">
            </div>
            <button class="btn btn-danger btn-sm w-100" id="btn-restore-all">
              <i class="fas fa-undo me-1"></i>リストア実行
            </button>
          </div>
        </div>

        <!-- テーブル別リストア -->
        <div class="card border-0 bg-light">
          <div class="card-body py-3">
            <p class="fw-semibold mb-2 small text-muted"><i class="fas fa-table me-1"></i>テーブル別CSVリストア</p>
            <div class="row g-2 mb-2">
              <div class="col-7">
                <select class="form-select form-select-sm" id="restore-table-select">
                  ${tables.map(t => `<option value="${t.key}">${t.label}</option>`).join('')}
                </select>
              </div>
              <div class="col-5">
                <select class="form-select form-select-sm" id="restore-mode-select">
                  <option value="append">追記（既存保持）</option>
                  <option value="replace">置換（全削除後）</option>
                </select>
              </div>
            </div>
            <div class="mb-2">
              <input type="file" class="form-control form-control-sm" id="restore-file-csv" accept=".csv">
            </div>
            <button class="btn btn-warning btn-sm w-100 text-dark" id="btn-restore-csv">
              <i class="fas fa-file-import me-1"></i>CSVリストア実行
            </button>
          </div>
        </div>

        <!-- 結果表示 -->
        <div id="restore-result" class="mt-3" style="display:none"></div>
      </div>
    </div>
  </div>
</div>

<!-- 運用アドバイス -->
<div class="card mt-4 border-0 bg-light">
  <div class="card-body">
    <h6 class="fw-semibold mb-3"><i class="fas fa-lightbulb me-1 text-warning"></i>バックアップ運用のポイント</h6>
    <div class="row g-3">
      <div class="col-md-4">
        <div class="d-flex gap-2">
          <div class="text-primary flex-shrink-0 mt-1"><i class="fas fa-calendar-week"></i></div>
          <div>
            <div class="fw-semibold small">定期バックアップ</div>
            <div class="text-muted small">週1回を目安に「全データ一括エクスポート」を実行し、日付付きで保存してください。</div>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="d-flex gap-2">
          <div class="text-success flex-shrink-0 mt-1"><i class="fas fa-folder"></i></div>
          <div>
            <div class="fw-semibold small">保存場所</div>
            <div class="text-muted small">社内共有フォルダやクラウドストレージ（OneDrive等）に保存し、複数世代を保持してください。</div>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="d-flex gap-2">
          <div class="text-warning flex-shrink-0 mt-1"><i class="fas fa-history"></i></div>
          <div>
            <div class="fw-semibold small">リストアのタイミング</div>
            <div class="text-muted small">誤操作や障害発生時のみ使用します。必ず現在のデータをエクスポートしてから実行してください。</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`

  const scripts = `<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<script>
// ── 全データJSONリストア ──────────────────────────────
document.getElementById('btn-restore-all').addEventListener('click', async function() {
  var file = document.getElementById('restore-file-all').files[0];
  if (!file) { alert('ファイルを選択してください'); return; }
  if (!confirm('全データを削除して復元します。本当によろしいですか？\\n\\nこの操作は取り消せません。')) return;
  var text = await file.text();
  var data;
  try { data = JSON.parse(text); } catch(e) { alert('JSONファイルの解析に失敗しました: ' + e.message); return; }
  this.disabled = true;
  this.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>リストア中…';
  var resp = await fetch('/api/backup/restore/all', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
  var result = await resp.json();
  showRestoreResult(resp.ok, result);
  this.disabled = false;
  this.innerHTML = '<i class="fas fa-undo me-1"></i>リストア実行';
});

// ── テーブル別CSVリストア ─────────────────────────────
document.getElementById('btn-restore-csv').addEventListener('click', async function() {
  var file = document.getElementById('restore-file-csv').files[0];
  var table = document.getElementById('restore-table-select').value;
  var mode  = document.getElementById('restore-mode-select').value;
  if (!file) { alert('ファイルを選択してください'); return; }
  var modeLabel = mode === 'replace' ? '（全削除後に復元）' : '（既存データに追記）';
  if (!confirm(table + ' を' + modeLabel + 'リストアします。よろしいですか？')) return;

  var text = await file.text();
  var wb = XLSX.read(text, {type:'string', codepage:65001});
  var ws = wb.Sheets[wb.SheetNames[0]];
  var rows = XLSX.utils.sheet_to_json(ws, {defval:'', raw:false});

  this.disabled = true;
  this.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>リストア中…';
  var resp = await fetch('/api/backup/restore/csv', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ table: table, mode: mode, rows: rows })
  });
  var result = await resp.json();
  showRestoreResult(resp.ok, result);
  this.disabled = false;
  this.innerHTML = '<i class="fas fa-file-import me-1"></i>CSVリストア実行';
});

function showRestoreResult(ok, result) {
  var el = document.getElementById('restore-result');
  if (ok) {
    el.innerHTML = '<div class="alert alert-success py-2 small"><i class="fas fa-check-circle me-1"></i>'
      + '<strong>リストア完了！</strong> '
      + (result.inserted !== undefined ? '挿入: ' + result.inserted + '件' : '')
      + (result.details ? '<ul class="mt-1 mb-0">' + Object.entries(result.details).map(function(e){ return '<li>' + e[0] + ': ' + e[1] + '件</li>'; }).join('') + '</ul>' : '')
      + '</div>';
  } else {
    el.innerHTML = '<div class="alert alert-danger py-2 small"><i class="fas fa-exclamation-circle me-1"></i>'
      + '<strong>エラー:</strong> ' + (result.error || 'リストアに失敗しました') + '</div>';
  }
  el.style.display = '';
}
</script>`

  return layout('バックアップ管理', content, scripts)
})

export { app as pageRoutes }
