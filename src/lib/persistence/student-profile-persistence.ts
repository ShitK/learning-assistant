import type { StudentProfile } from "@/data/mathtrace-demo";
import {
  createSupabaseAdminClient,
  getSupabaseAdminConfig,
} from "@/lib/persistence/supabase-admin";
import { isStudentProfile } from "@/lib/shared/student-profile";
import { isRecord } from "@/lib/shared/utils";

export const DEMO_STUDENT_ID = "demo_student_001";

export interface ProfileMemoryEvent {
  id: string;
  created_at: string;
  memory_delta: unknown;
}

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

export interface UpsertProjectedStudentProfileInput {
  student_id: string;
  profile: StudentProfile;
  event_count: number;
  last_memory_event_id: string | null;
}

export interface StudentProfileProjectionRepository {
  is_database_configured: boolean;
  listMemoryEvents(student_id: string): Promise<ProfileMemoryEvent[]>;
  upsertProjectedProfile(
    input: UpsertProjectedStudentProfileInput,
  ): Promise<void>;
}

export interface StudentProfileReadRepository {
  is_database_configured: boolean;
  readCurrentProfile(student_id: string): Promise<StudentProfile | null>;
}

export interface StudentProfileEvidenceRepository {
  is_database_configured: boolean;
  listProfileEvidenceEvents(
    student_id: string,
    limit: number,
  ): Promise<ProfileEvidenceEvent[]>;
}

export interface SupabaseStudentProfileClient {
  from(table: "memory_events"): SupabaseMemoryEventsTable;
  from(table: "student_profiles"): SupabaseStudentProfilesTable;
}

interface SupabaseMemoryEventsTable {
  select(columns: string): SupabaseMemoryEventsSelectQuery;
}

interface SupabaseMemoryEventsSelectQuery {
  eq(column: string, value: string): SupabaseMemoryEventsOrderQuery;
}

interface SupabaseMemoryEventsOrderQuery
  extends PromiseLike<{ data: unknown; error: unknown }> {
  order(
    column: string,
    options: { ascending: boolean },
  ): SupabaseMemoryEventsOrderQuery;
  limit(count: number): PromiseLike<{ data: unknown; error: unknown }>;
}

interface SupabaseStudentProfilesTable {
  select(columns: "profile"): SupabaseStudentProfilesSelectQuery;
  upsert(
    payload: Record<string, unknown>,
    options: { onConflict: string },
  ): PromiseLike<{ error: unknown }>;
}

interface SupabaseStudentProfilesSelectQuery {
  eq(
    column: "student_id",
    value: string,
  ): {
    maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
  };
}

export function createDefaultStudentProfileRepository(): StudentProfileProjectionRepository &
  StudentProfileReadRepository &
  StudentProfileEvidenceRepository {
  const config = getSupabaseAdminConfig();
  if (!config.ok) {
    return createDisabledStudentProfileRepository();
  }

  const client = createSupabaseAdminClient(
    config.value,
  ) as unknown as SupabaseStudentProfileClient;
  return createSupabaseStudentProfileRepository(client);
}

export function createSupabaseStudentProfileRepository(
  client: SupabaseStudentProfileClient,
): StudentProfileProjectionRepository &
  StudentProfileReadRepository &
  StudentProfileEvidenceRepository {
  return {
    is_database_configured: true,
    async listMemoryEvents(student_id) {
      const { data, error } = await client
        .from("memory_events")
        .select("id, created_at, memory_delta")
        .eq("student_id", student_id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        throw error;
      }

      if (!Array.isArray(data)) {
        throw new Error("Expected memory_events query to return an array.");
      }

      return data.map(toProfileMemoryEvent);
    },
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
    async upsertProjectedProfile(input) {
      const { error } = await client.from("student_profiles").upsert(
        {
          student_id: input.student_id,
          subject: "math",
          grade: input.profile.grade,
          profile: input.profile,
          profile_version: 1,
          event_count: input.event_count,
          last_memory_event_id: input.last_memory_event_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id" },
      );

      if (error) {
        throw error;
      }
    },
    async readCurrentProfile(student_id) {
      const { data, error } = await client
        .from("student_profiles")
        .select("profile")
        .eq("student_id", student_id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data === null) {
        return null;
      }

      if (!isRecord(data) || !isStudentProfile(data.profile)) {
        throw new Error("Expected student_profiles row to include a valid profile.");
      }

      return data.profile;
    },
  };
}

export function createDisabledStudentProfileRepository(): StudentProfileProjectionRepository &
  StudentProfileReadRepository &
  StudentProfileEvidenceRepository {
  return {
    is_database_configured: false,
    async listMemoryEvents() {
      return [];
    },
    async listProfileEvidenceEvents() {
      return [];
    },
    async upsertProjectedProfile() {},
    async readCurrentProfile() {
      return null;
    },
  };
}

function toProfileMemoryEvent(row: unknown): ProfileMemoryEvent {
  if (
    !isRecord(row) ||
    typeof row.id !== "string" ||
    typeof row.created_at !== "string"
  ) {
    throw new Error("Expected memory_events row to include string id and created_at.");
  }

  return {
    id: row.id,
    created_at: row.created_at,
    memory_delta: row.memory_delta,
  };
}

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

function isFiniteNumberRecord(value: unknown): value is Record<string, number> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (entryValue) => typeof entryValue === "number" && Number.isFinite(entryValue),
    )
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}
