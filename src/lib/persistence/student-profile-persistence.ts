import type { StudentProfile } from "@/data/mathtrace-demo";
import {
  createSupabaseAdminClient,
  getSupabaseAdminConfig,
} from "@/lib/persistence/supabase-admin";
import { isRecord } from "@/lib/shared/utils";

export const DEMO_STUDENT_ID = "demo_student_001";

export interface ProfileMemoryEvent {
  id: string;
  created_at: string;
  memory_delta: unknown;
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
}

interface SupabaseStudentProfilesTable {
  upsert(
    payload: Record<string, unknown>,
    options: { onConflict: string },
  ): PromiseLike<{ error: unknown }>;
}

export function createDefaultStudentProfileRepository(): StudentProfileProjectionRepository {
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
): StudentProfileProjectionRepository {
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
  };
}

export function createDisabledStudentProfileRepository(): StudentProfileProjectionRepository {
  return {
    is_database_configured: false,
    async listMemoryEvents() {
      return [];
    },
    async upsertProjectedProfile() {},
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
