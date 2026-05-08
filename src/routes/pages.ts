import { Hono } from 'hono'
import { html } from 'hono/html'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// ============================================================
// 共通HTMLレイアウト
// ============================================================
function layout(title: string, content: string, extraScripts = ''): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | ゴルフウィング 発注管理</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/style.css" rel="stylesheet">
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
function showFlash(message, type = 'success') {
  const el = document.getElementById('flash-container');
  const div = document.createElement('div');
  div.className = 'alert alert-' + type + ' alert-dismissible fade show';
  div.innerHTML = message + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>';
  el.appendChild(div);
  setTimeout(() => div.remove(), 5000);
}
</script>
${extraScripts}
</body>
</html>`
}

function statusBadge(status: string): string {
  const labels: Record<string, string> = {
    draft: '下書き', draft_created: '下書き作成済', ordered: '発注済',
    partial: '一部入荷', completed: '完納', cancelled: 'キャンセル',
  }
  const colors: Record<string, string> = {
    draft: 'secondary', draft_created: 'info', ordered: 'primary',
    partial: 'warning', completed: 'success', cancelled: 'dark',
  }
  return `<span class="badge text-bg-${colors[status] ?? 'secondary'}">${labels[status] ?? status}</span>`
}

function yen(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  const n = parseFloat(String(v))
  if (isNaN(n)) return String(v)
  return `¥${n.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`
}

// ============================================================
// ダッシュボード
// ============================================================
app.get('/', async (c) => {
  const res = await fetch(new Request(new URL('/api/dashboard', new URL(c.req.url)).toString(), { headers: c.req.raw.headers }))
  const data = await res.json<{ counts: Record<string, number>; recent_orders: Record<string, unknown>[] }>()
  const { counts, recent_orders } = data

  const rows = recent_orders.map((r) => `
    <tr>
      <td><a href="/orders/${r['id']}">${r['order_no']}</a></td>
      <td>${r['order_date']}</td>
      <td>${r['supplier_name']}</td>
      <td>${r['customer_name'] ?? ''}</td>
      <td class="text-center">${r['line_count']}</td>
      <td class="text-center">${r['total_qty']}</td>
      <td class="text-end">${r['total_amount_yen']}</td>
      <td>${statusBadge(r['status'] as string)}</td>
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
  <div class="col-6 col-md-3">
    <div class="card metric-card h-100">
      <div class="card-body text-center">
        <div class="metric-label"><i class="fas fa-box me-1"></i>商品マスタ</div>
        <div class="metric-value">${counts['products']}</div>
      </div>
    </div>
  </div>
  <div class="col-6 col-md-3">
    <div class="card metric-card h-100">
      <div class="card-body text-center">
        <div class="metric-label"><i class="fas fa-building me-1"></i>仕入先</div>
        <div class="metric-value">${counts['suppliers']}</div>
      </div>
    </div>
  </div>
  <div class="col-6 col-md-3">
    <div class="card metric-card h-100">
      <div class="card-body text-center">
        <div class="metric-label"><i class="fas fa-file-alt me-1"></i>発注件数</div>
        <div class="metric-value">${counts['orders']}</div>
      </div>
    </div>
  </div>
  <div class="col-6 col-md-3">
    <div class="card metric-card danger h-100">
      <div class="card-body text-center">
        <div class="metric-label"><i class="fas fa-exclamation-triangle me-1"></i>残注明細</div>
        <div class="metric-value">${counts['backorders']}</div>
      </div>
    </div>
  </div>
</div>
<div class="card shadow-sm">
  <div class="card-header bg-white d-flex justify-content-between align-items-center">
    <strong><i class="fas fa-clock me-1"></i>最近の発注</strong>
    <a href="/orders" class="btn btn-sm btn-outline-secondary">すべて見る</a>
  </div>
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead class="table-light">
        <tr><th>発注番号</th><th>発注日</th><th>仕入先</th><th>顧客名</th><th class="text-center">明細数</th><th class="text-center">数量</th><th class="text-end">金額</th><th>状態</th></tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="8" class="text-center text-muted py-4">まだ発注データがありません。</td></tr>'}
      </tbody>
    </table>
  </div>
</div>`

  return c.html(layout('ダッシュボード', content))
})

// ============================================================
// 商品マスタ
// ============================================================
app.get('/products', async (c) => {
  const q = c.req.query('q') || ''
  const url = new URL('/api/products', new URL(c.req.url))
  if (q) url.searchParams.set('q', q)
  const res = await fetch(new Request(url.toString(), { headers: c.req.raw.headers }))
  const data = await res.json<{ rows: Record<string, unknown>[] }>()

  const rows = data.rows.map((r) => `
    <tr>
      <td class="text-muted small">${r['id']}</td>
      <td>${r['item_category'] ?? ''}</td>
      <td>${r['manufacturer'] ?? ''}</td>
      <td><strong>${r['name']}</strong></td>
      <td>${r['spec'] ?? ''}</td>
      <td>${r['club_type'] ?? ''}</td>
      <td class="text-end">${r['list_price_yen']}</td>
      <td class="text-center">${r['default_rate'] ?? ''}</td>
      <td>${r['supplier_name'] ?? ''}</td>
      <td class="text-muted small">${r['barcode'] ?? ''}</td>
    </tr>`).join('')

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <div>
    <h1 class="h3 mb-1"><i class="fas fa-box me-2 text-primary"></i>商品マスタ</h1>
    <p class="text-muted mb-0">登録済み商品の確認ができます。</p>
  </div>
</div>
<form class="row g-2 mb-3">
  <div class="col-md-4">
    <input class="form-control" type="text" name="q" value="${q}" placeholder="メーカー・商品名・バーコードで検索">
  </div>
  <div class="col-auto"><button class="btn btn-outline-primary"><i class="fas fa-search me-1"></i>検索</button></div>
  ${q ? '<div class="col-auto"><a href="/products" class="btn btn-outline-secondary">クリア</a></div>' : ''}
</form>
<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0">
      <thead class="table-light">
        <tr><th>ID</th><th>品目</th><th>メーカー</th><th>商品名</th><th>仕様</th><th>種類</th><th class="text-end">定価</th><th class="text-center">掛率</th><th>標準仕入先</th><th>バーコード</th></tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="10" class="text-center py-4 text-muted">対象データがありません。</td></tr>'}
      </tbody>
    </table>
  </div>
  <div class="card-footer text-muted small">${data.rows.length}件表示</div>
</div>`

  return c.html(layout('商品マスタ', content))
})

// ============================================================
// 仕入先マスタ
// ============================================================
app.get('/suppliers', async (c) => {
  const res = await fetch(new Request(new URL('/api/suppliers', new URL(c.req.url)).toString(), { headers: c.req.raw.headers }))
  const data = await res.json<{ rows: Record<string, unknown>[] }>()

  const rows = data.rows.map((r) => `
    <tr>
      <td><strong>${r['name']}</strong></td>
      <td>${r['contact_name'] ?? ''}${r['honorific'] ?? ''}</td>
      <td>${r['order_method'] ?? ''}</td>
      <td class="small">${r['email'] ?? ''}</td>
      <td>${r['phone'] ?? ''}</td>
      <td>${r['payment_method'] ?? ''}</td>
      <td class="small">${r['shipping_rule'] ?? ''}</td>
      <td class="small">${r['notes'] ?? ''}</td>
    </tr>`).join('')

  const content = `
<div class="mb-3">
  <h1 class="h3 mb-1"><i class="fas fa-building me-2 text-primary"></i>仕入先マスタ</h1>
  <p class="text-muted mb-0">登録済み仕入先の一覧です。</p>
</div>
<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0">
      <thead class="table-light">
        <tr><th>仕入先名</th><th>担当者</th><th>発注方法</th><th>メール</th><th>電話</th><th>支払い</th><th>送料条件</th><th>備考</th></tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="8" class="text-center py-4 text-muted">仕入先データがありません。</td></tr>'}
      </tbody>
    </table>
  </div>
</div>`

  return c.html(layout('仕入先マスタ', content))
})

// ============================================================
// 判定ルール
// ============================================================
app.get('/rules', async (c) => {
  const res = await fetch(new Request(new URL('/api/rules', new URL(c.req.url)).toString(), { headers: c.req.raw.headers }))
  const data = await res.json<{ rows: Record<string, unknown>[] }>()

  const rows = data.rows.map((r) => `
    <tr>
      <td>${r['item_category'] ?? '<span class="text-muted">全品目</span>'}</td>
      <td>${r['manufacturer'] ?? '<span class="text-muted">全メーカー</span>'}</td>
      <td>${r['club_type'] ?? '<span class="text-muted">全種類</span>'}</td>
      <td><strong>${r['supplier_name']}</strong></td>
      <td class="text-center">${r['rate'] ?? ''}</td>
      <td class="text-center">${r['priority']}</td>
      <td class="small">${r['notes'] ?? ''}</td>
    </tr>`).join('')

  const content = `
<div class="mb-3">
  <h1 class="h3 mb-1"><i class="fas fa-cog me-2 text-primary"></i>仕入先判定ルール</h1>
  <p class="text-muted mb-0">品目・メーカー・種類から発注先を自動判定するルールです。</p>
</div>
<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0">
      <thead class="table-light">
        <tr><th>品目</th><th>メーカー</th><th>種類</th><th>仕入先</th><th class="text-center">掛率</th><th class="text-center">優先順位</th><th>備考</th></tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="7" class="text-center py-4 text-muted">ルールがありません。</td></tr>'}
      </tbody>
    </table>
  </div>
</div>`

  return c.html(layout('判定ルール', content))
})

// ============================================================
// 発注一覧
// ============================================================
app.get('/orders', async (c) => {
  const status = c.req.query('status') || ''
  const supplier = c.req.query('supplier') || ''
  const q = c.req.query('q') || ''

  const apiUrl = new URL('/api/orders', new URL(c.req.url))
  if (status) apiUrl.searchParams.set('status', status)
  if (supplier) apiUrl.searchParams.set('supplier', supplier)
  if (q) apiUrl.searchParams.set('q', q)

  const res = await fetch(new Request(apiUrl.toString(), { headers: c.req.raw.headers }))
  const data = await res.json<{ rows: Record<string, unknown>[] }>()

  const statusOptions = ['draft_created', 'ordered', 'partial', 'completed', 'cancelled']
  const statusLabels: Record<string, string> = {
    draft_created: '下書き作成済', ordered: '発注済', partial: '一部入荷',
    completed: '完納', cancelled: 'キャンセル',
  }

  const rows = data.rows.map((r) => `
    <tr>
      <td><a href="/orders/${r['id']}">${r['order_no']}</a></td>
      <td>${r['order_date']}</td>
      <td>${r['supplier_name']}</td>
      <td>${r['customer_name'] ?? ''}</td>
      <td>${r['usage_type'] ?? ''}</td>
      <td class="text-center">${r['line_count']}</td>
      <td class="text-center">${r['total_qty']}</td>
      <td class="text-end">${r['total_amount_yen']}</td>
      <td>${statusBadge(r['status'] as string)}</td>
    </tr>`).join('')

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <div>
    <h1 class="h3 mb-1"><i class="fas fa-list me-2 text-primary"></i>発注一覧</h1>
    <p class="text-muted mb-0">発注履歴とステータスを一覧で確認できます。</p>
  </div>
  <a class="btn btn-primary" href="/orders/new"><i class="fas fa-plus me-1"></i>新規発注</a>
</div>
<form class="row g-2 mb-3">
  <div class="col-md-2">
    <select name="status" class="form-select">
      <option value="">全ステータス</option>
      ${statusOptions.map((s) => `<option value="${s}" ${status === s ? 'selected' : ''}>${statusLabels[s]}</option>`).join('')}
    </select>
  </div>
  <div class="col-md-2">
    <input class="form-control" name="supplier" value="${supplier}" placeholder="仕入先">
  </div>
  <div class="col-md-3">
    <input class="form-control" name="q" value="${q}" placeholder="発注番号・顧客名・発注者">
  </div>
  <div class="col-auto"><button class="btn btn-outline-primary"><i class="fas fa-search me-1"></i>検索</button></div>
  ${(status || supplier || q) ? '<div class="col-auto"><a href="/orders" class="btn btn-outline-secondary">クリア</a></div>' : ''}
</form>
<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead class="table-light">
        <tr><th>発注番号</th><th>発注日</th><th>仕入先</th><th>顧客名</th><th>用途</th><th class="text-center">明細</th><th class="text-center">数量</th><th class="text-end">金額</th><th>状態</th></tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="9" class="text-center text-muted py-4">対象データがありません。</td></tr>'}
      </tbody>
    </table>
  </div>
  <div class="card-footer text-muted small">${data.rows.length}件</div>
</div>`

  return c.html(layout('発注一覧', content))
})

// ============================================================
// 新規発注フォーム
// ============================================================
app.get('/orders/new', async (c) => {
  const res = await fetch(new Request(new URL('/api/products-for-order', new URL(c.req.url)).toString(), { headers: c.req.raw.headers }))
  const data = await res.json<{ products: Record<string, unknown>[] }>()

  const productOptions = data.products
    .map((p) => `<option value="${p['id']}" data-item-category="${p['item_category'] ?? ''}" data-manufacturer="${p['manufacturer'] ?? ''}" data-name="${p['name'] ?? ''}" data-spec="${p['spec'] ?? ''}" data-club-type="${p['club_type'] ?? ''}" data-list-price="${p['list_price'] ?? ''}" data-rate="${p['default_rate'] ?? ''}">${p['item_category']} / ${p['manufacturer']} / ${p['name']}</option>`)
    .join('')

  const todayStr = new Date().toISOString().slice(0, 10)

  const scripts = `<script>
const PRODUCTS = ${JSON.stringify(data.products)};
let rowIndex = 0;

function addRow() {
  const tbody = document.querySelector('#line-table tbody');
  const idx = rowIndex++;
  const productOptions = PRODUCTS.map(p =>
    '<option value="' + p.id + '" data-item-category="' + (p.item_category||'') + '" data-manufacturer="' + (p.manufacturer||'') + '" data-name="' + (p.name||'') + '" data-spec="' + (p.spec||'') + '" data-club-type="' + (p.club_type||'') + '" data-list-price="' + (p.list_price||'') + '" data-rate="' + (p.default_rate||'') + '">' + (p.item_category||'') + ' / ' + (p.manufacturer||'') + ' / ' + (p.name||'') + '</option>'
  ).join('');
  const tr = document.createElement('tr');
  tr.innerHTML = '<td>' +
    '<input type="hidden" name="row_index" value="' + idx + '">' +
    '<select class="form-select form-select-sm product-select" name="product_id_' + idx + '" style="min-width:200px">' +
    '<option value="">手入力</option>' + productOptions + '</select></td>' +
    '<td><input class="form-control form-control-sm" name="item_category_' + idx + '" style="min-width:80px"></td>' +
    '<td><input class="form-control form-control-sm" name="manufacturer_' + idx + '" style="min-width:100px"></td>' +
    '<td><input class="form-control form-control-sm" name="product_name_' + idx + '" style="min-width:160px"></td>' +
    '<td><input class="form-control form-control-sm" name="spec_' + idx + '" style="min-width:70px"></td>' +
    '<td><input class="form-control form-control-sm" name="color_' + idx + '" style="min-width:60px"></td>' +
    '<td><input class="form-control form-control-sm" name="club_type_' + idx + '" style="min-width:70px"></td>' +
    '<td><input class="form-control form-control-sm text-center" type="number" min="1" name="quantity_' + idx + '" value="1" style="min-width:60px"></td>' +
    '<td><input class="form-control form-control-sm text-end" type="number" step="1" min="0" name="list_price_' + idx + '" style="min-width:80px"></td>' +
    '<td><input class="form-control form-control-sm text-end" type="number" step="0.001" min="0" name="rate_' + idx + '" style="min-width:70px"></td>' +
    '<td><input class="form-control form-control-sm text-end" type="number" step="1" min="0" name="unit_price_' + idx + '" style="min-width:80px"></td>' +
    '<td><input class="form-control form-control-sm" name="line_note_' + idx + '" style="min-width:100px"></td>' +
    '<td><button type="button" class="btn btn-sm btn-outline-danger remove-row"><i class="fas fa-trash"></i></button></td>';
  tbody.appendChild(tr);

  tr.querySelector('.product-select').addEventListener('change', function(e) {
    const opt = e.target.selectedOptions[0];
    if (!opt || !opt.value) return;
    const fieldMap = {
      'item_category_' + idx: opt.dataset.itemCategory || '',
      'manufacturer_' + idx: opt.dataset.manufacturer || '',
      'product_name_' + idx: opt.dataset.name || '',
      'spec_' + idx: opt.dataset.spec || '',
      'club_type_' + idx: opt.dataset.clubType || '',
      'list_price_' + idx: opt.dataset.listPrice || '',
      'rate_' + idx: opt.dataset.rate || ''
    };
    Object.entries(fieldMap).forEach(([name, value]) => {
      const input = tr.querySelector('[name="' + name + '"]');
      if (input && !input.value) input.value = value;
    });
  });
  tr.querySelector('.remove-row').addEventListener('click', function() {
    tr.remove();
  });
}

document.getElementById('add-row').addEventListener('click', addRow);

document.getElementById('order-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const form = e.target;
  const indexes = [...form.querySelectorAll('input[name="row_index"]')].map(el => el.value);

  const lines = indexes.map(idx => ({
    product_id: form.querySelector('[name="product_id_' + idx + '"]')?.value || null,
    item_category: form.querySelector('[name="item_category_' + idx + '"]')?.value || '',
    manufacturer: form.querySelector('[name="manufacturer_' + idx + '"]')?.value || '',
    product_name: form.querySelector('[name="product_name_' + idx + '"]')?.value || '',
    spec: form.querySelector('[name="spec_' + idx + '"]')?.value || '',
    color: form.querySelector('[name="color_' + idx + '"]')?.value || '',
    club_type: form.querySelector('[name="club_type_' + idx + '"]')?.value || '',
    quantity: parseInt(form.querySelector('[name="quantity_' + idx + '"]')?.value || '0'),
    list_price: parseFloat(form.querySelector('[name="list_price_' + idx + '"]')?.value) || null,
    rate: parseFloat(form.querySelector('[name="rate_' + idx + '"]')?.value) || null,
    unit_price: parseFloat(form.querySelector('[name="unit_price_' + idx + '"]')?.value) || null,
    line_note: form.querySelector('[name="line_note_' + idx + '"]')?.value || '',
  })).filter(l => l.product_name || l.item_category).filter(l => l.quantity > 0);

  if (!lines.length) {
    showFlash('発注明細を1件以上入力してください。', 'danger');
    return;
  }

  const payload = {
    ordered_by: form.querySelector('[name="ordered_by"]')?.value || '',
    order_date: form.querySelector('[name="order_date"]')?.value || '',
    customer_name: form.querySelector('[name="customer_name"]')?.value || '',
    usage_type: form.querySelector('[name="usage_type"]')?.value || '',
    requested_delivery_date: form.querySelector('[name="requested_delivery_date"]')?.value || '',
    order_note: form.querySelector('[name="order_note"]')?.value || '',
    lines,
  };

  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>処理中...';

  try {
    const resp = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    if (!resp.ok) {
      showFlash(result.error || '発注作成に失敗しました', 'danger');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>発注データとメール下書きを作成';
      return;
    }
    window.location.href = '/mail-batch/' + result.batch_code;
  } catch(err) {
    showFlash('通信エラーが発生しました: ' + err.message, 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>発注データとメール下書きを作成';
  }
});

addRow(); addRow();
</script>`

  const content = `
<div class="mb-3">
  <h1 class="h3 mb-1"><i class="fas fa-plus-circle me-2 text-primary"></i>新規発注</h1>
  <p class="text-muted mb-0">商品を入力すると、仕入先判定ルールに基づいて発注先別のメール下書きをまとめて作成します。</p>
</div>
<form id="order-form">
  <div class="card shadow-sm mb-3">
    <div class="card-header bg-white"><strong><i class="fas fa-info-circle me-1"></i>発注ヘッダ</strong></div>
    <div class="card-body row g-3">
      <div class="col-md-2">
        <label class="form-label">発注日</label>
        <input class="form-control" type="date" name="order_date" value="${todayStr}">
      </div>
      <div class="col-md-2">
        <label class="form-label">発注者 <span class="text-danger">*</span></label>
        <input class="form-control" name="ordered_by" placeholder="古川" required>
      </div>
      <div class="col-md-2">
        <label class="form-label">顧客名</label>
        <input class="form-control" name="customer_name" placeholder="上田様">
      </div>
      <div class="col-md-2">
        <label class="form-label">用途</label>
        <input class="form-control" name="usage_type" placeholder="取り寄せ / 在庫用">
      </div>
      <div class="col-md-2">
        <label class="form-label">希望納期</label>
        <input class="form-control" type="date" name="requested_delivery_date">
      </div>
      <div class="col-md-12">
        <label class="form-label">発注備考</label>
        <textarea class="form-control" name="order_note" rows="2" placeholder="メール本文へ差し込む全体備考"></textarea>
      </div>
    </div>
  </div>
  <div class="card shadow-sm">
    <div class="card-header bg-white d-flex justify-content-between align-items-center">
      <strong><i class="fas fa-table me-1"></i>発注明細</strong>
      <button type="button" class="btn btn-sm btn-outline-primary" id="add-row">
        <i class="fas fa-plus me-1"></i>行を追加
      </button>
    </div>
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-0" id="line-table">
        <thead class="table-light">
          <tr>
            <th style="min-width:200px">商品候補</th>
            <th>品目</th><th>メーカー</th><th style="min-width:180px">商品名</th>
            <th>仕様</th><th>色</th><th>種類</th><th>数量</th>
            <th>定価</th><th>掛率</th><th>単価</th><th>備考</th><th></th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="sticky-actions text-end">
      <button type="submit" class="btn btn-primary btn-lg">
        <i class="fas fa-paper-plane me-1"></i>発注データとメール下書きを作成
      </button>
    </div>
  </div>
</form>`

  return c.html(layout('新規発注', content, scripts))
})

// ============================================================
// 発注詳細
// ============================================================
app.get('/orders/:id', async (c) => {
  const id = c.req.param('id')
  const res = await fetch(new Request(new URL(`/api/orders/${id}`, new URL(c.req.url)).toString(), { headers: c.req.raw.headers }))
  if (!res.ok) return c.html(layout('エラー', '<div class="alert alert-danger">発注データが見つかりません。</div>'), 404)
  const data = await res.json<{
    order: Record<string, unknown>
    items: Record<string, unknown>[]
    receipts: Record<string, unknown>[]
  }>()
  const { order, items, receipts } = data

  const itemRows = items.map((item) => {
    const remaining = (item['quantity'] as number) - ((item['received_qty'] as number) || 0)
    return `<tr>
      <td>${item['item_category'] ?? ''}</td>
      <td>${item['manufacturer'] ?? ''}</td>
      <td><strong>${item['product_name']}</strong></td>
      <td>${item['spec'] ?? ''} ${item['color'] ?? ''}</td>
      <td>${item['club_type'] ?? ''}</td>
      <td class="text-center">${item['quantity']}</td>
      <td class="text-center text-success">${item['received_qty']}</td>
      <td class="text-center ${remaining > 0 ? 'text-danger fw-bold' : ''}">${remaining}</td>
      <td class="text-end">${item['unit_price_yen']}</td>
      <td class="text-end">${item['amount_yen']}</td>
      <td class="small">${item['line_note'] ?? ''}</td>
    </tr>`
  }).join('')

  const receiptRows = receipts.length
    ? receipts.map((r) => `<tr>
        <td>${r['received_date']}</td>
        <td>${r['slip_date'] ?? ''}</td>
        <td>${r['inspected_by'] ?? ''}</td>
        <td>${r['note'] ?? ''}</td>
      </tr>`).join('')
    : '<tr><td colspan="4" class="text-center py-3 text-muted">まだ納品登録がありません。</td></tr>'

  const mailSection = order['email_body']
    ? `<div class="mb-2"><strong>宛先:</strong> <span class="text-muted">${order['email'] ?? ''}</span></div>
       <div class="mb-2"><strong>件名:</strong> ${order['email_subject'] ?? ''}</div>
       <pre class="small-pre border rounded p-3 bg-light">${String(order['email_body'] ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
       ${order['email'] ? `<a class="btn btn-sm btn-outline-secondary" href="mailto:${order['email']}?subject=${encodeURIComponent(String(order['email_subject'] ?? ''))}&body=${encodeURIComponent(String(order['email_body'] ?? ''))}"><i class="fas fa-envelope me-1"></i>メールソフトで開く</a>` : ''}`
    : '<span class="text-muted">メール下書きがありません。</span>'

  const scripts = `<script>
document.getElementById('btn-mark-ordered')?.addEventListener('click', async function() {
  if (!confirm('発注ステータスを「発注済」に更新しますか？')) return;
  this.disabled = true;
  const resp = await fetch('/api/orders/${id}/mark-ordered', { method: 'POST' });
  if (resp.ok) {
    showFlash('発注ステータスを「発注済」に更新しました。', 'success');
    setTimeout(() => location.reload(), 1000);
  } else {
    showFlash('更新に失敗しました。', 'danger');
    this.disabled = false;
  }
});
</script>`

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <div>
    <h1 class="h3 mb-1"><i class="fas fa-file-alt me-2 text-primary"></i>発注詳細</h1>
    <p class="text-muted mb-0">${order['order_no']} / ${order['supplier_name']}</p>
  </div>
  <div class="d-flex gap-2">
    <a class="btn btn-outline-primary" href="/receipts/new/${id}">
      <i class="fas fa-truck me-1"></i>納品登録
    </a>
    <button id="btn-mark-ordered" class="btn btn-primary">
      <i class="fas fa-check me-1"></i>発注済に更新
    </button>
    <a class="btn btn-outline-secondary" href="/orders">
      <i class="fas fa-arrow-left me-1"></i>一覧へ戻る
    </a>
  </div>
</div>
<div class="row g-3 mb-4">
  <div class="col-md-6">
    <div class="card shadow-sm h-100">
      <div class="card-header bg-white"><strong><i class="fas fa-info-circle me-1"></i>ヘッダ情報</strong></div>
      <div class="card-body">
        <dl class="row mb-0">
          <dt class="col-sm-4">発注日</dt><dd class="col-sm-8">${order['order_date']}</dd>
          <dt class="col-sm-4">発注者</dt><dd class="col-sm-8">${order['ordered_by'] ?? ''}</dd>
          <dt class="col-sm-4">顧客名</dt><dd class="col-sm-8">${order['customer_name'] ?? ''}</dd>
          <dt class="col-sm-4">用途</dt><dd class="col-sm-8">${order['usage_type'] ?? ''}</dd>
          <dt class="col-sm-4">希望納期</dt><dd class="col-sm-8">${order['requested_delivery_date'] ?? ''}</dd>
          <dt class="col-sm-4">連絡先</dt><dd class="col-sm-8">${order['contact_name'] ?? ''} / ${order['phone'] ?? ''}</dd>
          <dt class="col-sm-4">状態</dt><dd class="col-sm-8">${statusBadge(order['status'] as string)}</dd>
          <dt class="col-sm-4">備考</dt><dd class="col-sm-8">${order['order_note'] ?? ''}</dd>
        </dl>
      </div>
    </div>
  </div>
  <div class="col-md-6">
    <div class="card shadow-sm h-100">
      <div class="card-header bg-white"><strong><i class="fas fa-envelope me-1"></i>メール下書き</strong></div>
      <div class="card-body">
        ${mailSection}
      </div>
    </div>
  </div>
</div>
<div class="card shadow-sm mb-4">
  <div class="card-header bg-white"><strong><i class="fas fa-table me-1"></i>発注明細</strong></div>
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead class="table-light">
        <tr><th>品目</th><th>メーカー</th><th>商品名</th><th>仕様・色</th><th>種類</th>
            <th class="text-center">発注数</th><th class="text-center">入荷済</th><th class="text-center">残数</th>
            <th class="text-end">単価</th><th class="text-end">金額</th><th>備考</th></tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>
</div>
<div class="card shadow-sm">
  <div class="card-header bg-white"><strong><i class="fas fa-history me-1"></i>納品履歴</strong></div>
  <div class="table-responsive">
    <table class="table table-sm mb-0">
      <thead class="table-light">
        <tr><th>入荷日</th><th>納品書日付</th><th>検品者</th><th>備考</th></tr>
      </thead>
      <tbody>${receiptRows}</tbody>
    </table>
  </div>
</div>`

  return c.html(layout(`発注詳細 ${order['order_no']}`, content, scripts))
})

// ============================================================
// メールバッチ
// ============================================================
app.get('/mail-batch/:batch_code', async (c) => {
  const batchCode = c.req.param('batch_code')
  const res = await fetch(new Request(new URL(`/api/mail-batch/${batchCode}`, new URL(c.req.url)).toString(), { headers: c.req.raw.headers }))
  const data = await res.json<{ batch_code: string; orders: Array<{ order: Record<string, unknown>; items: Record<string, unknown>[] }> }>()

  const cards = data.orders.map(({ order, items }) => {
    const itemRows = items.map((item) => `
      <tr>
        <td>${item['item_category'] ?? ''}</td>
        <td>${item['manufacturer'] ?? ''}</td>
        <td>${item['product_name']}</td>
        <td>${item['spec'] ?? ''}</td>
        <td>${item['club_type'] ?? ''}</td>
        <td class="text-center">${item['quantity']}</td>
        <td class="text-end">${item['unit_price_yen']}</td>
        <td class="text-end">${item['amount_yen']}</td>
      </tr>`).join('')

    const mailtoHref = order['email']
      ? `href="mailto:${order['email']}?subject=${encodeURIComponent(String(order['email_subject'] ?? ''))}&body=${encodeURIComponent(String(order['email_body'] ?? ''))}"`
      : ''

    return `
    <div class="card shadow-sm mb-4">
      <div class="card-header bg-white d-flex justify-content-between align-items-center">
        <div>
          <strong><i class="fas fa-building me-1"></i>${order['supplier_name']}</strong>
          <span class="text-muted ms-2">${order['order_no']}</span>
        </div>
        <div class="small text-muted">発注方法: ${order['order_method'] ?? '未設定'}</div>
      </div>
      <div class="card-body">
        <div class="row g-3 mb-3">
          <div class="col-md-5">
            <label class="form-label fw-bold">宛先</label>
            <input class="form-control" readonly value="${order['email'] ?? ''}">
          </div>
          <div class="col-md-7">
            <label class="form-label fw-bold">件名</label>
            <input class="form-control" readonly value="${order['email_subject'] ?? ''}">
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label fw-bold">本文</label>
          <textarea class="form-control font-monospace" rows="12" readonly>${String(order['email_body'] ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        </div>
        <div class="table-responsive mb-3">
          <table class="table table-sm mb-0">
            <thead class="table-light">
              <tr><th>品目</th><th>メーカー</th><th>商品名</th><th>仕様</th><th>種類</th><th class="text-center">数量</th><th class="text-end">単価</th><th class="text-end">金額</th></tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <a class="btn btn-primary" href="/orders/${order['id']}">
            <i class="fas fa-file-alt me-1"></i>発注詳細を見る
          </a>
          ${order['email'] ? `<a class="btn btn-outline-secondary" ${mailtoHref}><i class="fas fa-envelope me-1"></i>メールソフトで開く</a>` : ''}
          <button class="btn btn-outline-success" onclick="copyToClipboard(this, '${String(order['email_body'] ?? '').replace(/'/g, "\\'")}')">
            <i class="fas fa-copy me-1"></i>本文をコピー
          </button>
        </div>
      </div>
    </div>`
  }).join('')

  const scripts = `<script>
function copyToClipboard(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-check me-1"></i>コピーしました';
    btn.classList.replace('btn-outline-success', 'btn-success');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.replace('btn-success', 'btn-outline-success'); }, 2000);
  });
}
</script>`

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <div>
    <h1 class="h3 mb-1"><i class="fas fa-envelope-open-text me-2 text-primary"></i>メール下書き一覧</h1>
    <p class="text-muted mb-0">仕入先ごとに作成した発注メールの件名・本文です。Outlookへ転記して利用できます。</p>
  </div>
  <a class="btn btn-outline-secondary" href="/orders"><i class="fas fa-list me-1"></i>発注一覧へ</a>
</div>
${data.orders.length ? cards : '<div class="alert alert-warning">該当するメール下書きがありません。</div>'}`

  return c.html(layout('メール下書き', content, scripts))
})

// ============================================================
// 納品履歴
// ============================================================
app.get('/receipts', async (c) => {
  const res = await fetch(new Request(new URL('/api/receipts', new URL(c.req.url)).toString(), { headers: c.req.raw.headers }))
  const data = await res.json<{ rows: Record<string, unknown>[] }>()

  const rows = data.rows.map((r) => `
    <tr>
      <td>${r['received_date']}</td>
      <td>${r['slip_date'] ?? ''}</td>
      <td><a href="/orders/${r['purchase_order_id']}">${r['order_no']}</a></td>
      <td>${r['supplier_name']}</td>
      <td>${r['inspected_by'] ?? ''}</td>
      <td>${r['note'] ?? ''}</td>
    </tr>`).join('')

  const content = `
<div class="mb-3">
  <h1 class="h3 mb-1"><i class="fas fa-truck me-2 text-primary"></i>納品履歴</h1>
  <p class="text-muted mb-0">登録済みの納品データ一覧です。</p>
</div>
<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead class="table-light">
        <tr><th>入荷日</th><th>納品書日付</th><th>発注番号</th><th>仕入先</th><th>検品者</th><th>備考</th></tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="6" class="text-center text-muted py-4">納品履歴がありません。</td></tr>'}
      </tbody>
    </table>
  </div>
</div>`

  return c.html(layout('納品履歴', content))
})

// ============================================================
// 納品登録フォーム
// ============================================================
app.get('/receipts/new/:order_id', async (c) => {
  const orderId = c.req.param('order_id')
  const res = await fetch(new Request(new URL(`/api/orders/${orderId}`, new URL(c.req.url)).toString(), { headers: c.req.raw.headers }))
  if (!res.ok) return c.html(layout('エラー', '<div class="alert alert-danger">発注データが見つかりません。</div>'), 404)
  const data = await res.json<{
    order: Record<string, unknown>
    items: Record<string, unknown>[]
  }>()
  const { order, items } = data
  const todayStr = new Date().toISOString().slice(0, 10)

  const itemRows = items.map((item) => {
    const remaining = (item['quantity'] as number) - ((item['received_qty'] as number) || 0)
    return `<tr>
      <td>${item['item_category'] ?? ''} / ${item['manufacturer'] ?? ''} / <strong>${item['product_name']}</strong>${item['spec'] ? ' / ' + item['spec'] : ''}</td>
      <td class="text-center">${item['quantity']}</td>
      <td class="text-center text-success">${item['received_qty']}</td>
      <td class="text-center ${remaining <= 0 ? 'text-muted' : 'text-danger fw-bold'}">${remaining}</td>
      <td><input class="form-control form-control-sm text-center" type="number" min="0" max="${remaining}" name="received_qty_${item['id']}" value="${remaining <= 0 ? '0' : remaining}" data-item-id="${item['id']}"></td>
      <td><input class="form-control form-control-sm" name="note_${item['id']}" placeholder="備考"></td>
    </tr>`
  }).join('')

  const scripts = `<script>
document.getElementById('receipt-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const form = e.target;

  const receiptItems = ${JSON.stringify(items.map((i) => i['id']))}.map(itemId => ({
    purchase_order_item_id: itemId,
    received_quantity: parseInt(form.querySelector('[name="received_qty_' + itemId + '"]')?.value || '0'),
    note: form.querySelector('[name="note_' + itemId + '"]')?.value || '',
  })).filter(i => i.received_quantity > 0);

  const payload = {
    order_id: ${orderId},
    received_date: form.querySelector('[name="received_date"]')?.value || '',
    slip_date: form.querySelector('[name="slip_date"]')?.value || '',
    inspected_by: form.querySelector('[name="inspected_by"]')?.value || '',
    note: form.querySelector('[name="note"]')?.value || '',
    items: receiptItems,
  };

  const btn = form.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>保存中...';

  try {
    const resp = await fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await resp.json();
    if (!resp.ok) {
      showFlash(result.error || '登録に失敗しました', 'danger');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save me-1"></i>納品登録を保存';
      return;
    }
    showFlash('納品登録を保存しました（入荷数量合計: ' + result.added_quantity + '）', 'success');
    setTimeout(() => { window.location.href = '/orders/${orderId}'; }, 1200);
  } catch(err) {
    showFlash('通信エラー: ' + err.message, 'danger');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save me-1"></i>納品登録を保存';
  }
});
</script>`

  const content = `
<div class="mb-3">
  <h1 class="h3 mb-1"><i class="fas fa-truck me-2 text-primary"></i>納品登録</h1>
  <p class="text-muted mb-0">${order['order_no']} / ${order['supplier_name']}</p>
</div>
<form id="receipt-form">
  <div class="card shadow-sm mb-3">
    <div class="card-header bg-white"><strong><i class="fas fa-info-circle me-1"></i>納品ヘッダ</strong></div>
    <div class="card-body row g-3">
      <div class="col-md-3">
        <label class="form-label">入荷日</label>
        <input class="form-control" type="date" name="received_date" value="${todayStr}">
      </div>
      <div class="col-md-3">
        <label class="form-label">納品書記載日</label>
        <input class="form-control" type="date" name="slip_date">
      </div>
      <div class="col-md-3">
        <label class="form-label">検品者</label>
        <input class="form-control" name="inspected_by" placeholder="古川">
      </div>
      <div class="col-md-12">
        <label class="form-label">備考</label>
        <textarea class="form-control" name="note" rows="2"></textarea>
      </div>
    </div>
  </div>
  <div class="card shadow-sm">
    <div class="card-header bg-white"><strong><i class="fas fa-table me-1"></i>入荷明細</strong></div>
    <div class="table-responsive">
      <table class="table align-middle mb-0">
        <thead class="table-light">
          <tr><th>商品</th><th class="text-center">発注数</th><th class="text-center">入荷済</th><th class="text-center">残数</th><th class="text-center" style="min-width:100px">今回入荷数</th><th>行備考</th></tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
    <div class="sticky-actions text-end">
      <a href="/orders/${orderId}" class="btn btn-outline-secondary me-2">
        <i class="fas fa-arrow-left me-1"></i>キャンセル
      </a>
      <button type="submit" class="btn btn-primary btn-lg">
        <i class="fas fa-save me-1"></i>納品登録を保存
      </button>
    </div>
  </div>
</form>`

  return c.html(layout('納品登録', content, scripts))
})

// ============================================================
// 残注一覧
// ============================================================
app.get('/backorders', async (c) => {
  const res = await fetch(new Request(new URL('/api/backorders', new URL(c.req.url)).toString(), { headers: c.req.raw.headers }))
  const data = await res.json<{ rows: Record<string, unknown>[] }>()

  const rows = data.rows.map((r) => `
    <tr>
      <td>${r['order_date']}</td>
      <td><a href="/orders/${r['purchase_order_id']}">${r['order_no']}</a></td>
      <td>${r['supplier_name']}</td>
      <td>${r['customer_name'] ?? ''}</td>
      <td>${r['usage_type'] ?? ''}</td>
      <td>${r['item_category'] ?? ''}</td>
      <td>${r['manufacturer'] ?? ''}</td>
      <td><strong>${r['product_name']}</strong></td>
      <td>${r['spec'] ?? ''} ${r['color'] ?? ''} ${r['club_type'] ?? ''}</td>
      <td class="text-center">${r['quantity']}</td>
      <td class="text-center text-success">${r['received_qty']}</td>
      <td class="text-center text-danger fw-bold">${r['backorder_qty']}</td>
      <td>${r['last_received_date'] ?? ''}</td>
      <td>${r['requested_delivery_date'] ?? ''}</td>
    </tr>`).join('')

  const content = `
<div class="d-flex justify-content-between align-items-center mb-3">
  <div>
    <h1 class="h3 mb-1"><i class="fas fa-exclamation-triangle me-2 text-warning"></i>残注一覧</h1>
    <p class="text-muted mb-0">未入荷・一部入荷の明細を一覧表示します。</p>
  </div>
  <a class="btn btn-outline-primary" href="/orders"><i class="fas fa-list me-1"></i>発注一覧へ</a>
</div>
<div class="card shadow-sm">
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead class="table-light">
        <tr>
          <th>発注日</th><th>発注番号</th><th>仕入先</th><th>顧客名</th><th>用途</th>
          <th>品目</th><th>メーカー</th><th>商品名</th><th>仕様</th>
          <th class="text-center">発注</th><th class="text-center">入荷済</th><th class="text-center">残数</th>
          <th>最終入荷日</th><th>希望納期</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="14" class="text-center py-4 text-muted"><i class="fas fa-check-circle text-success me-2"></i>残注はありません。</td></tr>'}
      </tbody>
    </table>
  </div>
  <div class="card-footer text-muted small">${data.rows.length}件の残注明細</div>
</div>`

  return c.html(layout('残注一覧', content))
})

export { app as pageRoutes }
