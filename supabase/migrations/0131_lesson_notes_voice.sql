-- ============================================================
-- 0131: レッスンの会話を録音してAIで要約する（レッスンメモ）
--
-- 背景（2026-08-28 ユーザー提案）:
--   「レッスンOSに会話を聞く設定を置いて、お客さんとの会話を録音して
--     そこからレッスンコメントを要約する形はどうか」
--
--   コーチがレッスン後にコメントを書く手間が現場でいちばん重い。
--   会話には「本人がどう感じたか」という、コーチが後から思い出せない言葉が入っている。
--
-- 設計の要点:
--   1. **同意が無ければ録音できない**。consent_at が null のまま録音は始められない
--      （画面のチェックを押した時刻とスタッフを残す）。
--   2. **音声は要約が済んだら消す**（audio_deleted_at）。残すのは要約と確定本文だけ。
--      文字起こし(transcript)もコーチが確認したら消してよい。正典は body。
--   3. **AIは下書き**。カルテと共有ページに出るのは、コーチが確認・修正した body だけ。
--      トラックマン読み取り（0041/#49・lsn_measurements.ai_raw）と同じ型。
--
-- なぜ lsn_comments に入れないか:
--   lsn_comments は video_id 必須＝「この動画へのコメント」。
--   レッスンメモは動画に紐づかない（その日のレッスン全体）ので別テーブルにする。
--
-- ⚠ お客様の声を録るので、規約・店頭掲示・保存期間・アクセス範囲の整理が先。
--    2026-08-28 時点でリポジトリに録音の記載は無い（docs/genesis/OPERATIONS.md に追記すること）。
-- ============================================================

create table if not exists lsn_lesson_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  student_id uuid not null references lsn_students(id),
  lesson_date date not null,
  coach_staff_id uuid references staff(id),
  audio_path text,                       -- lesson-videos バケット
  audio_seconds int,
  audio_bytes bigint,
  status text not null default 'draft'
    check (status in ('draft', 'uploaded', 'summarized', 'saved', 'failed')),
  consent_at timestamptz,
  consent_by uuid references staff(id),
  transcript text,
  summary jsonb,                         -- {today[], homework[], studentWords[], clubs[], next[]}
  body text,
  ai_raw jsonb,
  error text,
  audio_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table lsn_lesson_notes is 'レッスンの会話を録音してAIで要約したメモ。音声は要約が済んだら消す（audio_deleted_at）';
comment on column lsn_lesson_notes.consent_at is 'お客様に説明して同意を得たとコーチが確認した時刻。ここが null の録音は始められない';
comment on column lsn_lesson_notes.transcript is '文字起こし。コーチが確認したあとは消してよい（本文 body が正典）';
comment on column lsn_lesson_notes.body is 'コーチが確認・修正した確定本文。カルテと共有ページに出るのはこれだけ';
comment on column lsn_lesson_notes.ai_raw is 'AIの生出力（人の修正前）。精度検証に使う';

create index if not exists idx_lsn_lesson_notes_student
  on lsn_lesson_notes (student_id, lesson_date desc) where deleted_at is null;
-- 消し忘れた音声を拾うため（掃除の対象）
create index if not exists idx_lsn_lesson_notes_audio
  on lsn_lesson_notes (created_at) where audio_path is not null and audio_deleted_at is null;

-- RLS（テナント標準・0041 と同じ形）
alter table lsn_lesson_notes enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'lsn_lesson_notes' and policyname = 'tenant_select') then
    execute 'create policy tenant_select on lsn_lesson_notes for select to authenticated using (company_id = app.current_company_id())';
    execute 'create policy tenant_insert on lsn_lesson_notes for insert to authenticated with check (company_id = app.current_company_id())';
    execute 'create policy tenant_update on lsn_lesson_notes for update to authenticated using (company_id = app.current_company_id())';
  end if;
end $$;
