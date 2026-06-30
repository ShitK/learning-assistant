# P2.9 pgvector-backed Variant Practice Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade P2.7 Dynamic Variant Practice so `/api/variant-practice` prefers server-side Supabase Postgres + pgvector candidate retrieval, while preserving the existing local JSON fallback and the strict read-only RAG boundary.

**Architecture:** Add a service-role-only pgvector corpus table, a local sync CLI that embeds approved enriched corpus items, an OpenAI-compatible embedding provider, a server-only corpus source that tries pgvector before local JSON, and a small integration change in `dynamic-variant-practice-service.ts`. The public API response remains `{ variant_practice: ProductVariantPractice | null }`; pgvector only changes candidate retrieval and never writes student memory/profile facts.

**Tech Stack:** Next.js App Router Route Handlers, TypeScript, Supabase Postgres, pgvector `extensions.vector(1536)`, `@supabase/supabase-js`, Node.js ESM scripts/tests, existing Jiti test harness, existing Variant Practice Agent and `ProductVariantPractice` mapper. No new npm dependencies.

## Global Constraints

- Current branch: `codex/p29-pgvector-variant-practice-spec`.
- Fixed demo student: `demo_student_001`.
- Do not implement login, real multi-user, teacher/parent/admin flows, user-facing RLS policies, multi-tenant isolation, non-derivative topics, PDF online ingestion, image storage, exercise answer grading, LLM rerank, reason polish, or dynamic question generation.
- `POST /api/variant-practice` external response contract stays `{ variant_practice: ProductVariantPractice | null }`.
- Do not expand or couple `/api/confirm`; do not modify `src/app/api/confirm/**`, `src/lib/diagnosis/**`, `src/lib/persistence/student-profile-persistence.ts`, `src/lib/persistence/diagnosis-persistence.ts`, `src/lib/shared/student-profile.ts`, `src/components/workbench/practice-lab.tsx`, or `src/lib/rag/variant-practice-product-view-model.ts` unless a focused test proves a small adapter change is unavoidable.
- RAG remains read-only at runtime: it must not write `memory_events`, `student_profiles`, `diagnosis_runs`, `mistake_book_items`, or localStorage.
- Frontend must not read Supabase, service role keys, embedding provider keys, local corpus files, or `artifacts/**`.
- `artifacts/**`, `.env*`, generated recommendations, real corpus artifacts, `.superpowers/sdd/**`, and `docs/reviews/*.md` must not be staged or committed.
- Local JSON fallback remains a supported runtime fallback: `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`.
- First version supports only `corpus_version="enriched-practice-corpus-v0"`, approved derivative items, OpenAI-compatible embeddings, and `RAG_EMBEDDING_DIMENSIONS=1536`.
- Embedding provider env vars must use the independent `RAG_EMBEDDING_PROVIDER_*` namespace; do not reuse `VISION_PROVIDER_*` or `ANALYSIS_PROVIDER_*`.
- `variant-practice-embedding-text.ts` must remain browser-safe and must not import `node:crypto`; sha256 belongs in the Node sync CLI.
- Runtime pgvector RPC calls must use a short timeout and fall back to local JSON on timeout.
- Docs implemented in the final task must update PRD, Technical Roadmap, RAG artifact docs, interview narrative, and an ADR unless implementation proves ADR unnecessary.

---

## File Structure

- Create `supabase/migrations/20260630000000_p29_pgvector_variant_practice.sql`
  - Adds pgvector extension in `extensions`, the service-role-only `variant_practice_corpus_items` table, indexes, and the read-only `match_variant_practice_corpus_items` RPC.
- Create `src/lib/rag/variant-practice-embedding-text.ts`
  - Browser-safe pure helpers for corpus/query embedding text and hash input strings.
- Create `src/lib/providers/embedding-provider.ts`
  - Server-side OpenAI-compatible embeddings provider with timeout, dimension guard, and safe errors.
- Create `src/lib/persistence/variant-practice-corpus-persistence.ts`
  - Service-role Supabase repository for upsert/deactivate/match, plus disabled fallback repository.
- Create `src/lib/server/rag/variant-practice-corpus-source.ts`
  - Server-only corpus source: pgvector candidate corpus reader and local JSON corpus reader.
- Create `scripts/rag/sync-variant-practice-pgvector-core.mjs`
  - Testable sync planner/row builder for approved corpus items.
- Create `scripts/rag/sync-variant-practice-pgvector.mjs`
  - CLI wrapper for `--dry-run` and `--apply`.
- Create tests:
  - `scripts/tests/persistence/variant-practice-pgvector-migration.test.mjs`
  - `scripts/tests/rag/variant-practice-embedding-text.test.mjs`
  - `scripts/tests/providers/embedding-provider.test.mjs`
  - `scripts/tests/persistence/variant-practice-corpus-persistence.test.mjs`
  - `scripts/tests/rag/variant-practice-corpus-source.test.mjs`
  - `scripts/tests/rag/sync-variant-practice-pgvector-core.test.mjs`
- Modify:
  - `src/lib/server/rag/dynamic-variant-practice-service.ts`
  - `scripts/run-tests.mjs`
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `docs/TECHNICAL_ROADMAP.md`
  - `docs/rag-artifacts.md`
  - `interview/mathtrace-project-narrative.md`
- Create `docs/adr/2026-06-30-pgvector-variant-practice-retrieval.md`
  - Records why P2.9 uses pgvector candidate source + local JSON fallback and keeps RAG outside the memory/profile fact layer.

---

### Task 1: pgvector Migration And SQL Guards

**Files:**
- Create: `supabase/migrations/20260630000000_p29_pgvector_variant_practice.sql`
- Create: `scripts/tests/persistence/variant-practice-pgvector-migration.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Produces SQL table `public.variant_practice_corpus_items`.
- Produces SQL RPC `public.match_variant_practice_corpus_items(...)`.
- Later tasks rely on the table columns and RPC return names exactly as defined here.

- [ ] **Step 1: Write the failing migration guard test**

Create `scripts/tests/persistence/variant-practice-pgvector-migration.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the test and verify it fails because the migration is missing**

Run:

```bash
node scripts/tests/persistence/variant-practice-pgvector-migration.test.mjs
```

Expected: FAIL with `ENOENT` for `20260630000000_p29_pgvector_variant_practice.sql`.

- [ ] **Step 3: Add the migration**

Create `supabase/migrations/20260630000000_p29_pgvector_variant_practice.sql`:

```sql
-- P2.9: pgvector-backed variant practice corpus retrieval.
-- This table stores teaching-material practice questions only. It does not
-- store student data, diagnosis runs, memory events, profiles, or images.

create extension if not exists vector with schema extensions;

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
```

- [ ] **Step 4: Add the migration test to the default suite**

Modify `scripts/run-tests.mjs`, inserting this path near the other persistence tests:

```js
"scripts/tests/persistence/variant-practice-pgvector-migration.test.mjs",
```

- [ ] **Step 5: Run migration guard test**

Run:

```bash
node scripts/tests/persistence/variant-practice-pgvector-migration.test.mjs
```

Expected output:

```text
variant practice pgvector migration tests passed
```

- [ ] **Step 6: Commit Task 1**

Review status:

```bash
git status --short
```

Stage only Task 1 files:

```bash
git add supabase/migrations/20260630000000_p29_pgvector_variant_practice.sql \
  scripts/tests/persistence/variant-practice-pgvector-migration.test.mjs \
  scripts/run-tests.mjs
git commit -m "feat: add pgvector variant practice schema"
```

---

### Task 2: Embedding Text And Hash Input Helpers

**Files:**
- Create: `src/lib/rag/variant-practice-embedding-text.ts`
- Create: `scripts/tests/rag/variant-practice-embedding-text.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Produces `buildVariantPracticeItemEmbeddingText(item: VariantPracticeEmbeddingTextItem): string`.
- Produces `buildDynamicPracticeQueryEmbeddingText(query: DynamicPracticeQuery): string`.
- Produces `buildVariantPracticeEmbeddingHashInput(input: { embedding_model: string; dimensions: number; embedding_text: string }): string`.
- Later sync CLI uses hash input and computes sha256 in Node; this module stays browser-safe.

- [ ] **Step 1: Write the failing embedding text test**

Create `scripts/tests/rag/variant-practice-embedding-text.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  buildDynamicPracticeQueryEmbeddingText,
  buildVariantPracticeEmbeddingHashInput,
  buildVariantPracticeItemEmbeddingText,
} = jiti("./src/lib/rag/variant-practice-embedding-text.ts");

const itemEmbeddingText = buildVariantPracticeItemEmbeddingText({
  question_text: "已知 $f(x)=\\ln x-ax+1$，讨论单调性。",
  search_text: "导数 单调 参数",
  knowledge_points: ["derivative"],
  section_title: "考点 2 导数与函数的单调性",
  target_skills: ["monotonicity", "parameter_range"],
  method_tags: ["monotonicity_by_derivative"],
  source_ref: { pdf_path: "private.pdf" },
  review_meta: { reviewer: "local-user" },
  tag_review_meta: { review_status: "approved" },
});

assert.equal(itemEmbeddingText.includes("题干："), true);
assert.equal(itemEmbeddingText.includes("检索文本："), true);
assert.equal(itemEmbeddingText.includes("知识点：\nderivative"), true);
assert.equal(itemEmbeddingText.includes("章节：\n考点 2 导数与函数的单调性"), true);
assert.equal(itemEmbeddingText.includes("目标能力：\nmonotonicity、parameter_range"), true);
assert.equal(itemEmbeddingText.includes("方法标签：\nmonotonicity_by_derivative"), true);
assert.equal(itemEmbeddingText.includes("private.pdf"), false);
assert.equal(itemEmbeddingText.includes("reviewer"), false);
assert.equal(itemEmbeddingText.includes("review_status"), false);

const queryEmbeddingText = buildDynamicPracticeQueryEmbeddingText({
  id: "dynamic-confirmed-image-diagnosis",
  question_text: "当前错题题干",
  knowledge_points: ["derivative"],
  section_title: "考点 2 导数与函数的单调性",
  mistake_causes: ["classification_missing"],
  target_skills: ["monotonicity"],
});

assert.equal(queryEmbeddingText.includes("当前错题：\n当前错题题干"), true);
assert.equal(queryEmbeddingText.includes("错因：\nclassification_missing"), true);
assert.equal(queryEmbeddingText.includes("练习目标：\nmonotonicity"), true);
assert.equal(queryEmbeddingText.includes("student_profile"), false);
assert.equal(queryEmbeddingText.includes("memory_delta"), false);

const hashInput = buildVariantPracticeEmbeddingHashInput({
  embedding_model: "text-embedding-3-small",
  dimensions: 1536,
  embedding_text: itemEmbeddingText,
});

assert.equal(
  hashInput,
  `text-embedding-3-small\n1536\n${itemEmbeddingText}`,
);

const sourceText = readFileSync(
  "src/lib/rag/variant-practice-embedding-text.ts",
  "utf8",
);
assert.equal(sourceText.includes("node:crypto"), false);
assert.equal(sourceText.includes("createHash"), false);

console.log("variant practice embedding text tests passed");
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node scripts/tests/rag/variant-practice-embedding-text.test.mjs
```

Expected: FAIL with module not found for `variant-practice-embedding-text.ts`.

- [ ] **Step 3: Implement the browser-safe helper**

Create `src/lib/rag/variant-practice-embedding-text.ts`:

```ts
import type { DynamicPracticeQuery } from "@/lib/rag/dynamic-variant-practice-query";

export interface VariantPracticeEmbeddingTextItem {
  question_text: string;
  search_text: string;
  knowledge_points: string[];
  section_title?: string | null;
  target_skills?: string[];
  method_tags?: string[];
}

export interface VariantPracticeEmbeddingHashInput {
  embedding_model: string;
  dimensions: number;
  embedding_text: string;
}

export function buildVariantPracticeItemEmbeddingText(
  item: VariantPracticeEmbeddingTextItem,
): string {
  return [
    "题干：",
    normalizeText(item.question_text),
    "",
    "检索文本：",
    normalizeText(item.search_text),
    "",
    "知识点：",
    normalizeList(item.knowledge_points),
    "",
    "章节：",
    normalizeText(item.section_title ?? ""),
    "",
    "目标能力：",
    normalizeList(item.target_skills ?? []),
    "",
    "方法标签：",
    normalizeList(item.method_tags ?? []),
  ].join("\n");
}

export function buildDynamicPracticeQueryEmbeddingText(
  query: DynamicPracticeQuery,
): string {
  return [
    "当前错题：",
    normalizeText(query.question_text),
    "",
    "知识点：",
    normalizeList(query.knowledge_points),
    "",
    "章节：",
    normalizeText(query.section_title ?? ""),
    "",
    "错因：",
    normalizeList(query.mistake_causes),
    "",
    "练习目标：",
    normalizeList(query.target_skills),
  ].join("\n");
}

export function buildVariantPracticeEmbeddingHashInput(
  input: VariantPracticeEmbeddingHashInput,
): string {
  return [
    normalizeText(input.embedding_model),
    String(input.dimensions),
    input.embedding_text,
  ].join("\n");
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function normalizeList(values: readonly string[]): string {
  return [...new Set(values.map(normalizeText).filter(Boolean))].join("、");
}
```

- [ ] **Step 4: Add the test to default suite**

Modify `scripts/run-tests.mjs`, inserting near dynamic variant practice tests:

```js
"scripts/tests/rag/variant-practice-embedding-text.test.mjs",
```

- [ ] **Step 5: Run focused test**

Run:

```bash
node scripts/tests/rag/variant-practice-embedding-text.test.mjs
```

Expected output:

```text
variant practice embedding text tests passed
```

- [ ] **Step 6: Commit Task 2**

```bash
git status --short
git add src/lib/rag/variant-practice-embedding-text.ts \
  scripts/tests/rag/variant-practice-embedding-text.test.mjs \
  scripts/run-tests.mjs
git commit -m "feat: add variant practice embedding text helpers"
```

---

### Task 3: RAG Embedding Provider

**Files:**
- Create: `src/lib/providers/embedding-provider.ts`
- Create: `scripts/tests/providers/embedding-provider.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Produces `createEmbeddingProviderConfigFromEnv(env)`.
- Produces `createEmbeddingProvider(config)`.
- Produces `EmbeddingProvider.embedText({ text }): Promise<EmbeddingProviderResult>`.
- Runtime and sync CLI use the same provider contract.

- [ ] **Step 1: Write the failing provider test**

Create `scripts/tests/providers/embedding-provider.test.mjs`:

```js
import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  createEmbeddingProvider,
  createEmbeddingProviderConfigFromEnv,
} = jiti("./src/lib/providers/embedding-provider.ts");

const missingConfig = createEmbeddingProviderConfigFromEnv({});
assert.equal(missingConfig.ok, false);
assert.equal(missingConfig.error.code, "model_not_configured");
assert.equal(missingConfig.error.message.includes("RAG_EMBEDDING_PROVIDER_API_KEY"), true);
assert.equal(missingConfig.error.message.includes("secret"), false);

const configResult = createEmbeddingProviderConfigFromEnv({
  RAG_EMBEDDING_PROVIDER_PROTOCOL: "openai",
  RAG_EMBEDDING_PROVIDER_BASE_URL: "https://api.openai.com/v1",
  RAG_EMBEDDING_PROVIDER_MODEL: "text-embedding-3-small",
  RAG_EMBEDDING_PROVIDER_API_KEY: "local-secret",
  RAG_EMBEDDING_PROVIDER_NAME: "rag_embedding_provider",
  RAG_EMBEDDING_PROVIDER_TIMEOUT_MS: "45000",
  RAG_EMBEDDING_DIMENSIONS: "1536",
});

assert.equal(configResult.ok, true);
assert.equal(configResult.value.protocol, "openai");
assert.equal(configResult.value.base_url, "https://api.openai.com/v1");
assert.equal(configResult.value.model, "text-embedding-3-small");
assert.equal(configResult.value.provider_name, "rag_embedding_provider");
assert.equal(configResult.value.timeout_ms, 45000);
assert.equal(configResult.value.dimensions, 1536);

const unsupportedProtocol = createEmbeddingProviderConfigFromEnv({
  RAG_EMBEDDING_PROVIDER_PROTOCOL: "anthropic",
  RAG_EMBEDDING_PROVIDER_API_KEY: "local-secret",
});
assert.equal(unsupportedProtocol.ok, false);
assert.equal(unsupportedProtocol.error.code, "model_not_configured");

const invalidDimensions = createEmbeddingProviderConfigFromEnv({
  RAG_EMBEDDING_PROVIDER_API_KEY: "local-secret",
  RAG_EMBEDDING_DIMENSIONS: "768",
});
assert.equal(invalidDimensions.ok, false);
assert.equal(invalidDimensions.error.code, "model_not_configured");

const requests = [];
const provider = createEmbeddingProvider({
  protocol: "openai",
  base_url: "https://api.openai.com/v1",
  model: "text-embedding-3-small",
  api_key: "local-secret",
  provider_name: "rag_embedding_provider",
  timeout_ms: 30000,
  dimensions: 1536,
  fetch_fn: async (url, init) => {
    requests.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body),
    });

    return new Response(
      JSON.stringify({
        model: "text-embedding-3-small",
        data: [{ embedding: Array.from({ length: 1536 }, (_, index) => index / 1536) }],
      }),
      { status: 200 },
    );
  },
});

const result = await provider.embedText({ text: "导数 单调性 变式练习" });
assert.equal(result.ok, true);
assert.equal(result.value.embedding.length, 1536);
assert.equal(result.value.model, "text-embedding-3-small");
assert.equal(result.value.dimensions, 1536);
assert.equal(result.value.provider_name, "rag_embedding_provider");
assert.equal(requests.length, 1);
assert.equal(requests[0].url, "https://api.openai.com/v1/embeddings");
assert.equal(requests[0].headers.Authorization, "Bearer local-secret");
assert.deepEqual(requests[0].body, {
  model: "text-embedding-3-small",
  input: "导数 单调性 变式练习",
});

const badDimensionProvider = createEmbeddingProvider({
  protocol: "openai",
  base_url: "https://api.openai.com/v1",
  model: "text-embedding-3-small",
  api_key: "local-secret",
  provider_name: "rag_embedding_provider",
  timeout_ms: 30000,
  dimensions: 1536,
  fetch_fn: async () =>
    new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), {
      status: 200,
    }),
});

const badDimensionResult = await badDimensionProvider.embedText({ text: "x" });
assert.equal(badDimensionResult.ok, false);
assert.equal(badDimensionResult.error.code, "model_invalid_output");
assert.equal(JSON.stringify(badDimensionResult).includes("local-secret"), false);

const httpErrorProvider = createEmbeddingProvider({
  protocol: "openai",
  base_url: "https://api.openai.com/v1",
  model: "text-embedding-3-small",
  api_key: "local-secret",
  provider_name: "rag_embedding_provider",
  timeout_ms: 30000,
  dimensions: 1536,
  fetch_fn: async () => new Response("failed", { status: 500 }),
});

const httpErrorResult = await httpErrorProvider.embedText({ text: "x" });
assert.equal(httpErrorResult.ok, false);
assert.equal(httpErrorResult.error.failure_kind, "http_error");
assert.equal(httpErrorResult.error.http_status, 500);

const invalidJsonProvider = createEmbeddingProvider({
  protocol: "openai",
  base_url: "https://api.openai.com/v1",
  model: "text-embedding-3-small",
  api_key: "local-secret",
  provider_name: "rag_embedding_provider",
  timeout_ms: 30000,
  dimensions: 1536,
  fetch_fn: async () => new Response("{", { status: 200 }),
});

const invalidJsonResult = await invalidJsonProvider.embedText({ text: "x" });
assert.equal(invalidJsonResult.ok, false);
assert.equal(invalidJsonResult.error.failure_kind, "invalid_json");

console.log("embedding provider tests passed");
```

- [ ] **Step 2: Run provider test and verify failure**

Run:

```bash
node scripts/tests/providers/embedding-provider.test.mjs
```

Expected: FAIL with module not found for `embedding-provider.ts`.

- [ ] **Step 3: Implement the provider**

Create `src/lib/providers/embedding-provider.ts`:

```ts
export interface EmbeddingProviderConfig {
  protocol: "openai";
  base_url: string;
  model: string;
  api_key: string;
  provider_name: string;
  timeout_ms: number;
  dimensions: 1536;
  fetch_fn?: typeof fetch;
}

export type EmbeddingProviderConfigResult =
  | { ok: true; value: EmbeddingProviderConfig }
  | { ok: false; error: EmbeddingProviderError };

export interface EmbeddingProviderValue {
  embedding: number[];
  model: string;
  provider_name: string;
  dimensions: 1536;
}

export type EmbeddingProviderResult =
  | { ok: true; value: EmbeddingProviderValue }
  | { ok: false; error: EmbeddingProviderError };

export interface EmbeddingProviderError {
  code: "model_not_configured" | "model_request_failed" | "model_timeout" | "model_invalid_output";
  message: string;
  recoverable: true;
  failure_kind:
    | "not_configured"
    | "http_error"
    | "network_failed"
    | "timeout"
    | "invalid_json"
    | "invalid_output";
  provider_name?: string;
  http_status?: number;
}

export interface EmbeddingProvider {
  embedText(input: { text: string }): Promise<EmbeddingProviderResult>;
}

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_PROVIDER_NAME = "rag_embedding_provider";
const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 2_000;
const MAX_TIMEOUT_MS = 120_000;
const SUPPORTED_DIMENSIONS = 1536;

export function createEmbeddingProviderConfigFromEnv(
  env: Record<string, string | undefined>,
): EmbeddingProviderConfigResult {
  const apiKey = env.RAG_EMBEDDING_PROVIDER_API_KEY?.trim();
  if (!apiKey) {
    return {
      ok: false,
      error: notConfigured("服务端未配置 RAG_EMBEDDING_PROVIDER_API_KEY，pgvector 检索将回退到本地题库。"),
    };
  }

  const protocol = env.RAG_EMBEDDING_PROVIDER_PROTOCOL?.trim() || "openai";
  if (protocol !== "openai") {
    return {
      ok: false,
      error: notConfigured("RAG_EMBEDDING_PROVIDER_PROTOCOL 当前仅支持 openai。"),
    };
  }

  const dimensionsText = env.RAG_EMBEDDING_DIMENSIONS?.trim() || "1536";
  const dimensions = Number(dimensionsText);
  if (dimensions !== SUPPORTED_DIMENSIONS) {
    return {
      ok: false,
      error: notConfigured("RAG_EMBEDDING_DIMENSIONS 当前必须是 1536。"),
    };
  }

  return {
    ok: true,
    value: {
      protocol: "openai",
      base_url: env.RAG_EMBEDDING_PROVIDER_BASE_URL?.trim() || DEFAULT_BASE_URL,
      model: env.RAG_EMBEDDING_PROVIDER_MODEL?.trim() || DEFAULT_MODEL,
      api_key: apiKey,
      provider_name: env.RAG_EMBEDDING_PROVIDER_NAME?.trim() || DEFAULT_PROVIDER_NAME,
      timeout_ms: parseTimeoutMs(env.RAG_EMBEDDING_PROVIDER_TIMEOUT_MS),
      dimensions: SUPPORTED_DIMENSIONS,
    },
  };
}

export function createEmbeddingProvider(
  config: EmbeddingProviderConfig,
): EmbeddingProvider {
  const fetchFn = config.fetch_fn ?? fetch;

  return {
    async embedText(input): Promise<EmbeddingProviderResult> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeout_ms);

      try {
        const response = await fetchFn(buildEmbeddingsUrl(config.base_url), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.api_key}`,
          },
          body: JSON.stringify({
            model: config.model,
            input: input.text,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          return {
            ok: false,
            error: {
              code: "model_request_failed",
              message: "RAG embedding provider 请求失败，已回退本地题库。",
              recoverable: true,
              failure_kind: "http_error",
              provider_name: config.provider_name,
              http_status: response.status,
            },
          };
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          return invalidOutput(config, "invalid_json", "RAG embedding provider 返回的 JSON 无法解析。");
        }

        const embedding = readEmbedding(payload);
        if (
          !embedding ||
          embedding.length !== config.dimensions ||
          !embedding.every((value) => Number.isFinite(value))
        ) {
          return invalidOutput(config, "invalid_output", "RAG embedding provider 返回的向量维度不符合 1536。");
        }

        return {
          ok: true,
          value: {
            embedding,
            model: config.model,
            provider_name: config.provider_name,
            dimensions: config.dimensions,
          },
        };
      } catch (error) {
        const isTimeout =
          error instanceof DOMException && error.name === "AbortError";

        return {
          ok: false,
          error: {
            code: isTimeout ? "model_timeout" : "model_request_failed",
            message: isTimeout
              ? "RAG embedding provider 请求超时，已回退本地题库。"
              : "RAG embedding provider 网络请求失败，已回退本地题库。",
            recoverable: true,
            failure_kind: isTimeout ? "timeout" : "network_failed",
            provider_name: config.provider_name,
          },
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function notConfigured(message: string): EmbeddingProviderError {
  return {
    code: "model_not_configured",
    message,
    recoverable: true,
    failure_kind: "not_configured",
  };
}

function invalidOutput(
  config: EmbeddingProviderConfig,
  failureKind: "invalid_json" | "invalid_output",
  message: string,
): EmbeddingProviderResult {
  return {
    ok: false,
    error: {
      code: "model_invalid_output",
      message,
      recoverable: true,
      failure_kind: failureKind,
      provider_name: config.provider_name,
    },
  };
}

function readEmbedding(payload: unknown): number[] | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const first = data[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return null;
  }

  const embedding = (first as { embedding?: unknown }).embedding;
  return Array.isArray(embedding) &&
    embedding.every((value) => typeof value === "number")
    ? embedding
    : null;
}

function buildEmbeddingsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/u, "");
  return trimmed.endsWith("/embeddings") ? trimmed : `${trimmed}/embeddings`;
}

function parseTimeoutMs(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(Math.max(parsed, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}
```

- [ ] **Step 4: Add test to default suite**

Modify `scripts/run-tests.mjs`, inserting near provider tests:

```js
"scripts/tests/providers/embedding-provider.test.mjs",
```

- [ ] **Step 5: Run provider test**

Run:

```bash
node scripts/tests/providers/embedding-provider.test.mjs
```

Expected output:

```text
embedding provider tests passed
```

- [ ] **Step 6: Commit Task 3**

```bash
git status --short
git add src/lib/providers/embedding-provider.ts \
  scripts/tests/providers/embedding-provider.test.mjs \
  scripts/run-tests.mjs
git commit -m "feat: add rag embedding provider"
```

---

### Task 4: pgvector Persistence Repository

**Files:**
- Create: `src/lib/persistence/variant-practice-corpus-persistence.ts`
- Create: `scripts/tests/persistence/variant-practice-corpus-persistence.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Produces `createDefaultVariantPracticeCorpusRepository()`.
- Produces `createSupabaseVariantPracticeCorpusRepository(client)`.
- Produces `createDisabledVariantPracticeCorpusRepository()`.
- Repository methods:
  - `listEmbeddingHashes(): Promise<Map<string, string>>`
  - `upsertItems(items: VariantPracticeCorpusUpsertInput[]): Promise<void>`
  - `deactivateMissingItems(activeIds: string[]): Promise<void>`
  - `matchItems(input: VariantPracticeCorpusMatchInput): Promise<VariantPracticeCorpusDbItem[]>`

- [ ] **Step 1: Write the failing persistence test**

Create `scripts/tests/persistence/variant-practice-corpus-persistence.test.mjs`:

```js
import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  createDisabledVariantPracticeCorpusRepository,
  createSupabaseVariantPracticeCorpusRepository,
  normalizePgvectorQueryTimeoutMs,
} = jiti("./src/lib/persistence/variant-practice-corpus-persistence.ts");

assert.equal(normalizePgvectorQueryTimeoutMs(undefined), 10000);
assert.equal(normalizePgvectorQueryTimeoutMs("1"), 2000);
assert.equal(normalizePgvectorQueryTimeoutMs("7000"), 7000);
assert.equal(normalizePgvectorQueryTimeoutMs("30000"), 15000);
assert.equal(normalizePgvectorQueryTimeoutMs("bad"), 10000);

const disabled = createDisabledVariantPracticeCorpusRepository();
assert.equal(disabled.is_database_configured, false);
assert.deepEqual(await disabled.listEmbeddingHashes(), new Map());
await disabled.upsertItems([]);
await disabled.deactivateMissingItems([]);
assert.deepEqual(
  await disabled.matchItems({
    query_embedding: [0.1, 0.2],
    match_count: 12,
    knowledge_points: ["derivative"],
    target_skills: ["monotonicity"],
    section_title: "考点 2 导数与函数的单调性",
    timeout_ms: 10,
  }),
  [],
);

const calls = [];
const fakeClient = {
  from(table) {
    calls.push({ kind: "from", table });
    if (table !== "variant_practice_corpus_items") {
      throw new Error(`unexpected table ${table}`);
    }
    return {
      select(columns) {
        calls.push({ kind: "select", columns });
        return {
          eq(column, value) {
            calls.push({ kind: "eq", column, value });
            return Promise.resolve({
              data: [
                { id: "practice-1", embedding_hash: "hash-1" },
                { id: "practice-2", embedding_hash: "hash-2" },
              ],
              error: null,
            });
          },
        };
      },
      upsert(payload, options) {
        calls.push({ kind: "upsert", payload, options });
        return Promise.resolve({ error: null });
      },
      update(payload) {
        calls.push({ kind: "update", payload });
        return {
          not(column, operator, value) {
            calls.push({ kind: "not", column, operator, value });
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  },
  rpc(name, params) {
    calls.push({ kind: "rpc", name, params });
    return Promise.resolve({
      data: [
        {
          id: "practice-1",
          source_candidate_id: "candidate-1",
          question_text: "题干",
          search_text: "检索文本",
          knowledge_points: ["derivative"],
          section_title: "考点 2 导数与函数的单调性",
          difficulty: null,
          target_skills: ["monotonicity"],
          method_tags: ["monotonicity_by_derivative"],
          feature_flags: [],
          source_ref: { pdf_page_index: 1 },
          tag_review_meta: { review_status: "approved" },
          cosine_distance: 0.12,
          metadata_score: 20,
        },
      ],
      error: null,
    });
  },
};

const repository = createSupabaseVariantPracticeCorpusRepository(fakeClient);
assert.equal(repository.is_database_configured, true);

const hashes = await repository.listEmbeddingHashes();
assert.equal(hashes.get("practice-1"), "hash-1");
assert.equal(hashes.get("practice-2"), "hash-2");

await repository.upsertItems([
  {
    id: "practice-1",
    corpus_version: "enriched-practice-corpus-v0",
    source_candidate_id: "candidate-1",
    question_text: "题干",
    search_text: "检索文本",
    embedding_text: "embedding text",
    embedding_hash: "hash-1",
    embedding_model: "text-embedding-3-small",
    embedding: [0.1, 0.2, 0.3],
    knowledge_points: ["derivative"],
    section_title: "考点 2 导数与函数的单调性",
    difficulty: null,
    target_skills: ["monotonicity"],
    method_tags: ["monotonicity_by_derivative"],
    feature_flags: [],
    source_ref: { pdf_page_index: 1 },
    tag_review_meta: { review_status: "approved" },
    review_status: "approved",
  },
]);

const upsertCall = calls.find((call) => call.kind === "upsert");
assert.equal(upsertCall.options.onConflict, "id");
assert.equal(upsertCall.payload[0].is_active, true);
assert.equal(typeof upsertCall.payload[0].updated_at, "string");
assert.equal(typeof upsertCall.payload[0].last_synced_at, "string");

await repository.deactivateMissingItems(["practice-1"]);
const updateCall = calls.find((call) => call.kind === "update");
assert.deepEqual(updateCall.payload, { is_active: false });
const notCall = calls.find((call) => call.kind === "not");
assert.equal(notCall.column, "id");
assert.equal(notCall.operator, "in");
assert.equal(notCall.value, "(practice-1)");

const matches = await repository.matchItems({
  query_embedding: Array.from({ length: 1536 }, () => 0.01),
  match_count: 12,
  knowledge_points: ["derivative"],
  target_skills: ["monotonicity"],
  section_title: "考点 2 导数与函数的单调性",
  timeout_ms: 1000,
});

assert.equal(matches.length, 1);
assert.equal(matches[0].id, "practice-1");
assert.equal(matches[0].review_status, "approved");
assert.equal(matches[0].cosine_distance, 0.12);
assert.equal(matches[0].metadata_score, 20);
const rpcCall = calls.find((call) => call.kind === "rpc");
assert.equal(rpcCall.name, "match_variant_practice_corpus_items");
assert.equal(rpcCall.params.p_match_count, 12);

const hangingRepository = createSupabaseVariantPracticeCorpusRepository({
  rpc() {
    return new Promise(() => {});
  },
  from() {
    throw new Error("not used");
  },
});

const startedAt = Date.now();
const timeoutMatches = await hangingRepository.matchItems({
  query_embedding: [0.1],
  match_count: 12,
  knowledge_points: ["derivative"],
  target_skills: [],
  section_title: null,
  timeout_ms: 20,
});
assert.deepEqual(timeoutMatches, []);
assert.equal(Date.now() - startedAt < 1000, true);

console.log("variant practice corpus persistence tests passed");
```

- [ ] **Step 2: Run persistence test and verify failure**

Run:

```bash
node scripts/tests/persistence/variant-practice-corpus-persistence.test.mjs
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement the repository**

Create `src/lib/persistence/variant-practice-corpus-persistence.ts`:

```ts
import {
  createSupabaseAdminClient,
  getSupabaseAdminConfig,
} from "@/lib/persistence/supabase-admin";

export interface VariantPracticeCorpusDbItem {
  id: string;
  source_candidate_id: string;
  question_text: string;
  search_text: string;
  knowledge_points: string[];
  section_title: string | null;
  difficulty: string | null;
  target_skills: string[];
  method_tags: string[];
  feature_flags: string[];
  source_ref: unknown;
  tag_review_meta: unknown;
  review_status: "approved";
  cosine_distance: number;
  metadata_score: number;
}

export interface VariantPracticeCorpusUpsertInput {
  id: string;
  corpus_version: "enriched-practice-corpus-v0";
  source_candidate_id: string;
  question_text: string;
  search_text: string;
  embedding_text: string;
  embedding_hash: string;
  embedding_model: string;
  embedding: number[];
  knowledge_points: string[];
  section_title: string | null;
  difficulty: string | null;
  target_skills: string[];
  method_tags: string[];
  feature_flags: string[];
  source_ref: unknown;
  tag_review_meta: unknown;
  review_status: "approved";
}

export interface VariantPracticeCorpusMatchInput {
  query_embedding: number[];
  match_count: number;
  knowledge_points: string[];
  target_skills: string[];
  section_title: string | null;
  timeout_ms: number;
}

export interface VariantPracticeCorpusRepository {
  is_database_configured: boolean;
  listEmbeddingHashes(): Promise<Map<string, string>>;
  upsertItems(items: VariantPracticeCorpusUpsertInput[]): Promise<void>;
  deactivateMissingItems(activeIds: string[]): Promise<void>;
  matchItems(
    input: VariantPracticeCorpusMatchInput,
  ): Promise<VariantPracticeCorpusDbItem[]>;
}

export interface SupabaseVariantPracticeCorpusClient {
  from(table: "variant_practice_corpus_items"): {
    select(columns: string): {
      eq(
        column: string,
        value: boolean | string,
      ): PromiseLike<{ data: unknown; error: unknown }>;
    };
    upsert(
      payload: Record<string, unknown>[],
      options: { onConflict: string },
    ): PromiseLike<{ error: unknown }>;
    update(payload: Record<string, unknown>): {
      not(
        column: string,
        operator: "in",
        value: string,
      ): PromiseLike<{ error: unknown }>;
    };
  };
  rpc(
    name: "match_variant_practice_corpus_items",
    params: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

const DEFAULT_QUERY_TIMEOUT_MS = 10_000;
const MIN_QUERY_TIMEOUT_MS = 2_000;
const MAX_QUERY_TIMEOUT_MS = 15_000;

export function createDefaultVariantPracticeCorpusRepository(): VariantPracticeCorpusRepository {
  const config = getSupabaseAdminConfig();
  if (!config.ok) {
    return createDisabledVariantPracticeCorpusRepository();
  }

  const client = createSupabaseAdminClient(
    config.value,
  ) as unknown as SupabaseVariantPracticeCorpusClient;
  return createSupabaseVariantPracticeCorpusRepository(client);
}

export function createSupabaseVariantPracticeCorpusRepository(
  client: SupabaseVariantPracticeCorpusClient,
): VariantPracticeCorpusRepository {
  return {
    is_database_configured: true,
    async listEmbeddingHashes() {
      const { data, error } = await client
        .from("variant_practice_corpus_items")
        .select("id, embedding_hash")
        .eq("is_active", true);

      if (error) {
        throw error;
      }

      if (!Array.isArray(data)) {
        throw new Error("Expected variant practice hash query to return an array.");
      }

      return new Map(data.map(toEmbeddingHashEntry));
    },
    async upsertItems(items) {
      if (items.length === 0) {
        return;
      }

      const now = new Date().toISOString();
      const { error } = await client.from("variant_practice_corpus_items").upsert(
        items.map((item) => ({
          ...item,
          is_active: true,
          updated_at: now,
          last_synced_at: now,
        })),
        { onConflict: "id" },
      );

      if (error) {
        throw error;
      }
    },
    async deactivateMissingItems(activeIds) {
      const value = `(${activeIds.join(",")})`;
      const { error } = await client
        .from("variant_practice_corpus_items")
        .update({ is_active: false })
        .not("id", "in", value);

      if (error) {
        throw error;
      }
    },
    async matchItems(input) {
      const rpcCall = client.rpc("match_variant_practice_corpus_items", {
        p_query_embedding: input.query_embedding,
        p_match_count: input.match_count,
        p_knowledge_points: input.knowledge_points,
        p_target_skills: input.target_skills,
        p_section_title: input.section_title,
      });

      const result = await withTimeout(rpcCall, input.timeout_ms);
      if (!result || result.error) {
        return [];
      }

      if (!Array.isArray(result.data)) {
        return [];
      }

      return result.data.map(toVariantPracticeCorpusDbItem);
    },
  };
}

export function createDisabledVariantPracticeCorpusRepository(): VariantPracticeCorpusRepository {
  return {
    is_database_configured: false,
    async listEmbeddingHashes() {
      return new Map();
    },
    async upsertItems() {},
    async deactivateMissingItems() {},
    async matchItems() {
      return [];
    },
  };
}

export function normalizePgvectorQueryTimeoutMs(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return DEFAULT_QUERY_TIMEOUT_MS;
  }
  return Math.min(Math.max(parsed, MIN_QUERY_TIMEOUT_MS), MAX_QUERY_TIMEOUT_MS);
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function toEmbeddingHashEntry(row: unknown): [string, string] {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    typeof (row as { id?: unknown }).id !== "string" ||
    typeof (row as { embedding_hash?: unknown }).embedding_hash !== "string"
  ) {
    throw new Error("Expected variant practice hash row.");
  }
  return [
    (row as { id: string }).id,
    (row as { embedding_hash: string }).embedding_hash,
  ];
}

function toVariantPracticeCorpusDbItem(row: unknown): VariantPracticeCorpusDbItem {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("Expected variant practice match row.");
  }

  const value = row as VariantPracticeCorpusDbItem;
  if (
    typeof value.id !== "string" ||
    typeof value.source_candidate_id !== "string" ||
    typeof value.question_text !== "string" ||
    typeof value.search_text !== "string" ||
    !Array.isArray(value.knowledge_points) ||
    !Array.isArray(value.target_skills) ||
    !Array.isArray(value.method_tags) ||
    !Array.isArray(value.feature_flags) ||
    value.review_status !== "approved" ||
    typeof value.cosine_distance !== "number" ||
    typeof value.metadata_score !== "number"
  ) {
    throw new Error("Expected valid variant practice match row.");
  }

  return value;
}
```

- [ ] **Step 4: Add test to default suite**

Modify `scripts/run-tests.mjs`:

```js
"scripts/tests/persistence/variant-practice-corpus-persistence.test.mjs",
```

- [ ] **Step 5: Run persistence test**

Run:

```bash
node scripts/tests/persistence/variant-practice-corpus-persistence.test.mjs
```

Expected output:

```text
variant practice corpus persistence tests passed
```

- [ ] **Step 6: Commit Task 4**

```bash
git status --short
git add src/lib/persistence/variant-practice-corpus-persistence.ts \
  scripts/tests/persistence/variant-practice-corpus-persistence.test.mjs \
  scripts/run-tests.mjs
git commit -m "feat: add variant practice pgvector repository"
```

---

### Task 5: Corpus Source And Dynamic Service Fallback

**Files:**
- Create: `src/lib/server/rag/variant-practice-corpus-source.ts`
- Create: `scripts/tests/rag/variant-practice-corpus-source.test.mjs`
- Modify: `src/lib/server/rag/dynamic-variant-practice-service.ts`
- Modify: `scripts/tests/rag/dynamic-variant-practice-service.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Produces `readPgvectorDynamicPracticeCorpus(query, deps)`.
- Produces `readLocalDynamicPracticeCorpus(filePath)`.
- Produces exported `DynamicPracticeCorpus` and `DynamicPracticeCorpusItem` types.
- `handleDynamicVariantPracticeRequest()` keeps current public API but gains optional corpus source deps for tests.

- [ ] **Step 1: Write failing corpus source test**

Create `scripts/tests/rag/variant-practice-corpus-source.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  readLocalDynamicPracticeCorpus,
  readPgvectorDynamicPracticeCorpus,
} = jiti("./src/lib/server/rag/variant-practice-corpus-source.ts");

const query = {
  id: "dynamic-confirmed-image-diagnosis",
  question_text: "讨论导数单调性",
  knowledge_points: ["derivative"],
  section_title: "考点 2 导数与函数的单调性",
  mistake_causes: ["classification_missing"],
  target_skills: ["monotonicity"],
};

const pgvectorRows = [
  {
    id: "practice-1",
    source_candidate_id: "candidate-1",
    question_text: "题干 1",
    search_text: "题干 1 导数 单调",
    knowledge_points: ["derivative"],
    section_title: "考点 2 导数与函数的单调性",
    difficulty: null,
    target_skills: ["monotonicity"],
    method_tags: ["monotonicity_by_derivative"],
    feature_flags: [],
    source_ref: { pdf_page_index: 1 },
    tag_review_meta: { review_status: "approved" },
    review_status: "approved",
    cosine_distance: 0.1,
    metadata_score: 20,
  },
];

{
  const embeddingCalls = [];
  const corpus = await readPgvectorDynamicPracticeCorpus(query, {
    repository: {
      is_database_configured: true,
      async matchItems(input) {
        assert.equal(input.knowledge_points.includes("derivative"), true);
        assert.equal(input.target_skills.includes("monotonicity"), true);
        assert.equal(input.section_title, "考点 2 导数与函数的单调性");
        assert.equal(input.timeout_ms, 10);
        return pgvectorRows;
      },
    },
    embedding_provider: {
      async embedText(input) {
        embeddingCalls.push(input.text);
        return {
          ok: true,
          value: {
            embedding: Array.from({ length: 1536 }, () => 0.01),
            model: "text-embedding-3-small",
            provider_name: "fake",
            dimensions: 1536,
          },
        };
      },
    },
    timeout_ms: 10,
  });

  assert.equal(corpus.corpus_version, "enriched-practice-corpus-v0");
  assert.equal(corpus.items.length, 1);
  assert.equal(corpus.items[0].id, "practice-1");
  assert.equal(corpus.items[0].tag_review_meta.review_status, "approved");
  assert.equal(JSON.stringify(corpus).includes("cosine_distance"), false);
  assert.equal(JSON.stringify(corpus).includes("metadata_score"), false);
  assert.equal(embeddingCalls.length, 1);
  assert.equal(embeddingCalls[0].includes("当前错题："), true);
}

{
  const corpus = await readPgvectorDynamicPracticeCorpus(query, {
    repository: {
      is_database_configured: false,
      async matchItems() {
        throw new Error("should not match when database disabled");
      },
    },
    embedding_provider: {
      async embedText() {
        throw new Error("should not embed when database disabled");
      },
    },
    timeout_ms: 10,
  });
  assert.equal(corpus, null);
}

{
  const corpus = await readPgvectorDynamicPracticeCorpus(query, {
    repository: {
      is_database_configured: true,
      async matchItems() {
        throw new Error("should not match after embedding failure");
      },
    },
    embedding_provider: {
      async embedText() {
        return {
          ok: false,
          error: {
            code: "model_not_configured",
            message: "missing",
            recoverable: true,
            failure_kind: "not_configured",
          },
        };
      },
    },
    timeout_ms: 10,
  });
  assert.equal(corpus, null);
}

const tmpRoot = mkdtempSync(join(tmpdir(), "variant-practice-corpus-source-"));
const corpusPath = join(tmpRoot, "enriched_practice_corpus.json");
writeFileSync(
  corpusPath,
  JSON.stringify({
    corpus_version: "enriched-practice-corpus-v0",
    items: [
      {
        id: "local-1",
        source_candidate_id: "local-candidate-1",
        question_text: "本地题干",
        search_text: "本地题干 导数",
        knowledge_points: ["derivative"],
        section_title: "考点 2 导数与函数的单调性",
        target_skills: ["monotonicity"],
        method_tags: [],
        feature_flags: [],
        source_ref: {},
        tag_review_meta: { review_status: "approved" },
      },
    ],
  }),
);

const localCorpus = await readLocalDynamicPracticeCorpus(corpusPath);
assert.equal(localCorpus.items.length, 1);
assert.equal(localCorpus.items[0].id, "local-1");

const missingLocalCorpus = await readLocalDynamicPracticeCorpus(join(tmpRoot, "missing.json"));
assert.equal(missingLocalCorpus, null);

console.log("variant practice corpus source tests passed");
```

- [ ] **Step 2: Run corpus source test and verify failure**

Run:

```bash
node scripts/tests/rag/variant-practice-corpus-source.test.mjs
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement corpus source module**

Create `src/lib/server/rag/variant-practice-corpus-source.ts`:

```ts
// server-only: this file reads ignored local RAG artifacts and may call Supabase/embedding providers.
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { EmbeddingProvider } from "@/lib/providers/embedding-provider";
import {
  createEmbeddingProvider,
  createEmbeddingProviderConfigFromEnv,
} from "@/lib/providers/embedding-provider";
import {
  createDefaultVariantPracticeCorpusRepository,
  normalizePgvectorQueryTimeoutMs,
  type VariantPracticeCorpusDbItem,
  type VariantPracticeCorpusRepository,
} from "@/lib/persistence/variant-practice-corpus-persistence";
import type { DynamicPracticeQuery } from "@/lib/rag/dynamic-variant-practice-query";
import { buildDynamicPracticeQueryEmbeddingText } from "@/lib/rag/variant-practice-embedding-text";

export interface DynamicPracticeCorpus {
  corpus_version: "enriched-practice-corpus-v0";
  items: DynamicPracticeCorpusItem[];
  item_count?: number;
  [key: string]: unknown;
}

export interface DynamicPracticeCorpusItem {
  id: string;
  source_candidate_id: string;
  question_text: string;
  search_text: string;
  knowledge_points: string[];
  section_title?: string | null;
  target_skills?: string[];
  method_tags?: string[];
  feature_flags?: string[];
  source_ref?: unknown;
  tag_review_meta?: {
    review_status?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface PgvectorCorpusSourceDeps {
  repository?: Pick<VariantPracticeCorpusRepository, "is_database_configured" | "matchItems">;
  embedding_provider?: EmbeddingProvider;
  timeout_ms?: number;
}

const defaultLocalCorpusPath =
  "artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json";

export async function readPgvectorDynamicPracticeCorpus(
  query: DynamicPracticeQuery,
  deps: PgvectorCorpusSourceDeps = {},
): Promise<DynamicPracticeCorpus | null> {
  const repository =
    deps.repository ?? createDefaultVariantPracticeCorpusRepository();
  if (!repository.is_database_configured) {
    return null;
  }

  const embeddingProvider = deps.embedding_provider ?? createDefaultEmbeddingProvider();
  if (!embeddingProvider) {
    return null;
  }

  const embeddingText = buildDynamicPracticeQueryEmbeddingText(query);
  const embeddingResult = await embeddingProvider.embedText({ text: embeddingText });
  if (!embeddingResult.ok) {
    return null;
  }

  let rows: VariantPracticeCorpusDbItem[];
  try {
    rows = await repository.matchItems({
      query_embedding: embeddingResult.value.embedding,
      match_count: 12,
      knowledge_points: query.knowledge_points,
      target_skills: query.target_skills,
      section_title: query.section_title,
      timeout_ms: deps.timeout_ms ?? normalizePgvectorQueryTimeoutMs(process.env.RAG_PGVECTOR_QUERY_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (rows.length === 0) {
    return null;
  }

  return {
    corpus_version: "enriched-practice-corpus-v0",
    item_count: rows.length,
    items: rows.map(toDynamicPracticeCorpusItem),
  };
}

export async function readLocalDynamicPracticeCorpus(
  filePath = defaultLocalCorpusPath,
): Promise<DynamicPracticeCorpus | null> {
  try {
    const absoluteFilePath = isAbsolute(filePath)
      ? filePath
      : join(/* turbopackIgnore: true */ process.cwd(), filePath);
    const rawText = await readFile(absoluteFilePath, "utf8");
    const parsed: unknown = JSON.parse(rawText);
    return isDynamicPracticeCorpus(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function createDefaultEmbeddingProvider(): EmbeddingProvider | null {
  const config = createEmbeddingProviderConfigFromEnv(process.env);
  return config.ok ? createEmbeddingProvider(config.value) : null;
}

function toDynamicPracticeCorpusItem(
  row: VariantPracticeCorpusDbItem,
): DynamicPracticeCorpusItem {
  return {
    id: row.id,
    source_candidate_id: row.source_candidate_id,
    question_text: row.question_text,
    search_text: row.search_text,
    knowledge_points: row.knowledge_points,
    section_title: row.section_title,
    difficulty: row.difficulty,
    target_skills: row.target_skills,
    method_tags: row.method_tags,
    feature_flags: row.feature_flags,
    source_ref: row.source_ref,
    tag_review_meta: row.tag_review_meta,
  };
}

function isDynamicPracticeCorpus(value: unknown): value is DynamicPracticeCorpus {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const corpus = value as { corpus_version?: unknown; items?: unknown };
  return (
    corpus.corpus_version === "enriched-practice-corpus-v0" &&
    Array.isArray(corpus.items) &&
    corpus.items.every(isDynamicPracticeCorpusItem)
  );
}

function isDynamicPracticeCorpusItem(
  value: unknown,
): value is DynamicPracticeCorpusItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const item = value as {
    id?: unknown;
    source_candidate_id?: unknown;
    question_text?: unknown;
    search_text?: unknown;
    knowledge_points?: unknown;
  };

  return (
    typeof item.id === "string" &&
    typeof item.source_candidate_id === "string" &&
    typeof item.question_text === "string" &&
    item.question_text.trim().length > 0 &&
    typeof item.search_text === "string" &&
    item.search_text.trim().length > 0 &&
    Array.isArray(item.knowledge_points) &&
    item.knowledge_points.every((point) => typeof point === "string")
  );
}
```

- [ ] **Step 4: Refactor dynamic service to use corpus source and fallback twice**

Modify `src/lib/server/rag/dynamic-variant-practice-service.ts`:

- Remove local `readDynamicPracticeCorpus`, `DynamicPracticeCorpus`, and `DynamicPracticeCorpusItem` definitions.
- Import these from `variant-practice-corpus-source.ts`:

```ts
import {
  readLocalDynamicPracticeCorpus,
  readPgvectorDynamicPracticeCorpus,
  type DynamicPracticeCorpus,
} from "@/lib/server/rag/variant-practice-corpus-source";
```

- Extend deps:

```ts
export interface DynamicVariantPracticeServiceDeps {
  corpusFilePath?: string;
  agent?: VariantPracticeAgent;
  searchLimit?: number;
  pgvectorCorpusSource?: typeof readPgvectorDynamicPracticeCorpus;
  localCorpusSource?: typeof readLocalDynamicPracticeCorpus;
}
```

- Replace the single corpus path with this flow:

```ts
  const pgvectorCorpusSource =
    deps.pgvectorCorpusSource ?? readPgvectorDynamicPracticeCorpus;
  const localCorpusSource = deps.localCorpusSource ?? readLocalDynamicPracticeCorpus;

  const pgvectorCorpus = await pgvectorCorpusSource(query);
  const pgvectorResult = pgvectorCorpus
    ? await buildVariantPracticeFromCorpus(pgvectorCorpus, query, deps)
    : null;
  if (pgvectorResult) {
    return success(pgvectorResult);
  }

  const localCorpus = await localCorpusSource(deps.corpusFilePath);
  const localResult = localCorpus
    ? await buildVariantPracticeFromCorpus(localCorpus, query, deps)
    : null;

  return success(localResult);
```

- Add helper:

```ts
async function buildVariantPracticeFromCorpus(
  corpus: DynamicPracticeCorpus,
  query: DynamicPracticeQuery,
  deps: DynamicVariantPracticeServiceDeps,
): Promise<ProductVariantPractice | null> {
  const prepared = prepareCorpusAndQuery(corpus, query);
  if (!prepared) {
    return null;
  }

  const agent = deps.agent ?? (await loadDefaultVariantPracticeAgent());
  if (!agent) {
    return null;
  }

  try {
    const artifact = agent.recommendVariantPractice({
      corpus: prepared.corpus,
      query: prepared.query,
      searchLimit: deps.searchLimit ?? 12,
    });
    const viewModel = createVariantPracticeProductViewModel(artifact);
    return viewModel && viewModel.items.length === 3 ? viewModel : null;
  } catch {
    return null;
  }
}
```

- Ensure `success(localResult)` accepts `ProductVariantPractice | null`.

- [ ] **Step 5: Update dynamic service tests for pgvector-first and fallback**

Append to `scripts/tests/rag/dynamic-variant-practice-service.test.mjs`:

```js
{
  let sourceOrder = [];
  const pgvectorOnlyAgent = {
    recommendVariantPractice(input) {
      return buildAgentArtifact(input.query.id, input.corpus.items);
    },
  };
  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    agent: pgvectorOnlyAgent,
    pgvectorCorpusSource: async () => {
      sourceOrder.push("pgvector");
      return buildCorpus();
    },
    localCorpusSource: async () => {
      sourceOrder.push("local");
      return buildCorpus();
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice.items.length, 3);
  assert.deepEqual(sourceOrder, ["pgvector"]);
}

{
  let sourceOrder = [];
  const twoItemAgent = {
    recommendVariantPractice(input) {
      const artifact = buildAgentArtifact(input.query.id, input.corpus.items);
      return input.corpus.items[0].id.startsWith("pgvector")
        ? { ...artifact, recommendations: artifact.recommendations.slice(0, 2) }
        : artifact;
    },
  };
  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    agent: twoItemAgent,
    pgvectorCorpusSource: async () => {
      sourceOrder.push("pgvector");
      return {
        ...buildCorpus(),
        items: buildCorpus().items.map((item) => ({
          ...item,
          id: `pgvector-${item.id}`,
        })),
      };
    },
    localCorpusSource: async () => {
      sourceOrder.push("local");
      return buildCorpus();
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice.items.length, 3);
  assert.deepEqual(sourceOrder, ["pgvector", "local"]);
}
```

- [ ] **Step 6: Add corpus source test to default suite**

Modify `scripts/run-tests.mjs`:

```js
"scripts/tests/rag/variant-practice-corpus-source.test.mjs",
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
node scripts/tests/rag/variant-practice-corpus-source.test.mjs
node scripts/tests/rag/dynamic-variant-practice-service.test.mjs
```

Expected output:

```text
variant practice corpus source tests passed
dynamic variant practice service tests passed
```

- [ ] **Step 8: Commit Task 5**

```bash
git status --short
git add src/lib/server/rag/variant-practice-corpus-source.ts \
  src/lib/server/rag/dynamic-variant-practice-service.ts \
  scripts/tests/rag/variant-practice-corpus-source.test.mjs \
  scripts/tests/rag/dynamic-variant-practice-service.test.mjs \
  scripts/run-tests.mjs
git commit -m "feat: prefer pgvector variant practice corpus source"
```

---

### Task 6: Local pgvector Sync CLI

**Files:**
- Create: `scripts/rag/sync-variant-practice-pgvector-core.mjs`
- Create: `scripts/rag/sync-variant-practice-pgvector.mjs`
- Create: `scripts/tests/rag/sync-variant-practice-pgvector-core.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Produces `selectSyncableVariantPracticeItems(corpus)`.
- Produces `buildVariantPracticePgvectorRow(...)`.
- Produces `planVariantPracticePgvectorSync(...)`.
- CLI uses real Supabase repository and embedding provider only in `--apply` mode.

- [ ] **Step 1: Write failing sync core test**

Create `scripts/tests/rag/sync-variant-practice-pgvector-core.test.mjs`:

```js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  buildVariantPracticePgvectorRow,
  planVariantPracticePgvectorSync,
  selectSyncableVariantPracticeItems,
} from "../../rag/sync-variant-practice-pgvector-core.mjs";

const corpus = {
  corpus_version: "enriched-practice-corpus-v0",
  items: [
    buildItem("approved", "approved", []),
    buildItem("visual", "approved", ["needs_visual"]),
    buildItem("needs-fix", "needs_fix", []),
  ],
};

const syncable = selectSyncableVariantPracticeItems(corpus);
assert.deepEqual(syncable.map((item) => item.id), ["practice-approved"]);

const embeddingText = "题干：\n测试";
const hashInput = "text-embedding-3-small\n1536\n题干：\n测试";
const hash = createHash("sha256").update(hashInput).digest("hex");

const row = buildVariantPracticePgvectorRow({
  item: buildItem("approved", "approved", []),
  embeddingText,
  embeddingHash: hash,
  embeddingModel: "text-embedding-3-small",
  embedding: [0.1, 0.2],
});

assert.equal(row.id, "practice-approved");
assert.equal(row.corpus_version, "enriched-practice-corpus-v0");
assert.equal(row.embedding_text, embeddingText);
assert.equal(row.embedding_hash, hash);
assert.equal(row.embedding_model, "text-embedding-3-small");
assert.equal(row.review_status, "approved");
assert.equal(row.is_active, undefined);
assert.equal("student_id" in row, false);
assert.equal("memory_delta" in row, false);

const embeddingCalls = [];
const upserted = [];
const deactivated = [];
const summary = await planVariantPracticePgvectorSync({
  corpus,
  embeddingModel: "text-embedding-3-small",
  dimensions: 1536,
  existingHashes: new Map([["practice-approved", "old-hash"]]),
  dryRun: false,
  embeddingProvider: {
    async embedText(input) {
      embeddingCalls.push(input.text);
      return {
        ok: true,
        value: {
          embedding: Array.from({ length: 1536 }, () => 0.01),
          model: "text-embedding-3-small",
          provider_name: "fake",
          dimensions: 1536,
        },
      };
    },
  },
  repository: {
    async upsertItems(items) {
      upserted.push(...items);
    },
    async deactivateMissingItems(activeIds) {
      deactivated.push(...activeIds);
    },
  },
});

assert.equal(summary.selected_count, 1);
assert.equal(summary.embedded_count, 1);
assert.equal(summary.skipped_count, 0);
assert.equal(summary.upserted_count, 1);
assert.equal(summary.deactivated_reference_count, 1);
assert.equal(embeddingCalls.length, 1);
assert.equal(upserted.length, 1);
assert.deepEqual(deactivated, ["practice-approved"]);

const dryRunSummary = await planVariantPracticePgvectorSync({
  corpus,
  embeddingModel: "text-embedding-3-small",
  dimensions: 1536,
  existingHashes: new Map(),
  dryRun: true,
  embeddingProvider: {
    async embedText() {
      throw new Error("dry-run must not call embedding provider");
    },
  },
  repository: {
    async upsertItems() {
      throw new Error("dry-run must not upsert");
    },
    async deactivateMissingItems() {
      throw new Error("dry-run must not deactivate");
    },
  },
});

assert.equal(dryRunSummary.selected_count, 1);
assert.equal(dryRunSummary.embedded_count, 0);
assert.equal(dryRunSummary.upserted_count, 0);

console.log("sync variant practice pgvector core tests passed");

function buildItem(id, reviewStatus, featureFlags) {
  return {
    id: `practice-${id}`,
    source_candidate_id: `candidate-${id}`,
    question_text: `${id} 题干`,
    search_text: `${id} 检索文本`,
    knowledge_points: ["derivative"],
    section_title: "考点 2 导数与函数的单调性",
    difficulty: null,
    target_skills: ["monotonicity"],
    method_tags: ["monotonicity_by_derivative"],
    feature_flags: featureFlags,
    source_ref: { pdf_page_index: 1 },
    tag_review_meta: { review_status: reviewStatus },
  };
}
```

- [ ] **Step 2: Run sync core test and verify failure**

Run:

```bash
node scripts/tests/rag/sync-variant-practice-pgvector-core.test.mjs
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement sync core**

Create `scripts/rag/sync-variant-practice-pgvector-core.mjs`:

```js
import { createHash } from "node:crypto";
import { createProjectJiti } from "../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  buildVariantPracticeEmbeddingHashInput,
  buildVariantPracticeItemEmbeddingText,
} = jiti("./src/lib/rag/variant-practice-embedding-text.ts");

export function selectSyncableVariantPracticeItems(corpus) {
  if (
    !corpus ||
    typeof corpus !== "object" ||
    corpus.corpus_version !== "enriched-practice-corpus-v0" ||
    !Array.isArray(corpus.items)
  ) {
    throw new Error("Expected enriched-practice-corpus-v0 corpus.");
  }

  return corpus.items.filter(
    (item) =>
      item?.tag_review_meta?.review_status === "approved" &&
      !asStringArray(item.feature_flags).includes("needs_visual"),
  );
}

export function buildVariantPracticePgvectorRow({
  item,
  embeddingText,
  embeddingHash,
  embeddingModel,
  embedding,
}) {
  return {
    id: item.id,
    corpus_version: "enriched-practice-corpus-v0",
    source_candidate_id: item.source_candidate_id,
    question_text: item.question_text,
    search_text: item.search_text,
    embedding_text: embeddingText,
    embedding_hash: embeddingHash,
    embedding_model: embeddingModel,
    embedding,
    knowledge_points: asStringArray(item.knowledge_points),
    section_title: typeof item.section_title === "string" ? item.section_title : null,
    difficulty: typeof item.difficulty === "string" ? item.difficulty : null,
    target_skills: asStringArray(item.target_skills),
    method_tags: asStringArray(item.method_tags),
    feature_flags: asStringArray(item.feature_flags),
    source_ref: isRecord(item.source_ref) ? item.source_ref : {},
    tag_review_meta: isRecord(item.tag_review_meta) ? item.tag_review_meta : {},
    review_status: "approved",
  };
}

export async function planVariantPracticePgvectorSync({
  corpus,
  embeddingModel,
  dimensions,
  existingHashes,
  dryRun,
  embeddingProvider,
  repository,
}) {
  const selectedItems = selectSyncableVariantPracticeItems(corpus);
  const rows = [];
  let skippedCount = 0;
  let embeddedCount = 0;

  for (const item of selectedItems) {
    const embeddingText = buildVariantPracticeItemEmbeddingText(item);
    const hashInput = buildVariantPracticeEmbeddingHashInput({
      embedding_model: embeddingModel,
      dimensions,
      embedding_text: embeddingText,
    });
    const embeddingHash = createHash("sha256").update(hashInput).digest("hex");

    if (existingHashes.get(item.id) === embeddingHash) {
      skippedCount += 1;
      continue;
    }

    if (dryRun) {
      continue;
    }

    const embeddingResult = await embeddingProvider.embedText({ text: embeddingText });
    if (!embeddingResult.ok) {
      throw new Error(`Embedding failed for ${item.id}: ${embeddingResult.error.code}`);
    }

    embeddedCount += 1;
    rows.push(
      buildVariantPracticePgvectorRow({
        item,
        embeddingText,
        embeddingHash,
        embeddingModel,
        embedding: embeddingResult.value.embedding,
      }),
    );
  }

  const activeIds = selectedItems.map((item) => item.id);
  if (!dryRun) {
    await repository.upsertItems(rows);
    await repository.deactivateMissingItems(activeIds);
  }

  return {
    selected_count: selectedItems.length,
    skipped_count: skippedCount,
    embedded_count: embeddedCount,
    upserted_count: rows.length,
    deactivated_reference_count: activeIds.length,
  };
}

function asStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
```

- [ ] **Step 4: Implement CLI wrapper**

Create `scripts/rag/sync-variant-practice-pgvector.mjs`:

```js
#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createProjectJiti } from "../test-support/project-jiti.mjs";
import { planVariantPracticePgvectorSync } from "./sync-variant-practice-pgvector-core.mjs";

const jiti = createProjectJiti();
const {
  createEmbeddingProvider,
  createEmbeddingProviderConfigFromEnv,
} = jiti("./src/lib/providers/embedding-provider.ts");
const {
  createDefaultVariantPracticeCorpusRepository,
} = jiti("./src/lib/persistence/variant-practice-corpus-persistence.ts");

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply");

if (![0, 1].includes([...args].filter((arg) => arg === "--dry-run" || arg === "--apply").length)) {
  console.error("Usage: node scripts/rag/sync-variant-practice-pgvector.mjs --dry-run|--apply");
  process.exit(1);
}

const corpusPath = "artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json";
const corpus = JSON.parse(await readFile(corpusPath, "utf8"));
const repository = createDefaultVariantPracticeCorpusRepository();

if (!repository.is_database_configured && !dryRun) {
  console.error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

let embeddingProvider = {
  async embedText() {
    throw new Error("dry-run does not embed");
  },
};
let embeddingModel = process.env.RAG_EMBEDDING_PROVIDER_MODEL || "text-embedding-3-small";
let dimensions = 1536;

if (!dryRun) {
  const config = createEmbeddingProviderConfigFromEnv(process.env);
  if (!config.ok) {
    console.error(config.error.message);
    process.exit(1);
  }
  embeddingProvider = createEmbeddingProvider(config.value);
  embeddingModel = config.value.model;
  dimensions = config.value.dimensions;
}

const existingHashes = dryRun
  ? new Map()
  : await repository.listEmbeddingHashes();

const summary = await planVariantPracticePgvectorSync({
  corpus,
  embeddingModel,
  dimensions,
  existingHashes,
  dryRun,
  embeddingProvider,
  repository,
});

console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "apply", ...summary }, null, 2));
```

- [ ] **Step 5: Add test to default suite**

Modify `scripts/run-tests.mjs`:

```js
"scripts/tests/rag/sync-variant-practice-pgvector-core.test.mjs",
```

- [ ] **Step 6: Run focused test and dry-run smoke**

Run:

```bash
node scripts/tests/rag/sync-variant-practice-pgvector-core.test.mjs
node scripts/rag/sync-variant-practice-pgvector.mjs --dry-run
```

Expected:

```text
sync variant practice pgvector core tests passed
```

The dry-run command prints JSON with `mode: "dry-run"` and does not require Supabase or embedding env vars.

- [ ] **Step 7: Commit Task 6**

```bash
git status --short
git add scripts/rag/sync-variant-practice-pgvector-core.mjs \
  scripts/rag/sync-variant-practice-pgvector.mjs \
  scripts/tests/rag/sync-variant-practice-pgvector-core.test.mjs \
  scripts/run-tests.mjs
git commit -m "feat: add variant practice pgvector sync cli"
```

---

### Task 7: Documentation And ADR

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `docs/rag-artifacts.md`
- Modify: `interview/mathtrace-project-narrative.md`
- Create: `docs/adr/2026-06-30-pgvector-variant-practice-retrieval.md`

**Interfaces:**
- Produces updated product, architecture, artifact, and interview narrative docs.
- Produces ADR for the first runtime pgvector retrieval layer.

- [ ] **Step 1: Update PRD**

In `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`, add a P2.9 paragraph after the existing P2.7 paragraph:

```md
P2.9 将 P2.7 的动态变式练习候选召回升级为 pgvector-backed retrieval：本地维护者可通过 CLI 将已审核通过的 `enriched_practice_corpus.json` 导数题同步到 Supabase Postgres + pgvector 表，运行时 `POST /api/variant-practice` 优先用服务端 query embedding 和 `match_variant_practice_corpus_items` RPC 召回候选题，再复用现有 Variant Practice Agent 和 `ProductVariantPractice` 裁剪展示。pgvector 只替换练习候选来源，不改变 `/api/confirm`、不写 `memory_events` / `student_profiles` / 错题本 / localStorage、不决定 `memory_delta` 或画像持久化。Supabase、embedding provider、RPC 或 pgvector 候选不可用时，接口继续回退到 P2.7 本地 JSON corpus；本地 artifact 仍不提交 Git。
```

- [ ] **Step 2: Update technical roadmap**

In `docs/TECHNICAL_ROADMAP.md`, update current state with:

```md
- P2.9 起，动态变式练习检索可以优先使用 Supabase Postgres + pgvector：本地 CLI 将审核通过的增强题库同步到 service-role-only `variant_practice_corpus_items`，运行时 `/api/variant-practice` 用 query embedding 召回候选题；未配置或失败时仍回退 P2.7 本地 JSON corpus。该 pgvector 层只服务练习题候选召回，不是学生画像事实层。
```

- [ ] **Step 3: Update RAG artifact docs**

In `docs/rag-artifacts.md`, add:

```md
- P2.9 的 pgvector 同步源仍是本地 `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`。该 artifact 不提交 Git；`scripts/rag/sync-variant-practice-pgvector.mjs --apply` 只把审核通过、非视觉依赖的题同步到 Supabase `variant_practice_corpus_items`。运行时 pgvector 不可用时，`/api/variant-practice` 仍读取本地 enriched corpus fallback。
```

- [ ] **Step 4: Add interview narrative section**

In `interview/mathtrace-project-narrative.md`, add a P2.9 section before `## 后续可追加的阶段`:

```md
## 23. P2.9 pgvector-backed Variant Practice Retrieval（pgvector 变式练习检索）

### 当前状态

已完成实现、审查和本地验证。这个阶段把 P2.7 的本地 JSON 动态推荐升级为优先 pgvector 检索：审核通过的导数题库通过本地 CLI 同步到 Supabase Postgres + pgvector，运行时 `/api/variant-practice` 先用 query embedding 召回候选题，失败时回退本地 enriched corpus。

### 功能价值

P2.7 已经证明上传题诊断后可以动态推荐真实教辅题。P2.9 解决的是运行时题库形态：从本地 ignored JSON 文件推进到可在线查询的数据库候选源，为后续更多题量、多专题和质量评估打基础。

### 关键设计

pgvector 只替换候选召回来源。推荐仍由 Variant Practice Agent 编排，前端仍只消费 `ProductVariantPractice`。RAG 不写 `memory_events`、不改 `student_profiles`、不写错题本，也不进入 `/api/confirm` 主链路。

### 技术决策与取舍

我选择 pgvector 候选源加本地 JSON fallback，而不是 pgvector-only。原因是演示稳定性仍是第一优先级：Supabase 未配置、migration 未应用、embedding provider 超时或 RPC 失败时，学生仍能看到诊断报告和已有练习题。

### 性能收益（如适用）

相比每次读取整个本地 corpus 后做文本/metadata 搜索，pgvector 可以把候选召回交给数据库索引。第一版 corpus 只有 64 道 approved 题，性能收益不是主要目的；主要收益是把 RAG 从本地 artifact 过渡到可在线扩展的数据层。

### 面试官可能怎么问

1. 为什么先用 pgvector，而不是 Milvus？
2. 为什么保留本地 JSON fallback？
3. embedding provider 会不会污染学生画像？
4. pgvector 检索和 `memory_events` / `student_profiles` 的关系是什么？
5. 为什么不把 RAG 合进 `/api/confirm`？
6. 如果 embedding provider 超时怎么办？

### 推荐回答

我会这样回答：

P2.9 里的 pgvector 是题源检索层，不是学生记忆层。学生画像仍然来自确认后的 `memory_events`，再投影成 `student_profiles`。pgvector 只回答“题库里哪些练习题适合当前诊断目标”，并且结果还会经过现有 Agent 和 product view model 裁剪。

我没有做 pgvector-only，是因为 MathTrace 当前仍是 demo-first。数据库或 embedding provider 不可用时，系统应该回到 P2.7 已验证的本地 corpus，而不是让练习区空掉。这样可以证明线上检索方向，同时不牺牲演示稳定性。

### 可能被继续追问

- 多专题 corpus 接入后，embedding 表是否要拆分？
- 如何评估 pgvector 召回质量？
- 什么时候从 pgvector 迁移到 Milvus？
- 是否需要缓存 query embedding？

### 反思与后续优化

第一版固定 1536 维 embedding 和导数专题，避免过早做多模型/多维度兼容。后续题量扩大后，再评估 embedding model、召回质量指标、缓存和 Milvus。

### 项目中的真实证据

- 代码：
  - `supabase/migrations/20260630000000_p29_pgvector_variant_practice.sql`
  - `src/lib/providers/embedding-provider.ts`
  - `src/lib/persistence/variant-practice-corpus-persistence.ts`
  - `src/lib/server/rag/variant-practice-corpus-source.ts`
  - `scripts/rag/sync-variant-practice-pgvector.mjs`
- 测试：
  - `scripts/tests/persistence/variant-practice-pgvector-migration.test.mjs`
  - `scripts/tests/rag/variant-practice-embedding-text.test.mjs`
  - `scripts/tests/providers/embedding-provider.test.mjs`
  - `scripts/tests/persistence/variant-practice-corpus-persistence.test.mjs`
  - `scripts/tests/rag/variant-practice-corpus-source.test.mjs`
  - `scripts/tests/rag/sync-variant-practice-pgvector-core.test.mjs`
- 文档：
  - `docs/superpowers/specs/2026-06-30-p29-pgvector-variant-practice-retrieval-design.md`
  - `docs/superpowers/plans/2026-06-30-p29-pgvector-variant-practice-retrieval.md`
  - `docs/adr/2026-06-30-pgvector-variant-practice-retrieval.md`
- 验证：
  - `node scripts/run-tests.mjs default`
  - `npm run test:smoke`
  - `npm run lint`
  - `npm run build`
  - `git diff --check`
```

- [ ] **Step 5: Add ADR**

Create `docs/adr/2026-06-30-pgvector-variant-practice-retrieval.md`:

```md
# ADR: pgvector-backed Variant Practice Retrieval

## 状态

P2.9 实现阶段采纳。

## 背景

P2.7 已经让确认后的上传题诊断通过 `/api/variant-practice` 从本地 enriched corpus 返回真实题库中的 3 道变式练习。该路径仍依赖 ignored JSON artifact。P2.9 需要把运行时候选召回推进到服务端 PostgreSQL + pgvector，同时保持 MathTrace 的演示稳定性和画像事实层边界。

## 决策

采用“pgvector 候选源 + 本地 JSON fallback”：

- 本地 CLI 将审核通过的 `enriched-practice-corpus-v0` 导数题同步到 `variant_practice_corpus_items`。
- 运行时 `/api/variant-practice` 优先用 query embedding 和 pgvector RPC 召回候选题。
- 召回候选仍交给现有 Variant Practice Agent 和 `ProductVariantPractice` mapper。
- pgvector 不可用、embedding provider 失败、RPC 超时或候选不足时，回退到 P2.7 本地 JSON corpus。

## 备选方案

### pgvector-only

不采用。它会让 Supabase、migration、embedding provider 或 RPC 失败直接破坏动态练习推荐，不符合当前 demo 稳定优先。

### Milvus

不采用。当前 corpus 很小，Supabase/Postgres 已经存在，pgvector 可以在同一个数据库体系中验证产品价值；Milvus 留到大规模多机构 RAG 阶段。

### RAG 写入学生画像

不采用。RAG 是题源检索层，不是学生事实层。学生画像继续由确认后的 `memory_events` 投影成 `student_profiles`。

## 影响

收益：

- 动态练习候选召回从本地文件推进到在线数据库检索。
- 继续保留已验证的本地 fallback，演示稳定。
- 复用现有 API、Agent 和产品展示模型，避免重写前端。

代价：

- 运行时 pgvector 路径需要一次 query embedding 调用。
- 需要维护本地同步 CLI 和 embedding provider 配置。
- 第一版固定 1536 维 embedding，未来更换模型需要 migration/spec 评估。

## 实现约束

- `variant_practice_corpus_items` 不存学生数据。
- Runtime RAG 不写 `memory_events`、`student_profiles`、错题本、诊断运行或 localStorage。
- `SUPABASE_SERVICE_ROLE_KEY` 和 `RAG_EMBEDDING_PROVIDER_API_KEY` 只在服务端读取。
- 正式响应不返回 cosine distance、metadata score、embedding hash、source ref 或内部 item id。
```

- [ ] **Step 6: Verify docs**

Run:

```bash
rg -n "P2.9|pgvector|variant_practice_corpus_items|memory_events|student_profiles" \
  docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md \
  docs/TECHNICAL_ROADMAP.md \
  docs/rag-artifacts.md \
  interview/mathtrace-project-narrative.md \
  docs/adr/2026-06-30-pgvector-variant-practice-retrieval.md
```

Expected:

- P2.9 appears in PRD, roadmap, RAG artifact docs, interview narrative, and ADR.
- Added text states pgvector/RAG does not write `memory_events` or `student_profiles`.

- [ ] **Step 7: Commit Task 7**

```bash
git status --short
git add docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md \
  docs/TECHNICAL_ROADMAP.md \
  docs/rag-artifacts.md \
  interview/mathtrace-project-narrative.md \
  docs/adr/2026-06-30-pgvector-variant-practice-retrieval.md
git commit -m "docs: document pgvector variant practice retrieval"
```

---

### Task 8: Final Verification, Review, And Delivery Checkpoint

**Files:**
- Review only: all implementation files from Tasks 1-7.
- Do not stage: `docs/reviews/*.md`.

**Interfaces:**
- Produces verified local branch ready for user review and eventual integration.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node scripts/tests/persistence/variant-practice-pgvector-migration.test.mjs
node scripts/tests/rag/variant-practice-embedding-text.test.mjs
node scripts/tests/providers/embedding-provider.test.mjs
node scripts/tests/persistence/variant-practice-corpus-persistence.test.mjs
node scripts/tests/rag/variant-practice-corpus-source.test.mjs
node scripts/tests/rag/sync-variant-practice-pgvector-core.test.mjs
node scripts/tests/rag/dynamic-variant-practice-service.test.mjs
```

Expected: each test prints its `... tests passed` line.

- [ ] **Step 2: Run default, smoke, lint, build, and diff checks**

Run:

```bash
node scripts/run-tests.mjs default
npm run test:smoke
npm run lint
npm run build
git diff --check
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
```

Expected:

- Default suite passes.
- Smoke suite passes.
- Lint passes.
- Build passes.
- `git diff --check` has no output.
- `git ls-files artifacts .env.local docs/reviews .superpowers/sdd` has no output.

- [ ] **Step 3: Optional real Supabase / embedding smoke**

Only run when local `.env.local` has real `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `RAG_EMBEDDING_PROVIDER_*` values. Do not print env values.

Run:

```bash
node --env-file=.env.local scripts/rag/sync-variant-practice-pgvector.mjs --dry-run
node --env-file=.env.local scripts/rag/sync-variant-practice-pgvector.mjs --apply
```

Expected:

- Dry-run prints summary and does not write.
- Apply prints summary with selected/upserted/skipped counts.
- No API key, service role key, full embedding vector, or full provider response appears in stdout.

If env vars are not configured, record in final notes:

```text
未运行真实 Supabase / embedding smoke：本地未配置相关 env。
```

- [ ] **Step 4: Request Claude Code review**

Use this prompt:

```text
请按 AGENTS.md / CLAUDE.md 的审查规则，对当前 P2.9 pgvector-backed Variant Practice Retrieval 实现做只读审查，不要修改代码。

审查范围：
- base: 90cfec9 或本分支进入实现前的 plan/spec 最新 commit
- head: 当前 HEAD

重点检查：
1. pgvector migration 是否能在 Supabase 中 apply：extensions schema、RLS、service_role grants、RPC search_path、HNSW/GIN indexes。
2. /api/variant-practice 是否保持只读，不写 memory_events、student_profiles、diagnosis_runs、mistake_book_items 或 localStorage。
3. pgvector 失败、embedding provider 失败、RPC 超时、候选不足时是否回退 P2.7 本地 JSON。
4. embedding provider 是否独立使用 RAG_EMBEDDING_PROVIDER_*，不复用 VISION_PROVIDER_* / ANALYSIS_PROVIDER_*。
5. 前端是否仍不直连 Supabase、不读取 artifacts、不接触 service role key。
6. 正式响应是否不包含 cosine_distance、metadata_score、embedding_hash、item_id、source_candidate_id、source_ref 或 provider 原始响应。
7. sync CLI 是否 dry-run 默认无写入，--apply 才调用 embedding provider 和 Supabase。
8. 测试是否覆盖 migration、embedding text、provider、repository、corpus source、fallback、sync CLI 和文档收口。

必须列出测试缺口，即使没有阻塞问题。
输出中文审查报告；没有 PR，请写入 docs/reviews/2026-06-30-p29-pgvector-variant-practice-implementation-review.md。
```

- [ ] **Step 5: Fix valid review findings**

For each valid finding:

1. Modify only the relevant files.
2. Run the smallest focused test that proves the fix.
3. Re-run the full verification commands from Step 2.
4. Do not stage `docs/reviews/*.md` unless the user explicitly asks.

- [ ] **Step 6: Final status and local commit**

Before final commit, show status:

```bash
git status --short
```

Stage only implementation and committed docs:

```bash
git add supabase/migrations/20260630000000_p29_pgvector_variant_practice.sql \
  src/lib/rag/variant-practice-embedding-text.ts \
  src/lib/providers/embedding-provider.ts \
  src/lib/persistence/variant-practice-corpus-persistence.ts \
  src/lib/server/rag/variant-practice-corpus-source.ts \
  src/lib/server/rag/dynamic-variant-practice-service.ts \
  scripts/rag/sync-variant-practice-pgvector-core.mjs \
  scripts/rag/sync-variant-practice-pgvector.mjs \
  scripts/tests/persistence/variant-practice-pgvector-migration.test.mjs \
  scripts/tests/rag/variant-practice-embedding-text.test.mjs \
  scripts/tests/providers/embedding-provider.test.mjs \
  scripts/tests/persistence/variant-practice-corpus-persistence.test.mjs \
  scripts/tests/rag/variant-practice-corpus-source.test.mjs \
  scripts/tests/rag/sync-variant-practice-pgvector-core.test.mjs \
  scripts/tests/rag/dynamic-variant-practice-service.test.mjs \
  scripts/run-tests.mjs \
  docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md \
  docs/TECHNICAL_ROADMAP.md \
  docs/rag-artifacts.md \
  interview/mathtrace-project-narrative.md \
  docs/adr/2026-06-30-pgvector-variant-practice-retrieval.md
git commit -m "feat: add pgvector variant practice retrieval"
```

Do not commit:

```text
artifacts/**
.env*
docs/reviews/*.md
.superpowers/sdd/**
```

---

## Plan Self-Review

- Spec coverage: covered migration/RPC, embedding provider, embedding text/hash boundary, sync CLI, pgvector repository, runtime source fallback, dynamic service integration, docs/ADR, verification, and review.
- Scope check: plan does not add login, real users, teacher UI, RLS user policies, LLM rerank, dynamic question generation, practice grading, or RAG writes to memory/profile facts.
- Type consistency: `DynamicPracticeQuery`, `ProductVariantPractice`, `VariantPracticeCorpusDbItem`, `VariantPracticeCorpusUpsertInput`, `EmbeddingProviderResult`, and `VariantPracticeCorpusRepository` names are consistent across tasks.
- Placeholder scan: no `TODO`, `TBD`, or unresolved placeholder sections are intentionally left in this plan.
