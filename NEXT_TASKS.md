# NEXT_TASKS

## GENESIS本番稼働開始（2026-07-04）

- 本番: https://yozan-genesis.vercel.app（Vercel `yozan-genesis`、Root: apps/genesis、env 3つ設定済み）
- push済み: commit f245bf6。Supabase migrations 0005/0006適用済み

## 要対応

0. **Web移行完了（2026-07-04）**: yozan-inc.jp=Vercel`yozan-corporate`（モーション版・画像ローカル化済み）、www.kallinos.jp=Vercel`kallinos`（静的ミラー）、apps/golfwing=ソース回収済み（本番は当面Cloudflare Pages `golfwing`継続）
0-a. **掃除（ユーザー作業）**: Cloudflareダッシュボードで旧Pagesのカスタムドメイン解除 — `yozan-group`から yozan-inc.jp/www.yozan-inc.jp、`kallinos`から www.kallinos.jp。※`golfwing`プロジェクトは本番稼働中なので触らない
0-b. **セキュリティ**: チャット共有されたCloudflare APIトークンを再発行、R2キーは失効（R2未有効化）
0-c. **GolfOrder移行**: P1〜P4前半完了。新本番: https://shift-cloud-golfwing.vercel.app（検証合格）。残り=切替儀式: D1差分同期→運用切替宣言→旧Pages `golfwing` 停止→import関数削除（設計書§11）。旧D1版は当面併存OK（ただし新規入力は新版に統一すること）
1. **ログイン動作確認**（ユーザー）: オーナー/本部アカウント（view_hq権限）で https://yozan-genesis.vercel.app にログイン → Cockpit表示確認
2. **未コミットのdocs変更を