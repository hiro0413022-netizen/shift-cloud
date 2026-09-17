-- 0187: 流入元に YouTube / TikTok を追加（FRANK は RaRa LESSON の YouTube からの流入が多い #249c）
-- hp_track の source 判定に youtube / tiktok を足しただけ（他は 0184 と同じ）
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
    return;
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
    when v_host ~ '(^|\.)(youtube\.com|youtu\.be)$' then 'youtube'
    when v_host ~ '(^|\.)tiktok\.com$' then 'tiktok'
    when v_host ~ '(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$' then 'ai'
    else 'other' end;
  v_slug := substring(p_path from '^/blog/([^/?#]+)');
  insert into hp_page_views(site, path, title, source, referrer_host, visitor_id, session_id, device, post_slug)
  values (p_site, left(p_path,300), left(p_title,200), v_source, left(v_host,120), left(p_visitor,64),
          left(p_session,64), case when p_device = 'mobile' then 'mobile' else 'desktop' end, left(v_slug,120));
end $$;

update public.hp_page_views set source = 'youtube' where source = 'other' and referrer_host ~ '(^|\.)(youtube\.com|youtu\.be)$';
update public.hp_page_views set source = 'tiktok' where source = 'other' and referrer_host ~ '(^|\.)tiktok\.com$';
