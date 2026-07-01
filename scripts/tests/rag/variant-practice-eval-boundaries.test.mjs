import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cli = readFileSync("scripts/rag/evaluate-variant-practice-retrieval.mjs", "utf8");
const core = readFileSync("scripts/rag/evaluate-variant-practice-retrieval-core.mjs", "utf8");
const service = readFileSync("src/lib/server/rag/dynamic-variant-practice-service.ts", "utf8");
const localStorageUsagePattern =
  /\b(?:window|globalThis)?\.?localStorage\.(?:getItem|setItem|removeItem|clear)\b/;

for (const source of [cli, core, service]) {
  assert.equal(source.includes("student-profile-persistence"), false);
  assert.equal(source.includes("diagnosis-persistence"), false);
  assert.equal(source.includes("mistake-book-persistence"), false);
  assert.equal(localStorageUsagePattern.test(source), false);
}

assert.equal(cli.includes("upsertItems"), false);
assert.equal(cli.includes("deactivateMissingItems"), false);
assert.equal(core.includes("upsertItems"), false);
assert.equal(core.includes("deactivateMissingItems"), false);
assert.equal(core.includes("must not target localStorage paths"), true);
assert.equal(service.includes("handleDynamicVariantPracticeRequest"), true);
assert.equal(service.includes("handleDynamicVariantPracticeEvalRequest"), true);

console.log("variant practice eval boundary tests passed");
