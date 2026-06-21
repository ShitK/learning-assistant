import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractZip } from "../../rag/mineru-precise-smoke.mjs";

{
  const tmpRoot = await mkdtemp(join(tmpdir(), "mathtrace-mineru-zip-"));
  const sourceDir = join(tmpRoot, "source");
  const nestedDir = join(sourceDir, "nested");
  const outDir = join(tmpRoot, "out");
  const zipPath = join(tmpRoot, "evil.zip");
  const escapeSourcePath = join(sourceDir, "escape-from-zip.txt");
  const warnings = [];

  await mkdir(nestedDir, { recursive: true });
  await writeFile(join(sourceDir, "full.md"), "# safe\n");
  await writeFile(escapeSourcePath, "escape\n");

  zipFrom(sourceDir, zipPath, ["full.md"]);
  zipFrom(nestedDir, zipPath, ["../escape-from-zip.txt"]);

  extractZip(zipPath, outDir, warnings);

  assert.equal(warnings.includes("result_zip_unsafe_entry"), true);
  await assertFileMissing(join(tmpRoot, "escape-from-zip.txt"));
  await assertFileMissing(join(outDir, "full.md"));
}

console.log("mineru precise smoke cli tests passed");

function zipFrom(cwd, zipPath, entries) {
  const result = spawnSync("zip", ["-q", zipPath, ...entries], {
    cwd,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
}

async function assertFileMissing(filePath) {
  try {
    await readFile(filePath, "utf8");
  } catch (error) {
    assert.equal(error.code, "ENOENT");
    return;
  }

  assert.fail(`expected file to be missing: ${filePath}`);
}
