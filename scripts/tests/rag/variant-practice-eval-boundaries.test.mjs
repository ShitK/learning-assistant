import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cli = readFileSync("scripts/rag/evaluate-variant-practice-retrieval.mjs", "utf8");
const core = readFileSync("scripts/rag/evaluate-variant-practice-retrieval-core.mjs", "utf8");
const service = readFileSync("src/lib/server/rag/dynamic-variant-practice-service.ts", "utf8");
const localStorageUsagePattern =
  /\b(?:window|globalThis)?\.?localStorage\.(?:getItem|setItem|removeItem|clear)\b/;
const moduleImportPattern =
  /(?:^|\n)\s*import\s+(?:[^"'()]+\s+from\s+)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;

for (const [label, source] of [
  ["cli", cli],
  ["core", core],
  ["service", service],
]) {
  assertNoModuleImport(source, label, "student-profile-persistence");
  assertNoModuleImport(source, label, "diagnosis-persistence");
  assertNoModuleImport(source, label, "mistake-book-persistence");
  assertNoModuleImport(source, label, "variant-practice-corpus-persistence");
  assert.equal(localStorageUsagePattern.test(source), false, `${label} must not use localStorage APIs`);
}

assert.equal(cli.includes("upsertItems"), false);
assert.equal(cli.includes("deactivateMissingItems"), false);
assert.equal(core.includes("upsertItems"), false);
assert.equal(core.includes("deactivateMissingItems"), false);
assert.equal(core.includes("must not target localStorage paths"), true);
assert.equal(service.includes("handleDynamicVariantPracticeRequest"), true);
assert.equal(service.includes("handleDynamicVariantPracticeEvalRequest"), true);

console.log("variant practice eval boundary tests passed");

function assertNoModuleImport(source, label, forbiddenModuleName) {
  const importedSpecifiers = Array.from(
    source.matchAll(moduleImportPattern),
    (match) => match[1] ?? match[2] ?? "",
  );
  assert.equal(
    importedSpecifiers.some((specifier) => specifier.includes(forbiddenModuleName)),
    false,
    `${label} must not import ${forbiddenModuleName}`,
  );
}
