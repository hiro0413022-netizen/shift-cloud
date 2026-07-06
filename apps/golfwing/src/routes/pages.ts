import { Hono } from 'hono'
import type { SessionUser } from '../auth'

type Bindings = {
  DB: D1Database
  APP_NAME?: string
  APP_SENDER_NAME?: string
  APP_SENDER_SHOP?: string
  APP_SENDER_ADDR?: string
  APP_SENDER_TEL?: string
  APP_SENDER_MAIL?: string
  APP_DEFAULT_CC?: string
  DEMO_MODE?: string
}
type Variables = { sessionUser: SessionUser }
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

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
    pool: 'プール中',
  }
  return m[v] ?? v
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    draft: 'secondary', draft_created: 'info', ordered: 'primary',
    partial: 'warning', completed: 'success', cancelled: 'dark',
    pool: 'warning',
  }
  return `<span class="badge text-bg-${colors[status] ?? 'secondary'}">${statusLabel(status)}</span>`
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ============================================================
// セッション・レイアウトヘルパー（各ルートで使い回す）
// ============================================================
type LayoutCtx = { env: Bindings; get: (k: 'sessionUser') => SessionUser | undefined }

function getSession(c: LayoutCtx): SessionUser {
  return c.get('sessionUser') ?? {
    username: 'unknown', tenantId: 1,
    displayName: '', isDemo: false, isAdmin: false
  }
}

function getLayoutOpts(c: LayoutCtx): {
  appName: string
  isDemo: boolean
  username: string
  tenantId: number
} {
  const su = getSession(c)
  // デモテナント(0) または 強制DEMOモード
  const isDemo = su.isDemo || c.env.DEMO_MODE === '1'
  return {
    appName:  c.env.APP_NAME || '発注管理システム',
    isDemo,
    username: su.displayName || su.username,
    tenantId: su.tenantId,
  }
}

// ============================================================
// 共通レイアウト
// ============================================================
function layout(
  title: string,
  content: string,
  extraScripts = '',
  username = '',
  opts: { appName?: string; isDemo?: boolean } = {}
): Response {
  const appName = opts.appName || '発注管理システム'
  const isDemo  = opts.isDemo  ?? false

  const demoBanner = isDemo ? `
<div id="demo-banner" style="
  background: linear-gradient(90deg,#7c3aed,#4f46e5);
  color:#fff;padding:8px 16px;font-size:0.8rem;font-weight:600;
  display:flex;align-items:center;justify-content:space-between;
  gap:8px;position:sticky;top:0;z-index:2000;
">
  <span><i class="fas fa-flask me-2"></i>デモモード — データは定期的にリセットされます。書き込み操作は無効です。</span>
  <a href="https://golfwing-order.pages.dev" target="_blank"
     style="color:#fff;background:rgba(255,255,255,.2);padding:3px 10px;border-radius:6px;font-size:0.75rem;white-space:nowrap">
    <i class="fas fa-shopping-cart me-1"></i>導入のお問い合わせ
  </a>
</div>` : ''

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | ${appName}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="/static/style.css" rel="stylesheet">
  <link rel="icon" href="/favicon.ico" type="image/x-icon">
</head>
<body${isDemo ? ' class="is-demo"' : ''}>
${demoBanner}
<nav class="navbar navbar-expand-lg sticky-top">
  <div class="container-fluid px-3">
    <a class="navbar-brand" href="/">
      <span class="brand-icon"><i class="fas fa-golf-ball"></i></span>
      ${appName}
    </a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="navMenu">
      <div class="navbar-nav gap-1 ms-auto align-items-lg-center">
        <a class="nav-link" href="/dashboard"><i class="fas fa-home me-1"></i>今日やること</a>
        <div class="nav-divider d-none d-lg-block"></div>
        <a class="nav-link" href="/orders/new"><i class="fas fa-plus me-1"></i>新規発注</a>
        <a class="nav-link" href="/purchase-pool"><i class="fas fa-layer-group me-1"></i>発注プール</a>
        <a class="nav-link" href="/orders"><i class="fas fa-list me-1"></i>発注一覧</a>
        <a class="nav-link" href="/backorders"><i class="fas fa-exclamation-triangle me-1"></i>残注一覧</a>
        <a class="nav-link" href="/receipts"><i class="fas fa-truck me-1"></i>納品履歴</a>
        <div class="nav-divider d-none d-lg-block"></div>
        <a class="nav-link" href="/products"><i class="fas fa-box me-1"></i>商品マスタ</a>
        <a class="nav-link" href="/suppliers"><i class="fas fa-building me-1"></i>仕入先</a>
        <a class="nav-link" href="/rules"><i class="fas fa-cog me-1"></i>判定ルール</a>
        <div class="nav-divider d-none d-lg-block"></div>
        <div class="nav-item dropdown">
          <a class="nav-link dropdown-toggle d-flex align-items-center gap-1"
             href="#" data-bs-toggle="dropdown">
            <i class="fas fa-user-circle"></i>
            <span>${username || 'admin'}</span>
          </a>
          <ul class="dropdown-menu dropdown-menu-end">
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
<div id="flash-container"></div>
<div class="page-container">
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
// ダッシュボード（今日やること中心のUI）
// ============================================================
app.get('/dashboard', async (c) => {
  const db = c.env.DB
  const opts = getLayoutOpts(c)
  const { tenantId } = opts
  const today = todayStr()

  // ── 並列クエリ ────────────────────────────────────────
  const [statusCounts, overdueRows, pendingRows, activeRows, draftRows] = await Promise.all([

    // ① 状態別カウント
    db.prepare(`
      SELECT status, COUNT(*) AS c FROM purchase_orders
      WHERE tenant_id=? AND status NOT IN ('cancelled')
      GROUP BY status
    `).bind(tenantId).all<{status:string; c:number}>(),

    // ② 対応が必要：発注済で7日以上経過かつ未入荷
    db.prepare(`
      SELECT po.id, po.order_date, po.customer_name, po.status,
             s.name AS supplier_name, s.order_method,
             GROUP_CONCAT(poi.product_name, ' / ') AS products,
             COUNT(poi.id) AS item_count,
             CAST(julianday('now') - julianday(po.order_date) AS INTEGER) AS days_elapsed
      FROM purchase_orders po
      JOIN suppliers s ON s.id=po.supplier_id
      JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
      WHERE po.tenant_id=? AND po.status='ordered'
        AND julianday('now') - julianday(po.order_date) >= 7
      GROUP BY po.id, s.id
      ORDER BY days_elapsed DESC
      LIMIT 20
    `).bind(tenantId).all<Record<string,unknown>>(),

    // ③ 検品待ち：入荷済（partial/received）で未処理の明細
    db.prepare(`
      SELECT po.id AS order_id, po.order_date, po.status,
             po.customer_name,
             s.name AS supplier_name,
             poi.id AS poi_id,
             poi.item_category, poi.manufacturer, poi.product_name, poi.spec, poi.color,
             poi.quantity,
             COALESCE((SELECT SUM(ri.received_quantity) FROM receipt_items ri
                       WHERE ri.purchase_order_item_id=poi.id),0) AS received_qty
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id=poi.purchase_order_id
      JOIN suppliers s ON s.id=po.supplier_id
      LEFT JOIN receipt_items ri2 ON ri2.purchase_order_item_id=poi.id
      WHERE po.tenant_id=?
        AND po.status IN ('partial','received')
        AND ri2.id IS NOT NULL
      GROUP BY poi.id, po.id, s.id
      ORDER BY po.order_date ASC, po.id ASC
      LIMIT 100
    `).bind(tenantId).all<Record<string,unknown>>(),

    // ④ お客様対応中：発注済・一部入荷で顧客名あり
    db.prepare(`
      SELECT po.id, po.order_date, po.status,
             po.customer_name,
             s.name AS supplier_name, s.order_method,
             COUNT(poi.id) AS item_count,
             COALESCE(SUM(poi.quantity),0) AS total_qty,
             COALESCE(SUM(COALESCE(
               (SELECT SUM(ri.received_quantity) FROM receipt_items ri
                WHERE ri.purchase_order_item_id=poi.id),0
             )),0) AS received_qty,
             CAST(julianday('now') - julianday(po.order_date) AS INTEGER) AS days_elapsed
      FROM purchase_orders po
      JOIN suppliers s ON s.id=po.supplier_id
      JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
      WHERE po.tenant_id=?
        AND po.status IN ('ordered','partial')
        AND po.customer_name IS NOT NULL
        AND po.customer_name NOT LIKE '（%）'
        AND po.customer_name != ''
      GROUP BY po.id, s.id
      ORDER BY po.order_date ASC
      LIMIT 30
    `).bind(tenantId).all<Record<string,unknown>>(),

    // ⑤ 下書き：まだ発注していない
    db.prepare(`
      SELECT po.id, po.order_date, po.customer_name,
             s.name AS supplier_name,
             COUNT(poi.id) AS item_count
      FROM purchase_orders po
      JOIN suppliers s ON s.id=po.supplier_id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
      WHERE po.tenant_id=? AND po.status IN ('draft','draft_created')
      GROUP BY po.id, s.id
      ORDER BY po.id DESC
      LIMIT 10
    `).bind(tenantId).all<Record<string,unknown>>(),
  ])

  // 状態別カウントをマップに
  const sc: Record<string, number> = {}
  for (const r of statusCounts.results) sc[r.status] = r.c
  const orderedCount  = sc['ordered']  ?? 0
  const partialCount  = sc['partial']  ?? 0
  const draftCount    = (sc['draft'] ?? 0) + (sc['draft_created'] ?? 0)
  const completedCount = sc['completed'] ?? 0
  const activeCount   = orderedCount + partialCount

  // 遅延アラート
  const overdueCount = overdueRows.results.length
  const overdueAlerts = overdueRows.results.map(r => {
    const days = Number(r['days_elapsed'])
    const urgColor = days >= 14 ? '#dc2626' : '#d97706'
    const urgLabel = days >= 14 ? '至急確認' : '要確認'
    return `
    <div class="dash-alert-item" data-order-id="${r['id']}">
      <div class="dash-alert-left">
        <span class="dash-alert-days" style="color:${urgColor}">${days}日経過</span>
        <span class="dash-alert-urgency" style="background:${urgColor}20;color:${urgColor}">${urgLabel}</span>
      </div>
      <div class="dash-alert-center">
        <div class="dash-alert-customer">${esc(r['customer_name'] || '（仕入・在庫）')}</div>
        <div class="dash-alert-products">${esc(String(r['products'] ?? '').split(' / ').slice(0,2).join(' / '))}</div>
        <div class="dash-alert-supplier"><i class="fas fa-building me-1 opacity-50"></i>${esc(r['supplier_name'])}<span class="ms-2 badge bg-secondary" style="font-size:0.65rem">${esc(r['order_method'])}</span></div>
      </div>
      <div class="dash-alert-right">
        <a href="/orders/${r['id']}" class="btn btn-sm btn-outline-danger">詳細 <i class="fas fa-arrow-right ms-1"></i></a>
      </div>
    </div>`
  }).join('')

  // 検品待ち：発注IDでグループ化
  type InspectGroup = { orderId:number; orderDate:string; status:string; customerName:string; supplierName:string; items: Record<string,unknown>[] }
  const inspectMap = new Map<number, InspectGroup>()
  for (const item of pendingRows.results) {
    const oid = Number(item['order_id'])
    if (!inspectMap.has(oid)) {
      inspectMap.set(oid, {
        orderId: oid,
        orderDate: String(item['order_date'] ?? ''),
        status: String(item['status'] ?? ''),
        customerName: String(item['customer_name'] ?? ''),
        supplierName: String(item['supplier_name'] ?? ''),
        items: []
      })
    }
    inspectMap.get(oid)!.items.push(item)
  }
  const inspectCount = pendingRows.results.length
  const inspectBlocks = Array.from(inspectMap.values()).map(grp => {
    const itemCards = grp.items.map(item => `
      <div class="inspect-item-card" data-poi-id="${item['poi_id']}">
        <div class="inspect-item-info">
          <span class="inspect-item-cat">${esc(item['item_category'])}</span>
          <span class="inspect-item-name">${esc(item['manufacturer'] ? item['manufacturer']+' ' : '')}${esc(item['product_name'])}</span>
          ${item['spec'] ? `<span class="inspect-item-spec">${esc(item['spec'])}</span>` : ''}
          ${item['color'] ? `<span class="inspect-item-spec">${esc(item['color'])}</span>` : ''}
        </div>
        <div class="inspect-item-qty">
          <span class="qty-received">${item['received_qty']}</span>
          <span class="qty-sep">/</span>
          <span class="qty-total">${item['quantity']}</span>
          <span class="qty-unit">本</span>
        </div>
        <button class="btn-inspect-done btn-dash-inspect"
          data-poi-id="${item['poi_id']}" data-order-id="${grp.orderId}">
          <i class="fas fa-check me-1"></i>検品済
        </button>
      </div>`).join('')
    return `
    <div class="inspect-order-block" data-order-id="${grp.orderId}" id="inspect-block-${grp.orderId}">
      <div class="inspect-order-header">
        <span class="inspect-order-customer"><i class="fas fa-user me-1 opacity-50"></i>${esc(grp.customerName || '仕入・在庫')}</span>
        <span class="inspect-order-supplier text-muted">${esc(grp.supplierName)}</span>
        <span class="ms-auto badge ${grp.status === 'partial' ? 'text-bg-warning' : 'text-bg-success'}" id="remain-badge-${grp.orderId}">${grp.items.length}点</span>
        <a href="/orders/${grp.orderId}" class="inspect-order-link">詳細</a>
      </div>
      <div class="inspect-items-wrap" id="inspect-items-${grp.orderId}">${itemCards}</div>
    </div>`
  }).join('')

  // お客様対応中カード
  const activeCards = activeRows.results.map(r => {
    const days = Number(r['days_elapsed'])
    const totalQty = Number(r['total_qty'])
    const recvQty  = Number(r['received_qty'])
    const pct = totalQty > 0 ? Math.round(recvQty / totalQty * 100) : 0
    const isPartial = String(r['status']) === 'partial'
    const statusColor = isPartial ? '#d97706' : '#3b82f6'
    const progressBar = isPartial ? `
      <div class="progress-wrap">
        <div class="progress" style="height:4px;border-radius:2px;background:#e5e7eb">
          <div class="progress-bar" style="width:${pct}%;background:#d97706"></div>
        </div>
        <span class="progress-label">${recvQty}/${totalQty} 入荷済</span>
      </div>` : ''
    return `
    <a href="/orders/${r['id']}" class="active-order-card">
      <div class="active-order-top">
        <span class="active-order-customer">${esc(r['customer_name'])}</span>
        <span class="active-order-badge" style="background:${statusColor}20;color:${statusColor}">${statusLabel(String(r['status']))}</span>
      </div>
      <div class="active-order-supplier"><i class="fas fa-building me-1 opacity-40"></i>${esc(r['supplier_name'])}</div>
      ${progressBar}
      <div class="active-order-meta">
        <span><i class="fas fa-calendar me-1 opacity-40"></i>${esc(r['order_date'])}</span>
        <span class="ms-auto" style="color:${days >= 10 ? '#d97706' : 'var(--gw-muted)'}">${days}日前</span>
      </div>
    </a>`
  }).join('')

  // 下書きリスト
  const draftItems = draftRows.results.map(r => `
    <a href="/orders/${r['id']}" class="draft-item">
      <i class="fas fa-file-alt me-2 opacity-40"></i>
      <span class="draft-customer">${esc(r['customer_name'] || '（顧客未設定）')}</span>
      <span class="draft-supplier text-muted ms-2">${esc(r['supplier_name'])}</span>
      <span class="ms-auto draft-date text-muted">${esc(r['order_date'])}</span>
    </a>`).join('')

  // ── CSS ──────────────────────────────────────────────────
  const dashCss = `<style>
/* ── 今日やること ヘッダー ── */
.dash-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:1.25rem; flex-wrap:wrap; gap:.75rem; }
.dash-title { font-size:1.1rem; font-weight:700; color:var(--gw-text); }
.dash-date { font-size:.8rem; color:var(--gw-muted); }

/* ── 状態サマリバー ── */
.status-bar { display:flex; gap:.5rem; flex-wrap:wrap; margin-bottom:1.5rem; }
.status-pill { display:flex; align-items:center; gap:.4rem; padding:.35rem .75rem; border-radius:99px; font-size:.78rem; font-weight:600; border:1px solid transparent; text-decoration:none; transition:opacity .15s; }
.status-pill:hover { opacity:.8; }
.status-pill .pill-count { font-size:1rem; font-weight:700; }

/* ── セクション共通 ── */
.dash-section { margin-bottom:1.5rem; }
.dash-section-header { display:flex; align-items:center; gap:.5rem; margin-bottom:.75rem; }
.dash-section-title { font-size:.875rem; font-weight:700; color:var(--gw-text); }
.dash-section-badge { font-size:.7rem; padding:.2rem .5rem; border-radius:99px; font-weight:700; }
.dash-empty { text-align:center; padding:1.25rem; color:var(--gw-muted); font-size:.83rem; background:var(--gw-surface); border-radius:10px; }

/* ── 対応が必要アラート ── */
.dash-alert-list { display:flex; flex-direction:column; gap:.5rem; }
.dash-alert-item { display:flex; align-items:center; gap:.75rem; padding:.75rem 1rem; background:#fff9f0; border:1px solid #fed7aa; border-radius:10px; }
.dash-alert-left { display:flex; flex-direction:column; align-items:center; gap:.25rem; min-width:60px; }
.dash-alert-days { font-size:1rem; font-weight:800; line-height:1; }
.dash-alert-urgency { font-size:.65rem; font-weight:700; padding:.15rem .4rem; border-radius:4px; }
.dash-alert-center { flex:1; min-width:0; }
.dash-alert-customer { font-weight:700; font-size:.88rem; color:var(--gw-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dash-alert-products { font-size:.78rem; color:var(--gw-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dash-alert-supplier { font-size:.75rem; color:var(--gw-muted); margin-top:.15rem; }
.dash-alert-right { flex-shrink:0; }

/* ── 検品待ち ── */
.inspect-order-block { background:var(--gw-surface); border-radius:10px; border:1px solid var(--gw-border); margin-bottom:.75rem; overflow:hidden; }
.inspect-order-header { display:flex; align-items:center; gap:.5rem; padding:.6rem .875rem; background:#f0fdf4; border-bottom:1px solid var(--gw-border); flex-wrap:wrap; }
.inspect-order-customer { font-weight:700; font-size:.85rem; }
.inspect-order-supplier { font-size:.78rem; }
.inspect-order-link { font-size:.75rem; color:var(--gw-green); text-decoration:none; white-space:nowrap; }
.inspect-items-wrap { padding:.5rem .875rem .75rem; display:flex; flex-direction:column; gap:.5rem; }
.inspect-item-card { display:flex; align-items:center; gap:.625rem; padding:.5rem .625rem; background:#fff; border:1px solid var(--gw-border); border-radius:8px; }
.inspect-item-info { flex:1; min-width:0; }
.inspect-item-cat { display:inline-block; font-size:.65rem; background:#e5e7eb; color:#6b7280; border-radius:4px; padding:.1rem .35rem; margin-right:.25rem; }
.inspect-item-name { font-size:.83rem; font-weight:600; }
.inspect-item-spec { font-size:.75rem; color:var(--gw-muted); margin-left:.25rem; }
.inspect-item-qty { font-size:.83rem; color:var(--gw-muted); white-space:nowrap; flex-shrink:0; }
.qty-received { color:var(--gw-green); font-weight:700; }
.qty-sep { margin:0 .15rem; }
.qty-total, .qty-unit { color:var(--gw-muted); }
.btn-inspect-done { flex-shrink:0; padding:.3rem .7rem; font-size:.75rem; font-weight:600; background:#f0fdf4; color:var(--gw-green); border:1px solid #86efac; border-radius:6px; cursor:pointer; transition:background .15s; white-space:nowrap; }
.btn-inspect-done:hover { background:#dcfce7; }
.btn-inspect-done:disabled { opacity:.5; cursor:default; }

/* ── お客様対応中 ── */
.active-orders-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:.625rem; }
.active-order-card { display:block; padding:.75rem 1rem; background:var(--gw-surface); border:1px solid var(--gw-border); border-radius:10px; text-decoration:none; color:var(--gw-text); transition:box-shadow .15s, transform .1s; }
.active-order-card:hover { box-shadow:0 4px 12px rgba(0,0,0,.08); transform:translateY(-1px); color:var(--gw-text); }
.active-order-top { display:flex; align-items:flex-start; justify-content:space-between; gap:.5rem; margin-bottom:.3rem; }
.active-order-customer { font-weight:700; font-size:.9rem; line-height:1.3; }
.active-order-badge { font-size:.68rem; font-weight:700; padding:.2rem .5rem; border-radius:99px; white-space:nowrap; flex-shrink:0; }
.active-order-supplier { font-size:.75rem; color:var(--gw-muted); margin-bottom:.4rem; }
.progress-wrap { margin:.4rem 0; }
.progress-label { font-size:.7rem; color:var(--gw-muted); display:block; margin-top:.2rem; }
.active-order-meta { display:flex; font-size:.72rem; color:var(--gw-muted); margin-top:.35rem; }

/* ── 下書き ── */
.draft-list { display:flex; flex-direction:column; gap:.375rem; }
.draft-item { display:flex; align-items:center; padding:.55rem .875rem; background:var(--gw-surface); border:1px solid var(--gw-border); border-radius:8px; font-size:.82rem; text-decoration:none; color:var(--gw-text); transition:background .1s; }
.draft-item:hover { background:#f8fafc; color:var(--gw-text); }
.draft-customer { font-weight:600; }
.draft-date { font-size:.75rem; }
</style>`

  // ── JavaScript ───────────────────────────────────────────
  const dashScript = `<script>
(function(){
  // 検品済みボタン
  document.querySelectorAll('.btn-dash-inspect').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var poiId   = btn.dataset.poiId
      var orderId = btn.dataset.orderId
      var card    = btn.closest('.inspect-item-card')
      btn.disabled = true
      btn.innerHTML = '<span class="spinner-border spinner-border-sm" style="width:.8rem;height:.8rem"></span>'
      try {
        var r = await fetch('/api/orders/'+orderId+'/items/'+poiId+'/inspect',{
          method:'PATCH', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({inspected:1})
        })
        var d = await r.json()
        if(r.ok){
          card.style.transition = 'opacity 0.35s'
          card.style.opacity = '0'
          setTimeout(function(){
            card.remove()
            var wrap = document.getElementById('inspect-items-'+orderId)
            var remain = wrap ? wrap.querySelectorAll('.inspect-item-card').length : 0
            var badge = document.getElementById('remain-badge-'+orderId)
            if(badge) badge.textContent = remain+'点'
            if(remain === 0){
              var block = document.getElementById('inspect-block-'+orderId)
              if(block){ block.style.transition='opacity 0.35s'; block.style.opacity='0'; setTimeout(function(){ block.remove(); updateInspectBadge() },350) }
            }
            updateInspectBadge()
            showFlash('検品済みにしました','success')
          }, 350)
        } else {
          btn.disabled = false
          btn.innerHTML = '<i class="fas fa-check me-1"></i>検品済'
          showFlash((d&&d.error)||'更新に失敗しました','danger')
        }
      } catch(e){
        btn.disabled = false
        btn.innerHTML = '<i class="fas fa-check me-1"></i>検品済'
        showFlash('通信エラーが発生しました','danger')
      }
    })
  })

  function updateInspectBadge(){
    var total = document.querySelectorAll('.btn-dash-inspect').length
    var badge = document.getElementById('inspect-section-badge')
    if(badge) badge.textContent = total+'件'
    if(total === 0){
      var sec = document.getElementById('inspect-section-body')
      if(sec) sec.innerHTML = '<div class="dash-empty"><i class="fas fa-check-circle text-success me-2"></i>検品待ちの商品はありません</div>'
    }
  }
})()
</script>`

  // ── 今日の日付（日本語）─────────────────────────────
  const todayJP = (() => {
    const d = new Date()
    const wd = ['日','月','火','水','木','金','土'][d.getDay()]
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${wd}）`
  })()

  const content = dashCss + `
<div class="dash-header">
  <div>
    <div class="dash-title"><i class="fas fa-home me-2" style="color:var(--gw-green)"></i>今日やること</div>
    <div class="dash-date">${todayJP}</div>
  </div>
  <a class="btn btn-primary btn-sm" href="/orders/new"><i class="fas fa-plus me-1"></i>新規発注</a>
</div>

<!-- ── 状態サマリバー ── -->
<div class="status-bar">
  <a href="/orders?status=draft" class="status-pill" style="background:#f1f5f9;color:#64748b;border-color:#e2e8f0">
    <i class="fas fa-file-alt"></i><span class="pill-count">${draftCount}</span>下書き
  </a>
  <a href="/orders?status=ordered" class="status-pill" style="background:#eff6ff;color:#3b82f6;border-color:#bfdbfe">
    <i class="fas fa-paper-plane"></i><span class="pill-count">${orderedCount}</span>発注済
  </a>
  <a href="/orders?status=partial" class="status-pill" style="background:#fffbeb;color:#d97706;border-color:#fde68a">
    <i class="fas fa-box-open"></i><span class="pill-count">${partialCount}</span>一部入荷
  </a>
  <a href="/orders?status=completed" class="status-pill" style="background:#f0fdf4;color:#16a34a;border-color:#bbf7d0">
    <i class="fas fa-check-circle"></i><span class="pill-count">${completedCount}</span>完納
  </a>
</div>

<!-- ── ① 対応が必要 ── -->
<div class="dash-section">
  <div class="dash-section-header">
    <i class="fas fa-exclamation-circle" style="color:#dc2626"></i>
    <span class="dash-section-title">対応が必要</span>
    <span class="dash-section-badge" style="background:${overdueCount>0?'#fef2f2':'#f0fdf4'};color:${overdueCount>0?'#dc2626':'#16a34a'}">${overdueCount}件</span>
    <span style="font-size:.72rem;color:var(--gw-muted);margin-left:auto">発注から7日以上・未入荷</span>
  </div>
  <div class="dash-alert-list">
    ${overdueCount === 0
      ? '<div class="dash-empty"><i class="fas fa-check-circle text-success me-2"></i>対応が必要な案件はありません</div>'
      : overdueAlerts}
  </div>
</div>

<!-- ── ② 検品待ち ── -->
<div class="dash-section">
  <div class="dash-section-header">
    <i class="fas fa-clipboard-check" style="color:${inspectCount>0?'#d97706':'#16a34a'}"></i>
    <span class="dash-section-title">検品待ち</span>
    <span class="dash-section-badge" id="inspect-section-badge" style="background:${inspectCount>0?'#fffbeb':'#f0fdf4'};color:${inspectCount>0?'#d97706':'#16a34a'}">${inspectCount}件</span>
    <span style="font-size:.72rem;color:var(--gw-muted);margin-left:auto">入荷済・未検品</span>
  </div>
  <div id="inspect-section-body">
    ${inspectCount === 0
      ? '<div class="dash-empty"><i class="fas fa-check-circle text-success me-2"></i>検品待ちの商品はありません</div>'
      : inspectBlocks}
  </div>
</div>

<!-- ── ③ お客様対応中 ── -->
<div class="dash-section">
  <div class="dash-section-header">
    <i class="fas fa-user-clock" style="color:#3b82f6"></i>
    <span class="dash-section-title">お客様対応中</span>
    <span class="dash-section-badge" style="background:#eff6ff;color:#3b82f6">${activeRows.results.length}件</span>
    <span style="font-size:.72rem;color:var(--gw-muted);margin-left:auto">発注済・一部入荷（顧客名あり）</span>
  </div>
  ${activeRows.results.length === 0
    ? '<div class="dash-empty">対応中のお客様案件はありません</div>'
    : `<div class="active-orders-grid">${activeCards}</div>`}
</div>

<!-- ── ④ 下書き ── -->
${draftCount > 0 ? `
<div class="dash-section">
  <div class="dash-section-header">
    <i class="fas fa-file-edit" style="color:#64748b"></i>
    <span class="dash-section-title">発注し忘れ確認</span>
    <span class="dash-section-badge" style="background:#f1f5f9;color:#64748b">${draftCount}件</span>
    <span style="font-size:.72rem;color:var(--gw-muted);margin-left:auto">下書き・未発注</span>
  </div>
  <div class="draft-list">${draftItems}</div>
</div>` : ''}

${dashScript}`

  return layout('今日やること', content, '', opts.username, opts)
})

// ============================================================
// 商品マスタ
// ============================================================
app.get('/products', async (c) => {
  const db = c.env.DB
  const q   = (c.req.query('q')   || '').replace(/　/g, ' ').trim()
  const cat = (c.req.query('cat') || '').trim()

  // 廃盤タブ判定
  const tab = c.req.query('tab') === 'discontinued' ? 'discontinued' : 'active'
  const isDiscontinued = tab === 'discontinued'

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

  const { tenantId } = getLayoutOpts(c)

  // WHERE句を共通化（廃盤タブで切り替え）
  let whereSql = isDiscontinued ? 'WHERE p.is_active=0 AND p.tenant_id=?' : 'WHERE p.is_active=1 AND p.tenant_id=?'
  const whereParams: unknown[] = [tenantId]
  if (cat) { whereSql += ' AND p.item_category=?'; whereParams.push(cat) }
  if (q) {
    whereSql += ' AND (p.name LIKE ? OR p.manufacturer LIKE ? OR p.barcode LIKE ? OR p.item_category LIKE ? OR p.club_type LIKE ? OR p.spec LIKE ?)'
    const like = `%${q}%`
    whereParams.push(like, like, like, like, like, like)
  }

  // 総件数取得
  const countSql = `SELECT COUNT(*) AS c FROM products p ${whereSql}`
  const countRes = await db.prepare(countSql).bind(...whereParams).first<{ c: number }>()
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

  // カテゴリ一覧（現在のタブに合わせて取得）・仕入先一覧を並列取得
  const [cats, suppliers] = await Promise.all([
    db.prepare(`SELECT DISTINCT item_category FROM products WHERE is_active=${isDiscontinued ? 0 : 1} AND tenant_id=? ORDER BY item_category`).bind(tenantId).all<{item_category:string}>(),
    db.prepare('SELECT id, name FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name').bind(tenantId).all<Record<string,unknown>>()
  ])
  const supplierOpts = suppliers.results.map(s => `<option value="${s['id']}">${esc(s['name'])}</option>`).join('')
  const catOpts = cats.results.map(c2 => `<option value="${esc(c2.item_category)}">${esc(c2.item_category)}</option>`).join('')
  const catFilter = cats.results.map(c2 => {
    const sp2 = new URLSearchParams()
    sp2.set('cat', c2.item_category)
    if (q) sp2.set('q', q)
    if (sortKey !== 'item_category') sp2.set('sort', sortKey)
    if (sortDir === 'DESC') sp2.set('dir', 'desc')
    if (isDiscontinued) sp2.set('tab', 'discontinued')
    return `<a class="btn btn-sm ${cat===c2.item_category?'btn-primary':'btn-outline-secondary'}" href="/products?${sp2.toString()}">${esc(c2.item_category)}</a>`
  }).join('')

  // club_type バッジ色マップ
  const ctColorMap: Record<string,string> = {
    DR: 'danger', FW: 'success', UT: 'warning text-dark',
    IR: 'secondary', PT: 'dark', 'DR/FW': 'info text-dark'
  }
  // ページネーションリンク生成ヘルパー（tabパラメータ引き継ぎ）
  const pageUrl = (p: number) => {
    const sp = new URLSearchParams()
    if (q)   sp.set('q',   q)
    if (cat) sp.set('cat', cat)
    if (sortKey !== 'item_category') sp.set('sort', sortKey)
    if (sortDir === 'DESC') sp.set('dir', 'desc')
    if (p > 1) sp.set('page', String(p))
    if (isDiscontinued) sp.set('tab', 'discontinued')
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

  // ソートリンク生成（tabパラメータ引き継ぎ）
  const sortLink = (col: string, label: string, extraCls = '') => {
    const active = sortCol === ALLOWED_COLS[col]
    const nd = nextDir(col)
    const sp = new URLSearchParams()
    if (q)   sp.set('q',   q)
    if (cat) sp.set('cat', cat)
    sp.set('sort', col)
    sp.set('dir',  nd)
    if (isDiscontinued) sp.set('tab', 'discontinued')
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
    const actionBtns = isDiscontinued
      ? `<button class="btn btn-xs btn-outline-success btn-restore-product py-0 px-2" data-id="${r['id']}" data-name="${esc(r['name'])}" title="有効に戻す"><i class="fas fa-undo me-1"></i>復活</button>
         <button class="btn btn-xs btn-outline-danger btn-perm-del-product py-0 px-2 ms-1" data-id="${r['id']}" data-name="${esc(r['name'])}" title="完全削除（発注履歴なしのみ）"><i class="fas fa-times"></i></button>`
      : `<button class="btn btn-xs btn-outline-primary btn-edit-product py-0 px-2" data-id="${r['id']}" title="編集"><i class="fas fa-edit"></i></button>
         <button class="btn btn-xs btn-outline-warning btn-disc-product py-0 px-2 ms-1" data-id="${r['id']}" data-name="${esc(r['name'])}" title="廃盤にする"><i class="fas fa-ban"></i></button>`
    return `<tr data-id="${r['id']}" class="${isDiscontinued ? 'table-secondary' : ''}">
    <td class="text-center" style="width:36px">
      <input type="checkbox" class="form-check-input chk-product" value="${r['id']}" style="width:1.1em;height:1.1em;cursor:pointer">
    </td>
    <td class="text-muted small">${r['id']}</td>
    <td><span class="badge bg-secondary">${esc(r['item_category'])}</span></td>
    <td class="fw-semibold">${esc(r['manufacturer'])}</td>
    <td><strong>${esc(r['name'])}</strong></td>
    <td class="text-muted small">${esc(r['spec'])}</td>
    <td>${ctBadge}</td>
    <td class="text-end fw-semibold text-primary">${yen(r['list_price'])}</td>
    <td class="text-center">${r['default_rate'] != null ? (Number(r['default_rate'])*100).toFixed(1)+'%' : ''}</td>
    <td class="small">
      <span class="me-1">${esc(r['supplier_name']) || '<span class="text-muted">&#x2015;</span>'}</span>
      ${!isDiscontinued ? `<button class="btn btn-xs btn-outline-secondary py-0 px-1 btn-manage-suppliers"
        data-product-id="${r['id']}"
        data-product-name="${esc(r['name'])}"
        title="仕入先を追加・管理"
        style="font-size:0.7rem">
        <i class="fas fa-truck me-1"></i>仕入先
      </button>` : ''}
    </td>
    <td class="text-muted small">${esc(r['barcode'])}</td>
    <td style="white-space:nowrap">${actionBtns}</td>
  </tr>`
  }).join('')

  // 複数仕入先管理モーダル用の仕入先Optionsを埋め込む（JS側でそのまま使用）
  const supplierOptsJson = JSON.stringify(suppliers.results.map(s => ({ id: s['id'], name: s['name'] })))

  const scripts = `<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<script>window._PRODUCTS_PAGE_COUNT = '${res.results.length} 件表示（このページ）'; window._PRODUCTS_TAB = '${tab}'; window._SUPPLIERS = ${supplierOptsJson};</script>
<script src="/static/products-page.js"></script>`

  const currentSortLabel = (sortKey === 'manufacturer' ? 'メーカー'
    : sortKey === 'name'         ? '商品名'
    : sortKey === 'list_price'   ? '定価'
    : sortKey === 'club_type'    ? '種類'
    : '品目')
  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-box me-2" style="color:var(--gw-green)"></i>商品マスタ</h1>
    <p class="page-subtitle" id="row-count-label"><strong>${totalCount.toLocaleString()}</strong> 件中 ${res.results.length} 件表示（${currentPage}/${totalPages} ページ）</p>
  </div>
  <div class="actions">
    <div class="btn-group">
      <button class="btn btn-outline-secondary" id="btn-dl-template" title="CSVテンプレートをダウンロード">
        <i class="fas fa-download me-1"></i>テンプレート
      </button>
      <button class="btn btn-outline-secondary" id="btn-template-help" title="バリエーション列の書き方">
        <i class="fas fa-question-circle"></i>
      </button>
    </div>
    <button class="btn btn-outline-primary" id="btn-import">
      <i class="fas fa-file-import me-1"></i>Excel/CSV一括追加
    </button>
    <button class="btn btn-primary" onclick="openAddProduct()">
      <i class="fas fa-plus me-1"></i>商品を追加
    </button>
  </div>
</div>

<!-- バリエーションヘルプモーダル -->
<div class="modal fade" id="varHelpModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title"><i class="fas fa-question-circle me-2 text-primary"></i>バリエーション列の書き方</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <p class="text-muted small">色・バックライン有無が複数ある商品（グリップ等）に使います。</p>
        <h6 class="fw-bold mt-3">■ バックライン有無あり</h6>
        <code class="d-block bg-light p-2 rounded small mb-1">BL無:色1/色2/色3|BL有:色1/色2/色3</code>
        <p class="small text-muted mb-0">例: <code>BL無:ブラック/レッド/ホワイト|BL有:ブラック/レッド/ホワイト</code></p>
        <p class="small text-success">→ BL無・BL有 それぞれ1レコード登録（発注時に色をドロップダウン選択）</p>
        <h6 class="fw-bold mt-3">■ 色のみ複数（BL区別なし）</h6>
        <code class="d-block bg-light p-2 rounded small mb-1">色1/色2/色3/色4</code>
        <p class="small text-muted mb-0">例: <code>ブラック/レッド/ホワイト/ブルー</code></p>
        <p class="small text-success">→ 1レコード登録（発注時に色をドロップダウン選択）</p>
        <hr>
        <p class="small text-muted mb-0">※ バリエーションがない商品はこの列を空欄にしてください。</p>
        <p class="small text-muted mb-0">※ バリエーションがある場合、「色」「品番」列は無視されます。</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">閉じる</button>
        <button type="button" class="btn btn-primary" id="btn-dl-template-from-help">
          <i class="fas fa-download me-1"></i>テンプレートをダウンロード
        </button>
      </div>
    </div>
  </div>
</div>

<!-- 有効 / 廃盤タブ -->
<ul class="nav nav-tabs mb-3">
  <li class="nav-item">
    <a class="nav-link ${!isDiscontinued ? 'active fw-semibold' : ''}" href="/products">
      <i class="fas fa-box me-1"></i>有効商品
    </a>
  </li>
  <li class="nav-item">
    <a class="nav-link ${isDiscontinued ? 'active fw-semibold text-danger' : 'text-muted'}" href="/products?tab=discontinued">
      <i class="fas fa-ban me-1"></i>廃盤商品
    </a>
  </li>
</ul>

<!-- カテゴリフィルタ -->
<div class="d-flex gap-2 flex-wrap mb-2">
  <a class="btn btn-sm ${!cat?'btn-dark':'btn-outline-secondary'}" href="/products${isDiscontinued?'?tab=discontinued':(q?'?q='+encodeURIComponent(q):'')}">すべて</a>
  ${catFilter}
</div>

<!-- 検索バー -->
<div class="row g-2 mb-3">
  <div class="col-md-6">
    <form class="d-flex gap-2" method="GET" action="/products">
      ${cat ? `<input type="hidden" name="cat" value="${esc(cat)}">` : ''}
      ${sortKey !== 'item_category' ? `<input type="hidden" name="sort" value="${esc(sortKey)}">` : ''}
      ${sortDir === 'DESC' ? `<input type="hidden" name="dir" value="desc">` : ''}
      ${isDiscontinued ? `<input type="hidden" name="tab" value="discontinued">` : ''}
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

<!-- 選択時に浮き上がるアクションバー -->
<div id="bulk-action-bar" class="d-none mb-2">
  <div class="alert alert-primary d-flex align-items-center gap-3 py-2 mb-0 shadow-sm">
    <span class="fw-bold"><i class="fas fa-check-square me-1"></i><span id="bulk-count">0</span> 件選択中</span>
    <button class="btn btn-sm btn-warning" id="btn-bulk-edit">
      <i class="fas fa-edit me-1"></i>一括編集
    </button>
    ${!isDiscontinued ? `<button class="btn btn-sm btn-outline-danger" id="btn-bulk-disc">
      <i class="fas fa-ban me-1"></i>一括廃盤
    </button>` : `<button class="btn btn-sm btn-outline-success" id="btn-bulk-restore">
      <i class="fas fa-undo me-1"></i>一括復活
    </button>`}
    <button class="btn btn-sm btn-outline-secondary ms-auto" id="btn-bulk-clear">
      <i class="fas fa-times me-1"></i>選択解除
    </button>
  </div>
</div>

<div class="card">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0" id="product-table">
      <thead>
        <tr>
          <th style="width:36px" class="text-center">
            <input type="checkbox" class="form-check-input" id="chk-all" style="width:1.1em;height:1.1em;cursor:pointer" title="全選択">
          </th>
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
        ${rows || '<tr><td colspan="12" class="text-center py-4 text-muted">対象データがありません。</td></tr>'}
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

<!-- ════ 一括編集モーダル ════ -->
<div class="modal fade" id="bulkEditModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header bg-warning text-dark py-2">
        <h5 class="modal-title mb-0">
          <i class="fas fa-edit me-2"></i>選択商品を一括編集
          <span class="badge bg-dark ms-2" id="bulk-edit-count-badge">0件</span>
        </h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <div class="alert alert-info py-2 small mb-3">
          <i class="fas fa-info-circle me-1"></i>
          <strong>入力した項目のみ</strong>上書きされます。空欄のままにした項目は変更されません。
        </div>
        <div class="row g-3">
          <div class="col-md-6">
            <label class="form-label fw-semibold">品目</label>
            <input class="form-control" id="be-item-category" placeholder="変更しない場合は空欄">
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold">メーカー</label>
            <input class="form-control" id="be-manufacturer" placeholder="変更しない場合は空欄">
          </div>
          <div class="col-md-4">
            <label class="form-label fw-semibold">種類</label>
            <select class="form-select" id="be-club-type">
              <option value="">— 変更しない —</option>
              <option value="DR">DR</option>
              <option value="FW">FW</option>
              <option value="UT">UT</option>
              <option value="IR">IR</option>
              <option value="PT">PT</option>
              <option value="DR/FW">DR/FW</option>
            </select>
          </div>
          <div class="col-md-4">
            <label class="form-label fw-semibold">掛率</label>
            <div class="input-group">
              <input class="form-control" id="be-rate" type="number" step="0.01" min="0" max="1" placeholder="例: 0.45">
              <span class="input-group-text">（0〜1）</span>
            </div>
          </div>
          <div class="col-md-4">
            <label class="form-label fw-semibold">定価</label>
            <div class="input-group">
              <span class="input-group-text">¥</span>
              <input class="form-control" id="be-list-price" type="number" step="1" min="0" placeholder="変更しない場合は空欄">
            </div>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-semibold">標準仕入先</label>
            <select class="form-select" id="be-supplier">
              <option value="">— 変更しない —</option>
              ${supplierOpts}
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label fw-semibold">単位</label>
            <select class="form-select" id="be-unit">
              <option value="">— 変更しない —</option>
              <option value="本">本</option>
              <option value="個">個</option>
              <option value="ダース">ダース</option>
              <option value="セット">セット</option>
              <option value="足">足</option>
            </select>
          </div>
        </div>
        <!-- プレビューリスト -->
        <div class="mt-3">
          <div class="fw-semibold small text-muted mb-1"><i class="fas fa-list me-1"></i>編集対象の商品</div>
          <div id="bulk-edit-preview" class="border rounded p-2 bg-light" style="max-height:180px;overflow-y:auto;font-size:0.8rem"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">キャンセル</button>
        <button type="button" class="btn btn-warning fw-bold" id="btn-do-bulk-edit">
          <i class="fas fa-save me-1"></i>一括更新を実行
        </button>
      </div>
    </div>
  </div>
</div>

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
                  <thead><tr>
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
</div>

<!-- ════ 複数仕入先管理モーダル ════ -->
<div class="modal fade" id="suppliersModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header bg-success text-white">
        <h5 class="modal-title">
          <i class="fas fa-truck me-2"></i>仕入先設定: <span id="sup-modal-product-name"></span>
        </h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <p class="text-muted small mb-3">
          <i class="fas fa-info-circle me-1"></i>
          同じ商品でも仕入先ごとに掛け率が異なる場合、ここで設定できます。発注作成時に仕入先を選択すると掛け率が自動反映されます。
        </p>
        <!-- 現在の仕入先リスト -->
        <div id="sup-modal-list" class="mb-3"></div>
        <!-- 追加フォーム -->
        <div class="card border-primary">
          <div class="card-header bg-primary text-white py-2 small fw-semibold">
            <i class="fas fa-plus me-1"></i>仕入先を追加
          </div>
          <div class="card-body py-3">
            <div class="row g-2 align-items-end">
              <div class="col-md-5">
                <label class="form-label small fw-semibold mb-1">仕入先 <span class="text-danger">*</span></label>
                <select class="form-select form-select-sm" id="sup-add-supplier">
                  <option value="">― 選択 ―</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label small fw-semibold mb-1">掛率 <span class="text-muted fw-normal">(例: 0.65)</span></label>
                <input type="number" class="form-control form-control-sm text-end" id="sup-add-rate"
                  min="0" max="1" step="0.01" placeholder="0.65">
              </div>
              <div class="col-md-2 d-flex align-items-center pt-4">
                <div class="form-check mb-0">
                  <input class="form-check-input" type="checkbox" id="sup-add-default">
                  <label class="form-check-label small" for="sup-add-default">デフォルト</label>
                </div>
              </div>
              <div class="col-md-2">
                <button class="btn btn-primary btn-sm w-100" id="btn-sup-add">
                  <i class="fas fa-plus me-1"></i>追加
                </button>
              </div>
              <div class="col-12">
                <label class="form-label small fw-semibold mb-1">備考 <span class="text-muted fw-normal small">(急ぎ用・送料無料条件など)</span></label>
                <input type="text" class="form-control form-control-sm" id="sup-add-notes" placeholder="例: 急ぎの場合のみ、ワークス経由">
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">閉じる</button>
      </div>
    </div>
  </div>
</div>`
  const o1 = getLayoutOpts(c)
  return layout('商品マスタ', content, scripts, o1.username, o1)
})

// ============================================================
// 仕入先マスタ
// ============================================================
app.get('/suppliers', async (c) => {
  const db = c.env.DB
  const { tenantId } = getLayoutOpts(c)
  const res = await db.prepare('SELECT * FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name').bind(tenantId).all<Record<string,unknown>>()

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
    <td class="small" style="max-width:200px">${r['cc_emails'] ? `<span class="text-muted" style="word-break:break-all;font-size:0.8rem">${esc(r['cc_emails'])}</span>` : '<span class="text-muted small">―</span>'}</td>
    <td class="small">${r['phone'] ? `<a href="tel:${esc(r['phone'])}" class="text-decoration-none">${esc(r['phone'])}</a>` : ''}</td>
    <td class="small">${esc(r['payment_method'])}</td>
    <td class="small">${r['shipping_rule'] ? `<span class="badge bg-info text-dark"><i class="fas fa-truck me-1"></i>${esc(r['shipping_rule'])}</span>` : ''}</td>
    <td class="small" style="max-width:220px">${r['notes'] ? `<span class="text-muted" data-bs-toggle="tooltip" data-bs-placement="left" title="${esc(r['notes'])}" style="cursor:help;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:200px">${esc(r['notes'])}</span>` : ''}</td>
    <td>
      <button class="btn btn-xs btn-outline-primary btn-edit-sup py-0 px-2" data-row='${JSON.stringify(r).replace(/'/g,'&#39;')}'><i class="fas fa-edit"></i></button>
      <button class="btn btn-xs btn-outline-danger btn-del-sup py-0 px-2 ms-1" data-id="${r['id']}" data-name="${esc(r['name'])}"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join('')

  const scripts = `<script>
// Tooltipを有効化（備考の省略表示）
document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function(el){
  new bootstrap.Tooltip(el);
});

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
     'phone','fax','fax_number','email','cc_emails','line_id','line_group_id',
     'payment_method','shipping_rule','free_shipping_threshold','website','postal_code','address','notes'
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
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-building me-2" style="color:var(--gw-green)"></i>仕入先マスタ</h1>
    <p class="page-subtitle">${res.results.length} 件登録</p>
  </div>
  <div class="actions">
    <button class="btn btn-primary" onclick="openAddSup()"><i class="fas fa-plus me-1"></i>仕入先を追加</button>
  </div>
</div>
<div class="card">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0">
      <thead><tr>
        <th>仕入先名</th><th>担当者</th><th>発注方法</th><th>連絡先</th>
        <th>CCアドレス</th><th>電話</th><th>支払い</th><th>送料条件</th><th>備考</th><th>操作</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="10" class="text-center py-4 text-muted">仕入先データがありません。</td></tr>'}</tbody>
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
            <div class="col-12" id="row-cc-emails">
              <label class="form-label fw-semibold"><i class="fas fa-user-plus text-secondary me-1"></i>CCアドレス <span class="fw-normal text-muted small">(複数指定時はカンマ区切り)</span></label>
              <input class="form-control" name="cc_emails" placeholder="cc1@example.com, cc2@example.com">
              <div class="form-text"><i class="fas fa-info-circle me-1"></i>発注メール作成時にCC候補として表示されます</div>
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
            <div class="col-md-8">
              <label class="form-label fw-semibold">送料条件</label>
              <input class="form-control" name="shipping_rule" placeholder="例: 3万円以上送料無料">
            </div>
            <div class="col-md-4">
              <label class="form-label fw-semibold">送料無料ライン <small class="text-muted fw-normal">（プール機能用・円）</small></label>
              <div class="input-group">
                <span class="input-group-text">¥</span>
                <input class="form-control" name="free_shipping_threshold" type="number" min="0" step="1000" placeholder="25000">
              </div>
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
  const o2 = getLayoutOpts(c)
  return layout('仕入先マスタ', content, scripts, o2.username, o2)
})

// ============================================================
// 判定ルール
// ============================================================
app.get('/rules', async (c) => {
  const db = c.env.DB
  const { tenantId } = getLayoutOpts(c)
  const res = await db.prepare(`
    SELECT sr.*, s.name AS supplier_name FROM supplier_rules sr
    JOIN suppliers s ON sr.supplier_id=s.id
    WHERE sr.tenant_id=?
    ORDER BY sr.item_category, sr.manufacturer, sr.club_type, sr.priority
  `).bind(tenantId).all<Record<string,unknown>>()

  const suppliers = await db.prepare('SELECT id, name FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name').bind(tenantId).all<Record<string,unknown>>()
  const supplierOpts = suppliers.results.map(s => `<option value="${s['id']}">${esc(s['name'])}</option>`).join('')

  const cats = await db.prepare('SELECT DISTINCT item_category FROM products WHERE is_active=1 AND tenant_id=? ORDER BY item_category').bind(tenantId).all<{item_category:string}>()
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
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-sitemap me-2" style="color:var(--gw-green)"></i>仕入先判定ルール</h1>
    <p class="page-subtitle">品目・メーカー・種類から発注先を自動判定するルールです。優先順位の小さい方が優先されます。</p>
  </div>
  <div class="actions">
    <button class="btn btn-primary" onclick="openAddRule()"><i class="fas fa-plus me-1"></i>ルールを追加</button>
  </div>
</div>

<div class="alert alert-info py-2 small mb-3">
  <i class="fas fa-info-circle me-1"></i>
  <strong>判定ロジック:</strong> 商品を発注する際、品目 → メーカー → 種類の順に絞り込み、最も優先度の高いルールの仕入先に自動振り分けされます。空欄は「すべて」にマッチします。
</div>

<div class="card">
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0">
      <thead><tr>
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
  const o3 = getLayoutOpts(c)
  return layout('判定ルール', content, scripts, o3.username, o3)
})

// ============================================================
// 発注プール
// ============================================================
app.get('/purchase-pool', async (c) => {
  const db = c.env.DB
  const { tenantId } = getLayoutOpts(c)

  const orders = await db.prepare(`
    SELECT po.id, po.order_no, po.order_date, po.ordered_by,
           po.customer_name, po.usage_type, po.order_note,
           s.id AS supplier_id, s.name AS supplier_name,
           s.free_shipping_threshold,
           COALESCE(SUM(poi.amount),0) AS total_amount,
           COALESCE(SUM(poi.quantity),0) AS total_qty,
           COUNT(DISTINCT poi.id) AS line_count
    FROM purchase_orders po
    JOIN suppliers s ON po.supplier_id = s.id
    LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
    WHERE po.status = 'pool' AND po.tenant_id=?
    GROUP BY po.id, s.id
    ORDER BY s.name, po.id
  `).bind(tenantId).all<Record<string, unknown>>()

  // 仕入先ごとにグループ化
  type SupplierGroup = {
    supplier_id: number
    supplier_name: string
    free_shipping_threshold: number | null
    orders: Record<string, unknown>[]
    pool_total: number
  }
  const supplierMap = new Map<number, SupplierGroup>()
  for (const o of orders.results) {
    const sid = o['supplier_id'] as number
    if (!supplierMap.has(sid)) {
      supplierMap.set(sid, {
        supplier_id: sid,
        supplier_name: o['supplier_name'] as string,
        free_shipping_threshold: o['free_shipping_threshold'] as number | null,
        orders: [],
        pool_total: 0,
      })
    }
    const g = supplierMap.get(sid)!
    g.orders.push(o)
    g.pool_total += (o['total_amount'] as number) || 0
  }
  const groups = Array.from(supplierMap.values())

  // 各発注の明細を取得
  const allOrderIds = orders.results.map(o => o['id'] as number)
  const itemsByOrder = new Map<number, Record<string, unknown>[]>()
  for (const oid of allOrderIds) {
    const items = await db.prepare(
      'SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id'
    ).bind(oid).all<Record<string, unknown>>()
    itemsByOrder.set(oid, items.results)
  }

  const totalPoolOrders = orders.results.length

  // グループHTMLを生成
  const groupsHtml = groups.length === 0 ? `
    <div class="text-center py-5 text-muted">
      <i class="fas fa-layer-group fa-3x mb-3 d-block opacity-50"></i>
      <p class="mb-0">プールに追加された発注はありません</p>
      <a href="/orders/new" class="btn btn-primary mt-3">
        <i class="fas fa-plus me-1"></i>新規発注を作成
      </a>
    </div>` : groups.map(g => {
    const threshold = g.free_shipping_threshold
    const pct = threshold ? Math.min(100, Math.round(g.pool_total / threshold * 100)) : null
    const remaining = threshold ? Math.max(0, threshold - g.pool_total) : null
    const achieved = threshold ? g.pool_total >= threshold : false

    const progressHtml = threshold ? `
      <div class="mb-2">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <small class="text-muted">送料無料まで</small>
          ${achieved
            ? `<span class="badge bg-success"><i class="fas fa-check me-1"></i>送料無料達成！</span>`
            : `<span class="text-danger fw-bold small">あと ¥${remaining!.toLocaleString()}</span>`
          }
        </div>
        <div class="progress" style="height:10px">
          <div class="progress-bar ${achieved ? 'bg-success' : 'bg-warning'}"
               style="width:${pct}%" role="progressbar"></div>
        </div>
        <div class="d-flex justify-content-between mt-1">
          <small class="text-muted">¥${g.pool_total.toLocaleString()}</small>
          <small class="text-muted">¥${threshold.toLocaleString()}</small>
        </div>
      </div>` : `
      <div class="mb-2">
        <small class="text-muted">合計金額: <strong>¥${g.pool_total.toLocaleString()}</strong>　（送料無料ライン未設定）</small>
      </div>`

    const ordersHtml = g.orders.map(o => {
      const items = itemsByOrder.get(o['id'] as number) || []
      const itemsHtml = items.map(item => `
        <tr class="small">
          <td class="ps-3 text-muted">${esc(item['item_category'] as string)}</td>
          <td>${esc(item['manufacturer'] as string)}</td>
          <td>${esc(item['product_name'] as string)}</td>
          <td>${esc(item['spec'] as string)}</td>
          <td>${esc(item['color'] as string)}</td>
          <td class="text-end">${item['quantity']}</td>
          <td class="text-end">¥${((item['unit_price'] as number) || 0).toLocaleString()}</td>
          <td class="text-end">¥${((item['amount'] as number) || 0).toLocaleString()}</td>
          <td>${esc(item['line_note'] as string)}</td>
        </tr>`).join('')

      return `
      <div class="border rounded mb-2 p-2 bg-light" data-order-id="${o['id']}">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <span class="small text-muted me-2">${esc(o['order_date'] as string)}</span>
            ${o['customer_name'] ? `<span class="small fw-bold me-2">${esc(o['customer_name'] as string)}</span>` : ''}
            ${o['usage_type'] ? `<span class="badge bg-light text-dark border me-1">${esc(o['usage_type'] as string)}</span>` : ''}
            <span class="small text-muted">${o['line_count']}明細</span>
            <strong class="ms-2">¥${((o['total_amount'] as number) || 0).toLocaleString()}</strong>
            ${o['order_note'] ? `<span class="small text-muted ms-2"><i class="fas fa-sticky-note me-1"></i>${esc(o['order_note'] as string)}</span>` : ''}
          </div>
          <div class="d-flex gap-1">
            <button class="btn btn-xs btn-outline-secondary btn-toggle-items py-0 px-2"
                    data-order-id="${o['id']}" title="明細を表示">
              <i class="fas fa-list"></i>
            </button>
            <button class="btn btn-xs btn-outline-danger btn-remove-pool py-0 px-2"
                    data-order-id="${o['id']}" title="プールから削除">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="items-area mt-2" id="items-${o['id']}" style="display:none">
          <table class="table table-sm table-bordered mb-0 bg-white small">
            <thead>
              <tr>
                <th>品目</th><th>メーカー</th><th>商品名</th>
                <th>仕様</th><th>色</th><th class="text-end">数量</th>
                <th class="text-end">単価</th><th class="text-end">金額</th><th>備考</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
        </div>
      </div>`
    }).join('')

    const orderIdsJson = JSON.stringify(g.orders.map(o => o['id']))
    return `
    <div class="card mb-4 ${achieved ? 'border-success' : ''}" data-supplier-id="${g.supplier_id}">
      <div class="card-header d-flex justify-content-between align-items-center ${achieved ? 'bg-success bg-opacity-10' : 'bg-white'}">
        <div>
          <h5 class="mb-0"><i class="fas fa-truck me-2 text-primary"></i>${esc(g.supplier_name)}</h5>
          <small class="text-muted">${g.orders.length}件の発注</small>
        </div>
        <button class="btn btn-primary btn-execute-pool"
                data-order-ids='${orderIdsJson}'
                data-supplier="${esc(g.supplier_name)}">
          <i class="fas fa-paper-plane me-1"></i>まとめて発注する
        </button>
      </div>
      <div class="card-body">
        ${progressHtml}
        <hr class="my-2">
        ${ordersHtml}
      </div>
    </div>`
  }).join('')

  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-layer-group me-2" style="color:#d97706"></i>発注プール</h1>
    <p class="page-subtitle">送料無料ラインを超えたらまとめて発注 — 現在 <strong>${totalPoolOrders}</strong> 件プール中</p>
  </div>
  <div class="actions">
    <a href="/orders/new" class="btn btn-primary">
      <i class="fas fa-plus me-1"></i>新規発注
    </a>
  </div>
</div>
${groupsHtml}
<div id="pool-toast" class="toast align-items-center text-white bg-success border-0 position-fixed bottom-0 end-0 m-3" role="alert" style="z-index:9999">
  <div class="d-flex">
    <div class="toast-body" id="pool-toast-msg"></div>
    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
  </div>
</div>`

  const scripts = `<script>
(function(){
  // 明細トグル
  document.querySelectorAll('.btn-toggle-items').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = this.dataset.orderId;
      var area = document.getElementById('items-' + id);
      if (!area) return;
      area.style.display = area.style.display === 'none' ? '' : 'none';
    });
  });

  // プールから削除
  document.querySelectorAll('.btn-remove-pool').forEach(function(btn){
    btn.addEventListener('click', async function(){
      if (!confirm('この発注をプールから削除しますか？')) return;
      var id = this.dataset.orderId;
      var resp = await fetch('/api/pool/' + id, {method:'DELETE'});
      if (resp.ok) { location.reload(); }
      else { alert('削除に失敗しました'); }
    });
  });

  // まとめて発注
  document.querySelectorAll('.btn-execute-pool').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var supplier = this.dataset.supplier;
      var ids = JSON.parse(this.dataset.orderIds);
      if (!confirm(supplier + ' の ' + ids.length + ' 件をまとめて発注しますか？\\nメール下書きが作成されます。')) return;
      this.disabled = true;
      this.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>処理中...';
      var resp = await fetch('/api/pool/execute', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({order_ids: ids})
      });
      if (resp.ok) {
        var data = await resp.json();
        window.location.href = '/mail-batch/' + data.batch_code;
      } else {
        alert('発注処理に失敗しました');
        this.disabled = false;
        this.innerHTML = '<i class="fas fa-paper-plane me-1"></i>まとめて発注する';
      }
    });
  });
})();
</script>`

  const o4 = getLayoutOpts(c)
  return layout('発注プール', content, scripts, o4.username, o4)
})

// ============================================================
// 発注一覧
// ============================================================
app.get('/orders', async (c) => {
  const db = c.env.DB
  const { tenantId } = getLayoutOpts(c)
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
    WHERE po.tenant_id=?`
  const params: unknown[] = [tenantId]
  if (status) { sql += ' AND po.status=?'; params.push(status) }
  if (supplier) { sql += ' AND s.name LIKE ?'; params.push(`%${supplier}%`) }
  if (q) {
    sql += ' AND (po.order_no LIKE ? OR po.customer_name LIKE ? OR po.ordered_by LIKE ?)'
    const like = `%${q}%`; params.push(like, like, like)
  }
  sql += ' GROUP BY po.id, s.id ORDER BY po.id DESC'

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
    <td class="text-center">
      <button class="btn btn-xs btn-outline-danger py-0 px-2 btn-delete-order"
              data-order-id="${r['id']}" data-order-no="${esc(r['order_no'])}"
              title="削除">
        <i class="fas fa-trash-alt"></i>
      </button>
    </td>
  </tr>`).join('')

  const listScript = `<script>
document.querySelectorAll('.btn-delete-order').forEach(function(btn){
  btn.addEventListener('click', async function(){
    var orderNo = this.dataset.orderNo;
    var id = this.dataset.orderId;
    if (!confirm('発注「' + orderNo + '」を削除しますか？\\n\\n入荷履歴も含めて完全に削除されます。\\nこの操作は取り消せません。')) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    var r = await fetch('/api/orders/' + id, {method:'DELETE'});
    if (r.ok) {
      var row = btn.closest('tr');
      row.style.transition = 'opacity 0.3s';
      row.style.opacity = '0';
      setTimeout(function(){ row.remove(); }, 300);
    } else {
      var d = await r.json().catch(function(){ return {}; });
      alert(d.error || '削除に失敗しました');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-trash-alt"></i>';
    }
  });
});
</script>`

  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-list me-2" style="color:var(--gw-green)"></i>発注一覧</h1>
    <p class="page-subtitle">発注履歴とステータスを一覧で確認できます。</p>
  </div>
  <div class="actions">
    <a class="btn btn-primary" href="/orders/new"><i class="fas fa-plus me-1"></i>新規発注</a>
  </div>
</div>
<div class="card mb-3">
  <div class="card-body py-2">
    <form class="row g-2 align-items-center">
      <div class="col-md-2">
        <select name="status" class="form-select form-select-sm">
          <option value="">全ステータス</option>
          ${statusOpts.map(s => `<option value="${s}" ${status===s?'selected':''}>${statusNames[s]}</option>`).join('')}
        </select>
      </div>
      <div class="col-md-2"><input class="form-control form-control-sm" name="supplier" value="${esc(supplier)}" placeholder="仕入先で絞り込み"></div>
      <div class="col-md-3"><input class="form-control form-control-sm" name="q" value="${esc(q)}" placeholder="発注番号・顧客名・発注者"></div>
      <div class="col-auto"><button class="btn btn-sm btn-primary"><i class="fas fa-search me-1"></i>検索</button></div>
      ${(status||supplier||q) ? '<div class="col-auto"><a href="/orders" class="btn btn-sm btn-outline-secondary"><i class="fas fa-times me-1"></i>クリア</a></div>' : ''}
    </form>
  </div>
</div>
<div class="card">
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead><tr>
        <th>発注番号</th><th>発注日</th><th>仕入先</th><th>顧客名</th><th>用途</th>
        <th class="text-center">明細</th><th class="text-center">数量</th>
        <th class="text-end">金額</th><th>状態</th><th></th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="10" class="text-center text-muted py-4">対象データがありません。</td></tr>'}</tbody>
    </table>
  </div>
  <div class="card-footer text-muted small">${res.results.length}件</div>
</div>`
  const o5 = getLayoutOpts(c)
  return layout('発注一覧', content, listScript, o5.username, o5)
})

// ============================================================
// 新規発注フォーム  ★ルートを /orders/:id より前に定義
// ============================================================
app.get('/orders/new', async (c) => {
  const db = c.env.DB
  const { tenantId } = getLayoutOpts(c)
  const [productRes, supplierRes] = await Promise.all([
    db.prepare(`
      SELECT p.id, p.item_category, p.manufacturer, p.name, p.spec, p.club_type,
             p.list_price, p.default_rate, s.name AS supplier_name
      FROM products p LEFT JOIN suppliers s ON p.default_supplier_id=s.id
      WHERE p.is_active=1 AND p.tenant_id=? ORDER BY p.item_category, p.manufacturer, p.name LIMIT 5000
    `).bind(tenantId).all<Record<string,unknown>>(),
    db.prepare(`SELECT id, name FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name`).bind(tenantId).all<{id:number,name:string}>()
  ])

  // 外部JSに商品データ・仕入先データを渡すインライン変数のみ定義
  const dataScript = `<script>var PRODUCTS = ${JSON.stringify(productRes.results)};var SUPPLIERS = ${JSON.stringify(supplierRes.results)};</script>`

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
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-plus-circle me-2" style="color:var(--gw-green)"></i>新規発注</h1>
    <p class="page-subtitle">カテゴリーから商品を選択して発注明細を作成してください。</p>
  </div>
  <div class="actions">
    <a href="/purchase-pool" class="btn btn-outline-secondary btn-sm"><i class="fas fa-layer-group me-1"></i>発注プール</a>
    <a href="/orders" class="btn btn-outline-secondary btn-sm"><i class="fas fa-list me-1"></i>発注一覧</a>
  </div>
</div>
<form id="order-form">
  <div class="card mb-3">
    <div class="card-header"><span class="card-title"><i class="fas fa-info-circle me-1"></i>発注ヘッダ</span></div>
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

  <div class="card">
    <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
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
        <thead>
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
    <div class="card-footer bg-white py-3">
      <!-- 仕入先備考プレビュー（商品選択後に自動表示） -->
      <div id="supplier-notes-area"></div>
      <div class="d-flex justify-content-between align-items-center mt-2">
        <p class="text-muted small mb-0">
          <i class="fas fa-lightbulb me-1 text-warning"></i>
          定価・掛率を入力すると単価が自動計算されます
        </p>
        <div class="d-flex gap-2">
          <button type="submit" class="btn btn-primary btn-lg px-4">
            <i class="fas fa-paper-plane me-1"></i>発注データとメール下書きを作成
          </button>
          <button type="button" class="btn btn-outline-warning btn-lg px-4" id="btn-add-to-pool">
            <i class="fas fa-layer-group me-1"></i>プールに追加
          </button>
        </div>
      </div>
    </div>
  </div>
</form>`

  // Bootstrap JS より後に読み込む必要があるため extraScripts として渡す
  const newOrderScripts = `<script src="/static/new-order.js"></script>`

  const o6 = getLayoutOpts(c)
  return layout('新規発注', content, newOrderScripts, o6.username, o6)
})

// ============================================================
// メールバッチ
// ============================================================
app.get('/mail-batch/:batch_code', async (c) => {
  const db = c.env.DB
  const { tenantId } = getLayoutOpts(c)
  const batchCode = c.req.param('batch_code')
  const BATCH_DEFAULT_CC = c.env.APP_DEFAULT_CC || 'h_furukawa@golfwing.jp;s_furukawa@golfwing.jp;y_idoo@golfwing.jp;a_tanigawa@golfwing.jp;u_furukawa@golfwing.jp'

  const orders = await db.prepare(`
    SELECT po.*, s.name AS supplier_name, s.email AS supplier_email,
           s.cc_emails AS supplier_cc_emails, s.contact_name, s.order_method
    FROM purchase_orders po JOIN suppliers s ON po.supplier_id=s.id
    WHERE po.batch_code=? AND po.tenant_id=? ORDER BY po.id
  `).bind(batchCode, tenantId).all<Record<string,unknown>>()

  // ── 同一 supplier_email でグループ化（まとめメール対応） ──
  type OrderGroup = {
    supplierName: string
    supplierEmail: string
    supplierCcEmails: string
    orderMethod: string
    orders: Array<{ order: Record<string,unknown>; items: Record<string,unknown>[] }>
  }
  const groupMap = new Map<string, OrderGroup>()

  for (const order of orders.results) {
    const items = await db.prepare(
      'SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id'
    ).bind(order['id']).all<Record<string,unknown>>()

    const email = String(order['supplier_email'] ?? '') || `__no_email_${order['id']}`
    if (!groupMap.has(email)) {
      groupMap.set(email, {
        supplierName:     String(order['supplier_name']      ?? ''),
        supplierEmail:    String(order['supplier_email']     ?? ''),
        supplierCcEmails: String(order['supplier_cc_emails'] ?? ''),
        orderMethod:      String(order['order_method']       ?? ''),
        orders: [],
      })
    }
    groupMap.get(email)!.orders.push({ order, items: items.results })
  }

  // メール署名情報（環境変数 → フォールバック）
  const senderName = c.env.APP_SENDER_NAME || ''
  const senderShop = c.env.APP_SENDER_SHOP || ''
  const senderAddr = c.env.APP_SENDER_ADDR || ''
  const senderTel  = c.env.APP_SENDER_TEL  || ''
  const senderMail = c.env.APP_SENDER_MAIL || ''

  // pages.ts 内でメール本文を組み立てるユーティリティ（api.ts の composeMail と同等）
  function buildMailBody(
    supplierName: string,
    contactName: string,
    honorific: string,
    orderNote: string,
    items: Record<string,unknown>[]
  ): string {
    const lines = items.map(item => {
      const spec     = item['spec']      ? ` / ${item['spec']}`      : ''
      const color    = item['color']     ? ` / ${item['color']}`     : ''
      const clubType = item['club_type'] ? ` / ${item['club_type']}` : ''
      const unit     = String(item['unit'] || '本')
      return `・${item['item_category']} / ${item['manufacturer'] || ''} / ${item['product_name']}${spec}${color}${clubType} / ${item['quantity']}${unit}`
    })
    const noteBlock = orderNote.trim() ? `\n備考:\n${orderNote.trim()}\n` : ''
    const greeting = senderName ? `お世話になっております。\n${senderName}でございます。` : 'お世話になっております。'
    const sigLines: string[] = []
    if (senderShop) sigLines.push(senderShop)
    if (senderAddr) sigLines.push(senderAddr)
    if (senderTel)  sigLines.push(`TEL：${senderTel}`)
    if (senderMail) sigLines.push(`mail：${senderMail}`)
    const sig = sigLines.length
      ? `---------------------------\n${sigLines.join('\n')}\n---------------------------`
      : ''
    return `${supplierName}
${contactName}${honorific}

${greeting}

下記の通り、発注をお願いいたします。

${lines.join('\n')}
${noteBlock}
ご確認のほど、よろしくお願いいたします。
${sig ? '\n' + sig : ''}`
  }

  const cards: string[] = []

  for (const [, group] of groupMap) {
    // グループ内の全アイテムをまとめて明細テーブルを作成
    const allItems: Record<string,unknown>[] = group.orders.flatMap(g => g.items)

    const itemRows = allItems.map(item => `<tr>
      <td>${esc(item['item_category'])}</td><td>${esc(item['manufacturer'])}</td>
      <td>${esc(item['product_name'])}</td><td>${esc(item['spec'])}</td>
      <td>${esc(item['club_type'])}</td>
      <td class="text-center">${item['quantity']}</td>
      <td class="text-end">${yen(item['unit_price'])}</td>
      <td class="text-end">${yen(item['amount'])}</td>
    </tr>`).join('')

    // 先頭発注からサプライヤー情報・備考を取得
    const firstOrder  = group.orders[0].order
    const emailSubject = String(firstOrder['email_subject'] ?? '発注のお願い')

    // 複数発注がまとまっている場合は全商品で本文を再構築
    // 備考は各発注のものを改行で結合（重複除去）
    const orderNotesCombined = [...new Set(
      group.orders.map(g => String(g.order['order_note'] ?? '').trim()).filter(Boolean)
    )].join('\n')

    const emailBody = buildMailBody(
      group.supplierName,
      String(firstOrder['contact_name'] ?? 'ご担当者'),
      String(firstOrder['honorific']    ?? '様'),
      orderNotesCombined,
      allItems
    )
    const supplierEmail = group.supplierEmail
    // CC候補: 仕入先設定のcc_emailsをカンマ分割してリスト化
    const ccCandidates: string[] = [
      ...(BATCH_DEFAULT_CC ? [BATCH_DEFAULT_CC] : []),
      ...(group.supplierCcEmails
        ? group.supplierCcEmails.split(',').map((s: string) => s.trim()).filter(Boolean)
        : []
      ),
    ]
    // 重複除去
    const ccUniq = [...new Set(ccCandidates)]
    // 初期CC値: デフォルトCC(自社)＋仕入先固有CCを常に統合（重複除去）
    const initialCC = [...new Set([
      ...(BATCH_DEFAULT_CC ? BATCH_DEFAULT_CC.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : []),
      ...(group.supplierCcEmails ? group.supplierCcEmails.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : []),
    ])].join(', ')

    // CC候補ボタン群HTML
    const ccCandidateHtml = ccUniq.length > 0
      ? `<div class="mt-1 d-flex flex-wrap gap-1">
          <span class="small text-muted me-1">CC候補:</span>
          ${ccUniq.map(addr =>
            `<button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1 batch-cc-candidate"
              style="font-size:0.75rem" data-addr="${esc(addr)}">${esc(addr)}</button>`
          ).join('')}
        </div>`
      : ''

    // 発注番号一覧（複数ある場合は全部表示）
    const orderNos = group.orders.map(g => String(g.order['order_no'])).join('、')
    const orderLinks = group.orders.map(g =>
      `<a class="btn btn-sm btn-outline-primary" href="/orders/${g.order['id']}">
        <i class="fas fa-edit me-1"></i>${esc(String(g.order['order_no']))}
      </a>`
    ).join('')

    const bodyEscaped = emailBody.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    const bodyJson = JSON.stringify(emailBody)

    const mailtoHref = supplierEmail
      ? 'mailto:' + supplierEmail + '?' +
        (initialCC ? 'cc=' + encodeURIComponent(initialCC) + '&' : '') +
        'subject=' + encodeURIComponent(emailSubject) + '&body=' + encodeURIComponent(emailBody)
      : ''

    const isMerged = group.orders.length > 1

    cards.push(`
    <div class="card mb-4">
      <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <strong><i class="fas fa-building me-1"></i>${esc(group.supplierName)}</strong>
          ${isMerged
            ? `<span class="badge bg-warning text-dark ms-2"><i class="fas fa-compress-arrows-alt me-1"></i>${group.orders.length}件まとめ</span>`
            : `<span class="text-muted ms-2 small">${esc(orderNos)}</span>`
          }
        </div>
        <div class="small text-muted">発注方法: ${esc(group.orderMethod) || '未設定'}</div>
      </div>
      <div class="card-body">
        <!-- 宛先・CC・件名 -->
        <div class="row g-2 mb-3">
          <div class="col-md-4">
            <label class="form-label fw-semibold small text-muted mb-1">宛先 (To)</label>
            <input class="form-control form-control-sm" readonly value="${esc(supplierEmail)}">
          </div>
          <div class="col-md-8">
            <label class="form-label fw-semibold small text-muted mb-1">CC <span class="text-muted fw-normal">(編集可)</span></label>
            <input type="text" class="form-control form-control-sm batch-cc-input"
              data-email="${esc(supplierEmail)}"
              data-subject="${esc(emailSubject)}"
              data-body="${esc(emailBody)}"
              value="${esc(initialCC)}"
              autocomplete="off" placeholder="cc@example.com, cc2@example.com">
            ${ccCandidateHtml}
          </div>
          <div class="col-12">
            <label class="form-label fw-semibold small text-muted mb-1">件名</label>
            <input class="form-control form-control-sm" readonly value="${esc(emailSubject)}">
          </div>
        </div>
        <!-- 本文 -->
        <div class="mb-3">
          <label class="form-label fw-semibold small text-muted mb-1">本文</label>
          <textarea class="form-control font-monospace batch-body-ta" rows="12" readonly>${bodyEscaped}</textarea>
        </div>
        <!-- 明細テーブル -->
        <div class="table-responsive mb-3">
          <table class="table table-sm mb-0">
            <thead><tr>
              <th>品目</th><th>メーカー</th><th>商品名</th><th>仕様</th><th>種類</th>
              <th class="text-center">数量</th><th class="text-end">単価</th><th class="text-end">金額</th>
            </tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
        </div>
        <!-- ボタン群 -->
        <div class="d-flex gap-2 flex-wrap align-items-center">
          ${mailtoHref ? `<a class="btn btn-primary btn-sm batch-mailto-btn" href="${mailtoHref}"><i class="fas fa-envelope me-1"></i>メールソフトで開く</a>` : ''}
          <button class="btn btn-outline-success btn-sm" onclick="copyBody(this,${bodyJson})">
            <i class="fas fa-copy me-1"></i>本文をコピー
          </button>
          <button class="btn btn-success btn-sm btn-mark-ordered"
            data-order-ids="${group.orders.map(g => g.order['id']).join(',')}">
            <i class="fas fa-paper-plane me-1"></i>発注済みにする
          </button>
          <div class="ms-auto d-flex gap-1 flex-wrap">
            <span class="small text-muted align-self-center me-1">商品追加・編集:</span>
            ${orderLinks}
          </div>
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

// CC候補ボタン → CC入力欄にアドレスを追加/削除
document.querySelectorAll('.batch-cc-candidate').forEach(function(btn){
  btn.addEventListener('click', function(){
    var card = btn.closest('.card');
    var ccInp = card ? card.querySelector('.batch-cc-input') : null;
    if(!ccInp) return;
    var addr = btn.dataset.addr || '';
    var cur = ccInp.value.trim();
    var addrs = cur ? cur.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];
    var idx = addrs.indexOf(addr);
    if(idx >= 0){
      // すでに追加済み → 削除
      addrs.splice(idx, 1);
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-outline-secondary');
    } else {
      // 未追加 → 追加
      addrs.push(addr);
      btn.classList.remove('btn-outline-secondary');
      btn.classList.add('btn-secondary');
    }
    ccInp.value = addrs.join(', ');
    ccInp.dispatchEvent(new Event('input'));
  });
  // 初期状態でCC欄に含まれていればアクティブ表示
  var card = btn.closest('.card');
  var ccInp = card ? card.querySelector('.batch-cc-input') : null;
  if(ccInp && ccInp.value.includes(btn.dataset.addr)){
    btn.classList.remove('btn-outline-secondary');
    btn.classList.add('btn-secondary');
  }
});

// CC入力 → mailtoリンクをリアルタイム更新
document.querySelectorAll('.batch-cc-input').forEach(function(ccInp){
  var card = ccInp.closest('.card');
  var mailtoBtn = card ? card.querySelector('.batch-mailto-btn') : null;
  if(!mailtoBtn) return;
  function rebuild(){
    var email   = ccInp.dataset.email;
    var subject = ccInp.dataset.subject;
    var body    = ccInp.dataset.body;
    var cc      = ccInp.value.trim();
    var qs = 'subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    if(cc) qs += '&cc=' + encodeURIComponent(cc);
    mailtoBtn.href = 'mailto:' + email + '?' + qs;
  }
  ccInp.addEventListener('input', rebuild);
  rebuild(); // 初期化
});

// 発注済みにする
document.querySelectorAll('.btn-mark-ordered').forEach(function(btn){
  btn.addEventListener('click', async function(){
    var ids = btn.dataset.orderIds.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    var label = ids.length > 1 ? ids.length + '件の発注' : '1件の発注';
    if(!confirm(label + 'を「発注済み」に更新しますか？')) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>更新中...';

    try {
      // 各発注を順番に発注済みへ更新
      var failed = [];
      for(var i = 0; i < ids.length; i++){
        var r = await fetch('/api/orders/' + ids[i] + '/status', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          credentials: 'include',
          body: JSON.stringify({status: 'ordered'}),
        });
        if(!r.ok) failed.push(ids[i]);
      }

      if(failed.length === 0){
        // 成功：ボタンを完了表示にしてカードをグレーアウト
        btn.innerHTML = '<i class="fas fa-check me-1"></i>発注済みにしました';
        btn.classList.replace('btn-success', 'btn-secondary');
        var card = btn.closest('.card');
        if(card){
          card.style.opacity = '0.6';
          card.querySelector('.card-header').style.background = '#f8f9fa';
        }
        // メールソフトで開くボタンなど他ボタンも無効化
        var mailtoBtn = card ? card.querySelector('.batch-mailto-btn') : null;
        if(mailtoBtn) mailtoBtn.classList.replace('btn-primary','btn-secondary');

        // 同一顧客の次の発注メールへ自動遷移（最後のAPIレスポンスを使用）
        // ※複数IDある場合は最後のレスポンスを使用
        var nextBatch = null, nextOrder = null;
        for(var j = 0; j < ids.length; j++){
          var rCheck = await fetch('/api/orders/' + ids[j] + '/status', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            credentials: 'include',
            body: JSON.stringify({status: 'ordered'}),
          });
          // 既に更新済みなので結果は無視、next情報だけ取得
          try {
            var dCheck = await rCheck.json();
            if(dCheck.next_mail_batch) nextBatch = dCheck.next_mail_batch;
            else if(dCheck.next_order_id) nextOrder = dCheck.next_order_id;
          } catch(e2){}
        }
        if(nextBatch){
          setTimeout(function(){
            if(confirm('同じお客様の別仕入先への発注メールがあります。続けて処理しますか？')){
              location.href = '/mail-batch/' + nextBatch;
            }
          }, 600);
        } else if(nextOrder){
          setTimeout(function(){
            if(confirm('同じお客様の別仕入先への発注があります。続けて処理しますか？')){
              location.href = '/orders/' + nextOrder;
            }
          }, 600);
        }
      } else {
        alert('一部の更新に失敗しました（ID: ' + failed.join(', ') + '）');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>発注済みにする';
      }
    } catch(e){
      alert('通信エラーが発生しました');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i>発注済みにする';
    }
  });
});
</script>`

  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-envelope-open-text me-2" style="color:var(--gw-green)"></i>メール下書き一覧</h1>
    <p class="page-subtitle">仕入先ごとの発注メール下書きです。CCは編集可能です。「メールソフトで開く」でOutlookに転記できます。</p>
  </div>
  <div class="actions">
    <a class="btn btn-outline-secondary" href="/orders"><i class="fas fa-list me-1"></i>発注一覧へ</a>
  </div>
</div>
${cards.length ? cards.join('') : '<div class="alert alert-warning">該当するメール下書きがありません。</div>'}`
  const o7 = getLayoutOpts(c)
  return layout('メール下書き', content, scripts, o7.username, o7)
})

// ============================================================
// 発注ヘッダー編集ページ  ★ /orders/:id より前に定義
// ============================================================
app.get('/orders/:id/edit', async (c) => {
  const db  = c.env.DB
  const { tenantId } = getLayoutOpts(c)
  const id  = parseInt(c.req.param('id'))
  if (isNaN(id)) return layout('エラー', '<div class="alert alert-danger">不正なIDです。</div>', '', '', getLayoutOpts(c))

  const order = await db.prepare(`
    SELECT po.*, s.name AS supplier_name
    FROM purchase_orders po JOIN suppliers s ON po.supplier_id=s.id
    WHERE po.id=? AND po.tenant_id=?
  `).bind(id, tenantId).first<Record<string,unknown>>()
  if (!order) return layout('エラー', '<div class="alert alert-danger">発注データが見つかりません。</div>', '', '', getLayoutOpts(c))

  const scripts = `<script>
(function(){
  var form    = document.getElementById('edit-header-form');
  var saveBtn = document.getElementById('btn-save-header');

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>保存中...';

    var payload = {
      order_date:                form.order_date.value.trim()                || null,
      ordered_by:                form.ordered_by.value.trim()                || null,
      customer_name:             form.customer_name.value.trim()             || null,
      usage_type:                form.usage_type.value.trim()                || null,
      requested_delivery_date:   form.requested_delivery_date.value.trim()   || null,
      order_note:                form.order_note.value.trim()                || null,
    };

    try {
      var r = await fetch('/api/orders/${id}/header', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      var d = await r.json();
      if (r.ok) {
        location.href = '/orders/${id}';
      } else {
        alert(d.error || '保存に失敗しました');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>保存して発注詳細に戻る';
      }
    } catch(err) {
      alert('通信エラーが発生しました');
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save me-1"></i>保存して発注詳細に戻る';
    }
  });
})();
</script>`

  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-edit me-2" style="color:var(--gw-green)"></i>発注情報を編集</h1>
    <p class="page-subtitle">${esc(order['order_no'])} / <strong>${esc(order['supplier_name'])}</strong></p>
  </div>
  <div class="actions">
    <a class="btn btn-outline-secondary" href="/orders/${id}">
      <i class="fas fa-arrow-left me-1"></i>キャンセルして戻る
    </a>
  </div>
</div>

<form id="edit-header-form">
  <div class="card mb-3">
    <div class="card-header"><strong><i class="fas fa-info-circle me-1"></i>発注ヘッダー</strong></div>
    <div class="card-body row g-3">

      <div class="col-6 col-md-3">
        <label class="form-label">発注日</label>
        <input class="form-control" type="date" name="order_date"
          value="${esc(order['order_date'])}">
      </div>

      <div class="col-6 col-md-3">
        <label class="form-label">発注者 <span class="text-danger">*</span></label>
        <input class="form-control" name="ordered_by"
          placeholder="古川" value="${esc(order['ordered_by'])}" required>
      </div>

      <div class="col-6 col-md-3">
        <label class="form-label">顧客名</label>
        <input class="form-control" name="customer_name"
          placeholder="上田様" value="${esc(order['customer_name'])}">
      </div>

      <div class="col-6 col-md-3">
        <label class="form-label">用途</label>
        <input class="form-control" name="usage_type"
          placeholder="取り寄せ / 在庫用" value="${esc(order['usage_type'])}">
      </div>

      <div class="col-6 col-md-3">
        <label class="form-label">希望納期</label>
        <input class="form-control" type="date" name="requested_delivery_date"
          value="${esc(order['requested_delivery_date'])}">
      </div>

      <div class="col-12">
        <label class="form-label">発注備考 <span class="text-muted small">（メール本文の末尾に追記されます）</span></label>
        <textarea class="form-control" name="order_note" rows="3"
          placeholder="メール本文へ差し込む全体備考">${esc(order['order_note'])}</textarea>
      </div>

    </div>
    <div class="card-footer bg-white d-flex justify-content-end gap-2">
      <a class="btn btn-outline-secondary" href="/orders/${id}">
        <i class="fas fa-times me-1"></i>キャンセル
      </a>
      <button type="submit" class="btn btn-primary px-4" id="btn-save-header">
        <i class="fas fa-save me-1"></i>保存して発注詳細に戻る
      </button>
    </div>
  </div>
</form>`

  const o8 = getLayoutOpts(c)
  return layout(`発注情報編集 ${esc(order['order_no'])}`, content, scripts, o8.username, o8)
})

// ============================================================
// 発注詳細
// ============================================================
app.get('/orders/:id', async (c) => {
  const db = c.env.DB
  const { tenantId } = getLayoutOpts(c)
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return layout('エラー', '<div class="alert alert-danger">不正なIDです。</div>', '', '', getLayoutOpts(c))

  const order = await db.prepare(`
    SELECT po.*, s.name AS supplier_name, s.email AS supplier_email,
           s.cc_emails AS supplier_cc_emails,
           s.contact_name, s.honorific, s.order_method, s.order_method_detail,
           s.phone, s.line_id, s.fax, s.fax_number, s.website,
           s.notes AS supplier_notes, s.shipping_rule AS supplier_shipping_rule
    FROM purchase_orders po JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=? AND po.tenant_id=?
  `).bind(id, tenantId).first<Record<string,unknown>>()
  if (!order) return layout('エラー', '<div class="alert alert-danger">発注データが見つかりません。</div>', '', '', getLayoutOpts(c))

  const curStatus = String(order['status'] ?? '')
  const isEditable = curStatus === 'draft_created' || curStatus === 'pool'

  const [items, receipts, productRes, supplierRes] = await Promise.all([
    db.prepare(`
      SELECT poi.*,
        COALESCE((SELECT SUM(ri.received_quantity) FROM receipt_items ri WHERE ri.purchase_order_item_id=poi.id),0) AS received_qty
      FROM purchase_order_items poi WHERE poi.purchase_order_id=? ORDER BY poi.id
    `).bind(id).all<Record<string,unknown>>(),
    db.prepare('SELECT * FROM receipts WHERE purchase_order_id=? ORDER BY id DESC').bind(id).all<Record<string,unknown>>(),
    // 下書き/プールのときだけ商品マスタを取得（それ以外は空）
    isEditable
      ? db.prepare(`SELECT p.id, p.item_category,
                           p.manufacturer AS maker_name,
                           p.name         AS product_name,
                           p.spec, p.color, p.club_type,
                           p.list_price, p.default_rate,
                           s.name AS supplier_name
                    FROM products p LEFT JOIN suppliers s ON p.default_supplier_id=s.id
                    WHERE p.is_active=1 AND p.tenant_id=? ORDER BY p.item_category, p.manufacturer, p.name LIMIT 5000`
        ).bind(tenantId).all<Record<string,unknown>>()
      : Promise.resolve({ results: [] }),
    isEditable
      ? db.prepare('SELECT id, name FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name').bind(tenantId).all<{id:number,name:string}>()
      : Promise.resolve({ results: [] }),
  ])

  // 合計金額
  const totalAmount = items.results.reduce((s, i) => s + (Number(i['amount'])||0), 0)

  const itemRows = items.results.map(item => {
    const remaining = Number(item['quantity']||0) - Number(item['received_qty']||0)
    const pct = Number(item['quantity']||0) > 0
      ? Math.round(Number(item['received_qty']||0) / Number(item['quantity']||0) * 100) : 0
    const editBtns = isEditable ? `
      <td class="text-center" style="white-space:nowrap">
        <button class="btn btn-xs btn-outline-primary py-0 px-1 btn-edit-item"
          data-poi-id="${item['id']}"
          data-item-category="${esc(item['item_category'])}"
          data-manufacturer="${esc(item['manufacturer'])}"
          data-product-name="${esc(item['product_name'])}"
          data-spec="${esc(item['spec'])}"
          data-color="${esc(item['color'])}"
          data-club-type="${esc(item['club_type'])}"
          data-quantity="${item['quantity']}"
          data-list-price="${item['list_price'] ?? ''}"
          data-rate="${item['rate'] ?? ''}"
          data-unit-price="${item['unit_price'] ?? ''}"
          data-line-note="${esc(item['line_note'])}"
          title="編集"><i class="fas fa-edit"></i></button>
        <button class="btn btn-xs btn-outline-danger py-0 px-1 ms-1 btn-delete-item"
          data-poi-id="${item['id']}"
          data-product-name="${esc(item['product_name'])}"
          title="削除"><i class="fas fa-trash"></i></button>
      </td>` : ''
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
      ${editBtns}
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

  // メール本文が空の場合の再生成ブロック（pool/draft で本文未生成の場合）
  const noBodyBlock = `
<div class="alert alert-warning d-flex align-items-center gap-2 mb-2" id="no-body-alert">
  <i class="fas fa-exclamation-triangle"></i>
  <div class="flex-grow-1">テンプレートがまだ作成されていません。</div>
  <button class="btn btn-warning btn-sm" id="btn-regen-mail">
    <i class="fas fa-magic me-1"></i>テンプレートを生成する
  </button>
</div>`

  // メールパネル
  const DEFAULT_CC = c.env.APP_DEFAULT_CC || 'h_furukawa@golfwing.jp;s_furukawa@golfwing.jp;y_idoo@golfwing.jp;a_tanigawa@golfwing.jp;u_furukawa@golfwing.jp'
  // CC候補: 仕入先のcc_emails + APP_DEFAULT_CC を合わせて重複除去
  const supplierCcEmails = String(order['supplier_cc_emails'] ?? '')
  const detailCcCandidates: string[] = [
    ...(DEFAULT_CC ? [DEFAULT_CC] : []),
    ...(supplierCcEmails
      ? supplierCcEmails.split(',').map((s: string) => s.trim()).filter(Boolean)
      : []
    ),
  ]
  const detailCcUniq = [...new Set(detailCcCandidates)]
  // 初期CC値: デフォルトCC(自社)＋仕入先固有CCを常に統合（重複除去）
  const initialDetailCC = [...new Set([
    ...(DEFAULT_CC ? DEFAULT_CC.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : []),
    ...(supplierCcEmails ? supplierCcEmails.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean) : []),
  ])].join(', ')
  const mailtoWithCC = supplierEmail
    ? 'mailto:' + supplierEmail + '?' +
      (initialDetailCC ? 'cc=' + encodeURIComponent(initialDetailCC) + '&' : '') +
      'subject=' + encodeURIComponent(emailSubject) + '&body=' + encodeURIComponent(emailBody)
    : ''
  // CC候補ボタン
  const detailCcCandidateHtml = detailCcUniq.length > 0
    ? `<div class="mt-1 d-flex flex-wrap gap-1">
        <span class="small text-muted me-1">CC候補:</span>
        ${detailCcUniq.map(addr =>
          `<button type="button" class="btn btn-xs detail-cc-candidate py-0 px-1 ${initialDetailCC.includes(addr) ? 'btn-secondary' : 'btn-outline-secondary'}"
            style="font-size:0.75rem" data-addr="${esc(addr)}">${esc(addr)}</button>`
        ).join('')}
      </div>`
    : ''

  const emailPanel = `
${emailBody ? '' : noBodyBlock}
<div class="mb-2 d-flex gap-2 flex-wrap align-items-center">
  <span class="fw-semibold text-muted small">宛先:</span>
  <span>${supplierEmail ? `<a href="mailto:${esc(supplierEmail)}">${esc(supplierEmail)}</a>` : '<em class="text-muted">未設定</em>'}</span>
</div>
<div class="mb-2">
  <label class="fw-semibold text-muted small mb-1" for="email-cc-input">CC:</label>
  <input type="text" id="email-cc-input" class="form-control form-control-sm"
    style="max-width:480px"
    value="${esc(initialDetailCC)}"
    placeholder="cc@example.com, cc2@example.com"
    autocomplete="off">
  ${detailCcCandidateHtml}
</div>
<div class="mb-2">
  <span class="fw-semibold text-muted small">件名:</span>
  <span class="ms-1" id="email-subject-span">${esc(emailSubject)}</span>
</div>
<div class="mb-2 position-relative">
  <textarea id="email-body-ta" class="form-control font-monospace" rows="10" readonly>${bodyEsc}</textarea>
</div>
<div class="d-flex gap-2 flex-wrap">
  ${mailtoWithCC ? `<a class="btn btn-primary btn-sm" id="btn-mailto" href="${mailtoWithCC}"><i class="fas fa-envelope me-1"></i>メールソフトで開く</a>` : ''}
  <button class="btn btn-outline-success btn-sm" id="btn-copy-body"><i class="fas fa-copy me-1"></i>本文をコピー</button>
</div>`

  // LINEパネル
  const linePanel = `
${emailBody ? '' : noBodyBlock}
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
${emailBody ? '' : noBodyBlock}
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
  const showButtons = curStatus === 'draft_created' ? [statusButtons.ordered, statusButtons.cancelled]
    : curStatus === 'ordered'  ? [statusButtons.completed, statusButtons.cancelled]
    : curStatus === 'partial'  ? [statusButtons.completed, statusButtons.cancelled]
    : []

  // 商品追加モーダル（下書き/プールのときのみ）
  const addItemModalHtml = isEditable ? `
<div class="modal fade" id="addItemModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-dialog-scrollable">
    <div class="modal-content">
      <div class="modal-header py-2">
        <div class="d-flex align-items-center gap-2 flex-grow-1">
          <button type="button" id="aim-back" class="btn btn-sm btn-outline-secondary" style="display:none">
            <i class="fas fa-chevron-left me-1"></i>戻る
          </button>
          <h6 class="modal-title mb-0 fw-bold" id="aim-title">カテゴリーを選択</h6>
        </div>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="px-3 pt-2 pb-1" id="aim-search-wrap" style="display:none">
        <input type="text" id="aim-search" class="form-control form-control-sm" placeholder="商品名・仕様・種類で絞り込み…">
      </div>
      <div class="modal-body p-0" id="aim-body" style="max-height:400px;overflow-y:auto"></div>
      <!-- 確認フォーム -->
      <div class="modal-footer flex-column align-items-stretch d-none" id="aim-form-area">
        <div class="row g-2 w-100">
          <div class="col-12">
            <label class="form-label form-label-sm mb-1 fw-semibold">商品名</label>
            <input id="aim-pname" class="form-control form-control-sm" readonly>
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">色</label>
            <div id="aim-color-wrap">
              <input id="aim-color" class="form-control form-control-sm" placeholder="色">
            </div>
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">数量 <span class="text-danger">*</span></label>
            <input id="aim-qty" type="number" min="1" value="1" class="form-control form-control-sm text-center">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">定価</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">¥</span>
              <input id="aim-list-price" type="number" min="0" class="form-control text-end">
            </div>
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">掛率</label>
            <input id="aim-rate" type="number" min="0" max="1" step="0.001" class="form-control form-control-sm text-end" placeholder="0.55">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">単価</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">¥</span>
              <input id="aim-unit-price" type="number" min="0" class="form-control text-end" placeholder="自動計算">
            </div>
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">備考</label>
            <input id="aim-note" class="form-control form-control-sm" placeholder="任意">
          </div>
        </div>
        <div class="d-flex gap-2 w-100 mt-2">
          <button type="button" class="btn btn-outline-secondary btn-sm" id="aim-back-form">
            <i class="fas fa-chevron-left me-1"></i>商品選択に戻る
          </button>
          <button type="button" class="btn btn-primary btn-sm flex-grow-1" id="aim-submit">
            <i class="fas fa-plus me-1"></i>この商品を追加する
          </button>
        </div>
      </div>
    </div>
  </div>
</div>` : ''

  const dataScript = isEditable
    ? `<script>var AIM_PRODUCTS=${JSON.stringify(productRes.results)};var AIM_SUPPLIERS=${JSON.stringify(supplierRes.results)};</script>`
    : ''

  // 明細編集モーダル（isEditableのときのみ）
  const editItemModalHtml = isEditable ? `
<div class="modal fade" id="editItemModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header py-2">
        <h6 class="modal-title fw-bold" id="eim-title">明細を編集</h6>
        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="eim-poi-id">
        <div class="row g-2">
          <div class="col-6">
            <label class="form-label form-label-sm mb-1 fw-semibold">品目</label>
            <input id="eim-item-category" class="form-control form-control-sm">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1 fw-semibold">メーカー</label>
            <input id="eim-manufacturer" class="form-control form-control-sm">
          </div>
          <div class="col-12">
            <label class="form-label form-label-sm mb-1 fw-semibold">商品名 <span class="text-danger">*</span></label>
            <input id="eim-product-name" class="form-control form-control-sm">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">仕様</label>
            <input id="eim-spec" class="form-control form-control-sm" placeholder="例: 20cm">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">色</label>
            <input id="eim-color" class="form-control form-control-sm" placeholder="例: ホワイト">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">種類</label>
            <input id="eim-club-type" class="form-control form-control-sm">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">数量 <span class="text-danger">*</span></label>
            <input id="eim-quantity" type="number" min="1" class="form-control form-control-sm text-center">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">定価</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">¥</span>
              <input id="eim-list-price" type="number" min="0" class="form-control text-end">
            </div>
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">掛率</label>
            <input id="eim-rate" type="number" min="0" max="1" step="0.001" class="form-control form-control-sm text-end" placeholder="例: 0.55">
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">単価</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text">¥</span>
              <input id="eim-unit-price" type="number" min="0" class="form-control text-end" placeholder="自動計算">
            </div>
          </div>
          <div class="col-6">
            <label class="form-label form-label-sm mb-1">備考</label>
            <input id="eim-line-note" class="form-control form-control-sm">
          </div>
        </div>
      </div>
      <div class="modal-footer py-2">
        <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">キャンセル</button>
        <button type="button" class="btn btn-primary btn-sm px-4" id="eim-submit">
          <i class="fas fa-save me-1"></i>保存
        </button>
      </div>
    </div>
  </div>
</div>` : ''

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

// CC候補ボタン → CC入力欄にアドレスを追加/削除（発注詳細画面）
document.querySelectorAll('.detail-cc-candidate').forEach(function(btn){
  btn.addEventListener('click', function(){
    var ccInp = document.getElementById('email-cc-input');
    if(!ccInp) return;
    var addr = btn.dataset.addr || '';
    var cur = ccInp.value.trim();
    var addrs = cur ? cur.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];
    var idx = addrs.indexOf(addr);
    if(idx >= 0){
      addrs.splice(idx, 1);
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-outline-secondary');
    } else {
      addrs.push(addr);
      btn.classList.remove('btn-outline-secondary');
      btn.classList.add('btn-secondary');
    }
    ccInp.value = addrs.join(', ');
    ccInp.dispatchEvent(new Event('input'));
  });
});

// CC入力 → mailtoリンクをリアルタイム更新
(function(){
  var ccInput  = document.getElementById('email-cc-input');
  var mailto   = document.getElementById('btn-mailto');
  var bodyTa   = document.getElementById('email-body-ta');
  var subjSpan = document.getElementById('email-subject-span');
  var SUPPLIER_EMAIL = '${esc(supplierEmail)}';
  if (!ccInput || !mailto || !SUPPLIER_EMAIL) return;

  function rebuildMailto() {
    var cc      = ccInput.value.trim();
    var subject = subjSpan ? subjSpan.textContent : '';
    var body    = bodyTa   ? bodyTa.value         : '';
    var qs = 'subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    if (cc) qs += '&cc=' + encodeURIComponent(cc);
    mailto.href = 'mailto:' + SUPPLIER_EMAIL + '?' + qs;
  }

  ccInput.addEventListener('input', rebuildMailto);
  // 初期化（bodyTaの値が入ってから実行）
  rebuildMailto();
})();

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
    if(r.ok){
      showFlash(label+'に更新しました','success');
      // 「発注済」に変更した場合: 同一顧客の次の発注メールを確認
      if(status === 'ordered'){
        try {
          var d = await r.json();
          if(d.next_mail_batch){
            setTimeout(function(){
              if(confirm('同じお客様の別仕入先への発注メールがあります。続けて処理しますか？')){
                location.href = '/mail-batch/' + d.next_mail_batch;
              } else {
                location.reload();
              }
            }, 600);
          } else if(d.next_order_id){
            setTimeout(function(){
              if(confirm('同じお客様の別仕入先への発注があります。続けて処理しますか？')){
                location.href = '/orders/' + d.next_order_id;
              } else {
                location.reload();
              }
            }, 600);
          } else {
            setTimeout(function(){ location.reload(); }, 900);
          }
        } catch(e2) {
          setTimeout(function(){ location.reload(); }, 900);
        }
      } else {
        setTimeout(function(){ location.reload(); }, 900);
      }
    }
    else { showFlash('更新に失敗しました','danger'); btn.disabled=false; }
  });
}
bindStatus('btn-s-ordered','ordered','発注済');
bindStatus('btn-s-completed','completed','完納');
bindStatus('btn-s-cancelled','cancelled','キャンセル');

// テンプレート再生成ボタン
(function(){
  var regenBtn = document.getElementById('btn-regen-mail');
  if (!regenBtn) return;
  regenBtn.addEventListener('click', async function(){
    regenBtn.disabled = true;
    regenBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>生成中...';
    try {
      var r = await fetch('/api/orders/${id}/regenerate-mail', {method:'POST'});
      var d = await r.json();
      if (r.ok) {
        // テキストエリア・件名スパンを更新
        var ta = document.getElementById('email-body-ta') || document.getElementById('line-body-ta') || document.getElementById('fax-body-ta');
        if (ta) ta.value = d.body || '';
        var subj = document.getElementById('email-subject-span');
        if (subj) subj.textContent = d.subject || '';
        // mailtoリンクを更新（CC値も保持）
        var mailto = document.getElementById('btn-mailto');
        if (mailto && '${supplierEmail}') {
          var ccInp = document.getElementById('email-cc-input');
          var cc = ccInp ? ccInp.value.trim() : '';
          var qs2 = 'subject=' + encodeURIComponent(d.subject||'') + '&body=' + encodeURIComponent(d.body||'');
          if (cc) qs2 += '&cc=' + encodeURIComponent(cc);
          mailto.href = 'mailto:${esc(supplierEmail)}?' + qs2;
        }
        // アラートを非表示
        var alert = document.getElementById('no-body-alert');
        if (alert) alert.style.display = 'none';
        showFlash('テンプレートを生成しました', 'success');
      } else {
        showFlash(d.error || 'テンプレートの生成に失敗しました', 'danger');
        regenBtn.disabled = false;
        regenBtn.innerHTML = '<i class="fas fa-magic me-1"></i>テンプレートを生成する';
      }
    } catch(e) {
      showFlash('通信エラーが発生しました', 'danger');
      regenBtn.disabled = false;
      regenBtn.innerHTML = '<i class="fas fa-magic me-1"></i>テンプレートを生成する';
    }
  });
})();

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

// 発注削除
document.getElementById('btn-delete-order').addEventListener('click', async function(){
  var orderNo = '${esc(String(order['order_no']))}';
  if(!confirm('発注「' + orderNo + '」を削除しますか？\\n\\n入荷履歴も含めて完全に削除されます。\\nこの操作は取り消せません。')) return;
  this.disabled=true;
  this.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>削除中...';
  var r = await fetch('/api/orders/${id}',{method:'DELETE'});
  if(r.ok){
    showFlash('発注を削除しました','success');
    setTimeout(function(){ location.href='/orders'; },900);
  } else {
    var d = await r.json().catch(function(){ return {}; });
    showFlash(d.error||'削除に失敗しました','danger');
    this.disabled=false;
    this.innerHTML='<i class="fas fa-trash-alt me-1"></i>削除';
  }
});

// ============================================================
// 商品追加モーダル（下書き/プール状態のみ）
// ============================================================
(function(){
  if (typeof AIM_PRODUCTS === 'undefined') return; // 編集不可ステータスでは何もしない

  var ORDER_ID   = ${id};
  var products   = AIM_PRODUCTS;   // [{id, item_category, maker_name, product_name, spec, color, list_price, default_rate}, ...]
  var suppliers  = AIM_SUPPLIERS;  // [{id, name}, ...]

  // --- DOM refs ---
  var modal      = document.getElementById('addItemModal');
  var bsModal    = new bootstrap.Modal(modal);
  var titleEl    = document.getElementById('aim-title');
  var bodyEl     = document.getElementById('aim-body');
  var backBtn    = document.getElementById('aim-back');
  var searchWrap = document.getElementById('aim-search-wrap');
  var searchInp  = document.getElementById('aim-search');
  var formArea   = document.getElementById('aim-form-area');
  var pnameInp   = document.getElementById('aim-pname');
  var colorInp   = document.getElementById('aim-color');
  var qtyInp     = document.getElementById('aim-qty');
  var listPriceInp = document.getElementById('aim-list-price');
  var rateInp    = document.getElementById('aim-rate');
  var unitPriceInp = document.getElementById('aim-unit-price');
  var noteInp    = document.getElementById('aim-note');
  var submitBtn  = document.getElementById('aim-submit');
  var backFormBtn = document.getElementById('aim-back-form');

  // --- 状態 ---
  var step = 'category'; // 'category' | 'maker' | 'product' | 'form'
  var selCategory = null;
  var selMaker    = null;
  var selProduct  = null; // nullのとき=マスタ外
  var isFreeMode  = false;
  var freeSupplierId = null;

  // --- ユーティリティ ---
  function uniqueSorted(arr){ return arr.filter(function(v,i,a){ return v && a.indexOf(v)===i; }).sort(); }
  function filtered(keyword){
    var kw = keyword.trim().toLowerCase();
    return products.filter(function(p){
      if(selCategory && p.item_category !== selCategory) return false;
      if(selMaker    && p.maker_name    !== selMaker)    return false;
      if(!kw) return true;
      return (p.product_name||'').toLowerCase().indexOf(kw)>=0
          || (p.spec||'').toLowerCase().indexOf(kw)>=0
          || (p.color||'').toLowerCase().indexOf(kw)>=0;
    });
  }

  function listItem(label, onClick, badge){
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
    btn.innerHTML = label + (badge ? ' <span class="badge bg-secondary rounded-pill">'+badge+'</span>' : '');
    btn.addEventListener('click', onClick);
    return btn;
  }

  // --- ステップ描画 ---
  function showCategory(){
    step = 'category'; selCategory = null; selMaker = null; selProduct = null; isFreeMode = false;
    titleEl.textContent = 'カテゴリーを選択';
    backBtn.style.display = 'none';
    searchWrap.style.display = 'none';
    formArea.classList.add('d-none');
    bodyEl.innerHTML = '';
    var lg = document.createElement('div');
    lg.className = 'list-group list-group-flush';

    // マスタ外商品ボタン
    var freeBtn = document.createElement('button');
    freeBtn.type = 'button';
    freeBtn.className = 'list-group-item list-group-item-action text-success fw-semibold';
    freeBtn.innerHTML = '<i class="fas fa-pen me-2"></i>マスタ外商品を直接入力する';
    freeBtn.addEventListener('click', function(){ showFreeForm(); });
    lg.appendChild(freeBtn);

    var cats = uniqueSorted(products.map(function(p){ return p.item_category; }));
    cats.forEach(function(cat){
      var cnt = products.filter(function(p){ return p.item_category===cat; }).length;
      lg.appendChild(listItem(cat, function(){ selCategory=cat; showMaker(); }, cnt));
    });
    bodyEl.appendChild(lg);
  }

  function showMaker(){
    step = 'maker'; selMaker = null; selProduct = null;
    titleEl.textContent = selCategory + ' › メーカー';
    backBtn.style.display = '';
    searchWrap.style.display = 'none';
    formArea.classList.add('d-none');
    bodyEl.innerHTML = '';
    var lg = document.createElement('div');
    lg.className = 'list-group list-group-flush';
    var makers = uniqueSorted(products.filter(function(p){ return p.item_category===selCategory; }).map(function(p){ return p.maker_name; }));
    makers.forEach(function(mk){
      var cnt = products.filter(function(p){ return p.item_category===selCategory && p.maker_name===mk; }).length;
      lg.appendChild(listItem(mk, function(){ selMaker=mk; showProduct(); }, cnt));
    });
    bodyEl.appendChild(lg);
  }

  function showProduct(){
    step = 'product'; selProduct = null;
    titleEl.textContent = selMaker + ' › 商品';
    backBtn.style.display = '';
    searchWrap.style.display = '';
    searchInp.value = '';
    formArea.classList.add('d-none');
    renderProductList('');
    searchInp.oninput = function(){ renderProductList(searchInp.value); };
  }

  function renderProductList(kw){
    bodyEl.innerHTML = '';
    var lg = document.createElement('div');
    lg.className = 'list-group list-group-flush';
    var list = filtered(kw);
    if(list.length === 0){
      lg.innerHTML = '<div class="text-center text-muted py-3 small">該当商品がありません</div>';
    } else {
      list.forEach(function(p){
        var label = p.product_name + (p.spec ? ' / '+p.spec : '') + (p.color ? ' <span class="text-muted small">['+p.color+']</span>' : '');
        lg.appendChild(listItem(label, function(){ selProduct=p; showForm(false); }));
      });
    }
    bodyEl.appendChild(lg);
  }

  function showFreeForm(){
    isFreeMode = true; selProduct = null;
    step = 'form';
    titleEl.textContent = 'マスタ外商品を入力';
    backBtn.style.display = '';
    searchWrap.style.display = 'none';
    bodyEl.innerHTML = '';

    // 仕入先セレクトを動的に挿入
    var supplierWrap = document.getElementById('aim-supplier-wrap');
    if(!supplierWrap){
      var col = document.createElement('div');
      col.className = 'col-12';
      col.id = 'aim-supplier-wrap';
      col.innerHTML = '<label class="form-label form-label-sm mb-1 fw-semibold">仕入先 <span class="text-danger">*</span></label>'
        + '<select id="aim-supplier-sel" class="form-select form-select-sm">'
        + '<option value="">-- 仕入先を選択 --</option>'
        + suppliers.map(function(s){ return '<option value="'+s.id+'">'+s.name+'</option>'; }).join('')
        + '</select>';
      var rowDiv = formArea.querySelector('.row.g-2.w-100');
      if(rowDiv) rowDiv.insertBefore(col, rowDiv.firstChild);
    }

    pnameInp.readOnly = false;
    pnameInp.value = '';
    pnameInp.placeholder = '商品名を入力';
    colorInp.value = '';
    qtyInp.value = '1';
    listPriceInp.value = '';
    rateInp.value = '';
    unitPriceInp.value = '';
    noteInp.value = '';
    formArea.classList.remove('d-none');
  }

  function showForm(fromSearch){
    isFreeMode = false;
    step = 'form';
    var p = selProduct;
    titleEl.textContent = p.product_name;
    backBtn.style.display = '';
    searchWrap.style.display = 'none';
    bodyEl.innerHTML = '';

    // 仕入先セレクトを削除（マスタ内商品では不要）
    var supplierWrap = document.getElementById('aim-supplier-wrap');
    if(supplierWrap) supplierWrap.remove();

    pnameInp.readOnly = true;
    pnameInp.value = p.product_name + (p.spec ? ' / '+p.spec : '');
    colorInp.value = p.color || '';
    qtyInp.value = '1';
    listPriceInp.value = p.list_price != null ? p.list_price : '';
    rateInp.value = p.default_rate != null ? p.default_rate : '';
    // 単価を自動計算
    if(p.list_price && p.default_rate){
      unitPriceInp.value = Math.round(p.list_price * p.default_rate);
    } else {
      unitPriceInp.value = '';
    }
    noteInp.value = '';
    formArea.classList.remove('d-none');
  }

  // 定価×掛率 → 単価 自動計算
  function calcUnitPrice(){
    var lp = parseFloat(listPriceInp.value);
    var rt = parseFloat(rateInp.value);
    if(!isNaN(lp) && !isNaN(rt)){
      unitPriceInp.value = Math.round(lp * rt);
    }
  }
  listPriceInp.addEventListener('input', calcUnitPrice);
  rateInp.addEventListener('input', calcUnitPrice);

  // --- 戻るボタン ---
  backBtn.addEventListener('click', function(){
    if(step === 'maker')   { showCategory(); }
    else if(step === 'product') { showMaker(); }
    else if(step === 'form'){
      if(isFreeMode){ showCategory(); }
      else          { showProduct(); }
    }
  });
  backFormBtn.addEventListener('click', function(){
    if(isFreeMode){ showCategory(); }
    else          { showProduct(); }
  });

  // --- 商品追加ボタン ---
  submitBtn.addEventListener('click', async function(){
    var qty = parseInt(qtyInp.value, 10);
    if(isNaN(qty) || qty < 1){ showFlash('数量を正しく入力してください', 'warning'); return; }

    var unitPrice = parseFloat(unitPriceInp.value);
    if(isNaN(unitPrice) || unitPrice < 0){ showFlash('単価を入力してください', 'warning'); return; }

    var payload = {
      quantity:   qty,
      unit_price: unitPrice,
      list_price: parseFloat(listPriceInp.value) || null,
      rate:       parseFloat(rateInp.value)       || null,
      note:       noteInp.value.trim() || null,
      color:      colorInp.value.trim() || null,
    };

    if(isFreeMode){
      // マスタ外
      var pname = pnameInp.value.trim();
      if(!pname){ showFlash('商品名を入力してください', 'warning'); return; }
      var sel = document.getElementById('aim-supplier-sel');
      var suppId = sel ? parseInt(sel.value, 10) : NaN;
      if(isNaN(suppId) || !suppId){ showFlash('仕入先を選択してください', 'warning'); return; }
      payload.product_name = pname;
      payload.supplier_id  = suppId;
    } else {
      // マスタ内
      var p = selProduct;
      payload.product_id   = p.id;
      payload.product_name = p.product_name + (p.spec ? ' / '+p.spec : '');
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>追加中...';

    try {
      var r = await fetch('/api/orders/' + ORDER_ID + '/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      var d = await r.json();
      if(r.ok){
        bsModal.hide();
        showFlash('商品を追加しました', 'success');
        // 明細テーブルと合計金額を更新するためページリロード
        setTimeout(function(){ location.reload(); }, 800);
      } else {
        showFlash(d.error || '追加に失敗しました', 'danger');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-plus me-1"></i>この商品を追加する';
      }
    } catch(e){
      showFlash('通信エラーが発生しました', 'danger');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-plus me-1"></i>この商品を追加する';
    }
  });

  // モーダルを開くたびに初期化
  modal.addEventListener('show.bs.modal', function(){
    // 仕入先セレクト残骸を削除
    var sw = document.getElementById('aim-supplier-wrap');
    if(sw) sw.remove();
    pnameInp.readOnly = true;
    pnameInp.placeholder = '';
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-plus me-1"></i>この商品を追加する';
    showCategory();
  });

  // 「商品を追加」ボタンからモーダルを開く
  var openBtn = document.getElementById('btn-add-item');
  if(openBtn){
    openBtn.addEventListener('click', function(){ bsModal.show(); });
  }
})();

// ============================================================
// 明細編集・削除（isEditableのときのみ動作）
// ============================================================
(function(){
  var editModal = document.getElementById('editItemModal');
  if (!editModal) return;
  var bsEdit = new bootstrap.Modal(editModal);

  // --- 編集フォームDOM ---
  var ePoiId    = document.getElementById('eim-poi-id');
  var eTitle    = document.getElementById('eim-title');
  var eIC       = document.getElementById('eim-item-category');
  var eMF       = document.getElementById('eim-manufacturer');
  var ePN       = document.getElementById('eim-product-name');
  var eSpec     = document.getElementById('eim-spec');
  var eColor    = document.getElementById('eim-color');
  var eCT       = document.getElementById('eim-club-type');
  var eQty      = document.getElementById('eim-quantity');
  var eLP       = document.getElementById('eim-list-price');
  var eRate     = document.getElementById('eim-rate');
  var eUP       = document.getElementById('eim-unit-price');
  var eNote     = document.getElementById('eim-line-note');
  var eSubmit   = document.getElementById('eim-submit');

  // 定価×掛率 → 単価 自動計算
  function calcUP(){
    var lp = parseFloat(eLP.value);
    var rt = parseFloat(eRate.value);
    if (!isNaN(lp) && !isNaN(rt)) eUP.value = Math.round(lp * rt);
  }
  eLP.addEventListener('input', calcUP);
  eRate.addEventListener('input', calcUP);

  // 「編集」ボタン → モーダルを開いてデータをセット
  document.querySelectorAll('.btn-edit-item').forEach(function(btn){
    btn.addEventListener('click', function(){
      var d = btn.dataset;
      ePoiId.value  = d.poiId;
      eTitle.textContent = '明細を編集: ' + d.productName;
      eIC.value     = d.itemCategory  || '';
      eMF.value     = d.manufacturer  || '';
      ePN.value     = d.productName   || '';
      eSpec.value   = d.spec          || '';
      eColor.value  = d.color         || '';
      eCT.value     = d.clubType      || '';
      eQty.value    = d.quantity      || '1';
      eLP.value     = d.listPrice     || '';
      eRate.value   = d.rate          || '';
      eUP.value     = d.unitPrice     || '';
      eNote.value   = d.lineNote      || '';
      eSubmit.disabled = false;
      eSubmit.innerHTML = '<i class="fas fa-save me-1"></i>保存';
      bsEdit.show();
    });
  });

  // 「保存」ボタン
  eSubmit.addEventListener('click', async function(){
    var poiId = ePoiId.value;
    if (!poiId) return;
    if (!ePN.value.trim()) { showFlash('商品名は必須です', 'warning'); return; }
    var qty = parseInt(eQty.value, 10);
    if (isNaN(qty) || qty < 1) { showFlash('数量は1以上を入力してください', 'warning'); return; }

    eSubmit.disabled = true;
    eSubmit.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>保存中...';

    var payload = {
      item_category: eIC.value.trim()   || null,
      manufacturer:  eMF.value.trim()   || null,
      product_name:  ePN.value.trim(),
      spec:          eSpec.value.trim()  || null,
      color:         eColor.value.trim() || null,
      club_type:     eCT.value.trim()    || null,
      quantity:      qty,
      list_price:    parseFloat(eLP.value)   || null,
      rate:          parseFloat(eRate.value) || null,
      unit_price:    parseFloat(eUP.value)   || null,
      line_note:     eNote.value.trim()  || null,
    };

    try {
      var r = await fetch('/api/items/' + poiId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      var d = await r.json();
      if (r.ok) {
        bsEdit.hide();
        showFlash('明細を保存しました', 'success');
        setTimeout(function(){ location.reload(); }, 700);
      } else {
        showFlash(d.error || '保存に失敗しました', 'danger');
        eSubmit.disabled = false;
        eSubmit.innerHTML = '<i class="fas fa-save me-1"></i>保存';
      }
    } catch(e) {
      showFlash('通信エラーが発生しました', 'danger');
      eSubmit.disabled = false;
      eSubmit.innerHTML = '<i class="fas fa-save me-1"></i>保存';
    }
  });

  // 「削除」ボタン
  document.querySelectorAll('.btn-delete-item').forEach(function(btn){
    btn.addEventListener('click', async function(){
      var poiId = btn.dataset.poiId;
      var name  = btn.dataset.productName || '（不明）';
      if (!confirm('「' + name + '」を削除しますか？\\nこの操作は取り消せません。')) return;
      btn.disabled = true;

      try {
        var r = await fetch('/api/items/' + poiId, {
          method: 'DELETE',
          credentials: 'include',
        });
        var d = await r.json();
        if (r.ok) {
          showFlash('明細を削除しました', 'success');
          setTimeout(function(){ location.reload(); }, 700);
        } else {
          showFlash(d.error || '削除に失敗しました', 'danger');
          btn.disabled = false;
        }
      } catch(e) {
        showFlash('通信エラーが発生しました', 'danger');
        btn.disabled = false;
      }
    });
  });
})();
</script>`

  const content = `
<!-- ページヘッダ -->
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-file-alt me-2" style="color:var(--gw-green)"></i>発注詳細</h1>
    <div class="d-flex align-items-center gap-2 flex-wrap">
      <span class="page-subtitle mb-0">${esc(order['order_no'])}</span>
      <span style="color:var(--gw-border)">|</span>
      <strong style="font-size:0.85rem">${esc(order['supplier_name'])}</strong>
      ${statusBadge(curStatus)}
    </div>
  </div>
  <div class="actions">
    ${showButtons.join('')}
    <a class="btn btn-sm btn-outline-secondary" href="/orders/${id}/edit"><i class="fas fa-edit me-1"></i>発注編集</a>
    <a class="btn btn-sm btn-outline-secondary" href="/receipts/new/${id}"><i class="fas fa-truck me-1"></i>納品登録</a>
    <button class="btn btn-sm btn-outline-secondary" id="btn-copy-order"><i class="fas fa-copy me-1"></i>再発注</button>
    <button class="btn btn-sm btn-outline-danger" id="btn-delete-order"><i class="fas fa-trash-alt me-1"></i>削除</button>
    <a class="btn btn-sm btn-outline-secondary" href="/orders"><i class="fas fa-arrow-left me-1"></i>一覧へ</a>
  </div>
</div>

<!-- 上段: ヘッダ情報 + 発注方法別パネル -->
<div class="row g-3 mb-3">
  <div class="col-lg-4">
    <div class="card h-100">
      <div class="card-header"><span class="card-title"><i class="fas fa-info-circle"></i>発注情報</span></div>
      <div class="card-body py-2">
        <dl class="row mb-0 small">
          <dt class="col-5 text-muted">発注日</dt><dd class="col-7 fw-semibold">${esc(order['order_date'])}</dd>
          <dt class="col-5 text-muted">発注者</dt><dd class="col-7">${esc(order['ordered_by'])}</dd>
          <dt class="col-5 text-muted">顧客名</dt><dd class="col-7">${esc(order['customer_name'])||'―'}</dd>
          <dt class="col-5 text-muted">用途</dt><dd class="col-7">${esc(order['usage_type'])||'―'}</dd>
          <dt class="col-5 text-muted">希望納期</dt><dd class="col-7">${esc(order['requested_delivery_date'])||'―'}</dd>
          <dt class="col-5">合計金額</dt><dd class="col-7 fw-bold" style="font-size:1rem;color:var(--gw-green)">${yen(totalAmount)}</dd>
          <dt class="col-5 text-muted">担当者</dt><dd class="col-7">${esc(order['contact_name'])||''} ${esc(order['honorific'])||''}</dd>
          <dt class="col-5 text-muted">発注方法</dt><dd class="col-7">${esc(order['order_method'])||'―'}</dd>
          <dt class="col-5 text-muted">備考</dt><dd class="col-7 text-muted">${esc(order['order_note'])||'―'}</dd>
          ${order['supplier_shipping_rule'] ? `<dt class="col-5 text-muted">送料条件</dt><dd class="col-7"><span class="badge bg-info text-dark"><i class="fas fa-truck me-1"></i>${esc(order['supplier_shipping_rule'])}</span></dd>` : ''}
          ${order['supplier_notes'] ? `<dt class="col-5 text-warning"><i class="fas fa-exclamation-triangle"></i> 仕入先備考</dt><dd class="col-7"><div class="alert alert-warning py-1 px-2 mb-0 small">${esc(order['supplier_notes']).replace(/\n/g,'<br>')}</div></dd>` : ''}
        </dl>
      </div>
    </div>
  </div>
  <div class="col-lg-8">
    <div class="card h-100">
      <div class="card-header">
        <span class="card-title"><i class="${orderPanelIcon} me-1"></i>${orderPanelTitle}</span>
        <span class="ms-2 badge bg-light text-dark border small">${esc(order['order_method'])||'方法未設定'}</span>
      </div>
      <div class="card-body">${orderPanel}</div>
    </div>
  </div>
</div>

<!-- 発注明細 -->
<div class="card mb-3">
  <div class="card-header d-flex justify-content-between align-items-center">
    <span class="card-title"><i class="fas fa-table me-1"></i>発注明細</span>
    <div class="d-flex align-items-center gap-2">
      ${isEditable ? `<button class="btn btn-sm btn-primary" id="btn-add-item"><i class="fas fa-plus me-1"></i>商品を追加</button>` : ''}
      <span class="badge text-bg-secondary">${items.results.length} 品目 / 合計 ${yen(totalAmount)}</span>
    </div>
  </div>
  <div class="table-responsive">
    <table class="table table-sm table-hover align-middle mb-0" id="order-items-table">
      <thead><tr>
        <th>品目</th><th>メーカー</th><th>商品名</th><th>仕様・色</th><th>種類</th>
        <th class="text-center">発注数</th>
        <th class="text-center">入荷済</th>
        <th class="text-center">残数</th>
        <th class="text-end">単価</th><th class="text-end">金額</th><th>備考</th>
        ${isEditable ? '<th class="text-center" style="width:70px">操作</th>' : ''}
      </tr></thead>
      <tbody id="order-items-tbody">${itemRows || '<tr><td colspan="11" class="text-center text-muted py-3">明細がありません。</td></tr>'}</tbody>
    </table>
  </div>
</div>

<!-- 納品履歴 -->
<div class="card">
  <div class="card-header d-flex justify-content-between align-items-center">
    <div class="d-flex align-items-center gap-2">
      <span class="card-title"><i class="fas fa-truck me-1"></i>納品履歴</span>
      <span id="receipt-updating" class="spinner-border spinner-border-sm" style="display:none;color:var(--gw-green)" title="更新中"></span>
    </div>
    <a class="btn btn-sm btn-outline-secondary" href="/receipts/new/${id}"><i class="fas fa-plus me-1"></i>納品登録</a>
  </div>
  <div class="table-responsive">
    <table class="table table-sm mb-0">
      <thead><tr><th>入荷日</th><th>納品書日付</th><th>検品者</th><th>備考</th></tr></thead>
      <tbody id="receipt-tbody">${receiptRows}</tbody>
    </table>
  </div>
</div>`
  const o9 = getLayoutOpts(c)
  return layout(`発注詳細 ${esc(order['order_no'])}`, dataScript + addItemModalHtml + editItemModalHtml + content, scripts, o9.username, o9)
})

// ============================================================
// 納品履歴
// ============================================================
app.get('/receipts', async (c) => {
  const db = c.env.DB
  const { tenantId } = getLayoutOpts(c)

  // 絞り込みパラメータ
  const from       = c.req.query('from')        || ''
  const to         = c.req.query('to')          || ''
  const supplierId = c.req.query('supplier_id') || ''
  const slipCheck  = c.req.query('slip_check')  || ''  // '' | 'unchecked' | 'no_slip' | 'verified'
  const flash      = c.req.query('flash')        || ''

  // 絞り込み付きクエリ（actual_supplier_id優先で表示仕入先を決定）
  let sql = `
    SELECT r.id, r.received_date, r.slip_date, r.inspected_by, r.note,
           r.slip_verified, r.no_slip, r.slip_checked_by, r.slip_note,
           po.order_no, po.id AS purchase_order_id, po.customer_name,
           COALESCE(sa.name, s.name) AS supplier_name,
           COALESCE(sa.id,   s.id)   AS supplier_id,
           CASE WHEN r.actual_supplier_id IS NOT NULL THEN 1 ELSE 0 END AS supplier_changed,
           COUNT(ri.id) AS item_count,
           SUM(ri.received_quantity) AS total_qty,
           SUM(ri.received_quantity * COALESCE(poi.unit_price, 0)) AS total_amount
    FROM receipts r
    LEFT JOIN purchase_orders po ON r.purchase_order_id=po.id
    LEFT JOIN suppliers s  ON po.supplier_id=s.id
    LEFT JOIN suppliers sa ON r.actual_supplier_id=sa.id
    LEFT JOIN receipt_items ri ON ri.receipt_id=r.id
    LEFT JOIN purchase_order_items poi ON ri.purchase_order_item_id=poi.id
    WHERE r.tenant_id=?`
  const binds: unknown[] = [tenantId]
  if (from) { sql += ` AND r.received_date >= ?`; binds.push(from) }
  if (to)   { sql += ` AND r.received_date <= ?`; binds.push(to) }
  if (supplierId) { sql += ` AND (po.supplier_id = ? OR r.actual_supplier_id = ?)`; binds.push(Number(supplierId)); binds.push(Number(supplierId)) }
  if (slipCheck === 'unchecked') { sql += ` AND r.slip_verified=0 AND r.no_slip=0` }
  else if (slipCheck === 'no_slip')  { sql += ` AND r.no_slip=1` }
  else if (slipCheck === 'verified') { sql += ` AND r.slip_verified=1` }
  sql += ` GROUP BY r.id, po.id, s.id, sa.id ORDER BY r.received_date DESC, r.id DESC LIMIT 300`

  const [supplierRes, res] = await Promise.all([
    db.prepare('SELECT id, name FROM suppliers WHERE tenant_id=? ORDER BY name').bind(tenantId).all<Record<string,unknown>>(),
    db.prepare(sql).bind(...binds).all<Record<string,unknown>>()
  ])
  const supplierOptions = supplierRes.results.map(s =>
    `<option value="${esc(s['id'])}" ${supplierId === String(s['id']) ? 'selected' : ''}>${esc(s['name'])}</option>`
  ).join('')

  // サマリー計算
  const totalQty      = res.results.reduce((s, r) => s + (Number(r['total_qty'])    || 0), 0)
  const totalAmount   = res.results.reduce((s, r) => s + (Number(r['total_amount']) || 0), 0)
  const uncheckedCount = res.results.filter(r => !r['slip_verified'] && !r['no_slip']).length
  const noSlipCount    = res.results.filter(r =>  r['no_slip']).length

  // 納品書チェックバッジ関数
  const slipBadge = (r: Record<string,unknown>) => {
    if (r['no_slip'])       return `<span class="badge bg-secondary" title="${esc(r['slip_note'])||''}"><i class="fas fa-file-slash me-1"></i>納品書なし</span>`
    if (r['slip_verified']) return `<span class="badge bg-success"   title="確認者: ${esc(r['slip_checked_by'])||'―'}"><i class="fas fa-check me-1"></i>確認済</span>`
    return `<span class="badge bg-warning text-dark"><i class="fas fa-exclamation me-1"></i>未確認</span>`
  }

  const rows = res.results.map(r => `<tr class="${(!r['slip_verified'] && !r['no_slip']) ? 'table-warning' : ''}">
    <td class="fw-semibold">${esc(r['received_date'])}</td>
    <td class="text-muted">${esc(r['slip_date']) || '―'}</td>
    <td>
      ${r['purchase_order_id']
        ? `<a href="/orders/${r['purchase_order_id']}" class="text-decoration-none fw-semibold">${esc(r['order_no'])}</a>`
        : `<span class="badge bg-secondary">システム外</span>`
      }
    </td>
    <td>
      ${r['supplier_name'] ? esc(r['supplier_name']) : '<span class="text-muted">―</span>'}
      ${r['supplier_changed'] ? `<span class="badge bg-info text-dark ms-1" title="発注時と仕入先が異なります"><i class="fas fa-exchange-alt"></i></span>` : ''}
    </td>
    <td>${esc(r['customer_name']) || '―'}</td>
    <td class="text-center">${esc(r['item_count'])}</td>
    <td class="text-end">${Number(r['total_qty'])||0} 個</td>
    <td class="text-end fw-semibold">${yen(r['total_amount'])}</td>
    <td class="text-center">${slipBadge(r)}</td>
    <td>${esc(r['inspected_by']) || '―'}</td>
    <td style="white-space:nowrap">
      <a href="/receipts/${r['id']}/edit" class="btn btn-xs btn-outline-primary py-0 px-2">
        <i class="fas fa-edit"></i> 編集
      </a>
    </td>
  </tr>`).join('')

  // ダウンロードURL組み立て
  const dlParams = new URLSearchParams()
  if (from) dlParams.set('from', from)
  if (to)   dlParams.set('to', to)
  if (supplierId) dlParams.set('supplier_id', supplierId)
  const dlUrl = `/api/receipts/download${dlParams.toString() ? '?' + dlParams.toString() : ''}`

  const slipCheckOptions = [
    { val: '',          label: '― すべて ―' },
    { val: 'unchecked', label: '⚠ 未確認のみ' },
    { val: 'verified',  label: '✓ 確認済のみ' },
    { val: 'no_slip',   label: '□ 納品書なしのみ' },
  ].map(o => `<option value="${o.val}" ${slipCheck === o.val ? 'selected' : ''}>${o.label}</option>`).join('')

  const content = `
${flash ? `<div class="alert alert-success alert-dismissible fade show py-2" role="alert">
  <i class="fas fa-check-circle me-1"></i>${esc(flash)}
  <button type="button" class="btn-close py-2" data-bs-dismiss="alert"></button>
</div>` : ''}
${uncheckedCount > 0 ? `<div class="alert alert-warning py-2 mb-3 d-flex align-items-center gap-2">
  <i class="fas fa-exclamation-triangle fa-lg"></i>
  <span>納品書未確認が <strong>${uncheckedCount}件</strong> あります。
    <a href="/receipts?slip_check=unchecked" class="alert-link ms-2">未確認のみ表示</a>
  </span>
</div>` : ''}
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-truck me-2" style="color:var(--gw-green)"></i>納品履歴</h1>
    <p class="page-subtitle">登録済みの納品データ一覧です。黄色行は納品書未確認。</p>
  </div>
  <div class="actions">
    <a href="/receipts/free" class="btn btn-outline-secondary">
      <i class="fas fa-plus me-1"></i>システム外発注納品
    </a>
    <a href="${dlUrl}" class="btn btn-primary">
      <i class="fas fa-file-excel me-1"></i>Excel DL
    </a>
  </div>
</div>

<!-- フィルタカード -->
<div class="card mb-3">
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
      <div class="col-auto">
        <label class="form-label form-label-sm mb-1">納品書チェック</label>
        <select name="slip_check" class="form-select form-select-sm" style="min-width:150px">
          ${slipCheckOptions}
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
  ${uncheckedCount > 0 ? `<span class="badge bg-warning text-dark fs-6 fw-normal px-3 py-2">
    <i class="fas fa-exclamation-triangle me-1"></i>納品書未確認: <strong>${uncheckedCount}</strong> 件
  </span>` : ''}
  ${noSlipCount > 0 ? `<span class="badge bg-secondary fs-6 fw-normal px-3 py-2">
    <i class="fas fa-file-slash me-1"></i>納品書なし: <strong>${noSlipCount}</strong> 件
  </span>` : ''}
</div>

<div class="card">
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0 small">
      <thead>
        <tr>
          <th>入荷日</th><th>納品書日付</th><th>発注番号</th><th>仕入先</th>
          <th>顧客名</th><th class="text-center">品目数</th>
          <th class="text-end">入荷数</th><th class="text-end">金額</th>
          <th class="text-center">納品書</th><th>検品者</th><th>操作</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="11" class="text-center text-muted py-4">納品履歴がありません。</td></tr>'}</tbody>
    </table>
  </div>
</div>`
  const o10 = getLayoutOpts(c)
  return layout('納品履歴', content, '', o10.username, o10)
})

// ============================================================
// 納品登録フォーム（＝検品フロー統合）  ★ /receipts より後・/receipts/:id の前に定義
// ============================================================
app.get('/receipts/new/:order_id', async (c) => {
  const db = c.env.DB
  const { tenantId } = getLayoutOpts(c)
  const orderId = parseInt(c.req.param('order_id'))
  if (isNaN(orderId)) return layout('エラー', '<div class="alert alert-danger">不正なIDです。</div>', '', '', getLayoutOpts(c))

  const [order, itemsRes, supplierRes] = await Promise.all([
    db.prepare(`
      SELECT po.*, s.name AS supplier_name, s.payment_method
      FROM purchase_orders po
      JOIN suppliers s ON po.supplier_id=s.id
      WHERE po.id=? AND po.tenant_id=?
    `).bind(orderId, tenantId).first<Record<string,unknown>>(),
    db.prepare(`
      SELECT poi.*,
        COALESCE((SELECT SUM(ri.received_quantity) FROM receipt_items ri WHERE ri.purchase_order_item_id=poi.id),0) AS received_qty
      FROM purchase_order_items poi WHERE poi.purchase_order_id=? ORDER BY poi.id
    `).bind(orderId).all<Record<string,unknown>>(),
    db.prepare('SELECT id, name FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name')
      .bind(tenantId).all<Record<string,unknown>>()
  ])
  if (!order) return layout('エラー', '<div class="alert alert-danger">発注データが見つかりません。</div>', '', '', getLayoutOpts(c))

  const supplierOpts = supplierRes.results.map(s =>
    `<option value="${s['id']}">${esc(s['name'])}</option>`
  ).join('')

  const itemIds = itemsRes.results.map(i => i['id'])

  // 明細行HTML（単価入力欄付き）
  const itemRows = itemsRes.results.map(item => {
    const remaining = Number(item['quantity']||0) - Number(item['received_qty']||0)
    const listPrice  = item['list_price']  != null ? Number(item['list_price'])  : null
    const rate       = item['rate']        != null ? Number(item['rate'])        : null
    const unitPrice  = item['unit_price']  != null ? Number(item['unit_price'])  : null
    // 定価×掛率のサジェスト（発注時計算値）
    const suggested  = listPrice && rate ? Math.round(listPrice * rate) : unitPrice
    const listFmt    = listPrice ? listPrice.toLocaleString('ja-JP') : ''
    const rateFmt    = rate      ? (rate * 100).toFixed(1) + '%'     : ''
    const suggestTip = (listPrice && rate)
      ? `<div class="text-muted" style="font-size:.7rem">定価 ¥${listFmt} × ${rateFmt} = ¥${suggested?.toLocaleString('ja-JP')}</div>`
      : ''
    return `<tr data-poi-id="${item['id']}">
      <td class="small">
        <span class="text-muted">${esc(item['item_category'])} / ${esc(item['manufacturer'])}</span><br>
        <strong>${esc(item['product_name'])}</strong>${item['spec'] ? ` <span class="text-muted">${esc(item['spec'])}</span>` : ''}
        ${item['color'] ? `<br><span class="text-muted">${esc(item['color'])}</span>` : ''}
      </td>
      <td class="text-center fw-semibold">${item['quantity']}</td>
      <td class="text-center text-success">${item['received_qty']}</td>
      <td class="text-center ${remaining<=0?'text-muted':'text-danger fw-bold'}">${remaining}</td>
      <td style="min-width:110px">
        <input class="form-control form-control-sm text-center qty-input" type="number"
          min="0" max="${remaining > 0 ? remaining : 0}"
          name="rq_${item['id']}" value="${remaining>0 ? remaining : 0}"
          data-poi="${item['id']}">
      </td>
      <td style="min-width:160px">
        <div class="input-group input-group-sm">
          <span class="input-group-text">¥</span>
          <input class="form-control text-end price-input" type="number" min="0" step="1"
            name="up_${item['id']}" value="${unitPrice ?? ''}"
            placeholder="${suggested ?? ''}"
            data-list="${listPrice ?? ''}" data-rate="${rate ?? ''}"
            data-poi="${item['id']}">
        </div>
        ${suggestTip}
      </td>
      <td><input class="form-control form-control-sm" name="rn_${item['id']}" placeholder="行備考"></td>
    </tr>`
  }).join('')

  const scripts = `<script>
// 合計金額リアルタイム計算
function calcTotal(){
  var total = 0;
  document.querySelectorAll('.qty-input').forEach(function(qEl){
    var poi = qEl.dataset.poi;
    var pEl = document.querySelector('[name="up_'+poi+'"]');
    var qty = parseInt(qEl.value)||0;
    var price = parseFloat(pEl?.value||'0')||0;
    total += qty * price;
  });
  var el = document.getElementById('preview-total');
  if(el) el.textContent = '¥' + total.toLocaleString('ja-JP');
}
document.addEventListener('input', function(e){
  if(e.target.classList.contains('qty-input') || e.target.classList.contains('price-input')) calcTotal();
});

// 納品書なしトグル
(function(){
  var noSlipCb = document.getElementById('cb-no-slip-new');
  var slipDateEl = document.querySelector('[name="slip_date"]');
  if(!noSlipCb) return;
  noSlipCb.addEventListener('change', function(){
    if(noSlipCb.checked){
      slipDateEl.value = '';
      slipDateEl.disabled = true;
      slipDateEl.removeAttribute('required');
    } else {
      slipDateEl.disabled = false;
      slipDateEl.setAttribute('required', '');
    }
  });
})();

document.getElementById('receipt-form').addEventListener('submit', async function(e){
  e.preventDefault();
  var form = e.target;
  var noSlipCb = document.getElementById('cb-no-slip-new');
  var isNoSlip = noSlipCb && noSlipCb.checked;

  // バリデーション
  var receivedDate = form.querySelector('[name="received_date"]').value;
  var slipDate     = form.querySelector('[name="slip_date"]').value;
  var inspectedBy  = form.querySelector('[name="inspected_by"]').value.trim();
  if(!receivedDate){ showFlash('入荷日は必須です','danger'); return; }
  if(!isNoSlip && !slipDate){ showFlash('納品書記載日を入力してください（納品書がない場合は「納品書なし」にチェック）','danger'); return; }
  if(!inspectedBy){ showFlash('検品者は必須です','danger'); return; }

  var itemIds = ${JSON.stringify(itemIds)};
  var receiptItems = itemIds.map(function(id){
    var qEl = form.querySelector('[name="rq_'+id+'"]');
    var pEl = form.querySelector('[name="up_'+id+'"]');
    var nEl = form.querySelector('[name="rn_'+id+'"]');
    var qty = parseInt(qEl?.value||'0');
    var obj = {
      purchase_order_item_id: id,
      received_quantity: qty,
      note: nEl?.value||''
    };
    if(pEl && pEl.value !== '') obj.actual_unit_price = parseFloat(pEl.value);
    return obj;
  }).filter(function(i){ return i.received_quantity > 0; });

  if(receiptItems.length === 0){
    showFlash('入荷数を1以上入力してください','danger'); return;
  }

  var actualSupEl = form.querySelector('[name="actual_supplier_id"]');
  var payload = {
    order_id:           ${orderId},
    received_date:      receivedDate,
    slip_date:          isNoSlip ? '' : slipDate,
    inspected_by:       inspectedBy,
    note:               form.querySelector('[name="note"]').value,
    no_slip:            isNoSlip,
    slip_note:          form.querySelector('[name="slip_note"]')?.value||'',
    actual_supplier_id: actualSupEl && actualSupEl.value ? parseInt(actualSupEl.value) : null,
    items: receiptItems
  };

  var btn = form.querySelector('button[type=submit]');
  btn.disabled=true;
  btn.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>保存中...';
  try {
    var resp = await fetch('/api/receipts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    var result = await resp.json();
    if(!resp.ok){ showFlash(result.error||'登録に失敗しました','danger'); btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>納品登録を保存'; return; }
    window.location.replace('/orders/${orderId}?_r=' + Date.now());
  } catch(err){
    showFlash('通信エラー: '+err.message,'danger');
    btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>納品登録を保存';
  }
});

// 初期計算
calcTotal();
</script>`

  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-truck me-2" style="color:var(--gw-green)"></i>納品登録・検品</h1>
    <p class="page-subtitle">${esc(order['order_no'])} ／ ${esc(order['supplier_name'])}</p>
  </div>
  <div class="actions">
    <a href="/orders/${orderId}" class="btn btn-outline-secondary btn-sm"><i class="fas fa-arrow-left me-1"></i>発注詳細へ戻る</a>
  </div>
</div>

<!-- 運用ガイド -->
<div class="alert alert-info d-flex gap-2 py-2 mb-3" style="font-size:.9rem">
  <i class="fas fa-clipboard-check mt-1 flex-shrink-0"></i>
  <div>
    <strong>検品手順：</strong>
    ①入荷日・検品者を入力　②納品書の日付を入力（納品書がない場合は「納品書なし」にチェック）
    ③各商品の<strong>入荷数</strong>と<strong>納品書記載の単価</strong>を確認・入力　④仕入先が違う場合は変更　⑤保存
  </div>
</div>

<form id="receipt-form">

  <!-- ① 納品ヘッダ -->
  <div class="card mb-3">
    <div class="card-header fw-semibold"><i class="fas fa-info-circle me-1"></i>① 入荷情報</div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-md-3">
          <label class="form-label fw-semibold">入荷日 <span class="text-danger">*</span></label>
          <input class="form-control" type="date" name="received_date" value="${todayStr()}" required>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold">
            納品書記載日 <span class="text-danger" id="slip-date-required-mark">*</span>
          </label>
          <input class="form-control" type="date" name="slip_date" required
            placeholder="納品書の日付">
          <div class="form-text">納品書に記載されている日付</div>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold">検品者 <span class="text-danger">*</span></label>
          <input class="form-control" name="inspected_by" placeholder="例: 古川" required>
        </div>
        <div class="col-md-3 d-flex align-items-end pb-1">
          <!-- 納品書なし -->
          <div class="form-check form-switch">
            <input class="form-check-input" type="checkbox" id="cb-no-slip-new" name="no_slip"
              style="width:2.5em;height:1.3em">
            <label class="form-check-label ms-2 fw-semibold" for="cb-no-slip-new">
              <i class="fas fa-file-slash me-1 text-secondary"></i>納品書なし
              <div class="text-muted fw-normal" style="font-size:.75rem">郵送待ち・紛失など</div>
            </label>
          </div>
        </div>
        <div class="col-12">
          <label class="form-label">備考</label>
          <textarea class="form-control" name="note" rows="2" placeholder="特記事項があれば記入"></textarea>
        </div>
      </div>
    </div>
  </div>

  <!-- ② 仕入先（実際の仕入先が違う場合） -->
  <div class="card mb-3">
    <div class="card-header fw-semibold"><i class="fas fa-building me-1"></i>② 仕入先確認</div>
    <div class="card-body">
      <div class="row g-3 align-items-end">
        <div class="col-md-5">
          <div class="mb-2 small">
            <span class="text-muted">発注時の仕入先:</span>
            <strong class="ms-1">${esc(order['supplier_name'])}</strong>
            ${order['payment_method'] ? `<span class="ms-2 badge text-bg-light border">${esc(order['payment_method'])}</span>` : ''}
          </div>
          <label class="form-label mb-1">実際の仕入先 <span class="text-muted small fw-normal">（発注と異なる場合のみ）</span></label>
          <select class="form-select" name="actual_supplier_id">
            <option value="">― 発注時の仕入先のまま ―</option>
            ${supplierOpts}
          </select>
        </div>
        <div class="col-md-7 small text-muted">
          <i class="fas fa-info-circle me-1"></i>実際に納品してきた仕入先が発注と異なる場合（代替・直送など）に変更してください。
        </div>
      </div>
    </div>
  </div>

  <!-- ③ 入荷明細（単価を納品書に合わせて入力） -->
  <div class="card mb-3">
    <div class="card-header fw-semibold d-flex justify-content-between align-items-center">
      <span><i class="fas fa-table me-1"></i>③ 入荷明細（納品書の金額を確認して入力）</span>
      <span class="badge bg-secondary" id="preview-total">¥0</span>
    </div>
    <div class="table-responsive">
      <table class="table align-middle mb-0 small">
        <thead class="table-light">
          <tr>
            <th>商品</th>
            <th class="text-center">発注数</th>
            <th class="text-center">入荷済</th>
            <th class="text-center">残数</th>
            <th class="text-center" style="min-width:110px">今回入荷数 <span class="text-danger">*</span></th>
            <th style="min-width:170px">
              納品書の単価 <span class="text-danger">*</span>
              <div class="text-muted fw-normal" style="font-size:.7rem">発注単価と異なる場合は修正</div>
            </th>
            <th>行備考</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
    </div>
  </div>

  <!-- ④ 照合メモ -->
  <div class="card mb-3">
    <div class="card-header fw-semibold"><i class="fas fa-sticky-note me-1"></i>④ 照合メモ（任意）</div>
    <div class="card-body">
      <textarea class="form-control" name="slip_note" rows="2"
        placeholder="例: ○○の単価が納品書では¥1,800でシステムの¥2,000と異なったため修正。値引き連絡あり。"></textarea>
    </div>
  </div>

  <div class="sticky-actions d-flex justify-content-between align-items-center">
    <span class="text-muted small"><i class="fas fa-info-circle me-1"></i>納品書記載日・検品者は必須です</span>
    <div>
      <a href="/orders/${orderId}" class="btn btn-outline-secondary me-2"><i class="fas fa-times me-1"></i>キャンセル</a>
      <button type="submit" class="btn btn-primary btn-lg px-4"><i class="fas fa-save me-1"></i>納品登録を保存</button>
    </div>
  </div>

</form>`
  const o11 = getLayoutOpts(c)
  return layout('納品登録・検品', content, scripts, o11.username, o11)
})

// ============================================================
// システム外発注の納品登録ページ (/receipts/free)
// ★ /receipts/new/:order_id の後・/receipts/:id/edit の前に定義（静的パス優先）
// ============================================================
app.get('/receipts/free', async (c) => {
  const db = c.env.DB
  const { tenantId } = getLayoutOpts(c)
  const suppliers = await db.prepare(
    'SELECT id, name, payment_method FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name'
  ).bind(tenantId).all<Record<string,unknown>>()
  const supplierOpts = suppliers.results.map(s =>
    `<option value="${s['id']}" data-pay="${esc(s['payment_method'])}">${esc(s['name'])}</option>`
  ).join('')

  const scripts = `<script>
var rowCount = 1;

// 合計金額リアルタイム計算
function calcFreeTotal(){
  var total = 0;
  document.querySelectorAll('#free-items-tbody tr').forEach(function(tr){
    var n = tr.dataset.row;
    var qty = parseInt(document.querySelector('[name="qty_'+n+'"]')?.value||'0')||0;
    var up  = parseFloat(document.querySelector('[name="up_'+n+'"]')?.value||'0')||0;
    total += qty * up;
  });
  var el = document.getElementById('free-preview-total');
  if(el) el.textContent = '¥' + total.toLocaleString('ja-JP');
}

function addRow(){
  rowCount++;
  var tbody = document.getElementById('free-items-tbody');
  var tr = document.createElement('tr');
  tr.dataset.row = rowCount;
  tr.innerHTML = \`
    <td><input class="form-control form-control-sm" name="pname_\${rowCount}" placeholder="商品名" required></td>
    <td><input class="form-control form-control-sm" name="spec_\${rowCount}" placeholder="仕様・色など"></td>
    <td><input class="form-control form-control-sm text-center qty-input" type="number" min="1" name="qty_\${rowCount}" value="1" required></td>
    <td>
      <div class="input-group input-group-sm">
        <span class="input-group-text">¥</span>
        <input class="form-control text-end up-input" type="number" min="0" step="1" name="up_\${rowCount}" placeholder="納品書の単価">
      </div>
      <div class="text-end text-muted row-subtotal" style="font-size:.72rem;margin-top:2px">小計: ¥0</div>
    </td>
    <td><input class="form-control form-control-sm" name="note_\${rowCount}" placeholder="備考"></td>
    <td class="text-center">
      <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2 btn-del-row"><i class="fas fa-trash"></i></button>
    </td>
  \`;
  tr.querySelector('.btn-del-row').addEventListener('click', function(){
    if(document.querySelectorAll('#free-items-tbody tr').length > 1){
      tr.remove(); calcFreeTotal();
    } else {
      showFlash('明細は1行以上必要です','warning');
    }
  });
  tr.querySelectorAll('.qty-input,.up-input').forEach(function(inp){
    inp.addEventListener('input', function(){
      var n2 = tr.dataset.row;
      var q = parseInt(document.querySelector('[name="qty_'+n2+'"]')?.value||'0')||0;
      var p = parseFloat(document.querySelector('[name="up_'+n2+'"]')?.value||'0')||0;
      var st = tr.querySelector('.row-subtotal');
      if(st) st.textContent = '小計: ¥' + (q*p).toLocaleString('ja-JP');
      calcFreeTotal();
    });
  });
  tbody.appendChild(tr);
}

// 納品書なしトグル制御
function updateNoSlipUI(){
  var cb = document.getElementById('free-no-slip-cb');
  var slipDateGroup = document.getElementById('free-slip-date-group');
  var slipDateEl = document.querySelector('[name="slip_date"]');
  if(!cb || !slipDateGroup) return;
  if(cb.checked){
    slipDateGroup.style.opacity = '0.4';
    slipDateGroup.style.pointerEvents = 'none';
    if(slipDateEl){ slipDateEl.value = ''; slipDateEl.removeAttribute('required'); }
    var lbl = slipDateGroup.querySelector('label');
    if(lbl) lbl.innerHTML = '納品書記載日 <span class="text-muted small">（納品書なしのため不要）</span>';
  } else {
    slipDateGroup.style.opacity = '1';
    slipDateGroup.style.pointerEvents = '';
    if(slipDateEl) slipDateEl.setAttribute('required','required');
    var lbl2 = slipDateGroup.querySelector('label');
    if(lbl2) lbl2.innerHTML = '納品書記載日 <span class="text-danger">*</span>';
  }
}

// 仕入先変更時に支払い条件を表示
function updatePayDisplay(){
  var sel = document.querySelector('[name="supplier_id"]');
  var el = document.getElementById('pay-method-display');
  if(!sel || !el) return;
  var opt = sel.options[sel.selectedIndex];
  var pay = opt ? (opt.dataset.pay||'') : '';
  el.textContent = pay ? ('支払い条件: ' + pay) : '';
}

document.addEventListener('DOMContentLoaded', function(){
  // 行削除ボタン（初期行）
  document.querySelectorAll('#free-items-tbody .btn-del-row').forEach(function(btn){
    btn.addEventListener('click', function(){
      var tr = btn.closest('tr');
      if(document.querySelectorAll('#free-items-tbody tr').length > 1){
        tr.remove(); calcFreeTotal();
      } else {
        showFlash('明細は1行以上必要です','warning');
      }
    });
  });

  // 初期行の小計リアルタイム計算
  document.querySelectorAll('#free-items-tbody tr').forEach(function(tr){
    tr.querySelectorAll('.qty-input,.up-input').forEach(function(inp){
      inp.addEventListener('input', function(){
        var n = tr.dataset.row;
        var q = parseInt(document.querySelector('[name="qty_'+n+'"]')?.value||'0')||0;
        var p = parseFloat(document.querySelector('[name="up_'+n+'"]')?.value||'0')||0;
        var st = tr.querySelector('.row-subtotal');
        if(st) st.textContent = '小計: ¥' + (q*p).toLocaleString('ja-JP');
        calcFreeTotal();
      });
    });
  });

  document.getElementById('btn-add-row').addEventListener('click', addRow);

  var noSlipCb = document.getElementById('free-no-slip-cb');
  if(noSlipCb) noSlipCb.addEventListener('change', updateNoSlipUI);
  updateNoSlipUI();

  var supSel = document.querySelector('[name="supplier_id"]');
  if(supSel) supSel.addEventListener('change', updatePayDisplay);

  document.getElementById('free-receipt-form').addEventListener('submit', async function(e){
    e.preventDefault();
    var f = e.target;
    var receivedDate = f.querySelector('[name="received_date"]').value;
    var noSlip = document.getElementById('free-no-slip-cb')?.checked || false;
    var slipDate = f.querySelector('[name="slip_date"]')?.value || '';
    var inspectedBy = (f.querySelector('[name="inspected_by"]').value||'').trim();

    // ── バリデーション ──
    if(!receivedDate){ showFlash('入荷日は必須です','danger'); return; }
    if(!noSlip && !slipDate){ showFlash('納品書記載日を入力してください。納品書がない場合は「納品書なし」をオンにしてください。','danger'); return; }
    if(!inspectedBy){ showFlash('検品者は必須です','danger'); return; }
    var supplierId = parseInt(f.querySelector('[name="supplier_id"]').value||'0');
    if(!supplierId){ showFlash('仕入先を選択してください','danger'); return; }

    var rows = document.querySelectorAll('#free-items-tbody tr');
    var items = [];
    var hasError = false;
    rows.forEach(function(tr){
      var n = tr.dataset.row;
      var pname = (f.querySelector('[name="pname_'+n+'"]')?.value||'').trim();
      var qty   = parseInt(f.querySelector('[name="qty_'+n+'"]')?.value||'0');
      if(!pname){ return; } // 商品名空行はスキップ
      if(qty <= 0){ showFlash('数量は1以上を入力してください（行: '+pname+'）','danger'); hasError=true; return; }
      var item = {
        product_name: pname,
        spec:         (f.querySelector('[name="spec_'+n+'"]')?.value||'').trim(),
        quantity:     qty,
        note:         (f.querySelector('[name="note_'+n+'"]')?.value||'').trim()
      };
      var upEl = f.querySelector('[name="up_'+n+'"]');
      if(upEl && upEl.value !== '') item.unit_price = parseFloat(upEl.value);
      items.push(item);
    });
    if(hasError) return;
    if(items.length === 0){ showFlash('明細を1行以上入力してください','danger'); return; }

    var payload = {
      supplier_id:   supplierId,
      received_date: receivedDate,
      slip_date:     noSlip ? '' : slipDate,
      inspected_by:  inspectedBy,
      note:          (f.querySelector('[name="note"]').value||'').trim(),
      no_slip:       noSlip,
      slip_note:     (f.querySelector('[name="slip_note"]')?.value||'').trim(),
      items: items
    };

    var btn = f.querySelector('button[type=submit]');
    btn.disabled=true; btn.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>保存中...';
    try {
      var resp = await fetch('/api/receipts/free',{
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
      });
      var res = await resp.json();
      if(!resp.ok){ showFlash(res.error||'保存に失敗しました','danger'); btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>納品登録を保存'; return; }
      window.location.href = '/receipts?flash=' + encodeURIComponent('システム外発注の納品を登録しました');
    } catch(err){
      showFlash('通信エラー: '+err.message,'danger');
      btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>納品登録を保存';
    }
  });
});
</script>`

  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-plus-circle me-2" style="color:var(--gw-green)"></i>システム外発注の納品登録</h1>
    <p class="page-subtitle">このシステムで発注していない商品の納品を記録します。</p>
  </div>
  <div class="actions">
    <a href="/receipts" class="btn btn-outline-secondary btn-sm"><i class="fas fa-arrow-left me-1"></i>納品履歴に戻る</a>
  </div>
</div>
<form id="free-receipt-form">

  <!-- ① 入荷情報 -->
  <div class="card mb-3">
    <div class="card-header fw-semibold"><i class="fas fa-truck-loading me-1" style="color:var(--gw-green)"></i>① 入荷情報</div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-md-4">
          <label class="form-label fw-semibold">仕入先 <span class="text-danger">*</span></label>
          <select class="form-select" name="supplier_id" required>
            <option value="">― 選択してください ―</option>
            ${supplierOpts}
          </select>
          <div id="pay-method-display" class="text-muted small mt-1"></div>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold">入荷日 <span class="text-danger">*</span></label>
          <input class="form-control" type="date" name="received_date" value="${todayStr()}" required>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold">検品者 <span class="text-danger">*</span></label>
          <input class="form-control" name="inspected_by" placeholder="例: 古川" required>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold">備考</label>
          <textarea class="form-control" name="note" rows="2" placeholder="納品書番号・特記事項など"></textarea>
        </div>
      </div>
    </div>
  </div>

  <!-- ② 納品書照合 -->
  <div class="card mb-3 border-warning">
    <div class="card-header fw-semibold bg-warning bg-opacity-10">
      <i class="fas fa-file-invoice me-1"></i>② 納品書照合
      <span class="ms-2 small fw-normal text-muted">※ 納品書の日付と金額を確認してください</span>
    </div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-12">
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="free-no-slip-cb" name="no_slip" value="1"
              style="width:2.5em;height:1.3em">
            <label class="form-check-label ms-2 fw-semibold" for="free-no-slip-cb">
              <i class="fas fa-file-slash me-1 text-secondary"></i>納品書なし
              <span class="text-muted fw-normal small ms-2">（郵送待ち・紛失・不要な場合など）</span>
            </label>
          </div>
        </div>
        <div class="col-md-3" id="free-slip-date-group">
          <label class="form-label fw-semibold">納品書記載日 <span class="text-danger">*</span></label>
          <input class="form-control" type="date" name="slip_date" required>
          <div class="text-muted small mt-1"><i class="fas fa-info-circle me-1"></i>納品書に記載されている日付を入力</div>
        </div>
        <div class="col-12">
          <label class="form-label">照合メモ <span class="text-muted small fw-normal">（差異・特記事項があれば記入）</span></label>
          <textarea class="form-control" name="slip_note" rows="2"
            placeholder="例: 金額が¥200異なっていたため確認中。仕入先へ問い合わせ済み。"></textarea>
        </div>
      </div>
    </div>
  </div>

  <!-- ③ 入荷明細 -->
  <div class="card mb-3">
    <div class="card-header d-flex align-items-center justify-content-between">
      <span class="fw-semibold"><i class="fas fa-table me-1"></i>③ 入荷明細（納品書の単価を確認して入力）</span>
      <button type="button" id="btn-add-row" class="btn btn-outline-success btn-sm">
        <i class="fas fa-plus me-1"></i>行を追加
      </button>
    </div>
    <div class="table-responsive">
      <table class="table align-middle mb-0 small">
        <thead>
          <tr>
            <th style="min-width:200px">商品名 <span class="text-danger">*</span></th>
            <th style="min-width:130px">仕様・色など</th>
            <th class="text-center" style="min-width:80px">数量 <span class="text-danger">*</span></th>
            <th style="min-width:150px">
              単価 <span class="text-muted fw-normal">（納品書記載値）</span>
            </th>
            <th style="min-width:130px">行備考</th>
            <th></th>
          </tr>
        </thead>
        <tbody id="free-items-tbody">
          <tr data-row="1">
            <td><input class="form-control form-control-sm" name="pname_1" placeholder="商品名" required></td>
            <td><input class="form-control form-control-sm" name="spec_1" placeholder="仕様・色など"></td>
            <td><input class="form-control form-control-sm text-center qty-input" type="number" min="1" name="qty_1" value="1" required></td>
            <td>
              <div class="input-group input-group-sm">
                <span class="input-group-text">¥</span>
                <input class="form-control text-end up-input" type="number" min="0" step="1" name="up_1" placeholder="納品書の単価">
              </div>
              <div class="text-end text-muted row-subtotal" style="font-size:.72rem;margin-top:2px">小計: ¥0</div>
            </td>
            <td><input class="form-control form-control-sm" name="note_1" placeholder="備考"></td>
            <td class="text-center">
              <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2 btn-del-row"><i class="fas fa-trash"></i></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="card-footer d-flex justify-content-end align-items-center gap-3 py-2">
      <span class="text-muted small">合計金額（納品書と照合）:</span>
      <span id="free-preview-total" class="fw-bold fs-5">¥0</span>
    </div>
  </div>

  <div class="d-flex justify-content-end gap-2">
    <a href="/receipts" class="btn btn-outline-secondary"><i class="fas fa-times me-1"></i>キャンセル</a>
    <button type="submit" class="btn btn-success btn-lg px-4"><i class="fas fa-save me-1"></i>納品登録を保存</button>
  </div>
</form>`
  const o12 = getLayoutOpts(c)
  return layout('システム外発注の納品登録', content, scripts, o12.username, o12)
})

// ============================================================
// 商品マスタ 新規登録フォーム（/products/new）
// 発注詳細のマスタ外バナーからクエリパラメータで初期値を受け取れる
// ============================================================
app.get('/products/new', async (c) => {
  const db = c.env.DB
  const q = c.req.query
  const prefill = {
    item_category: q('item_category') || '',
    manufacturer:  q('manufacturer')  || '',
    name:          q('name')          || '',
    spec:          q('spec')          || '',
    color:         q('color')         || '',
    club_type:     q('club_type')     || '',
    list_price:    q('list_price')    || '',
    default_rate:  q('default_rate')  || '0.65',
    supplier_id:   q('supplier_id')   || '',
  }

  const { tenantId } = getLayoutOpts(c)
  const suppliers = await db.prepare('SELECT id, name FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name').bind(tenantId).all<Record<string,unknown>>()
  const supplierOpts = suppliers.results.map(s =>
    `<option value="${s['id']}" ${prefill.supplier_id === String(s['id']) ? 'selected' : ''}>${esc(s['name'])}</option>`
  ).join('')

  const scripts = `<script>
document.getElementById('new-product-form').addEventListener('submit', async function(e){
  e.preventDefault();
  var f = this;
  var body = {
    item_category:       f.item_category.value.trim(),
    manufacturer:        f.manufacturer.value.trim(),
    name:                f.name.value.trim(),
    spec:                f.spec.value.trim(),
    color:               f.color.value.trim(),
    club_type:           f.club_type.value,
    list_price:          f.list_price.value ? parseFloat(f.list_price.value) : null,
    default_rate:        f.default_rate.value ? parseFloat(f.default_rate.value) : null,
    default_supplier_id: f.default_supplier_id.value ? parseInt(f.default_supplier_id.value) : null,
    unit:                f.unit.value || '本',
    barcode:             f.barcode.value.trim(),
    product_code:        f.product_code.value.trim(),
    source:              f.source.value.trim(),
  };
  if(!body.item_category || !body.name){
    showFlash('品目と商品名は必須です','danger'); return;
  }
  var btn = f.querySelector('button[type=submit]');
  btn.disabled=true; btn.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>保存中...';
  try {
    var r = await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var res = await r.json();
    if(r.ok){
      location.href = '/products?flash=' + encodeURIComponent('「'+body.name+'」を登録しました');
    } else {
      showFlash(res.error||'登録に失敗しました','danger');
      btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>登録する';
    }
  } catch(err){
    showFlash('通信エラー: '+err.message,'danger');
    btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>登録する';
  }
});
</script>`

  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-plus-circle me-2" style="color:var(--gw-green)"></i>商品を新規登録</h1>
  </div>
  <div class="actions">
    <a href="/products" class="btn btn-outline-secondary btn-sm"><i class="fas fa-arrow-left me-1"></i>一覧に戻る</a>
  </div>
</div>
<form id="new-product-form">
  <div class="card">
    <div class="card-body row g-3">
      <div class="col-md-3">
        <label class="form-label fw-semibold">品目 <span class="text-danger">*</span></label>
        <input class="form-control" name="item_category" value="${esc(prefill.item_category)}" placeholder="シャフト / グリップ …" required>
      </div>
      <div class="col-md-3">
        <label class="form-label fw-semibold">メーカー</label>
        <input class="form-control" name="manufacturer" value="${esc(prefill.manufacturer)}" placeholder="フジクラ / Golf Pride …">
      </div>
      <div class="col-md-6">
        <label class="form-label fw-semibold">商品名 <span class="text-danger">*</span></label>
        <input class="form-control" name="name" value="${esc(prefill.name)}" placeholder="例: SPEEDER NX 50" required>
      </div>
      <div class="col-md-3">
        <label class="form-label fw-semibold">仕様</label>
        <input class="form-control" name="spec" value="${esc(prefill.spec)}" placeholder="5S / R / 60S …">
      </div>
      <div class="col-md-3">
        <label class="form-label fw-semibold">色</label>
        <input class="form-control" name="color" value="${esc(prefill.color)}" placeholder="ブラック / ホワイト …">
      </div>
      <div class="col-md-2">
        <label class="form-label fw-semibold">種類</label>
        <select class="form-select" name="club_type">
          <option value="">―</option>
          ${['DR','FW','UT','IR','PT','DR/FW'].map(t =>
            `<option value="${t}" ${prefill.club_type===t?'selected':''}>${t}</option>`
          ).join('')}
        </select>
      </div>
      <div class="col-md-2">
        <label class="form-label fw-semibold">定価</label>
        <div class="input-group">
          <span class="input-group-text">¥</span>
          <input class="form-control" type="number" name="list_price" value="${esc(prefill.list_price)}" min="0" step="1" placeholder="0">
        </div>
      </div>
      <div class="col-md-2">
        <label class="form-label fw-semibold">掛率</label>
        <input class="form-control" type="number" name="default_rate" value="${esc(prefill.default_rate)}" step="0.01" min="0" max="1" placeholder="0.65">
      </div>
      <div class="col-md-4">
        <label class="form-label fw-semibold">標準仕入先</label>
        <select class="form-select" name="default_supplier_id">
          <option value="">― 未設定 ―</option>
          ${supplierOpts}
        </select>
      </div>
      <div class="col-md-2">
        <label class="form-label fw-semibold">単位</label>
        <select class="form-select" name="unit">
          <option value="本">本</option>
          <option value="個">個</option>
          <option value="ダース">ダース</option>
          <option value="セット">セット</option>
          <option value="足">足</option>
        </select>
      </div>
      <div class="col-md-4">
        <label class="form-label fw-semibold">バーコード</label>
        <input class="form-control" name="barcode" placeholder="JANコードなど">
      </div>
      <div class="col-md-4">
        <label class="form-label fw-semibold">品番</label>
        <input class="form-control" name="product_code">
      </div>
      <div class="col-md-4">
        <label class="form-label fw-semibold">出典 / メモ</label>
        <input class="form-control" name="source">
      </div>
    </div>
    <div class="card-footer text-end">
      <a href="/products" class="btn btn-outline-secondary me-2"><i class="fas fa-times me-1"></i>キャンセル</a>
      <button type="submit" class="btn btn-success btn-lg px-4"><i class="fas fa-save me-1"></i>登録する</button>
    </div>
  </div>
</form>`
  const o13 = getLayoutOpts(c)
  return layout('商品新規登録', content, scripts, o13.username, o13)
})

// ============================================================
// 納品履歴編集ページ (/receipts/:id/edit)
// ★ /receipts/new/:order_id・/receipts/free より後・/backorders の前に定義
// ============================================================
app.get('/receipts/:id/edit', async (c) => {
  const db  = c.env.DB
  const { tenantId } = getLayoutOpts(c)
  const rid = parseInt(c.req.param('id'))
  if (isNaN(rid)) return layout('エラー', '<div class="alert alert-danger">不正なIDです。</div>', '', '', getLayoutOpts(c))

  // ヘッダー・明細・仕入先一覧を並列取得
  const [receipt, itemsRes, supplierRes] = await Promise.all([
    db.prepare(`
      SELECT r.*,
             po.order_no, po.id AS purchase_order_id,
             s.name AS order_supplier_name, s.id AS order_supplier_id,
             s.payment_method AS order_supplier_payment,
             sa.name AS actual_supplier_name
      FROM receipts r
      LEFT JOIN purchase_orders po ON r.purchase_order_id = po.id
      LEFT JOIN suppliers s  ON po.supplier_id = s.id
      LEFT JOIN suppliers sa ON r.actual_supplier_id = sa.id
      WHERE r.id=? AND r.tenant_id=?
    `).bind(rid, tenantId).first<Record<string,unknown>>(),
    db.prepare(`
      SELECT ri.id AS receipt_item_id, ri.received_quantity, ri.note AS item_note,
             ri.actual_unit_price, ri.actual_rate, ri.actual_amount,
             poi.id AS poi_id, poi.product_name, poi.spec, poi.color, poi.item_category,
             poi.manufacturer, poi.quantity AS ordered_qty,
             poi.unit_price AS order_unit_price,
             poi.list_price, poi.rate AS default_rate
      FROM receipt_items ri
      LEFT JOIN purchase_order_items poi ON ri.purchase_order_item_id = poi.id
      WHERE ri.receipt_id=?
      ORDER BY ri.id
    `).bind(rid).all<Record<string,unknown>>(),
    db.prepare('SELECT id, name, payment_method FROM suppliers WHERE tenant_id=? AND is_active=1 ORDER BY name')
      .bind(tenantId).all<Record<string,unknown>>()
  ])
  if (!receipt) return layout('エラー', '<div class="alert alert-danger">納品データが見つかりません。</div>', '', '', getLayoutOpts(c))

  const isFreeReceipt = !receipt['purchase_order_id']

  // 現在の表示仕入先（actual_supplier_id があればそちら優先）
  const currentSupplierId = receipt['actual_supplier_id'] ?? receipt['order_supplier_id']
  const supplierChanged   = !!receipt['actual_supplier_id']

  // 仕入先セレクト選択肢
  const supplierOpts = supplierRes.results.map(s =>
    `<option value="${s['id']}" ${String(s['id']) === String(currentSupplierId) ? 'selected' : ''}>${esc(s['name'])}</option>`
  ).join('')

  const itemRows = itemsRes.results.map(item => {
    if (isFreeReceipt) {
      // システム外発注: 商品名は note に格納、単価は actual_unit_price
      const currentUp = item['actual_unit_price'] != null ? Number(item['actual_unit_price']) : ''
      return `<tr data-ri-id="${item['receipt_item_id']}">
        <td><input class="form-control form-control-sm" name="item_note_${item['receipt_item_id']}" value="${esc(item['item_note'])}"></td>
        <td>
          <div class="input-group input-group-sm">
            <span class="input-group-text">¥</span>
            <input class="form-control text-end up-input" type="number" min="0" step="1"
              name="up_${item['receipt_item_id']}" value="${currentUp}" placeholder="納品書の単価"
              data-ri-id="${item['receipt_item_id']}">
          </div>
        </td>
        <td>
          <input class="form-control form-control-sm text-center qty-input" type="number" min="1"
            name="rq_${item['receipt_item_id']}" value="${item['received_quantity']}"
            data-ri-id="${item['receipt_item_id']}">
        </td>
        <td class="text-end fw-semibold small subtotal-cell" data-ri-id="${item['receipt_item_id']}">
          ${item['actual_amount'] != null ? '¥'+Number(item['actual_amount']).toLocaleString('ja-JP') : '―'}
        </td>
      </tr>`
    }
    // 通常発注: actual_unit_price があればそれを表示、なければ発注時単価をデフォルト表示
    const currentUp   = item['actual_unit_price'] != null ? Number(item['actual_unit_price']) : (item['order_unit_price'] ?? '')
    const listPrice   = item['list_price'] ? Number(item['list_price']) : null
    const defaultRate = item['default_rate'] ? Number(item['default_rate']) : null
    const sugg        = (listPrice && defaultRate) ? Math.round(listPrice * defaultRate) : null
    const currentAmt  = item['actual_amount']  != null ? Number(item['actual_amount'])
                      : (item['order_unit_price'] != null ? Math.round(Number(item['order_unit_price']) * Number(item['received_quantity'])) : null)
    return `<tr data-ri-id="${item['receipt_item_id']}">
      <td class="small">
        <span class="text-muted" style="font-size:.75rem">${esc(item['item_category'])} / ${esc(item['manufacturer'])}</span><br>
        <strong>${esc(item['product_name'])}</strong>${item['spec'] ? ' <span class="text-muted">'+esc(item['spec'])+'</span>' : ''}
        ${item['color'] ? '<br><span class="text-muted small">'+esc(item['color'])+'</span>' : ''}
      </td>
      <td class="text-center">${item['ordered_qty']}</td>
      <td>
        <div class="input-group input-group-sm" style="min-width:130px">
          <span class="input-group-text">¥</span>
          <input class="form-control text-end up-input" type="number" min="0" step="1"
            name="up_${item['receipt_item_id']}" value="${currentUp}"
            data-ri-id="${item['receipt_item_id']}"
            data-list="${listPrice??''}" data-rate="${defaultRate??''}">
        </div>
        ${sugg ? `<div class="text-muted" style="font-size:.7rem">定価¥${listPrice!.toLocaleString('ja-JP')} × ${defaultRate} = ¥${sugg.toLocaleString('ja-JP')}</div>` : ''}
        ${item['actual_unit_price'] != null
          ? `<div class="text-success" style="font-size:.7rem"><i class="fas fa-check me-1"></i>実績単価あり</div>`
          : `<div class="text-warning" style="font-size:.7rem"><i class="fas fa-exclamation-triangle me-1"></i>発注時単価（要確認）</div>`}
      </td>
      <td>
        <input class="form-control form-control-sm text-center qty-input" type="number" min="0"
          name="rq_${item['receipt_item_id']}" value="${item['received_quantity']}"
          data-ri-id="${item['receipt_item_id']}">
      </td>
      <td class="text-end fw-semibold small subtotal-cell" data-ri-id="${item['receipt_item_id']}">
        ${currentAmt != null ? '¥'+currentAmt.toLocaleString('ja-JP') : '―'}
      </td>
      <td><input class="form-control form-control-sm" name="rn_${item['receipt_item_id']}" value="${esc(item['item_note'])}"></td>
    </tr>`
  }).join('')

  const riIds = itemsRes.results.map(i => i['receipt_item_id'])

  const theadHtml = isFreeReceipt
    ? `<tr>
        <th style="min-width:200px">商品名 / 備考</th>
        <th style="min-width:140px">単価（納品書）</th>
        <th class="text-center" style="min-width:90px">入荷数</th>
        <th class="text-end" style="min-width:100px">小計</th>
      </tr>`
    : `<tr>
        <th>商品</th>
        <th class="text-center">発注数</th>
        <th style="min-width:160px">
          実際の単価 <span class="text-muted fw-normal small">（納品書記載値）</span>
        </th>
        <th class="text-center" style="min-width:90px">入荷数</th>
        <th class="text-end" style="min-width:100px">小計</th>
        <th style="min-width:120px">行備考</th>
      </tr>`

  const backUrl = receipt['purchase_order_id'] ? `/orders/${receipt['purchase_order_id']}` : '/receipts'

  // slip_verified / no_slip の現在状態
  const isVerified = !!receipt['slip_verified']
  const isNoSlip   = !!receipt['no_slip']

  // 明細JSON（クライアントサイドJS用）
  const itemsJson = JSON.stringify(itemsRes.results.map(i => ({
    riId:      i['receipt_item_id'],
    listPrice: i['list_price'] ?? null,
    defaultRate: i['default_rate'] ?? null
  })))

  const scripts = `<script>
var riIds   = ${JSON.stringify(riIds)};
var itemMeta = ${itemsJson}; // [{riId, listPrice, defaultRate}]

// 合計金額リアルタイム計算
function calcEditTotal(){
  var total = 0;
  riIds.forEach(function(id){
    var qEl = document.querySelector('[name="rq_'+id+'"]');
    var pEl = document.querySelector('[name="up_'+id+'"]');
    var qty = parseInt(qEl?.value||'0')||0;
    var up  = parseFloat(pEl?.value||'0')||0;
    var sub = qty * up;
    total += sub;
    var cell = document.querySelector('.subtotal-cell[data-ri-id="'+id+'"]');
    if(cell) cell.textContent = up > 0 ? ('¥' + sub.toLocaleString('ja-JP')) : '―';
  });
  var el = document.getElementById('edit-preview-total');
  if(el) el.textContent = '¥' + total.toLocaleString('ja-JP');
}

// 納品書なしトグル制御
(function(){
  var noSlipCb   = document.getElementById('cb-no-slip');
  var slipDateEl = document.querySelector('[name="slip_date"]');
  var slipDateGroup = document.getElementById('slip-date-group');

  function updateSlipUI(){
    if(!noSlipCb) return;
    if(noSlipCb.checked){
      if(slipDateGroup){
        slipDateGroup.style.opacity = '0.4';
        slipDateGroup.style.pointerEvents = 'none';
      }
      if(slipDateEl) slipDateEl.value = '';
    } else {
      if(slipDateGroup){
        slipDateGroup.style.opacity = '1';
        slipDateGroup.style.pointerEvents = '';
      }
    }
  }
  if(noSlipCb) noSlipCb.addEventListener('change', updateSlipUI);
  updateSlipUI();
})();

document.addEventListener('DOMContentLoaded', function(){
  // リアルタイム計算イベント
  riIds.forEach(function(id){
    var qEl = document.querySelector('[name="rq_'+id+'"]');
    var pEl = document.querySelector('[name="up_'+id+'"]');
    if(qEl) qEl.addEventListener('input', calcEditTotal);
    if(pEl) pEl.addEventListener('input', calcEditTotal);
  });
  calcEditTotal();

  document.getElementById('edit-receipt-form').addEventListener('submit', async function(e){
    e.preventDefault();
    var f = e.target;

    var receivedDate = f.querySelector('[name="received_date"]').value;
    var inspectedBy  = (f.querySelector('[name="inspected_by"]')?.value||'').trim();
    var noSlipCb     = document.getElementById('cb-no-slip');
    var noSlip       = noSlipCb ? noSlipCb.checked : false;
    var slipDate     = f.querySelector('[name="slip_date"]')?.value || '';

    // バリデーション
    if(!receivedDate){ showFlash('入荷日は必須です','danger'); return; }
    if(!inspectedBy){ showFlash('検品者は必須です','danger'); return; }
    if(!noSlip && !slipDate){ showFlash('納品書記載日を入力してください。納品書がない場合は「納品書なし」をオンにしてください。','danger'); return; }

    var items = riIds.map(function(id){
      var obj = {
        receipt_item_id:   id,
        received_quantity: parseInt(f.querySelector('[name="rq_'+id+'"]')?.value||'0'),
        note: f.querySelector('[name="rn_'+id+'"]')?.value || f.querySelector('[name="item_note_'+id+'"]')?.value || ''
      };
      var upEl = f.querySelector('[name="up_'+id+'"]');
      if(upEl && upEl.value !== '') obj.actual_unit_price = parseFloat(upEl.value);
      return obj;
    });

    var verifiedCb = document.getElementById('cb-slip-verified');
    var supEl      = f.querySelector('[name="actual_supplier_id"]');
    var checkerEl  = f.querySelector('[name="slip_checked_by"]');
    var slipNoteEl = f.querySelector('[name="slip_note"]');

    // slip_date入力済みまたはno_slipの場合は自動で確認済み
    var autoVerified = (!noSlip && !!slipDate) || noSlip;
    var manualVerified = verifiedCb ? verifiedCb.checked : false;

    var payload = {
      received_date:      receivedDate,
      slip_date:          noSlip ? '' : slipDate,
      inspected_by:       inspectedBy,
      note:               f.querySelector('[name="note"]')?.value || '',
      slip_verified:      autoVerified || manualVerified,
      no_slip:            noSlip,
      slip_checked_by:    checkerEl ? (checkerEl.value||'').trim() : '',
      slip_note:          slipNoteEl ? (slipNoteEl.value||'').trim() : '',
      actual_supplier_id: supEl && supEl.value ? parseInt(supEl.value) : null,
      items: items
    };

    // 確認者が未入力のとき（slip_checkerはinspected_byで補完される）
    if(!payload.slip_checked_by) payload.slip_checked_by = inspectedBy;

    var btn = f.querySelector('button[type=submit]');
    btn.disabled=true; btn.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>保存中...';
    try {
      var resp = await fetch('/api/receipts/${rid}', {
        method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)
      });
      var res = await resp.json();
      if(!resp.ok){ showFlash(res.error||'保存に失敗しました','danger'); btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>変更を保存'; return; }
      showFlash('保存しました','success');
      setTimeout(function(){ window.location.href = '${backUrl}?flash='+encodeURIComponent('納品履歴を更新しました'); }, 800);
    } catch(err){
      showFlash('通信エラー: '+err.message,'danger');
      btn.disabled=false; btn.innerHTML='<i class="fas fa-save me-1"></i>変更を保存';
    }
  });
});
</script>`

  // 現在のチェック状態バナー
  const slipStatusBanner = isNoSlip
    ? `<div class="alert alert-secondary py-2 mb-0 d-flex align-items-center gap-2"><i class="fas fa-file-slash"></i><span>納品書なし として登録済み ${receipt['slip_checked_by'] ? '（確認者: '+esc(receipt['slip_checked_by'])+'）' : ''}</span></div>`
    : isVerified
    ? `<div class="alert alert-success py-2 mb-0 d-flex align-items-center gap-2"><i class="fas fa-check-circle"></i><span>納品書確認済み ${receipt['slip_checked_by'] ? '（確認者: '+esc(receipt['slip_checked_by'])+'）' : ''}</span></div>`
    : `<div class="alert alert-warning py-2 mb-0 d-flex align-items-center gap-2"><i class="fas fa-exclamation-triangle"></i><span><strong>納品書が未確認です。</strong>下の「② 納品書照合」セクションで日付と金額を確認してください。</span></div>`

  const content = `
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-edit me-2" style="color:var(--gw-green)"></i>納品履歴を編集</h1>
    <p class="page-subtitle">
      ${receipt['purchase_order_id']
        ? `発注番号: ${esc(receipt['order_no'])} / ${esc(receipt['order_supplier_name'])}`
        : '<span class="badge text-bg-secondary">システム外発注</span>'
      }
      &nbsp;・納品ID: ${rid}
    </p>
  </div>
  <div class="actions">
    <a href="${backUrl}" class="btn btn-outline-secondary btn-sm"><i class="fas fa-arrow-left me-1"></i>戻る</a>
  </div>
</div>

${slipStatusBanner}

<form id="edit-receipt-form" class="mt-3">

  <!-- ① 入荷情報 -->
  <div class="card mb-3">
    <div class="card-header fw-semibold"><i class="fas fa-truck-loading me-1" style="color:var(--gw-green)"></i>① 入荷情報</div>
    <div class="card-body row g-3">
      <div class="col-md-3">
        <label class="form-label fw-semibold">入荷日 <span class="text-danger">*</span></label>
        <input class="form-control" type="date" name="received_date" value="${esc(receipt['received_date'])}" required>
      </div>
      <div class="col-md-3">
        <label class="form-label fw-semibold">検品者 <span class="text-danger">*</span></label>
        <input class="form-control" name="inspected_by" value="${esc(receipt['inspected_by']) || ''}" placeholder="例: 古川" required>
      </div>
      <div class="col-12">
        <label class="form-label fw-semibold">備考</label>
        <textarea class="form-control" name="note" rows="2">${esc(receipt['note']) || ''}</textarea>
      </div>
    </div>
  </div>

  <!-- ② 納品書照合 -->
  <div class="card mb-3 ${(!isVerified && !isNoSlip) ? 'border-warning' : isNoSlip ? 'border-secondary' : 'border-success'}">
    <div class="card-header fw-semibold ${(!isVerified && !isNoSlip) ? 'bg-warning bg-opacity-25' : isNoSlip ? '' : 'bg-success bg-opacity-10'}">
      <i class="fas fa-file-invoice me-1"></i>② 納品書照合
      <span class="ms-2 small fw-normal text-muted">※ 納品書記載日・金額を確認してください</span>
    </div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-12">
          <div class="form-check form-switch mb-2">
            <input class="form-check-input" type="checkbox" id="cb-no-slip" name="no_slip" value="1"
              style="width:2.5em;height:1.3em" ${isNoSlip ? 'checked' : ''}>
            <label class="form-check-label ms-2 fw-semibold" for="cb-no-slip">
              <i class="fas fa-file-slash me-1 text-secondary"></i>納品書なし
              <span class="text-muted fw-normal small ms-2">（郵送待ち・紛失・不要な場合など）</span>
            </label>
          </div>
        </div>
        <div class="col-md-3" id="slip-date-group">
          <label class="form-label fw-semibold">納品書記載日 <span class="text-danger">*</span></label>
          <input class="form-control" type="date" name="slip_date" value="${esc(receipt['slip_date']) || ''}">
          <div class="text-muted small mt-1"><i class="fas fa-info-circle me-1"></i>納品書に記載されている日付</div>
        </div>
        <div class="col-md-3">
          <label class="form-label fw-semibold">確認者名</label>
          <input class="form-control" name="slip_checked_by"
            value="${esc(receipt['slip_checked_by']) || esc(receipt['inspected_by']) || ''}"
            placeholder="例: 古川">
          <div class="text-muted small mt-1">未入力の場合、検品者名で補完されます</div>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold">照合メモ <span class="text-muted small fw-normal">（差異・特記事項があれば記入）</span></label>
          <textarea class="form-control" name="slip_note" rows="2"
            placeholder="例: 金額が¥200異なったため単価を修正。仕入先から値引き連絡あり。">${esc(receipt['slip_note']) || ''}</textarea>
        </div>
      </div>
    </div>
  </div>

  <!-- ③ 仕入先 -->
  <div class="card mb-3 ${supplierChanged ? 'border-info' : ''}">
    <div class="card-header fw-semibold">
      <i class="fas fa-building me-1"></i>③ 仕入先
      ${supplierChanged ? `<span class="badge bg-info text-dark ms-2"><i class="fas fa-exchange-alt me-1"></i>発注時と異なる仕入先が設定されています</span>` : ''}
    </div>
    <div class="card-body">
      ${!isFreeReceipt ? `
      <div class="mb-2 small text-muted">
        <i class="fas fa-file-alt me-1"></i>発注時の仕入先:
        <strong>${esc(receipt['order_supplier_name']) || '―'}</strong>
        ${receipt['order_supplier_payment'] ? ` <span class="badge text-bg-light border ms-2">${esc(receipt['order_supplier_payment'])}</span>` : ''}
        ${supplierChanged ? `<span class="ms-2 text-info">→ 実際の納品先が異なります</span>` : ''}
      </div>` : ''}
      <div class="row g-2 align-items-end">
        <div class="col-md-5">
          <label class="form-label mb-1">実際の仕入先 <span class="text-muted small">（発注時と異なる場合のみ変更）</span></label>
          <select class="form-select" name="actual_supplier_id">
            <option value="">― 発注時の仕入先のまま ―</option>
            ${supplierOpts}
          </select>
        </div>
        <div class="col-md-7 small text-muted">
          <i class="fas fa-info-circle me-1"></i>
          実際に納品してきた仕入先が発注と異なる場合（例: 代替仕入先・直送など）に選択してください。
        </div>
      </div>
    </div>
  </div>

  <!-- ④ 入荷明細 -->
  <div class="card mb-3">
    <div class="card-header fw-semibold"><i class="fas fa-table me-1"></i>④ 入荷明細（納品書と照合して実際の単価・数量を修正）</div>
    <div class="table-responsive">
      <table class="table align-middle mb-0 small">
        <thead>${theadHtml}</thead>
        <tbody id="ri-tbody">${itemRows}</tbody>
      </table>
    </div>
    <div class="card-footer d-flex justify-content-end align-items-center gap-3 py-2">
      <span class="text-muted small">合計金額（納品書と照合）:</span>
      <span id="edit-preview-total" class="fw-bold fs-5">―</span>
    </div>
  </div>

  <div class="d-flex justify-content-end gap-2 mb-4">
    <a href="${backUrl}" class="btn btn-outline-secondary"><i class="fas fa-times me-1"></i>キャンセル</a>
    <button type="submit" class="btn btn-primary btn-lg px-4"><i class="fas fa-save me-1"></i>変更を保存</button>
  </div>
</form>`
  const o14 = getLayoutOpts(c)
  return layout('納品履歴編集', content, scripts, o14.username, o14)
})

// ============================================================
// 残注一覧
// ============================================================
app.get('/backorders', async (c) => {
  const db = c.env.DB
  const { tenantId } = getLayoutOpts(c)
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
    WHERE po.tenant_id=?
    GROUP BY poi.id, po.id, s.id
    HAVING COALESCE(SUM(ri.received_quantity),0) < poi.quantity
    ORDER BY po.order_date DESC, po.order_no DESC
  `).bind(tenantId).all<Record<string,unknown>>()

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
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-exclamation-triangle me-2" style="color:#d97706"></i>残注一覧</h1>
    <p class="page-subtitle">未入荷・一部入荷の明細を一覧表示します。</p>
  </div>
  <div class="actions">
    <a class="btn btn-outline-secondary" href="/orders"><i class="fas fa-list me-1"></i>発注一覧へ</a>
  </div>
</div>
<div class="card">
  <div class="table-responsive">
    <table class="table table-hover align-middle mb-0">
      <thead><tr>
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
  const o15 = getLayoutOpts(c)
  return layout('残注一覧', content, '', o15.username, o15)
})

// ============================================================
// バックアップ管理ページ
// ============================================================
app.get('/admin/backup', async (c) => {
  const db = c.env.DB
  const { tenantId } = getLayoutOpts(c)

  // 各テーブルの件数を取得（テナント分離）
  const [p, s, po, poi, sr, r, ri] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS c FROM products WHERE is_active=1 AND tenant_id=?').bind(tenantId).first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM suppliers WHERE is_active=1 AND tenant_id=?').bind(tenantId).first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM purchase_orders WHERE tenant_id=?').bind(tenantId).first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id WHERE po.tenant_id=?').bind(tenantId).first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM supplier_rules WHERE tenant_id=?').bind(tenantId).first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM receipts WHERE tenant_id=?').bind(tenantId).first<{c:number}>(),
    db.prepare('SELECT COUNT(*) AS c FROM receipt_items ri JOIN receipts r ON r.id=ri.receipt_id WHERE r.tenant_id=?').bind(tenantId).first<{c:number}>(),
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
<div class="action-bar">
  <div>
    <h1 class="page-title"><i class="fas fa-database me-2" style="color:var(--gw-green)"></i>バックアップ管理</h1>
    <p class="page-subtitle">データのエクスポート・インポートを行います。定期的なバックアップを推奨します。</p>
  </div>
</div>

<div class="row g-4">
  <!-- エクスポート -->
  <div class="col-lg-6">
    <div class="card h-100">
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
              <thead><tr>
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
    <div class="card h-100">
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

  const o16 = getLayoutOpts(c)
  return layout('バックアップ管理', content, scripts, o16.username, o16)
})

export { app as pageRoutes }
