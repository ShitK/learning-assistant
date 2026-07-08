import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti({ jsx: true });

const {
  createInitialProblemChatMessages,
  createSampleSelectedMessage,
  createImageUploadedMessage,
  createExtractionReviewMessage,
  createExtractionConfirmedMessage,
  createDiagnosisReadyMessage,
  createFollowUpQuestionMessage,
  createFollowUpAnswerMessage,
  createProblemChatErrorMessage,
  trimProblemChatMessages,
} = jiti("./src/lib/demo/problem-chat-state.ts");
const {
  canSubmitProblemFollowUp,
  createLocalDiagnosisFollowUpAnswer,
  hasSufficientDiagnosisForFollowUp,
} = jiti("./src/lib/diagnosis/diagnosis-follow-up.ts");
const { deriveProblemChatStatus } = jiti(
  "./src/components/workbench/problem-chat-workbench-state.ts",
);
const { sampleDiagnoses } = jiti("./src/data/mathtrace-demo.ts");
const { createSampleDiagnosisViewModel } = jiti(
  "./src/lib/diagnosis/diagnosis-view-model.ts",
);

const sample = sampleDiagnoses.find(
  (item) => item.id === "sample_derivative_001",
);
assert.ok(sample, "sample_derivative_001 should exist.");
const diagnosis = createSampleDiagnosisViewModel(sample);

const initialMessages = createInitialProblemChatMessages();
assert.equal(initialMessages.length, 1);
assert.equal(initialMessages[0].role, "agent");
assert.equal(initialMessages[0].kind, "welcome");
assert.match(initialMessages[0].text, /上传图片|样例题/);

const sampleMessage = createSampleSelectedMessage(sample);
assert.equal(sampleMessage.role, "student");
assert.equal(sampleMessage.kind, "sample_selected");
assert.match(sampleMessage.text, new RegExp(sample.title));

const imageMessage = createImageUploadedMessage({
  file_name: "wrong-question.png",
  image_base64: "abc",
  image_mime_type: "image/png",
  preview_url: "blob:http://localhost/image",
  byte_size: 32_000,
  was_compressed: false,
});
assert.equal(imageMessage.kind, "image_uploaded");
assert.equal(imageMessage.file_name, "wrong-question.png");
assert.equal(imageMessage.preview_url, "blob:http://localhost/image");

const reviewMessage = createExtractionReviewMessage({
  confirmation_token: "token",
  question_text: "已知函数，求单调区间。",
  student_answer: "少分类讨论",
  steps_text: "求导\n直接判断",
  extraction_confidence: "medium",
  warnings: [],
  can_persist_after_confirmation: true,
});
assert.equal(reviewMessage.kind, "extraction_review");
assert.match(reviewMessage.text, /确认/);

assert.equal(createExtractionConfirmedMessage().kind, "extraction_confirmed");
assert.equal(createDiagnosisReadyMessage(diagnosis).kind, "diagnosis_ready");
assert.match(createDiagnosisReadyMessage(diagnosis).text, /右侧|报告/);
assert.equal(
  createFollowUpQuestionMessage(" 为什么要分类讨论？ ").text,
  "为什么要分类讨论？",
);
assert.equal(createFollowUpAnswerMessage("先看参数范围。").kind, "follow_up_answer");
assert.equal(createProblemChatErrorMessage("模型超时").kind, "error");

const longMessages = Array.from({ length: 44 }, (_, index) =>
  createFollowUpQuestionMessage(`第 ${index} 个问题`),
);
const trimmedMessages = trimProblemChatMessages(longMessages);
assert.equal(trimmedMessages.length, 40);
assert.equal(trimmedMessages[0].text, "第 4 个问题");

assert.equal(canSubmitProblemFollowUp("", diagnosis), false);
assert.equal(canSubmitProblemFollowUp("   ", diagnosis), false);
assert.equal(canSubmitProblemFollowUp("第 1 步为什么这样做？", diagnosis), true);
assert.equal(canSubmitProblemFollowUp("第 3 步为什么这样做？", diagnosis), true);
assert.equal(canSubmitProblemFollowUp("为什么要分类讨论？", diagnosis), true);
assert.equal(hasSufficientDiagnosisForFollowUp(diagnosis), true);
assert.equal(
  hasSufficientDiagnosisForFollowUp({
    ...diagnosis,
    standard_solution: "   ",
  }),
  false,
);

const baseStatusInput = {
  apiErrorMessage: null,
  isImagePreparing: false,
  isRequestPending: false,
  diagnosisMode: "sample",
  selectedImage: null,
  editableExtractionDraft: null,
  isCurrentConfirmedImageReport: false,
  diagnosisView: diagnosis,
};
const preparedImage = {
  file_name: "wrong-question.png",
  image_base64: "abc",
  image_mime_type: "image/png",
  preview_url: "blob:http://localhost/image",
  byte_size: 32_000,
  was_compressed: false,
};
const editableDraft = {
  confirmation_token: "token",
  question_text: "已知函数，求单调区间。",
  student_answer: "少分类讨论",
  steps_text: "求导\n直接判断",
  extraction_confidence: "medium",
  warnings: [],
  can_persist_after_confirmation: true,
};
const imageDiagnosis = { ...diagnosis, source: "image" };

assert.equal(deriveProblemChatStatus(baseStatusInput), "report_ready");
assert.equal(
  deriveProblemChatStatus({
    ...baseStatusInput,
    apiErrorMessage: "模型超时",
  }),
  "error",
);
assert.equal(
  deriveProblemChatStatus({
    ...baseStatusInput,
    isImagePreparing: true,
  }),
  "image_preparing",
);
assert.equal(
  deriveProblemChatStatus({
    ...baseStatusInput,
    diagnosisMode: "image",
    diagnosisView: imageDiagnosis,
    selectedImage: preparedImage,
    isRequestPending: true,
  }),
  "extracting_image",
);
assert.equal(
  deriveProblemChatStatus({
    ...baseStatusInput,
    diagnosisMode: "image",
    diagnosisView: imageDiagnosis,
    editableExtractionDraft: editableDraft,
  }),
  "reviewing_extraction",
);
assert.equal(
  deriveProblemChatStatus({
    ...baseStatusInput,
    diagnosisMode: "image",
    diagnosisView: imageDiagnosis,
    isRequestPending: true,
  }),
  "diagnosing",
);
assert.equal(
  deriveProblemChatStatus({
    ...baseStatusInput,
    diagnosisMode: "image",
    diagnosisView: imageDiagnosis,
  }),
  "idle",
);
assert.equal(
  deriveProblemChatStatus({
    ...baseStatusInput,
    diagnosisMode: "image",
    diagnosisView: imageDiagnosis,
    isCurrentConfirmedImageReport: true,
  }),
  "report_ready",
);

const classificationAnswer = createLocalDiagnosisFollowUpAnswer({
  question: "为什么要分类讨论？",
  diagnosis,
});
assert.match(classificationAnswer, /分类讨论|关键判断点|标准解法/);
assert.doesNotMatch(
  classificationAnswer,
  /memory_events|student_profiles|写入画像/,
);

const stepAnswer = createLocalDiagnosisFollowUpAnswer({
  question: "第 3 步我没看懂",
  diagnosis,
});
assert.match(stepAnswer, /第 3 步|关键判断点|可以先看/);

const avoidAnswer = createLocalDiagnosisFollowUpAnswer({
  question: "这类题下次怎么避免？",
  diagnosis,
});
assert.match(avoidAnswer, /下次|避免|错因/);

console.log("problem chat state tests passed");
