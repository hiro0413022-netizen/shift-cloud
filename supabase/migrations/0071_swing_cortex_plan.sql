-- 0071_swing_cortex_plan.sql
-- SWING CORTEX P4 — エディション（プラン）制 / docs/modules/swing-cortex/SYSTEM.md §12
--
-- 販売モデル: 外販は「standard」= P1+P2 のみ（症状診断・ライブラリ・インサイト・AIコメント作成）。
--             自社GOLF WING等は「pro」= 全機能（+ P3 生徒コンテキスト/カルテCRM）。
-- テナント単位で機能を出し分けるための1行設定。行が無ければ standard 扱い（＝安全側＝売る仕様）。
-- 追加のみ（DECISIONS #2）。

create table if not exists sc_settings (
  company_id uuid primary key references companies(id),
  plan text not null default 'standard' check (plan in ('standard','pro')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at トリガ
do $$
begin
  execute 'drop trigger if exists set_updated_at on sc_settings';
  execute 'create trigger set_updated_at before update on sc_settings for each row execute function app.set_updated_at()';
end $$;

-- RLS: 参照は自テナントのみ。プラン変更はservice_role（AI/運営）だけ＝顧客は自分で上げられない。
alter table sc_settings enable row level security;
drop policy if exists tenant_select on sc_settings;
create policy tenant_select on sc_settings for select to authenticated
  using (company_id = app.current_company_id());

-- 自社（GOLF WING）を pro に。store code 'golf'（0007_golfwing_schema）の会社を対象。存在すれば投入。
insert into sc_settings (company_id, plan, note)
select distinct s.company_id, 'pro', '自社運用（全機能）'
from stores s
where s.code = 'golf'
on conflict (company_id) do update set plan = 'pro';
