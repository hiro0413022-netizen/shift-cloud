-- 0185: サイトごとに「ホームページ側の表示がつながっているか」を持つ（管理画面の注意書き用）
alter table public.hp_sites add column if not exists live boolean not null default false;
update public.hp_sites set live = true where code = 'yozan';

create or replace function public.hp_admin_me(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare u hp_users;
begin
  u := hp__user(p_token);
  return jsonb_build_object('name', u.name, 'login_id', u.login_id, 'role', u.role,
    'sites', (select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'domain', domain, 'live', live) order by sort_order)
              from hp_sites where u.role = 'owner' or code = any(u.sites)));
end $$;
