-- 0107_incidents.sql（DECISIONS #125）
-- イレギュラー報告（日報の置き換え）
--
-- なぜ日報をやめるか:
--   「今日やったこと」を毎日書かせても、読む側に判断材料が増えない（sp_reports は運用0件のまま）。
--   欲しいのは「何かあった時の事実」で、それだけを構造化して集めれば
--   同じミス・トラブルの再発防止に直接つながる。
--
-- 設計の要点:
--   - 5W（いつ・どこ・だれ・なに・どう対応した）を列に分ける＝AIにも人にも読める
--   - カテゴリは text（CHECK にしない）。運用で増えるし、未知値で行が消える事故を避ける
--     → 正規化は packages/core/src/incidents.ts の normalizeIncidentCategory()
--   - severity='high' は即LINE通知の対象。通知済みは notified_at で二重送信を防ぐ
--   - 分析結果は sp_incident_insights に別テーブルで持つ（報告の本文はAIが絶対に書き換えない）

-- 1. 報告本体
create table if not exists sp_incidents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),               -- どこ（店舗）
  staff_id uuid not null references staff(id),       -- 報告した人
  category text not null default 'other',            -- 分類（core/incidents.ts の9種。表記ゆれはアプリ側で正規化）
  severity text not null default 'mid' check (severity in ('low', 'mid', 'high')),
  occurred_at timestamptz not null,                  -- いつ（実際に起きた日時。報告日時とは別）
  place text,                                        -- どこ（店舗内の場所: 1番打席・レジ・受付 など）
  involved text,                                     -- だれが（お客様名・スタッフ名。分からなければ空でよい）
  body text not null,                                -- なにがあったか
  action_taken text,                                 -- その場でどう対応したか
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_at timestamptz,
  resolved_by uuid references staff(id),
  resolution_note text,                              -- 最終的にどう決着したか
  ai_analysis text,                                  -- この1件に対するAIの見立て・再発防止コメント（人の本文は上書きしない）
  ai_analyzed_at timestamptz,
  notified_at timestamptz,                           -- 重大度highのLINE通知を送った時刻（再送防止）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_sp_incidents_company_occurred
  on sp_incidents (company_id, occurred_at desc) where deleted_at is null;
create index if not exists idx_sp_incidents_store_occurred
  on sp_incidents (store_id, occurred_at desc) where deleted_at is null;
create index if not exists idx_sp_incidents_open
  on sp_incidents (company_id, status) where deleted_at is null and status = 'open';
comment on table sp_incidents is 'イレギュラー報告。日報(sp_reports)の置き換え。いつ/どこ/だれ/なに/対応 を構造化して集め、再発防止分析の入力にする（#125）';

-- 2. 分析結果（繰り返しパターンと再発防止策）
--    AIが作り、人が「対応中/完了/見送り」を進める。報告本体とは分けて、後から作り直せるようにする。
create table if not exists sp_incident_insights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),               -- 特定店舗の話ならその店舗。全社なら null
  period_start date not null,                        -- 分析対象期間
  period_end date not null,
  title text not null,                               -- 見出し（例: 予約の口頭引継ぎが抜ける）
  pattern text not null,                             -- 何が繰り返されているか（事実ベース）
  cause text,                                        -- 推定原因
  prevention text not null,                          -- 再発防止策（具体的な行動）
  categories text[] not null default '{}',           -- 関連カテゴリ
  incident_ids uuid[] not null default '{}',         -- 根拠になった報告（あとから現物を確認できる）
  incident_count int not null default 0,
  status text not null default 'open' check (status in ('open', 'doing', 'done', 'dismissed')),
  status_note text,
  generated_by text not null default 'ai' check (generated_by in ('ai', 'rule', 'human')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_sp_incident_insights_company
  on sp_incident_insights (company_id, created_at desc) where deleted_at is null;
comment on table sp_incident_insights is 'イレギュラー報告の分析結果（繰り返しパターン＋再発防止策）。AIが作り人が進捗を進める（#125）';

-- 3. RLS（0039 sp_* と同型: テナント内で読み書き。実アクセスは service_role 経由）
alter table sp_incidents enable row level security;
alter table sp_incident_insights enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sp_incidents', 'sp_incident_insights']
  loop
    execute format('drop policy if exists tenant_select on %I', t);
    execute format('drop policy if exists tenant_insert on %I', t);
    execute format('drop policy if exists tenant_update on %I', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;

-- 4. 重大報告のLINE通知先: 古川博庸（Hiro）を個人連絡先として先に用意しておく。
--    line_user_id は本人がYOZAN公式LINEへ1回話しかけた時点でwebhookが自動で埋める（0103の仕組み）。
--    それまでは Genesis 画面のアラートで拾う（送れないまま黙って捨てない）。
insert into gn_line_contacts (company_id, channel_code, person_name, match_hint, note)
select ch.company_id, 'staff', '古川博庸', '古川,ふるかわ,フルカワ,furukawa,hiro',
       '重大イレギュラー報告の即時通知先（#125）。公式LINEへ1回送信すると自動リンクされる'
from gn_line_channels ch
where ch.code = 'staff'
  and not exists (
    select 1 from gn_line_contacts x
    where x.company_id = ch.company_id and x.person_name = '古川博庸' and x.deleted_at is null
  );
