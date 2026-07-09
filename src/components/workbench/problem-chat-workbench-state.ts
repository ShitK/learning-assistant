import { useState } from "react";
import type { DiagnosisMode } from "@/components/workbench/workbench-types";
import type {
  DiagnosisViewModel,
  EditableExtractionDraft,
} from "@/lib/diagnosis/diagnosis-view-model";
import {
  createFollowUpAnswerMessage,
  createFollowUpQuestionMessage,
  createInitialProblemChatMessages,
  trimProblemChatMessages,
  type ProblemChatMessage,
  type ProblemChatStatus,
} from "@/lib/demo/problem-chat-state";
import {
  canSubmitProblemFollowUp,
  createLocalDiagnosisFollowUpAnswer,
  hasSufficientDiagnosisForFollowUp,
} from "@/lib/diagnosis/diagnosis-follow-up";
import type { PreparedImageUpload } from "@/lib/image-diagnosis/image-upload-client";

export interface UseProblemChatWorkbenchStateInput {
  apiErrorMessage: string | null;
  isImagePreparing: boolean;
  isRequestPending: boolean;
  diagnosisMode: DiagnosisMode;
  selectedImage: PreparedImageUpload | null;
  editableExtractionDraft: EditableExtractionDraft | null;
  isCurrentConfirmedImageReport: boolean;
  diagnosisView: DiagnosisViewModel;
}

export interface ProblemChatWorkbenchState {
  problemChatMessages: ProblemChatMessage[];
  problemFollowUpQuestion: string;
  problemChatStatus: ProblemChatStatus;
  canAskProblemFollowUp: boolean;
  setProblemFollowUpQuestion: (text: string) => void;
  appendProblemChatMessage: (message: ProblemChatMessage) => void;
  resetProblemChatMessages: (nextMessage?: ProblemChatMessage) => void;
  submitProblemFollowUp: () => void;
}

export function deriveProblemChatStatus(
  input: UseProblemChatWorkbenchStateInput,
): ProblemChatStatus {
  if (input.apiErrorMessage) {
    return "error";
  }

  if (input.isImagePreparing) {
    return "image_preparing";
  }

  if (
    input.isRequestPending &&
    input.diagnosisMode === "image" &&
    input.selectedImage !== null
  ) {
    return "extracting_image";
  }

  if (input.editableExtractionDraft !== null) {
    return "reviewing_extraction";
  }

  if (input.isRequestPending) {
    return "diagnosing";
  }

  if (
    input.isCurrentConfirmedImageReport ||
    (input.diagnosisMode === "sample" && input.diagnosisView.source === "sample")
  ) {
    return "report_ready";
  }

  return "idle";
}

export function useProblemChatWorkbenchState(
  input: UseProblemChatWorkbenchStateInput,
): ProblemChatWorkbenchState {
  const [problemChatMessages, setProblemChatMessages] = useState<
    ProblemChatMessage[]
  >(() => createInitialProblemChatMessages());
  const [problemFollowUpQuestion, setProblemFollowUpQuestion] = useState("");
  const problemChatStatus = deriveProblemChatStatus(input);
  const canAskProblemFollowUp =
    problemChatStatus === "report_ready" &&
    hasSufficientDiagnosisForFollowUp(input.diagnosisView);

  function appendProblemChatMessage(message: ProblemChatMessage): void {
    setProblemChatMessages((currentMessages) =>
      trimProblemChatMessages([...currentMessages, message]),
    );
  }

  function resetProblemChatMessages(nextMessage?: ProblemChatMessage): void {
    setProblemChatMessages(
      nextMessage
        ? [...createInitialProblemChatMessages(), nextMessage]
        : createInitialProblemChatMessages(),
    );
  }

  function submitProblemFollowUp(): void {
    if (!canSubmitProblemFollowUp(problemFollowUpQuestion, input.diagnosisView)) {
      return;
    }

    const question = problemFollowUpQuestion.trim();
    const answer = createLocalDiagnosisFollowUpAnswer({
      question,
      diagnosis: input.diagnosisView,
    });
    setProblemChatMessages((currentMessages) =>
      trimProblemChatMessages([
        ...currentMessages,
        createFollowUpQuestionMessage(question),
        createFollowUpAnswerMessage(answer),
      ]),
    );
    setProblemFollowUpQuestion("");
  }

  return {
    problemChatMessages,
    problemFollowUpQuestion,
    problemChatStatus,
    canAskProblemFollowUp,
    setProblemFollowUpQuestion,
    appendProblemChatMessage,
    resetProblemChatMessages,
    submitProblemFollowUp,
  };
}
