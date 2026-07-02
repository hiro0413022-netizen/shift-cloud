# Genesis ARCHITECTURE

## 全体構成

```
[スタッフ スマホ] [管理者 PC] [iPad打刻] [本部] [AIエージェント/n8n]
        │              │           │        │            │
        └──────────────┴─── Next.js App (Vercel) ────────┘
                              │  Server Actions / Route Handlers
                              ▼
                        Supabase (PostgreSQL + RLS + Auth + Storage)
                              │
                        audit_logs / ai_suggestions / approval_requests
```

## レイヤー

| レイヤー | 責務 | 場所 |
|---------|------|------|
| Genesis Core | テナント・認証・RBAC・監査・通知・AI提案・承認 | `packages/auth`, `packages/database`, DB共通テーブル |
| Domain (Workforce) | シフト・勤怠・給与ロジック | `apps/shift-cloud/src/features/*` |
| UI | 画面 | `apps/shift-cloud/src/app/*`, `packages/ui` |

## リポジトリ構成（軽量モノレポ・確定）

```
apps/shift-cloud/        Next.js App Router
packages/types/          共有型（DB型はSupabaseから生成）
packages/database/       マイグレーション・クライアント・クエリ
packages/auth/           認証・権限ヘルパー
packages/ui/             共有UIコンポーネント
packages/config/         eslint/tsconfig共通設定
docs/ scripts/ tests/ supabase/migrations/
```

npm workspaces のみ使用。Turborepoはアプリが2つ以上になった時点で導入。

## マルチテナントモデル

- テナントルート = `companies`。RLSは`company_id`で分離
- ブランド（例: GOLF WING）→ 店舗（例: 宝塚）は会社内の階層
- スタッフは複数店舗に所属可能（`staff_store_assignments`）
- ロールはスコープ付き（会社/ブランド/店舗）で付与

## テナント分離の実装

1. RLS: 認可済みユーザーは自社`company_id`の行のみアクセス可（DBレベルで強制）
2. ロール別の細かい権限チェックはアプリ層（`packages/auth`）で実施
3. service_role キーはサーバーのみ。クライアントはanon key + RLS

## AIエージェント対応

- 全ミューテーションはServer Action → 共通`execute()`ラッパー経由（監査ログ自動記録）
- 同じ操作をRoute Handler (`/api/v1/*`) でも公開し、n8n・AIエージェントが呼べる
- AI提案は`ai_suggestions`に書き込み、人間が承認 → 実行
