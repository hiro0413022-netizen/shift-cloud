# NEXT_TASKS

## GENESIS実運用フェーズ（2026-07-05〜）

- 本番: https://yozan-genesis.vercel.app（Vercel `yozan-genesis`、Root: apps/genesis）
- KPI実データ接続済み（労務系）: 在籍スタッフ数 / 総労働時間 / 人件費（migration 0008、`refresh_shift_cloud_kpis()`）
- 日次レポート生成時にKPI自動再集計。手動は Command Center「KPI更新」ボタン

## 要対応

0. **財務データ投入（ユーザー）**: /finance で直近月の実績を入力（税理士の試算表から転記 or CSV取込）→ 月次売上・営業利益KPIが自動接続される
1. **Genesis実運用の習慣化**（ユーザー）: 毎日 Command Center で「日次レポート生成」を実行。AI指示が必要な作業はプロンプト生成を使う
2. **デプロイ**（ユーザー）: 本コミットをユーザーPCからpush → Vercel自動デプロイ → KPI表示確認（Cockpit / Future Simulation）
3. **売上・会員KPIの実データ接続**: 会計/POS・CRM連携後（monthly_sales / members は未接続のまま）
4. **Shift Cloud実運用フィードバックの収集と反映**: 現場の声を集めて改善バックログ化
5. **GolfOrder切替儀式**: D1差分同期 → 運用切替宣言 → 旧Pages `golfwing` 停止 → import関数削除（設計書§11）。新規入力は新版（https://shift-cloud-golfwing.vercel.app）に統一
6. **掃除（ユーザー作業）**: Cloudflareで旧Pagesのカスタムドメイン解除 — `yozan-group`から yozan-inc.jp/www.yozan-inc.jp、`kallinos`から www.kallinos.jp。※`golfwing`は本番稼働中なので触らない
7. **セキュリティ**: チャット共有されたCloudflare APIトークンを再発行、R2キーは失効（R2未有効化）

## メモ

- 前回セッション中断でgit index等が破損 → 2026-07-05に修復済み。異常があればまずgit fsck
