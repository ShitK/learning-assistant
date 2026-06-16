import {
  isStudentProfile,
  type StudentProfile,
} from "@/lib/shared/student-profile";
import { isRecord } from "@/lib/shared/utils";

const DEMO_STUDENT_ID = "demo_student_001";

export interface CloudStudentProfileClientResponse {
  student_id: string;
  profile: StudentProfile | null;
  source: "cloud" | "fallback";
  is_database_configured: boolean;
  warnings: string[];
}

export interface RequestCloudStudentProfileOptions {
  fetcher?: typeof fetch;
  student_id?: string;
}

export async function requestCloudStudentProfile(
  options: RequestCloudStudentProfileOptions = {},
): Promise<CloudStudentProfileClientResponse> {
  const fetcher = options.fetcher ?? fetch;
  const studentId = options.student_id ?? DEMO_STUDENT_ID;
  let response: Response;

  try {
    response = await fetcher(
      `/api/student-profile?student_id=${encodeURIComponent(studentId)}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );
  } catch {
    throw new Error("云端画像暂时读取失败。");
  }

  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error("云端画像暂时读取失败。");
  }

  if (!isCloudStudentProfileClientResponse(responseBody)) {
    throw new Error("云端画像响应格式无效。");
  }

  return responseBody;
}

function isCloudStudentProfileClientResponse(
  value: unknown,
): value is CloudStudentProfileClientResponse {
  if (!isRecord(value) || !hasOnlyCloudProfileResponseKeys(value)) {
    return false;
  }

  return (
    typeof value.student_id === "string" &&
    (value.profile === null || isStudentProfile(value.profile)) &&
    (value.source === "cloud" || value.source === "fallback") &&
    typeof value.is_database_configured === "boolean" &&
    isStringArray(value.warnings)
  );
}

function hasOnlyCloudProfileResponseKeys(
  value: Record<string, unknown>,
): boolean {
  const allowedKeys = [
    "student_id",
    "profile",
    "source",
    "is_database_configured",
    "warnings",
  ];

  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
