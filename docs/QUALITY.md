# QUALITY.md — 品質監査

> **最終更新**: 2026-06-25  
> **監査者**: AI System Audit  
> **評価対象**: GolfWing Order Management System v1.13

---

## 1. 品質スコア総合評価

| 項目 | 点数 | 満点 | 評価 |
|---|---|---|---|
| コード品質 | 72 | 100 | 🟡 良好 |
| 保守性 | 58 | 100 | 🟠 要改善 |
| 可読性 | 75 | 100 | 🟡 良好 |
| 拡張性 | 65 | 100 | 🟡 良好 |
| パフォーマンス | 78 | 100 | 🟡 良好 |
| AI可読性 | 82 | 100 | 🟢 優秀 |
| テスト | 5 | 100 | 🔴 ほぼなし |
| コメント | 68 | 100 | 🟡 良好 |
| 命名 | 80 | 100 | 🟢 良好 |
| **総合** | **583** | **900** | **64.8点** |

---

## 2. 項目別詳細

### 2.1 コード品質 — 72点 🟡

**良い点**:
- TypeScriptの厳格モード（`strict: true`）を使用
- ランタイム依存が `hono` のみ（最小化）
- Cloudflare Workers制約に従った実装（Node.js API不使用）
- Web Crypto APIの活用（認証のセキュリティ）

**問題点**:

```typescript
// ⚠️ any型の使用（api.ts内）
const rows = await db.prepare(...).all<any>()  // 型安全性が低い

// ⚠️ エラーハンドリングが不一貫
try {
  // ...
} catch (e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)  // 良い
  return c.json({ error: msg }, 500)  // エラー詳細をクライアントに返している（本番では危険）
}
```

**改善案**:
- D1クエリの戻り値に型定義を追加
- エラーの内部詳細を本番ではクライアントに返さない
- エラーメッセージの国際化対応

---

### 2.2 保守性 — 58点 🟠

**重大問題**: `pages.ts` が5,106行の単一ファイル

```
📊 ファイルサイズ分析:
- src/routes/pages.ts: 5,106行 🔴 (過大)
- src/routes/api.ts: 2,544行 🟡 (大きい)
- src/index.tsx: 389行 🟢 (適正)
- src/auth.ts: 435行 🟢 (適正)
```

**問題**:
1. `pages.ts` には17画面分のHTMLが全て直接記述されている
2. 共通コンポーネント（ナビバー、ヘッダー等）が重複している
3. インラインCSS・JSが混在している
4. 1つのバグ修正で誤って別画面に影響を与えるリスク

**改善案**:
```
推奨リファクタリング構造:
src/
  components/
    navbar.tsx        # 共通ナビバー
    layout.tsx        # ページレイアウト
    badge.tsx         # ステータスバッジ
  routes/
    pages/
      dashboard.tsx   # ダッシュボードページ
      orders.tsx      # 発注関連ページ
      products.tsx    # 商品マスタページ
      suppliers.tsx   # 仕入先マスタページ
      receipts.tsx    # 入荷関連ページ
    api/
      orders.ts       # 発注API
      products.ts     # 商品API
      suppliers.ts    # 仕入先API
```

---

### 2.3 可読性 — 75点 🟡

**良い点**:
- 日本語コメントで業務ロジックが説明されている
- マイグレーションファイルに詳細なコメントあり
- 変数名・関数名が意味を表している（`resolveSupplier`, `buildEmailBody`等）
- `statusLabel()` 等のユーティリティ関数で読みやすくなっている

**問題点**:
```typescript
// ⚠️ 長い関数（POST /orders は約200行）
// 発注作成のメール文生成ロジックが複雑で追跡困難
app.post('/orders', async (c) => {
  // ... 200行以上の処理 ...
})
```

**改善案**:
- 大きな関数を意味のある小関数に分割
- 複雑なメール生成ロジックを `buildEmailBody()` として独立させる

---

### 2.4 拡張性 — 65点 🟡

**良い点**:
- マルチテナント設計（tenant_id分離）
- `product_suppliers` テーブルによる柔軟な仕入先管理
- 仕入先判定ルールのDB管理（コード変更なしでルール追加可能）
- Cloudflare D1/KV/R2への切り替えが容易な構造

**問題点**:
- ビジネスロジックとHTMLテンプレートが混在（pages.ts）
- APIレスポンスの型定義が不完全（将来の変更時に影響範囲不明確）
- フロントエンドが Vanilla JS（状態管理が複雑化しやすい）

---

### 2.5 パフォーマンス — 78点 🟡

**良い点**:
- Cloudflare Edge（グローバル分散）で低レイテンシ
- 必要なインデックスが追加されている（0003マイグレーション）
- 適切なクエリ設計（不要なJOINを避けている）
- 静的ファイルのCDN（Bootstrap/FontAwesome）

**問題点**:
```typescript
// ⚠️ N+1クエリの可能性
// ダッシュボードで各発注の明細を個別に取得している可能性
for (const order of orders) {
  const items = await db.prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id=?')
    .bind(order.id).all()  // N+1
}
```

**改善案**:
- ダッシュボードクエリの最適化（IN句またはJOINで一括取得）
- D1 Batchを活用した複数クエリの並列実行

---

### 2.6 AI可読性 — 82点 🟢

**評価**: 優秀（AIが理解・修正しやすい構造）

**良い点**:
- ファイル先頭に役割コメントあり
- マイグレーションに変更履歴・理由が記載
- 型定義が明確（Bindings型, SessionUser型等）
- 業務用語が一貫して使われている（発注、仕入先、掛け率等）
- HANDOVER.mdによる引き継ぎドキュメント

**改善案**:
- 関数ごとのJSDocコメント追加
- 型定義の独立ファイル化（`types/` フォルダ）

---

### 2.7 テスト — 5点 🔴

**評価**: ほぼ未実装

**現状**:
- 単体テスト: なし
- 統合テスト: なし
- E2Eテスト: なし
- テスト環境の設定すらない

**改善案**:
```typescript
// Hono用のテストフレームワーク設定
// package.json
{
  "devDependencies": {
    "vitest": "^1.0.0",
    "@cloudflare/workers-types": "..."
  }
}

// src/routes/__tests__/api.test.ts
import { describe, it, expect } from 'vitest'
import app from '../api'

describe('GET /api/suppliers', () => {
  it('returns suppliers list', async () => {
    const res = await app.request('/api/suppliers', {
      headers: { Cookie: 'gw_session=test_token' }
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('suppliers')
  })
})
```

**最低限実装すべきテスト**:
1. 認証フロー（ログイン・ログアウト）
2. 発注作成API（POST /api/orders）
3. ステータス変更API（POST /api/orders/:id/status）
4. デモモードの書き込みブロック（403確認）

---

### 2.8 コメント — 68点 🟡

**良い点**:
- ファイル冒頭に概要コメントあり（auth.ts等）
- マイグレーションファイルに詳細説明あり
- 複雑なロジックにインラインコメントあり

**問題点**:
- API関数にJSDocがない
- pages.tsの各ページに概要コメントが不足
- 環境変数の説明コメントが散在

---

### 2.9 命名 — 80点 🟢

**評価**: 良好

**良い点**:
- 一貫したcamelCase（TypeScript）/ snake_case（DB・API）の使い分け
- 業務用語に沿った命名（`purchase_orders`, `supplier_rules`, `receipt_items`）
- 関数名が意図を表している（`resolveSupplier`, `buildEmailBody`, `resetDemoData`）
- 定数名が明確（`DEMO_TENANT_ID`, `SESSION_TTL`, `COOKIE_NAME`）

**問題点**:
- `uuid5()` は実際にはUUID v5ではなくランダム5文字→命名が誤解を招く
- `nowCode()` の命名が不明確（`timestampCode()` の方が適切）

---

## 3. 品質改善優先度

| 優先度 | 改善内容 | 効果 |
|---|---|---|
| 🔴 最高 | pages.tsのコンポーネント分割 | 保守性・可読性の大幅向上 |
| 🔴 最高 | 最低限のユニットテスト追加 | バグ混入防止 |
| 🟠 高 | 大きなAPI関数の分割 | 可読性・保守性向上 |
| 🟠 高 | エラー詳細のクライアント非公開 | セキュリティ向上 |
| 🟡 中 | JSDocコメントの追加 | AI可読性・保守性向上 |
| 🟡 中 | N+1クエリの最適化 | パフォーマンス向上 |
| 🟢 低 | TypeScript型定義の強化 | 型安全性向上 |
