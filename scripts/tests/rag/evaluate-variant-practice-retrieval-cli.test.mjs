import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const scriptPath = join(process.cwd(), "scripts/rag/evaluate-variant-practice-retrieval.mjs");
const outputDir = join(
  process.cwd(),
  "artifacts",
  "rag",
  "evals",
  `task-4-cli-test-${process.pid}-${Date.now()}`,
);
const noLatestDir = join(
  process.cwd(),
  "artifacts",
  "rag",
  "evals",
  `task-4-cli-no-latest-${process.pid}-${Date.now()}`,
);

try {
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--local-only",
      "--case",
      "unsupported_non_derivative",
      "--output",
      outputDir,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /variant practice retrieval eval report written/);
  assert.equal(existsSync(join(outputDir, "latest.json")), true);

  const report = JSON.parse(readFileSync(join(outputDir, "latest.json"), "utf8"));
  assert.equal(report.mode, "local_only");
  assert.equal(report.case_count, 1);
  assert.equal(report.cases[0].case_id, "unsupported_non_derivative");
  assert.equal(report.cases[0].retrieval_source, null);

  const noLatest = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--local-only",
      "--case",
      "unsupported_non_derivative",
      "--output",
      noLatestDir,
      "--no-latest",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(noLatest.status, 0, noLatest.stderr);
  assert.equal(existsSync(join(noLatestDir, "latest.json")), false);

  const badCase = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--local-only",
      "--case",
      "missing_case",
      "--output",
      outputDir,
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(badCase.status, 1);
  assert.match(badCase.stderr, /Unknown eval case: missing_case/);

  const badMode = spawnSync(
    process.execPath,
    [scriptPath, "--local-only", "--pgvector-preferred"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(badMode.status, 1);
  assert.match(badMode.stderr, /Choose exactly one mode/);

  const missingOutput = spawnSync(
    process.execPath,
    [scriptPath, "--local-only", "--output"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(missingOutput.status, 1);
  assert.match(missingOutput.stderr, /--output requires a value/);

  const missingCase = spawnSync(
    process.execPath,
    [scriptPath, "--local-only", "--case", "--no-latest"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(missingCase.status, 1);
  assert.match(missingCase.stderr, /--case requires a value/);

  console.log("evaluate variant practice retrieval cli tests passed");
} finally {
  rmSync(outputDir, { recursive: true, force: true });
  rmSync(noLatestDir, { recursive: true, force: true });
}
