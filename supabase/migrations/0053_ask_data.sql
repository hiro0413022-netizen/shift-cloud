-- 0053_ask_data.sql
-- 接地チャット（Ask Data）: 「先月の体験予約は何件？」に実データで答える
--
-- 設計の要点（ハルシネーション対策と権限）:
--  1. LLMは公開ビュー gnv_* に対する SELECT しか書けない。
--     実体テーブルへの権限を持たないDBロール gn_chat_reader が SECURITY DEFINER で実行するため、
--     仮に文字列ガードを抜けられても実体テーブルには一切到達できない（多層防御）。
--  2. 会社スコープ・店舗スコープ・hq/store スコープは GUC (gn.company_id / gn.store_id / gn.scope)
--     でビュー側が強制する。アプリが渡すSQLの中身に依存しない。
--  3. 給与・経理・契約・問い合わせは scope='hq' のときだけ行が返る（店長版では0行）。
--  4. 実行したSQLと結果件数を gn_chat_messages に必ず残す（出典表示・監査）。
-- 追加のみ（DECISIONS #2）。

-- ============================================================
-- 1. スコープ用GUC
-- ============================================================
create or replace function gn_ctx_company() returns uuid
  language sql stable as $$ select nullif(current_setting('gn.company_id', true), '')::uuid $$;

create or replace function gn_ctx_store() returns uuid
  language sql stable as $$ select nullif(current_setting('gn.store_id', true), '')::uuid $$;

create or replace function gn_ctx_is_hq() returns boolean
  language sql stable as $$ select coalesce(nullif(current_setting('gn.scope', true), ''), 'store') = 'hq' $$;

-- 店舗スコープ判定: gn.store_id が未設定なら全店（HQ）、設定されていればその店舗のみ
create or replace function gn_store_ok(p_store_id uuid) returns boolean
  language sql stable as $$ select gn_ctx_store() is null or p_store_id = gn_ctx_store() $$;

-- ============================================================
-- 2. 公開ビュー gnv_*（LLMが触れてよい唯一の面）
--    ※ security_invoker は付けない = ビュー所有者(postgres)権限で動きRLSを迂回。
--      スコープ制御は下の where 句が担う。
-- ============================================================

-- 店舗マスタ
create or replace view gnv_stores as
  select s.id as store_id, s.name as store_name, s.code as store_code,
         b.name as brand_name, s.segment_id, s.status
  from stores s left join brands b on b.id = s.brand_id
  where s.company_id = gn_ctx_company() and s.deleted_at is null
    and gn_store_ok(s.id);
comment on view gnv_stores is 'Ask Data: 店舗マスタ';

-- スタッフ（個人情報は名前・役職まで。メール等は出さない）
create or replace view gnv_staff as
  select st.id as staff_id, st.name as staff_name, st.position,
         st.employment_type::text as employment_type, st.status::text as status
  from staff st
  where st.company_id = gn_ctx_company() and st.deleted_at is null;
comment on view gnv_staff is 'Ask Data: スタッフ一覧（金額情報なし）';

-- 店頭売上（決済台帳）
create or replace view gnv_sales as
  select ms.id as sale_id, ms.sold_on, ms.category, ms.member_kind,
         ms.amount, ms.tax_included, ms.pay_method, ms.customer_name,
         ms.store_id, s.name as store_name, seg.name as segment_name
  from mon_sales ms
  left join stores s on s.id = ms.store_id
  left join fin_segments seg on seg.id = ms.segment_id
  where ms.company_id = gn_ctx_company() and ms.deleted_at is null
    and gn_store_ok(ms.store_id);
comment on view gnv_sales is 'Ask Data: 店頭売上（1行=1決済）。amount=税抜, tax_included=税込';

-- 物販・フィッティング明細
create or replace view gnv_sales_lines as
  select sl.id as line_id, sl.sold_on, sl.item_category, sl.item_type, sl.maker,
         sl.product_name, sl.list_price, sl.discount, sl.sale_price, sl.qty,
         sl.amount, sl.tax_included, sl.pay_method, sl.member_kind, sl.pro,
         sl.store_id, s.name as store_name
  from mon_sales_lines sl
  left join stores s on s.id = sl.store_id
  where sl.company_id = gn_ctx_company() and sl.deleted_at is null
    and gn_store_ok(sl.store_id);
comment on view gnv_sales_lines is 'Ask Data: 物販/フィッティング明細（1行=1商品）';

-- 月次収支（事業別）
create or replace view gnv_finance as
  select fe.target_month, seg.name as segment_name, fc.name as category_name,
         fc.kind as category_kind, fe.amount, fe.memo, fe.source
  from fin_entries fe
  left join fin_segments seg on seg.id = fe.segment_id
  left join fin_categories fc on fc.id = fe.category_id
  where fe.company_id = gn_ctx_company() and fe.deleted_at is null
    and gn_ctx_is_hq();
comment on view gnv_finance is 'Ask Data: 月次収支。category_kind=income/expense。HQのみ';

-- KPI
create or replace view gnv_kpi as
  select k.code, k.name, k.area, k.unit, k.current_value, k.target_value, k.period, k.notes
  from kpis k
  where k.company_id = gn_ctx_company() and k.deleted_at is null;
comment on view gnv_kpi is 'Ask Data: 5大KPI等（monthly_sales/members/trial_bookings/churn_rate/labor_cost_ratio）';

-- 会員
create or replace view gnv_members as
  select m.member_no, m.name as member_name, m.gender, m.age,
         m.join_date, m.leave_date, m.leave_reason, m.member_type, m.class_name,
         m.store_name, m.campaign, m.payment_method, m.monthly_visits, m.last_visit_date,
         (m.leave_date is null) as is_active
  from mbr_members m
  where m.company_id = gn_ctx_company()
    and (gn_ctx_store() is null
         or m.store_name = (select name from stores where id = gn_ctx_store()));
comment on view gnv_members is 'Ask Data: 会員。leave_date が null = 在籍中（is_active）';

-- 体験予約
create or replace view gnv_trials as
  select t.booking_seq, t.program, t.lesson_date, t.start_time, t.status,
         t.joined, t.joined_at, t.decline_reason, t.source, t.created_at,
         t.store_id, s.name as store_name
  from mbr_trial_bookings t
  left join stores s on s.id = t.store_id
  where t.company_id = gn_ctx_company() and t.deleted_at is null
    and gn_store_ok(t.store_id);
comment on view gnv_trials is 'Ask Data: 体験レッスン予約。joined=true が入会';

-- シフト
create or replace view gnv_shifts as
  select sh.date, sh.start_time, sh.end_time, sh.is_day_off, sh.status::text as status,
         sh.store_id, s.name as store_name, sh.staff_id, st.name as staff_name
  from shifts sh
  left join stores s on s.id = sh.store_id
  left join staff st on st.id = sh.staff_id
  where sh.company_id = gn_ctx_company() and sh.deleted_at is null
    and gn_store_ok(sh.store_id);
comment on view gnv_shifts is 'Ask Data: シフト（予定）';

-- 勤怠
create or replace view gnv_attendance as
  select a.date, a.clock_in, a.clock_out,
         coalesce(a.break_override_minutes, a.break_minutes) as break_minutes,
         a.work_minutes, a.overtime_minutes, a.late_minutes, a.early_leave_minutes,
         a.is_missing_clock, a.status::text as status,
         a.store_id, s.name as store_name, a.staff_id, st.name as staff_name
  from attendance_days a
  left join stores s on s.id = a.store_id
  left join staff st on st.id = a.staff_id
  where a.company_id = gn_ctx_company()
    and gn_store_ok(a.store_id);
comment on view gnv_attendance is 'Ask Data: 勤怠実績（分単位）';

-- 給与（HQのみ）
create or replace view gnv_payroll as
  select pp.target_month, pp.status::text as period_status,
         st.name as staff_name, st.position, st.employment_type::text as employment_type,
         pi.work_minutes, pi.overtime_minutes, pi.base_amount, pi.overtime_amount,
         pi.commute_amount, pi.allowance_amount, pi.deduction_amount, pi.total_amount
  from payroll_items pi
  join payroll_periods pp on pp.id = pi.period_id
  left join staff st on st.id = pi.staff_id
  where pi.company_id = gn_ctx_company()
    and gn_ctx_is_hq();
comment on view gnv_payroll is 'Ask Data: 給与明細（個人別）。HQのみ・店長版では0行';

-- 経費（HQのみ）
create or replace view gnv_expenses as
  select e.spent_on, e.item, e.payee, e.amount, e.method, e.category, e.memo,
         seg.name as segment_name, s.name as store_name
  from mon_expense e
  left join fin_segments seg on seg.id = e.segment_id
  left join stores s on s.id = e.store_id
  where e.company_id = gn_ctx_company() and e.deleted_at is null
    and gn_ctx_is_hq();
comment on view gnv_expenses is 'Ask Data: 経費。HQのみ';

-- 銀行/カード明細（HQのみ）
create or replace view gnv_bank_txn as
  select t.txn_date, t.description, t.amount, t.balance, t.category, t.status, t.memo,
         src.name as source_name, seg.name as segment_name
  from mon_bank_txn t
  left join mon_bank_source src on src.id = t.source_id
  left join fin_segments seg on seg.id = t.segment_id
  where t.company_id = gn_ctx_company() and t.deleted_at is null
    and gn_ctx_is_hq();
comment on view gnv_bank_txn is 'Ask Data: 銀行/カード取引。status=未分類の抽出に使う。HQのみ';

-- 問い合わせ（HQのみ・本文は出さない）
create or replace view gnv_inquiries as
  select i.received_at, i.source, i.inquiry_type, i.priority, i.from_name,
         i.subject, i.status, i.ai_summary, i.reply_sent_at
  from sec_inquiries i
  where i.company_id = gn_ctx_company() and i.deleted_at is null
    and gn_ctx_is_hq();
comment on view gnv_inquiries is 'Ask Data: 問い合わせ。HQのみ';

-- 契約（HQのみ）
create or replace view gnv_contracts as
  select d.doc_type, d.title, d.counterparty, d.status, d.effective_date, d.expiry_date,
         d.auto_renew, d.renewal_notice_days, d.next_action_date, d.amount, d.risk_level,
         d.summary, seg.name as segment_name
  from leg_documents d
  left join fin_segments seg on seg.id = d.segment_id
  where d.company_id = gn_ctx_company() and d.deleted_at is null
    and gn_ctx_is_hq();
comment on view gnv_contracts is 'Ask Data: 契約書。expiry_date で期限切れ抽出。HQのみ';

-- キャディ派遣（HQのみ）
create or replace view gnv_caddy as
  select d.seq, d.dispatch_date, d.kind, c.name as client_name, c.unit_price,
         d.sales_amount, p.name as partner_name, st.name as staff_name,
         d.fee_amount, d.transport_amount, d.special_amount,
         (d.sales_amount - coalesce(d.fee_amount,0) - coalesce(d.transport_amount,0)
            - coalesce(d.special_amount,0)) as gross_profit
  from cad_dispatches d
  left join cad_clients c on c.id = d.client_id
  left join cad_partners p on p.id = d.partner_id
  left join staff st on st.id = d.staff_id
  where d.company_id = gn_ctx_company() and d.deleted_at is null
    and gn_ctx_is_hq();
comment on view gnv_caddy is 'Ask Data: キャディ派遣（1行=1派遣）。社員派遣は原価0。HQのみ';

-- ============================================================
-- 3. 実行ロール（実体テーブルへの権限を持たない）
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'gn_chat_reader') then
    create role gn_chat_reader nologin;
  end if;
end $$;

-- usage: ビュー参照用 / create: 関数の所有者になるためPostgresが要求する（DDL自体はガードで禁止）
grant usage, create on schema public to gn_chat_reader;
grant execute on function gn_ctx_company(), gn_ctx_store(), gn_ctx_is_hq(), gn_store_ok(uuid) to gn_chat_reader;
grant select on
  gnv_stores, gnv_staff, gnv_sales, gnv_sales_lines, gnv_finance, gnv_kpi,
  gnv_members, gnv_trials, gnv_shifts, gnv_attendance, gnv_payroll,
  gnv_expenses, gnv_bank_txn, gnv_inquiries, gnv_contracts, gnv_caddy
  to gn_chat_reader;

-- ============================================================
-- 4. 実行関数（SELECT限定・単文・タイムアウト・LIMIT強制）
-- ============================================================
create or replace function gn_chat_query(
  p_sql text,
  p_company_id uuid,
  p_scope text default 'store',
  p_store_id uuid default null,
  p_limit int default 200
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sql text := btrim(regexp_replace(p_sql, ';\s*$', ''));
  v_result jsonb;
  v_ref text;
begin
  if p_scope not in ('hq', 'store') then
    raise exception 'invalid scope';
  end if;
  if v_sql = '' then
    raise exception 'empty query';
  end if;
  -- 単文のみ
  if position(';' in v_sql) > 0 then
    raise exception 'single statement only';
  end if;
  -- SELECT / WITH で始まること
  if v_sql !~* '^\s*(select|with)\s' then
    raise exception 'SELECT only';
  end if;
  -- 書き込み・DDL・システム関数の禁止
  if v_sql ~* '\y(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do|vacuum|analyze|reindex|refresh|listen|notify|execute|prepare|set|reset|lock|comment|pg_sleep|pg_read_file|dblink|current_setting|set_config)\y' then
    raise exception 'forbidden keyword';
  end if;
  -- 参照できるのは gnv_* のみ
  for v_ref in
    select (regexp_matches(v_sql, '\y(?:from|join)\s+([a-zA-Z_][a-zA-Z0-9_\.]*)', 'gi'))[1]
  loop
    if lower(v_ref) not like 'gnv\_%' then
      raise exception 'table not allowed: %', v_ref;
    end if;
  end loop;

  -- スコープをGUCで固定（ビュー側が強制する）
  perform set_config('gn.company_id', p_company_id::text, true);
  perform set_config('gn.scope', p_scope, true);
  perform set_config('gn.store_id', coalesce(p_store_id::text, ''), true);
  perform set_config('statement_timeout', '8s', true);

  execute format(
    'select coalesce(jsonb_agg(t), ''[]''::jsonb) from (select * from (%s) q limit %s) t',
    v_sql, greatest(1, least(p_limit, 500))
  ) into v_result;

  return v_result;
end $$;

-- 所有者を実権限なしロールに移す（多層防御の要）。移すには自分がそのロールのメンバである必要がある
do $$ begin execute format('grant gn_chat_reader to %I', current_user); exception when others then null; end $$;
alter function gn_chat_query(text, uuid, text, uuid, int) owner to gn_chat_reader;
revoke all on function gn_chat_query(text, uuid, text, uuid, int) from public;
grant execute on function gn_chat_query(text, uuid, text, uuid, int) to service_role;

comment on function gn_chat_query(text, uuid, text, uuid, int) is
  'Ask Data: LLM生成SQLの安全実行。gnv_*のみ・SELECTのみ・単文・8秒・LIMIT付き。実行ロールは実体テーブル権限なし';

-- ============================================================
-- 5. 履歴（出典表示・監査）
-- ============================================================
create table if not exists gn_chat_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  scope text not null check (scope in ('hq', 'store')),
  store_id uuid references stores(id),
  question text not null,
  generated_sql text,
  answer text,
  row_count int,
  engine text not null default 'claude' check (engine in ('claude', 'error', 'refused')),
  error text,
  elapsed_ms int,
  created_at timestamptz not null default now()
);
create index if not exists idx_gn_chat_company on gn_chat_messages (company_id, created_at desc);
create index if not exists idx_gn_chat_staff on gn_chat_messages (staff_id, created_at desc);
comment on table gn_chat_messages is 'Ask Dataの全質問ログ（質問・生成SQL・回答・件数）。出典表示と監査に使う';

alter table gn_chat_messages enable row level security;
drop policy if exists tenant_select on gn_chat_messages;
create policy tenant_select on gn_chat_messages for select to authenticated
  using (company_id = app.current_company_id());
