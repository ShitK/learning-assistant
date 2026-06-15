import { isRecord } from "@/lib/shared/utils";
import type {
  EvidenceLevel,
  PersistenceEvidence,
  ProfileUpdateKind,
} from "@/lib/diagnosis/diagnose-api";
import type { Severity } from "@/data/mathtrace-demo";

export interface MistakeBookItemSummary {
  id: string;
  diagnosis_run_id: string;
  source: "sample" | "image";
  question_text: string;
  knowledge_points: string[];
  mistake_causes: string[];
  severity: Severity;
  diagnosis_summary: string;
  evidence_level: EvidenceLevel | null;
  persistence_evidence: PersistenceEvidence | null;
  profile_update_kind: ProfileUpdateKind;
  review_status: 0 | 1 | 2 | 3;
  created_at: string;
}

export interface MistakeBookResponse {
  student_id: "demo_student_001";
  items: MistakeBookItemSummary[];
  is_database_configured: boolean;
  warnings: string[];
}

export interface MistakeBookDeleteResponse {
  student_id: "demo_student_001";
  item_id: string;
  deleted: boolean;
  is_database_configured: boolean;
  warnings: string[];
}

export async function requestMistakeBookItems(input: {
  fetcher: typeof fetch;
  student_id: string;
  limit: number;
}): Promise<MistakeBookResponse> {
  const params = new URLSearchParams({
    student_id: input.student_id,
    limit: String(input.limit),
  });

  let response: Response;

  try {
    response = await input.fetcher(`/api/mistake-book?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
    });
  } catch {
    throw new Error("错题本暂时读取失败。");
  }

  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error("错题本暂时读取失败。");
  }

  if (!isMistakeBookResponse(responseBody)) {
    throw new Error("错题本返回格式异常。");
  }

  return responseBody;
}

export async function deleteMistakeBookItem(input: {
  fetcher: typeof fetch;
  student_id: string;
  item_id: string;
}): Promise<MistakeBookDeleteResponse> {
  let response: Response;

  try {
    response = await input.fetcher("/api/mistake-book", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: input.student_id,
        item_id: input.item_id,
      }),
    });
  } catch {
    throw new Error("错题本删除失败。");
  }

  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error("错题本删除失败。");
  }

  if (!isMistakeBookDeleteResponse(responseBody)) {
    throw new Error("错题本删除返回格式异常。");
  }

  if (!responseBody.deleted) {
    throw new Error("错题本删除失败。");
  }

  return responseBody;
}

export function isMistakeBookResponse(
  value: unknown,
): value is MistakeBookResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.student_id === "demo_student_001" &&
    Array.isArray(value.items) &&
    value.items.every(isMistakeBookItemSummary) &&
    typeof value.is_database_configured === "boolean" &&
    isStringArray(value.warnings)
  );
}

function isMistakeBookDeleteResponse(
  value: unknown,
): value is MistakeBookDeleteResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.student_id === "demo_student_001" &&
    typeof value.item_id === "string" &&
    typeof value.deleted === "boolean" &&
    typeof value.is_database_configured === "boolean" &&
    isStringArray(value.warnings)
  );
}

function isMistakeBookItemSummary(
  value: unknown,
): value is MistakeBookItemSummary {
  if (!isRecord(value)) {
    return false;
  }

  const allowedKeys = [
    "id",
    "diagnosis_run_id",
    "source",
    "question_text",
    "knowledge_points",
    "mistake_causes",
    "severity",
    "diagnosis_summary",
    "evidence_level",
    "persistence_evidence",
    "profile_update_kind",
    "review_status",
    "created_at",
  ];

  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.diagnosis_run_id === "string" &&
    (value.source === "sample" || value.source === "image") &&
    typeof value.question_text === "string" &&
    isStringArray(value.knowledge_points) &&
    isStringArray(value.mistake_causes) &&
    isSeverity(value.severity) &&
    typeof value.diagnosis_summary === "string" &&
    isEvidenceLevel(value.evidence_level) &&
    isPersistenceEvidence(value.persistence_evidence) &&
    isProfileUpdateKind(value.profile_update_kind) &&
    isReviewStatus(value.review_status) &&
    typeof value.created_at === "string"
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isSeverity(value: unknown): value is Severity {
  return value === "minor" || value === "medium" || value === "severe";
}

function isEvidenceLevel(value: unknown): value is EvidenceLevel | null {
  return (
    value === null ||
    value === "student_work_sufficient" ||
    value === "problem_only" ||
    value === "insufficient"
  );
}

function isPersistenceEvidence(
  value: unknown,
): value is PersistenceEvidence | null {
  return (
    value === null ||
    value === "student_work" ||
    value === "user_confirmed" ||
    value === "uploaded_problem_only" ||
    value === "none"
  );
}

function isProfileUpdateKind(value: unknown): value is ProfileUpdateKind {
  return (
    value === "mistake_cause" ||
    value === "problem_type_focus" ||
    value === "none"
  );
}

function isReviewStatus(value: unknown): value is 0 | 1 | 2 | 3 {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
