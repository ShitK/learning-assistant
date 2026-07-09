import {
  createVisionProvider,
  createVisionProviderConfigFromEnv,
} from "@/lib/providers/anthropic-compatible-provider";
import {
  createDiagnoseError,
  type DiagnoseImageExtractionResponse,
  type ParsedImageDiagnoseRequest,
} from "@/lib/diagnosis/diagnose-api";
import {
  createImageConfirmationFingerprint,
  createImageConfirmationToken,
} from "@/lib/image-diagnosis/image-confirmation-token";
import { parseImageInput } from "@/lib/image-diagnosis/image-input";
import { isRecord } from "@/lib/shared/utils";
import type { DiagnoseAgentResult } from "@/lib/diagnosis/agents/diagnosis-agent-types";
import type {
  VisionExtractionInput,
  VisionExtractionProvider,
  VisionProviderError,
} from "@/lib/providers/anthropic-compatible-provider";
import type { VisionExtractionDraft } from "@/lib/vision-extraction/vision-extraction-types";

export interface VisionExtractionAgentInput {
  request: ParsedImageDiagnoseRequest;
  vision_provider?: VisionExtractionProvider;
}

export async function runVisionExtractionAgent(
  input: VisionExtractionAgentInput,
): Promise<DiagnoseAgentResult> {
  const parsedImage = parseImageInput({
    image_base64: input.request.image_base64,
    image_mime_type: input.request.image_mime_type,
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

  const providerResult = getVisionProvider(input.vision_provider);
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
      buildVisionExtractionInput(input.request, parsedImage.value),
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
        extractionResult.error.provider_debug,
      ),
    };
  }

  try {
    return {
      status: 200,
      body: buildImageExtractionResponse({
        student_id: input.request.student_id,
        extraction: extractionResult.value,
      }),
    };
  } catch {
    return {
      status: 502,
      body: createDiagnoseError(
        "model_request_failed",
        "图片诊断确认令牌生成失败，请稍后重试或联系维护者。",
        true,
        true,
      ),
    };
  }
}

function buildImageExtractionResponse(input: {
  student_id: string;
  extraction: VisionExtractionDraft;
}): DiagnoseImageExtractionResponse {
  const id = `image_draft_${hashExtractionDraft(input.extraction)}`;
  const canPersistAfterConfirmation =
    input.extraction.extraction_confidence !== "low";

  return {
    diagnosis_id: `diag_${id}`,
    student_id: input.student_id,
    source: "image",
    stage: "extraction_review",
    recognized_question: {
      id,
      title: "图片识别错题",
      module: "待确认",
      question_text: input.extraction.question_text,
      student_answer: input.extraction.student_answer,
      student_solution_steps: input.extraction.student_solution_steps,
      extraction_confidence: input.extraction.extraction_confidence,
    },
    requires_confirmation: true,
    can_persist_after_confirmation: canPersistAfterConfirmation,
    confirmation_token: createImageConfirmationToken({
      draft_id: id,
      extraction_confidence: input.extraction.extraction_confidence,
      can_persist_after_confirmation: canPersistAfterConfirmation,
      draft_fingerprint: createImageConfirmationFingerprint(input.extraction),
    }),
    sample_diagnosis: null,
    fallback_used: false,
    warnings: input.extraction.warnings,
  };
}

function hashExtractionDraft(extraction: VisionExtractionDraft): string {
  return hashText(
    JSON.stringify({
      question_text: extraction.question_text,
      student_answer: extraction.student_answer,
      student_solution_steps: extraction.student_solution_steps,
      extraction_confidence: extraction.extraction_confidence,
    }),
  );
}

function hashText(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
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

  const providerConfig = createVisionProviderConfigFromEnv(process.env);
  if (!providerConfig.ok) {
    return providerConfig;
  }

  return {
    ok: true,
    value: createVisionProvider(providerConfig.value),
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
