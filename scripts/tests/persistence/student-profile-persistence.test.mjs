import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
