import { Hono } from 'hono'
import { buildXlsx } from '../xlsxHelper'
import type { SessionUser } from '../auth'

type Bindings = {
  DB: D1Database
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

// tenant_id を取得するヘルパー
function getTenantId(c: { get: (k: 'sessionUser') => SessionUser | undefined }): number {
  return c.get('sessionUser')?.tenantId ?? 1
}

// ============================================================
// デモモード書き込みブロック middleware
// isDemo=true のとき GET/HEAD 以外は 403 を返す
// ============================================================
app.use('/*', async (c, next) => {
  const sessionUser = c.get('sessionUser')
  if (sessionUser?.isDemo && !['GET', 'HEAD'].includes(c.req.method)) {
    return c.json({
      error: 'デモモードでは書き込み操作はできません。',
      demo: true
    }, 403)
  }
  return next()
})

// ============================================================
// ユーティリティ
// ============================================================
function senderInfoFromEnv(env: Bindings) {
  return {
    name: env.APP_SENDER_NAME,
    shop: env.APP_SENDER_SHOP,
    addr: env.APP_SENDER_ADDR,
    tel:  env.APP_SENDER_TEL,
    mail: env.APP_SENDER_MAIL,
  }
}

function yen(v: unknown): string {
  if (v === null || v === undefined || v === '') return ''
  const n = parseFloat(String(v))
  if (isNaN(n)) return String(v)
  return `¥${n.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}`
}

function statusLabel(v: string): string {
  const m: Record<string, string> = {
    draft: '下書き',
    draft_created: '下書き作成済',
    ordered: '発注済',
    partial: '一部入荷',
    completed: '完納',
    cancelled: 'キャンセル',
    pool: 'プール中',
  }
  return m[v] ?? v
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function nowCode(): string {
  const d = new Date()
  return d.toISOString().replace(/[-T:.Z]/g, '').slice(0, 14)
}

function uuid5(): string {
  return Math.random().toString(36).substring(2, 7).toUpperCase()
}

function normalize(v: string | null | undefined): string {
  return (v ?? '').replace(/　/g, ' ').trim()
}

async function resolveSupplier(
  db: D1Database,
  itemCategory: string,
  manufacturer: string,
  clubType: string,
  productId?: number | null,
  tenantId: number = 1
): Promise<{ supplier: Record<string, unknown> | null; rate: number | null }> {
  if (productId) {
    const p = await db
      .prepare(
        'SELECT p.*, s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON p.default_supplier_id=s.id WHERE p.id=? AND p.tenant_id=?'
      )
      .bind(productId, tenantId)
      .first<Record<string, unknown>>()
    if (p && p['default_supplier_id']) {
      const s = await db
        .prepare('SELECT * FROM suppliers WHERE id=? AND tenant_id=?')
        .bind(p['default_supplier_id'], tenantId)
        .first<Record<string, unknown>>()
      return { supplier: s ?? null, rate: (p['default_rate'] as number) ?? null }
    }
  }

  const rows = await db
    .prepare(
      `SELECT sr.*, s.*
       FROM supplier_rules sr
       JOIN suppliers s ON sr.supplier_id = s.id
       WHERE COALESCE(sr.item_category, '') IN ('', ?)
         AND COALESCE(sr.manufacturer, '') IN ('', ?)
         AND COALESCE(sr.club_type, '') IN ('', ?)
         AND s.is_active = 1
         AND sr.tenant_id = ?
       ORDER BY
         CASE WHEN sr.item_category = ? THEN 0 ELSE 1 END,
         CASE WHEN sr.manufacturer = ? THEN 0 ELSE 1 END,
         CASE WHEN sr.club_type = ? THEN 0 ELSE 1 END,
         sr.priority ASC,
         sr.id ASC
       LIMIT 1`
    )
    .bind(itemCategory, manufacturer, clubType, tenantId, itemCategory, manufacturer, clubType)
    .first<Record<string, unknown>>()

  if (rows) {
    const supplier = await db
      .prepare('SELECT * FROM suppliers WHERE id=? AND tenant_id=?')
      .bind(rows['supplier_id'], tenantId)
      .first<Record<string, unknown>>()
    return { supplier: supplier ?? null, rate: (rows['rate'] as number) ?? null }
  }
  return { supplier: null, rate: null }
}

function composeMail(
  order: Record<string, unknown>,
  items: Record<string, unknown>[],
  supplier: Record<string, unknown>,
  senderInfo?: {
    name?: string; shop?: string; addr?: string; tel?: string; mail?: string
  }
): { subject: string; body: string } {
  const subject = `発注のお願い`
  const lines = items.map((item) => {
    const spec     = item['spec']     ? ` / ${item['spec']}`     : ''
    const color    = item['color']    ? ` / ${item['color']}`    : ''
    const clubType = item['club_type'] ? ` / ${item['club_type']}` : ''
    const unit = (item['unit'] as string || '本')
    return `・${item['item_category']} / ${item['manufacturer'] || ''} / ${item['product_name']}${spec}${color}${clubType} / ${item['quantity']}${unit}`
  })

  const honorific = (supplier['honorific'] as string) || '様'
  const contact   = (supplier['contact_name'] as string) || 'ご担当者'
  const orderNote = (order['order_note'] as string || '').trim()

  const sn = senderInfo?.name || ''
  const greeting = sn ? `お世話になっております。\n${sn}でございます。` : 'お世話になっております。'

  const sigLines: string[] = []
  if (senderInfo?.shop) sigLines.push(senderInfo.shop)
  if (senderInfo?.addr) sigLines.push(senderInfo.addr)
  if (senderInfo?.tel)  sigLines.push(`TEL：${senderInfo.tel}`)
  if (senderInfo?.mail) sigLines.push(`mail：${senderInfo.mail}`)
  const sig = sigLines.length
    ? `---------------------------\n${sigLines.join('\n')}\n---------------------------`
    : ''

  const body = `${supplier['name']}
${contact}${honorific}

${greeting}

下記の通り、発注をお願いいたします。

${lines.join('\n')}
${orderNote ? `\n備考:\n${orderNote}\n` : ''}
ご確認のほど、よろしくお願いいたします。
${sig ? '\n' + sig : ''}`
  return { subject, body }
}

async function computeStatus(db: D1Database, orderId: number): Promise<string> {
  const rows = await db
    .prepare(
      `SELECT poi.id, poi.quantity,
              COALESCE(SUM(ri.received_quantity), 0) AS received_qty
       FROM purchase_order_items poi
       LEFT JOIN receipt_items ri ON ri.purchase_order_item_id = poi.id
       WHERE poi.purchase_order_id = ?
       GROUP BY poi.id, poi.quantity`
    )
    .bind(orderId)
    .all<{ id: number; quantity: number; received_qty: number }>()

  const data = rows.results
  if (!data.length) return 'draft'
  const orderedTotal = data.reduce((s, r) => s + (r.quantity || 0), 0)
  const receivedTotal = data.reduce((s, r) => s + (r.received_qty || 0), 0)
  if (receivedTotal <= 0) {
    const cur = await db
      .prepare('SELECT status FROM purchase_orders WHERE id=?')
      .bind(orderId)
      .first<{ status: string }>()
    const s = cur?.status ?? 'draft'
    return ['draft', 'draft_created', 'ordered'].includes(s) ? s : 'ordered'
  }
  if (receivedTotal < orderedTotal) return 'partial'
  return 'completed'
}

async function updateOrderStatus(db: D1Database, orderId: number): Promise<void> {
  const status = await computeStatus(db, orderId)
  await db
    .prepare('UPDATE purchase_orders SET status=? WHERE id=?')
    .bind(status, orderId)
    .run()
}

// ============================================================
// API: ダッシュボード
// ============================================================
app.get('/dashboard', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const [products, suppliers, orders, backorders] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS c FROM products WHERE is_active=1 AND tenant_id=?').bind(tenantId).first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) AS c FROM suppliers WHERE is_active=1 AND tenant_id=?').bind(tenantId).first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) AS c FROM purchase_orders WHERE tenant_id=?').bind(tenantId).first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM (
          SELECT poi.id
          FROM purchase_order_items poi
          JOIN purchase_orders po ON po.id = poi.purchase_order_id
          LEFT JOIN receipt_items ri ON ri.purchase_order_item_id = poi.id
          WHERE po.tenant_id = ?
          GROUP BY poi.id, poi.quantity
          HAVING COALESCE(SUM(ri.received_quantity),0) < poi.quantity
        )`
      )
      .bind(tenantId)
      .first<{ c: number }>(),
  ])
  const recentOrders = await db
    .prepare(
      `SELECT po.*, s.name AS supplier_name,
              COUNT(poi.id) AS line_count,
              COALESCE(SUM(poi.amount), 0) AS total_amount,
              COALESCE(SUM(poi.quantity), 0) AS total_qty
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
       WHERE po.tenant_id = ?
       GROUP BY po.id
       ORDER BY po.id DESC
       LIMIT 10`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>()

  return c.json({
    counts: {
      products: products?.c ?? 0,
      suppliers: suppliers?.c ?? 0,
      orders: orders?.c ?? 0,
      backorders: backorders?.c ?? 0,
    },
    recent_orders: recentOrders.results.map((r) => ({
      ...r,
      status_label: statusLabel(r['status'] as string),
      total_amount_yen: yen(r['total_amount']),
    })),
  })
})

// ============================================================
// API: 商品マスタ
// ============================================================
app.get('/products', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const q = normalize(c.req.query('q'))
  const cat = c.req.query('category') || ''
  let sql = `SELECT p.*, s.name AS supplier_name
             FROM products p
             LEFT JOIN suppliers s ON p.default_supplier_id = s.id
             WHERE p.is_active = 1 AND p.tenant_id = ?`
  const params: unknown[] = [tenantId]
  if (cat) {
    sql += ' AND p.item_category = ?'
    params.push(cat)
  }
  if (q) {
    sql += ' AND (p.name LIKE ? OR p.manufacturer LIKE ? OR p.barcode LIKE ? OR p.item_category LIKE ? OR p.club_type LIKE ?)'
    const like = `%${q}%`
    params.push(like, like, like, like, like)
  }
  sql += ' ORDER BY p.item_category, p.manufacturer, p.name LIMIT 5000'

  const stmt = db.prepare(sql)
  const rows = await stmt.bind(...params).all<Record<string, unknown>>()

  return c.json({
    rows: rows.results.map((r) => ({ ...r, list_price_yen: yen(r['list_price']) })),
  })
})

// ============================================================
// API: 仕入先マスタ
// ============================================================
app.get('/suppliers', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const rows = await db
    .prepare('SELECT * FROM suppliers WHERE is_active=1 AND tenant_id=? ORDER BY name')
    .bind(tenantId)
    .all<Record<string, unknown>>()
  return c.json({ rows: rows.results })
})

// ============================================================
// API: 判定ルール
// ============================================================
app.get('/rules', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const rows = await db
    .prepare(
      `SELECT sr.*, s.name AS supplier_name
       FROM supplier_rules sr
       JOIN suppliers s ON sr.supplier_id=s.id
       WHERE sr.tenant_id = ?
       ORDER BY sr.item_category, sr.manufacturer, sr.club_type, sr.priority`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>()
  return c.json({ rows: rows.results })
})

// ============================================================
// API: 発注一覧
// ============================================================
app.get('/orders', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const status = (c.req.query('status') || '').trim()
  const supplier = (c.req.query('supplier') || '').trim()
  const q = (c.req.query('q') || '').trim()

  let sql = `SELECT po.*, s.name AS supplier_name,
                    COUNT(DISTINCT poi.id) AS line_count,
                    COALESCE(SUM(poi.amount),0) AS total_amount,
                    COALESCE(SUM(poi.quantity),0) AS total_qty
             FROM purchase_orders po
             JOIN suppliers s ON po.supplier_id = s.id
             LEFT JOIN purchase_order_items poi ON poi.purchase_order_id=po.id
             WHERE po.tenant_id = ?`
  const params: unknown[] = [tenantId]
  if (status) { sql += ' AND po.status=?'; params.push(status) }
  if (supplier) { sql += ' AND s.name LIKE ?'; params.push(`%${supplier}%`) }
  if (q) {
    sql += ' AND (po.order_no LIKE ? OR po.customer_name LIKE ? OR po.ordered_by LIKE ?)'
    const like = `%${q}%`
    params.push(like, like, like)
  }
  sql += ' GROUP BY po.id ORDER BY po.id DESC'

  const rows = await db.prepare(sql).bind(...params).all<Record<string, unknown>>()

  return c.json({
    rows: rows.results.map((r) => ({
      ...r,
      status_label: statusLabel(r['status'] as string),
      total_amount_yen: yen(r['total_amount']),
    })),
  })
})

// ============================================================
// API: 発注詳細
// ============================================================
app.get('/orders/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const tenantId = getTenantId(c)
  const order = await db
    .prepare(
      `SELECT po.*, s.name AS supplier_name, s.email, s.contact_name, s.order_method, s.phone
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id=s.id
       WHERE po.id=? AND po.tenant_id=?`
    )
    .bind(id, tenantId)
    .first<Record<string, unknown>>()
  if (!order) return c.json({ error: 'Not found' }, 404)

  const items = await db
    .prepare(
      `SELECT poi.*,
              COALESCE((SELECT SUM(received_quantity) FROM receipt_items ri WHERE ri.purchase_order_item_id = poi.id), 0) AS received_qty
       FROM purchase_order_items poi
       WHERE poi.purchase_order_id=?
       ORDER BY poi.id`
    )
    .bind(id)
    .all<Record<string, unknown>>()

  const receipts = await db
    .prepare('SELECT * FROM receipts WHERE purchase_order_id=? ORDER BY id DESC')
    .bind(id)
    .all<Record<string, unknown>>()

  return c.json({
    order: { ...order, status_label: statusLabel(order['status'] as string) },
    items: items.results.map((r) => ({
      ...r,
      unit_price_yen: yen(r['unit_price']),
      amount_yen: yen(r['amount']),
    })),
    receipts: receipts.results,
  })
})

// ============================================================
// API: 新規発注作成
// ============================================================
app.post('/orders', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const body = await c.req.json<{
    ordered_by?: string
    order_date?: string
    customer_name?: string
    usage_type?: string
    requested_delivery_date?: string
    order_note?: string
    lines: Array<{
      product_id?: number | null
      supplier_id?: number | null   // マスタ外商品で直接指定する場合
      item_category: string
      manufacturer: string
      product_name: string
      spec?: string
      color?: string
      club_type?: string
      quantity: number
      list_price?: number | null
      rate?: number | null
      unit_price?: number | null
      line_note?: string
    }>
  }>()

  const orderedBy = normalize(body.ordered_by) || '担当者未設定'
  const orderDate = body.order_date || today()
  const customerName = normalize(body.customer_name)
  const usageType = normalize(body.usage_type)
  const requestedDeliveryDate = body.requested_delivery_date || null
  const orderNote = normalize(body.order_note)
  const isPool = (body as Record<string, unknown>)['pool'] === true
  const batchCode = nowCode() + '-' + Math.random().toString(36).substring(2, 8)

  const linesRaw = body.lines || []
  const lines: Array<{
    supplier_id: number
    item_category: string
    manufacturer: string
    product_name: string
    spec: string
    color: string
    club_type: string
    quantity: number
    list_price: number | null
    rate: number | null
    unit_price: number | null
    amount: number | null
    customer_name: string
    usage_type: string
    requested_delivery_date: string | null
    line_note: string
    product_id: number | null
  }> = []

  for (const raw of linesRaw) {
    if (!raw.product_name && !raw.item_category) continue
    if (!raw.quantity || raw.quantity <= 0) continue

    let supplier: Record<string, unknown> | null = null
    let autoRate: number | null = null

    // マスタ外商品で supplier_id を直接指定している場合はそちらを優先
    if (raw.supplier_id) {
      const s = await db
        .prepare('SELECT * FROM suppliers WHERE id=? AND is_active=1 AND tenant_id=?')
        .bind(raw.supplier_id, tenantId)
        .first<Record<string, unknown>>()
      supplier = s ?? null
    } else {
      const resolved = await resolveSupplier(
        db,
        raw.item_category,
        raw.manufacturer,
        raw.club_type || '',
        raw.product_id,
        tenantId
      )
      supplier = resolved.supplier
      autoRate = resolved.rate
    }

    if (!supplier) {
      return c.json({ error: `発注先が特定できない明細があります: ${raw.product_name || raw.manufacturer || '未入力'}` }, 400)
    }

    const rate = raw.rate != null ? raw.rate : autoRate
    let unitPrice = raw.unit_price ?? null
    if (unitPrice === null && raw.list_price != null && rate != null) {
      unitPrice = Math.round(raw.list_price * rate)
    }
    const amount = unitPrice != null ? unitPrice * raw.quantity : null

    lines.push({
      supplier_id: supplier['id'] as number,
      item_category: raw.item_category,
      manufacturer: raw.manufacturer,
      product_name: raw.product_name,
      spec: raw.spec || '',
      color: raw.color || '',
      club_type: raw.club_type || '',
      quantity: raw.quantity,
      list_price: raw.list_price ?? null,
      rate,
      unit_price: unitPrice,
      amount,
      customer_name: customerName,
      usage_type: usageType,
      requested_delivery_date: requestedDeliveryDate,
      line_note: normalize(raw.line_note),
      product_id: raw.product_id ?? null,
    })
  }

  if (lines.length === 0) {
    return c.json({ error: '発注明細を1件以上入力してください。' }, 400)
  }

  // 仕入先ごとにグループ化
  const grouped = new Map<number, typeof lines>()
  for (const line of lines) {
    if (!grouped.has(line.supplier_id)) grouped.set(line.supplier_id, [])
    grouped.get(line.supplier_id)!.push(line)
  }

  const orderIds: number[] = []
  for (const [supplierId, supplierLines] of grouped) {
    const orderNo = 'PO-' + orderDate.replace(/-/g, '') + '-' + uuid5()
    const inserted = await db
      .prepare(
        `INSERT INTO purchase_orders
          (batch_code, order_no, order_date, ordered_by, supplier_id, customer_name,
           usage_type, requested_delivery_date, status, order_note, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(batchCode, orderNo, orderDate, orderedBy, supplierId, customerName,
            usageType, requestedDeliveryDate, isPool ? 'pool' : 'draft_created', orderNote, tenantId)
      .run()
    const orderId = inserted.meta.last_row_id as number

    for (const line of supplierLines) {
      await db
        .prepare(
          `INSERT INTO purchase_order_items
            (purchase_order_id, product_id, item_category, manufacturer, product_name,
             spec, color, club_type, quantity, list_price, rate, unit_price, amount,
             customer_name, usage_type, requested_delivery_date, line_note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(orderId, line.product_id, line.item_category, line.manufacturer, line.product_name,
              line.spec, line.color, line.club_type, line.quantity, line.list_price,
              line.rate, line.unit_price, line.amount, line.customer_name, line.usage_type,
              line.requested_delivery_date, line.line_note)
        .run()
    }

    if (!isPool) {
      const supplier = await db
        .prepare('SELECT * FROM suppliers WHERE id=? AND tenant_id=?')
        .bind(supplierId, tenantId)
        .first<Record<string, unknown>>()
      const order = await db
        .prepare('SELECT * FROM purchase_orders WHERE id=? AND tenant_id=?')
        .bind(orderId, tenantId)
        .first<Record<string, unknown>>()

      if (supplier && order) {
        // DBへの再SELECTを避け、メモリ上の supplierLines を直接使用
        // （D1のread-after-write問題を回避しつつ全明細を確実に渡す）
        const { subject, body } = composeMail(order, supplierLines as unknown as Record<string, unknown>[], supplier, senderInfoFromEnv(c.env))
        await db
          .prepare('UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?')
          .bind(subject, body, orderId)
          .run()
      }
    }
    orderIds.push(orderId)
  }

  return c.json({ order_ids: orderIds, batch_code: batchCode, count: orderIds.length, pool: isPool })
})

// ============================================================
// API: 発注済みステータス更新
// ============================================================
app.post('/orders/:id/mark-ordered', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const tenantId = getTenantId(c)
  await db.prepare('UPDATE purchase_orders SET status=? WHERE id=? AND tenant_id=?').bind('ordered', id, tenantId).run()
  return c.json({ ok: true })
})

// ============================================================
// API: メール下書き再生成（pool/draft など email_body が空の場合に使用）
// ============================================================
app.post('/orders/:id/regenerate-mail', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const tenantId = getTenantId(c)

  const order = await db.prepare('SELECT * FROM purchase_orders WHERE id=? AND tenant_id=?')
    .bind(id, tenantId).first<Record<string, unknown>>()
  if (!order) return c.json({ error: '発注が見つかりません' }, 404)

  const supplier = await db.prepare('SELECT * FROM suppliers WHERE id=? AND tenant_id=?')
    .bind(order['supplier_id'], tenantId).first<Record<string, unknown>>()
  if (!supplier) return c.json({ error: '仕入先が見つかりません' }, 404)

  const items = await db.prepare(
    'SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id'
  ).bind(id).all<Record<string, unknown>>()

  const { subject, body } = composeMail(order, items.results, supplier, senderInfoFromEnv(c.env))
  await db.prepare('UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?')
    .bind(subject, body, id).run()

  return c.json({ ok: true, subject, body })
})

// ============================================================
// API: 既存発注への明細追加 POST /orders/:id/items
// draft_created / pool ステータスのときのみ許可
// ============================================================
app.post('/orders/:id/items', async (c) => {
  const db = c.env.DB
  const orderId = parseInt(c.req.param('id'))
  if (isNaN(orderId)) return c.json({ error: '不正なIDです。' }, 400)
  const tenantId = getTenantId(c)

  const order = await db.prepare(
    `SELECT po.*, s.* FROM purchase_orders po
     JOIN suppliers s ON po.supplier_id = s.id
     WHERE po.id = ? AND po.tenant_id = ?`
  ).bind(orderId, tenantId).first<Record<string, unknown>>()
  if (!order) return c.json({ error: '発注が見つかりません。' }, 404)

  const status = String(order['status'] ?? '')
  if (status !== 'draft_created' && status !== 'pool') {
    return c.json({ error: '下書きまたはプール状態の発注にのみ明細を追加できます。' }, 400)
  }

  const body = await c.req.json<{
    product_id?: number | null
    supplier_id?: number | null   // マスタ外商品の場合に直接指定
    item_category: string
    manufacturer: string
    product_name: string
    spec?: string
    color?: string
    club_type?: string
    quantity: number
    list_price?: number | null
    rate?: number | null
    unit_price?: number | null
    line_note?: string
  }>()

  if (!body.product_name && !body.item_category) {
    return c.json({ error: '商品名または品目を入力してください。' }, 400)
  }
  if (!body.quantity || body.quantity <= 0) {
    return c.json({ error: '数量は1以上を指定してください。' }, 400)
  }

  // 単価計算
  const rate = body.rate ?? null
  let unitPrice = body.unit_price ?? null
  if (unitPrice === null && body.list_price != null && rate != null) {
    unitPrice = Math.round(body.list_price * rate)
  }
  const amount = unitPrice != null ? unitPrice * body.quantity : null

  // INSERT
  await db.prepare(`
    INSERT INTO purchase_order_items
      (purchase_order_id, product_id, item_category, manufacturer, product_name,
       spec, color, club_type, quantity, list_price, rate, unit_price, amount,
       customer_name, usage_type, requested_delivery_date, line_note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    orderId,
    body.product_id ?? null,
    body.item_category ?? '',
    body.manufacturer  ?? '',
    body.product_name,
    body.spec      ?? '',
    body.color     ?? '',
    body.club_type ?? '',
    body.quantity,
    body.list_price ?? null,
    rate,
    unitPrice,
    amount,
    order['customer_name']            ?? null,
    order['usage_type']               ?? null,
    order['requested_delivery_date']  ?? null,
    normalize(body.line_note)
  ).run()

  // メール下書きを再生成（追加した商品を含める）
  const allItems = await db.prepare(
    'SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id'
  ).bind(orderId).all<Record<string, unknown>>()

  // supplier オブジェクトを purchase_orders JOIN から再取得
  const supplier = await db.prepare('SELECT * FROM suppliers WHERE id=? AND tenant_id=?')
    .bind(order['supplier_id'], tenantId).first<Record<string, unknown>>()
  if (supplier) {
    const { subject, body: mailBody } = composeMail(order, allItems.results, supplier, senderInfoFromEnv(c.env))
    await db.prepare('UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?')
      .bind(subject, mailBody, orderId).run()
  }

  return c.json({ ok: true })
})

// ============================================================
// API: 明細編集  PUT /items/:poi_id
// ============================================================
app.put('/items/:poi_id', async (c) => {
  const db    = c.env.DB
  const poiId = parseInt(c.req.param('poi_id'))
  if (isNaN(poiId)) return c.json({ error: '不正なIDです。' }, 400)

  // 明細と親発注を取得
  const poi = await db.prepare(
    'SELECT poi.*, po.status, po.supplier_id FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id WHERE poi.id=?'
  ).bind(poiId).first<Record<string, unknown>>()
  if (!poi) return c.json({ error: '明細が見つかりません。' }, 404)

  const status = String(poi['status'] ?? '')
  if (status !== 'draft_created' && status !== 'pool') {
    return c.json({ error: '下書きまたはプール状態の発注のみ編集できます。' }, 400)
  }

  const body = await c.req.json<{
    item_category?: string
    manufacturer?: string
    product_name?: string
    spec?: string
    color?: string
    club_type?: string
    quantity?: number
    list_price?: number | null
    rate?: number | null
    unit_price?: number | null
    line_note?: string
  }>()

  const quantity   = body.quantity   != null ? Number(body.quantity)   : Number(poi['quantity'])
  const listPrice  = body.list_price != null ? Number(body.list_price) : (poi['list_price']  != null ? Number(poi['list_price'])  : null)
  const rate       = body.rate       != null ? Number(body.rate)       : (poi['rate']        != null ? Number(poi['rate'])        : null)
  let   unitPrice  = body.unit_price != null ? Number(body.unit_price) : (poi['unit_price']  != null ? Number(poi['unit_price'])  : null)

  // 定価×掛率で単価を自動計算（unit_price が明示指定されていない場合）
  if (body.unit_price == null && listPrice != null && rate != null) {
    unitPrice = Math.round(listPrice * rate)
  }
  const amount = unitPrice != null ? Math.round(unitPrice * quantity) : null

  await db.prepare(`
    UPDATE purchase_order_items
    SET item_category=?, manufacturer=?, product_name=?,
        spec=?, color=?, club_type=?,
        quantity=?, list_price=?, rate=?, unit_price=?, amount=?,
        line_note=?
    WHERE id=?
  `).bind(
    normalize(body.item_category) ?? poi['item_category'],
    normalize(body.manufacturer)  ?? poi['manufacturer'],
    normalize(body.product_name)  ?? poi['product_name'],
    normalize(body.spec)          ?? poi['spec']       ?? '',
    normalize(body.color)         ?? poi['color']      ?? '',
    normalize(body.club_type)     ?? poi['club_type']  ?? '',
    quantity, listPrice, rate, unitPrice, amount,
    normalize(body.line_note)     ?? poi['line_note']  ?? '',
    poiId
  ).run()

  // 発注ヘッダーのメール本文を再生成
  const orderId = Number(poi['purchase_order_id'])
  const [order, supplier, allItems] = await Promise.all([
    db.prepare('SELECT * FROM purchase_orders WHERE id=?').bind(orderId).first<Record<string,unknown>>(),
    db.prepare('SELECT * FROM suppliers WHERE id=?').bind(poi['supplier_id']).first<Record<string,unknown>>(),
    db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id').bind(orderId).all<Record<string,unknown>>(),
  ])
  if (order && supplier) {
    const { subject, body: mailBody } = composeMail(order, allItems.results, supplier, senderInfoFromEnv(c.env))
    await db.prepare('UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?')
      .bind(subject, mailBody, orderId).run()
  }

  return c.json({ ok: true, amount })
})

// ============================================================
// API: 明細削除  DELETE /items/:poi_id
// ============================================================
app.delete('/items/:poi_id', async (c) => {
  const db    = c.env.DB
  const poiId = parseInt(c.req.param('poi_id'))
  if (isNaN(poiId)) return c.json({ error: '不正なIDです。' }, 400)

  const poi = await db.prepare(
    'SELECT poi.*, po.status FROM purchase_order_items poi JOIN purchase_orders po ON po.id=poi.purchase_order_id WHERE poi.id=?'
  ).bind(poiId).first<Record<string, unknown>>()
  if (!poi) return c.json({ error: '明細が見つかりません。' }, 404)

  const status = String(poi['status'] ?? '')
  if (status !== 'draft_created' && status !== 'pool') {
    return c.json({ error: '下書きまたはプール状態の発注のみ削除できます。' }, 400)
  }

  // receipt_items が存在する（入荷済み）明細は削除不可
  const received = await db.prepare(
    'SELECT COALESCE(SUM(received_quantity),0) AS total FROM receipt_items WHERE purchase_order_item_id=?'
  ).bind(poiId).first<{ total: number }>()
  if ((received?.total ?? 0) > 0) {
    return c.json({ error: '入荷済み明細は削除できません。' }, 400)
  }

  await db.prepare('DELETE FROM purchase_order_items WHERE id=?').bind(poiId).run()

  // メール再生成
  const orderId = Number(poi['purchase_order_id'])
  const [order, supplier, allItems] = await Promise.all([
    db.prepare('SELECT * FROM purchase_orders WHERE id=?').bind(orderId).first<Record<string,unknown>>(),
    db.prepare('SELECT * FROM suppliers WHERE id=?').bind(poi['supplier_id']).first<Record<string,unknown>>(),
    db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id').bind(orderId).all<Record<string,unknown>>(),
  ])
  if (order && supplier && allItems.results.length > 0) {
    const { subject, body: mailBody } = composeMail(order, allItems.results, supplier, senderInfoFromEnv(c.env))
    await db.prepare('UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?')
      .bind(subject, mailBody, orderId).run()
  }

  return c.json({ ok: true })
})

// ============================================================
// API: 発注プール
// ============================================================

// プール一覧（仕入先別に集計）
app.get('/pool', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)

  // プール中の発注を仕入先別に集計
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
    WHERE po.status = 'pool' AND po.tenant_id = ?
    GROUP BY po.id
    ORDER BY s.name, po.id
  `).bind(tenantId).all<Record<string, unknown>>()

  // 仕入先ごとにグループ化
  const supplierMap = new Map<number, {
    supplier_id: number
    supplier_name: string
    free_shipping_threshold: number | null
    orders: Record<string, unknown>[]
    pool_total: number
  }>()

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
    g.pool_total += o['total_amount'] as number
  }

  return c.json({ groups: Array.from(supplierMap.values()) })
})

// プール内の発注の明細取得
app.get('/pool/items/:order_id', async (c) => {
  const db = c.env.DB
  const orderId = parseInt(c.req.param('order_id'))
  const items = await db.prepare(`
    SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id
  `).bind(orderId).all<Record<string, unknown>>()
  return c.json({ items: items.results })
})

// プールから発注実行（仕入先単位でまとめて draft_created に昇格）
app.post('/pool/execute', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const body = await c.req.json<{ order_ids: number[] }>()
  const ids = body.order_ids || []
  if (ids.length === 0) return c.json({ error: '発注IDが必要です' }, 400)

  for (const id of ids) {
    // メール下書き生成
    const order = await db.prepare(
      `SELECT po.*, s.name AS supplier_name, s.email, s.contact_name, s.order_method
       FROM purchase_orders po JOIN suppliers s ON po.supplier_id=s.id WHERE po.id=? AND po.tenant_id=?`
    ).bind(id, tenantId).first<Record<string, unknown>>()
    const items = await db.prepare(
      'SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id'
    ).bind(id).all<Record<string, unknown>>()
    const supplier = await db.prepare('SELECT * FROM suppliers WHERE id=? AND tenant_id=?')
      .bind(order?.['supplier_id'], tenantId).first<Record<string, unknown>>()

    if (order && supplier) {
      const { subject, body: emailBody } = composeMail(order, items.results, supplier, senderInfoFromEnv(c.env))
      await db.prepare(
        'UPDATE purchase_orders SET status=?, email_subject=?, email_body=? WHERE id=?'
      ).bind('draft_created', subject, emailBody, id).run()
    } else {
      await db.prepare('UPDATE purchase_orders SET status=? WHERE id=?')
        .bind('draft_created', id).run()
    }
  }

  // batch_codeを統一して一括メール送信画面へ誘導
  const batchCode = nowCode() + '-pool-' + Math.random().toString(36).substring(2, 6)
  for (const id of ids) {
    await db.prepare('UPDATE purchase_orders SET batch_code=? WHERE id=?').bind(batchCode, id).run()
  }

  return c.json({ ok: true, batch_code: batchCode, count: ids.length })
})

// プールから除外（削除）
app.delete('/pool/:order_id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('order_id'))
  const tenantId = getTenantId(c)
  // 明細も削除
  await db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id=?').bind(id).run()
  await db.prepare('DELETE FROM purchase_orders WHERE id=? AND status=? AND tenant_id=?').bind(id, 'pool', tenantId).run()
  return c.json({ ok: true })
})

// ============================================================
// API: メールバッチ取得
// ============================================================
app.get('/mail-batch/:batch_code', async (c) => {
  const db = c.env.DB
  const batchCode = c.req.param('batch_code')
  const tenantId = getTenantId(c)
  const orders = await db
    .prepare(
      `SELECT po.*, s.name AS supplier_name, s.email, s.contact_name, s.order_method
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.batch_code = ? AND po.tenant_id = ?
       ORDER BY po.id`
    )
    .bind(batchCode, tenantId)
    .all<Record<string, unknown>>()

  const result: Array<{ order: Record<string, unknown>; items: Record<string, unknown>[] }> = []
  for (const order of orders.results) {
    const items = await db
      .prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id')
      .bind(order['id'])
      .all<Record<string, unknown>>()
    result.push({
      order: { ...order, status_label: statusLabel(order['status'] as string) },
      items: items.results.map((r) => ({
        ...r,
        unit_price_yen: yen(r['unit_price']),
        amount_yen: yen(r['amount']),
      })),
    })
  }
  return c.json({ batch_code: batchCode, orders: result })
})

// ============================================================
// API: 納品一覧
// ============================================================
app.get('/receipts', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const rows = await db
    .prepare(
      `SELECT r.*, po.order_no, s.name AS supplier_name
       FROM receipts r
       LEFT JOIN purchase_orders po ON r.purchase_order_id = po.id
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       WHERE r.tenant_id = ?
       ORDER BY r.id DESC
       LIMIT 200`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>()
  return c.json({ rows: rows.results })
})

// ============================================================
// API: 納品登録
// ============================================================
app.post('/receipts', async (c) => {
  const db = c.env.DB
  const body = await c.req.json<{
    order_id: number
    received_date?: string
    slip_date?: string
    inspected_by?: string
    note?: string
    no_slip?: boolean           // 納品書なしフラグ
    slip_note?: string          // 照合メモ
    actual_supplier_id?: number | null  // 実際の仕入先
    items: Array<{
      purchase_order_item_id: number
      received_quantity: number
      note?: string
      actual_unit_price?: number | null  // 納品書記載の実際の単価
    }>
  }>()

  const orderId = body.order_id
  const receivedDate = body.received_date || today()
  const slipDate = body.slip_date || null
  const inspectedBy = normalize(body.inspected_by)
  const note = normalize(body.note)
  const noSlip = body.no_slip ? 1 : 0
  const slipVerified = (slipDate || noSlip) ? 1 : 0  // 納品書日付入力済み or 納品書なし → 確認済み
  const slipNote = normalize(body.slip_note)
  const actualSupplierId = body.actual_supplier_id ?? null

  const tenantId = getTenantId(c)

  // actual_supplier_id の存在チェック
  if (actualSupplierId) {
    const sup = await db.prepare('SELECT id FROM suppliers WHERE id=? AND tenant_id=?')
      .bind(actualSupplierId, tenantId).first()
    if (!sup) return c.json({ error: '指定した仕入先が見つかりません。' }, 400)
  }

  const ins = await db
    .prepare(
      `INSERT INTO receipts
        (purchase_order_id, received_date, slip_date, inspected_by, note,
         slip_verified, no_slip, slip_note, actual_supplier_id,
         slip_checked_by, slip_checked_at, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      orderId, receivedDate, slipDate, inspectedBy, note,
      slipVerified, noSlip, slipNote, actualSupplierId,
      inspectedBy,  // 検品者 = 照合確認者として自動セット
      slipVerified ? new Date().toISOString() : null,
      tenantId
    )
    .run()
  const receiptId = ins.meta.last_row_id as number

  // 発注明細の定価を一括取得（掛率自動計算用）
  const allPoiIds = (body.items || [])
    .filter(i => i.received_quantity > 0)
    .map(i => i.purchase_order_item_id)
  const poiMap = new Map<number, { list_price: number | null; unit_price: number | null }>()
  if (allPoiIds.length > 0) {
    const inClause = allPoiIds.map(() => '?').join(',')
    const poiRows = await db.prepare(
      `SELECT id, list_price, unit_price FROM purchase_order_items WHERE id IN (${inClause})`
    ).bind(...allPoiIds).all<{ id: number; list_price: number | null; unit_price: number | null }>()
    for (const p of poiRows.results) poiMap.set(p.id, p)
  }

  let added = 0
  for (const item of body.items || []) {
    if (!item.received_quantity || item.received_quantity <= 0) continue
    const poi = poiMap.get(item.purchase_order_item_id)
    const listPrice = poi?.list_price ?? null
    // 実際の単価：入力値 > 発注時単価 の優先順
    const actualUnitPrice = item.actual_unit_price != null
      ? Number(item.actual_unit_price)
      : (poi?.unit_price ?? null)
    const actualRate = (actualUnitPrice != null && listPrice != null && listPrice > 0)
      ? Math.round((actualUnitPrice / listPrice) * 10000) / 10000  // 小数4桁
      : null
    const actualAmount = actualUnitPrice != null
      ? Math.round(actualUnitPrice * item.received_quantity)
      : null

    await db
      .prepare(
        `INSERT INTO receipt_items
          (receipt_id, purchase_order_item_id, received_quantity, note,
           actual_unit_price, actual_rate, actual_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        receiptId, item.purchase_order_item_id, item.received_quantity,
        normalize(item.note), actualUnitPrice, actualRate, actualAmount
      )
      .run()
    added += item.received_quantity
  }

  await updateOrderStatus(db, orderId)
  return c.json({ ok: true, receipt_id: receiptId, added_quantity: added })
})

// ============================================================
// API: 納品履歴編集 (PUT /api/receipts/:id)
// ============================================================
app.put('/receipts/:id', async (c) => {
  const db = c.env.DB
  const receiptId = parseInt(c.req.param('id'))
  if (isNaN(receiptId)) return c.json({ error: '不正なIDです。' }, 400)

  const body = await c.req.json<{
    received_date?: string
    slip_date?: string
    inspected_by?: string
    note?: string
    // 納品書照合フィールド
    slip_verified?: boolean      // 納品書確認済みフラグ
    no_slip?: boolean            // 納品書なしフラグ
    slip_checked_by?: string     // 確認担当者
    slip_note?: string           // 照合メモ（差異内容など）
    // 仕入先変更
    actual_supplier_id?: number | null  // 実際の仕入先（発注と異なる場合）
    // 明細
    items?: Array<{
      receipt_item_id: number
      received_quantity: number
      note?: string
      actual_unit_price?: number | null  // 納品書記載の実際の単価（編集画面からの更新）
    }>
  }>()

  const tenantId = getTenantId(c)
  // ヘッダー確認 + 既存明細の poi_id マップを並列取得
  const [receipt, existingItems] = await Promise.all([
    db.prepare('SELECT id, purchase_order_id FROM receipts WHERE id=? AND tenant_id=?')
      .bind(receiptId, tenantId).first<{ id: number; purchase_order_id: number | null }>(),
    db.prepare('SELECT id, purchase_order_item_id FROM receipt_items WHERE receipt_id=?')
      .bind(receiptId).all<{ id: number; purchase_order_item_id: number | null }>()
  ])
  if (!receipt) return c.json({ error: '納品データが見つかりません。' }, 404)

  // actual_supplier_id の仕入先存在チェック
  if (body.actual_supplier_id != null) {
    const sup = await db.prepare('SELECT id FROM suppliers WHERE id=? AND tenant_id=?')
      .bind(body.actual_supplier_id, tenantId).first()
    if (!sup) return c.json({ error: '指定した仕入先が見つかりません。' }, 400)
  }

  // receipt_item_id → purchase_order_item_id のマップ
  const poiMap = new Map<number, number | null>()
  for (const ri of existingItems.results) poiMap.set(ri.id, ri.purchase_order_item_id)

  // actual_unit_price が指定された明細の list_price を一括取得（掛率自動計算用）
  const poiIdsForPrice: number[] = []
  for (const item of (body.items || [])) {
    if (item.actual_unit_price == null) continue
    const poiId = poiMap.get(item.receipt_item_id)
    if (poiId) poiIdsForPrice.push(poiId)
  }
  const poiPriceMap = new Map<number, { list_price: number | null; quantity: number }>()
  if (poiIdsForPrice.length > 0) {
    const inClause = poiIdsForPrice.map(() => '?').join(',')
    const poiRows = await db.prepare(
      `SELECT id, list_price, quantity FROM purchase_order_items WHERE id IN (${inClause})`
    ).bind(...poiIdsForPrice).all<{ id: number; list_price: number | null; quantity: number }>()
    for (const p of poiRows.results) poiPriceMap.set(p.id, p)
  }

  // すべての更新を並列実行
  const updatePromises: Promise<unknown>[] = []

  // ヘッダー更新（納品書照合・仕入先変更含む）
  const sets: string[] = []
  const binds: unknown[] = []
  if (body.received_date !== undefined)      { sets.push('received_date=?');      binds.push(body.received_date) }
  if (body.slip_date     !== undefined)      { sets.push('slip_date=?');           binds.push(body.slip_date || null) }
  if (body.inspected_by  !== undefined)      { sets.push('inspected_by=?');        binds.push(normalize(body.inspected_by)) }
  if (body.note          !== undefined)      { sets.push('note=?');                binds.push(normalize(body.note)) }
  if (body.slip_note     !== undefined)      { sets.push('slip_note=?');           binds.push(normalize(body.slip_note)) }
  // 納品書なしフラグ: trueにしたらslip_verifiedも1にする（照合済み扱い）
  if (body.no_slip !== undefined) {
    const noSlipVal = body.no_slip ? 1 : 0
    sets.push('no_slip=?'); binds.push(noSlipVal)
    if (body.no_slip) {
      sets.push('slip_verified=?'); binds.push(1)
    }
  }
  // slip_verified 自動化ロジック:
  //   ① no_slip=true → 強制的に slip_verified=1
  //   ② slip_date が入力されている → 自動で slip_verified=1
  //   ③ それ以外: body.slip_verified の値をそのまま使用
  const autoVerify = (!!(body.no_slip) || !!(body.slip_date && body.slip_date.length > 0))
  if (!body.no_slip) {
    // no_slip は上のブロックで設定済み。here は no_slip=false or undefined の場合
    if (body.slip_verified !== undefined || autoVerify) {
      const verifiedVal = autoVerify ? 1 : (body.slip_verified ? 1 : 0)
      sets.push('slip_verified=?'); binds.push(verifiedVal)
    }
  }
  // 確認担当者・確認日時（確認済みになる場合のみ設定）
  const willBeVerified = autoVerify || body.slip_verified || body.no_slip
  if (willBeVerified) {
    if (body.slip_checked_by !== undefined) { sets.push('slip_checked_by=?'); binds.push(normalize(body.slip_checked_by)) }
    sets.push('slip_checked_at=?'); binds.push(new Date().toISOString())
  } else if (body.slip_verified === false && !body.no_slip) {
    sets.push('slip_checked_by=?'); binds.push(null)
    sets.push('slip_checked_at=?'); binds.push(null)
  }
  // 実際の仕入先（NULL許容）
  if (body.actual_supplier_id !== undefined) {
    sets.push('actual_supplier_id=?'); binds.push(body.actual_supplier_id ?? null)
  }
  if (sets.length) {
    binds.push(receiptId)
    updatePromises.push(
      db.prepare(`UPDATE receipts SET ${sets.join(',')} WHERE id=?`).bind(...binds).run()
    )
  }

  // 明細更新（receipt_items）: 数量・備考・実際の単価・掛率・金額
  for (const item of (body.items || [])) {
    if (!item.receipt_item_id) continue
    const poiId = poiMap.get(item.receipt_item_id)
    const poiData = poiId ? poiPriceMap.get(poiId) : undefined
    const listPrice = poiData?.list_price ?? null

    if (item.actual_unit_price != null) {
      // 実際の単価が指定された場合：掛率・金額を自動計算
      const actualUnitPrice = Number(item.actual_unit_price)
      const actualRate = (listPrice != null && listPrice > 0)
        ? Math.round((actualUnitPrice / listPrice) * 10000) / 10000
        : null
      const actualAmount = Math.round(actualUnitPrice * item.received_quantity)
      updatePromises.push(
        db.prepare(
          `UPDATE receipt_items SET received_quantity=?, note=?,
           actual_unit_price=?, actual_rate=?, actual_amount=?
           WHERE id=? AND receipt_id=?`
        ).bind(
          item.received_quantity, normalize(item.note),
          actualUnitPrice, actualRate, actualAmount,
          item.receipt_item_id, receiptId
        ).run()
      )
    } else {
      // 単価指定なし：数量・備考のみ更新
      updatePromises.push(
        db.prepare('UPDATE receipt_items SET received_quantity=?, note=? WHERE id=? AND receipt_id=?')
          .bind(item.received_quantity, normalize(item.note), item.receipt_item_id, receiptId).run()
      )
    }
  }

  await Promise.all(updatePromises)

  // 発注ステータス再計算
  if (receipt.purchase_order_id) await updateOrderStatus(db, receipt.purchase_order_id)

  return c.json({ ok: true })
})

// ============================================================
// API: 納品書チェック一括ステータス取得 (GET /api/receipts/slip-status)
// ============================================================
app.get('/receipts/slip-status', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const rows = await db.prepare(`
    SELECT
      SUM(CASE WHEN slip_verified=1 OR no_slip=1 THEN 1 ELSE 0 END) AS checked,
      SUM(CASE WHEN slip_verified=0 AND no_slip=0 THEN 1 ELSE 0 END) AS unchecked,
      SUM(CASE WHEN no_slip=1 THEN 1 ELSE 0 END) AS no_slip_count,
      COUNT(*) AS total
    FROM receipts WHERE tenant_id=?
  `).bind(tenantId).first<Record<string, number>>()
  return c.json(rows)
})

// ============================================================
// API: システム外発注の自由納品登録 (POST /api/receipts/free)
// ============================================================
app.post('/receipts/free', async (c) => {
  const db = c.env.DB
  const body = await c.req.json<{
    supplier_id: number
    received_date?: string
    slip_date?: string
    inspected_by?: string
    note?: string
    no_slip?: boolean
    slip_note?: string
    items: Array<{
      product_name: string
      spec?: string
      quantity: number
      unit_price?: number | null
      note?: string
    }>
  }>()

  if (!body.supplier_id) return c.json({ error: '仕入先は必須です。' }, 400)
  if (!body.items || body.items.length === 0) return c.json({ error: '明細が空です。' }, 400)

  const receivedDate = body.received_date || today()
  const slipDate     = body.slip_date || null
  const inspectedBy  = normalize(body.inspected_by)
  const note         = normalize(body.note)
  const noSlip       = body.no_slip ? 1 : 0
  const slipVerified = (slipDate || noSlip) ? 1 : 0
  const slipNote     = normalize(body.slip_note)

  const tenantId = getTenantId(c)
  // receipts に purchase_order_id=NULL で登録
  const ins = await db.prepare(
    `INSERT INTO receipts
      (purchase_order_id, received_date, slip_date, inspected_by, note,
       slip_verified, no_slip, slip_note,
       slip_checked_by, slip_checked_at, tenant_id)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    receivedDate, slipDate, inspectedBy, note,
    slipVerified, noSlip, slipNote,
    inspectedBy,
    slipVerified ? new Date().toISOString() : null,
    tenantId
  ).run()
  const receiptId = ins.meta.last_row_id as number

  // receipt_items に purchase_order_item_id=NULL で登録
  for (const item of body.items) {
    if (!item.product_name?.trim() || !(item.quantity > 0)) continue
    const itemNote = [item.product_name.trim(), item.spec?.trim(), item.note?.trim()]
      .filter(Boolean).join(' / ')
    const actualUnitPrice = item.unit_price != null ? Number(item.unit_price) : null
    const actualAmount    = actualUnitPrice != null ? Math.round(actualUnitPrice * item.quantity) : null
    await db.prepare(
      `INSERT INTO receipt_items
        (receipt_id, purchase_order_item_id, received_quantity, note,
         actual_unit_price, actual_rate, actual_amount)
       VALUES (?, NULL, ?, ?, ?, NULL, ?)`
    ).bind(receiptId, item.quantity, itemNote, actualUnitPrice, actualAmount).run()
  }

  return c.json({ ok: true, receipt_id: receiptId })
})

// ============================================================
// API: 残注一覧
// ============================================================
app.get('/backorders', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const rows = await db
    .prepare(
      `SELECT po.order_no, po.order_date, po.customer_name, po.usage_type, po.requested_delivery_date,
              po.id AS purchase_order_id,
              s.name AS supplier_name,
              poi.*,
              COALESCE(SUM(ri.received_quantity), 0) AS received_qty,
              (poi.quantity - COALESCE(SUM(ri.received_quantity), 0)) AS backorder_qty,
              MAX(r.received_date) AS last_received_date
       FROM purchase_order_items poi
       JOIN purchase_orders po ON poi.purchase_order_id = po.id
       JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN receipt_items ri ON ri.purchase_order_item_id = poi.id
       LEFT JOIN receipts r ON ri.receipt_id = r.id
       WHERE po.tenant_id = ?
       GROUP BY poi.id
       HAVING COALESCE(SUM(ri.received_quantity), 0) < poi.quantity
       ORDER BY po.order_date DESC, po.order_no DESC`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>()
  return c.json({ rows: rows.results })
})

// ============================================================
// API: 商品候補一覧（新規発注用）
// ============================================================
app.get('/products-for-order', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const rows = await db
    .prepare(
      `SELECT p.id, p.item_category, p.manufacturer, p.name, p.spec, p.club_type,
              p.list_price, p.default_rate, s.name AS supplier_name
       FROM products p
       LEFT JOIN suppliers s ON p.default_supplier_id = s.id
       WHERE p.is_active = 1 AND p.tenant_id = ?
       ORDER BY p.item_category, p.manufacturer, p.name
       LIMIT 5000`
    )
    .bind(tenantId)
    .all<Record<string, unknown>>()
  return c.json({ products: rows.results })
})

// ============================================================
// API: 納品履歴 Excel ダウンロード
// ============================================================
app.get('/receipts/download', async (c) => {
  const db = c.env.DB

  // クエリパラメータで絞り込み (省略時は全件)
  const from = c.req.query('from') || ''
  const to   = c.req.query('to')   || ''
  const supplierId = c.req.query('supplier_id') || ''

  const tenantId = getTenantId(c)
  let sql = `
    SELECT
      po.order_date,
      po.ordered_by,
      po.order_no,
      COALESCE(sa.name, s.name) AS supplier_name,
      s.payment_method,
      po.customer_name,
      po.usage_type,
      r.received_date,
      r.slip_date,
      r.inspected_by,
      poi.item_category,
      poi.manufacturer,
      poi.product_name,
      poi.spec,
      poi.color,
      poi.club_type,
      ri.received_quantity,
      poi.list_price,
      -- 実際の掛率: receipt_items.actual_rate > poi.rate の優先順
      COALESCE(ri.actual_rate,  poi.rate)       AS used_rate,
      -- 実際の単価: receipt_items.actual_unit_price > poi.unit_price の優先順
      COALESCE(ri.actual_unit_price, poi.unit_price) AS used_unit_price,
      -- 実際の金額: receipt_items.actual_amount > 計算値 の優先順
      COALESCE(ri.actual_amount,
               ri.received_quantity * poi.unit_price) AS used_amount,
      ri.note             AS item_note,
      r.note              AS receipt_note
    FROM receipt_items ri
    JOIN receipts r             ON ri.receipt_id = r.id
    JOIN purchase_orders po     ON r.purchase_order_id = po.id
    JOIN suppliers s            ON po.supplier_id = s.id
    LEFT JOIN suppliers sa      ON r.actual_supplier_id = sa.id
    JOIN purchase_order_items poi ON ri.purchase_order_item_id = poi.id
    WHERE r.tenant_id = ?`

  const binds: unknown[] = [tenantId]
  if (from) { sql += ` AND r.received_date >= ?`; binds.push(from) }
  if (to)   { sql += ` AND r.received_date <= ?`; binds.push(to)   }
  if (supplierId) { sql += ` AND (po.supplier_id = ? OR r.actual_supplier_id = ?)`; binds.push(Number(supplierId)); binds.push(Number(supplierId)) }
  sql += ` ORDER BY r.received_date DESC, r.id DESC, poi.id ASC`

  const res = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>()
  const data = res.results

  // YYYY-MM-DD または YYYY/MM/DD → YYYY/MM/DD 形式に変換
  function fmtDate(v: unknown): string {
    if (!v) return ''
    const s = String(v).trim()
    // YYYY-MM-DD or YYYY/MM/DD
    const m = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/)
    if (m) return `${m[1]}/${m[2]}/${m[3]}`
    return s
  }

  // ── ヘッダ行 ──────────────────────────────────────────────
  // 列順: 注文日 注文者 品目 メーカー名 品名 個数 発注先 備考 顧客名 商品到着日
  //       検品者 納品書に記載されている日 定価 掛け率 単価 個数 金額 支払い 備考 送料
  //       ＋追加情報（発注番号 仕様 色 種類 用途）
  const HEADERS = [
    '注文日',               //  0
    '注文者',               //  1
    '品目',                 //  2
    'メーカー名',           //  3
    '品名',                 //  4
    '個数',                 //  5
    '発注先',               //  6
    '備考',                 //  7  ← 商品備考(item_note)
    '顧客名',               //  8
    '商品到着日',           //  9
    '検品者',               // 10
    '納品書に記載されている日', // 11
    '定価',                 // 12
    '掛け率',               // 13
    '単価',                 // 14
    '個数',                 // 15  ← 入荷数の再掲
    '金額',                 // 16
    '支払い',               // 17  ← DB未管理（空欄）
    '備考',                 // 18  ← 納品備考(receipt_note)
    '送料',                 // 19  ← DB未管理（空欄）
    // ── 追加情報（指定列の後ろ）──
    '発注番号',             // 20
    '仕様',                 // 21
    '色',                   // 22
    '種類',                 // 23
    '用途',                 // 24
  ]

  // styleId: 0=通常 1=ヘッダ 2=数値カンマ 3=パーセント 4=日付 5=合計行
  const headerRow = {
    cells: HEADERS as (string | number | null)[],
    rowStyle: 1,
  }

  // ── データ行 ──────────────────────────────────────────────
  const dataRows = data.map(r => ({
    cells: [
      fmtDate(r['order_date']),       //  0 注文日
      r['ordered_by'],                //  1 注文者
      r['item_category'],             //  2 品目
      r['manufacturer'],              //  3 メーカー名
      r['product_name'],              //  4 品名
      r['received_quantity'] != null ? Number(r['received_quantity']) : null, //  5 個数
      r['supplier_name'],             //  6 発注先
      r['item_note'],                 //  7 備考（商品備考）
      r['customer_name'],             //  8 顧客名
      fmtDate(r['received_date']),    //  9 商品到着日
      r['inspected_by'],              // 10 検品者
      fmtDate(r['slip_date']),        // 11 納品書に記載されている日
      r['list_price']     != null ? Number(r['list_price'])     : null, // 12 定価
      r['used_rate']      != null ? Number(r['used_rate'])      : null, // 13 掛け率（実績優先）
      r['used_unit_price']!= null ? Number(r['used_unit_price']): null, // 14 単価（実績優先）
      r['received_quantity'] != null ? Number(r['received_quantity']) : null, // 15 個数（再掲）
      r['used_amount']    != null ? Number(r['used_amount'])    : null, // 16 金額（実績優先）
      r['payment_method'] ?? null,    // 17 支払い（仕入先マスタから）
      r['receipt_note'],              // 18 備考（納品備考）
      null,                           // 19 送料（未管理）
      r['order_no'],                  // 20 発注番号
      r['spec'],                      // 21 仕様
      r['color'],                     // 22 色
      r['club_type'],                 // 23 種類
      r['usage_type'],                // 24 用途
    ] as (string | number | null)[],
    //         0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24
    styles: [  0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 2, 3, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0],
  }))

  // ── 合計行 ────────────────────────────────────────────────
  const totalQty    = data.reduce((s, r) => s + (Number(r['received_quantity']) || 0), 0)
  const totalAmount = data.reduce((s, r) => s + (Number(r['used_amount'])       || 0), 0)
  const TOTAL_COLS = HEADERS.length
  const totalCells: (string | number | null)[] = Array(TOTAL_COLS).fill(null)
  totalCells[0]  = '合計'
  totalCells[5]  = totalQty    // 個数
  totalCells[15] = totalQty    // 個数（再掲）
  totalCells[16] = totalAmount // 金額
  const totalRow = {
    cells: totalCells,
    styles: Array(TOTAL_COLS).fill(5) as number[],
  }

  const colWidths = [
    { col: 0,  width: 12 }, // 注文日
    { col: 1,  width: 14 }, // 注文者
    { col: 2,  width: 12 }, // 品目
    { col: 3,  width: 22 }, // メーカー名
    { col: 4,  width: 30 }, // 品名
    { col: 5,  width: 8  }, // 個数
    { col: 6,  width: 22 }, // 発注先
    { col: 7,  width: 20 }, // 備考（商品）
    { col: 8,  width: 16 }, // 顧客名
    { col: 9,  width: 12 }, // 商品到着日
    { col: 10, width: 10 }, // 検品者
    { col: 11, width: 18 }, // 納品書に記載されている日
    { col: 12, width: 10 }, // 定価
    { col: 13, width: 8  }, // 掛け率
    { col: 14, width: 10 }, // 単価
    { col: 15, width: 8  }, // 個数（再掲）
    { col: 16, width: 12 }, // 金額
    { col: 17, width: 10 }, // 支払い
    { col: 18, width: 20 }, // 備考（納品）
    { col: 19, width: 8  }, // 送料
    { col: 20, width: 22 }, // 発注番号
    { col: 21, width: 20 }, // 仕様
    { col: 22, width: 10 }, // 色
    { col: 23, width: 10 }, // 種類
    { col: 24, width: 10 }, // 用途
  ]

  const xlsxBytes = buildXlsx([headerRow, ...dataRows, totalRow], colWidths)

  // ファイル名: 納品履歴_YYYYMMDD.xlsx
  const dateStr = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo',
  }).replace(/\//g, '')
  const filename = encodeURIComponent(`納品履歴_${dateStr}.xlsx`)

  return new Response(xlsxBytes, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
      'Content-Length': String(xlsxBytes.length),
    },
  })
})

// ============================================================
// API: 仕入先 CRUD
// ============================================================
app.post('/suppliers', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const b = await c.req.json<Record<string, string>>()
  const r = await db.prepare(`
    INSERT INTO suppliers
      (name, alias_names, contact_name, honorific, order_method, order_method_detail,
       phone, fax, fax_number, email, cc_emails, line_id, line_group_id,
       payment_method, shipping_rule, free_shipping_threshold, website, postal_code, address, notes, is_active, updated_at, tenant_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP,?)
  `).bind(
    normalize(b['name']), normalize(b['alias_names']), normalize(b['contact_name']),
    normalize(b['honorific']) || '様', normalize(b['order_method']), normalize(b['order_method_detail']),
    normalize(b['phone']), normalize(b['fax']), normalize(b['fax_number']),
    normalize(b['email']), normalize(b['cc_emails']),
    normalize(b['line_id']), normalize(b['line_group_id']),
    normalize(b['payment_method']), normalize(b['shipping_rule']),
    b['free_shipping_threshold'] ? parseInt(b['free_shipping_threshold']) : null,
    normalize(b['website']), normalize(b['postal_code']), normalize(b['address']),
    normalize(b['notes']), tenantId
  ).run()
  return c.json({ ok: true, id: r.meta.last_row_id })
})

app.put('/suppliers/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const tenantId = getTenantId(c)
  const b = await c.req.json<Record<string, string>>()
  await db.prepare(`
    UPDATE suppliers SET
      name=?, alias_names=?, contact_name=?, honorific=?, order_method=?, order_method_detail=?,
      phone=?, fax=?, fax_number=?, email=?, cc_emails=?, line_id=?, line_group_id=?,
      payment_method=?, shipping_rule=?, free_shipping_threshold=?, website=?, postal_code=?, address=?, notes=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=? AND tenant_id=?
  `).bind(
    normalize(b['name']), normalize(b['alias_names']), normalize(b['contact_name']),
    normalize(b['honorific']) || '様', normalize(b['order_method']), normalize(b['order_method_detail']),
    normalize(b['phone']), normalize(b['fax']), normalize(b['fax_number']),
    normalize(b['email']), normalize(b['cc_emails']),
    normalize(b['line_id']), normalize(b['line_group_id']),
    normalize(b['payment_method']), normalize(b['shipping_rule']),
    b['free_shipping_threshold'] ? parseInt(b['free_shipping_threshold']) : null,
    normalize(b['website']), normalize(b['postal_code']), normalize(b['address']),
    normalize(b['notes']), id, tenantId
  ).run()
  return c.json({ ok: true })
})

app.delete('/suppliers/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const tenantId = getTenantId(c)
  await db.prepare('UPDATE suppliers SET is_active=0, updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=?').bind(id, tenantId).run()
  return c.json({ ok: true })
})

// ============================================================
// API: 商品別複数仕入先 CRUD
// ============================================================
// GET /product-suppliers/:product_id → 商品の仕入先一覧取得
app.get('/product-suppliers/:product_id', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const productId = parseInt(c.req.param('product_id'))
  if (isNaN(productId)) return c.json({ error: '不正なID' }, 400)
  const rows = await db.prepare(`
    SELECT ps.*, s.name AS supplier_name
    FROM product_suppliers ps
    JOIN suppliers s ON ps.supplier_id=s.id
    WHERE ps.product_id=? AND ps.tenant_id=?
    ORDER BY ps.is_default DESC, ps.sort_order ASC, ps.id ASC
  `).bind(productId, tenantId).all<Record<string,unknown>>()
  return c.json(rows.results)
})

// POST /product-suppliers → 商品仕入先を追加
app.post('/product-suppliers', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const b = await c.req.json<Record<string,unknown>>()
  const productId  = parseInt(String(b['product_id']  || ''))
  const supplierId = parseInt(String(b['supplier_id'] || ''))
  if (isNaN(productId) || isNaN(supplierId)) return c.json({ error: '不正なID' }, 400)
  // is_default=1 にする場合は他をリセット
  if (b['is_default']) {
    await db.prepare('UPDATE product_suppliers SET is_default=0 WHERE product_id=? AND tenant_id=?')
      .bind(productId, tenantId).run()
  }
  const r = await db.prepare(`
    INSERT INTO product_suppliers (product_id, supplier_id, rate, is_default, notes, sort_order, tenant_id)
    VALUES (?,?,?,?,?,?,?)
  `).bind(
    productId, supplierId,
    b['rate'] ? parseFloat(String(b['rate'])) : null,
    b['is_default'] ? 1 : 0,
    b['notes'] ? String(b['notes']) : null,
    b['sort_order'] ? parseInt(String(b['sort_order'])) : 0,
    tenantId
  ).run()
  return c.json({ ok: true, id: r.meta.last_row_id })
})

// PUT /product-suppliers/:id → 更新
app.put('/product-suppliers/:id', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json<Record<string,unknown>>()
  if (b['is_default']) {
    // 同商品の他をリセット
    const ps = await db.prepare('SELECT product_id FROM product_suppliers WHERE id=? AND tenant_id=?')
      .bind(id, tenantId).first<{product_id:number}>()
    if (ps) {
      await db.prepare('UPDATE product_suppliers SET is_default=0 WHERE product_id=? AND tenant_id=?')
        .bind(ps.product_id, tenantId).run()
    }
  }
  // is_defaultのみ変更する「デフォルト設定」モード（supplier_idが0または未指定の場合）
  const supplierId = b['supplier_id'] ? parseInt(String(b['supplier_id'])) : null
  if (!supplierId || supplierId === 0) {
    // is_defaultだけ更新
    await db.prepare('UPDATE product_suppliers SET is_default=? WHERE id=? AND tenant_id=?')
      .bind(b['is_default'] ? 1 : 0, id, tenantId).run()
  } else {
    await db.prepare(`
      UPDATE product_suppliers SET supplier_id=?, rate=?, is_default=?, notes=?, sort_order=?
      WHERE id=? AND tenant_id=?
    `).bind(
      supplierId,
      b['rate'] != null ? parseFloat(String(b['rate'])) : null,
      b['is_default'] ? 1 : 0,
      b['notes'] ? String(b['notes']) : null,
      b['sort_order'] ? parseInt(String(b['sort_order'])) : 0,
      id, tenantId
    ).run()
  }
  return c.json({ ok: true })
})

// DELETE /product-suppliers/:id → 削除
app.delete('/product-suppliers/:id', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const id = parseInt(c.req.param('id'))
  await db.prepare('DELETE FROM product_suppliers WHERE id=? AND tenant_id=?').bind(id, tenantId).run()
  return c.json({ ok: true })
})

// GET /products/:id/suppliers → 商品選択時の仕入先候補（掛け率付き）
app.get('/products/:id/suppliers', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const productId = parseInt(c.req.param('id'))
  if (isNaN(productId)) return c.json({ error: '不正なID' }, 400)
  // product_suppliersに登録があればそちら優先、なければデフォルト仕入先
  const rows = await db.prepare(`
    SELECT ps.supplier_id, s.name AS supplier_name, ps.rate, ps.is_default, ps.notes
    FROM product_suppliers ps
    JOIN suppliers s ON ps.supplier_id=s.id
    WHERE ps.product_id=? AND ps.tenant_id=?
    ORDER BY ps.is_default DESC, ps.sort_order ASC
  `).bind(productId, tenantId).all<Record<string,unknown>>()

  if (rows.results.length > 0) {
    return c.json(rows.results)
  }
  // フォールバック: productsテーブルのdefault_supplier_id + default_rate
  const prod = await db.prepare(`
    SELECT p.default_supplier_id AS supplier_id, s.name AS supplier_name, p.default_rate AS rate
    FROM products p LEFT JOIN suppliers s ON p.default_supplier_id=s.id
    WHERE p.id=? AND p.tenant_id=?
  `).bind(productId, tenantId).first<Record<string,unknown>>()
  return c.json(prod?.supplier_id ? [{ ...prod, is_default: 1, notes: null }] : [])
})

// ============================================================
// API: 商品マスタ CRUD
// ============================================================
app.post('/products', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const b = await c.req.json<Record<string, unknown>>()
  const r = await db.prepare(`
    INSERT INTO products
      (product_code, barcode, item_category, manufacturer, name, spec, color, club_type,
       list_price, default_rate, default_supplier_id, unit, source, is_active, tenant_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)
  `).bind(
    normalize(b['product_code'] as string), normalize(b['barcode'] as string),
    normalize(b['item_category'] as string), normalize(b['manufacturer'] as string),
    normalize(b['name'] as string), normalize(b['spec'] as string),
    normalize(b['color'] as string), normalize(b['club_type'] as string),
    b['list_price'] ? Number(b['list_price']) : null,
    b['default_rate'] ? Number(b['default_rate']) : null,
    b['default_supplier_id'] ? Number(b['default_supplier_id']) : null,
    normalize(b['unit'] as string) || '本',
    normalize(b['source'] as string), tenantId
  ).run()
  return c.json({ ok: true, id: r.meta.last_row_id })
})

app.get('/products/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const tenantId = getTenantId(c)
  const row = await db.prepare(
    `SELECT p.*, s.name AS supplier_name FROM products p
     LEFT JOIN suppliers s ON s.id = p.default_supplier_id
     WHERE p.id=? AND p.is_active=1 AND p.tenant_id=?`
  ).bind(id, tenantId).first()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

app.put('/products/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const tenantId = getTenantId(c)
  const b = await c.req.json<Record<string, unknown>>()
  await db.prepare(`
    UPDATE products SET
      product_code=?, barcode=?, item_category=?, manufacturer=?, name=?, spec=?, color=?, club_type=?,
      list_price=?, default_rate=?, default_supplier_id=?, unit=?, source=?
    WHERE id=? AND tenant_id=?
  `).bind(
    normalize(b['product_code'] as string), normalize(b['barcode'] as string),
    normalize(b['item_category'] as string), normalize(b['manufacturer'] as string),
    normalize(b['name'] as string), normalize(b['spec'] as string),
    normalize(b['color'] as string), normalize(b['club_type'] as string),
    b['list_price'] ? Number(b['list_price']) : null,
    b['default_rate'] ? Number(b['default_rate']) : null,
    b['default_supplier_id'] ? Number(b['default_supplier_id']) : null,
    normalize(b['unit'] as string) || '本',
    normalize(b['source'] as string),
    id, tenantId
  ).run()
  return c.json({ ok: true })
})

app.delete('/products/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const tenantId = getTenantId(c)
  await db.prepare('UPDATE products SET is_active=0 WHERE id=? AND tenant_id=?').bind(id, tenantId).run()
  return c.json({ ok: true })
})

// ============================================================
// API: 商品 選択一括編集
// POST /api/products/bulk-update
// Body: { ids: number[], fields: { manufacturer?, item_category?, club_type?,
//          default_rate?, list_price?, default_supplier_id?, unit?, spec? } }
// ============================================================
app.post('/products/bulk-update', async (c) => {
  const db = c.env.DB
  const body = await c.req.json<{
    ids: number[]
    fields: Record<string, unknown>
  }>()
  const { ids, fields } = body

  if (!Array.isArray(ids) || ids.length === 0) {
    return c.json({ error: '対象IDが指定されていません' }, 400)
  }
  if (ids.length > 500) {
    return c.json({ error: '一度に編集できるのは500件までです' }, 400)
  }

  // 更新可能なフィールドのホワイトリスト
  const ALLOWED: Record<string, (v: unknown) => unknown> = {
    manufacturer:       v => String(v ?? '').trim() || null,
    item_category:      v => String(v ?? '').trim() || null,
    club_type:          v => String(v ?? '').trim() || null,
    default_rate:       v => { const n = parseFloat(String(v)); return isNaN(n) ? null : Math.min(1, Math.max(0, n)) },
    list_price:         v => { const n = parseFloat(String(v).replace(/,/g,'')); return isNaN(n) ? null : n },
    default_supplier_id:v => { const n = parseInt(String(v)); return isNaN(n) ? null : n },
    unit:               v => String(v ?? '').trim() || null,
  }

  // 空でない（変更対象）フィールドのみ抽出
  const setClauses: string[] = []
  const setValues: unknown[] = []
  for (const [key, converter] of Object.entries(ALLOWED)) {
    if (key in fields && fields[key] !== '' && fields[key] !== null && fields[key] !== undefined) {
      const val = converter(fields[key])
      if (val !== null) {
        setClauses.push(`${key}=?`)
        setValues.push(val)
      }
    }
  }

  if (setClauses.length === 0) {
    return c.json({ error: '更新する項目が選択されていません' }, 400)
  }

  // IN句用プレースホルダ
  const tenantId = getTenantId(c)
  const placeholders = ids.map(() => '?').join(',')
  const sql = `UPDATE products SET ${setClauses.join(', ')} WHERE id IN (${placeholders}) AND tenant_id=?`
  await db.prepare(sql).bind(...setValues, ...ids, tenantId).run()

  return c.json({ ok: true, updated: ids.length })
})

// ============================================================
// API: 商品 一括インポート
// POST /api/products/bulk-import
// Body: { rows: Array<{...}>, mode: 'insert'|'upsert' }
//   mode=insert : 新規追加のみ
//   mode=upsert : product_code が同じなら UPDATE、なければ INSERT
// ============================================================
app.post('/products/bulk-import', async (c) => {
  const db = c.env.DB
  const body = await c.req.json<{ rows: Record<string,unknown>[]; mode?: string }>()
  const rows = body.rows
  const mode = body.mode === 'upsert' ? 'upsert' : 'insert'

  if (!Array.isArray(rows) || rows.length === 0) {
    return c.json({ error: 'rows が空です' }, 400)
  }
  if (rows.length > 1000) {
    return c.json({ error: '一度に登録できるのは1,000件までです' }, 400)
  }

  // 必須チェック用ヘルパー
  const n = (v: unknown) => normalize(v as string)
  const num = (v: unknown) => {
    const x = Number(String(v ?? '').replace(/,/g, '').trim())
    return isNaN(x) ? null : x
  }

  // 仕入先名→IDキャッシュ（同一インポート内で重複ルックアップを避ける）
  const supplierCache = new Map<string, number | null>()
  const tenantId = getTenantId(c)
  const resolveSupplierName = async (nameRaw: string): Promise<number | null> => {
    const key = nameRaw.trim()
    if (!key) return null
    if (supplierCache.has(key)) return supplierCache.get(key)!
    const exact = await db.prepare(
      'SELECT id FROM suppliers WHERE name=? AND is_active=1 AND tenant_id=? LIMIT 1'
    ).bind(key, tenantId).first<{ id: number }>()
    if (exact) { supplierCache.set(key, exact.id); return exact.id }
    const like = await db.prepare(
      "SELECT id FROM suppliers WHERE name LIKE ? AND is_active=1 AND tenant_id=? ORDER BY length(name) LIMIT 1"
    ).bind(`%${key}%`, tenantId).first<{ id: number }>()
    const id = like?.id ?? null
    supplierCache.set(key, id)
    return id
  }

  // ----------------------------------------------------------------
  // バリエーション列パーサー（v2）
  //
  // 書式: "BL無:ブラック/レッド/ホワイト|BL有:ブラック/レッド/ホワイト"
  //   ・| (パイプ) でバックライン区切り
  //   ・: (コロン) の前がバックライン名（BL無/BL有など）、後が色一覧
  //   ・/ (スラッシュ) で色を区切り → color列に "/区切り" で保存
  //
  // バックラインがない商品（色だけ複数）の書式:
  //   "ブラック/レッド/ホワイト"  ← コロンなし＝バックライン区別なし → 1レコード
  //
  // 戻り値: [{ backline: string, colors: string }, ...]
  //   backline: "BL無" / "BL有" / "" （なし）
  //   colors  : "ブラック/レッド/ホワイト" （/区切り、そのままDBのcolorカラムへ）
  // ----------------------------------------------------------------
  type VarItem = { backline: string; colors: string }
  const parseVariations = (raw: string): VarItem[] => {
    const segments = raw.split('|').map(s => s.trim()).filter(Boolean)
    return segments.map(seg => {
      const colonIdx = seg.indexOf(':')
      if (colonIdx >= 0) {
        // "BL無:ブラック/レッド" 形式
        const backline = seg.slice(0, colonIdx).trim()
        const colors   = seg.slice(colonIdx + 1).trim()
        if (!colors) return null
        return { backline, colors }
      } else {
        // コロンなし = バックライン区別なし "ブラック/レッド/ホワイト"
        return { backline: '', colors: seg }
      }
    }).filter((x): x is VarItem => x !== null)
  }

  let inserted = 0
  let updated  = 0
  let skipped  = 0
  const errors: { row: number; msg: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const rowNum = i + 2  // Excel行番号（ヘッダー=1行目）

    const item_category  = n(r['item_category']  ?? r['品目'])
    const name           = n(r['name']            ?? r['商品名'])
    const manufacturer   = n(r['manufacturer']    ?? r['メーカー'])
    const spec           = n(r['spec']            ?? r['仕様'])
    const color          = n(r['color']           ?? r['色'])
    const club_type      = n(r['club_type']       ?? r['種類'])
    const list_price     = num(r['list_price']    ?? r['定価'])
    const default_rate   = num(r['default_rate']  ?? r['掛率'])
    const unit           = n(r['unit']            ?? r['単位']) || '本'
    const barcode        = n(r['barcode']         ?? r['バーコード'])
    const product_code   = n(r['product_code']    ?? r['品番'])
    const source         = n(r['source']          ?? r['出典'])
    const supplier_name_raw = n(
      r['supplier_name'] ?? r['仕入先名'] ?? r['仕入先'] ?? r['発注先'] ?? r['発注先名']
    )
    const variations_raw = n(r['variations'] ?? r['バリエーション'] ?? r['バリエ'])

    // 必須フィールド検証
    if (!item_category) {
      errors.push({ row: rowNum, msg: '品目が空です' }); skipped++; continue
    }
    if (!name) {
      errors.push({ row: rowNum, msg: '商品名が空です' }); skipped++; continue
    }
    if (default_rate !== null && (default_rate < 0 || default_rate > 1)) {
      errors.push({ row: rowNum, msg: `掛率は0〜1の範囲で入力してください (値: ${default_rate})` })
      skipped++; continue
    }

    // 仕入先名→ID解決
    let default_supplier_id: number | null = null
    if (supplier_name_raw) {
      default_supplier_id = await resolveSupplierName(supplier_name_raw)
      if (default_supplier_id === null) {
        errors.push({ row: rowNum, msg: `仕入先名 "${supplier_name_raw}" が見つかりませんでした（仕入先未設定で登録します）` })
      }
    }

    // ----------------------------------------------------------------
    // バリエーション展開
    // ----------------------------------------------------------------
    const varItems = variations_raw ? parseVariations(variations_raw) : []

    if (varItems.length > 0) {
      // バリエーションあり → バックライン別に1レコードずつ INSERT/UPSERT
      // color列に "/区切り" で複数色を保存、specにバックライン情報を付加
      for (const v of varItems) {
        const varSpec  = [spec, v.backline].filter(Boolean).join(' / ')  // 例: "M60 / BL無"
        const varColor = v.colors  // 例: "ブラック/レッド/ホワイト"
        // upsert: spec+name+manufacturer で既存レコードを照合
        try {
          if (mode === 'upsert') {
            const existing = await db.prepare(
              `SELECT id FROM products
               WHERE name=? AND manufacturer IS ? AND spec IS ? AND is_active=1 AND tenant_id=? LIMIT 1`
            ).bind(name, manufacturer || null, varSpec || null, tenantId).first<{ id: number }>()
            if (existing) {
              await db.prepare(`
                UPDATE products SET
                  item_category=?, color=?, club_type=?,
                  list_price=?, default_rate=?, unit=?, source=?,
                  default_supplier_id=COALESCE(?, default_supplier_id)
                WHERE id=?
              `).bind(
                item_category, varColor || null, club_type || null,
                list_price, default_rate, unit, source || null,
                default_supplier_id, existing.id
              ).run()
              updated++
              continue
            }
          }
          await db.prepare(`
            INSERT INTO products
              (item_category, manufacturer, name, spec, color, club_type,
               list_price, default_rate, unit, source, default_supplier_id, is_active, tenant_id)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?)
          `).bind(
            item_category, manufacturer || null, name,
            varSpec || null, varColor || null, club_type || null,
            list_price, default_rate, unit, source || null,
            default_supplier_id, tenantId
          ).run()
          inserted++
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err)
          errors.push({ row: rowNum, msg: `バリエーション "${v.backline || '色のみ'}": ${msg}` })
          skipped++
        }
      }
      continue  // 次の行へ
    }

    // ----------------------------------------------------------------
    // バリエーションなし → 従来通りの処理
    // ----------------------------------------------------------------
    try {
      if (mode === 'upsert' && product_code) {
        const existing = await db.prepare(
          'SELECT id FROM products WHERE product_code=? AND is_active=1 AND tenant_id=? LIMIT 1'
        ).bind(product_code, tenantId).first<{ id: number }>()
        if (existing) {
          await db.prepare(`
            UPDATE products SET
              item_category=?, manufacturer=?, name=?, spec=?, color=?, club_type=?,
              list_price=?, default_rate=?, unit=?, barcode=?, source=?,
              default_supplier_id=COALESCE(?, default_supplier_id)
            WHERE id=?
          `).bind(
            item_category, manufacturer || null, name, spec || null,
            color || null, club_type || null,
            list_price, default_rate, unit, barcode || null, source || null,
            default_supplier_id, existing.id
          ).run()
          updated++
          continue
        }
      }
      await db.prepare(`
        INSERT INTO products
          (product_code, barcode, item_category, manufacturer, name, spec, color, club_type,
           list_price, default_rate, unit, source, default_supplier_id, is_active, tenant_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)
      `).bind(
        product_code || null, barcode || null,
        item_category, manufacturer || null, name,
        spec || null, color || null, club_type || null,
        list_price, default_rate, unit, source || null,
        default_supplier_id, tenantId
      ).run()
      inserted++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ row: rowNum, msg })
      skipped++
    }
  }

  return c.json({ ok: true, inserted, updated, skipped, errors })
})

// ============================================================
// API: 判定ルール CRUD
// ============================================================
app.post('/rules', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const b = await c.req.json<Record<string, unknown>>()
  const r = await db.prepare(`
    INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes, tenant_id)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    normalize(b['item_category'] as string) || null,
    normalize(b['manufacturer'] as string) || null,
    normalize(b['club_type'] as string) || null,
    Number(b['supplier_id']),
    b['rate'] ? Number(b['rate']) : null,
    Number(b['priority']) || 100,
    normalize(b['notes'] as string),
    tenantId
  ).run()
  return c.json({ ok: true, id: r.meta.last_row_id })
})

app.put('/rules/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const tenantId = getTenantId(c)
  const b = await c.req.json<Record<string, unknown>>()
  await db.prepare(`
    UPDATE supplier_rules SET
      item_category=?, manufacturer=?, club_type=?, supplier_id=?, rate=?, priority=?, notes=?
    WHERE id=? AND tenant_id=?
  `).bind(
    normalize(b['item_category'] as string) || null,
    normalize(b['manufacturer'] as string) || null,
    normalize(b['club_type'] as string) || null,
    Number(b['supplier_id']),
    b['rate'] ? Number(b['rate']) : null,
    Number(b['priority']) || 100,
    normalize(b['notes'] as string),
    id, tenantId
  ).run()
  return c.json({ ok: true })
})

app.delete('/rules/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const tenantId = getTenantId(c)
  await db.prepare('DELETE FROM supplier_rules WHERE id=? AND tenant_id=?').bind(id, tenantId).run()
  return c.json({ ok: true })
})

// ============================================================
// API: 発注コピー（再発注）
// ============================================================
app.post('/orders/:id/copy', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const tenantId = getTenantId(c)
  const src = await db.prepare('SELECT * FROM purchase_orders WHERE id=? AND tenant_id=?').bind(id, tenantId).first<Record<string,unknown>>()
  if (!src) return c.json({ error: 'Not found' }, 404)
  const items = await db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id').bind(id).all<Record<string,unknown>>()

  const batchCode = nowCode() + '-' + Math.random().toString(36).substring(2, 8)
  const orderNo = 'PO-' + today().replace(/-/g,'') + '-' + uuid5()
  const ins = await db.prepare(`
    INSERT INTO purchase_orders
      (batch_code, order_no, order_date, ordered_by, supplier_id, customer_name,
       usage_type, requested_delivery_date, status, order_note, tenant_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    batchCode, orderNo, today(),
    src['ordered_by'], src['supplier_id'], src['customer_name'],
    src['usage_type'], src['requested_delivery_date'], 'draft_created', src['order_note'], tenantId
  ).run()
  const newOrderId = ins.meta.last_row_id as number

  for (const item of items.results) {
    await db.prepare(`
      INSERT INTO purchase_order_items
        (purchase_order_id, product_id, item_category, manufacturer, product_name,
         spec, color, club_type, quantity, list_price, rate, unit_price, amount,
         customer_name, usage_type, requested_delivery_date, line_note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      newOrderId, item['product_id'], item['item_category'], item['manufacturer'], item['product_name'],
      item['spec'], item['color'], item['club_type'], item['quantity'], item['list_price'],
      item['rate'], item['unit_price'], item['amount'],
      item['customer_name'], item['usage_type'], item['requested_delivery_date'], item['line_note']
    ).run()
  }

  // メール文生成
  const supplier = await db.prepare('SELECT * FROM suppliers WHERE id=? AND tenant_id=?').bind(src['supplier_id'], tenantId).first<Record<string,unknown>>()
  const newOrder = await db.prepare('SELECT * FROM purchase_orders WHERE id=? AND tenant_id=?').bind(newOrderId, tenantId).first<Record<string,unknown>>()
  const newItems = await db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id').bind(newOrderId).all<Record<string,unknown>>()
  if (supplier && newOrder) {
    const { subject, body } = composeMail(newOrder, newItems.results, supplier, senderInfoFromEnv(c.env))
    await db.prepare('UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?').bind(subject, body, newOrderId).run()
  }

  return c.json({ ok: true, order_id: newOrderId, batch_code: batchCode })
})

// ============================================================
// API: 発注ステータス変更
// ============================================================
// ============================================================
// API: 発注ヘッダー編集（発注者・顧客名・用途・希望納期・備考）
// ============================================================
app.put('/orders/:id/header', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: '不正なIDです。' }, 400)
  const tenantId = getTenantId(c)

  const order = await db.prepare(
    `SELECT po.*, s.* FROM purchase_orders po
     JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = ? AND po.tenant_id = ?`
  ).bind(id, tenantId).first<Record<string, unknown>>()
  if (!order) return c.json({ error: '発注が見つかりません。' }, 404)

  const body = await c.req.json<{
    order_date?: string
    ordered_by?: string
    customer_name?: string
    usage_type?: string
    requested_delivery_date?: string
    order_note?: string
  }>()

  await db.prepare(`
    UPDATE purchase_orders
    SET order_date=?, ordered_by=?, customer_name=?,
        usage_type=?, requested_delivery_date=?, order_note=?
    WHERE id=? AND tenant_id=?
  `).bind(
    normalize(body.order_date)                || order['order_date'],
    normalize(body.ordered_by)                || order['ordered_by'],
    normalize(body.customer_name)             ?? null,
    normalize(body.usage_type)                ?? null,
    normalize(body.requested_delivery_date)   ?? null,
    normalize(body.order_note)                ?? null,
    id, tenantId
  ).run()

  // メール本文を再生成（発注者名・備考が本文に影響するため）
  const updatedOrder = await db.prepare('SELECT * FROM purchase_orders WHERE id=? AND tenant_id=?')
    .bind(id, tenantId).first<Record<string, unknown>>()
  const supplier = await db.prepare('SELECT * FROM suppliers WHERE id=? AND tenant_id=?')
    .bind(order['supplier_id'], tenantId).first<Record<string, unknown>>()
  const items = await db.prepare(
    'SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id'
  ).bind(id).all<Record<string, unknown>>()

  if (updatedOrder && supplier && items.results.length > 0) {
    const { subject, body: mailBody } = composeMail(updatedOrder, items.results, supplier, senderInfoFromEnv(c.env))
    await db.prepare('UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?')
      .bind(subject, mailBody, id).run()
  }

  return c.json({ ok: true })
})

app.post('/orders/:id/status', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const tenantId = getTenantId(c)
  const { status } = await c.req.json<{ status: string }>()
  const allowed = ['draft','draft_created','ordered','partial','completed','cancelled']
  if (!allowed.includes(status)) return c.json({ error: 'invalid status' }, 400)

  // 「完納にする」ボタン押下時：未入荷分を自動で入荷登録する
  if (status === 'completed') {
    const today = new Date().toISOString().slice(0, 10)

    // 各明細の未入荷数を取得
    const items = await db.prepare(`
      SELECT poi.id AS poi_id, poi.quantity,
             COALESCE(SUM(ri.received_quantity), 0) AS received_qty
      FROM purchase_order_items poi
      LEFT JOIN receipt_items ri ON ri.purchase_order_item_id = poi.id
      WHERE poi.purchase_order_id = ?
      GROUP BY poi.id, poi.quantity
    `).bind(id).all<{ poi_id: number; quantity: number; received_qty: number }>()

    const pendingItems = items.results.filter(i => i.received_qty < i.quantity)

    if (pendingItems.length > 0) {
      // 入荷ヘッダーを作成
      const ins = await db.prepare(
        `INSERT INTO receipts (purchase_order_id, received_date, slip_date, inspected_by, note)
         VALUES (?, ?, NULL, '', '完納処理により自動登録')`
      ).bind(id, today).run()
      const receiptId = ins.meta.last_row_id as number

      // 各明細の残量を入荷明細として登録
      for (const item of pendingItems) {
        const remaining = item.quantity - item.received_qty
        await db.prepare(
          `INSERT INTO receipt_items (receipt_id, purchase_order_item_id, received_quantity, note)
           VALUES (?, ?, ?, '')`
        ).bind(receiptId, item.poi_id, remaining).run()
      }
    }
  }

  await db.prepare('UPDATE purchase_orders SET status=? WHERE id=? AND tenant_id=?').bind(status, id, tenantId).run()

  // 「発注済み」に変更した場合: 同一顧客の別仕入先でまだメールを送っていない発注を探す
  // → batch_codeがある場合はそちらを優先、なければbatch_codeを探す
  let nextMailBatch: string | null = null
  let nextOrderId: number | null = null
  if (status === 'ordered') {
    // 現在の発注情報（顧客名）を取得
    const cur = await db.prepare(
      'SELECT customer_name, batch_code FROM purchase_orders WHERE id=? AND tenant_id=?'
    ).bind(id, tenantId).first<{ customer_name: string | null; batch_code: string | null }>()

    if (cur?.customer_name && cur.customer_name.trim() && !cur.customer_name.startsWith('（')) {
      // 同一顧客名で status='draft_created' かつ発注書メールが作成済みのものを探す
      // （batch_codeがある → メールバッチ画面へ誘導）
      const next = await db.prepare(`
        SELECT po.id, po.batch_code
        FROM purchase_orders po
        WHERE po.tenant_id=?
          AND po.customer_name=?
          AND po.status='draft_created'
          AND po.id != ?
          AND po.batch_code IS NOT NULL
        ORDER BY po.id ASC
        LIMIT 1
      `).bind(tenantId, cur.customer_name, id).first<{ id: number; batch_code: string }>()

      if (next) {
        nextMailBatch = next.batch_code
        nextOrderId   = next.id
      } else {
        // batch_codeなしの draft_created（発注番号が付いてるがメールバッチ未作成）も対象
        const next2 = await db.prepare(`
          SELECT po.id
          FROM purchase_orders po
          WHERE po.tenant_id=?
            AND po.customer_name=?
            AND po.status='draft_created'
            AND po.id != ?
          ORDER BY po.id ASC
          LIMIT 1
        `).bind(tenantId, cur.customer_name, id).first<{ id: number }>()
        if (next2) {
          nextOrderId = next2.id
        }
      }
    }
  }

  return c.json({ ok: true, next_mail_batch: nextMailBatch, next_order_id: nextOrderId })
})

// ============================================================
// API: 発注削除
// ============================================================
app.delete('/orders/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: '不正なIDです' }, 400)

  const tenantId = getTenantId(c)
  // 存在確認
  const order = await db.prepare('SELECT id, order_no FROM purchase_orders WHERE id=? AND tenant_id=?')
    .bind(id, tenantId).first<{ id: number; order_no: string }>()
  if (!order) return c.json({ error: '発注が見つかりません' }, 404)

  // 関連レコードを依存順に削除（receipt_items → receipts → purchase_order_items → purchase_orders）
  const receiptIds = await db.prepare(
    'SELECT id FROM receipts WHERE purchase_order_id=?'
  ).bind(id).all<{ id: number }>()

  for (const r of receiptIds.results) {
    await db.prepare('DELETE FROM receipt_items WHERE receipt_id=?').bind(r.id).run()
  }
  await db.prepare('DELETE FROM receipts WHERE purchase_order_id=?').bind(id).run()
  await db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id=?').bind(id).run()
  await db.prepare('DELETE FROM purchase_orders WHERE id=?').bind(id).run()

  return c.json({ ok: true, order_no: order.order_no })
})

// ============================================================
// API: バックアップ / リストア
// ============================================================

const BACKUP_TABLES = ['suppliers', 'supplier_rules', 'products', 'purchase_orders', 'purchase_order_items', 'receipts', 'receipt_items'] as const
type BackupTable = typeof BACKUP_TABLES[number]

// CSVエスケープ
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const keys = Object.keys(rows[0])
  const header = keys.join(',')
  const body = rows.map(r => keys.map(k => csvEscape(r[k])).join(',')).join('\n')
  return header + '\n' + body
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = false
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') { inQuote = true }
      else if (ch === ',') { result.push(cur); cur = '' }
      else { cur += ch }
    }
  }
  result.push(cur)
  return result
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseCsvLine(line)
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = vals[i] ?? '' })
    return obj
  })
}

// ── GET /api/backup/all ────────────────────────────────────
// ============================================================
// API: ダッシュボード用 検品待ち明細一覧
// GET /api/dashboard/pending-inspection
// → ordered / partial 状態の発注の未検品明細を返す
// ============================================================
app.get('/dashboard/pending-inspection', async (c) => {
  const db = c.env.DB
  const tenantId = getTenantId(c)
  const res = await db.prepare(`
    SELECT
      poi.id            AS poi_id,
      poi.purchase_order_id AS order_id,
      po.order_no,
      po.status,
      po.order_date,
      s.name            AS supplier_name,
      po.customer_name,
      poi.item_category,
      poi.manufacturer,
      poi.product_name,
      poi.spec,
      poi.color,
      poi.club_type,
      poi.quantity,
      COALESCE((SELECT SUM(ri.received_quantity) FROM receipt_items ri WHERE ri.purchase_order_item_id=poi.id),0) AS received_qty,
      poi.is_free
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.purchase_order_id
    JOIN suppliers s ON s.id = po.supplier_id
    WHERE po.status IN ('ordered','partial')
      AND poi.inspected = 0
      AND po.tenant_id = ?
    ORDER BY po.order_date ASC, po.id ASC, poi.id ASC
    LIMIT 200
  `).bind(tenantId).all<Record<string, unknown>>()

  return c.json({ items: res.results })
})

// ============================================================
// PATCH /api/orders/:id/items/:poi_id/inspect
// ダッシュボードの検品ボタン → inspected フラグを 1 に更新
// ============================================================
app.patch('/orders/:id/items/:poi_id/inspect', async (c) => {
  const db     = c.env.DB
  const orderId  = Number(c.req.param('id'))
  const poiId    = Number(c.req.param('poi_id'))
  const tenantId = getTenantId(c)

  if (isNaN(orderId) || isNaN(poiId)) {
    return c.json({ error: 'Invalid id' }, 400)
  }

  // 明細が該当発注に属することを確認（tenant_idも検証）
  const poi = await db.prepare(
    `SELECT poi.id, poi.inspected FROM purchase_order_items poi
     JOIN purchase_orders po ON po.id = poi.purchase_order_id
     WHERE poi.id=? AND poi.purchase_order_id=? AND po.tenant_id=?`
  ).bind(poiId, orderId, tenantId).first<{ id: number; inspected: number }>()

  if (!poi) {
    return c.json({ error: '明細が見つかりません' }, 404)
  }

  // inspected = 1 に更新
  await db.prepare(
    'UPDATE purchase_order_items SET inspected=1 WHERE id=?'
  ).bind(poiId).run()

  // 同一発注の未検品明細が残っているか確認
  const remain = await db.prepare(
    'SELECT COUNT(*) AS c FROM purchase_order_items WHERE purchase_order_id=? AND inspected=0'
  ).bind(orderId).first<{ c: number }>()

  const allInspected = (remain?.c ?? 0) === 0

  return c.json({ ok: true, all_inspected: allInspected })
})

app.get('/backup/all', async (c) => {
  const db = c.env.DB
  const data: Record<string, unknown[]> = {}
  for (const tbl of BACKUP_TABLES) {
    const res = await db.prepare(`SELECT * FROM ${tbl} ORDER BY id`).all<Record<string, unknown>>()
    data[tbl] = res.results
  }
  const payload = {
    exported_at: new Date().toISOString(),
    version: '1.0',
    tables: data
  }
  const filename = `golfwing_backup_${today()}.json`
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  })
})

// ── GET /api/backup/csv/:table ─────────────────────────────
app.get('/backup/csv/:table', async (c) => {
  const tbl = c.req.param('table') as BackupTable
  if (!BACKUP_TABLES.includes(tbl)) return c.json({ error: 'Unknown table' }, 400)
  const db = c.env.DB
  const res = await db.prepare(`SELECT * FROM ${tbl} ORDER BY id`).all<Record<string, unknown>>()
  const csv = rowsToCsv(res.results)
  const filename = `${tbl}_${today()}.csv`
  return new Response('\uFEFF' + csv, {   // BOM付きUTF-8 → Excelで開ける
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  })
})

// ── POST /api/backup/restore/all ──────────────────────────
// Body: JSON file content (same format as /api/backup/all output)
app.post('/backup/restore/all', async (c) => {
  let payload: { tables?: Record<string, unknown[]> }
  try {
    payload = await c.req.json()
  } catch {
    return c.json({ error: 'JSONパースエラー' }, 400)
  }
  if (!payload?.tables) return c.json({ error: 'tables フィールドがありません' }, 400)

  const db = c.env.DB
  const stats: Record<string, number> = {}

  // 外部キー制約があるため削除順序を逆にする
  const deleteOrder: BackupTable[] = ['receipt_items', 'receipts', 'purchase_order_items', 'purchase_orders', 'supplier_rules', 'products', 'suppliers']

  try {
    // 全テーブル削除
    for (const tbl of deleteOrder) {
      await db.prepare(`DELETE FROM ${tbl}`).run()
    }

    // インサート順序（親→子）
    const insertOrder: BackupTable[] = ['suppliers', 'products', 'supplier_rules', 'purchase_orders', 'purchase_order_items', 'receipts', 'receipt_items']
    for (const tbl of insertOrder) {
      const rows = (payload.tables[tbl] ?? []) as Record<string, unknown>[]
      if (rows.length === 0) { stats[tbl] = 0; continue }
      const keys = Object.keys(rows[0]).filter(k => k !== 'id')  // idはAUTOINCREMENT
      // idを含めて強制的に挿入（シーケンスの整合性のためにIDも復元）
      const allKeys = Object.keys(rows[0])
      let inserted = 0
      for (const row of rows) {
        const placeholders = allKeys.map(() => '?').join(',')
        const vals = allKeys.map(k => row[k] ?? null)
        await db.prepare(`INSERT OR REPLACE INTO ${tbl} (${allKeys.join(',')}) VALUES (${placeholders})`).bind(...vals).run()
        inserted++
      }
      stats[tbl] = inserted
      void keys  // 未使用変数警告抑制
    }

    return c.json({ ok: true, stats })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: 'リストア中にエラーが発生しました: ' + msg }, 500)
  }
})

// ── POST /api/backup/restore/csv ──────────────────────────
// Body: { table: string, mode: 'append'|'replace', csv: string }
app.post('/backup/restore/csv', async (c) => {
  let body: { table?: string; mode?: string; csv?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'JSONパースエラー' }, 400)
  }
  const { table, mode = 'append', csv } = body
  if (!table || !BACKUP_TABLES.includes(table as BackupTable)) {
    return c.json({ error: '不正なテーブル名です' }, 400)
  }
  if (!csv || csv.trim() === '') return c.json({ error: 'CSVデータが空です' }, 400)

  const rows = parseCsv(csv)
  if (rows.length === 0) return c.json({ error: 'CSVに有効なデータがありません' }, 400)

  const db = c.env.DB
  let inserted = 0
  const errors: string[] = []

  try {
    if (mode === 'replace') {
      await db.prepare(`DELETE FROM ${table}`).run()
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      // 空行スキップ
      if (Object.values(row).every(v => v === '')) continue
      try {
        const keys = Object.keys(row)
        const placeholders = keys.map(() => '?').join(',')
        const vals = keys.map(k => {
          const v = row[k]
          if (v === '' || v === null || v === undefined) return null
          // 数値カラムは変換
          const numCols = ['id','is_active','list_price','default_rate','rate','priority','quantity','unit_price','amount','supplier_id','default_supplier_id','purchase_order_id','product_id','purchase_order_item_id']
          if (numCols.includes(k) && v !== '') return isNaN(Number(v)) ? null : Number(v)
          return v
        })
        await db.prepare(`INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${placeholders})`).bind(...vals).run()
        inserted++
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`行${i + 2}: ${msg}`)
      }
    }
    return c.json({ ok: true, inserted, errors })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return c.json({ error: 'CSVリストア中にエラー: ' + msg }, 500)
  }
})

export { app as apiRoutes }
