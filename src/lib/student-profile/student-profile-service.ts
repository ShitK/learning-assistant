import {
  demoStudentProfile,
  type MemoryDelta,
  type StudentProfile,
} from "@/data/mathtrace-demo";
import {
  createDefaultStudentProfileRepository,
  type ProfileMemoryEvent,
  type StudentProfileProjectionRepository,
} from "@/lib/persistence/student-profile-persistence";
import {
  applyMemoryDeltaToProfile,
  isStudentProfile,
} from "@/lib/shared/student-profile";
import { isRecord } from "@/lib/shared/utils";

export const PROFILE_SYNC_FAILED_WARNING =
  "云端画像同步失败，本次操作已保留。";

export type ProfileSyncStatus =
  | "synced"
  | "skipped_database_not_configured"
  | "failed";

export interface ProjectedStudentProfile {
  status: "projected";
  profile: StudentProfile;
  event_count: number;
  last_memory_event_id: string | null;
}

export interface FailedStudentProfileProjection {
  status: "failed";
  warning: typeof PROFILE_SYNC_FAILED_WARNING;
}

export type StudentProfileProjectionResult =
  | ProjectedStudentProfile
  | FailedStudentProfileProjection;

export type ProfileSyncResult =
  | { status: "synced" }
  | { status: "skipped_database_not_configured" }
  | { status: "failed"; warning: typeof PROFILE_SYNC_FAILED_WARNING };

export function projectStudentProfileFromEvents(
  events: ProfileMemoryEvent[],
): StudentProfileProjectionResult {
  const sortedEvents = [...events].sort(compareMemoryEvents);
  let profile = structuredClone(demoStudentProfile);

  for (const event of sortedEvents) {
    const memoryDelta = parseMemoryDelta(event.memory_delta);
    if (!memoryDelta) {
      return failedProjection();
    }

    profile = applyMemoryDeltaToProfile(profile, memoryDelta);
    if (!isStudentProfile(profile)) {
      return failedProjection();
    }
  }

  return {
    status: "projected",
    profile,
    event_count: sortedEvents.length,
    last_memory_event_id: sortedEvents.at(-1)?.id ?? null,
  };
}

export async function syncProjectedStudentProfile(
  student_id: string,
  repository: StudentProfileProjectionRepository = createDefaultStudentProfileRepository(),
): Promise<ProfileSyncResult> {
  if (!repository.is_database_configured) {
    return { status: "skipped_database_not_configured" };
  }

  try {
    const events = await repository.listMemoryEvents(student_id);
    const projection = projectStudentProfileFromEvents(events);
    if (projection.status === "failed") {
      return projection;
    }

    await repository.upsertProjectedProfile({
      student_id,
      profile: projection.profile,
      event_count: projection.event_count,
      last_memory_event_id: projection.last_memory_event_id,
    });

    return { status: "synced" };
  } catch {
    return {
      status: "failed",
      warning: PROFILE_SYNC_FAILED_WARNING,
    };
  }
}

function compareMemoryEvents(
  left: ProfileMemoryEvent,
  right: ProfileMemoryEvent,
): number {
  const createdAtOrder = left.created_at.localeCompare(right.created_at);
  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }

  return left.id.localeCompare(right.id);
}

function parseMemoryDelta(value: unknown): MemoryDelta | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.should_persist !== "boolean" ||
    !isFiniteNumberRecord(value.knowledge_mastery_changes) ||
    !isFiniteNumberRecord(value.mistake_cause_changes) ||
    !isStringArray(value.review_priority_changes) ||
    typeof value.is_repeated_mistake !== "boolean"
  ) {
    return null;
  }

  return {
    should_persist: value.should_persist,
    rationale: typeof value.rationale === "string" ? value.rationale : "",
    knowledge_mastery_changes: value.knowledge_mastery_changes,
    mistake_cause_changes: value.mistake_cause_changes,
    review_priority_changes: value.review_priority_changes,
    is_repeated_mistake: value.is_repeated_mistake,
  };
}

function isFiniteNumberRecord(
  value: unknown,
): value is Record<string, number> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(
    (item) => typeof item === "number" && Number.isFinite(item),
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function failedProjection(): FailedStudentProfileProjection {
  return {
    status: "failed",
    warning: PROFILE_SYNC_FAILED_WARNING,
  };
}
