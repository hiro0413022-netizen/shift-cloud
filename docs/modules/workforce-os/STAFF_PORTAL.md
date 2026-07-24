# STAFF_PORTAL — スタッフポータル（Shift Cloud スタッフ画面の拡張）

DECISIONS #48 / migration 0039。Shift Cloudのスタッフ画面を「スタッフOS」に育てる。
対象URL: https://shift-cloud-shift-cloud.vercel.app（スタッフログイン側）

## 1. 画面構成（下部タブ5つ）

| タブ | パス | 内容 |
|---|---|---|
| ホーム | /home | 今日のシフト・打刻状況・**今日のやること**・勤務時間・**給与見込み（概算）**・**クイックリンク**・イベント・お知らせ |
| カレンダー | /calendar | 月間グリッド。シフト（テンプレ色）・休み・イベント●・予約●・やること●・メモ●。日タップで詳細＋メモ書込み。従来のリスト表示は /shifts（カレンダー右上からリンク） |
| シフト提出 | /requests | 従来どおり |
| 日報 | /reports | 日報・週報の記入＋みんなのレポート閲覧 |
| お知らせ | /notices | 従来どおり |

## 2. データ（migration 0039 / sp_*）

- `sp_tasks` — やること。staff_id/date/title/status(open|done)/source(manual|manager|genesis|ai)。RLS=テナント標準
- `sp_reports` — 日報・週報。type(daily|weekly)、dateは daily=当日 / weekly=**週の月曜**（`mondayOf()`で正規化）。(staff,type,date)でユニーク=再提出は上書き。RLS=テナント標準（社内共有が目的）
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
3. 日報週報のCEO AI要約 → Genesis日次レポートへ流入（sp_reports.ai_summary、人の本文は上書きしない）
4. 予約ソースの実接続（Reserve OSデプロイ後）
5. sp_links の管理UI（当面は execute_sql / 管理画面追加は必要になってから）
