# NEXT_TASKS

> **2026-07-14 実データ照合済み**（Vercel Deployments / Supabase / リポジトリを1件ずつ確認）。
> 「未デプロイ」等の古い記載を全面的に更新。完了分は §完了ログ に移動。

---

## A. ユーザー作業（これがブロッカー）

A-1. **小川うららのアカウント発行** — DB上 `staff.auth_user_id` が null ＝**未発行**（ロール「役員（本部閲覧）」は付与済み）
   - Shift Cloud管理画面 → スタッフ → 小川うらら編集 → 初期パスワード（8文字以上）設定 → 保存
   - 発行後: GENESIS(/manual・/library)を触ってもらう。共有パック docs/genesis/ONBOARDING_EXEC.md

A-2. **コーチへ `use_lesson` 権限を付与** — この権限を持つロールがDB上に**1つも存在しない**＝Lesson OSはまだ古川さんしか使えない
   - Shift Cloud → ロール（役員ロールと同様に新ロール or 既存ロールに権限追加）

A-3. **Reserve OS の通しテスト** — `res_requests` **0件**＝一度も申込が通っていない
   - https://shift-cloud-reserve-os.vercel.app/reserve/shaft-fitting で申込 → GOLF WING宛に通知メール到達 → /login（use_reception|view_hq）→ /requests で確定メール送信 まで
   - Resend（APIキー・送信ドメイン認証）と env（RESERVE_FROM_EMAIL / RESERVE_STAFF_EMAIL / NEXT_PUBLIC_SITE_URL）が効いているかもここで判明する
   - 通ったら 公式LINEのリッチメニュー/トークに `/reserve/shaft-fitting` を掲出

A-4. **LINE公式アカウント Phase 0** — Vaultに LINE の行なし＝未着手。以降のPhase A〜Dが全部これ待ち
   - Messaging API を有効化 → channel secret / 長期アクセストークンを発行（OPERATIONS §6 Phase 0）→ Claudeに連絡

A-5. **営業利益の目標値** — 5大KPIのうち営業利益だけ target が未設定（会員数/入会率/退会率/月次売上は設定済）

A-6. **Lesson OS 実機確認**（生徒1件・動画1件のみ＝ほぼ未使用）— スマホで 生徒登録→撮影→描画→進捗→共有リンク(/s/) をLINEで自分に送って確認

A-7. **AI DEMO SALES のenv設定（Vercel: demo-sales）** — 新アプリのデプロイに必要（#54）
   - Vercelプロジェクト `demo-sales`（Root=apps/demo-sales）に env 3つ: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY（他アプリと同値）＋ NEXT_PUBLIC_SITE_URL（デモURL用・デプロイ後の本番URL）
   - 権限 `use_demo_sales` を営業担当ロールへ付与（view_hqの古川さんはそのまま入れる）

## B. 明日の朝に判定すること

B-1. **日次レポートの自動生成** — 停止の主因は cron が middleware で307されていたこと（DECISIONS #52）。修正 `82b3f5d` は本番反映済み。
   - 判定: 7/15 6:00 JST 後に `reports` へ当日の行が入るか。入らなければ CRON_SECRET / ANTHROPIC_API_KEY を疑う

## C. Claude作業（未着手）

C-0. ~~【#61の配線】自律実行 executor~~ **✅ 実装済み（#62 / migration 0062）**: `lib/ai-execution.ts`（enqueue/runDue/cancel/approve＋ハンドラ登録）・`ai_action_queue`・`/api/cron/execute`(10分)・`/executions` UI。(a)モード解決・(b)auto/auto_undo/approval実行・audit_logs記録・(c)取消/承認UI・(d)は下記で継続。
   - **残: (a′) 生成側の配線** — 各AI（提案生成 `suggestions.ts`・成果物 `agent-runner.ts`・スタッフ連絡 `staff-notice.ts` 等）から `enqueueAction()` を呼び、実運用で自動発火させる。今は器はあるが自動では何も enqueue されない（テストは /executions の「テスト実行」ボタン）。
   - **残: (d) `prod_deploy`** を Vercel MCP に接続（承認後にClaudeがデプロイ）。
   - 動作確認: /executions →「テスト実行を入れる」→2分後に自動実行 or その場で「取消」。「今すぐキューを回す」で即tick。
C-1. **RUNBOOK未作成**: money-golfwing / survey-os / reserve-os / caddy-os → 作成後 public/manual.md へコピーし /manual 配信（既存: genesis / shift-cloud / member-os / legal-os / lesson-os）

C-2. **Lesson OS 後続**: P2b＝GOLF WING Finder連携（コメントに診断ナレッジ）・会員名簿突合・KPI接続 / P3＝Trackman CSV取込・レッスンAI
   - 確認事項（ユーザー）: WING NOTEに過去データのエクスポート機能があるか（あれば移行、なければ新規蓄積）

C-3. **SaaS化（正典 docs/genesis/SAAS_PLAN.md）**: Phase S0＝FRUNK GOLF姫路を2店舗目テナントとして発行（ウィザードの要件出し） / AI設定コンシェルジュ試作（/concierge） / **リポジトリPrivate化が販売の前提**

C-4. **Money OS**: 経費自動起票（OCR精度の実績待ち。`mon_receipts` は0件＝運用未開始）／mon_expense・mon_bank_txn との突合UI強化

C-5. **スタッフポータル後続（STAFF_PORTAL.md §5）**: 店長タスク配信 / Genesis判断リスト→sp_tasks自動配信 / 日報週報のCEO AI要約流入 / 予約ソース実接続（`sp_reports` 0件＝運用これから）

C-6. **Survey OS フェーズ3**: 条件分岐 / KPI接続（回答率・満足度）/ n8n連携（GOLF WINGアンケートは公開中・回答2件）

C-7. **モバイル対応**: 実機で崩れが残る画面の個別調整（ユーザーからの報告ベース）

C-8. **掃除（軽微）**
   - マイグレーション番号重複（0024が legal_os / reservation_payments の2本）→ いずれか0046+へリネーム
   - GolfOrder切替儀式: D1差分同期 → 切替宣言 → 旧Pages `golfwing` 停止 → import関数削除
   - Cloudflareで旧Pagesのカスタムドメイン解除（`yozan-group`／`kallinos`）※`golfwing`は本番稼働中なので触らない
   - Member OS 通しテスト（予約→タブレット受付→/intake自己入力→入会）

C-10. **AI DEMO SALES 後続（#54・正典 docs/modules/demo-sales/SYSTEM.md §6）**
   - 残り12件の営業先の現サイト分析＋スコア＋デモ生成（サンプル1件=福本クリニックの型を踏襲）
   - 営業指示（directive）の処理をセッション開始時の定型に組込み / 現サイト自動分析のcron化（#40の1件/日方式）
   - 成約率KPI画面・dms_plans管理画面（データが貯まってから）

C-9. **Shift Cloud 実運用フィードバック**の収集と改善バックログ化

---

## 完了ログ（2026-07-14 照合で確認）

- ✅ push（LSN P2 / GN役員展開 / SP / FIX / MB）: `82b3f5d`・`634dbf0` で本番反映。genesis・lesson-os とも READY
- ✅ **Survey OS デプロイ済**: https://survey-os-mu.vercel.app（`golfwing-2026` 公開中・回答2件・Vault登録済）
- ✅ **Reserve OS デプロイ済**: https://shift-cloud-reserve-os.vercel.app（Vault登録済。申込0件＝A-3へ）
- ✅ **Lesson OS 本番**: https://lesson-os.vercel.app（0041〜0044適用済・P2実装済）
- ✅ **資料室に13件投入済**（Storage `library`）
- ✅ **財務データ投入済**: `fin_entries` 133件 → 月次売上・営業利益KPIが接続
- ✅ **5大KPI目標値**: 会員数250 / 入会率50 / 退会率2.5 / 月次売上600万（営業利益のみA-5）
- ✅ **migration 0045まで全て適用済**（0044 lesson_os_phases / 0045 inbox_filter_suggestions_directives）
- ✅ Storage上限200MB・CRON_SECRET: ユーザー設定済み（実効性はB-1で最終判定）
- ✅ 基盤アップグレード（2026-07-11）: packages/core移行・RUNBOOK・時給の月中変更（日付按分 #39）・KPIチェッカー・CI
- ✅ Legal OS 本番稼働 + legal_ai 日次チェック（#40）／Money OS `mon_receipts` フェーズ1＋OCR（#41,#42）／Caddy OS（#46）／社内連絡 /notes（0040）
