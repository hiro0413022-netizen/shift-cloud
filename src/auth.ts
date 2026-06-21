// ============================================================
// 認証モジュール（マルチテナント対応版）
// Cookie に HMAC-SHA256 署名付きトークンを保存する方式
// Workers の Web Crypto API を使用（Node.js crypto不要）
//
// テナント管理:
//   tenant_id=0 → デモテナント（DEMO_MODE的な扱い、書き込み禁止）
//   tenant_id=1 → ゴルフウィング（既存）
//   tenant_id=N → 販売先テナント
// ============================================================

export type AuthBindings = {
  DB: D1Database
  AUTH_SECRET?: string
  AUTH_USERNAME?: string   // 後方互換（未設定時はDBを使用）
  AUTH_PASSWORD?: string   // 後方互換（未設定時はDBを使用）
  APP_NAME?: string
}

export type SessionUser = {
  username:    string
  tenantId:    number
  displayName: string
  isDemo:      boolean   // tenant_id===0
  isAdmin:     boolean
}

const COOKIE_NAME  = 'gw_session'
const SESSION_TTL  = 60 * 60 * 24 * 7  // 7日（秒）
const DEFAULT_SECRET = 'golfwing-secret-key-change-in-production'

// ── HMAC 署名 ────────────────────────────────────────────
async function sign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function verify(payload: string, signature: string, secret: string): Promise<boolean> {
  const expected = await sign(payload, secret)
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  }
  return diff === 0
}

// ── トークン生成・検証 ─────────────────────────────────
// payload: "username:tenantId:expires"
export async function createToken(
  username: string,
  tenantId: number,
  secret: string
): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SESSION_TTL
  const payload = `${username}:${tenantId}:${expires}`
  const sig = await sign(payload, secret)
  return `${payload}:${sig}`
}

export async function verifyToken(
  token: string,
  secret: string
): Promise<{ username: string; tenantId: number } | null> {
  if (!token) return null
  const parts = token.split(':')
  // 形式: username:tenantId:expires:sig  (sigはbase64urlで':'を含まない)
  if (parts.length < 4) return null
  const username = parts[0]
  const tenantId = parseInt(parts[1])
  const expires  = parseInt(parts[2])
  const sig      = parts.slice(3).join(':')
  if (isNaN(tenantId) || isNaN(expires)) return null
  if (Date.now() / 1000 > expires) return null
  const payload = `${username}:${tenantId}:${expires}`
  const ok = await verify(payload, sig, secret)
  return ok ? { username, tenantId } : null
}

// ── Cookie パース ──────────────────────────────────────
export function parseCookie(header: string | null): Record<string, string> {
  if (!header) return {}
  return Object.fromEntries(
    header.split(';').map(s => s.trim().split('=').map(v => decodeURIComponent(v.trim())))
      .filter(p => p.length === 2)
  )
}

// ── 現在ユーザー取得（DBからセッション情報を復元）──────
export async function getCurrentUser(
  req: Request,
  db: D1Database,
  secret: string
): Promise<SessionUser | null> {
  const cookies = parseCookie(req.headers.get('Cookie'))
  const token = cookies[COOKIE_NAME]
  if (!token) return null

  const result = await verifyToken(token, secret)
  if (!result) return null

  const { username, tenantId } = result

  // デモセッション（tenant_id=0）は DB 照会不要で復元
  if (tenantId === 0) {
    return {
      username,
      tenantId:    0,
      displayName: 'デモユーザー',
      isDemo:      true,
      isAdmin:     false,
    }
  }

  // テナント情報をDBから取得
  const user = await db.prepare(
    'SELECT u.*, t.is_demo FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.username=? AND u.tenant_id=?'
  ).bind(username, tenantId).first<{
    id: number; tenant_id: number; username: string;
    display_name: string; is_admin: number; is_demo: number
  }>()

  if (!user) return null

  return {
    username:    user.username,
    tenantId:    user.tenant_id,
    displayName: user.display_name || user.username,
    isDemo:      user.is_demo === 1,
    isAdmin:     user.is_admin === 1,
  }
}

// ── ログイン処理（DBベース + 後方互換）─────────────────
export async function attemptLogin(
  username: string,
  password: string,
  env: AuthBindings
): Promise<Response | null> {
  const secret = env.AUTH_SECRET || DEFAULT_SECRET

  // ① DB の users テーブルで認証（マルチテナント対応）
  if (env.DB) {
    const userRow = await env.DB.prepare(
      'SELECT u.*, t.is_demo FROM users u JOIN tenants t ON t.id=u.tenant_id WHERE u.username=? AND u.password=?'
    ).bind(username, password).first<{
      id: number; tenant_id: number; username: string;
      display_name: string; is_admin: number; is_demo: number
    }>()

    if (userRow) {
      const token  = await createToken(userRow.username, userRow.tenant_id, secret)
      const cookie = makeCookie(token)
      return new Response(null, {
        status: 302,
        headers: { 'Location': '/orders', 'Set-Cookie': cookie }
      })
    }
  }

  // ② 後方互換: 環境変数での認証（DBにユーザーが見つからない場合）
  const validUser = env.AUTH_USERNAME || 'admin'
  const validPass = env.AUTH_PASSWORD || 'golfwing2024'
  if (username === validUser && password === validPass) {
    // 環境変数ユーザーは tenant_id=1 として扱う
    const token  = await createToken(username, 1, secret)
    const cookie = makeCookie(token)
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/orders', 'Set-Cookie': cookie }
    })
  }

  return null
}

function makeCookie(token: string): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_TTL}`,
    'HttpOnly',
    'SameSite=Strict',
  ].join('; ')
}

// ── ログアウト（Cookie削除）──────────────────────────
export function logoutResponse(): Response {
  const cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`
  return new Response(null, {
    status: 302,
    headers: { 'Location': '/login', 'Set-Cookie': cookie }
  })
}

// ── 未認証リダイレクト ────────────────────────────────
export function unauthorizedRedirect(path: string): Response {
  return new Response(null, {
    status: 302,
    headers: { 'Location': `/login?next=${encodeURIComponent(path)}` }
  })
}

// ── ログインページHTML ────────────────────────────────
export function loginPage(error = false, next = '/', appName?: string): Response {
  const sysName = appName || '発注管理システム'
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ログイン | ${sysName}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box}
    body {
      font-family: 'Inter','Hiragino Sans','Yu Gothic UI',sans-serif;
      background: #0f2417;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      position: relative;
      overflow: hidden;
    }
    body::before {
      content: '';
      position: fixed;
      width: 600px; height: 600px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(26,122,74,.25) 0%, transparent 70%);
      top: -200px; right: -200px;
      pointer-events: none;
    }
    body::after {
      content: '';
      position: fixed;
      width: 400px; height: 400px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(46,204,113,.15) 0%, transparent 70%);
      bottom: -150px; left: -150px;
      pointer-events: none;
    }
    .login-wrap {
      width: 100%;
      max-width: 400px;
      position: relative;
      z-index: 1;
    }
    .login-logo {
      text-align: center;
      margin-bottom: 2rem;
    }
    .logo-icon {
      width: 56px; height: 56px;
      background: #1a7a4a;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      color: #fff;
      margin-bottom: 0.75rem;
      box-shadow: 0 8px 24px rgba(26,122,74,.4);
    }
    .login-logo h1 {
      font-size: 1.1rem;
      font-weight: 700;
      color: #fff;
      margin: 0;
      letter-spacing: -0.01em;
    }
    .login-logo p {
      font-size: 0.78rem;
      color: rgba(255,255,255,.45);
      margin: 4px 0 0;
    }
    .login-card {
      background: #fff;
      border-radius: 16px;
      padding: 2rem;
      box-shadow: 0 24px 64px rgba(0,0,0,.4);
    }
    .login-card .form-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: #374151;
      margin-bottom: 0.3rem;
      letter-spacing: 0.01em;
    }
    .login-card .form-control {
      font-family: 'Inter',sans-serif;
      font-size: 0.875rem;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 0.55rem 0.85rem;
      transition: border-color .15s, box-shadow .15s;
    }
    .login-card .form-control:focus {
      border-color: #1a7a4a;
      box-shadow: 0 0 0 3px rgba(26,122,74,.15);
      outline: none;
    }
    .input-group-text {
      background: #f9fafb;
      border-color: #d1d5db;
      border-radius: 8px 0 0 8px;
      color: #9ca3af;
    }
    .input-group .form-control { border-radius: 0 8px 8px 0; }
    .btn-login {
      background: #1a7a4a;
      border: none;
      border-radius: 8px;
      font-family: 'Inter',sans-serif;
      font-size: 0.875rem;
      font-weight: 600;
      padding: 0.65rem;
      color: #fff;
      width: 100%;
      transition: background .15s, box-shadow .15s;
      cursor: pointer;
    }
    .btn-login:hover {
      background: #145e38;
      box-shadow: 0 4px 12px rgba(26,122,74,.35);
    }
    .btn-demo {
      display: block;
      width: 100%;
      padding: 0.6rem;
      border-radius: 8px;
      border: 2px solid #7c3aed;
      background: transparent;
      color: #7c3aed;
      font-family: 'Inter',sans-serif;
      font-size: 0.875rem;
      font-weight: 600;
      text-align: center;
      text-decoration: none;
      transition: background .15s, color .15s;
      cursor: pointer;
    }
    .btn-demo:hover {
      background: #7c3aed;
      color: #fff;
    }
    .demo-divider {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin: 1.25rem 0;
      color: #9ca3af;
      font-size: 0.75rem;
    }
    .demo-divider::before,
    .demo-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #e5e7eb;
    }
    .alert-danger {
      background: #fef2f2;
      border: none;
      border-left: 3px solid #ef4444;
      border-radius: 8px;
      color: #b91c1c;
      font-size: 0.82rem;
      padding: 0.65rem 0.85rem;
    }
    .login-footer {
      text-align: center;
      margin-top: 1.25rem;
      font-size: 0.72rem;
      color: rgba(255,255,255,.3);
    }
  </style>
</head>
<body>
<div class="login-wrap">
  <div class="login-logo">
    <div class="logo-icon"><i class="fas fa-golf-ball"></i></div>
    <h1>${sysName}</h1>
    <p>Order Management System</p>
  </div>
  <div class="login-card">
    ${error ? `
    <div class="alert-danger mb-3">
      <i class="fas fa-exclamation-circle me-1"></i>
      ユーザー名またはパスワードが正しくありません
    </div>` : ''}
    <form method="POST" action="/login">
      <input type="hidden" name="next" value="${next}">
      <div class="mb-3">
        <label class="form-label">ユーザー名</label>
        <div class="input-group">
          <span class="input-group-text"><i class="fas fa-user"></i></span>
          <input type="text" class="form-control" name="username" autofocus autocomplete="username"
            placeholder="username" required>
        </div>
      </div>
      <div class="mb-4">
        <label class="form-label">パスワード</label>
        <div class="input-group">
          <span class="input-group-text"><i class="fas fa-lock"></i></span>
          <input type="password" class="form-control" name="password" autocomplete="current-password"
            placeholder="••••••••" required>
        </div>
      </div>
      <button type="submit" class="btn-login">
        <i class="fas fa-sign-in-alt me-2"></i>ログイン
      </button>
    </form>

    <div class="demo-divider">または</div>

    <a href="/demo-login" class="btn-demo">
      <i class="fas fa-flask me-2"></i>デモを試す（登録不要）
    </a>
  </div>
  <p class="login-footer"><i class="fas fa-shield-alt me-1"></i>社内専用システム</p>
</div>
</body>
</html>`
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
