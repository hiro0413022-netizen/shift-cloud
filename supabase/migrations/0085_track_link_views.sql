-- 0085: 汎用リンク閲覧計測 trk_*（DECISIONS #95）
--
-- 目的: 「送ったものを相手が見たか」をアプリ横断で測る。
--   demo-sales の営業デモ /d/[token] が第一号だが、reserve-os の予約リンク・
--   survey-os のアンケート・report-os の月次資料など、
--   「トークン付きURLで配る成果物」なら何でも同じ仕組みに乗る。
--
-- 設計:
--   trk_links    … 配ったURL1本＝1行（app / resource_type / resource_id / token）。集計値を持つ
--   trk_sessions … 閲覧1回＝1行（滞在秒・見たページ・端末）。session_key はクライアント生成の乱数
--   trk_events   … open / page / click の粒度ログ（heartbeat は保存せずセッションの秒数に畳む）
--
-- 方針:
--   - 個人情報は保存しない。IPは保存せず、UAは300字で切って端末判定にのみ使う
--   - 記録は RPC `trk_record` 1本に集約（トークン照合・セッション・集計・イベント・初回通知を原子的に）
--   - 社内プレビュー（営業担当が自分で開いた分）は is_internal=true として集計から除外する
--   - RLSは有効・ポリシーなし＝service_role専用（本リポジトリの標準形 #65）

-- ============================================================
-- 1) 配布リンク
-- ============================================================
create table if not exists trk_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  app text not null,                        -- 'demo-sales' / 'reserve-os' / ...
  resource_type text not null,              -- 'demo' / 'quote' / 'report' / ...
  resource_id uuid not null,                -- 元テーブルの主キー
  token text not null unique,               -- 配信URLのトークン（既存のものをそのまま登録する）
  label text,                               -- 一覧表示用（営業先名など）
  href text,                                -- 管理画面から元レコードへ戻る導線
  first_viewed_at timestamptz,              -- 初回開封（ホットリードの起点）
  last_viewed_at timestamptz,
  view_count integer not null default 0,    -- 社外セッション数
  total_seconds integer not null default 0, -- 社外の合計滞在秒
  notified_at timestamptz,                  -- 初回開封の通知済み時刻（二重通知の防止）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists uq_trk_links_resource
  on trk_links(app, resource_type, resource_id) where deleted_at is null;
create index if not exists idx_trk_links_company
  on trk_links(company_id, last_viewed_at desc) where deleted_at is null;
create index if not exists idx_trk_links_hot
  on trk_links(company_id, first_viewed_at desc) where deleted_at is null and first_viewed_at is not null;

comment on table trk_links is 'トークン付きURLの配布台帳＋閲覧集計（@yozan/track）。app/resource_typeで任意のシステムから使える';
comment on column trk_links.notified_at is '初回開封をホットリードとして通知した時刻。nullなら未通知＝判断フィードに出す';

-- ============================================================
-- 2) 閲覧セッション（1回の閲覧＝1行）
-- ============================================================
create table if not exists trk_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  link_id uuid not null references trk_links(id),
  session_key text not null,                -- クライアント生成の乱数（sessionStorage）
  is_internal boolean not null default false, -- 社内プレビュー（?preview=1）
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seconds integer not null default 0,        -- 滞在秒（クライアントの累積値の最大）
  page_views integer not null default 0,
  pages text[] not null default '{}',        -- 見たページ（ハッシュルート）を到達順に
  first_page text,
  referrer text,
  device text,                               -- 'mobile' / 'desktop'
  user_agent text
);

create unique index if not exists uq_trk_sessions_key on trk_sessions(link_id, session_key);
create index if not exists idx_trk_sessions_link on trk_sessions(link_id, started_at desc);

comment on table trk_sessions is '閲覧1回＝1行。個人情報・IPは保存しない（@yozan/track）';

-- ============================================================
-- 3) イベント（open / page / click）
-- ============================================================
create table if not exists trk_events (
  id bigint generated always as identity primary key,
  company_id uuid not null references companies(id),
  link_id uuid not null references trk_links(id),
  session_id uuid not null references trk_sessions(id),
  kind text not null,                        -- open / page / click
  page text,
  label text,                                -- clickの対象（ボタン名など）
  occurred_at timestamptz not null default now()
);

create index if not exists idx_trk_events_link on trk_events(link_id, occurred_at desc);

comment on table trk_events is 'open/page/click の粒度ログ。heartbeatは保存せず trk_sessions.seconds に畳む（@yozan/track）';

alter table trk_links    enable row level security;
alter table trk_sessions enable row level security;
alter table trk_events   enable row level security;
-- ポリシーは作らない＝service_role のみ（アプリ層で認可 #3 / #65）

-- ============================================================
-- 4) 記録RPC — トークン照合からイベント記録・初回通知まで1往復で
-- ============================================================
create or replace function trk_record(
  p_token       text,
  p_session_key text,
  p_kind        text,
  p_page        text    default null,
  p_label       text    default null,
  p_seconds     integer default 0,
  p_internal    boolean default false,
  p_meta        jsonb   default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_link_id      uuid;
  v_company_id   uuid;
  v_first_before timestamptz;
  v_label        text;
  v_session_id   uuid;
  v_internal     boolean;
  v_first_open   boolean := false;
begin
  if p_kind not in ('open', 'page', 'click', 'heartbeat') then
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;

  select id, company_id, first_viewed_at, label
    into v_link_id, v_company_id, v_first_before, v_label
    from trk_links
   where token = p_token and deleted_at is null;

  if v_link_id is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_token');
  end if;

  -- セッション（link × session_key で1行）。is_internal は最初の記録が勝つ
  insert into trk_sessions (
    company_id, link_id, session_key, is_internal, first_page, referrer, device, user_agent
  ) values (
    v_company_id, v_link_id, p_session_key, coalesce(p_internal, false), p_page,
    left(nullif(p_meta->>'referrer', ''), 300),
    nullif(p_meta->>'device', ''),
    left(nullif(p_meta->>'ua', ''), 300)
  )
  on conflict (link_id, session_key) do nothing;

  select id, is_internal into v_session_id, v_internal
    from trk_sessions where link_id = v_link_id and session_key = p_session_key;

  update trk_sessions set
    last_seen_at = now(),
    seconds      = greatest(seconds, greatest(coalesce(p_seconds, 0), 0)),
    page_views   = page_views + case when p_kind = 'page' then 1 else 0 end,
    pages        = case
                     when p_kind = 'page' and p_page is not null and not (p_page = any(pages))
                     then pages || p_page else pages
                   end
  where id = v_session_id;

  if p_kind <> 'heartbeat' then
    insert into trk_events (company_id, link_id, session_id, kind, page, label)
    values (v_company_id, v_link_id, v_session_id, p_kind, p_page, left(p_label, 120));
  end if;

  -- 集計は社外の閲覧だけ
  if not v_internal then
    v_first_open := v_first_before is null;
    update trk_links set
      first_viewed_at = coalesce(first_viewed_at, now()),
      last_viewed_at  = now(),
      view_count      = (select count(*) from trk_sessions s
                          where s.link_id = v_link_id and not s.is_internal),
      total_seconds   = (select coalesce(sum(s.seconds), 0) from trk_sessions s
                          where s.link_id = v_link_id and not s.is_internal),
      updated_at      = now()
    where id = v_link_id;

    -- 初回開封＝ホットリード。イベントに残す（ホームのティッカー・CEO AIの観測に合流 #83）
    if v_first_open then
      begin
        insert into company_events (company_id, event_type, title, source, source_type, occurred_at)
        values (v_company_id, 'track.first_view',
                left('送った資料が開かれました: ' || coalesce(v_label, '（無題）'), 120),
                'db_function', 'system', now());
      exception when others then
        null; -- イベント記録の失敗で計測を止めない
      end;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'first', v_first_open, 'internal', v_internal);
end;
$$;

-- 0065以降のルール: 新関数は service_role に明示的に EXECUTE を付ける
grant execute on function public.trk_record(text, text, text, text, text, integer, boolean, jsonb) to service_role;

comment on function public.trk_record is
  '閲覧計測の記録。トークン照合→セッション更新→イベント→集計→初回開封のcompany_events記録までを1回で行う（@yozan/track）';
