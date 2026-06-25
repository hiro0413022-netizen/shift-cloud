# SECURITY.md — セキュリティ監査

> **最終更新**: 2026-06-25  
> **監査者**: AI System Audit  
> **評価対象**: GolfWing Order Management System v1.13

---

## 1. セキュリティスコア総合評価

| 項目 | 点数 | 満点 | 評価 |
|---|---|---|---|
| SQL Injection | 85 | 100 | 🟡 良好 |
| XSS | 65 | 100 | 🟠 要改善 |
| CSRF | 70 | 100 | 🟡 良好 |
| 認証 | 75 | 100 | 🟡 良好 |
| 権限制御 | 70 | 100 | 🟡 良好 |
| API セキュリティ | 80 | 100 | 🟡 良好 |
| Secrets管理 | 65 | 100 | 🟠 要改善 |
| ロギング | 30 | 100 | 🔴 不足 |
| バックアップ | 55 | 100 | 🟠 要改善 |
| Rate Limit | 20 | 100 | 🔴 未実装 |
| **総合** | **615** | **1000** | **61.5点** |

---

## 2. 項目別詳細

### 2.1 SQL Injection — 85点 🟡

**評価**: 良好（パラメータバインディング使用）

**良い点**:
```typescript
// ✅ 全クエリにパラメータバインディングを使用
const rows = await db.prepare(
  'SELECT * FROM suppliers WHERE id=? AND tenant_id=?'
).bind(id, tenantId).all()
```

**問題点**:
```typescript
// ⚠️ bulk-importで動的テーブル名を使用（SQLインジェクションリスク）
// api.ts の POST /products/bulk-import
const table = body.table  // ユーザー入力がそのままテーブル名に
await db.prepare(`INSERT OR REPLACE INTO ${table} (...)`).bind(...).run()
```

**改善案**:
```typescript
// テーブル名のホワイトリスト検証を追加
const ALLOWED_TABLES = ['products', 'suppliers', 'supplier_rules']
if (!ALLOWED_TABLES.includes(table)) {
  return c.json({ error: 'Invalid table name' }, 400)
}
```

---

### 2.2 XSS (Cross-Site Scripting) — 65点 🟠

**評価**: 要改善（HTMLエスケープが不完全）

**問題点**:
```typescript
// ⚠️ pages.tsでDBデータをHTMLに直接埋め込んでいる箇所がある
// 例: メール本文、商品名、顧客名等がエスケープなしで埋め込まれている可能性
const html = `
  <td>${order.customer_name}</td>  // エスケープなし
`
```

**良い点**:
- `products-page.js` に `escHtml()` 関数を実装している

```javascript
// ✅ public/static/products-page.js
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
```

**改善案**:
1. `pages.ts` にグローバルHTMLエスケープ関数を追加
2. 全DBデータの出力箇所に一貫してエスケープを適用
3. Content Security Policy (CSP) ヘッダーの追加

```typescript
// CSPヘッダー追加例
app.use('/*', (c, next) => {
  c.header('Content-Security-Policy', 
    "default-src 'self'; script-src 'self' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' cdn.jsdelivr.net fonts.googleapis.com")
  return next()
})
```

---

### 2.3 CSRF — 70点 🟡

**評価**: 部分的に対策済み

**良い点**:
- `SameSite=Strict` Cookie設定により、クロスサイトリクエストを大幅に軽減
- ログイン後のセッションはHMAC署名で保護

**問題点**:
- APIエンドポイントに明示的なCSRFトークン検証なし
- `SameSite=Strict` がCSRF防御の主な手段だが、完全ではない（同一サイトフォームからの攻撃は防げない）

**改善案**:
```typescript
// CSRFトークンをフォームに埋め込み、APIで検証
// または Double Submit Cookie パターンの実装
```

---

### 2.4 認証 — 75点 🟡

**評価**: 基本的に安全だが、重大な問題あり

**良い点**:
- HMAC-SHA256署名付きトークン（改ざん検知）
- HttpOnly Cookie（JavaScriptからアクセス不可）
- SameSite=Strict（CSRF軽減）
- TTL 7日間（セッション有効期限）
- 定数時間比較でタイミング攻撃を防止

```typescript
// ✅ タイミング攻撃対策
let diff = 0
for (let i = 0; i < expected.length; i++) {
  diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
}
return diff === 0
```

**重大問題**:
```
🔴 パスワードが平文でDBに保存されている
   users テーブルの password カラムが TEXT（平文）
   DBが漏洩した場合、全ユーザーのパスワードが即座に解読される
```

**改善案**:
```typescript
// bcrypt ハッシュ化（Cloudflare Workersではbcrypt使用不可のため代替）
// Web Crypto API の PBKDF2 を使用
const hashPassword = async (password: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  )
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  )
  return btoa(String.fromCharCode(...salt)) + '.' + btoa(String.fromCharCode(...new Uint8Array(hash)))
}
```

---

### 2.5 権限制御 — 70点 🟡

**評価**: テナント分離は実装済みだが不完全

**良い点**:
- 全クエリに `tenant_id` フィルタを付与
- デモモード: GET以外を403で拒否

**問題点**:
- `is_admin` チェックがバックアップAPIのみ（一部の管理操作に管理者チェックなし）
- tenant_id フィルタの適用漏れリスク（手動実装のため）
- `product_suppliers` テーブルの一部クエリでtenant_idフィルタが確認できない

**改善案**:
```typescript
// 管理者権限チェックのmiddleware化
const requireAdmin = async (c, next) => {
  const user = c.get('sessionUser')
  if (!user?.isAdmin) return c.json({ error: 'Admin required' }, 403)
  return next()
}
app.use('/backup/*', requireAdmin)
```

---

### 2.6 API セキュリティ — 80点 🟡

**評価**: 良好

**良い点**:
- 全APIにCookie認証が必要（`/api/demo-reset` 除く）
- デモモードで書き込みブロック
- CORS設定（`app.use('/api/*', cors())`）

**問題点**:
- CORS設定が `cors()` デフォルト（`*` を許可している可能性）
- `/api/demo-reset` はsecretパラメータ認証だが、GET経由でURL履歴に残る

**改善案**:
```typescript
// CORS を厳格に設定
app.use('/api/*', cors({
  origin: ['https://golfwing-order.pages.dev'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  credentials: true,
}))
```

---

### 2.7 Secrets管理 — 65点 🟠

**評価**: 要改善

**問題点**:
```typescript
// ⚠️ デフォルトシークレットがソースコードにハードコード
const DEFAULT_SECRET = 'golfwing-secret-key-change-in-production'
```

```typescript
// ⚠️ デフォルトパスワードがハードコード
const validPass = env.AUTH_PASSWORD || 'golfwing2024'
```

```
// ⚠️ 0011マイグレーション内に初期パスワードが平文で記載
INSERT INTO users (...password...) VALUES (..., 'golfwing2024', ...)
```

**改善案**:
1. `AUTH_SECRET` を必須環境変数にして、未設定時は起動を拒否
2. デフォルトパスワードの削除（全ユーザーをDB管理のみに）
3. マイグレーションファイルからパスワードを削除し、別途セットアップスクリプト化

---

### 2.8 ロギング — 30点 🔴

**評価**: 不足

**現状**:
- Cloudflare Workers の `console.log` のみ（Cronの実行ログのみ）
- ログイン試行・失敗のログなし
- 発注操作のログなし
- エラーの構造化ログなし

**改善案**:
```typescript
// 構造化ログの追加
const logger = {
  info: (action: string, data: object) => 
    console.log(JSON.stringify({ level: 'info', ts: new Date().toISOString(), action, ...data })),
  error: (action: string, err: Error) =>
    console.error(JSON.stringify({ level: 'error', ts: new Date().toISOString(), action, message: err.message }))
}

// 使用例
logger.info('login_success', { username, tenantId, ip: c.req.header('CF-Connecting-IP') })
logger.info('order_created', { orderId, tenantId, amount })
```

---

### 2.9 バックアップ — 55点 🟠

**評価**: 手動バックアップのみで不安定

**現状**:
- `/admin/backup` による手動JSON/CSVダウンロード
- Cloudflare D1の自動バックアップはPaidプランのみ
- バックアップの定期実行の仕組みなし

**改善案**:
1. Cron Triggerを使ったD1定期バックアップ（R2に保存）
2. バックアップのGCSまたはS3への自動送信

---

### 2.10 Rate Limit — 20点 🔴

**評価**: 未実装

**現状**:
- レート制限なし（ブルートフォース攻撃が可能）
- ログイン試行回数制限なし

**改善案**:
```typescript
// Cloudflare Workers KVを使ったシンプルなRate Limit
const RATE_LIMIT_KEY = `ratelimit:login:${ip}`
const attempts = await kv.get(RATE_LIMIT_KEY)
if (Number(attempts) > 5) {
  return c.json({ error: 'Too many requests' }, 429)
}
await kv.put(RATE_LIMIT_KEY, String(Number(attempts) + 1), { expirationTtl: 300 })
```

または Cloudflare WAF のルールでレート制限（Cloudflare Free Planでも利用可能）。

---

## 3. セキュリティ改善優先度

| 優先度 | 改善内容 | 難易度 | 影響度 |
|---|---|---|---|
| 🔴 最高 | パスワードのハッシュ化（PBKDF2） | 中 | 致命的リスク回避 |
| 🔴 最高 | AUTH_SECRET の必須化・デフォルト値削除 | 低 | 認証漏洩リスク回避 |
| 🟠 高 | XSSエスケープの一貫した適用 | 中 | データ漏洩・改ざん防止 |
| 🟠 高 | Rate Limit実装（ログイン） | 低 | ブルートフォース防止 |
| 🟡 中 | ロギング強化（構造化ログ） | 低 | 監査・インシデント対応 |
| 🟡 中 | bulk-importのテーブル名ホワイトリスト | 低 | SQLi防止 |
| 🟢 低 | CSPヘッダー追加 | 低 | XSS追加防御 |
| 🟢 低 | CORS厳格化 | 低 | API保護 |
