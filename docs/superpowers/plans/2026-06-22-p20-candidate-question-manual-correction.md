# P2.0 Candidate Question Manual Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual correction support to the local candidate review UI so reviewers can edit the full question content, preview the corrected result with KaTeX, and export reviewed seeds using the corrected content while preserving original OCR text.

**Architecture:** Keep `candidate_questions.json` as the immutable machine extraction artifact. Store reviewer edits in the existing browser `localStorage` review state, render the corrected preview inside the generated static page, and export correction metadata in `reviewed_practice_seed.json`. Inline KaTeX browser JS in the generated page so correction previews work offline from `file://`.

**Tech Stack:** Node.js ESM scripts, existing `katex` dependency, generated static HTML/CSS/JS, browser `localStorage`, existing `scripts/run-tests.mjs`.

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
- Do not overwrite `candidate.normalized_text`; it remains the original OCR/parser text.
- Manual corrections apply to the full question content, including stem, formulas, options, and line breaks.
- Exported seed must include both `question_text` and `original_question_text`.
- Browser-side seed export must match Node-side `buildReviewedPracticeSeed` correction fallback semantics.
- Search must include reviewer `corrected_text` as well as original OCR text.
- Tests must not rely on a fixed number of anonymous `<script>` tags; generated scripts use stable `id` attributes.

---

## File Structure

- Modify `scripts/rag/candidate-review-ui-core.mjs`
  - Extend reviewed seed export to consume `reviewState[candidate_id].corrected_text`.
  - Add browser-side corrected content textarea, KaTeX preview, correction persistence, and export fields.
  - Keep original OCR rendering visible and read-only for comparison.
- Modify `scripts/rag/build-candidate-review-ui.mjs`
  - Read `node_modules/katex/dist/katex.min.js` in addition to existing KaTeX CSS.
  - Pass `{ katexCss, katexJs }` into `renderCandidateReviewHtml`.
- Modify `scripts/tests/rag/candidate-review-ui-core.test.mjs`
  - Add seed export assertions for corrected vs unchanged text.
  - Add generated HTML assertions for correction textarea, preview, original OCR section, and KaTeX JS injection.
  - Add browser-script VM coverage that editing corrected content updates state and preview.
- Modify `scripts/tests/rag/candidate-review-ui-cli.test.mjs`
  - Assert generated HTML includes KaTeX browser JS and correction UI markers.
- Modify `scripts/run-tests.mjs`
  - No new test files expected; existing candidate review UI tests remain in the default suite.
- Optional generated artifact, not committed:
  - `artifacts/rag/candidate-review/index.html`
  - `artifacts/rag/candidate-review/review_manifest.json`

## Data Contract Changes

### Browser Review State

Existing state:

```js
{
  "candidate-1": {
    status: "approved",
    note: "人工备注",
    updated_at: "2026-06-22T00:00:00.000Z"
  }
}
```

New state:

```js
{
  "candidate-1": {
    status: "approved",
    note: "人工备注",
    corrected_text: "人工修正后的完整题目内容，包含题干和选项",
    updated_at: "2026-06-22T00:00:00.000Z"
  }
}
```

Rules:

- `corrected_text` is optional.
- If missing or equal to `candidate.normalized_text`, export uses original text and `has_manual_correction: false`.
- If present and different after trimming, export uses `corrected_text` and `has_manual_correction: true`.
- Empty corrected text is invalid for export. If a reviewer deletes all content and clicks `Approved`, export should fall back to original text and preserve the draft in localStorage; do not emit an empty `question_text`.

### Exported Seed Item

Current seed item:

```js
{
  id: "candidate-1",
  candidate_id: "candidate-1",
  review_status: "reviewed",
  reviewer_note: "",
  question_text: "OCR 原始完整题目内容",
  solution_outline: null,
  mistake_causes: [],
  knowledge_points: ["导数"],
  difficulty: null,
  variant_level: null,
  source_ref: {},
  original_extraction_confidence: "high",
  original_warnings: []
}
```

New seed item:

```js
{
  id: "candidate-1",
  candidate_id: "candidate-1",
  review_status: "reviewed",
  reviewer_note: "",
  question_text: "人工修正后的完整题目内容",
  original_question_text: "OCR 原始完整题目内容",
  has_manual_correction: true,
  solution_outline: null,
  mistake_causes: [],
  knowledge_points: ["导数"],
  difficulty: null,
  variant_level: null,
  source_ref: {},
  original_extraction_confidence: "high",
  original_warnings: []
}
```

---

### Task 1: Manual Correction Export Contract

**Files:**
- Modify: `scripts/rag/candidate-review-ui-core.mjs`
- Modify: `scripts/tests/rag/candidate-review-ui-core.test.mjs`

**Interfaces:**
- Consumes:
  - `buildReviewedPracticeSeed({ appData, reviewState, exportedAt })`
  - `reviewState[candidate.id]?.corrected_text`
- Produces:
  - Seed items with `question_text`, `original_question_text`, and `has_manual_correction`.

- [ ] **Step 1: Write failing seed export tests**

Edit `scripts/tests/rag/candidate-review-ui-core.test.mjs`.

In the existing `buildReviewedPracticeSeed` approved-item test, change the `reviewState` for `candidate-1` to include a corrected full question:

```js
const correctedQuestionText = "1. 已知 $f(x)$, 则()\\nA. 1\\nB. 2\\nC. 3";
const reviewState = {
  "candidate-1": {
    status: "approved",
    note: "修正了 C 选项",
    corrected_text: correctedQuestionText,
    updated_at: "2026-06-22T00:01:00.000Z",
  },
  "candidate-2": {
    status: "needs_fix",
    note: "缺少选项",
    corrected_text: "2. 草稿修正但未通过",
    updated_at: "2026-06-22T00:02:00.000Z",
  },
};
```

Update assertions:

```js
assert.equal(seed.approved_count, 1);
assert.equal(seed.items[0].question_text, correctedQuestionText);
assert.equal(seed.items[0].original_question_text, "1. 已知 $f(x)$, 则()\\nA. 1\\nB. 2");
assert.equal(seed.items[0].has_manual_correction, true);
assert.equal(seed.items[0].reviewer_note, "修正了 C 选项");
assert.equal(
  seed.items.some((item) => item.candidate_id === "candidate-2"),
  false,
);
```

Add a second export test for unchanged text:

```js
{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const seed = buildReviewedPracticeSeed({
    appData,
    reviewState: {
      "candidate-1": {
        status: "approved",
        corrected_text: "1. 已知 $f(x)$, 则()\\nA. 1\\nB. 2",
        note: "",
        updated_at: "2026-06-22T00:03:00.000Z",
      },
    },
    exportedAt: "2026-06-22T00:04:00.000Z",
  });

  assert.equal(seed.items[0].question_text, "1. 已知 $f(x)$, 则()\\nA. 1\\nB. 2");
  assert.equal(seed.items[0].original_question_text, "1. 已知 $f(x)$, 则()\\nA. 1\\nB. 2");
  assert.equal(seed.items[0].has_manual_correction, false);
}
```

Add a third export test for blank correction fallback:

```js
{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const seed = buildReviewedPracticeSeed({
    appData,
    reviewState: {
      "candidate-1": {
        status: "approved",
        corrected_text: "   ",
        note: "",
        updated_at: "2026-06-22T00:03:00.000Z",
      },
    },
    exportedAt: "2026-06-22T00:04:00.000Z",
  });

  assert.equal(seed.items[0].question_text, "1. 已知 $f(x)$, 则()\\nA. 1\\nB. 2");
  assert.equal(seed.items[0].has_manual_correction, false);
}
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
node scripts/tests/rag/candidate-review-ui-core.test.mjs
```

Expected:

```text
AssertionError ... original_question_text
```

or:

```text
AssertionError ... has_manual_correction
```

- [ ] **Step 3: Implement seed export helpers**

In `scripts/rag/candidate-review-ui-core.mjs`, add helpers near `inferKnowledgePoints`:

```js
function getCorrectedQuestionText(candidate, reviewStateItem) {
  const correctedText =
    typeof reviewStateItem?.corrected_text === "string"
      ? reviewStateItem.corrected_text
      : "";
  const trimmedCorrectedText = correctedText.trim();
  if (!trimmedCorrectedText) {
    return candidate.normalized_text;
  }
  return correctedText;
}

function hasManualCorrection(candidate, questionText) {
  return questionText.trim() !== String(candidate.normalized_text ?? "").trim();
}
```

Update `buildReviewedPracticeSeed` item mapping:

```js
.map((candidate) => {
  const reviewStateItem = reviewState[candidate.id];
  const questionText = getCorrectedQuestionText(candidate, reviewStateItem);
  return {
    id: candidate.id,
    candidate_id: candidate.id,
    review_status: "reviewed",
    reviewer_note: reviewStateItem?.note ?? "",
    question_text: questionText,
    original_question_text: candidate.normalized_text,
    has_manual_correction: hasManualCorrection(candidate, questionText),
    solution_outline: null,
    mistake_causes: [],
    knowledge_points: inferKnowledgePoints(candidate),
    difficulty: null,
    variant_level: null,
    source_ref: candidate.source_ref,
    original_extraction_confidence: candidate.extraction_confidence,
    original_warnings: candidate.warnings,
  };
});
```

- [ ] **Step 4: Run focused test**

Run:

```bash
node scripts/tests/rag/candidate-review-ui-core.test.mjs
```

Expected:

```text
candidate review ui core tests passed
```

- [ ] **Step 5: Commit Task 1**

Before committing:

```bash
git status --short
```

Stage only:

```bash
git add scripts/rag/candidate-review-ui-core.mjs scripts/tests/rag/candidate-review-ui-core.test.mjs
git commit -m "feat: export manual candidate corrections"
```

Do not stage `.nvmrc`, artifacts, `docs/reviews/*.md`, `.superpowers/sdd/*`, or unrelated plan files.

---

### Task 2: Browser Correction Editor and KaTeX Preview

**Files:**
- Modify: `scripts/rag/candidate-review-ui-core.mjs`
- Modify: `scripts/rag/build-candidate-review-ui.mjs`
- Modify: `scripts/tests/rag/candidate-review-ui-core.test.mjs`
- Modify: `scripts/tests/rag/candidate-review-ui-cli.test.mjs`

**Interfaces:**
- Consumes from Task 1:
  - `reviewState[candidate.id].corrected_text`
  - seed export fields `original_question_text` and `has_manual_correction`
- Produces:
  - `renderCandidateReviewHtml(appData, { katexCss, katexJs })`
  - browser-side correction editor and correction preview
  - CLI-generated HTML containing both KaTeX CSS and KaTeX JS

- [ ] **Step 1: Write failing core HTML tests**

In `scripts/tests/rag/candidate-review-ui-core.test.mjs`, update the existing `renderCandidateReviewHtml` call:

```js
const html = renderCandidateReviewHtml(appData, {
  katexCss: ".katex{font:normal}",
  katexJs: "window.katex={renderToString:function(){return '<span class=\\\"katex\\\">math</span>';}};",
});
```

Add assertions:

```js
assert.equal(html.includes('id="corrected-text"'), true);
assert.equal(html.includes('id="corrected-preview"'), true);
assert.equal(html.includes("修正题目内容"), true);
assert.equal(html.includes("修正后预览"), true);
assert.equal(html.includes("原始识别结果"), true);
assert.equal(html.includes("window.katex={renderToString"), true);
assert.equal(html.includes('id="katex-runtime"'), true);
assert.equal(html.includes('id="candidate-review-data"'), true);
assert.equal(html.includes('id="candidate-review-app"'), true);
assert.equal(html.includes("function renderMathTextForPreview"), true);
```

Update every other `renderCandidateReviewHtml(` call in the test file to pass both `katexCss` and `katexJs`. Use this command to find every call site:

```bash
rg -n "renderCandidateReviewHtml\\(" scripts/tests/rag/candidate-review-ui-core.test.mjs scripts/tests/rag/candidate-review-ui-cli.test.mjs scripts/rag
```

Expected: every call uses the new shape:

```js
renderCandidateReviewHtml(appData, { katexCss: "...", katexJs: "..." })
```

- [ ] **Step 2: Write failing browser state test**

In the VM helper area of `scripts/tests/rag/candidate-review-ui-core.test.mjs`, replace any helper that assumes exactly two anonymous `<script>` tags with helpers that extract scripts by stable `id`.

Add:

```js
function extractScriptById(html, scriptId) {
  const pattern = new RegExp(
    `<script id="${scriptId}">([\\s\\S]*?)<\\/script>`,
  );
  const match = html.match(pattern);
  assert.ok(match, `missing script ${scriptId}`);
  return match[1];
}
```

Then add a browser scenario helper:

```js
function runBrowserCorrectionScenario(
  appData,
  editedText,
  { initialReviewState = null, searchText = "" } = {},
) {
  const html = renderCandidateReviewHtml(appData, {
    katexCss: ".katex{}",
    katexJs: "window.katex={renderToString:function(value){return '<span class=\"katex\">' + value + '</span>';}};",
  });
  const katexScript = extractScriptById(html, "katex-runtime");
  const dataScript = extractScriptById(html, "candidate-review-data");
  const appScript = extractScriptById(html, "candidate-review-app");
  const nodes = new Map();
  const storage = new Map();
  const document = {
    addEventListener(type, handler) {
      nodes.set(`listener:${type}`, handler);
    },
    querySelector(selector) {
      if (!nodes.has(selector)) {
        nodes.set(selector, {
          dataset: {},
          innerHTML: "",
          textContent: "",
          value: "",
          hidden: false,
          setAttribute(name, value) {
            this[name] = value;
          },
          addEventListener() {},
          click() {},
          focus() {},
          select() {},
        });
      }
      return nodes.get(selector);
    },
  };
  const context = {
    Blob,
    Date,
    JSON,
    String,
    URL: {
      createObjectURL() {
        return "blob:review-seed";
      },
      revokeObjectURL() {},
    },
    document,
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, value);
      },
    },
    navigator: {},
    window: {},
  };

  if (initialReviewState) {
    storage.set(appData.storage_key, JSON.stringify(initialReviewState));
  }

  vm.runInNewContext(`${katexScript}\n${dataScript}\n${appScript}`, context);
  const textarea = nodes.get("#corrected-text");
  textarea.value = editedText;
  nodes.get("listener:input")({
    target: textarea,
  });
  if (searchText) {
    const searchInput = nodes.get("#search");
    searchInput.value = searchText;
    nodes.get("listener:input")({
      target: searchInput,
    });
  }

  const savedState = JSON.parse(storage.get(appData.storage_key));
  return {
    listHtml: nodes.get("#candidate-list").innerHTML,
    savedState,
    previewHtml: nodes.get("#corrected-preview").innerHTML,
  };
}
```

Add test:

```js
{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const editedText = "1. 修正后 $f(x)$\\nA. 1\\nB. 2\\nC. 3";
  const result = runBrowserCorrectionScenario(appData, editedText);
  assert.equal(result.savedState["candidate-1"].corrected_text, editedText);
  assert.equal(result.previewHtml.includes("katex"), true);
}
```

Add a second browser scenario that checks HTML injection is escaped in preview:

```js
{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const result = runBrowserCorrectionScenario(
    appData,
    "1. 修正 <script>alert(1)</script> $x$",
  );
  assert.equal(result.previewHtml.includes("<script>alert(1)</script>"), false);
  assert.equal(result.previewHtml.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), true);
}
```

- [ ] **Step 3: Run core test and verify it fails**

Run:

```bash
node scripts/tests/rag/candidate-review-ui-core.test.mjs
```

Expected:

```text
AssertionError ... corrected-text
```

or:

```text
AssertionError ... missing script katex-runtime
```

- [ ] **Step 4: Inline KaTeX browser JS in HTML**

Change `renderCandidateReviewHtml` signature in `scripts/rag/candidate-review-ui-core.mjs`:

```js
export function renderCandidateReviewHtml(appData, { katexCss, katexJs }) {
```

Add an inline script escaping helper near `escapeScriptJson`:

```js
function escapeInlineScript(value) {
  return String(value ?? "").replace(/<\/script/gi, "<\\/script");
}
```

Add KaTeX JS before the app data script, using stable script ids:

```html
  <script id="katex-runtime">${escapeInlineScript(katexJs)}</script>
  <script id="candidate-review-data">window.__CANDIDATE_REVIEW_DATA__ = ${dataJson};</script>
  <script id="candidate-review-app">${renderBrowserScript()}</script>
```

In `scripts/rag/build-candidate-review-ui.mjs`, add:

```js
const katexJs = await readKatexJs();
```

Pass:

```js
renderCandidateReviewHtml(appData, { katexCss, katexJs })
```

Add:

```js
async function readKatexJs() {
  try {
    return await readFile(resolve("node_modules/katex/dist/katex.min.js"), "utf8");
  } catch {
    throw new Error("failed to read KaTeX JS");
  }
}
```

- [ ] **Step 5: Add correction editor UI**

In `renderBrowserScript()`, add helpers:

```js
const PREVIEW_RENDER_DELAY_MS = 180;
let previewRenderTimer = null;

function getReviewStateItem(id) {
  return state[id] || {};
}
function getCorrectionText(candidate) {
  const correctedText = getReviewStateItem(candidate.id).corrected_text;
  if (typeof correctedText === "string") return correctedText;
  return candidate.normalized_text;
}
function getExportQuestionText(candidate) {
  const correctedText = getCorrectionText(candidate);
  if (!correctedText.trim()) return candidate.normalized_text;
  return correctedText;
}
function hasCorrection(candidate) {
  return hasManualCorrection(candidate, getExportQuestionText(candidate));
}
function hasManualCorrection(candidate, questionText) {
  return questionText.trim() !== candidate.normalized_text.trim();
}
function setCorrectionText(id, text) {
  state[id] = { ...(state[id] || {}), corrected_text: text, updated_at: new Date().toISOString() };
  saveState();
  scheduleCorrectionPreview();
}
function scheduleCorrectionPreview() {
  clearTimeout(previewRenderTimer);
  previewRenderTimer = setTimeout(renderCorrectionPreview, PREVIEW_RENDER_DELAY_MS);
}
function renderMathTextForPreview(text) {
  // Keep this behavior aligned with the Node-side renderMathTextToHtml helper.
  const warnings = [];
  const source = String(text ?? "");
  const pattern = /(?<!\\\\)(\\$\\$?)([\\s\\S]+?)(?<!\\\\)\\1/g;
  let cursor = 0;
  let html = "";
  for (const match of source.matchAll(pattern)) {
    html += escapeHtml(source.slice(cursor, match.index));
    const delimiter = match[1];
    const math = match[2];
    try {
      html += window.katex.renderToString(math, {
        displayMode: delimiter === "$$",
        throwOnError: true,
        strict: "ignore",
      });
    } catch {
      warnings.push("math_render_failed");
      html += escapeHtml(delimiter + math + delimiter);
    }
    cursor = match.index + match[0].length;
  }
  html += escapeHtml(source.slice(cursor));
  return { html: html.replace(/\\n/g, "<br>"), warnings: [...new Set(warnings)] };
}
function renderCorrectionPreview() {
  const selected = appData.candidates.find((candidate) => candidate.id === selectedId);
  const preview = document.querySelector("#corrected-preview");
  const warning = document.querySelector("#correction-preview-warning");
  if (!selected || !preview || !warning) return;
  const previewText = getExportQuestionText(selected);
  const rendered = renderMathTextForPreview(previewText);
  preview.innerHTML = rendered.html;
  if (!getCorrectionText(selected).trim()) {
    warning.textContent = "修正内容为空，将使用原始识别结果";
  } else {
    warning.textContent = rendered.warnings.length > 0 ? "公式渲染失败，已保留原始文本" : "";
  }
}
```

When the selected detail panel is first rendered, call `renderCorrectionPreview()` directly so the preview appears immediately. Use debounced `scheduleCorrectionPreview()` only for textarea input events.

Update list summary marker:

```js
const correctionMark = hasCorrection(candidate) ? " · corrected" : "";
...
' · warnings ' + escapeHtml(candidate.warnings.length) + escapeHtml(correctionMark) + '</small>'
```

Update `filteredCandidates()` so search covers manual corrections:

```js
function filteredCandidates() {
  return appData.candidates.filter((candidate) => {
    const status = state[candidate.id]?.status || "unreviewed";
    const correctedText = getReviewStateItem(candidate.id).corrected_text || "";
    const haystack = [
      candidate.question_number,
      candidate.section_title,
      candidate.normalized_text,
      correctedText,
    ]
      .join(" ")
      .toLowerCase();
    if (query && !haystack.includes(query.toLowerCase())) return false;
    if (filter === "all") return true;
    if (filter === "warnings") return candidate.warnings.length > 0;
    return status === filter;
  });
}
```

Update detail `innerHTML`:

```js
'<h3>原始识别结果</h3>' +
'<div class="question-body original-question">' + selected.rendered_html + '</div>' +
'<h3>修正题目内容</h3>' +
'<textarea id="corrected-text">' + escapeHtml(getCorrectionText(selected)) + '</textarea>' +
'<h3>修正后预览</h3>' +
'<div id="corrected-preview" class="question-body"></div>' +
'<p id="correction-preview-warning" class="warning-text"></p>' +
...
```

After setting `candidate-detail.innerHTML`, call:

```js
renderCorrectionPreview();
```

Update input handler:

```js
if (event.target.id === "corrected-text" && selectedId) {
  setCorrectionText(selectedId, event.target.value);
}
```

- [ ] **Step 6: Update browser export path**

In browser `buildSeed()`, replace current item mapping with:

```js
items: approved.map((candidate) => {
  const questionText = getExportQuestionText(candidate);
  return {
    id: candidate.id,
    candidate_id: candidate.id,
    review_status: "reviewed",
    reviewer_note: state[candidate.id]?.note || "",
    question_text: questionText,
    original_question_text: candidate.normalized_text,
    has_manual_correction: hasManualCorrection(candidate, questionText),
    solution_outline: null,
    mistake_causes: [],
    knowledge_points: candidate.section_title ? ["导数", candidate.section_title] : ["导数"],
    difficulty: null,
    variant_level: null,
    source_ref: candidate.source_ref,
    original_extraction_confidence: candidate.extraction_confidence,
    original_warnings: candidate.warnings,
  };
}),
```

At the end of `renderBrowserScript()`, expose a narrow test hook for VM assertions:

```js
window.__candidateReviewTestHooks__ = { buildSeed };
```

This is acceptable because the review UI is a local artifact; it must not expose secrets or external side effects.

- [ ] **Step 7: Add browser export parity tests**

In `scripts/tests/rag/candidate-review-ui-core.test.mjs`, extend `runBrowserCorrectionScenario` to return the browser seed:

```js
nodes.get("listener:click")({
  target: {
    closest(selector) {
      if (selector === "[data-status]") {
        return { dataset: { status: "approved" } };
      }
      return null;
    },
  },
});

const browserSeed = context.window.__candidateReviewTestHooks__.buildSeed();
return {
  browserSeed,
  savedState,
  previewHtml: nodes.get("#corrected-preview").innerHTML,
};
```

Add parity assertion:

```js
{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const editedText = "1. 修正后 $f(x)$\\nA. 1\\nB. 2\\nC. 3";
  const result = runBrowserCorrectionScenario(appData, editedText);
  const nodeSeed = buildReviewedPracticeSeed({
    appData,
    reviewState: result.savedState,
    exportedAt: result.browserSeed.exported_at,
  });
  assert.deepEqual(result.browserSeed.items[0], nodeSeed.items[0]);
}
```

Add blank-correction browser parity:

```js
{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const result = runBrowserCorrectionScenario(appData, "   ");
  assert.equal(result.browserSeed.items[0].question_text, appData.candidates[0].normalized_text);
  assert.equal(result.browserSeed.items[0].has_manual_correction, false);
}
```

Add corrected-text search check:

```js
{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const result = runBrowserCorrectionScenario(appData, "修正关键词 $x$", {
    searchText: "修正关键词",
  });
  assert.equal(result.savedState["candidate-1"].corrected_text.includes("修正关键词"), true);
  assert.equal(result.listHtml.includes("candidate-1"), true);
}
```

Add legacy-state compatibility:

```js
{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const result = runBrowserCorrectionScenario(appData, "1. 已知 $f(x)$, 则()\\nA. 1\\nB. 2", {
    initialReviewState: {
      "candidate-1": {
        status: "approved",
        note: "旧 state，无 corrected_text",
        updated_at: "2026-06-22T00:00:00.000Z",
      },
    },
  });
  assert.equal(result.browserSeed.items[0].has_manual_correction, false);
}
```

- [ ] **Step 8: Add styles**

In `renderStyles()`, add:

```css
    .original-question { color: #516171; background: #fffdf8; border: 1px solid #e7e0d3; padding: 12px; }
    #corrected-preview { background: #ffffff; border: 1px solid #d6e1dc; padding: 12px; min-height: 80px; }
    .warning-text { color: #9f3a2d; }
```

- [ ] **Step 9: Update CLI tests**

In `scripts/tests/rag/candidate-review-ui-cli.test.mjs`, after reading generated HTML, add:

```js
assert.equal(html.includes("<link"), false);
assert.equal(html.includes("https://"), false);
assert.equal(html.includes("http://"), false);
assert.equal(html.includes("function renderMathTextForPreview"), true);
assert.equal(html.includes("修正题目内容"), true);
assert.equal(html.includes("修正后预览"), true);
assert.equal(html.includes("original_question_text"), true);
assert.equal(html.includes("has_manual_correction"), true);
```

- [ ] **Step 10: Run focused tests**

Run:

```bash
node scripts/tests/rag/candidate-review-ui-core.test.mjs
node scripts/tests/rag/candidate-review-ui-cli.test.mjs
```

Expected:

```text
candidate review ui core tests passed
candidate review ui cli tests passed
```

- [ ] **Step 11: Regenerate local review page**

Run:

```bash
node scripts/rag/build-candidate-review-ui.mjs \
  --input artifacts/rag/mineru-candidate-mapper/candidate_questions.json \
  --out artifacts/rag/candidate-review
```

Expected:

```text
Wrote /Users/kk/learning-assistant/artifacts/rag/candidate-review/index.html
Wrote /Users/kk/learning-assistant/artifacts/rag/candidate-review/review_manifest.json
Candidates: 72
```

Do not commit generated files.

- [ ] **Step 12: Run full verification**

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

- [ ] **Step 13: Commit Task 2**

Before committing:

```bash
git status --short
```

Stage only:

```bash
git add scripts/rag/candidate-review-ui-core.mjs scripts/rag/build-candidate-review-ui.mjs scripts/tests/rag/candidate-review-ui-core.test.mjs scripts/tests/rag/candidate-review-ui-cli.test.mjs
git commit -m "feat: add manual correction preview to candidate review ui"
```

Do not stage `.nvmrc`, artifacts, `docs/reviews/*.md`, `.superpowers/sdd/*`, or unrelated plan files.

---

### Task 3: Documentation and Reviewer Handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md`

**Interfaces:**
- Consumes:
  - Final behavior from Tasks 1-2.
- Produces:
  - Updated design spec explaining manual corrections, preview, and export fields.

- [ ] **Step 1: Update design spec**

In `docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md`, update the exported seed schema section to include:

```ts
interface ReviewedPracticeSeedItem {
  id: string;
  candidate_id: string;
  review_status: "reviewed";
  reviewer_note: string;
  question_text: string;
  original_question_text: string;
  has_manual_correction: boolean;
  solution_outline: null;
  mistake_causes: [];
  knowledge_points: string[];
  difficulty: null;
  variant_level: null;
  source_ref: CandidateQuestion["source_ref"];
  original_extraction_confidence: CandidateQuestion["extraction_confidence"];
  original_warnings: string[];
}
```

Add a short subsection under page design:

```md
### 人工修正与预览

详情面板展示只读的原始识别结果，并提供 `修正题目内容` textarea。该字段用于修正整道题内容，包括题干、公式、选项和换行。页面在本地用 KaTeX 重新渲染 `修正后预览`，帮助人工检查公式是否正确。

修正内容保存到浏览器 `localStorage`，不写回 `candidate_questions.json`。导出 seed 时，`question_text` 使用修正后的内容，`original_question_text` 保留 OCR 原文，`has_manual_correction` 标识是否发生人工修正。
```

Update implementation section to mention:

```md
第一版审核页会内联 KaTeX CSS 和 JS，因此直接以 `file://` 打开时也能预览修正后的公式。
```

- [ ] **Step 2: Run documentation and regression checks**

Run:

```bash
rg -n "original_question_text|has_manual_correction|修正题目内容|修正后预览|candidate_questions.json" docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md
node scripts/run-tests.mjs default
npm run build
git diff --check
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
```

Expected:

```text
rg finds the new documented fields and correction UI labels
default suite passes
build succeeds
git diff --check has no output
git ls-files ... has no output
```

- [ ] **Step 3: Commit Task 3**

Before committing:

```bash
git status --short
```

Stage only:

```bash
git add docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md
git commit -m "docs: document candidate correction workflow"
```

Do not stage `.nvmrc`, artifacts, `docs/reviews/*.md`, `.superpowers/sdd/*`, or unrelated plan files.

---

## Final Verification

After all tasks are complete, run:

```bash
node scripts/run-tests.mjs default
npm run build
node scripts/rag/build-candidate-review-ui.mjs \
  --input artifacts/rag/mineru-candidate-mapper/candidate_questions.json \
  --out artifacts/rag/candidate-review
git diff --check
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
git status --short --branch
```

Expected:

```text
default suite passes
build succeeds
generator reports Candidates: 72
git diff --check has no output
git ls-files ... has no output
only known unrelated local files remain unstaged
```

Manual browser check:

1. Refresh `file:///Users/kk/learning-assistant/artifacts/rag/candidate-review/index.html`.
2. Open one candidate.
3. Edit `修正题目内容`, including at least one formula and one option.
4. Confirm `修正后预览` updates and renders formula with KaTeX.
5. Mark the candidate `Approved`.
6. Click `复制 JSON` or `下载 reviewed_practice_seed.json`.
7. Confirm the exported item includes:

```json
{
  "question_text": "人工修正后的完整题目内容",
  "original_question_text": "OCR 原始完整题目内容",
  "has_manual_correction": true
}
```

Do not commit the downloaded seed or generated review page.
