import { runMathTraceAgent } from "@/lib/diagnosis/mathtrace-agent-pipeline";
import { runImageMathTraceAgent } from "@/lib/image-diagnosis/image-diagnosis-pipeline";
import type {
  DiagnoseImageSuccessResponse,
  DiagnoseSuccessResponse,
  ParsedSampleDiagnoseRequest,
} from "@/lib/diagnosis/diagnose-api";
import type { AnalysisEnhancementDraft } from "@/lib/shared/analysis-provider-types";
import type {
  ConfirmationAction,
  FollowUpAnswerDraft,
} from "@/lib/shared/diagnosis-evidence";
import type { VisionExtractionDraft } from "@/lib/vision-extraction/vision-extraction-types";

export interface ConfirmedImageMistakeDiagnosisAgentInput {
  request: {
    student_id: string;
    student_profile: unknown;
    mistake_history: unknown[];
  };
  extraction: VisionExtractionDraft;
  is_extraction_confirmed: boolean;
  confirmation_action?: ConfirmationAction;
  follow_up_answer?: FollowUpAnswerDraft;
  analysis?: AnalysisEnhancementDraft;
}

export function runSampleMistakeDiagnosisAgent(
  request: ParsedSampleDiagnoseRequest,
): DiagnoseSuccessResponse {
  return runMathTraceAgent(request);
}

export function runConfirmedImageMistakeDiagnosisAgent(
  input: ConfirmedImageMistakeDiagnosisAgentInput,
): DiagnoseImageSuccessResponse {
  return runImageMathTraceAgent(input);
}
