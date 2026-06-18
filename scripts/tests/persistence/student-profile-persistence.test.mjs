import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { demoStudentProfile } = jiti("./src/data/mathtrace-demo.ts");
const {
  handleStudentProfileRequest,
  projectStudentProfileFromEvents,
  syncProjectedStudentProfile,
  PROFILE_NOT_FOUND_WARNING,
  PROFILE_READ_FAILED_WARNING,
  PROFILE_READ_NOT_CONFIGURED_WARNING,
  PROFILE_SYNC_FAILED_WARNING,
} = jiti("./src/lib/student-profile/student-profile-service.ts");
const {
  createStudentProfileEvidenceSummary,
  handleStudentProfileEvidenceRequest,
  PROFILE_EVIDENCE_NOT_FOUND_WARNING,
  PROFILE_EVIDENCE_READ_FAILED_WARNING,
  PROFILE_EVIDENCE_READ_NOT_CONFIGURED_WARNING,
} = jiti("./src/lib/student-profile/student-profile-evidence-service.ts");
const {
  createDisabledStudentProfileRepository,
  createSupabaseStudentProfileRepository,
} = jiti("./src/lib/persistence/student-profile-persistence.ts");
const { requestCloudStudentProfile } = jiti(
  "./src/lib/student-profile/student-profile-client.ts",
);

const migrationSql = readFileSync(
  "supabase/migrations/20260617000000_p18_student_profiles.sql",
  "utf8",
);
const migrationStatements = migrationSql
  .split(";")
  .map((statement) => statement.replace(/\s+/g, " ").trim())
  .filter(Boolean);
const forbiddenStudentProfileGrantRoles = ["anon", "authenticated", "public"];

assert.equal(
  migrationSql.includes("create table if not exists public.student_profiles"),
  true,
);
assert.equal(
  migrationSql.includes(
    "student_id text primary key references public.students(id) on delete cascade",
  ),
  true,
);
assert.equal(migrationSql.includes("grade text not null"), true);
assert.equal(migrationSql.includes("profile jsonb not null"), true);
assert.equal(
  migrationSql.includes("event_count integer not null default 0"),
  true,
);
assert.equal(
  migrationSql.includes(
    "last_memory_event_id uuid references public.memory_events(id) on delete set null",
  ),
  true,
);
assert.equal(
  migrationSql.includes(
    "student_profiles_demo_student_check check (student_id = 'demo_student_001')",
  ),
  true,
);
assert.equal(
  migrationSql.includes("student_profiles_subject_check check (subject = 'math')"),
  true,
);
assert.equal(
  migrationSql.includes(
    "alter table public.student_profiles enable row level security",
  ),
  true,
);
assert.equal(
  migrationSql.includes(
    "grant select, insert, update on public.student_profiles to service_role",
  ),
  true,
);
assert.deepEqual(findForbiddenStudentProfileGrants(migrationStatements), []);
assert.deepEqual(
  findForbiddenStudentProfileGrants([
    "grant select on public.student_profiles to anon",
    "grant select on public.student_profiles to authenticated",
    "grant select on public.student_profiles to service_role, public",
    "grant select on all tables in schema public to anon",
  ]),
  [
    "grant select on public.student_profiles to anon",
    "grant select on public.student_profiles to authenticated",
    "grant select on public.student_profiles to service_role, public",
    "grant select on all tables in schema public to anon",
  ],
);
assert.deepEqual(
  findForbiddenStudentProfileGrants([
    "grant select, insert, update on public.student_profiles to service_role",
  ]),
  [],
);
assert.deepEqual(projectStudentProfileFromEvents([]), {
  status: "projected",
  profile: demoStudentProfile,
  event_count: 0,
  last_memory_event_id: null,
});

{
  const result = projectStudentProfileFromEvents([
    {
      id: "b",
      created_at: "2026-06-17T09:00:00+08:00",
      memory_delta: memoryDelta({
        knowledge_mastery_changes: { function_monotonicity: -3 },
        review_priority_changes: ["function_monotonicity"],
      }),
    },
    {
      id: "a",
      created_at: "2026-06-17T08:00:00+08:00",
      memory_delta: memoryDelta({
        knowledge_mastery_changes: { parameter_classification: -5 },
        review_priority_changes: ["parameter_classification"],
      }),
    },
  ]);

  assert.equal(result.status, "projected");
  assert.equal(result.event_count, 2);
  assert.equal(result.last_memory_event_id, "b");
  assert.deepEqual(result.profile.review_priority.slice(0, 2), [
    "function_monotonicity",
    "parameter_classification",
  ]);
  assert.equal(
    result.profile.mastery_scores.function_monotonicity,
    (demoStudentProfile.mastery_scores.function_monotonicity ?? 70) - 3,
  );
  assert.equal(
    result.profile.mastery_scores.parameter_classification,
    demoStudentProfile.mastery_scores.parameter_classification - 5,
  );
}

{
  const result = projectStudentProfileFromEvents([
    {
      id: "b",
      created_at: "2026-06-17T08:00:00+08:00",
      memory_delta: memoryDelta({
        knowledge_mastery_changes: { function_monotonicity: -3 },
        review_priority_changes: ["function_monotonicity"],
      }),
    },
    {
      id: "a",
      created_at: "2026-06-17T08:00:00+08:00",
      memory_delta: memoryDelta({
        knowledge_mastery_changes: { parameter_classification: -5 },
        review_priority_changes: ["parameter_classification"],
      }),
    },
  ]);

  assert.equal(result.status, "projected");
  assert.equal(result.event_count, 2);
  assert.equal(result.last_memory_event_id, "b");
  assert.deepEqual(result.profile.review_priority.slice(0, 2), [
    "function_monotonicity",
    "parameter_classification",
  ]);
  assert.equal(
    result.profile.mastery_scores.function_monotonicity,
    (demoStudentProfile.mastery_scores.function_monotonicity ?? 70) - 3,
  );
  assert.equal(
    result.profile.mastery_scores.parameter_classification,
    demoStudentProfile.mastery_scores.parameter_classification - 5,
  );
}
assert.deepEqual(
  projectStudentProfileFromEvents([
    {
      id: "invalid",
      created_at: "2026-06-17T08:00:00+08:00",
      memory_delta: memoryDelta({
        knowledge_mastery_changes: { parameter_classification: Number.NaN },
      }),
    },
  ]),
  {
    status: "failed",
    warning: PROFILE_SYNC_FAILED_WARNING,
  },
);
assert.deepEqual(
  projectStudentProfileFromEvents([
    {
      id: "invalid-rationale",
      created_at: "2026-06-17T08:00:00+08:00",
      memory_delta: memoryDelta({ rationale: 123 }),
    },
  ]),
  {
    status: "failed",
    warning: PROFILE_SYNC_FAILED_WARNING,
  },
);
assert.deepEqual(
  projectStudentProfileFromEvents([
    {
      id: "not-persistable",
      created_at: "2026-06-17T08:00:00+08:00",
      memory_delta: memoryDelta({ should_persist: false }),
    },
  ]),
  {
    status: "failed",
    warning: PROFILE_SYNC_FAILED_WARNING,
  },
);
assert.deepEqual(
  projectStudentProfileFromEvents([
    {
      id: "good",
      created_at: "2026-06-17T08:00:00+08:00",
      memory_delta: memoryDelta(),
    },
    {
      id: "bad",
      created_at: "2026-06-17T09:00:00+08:00",
      memory_delta: memoryDelta({
        mistake_cause_changes: { concept_confusion: Infinity },
      }),
    },
  ]),
  {
    status: "failed",
    warning: PROFILE_SYNC_FAILED_WARNING,
  },
);

{
  const calls = [];
  const result = await syncProjectedStudentProfile("demo_student_001", {
    is_database_configured: true,
    async listMemoryEvents(studentId) {
      calls.push("list");
      assert.equal(studentId, "demo_student_001");
      return [
        {
          id: "event-1",
          created_at: "2026-06-17T08:00:00+08:00",
          memory_delta: memoryDelta(),
        },
      ];
    },
    async upsertProjectedProfile(input) {
      calls.push([
        "upsert",
        input.event_count,
        input.last_memory_event_id,
        input.profile.grade,
      ]);
    },
  });

  assert.deepEqual(result, { status: "synced" });
  assert.deepEqual(calls, ["list", ["upsert", 1, "event-1", "高二"]]);
}
{
  const result = await handleStudentProfileRequest(
    new URLSearchParams("student_id=demo_student_001"),
    createDisabledStudentProfileRepository(),
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    student_id: "demo_student_001",
    profile: null,
    source: "fallback",
    is_database_configured: false,
    warnings: [PROFILE_READ_NOT_CONFIGURED_WARNING],
  });
}
{
  const result = await handleStudentProfileRequest(
    new URLSearchParams("student_id=demo_student_001"),
    createReadRepository(demoStudentProfile),
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    student_id: "demo_student_001",
    profile: demoStudentProfile,
    source: "cloud",
    is_database_configured: true,
    warnings: [],
  });
}
{
  const result = await handleStudentProfileRequest(
    new URLSearchParams("student_id=demo_student_001"),
    createReadRepository(null),
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    student_id: "demo_student_001",
    profile: null,
    source: "fallback",
    is_database_configured: true,
    warnings: [PROFILE_NOT_FOUND_WARNING],
  });
}
{
  const result = await handleStudentProfileRequest(
    new URLSearchParams("student_id=student_002"),
    createReadRepository(demoStudentProfile),
  );

  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "invalid_request");
  assert.equal(result.body.error.recoverable, true);
}
{
  const result = await handleStudentProfileRequest(
    new URLSearchParams("student_id=demo_student_001"),
    createFailingReadRepository(),
  );

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    student_id: "demo_student_001",
    profile: null,
    source: "fallback",
    is_database_configured: true,
    warnings: [PROFILE_READ_FAILED_WARNING],
  });
  assert.equal(JSON.stringify(result.body).includes("service role"), false);
}
{
  const calls = [];
  const result = await syncProjectedStudentProfile("demo_student_001", {
    is_database_configured: true,
    async listMemoryEvents() {
      calls.push("list");
      return [
        {
          id: "bad",
          created_at: "2026-06-17T08:00:00+08:00",
          memory_delta: memoryDelta({
            review_priority_changes: ["parameter_classification", 123],
          }),
        },
      ];
    },
    async upsertProjectedProfile() {
      calls.push("upsert");
    },
  });

  assert.deepEqual(result, {
    status: "failed",
    warning: PROFILE_SYNC_FAILED_WARNING,
  });
  assert.deepEqual(calls, ["list"]);
}
{
  const calls = [];
  const rows = [
    {
      id: "event-1",
      created_at: "2026-06-17T08:00:00+08:00",
      memory_delta: memoryDelta(),
    },
  ];
  const repository = createSupabaseStudentProfileRepository(
    createFakeStudentProfileClient({ calls, listRows: rows }),
  );

  const result = await repository.listMemoryEvents("demo_student_001");

  assert.deepEqual(result, rows);
  assert.deepEqual(calls, [
    ["from", "memory_events"],
    ["select", "id, created_at, memory_delta"],
    ["eq", "student_id", "demo_student_001"],
    ["order", "created_at", { ascending: true }],
    ["order", "id", { ascending: true }],
  ]);
}
{
  const calls = [];
  const repository = createSupabaseStudentProfileRepository(
    createFakeStudentProfileClient({ calls, listRows: [{ id: null }] }),
  );

  await assert.rejects(() => repository.listMemoryEvents("demo_student_001"));
}
{
  const calls = [];
  const repository = createSupabaseStudentProfileRepository(
    createFakeStudentProfileClient({
      calls,
      listRows: [],
      readRow: { profile: demoStudentProfile },
    }),
  );

  const profile = await repository.readCurrentProfile("demo_student_001");

  assert.deepEqual(profile, demoStudentProfile);
  assert.deepEqual(calls, [
    ["from", "student_profiles"],
    ["select", "profile"],
    ["eq", "student_id", "demo_student_001"],
    ["maybeSingle"],
  ]);
}
{
  const repository = createSupabaseStudentProfileRepository(
    createFakeStudentProfileClient({
      calls: [],
      listRows: [],
      readRow: { profile: { ...demoStudentProfile, subject: "science" } },
    }),
  );

  await assert.rejects(() => repository.readCurrentProfile("demo_student_001"));
}
{
  const calls = [];
  const repository = createSupabaseStudentProfileRepository(
    createFakeStudentProfileClient({ calls, listRows: [] }),
  );

  await repository.upsertProjectedProfile({
    student_id: "demo_student_001",
    profile: demoStudentProfile,
    event_count: 1,
    last_memory_event_id: "event-1",
  });

  assert.equal(calls[0][0], "from");
  assert.equal(calls[0][1], "student_profiles");
  assert.equal(calls[1][0], "upsert");
  assert.deepEqual(calls[1][1], {
    student_id: "demo_student_001",
    subject: "math",
    grade: demoStudentProfile.grade,
    profile: demoStudentProfile,
    profile_version: 1,
    event_count: 1,
    last_memory_event_id: "event-1",
    updated_at: calls[1][1].updated_at,
  });
  assert.equal(typeof calls[1][1].updated_at, "string");
  assert.deepEqual(calls[1][2], { onConflict: "student_id" });
}
{
  const requests = [];
  const result = await requestCloudStudentProfile({
    fetcher: async (url, init) => {
      requests.push({ url, init });

      return new Response(
        JSON.stringify({
          student_id: "demo_student_001",
          profile: demoStudentProfile,
          source: "cloud",
          is_database_configured: true,
          warnings: [],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
    student_id: "demo_student_001",
  });

  assert.deepEqual(result.profile, demoStudentProfile);
  assert.equal(
    requests[0].url,
    "/api/student-profile?student_id=demo_student_001",
  );
  assert.deepEqual(requests[0].init, { method: "GET", cache: "no-store" });
}
{
  const requests = [];
  await requestCloudStudentProfile({
    fetcher: async (url, init) => {
      requests.push({ url, init });

      return new Response(
        JSON.stringify({
          student_id: "demo_student_001",
          profile: null,
          source: "fallback",
          is_database_configured: false,
          warnings: [PROFILE_READ_NOT_CONFIGURED_WARNING],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  });

  assert.equal(
    requests[0].url,
    "/api/student-profile?student_id=demo_student_001",
  );
}
await assert.rejects(
  () =>
    requestCloudStudentProfile({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            student_id: "demo_student_001",
            profile: demoStudentProfile,
            source: "cloud",
            is_database_configured: true,
            warnings: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      student_id: "demo_student_001",
    }),
  /云端画像响应格式无效。/,
);
await assert.rejects(
  () =>
    requestCloudStudentProfile({
      fetcher: async () =>
        new Response(JSON.stringify({ error: { code: "invalid_request" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      student_id: "student_002",
    }),
  /云端画像暂时读取失败。/,
);
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
  const calls = [];
  const result = await handleStudentProfileEvidenceRequest(
    new URLSearchParams("student_id=demo_student_001&limit=999"),
    {
      is_database_configured: true,
      async listProfileEvidenceEvents(studentId, limit) {
        calls.push([studentId, limit]);
        return createEvidenceEvents();
      },
    },
  );

  assert.equal(result.status, 200);
  assert.deepEqual(calls, [["demo_student_001", 8]]);
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
      rationale: "  这是一段很长的解释文本，用于确认服务端会截断过长 rationale，避免把过长模型文本直接透传到前端展示区域。这里继续补充更多上下文，确保测试样本一定超过八十个字符，并稳定触发省略号截断逻辑。  ",
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
  assert.equal(summary.recent_events[0].rationale_summary.endsWith("…"), true);
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

console.log("student profile persistence tests passed");

function findForbiddenStudentProfileGrants(statements) {
  return statements.filter(
    (statement) =>
      isStudentProfileRelatedGrant(statement) &&
      forbiddenStudentProfileGrantRoles.some((role) =>
        grantStatementTargetsRole(statement, role),
      ),
  );
}

function isStudentProfileRelatedGrant(statement) {
  return (
    /^grant\b/i.test(statement) &&
    (/\bon\s+(?:table\s+)?public\.student_profiles\b/i.test(statement) ||
      /\bon\s+all\s+tables\s+in\s+schema\s+public\b/i.test(statement))
  );
}

function grantStatementTargetsRole(statement, role) {
  const roleList = statement
    .match(/\bto\b\s+(.+)$/i)?.[1]
    .replace(/\bwith\s+grant\s+option\b.*$/i, "");

  if (!roleList) {
    return false;
  }

  return roleList
    .split(",")
    .map((targetRole) => targetRole.trim().replace(/^"|"$/g, ""))
    .some((targetRole) => targetRole.toLowerCase() === role);
}

function memoryDelta(overrides = {}) {
  return {
    should_persist: true,
    rationale: "",
    knowledge_mastery_changes: { parameter_classification: -5 },
    mistake_cause_changes: { concept_confusion: 1 },
    review_priority_changes: ["parameter_classification"],
    is_repeated_mistake: true,
    ...overrides,
  };
}

function createReadRepository(profile) {
  return {
    is_database_configured: true,
    async readCurrentProfile(studentId) {
      assert.equal(studentId, "demo_student_001");
      return profile;
    },
  };
}

function createFailingReadRepository() {
  return {
    is_database_configured: true,
    async readCurrentProfile() {
      throw new Error("service role key leaked");
    },
  };
}

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

function createFakeStudentProfileClient({
  calls,
  listRows,
  readRow = null,
  resolveMemoryEventsWithLimit = false,
}) {
  return {
    from(tableName) {
      calls.push(["from", tableName]);

      if (tableName === "memory_events") {
        const builder = {
          orderCount: 0,
          select(columns) {
            calls.push(["select", columns]);
            return builder;
          },
          eq(column, value) {
            calls.push(["eq", column, value]);
            return builder;
          },
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
        };

        return builder;
      }

      return {
        select(columns) {
          calls.push(["select", columns]);

          return {
            eq(column, value) {
              calls.push(["eq", column, value]);

              return {
                maybeSingle() {
                  calls.push(["maybeSingle"]);

                  return { data: readRow, error: null };
                },
              };
            },
          };
        },
        upsert(payload, options) {
          calls.push(["upsert", payload, options]);
          return { error: null };
        },
      };
    },
  };
}
