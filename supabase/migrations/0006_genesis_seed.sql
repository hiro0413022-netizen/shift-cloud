-- 0005_genesis_seed.sql
-- Genesis Kernel 初期データ（モジュール / AIエージェント / KPI / コネクタ / 開発状況 / 決定ログのバックフィル）

do $$
declare
  v_company uuid;
begin
  select id into v_company from companies order by created_at limit 1;
  if v_company is null then
    raise notice 'no company found, skip seed';
    return;
  end if;

  -- モジュール
  insert into modules (company_id, code, name, description, domain, status, sort_order) values
    (v_company, 'genesis-kernel', 'Genesis Kernel', '会社OS中核（Event/Memory/Decision/Agent/Approval基盤）', 'core', 'building', 1),
    (v_company, 'shift-cloud', 'YOZAN Shift Cloud', 'シフト・勤怠・給与・店舗運営', 'workforce', 'live', 2),
    (v_company, 'inventory', '在庫・発注管理', 'ゴルフ工房・シャフト・物販在庫', 'inventory', 'planned', 10),
    (v_company, 'reservation', '予約管理', '打席・レッスン予約', 'reservation', 'planned', 11),
    (v_company, 'crm', '会員CRM', '会員管理・退会リスク・TrackManデータ活用', 'crm', 'planned', 12),
    (v_company, 'caddy-dispatch', 'キャディ派遣管理', '派遣スケジュール・請求', 'dispatch', 'planned', 13),
    (v_company, 'kallinos-ec', 'KALLINOS EC管理', 'アパレルEC・商品・受注', 'ec', 'planned', 14),
    (v_company, 'golf-coach-ai', 'ゴルフコーチAI', 'TrackManデータ×レッスンAI', 'ai', 'planned', 15),
    (v_company, 'rac-ops', 'RAC運営管理', 'RAC/RC関連の運営', 'operation', 'planned', 16);

  -- AIエージェント
  insert into ai_agents (company_id, code, name, role, risk_level, approval_required_actions) values
    (v_company, 'ceo_ai', 'CEO AI', '全体統括・開発総監督・経営参謀。開発/事業/リスク/承認待ちを横断把握し次アクションとAI指示を生成', 'high', array['外部送信','本番デプロイ','課金操作']),
    (v_company, 'dev_ai', '開発AI', '実装・レビュー・デプロイ準備', 'medium', array['本番デプロイ','本番DB変更']),
    (v_company, 'sales_ai', '営業AI', '法人営業・リード管理・提案書作成', 'medium', array['外部メール送信']),
    (v_company, 'sns_ai', 'SNS AI', 'SNS運用・投稿案作成・分析', 'medium', array['SNS実投稿']),
    (v_company, 'accounting_ai', '経理AI', '売上・経費・請求管理', 'high', array['支払実行','請求送付']),
    (v_company, 'labor_ai', '労務AI', '勤怠監視・労基アラート・給与チェック', 'high', array['給与確定']),
    (v_company, 'inventory_ai', '在庫AI', '在庫監視・発注提案', 'medium', array['発注実行']),
    (v_company, 'reservation_ai', '予約AI', '予約最適化・リマインド', 'low', array['顧客への通知送信']),
    (v_company, 'recruit_ai', '採用AI', '求人・応募者管理', 'medium', array['応募者への連絡']),
    (v_company, 'docs_ai', '資料作成AI', '提案書・報告書・マニュアル生成', 'low', array[]::text[]),
    (v_company, 'lesson_ai', 'レッスンAI', 'レッスン管理・カリキュラム提案', 'low', array[]::text[]),
    (v_company, 'golf_coach_ai', 'ゴルフコーチAI', 'TrackManデータ分析・スイング改善提案', 'low', array[]::text[]),
    (v_company, 'store_ops_ai', '店舗運営AI', '店舗KPI監視・改善提案', 'low', array[]::text[]),
    (v_company, 'kallinos_ai', 'KALLINOS AI', 'アパレルEC運営・商品企画支援', 'medium', array['商品公開','価格変更']),
    (v_company, 'rac_ai', 'RAC運営AI', 'RAC/RC運営支援', 'low', array[]::text[]),
    (v_company, 'cs_ai', 'カスタマーサポートAI', '問い合わせ一次対応・FAQ', 'medium', array['顧客への返信送信']),
    (v_company, 'analyst_ai', 'データ分析AI', 'KPI分析・異常検知・未来予測', 'low', array[]::text[]),
    (v_company, 'legal_ai', '法務チェックAI', '契約・規約・コンプライアンス確認', 'high', array['契約締結']),
    (v_company, 'pm_ai', 'プロジェクト管理AI', 'タスク・進捗・ブロッカー管理', 'low', array[]::text[]);

  -- KPI（ダミー値。実データ接続は今後）
  insert into kpis (company_id, code, name, area, unit, current_value, target_value, period, trend, notes) values
    (v_company, 'monthly_sales', '月次売上', 'sales', '円', null, null, 'monthly', '[]', '実データ未接続（会計/POS連携後）'),
    (v_company, 'members', '会員数', 'members', '人', null, null, 'monthly', '[]', '実データ未接続（CRMモジュール後）'),
    (v_company, 'labor_cost', '人件費', 'labor', '円', null, null, 'monthly', '[]', 'Shift Cloud payroll_itemsから集計予定'),
    (v_company, 'dev_progress', '開発進捗', 'development', '%', 40, 100, 'weekly', '[]', 'Genesis全体ロードマップに対する進捗');

  -- コネクタ（Integration Mesh受け皿）
  insert into connectors (company_id, code, name, kind, status) values
    (v_company, 'github', 'GitHub', 'dev', 'configured'),
    (v_company, 'vercel', 'Vercel', 'dev', 'configured'),
    (v_company, 'supabase', 'Supabase', 'dev', 'active'),
    (v_company, 'sentry', 'Sentry', 'dev', 'planned'),
    (v_company, 'n8n', 'n8n', 'ops', 'planned'),
    (v_company, 'slack', 'Slack', 'communication', 'planned'),
    (v_company, 'gmail', 'Gmail', 'communication', 'planned'),
    (v_company, 'gcal', 'Google Calendar', 'communication', 'planned'),
    (v_company, 'line', 'LINE', 'communication', 'planned'),
    (v_company, 'stripe', 'Stripe', 'commerce', 'planned'),
    (v_company, 'shopify', 'Shopify', 'commerce', 'planned'),
    (v_company, 'trackman', 'TrackMan', 'analytics', 'planned'),
    (v_company, 'notion', 'Notion', 'ops', 'planned');

  -- 開発状況
  insert into development_statuses (company_id, module_id, module_name, phase, status, progress, owner, current_task, completed_items, remaining_items, next_action) values
    (v_company,
     (select id from modules where company_id = v_company and code = 'shift-cloud'),
     'YOZAN Shift Cloud', 'live', 'done', 100, 'Claude',
     '本番稼働中・フィードバック待ち',
     array['MVP全機能','GitHub/Vercel連携','本番稼働','スタッフ主導シフト提出','出勤募集'],
     array['パスワードリセット画面','有給・交通費申請','LINE通知','給与丸め本番値確認'],
     '実運用フィードバックの収集と反映'),
    (v_company,
     (select id from modules where company_id = v_company and code = 'genesis-kernel'),
     'Genesis Kernel', 'build', 'active', 60, 'Claude',
     'Kernel DB・CEO AI Command Center・Cockpit UI実装',
     array['Kernelテーブル設計・migration適用','seedデータ'],
     array['apps/genesis実装','Cockpit UI','Webhook受信基盤','ビルド検証','デプロイ'],
     'apps/genesis の実装完了とビルド検証');

  -- リスク
  insert into risks (company_id, title, description, area, severity, status, mitigation) values
    (v_company, 'Publicリポジトリへのシークレット混入', 'shift-cloudリポジトリはPublic運用（DECISIONS #14）。envファイルやAPIキーの誤コミットで即漏洩する', 'security', 'high', 'open', '.gitignore徹底・コミット前のシークレットスキャン・キー漏洩時は即ローテーション'),
    (v_company, 'KPI実データ未接続', 'KPI/未来予測はダミー値。経営判断には実データ接続（会計・POS・CRM）が必要', 'development', 'medium', 'open', 'Integration Mesh経由で段階的に実データ接続');

  -- 決定ログ（DECISIONS.md #1〜#18のバックフィル）
  insert into decision_logs (company_id, title, decision_type, reason, outcome, decided_at) values
    (v_company, '#1 軽量モノレポ（npm workspaces）採用。Turborepoは2アプリ目から', 'development', 'MVP速度優先、構造だけ将来対応', 'success', '2026-07-02'),
    (v_company, '#2 認証はメール＋パスワード基本、メールなしスタッフはログインID方式', 'development', 'アルバイトがメール非保持の可能性', 'success', '2026-07-02'),
    (v_company, '#3 RLSはテナント分離専任、ロール権限はアプリ層（給与系のみRLS保護）', 'development', 'RLSに全権限ロジックを持たせると保守不能', 'success', '2026-07-02'),
    (v_company, '#4 金額integer円・時間integer分・浮動小数禁止', 'development', '丸め誤差防止', 'success', '2026-07-02'),
    (v_company, '#5 論理削除標準・物理削除禁止', 'development', '監査・復元要件', 'success', '2026-07-02'),
    (v_company, '#6 打刻は修正レコード積み上げ方式', 'development', '改ざん防止・労基対応', 'success', '2026-07-02'),
    (v_company, '#7 AI提案は保存のみ・実行は人間承認後', 'development', '安全性', 'success', '2026-07-02'),
    (v_company, '#8 Supabase新規プロジェクト作成', 'development', 'ユーザー承認済み', 'success', '2026-07-02'),
    (v_company, '#9 実働1分単位記録・丸めは会社設定', 'business', '後日本番値確認', 'pending', '2026-07-02'),
    (v_company, '#10 MVP中はpackages分離保留・UIは自作プリミティブ', 'development', 'ファイル数・複雑性削減', 'success', '2026-07-02'),
    (v_company, '#11 管理系書き込みはservice_role＋requireActor＋監査ログ', 'development', 'RLSテナント分離専任の具体化', 'success', '2026-07-02'),
    (v_company, '#12 キオスクは端末トークン（sha256）認証', 'development', 'セキュリティ', 'success', '2026-07-02'),
    (v_company, '#13 シフトはスタッフ主導（提出→自動ドラフト→確認確定＋出勤募集）', 'business', 'ユーザー要望による運用転換', 'pending', '2026-07-02'),
    (v_company, '#14 shift-cloudリポジトリはPublic運用', 'business', 'ユーザー決定。シークレット非混入を厳守', 'pending', '2026-07-04'),
    (v_company, '#15 Genesis Kernelはapps/genesis（2つ目のNext.jsアプリ）', 'development', '稼働中shift-cloudのリファクタリスク回避', 'pending', '2026-07-04'),
    (v_company, '#16 Kernelテーブルは同一Supabaseに追加・既存テーブル再利用', 'development', '追加のみで安全に拡張', 'pending', '2026-07-04'),
    (v_company, '#17 Kernelも既存標準準拠（RLS/論理削除/監査）', 'development', '一貫性', 'pending', '2026-07-04'),
    (v_company, '#18 Genesis UIはview_hq権限のみ・Webhookはトークン認証', 'development', 'セキュリティ', 'pending', '2026-07-04');

  -- Company Event（履歴イベント）
  insert into company_events (company_id, event_type, title, description, occurred_at, source, source_type, severity, status, related_module_id) values
    (v_company, 'dev.milestone', 'Shift Cloud MVP実装完了', 'Phase 0〜6全機能実装・next build成功', '2026-07-02', 'system', 'system', 'notice', 'resolved',
     (select id from modules where company_id = v_company and code = 'shift-cloud')),
    (v_company, 'dev.deploy', 'Shift Cloud 本番稼働開始', 'https://shift-cloud-shift-cloud.vercel.app で稼働。GitHub/Vercel連携・Supabase bootstrap完了', '2026-07-04', 'system', 'system', 'notice', 'resolved',
     (select id from modules where company_id = v_company and code = 'shift-cloud')),
    (v_company, 'dev.milestone', 'Genesis Kernel構築開始', 'Kernelテーブル群（company_events / business_memories / decision_logs / ai_agents 他16テーブル）をmigration 0004で追加', '2026-07-04', 'agent:claude', 'ai', 'notice', 'in_progress',
     (select id from modules where company_id = v_company and code = 'genesis-kernel'));

  -- Business Memory（初期の記憶）
  insert into business_memories (company_id, title, category, summary, learnings, importance, human_verified) values
    (v_company, 'claude.aiのGitHub連携とCowork内GitHub MCPは別物', 'playbook',
     'claude.aiアカウントのGitHub連携を接続してもCowork内のGitHub MCP（要個別OAuth）は使えない。2026-07-02にこれで開発が停滞した',
     'コネクタはCowork内で個別にOAuth認証が必要。詰まったら認証方式を先に確認する', 2, true),
    (v_company, 'シフト運用はスタッフ主導へ転換', 'playbook',
     '当初の管理者主導シフト作成から、スタッフ提出→自動ドラフト→管理者確認＋出勤募集方式へ転換（DECISIONS #13）',
     '現場運用に合わせた設計変更は早期に行うほうがコストが低い', 2, true);
end $$;
