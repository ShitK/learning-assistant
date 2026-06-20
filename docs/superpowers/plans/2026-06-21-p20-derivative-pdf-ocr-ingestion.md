# P2.0 Derivative PDF OCR Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline spike that turns the local scanned derivative PDF into a schema-valid candidate question extraction report without changing MathTrace diagnosis, profile memory, mistake book, or frontend behavior.

**Architecture:** Keep the spike under `scripts/rag/` and test pure extraction helpers independently from PDF/OCR binaries. The executable script renders pages with poppler, splits each scanned page into left/right book-page images, runs an optional local OCR command when available, then emits `candidate_questions.json` and `extraction_report.md` under a local ignored `artifacts/` directory. OCR output remains an untrusted candidate layer; no candidate becomes a student-visible practice item in this task.

**Tech Stack:** Node.js ESM scripts, built-in `node:child_process`, `node:crypto`, `node:fs/promises`, `node:path`, existing `scripts/run-tests.mjs`, bundled poppler binaries when available, optional local `tesseract`.

## Global Constraints

- Do not modify `/api/diagnose`, `/api/confirm`, `/api/student-profile`, `/api/student-profile/evidence`, `memory_events`, `student_profiles`, mistake book behavior, or frontend components.
- Do not add pgvector, Milvus, embeddings, Supabase tables, runtime upload, or frontend RAG.
- Do not commit `/Users/kk/Documents/导数专题.pdf` or generated page images/OCR artifacts.
- Treat all OCR text as untrusted candidate data requiring manual review.
- Use `scripts/rag/` for offline tooling; do not add a new `src/lib/rag` runtime domain in this task.
- Keep `docs/reviews/*.md` local-only unless the user explicitly asks to commit one.
- Preserve the existing user-modified `.nvmrc`; do not stage it unless explicitly requested.

---

## File Structure

- Create `scripts/rag/derivative-pdf-ocr-core.mjs`
  - Pure helper module for normalizing OCR lines, splitting question candidates, assigning extraction confidence, building extraction payloads, and rendering Markdown reports.
- Create `scripts/rag/ocr-derivative-pdf.mjs`
  - CLI wrapper for one local PDF path; owns filesystem, poppler command calls, optional OCR command calls, artifact paths, and writing outputs.
- Create `scripts/tests/rag/derivative-pdf-ocr-core.test.mjs`
  - Unit tests for the pure helper module. Does not require the real PDF or OCR binary.
- Modify `scripts/run-tests.mjs`
  - Adds the RAG helper test to the default suite.
- Modify `.gitignore`
  - Ignores generated `artifacts/` output.
- Modify `docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md`
  - Adds a short implementation note after the plan is complete, only if the implemented command or output path differs from the spec.
- Optional later manual artifact, not committed:
  - `artifacts/rag/derivative-pdf-spike/candidate_questions.json`
  - `artifacts/rag/derivative-pdf-spike/extraction_report.md`

---

### Task 1: Pure OCR Candidate Extraction Helpers

**Files:**
- Create: `scripts/rag/derivative-pdf-ocr-core.mjs`
- Create: `scripts/tests/rag/derivative-pdf-ocr-core.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes:
  - OCR text as a string.
  - Source metadata object with `{ sourceFile, sourceFileSha256, extractedAt, pageCount }`.
  - Page OCR records with `{ pdfPageIndex, bookPageLabel, side, cropImagePath, ocrText, warnings }`.
- Produces:
  - `normalizeOcrText(text: string): string`
  - `splitQuestionCandidates(pageRecord: PageOcrRecord): CandidateQuestion[]`
  - `buildCandidateExtraction(input: CandidateExtractionInput): CandidateQuestionExtraction`
  - `renderExtractionReport(extraction: CandidateQuestionExtraction): string`

- [ ] **Step 1: Create failing unit tests for OCR normalization and question splitting**

Create `scripts/tests/rag/derivative-pdf-ocr-core.test.mjs`:

```js
import assert from "node:assert/strict";

import {
  buildCandidateExtraction,
  normalizeOcrText,
  renderExtractionReport,
  splitQuestionCandidates,
} from "../../rag/derivative-pdf-ocr-core.mjs";

const pageRecord = {
  pdfPageIndex: 1,
  bookPageLabel: "21",
  side: "left",
  cropImagePath: "artifacts/rag/derivative-pdf-spike/page-slices/page-001-left.png",
  ocrText: `
    1.（山东潍坊素养测评）设 f(x) 为 R 上的可导函数，且 lim ...
    A. 2    B. -1    C. 1    D. -1/2

    2.（天津模拟）已知函数 f(x)=ln x / x^2，f'(x) 为 f(x) 的导函数，则 f'(x)=
    A. ln x / x^3    B. 1 / x^3    C. (1-ln x)/x^3    D. (1-2ln x)/x^3

    考点 2 导数与函数的单调性

    12.（浙江宁波十校）若函数 f(x)=a^x+b^x 在 (0,+∞) 上单调递增，则 a 和 b 的可能取值为
  `,
  warnings: [],
};

assert.equal(
  normalizeOcrText("  1.  题干\\r\\n\\r\\nA. 选项  "),
  "1. 题干\\nA. 选项",
);

{
  const candidates = splitQuestionCandidates(pageRecord);

  assert.equal(candidates.length, 3);
  assert.equal(candidates[0].id, "pdf-page-001-left-q-1");
  assert.equal(candidates[0].source_ref.pdf_page_index, 1);
  assert.equal(candidates[0].source_ref.book_page_label, "21");
  assert.equal(candidates[0].source_ref.side, "left");
  assert.equal(candidates[0].question_number, "1");
  assert.equal(candidates[0].raw_ocr_text.includes("山东潍坊"), true);
  assert.equal(candidates[0].normalized_text.startsWith("1."), true);
  assert.equal(candidates[0].answer_or_solution_candidate, null);
  assert.equal(candidates[0].extraction_confidence, "high");

  assert.equal(candidates[1].question_number, "2");
  assert.equal(candidates[1].extraction_confidence, "high");

  assert.equal(candidates[2].question_number, "12");
  assert.equal(candidates[2].warnings.includes("missing_options_or_solution"), true);
  assert.equal(candidates[2].extraction_confidence, "medium");
}

{
  const candidates = splitQuestionCandidates({
    ...pageRecord,
    ocrText: "命题点\\n本专题主要考查导数的概念。\\n没有可稳定切分的题号。",
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].question_number, null);
  assert.equal(candidates[0].id, "pdf-page-001-left-chunk-001");
  assert.equal(candidates[0].warnings.includes("question_split_failed"), true);
  assert.equal(candidates[0].extraction_confidence, "low");
}

{
  const extraction = buildCandidateExtraction({
    sourceFile: "/Users/kk/Documents/导数专题.pdf",
    sourceFileSha256: "abc123",
    extractedAt: "2026-06-21T00:00:00.000Z",
    pageCount: 8,
    pageRecords: [pageRecord],
    warnings: ["ocr_tool_unavailable"],
  });

  assert.equal(extraction.source_file, "/Users/kk/Documents/导数专题.pdf");
  assert.equal(extraction.source_file_sha256, "abc123");
  assert.equal(extraction.page_count, 8);
  assert.equal(extraction.candidates.length, 3);
  assert.equal(extraction.warnings.includes("ocr_tool_unavailable"), true);

  const report = renderExtractionReport(extraction);
  assert.equal(report.includes("# P2.0 导数扫描 PDF OCR 入库报告"), true);
  assert.equal(report.includes("- PDF 页数：8"), true);
  assert.equal(report.includes("- 候选题数量：3"), true);
  assert.equal(report.includes("ocr_tool_unavailable"), true);
}

console.log("derivative pdf ocr core tests passed");
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
node scripts/tests/rag/derivative-pdf-ocr-core.test.mjs
```

Expected:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module ... scripts/rag/derivative-pdf-ocr-core.mjs
```

- [ ] **Step 3: Add the pure helper implementation**

Create `scripts/rag/derivative-pdf-ocr-core.mjs`:

```js
const QUESTION_NUMBER_PATTERN = /(?:^|\n)\s*(\d{1,3})[.．、]\s*/g;

export function normalizeOcrText(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function splitQuestionCandidates(pageRecord) {
  const normalizedText = normalizeOcrText(pageRecord.ocrText);
  if (!normalizedText) {
    return [
      createCandidate({
        pageRecord,
        questionNumber: null,
        sequence: 1,
        text: "",
        idSuffix: "chunk-001",
        warnings: ["empty_ocr_text", "question_split_failed"],
      }),
    ];
  }

  const matches = [...normalizedText.matchAll(QUESTION_NUMBER_PATTERN)];
  if (matches.length === 0) {
    return [
      createCandidate({
        pageRecord,
        questionNumber: null,
        sequence: 1,
        text: normalizedText,
        idSuffix: "chunk-001",
        warnings: ["question_split_failed"],
      }),
    ];
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? normalizedText.length;
    const text = normalizedText.slice(start, end).trim();
    const questionNumber = match[1] ?? null;

    return createCandidate({
      pageRecord,
      questionNumber,
      sequence: index + 1,
      text,
      idSuffix: `q-${questionNumber}`,
      warnings: createCandidateWarnings(text),
    });
  });
}

export function buildCandidateExtraction(input) {
  const candidates = input.pageRecords.flatMap(splitQuestionCandidates);

  return {
    source_file: input.sourceFile,
    source_file_sha256: input.sourceFileSha256,
    extracted_at: input.extractedAt,
    page_count: input.pageCount,
    candidates,
    warnings: uniqueStrings(input.warnings),
  };
}

export function renderExtractionReport(extraction) {
  const confidenceCounts = countBy(
    extraction.candidates.map((candidate) => candidate.extraction_confidence),
  );
  const lowConfidenceCandidates = extraction.candidates.filter(
    (candidate) => candidate.extraction_confidence === "low",
  );

  return [
    "# P2.0 导数扫描 PDF OCR 入库报告",
    "",
    "## 输入",
    "",
    `- 文件：${extraction.source_file}`,
    `- SHA256：${extraction.source_file_sha256}`,
    `- PDF 页数：${extraction.page_count}`,
    `- 抽取时间：${extraction.extracted_at}`,
    "",
    "## 结果",
    "",
    `- 候选题数量：${extraction.candidates.length}`,
    `- 高置信度：${confidenceCounts.high ?? 0}`,
    `- 中置信度：${confidenceCounts.medium ?? 0}`,
    `- 低置信度：${confidenceCounts.low ?? 0}`,
    "",
    "## 全局 Warnings",
    "",
    ...formatList(extraction.warnings),
    "",
    "## 低置信度候选",
    "",
    ...formatList(
      lowConfidenceCandidates.map((candidate) => {
        return `${candidate.id}: ${candidate.warnings.join(", ")}`;
      }),
    ),
    "",
    "## 建议",
    "",
    "- 先人工审核高置信度候选题中的 10-15 道，再进入 practice_corpus。",
    "- OCR 公式、上下标、根号、分式和参数范围必须人工校对。",
    "- 未经人工审核的候选题不得进入学生可见变式练习。",
    "",
  ].join("\n");
}

function createCandidate({
  pageRecord,
  questionNumber,
  sequence,
  text,
  idSuffix,
  warnings,
}) {
  const allWarnings = uniqueStrings([
    ...(pageRecord.warnings ?? []),
    ...warnings,
  ]);

  return {
    id: `pdf-page-${String(pageRecord.pdfPageIndex).padStart(3, "0")}-${pageRecord.side}-${idSuffix}`,
    source_ref: {
      pdf_page_index: pageRecord.pdfPageIndex,
      book_page_label: pageRecord.bookPageLabel ?? null,
      side: pageRecord.side,
      crop_image_path: pageRecord.cropImagePath ?? null,
    },
    question_number: questionNumber,
    raw_ocr_text: text,
    normalized_text: normalizeOcrText(text),
    answer_or_solution_candidate: null,
    extraction_confidence: determineConfidence(text, allWarnings, sequence),
    warnings: allWarnings,
  };
}

function createCandidateWarnings(text) {
  const warnings = [];
  if (!/[A-D][.．、]/.test(text) && !/[（(]\d+[）)]/.test(text)) {
    warnings.push("missing_options_or_solution");
  }
  if (text.length < 20) {
    warnings.push("short_candidate_text");
  }
  return warnings;
}

function determineConfidence(text, warnings) {
  if (!text.trim() || warnings.includes("question_split_failed")) {
    return "low";
  }
  if (warnings.includes("short_candidate_text")) {
    return "low";
  }
  if (warnings.includes("missing_options_or_solution")) {
    return "medium";
  }
  return "high";
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function formatList(items) {
  if (items.length === 0) {
    return ["- 无"];
  }
  return items.map((item) => `- ${item}`);
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}
```

- [ ] **Step 4: Run the helper test and fix only this module if needed**

Run:

```bash
node scripts/tests/rag/derivative-pdf-ocr-core.test.mjs
```

Expected:

```text
derivative pdf ocr core tests passed
```

- [ ] **Step 5: Add the RAG helper test to the default suite**

Modify `scripts/run-tests.mjs` by inserting the new test after the architecture test:

```js
const suites = {
  default: [
    "scripts/tests/architecture/architecture-boundaries.test.mjs",
    "scripts/tests/rag/derivative-pdf-ocr-core.test.mjs",
    "scripts/tests/image-diagnosis/vision-extraction-parser.test.mjs",
```

- [ ] **Step 6: Run the default suite entry point enough to verify registration**

Run:

```bash
node scripts/run-tests.mjs default
```

Expected:

```text
derivative pdf ocr core tests passed
```

and the existing default suite continues until completion. If an unrelated pre-existing test fails, stop and record the exact failing test before changing anything outside this task.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git status --short
git add scripts/rag/derivative-pdf-ocr-core.mjs scripts/tests/rag/derivative-pdf-ocr-core.test.mjs scripts/run-tests.mjs
git commit -m "test: add derivative pdf ocr extraction helpers"
```

Expected staged files:

```text
scripts/rag/derivative-pdf-ocr-core.mjs
scripts/tests/rag/derivative-pdf-ocr-core.test.mjs
scripts/run-tests.mjs
```

Do not stage `.nvmrc` or generated artifacts.

---

### Task 2: Offline PDF OCR Ingestion CLI

**Files:**
- Create: `scripts/rag/ocr-derivative-pdf.mjs`
- Test indirectly with:
  - `node scripts/rag/ocr-derivative-pdf.mjs --help`
  - `node scripts/rag/ocr-derivative-pdf.mjs --input /Users/kk/Documents/导数专题.pdf --out artifacts/rag/derivative-pdf-spike --max-pages 2`

**Interfaces:**
- Consumes:
  - `buildCandidateExtraction(input)` from `scripts/rag/derivative-pdf-ocr-core.mjs`
  - `renderExtractionReport(extraction)` from `scripts/rag/derivative-pdf-ocr-core.mjs`
- Produces:
  - CLI command `node scripts/rag/ocr-derivative-pdf.mjs --input <pdf> --out <dir> [--max-pages N] [--ocr-command tesseract]`
  - Local artifact files:
    - `<out>/candidate_questions.json`
    - `<out>/extraction_report.md`
    - `<out>/pages/*.png`
    - `<out>/page-slices/*.png`

- [ ] **Step 1: Create the CLI script with help, argument parsing, and tool detection**

Create `scripts/rag/ocr-derivative-pdf.mjs`:

```js
#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCandidateExtraction,
  renderExtractionReport,
} from "./derivative-pdf-ocr-core.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_POPPLER_BIN = join(
  process.env.CODEX_POPPLER_BIN ?? "",
);
const BUNDLED_POPPLER_BIN = "/Users/kk/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin";
const DEFAULT_DPI = 180;

async function main() {
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

  const inputPath = resolve(args.input);
  const outDir = resolve(args.out ?? "artifacts/rag/derivative-pdf-spike");
  const pagesDir = join(outDir, "pages");
  const slicesDir = join(outDir, "page-slices");
  const warnings = [];

  await mkdir(pagesDir, { recursive: true });
  await mkdir(slicesDir, { recursive: true });

  const sourceFileSha256 = await sha256File(inputPath);
  const pdfInfo = readPdfInfo(inputPath, warnings);
  const pageCount = pdfInfo.pages ?? 0;
  const maxPages = Math.min(args.maxPages ?? pageCount, pageCount);

  const renderedPages = renderPages({
    inputPath,
    pagesDir,
    maxPages,
    dpi: args.dpi ?? DEFAULT_DPI,
    warnings,
  });

  const pageRecords = [];
  for (const renderedPage of renderedPages) {
    const slices = splitRenderedPage({
      renderedPage,
      slicesDir,
      warnings,
    });

    for (const slice of slices) {
      const ocr = runOcr({
        imagePath: slice.path,
        ocrCommand: args.ocrCommand ?? "tesseract",
      });
      if (!ocr.ok) {
        warnings.push(ocr.warning);
      }

      pageRecords.push({
        pdfPageIndex: renderedPage.pdfPageIndex,
        bookPageLabel: null,
        side: slice.side,
        cropImagePath: relativeFromProject(slice.path),
        ocrText: ocr.text,
        warnings: ocr.ok ? [] : [ocr.warning],
      });
    }
  }

  const extraction = buildCandidateExtraction({
    sourceFile: inputPath,
    sourceFileSha256,
    extractedAt: new Date().toISOString(),
    pageCount,
    pageRecords,
    warnings,
  });

  await writeFile(
    join(outDir, "candidate_questions.json"),
    `${JSON.stringify(extraction, null, 2)}\n`,
  );
  await writeFile(
    join(outDir, "extraction_report.md"),
    renderExtractionReport(extraction),
  );

  console.log(`Wrote ${join(outDir, "candidate_questions.json")}`);
  console.log(`Wrote ${join(outDir, "extraction_report.md")}`);
  console.log(`Candidates: ${extraction.candidates.length}`);
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
      args.input = argv[++index];
    } else if (arg === "--out") {
      args.out = argv[++index];
    } else if (arg === "--max-pages") {
      args.maxPages = Number(argv[++index]);
    } else if (arg === "--dpi") {
      args.dpi = Number(argv[++index]);
    } else if (arg === "--ocr-command") {
      args.ocrCommand = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/rag/ocr-derivative-pdf.mjs --input <pdf> [--out <dir>] [--max-pages 2] [--dpi 180] [--ocr-command tesseract]

This offline spike renders a scanned derivative PDF and emits candidate question artifacts.
Generated artifacts are local-only and must not be committed.`);
}

async function sha256File(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

function readPdfInfo(inputPath, warnings) {
  const pdfinfo = findBinary("pdfinfo");
  if (!pdfinfo) {
    warnings.push("pdfinfo_unavailable");
    return { pages: 0 };
  }

  const result = spawnSync(pdfinfo, [inputPath], { encoding: "utf8" });
  if (result.status !== 0) {
    warnings.push("pdfinfo_failed");
    return { pages: 0 };
  }

  const pagesMatch = result.stdout.match(/^Pages:\s+(\d+)/m);
  return {
    pages: pagesMatch ? Number(pagesMatch[1]) : 0,
  };
}

function renderPages({ inputPath, pagesDir, maxPages, dpi, warnings }) {
  const pdftoppm = findBinary("pdftoppm");
  if (!pdftoppm) {
    warnings.push("pdftoppm_unavailable");
    return [];
  }

  const outputPrefix = join(pagesDir, "page");
  const result = spawnSync(
    pdftoppm,
    ["-f", "1", "-l", String(maxPages), "-png", "-r", String(dpi), inputPath, outputPrefix],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    warnings.push("pdftoppm_failed");
    return [];
  }

  return Array.from({ length: maxPages }, (_, index) => ({
    pdfPageIndex: index + 1,
    path: `${outputPrefix}-${index + 1}.png`,
  }));
}

function splitRenderedPage({ renderedPage, slicesDir, warnings }) {
  const dimensions = readPngDimensions(renderedPage.path);
  if (!dimensions || !findExecutableInPath("sips")) {
    warnings.push("page_slice_fallback_full_page");
    return [
      {
        side: "full",
        path: renderedPage.path,
      },
    ];
  }

  const halfWidth = Math.floor(dimensions.width / 2);
  const leftPath = join(
    slicesDir,
    `page-${String(renderedPage.pdfPageIndex).padStart(3, "0")}-left.png`,
  );
  const rightPath = join(
    slicesDir,
    `page-${String(renderedPage.pdfPageIndex).padStart(3, "0")}-right.png`,
  );
  const leftOk = cropWithSips({
    inputPath: renderedPage.path,
    outputPath: leftPath,
    height: dimensions.height,
    width: halfWidth,
    offsetX: -Math.floor(dimensions.width / 4),
  });
  const rightOk = cropWithSips({
    inputPath: renderedPage.path,
    outputPath: rightPath,
    height: dimensions.height,
    width: dimensions.width - halfWidth,
    offsetX: Math.floor(dimensions.width / 4),
  });

  if (!leftOk || !rightOk) {
    warnings.push("page_slice_fallback_full_page");
    return [
      {
        side: "full",
        path: renderedPage.path,
      },
    ];
  }

  return [
    { side: "left", path: leftPath },
    { side: "right", path: rightPath },
  ];
}

function readPngDimensions(imagePath) {
  const result = spawnSync(
    "sips",
    ["-g", "pixelWidth", "-g", "pixelHeight", imagePath],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    return null;
  }

  const widthMatch = result.stdout.match(/pixelWidth:\s+(\d+)/);
  const heightMatch = result.stdout.match(/pixelHeight:\s+(\d+)/);
  if (!widthMatch || !heightMatch) {
    return null;
  }

  return {
    width: Number(widthMatch[1]),
    height: Number(heightMatch[1]),
  };
}

function cropWithSips({ inputPath, outputPath, height, width, offsetX }) {
  const result = spawnSync(
    "sips",
    [
      "-c",
      String(height),
      String(width),
      "--cropOffset",
      "0",
      String(offsetX),
      inputPath,
      "--out",
      outputPath,
    ],
    { encoding: "utf8" },
  );

  return result.status === 0;
}

function runOcr({ imagePath, ocrCommand }) {
  if (!findExecutableInPath(ocrCommand)) {
    return {
      ok: false,
      text: "",
      warning: "ocr_tool_unavailable",
    };
  }

  const result = spawnSync(ocrCommand, [imagePath, "stdout", "-l", "chi_sim+eng"], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return {
      ok: false,
      text: "",
      warning: "ocr_failed",
    };
  }

  return {
    ok: true,
    text: result.stdout,
  };
}

function findBinary(name) {
  const bundled = join(BUNDLED_POPPLER_BIN, name);
  if (findExecutableInPath(bundled)) {
    return bundled;
  }
  if (DEFAULT_POPPLER_BIN && findExecutableInPath(join(DEFAULT_POPPLER_BIN, name))) {
    return join(DEFAULT_POPPLER_BIN, name);
  }
  return findExecutableInPath(name) ? name : null;
}

function findExecutableInPath(command) {
  const result = spawnSync("which", [command], { encoding: "utf8" });
  return result.status === 0;
}

function relativeFromProject(filePath) {
  const absolute = resolve(filePath);
  return absolute.startsWith(projectRoot)
    ? absolute.slice(projectRoot.length + 1)
    : absolute;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Run the help command**

Run:

```bash
node scripts/rag/ocr-derivative-pdf.mjs --help
```

Expected:

```text
Usage:
  node scripts/rag/ocr-derivative-pdf.mjs --input <pdf> ...
```

- [ ] **Step 3: Run the script on the real local PDF with only two pages**

Run:

```bash
node scripts/rag/ocr-derivative-pdf.mjs \
  --input /Users/kk/Documents/导数专题.pdf \
  --out artifacts/rag/derivative-pdf-spike \
  --max-pages 2
```

Expected in the current environment if `tesseract` is not installed:

```text
Wrote .../candidate_questions.json
Wrote .../extraction_report.md
Candidates: 4
Warnings: ..., ocr_tool_unavailable
```

This is acceptable for Task 2 because the script must make OCR availability explicit rather than failing silently. If `tesseract` is installed locally, the expected candidate count may be higher because question-number splitting can run on OCR text. If `sips` cropping fails, `page_slice_fallback_full_page` should appear and the script should still emit schema-valid artifacts.

- [ ] **Step 4: Inspect generated local artifacts without committing them**

Run:

```bash
node --input-type=module -e 'import data from "./artifacts/rag/derivative-pdf-spike/candidate_questions.json" with { type: "json" }; console.log({ page_count: data.page_count, candidates: data.candidates.length, warnings: data.warnings });'
sed -n '1,120p' artifacts/rag/derivative-pdf-spike/extraction_report.md
```

Expected:

```text
{ page_count: 8, candidates: 4, warnings: [...] }
# P2.0 导数扫描 PDF OCR 入库报告
```

If OCR is available, verify at least one candidate has non-empty `raw_ocr_text`. If OCR is unavailable, verify `ocr_tool_unavailable` appears in both JSON warnings and the report.

- [ ] **Step 5: Commit Task 2 script only**

Run:

```bash
git status --short
git add scripts/rag/ocr-derivative-pdf.mjs
git commit -m "feat: add derivative pdf ocr ingestion script"
```

Expected staged file:

```text
scripts/rag/ocr-derivative-pdf.mjs
```

Do not stage `artifacts/`, `.nvmrc`, or the original PDF.

---

### Task 3: Artifact Ignore Rules, Documentation Notes, And Verification

**Files:**
- Modify: `.gitignore`
- Modify: `docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md`

**Interfaces:**
- Consumes:
  - CLI command from Task 2.
  - Local artifact path `artifacts/rag/derivative-pdf-spike/`.
- Produces:
  - `.gitignore` rule for `artifacts/`.
  - Spec note with actual command and current OCR environment result.

- [ ] **Step 1: Ignore generated local artifacts**

Modify `.gitignore` by adding this block after the `# testing` section:

```gitignore

# local generated artifacts
/artifacts/
```

- [ ] **Step 2: Add implementation note to the P2.0 spec**

Append this section to `docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md`:

```md
## 13. Implementation Plan Note

Implementation will start with `scripts/rag/ocr-derivative-pdf.mjs` and pure helpers in `scripts/rag/derivative-pdf-ocr-core.mjs`. Generated outputs live under `artifacts/rag/derivative-pdf-spike/` and are ignored by Git.

The first implementation pass must support an OCR-unavailable environment by still producing a schema-valid `candidate_questions.json` and `extraction_report.md` with `ocr_tool_unavailable` warnings. Real OCR quality evaluation can happen after a local OCR engine such as `tesseract` is installed or another OCR path is explicitly chosen.
```

- [ ] **Step 3: Verify no generated artifacts are tracked**

Run:

```bash
git status --short
git check-ignore artifacts/rag/derivative-pdf-spike/candidate_questions.json
git check-ignore artifacts/rag/derivative-pdf-spike/extraction_report.md
```

Expected:

```text
artifacts/rag/derivative-pdf-spike/candidate_questions.json
artifacts/rag/derivative-pdf-spike/extraction_report.md
```

If `git status --short` still shows files under `artifacts/`, fix `.gitignore` before continuing.

- [ ] **Step 4: Run focused and project verification**

Run:

```bash
node scripts/tests/rag/derivative-pdf-ocr-core.test.mjs
node scripts/run-tests.mjs default
npm run build
```

Expected:

```text
derivative pdf ocr core tests passed
```

and the default suite/build complete successfully. If `npm run build` fails due to unrelated existing environment issues, capture the exact error and stop before changing unrelated files.

- [ ] **Step 5: Final scope check before review**

Run:

```bash
git status --short
git diff --stat
git diff --name-only
```

Expected tracked changes should be limited to:

```text
.gitignore
docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md
scripts/rag/derivative-pdf-ocr-core.mjs
scripts/rag/ocr-derivative-pdf.mjs
scripts/run-tests.mjs
scripts/tests/rag/derivative-pdf-ocr-core.test.mjs
```

Expected untracked/ignored generated artifacts may exist under:

```text
artifacts/rag/derivative-pdf-spike/
```

Do not stage `.nvmrc`, `docs/reviews/*.md`, original PDFs, or generated artifacts.

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git add .gitignore docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md
git commit -m "docs: document derivative pdf ocr spike workflow"
```

Expected staged files:

```text
.gitignore
docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md
```

---

## Plan Self-Review Checklist

- Spec coverage:
  - PDF render covered by Task 2.
  - OCR availability and warnings covered by Task 2.
  - Question chunking covered by Task 1.
  - Candidate JSON and report covered by Tasks 1 and 2.
  - Artifact non-commit boundary covered by Task 3.
  - No frontend, pgvector, Supabase, or profile changes are included.
- Placeholder scan:
  - No open implementation placeholders should remain.
- Type consistency:
  - `CandidateQuestionExtraction`, `CandidateQuestion`, `source_ref`, `raw_ocr_text`, `normalized_text`, `answer_or_solution_candidate`, `extraction_confidence`, and `warnings` match the design spec.
- Review handoff:
  - Claude Code should review this plan before implementation, especially the Task 2 OCR-unavailable behavior and whether full-page slicing is acceptable for the first pass.
