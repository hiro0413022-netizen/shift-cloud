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
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/static/*', serveStatic({ root: './public' }))
app.get('/favicon.ico', (c) => c.body(null, 204))

// ── ログインページ GET ──────────────────────────────────
app.get('/login', async (c) => {
  const secret = c.env.AUTH_SECRET || 'golfwing-secret-key-change-in-production'
  const user = await getCurrentUser(c.req.raw, secret)
  if (user) return c.redirect('/')
  const next = c.req.query('next') || '/'
  return loginPage(false, next)
})

// ── ログイン POST ───────────────────────────────────────
app.post('/login', async (c) => {
  const form = await c.req.formData()
  const username = String(form.get('username') || '')
  const password = String(form.get('password') || '')
  const next     = String(form.get('next') || '/')
  const result = await attemptLogin(username, password, c.env)
  if (result) {
    // 成功: next が / 系のパスなら遷移、それ以外は / へ
    const dest = next.startsWith('/') && !next.startsWith('//') ? next : '/'
    return new Response(null, {
      status: 302,
      headers: {
        'Location': dest,
        'Set-Cookie': result.headers.get('Set-Cookie') || ''
      }
    })
  }
  return loginPage(true, next)
})

// ── ログアウト ─────────────────────────────────────────
app.get('/logout', () => logoutResponse())

// ── 認証ミドルウェア（/login 以外の全ルートに適用）──────
app.use('/*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  // 認証不要パス
  if (path === '/login' || path.startsWith('/static/') || path === '/favicon.ico') {
    return next()
  }
  const secret = c.env.AUTH_SECRET || 'golfwing-secret-key-change-in-production'
  const user = await getCurrentUser(c.req.raw, secret)
  if (!user) return unauthorizedRedirect(path)
  // ユーザー名を後続ハンドラーで使えるよう変数に保持（ヘッダー経由）
  c.set('username' as never, user)
  return next()
})

app.use('/api/*', cors())
app.route('/api', apiRoutes)
app.route('/', pageRoutes)

export default app
