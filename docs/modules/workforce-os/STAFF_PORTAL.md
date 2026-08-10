# STAFF_PORTAL — スタッフポータル（Shift Cloud スタッフ画面の拡張）

DECISIONS #48 / migration 0039。Shift Cloudのスタッフ画面を「スタッフOS」に育てる。
対象URL: https://shift-cloud-shift-cloud.vercel.app（スタッフログイン側）

## 1. 画面構成（下部タブ5つ）

| タブ | パス | 内容 |
|---|---|---|
| ホーム | /home | 今日のシフト・打刻状況・**今日のやること**・勤務時間・**給与見込み（概算）**・**クイックリンク**・イベント・お知らせ |
| カレンダー | /calendar | 月間グリッド。シフト（テンプレ色）・休み・イベント●・予約●・やること●・メモ●。日タップで詳細＋メモ書込み。従来のリスト表示は /shifts（カレンダー右上からリンク） |
| シフト提出 | /requests | 従来どおり |
| 報告 | /reports | **イレギュラー報告**（#125で日報・週報から置き換え）。何かあった時だけ書く |
| お知らせ | /notices | 従来どおり |

## 2. データ（migration 0039 / sp_*）

- `sp_tasks` — やること。staff_id/date/title/status(open|done)/source(manual|manager|genesis|ai)。RLS=テナント標準
- `sp_incidents` — **イレギュラー報告**（0107 / #125）。category(9種・textでCHECKしない)/severity(low|mid|high)/occurred_at(いつ)/place(どこ)/involved(だれ)/body(なに)/action_taken(対応)/status(open|resolved)。1日1件ではなく起きた分だけ
- `sp_incident_insights` — 分析結果（繰り返しパターン＋再発防止策）。AIが作り人が status(open|doing|done|dismissed) を進める。incident_ids で根拠の報告に戻れる
- `sp_reports` — 日報・週報。**#125で廃止**（画面から外した。運用0件のままテーブルのみ残置＝追加のみの原則）
- `sp_calendar_memos` — カレンダーメモ。**RLS=本人のみ**（wages_select_selfと同型）
- `sp_links` — クイックリンク。store_id null=全店共通。**URLのみ保持。ID/PWはVault(#26)**＝ポータルは自動ログインしない

## 3. 給与見込み（/home）

管理側の本計算と同一の `calcMonthlyPayroll` を使う（月給制・手当・時給の日付按分 #39/#44 対応）。
- 時給者 = 時給×実労働 + 交通費(日額)×出勤日数 + Σ手当（今月分の payroll_allowances 入力があれば反映）
- 月給者 = 月給固定（勤怠0日でも includeStaffIds で満額表示）
- 画面に「確定額は給与明細が正」を明記。あくまで概算

## 4. 予約システム連携の設計（疎結合）

正典コード: `apps/shift-cloud/src/lib/day-feed.ts`

カレンダーは「dateをキーにした日別フィード」に複数ソースを合流させる。
- 現在: shifts / store_events / sp_calendar_memos / sp_tasks
- 将来: **Reserve OS（rsv_*）・体験予約（mbr_trial_bookings）・Smart Hallo取込** を `FeedReservation`（date/time/label/source）に正規化して `buildMonthFeed()` に渡すだけ。画面側は対応済（●表示＋詳細行）
- FKでは結合しない（アプリ独立の原則 DECISIONS #27系と同じ）

## 5. 店舗ダッシュボード /store/[token]（DECISIONS #75）

店頭タブレット共有表示。認証は **kiosk_devices のデバイストークン**（/kiosk/[token] と同一トークンで開ける・スタッフログイン不要）。middleware の PUBLIC_PREFIXES に `/store` を追加済み。

- 構成: ①月間カレンダー（店舗全員の出勤者名チップ・イベント●・体験予約●・やること●、日タップで詳細）→ ②今月KPIカード4種 → ③業務リンク集（sp_links）
- やること = **店舗共通タスクのみ**（sp_tasks staff_id null / #55）。追加・完了チェック可。個人タスクは共有画面に出さない
  - スタッフ側 /home・/calendar の「やることを追加」には **「店舗のみんなに共有する」チェック**がある（既定OFF＝個人あて）。ONで `staff_id=null` + `store_id=主店舗` となり、この店舗端末にも出る。主店舗未設定のスタッフはONにできない（0050 sp_tasks_target_check）
  - 「自分のカレンダーには出るのに店舗端末に出ない」という問い合わせは、ほぼこのチェックOFFが原因
- KPI（店舗別・今月・すべて既存テーブルから直接集計＝新テーブルなし）:
  - 体験: GOLF WING=mbr_trial_bookings / FRANK=mbr_trial_requests(#72)
  - 物販: mon_sales category='販売'（当月なしは最新実績月をフォールバック表示）
  - 会員: GOLF WING=mbr_members（kernel.tsと同ロジック）/ FRANK=frunk_members
  - 売上見込: mon_sales当月＋fin_entries source='forecast'（月会費予測 0028）
- 店舗切替タブ（GOLF WING 宝塚 / FRANK GOLF 姫路）。5分ごと自動リフレッシュ
- 正典コード: `apps/shift-cloud/src/lib/store-dash.ts`

## 6. 後続フェーズ（未実装）

1. 店長→スタッフへのタスク配信UI（sp_tasks.source='manager'）
2. Genesis判断リスト/AI指示 → sp_tasks 自動配信（source='genesis'|'ai'、VISION §7=提案・作成まで）
3. ~~日報週報のCEO AI要約~~ → **#125で方針変更**。日報をやめてイレギュラー報告にし、分析は Genesis `/incidents` に独立させた（下記 §7）
4. 予約ソースの実接続（Reserve OSデプロイ後）
5. sp_links の管理UI（当面は execute_sql / 管理画面追加は必要になってから）

## 7. イレギュラー報告（DECISIONS #125 / migration 0107）

日報をやめた理由: 「今日やったこと」を毎日書かせても読む側の判断材料が増えない（sp_reports は運用0件のまま）。
欲しいのは **何かあった時の事実**。それだけを構造化して集めれば、そのまま再発防止の入力になる。

### 書く側（スタッフ携帯 /reports）

- **カテゴリーを選んでから**残りの入力欄が開く（スマホで一度に全部見せると長すぎる）
- 入力項目: 重大度（軽微/ふつう/重大）→ いつ（既定=今）→ どこ（店舗＋場所）→ だれが → **なにがあったか**（必須）→ その場でどう対応したか
- カテゴリー定義は `packages/core/src/incidents.ts`（shift-cloud と genesis の両方から使うので core に置く）。
  **DBのCHECK制約にしない** — 運用で増えるし、一覧に無い値の行が静かに消える事故（Vault 2026-08-07）を避ける。未知値は `normalizeIncidentCategory()` が other に寄せる
- 一覧では誰でも「対応済みにする」＋決着メモを残せる

### 通知（重大度=高のみ）

`apps/shift-cloud/src/lib/incident-notify.ts`。gn_line_contacts の `person_name='古川博庸'` へ1対1 push。
**line_user_id が未リンクなら送らずに理由を画面に返す**（「送ったつもりで届いていない」を作らない）。
リンクは本人がYOZAN公式LINEへ1回メッセージを送れば webhook が自動で埋める（0103の仕組み）。

### 分析（Genesis /incidents）

正典コード: `apps/genesis/src/lib/incident-analysis.ts`。

- 毎朝6時の日次cron（`runDailyAfterwork` の steps に `incidents`）＋画面の「今すぐ分析」ボタン
- Claude が繰り返しパターン→推定原因→**具体的な再発防止策**を最大5件生成。AIが返した incident_ids は実在するものだけ採用
- **AIキーが無い/APIが落ちていてもルールベースで必ず結果を出す**（`ruleBasedInsights()` は純粋関数・tests/incidents.test.ts で固定）。空白のまま放置しない
- 対応中(open/doing)と同じ見出しは作り直さない＝毎日回しても重複しない
- 画面で 未着手→対応中→完了/見送り を進められる。完了させた対策は次の分析で作り直されない
