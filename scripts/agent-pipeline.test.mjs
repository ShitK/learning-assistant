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

const request = {
  student_id: "demo_student_001",
  task_type: "sample_diagnosis",
  sample_question_id: "sample_derivative_001",
  image_base64: null,
  student_profile: demoStudentProfile,
  mistake_history: [],
};

const sample = sampleDiagnoses.find(
  (item) => item.id === request.sample_question_id,
);

assert.ok(sample, "sample fixture should exist");

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
assert.equal(pipelineResponse.diagnosis_id, "diag_sample_derivative_001");
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

const originalFind = sampleDiagnoses.find;
sampleDiagnoses.find = () => undefined;

try {
  const response = await POST(
    new Request("http://localhost/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    }),
  );
  const responseBody = await response.json();

  assert.equal(response.status, 400);
  assert.equal(responseBody.error.code, "unknown_sample_question_id");
  assert.equal(responseBody.error.recoverable, true);
} finally {
  sampleDiagnoses.find = originalFind;
}

console.log("agent pipeline smoke test passed");
