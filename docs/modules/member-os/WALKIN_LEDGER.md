# 一時利用者名簿（GOLF WING 宝塚）設計 — member-os

現行の「紙申込書 → スタッフがExcelに手入力」を、タブレット自己入力＋CEO AI管理に置き換える。
対象は GOLF WING 宝塚の**一時利用顧客**（会員以外）。予約・会員本体は Smart Hello が正のまま（DECISIONS #22/#24/#27）。

出典: 現行ファイル「（新）一時利用者名簿.xlsx」実解析（2026-07-06、台帳シート57列・約2,415行、2019年〜）。

## 確定事項（2026-07-06、ユーザー決定 → DECISIONS #28）
1. **利用区分**（5値・固定）: 体験利用 / フィッティング / 打席利用 / ビジター打席 / その他
2. **Excel出力**: 「一時利用顧客名簿」シートのみ現行同一フォーマットで出力。会員数等の集計タブは作らない（会員系はCEO AI側で扱う）。
3. **会員系レポート**: Smart Hello の CSV/Excel エクスポート → Genesis取込で自動化（財務#21・SMART_HELLO_IMPORT #22 と同型。本台帳とは別系統）。
4. **既存データ**: 現行台帳の約2,415行を新システムへ移行（履歴として）。

## 台帳シート列マッピング（A〜X＝実データ、Y〜BE＝入力選択肢マスタ）

実際に1レコードに入る項目は A〜X。Y〜BE はドロップダウンの候補リスト（0%＝データではなく選択肢マスタ）なので、DBの列ではなく**選択肢設定**として扱う。

| 列 | 見出し | DBフィールド | 入力者 | 備考 |
|---|---|---|---|---|
| A | 日付 | visited_on (date) | スタッフ/自動 | 受付日。既定=当日 |
| B | 利用区分 | visit_type (enum) | お客様選択 | 体験/フィッティング/打席/ビジター/その他 |
| C | 名前 | name | お客様 | 必須 |
| D | フリガナ | name_kana | お客様 | 自動フリガナ補助 |
| E | 生年月日 | birth_date | お客様 | |
| F | 性別 | gender | お客様 | 男/女/無回答 |
| G | 郵便番号 | postal_code | お客様 | →住所自動補完 |
| H | 住所 | address | お客様 | |
| I | お店までの距離 | distance_km (num) | 自動/任意 | 郵便番号から概算も可。現行は表記ゆれ(2.8 / 14.4km) |
| J | 電話番号 | phone | お客様 | 必須 |
| K | email | email | お客様 | |
| L | 職業 | occupation | お客様 | 選択式 |
| M | 連絡方法 | contact_method | お客様 | 電話/SMS/LINE/メール |
| N | 利用料 | fee (int) | スタッフ | |
| O | 割引 | discount | スタッフ | 公式LINE/社長紹介/ロータリー/再来/チラシ 等 |
| P | 再来の場合日付 | repeat_date | スタッフ | |
| Q | 支払い方法 | payment_method | スタッフ | 店頭/WEB/無料キャンペーン |
| R | 担当プロ | pro_staff | スタッフ | |
| S | 担当受付 | reception_staff | スタッフ | 既定=ログインスタッフ |
| T | 成約（入会/購入） | result | スタッフ | 入会/購入/なし |
| U | 再アプローチ日 | reapproach_date | スタッフ | フォロー管理 |
| V | 備考 | note | スタッフ | |
| W | 何で知ったか | referral_source | お客様 | 選択式（流入経路） |
| X | 何で知ったか(その他) | referral_source_other | お客様 | 自由記述 |

アンケート系（利用区分により出し分け・任意）は survey(JSONB) に格納し、出力時は現行の該当列（フィッティング理由/体験理由/通う目的/入会興味/体験後コメント）へ展開：
- fitting_reasons[]（Y〜AD 候補）: 天候に左右されない練習環境 / トラックマン等計測設備 / シャフトの種類 / シミュレーション / PGAプロ在籍 / その他…
- trial_reasons[]（AF〜AK 候補）
- school_goals[]（AL〜AN 候補）: 飛距離 / スコアアップ / 理論理解 / 健康 / 気軽に練習 …
- interest_join（AO）: 有/無/検討中
- follow_comment（AP 体験後コメント・フォロー状況）
- joined_from_trial（AQ 体験からの入会）

選択肢マスタ（Y〜BE の候補値）は seed 設定として保持し、フォームのドロップダウンと出力の整合を取る。

## データモデル（migration 追加のみ・既存標準準拠 #11/#17）

### `mbr_walkin_visits`（一時利用の来店1件＝1行）
company_id / store_id / visited_on / visit_type(enum) / fee / discount / payment_method / pro_staff / reception_staff(FK staff) / result(enum: join/purchase/none) / repeat_date / reapproach_date / note / referral_source / referral_source_other / survey(jsonb) / guest_id(FK mbr_guests) / consent_at / signature / created_by / timestamps / deleted_at

顧客個人情報は既存 `mbr_guests`（氏名/カナ/生年月日/性別/住所/電話/email/職業/連絡方法）を再利用し、RLSで保護（給与系と同等 #3/#11）。

visit_type enum: `trial`(体験利用) / `fitting`(フィッティング) / `bay`(打席利用) / `visitor_bay`(ビジター打席) / `other`(その他)。
result enum: `join`(入会) / `purchase`(購入) / `none`。

KPI: 体験→入会率 = trial のうち result=join ÷ trial件数。フィッティング→購入率 = fitting のうち result=purchase ÷ fitting件数。利用区分別件数・流入経路も集計。`refresh_member_kpis` を拡張し Genesis へ流入。

## タブレット自己入力フロー（予約起点なし）
- 店頭常設タブレットに**店舗固定の受付URL/QR**（予約作成不要・HQ認証不要の公開ルート）。
- お客様: 利用区分を選ぶ → 個人情報＋アンケート（区分により出し分け）→ 同意チェック＋電子サイン → 送信。
- スタッフ: 台帳一覧から当該来店を開き、利用料/割引/支払/担当プロ/成約/フォローを追記。
- いたずら防止: 店舗トークン＋送信レート制限＋スタッフ側で当日分を確認・確定。

## Excel出力（現行同一）
- 「一時利用顧客名簿」1シートを、現行の列順（A〜X＋選択肢マスタ列）で生成。期間・利用区分でフィルタ出力可。
- 会員数・会費等の集計タブは出力しない（決定#2）。会員系はSmart Hello取込＋CEO AI。

## 既存データ移行
- 現行xlsxの台帳2,415行をパースし mbr_guests / mbr_walkin_visits へ投入（履歴フラグ付き）。
- 表記ゆれ正規化（距離"14.4km"→14.4、日付シリアル、区分の名寄せ）。移行は一度きりのスクリプト＋検証。

## 会員系レポート（別系統・Smart Hello取込）
SMART_HELLO_IMPORT.md（#22）に従い、会員名簿・予約一覧のCSV/Excelを取込→会員数/入会/退会/会費KPIをCEO AIへ。本台帳（一時利用）とは独立。

## 段階リリース
- **Phase A**: DBスキーマ（migration）＋ `refresh_member_kpis` 拡張。
- **Phase B**: タブレット自己入力（区分出し分け・同意・サイン）＋ スタッフ台帳一覧・追記。← 紙/手入力を廃止できる本丸。
- **Phase C**: Excel出力（名簿シート同一）。
- **Phase D**: 既存2,415行の移行。
- **Phase E**: Smart Hello 会員レポート取込（会員数/会費/退会）。

## 未決（実装時に確認）
- 職業・割引・流入経路・アンケートの確定選択肢（現行値を初期セットに採用予定）。
- 電子サインの保存形式（dataURL画像/同意ログ）と保管期間。
- 距離の自動算出可否（郵便番号→概算 or 手入力）。
- 常設タブレットの端末運用（店舗共有端末・オフライン時）。
