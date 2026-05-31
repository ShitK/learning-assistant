import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { demoStudentProfile, mistakeHistory } = jiti(
  "../src/data/mathtrace-demo.ts",
);
const {
  buildImageDiagnosePayload,
  buildSampleDiagnosePayload,
  getDiagnoseClientErrorMessage,
  shouldPersistDiagnoseProfile,
} = jiti("../src/lib/diagnose-client.ts");
const { isDiagnoseImageSuccessResponse } = jiti(
  "../src/lib/diagnose-api.ts",
);

const samplePayload = buildSampleDiagnosePayload({
  sample_question_id: "sample_derivative_001",
  student_profile: demoStudentProfile,
  mistake_history: mistakeHistory,
});

assert.equal(samplePayload.task_type, "sample_diagnosis");
assert.equal(samplePayload.image_base64, null);
assert.equal(samplePayload.student_id, "demo_student_001");

const imagePayload = buildImageDiagnosePayload({
  image_base64: "YWJjZA==",
  image_mime_type: "image/jpeg",
  student_profile: demoStudentProfile,
  mistake_history: mistakeHistory,
});

assert.equal(imagePayload.task_type, "image_diagnosis");
assert.equal(imagePayload.sample_question_id, null);
assert.equal(imagePayload.image_mime_type, "image/jpeg");
assert.equal(imagePayload.image_base64, "YWJjZA==");

assert.equal(
  getDiagnoseClientErrorMessage({
    error: {
      code: "model_timeout",
      message: "模型响应较慢，请稍后重试或改用样例题。",
      recoverable: true,
    },
    fallback_used: true,
    warnings: [],
  }),
  "模型响应较慢，请稍后重试或改用样例题。",
);

assert.equal(
  getDiagnoseClientErrorMessage(null),
  "诊断接口暂时不可用，已保留当前结果。",
);

assert.equal(
  getDiagnoseClientErrorMessage({
    error: {
      code: "model_invalid_output",
      message: "模型输出缺少 student_answer。",
      recoverable: true,
    },
    fallback_used: true,
    warnings: [],
    debug_summary: {
      output_kind: "json_object",
      raw_output_length: 180,
      present_fields: [
        "question_text",
        "student_solution_steps",
        "standard_solution_draft",
        "extraction_confidence",
        "warnings",
      ],
      missing_fields: ["student_answer"],
      extra_fields: [],
      forbidden_fields: [],
      field_lengths: {
        question_text: 28,
      },
      list_lengths: {
        student_solution_steps: 2,
        warnings: 1,
      },
    },
  }),
  [
    "没有识别到学生作答区域，请上传包含题干和学生解题痕迹的图片。",
    "开发诊断：模型返回 JSON；已返回字段 question_text, student_solution_steps, standard_solution_draft, extraction_confidence, warnings；缺少字段 student_answer；题干长度 28；学生答案长度 0。",
  ].join("\n"),
);

const highConfidenceImageResponse = {
  diagnosis_id: "diag_image_1",
  student_id: "demo_student_001",
  source: "image",
  steps: [],
  recognized_question: {
    id: "image_1",
    title: "图片识别错题",
    module: "导数",
    question_text: "求函数单调区间。",
    student_answer: "遗漏参数讨论。",
    student_solution_steps: ["求导", "直接判断"],
    extraction_confidence: "high",
  },
  knowledge_mapping: {
    knowledge_points: ["derivative_monotonicity"],
    difficulty: 4,
  },
  mistake_diagnosis: {
    mistake_causes: ["classification_missing"],
    severity: "medium",
    expected_diagnosis: "分类讨论遗漏。",
    step_analysis: ["没有讨论参数范围"],
    solution_highlights: ["先讨论参数范围"],
    standard_solution: "先求导，再分类讨论。",
  },
  memory_delta: {
    knowledge_mastery_changes: { derivative_monotonicity: -6 },
    mistake_cause_changes: { classification_missing: 1 },
    is_repeated_mistake: false,
    review_priority_changes: ["derivative_monotonicity"],
    should_persist: true,
    rationale: "图片抽取通过校验后，由本地规则计算画像增量。",
  },
  student_profile: demoStudentProfile,
  practice_questions: [],
  review_plan: {
    tomorrow: "复习导数单调性。",
    seven_days: [],
    rationale: ["本次错因涉及导数。"],
  },
  sample_diagnosis: null,
  fallback_used: false,
  warnings: [],
};

assert.equal(isDiagnoseImageSuccessResponse(highConfidenceImageResponse), true);
assert.equal(shouldPersistDiagnoseProfile(highConfidenceImageResponse), true);

const lowConfidenceImageResponse = {
  ...highConfidenceImageResponse,
  recognized_question: {
    ...highConfidenceImageResponse.recognized_question,
    extraction_confidence: "low",
  },
  memory_delta: {
    ...highConfidenceImageResponse.memory_delta,
    should_persist: false,
  },
};

assert.equal(isDiagnoseImageSuccessResponse(lowConfidenceImageResponse), true);
assert.equal(shouldPersistDiagnoseProfile(lowConfidenceImageResponse), false);

const inconsistentLowConfidenceImageResponse = {
  ...lowConfidenceImageResponse,
  memory_delta: {
    ...lowConfidenceImageResponse.memory_delta,
    should_persist: true,
  },
};

assert.equal(
  isDiagnoseImageSuccessResponse(inconsistentLowConfidenceImageResponse),
  false,
);
assert.equal(
  shouldPersistDiagnoseProfile(inconsistentLowConfidenceImageResponse),
  false,
);

const malformedImageResponse = {
  ...highConfidenceImageResponse,
  knowledge_mapping: null,
};

assert.equal(isDiagnoseImageSuccessResponse(malformedImageResponse), false);

const malformedProfileImageResponse = {
  ...highConfidenceImageResponse,
  student_profile: {
    ...demoStudentProfile,
    gaokao_focus: [
      {
        knowledge_point: "parameter_classification",
        reason: "缺少 priority。",
      },
    ],
  },
};

assert.equal(isDiagnoseImageSuccessResponse(malformedProfileImageResponse), false);

console.log("diagnose client regression test passed");
