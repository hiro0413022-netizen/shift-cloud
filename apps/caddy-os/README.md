# Caddy OS

キャディ派遣のシフト管理・派遣台帳・売上/委託料・収支

- 独立アプリ方式（入力面は独立 / GENESISは閲覧＋承認 / DBは共有）— DECISIONS #30/#33/#34の勝ちパターン
- 認可: `use_caddy` または `view_hq`（DECISIONS #18）。`/s/<token>`（キャディ本人の希望提出）と `/api/v1/*` は公開ルート
- スキーマ接頭辞: `cad_*`（追加のみ・論理削除 #5・金額integer円/時間integer分 #4）
- 共通コード: `@yozan/core`（auth / kernel / supabase / middleware）
- デプロイ: OPERATIONS.md §「新アプリ デプロイ定型チェックリスト」（Root Directory=`apps/caddy-os`）
- 稼働開始時に `vault_systems` へ登録（#26。パスワードはページ上でユーザーが入力）

## 画面

| パス | 用途 |
|---|---|
| `/` | ダッシュボード（月次KPI・取引先別・委託先別・6ヶ月推移） |
| `/calendar` | **シフトカレンダー**（希望の確認 → 割当 → 確定 / #140） |
| `/ledger` `/ledger/[partnerId]` | **キャディ台帳**（確定分から自動生成 / #140） |
| `/exports` | **ゴルフ場提出**（ゴルフ場別の派遣一覧・書式切替CSV / #140） |
| `/dispatches` | 派遣台帳（スプレッドシート風の一括入力） |
| `/invoices` `/invoices/payable` | 請求（受取）／支払 |
| `/availability` | 出勤可否（管理者の代理入力・○△×） |
| `/masters` | 設定（取引先・委託先・単価表・提出URLの発行） |
| `/s/[token]` | **キャディ本人のシフト希望提出**（ログイン不要・スマホ / #140） |

## 環境変数

`.env.example` を `.env.local` にコピーして設定。`CADDY_API_TOKEN` は外部連携API（`/api/v1/*`）用で、
未設定なら API は常に 401 を返す。

設計の正典は `docs/modules/caddy-os/SYSTEM.md`。
