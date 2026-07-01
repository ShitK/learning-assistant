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
        mistake_cause_alignment_matches: 2,
        unique_item_count: 3,
        recommendation_type_coverage: ["foundation", "near_transfer", "additional_practice"],
        off_topic_count: 0,
      },
      findings: [
        {
          severity: "fail",
          reason: "low_evidence_claim",
          message: "低证据展示文案包含具体学生错因断言：遗漏边界。",
        },
      ],
      debug: {
        candidate_count_after_approved_filter: 3,
        question_text_preview: "已知函数 f(x)=ln x-ax，讨论函数单调区间。",
        candidate_items_after_filter: [
          {
            id: "item-a",
            source_candidate_id: "candidate-a",
            knowledge_points: ["derivative"],
            section_title: "考点 2 导数与函数的单调性",
            target_skills: ["monotonicity"],
            method_tags: ["monotonicity"],
          },
        ],
        selected_candidate_items: [
          {
            id: "item-a",
            source_candidate_id: "candidate-a",
            knowledge_points: ["derivative"],
            section_title: "考点 2 导数与函数的单调性",
            target_skills: ["monotonicity"],
            method_tags: ["monotonicity"],
          },
        ],
      },
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
  mistake_cause_alignment_matches: 2,
  unique_item_count: 3,
  recommendation_type_coverage: ["foundation"],
  off_topic_count: 0,
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
  mistake_cause_alignment_matches: 2,
  unique_item_count: 3,
  recommendation_type_coverage: ["foundation", 1],
  off_topic_count: 0,
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
  mistake_cause_alignment_matches: 2,
  unique_item_count: "3",
  recommendation_type_coverage: ["foundation"],
  off_topic_count: 0,
};
const invalidUniqueItemCountResult = validateVariantPracticeEvalReport(invalidUniqueItemCount);
assert.equal(invalidUniqueItemCountResult.ok, false);
assert.equal(
  invalidUniqueItemCountResult.errors.some((error) =>
    error.includes("cases[0].metrics.unique_item_count"),
  ),
  true,
);

const invalidMistakeCauseAlignment = structuredClone(validReport);
invalidMistakeCauseAlignment.cases[0].metrics.mistake_cause_alignment_matches = "2";
const invalidMistakeCauseAlignmentResult = validateVariantPracticeEvalReport(
  invalidMistakeCauseAlignment,
);
assert.equal(invalidMistakeCauseAlignmentResult.ok, false);
assert.equal(
  invalidMistakeCauseAlignmentResult.errors.some((error) =>
    error.includes("cases[0].metrics.mistake_cause_alignment_matches"),
  ),
  true,
);

const invalidOffTopicCount = structuredClone(validReport);
invalidOffTopicCount.cases[0].metrics.off_topic_count = "0";
const invalidOffTopicCountResult = validateVariantPracticeEvalReport(invalidOffTopicCount);
assert.equal(invalidOffTopicCountResult.ok, false);
assert.equal(
  invalidOffTopicCountResult.errors.some((error) =>
    error.includes("cases[0].metrics.off_topic_count"),
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

const invalidDebug = structuredClone(validReport);
invalidDebug.cases[0].debug.selected_candidate_items[0].question_text = "不应进入 debug 明细";
invalidDebug.cases[0].debug.selected_candidate_items[0].score = 0.9;
const invalidDebugResult = validateVariantPracticeEvalReport(invalidDebug);
assert.equal(invalidDebugResult.ok, false);
assert.equal(
  invalidDebugResult.errors.some((error) =>
    error.includes("cases[0].debug.selected_candidate_items[0].question_text"),
  ),
  true,
);
assert.equal(
  invalidDebugResult.errors.some((error) =>
    error.includes("cases[0].debug.selected_candidate_items[0].score"),
  ),
  true,
);

const normalizedLowMetadataDebug = structuredClone(validReport);
normalizedLowMetadataDebug.cases[0].debug.candidate_items_after_filter[0] = {
  id: "item-low-metadata",
  source_candidate_id: "candidate-low-metadata",
  knowledge_points: [],
  section_title: null,
  target_skills: [],
  method_tags: [],
};
normalizedLowMetadataDebug.cases[0].debug.selected_candidate_items[0] = {
  id: "item-low-metadata",
  source_candidate_id: "candidate-low-metadata",
  knowledge_points: [],
  section_title: null,
  target_skills: [],
  method_tags: [],
};
assert.equal(validateVariantPracticeEvalReport(normalizedLowMetadataDebug).ok, true);

const invalidDebugCandidate = structuredClone(validReport);
invalidDebugCandidate.cases[0].debug.candidate_items_after_filter[0].knowledge_points = [
  "derivative",
  1,
];
const invalidDebugCandidateResult = validateVariantPracticeEvalReport(invalidDebugCandidate);
assert.equal(invalidDebugCandidateResult.ok, false);
assert.equal(
  invalidDebugCandidateResult.errors.some((error) =>
    error.includes("cases[0].debug.candidate_items_after_filter[0].knowledge_points"),
  ),
  true,
);

console.log("variant practice eval report schema tests passed");
