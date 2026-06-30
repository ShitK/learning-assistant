import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const scriptPath = "scripts/rag/ocr-derivative-pdf.mjs";
const bundledPythonBinDir =
  "/Users/kk/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin";

{
  const result = runCli(["--help"]);

  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Usage:"), true);
}

{
  const result = runCli(["--input", "/private/tmp/mathtrace-missing-input.pdf"]);

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("input file not found"), true);
}

{
  const result = runCli([
    "--input",
    "/private/tmp/mathtrace-missing-input.pdf",
    "--max-pages",
    "0",
  ]);

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--max-pages must be an integer >= 1"), true);
}

{
  const result = runCli([
    "--input",
    "/private/tmp/mathtrace-missing-input.pdf",
    "--ocr-command",
    "/bin/sh",
  ]);

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("unsupported --ocr-command"), true);
}

{
  const tmpRoot = await mkdtemp(join(tmpdir(), "mathtrace-ocr-cli-"));
  const fakeBinDir = join(tmpRoot, "bin");
  const outDir = join(tmpRoot, "out");
  const inputPath = join(tmpRoot, "input.pdf");
  await mkdir(fakeBinDir, { recursive: true });
  await writeFile(inputPath, "%PDF-1.4\n");
  await createFakePoppler(fakeBinDir);

  const result = runCli(
    [
      "--input",
      inputPath,
      "--out",
      outDir,
      "--max-pages",
      "1",
      "--ocr-command",
      "nonexistent-ocr-xyz",
    ],
    {
      CODEX_POPPLER_BIN: fakeBinDir,
    },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Candidates: 2"), true);
  assert.equal(result.stdout.includes("ocr_tool_unavailable"), true);

  const candidateJson = JSON.parse(
    await readFile(join(outDir, "candidate_questions.json"), "utf8"),
  );
  assert.equal(candidateJson.page_count, 1);
  assert.equal(candidateJson.candidates.length, 2);
  assert.equal(candidateJson.candidates[0].source_ref.side, "left");
  assert.equal(candidateJson.candidates[1].source_ref.side, "right");
  assert.equal(candidateJson.warnings.includes("ocr_tool_unavailable"), true);

  const report = await readFile(join(outDir, "extraction_report.md"), "utf8");
  assert.equal(report.includes("python_pillow_crop_available: true"), true);
  assert.equal(report.includes("ocr_tool_unavailable"), true);
}

console.log("derivative pdf ocr cli tests passed");

function runCli(args, env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bundledPythonBinDir}:${process.env.PATH ?? ""}`,
      ...env,
    },
  });
}

async function createFakePoppler(fakeBinDir) {
  const pdfinfoPath = join(fakeBinDir, "pdfinfo");
  await writeFile(
    pdfinfoPath,
    [
      "#!/usr/bin/env node",
      "console.log('Pages: 1');",
      "",
    ].join("\n"),
  );
  await chmod(pdfinfoPath, 0o755);

  const pdftoppmPath = join(fakeBinDir, "pdftoppm");
  await writeFile(
    pdftoppmPath,
    [
      "#!/usr/bin/env node",
      "const { spawnSync } = require('node:child_process');",
      "const prefix = process.argv.at(-1);",
      "const result = spawnSync('python3', ['-c', [",
      "  'from PIL import Image',",
      "  'import sys',",
      "  'image = Image.new(\"RGB\", (10, 4), \"white\")',",
      "  'image.save(sys.argv[1])',",
      "].join('; '), `${prefix}-1.png`], { encoding: 'utf8' });",
      "if (result.status !== 0) {",
      "  console.error(result.stderr);",
      "  process.exit(result.status ?? 1);",
      "}",
      "",
    ].join("\n"),
  );
  await chmod(pdftoppmPath, 0o755);
}
