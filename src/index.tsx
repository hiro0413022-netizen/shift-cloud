import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { apiRoutes } from './routes/api'
import { pageRoutes } from './routes/pages'
import {
  getCurrentUser, attemptLogin, logoutResponse,
  loginPage, unauthorizedRedirect
} from './auth'

type Bindings = {
  DB: D1Database
  AUTH_SECRET?: string
  AUTH_USERNAME?: string
  AUTH_PASSWORD?: string
  // カスタマイズ用
  APP_NAME?: string          // 例: "〇〇ゴルフ 発注管理" (未設定時はデフォルト)
  APP_SENDER_NAME?: string   // メール署名の担当者名
  APP_SENDER_SHOP?: string   // メール署名の店舗名
  APP_SENDER_ADDR?: string   // メール署名の住所
  APP_SENDER_TEL?: string    // メール署名のTEL
  APP_SENDER_MAIL?: string   // メール署名のメールアドレス
  APP_DEFAULT_CC?: string    // デフォルトCC（セミコロン区切り）
  DEMO_MODE?: string         // "1" にするとデモモード
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/static/*', serveStatic({ root: './public' }))
app.get('/favicon.ico', (c) => c.body(null, 204))

// ── ログインページ GET ──────────────────────────────────
app.get('/login', async (c) => {
  const isDemo = c.env.DEMO_MODE === '1'
  // デモモードは /login → / にリダイレクト
  if (isDemo) return c.redirect('/')
  const secret = c.env.AUTH_SECRET || 'golfwing-secret-key-change-in-production'
  const user = await getCurrentUser(c.req.raw, secret)
  if (user) return c.redirect('/')
  const next = c.req.query('next') || '/'
  return loginPage(false, next, c.env.APP_NAME)
})

// ── ログイン POST ───────────────────────────────────────
app.post('/login', async (c) => {
  const form = await c.req.formData()
  const username = String(form.get('username') || '')
  const password = String(form.get('password') || '')
  const next     = String(form.get('next') || '/')
  const result = await attemptLogin(username, password, c.env)
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
  const isDemo = c.env.DEMO_MODE === '1'
  if (isDemo) return c.redirect('/')
  return logoutResponse()
})

// ── 認証ミドルウェア（/login 以外の全ルートに適用）──────
app.use('/*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/static/') || path === '/favicon.ico') return next()

  const isDemo = c.env.DEMO_MODE === '1'

  if (isDemo) {
    // デモモード: 認証不要、ユーザー名を "デモユーザー" に固定
    c.set('username' as never, 'デモユーザー')
    c.set('isDemo' as never, true)
    return next()
  }

  if (path === '/login') return next()
  const secret = c.env.AUTH_SECRET || 'golfwing-secret-key-change-in-production'
  const user = await getCurrentUser(c.req.raw, secret)
  if (!user) return unauthorizedRedirect(path)
  c.set('username' as never, user)
  c.set('isDemo' as never, false)
  return next()
})

app.use('/api/*', cors())
app.route('/api', apiRoutes)
app.route('/', pageRoutes)

export default app
