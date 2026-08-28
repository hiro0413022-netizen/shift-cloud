# CHANGELOG

## 2026-08-28 — member-os: 一時利用者名簿Excelの日付と電話番号の書式
- change(member-os): Excel出力の**日付を `2026/08/28`（スラッシュ区切り）**に（DECISIONS #173）。対象は 日付・生年月日・再来の場合日付記入・再アプローチ(日付)×2 の5列。取込側の `cellDate` は "/" も受けるので、出した名簿はそのまま取り込み直せる
- change(member-os): Excel出力の**電話番号を `090-1234-5678` の形**に。数字だけ11桁・全角ハイフン・スペース区切り・`+81`始まり・ハイフン位置ちがいを整形する
- note: **メモ書き付き（「090-…（母様携帯」）・2件併記・桁数が合わないもの・市外局番の切れ目が判らない固定電話は原文のまま**。実データ6,200件中5,684件は既に正しい区切りで、数字だけ抜いて組み直すと併記された情報が消えるため
- refactor(member-os): 書式を `lib/ledger-format.ts`（`ymdSlash`/`formatTel`）に切り出し
- db: migrationなし
- test: `tests/ledger-format.test.ts` 12件を追加（実データに実在した崩れ方をケース化）。全437件パス

## 2026-08-28 — Shift Cloud: 店舗ダッシュボードから紙シフトを印刷
- feat(shift-cloud): 店舗ダッシュボードのシフト表に「🖨 紙シフトを印刷」を追加（DECISIONS #172）。**いま見ている月・半月（前半/後半）をそのまま持っていく**ので、画面で確認した範囲がそのまま A4横1枚になる
- feat(shift-cloud): `/store/print`（店舗ログインCookie）と `/store/<token>/print`（店頭端末トークン）を新設。**管理者アカウントで入り直さなくても店頭で刷れる**
- refactor(shift-cloud): 紙シフトのページ本体を `components/shift-print.tsx`（`ShiftPrintSheet`/`resolvePrintRange`）に切り出し、`/admin/shifts/print` はその薄いラッパに。紙の体裁を2箇所に持たない。`PrintButton` も `components/print-button.tsx` へ移動（旧パスは再エクスポートstub）
- security(shift-cloud): 店舗側の印刷は**認証で解決した1店舗に固定**（`?store=` の直打ちは効かない・切替タブも出さない）。オーナーがスタッフとしてもログインしている場合のみ複数店舗を選べる（#134）
- note: 紙の中身は従来どおり**その店舗の在籍スタッフ全員**（役職でグルーピング）。ダッシュボードのグリッド（その月にシフトがある人だけ）とは母集団が違う。行順はどちらも `staff.sort_order`
- db: migrationなし
- test: `npx tsc --noEmit` 通過・既存425件パス

## 2026-08-28 — Shift Cloud: 店舗ダッシュボードのスタッフ行をドラッグで並べ替え
- feat(shift-cloud): `/store` のシフト表で、スタッフ名の左の `⠿` をドラッグして行を並べ替えられるようにした（DECISIONS #171）。マウスでもタッチでも動く（ポインタイベント実装）。離した時点で保存
- change(shift-cloud): シフト表の既定の行順を**「その月に最初にシフトが出てきた順」→ `staff.sort_order` → 氏名**に変更。スタッフ管理の▲▼・シフト作成・紙シフトと同じ並びになり、月が変わっても入れ替わらない（#147の並び順を店舗ダッシュボードにも適用）
- note: 保存先は `staff.sort_order` 1本なので、店舗ダッシュボードで並べ替えるとシフト作成・紙シフトの行順も同時に変わる。画面に出ていないスタッフ（その月にシフトが無い人・他店スタッフ）の位置は動かさない
- security(shift-cloud): `reorderStoreStaff` は「この店舗にシフトがあるスタッフか」＋「認証で解決した店舗への書込みか」をサーバーで検証（#134）。監査ログは actor=null＋`via='store-dashboard'`
- db: migrationなし（`staff.sort_order` は 0121 で追加済み）
- test: `npx tsc --noEmit` 通過・既存425件パス

## 2026-08-27 — SWING CORTEX: 店オリジナル・メソッド生成（コメント→その店の言葉で知識化）＋ヘッダーにログアウト
- 方針確定: このシステムの核心は「その店のレッスンデータから、その店の言葉遣い・ドリル名のまま指導メソッドを作る」こと。汎用シード(source='seed')はコメント未取込店のフォールバックに格下げ
- feat(swing-cortex): 設定に「この店のレッスンメソッドを生成」（method-actions/method-client）。文体分析→指導テーマ発見→テーマごとに症状+確認項目+知識を生成(source='ai')→汎用シード置換。1アクション=AI1呼び出しでmaxDuration=60に収まる
- feat(swing-cortex): migration 0125 `sc_settings.style`（店の文体プロファイル: vocab/drills/phrases/tone）。**適用済み**。draftCommentのGOLF WING語彙ハードコードを撤去し、styleとRAG例文だけで書く＝店の言葉尻を維持（YOZANの旧ハードコード語彙はstyleへ移設済み）
- feat(swing-cortex): ヘッダー右上にログアウトボタン（アカウント切替用。設定内のボタンも継続）
- feat(swing-cortex): インサイトに「コーチ別の傾向」（migration 0126 RPC `sc_coach_insights`・**適用済み**。コメント数・局面top・キーワードをコーチ単位でDB集計）
- feat(swing-cortex): 表示ブランドを **「AIカルテナレッジ」** に変更（ヘッダー/ログイン/title/設定フッター。内部名・URL・sc_*・env CORTEX_* は据え置き）
- perf(swing-cortex): Excel取込を1,000件×4並列に（逐次500件では3万件規模がmaxDuration=60に収まらない）
- data(golfwing): **GOLF WING の店メソッドを自社実データで作り直し**＝40症状/85確認項目(source='ai')＋文体プロファイル。旧25症状と旧styleは**ウィナーズゴルフ様のExcel由来**だったため撤去(soft delete・診断ログ参照があるため物理削除は不可)。根拠はWINGNOTE実績28,842件(コーチ8名・2021-2026)
- ops(golfwing): 取込用Excel `GOLFWING_レッスンコメント_取込用.xlsx`(28,842行・講師は実名)を生成。設定→Excel取込→**全入れ替え**で投入するとウィナーズ由来コメント5,939件も同時に置き換わる
- data: 津スポーツセンター（tsusport）に店オリジナル・メソッド投入済み＝実コメント6,114件から12症状/27確認項目/27知識（ニュートラル姿勢・シャフトプレーン・フラットショルダー・アーリーエクステンション・バニラピッチ等、同店の実際の用語のみ）。汎用シード46件は除去済み。文体プロファイル保存済み


## 2026-08-22 — Caddy OS: シフトカレンダーで「既に割り当て済みです」が出て確定できない不具合を修正
- fix(caddy-os): `/calendar` で「仮で追加」したキャディに対して「確定で追加」を押すと**「この日は既に割り当て済みです」で止まり、確定されない**のを修正。原因は重複判定そのものではなく（判定は従来から 日付×キャディID で正しい）、既存行がある場合に**新規登録しか無く、更新への分岐が無かった**こと。`assignDispatch` を「同日×同キャディの行が 仮なら確定へ更新 / 確定済みで同じゴルフ場なら変更なし（冪等） / 確定済みで別ゴルフ場なら明示エラー（仮に戻すか取消を案内）/ 仮で別ゴルフ場なら差し替え＋金額再計算」に変更
- fix(caddy-os): カレンダーの再取得を**成功時のみ→常に**に変更（エラー時こそ画面とサーバーがズレている）。割当済みのキャディを選ぶと「◯◯はこの日すでに仮で入っています」の案内＋ボタンが［確定］に切り替わる。追加後はキャディ選択をクリア。エラー表示は6秒
- note: API `POST /api/v1/dispatches` の重複は従来どおり 409 CONFLICT（外部からの再送を増やさない契約のため変更なし）。tsc 通過

## 2026-08-19 — Caddy OS: キャディシフト管理の一元化（カレンダー／確定／台帳／ゴルフ場提出CSV／API）
- feat(caddy-os): **シフトカレンダー `/calendar`**（DECISIONS #140）。日付×キャディ×ゴルフ場×確定状態の月間表。日をタップ→その日に○/△を出しているキャディだけが候補に並ぶ→ゴルフ場を選んで「仮で追加」/「確定で追加」。確定は1件ずつ・その日まとめて・月まとめての3段階
- feat(caddy-os): **派遣シフトのステータス（仮／確定／取消）**。仮は台帳に見えるが売上・外注費・請求・提出CSVには入らない。確定を押した瞬間に採番振り直し→財務再集計が走る
- feat(caddy-os): **キャディ台帳 `/ledger`・`/ledger/[partnerId]`**。確定した派遣がそのまま台帳になる（転記なし）。勤務日/ゴルフ場/勤務区分/委託料・交通費・手当・計。支払請求書へ1クリック
- feat(caddy-os): **ゴルフ場提出 `/exports`**。ゴルフ場別の月間派遣一覧＋CSV書き出し（確定分のみ）。書式はゴルフ場ごとに設定（標準/シンプル/キャディ別/カレンダー表）。**BOM付きUTF-8**でExcelがそのまま開ける
- feat(caddy-os): **外部連携API `/api/v1/*`**（partners / clients / availability / dispatches / exports）。`Authorization: Bearer <CADDY_API_TOKEN>`。トークン未設定なら常に401
- feat(caddy-os): **キャディ本人のシフト希望提出 `/s/[token]`**（ログイン不要・スマホ）。設定画面でURLを発行してLINEで配る。過去日と確定済みの日はロック。再発行で旧URLは即無効
- feat(caddy-os): 設定画面に「提出CSV書式・先方担当者・送付先メール」（ゴルフ場）と「電話・メール・提出URL」（キャディ）を追加
- fix(caddy-os): **本番ビルドが `masters/page.tsx` の型エラーでERRORのまま放置されていた**のを修正（Supabaseネスト取得の配列推論。#76と同種）
- db: migration `0118_caddy_shift_confirm.sql`（yozan-shift-cloud・適用済）。`cad_dispatches.status/confirmed_at/confirmed_by`、`cad_clients.csv_format/contact_name/contact_email`、`cad_partners.phone/email/submit_token`、`cad_availability.source/submitted_at`。`refresh_caddy_finance`・`renumber_caddy_seq` を確定のみに。**既存329行は確定扱い＝数字は1円も動かない**（8ヶ月分をfin_entriesと照合済み）
- test: 369件パス（`tests/caddy-shift-csv.test.ts` 12件を新規追加）。`npx tsc --noEmit` / `next build`（23ルート）通過

## 2026-08-17 — Shift Cloud: 募集の開始を廃止（いつでも提出）＋1日単位の確定・編集
- change(shift-cloud): **「募集を開始する」を削除**（DECISIONS #138）。/admin/shifts の募集期間カード（開始/締切/募集中に戻す/削除）と period-form.tsx・delete-period-button.tsx、server actions（openPeriod・closePeriod・reopenPeriod・deletePeriod）を撤去。管理者が何も押さなくてもスタッフは提出できる
- feat(shift-cloud): /requests は月送り（既定=翌月・「今月」リンク）で**今日以降ならいつでも・何ヶ月先でも**提出。締切表示は撤去。空にして提出＝その日の取り下げ（ドラフトシフトも削除）。**過去日と確定済みの日はロック**（確定日は実際の時間をバッジ表示・サーバー側でも上書きを拒否）
- feat(shift-cloud): 提出があるたびに**シフト作成権限者へ通知**（募集の開始/締切という気づきの機会が無くなったため）
- feat(shift-cloud): シフト作成グリッドに**1マス単位の「✓ この日を確定」「🔒 確定済み→確定解除して編集」**を追加（publishCells / unpublishCells）。半月/月などの期間まとめ確定（#135のspan切替）はそのまま維持。確定解除は本人へ「調整中」を通知
- fix(shift-cloud): **確定済みのセルを編集して保存すると黙って未確定(draft)に戻り、スタッフのシフト画面から消えていた**のを修正。saveDraft→saveShifts に改名し published を維持、内容が変わった場合は本人へ変更通知（kind=shift_changed）
- db: migration `0116_shift_requests_periodless.sql`（yozan-shift-cloud・適用済）。shift_requests.period_id を任意化＋一意キーを (staff_id,date) へ。shift_request_periods はテーブル・データとも残置（過去の提出の履歴用）、open の期間は closed に
- test: 既存354件パス（`npx tsc --noEmit` も通過）

## 2026-08-16 — Shift Cloud: 給与明細PDF（日別出勤簿つき）
- feat(shift-cloud): /admin/payroll に**「明細PDF（出勤簿つき）」**を追加。1スタッフ=1ページ（A4縦）で「支給見込みの明細（基本給・残業代・交通費・手当・控除・支給見込み）＋その月の日別出勤簿（シフト・出勤・退勤・休憩・実働・残業・備考）」を全員分1つのPDFに出力（/admin/payroll/pdf?ym=）。金額は payroll_items をそのまま印字し再計算しない
- feat(shift-cloud): 出勤簿は /admin/attendance と同じ考え方で「確定シフトあり・当日以前・勤怠行なし」の日を**打刻なし**（赤字）として行に混ぜる（2026-08-04のBUGFIXと同種の欠落を明細でも見えるように）。遅刻/早退/打刻漏れ/修正済・休憩の手動上書き（＊）も備考に出す
- sec: 認可はCSVと同じ view_payroll＋パスワード再認証。**非オーナーは自店舗配属スタッフのみサーバー側で絞る**（#134 store-scope-lockdown）。出力は payroll.export_pdf として監査ログに記録
- impl: pdf-lib＋NotoSansJP（genesis入会控え#129と同じフォントを apps/shift-cloud/src/assets へ複製・**subset埋込禁止**のフル埋込＝1人あたり約1.4MB）。next.config の outputFileTracingIncludes で /admin/payroll/pdf にフォント同梱
- test: payslip-sheet 3件（打刻なし行・未来/休みシフト除外・JST表示・備考・丸め前合計）

## 2026-08-11 — FRANK: frankgolf.jp のResendドメイン認証＋承認メール再送ボタン
- ops: **frankgolf.jp を Resend で Verified に**（お名前.com Navi の DNSレコード設定に DKIM `resend._domainkey` / MX `send`(10) / SPF `send` / DMARC `_dmarc` を追加。既存の A 216.150.1.1・CNAME www は不変）。これまで送信は `403 The frankgolf.jp domain is not verified` で全て落ちており、**Web入会の受付メールも入会承認メールも1通も届いていなかった**（Vercel member-os の Runtime Logs で確認）
- test: /join-web からテスト申込1件 → `info@frankgolf.jp` の受付メールがGmail受信トレイに到達を確認（テスト行は rejected + deleted_at で退避）。氏名の姓/名分割が name=「姓 名」、name_kana=「セイ メイ」で保存されることも実データで確認
- feat(member-os): /frunk の会員一覧に**「会員番号メール再送」**を追加（承認は1回きりで、失敗すると会員番号が誰にも届かないため）。承認メールの生成・送信を `sendApprovalMailTo` に共通化し、**送れなかった理由を画面に出す**（アドレス未登録／RESEND未設定／送信失敗）。承認時にメールが落ちた場合も警告を表示（従来は黙って無視）
- note: 障害の切り分けは Vercel の Runtime Logs を `frank-mail` で検索するのが最短（未設定ならスキップ警告、認証漏れなら403が出る）

## 2026-08-10 — お客様フォームの氏名を姓/名に分割＋FRANK入会の支払方法欄を撤去
- feat(member-os): 共通コンポーネント `NameFields`（姓・名・セイ・メイの4欄）＋ `lib/name.ts`（joinName / splitName / readName）。1欄だと「山田太郎」「太郎 山田」「全角スペース」が混ざり、名簿の並び替え・宛名・Excel出力・重複判定が崩れるため、お客様の入力は必ず分割で受ける。DBは name / name_kana の1列のままで、保存時に「姓 名」へ結合（列追加なし・旧1欄フォームからの送信もフォールバックで受ける）
- feat(member-os): `/join-web`（Web入会）・`/join/[token]`（店頭タブレット入会）・`/trial`（体験申込）・`/reception/[token]`（店頭受付）を NameFields に統一。receptionは姓/名は既に分割済みでフリガナのみ分割
- feat(frank-golf): トライアル予約（trial-booking）の氏名も姓/名・セイ/メイに分割。送信時にJSで結合（`_build.py` を修正して静的HTML再生成）
- change(member-os): FRANK入会フォーム（Web・タブレット両方）から**お支払い方法の選択を撤去**。月会費はSquareのカード自動課金のみ＝ `payment_method='credit'` を固定保存し、「カード登録は会員番号の発行後（会員ページ）」という案内を表示。現金・口座振替・SBペイメントの選択肢は既存データの表示用に `FRUNK_PAYMENT_LABEL` として残置
- test: name-fields ロジック11件（結合・全角スペース・区切り無し・null安全）

## 2026-08-10 — Money OS: 過去の売上明細を/salesに表示＋入力画面をExcel全列対応
- feat(money-golfwing): 明細一覧の見出しクリックでソート（日付・区分・お客様名・品名・担当・金額・支払、昇順⇄降順。文字列は日本語ロケール比較・既定は日付の新しい順）
- feat(money-golfwing): /sales の明細一覧にアプリ入力(mon_sales)＋売上台帳の取込明細(mon_sales_lines)を統合表示。過去期（28〜31期）の明細が月送りで見えるように（従来はmon_salesの月次まるめ行しか出ず「明細が入っていない」ように見えた）。台帳明細は「台帳」バッジ付きの閲覧のみ・月次まるめ行(ledger/migration/slack_import)は二重表示になるため一覧から除外
- feat(money-golfwing): 合計パネルを2本立てに — 明細合計（一覧の合計）＋月次計上合計（月会費予測・自動計上含む。0円の月は非表示）
- feat(money-golfwing): 売上入力・明細編集に 種類(E列)・メーカー名(F列)・販売者(Q列) を追加（detail.item_type/maker/seller）。種類・メーカーは売上台帳の語彙から候補表示、在庫ピッカー選択で自動セット。入力者(R列)は従来どおりentered_byで自動 → Excel出力(A〜R列)が全列埋まる
- feat(money-golfwing): 支払方法の選択肢を台帳実績に合わせ Square・金券 を追加
- data: 31期売上一覧(Excel)とmon_sales_linesを月別照合 — 2025-06〜2026-07は件数・金額とも1:1で完全一致（取込済）。Excelの2026-08分11件はアプリ入力と同一売上（8/5まで二重記帳）のため取込せず＝アプリが正
- note: 2025-06〜12はmon_salesの月次まるめ未生成のままにしてある（PL二重計上を避けるためrefresh_mon_sales_from_linesは実行していない。必要になったら別途判断）

## 2026-08-09 — Genesis: 公式LINEの個人連絡先台帳＋個別push（DECISIONS #121・migration 0103適用済）
- db: 0103 `gn_line_contacts`（個人連絡先台帳。select=tenant・書き込みはservice_role専用）＋小川うららを期待連絡先としてシード＋policy `line_push_contact`=auto
- feat(genesis): LINE受信webhook — 1対1送信者をプロフィールAPIで自動登録。期待連絡先はmatch_hint一致で自動リンク（複数一致は安全側でリンクしない・リンク時はcompany_eventsに記録）。Inboxのfrom_nameに正式名>表示名（従来「差出人不明」）
- feat(genesis): executor `line_push_contact` — 登録済み連絡先へ公式LINEから1対1 push（宛名部分一致 or contact_id。複数一致/未リンクはエラーで停止）。履歴はgn_line_outbox(status=sent)
- test: line-contact-pure 3件（全240件通過）

## 2026-08-04 — Genesis: 判断フィードの実行プラン表示＋修正指示＋学習（DECISIONS #100・migration 0090適用済）
- feat(genesis): ホームのAI実行カードに「詳細」展開 — 承認すると何を・誰に・いつ実行し取り消せるか（実行プラン）＋送信文の全文を表示（従来160字プレビューのみ）
- feat(genesis): 修正指示 — AI修正（指示文1つでClaudeが書き直し）と直接編集の両対応。修正しても承認するまで送信されない。履歴はpayload.revisions＋audit_logs
- feat(genesis): 学習 — 修正指示を gn_feedback(0090) に蓄積し、AI修正プロンプトと営業ループの配信文生成に「過去の学習ルール」として自動注入（キー無し/失敗時はテンプレートのまま）
- db: 0090 `gn_feedback`（RLS有効・ポリシー無し=service_role専用）

## 2026-08-03 — Money OS: 担当プロ＋品名の在庫ピッカー＋明細編集（DECISIONS #98・migration 0088適用済）
- db: 0088 `mon_pros`（担当プロ名簿・店舗別。RLS有効・service_role専用）
- feat(money-golfwing): /settings 新設 — 店舗ごとの担当プロを追加・並び順・有効/無効・削除（ナビに「設定」）
- feat(money-golfwing): 売上入力ヘッダーに担当プロselect（detail.proへ名前スナップショット保存）
- feat(money-golfwing): 品名ピッカー — 自由入力＋「最近の入力」「在庫リスト(inv_stock 362品番)」から選択。品目チップ＋横断検索で絞り込み（全件ダラ見せしない）。在庫品番選択で定価自動セット・区分=販売へ
- feat(money-golfwing): 在庫連動 — 在庫品番付きの売上保存で inv_movements(kind='sale', qty=-(個数||1), source_app='money-os', source_id=sale.id) を起票（0086(e)の設計を配線）。編集で数量・日付を同期、品番を外す/削除で在庫が戻る
- feat(money-golfwing): 明細の編集 — 一覧の行から全項目を編集（updateSale）。現金⇄他の切替で現金出納の連携行を追加/更新/削除し、`rebalanceCashLedger` で残高を積み直し。削除時も連携行を削除して積み直し（従来は残ったままだった）
- fix(money-golfwing): 売上入力の「今日」初期値をJSTで解決（UTCだと朝9時まで前日になる。#73）

## 2026-07-27 — SWING CORTEX: あいまい症状検索＋コメント短文化＋Gemini対応
- feat(swing-cortex): 日本語あいまい検索 `lib/jp-search.ts`（正規化＋読み寄せ＋語幹化＋2-gram）。「伸びあがり/伸びあがる/伸び上がる/のびあがり」等の表記ゆれ・活用違いで同じ症状に着地。`/`診断と`/library`の両方に適用、同義語辞書を29グループへ拡張
- feat(swing-cortex): 自然文コメントを短文化（2〜3文・120字以内。`NATURAL_MAX_CHARS`＋`trimNatural()`で長さをコード側でも担保）。整形版（structured）の分量は従来どおり
- feat(swing-cortex): AI層を Claude / Gemini 両対応に（`callAi`＋`CORTEX_AI_PROVIDER`で切替・自動フェイルオーバー。Gemini既定 gemini-3.5-flash・思考トークンでの本文欠落対策済み）
- test: tests/swing-cortex-search.test.ts（8件）追加＝計80件通過

## 2026-07-26 — FRANK 打席予約v1＋設定汎用化（DECISIONS #86/#87）
- feat(genesis): /site-adminに「予約設定」（営業時間・定休曜日・祝日・臨時休業・枠単位・予約可能日数を保存→即反映）
- feat(frank): 予約DB（0081 frunk_bays/frunk_bookings・二重予約はunique indexで防止）
- feat(genesis): 公開予約API /api/public/frank/booking（空き照会・予約・キャンセル・プラン上限enforcement）
- feat(site): booking.html（会員番号+電話下4桁で予約→キャンセルまでWeb完結）

## 2026-07-26 — FRANK GOLF計画GO＋LINEグループ配信（DECISIONS #85）
- feat(genesis): スタッフ用OAのグループ参加/発言でgn_line_groupsへ自動登録（名前取得・店舗自動マッピング）
- feat(genesis): staff_directiveをOAトークン直接pushへ・送信先選択（all/store_id/group_id）・朝連絡は全グループ配信
- docs(frank): 9/2実行計画(10_)・小林電工様資料(11_)・運営マニュアル初版・POS設計(§3-7 Square)
- ops: Shift OSにFRANK5名登録（林/穴田/藤田/小川/古川・初期PW=password）
- feat(site): FRANKサイトCMS（0080 gn_site_content＋公開API＋cms.js＋Genesis /site-admin）・トップにギャラリー追加

## 2026-07-25 — 財務訂正＋P3完結（DECISIONS #84）
- fix(finance): 小川氏1,100,000は貸付金の返済（BS取引）→PL集計から除外（category='loan_repayment'）。#83のwipeで消えた6月役員報酬160,000をhr_manualで復元
- feat(genesis): 朝のスタッフ連絡に「持ち越し」欄（直近7日の未完了sp_tasksを済まで毎朝再掲）
- refactor(core): 会員集計の正典を @yozan/core/members に集約（kernel⇔store-dashの重複解消）＋tests 5件

## 2026-07-25 — P3後半＋キャディ財務修正＋朝連絡刷新（DECISIONS #83）
- fix(finance): キャディ6月支出の異常を修正（役員報酬1,100,000の誤分類→本部へ）。銀行明細×台帳の二重計上を0078で恒久修正（caddyは台帳が正典・林さん人件費はcaddy_manualで保持）
- feat(genesis): スタッフ朝連絡を「本日の出勤＋今日のやることリスト」中心に刷新（KPI・体験不足の話を廃止）
- feat(genesis): 事業別カードの数字タップで収支のカテゴリ別内訳を表示（SegmentLine追加）
- feat(genesis): イベント一元化（0079・DBトリガーで体験/入会/予約/アンケート到着をcompany_eventsへ）
- feat(genesis): AI週次成績表（ai-scorecard.ts・月曜）＋朝の個人LINEダイジェスト（morning-digest.ts・宛先はスタッフOAへの1:1から自動採用）

## 2026-07-25 — Genesis大改修P3前半: 測定学習＋稼働化プログラム（DECISIONS #82）
- feat(genesis): 営業ループの自動測定 — 配信7日後の体験申込・LINE体験返信を gn_loop_runs.result に実測保存し「打ち手→結果」をティッカーへ
- feat(genesis): 稼働化プログラム（activation-loop.ts・毎週月曜）— reserve/survey/lesson/legal の14日利用ゼロを検知し「稼働化 or 凍結」の改善提案を自動起票

## 2026-07-25 — LINE受信webhook＋デプロイフックDB化（A-4完全解消・DECISIONS #81）
- feat(genesis): `/api/webhooks/line/[code]` — 署名検証つきLINE受信。返信をsec_inquiriesへ取込→ホーム判断フィードに自動合流。「体験」返信はtrial/high扱い＋イベント記録
- feat(genesis): gn_deploy_hooks（migration 0077・URLはDB直登録）。prod_deployハンドラをDB参照優先に変更（env不要化）
- chore: channel secret 3本・genesis Deploy Hook をDBに登録（SQL直・git非掲載）

## 2026-07-25 — 顧客LINE直接配信を開通（A-4解消・DECISIONS #80）
- feat(genesis): gn_line_channels（migration 0076・トークンはDB直seed=gitに載せない）＋lib/line.ts（broadcast/push）
- feat(genesis): line_broadcastハンドラを実配信化（顧客向けOAへbroadcast・履歴はoutboxにstatus=sentで記録）。営業ループの起案を顧客直接配信（ビジター用・approval維持）へ切替
- feat(genesis): ホーム判断カードに配信文プレビュー（160字）を表示

## 2026-07-25 — demo-sales: デモサイトv2（6ページ化＋Web予約デモ＋サンプル画像）＋管理フォーム改善（DECISIONS #79）
- feat(demo-sales): デモを6ページ構成に全面改修（render-demo.ts）— ハッシュルーティング（ホーム/診療案内/初めての方へFAQ/院長・院内紹介/アクセス/Web予約）、スクロール連動アニメ・ヘッダー縮小・モバイルドロワー（prefers-reduced-motion対応）
- feat(demo-sales): Web予約の完全デモ動作 — カレンダー（休診日は診療時間表から自動判定）→時間枠→入力→確認→完了。送信・保存なし（※デモ表記）
- feat(demo-sales): サンプル画像 `lib/sample-art.ts` 新規 — 写真未設定箇所（ヒーロー/ギャラリー6枚/院長/地図）にテンプレート配色のSVGイラスト（※仮画像ラベル）を自動差し込み。実写真が常に優先
- feat(demo-sales): 業種別の症状例(SYMPTOMS)・FAQ(EXTRA_FAQ)をtemplates.tsに追加
- feat(demo-sales): /p/[id] デモ生成フォームを①基本②文章③診療内容・時間④写真⑤修正指示のセクション構成に再編。空欄時に入る業種標準値をプレースホルダー表示。お知らせ(news)・採用(recruit)欄を追加（actions.tsにnewsパース追加）。webReserveチェックボックスは廃止（予約デモ常時搭載）

## 2026-07-25 — Genesis大改修P2後半: 判断のホーム完結拡大＋開発自律化配線（DECISIONS #78）
- feat(genesis): Web入会承認をホームで完結（decideJoinRequest=会員番号FR####発行・在籍化）。判断SLA=24時間放置に琥珀バッジ＋最上位昇格
- feat(genesis): /chatと/commandをタブ統合（chat-tabs.tsx）。事業別パフォーマンスをホーム→/financeへ移設
- feat(genesis): prod_deployハンドラ（VERCEL_DEPLOY_HOOKS env・承認後にDeploy Hook POST。env未設定時は明示エラー）
- docs: OPERATIONS改訂方針（ユーザー作業は原則AI実行・残るのは4種のみ）

## 2026-07-25 — Genesis大改修P2前半: 自律ループ基盤＋営業AIループv1（DECISIONS #77）
- feat(genesis): `gn_loops` / `gn_loop_runs` 新設（migration 0075・適用済）— 観測→判断→生成→実行→測定のサイクル記録
- feat(genesis): 営業AIループv1 `lib/sales-loop.ts` — 体験予約の日割りペース不足を検知→掘り起こし配信文を生成→staff_directive(approval)で起案→ホームで承認→LINE配信依頼。日次cronに接続
- docs: AI_RULES（承認UI=ホーム一本化・ループ正典・デプロイ方針）、DEVELOPMENT_RULES（GitHub直クローン・push後ビルド確認義務化）を改訂

## 2026-07-24 — Genesis大改修P1: 画面26→5＋管理・判断フィード統合（DECISIONS #76）
- feat(genesis): サイドバーを5画面＋「管理」折りたたみに再編（sidebar.tsx: PRIMARY_NAV/ADMIN_NAV分離、mobile-nav追随）。既存URLは全温存
- feat(genesis): ホーム全面刷新 — 判断フィード統合（`lib/judgment-feed.ts`新設）: 承認・AI実行(承認/取消枠)・成果物・問い合わせ・**体験申込(member-os)**・**Web入会**・**予約申込(reserve-os)** を1本にし、その場でワンタップ承認。体験申込の日程確定は `feed-actions.ts` decideTrialRequest（member-osと同status遷移）
- style(genesis): ホームからHUD/blink装飾を撤去（REDESIGN §9: 色=状態のみ・1カード=1判断・ゼロ状態表示・取消チップ）。btn-main/btn-subをglobals.cssに追加
- docs: REDESIGN_2026-07.md（大改修の正典・全システム監査§5e含む）を新規作成

## 2026-07-19 — JST日付統一・現場マニュアル4本・ネットワークマップ同期（DECISIONS #73）
- fix(genesis): サーバー側の「今日」をJSTに統一（`lib/jst.ts` 新設）。日次レポートのタイトル日付が毎朝1日ズレていたのを解消（6:00 JST cron＝前日21:00 UTC問題）。sp_tasksの日付・提案dedupeキー・KPIチェックの当月判定も同修正。tests/jst-dates.test.ts で固定
- docs(runbook): money-os / survey-os / reserve-os / caddy-os の現場手順書を新規作成（C-1完了）。各アプリ `/manual`（ログイン不要）で配信、ログイン画面にリンク追加
- feat(genesis/network): トポロジを実態に同期 — survey-os/caddy-os/demo-sales/reserve-osのURL・本番状態を反映、FRANK GOLF公式サイトのノード＋フロー図(frank-golf.svg)を追加

## 2026-07-16 — 生成側を executor に配線（各AIが自動でenqueue）（DECISIONS #63）
- feat(genesis/ceo-ai): 日次レポート生成の最後に「スタッフ朝連絡」を `staff_directive` で投入（1日1件・dedupe）。CEO AIの各指示は `agent_directive`(auto) で配布し監査に残す
- feat(genesis/deliverables): 成果物を承認すると `internal_notify`(auto) を executor に投入（送信チャネル未接続のため現状は「承認済み・手動対応」の記録/可視化。接続後に実送信へ差し替え）
- feat(genesis/ai-execution): `agent_directive` ハンドラ追加、壊れていた `deliverable_generate` ハンドラ（引数不整合）を撤去
- db: `0063_ai_generation_wiring.sql` — 外部送信は**承認ゲートで試運転**（staff_directive/line_broadcast/sns_post を approval に退避、信頼後 auto_undo へ）、`agent_directive`=auto を追加
- 効果: 毎朝、スタッフ向け連絡が /executions に承認待ちで並ぶ→承認で公式LINE配信。AI社員への指示は自動配布・監査化

## 2026-07-16 — AI自律度をリスク階層モデル化＋executor実装（DECISIONS #61/#62）
- feat(genesis): AIアクションを `auto` / `auto_undo` / `approval` の3階層で実行する executor を実装。正典はDBの `ai_execution_policies`（migration 0061）、実行キューは `ai_action_queue`（migration 0062）
- feat(genesis/lib): `ai-execution.ts` — `enqueueAction`（モード解決→scheduled_at決定）/ `runDueActions`（楽観ロックで実行・`audit_logs(actor_type='ai')`記録）/ `cancelAction`（取消枠内のみ）/ `approveAction`・`rejectAction`。ハンドラ: test_notify / internal_notify / report_generate / deliverable_generate / staff_directive / line_broadcast。未登録action_typeは失敗扱い（安全）
- feat(genesis): `/executions` 画面（一覧・状態バッジ・取消枠カウントダウン・取消/承認/却下・テスト実行）＋サイドバー導線。`/api/cron/execute`（10分ごと）＋日次cronで tick
- feat(db): Vaultの秘密をAIが生成・保存可能に（`vault_systems.secret_source/managed_by`・`app.gen_secret()`）。旧「/vault手入力」ルールを廃止
- chore(rules): 開発速度ルール緩和（DEVELOPMENT_RULES 7・8＝複数機能まとめ実装可・横断的に読む）、新アプリのデプロイはVercel MCP（prod_deployはapproval）
- 注意: 器は完成だが**生成側（各AI）から enqueueAction を呼ぶ配線は未接続**＝実運用の自動発火はまだ。動作確認は /executions のテスト実行で

## 2026-07-15 — 改善提案を「工程」に分解して現場に配れるように（DECISIONS #59）
- feat(genesis/suggestions): 提案カードを**編集可能**に — 施策名・背景をその場で書き換え、**工程エディタ**で各工程に担当（スタッフ/AI社員）・やり方/台本・期限を設定（並べ替え/追加/削除）
- feat(genesis/suggestions): 「**AIに工程を下書きさせる**」— Claudeが実行手順を工程に分解し、スタッフ名簿・AI社員コードから**担当まで割り当てて**下書き。APIキー無し時は ①②③/改行/→ で分割するルールベースにフォールバック（`lib/step-planner.ts`）
- feat(genesis/directives): **キャンペーン発行**（`issueCampaign`）— 親 `gn_directives(target_kind='campaign')` の下に各工程を配布（スタッフ→やることリスト＋通知／AI社員→指示書prompt）。`/directives` に工程チェックリスト、**全工程完了で親を自動完了**（ロールアップ）
- db: `0059_directive_steps.sql` — `gn_directive_steps` 新設＋ `gn_directives.target_kind` に `campaign` 追加（RLS deny・service_role経由）
- chore: この機能はAI社員の権限を分析・下書き・案作成までに限定（VISION §7）。工程の下書きは保存せず画面で確定してから発行


- feat(demo-sales): デモ生成フォームに**写真アップロード**を追加 — ヘッダー（ヒーロー背景）・院内/診察風景ギャラリー（最大6枚・キャプション）・院長/スタッフ写真。署名URLでブラウザから直PUT、送信前にcanvasで長辺1600px/JPEG 0.85へ自動縮小（スマホ写真をそのまま選べる）
- db: `0049_demo_assets.sql` — 公開バケット `demo-assets`（画像のみ・10MB上限・パスはランダムで推測不可）。デモは認証なし配信のため公開バケット、書き込みは service_role の署名URLのみ
- feat(demo-sales): 基調色をカラーピッカー＋プリセット10色から選択（HEX手入力も可・「業種標準に戻す」あり）。数値を覚える必要をなくした
- feat(demo-sales): レンダラーがヒーロー背景画像（白グラデーション重ねで文字可読性を確保・スマホは縦グラデ）・「院内のご案内」ギャラリーセクション・院長実写に対応。未設定なら従来のプレースホルダのまま成立
- 素材ルール: 院提供の写真・フリー素材のみ（既存サイトからの転載はしない）を画面上にも明記
- fix(demo-sales): ログイン不可の原因は Vercel の `NEXT_PUBLIC_SUPABASE_ANON_KEY` にキーが重複＋改行付きで入っていたこと（Headers.append invalid header value）。値を1行に修正して再デプロイ

## 2026-07-14 — AI DEMO SALES: 営業デモ高速生成の新アプリ（DECISIONS #54）
- feat(demo-sales): 独立アプリ `apps/demo-sales` 新設（port 3009・use_demo_sales|view_hq・new-app雛形）— クリニック・動物病院向けHP制作営業の「営業先専用デモを事前に作って見せる」システム
- db: `0048_demo_sales.sql` — dms_prospects（25段階ファネル・分析・スコア・失注理由）/ dms_demos（token配信・brief・version）/ dms_documents / dms_activities（directive含む）/ dms_plans / dms_projects（成約→正式制作の受け皿）＋営業先13件・プラン2種シード
- feat: 業種別デモテンプレート10種（lib/templates.ts）×ルールベースレンダラー（lib/render-demo.ts）＝Claude API不要でデモ即時生成（スマホ対応単一HTML・DEMOリボン・noindex・仮素材※仮ラベル）
- feat: /d/[token] 非公開配信（noindex二重化・60日失効・任意パスコード）/ /p/[id] 営業先詳細（分析・デモ再生成・共有設定）/ /p/[id]/compare 現サイト比較 / 営業司令ダッシュボード（ファネルKPI・本日の活動・営業指示欄）
- feat: 提案書・電話/訪問トーク・メール・お礼5種・見積書案の一括生成（lib/sales-docs.ts、現サイトを批判しない設計）
- feat(genesis /network): demo-sales ノード＋フロー図 flows/demo-sales.svg 追加（#47ルール）
- fix: templates/app-template/src/middleware.ts が349バイトで途切れていた（matcher欠落）のを修正
- sample: 福本クリニック（宝塚市山本南・自院HPなし＝医師会DB掲載のみ）を実データでデモ生成し営業準備完了状態に

## 2026-07-14 — Genesisの報告が止まっていた原因の修正＋提案/実行指示の実装（DECISIONS #52）
- 診断: **日次レポートが自動生成されていなかった原因＝Vercel Cronの `/api/cron/daily` が middleware で /login へ307リダイレクト**（Vercelログで確認。DBのレポートは全て手動生成分だった）→ `PUBLIC_PREFIXES` に `/api/cron` を追加
- 診断: LINEリッチメニュー押下（「プロの出勤情報」等10件）がCEO Inboxの「未対応」を占拠 / ai_suggestions・approval_requests・gn_messages はすべて0件＝提案と指示の器が空
- db: `0045_inbox_filter_suggestions_directives.sql` 適用 — `sec_filter_rules`（受信フィルタ）/ `gn_directives`（実行指示台帳）/ ai_suggestions拡張（dedupe_key・impact・effort・href・dismissed_at、suggested_actionをjsonb→text）/ sec_inquiries に filtered_by_rule・draft_generated_at・reply_error
- feat(genesis /inbox): リッチメニュー文言の**受信フィルタ管理UI**（追加・削除、既存分にも即適用）、**AI返信案の生成**（1件ずつ／まとめて）、**承認＝送信**（メール=秘書タスク、LINE=n8n）。既存7件に返信案を投入済み（承認待ち）
- feat(genesis /suggestions): **改善提案**を実装（ルールベース＋Claude、重要度順、効果・手間つき）。Cockpitの一等地にも常時表示
- feat(genesis /directives): **実行指示センター**。宛先=スタッフ（sp_tasks＋通知）／AI社員（prompts指示書）／外部送信（approval_requests）。改善提案から1クリックで指示化
- feat(n8n): ワークフロー「LINE返信送信 (承認済み→Push)」新設（5分おきに status=approved の LINE返信を Push送信 → replied 更新。要: app_config に LINE_CHANNEL_ACCESS_TOKEN、Activate）
- 検証: ワークスペースのマウントキャッシュ不整合でローカルtscが不可 → push後のVercelビルドで確認する

## 2026-07-13(9) — Lesson OS P2: PGA NOTE準拠の大型アップデート（DECISIONS #50）
- 調査: PGA NOTE公式サイトの機能ページを実機閲覧し、コーチアプリ/ユーザーアプリの全機能とUI（紺×黒×金／青×白）を仕様化
- db: `0043_lesson_os_p2.sql` 適用 — profile/skill(JSONB)・photo_path・distance_yd・annotations・lsn_progress(+items 9項目シード)・lsn_model_videos・lsn_share_tokens
- feat(lesson-os): **カルテのタブ化**（本日のレッスン/進捗/基本情報/詳細情報/比較再生）、**描画ツール**（直線・円・フリーハンド・4色・保存）＋**ガイド線**（スイングプレーン/前傾）＋コマ送り/スロー、**比較再生**（同時再生）、**進捗スライダー＋レーダーチャート**、**お手本スイング/models**、**生徒共有ページ/s/[token]**（青×白・進捗/記録/アドバイス/お手本・停止/再発行）、**CSVエクスポート**、顔写真、一覧のカードグリッド化
- 検証: 全ファイルesbuild parse green。push後にVercelビルド＋実機確認

## 2026-07-13(8) — Lesson OS 本番稼働
- ops: Vercel `lesson-os` デプロイREADY確認（https://lesson-os.vercel.app）。vault_systemsへ登録、RUNBOOK/manualにURL記載
- feat(genesis): System Networkに lesson-os ノード＋フロー図（flows/lesson-os.svg）を追加（新システム時の必須ルール）

## 2026-07-13(7) — Lesson OS P1（WING NOTE代替アプリ本体）
- 調査: **WING NOTE実機**（ログイン済みChrome）と**GOLF WING Finder**（コーチ診断ナレッジのデモ）を確認。機能マップと弱み→改善表を SYSTEM.md §6 に記録
- feat: **apps/lesson-os 新設**（独立アプリ・port 3006・use_lesson|view_hq・hnd1）— 生徒一覧（**名前だけで登録できる**・検索・最終レッスン日順・動画数）／生徒カルテ（動画タイムライン・**スマホカメラ直撮影対応**の署名URL直PUTアップロード・再生・コーチコメント・**★ベストスイング**・目標/メモ編集）／/manual（RUNBOOK新規）
- db: `0042_lesson_os_p1.sql` 適用 — lsn_videos.is_best / lsn_students.goal
- ci: matrixにlesson-os追加
- 検証: 全ファイルesbuild parse green。push→Vercelプロジェクト作成後に動作確認（NEXT_TASKS LSN）

## 2026-07-13(6) — 資料室の不具合修正・スタッフ編集修正・Lesson OS土台
- fix(genesis/library): アップロード失敗の2原因を解消 — ①Server Action経由はVercel約4.5MB上限 → **署名付きURLでブラウザ→Storage直PUT**に変更（50MBまで） ②**Storageキーは日本語不可**（"Invalid key"）→ 分類・ファイル名をbase64urlで持ち表示時に復号（lib/libkey.ts新設）
- fix(shift-cloud): スタッフ編集の主店舗必須を解除 — 店舗に立たない役員・本部は「なし」で保存可（小川さんのパスワード設定が主店舗バリデーションで止まっていた）
- ops: 作成済み資料13件を資料室へ投入（Edge Function library-upload経由・投入後に閉鎖）。社内マニュアル5・事業計画1・出店計画7
- db: `0041_lesson_os.sql` 適用 — **Lesson OS（WING NOTE代替）の土台**: lsn_students/lsn_videos/lsn_comments/lsn_measurements（Trackman受け口）＋lesson-videosバケット（DECISIONS #49、正典 docs/modules/lesson-os/SYSTEM.md）。アプリP1実装はNEXT_TASKS LSN
- 検証: esbuild parse green。push後にVercelビルド確認

## 2026-07-13(5) — 社内連絡ノート・役員共有パック・SaaS化計画
- db: `0040_gn_messages.sql` 適用 — 社内連絡ノート（役員→経営、status open/done・返信メモ）
- feat(genesis): **社内連絡 /notes** 新設＋サイドバー追加 — 役員が書き残し、古川さんが未対応一覧で確認→「✓対応済み」＋返信メモ。口頭・LINEで流れる連絡の集約場所
- docs: **ONBOARDING_EXEC.md**（小川さん向け共有パック: できること/業務→入力先対応表/毎朝6時に動くもの一覧/最初の1週間）、**SAAS_PLAN.md**（販売計画: 初期設定はウィザード＋AI設定コンシェルジュ＋導入代行、HP/予約は共存から段階移行、リポジトリPrivate化が前提）
- 検証: esbuild parse green。push後にVercelビルド確認

## 2026-07-13(4) — GENESIS役員展開: タブ日本語化・マニュアル・資料室・権限
- feat(genesis): **サイドバーのタブ名を「何ができるか」が分かる日本語に**（Cockpit→経営ダッシュボード等、旧名はツールチップ）。よく使う順に並べ替え（承認待ち・受信箱を上へ）
- feat(genesis): **役員向けマニュアル** docs/genesis/RUNBOOK.md 新規（毎日見るのは3つだけ/各タブ表/権限管理手順）→ /manual で公開配信＋ログイン画面にリンク（member-os等と同方式）
- feat(genesis): **資料室 /library** — プライベートバケット`library`（service_role専用）に分類つきアップロード/署名URLダウンロード/削除。**Publicリポジトリに資料を置かないための置き場**。next.config bodySizeLimit 26mb
- db: 「役員（本部閲覧）」ロール新設（view_hqのみ）、小川うららに付与済み。アカウント発行（初期パスワード）はShift Cloud管理画面から＝権限は古川さんのアカウントで一元管理
- fix(caddy-os): 3bbd4e8で消えた請求書印刷CSS（@media print）を復元（原因はVMキャッシュ経由の追記事故。以後globals追記はclone側で行う）
- 検証: esbuild parse green。push後にVercelビルド確認

## 2026-07-13(3) — マニュアル配信・モバイル全アプリ展開・Tokyoリージョン化（MN/MB/速度）
- feat(MN): member-os / shift-cloud / legal-os に **/manual**（ログイン不要）— RUNBOOKを画面表示＋⬇ダウンロード＋🖨印刷(PDF保存)。/loginに「📖使い方マニュアル」リンク。middlewareのpublicPrefixesに/manual追加。中身はpublic/manual.md（正典docs/modules/<os>/RUNBOOKのコピー）
- style(MB): モバイル救済CSS（grid畳み＋table横スクロール）を残り7アプリのglobals.cssへ展開。member-osのTopBarは元からモバイル対応済と確認
- perf(速度): **vercel.jsonで全アプリをhnd1(東京)に固定** — shift-cloud/survey-os/reserve-os/caddy-osに新規、genesisはcronsにregions追記（member/legal/moneyは設定済だった）。Supabase(東京)との往復短縮＝体感速度の底上げ。反映は次回デプロイ時
- 検証: manual/page.tsx esbuild parse green。push後にVercelビルド確認

## 2026-07-13(2) — Genesisモバイル対応（NEXT_TASKS MB）
- feat(genesis): **MobileNav新設**（md未満: 上部固定バー＋ハンバーガー→左ドロワー、遷移で自動クローズ）。Sidebarは `hidden md:flex` に、mainは `p-4 md:p-6`
- style(genesis): globals.cssにモバイル救済 — md未満で grid-cols-2→1列 / 3〜6→2列、テーブルは横スクロール。**新規コードはレスポンシブ指定を書く**（DESIGN_SYSTEM「モバイル対応」節を新設＝全アプリ共通基準）
- 検証: 変更3ファイル esbuild parse green。push後にVercelビルド＋スマホ実機確認（NEXT_TASKS MB）

## 2026-07-13 — スタッフポータル拡張（DECISIONS #48）
- db: `0039_staff_portal.sql` 適用 — sp_tasks（やること）/ sp_reports（日報・週報）/ sp_calendar_memos（本人のみRLS）/ sp_links（クイックリンク）。sp_linksにSmart Hallo・GolfOrder・コーポレートの3件を初期投入
- feat(shift-cloud): スタッフ画面に **/calendar**（月間グリッド: シフト色バー・休・イベント/予約/タスク/メモの●、日タップ詳細＋メモ書込み・タスク追加）と **/reports**（日報・週報upsert＋みんなのレポート）を新設。下部タブを5つに再編（ホーム/カレンダー/シフト提出/日報/お知らせ）
- feat(shift-cloud): homeに「今日のやること」「クイックリンク」を追加、給与見込みを calcMonthlyPayroll ベース（月給制・手当・按分対応）に置換
- 設計: 予約連携は lib/day-feed.ts の日別フィードに後からアダプタ合流（正典 docs/modules/workforce-os/STAFF_PORTAL.md）
- 検証: 全11ファイル esbuild parse green。フルnext buildはサンドボックス45秒制限で完走不可のため **push後にVercelビルドログ確認**（次の作業）

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
                                                                                                                                                                                                                             