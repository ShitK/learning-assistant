import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpRoot = mkdtempSync(join(tmpdir(), "variant-practice-agent-ui-"));
const inputPath = join(tmpRoot, "recommendations.json");
const outputDir = join(tmpRoot, "ui");

const fixture = {
  agent_version: "variant-practice-agent-v0",
  query_id: "demo-query",
  practice_goal: {
    knowledge_points: ["derivative"],
    target_skills: ["切线斜率"],
    mistake_causes: [],
    summary: "优先巩固切线斜率。",
  },
  agent_steps: [
    { id: "analyze_practice_need", status: "completed", summary: "识别练习目标。" },
    { id: "build_recommendations", status: "completed", summary: "生成 3 道变式练习推荐。" },
  ],
  rationale: "补充同标签相近题用于演示练习链路。",
  search_summary: {
    corpus_version: "enriched-practice-corpus-v0",
    searched_items: 69,
    candidate_count: 12,
  },
  recommendations: [
    {
      rank: 1,
      recommendation_type: "foundation",
      item_id: "practice-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知 $f'(1)=2$，求切线斜率。",
      reason: "同章节同标签。",
      matched_dimensions: ["knowledge_point", "section_title", "target_skill"],
      score: 42,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
    },
    {
      rank: 2,
      recommendation_type: "near_transfer",
      item_id: "practice-2",
      source_candidate_id: "candidate-2",
      question_text: "2. 跨章节切线斜率题。",
      reason: "跨章节同标签。",
      matched_dimensions: ["knowledge_point", "target_skill"],
      score: 34,
      source_ref: { pdf_page_index: 2, section_title: "考点 2 导数与单调性" },
    },
    {
      rank: 3,
      recommendation_type: "additional_practice",
      item_id: "practice-3",
      source_candidate_id: "candidate-3",
      question_text: "3. 同标签补充练习。",
      reason: "补充一题同标签相近题。",
      matched_dimensions: ["knowledge_point", "target_skill"],
      score: 40,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
    },
  ],
  warnings: ["demo_fill_used"],
};

writeFileSync(inputPath, `${JSON.stringify(fixture, null, 2)}\n`);

{
  const result = spawnSync(
    process.execPath,
    [
      "scripts/rag/build-variant-practice-agent-ui.mjs",
      "--input",
      inputPath,
      "--out",
      outputDir,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("index.html"), true);
  assert.equal(result.stdout.includes("variant_practice_manifest.json"), true);
  assert.equal(result.stdout.includes("Recommendations: 3"), true);
  assert.equal(result.stdout.includes("切线斜率"), false);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);

  const html = readFileSync(join(outputDir, "index.html"), "utf8");
  assert.equal(html.includes("MathTrace Variant Practice"), true);
  assert.equal(html.includes(".katex"), true);
  assert.equal(html.includes("<link"), false);
  assert.equal(html.includes("https://"), false);
  assert.equal(html.includes('id="katex-runtime"'), true);
  assert.equal(html.includes("demo_fill_used"), true);
  assert.equal(html.includes("additional_practice"), true);
  assert.equal(existsSync(join(outputDir, "fonts", "KaTeX_Size1-Regular.woff2")), true);

  const manifest = JSON.parse(readFileSync(join(outputDir, "variant_practice_manifest.json"), "utf8"));
  assert.equal(manifest.recommendation_count, 3);
  assert.equal(manifest.has_demo_fill, true);
  assert.equal(manifest.source_file, inputPath);
}

{
  const result = spawnSync(process.execPath, ["scripts/rag/build-variant-practice-agent-ui.mjs", "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Usage:"), true);
  assert.equal(result.stdout.includes("local sensitive artifact"), true);
}

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/build-variant-practice-agent-ui.mjs", "--input", join(tmpRoot, "missing.json")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("input file not found"), true);
}

console.log("variant practice agent ui cli tests passed");
