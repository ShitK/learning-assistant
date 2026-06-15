import {
  createAnalysisProvider,
  createAnalysisProviderConfigFromEnv,
} from "@/lib/providers/analysis-provider";
import { createDiagnoseError } from "@/lib/diagnosis/diagnose-api";
import {
  assessExtractionEvidence,
  parseFollowUpAnswer,
} from "@/lib/diagnosis/diagnosis-evidence";
import { parseConfirmedExtractionDraft } from "@/lib/image-diagnosis/image-confirmation";
import {
  createImageConfirmationFingerprint,
  verifyImageConfirmationToken,
} from "@/lib/image-diagnosis/image-confirmation-token";
import { persistDiagnosisIfNeeded } from "@/lib/diagnosis/diagnose-service";
import { runImageMathTraceAgent } from "@/lib/image-diagnosis/image-diagnosis-pipeline";
import { isRecord } from "@/lib/shared/utils";
import type { DiagnosisPersistenceRepository } from "@/lib/persistence/diagnosis-persistence";
import type {
  AnalysisEnhancementDraft,
  AnalysisProvider,
  AnalysisProviderContext,
} from "@/lib/providers/analysis-provider";
import type {
  ConfirmationAction,
  FollowUpAnswerDraft,
} from "@/lib/diagnosis/diagnosis-evidence";
import type { DiagnoseServiceResult } from "@/lib/diagnosis/diagnose-service";
import type { VisionExtractionDraft } from "@/lib/vision-extraction/vision-extraction-types";

interface ConfirmImageDiagnosisRequest {
  request: {
    student_id: string;
    student_profile: unknown;
    mistake_history: unknown[];
  };
  extraction: VisionExtractionDraft;
  confirmation_action: ConfirmationAction;
  follow_up_answer?: FollowUpAnswerDraft;
  can_use_analysis_provider: boolean;
  is_confirmation_token_matched: boolean;
}

type ParseConfirmImageDiagnosisResult =
  | { ok: true; value: ConfirmImageDiagnosisRequest }
  | { ok: false; message: string };

export async function handleConfirmRequest(
  payload: unknown,
  deps?: {
    analysis_provider?: AnalysisProvider;
    persistence_repository?: DiagnosisPersistenceRepository;
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
    {
      confirmation_action: parsed.value.confirmation_action,
      follow_up_answer: hasFollowUpAnswerContent(parsed.value.follow_up_answer)
        ? parsed.value.follow_up_answer
        : undefined,
    },
  );

  return persistDiagnosisIfNeeded(
    {
      status: 200,
      body: runImageMathTraceAgent({
        request: parsed.value.request,
        extraction: parsed.value.extraction,
        is_extraction_confirmed: parsed.value.is_confirmation_token_matched,
        confirmation_action: parsed.value.confirmation_action,
        follow_up_answer: parsed.value.follow_up_answer,
        analysis,
      }),
    },
    deps?.persistence_repository,
  );
}

async function getAnalysisEnhancement(
  extraction: VisionExtractionDraft,
  injectedProvider: AnalysisProvider | undefined,
  canUseAnalysisProvider: boolean,
  context: AnalysisProviderContext,
): Promise<AnalysisEnhancementDraft | undefined> {
  if (!canUseAnalysisProvider) {
    return undefined;
  }

  const provider = injectedProvider ?? getConfiguredAnalysisProvider();
  if (!provider) {
    return undefined;
  }

  const result = await provider.analyzeConfirmedExtraction(extraction, context);
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

  if (payload.student_id.trim() !== "demo_student_001") {
    return { ok: false, message: "当前阶段只支持 demo_student_001。" };
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

  const confirmationAction = parseConfirmationAction(
    payload.confirmation_action,
  );
  if (!confirmationAction.ok) {
    return { ok: false, message: confirmationAction.message };
  }

  const token = verifyImageConfirmationToken(payload.confirmation_token);
  if (!token.ok) {
    return { ok: false, message: "confirmation_token 不合法。" };
  }

  const extraction =
    confirmationAction.value === "diagnose_from_student_work"
      ? parseConfirmedExtractionDraft(payload.confirmed_extraction)
      : parseProblemOnlyExtractionDraft(payload.confirmed_extraction);
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
  const evidence = assessExtractionEvidence(finalExtraction);

  if (
    confirmationAction.value !== "diagnose_from_student_work" &&
    evidence.evidence_level !== "problem_only"
  ) {
    return {
      ok: false,
      message: "追问模式只适用于学生作答不清但题干可识别的图片。",
    };
  }

  const followUpAnswer = parseRequestFollowUpAnswer(
    confirmationAction.value,
    payload.follow_up_answer,
  );
  if (!followUpAnswer.ok) {
    return { ok: false, message: followUpAnswer.message };
  }

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
      confirmation_action: confirmationAction.value,
      follow_up_answer: followUpAnswer.value,
      can_use_analysis_provider:
        isDraftFingerprintMatched &&
        evidence.evidence_level !== "insufficient",
      is_confirmation_token_matched: isDraftFingerprintMatched,
    },
  };
}

function parseConfirmationAction(
  value: unknown,
): { ok: true; value: ConfirmationAction } | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: "diagnose_from_student_work" };
  }

  if (
    value === "diagnose_from_student_work" ||
    value === "skip_follow_up" ||
    value === "submit_stuck_point" ||
    value === "confirm_stuck_point_analysis"
  ) {
    return { ok: true, value };
  }

  return { ok: false, message: "confirmation_action 不合法。" };
}

function parseRequestFollowUpAnswer(
  action: ConfirmationAction,
  value: unknown,
): { ok: true; value?: FollowUpAnswerDraft } | { ok: false; message: string } {
  if (action === "diagnose_from_student_work") {
    return { ok: true };
  }

  const parsed = parseFollowUpAnswer(value ?? null);
  if (!parsed.ok) {
    return parsed;
  }

  if (
    (action === "submit_stuck_point" ||
      action === "confirm_stuck_point_analysis") &&
    parsed.value.selected_stuck_point_id === null &&
    parsed.value.custom_text === null
  ) {
    return { ok: false, message: "请选择卡点或输入一句话。" };
  }

  return { ok: true, value: parsed.value };
}

function hasFollowUpAnswerContent(
  answer: FollowUpAnswerDraft | undefined,
): answer is FollowUpAnswerDraft {
  return (
    answer !== undefined &&
    (answer.selected_stuck_point_id !== null || answer.custom_text !== null)
  );
}

function parseProblemOnlyExtractionDraft(
  value: unknown,
): { ok: true; value: VisionExtractionDraft } | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "confirmed_extraction 必须是对象。" };
  }

  if (!isNonEmptyString(value.question_text)) {
    return { ok: false, message: "题干不能为空。" };
  }

  if (!isNonEmptyString(value.standard_solution_draft)) {
    return { ok: false, message: "标准解法草稿不能为空。" };
  }

  if (!isExtractionConfidence(value.extraction_confidence)) {
    return { ok: false, message: "识别置信度不合法。" };
  }

  const steps = parseEditableLines(value.student_solution_steps, 8);
  if (!steps.ok) {
    return { ok: false, message: "学生解题步骤必须是字符串数组。" };
  }

  const warnings = parseEditableLines(value.warnings, 5);
  if (!warnings.ok) {
    return { ok: false, message: "warnings 必须是字符串数组。" };
  }

  return {
    ok: true,
    value: {
      question_text: value.question_text.trim(),
      student_answer:
        typeof value.student_answer === "string"
          ? value.student_answer.trim()
          : "未识别到学生答案",
      student_solution_steps: steps.value,
      standard_solution_draft: value.standard_solution_draft.trim(),
      extraction_confidence: value.extraction_confidence,
      warnings: warnings.value,
    },
  };
}

function parseEditableLines(
  value: unknown,
  maxCount: number,
): { ok: true; value: string[] } | { ok: false } {
  if (!Array.isArray(value)) {
    return { ok: false };
  }

  for (const item of value) {
    if (typeof item !== "string") {
      return { ok: false };
    }
  }

  return {
    ok: true,
    value: value
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, maxCount),
  };
}

function isExtractionConfidence(
  value: unknown,
): value is VisionExtractionDraft["extraction_confidence"] {
  return value === "high" || value === "medium" || value === "low";
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
