import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  extractZip,
  isUnsafeZipEntry,
  loadDotEnvLocal,
  parseZipListing,
} from "../../rag/mineru-precise-smoke.mjs";

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

{
  assert.equal(isUnsafeZipEntry("../outside/"), true);
  assert.equal(isUnsafeZipEntry("/tmp/outside/"), true);
  assert.equal(isUnsafeZipEntry("safe/"), false);
}

{
  const tmpRoot = await mkdtemp(join(tmpdir(), "mathtrace-mineru-zip-dir-"));
  const sourceDir = join(tmpRoot, "source");
  const nestedDir = join(sourceDir, "nested");
  const escapeDir = join(sourceDir, "escape-dir");
  const outDir = join(tmpRoot, "out");
  const zipPath = join(tmpRoot, "evil-dir.zip");
  const warnings = [];

  await mkdir(nestedDir, { recursive: true });
  await mkdir(escapeDir, { recursive: true });
  await writeFile(join(sourceDir, "full.md"), "# safe\n");
  await writeFile(join(escapeDir, "ignored.md"), "escape\n");

  zipFrom(sourceDir, zipPath, ["full.md"]);
  zipFrom(nestedDir, zipPath, ["../escape-dir/"]);

  extractZip(zipPath, outDir, warnings);

  assert.equal(warnings.includes("result_zip_unsafe_entry"), true);
  await assertFileMissing(join(outDir, "full.md"));
}

{
  const listing = parseZipListing(`
Archive:  sample.zip
Zip file size: 123 bytes, number of entries: 2
drwxr-xr-x  3.0 unx        0 bx stor 26-Jun-21 10:00 safe/
lrwxr-xr-x  3.0 unx       11 bx stor 26-Jun-21 10:00 link-outside
2 files, 11 bytes uncompressed, 11 bytes compressed:  0.0%
`);

  assert.equal(listing.some((entry) => entry.isSymlink && entry.name === "link-outside"), true);
}

{
  const tmpRoot = await mkdtemp(join(tmpdir(), "mathtrace-mineru-zip-link-"));
  const sourceDir = join(tmpRoot, "source");
  const outDir = join(tmpRoot, "out");
  const zipPath = join(tmpRoot, "link.zip");
  const outsideTarget = join(tmpRoot, "outside-target.txt");
  const warnings = [];

  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(sourceDir, "full.md"), "# safe\n");
  await writeFile(outsideTarget, "outside\n");

  let canCreateSymlink = true;
  try {
    await symlink(outsideTarget, join(sourceDir, "link-outside"));
  } catch {
    canCreateSymlink = false;
  }

  if (canCreateSymlink) {
    zipFrom(sourceDir, zipPath, ["full.md"]);
    zipFrom(sourceDir, zipPath, ["-y", "link-outside"]);

    extractZip(zipPath, outDir, warnings);

    assert.equal(warnings.includes("result_zip_unsafe_entry"), true);
    await assertFileMissing(join(outDir, "full.md"));
  }
}

{
  const tmpRoot = await mkdtemp(join(tmpdir(), "mathtrace-mineru-env-"));
  const previousCwd = process.cwd();
  const previousToken = process.env.MINERU_API_TOKEN;
  const previousOtherSecret = process.env.OTHER_SECRET;

  delete process.env.MINERU_API_TOKEN;
  delete process.env.OTHER_SECRET;

  try {
    await writeFile(join(tmpRoot, ".env.local"), "OTHER_SECRET=do-not-load\nMINERU_API_TOKEN=test-token\n");
    process.chdir(tmpRoot);

    loadDotEnvLocal();

    assert.equal(process.env.MINERU_API_TOKEN, "test-token");
    assert.equal(process.env.OTHER_SECRET, undefined);
  } finally {
    process.chdir(previousCwd);
    restoreEnvValue("MINERU_API_TOKEN", previousToken);
    restoreEnvValue("OTHER_SECRET", previousOtherSecret);
  }
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

function restoreEnvValue(key, value) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
