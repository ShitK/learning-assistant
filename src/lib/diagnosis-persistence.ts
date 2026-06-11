import { createHash } from "node:crypto";

import {
  createSupabaseAdminClient,
  getSupabaseAdminConfig,
} from "@/lib/supabase-admin";
import type {
  DiagnoseImageSuccessResponse,
  DiagnoseSuccessResponse,
  EvidenceLevel,
  PersistenceEvidence,
  ProfileUpdateKind,
} from "@/lib/diagnose-api";

export const DATABASE_NOT_CONFIGURED_WARNING =
  "数据库暂未配置，本次只返回诊断报告。";
export const DATABASE_WRITE_FAILED_WARNING =
  "错题本写入失败，本次诊断报告已保留。";
export const DUPLICATE_MISTAKE_BOOK_ITEM_WARNING = "本题已加入错题本。";

export interface DiagnosisPersistencePayload {
  p_student_id: string;
  p_student_display_name: string;
  p_student_grade: string;
  p_client_diagnosis_id: string;
  p_source: "sample" | "image";
  p_evidence_level: EvidenceLevel | null;
  p_persistence_evidence: PersistenceEvidence | null;
  p_profile_update_kind: ProfileUpdateKind;
  p_recognized_question: unknown;
  p_knowledge_mapping: unknown;
  p_mistake_diagnosis: unknown;
  p_memory_delta: DiagnoseSuccessResponse["memory_delta"];
  p_student_profile_snapshot: DiagnoseSuccessResponse["student_profile"];
  p_practice_questions: unknown;
  p_review_plan: unknown;
  p_warnings: string[];
  p_question_text: string;
  p_student_answer: string;
  p_standard_solution: string;
  p_knowledge_points: string[];
  p_mistake_causes: string[];
  p_severity: DiagnoseSuccessResponse["mistake_diagnosis"]["severity"];
  p_diagnosis_summary: string;
  p_question_fingerprint: string;
}

export type DiagnosisPersistenceResult =
  | { status: "persisted" }
  | { status: "duplicate" }
  | { status: "skipped" }
  | { status: "disabled" }
  | { status: "failed" };

export interface DiagnosisPersistenceRepository {
  persistDiagnosis(
    payload: DiagnosisPersistencePayload,
  ): Promise<DiagnosisPersistenceResult>;
}

export interface SupabaseDiagnosisPersistenceRpcClient {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<{ data?: unknown; error: unknown }>;
}

type PersistableDiagnosisResponse =
  | DiagnoseSuccessResponse
  | DiagnoseImageSuccessResponse;

export function createDiagnosisPersistencePayload(
  response: PersistableDiagnosisResponse,
): DiagnosisPersistencePayload | null {
  if (!response.memory_delta.should_persist) {
    return null;
  }

  const policy = getPersistencePolicy(response);
  if (
    policy.profile_update_kind === "none" ||
    policy.persistence_evidence === "none"
  ) {
    return null;
  }

  return {
    p_student_id: response.student_id,
    p_student_display_name: response.student_id,
    p_student_grade: response.student_profile.grade,
    p_client_diagnosis_id: response.diagnosis_id,
    p_source: response.source,
    p_evidence_level: policy.evidence_level,
    p_persistence_evidence: policy.persistence_evidence,
    p_profile_update_kind: policy.profile_update_kind,
    p_recognized_question: response.recognized_question,
    p_knowledge_mapping: response.knowledge_mapping,
    p_mistake_diagnosis: response.mistake_diagnosis,
    p_memory_delta: response.memory_delta,
    p_student_profile_snapshot: response.student_profile,
    p_practice_questions: response.practice_questions,
    p_review_plan: response.review_plan,
    p_warnings: response.warnings,
    p_question_text: response.recognized_question.question_text,
    p_student_answer: response.recognized_question.student_answer,
    p_standard_solution: response.mistake_diagnosis.standard_solution,
    p_knowledge_points: response.knowledge_mapping.knowledge_points,
    p_mistake_causes: response.mistake_diagnosis.mistake_causes,
    p_severity: response.mistake_diagnosis.severity,
    p_diagnosis_summary: response.mistake_diagnosis.expected_diagnosis,
    p_question_fingerprint: createQuestionFingerprint(
      response.recognized_question.question_text,
    ),
  };
}

export function createQuestionFingerprint(questionText: string): string {
  const normalizedQuestionText = questionText
    .replace(/[，。；：！？、]/gu, "")
    .normalize("NFKC")
    .replace(/\s+/gu, "");

  return createHash("sha256").update(normalizedQuestionText).digest("hex");
}

export async function persistDiagnosisResponse(
  response: PersistableDiagnosisResponse,
  repository?: DiagnosisPersistenceRepository,
): Promise<DiagnosisPersistenceResult> {
  const payload = createDiagnosisPersistencePayload(response);
  if (!payload) {
    return { status: "skipped" };
  }

  try {
    const activeRepository =
      repository ?? createDefaultDiagnosisPersistenceRepository();
    return await activeRepository.persistDiagnosis(payload);
  } catch {
    return { status: "failed" };
  }
}

export function createDefaultDiagnosisPersistenceRepository(): DiagnosisPersistenceRepository {
  const config = getSupabaseAdminConfig();
  if (!config.ok) {
    return createDisabledDiagnosisPersistenceRepository();
  }

  const client = createSupabaseAdminClient(config.value);
  return createSupabaseDiagnosisPersistenceRepository(client);
}

export function createSupabaseDiagnosisPersistenceRepository(
  client: SupabaseDiagnosisPersistenceRpcClient,
): DiagnosisPersistenceRepository {
  return {
    async persistDiagnosis(payload) {
      const { data, error } = await client.rpc(
        "persist_mathtrace_diagnosis",
        toRpcParams(payload),
      );

      if (error) {
        return { status: "failed" };
      }

      if (hasDuplicatePersistenceStatus(data)) {
        return { status: "duplicate" };
      }

      return { status: "persisted" };
    },
  };
}

export function createDisabledDiagnosisPersistenceRepository(): DiagnosisPersistenceRepository {
  return {
    async persistDiagnosis() {
      return { status: "disabled" };
    },
  };
}

function getPersistencePolicy(response: PersistableDiagnosisResponse): {
  evidence_level: EvidenceLevel | null;
  persistence_evidence: PersistenceEvidence | null;
  profile_update_kind: ProfileUpdateKind;
} {
  if (response.source === "sample") {
    return {
      evidence_level: null,
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
    };
  }

  return {
    evidence_level: response.evidence_level,
    persistence_evidence: response.persistence_evidence,
    profile_update_kind: response.profile_update_kind,
  };
}

function toRpcParams(
  payload: DiagnosisPersistencePayload,
): Record<string, unknown> {
  return { ...payload };
}

function hasDuplicatePersistenceStatus(data: unknown): boolean {
  if (!Array.isArray(data)) {
    return false;
  }

  return data.some((row) => {
    return (
      typeof row === "object" &&
      row !== null &&
      "persistence_status" in row &&
      row.persistence_status === "duplicate"
    );
  });
}
