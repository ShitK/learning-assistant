import { demoStudentProfile } from "@/data/mathtrace-demo";
import type { StudentProfile } from "@/data/mathtrace-demo";
import { isRecord } from "@/lib/shared/utils";

export const DEMO_STUDENT_PROFILE_STORAGE_KEY =
  "mathtrace.demoStudentProfile.v1";

interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function parseStoredStudentProfile(rawValue: string | null): StudentProfile {
  if (rawValue === null) {
    return demoStudentProfile;
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);
    return isStudentProfile(parsedValue) ? parsedValue : demoStudentProfile;
  } catch {
    return demoStudentProfile;
  }
}

export function serializeStudentProfile(profile: StudentProfile): string {
  return JSON.stringify(profile);
}

export function readStoredStudentProfile(storage: ProfileStorage): StudentProfile {
  try {
    return parseStoredStudentProfile(
      storage.getItem(DEMO_STUDENT_PROFILE_STORAGE_KEY),
    );
  } catch {
    return demoStudentProfile;
  }
}

export function writeStoredStudentProfile(
  storage: ProfileStorage,
  profile: StudentProfile,
): void {
  try {
    storage.setItem(
      DEMO_STUDENT_PROFILE_STORAGE_KEY,
      serializeStudentProfile(profile),
    );
  } catch {
    return;
  }
}

export function clearStoredStudentProfile(storage: ProfileStorage): void {
  try {
    storage.removeItem(DEMO_STUDENT_PROFILE_STORAGE_KEY);
  } catch {
    return;
  }
}

export function createMemoryStorage(): ProfileStorage {
  const values = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
  };
}

function isStudentProfile(value: unknown): value is StudentProfile {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.student_id === "string" &&
    typeof value.grade === "string" &&
    value.subject === "math" &&
    isNumberRecord(value.mastery_scores) &&
    isNumberRecord(value.frequent_mistake_causes) &&
    isStringArray(value.weak_modules) &&
    isStringArray(value.review_priority) &&
    typeof value.recent_trend === "string" &&
    isGaokaoFocus(value.gaokao_focus) &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

function isNumberRecord(value: unknown): value is Record<string, number> {
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

function isGaokaoFocus(value: unknown): value is StudentProfile["gaokao_focus"] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.knowledge_point === "string" &&
        typeof item.reason === "string" &&
        typeof item.priority === "number" &&
        Number.isFinite(item.priority),
    )
  );
}
