# NEXT_TASKS

## 基盤アップグレード（2026-07-11 Phase 0監査済 — 正典: docs/genesis/AUDIT_2026-07-11.md）

UP-1. ~~push→CI green確認~~ ✅完了（2026-07-11、run #2 green・UP-2デプロイも動作確認済）
UP-2. ~~既存アプリのpackages/core移行（B-6）~~ ✅完了（2026-07-11、4アプリ移行・Linux実機で全build検証済）。残: push後に member-os / legal-os のVercelデプロイ成功を確認（本番稼働中のため）。money-golfwing / shift-cloud / genesis の移行は後続（authの形が異なるため個別設計）
UP-3. ~~現場RUNBOOK作成（B-9）~~ ✅完了（2026-07-11、member-os/workforce-os/legal-osの3本。**現場スタッフへの共有はユーザー作業**＝印刷 or URL共有）
UP-4. ~~時給の月中変更対応（B-7・監査D-3）~~ ✅完了（2026-07-11、日付按分 DECISIONS #39。給与画面のdetailにレート別内訳wage_periodsが残る）
UP-5. 監査で検知された「6月ゴルフ経費未入力」はKPIチェッカー（#37）がデプロイ後、日次レポートに自動表示される → Money OSでの経費取込で解消

## GENESIS実運用フェーズ（2026-07-05〜）

- 本番: https://yozan-genesis.vercel.app（Vercel `yozan-genesis`、Root: apps/genesis）
- KPI実データ接続済み（労務系）: 在籍スタッフ数 / 総労働時間 / 人件費（migration 0008、`refresh_shift_cloud_kpis()`）
- 日次レポート生成時にKPI自動再集計。手動は Command Center「KPI更新」ボタン

## 要対応

SVY. **Survey OS（アンケート / DECISIONS #33）**: 独立アプリ・**未デプロイ**。DBは 0030 適用済、GOLF WINGアンケート 0031 投入済（slug=`golfwing-2026`・公開中）。
   - ✅ 実装済: `apps/survey-os`（公開回答 /s/[slug]・一覧・集計 /[id]/results・CSV /api/export/[id]）。svy_* スキーマ＋集計ロジック（ボルダ平均＋平均順位・ヒートマップ）。member-os規約準拠
   - ☐ **ユーザー作業(1) 依存導入＋push**: ルートで `npm install`（qrcode 追加のため）→ ユーザーPCから push
   - ☐ **ユーザー作業(2) 新Vercelプロジェクト作成**: OPERATIONS §2「survey-os 初回セットアップ」（Root=apps/survey-os、env3つ、Deploy）
   - ☐ **ユーザー作業(3) 動作確認**: `survey-os.vercel.app/s/golfwing-2026` で回答→管理ログイン（view_hq）で集計・CSV確認。QRを会員へ配布
   - ☐ **Claude(デプロイ後)**: vault_systems の Survey OS 行にURL記入
   - ✅ **フェーズ2**: アンケートビルダー（項目編集GUI `/[surveyId]/edit`）＝設問の追加/編集/削除/並び替え・型変更・選択肢編集・新規アンケート作成（実装済、push＆再デプロイで反映）
   - ☐ **フェーズ3**: 条件分岐／KPI接続（回答率・WING NOTE満足度）／n8n連携
   - 設計: docs/modules/survey-os/SYSTEM.md

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
7. **Legal OS（契約・法務管理 / DECISIONS #29,#30）**: 独立アプリ・**本番稼働中**（https://legal-os-peach.vercel.app、migration 0024適用済、module live、Vault登録済）。設計: docs/modules/legal-os/SYSTEM.md
   - ✅ 実装済: leg_documents/leg_files/leg_grants/leg_reminders＋Storage `legal-docs`。apps/legal-os（ダッシュボード/一覧/詳細/登録＋ファイル署名URL＋/api/v1、Bearer `LEGAL_API_TOKEN`）。next build検証・push・デプロイ済
   - ✅ **フェーズ2 legal_ai接続**（2026-07-11 DECISIONS #40）: 日次チェック（期限接近/高リスク/滞留→判断リスト）＋自動抽出（1件/日、提案保存・確定は人）。要ANTHROPIC_API_KEY（genesis env）。締結・更新・解約の正式承認はapproval_requests（変わらず）
   - ☐ **任意（ユーザー）**: 登録担当スタッフに `use_legal` 権限 or `leg_grants`(uploader/manager/viewer) を付与
   - ☐ **軽微（掃除）**: マイグレーション番号重複（0024が legal_os / reservation_payments の2本）を次に触る際いずれか0025+へリネーム
8. **Money OS `mon_receipts`（経理系証憑 / DECISIONS #29a・#41）**: ✅フェーズ1完了（2026-07-11）— 0034適用済・money-golfwing /receipts（撮影アップロード→保管・突合台帳・電帳法配慮の論理削除）。☐後続=経理AIフェーズ（レシートOCR→金額/日付/店名抽出→経費自動起票、mon_expense/mon_bank_txnとの突合UI強化）
9. **Reserve OS（ビジター向け予約 / DECISIONS #34）**: 独立アプリ・**実装済/未デプロイ**。第一弾=GOLF WING シャフトフィッティング。申込型（候補日時3つ必須＋事前ヒアリング→スタッフ目視確定）。設計: docs/modules/reserve-os/SYSTEM.md
   - ✅ 実装済: migration `0032_reserve_os.sql`（res_services/res_requests、本番適用済）。`apps/reserve-os`（公開 /reserve/[slug]、スタッフ /・/requests/[id]、CSV、/login）。メール汎用レイヤ src/lib/mail.ts（Resend）。vault登録済
   - ☐ **ユーザー作業(1)** ルートで `npm install` → ユーザーPCからpush
   - ☐ **ユーザー作業(2) 新Vercelプロジェクト作成**: Root Directory=`apps/reserve-os`。env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY / RESERVE_FROM_EMAIL(YOZANアドレス) / RESERVE_STAFF_EMAIL(GOLF WINGアドレス) / NEXT_PUBLIC_SITE_URL → Deploy
   - ☐ **ユーザー作業(3) メール**: https://resend.com でAPIキー発行＋送信ドメイン（yozan-inc.jp等）認証。RESERVE_STAFF_EMAIL にGOLF WINGのメールアドレスを設定
   - ☐ **ユーザー作業(4) 通しテスト**: /reserve/shaft-fitting で申込→GOLF WING宛に通知メール到達→ /login（use_reception|view_hq）→ /requests で確定メール送信 まで
   - ☐ **ユーザー作業(5)** 公式LINEのリッチメニュー/トークに公開URL `/reserve/shaft-fitting` を掲出。vault_systems のURLを本番URLに更新
   - Phase後続: LINE通知（notifyLine実装・#29 n8n）／サービス追加GUI／体験レッスン・クラブFTへ横展開（res_services行追加）／Googleスプレッドシート自動同期
