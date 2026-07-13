# Lesson OS — スイング動画・コーチコメント管理（WING NOTE代替）

作成: 2026-07-13（DECISIONS #49 / migration 0041適用済）。
目的: WING NOTE（外部サービス）で行っているレッスンカルテを自社化し、**動画・コメント・計測データ（Trackman）を1人の生徒に紐づけて蓄積**する。SaaS販売（SAAS_PLAN.md）の商品構成にも入る。

## 1. 方針

- **独立アプリ** `apps/lesson-os`（member-os等と同型: DB共有・別Vercel・権限 use_lesson | view_hq）
- 動画は**署名付きアップロードURLでブラウザ→Storage直PUT**（Vercelの4.5MB上限を回避。資料室と同方式）
- Storageキーは日本語不可 → base64urlエンコード（genesis lib/libkey.tsと同方式）
- 生徒は `lsn_students`（独自台帳）。**Smart Hello会員番号（member_code）で会員名簿と疎結合** — FKで縛らない（member-os/Smart Hello取込と将来突合）
- Trackmanは `lsn_measurements`（JSONB）が受け口。フェーズ3でCSV取込→動画への紐づけUI

## 2. データ（0041 / lsn_*）

| テーブル | 内容 |
|---|---|
| lsn_students | 生徒台帳（name/kana/member_code/store/memo/status） |
| lsn_videos | スイング動画（storage_path/title/shot_at/club/note/uploaded_by） |
| lsn_comments | コーチコメント（video_id/coach_staff_id/body） |
| lsn_measurements | 計測データ（source=trackman/manual、data JSONB、video_id任意） |

Storage: `lesson-videos`（プライベート・service_role専用）。キー: `{company}/{student_id}/{ts}_{enc(ファイル名)}`

## 3. 画面（フェーズ1）

- `/` 生徒一覧（検索・追加）
- `/students/[id]` 生徒カルテ = 動画タイムライン（新しい順）＋各動画にコメントスレッド＋動画アップロード（撮影日・クラブ・メモ）
- 動画再生は署名URL（60秒）で `<video>` 直再生
- `/login` ＋ /manual（RUNBOOK配信・他アプリと同方式）

## 4. 他機能との連携

- **会員**: member_code（Smart Hello番号）で会員名簿と突合（フェーズ2で自動リンク）
- **KPI**: レッスン実施数・動画数・コメント率 → `refresh_lesson_kpis()`（フェーズ2）→ CEO日次レポート
- **スタッフ**: コーチ=staff（employment_type=lesson_pro）。コメント者はstaff参照
- **スタッフポータル**: 生徒ページのクイックリンク掲示（sp_links）
- **アンケート**: Survey OSのWING NOTE満足度の受け皿（乗換の判断材料）
- **AI（フェーズ3）**: レッスンAI = コメント下書き・上達サマリー・Trackmanデータの傾向分析（VISION §4）

## 5. フェーズ

1. **P1（次の実装）**: apps/lesson-os 新設 — 生徒台帳・動画アップロード/再生・コメント。Vercelプロジェクト`lesson-os`（Root=apps/lesson-os・env3つ・hnd1）
2. **P2**: 生徒本人への共有リンク（トークンURL・本人は自分の動画とコメントだけ閲覧=WING NOTEの生徒側体験）・会員名簿突合・KPI接続
3. **P3**: Trackman CSV取込（lsn_measurements）→動画紐づけ・レッスンAI

## 6. 注意（運用前に確認）

- Supabase Storageの**1ファイル上限は既定50MB**。スマホ撮影のスイング動画（10〜30秒）なら概ね収まるが、長尺を扱うなら Supabaseダッシュボード→Storage→Settings で上限引き上げ（ユーザー作業）
- 動画は個人情報。バケットはprivate・署名URLのみ（公開リンクは作らない）。生徒本人共有はP2のトークン方式で
- WING NOTEからの過去データ移出は、エクスポート機能の有無を要確認（無ければ新規蓄積で開始）
