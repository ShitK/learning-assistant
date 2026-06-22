# P2.0 Candidate Question Review UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local static review UI that turns ignored `candidate_questions.json` artifacts into a browser-based manual review flow and exports `reviewed_practice_seed.json`.

**Architecture:** Add an offline generator under `scripts/rag/` that reads candidate extraction JSON, validates a minimal schema, renders a self-contained `index.html` under ignored `artifacts/rag/candidate-review/`, and writes a small manifest. The generated page stores review status in browser `localStorage` and exports approved candidates as a downloaded/copied JSON seed. This remains a local review tool and does not touch the MathTrace product frontend, APIs, database, pgvector, or memory/profile systems.

**Tech Stack:** Node.js ESM scripts, built-in `node:fs/promises`, `node:path`, `node:crypto`, existing `katex` dependency plus inlined `katex/dist/katex.min.css`, browser `localStorage`, browser `Blob` download, clipboard fallback UI, existing `scripts/run-tests.mjs`.

## Global Constraints

- Do not modify `src/app/**`, `src/components/**`, `app/api/**`, frontend product routes, diagnosis pipeline, persistence, Supabase schema, `memory_events`, `student_profiles`, mistake book behavior, evidence API, pgvector, embedding, metadata/text search, or `practice_corpus`.
- Do not commit real `candidate_questions.json`, `reviewed_practice_seed.json`, generated HTML, PDF, MinerU JSON, page images, ZIP files, or anything under `artifacts/`.
- Do not read or print `.env.local`, `MINERU_API_TOKEN`, service role keys, or external API credentials.
- Treat candidate questions as untrusted OCR/parser output requiring manual review.
- The generated review page is a local artifact only; it is not a student-facing or admin-facing product feature.
- Browser review state must use `localStorage`; static HTML must not pretend it can write directly back to the repository.
- Preserve the existing user-modified `.nvmrc`; do not stage it unless explicitly requested.
- `docs/reviews/*.md` remains local-only unless the user explicitly asks to commit a review file.
- Keep `sample_diagnosis` stable and untouched.

---

## File Structure

- Create `scripts/rag/candidate-review-ui-core.mjs`
  - Pure helper module for candidate extraction validation, review data preparation, math HTML rendering, manifest construction, export seed construction, and static HTML rendering.
- Create `scripts/rag/build-candidate-review-ui.mjs`
  - CLI wrapper. Reads local `candidate_questions.json`, writes `index.html` and `review_manifest.json` under ignored `artifacts/rag/candidate-review/`, and prints only output paths plus summary counts.
- Create `scripts/tests/rag/candidate-review-ui-core.test.mjs`
  - Pure tests with fake candidate data. No real教辅题文, no artifacts, no browser.
- Create `scripts/tests/rag/candidate-review-ui-cli.test.mjs`
  - CLI tests using temp fixture JSON. Verifies output files, error paths, artifact-free stdout, and no token/env access.
- Modify `scripts/run-tests.mjs`
  - Add both tests to the default suite near other RAG tests.
- Optional local artifact, not committed:
  - `artifacts/rag/candidate-review/index.html`
  - `artifacts/rag/candidate-review/review_manifest.json`
  - user-downloaded `reviewed_practice_seed.json`

## Data Contracts

### Review App Data

```js
{
  app_version: "candidate-review-ui-v1",
  candidate_source_file: "/absolute/path/candidate_questions.json",
  candidate_source_sha256: "hex",
  generated_at: "2026-06-22T00:00:00.000Z",
  storage_key: "mathtrace.candidateReview.<sha256-prefix>",
  extraction: {
    source_file: "...",
    mineru_json_file: "...",
    page_count: 8,
    warnings: []
  },
  candidates: [
    {
      id: "mineru-page-001-block-011-q-1",
      question_number: "1",
      section_title: "考点 1 导数的概念、几何意义与运算",
      normalized_text: "1. ... $f(x)$ ...",
      rendered_html: "escaped and math-rendered html",
      extraction_confidence: "high",
      warnings: [],
      source_ref: {}
    }
  ]
}
```

### Browser Review State

```js
{
  candidate_id: {
    status: "approved" | "needs_fix" | "skipped",
    note: "人工备注",
    updated_at: "2026-06-22T00:00:00.000Z"
  }
}
```

### Exported Seed

```js
{
  exported_at: "2026-06-22T00:00:00.000Z",
  source_candidate_file: "/absolute/path/candidate_questions.json",
  source_file: "导数专题.pdf",
  mineru_json_file: "artifacts/rag/MinerU-test/导数专题.json",
  approved_count: 2,
  items: [
    {
      id: "mineru-page-001-block-011-q-1",
      candidate_id: "mineru-page-001-block-011-q-1",
      review_status: "reviewed",
      reviewer_note: "",
      question_text: "1. ...",
      solution_outline: null,
      mistake_causes: [],
      knowledge_points: ["导数", "考点 1 导数的概念、几何意义与运算"],
      difficulty: null,
      variant_level: null,
      source_ref: {},
      original_extraction_confidence: "high",
      original_warnings: []
    }
  ]
}
```

---

### Task 1: Pure Candidate Review UI Helpers

**Files:**
- Create: `scripts/rag/candidate-review-ui-core.mjs`
- Create: `scripts/tests/rag/candidate-review-ui-core.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes:
  - Candidate extraction JSON parsed as `unknown`.
  - Source metadata `{ candidateSourceFile, candidateSourceSha256, generatedAt }`.
- Produces:
  - `validateCandidateExtraction(value: unknown): { ok: true, extraction: CandidateQuestionExtraction } | { ok: false, errors: string[] }`
  - `renderMathTextToHtml(text: string): { html: string, warnings: string[] }`
  - `buildReviewAppData(input): ReviewAppData`
  - `buildReviewManifest(appData: ReviewAppData): object`
  - `buildReviewedPracticeSeed(input): ReviewedPracticeSeedExport`
  - `renderCandidateReviewHtml(appData: ReviewAppData, input: { katexCss: string }): string`

- [ ] **Step 1: Write failing core tests**

Create `scripts/tests/rag/candidate-review-ui-core.test.mjs`:

```js
import assert from "node:assert/strict";

import {
  buildReviewAppData,
  buildReviewedPracticeSeed,
  buildReviewManifest,
  renderCandidateReviewHtml,
  renderMathTextToHtml,
  validateCandidateExtraction,
} from "../../rag/candidate-review-ui-core.mjs";

const extraction = {
  source_file: "/Users/kk/Documents/导数专题.pdf",
  source_file_sha256: "source123",
  mineru_json_file: "/Users/kk/learning-assistant/artifacts/rag/MinerU-test/导数专题.json",
  mineru_json_sha256: "json123",
  extractor: "mineru-json-candidate-mapper",
  extracted_at: "2026-06-22T00:00:00.000Z",
  page_count: 8,
  candidates: [
    {
      id: "candidate-1",
      source_ref: {
        pdf_page_index: 1,
        book_page_label: null,
        side: "full",
        block_start_index: 11,
        block_start_bbox: [10, 20, 100, 40],
        block_end_pdf_page_index: 1,
        block_end_index: 14,
        block_end_bbox: [10, 80, 100, 120],
        section_title: "考点 1 导数的概念、几何意义与运算",
        crop_image_path: null,
      },
      question_number: "1",
      raw_ocr_text: "1. 已知 $f(x)$, 则()",
      normalized_text: "1. 已知 $f(x)$, 则()\nA. 1\nB. 2",
      answer_or_solution_candidate: null,
      extraction_confidence: "high",
      warnings: [],
    },
    {
      id: "candidate-2",
      source_ref: {
        pdf_page_index: 1,
        book_page_label: null,
        side: "full",
        block_start_index: 16,
        block_start_bbox: [10, 130, 100, 170],
        block_end_pdf_page_index: 1,
        block_end_index: 18,
        block_end_bbox: [10, 190, 100, 220],
        section_title: "专项突破 1 利用导数证明不等式",
        crop_image_path: null,
      },
      question_number: "2",
      raw_ocr_text: "2. 设函数 $g(x)$",
      normalized_text: "2. 设函数 $g(x)$",
      answer_or_solution_candidate: null,
      extraction_confidence: "medium",
      warnings: ["missing_options_or_solution"],
    },
  ],
  warnings: ["question_number_restarted:demo"],
};

{
  const result = validateCandidateExtraction(extraction);
  assert.equal(result.ok, true);

  const invalid = validateCandidateExtraction({ candidates: "bad" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.some((error) => error.includes("source_file")), true);
  assert.equal(invalid.errors.some((error) => error.includes("candidates")), true);
}

{
  const rendered = renderMathTextToHtml("已知 $f(x)$ 且 <script>alert(1)</script>");
  assert.equal(rendered.html.includes("<script>"), false);
  assert.equal(rendered.html.includes("katex"), true);
  assert.deepEqual(rendered.warnings, []);

  const badMath = renderMathTextToHtml("已知 $\\badcommand{x}$");
  assert.equal(badMath.html.includes("\\badcommand"), true);
  assert.equal(badMath.warnings.includes("math_render_failed"), true);
}

{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });

  assert.equal(appData.app_version, "candidate-review-ui-v1");
  assert.equal(appData.candidates.length, 2);
  assert.equal(appData.storage_key, "mathtrace.candidateReview.abc123456789");
  assert.equal(appData.candidates[0].section_title, "考点 1 导数的概念、几何意义与运算");
  assert.equal(appData.candidates[0].rendered_html.includes("katex"), true);
  assert.equal(appData.candidates[1].warnings.includes("missing_options_or_solution"), true);
  assert.equal(
    appData.candidates[1].warnings.includes("math_render_failed"),
    false,
  );

  const manifest = buildReviewManifest(appData);
  assert.deepEqual(manifest, {
    app_version: "candidate-review-ui-v1",
    candidate_source_file: "/tmp/candidate_questions.json",
    candidate_source_sha256: "abc123456789",
    generated_at: "2026-06-22T00:00:00.000Z",
    candidate_count: 2,
    extraction_warnings: ["question_number_restarted:demo"],
  });
}

{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const reviewState = {
    "candidate-1": {
      status: "approved",
      note: "公式和选项 OK",
      updated_at: "2026-06-22T00:01:00.000Z",
    },
    "candidate-2": {
      status: "needs_fix",
      note: "缺少选项",
      updated_at: "2026-06-22T00:02:00.000Z",
    },
  };

  const seed = buildReviewedPracticeSeed({
    appData,
    reviewState,
    exportedAt: "2026-06-22T00:03:00.000Z",
  });

  assert.equal(seed.approved_count, 1);
  assert.equal(seed.items.length, 1);
  assert.equal(seed.items[0].id, "candidate-1");
  assert.equal(seed.items[0].candidate_id, "candidate-1");
  assert.equal(seed.items[0].review_status, "reviewed");
  assert.equal(seed.items[0].question_text.includes("已知 $f(x)$"), true);
  assert.deepEqual(seed.items[0].mistake_causes, []);
  assert.deepEqual(seed.items[0].knowledge_points, [
    "导数",
    "考点 1 导数的概念、几何意义与运算",
  ]);
  assert.equal(seed.items[0].difficulty, null);
  assert.equal(seed.items[0].variant_level, null);
}

{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const html = renderCandidateReviewHtml(appData, { katexCss: ".katex{font:normal}" });

  assert.equal(html.includes("<!doctype html>"), true);
  assert.equal(html.includes("MathTrace Candidate Review"), true);
  assert.equal(html.includes(".katex{font:normal}"), true);
  assert.equal(html.includes("window.__CANDIDATE_REVIEW_DATA__"), true);
  assert.equal(html.includes("localStorage"), true);
  assert.equal(html.includes("copy-json-fallback"), true);
  assert.equal(html.includes("reviewed_practice_seed.json"), true);
  assert.equal(html.includes("<script>alert(1)</script>"), false);
}

{
  const hostileExtraction = structuredClone(extraction);
  hostileExtraction.candidates[0].id = "</script><script>alert(1)</script>";
  hostileExtraction.candidates[0].source_ref.section_title = "恶意 </script><script>alert(2)</script>";
  hostileExtraction.candidates[0].normalized_text = "1. 含有行分隔符 \u2028 和段分隔符 \u2029";
  const appData = buildReviewAppData({
    extraction: hostileExtraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const html = renderCandidateReviewHtml(appData, { katexCss: ".katex{}" });
  assert.equal(html.includes("</script><script>alert"), false);
  assert.equal(html.includes("\\u003c/script\\u003e"), true);
}

{
  const appData = buildReviewAppData({
    extraction: { ...extraction, candidates: [] },
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const seed = buildReviewedPracticeSeed({
    appData,
    reviewState: {},
    exportedAt: "2026-06-22T00:03:00.000Z",
  });
  assert.equal(appData.candidates.length, 0);
  assert.equal(
    renderCandidateReviewHtml(appData, { katexCss: ".katex{}" }).includes("没有候选题"),
    true,
  );
  assert.equal(seed.approved_count, 0);
  assert.deepEqual(seed.items, []);
}

{
  const nullSectionExtraction = structuredClone(extraction);
  nullSectionExtraction.candidates[0].source_ref.section_title = null;
  const appData = buildReviewAppData({
    extraction: nullSectionExtraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const seed = buildReviewedPracticeSeed({
    appData,
    reviewState: {
      "candidate-1": {
        status: "approved",
        note: "",
        updated_at: "2026-06-22T00:03:00.000Z",
      },
    },
    exportedAt: "2026-06-22T00:03:00.000Z",
  });
  assert.deepEqual(seed.items[0].knowledge_points, ["导数"]);
}

{
  const badMathExtraction = structuredClone(extraction);
  badMathExtraction.candidates[0].normalized_text = "1. 已知 $\\badcommand{x}$";
  const appData = buildReviewAppData({
    extraction: badMathExtraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  assert.equal(appData.candidates[0].warnings.includes("math_render_failed"), true);
}

console.log("candidate review ui core tests passed");
```

- [ ] **Step 2: Run core test and verify it fails**

Run:

```bash
node scripts/tests/rag/candidate-review-ui-core.test.mjs
```

Expected:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module ... candidate-review-ui-core.mjs
```

- [ ] **Step 3: Implement pure helper module**

Create `scripts/rag/candidate-review-ui-core.mjs`:

```js
import katex from "katex";

const APP_VERSION = "candidate-review-ui-v1";
const STORAGE_KEY_PREFIX = "mathtrace.candidateReview";
const MATH_PATTERN = /(?<!\\)(\$\$?)([\s\S]+?)(?<!\\)\1/g;

export function validateCandidateExtraction(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["root must be an object"] };
  }
  for (const key of ["source_file", "mineru_json_file", "page_count", "candidates"]) {
    if (!(key in value)) {
      errors.push(`missing ${key}`);
    }
  }
  if (!Array.isArray(value.candidates)) {
    errors.push("candidates must be an array");
  }
  if (Array.isArray(value.candidates)) {
    value.candidates.forEach((candidate, index) => {
      for (const key of ["id", "normalized_text", "source_ref", "warnings"]) {
        if (!(key in candidate)) {
          errors.push(`candidate[${index}] missing ${key}`);
        }
      }
    });
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, extraction: value };
}

export function renderMathTextToHtml(text) {
  const warnings = [];
  const source = String(text ?? "");
  let cursor = 0;
  let html = "";

  for (const match of source.matchAll(MATH_PATTERN)) {
    html += escapeHtml(source.slice(cursor, match.index));
    const delimiter = match[1];
    const math = match[2];
    try {
      html += katex.renderToString(math, {
        displayMode: delimiter === "$$",
        throwOnError: true,
        strict: "ignore",
      });
    } catch {
      warnings.push("math_render_failed");
      html += escapeHtml(`${delimiter}${math}${delimiter}`);
    }
    cursor = match.index + match[0].length;
  }

  html += escapeHtml(source.slice(cursor));
  return {
    html: html.replace(/\n/g, "<br>"),
    warnings: [...new Set(warnings)],
  };
}

export function buildReviewAppData({
  extraction,
  candidateSourceFile,
  candidateSourceSha256,
  generatedAt,
}) {
  const candidates = extraction.candidates.map((candidate) => {
    const rendered = renderMathTextToHtml(candidate.normalized_text);
    const sectionTitle = candidate.source_ref?.section_title ?? null;
    return {
      id: candidate.id,
      question_number: candidate.question_number,
      section_title: sectionTitle,
      normalized_text: candidate.normalized_text,
      rendered_html: rendered.html,
      extraction_confidence: candidate.extraction_confidence,
      warnings: [...new Set([...(candidate.warnings ?? []), ...rendered.warnings])],
      source_ref: candidate.source_ref,
    };
  });

  return {
    app_version: APP_VERSION,
    candidate_source_file: candidateSourceFile,
    candidate_source_sha256: candidateSourceSha256,
    generated_at: generatedAt,
    storage_key: `${STORAGE_KEY_PREFIX}.${candidateSourceSha256.slice(0, 12)}`,
    extraction: {
      source_file: extraction.source_file,
      mineru_json_file: extraction.mineru_json_file,
      page_count: extraction.page_count,
      warnings: extraction.warnings ?? [],
    },
    candidates,
  };
}

export function buildReviewManifest(appData) {
  return {
    app_version: appData.app_version,
    candidate_source_file: appData.candidate_source_file,
    candidate_source_sha256: appData.candidate_source_sha256,
    generated_at: appData.generated_at,
    candidate_count: appData.candidates.length,
    extraction_warnings: appData.extraction.warnings,
  };
}

export function buildReviewedPracticeSeed({ appData, reviewState, exportedAt }) {
  const approvedItems = appData.candidates
    .filter((candidate) => reviewState[candidate.id]?.status === "approved")
    .map((candidate) => ({
      id: candidate.id,
      candidate_id: candidate.id,
      review_status: "reviewed",
      reviewer_note: reviewState[candidate.id]?.note ?? "",
      question_text: candidate.normalized_text,
      solution_outline: null,
      mistake_causes: [],
      knowledge_points: inferKnowledgePoints(candidate),
      difficulty: null,
      variant_level: null,
      source_ref: candidate.source_ref,
      original_extraction_confidence: candidate.extraction_confidence,
      original_warnings: candidate.warnings,
    }));

  return {
    exported_at: exportedAt,
    source_candidate_file: appData.candidate_source_file,
    source_file: appData.extraction.source_file,
    mineru_json_file: appData.extraction.mineru_json_file,
    approved_count: approvedItems.length,
    items: approvedItems,
  };
}

export function renderCandidateReviewHtml(appData, { katexCss }) {
  const dataJson = escapeScriptJson(appData);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MathTrace Candidate Review</title>
  <style>${katexCss}</style>
  <style>${renderStyles()}</style>
</head>
<body>
  <main id="app">
    <header class="topbar">
      <h1>MathTrace Candidate Review</h1>
      <div id="summary"></div>
      <input id="search" type="search" placeholder="搜索题号、章节、题干">
      <select id="filter">
        <option value="all">全部</option>
        <option value="unreviewed">未审核</option>
        <option value="approved">Approved</option>
        <option value="needs_fix">Needs Fix</option>
        <option value="skipped">Skipped</option>
        <option value="warnings">有 warnings</option>
      </select>
      <button id="copy-json">复制 JSON</button>
      <button id="download-json">下载 reviewed_practice_seed.json</button>
    </header>
    <textarea id="copy-json-fallback" hidden readonly></textarea>
    <section class="layout">
      <aside id="candidate-list"></aside>
      <section id="candidate-detail"></section>
    </section>
  </main>
  <script>window.__CANDIDATE_REVIEW_DATA__ = ${dataJson};</script>
  <script>${renderBrowserScript()}</script>
</body>
</html>
`;
}

function inferKnowledgePoints(candidate) {
  const points = ["导数"];
  if (candidate.section_title) {
    points.push(candidate.section_title);
  }
  return [...new Set(points)];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function renderStyles() {
  return `
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f8f7f4; color: #1f2933; }
    .topbar { display: grid; gap: 10px; padding: 16px; border-bottom: 1px solid #ded8cc; background: #fffdf8; }
    .layout { display: grid; grid-template-columns: minmax(260px, 34vw) 1fr; min-height: calc(100vh - 170px); }
    #candidate-list { border-right: 1px solid #ded8cc; overflow: auto; }
    .candidate-row { width: 100%; border: 0; border-bottom: 1px solid #e7e0d3; padding: 12px; text-align: left; background: transparent; cursor: pointer; }
    .candidate-row[aria-selected="true"] { background: #efe8d9; }
    #candidate-detail { padding: 22px; overflow: auto; }
    .question-body { line-height: 1.85; font-size: 17px; }
    .actions { display: flex; gap: 8px; margin: 16px 0; }
    textarea { width: 100%; min-height: 90px; }
    @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } #candidate-list { max-height: 34vh; border-right: 0; border-bottom: 1px solid #ded8cc; } }
  `;
}

function renderBrowserScript() {
  return `
    const appData = window.__CANDIDATE_REVIEW_DATA__;
    const state = loadState();
    let selectedId = appData.candidates[0]?.id ?? null;
    let query = "";
    let filter = "all";

    function loadState() {
      try { return JSON.parse(localStorage.getItem(appData.storage_key) || "{}"); }
      catch { return {}; }
    }
    function saveState() { localStorage.setItem(appData.storage_key, JSON.stringify(state)); }
    function setStatus(id, status) {
      state[id] = { ...(state[id] || {}), status, updated_at: new Date().toISOString() };
      saveState();
      render();
    }
    function setNote(id, note) {
      state[id] = { ...(state[id] || {}), note, updated_at: new Date().toISOString() };
      saveState();
    }
    function filteredCandidates() {
      return appData.candidates.filter((candidate) => {
        const status = state[candidate.id]?.status || "unreviewed";
        const haystack = [candidate.question_number, candidate.section_title, candidate.normalized_text].join(" ").toLowerCase();
        if (query && !haystack.includes(query.toLowerCase())) return false;
        if (filter === "all") return true;
        if (filter === "warnings") return candidate.warnings.length > 0;
        return status === filter;
      });
    }
    function buildSeed() {
      const approved = appData.candidates.filter((candidate) => state[candidate.id]?.status === "approved");
      return {
        exported_at: new Date().toISOString(),
        source_candidate_file: appData.candidate_source_file,
        source_file: appData.extraction.source_file,
        mineru_json_file: appData.extraction.mineru_json_file,
        approved_count: approved.length,
        items: approved.map((candidate) => ({
          id: candidate.id,
          candidate_id: candidate.id,
          review_status: "reviewed",
          reviewer_note: state[candidate.id]?.note || "",
          question_text: candidate.normalized_text,
          solution_outline: null,
          mistake_causes: [],
          knowledge_points: candidate.section_title ? ["导数", candidate.section_title] : ["导数"],
          difficulty: null,
          variant_level: null,
          source_ref: candidate.source_ref,
          original_extraction_confidence: candidate.extraction_confidence,
          original_warnings: candidate.warnings,
        })),
      };
    }
    function render() {
      const list = filteredCandidates();
      document.querySelector("#summary").textContent = "候选题 " + appData.candidates.length + " 道，当前筛选 " + list.length + " 道";
      document.querySelector("#candidate-list").innerHTML = list.map((candidate) => {
        const status = state[candidate.id]?.status || "unreviewed";
        return '<button class="candidate-row" aria-selected="' + (candidate.id === selectedId) + '" data-id="' + candidate.id + '">' +
          '<strong>' + escapeHtml(candidate.question_number || "-") + '</strong> ' +
          escapeHtml(candidate.section_title || "未分组") +
          '<br><small>' + status + ' · ' + candidate.extraction_confidence + ' · warnings ' + candidate.warnings.length + '</small>' +
          '</button>';
      }).join("");
      const selected = appData.candidates.find((candidate) => candidate.id === selectedId) || list[0];
      if (!selected) {
        document.querySelector("#candidate-detail").innerHTML = "<p>没有候选题。</p>";
        return;
      }
      selectedId = selected.id;
      const note = state[selected.id]?.note || "";
      document.querySelector("#candidate-detail").innerHTML =
        '<h2>题号 ' + escapeHtml(selected.question_number || "-") + '</h2>' +
        '<p>' + escapeHtml(selected.section_title || "未分组") + '</p>' +
        '<div class="question-body">' + selected.rendered_html + '</div>' +
        '<div class="actions">' +
        '<button data-status="approved">Approved</button>' +
        '<button data-status="needs_fix">Needs Fix</button>' +
        '<button data-status="skipped">Skipped</button>' +
        '</div>' +
        '<h3>Warnings</h3><pre>' + escapeHtml(JSON.stringify(selected.warnings, null, 2)) + '</pre>' +
        '<h3>Source Ref</h3><pre>' + escapeHtml(JSON.stringify(selected.source_ref, null, 2)) + '</pre>' +
        '<h3>备注</h3><textarea id="note">' + escapeHtml(note) + '</textarea>';
    }
    function escapeHtml(value) {
      return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
    }
    document.addEventListener("click", (event) => {
      const row = event.target.closest("[data-id]");
      if (row) { selectedId = row.dataset.id; render(); return; }
      const action = event.target.closest("[data-status]");
      if (action && selectedId) setStatus(selectedId, action.dataset.status);
    });
    document.addEventListener("input", (event) => {
      if (event.target.id === "search") { query = event.target.value; render(); }
      if (event.target.id === "filter") { filter = event.target.value; render(); }
      if (event.target.id === "note" && selectedId) setNote(selectedId, event.target.value);
    });
    document.querySelector("#copy-json").addEventListener("click", async () => {
      const text = JSON.stringify(buildSeed(), null, 2);
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return;
        } catch {}
      }
      const fallback = document.querySelector("#copy-json-fallback");
      fallback.hidden = false;
      fallback.value = text;
      fallback.focus();
      fallback.select();
      document.execCommand("copy");
    });
    document.querySelector("#download-json").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(buildSeed(), null, 2) + "\\n"], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "reviewed_practice_seed.json";
      link.click();
      URL.revokeObjectURL(link.href);
    });
    render();
  `;
}
```

- [ ] **Step 4: Add core test to default suite**

Modify `scripts/run-tests.mjs` by inserting:

```js
"scripts/tests/rag/candidate-review-ui-core.test.mjs",
```

near the other RAG tests.

- [ ] **Step 5: Run tests**

Run:

```bash
node scripts/tests/rag/candidate-review-ui-core.test.mjs
node scripts/run-tests.mjs default
```

Expected:

```text
candidate review ui core tests passed
```

and default suite exits with status `0`.

- [ ] **Step 6: Commit Task 1**

Before committing:

```bash
git status --short
```

Stage only:

```bash
git add scripts/rag/candidate-review-ui-core.mjs scripts/tests/rag/candidate-review-ui-core.test.mjs scripts/run-tests.mjs
git commit -m "test: add candidate review ui helpers"
```

Do not stage `.nvmrc`, `.env.local`, `artifacts/`, `docs/reviews/*.md`, or `.superpowers/sdd/`.

---

### Task 2: Static Review UI Generator CLI

**Files:**
- Create: `scripts/rag/build-candidate-review-ui.mjs`
- Create: `scripts/tests/rag/candidate-review-ui-cli.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes from Task 1:
  - `validateCandidateExtraction(value)`
  - `buildReviewAppData(input)`
  - `buildReviewManifest(appData)`
  - `renderCandidateReviewHtml(appData, { katexCss })`
- Produces CLI:

```bash
node scripts/rag/build-candidate-review-ui.mjs \
  --input artifacts/rag/mineru-candidate-mapper/candidate_questions.json \
  --out artifacts/rag/candidate-review
```

- [ ] **Step 1: Write failing CLI tests**

Create `scripts/tests/rag/candidate-review-ui-cli.test.mjs`:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpRoot = mkdtempSync(join(tmpdir(), "candidate-review-ui-"));
const inputPath = join(tmpRoot, "candidate_questions.json");
const outputDir = join(tmpRoot, "review-ui");

const fixture = {
  source_file: "/tmp/source.pdf",
  source_file_sha256: "source123",
  mineru_json_file: "/tmp/mineru.json",
  mineru_json_sha256: "json123",
  extractor: "mineru-json-candidate-mapper",
  extracted_at: "2026-06-22T00:00:00.000Z",
  page_count: 1,
  candidates: [
    {
      id: "candidate-1",
      source_ref: {
        pdf_page_index: 1,
        book_page_label: null,
        side: "full",
        block_start_index: 1,
        block_start_bbox: [1, 2, 3, 4],
        block_end_pdf_page_index: 1,
        block_end_index: 2,
        block_end_bbox: [1, 5, 3, 8],
        section_title: "考点 1 导数",
        crop_image_path: null,
      },
      question_number: "1",
      raw_ocr_text: "1. 设 $f(x)$",
      normalized_text: "1. 设 $f(x)$\nA. 1\nB. 2",
      answer_or_solution_candidate: null,
      extraction_confidence: "high",
      warnings: [],
    },
  ],
  warnings: [],
};

writeFileSync(inputPath, `${JSON.stringify(fixture, null, 2)}\n`);

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/build-candidate-review-ui.mjs", "--input", inputPath, "--out", outputDir],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("index.html"), true);
  assert.equal(result.stdout.includes("review_manifest.json"), true);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);

  const html = readFileSync(join(outputDir, "index.html"), "utf8");
  assert.equal(html.includes("MathTrace Candidate Review"), true);
  assert.equal(html.includes(".katex"), true);
  assert.equal(html.includes("window.__CANDIDATE_REVIEW_DATA__"), true);
  assert.equal(html.includes("copy-json-fallback"), true);
  assert.equal(html.includes("reviewed_practice_seed.json"), true);

  const manifest = JSON.parse(readFileSync(join(outputDir, "review_manifest.json"), "utf8"));
  assert.equal(manifest.candidate_count, 1);
  assert.equal(manifest.candidate_source_file, inputPath);
}

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/build-candidate-review-ui.mjs", "--input", join(tmpRoot, "missing.json")],
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
    ["scripts/rag/build-candidate-review-ui.mjs", "--input", badPath, "--out", join(tmpRoot, "bad-out")],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse candidate questions JSON"), true);
}

{
  const invalidPath = join(tmpRoot, "invalid.json");
  writeFileSync(invalidPath, JSON.stringify({ candidates: "bad" }));
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/build-candidate-review-ui.mjs", "--input", invalidPath, "--out", join(tmpRoot, "invalid-out")],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("invalid candidate extraction"), true);
}

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/build-candidate-review-ui.mjs", "--input"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--input requires a value"), true);
}

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/build-candidate-review-ui.mjs", "--out"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--out requires a value"), true);
}

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/build-candidate-review-ui.mjs", "--unknown"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("unknown argument"), true);
}

console.log("candidate review ui cli tests passed");
```

- [ ] **Step 2: Run CLI test and verify it fails**

Run:

```bash
node scripts/tests/rag/candidate-review-ui-cli.test.mjs
```

Expected:

```text
Cannot find module ... build-candidate-review-ui.mjs
```

- [ ] **Step 3: Implement CLI**

Create `scripts/rag/build-candidate-review-ui.mjs`:

```js
#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  buildReviewAppData,
  buildReviewManifest,
  renderCandidateReviewHtml,
  validateCandidateExtraction,
} from "./candidate-review-ui-core.mjs";

class CliUsageError extends Error {}

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
  const outputDir = resolve(args.out ?? "artifacts/rag/candidate-review");
  const inputText = await readInputText(inputPath);
  const katexCss = await readKatexCss();
  const parsed = parseCandidateJson(inputText);
  const validation = validateCandidateExtraction(parsed);
  if (!validation.ok) {
    throw new Error(`invalid candidate extraction: ${validation.errors.join(", ")}`);
  }

  const appData = buildReviewAppData({
    extraction: validation.extraction,
    candidateSourceFile: formatLocalPath(inputPath),
    candidateSourceSha256: createHash("sha256").update(inputText).digest("hex"),
    generatedAt: new Date().toISOString(),
  });

  await mkdir(outputDir, { recursive: true });
  const htmlPath = resolve(outputDir, "index.html");
  const manifestPath = resolve(outputDir, "review_manifest.json");
  await writeFile(htmlPath, renderCandidateReviewHtml(appData, { katexCss }));
  await writeFile(manifestPath, `${JSON.stringify(buildReviewManifest(appData), null, 2)}\n`);

  console.log(`Wrote ${htmlPath}`);
  console.log(`Wrote ${manifestPath}`);
  console.log(`Candidates: ${appData.candidates.length}`);
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
    } else {
      throw new CliUsageError(`unknown argument: ${arg}`);
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

async function readInputText(inputPath) {
  try {
    return await readFile(inputPath, "utf8");
  } catch {
    throw new CliUsageError(`input file not found: ${inputPath}`);
  }
}

function parseCandidateJson(inputText) {
  try {
    return JSON.parse(inputText);
  } catch {
    throw new Error("failed to parse candidate questions JSON");
  }
}

async function readKatexCss() {
  try {
    return await readFile(resolve("node_modules/katex/dist/katex.min.css"), "utf8");
  } catch {
    throw new Error("failed to read KaTeX CSS");
  }
}

function formatLocalPath(filePath) {
  const relativePath = relative(process.cwd(), filePath);
  if (relativePath && !relativePath.startsWith("..")) {
    return relativePath;
  }
  return filePath;
}

function printHelp() {
  console.log(`Usage:
  node scripts/rag/build-candidate-review-ui.mjs --input <candidate_questions.json> [--out <dir>]

Builds an ignored local static review UI for candidate questions.`);
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error.message);
  process.exit(1);
});
```

- [ ] **Step 4: Add CLI test to default suite**

Modify `scripts/run-tests.mjs` by adding:

```js
"scripts/tests/rag/candidate-review-ui-cli.test.mjs",
```

immediately after `scripts/tests/rag/candidate-review-ui-core.test.mjs`.

- [ ] **Step 5: Run CLI against real local candidates**

Run:

```bash
node scripts/rag/build-candidate-review-ui.mjs \
  --input artifacts/rag/mineru-candidate-mapper/candidate_questions.json \
  --out artifacts/rag/candidate-review
```

Expected:

```text
Wrote .../index.html
Wrote .../review_manifest.json
Candidates: 72
```

Do not paste real question text into chat. Do not commit generated artifacts.

- [ ] **Step 6: Run tests and build**

Run:

```bash
node scripts/tests/rag/candidate-review-ui-cli.test.mjs
node scripts/run-tests.mjs default
npm run build
git diff --check
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
```

Expected:

```text
candidate review ui cli tests passed
default suite passes
build succeeds
git diff --check has no output
git ls-files ... has no output
```

- [ ] **Step 7: Commit Task 2**

Before committing:

```bash
git status --short
```

Stage only:

```bash
git add scripts/rag/build-candidate-review-ui.mjs scripts/tests/rag/candidate-review-ui-cli.test.mjs scripts/run-tests.mjs
git commit -m "feat: add candidate review ui generator"
```

Do not stage `.nvmrc`, `.env.local`, `artifacts/`, `docs/reviews/*.md`, or `.superpowers/sdd/`.

---

### Task 3: Review Workflow Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md`
- Optional modify: `docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md`

**Interfaces:**
- Consumes:
  - Real local CLI summary from Task 2.
- Produces:
  - A small usage note and next-step boundary in the design spec.

- [ ] **Step 1: Add usage note to this design spec**

Append to `docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md`:

````md
## 11. 实现说明

第一版实现为本地静态审核页生成器：

```bash
node scripts/rag/build-candidate-review-ui.mjs \
  --input artifacts/rag/mineru-candidate-mapper/candidate_questions.json \
  --out artifacts/rag/candidate-review
```

真实本地候选题文件可生成 72 道候选题的审核页。生成结果位于 ignored `artifacts/rag/candidate-review/`，不进入 Git。页面审核状态保存在浏览器 `localStorage`，最终通过页面按钮下载或复制 `reviewed_practice_seed.json`。

该 seed 仍不是正式 `practice_corpus`。下一阶段需要人工补齐 `knowledge_points`、`difficulty`、`variant_level` 和必要解析信息后，再进入 metadata/text search。
````

- [ ] **Step 2: Decide whether the previous OCR/RAG spec needs a pointer**

If useful, append one sentence to `docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md` under section 14:

```md
候选题人工抽查阶段可使用本地静态审核页生成器，详见 `docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md`。
```

Do not update `interview/mathtrace-project-narrative.md` in this task. The review UI is internal tooling; interview narrative should wait until it leads to a reviewed `practice_corpus` and retrieval result.

- [ ] **Step 3: Run final verification**

Run:

```bash
node scripts/run-tests.mjs default
npm run build
git diff --check
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
```

Expected:

```text
default suite passes
build succeeds
git diff --check has no output
git ls-files ... has no output
```

- [ ] **Step 4: Commit Task 3**

Before committing:

```bash
git status --short
```

Stage only the intended docs:

```bash
git add docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md
git commit -m "docs: document candidate review ui workflow"
```

If the previous OCR/RAG spec was not changed, stage only:

```bash
git add docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md
git commit -m "docs: document candidate review ui workflow"
```

Do not stage `.nvmrc`, `.env.local`, `artifacts/`, `docs/reviews/*.md`, or `.superpowers/sdd/`.

---

## Final Review Checklist

- Generated review page is under ignored `artifacts/`.
- No real candidate question text is committed in tests, docs, or source.
- No Next.js route, app component, API, database, pgvector, embedding, `practice_corpus`, `memory_events`, or `student_profiles` path is modified.
- Static page uses `localStorage` and export/download; it does not claim to write back to the repo.
- Export only includes `approved` candidates.
- `needs_fix` and `skipped` candidates stay out of `reviewed_practice_seed.json`.
- KaTeX rendering failure is non-fatal and visible as warning.
- `npm test`, `npm run build`, `git diff --check`, and artifact tracking checks pass.

## Execution Options

Plan complete when this file is saved. Recommended execution path:

1. Ask Claude Code to review this spec and plan together.
2. Fix plan/spec findings if any.
3. Execute with `superpowers:subagent-driven-development`.
4. Open `artifacts/rag/candidate-review/index.html` locally and mark 10-15 approved questions.
5. Use exported `reviewed_practice_seed.json` as input to the next `practice_corpus` fixture task.
