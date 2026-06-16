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
assert.equal(
  hasStudentProfileGrantToRole("anon"),
  false,
);
assert.equal(
  hasStudentProfileGrantToRole("authenticated"),
  false,
);

console.log("student profile persistence tests passed");

function hasStudentProfileGrantToRole(role) {
  const rolePattern = new RegExp(`\\bto\\b.*\\b${role}\\b`, "i");

  return migrationStatements.some(
    (statement) =>
      /^grant\b/i.test(statement) &&
      /\bon\s+(?:table\s+)?public\.student_profiles\b/i.test(statement) &&
      rolePattern.test(statement),
  );
}
