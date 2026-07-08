import type { SampleDiagnosis } from "@/data/mathtrace-demo";
import type {
  DiagnosisViewModel,
  EditableExtractionDraft,
} from "@/lib/diagnosis/diagnosis-view-model";
import type { PreparedImageUpload } from "@/lib/image-diagnosis/image-upload-client";

export type ProblemChatStatus =
  | "idle"
  | "image_preparing"
  | "extracting_image"
  | "reviewing_extraction"
  | "diagnosing"
  | "report_ready"
  | "error";

export type ProblemChatMessage =
  | { role: "agent"; kind: "welcome"; text: string }
  | { role: "student"; kind: "sample_selected"; text: string }
  | {
      role: "student";
      kind: "image_uploaded";
      text: string;
      file_name: string;
      preview_url: string;
    }
  | { role: "agent"; kind: "extraction_review"; text: string }
  | { role: "student"; kind: "extraction_confirmed"; text: string }
  | { role: "agent"; kind: "diagnosis_ready"; text: string }
  | { role: "student"; kind: "follow_up_question"; text: string }
  | { role: "agent"; kind: "follow_up_answer"; text: string }
  | { role: "agent"; kind: "error"; text: string };

const MAX_PROBLEM_CHAT_MESSAGES = 40;

export function createInitialProblemChatMessages(): ProblemChatMessage[] {
  return [
    {
      role: "agent",
      kind: "welcome",
      text: "可以选择样例题，也可以上传一张错题图片。我会先确认题目，再把正式报告放到右侧。",
    },
  ];
}

export function createSampleSelectedMessage(
  sample: SampleDiagnosis,
): ProblemChatMessage {
  return {
    role: "student",
    kind: "sample_selected",
    text: `我想看样例题：${sample.title}`,
  };
}

export function createImageUploadedMessage(
  image: PreparedImageUpload,
): ProblemChatMessage {
  return {
    role: "student",
    kind: "image_uploaded",
    text: `我上传了错题图片：${image.file_name}`,
    file_name: image.file_name,
    preview_url: image.preview_url,
  };
}

export function createExtractionReviewMessage(
  draft: EditableExtractionDraft,
): ProblemChatMessage {
  const warningText =
    draft.warnings.length > 0
      ? "有几处识别不确定，请一起核对。"
      : "请确认题干和学生步骤是否准确。";

  return {
    role: "agent",
    kind: "extraction_review",
    text: `我识别到了题干和学生步骤，${warningText}`,
  };
}

export function createExtractionConfirmedMessage(): ProblemChatMessage {
  return {
    role: "student",
    kind: "extraction_confirmed",
    text: "我已确认识别结果，请生成诊断报告。",
  };
}

export function createDiagnosisReadyMessage(
  view: DiagnosisViewModel,
): ProblemChatMessage {
  return {
    role: "agent",
    kind: "diagnosis_ready",
    text: `报告已更新到右侧：${view.title}。你也可以继续问我这道题里的具体步骤。`,
  };
}

export function createFollowUpQuestionMessage(text: string): ProblemChatMessage {
  return {
    role: "student",
    kind: "follow_up_question",
    text: text.trim(),
  };
}

export function createFollowUpAnswerMessage(text: string): ProblemChatMessage {
  return {
    role: "agent",
    kind: "follow_up_answer",
    text,
  };
}

export function createProblemChatErrorMessage(text: string): ProblemChatMessage {
  return {
    role: "agent",
    kind: "error",
    text,
  };
}

export function trimProblemChatMessages(
  messages: ProblemChatMessage[],
): ProblemChatMessage[] {
  return messages.slice(-MAX_PROBLEM_CHAT_MESSAGES);
}
