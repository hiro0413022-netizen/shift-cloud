-- 0118_caddy_shift_confirm.sql
-- キャディシフト管理（小川さん依頼 / DECISIONS #140）
--
-- 目的: 「シフト希望 → 派遣確定 → 台帳反映 → ゴルフ場提出CSV」を1本のデータで回す。
--       元データは cad_dispatches ただ1つ。台帳も請求も財務もCSVも、この行から生成する。
--
-- 方針（追加のみ・論理削除 #5 / 金額integer円 #4）:
--   1. cad_dispatches に status（仮・確定・キャンセル）を追加。既存341件は既に運用中の実績なので
--      default 'confirmed' で全て確定扱いになる（請求・財務の数字は1円も動かない）。
--   2. 集計（refresh_caddy_finance）は confirmed のみを見る。仮組みが売上に混ざらない。
--   3. cad_clients に CSV書式（ゴルフ場ごとに提出フォーマットが違う）と提出先担当者を追加。
--   4. cad_partners に連絡先と本人提出用トークンを追加（スマホから出勤希望を入力してもらう口）。
--   5. cad_availability に source（管理者代理入力 / キャディ本人）を追加。

-- ============================================================
-- 1. 派遣シフトのステータス（仮・確定・キャンセル）
-- ============================================================
alter table cad_dispatches
  add column if not exists status text not null default 'confirmed',
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by uuid references staff(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cad_dispatches_status_check') then
    alter table cad_dispatches
      add constraint cad_dispatches_status_check
      check (status in ('tentative', 'confirmed', 'cancelled'));
  end if;
end $$;

-- 既存行は運用中の確定実績。確定日時が空だと台帳の並びが崩れるので作成日時で埋める
update cad_dispatches set confirmed_at = created_at
  where status = 'confirmed' and confirmed_at is null and deleted_at is null;

comment on column cad_dispatches.status is
  '仮(tentative)=カレンダー上の下書き。確定(confirmed)=正式な派遣＝台帳・請求・財務の対象。キャンセル(cancelled)=取り消し（履歴は残す）';

create index if not exists idx_cad_dispatches_month_status
  on cad_dispatches (company_id, dispatch_date, status) where deleted_at is null;

-- ============================================================
-- 2. 財務集計は「確定」のみ（仮組みが売上に混ざらないようにする）
-- ============================================================
create or replace function public.refresh_caddy_finance(p_company_id uuid, p_month date default null::date)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_seg uuid;
  v_cat_sales uuid;
  v_cat_out uuid;
  r record;
begin
  select id into v_seg from fin_segments where company_id = p_company_id and code = 'caddy' and deleted_at is null;
  if v_seg is null then return; end if;
  select id into v_cat_sales from fin_categories where code = 'sales' and deleted_at is null limit 1;
  select id into v_cat_out from fin_categories where code = 'outsourcing' and deleted_at is null limit 1;

  for r in
    select date_trunc('month', dispatch_date)::date m,
           sum(sales_amount) sales,
           sum(case when partner_id is not null then fee_amount + transport_amount + special_amount else 0 end) cost
    from cad_dispatches
    where company_id = p_company_id and deleted_at is null
      and status = 'confirmed'   -- ★ 仮・キャンセルは集計しない（0118）
      and (p_month is null or date_trunc('month', dispatch_date)::date = p_month)
    group by 1
  loop
    insert into fin_entries (company_id, segment_id, category_id, target_month, amount, memo, source)
    values (p_company_id, v_seg, v_cat_sales, r.m, r.sales, 'Caddy OS（派遣台帳から自動集計）', 'caddy_os')
    on conflict (company_id, segment_id, category_id, target_month)
    do update set amount = excluded.amount, memo = excluded.memo, source = excluded.source,
                  deleted_at = null, updated_at = now();

    insert into fin_entries (company_id, segment_id, category_id, target_month, amount, memo, source)
    values (p_company_id, v_seg, v_cat_out, r.m, r.cost, 'Caddy OS（委託料+交通費+特別手当。社員分は給与側）', 'caddy_os')
    on conflict (company_id, segment_id, category_id, target_month)
    do update set amount = excluded.amount, memo = excluded.memo, source = excluded.source,
                  deleted_at = null, updated_at = now();
  end loop;
end;
$function$;

-- 採番も確定分のみを対象にする（仮組みで番号が飛ぶのを防ぐ）
create or replace function public.renumber_caddy_seq(p_company_id uuid, p_month date)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  with ordered as (
    select id,
           to_char(dispatch_date, 'YYYY-MM') || '-' ||
           lpad(row_number() over (order by dispatch_date, created_at)::text, 3, '0') as new_seq
    from cad_dispatches
    where company_id = p_company_id
      and deleted_at is null
      and status = 'confirmed'
      and date_trunc('month', dispatch_date)::date = p_month
  )
  update cad_dispatches d
  set seq = o.new_seq
  from ordered o
  where d.id = o.id and d.seq is distinct from o.new_seq;
end;
$function$;

-- ============================================================
-- 3. ゴルフ場マスタ: 提出CSVの書式と担当者
--    ゴルフ場ごとに必要な列が違う。書式は列で持ち、生成はアプリ側の純粋関数（csv.ts）で切り替える
-- ============================================================
alter table cad_clients
  add column if not exists csv_format text not null default 'standard',
  add column if not exists contact_name text,
  add column if not exists contact_email text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cad_clients_csv_format_check') then
    alter table cad_clients
      add constraint cad_clients_csv_format_check
      check (csv_format in ('standard', 'simple', 'grouped', 'wide'));
  end if;
end $$;

comment on column cad_clients.csv_format is
  'standard=日付/ゴルフ場/キャディ名/備考, simple=日付/キャディ名, grouped=キャディ別に勤務日をまとめる, wide=日付×キャディの◯表';

-- ============================================================
-- 4. キャディマスタ: 連絡先と本人提出用トークン
--    トークンURL（/s/<token>）を LINE で1回配れば、以後は本人がスマホから希望日を入れられる
-- ============================================================
alter table cad_partners
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists submit_token text;

create unique index if not exists uq_cad_partners_submit_token
  on cad_partners (submit_token) where submit_token is not null;

comment on column cad_partners.submit_token is
  '本人用シフト希望提出URL（/s/<token>）のトークン。設定画面から発行・再発行する（漏れたら再発行で旧URLは無効）';

-- ============================================================
-- 5. シフト希望: 誰が入れたのか（管理者の代理入力 / キャディ本人）
-- ============================================================
alter table cad_availability
  add column if not exists source text not null default 'admin',
  add column if not exists submitted_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cad_availability_source_check') then
    alter table cad_availability
      add constraint cad_availability_source_check
      check (source in ('admin', 'self', 'api'));
  end if;
end $$;

create index if not exists idx_cad_availability_month
  on cad_availability (company_id, date) where deleted_at is null;
