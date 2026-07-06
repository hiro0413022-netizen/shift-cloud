# DECISIONS（決定事項ログ）

形式: `#N (日付) 決定内容 — 理由`。同じ議論を繰り返さない。

- #1 (2026-07-02) リポジトリは軽量モノレポ（npm workspaces、単一Next.jsアプリ＋packages分離）。Turborepoはアプリ2つ目から — MVP速度優先、構造だけ将来対応
- #2 (2026-07-02) 認証はメール＋パスワード基本、メールなしスタッフはログインID＋パスワード（擬似メール方式）— アルバイトがメール非保持の可能性
- #3 (2026-07-02) RLSはテナント分離に限定し、ロール別権限はアプリ層で制御。例外として給与系テーブル（staff_wages, payroll_items）のみRLSでも保護 — RLSに全権限ロジックを持たせると保守不能
- #4 (2026-07-02) 金額はinteger円、時間はinteger分。浮動小数禁止 — 丸め誤差防止
- #5 (2026-07-02) 論理削除（deleted_at）を標準。物理削除禁止 — 監査・復元要件
- #6 (2026-07-02) 打刻は修正レコード積み上げ方式（元レコード不変）— 改ざん防止・労基対応
- #7 (2026-07-02) AI提案はMVPでは保存のみ。実行は人間承認後 — 安全性
- #8 (2026-07-02) Supabaseは新規プロジェクト作成（ユーザー承認済み）
- #9 (2026-07-02) 実働は1分単位で記録。給与計算時の丸めは会社設定（デフォルト: 丸めなし）— 後日ユーザー確認で変更可
- #10 (2026-07-02) MVP期間中はpackages/分離を保留し、apps/shift-cloud/src/lib配下に集約。UIはshadcn/ui相当の自作プリミティブ（src/components/ui.tsx）— ファイル数・複雑性削減。2アプリ目でpackages化
- #11 (2026-07-02) 管理系の書き込みはservice_roleクライアント＋requireActor権限チェック＋監査ログ。読み取りはスタッフ画面=RLSクライアント、管理画面=service_role — RLSはテナント分離専任（#3の具体化）
- #12 (2026-07-02) キオスクは端末トークン（sha256ハッシュ保存）認証。URLは発行時のみ表示
- #13 (2026-07-02) シフトはスタッフ主導: 提出→自動ドラフト（主店舗）→管理者確認で確定。人員不足時は「出勤募集」（応募→採用で確定・人数充足で自動クローズ）— ユーザー要望による運用転換
- #14 (2026-07-04) リポジトリはPublic運用。旧Vercelプロジェクト`shift-cloud`は削除（稼働は`shift-cloud-shift-cloud`）— ※ファイル破損によりCHANGELOG 2026-07-04から復元
- #15 (2026-07-04) （前半欠損のため一部復元不能）…クレジット節約。共通化はGenesis安定後に実施
- #16 (2026-07-04) Kernelテーブルは同一Supabaseプロジェクト(qrgpblnnhdudigarrtuz)に追加（migration 0004、追加のみ・既存テーブル変更なし）。audit_logs / approval_requests / notifications / ai_suggestions / integration_configs は既存を再利用
- #17 (2026-07-04) Kernelテーブルも既存標準準拠: company_id + RLSテナント分離（app.current_company_id()）、書き込みはservice_role+requireActor、論理削除、updated_atトリガー
- #18 (2026-07-04) Genesis UIのアクセスは `view_hq` 権限保持者のみ（本部/オーナー向けコックピット）。Webhook受信はconnectorごとのトークン（sha256ハッシュ保存、#12と同方式）
- #19 (2026-07-04) GolfOrder移行は方式B（DB先行: Hono維持でD1→Supabase差し替え、UIは後続でNext.js化）。移行中の新規開発凍結はユーザー許容済み
- #20 (2026-07-04) GolfOrderのテナント: 実店舗はGOLF WING宝塚のみ → tenants/usersテーブル廃止、companies/stores/staff+Supabase Authに統合。デモテナントは移行後廃止
- #21 (2026-07-06) 財務管理は自作financeモジュール（fin_segments/fin_categories/fin_entries、事業別月次PL）。データは税理士資料の手入力＋CSV取込を正とし、会計ソフトAPI連携・資金繰り予測・予実管理は後続フェーズ
- #22 (2026-07-06) 会員・体験予約・入会/退会KPIはGOLF WINGの会員管理「Smart Hello」（システムディ、公開API無し）からCSV手動エクスポート→Genesis取込で接続（#21の財務と同型）。API連携は提供され次第切替
- #23 (2026-07-06) 体験予約受付はGenesisに自作（member-osモジュール、migration 0011: mbr_guests/mbr_trial_bookings/mbr_intake_tokens）。紙+Excel運用を廃止し、スタッフWeb入力（/members）＋お客様タブレット自己入力（公開ルート /intake/[token]、トークン#12方式）＋電子サインで受付。体験予約数・入会率は refresh_member_kpis で自動集計（0010の手動更新を置換）。設計: docs/modules/member-os/TRIAL_INTAKE.md
- #24 (2026-07-06) 予約システムの棲み分け: 当面GOLF WING(宝塚)の予約はSmart Hello継続。姫路FRUNK GOLFはGenesis自作の予約システムを新規導入 → member-osは体験受付から予約・会員名簿へ拡張する前提でマルチストア設計（company_id/store_id分離）。会員名簿本体も将来Genesisへ移管
- #25 (2026-07-06) CEO AIの頭脳はアプリ内蔵のClaude API呼び出し（ANTHROPIC_API_KEY設定時、モデルはCEO_AI_MODELで変更可・既定claude-haiku-4-5）。キー未設定/失敗時はルールベースに自動フォールバックし日次レポートは必ず生成。毎朝6時(JST)にVercel Cronで自動実行（/api/cron/daily、CRON_SECRET認証）。指示案はprompts下書きとして保存し実行はしない（VISION §7）
- #26 (2026-07-06) システム台帳（Vault）はGenesis内ページ `/vault` ＋ `vault_systems` テーブルで一元管理。RLSポリシーを作らずservice_role専用（給与系と同等保護、#3の例外扱い）。アクセスは view_hq ログイン＋Vaultパスワードの二重ゲート（sha256照合、`VAULT_PASSWORD` envで変更可・平文はコードに置かない）。秘密情報はDBのみに保存しPublicリポジトリ（#14）には一切書かない。新システムはページ上のフォーム or AI経由でDB行追加＝ページは常に自動反映
- #27 (2026-07-06) 体験受付（member-os）をGenesis内ページから独立アプリへ分離（Shift Cloudと同型）。`apps/member-os` を新Vercelプロジェクト（member-os）として別URL・別ログインで運用。Genesisのサイドバー項目とルート（/members・/intake）は撤去。DBは同一Supabase(qrgpblnnhdudigarrtuz)を共有し mbr_* と refresh_member_kpis はそのまま → 体験予約数・入会率KPIは従来どおりGenesisへ自動流入（Shift Cloudの労務KPIと同じ関係）。認可は新権限 `use_reception` または `view_hq`（#18の経営層）で入れる二段構え。#23の「Genesisに自作」を分離運用へ更新
- #28 (2026-07-06) member-osの体験受付を「一時利用者名簿」方式に再定義（GOLF WING宝塚）。予約起点をやめ、店頭常設タブレットの予約なし自己入力＋スタッフ追記で紙/手入力Excelを廃止（設計: docs/modules/member-os/WALKIN_LEDGER.md）。決定: (1)利用区分は体験利用/フィッティング/打席利用/ビジター打席/その他の5固定 (2)Excel出力は「一時利用顧客名簿」シートのみ現行同一・会員集計タブは作らない (3)会員数/会費等はSmart HelloのCSV/Excel取込で自動化（#22、別系統） (4)既存約2,415行を移行。新テーブル mbr_walkin_visits（+既存mbr_guests再利用）。姫路FRUNK GOLFの予約システム（#24）は別途
