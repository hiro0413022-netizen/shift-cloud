-- 0030_survey_os.sql
-- アンケート/情報収集モジュール（survey-os 独立アプリ）
-- DECISIONS #23/#27/#30と同型: 入力面は独立アプリ、GENESISは閲覧+承認、DB共有(qrgpblnnhdudigarrtuz)。
-- 匿名公開回答(公開slug、service_role経由でトークンレス)。管理はview_hq/use_survey。
-- 既存標準準拠(#11/#16/#17): company_id + RLSテナント分離 / 論理削除 / updated_atトリガー。
-- 汎用スキーマ(単一/複数/自由記述/順位付け/スケール)で複雑アンケートに対応。

-- ============================================================
-- 1. svy_surveys — アンケート定義
-- ============================================================
create table svy_surveys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  store_id uuid references stores(id),
  slug text not null,                                  -- 公開URL用スラッグ（英数）
  title text not null,
  description text,
  purpose text,                                        -- 社内向け: このアンケートの目的
  status text not null default 'draft'
    check (status in ('draft', 'open', 'closed')),
  is_anonymous boolean not null default true,
  intro_text text,                                     -- 回答者向け冒頭文
  thanks_text text,                                    -- 送信後お礼文
  est_minutes int,                                     -- 想定回答時間(分)
  opens_at timestamptz,
  closes_at timestamptz,
  response_count int not null default 0,               -- 回答数キャッシュ
  created_by uuid references staff(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index idx_svy_surveys_slug on svy_surveys (slug) where deleted_at is null;
create index idx_svy_surveys_company on svy_surveys (company_id) where deleted_at is null;

-- ============================================================
-- 2. svy_questions — 設問（汎用型）
--   type: single(単一) / multi(複数) / text(短文) / textarea(自由記述) /
--         ranking(順位付け・ドラッグ&ドロップ) / scale(段階)
--   options: [{"value":"male","label":"男性"}, ...]
--   config: 型別の追加設定
--     multi:   {"allow_other": true, "is_ranking_source": true}  ← 順位付けの母集団になる選択
--     ranking: {"source_code": "Q_COACH", "pool": [{"value":"furukawa","label":"古川博庸プロ"}...]}
--              source_code指定時は当該multi設問で選んだ項目のみを並び替え対象にする
--     scale:   {"min":1,"max":5,"min_label":"低","max_label":"高"}
-- ============================================================
create table svy_questions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  survey_id uuid not null references svy_surveys(id),
  section text,                                        -- セクション見出し
  position int not null default 0,                     -- 表示順
  code text not null,                                  -- Q1, Q2 ... 集計・CSVの安定キー
  type text not null
    check (type in ('single', 'multi', 'text', 'textarea', 'ranking', 'scale')),
  title text not null,
  help_text text,
  required boolean not null default false,
  options jsonb not null default '[]',
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index idx_svy_questions_code on svy_questions (survey_id, code) where deleted_at is null;
create index idx_svy_questions_survey on svy_questions (survey_id, position) where deleted_at is null;

-- ============================================================
-- 3. svy_responses — 1回答（匿名・不変）
-- ============================================================
create table svy_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  survey_id uuid not null references svy_surveys(id),
  client_key text,                                     -- 端末側キー(緩い重複防止用、匿名性維持)
  user_agent text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_svy_responses_survey on svy_responses (survey_id) where deleted_at is null;

-- ============================================================
-- 4. svy_answers — 設問ごとの回答値
--   value(jsonb)例:
--     single:   {"value":"male"}
--     multi:    {"values":["swing_video","coach_comment"], "other":"..."}
--     text/textarea: {"text":"..."}
--     ranking:  {"order":["furukawa","enomoto","ando"]}   ← 上位から
--     scale:    {"value":4}
-- ============================================================
create table svy_answers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  response_id uuid not null references svy_responses(id),
  question_id uuid not null references svy_questions(id),
  question_code text not null,
  value jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_svy_answers_response on svy_answers (response_id);
create index idx_svy_answers_question on svy_answers (question_id);

-- ============================================================
-- 5. トリガー + RLS（既存標準の流用）
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['svy_surveys', 'svy_questions'] loop
    execute format('create trigger set_updated_at before update on %I for each row execute function app.set_updated_at()', t);
  end loop;
  foreach t in array array['svy_surveys', 'svy_questions', 'svy_responses', 'svy_answers'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
    execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
    execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
  end loop;
end $$;
