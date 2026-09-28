-- 0214: Semantic Search（pgvector・#300・P4-b）
--   Proposal: gn_embeddings(entity_ref, chunk, embedding) を1表。対象はレッスンコメント（sc_comments 4万件）・会話メモ・Memory。
--   数値は引き続き Ask Data（SQL）、文章は Semantic。議事録・契約（L3）は外部 API に出さないので対象外。
--   埋め込みは Gemini gemini-embedding-001（768次元・lesson-os / swing-cortex と同じ業者。業者を増やさない）。
--   追加のみ。

create extension if not exists vector with schema extensions;

create table if not exists gn_embeddings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  source text not null,                 -- 'sc_comments' / 'lsn_lesson_notes' / 'sc_voice_notes' / 'gn_memories'
  source_id text not null,              -- 元の行の id
  chunk_no int not null default 0,      -- 長文は分割（0 から）
  entity_kind text,                     -- person / lesson / memory …
  entity_id text,
  title text,                           -- 一覧に出す短い見出し（コーチ名・日付・生徒）
  chunk text not null,                  -- 埋め込んだ本文（検索結果にそのまま出す）
  embedding extensions.vector(768) not null,
  meta jsonb not null default '{}'::jsonb,
  source_at timestamptz,                -- 元の行の created_at（時系列表示用）
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, source, source_id, chunk_no)
);
create index if not exists idx_gn_embeddings_hnsw on gn_embeddings using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists idx_gn_embeddings_src on gn_embeddings (company_id, source, source_at desc);
alter table gn_embeddings enable row level security;
-- 読み書きは service_role（Core）だけ。authenticated には出さない（本文に個人の話が入る）
comment on table gn_embeddings is 'Genesis Semantic Search: 文章の埋め込み（768次元・Gemini）。source×source_id×chunk_no で1行。L3（議事録・契約）は入れない #300';

-- 取り込みの進み具合（source ごとに「どこまで入れたか」）
create table if not exists gn_embed_cursors (
  company_id uuid not null references companies(id),
  source text not null,
  cursor_at timestamptz,                -- ここまでの created_at は取り込み済み
  cursor_id text,
  indexed int not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (company_id, source)
);
alter table gn_embed_cursors enable row level security;

-- 検索 RPC（service_role のみ）。cosine 類似度の高い順
create or replace function gn_semantic_search(
  p_company_id uuid,
  p_query extensions.vector(768),
  p_sources text[] default null,
  p_limit int default 20
) returns table (id uuid, source text, source_id text, chunk_no int, entity_kind text, entity_id text, title text, chunk text, meta jsonb, source_at timestamptz, similarity float)
language sql stable security definer set search_path = public, extensions as $$
  select e.id, e.source, e.source_id, e.chunk_no, e.entity_kind, e.entity_id, e.title, e.chunk, e.meta, e.source_at,
         1 - (e.embedding <=> p_query) as similarity
  from gn_embeddings e
  where e.company_id = p_company_id
    and (p_sources is null or e.source = any (p_sources))
  order by e.embedding <=> p_query
  limit greatest(1, least(p_limit, 100));
$$;
revoke all on function gn_semantic_search(uuid, extensions.vector, text[], int) from public;
grant execute on function gn_semantic_search(uuid, extensions.vector, text[], int) to service_role;
comment on function gn_semantic_search(uuid, extensions.vector, text[], int) is 'Genesis: 文章の意味検索（cosine）。service_role のみ #300';
