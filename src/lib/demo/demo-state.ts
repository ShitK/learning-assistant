import { demoStudentProfile } from "@/data/mathtrace-demo";
import type { StudentProfile } from "@/data/mathtrace-demo";
import { isStudentProfile } from "@/lib/shared/student-profile";

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
