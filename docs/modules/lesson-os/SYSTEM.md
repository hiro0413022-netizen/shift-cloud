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

1. **P1（2026-07-13実装済）**: apps/lesson-os 新設 — 生徒台帳・動画アップロード/再生・コメント。Vercelプロジェクト`lesson-os`（Root=apps/lesson-os・env3つ・hnd1）
2. **P2（2026-07-13実装済・PGA NOTE準拠の大型アップデート / DECISIONS #50・0043適用済）**: 
   - UI刷新（紺ヘッダ×ダーク×金=PGA NOTEコーチアプリ準拠、生徒ページは青×白=ユーザーアプリ準拠）
   - 生徒: 顔写真・基本情報/詳細情報（JSONB・PGA NOTE同項目）・カードグリッド一覧
   - カルテのタブ化: 本日のレッスン／進捗（9項目スライダー＋レーダー）／基本情報／詳細情報／比較再生
   - 動画: クラブ・飛距離登録、**描画ツール（直線/円/フリーハンド・4色・保存=annotations JSONB）**、**ガイド線プリセット（スイングプレーン/前傾）**、コマ送り・スロー再生
   - **比較再生**（過去vs現在／生徒vsお手本、同時再生・速度同期）
   - **お手本スイング**（/models、コーチ見本動画）
   - **生徒共有リンク**（/s/[token]・アプリ不要・LINEで送れる・停止/再発行可）
   - **CSVエクスポート**（/api/export、lessons/students）
   - 残: 会員名簿突合・KPI接続（P2b）
3. **P3**: Trackman CSV取込（lsn_measurements）→動画紐づけ・レッスンAI

## 6. WING NOTE実機調査と改善方針（2026-07-13、ログイン済みChromeで確認）

WING NOTEの機能: 生徒台帳（顔写真・五十音・245人・検索）／グループレッスン（最大5人選択→開始）／本日のレッスン（スイング撮影・ベストスイング・コメント**必須**・レッスン目標と達成度%）／基本情報（生年月日・身長・利き手・学習スタイル）／詳細情報（HS・飛距離・球筋・スコア・ゴルフ歴）／過去のレッスン履歴。

| WING NOTEの弱み | Lesson OSの改善 |
|---|---|
| **データ輸出不可**（過去データが人質） | エクスポートを標準装備（P2でCSV/一括。設計上いつでも可能） |
| 登録が重い（顔写真・多項目前提） | **名前だけで生徒登録できる**。詳細は後から |
| タブレットアプリ的（「アプリ終了」「更新」ボタン、同期が手動くさい） | Web標準・スマホ即応・保存すれば即反映 |
| 計測データ連携なし | lsn_measurements（Trackman受け口）を最初から装備 |
| 会員・売上・KPIと孤立 | member_codeで会員名簿と接続、GENESIS KPIへ（P2） |
| コメントがコーチの文章力頼み | **GOLF WING Finder（自社の診断ナレッジ）と連携**（下記） |
| 生徒への共有が生徒アプリ前提 | P2の共有リンク（アプリ不要・LINEで送れるURL） |

**GOLF WING Finder連携（P2）**: Finder=症状（スライス等25件）→確認優先度順の原因切り分け→「お客様への説明（コピーOK）」を持つ診断ナレッジ。Lesson OSのコメント欄に「Finderから挿入」ボタンを付け、症状を選ぶと説明文がコメント下書きに入る＝**コーチコメントの質を均一化**。Finder側はデータをlsn_kb_*として取り込むか、現行サイトへのリンク＋コピペ運用から開始。

## 7. 注意（運用前に確認）

- Supabase Storageの**1ファイル上限は既定50MB**。スマホ撮影のスイング動画（10〜30秒）なら概ね収まるが、長尺を扱うなら Supabaseダッシュボード→Storage→Settings で上限引き上げ（ユーザー作業）
- 動画は個人情報。バケットはprivate・署名URLのみ（公開リンクは作らない）。生徒本人共有はP2のトークン方式で
- WING NOTEからの過去データ移出は、エクスポート機能の有無を要確認（無ければ新規蓄積で開始）
