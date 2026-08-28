-- ============================================================
-- 0132: レッスンの会話を「店のメソッド」に紐づける（AIカルテナレッジ連携）
--
-- 背景（2026-08-28 ユーザーの問い）:
--   「音声→要約→AIカルテナレッジから近いのを検索→コメント生成でもいいかと思います。
--     それだとAIカルテナレッジの意味がないですね…どうしましょう？」
--
--   そのとおりで、**ナレッジを「言い回しの辞書」に使うと意味が無い**。
--   コーチが既に言ったことをAIが別の言葉に置き換えるだけで、コーチの言葉が失われるぶん悪化する。
--
--   向きを逆にする:
--     音声   → 事実（コーチが言ったこと・生徒が言ったこと）。**言い換えない**
--     ナレッジ → その事実に **症状ID・確認項目ID を付ける**（分類）＋
--                **お客様向けの説明文（sc_knowledge.client_explanation）を差し出す**
--     本文   → **コーチの言葉のまま**。AIに書き直させない
--
--   これでナレッジが3つの意味を持つ:
--     1. 記録が検索できる資産になる（「この生徒はすくい打ちが3か月で4回」が出せる）。
--        症状IDが付いて初めて、取り込んだ28,842件のレッスンコメントと同じ土俵に今日が乗る
--     2. お客様への説明文はナレッジ側が持っている＝コーチは書かなくていい
--     3. どの症状にも当たらない表現が溜まる＝「うちのメソッドに無い言葉」としてナレッジを育てる材料
--
-- ⚠ AIに文章を書かせるのをやめて、**AIには分類だけさせる**のがこの設計の要。
--    ここを崩して「AIがコメントを書く」に戻すと、上の3つが全部消える。
-- ============================================================

create table if not exists lsn_note_symptoms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  note_id uuid not null references lsn_lesson_notes(id) on delete cascade,
  student_id uuid not null references lsn_students(id),
  symptom_id uuid not null references sc_symptoms(id),
  checkpoint_id uuid references sc_checkpoints(id),
  quote text,
  confidence int not null default 0,
  source text not null default 'ai' check (source in ('ai', 'coach')),
  rejected boolean not null default false,
  created_at timestamptz not null default now(),
  unique (note_id, symptom_id, checkpoint_id)
);

comment on table lsn_note_symptoms is 'レッスンの会話を店のメソッド（AIカルテナレッジ）の症状・確認項目に紐づけたもの。本文はコーチの言葉のまま、こちらは分類だけ';
comment on column lsn_note_symptoms.quote is 'そう判断した根拠になった会話の一節。コーチが○×を判断するために出す';
comment on column lsn_note_symptoms.rejected is 'コーチが「違う」と外したもの。消さずに残して、外れ方の傾向をあとで見る';
comment on column lsn_note_symptoms.source is 'ai=AIが付けた / coach=コーチが手で足した';

create index if not exists idx_lsn_note_symptoms_note on lsn_note_symptoms (note_id);
create index if not exists idx_lsn_note_symptoms_student on lsn_note_symptoms (student_id, created_at desc) where rejected = false;
create index if not exists idx_lsn_note_symptoms_symptom on lsn_note_symptoms (company_id, symptom_id) where rejected = false;

-- お客様の共有ページに出す説明文（ナレッジの client_explanation が下敷き）
alter table lsn_lesson_notes add column if not exists share_body text;
comment on column lsn_lesson_notes.share_body is 'お客様の共有ページに出す説明文。ナレッジの client_explanation を下敷きにコーチが確認したもの';

alter table lsn_note_symptoms enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'lsn_note_symptoms' and policyname = 'tenant_select') then
    execute 'create policy tenant_select on lsn_note_symptoms for select to authenticated using (company_id = app.current_company_id())';
    execute 'create policy tenant_insert on lsn_note_symptoms for insert to authenticated with check (company_id = app.current_company_id())';
    execute 'create policy tenant_update on lsn_note_symptoms for update to authenticated using (company_id = app.current_company_id())';
  end if;
end $$;
