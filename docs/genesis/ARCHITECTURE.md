# Genesis ARCHITECTURE（2026-07-11 実態反映版）

## 全体構成 — 「独立アプリ量産＋DB共有＋GENESIS司令室」

```
[現場スタッフ/お客様]        [古川さん]           [AIエージェント/n8n/cron]
      │                        │                        │
  独立アプリ群 (各Vercel)   apps/genesis (Vercel)      /api/v1・Webhook
  shift-cloud / member-os    Cockpit / Command /        │
  money-golfwing / legal-os  Inbox / Vault / Finance    │
  survey-os / reserve-os        │                       │
      └────────────┬───────────┴───────────────────────┘
                   ▼
     Supabase (単一プロジェクト qrgpblnnhdudigarrtuz)
     PostgreSQL + RLS(company_id) + Auth + Storage
     共通Kernel: audit_logs / company_events / ai_suggestions /
                 approval_requests / kpis / vault_systems
```

**勝ちパターン（DECISIONS #27/#30/#33/#34で確立）**: 入力面（現場・他者が触る画面）は独立アプリとして別Vercelに出し、GENESISは閲覧＋承認だけを持つ。DBは全アプリ共有なのでKPIは自動でGENESISへ流入する。

## アプリ一覧（apps/ 11本 + 別枠1）

| アプリ | 役割 | スキーマ接頭辞 | 認可 | 状態 |
|--------|------|--------------|------|------|
| genesis | 司令室（古川さん専用）: Cockpit/CEO AI/Inbox/Finance/Vault | fin_ / sec_ / vault_ 等 | view_hq | 本番 |
| shift-cloud | シフト・勤怠・給与 | (無印: staff, shifts…) | ロール別 | 本番 |
| member-os | 体験受付・会員名簿・一時利用台帳 | mbr_ | use_reception | 実装済・未デプロイ |
| money-golfwing | Money OS（事業別お金管理） | mon_ | mon_grants | 本番 |
| legal-os | 契約書保管・期限管理 | leg_ | use_legal | 本番 |
| survey-os | アンケート/情報収集 | svy_ | use_survey | 実装済・未デプロイ |
| reserve-os | ビジター申込型予約 | res_ | use_reception | 実装済・未デプロイ |
| corporate | YOZANコーポレートサイト | - | 公開 | 本番 |
| kallinos | KALLINOSサイト | - | 公開 | 本番 |
| golfwing | GolfOrder（Vite/Hono、D1→Supabase移行中 #19） | - | - | 移行中 |
| report-os | 月次資料生成（JSON駆動pptx、Webアプリではない） | - | - | スクリプト |

**`sales-support-saas/`（apps/外・意図的）**: PGA NOTE営業サポートSaaS。外販商材でファイン福原氏が営業管理・YOZAN GENESISの業務システム群とは別物のため apps/ に含めない。正典は同ディレクトリの SPEC.md / SETUP.md。

## リポジトリ構成

```
apps/*                    上記11アプリ（npm workspaces）
packages/core/            共通コア: auth / kernel / supabase / middleware（#35）
                          ※新規アプリ用。既存アプリは各 src/lib にコピーが残る（段階移行 B-6）
templates/app-template/   新アプリ雛形（scripts/new-app.mjs が使用）
scripts/new-app.mjs       アプリ生成器: npm run new-app -- --name ... --prefix ...
tests/                    金額ロジックの回帰テスト（node --test、CIで自動実行）
.github/workflows/ci.yml  CI: テスト + tsc + next build（全Nextアプリ）
supabase/migrations/      追加のみ。採番はREADME.md台帳（次: 0034〜）
docs/genesis/             正典（VISION / DECISIONS / OPERATIONS / 各STANDARD）
docs/modules/<code>/      各モジュールの設計正典（SYSTEM.md等）
```

## 12本目のアプリを1日で出す手順（完成の定義）

1. `npm run new-app -- --name xxx-os --title "Xxx OS" --prefix xxx --permission use_xxx --port 3xxx`（5分）
2. migration追加（README台帳で採番）→ MCPで本番適用（30分）
3. ドメイン画面・ロジック実装＋金額ロジックはtests/へ（数時間）
4. push → CI green確認 → OPERATIONS §7のチェックリストでVercelへ（10分）
5. vault_systems登録・module live化（5分）

## マルチテナント・権限（変更なし）

- テナントルート = `companies`。RLSは`company_id`で分離（#3）。ロール別権限はアプリ層
- service_roleキーはサーバーのみ。書き込みは requireActor 権限チェック＋監査ログ（#11）
- 給与系・Vaultはservice_role専用の例外保護（#3/#26）
- Genesis UIは `view_hq` のみ（#18）。現場は各アプリの `use_*` 権限

## AIエージェント対応（変更なし）

- 全ミューテーションはServer Action経由で監査ログ記録。同じ操作を `/api/v1/*` でも公開
- AI提案は `ai_suggestions`・指示案は `prompts` 下書き。実行は人間承認後（VISION §7）
- CEO AI: 毎朝6時cron（/api/cron/daily）→ KPI再集計 → **KPI整合性チェック（kpi-checks.ts）** → 分析 → 日次レポート

## 検証（2026-07-11新設）

- `npm test` — 金額ロジック（給与計算・CSV取込・月会費単価）の回帰テスト
- CI（GitHub Actions）が push/PR ごとに テスト＋tsc＋next build を全Nextアプリで実行。**ローカル環境のtsc/buildは信頼しない**（サンドボックスのマウント同期問題）。CIとVercelビルドが正
