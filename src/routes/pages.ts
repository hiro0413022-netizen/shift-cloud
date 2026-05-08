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
function layout(title: string, content: string, extraScripts = ''): Response {
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
      <div class="navbar-nav gap-1 ms-auto">
        <a class="nav-link" href="/"><i class="fas fa-chart-line me-1"></i>ダッシュボード</a>
        <a class="nav-link" href="/orders/new"><i class="fas fa-plus me-1"></i>新規発注</a>
        <a class="nav-link" href="/orders"><i class="fas fa-list me-1"></i>発注一覧</a>
        <a class="nav-link" href="/backorders"><i class="fas fa-exclamation-triangle me-1"></i>残注一覧</a>
        <a class="nav-link" href="/receipts"><i class="fas fa-truck me-1"></i>納品履歴</a>
        <a class="nav-link" href="/products"><i class="fas fa-box me-1"></i>商品マスタ</a>
        <a class="nav-link" href="/suppliers"><i class="fas fa-building me-1"></i>仕入先</a>
        <a class="nav-link" href="/rules"><i class="fas fa-cog me-1"></i>判定ルール</a>
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
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
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
  const q = (c.req.query('q') || '').replace(/　/g, ' ').trim()

  let sql = `SELECT p.*, s.name AS supplier_name
    FROM products p LEFT JOIN suppliers s ON p.default_supplier_id=s.id
    WHERE p.is_active=1`
  const params: unknown[] = []
  if (q) {
    sql += ' AND (p.name LIKE ? OR p.manufacturer LIKE ? OR p.barcode LIKE ? OR p.item_category LIKE ? OR p.club_type LIKE ?)'
    const like = `%${q}%`
    params.push(like, like, like, like, like)
  }
  sql += ' ORDER BY p.item_category, p.manufacturer, p.name LIMIT 300'

  const stmt = db.prepare(sql)
  const res = params.length ? await stmt.bind(...params).all<Record<string,unknown>>() : await stmt.all<Record<string,unknown>>()

  const rows = res.results.map(r => `<tr>
    <td class="text-muted small">${r['id']}</td>
    <td>${esc(r['item_category'])}</td>
    <td>${esc(r['manufacturer'])}</td>
    <td><strong>${esc(r['name'])}</strong></td>
    <td>${esc(r['spec'])}</td>
    <td>${esc(r['club_type'])}</td>
    <td class="text-end">${yen(r['list_price'])}</td>
    <td class="text-center">${r['default_rate'] ?? ''}</td>
    <td>${esc(r['supplier_name'])}</td>
    <td class="text-muted small">${esc(r['barcode'])}</td>
  </tr>`).join('')

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <div><h1 class="h3 mb-1"><i class="fas fa-box me-2 text-primary"></i>商品マスタ</h1>
  <p class="text-muted mb-0">登録済み商品の確認ができます。</p></div>
</div>
<form class="row g-2 mb-3">
  <div class="col-md-4"><input class="form-control" type="text" name="q" value="${esc(q)}" placeholder="メーカー・商品名・バーコードで検索"></div>
  <div class="col-auto"><button class="btn btn-outline-primary"><i class="fas fa-search me-1"></i>検索</button></div>
  ${q ? '<div class="col-auto"><a href="/products" class="btn btn-outline-secondary">クリア</a></div>' : ''}
</form>
<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0">
      <thead class="table-light"><tr>
        <th>ID</th><th>品目</th><th>メーカー</th><th>商品名</th><th>仕様</th>
        <th>種類</th><th class="text-end">定価</th><th class="text-center">掛率</th>
        <th>標準仕入先</th><th>バーコード</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="10" class="text-center py-4 text-muted">対象データがありません。</td></tr>'}</tbody>
    </table>
  </div>
  <div class="card-footer text-muted small">${res.results.length}件表示</div>
</div>`
  return layout('商品マスタ', content)
})

// ============================================================
// 仕入先マスタ
// ============================================================
app.get('/suppliers', async (c) => {
  const db = c.env.DB
  const res = await db.prepare('SELECT * FROM suppliers WHERE is_active=1 ORDER BY name').all<Record<string,unknown>>()

  const rows = res.results.map(r => `<tr>
    <td><strong>${esc(r['name'])}</strong></td>
    <td>${esc(r['contact_name'])}${esc(r['honorific'])}</td>
    <td>${esc(r['order_method'])}</td>
    <td class="small">${esc(r['email'])}</td>
    <td>${esc(r['phone'])}</td>
    <td>${esc(r['payment_method'])}</td>
    <td class="small">${esc(r['shipping_rule'])}</td>
    <td class="small">${esc(r['notes'])}</td>
  </tr>`).join('')

  const content = `
<div class="mb-3">
  <h1 class="h3 mb-1"><i class="fas fa-building me-2 text-primary"></i>仕入先マスタ</h1>
  <p class="text-muted mb-0">登録済み仕入先の一覧です。</p>
</div>
<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0">
      <thead class="table-light"><tr>
        <th>仕入先名</th><th>担当者</th><th>発注方法</th><th>メール</th>
        <th>電話</th><th>支払い</th><th>送料条件</th><th>備考</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="8" class="text-center py-4 text-muted">仕入先データがありません。</td></tr>'}</tbody>
    </table>
  </div>
</div>`
  return layout('仕入先マスタ', content)
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

  const rows = res.results.map(r => `<tr>
    <td>${r['item_category'] ? esc(r['item_category']) : '<span class="text-muted">全品目</span>'}</td>
    <td>${r['manufacturer'] ? esc(r['manufacturer']) : '<span class="text-muted">全メーカー</span>'}</td>
    <td>${r['club_type'] ? esc(r['club_type']) : '<span class="text-muted">全種類</span>'}</td>
    <td><strong>${esc(r['supplier_name'])}</strong></td>
    <td class="text-center">${r['rate'] ?? ''}</td>
    <td class="text-center">${r['priority']}</td>
    <td class="small">${esc(r['notes'])}</td>
  </tr>`).join('')

  const content = `
<div class="mb-3">
  <h1 class="h3 mb-1"><i class="fas fa-cog me-2 text-primary"></i>仕入先判定ルール</h1>
  <p class="text-muted mb-0">品目・メーカー・種類から発注先を自動判定するルールです。</p>
</div>
<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0">
      <thead class="table-light"><tr>
        <th>品目</th><th>メーカー</th><th>種類</th><th>仕入先</th>
        <th class="text-center">掛率</th><th class="text-center">優先順位</th><th>備考</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="text-center py-4 text-muted">ルールがありません。</td></tr>'}</tbody>
    </table>
  </div>
</div>`
  return layout('判定ルール', content)
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
    WHERE p.is_active=1 ORDER BY p.item_category, p.manufacturer, p.name LIMIT 600
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
</form>
<script src="/static/new-order.js"></script>`
  return layout('新規発注', content)
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
           s.contact_name, s.order_method, s.phone
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

  const itemRows = items.results.map(item => {
    const remaining = Number(item['quantity']||0) - Number(item['received_qty']||0)
    return `<tr>
      <td>${esc(item['item_category'])}</td><td>${esc(item['manufacturer'])}</td>
      <td><strong>${esc(item['product_name'])}</strong></td>
      <td>${esc(item['spec'])} ${esc(item['color'])}</td>
      <td>${esc(item['club_type'])}</td>
      <td class="text-center">${item['quantity']}</td>
      <td class="text-center text-success">${item['received_qty']}</td>
      <td class="text-center ${remaining>0?'text-danger fw-bold':''}">${remaining}</td>
      <td class="text-end">${yen(item['unit_price'])}</td>
      <td class="text-end">${yen(item['amount'])}</td>
      <td class="small">${esc(item['line_note'])}</td>
    </tr>`
  }).join('')

  const receiptRows = receipts.results.length
    ? receipts.results.map(r => `<tr>
        <td>${esc(r['received_date'])}</td><td>${esc(r['slip_date'])}</td>
        <td>${esc(r['inspected_by'])}</td><td>${esc(r['note'])}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="text-center py-3 text-muted">まだ納品登録がありません。</td></tr>'

  const emailBody = String(order['email_body'] ?? '')
  const emailSubject = String(order['email_subject'] ?? '')
  const supplierEmail = String(order['supplier_email'] ?? '')
  const mailtoLink = supplierEmail
    ? `<a class="btn btn-sm btn-outline-secondary mt-2" href="mailto:${esc(supplierEmail)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}"><i class="fas fa-envelope me-1"></i>メールソフトで開く</a>`
    : ''

  const mailSection = emailBody
    ? `<div class="mb-1"><strong>宛先:</strong> <span class="text-muted">${esc(supplierEmail)}</span></div>
       <div class="mb-2"><strong>件名:</strong> ${esc(emailSubject)}</div>
       <pre class="small-pre border rounded p-3 bg-light">${emailBody.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
       ${mailtoLink}`
    : '<span class="text-muted">メール下書きがありません。</span>'

  const scripts = `<script>
document.getElementById('btn-mark-ordered').addEventListener('click', async function(){
  if(!confirm('発注ステータスを「発注済」に更新しますか？')) return;
  this.disabled=true;
  var resp = await fetch('/api/orders/${id}/mark-ordered',{method:'POST'});
  if(resp.ok){ showFlash('ステータスを「発注済」に更新しました。','success'); setTimeout(function(){ location.reload(); },1000); }
  else { showFlash('更新に失敗しました。','danger'); this.disabled=false; }
});
</script>`

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <div><h1 class="h3 mb-1"><i class="fas fa-file-alt me-2 text-primary"></i>発注詳細</h1>
  <p class="text-muted mb-0">${esc(order['order_no'])} / ${esc(order['supplier_name'])}</p></div>
  <div class="d-flex gap-2">
    <a class="btn btn-outline-primary" href="/receipts/new/${id}"><i class="fas fa-truck me-1"></i>納品登録</a>
    <button id="btn-mark-ordered" class="btn btn-primary"><i class="fas fa-check me-1"></i>発注済に更新</button>
    <a class="btn btn-outline-secondary" href="/orders"><i class="fas fa-arrow-left me-1"></i>一覧へ</a>
  </div>
</div>
<div class="row g-3 mb-4">
  <div class="col-md-6">
    <div class="card shadow-sm h-100">
      <div class="card-header bg-white"><strong><i class="fas fa-info-circle me-1"></i>ヘッダ情報</strong></div>
      <div class="card-body">
        <dl class="row mb-0">
          <dt class="col-sm-4">発注日</dt><dd class="col-sm-8">${esc(order['order_date'])}</dd>
          <dt class="col-sm-4">発注者</dt><dd class="col-sm-8">${esc(order['ordered_by'])}</dd>
          <dt class="col-sm-4">顧客名</dt><dd class="col-sm-8">${esc(order['customer_name'])}</dd>
          <dt class="col-sm-4">用途</dt><dd class="col-sm-8">${esc(order['usage_type'])}</dd>
          <dt class="col-sm-4">希望納期</dt><dd class="col-sm-8">${esc(order['requested_delivery_date'])}</dd>
          <dt class="col-sm-4">担当 / TEL</dt><dd class="col-sm-8">${esc(order['contact_name'])} / ${esc(order['phone'])}</dd>
          <dt class="col-sm-4">状態</dt><dd class="col-sm-8">${statusBadge(String(order['status']))}</dd>
          <dt class="col-sm-4">備考</dt><dd class="col-sm-8">${esc(order['order_note'])}</dd>
        </dl>
      </div>
    </div>
  </div>
  <div class="col-md-6">
    <div class="card shadow-sm h-100">
      <div class="card-header bg-white"><strong><i class="fas fa-envelope me-1"></i>メール下書き</strong></div>
      <div class="card-body">${mailSection}</div>
    </div>
  </div>
</div>
<div class="card shadow-sm mb-4">
  <div class="card-header bg-white"><strong><i class="fas fa-table me-1"></i>発注明細</strong></div>
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead class="table-light"><tr>
        <th>品目</th><th>メーカー</th><th>商品名</th><th>仕様・色</th><th>種類</th>
        <th class="text-center">発注数</th><th class="text-center">入荷済</th><th class="text-center">残数</th>
        <th class="text-end">単価</th><th class="text-end">金額</th><th>備考</th>
      </tr></thead>
      <tbody>${itemRows || '<tr><td colspan="11" class="text-center text-muted py-3">明細がありません。</td></tr>'}</tbody>
    </table>
  </div>
</div>
<div class="card shadow-sm">
  <div class="card-header bg-white"><strong><i class="fas fa-history me-1"></i>納品履歴</strong></div>
  <div class="table-responsive">
    <table class="table table-sm mb-0">
      <thead class="table-light"><tr><th>入荷日</th><th>納品書日付</th><th>検品者</th><th>備考</th></tr></thead>
      <tbody>${receiptRows}</tbody>
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
  const res = await db.prepare(`
    SELECT r.*, po.order_no, po.id AS purchase_order_id, s.name AS supplier_name
    FROM receipts r
    JOIN purchase_orders po ON r.purchase_order_id=po.id
    JOIN suppliers s ON po.supplier_id=s.id
    ORDER BY r.id DESC LIMIT 200
  `).all<Record<string,unknown>>()

  const rows = res.results.map(r => `<tr>
    <td>${esc(r['received_date'])}</td><td>${esc(r['slip_date'])}</td>
    <td><a href="/orders/${r['purchase_order_id']}">${esc(r['order_no'])}</a></td>
    <td>${esc(r['supplier_name'])}</td>
    <td>${esc(r['inspected_by'])}</td><td>${esc(r['note'])}</td>
  </tr>`).join('')

  const content = `
<div class="mb-3">
  <h1 class="h3 mb-1"><i class="fas fa-truck me-2 text-primary"></i>納品履歴</h1>
  <p class="text-muted mb-0">登録済みの納品データ一覧です。</p>
</div>
<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead class="table-light"><tr>
        <th>入荷日</th><th>納品書日付</th><th>発注番号</th><th>仕入先</th><th>検品者</th><th>備考</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="text-center text-muted py-4">納品履歴がありません。</td></tr>'}</tbody>
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
    showFlash('納品登録を保存しました（入荷数量合計: '+result.added_quantity+'）','success');
    setTimeout(function(){ window.location.href='/orders/${orderId}'; },1200);
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

export { app as pageRoutes }
