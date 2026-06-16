import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { demoStudentProfile } = jiti("./src/data/mathtrace-demo.ts");
const {
  projectStudentProfileFromEvents,
  syncProjectedStudentProfile,
  PROFILE_SYNC_FAILED_WARNING,
} = jiti("./src/lib/student-profile/student-profile-service.ts");

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
