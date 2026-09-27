# 議事録

会議の録音から文字起こし・場面別の要約

- 独立アプリ方式（入力面は独立 / GENESISは閲覧＋承認 / DBは共有）— DECISIONS #30/#33/#34の勝ちパターン
- 認可: `use_minutes` または `view_hq`（DECISIONS #18）
- スキーマ接頭辞: `mtg_*`（追加のみ・論理削除 #5・金額integer円/時間integer分 #4）
- 共通コード: `@yozan/core`（auth / kernel / supabase / middleware）
- デプロイ: OPERATIONS.md §「新アプリ デプロイ定型チェックリスト」（Root Directory=`apps/minutes`）
- 稼働開始時に `vault_systems` へ登録（#26。パスワードはページ上でユーザーが入力）

設計の正典は `docs/modules/minutes/SYSTEM.md` を作成して置くこと（MODULE_TEMPLATE.md参照）。
