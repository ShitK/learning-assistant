# P1.7 Supabase Postgres Mistake Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MathTrace 接入 Supabase Postgres 数据底座，在确认后的诊断流程中写入诊断运行、错题本条目和画像事件，并在前端展示只读错题本 MVP。

**Architecture:** 保持 `sample_diagnosis` 稳定路径、图片识别草稿和 P1.5 可信写入边界不变。新增 server-only Supabase 持久化层：前端只调用 Next.js API，服务端用 service role key 写入 Postgres；数据库记录事件和错题本，不一次性迁移完整 localStorage 画像。Supabase 未配置或写入失败时，诊断报告仍返回，现有 demo/smoke 路径不能被数据库依赖破坏。

**Tech Stack:** Next.js App Router Route Handlers, TypeScript, React client state, Supabase Postgres, `@supabase/supabase-js`, SQL migration, Node.js script tests with `assert` and `jiti`, existing localStorage demo profile.

---

## 0. Scope, Assumptions, And Boundaries

### In Scope

- 新增 Supabase Postgres 表：
  - `students`
  - `diagnosis_runs`
  - `mistake_book_items`
  - `memory_events`
- 新增 SQL migration，包含 RLS、索引和一个原子写入 RPC。
- 新增 server-only Supabase admin client，service role key 只在服务端读取。
- 在以下成功响应后尝试写库：
  - `sample_diagnosis`：视为 demo 自动确认路径，仅当 `memory_delta.should_persist=true` 时写入。
  - `confirmed_image_diagnosis`：仅当 `memory_delta.should_persist=true` 时写入。
- 不持久化 `image_diagnosis` 的 `extraction_review` 草稿。
- 新增 `GET /api/mistake-book?student_id=demo_student_001`，返回最近错题本条目。
- 前端工作台新增轻量只读“错题本”面板，展示最近条目。
- 数据库未配置时，API 返回稳定空错题本，诊断主流程不报错。
- 写入失败时，报告仍返回，并只追加安全 warning，不输出 secret、base64 或完整 provider payload。

### Out Of Scope

- 不做登录、Supabase Auth、老师端、家长端、权限切换、班级、多学生管理。
- 不做 RAG、pgvector、相似错题召回、Supabase Storage、图片保存或 signed upload URL。
- 不做错题编辑、删除、分页搜索、复习状态更新或练习完成闭环。
- 不把前端 localStorage 迁移为数据库画像来源；localStorage 继续负责 demo 画像恢复。
- 不让模型、前端或 provider 输出直接决定数据库写入语义。
- 不提交 `docs/reviews/*.md`。

### Key Decisions

- 表名采用本阶段产品语义：`mistake_book_items` 和 `memory_events`，不沿用 Roadmap 旧名 `mistake_records` / `memory_deltas`。旧概念映射如下：
  - `mistake_records` -> `mistake_book_items`
  - `memory_deltas` -> `memory_events`
- `diagnosis_runs.id` 使用数据库 UUID；现有 API 的 `diagnosis_id` 作为 `client_diagnosis_id` 保存，避免 sample 诊断重复导致主键冲突。
- 数据库写入使用 RPC `persist_mathtrace_diagnosis(...)` 保证一次诊断的三类记录原子写入。
- RLS 对四张表开启，但不新增浏览器可用策略；当前只允许 service role 通过服务端 API 访问。
- `students.id` 目前只接受 `demo_student_001`。非 demo 学生请求在 API/service 层返回 `400 invalid_request` 或只读接口返回 400，不假装已经有多用户权限系统。

### Success Criteria

- 无 Supabase env、无网络、无 API Key 时：
  - `npm run test:smoke` 通过。
  - `npm test` 通过。
  - `sample_diagnosis` 仍返回完整报告，`fallback_used=false`。
- 有 fake repository 注入时：
  - `sample_diagnosis` 写入一次 diagnosis run、mistake book item、memory event。
  - `confirmed_image_diagnosis` 中 `student_work_sufficient` 写入三类记录。
  - `problem_only + skip_follow_up` 写入 `profile_update_kind="problem_type_focus"`，且 `memory_event.mistake_cause_changes={}`。
  - `problem_only + confirm_stuck_point_analysis` 写入 `persistence_evidence="user_confirmed"`。
  - `submit_stuck_point`、`insufficient`、token mismatch、`memory_delta.should_persist=false` 不写错题本和 memory event。
- 数据库 payload 中不包含完整图片 base64、API key、provider secret 或 `.env*` 内容。
- 前端只读错题本通过 `/api/mistake-book` 取数，不 import Supabase client。
- 文档同步完成：README、PRD、Technical Roadmap、interview narrative。

---

## 1. File Structure

### Create

- `supabase/migrations/20260611000000_p17_mistake_book.sql`
  - 四张表、RLS、索引、原子写入 RPC。

- `src/lib/supabase-admin.ts`
  - server-only Supabase admin client 和 env parser。

- `src/lib/diagnosis-persistence.ts`
  - 诊断响应 -> 持久化 payload 映射。
  - Supabase repository interface。
  - 默认 Supabase repository。
  - no-op/disabled 行为。

- `src/lib/mistake-book-service.ts`
  - 只读错题本 service。
  - demo student 校验、limit 校验、数据库未配置降级。

- `src/app/api/mistake-book/route.ts`
  - `GET /api/mistake-book` Route Handler。

- `src/lib/mistake-book-client.ts`
  - 前端 fetch helper 和 response guard。

- `src/components/mistake-book-panel.tsx`
  - 只读错题本面板，无数据库直连。

- `scripts/diagnosis-persistence.test.mjs`
  - 持久化 gate、payload 映射、fake repo 写入测试。

- `scripts/mistake-book-api.test.mjs`
  - 错题本 API/service 测试，不依赖真实 Supabase。

### Modify

- `package.json`
  - 新增依赖 `@supabase/supabase-js`。
  - 将新增脚本测试纳入 `npm test`。

- `package-lock.json`
  - 由 `npm install @supabase/supabase-js` 更新。

- `src/lib/diagnose-service.ts`
  - sample 成功响应后按 gate 调用 persistence。

- `src/lib/confirm-service.ts`
  - confirmed image 成功响应后按 gate 调用 persistence。

- `src/lib/diagnose-api.ts`
  - 如需要，补充可复用类型导出；避免破坏现有 response contract。

- `src/components/mathtrace-workbench.tsx`
  - 加载错题本列表。
  - 诊断成功且可持久化后刷新错题本。
  - 渲染 `MistakeBookPanel`。

- `scripts/api-smoke.test.mjs`
  - 增加 Supabase 未配置时 sample/confirm smoke 仍稳定的断言。

- `scripts/demo-smoke.test.mjs`
  - 增加错题本面板空状态或 fake items view model smoke。

- `scripts/mathtrace-workbench-ui.test.mjs`
  - 覆盖错题本面板展示和长文本稳定性。

- `README.md`
  - 新增 Supabase env、SQL migration 和本地 smoke 说明。

- `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - 更新 Step 8 和长期记忆模型，记录 P1.7 数据库边界。

- `docs/TECHNICAL_ROADMAP.md`
  - 将 Phase 3 更新为本阶段实际表名、API 和验收。

- `interview/mathtrace-project-narrative.md`
  - 追加阶段：Supabase Postgres 数据底座 + 错题本 MVP。

### Do Not Modify

- `.env*`
- `docs/reviews/*.md`
- `src/lib/vision-extraction-parser.ts`
- `src/lib/analysis-provider.ts`
- provider prompt 或 provider config 逻辑
- localStorage schema key `mathtrace.demoStudentProfile.v1`

---

## 2. Database Schema

### Tables

Use this SQL as the migration body in `supabase/migrations/20260611000000_p17_mistake_book.sql`:

```sql
create extension if not exists pgcrypto;

create table if not exists public.students (
  id text primary key,
  display_name text not null,
  grade text not null,
  subject text not null default 'math',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint students_subject_check check (subject = 'math')
);

create table if not exists public.diagnosis_runs (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  client_diagnosis_id text not null,
  source text not null,
  evidence_level text,
  persistence_evidence text,
  profile_update_kind text,
  recognized_question jsonb not null,
  knowledge_mapping jsonb not null,
  mistake_diagnosis jsonb not null,
  memory_delta jsonb not null,
  student_profile_snapshot jsonb not null,
  practice_questions jsonb not null,
  review_plan jsonb not null,
  warnings text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint diagnosis_runs_source_check check (source in ('sample', 'image')),
  constraint diagnosis_runs_evidence_level_check check (
    evidence_level is null
    or evidence_level in ('student_work_sufficient', 'problem_only', 'insufficient')
  ),
  constraint diagnosis_runs_persistence_evidence_check check (
    persistence_evidence is null
    or persistence_evidence in ('student_work', 'user_confirmed', 'uploaded_problem_only', 'none')
  ),
  constraint diagnosis_runs_profile_update_kind_check check (
    profile_update_kind is null
    or profile_update_kind in ('mistake_cause', 'problem_type_focus', 'none')
  )
);

create table if not exists public.mistake_book_items (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  diagnosis_run_id uuid not null references public.diagnosis_runs(id) on delete cascade,
  source text not null,
  question_text text not null,
  student_answer text not null,
  standard_solution text not null,
  knowledge_points text[] not null,
  mistake_causes text[] not null,
  severity text not null,
  diagnosis_summary text not null,
  evidence_level text,
  persistence_evidence text,
  profile_update_kind text not null,
  review_status smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mistake_book_items_source_check check (source in ('sample', 'image')),
  constraint mistake_book_items_severity_check check (severity in ('minor', 'medium', 'severe')),
  constraint mistake_book_items_review_status_check check (review_status in (0, 1, 2, 3)),
  constraint mistake_book_items_profile_update_kind_check check (
    profile_update_kind in ('mistake_cause', 'problem_type_focus', 'none')
  )
);

create table if not exists public.memory_events (
  id uuid primary key default gen_random_uuid(),
  student_id text not null references public.students(id) on delete cascade,
  diagnosis_run_id uuid not null references public.diagnosis_runs(id) on delete cascade,
  mistake_book_item_id uuid not null references public.mistake_book_items(id) on delete cascade,
  event_type text not null,
  memory_delta jsonb not null,
  knowledge_mastery_changes jsonb not null,
  mistake_cause_changes jsonb not null,
  review_priority_changes text[] not null,
  is_repeated_mistake boolean not null,
  rationale text not null,
  evidence_level text,
  persistence_evidence text,
  profile_update_kind text not null,
  created_at timestamptz not null default now(),
  constraint memory_events_event_type_check check (
    event_type in ('mistake_cause', 'problem_type_focus')
  ),
  constraint memory_events_profile_update_kind_check check (
    profile_update_kind in ('mistake_cause', 'problem_type_focus')
  )
);

create index if not exists diagnosis_runs_student_created_idx
  on public.diagnosis_runs(student_id, created_at desc);

create index if not exists mistake_book_items_student_created_idx
  on public.mistake_book_items(student_id, created_at desc);

create index if not exists mistake_book_items_student_review_status_idx
  on public.mistake_book_items(student_id, review_status, created_at desc);

create index if not exists memory_events_student_created_idx
  on public.memory_events(student_id, created_at desc);

create index if not exists memory_events_diagnosis_run_idx
  on public.memory_events(diagnosis_run_id);

alter table public.students enable row level security;
alter table public.diagnosis_runs enable row level security;
alter table public.mistake_book_items enable row level security;
alter table public.memory_events enable row level security;
```

### Atomic RPC

Add this function to the same migration:

```sql
create or replace function public.persist_mathtrace_diagnosis(
  p_student_id text,
  p_student_display_name text,
  p_student_grade text,
  p_client_diagnosis_id text,
  p_source text,
  p_evidence_level text,
  p_persistence_evidence text,
  p_profile_update_kind text,
  p_recognized_question jsonb,
  p_knowledge_mapping jsonb,
  p_mistake_diagnosis jsonb,
  p_memory_delta jsonb,
  p_student_profile_snapshot jsonb,
  p_practice_questions jsonb,
  p_review_plan jsonb,
  p_warnings text[],
  p_question_text text,
  p_student_answer text,
  p_standard_solution text,
  p_knowledge_points text[],
  p_mistake_causes text[],
  p_severity text,
  p_diagnosis_summary text
)
returns table (
  diagnosis_run_id uuid,
  mistake_book_item_id uuid,
  memory_event_id uuid
)
language plpgsql
set search_path = public
as $$
declare
  inserted_run_id uuid;
  inserted_item_id uuid;
  inserted_event_id uuid;
  event_type text;
begin
  if p_student_id <> 'demo_student_001' then
    raise exception 'Only demo_student_001 is supported in P1.7';
  end if;

  if p_profile_update_kind not in ('mistake_cause', 'problem_type_focus') then
    raise exception 'profile_update_kind must be persistable';
  end if;

  event_type := p_profile_update_kind;

  insert into public.students (id, display_name, grade, subject, updated_at)
  values (p_student_id, p_student_display_name, p_student_grade, 'math', now())
  on conflict (id) do update
    set display_name = excluded.display_name,
        grade = excluded.grade,
        updated_at = now();

  insert into public.diagnosis_runs (
    student_id,
    client_diagnosis_id,
    source,
    evidence_level,
    persistence_evidence,
    profile_update_kind,
    recognized_question,
    knowledge_mapping,
    mistake_diagnosis,
    memory_delta,
    student_profile_snapshot,
    practice_questions,
    review_plan,
    warnings
  )
  values (
    p_student_id,
    p_client_diagnosis_id,
    p_source,
    p_evidence_level,
    p_persistence_evidence,
    p_profile_update_kind,
    p_recognized_question,
    p_knowledge_mapping,
    p_mistake_diagnosis,
    p_memory_delta,
    p_student_profile_snapshot,
    p_practice_questions,
    p_review_plan,
    p_warnings
  )
  returning id into inserted_run_id;

  insert into public.mistake_book_items (
    student_id,
    diagnosis_run_id,
    source,
    question_text,
    student_answer,
    standard_solution,
    knowledge_points,
    mistake_causes,
    severity,
    diagnosis_summary,
    evidence_level,
    persistence_evidence,
    profile_update_kind
  )
  values (
    p_student_id,
    inserted_run_id,
    p_source,
    p_question_text,
    p_student_answer,
    p_standard_solution,
    p_knowledge_points,
    p_mistake_causes,
    p_severity,
    p_diagnosis_summary,
    p_evidence_level,
    p_persistence_evidence,
    p_profile_update_kind
  )
  returning id into inserted_item_id;

  insert into public.memory_events (
    student_id,
    diagnosis_run_id,
    mistake_book_item_id,
    event_type,
    memory_delta,
    knowledge_mastery_changes,
    mistake_cause_changes,
    review_priority_changes,
    is_repeated_mistake,
    rationale,
    evidence_level,
    persistence_evidence,
    profile_update_kind
  )
  values (
    p_student_id,
    inserted_run_id,
    inserted_item_id,
    event_type,
    p_memory_delta,
    coalesce(p_memory_delta -> 'knowledge_mastery_changes', '{}'::jsonb),
    coalesce(p_memory_delta -> 'mistake_cause_changes', '{}'::jsonb),
    case
      when jsonb_typeof(p_memory_delta -> 'review_priority_changes') = 'array'
      then array(select jsonb_array_elements_text(p_memory_delta -> 'review_priority_changes'))
      else array[]::text[]
    end,
    coalesce((p_memory_delta ->> 'is_repeated_mistake')::boolean, false),
    coalesce(p_memory_delta ->> 'rationale', ''),
    p_evidence_level,
    p_persistence_evidence,
    p_profile_update_kind
  )
  returning id into inserted_event_id;

  return query select inserted_run_id, inserted_item_id, inserted_event_id;
end;
$$;

grant execute on function public.persist_mathtrace_diagnosis(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text[],
  text,
  text,
  text,
  text[],
  text[],
  text,
  text
) to service_role;
```

---

## 3. Implementation Tasks

### Task 1: Branch, Dependency, And Baseline

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Confirm branch and clean scope**

Run:

```bash
git branch --show-current
git status --short
```

Expected:

```text
codex/p17-supabase-mistake-book
```

`git status --short` should only show this plan file before implementation begins.

- [ ] **Step 2: Install Supabase client**

Run:

```bash
npm install @supabase/supabase-js
```

Expected: npm completes successfully, `package.json` contains `@supabase/supabase-js` under `dependencies`, and `package-lock.json` is updated.

- [ ] **Step 3: Run baseline verification**

Run:

```bash
npm test
npm run test:eval
npm run test:smoke
npm run lint
npm run build
```

Expected: all commands pass before production code changes. If a command fails before P1.7 edits, stop and record the pre-existing failure.

### Task 2: SQL Migration

**Files:**
- Create: `supabase/migrations/20260611000000_p17_mistake_book.sql`

- [ ] **Step 1: Add migration file**

Create `supabase/migrations/20260611000000_p17_mistake_book.sql` with the full SQL from section 2.

- [ ] **Step 2: Review migration for privacy**

Run:

```bash
rg -n "base64|api_key|service_role|VISION_PROVIDER|ANALYSIS_PROVIDER|image_base64" supabase/migrations/20260611000000_p17_mistake_book.sql
```

Expected: no output except the allowed `service_role` grant line. The migration must not define any column that stores full image base64.

- [ ] **Step 3: Optional live Supabase apply**

If a Supabase project is available, run the migration through the Supabase SQL editor or Supabase CLI. Do not commit `.env.local`.

Expected in Supabase dashboard:

```text
students
diagnosis_runs
mistake_book_items
memory_events
persist_mathtrace_diagnosis
```

### Task 3: Server-Only Supabase Admin Client

**Files:**
- Create: `src/lib/supabase-admin.ts`
- Create: `scripts/diagnosis-persistence.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing env parser tests**

Start `scripts/diagnosis-persistence.test.mjs` with:

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  createSupabaseAdminConfigFromEnv,
} = jiti("../src/lib/supabase-admin.ts");

const missingConfig = createSupabaseAdminConfigFromEnv({});
assert.equal(missingConfig.ok, false);
assert.equal(missingConfig.reason, "missing_config");

const validConfig = createSupabaseAdminConfigFromEnv({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
});

assert.equal(validConfig.ok, true);
assert.equal(validConfig.value.url, "https://example.supabase.co");
assert.equal(validConfig.value.service_role_key, "service-role-secret");
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
node scripts/diagnosis-persistence.test.mjs
```

Expected: FAIL because `src/lib/supabase-admin.ts` does not exist.

- [ ] **Step 3: Implement server-only config and client**

Create `src/lib/supabase-admin.ts`:

```ts
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseAdminConfig {
  url: string;
  service_role_key: string;
}

export type SupabaseAdminConfigResult =
  | { ok: true; value: SupabaseAdminConfig }
  | { ok: false; reason: "missing_config" };

export function createSupabaseAdminConfigFromEnv(
  env: Record<string, string | undefined>,
): SupabaseAdminConfigResult {
  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    return { ok: false, reason: "missing_config" };
  }

  return {
    ok: true,
    value: {
      url,
      service_role_key: serviceRoleKey,
    },
  };
}

export function createSupabaseAdminClient(
  config: SupabaseAdminConfig,
): SupabaseClient {
  return createClient(config.url, config.service_role_key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
```

- [ ] **Step 4: Run focused test and verify GREEN**

Run:

```bash
node scripts/diagnosis-persistence.test.mjs
```

Expected: PASS for env parser tests.

### Task 4: Persistence Payload Mapper And Repository Contract

**Files:**
- Create: `src/lib/diagnosis-persistence.ts`
- Modify: `scripts/diagnosis-persistence.test.mjs`

- [ ] **Step 1: Add failing persistence gate tests**

Append to `scripts/diagnosis-persistence.test.mjs`:

```js
const {
  buildDiagnosisPersistencePayload,
  persistDiagnosisIfNeeded,
} = jiti("../src/lib/diagnosis-persistence.ts");
const { demoStudentProfile } = jiti("../src/data/mathtrace-demo.ts");

const persistableImageResponse = {
  diagnosis_id: "diag_image_001",
  student_id: "demo_student_001",
  source: "image",
  steps: [],
  recognized_question: {
    id: "image_001",
    title: "图片识别错题",
    module: "导数",
    question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论单调性。",
    student_answer: "只写了求导。",
    student_solution_steps: ["求导得到 $f'(x)=1/x-a$。"],
    extraction_confidence: "high",
  },
  knowledge_mapping: {
    knowledge_points: ["derivative_monotonicity", "parameter_classification"],
    difficulty: 4,
  },
  mistake_diagnosis: {
    mistake_causes: ["classification_missing"],
    severity: "minor",
    expected_diagnosis: "遗漏分类讨论。",
    step_analysis: ["只写了一个情况。"],
    solution_highlights: ["先分类讨论。"],
    standard_solution: "先求导，再按 $a\\le 0$ 与 $a>0$ 分类讨论。",
  },
  memory_delta: {
    knowledge_mastery_changes: { parameter_classification: -3 },
    mistake_cause_changes: { classification_missing: 1 },
    is_repeated_mistake: false,
    review_priority_changes: ["parameter_classification"],
    should_persist: true,
    rationale: "用户已确认图片识别结果。",
  },
  student_profile: demoStudentProfile,
  practice_questions: [],
  review_plan: { tomorrow: "复习分类讨论", seven_days: [], rationale: [] },
  sample_diagnosis: null,
  fallback_used: false,
  evidence_level: "student_work_sufficient",
  persistence_evidence: "student_work",
  profile_update_kind: "mistake_cause",
  risk_follow_up: null,
  warnings: [],
};

const payload = buildDiagnosisPersistencePayload(persistableImageResponse);
assert.equal(payload.ok, true);
assert.equal(payload.value.student_id, "demo_student_001");
assert.equal(payload.value.source, "image");
assert.equal(payload.value.question_text.includes("data:image"), false);
assert.deepEqual(payload.value.mistake_causes, ["classification_missing"]);
assert.equal(payload.value.profile_update_kind, "mistake_cause");

const skippedResponse = {
  ...persistableImageResponse,
  memory_delta: {
    ...persistableImageResponse.memory_delta,
    should_persist: false,
  },
};

const skippedPayload = buildDiagnosisPersistencePayload(skippedResponse);
assert.equal(skippedPayload.ok, false);
assert.equal(skippedPayload.reason, "not_persistable");

const fakeRepositoryCalls = [];
const fakeRepository = {
  async persistDiagnosis(input) {
    fakeRepositoryCalls.push(input);
    return {
      ok: true,
      ids: {
        diagnosis_run_id: "run-1",
        mistake_book_item_id: "item-1",
        memory_event_id: "event-1",
      },
    };
  },
};

const persistedBody = await persistDiagnosisIfNeeded(
  persistableImageResponse,
  fakeRepository,
);

assert.equal(fakeRepositoryCalls.length, 1);
assert.equal(persistedBody.warnings.length, 0);

await persistDiagnosisIfNeeded(skippedResponse, fakeRepository);
assert.equal(fakeRepositoryCalls.length, 1);
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
node scripts/diagnosis-persistence.test.mjs
```

Expected: FAIL because `src/lib/diagnosis-persistence.ts` does not exist.

- [ ] **Step 3: Implement payload mapper and repository interface**

Create `src/lib/diagnosis-persistence.ts` with these exported shapes:

```ts
import {
  createSupabaseAdminClient,
  createSupabaseAdminConfigFromEnv,
} from "@/lib/supabase-admin";
import type {
  DiagnoseImageSuccessResponse,
  DiagnoseSuccessResponse,
} from "@/lib/diagnose-api";

export interface DiagnosisPersistencePayload {
  student_id: "demo_student_001";
  student_display_name: string;
  student_grade: string;
  client_diagnosis_id: string;
  source: "sample" | "image";
  evidence_level: string | null;
  persistence_evidence: string | null;
  profile_update_kind: "mistake_cause" | "problem_type_focus";
  recognized_question: Record<string, unknown>;
  knowledge_mapping: Record<string, unknown>;
  mistake_diagnosis: Record<string, unknown>;
  memory_delta: Record<string, unknown>;
  student_profile_snapshot: Record<string, unknown>;
  practice_questions: unknown[];
  review_plan: Record<string, unknown>;
  warnings: string[];
  question_text: string;
  student_answer: string;
  standard_solution: string;
  knowledge_points: string[];
  mistake_causes: string[];
  severity: "minor" | "medium" | "severe";
  diagnosis_summary: string;
}

export type DiagnosisPersistenceIds = {
  diagnosis_run_id: string;
  mistake_book_item_id: string;
  memory_event_id: string;
};

export interface DiagnosisPersistenceRepository {
  persistDiagnosis(
    input: DiagnosisPersistencePayload,
  ): Promise<
    | { ok: true; ids: DiagnosisPersistenceIds }
    | { ok: false; message: string }
  >;
}
```

Then implement:

```ts
export function buildDiagnosisPersistencePayload(
  response: DiagnoseSuccessResponse | DiagnoseImageSuccessResponse,
):
  | { ok: true; value: DiagnosisPersistencePayload }
  | { ok: false; reason: "not_persistable" | "unsupported_student" | "unsupported_profile_update_kind" } {
  if (!response.memory_delta.should_persist) {
    return { ok: false, reason: "not_persistable" };
  }

  if (response.student_id !== "demo_student_001") {
    return { ok: false, reason: "unsupported_student" };
  }

  const profileUpdateKind =
    response.source === "sample" ? "mistake_cause" : response.profile_update_kind;

  if (
    profileUpdateKind !== "mistake_cause" &&
    profileUpdateKind !== "problem_type_focus"
  ) {
    return { ok: false, reason: "unsupported_profile_update_kind" };
  }

  return {
    ok: true,
    value: {
      student_id: "demo_student_001",
      student_display_name: "Demo Student",
      student_grade: response.student_profile.grade,
      client_diagnosis_id: response.diagnosis_id,
      source: response.source,
      evidence_level: response.source === "image" ? response.evidence_level : null,
      persistence_evidence:
        response.source === "image" ? response.persistence_evidence : null,
      profile_update_kind: profileUpdateKind,
      recognized_question: response.recognized_question as unknown as Record<string, unknown>,
      knowledge_mapping: response.knowledge_mapping as unknown as Record<string, unknown>,
      mistake_diagnosis: response.mistake_diagnosis as unknown as Record<string, unknown>,
      memory_delta: response.memory_delta as unknown as Record<string, unknown>,
      student_profile_snapshot: response.student_profile as unknown as Record<string, unknown>,
      practice_questions: response.practice_questions,
      review_plan: response.review_plan as unknown as Record<string, unknown>,
      warnings: response.warnings,
      question_text: response.recognized_question.question_text,
      student_answer: response.recognized_question.student_answer,
      standard_solution: response.mistake_diagnosis.standard_solution,
      knowledge_points: response.knowledge_mapping.knowledge_points,
      mistake_causes: response.mistake_diagnosis.mistake_causes,
      severity: response.mistake_diagnosis.severity,
      diagnosis_summary: response.mistake_diagnosis.expected_diagnosis,
    },
  };
}
```

Implement `persistDiagnosisIfNeeded` so it silently skips disabled/not-persistable responses and appends a safe warning only when an enabled repository returns `{ ok: false }`:

```ts
export async function persistDiagnosisIfNeeded<
  T extends DiagnoseSuccessResponse | DiagnoseImageSuccessResponse,
>(response: T, repository: DiagnosisPersistenceRepository | null): Promise<T> {
  const payload = buildDiagnosisPersistencePayload(response);
  if (!payload.ok || repository === null) {
    return response;
  }

  const result = await repository.persistDiagnosis(payload.value);
  if (result.ok) {
    return response;
  }

  return {
    ...response,
    warnings: [
      ...response.warnings,
      "数据库写入失败，本次报告已生成但错题本可能稍后同步。",
    ],
  };
}
```

Implement `createDefaultDiagnosisPersistenceRepository()` that returns `null` when Supabase env is missing and otherwise calls RPC `persist_mathtrace_diagnosis`.

- [ ] **Step 4: Run focused test and verify GREEN**

Run:

```bash
node scripts/diagnosis-persistence.test.mjs
```

Expected: PASS.

### Task 5: Wire Persistence Into Diagnose And Confirm Services

**Files:**
- Modify: `src/lib/diagnose-service.ts`
- Modify: `src/lib/confirm-service.ts`
- Modify: `scripts/api-smoke.test.mjs`
- Modify: `scripts/diagnosis-persistence.test.mjs`

- [ ] **Step 1: Add failing service injection tests**

Append to `scripts/diagnosis-persistence.test.mjs`:

```js
const { handleDiagnoseRequest } = jiti("../src/lib/diagnose-service.ts");
const { handleConfirmRequest } = jiti("../src/lib/confirm-service.ts");
const { createImageConfirmationToken, createImageConfirmationFingerprint } = jiti(
  "../src/lib/image-confirmation-token.ts",
);

const sampleWrites = [];
const sampleWriteResult = await handleDiagnoseRequest(
  {
    student_id: "demo_student_001",
    task_type: "sample_diagnosis",
    sample_question_id: "sample_derivative_001",
    image_base64: null,
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    persistence_repository: {
      async persistDiagnosis(input) {
        sampleWrites.push(input);
        return {
          ok: true,
          ids: {
            diagnosis_run_id: "run-sample",
            mistake_book_item_id: "item-sample",
            memory_event_id: "event-sample",
          },
        };
      },
    },
  },
);

assert.equal(sampleWriteResult.status, 200);
assert.equal(sampleWrites.length, 1);
assert.equal(sampleWrites[0].source, "sample");

const confirmedExtraction = {
  question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论单调性。",
  student_answer: "只写了求导。",
  student_solution_steps: ["求导得到 $f'(x)=1/x-a$。"],
  standard_solution_draft: "先求导，再按 $a\\le 0$ 与 $a>0$ 分类讨论。",
  extraction_confidence: "high",
  warnings: [],
};

const token = createImageConfirmationToken({
  draft_id: "image_draft_test",
  extraction_confidence: "high",
  can_persist_after_confirmation: true,
  draft_fingerprint: createImageConfirmationFingerprint(confirmedExtraction),
});

const confirmWrites = [];
const confirmWriteResult = await handleConfirmRequest(
  {
    student_id: "demo_student_001",
    task_type: "confirmed_image_diagnosis",
    confirmation_token: token,
    confirmation_action: "diagnose_from_student_work",
    confirmed_extraction: confirmedExtraction,
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    persistence_repository: {
      async persistDiagnosis(input) {
        confirmWrites.push(input);
        return {
          ok: true,
          ids: {
            diagnosis_run_id: "run-image",
            mistake_book_item_id: "item-image",
            memory_event_id: "event-image",
          },
        };
      },
    },
  },
);

assert.equal(confirmWriteResult.status, 200);
assert.equal(confirmWrites.length, 1);
assert.equal(confirmWrites[0].source, "image");
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
node scripts/diagnosis-persistence.test.mjs
```

Expected: FAIL because services do not accept `persistence_repository`.

- [ ] **Step 3: Update service dependency types**

In `src/lib/diagnose-service.ts`, extend deps:

```ts
import {
  createDefaultDiagnosisPersistenceRepository,
  persistDiagnosisIfNeeded,
} from "@/lib/diagnosis-persistence";
import type { DiagnosisPersistenceRepository } from "@/lib/diagnosis-persistence";

export function handleDiagnoseRequest(
  payload: unknown,
  deps?: {
    vision_provider?: VisionExtractionProvider;
    persistence_repository?: DiagnosisPersistenceRepository | null;
  },
): Promise<DiagnoseServiceResult> {
  // existing parse logic remains
}
```

After `runMathTraceAgent(parsedRequest.value)`:

```ts
const response = runMathTraceAgent(parsedRequest.value);
const body = await persistDiagnosisIfNeeded(
  response,
  deps?.persistence_repository ?? createDefaultDiagnosisPersistenceRepository(),
);

return {
  status: 200,
  body,
};
```

Keep `image_diagnosis` extraction review unchanged and do not persist extraction drafts.

In `src/lib/confirm-service.ts`, extend deps:

```ts
import {
  createDefaultDiagnosisPersistenceRepository,
  persistDiagnosisIfNeeded,
} from "@/lib/diagnosis-persistence";
import type { DiagnosisPersistenceRepository } from "@/lib/diagnosis-persistence";

export async function handleConfirmRequest(
  payload: unknown,
  deps?: {
    analysis_provider?: AnalysisProvider;
    persistence_repository?: DiagnosisPersistenceRepository | null;
  },
): Promise<DiagnoseServiceResult> {
  // existing parse and analysis logic remains
}
```

Before returning the successful image diagnosis:

```ts
const response = runImageMathTraceAgent({
  request: parsed.value.request,
  extraction: parsed.value.extraction,
  is_extraction_confirmed: parsed.value.is_confirmation_token_matched,
  confirmation_action: parsed.value.confirmation_action,
  follow_up_answer: parsed.value.follow_up_answer,
  analysis,
});

const body = await persistDiagnosisIfNeeded(
  response,
  deps?.persistence_repository ?? createDefaultDiagnosisPersistenceRepository(),
);

return {
  status: 200,
  body,
};
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node scripts/diagnosis-persistence.test.mjs
node scripts/api-smoke.test.mjs
```

Expected: PASS. Existing API smoke should still pass without Supabase env.

### Task 6: Mistake Book Read API

**Files:**
- Create: `src/lib/mistake-book-service.ts`
- Create: `src/app/api/mistake-book/route.ts`
- Create: `src/lib/mistake-book-client.ts`
- Create: `scripts/mistake-book-api.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing API/service tests**

Create `scripts/mistake-book-api.test.mjs`:

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  handleMistakeBookRequest,
} = jiti("../src/lib/mistake-book-service.ts");
const {
  isMistakeBookResponse,
} = jiti("../src/lib/mistake-book-client.ts");

const disabledResult = await handleMistakeBookRequest(
  new URL("http://localhost/api/mistake-book?student_id=demo_student_001"),
  null,
);

assert.equal(disabledResult.status, 200);
assert.equal(disabledResult.body.student_id, "demo_student_001");
assert.equal(disabledResult.body.items.length, 0);
assert.equal(disabledResult.body.is_database_configured, false);
assert.equal(isMistakeBookResponse(disabledResult.body), true);

const invalidStudent = await handleMistakeBookRequest(
  new URL("http://localhost/api/mistake-book?student_id=student_002"),
  null,
);

assert.equal(invalidStudent.status, 400);
assert.equal(invalidStudent.body.error.code, "invalid_request");

const fakeRepository = {
  async listMistakeBookItems(input) {
    assert.equal(input.student_id, "demo_student_001");
    assert.equal(input.limit, 5);
    return {
      ok: true,
      items: [
        {
          id: "item-1",
          created_at: "2026-06-11T08:00:00.000Z",
          source: "image",
          question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论单调性。",
          knowledge_points: ["parameter_classification"],
          mistake_causes: ["classification_missing"],
          severity: "minor",
          diagnosis_summary: "遗漏分类讨论。",
          evidence_level: "student_work_sufficient",
          persistence_evidence: "student_work",
          profile_update_kind: "mistake_cause",
          review_status: 0,
        },
      ],
    };
  },
};

const listResult = await handleMistakeBookRequest(
  new URL("http://localhost/api/mistake-book?student_id=demo_student_001&limit=5"),
  fakeRepository,
);

assert.equal(listResult.status, 200);
assert.equal(listResult.body.items.length, 1);
assert.equal(listResult.body.items[0].id, "item-1");
assert.equal(listResult.body.is_database_configured, true);

console.log("mistake book api test passed");
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
node scripts/mistake-book-api.test.mjs
```

Expected: FAIL because files do not exist.

- [ ] **Step 3: Implement service and client response guard**

Create `src/lib/mistake-book-client.ts`:

```ts
import { isRecord } from "@/lib/utils";

export interface MistakeBookItemSummary {
  id: string;
  created_at: string;
  source: "sample" | "image";
  question_text: string;
  knowledge_points: string[];
  mistake_causes: string[];
  severity: "minor" | "medium" | "severe";
  diagnosis_summary: string;
  evidence_level: string | null;
  persistence_evidence: string | null;
  profile_update_kind: "mistake_cause" | "problem_type_focus";
  review_status: 0 | 1 | 2 | 3;
}

export interface MistakeBookResponse {
  student_id: "demo_student_001";
  items: MistakeBookItemSummary[];
  is_database_configured: boolean;
  warnings: string[];
}

export function isMistakeBookResponse(value: unknown): value is MistakeBookResponse {
  return (
    isRecord(value) &&
    value.student_id === "demo_student_001" &&
    Array.isArray(value.items) &&
    value.items.every(isMistakeBookItemSummary) &&
    typeof value.is_database_configured === "boolean" &&
    Array.isArray(value.warnings) &&
    value.warnings.every((item) => typeof item === "string")
  );
}

function isMistakeBookItemSummary(value: unknown): value is MistakeBookItemSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.created_at === "string" &&
    (value.source === "sample" || value.source === "image") &&
    typeof value.question_text === "string" &&
    Array.isArray(value.knowledge_points) &&
    value.knowledge_points.every((item) => typeof item === "string") &&
    Array.isArray(value.mistake_causes) &&
    value.mistake_causes.every((item) => typeof item === "string") &&
    (value.severity === "minor" ||
      value.severity === "medium" ||
      value.severity === "severe") &&
    typeof value.diagnosis_summary === "string" &&
    (typeof value.evidence_level === "string" || value.evidence_level === null) &&
    (typeof value.persistence_evidence === "string" ||
      value.persistence_evidence === null) &&
    (value.profile_update_kind === "mistake_cause" ||
      value.profile_update_kind === "problem_type_focus") &&
    (value.review_status === 0 ||
      value.review_status === 1 ||
      value.review_status === 2 ||
      value.review_status === 3)
  );
}
```

Add `requestMistakeBookItems` in the same file:

```ts
export async function requestMistakeBookItems(input: {
  student_id: "demo_student_001";
  limit?: number;
  fetcher?: typeof fetch;
}): Promise<MistakeBookResponse> {
  const fetchImpl = input.fetcher ?? fetch;
  const params = new URLSearchParams({
    student_id: input.student_id,
    limit: String(input.limit ?? 5),
  });
  const response = await fetchImpl(`/api/mistake-book?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });
  const body: unknown = await response.json();

  if (!response.ok || !isMistakeBookResponse(body)) {
    throw new Error("错题本加载失败。");
  }

  return body;
}
```

Create `src/lib/mistake-book-service.ts` with:

```ts
import { NextResponse } from "next/server";
import { createDiagnoseError } from "@/lib/diagnose-api";
import { createDefaultMistakeBookRepository } from "@/lib/diagnosis-persistence";
import type { DiagnoseErrorResponse } from "@/lib/diagnose-api";
import type {
  MistakeBookItemSummary,
  MistakeBookResponse,
} from "@/lib/mistake-book-client";

export interface MistakeBookRepository {
  listMistakeBookItems(input: {
    student_id: "demo_student_001";
    limit: number;
  }): Promise<{ ok: true; items: MistakeBookItemSummary[] } | { ok: false; message: string }>;
}

export type MistakeBookServiceResult =
  | { status: 200; body: MistakeBookResponse }
  | { status: 400 | 500; body: DiagnoseErrorResponse };

export async function handleMistakeBookRequest(
  url: URL,
  repository: MistakeBookRepository | null = createDefaultMistakeBookRepository(),
): Promise<MistakeBookServiceResult> {
  const studentId = url.searchParams.get("student_id");
  if (studentId !== "demo_student_001") {
    return {
      status: 400,
      body: createDiagnoseError(
        "invalid_request",
        "P1.7 只支持 demo_student_001 的错题本。",
        true,
      ),
    };
  }

  const limit = parseLimit(url.searchParams.get("limit"));
  if (repository === null) {
    return {
      status: 200,
      body: {
        student_id: "demo_student_001",
        items: [],
        is_database_configured: false,
        warnings: [],
      },
    };
  }

  const result = await repository.listMistakeBookItems({
    student_id: "demo_student_001",
    limit,
  });

  if (!result.ok) {
    return {
      status: 200,
      body: {
        student_id: "demo_student_001",
        items: [],
        is_database_configured: true,
        warnings: ["错题本暂时加载失败，请稍后刷新。"],
      },
    };
  }

  return {
    status: 200,
    body: {
      student_id: "demo_student_001",
      items: result.items,
      is_database_configured: true,
      warnings: [],
    },
  };
}

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? "5");
  if (!Number.isInteger(parsed)) {
    return 5;
  }

  return Math.min(Math.max(parsed, 1), 20);
}
```

Create route `src/app/api/mistake-book/route.ts`:

```ts
import { NextResponse } from "next/server";
import { handleMistakeBookRequest } from "@/lib/mistake-book-service";
import type { DiagnoseErrorResponse } from "@/lib/diagnose-api";
import type { MistakeBookResponse } from "@/lib/mistake-book-client";

export async function GET(
  request: Request,
): Promise<NextResponse<MistakeBookResponse | DiagnoseErrorResponse>> {
  const result = await handleMistakeBookRequest(new URL(request.url));
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 4: Implement Supabase read repository**

In `src/lib/diagnosis-persistence.ts`, export `createDefaultMistakeBookRepository()`:

```ts
import type { MistakeBookRepository } from "@/lib/mistake-book-service";

export function createDefaultMistakeBookRepository(): MistakeBookRepository | null {
  const config = createSupabaseAdminConfigFromEnv(process.env);
  if (!config.ok) {
    return null;
  }

  const supabase = createSupabaseAdminClient(config.value);

  return {
    async listMistakeBookItems(input) {
      const { data, error } = await supabase
        .from("mistake_book_items")
        .select(
          "id,created_at,source,question_text,knowledge_points,mistake_causes,severity,diagnosis_summary,evidence_level,persistence_evidence,profile_update_kind,review_status",
        )
        .eq("student_id", input.student_id)
        .order("created_at", { ascending: false })
        .limit(input.limit);

      if (error) {
        return { ok: false, message: error.message };
      }

      return {
        ok: true,
        items: (data ?? []) as MistakeBookItemSummary[],
      };
    },
  };
}
```

- [ ] **Step 5: Run focused test and verify GREEN**

Run:

```bash
node scripts/mistake-book-api.test.mjs
```

Expected: PASS.

### Task 7: Frontend Read-Only Mistake Book Panel

**Files:**
- Create: `src/components/mistake-book-panel.tsx`
- Modify: `src/components/mathtrace-workbench.tsx`
- Modify: `scripts/mathtrace-workbench-ui.test.mjs`
- Modify: `scripts/demo-smoke.test.mjs`

- [ ] **Step 1: Write failing panel unit smoke**

Add to `scripts/mathtrace-workbench-ui.test.mjs` a test that imports `createMistakeBookPanelViewModel` from the new component file:

```js
const {
  createMistakeBookPanelViewModel,
} = jiti("../src/components/mistake-book-panel.tsx");

const mistakeBookViewModel = createMistakeBookPanelViewModel({
  items: [
    {
      id: "item-1",
      created_at: "2026-06-11T08:00:00.000Z",
      source: "image",
      question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论单调性。",
      knowledge_points: ["parameter_classification"],
      mistake_causes: ["classification_missing"],
      severity: "minor",
      diagnosis_summary: "遗漏分类讨论。",
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
      review_status: 0,
    },
  ],
  is_database_configured: true,
});

assert.equal(mistakeBookViewModel.items.length, 1);
assert.equal(mistakeBookViewModel.items[0].sourceLabel, "图片诊断");
assert.equal(mistakeBookViewModel.items[0].profileUpdateLabel, "具体错因");
assert.equal(mistakeBookViewModel.items[0].reviewStatusLabel, "待复习");
```

- [ ] **Step 2: Run focused test and verify RED**

Run:

```bash
node scripts/mathtrace-workbench-ui.test.mjs
```

Expected: FAIL because `mistake-book-panel.tsx` does not exist.

- [ ] **Step 3: Implement panel view model and component**

Create `src/components/mistake-book-panel.tsx`:

```tsx
import type { MistakeBookItemSummary } from "@/lib/mistake-book-client";

interface MistakeBookPanelProps {
  items: MistakeBookItemSummary[];
  isLoading: boolean;
  isDatabaseConfigured: boolean;
  errorMessage: string | null;
}

export interface MistakeBookPanelViewModel {
  items: Array<
    MistakeBookItemSummary & {
      sourceLabel: string;
      profileUpdateLabel: string;
      reviewStatusLabel: string;
    }
  >;
  emptyTitle: string;
}

export function MistakeBookPanel(props: MistakeBookPanelProps) {
  const viewModel = createMistakeBookPanelViewModel({
    items: props.items,
    is_database_configured: props.isDatabaseConfigured,
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">错题本</h2>
          <p className="mt-1 text-sm text-slate-500">
            最近确认写入的诊断记录
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {props.isDatabaseConfigured ? "Postgres" : "本地演示"}
        </span>
      </div>

      {props.isLoading ? (
        <p className="mt-4 text-sm text-slate-500">正在加载错题本...</p>
      ) : props.errorMessage ? (
        <p className="mt-4 text-sm text-amber-700">{props.errorMessage}</p>
      ) : viewModel.items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">{viewModel.emptyTitle}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {viewModel.items.map((item) => (
            <article
              key={item.id}
              className="rounded-md border border-slate-200 p-3"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{item.sourceLabel}</span>
                <span>{item.profileUpdateLabel}</span>
                <span>{item.reviewStatusLabel}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-900">
                {item.question_text}
              </p>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                {item.diagnosis_summary}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function createMistakeBookPanelViewModel(input: {
  items: MistakeBookItemSummary[];
  is_database_configured: boolean;
}): MistakeBookPanelViewModel {
  return {
    items: input.items.map((item) => ({
      ...item,
      sourceLabel: item.source === "sample" ? "样例诊断" : "图片诊断",
      profileUpdateLabel:
        item.profile_update_kind === "mistake_cause" ? "具体错因" : "考点关注",
      reviewStatusLabel: getReviewStatusLabel(item.review_status),
    })),
    emptyTitle: input.is_database_configured
      ? "还没有确认写入的错题。"
      : "未配置 Supabase 时，错题本只显示本地演示状态。",
  };
}

function getReviewStatusLabel(status: MistakeBookItemSummary["review_status"]): string {
  if (status === 1) {
    return "复习中";
  }

  if (status === 2) {
    return "已复习";
  }

  if (status === 3) {
    return "已掌握";
  }

  return "待复习";
}
```

- [ ] **Step 4: Wire panel into workbench**

In `src/components/mathtrace-workbench.tsx`:

1. Import:

```ts
import { MistakeBookPanel } from "@/components/mistake-book-panel";
import {
  requestMistakeBookItems,
  type MistakeBookItemSummary,
} from "@/lib/mistake-book-client";
```

2. Add state near existing workbench state:

```ts
const [mistakeBookItems, setMistakeBookItems] = useState<MistakeBookItemSummary[]>([]);
const [isMistakeBookLoading, setIsMistakeBookLoading] = useState(false);
const [isMistakeBookDatabaseConfigured, setIsMistakeBookDatabaseConfigured] =
  useState(false);
const [mistakeBookError, setMistakeBookError] = useState<string | null>(null);
```

3. Add loader:

```ts
async function loadMistakeBookItems(): Promise<void> {
  setIsMistakeBookLoading(true);
  setMistakeBookError(null);

  try {
    const response = await requestMistakeBookItems({
      student_id: "demo_student_001",
      limit: 5,
    });
    setMistakeBookItems(response.items);
    setIsMistakeBookDatabaseConfigured(response.is_database_configured);
  } catch {
    setMistakeBookError("错题本暂时加载失败。");
  } finally {
    setIsMistakeBookLoading(false);
  }
}
```

4. Load on mount:

```ts
useEffect(() => {
  void loadMistakeBookItems();
}, []);
```

5. After a diagnosis response is accepted and `shouldPersistDiagnoseProfile(response)` is true, call:

```ts
void loadMistakeBookItems();
```

6. Render the panel in the right-side/supporting column where profile/review content already lives:

```tsx
<MistakeBookPanel
  items={mistakeBookItems}
  isLoading={isMistakeBookLoading}
  isDatabaseConfigured={isMistakeBookDatabaseConfigured}
  errorMessage={mistakeBookError}
/>
```

- [ ] **Step 5: Run focused UI tests and smoke**

Run:

```bash
node scripts/mathtrace-workbench-ui.test.mjs
node scripts/demo-smoke.test.mjs
```

Expected: PASS.

### Task 8: Test Script Integration

**Files:**
- Modify: `package.json`
- Modify: `scripts/api-smoke.test.mjs`
- Modify: `scripts/demo-smoke.test.mjs`

- [ ] **Step 1: Add scripts to npm test**

Modify `package.json` test script so it includes:

```json
"test": "node scripts/vision-extraction-parser.test.mjs && node scripts/anthropic-compatible-provider.test.mjs && node scripts/analysis-provider.test.mjs && node scripts/diagnosis-evidence.test.mjs && node scripts/math-text-parser.test.mjs && node scripts/image-diagnosis-pipeline.test.mjs && node scripts/image-confirmation.test.mjs && node scripts/diagnose-client.test.mjs && node scripts/image-upload-client.test.mjs && node scripts/diagnosis-view-model.test.mjs && node scripts/mathtrace-workbench-ui.test.mjs && node scripts/diagnosis-persistence.test.mjs && node scripts/mistake-book-api.test.mjs && node scripts/agent-pipeline.test.mjs && node scripts/demo-state.test.mjs && npm run test:smoke"
```

- [ ] **Step 2: Extend API smoke without database dependency**

In `scripts/api-smoke.test.mjs`, add:

```js
const mistakeBookRoute = jiti("../src/app/api/mistake-book/route.ts");

const mistakeBookResponse = await mistakeBookRoute.GET(
  new Request("http://localhost/api/mistake-book?student_id=demo_student_001"),
);
const mistakeBookBody = await mistakeBookResponse.json();

assert.equal(mistakeBookResponse.status, 200);
assert.equal(mistakeBookBody.student_id, "demo_student_001");
assert.equal(Array.isArray(mistakeBookBody.items), true);
```

- [ ] **Step 3: Run complete local verification**

Run:

```bash
npm test
npm run test:eval
npm run test:smoke
npm run lint
npm run build
```

Expected: PASS.

### Task 9: Documentation Updates

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `interview/mathtrace-project-narrative.md`

- [ ] **Step 1: Update README**

Add a Supabase section:

```md
## Supabase Postgres（P1.7）

P1.7 可选接入 Supabase Postgres，用于保存 demo 学生的诊断运行、错题本条目和画像事件。前端不会直连 Supabase；`SUPABASE_SERVICE_ROLE_KEY` 只允许服务端 Route Handler 读取。

需要的服务端环境变量：

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

未配置 Supabase 时，`sample_diagnosis`、`image_diagnosis`、`/api/confirm` 和本地 smoke 测试仍可运行；错题本面板会显示空的本地演示状态。

建表 SQL 位于：

```text
supabase/migrations/20260611000000_p17_mistake_book.sql
```

不要提交 `.env*`，不要把 service role key 放到前端代码、日志、截图或文档中。
```

- [ ] **Step 2: Update PRD**

In `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`, update:

- Step 8 Confirmation and Persistence:
  - P1.7 确认后写入 `diagnosis_runs`、`mistake_book_items`、`memory_events`。
  - `image_diagnosis` extraction review 不写库。
  - `memory_delta.should_persist=false` 不写库。
  - localStorage 仍保留 demo 画像恢复。
- Long-Term Memory Model:
  - 增加 P1.7 表名和字段边界。
  - 明确不存完整图片 base64。

- [ ] **Step 3: Update Technical Roadmap**

In `docs/TECHNICAL_ROADMAP.md`, update Phase 3:

```md
### Phase 3：Supabase Postgres 数据底座与错题本 MVP

目标：确认后的诊断结果进入真实数据库，并在工作台展示只读错题本。

交付：
- `students`
- `diagnosis_runs`
- `mistake_book_items`
- `memory_events`
- `GET /api/mistake-book`
- 工作台只读错题本面板

边界：
- 固定 `demo_student_001`
- 不做登录、老师端、RAG、pgvector、Storage
- localStorage 暂时继续作为 demo 画像恢复
```

- [ ] **Step 4: Update interview narrative**

Append a new stage after P1.6a:

```md
## 13. Supabase Postgres 数据底座与错题本 MVP

### 当前状态
已完成 P1.7 本地实现和脚本验证；如果真实 Supabase live smoke 未运行，在“项目中的真实证据”里明确说明未运行原因。

### 功能价值
这个阶段把“长期记忆”从前端 localStorage 演示推进到数据库事件记录。诊断确认后，系统会保存诊断运行、错题本条目和画像变化事件，让每次掌握度变化都能追溯到具体错题和证据等级。

### 关键设计
前端不直连数据库，只调用 Next.js API；服务端用 service role key 写入 Supabase。数据库只支持 `demo_student_001`，不假装已有完整权限系统。`image_diagnosis` 抽取草稿不写库，只有确认后且 `memory_delta.should_persist=true` 才写入。

### 技术决策与取舍
我没有在这一阶段做登录、RAG、pgvector 或完整画像迁移，而是先补最能支撑“长期学习诊断系统”的数据底座。这样既能提升项目可信度，又不会破坏已有 demo 稳定性。
```

Continue the section with the existing narrative template: 性能收益、面试官可能怎么问、推荐回答、可能被继续追问、反思与后续优化、项目中的真实证据。

### Task 10: Claude Code Review, Retest, And Commit

**Files:**
- Review output: `docs/reviews/YYYY-MM-DD-p17-supabase-mistake-book-review.md`
- Do not stage review docs unless explicitly requested.

- [ ] **Step 1: Run pre-review verification**

Run:

```bash
npm test
npm run test:eval
npm run test:smoke
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 2: Prepare local Claude Code review prompt**

Use this review focus:

```text
请审查 P1.7 Supabase Postgres 数据底座 + 错题本 MVP。

重点：
- service role key 是否只在服务端读取，是否可能进入前端 bundle。
- sample_diagnosis、image_diagnosis extraction review、/api/confirm、P1.5 可信写入边界是否保持。
- memory_delta.should_persist=false、token mismatch、insufficient、submit_stuck_point 是否不会写库。
- SQL schema / RPC 是否避免半写入、是否不存完整图片 base64。
- GET /api/mistake-book 是否只支持 demo_student_001，前端是否没有直连数据库。
- 测试是否覆盖无 Supabase env、fake repository、problem_only、user_confirmed、错题本空状态。

不要审查 docs/reviews/*.md，不要要求实现登录、RAG、pgvector、老师端或完整画像迁移。
```

Write findings to `docs/reviews/YYYY-MM-DD-p17-supabase-mistake-book-review.md`.

- [ ] **Step 3: Fix review findings**

For each accepted finding:

1. Modify only related files.
2. Add or adjust a focused test.
3. Re-run the focused test.

Expected: each accepted finding has a corresponding code/test change or a written reason for not changing.

- [ ] **Step 4: Final verification**

Run:

```bash
npm test
npm run test:eval
npm run test:smoke
npm run lint
npm run build
git status --short
```

Expected:

- All verification commands pass.
- `git status --short` shows only P1.7 implementation/docs files and the local review doc.
- `docs/reviews/*.md` remains unstaged unless the user explicitly asks to commit it.

- [ ] **Step 5: Commit checkpoint**

Before staging, show the exact status:

```bash
git status --short
```

Stage only related files, for example:

```bash
git add package.json package-lock.json
git add supabase/migrations/20260611000000_p17_mistake_book.sql
git add src/lib/supabase-admin.ts src/lib/diagnosis-persistence.ts
git add src/lib/mistake-book-service.ts src/lib/mistake-book-client.ts
git add src/app/api/mistake-book/route.ts
git add src/components/mistake-book-panel.tsx src/components/mathtrace-workbench.tsx
git add src/lib/diagnose-service.ts src/lib/confirm-service.ts
git add scripts/diagnosis-persistence.test.mjs scripts/mistake-book-api.test.mjs
git add scripts/api-smoke.test.mjs scripts/demo-smoke.test.mjs scripts/mathtrace-workbench-ui.test.mjs
git add README.md docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
```

Do not run `git add .`.

Commit:

```bash
git commit -m "feat: add supabase mistake book persistence"
```

Expected: one local commit containing only P1.7 implementation and documentation changes.

---

## 4. Self-Review Checklist

- [ ] Plan covers the user-confirmed frontend read-only mistake book panel.
- [ ] Plan keeps frontend from importing Supabase or service role key.
- [ ] Plan keeps `sample_diagnosis` stable when Supabase is missing.
- [ ] Plan does not store full image base64.
- [ ] Plan does not add login, permissions UI, teacher/admin, RAG, pgvector, Storage, edit/delete, or full profile migration.
- [ ] Plan includes SQL schema, indexes, RLS, and atomic write boundary.
- [ ] Plan includes tests for no env, fake repo write, skip/no-write paths, and read API.
- [ ] Plan includes README, PRD, Roadmap, and interview narrative updates.
- [ ] Plan keeps `docs/reviews/*.md` local and unstaged by default.
