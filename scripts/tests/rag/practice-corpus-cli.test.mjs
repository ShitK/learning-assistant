import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = join(process.cwd(), "scripts/rag/build-practice-corpus.mjs");
const tmpRoot = mkdtempSync(join(tmpdir(), "practice-corpus-"));
const inputPath = join(tmpRoot, "reviewed_practice_seed.json");
const outputDir = join(tmpRoot, "practice-corpus");

const seed = {
  exported_at: "2026-06-22T09:34:11.902Z",
  source_candidate_file: "candidate_questions.json",
  source_file: "/tmp/source.pdf",
  mineru_json_file: "/tmp/source.json",
  approved_count: 1,
  items: [
    {
      id: "candidate-1",
      candidate_id: "candidate-1",
      review_status: "reviewed",
      reviewer_note: "",
      question_text: "1. 求函数 $f(x)=x^2$ 的导数.",
      original_question_text: "1. 求函数 $f(x)=x^2$ 的导数.",
      has_manual_correction: false,
      solution_outline: null,
      mistake_causes: [],
      knowledge_points: ["导数", "考点 1 导数"],
      difficulty: null,
      source_ref: {
        pdf_page_index: 1,
        section_title: "考点 1 导数",
      },
      original_extraction_confidence: "high",
      original_warnings: [],
    },
  ],
};

writeFileSync(inputPath, `${JSON.stringify(seed, null, 2)}\n`);

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--input", inputPath, "--out", outputDir],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("practice_corpus.json"), true);
  assert.equal(result.stdout.includes("Items: 1"), true);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);
  assert.equal(result.stdout.includes("求函数"), false);

  const corpus = JSON.parse(readFileSync(join(outputDir, "practice_corpus.json"), "utf8"));
  assert.equal(corpus.corpus_version, "practice-corpus-v0");
  assert.equal(corpus.item_count, 1);
  assert.equal(corpus.items[0].id, "practice-candidate-1");
  assert.equal(corpus.items[0].knowledge_points[0], "derivative");
  assert.equal("variant_level" in corpus.items[0], false);
}

{
  const defaultOutRoot = join(tmpRoot, "default-out-root");
  mkdirSync(defaultOutRoot);
  const result = spawnSync(process.execPath, [scriptPath, "--input", inputPath], {
    encoding: "utf8",
    cwd: defaultOutRoot,
  });

  assert.equal(result.status, 0, result.stderr);
  const corpus = JSON.parse(
    readFileSync(
      join(defaultOutRoot, "artifacts/rag/practice-corpus/practice_corpus.json"),
      "utf8",
    ),
  );
  assert.equal(corpus.item_count, 1);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("Usage:"), true);
  assert.equal(result.stdout.includes("local sensitive artifact"), true);
}

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--input", join(tmpRoot, "missing.json")],
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
    [scriptPath, "--input", badPath, "--out", join(tmpRoot, "bad-out")],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse reviewed practice seed JSON"), true);
}

{
  const invalidPath = join(tmpRoot, "invalid.json");
  writeFileSync(invalidPath, JSON.stringify({ items: "bad" }));
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--input", invalidPath, "--out", join(tmpRoot, "invalid-out")],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("invalid reviewed practice seed"), true);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--input"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--input requires a value"), true);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--unknown"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("unknown argument"), true);
}

console.log("practice corpus cli tests passed");
