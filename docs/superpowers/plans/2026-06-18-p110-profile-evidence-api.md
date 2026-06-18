# P1.10 Profile Evidence API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If using subagents, set each subagent's reasoning effort to high.

**Goal:** Build a safe `GET /api/student-profile/evidence` summary API and let the workbench use real `memory_events` evidence for profile recommendations when available.

**Architecture:** Keep `/api/student-profile` focused on the current profile snapshot. Add a separate evidence service that reads recent `memory_events`, returns only bounded summary fields, and falls back without breaking the demo. The frontend fetches evidence best-effort in the workbench container and passes it as optional data into the existing pure `ProfileInsights` view model.

**Tech Stack:** Next.js App Router, TypeScript, React client component, Supabase admin client behind persistence layer, existing script-based Node tests with `jiti`.

## Global Constraints

- Do not modify database tables or migrations.
- Do not modify `memory_delta` schema or student profile projection rules.
- Keep `demo_student_001` as the only supported student id.
- Do not add login, teacher UI, true multi-user support, RLS user policy, RAG, pgvector, or Milvus.
- Do not return full `memory_delta`, `diagnosis_runs`, question text, student answer, standard answer, image content, or raw model output from the evidence API.
- Frontend must not import Supabase, persistence modules, service role keys, or server-only environment variables.
- `ProfileInsights` must not fetch; fetch evidence in `src/components/mathtrace-workbench.tsx`.
- `profile-view-model.ts` must remain browser-safe and pure.
- Preserve `sample_diagnosis`, mistake book, current cloud profile read, localStorage fallback, and database-not-configured demo paths.
- Keep `docs/reviews/*.md` local-only unless the user explicitly asks to commit one.

---

## File Structure

- Create `src/lib/student-profile/student-profile-evidence-service.ts`
  - Owns evidence response types, warnings, student/limit parsing, fallback responses, and aggregation from recent event rows.
- Modify `src/lib/persistence/student-profile-persistence.ts`
  - Adds `ProfileEvidenceEvent` and `StudentProfileEvidenceRepository`.
  - Extends the Supabase repository with `listProfileEvidenceEvents(student_id, limit)`.
  - Keeps existing projection/read methods unchanged.
- Create `src/app/api/student-profile/evidence/route.ts`
  - Thin GET route that delegates to `handleStudentProfileEvidenceRequest`.
- Create `src/lib/student-profile/student-profile-evidence-client.ts`
  - Browser-safe fetch helper and strict response guard.
- Modify `src/components/workbench/profile-view-model.ts`
  - Adds optional `evidence` input and uses it for recommendation bullets when useful.
- Modify `src/components/workbench/profile-insights.tsx`
  - Accepts optional `evidence` prop and passes it into the view model.
- Modify `src/components/mathtrace-workbench.tsx`
  - Owns evidence state, best-effort refresh, reset invalidation, and post-persist/delete refresh.
- Modify tests:
  - `scripts/tests/persistence/student-profile-persistence.test.mjs`
  - `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - `scripts/tests/architecture/architecture-boundaries.test.mjs` only if existing boundaries do not already catch the new imports.
- Modify docs after implementation:
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `interview/mathtrace-project-narrative.md`

---

### Task 1: Backend Evidence Repository And Service

**Files:**
- Create: `src/lib/student-profile/student-profile-evidence-service.ts`
- Modify: `src/lib/persistence/student-profile-persistence.ts`
- Test: `scripts/tests/persistence/student-profile-persistence.test.mjs`

**Interfaces:**
- Consumes:
  - `DEMO_STUDENT_ID` from `src/lib/persistence/student-profile-persistence.ts`
  - `createDefaultStudentProfileRepository()`
  - `isRecord` from `src/lib/shared/utils`
- Produces:
  - `ProfileEvidenceEvent`
  - `StudentProfileEvidenceRepository`
  - `StudentProfileEvidenceResponse`
  - `handleStudentProfileEvidenceRequest(searchParams, repository?)`
  - `createStudentProfileEvidenceSummary(events)`
  - `PROFILE_EVIDENCE_READ_NOT_CONFIGURED_WARNING`
  - `PROFILE_EVIDENCE_READ_FAILED_WARNING`
  - `PROFILE_EVIDENCE_NOT_FOUND_WARNING`

- [ ] **Step 1: Add failing persistence/service tests**

Add these imports near the existing student-profile service imports in `scripts/tests/persistence/student-profile-persistence.test.mjs`:

```js
const {
  createStudentProfileEvidenceSummary,
  handleStudentProfileEvidenceRequest,
  PROFILE_EVIDENCE_NOT_FOUND_WARNING,
  PROFILE_EVIDENCE_READ_FAILED_WARNING,
  PROFILE_EVIDENCE_READ_NOT_CONFIGURED_WARNING,
} = jiti("./src/lib/student-profile/student-profile-evidence-service.ts");
```

Add these test blocks before `console.log("student profile persistence tests passed");`:

```js
{
  const result = await handleStudentProfileEvidenceRequest(
    new URLSearchParams("student_id=student_002"),
    createEvidenceRepository([]),
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "invalid_request");
  assert.equal(result.body.error.recoverable, true);
}
{
  const result = await handleStudentProfileEvidenceRequest(
    new URLSearchParams("student_id=demo_student_001"),
    {
      is_database_configured: false,
      async listProfileEvidenceEvents() {
        throw new Error("should not query disabled repository");
      },
    },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    student_id: "demo_student_001",
    source: "fallback",
    is_database_configured: false,
    evidence: null,
    warnings: [PROFILE_EVIDENCE_READ_NOT_CONFIGURED_WARNING],
  });
}
{
  const result = await handleStudentProfileEvidenceRequest(
    new URLSearchParams("student_id=demo_student_001"),
    createEvidenceRepository([]),
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    student_id: "demo_student_001",
    source: "fallback",
    is_database_configured: true,
    evidence: null,
    warnings: [PROFILE_EVIDENCE_NOT_FOUND_WARNING],
  });
}
{
  const result = await handleStudentProfileEvidenceRequest(
    new URLSearchParams("student_id=demo_student_001"),
    createFailingEvidenceRepository(),
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    student_id: "demo_student_001",
    source: "fallback",
    is_database_configured: true,
    evidence: null,
    warnings: [PROFILE_EVIDENCE_READ_FAILED_WARNING],
  });
  assert.equal(JSON.stringify(result.body).includes("service role"), false);
}
{
  const calls = [];
  const events = createEvidenceEvents();
  const result = await handleStudentProfileEvidenceRequest(
    new URLSearchParams("student_id=demo_student_001&limit=2"),
    {
      is_database_configured: true,
      async listProfileEvidenceEvents(studentId, limit) {
        calls.push([studentId, limit]);
        return events;
      },
    },
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.source, "cloud");
  assert.equal(result.body.evidence.event_count, 3);
  assert.equal(result.body.evidence.latest_event_at, "2026-06-18T10:00:00.000Z");
  assert.deepEqual(result.body.evidence.top_knowledge_focus[0], {
    id: "parameter_classification",
    event_count: 2,
    total_weakness_delta: 8,
    latest_event_at: "2026-06-18T10:00:00.000Z",
  });
  assert.deepEqual(result.body.evidence.top_mistake_causes[0], {
    id: "classification_missing",
    event_count: 2,
    total_delta: 3,
    latest_event_at: "2026-06-18T10:00:00.000Z",
  });
  assert.deepEqual(calls, [["demo_student_001", 2]]);
  assert.equal(JSON.stringify(result.body).includes("memory_delta"), false);
  assert.equal(JSON.stringify(result.body).includes("question_text"), false);
}
{
  const summary = createStudentProfileEvidenceSummary([
    {
      id: "event-empty",
      created_at: "2026-06-18T10:00:00.000Z",
      event_type: "mistake_cause",
      knowledge_mastery_changes: { parameter_classification: Number.NaN },
      mistake_cause_changes: { classification_missing: Infinity },
      review_priority_changes: ["function_monotonicity"],
      rationale: "  这是一段很长的解释文本，用于确认服务端会截断过长 rationale，避免把过长模型文本直接透传到前端展示区域。  ",
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
    },
  ]);

  assert.equal(summary.event_count, 1);
  assert.deepEqual(summary.top_knowledge_focus[0], {
    id: "function_monotonicity",
    event_count: 1,
    total_weakness_delta: 0,
    latest_event_at: "2026-06-18T10:00:00.000Z",
  });
  assert.deepEqual(summary.top_mistake_causes, []);
  assert.equal(summary.recent_events[0].rationale_summary.length <= 80, true);
}
{
  const calls = [];
  const repository = createSupabaseStudentProfileRepository(
    createFakeStudentProfileClient({
      calls,
      listRows: createEvidenceEvents(),
      resolveMemoryEventsWithLimit: true,
    }),
  );

  const rows = await repository.listProfileEvidenceEvents("demo_student_001", 8);

  assert.equal(rows.length, 3);
  assert.deepEqual(calls, [
    ["from", "memory_events"],
    [
      "select",
      "id, created_at, event_type, knowledge_mastery_changes, mistake_cause_changes, review_priority_changes, rationale, evidence_level, persistence_evidence, profile_update_kind",
    ],
    ["eq", "student_id", "demo_student_001"],
    ["order", "created_at", { ascending: false }],
    ["order", "id", { ascending: false }],
    ["limit", 8],
  ]);
}
```

Add these helper functions near the existing repository helpers:

```js
function createEvidenceRepository(events) {
  return {
    is_database_configured: true,
    async listProfileEvidenceEvents(studentId, limit) {
      assert.equal(studentId, "demo_student_001");
      assert.equal(Number.isInteger(limit), true);
      return events;
    },
  };
}

function createFailingEvidenceRepository() {
  return {
    is_database_configured: true,
    async listProfileEvidenceEvents() {
      throw new Error("service role key leaked");
    },
  };
}

function createEvidenceEvents() {
  return [
    {
      id: "event-3",
      created_at: "2026-06-18T10:00:00.000Z",
      event_type: "mistake_cause",
      knowledge_mastery_changes: { parameter_classification: -3 },
      mistake_cause_changes: { classification_missing: 2 },
      review_priority_changes: ["parameter_classification"],
      rationale: "系统把参数分类讨论提升为复习优先级第一位。",
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
    },
    {
      id: "event-2",
      created_at: "2026-06-18T09:00:00.000Z",
      event_type: "problem_type_focus",
      knowledge_mastery_changes: { derivative_monotonicity: -5 },
      mistake_cause_changes: { domain_missing: 1 },
      review_priority_changes: ["derivative_monotonicity"],
      rationale: "",
      evidence_level: "problem_only",
      persistence_evidence: "uploaded_problem_only",
      profile_update_kind: "problem_type_focus",
    },
    {
      id: "event-1",
      created_at: "2026-06-18T08:00:00.000Z",
      event_type: "mistake_cause",
      knowledge_mastery_changes: { parameter_classification: -5 },
      mistake_cause_changes: { classification_missing: 1 },
      review_priority_changes: ["parameter_classification"],
      rationale: "系统只能指出这道题错在分类讨论。",
      evidence_level: null,
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
    },
  ];
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/tests/persistence/student-profile-persistence.test.mjs
```

Expected: fails because `student-profile-evidence-service.ts` and `listProfileEvidenceEvents` do not exist.

- [ ] **Step 3: Add repository interfaces and Supabase method**

In `src/lib/persistence/student-profile-persistence.ts`, add:

```ts
export interface ProfileEvidenceEvent {
  id: string;
  created_at: string;
  event_type: "mistake_cause" | "problem_type_focus";
  knowledge_mastery_changes: Record<string, number>;
  mistake_cause_changes: Record<string, number>;
  review_priority_changes: string[];
  rationale: string;
  evidence_level: string | null;
  persistence_evidence: string | null;
  profile_update_kind: string;
}

export interface StudentProfileEvidenceRepository {
  is_database_configured: boolean;
  listProfileEvidenceEvents(
    student_id: string,
    limit: number,
  ): Promise<ProfileEvidenceEvent[]>;
}
```

Change `createDefaultStudentProfileRepository()` and `createSupabaseStudentProfileRepository()` return types to also include `StudentProfileEvidenceRepository`.

Extend `SupabaseMemoryEventsOrderQuery` with:

```ts
limit(count: number): PromiseLike<{ data: unknown; error: unknown }>;
```

Add method inside `createSupabaseStudentProfileRepository`:

```ts
async listProfileEvidenceEvents(student_id, limit) {
  const { data, error } = await client
    .from("memory_events")
    .select(
      "id, created_at, event_type, knowledge_mastery_changes, mistake_cause_changes, review_priority_changes, rationale, evidence_level, persistence_evidence, profile_update_kind",
    )
    .eq("student_id", student_id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  if (!Array.isArray(data)) {
    throw new Error("Expected memory_events evidence query to return an array.");
  }

  return data.map(toProfileEvidenceEvent);
},
```

Add disabled repository method:

```ts
async listProfileEvidenceEvents() {
  return [];
},
```

Add helper:

```ts
function toProfileEvidenceEvent(row: unknown): ProfileEvidenceEvent {
  if (
    !isRecord(row) ||
    typeof row.id !== "string" ||
    typeof row.created_at !== "string" ||
    (row.event_type !== "mistake_cause" &&
      row.event_type !== "problem_type_focus") ||
    !isFiniteNumberRecord(row.knowledge_mastery_changes) ||
    !isFiniteNumberRecord(row.mistake_cause_changes) ||
    !isStringArray(row.review_priority_changes) ||
    typeof row.rationale !== "string" ||
    !isNullableString(row.evidence_level) ||
    !isNullableString(row.persistence_evidence) ||
    typeof row.profile_update_kind !== "string"
  ) {
    throw new Error("Expected memory_events evidence row to match evidence summary shape.");
  }

  return {
    id: row.id,
    created_at: row.created_at,
    event_type: row.event_type,
    knowledge_mastery_changes: row.knowledge_mastery_changes,
    mistake_cause_changes: row.mistake_cause_changes,
    review_priority_changes: row.review_priority_changes,
    rationale: row.rationale,
    evidence_level: row.evidence_level,
    persistence_evidence: row.persistence_evidence,
    profile_update_kind: row.profile_update_kind,
  };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
```

If `isFiniteNumberRecord` and `isStringArray` are private to `student-profile-service.ts`, copy the small helpers into persistence because this is external DB row validation, not profile projection logic.

- [ ] **Step 4: Add evidence service**

Create `src/lib/student-profile/student-profile-evidence-service.ts`:

```ts
import {
  createDefaultStudentProfileRepository,
  DEMO_STUDENT_ID,
  type ProfileEvidenceEvent,
  type StudentProfileEvidenceRepository,
} from "@/lib/persistence/student-profile-persistence";

export const PROFILE_EVIDENCE_READ_NOT_CONFIGURED_WARNING =
  "数据库暂未配置，继续使用本地 demo 画像依据。";
export const PROFILE_EVIDENCE_READ_FAILED_WARNING =
  "云端画像证据暂时读取失败，继续使用本地 demo 画像依据。";
export const PROFILE_EVIDENCE_NOT_FOUND_WARNING =
  "云端画像证据暂未生成，继续使用本地 demo 画像依据。";

const DEFAULT_EVIDENCE_LIMIT = 8;
const MIN_EVIDENCE_LIMIT = 1;
const MAX_EVIDENCE_LIMIT = 20;
const MAX_SUMMARY_ITEMS = 5;
const MAX_RATIONALE_SUMMARY_LENGTH = 80;

export interface KnowledgeEvidenceSummary {
  id: string;
  event_count: number;
  total_weakness_delta: number;
  latest_event_at: string;
}

export interface MistakeCauseEvidenceSummary {
  id: string;
  event_count: number;
  total_delta: number;
  latest_event_at: string;
}

export interface RecentProfileEvidenceEvent {
  id: string;
  created_at: string;
  event_type: "mistake_cause" | "problem_type_focus";
  evidence_level: string | null;
  persistence_evidence: string | null;
  knowledge_focus: string[];
  mistake_causes: string[];
  rationale_summary: string;
}

export interface StudentProfileEvidenceSummary {
  event_count: number;
  latest_event_at: string | null;
  top_knowledge_focus: KnowledgeEvidenceSummary[];
  top_mistake_causes: MistakeCauseEvidenceSummary[];
  recent_events: RecentProfileEvidenceEvent[];
}

export interface StudentProfileEvidenceResponse {
  student_id: string;
  source: "cloud" | "fallback";
  is_database_configured: boolean;
  evidence: StudentProfileEvidenceSummary | null;
  warnings: string[];
}

export interface StudentProfileEvidenceErrorResponse {
  error: {
    code: "invalid_request";
    message: string;
    recoverable: true;
  };
}

export interface StudentProfileEvidenceRequestResult {
  status: number;
  body: StudentProfileEvidenceResponse | StudentProfileEvidenceErrorResponse;
}

export async function handleStudentProfileEvidenceRequest(
  searchParams: URLSearchParams | Record<string, string | undefined>,
  repository: StudentProfileEvidenceRepository = createDefaultStudentProfileRepository(),
): Promise<StudentProfileEvidenceRequestResult> {
  const student_id = getSearchParam(searchParams, "student_id") ?? DEMO_STUDENT_ID;
  if (student_id !== DEMO_STUDENT_ID) {
    return {
      status: 400,
      body: {
        error: {
          code: "invalid_request",
          message: "当前 demo 只支持 demo_student_001。",
          recoverable: true,
        },
      },
    };
  }

  if (!repository.is_database_configured) {
    return fallbackEvidenceResponse(false, PROFILE_EVIDENCE_READ_NOT_CONFIGURED_WARNING);
  }

  try {
    const limit = parseEvidenceLimit(getSearchParam(searchParams, "limit"));
    const events = await repository.listProfileEvidenceEvents(student_id, limit);
    if (events.length === 0) {
      return fallbackEvidenceResponse(true, PROFILE_EVIDENCE_NOT_FOUND_WARNING);
    }

    return {
      status: 200,
      body: {
        student_id,
        source: "cloud",
        is_database_configured: true,
        evidence: createStudentProfileEvidenceSummary(events),
        warnings: [],
      },
    };
  } catch {
    return fallbackEvidenceResponse(true, PROFILE_EVIDENCE_READ_FAILED_WARNING);
  }
}

export function createStudentProfileEvidenceSummary(
  events: ProfileEvidenceEvent[],
): StudentProfileEvidenceSummary {
  const sortedEvents = [...events].sort(compareEventsDesc);

  return {
    event_count: sortedEvents.length,
    latest_event_at: sortedEvents[0]?.created_at ?? null,
    top_knowledge_focus: createKnowledgeEvidenceSummary(sortedEvents),
    top_mistake_causes: createMistakeCauseEvidenceSummary(sortedEvents),
    recent_events: sortedEvents.map(toRecentProfileEvidenceEvent),
  };
}

function createKnowledgeEvidenceSummary(
  events: ProfileEvidenceEvent[],
): KnowledgeEvidenceSummary[] {
  const byId = new Map<string, KnowledgeEvidenceSummary>();

  for (const event of events) {
    const ids = uniqueStrings([
      ...Object.keys(event.knowledge_mastery_changes),
      ...event.review_priority_changes,
    ]);

    for (const id of ids) {
      const masteryDelta = event.knowledge_mastery_changes[id] ?? 0;
      const weaknessDelta = Number.isFinite(masteryDelta)
        ? Math.max(0, -masteryDelta)
        : 0;
      const existing = byId.get(id);

      if (existing) {
        existing.event_count += 1;
        existing.total_weakness_delta += weaknessDelta;
        if (event.created_at > existing.latest_event_at) {
          existing.latest_event_at = event.created_at;
        }
      } else {
        byId.set(id, {
          id,
          event_count: 1,
          total_weakness_delta: weaknessDelta,
          latest_event_at: event.created_at,
        });
      }
    }
  }

  return [...byId.values()]
    .sort(compareKnowledgeEvidence)
    .slice(0, MAX_SUMMARY_ITEMS);
}

function createMistakeCauseEvidenceSummary(
  events: ProfileEvidenceEvent[],
): MistakeCauseEvidenceSummary[] {
  const byId = new Map<string, MistakeCauseEvidenceSummary>();

  for (const event of events) {
    for (const [id, rawDelta] of Object.entries(event.mistake_cause_changes)) {
      if (!Number.isFinite(rawDelta) || rawDelta <= 0) {
        continue;
      }

      const existing = byId.get(id);
      if (existing) {
        existing.event_count += 1;
        existing.total_delta += rawDelta;
        if (event.created_at > existing.latest_event_at) {
          existing.latest_event_at = event.created_at;
        }
      } else {
        byId.set(id, {
          id,
          event_count: 1,
          total_delta: rawDelta,
          latest_event_at: event.created_at,
        });
      }
    }
  }

  return [...byId.values()]
    .sort(compareMistakeCauseEvidence)
    .slice(0, MAX_SUMMARY_ITEMS);
}

function toRecentProfileEvidenceEvent(
  event: ProfileEvidenceEvent,
): RecentProfileEvidenceEvent {
  return {
    id: event.id,
    created_at: event.created_at,
    event_type: event.event_type,
    evidence_level: event.evidence_level,
    persistence_evidence: event.persistence_evidence,
    knowledge_focus: uniqueStrings([
      ...Object.keys(event.knowledge_mastery_changes),
      ...event.review_priority_changes,
    ]),
    mistake_causes: Object.entries(event.mistake_cause_changes)
      .filter(([, delta]) => Number.isFinite(delta) && delta > 0)
      .map(([id]) => id),
    rationale_summary: summarizeRationale(event.rationale),
  };
}

function summarizeRationale(rationale: string): string {
  const trimmedRationale = rationale.trim();
  if (trimmedRationale.length === 0) {
    return "本次诊断产生了可写入画像的薄弱证据。";
  }

  return trimmedRationale.slice(0, MAX_RATIONALE_SUMMARY_LENGTH);
}

function parseEvidenceLimit(value: string | undefined): number {
  if (!value) {
    return DEFAULT_EVIDENCE_LIMIT;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return DEFAULT_EVIDENCE_LIMIT;
  }

  if (parsed < MIN_EVIDENCE_LIMIT || parsed > MAX_EVIDENCE_LIMIT) {
    return DEFAULT_EVIDENCE_LIMIT;
  }

  return parsed;
}

function fallbackEvidenceResponse(
  is_database_configured: boolean,
  warning: string,
): StudentProfileEvidenceRequestResult {
  return {
    status: 200,
    body: {
      student_id: DEMO_STUDENT_ID,
      source: "fallback",
      is_database_configured,
      evidence: null,
      warnings: [warning],
    },
  };
}

function getSearchParam(
  searchParams: URLSearchParams | Record<string, string | undefined>,
  key: string,
): string | undefined {
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get(key) ?? undefined;
  }

  return searchParams[key];
}

function compareEventsDesc(
  left: ProfileEvidenceEvent,
  right: ProfileEvidenceEvent,
): number {
  return (
    right.created_at.localeCompare(left.created_at) ||
    right.id.localeCompare(left.id)
  );
}

function compareKnowledgeEvidence(
  left: KnowledgeEvidenceSummary,
  right: KnowledgeEvidenceSummary,
): number {
  return (
    right.total_weakness_delta - left.total_weakness_delta ||
    right.event_count - left.event_count ||
    right.latest_event_at.localeCompare(left.latest_event_at)
  );
}

function compareMistakeCauseEvidence(
  left: MistakeCauseEvidenceSummary,
  right: MistakeCauseEvidenceSummary,
): number {
  return (
    right.total_delta - left.total_delta ||
    right.event_count - left.event_count ||
    right.latest_event_at.localeCompare(left.latest_event_at)
  );
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, allValues) => {
    return value.length > 0 && allValues.indexOf(value) === index;
  });
}
```

- [ ] **Step 5: Update fake Supabase client for projection and evidence queries**

In `createFakeStudentProfileClient`, change the signature:

```js
function createFakeStudentProfileClient({
  calls,
  listRows,
  readRow = null,
  resolveMemoryEventsWithLimit = false,
}) {
```

Then update the `memory_events` builder:

```js
order(column, options) {
  calls.push(["order", column, options]);
  builder.orderCount += 1;

  if (builder.orderCount === 2) {
    if (!resolveMemoryEventsWithLimit) {
      return { data: listRows, error: null };
    }

    return {
      limit(count) {
        calls.push(["limit", count]);
        return { data: listRows, error: null };
      },
    };
  }

  return builder;
},
```

This keeps existing `listMemoryEvents` projection tests on the old two-order query shape while allowing the new evidence query to assert the final `.limit(8)` call.

- [ ] **Step 6: Run task test**

Run:

```bash
node scripts/tests/persistence/student-profile-persistence.test.mjs
```

Expected: `student profile persistence tests passed`.

- [ ] **Step 7: Commit Task 1**

Before committing, verify exact files:

```bash
git status --short
git diff --name-only
```

Stage only:

```bash
git add src/lib/student-profile/student-profile-evidence-service.ts src/lib/persistence/student-profile-persistence.ts scripts/tests/persistence/student-profile-persistence.test.mjs
git commit -m "feat: add student profile evidence service"
```

---

### Task 2: Evidence API Route And Browser Client Guard

**Files:**
- Create: `src/app/api/student-profile/evidence/route.ts`
- Create: `src/lib/student-profile/student-profile-evidence-client.ts`
- Test: `scripts/tests/persistence/student-profile-persistence.test.mjs`

**Interfaces:**
- Consumes:
  - `handleStudentProfileEvidenceRequest(searchParams, repository?)`
  - `StudentProfileEvidenceResponse`
- Produces:
  - `GET(request: Request): Promise<NextResponse>`
  - `requestStudentProfileEvidence(options?): Promise<StudentProfileEvidenceClientResponse>`

- [ ] **Step 1: Add failing client tests**

Add import:

```js
const { requestStudentProfileEvidence } = jiti(
  "./src/lib/student-profile/student-profile-evidence-client.ts",
);
```

Add tests before `console.log`:

```js
{
  const requests = [];
  const result = await requestStudentProfileEvidence({
    fetcher: async (url, init) => {
      requests.push({ url, init });

      return new Response(
        JSON.stringify({
          student_id: "demo_student_001",
          source: "cloud",
          is_database_configured: true,
          evidence: createExpectedEvidenceSummary(),
          warnings: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
    student_id: "demo_student_001",
    limit: 8,
  });

  assert.equal(result.source, "cloud");
  assert.equal(result.evidence.top_knowledge_focus[0].id, "parameter_classification");
  assert.equal(
    requests[0].url,
    "/api/student-profile/evidence?student_id=demo_student_001&limit=8",
  );
  assert.deepEqual(requests[0].init, { method: "GET", cache: "no-store" });
}
{
  const result = await requestStudentProfileEvidence({
    fetcher: async () =>
      new Response(
        JSON.stringify({
          student_id: "demo_student_001",
          source: "fallback",
          is_database_configured: false,
          evidence: null,
          warnings: [PROFILE_EVIDENCE_READ_NOT_CONFIGURED_WARNING],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
  });

  assert.equal(result.evidence, null);
  assert.equal(result.source, "fallback");
}
await assert.rejects(
  () =>
    requestStudentProfileEvidence({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            student_id: "demo_student_001",
            source: "cloud",
            is_database_configured: true,
            evidence: createExpectedEvidenceSummary(),
            warnings: [],
            memory_delta: {},
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    }),
  /云端画像证据响应格式无效。/,
);
await assert.rejects(
  () =>
    requestStudentProfileEvidence({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            student_id: "demo_student_001",
            source: "cloud",
            is_database_configured: true,
            evidence: {
              ...createExpectedEvidenceSummary(),
              recent_events: [
                {
                  ...createExpectedEvidenceSummary().recent_events[0],
                  question_text: "should not pass",
                },
              ],
            },
            warnings: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
    }),
  /云端画像证据响应格式无效。/,
);
await assert.rejects(
  () =>
    requestStudentProfileEvidence({
      fetcher: async () =>
        new Response(JSON.stringify({ error: { code: "invalid_request" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      student_id: "student_002",
    }),
  /云端画像证据暂时读取失败。/,
);
```

Add helper:

```js
function createExpectedEvidenceSummary() {
  return {
    event_count: 3,
    latest_event_at: "2026-06-18T10:00:00.000Z",
    top_knowledge_focus: [
      {
        id: "parameter_classification",
        event_count: 2,
        total_weakness_delta: 8,
        latest_event_at: "2026-06-18T10:00:00.000Z",
      },
    ],
    top_mistake_causes: [
      {
        id: "classification_missing",
        event_count: 2,
        total_delta: 3,
        latest_event_at: "2026-06-18T10:00:00.000Z",
      },
    ],
    recent_events: [
      {
        id: "event-3",
        created_at: "2026-06-18T10:00:00.000Z",
        event_type: "mistake_cause",
        evidence_level: "student_work_sufficient",
        persistence_evidence: "student_work",
        knowledge_focus: ["parameter_classification"],
        mistake_causes: ["classification_missing"],
        rationale_summary: "系统把参数分类讨论提升为复习优先级第一位。",
      },
    ],
  };
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/tests/persistence/student-profile-persistence.test.mjs
```

Expected: fails because `student-profile-evidence-client.ts` does not exist.

- [ ] **Step 3: Add API route**

Create `src/app/api/student-profile/evidence/route.ts`:

```ts
import { NextResponse } from "next/server";
import { handleStudentProfileEvidenceRequest } from "@/lib/student-profile/student-profile-evidence-service";

export async function GET(request: Request): Promise<NextResponse> {
  const result = await handleStudentProfileEvidenceRequest(
    new URL(request.url).searchParams,
  );

  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 4: Add browser-safe client helper**

Create `src/lib/student-profile/student-profile-evidence-client.ts`:

```ts
import { isRecord } from "@/lib/shared/utils";
import type {
  StudentProfileEvidenceResponse,
  StudentProfileEvidenceSummary,
} from "@/lib/student-profile/student-profile-evidence-service";

const DEMO_STUDENT_ID = "demo_student_001";
const DEFAULT_EVIDENCE_LIMIT = 8;

export type StudentProfileEvidenceClientResponse =
  StudentProfileEvidenceResponse;

export interface RequestStudentProfileEvidenceOptions {
  fetcher?: typeof fetch;
  student_id?: string;
  limit?: number;
}

export async function requestStudentProfileEvidence(
  options: RequestStudentProfileEvidenceOptions = {},
): Promise<StudentProfileEvidenceClientResponse> {
  const fetcher = options.fetcher ?? fetch;
  const studentId = options.student_id ?? DEMO_STUDENT_ID;
  const limit = options.limit ?? DEFAULT_EVIDENCE_LIMIT;
  let response: Response;

  try {
    response = await fetcher(
      `/api/student-profile/evidence?student_id=${encodeURIComponent(
        studentId,
      )}&limit=${encodeURIComponent(String(limit))}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );
  } catch {
    throw new Error("云端画像证据暂时读取失败。");
  }

  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error("云端画像证据暂时读取失败。");
  }

  if (!isStudentProfileEvidenceClientResponse(responseBody)) {
    throw new Error("云端画像证据响应格式无效。");
  }

  return responseBody;
}

function isStudentProfileEvidenceClientResponse(
  value: unknown,
): value is StudentProfileEvidenceClientResponse {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "student_id",
    "source",
    "is_database_configured",
    "evidence",
    "warnings",
  ])) {
    return false;
  }

  return (
    typeof value.student_id === "string" &&
    (value.source === "cloud" || value.source === "fallback") &&
    typeof value.is_database_configured === "boolean" &&
    (value.evidence === null || isStudentProfileEvidenceSummary(value.evidence)) &&
    isStringArray(value.warnings)
  );
}

function isStudentProfileEvidenceSummary(
  value: unknown,
): value is StudentProfileEvidenceSummary {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "event_count",
    "latest_event_at",
    "top_knowledge_focus",
    "top_mistake_causes",
    "recent_events",
  ])) {
    return false;
  }

  return (
    typeof value.event_count === "number" &&
    Number.isInteger(value.event_count) &&
    value.event_count >= 0 &&
    (value.latest_event_at === null || typeof value.latest_event_at === "string") &&
    Array.isArray(value.top_knowledge_focus) &&
    value.top_knowledge_focus.every(isKnowledgeEvidenceSummary) &&
    Array.isArray(value.top_mistake_causes) &&
    value.top_mistake_causes.every(isMistakeCauseEvidenceSummary) &&
    Array.isArray(value.recent_events) &&
    value.recent_events.every(isRecentProfileEvidenceEvent)
  );
}

function isKnowledgeEvidenceSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "id",
      "event_count",
      "total_weakness_delta",
      "latest_event_at",
    ]) &&
    typeof value.id === "string" &&
    isNonNegativeInteger(value.event_count) &&
    isFiniteNonNegativeNumber(value.total_weakness_delta) &&
    typeof value.latest_event_at === "string"
  );
}

function isMistakeCauseEvidenceSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "event_count", "total_delta", "latest_event_at"]) &&
    typeof value.id === "string" &&
    isNonNegativeInteger(value.event_count) &&
    isFiniteNonNegativeNumber(value.total_delta) &&
    typeof value.latest_event_at === "string"
  );
}

function isRecentProfileEvidenceEvent(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "id",
      "created_at",
      "event_type",
      "evidence_level",
      "persistence_evidence",
      "knowledge_focus",
      "mistake_causes",
      "rationale_summary",
    ]) &&
    typeof value.id === "string" &&
    typeof value.created_at === "string" &&
    (value.event_type === "mistake_cause" ||
      value.event_type === "problem_type_focus") &&
    (value.evidence_level === null || typeof value.evidence_level === "string") &&
    (value.persistence_evidence === null ||
      typeof value.persistence_evidence === "string") &&
    isStringArray(value.knowledge_focus) &&
    isStringArray(value.mistake_causes) &&
    typeof value.rationale_summary === "string"
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Run task test**

Run:

```bash
node scripts/tests/persistence/student-profile-persistence.test.mjs
```

Expected: `student profile persistence tests passed`.

- [ ] **Step 6: Commit Task 2**

```bash
git status --short
git add src/app/api/student-profile/evidence/route.ts src/lib/student-profile/student-profile-evidence-client.ts scripts/tests/persistence/student-profile-persistence.test.mjs
git commit -m "feat: add student profile evidence api client"
```

---

### Task 3: Workbench Evidence Integration And Recommendation View Model

**Files:**
- Modify: `src/components/mathtrace-workbench.tsx`
- Modify: `src/components/workbench/profile-view-model.ts`
- Modify: `src/components/workbench/profile-insights.tsx`
- Test: `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`

**Interfaces:**
- Consumes:
  - `requestStudentProfileEvidence()` from Task 2.
  - `StudentProfileEvidenceSummary` type from service/client.
- Produces:
  - `CreateProfileInsightsViewModelInput.evidence?: StudentProfileEvidenceSummary | null`
  - `ProfileInsights` prop `evidence?: StudentProfileEvidenceSummary | null`

- [ ] **Step 1: Add failing UI tests**

Add to imports in `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`:

```js
const { requestStudentProfileEvidence } = jiti(
  "./src/lib/student-profile/student-profile-evidence-client.ts",
);
```

Add these assertions after the existing `profileInsights` assertions:

```js
const evidenceBackedProfileInsights = createProfileInsightsViewModel({
  diagnosis: derivativeDiagnosis,
  beforeProfile: demoStudentProfile,
  afterProfile: afterDerivativeProfile,
  mistakeHistoryLength: 8,
  evidence: {
    event_count: 3,
    latest_event_at: "2026-06-18T10:00:00.000Z",
    top_knowledge_focus: [
      {
        id: "parameter_classification",
        event_count: 2,
        total_weakness_delta: 8,
        latest_event_at: "2026-06-18T10:00:00.000Z",
      },
    ],
    top_mistake_causes: [
      {
        id: "classification_missing",
        event_count: 2,
        total_delta: 3,
        latest_event_at: "2026-06-18T10:00:00.000Z",
      },
    ],
    recent_events: [
      {
        id: "event-3",
        created_at: "2026-06-18T10:00:00.000Z",
        event_type: "mistake_cause",
        evidence_level: "student_work_sufficient",
        persistence_evidence: "student_work",
        knowledge_focus: ["parameter_classification"],
        mistake_causes: ["classification_missing"],
        rationale_summary: "系统把参数分类讨论提升为复习优先级第一位。",
      },
    ],
  },
});
assert.match(
  evidenceBackedProfileInsights.recommendation.bullets.join("\n"),
  /最近 3 条画像事件中，参数分类讨论出现 2 次薄弱证据/,
);
assert.match(
  evidenceBackedProfileInsights.recommendation.bullets.join("\n"),
  /分类讨论遗漏.*最近事件中新增 3 次/,
);
assert.equal(
  evidenceBackedProfileInsights.recommendation.bullets.some((bullet) =>
    bullet.includes("完整历史"),
  ),
  false,
);
```

Add source-boundary assertions near existing cloud profile assertions:

```js
assert.match(
  source,
  /import \{ requestStudentProfileEvidence \} from "@\/lib\/student-profile\/student-profile-evidence-client";/,
  "工作台应从 browser-safe HTTP client 读取云端画像证据。",
);
assert.match(
  source,
  /const \[studentProfileEvidence, setStudentProfileEvidence\]/,
  "工作台应持有 evidence state 并作为可选输入传给画像展示。",
);
assert.match(
  source,
  /const studentProfileEvidenceRefreshRequestIdRef = useRef\(0\);/,
  "云端 evidence 刷新应使用 request id ref 防止旧请求覆盖新状态。",
);
assert.match(
  source,
  /const evidence = await requestStudentProfileEvidence\(\);/,
  "工作台应 best-effort 请求画像证据摘要。",
);
assert.match(
  source,
  /setStudentProfileEvidence\(evidence\.evidence\);/,
  "工作台只应把响应里的 evidence 摘要传给 UI。",
);
assert.match(
  source,
  /<ProfileInsights[\s\S]*evidence=\{studentProfileEvidence\}/,
  "ProfileInsights 应接收 workbench 传入的 evidence，而不是自己 fetch。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("requestStudentProfileEvidence"),
  false,
  "ProfileInsights 不能直接请求 evidence API。",
);
```

- [ ] **Step 2: Run UI test to verify it fails**

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
```

Expected: fails because view model does not accept `evidence` and workbench does not request it.

- [ ] **Step 3: Update view model recommendation logic**

In `src/components/workbench/profile-view-model.ts`, import types:

```ts
import type {
  MistakeCauseEvidenceSummary,
  StudentProfileEvidenceSummary,
} from "@/lib/student-profile/student-profile-evidence-service";
```

Extend input:

```ts
export interface CreateProfileInsightsViewModelInput {
  diagnosis: DiagnosisViewModel;
  beforeProfile: StudentProfile;
  afterProfile: StudentProfile | null;
  mistakeHistoryLength: number;
  evidence?: StudentProfileEvidenceSummary | null;
}
```

Change return:

```ts
recommendation: createRecommendation(
  actionTarget,
  highlightedMistakeCauses,
  input.evidence ?? null,
),
```

Replace `createRecommendation` signature:

```ts
function createRecommendation(
  actionTarget: KnowledgePriorityRow | null,
  highlightedMistakeCauses: MistakeCauseInsight[],
  evidence: StudentProfileEvidenceSummary | null,
): RecommendationView {
  if (!actionTarget) {
    return {
      title: "推荐依据",
      bullets: ["本次没有新增可写入的画像变化，建议先完成当前错题订正。"],
    };
  }

  const evidenceBullets = createEvidenceRecommendationBullets(
    actionTarget,
    highlightedMistakeCauses,
    evidence,
  );
  if (evidenceBullets.length > 0) {
    return {
      title: `为什么优先复习${stripFrequency(actionTarget.name)}？`,
      bullets: evidenceBullets,
    };
  }

  const bullets = [
    `当前薄弱指数 ${actionTarget.weaknessIndex}，状态为“${actionTarget.status.label}”。`,
  ];

  if (actionTarget.weaknessDelta > 0) {
    bullets.push(`本次诊断使薄弱指数上升 ${actionTarget.weaknessDelta}。`);
  } else {
    bullets.push("本次没有继续推高该知识点薄弱指数。");
  }

  const newCause = highlightedMistakeCauses.find(
    (cause) => cause.isNewInDiagnosis,
  );
  if (newCause) {
    bullets.push(
      `相关错因“${newCause.title}”本次新增，累计 ${newCause.nextCount} 次。`,
    );
  } else {
    bullets.push("当前建议来自画像快照和本次知识点变化。");
  }

  return {
    title: `为什么优先复习${stripFrequency(actionTarget.name)}？`,
    bullets,
  };
}
```

Add helper:

```ts
interface MatchedCauseEvidence {
  cause: MistakeCauseInsight;
  evidence: MistakeCauseEvidenceSummary;
}

function createEvidenceRecommendationBullets(
  actionTarget: KnowledgePriorityRow,
  highlightedMistakeCauses: MistakeCauseInsight[],
  evidence: StudentProfileEvidenceSummary | null,
): string[] {
  if (!evidence) {
    return [];
  }

  const bullets: string[] = [];
  const matchingKnowledge = evidence.top_knowledge_focus.find(
    (item) => item.id === actionTarget.id,
  );

  if (matchingKnowledge) {
    bullets.push(
      `最近 ${evidence.event_count} 条画像事件中，${stripFrequency(
        actionTarget.name,
      )}出现 ${matchingKnowledge.event_count} 次薄弱证据。`,
    );
  }

  const matchingCause = highlightedMistakeCauses
    .map((cause) => ({
      cause,
      evidence: evidence.top_mistake_causes.find((item) => item.id === cause.id),
    }))
    .find((item): item is MatchedCauseEvidence => item.evidence !== undefined);

  if (matchingCause) {
    bullets.push(
      `相关错因“${matchingCause.cause.title}”在最近事件中新增 ${matchingCause.evidence.total_delta} 次。`,
    );
  }

  if (bullets.length > 0) {
    bullets.push(
      `当前薄弱指数 ${actionTarget.weaknessIndex}，状态为“${actionTarget.status.label}”。`,
    );
  }

  return bullets;
}
```

- [ ] **Step 4: Pass evidence through ProfileInsights**

In `src/components/workbench/profile-insights.tsx`, import type:

```ts
import type { StudentProfileEvidenceSummary } from "@/lib/student-profile/student-profile-evidence-service";
```

Add prop:

```ts
evidence,
}: {
  diagnosis: DiagnosisViewModel;
  beforeProfile: StudentProfile;
  afterProfile: StudentProfile | null;
  evidence?: StudentProfileEvidenceSummary | null;
  onResetProfile: () => void;
  isResetDisabled: boolean;
}): ReactElement {
```

Pass into view model:

```ts
const viewModel = createProfileInsightsViewModel({
  diagnosis,
  beforeProfile,
  afterProfile,
  mistakeHistoryLength: mistakeHistory.length,
  evidence: evidence ?? null,
});
```

- [ ] **Step 5: Fetch evidence in workbench**

In `src/components/mathtrace-workbench.tsx`, add import:

```ts
import { requestStudentProfileEvidence } from "@/lib/student-profile/student-profile-evidence-client";
import type { StudentProfileEvidenceSummary } from "@/lib/student-profile/student-profile-evidence-service";
```

Add state/ref near cloud profile state:

```ts
const [studentProfileEvidence, setStudentProfileEvidence] =
  useState<StudentProfileEvidenceSummary | null>(null);
const studentProfileEvidenceRefreshRequestIdRef = useRef(0);
```

Add callback:

```ts
const refreshStudentProfileEvidence = useCallback(async (): Promise<void> => {
  if (!hasHydrated) {
    return;
  }

  const evidenceRefreshRequestId =
    ++studentProfileEvidenceRefreshRequestIdRef.current;

  try {
    const evidence = await requestStudentProfileEvidence();
    if (
      evidenceRefreshRequestId !==
      studentProfileEvidenceRefreshRequestIdRef.current
    ) {
      return;
    }

    setStudentProfileEvidence(evidence.evidence);
  } catch {
    // Demo fallback remains the P1.9 local recommendation rationale.
  }
}, [hasHydrated]);
```

Add hydration effect next to cloud profile effect:

```ts
useEffect(() => {
  if (!hasHydrated) {
    return;
  }

  const timeoutId = window.setTimeout(() => {
    void refreshStudentProfileEvidence();
  }, 0);

  return () => window.clearTimeout(timeoutId);
}, [hasHydrated, refreshStudentProfileEvidence]);
```

In reset handler, add:

```ts
studentProfileEvidenceRefreshRequestIdRef.current += 1;
setStudentProfileEvidence(null);
```

After successful diagnosis persistence refresh points where code already calls `await refreshCloudStudentProfile();`, also call:

```ts
await refreshStudentProfileEvidence();
```

After mistake book delete success, where cloud profile refresh happens on `profile_sync_status === "synced"`, also call:

```ts
await refreshStudentProfileEvidence();
```

Pass prop:

```tsx
<ProfileInsights
  diagnosis={diagnosisView}
  beforeProfile={visibleProfilePreview.beforeProfile}
  afterProfile={visibleProfilePreview.afterProfile}
  evidence={studentProfileEvidence}
  onResetProfile={handleResetProfile}
  isResetDisabled={isDiagnosing}
/>
```

- [ ] **Step 6: Run task tests**

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
npm run lint
```

Expected:

- `mathtrace workbench UI regression test passed`
- `eslint` exits 0

- [ ] **Step 7: Commit Task 3**

```bash
git status --short
git add src/components/mathtrace-workbench.tsx src/components/workbench/profile-view-model.ts src/components/workbench/profile-insights.tsx scripts/tests/ui/mathtrace-workbench-ui.test.mjs
git commit -m "feat: use profile evidence in recommendations"
```

---

### Task 4: Docs, Boundary Checks, And Full Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `interview/mathtrace-project-narrative.md`
- Modify if needed: `scripts/tests/architecture/architecture-boundaries.test.mjs`

**Interfaces:**
- Consumes:
  - P1.10 API and frontend behavior from Tasks 1-3.
- Produces:
  - PRD text that documents evidence API scope.
  - Interview narrative section that describes the feature without overstating it as RAG or full history.

- [ ] **Step 1: Add failing or confirming architecture checks**

Inspect whether existing architecture tests already catch forbidden imports:

```bash
node scripts/tests/architecture/architecture-boundaries.test.mjs
```

If it passes and does not assert evidence-specific boundaries, add these checks near existing frontend/persistence boundary checks:

```js
for (const [filePath, source] of sourceByFilePath.entries()) {
  if (!filePath.startsWith("src/components/")) {
    continue;
  }

  assert.equal(
    source.includes("@/lib/persistence/"),
    false,
    `${filePath} must not import persistence modules.`,
  );
  assert.equal(
    source.includes("createSupabaseAdminClient"),
    false,
    `${filePath} must not import Supabase admin client.`,
  );
}
```

Run:

```bash
node scripts/tests/architecture/architecture-boundaries.test.mjs
```

Expected: architecture boundaries test passes.

- [ ] **Step 2: Run focused implementation tests**

Run:

```bash
node scripts/tests/persistence/student-profile-persistence.test.mjs
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
node scripts/tests/architecture/architecture-boundaries.test.mjs
```

Expected:

- `student profile persistence tests passed`
- `mathtrace workbench UI regression test passed`
- architecture test exits 0

- [ ] **Step 3: Run full verification**

Run:

```bash
npm test
npm run test:smoke
npm run lint
npm run build
```

Expected:

- `npm test` exits 0 and includes smoke.
- `npm run test:smoke` prints `api smoke test passed` and `demo smoke test passed`.
- `npm run lint` exits 0.
- `npm run build` exits 0.

- [ ] **Step 4: Update PRD**

In `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`, update the P1.8/P1.9 database-memory section with P1.10 text:

```md
P1.10 在 P1.8/P1.9 之上新增 profile evidence API：`GET /api/student-profile/evidence?student_id=demo_student_001&limit=8`。该接口只在服务端读取最近 `memory_events`，返回知识点薄弱证据、错因新增证据和最近事件摘要，不返回完整 `memory_delta`、题目正文、学生答案、标准答案、完整 `diagnosis_runs` 或图片内容。前端有 evidence 时用它增强“推荐依据”；读取失败、数据库未配置或无事件时继续使用 P1.9 fallback。
```

Also update API contract list with:

```md
GET /api/student-profile/evidence?student_id=demo_student_001&limit=8
- 返回 `source`、`is_database_configured`、`evidence`、`warnings`。
- 当前只支持 `demo_student_001`。
- `evidence=null` 表示使用本地 demo 推荐依据 fallback。
- 该接口是摘要接口，不是完整 `memory_events` 浏览器。
```

- [ ] **Step 5: Update interview narrative**

In `interview/mathtrace-project-narrative.md`, add a P1.10 section after the P1.9 section or the current memory-system section:

```md
## 16. P1.10 真实画像证据接口

### 当前状态
P1.10 已实现并完成本地验证。它在 P1.8 当前画像快照和 P1.9 展示语义之上，补了一个只读的 profile evidence API。

### 功能价值
P1.9 能解释当前推荐，但只能基于前端已有的当前画像和本次诊断。P1.10 让推荐依据可以使用服务端从 `memory_events` 汇总出的真实历史证据，所以页面不再只是“看起来像长期记忆”，而是能引用最近画像事件支撑复习优先级。

### 关键设计
我没有把完整 `memory_events` 暴露给前端，而是新增 `GET /api/student-profile/evidence`。服务端只读取最近事件中的结构化摘要字段，聚合出 top knowledge focus、top mistake causes 和 recent event summaries。当前画像仍走 `/api/student-profile`，历史证据走 evidence API，两条路径互不阻塞。

### 技术决策与取舍
这不是 RAG，也不是完整事件浏览器。RAG 解决相似题或材料召回；P1.10 解决“这条复习建议有什么历史证据”。我也没有 join `diagnosis_runs` 或错题正文，因为推荐依据不需要把题目原文、学生答案或标准答案暴露给浏览器。

### 性能收益（如适用）
读取最近 N 条 `memory_events` 并做服务端摘要，避免前端拉全量历史或重放画像。当前 `memory_events_student_created_idx` 支持按学生和时间读取最近事件。

### 面试官可能怎么问
1. 为什么不直接返回完整 `memory_events`？
2. 为什么 evidence API 不合并进 `/api/student-profile`？
3. 如何避免泄漏学生答案或题目内容？
4. evidence API 和 RAG 有什么区别？
5. 数据库不可用时页面如何降级？
6. 为什么只统计最近 N 条，不声称完整历史趋势？

### 推荐回答
我把当前画像和历史证据拆开了。`student_profiles` 负责快速恢复当前画像；profile evidence API 负责解释推荐依据。它只返回摘要，不返回完整 `memory_delta` 或诊断原文，这样前端可以展示“最近几条画像事件支持这个建议”，但不会绑定数据库内部结构，也不会泄漏敏感学习内容。

### 可能被继续追问
后续可以继续问事件分页、老师端时间线、练习后的正向证据、RAG 相似错题召回，以及多用户权限如何改造。

### 反思与后续优化
P1.10 仍然只看最近事件窗口，不是完整长期趋势分析。下一步如果要做更强的学习规划，需要加入练习完成后的正向证据和更明确的时间窗口。

### 项目中的真实证据
- 代码：
- 测试：
- 文档：
- 验证：
```

Fill the evidence bullets with actual files and commands from this implementation. If any verification command failed in Step 3, do not use the phrase “完成本地验证”; write the exact failed command and current risk instead.

- [ ] **Step 6: Run documentation consistency checks**

Run:

```bash
rg -n "P1\\.10|profile evidence|student-profile/evidence|memory_events" docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md interview/mathtrace-project-narrative.md
npm test
```

Expected:

- `rg` shows P1.10 references in both PRD and interview narrative.
- `npm test` exits 0 after documentation edits.

- [ ] **Step 7: Commit Task 4**

```bash
git status --short
git add docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md interview/mathtrace-project-narrative.md scripts/tests/architecture/architecture-boundaries.test.mjs
git commit -m "docs: describe p110 profile evidence api"
```

If `scripts/tests/architecture/architecture-boundaries.test.mjs` was not modified, omit it from `git add`.

---

## Plan Self-Review Checklist

- [ ] Spec coverage: Tasks 1-3 implement the separate evidence API, safe summary response, fallback behavior, client guard, and frontend recommendation integration. Task 4 covers PRD/interview narrative and verification.
- [ ] Non-goals preserved: no migration, no `memory_delta` schema change, no RAG, no raw event API, no full diagnosis/question exposure.
- [ ] Type consistency: `StudentProfileEvidenceSummary`, `KnowledgeEvidenceSummary`, `MistakeCauseEvidenceSummary`, and `RecentProfileEvidenceEvent` are defined in the service and reused by client/view model.
- [ ] Boundary consistency: persistence reads DB rows; service aggregates; API route is thin; workbench fetches; `ProfileInsights` renders only.
- [ ] Test coverage: service fallback, invalid student, aggregation, Supabase query shape, client response guard, UI evidence recommendation, no direct fetch in `ProfileInsights`, and full smoke/build/lint are covered.
- [ ] Review before implementation: send this plan and the design spec to Claude Code for plan review before writing code.
