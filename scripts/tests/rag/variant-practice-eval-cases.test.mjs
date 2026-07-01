import assert from "node:assert/strict";
import { variantPracticeEvalCases } from "../../fixtures/rag/variant-practice-eval-cases.mjs";

assert.equal(variantPracticeEvalCases.length >= 4, true);

const ids = variantPracticeEvalCases.map((item) => item.id);
assert.equal(new Set(ids).size, ids.length);
assert.equal(ids.includes("sample_derivative_parameter_classification"), true);
assert.equal(ids.includes("upload_derivative_monotonicity"), true);
assert.equal(ids.includes("upload_tangent_slope"), true);
assert.equal(ids.includes("upload_problem_only_low_evidence"), true);
assert.equal(ids.includes("upload_extrema_or_maximum"), true);
assert.equal(ids.includes("unsupported_non_derivative"), true);

for (const evalCase of variantPracticeEvalCases) {
  assert.equal(typeof evalCase.id, "string");
  assert.equal(typeof evalCase.title, "string");
  assert.equal(evalCase.request.student_id, "demo_student_001");
  assert.equal(evalCase.request.request_source, "confirmed_image_diagnosis");
  assert.equal(typeof evalCase.request.question_text, "string");
  assert.equal(evalCase.request.question_text.length > 0, true);
  assert.equal(Array.isArray(evalCase.request.knowledge_points), true);
  assert.equal(Array.isArray(evalCase.request.mistake_causes), true);
  assert.equal([0, 3].includes(evalCase.expected.min_items), true);
  assert.equal(Array.isArray(evalCase.expected.required_target_skills), true);
  assert.equal(Array.isArray(evalCase.expected.preferred_method_tags), true);
  assert.deepEqual(evalCase.expected.forbidden_internal_fields, [
    "retrieval_source",
    "score",
    "item_id",
    "source_ref",
    "cosine_distance",
    "embedding_hash",
  ]);
}

const unsupported = variantPracticeEvalCases.find(
  (evalCase) => evalCase.id === "unsupported_non_derivative",
);
assert.ok(unsupported);
assert.equal(unsupported.expected.min_items, 0);
assert.deepEqual(unsupported.expected.required_target_skills, []);
assert.equal(
  unsupported.request.knowledge_points.some((point) =>
    ["derivative_monotonicity", "parameter_classification"].includes(point),
  ),
  false,
);

const tangentSlope = variantPracticeEvalCases.find(
  (evalCase) => evalCase.id === "upload_tangent_slope",
);
assert.ok(tangentSlope);
assert.deepEqual(tangentSlope.expected.required_target_skills, [
  "tangent_slope",
  "derivative_geometric_meaning",
]);
assert.deepEqual(tangentSlope.expected.preferred_method_tags, [
  "tangent_slope",
  "derivative_geometric_meaning",
]);

const lowEvidence = variantPracticeEvalCases.find(
  (evalCase) => evalCase.id === "upload_problem_only_low_evidence",
);
assert.ok(lowEvidence);
assert.equal(lowEvidence.request.evidence_level, "problem_only");
assert.deepEqual(lowEvidence.expected.forbidden_claim_terms, [
  "遗漏",
  "忽略",
  "错因",
  "错误",
  "混淆",
  "不会",
  "没有完整分析",
]);

console.log("variant practice eval cases tests passed");
