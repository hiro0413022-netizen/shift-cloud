-- 0213: Genesis Memory（5スコープ・1表・#299・P4-a）
--   Transformation Proposal「Memory（5スコープ・1表）」: user / company / store / customer / project。
--   gn_memories(scope, scope_id, key, value, source, confidence, stated_by, expires_at)。
--   AI が自分で書いた記憶は confidence < 1 で、人が確認（memory.confirm）するまで Context には「推定」としてしか入らない。
--   既存の business_memories（経営メモ）と decision_logs（意思決定ログ）は消さず、ここへ**取り込む**（元の表は不変）。
--   追加のみ。

create table if not exists gn_memories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  scope text not null check (scope in ('user', 'company', 'store', 'customer', 'project')),
  scope_id text,                        -- user=staff.id / store=stores.id / customer=person key（電話 or 会員番号） / project=任意ID。company は null
  key text not null,                    -- 'line.hidden_staff' / 'booking.lefty_bay' / 'decision:<uuid>' …
  value text not null,                  -- 人が読める1文
  source text,                          -- 'DECISIONS #243' / 'jarvis' / 'business_memories' / 'decision_logs'
  confidence numeric(3,2) not null default 1.00 check (confidence >= 0 and confidence <= 1),
  stated_by uuid references staff(id),  -- 言った人（AI が書いたときは null）
  verified_at timestamptz,              -- 人が確認した時刻（confidence=1 に昇格）
  expires_at timestamptz,               -- 期限つきの記憶（「今月は〜」）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists uq_gn_memories_key on gn_memories (company_id, scope, coalesce(scope_id, ''), key) where deleted_at is null;
create index if not exists idx_gn_memories_scope on gn_memories (company_id, scope, scope_id) where deleted_at is null;
alter table gn_memories enable row level security;
create policy gn_memories_tenant on gn_memories for all to authenticated using (company_id = app.current_company_id()) with check (company_id = app.current_company_id());
comment on table gn_memories is 'Genesis Memory: 5スコープ（user/company/store/customer/project）の記憶。confidence<1 は AI の推定（人が確認するまで Context に「推定」として入る）#299';

-- Ask Data から読める（hq のみ。個人の記憶 user/customer は出さない）
create or replace view gnv_memories as
  select m.scope, m.scope_id, m.key, m.value, m.source, m.confidence, m.verified_at, m.created_at
  from gn_memories m
  where m.company_id = gn_ctx_company() and m.deleted_at is null and gn_ctx_is_hq() and m.scope in ('company', 'store', 'project');
revoke all on gnv_memories from public;
grant select on gnv_memories to gn_chat_reader;
grant select on gnv_memories to service_role;

-- 1. 取り込み: 経営メモ（business_memories）→ company。人が確認済みなら 1.0、AI 生成の未確認は 0.6
insert into gn_memories (company_id, scope, scope_id, key, value, source, confidence, verified_at, created_at)
select b.company_id, 'company', null, 'bm:' || b.id::text,
       b.title || '： ' || b.summary,
       'business_memories' || case when b.category is not null then ' (' || b.category || ')' else '' end,
       case when b.human_verified or not b.ai_generated then 1.00 else 0.60 end,
       case when b.human_verified then b.updated_at else null end,
       b.created_at
from business_memories b
where b.deleted_at is null
on conflict do nothing;

-- 2. 取り込み: 意思決定ログ（decision_logs）→ company（Decision Log 取込）。人が決めたものなので 1.0
insert into gn_memories (company_id, scope, scope_id, key, value, source, confidence, stated_by, verified_at, created_at)
select d.company_id, 'company', null, 'decision:' || d.id::text,
       d.title || case when coalesce(d.selected_option, '') <> '' then ' → ' || d.selected_option else '' end
               || case when coalesce(d.reason, '') <> '' then '（理由: ' || d.reason || '）' else '' end
               || case when d.outcome <> 'pending' then '［結果: ' || d.outcome || '］' else '' end,
       'decision_logs (' || d.decision_type || ')', 1.00, d.decided_by, d.decided_at, d.decided_at
from decision_logs d
where d.deleted_at is null
on conflict do nothing;

-- 3. コードに埋まっていたルールを Memory へ（外販の前提: テナントごとに差し替えられる）。YOZAN だけ
--    （適用時に「店舗を持つ会社」で入れてしまいサンプルテナント2社に付いたので、その6行は適用後に削除した）
insert into gn_memories (company_id, scope, scope_id, key, value, source, confidence, verified_at)
select c.id, v.scope, v.scope_id, v.key, v.value, v.source, 1.00, now()
from companies c
cross join (values
  ('company', null::text, 'line.hidden_staff', '藤田プロの名前は公式LINE（お客様向け・スタッフ向けとも）に一切出さない', 'DECISIONS #243'),
  ('company', null, 'caddy.no_provisional_on_exports', 'ゴルフ場への提出物（CSV/PDF）に「仮」の割当を出さない', 'DECISIONS #145'),
  ('company', null, 'sales.goods_tax_excluded', '物販の売上は税抜で扱う', 'report-os 月次資料'),
  ('store', 'b54afb9f-22aa-4f4e-b758-bc2157acfdd5', 'booking.lefty_bay', 'レフティのお客様の打席は B（自動割当は A→B→C）', 'DECISIONS #92'),
  ('store', 'b54afb9f-22aa-4f4e-b758-bc2157acfdd5', 'billing.monthly_on_10th', '月会費は毎月10日に翌月分を請求する', 'DECISIONS #235')
) as v(scope, scope_id, key, value, source)
where c.deleted_at is null
  and c.name = '株式会社YOZAN'
  and exists (select 1 from stores s where s.company_id = c.id and s.id = coalesce(v.scope_id::uuid, s.id) and s.deleted_at is null)
on conflict do nothing;
