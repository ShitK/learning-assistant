import { sampleDiagnoses } from "@/data/mathtrace-demo";
import { isRecord } from "@/lib/shared/utils";
import type { DiagnoseErrorCode } from "@/lib/shared/diagnose-error";
import type {
  EvidenceLevel,
  PersistenceEvidence,
  ProblemRiskFollowUp,
  ProfileUpdateKind,
} from "@/lib/diagnosis/diagnosis-evidence";
import type {
  AgentStep,
  MemoryDelta,
  PracticeQuestion,
  ReviewPlan,
  SampleDiagnosis,
  SampleQuestionId,
  Severity,
  StudentProfile,
} from "@/data/mathtrace-demo";
import type { ProviderFailureDebug } from "@/lib/shared/provider-error";
import type { VisionExtractionDebugSummary } from "@/lib/vision-extraction/vision-extraction-types";

export type {
  ConfirmationAction,
  EvidenceLevel,
  FollowUpAnswerDraft,
  PersistenceEvidence,
  ProblemRiskFollowUp,
  ProfileUpdateKind,
} from "@/lib/diagnosis/diagnosis-evidence";
export type { DiagnoseErrorCode } from "@/lib/shared/diagnose-error";

export type DiagnoseTaskType = "sample_diagnosis" | "image_diagnosis";

export interface ParsedSampleDiagnoseRequest {
  student_id: string;
  task_type: "sample_diagnosis";
  sample_question_id: SampleQuestionId;
  image_base64: string | null;
  student_profile: unknown;
  mistake_history: unknown[];
}

export interface ParsedImageDiagnoseRequest {
  student_id: string;
  task_type: "image_diagnosis";
  sample_question_id: SampleQuestionId | null;
  image_base64: string | null;
  image_mime_type: unknown;
  student_profile: unknown;
  mistake_history: unknown[];
}

export type ParsedDiagnoseRequest =
  | ParsedSampleDiagnoseRequest
  | ParsedImageDiagnoseRequest;

export interface RecognizedQuestion {
  id: SampleQuestionId;
  title: string;
  module: string;
  question_text: string;
  student_answer: string;
}

export interface ImageRecognizedQuestion {
  id: string;
  title: string;
  module: string;
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  extraction_confidence: "high" | "medium" | "low";
}

export interface ImageExtractionReviewDraft {
  id: string;
  title: string;
  module: string;
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  standard_solution_draft: string;
  extraction_confidence: "high" | "medium" | "low";
}

export interface KnowledgeMapping {
  knowledge_points: string[];
  difficulty: number;
}

export interface MistakeDiagnosis {
  mistake_causes: string[];
  severity: Severity;
  expected_diagnosis: string;
  step_analysis: string[];
  solution_highlights: string[];
  standard_solution: string;
}

export interface DiagnoseSuccessResponse {
  diagnosis_id: string;
  student_id: string;
  source: "sample";
  steps: AgentStep[];
  recognized_question: RecognizedQuestion;
  knowledge_mapping: KnowledgeMapping;
  mistake_diagnosis: MistakeDiagnosis;
  memory_delta: MemoryDelta;
  student_profile: StudentProfile;
  practice_questions: PracticeQuestion[];
  review_plan: ReviewPlan;
  sample_diagnosis: SampleDiagnosis;
  fallback_used: false;
  warnings: string[];
}

export interface DiagnoseImageSuccessResponse {
  diagnosis_id: string;
  student_id: string;
  source: "image";
  steps: AgentStep[];
  recognized_question: ImageRecognizedQuestion;
  knowledge_mapping: KnowledgeMapping;
  mistake_diagnosis: MistakeDiagnosis;
  memory_delta: MemoryDelta;
  student_profile: StudentProfile;
  practice_questions: PracticeQuestion[];
  review_plan: ReviewPlan;
  sample_diagnosis: null;
  fallback_used: false;
  evidence_level: EvidenceLevel;
  persistence_evidence: PersistenceEvidence;
  profile_update_kind: ProfileUpdateKind;
  risk_follow_up: ProblemRiskFollowUp | null;
  warnings: string[];
}

export interface DiagnoseImageExtractionResponse {
  diagnosis_id: string;
  student_id: string;
  source: "image";
  stage: "extraction_review";
  recognized_question: ImageExtractionReviewDraft;
  requires_confirmation: true;
  can_persist_after_confirmation: boolean;
  confirmation_token: string;
  sample_diagnosis: null;
  fallback_used: false;
  warnings: string[];
}

export interface DiagnoseErrorResponse {
  error: {
    code: DiagnoseErrorCode;
    message: string;
    recoverable: boolean;
  };
  fallback_used: boolean;
  warnings: string[];
  debug_summary?: VisionExtractionDebugSummary;
  provider_debug?: ProviderFailureDebug;
}

export type DiagnoseApiResponse =
  | DiagnoseSuccessResponse
  | DiagnoseImageSuccessResponse
  | DiagnoseImageExtractionResponse
  | DiagnoseErrorResponse;

type ParseDiagnoseResult =
  | {
      ok: true;
      value: ParsedDiagnoseRequest;
    }
  | {
      ok: false;
      response: DiagnoseErrorResponse;
    };

export function parseDiagnoseRequest(payload: unknown): ParseDiagnoseResult {
  if (!isRecord(payload)) {
    return invalidRequest("请求体必须是 JSON 对象。");
  }

  if (!isNonEmptyString(payload.student_id)) {
    return invalidRequest("缺少 student_id。");
  }

  if (payload.student_id.trim() !== "demo_student_001") {
    return invalidRequest("当前阶段只支持 demo_student_001。");
  }

  if (!isDiagnoseTaskType(payload.task_type)) {
    return invalidRequest("task_type 只能是 sample_diagnosis 或 image_diagnosis。");
  }

  const imageBase64 = parseOptionalString(payload.image_base64);
  if (imageBase64 === undefined) {
    return invalidRequest("image_base64 必须是字符串或 null。");
  }

  const mistakeHistory = Array.isArray(payload.mistake_history)
    ? payload.mistake_history
    : [];

  if (payload.task_type === "image_diagnosis") {
    return {
      ok: true,
      value: {
        student_id: payload.student_id.trim(),
        task_type: payload.task_type,
        sample_question_id: parseNullableSampleQuestionId(
          payload.sample_question_id,
        ),
        image_base64: imageBase64,
        image_mime_type: payload.image_mime_type,
        student_profile: payload.student_profile,
        mistake_history: mistakeHistory,
      },
    };
  }

  if (!isNonEmptyString(payload.sample_question_id)) {
    return {
      ok: false,
      response: createDiagnoseError(
        "missing_sample_question_id",
        "请选择一个样例题后再开始诊断。",
        true,
      ),
    };
  }

  if (!isSampleQuestionId(payload.sample_question_id)) {
    return {
      ok: false,
      response: createDiagnoseError(
        "unknown_sample_question_id",
        "未找到这个样例题，请重新选择。",
        true,
      ),
    };
  }

  return {
    ok: true,
    value: {
      student_id: payload.student_id.trim(),
      task_type: payload.task_type,
      sample_question_id: payload.sample_question_id,
      image_base64: imageBase64,
      student_profile: payload.student_profile,
      mistake_history: mistakeHistory,
    },
  };
}

export function createDiagnoseError(
  code: DiagnoseErrorCode,
  message: string,
  recoverable: boolean,
  fallbackUsed = false,
  debugSummary?: VisionExtractionDebugSummary,
  providerDebug?: ProviderFailureDebug,
): DiagnoseErrorResponse {
  return {
    error: {
      code,
      message,
      recoverable,
    },
    fallback_used: fallbackUsed,
    warnings: [],
    debug_summary: debugSummary,
    provider_debug: providerDebug,
  };
}

export function isDiagnoseSuccessResponse(
  value: unknown,
): value is DiagnoseSuccessResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (value.fallback_used !== false || value.source !== "sample") {
    return false;
  }

  if (!isRecord(value.sample_diagnosis)) {
    return false;
  }

  return isSampleQuestionId(value.sample_diagnosis.id);
}

export function isDiagnoseImageSuccessResponse(
  value: unknown,
): value is DiagnoseImageSuccessResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (value.fallback_used !== false || value.source !== "image") {
    return false;
  }

  if (value.sample_diagnosis !== null) {
    return false;
  }

  if (!isRecord(value.recognized_question)) {
    return false;
  }

  if (!isImageRecognizedQuestion(value.recognized_question)) {
    return false;
  }

  if (!isKnowledgeMapping(value.knowledge_mapping)) {
    return false;
  }

  if (!isMistakeDiagnosis(value.mistake_diagnosis)) {
    return false;
  }

  if (!isMemoryDelta(value.memory_delta)) {
    return false;
  }

  if (!isEvidenceLevel(value.evidence_level)) {
    return false;
  }

  if (!isPersistenceEvidence(value.persistence_evidence)) {
    return false;
  }

  if (!isProfileUpdateKind(value.profile_update_kind)) {
    return false;
  }

  if (
    value.risk_follow_up !== null &&
    !isProblemRiskFollowUp(value.risk_follow_up)
  ) {
    return false;
  }

  if (
    !isImageEvidencePolicyConsistent({
      evidence_level: value.evidence_level,
      persistence_evidence: value.persistence_evidence,
      profile_update_kind: value.profile_update_kind,
      risk_follow_up: value.risk_follow_up,
      memory_delta: value.memory_delta,
      mistake_diagnosis: value.mistake_diagnosis,
    })
  ) {
    return false;
  }

  if (
    value.recognized_question.extraction_confidence === "low" &&
    value.memory_delta.should_persist &&
    value.profile_update_kind === "mistake_cause"
  ) {
    return false;
  }

  return (
    typeof value.diagnosis_id === "string" &&
    typeof value.student_id === "string" &&
    Array.isArray(value.steps) &&
    value.steps.every(isAgentStep) &&
    isStudentProfile(value.student_profile) &&
    Array.isArray(value.practice_questions) &&
    value.practice_questions.every(isPracticeQuestion) &&
    isReviewPlan(value.review_plan) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isString)
  );
}

export function isDiagnoseImageExtractionResponse(
  value: unknown,
): value is DiagnoseImageExtractionResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.fallback_used !== false ||
    value.source !== "image" ||
    value.stage !== "extraction_review"
  ) {
    return false;
  }

  if (value.sample_diagnosis !== null) {
    return false;
  }

  if (!isImageExtractionReviewDraft(value.recognized_question)) {
    return false;
  }

  if (
    value.can_persist_after_confirmation !==
    (value.recognized_question.extraction_confidence !== "low")
  ) {
    return false;
  }

  return (
    typeof value.diagnosis_id === "string" &&
    typeof value.student_id === "string" &&
    value.requires_confirmation === true &&
    typeof value.can_persist_after_confirmation === "boolean" &&
    typeof value.confirmation_token === "string" &&
    value.confirmation_token.length > 0 &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isString)
  );
}

function isImageRecognizedQuestion(
  value: unknown,
): value is ImageRecognizedQuestion {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.module === "string" &&
    typeof value.question_text === "string" &&
    typeof value.student_answer === "string" &&
    Array.isArray(value.student_solution_steps) &&
    value.student_solution_steps.every(isString) &&
    (value.extraction_confidence === "high" ||
      value.extraction_confidence === "medium" ||
      value.extraction_confidence === "low")
  );
}

function isImageExtractionReviewDraft(
  value: unknown,
): value is ImageExtractionReviewDraft {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.module === "string" &&
    typeof value.question_text === "string" &&
    typeof value.student_answer === "string" &&
    Array.isArray(value.student_solution_steps) &&
    value.student_solution_steps.every(isString) &&
    typeof value.standard_solution_draft === "string" &&
    (value.extraction_confidence === "high" ||
      value.extraction_confidence === "medium" ||
      value.extraction_confidence === "low")
  );
}

function isKnowledgeMapping(value: unknown): value is KnowledgeMapping {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.knowledge_points) &&
    value.knowledge_points.every(isString) &&
    typeof value.difficulty === "number"
  );
}

function isMistakeDiagnosis(value: unknown): value is MistakeDiagnosis {
  if (!isRecord(value)) {
    return false;
  }

  return (
    Array.isArray(value.mistake_causes) &&
    value.mistake_causes.every(isString) &&
    isSeverity(value.severity) &&
    typeof value.expected_diagnosis === "string" &&
    Array.isArray(value.step_analysis) &&
    value.step_analysis.every(isString) &&
    Array.isArray(value.solution_highlights) &&
    value.solution_highlights.every(isString) &&
    typeof value.standard_solution === "string"
  );
}

function isMemoryDelta(value: unknown): value is MemoryDelta {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNumberRecord(value.knowledge_mastery_changes) &&
    isNumberRecord(value.mistake_cause_changes) &&
    typeof value.is_repeated_mistake === "boolean" &&
    Array.isArray(value.review_priority_changes) &&
    value.review_priority_changes.every(isString) &&
    typeof value.should_persist === "boolean" &&
    typeof value.rationale === "string"
  );
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
    Array.isArray(value.weak_modules) &&
    value.weak_modules.every(isString) &&
    Array.isArray(value.review_priority) &&
    value.review_priority.every(isString) &&
    typeof value.recent_trend === "string" &&
    Array.isArray(value.gaokao_focus) &&
    value.gaokao_focus.every(isGaokaoFocusItem) &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

function isGaokaoFocusItem(
  value: unknown,
): value is StudentProfile["gaokao_focus"][number] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.knowledge_point === "string" &&
    typeof value.reason === "string" &&
    typeof value.priority === "number"
  );
}

function isPracticeQuestion(value: unknown): value is PracticeQuestion {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.level === "basic" ||
      value.level === "transfer" ||
      value.level === "gaokao_style") &&
    typeof value.question === "string" &&
    typeof value.training_goal === "string"
  );
}

function isReviewPlan(value: unknown): value is ReviewPlan {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.tomorrow === "string" &&
    Array.isArray(value.seven_days) &&
    value.seven_days.every(isReviewPlanDay) &&
    Array.isArray(value.rationale) &&
    value.rationale.every(isString)
  );
}

function isReviewPlanDay(value: unknown): value is ReviewPlan["seven_days"][number] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.day === "number" &&
    typeof value.topic === "string" &&
    typeof value.task === "string" &&
    typeof value.estimated_minutes === "number"
  );
}

function isEvidenceLevel(value: unknown): value is EvidenceLevel {
  return (
    value === "student_work_sufficient" ||
    value === "problem_only" ||
    value === "insufficient"
  );
}

function isPersistenceEvidence(value: unknown): value is PersistenceEvidence {
  return (
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

function isProblemRiskFollowUp(value: unknown): value is ProblemRiskFollowUp {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.problem_type === "string" &&
    Array.isArray(value.knowledge_points) &&
    value.knowledge_points.every(isString) &&
    Array.isArray(value.common_stuck_points) &&
    value.common_stuck_points.every(isCommonStuckPoint) &&
    typeof value.standard_solution_summary === "string" &&
    typeof value.prompt === "string"
  );
}

function isCommonStuckPoint(value: unknown): value is ProblemRiskFollowUp["common_stuck_points"][number] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.related_mistake_cause === "string"
  );
}

function isImageEvidencePolicyConsistent(value: {
  evidence_level: EvidenceLevel;
  persistence_evidence: PersistenceEvidence;
  profile_update_kind: ProfileUpdateKind;
  risk_follow_up: ProblemRiskFollowUp | null;
  memory_delta: MemoryDelta;
  mistake_diagnosis: MistakeDiagnosis;
}): boolean {
  if (!value.memory_delta.should_persist) {
    return (
      value.persistence_evidence === "none" &&
      value.profile_update_kind === "none"
    );
  }

  if (value.evidence_level === "insufficient") {
    return false;
  }

  if (value.evidence_level === "student_work_sufficient") {
    return (
      value.persistence_evidence === "student_work" &&
      value.profile_update_kind === "mistake_cause" &&
      value.risk_follow_up === null
    );
  }

  if (value.evidence_level !== "problem_only") {
    return false;
  }

  if (value.risk_follow_up === null) {
    return false;
  }

  if (value.profile_update_kind === "problem_type_focus") {
    return (
      value.persistence_evidence === "uploaded_problem_only" &&
      Object.keys(value.memory_delta.mistake_cause_changes).length === 0 &&
      value.mistake_diagnosis.mistake_causes.length === 0
    );
  }

  return (
    value.profile_update_kind === "mistake_cause" &&
    value.persistence_evidence === "user_confirmed"
  );
}

function isAgentStep(value: unknown): value is AgentStep {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.display_name === "string" &&
    typeof value.duration_ms === "number" &&
    typeof value.summary === "string"
  );
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === "number");
}

function isSeverity(value: unknown): value is Severity {
  return value === "minor" || value === "medium" || value === "severe";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function invalidRequest(message: string): ParseDiagnoseResult {
  return {
    ok: false,
    response: createDiagnoseError("invalid_request", message, true),
  };
}

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return undefined;
}

function parseNullableSampleQuestionId(
  value: unknown,
): SampleQuestionId | null {
  if (isSampleQuestionId(value)) {
    return value;
  }

  return null;
}

function isDiagnoseTaskType(value: unknown): value is DiagnoseTaskType {
  return value === "sample_diagnosis" || value === "image_diagnosis";
}

function isSampleQuestionId(value: unknown): value is SampleQuestionId {
  return (
    typeof value === "string" &&
    sampleDiagnoses.some((sample) => sample.id === value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
