import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { POST: diagnoseRoutePost } = jiti("../src/app/api/diagnose/route.ts");
const { POST: confirmRoutePost } = jiti("../src/app/api/confirm/route.ts");
const { handleDiagnoseRequest } = jiti("../src/lib/diagnose-service.ts");
const { handleConfirmRequest } = jiti("../src/lib/confirm-service.ts");
const { demoStudentProfile, mistakeHistory } = jiti(
  "../src/data/mathtrace-demo.ts",
);
const { isDiagnoseImageExtractionResponse } = jiti(
  "../src/lib/diagnose-api.ts",
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
        standard_solution_draft: "先求导，再按 $a\\le 0$ 与 $a>0$ 分类讨论。",
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
assert.equal("memory_delta" in extractionResult.body, false);
assert.equal("student_profile" in extractionResult.body, false);
assert.equal(typeof extractionResult.body.confirmation_token, "string");

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
  return {
    question_text: extractionResponse.recognized_question.question_text,
    student_answer: extractionResponse.recognized_question.student_answer,
    student_solution_steps:
      extractionResponse.recognized_question.student_solution_steps,
    standard_solution_draft:
      extractionResponse.recognized_question.standard_solution_draft,
    extraction_confidence:
      extractionResponse.recognized_question.extraction_confidence,
    warnings: extractionResponse.warnings,
  };
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
          standard_solution_draft:
            "先求导，再按 $a\\le 0$ 与 $a>0$ 分类讨论。",
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
