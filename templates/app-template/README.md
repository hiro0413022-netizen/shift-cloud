# __APP_TITLE__

__DESC__

- 独立アプリ方式（入力面は独立 / GENESISは閲覧＋承認 / DBは共有）— DECISIONS #30/#33/#34の勝ちパターン
- 認可: `__PERMISSION__` または `view_hq`（DECISIONS #18）
- スキーマ接頭辞: `__PREFIX___*`（追加のみ・論理削除 #5・金額integer円/時間integer分 #4）
- 共通コード: `@yozan/core`（auth / kernel / supabase / middleware）
- デプロイ: OPERATIONS.md §「新アプリ デプロイ定型チェックリスト」（Root Directory=`apps/__APP_NAME__`）
- 稼働開始時に `vault_systems` へ登録（#26。パスワードはページ上でユーザーが入力）

設計の正典は `docs/modules/__APP_NAME__/SYSTEM.md` を作成して置くこと（MODULE_TEMPLATE.md参照）。
