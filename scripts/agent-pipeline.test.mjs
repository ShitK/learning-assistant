import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  planTask,
  recognizeQuestion,
  retrieveKnowledgeContext,
  mapKnowledgePoints,
  diagnoseMistake,
  computeMemoryDelta,
  generatePractice,
  planReview,
  buildDiagnoseResponse,
  runMathTraceAgent,
} = jiti("../src/lib/diagnosis/mathtrace-agent-pipeline.ts");
const { POST } = jiti("../src/app/api/diagnose/route.ts");
const { handleDiagnoseRequest } = jiti("../src/lib/diagnosis/diagnose-service.ts");

const { demoStudentProfile, sampleDiagnoses } = jiti(
  "../src/data/mathtrace-demo.ts",
);

const firstSample = sampleDiagnoses[0];
assert.ok(firstSample, "sample fixture should exist");

const request = createSampleRequest(firstSample.id);
const sample = firstSample;

const plan = planTask(request);
assert.deepEqual(plan.stage_ids, [
  "task_planning",
  "question_recognition",
  "knowledge_retrieval",
  "knowledge_mapping",
  "mistake_diagnosis",
  "memory_delta",
  "practice_generation",
  "review_planning",
  "response_building",
]);

const recognizedQuestion = recognizeQuestion(plan);
assert.equal(recognizedQuestion.id, sample.id);
assert.equal(recognizedQuestion.question_text, sample.question_text);

const knowledgeContext = retrieveKnowledgeContext(recognizedQuestion);
assert.deepEqual(
  knowledgeContext.knowledge_points.map((item) => item.id),
  sample.knowledge_points,
);

const knowledgeMapping = mapKnowledgePoints(
  recognizedQuestion,
  knowledgeContext,
);
assert.deepEqual(knowledgeMapping.knowledge_points, sample.knowledge_points);
assert.equal(knowledgeMapping.difficulty, sample.difficulty);

const mistakeDiagnosis = diagnoseMistake(
  recognizedQuestion,
  knowledgeMapping,
  knowledgeContext,
);
assert.deepEqual(mistakeDiagnosis.mistake_causes, sample.mistake_causes);

const memoryDelta = computeMemoryDelta(mistakeDiagnosis, knowledgeContext);
assert.deepEqual(memoryDelta, sample.memory_delta);

const practiceQuestions = generatePractice(mistakeDiagnosis, knowledgeContext);
assert.equal(practiceQuestions.length, 3);

const reviewPlan = planReview(memoryDelta, knowledgeContext);
assert.equal(reviewPlan.seven_days.length, 7);

const manualResponse = buildDiagnoseResponse({
  request,
  recognizedQuestion,
  knowledgeMapping,
  mistakeDiagnosis,
  memoryDelta,
  practiceQuestions,
  reviewPlan,
  sample: knowledgeContext.sample,
});
const pipelineResponse = runMathTraceAgent(request);

assert.deepEqual(manualResponse, pipelineResponse);
assert.equal(pipelineResponse.diagnosis_id, `diag_${sample.id}`);
assert.equal(pipelineResponse.source, "sample");
assert.equal(pipelineResponse.fallback_used, false);
assert.equal(pipelineResponse.warnings.length, 0);
assert.equal(
  pipelineResponse.student_profile.mastery_scores.parameter_classification,
  38,
);
assert.equal(
  pipelineResponse.student_profile.frequent_mistake_causes
    .classification_missing,
  5,
);
assert.equal(pipelineResponse.sample_diagnosis.id, sample.id);

for (const item of sampleDiagnoses) {
  const itemResponse = runMathTraceAgent(createSampleRequest(item.id));

  assert.equal(itemResponse.diagnosis_id, `diag_${item.id}`);
  assert.equal(itemResponse.source, "sample");
  assert.equal(itemResponse.fallback_used, false);
  assert.deepEqual(
    itemResponse.knowledge_mapping.knowledge_points,
    item.knowledge_points,
  );
  assert.deepEqual(
    itemResponse.mistake_diagnosis.mistake_causes,
    item.mistake_causes,
  );
  assert.equal(itemResponse.practice_questions.length, 3);
  assert.equal(itemResponse.review_plan.seven_days.length, 7);
  assert.equal(itemResponse.sample_diagnosis.id, item.id);
}

const routeSuccessResponse = await postDiagnoseJson(
  createSampleRequest("sample_derivative_001"),
);
const routeSuccessBody = await routeSuccessResponse.json();

assert.equal(routeSuccessResponse.status, 200);
assert.equal(routeSuccessBody.source, "sample");
assert.equal(routeSuccessBody.fallback_used, false);
assert.equal(routeSuccessBody.provider_debug, undefined);

await assertDiagnoseError(postDiagnoseRaw("{"), 400, "invalid_json");
await assertDiagnoseError(postDiagnoseJson(null), 400, "invalid_request");
await assertDiagnoseError(
  postDiagnoseJson(
    createSampleRequest("sample_derivative_001", {
      task_type: "unsupported_task",
    }),
  ),
  400,
  "invalid_request",
);
await assertDiagnoseError(
  postDiagnoseJson(
    createSampleRequest("sample_derivative_001", {
      sample_question_id: null,
    }),
  ),
  400,
  "missing_sample_question_id",
);
await assertDiagnoseError(
  postDiagnoseJson(
    createSampleRequest("sample_derivative_001", {
      image_base64: 123,
    }),
  ),
  400,
  "invalid_request",
);
await assertDiagnoseError(
  postDiagnoseJson({
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: null,
    student_profile: demoStudentProfile,
    mistake_history: [],
  }),
  400,
  "missing_image",
);
await assertDiagnoseError(
  postDiagnoseJson({
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "not-base64",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  }),
  400,
  "invalid_image",
);
await assertDiagnoseError(
  postDiagnoseJson({
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "a".repeat(1_333_336),
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  }),
  413,
  "image_too_large",
);

const imageServiceResponse = await handleDiagnoseRequest(
  {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "iVBORw0KGgo=",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    vision_provider: {
      async extractQuestionFromImage() {
        return {
          ok: true,
          value: {
            question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
            student_answer: "只得到 $x=\\sqrt a$。",
            student_solution_steps: ["求导", "遗漏分类讨论"],
            extraction_confidence: "high",
            warnings: [],
          },
        };
      },
    },
  },
);

assert.equal(imageServiceResponse.status, 200);
assert.equal(imageServiceResponse.body.source, "image");
assert.equal(imageServiceResponse.body.fallback_used, false);
assert.equal(imageServiceResponse.body.provider_debug, undefined);

const unpaddedBase64ServiceResponse = await handleDiagnoseRequest(
  {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "YWJjZA",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    vision_provider: createFakeVisionProvider(),
  },
);

assert.equal(unpaddedBase64ServiceResponse.status, 200);
assert.equal(unpaddedBase64ServiceResponse.body.source, "image");

const originalNodeEnv = process.env.NODE_ENV;
const originalConfirmSecret = process.env.MATHTRACE_CONFIRM_SECRET;
try {
  process.env.NODE_ENV = "production";
  delete process.env.MATHTRACE_CONFIRM_SECRET;

  await assertServiceError(
    handleDiagnoseRequest(createImageRequest(), {
      vision_provider: createFakeVisionProvider(),
    }),
    502,
    "model_request_failed",
    true,
  );
} finally {
  restoreEnvValue("NODE_ENV", originalNodeEnv);
  restoreEnvValue("MATHTRACE_CONFIRM_SECRET", originalConfirmSecret);
}

await assertServiceError(
  handleDiagnoseRequest(createImageRequest(), {
    vision_provider: createErrorVisionProvider("model_timeout"),
  }),
  502,
  "model_timeout",
  true,
);
await assertServiceError(
  handleDiagnoseRequest(createImageRequest(), {
    vision_provider: createErrorVisionProvider("model_request_failed"),
  }),
  502,
  "model_request_failed",
  true,
);

const providerDebug = {
  provider_name: "anthropic_compatible_vision",
  provider_stage: "vision_llm",
  failure_kind: "http_error",
  http_status: 502,
};

const providerDebugResponse = await handleDiagnoseRequest(createImageRequest(), {
  vision_provider: createErrorVisionProvider(
    "model_request_failed",
    undefined,
    providerDebug,
  ),
});

assert.equal(providerDebugResponse.status, 502);
assert.deepEqual(providerDebugResponse.body.provider_debug, providerDebug);
assert.equal(
  JSON.stringify(providerDebugResponse.body.provider_debug).includes("iVBOR"),
  false,
);
await assertServiceError(
  handleDiagnoseRequest(createImageRequest(), {
    vision_provider: createErrorVisionProvider("model_invalid_output"),
  }),
  502,
  "model_invalid_output",
  true,
);

const invalidOutputDebugResponse = await handleDiagnoseRequest(
  createImageRequest(),
  {
    vision_provider: createErrorVisionProvider("model_invalid_output", {
      output_kind: "json_object",
      raw_output_length: 180,
      present_fields: ["question_text"],
      missing_fields: ["student_answer"],
      extra_fields: [],
      forbidden_fields: [],
      field_lengths: {
        question_text: 28,
      },
      list_lengths: {},
    }),
  },
);

assert.equal(invalidOutputDebugResponse.status, 502);
assert.deepEqual(invalidOutputDebugResponse.body.debug_summary.missing_fields, [
  "student_answer",
]);
assert.equal(
  JSON.stringify(invalidOutputDebugResponse.body.debug_summary).includes(
    "已知函数",
  ),
  false,
);

const notConfiguredResponse = await handleDiagnoseRequest(createImageRequest(), {
  vision_provider: createErrorVisionProvider("model_not_configured"),
});

assert.equal(notConfiguredResponse.status, 400);
assert.equal(notConfiguredResponse.body.error.code, "model_not_configured");
assert.equal(notConfiguredResponse.body.fallback_used, false);
assert.equal(notConfiguredResponse.body.provider_debug, undefined);

const fallbackProfileResponse = runMathTraceAgent(
  createSampleRequest("sample_derivative_001", {
    student_profile: "bad-profile",
  }),
);

assert.equal(
  fallbackProfileResponse.student_profile.mastery_scores
    .parameter_classification,
  38,
);

const nullProfileResponse = runMathTraceAgent(
  createSampleRequest("sample_derivative_001", {
    student_profile: null,
  }),
);

assert.equal(
  nullProfileResponse.student_profile.mastery_scores.parameter_classification,
  38,
);

const boundaryProfileResponse = runMathTraceAgent(
  createSampleRequest("sample_derivative_001", {
    student_profile: {
      ...demoStudentProfile,
      mastery_scores: {
        parameter_classification: 3,
        derivative_monotonicity: 101,
      },
      frequent_mistake_causes: {
        classification_missing: 0,
        domain_missing: 0,
      },
      review_priority: ["derivative_monotonicity", "function_domain"],
    },
  }),
);

assert.equal(
  boundaryProfileResponse.student_profile.mastery_scores
    .parameter_classification,
  0,
);
assert.equal(
  boundaryProfileResponse.student_profile.mastery_scores
    .derivative_monotonicity,
  96,
);
assert.equal(
  boundaryProfileResponse.student_profile.frequent_mistake_causes
    .classification_missing,
  1,
);
assert.equal(
  boundaryProfileResponse.student_profile.frequent_mistake_causes
    .domain_missing,
  1,
);
assert.deepEqual(boundaryProfileResponse.student_profile.review_priority, [
  "parameter_classification",
  "derivative_monotonicity",
  "function_domain",
]);

const negativeCauseResponse = buildDiagnoseResponse({
  request: createSampleRequest("sample_derivative_001", {
    student_profile: {
      ...demoStudentProfile,
      frequent_mistake_causes: {
        classification_missing: 1,
      },
    },
  }),
  recognizedQuestion,
  knowledgeMapping,
  mistakeDiagnosis,
  memoryDelta: {
    ...memoryDelta,
    knowledge_mastery_changes: {},
    mistake_cause_changes: {
      classification_missing: -3,
    },
    review_priority_changes: [],
  },
  practiceQuestions,
  reviewPlan,
  sample,
});

assert.equal(
  negativeCauseResponse.student_profile.frequent_mistake_causes
    .classification_missing,
  0,
);

const originalFind = sampleDiagnoses.find;
sampleDiagnoses.find = () => undefined;

try {
  // Parser 仍通过 .some() 接受样例 ID，这里验证 pipeline 数据缺失时的 route 兜底。
  await assertDiagnoseError(
    postDiagnoseJson(createSampleRequest("sample_derivative_001")),
    400,
    "unknown_sample_question_id",
  );
} finally {
  sampleDiagnoses.find = originalFind;
}

console.log("agent pipeline regression test passed");

function createSampleRequest(sampleQuestionId, overrides = {}) {
  return {
    student_id: "demo_student_001",
    task_type: "sample_diagnosis",
    sample_question_id: sampleQuestionId,
    image_base64: null,
    student_profile: demoStudentProfile,
    mistake_history: [],
    ...overrides,
  };
}

async function postDiagnoseJson(body) {
  return POST(
    new Request("http://localhost/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function postDiagnoseRaw(body) {
  return POST(
    new Request("http://localhost/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
}

async function assertDiagnoseError(
  responsePromise,
  expectedStatus,
  expectedCode,
) {
  const response = await responsePromise;
  const responseBody = await response.json();

  assert.equal(response.status, expectedStatus);
  assert.equal(responseBody.error.code, expectedCode);
  assert.equal(responseBody.error.recoverable, true);
  assert.equal(responseBody.fallback_used, false);
}

function createImageRequest(overrides = {}) {
  return {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "iVBORw0KGgo=",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
    ...overrides,
  };
}

function createFakeVisionProvider() {
  return {
    async extractQuestionFromImage() {
      return {
        ok: true,
        value: {
          question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
          student_answer: "只得到 $x=\\sqrt a$。",
          student_solution_steps: ["求导", "遗漏分类讨论"],
          extraction_confidence: "high",
          warnings: [],
        },
      };
    },
  };
}

function createErrorVisionProvider(
  code,
  debugSummary = undefined,
  providerDebug = undefined,
) {
  return {
    async extractQuestionFromImage() {
      return {
        ok: false,
        error: {
          code,
          message: `fake ${code}`,
          recoverable: true,
          debug_summary: debugSummary,
          provider_debug: providerDebug,
        },
      };
    },
  };
}

function restoreEnvValue(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}

async function assertServiceError(
  serviceResultPromise,
  expectedStatus,
  expectedCode,
  expectedFallbackUsed,
) {
  const result = await serviceResultPromise;

  assert.equal(result.status, expectedStatus);
  assert.equal(result.body.error.code, expectedCode);
  assert.equal(result.body.error.recoverable, true);
  assert.equal(result.body.fallback_used, expectedFallbackUsed);
}
