import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260630000000_p29_pgvector_variant_practice.sql",
);

const sql = readFileSync(migrationPath, "utf8");

assert.match(sql, /create extension if not exists vector with schema extensions/);
assert.match(sql, /create table if not exists public\.variant_practice_corpus_items/);
assert.match(sql, /id text primary key/);
assert.match(sql, /corpus_version text not null/);
assert.match(sql, /embedding_text text not null/);
assert.match(sql, /embedding_hash text not null/);
assert.match(sql, /embedding_model text not null/);
assert.match(sql, /embedding extensions\.vector\(1536\) not null/);
assert.match(sql, /review_status text not null/);
assert.match(sql, /is_active boolean not null default true/);
assert.match(sql, /constraint variant_practice_corpus_version_check/);
assert.match(sql, /corpus_version = 'enriched-practice-corpus-v0'/);
assert.match(sql, /constraint variant_practice_review_status_check/);
assert.match(sql, /review_status = 'approved'/);
assert.match(sql, /using hnsw \(embedding extensions\.vector_cosine_ops\)/);
assert.match(sql, /using gin\(knowledge_points\)/);
assert.match(sql, /using gin\(target_skills\)/);
assert.match(sql, /using gin\(method_tags\)/);
assert.match(sql, /grant usage on schema extensions to service_role/);
assert.match(sql, /alter table public\.variant_practice_corpus_items enable row level security/);
assert.match(
  sql,
  /revoke all on public\.variant_practice_corpus_items from public, anon, authenticated/,
);
assert.match(
  sql,
  /grant select, insert, update on public\.variant_practice_corpus_items to service_role/,
);
assert.doesNotMatch(
  sql,
  /grant .* on public\.variant_practice_corpus_items to anon/,
);
assert.doesNotMatch(
  sql,
  /grant .* on public\.variant_practice_corpus_items to authenticated/,
);

assert.match(sql, /create or replace function public\.match_variant_practice_corpus_items/);
assert.match(sql, /p_query_embedding extensions\.vector\(1536\)/);
assert.match(sql, /returns table \(/);
assert.match(sql, /cosine_distance double precision/);
assert.match(sql, /metadata_score integer/);
assert.match(sql, /security definer/);
assert.match(sql, /set search_path = public, extensions/);
assert.match(sql, /item\.embedding <=> p_query_embedding as cosine_distance/);
assert.match(sql, /item\.is_active = true/);
assert.match(sql, /item\.review_status = 'approved'/);
assert.match(sql, /not \('needs_visual' = any\(item\.feature_flags\)\)/);
assert.match(sql, /limit least\(greatest\(coalesce\(p_match_count, 12\), 1\), 24\)/);
assert.match(sql, /revoke execute on function public\.match_variant_practice_corpus_items/);
assert.match(sql, /grant execute on function public\.match_variant_practice_corpus_items/);
assert.match(sql, /to service_role/);
assert.doesNotMatch(sql, /to anon/);
assert.doesNotMatch(sql, /to authenticated/);

console.log("variant practice pgvector migration tests passed");
