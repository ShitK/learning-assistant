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
} = jiti("../src/lib/mathtrace-agent-pipeline.ts");
const { POST } = jiti("../src/app/api/diagnose/route.ts");

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
    ...createSampleRequest("sample_derivative_001"),
    task_type: "image_diagnosis",
    sample_question_id: null,
  }),
  400,
  "image_diagnosis_p1",
);

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
