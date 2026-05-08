import { Hono } from 'hono'

type Bindings = { DB: D1Database }
const app = new Hono<{ Bindings: Bindings }>()

// ============================================================
// ユーティリティ
// ============================================================
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
  productId?: number | null
): Promise<{ supplier: Record<string, unknown> | null; rate: number | null }> {
  if (productId) {
    const p = await db
      .prepare(
        'SELECT p.*, s.name AS supplier_name FROM products p LEFT JOIN suppliers s ON p.default_supplier_id=s.id WHERE p.id=?'
      )
      .bind(productId)
      .first<Record<string, unknown>>()
    if (p && p['default_supplier_id']) {
      const s = await db
        .prepare('SELECT * FROM suppliers WHERE id=?')
        .bind(p['default_supplier_id'])
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
       ORDER BY
         CASE WHEN sr.item_category = ? THEN 0 ELSE 1 END,
         CASE WHEN sr.manufacturer = ? THEN 0 ELSE 1 END,
         CASE WHEN sr.club_type = ? THEN 0 ELSE 1 END,
         sr.priority ASC,
         sr.id ASC
       LIMIT 1`
    )
    .bind(itemCategory, manufacturer, clubType, itemCategory, manufacturer, clubType)
    .first<Record<string, unknown>>()

  if (rows) {
    const supplier = await db
      .prepare('SELECT * FROM suppliers WHERE id=?')
      .bind(rows['supplier_id'])
      .first<Record<string, unknown>>()
    return { supplier: supplier ?? null, rate: (rows['rate'] as number) ?? null }
  }
  return { supplier: null, rate: null }
}

function composeMail(
  order: Record<string, unknown>,
  items: Record<string, unknown>[],
  supplier: Record<string, unknown>
): { subject: string; body: string } {
  const subject = `【ゴルフウィング発注】${order['order_no']} ${supplier['name']}`
  const lines = items.map((item) => {
    const spec = item['spec'] ? ` / ${item['spec']}` : ''
    const color = item['color'] ? ` / ${item['color']}` : ''
    const clubType = item['club_type'] ? ` / ${item['club_type']}` : ''
    const customer = item['customer_name'] ? ` / 顧客:${item['customer_name']}` : ''
    const usage = item['usage_type'] ? ` / 用途:${item['usage_type']}` : ''
    return `- ${item['item_category']} / ${item['manufacturer'] || ''} / ${item['product_name']}${spec}${color}${clubType} / 数量:${item['quantity']}${customer}${usage}`
  })

  const honorific = (supplier['honorific'] as string) || '様'
  const contact = (supplier['contact_name'] as string) || 'ご担当者'
  const body = `${supplier['name']}
${contact}${honorific}

いつもお世話になっております。ゴルフウィングです。
下記商品の発注をお願いいたします。

発注番号: ${order['order_no']}
発注日: ${order['order_date']}
希望納期: ${order['requested_delivery_date'] || '未設定'}

${lines.join('\n')}

備考:
${order['order_note'] || '特になし'}

以上、よろしくお願いいたします。`
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
  const [products, suppliers, orders, backorders] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS c FROM products WHERE is_active=1').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) AS c FROM suppliers WHERE is_active=1').first<{ c: number }>(),
    db.prepare('SELECT COUNT(*) AS c FROM purchase_orders').first<{ c: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM (
          SELECT poi.id
          FROM purchase_order_items poi
          LEFT JOIN receipt_items ri ON ri.purchase_order_item_id = poi.id
          GROUP BY poi.id, poi.quantity
          HAVING COALESCE(SUM(ri.received_quantity),0) < poi.quantity
        )`
      )
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
       GROUP BY po.id
       ORDER BY po.id DESC
       LIMIT 10`
    )
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
  const q = normalize(c.req.query('q'))
  let sql = `SELECT p.*, s.name AS supplier_name
             FROM products p
             LEFT JOIN suppliers s ON p.default_supplier_id = s.id
             WHERE p.is_active = 1`
  const params: unknown[] = []
  if (q) {
    sql += ' AND (p.name LIKE ? OR p.manufacturer LIKE ? OR p.barcode LIKE ? OR p.item_category LIKE ? OR p.club_type LIKE ?)'
    const like = `%${q}%`
    params.push(like, like, like, like, like)
  }
  sql += ' ORDER BY p.item_category, p.manufacturer, p.name LIMIT 300'

  const stmt = db.prepare(sql)
  const rows = params.length > 0
    ? await stmt.bind(...params).all<Record<string, unknown>>()
    : await stmt.all<Record<string, unknown>>()

  return c.json({
    rows: rows.results.map((r) => ({ ...r, list_price_yen: yen(r['list_price']) })),
  })
})

// ============================================================
// API: 仕入先マスタ
// ============================================================
app.get('/suppliers', async (c) => {
  const db = c.env.DB
  const rows = await db
    .prepare('SELECT * FROM suppliers WHERE is_active=1 ORDER BY name')
    .all<Record<string, unknown>>()
  return c.json({ rows: rows.results })
})

// ============================================================
// API: 判定ルール
// ============================================================
app.get('/rules', async (c) => {
  const db = c.env.DB
  const rows = await db
    .prepare(
      `SELECT sr.*, s.name AS supplier_name
       FROM supplier_rules sr
       JOIN suppliers s ON sr.supplier_id=s.id
       ORDER BY sr.item_category, sr.manufacturer, sr.club_type, sr.priority`
    )
    .all<Record<string, unknown>>()
  return c.json({ rows: rows.results })
})

// ============================================================
// API: 発注一覧
// ============================================================
app.get('/orders', async (c) => {
  const db = c.env.DB
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
             WHERE 1=1`
  const params: unknown[] = []
  if (status) { sql += ' AND po.status=?'; params.push(status) }
  if (supplier) { sql += ' AND s.name LIKE ?'; params.push(`%${supplier}%`) }
  if (q) {
    sql += ' AND (po.order_no LIKE ? OR po.customer_name LIKE ? OR po.ordered_by LIKE ?)'
    const like = `%${q}%`
    params.push(like, like, like)
  }
  sql += ' GROUP BY po.id ORDER BY po.id DESC'

  const stmt = db.prepare(sql)
  const rows = params.length > 0
    ? await stmt.bind(...params).all<Record<string, unknown>>()
    : await stmt.all<Record<string, unknown>>()

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
  const order = await db
    .prepare(
      `SELECT po.*, s.name AS supplier_name, s.email, s.contact_name, s.order_method, s.phone
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id=s.id
       WHERE po.id=?`
    )
    .bind(id)
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
  const body = await c.req.json<{
    ordered_by?: string
    order_date?: string
    customer_name?: string
    usage_type?: string
    requested_delivery_date?: string
    order_note?: string
    lines: Array<{
      product_id?: number | null
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

    const { supplier, rate: autoRate } = await resolveSupplier(
      db,
      raw.item_category,
      raw.manufacturer,
      raw.club_type || '',
      raw.product_id
    )
    if (!supplier) {
      return c.json({ error: `発注先が特定できない明細があります: ${raw.product_name || raw.manufacturer}` }, 400)
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
           usage_type, requested_delivery_date, status, order_note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(batchCode, orderNo, orderDate, orderedBy, supplierId, customerName,
            usageType, requestedDeliveryDate, 'draft_created', orderNote)
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

    const supplier = await db
      .prepare('SELECT * FROM suppliers WHERE id=?')
      .bind(supplierId)
      .first<Record<string, unknown>>()
    const order = await db
      .prepare('SELECT * FROM purchase_orders WHERE id=?')
      .bind(orderId)
      .first<Record<string, unknown>>()
    const items = await db
      .prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id')
      .bind(orderId)
      .all<Record<string, unknown>>()

    if (supplier && order) {
      const { subject, body } = composeMail(order, items.results, supplier)
      await db
        .prepare('UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?')
        .bind(subject, body, orderId)
        .run()
    }
    orderIds.push(orderId)
  }

  return c.json({ order_ids: orderIds, batch_code: batchCode, count: orderIds.length })
})

// ============================================================
// API: 発注済みステータス更新
// ============================================================
app.post('/orders/:id/mark-ordered', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  await db.prepare('UPDATE purchase_orders SET status=? WHERE id=?').bind('ordered', id).run()
  return c.json({ ok: true })
})

// ============================================================
// API: メールバッチ取得
// ============================================================
app.get('/mail-batch/:batch_code', async (c) => {
  const db = c.env.DB
  const batchCode = c.req.param('batch_code')
  const orders = await db
    .prepare(
      `SELECT po.*, s.name AS supplier_name, s.email, s.contact_name, s.order_method
       FROM purchase_orders po
       JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.batch_code = ?
       ORDER BY po.id`
    )
    .bind(batchCode)
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
  const rows = await db
    .prepare(
      `SELECT r.*, po.order_no, s.name AS supplier_name
       FROM receipts r
       JOIN purchase_orders po ON r.purchase_order_id = po.id
       JOIN suppliers s ON po.supplier_id = s.id
       ORDER BY r.id DESC
       LIMIT 200`
    )
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
    items: Array<{ purchase_order_item_id: number; received_quantity: number; note?: string }>
  }>()

  const orderId = body.order_id
  const receivedDate = body.received_date || today()
  const slipDate = body.slip_date || null
  const inspectedBy = normalize(body.inspected_by)
  const note = normalize(body.note)

  const ins = await db
    .prepare(
      'INSERT INTO receipts (purchase_order_id, received_date, slip_date, inspected_by, note) VALUES (?, ?, ?, ?, ?)'
    )
    .bind(orderId, receivedDate, slipDate, inspectedBy, note)
    .run()
  const receiptId = ins.meta.last_row_id as number

  let added = 0
  for (const item of body.items || []) {
    if (!item.received_quantity || item.received_quantity <= 0) continue
    await db
      .prepare(
        'INSERT INTO receipt_items (receipt_id, purchase_order_item_id, received_quantity, note) VALUES (?, ?, ?, ?)'
      )
      .bind(receiptId, item.purchase_order_item_id, item.received_quantity, normalize(item.note))
      .run()
    added += item.received_quantity
  }

  await updateOrderStatus(db, orderId)
  return c.json({ ok: true, receipt_id: receiptId, added_quantity: added })
})

// ============================================================
// API: 残注一覧
// ============================================================
app.get('/backorders', async (c) => {
  const db = c.env.DB
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
       GROUP BY poi.id
       HAVING COALESCE(SUM(ri.received_quantity), 0) < poi.quantity
       ORDER BY po.order_date DESC, po.order_no DESC`
    )
    .all<Record<string, unknown>>()
  return c.json({ rows: rows.results })
})

// ============================================================
// API: 商品候補一覧（新規発注用）
// ============================================================
app.get('/products-for-order', async (c) => {
  const db = c.env.DB
  const rows = await db
    .prepare(
      `SELECT p.id, p.item_category, p.manufacturer, p.name, p.spec, p.club_type,
              p.list_price, p.default_rate, s.name AS supplier_name
       FROM products p
       LEFT JOIN suppliers s ON p.default_supplier_id = s.id
       WHERE p.is_active = 1
       ORDER BY p.item_category, p.manufacturer, p.name
       LIMIT 600`
    )
    .all<Record<string, unknown>>()
  return c.json({ products: rows.results })
})

export { app as apiRoutes }
