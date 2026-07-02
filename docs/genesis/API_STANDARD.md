# API STANDARD

## 二層構成

1. **Server Actions** — 画面からのミューテーション（主経路）
2. **Route Handlers `/api/v1/<resource>`** — AIエージェント・n8n・外部連携用（Phase 6で公開）

両者は同じ`features/<feature>/actions.ts`のドメイン関数を呼ぶ。ロジックを二重実装しない。

## ミューテーション共通ラッパー

```ts
execute({ actor, action, input, run }) // 権限チェック → 実行 → audit_logs記録
```

全書き込みはこれを通す。直接supabaseクライアントでinsert/updateしない。

## レスポンス形式

```ts
type Result<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }
```

エラーコード: `UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND` / `VALIDATION` / `CONFLICT` / `INTERNAL`

## バリデーション

- 入力は必ずzodでパース（`features/<feature>/schema.ts`）
- クライアント入力を信用しない。`company_id`はセッションから解決し入力では受け取らない

## API公開時の認証（Phase 6）

- 外部エージェント: APIキー（`integration_configs`）＋スコープ
- レート制限・監査ログは人間と同一
