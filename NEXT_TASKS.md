# NEXT_TASKS

## GENESIS実運用フェーズ（2026-07-05〜）

- 本番: https://yozan-genesis.vercel.app（Vercel `yozan-genesis`、Root: apps/genesis）
- KPI実データ接続済み（労務系）: 在籍スタッフ数 / 総労働時間 / 人件費（migration 0008、`refresh_shift_cloud_kpis()`）
- 日次レポート生成時にKPI自動再集計。手動は Command Center「KPI更新」ボタン

## 要対応

LINE. **LINE公式アカウント連携（DECISIONS #29 / 手順 OPERATIONS §6）**: n8nを統合ハブに、既存CEO Inbox（`sec_inquiries`）で受ける＝スキーマ変更ゼロ。
   - ☐ **Phase 0（ユーザー・最初にこれだけ）**: LINE公式アカウントの Messaging API を有効化し、channel secret / 長期アクセストークンを発行（OPERATIONS §6 Phase 0）。完了したらClaudeに連絡
   - ☐ **Phase 0b（ユーザー）**: Claudeが作る `vault_systems` 行に、/vault でシークレット/トークンを入力保存
   - ☐ **Phase A（Claude構築）**: n8n Webhook受信→署名検証→`sec_inquiries`(source='line')insert。Webhook URLをユーザーがLINE側に貼付・応答メッセージOFF。→ 顧客問い合わせがCEO Inbox(/inbox)に自動集約
   - ☐ **Phase B（Claude構築）**: LINEリッチメニュー「体験予約」→ member-os `/intake` 誘導。体験予約数・入会率KPIは既存 `refresh_member_kpis` で自動
   - ☐ **Phase C（Claude構築）**: SNS AI生成文の承認→n8nでLINE一斉配信（外部送信=承認必須）
   - ☐ **Phase D（後続）**: Instagram（Meta Graph API）をn8nで

00. **Vercel環境変数の設定（ユーザー・CEO AI起動に必須）**: `yozan-genesis`プロジェクトに (1) `CRON_SECRET`=ランダム文字列（毎朝6時の自動報告に必須） (2) `ANTHROPIC_API_KEY`（CEO AIのClaude分析。未設定でもルールベースで動作） を追加 → Redeploy
0-a. **5大KPIの目標値設定（ユーザー）**: Command Centerの「KPI手動更新」で会員数・体験予約数・入会率・退会率の現在値と、5大KPI全部の目標値を入力 → 全体スコアと判断リストが機能し始める
0-b. **Member OS（Smart Hello取込）実装**: 仕様書 docs/modules/member-os/SMART_HELLO_IMPORT.md（実サンプル分析済み）に基づき会員名簿・予約一覧の取込→会員数/入会/退会/体験予約/入会率KPI自動化（DECISIONS #22）。個人情報は取り込まない設計
0-c. ~~AI社員の「見る・判断・実行」定義~~ ✅完了（2026-07-06, migration 0015）: VISION §4の15役割を反映 — 顧客AI・投資新規事業AI追加で計21体。cs_ai等の6体はVISION外の具体化として存続
0. **財務データ投入（ユーザー）**: /finance で直近月の実績を入力（税理士の試算表から転記 or CSV取込）→ 月次売上・営業利益KPIが自動接続される
1. **Genesis実運用の習慣化**（ユーザー）: 毎日 Command Center で「日次レポート生成」を実行。AI指示が必要な作業はプロンプト生成を使う
2. **デプロイ**（ユーザー）: 本コミットをユーザーPCからpush → Vercel自動デプロイ → KPI表示確認（Cockpit / Future Simulation）
2-b. **Vault（システム台帳 /vault）**: 実装完了・DB適用済（0013）・初期8件投入済。push後に /vault でパスワード入力→各システムのパスワードをページ上で入力保存（DECISIONS #26）。任意: Vercel envに `VAULT_PASSWORD` を設定するとパスワード変更可（未設定時は既定値）
3. **体験受付システム（member-os / DECISIONS #23,#24,#27）**: 独立アプリへ分離（Shift Cloudと同型）・**未デプロイ**。0-bのSmart Hello取込は会員名簿本体（会員数/退会率）のみに縮小、体験系はこちらに一本化。
   - ✅ 実装済: migration 0011（mbr_guests/mbr_trial_bookings/mbr_intake_tokens＋refresh_member_kpis、本番適用済）。`apps/member-os` 新設（トップ/＝受付ダッシュボード、公開 /intake/[token]、/login）。Genesisから /members・/intake・サイドバー項目を撤去。両アプリ next build 検証済
   - ☐ **ユーザー作業(1) 新Vercelプロジェクト作成**: OPERATIONS §2「member-osの初回セットアップ」参照（Root Directory=apps/member-os、env3つ、Deploy）
   - ☐ **ユーザー作業(2) push**: ユーザーPCから push → Genesis も member-os も自動デプロイ
   - ☐ **ユーザー作業(3) 通しテスト**: member-os のトップで予約1件登録→「タブレット受付」→ /intake で自己入力→入会 まで
   - ☐ **任意**: 受付スタッフに Shift Cloud のロールで `use_reception` 権限を付与（未付与でも view_hq 保持者は利用可）
   - Phase 2（次段）: 予約サイト／予約システム本体を姫路FRUNK GOLFに導入（#24）／会員名簿のGenesis移管
   - 設計: docs/modules/member-os/TRIAL_INTAKE.md
4. **Shift Cloud実運用フィードバックの収集と反映**: 現場の声を集めて改善バックログ化
5. **GolfOrder切替儀式**: D1差分同期 → 運用切替宣言 → 旧Pages `golfwing` 停止 → import関数削除（設計書§11）。新規入力は新版（https://shift-cloud-golfwing.vercel.app）に統一
6. **掃除（ユーザー作業）**: Cloudflareで旧Pagesのカスタムドメイン解除 — `yozan-group`から yozan-inc.jp/www.yozan-inc.jp、`kallinos`から www.kallinos.jp。※`golfwing`プロジェクトは本番稼働中なので触らない
