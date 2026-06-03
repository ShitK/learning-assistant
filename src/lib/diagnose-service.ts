import {
  createAnthropicCompatibleVisionProvider,
  createMimoProviderConfigFromEnv,
} from "@/lib/anthropic-compatible-provider";
import { createDiagnoseError, parseDiagnoseRequest } from "@/lib/diagnose-api";
import { parseImageInput } from "@/lib/image-input";
import { runImageMathTraceAgent } from "@/lib/image-diagnosis-pipeline";
import { runMathTraceAgent } from "@/lib/mathtrace-agent-pipeline";
import { isRecord } from "@/lib/utils";
import type {
  DiagnoseApiResponse,
  ParsedImageDiagnoseRequest,
} from "@/lib/diagnose-api";
import type {
  VisionExtractionInput,
  VisionExtractionProvider,
  VisionProviderError,
} from "@/lib/anthropic-compatible-provider";

export interface DiagnoseServiceResult {
  status: number;
  body: DiagnoseApiResponse;
}

export function handleDiagnoseRequest(
  payload: unknown,
  deps?: {
    vision_provider?: VisionExtractionProvider;
  },
): Promise<DiagnoseServiceResult> {
  const parsedRequest = parseDiagnoseRequest(payload);
  if (!parsedRequest.ok) {
    return Promise.resolve({
      status: 400,
      body: parsedRequest.response,
    });
  }

  if (parsedRequest.value.task_type === "sample_diagnosis") {
    try {
      return Promise.resolve({
        status: 200,
        body: runMathTraceAgent(parsedRequest.value),
      });
    } catch {
      return Promise.resolve({
        status: 400,
        body: createDiagnoseError(
          "unknown_sample_question_id",
          "未找到这个样例题，请重新选择。",
          true,
        ),
      });
    }
  }

  return handleImageDiagnoseRequest(parsedRequest.value, deps);
}

async function handleImageDiagnoseRequest(
  request: ParsedImageDiagnoseRequest,
  deps?: {
    vision_provider?: VisionExtractionProvider;
  },
): Promise<DiagnoseServiceResult> {
  const parsedImage = parseImageInput({
    image_base64: request.image_base64,
    image_mime_type: request.image_mime_type,
    max_bytes: 1_000_000,
  });

  if (!parsedImage.ok) {
    return {
      status: parsedImage.error === "image_too_large" ? 413 : 400,
      body: createDiagnoseError(
        parsedImage.error,
        getImageInputErrorMessage(parsedImage.error),
        true,
      ),
    };
  }

  const providerResult = getVisionProvider(deps?.vision_provider);
  if (!providerResult.ok) {
    return {
      status: 400,
      body: createDiagnoseError(
        providerResult.error.code,
        providerResult.error.message,
        true,
      ),
    };
  }

  const extractionResult =
    await providerResult.value.extractQuestionFromImage(
      buildVisionExtractionInput(request, parsedImage.value),
    );

  if (!extractionResult.ok) {
    return {
      status: getProviderErrorStatus(extractionResult.error),
      body: createDiagnoseError(
        extractionResult.error.code,
        extractionResult.error.message,
        extractionResult.error.recoverable,
        shouldMarkFallbackUsed(extractionResult.error),
        getSafeDebugSummary(extractionResult.error),
        // provider_debug 只含安全元数据，生产环境也保留用于区分请求失败类型。
        extractionResult.error.provider_debug,
      ),
    };
  }

  return {
    status: 200,
    body: runImageMathTraceAgent({
      request,
      extraction: extractionResult.value,
    }),
  };
}

function getVisionProvider(
  injectedProvider: VisionExtractionProvider | undefined,
):
  | { ok: true; value: VisionExtractionProvider }
  | { ok: false; error: VisionProviderError } {
  if (injectedProvider) {
    return {
      ok: true,
      value: injectedProvider,
    };
  }

  const providerConfig = createMimoProviderConfigFromEnv(process.env);
  if (!providerConfig.ok) {
    return providerConfig;
  }

  return {
    ok: true,
    value: createAnthropicCompatibleVisionProvider(providerConfig.value),
  };
}

function buildVisionExtractionInput(
  request: ParsedImageDiagnoseRequest,
  image: {
    image_base64: string;
    mime_type: VisionExtractionInput["mime_type"];
  },
): VisionExtractionInput {
  return {
    image_base64: image.image_base64,
    mime_type: image.mime_type,
    student_profile_summary: summarizeStudentProfile(request.student_profile),
  };
}

function summarizeStudentProfile(studentProfile: unknown): string {
  if (!isRecord(studentProfile)) {
    return "demo_student_001，高中数学。";
  }

  const studentId =
    typeof studentProfile.student_id === "string"
      ? studentProfile.student_id
      : "demo_student_001";
  const grade =
    typeof studentProfile.grade === "string" ? studentProfile.grade : "高中";

  return `${studentId}，${grade}数学。`;
}

function getProviderErrorStatus(error: VisionProviderError): number {
  return error.code === "model_not_configured" ? 400 : 502;
}

function shouldMarkFallbackUsed(error: VisionProviderError): boolean {
  return (
    error.code === "model_timeout" ||
    error.code === "model_request_failed" ||
    error.code === "model_invalid_output"
  );
}

function getSafeDebugSummary(error: VisionProviderError):
  | VisionProviderError["debug_summary"]
  | undefined {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  return error.debug_summary;
}

function getImageInputErrorMessage(
  code: "missing_image" | "invalid_image" | "image_too_large",
): string {
  if (code === "missing_image") {
    return "请先上传一张数学错题图片。";
  }

  if (code === "image_too_large") {
    return "图片过大，请压缩到 1MB 以内后重试。";
  }

  return "图片格式不合法，请上传 PNG、JPEG 或 WebP 图片。";
}
