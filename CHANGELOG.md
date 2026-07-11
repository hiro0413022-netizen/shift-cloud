# CHANGELOG

## 2026-07-11(6) — 経理AIフェーズ1: 証憑OCR自動読取（DECISIONS #42）
- **feat(genesis): receipt-ai.ts新設・日次cronに組込** — /receiptsに撮って置いた証憑を毎朝最大3件、Claude APIが読取り。発行日・金額・発行元・種別の**空欄だけ**を補完（人の入力は上書きしない）。読取ダイジェストはocr_textに保存され/receiptsの行で確認可能。ANTHROPIC_API_KEY未設定なら完全スキップ
- 運用イメージ: **現場は撮って登録するだけ → 翌朝には日付・金額・店名が埋まっている → 人は確認と突合だけ**。mon_expenseへの自動起票は読取精度の実績を見てフェーズ2で
- 検証: genesis tsc＋next build green（Linux実機）

## 2026-07-11(5) — Phase 1続行: Legal OSフェーズ2（legal_ai）＋Money OS証憑（mon_receipts）
- **feat(genesis): Legal OS日次チェック（DECISIONS #40a）** — legal-checks.ts新設。解約判断期日90日以内（超過含む）/契約満了60日以内/高リスク契約/AI提案の確認待ち14日滞留 を毎朝「今日、古川さんが判断すべきこと」へ。Claude API不要
- **feat(genesis): legal_ai契約書自動抽出（DECISIONS #40b）** — legal-ai.ts新設、日次cronに組込。未抽出の契約書を1件/日、Storage上のPDF/画像をClaude APIで読み、相手方・契約期間・自動更新・解約通知日数・リスク・要点を抽出→**提案として保存**（人の入力は上書きしない、status=under_review、確定は人）。next_action_date自動計算＋リマインダー自動生成。ANTHROPIC_API_KEY未設定時は完全スキップ
- **feat(money-golfwing): 証憑保管 /receipts（DECISIONS #41・#29a）** — db: `0034_mon_receipts.sql` **適用済（本番qrgpblnnhdudigarrtuz、MCP経由）**＝mon_receipts＋プライベートバケットmon-receipts。画面=アップロード（画像/PDF、8MBまで）・月/種別フィルタ一覧・行を開いてメタ編集/突合状態変更・署名付きURL閲覧・論理削除。ナビに「証憑」追加。レシート撮影→OCR→経費自動起票は経理AIフェーズ（後続）
- 検証: genesis / money-golfwing の tsc＋next build をLinux実機でgreen確認
- **ユーザー作業**: push（CI green確認）のみ。抽出AIを動かすには yozan-genesis の `ANTHROPIC_API_KEY`（NEXT_TASKS 00で設定済みならそのまま動く）

## 2026-07-11(4) — UP-3/UP-4: 現場RUNBOOK＋時給の月中変更対応
- **feat(shift-cloud): 時給の月中変更を日付按分（DECISIONS #39・監査D-3）** — `calcMonthlyPayroll`/`wageOnDate` を payroll-calc.ts に追加し buildPayroll を置換。日ごとに有効な時給・交通費で計算し、レート別内訳を `payroll_items.detail.wage_periods`（from/to日付つき）へ保存。賃金開始日前の勤務日は最古の賃金へフォールバック（0円事故防止）。**単一時給は従来と完全一致**（equivalenceテストで固定）。テスト5件追加（計26件・全pass）、shift-cloudのtsc+buildをLinux実機で検証済
- **docs(RUNBOOK): 現場向け手順書3本を新設** — `docs/modules/member-os/RUNBOOK.md`（受付タブレットの朝の準備〜入会処理〜Excel出力）、`docs/modules/workforce-os/RUNBOOK.md`（iPad打刻・打刻修正・休憩上書き・打刻端末メモ・月末前チェック）、`docs/modules/legal-os/RUNBOOK.md`（契約書登録・経理系との切り分け・期限管理）。PCに不慣れな人向け・困ったとき表つき

## 2026-07-11(3) — UP-2: 既存4アプリを @yozan/core へ移行（NEXT_TASKS UP-2、古川さん承認済）
- **refactor(survey-os/reserve-os/member-os/legal-os): 共通コードをpackages/coreへ集約** — 各アプリの supabase/admin・supabase/server・kernel を薄い再export化、auth を `createActorResolver` ラッパー化（survey/reserve/member。既存のexport名・挙動は不変）。legal-os の auth はカスタムロール解決（leg_grants）のため据え置き。middleware は `createAuthMiddleware` 化
- **fix(core/template): middlewareのmatcherはリテラル必須** — Next.jsがconfigを静的解析するため `AUTH_MIDDLEWARE_MATCHER` のimport参照はビルドエラー。4アプリ・templates/app-template ともインラインリテラルへ（テンプレートの潜在バグをCI前に検出）
- **fix(core): kernel logEventの入力型を全アプリの上位互換に拡張**（amount/related_*/ai_summary等のオプション項目）
- 検証: 4アプリの `tsc --noEmit`＋`next build` をLinux実機で全green確認。lockに@yozan/core依存4件追記
- 注意（push後）: **member-os / legal-os は本番稼働中** → Vercelデプロイが成功したか要確認（失敗時は直前コミットへRedeployで戻せる）

## 2026-07-11(2) — CI red修正（初回run #1の全build失敗に対応）
- **fix: 壊れたpackage-lock.jsonを再生成** — 初回コミットのlockは一部エントリがメタデータ欠落（enhanced-resolve等が`{"dev":true}`のみ）＋lightningcssのLinuxバイナリ全欠落 → CIの`next build`が「Cannot find module 'enhanced-resolve'」で全滅。サンドボックス（Linux/npm 10.9.8）で`--package-lock-only`再生成（全770エントリにversion/resolved/integrity、全プラットフォームバイナリ収録）。corporate buildがgreenになることを実機検証済
- **fix(legal-os/reserve-os/money-golfwing/member-os): auth.tsのSupabaseネスト型キャスト** — `staff as {...}`直接キャストが新しい型推論（rolesが配列推論）でTS2352 → survey-osと同じ`as unknown as`方式に統一（挙動変更なし）。4アプリの`tsc --noEmit`をLinux実機で検証済
- **fix(reserve-os): 詳細ページのJSX条件で`unknown`型をそのまま使用** — `r.confirmed_at &&`/`r.phone &&`がTS2322（ReactNode非互換）→ `!!`でboolean化
- 教訓: **CIは初回から信じられる基準になった**（未デプロイアプリの潜在型エラー2種をVercelより先に検出）

## 2026-07-11 — 基盤アップグレード（Phase 0監査 → B-1〜B-5実装。監査全文: docs/genesis/AUDIT_2026-07-11.md）
- **fix(shift-cloud): 給与計算の月末日バグ（監査D-1）** — buildPayrollの期間上限が `-31` 固定で、31日が無い月（6月・9月等）はPostgresのdate型エラーで勤怠0件扱い→給与計算失敗の恐れ。`monthRange()`（実在する月末日を算出）へ置換。あわせて丸め×残業の相互作用で通常分が負になり得るケースをガード（D-2）
- **feat(tests): 金額ロジックの回帰テスト新設（DECISIONS #36）** — `tests/` に21テスト（給与計算 payroll-calc / 自動休憩 / 銀行CSV取込 bankCsv / 科目推測 categorize / 月会費予測SQLの単価表固定）。純粋ロジックを `apps/shift-cloud/src/lib/payroll-calc.ts`・`apps/money-golfwing/src/lib/money-util.ts` に抽出（既存importは再exportで互換維持）。実行は `npm test`（node --test、依存インストール不要）。**21/21 pass検証済**
- **feat(genesis): KPI整合性チェッカー（DECISIONS #37）** — `src/lib/kpi-checks.ts` 新設、日次cron（runDailyCeoReport）に組込。完了月の経費0円（例:「6月のゴルフ経費が未入力です。利益が過大に見えています」）／forecast残存／売上前月比±50%超／KPI目標未設定 を検知し「今日、古川さんが判断すべきこと」の先頭に表示
- **feat(ci): GitHub Actions CI新設** — push/PRごとに (1) `npm test` (2) 全Nextアプリ8本のmatrixで `tsc --noEmit`＋`next build`（ダミーenv、実キー不使用 #14）。ローカルtscが信頼できない問題（メモリ記録済）の恒久解
- **feat(scaffold): アプリ量産の型を固定化（DECISIONS #35、#10の履行）** — `packages/core`（@yozan/core: auth/kernel/supabase/middleware、TSソース提供+transpilePackages）、`templates/app-template`（ログイン・認可・/api/v1・ログアウト完備の雛形）、`scripts/new-app.mjs`（`npm run new-app -- --name xxx-os --prefix xxx ...` で生成、動作検証済）。root package.jsonのworkspacesに `packages/*` 追加
- **docs**: OPERATIONS §7「新アプリ デプロイ定型チェックリスト」・§8「権限の付与手順」新設／ARCHITECTURE.mdを実態（11アプリ・独立アプリ方式・packages/core・sales-support-saasは別物）に全面書き直し／MODULE_TEMPLATE §4をscaffold手順に更新／supabase/migrations/README.md（採番台帳、重複6ペア凍結、次番号0034〜 #38）／DECISIONS #28・#29の重複採番に【a】【b】注記＋#35〜#38追記
- **ユーザー作業（次回push時）**: ルートで `npm install` → package-lock.json をコミット（workspaces変更のため。CI/Vercelの再現性向上）→ push → GitHub ActionsのCI結果を確認

## 2026-07-10（続き）
- feat(shift-cloud): **休憩の自動計算**を勤怠実績に追加（給与計算に反映）。労基法準拠の段階式＝労働6時間超→45分／8時間超→60分（9時間勤務なら1時間休憩）。休憩の決定順位は「手動上書き＞休憩打刻＞段階式自動」。`src/lib/attendance.ts` に `autoBreakMinutes()` と再計算ロジックを実装。従来は休憩打刻が無いと休憩0＝9時間がそのまま計上されていた問題を解消。
- feat(shift-cloud): **休憩をあとから修正**可能に。勤怠の修正フォームに「休憩（分）」入力と「自動計算に戻す」チェックを追加。`attendance_days.break_override_minutes`（null=自動）で保持し、`correctAttendance` から設定/解除。勤怠一覧に「手動／自動」表示。DB: migration `0033_attendance_break_override.sql`（**本番qrgpblnnhdudigarrtuz適用済**）。

## 2026-07-10
- fix(shift-cloud): シフトビルダーで**保存/確定の結果がリロードしないと反映されない**問題を修正。`grid` を初回マウント時のみ初期化していたため、サーバー側更新（ドラフト保存の再検証・確定後の緑表示・他者編集）が画面に流れ込まなかった。`shifts` prop の変化を検知して `grid` へ同期する useEffect を追加（未保存=dirty のセルは保持）。
- fix(shift-cloud): 募集期間まわりの整理。(1)**削除機能を追加**（`deletePeriod` ソフト削除＝期間＋紐づく提出希望をまとめて論理削除、確認ダイアログ付き `delete-period-button.tsx`）。(2)管理ビルダーの期間一覧を**店舗で絞り込み**（`store_id=当該店舗 or null` のみ表示。従来は他店舗の期間まで月内全件を表示し希望集約が混線）。期間カードに「この店舗/全店舗」バッジと🗑削除を追加。(3)スタッフ側 `requests/page.tsx` は重複時に**店舗個別の募集を全店舗共通より優先**（取り違え防止）。(4)データ整理: 不要な全店舗向け 8/1-31（希望0件）を論理削除。※GOLF WING宝塚 8/1-15（締切済み・希望13件）は温存

## 2026-07-09
- feat(reserve-os): ビジター向け**申込型予約**アプリを新設（DECISIONS #34、独立アプリ `apps/reserve-os`・別Vercel想定・ポート3004・DB共有）。第一弾=GOLF WING シャフトフィッティング。既存 res_bookings（姫路=即時枠予約）と別概念で、**候補日時3つ（必須）＋事前ヒアリング → スタッフが目視で確定**するモデル。公開 `/reserve/[slug]`（スマホ最適・白×緑×金の高級感、①FTとは②メニュー料金③流れ④ヒアリングフォーム⑤注意事項⑥FAQ⑦完了）。スタッフ `/`（一覧・確認待ち優先・タブ・CSV）／`/requests/[id]`（候補から確定・確定メール送信・見送り/完了・社内メモ・電話/メール返信）。member-os規約準拠（型・規約合わせ済、next build はユーザーPC/Vercelで実行）
- db: `0032_reserve_os.sql` **適用済（本番qrgpblnnhdudigarrtuz、MCP name=reserve_os）** — res_services（サービスカタログ＝メニュー/料金/導入文、slug・category・active）／res_requests（申込＝お客様情報・pref1-3_at・ヒアリング各項目・intake jsonb・status・confirmed_at・notified_at/ack_sent_at）。RLSテナント分離・updated_atトリガー・論理削除。GOLF WINGシャフトFT（slug=`shaft-fitting`）をseed。既存テーブル変更なし・追加のみ（※0031はSurvey seedが先取りのため0032にリネーム）
- feat(mail): 汎用メール送信レイヤ `src/lib/mail.ts`（Resend・fetch直叩き）。申込→**YOZANアドレスからGOLF WINGへ通知**（reply_to=お客様、スタッフは返信でお客様に届く）＋お客様へ受付確認＋確定連絡。API未設定でも申込は成功。LINE通知は `notifyLine()` フックのみ（n8n整備後・DECISIONS #29）
- ops: vault_systems に「Reserve OS（予約OS）」行を追加（URLはVercel作成後に更新）。正典 docs/modules/reserve-os/SYSTEM.md
- ops: 残作業＝ユーザーが (1)`npm install` → push (2)Vercel新規プロジェクト `reserve-os`（Root=apps/reserve-os、env: Supabase3つ＋RESEND_API_KEY/RESERVE_FROM_EMAIL/RESERVE_STAFF_EMAIL/NEXT_PUBLIC_SITE_URL）→ Deploy (3)Resend APIキー発行＋GOLF WINGメールアドレス設定 (4)公式LINEに `/reserve/shaft-fitting` を掲出 (5)vault URL更新
- feat(survey-os): アンケート/情報収集システムを新設（DECISIONS #33、独立アプリ `apps/survey-os`・別Vercel想定・ポート3003・DB共有）。Googleフォーム不可の要件に対応 — 単一/複数（その他自由記述）/短文/自由記述/**順位付け(ドラッグ&ドロップ＋▲▼)**/スケール。順位付けは `multi(is_ranking_source)` → `ranking(source_code)` 連動で**受講経験のあるコーチのみ**を並び替え対象にできる。公開回答は匿名・トークンレス（slug + status='open' 検証で service_role 書込）、管理は `view_hq`/`use_survey`。画面＝一覧（公開URL＋QR自動生成・回答数・集計/CSV導線）、集計 `/[surveyId]/results`（**コーチ総合ランキング・強み弱みヒートマップ・設問別内訳・自由記述一覧**）、CSV `/api/export/[id]?type=wide|coach`。回答10件ごとに company_events 記録。member-os規約準拠で実装（型・規約合わせ済、next build はユーザーPC/Vercelで実行）
- db: `0030_survey_os.sql` **適用済（本番qrgpblnnhdudigarrtuz、MCP経由）** — svy_surveys / svy_questions / svy_answers / svy_responses（RLSテナント分離・updated_atトリガー・論理削除、既存標準準拠）。汎用jsonbスキーマ（options/config/value）。既存テーブル変更なし・追加のみ
- db: `0031_survey_golfwing_seed.sql` **投入済（execute_sql、冪等ファイルはGit-as-truth用）** — GOLF WING会員アンケート（slug=`golfwing-2026`・全26問・匿名・公開中）。コーチ評価13順位（対象: 古川博庸/井殿康和/榎本剛志/安東茉優/春馬凡夫、小川うらら除外）＋WING NOTE＋イベント/ご意見。集計はボルダ平均(0-100)＋平均順位の両方
- ops: vault_systems に「Survey OS（アンケート）」行を追加（URLはVercel作成後に記入）。OPERATIONS §2 に survey-os 初回セットアップ手順を追記。正典 docs/modules/survey-os/SYSTEM.md
- ops: 残作業＝`npm install`（qrcode追加）→ push → Vercel新規プロジェクト `survey-os`（Root=apps/survey-os、env3つ）→ Deploy → vault URL記入。アンケートビルダー（項目編集GUI）はフェーズ2
- feat(survey-os): アンケートビルダー（項目編集画面）を追加 `/[surveyId]/edit`。設問の**追加/編集/削除(論理)/▲▼並び替え**、型変更(6種)、選択肢編集（内部value自動採番で既存回答を保護）、複数選択の「その他許可」「順位母集団」フラグ、順位付けのpool＋連動設問(source_code)設定、アンケート設定（タイトル/slug/公開状態/匿名/冒頭・お礼文/想定時間）。一覧に「＋新規アンケート」、一覧・集計から編集導線。edit/actions.ts（updateSurvey/saveQuestion/deleteQuestion/moveQuestion/createSurvey、requireSurveyActor＋company_id検証＋audit_logs）。SYSTEM.md §6に反映
- fix(survey-os): Vercelビルド失敗を修正（`auth.ts` の staff_roles(roles(permissions)) ネスト取得でSupabase型推論に依存し型エラー）。取得結果を自前の型に `as unknown as` で確定させる方式へ変更。あわせて設問マッピングの `type` 代入を `as QuestionType` で明示（s/[slug]/page.tsx・lib/results.ts）

## 2026-07-07
- feat(legal-os): 契約書・証憑の保管と期限管理を新設。**経理系（請求書・領収書＝Money OS `mon_receipts`）と法務系（契約書・覚書・規約・NDA）を分離**し、法務系を独立アプリ化。「GENESIS＝古川さん専用の司令室」を守るため、他者がアップロードする面はGENESIS外へ（DECISIONS #15/#27の勝ちパターン）。設計正典 docs/modules/legal-os/SYSTEM.md
- db: `0024_legal_os.sql` **適用済（本番qrgpblnnhdudigarrtuz、MCP経由）** — leg_documents（種別/相手方/契約期間/自動更新/解約通知日数/next_action_date=解約判断期日/リスク/要点）、leg_files（証憑ファイル・Storage参照・OCR text）、leg_reminders（更新/解約通知/満了の期日アラート）、leg_grants（uploader/manager/viewer、全社=segment_id null）。Storageプライベートバケット `legal-docs`（company_id先頭パスでobject RLS）。RLSは既存標準app.current_company_id()。moduleコード `legal`（designing）。担当AI=legal_ai（登録済）。既存テーブル変更なし・追加のみ
- feat(legal-os): 独立アプリ `apps/legal-os`（Next.js、別Vercel想定・ポート3004）を実装。認証は同一Supabase Auth＋ロール解決（view_hq/manage_legal_all=manager、leg_grants、use_legal=uploader）。画面＝ダッシュボード（期限90日以内/自動更新/高リスク/件数）・契約一覧（種別/状態/検索フィルタ）・登録（メタ＋ファイルアップロード→Storage→leg_files、next_action_date算出＋リマインダー自動生成）・詳細（情報/要点/リマインダー/ファイル署名URL閲覧/ステータス変更）。`/api/v1/documents`（Bearerトークン、legal_ai・CEO AI・バッチ用のGET一覧/POST登録）。company_events(`legal.document_registered`)・audit_logs記録。next build 検証済（全9ルート・型チェック通過）
- ops: Legal OSは締結・更新・解約の正式承認をGENESIS側approval_requestsで古川さんが実施（入力面はGENESISに持たせない）。残作業＝Vercel新規プロジェクト作成＋env設定＋vault_systems登録＋module live化

## 2026-07-06
- feat(member-os): 予約システム Phase F（DECISIONS #24, 姫路FRUNK GOLF）。migration 0020適用（FRUNK GOLF 姫路 店舗＋打席6・パーソナルレッスン1、res_resources/res_bookings/res_tokens、営業時間からの枠生成、同枠ダブルブッキング防止のunique index）。member-osに `/reservations`（スタッフ: 空き状況グリッド・電話/店頭予約入力・来店/取消/削除・会員/都度・課金・Web予約URL発行）と公開 `/book/[token]`（お客様Web予約: 日付選択→空き枠選択→氏名/連絡先/会員番号/人数→予約確定→確認画面）。middlewareに /book 公開許可、TopBarに導線。next build 検証済。会員数KPIは会員名簿集計で229・退会率3.5%を反映済
- feat(member-os): Smart Hello取込 Phase E（DECISIONS #22）。migration 0019適用（mbr_members スナップショット＋mbr_reservations、refresh_smart_hello_kpis＝在籍会員数・退会率。口座/カード等の機微列は非取込）。member-osに `/import` 追加＝会員名簿/予約一覧のExcelをアップロード→exceljsでパース→会員は全件洗い替え・予約は予約番号でupsert→KPI自動更新。TopBarに導線。合成データでKPI関数を検証（在籍・退会率）。会員244/予約2,189の実データは /import から取込む運用（在籍219＝スタッフ15除く・退会予定10・休会11）
- feat(member-os): 一時利用者名簿 Phase C/D。C=Excel出力（/api/ledger-export、現行「一時利用顧客名簿」57列を1:1再現・期間/区分フィルタ、exceljs、台帳に⬇Excel出力ボタン、ヘッダ完全一致を検証）。D=既存2,281行の移行SQL生成（空134行除外・表記ゆれ正規化・区分/性別/支払の名寄せ・survey化）、2行で本番スキーマ検証通過。PIIのためリポジトリ非格納、SQL EditorでSupabase実行（walkin_import_1_guests.sql→2_visits.sql）
- feat(member-os): 一時利用者名簿へ再設計 Phase A/B（DECISIONS #28）。migration 0018適用（mbr_walkin_visits/mbr_walkin_tokens、mbr_guestsに職業/連絡方法/距離を追加、refresh_member_kpisを一時利用台帳ベースへ拡張＝体験→入会率）。member-osを予約起点から受付台帳へ刷新: トップ/=受付台帳（当月サマリ・区分別・スタッフ追記・手動登録・受付URL発行）、/reception/[token]=店頭常設タブレットの予約なし自己入力（利用区分5種・アンケート・同意・電子サイン）。旧/intake（予約起点）は撤去。両アプリ next build 検証済。Phase C(Excel出力)/D(既存2,415行移行)/E(Smart Hello取込)/F(姫路予約サイト)は後続
- feat(shift-cloud): シフト機能7点を拡張（GOLF WING現場フィードバック反映）。① **ドラフト自動保存** — builder.tsxで編集内容をlocalStorageに逐次退避＋15秒ごとにサーバ自動保存＋離脱前警告＋再訪時に未保存分を復元（「ドラフト保存しても消える」問題を解消）。② **任意時刻入力** — スタッフ提出フォーム・builder両方でテンプレ以外に「⌚時間指定」で○:○〜○:○を直接入力可（shift_requests.start_time/end_time、shifts.start_time/end_timeに保存）。③ **募集期間の柔軟化** — 月/前半(1-15)/後半(16-末)/任意期間を選択可（period_form.tsx、shift_request_periods.period_type/start_date/end_date/title）。1ヶ月に複数期間（前半・後半）併存可、スタッフ提出画面は期間の日付範囲で表示。④ **締切の取り消し** — 締切済み期間を「↩募集中に戻す」で再開（reopenPeriod）。⑤ **UI刷新** — builder/提出フォーム/打刻端末をグラデ見出し・角丸カード・ゼブラ行等で整理。⑥ **打刻端末メモ** — kioskに「連絡・打刻忘れの報告」（伝言/打刻押し忘れの2種＋自由入力）、管理画面 `/admin/kiosk-messages` で確認・対応済み管理（サイドバー追加、edit_attendance権限）。⑦ **紙シフト出力** — `/admin/shifts/print` で添付PDF準拠の横型グリッド（役職別グルーピング=コーチ/受付、日付列＋曜日、時間/休み/テンプレ名、備考行、A4横・週ごとブロック分割）を月/前半/後半で印刷。次月シフト作成ページに「🖨紙シフト出力」ボタン。tsc --noEmit 検証済（~/scbuild再構築、マウント同期不良のためVM側は要ユーザーPCビルド）
- db: `0016_shift_flex.sql` **適用済（本番qrgpblnnhdudigarrtuz、MCP経由）** — shift_request_periodsに period_type/start_date/end_date/title 追加（既存行は月範囲で補完）、shift_requestsに start_time/end_time 追加、kiosk_messages 新規（RLS自社select・書込はservice_role、kiosk_message_kind enum: missing_clock/message、resolved管理）
- feat(genesis): CEO AI秘書 / CEO Inbox 新設（`/inbox`） — 問い合わせを「確認・承認」する受信箱。想定種別＝システム作成依頼 / アパレル商品問い合わせ / 業者間取引 / その他 / ノイズ。カード表示（要約・種別・優先度バッジ・返信案編集テキストエリア・カレンダー案）、「承認して送信予約」「保留」。返信の外部送信は承認必須（VISION §7）→ status=approved を経てエンジンが送信。日程はカレンダー自動登録方針。lib/secretary.ts（getOpenInquiries/getInquiryStats/summarizeInquiriesForReport）、app/(main)/inbox（page.tsx＋actions.ts: approveInquiry/dismissInquiry/reclassifyInquiry、監査ログ inquiry.approve/dismiss/reclassify）。CEO AI日次レポートに「未対応の問い合わせ」節、Cockpit Command サマリに「未対応問い合わせ」件数（/inboxリンク）、サイドバーに「CEO Inbox」追加
- db: `0017_secretary_inbox.sql` **適用済（本番qrgpblnnhdudigarrtuz）** — sec_inquiries（RLS標準準拠・トリガー・部分ユニーク index で external_id 重複防止）。デモ2件投入（承認ループ確認用、system_request/b2b）
- ops: 秘書エンジンをスケジュールタスク `ceo-ai-secretary` として設定（毎日 9:00/13:00/18:00 JST）。Gmail定期取得→3種別分類→返信起案＋sec_inquiries登録（status=awaiting_approval）、承認済み(status=approved)の返信送信、日程のカレンダー自動登録。ハイブリッド構成（エンジン=Cowork接続のGmail/Calendar、状態=Supabase、確認承認UI=Genesis Cockpit）で、個人GmailのままGoogleアプリ審査を回避。※事業の問い合わせが接続メールに届く設定にするまでは新規0件
- refactor(member-os): 体験受付をGenesisから独立アプリ `apps/member-os` へ分離（DECISIONS #27、Shift Cloudと同型）。別Vercelプロジェクト（member-os）・別URL・別ログインで運用。トップ `/`＝受付ダッシュボード、`/intake/[token]`＝公開タブレット受付、`/login`＝スタッフ認証（use_reception または view_hq）。DBは同一Supabaseを共有し mbr_* と refresh_member_kpis 据え置き → 体験予約数・入会率KPIは従来どおりGenesisへ自動流入。Genesis側はサイドバー「体験受付」・ルート /members・/intake・未使用 lib/intake.ts を撤去（middlewareの/intake公開許可も削除）。両アプリ next build 検証済み
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
