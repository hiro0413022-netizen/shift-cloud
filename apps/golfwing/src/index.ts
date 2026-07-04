import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { apiRoutes } from './routes/api'
import { pageRoutes } from './routes/pages'
import {
  getCurrentUser, attemptLogin, logoutResponse,
  loginPage, unauthorizedRedirect, createToken,
  type SessionUser
} from './auth'

type Bindings = {
  DB: D1Database
  AUTH_SECRET?: string
  AUTH_USERNAME?: string   // 後方互換
  AUTH_PASSWORD?: string   // 後方互換
  // カスタマイズ用
  APP_NAME?: string
  APP_SENDER_NAME?: string
  APP_SENDER_SHOP?: string
  APP_SENDER_ADDR?: string
  APP_SENDER_TEL?: string
  APP_SENDER_MAIL?: string
  APP_DEFAULT_CC?: string
  DEMO_MODE?: string       // "1" で強制デモモード（全テナント）
}

// コンテキスト変数の型定義
type Variables = {
  sessionUser: SessionUser
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()
export { app }

app.use('/static/*', serveStatic({ root: './public' } as never))
app.get('/favicon.ico', (c) => c.body(null, 204))

// ── デモログイン（廃止: DECISIONS #20）─────────────────
app.get('/demo-login', (c) => c.redirect('/login'))

// ── ログインページ GET ──────────────────────────────────
app.get('/login', async (c) => {
  const secret = c.env.AUTH_SECRET || 'golfwing-secret-key-change-in-production'
  const user = await getCurrentUser(c.req.raw, c.env.DB, secret)
  if (user) return c.redirect('/dashboard')
  const next = c.req.query('next') || '/dashboard'
  return loginPage(false, next, c.env.APP_NAME)
})

// ── ログイン POST ───────────────────────────────────────
app.post('/login', async (c) => {
  const form     = await c.req.formData()
  const username = String(form.get('username') || '')
  const password = String(form.get('password') || '')
  const next     = String(form.get('next') || '/dashboard')
  const result   = await attemptLogin(username, password, c.env)
  if (result) {
    const rawDest = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
    const dest = rawDest === '/' ? '/dashboard' : rawDest
    return new Response(null, {
      status: 302,
      headers: {
        'Location': dest,
        'Set-Cookie': result.headers.get('Set-Cookie') || ''
      }
    })
  }
  return loginPage(true, next, c.env.APP_NAME)
})

// ── ログアウト ─────────────────────────────────────────
app.get('/logout', (c) => {
  return logoutResponse()
})

// ── 認証ミドルウェア（全ルートに適用）────────────────────
// sessionUser を c.get('sessionUser') でどこからでも参照できるようにする
app.use('/*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  // 静的ファイル・パブリックページはスキップ（認証不要）
  if (path.startsWith('/static/') || path === '/favicon.ico' || path === '/demo-login') {
    return next()
  }
  if (path === '/login') return next()
  // ランディングページ（/）は未ログインでも表示
  if (path === '/') return next()
  // デモリセットは独自認証（secretパラメータ）で保護
  if (path === '/api/demo-reset') return next()

  const secret = c.env.AUTH_SECRET || 'golfwing-secret-key-change-in-production'

  // 強制デモモード（環境変数 DEMO_MODE=1）: 全アクセスをデモセッション扱い
  if (c.env.DEMO_MODE === '1') {
    c.set('sessionUser', {
      username:    'demo',
      tenantId:    0,
      displayName: 'デモユーザー',
      isDemo:      true,
      isAdmin:     false,
    })
    return next()
  }

  const user = await getCurrentUser(c.req.raw, c.env.DB, secret)
  if (!user) return unauthorizedRedirect(path)

  c.set('sessionUser', user)
  return next()
})

import { landingPage } from './routes/landing'

app.use('/api/*', cors())
app.route('/api', apiRoutes)

// ── デモデータ手動リセット（管理用） ──────────────────────
// /api/demo-reset?secret=XXXX で手動実行可能
app.get('/api/demo-reset', async (c) => {
  const secret = c.req.query('secret') || ''
  const expected = c.env.AUTH_SECRET || 'golfwing-secret-key-change-in-production'
  if (secret !== expected) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await resetDemoData(c.env.DB)
  return c.json({ ok: true, message: 'Demo data reset completed.' })
})

// ── ランディングページ（/ は認証不要） ─────────────────────
app.get('/', async (c) => {
  // ログイン済みかどうかを自力で確認（ミドルウェアは / をスキップするため）
  const secret = c.env.AUTH_SECRET || 'golfwing-secret-key-change-in-production'
  const user = await getCurrentUser(c.req.raw, c.env.DB, secret)
  if (user) return c.redirect('/dashboard')  // ログイン済みならダッシュボードへ
  const appName = c.env.APP_NAME || 'GolfOrder'
  return c.html(landingPage(appName))
})

app.route('/', pageRoutes)

// ============================================================
// Cron Trigger: 毎日 JST 00:00 にデモテナント（tenant_id=0）をリセット
// scheduled ハンドラ経由、または /api/demo-reset エンドポイントで手動実行可
// ============================================================
const DEMO_TENANT_ID = 0

// ── デモ仕入先（5社・発注方法バリエーション込み） ──────────────
const DEMO_SUPPLIERS = [
  {
    name: 'ワークスシャフト株式会社',
    contact_name: '小森 健太', honorific: '様',
    order_method: 'メール', email: 'order@works-shaft.example.com',
    notes: '大口割引あり。¥25,000未満は送料別途',
    shipping_rule: '¥25,000以上送料無料',
  },
  {
    name: 'プレミアムシャフト工業',
    contact_name: '田中 浩二', honorific: '様',
    order_method: 'メール', email: 'sales@premium-shaft.example.com',
    notes: '在庫確認は電話でも可',
    shipping_rule: '¥30,000以上送料無料',
  },
  {
    name: '山田グリップ商事',
    contact_name: '山田 みき', honorific: '様',
    order_method: 'LINE', email: '',
    notes: 'LINEで発注。紙の注文票あり。¥10,000未満送料別途',
    shipping_rule: '¥10,000以上送料無料',
  },
  {
    name: 'スポーツアパレルジャパン',
    contact_name: '渡辺 恵', honorific: '様',
    order_method: 'メール', email: 'order@sports-apparel.example.com',
    notes: 'シーズン前に一括発注が多い',
    shipping_rule: '一律送料¥500',
  },
  {
    name: '工房備品センター',
    contact_name: '佐藤 誠', honorific: '様',
    order_method: 'FAX', email: '',
    notes: '工房用消耗品専門。FAX注文のみ',
    shipping_rule: '¥5,000以上送料無料',
  },
]

// ── デモ商品（12品目） ──────────────────────────────────────
const DEMO_PRODUCTS = [
  // シャフト 3種
  { item_category: 'シャフト', manufacturer: 'ワークスシャフト',  name: 'WS-DR α 45S',       spec: '45g S',  club_type: 'DR',   list_price: 58000, default_rate: 0.45, unit: '本',  supplier_idx: 0 },
  { item_category: 'シャフト', manufacturer: 'ワークスシャフト',  name: 'WS-IRON β 95S',     spec: '95g S',  club_type: 'IRON', list_price: 48000, default_rate: 0.45, unit: '本',  supplier_idx: 0 },
  { item_category: 'シャフト', manufacturer: 'プレミアムシャフト', name: 'PS-FW Xtra 65R',    spec: '65g R',  club_type: 'FW',   list_price: 42000, default_rate: 0.48, unit: '本',  supplier_idx: 1 },
  // グリップ 4種
  { item_category: 'グリップ', manufacturer: '山田グリップ',      name: 'YG-PRO コードレス M60', spec: 'M60',  club_type: null,   list_price: 1800,  default_rate: 0.55, unit: '個',  supplier_idx: 2 },
  { item_category: 'グリップ', manufacturer: '山田グリップ',      name: 'YG-TOUR コード M60',   spec: 'M60',  club_type: null,   list_price: 2200,  default_rate: 0.55, unit: '個',  supplier_idx: 2 },
  { item_category: 'グリップ', manufacturer: '山田グリップ',      name: 'YG-パター ミッドサイズ', spec: 'M62',  club_type: 'PT',   list_price: 3500,  default_rate: 0.55, unit: '個',  supplier_idx: 2 },
  { item_category: 'グリップ', manufacturer: '山田グリップ',      name: 'YG-ジュニア S52',       spec: 'S52',  club_type: null,   list_price: 1200,  default_rate: 0.55, unit: '個',  supplier_idx: 2 },
  // アパレル 2種
  { item_category: 'アパレル', manufacturer: 'スポーツアパレル', name: 'ポロシャツ 吸水速乾 M',  spec: 'M',    club_type: null,   list_price: 8800,  default_rate: 0.60, unit: '枚',  supplier_idx: 3 },
  { item_category: 'アパレル', manufacturer: 'スポーツアパレル', name: 'ストレッチパンツ L',      spec: 'L',    club_type: null,   list_price: 12000, default_rate: 0.60, unit: '本',  supplier_idx: 3 },
  // 工房用品 3種
  { item_category: '工房用品', manufacturer: '工房備品センター', name: 'エポキシ接着剤 2液型',   spec: '100ml', club_type: null,   list_price: 2400,  default_rate: 0.65, unit: '本',  supplier_idx: 4 },
  { item_category: '工房用品', manufacturer: '工房備品センター', name: 'グリップテープ (10本入)', spec: '10本',  club_type: null,   list_price: 1500,  default_rate: 0.65, unit: '袋',  supplier_idx: 4 },
  { item_category: '工房用品', manufacturer: '工房備品センター', name: 'リムーバー溶剤 500ml',   spec: '500ml', club_type: null,   list_price: 3200,  default_rate: 0.65, unit: '本',  supplier_idx: 4 },
]

// ── 発注サンプルデータ ──────────────────────────────────────
interface DemoOrderDef {
  supplierIdx: number
  customerName: string
  status: string
  daysAgo: number
  items: { productIdx: number; quantity: number }[]
}
const DEMO_ORDERS: DemoOrderDef[] = [
  {
    // 対応が必要：14日前発注・未入荷（赤アラート）
    supplierIdx: 0, customerName: '鈴木 一郎 様', status: 'ordered', daysAgo: 14,
    items: [{ productIdx: 0, quantity: 1 }, { productIdx: 1, quantity: 2 }],
  },
  {
    // 対応が必要：8日前発注・未入荷（要確認）
    supplierIdx: 1, customerName: '田中 花子 様', status: 'ordered', daysAgo: 8,
    items: [{ productIdx: 2, quantity: 1 }],
  },
  {
    // 検品待ち：一部入荷・入荷レコードあり → 検品待ちセクションに表示
    supplierIdx: 2, customerName: '佐藤 健 様', status: 'partial', daysAgo: 11,
    items: [{ productIdx: 3, quantity: 13 }, { productIdx: 4, quantity: 6 }],
  },
  {
    // お客様対応中（最近の発注）
    supplierIdx: 3, customerName: '（店舗在庫補充）', status: 'ordered', daysAgo: 2,
    items: [{ productIdx: 7, quantity: 5 }, { productIdx: 8, quantity: 3 }],
  },
  {
    // 発注し忘れ確認：下書き
    supplierIdx: 4, customerName: '（工房消耗品）', status: 'draft', daysAgo: 1,
    items: [{ productIdx: 9, quantity: 3 }, { productIdx: 10, quantity: 10 }, { productIdx: 11, quantity: 2 }],
  },
]

async function resetDemoData(db: D1Database): Promise<void> {
  // 1. デモテナントの全データを依存順で削除
  const receiptRows = await db.prepare(
    'SELECT id FROM receipts WHERE tenant_id=?'
  ).bind(DEMO_TENANT_ID).all<{ id: number }>()
  for (const r of receiptRows.results) {
    await db.prepare('DELETE FROM receipt_items WHERE receipt_id=?').bind(r.id).run()
  }
  await db.prepare('DELETE FROM receipts WHERE tenant_id=?').bind(DEMO_TENANT_ID).run()

  const orderRows = await db.prepare(
    'SELECT id FROM purchase_orders WHERE tenant_id=?'
  ).bind(DEMO_TENANT_ID).all<{ id: number }>()
  for (const o of orderRows.results) {
    await db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id=?').bind(o.id).run()
  }
  await db.prepare('DELETE FROM purchase_orders WHERE tenant_id=?').bind(DEMO_TENANT_ID).run()
  await db.prepare('DELETE FROM supplier_rules WHERE tenant_id=?').bind(DEMO_TENANT_ID).run()
  await db.prepare('DELETE FROM products WHERE tenant_id=?').bind(DEMO_TENANT_ID).run()
  await db.prepare('DELETE FROM suppliers WHERE tenant_id=?').bind(DEMO_TENANT_ID).run()

  // 2. 仕入先を再登録
  const supplierIds: number[] = []
  for (const s of DEMO_SUPPLIERS) {
    const r = await db.prepare(`
      INSERT INTO suppliers
        (name, contact_name, honorific, order_method, email, notes, shipping_rule,
         is_active, tenant_id)
      VALUES (?,?,?,?,?,?,?,1,?)
    `).bind(s.name, s.contact_name, s.honorific, s.order_method, s.email,
            s.notes, s.shipping_rule, DEMO_TENANT_ID).run()
    supplierIds.push(r.meta.last_row_id as number)
  }

  // 3. 商品を再登録
  const productIds: number[] = []
  for (const p of DEMO_PRODUCTS) {
    const sid = supplierIds[p.supplier_idx]
    const r = await db.prepare(`
      INSERT INTO products
        (item_category, manufacturer, name, spec, club_type,
         list_price, default_rate, unit, default_supplier_id,
         is_active, tenant_id)
      VALUES (?,?,?,?,?,?,?,?,?,1,?)
    `).bind(p.item_category, p.manufacturer, p.name, p.spec ?? null,
            p.club_type ?? null, p.list_price, p.default_rate,
            p.unit, sid, DEMO_TENANT_ID).run()
    productIds.push(r.meta.last_row_id as number)
  }

  // 4. 判定ルール（カテゴリ→仕入先の代表的なマッピング）
  const rules = [
    { item_category: 'シャフト', manufacturer: 'ワークスシャフト',  supplier_idx: 0, rate: 0.45 },
    { item_category: 'シャフト', manufacturer: 'プレミアムシャフト', supplier_idx: 1, rate: 0.48 },
    { item_category: 'グリップ', manufacturer: '山田グリップ',       supplier_idx: 2, rate: 0.55 },
    { item_category: 'アパレル', manufacturer: null,                  supplier_idx: 3, rate: 0.60 },
    { item_category: '工房用品', manufacturer: null,                  supplier_idx: 4, rate: 0.65 },
  ]
  for (const rule of rules) {
    await db.prepare(`
      INSERT INTO supplier_rules
        (item_category, manufacturer, supplier_id, rate, priority, tenant_id)
      VALUES (?,?,?,?,10,?)
    `).bind(rule.item_category, rule.manufacturer ?? null,
            supplierIds[rule.supplier_idx], rule.rate, DEMO_TENANT_ID).run()
  }

  // 5. 発注データを再登録
  for (let oi = 0; oi < DEMO_ORDERS.length; oi++) {
    const od = DEMO_ORDERS[oi]
    const orderDate = new Date(Date.now() - od.daysAgo * 86400000)
    const dateStr = orderDate.toISOString().slice(0, 10)
    const batchCode = `DEMO-${dateStr.replace(/-/g, '')}`
    const orderNo   = `DEMO-${dateStr.replace(/-/g, '')}-${String(oi + 1).padStart(3, '0')}`
    const sid = supplierIds[od.supplierIdx]

    const ins = await db.prepare(`
      INSERT INTO purchase_orders
        (batch_code, order_no, order_date, ordered_by,
         supplier_id, customer_name, status, tenant_id)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(batchCode, orderNo, dateStr, 'デモスタッフ',
            sid, od.customerName, od.status, DEMO_TENANT_ID).run()
    const orderId = ins.meta.last_row_id as number

    for (const item of od.items) {
      const p = DEMO_PRODUCTS[item.productIdx]
      const unitPrice = Math.floor((p.list_price ?? 0) * p.default_rate)
      await db.prepare(`
        INSERT INTO purchase_order_items
          (purchase_order_id, item_category, manufacturer, product_name,
           spec, club_type, quantity, list_price, rate, unit_price, amount,
           customer_name)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(orderId, p.item_category, p.manufacturer, p.name,
              p.spec ?? null, p.club_type ?? null, item.quantity,
              p.list_price ?? null, p.default_rate,
              unitPrice, unitPrice * item.quantity,
              od.customerName).run()
    }

    // 入荷済み・一部入荷には入荷レコードも追加
    if (od.status === 'received' || od.status === 'partial') {
      const recIns = await db.prepare(`
        INSERT INTO receipts
          (purchase_order_id, received_date, inspected_by, tenant_id)
        VALUES (?,?,?,?)
      `).bind(orderId, dateStr, 'デモスタッフ', DEMO_TENANT_ID).run()
      const recId = recIns.meta.last_row_id as number
      const poItems = await db.prepare(
        'SELECT id, quantity FROM purchase_order_items WHERE purchase_order_id=?'
      ).bind(orderId).all<{ id: number; quantity: number }>()
      for (const poi of poItems.results) {
        // partial の場合は数量の一部のみ入荷（半分）
        const recvQty = od.status === 'partial'
          ? Math.max(1, Math.floor(poi.quantity / 2))
          : poi.quantity
        await db.prepare(`
          INSERT INTO receipt_items
            (receipt_id, purchase_order_item_id, received_quantity)
          VALUES (?,?,?)
        `).bind(recId, poi.id, recvQty).run()
      }
    }
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: { DB: D1Database }, _ctx: ExecutionContext) {
    await resetDemoData(env.DB)
    console.log('[Cron] Demo data reset completed.')
  },
}
