# Survey OS（アンケート / 情報収集）

GENESISの独立アプリ（member-os / legal-os / money-os と同型）。DB共有（Supabase `qrgpblnnhdudigarrtuz`）。

- 公開回答サイト（匿名・トークンレス）: `/s/[slug]`
- 管理（要ログイン: `view_hq` または `use_survey`）: 一覧 `/`、集計 `/[surveyId]/results`、CSV `/api/export/[surveyId]?type=wide|coach`
- 対応設問: 単一選択 / 複数選択（その他自由記述付き）/ 短文 / 自由記述 / **順位付け（ドラッグ&ドロップ＋▲▼）** / スケール
- 順位付けは「受講経験のあるコーチのみ」を並び替え対象にできる（`multi` の `is_ranking_source` → `ranking` の `source_code` で連動）

## ローカル起動

```bash
npm install                 # ルートで（qrcode 追加のため要再インストール）
npm run dev -w apps/survey-os   # http://localhost:3003
```

## 環境変数

`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`（既存と同値）。
`NEXT_PUBLIC_SURVEY_ORIGIN`（任意）: QR/公開URLの生成元。未設定時はリクエストのホストを使用。

## スキーマ

`svy_surveys` / `svy_questions` / `svy_answers` / `svy_responses`（migration `0030_survey_os`）。
GOLF WINGアンケートは `0031_survey_golfwing_seed`（slug=`golfwing-2026`）。

設計の正典: `docs/modules/survey-os/SYSTEM.md`。
