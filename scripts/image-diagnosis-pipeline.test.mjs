import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { runImageMathTraceAgent } = jiti(
  "../src/lib/image-diagnosis-pipeline.ts",
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
