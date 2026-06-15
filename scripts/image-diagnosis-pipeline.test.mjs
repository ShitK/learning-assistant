import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { runImageMathTraceAgent } = jiti(
  "../src/lib/image-diagnosis/image-diagnosis-pipeline.ts",
);
const { demoStudentProfile } = jiti("../src/data/mathtrace-demo.ts");

const request = {
  student_id: "demo_student_001",
  task_type: "image_diagnosis",
  sample_question_id: null,
  image_base64: "iVBORw0KGgo=",
  image_mime_type: "image/png",
  student_profile: demoStudentProfile,
  mistake_history: [],
};

const extraction = {
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论 $f(x)$ 的单调性。",
  student_answer: "$f'(x)=3x^2-3a$，令 $f'(x)=0$ 得 $x=\\sqrt a$。",
  student_solution_steps: ["求导正确", "只写出一个临界点", "没有讨论 $a\\le 0$"],
  standard_solution_draft: "应先讨论 $a\\le 0$，再讨论 $a>0$ 时两个临界点。",
  extraction_confidence: "high",
  warnings: [],
};

const response = runImageMathTraceAgent({
  request,
  extraction,
  is_extraction_confirmed: true,
});

assert.equal(response.source, "image");
assert.equal(response.fallback_used, false);
assert.equal(response.sample_diagnosis, null);
assert.equal(response.evidence_level, "student_work_sufficient");
assert.equal(response.persistence_evidence, "student_work");
assert.equal(response.profile_update_kind, "mistake_cause");
assert.equal(response.risk_follow_up, null);
assert.deepEqual(response.knowledge_mapping.knowledge_points, [
  "derivative_monotonicity",
  "parameter_classification",
]);
assert.deepEqual(response.mistake_diagnosis.mistake_causes, [
  "classification_missing",
  "domain_missing",
]);
assert.equal(response.memory_delta.should_persist, true);
assert.equal(
  response.student_profile.frequent_mistake_causes.classification_missing,
  5,
);
assert.equal(response.practice_questions.length, 3);
assert.equal(response.review_plan.seven_days.length, 7);
assert.equal(
  response.mistake_diagnosis.standard_solution.includes("未生成分析模型结果"),
  true,
);
assert.equal(
  response.mistake_diagnosis.standard_solution.includes("未配置分析模型"),
  false,
);

const enhancedResponse = runImageMathTraceAgent({
  request,
  extraction,
  is_extraction_confirmed: true,
  analysis: {
    expected_diagnosis: "DeepSeek 增强：参数分类讨论缺失。",
    step_analysis: ["DeepSeek 只增强展示步骤"],
    solution_highlights: ["DeepSeek 只增强标准解法表达"],
    standard_solution: "DeepSeek 标准解法：$f'(x)=0$ 后分类讨论。",
    warnings: ["分析模型结果已纳入报告。"],
  },
});

assert.equal(
  enhancedResponse.mistake_diagnosis.expected_diagnosis,
  "DeepSeek 增强：参数分类讨论缺失。",
);
assert.deepEqual(enhancedResponse.mistake_diagnosis.step_analysis, [
  "DeepSeek 只增强展示步骤",
]);
assert.deepEqual(
  enhancedResponse.knowledge_mapping,
  response.knowledge_mapping,
);
assert.deepEqual(
  enhancedResponse.mistake_diagnosis.mistake_causes,
  response.mistake_diagnosis.mistake_causes,
);
assert.equal(
  enhancedResponse.mistake_diagnosis.severity,
  response.mistake_diagnosis.severity,
);
assert.deepEqual(enhancedResponse.memory_delta, response.memory_delta);
assert.deepEqual(enhancedResponse.student_profile, response.student_profile);
assert.equal(
  enhancedResponse.warnings.includes("分析模型结果已纳入报告。"),
  true,
);

const problemOnlyExtraction = {
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "未识别到学生答案",
  student_solution_steps: [],
  standard_solution_draft: "应先求导，再按参数分类讨论。",
  extraction_confidence: "low",
  warnings: ["没有识别到学生作答区域。"],
};

const problemOnlyResponse = runImageMathTraceAgent({
  request,
  extraction: problemOnlyExtraction,
  is_extraction_confirmed: true,
  confirmation_action: "skip_follow_up",
});

assert.equal(problemOnlyResponse.evidence_level, "problem_only");
assert.equal(
  problemOnlyResponse.persistence_evidence,
  "uploaded_problem_only",
);
assert.equal(problemOnlyResponse.profile_update_kind, "problem_type_focus");
assert.notEqual(problemOnlyResponse.risk_follow_up, null);
assert.deepEqual(problemOnlyResponse.mistake_diagnosis.mistake_causes, []);
assert.deepEqual(problemOnlyResponse.memory_delta.mistake_cause_changes, {});
assert.deepEqual(problemOnlyResponse.memory_delta.knowledge_mastery_changes, {
  derivative_monotonicity: -2,
  parameter_classification: -2,
});
assert.deepEqual(problemOnlyResponse.memory_delta.review_priority_changes, [
  "derivative_monotonicity",
  "parameter_classification",
]);
assert.equal(problemOnlyResponse.memory_delta.should_persist, true);
assert.equal(
  problemOnlyResponse.student_profile.frequent_mistake_causes
    .classification_missing,
  4,
);

const pendingProblemOnlyResponse = runImageMathTraceAgent({
  request,
  extraction: problemOnlyExtraction,
  is_extraction_confirmed: true,
});

assert.equal(pendingProblemOnlyResponse.evidence_level, "problem_only");
assert.equal(pendingProblemOnlyResponse.persistence_evidence, "none");
assert.equal(pendingProblemOnlyResponse.profile_update_kind, "none");
assert.deepEqual(
  pendingProblemOnlyResponse.memory_delta.mistake_cause_changes,
  {},
);
assert.equal(pendingProblemOnlyResponse.memory_delta.should_persist, false);

const invalidFollowUpResponse = runImageMathTraceAgent({
  request,
  extraction: {
    question_text: "已知函数 $f(x)=x^3+1$，求导并说明单调性。",
    student_answer: "",
    student_solution_steps: [],
    standard_solution_draft: "应先求导，再判断导数符号。",
    extraction_confidence: "low",
    warnings: ["没有识别到学生作答区域。"],
  },
  is_extraction_confirmed: true,
  confirmation_action: "confirm_stuck_point_analysis",
  follow_up_answer: {
    selected_stuck_point_id: "unknown_stuck_point",
    custom_text: null,
  },
});

assert.equal(invalidFollowUpResponse.evidence_level, "problem_only");
assert.equal(invalidFollowUpResponse.persistence_evidence, "none");
assert.equal(invalidFollowUpResponse.profile_update_kind, "none");
assert.deepEqual(invalidFollowUpResponse.mistake_diagnosis.mistake_causes, []);
assert.deepEqual(invalidFollowUpResponse.memory_delta.knowledge_mastery_changes, {});
assert.deepEqual(invalidFollowUpResponse.memory_delta.mistake_cause_changes, {});
assert.deepEqual(invalidFollowUpResponse.memory_delta.review_priority_changes, []);
assert.equal(invalidFollowUpResponse.memory_delta.should_persist, false);

const insufficientResponse = runImageMathTraceAgent({
  request,
  extraction: {
    question_text: "",
    student_answer: "未识别到学生答案",
    student_solution_steps: [],
    standard_solution_draft: "",
    extraction_confidence: "low",
    warnings: [],
  },
  is_extraction_confirmed: true,
});

assert.equal(insufficientResponse.evidence_level, "insufficient");
assert.equal(insufficientResponse.persistence_evidence, "none");
assert.equal(insufficientResponse.profile_update_kind, "none");
assert.equal(insufficientResponse.risk_follow_up, null);
assert.deepEqual(insufficientResponse.mistake_diagnosis.mistake_causes, []);
assert.deepEqual(insufficientResponse.memory_delta.knowledge_mastery_changes, {});
assert.deepEqual(insufficientResponse.memory_delta.mistake_cause_changes, {});
assert.deepEqual(insufficientResponse.memory_delta.review_priority_changes, []);
assert.equal(insufficientResponse.memory_delta.should_persist, false);
assert.deepEqual(insufficientResponse.student_profile, demoStudentProfile);

const analyzedProblemOnly = runImageMathTraceAgent({
  request,
  extraction: problemOnlyExtraction,
  is_extraction_confirmed: true,
  confirmation_action: "skip_follow_up",
  analysis: {
    expected_diagnosis: "模型增强展示文本。",
    step_analysis: ["展示文本"],
    solution_highlights: ["展示文本"],
    standard_solution: "DeepSeek 补全标准解法：先求导，再按 $a\\le 0$ 与 $a>0$ 分类讨论。",
    warnings: [],
  },
});

assert.equal(analyzedProblemOnly.evidence_level, "problem_only");
assert.equal(analyzedProblemOnly.profile_update_kind, "problem_type_focus");
assert.deepEqual(analyzedProblemOnly.mistake_diagnosis.mistake_causes, []);
assert.deepEqual(analyzedProblemOnly.memory_delta.mistake_cause_changes, {});
assert.deepEqual(analyzedProblemOnly.memory_delta.knowledge_mastery_changes, {
  derivative_monotonicity: -2,
  parameter_classification: -2,
});
assert.deepEqual(
  analyzedProblemOnly.student_profile,
  problemOnlyResponse.student_profile,
);
assert.equal(analyzedProblemOnly.mistake_diagnosis.expected_diagnosis, "模型增强展示文本。");
assert.equal(
  analyzedProblemOnly.mistake_diagnosis.standard_solution,
  "DeepSeek 补全标准解法：先求导，再按 $a\\le 0$ 与 $a>0$ 分类讨论。",
);

const lowConfidenceResponse = runImageMathTraceAgent({
  request,
  extraction: {
    ...extraction,
    extraction_confidence: "low",
    warnings: ["图片较模糊，需要学生确认。"],
  },
  is_extraction_confirmed: true,
});

assert.equal(lowConfidenceResponse.memory_delta.should_persist, false);
assert.equal(lowConfidenceResponse.warnings.includes("图片较模糊，需要学生确认。"), true);
assert.equal(
  lowConfidenceResponse.student_profile.frequent_mistake_causes
    .classification_missing,
  4,
);

const unconfirmedResponse = runImageMathTraceAgent({
  request,
  extraction,
  is_extraction_confirmed: false,
});

assert.equal(unconfirmedResponse.memory_delta.should_persist, false);
assert.equal(
  unconfirmedResponse.student_profile.frequent_mistake_causes
    .classification_missing,
  4,
);

console.log("image diagnosis pipeline test passed");
