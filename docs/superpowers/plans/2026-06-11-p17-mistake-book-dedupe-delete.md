# P1.7 Mistake Book Dedupe And Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 错题本支持题目级去重和服务端删除：同一道题重复确认时不新增错题、不新增 `memory_events`，前端提示“本题已加入错题本”；用户可二次确认后删除对应错题本条目。

**Architecture:** 题目级去重由服务端计算 `question_fingerprint` 并交给 Supabase RPC 写入，数据库用 `(student_id, question_fingerprint)` 唯一索引兜底。删除走 `/api/mistake-book` 的 `DELETE` 方法，前端只传 `student_id` 和 `item_id`，service role key 仍只在服务端读取。删除 `mistake_book_items` 后，关联 `memory_events` 通过外键 cascade 删除，`diagnosis_runs` 保留为诊断审计记录。

**Tech Stack:** Next.js App Router Route Handler, TypeScript, Supabase Postgres RPC, pgcrypto, React client state, existing Node script tests.

---

## File Structure

- Modify: `src/lib/diagnosis-persistence.ts`
  - 新增题目 fingerprint 计算。
  - RPC payload 增加 `p_question_fingerprint`。
  - 持久化结果区分 `persisted` 和 `duplicate`。
- Modify: `src/lib/confirm-service.ts`
  - 将 persistence 结果转成前端 warning/notice 所需的稳定文案。
- Modify: `src/lib/diagnose-service.ts`
  - 样例诊断重复写入时同样返回“本题已加入错题本”提示，不破坏 `sample_diagnosis` 稳定路径。
- Modify: `src/lib/mistake-book-client.ts`
  - 增加 `deleteMistakeBookItem`。
  - 保持 `requestMistakeBookItems` 原有读取契约。
- Modify: `src/lib/mistake-book-service.ts`
  - 新增 `handleDeleteMistakeBookItemRequest`。
  - Repository 增加 `deleteItem`，默认通过 Supabase delete 执行。
- Modify: `src/app/api/mistake-book/route.ts`
  - 保留 `GET`。
  - 新增 `DELETE`。
- Modify: `src/components/mistake-book-panel.tsx`
  - 每条错题增加删除按钮。
  - 删除中禁用按钮。
- Modify: `src/components/mathtrace-workbench.tsx`
  - 传入删除 handler。
  - 删除成功后刷新错题本。
  - 持久化重复时显示“本题已加入错题本”。
- Create: `supabase/migrations/20260611001000_p17_mistake_book_dedupe_delete.sql`
  - 增加 `question_fingerprint` 字段。
  - 回填现有数据。
  - 清理现有重复错题，仅保留每组最早一条。
  - 增加唯一索引。
  - 更新 `persist_mathtrace_diagnosis` RPC。
  - 补充 delete 权限。
- Modify: `scripts/diagnosis-persistence.test.mjs`
  - 覆盖 fingerprint、RPC 参数、重复命中 SQL 分支、grant/delete 权限。
- Modify: `scripts/mistake-book-api.test.mjs`
  - 覆盖 DELETE API 成功、非法 student、非法 item id、未配置数据库、删除失败不泄露 secret。
- Modify: `scripts/mathtrace-workbench-ui.test.mjs`
  - 覆盖删除按钮、二次确认、删除后刷新、重复提示文案。
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - 更新 P1.7 错题本去重和删除边界。
- Modify: `interview/mathtrace-project-narrative.md`
  - 补充数据库去重、删除语义、为什么保留 `diagnosis_runs` 的面试叙事。

---

## Task 1: Persistence Result Contract And Fingerprint

**Files:**
- Modify: `src/lib/diagnosis-persistence.ts`
- Test: `scripts/diagnosis-persistence.test.mjs`

- [ ] **Step 1: Write the failing test for fingerprint and duplicate result**

Extend the `src/lib/diagnosis-persistence.ts` test import:

```js
const {
  createQuestionFingerprint,
  createDiagnosisPersistencePayload,
  createSupabaseDiagnosisPersistenceRepository,
  persistDiagnosisResponse,
} = jiti("../src/lib/diagnosis-persistence.ts");
```

Add assertions to `scripts/diagnosis-persistence.test.mjs` after the existing direct payload assertions:

```js
assert.match(
  directPayload.p_question_fingerprint,
  /^[a-f0-9]{64}$/,
  "持久化 payload 应包含 sha256 题目 fingerprint。",
);
assert.equal(
  directPayload.p_question_fingerprint,
  createQuestionFingerprint(sampleResult.body.recognized_question.question_text),
);
assert.equal(
  createQuestionFingerprint("已知函数 $f(x)=x^3 - 3ax + 1$，讨论单调性。"),
  createQuestionFingerprint(" 已知函数$f(x)=x^3-3ax+1$ 讨论单调性 "),
  "同一道题的空白和标点差异不应导致不同 fingerprint。",
);

const duplicateRpcClient = createRecordingRpcClient({
  error: null,
  data: [
    {
      diagnosis_run_id: "00000000-0000-0000-0000-000000000001",
      mistake_book_item_id: "00000000-0000-0000-0000-000000000002",
      memory_event_id: null,
      persistence_status: "duplicate",
    },
  ],
});
const duplicateRpcRepository =
  createSupabaseDiagnosisPersistenceRepository(duplicateRpcClient);
const duplicateRpcResult =
  await duplicateRpcRepository.persistDiagnosis(directPayload);

assert.deepEqual(duplicateRpcResult, { status: "duplicate" });
assert.equal(
  duplicateRpcClient.calls[0].params.p_question_fingerprint,
  directPayload.p_question_fingerprint,
);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node scripts/diagnosis-persistence.test.mjs
```

Expected: FAIL because `p_question_fingerprint` and duplicate status handling do not exist.

- [ ] **Step 3: Implement fingerprint and result status**

In `src/lib/diagnosis-persistence.ts`, import Node crypto:

```ts
import { createHash } from "node:crypto";
```

Change result type:

```ts
export type DiagnosisPersistenceResult =
  | { status: "persisted" }
  | { status: "duplicate" }
  | { status: "skipped" }
  | { status: "disabled" }
  | { status: "failed" };
```

Add to `DiagnosisPersistencePayload`:

```ts
  p_question_fingerprint: string;
```

Set it in `createDiagnosisPersistencePayload`:

```ts
    p_question_fingerprint: createQuestionFingerprint(
      response.recognized_question.question_text,
    ),
```

Update RPC client type:

```ts
export interface SupabaseDiagnosisPersistenceRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<{ data?: unknown; error: unknown }>;
}
```

Parse RPC status:

```ts
      const { data, error } = await client.rpc(
        "persist_mathtrace_diagnosis",
        toRpcParams(payload),
      );

      if (error) {
        return { status: "failed" };
      }

      return getPersistenceStatus(data);
```

Add helpers:

```ts
export function createQuestionFingerprint(questionText: string): string {
  const normalized = questionText
    .trim()
    .toLowerCase()
    .replace(/\\ln/g, "ln")
    .replace(/\\frac\s*\{\s*1\s*\}\s*\{\s*([^}]+)\s*\}/g, "1/$1")
    .replace(/[\\$`*_{}\s，。；;,.、：:（）()[\]<>]/g, "");

  return createHash("sha256").update(normalized).digest("hex");
}

function getPersistenceStatus(data: unknown): DiagnosisPersistenceResult {
  if (
    Array.isArray(data) &&
    data.some(
      (row) =>
        typeof row === "object" &&
        row !== null &&
        "persistence_status" in row &&
        row.persistence_status === "duplicate",
    )
  ) {
    return { status: "duplicate" };
  }

  return { status: "persisted" };
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
node scripts/diagnosis-persistence.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diagnosis-persistence.ts scripts/diagnosis-persistence.test.mjs
git commit -m "feat: add mistake book question fingerprint"
```

---

## Task 2: Supabase Migration For Dedupe And Delete Permission

**Files:**
- Create: `supabase/migrations/20260611001000_p17_mistake_book_dedupe_delete.sql`
- Modify: `scripts/diagnosis-persistence.test.mjs`

- [ ] **Step 1: Write the failing SQL guard test**

Add migration reads and assertions to `scripts/diagnosis-persistence.test.mjs`:

```js
const dedupeMigrationSql = readFileSync(
  new URL(
    "../supabase/migrations/20260611001000_p17_mistake_book_dedupe_delete.sql",
    import.meta.url,
  ),
  "utf8",
);

assert.equal(
  dedupeMigrationSql.includes("question_fingerprint text"),
  true,
);
assert.equal(
  dedupeMigrationSql.includes("mistake_book_items_student_question_fingerprint_idx"),
  true,
);
assert.equal(
  dedupeMigrationSql.includes("p_question_fingerprint text"),
  true,
);
assert.equal(
  dedupeMigrationSql.includes("persistence_status text"),
  true,
);
assert.equal(
  dedupeMigrationSql.includes("'duplicate'::text"),
  true,
);
assert.equal(
  dedupeMigrationSql.includes("where duplicate_items.row_number > 1"),
  true,
);
assert.equal(
  dedupeMigrationSql.includes("grant select, insert, delete on table public.mistake_book_items to service_role"),
  true,
);
assert.equal(
  dedupeMigrationSql.includes("grant select, insert, delete on table public.memory_events to service_role"),
  true,
);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node scripts/diagnosis-persistence.test.mjs
```

Expected: FAIL because the new migration file does not exist.

- [ ] **Step 3: Create migration**

Create `supabase/migrations/20260611001000_p17_mistake_book_dedupe_delete.sql`:

```sql
create extension if not exists pgcrypto;

alter table public.mistake_book_items
  add column if not exists question_fingerprint text;

update public.mistake_book_items
set question_fingerprint = encode(
  digest(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(question_text), '\\ln', 'ln', 'g'),
        '[\s$`*_{}，。；;,.、：:（）()\[\]<>\\]',
        '',
        'g'
      ),
      '\s+',
      '',
      'g'
    ),
    'sha256'
  ),
  'hex'
)
where question_fingerprint is null;

delete from public.mistake_book_items
using (
  select
    id,
    row_number() over (
      partition by student_id, question_fingerprint
      order by created_at asc, id asc
    ) as row_number
  from public.mistake_book_items
) as duplicate_items
where public.mistake_book_items.id = duplicate_items.id
  and duplicate_items.row_number > 1;

alter table public.mistake_book_items
  alter column question_fingerprint set not null;

create unique index if not exists mistake_book_items_student_question_fingerprint_idx
  on public.mistake_book_items(student_id, question_fingerprint);

drop function if exists public.persist_mathtrace_diagnosis(
  text, text, text, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  text[], text, text, text, text[], text[], text, text
);

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
  p_diagnosis_summary text,
  p_question_fingerprint text
)
returns table (
  diagnosis_run_id uuid,
  mistake_book_item_id uuid,
  memory_event_id uuid,
  persistence_status text
)
language plpgsql
set search_path = public
as $$
declare
  inserted_run_id uuid;
  inserted_item_id uuid;
  inserted_event_id uuid;
begin
  if p_student_id <> 'demo_student_001' then
    raise exception 'Only demo_student_001 is supported in P1.7';
  end if;

  if p_question_fingerprint is null or length(trim(p_question_fingerprint)) = 0 then
    raise exception 'question_fingerprint is required';
  end if;

  if coalesce(p_memory_delta -> 'should_persist', 'false'::jsonb) <> 'true'::jsonb then
    raise exception 'memory_delta.should_persist must be true';
  end if;

  if p_profile_update_kind not in ('mistake_cause', 'problem_type_focus') then
    raise exception 'profile_update_kind must be persistable';
  end if;

  if p_source = 'sample' then
    if not (
      p_evidence_level is null
      and p_persistence_evidence = 'student_work'
      and p_profile_update_kind = 'mistake_cause'
    ) then
      raise exception 'Invalid sample diagnosis persistence policy';
    end if;
  elsif p_source = 'image' then
    if not (
      (
        p_evidence_level = 'student_work_sufficient'
        and p_persistence_evidence = 'student_work'
        and p_profile_update_kind = 'mistake_cause'
      )
      or (
        p_evidence_level = 'problem_only'
        and p_persistence_evidence = 'uploaded_problem_only'
        and p_profile_update_kind = 'problem_type_focus'
      )
      or (
        p_evidence_level = 'problem_only'
        and p_persistence_evidence = 'user_confirmed'
        and p_profile_update_kind = 'mistake_cause'
      )
    ) then
      raise exception 'Invalid image diagnosis persistence policy';
    end if;
  else
    raise exception 'Invalid diagnosis source';
  end if;

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
    coalesce(p_warnings, '{}'::text[])
  )
  on conflict (student_id, client_diagnosis_id) do nothing
  returning id into inserted_run_id;

  if inserted_run_id is null then
    select id
    into inserted_run_id
    from public.diagnosis_runs
    where student_id = p_student_id
      and client_diagnosis_id = p_client_diagnosis_id;
  end if;

  select id
  into inserted_item_id
  from public.mistake_book_items
  where student_id = p_student_id
    and question_fingerprint = p_question_fingerprint
  order by created_at asc, id asc
  limit 1;

  if inserted_item_id is not null then
    return query select inserted_run_id, inserted_item_id, null::uuid, 'duplicate'::text;
    return;
  end if;

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
    profile_update_kind,
    question_fingerprint
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
    p_profile_update_kind,
    p_question_fingerprint
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
    p_profile_update_kind,
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

  return query select inserted_run_id, inserted_item_id, inserted_event_id, 'persisted'::text;
end;
$$;

revoke execute on function public.persist_mathtrace_diagnosis(
  text, text, text, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  text[], text, text, text, text[], text[], text, text, text
) from public, anon, authenticated;

grant execute on function public.persist_mathtrace_diagnosis(
  text, text, text, text, text, text, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  text[], text, text, text, text[], text[], text, text, text
) to service_role;

grant select, insert, delete on table public.mistake_book_items to service_role;
grant select, insert, delete on table public.memory_events to service_role;
```

- [ ] **Step 4: Run focused test**

Run:

```bash
node scripts/diagnosis-persistence.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260611001000_p17_mistake_book_dedupe_delete.sql scripts/diagnosis-persistence.test.mjs
git commit -m "feat: enforce mistake book dedupe in postgres"
```

---

## Task 3: Duplicate Notice In API Responses

**Files:**
- Modify: `src/lib/diagnosis-persistence.ts`
- Modify: `src/lib/confirm-service.ts`
- Modify: `src/lib/diagnose-service.ts`
- Test: `scripts/diagnosis-persistence.test.mjs`

- [ ] **Step 1: Write failing tests for duplicate warning**

In `scripts/diagnosis-persistence.test.mjs`, create a repository:

```js
function createDuplicateRepository() {
  return {
    calls: [],
    async persistDiagnosis(payload) {
      this.calls.push(payload);
      return { status: "duplicate" };
    },
  };
}
```

Add assertions for sample and confirmed image diagnosis:

```js
const duplicateSampleRepository = createDuplicateRepository();
const duplicateSampleResult = await handleDiagnoseRequest(samplePayload, {
  persistence_repository: duplicateSampleRepository,
});

assert.equal(duplicateSampleResult.status, 200);
assert.equal(
  duplicateSampleResult.body.warnings.includes("本题已加入错题本。"),
  true,
);

const duplicateConfirmRepository = createDuplicateRepository();
const duplicateConfirmResult = await handleConfirmRequest(
  createConfirmPayload(studentWorkExtraction),
  { persistence_repository: duplicateConfirmRepository },
);

assert.equal(duplicateConfirmResult.status, 200);
assert.equal(
  duplicateConfirmResult.body.warnings.includes("本题已加入错题本。"),
  true,
);
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
node scripts/diagnosis-persistence.test.mjs
```

Expected: FAIL because duplicate persistence result is not converted to a user-visible warning.

- [ ] **Step 3: Implement duplicate warning**

In `src/lib/diagnosis-persistence.ts`, export:

```ts
export const DUPLICATE_MISTAKE_BOOK_ITEM_WARNING = "本题已加入错题本。";
```

In `src/lib/confirm-service.ts` and `src/lib/diagnose-service.ts`, wherever persistence result is appended to response warnings:

```ts
if (persistenceResult.status === "duplicate") {
  return appendWarning(response, DUPLICATE_MISTAKE_BOOK_ITEM_WARNING);
}
```

Keep existing behavior:

```ts
if (persistenceResult.status === "failed") {
  return appendWarning(response, DATABASE_WRITE_FAILED_WARNING);
}
```

If there is no shared `appendWarning` helper, add a local immutable update:

```ts
{
  ...response,
  warnings: [...response.warnings, DUPLICATE_MISTAKE_BOOK_ITEM_WARNING],
}
```

- [ ] **Step 4: Run focused test**

Run:

```bash
node scripts/diagnosis-persistence.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/diagnosis-persistence.ts src/lib/confirm-service.ts src/lib/diagnose-service.ts scripts/diagnosis-persistence.test.mjs
git commit -m "feat: show duplicate mistake book notice"
```

---

## Task 4: DELETE API For Mistake Book Items

**Files:**
- Modify: `src/lib/mistake-book-service.ts`
- Modify: `src/app/api/mistake-book/route.ts`
- Modify: `src/lib/mistake-book-client.ts`
- Test: `scripts/mistake-book-api.test.mjs`

- [ ] **Step 1: Write failing service and route tests**

In `scripts/mistake-book-api.test.mjs`, extend imports:

```js
const {
  DATABASE_DELETE_FAILED_WARNING,
  DATABASE_READ_FAILED_WARNING,
  DATABASE_READ_NOT_CONFIGURED_WARNING,
  createDisabledMistakeBookRepository,
  createSupabaseMistakeBookRepository,
  handleDeleteMistakeBookItemRequest,
  handleMistakeBookRequest,
} = jiti("../src/lib/mistake-book-service.ts");
const {
  deleteMistakeBookItem,
  isMistakeBookResponse,
  requestMistakeBookItems,
} = jiti("../src/lib/mistake-book-client.ts");
const { DELETE, GET } = jiti("../src/app/api/mistake-book/route.ts");
```

Add tests:

```js
const deleteRepository = createDeleteRecordingRepository({ deleted: true });
const deleteResult = await handleDeleteMistakeBookItemRequest(
  {
    student_id: "demo_student_001",
    item_id: "00000000-0000-0000-0000-000000000001",
  },
  { repository: deleteRepository },
);

assert.equal(deleteResult.status, 200);
assert.deepEqual(deleteResult.body, {
  student_id: "demo_student_001",
  deleted: true,
  warnings: [],
});
assert.deepEqual(deleteRepository.deleteCalls[0], {
  student_id: "demo_student_001",
  item_id: "00000000-0000-0000-0000-000000000001",
});

const invalidDeleteStudentResult = await handleDeleteMistakeBookItemRequest(
  {
    student_id: "student_002",
    item_id: "00000000-0000-0000-0000-000000000001",
  },
  { repository: deleteRepository },
);
assert.equal(invalidDeleteStudentResult.status, 400);
assert.equal(invalidDeleteStudentResult.body.error.code, "invalid_request");

const invalidDeleteIdResult = await handleDeleteMistakeBookItemRequest(
  {
    student_id: "demo_student_001",
    item_id: "not-a-uuid",
  },
  { repository: deleteRepository },
);
assert.equal(invalidDeleteIdResult.status, 400);
assert.equal(invalidDeleteIdResult.body.error.code, "invalid_request");

const disabledDeleteResult = await handleDeleteMistakeBookItemRequest(
  {
    student_id: "demo_student_001",
    item_id: "00000000-0000-0000-0000-000000000001",
  },
  { repository: createDisabledMistakeBookRepository() },
);
assert.equal(disabledDeleteResult.status, 200);
assert.deepEqual(disabledDeleteResult.body, {
  student_id: "demo_student_001",
  deleted: false,
  warnings: [DATABASE_READ_NOT_CONFIGURED_WARNING],
});

const failingDeleteResult = await handleDeleteMistakeBookItemRequest(
  {
    student_id: "demo_student_001",
    item_id: "00000000-0000-0000-0000-000000000001",
  },
  { repository: createDeleteFailingRepository() },
);
assert.equal(failingDeleteResult.status, 200);
assert.deepEqual(failingDeleteResult.body, {
  student_id: "demo_student_001",
  deleted: false,
  warnings: [DATABASE_DELETE_FAILED_WARNING],
});
assert.equal(JSON.stringify(failingDeleteResult.body).includes("secret"), false);

const deleteRouteResponse = await DELETE(
  new Request("http://localhost/api/mistake-book", {
    method: "DELETE",
    body: JSON.stringify({
      student_id: "demo_student_001",
      item_id: "00000000-0000-0000-0000-000000000001",
    }),
    headers: { "Content-Type": "application/json" },
  }),
);
assert.equal(deleteRouteResponse.status, 200);
```

Add client test:

```js
const deleteClientRequests = [];
const deleteClientResult = await deleteMistakeBookItem({
  fetcher: async (url, init) => {
    deleteClientRequests.push({ url, init });
    return new Response(
      JSON.stringify({
        student_id: "demo_student_001",
        deleted: true,
        warnings: [],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  },
  student_id: "demo_student_001",
  item_id: "00000000-0000-0000-0000-000000000001",
});

assert.deepEqual(deleteClientResult, {
  student_id: "demo_student_001",
  deleted: true,
  warnings: [],
});
assert.equal(deleteClientRequests[0].url, "/api/mistake-book");
assert.equal(deleteClientRequests[0].init.method, "DELETE");
assert.equal(deleteClientRequests[0].init.headers["Content-Type"], "application/json");
assert.equal(
  deleteClientRequests[0].init.body,
  JSON.stringify({
    student_id: "demo_student_001",
    item_id: "00000000-0000-0000-0000-000000000001",
  }),
);
```

Add helpers at the bottom:

```js
function createDeleteRecordingRepository(result) {
  return {
    is_database_configured: true,
    deleteCalls: [],
    async listRecentItems() {
      return [];
    },
    async deleteItem(input) {
      this.deleteCalls.push(input);
      return result;
    },
  };
}

function createDeleteFailingRepository() {
  return {
    is_database_configured: true,
    async listRecentItems() {
      return [];
    },
    async deleteItem() {
      throw new Error("secret delete failure");
    },
  };
}
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
node scripts/mistake-book-api.test.mjs
```

Expected: FAIL because delete service/client/route do not exist.

- [ ] **Step 3: Implement service contract**

In `src/lib/mistake-book-service.ts`, add:

```ts
export const DATABASE_DELETE_FAILED_WARNING = "错题删除失败，请稍后重试。";

export type MistakeBookDeleteApiResponse =
  | {
      student_id: typeof DEMO_STUDENT_ID;
      deleted: boolean;
      warnings: string[];
    }
  | MistakeBookErrorResponse;
```

Extend repository:

```ts
export interface MistakeBookRepository {
  is_database_configured: boolean;
  listRecentItems(input: {
    student_id: typeof DEMO_STUDENT_ID;
    limit: number;
  }): Promise<MistakeBookItemSummary[]>;
  deleteItem(input: {
    student_id: typeof DEMO_STUDENT_ID;
    item_id: string;
  }): Promise<{ deleted: boolean }>;
}
```

Add handler:

```ts
export async function handleDeleteMistakeBookItemRequest(
  payload: unknown,
  options: {
    repository?: MistakeBookRepository;
  } = {},
): Promise<{ status: number; body: MistakeBookDeleteApiResponse }> {
  const parsedRequest = parseDeleteMistakeBookItemRequest(payload);
  if (!parsedRequest.ok) {
    return { status: 400, body: parsedRequest.response };
  }

  try {
    const repository = options.repository ?? createDefaultMistakeBookRepository();
    if (!repository.is_database_configured) {
      return {
        status: 200,
        body: {
          student_id: DEMO_STUDENT_ID,
          deleted: false,
          warnings: [DATABASE_READ_NOT_CONFIGURED_WARNING],
        },
      };
    }

    const result = await repository.deleteItem(parsedRequest.value);
    return {
      status: 200,
      body: {
        student_id: DEMO_STUDENT_ID,
        deleted: result.deleted,
        warnings: [],
      },
    };
  } catch {
    return {
      status: 200,
      body: {
        student_id: DEMO_STUDENT_ID,
        deleted: false,
        warnings: [DATABASE_DELETE_FAILED_WARNING],
      },
    };
  }
}
```

Add parser:

```ts
function parseDeleteMistakeBookItemRequest(payload: unknown):
  | {
      ok: true;
      value: { student_id: typeof DEMO_STUDENT_ID; item_id: string };
    }
  | { ok: false; response: MistakeBookErrorResponse } {
  if (!isRecord(payload)) {
    return invalidRequest("请求体不是合法错题删除参数。");
  }

  if (payload.student_id !== DEMO_STUDENT_ID) {
    return invalidRequest("只支持 demo_student_001 的错题本。");
  }

  if (typeof payload.item_id !== "string" || !isUuid(payload.item_id)) {
    return invalidRequest("item_id 必须是合法 UUID。");
  }

  return {
    ok: true,
    value: {
      student_id: DEMO_STUDENT_ID,
      item_id: payload.item_id,
    },
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
```

Import `isRecord` from `@/lib/utils`.

Add delete implementation to disabled repository:

```ts
    async deleteItem() {
      return { deleted: false };
    },
```

Extend Supabase client interface with `delete().eq().eq().select().maybeSingle()` or use `delete().match()`. Implement:

```ts
      const { data, error } = await client
        .from("mistake_book_items")
        .delete()
        .eq("student_id", input.student_id)
        .eq("id", input.item_id)
        .select("id")
        .maybeSingle();

      if (error) {
        throw new Error("mistake book delete failed");
      }

      return { deleted: data !== null };
```

- [ ] **Step 4: Implement route**

In `src/app/api/mistake-book/route.ts`, add:

```ts
import { handleDeleteMistakeBookItemRequest } from "@/lib/mistake-book-service";
import type {
  MistakeBookApiResponse,
  MistakeBookDeleteApiResponse,
} from "@/lib/mistake-book-service";
```

Add:

```ts
export async function DELETE(
  request: Request,
): Promise<NextResponse<MistakeBookDeleteApiResponse>> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const result = await handleDeleteMistakeBookItemRequest(payload);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 5: Implement client helper**

In `src/lib/mistake-book-client.ts`, add:

```ts
export interface MistakeBookDeleteResponse {
  student_id: "demo_student_001";
  deleted: boolean;
  warnings: string[];
}

export async function deleteMistakeBookItem(input: {
  fetcher: typeof fetch;
  student_id: string;
  item_id: string;
}): Promise<MistakeBookDeleteResponse> {
  let response: Response;

  try {
    response = await input.fetcher("/api/mistake-book", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: input.student_id,
        item_id: input.item_id,
      }),
    });
  } catch {
    throw new Error("错题删除失败，请稍后重试。");
  }

  const responseBody = await readJsonResponse(response);
  if (!response.ok || !isMistakeBookDeleteResponse(responseBody)) {
    throw new Error("错题删除失败，请稍后重试。");
  }

  return responseBody;
}

function isMistakeBookDeleteResponse(
  value: unknown,
): value is MistakeBookDeleteResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.student_id === "demo_student_001" &&
    typeof value.deleted === "boolean" &&
    isStringArray(value.warnings)
  );
}
```

- [ ] **Step 6: Run focused test**

Run:

```bash
node scripts/mistake-book-api.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mistake-book-service.ts src/app/api/mistake-book/route.ts src/lib/mistake-book-client.ts scripts/mistake-book-api.test.mjs
git commit -m "feat: add mistake book delete api"
```

---

## Task 5: Frontend Delete Button And Duplicate Notice

**Files:**
- Modify: `src/components/mistake-book-panel.tsx`
- Modify: `src/components/mathtrace-workbench.tsx`
- Modify: `src/lib/mistake-book-client.ts`
- Test: `scripts/mathtrace-workbench-ui.test.mjs`

- [ ] **Step 1: Write failing UI guard tests**

Add assertions to `scripts/mathtrace-workbench-ui.test.mjs`:

```js
assert.equal(
  panelSource.includes("删除错题"),
  true,
  "错题本每条记录应提供删除按钮。",
);
assert.equal(
  panelSource.includes("onDeleteItem"),
  true,
  "错题本删除动作应由工作台注入，不能在展示组件里直连数据库。",
);
assert.equal(
  source.includes("window.confirm(\"确认删除这道错题吗？删除后将从错题本移除。\")"),
  true,
  "删除错题前必须有二次确认。",
);
assert.equal(
  source.includes("deleteMistakeBookItem"),
  true,
  "工作台应通过错题本 client helper 调用服务端删除 API。",
);
assert.equal(
  source.includes("本题已加入错题本。"),
  true,
  "重复确认同一道题时前端应展示稳定提示文案。",
);
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
node scripts/mathtrace-workbench-ui.test.mjs
```

Expected: FAIL because delete UI and duplicate notice handling do not exist.

- [ ] **Step 3: Update MistakeBookPanel props**

In `src/components/mistake-book-panel.tsx`, extend props:

```ts
interface MistakeBookPanelProps {
  status: MistakeBookPanelStatus;
  response: MistakeBookResponse | null;
  errorMessage: string | null;
  deletingItemId: string | null;
  onDeleteItem: (itemId: string) => void;
}
```

In item header, add button:

```tsx
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  disabled={deletingItemId === item.id}
                  className="rounded-full border border-[var(--light-gray)] px-3 py-1 text-xs font-medium text-[var(--warm-gray)] transition hover:border-[var(--mocha-light)] hover:text-[var(--mocha-dark)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingItemId === item.id ? "删除中" : "删除错题"}
                </button>
```

Keep the date label before the delete button or move it after badges:

```tsx
                <span className="ml-auto text-xs text-[var(--warm-gray)]">
                  {item.createdAtLabel}
                </span>
```

- [ ] **Step 4: Update workbench delete handler**

In `src/components/mathtrace-workbench.tsx`, import:

```ts
import {
  deleteMistakeBookItem,
  requestMistakeBookItems,
} from "@/lib/mistake-book-client";
```

Add state:

```ts
  const [deletingMistakeBookItemId, setDeletingMistakeBookItemId] = useState<
    string | null
  >(null);
```

Add handler:

```ts
  async function handleDeleteMistakeBookItem(itemId: string): Promise<void> {
    if (
      !window.confirm("确认删除这道错题吗？删除后将从错题本移除。")
    ) {
      return;
    }

    setDeletingMistakeBookItemId(itemId);
    setMistakeBookErrorMessage(null);

    try {
      const response = await deleteMistakeBookItem({
        fetcher: window.fetch.bind(window),
        student_id: "demo_student_001",
        item_id: itemId,
      });

      if (response.warnings.length > 0) {
        setMistakeBookErrorMessage(response.warnings[0]);
      }

      await refreshMistakeBook();
    } catch (error) {
      setMistakeBookErrorMessage(
        error instanceof Error ? error.message : "错题删除失败，请稍后重试。",
      );
    } finally {
      setDeletingMistakeBookItemId(null);
    }
  }
```

Pass props:

```tsx
          <MistakeBookPanel
            status={mistakeBookStatus}
            response={mistakeBookResponse}
            errorMessage={mistakeBookErrorMessage}
            deletingItemId={deletingMistakeBookItemId}
            onDeleteItem={(itemId) => {
              void handleDeleteMistakeBookItem(itemId);
            }}
          />
```

- [ ] **Step 5: Surface duplicate warning in existing notice path**

If response warnings are already shown near the report, keep that path. If not, add after diagnosis response:

```ts
      if (diagnosis.warnings.includes("本题已加入错题本。")) {
        setRetainedReportNotice("本题已加入错题本。");
      } else {
        setRetainedReportNotice(null);
      }
```

Do this for both sample diagnosis and confirmed image diagnosis after the API response is received.

- [ ] **Step 6: Run focused test**

Run:

```bash
node scripts/mathtrace-workbench-ui.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/mistake-book-panel.tsx src/components/mathtrace-workbench.tsx scripts/mathtrace-workbench-ui.test.mjs
git commit -m "feat: add mistake book delete controls"
```

---

## Task 6: Documentation And Interview Narrative

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `interview/mathtrace-project-narrative.md`

- [ ] **Step 1: Update PRD**

Add a P1.7 note:

```md
#### P1.7 错题本去重与删除

- 错题本按 `student_id + question_fingerprint` 去重，同一道题重复确认时不新增 `mistake_book_items`。
- 重复题命中时不新增 `memory_events`，避免重复确认污染画像变化记录。
- 重复题不是失败路径，前端展示“本题已加入错题本。”。
- 用户可在错题本条目上点击“删除错题”，二次确认后调用服务端 API 删除数据库中的 `mistake_book_items`。
- 删除错题本条目会通过外键 cascade 删除关联 `memory_events`，但保留 `diagnosis_runs` 作为诊断审计记录。
- 前端不直连 Supabase，service role key 只允许服务端使用。
```

- [ ] **Step 2: Update interview narrative**

In `interview/mathtrace-project-narrative.md`, add a subsection under the P1.7 stage:

```md
### 错题本去重与删除

我在 P1.7 后半段补了错题本的两个真实产品边界：题目级去重和用户删除。去重没有只依赖诊断 ID，因为同一张图重复上传会产生新的诊断运行；我改为在服务端基于题干生成 `question_fingerprint`，并在 Postgres 里用 `(student_id, question_fingerprint)` 唯一索引兜底。

删除功能走服务端 API，不让前端直接访问 Supabase。删除的是错题本条目，关联的 memory event 通过外键 cascade 清理，但诊断运行记录保留为审计历史。这个取舍能区分“我不想把这题放进复习清单”和“这次诊断从未发生过”。
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md interview/mathtrace-project-narrative.md
git commit -m "docs: record mistake book dedupe and delete design"
```

---

## Task 7: Full Verification And Browser Check

**Files:**
- No code changes expected.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected:

- `npm test`: all script tests pass, including smoke tests.
- `npm run lint`: no ESLint errors.
- `npm run build`: Next.js build succeeds.

- [ ] **Step 2: Apply migration to live Supabase manually**

Open Supabase SQL Editor and run:

```sql
-- copy the full contents of:
-- supabase/migrations/20260611001000_p17_mistake_book_dedupe_delete.sql
```

Expected: `Success. No rows returned`.

- [ ] **Step 3: Restart local dev server**

Run:

```bash
npm run dev
```

Expected: app starts on `http://127.0.0.1:3000/`.

- [ ] **Step 4: Browser verify duplicate behavior**

Manual steps:

1. Open `http://127.0.0.1:3000/`.
2. Confirm or upload a problem that is already in the mistake book.
3. Click “确认写入画像”.
4. Observe notice: `本题已加入错题本。`
5. Observe mistake book count does not increase.
6. Query Supabase:

```sql
select question_fingerprint, count(*)
from public.mistake_book_items
where student_id = 'demo_student_001'
group by question_fingerprint
having count(*) > 1;
```

Expected: zero rows.

- [ ] **Step 5: Browser verify delete behavior**

Manual steps:

1. Click `删除错题`.
2. Cancel the confirmation dialog.
3. Verify the item remains.
4. Click `删除错题` again.
5. Confirm the dialog.
6. Verify the item disappears after refresh.
7. Query Supabase:

```sql
select id
from public.mistake_book_items
where id = '<deleted item uuid>';
```

Expected: zero rows.

- [ ] **Step 6: Final status check**

Run:

```bash
git status --short --branch
git log --oneline --decorate -5
```

Expected:

- Only intentionally untracked local planning/review docs remain, if any.
- No `.env*` files are staged.
- `docs/reviews/*.md` remain untracked unless the user explicitly asks to commit them.

---

## Self-Review

- Spec coverage: plan covers duplicate detection, no duplicate `memory_events`, user-visible duplicate notice, delete API, second confirmation, DB permission, tests, docs, and browser verification.
- Placeholder scan: no `TBD`, `TODO`, or vague “add tests” steps remain.
- Type consistency: `question_fingerprint`, `p_question_fingerprint`, `persistence_status`, `deleteMistakeBookItem`, and `handleDeleteMistakeBookItemRequest` are consistently named across tasks.
- Scope check: no login, teacher role, RAG, pgvector, auth/RLS policy expansion, or full profile migration included.
