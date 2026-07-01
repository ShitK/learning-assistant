import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildVariantPracticeRetrievalEvalReport,
  truncateDebugText,
  validateEvalOutputDir,
  writeEvalReportFiles,
} from "../../rag/evaluate-variant-practice-retrieval-core.mjs";

const cases = [
  {
    id: "good_case",
    title: "good",
    request: { knowledge_points: ["derivative_monotonicity"] },
    expected: {
      min_items: 3,
      required_target_skills: ["monotonicity"],
      preferred_method_tags: ["monotonicity"],
      forbidden_internal_fields: ["score", "source_ref"],
    },
  },
  {
    id: "unsupported_non_derivative",
    title: "unsupported",
    request: { knowledge_points: ["sequence_recursion"] },
    expected: {
      min_items: 0,
      required_target_skills: [],
      preferred_method_tags: [],
      forbidden_internal_fields: ["score", "source_ref"],
    },
  },
];

const report = await buildVariantPracticeRetrievalEvalReport({
  cases,
  mode: "local_only",
  generatedAt: "2026-07-01T00:00:00.000Z",
  runCase: async (evalCase) => {
    if (evalCase.id === "unsupported_non_derivative") {
      return {
        retrieval_source: null,
        pgvector_attempted: false,
        candidate_count_before_agent: 0,
        candidate_count_after_approved_filter: 0,
        candidate_items_after_filter: [],
        selected_candidate_items: [],
        product_view_model: null,
      };
    }
    return {
      retrieval_source: "local_json",
      pgvector_attempted: false,
      candidate_count_before_agent: 4,
      candidate_count_after_approved_filter: 3,
      candidate_items_after_filter: [
        buildDebugItem("A", ["monotonicity"]),
        buildDebugItem("B", ["monotonicity"]),
        buildDebugItem("C", ["parameter_range"]),
      ],
      product_view_model: {
        items: [
          buildProductItem("foundation", "A"),
          buildProductItem("near_transfer", "B"),
          buildProductItem("additional_practice", "C"),
        ],
      },
      selected_candidate_items: [
        buildDebugItem("A", ["monotonicity"]),
        buildDebugItem("B", ["monotonicity"]),
        buildDebugItem("C", ["parameter_range"]),
      ],
    };
  },
});

assert.equal(report.eval_version, "variant-practice-retrieval-quality-v0");
assert.equal(report.case_count, 2);
assert.equal(report.summary.pass, 2);
assert.equal(report.summary.warn, 0);
assert.equal(report.summary.fail, 0);
assert.equal(report.summary.three_item_rate, 0.5);
assert.equal(report.summary.fallback_rate, 0);
assert.equal(report.cases[0].status, "pass");
assert.equal(report.cases[0].retrieval_source, "local_json");
assert.equal(report.cases[0].pgvector_attempted, false);
assert.equal(report.cases[0].display_source, "variant_practice_api");
assert.equal(report.cases[0].metrics.required_target_skill_matches, 2);
assert.equal(report.cases[1].status, "pass");
assert.equal(report.cases[1].retrieval_source, null);
assert.equal(report.cases[1].pgvector_attempted, false);
assert.equal(report.cases[1].display_source, "diagnosis_practice_questions");

assert.equal(Array.from(truncateDebugText("abcdef", 3)).join(""), "abc");
assert.equal(truncateDebugText("短文本", 200), "短文本");

assert.equal(validateEvalOutputDir(join("artifacts", "rag", "evals", "x")).ok, true);
assert.equal(validateEvalOutputDir("src/generated").ok, false);
assert.equal(validateEvalOutputDir("public/evals").ok, false);

const outputDir = mkdtempSync(join(tmpdir(), "variant-practice-eval-"));
const writeResult = await writeEvalReportFiles({
  report,
  outputDir,
  writeLatest: true,
});
assert.equal(existsSync(writeResult.timestampPath), true);
assert.equal(existsSync(join(outputDir, "latest.json")), true);
assert.equal(
  JSON.parse(readFileSync(join(outputDir, "latest.json"), "utf8")).case_count,
  2,
);

console.log("evaluate variant practice retrieval core tests passed");

function buildProductItem(type, suffix) {
  return {
    rank: suffix.charCodeAt(0) - 64,
    type,
    title: `题目 ${suffix}`,
    question_text: `题目 ${suffix}`,
    reason: "练习理由",
  };
}

function buildDebugItem(id, targetSkills) {
  return {
    id,
    knowledge_points: ["derivative"],
    section_title: "考点 2 导数与函数的单调性",
    target_skills: targetSkills,
    method_tags: targetSkills,
    question_text: `debug ${id}`,
  };
}
