# CHANGELOG

## 2026-07-04
- feat(corporate): 画像11枚をGenspark CDNからapps/corporate/public/imagesへローカル化（GitHub Actions asset-mirror経由）。constants.tsをローカルパスに変更
- feat: `apps/kallinos` 新規追加 — www.kallinos.jpの静的ミラー（index/products/brand + css/js。残6ページはworkflow再実行で取得予定）
- feat: `apps/golfwing` 新規追加 — GolfOrder発注管理システムのソースをGensparkから回収（golfwing-srcブランチ経由、Hono+Cloudflare D1、migrations 0001〜0015、docs一式）。デプロイは当面Cloudflare Pages継続、将来Supabase/inventoryモジュールへ移行予定
- feat(corporate): モーションデザイン強化 — スクロール進捗バー、data-reveal汎用リビール（方向/ディレイ対応）、ヒーローKen Burns＋ゴールドグラデ文字、マーキー帯、CountUp統計バンド、モザイク写真キャプション、CTA発光ボーダー、prefers-reduced-motion対応。新規: MotionFx.tsx / CountUp.tsx。トップページにCTAボタン・バッジ・統計セクション追加
- fix: Gensparkによるmainへのforce push事故（336f880、SaaS履歴上書き）をローカルf245bf6からのforce pushで復旧。本番影響なし（該当デプロイはビルドERRORで旧版稼働継続）
- feat: `apps/corporate` 新規追加 — Genspark製コーポレートサイト（Next.js 16 + Tailwind v4、/business /marketing /about /vision /recruit /contact）をモノレポに統合。package name: yozan-corporate
- ops: 旧Vercelプロジェクト`shift-cloud`削除（稼働は`shift-cloud-shift-cloud`のみ）。リポジトリはPublic運用と決定（DECISIONS #14）
- db: `0005_genesis_kernel.sql`適用 — Genesis Kernel 16テーブル（modules / company_events / business_memories / decision_logs / ai_agents / ai_execution_logs / development_statuses / risks / blockers / kpis / simulations / prompts / reports / connectors / webhook_logs / external_events）＋RLS＋トリガー
- db: `0006_genesis_seed.sql`適用 — モジュール9件・AIエージェント19体・KPI4件・コネクタ13件・開発状況2件・決定ログ#1〜#18バックフィル・初期イベント/記憶
- feat: `apps/genesis` 新規作成（Next.js、ポート3001） — Genesis Cockpit（リング型UI・状態モーション）/ CEO AI Command Center（開発状況・リスク・ブロッカー・承認待ち・AI指示プロンプト生成・日次レポート生成）/ Company Events / Business Memory / Decision Log / AI Agents / Approvals / Development Map / Future Simulation / Integration Mesh（Webhookトークン発行）
- feat: Webhook受信基盤 `POST /api/webhooks/{connector}?token=` — webhook_logs → external_events → company