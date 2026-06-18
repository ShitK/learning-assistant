import { isRecord } from "@/lib/shared/utils";
import type {
  StudentProfileEvidenceResponse,
  StudentProfileEvidenceSummary,
} from "@/lib/student-profile/student-profile-evidence-service";

const DEMO_STUDENT_ID = "demo_student_001";
const DEFAULT_EVIDENCE_LIMIT = 8;

export type StudentProfileEvidenceClientResponse =
  StudentProfileEvidenceResponse;

export interface RequestStudentProfileEvidenceOptions {
  fetcher?: typeof fetch;
  student_id?: string;
  limit?: number;
}

export async function requestStudentProfileEvidence(
  options: RequestStudentProfileEvidenceOptions = {},
): Promise<StudentProfileEvidenceClientResponse> {
  const fetcher = options.fetcher ?? fetch;
  const studentId = options.student_id ?? DEMO_STUDENT_ID;
  const limit = options.limit ?? DEFAULT_EVIDENCE_LIMIT;
  let response: Response;

  try {
    response = await fetcher(
      `/api/student-profile/evidence?student_id=${encodeURIComponent(
        studentId,
      )}&limit=${encodeURIComponent(String(limit))}`,
      {
        method: "GET",
        cache: "no-store",
      },
    );
  } catch {
    throw new Error("云端画像证据暂时读取失败。");
  }

  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error("云端画像证据暂时读取失败。");
  }

  if (!isStudentProfileEvidenceClientResponse(responseBody)) {
    throw new Error("云端画像证据响应格式无效。");
  }

  return responseBody;
}

function isStudentProfileEvidenceClientResponse(
  value: unknown,
): value is StudentProfileEvidenceClientResponse {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "student_id",
      "source",
      "is_database_configured",
      "evidence",
      "warnings",
    ])
  ) {
    return false;
  }

  return (
    typeof value.student_id === "string" &&
    (value.source === "cloud" || value.source === "fallback") &&
    typeof value.is_database_configured === "boolean" &&
    (value.evidence === null ||
      isStudentProfileEvidenceSummary(value.evidence)) &&
    isStringArray(value.warnings)
  );
}

function isStudentProfileEvidenceSummary(
  value: unknown,
): value is StudentProfileEvidenceSummary {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "event_count",
      "latest_event_at",
      "top_knowledge_focus",
      "top_mistake_causes",
      "recent_events",
    ])
  ) {
    return false;
  }

  return (
    typeof value.event_count === "number" &&
    Number.isInteger(value.event_count) &&
    value.event_count >= 0 &&
    (value.latest_event_at === null ||
      typeof value.latest_event_at === "string") &&
    Array.isArray(value.top_knowledge_focus) &&
    value.top_knowledge_focus.every(isKnowledgeEvidenceSummary) &&
    Array.isArray(value.top_mistake_causes) &&
    value.top_mistake_causes.every(isMistakeCauseEvidenceSummary) &&
    Array.isArray(value.recent_events) &&
    value.recent_events.every(isRecentProfileEvidenceEvent)
  );
}

function isKnowledgeEvidenceSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "id",
      "event_count",
      "total_weakness_delta",
      "latest_event_at",
    ]) &&
    typeof value.id === "string" &&
    isNonNegativeInteger(value.event_count) &&
    isFiniteNonNegativeNumber(value.total_weakness_delta) &&
    typeof value.latest_event_at === "string"
  );
}

function isMistakeCauseEvidenceSummary(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "event_count", "total_delta", "latest_event_at"]) &&
    typeof value.id === "string" &&
    isNonNegativeInteger(value.event_count) &&
    isFiniteNonNegativeNumber(value.total_delta) &&
    typeof value.latest_event_at === "string"
  );
}

function isRecentProfileEvidenceEvent(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "id",
      "created_at",
      "event_type",
      "evidence_level",
      "persistence_evidence",
      "knowledge_focus",
      "mistake_causes",
      "rationale_summary",
    ]) &&
    typeof value.id === "string" &&
    typeof value.created_at === "string" &&
    (value.event_type === "mistake_cause" ||
      value.event_type === "problem_type_focus") &&
    (value.evidence_level === null ||
      typeof value.evidence_level === "string") &&
    (value.persistence_evidence === null ||
      typeof value.persistence_evidence === "string") &&
    isStringArray(value.knowledge_focus) &&
    isStringArray(value.mistake_causes) &&
    typeof value.rationale_summary === "string"
  );
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: string[],
): boolean {
  return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
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
