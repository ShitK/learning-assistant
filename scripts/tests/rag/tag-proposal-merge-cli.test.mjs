import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = join(process.cwd(), "scripts/rag/merge-tag-proposals.mjs");
const tmpRoot = mkdtempSync(join(tmpdir(), "tag-proposal-merge-cli-"));
const corpusPath = join(tmpRoot, "practice_corpus.json");
const rulesPath = join(tmpRoot, "candidate_tag_proposals.json");
const aiPath = join(tmpRoot, "candidate_ai_tag_proposals.json");
const outputDir = join(tmpRoot, "out");
const secretValue = "local-secret-for-test";
const secretName = "RAG_TAG_PROVIDER_API_KEY";
const fixtureQuestionText = "CLI fixture question must stay out of stdout";

writeJson(corpusPath, {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-24T00:00:00.000Z",
  item_count: 1,
  items: [
    {
      id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: fixtureQuestionText,
      search_text: fixtureQuestionText,
      knowledge_points: ["derivative"],
      source_ref: null,
      review_meta: {},
    },
  ],
});

writeJson(rulesPath, {
  proposal_version: "practice-tag-proposal-v0",
  generated_at: "2026-06-24T00:00:00.000Z",
  source_corpus_file: corpusPath,
  source_corpus_version: "practice-corpus-v0",
  item_count: 1,
  proposals: [
    {
      item_id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      source_ref: null,
      proposed_tags: {
        target_skills: [tag("tangent_slope", "rule")],
        method_tags: [tag("tangent_slope", "rule")],
        feature_flags: [],
      },
      warnings: [],
    },
  ],
});

writeJson(aiPath, {
  proposal_version: "practice-ai-tag-proposal-v0",
  generated_at: "2026-06-24T00:00:00.000Z",
  source_corpus_file: corpusPath,
  source_rule_proposal_file: rulesPath,
  source_corpus_version: "practice-corpus-v0",
  source_rule_proposal_version: "practice-tag-proposal-v0",
  taxonomy_id: "math_derivative_v0",
  provider_meta: {
    provider_name: "fake",
    model: "fake-model",
  },
  item_count: 1,
  proposals: [
    {
      item_id: "practice-candidate-1",
      taxonomy_id: "math_derivative_v0",
      source_candidate_id: "candidate-1",
      source_ref: null,
      proposed_tags: {
        target_skills: [tag("tangent_slope", "llm")],
        method_tags: [tag("tangent_slope", "llm")],
        feature_flags: [],
      },
      item_confidence: "high",
      warnings: [],
    },
  ],
});

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--rules", rulesPath, "--ai", aiPath, "--out", outputDir],
    { encoding: "utf8", env: { ...process.env, [secretName]: secretValue } },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(outputDir, "merged_tag_proposals.json")), true);
  assert.equal(existsSync(join(outputDir, "auto_tag_review_records.json")), true);
  assert.equal(existsSync(join(outputDir, "tag_review_queue.json")), true);
  assert.equal(existsSync(join(outputDir, "tag_review_summary.json")), true);
  assert.equal(result.stdout.includes("Items: 1"), true);
  assert.equal(result.stdout.includes("Auto approved: 1"), true);
  assert.equal(result.stdout.includes("Needs review: 0"), true);
  assert.equal(result.stdout.includes("Needs visual: 0"), true);
  assert.equal(result.stdout.includes("Conflict items: 0"), true);
  assert.equal(result.stdout.includes("merged_tag_proposals.json"), true);
  assert.equal(result.stdout.includes(fixtureQuestionText), false);
  assert.equal(result.stdout.includes("prompt"), false);
  assert.equal(result.stdout.includes("raw response"), false);
  assert.equal(result.stdout.includes(secretName), false);
  assert.equal(result.stdout.includes(secretValue), false);

  const records = JSON.parse(readFileSync(join(outputDir, "auto_tag_review_records.json"), "utf8"));
  const queue = JSON.parse(readFileSync(join(outputDir, "tag_review_queue.json"), "utf8"));
  const summary = JSON.parse(readFileSync(join(outputDir, "tag_review_summary.json"), "utf8"));
  assert.equal(records.length, 1);
  assert.equal(queue.length, 0);
  assert.equal(summary.auto_approved_items, 1);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", corpusPath, "--rules", rulesPath, "--ai", aiPath], {
    cwd: tmpRoot,
    encoding: "utf8",
  });
  const defaultOutputDir = join(tmpRoot, "artifacts/rag/tag-review");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(defaultOutputDir, "merged_tag_proposals.json")), true);
  assert.equal(existsSync(join(defaultOutputDir, "auto_tag_review_records.json")), true);
  assert.equal(existsSync(join(defaultOutputDir, "tag_review_queue.json")), true);
  assert.equal(existsSync(join(defaultOutputDir, "tag_review_summary.json")), true);
}

{
  const badJsonPath = join(tmpRoot, "bad-ai.json");
  writeFileSync(badJsonPath, "{bad");
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--rules", rulesPath, "--ai", badJsonPath, "--out", outputDir],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse AI tag proposal JSON"), true);
  assert.equal(result.stderr.includes(fixtureQuestionText), false);
}

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--rules", rulesPath, "--out", outputDir],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--ai requires a value"), true);
}

console.log("tag proposal merge cli tests passed");

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function tag(tagKey, source) {
  return {
    tag: tagKey,
    display_name: tagKey,
    confidence: "high",
    evidence_terms: [tagKey],
    source,
  };
}
