# Survey OS — アンケート/情報収集システム（設計の正典）

DECISIONS #32（別途採番）と同型の「入力面は独立アプリ、GENESISは閲覧+承認」パターン。
member-os / legal-os / money-os の勝ちパターンを踏襲。DB共有（Supabase `qrgpblnnhdudigarrtuz`）。

## 1. 目的・位置づけ

- GOLF WING会員向けアンケート（第1弾）を皮切りに、**汎用アンケート/情報収集基盤**を提供する。
- Googleフォームで不可能な要件（**コーチのドラッグ&ドロップ順位付け**、受講経験による設問の出し分け、
  ボルダ得点＋平均順位の自動集計）に対応。
- GOLF WINGアンケートの目的: (1)コーチ別レッスンスキルの可視化 (2)業務態度の改善
  (3)WING NOTEの利用状況・満足度・改善点の把握 (4)会員満足度向上・退会防止。

## 2. アーキテクチャ

- `apps/survey-os`（Next.js 15 App Router）を新Vercelプロジェクト `survey-os` で運用。
- 公開回答（匿名）は **slug + status='open' を検証して service_role で書き込み**（member-osのトークン方式と同型・トークンレス）。
- 管理画面は `requireSurveyActor()`（`view_hq` または `use_survey`）でガード。
- 自動化: 回答が10件到達ごとに `company_events`（`event_type='survey_milestone'`）へ記録 → GENESISの活動ログ/CEO AIが拾える。

## 3. データモデル（migration 0030_survey_os）

| テーブル | 役割 |
|---|---|
| `svy_surveys` | アンケート定義（slug/status/匿名/イントロ/お礼/期間/回答数キャッシュ） |
| `svy_questions` | 設問（type/options/config、section・position・code） |
| `svy_responses` | 1回答（匿名・不変、client_keyで緩い重複防止） |
| `svy_answers` | 設問ごとの回答値（value jsonb、question_codeスナップショット） |

設問タイプ: `single` / `multi` / `text` / `textarea` / `ranking` / `scale`。
- `multi` の `config.is_ranking_source=true` … 順位付けの母集団になる選択（例: 受講経験のあるコーチ）
- `ranking` の `config.source_code` … 上記設問で選んだ項目のみを並び替え対象にする。`config.pool` に全候補。
- 回答値 jsonb 例: single `{"value":"male"}` / multi `{"values":[...],"other":"..."}` /
  text `{"text":"..."}` / ranking `{"order":["furukawa","enomoto"]}` / scale `{"value":4}`

RLS/トリガー/論理削除は既存標準（DECISIONS #11/#16/#17）に準拠。

## 4. 集計ロジック（`src/lib/survey.ts`）

順位付けは**両方式**を算出（分析設計方針）:
- **ボルダ平均（0–100, 高いほど良い）**: 長さ n の回答で位置 i（0始まり）に `(n-i)/n` 点 → 1位=1.0。
  回答ごとに評価コーチ数が異なっても公平に比較できる（正規化）。表示は×100。
- **平均順位（小さいほど良い）** / 1位回数 / 1位率 / 評価数。

集計画面（`/[surveyId]/results`）:
- コーチ総合ランキング（全13設問のボルダ平均）
- 強み・弱みヒートマップ（コーチ×設問のボルダ平均、緑=高評価/赤=要改善）
- 設問別の内訳（選択肢集計バー、自由記述一覧、順位付けテーブル）

CSV（`/api/export/[surveyId]`）:
- `type=wide` … 1回答=1行（列=設問、ラベル解決済み・匿名: 通し番号のみ）
- `type=coach` … 設問×コーチのボルダ平均/平均順位/1位/評価数 ＋ 総合

## 5. GOLF WINGアンケート（migration 0031, slug=`golfwing-2026`）

- 全26設問（回答者情報 / WING NOTE / コーチ評価13順位＋改善記述 / イベント・ご意見）。
- 評価対象コーチ: 古川博庸・井殿康和・榎本剛志・安東茉優・春馬凡夫（小川うららは対象外）。
- 公開URL: `https://survey-os.vercel.app/s/golfwing-2026`（QRは管理一覧に自動表示）。匿名・所要3〜5分。

## 6. アンケートビルダー（項目編集画面）✅実装済

`/[surveyId]/edit`（`editor.tsx` + `edit/actions.ts`）。ログインは管理と同じ `view_hq`/`use_survey`。
- **設問**: 追加 / 編集（設問文・補足・必須・型・選択肢）/ 削除（論理削除）。設問は**1行に折りたたみ表示**、クリックで展開して編集。
- **並び替え**: 行の `⠿` を**ドラッグ&ドロップ**、または ▲▼。ドロップ時に `reorderQuestions` が position を1..n で一括保存（自動保存）。
- **削除の復元**: 編集画面下部の「削除した設問」欄に削除済み設問を一覧表示。「復元」で末尾に戻る（コード重複時は `_2` を自動付与）。「完全削除」は**回答が1件もない場合のみ**可（`purgeQuestion`）。
- **型変更**: single/multi/text/textarea/ranking/scale。選択肢は表示名を編集（内部valueは自動採番＝既存回答を壊さない）。
- **複数選択**: 「その他」自由記述許可 / 「順位付けの母集団にする」フラグ。
- **順位付け**: 候補（pool）を編集し、連動する複数選択設問（source_code）を選ぶと受講者だけを並び替え対象に。
- **アンケート設定**: タイトル/説明/slug/公開状態(下書き・公開・終了)/匿名/冒頭文/お礼文/想定時間。
- **新規作成**: 一覧の「＋新規アンケート」→ 空アンケートを作成し編集画面へ。
- 変更は `audit_logs`（survey.update/create、question.create/update/delete/reorder/restore/purge）に記録。

## 7. 今後（フェーズ3）

- 条件分岐（設問の表示条件）、複数言語、回答途中保存。
- KPI接続（回答率・WING NOTE満足度スコア等を `kpis` へ自動集計）。
- n8n連携（回答をトリガーにフォロー/通知、SNS配信原稿へ反映）。
