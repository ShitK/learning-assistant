import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { trustedDiagnosisCases } from "./fixtures/eval/p15-trusted-diagnosis-cases.mjs";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { demoStudentProfile, sampleDiagnoses } = jiti(
  "../src/data/mathtrace-demo.ts",
);
const { runImageMathTraceAgent } = jiti(
  "../src/lib/image-diagnosis/image-diagnosis-pipeline.ts",
);
const { runMathTraceAgent } = jiti("../src/lib/diagnosis/mathtrace-agent-pipeline.ts");
const { parseVisionExtractionText } = jiti(
  "../src/lib/image-diagnosis/vision-extraction-parser.ts",
);

const request = {
  student_id: "demo_student_001",
  student_profile: demoStudentProfile,
  mistake_history: [],
};

for (const item of trustedDiagnosisCases) {
  const response = runImageMathTraceAgent({
    request,
    extraction: item.extraction,
    is_extraction_confirmed: true,
    confirmation_action: item.action,
    follow_up_answer: item.follow_up_answer,
  });

  assert.equal(response.evidence_level, item.expected.evidence_level, item.id);
  assert.equal(
    response.persistence_evidence,
    item.expected.persistence_evidence,
    item.id,
  );
  assert.equal(
    response.profile_update_kind,
    item.expected.profile_update_kind,
    item.id,
  );
  assert.equal(
    response.memory_delta.should_persist,
    item.expected.should_persist,
    item.id,
  );
  assert.equal(
    Object.keys(response.memory_delta.mistake_cause_changes).length > 0,
    item.expected.writes_mistake_cause,
    item.id,
  );

  if (item.expected.mastery_change_per_knowledge_point !== null) {
    for (const knowledgeId of response.knowledge_mapping.knowledge_points) {
      assert.equal(
        response.memory_delta.knowledge_mastery_changes[knowledgeId],
        item.expected.mastery_change_per_knowledge_point,
        item.id,
      );
    }
  }
}

const forbiddenModelOutput = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "学生答案",
    student_solution_steps: ["步骤"],
    standard_solution_draft: "标准解法",
    extraction_confidence: "high",
    warnings: [],
    memory_delta: {
      mistake_cause_changes: {
        classification_missing: 1,
      },
    },
  }),
);

assert.equal(forbiddenModelOutput.ok, false);
assert.equal(
  forbiddenModelOutput.error.message,
  "模型输出包含不允许由模型写入的画像字段。",
);

for (const sample of sampleDiagnoses) {
  const response = runMathTraceAgent({
    student_id: "demo_student_001",
    task_type: "sample_diagnosis",
    sample_question_id: sample.id,
    image_base64: null,
    student_profile: demoStudentProfile,
    mistake_history: [],
  });

  assert.equal(response.source, "sample", sample.id);
  assert.equal(response.fallback_used, false, sample.id);
  assert.equal(response.practice_questions.length, 3, sample.id);
  assert.equal(response.review_plan.seven_days.length, 7, sample.id);
}

console.log("eval harness test passed");
