import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpRoot = mkdtempSync(join(tmpdir(), "mineru-json-candidate-mapper-"));
const inputPath = join(tmpRoot, "mineru.json");
const outDir = join(tmpRoot, "out");
const sourcePath = join(tmpRoot, "source.pdf");

writeFileSync(
  inputPath,
  JSON.stringify(
    {
      pdf_info: [
        {
          page_idx: 0,
          para_blocks: [
            {
              type: "title",
              index: 1,
              lines: [{ spans: [{ type: "text", content: "考点 1 导数的概念、几何意义与运算" }] }],
            },
            {
              type: "text",
              index: 2,
              lines: [{ spans: [{ type: "text", content: "1.(测试)已知函数 f(x), 则()" }] }],
            },
            {
              type: "text",
              index: 3,
              lines: [{ spans: [{ type: "text", content: "A. 1" }] }],
            },
            {
              type: "text",
              index: 4,
              lines: [{ spans: [{ type: "text", content: "B. 2" }] }],
            },
          ],
        },
      ],
    },
    null,
    2,
  ),
);
writeFileSync(sourcePath, "fake source pdf bytes");

{
  const result = spawnSync(
    process.execPath,
    [
      "scripts/rag/map-mineru-json-to-candidates.mjs",
      "--input",
      inputPath,
      "--source-file",
      sourcePath,
      "--out",
      outDir,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("candidate_questions.json"), true);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);
  assert.equal(result.stderr.includes("MINERU_API_TOKEN"), false);

  const output = JSON.parse(readFileSync(join(outDir, "candidate_questions.json"), "utf8"));
  assert.equal(output.source_file, sourcePath);
  assert.equal(output.source_file_sha256, createHash("sha256").update("fake source pdf bytes").digest("hex"));
  assert.equal(output.mineru_json_file, inputPath);
  assert.equal(output.extractor, "mineru-json-candidate-mapper");
  assert.equal(output.page_count, 1);
  assert.equal(output.candidates.length, 1);
  assert.equal(output.candidates[0].question_number, "1");

  const report = readFileSync(join(outDir, "extraction_report.md"), "utf8");
  assert.equal(report.includes("# P2.0 MinerU JSON 候选题映射报告"), true);
  assert.equal(report.includes("- 候选题数量：1"), true);
}

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/map-mineru-json-to-candidates.mjs", "--input", join(tmpRoot, "missing.json")],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("input file not found"), true);
}

{
  const badPath = join(tmpRoot, "bad.json");
  writeFileSync(badPath, "{not-json");
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/map-mineru-json-to-candidates.mjs", "--input", badPath, "--out", join(tmpRoot, "bad-out")],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse MinerU JSON"), true);
}

{
  const missingSourceOutDir = join(tmpRoot, "missing-source-out");
  const missingSourcePath = join(tmpRoot, "missing-source.pdf");
  const result = spawnSync(
    process.execPath,
    [
      "scripts/rag/map-mineru-json-to-candidates.mjs",
      "--input",
      inputPath,
      "--source-file",
      missingSourcePath,
      "--out",
      missingSourceOutDir,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);

  const output = JSON.parse(readFileSync(join(missingSourceOutDir, "candidate_questions.json"), "utf8"));
  assert.equal(output.source_file, missingSourcePath);
  assert.equal(output.source_file_sha256, "");
  assert.equal(output.warnings.includes("source_file_sha256_unavailable"), true);

  const report = readFileSync(join(missingSourceOutDir, "extraction_report.md"), "utf8");
  assert.equal(report.includes("source_file_sha256_unavailable"), true);
}

{
  const unknownSourceOutDir = join(tmpRoot, "unknown-source-out");
  const result = spawnSync(
    process.execPath,
    [
      "scripts/rag/map-mineru-json-to-candidates.mjs",
      "--input",
      inputPath,
      "--out",
      unknownSourceOutDir,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);

  const output = JSON.parse(readFileSync(join(unknownSourceOutDir, "candidate_questions.json"), "utf8"));
  assert.equal(output.source_file, inputPath);
  assert.equal(output.source_file_sha256, "");
  assert.equal(output.warnings.includes("source_file_unknown"), true);
}

{
  const emptyPath = join(tmpRoot, "empty.json");
  const emptyOutDir = join(tmpRoot, "empty-out");
  writeFileSync(emptyPath, JSON.stringify({ pdf_info: [] }, null, 2));
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/map-mineru-json-to-candidates.mjs", "--input", emptyPath, "--out", emptyOutDir],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("question_split_failed"), true);

  const output = JSON.parse(readFileSync(join(emptyOutDir, "candidate_questions.json"), "utf8"));
  assert.equal(output.candidates.length, 0);
  assert.equal(output.warnings.includes("question_split_failed"), true);
}

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/map-mineru-json-to-candidates.mjs", "--input"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--input requires a value"), true);
}

console.log("mineru json candidate mapper cli tests passed");
