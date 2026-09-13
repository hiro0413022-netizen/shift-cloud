-- 0175_perf_rls_initplan_fix.sql
-- 行ごとに auth.uid() / app.current_company_id() を呼び直していた7つのポリシーを直す。
-- （2026-09-13 適用済み）
--
-- Supabase のパフォーマンス診断（auth_rls_initplan・WARN）で出ていたもの。
-- 素直に書くと Postgres は「行ごとに関数を呼ぶ」計画を立てる。
-- (select 関数()) で包むと1回だけ評価して使い回す（InitPlan）。
-- 判定の中身は1文字も変えていない＝誰が何を見られるかは同じ。
--
-- notifications は全アプリのベルが毎回読むので、ここが一番効く。

-- ── notifications（全アプリ共通の通知）──────────────────────────────
drop policy if exists notif_select_self on public.notifications;
create policy notif_select_self on public.notifications
  for select to authenticated
  using (staff_id = (select id from public.staff where auth_user_id = (select auth.uid()) limit 1));

drop policy if exists notif_update_self on public.notifications;
create policy notif_update_self on public.notifications
  for update to authenticated
  using (staff_id = (select id from public.staff where auth_user_id = (select auth.uid()) limit 1));

-- ── staff_wages（自分の時給）───────────────────────────────────────
drop policy if exists wages_select_self on public.staff_wages;
create policy wages_select_self on public.staff_wages
  for select to authenticated
  using (
    company_id = (select app.current_company_id())
    and staff_id = (select id from public.staff where auth_user_id = (select auth.uid()) limit 1)
  );

-- ── payroll_items（自分の給与明細）─────────────────────────────────
drop policy if exists payroll_select_self on public.payroll_items;
create policy payroll_select_self on public.payroll_items
  for select to authenticated
  using (
    company_id = (select app.current_company_id())
    and staff_id = (select id from public.staff where auth_user_id = (select auth.uid()) limit 1)
  );

-- ── sp_calendar_memos（自分のカレンダーメモ）───────────────────────
drop policy if exists memos_select_self on public.sp_calendar_memos;
create policy memos_select_self on public.sp_calendar_memos
  for select to authenticated
  using (
    company_id = (select app.current_company_id())
    and staff_id = (select id from public.staff where auth_user_id = (select auth.uid()) limit 1)
  );

drop policy if exists memos_insert_self on public.sp_calendar_memos;
create policy memos_insert_self on public.sp_calendar_memos
  for insert to authenticated
  with check (
    company_id = (select app.current_company_id())
    and staff_id = (select id from public.staff where auth_user_id = (select auth.uid()) limit 1)
  );

drop policy if exists memos_update_self on public.sp_calendar_memos;
create policy memos_update_self on public.sp_calendar_memos
  for update to authenticated
  using (
    company_id = (select app.current_company_id())
    and staff_id = (select id from public.staff where auth_user_id = (select auth.uid()) limit 1)
  );
