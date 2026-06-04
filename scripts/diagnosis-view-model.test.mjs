import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { demoStudentProfile, sampleDiagnoses } = jiti(
  "../src/data/mathtrace-demo.ts",
);
const {
  canConfirmEditableExtractionDraft,
  createAgentTimelineStatusLabel,
  createEditableExtractionDraft,
  createExtractionReviewRetainedReportNotice,
  createImageDiagnosisViewModel,
  createRetainedReportNotice,
  createSampleDiagnosisViewModel,
  createVisionExtractionDraftFromEditableDraft,
} = jiti("../src/lib/diagnosis-view-model.ts");

const sample = sampleDiagnoses[0];
const sampleView = createSampleDiagnosisViewModel(sample);

assert.equal(sampleView.source, "sample");
assert.equal(sampleView.title, sample.title);
assert.equal(sampleView.question_text, sample.question_text);
assert.deepEqual(sampleView.knowledge_points, sample.knowledge_points);
assert.equal(sampleView.extraction_confidence, null);
assert.equal(sampleView.should_persist_profile, true);

const imageResponse = {
  diagnosis_id: "diag_image_1",
  student_id: "demo_student_001",
  source: "image",
  steps: [],
  recognized_question: {
    id: "image_1",
    title: "图片识别错题",
    module: "导数",
    question_text: "已识别题干。",
    student_answer: "学生答案。",
    student_solution_steps: ["第一步", "第二步"],
    extraction_confidence: "low",
  },
  knowledge_mapping: {
    knowledge_points: ["derivative_monotonicity"],
    difficulty: 4,
  },
  mistake_diagnosis: {
    mistake_causes: ["classification_missing"],
    severity: "medium",
    expected_diagnosis: "分类讨论遗漏。",
    step_analysis: ["第二步遗漏参数范围"],
    solution_highlights: ["先分类讨论"],
    standard_solution: "标准解法。",
  },
  memory_delta: {
    knowledge_mastery_changes: { derivative_monotonicity: -6 },
    mistake_cause_changes: { classification_missing: 1 },
    is_repeated_mistake: false,
    review_priority_changes: ["derivative_monotonicity"],
    should_persist: false,
    rationale: "图片抽取置信度低，本次只展示诊断建议，不写入长期画像。",
  },
  student_profile: demoStudentProfile,
  practice_questions: sample.practice_questions,
  review_plan: sample.review_plan,
  sample_diagnosis: null,
  fallback_used: false,
  warnings: ["请检查识别结果。"],
};

const imageView = createImageDiagnosisViewModel(imageResponse);
assert.equal(imageView.source, "image");
assert.equal(imageView.title, "图片识别错题");
assert.equal(imageView.question_text, "已识别题干。");
assert.equal(imageView.student_answer, "学生答案。");
assert.deepEqual(imageView.student_solution_steps, ["第一步", "第二步"]);
assert.deepEqual(imageView.knowledge_points, ["derivative_monotonicity"]);
assert.equal(imageView.extraction_confidence, "low");
assert.equal(imageView.should_persist_profile, false);
assert.deepEqual(imageView.warnings, ["请检查识别结果。"]);
assert.equal(
  createRetainedReportNotice(
    imageView,
    "模型输出的 student_solution_steps 不合法。",
  ),
  "当前显示的是上一次成功图片诊断结果，本次图片诊断未生成新报告。原因：模型输出的 student_solution_steps 不合法。",
);
assert.equal(
  createRetainedReportNotice(sampleView, "模型输出缺少 standard_solution_draft。"),
  "当前显示的是样例题结果，本次图片诊断未生成新报告。原因：模型输出缺少 standard_solution_draft。",
);
assert.equal(
  createExtractionReviewRetainedReportNotice(imageView),
  "当前显示的是上一次成功图片诊断报告，本次图片只完成识别抽取，确认后才会生成新报告。",
);
assert.equal(
  createExtractionReviewRetainedReportNotice(sampleView),
  "当前显示的是样例题结果，本次图片只完成识别抽取，确认后才会生成新报告。",
);
assert.equal(
  createAgentTimelineStatusLabel({
    isDiagnosing: true,
    isAwaitingConfirmation: false,
    hasRetainedReportNotice: true,
  }),
  "正在分析",
);
assert.equal(
  createAgentTimelineStatusLabel({
    isDiagnosing: false,
    isAwaitingConfirmation: true,
    hasRetainedReportNotice: true,
  }),
  "待确认识别",
);
assert.equal(
  createAgentTimelineStatusLabel({
    isDiagnosing: false,
    isAwaitingConfirmation: false,
    hasRetainedReportNotice: true,
  }),
  "保留旧报告",
);
assert.equal(
  createAgentTimelineStatusLabel({
    isDiagnosing: false,
    isAwaitingConfirmation: false,
    hasRetainedReportNotice: false,
  }),
  "诊断完成",
);

const extractionReviewResponse = {
  diagnosis_id: "diag_extraction_1",
  student_id: "demo_student_001",
  source: "image",
  stage: "extraction_review",
  recognized_question: {
    id: "image_draft_1",
    title: "图片识别草稿",
    module: "导数",
    question_text: "求函数单调区间。",
    student_answer: "单调递增",
    student_solution_steps: ["求导", "直接判断"],
    standard_solution_draft: "先求导，再判断导数符号。",
    extraction_confidence: "high",
  },
  requires_confirmation: true,
  can_persist_after_confirmation: true,
  confirmation_token: "confirm_token_1",
  sample_diagnosis: null,
  fallback_used: false,
  warnings: ["请确认定义域。"],
};

const draft = createEditableExtractionDraft(extractionReviewResponse);
assert.equal(draft.confirmation_token, "confirm_token_1");
assert.equal(draft.question_text, "求函数单调区间。");
assert.equal(draft.student_answer, "单调递增");
assert.equal(draft.steps_text, "求导\n直接判断");
assert.equal(draft.standard_solution_draft, "先求导，再判断导数符号。");
assert.equal(draft.extraction_confidence, "high");
assert.deepEqual(draft.warnings, ["请确认定义域。"]);
assert.equal(draft.can_persist_after_confirmation, true);

const lowDraft = createEditableExtractionDraft({
  ...extractionReviewResponse,
  recognized_question: {
    ...extractionReviewResponse.recognized_question,
    extraction_confidence: "low",
  },
  can_persist_after_confirmation: false,
});
assert.equal(lowDraft.can_persist_after_confirmation, false);

assert.deepEqual(createVisionExtractionDraftFromEditableDraft(draft), {
  question_text: "求函数单调区间。",
  student_answer: "单调递增",
  student_solution_steps: ["求导", "直接判断"],
  standard_solution_draft: "先求导，再判断导数符号。",
  extraction_confidence: "high",
  warnings: ["请确认定义域。"],
});

assert.equal(canConfirmEditableExtractionDraft(draft), true);
assert.equal(
  canConfirmEditableExtractionDraft({
    ...draft,
    question_text: " ",
  }),
  false,
);
assert.equal(
  canConfirmEditableExtractionDraft({
    ...draft,
    student_answer: " ",
  }),
  false,
);
assert.equal(
  canConfirmEditableExtractionDraft({
    ...draft,
    steps_text: "\n  \n",
  }),
  false,
);
assert.equal(
  canConfirmEditableExtractionDraft({
    ...draft,
    standard_solution_draft: " ",
  }),
  false,
);

console.log("diagnosis view model regression test passed");
