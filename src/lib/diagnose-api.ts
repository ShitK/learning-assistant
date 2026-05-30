import { sampleDiagnoses } from "@/data/mathtrace-demo";
import { isRecord } from "@/lib/utils";
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
  warnings: string[];
}

export type DiagnoseErrorCode =
  | "invalid_json"
  | "invalid_request"
  | "missing_sample_question_id"
  | "unknown_sample_question_id"
  | "missing_image"
  | "invalid_image"
  | "image_too_large"
  | "model_not_configured"
  | "model_timeout"
  | "model_request_failed"
  | "model_invalid_output";

export interface DiagnoseErrorResponse {
  error: {
    code: DiagnoseErrorCode;
    message: string;
    recoverable: boolean;
  };
  fallback_used: boolean;
  warnings: string[];
}

export type DiagnoseApiResponse =
  | DiagnoseSuccessResponse
  | DiagnoseImageSuccessResponse
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
        student_id: payload.student_id,
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
      student_id: payload.student_id,
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
): DiagnoseErrorResponse {
  return {
    error: {
      code,
      message,
      recoverable,
    },
    fallback_used: fallbackUsed,
    warnings: [],
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
