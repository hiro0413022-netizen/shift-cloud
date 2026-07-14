# ROADMAP.md — 開発ロードマップ

> **GolfWing 仕入発注管理システム**  
> 最終更新: 2025-06-25  
> 担当: AI Development Team

---

## 概要

このロードマップは、現在の技術的負債（TECH_DEBT.md参照）・セキュリティスコア（61.5/100）・品質スコア（64.8/100）を踏まえ、**段階的かつ安全にシステムを改善する**ための計画です。

YOZAN Genesis統合（YOZAN_GENESIS.md参照）を最終目標に据えつつ、短期は「壊れない・漏れない」、中期は「運用コストを下げる」、長期は「AIが自律運用する」方向性で計画しています。

---

## ロードマップ全体像

```mermaid
gantt
    title GolfWing 開発ロードマップ 2025-2027
    dateFormat YYYY-MM
    axisFormat %Y-%m

    section 短期 Phase 1（〜3ヶ月）
    P0: パスワードハッシュ化           :crit, p0pw,   2025-07, 1w
    P0: AUTH_SECRET必須化              :crit, p0sec,  2025-07, 3d
    P0: bulk-import SQLiパッチ         :crit, p0sql,  2025-07, 1d
    suggest-supplier API実装          :p1sugg, 2025-07, 1w
    Rate Limit実装                    :p1rate, 2025-08, 2w
    CSRFトークン追加                  :p1csrf, 2025-08, 1w
    エラーログ整備                    :p1log,  2025-08, 1w
    ユニットテスト導入                :p1test, 2025-09, 3w

    section 中期 Phase 2（〜1年）
    メール送信内部化（Resend）        :p2mail, 2025-10, 3w
    承認ワークフロー                  :p2appr, 2025-11, 6w
    pages.ts分割（17ファイル）        :p2page, 2026-01, 4w
    管理者ダッシュボード強化          :p2dash, 2026-02, 3w
    YOZAN Genesis APIアダプター       :p2yozan, 2026-03, 4w
    入荷QRコードスキャン              :p2qr,  2026-04, 3w

    section 長期 Phase 3（〜3年）
    在庫管理モジュール統合            :p3inv,  2026-07, 3M
    発注予測AIエージェント            :p3ai,   2026-10, 4M
    SaaS化・マルチテナント拡張        :p3saas, 2027-01, 6M
    モバイルアプリ（PWA）             :p3pwa,  2027-04, 4M
```

---

## Phase 1 — 短期（〜3ヶ月）: 「壊れない・漏れない基盤」

### 目標
**セキュリティスコア: 61.5 → 80 / 100**

---

### P0: 緊急セキュリティ修正（1〜2週間）

#### SP-001: パスワードのハッシュ化 🔴 必須
**現状の問題:** パスワードを平文でD1に保存。DBが漏洩すれば全ユーザーのパスワードが即座に露出。

```typescript
// 現在（auth.ts L120）
const storedPassword = user?.password ?? ''
const isValid = (storedPassword === password)  // 平文比較 ❌

// 修正後
import { pbkdf2, randomBytes } from 'node:crypto'  // Workers環境ではWeb Crypto API使用
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256)
  const hash = btoa(String.fromCharCode(...new Uint8Array(bits)))
  const saltStr = btoa(String.fromCharCode(...salt))
  return `pbkdf2:${saltStr}:${hash}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltStr, hash] = stored.split(':')
  if (algo !== 'pbkdf2') return stored === password  // 移行期間の平文互換
  const salt = Uint8Array.from(atob(saltStr), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256)
  const newHash = btoa(String.fromCharCode(...new Uint8Array(bits)))
  return hash === newHash
}
```

**マイグレーション手順:**
1. `verifyPassword()` に平文フォールバックを実装（移行期間）
2. 初回ログイン時に自動的にハッシュへ移行
3. 全ユーザーハッシュ化完了後にフォールバック削除

---

#### SP-002: AUTH_SECRET 必須化 🔴 必須
**現状の問題:** `DEFAULT_SECRET = 'golfwing-secret-key-change-in-production'` がソースに埋め込まれている。

```typescript
// 現在（auth.ts L15）
const DEFAULT_SECRET = 'golfwing-secret-key-change-in-production'
const secret = env.AUTH_SECRET ?? DEFAULT_SECRET  // ❌ フォールバックあり

// 修正後（auth.ts）
const secret = env.AUTH_SECRET
if (!secret) {
  throw new Error('AUTH_SECRET environment variable is required. Set it with: wrangler secret put AUTH_SECRET')
}
```

**設定手順:**
```bash
# 本番環境への設定
npx wrangler secret put AUTH_SECRET
# プロンプト入力: ランダム64文字以上の文字列
# 例: openssl rand -base64 48

# ローカル開発（.dev.vars）
AUTH_SECRET=your-local-secret-at-least-32-chars
```

---

#### SP-003: bulk-import SQL インジェクション修正 🔴 必須
**現状の問題:** `api.ts` の `POST /api/bulk-import` で文字列連結によるSQL構築を使用。

```typescript
// 現在（api.ts bulk-import付近）
const query = `INSERT INTO products (name, jan_code) VALUES ('${row.name}', '${row.jan_code}')`
// ❌ 文字列連結はSQLインジェクションの危険

// 修正後
const stmt = c.env.DB.prepare('INSERT INTO products (name, jan_code) VALUES (?, ?)')
await stmt.bind(row.name, row.jan_code).run()
```

---

### SP-004: suggest-supplier API 実装（TD-006解決）
**現状の問題:** `new-order.js` から呼び出されているが `GET /api/suggest-supplier` は未実装（404）。

```typescript
// api.ts に追加
app.get('/api/suggest-supplier', authMiddleware, async (c) => {
  const productId = c.req.query('product_id')
  const quantity = Number(c.req.query('quantity') ?? 0)
  const tenantId = c.get('sessionUser').tenantId

  if (!productId) return c.json({ error: 'product_id required' }, 400)

  const supplier = await resolveSupplier(c.env.DB, Number(productId), tenantId)
  if (!supplier) return c.json({ supplier: null, reason: 'no_rule' })

  return c.json({
    supplier,
    reason: supplier.source,  // 'product_suppliers' | 'default_supplier_id' | 'supplier_rules'
    confidence: supplier.source === 'product_suppliers' ? 1.0 : 0.7
  })
})
```

---

### SP-005: Rate Limit 実装
**目的:** ブルートフォース攻撃・API濫用防止。

```typescript
// src/middleware/rateLimiter.ts
import { Context, Next } from 'hono'

const requestCounts = new Map<string, { count: number; resetAt: number }>()

export const rateLimiter = (maxRequests: number, windowMs: number) => {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
    const key = `${ip}:${c.req.path}`
    const now = Date.now()
    const record = requestCounts.get(key)

    if (record && now < record.resetAt) {
      if (record.count >= maxRequests) {
        return c.json({ error: 'Too many requests' }, 429)
      }
      record.count++
    } else {
      requestCounts.set(key, { count: 1, resetAt: now + windowMs })
    }
    return next()
  }
}

// 適用（index.tsx）
app.post('/api/login', rateLimiter(5, 60_000))      // ログイン: 1分5回
app.use('/api/*', rateLimiter(100, 60_000))          // API全体: 1分100回
```

> **Note:** Workers環境ではメモリはリクエスト間で共有されないため、本番では Cloudflare Durable Objects または KV を使用。

---

### SP-006: CSRFトークン追加

```typescript
// Honoのcsrfミドルウェア活用
import { csrf } from 'hono/csrf'

// index.tsx
app.use('/api/*', csrf({
  origin: ['https://golfwing.pages.dev', 'http://localhost:3000']
}))
```

---

### SP-007: エラーログ整備

```typescript
// src/middleware/logger.ts
export const errorLogger = async (c: Context, next: Next) => {
  try {
    await next()
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      path: c.req.path,
      method: c.req.method,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      // PIIを含まないよう注意
    }))
    return c.json({ error: 'Internal Server Error' }, 500)
  }
}
```

---

### SP-008: ユニットテスト導入

**優先テスト対象:**
1. `resolveSupplier()` — ビジネスロジックの核心
2. `generateToken()` / `verifyToken()` — セキュリティ基盤
3. `xlsxHelper.ts` — バイナリ生成ロジック

```bash
# セットアップ
npm install --save-dev vitest @cloudflare/vitest-pool-workers

# package.json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

```typescript
// src/__tests__/resolveSupplier.test.ts
import { describe, it, expect } from 'vitest'
import { resolveSupplier } from '../routes/api'

describe('resolveSupplier', () => {
  it('product_suppliersが最優先で返される', async () => {
    // ...
  })
  it('product_suppliersがなければdefault_supplier_idを使う', async () => {
    // ...
  })
  it('どちらもなければsupplier_rulesにフォールバック', async () => {
    // ...
  })
})
```

---

## Phase 2 — 中期（〜1年）: 「運用コストを下げる」

### 目標
**品質スコア: 64.8 → 85 / 100**

---

### MP-001: メール送信内部化（〜3週間）
**現状の問題:** `mailto:` リンクで手動送信。メール送信の確認・履歴管理が不可能。

**採用サービス:** [Resend](https://resend.com) (Cloudflare Workers対応, 月3,000通無料)

```typescript
// src/services/mailer.ts
export async function sendOrderEmail(params: {
  to: string; cc?: string[]; subject: string; body: string; env: Bindings
}): Promise<{ messageId: string }> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${params.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${params.env.APP_SENDER_NAME} <${params.env.APP_SENDER_MAIL}>`,
      to: params.to,
      cc: params.cc,
      subject: params.subject,
      text: params.body,
    })
  })
  return res.json()
}
```

**付随実装:**
- `email_logs` テーブル追加（送信履歴・開封トラッキング）
- 発注画面のUIを「メール作成ボタン」→「送信ボタン」に変更
- 送信失敗時のリトライキュー（Cloudflare Queues）

---

### MP-002: 承認ワークフロー（〜6週間）
**現状の問題:** 発注が1人で完結。高額発注・特定仕入先への承認フロー不在。

```sql
-- migration 0014_approval_workflow.sql
CREATE TABLE IF NOT EXISTS approval_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  condition_type TEXT NOT NULL,  -- 'amount_over' | 'supplier_id' | 'category'
  condition_value TEXT NOT NULL,
  required_approvers INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES purchase_orders(id),
  rule_id INTEGER NOT NULL REFERENCES approval_rules(id),
  status TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  approver_username TEXT,
  comment TEXT,
  decided_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**ステータス遷移変更:**
```
draft → awaiting_approval → draft_created → ordered → ...
                         ↘ rejected → draft（修正可能）
```

---

### MP-003: pages.ts 分割（〜4週間）
**現状の問題:** 5,106行の単一ファイルは最大の保守性リスク。

**分割計画:**
```
src/routes/pages/
├── index.ts          # ルーター（pages.tsの役割のみ）
├── dashboard.ts      # ダッシュボード画面
├── orders.ts         # 発注一覧・新規発注・詳細
├── receiving.ts      # 入荷処理
├── products.ts       # 商品マスタ
├── suppliers.ts      # 仕入先マスタ
├── customers.ts      # 顧客マスタ
├── reports.ts        # レポート・CSV出力
├── settings.ts       # 設定・管理者
└── auth.ts           # ログイン・ログアウト

src/components/         # 共通HTMLテンプレート（Hono JSX）
├── layout.tsx        # 共通レイアウト（header/nav/footer）
├── table.tsx         # テーブルコンポーネント
├── form.tsx          # フォームコンポーネント
└── modal.tsx         # モーダルコンポーネント
```

**移行方針:**
1. レイアウト共通化から開始（重複コード削減：推定3,000行→1,500行）
2. 画面ごとに1ファイルに分離
3. Hono JSXを積極活用（テンプレートリテラル → JSX）

---

### MP-004: 管理者ダッシュボード強化（〜3週間）
- KPI可視化（発注金額推移・仕入先別比率・遅延率）
- アラート設定（在庫切れ予測・高額発注通知）
- Cloudflare Analytics連携

---

### MP-005: YOZAN Genesis APIアダプター（〜4週間）
YOZAN_GENESIS.md Phase 2として、外部システムとの接続インターフェースを実装。

```typescript
// src/routes/genesis-adapter.ts
// YOZAN Genesis が GolfWing を呼び出すためのAPIブリッジ
app.get('/genesis/orders', genesisAuthMiddleware, async (c) => {
  // YOZAN Genesis 標準フォーマットで発注データを返す
})

app.post('/genesis/orders/sync', genesisAuthMiddleware, async (c) => {
  // YOZAN Genesis からの発注データ同期を受け取る
})
```

---

### MP-006: 入荷QRコードスキャン（〜3週間）
- カメラAPIを使用したJANコードスキャン
- 発注品と入荷品のマッチング自動化
- モバイルブラウザ対応（PWA準備）

---

## Phase 3 — 長期（〜3年）: 「AIが自律運用する」

### 目標
**YOZAN Genesis フル統合 + AIエージェント稼働**

---

### LP-001: 在庫管理モジュール統合（〜3ヶ月）
**現状の問題:** 仕入発注と在庫が分離している。入荷後の在庫数が追跡不可。

```sql
-- migration 0015_inventory.sql
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  location TEXT,  -- 棚番号
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  type TEXT NOT NULL,  -- 'receive' | 'ship' | 'adjust' | 'return'
  quantity INTEGER NOT NULL,
  reference_id INTEGER,  -- purchase_order_id or 将来の sales_order_id
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### LP-002: 発注予測AIエージェント（〜4ヶ月）
**目的:** 過去の発注パターンを学習し、適切なタイミングで発注提案を自動生成。

```typescript
// src/ai/orderPredictor.ts（Workers AI使用）
export async function predictReorderPoint(productId: number, env: Bindings) {
  // Cloudflare Workers AI (@cf/meta/llama-3.1-8b-instruct)
  const history = await getOrderHistory(productId, env.DB)
  const prediction = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{
      role: 'system',
      content: 'You are a procurement analyst. Analyze order history and predict reorder points.'
    }, {
      role: 'user',
      content: JSON.stringify(history)
    }]
  })
  return prediction
}
```

**AIエージェントの自律タスク:**
1. 毎朝9時: 在庫枯渇予測レポート生成
2. 発注量自動提案（季節性・リードタイム考慮）
3. 仕入先評価（遅延率・品質スコア自動更新）
4. 異常検知（突然の高額発注・新規仕入先への発注）

---

### LP-003: SaaS化・マルチテナント拡張（〜6ヶ月）
**現状:** tenant_id=1がハードコード、tenant_id=0がデモ。

**SaaS化計画:**
- テナント登録フロー（セルフサービスサインアップ）
- プラン別機能制限（Free: 月100発注 / Pro: 無制限 / Enterprise: AI機能）
- Stripe課金統合
- テナント間データ完全分離（Row Level Securityの本格実装）

```typescript
// 将来のテナント管理テーブル
// migration 0020_tenants.sql
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'pro' | 'enterprise'
  status TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

### LP-004: モバイルアプリ（PWA）（〜4ヶ月）
- Service Worker によるオフライン対応
- プッシュ通知（発注承認・入荷通知）
- QRコード/バーコードスキャン（入荷確認）
- カメラ撮影→OCRによる納品書自動読み取り

---

## マイルストーン & KPI

| フェーズ | 期間 | 主要KPI | 成功基準 |
|---------|------|---------|---------|
| Phase 1 | 〜2025-09 | セキュリティスコア | 61.5 → 80点 |
| Phase 1 | 〜2025-09 | テストカバレッジ | 0% → 40% |
| Phase 2 | 〜2026-03 | 品質スコア | 64.8 → 85点 |
| Phase 2 | 〜2026-03 | pages.ts行数 | 5,106行 → 500行×10ファイル |
| Phase 2 | 〜2026-06 | メール自動送信率 | 0% → 90% |
| Phase 3 | 〜2026-12 | AI発注提案採用率 | - → 70% |
| Phase 3 | 〜2027-06 | テナント数 | 1 → 10+ |

---

## リスクと対策

| リスク | 確率 | 影響 | 対策 |
|-------|------|------|------|
| pages.ts分割中のリグレッション | 高 | 高 | 画面ごとにE2Eテスト作成してから分割 |
| メール送信内部化後の到達率低下 | 中 | 高 | Resend SPF/DKIM設定・スパムフィルターテスト |
| D1の容量上限（10GB/database） | 低 | 中 | 古いデータのアーカイブポリシー策定 |
| YOZAN Genesis仕様変更への追従 | 中 | 中 | APIアダプター層でバージョン管理 |
| Workers AI精度不足 | 中 | 低 | 人間承認フロー必須・フィードバックループ |

---

## 関連ドキュメント

- [TECH_DEBT.md](./TECH_DEBT.md) — 技術的負債詳細（Phase 1の根拠）
- [SECURITY.md](./SECURITY.md) — セキュリティ監査（P0修正の根拠）
- [QUALITY.md](./QUALITY.md) — 品質監査（Phase 2の根拠）
- [YOZAN_GENESIS.md](./YOZAN_GENESIS.md) — YOZAN Genesis統合計画（Phase 2-3の根拠）
- [AI_CONTEXT.md](./AI_CONTEXT.md) — AI操作ガイド（各Phaseの変更ルール）
