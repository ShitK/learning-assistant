import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();

const { POST: diagnoseRoutePost } = jiti("./src/app/api/diagnose/route.ts");
const { POST: confirmRoutePost } = jiti("./src/app/api/confirm/route.ts");
const { POST: variantPracticeRoutePost } = jiti(
  "./src/app/api/variant-practice/route.ts",
);
const { handleDiagnoseRequest } = jiti("./src/lib/diagnosis/diagnose-service.ts");
const { handleConfirmRequest } = jiti("./src/lib/diagnosis/confirm-service.ts");
const { createVisionProvider } = jiti(
  "./src/lib/providers/anthropic-compatible-provider.ts",
);
const { demoStudentProfile, mistakeHistory } = jiti(
  "./src/data/mathtrace-demo.ts",
);
const { isDiagnoseImageExtractionResponse } = jiti(
  "./src/lib/diagnosis/diagnose-api.ts",
);

const samplePayload = {
  student_id: "demo_student_001",
  task_type: "sample_diagnosis",
  sample_question_id: "sample_derivative_001",
  image_base64: null,
  student_profile: demoStudentProfile,
  mistake_history: mistakeHistory,
};

await assertRouteError(
  diagnoseRoutePost,
  rawRequest("{"),
  400,
  "invalid_json",
);

await assertRouteError(confirmRoutePost, rawRequest("{"), 400, "invalid_json");
await assertRouteError(
  variantPracticeRoutePost,
  rawRequest("{"),
  400,
  "invalid_json",
);

const sampleRouteResponse = await diagnoseRoutePost(jsonRequest(samplePayload));
const sampleRouteBody = await sampleRouteResponse.json();

assert.equal(sampleRouteResponse.status, 200);
assert.equal(sampleRouteBody.source, "sample");
assert.equal(sampleRouteBody.fallback_used, false);
assert.equal(sampleRouteBody.sample_diagnosis?.id, "sample_derivative_001");
assert.equal(sampleRouteBody.practice_questions.length, 3);
assert.equal(sampleRouteBody.review_plan.seven_days.length, 7);

await assertRouteError(
  diagnoseRoutePost,
  jsonRequest({
    ...samplePayload,
    student_id: "student_002",
  }),
  400,
  "invalid_request",
);

await assertRouteError(
  diagnoseRoutePost,
  jsonRequest({
    ...samplePayload,
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: null,
    image_mime_type: "image/png",
  }),
  400,
  "missing_image",
);

const fakeVisionProvider = {
  async extractQuestionFromImage() {
    return {
      ok: true,
      value: {
        question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论单调性。",
        student_answer: "只写了求导。",
        student_solution_steps: ["求导得到 $f'(x)=1/x-a$。"],
        extraction_confidence: "high",
        warnings: [],
      },
    };
  },
};

const extractionResult = await handleDiagnoseRequest(
  {
    ...samplePayload,
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "iVBORw0KGgo=",
    image_mime_type: "image/png",
  },
  { vision_provider: fakeVisionProvider },
);

assert.equal(extractionResult.status, 200);
assert.equal(extractionResult.body.stage, "extraction_review");
assert.equal(isDiagnoseImageExtractionResponse(extractionResult.body), true);
assert.deepEqual(
  Object.keys(extractionResult.body.recognized_question).sort(),
  [
    "extraction_confidence",
    "id",
    "module",
    "question_text",
    "student_answer",
    "student_solution_steps",
    "title",
  ].sort(),
);
assert.equal("memory_delta" in extractionResult.body, false);
assert.equal("student_profile" in extractionResult.body, false);
assert.equal(typeof extractionResult.body.confirmation_token, "string");

const glmOcrVisionProvider = createVisionProvider({
  protocol: "glm_ocr",
  base_url: "https://open.bigmodel.cn/api/paas/v4",
  model: "glm-ocr",
  api_key: "secret-key-for-test",
  provider_name: "glm_ocr",
  image_format: "base64",
  timeout_ms: 1000,
  fetch_impl: async () =>
    new Response(
      JSON.stringify({
        id: "task_123456789",
        model: "GLM-OCR",
        md_results:
          "15. 已知函数 $f(x)=\\ln x-ax+1$，讨论单调性。\n\n解：\n$f'(x)=1/x-a$",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
});

const glmOcrExtractionResult = await handleDiagnoseRequest(
  {
    ...samplePayload,
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "iVBORw0KGgo=",
    image_mime_type: "image/png",
  },
  { vision_provider: glmOcrVisionProvider },
);

assert.equal(glmOcrExtractionResult.status, 200);
assert.equal(glmOcrExtractionResult.body.stage, "extraction_review");
assert.equal(isDiagnoseImageExtractionResponse(glmOcrExtractionResult.body), true);
assert.equal(
  glmOcrExtractionResult.body.recognized_question.question_text.includes("单调性"),
  true,
);
assert.equal(
  glmOcrExtractionResult.body.recognized_question.student_answer.includes("1/x-a"),
  true,
);
assert.equal("memory_delta" in glmOcrExtractionResult.body, false);
assert.equal("student_profile" in glmOcrExtractionResult.body, false);

const confirmPayload = {
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: extractionResult.body.confirmation_token,
  confirmed_extraction: createConfirmedExtractionDraft(extractionResult.body),
  student_profile: demoStudentProfile,
  mistake_history: [],
};

const confirmRouteResponse = await confirmRoutePost(jsonRequest(confirmPayload));
const confirmRouteBody = await confirmRouteResponse.json();

assert.equal(confirmRouteResponse.status, 200);
assert.equal(confirmRouteBody.source, "image");
assert.equal(confirmRouteBody.evidence_level, "student_work_sufficient");
assert.equal(confirmRouteBody.memory_delta.should_persist, true);

await assertRouteError(
  confirmRoutePost,
  jsonRequest({
    ...confirmPayload,
    student_id: "student_002",
  }),
  400,
  "invalid_request",
);

await assertRouteError(
  variantPracticeRoutePost,
  jsonRequest({
    student_id: "student_002",
    request_source: "confirmed_image_diagnosis",
    evidence_level: "student_work_sufficient",
    persistence_evidence: "student_work",
    profile_update_kind: "mistake_cause",
    question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论函数单调性。",
    knowledge_points: ["derivative_monotonicity"],
    mistake_causes: ["classification_missing"],
  }),
  400,
  "invalid_request",
);

const variantPracticeRouteResponse = await variantPracticeRoutePost(
  jsonRequest({
    student_id: "demo_student_001",
    request_source: "confirmed_image_diagnosis",
    evidence_level: "student_work_sufficient",
    persistence_evidence: "student_work",
    profile_update_kind: "mistake_cause",
    question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论函数单调性并求参数范围。",
    knowledge_points: ["derivative_monotonicity"],
    mistake_causes: ["classification_missing"],
  }),
);
const variantPracticeRouteBody = await variantPracticeRouteResponse.json();

assert.equal(variantPracticeRouteResponse.status, 200);
assert.equal(
  variantPracticeRouteBody.variant_practice === null ||
    variantPracticeRouteBody.variant_practice.items.length === 3,
  true,
);
assert.equal(JSON.stringify(variantPracticeRouteBody).includes("score"), false);
assert.equal(
  JSON.stringify(variantPracticeRouteBody).includes("matched_dimensions"),
  false,
);

const confirmResult = await handleConfirmRequest(confirmPayload);

assert.equal(confirmResult.status, 200);
assert.equal(confirmResult.body.source, "image");
assert.equal(confirmResult.body.evidence_level, "student_work_sufficient");
assert.equal(confirmResult.body.memory_delta.should_persist, true);

const problemOnlyExtractionResult = await handleDiagnoseRequest(
  {
    ...samplePayload,
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "iVBORw0KGgo=",
    image_mime_type: "image/png",
  },
  { vision_provider: createProblemOnlyVisionProvider() },
);

assert.equal(problemOnlyExtractionResult.status, 200);
assert.equal(problemOnlyExtractionResult.body.stage, "extraction_review");
assert.equal(isDiagnoseImageExtractionResponse(problemOnlyExtractionResult.body), true);

const skipFollowUpRouteResponse = await confirmRoutePost(
  jsonRequest({
    student_id: "demo_student_001",
    task_type: "confirmed_image_diagnosis",
    confirmation_token: problemOnlyExtractionResult.body.confirmation_token,
    confirmation_action: "skip_follow_up",
    confirmed_extraction: createConfirmedExtractionDraft(
      problemOnlyExtractionResult.body,
    ),
    student_profile: demoStudentProfile,
    mistake_history: [],
  }),
);
const skipFollowUpRouteBody = await skipFollowUpRouteResponse.json();

assert.equal(skipFollowUpRouteResponse.status, 200);
assert.equal(skipFollowUpRouteBody.source, "image");
assert.equal(skipFollowUpRouteBody.evidence_level, "problem_only");
assert.equal(skipFollowUpRouteBody.persistence_evidence, "uploaded_problem_only");
assert.equal(skipFollowUpRouteBody.profile_update_kind, "problem_type_focus");
assert.equal(skipFollowUpRouteBody.memory_delta.should_persist, true);
assert.equal(
  Object.keys(skipFollowUpRouteBody.memory_delta.mistake_cause_changes).length,
  0,
);

console.log("api smoke test passed");

function rawRequest(body) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
    },
  });
}

function jsonRequest(body) {
  return rawRequest(JSON.stringify(body));
}

function createConfirmedExtractionDraft(extractionResponse) {
  const confirmedExtraction = {
    question_text: extractionResponse.recognized_question.question_text,
    student_answer: extractionResponse.recognized_question.student_answer,
    student_solution_steps:
      extractionResponse.recognized_question.student_solution_steps,
    extraction_confidence:
      extractionResponse.recognized_question.extraction_confidence,
    warnings: extractionResponse.warnings,
  };

  assert.deepEqual(
    Object.keys(confirmedExtraction).sort(),
    [
      "extraction_confidence",
      "question_text",
      "student_answer",
      "student_solution_steps",
      "warnings",
    ].sort(),
  );

  return confirmedExtraction;
}

function createProblemOnlyVisionProvider() {
  return {
    async extractQuestionFromImage() {
      return {
        ok: true,
        value: {
          question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论单调性。",
          student_answer: "未识别到学生答案",
          student_solution_steps: [],
          extraction_confidence: "low",
          warnings: ["未识别到清晰学生步骤。"],
        },
      };
    },
  };
}

async function assertRouteError(
  routePost,
  request,
  expectedStatus,
  expectedCode,
) {
  const response = await routePost(request);
  const body = await response.json();

  assert.equal(response.status, expectedStatus);
  assert.equal(body.error?.code, expectedCode);
  assert.equal(body.error?.recoverable, true);
}
