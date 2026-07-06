-- 0016 シフト機能拡張
--  ③ 募集期間を月単位以外（前半/後半/2週間/任意期間）に対応
--  ② スタッフ提出・シフトで任意の開始/終了時刻を入力可能に
--  ⑥ 打刻端末からの伝言・打刻忘れ連絡（kiosk_messages）

-- ③ 募集期間の柔軟化 -----------------------------------------------------------
-- period_type: month=月 / half1=前半(1-15) / half2=後半(16-末) / biweekly=2週間 / custom=任意
alter table shift_request_periods
  add column if not exists period_type text not null default 'month',
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists title text;

-- 既存行（月単位）に start/end を補完
update shift_request_periods
   set start_date = date_trunc('month', target_month)::date,
       end_date   = (date_trunc('month', target_month) + interval '1 month - 1 day')::date
 where start_date is null;

-- ② 任意時刻（テンプレ未使用の直接入力） --------------------------------------
alter table shift_requests
  add column if not exists start_time time,
  add column if not exists end_time   time;

-- ⑥ 打刻端末メッセージ（伝言 / 打刻忘れ連絡） --------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'kiosk_message_kind') then
    create type kiosk_message_kind as enum ('missing_clock','message');
  end if;
end $$;

create table if not exists kiosk_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid not null references stores(id),
  staff_id uuid references staff(id),
  device_id uuid references kiosk_devices(id),
  kind kiosk_message_kind not null default 'message',
  body text not null,
  resolved boolean not null default false,
  resolved_by uuid references staff(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists kiosk_messages_company_idx on kiosk_messages (company_id, created_at desc);
create index if not exists kiosk_messages_store_open_idx on kiosk_messages (store_id, resolved);

alter table kiosk_messages enable row level security;
-- 参照は自社のみ（書き込みは service_role 経由のサーバアクション）
do $$ begin
  if not exists (select 1 from pg_policies where tablename='kiosk_messages' and policyname='tenant_select') then
    create policy tenant_select on kiosk_messages for select to authenticated
      using (company_id = app.current_company_id());
  end if;
end $$;
