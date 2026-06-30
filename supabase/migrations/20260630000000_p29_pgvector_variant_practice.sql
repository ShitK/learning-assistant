-- P2.9: pgvector-backed variant practice corpus retrieval.
-- This table stores teaching-material practice questions only. It does not
-- store student data, diagnosis runs, memory events, profiles, or images.
-- Assumption: the vector extension is not installed yet, or is installed in
-- the extensions schema. If an existing Supabase project installed vector in
-- another schema, inspect pg_extension before applying this migration.

create extension if not exists vector with schema extensions;
grant usage on schema extensions to service_role;

create table if not exists public.variant_practice_corpus_items (
  id text primary key,
  corpus_version text not null,
  source_candidate_id text not null,
  question_text text not null,
  search_text text not null,
  embedding_text text not null,
  embedding_hash text not null,
  embedding_model text not null,
  embedding extensions.vector(1536) not null,
  knowledge_points text[] not null,
  section_title text,
  difficulty text,
  target_skills text[] not null default '{}',
  method_tags text[] not null default '{}',
  feature_flags text[] not null default '{}',
  source_ref jsonb not null default '{}'::jsonb,
  tag_review_meta jsonb not null default '{}'::jsonb,
  review_status text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  constraint variant_practice_corpus_version_check
    check (corpus_version = 'enriched-practice-corpus-v0'),
  constraint variant_practice_review_status_check
    check (review_status = 'approved'),
  constraint variant_practice_question_text_check
    check (length(trim(question_text)) > 0),
  constraint variant_practice_search_text_check
    check (length(trim(search_text)) > 0),
  constraint variant_practice_embedding_text_check
    check (length(trim(embedding_text)) > 0),
  constraint variant_practice_embedding_hash_check
    check (length(trim(embedding_hash)) > 0),
  constraint variant_practice_embedding_model_check
    check (length(trim(embedding_model)) > 0)
);

create index if not exists variant_practice_corpus_items_active_idx
  on public.variant_practice_corpus_items(is_active, corpus_version);

create index if not exists variant_practice_corpus_items_section_idx
  on public.variant_practice_corpus_items(section_title);

create index if not exists variant_practice_corpus_items_knowledge_idx
  on public.variant_practice_corpus_items using gin(knowledge_points);

create index if not exists variant_practice_corpus_items_target_skills_idx
  on public.variant_practice_corpus_items using gin(target_skills);

create index if not exists variant_practice_corpus_items_method_tags_idx
  on public.variant_practice_corpus_items using gin(method_tags);

create index if not exists variant_practice_corpus_items_embedding_hnsw_idx
  on public.variant_practice_corpus_items using hnsw (embedding extensions.vector_cosine_ops);

alter table public.variant_practice_corpus_items enable row level security;

revoke all on public.variant_practice_corpus_items from public, anon, authenticated;
grant select, insert, update on public.variant_practice_corpus_items to service_role;

create or replace function public.match_variant_practice_corpus_items(
  p_query_embedding extensions.vector(1536),
  p_match_count integer,
  p_knowledge_points text[],
  p_target_skills text[],
  p_section_title text
)
returns table (
  id text,
  source_candidate_id text,
  question_text text,
  search_text text,
  knowledge_points text[],
  section_title text,
  difficulty text,
  target_skills text[],
  method_tags text[],
  feature_flags text[],
  source_ref jsonb,
  tag_review_meta jsonb,
  cosine_distance double precision,
  metadata_score integer
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    item.id,
    item.source_candidate_id,
    item.question_text,
    item.search_text,
    item.knowledge_points,
    item.section_title,
    item.difficulty,
    item.target_skills,
    item.method_tags,
    item.feature_flags,
    item.source_ref,
    item.tag_review_meta,
    item.embedding <=> p_query_embedding as cosine_distance,
    (
      case when p_section_title is not null and item.section_title = p_section_title then 5 else 0 end
      + case when item.knowledge_points && coalesce(p_knowledge_points, '{}') then 8 else 0 end
      + case when item.target_skills && coalesce(p_target_skills, '{}') then 7 else 0 end
      + case when item.method_tags && coalesce(p_target_skills, '{}') then 3 else 0 end
    ) as metadata_score
  from public.variant_practice_corpus_items item
  where item.is_active = true
    and item.corpus_version = 'enriched-practice-corpus-v0'
    and item.review_status = 'approved'
    and not ('needs_visual' = any(item.feature_flags))
    and (
      cardinality(coalesce(p_knowledge_points, '{}')) = 0
      or item.knowledge_points && p_knowledge_points
    )
  order by
    item.embedding <=> p_query_embedding asc,
    metadata_score desc,
    item.id asc
  limit least(greatest(coalesce(p_match_count, 12), 1), 24);
$$;

revoke execute on function public.match_variant_practice_corpus_items(
  extensions.vector(1536),
  integer,
  text[],
  text[],
  text
) from public;

grant execute on function public.match_variant_practice_corpus_items(
  extensions.vector(1536),
  integer,
  text[],
  text[],
  text
) to service_role;
