# FRANK GOLF 予約システム（正典）

2026-07-27 に **予約台帳を1つに統合**しました（DECISIONS #93 / migration 0084）。
以前は予約システムが2つあり、会員のWeb予約に至っては入口が2つある状態でした。

---

## 1. 役割分担（これが基本）

| 誰が | どこで | 何を |
|---|---|---|
| **お客様** | 公式サイト **frankgolf.jp** | 体験・会員の打席予約・レッスン予約 |
| **スタッフ** | **member-os** `/reservations` | 電話/店頭予約の登録、来店確認、入金・未収金 |
| **お客様（店頭）** | member-os `/board/<token>` | ロビー掲示の当日カレンダー（見るだけ） |
| **会員本人** | member-os `/member` | 自分の予約の確認とキャンセル |

**お客様向けの予約フォームを member-os に作らないでください。** サイト側に集約しています。

### お客様の入口（サイト）

| ページ | 内容 |
|---|---|
| `trial-booking.html` | **体験**（無料・約55分）。日時を選ぶだけで即確定。打席は自動割当 |
| `booking.html` | **会員の打席予約**。会員番号＋電話下4桁でログインなし予約 |
| `lesson-booking.html` | **レッスン予約**。プロが公開した枠から選ぶ |

**ご入会は `/join-web`（member-os）に一本化しています（#120）。**
Web入会申込 → スタッフが `/frunk` で承認 → 会員番号（`F0001`…）を発行、という順です。
会員番号が出るまで打席・レッスンの予約はできません（`verifyMember` が `status` を見ます）。
会員ログイン（member-os `/member/login`）も**会員番号＋電話番号下4桁**で、booking.html と同じ鍵に揃えました。

---

## 2. 台帳（DB）

```
frunk_bays        打席マスタ（A/B/C/D）
frunk_bookings    ★予約はすべてここ★（会員・体験・都度・スタッフ登録）
mbr_trial_requests  体験の申込内容（お名前・ご要望・キャンセルトークン）
frunk_lesson_slots / frunk_lesson_bookings   レッスン
```

### frunk_bookings の「誰の予約か」

| customer_kind | 埋まる列 | 入口 |
|---|---|---|
| `member` | `member_id` | サイト booking.html ／ スタッフ登録 |
| `trial` | `trial_request_id` | サイト trial-booking.html |
| `dropin` | `guest_name` / `guest_phone` | スタッフが電話・店頭で登録 |

CHECK 制約で「3つのうちどれか必須」を強制しています。

### status（0084で拡張）

`confirmed`（予約）→ `visited`（来店）／ `no_show`（無断欠）／ `cancelled`（キャンセル）

**枠を占有するのは `cancelled` 以外**です。unique index `uq_frunk_booking_slot` も
`status <> 'cancelled'` で張ってあります。

> ⚠ コードで空き状況を出すときに `status = 'confirmed'` で絞らないでください。
> 来店済みにした瞬間に枠が空いて、二重予約が入ります。必ず `neq('status','cancelled')` です。

### 会計

`amount`（請求額）/ `paid_amount` / `payment_status`（unpaid・partial・paid・waived）/
`payment_method` / `paid_at`。無料体験や会員の通常利用は `amount = null`（請求なし）。

### 打席（frunk_bays）

| code | 名前 | 体験の割当順 | 備考 |
|---|---|---|---|
| `bay-a` | A打席（1F） | 1 | TrackMan 4 |
| `bay-b` | B打席（2F） | 2 | **左右打席**（`is_lefty=true`）。レフティはここのみ |
| `bay-c` | C打席（2F） | 3 | |
| `bay-d` | D打席（2F） | — | **未設営のため `active=false`**。設営後に true ＋ `trial_priority=4` |

---

## 3. 設定の変え方

営業時間・定休曜日・祝日・臨時休業・枠の刻み・何日先まで予約可 は
**Genesis の `/site-admin` → 予約設定**から変更できます（`gn_site_content.data.booking`・デプロイ不要）。

### オープン日ゲート（#97・2026-08-03）

`open_date`（2026-09-02）と `open_time`（10:00）を追加。**この日時より前の枠は
体験・打席・レッスンすべてで出ない**（businessHours が null を返す）。
オープン前でも「オープン日から advance_days 分」は先行予約できる（`bookableRange`）。
オープン当日は open_time 開始・閉店はその日の営業時間どおり。
枠は従来どおり閉店時刻を超えない（最終枠 = close − slot_minutes）。

### 特別営業日（#118）

`special_open_dates`（/site-admin → 予約設定 → 特別営業日）に日付を入れると、
**オープン前・定休曜日・臨時休業の指定より優先して**その日だけ予約を受け付ける（内覧会・体験会用）。
営業時間はその日の曜日どおり（土日祝なら weekend）。予約可能範囲もその日まで自動で前倒しされる。

### 確認メール・前日リマインダー（#118）

- 体験のWeb予約時、メールアドレスがあれば**確認メール**（キャンセルURLの控え）を送る。
- 毎朝6時の日次cronが**前日リマインダー**を送る（明日の体験＋会員の打席予約でメールがある人）。
- コード: `apps/genesis/src/lib/frank-mail.ts`（文面は frank-mail-pure.ts・tests/frank-pos.test.ts）。
- **env**: `RESEND_API_KEY` / `FRANK_MAIL_FROM`（Vercel: yozan-genesis）。未設定なら自動スキップ＝予約は通る。
  Resendで frankgolf.jp のドメイン認証が必要（OPERATIONS §14-3）。
- **Web入会申込の受付メール（#120）** — `/join-web` 送信時に申込者へ自動送信。
  コード: `apps/member-os/src/lib/frank-mail.ts`。**env は member-os 側にも必要**
  （`RESEND_API_KEY` / `FRANK_MAIL_FROM` を Vercel: member-os に設定。未設定なら送信スキップで申込は成立）。
  ⚠**承認時（会員番号の発行時）の通知は未実装**。当面は電話・LINEで会員番号を伝えてください。

### 店頭POS（Square・#118 / 実行計画§3-7）

- Square Webhook `/api/public/frank/pos/webhook` → `mon_sales`（source='square'・姫路セグメント）へ自動記録
  → `refresh_money_to_finance` で fin_entries／KPI／日次レポートへ。現金は現金出納にも自動反映。
- 返金はマイナスの売上行（category=返金）＋company_events に notice。
- 冪等: `detail->>square_payment_id` / `square_refund_id` で二重記録を防ぐ（Webhookは同一イベントが複数回届く）。
- コード: `apps/genesis/src/lib/frank-pos.ts`（純粋部は frank-pos-pure.ts）。
- **env**: `SQUARE_WEBHOOK_SIGNATURE_KEY` / `SQUARE_WEBHOOK_URL`（省略時は本番URL）。設定手順 OPERATIONS §14-2。

### 月会費の継続課金（Square・#123 / migration 0105。旧Stripe #97は廃止）

- 会員は booking.html の「カードで継続課金を登録する」→ `/api/public/frank/billing`
  → **Squareのサブスク決済ページ**（決済リンク・税込）でカード登録。以後毎月自動課金。
- 決済リンクは会員ごとにAPIで発行し、返ってきた注文IDを `frunk_members.square_checkout_order_id`
  に控える。**これがWebhookで初回決済と会員を結ぶ唯一の鍵**（Squareのリンク決済は顧客IDを事前指定できない）。
- Webhookは店頭POSと同じ `/api/public/frank/pos/webhook` の1本。payment イベントを自動で振り分ける:
  1. 注文IDが `square_checkout_order_id` に一致 → **初回の月会費**（billing_status='active'・
     `square_customer_id` を控える・payment_method='card'・company_events 記録）
  2. 顧客IDが `square_customer_id` に一致し金額がプランの税込月額と一致 → **継続の月会費**
  3. どちらでもない → 店頭売上（従来のPOS経路）
  月会費は mon_sales（姫路・category=月会費・source='square'）へ自動計上
  （payment idで冪等・refresh_money_to_finance まで実行）。
  会員が店頭で会員価格ドリンク等を買っても金額が違うので月会費と誤記録されない（tests/frank-pos.test.ts）。
- 決済失敗（payment FAILED・プラン額と一致）→ billing_status='past_due'＋company_events。
  subscription.updated の CANCELED/DEACTIVATED → 'canceled'＋company_events。
- プランとの対応は `frunk_plans.square_variation_id`（`scripts/frank-square-setup.mjs` が
  Square側にプラン5種・ドリンクメニュー24品・Webhook購読を自動作成して発行）。
- コード: `apps/genesis/src/lib/frank-square-billing.ts`（リンク発行）＋ `frank-pos.ts`（Webhook振り分け）。SDK不使用・fetch直。
- **必要env（Vercel: yozan-genesis）**: `SQUARE_ACCESS_TOKEN` / `SQUARE_LOCATION_ID` /
  `SQUARE_WEBHOOK_SIGNATURE_KEY` / `SQUARE_WEBHOOK_URL`（省略時は本番URL）。
  未設定の間はボタンを押すと「店頭でお手続きください」と案内される（エラーにしない）。
- 月会費0円のプラン（モニター会員）は登録不可として弾く。
- 入会承認時に member-os が承認メール（会員番号＋カード登録の案内）を送る（`buildApprovalMail`・Resend未設定ならスキップ）。
- 旧Stripe版 `frank-billing.ts` はテストモードのみで実課金ゼロ。Webhookの受け皿として残置（本番鍵は設定しない）。

この設定は **お客様側とスタッフ側の両方**が読みます（`@yozan/core/frank-booking`）。
片方だけ別の時間割にならないよう、ここ以外に営業時間を書かないでください。

---

## 4. コードの置き場所

| ファイル | 役割 |
|---|---|
| `packages/core/src/frank-booking.ts` | **正典**。営業時間判定・枠生成・会計ラベル・BookingCfg |
| `apps/genesis/src/lib/frank-booking.ts` | 会員の打席予約（プラン上限チェック） |
| `apps/genesis/src/lib/frank-trial.ts` | 体験のセルフ予約（打席の自動割当・キャンセルトークン） |
| `apps/genesis/src/lib/frank-lesson.ts` | レッスン |
| `apps/genesis/src/app/api/public/frank/*` | サイトが叩く公開API（CORS対応） |
| `apps/member-os/src/lib/frank-reservation.ts` | スタッフ画面が台帳を読む |
| `apps/shift-cloud/src/lib/store-dash.ts` | 店舗ダッシュボードの当日予約 |

---

## 5. 廃止したもの（使わないこと）

| 廃止 | 理由・代わり |
|---|---|
| `res_resources` / `res_bookings` | 台帳は `frunk_*` に統合（テーブルは残置・commentで明示） |
| `apps/member-os/src/lib/reservation.ts` | 空にした。`@yozan/core/frank-booking` を使う |
| member-os `/member/book` | サイト `booking.html` へリダイレクト |
| member-os `/member/register`（仮会員 `P########`） | **廃止（#120）**。`mbr_provisional_members` に作られる番号は `frunk_members` に無く、打席予約で必ず弾かれた。`/join-web` へリダイレクト |
| 会員ログインの「会員番号＋生年月日」 | **廃止（#120）**。`frunk_members` の「会員番号＋電話下4桁」に統一 |
| member-os `/book/[token]` | サイト `trial-booking.html` へリダイレクト |
| Web予約用トークンURLの発行 | 廃止。**掲示用（board）だけ**残っています |

> `res_services` / `res_requests`（0032）は **Reserve OS の別システム**です。こことは無関係なので消さないでください。
