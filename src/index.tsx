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

app.use('/static/*', serveStatic({ root: './public' }))
app.get('/favicon.ico', (c) => c.body(null, 204))

// ── デモログイン ──────────────────────────────────────
// ログイン不要でデモテナント（tenant_id=0）としてセッションを発行
app.get('/demo-login', async (c) => {
  const secret = c.env.AUTH_SECRET || 'golfwing-secret-key-change-in-production'
  const token  = await createToken('demo', 0, secret)
  const cookie = [
    `gw_session=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${60 * 60 * 24 * 7}`,
    'HttpOnly',
    'SameSite=Strict',
  ].join('; ')
  return new Response(null, {
    status: 302,
    headers: { 'Location': '/', 'Set-Cookie': cookie }
  })
})

// ── ログインページ GET ──────────────────────────────────
app.get('/login', async (c) => {
  const secret = c.env.AUTH_SECRET || 'golfwing-secret-key-change-in-production'
  const user = await getCurrentUser(c.req.raw, c.env.DB, secret)
  if (user) return c.redirect('/')
  const next = c.req.query('next') || '/'
  return loginPage(false, next, c.env.APP_NAME)
})

// ── ログイン POST ───────────────────────────────────────
app.post('/login', async (c) => {
  const form     = await c.req.formData()
  const username = String(form.get('username') || '')
  const password = String(form.get('password') || '')
  const next     = String(form.get('next') || '/')
  const result   = await attemptLogin(username, password, c.env)
  if (result) {
    const dest = next.startsWith('/') && !next.startsWith('//') ? next : '/'
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
  // 静的ファイル・demo-login はスキップ
  if (path.startsWith('/static/') || path === '/favicon.ico' || path === '/demo-login') {
    return next()
  }
  if (path === '/login') return next()

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

app.use('/api/*', cors())
app.route('/api', apiRoutes)
app.route('/', pageRoutes)

// ============================================================
// Cron Trigger: 毎日 JST 00:00 にデモテナント（tenant_id=0）をリセット
// wrangler.jsonc: "0 15 * * *" (UTC 15:00 = JST 00:00)
// ============================================================
const DEMO_TENANT_ID = 0

// デモ初期データ
const DEMO_SUPPLIERS = [
  { name: 'デモ仕入先A', contact_name: '山田 太郎', honorific: '様', order_method: 'email', email: 'demo-a@example.com', is_active: 1 },
  { name: 'デモ仕入先B', contact_name: '鈴木 花子', honorific: '様', order_method: 'fax',   email: '',                   is_active: 1 },
]

const DEMO_PRODUCTS = [
  { item_category: 'ドライバー', manufacturer: 'デモメーカー', name: 'デモドライバー 460cc', list_price: 50000, default_rate: 0.7, unit: '本' },
  { item_category: 'アイアン',   manufacturer: 'デモメーカー', name: 'デモアイアン 7本セット', list_price: 80000, default_rate: 0.65, unit: 'セット' },
  { item_category: 'パター',     manufacturer: 'デモメーカー', name: 'デモパター 33インチ',   list_price: 30000, default_rate: 0.7, unit: '本' },
]

async function resetDemoData(db: D1Database): Promise<void> {
  // 1. デモテナントの全データを削除（依存順）
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

  // 2. デモ仕入先を再登録
  const supplierIds: number[] = []
  for (const s of DEMO_SUPPLIERS) {
    const r = await db.prepare(`
      INSERT INTO suppliers
        (name, contact_name, honorific, order_method, email, is_active, tenant_id, updated_at)
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
    `).bind(s.name, s.contact_name, s.honorific, s.order_method, s.email, s.is_active, DEMO_TENANT_ID).run()
    supplierIds.push(r.meta.last_row_id as number)
  }

  // 3. デモ商品を再登録（デモ仕入先Aに紐付け）
  for (const p of DEMO_PRODUCTS) {
    await db.prepare(`
      INSERT INTO products
        (item_category, manufacturer, name, list_price, default_rate, unit,
         is_active, tenant_id, default_supplier_id)
      VALUES (?,?,?,?,?,?,1,?,?)
    `).bind(p.item_category, p.manufacturer, p.name, p.list_price, p.default_rate,
            p.unit, DEMO_TENANT_ID, supplierIds[0]).run()
  }

  // 4. デモ判定ルール（ドライバー → 仕入先A）
  await db.prepare(`
    INSERT INTO supplier_rules (item_category, supplier_id, priority, tenant_id)
    VALUES (?,?,?,?)
  `).bind('ドライバー', supplierIds[0], 1, DEMO_TENANT_ID).run()

  // 5. デモ発注データ（ordered ステータス 2件）
  const today = new Date().toISOString().slice(0, 10)
  for (let i = 0; i < 2; i++) {
    const orderNo = `DEMO-${today.replace(/-/g,'')}-${String(i + 1).padStart(3,'0')}`
    const ins = await db.prepare(`
      INSERT INTO purchase_orders
        (batch_code, order_no, order_date, ordered_by, supplier_id,
         customer_name, status, tenant_id)
      VALUES (?,?,?,?,?,?,?,?)
    `).bind(`DEMO-${today}`, orderNo, today, 'デモユーザー',
            supplierIds[i % supplierIds.length],
            `デモ顧客${i + 1}`, 'ordered', DEMO_TENANT_ID).run()
    const orderId = ins.meta.last_row_id as number
    await db.prepare(`
      INSERT INTO purchase_order_items
        (purchase_order_id, item_category, manufacturer, product_name, quantity, unit_price, amount)
      VALUES (?,?,?,?,?,?,?)
    `).bind(orderId, 'ドライバー', 'デモメーカー', 'デモドライバー 460cc',
            1, 35000, 35000).run()
  }
}

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: { DB: D1Database }, _ctx: ExecutionContext) {
    await resetDemoData(env.DB)
    console.log('[Cron] Demo data reset completed.')
  },
}
