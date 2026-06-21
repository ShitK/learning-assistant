import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpRoot = mkdtempSync(join(tmpdir(), "candidate-review-ui-"));
const inputPath = join(tmpRoot, "candidate_questions.json");
const outputDir = join(tmpRoot, "review-ui");

const fixture = {
  source_file: "/tmp/source.pdf",
  source_file_sha256: "source123",
  mineru_json_file: "/tmp/mineru.json",
  mineru_json_sha256: "json123",
  extractor: "mineru-json-candidate-mapper",
  extracted_at: "2026-06-22T00:00:00.000Z",
  page_count: 1,
  candidates: [
    {
      id: "candidate-1",
      source_ref: {
        pdf_page_index: 1,
        book_page_label: null,
        side: "full",
        block_start_index: 1,
        block_start_bbox: [1, 2, 3, 4],
        block_end_pdf_page_index: 1,
        block_end_index: 2,
        block_end_bbox: [1, 5, 3, 8],
        section_title: "考点 1 导数",
        crop_image_path: null,
      },
      question_number: "1",
      raw_ocr_text: "1. 设 $f(x)$",
      normalized_text: "1. 设 $f(x)$\nA. 1\nB. 2",
      answer_or_solution_candidate: null,
      extraction_confidence: "high",
      warnings: [],
    },
  ],
  warnings: [],
};

writeFileSync(inputPath, `${JSON.stringify(fixture, null, 2)}\n`);

{
  const result = spawnSync(
    process.execPath,
    [
      "scripts/rag/build-candidate-review-ui.mjs",
      "--input",
      inputPath,
      "--out",
      outputDir,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("index.html"), true);
  assert.equal(result.stdout.includes("review_manifest.json"), true);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);

  const html = readFileSync(join(outputDir, "index.html"), "utf8");
  assert.equal(html.includes("MathTrace Candidate Review"), true);
  assert.equal(html.includes(".katex"), true);
  assert.equal(html.includes("window.__CANDIDATE_REVIEW_DATA__"), true);
  assert.equal(html.includes("copy-json-fallback"), true);
  assert.equal(html.includes("reviewed_practice_seed.json"), true);

  const manifest = JSON.parse(
    readFileSync(join(outputDir, "review_manifest.json"), "utf8"),
  );
  assert.equal(manifest.candidate_count, 1);
  assert.equal(manifest.candidate_source_file, inputPath);
}

{
  const result = spawnSync(
    process.execPath,
    [
      "scripts/rag/build-candidate-review-ui.mjs",
      "--input",
      join(tmpRoot, "missing.json"),
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("input file not found"), true);
}

{
  const badPath = join(tmpRoot, "bad.json");
  writeFileSync(badPath, "{bad");
  const result = spawnSync(
    process.execPath,
    [
      "scripts/rag/build-candidate-review-ui.mjs",
      "--input",
      badPath,
      "--out",
      join(tmpRoot, "bad-out"),
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(
    result.stderr.includes("failed to parse candidate questions JSON"),
    true,
  );
}

{
  const invalidPath = join(tmpRoot, "invalid.json");
  writeFileSync(invalidPath, JSON.stringify({ candidates: "bad" }));
  const result = spawnSync(
    process.execPath,
    [
      "scripts/rag/build-candidate-review-ui.mjs",
      "--input",
      invalidPath,
      "--out",
      join(tmpRoot, "invalid-out"),
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("invalid candidate extraction"), true);
}

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/build-candidate-review-ui.mjs", "--input"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--input requires a value"), true);
}

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/build-candidate-review-ui.mjs", "--out"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--out requires a value"), true);
}

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/build-candidate-review-ui.mjs", "--unknown"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("unknown argument"), true);
}

console.log("candidate review ui cli tests passed");
