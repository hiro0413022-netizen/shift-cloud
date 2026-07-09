# Sales OS セットアップ / 引き継ぎ

営業サポートシステム（仮称 Sales OS）を作成し、Vercelにデプロイしました。
アプリを動かすには、あと **環境変数を3つ設定して再デプロイ** するだけです（下記）。

---

## 1. 現在の状態

- **本番URL（プレビュー）**: https://sales-2x85dp2hr-hironobu-s-projects.vercel.app
- **DB**: Genesisと同じSupabaseプロジェクト内の専用スキーマ `sales_os`（Genesisの`public`には一切影響なし）
- **ビルド**: 成功済み（10ページ）
- **投入済みデータ（PGA NOTE）**: 会社68・連絡先61・導入先28・案件40・モニター14・イベント2/参加者30・DM送付先30・やること8

> ※ 初期デモとして代表的なデータを投入しています。エクセル全件（導入84・問い合わせ92・DM送付927）の完全移行は `web/seed/data.json` と `web/app/api/seed/route.js`（取り込みAPI）を同梱済み。手順は「4. 全件移行」を参照。

---

## 2. あと3つだけ：環境変数の設定（必須）

アプリはセキュリティのため、DBの秘密鍵をコードに含めていません。Vercelに登録してください。

Vercel → プロジェクト `sales-os` → **Settings → Environment Variables** で以下を追加:

| 変数名 | 値 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://qrgpblnnhdudigarrtuz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | ★Supabaseダッシュボードから取得（下記） |
| `SESSION_SECRET` | `17fa97f7eb32c762dc6aea240b46f721823ab5f00992c56e72677d4e3dd3a3e7` |

**SUPABASE_SERVICE_ROLE_KEY の取り方**:
Supabase → プロジェクト `yozan-shift-cloud` → **Settings → API → Project API keys → `service_role`（secret）** をコピー。
（この鍵はサーバー側のみで使用し、ブラウザには渡りません）

登録したら **Deployments → 最新 → 再デプロイ（Redeploy）** で反映されます。

---

## 3. ログイン情報

| メール | パスワード | 役割 |
|---|---|---|
| `hiro0413022@gmail.com` | `sales-os` | オーナー（全権） |
| `fukuhara@fine.co.jp` | `sales-os` | 担当（福原さん） |

※ 仮パスワードです。運用前に変更してください（変更機能は次フェーズ）。
※ データ（案件・やること）は福原アカウントに紐づけています。ログインして「ホーム」を確認してください。

---

## 4. エクセル全件の移行（任意）

代表データではなく全件を入れる場合:

1. 上記の環境変数を設定して再デプロイ（`SUPABASE_SERVICE_ROLE_KEY` が必要）
2. Vercelに `SEED_TOKEN`（任意の文字列、例：`yozan-seed-2026`）を追加して再デプロイ
3. ブラウザで `https://（本番URL）/api/seed?token=yozan-seed-2026` を一度開く
   → `web/seed/data.json`（全件）がDBに取り込まれます（重複はスキップ）

※ この取り込みAPIは移行後に無効化（`SEED_TOKEN`を削除）してください。

---

## 5. 画面の使い方（営業マン向け）

- **ホーム（やること）**: 朝ここを見れば、今日やること・期限超過・新規問い合わせ・もうすぐの予定・自分の数字が一目でわかる
- **案件ボード**: 「問い合わせ→商談→モニター→導入」を付箋感覚で進捗管理
- **相手（案件詳細）**: やりとりを1行記録＋「次にやること」をセット → 自動でホームのTODOに戻る
- **問い合わせ受付**: 経路を選んで新規登録
- **導入先 / 集客の施策**: 導入済み一覧、DM等の施策と反応
- **設定**: 段階・経路・入力項目・商品をノーコードで追加（HP作成など新商品もここで立ち上げ）

---

## 6. 技術メモ

- Next.js（App Router）＋ Supabase（schema `sales_os`）＋ Vercel、内部コード `sales-os`
- マルチテナント構成（会社→商品→案件の3階層）。他社への横展開・自社HP作成営業への転用が可能
- 将来のGenesis連携は境界のみ定義済み（着手時に別途相談）
- ソース一式: `sales-support-saas/web/`
