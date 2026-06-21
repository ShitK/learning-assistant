# P2.0 MinerU Precise OCR Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate that MinerU precise parsing can turn the local derivative PDF into inspectable Markdown/JSON artifacts that can later be mapped into `candidate_questions.json`.

**Architecture:** Add an offline script under `scripts/rag/` that reads `MINERU_API_TOKEN` from local environment only, requests MinerU batch upload URLs, uploads the local PDF, polls the precise parsing result, downloads the result zip, and writes a local smoke report under ignored `artifacts/`. Keep parsing-provider output as untrusted candidate source material; do not connect it to frontend, database, pgvector, memory, or `practice_corpus` in this task.

**Tech Stack:** Node.js ESM scripts, built-in `fetch`, `node:fs/promises`, `node:crypto`, `node:child_process`, existing `scripts/run-tests.mjs`, MinerU Open API batch upload/precise parsing endpoints, local `.env.local` via explicit CLI env loading.

## Global Constraints

- Do not print, commit, or write `MINERU_API_TOKEN` into logs, reports, docs, artifacts, or test snapshots.
- Do not commit `/Users/kk/Documents/导数专题.pdf` or generated MinerU artifacts.
- Keep generated outputs under `artifacts/rag/mineru-derivative-smoke/`; `.gitignore` already ignores `/artifacts/`.
- Treat MinerU Markdown/JSON as untrusted OCR candidate material requiring manual review.
- Do not modify `sample_diagnosis`, `app/api/**`, `src/lib/diagnosis/**`, `src/lib/persistence/**`, `memory_events`, `student_profiles`, evidence API, frontend, Supabase schema, pgvector, or `practice_corpus`.
- Do not require live MinerU network calls in default tests.
- The first real smoke may use `/Users/kk/Documents/导数专题.pdf` and should limit pages to `1-2` unless the user explicitly asks for the full 8 pages.
- MinerU precise API reference: `https://mineru.net/apiManage/docs`.

---

## File Structure

- Create `scripts/rag/mineru-precise-smoke-core.mjs`
  - Pure helper module for env parsing, request payload construction, token redaction, result summarization, and report rendering.
- Create `scripts/rag/mineru-precise-smoke.mjs`
  - Offline CLI that calls MinerU, uploads a local file, polls the batch result, downloads the zip, and writes local artifacts.
- Create `scripts/tests/rag/mineru-precise-smoke-core.test.mjs`
  - Pure tests only; no network and no real token.
- Modify `scripts/run-tests.mjs`
  - Add the pure MinerU helper test to the default suite.
- Modify `docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md`
  - Add a short implementation note that MinerU precise parsing is being validated as an external OCR/document parsing provider.
- Do not modify `.env.local` in this plan; the user has already configured `MINERU_API_TOKEN` locally.

---

### Task 1: Pure MinerU Smoke Helpers

**Files:**
- Create: `scripts/rag/mineru-precise-smoke-core.mjs`
- Create: `scripts/tests/rag/mineru-precise-smoke-core.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Produces:
  - `readMineruToken(env: Record<string, string | undefined>): { ok: true, token: string } | { ok: false, error: string }`
  - `redactSecret(value: string): string`
  - `buildMineruBatchPayload(input: { fileName: string; pageRanges: string; modelVersion: "pipeline" | "vlm"; language: string; isOcr: boolean; enableFormula: boolean; enableTable: boolean }): object`
  - `summarizeMineruBatchResult(result: unknown): { state: string; extractedZipUrl: string | null; errMsg: string | null; raw: unknown }`
  - `renderMineruSmokeReport(input: { inputFile: string; pageRanges: string; modelVersion: string; language: string; startedAt: string; finishedAt: string; state: string; outputDir: string; downloadedZipPath: string | null; extractedFiles: string[]; warnings: string[] }): string`

- [ ] **Step 1: Write failing helper tests**

Create `scripts/tests/rag/mineru-precise-smoke-core.test.mjs`:

```js
import assert from "node:assert/strict";

import {
  buildMineruBatchPayload,
  readMineruToken,
  redactSecret,
  renderMineruSmokeReport,
  summarizeMineruBatchResult,
} from "../../rag/mineru-precise-smoke-core.mjs";

{
  const missing = readMineruToken({});
  assert.equal(missing.ok, false);
  assert.equal(missing.error.includes("MINERU_API_TOKEN"), true);

  const present = readMineruToken({ MINERU_API_TOKEN: "  local-token  " });
  assert.deepEqual(present, { ok: true, token: "local-token" });
}

{
  assert.equal(redactSecret("abcdef1234567890"), "abcd...7890");
  assert.equal(redactSecret("short"), "<redacted>");
}

{
  const payload = buildMineruBatchPayload({
    fileName: "导数专题.pdf",
    pageRanges: "1-2",
    modelVersion: "vlm",
    language: "ch",
    isOcr: true,
    enableFormula: true,
    enableTable: true,
  });

  assert.deepEqual(payload, {
    enable_formula: true,
    enable_table: true,
    language: "ch",
    model_version: "vlm",
    files: [
      {
        name: "导数专题.pdf",
        is_ocr: true,
        page_ranges: "1-2",
      },
    ],
  });
}

{
  const summary = summarizeMineruBatchResult({
    code: 0,
    data: {
      extract_result: [
        {
          state: "done",
          full_zip_url: "https://example.test/result.zip",
          err_msg: "",
        },
      ],
    },
  });

  assert.equal(summary.state, "done");
  assert.equal(summary.extractedZipUrl, "https://example.test/result.zip");
  assert.equal(summary.errMsg, null);
}

{
  const report = renderMineruSmokeReport({
    inputFile: "/Users/kk/Documents/导数专题.pdf",
    pageRanges: "1-2",
    modelVersion: "vlm",
    language: "ch",
    startedAt: "2026-06-21T00:00:00.000Z",
    finishedAt: "2026-06-21T00:01:00.000Z",
    state: "done",
    outputDir: "artifacts/rag/mineru-derivative-smoke",
    downloadedZipPath: "artifacts/rag/mineru-derivative-smoke/mineru-result.zip",
    extractedFiles: [
      "artifacts/rag/mineru-derivative-smoke/raw/full.md",
      "artifacts/rag/mineru-derivative-smoke/raw/content_list.json",
    ],
    warnings: [],
  });

  assert.equal(report.includes("# P2.0 MinerU 精准解析 Smoke 报告"), true);
  assert.equal(report.includes("MINERU_API_TOKEN"), false);
  assert.equal(report.includes("- 页码范围：1-2"), true);
  assert.equal(report.includes("- 状态：done"), true);
}

console.log("mineru precise smoke core tests passed");
```

- [ ] **Step 2: Run helper test and verify it fails**

Run:

```bash
node scripts/tests/rag/mineru-precise-smoke-core.test.mjs
```

Expected:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module ... mineru-precise-smoke-core.mjs
```

- [ ] **Step 3: Implement pure helper module**

Create `scripts/rag/mineru-precise-smoke-core.mjs`:

```js
export function readMineruToken(env) {
  const token = env.MINERU_API_TOKEN?.trim();
  if (!token) {
    return {
      ok: false,
      error: "MINERU_API_TOKEN is required in local .env.local or process env.",
    };
  }
  return { ok: true, token };
}

export function redactSecret(value) {
  const text = String(value ?? "");
  if (text.length < 12) {
    return "<redacted>";
  }
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

export function buildMineruBatchPayload({
  fileName,
  pageRanges,
  modelVersion,
  language,
  isOcr,
  enableFormula,
  enableTable,
}) {
  return {
    enable_formula: enableFormula,
    enable_table: enableTable,
    language,
    model_version: modelVersion,
    files: [
      {
        name: fileName,
        is_ocr: isOcr,
        page_ranges: pageRanges,
      },
    ],
  };
}

export function summarizeMineruBatchResult(result) {
  const firstResult = result?.data?.extract_result?.[0];
  return {
    state: typeof firstResult?.state === "string" ? firstResult.state : "unknown",
    extractedZipUrl:
      typeof firstResult?.full_zip_url === "string" && firstResult.full_zip_url
        ? firstResult.full_zip_url
        : null,
    errMsg:
      typeof firstResult?.err_msg === "string" && firstResult.err_msg
        ? firstResult.err_msg
        : null,
    raw: result,
  };
}

export function renderMineruSmokeReport({
  inputFile,
  pageRanges,
  modelVersion,
  language,
  startedAt,
  finishedAt,
  state,
  outputDir,
  downloadedZipPath,
  extractedFiles,
  warnings,
}) {
  return [
    "# P2.0 MinerU 精准解析 Smoke 报告",
    "",
    "## 输入",
    "",
    `- 文件：${inputFile}`,
    `- 页码范围：${pageRanges}`,
    `- model_version：${modelVersion}`,
    `- language：${language}`,
    `- 开始时间：${startedAt}`,
    `- 结束时间：${finishedAt}`,
    "",
    "## 结果",
    "",
    `- 状态：${state}`,
    `- 输出目录：${outputDir}`,
    `- 下载 zip：${downloadedZipPath ?? "未下载"}`,
    "",
    "## 文件",
    "",
    ...formatList(extractedFiles),
    "",
    "## Warnings",
    "",
    ...formatList(warnings),
    "",
    "## 下一步判断",
    "",
    "- 人工检查 Markdown/JSON 是否保留题号、题干、选项和公式。",
    "- 如果前 2 页质量可接受，再写 mapper 转为 candidate_questions.json。",
    "- 如果公式或阅读顺序不可接受，再加入 GLM-OCR 对照。",
    "",
  ].join("\n");
}

function formatList(items) {
  if (!items || items.length === 0) {
    return ["- 无"];
  }
  return items.map((item) => `- ${item}`);
}
```

- [ ] **Step 4: Run helper test and verify it passes**

Run:

```bash
node scripts/tests/rag/mineru-precise-smoke-core.test.mjs
```

Expected:

```text
mineru precise smoke core tests passed
```

- [ ] **Step 5: Register helper test in default suite**

Modify `scripts/run-tests.mjs`:

```js
    "scripts/tests/rag/derivative-pdf-ocr-core.test.mjs",
    "scripts/tests/rag/ocr-derivative-pdf-cli.test.mjs",
    "scripts/tests/rag/mineru-precise-smoke-core.test.mjs",
```

- [ ] **Step 6: Run default suite**

Run:

```bash
node scripts/run-tests.mjs default
```

Expected includes:

```text
mineru precise smoke core tests passed
```

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git status --short
git add scripts/rag/mineru-precise-smoke-core.mjs scripts/tests/rag/mineru-precise-smoke-core.test.mjs scripts/run-tests.mjs
git commit -m "test: add mineru precise smoke helpers"
```

Expected staged files:

```text
scripts/rag/mineru-precise-smoke-core.mjs
scripts/tests/rag/mineru-precise-smoke-core.test.mjs
scripts/run-tests.mjs
```

Do not stage `.env.local`, `.nvmrc`, `artifacts/`, or `docs/reviews/`.

---

### Task 2: MinerU Precise Smoke CLI

**Files:**
- Create: `scripts/rag/mineru-precise-smoke.mjs`

**Interfaces:**
- Consumes from Task 1:
  - `readMineruToken(env)`
  - `buildMineruBatchPayload(input)`
  - `summarizeMineruBatchResult(result)`
  - `renderMineruSmokeReport(input)`
- Produces:
  - CLI command:
    `node scripts/rag/mineru-precise-smoke.mjs --input <pdf> --out <dir> [--page-ranges 1-2] [--model-version vlm]`
  - Local generated artifacts:
    - `<out>/request_payload.redacted.json`
    - `<out>/mineru_batch_result.json`
    - `<out>/mineru-result.zip`
    - `<out>/raw/`
    - `<out>/mineru_smoke_report.md`

- [ ] **Step 1: Create CLI script**

Create `scripts/rag/mineru-precise-smoke.mjs`:

```js
#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMineruBatchPayload,
  readMineruToken,
  renderMineruSmokeReport,
  summarizeMineruBatchResult,
} from "./mineru-precise-smoke-core.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_ENDPOINT = "https://mineru.net/api/v4/file-urls/batch";
const DEFAULT_OUT_DIR = "artifacts/rag/mineru-derivative-smoke";
const DEFAULT_PAGE_RANGES = "1-2";
const DEFAULT_MODEL_VERSION = "vlm";
const DEFAULT_LANGUAGE = "ch";
const COMMAND_TIMEOUT_MS = 60_000;

class CliUsageError extends Error {}

async function main() {
  loadDotEnvLocal();

  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (!args.input) {
    printHelp();
    process.exitCode = 2;
    return;
  }

  const tokenResult = readMineruToken(process.env);
  if (!tokenResult.ok) {
    throw new CliUsageError(tokenResult.error);
  }

  const inputPath = resolve(args.input);
  await assertFileExists(inputPath);

  const outDir = resolve(args.out ?? DEFAULT_OUT_DIR);
  const rawDir = join(outDir, "raw");
  await mkdir(rawDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const pageRanges = args.pageRanges ?? DEFAULT_PAGE_RANGES;
  const modelVersion = args.modelVersion ?? DEFAULT_MODEL_VERSION;
  const language = args.language ?? DEFAULT_LANGUAGE;
  const fileName = basename(inputPath);
  const warnings = [];

  const payload = buildMineruBatchPayload({
    fileName,
    pageRanges,
    modelVersion,
    language,
    isOcr: true,
    enableFormula: true,
    enableTable: true,
  });

  await writeFile(
    join(outDir, "request_payload.redacted.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
  );

  const uploadPlan = await requestUploadUrl({
    endpoint: args.endpoint ?? DEFAULT_ENDPOINT,
    token: tokenResult.token,
    payload,
  });
  const uploadTarget = uploadPlan?.data?.file_urls?.[0];
  const batchId = uploadPlan?.data?.batch_id;

  if (!uploadTarget || !batchId) {
    throw new Error("MinerU did not return batch_id and file upload URL.");
  }

  await uploadFileToMineru({ uploadUrl: uploadTarget, inputPath });

  const batchResult = await pollBatchResult({
    token: tokenResult.token,
    batchId,
    pollIntervalMs: args.pollIntervalMs ?? 5000,
    maxPolls: args.maxPolls ?? 60,
  });

  await writeFile(
    join(outDir, "mineru_batch_result.json"),
    `${JSON.stringify(batchResult.raw, null, 2)}\n`,
  );

  let downloadedZipPath = null;
  if (batchResult.extractedZipUrl) {
    downloadedZipPath = join(outDir, "mineru-result.zip");
    await downloadFile(batchResult.extractedZipUrl, downloadedZipPath);
    extractZip(downloadedZipPath, rawDir, warnings);
  } else {
    warnings.push("mineru_result_zip_unavailable");
  }

  const extractedFiles = listFilesWithFind(rawDir).map(relativeFromProject);
  const finishedAt = new Date().toISOString();
  await writeFile(
    join(outDir, "mineru_smoke_report.md"),
    `${renderMineruSmokeReport({
      inputFile: inputPath,
      pageRanges,
      modelVersion,
      language,
      startedAt,
      finishedAt,
      state: batchResult.state,
      outputDir: relativeFromProject(outDir),
      downloadedZipPath: downloadedZipPath
        ? relativeFromProject(downloadedZipPath)
        : null,
      extractedFiles,
      warnings,
    })}\n`,
  );

  console.log(`Wrote ${join(outDir, "mineru_smoke_report.md")}`);
  console.log(`State: ${batchResult.state}`);
  console.log(`Batch: ${batchId}`);
  if (warnings.length > 0) {
    console.log(`Warnings: ${[...new Set(warnings)].join(", ")}`);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--input") {
      args.input = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--out") {
      args.out = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--page-ranges") {
      args.pageRanges = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--model-version") {
      args.modelVersion = parseModelVersion(readOptionValue(argv, index, arg));
      index += 1;
    } else if (arg === "--language") {
      args.language = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--endpoint") {
      args.endpoint = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--poll-interval-ms") {
      args.pollIntervalMs = parsePositiveInteger(
        readOptionValue(argv, index, arg),
        "--poll-interval-ms",
      );
      index += 1;
    } else if (arg === "--max-polls") {
      args.maxPolls = parsePositiveInteger(
        readOptionValue(argv, index, arg),
        "--max-polls",
      );
      index += 1;
    } else {
      throw new CliUsageError(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new CliUsageError(`${optionName} requires a value`);
  }
  return value;
}

function parsePositiveInteger(value, optionName) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new CliUsageError(`${optionName} must be an integer >= 1`);
  }
  return parsedValue;
}

function parseModelVersion(value) {
  if (!["pipeline", "vlm"].includes(value)) {
    throw new CliUsageError("--model-version must be pipeline or vlm");
  }
  return value;
}

function printHelp() {
  console.log(`Usage:
  node scripts/rag/mineru-precise-smoke.mjs --input <pdf> [--out <dir>] [--page-ranges 1-2] [--model-version vlm]

This local-only smoke calls MinerU precise parsing and writes ignored artifacts.
MINERU_API_TOKEN must be configured in .env.local or process env.`);
}

function loadDotEnvLocal() {
  const envPath = resolve(".env.local");
  try {
    const text = readFileSyncUtf8(envPath);
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }
      const key = trimmed.slice(0, separatorIndex);
      const value = trimmed.slice(separatorIndex + 1);
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local is optional; readMineruToken reports the actionable error.
  }
}

function readFileSyncUtf8(filePath) {
  return spawnSync("cat", [filePath], {
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
  }).stdout;
}

async function assertFileExists(filePath) {
  try {
    await access(filePath);
  } catch {
    throw new CliUsageError(`input file not found: ${filePath}`);
  }
}

async function requestUploadUrl({ endpoint, token, payload }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "request_upload_url");
}

async function uploadFileToMineru({ uploadUrl, inputPath }) {
  const bytes = await readFile(inputPath);
  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: bytes,
  });
  if (!response.ok) {
    throw new Error(`upload_file_failed: HTTP ${response.status}`);
  }
}

async function pollBatchResult({ token, batchId, pollIntervalMs, maxPolls }) {
  const endpoint = `https://mineru.net/api/v4/extract-results/batch/${batchId}`;
  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const raw = await readJsonResponse(response, "poll_batch_result");
    const summary = summarizeMineruBatchResult(raw);
    if (summary.state === "done" || summary.state === "failed") {
      return summary;
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`mineru_poll_timeout: batch ${batchId}`);
}

async function readJsonResponse(response, stage) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${stage}: HTTP ${response.status}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${stage}: invalid_json`);
  }
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download_result_zip_failed: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, bytes);
}

function extractZip(zipPath, outputDir, warnings) {
  const unzip = spawnSync("unzip", ["-o", zipPath, "-d", outputDir], {
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (unzip.status === 0) {
    return;
  }

  const ditto = spawnSync("ditto", ["-x", "-k", zipPath, outputDir], {
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (ditto.status !== 0) {
    warnings.push("result_zip_extract_failed");
  }
}

function listFilesWithFind(dir) {
  const result = spawnSync("find", [dir, "-type", "f"], {
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout.split("\n").filter(Boolean).sort();
}

function relativeFromProject(filePath) {
  const absolute = resolve(filePath);
  return absolute.startsWith(projectRoot)
    ? absolute.slice(projectRoot.length + 1)
    : absolute;
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  console.error(error.message);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run help command**

Run:

```bash
node scripts/rag/mineru-precise-smoke.mjs --help
```

Expected:

```text
Usage:
  node scripts/rag/mineru-precise-smoke.mjs --input <pdf> ...
```

- [ ] **Step 3: Run no-token error check without printing token**

Run:

```bash
env -u MINERU_API_TOKEN node scripts/rag/mineru-precise-smoke.mjs --input /Users/kk/Documents/导数专题.pdf --out artifacts/rag/mineru-derivative-smoke --page-ranges 1-2
```

Expected if `.env.local` is absent or does not contain `MINERU_API_TOKEN`:

```text
Error: MINERU_API_TOKEN is required in local .env.local or process env.
```

If `.env.local` contains the token, this command may proceed to network. In that case stop it and use Step 4.

- [ ] **Step 4: Run real MinerU smoke on pages 1-2**

Run:

```bash
node scripts/rag/mineru-precise-smoke.mjs \
  --input /Users/kk/Documents/导数专题.pdf \
  --out artifacts/rag/mineru-derivative-smoke \
  --page-ranges 1-2 \
  --model-version vlm \
  --poll-interval-ms 5000 \
  --max-polls 60
```

Expected:

```text
Wrote .../mineru_smoke_report.md
State: done
Batch: <batch_id>
```

If MinerU returns `failed`, keep `mineru_batch_result.json` local and inspect `err_msg` without committing artifacts.

- [ ] **Step 5: Inspect generated artifacts without committing them**

Run:

```bash
node -e 'const fs=require("node:fs"); console.log(fs.readFileSync("artifacts/rag/mineru-derivative-smoke/mineru_smoke_report.md","utf8").split("\n").slice(0,120).join("\n"));'
find artifacts/rag/mineru-derivative-smoke/raw -maxdepth 3 -type f | sort | sed -n '1,80p'
```

Expected:

```text
# P2.0 MinerU 精准解析 Smoke 报告
- 状态：done
```

Also manually open the most useful Markdown/JSON result under `raw/` and inspect whether page 1-2 preserves:

```text
1. 题号
题干
A/B/C/D 选项
数学公式
左右页阅读顺序
```

- [ ] **Step 6: Commit Task 2 script only**

Run:

```bash
git status --short
git add scripts/rag/mineru-precise-smoke.mjs
git commit -m "feat: add mineru precise smoke script"
```

Expected staged file:

```text
scripts/rag/mineru-precise-smoke.mjs
```

Do not stage `.env.local`, `.nvmrc`, `artifacts/`, or `docs/reviews/`.

---

### Task 3: Documentation And Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md`

**Interfaces:**
- Consumes:
  - MinerU smoke artifacts under `artifacts/rag/mineru-derivative-smoke/`
  - `mineru_smoke_report.md`
- Produces:
  - Spec note describing MinerU as the first external OCR/document parser smoke path.

- [ ] **Step 1: Add spec note**

Append to `docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md`:

```md
## 14. MinerU Precise Parsing Smoke Note

The next provider validation step uses MinerU precise parsing as an external document parser smoke, gated behind local `MINERU_API_TOKEN`. The smoke script writes all provider results under `artifacts/rag/mineru-derivative-smoke/`, which stays ignored by Git.

This step only validates source quality. It does not write `practice_corpus`, does not update RAG retrieval, does not touch `memory_events` / `student_profiles`, and does not expose MinerU results to students.
```

- [ ] **Step 2: Verify artifacts remain ignored**

Run:

```bash
git check-ignore artifacts/rag/mineru-derivative-smoke/mineru_smoke_report.md
git check-ignore artifacts/rag/mineru-derivative-smoke/mineru_batch_result.json
```

Expected:

```text
artifacts/rag/mineru-derivative-smoke/mineru_smoke_report.md
artifacts/rag/mineru-derivative-smoke/mineru_batch_result.json
```

- [ ] **Step 3: Run project verification**

Run:

```bash
node scripts/tests/rag/mineru-precise-smoke-core.test.mjs
node scripts/run-tests.mjs default
npm run build
```

Expected:

```text
mineru precise smoke core tests passed
```

and default suite/build complete successfully.

- [ ] **Step 4: Final secret and scope check**

Run:

```bash
git status --short
git diff --name-only
git diff --cached --name-only
rg -n "eyJ|MINERU_API_TOKEN=.*[A-Za-z0-9_-]{20,}" docs scripts src app README.md interview --glob '!docs/reviews/**'
```

Expected:

```text
No token value appears in tracked files.
```

Expected changed tracked files are limited to:

```text
docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md
scripts/rag/mineru-precise-smoke-core.mjs
scripts/rag/mineru-precise-smoke.mjs
scripts/run-tests.mjs
scripts/tests/rag/mineru-precise-smoke-core.test.mjs
```

Do not stage `.env.local`, `.nvmrc`, `artifacts/`, or `docs/reviews/`.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md
git commit -m "docs: document mineru precise smoke boundary"
```

Expected staged file:

```text
docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md
```

---

## Plan Self-Review Checklist

- Spec coverage: covers token-safe MinerU precise API smoke, local artifacts, no frontend/database/RAG write, and provider quality inspection.
- Placeholder scan: no unresolved placeholder markers or unspecified implementation steps.
- Type consistency: helper function names in Task 2 match Task 1 exports.
- Scope check: one narrow smoke path only; provider comparison and `candidate_questions.json` mapping stay as follow-up tasks.
