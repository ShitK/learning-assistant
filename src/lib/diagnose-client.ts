import {
  isDiagnoseImageExtractionResponse,
  isDiagnoseImageSuccessResponse,
  isDiagnoseSuccessResponse,
} from "@/lib/diagnose-api";
import { isProviderFailureDebug } from "@/lib/provider-error";
import { isRecord } from "@/lib/utils";
import type {
  DiagnoseApiResponse,
  DiagnoseImageExtractionResponse,
  DiagnoseImageSuccessResponse,
  DiagnoseSuccessResponse,
  DiagnoseErrorResponse,
} from "@/lib/diagnose-api";
import type {
  MistakeHistoryItem,
  SampleQuestionId,
  StudentProfile,
} from "@/data/mathtrace-demo";
import type { VisionExtractionDraft } from "@/lib/vision-extraction-parser";

export interface SampleDiagnosePayload {
  student_id: string;
  task_type: "sample_diagnosis";
  sample_question_id: SampleQuestionId;
  image_base64: null;
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}

export interface ImageDiagnosePayload {
  student_id: string;
  task_type: "image_diagnosis";
  sample_question_id: null;
  image_base64: string;
  image_mime_type: "image/png" | "image/jpeg" | "image/webp";
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}

export interface ConfirmedImageDiagnosePayload {
  student_id: string;
  task_type: "confirmed_image_diagnosis";
  confirmation_token: string;
  confirmed_extraction: VisionExtractionDraft;
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}

export function buildSampleDiagnosePayload(input: {
  sample_question_id: SampleQuestionId;
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}): SampleDiagnosePayload {
  return {
    student_id: input.student_profile.student_id,
    task_type: "sample_diagnosis",
    sample_question_id: input.sample_question_id,
    image_base64: null,
    student_profile: input.student_profile,
    mistake_history: input.mistake_history,
  };
}

export function buildImageDiagnosePayload(input: {
  image_base64: string;
  image_mime_type: ImageDiagnosePayload["image_mime_type"];
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}): ImageDiagnosePayload {
  return {
    student_id: input.student_profile.student_id,
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: input.image_base64,
    image_mime_type: input.image_mime_type,
    student_profile: input.student_profile,
    mistake_history: input.mistake_history,
  };
}

export function buildConfirmedImageDiagnosePayload(input: {
  confirmation_token: string;
  confirmed_extraction: VisionExtractionDraft;
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}): ConfirmedImageDiagnosePayload {
  return {
    student_id: input.student_profile.student_id,
    task_type: "confirmed_image_diagnosis",
    confirmation_token: input.confirmation_token,
    confirmed_extraction: input.confirmed_extraction,
    student_profile: input.student_profile,
    mistake_history: input.mistake_history,
  };
}

export async function requestSampleDiagnosis(input: {
  fetcher: typeof fetch;
  sample_question_id: SampleQuestionId;
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}): Promise<DiagnoseSuccessResponse> {
  const responseBody = await postDiagnose(
    input.fetcher,
    buildSampleDiagnosePayload(input),
  );

  if (!isDiagnoseSuccessResponse(responseBody)) {
    throw new Error("诊断接口返回格式异常，已保留当前结果。");
  }

  return responseBody;
}

export async function requestImageExtractionReview(input: {
  fetcher: typeof fetch;
  image_base64: string;
  image_mime_type: ImageDiagnosePayload["image_mime_type"];
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}): Promise<DiagnoseImageExtractionResponse> {
  const responseBody = await postDiagnose(
    input.fetcher,
    buildImageDiagnosePayload(input),
  );

  if (!isDiagnoseImageExtractionResponse(responseBody)) {
    throw new Error("图片识别结果返回格式异常，请重试或改用样例题。");
  }

  return responseBody;
}

export async function requestConfirmedImageDiagnosis(input: {
  fetcher: typeof fetch;
  confirmation_token: string;
  confirmed_extraction: VisionExtractionDraft;
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}): Promise<DiagnoseImageSuccessResponse> {
  const responseBody = await postJson(
    input.fetcher,
    "/api/confirm",
    buildConfirmedImageDiagnosePayload(input),
  );

  if (!isDiagnoseImageSuccessResponse(responseBody)) {
    throw new Error("图片诊断返回格式异常，请重试或改用样例题。");
  }

  return responseBody;
}

export function shouldPersistDiagnoseProfile(
  response:
    | DiagnoseSuccessResponse
    | DiagnoseImageSuccessResponse
    | DiagnoseImageExtractionResponse,
): boolean {
  if (response.source === "sample") {
    return true;
  }

  if ("stage" in response) {
    return false;
  }

  return (
    response.recognized_question.extraction_confidence !== "low" &&
    response.memory_delta.should_persist
  );
}

export function getDiagnoseClientErrorMessage(responseBody: unknown): string {
  if (!isRecord(responseBody)) {
    return "诊断接口暂时不可用，已保留当前结果。";
  }

  const error = responseBody.error;
  if (!isRecord(error) || typeof error.message !== "string") {
    return "诊断接口暂时不可用，已保留当前结果。";
  }

  return [getUserFacingModelErrorMessage(responseBody, error.message), getDebugText(responseBody)]
    .filter((message) => message.length > 0)
    .join("\n");
}

async function postDiagnose(
  fetcher: typeof fetch,
  payload: SampleDiagnosePayload | ImageDiagnosePayload,
): Promise<DiagnoseApiResponse> {
  return (await postJson(
    fetcher,
    "/api/diagnose",
    payload,
  )) as DiagnoseApiResponse;
}

async function postJson(
  fetcher: typeof fetch,
  url: string,
  payload: unknown,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("诊断接口暂时不可用，已保留当前结果。");
  }

  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(getDiagnoseClientErrorMessage(responseBody));
  }

  return responseBody;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function getUserFacingModelErrorMessage(
  responseBody: Record<string, unknown>,
  fallbackMessage: string,
): string {
  if (
    isModelInvalidOutputError(responseBody) &&
    responseBody.debug_summary.missing_fields.includes("student_answer")
  ) {
    return "没有识别到学生作答区域，请上传包含题干和学生解题痕迹的图片。";
  }

  return fallbackMessage;
}

function getDebugText(responseBody: Record<string, unknown>): string {
  return [
    getModelOutputDebugText(responseBody),
    getProviderFailureDebugText(responseBody),
  ]
    .filter((message) => message.length > 0)
    .join("\n");
}

function getModelOutputDebugText(responseBody: Record<string, unknown>): string {
  if (!isModelInvalidOutputError(responseBody)) {
    return "";
  }

  const summary = responseBody.debug_summary;
  const outputText =
    summary.output_kind === "json_object"
      ? "模型返回 JSON"
      : summary.output_kind === "json_parse_error"
        ? "模型未返回合法 JSON"
        : "模型返回内容不是 JSON 对象";
  const presentFields = summary.present_fields.length
    ? summary.present_fields.join(", ")
    : "无";
  const missingFields = summary.missing_fields.length
    ? summary.missing_fields.join(", ")
    : "无";
  const questionLength = summary.field_lengths.question_text ?? 0;
  const studentAnswerLength = summary.field_lengths.student_answer ?? 0;
  const studentStepCount = summary.list_lengths.student_solution_steps ?? 0;
  const warningCount = summary.list_lengths.warnings ?? 0;

  return `开发诊断：${outputText}；已返回字段 ${presentFields}；缺少字段 ${missingFields}；题干长度 ${questionLength}；学生答案长度 ${studentAnswerLength}；学生步骤数量 ${studentStepCount}；warning 数量 ${warningCount}。`;
}

function getProviderFailureDebugText(
  responseBody: Record<string, unknown>,
): string {
  if (!isProviderFailureDebug(responseBody.provider_debug)) {
    return "";
  }

  const debug = responseBody.provider_debug;
  const httpText =
    typeof debug.http_status === "number" ? `；HTTP ${debug.http_status}` : "";

  return `开发诊断：provider ${debug.provider_name}；阶段 ${debug.provider_stage}；失败类型 ${debug.failure_kind}${httpText}。`;
}

function isModelInvalidOutputError(
  responseBody: unknown,
): responseBody is DiagnoseErrorResponse & {
  debug_summary: NonNullable<DiagnoseErrorResponse["debug_summary"]>;
} {
  if (!isRecord(responseBody)) {
    return false;
  }

  if (!isRecord(responseBody.error) || !isRecord(responseBody.debug_summary)) {
    return false;
  }

  const debugSummary = responseBody.debug_summary;

  return (
    responseBody.error.code === "model_invalid_output" &&
    (debugSummary.output_kind === "json_object" ||
      debugSummary.output_kind === "json_parse_error" ||
      debugSummary.output_kind === "non_object") &&
    Array.isArray(debugSummary.present_fields) &&
    debugSummary.present_fields.every(isString) &&
    Array.isArray(debugSummary.missing_fields) &&
    debugSummary.missing_fields.every(isString) &&
    isRecord(debugSummary.field_lengths) &&
    isRecord(debugSummary.list_lengths)
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
