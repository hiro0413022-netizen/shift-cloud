# NEXT_TASKS

## GENESIS実運用フェーズ（2026-07-05〜）

- 本番: https://yozan-genesis.vercel.app（Vercel `yozan-genesis`、Root: apps/genesis）
- KPI実データ接続済み（労務系）: 在籍スタッフ数 / 総労働時間 / 人件費（migration 0008、`refresh_shift_cloud_kpis()`）
- 日次レポート生成時にKPI自動再集計。手動は Command Center「KPI更新」ボタン

## 要対応

00. **Vercel環境変数の設定（ユーザー・CEO AI起動に必須）**: `yozan-genesis`プロジェクトに (1) `CRON_SECRET`=ランダム文字列（毎朝6時の自動報告に必須） (2) `ANTHROPIC_API_KEY`（CEO AIのClaude分析。未設定でもルールベースで動作） を追加 → Redeploy
0-a. **5大KPIの目標値設定（ユーザー）**: Command Centerの「KPI手動更新」で会員数・体験予約数・入会率・退会率の現在値と、5大KPI全部の目標値を入力 → 全体スコアと判断リストが機能し始める
0-b. **Member OS（Smart Hello取込）実装**: 仕様書 docs/modules/member-os/SMART_HELLO_IMPORT.md（実サンプル分析済み）に基づき会員名簿・予約一覧の取込→会員数/入会/退会/体験予約/入会率KPI自動化（DECISIONS #22）。個人情報は取り込まない設計
0-c. **AI社員の「見る・判断・実行」定義**: VISION §4の15役割をai_agentsに反映（現19体の整理・具体化）
0. **財務データ投入（ユーザー）**: /finance で直近月の実績を入力（税理士の試算表から転記 or CSV取込）→ 月次売上・営業利益KPIが自動接続される
1. **Genesis実運用の習慣化**（ユーザー）: 毎日 Command Center で「日次レポート生成」を実行。AI指示が必要な作業はプロンプト生成を使う
2. **デプロイ**（ユーザー）: 本コミットをユーザーPCからpush → Vercel自動デプロイ → KPI表示確認（Cockpit / Future Simulation）
2-b. **Vault（システム台帳 /vault）**: 実装完了・DB適用済（0013）・初期8件投入済。push後に /vault でパスワード入力→各システムのパスワードをページ上で入力保存（DECISIONS #26）。任意: Vercel envに `VAULT_PASSWORD` を設定するとパスワード変更可（未設定時は既定値）
3. **体験予約受付システム（member-os / DECISIONS #23,#24）**: Phase 1a/1b **実装完了・未デプロイ**。0-bのSmart Hello取込は会員名簿本体（会員数/退会率）のみに縮小、体験系はこちらに一本化。
   - ✅ 実装済: migration 0011（mbr_guests/mbr_trial_bookings/mbr_intake_tokens＋refresh_member_kpis）、スタッフ画面 /members、公開タブレット /intake/[token]（自己入力＋同意＋指サイン）、サイドバー・middleware更新
   - ✅ 0011 本番Supabase適用済（2026-07-06、スモークテスト検証済）
   - ☐ **ユーザー作業**: (1) ユーザーPCからpush → Vercel自動デプロイ (2) /members で予約1件登録→「タブレット受付」→ /intake で自己入力→入会 まで通しテスト
   - Phase 2（次段）: 予約サイト／予約システム本体を姫路FRUNK GOLFに導入（#24）／会員名簿のGenesis移管
   - 設計: docs/modules/member-os/TRIAL_INTAKE.md
4. **Shif