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
| member-os `/book/[token]` | サイト `trial-booking.html` へリダイレクト |
| Web予約用トークンURLの発行 | 廃止。**掲示用（board）だけ**残っています |

> `res_services` / `res_requests`（0032）は **Reserve OS の別システム**です。こことは無関係なので消さないでください。
