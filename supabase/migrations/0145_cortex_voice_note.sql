-- ============================================================
-- 0145: AIカルテナレッジ 音声メモ ＋ ナレッジ候補（知識の自己増殖）
--
-- 背景（2026-09-03 ユーザー提案・PGA NOTE の補助システムとして外販）:
--   「ナレッジを開く → 録音開始 → 検索しながらレッスン → 停止 → コメント生成
--     → 生成内容がナレッジに無ければ追加」
--
-- lesson-os の会話メモ（0131/0132）との違い:
--   あちらは「その生徒のカルテを埋める」ので生徒・動画に紐づく。
--   こちらは「店の頭脳を太らせる」ので **生徒に紐づけない**（ユーザー判断 2026-09-03）。
--   録音1本＝1レッスンで完結する＝生徒CRMの無い standard プランのまま載る。
--
-- 設計の要（docs/modules/swing-cortex/VOICE_NOTE.md）:
--   1. **同意が無ければ録音できない**（consent_at / consent_by を残す）。
--   2. **音声は要約が済んだら消す**（audio_deleted_at）。残すのは要約と確定本文。
--   3. **生成内容をナレッジに自動追加しない。**
--      AIが出したものは sc_knowledge_candidates に溜めるだけで、
--      sc_symptoms / sc_checkpoints / sc_knowledge に書くのは
--      **人が採用ボタンを押したときだけ**。
--   4. 昇格の門は **AIの自己採点ではなく「別の日に3回以上出た」という事実**。
--      完成度をAIに採点させると自分の答案を自分で採点することになる
--      （2026-08-28 自律進化の検証: 減点していたログのほうを消して満点を取った実例）。
--   5. 却下しても候補行は消さない。「5回出ているのに採用していない」が見えることに価値がある。
--
-- 追加のみ。RLSはテナント標準（app.current_company_id()）。service_role はバイパス。
-- ============================================================

-- ============ 0. 音声の置き場 ============
-- lesson-videos とは分ける。外販テナントの音声が自社の動画と同じ袋に入らないようにする。
insert into storage.buckets (id, name, public) values ('cortex-audio', 'cortex-audio', false)
on conflict (id) do nothing;

-- ============ 1. 音声メモ（録音1本＝1行） ============
create table if not exists sc_voice_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  coach_staff_id uuid references staff(id),
  lesson_date date not null,
  -- 音声。要約が取れたら消して audio_deleted_at を立てる
  audio_path text,
  audio_seconds int,
  audio_bytes bigint,
  audio_deleted_at timestamptz,
  -- 同意（これが無いと録音を始められない＝画面とサーバーの両方で弾く）
  consent_at timestamptz,
  consent_by uuid references staff(id),
  status text not null default 'draft'
    check (status in ('draft', 'uploaded', 'summarized', 'saved', 'failed')),
  transcript text,
  summary jsonb,                          -- {today[], homework[], points[], clubs[], next[]}
  comment_body text,                      -- PGA NOTE に貼るコメント（AI下書き→コーチが直す）
  coach_note text,                        -- 先生の手元の記録（任意）
  ai_raw jsonb,
  error text,
  saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_sc_voice_notes_company
  on sc_voice_notes (company_id, lesson_date desc, created_at desc) where deleted_at is null;

-- ============ 2. ナレッジ候補（溜めるだけ・本体には書かない） ============
create table if not exists sc_knowledge_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  -- 最初に出たメモ / 直近で出たメモ（根拠を辿るため）
  note_id uuid references sc_voice_notes(id) on delete set null,
  last_note_id uuid references sc_voice_notes(id) on delete set null,
  -- append = 既存の症状/確認項目に足す（こちらを優先する）
  -- new_symptom = どこにも寄せられなかった新しい症状
  kind text not null check (kind in ('append', 'new_symptom')),
  symptom_id uuid references sc_symptoms(id) on delete cascade,
  checkpoint_id uuid references sc_checkpoints(id) on delete cascade,
  -- 趣旨の指紋。同じ趣旨は行を増やさず hits を数える
  digest text not null,
  title text not null,
  proposed jsonb not null,                -- {name?, title?, cause, fix, drill, client}
  quote text,                             -- そう判断した根拠になった会話の一節
  hits int not null default 1,
  first_seen_on date not null,
  last_seen_on date not null,
  status text not null default 'collected'
    check (status in ('collected', 'queued', 'adopted', 'rejected')),
  adopted_symptom_id uuid references sc_symptoms(id) on delete set null,
  adopted_knowledge_id uuid references sc_knowledge(id) on delete set null,
  decided_by uuid references staff(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- 同じ趣旨は1行。却下済みでも hits は数え続ける（見送った回数が見える）
create unique index if not exists uq_sc_candidates_digest
  on sc_knowledge_candidates (company_id, digest);
create index if not exists idx_sc_candidates_status
  on sc_knowledge_candidates (company_id, status, hits desc, last_seen_on desc);

-- ============ 3. 採用した知識に印を付ける ============
-- 'learned' = 音声メモから育って、人が採用したもの。
-- 後から「AIが育てた知識 n件」を数えられるようにするため、既存の source と混ぜない。
alter table sc_knowledge drop constraint if exists sc_knowledge_source_check;
alter table sc_knowledge add constraint sc_knowledge_source_check
  check (source in ('manual', 'ai', 'seed', 'import', 'learned'));

-- ============ updated_at トリガ ============
do $$
declare t text;
begin
  foreach t in array array['sc_voice_notes', 'sc_knowledge_candidates'] loop
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function app.set_updated_at()', t);
  end loop;
end $$;

-- ============ RLS（テナント標準） ============
alter table sc_voice_notes           enable row level security;
alter table sc_knowledge_candidates  enable row level security;
do $$
declare t text;
begin
  foreach t in array array['sc_voice_notes', 'sc_knowledge_candidates'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'tenant_select') then
      execute format('create policy tenant_select on %I for select to authenticated using (company_id = app.current_company_id())', t);
      execute format('create policy tenant_insert on %I for insert to authenticated with check (company_id = app.current_company_id())', t);
      execute format('create policy tenant_update on %I for update to authenticated using (company_id = app.current_company_id())', t);
    end if;
  end loop;
end $$;
