# Legal OS — 契約・法務管理（独立アプリ）

契約書・覚書・規約・NDAの保管と期限管理。**GENESIS外の独立アプリ**（古川さん以外もログイン）。
設計正典: `docs/modules/legal-os/SYSTEM.md`。DBは共有（Supabase `qrgpblnnhdudigarrtuz`、`leg_*` テーブル + Storage `legal-docs`）。

## 役割（leg_grants）
- `uploader` — アップロード・下書き登録
- `manager` — 全社契約の管理・期限設定・ステータス更新
- `viewer` — 閲覧のみ

権限は Shift Cloud のロール（`permissions.use_legal` / `view_hq`）＋ `leg_grants` で解決。
`view_hq` 保持者（古川さん）は自動で manager 扱い。締結・更新・解約の正式承認は GENESIS 側（approval_requests）。

## 画面
- `/` ダッシュボード（期限90日以内 / 自動更新 / 高リスク / 件数）
- `/documents` 契約一覧（種別・状態・検索フィルタ）
- `/documents/new` 登録（メタ入力＋ファイルアップロード）
- `/documents/[id]` 詳細（情報・要点・リマインダー・ファイル・ステータス変更）
- `/api/file/[id]` ファイル閲覧（60秒の署名付きURLへリダイレクト）

## API（`/api/v1`）
Bearer トークン（`LEGAL_API_TOKEN`）認証。legal_ai / CEO AI / バッチ用。
- `GET /api/v1/documents?status=&doc_type=` — 契約一覧（JSON）
- `POST /api/v1/documents` — 契約をメタ登録（`{title, doc_type, counterparty, effective_date, expiry_date, auto_renew, renewal_notice_days, summary}`）

## セットアップ
1. Vercel に新規プロジェクトを作成（Root Directory = `apps/legal-os`）
2. `.env.example` の環境変数を設定
3. デプロイ後、`vault_systems` に登録（Vaultルール準拠）
4. スタッフに `use_legal` 権限 or `leg_grants` を付与
