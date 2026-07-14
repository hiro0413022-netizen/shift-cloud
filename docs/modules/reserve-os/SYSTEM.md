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
- `/`（申込一覧・確認待ち優先・ステータスタブ・CSV書き出し・**公開URLのコピー**＝公式LINEに貼る用 / `public-links.tsx`）
- `/requests/[id]`（詳細＝ヒアリング全項目・候補日時から確定/別日時調整・確定メール送信・見送り/完了/キャンセル・社内メモ・電話/メール返信リンク）
- `/api/requests-export`（CSV・UTF-8 BOM・スプレッドシート取込用）

## 3.5 スタッフへの一次導線＝シフトアプリの「やること」（DECISIONS #55）

**現行の正規フロー（メール/LINEの自動通知はまだ効かせない）**

1. お客様が `/reserve/shaft-fitting` から申込
2. Reserve OS が **Shift Cloud の `sp_tasks` に店舗共通タスクを1件作る**（`src/lib/staff-task.ts`）
   - `staff_id = null` ＋ `store_id = GOLF WING 宝塚` ＝ **店の全員のやることリストに出る**（migration 0050 で `staff_id` をNULL許容化）
   - `date` = 申込を受けた日（＝当日の「今日のやること」に出る）、`source='reserve'`、`sort=-10`（上に出す）
   - `note` に 第1〜3希望・電話・メール・管理画面URL。`ref_type='reserve_request'` / `ref_id` で申込に緩く紐付く（FKは張らない）
   - 同一申込からの二重作成は `idx_sp_tasks_ref` のユニーク制約で防ぐ
3. スタッフがシフトアプリ（ホーム / カレンダー）でタスクを見る → 日程・空き枠を確認
4. **GOLF WING のメールアドレスから、お客様へ手動で返信**（当面ここは人力）
5. Reserve OS で確定/見送り/完了/キャンセル操作 → `closeStaffTask()` が該当タスクを `done` にする（`done_by`/`done_at` に誰が対応したか記録）
   - 誰か1人が完了にすれば全員のリストから消える

**次回やること**: メール自動送信（`RESERVE_STAFF_EMAIL` 未設定）と LINE通知（`notifyLine()` は no-op、n8n Webhook 経由で実装予定）。

## 3.6 Genesis からの閲覧（`/reserve`）

役員向けに `apps/genesis/src/app/(main)/reserve/page.tsx` を新設（閲覧専用）。
申込累計 / 確認待ち / 確定 / 来店完了 のKPI、**24時間以上 未対応の申込**（折り返しの滞留検知）、申込一覧。
各行から Reserve OS の詳細画面（`NEXT_PUBLIC_RESERVE_OS_URL`、既定 `https://shift-cloud-reserve-os.vercel.app`）へ遷移。

## 3.7 LINE中心の連絡（DECISIONS #56）

**なぜ**: `@golfwing.jp` のDNS/メール設定は本社ファインの管理で触れず、Resendの独自ドメイン認証も転送設定も現実的でない。
一方お客様は公式LINEから来る。→ **お客様への連絡はLINEを主導線、メールは予備**にする。

**しくみ**

1. 公開フォームを **LIFF（LINE内ブラウザ）** で開く（`src/lib/use-liff.ts`）。`NEXT_PUBLIC_LIFF_ID` があればLIFF SDKを読み、`liff.getProfile()` で **userId** を取得して hidden で送信。
   - LINE外（PCブラウザ等）・LIFF ID未設定・SDK失敗 → すべて「LINEなし」に倒し、**フォームは必ず動く**（メール運用にフォールバック）
2. `res_requests.line_user_id` に保存（0051）。**LINE連携時は email を任意**にし、`source='line'` で記録。
   - `res_requests_contact_check` で「LINE か メール のどちらかは必須」を担保
3. **n8n ワークフロー「予約LINE通知 (受付確認・確定連絡)」**（`Uzh20mKD3UXuQGsS`）が5分おきにポーリングし Push:
   - `status=pending` かつ `line_ack_sent_at is null` → **受付確認**（希望日時3つを添えて）
   - `status=confirmed` かつ `line_confirm_sent_at is null` → **確定連絡**（確定日時＋`confirm_message`）
   - 送信済みは `line_ack_sent_at` / `line_confirm_sent_at` に記録（二重送信防止）、失敗理由は `line_error`
   - トークンは n8n Data table `app_config` の `LINE_CHANNEL_ACCESS_TOKEN`（既存のLINE返信送信と共通）
4. スタッフは Reserve OS で日時を選んで **確定するだけ**（メール送信の操作は不要）。日程変更で再確定すると `line_confirm_sent_at` がクリアされ、新しい日時が再送される。
5. お客様からの変更・質問はLINEトークに来る → 既存の「LINE→CEO Inbox」で受信済み。

**セットアップ（ユーザー作業）**

- LINE Developers: **LINEログインチャネル**（Messaging APIと同一プロバイダー＝YOZAN）を作り、LIFFアプリを追加
  - ⚠ LIFFはMessaging APIチャネルには作れない。**同一プロバイダー**でないと userId が公式アカウントのものと一致せずPushできない
  - サイズ Full / エンドポイント `https://shift-cloud-reserve-os.vercel.app/reserve/shaft-fitting` / スコープ profile / ボットリンク On
- Vercel(reserve-os) の env に `NEXT_PUBLIC_LIFF_ID` を設定
- n8n: `app_config` に `LINE_CHANNEL_ACCESS_TOKEN` を登録し、ワークフローを Activate
- 公式LINEのリッチメニューに **LIFF URL**（`https://liff.line.me/<LIFF ID>`）を掲出（※通常のURLを貼るとuserIdが取れない）

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
