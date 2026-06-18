import {
  createDefaultStudentProfileRepository,
  DEMO_STUDENT_ID,
  type ProfileEvidenceEvent,
  type StudentProfileEvidenceRepository,
} from "@/lib/persistence/student-profile-persistence";
import { isRecord } from "@/lib/shared/utils";

export const PROFILE_EVIDENCE_READ_NOT_CONFIGURED_WARNING =
  "数据库暂未配置，继续使用本地 demo 画像依据。";
export const PROFILE_EVIDENCE_READ_FAILED_WARNING =
  "云端画像证据暂时读取失败，继续使用本地 demo 画像依据。";
export const PROFILE_EVIDENCE_NOT_FOUND_WARNING =
  "云端画像证据暂未生成，继续使用本地 demo 画像依据。";

const DEFAULT_EVIDENCE_LIMIT = 8;
const MIN_EVIDENCE_LIMIT = 1;
const MAX_EVIDENCE_LIMIT = 20;
const MAX_SUMMARY_ITEMS = 5;
const MAX_RATIONALE_SUMMARY_LENGTH = 80;

export interface KnowledgeEvidenceSummary {
  id: string;
  event_count: number;
  total_weakness_delta: number;
  latest_event_at: string;
}

export interface MistakeCauseEvidenceSummary {
  id: string;
  event_count: number;
  total_delta: number;
  latest_event_at: string;
}

export interface RecentProfileEvidenceEvent {
  id: string;
  created_at: string;
  event_type: "mistake_cause" | "problem_type_focus";
  evidence_level: string | null;
  persistence_evidence: string | null;
  knowledge_focus: string[];
  mistake_causes: string[];
  rationale_summary: string;
}

export interface StudentProfileEvidenceSummary {
  event_count: number;
  latest_event_at: string | null;
  top_knowledge_focus: KnowledgeEvidenceSummary[];
  top_mistake_causes: MistakeCauseEvidenceSummary[];
  recent_events: RecentProfileEvidenceEvent[];
}

export interface StudentProfileEvidenceResponse {
  student_id: string;
  source: "cloud" | "fallback";
  is_database_configured: boolean;
  evidence: StudentProfileEvidenceSummary | null;
  warnings: string[];
}

export interface StudentProfileEvidenceErrorResponse {
  error: {
    code: "invalid_request";
    message: string;
    recoverable: true;
  };
}

export interface StudentProfileEvidenceRequestResult {
  status: number;
  body: StudentProfileEvidenceResponse | StudentProfileEvidenceErrorResponse;
}

export async function handleStudentProfileEvidenceRequest(
  searchParams: URLSearchParams | Record<string, string | undefined>,
  repository: StudentProfileEvidenceRepository = createDefaultStudentProfileRepository(),
): Promise<StudentProfileEvidenceRequestResult> {
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
    return fallbackEvidenceResponse(false, PROFILE_EVIDENCE_READ_NOT_CONFIGURED_WARNING);
  }

  try {
    const limit = parseEvidenceLimit(getSearchParam(searchParams, "limit"));
    const events = await repository.listProfileEvidenceEvents(student_id, limit);
    if (events.length === 0) {
      return fallbackEvidenceResponse(true, PROFILE_EVIDENCE_NOT_FOUND_WARNING);
    }

    return {
      status: 200,
      body: {
        student_id,
        source: "cloud",
        is_database_configured: true,
        evidence: createStudentProfileEvidenceSummary(events),
        warnings: [],
      },
    };
  } catch {
    return fallbackEvidenceResponse(true, PROFILE_EVIDENCE_READ_FAILED_WARNING);
  }
}

export function createStudentProfileEvidenceSummary(
  events: ProfileEvidenceEvent[],
): StudentProfileEvidenceSummary {
  const sortedEvents = [...events].sort(compareEventsDesc);

  return {
    event_count: sortedEvents.length,
    latest_event_at: sortedEvents[0]?.created_at ?? null,
    top_knowledge_focus: createKnowledgeEvidenceSummary(sortedEvents),
    top_mistake_causes: createMistakeCauseEvidenceSummary(sortedEvents),
    recent_events: sortedEvents.map(toRecentProfileEvidenceEvent),
  };
}

function createKnowledgeEvidenceSummary(
  events: ProfileEvidenceEvent[],
): KnowledgeEvidenceSummary[] {
  const byId = new Map<string, KnowledgeEvidenceSummary>();

  for (const event of events) {
    const ids = uniqueStrings([
      ...Object.keys(event.knowledge_mastery_changes),
      ...event.review_priority_changes,
    ]);

    for (const id of ids) {
      const masteryDelta = event.knowledge_mastery_changes[id] ?? 0;
      const weaknessDelta = Number.isFinite(masteryDelta)
        ? Math.max(0, -masteryDelta)
        : 0;
      const existing = byId.get(id);

      if (existing) {
        existing.event_count += 1;
        existing.total_weakness_delta += weaknessDelta;
        if (event.created_at > existing.latest_event_at) {
          existing.latest_event_at = event.created_at;
        }
      } else {
        byId.set(id, {
          id,
          event_count: 1,
          total_weakness_delta: weaknessDelta,
          latest_event_at: event.created_at,
        });
      }
    }
  }

  return [...byId.values()]
    .sort(compareKnowledgeEvidence)
    .slice(0, MAX_SUMMARY_ITEMS);
}

function createMistakeCauseEvidenceSummary(
  events: ProfileEvidenceEvent[],
): MistakeCauseEvidenceSummary[] {
  const byId = new Map<string, MistakeCauseEvidenceSummary>();

  for (const event of events) {
    for (const [id, rawDelta] of Object.entries(event.mistake_cause_changes)) {
      if (!Number.isFinite(rawDelta) || rawDelta <= 0) {
        continue;
      }

      const existing = byId.get(id);
      if (existing) {
        existing.event_count += 1;
        existing.total_delta += rawDelta;
        if (event.created_at > existing.latest_event_at) {
          existing.latest_event_at = event.created_at;
        }
      } else {
        byId.set(id, {
          id,
          event_count: 1,
          total_delta: rawDelta,
          latest_event_at: event.created_at,
        });
      }
    }
  }

  return [...byId.values()]
    .sort(compareMistakeCauseEvidence)
    .slice(0, MAX_SUMMARY_ITEMS);
}

function toRecentProfileEvidenceEvent(
  event: ProfileEvidenceEvent,
): RecentProfileEvidenceEvent {
  return {
    id: event.id,
    created_at: event.created_at,
    event_type: event.event_type,
    evidence_level: event.evidence_level,
    persistence_evidence: event.persistence_evidence,
    knowledge_focus: uniqueStrings([
      ...Object.keys(event.knowledge_mastery_changes),
      ...event.review_priority_changes,
    ]),
    mistake_causes: Object.entries(event.mistake_cause_changes)
      .filter(([, delta]) => Number.isFinite(delta) && delta > 0)
      .map(([id]) => id),
    rationale_summary: summarizeRationale(event.rationale),
  };
}

function summarizeRationale(rationale: string): string {
  const trimmedRationale = rationale.trim();
  if (trimmedRationale.length === 0) {
    return "本次诊断产生了可写入画像的薄弱证据。";
  }

  if (trimmedRationale.length <= MAX_RATIONALE_SUMMARY_LENGTH) {
    return trimmedRationale;
  }

  return `${trimmedRationale.slice(0, MAX_RATIONALE_SUMMARY_LENGTH - 1)}…`;
}

function parseEvidenceLimit(value: string | undefined): number {
  if (!value) {
    return DEFAULT_EVIDENCE_LIMIT;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return DEFAULT_EVIDENCE_LIMIT;
  }

  if (parsed < MIN_EVIDENCE_LIMIT || parsed > MAX_EVIDENCE_LIMIT) {
    return DEFAULT_EVIDENCE_LIMIT;
  }

  return parsed;
}

function fallbackEvidenceResponse(
  is_database_configured: boolean,
  warning: string,
): StudentProfileEvidenceRequestResult {
  return {
    status: 200,
    body: {
      student_id: DEMO_STUDENT_ID,
      source: "fallback",
      is_database_configured,
      evidence: null,
      warnings: [warning],
    },
  };
}

function getSearchParam(
  searchParams: URLSearchParams | Record<string, string | undefined>,
  key: string,
): string | undefined {
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get(key) ?? undefined;
  }

  if (!isRecord(searchParams)) {
    return undefined;
  }

  const value = searchParams[key];
  return typeof value === "string" ? value : undefined;
}

function compareEventsDesc(
  left: ProfileEvidenceEvent,
  right: ProfileEvidenceEvent,
): number {
  return (
    right.created_at.localeCompare(left.created_at) ||
    right.id.localeCompare(left.id)
  );
}

function compareKnowledgeEvidence(
  left: KnowledgeEvidenceSummary,
  right: KnowledgeEvidenceSummary,
): number {
  return (
    right.total_weakness_delta - left.total_weakness_delta ||
    right.event_count - left.event_count ||
    right.latest_event_at.localeCompare(left.latest_event_at) ||
    left.id.localeCompare(right.id)
  );
}

function compareMistakeCauseEvidence(
  left: MistakeCauseEvidenceSummary,
  right: MistakeCauseEvidenceSummary,
): number {
  return (
    right.total_delta - left.total_delta ||
    right.event_count - left.event_count ||
    right.latest_event_at.localeCompare(left.latest_event_at) ||
    left.id.localeCompare(right.id)
  );
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, allValues) => {
    return value.length > 0 && allValues.indexOf(value) === index;
  });
}
