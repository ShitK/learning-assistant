# P2.9 pgvector-backed Variant Practice Retrieval Design Spec

## 1. 背景

当前 `main` 已完成 P2.7 Dynamic Variant Practice：

```text
确认后的上传题诊断
-> POST /api/variant-practice
-> 服务端读取 artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json
-> 调用 Variant Practice Agent
-> 返回裁剪后的 ProductVariantPractice
-> 前端展示 3 道变式练习；失败时保留 diagnosis.practice_questions fallback
```

这个闭环已经证明“上传题诊断后可以从真实教辅题库里找变式练习”，但运行时检索仍依赖本地 ignored JSON artifact。P2.9 要把这一步升级为服务端 PostgreSQL + pgvector 检索 MVP，同时保留 P2.7 的本地 JSON fallback。

当前增强题库实际状态：

- 本地源文件：`artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`。
- `corpus_version`：`enriched-practice-corpus-v0`。
- 总题数：69。
- `tag_review_meta.review_status === "approved"` 题数：64。
- 当前只覆盖导数专题，`knowledge_points` 为 `["derivative"]`。
- 关键字段：`question_text`、`search_text`、`section_title`、`target_skills`、`method_tags`、`feature_flags`、`source_ref`、`tag_review_meta`。

P2.9 不是要把 RAG 变成画像事实层。它只把“练习题候选召回来源”从本地 JSON 优先升级为 pgvector，后续仍复用 P2.7 的只读 API、受控 query 映射、Agent 编排和产品展示模型。

## 2. 目标

P2.9 的目标是：

```text
本地 reviewed/enriched corpus
-> 本地 CLI 生成 embedding 并同步 approved 题到 Supabase Postgres + pgvector
-> POST /api/variant-practice 优先用 pgvector 召回候选题
-> 继续复用 Variant Practice Agent 选择 3 道练习
-> 返回 ProductVariantPractice
-> pgvector 不可用时自动回退到 P2.7 本地 JSON corpus
```

验收口径：

- `POST /api/variant-practice` 的外部响应契约不变：仍返回 `{ variant_practice: ProductVariantPractice | null }`。
- 运行时优先尝试服务端 pgvector 检索；数据库、embedding provider、RPC、表数据或检索结果不可用时，稳定回退到 P2.7 本地 JSON corpus。
- 本地 JSON fallback 仍读取 `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`，且 `artifacts/**` 不提交 Git。
- RAG 仍只返回练习展示模型，不写 `memory_events`、`student_profiles`、`diagnosis_runs`、`mistake_book_items` 或 localStorage。
- 前端不直连 Supabase，不读取本地文件，不接触 service role key 或 embedding provider key。
- `sample_diagnosis` 稳定路径不变：默认样例题仍可使用 P2.5 静态推荐 artifact；缺失时仍回到预写练习题。

## 3. 明确假设

- 当前仍固定 `demo_student_001`，不做登录、真实多用户、老师端、面向用户的 RLS 策略或真实权限隔离。
- 第一版只同步导数专题 `enriched-practice-corpus-v0` 中审核通过的题。
- 第一版只支持 OpenAI-compatible embeddings protocol，独立使用 `RAG_EMBEDDING_PROVIDER_*` 环境变量，不复用 `VISION_PROVIDER_*` 或 `ANALYSIS_PROVIDER_*`。
- 第一版固定 embedding 维度为 `1536`，对应 migration 中的 `vector(1536)`。如果实现前选用的本地 embedding provider 不是 1536 维，必须先更新本 spec 和 migration 计划，不在同一实现里做多维动态兼容。
- pgvector 检索是候选召回层；最终教学顺序和三卡片类型仍由现有 Variant Practice Agent 和 `ProductVariantPractice` mapper 收口。
- 本地 JSON fallback 是正式降级路径，不是临时调试开关。

## 4. 非目标

P2.9 不做：

- 不做登录、真实多用户、老师端、家长端、RLS 用户策略或多租户隔离。
- 不把 RAG 推荐写入 `memory_events`、`student_profiles`、错题本、诊断运行或 localStorage。
- 不改变 `/api/confirm` 的证据等级、`memory_delta`、画像写入或持久化策略。
- 不让 embedding provider、LLM rerank 或模型输出决定学生画像。
- 不让模型生成新题，不做 LLM rerank、reason polish 或动态出题。
- 不让前端读取 Supabase、service role key、embedding key、本地 corpus 文件或 `artifacts/**`。
- 不提交 `artifacts/**`、`.env*`、真实 corpus artifact、推荐结果或 `docs/reviews/*.md`。
- 不把 pgvector 用作学生画像、聊天记忆或错题本事实源。
- 不在 P2.9 扩展非导数专题、多学科题库、PDF 在线 ingestion、图片存储或练习作答判分。

## 5. 方案比较

### 方案 A：pgvector 候选源 + 本地 JSON fallback（推荐）

新增数据库表和同步 CLI，把 approved enriched corpus rows 及其 embedding 写入 Supabase。`POST /api/variant-practice` 收到请求后，先尝试用 query embedding 调用 pgvector RPC 召回候选题；召回结果被转换成现有 `DynamicPracticeCorpus` 形状，再交给现有 Variant Practice Agent。任何 pgvector 路径失败或最终 product items 不足 3 道，都回到 P2.7 本地 JSON fallback。

优点：

- 保持 P2.7 API 和前端展示契约稳定。
- pgvector 只替换候选召回来源，不扩大确认链路和画像链路。
- 数据库不可用、embedding key 未配置或 Supabase migration 未应用时，demo 仍可跑。
- 复用现有 Agent 和 product view model，避免一次性重写 RAG 排序、UI 和测试。

代价：

- 一次动态推荐可能多一次 embedding provider 调用。
- pgvector 返回候选后仍要经过现有 metadata/text scoring，第一版不是纯向量排序。
- 需要本地同步 CLI 和 migration，交付前必须做真实 Supabase smoke。

### 方案 B：pgvector-only 替换 P2.7 本地 corpus

运行时完全移除本地 JSON fallback，只从 PostgreSQL 检索。

优点：

- 运行时路径更单一。
- 更容易证明线上检索完全来自数据库。

代价：

- Supabase 未配置、migration 未应用、embedding provider 缺失或 RPC 失败都会破坏动态练习推荐。
- 不符合当前 demo 稳定优先原则。
- 会让 P2.7 已验证的本地题库 fallback 失效。

结论：不采用。

### 方案 C：只做离线 pgvector 原型，不接 `/api/variant-practice`

新增脚本把 corpus 写入 pgvector，然后只用 CLI 验证相似搜索质量，不接产品 API。

优点：

- 风险最低。
- 可以先观察向量召回是否比本地 metadata search 更好。

代价：

- 产品页仍然不是 pgvector-backed retrieval。
- 无法验证运行时 fallback、API 边界和演示路径。

结论：可作为实现过程中的中间验证，但不作为 P2.9 交付终点。

## 6. 推荐架构

推荐采用方案 A。

```text
Local enriched corpus artifact
  -> scripts/rag/sync-variant-practice-pgvector.mjs
    -> build embedding_text from approved items
    -> call RAG_EMBEDDING_PROVIDER_* server-side
    -> upsert variant_practice_corpus_items via service role

Confirmed image diagnosis
  -> POST /api/variant-practice
    -> parse request
    -> derive DynamicPracticeQuery
    -> try pgvector candidate source
      -> embed query
      -> call match_variant_practice_corpus_items RPC
      -> convert rows to DynamicPracticeCorpus
      -> recommendVariantPractice(...)
      -> createVariantPracticeProductViewModel(...)
    -> if pgvector path fails or returns non-3 product items:
      -> read local enriched_practice_corpus.json fallback
      -> existing P2.7 Agent path
  -> ProductVariantPractice | null
```

### 6.1 继续保持 API Route 很薄

现有文件：

```text
src/app/api/variant-practice/route.ts
```

职责不变：

- 只处理 `POST`。
- 解析 JSON；非法 JSON 返回 400。
- 调用 server service。
- 返回 `DynamicVariantPracticeApiResponse`。

P2.9 不在 route 里写数据库检索、embedding 调用或 fallback 逻辑。

### 6.2 服务层新增候选源边界

现有核心文件：

```text
src/lib/server/rag/dynamic-variant-practice-service.ts
```

P2.9 建议新增一个 server-only 候选源模块：

```text
src/lib/server/rag/variant-practice-corpus-source.ts
```

职责：

- 输入 `DynamicPracticeQuery`。
- 优先尝试 pgvector repository。
- 成功时返回 `DynamicPracticeCorpus` 兼容对象。
- 失败、未配置、无候选、schema 不合法时返回 `null`。
- 不抛出可预期错误，不向浏览器暴露失败细节。

`dynamic-variant-practice-service.ts` 只做编排：

```text
query
-> readPgvectorCorpus(query) ?? readLocalCorpus()
-> prepareCorpusAndQuery(...)
-> recommendVariantPractice(...)
-> createVariantPracticeProductViewModel(...)
```

如果 pgvector corpus 经过 Agent 和 product mapper 后不是恰好 3 道，服务层应再尝试本地 JSON fallback。只有 pgvector 和本地 fallback 都不能生成 3 道时，才返回 `{ variant_practice: null }`。

### 6.3 数据库访问放在 persistence 边界

新增：

```text
src/lib/persistence/variant-practice-corpus-persistence.ts
```

职责：

- 使用 `src/lib/persistence/supabase-admin.ts` 获取 service-role Supabase client。
- 封装 `variant_practice_corpus_items` upsert、deactivate missing rows、match RPC 调用。
- 未配置 Supabase 时返回 disabled repository。
- 不依赖 React、Client Component、localStorage、provider prompt 或 diagnosis pipeline。

这个文件可以同时服务同步 CLI 和运行时查询，但必须把“写入 corpus 表”和“运行时只读 match”分成明确的方法，避免 `/api/variant-practice` 意外执行同步写入。

### 6.4 Embedding provider 独立于 vision/text provider

新增：

```text
src/lib/providers/embedding-provider.ts
```

第一版只支持 OpenAI-compatible `/embeddings`：

```text
RAG_EMBEDDING_PROVIDER_PROTOCOL=openai
RAG_EMBEDDING_PROVIDER_BASE_URL=https://api.openai.com/v1
RAG_EMBEDDING_PROVIDER_MODEL=text-embedding-3-small
RAG_EMBEDDING_PROVIDER_API_KEY=<local-secret>
RAG_EMBEDDING_PROVIDER_NAME=rag_embedding_provider
RAG_EMBEDDING_PROVIDER_TIMEOUT_MS=30000
RAG_EMBEDDING_DIMENSIONS=1536
```

约束：

- API key 只在服务端 CLI 或 server service 读取。
- 不复用 `VISION_PROVIDER_API_KEY`，避免图片抽取配置影响 RAG 检索。
- 不复用 `ANALYSIS_PROVIDER_API_KEY`，避免确认后文本增强配置影响 RAG 检索。
- 未配置、超时、HTTP 失败、非法 JSON、维度不等于 1536 时，运行时 pgvector 路径降级到本地 JSON fallback。
- 同步 CLI 在 embedding 失败时应失败退出，不写半成品向量行。

## 7. 数据模型

新增 migration：

```text
supabase/migrations/20260630000000_p29_pgvector_variant_practice.sql
```

建议表：

```sql
create extension if not exists vector;

create table if not exists public.variant_practice_corpus_items (
  id text primary key,
  corpus_version text not null,
  source_candidate_id text not null,
  question_text text not null,
  search_text text not null,
  embedding_text text not null,
  embedding_hash text not null,
  embedding_model text not null,
  embedding vector(1536) not null,
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
  on public.variant_practice_corpus_items using hnsw (embedding vector_cosine_ops);

alter table public.variant_practice_corpus_items enable row level security;

grant select, insert, update on public.variant_practice_corpus_items to service_role;
```

不授予 `anon` 或 `authenticated` 权限。P2.9 仍然只允许服务端 service role 访问。

### 7.1 为什么先用单表

不拆 `practice_corpus_items` 和 `practice_corpus_embeddings` 两张表。当前 corpus 只有 64 条 approved 导数题，embedding 与题目文本生命周期一致。单表能减少同步逻辑和 join 复杂度。后续多专题、多模型 embedding 或 A/B 召回评估再拆表。

### 7.2 为什么加 `is_active`

本地 corpus 可能因为人工审核调整而删除或降级某些题。同步 CLI 不直接删除历史行，而是把当前 corpus 中不存在的行标记为 `is_active=false`。运行时 RPC 只召回 active rows。

### 7.3 不存学生数据

`variant_practice_corpus_items` 只保存教辅题库内容和检索元数据。它不包含：

- `student_id`
- 学生答案
- 学生画像
- `memory_delta`
- `memory_events`
- 图片 base64
- provider 原始响应

## 8. RPC 设计

新增只读 match RPC：

```sql
create or replace function public.match_variant_practice_corpus_items(
  p_query_embedding vector(1536),
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
  vector_distance double precision,
  metadata_score integer
)
language sql
security definer
set search_path = public
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
    item.embedding <=> p_query_embedding as vector_distance,
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
  vector(1536),
  integer,
  text[],
  text[],
  text
) from public;

grant execute on function public.match_variant_practice_corpus_items(
  vector(1536),
  integer,
  text[],
  text[],
  text
) to service_role;
```

说明：

- RPC 只读，不写任何表。
- `p_match_count` 被限制在 1 到 24，避免一次请求拉过多题目。
- 先用 `knowledge_points` 做硬过滤，避免非导数 query 误召回导数 corpus。
- section/title/skills 只参与排序，不作为硬过滤，保留向量召回的迁移空间。
- 返回的 `vector_distance` / `metadata_score` 只给服务端内部调试和测试使用，不进入 `ProductVariantPractice`。

## 9. Embedding 文本策略

新增纯函数：

```text
src/lib/rag/variant-practice-embedding-text.ts
```

职责：

- 从 corpus item 构造 `embedding_text`。
- 从 `DynamicPracticeQuery` 构造 query embedding text。
- 计算 `embedding_hash`，用于同步 CLI 跳过未变化题。
- 纯函数、browser-safe、无 DB、无 provider、无 `fs`。

### 9.1 Corpus item embedding text

格式固定为：

```text
题干：
{question_text}

检索文本：
{search_text}

知识点：
{knowledge_points.join("、")}

章节：
{section_title ?? ""}

目标能力：
{target_skills.join("、")}

方法标签：
{method_tags.join("、")}
```

不包含 `source_ref`、`review_meta`、`tag_review_meta`、PDF 路径或审核人信息。

### 9.2 Query embedding text

格式固定为：

```text
当前错题：
{query.question_text}

知识点：
{query.knowledge_points.join("、")}

章节：
{query.section_title ?? ""}

错因：
{query.mistake_causes.join("、")}

练习目标：
{query.target_skills.join("、")}
```

`query.question_text` 继续使用 P2.7 已有的 800 Unicode 字符截断结果。

### 9.3 Hash

`embedding_hash` 使用：

```text
sha256(`${embedding_model}\n1536\n${embedding_text}`)
```

只要 embedding model、维度或文本变化，CLI 就重新生成 embedding 并 upsert。

## 10. 本地同步 CLI

新增：

```text
scripts/rag/sync-variant-practice-pgvector.mjs
```

职责：

- 读取 `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`。
- 校验 `corpus_version === "enriched-practice-corpus-v0"`。
- 只同步 `tag_review_meta.review_status === "approved"` 且不含 `needs_visual` 的题。
- 为每道题构造 `embedding_text` 和 `embedding_hash`。
- 对 hash 未变化的题跳过 embedding provider 调用。
- 对新增或变化题调用 embedding provider。
- 使用 service role upsert 到 `variant_practice_corpus_items`。
- 将本次 corpus 中不存在的旧行标记为 `is_active=false`。
- 输出同步摘要，不打印完整题干、embedding 数组、API key 或 provider 原始响应。

建议 CLI 参数：

```text
node scripts/rag/sync-variant-practice-pgvector.mjs --dry-run
node scripts/rag/sync-variant-practice-pgvector.mjs --apply
```

`--dry-run` 默认只输出将要新增、更新、跳过、停用的数量，不调用 embedding provider，不写数据库。

`--apply` 才允许调用 embedding provider 和 Supabase 写入。未配置 Supabase 或 embedding provider 时失败退出。

## 11. 运行时 fallback 策略

`POST /api/variant-practice` 的降级矩阵：

| 场景 | 服务端行为 | 浏览器可见结果 |
|---|---|---|
| 请求不是合法 JSON | 400 `invalid_json` | 保持原练习题 |
| 请求体不符合 P2.7 contract | 400 `invalid_request` | 保持原练习题 |
| 证据等级不足或非导数题 | 200 `{ variant_practice: null }` | 保持原练习题 |
| Supabase 未配置 | 使用本地 JSON fallback | 成功则显示 RAG 3 题，否则保持原练习题 |
| pgvector table / RPC 未应用 | 使用本地 JSON fallback | 同上 |
| embedding provider 未配置 | 使用本地 JSON fallback | 同上 |
| embedding provider 超时或失败 | 使用本地 JSON fallback | 同上 |
| pgvector 返回 0 个候选 | 使用本地 JSON fallback | 同上 |
| pgvector 候选经 Agent 后不足 3 道 | 使用本地 JSON fallback | 同上 |
| 本地 JSON artifact 缺失或坏 JSON | 200 `{ variant_practice: null }` | 保持原练习题 |
| pgvector 或本地路径生成 3 道 product items | 200 `{ variant_practice }` | 展示 3 道练习 |

服务端可以在测试注入的 debug hook 中区分 `pgvector` / `local_json` 来源，但正式响应不返回 retrieval source、vector distance、metadata score、item id 或 source ref。

## 12. 模块和文件边界

### 新增文件

```text
supabase/migrations/20260630000000_p29_pgvector_variant_practice.sql
src/lib/providers/embedding-provider.ts
src/lib/rag/variant-practice-embedding-text.ts
src/lib/persistence/variant-practice-corpus-persistence.ts
src/lib/server/rag/variant-practice-corpus-source.ts
scripts/rag/sync-variant-practice-pgvector.mjs
scripts/tests/rag/variant-practice-embedding-text.test.mjs
scripts/tests/providers/embedding-provider.test.mjs
scripts/tests/persistence/variant-practice-corpus-persistence.test.mjs
scripts/tests/rag/variant-practice-corpus-source.test.mjs
```

### 修改文件

```text
src/lib/server/rag/dynamic-variant-practice-service.ts
scripts/run-tests.mjs
docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md
docs/TECHNICAL_ROADMAP.md
docs/rag-artifacts.md
interview/mathtrace-project-narrative.md
```

如果实现中发现 pgvector 作为首个向量检索层需要长期解释，应新增 ADR：

```text
docs/adr/2026-06-30-pgvector-variant-practice-retrieval.md
```

ADR 应说明为什么 P2.9 选择“pgvector 候选源 + 本地 JSON fallback”，而不是 pgvector-only、Milvus 或把 RAG 合进画像事实层。

### 明确不修改

```text
src/app/api/confirm/**
src/lib/diagnosis/**
src/lib/persistence/student-profile-persistence.ts
src/lib/persistence/diagnosis-persistence.ts
src/lib/shared/student-profile.ts
src/components/workbench/practice-lab.tsx
src/lib/rag/variant-practice-product-view-model.ts
artifacts/**
docs/reviews/*.md
```

除非实现时发现现有 tests 必须小范围适配，否则 P2.9 不应改前端展示组件。`ProductVariantPractice` 已经是足够的展示边界。

## 13. 数据流边界

### 13.1 RAG 只读边界

P2.9 的运行时 RAG 仍是只读服务：

- 输入：确认后的上传题诊断摘要。
- 中间：query embedding + pgvector 候选召回。
- 输出：学生可读的 3 道练习卡片。
- 副作用：无。

它不能：

- 改写诊断报告。
- 改写 `practice_questions` 原始响应。
- 写 `memory_events`。
- 写 `student_profiles`。
- 写错题本。
- 决定 `memory_delta.should_persist`。
- 改变错题去重或画像投影。

### 13.2 同步 CLI 的唯一写入范围

P2.9 唯一新增写入是本地维护者手动运行 CLI，把教辅 corpus 同步到：

```text
variant_practice_corpus_items
```

这不是用户行为，不包含学生数据，也不由浏览器触发。

## 14. 安全和隐私

- Embedding provider 请求只包含 corpus item 的 `embedding_text` 或当前诊断 query 的最小文本摘要，不包含图片 base64、学生画像、`memory_delta`、错题本历史或完整 `memory_events`。
- CLI 和 runtime 日志不得输出完整 embedding 数组、API key、service role key、完整 provider 响应或 Supabase error 原文。
- Runtime provider 失败只触发 fallback，不把 provider failure detail 返回浏览器。
- pgvector table 不授予 `anon` / `authenticated` 权限。
- `SUPABASE_SERVICE_ROLE_KEY` 继续只在服务端读取。
- 前端只调用 `/api/variant-practice`。

## 15. 测试策略

### 15.1 Migration tests

覆盖：

- migration 创建 `vector` extension。
- 创建 `variant_practice_corpus_items`。
- `embedding vector(1536)` 存在。
- 创建 HNSW vector index。
- 创建 GIN metadata indexes。
- 启用 RLS。
- 只授予 `service_role` select/insert/update。
- 不授予 `anon` / `authenticated`。
- 创建并只授予 service role 执行 `match_variant_practice_corpus_items`。

### 15.2 Embedding text tests

覆盖：

- corpus item embedding text 包含题干、检索文本、知识点、章节、目标能力和方法标签。
- embedding text 不包含 `source_ref`、review meta、PDF 路径或审核字段。
- query embedding text 使用 P2.7 query 字段，不读取学生画像。
- hash 在 model、维度或文本变化时变化。

### 15.3 Embedding provider tests

使用 fake fetch 覆盖：

- OpenAI-compatible embeddings 响应解析。
- 缺 API key 返回 not configured。
- HTTP error、timeout、network failure、invalid JSON 返回 recoverable error。
- 返回向量维度不是 1536 时拒绝。
- 不把 API key 放进 error message。

### 15.4 Sync CLI / persistence tests

使用合成 corpus 和 fake repository 覆盖：

- 只同步 approved items。
- `needs_visual` item 不同步。
- hash 未变化时跳过 embedding provider。
- 新增/变化题会 upsert。
- 当前 corpus 缺失的旧 active row 会被 deactivated。
- dry-run 不调用 embedding provider、不写数据库。
- 输出摘要不含完整题干和 embedding 数组。

### 15.5 Corpus source / service tests

覆盖：

- Supabase 未配置时使用本地 JSON fallback。
- Embedding provider 未配置时使用本地 JSON fallback。
- pgvector repository 返回候选时，service 优先用 pgvector candidate corpus。
- pgvector 候选经 Agent 后不足 3 道时，service 回退本地 JSON。
- pgvector repository 抛错时，service 回退本地 JSON。
- pgvector path 和 local fallback 输出都必须经过 `createVariantPracticeProductViewModel`。
- 正式响应不包含 `vector_distance`、`metadata_score`、`embedding_hash`、`item_id`、`source_candidate_id` 或 source ref。
- `POST /api/variant-practice` 的 400/200 行为与 P2.7 保持一致。

### 15.6 回归测试

实现完成后至少运行：

```text
node scripts/run-tests.mjs default
npm run test:smoke
npm run lint
npm run build
git diff --check
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
```

有真实 Supabase 和 embedding provider 配置时，还应运行：

```text
node scripts/rag/sync-variant-practice-pgvector.mjs --dry-run
node scripts/rag/sync-variant-practice-pgvector.mjs --apply
```

然后本地打开 `http://localhost:3000` 验证：

- 默认样例题仍显示 P2.5 静态推荐或预写 fallback。
- 确认导数类上传题后，练习区仍显示 3 道真实题库题。
- 暂时移除或禁用 pgvector 配置后，动态推荐仍能走本地 JSON fallback。

## 16. 文档收口

P2.9 实现阶段应同步更新：

- PRD：补充 P2.9 pgvector-backed variant practice retrieval，说明它只替换练习候选召回来源，不写画像事实层。
- `docs/TECHNICAL_ROADMAP.md`：更新当前状态和数据库/RAG 演进，说明 pgvector 先用于变式练习题库检索，而不是学生画像。
- `docs/rag-artifacts.md`：说明本地 enriched corpus 仍是同步源和 fallback；pgvector 是运行时优先候选源。
- `interview/mathtrace-project-narrative.md`：实现、审查和验证完成后新增 P2.9 阶段，重点讲“pgvector 候选召回 + P2.7 fallback + RAG 不写画像”。
- 必要时新增 ADR，记录为什么先用 pgvector 而不是 Milvus、pgvector-only 或 RAG 写入 memory。

本 design spec 本身不更新 PRD，因为它是实现前设计稿。后续 implementation plan 应把文档更新列为收尾任务。

## 17. 验收标准

P2.9 实现完成后必须满足：

- 有 pgvector migration，且 service role only。
- 本地同步 CLI 可以把 approved enriched corpus 同步到 Supabase pgvector 表。
- `/api/variant-practice` 优先使用 pgvector 检索候选题。
- pgvector 不可用时自动回退 P2.7 本地 JSON corpus。
- API 响应契约和前端 `ProductVariantPractice` 展示不变。
- RAG 不写 `memory_events`、`student_profiles`、错题本、诊断运行或 localStorage。
- 前端不直连数据库，不读取 corpus 文件或 service role key。
- `sample_diagnosis`、P2.5 默认样例推荐和 P2.7 上传题动态推荐 fallback 不回归。
- 相关单测、smoke、lint、build 和 `git diff --check` 通过。
- `git ls-files artifacts .env.local docs/reviews .superpowers/sdd` 无输出。

## 18. 自查

- 没有新增登录、多用户、老师端、RLS 用户策略或权限系统。
- 没有让 pgvector 替代 `memory_events` / `student_profiles` 事实层。
- 没有让 RAG 输出影响 `memory_delta` 或画像持久化。
- 没有把 `/api/confirm` 和 `/api/variant-practice` 耦合。
- 没有让前端接触 Supabase、service role key、embedding key 或本地文件。
- 保留了本地 JSON fallback，确保 demo 稳定。
- 明确了 embedding 维度假设，避免实现时隐式支持多模型维度。
- 明确了需要真实 Supabase + embedding provider smoke，但不把它作为无配置本地测试的前置条件。
