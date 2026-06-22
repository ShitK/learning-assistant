import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = join(process.cwd(), "scripts/rag/recommend-variant-practice.mjs");
const tmpRoot = mkdtempSync(join(tmpdir(), "variant-practice-agent-"));
const corpusPath = join(tmpRoot, "practice_corpus.json");
const queryPath = join(tmpRoot, "query.json");
const outputDir = join(tmpRoot, "out");

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-22T10:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: "2026-06-22T09:00:00.000Z",
  item_count: 4,
  items: [
    {
      id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知函数在点处可导，求曲线切线斜率.",
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
      question_text: "2. 结合切线斜率判断函数单调递增，求参数范围.",
      search_text:
        "2. 结合切线斜率判断函数单调递增，求参数范围.\n导数\n考点 2 导数与函数的单调性",
      knowledge_points: ["derivative"],
      section_title: "考点 2 导数与函数的单调性",
      difficulty: null,
      source_ref: { pdf_page_index: 2, section_title: "考点 2 导数与函数的单调性" },
      review_meta: {},
    },
    {
      id: "practice-candidate-3",
      source_candidate_id: "candidate-3",
      question_text: "3. 已知函数单调递增，求参数范围.",
      search_text: "3. 已知函数单调递增，求参数范围.\n考点 2 函数的单调性",
      knowledge_points: ["derivative"],
      section_title: "考点 2 函数的单调性",
      difficulty: null,
      source_ref: { pdf_page_index: 3, section_title: "考点 2 函数的单调性" },
      review_meta: {},
    },
    {
      id: "practice-candidate-4",
      source_candidate_id: "candidate-4",
      question_text: "4. 三角函数求值.",
      search_text: "4. 三角函数求值.\n三角函数",
      knowledge_points: ["trigonometry"],
      section_title: "三角函数",
      difficulty: null,
      source_ref: { pdf_page_index: 4, section_title: "三角函数" },
      review_meta: {},
    },
  ],
};

const query = {
  id: "demo-query",
  question_text: "设函数在点处可导，求切线斜率.",
  knowledge_points: ["derivative"],
  section_title: "考点 1 导数的概念",
  mistake_causes: ["derivative_definition_confusion"],
  target_skills: ["导数几何意义", "切线斜率"],
};

writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`);
writeFileSync(queryPath, `${JSON.stringify(query, null, 2)}\n`);

{
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--corpus",
      corpusPath,
      "--query",
      queryPath,
      "--out",
      outputDir,
      "--limit",
      "4",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("recommendations.json"), true);
  assert.equal(result.stdout.includes("Recommendations: 3"), true);
  assert.equal(result.stdout.includes("切线斜率"), false);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);

  const output = JSON.parse(readFileSync(join(outputDir, "recommendations.json"), "utf8"));
  assert.equal(output.agent_version, "variant-practice-agent-v0");
  assert.equal(output.recommendations.length, 3);
  assert.deepEqual(
    output.recommendations.map((recommendation) => recommendation.recommendation_type),
    ["foundation", "near_transfer", "mixed_application"],
  );
  assert.equal("review_meta" in output.recommendations[0], false);
}

{
  const defaultOutRoot = join(tmpRoot, "default-out-root");
  mkdirSync(defaultOutRoot);
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", corpusPath, "--query", queryPath], {
    encoding: "utf8",
    cwd: defaultOutRoot,
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(
    readFileSync(
      join(defaultOutRoot, "artifacts/rag/variant-practice-agent/recommendations.json"),
      "utf8",
    ),
  );
  assert.equal(output.recommendations.length, 3);
}

{
  const enrichedCorpusPath = join(tmpRoot, "enriched_practice_corpus.json");
  const enrichedOut = join(tmpRoot, "enriched-agent-out");
  const enrichedCorpus = {
    ...corpus,
    corpus_version: "enriched-practice-corpus-v0",
    source_corpus_file: "practice_corpus.json",
    source_tag_proposal_file: "candidate_tag_proposals.json",
    items: corpus.items.slice(0, 3).map((item, index) => ({
      ...item,
      target_skills: index === 2 ? ["monotonicity"] : ["tangent_slope"],
      method_tags:
        index === 2
          ? ["derivative_definition", "monotonicity_by_derivative"]
          : ["tangent_slope", "derivative_definition"],
      feature_flags: [],
      tag_review_meta: {
        review_status: "approved",
        proposal_confidence: "high",
        has_manual_tag_correction: false,
        tag_source: "rule",
      },
    })),
  };
  writeFileSync(enrichedCorpusPath, `${JSON.stringify(enrichedCorpus, null, 2)}\n`);

  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", enrichedCorpusPath, "--query", queryPath, "--out", enrichedOut, "--limit", "4"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("Recommendations: 3"), true);
  for (const item of enrichedCorpus.items) {
    assert.equal(result.stdout.includes(item.question_text), false);
  }
  assert.equal(result.stdout.includes(query.question_text), false);
  const output = JSON.parse(readFileSync(join(enrichedOut, "recommendations.json"), "utf8"));
  assert.equal(output.search_summary.corpus_version, "enriched-practice-corpus-v0");
  assert.deepEqual(
    output.recommendations.map((recommendation) => recommendation.recommendation_type),
    ["foundation", "near_transfer", "mixed_application"],
  );
}

{
  const invalidLimitOut = join(tmpRoot, "invalid-limit-out");
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--corpus",
      corpusPath,
      "--query",
      queryPath,
      "--out",
      invalidLimitOut,
      "--limit",
      "0",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(readFileSync(join(invalidLimitOut, "recommendations.json"), "utf8"));
  assert.equal(output.search_summary.candidate_count, 3);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Usage:"), true);
  assert.equal(result.stdout.includes("local sensitive artifact"), true);
}

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", join(tmpRoot, "missing.json"), "--query", queryPath],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("corpus file not found"), true);
}

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--query", join(tmpRoot, "missing-query.json")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("query file not found"), true);
}

{
  const badCorpusPath = join(tmpRoot, "bad-corpus.json");
  writeFileSync(badCorpusPath, "{bad");
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", badCorpusPath, "--query", queryPath],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse practice corpus JSON"), true);
}

{
  const invalidCorpusPath = join(tmpRoot, "invalid-corpus.json");
  writeFileSync(invalidCorpusPath, JSON.stringify({ items: "bad" }));
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", invalidCorpusPath, "--query", queryPath],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("invalid practice corpus"), true);
}

{
  const badQueryPath = join(tmpRoot, "bad-query.json");
  writeFileSync(badQueryPath, "{bad");
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--query", badQueryPath],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse variant practice query JSON"), true);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--unknown"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("unknown argument"), true);
}

console.log("variant practice agent cli tests passed");
