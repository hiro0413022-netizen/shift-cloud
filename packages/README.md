# packages/

YOZAN GENESIS 共通パッケージ（DECISIONS #35 — #10の「packages化」を11アプリ目で履行）。

## 方針

- **新規アプリは `@yozan/core` を使う**（`npm run new-app` の雛形が最初から使用）
- **既存11アプリは当面コピーのまま**。各アプリの `src/lib/auth.ts` 等は微妙に分岐済みで、一括移行は回帰リスクが高い（AUDIT_2026-07-11 §3）。移行は1アプリずつ・Vercelビルド確認付きで実施（バックログB-6）
- `ui` / `config` の集約は既存アプリのデザイン分岐が大きいため後続。テンプレートは自前の最小UI（`src/components/ui.tsx`）を持つ

## packages/core

| モジュール | 内容 |
|---|---|
| `@yozan/core/auth` | `createActorResolver({ anyOf })` — staff+roles解決・権限チェック（#18） |
| `@yozan/core/kernel` | `logEvent` / `logAudit`（company_events / audit_logs #16） |
| `@yozan/core/middleware` | `createAuthMiddleware({ publicPrefixes })` |
| `@yozan/core/supabase/admin` | service_roleクライアント（#11） |
| `@yozan/core/supabase/server` | RLSクライアント（@supabase/ssr） |

TSソースのまま提供するため、利用側の `next.config.ts` に `transpilePackages: ["@yozan/core"]` が必要（テンプレートは設定済み）。
