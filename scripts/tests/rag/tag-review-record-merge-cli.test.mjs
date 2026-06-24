import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const scriptPath = resolve("scripts/rag/merge-tag-review-records.mjs");
const tmpRoot = mkdtempSync(join(tmpdir(), "tag-review-record-merge-cli-"));
const autoPath = join(tmpRoot, "auto_tag_review_records.json");
const humanPath = join(tmpRoot, "tag_review_records.json");
const outDir = join(tmpRoot, "out");
const fixtureQuestionText = "CLI fixture question must stay out of stdout";

writeJson(autoPath, [
  reviewRecord({
    item_id: "practice-candidate-1",
    target_skills: ["tangent_slope"],
    method_tags: ["derivative_definition"],
    feature_flags: ["has_choice_options"],
    review_notes: `auto gate ${fixtureQuestionText}`,
    has_manual_tag_correction: false,
    tag_source: "llm",
  }),
  reviewRecord({
    item_id: "practice-candidate-2",
    target_skills: ["monotonicity"],
    method_tags: ["monotonicity_by_derivative"],
    feature_flags: [],
    review_notes: "auto gate",
    has_manual_tag_correction: false,
    tag_source: "llm",
  }),
]);

writeJson(humanPath, [
  reviewRecord({
    item_id: "practice-candidate-2",
    target_skills: ["parameter_range"],
    method_tags: ["parameter_classification"],
    feature_flags: [],
    review_notes: "human override",
    has_manual_tag_correction: true,
    tag_source: "human",
  }),
  reviewRecord({
    item_id: "practice-candidate-3",
    target_skills: ["zero_point"],
    method_tags: ["zero_count"],
    feature_flags: [],
    review_notes: "human append",
    has_manual_tag_correction: true,
    tag_source: "human",
  }),
]);

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--auto", autoPath, "--human", humanPath, "--out", outDir],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("Auto records: 2"), true);
  assert.equal(result.stdout.includes("Human records: 2"), true);
  assert.equal(result.stdout.includes("Final records: 3"), true);
  assert.equal(result.stdout.includes("Human overrides: 1"), true);
  assert.equal(result.stdout.includes("human override"), false);
  assert.equal(result.stdout.includes("human append"), false);
  assert.equal(result.stdout.includes(fixtureQuestionText), false);

  const finalRecords = readJson(join(outDir, "final_tag_review_records.json"));
  assert.deepEqual(
    finalRecords.map((record) => record.item_id),
    ["practice-candidate-1", "practice-candidate-2", "practice-candidate-3"],
  );
  assert.equal(finalRecords.find((record) => record.item_id === "practice-candidate-2").tag_source, "human");
  assert.deepEqual(
    finalRecords.find((record) => record.item_id === "practice-candidate-2").reviewed_tags.target_skills,
    ["parameter_range"],
  );

  const summary = readJson(join(outDir, "tag_review_record_merge_summary.json"));
  assert.equal(summary.auto_records, 2);
  assert.equal(summary.human_records, 2);
  assert.equal(summary.final_records, 3);
  assert.equal(summary.human_overrides, 1);
  assert.equal(summary.human_only_records, 1);
}

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--auto", autoPath, "--human", humanPath],
    { cwd: tmpRoot, encoding: "utf8" },
  );
  const defaultOutDir = join(tmpRoot, "artifacts/rag/tag-review");

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(defaultOutDir, "final_tag_review_records.json")), true);
  assert.equal(existsSync(join(defaultOutDir, "tag_review_record_merge_summary.json")), true);
}

{
  const duplicateAutoPath = join(tmpRoot, "duplicate_auto_tag_review_records.json");
  writeJson(duplicateAutoPath, [
    reviewRecord({ item_id: "practice-candidate-4", review_notes: "duplicate auto a" }),
    reviewRecord({ item_id: "practice-candidate-4", review_notes: "duplicate auto b" }),
  ]);
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--auto", duplicateAutoPath, "--human", humanPath, "--out", join(tmpRoot, "duplicate-auto-out")],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("duplicate item_id"), true);
}

{
  const duplicateHumanPath = join(tmpRoot, "duplicate_tag_review_records.json");
  writeJson(duplicateHumanPath, [
    reviewRecord({ item_id: "practice-candidate-5", review_notes: "duplicate human a", tag_source: "human" }),
    reviewRecord({ item_id: "practice-candidate-5", review_notes: "duplicate human b", tag_source: "human" }),
  ]);
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--auto", autoPath, "--human", duplicateHumanPath, "--out", join(tmpRoot, "duplicate-human-out")],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("duplicate item_id"), true);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("--auto"), true);
  assert.equal(result.stdout.includes("--human"), true);
  assert.equal(result.stdout.includes("--out"), true);
}

console.log("tag review record merge cli tests passed");

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function reviewRecord({
  item_id,
  target_skills = ["tangent_slope"],
  method_tags = ["derivative_definition"],
  feature_flags = [],
  review_notes = "fixture note",
  has_manual_tag_correction = false,
  tag_source = "llm",
}) {
  return {
    item_id,
    review_status: "approved",
    reviewed_tags: {
      target_skills,
      method_tags,
      feature_flags,
    },
    review_notes,
    has_manual_tag_correction,
    tag_source,
  };
}
