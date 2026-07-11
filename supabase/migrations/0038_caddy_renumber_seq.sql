-- 0038_caddy_renumber_seq.sql
-- 派遣番号(seq)の振り直し（DECISIONS #46 / 一括入力とセット）
--
-- Excel運用では派遣番号が人の手作業で、前月の番号がコピペされたまま残っていた
-- （2026年6月ファイルの委託料シートに "2026-5-001" が並んでいた）。
-- 一括登録のたびにこの関数で日付順に振り直し、人が番号を触らなくて済むようにする。

create or replace function renumber_caddy_seq(p_company_id uuid, p_month date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with ordered as (
    select id,
           to_char(dispatch_date, 'YYYY-MM') || '-' ||
           lpad(row_number() over (order by dispatch_date, created_at)::text, 3, '0') as new_seq
    from cad_dispatches
    where company_id = p_company_id
      and deleted_at is null
      and date_trunc('month', dispatch_date)::date = p_month
  )
  update cad_dispatches d
  set seq = o.new_seq
  from ordered o
  where d.id = o.id and d.seq is distinct from o.new_seq;
end;
$$;

revoke execute on function renumber_caddy_seq(uuid, date) from anon, authenticated;
