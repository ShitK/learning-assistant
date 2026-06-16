import {
  demoStudentProfile,
  type MemoryDelta,
  type StudentProfile,
} from "@/data/mathtrace-demo";
import {
  createDefaultStudentProfileRepository,
  DEMO_STUDENT_ID,
  type ProfileMemoryEvent,
  type StudentProfileProjectionRepository,
  type StudentProfileReadRepository,
} from "@/lib/persistence/student-profile-persistence";
import {
  applyMemoryDeltaToProfile,
  isStudentProfile,
} from "@/lib/shared/student-profile";
import { PROFILE_SYNC_FAILED_WARNING } from "@/lib/shared/persistence-warnings";
import { isRecord } from "@/lib/shared/utils";

export { PROFILE_SYNC_FAILED_WARNING };
export const PROFILE_READ_NOT_CONFIGURED_WARNING =
  "数据库暂未配置，继续使用本地 demo 画像。";
export const PROFILE_READ_FAILED_WARNING =
  "云端画像暂时读取失败，继续使用本地 demo 画像。";
export const PROFILE_NOT_FOUND_WARNING =
  "云端画像暂未生成，继续使用本地 demo 画像。";

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

export interface CloudStudentProfileResponse {
  student_id: string;
  profile: StudentProfile | null;
  source: "cloud" | "fallback";
  is_database_configured: boolean;
  warnings: string[];
}

export interface StudentProfileErrorResponse {
  error: {
    code: "invalid_request";
    message: string;
    recoverable: true;
  };
}

export interface StudentProfileRequestResult {
  status: number;
  body: CloudStudentProfileResponse | StudentProfileErrorResponse;
}

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
  repository?: StudentProfileProjectionRepository,
): Promise<ProfileSyncResult> {
  try {
    const activeRepository =
      repository ?? createDefaultStudentProfileRepository();
    if (!activeRepository.is_database_configured) {
      return { status: "skipped_database_not_configured" };
    }

    const events = await activeRepository.listMemoryEvents(student_id);
    const projection = projectStudentProfileFromEvents(events);
    if (projection.status === "failed") {
      return projection;
    }

    await activeRepository.upsertProjectedProfile({
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

export async function handleStudentProfileRequest(
  searchParams: URLSearchParams | Record<string, string | undefined>,
  repository: StudentProfileReadRepository = createDefaultStudentProfileRepository(),
): Promise<StudentProfileRequestResult> {
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
    return fallbackProfileResponse(false, PROFILE_READ_NOT_CONFIGURED_WARNING);
  }

  try {
    const profile = await repository.readCurrentProfile(student_id);
    if (profile === null) {
      return fallbackProfileResponse(true, PROFILE_NOT_FOUND_WARNING);
    }

    return {
      status: 200,
      body: {
        student_id,
        profile,
        source: "cloud",
        is_database_configured: true,
        warnings: [],
      },
    };
  } catch {
    return fallbackProfileResponse(true, PROFILE_READ_FAILED_WARNING);
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
    value.should_persist !== true ||
    typeof value.rationale !== "string" ||
    !isFiniteNumberRecord(value.knowledge_mastery_changes) ||
    !isFiniteNumberRecord(value.mistake_cause_changes) ||
    !isStringArray(value.review_priority_changes) ||
    typeof value.is_repeated_mistake !== "boolean"
  ) {
    return null;
  }

  return {
    should_persist: value.should_persist,
    rationale: value.rationale,
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

function getSearchParam(
  searchParams: URLSearchParams | Record<string, string | undefined>,
  key: string,
): string | undefined {
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get(key) ?? undefined;
  }

  return searchParams[key];
}

function fallbackProfileResponse(
  is_database_configured: boolean,
  warning: string,
): StudentProfileRequestResult {
  return {
    status: 200,
    body: {
      student_id: DEMO_STUDENT_ID,
      profile: null,
      source: "fallback",
      is_database_configured,
      warnings: [warning],
    },
  };
}

function failedProjection(): FailedStudentProfileProjection {
  return {
    status: "failed",
    warning: PROFILE_SYNC_FAILED_WARNING,
  };
}
