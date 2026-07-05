# NEXT_TASKS

## GENESIS実運用フェーズ（2026-07-05〜）

- 本番: https://yozan-genesis.vercel.app（Vercel `yozan-genesis`、Root: apps/genesis）
- KPI実データ接続済み（労務系）: 在籍スタッフ数 / 総労働時間 / 人件費（migration 0008、`refresh_shift_cloud_kpis()`）
- 日次レポート生成時にKPI自動再集計。手動は Command Center「KPI更新」ボタン

## 要対応

0-a. **5大KPIの目標値設定（ユーザー）**: Command Centerの「KPI手動更新」で会員数・体験予約数・入会率・退会率の現在値と、5大KPI全部の目標値を入力 → 全体スコアと判断リストが機能し始める
0-b. **AI社員の「見る・判断・実行」定義**: VISION §4の15役割をai_agentsに反映（現19体の整理・具体化）
0. **財務データ投入（ユーザー）**: /finance で直近月の実績を入力（税理士の試算表から転記 or CSV取込）→ 月次売上・営業利益KPIが自動接続される
1. **Genesis実運用の習慣化**（ユーザー）: 毎日 Command Center で「日次レポート生成」を実行。AI指示が必要な作業はプロンプト生成を使う
2. **デプロイ**（ユーザー）: 本コミットをユーザーPCからpush → Vercel自動デプロイ → KPI表示確認（Cockpit / Future Simulation）
3. **会員系KPIの実データ接続（Smart Hello CSV取込）**: DECISIONS #22。GOLF WING会員管理はSmart Hello（公開API無し・CSV出力あり）。会員数/入会/退会/体験予約をCSVエクスポート→取込する仕組みを設計（financeモジュール #21 と同型）。次の一手＝Smart HelloのCSV出力項目を1つ確認 → 取込スキーマ定義 → 取込画面。売上KPIはfinance(#21/上記0番)側で継続
4. **Shift Cloud実運用フィードバックの収集と反映**: 現場の声を集めて改善バックログ化
5. **GolfOrder切替儀式**: D1差分同期 → 運用切替宣言 → 旧Pages `golfwing` 停止 → import関数削除（設計書§11）。新規入力は新版（https://shift-cloud-golfwing.vercel.app）に統一
6. **掃除（ユーザー作業）**: Cloudflareで旧Pagesのカスタムドメイン解除 — `yozan-group`から yozan-inc.jp/www.yozan-inc.jp、`kallinos`から www.ka