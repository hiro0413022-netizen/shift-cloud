-- 0111 シフト提出の改善（DECISIONS #131）
--  ① 休み希望（長期休暇など）を募集期間に関係なくいつでも提出できるようにする
--  ② シフトテンプレートを店舗別に分ける
--     （GOLF WING の 11:00-20:00 を FRANK GOLF に出さない）

-- ================================================================
-- ① 休み希望（staff_time_off_requests）
--    shift_requests は「募集期間(period_id)」必須なので、期間が無い先の予定を
--    入れられない。休み希望だけは期間から切り離した別テーブルで受ける。
-- ================================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'time_off_status') then
    create type time_off_status as enum ('submitted','approved','rejected','withdrawn');
  end if;
end $$;

create table if not exists staff_time_off_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  staff_id uuid not null references staff(id),
  store_id uuid references stores(id),          -- null = 所属店舗未指定
  start_date date not null,
  end_date date not null,                       -- 単日なら start_date と同じ
  kind text not null default 'day_off',         -- day_off=休み希望 / vacation=長期休暇 / other
  reason text,
  status time_off_status not null default 'submitted',
  decided_by uuid references staff(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint time_off_range_ok check (end_date >= start_date)
);

create index if not exists time_off_company_idx on staff_time_off_requests (company_id, status, start_date);
create index if not exists time_off_staff_idx   on staff_time_off_requests (staff_id, start_date);
create index if not exists time_off_store_idx   on staff_time_off_requests (store_id, start_date);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'staff_time_off_requests'::regclass) then
    create trigger set_updated_at before update on staff_time_off_requests
      for each row execute function app.set_updated_at();
  end if;
end $$;

alter table staff_time_off_requests enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='staff_time_off_requests' and policyname='tenant_select') then
    create policy tenant_select on staff_time_off_requests for select to authenticated
      using (company_id = app.current_company_id());
  end if;
end $$;
-- 書き込みは service_role（サーバーアクション）経由のみ

-- ================================================================
-- ② テンプレートの店舗別化
--    shift_templates には scope_type/scope_id が最初からあるが未使用だった。
--    scope_type='company' = 全店共通 / 'store' = その店舗だけに出す。
-- ================================================================
create index if not exists shift_templates_scope_idx
  on shift_templates (company_id, scope_type, scope_id);

-- 既存の勤務テンプレ（早番/遅番/終日/フロント＝GOLF WING の営業時間）を
-- GOLF WING 店舗専用にする。FRANK GOLF は営業時間が違うので出さない。
-- 「休み」だけは全店共通のまま残す。
update shift_templates t
   set scope_type = 'store',
       scope_id   = (select s.id from stores s
                      where s.company_id = t.company_id
                        and s.deleted_at is null
                        and s.name ilike 'GOLF WING%'
                      order by s.name limit 1)
 where t.deleted_at is null
   and t.is_day_off = false
   and t.scope_type = 'company'
   and exists (select 1 from stores s
                where s.company_id = t.company_id
                  and s.deleted_at is null
                  and s.name ilike 'GOLF WING%');
