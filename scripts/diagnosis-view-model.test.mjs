import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { demoStudentProfile, sampleDiagnoses } = jiti(
  "../src/data/mathtrace-demo.ts",
);
const {
  createImageDiagnosisViewModel,
  createRetainedReportNotice,
  createSampleDiagnosisViewModel,
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
  createRetainedReportNotice(imageView),
  "当前显示的是上一次成功图片诊断结果，本次请求未生成新报告。",
);
assert.equal(
  createRetainedReportNotice(sampleView),
  "当前显示的是样例题结果，本次图片诊断未生成新报告。",
);

console.log("diagnosis view model regression test passed");
