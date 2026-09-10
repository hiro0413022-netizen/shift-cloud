-- #232 (2026-09-10) Compe OS — ゴルフコンペ管理を genspark から GENESIS へ移設
--
-- ユーザー依頼:「以前gensparkでコンペの管理システムを作成していましたが
--                genesisプロジェクト内で管理したいです」
--
-- 旧システム（単一HTML + genspark の golf_savedata に JSON 1本を丸ごと保存）から
-- テーブルへ正規化する。要点は3つ。
--
-- ★ 1. コンペは「1個」ではなく台帳にする。
--   旧システムはログインユーザーごとに JSON 1本＝実質いつも1コンペで、
--   次のコンペを作ると前回が消えるか、別スロットとして行方不明になっていた。
--   cmp_comps を親にして、参加者・組・スコア・景品を全部ぶら下げる。
--
-- ★ 2. 1人が2つの組に入れないことを DB で守る。
--   旧システムは groups[].members が ID の配列で、ドラッグ＆ドロップの取りこぼしで
--   同じ人が2組に残っても誰も気づかなかった（案内文とスコアシートで人数が食い違う）。
--   cmp_group_members に participant_id の一意索引を置き、構造的に起こらないようにする。
--
-- ★ 3. 計算式（ペリア／ダブルペリア）はDBに持たせない。
--   正典は packages/core/src/compe-score.ts の1か所だけ（DEVELOPMENT_RULES「数字の正典は1本」）。
--   スコアは「入力された値」だけを保存し、HCP・NET・順位は毎回そこで計算する。
--   保存すると、あとから隠しホールや上限を直したときに過去の表彰結果と食い違う。

-- ========== コンペ本体 ==========
create table if not exists public.cmp_comps (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  store_id uuid references public.stores(id),            -- null = 会社全体（店舗をまたぐコンペ）
  name text not null,
  held_on date,
  venue text,                                            -- ゴルフ場
  course text,                                           -- OUT/IN 等
  organizer text,
  contact text,
  fee integer not null default 0,                        -- 参加費・円（DECISIONS #4 integer円）
  start_time text,                                       -- 「8:30」など案内文にそのまま出す自由記述
  meet_time text,                                        -- 「練習開始7:10 集合8:10」のような書き方をするため text
  format text not null default 'stroke',
  team_size smallint not null default 4,
  tee_options text[] not null default array['1番ホール', '10番ホール'],
  notes text,
  -- 案内文（コンペごとに文面が変わるのでコンペに持たせる）
  ann_greeting text,
  ann_closing text,
  ann_group_title text default '■ 組み合わせ表',
  ann_show_hcp boolean not null default true,
  -- アンケート（紙・Googleフォーム用の下書き。回答の集計は Survey OS の担当）
  survey_title text,
  survey_desc text,
  survey_questions jsonb not null default '[]'::jsonb,
  -- 受付表の列（固定列＝氏名/フリガナ/所属/HCP、以降はここで足し引きする）
  reception_fields jsonb not null default
    '[{"id":"rf_checkin","label":"受付","type":"checkin","visible":true,"builtin":true},
      {"id":"rf_paid","label":"参加費","type":"paid","visible":true,"builtin":true},
      {"id":"rf_time","label":"受付時刻","type":"time","visible":true,"builtin":true},
      {"id":"rf_notes","label":"メモ","type":"notes","visible":true,"builtin":true}]'::jsonb,
  -- 手書きシートの列（個人戦 personal / 団体戦 team）
  sheet_cols jsonb not null default '{}'::jsonb,
  status text not null default 'planning',               -- planning / running / closed
  created_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cmp_comps_format check (
    format in ('stroke', 'stableford', 'match', 'peria_single', 'peria_double', 'peria_double36')
  ),
  constraint cmp_comps_status check (status in ('planning', 'running', 'closed')),
  constraint cmp_comps_team_size check (team_size between 1 and 6),
  constraint cmp_comps_fee check (fee >= 0)
);

comment on table public.cmp_comps is 'ゴルフコンペ（Compe OS の親テーブル）。旧gensparkの golf_savedata JSON を正規化したもの（#232）';
comment on column public.cmp_comps.reception_fields is '受付表の可変列。type: checkin/paid/time/notes（組み込み）・check（チェック欄）・text（自由記入）。値は cmp_participants.custom_fields に列idをキーで入る';
comment on column public.cmp_comps.format is 'stroke/stableford/match/peria_single(シンペリア)/peria_double(ダブルペリア)/peria_double36(上限36)。計算は packages/core/src/compe-score.ts';

create index if not exists idx_cmp_comps_company on public.cmp_comps (company_id, held_on desc) where deleted_at is null;
create index if not exists idx_cmp_comps_store on public.cmp_comps (store_id, held_on desc) where deleted_at is null;

-- ========== 参加者 ==========
create table if not exists public.cmp_participants (
  id uuid primary key default gen_random_uuid(),
  comp_id uuid not null references public.cmp_comps(id) on delete cascade,
  name text not null,
  kana text,
  hcp numeric(4, 1),                                     -- 未申告は null（0 と区別する）
  gender text,                                           -- male / female
  org text,
  tel text,
  email text,
  notes text,
  paid boolean not null default false,
  checked_in boolean not null default false,
  check_in_at timestamptz,                               -- 受付時刻（表示はJST）
  custom_fields jsonb not null default '{}'::jsonb,      -- 受付カスタム列の値
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cmp_participants_gender check (gender is null or gender in ('male', 'female'))
);

comment on table public.cmp_participants is 'コンペ参加者。会員名簿(mbr_members)とはあえて繋がない — ビジター・取引先・同伴者が普通に入るため（#232）';

create index if not exists idx_cmp_participants_comp on public.cmp_participants (comp_id, sort_order) where deleted_at is null;

-- ========== 組み合わせ ==========
create table if not exists public.cmp_groups (
  id uuid primary key default gen_random_uuid(),
  comp_id uuid not null references public.cmp_comps(id) on delete cascade,
  name text not null,
  tee text,
  start_time text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.cmp_groups is '組（1組・2組…）。同じ名前の組が1番ホールと10番ホールに並ぶ運用があるため name+tee の一意制約は置かない（#232）';

create index if not exists idx_cmp_groups_comp on public.cmp_groups (comp_id, sort_order) where deleted_at is null;

create table if not exists public.cmp_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.cmp_groups(id) on delete cascade,
  participant_id uuid not null references public.cmp_participants(id) on delete cascade,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

-- ★ 1人がいる組は 0 か 1。ドラッグ＆ドロップの取りこぼしで二重に残るのをDBで止める。
create unique index if not exists uq_cmp_group_members_participant
  on public.cmp_group_members (participant_id);
create index if not exists idx_cmp_group_members_group
  on public.cmp_group_members (group_id, position);

comment on table public.cmp_group_members is '組のメンバー。participant_id に一意索引＝同じ人が2つの組に入れない（#232）';

-- ========== スコア ==========
create table if not exists public.cmp_scores (
  id uuid primary key default gen_random_uuid(),
  comp_id uuid not null references public.cmp_comps(id) on delete cascade,
  participant_id uuid not null references public.cmp_participants(id) on delete cascade,
  holes jsonb not null default '{}'::jsonb,              -- {"h1":4,"h2":5,...} 入力されたホールだけ
  direct_gross smallint,                                 -- GROSS直接入力（あればホール合計より優先）
  note text,                                             -- ニアピン・ドラコン等の備考
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_cmp_scores_participant unique (participant_id),
  constraint cmp_scores_direct_gross check (direct_gross is null or direct_gross between 18 and 200)
);

comment on table public.cmp_scores is 'スコア（入力値のみ）。GROSS/HCP/NET/順位は保存せず packages/core の compe-score.ts が毎回計算する（#232）';

create index if not exists idx_cmp_scores_comp on public.cmp_scores (comp_id);

-- ========== 景品 ==========
create table if not exists public.cmp_prizes (
  id uuid primary key default gen_random_uuid(),
  comp_id uuid not null references public.cmp_comps(id) on delete cascade,
  label text not null,                                   -- 「🥇 優勝」「🎯 ニアピン」など画面に出る名前
  prize_name text,                                       -- 景品そのもの
  winner_name text,                                      -- 受賞者（表彰後に埋める・任意）
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_cmp_prizes_comp on public.cmp_prizes (comp_id, sort_order) where deleted_at is null;

-- ========== 団体戦 ==========
create table if not exists public.cmp_teams (
  id uuid primary key default gen_random_uuid(),
  comp_id uuid not null references public.cmp_comps(id) on delete cascade,
  name text not null,
  group_name text,
  score integer,
  rank_label text,
  note text,
  members text,                                          -- 「山田・田中・佐藤」の表示用文字列（旧システム互換）
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.cmp_teams is '団体戦のチーム。FWキープ数など競技ごとに集計式が変わるのでスコアは人が入れる（#232）';

create index if not exists idx_cmp_teams_comp on public.cmp_teams (comp_id, sort_order) where deleted_at is null;

-- ========== 領収書 ==========
create table if not exists public.cmp_receipts (
  id uuid primary key default gen_random_uuid(),
  comp_id uuid not null references public.cmp_comps(id) on delete cascade,
  participant_id uuid references public.cmp_participants(id),
  receipt_no text not null,
  amount integer not null,                               -- 円
  purpose text,                                          -- 但し書き
  issuer text,
  issued_on date not null,
  issued_by uuid references public.staff(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint uq_cmp_receipts_no unique (comp_id, receipt_no),
  constraint cmp_receipts_amount check (amount >= 0)
);

comment on table public.cmp_receipts is '発行した領収書の控え。番号はコンペ内で一意（#232）';

-- ========== updated_at ==========
create trigger set_updated_at before update on public.cmp_comps        for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.cmp_participants for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.cmp_groups       for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.cmp_scores       for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.cmp_prizes       for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.cmp_teams        for each row execute function app.set_updated_at();

-- ========== RLS ==========
-- 各アプリのサーバー側（service_role）からのみ読み書きする。ポリシーは置かない（DECISIONS #3/#65）。
alter table public.cmp_comps         enable row level security;
alter table public.cmp_participants  enable row level security;
alter table public.cmp_groups        enable row level security;
alter table public.cmp_group_members enable row level security;
alter table public.cmp_scores        enable row level security;
alter table public.cmp_prizes        enable row level security;
alter table public.cmp_teams         enable row level security;
alter table public.cmp_receipts      enable row level security;

-- ========== 権限 use_compe ==========
-- 当日の受付はコーチ・受付スタッフが触るので、本部権限だけに閉じない。
-- read_only（閲覧専用）には付けない。
update public.roles
   set permissions = permissions || '{"use_compe": true}'::jsonb
 where coalesce((permissions ->> 'read_only')::boolean, false) = false
   and (permissions ? 'view_hq' or permissions ? 'use_reception' or permissions ? 'manage_staff');
