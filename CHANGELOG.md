# CHANGELOG

## 2026-07-06
- feat(genesis): CEO AIに頭脳を接続（VISION §1/§3/§8） — lib/ceo-ai.ts新設。Claude APIで実データ（KPI/リスク/ブロッカー/イベント/開発状況）を分析し「今何が起きているか」「何をすれば売上が上がるか」「誰に何を指示すべきか」を生成。指示案はAI社員宛てプロンプト下書きとして自動保存＋対象AIをworking状態に。実行ログをai_execution_logsに記録。APIキー未設定時はルールベースに自動フォールバック
- feat(genesis): 毎朝6時(JST)の自動報告 — Vercel Cron（vercel.json + /api/cron/daily、CRON_SECRET認証）。ボタンを押さなくてもCEO AIの朝報告がCommand Centerに届く
- db: `0012_agent_duties.sql` 適用 — AI社員19体すべてに「見る・判断・実行」を定義（VISION §4「並べるだけにしない」）。Agentsページに表示。DECISIONS #25
- feat(genesis): VISION準拠のCEO AI連携強化（正典: docs/genesis/VISION.md） — YOZAN全体スコア（100点減点方式・説明可能なルールベース）、「今日、古川さんが判断すべきこと」自動生成（承認/ブロッカー/高リスク/KPI未達・未接続から）。Cockpitトップにスコア＋判断リスト、日次レポートをVISION §3の型（スコア/判断/危険/KPI）に刷新
- db: `0010_vision_kpis.sql` 適用 — 5大KPIの器を完備（体験予約数/入会率/退会率/人件費率を追加）。人件費率は財務実績（人件費÷売上）から自動算出。refresh_finance_kpis拡張
- feat(genesis): KPI手動更新フォーム（Command Center） — 会員数・体験予約等をCRM/予約接続まで手動運用、目標値設定でCEO AIが未達検知。AI指示プロンプトの背景にVISION.md（North Star逆算）を明記、禁止事項をVISION §7の線引きに準拠
- feat(genesis): 財務管理モジュール新設（/finance） — 事業別月次PL（5事業×10科目）、月切替、手入力（upsert）、CSV取込（年月,事業,科目,金額,メモ）、Shift Cloud人件費概算の取込、売上/費用/営業利益サマリ＋12ヶ月スパークライン
- db: `0009_finance.sql` 適用 — fin_segments / fin_categories / fin_entries（RLS＋トリガー標準準拠）、`refresh_finance_kpis()`（monthly_sales接続＋operating_profit KPI新設）、financeモジュール登録（live）。DECISIONS #21
- feat(genesis): KPI更新・日次レポートが労務＋財務の両方を再集計するよう統合。CockpitリングにFinanceノード（旧: 経理プレースホルダ）、サイドバーにFinance追加、KPIバンドを財務系優先の並びに変更
- fix(docs): DECISIONS.mdの破損行を修復（#14をCHANGELOGから復元、#15は前半欠損として明示、番号順に整列）

## 2026-07-05
- feat(genesis): UI全面モーション強化（SF管制室風） — 背景グリッド＋上部グロー、Cockpitリングにレーダースキャン/回転軌道リング/中央→ノードのデータフロー接続線/ノード時差エントランス、HUDパネル（四隅ブラケット＋ホバーグロー）、KPIカウントアップ＋SVGスパークライン（新規: components/count-up.tsx、ui.tsxにSparkline/KpiCard追加）、CockpitにKPIバンド新設、サイドバー稼働インジケータ＋アクティブ発光、prefers-reduced-motion対応
- db: `0008_kpi_real_data.sql` 適用 — `refresh_shift_cloud_kpis()` 関数を追加。Shift Cloud実データから労務系KPIを自動集計（在籍スタッフ数 / 総労働時間 / 人件費=payroll_items実績＋未確定月は勤怠×時給の概算）。trendも月次/日次で自動蓄積
- feat(genesis): KPI実データ接続 — Command Centerに「KPI更新」ボタン追加、日次レポート冒頭にKPIセクション追加、レポート生成時にKPIを自動再集計。Future SimulationのKPI説明を実データ準拠に更新
- fix: 前回セッション中断によるgit破損（index / multi-pack-index / lockファイル）を修復。切断されていた DECISIONS.md / package.json をHEADから復元、NEXT_TASKS.mdを再作成

## 2026-07-04
- feat: golfwing移行P3/P4前半完了 — Vercel `shift-cloud-golfwing` でSupabase版GolfOrderが本番稼働・全ページ検証合格。修正: esbuild単一バンドル化 / 名前付きメソッドexport / 認証トークン形式 / DB接続文字列自動補正 / GROUP BY 11クエリ / 日付文字列化。デバッグ用edge function無効化済み
- feat: golfwing移行P3 — D1互換Postgresアダプタ(src/lib/pgdb.ts)・Vercelエントリ(api/index.ts)・Supabase Auth化(auth.ts)・migration 0008(tenant_id互換列)。ルートコード8,500行は無修正で移行。tsc全緑
- db: golfwing移行P2完了 — D1(golfwing-production)の全業務データ2,079行をgolfwingスキーマへ投入（Edge Function `golfwing-import` 経由、デモ除外・件数検証済み）
- db: `0007_golfwing_schema.sql` 適用 — golfwingスキーマ（suppliers/supplier_rules/products/product_suppliers/purchase_orders/purchase_order_items/receipts/receipt_items + RLS + v_monthly_purchase_cost）。DECISIONS #19/#20
- ops: yozan-genesisのVercel Function Regionをiad1→hnd1(東京)に変更し再デプロイ（Supabase東京との往復短縮）
- docs: GolfOrder Supabase移行設計書を作成（docs/genesis/GOLFWING_SUPABASE_MIGRATION.md、方式B=DB先行移行を推奨）
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