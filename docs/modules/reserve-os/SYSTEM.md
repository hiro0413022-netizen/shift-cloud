# Reserve OS（予約OS）

ビジター向けの**申込型予約**アプリ。第一弾は **GOLF WING シャフトフィッティング**。
member-os / legal-os / money-os / survey-os と同型（入力面は独立アプリ、DBは共有、GENESISは閲覧/承認）。

- 独立アプリ: `apps/reserve-os`（Next.js 15 / App Router / Tailwind v4）別Vercelプロジェクト想定
- DB: 共有Supabase `qrgpblnnhdudigarrtuz`。migration `0032_reserve_os.sql`（本番適用済 2026-07-09、MCP name=`reserve_os`）
- 正典: 本ファイル。決定は DECISIONS #34

## 1. コンセプト（既存 res_bookings との違い）

既存 `res_bookings`（0020, 姫路FRUNK）は「即時に空き枠を選んで確定する」予約。
Reserve OS は **「第3希望まで＋事前ヒアリングを送信 → スタッフが目視で確定」** の申込モデル。
GOLF WINGは、対応可能なスタッフの有無・フィッティング枠の重複をスタッフが人的に確認して確定するため、
お客様に日時を即確定させず、**候補日時3つ（必須）** を受け取り、スタッフが確定を返す運用。

## 2. データモデル（`res_*`）

- `res_services` … サービスカタログ。公開ページのメニュー・料金・導入文を駆動。
  - `slug`（公開URL `/reserve/<slug>`）, `category`（shaft_fitting / club_fitting / trial_lesson / other）,
    `name` `summary` `target_clubs` `duration_min` `price` `price_note` `lead_text` `active` `sort_order`
  - → **他サービス流用**は行を追加するだけ（体験レッスン等）。
- `res_requests` … 予約申込1件。
  - お客様: `name` `name_kana` `phone` `email` `handedness` `age` `avg_score`
  - 希望日時: `pref1_at` `pref2_at` `pref3_at`（第3希望まで・timestamptz・UTC保存/JST表示）
  - ヒアリング（任意）: `head_speed` `golf_experience` `club_maker/model/shaft/flex`
    `concern` `improvement` `target_distance` `bring_clubs` `other_notes`、将来拡張は `intake` jsonb
  - 運用: `status`（pending→confirmed / declined / canceled / completed）,
    `confirmed_at` `confirmed_slot` `staff_note` `source`(web/line/staff)
    `notified_at`(スタッフ通知済) `ack_sent_at`(顧客確認/確定済) `handled_by`
- 標準準拠: 共通カラム・RLS（`app.current_company_id()`）・`set_updated_at`・論理削除。
  公開insertは **service_role 経由**（RLS対象外）で行う。

## 3. 画面

### 公開（お客様・認証不要 / 公式LINEから）
`/reserve/[slug]`（例: `/reserve/shaft-fitting`）。スマホ最適・GOLF WING高級感（白×ディープグリーン×ゴールド）。
- ① シャフトフィッティングとは ② メニュー・料金 ③ 当日の流れ（7ステップ）
- ④ 事前ヒアリング（予約フォーム） ⑤ 注意事項 ⑥ FAQ ⑦ 送信完了画面（`?done=1`）
- 必須: 氏名/ふりがな/電話/メール/希望日時×3/利き手/年齢/平均スコア＋注意事項同意。
  それ以外は任意（**離脱率を下げるため必須を最小化**）。

### スタッフ（`use_reception` または `view_hq`・共有ロール）
- `/login`（Shift Cloud等と共通のログインID/擬似メール方式）
- `/`（申込一覧・確認待ち優先・ステータスタブ・CSV書き出し）
- `/requests/[id]`（詳細＝ヒアリング全項目・候補日時から確定/別日時調整・確定メール送信・見送り/完了/キャンセル・社内メモ・電話/メール返信リンク）
- `/api/requests-export`（CSV・UTF-8 BOM・スプレッドシート取込用）

## 4. メール（`src/lib/mail.ts` — 汎用設計）

Resend（`fetch` 直叩き、SDK不要）。送信は `sendEmail()` に集約し、全社トランザクションメールに流用可能。
env: `RESEND_API_KEY` / `RESERVE_FROM_EMAIL`(YOZAN) / `RESERVE_STAFF_EMAIL`(GOLF WING) / `NEXT_PUBLIC_SITE_URL`。

**フロー（ユーザー指定）**
1. 申込 → `notifyStaffNewRequest`：**YOZANアドレスから → GOLF WINGアドレス**へ全内容を通知（`reply_to`=お客様）。スタッフはこのメールに返信すればお客様へ届く。
2. 申込 → `ackCustomer`：お客様へ受付確認（`reply_to`=GOLF WING）。
3. 確定 → `sendConfirmation`（管理画面から任意送信）：お客様へ確定日時連絡（`reply_to`=GOLF WING）。
- API未設定時は送信をスキップし申込自体は成功（開発時も落ちない）。
- `notifyLine()` は **Phase後続**のフック（DECISIONS #29 の n8n 統合ハブ経由でLINE通知を差し込む）。

## 5. 未実装 / 次段

- LINE通知（⑦の「公式LINEへ通知」）… n8n/Messaging API 整備後に `notifyLine()` 実装。
- サービスカタログ編集GUI（現状はseed/AI/SQLで追加）。体験レッスン等の追加は行追加で対応。
- Googleスプレッドシート自動同期（現状はCSV書き出しで代替。必要時に追加）。
- 予約枠カレンダー/在庫管理（申込型のため現状は人的確認。将来 res_bookings と統合可）。
