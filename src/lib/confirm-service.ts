import {
  createAnalysisProvider,
  createAnalysisProviderConfigFromEnv,
} from "@/lib/analysis-provider";
import { createDiagnoseError } from "@/lib/diagnose-api";
import { parseConfirmedExtractionDraft } from "@/lib/image-confirmation";
import {
  createImageConfirmationFingerprint,
  verifyImageConfirmationToken,
} from "@/lib/image-confirmation-token";
import { runImageMathTraceAgent } from "@/lib/image-diagnosis-pipeline";
import { isRecord } from "@/lib/utils";
import type {
  AnalysisEnhancementDraft,
  AnalysisProvider,
} from "@/lib/analysis-provider";
import type { DiagnoseServiceResult } from "@/lib/diagnose-service";
import type { VisionExtractionDraft } from "@/lib/vision-extraction-parser";

interface ConfirmImageDiagnosisRequest {
  request: {
    student_id: string;
    student_profile: unknown;
    mistake_history: unknown[];
  };
  extraction: VisionExtractionDraft;
  can_use_analysis_provider: boolean;
}

type ParseConfirmImageDiagnosisResult =
  | { ok: true; value: ConfirmImageDiagnosisRequest }
  | { ok: false; message: string };

export async function handleConfirmRequest(
  payload: unknown,
  deps?: {
    analysis_provider?: AnalysisProvider;
  },
): Promise<DiagnoseServiceResult> {
  const parsed = parseConfirmImageDiagnosisRequest(payload);
  if (!parsed.ok) {
    return {
      status: 400,
      body: createDiagnoseError("invalid_request", parsed.message, true),
    };
  }

  const analysis = await getAnalysisEnhancement(
    parsed.value.extraction,
    parsed.value.can_use_analysis_provider ? deps?.analysis_provider : undefined,
    parsed.value.can_use_analysis_provider,
  );

  return {
    status: 200,
    body: runImageMathTraceAgent({
      request: parsed.value.request,
      extraction: parsed.value.extraction,
      is_extraction_confirmed: true,
      analysis,
    }),
  };
}

async function getAnalysisEnhancement(
  extraction: VisionExtractionDraft,
  injectedProvider: AnalysisProvider | undefined,
  canUseAnalysisProvider: boolean,
): Promise<AnalysisEnhancementDraft | undefined> {
  if (!canUseAnalysisProvider) {
    return undefined;
  }

  const provider = injectedProvider ?? getConfiguredAnalysisProvider();
  if (!provider) {
    return undefined;
  }

  const result = await provider.analyzeConfirmedExtraction(extraction);
  return result.ok ? result.value : undefined;
}

function getConfiguredAnalysisProvider(): AnalysisProvider | undefined {
  const config = createAnalysisProviderConfigFromEnv(process.env);
  if (!config.ok) {
    return undefined;
  }

  return createAnalysisProvider(config.value);
}

function parseConfirmImageDiagnosisRequest(
  payload: unknown,
): ParseConfirmImageDiagnosisResult {
  if (!isRecord(payload)) {
    return { ok: false, message: "请求体必须是 JSON 对象。" };
  }

  if (!isNonEmptyString(payload.student_id)) {
    return { ok: false, message: "缺少 student_id。" };
  }

  if (payload.task_type !== "confirmed_image_diagnosis") {
    return {
      ok: false,
      message: "task_type 只能是 confirmed_image_diagnosis。",
    };
  }

  if (!isNonEmptyString(payload.confirmation_token)) {
    return { ok: false, message: "缺少 confirmation_token。" };
  }

  const token = verifyImageConfirmationToken(payload.confirmation_token);
  if (!token.ok) {
    return { ok: false, message: "confirmation_token 不合法。" };
  }

  const extraction = parseConfirmedExtractionDraft(
    payload.confirmed_extraction,
  );
  if (!extraction.ok) {
    return { ok: false, message: extraction.message };
  }
  const tokenScopedExtraction: VisionExtractionDraft = {
    ...extraction.value,
    extraction_confidence: token.value.extraction_confidence,
  };
  const isDraftFingerprintMatched = isMatchingDraftFingerprint(
    tokenScopedExtraction,
    token.value,
  );
  const finalExtraction = isDraftFingerprintMatched
    ? tokenScopedExtraction
    : forceNonPersistForTokenMismatch(tokenScopedExtraction);

  return {
    ok: true,
    value: {
      request: {
        student_id: payload.student_id.trim(),
        student_profile: payload.student_profile,
        mistake_history: Array.isArray(payload.mistake_history)
          ? payload.mistake_history
          : [],
      },
      extraction: finalExtraction,
      can_use_analysis_provider: isDraftFingerprintMatched,
    },
  };
}

function isMatchingDraftFingerprint(
  extraction: VisionExtractionDraft,
  token: {
    draft_fingerprint: string;
  },
): boolean {
  return (
    createImageConfirmationFingerprint(extraction) === token.draft_fingerprint
  );
}

function forceNonPersistForTokenMismatch(
  extraction: VisionExtractionDraft,
): VisionExtractionDraft {
  const warning =
    "确认草稿与识别令牌不匹配，本次只生成报告，不写入长期画像。";

  return {
    ...extraction,
    extraction_confidence: "low",
    warnings: extraction.warnings.includes(warning)
      ? extraction.warnings
      : [...extraction.warnings, warning],
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
