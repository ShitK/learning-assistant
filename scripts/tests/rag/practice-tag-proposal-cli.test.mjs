import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = join(process.cwd(), "scripts/rag/build-practice-tag-proposals.mjs");
const tmpRoot = mkdtempSync(join(tmpdir(), "practice-tag-proposal-"));
const corpusPath = join(tmpRoot, "practice_corpus.json");
const outputDir = join(tmpRoot, "out");

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: null,
  item_count: 2,
  items: [
    {
      id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知函数在点处可导，求曲线切线斜率. A. 1 B. 2 C. 3 D. 4",
      search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数\n考点 1 导数的概念",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      difficulty: null,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
      review_meta: {},
    },
    {
      id: "practice-candidate-2",
      source_candidate_id: "candidate-2",
      question_text: "2. 如图，根据函数图像判断零点个数.",
      search_text: "2. 如图，根据函数图像判断零点个数.\n导数\n考点 4 导数与零点",
      knowledge_points: ["derivative"],
      section_title: "考点 4 导数与零点",
      difficulty: null,
      source_ref: { pdf_page_index: 4, section_title: "考点 4 导数与零点" },
      review_meta: { warnings: ["missing_visual_context"] },
    },
  ],
};

writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`);

{
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", corpusPath, "--out", outputDir], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("candidate_tag_proposals.json"), true);
  assert.equal(result.stdout.includes("Items: 2"), true);
  assert.equal(result.stdout.includes("Needs visual: 1"), true);
  assert.equal(result.stdout.includes("切线斜率"), false);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);

  const proposals = JSON.parse(readFileSync(join(outputDir, "candidate_tag_proposals.json"), "utf8"));
  const summary = JSON.parse(readFileSync(join(outputDir, "tag_proposal_summary.json"), "utf8"));
  assert.equal(proposals.proposal_version, "practice-tag-proposal-v0");
  assert.equal(proposals.proposals.length, 2);
  assert.equal(summary.item_count, 2);
  assert.equal(summary.needs_visual_items, 1);
}

{
  const defaultOutRoot = join(tmpRoot, "default-out-root");
  mkdirSync(defaultOutRoot);
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", corpusPath], {
    encoding: "utf8",
    cwd: defaultOutRoot,
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(
    readFileSync(
      join(defaultOutRoot, "artifacts/rag/tag-proposals/candidate_tag_proposals.json"),
      "utf8",
    ),
  );
  assert.equal(output.proposals.length, 2);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Usage:"), true);
  assert.equal(result.stdout.includes("local sensitive artifact"), true);
}

{
  const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--corpus requires a value"), true);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", join(tmpRoot, "missing.json")], {
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("practice corpus file not found"), true);
}

{
  const badJsonPath = join(tmpRoot, "bad.json");
  writeFileSync(badJsonPath, "{bad");
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", badJsonPath], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse practice corpus JSON"), true);
}

{
  const invalidPath = join(tmpRoot, "invalid.json");
  writeFileSync(invalidPath, JSON.stringify({ corpus_version: "practice-corpus-v0", items: "bad" }));
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", invalidPath], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("invalid practice corpus"), true);
  assert.equal(result.stderr.includes("切线斜率"), false);
}
