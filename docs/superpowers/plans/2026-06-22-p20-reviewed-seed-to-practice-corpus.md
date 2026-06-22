# P2.0 Reviewed Seed To Practice Corpus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the locally reviewed `reviewed_practice_seed.json` into a stable local `practice_corpus.json` fixture for the next metadata/text search prototype.

**Architecture:** Keep `reviewed_practice_seed.json` as the immutable human-review output and generate a separate ignored `practice_corpus.json` artifact from it. Implement a pure core mapper with runtime validation, a small CLI wrapper, and focused tests before touching the real local seed. The first corpus schema is intentionally minimal: no pgvector, no embeddings, no retrieval API, and no `variant_level` in the corpus item.

**Tech Stack:** Node.js ESM scripts, `node:fs/promises`, `node:path`, existing `scripts/run-tests.mjs`, local ignored artifacts under `artifacts/rag/**`.

## Global Constraints

- Do not modify `src/app/**`, `src/components/**`, `app/api/**`, frontend product routes, diagnosis pipeline, persistence, Supabase schema, `memory_events`, `student_profiles`, mistake book behavior, evidence API, pgvector, embedding, metadata/text search, or retrieval APIs.
- Do not commit real `reviewed_practice_seed.json`, generated `practice_corpus.json`, generated reports, PDF, MinerU JSON, page images, ZIP files, or anything under `artifacts/`.
- Do not read or print `.env.local`, `MINERU_API_TOKEN`, service role keys, or external API credentials.
- Preserve the existing user-modified `.nvmrc`; do not stage it unless explicitly requested.
- `docs/reviews/*.md` remains local-only unless the user explicitly asks to commit a review file.
- Keep `sample_diagnosis` stable and untouched.
- Treat reviewed seed content as local teaching-material data; tests must use synthetic fixture text, not real教辅题文.
- `reviewed_practice_seed.json` remains the audit/review artifact; `practice_corpus.json` is the retrieval-ready fixture derived from it.
- First corpus version is `practice-corpus-v0`.
- First corpus item does not include `variant_level`; that belongs to a future recommendation result, not the corpus source item.
- If a reviewed seed item contains `variant_level`, it is intentionally dropped during corpus generation. Future recommendation logic will derive variant level dynamically from the current mistake and retrieved source item.
- First corpus item keeps `difficulty: null` as a题目本体难度占位字段.
- First corpus item uses `knowledge_points: ["derivative"]` as the internal coarse key for this导数专题 corpus; original seed `knowledge_points` are preserved under review/source metadata, not used as internal keys.

---

## File Structure

- Create `scripts/rag/practice-corpus-core.mjs`
  - Validate the minimal reviewed seed shape.
  - Convert approved reviewed seed items into `practice-corpus-v0` items.
  - Build deterministic `practice-...` ids from `candidate_id`.
  - Build `search_text` from question text plus section/source context.
- Create `scripts/rag/build-practice-corpus.mjs`
  - CLI entry point.
  - Read reviewed seed JSON.
  - Call the core mapper.
  - Write `artifacts/rag/practice-corpus/practice_corpus.json` by default.
  - Print item count and paths without printing full question text.
- Create `scripts/tests/rag/practice-corpus-core.test.mjs`
  - Cover validation, mapping, field contracts, internal knowledge key, no `variant_level`, and search text construction.
- Create `scripts/tests/rag/practice-corpus-cli.test.mjs`
  - Cover CLI success and failure modes using synthetic fixtures.
- Modify `scripts/run-tests.mjs`
  - Add both new RAG tests to the default suite near existing RAG tests.
- Modify `docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md`
  - Add a short handoff note: reviewed seed is converted into `practice_corpus.json`; corpus does not include `variant_level`.
- Optional generated artifact, not committed:
  - `artifacts/rag/practice-corpus/practice_corpus.json`

## Data Contract

### Input: Reviewed Seed

The converter consumes the existing local seed shape:

```js
{
  exported_at: "2026-06-22T09:34:11.902Z",
  source_candidate_file: "artifacts/rag/mineru-candidate-mapper/candidate_questions.json",
  source_file: "/Users/kk/Documents/导数专题.pdf",
  mineru_json_file: "artifacts/rag/MinerU-test/导数专题.json",
  approved_count: 69,
  items: [
    {
      id: "mineru-page-001-block-011-q-1",
      candidate_id: "mineru-page-001-block-011-q-1",
      review_status: "reviewed",
      reviewer_note: "",
      question_text: "1. ...",
      original_question_text: "1. ...",
      has_manual_correction: false,
      solution_outline: null,
      mistake_causes: [],
      knowledge_points: ["导数", "考点 1 导数的概念、几何意义与运算"],
      difficulty: null,
      source_ref: {
        pdf_page_index: 1,
        section_title: "考点 1 导数的概念、几何意义与运算"
      },
      original_extraction_confidence: "high",
      original_warnings: []
    }
  ]
}
```

### Output: Practice Corpus

The converter writes:

```js
{
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-22T10:00:00.000Z",
  source_seed_file: "artifacts/rag/reviewed_practice_seed.json",
  source_seed_exported_at: "2026-06-22T09:34:11.902Z",
  item_count: 69,
  items: [
    {
      id: "practice-mineru-page-001-block-011-q-1",
      source_candidate_id: "mineru-page-001-block-011-q-1",
      question_text: "1. ...",
      search_text: "1. ...\n导数\n考点 1 导数的概念、几何意义与运算",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念、几何意义与运算",
      difficulty: null,
      source_ref: {
        pdf_page_index: 1,
        section_title: "考点 1 导数的概念、几何意义与运算"
      },
      review_meta: {
        reviewed_seed_item_id: "mineru-page-001-block-011-q-1",
        review_status: "reviewed",
        reviewer_note: "",
        has_manual_correction: false,
        original_question_text: "1. ...",
        seed_knowledge_points: ["导数", "考点 1 导数的概念、几何意义与运算"],
        original_extraction_confidence: "high",
        original_warnings: []
      }
    }
  ]
}
```

Rules:

- `items` includes only seed items with `review_status === "reviewed"` and non-empty `question_text`.
- `item_count` equals `items.length`.
- `id` is `practice-${source_candidate_id}`.
- `source_candidate_id` is copied from `candidate_id`.
- `question_text` is copied from seed `question_text`.
- `search_text` is deterministic and includes `question_text`, `"导数"`, and `section_title` if present.
- `knowledge_points` is always `["derivative"]` in this P2.0 derivative-only corpus.
- `section_title` is `source_ref.section_title ?? null`.
- `difficulty` is copied only if seed `difficulty` is a number from 1 to 5; otherwise `null`.
- No corpus item contains `variant_level`.
- `review_meta` is read-only audit metadata. It is not used for retrieval ranking in P2.0; searchable fields are `question_text` and `search_text`.
- `review_meta.original_question_text` preserves the OCR/parser original for audit only; it is not the main search field.

---

### Task 1: Practice Corpus Core Mapper

**Files:**
- Create: `scripts/rag/practice-corpus-core.mjs`
- Create: `scripts/tests/rag/practice-corpus-core.test.mjs`

**Interfaces:**
- Consumes:
  - `validateReviewedPracticeSeed(value)`
  - `buildPracticeCorpus({ seed, sourceSeedFile, generatedAt })`
- Produces:
  - `validateReviewedPracticeSeed(value): { ok: true, seed } | { ok: false, errors: string[] }`
  - `buildPracticeCorpus({ seed, sourceSeedFile, generatedAt }): PracticeCorpus`

- [ ] **Step 1: Write failing core tests**

Create `scripts/tests/rag/practice-corpus-core.test.mjs`:

```js
import assert from "node:assert/strict";

import {
  buildPracticeCorpus,
  validateReviewedPracticeSeed,
} from "../../rag/practice-corpus-core.mjs";

const seed = {
  exported_at: "2026-06-22T09:34:11.902Z",
  source_candidate_file: "artifacts/rag/mineru-candidate-mapper/candidate_questions.json",
  source_file: "/tmp/source.pdf",
  mineru_json_file: "artifacts/rag/MinerU-test/source.json",
  approved_count: 2,
  items: [
    {
      id: "candidate-1",
      candidate_id: "candidate-1",
      review_status: "reviewed",
      reviewer_note: "修正了根号",
      question_text: "1. 已知 $f(x)=\\sqrt{x}$，求导数.",
      original_question_text: "1. 已知 $f(x)=x$，求导数.",
      has_manual_correction: true,
      solution_outline: null,
      mistake_causes: [],
      knowledge_points: ["导数", "考点 1 导数的概念"],
      difficulty: null,
      source_ref: {
        pdf_page_index: 1,
        book_page_label: null,
        side: "full",
        block_start_index: 11,
        block_start_bbox: [1, 2, 3, 4],
        block_end_pdf_page_index: 1,
        block_end_index: 12,
        block_end_bbox: [1, 5, 3, 8],
        section_title: "考点 1 导数的概念",
        crop_image_path: null,
      },
      original_extraction_confidence: "high",
      original_warnings: [],
    },
    {
      id: "candidate-2",
      candidate_id: "candidate-2",
      review_status: "needs_fix",
      reviewer_note: "依赖图像",
      question_text: "2. 如图所示...",
      original_question_text: "2. 如图所示...",
      has_manual_correction: false,
      solution_outline: null,
      mistake_causes: [],
      knowledge_points: ["导数"],
      difficulty: 3,
      variant_level: "same_pattern",
      source_ref: {
        pdf_page_index: 2,
        section_title: "图像题",
      },
      original_extraction_confidence: "medium",
      original_warnings: ["missing_image"],
    },
  ],
};

{
  const result = validateReviewedPracticeSeed(seed);
  assert.equal(result.ok, true);

  const invalid = validateReviewedPracticeSeed({ items: "bad" });
  assert.equal(invalid.ok, false);
  assert.equal(
    invalid.errors.some((error) => error.includes("items must be an array")),
    true,
  );

  const invalidItem = structuredClone(seed);
  invalidItem.items[0].candidate_id = 123;
  invalidItem.items[0].question_text = "   ";
  const invalidItemResult = validateReviewedPracticeSeed(invalidItem);
  assert.equal(invalidItemResult.ok, false);
  assert.equal(
    invalidItemResult.errors.some((error) =>
      error.includes("item[0].candidate_id must be a string"),
    ),
    true,
  );
  assert.equal(
    invalidItemResult.errors.some((error) =>
      error.includes("item[0].question_text must be a non-empty string"),
    ),
    true,
  );
}

{
  const corpus = buildPracticeCorpus({
    seed,
    sourceSeedFile: "artifacts/rag/reviewed_practice_seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });

  assert.equal(corpus.corpus_version, "practice-corpus-v0");
  assert.equal(corpus.generated_at, "2026-06-22T10:00:00.000Z");
  assert.equal(corpus.source_seed_file, "artifacts/rag/reviewed_practice_seed.json");
  assert.equal(corpus.source_seed_exported_at, "2026-06-22T09:34:11.902Z");
  assert.equal(corpus.item_count, 1);
  assert.equal(corpus.items.length, 1);

  const item = corpus.items[0];
  assert.equal(item.id, "practice-candidate-1");
  assert.equal(item.source_candidate_id, "candidate-1");
  assert.equal(item.question_text, seed.items[0].question_text);
  assert.equal(item.search_text.includes(seed.items[0].question_text), true);
  assert.equal(item.search_text.includes("导数"), true);
  assert.equal(item.search_text.includes("考点 1 导数的概念"), true);
  assert.deepEqual(item.knowledge_points, ["derivative"]);
  assert.equal(item.section_title, "考点 1 导数的概念");
  assert.equal(item.difficulty, null);
  assert.deepEqual(item.source_ref, seed.items[0].source_ref);
  assert.equal(item.review_meta.reviewed_seed_item_id, "candidate-1");
  assert.equal(item.review_meta.review_status, "reviewed");
  assert.equal(item.review_meta.reviewer_note, "修正了根号");
  assert.equal(item.review_meta.has_manual_correction, true);
  assert.equal(item.review_meta.original_question_text, seed.items[0].original_question_text);
  assert.deepEqual(item.review_meta.seed_knowledge_points, [
    "导数",
    "考点 1 导数的概念",
  ]);
  assert.equal(item.review_meta.original_extraction_confidence, "high");
  assert.deepEqual(item.review_meta.original_warnings, []);
  assert.equal("variant_level" in item, false);
}

{
  const blankQuestionSeed = structuredClone(seed);
  blankQuestionSeed.items.push({
    ...structuredClone(seed.items[0]),
    id: "candidate-blank",
    candidate_id: "candidate-blank",
    review_status: "reviewed",
    question_text: "   ",
  });
  const corpus = buildPracticeCorpus({
    seed: blankQuestionSeed,
    sourceSeedFile: "seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });
  assert.equal(corpus.items.some((item) => item.source_candidate_id === "candidate-blank"), false);
}

{
  const numericDifficultySeed = structuredClone(seed);
  numericDifficultySeed.items[0].difficulty = 4;
  const corpus = buildPracticeCorpus({
    seed: numericDifficultySeed,
    sourceSeedFile: "seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });
  assert.equal(corpus.items[0].difficulty, 4);
}

{
  const lowDifficultySeed = structuredClone(seed);
  lowDifficultySeed.items[0].difficulty = 0;
  const lowCorpus = buildPracticeCorpus({
    seed: lowDifficultySeed,
    sourceSeedFile: "seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });
  assert.equal(lowCorpus.items[0].difficulty, null);

  const highDifficultySeed = structuredClone(seed);
  highDifficultySeed.items[0].difficulty = 6;
  const highCorpus = buildPracticeCorpus({
    seed: highDifficultySeed,
    sourceSeedFile: "seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });
  assert.equal(highCorpus.items[0].difficulty, null);
}

{
  const missingSectionSeed = structuredClone(seed);
  delete missingSectionSeed.items[0].source_ref.section_title;
  const corpus = buildPracticeCorpus({
    seed: missingSectionSeed,
    sourceSeedFile: "seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });
  assert.equal(corpus.items[0].section_title, null);
  assert.equal(corpus.items[0].search_text.includes(seed.items[0].question_text), true);
  assert.equal(corpus.items[0].search_text.includes("导数"), true);
}

{
  const missingSourceRefSeed = structuredClone(seed);
  delete missingSourceRefSeed.items[0].source_ref;
  const corpus = buildPracticeCorpus({
    seed: missingSourceRefSeed,
    sourceSeedFile: "seed.json",
    generatedAt: "2026-06-22T10:00:00.000Z",
  });
  assert.equal(corpus.items[0].section_title, null);
  assert.equal(corpus.items[0].source_ref, null);
}

console.log("practice corpus core tests passed");
```

- [ ] **Step 2: Run core test and verify it fails**

Run:

```bash
node scripts/tests/rag/practice-corpus-core.test.mjs
```

Expected:

```text
Error [ERR_MODULE_NOT_FOUND]
```

- [ ] **Step 3: Implement core mapper**

Create `scripts/rag/practice-corpus-core.mjs`:

```js
const CORPUS_VERSION = "practice-corpus-v0";
const DERIVATIVE_KNOWLEDGE_POINT = "derivative";

export function validateReviewedPracticeSeed(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["seed must be an object"] };
  }
  if (!Array.isArray(value.items)) {
    errors.push("items must be an array");
  } else {
    value.items.forEach((item, index) => {
      validateSeedItem(item, index, errors);
    });
  }
  if ("exported_at" in value && typeof value.exported_at !== "string") {
    errors.push("exported_at must be a string when present");
  }
  if ("approved_count" in value && typeof value.approved_count !== "number") {
    errors.push("approved_count must be a number when present");
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, seed: value };
}

export function buildPracticeCorpus({ seed, sourceSeedFile, generatedAt }) {
  const items = seed.items
    .filter((item) => item.review_status === "reviewed")
    .filter((item) => String(item.question_text ?? "").trim())
    .map((item) => buildPracticeCorpusItem(item));

  return {
    corpus_version: CORPUS_VERSION,
    generated_at: generatedAt,
    source_seed_file: sourceSeedFile,
    source_seed_exported_at: seed.exported_at ?? null,
    item_count: items.length,
    items,
  };
}

function buildPracticeCorpusItem(item) {
  const sectionTitle = getSectionTitle(item);
  return {
    id: `practice-${item.candidate_id}`,
    source_candidate_id: item.candidate_id,
    question_text: item.question_text,
    search_text: buildSearchText(item.question_text, sectionTitle),
    knowledge_points: [DERIVATIVE_KNOWLEDGE_POINT],
    section_title: sectionTitle,
    difficulty: normalizeDifficulty(item.difficulty),
    source_ref: item.source_ref ?? null,
    review_meta: {
      reviewed_seed_item_id: item.id,
      review_status: item.review_status,
      reviewer_note: typeof item.reviewer_note === "string" ? item.reviewer_note : "",
      has_manual_correction: item.has_manual_correction === true,
      original_question_text:
        typeof item.original_question_text === "string" ? item.original_question_text : "",
      seed_knowledge_points: Array.isArray(item.knowledge_points)
        ? item.knowledge_points.filter((value) => typeof value === "string")
        : [],
      original_extraction_confidence:
        typeof item.original_extraction_confidence === "string"
          ? item.original_extraction_confidence
          : null,
      original_warnings: Array.isArray(item.original_warnings)
        ? item.original_warnings.filter((value) => typeof value === "string")
        : [],
    },
  };
}

function buildSearchText(questionText, sectionTitle) {
  return [
    questionText,
    "导数",
    sectionTitle,
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .join("\n");
}

function getSectionTitle(item) {
  const sectionTitle = item?.source_ref?.section_title;
  return typeof sectionTitle === "string" && sectionTitle.trim() ? sectionTitle : null;
}

function normalizeDifficulty(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

function validateSeedItem(item, index, errors) {
  const path = `item[${index}]`;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    errors.push(`${path} must be an object`);
    return;
  }
  requireString(item, "id", errors, path);
  requireString(item, "candidate_id", errors, path);
  requireString(item, "review_status", errors, path);
  requireNonEmptyString(item, "question_text", errors, path);
  if ("original_question_text" in item && typeof item.original_question_text !== "string") {
    errors.push(`${path}.original_question_text must be a string when present`);
  }
  if ("source_ref" in item && item.source_ref !== null && typeof item.source_ref !== "object") {
    errors.push(`${path}.source_ref must be an object or null when present`);
  }
}

function requireString(value, key, errors, path) {
  if (typeof value[key] !== "string") {
    errors.push(`${path}.${key} must be a string`);
  }
}

function requireNonEmptyString(value, key, errors, path) {
  if (typeof value[key] !== "string" || !value[key].trim()) {
    errors.push(`${path}.${key} must be a non-empty string`);
  }
}
```

- [ ] **Step 4: Run core test and verify it passes**

Run:

```bash
node scripts/tests/rag/practice-corpus-core.test.mjs
```

Expected:

```text
practice corpus core tests passed
```

- [ ] **Step 5: Commit Task 1**

Before committing:

```bash
git status --short
```

Stage only:

```bash
git add scripts/rag/practice-corpus-core.mjs scripts/tests/rag/practice-corpus-core.test.mjs
git commit -m "feat: add practice corpus mapper"
```

Do not stage `.nvmrc`, artifacts, `docs/reviews/*.md`, `.superpowers/sdd/*`, or unrelated plan files.

---

### Task 2: Practice Corpus CLI And Real Artifact Generation

**Files:**
- Create: `scripts/rag/build-practice-corpus.mjs`
- Create: `scripts/tests/rag/practice-corpus-cli.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes:
  - `validateReviewedPracticeSeed(value)`
  - `buildPracticeCorpus({ seed, sourceSeedFile, generatedAt })`
- Produces:
  - CLI command:
    ```bash
    node scripts/rag/build-practice-corpus.mjs --input <reviewed_practice_seed.json> [--out <dir>]
    ```
  - Default output:
    ```text
    artifacts/rag/practice-corpus/practice_corpus.json
    ```

- [ ] **Step 1: Write failing CLI tests**

Create `scripts/tests/rag/practice-corpus-cli.test.mjs`:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = join(process.cwd(), "scripts/rag/build-practice-corpus.mjs");
const tmpRoot = mkdtempSync(join(tmpdir(), "practice-corpus-"));
const inputPath = join(tmpRoot, "reviewed_practice_seed.json");
const outputDir = join(tmpRoot, "practice-corpus");

const seed = {
  exported_at: "2026-06-22T09:34:11.902Z",
  source_candidate_file: "candidate_questions.json",
  source_file: "/tmp/source.pdf",
  mineru_json_file: "/tmp/source.json",
  approved_count: 1,
  items: [
    {
      id: "candidate-1",
      candidate_id: "candidate-1",
      review_status: "reviewed",
      reviewer_note: "",
      question_text: "1. 求函数 $f(x)=x^2$ 的导数.",
      original_question_text: "1. 求函数 $f(x)=x^2$ 的导数.",
      has_manual_correction: false,
      solution_outline: null,
      mistake_causes: [],
      knowledge_points: ["导数", "考点 1 导数"],
      difficulty: null,
      source_ref: {
        pdf_page_index: 1,
        section_title: "考点 1 导数",
      },
      original_extraction_confidence: "high",
      original_warnings: [],
    },
  ],
};

writeFileSync(inputPath, `${JSON.stringify(seed, null, 2)}\n`);

{
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--input",
      inputPath,
      "--out",
      outputDir,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("practice_corpus.json"), true);
  assert.equal(result.stdout.includes("Items: 1"), true);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);

  const corpus = JSON.parse(readFileSync(join(outputDir, "practice_corpus.json"), "utf8"));
  assert.equal(corpus.corpus_version, "practice-corpus-v0");
  assert.equal(corpus.item_count, 1);
  assert.equal(corpus.items[0].id, "practice-candidate-1");
  assert.equal(corpus.items[0].knowledge_points[0], "derivative");
  assert.equal("variant_level" in corpus.items[0], false);
}

{
  const defaultOutRoot = join(tmpRoot, "default-out-root");
  mkdirSync(defaultOutRoot);
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--input", inputPath],
    { encoding: "utf8", cwd: defaultOutRoot },
  );

  assert.equal(result.status, 0, result.stderr);
  const corpus = JSON.parse(
    readFileSync(
      join(defaultOutRoot, "artifacts/rag/practice-corpus/practice_corpus.json"),
      "utf8",
    ),
  );
  assert.equal(corpus.item_count, 1);
}

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--input", join(tmpRoot, "missing.json")],
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
    [
      scriptPath,
      "--input",
      badPath,
      "--out",
      join(tmpRoot, "bad-out"),
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse reviewed practice seed JSON"), true);
}

{
  const invalidPath = join(tmpRoot, "invalid.json");
  writeFileSync(invalidPath, JSON.stringify({ items: "bad" }));
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--input",
      invalidPath,
      "--out",
      join(tmpRoot, "invalid-out"),
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("invalid reviewed practice seed"), true);
}

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--input"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--input requires a value"), true);
}

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--unknown"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("unknown argument"), true);
}

console.log("practice corpus cli tests passed");
```

- [ ] **Step 2: Run CLI test and verify it fails**

Run:

```bash
node scripts/tests/rag/practice-corpus-cli.test.mjs
```

Expected:

```text
Error: Cannot find module
```

- [ ] **Step 3: Implement CLI**

Create `scripts/rag/build-practice-corpus.mjs`:

```js
#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  buildPracticeCorpus,
  validateReviewedPracticeSeed,
} from "./practice-corpus-core.mjs";

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
  const outputDir = resolve(args.out ?? "artifacts/rag/practice-corpus");
  const inputText = await readInputText(inputPath);
  const parsed = parseSeedJson(inputText);
  const validation = validateReviewedPracticeSeed(parsed);
  if (!validation.ok) {
    throw new Error(`invalid reviewed practice seed: ${validation.errors.join(", ")}`);
  }

  const corpus = buildPracticeCorpus({
    seed: validation.seed,
    sourceSeedFile: formatLocalPath(inputPath),
    generatedAt: new Date().toISOString(),
  });

  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, "practice_corpus.json");
  await writeFile(outputPath, `${JSON.stringify(corpus, null, 2)}\n`);

  console.log(`Wrote ${outputPath}`);
  console.log(`Items: ${corpus.item_count}`);
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

function parseSeedJson(inputText) {
  try {
    return JSON.parse(inputText);
  } catch {
    throw new Error("failed to parse reviewed practice seed JSON");
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
  node scripts/rag/build-practice-corpus.mjs --input <reviewed_practice_seed.json> [--out <dir>]

Builds an ignored local practice corpus fixture from reviewed candidate questions.`);
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

- [ ] **Step 4: Add tests to the default suite**

Modify `scripts/run-tests.mjs` by inserting the new tests after the candidate review UI tests:

```js
    "scripts/tests/rag/candidate-review-ui-core.test.mjs",
    "scripts/tests/rag/candidate-review-ui-cli.test.mjs",
    "scripts/tests/rag/practice-corpus-core.test.mjs",
    "scripts/tests/rag/practice-corpus-cli.test.mjs",
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node scripts/tests/rag/practice-corpus-core.test.mjs
node scripts/tests/rag/practice-corpus-cli.test.mjs
```

Expected:

```text
practice corpus core tests passed
practice corpus cli tests passed
```

- [ ] **Step 6: Generate the real local corpus artifact**

Run:

```bash
node scripts/rag/build-practice-corpus.mjs \
  --input artifacts/rag/reviewed_practice_seed.json \
  --out artifacts/rag/practice-corpus
```

Expected:

```text
Wrote /Users/kk/learning-assistant/artifacts/rag/practice-corpus/practice_corpus.json
Items: 69
```

Do not commit `artifacts/rag/practice-corpus/practice_corpus.json`.

- [ ] **Step 7: Inspect the generated real corpus summary**

Run:

```bash
node --input-type=module <<'EOF'
import { readFile } from "node:fs/promises";
const corpus = JSON.parse(await readFile("artifacts/rag/practice-corpus/practice_corpus.json", "utf8"));
const withVariantLevel = corpus.items.filter((item) => "variant_level" in item);
const emptySearchText = corpus.items.filter((item) => !String(item.search_text ?? "").trim());
console.log(JSON.stringify({
  corpus_version: corpus.corpus_version,
  item_count: corpus.item_count,
  actual_items: corpus.items.length,
  with_variant_level: withVariantLevel.length,
  empty_search_text: emptySearchText.length,
  knowledge_points: [...new Set(corpus.items.flatMap((item) => item.knowledge_points))],
}, null, 2));
EOF
```

Expected:

```json
{
  "corpus_version": "practice-corpus-v0",
  "item_count": 69,
  "actual_items": 69,
  "with_variant_level": 0,
  "empty_search_text": 0,
  "knowledge_points": ["derivative"]
}
```

- [ ] **Step 8: Run full verification**

Run:

```bash
node scripts/run-tests.mjs default
npm run lint
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

- [ ] **Step 9: Commit Task 2**

Before committing:

```bash
git status --short
```

Stage only:

```bash
git add scripts/rag/build-practice-corpus.mjs scripts/tests/rag/practice-corpus-cli.test.mjs scripts/run-tests.mjs
git commit -m "feat: add practice corpus builder cli"
```

Do not stage `.nvmrc`, artifacts, `docs/reviews/*.md`, `.superpowers/sdd/*`, or unrelated plan files.

---

### Task 3: Documentation Handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md`

**Interfaces:**
- Consumes:
  - Final corpus schema from Tasks 1-2.
- Produces:
  - A documented handoff from reviewed seed to `practice_corpus.json`.

- [ ] **Step 1: Update design spec handoff section**

Modify `docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md`.

Find the final section that says:

```md
该 seed 仍不是正式 `practice_corpus`。下一阶段需要人工补齐 `knowledge_points`、`difficulty`、`variant_level` 和必要解析信息后，再进入 metadata/text search。
```

Replace it with:

~~~md
该 seed 仍不是正式 `practice_corpus`。下一阶段通过 `scripts/rag/build-practice-corpus.mjs` 生成 ignored artifact：

```text
artifacts/rag/reviewed_practice_seed.json
-> artifacts/rag/practice-corpus/practice_corpus.json
```

`practice_corpus.json` 是本地生成的 ignored artifact，不提交 Git。第一版 `practice_corpus` 只保留检索需要的最小字段：`question_text`、`search_text`、`knowledge_points: ["derivative"]`、`section_title`、`difficulty`、`source_ref` 和 `review_meta`。其中 `difficulty` 是题目本体难度，占位为 `null`；`review_meta` 只用于审计，不参与检索排序；`variant_level` 不进入 corpus，本阶段以后由“当前错题 -> 推荐结果”动态产生。
~~~

- [ ] **Step 2: Run documentation and regression checks**

Run:

```bash
rg -n "build-practice-corpus|practice_corpus|variant_level|difficulty|search_text" docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md
node scripts/run-tests.mjs default
npm run lint
npm run build
git diff --check
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
```

Expected:

```text
rg finds the new corpus handoff terms
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
git commit -m "docs: document practice corpus handoff"
```

Do not stage `.nvmrc`, artifacts, `docs/reviews/*.md`, `.superpowers/sdd/*`, or unrelated plan files.

---

## Final Verification

After all tasks are complete, run:

```bash
node scripts/run-tests.mjs default
npm run lint
npm run build
node scripts/rag/build-practice-corpus.mjs \
  --input artifacts/rag/reviewed_practice_seed.json \
  --out artifacts/rag/practice-corpus
node --input-type=module <<'EOF'
import { readFile } from "node:fs/promises";
const corpus = JSON.parse(await readFile("artifacts/rag/practice-corpus/practice_corpus.json", "utf8"));
const withVariantLevel = corpus.items.filter((item) => "variant_level" in item);
const emptySearchText = corpus.items.filter((item) => !String(item.search_text ?? "").trim());
console.log(JSON.stringify({
  corpus_version: corpus.corpus_version,
  item_count: corpus.item_count,
  actual_items: corpus.items.length,
  with_variant_level: withVariantLevel.length,
  empty_search_text: emptySearchText.length,
  knowledge_points: [...new Set(corpus.items.flatMap((item) => item.knowledge_points))],
}, null, 2));
EOF
git diff --check
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
git status --short --branch
```

Expected:

```text
default suite passes
build succeeds
generator reports Items: 69
corpus_version is practice-corpus-v0
item_count and actual_items are 69
with_variant_level is 0
empty_search_text is 0
knowledge_points is ["derivative"]
git diff --check has no output
git ls-files ... has no output
only known unrelated local files remain unstaged
```

## Self-Review

- Spec coverage: The plan covers reviewed seed validation, corpus schema generation, CLI artifact output, real 69-item local generation, default-suite test registration, documentation handoff, and no `variant_level` in corpus items.
- Scope check: The plan does not add pgvector, embeddings, retrieval API, frontend changes, database changes, `practice_corpus` committed fixtures, memory writes, or student profile changes.
- Placeholder scan: No `TBD`, `TODO`, or unspecified test steps remain.
- Type consistency: `buildPracticeCorpus({ seed, sourceSeedFile, generatedAt })`, `validateReviewedPracticeSeed(value)`, `practice-corpus-v0`, `practice-${candidate_id}`, `knowledge_points: ["derivative"]`, and `difficulty: null | 1 | 2 | 3 | 4 | 5` are used consistently across tasks.
