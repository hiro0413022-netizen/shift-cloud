import { Hono } from 'hono'
import { buildXlsx } from '../xlsxHelper'

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
  sql += ' ORDER BY p.item_category, p.manufacturer, p.name LIMIT 1500'

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
       LIMIT 1500`
    )
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

  let sql = `
    SELECT
      po.order_date,
      po.order_no,
      s.name              AS supplier_name,
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
      poi.rate,
      poi.unit_price,
      (ri.received_quantity * poi.unit_price) AS line_amount,
      ri.note             AS item_note,
      r.note              AS receipt_note
    FROM receipt_items ri
    JOIN receipts r             ON ri.receipt_id = r.id
    JOIN purchase_orders po     ON r.purchase_order_id = po.id
    JOIN suppliers s            ON po.supplier_id = s.id
    JOIN purchase_order_items poi ON ri.purchase_order_item_id = poi.id
    WHERE 1=1`

  const binds: unknown[] = []
  if (from) { sql += ` AND r.received_date >= ?`; binds.push(from) }
  if (to)   { sql += ` AND r.received_date <= ?`; binds.push(to)   }
  if (supplierId) { sql += ` AND po.supplier_id = ?`; binds.push(Number(supplierId)) }
  sql += ` ORDER BY r.received_date DESC, r.id DESC, poi.id ASC`

  let stmt = db.prepare(sql)
  if (binds.length) {
    // D1 の bind は引数を展開する
    stmt = (stmt.bind as (...args: unknown[]) => typeof stmt)(...binds)
  }
  const res = await stmt.all<Record<string, unknown>>()
  const data = res.results

  // ── ヘッダ行 ──────────────────────────────────────────────
  const HEADERS = [
    '入荷日', '納品書日付', '発注番号', '発注日', '仕入先',
    '顧客名', '用途', '品目', 'メーカー', '商品名',
    '仕様', '色', '種類', '入荷数', '定価',
    '掛率', '単価', '金額', '検品者', '商品備考', '納品備考',
  ]

  // styleId: 0=通常 1=ヘッダ 2=数値カンマ 3=パーセント 4=日付 5=合計行
  const headerRow = {
    cells: HEADERS as (string | number | null)[],
    rowStyle: 1,
  }

  // ── データ行 ──────────────────────────────────────────────
  const dataRows = data.map(r => ({
    cells: [
      r['received_date'],   // 入荷日
      r['slip_date'],       // 納品書日付
      r['order_no'],        // 発注番号
      r['order_date'],      // 発注日
      r['supplier_name'],   // 仕入先
      r['customer_name'],   // 顧客名
      r['usage_type'],      // 用途
      r['item_category'],   // 品目
      r['manufacturer'],    // メーカー
      r['product_name'],    // 商品名
      r['spec'],            // 仕様
      r['color'],           // 色
      r['club_type'],       // 種類
      r['received_quantity'] != null ? Number(r['received_quantity']) : null,
      r['list_price']  != null ? Number(r['list_price'])  : null,
      r['rate']        != null ? Number(r['rate'])        : null,
      r['unit_price']  != null ? Number(r['unit_price'])  : null,
      r['line_amount'] != null ? Number(r['line_amount']) : null,
      r['inspected_by'],
      r['item_note'],
      r['receipt_note'],
    ] as (string | number | null)[],
    styles: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 3, 2, 2, 0, 0, 0],
  }))

  // ── 合計行 ────────────────────────────────────────────────
  const totalQty    = data.reduce((s, r) => s + (Number(r['received_quantity']) || 0), 0)
  const totalAmount = data.reduce((s, r) => s + (Number(r['line_amount'])       || 0), 0)
  const totalRow = {
    cells: ['合計', null, null, null, null, null, null, null, null, null,
            null, null, null, totalQty, null, null, null, totalAmount, null, null, null] as (string | number | null)[],
    styles: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  }

  const colWidths = [
    { col: 0,  width: 12 }, // 入荷日
    { col: 1,  width: 12 }, // 納品書日付
    { col: 2,  width: 22 }, // 発注番号
    { col: 3,  width: 12 }, // 発注日
    { col: 4,  width: 22 }, // 仕入先
    { col: 5,  width: 16 }, // 顧客名
    { col: 6,  width: 10 }, // 用途
    { col: 7,  width: 12 }, // 品目
    { col: 8,  width: 20 }, // メーカー
    { col: 9,  width: 30 }, // 商品名
    { col: 10, width: 20 }, // 仕様
    { col: 11, width: 10 }, // 色
    { col: 12, width: 10 }, // 種類
    { col: 13, width: 8  }, // 入荷数
    { col: 14, width: 10 }, // 定価
    { col: 15, width: 8  }, // 掛率
    { col: 16, width: 10 }, // 単価
    { col: 17, width: 12 }, // 金額
    { col: 18, width: 10 }, // 検品者
    { col: 19, width: 20 }, // 商品備考
    { col: 20, width: 20 }, // 納品備考
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
  const b = await c.req.json<Record<string, string>>()
  const r = await db.prepare(`
    INSERT INTO suppliers
      (name, alias_names, contact_name, honorific, order_method, order_method_detail,
       phone, fax, fax_number, email, line_id, line_group_id,
       payment_method, shipping_rule, website, postal_code, address, notes, is_active, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP)
  `).bind(
    normalize(b['name']), normalize(b['alias_names']), normalize(b['contact_name']),
    normalize(b['honorific']) || '様', normalize(b['order_method']), normalize(b['order_method_detail']),
    normalize(b['phone']), normalize(b['fax']), normalize(b['fax_number']),
    normalize(b['email']), normalize(b['line_id']), normalize(b['line_group_id']),
    normalize(b['payment_method']), normalize(b['shipping_rule']),
    normalize(b['website']), normalize(b['postal_code']), normalize(b['address']),
    normalize(b['notes'])
  ).run()
  return c.json({ ok: true, id: r.meta.last_row_id })
})

app.put('/suppliers/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json<Record<string, string>>()
  await db.prepare(`
    UPDATE suppliers SET
      name=?, alias_names=?, contact_name=?, honorific=?, order_method=?, order_method_detail=?,
      phone=?, fax=?, fax_number=?, email=?, line_id=?, line_group_id=?,
      payment_method=?, shipping_rule=?, website=?, postal_code=?, address=?, notes=?,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).bind(
    normalize(b['name']), normalize(b['alias_names']), normalize(b['contact_name']),
    normalize(b['honorific']) || '様', normalize(b['order_method']), normalize(b['order_method_detail']),
    normalize(b['phone']), normalize(b['fax']), normalize(b['fax_number']),
    normalize(b['email']), normalize(b['line_id']), normalize(b['line_group_id']),
    normalize(b['payment_method']), normalize(b['shipping_rule']),
    normalize(b['website']), normalize(b['postal_code']), normalize(b['address']),
    normalize(b['notes']), id
  ).run()
  return c.json({ ok: true })
})

app.delete('/suppliers/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  await db.prepare('UPDATE suppliers SET is_active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id).run()
  return c.json({ ok: true })
})

// ============================================================
// API: 商品マスタ CRUD
// ============================================================
app.post('/products', async (c) => {
  const db = c.env.DB
  const b = await c.req.json<Record<string, unknown>>()
  const r = await db.prepare(`
    INSERT INTO products
      (product_code, barcode, item_category, manufacturer, name, spec, color, club_type,
       list_price, default_rate, default_supplier_id, unit, source, is_active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)
  `).bind(
    normalize(b['product_code'] as string), normalize(b['barcode'] as string),
    normalize(b['item_category'] as string), normalize(b['manufacturer'] as string),
    normalize(b['name'] as string), normalize(b['spec'] as string),
    normalize(b['color'] as string), normalize(b['club_type'] as string),
    b['list_price'] ? Number(b['list_price']) : null,
    b['default_rate'] ? Number(b['default_rate']) : null,
    b['default_supplier_id'] ? Number(b['default_supplier_id']) : null,
    normalize(b['unit'] as string) || '本',
    normalize(b['source'] as string)
  ).run()
  return c.json({ ok: true, id: r.meta.last_row_id })
})

app.put('/products/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json<Record<string, unknown>>()
  await db.prepare(`
    UPDATE products SET
      product_code=?, barcode=?, item_category=?, manufacturer=?, name=?, spec=?, color=?, club_type=?,
      list_price=?, default_rate=?, default_supplier_id=?, unit=?, source=?
    WHERE id=?
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
    id
  ).run()
  return c.json({ ok: true })
})

app.delete('/products/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  await db.prepare('UPDATE products SET is_active=0 WHERE id=?').bind(id).run()
  return c.json({ ok: true })
})

// ============================================================
// API: 判定ルール CRUD
// ============================================================
app.post('/rules', async (c) => {
  const db = c.env.DB
  const b = await c.req.json<Record<string, unknown>>()
  const r = await db.prepare(`
    INSERT INTO supplier_rules (item_category, manufacturer, club_type, supplier_id, rate, priority, notes)
    VALUES (?,?,?,?,?,?,?)
  `).bind(
    normalize(b['item_category'] as string) || null,
    normalize(b['manufacturer'] as string) || null,
    normalize(b['club_type'] as string) || null,
    Number(b['supplier_id']),
    b['rate'] ? Number(b['rate']) : null,
    Number(b['priority']) || 100,
    normalize(b['notes'] as string)
  ).run()
  return c.json({ ok: true, id: r.meta.last_row_id })
})

app.put('/rules/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json<Record<string, unknown>>()
  await db.prepare(`
    UPDATE supplier_rules SET
      item_category=?, manufacturer=?, club_type=?, supplier_id=?, rate=?, priority=?, notes=?
    WHERE id=?
  `).bind(
    normalize(b['item_category'] as string) || null,
    normalize(b['manufacturer'] as string) || null,
    normalize(b['club_type'] as string) || null,
    Number(b['supplier_id']),
    b['rate'] ? Number(b['rate']) : null,
    Number(b['priority']) || 100,
    normalize(b['notes'] as string),
    id
  ).run()
  return c.json({ ok: true })
})

app.delete('/rules/:id', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  await db.prepare('DELETE FROM supplier_rules WHERE id=?').bind(id).run()
  return c.json({ ok: true })
})

// ============================================================
// API: 発注コピー（再発注）
// ============================================================
app.post('/orders/:id/copy', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const src = await db.prepare('SELECT * FROM purchase_orders WHERE id=?').bind(id).first<Record<string,unknown>>()
  if (!src) return c.json({ error: 'Not found' }, 404)
  const items = await db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id').bind(id).all<Record<string,unknown>>()

  const batchCode = nowCode() + '-' + Math.random().toString(36).substring(2, 8)
  const orderNo = 'PO-' + today().replace(/-/g,'') + '-' + uuid5()
  const ins = await db.prepare(`
    INSERT INTO purchase_orders
      (batch_code, order_no, order_date, ordered_by, supplier_id, customer_name,
       usage_type, requested_delivery_date, status, order_note)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    batchCode, orderNo, today(),
    src['ordered_by'], src['supplier_id'], src['customer_name'],
    src['usage_type'], src['requested_delivery_date'], 'draft_created', src['order_note']
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
  const supplier = await db.prepare('SELECT * FROM suppliers WHERE id=?').bind(src['supplier_id']).first<Record<string,unknown>>()
  const newOrder = await db.prepare('SELECT * FROM purchase_orders WHERE id=?').bind(newOrderId).first<Record<string,unknown>>()
  const newItems = await db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id=? ORDER BY id').bind(newOrderId).all<Record<string,unknown>>()
  if (supplier && newOrder) {
    const { subject, body } = composeMail(newOrder, newItems.results, supplier)
    await db.prepare('UPDATE purchase_orders SET email_subject=?, email_body=? WHERE id=?').bind(subject, body, newOrderId).run()
  }

  return c.json({ ok: true, order_id: newOrderId, batch_code: batchCode })
})

// ============================================================
// API: 発注ステータス変更
// ============================================================
app.post('/orders/:id/status', async (c) => {
  const db = c.env.DB
  const id = parseInt(c.req.param('id'))
  const { status } = await c.req.json<{ status: string }>()
  const allowed = ['draft','draft_created','ordered','partial','completed','cancelled']
  if (!allowed.includes(status)) return c.json({ error: 'invalid status' }, 400)
  await db.prepare('UPDATE purchase_orders SET status=? WHERE id=?').bind(status, id).run()
  return c.json({ ok: true })
})

export { app as apiRoutes }
