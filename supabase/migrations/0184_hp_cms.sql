-- 0184_hp_cms.sql  (#249 HP管理：3サイト共通のノーコード編集・ブログ・インスタ・閲覧計測)
-- 設計:
--  * テーブルは全部 RLS ON・ポリシー無し（anon/authenticated は直接読めない）。
--  * 公開サイトは hp_public_* RPC（SECURITY DEFINER・anon実行可）で「公開中のものだけ」読む。
--  * 管理画面は hp_login でセッショントークンを受け取り、以後 hp_admin_* RPC にトークンを渡す。
--    トークンはDBにsha256だけ保存。パスワードは pgcrypto の bcrypt。
--  * 写真のアップロードだけは Edge Function hp-admin（service_role）が hp-media バケットへ入れる。

create table if not exists public.hp_sites (
  code text primary key,
  name text not null,
  domain text not null,
  company_id uuid references public.companies(id),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.hp_users (
  id uuid primary key default gen_random_uuid(),
  login_id text not null unique,
  name text not null,
  password_hash text not null,
  role text not null default 'editor',            -- owner | editor
  sites text[] not null default array['yozan','frank-golf','kallinos'],
  failed_count int not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.hp_sessions (
  token_hash text primary key,
  user_id uuid not null references public.hp_users(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists hp_sessions_user_idx on public.hp_sessions(user_id);

-- 差し替え可能な枠（写真・文言）。value が null なら default_value を使う
create table if not exists public.hp_slots (
  site text not null references public.hp_sites(code),
  key text not null,
  kind text not null default 'image',             -- image | text | longtext
  page_label text not null,
  label text not null,
  help text,
  default_value text,
  value text,
  sort_order int not null default 0,
  updated_by text,
  updated_at timestamptz,
  primary key (site, key)
);

create table if not exists public.hp_posts (
  id uuid primary key default gen_random_uuid(),
  site text not null references public.hp_sites(code),
  slug text not null,
  title text not null,
  excerpt text,
  body text not null default '',
  cover_url text,
  category text not null default 'お知らせ',
  status text not null default 'draft',          -- draft | published
  published_at timestamptz,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  deleted_at timestamptz
);
create unique index if not exists hp_posts_site_slug_uq on public.hp_posts(site, slug) where deleted_at is null;
create index if not exists hp_posts_pub_idx on public.hp_posts(site, published_at desc) where deleted_at is null and status = 'published';

create table if not exists public.hp_instagram (
  id uuid primary key default gen_random_uuid(),
  site text not null references public.hp_sites(code),
  permalink text not null,
  caption text,
  visible boolean not null default true,
  posted_on date,
  created_at timestamptz not null default now(),
  created_by text,
  deleted_at timestamptz
);
create index if not exists hp_instagram_site_idx on public.hp_instagram(site, created_at desc) where deleted_at is null;

create table if not exists public.hp_media (
  id uuid primary key default gen_random_uuid(),
  site text not null references public.hp_sites(code),
  path text not null,
  url text not null,
  bytes int,
  width int,
  height int,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.hp_page_views (
  id bigserial primary key,
  site text not null references public.hp_sites(code),
  path text not null,
  title text,
  source text not null,          -- google/yahoo/bing/instagram/facebook/line/x/other/direct
  referrer_host text,
  visitor_id text,
  session_id text,
  device text,                   -- mobile | desktop
  post_slug text,
  created_at timestamptz not null default now()
);
create index if not exists hp_page_views_site_time_idx on public.hp_page_views(site, created_at desc);

-- Google Search Console の日次集計（hp-admin が取り込む）
create table if not exists public.hp_gsc_daily (
  site text not null references public.hp_sites(code),
  day date not null,
  dim text not null,              -- total | query | page
  dim_value text not null default '',
  clicks int not null default 0,
  impressions int not null default 0,
  position numeric,
  primary key (site, day, dim, dim_value)
);

-- 連携設定（Search Console のサービスアカウント等）。service_role 専用
create table if not exists public.hp_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.hp_sites enable row level security;
alter table public.hp_users enable row level security;
alter table public.hp_sessions enable row level security;
alter table public.hp_slots enable row level security;
alter table public.hp_posts enable row level security;
alter table public.hp_instagram enable row level security;
alter table public.hp_media enable row level security;
alter table public.hp_page_views enable row level security;
alter table public.hp_gsc_daily enable row level security;
alter table public.hp_settings enable row level security;

revoke all on public.hp_sites, public.hp_users, public.hp_sessions, public.hp_slots, public.hp_posts,
  public.hp_instagram, public.hp_media, public.hp_page_views, public.hp_gsc_daily, public.hp_settings
  from anon, authenticated;
grant all on public.hp_sites, public.hp_users, public.hp_sessions, public.hp_slots, public.hp_posts,
  public.hp_instagram, public.hp_media, public.hp_page_views, public.hp_gsc_daily, public.hp_settings
  to service_role;
grant usage, select on sequence public.hp_page_views_id_seq to service_role;

-- ───────────────────────── 公開用 ─────────────────────────
create or replace function public.hp_public_site(p_site text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'slots', coalesce((select jsonb_object_agg(key, coalesce(nullif(value,''), default_value))
                       from hp_slots where site = p_site), '{}'::jsonb),
    'posts', coalesce((select jsonb_agg(p order by p->>'published_at' desc) from (
                select jsonb_build_object('slug', slug, 'title', title, 'excerpt', excerpt, 'cover_url', cover_url,
                         'category', category, 'published_at', published_at) p
                from hp_posts where site = p_site and status = 'published' and deleted_at is null
                  and published_at <= now()
                order by published_at desc limit 50) x), '[]'::jsonb),
    'instagram', coalesce((select jsonb_agg(jsonb_build_object('permalink', permalink, 'caption', caption)
                           order by coalesce(posted_on, created_at::date) desc, created_at desc)
                           from hp_instagram where site = p_site and visible and deleted_at is null), '[]'::jsonb)
  );
$$;

create or replace function public.hp_public_post(p_site text, p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('slug', slug, 'title', title, 'excerpt', excerpt, 'body', body, 'cover_url', cover_url,
           'category', category, 'published_at', published_at, 'author_name', author_name, 'updated_at', updated_at)
  from hp_posts
  where site = p_site and slug = p_slug and status = 'published' and deleted_at is null and published_at <= now()
  limit 1;
$$;

-- 閲覧の記録（サイトのビーコンから・anon）
create or replace function public.hp_track(p_site text, p_path text, p_referrer text, p_src text,
  p_visitor text, p_session text, p_title text, p_device text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_host text; v_source text; v_domain text; v_slug text;
begin
  select domain into v_domain from hp_sites where code = p_site;
  if v_domain is null or p_path is null or length(p_path) > 300 then return; end if;
  if p_visitor is not null and exists (
      select 1 from hp_page_views where site = p_site and visitor_id = left(p_visitor,64) and path = left(p_path,300)
        and created_at > now() - interval '10 seconds') then
    return; -- 連打・二重送信は数えない
  end if;
  v_host := lower(substring(coalesce(p_referrer,'') from '^[a-z]+://([^/:?#]+)'));
  v_source := case
    when coalesce(p_src,'') <> '' then left(lower(p_src),30)
    when v_host is null or v_host = '' then 'direct'
    when v_host like '%' || v_domain or v_host like '%.vercel.app' then 'internal'
    when v_host ~ '(^|\.)google\.' then 'google'
    when v_host ~ '(^|\.)yahoo\.' then 'yahoo'
    when v_host ~ '(^|\.)bing\.com$' then 'bing'
    when v_host ~ 'instagram\.com$' then 'instagram'
    when v_host ~ '(facebook\.com|fb\.me)$' then 'facebook'
    when v_host ~ '(^|\.)line\.(me|naver\.jp)$' or v_host like '%line-apps%' then 'line'
    when v_host in ('t.co','x.com','twitter.com') then 'x'
    when v_host ~ '(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$' then 'ai'
    else 'other' end;
  v_slug := substring(p_path from '^/blog/([^/?#]+)');
  insert into hp_page_views(site, path, title, source, referrer_host, visitor_id, session_id, device, post_slug)
  values (p_site, left(p_path,300), left(p_title,200), v_source, left(v_host,120), left(p_visitor,64),
          left(p_session,64), case when p_device = 'mobile' then 'mobile' else 'desktop' end, left(v_slug,120));
end $$;

-- ───────────────────────── 管理（トークン認証） ─────────────────────────
create or replace function public.hp__user(p_token text, p_site text default null)
returns public.hp_users language plpgsql stable security definer set search_path = public, extensions as $$
declare u hp_users;
begin
  select usr.* into u from hp_sessions s join hp_users usr on usr.id = s.user_id
   where s.token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex')
     and s.expires_at > now() and usr.deleted_at is null;
  if u.id is null then raise exception 'HP_AUTH: ログインが切れました。もう一度ログインしてください'; end if;
  if p_site is not null and not (p_site = any(u.sites)) and u.role <> 'owner' then
    raise exception 'HP_AUTH: このサイトを編集する権限がありません';
  end if;
  return u;
end $$;

create or replace function public.hp_login(p_login text, p_password text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u hp_users; v_token text;
begin
  select * into u from hp_users where login_id = lower(trim(p_login)) and deleted_at is null;
  if u.id is null then
    perform pg_sleep(0.5);
    raise exception 'HP_LOGIN: IDかパスワードが違います';
  end if;
  if u.locked_until is not null and u.locked_until > now() then
    raise exception 'HP_LOGIN: 失敗が続いたため15分ロック中です';
  end if;
  if u.password_hash <> extensions.crypt(coalesce(p_password,''), u.password_hash) then
    update hp_users set failed_count = failed_count + 1,
      locked_until = case when failed_count + 1 >= 8 then now() + interval '15 minutes' else null end
     where id = u.id;
    perform pg_sleep(0.5);
    raise exception 'HP_LOGIN: IDかパスワードが違います';
  end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into hp_sessions(token_hash, user_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), u.id, now() + interval '30 days');
  update hp_users set failed_count = 0, locked_until = null, last_login_at = now() where id = u.id;
  delete from hp_sessions where expires_at < now();
  return jsonb_build_object('token', v_token, 'name', u.name, 'role', u.role, 'sites', u.sites);
end $$;

create or replace function public.hp_logout(p_token text)
returns void language sql security definer set search_path = public, extensions as $$
  delete from hp_sessions where token_hash = encode(extensions.digest(coalesce(p_token,''), 'sha256'), 'hex');
$$;

create or replace function public.hp_change_password(p_token text, p_old text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u hp_users;
begin
  u := hp__user(p_token);
  if u.password_hash <> extensions.crypt(coalesce(p_old,''), u.password_hash) then
    raise exception 'HP_INPUT: 今のパスワードが違います';
  end if;
  if length(coalesce(p_new,'')) < 8 then raise exception 'HP_INPUT: 新しいパスワードは8文字以上にしてください'; end if;
  update hp_users set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) where id = u.id;
  -- 他の端末のログインは切る（今の端末は残す）
  delete from hp_sessions where user_id = u.id
    and token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex');
end $$;

create or replace function public.hp_admin_me(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare u hp_users;
begin
  u := hp__user(p_token);
  return jsonb_build_object('name', u.name, 'login_id', u.login_id, 'role', u.role,
    'sites', (select jsonb_agg(jsonb_build_object('code', code, 'name', name, 'domain', domain) order by sort_order)
              from hp_sites where u.role = 'owner' or code = any(u.sites)));
end $$;

create or replace function public.hp_admin_site(p_token text, p_site text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare u hp_users;
begin
  u := hp__user(p_token, p_site);
  return jsonb_build_object(
    'slots', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'kind', kind, 'page_label', page_label,
               'label', label, 'help', help, 'default_value', default_value, 'value', value,
               'updated_by', updated_by, 'updated_at', updated_at) order by sort_order, key)
             from hp_slots where site = p_site), '[]'::jsonb),
    'posts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'title', title, 'excerpt', excerpt,
               'body', body, 'cover_url', cover_url, 'category', category, 'status', status,
               'published_at', published_at, 'author_name', author_name, 'updated_at', updated_at,
               'updated_by', updated_by) order by coalesce(published_at, created_at) desc)
             from hp_posts where site = p_site and deleted_at is null), '[]'::jsonb),
    'instagram', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'permalink', permalink, 'caption', caption,
               'visible', visible, 'posted_on', posted_on, 'created_at', created_at, 'created_by', created_by)
               order by coalesce(posted_on, created_at::date) desc, created_at desc)
             from hp_instagram where site = p_site and deleted_at is null), '[]'::jsonb),
    'media', coalesce((select jsonb_agg(jsonb_build_object('url', url, 'created_at', created_at) order by created_at desc)
             from (select * from hp_media where site = p_site order by created_at desc limit 60) m), '[]'::jsonb)
  );
end $$;

create or replace function public.hp_admin_save_slot(p_token text, p_site text, p_key text, p_value text)
returns void language plpgsql security definer set search_path = public as $$
declare u hp_users;
begin
  u := hp__user(p_token, p_site);
  update hp_slots set value = nullif(trim(p_value), ''), updated_by = u.name, updated_at = now()
   where site = p_site and key = p_key;
  if not found then raise exception 'HP_INPUT: その枠はありません'; end if;
end $$;

create or replace function public.hp_admin_save_post(p_token text, p_site text, p_post jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare u hp_users; v_id uuid; v_slug text; v_status text; v_pub timestamptz;
begin
  u := hp__user(p_token, p_site);
  if coalesce(trim(p_post->>'title'),'') = '' then raise exception 'HP_INPUT: タイトルを入れてください'; end if;
  v_status := case when p_post->>'status' = 'published' then 'published' else 'draft' end;
  v_pub := nullif(p_post->>'published_at','')::timestamptz;
  if v_status = 'published' and v_pub is null then v_pub := now(); end if;
  v_slug := lower(regexp_replace(coalesce(nullif(trim(p_post->>'slug'),''), ''), '[^a-zA-Z0-9-]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then v_slug := to_char(coalesce(v_pub, now()) at time zone 'Asia/Tokyo', 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 5); end if;
  v_id := nullif(p_post->>'id','')::uuid;
  if exists (select 1 from hp_posts where site = p_site and slug = v_slug and deleted_at is null
             and (v_id is null or id <> v_id)) then
    raise exception 'HP_INPUT: そのURL（%）は別の記事で使われています', v_slug;
  end if;
  if v_id is null then
    insert into hp_posts(site, slug, title, excerpt, body, cover_url, category, status, published_at, author_name, updated_by)
    values (p_site, v_slug, trim(p_post->>'title'), nullif(trim(p_post->>'excerpt'),''), coalesce(p_post->>'body',''),
            nullif(p_post->>'cover_url',''), coalesce(nullif(trim(p_post->>'category'),''),'お知らせ'), v_status, v_pub,
            coalesce(nullif(trim(p_post->>'author_name'),''), u.name), u.name)
    returning id into v_id;
  else
    update hp_posts set slug = v_slug, title = trim(p_post->>'title'), excerpt = nullif(trim(p_post->>'excerpt'),''),
      body = coalesce(p_post->>'body',''), cover_url = nullif(p_post->>'cover_url',''),
      category = coalesce(nullif(trim(p_post->>'category'),''),'お知らせ'), status = v_status, published_at = v_pub,
      author_name = coalesce(nullif(trim(p_post->>'author_name'),''), author_name),
      updated_at = now(), updated_by = u.name
    where id = v_id and site = p_site and deleted_at is null;
    if not found then raise exception 'HP_INPUT: 記事が見つかりません'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.hp_admin_delete_post(p_token text, p_site text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare u hp_users;
begin
  u := hp__user(p_token, p_site);
  update hp_posts set deleted_at = now(), updated_by = u.name where id = p_id and site = p_site;
end $$;

create or replace function public.hp_admin_add_instagram(p_token text, p_site text, p_url text, p_caption text, p_posted_on date)
returns uuid language plpgsql security definer set search_path = public as $$
declare u hp_users; v_url text; v_id uuid;
begin
  u := hp__user(p_token, p_site);
  v_url := substring(trim(coalesce(p_url,'')) from '^(https://(www\.)?instagram\.com/(?:[A-Za-z0-9_.]+/)?(p|reel|tv)/[A-Za-z0-9_-]+)');
  if v_url is null then
    raise exception 'HP_INPUT: InstagramのURLの形ではありません（投稿の「…」→「リンクをコピー」で取れます）';
  end if;
  v_url := regexp_replace(v_url, '^https://instagram\.com', 'https://www.instagram.com') || '/';
  if exists (select 1 from hp_instagram where site = p_site and permalink = v_url and deleted_at is null) then
    raise exception 'HP_INPUT: その投稿はもう登録されています';
  end if;
  insert into hp_instagram(site, permalink, caption, posted_on, created_by)
  values (p_site, v_url, nullif(trim(p_caption),''), p_posted_on, u.name) returning id into v_id;
  return v_id;
end $$;

create or replace function public.hp_admin_update_instagram(p_token text, p_site text, p_id uuid, p_visible boolean, p_delete boolean)
returns void language plpgsql security definer set search_path = public as $$
declare u hp_users;
begin
  u := hp__user(p_token, p_site);
  update hp_instagram set visible = coalesce(p_visible, visible),
    deleted_at = case when p_delete then now() else deleted_at end
   where id = p_id and site = p_site;
end $$;

-- 閲覧数・検索表示回数（期間は JST の暦日）
create or replace function public.hp_admin_stats(p_token text, p_site text, p_days int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare u hp_users; v_days int := greatest(1, least(coalesce(p_days, 28), 365));
  v_from timestamptz; v_prev timestamptz; v_from_d date; v_prev_d date;
begin
  u := hp__user(p_token, p_site);
  v_from_d := (now() at time zone 'Asia/Tokyo')::date - (v_days - 1);
  v_prev_d := v_from_d - v_days;
  v_from := v_from_d::timestamp at time zone 'Asia/Tokyo';
  v_prev := v_prev_d::timestamp at time zone 'Asia/Tokyo';
  return jsonb_build_object(
    'days', v_days,
    'from', v_from_d,
    'summary', (select jsonb_build_object(
        'views', count(*) filter (where created_at >= v_from),
        'visitors', count(distinct visitor_id) filter (where created_at >= v_from),
        'sessions', count(distinct session_id) filter (where created_at >= v_from),
        'prev_views', count(*) filter (where created_at < v_from),
        'prev_visitors', count(distinct visitor_id) filter (where created_at < v_from),
        'mobile_rate', round(100.0 * count(*) filter (where created_at >= v_from and device = 'mobile')
                        / nullif(count(*) filter (where created_at >= v_from), 0)))
      from hp_page_views where site = p_site and created_at >= v_prev),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'views', coalesce(v.views,0), 'visitors', coalesce(v.visitors,0),
                 'impressions', coalesce(g.impressions,0), 'clicks', coalesce(g.clicks,0)) order by d), '[]'::jsonb)
      from generate_series(v_from_d::timestamp, (now() at time zone 'Asia/Tokyo')::date::timestamp, interval '1 day') d
      left join (select (created_at at time zone 'Asia/Tokyo')::date dd, count(*) views, count(distinct visitor_id) visitors
                 from hp_page_views where site = p_site and created_at >= v_from group by 1) v on v.dd = d::date
      left join (select day, impressions, clicks from hp_gsc_daily where site = p_site and dim = 'total') g on g.day = d::date),
    'pages', (select coalesce(jsonb_agg(x order by (x->>'views')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('path', path, 'title', max(title), 'views', count(*), 'visitors', count(distinct visitor_id)) x
        from hp_page_views where site = p_site and created_at >= v_from group by path order by count(*) desc limit 15) t),
    'sources', (select coalesce(jsonb_agg(x order by (x->>'views')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('source', source, 'views', count(*), 'visitors', count(distinct visitor_id)) x
        from hp_page_views where site = p_site and created_at >= v_from and source <> 'internal' group by source) t),
    'posts', (select coalesce(jsonb_agg(x order by (x->>'views')::int desc), '[]'::jsonb) from (
        select jsonb_build_object('slug', p.slug, 'title', p.title, 'views', count(v.id), 'visitors', count(distinct v.visitor_id)) x
        from hp_posts p left join hp_page_views v on v.site = p.site and v.post_slug = p.slug and v.created_at >= v_from
        where p.site = p_site and p.deleted_at is null and p.status = 'published' group by p.slug, p.title) t),
    'gsc', jsonb_build_object(
        'connected', exists (select 1 from hp_settings where key = 'gsc_sa'),
        'property', (select value->>p_site from hp_settings where key = 'gsc_properties'),
        'last_sync', (select value->>p_site from hp_settings where key = 'gsc_last_sync'),
        'impressions', (select coalesce(sum(impressions),0) from hp_gsc_daily where site = p_site and dim = 'total' and day >= v_from_d),
        'clicks', (select coalesce(sum(clicks),0) from hp_gsc_daily where site = p_site and dim = 'total' and day >= v_from_d),
        'prev_impressions', (select coalesce(sum(impressions),0) from hp_gsc_daily where site = p_site and dim = 'total' and day >= v_prev_d and day < v_from_d),
        'position', (select round(sum(position * impressions) / nullif(sum(impressions),0), 1) from hp_gsc_daily where site = p_site and dim = 'total' and day >= v_from_d),
        'queries', (select coalesce(jsonb_agg(x order by (x->>'impressions')::int desc), '[]'::jsonb) from (
            select jsonb_build_object('query', dim_value, 'impressions', sum(impressions), 'clicks', sum(clicks),
                     'position', round(sum(position * impressions) / nullif(sum(impressions),0), 1)) x
            from hp_gsc_daily where site = p_site and dim = 'query' and day >= v_from_d
            group by dim_value order by sum(impressions) desc limit 20) t))
  );
end $$;

-- アップロード記録（Edge Function から service_role で呼ぶ）
create or replace function public.hp_admin_record_media(p_token text, p_site text, p_path text, p_url text, p_bytes int, p_w int, p_h int)
returns void language plpgsql security definer set search_path = public as $$
declare u hp_users;
begin
  u := hp__user(p_token, p_site);
  insert into hp_media(site, path, url, bytes, width, height, uploaded_by) values (p_site, p_path, p_url, p_bytes, p_w, p_h, u.name);
end $$;

-- 権限：公開RPCとログイン系は anon 可、それ以外も anon 可（中でトークン検査）。hp__user は内部専用
revoke all on function public.hp_public_site(text), public.hp_public_post(text,text),
  public.hp_track(text,text,text,text,text,text,text,text), public.hp__user(text,text),
  public.hp_login(text,text), public.hp_logout(text), public.hp_change_password(text,text,text),
  public.hp_admin_me(text), public.hp_admin_site(text,text), public.hp_admin_save_slot(text,text,text,text),
  public.hp_admin_save_post(text,text,jsonb), public.hp_admin_delete_post(text,text,uuid),
  public.hp_admin_add_instagram(text,text,text,text,date), public.hp_admin_update_instagram(text,text,uuid,boolean,boolean),
  public.hp_admin_stats(text,text,int), public.hp_admin_record_media(text,text,text,text,int,int,int)
  from public, anon, authenticated;
grant execute on function public.hp_public_site(text), public.hp_public_post(text,text),
  public.hp_track(text,text,text,text,text,text,text,text),
  public.hp_login(text,text), public.hp_logout(text), public.hp_change_password(text,text,text),
  public.hp_admin_me(text), public.hp_admin_site(text,text), public.hp_admin_save_slot(text,text,text,text),
  public.hp_admin_save_post(text,text,jsonb), public.hp_admin_delete_post(text,text,uuid),
  public.hp_admin_add_instagram(text,text,text,text,date), public.hp_admin_update_instagram(text,text,uuid,boolean,boolean),
  public.hp_admin_stats(text,text,int)
  to anon, authenticated;
grant execute on function public.hp_public_site(text), public.hp_public_post(text,text),
  public.hp_track(text,text,text,text,text,text,text,text), public.hp__user(text,text),
  public.hp_login(text,text), public.hp_logout(text), public.hp_change_password(text,text,text),
  public.hp_admin_me(text), public.hp_admin_site(text,text), public.hp_admin_save_slot(text,text,text,text),
  public.hp_admin_save_post(text,text,jsonb), public.hp_admin_delete_post(text,text,uuid),
  public.hp_admin_add_instagram(text,text,text,text,date), public.hp_admin_update_instagram(text,text,uuid,boolean,boolean),
  public.hp_admin_stats(text,text,int), public.hp_admin_record_media(text,text,text,text,int,int,int)
  to service_role;

-- 写真置き場（公開読み取り。書き込みは service_role のみ＝Edge Function 経由）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hp-media', 'hp-media', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;

-- ───────────────────────── 初期データ ─────────────────────────
insert into public.hp_sites(code, name, domain, company_id, sort_order) values
  ('yozan', '株式会社YOZAN（コーポレート）', 'yozan-inc.jp', 'ec00ad2a-4032-4061-bdb7-03face8a04e7', 1),
  ('frank-golf', 'FRANK GOLF 姫路', 'frankgolf.jp', 'edf84e8e-7d53-4492-a037-244a722f3d44', 2),
  ('kallinos', 'KALLINOS', 'kallinos.jp', 'ec00ad2a-4032-4061-bdb7-03face8a04e7', 3)
on conflict (code) do nothing;

-- YOZAN コーポレートの差し替え枠
insert into public.hp_slots(site, key, kind, page_label, label, help, default_value, sort_order) values
  ('yozan','home.hero_title','text','トップページ','いちばん上の大きな見出し','改行はそのまま反映。【 】で囲んだ文字は金色になります',E'ゴルフ業界の成長を、\n【仕組み】で支える。',10),
  ('yozan','home.hero_lead','longtext','トップページ','見出しの下の説明文',null,'株式会社YOZANは、人材・DX・マーケティング・運営支援・アパレルの5事業で、業界に必要な機能を丸ごと提供します。',20),
  ('yozan','home.cap3','text','トップページ','「YOZANの現場」1枚目の説明',null,'インドアゴルフ施設の運営現場',30),
  ('yozan','home.cap4','text','トップページ','「YOZANの現場」2枚目の説明',null,'レッスン・コーチング',40),
  ('yozan','home.cap5','text','トップページ','「YOZANの現場」3枚目の説明',null,'ゴルフコース',50),
  ('yozan','home.cap6','text','トップページ','「YOZANの現場」4枚目の説明',null,'KALLINOS アパレル',60),
  ('yozan','home.cap7','text','トップページ','「YOZANの現場」5枚目の説明',null,'チームでの業務改善',70),
  ('yozan','site.instagram_url','text','サイト全体','InstagramアカウントのURL','入れるとトップのInstagram欄に「フォローする」ボタンが出ます','',80),
  ('yozan','home.photo1','image','トップページ','いちばん上の大きな写真（背景）',null,'https://yozan-inc.jp/images/hero-top.jpg',90),
  ('yozan','home.photo2','image','トップページ','「この会社は伸びる」の横の写真',null,'https://yozan-inc.jp/images/golf-aerial.jpg',100),
  ('yozan','home.photo3','image','トップページ','「YOZANの現場」1枚目（大）',null,'https://yozan-inc.jp/images/golf-simulator-2.jpg',110),
  ('yozan','home.photo4','image','トップページ','「YOZANの現場」2枚目',null,'https://yozan-inc.jp/images/golf-coach.jpg',120),
  ('yozan','home.photo5','image','トップページ','「YOZANの現場」3枚目',null,'https://yozan-inc.jp/images/golf-course.jpg',130),
  ('yozan','home.photo6','image','トップページ','「YOZANの現場」4枚目',null,'https://yozan-inc.jp/images/golf-apparel.jpg',140),
  ('yozan','home.photo7','image','トップページ','「YOZANの現場」5枚目',null,'https://yozan-inc.jp/images/team-meeting.jpg',150),
  ('yozan','home.photo8','image','トップページ','「成長を、数字と構想で見せる」の背景',null,'https://yozan-inc.jp/images/golf-fairway.jpg',160),
  ('yozan','about.photo1','image','会社について（ABOUT）','上部の背景',null,'https://yozan-inc.jp/images/golf-fairway.jpg',170),
  ('yozan','about.photo2','image','会社について（ABOUT）','「なぜ、5事業を同時に育てるのか」の横',null,'https://yozan-inc.jp/images/team-meeting.jpg',180),
  ('yozan','about.photo3','image','会社について（ABOUT）','「経営理念」の写真',null,'https://yozan-inc.jp/images/golf-coach.jpg',190),
  ('yozan','about.photo4','image','会社について（ABOUT）','「会社のあり方」の写真',null,'https://yozan-inc.jp/images/golf-simulator-2.jpg',200),
  ('yozan','business.photo1','image','事業紹介（BUSINESS）','上部の背景',null,'https://yozan-inc.jp/images/golf-course.jpg',210),
  ('yozan','business.photo2','image','事業紹介（BUSINESS）','01 人材事業',null,'https://yozan-inc.jp/images/golf-coach.jpg',220),
  ('yozan','business.photo3','image','事業紹介（BUSINESS）','02 DX事業',null,'https://yozan-inc.jp/images/golf-simulator.jpg',230),
  ('yozan','business.photo4','image','事業紹介（BUSINESS）','03 マーケティング事業',null,'https://yozan-inc.jp/images/sns-marketing.jpg',240),
  ('yozan','business.photo5','image','事業紹介（BUSINESS）','04 運営支援',null,'https://yozan-inc.jp/images/golf-simulator-2.jpg',250),
  ('yozan','business.photo6','image','事業紹介（BUSINESS）','05 アパレル事業',null,'https://yozan-inc.jp/images/golf-apparel.jpg',260),
  ('yozan','marketing.photo1','image','マーケティング（MARKETING）','上部の背景',null,'https://yozan-inc.jp/images/sns-marketing.jpg',270),
  ('yozan','marketing.photo2','image','マーケティング（MARKETING）','「こんな課題に、なっていませんか」の横',null,'https://yozan-inc.jp/images/golf-simulator-2.jpg',280),
  ('yozan','marketing.photo3','image','マーケティング（MARKETING）','サービス 01 SNS運用',null,'https://yozan-inc.jp/images/golf-aerial.jpg',290),
  ('yozan','marketing.photo4','image','マーケティング（MARKETING）','サービス 02 LP制作',null,'https://yozan-inc.jp/images/golf-simulator.jpg',300),
  ('yozan','marketing.photo5','image','マーケティング（MARKETING）','サービス 03 HP制作',null,'https://yozan-inc.jp/images/team-meeting.jpg',310),
  ('yozan','marketing.photo6','image','マーケティング（MARKETING）','サービス 04 広告運用',null,'https://yozan-inc.jp/images/golf-course.jpg',320),
  ('yozan','marketing.photo7','image','マーケティング（MARKETING）','「他社と違う理由」の背景',null,'https://yozan-inc.jp/images/golf-fairway.jpg',330),
  ('yozan','vision.photo1','image','ビジョン（VISION）','上部の背景',null,'https://yozan-inc.jp/images/golf-aerial.jpg',340),
  ('yozan','vision.photo2','image','ビジョン（VISION）','本文の横の写真',null,'https://yozan-inc.jp/images/golf-course.jpg',350),
  ('yozan','vision.photo3','image','ビジョン（VISION）','下部の背景',null,'https://yozan-inc.jp/images/golf-course.jpg',360),
  ('yozan','recruit.photo1','image','採用（RECRUIT）','上部の背景',null,'https://yozan-inc.jp/images/golf-swing.jpg',370),
  ('yozan','recruit.photo2','image','採用（RECRUIT）','「チーム」の写真',null,'https://yozan-inc.jp/images/team-meeting.jpg',380),
  ('yozan','recruit.photo3','image','採用（RECRUIT）','「キャリアパス」の写真',null,'https://yozan-inc.jp/images/golf-coach.jpg',390),
  ('yozan','contact.photo1','image','お問い合わせ（CONTACT）','上部の背景',null,'https://yozan-inc.jp/images/golf-course.jpg',400),
  ('yozan','contact.photo2','image','お問い合わせ（CONTACT）','横の写真',null,'https://yozan-inc.jp/images/golf-simulator.jpg',410)
on conflict (site, key) do update set kind = excluded.kind, page_label = excluded.page_label, label = excluded.label, help = excluded.help, default_value = excluded.default_value, sort_order = excluded.sort_order;
