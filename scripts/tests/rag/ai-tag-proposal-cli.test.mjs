import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = join(process.cwd(), "scripts/rag/build-ai-tag-proposals.mjs");
const tmpRoot = mkdtempSync(join(tmpdir(), "ai-tag-proposal-cli-"));
const corpusPath = join(tmpRoot, "practice_corpus.json");
const rulesPath = join(tmpRoot, "candidate_tag_proposals.json");
const outputDir = join(tmpRoot, "out");

writeFileSync(
  corpusPath,
  `${JSON.stringify(
    {
      corpus_version: "practice-corpus-v0",
      generated_at: "2026-06-24T00:00:00.000Z",
      source_seed_file: "synthetic-seed.json",
      source_seed_exported_at: null,
      item_count: 1,
      items: [
        {
          id: "practice-candidate-1",
          source_candidate_id: "candidate-1",
          question_text: "1. 求切线斜率. A. 1 B. 2",
          search_text: "导数\n切线斜率",
          knowledge_points: ["derivative"],
          section_title: "考点 1 导数的概念",
          difficulty: null,
          source_ref: null,
          review_meta: {},
        },
      ],
    },
    null,
    2,
  )}\n`,
);

writeFileSync(
  rulesPath,
  `${JSON.stringify(
    {
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
            target_skills: [
              {
                tag: "tangent_slope",
                display_name: "切线斜率",
                confidence: "high",
                evidence_terms: ["切线", "斜率"],
                source: "rule",
              },
            ],
            method_tags: [],
            feature_flags: [],
          },
          warnings: [],
        },
      ],
    },
    null,
    2,
  )}\n`,
);

const fakeProviderEnv = {
  ...process.env,
  RAG_TAG_PROVIDER_BASE_URL: "http://127.0.0.1/fake",
  RAG_TAG_PROVIDER_MODEL: "fake-model",
  RAG_TAG_PROVIDER_API_KEY: "local-secret",
  MATHTRACE_FAKE_RAG_TAG_RESPONSE: JSON.stringify({
    target_skills: [
      {
        tag: "tangent_slope",
        confidence: "high",
        evidence_terms: ["切线", "斜率"],
        rationale: "synthetic",
      },
    ],
    method_tags: [],
    feature_flags: [
      {
        tag: "has_choice_options",
        confidence: "medium",
        evidence_terms: ["A.", "B."],
        rationale: "synthetic",
      },
    ],
    item_confidence: "high",
  }),
};

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--rules", rulesPath, "--out", outputDir],
    { encoding: "utf8", env: fakeProviderEnv },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("candidate_ai_tag_proposals.json"), true);
  assert.equal(result.stdout.includes("Items: 1"), true);
  assert.equal(result.stdout.includes("High confidence: 1"), true);
  assert.equal(result.stdout.includes("local-secret"), false);
  assert.equal(result.stdout.includes("RAG_TAG_PROVIDER_API_KEY"), false);
  assert.equal(result.stdout.includes("求切线斜率"), false);
  assert.equal(result.stdout.includes("synthetic"), false);

  const artifact = JSON.parse(readFileSync(join(outputDir, "candidate_ai_tag_proposals.json"), "utf8"));
  const summary = JSON.parse(readFileSync(join(outputDir, "ai_tag_proposal_summary.json"), "utf8"));
  assert.equal(artifact.proposal_version, "practice-ai-tag-proposal-v0");
  assert.equal(artifact.proposals[0].proposed_tags.target_skills[0].tag, "tangent_slope");
  assert.equal(artifact.proposals[0].proposed_tags.feature_flags[0].tag, "has_choice_options");
  assert.equal(artifact.provider_meta.model, "fake-model");
  assert.equal("api_key" in artifact.provider_meta, false);
  assert.equal(summary.item_count, 1);
}

{
  const defaultOutRoot = join(tmpRoot, "default-out-root");
  mkdirSync(defaultOutRoot);
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", corpusPath, "--rules", rulesPath], {
    encoding: "utf8",
    env: fakeProviderEnv,
    cwd: defaultOutRoot,
  });

  assert.equal(result.status, 0, result.stderr);
  const artifact = JSON.parse(
    readFileSync(
      join(defaultOutRoot, "artifacts/rag/ai-tag-proposals/candidate_ai_tag_proposals.json"),
      "utf8",
    ),
  );
  assert.equal(artifact.proposals.length, 1);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Usage:"), true);
  assert.equal(result.stdout.includes("--rules"), true);
  assert.equal(result.stdout.includes("RAG_TAG_PROVIDER_API_KEY"), false);
  assert.equal(result.stdout.includes(".env"), false);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", corpusPath, "--rules", rulesPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      RAG_TAG_PROVIDER_BASE_URL: "",
      RAG_TAG_PROVIDER_MODEL: "",
      RAG_TAG_PROVIDER_API_KEY: "",
      MATHTRACE_FAKE_RAG_TAG_RESPONSE: "",
    },
  });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("RAG tag provider is not configured"), true);
  assert.equal(result.stderr.includes("RAG_TAG_PROVIDER_API_KEY"), false);
}

console.log("ai tag proposal cli tests passed");
