import assert from "node:assert/strict";
import { validateVariantPracticeEvalReport } from "../../rag/variant-practice-eval-report-schema.mjs";

const validReport = {
  eval_version: "variant-practice-retrieval-quality-v0",
  generated_at: "2026-07-01T00:00:00.000Z",
  mode: "local_only",
  corpus_version: "enriched-practice-corpus-v0",
  case_count: 1,
  summary: {
    pass: 1,
    warn: 0,
    fail: 0,
    three_item_rate: 1,
    fallback_rate: 0,
  },
  cases: [
    {
      case_id: "upload_derivative_monotonicity",
      status: "pass",
      retrieval_source: "local_json",
      display_source: "variant_practice_api",
      pgvector_attempted: false,
      candidate_count: 12,
      product_item_count: 3,
      metrics: {
        required_target_skill_matches: 2,
        unique_item_count: 3,
        recommendation_type_coverage: ["foundation", "near_transfer", "additional_practice"],
      },
      findings: [],
    },
  ],
};

assert.equal(validateVariantPracticeEvalReport(validReport).ok, true);

const invalidReport = {
  ...validReport,
  mode: "pgvector",
};
const invalidResult = validateVariantPracticeEvalReport(invalidReport);
assert.equal(invalidResult.ok, false);
assert.equal(invalidResult.errors.some((error) => error.includes("mode")), true);

const invalidSource = structuredClone(validReport);
invalidSource.cases[0].retrieval_source = "fallback_practice_questions";
const invalidSourceResult = validateVariantPracticeEvalReport(invalidSource);
assert.equal(invalidSourceResult.ok, false);
assert.equal(
  invalidSourceResult.errors.some((error) => error.includes("retrieval_source")),
  true,
);

const invalidMetrics = structuredClone(validReport);
invalidMetrics.cases[0].metrics = {
  required_target_skill_matches: "2",
  unique_item_count: 3,
  recommendation_type_coverage: ["foundation"],
};
const invalidMetricsResult = validateVariantPracticeEvalReport(invalidMetrics);
assert.equal(invalidMetricsResult.ok, false);
assert.equal(
  invalidMetricsResult.errors.some((error) =>
    error.includes("cases[0].metrics.required_target_skill_matches"),
  ),
  true,
);

const invalidCoverage = structuredClone(validReport);
invalidCoverage.cases[0].metrics = {
  required_target_skill_matches: 2,
  unique_item_count: 3,
  recommendation_type_coverage: ["foundation", 1],
};
const invalidCoverageResult = validateVariantPracticeEvalReport(invalidCoverage);
assert.equal(invalidCoverageResult.ok, false);
assert.equal(
  invalidCoverageResult.errors.some((error) =>
    error.includes("cases[0].metrics.recommendation_type_coverage"),
  ),
  true,
);

const invalidUniqueItemCount = structuredClone(validReport);
invalidUniqueItemCount.cases[0].metrics = {
  required_target_skill_matches: 2,
  unique_item_count: "3",
  recommendation_type_coverage: ["foundation"],
};
const invalidUniqueItemCountResult = validateVariantPracticeEvalReport(invalidUniqueItemCount);
assert.equal(invalidUniqueItemCountResult.ok, false);
assert.equal(
  invalidUniqueItemCountResult.errors.some((error) =>
    error.includes("cases[0].metrics.unique_item_count"),
  ),
  true,
);

const mismatchedCaseCount = structuredClone(validReport);
mismatchedCaseCount.case_count = 2;
const mismatchedCaseCountResult = validateVariantPracticeEvalReport(mismatchedCaseCount);
assert.equal(mismatchedCaseCountResult.ok, false);
assert.equal(
  mismatchedCaseCountResult.errors.some((error) => error.includes("case_count")),
  true,
);

console.log("variant practice eval report schema tests passed");
