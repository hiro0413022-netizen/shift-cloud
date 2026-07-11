# Caddy OS

キャディ派遣の派遣管理・売上/委託料・収支

- 独立アプリ方式（入力面は独立 / GENESISは閲覧＋承認 / DBは共有）— DECISIONS #30/#33/#34の勝ちパターン
- 認可: `use_caddy` または `view_hq`（DECISIONS #18）
- スキーマ接頭辞: `cad_*`（追加のみ・論理削除 #5・金額integer円/時間integer分 #4）
- 共通コード: `@yozan/core`（auth / kernel / supabase / middleware）
- デプロイ: OPERATIONS.md §「新アプリ デプロイ定型チェックリスト」（Root Directory=`apps/caddy-os`）
- 稼働開始時に `vault_systems` へ登録（#26。パスワードはページ上でユーザーが入力）

設計の正典は `docs/modules/caddy-os/SYSTEM.md` を作成して置くこと（MODULE_TEMPLATE.md参照）。
