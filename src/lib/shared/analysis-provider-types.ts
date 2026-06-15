import type { DiagnoseErrorCode } from "@/lib/shared/diagnose-error";
import type {
  ConfirmationAction,
  FollowUpAnswerDraft,
} from "@/lib/shared/confirmation-types";
import type { VisionExtractionDraft } from "@/lib/vision-extraction/vision-extraction-types";

export interface AnalysisEnhancementDraft {
  expected_diagnosis: string;
  step_analysis: string[];
  solution_highlights: string[];
  standard_solution: string;
  warnings: string[];
}

export interface AnalysisProviderContext {
  confirmation_action: ConfirmationAction;
  follow_up_answer?: FollowUpAnswerDraft;
}

export type AnalysisProviderResult =
  | { ok: true; value: AnalysisEnhancementDraft }
  | { ok: false; error: AnalysisProviderError };

export interface AnalysisProviderError {
  code: DiagnoseErrorCode;
  message: string;
  recoverable: boolean;
  failure_kind:
    | "not_configured"
    | "http_error"
    | "invalid_json"
    | "invalid_output"
    | "network_failed"
    | "timeout";
  provider_name?: string;
  http_status?: number;
}

export interface AnalysisProvider {
  analyzeConfirmedExtraction(
    extraction: VisionExtractionDraft,
    context?: AnalysisProviderContext,
  ): Promise<AnalysisProviderResult>;
}
