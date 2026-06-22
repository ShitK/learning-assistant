import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = join(process.cwd(), "scripts/rag/build-enriched-practice-corpus.mjs");
const tmpRoot = mkdtempSync(join(tmpdir(), "enriched-practice-corpus-"));
const corpusPath = join(tmpRoot, "practice_corpus.json");
const proposalPath = join(tmpRoot, "candidate_tag_proposals.json");
const reviewPath = join(tmpRoot, "tag_review.json");
const outputDir = join(tmpRoot, "out");

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: null,
  item_count: 1,
  items: [
    {
      id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知函数在点处可导，求曲线切线斜率.",
      search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      difficulty: null,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
      review_meta: {},
    },
  ],
};

const proposals = {
  proposal_version: "practice-tag-proposal-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_corpus_file: "practice_corpus.json",
  source_corpus_version: "practice-corpus-v0",
  item_count: 1,
  proposals: [
    {
      item_id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      source_ref: corpus.items[0].source_ref,
      proposed_tags: {
        target_skills: [{ tag: "tangent_slope", confidence: "high", evidence_terms: ["切线"], source: "rule" }],
        method_tags: [{ tag: "tangent_slope", confidence: "high", evidence_terms: ["切线"], source: "rule" }],
        feature_flags: [],
      },
      warnings: [],
    },
  ],
};

const reviewRecords = [
  {
    item_id: "practice-candidate-1",
    review_status: "approved",
    reviewed_tags: {
      target_skills: ["tangent_slope", "derivative_definition_limit"],
      method_tags: ["tangent_slope", "derivative_definition"],
      feature_flags: ["has_choice_options"],
    },
    review_notes: "",
    has_manual_tag_correction: true,
    tag_source: "human",
  },
];

writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`);
writeFileSync(proposalPath, `${JSON.stringify(proposals, null, 2)}\n`);
writeFileSync(reviewPath, `${JSON.stringify(reviewRecords, null, 2)}\n`);

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--proposals", proposalPath, "--review", reviewPath, "--out", outputDir],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("enriched_practice_corpus.json"), true);
  assert.equal(result.stdout.includes("Items: 1"), true);
  assert.equal(result.stdout.includes("Approved: 1"), true);
  assert.equal(result.stdout.includes("切线斜率"), false);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);

  const enriched = JSON.parse(readFileSync(join(outputDir, "enriched_practice_corpus.json"), "utf8"));
  const summary = JSON.parse(readFileSync(join(outputDir, "enrichment_summary.json"), "utf8"));
  assert.equal(enriched.corpus_version, "enriched-practice-corpus-v0");
  assert.deepEqual(enriched.items[0].target_skills, ["tangent_slope", "derivative_definition_limit"]);
  assert.equal(enriched.items[0].tag_review_meta.tag_source, "human");
  assert.equal(summary.approved_items, 1);
}

{
  const defaultOutRoot = join(tmpRoot, "default-out-root");
  mkdirSync(defaultOutRoot);
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--proposals", proposalPath, "--accept-rule-proposals"],
    { encoding: "utf8", cwd: defaultOutRoot },
  );

  assert.equal(result.status, 0, result.stderr);
  const enriched = JSON.parse(
    readFileSync(
      join(defaultOutRoot, "artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json"),
      "utf8",
    ),
  );
  assert.equal(enriched.items[0].tag_review_meta.review_status, "approved");
}

{
  const draftOut = join(tmpRoot, "draft-out");
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--proposals", proposalPath, "--out", draftOut],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const enriched = JSON.parse(readFileSync(join(draftOut, "enriched_practice_corpus.json"), "utf8"));
  assert.equal(enriched.items[0].tag_review_meta.review_status, "proposed");
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Usage:"), true);
  assert.equal(result.stdout.includes("local sensitive artifact"), true);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", corpusPath], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--proposals requires a value"), true);
}

{
  const badProposalPath = join(tmpRoot, "bad-proposal.json");
  writeFileSync(badProposalPath, "{bad");
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--proposals", badProposalPath],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse tag proposal JSON"), true);
}

console.log("enriched practice corpus cli tests passed");
