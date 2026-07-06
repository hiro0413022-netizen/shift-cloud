# CHANGELOG

## 2026-07-06
- db: `0014_revoke_member_kpis_execute.sql` **適用済** — refresh_member_kpisのEXECUTEをanon/authenticatedから剥奪（Supabase advisor WARN対応、アプリはservice_role経由のため影響なし）
- db: `0015_agent_roster_vision.sql` **適用済** — VISION §4準拠でai_agentsに顧客AI（退会リスク）と投資・新規事業AI（出店判断）を追加（計21体）、KALLINOS AIの役割を「ブランド統括」に明確化（NEXT_TASKS 0-c）
- fix(docs): マウント同期切断で失われたNEXT_TASKS item4-6とCHANGELOG末尾をgit履歴から復元。切断されていたworktree5ファイルもHEADから復元
- fix(genesis): /finance明細行の不正なHTML入れ子（span内form）を修正 — hydrationクラッシュ（Application error: client-side exception）の原因
- feat(genesis): Vault（システム台帳）新設 `/vault`（DECISIONS #26） — 全関連システムのURL・ログインID・パスワードを一元管理。view_hqログイン＋Vaultパスワードの二重ゲート（sha256照合・8時間cookie、`VAULT_PASSWORD` envで変更可）、パスワード目隠し表示＋ワンクリックコピー、カテゴリ別グルーピング、追加/編集/論理削除フォーム、監査ログ（vault.unlock/create/update/delete）。サイドバーに「Vault」追加
- db: `0013_vault.sql` **適用済**（MCP経由） — vault_systems（RLS有効・ポリシーなし=service_role専用）。初期データ8件投入済み（Genesis本番/Shift Cloud本番/Supabase/Vercel/GitHub/お名前レンタルサーバー/お名前Navi/Gmail。URLとIDのみ、パスワードはユーザーがページから入力）
- feat(genesis): 体験受付システム（member-os / DECISIONS #23,#24）を新設 — 紙+Excel運用を廃止。スタッフ画面 `/members`（体験予約の登録・当日一覧・来店/キャンセル/無断欠のステータス更新・入会可否/見送り理由・タブレット受付URL発行）＋お客様タブレット自己入力の公開ルート `/intake/[token]`（個人情報＋アンケート＋同意＋指サイン、トークン#12方式・service_role経由）。体験予約数・入会率は自動集計。サイドバーに「体験受付」追加、middlewareに /intake を公開許可
- db: `0011_member_trial.sql` **適用済（2026-07-06、本番qrgpblnnhdudigarrtuz、スモークテスト検証済）** — mbr_guests / mbr_trial_bookings / mbr_intake_tokens（RLS＋トリガー標準準拠）＋ `refresh_member_kpis()`（体験予約数=当月非キャンセル件数、入会率=入会÷来店）。0010の手動KPIを自動化。Command Centerの日次更新は既に refresh_member_kpis を耐性呼び出し済のため0011適用で自動有効化
- docs: member-os 設計（docs/modules/member-os/TRIAL_INTAKE.md）＋ Smart Hello実サンプル分析（SMART_HELLO_IMPORT.md）。VISION.md/DECISIONS #22-#24/NEXT_TASKS 更新
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
