import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { getPracticeTagTaxonomy } from "../../rag/practice-tag-taxonomy.mjs";

const tmpRoot = mkdtempSync(join(tmpdir(), "tag-review-ui-"));
const inputPath = join(tmpRoot, "tag_review_queue.json");
const arrayInputPath = join(tmpRoot, "tag_review_queue_array.json");
const outputDir = join(tmpRoot, "review-ui");
const arrayOutputDir = join(tmpRoot, "review-ui-array");
const taxonomy = getPracticeTagTaxonomy();

const fixture = {
  proposal_version: "tag-proposal-merge-v0",
  generated_at: "2026-06-24T00:00:00.000Z",
  taxonomy_id: taxonomy.taxonomy_id,
  review_queue: [
    {
      item_id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "已知 $f'(1)=2$，求切线斜率。",
      section_title: "导数几何意义",
      source_ref: null,
      gate_status: "needs_review",
      review_status: "needs_review",
      recommended_review_status: "needs_fix",
      taxonomy_id: taxonomy.taxonomy_id,
      gate_reasons: ["target_skill_conflict"],
      rule_tags: {
        target_skills: ["derivative_geometric_meaning"],
        method_tags: ["derivative_definition"],
        feature_flags: ["has_choice_options"],
      },
      ai_tags: {
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
        feature_flags: ["has_choice_options"],
      },
      proposed_final_tags: {
        target_skills: ["tangent_slope"],
        method_tags: ["derivative_definition"],
        feature_flags: ["has_choice_options"],
      },
      ai_confidence: "high",
      review_origin: "auto_gate",
    },
  ],
};

writeFileSync(inputPath, `${JSON.stringify(fixture, null, 2)}\n`);
writeFileSync(arrayInputPath, `${JSON.stringify(fixture.review_queue, null, 2)}\n`);

{
  const result = spawnSync(
    process.execPath,
    [
      "scripts/rag/build-tag-review-ui.mjs",
      "--queue",
      inputPath,
      "--out",
      outputDir,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("index.html"), true);
  assert.equal(result.stdout.includes("tag_review_manifest.json"), true);
  assert.equal(result.stdout.includes("Items: 1"), true);
  assert.equal(result.stdout.includes("已知"), false);
  assert.equal(result.stdout.includes("f'(1)"), false);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);

  const html = readFileSync(join(outputDir, "index.html"), "utf8");
  assert.equal(html.includes("MathTrace Tag Review"), true);
  assert.equal(html.includes(".katex"), true);
  assert.equal(html.includes("<link"), false);
  assert.equal(html.includes("https://"), false);
  assert.equal(html.includes("http://"), false);
  assert.equal(html.includes('id="katex-runtime"'), true);
  assert.equal(html.includes("window.katex"), true);
  assert.equal(html.includes("target_skills"), true);
  assert.equal(html.includes("tag_review_records.json"), true);
  assert.equal(html.includes("window.__TAG_REVIEW_DATA__"), true);
  assert.equal(
    existsSync(join(outputDir, "fonts", "KaTeX_Size1-Regular.woff2")),
    true,
  );

  const manifest = JSON.parse(
    readFileSync(join(outputDir, "tag_review_manifest.json"), "utf8"),
  );
  assert.equal(manifest.item_count, 1);
  assert.equal(manifest.queue_source_file, inputPath);
  assert.equal(manifest.taxonomy_id, taxonomy.taxonomy_id);
}

{
  const result = spawnSync(
    process.execPath,
    [
      "scripts/rag/build-tag-review-ui.mjs",
      "--queue",
      arrayInputPath,
      "--out",
      arrayOutputDir,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("Items: 1"), true);

  const html = readFileSync(join(arrayOutputDir, "index.html"), "utf8");
  assert.equal(html.includes("window.__TAG_REVIEW_DATA__"), true);
  assert.equal(html.includes("math_derivative_v0"), true);

  const manifest = JSON.parse(
    readFileSync(join(arrayOutputDir, "tag_review_manifest.json"), "utf8"),
  );
  assert.equal(manifest.item_count, 1);
  assert.equal(manifest.queue_source_file, arrayInputPath);
  assert.equal(manifest.taxonomy_id, taxonomy.taxonomy_id);
}

{
  const result = spawnSync(
    process.execPath,
    [
      "scripts/rag/build-tag-review-ui.mjs",
      "--queue",
      join(tmpRoot, "missing.json"),
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("queue file not found"), true);
}

{
  const badPath = join(tmpRoot, "bad.json");
  writeFileSync(badPath, "{bad");
  const result = spawnSync(
    process.execPath,
    [
      "scripts/rag/build-tag-review-ui.mjs",
      "--queue",
      badPath,
      "--out",
      join(tmpRoot, "bad-out"),
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse tag review queue JSON"), true);
}

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/build-tag-review-ui.mjs", "--queue"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--queue requires a value"), true);
}

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/build-tag-review-ui.mjs", "--unknown"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("unknown argument"), true);
}

{
  const result = spawnSync(
    process.execPath,
    [
      resolve("scripts/rag/build-tag-review-ui.mjs"),
      "--queue",
      inputPath,
      "--out",
      join(tmpRoot, "missing-katex-out"),
    ],
    { cwd: tmpRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to read KaTeX CSS"), true);
}

console.log("tag review ui cli tests passed");
