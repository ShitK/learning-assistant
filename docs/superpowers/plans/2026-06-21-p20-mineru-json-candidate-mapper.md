# P2.0 MinerU JSON Candidate Mapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline mapper that converts MinerU precise JSON output for the derivative PDF into schema-valid `candidate_questions.json` and a local extraction report.

**Architecture:** Keep this as an ignored-artifact, offline RAG ingestion step under `scripts/rag/`. Parse MinerU JSON blocks recursively, preserve schema-compatible source references plus MinerU block metadata, attach section context from titles, split candidates only at conservative question-start blocks, and emit unreviewed candidate data for human audit. Do not connect the output to frontend, pgvector, Supabase, `practice_corpus`, `memory_events`, or `student_profiles`.

**Tech Stack:** Node.js ESM scripts, built-in `node:fs/promises`, `node:path`, `node:crypto`, existing `scripts/run-tests.mjs`, MinerU JSON shape with `pdf_info[].para_blocks[]`, `lines[].spans[]`, nested `blocks[]`, and `inline_equation` spans.

Parsing notes:

- Use `pdf_info[].para_blocks[]` as the only extraction entrypoint. `preproc_blocks` is a preprocessing view and is not read by this mapper.
- Do not read `discarded_blocks` in this task.
- Ignore MinerU `merge_prev` for split decisions in the first mapper; split only by block order plus conservative question-start boundaries.
- Normalize whitespace for candidate display only. Human review should still be able to inspect the original MinerU JSON artifact when formula spacing looks suspicious.

## Global Constraints

- Do not modify `/api/diagnose`, `/api/confirm`, `/api/student-profile`, `/api/student-profile/evidence`, `memory_events`, `student_profiles`, mistake book behavior, Supabase schema, or frontend components.
- Do not add pgvector, Milvus, embeddings, retrieval API, runtime upload, or frontend RAG in this task.
- Do not commit `/Users/kk/Documents/导数专题.pdf`, MinerU ZIP output, generated JSON artifacts, page images, or `artifacts/`.
- Treat MinerU JSON as untrusted OCR candidate material requiring manual review.
- Do not write or print `MINERU_API_TOKEN`; this mapper consumes local JSON only and should not read `.env.local`.
- Keep generated output under ignored `artifacts/rag/mineru-candidate-mapper/` by default.
- Preserve the existing user-modified `.nvmrc`; do not stage it unless explicitly requested.
- Preserve the existing `sample_diagnosis` stable demo path.
- `docs/reviews/*.md` remains local-only unless the user explicitly asks to commit a review file.

---

## File Structure

- Create `scripts/rag/mineru-json-candidate-mapper-core.mjs`
  - Pure helper module. Owns MinerU block traversal, span text rendering, section context extraction, question boundary detection, candidate construction, validation summaries, and report rendering.
- Create `scripts/rag/map-mineru-json-to-candidates.mjs`
  - CLI wrapper. Reads a local MinerU JSON file, writes `candidate_questions.json` and `extraction_report.md` under ignored `artifacts/`, and prints only output paths plus summary counts.
- Create `scripts/tests/rag/mineru-json-candidate-mapper-core.test.mjs`
  - Pure tests using small inline MinerU-like fixtures. No real PDF, no real token, no network.
- Create `scripts/tests/rag/mineru-json-candidate-mapper-cli.test.mjs`
  - CLI tests using temporary fixture JSON under `/tmp` or `artifacts/tmp-test/`. Verifies output files and safe argument behavior.
- Modify `scripts/run-tests.mjs`
  - Add both mapper tests to the default suite.
- Modify `docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md`
  - Add a short implementation note that MinerU JSON is mapped into candidate questions as an unreviewed candidate layer.
- Optional local artifact, not committed:
  - `artifacts/rag/mineru-candidate-mapper/candidate_questions.json`
  - `artifacts/rag/mineru-candidate-mapper/extraction_report.md`

## Candidate Output Contract

The mapper should produce this shape:

```js
{
  source_file: "/Users/kk/Documents/导数专题.pdf",
  source_file_sha256: "hex-or-empty-if-source-pdf-not-read",
  mineru_json_file: "/Users/kk/learning-assistant/artifacts/rag/MinerU-test/导数专题.json",
  mineru_json_sha256: "hex",
  extractor: "mineru-json-candidate-mapper",
  extracted_at: "2026-06-21T00:00:00.000Z",
  page_count: 8,
  candidates: [
    {
      id: "mineru-page-001-block-009-q-1",
      source_ref: {
        pdf_page_index: 1,
        book_page_label: null,
        side: "full",
        block_start_index: 9,
        block_start_bbox: [46, 36, 367, 51],
        block_end_pdf_page_index: 1,
        block_end_index: 13,
        block_end_bbox: [66, 56, 228, 93],
        section_title: "考点 1 导数的概念、几何意义与运算",
        crop_image_path: null
      },
      question_number: "1",
      raw_ocr_text: "1.(山东潍坊素养测评)...",
      normalized_text: "1.(山东潍坊素养测评)...",
      answer_or_solution_candidate: null,
      extraction_confidence: "high",
      warnings: []
    }
  ],
  warnings: []
}
```

Schema alignment notes:

- `source_file` keeps the original source document path when known; for this local spike pass `/Users/kk/Documents/导数专题.pdf` with `--source-file`. If the original source is unknown, set `source_file` to the MinerU JSON path and add `source_file_unknown` to global warnings.
- `mineru_json_file` and `mineru_json_sha256` identify the actual mapper input.
- `source_ref.pdf_page_index`, `book_page_label`, `side`, and `crop_image_path` stay compatible with the OCR ingestion design spec. MinerU candidates set `side: "full"` because MinerU already returns page-level layout blocks instead of left/right crop slices.
- `block_start_index`, `block_start_bbox`, `block_end_pdf_page_index`, `block_end_index`, `block_end_bbox`, and `section_title` are MinerU mapper extensions for manual review and traceability.
- `extractor` is intentionally added to distinguish this candidate layer from local OCR candidates. The design spec must be updated in Task 3 to document this field.
- The report should aggregate ignored non-question blocks by type instead of emitting one warning per ignored block.

---

### Task 1: Pure MinerU JSON Parsing Helpers

**Files:**
- Create: `scripts/rag/mineru-json-candidate-mapper-core.mjs`
- Create: `scripts/tests/rag/mineru-json-candidate-mapper-core.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes:
  - MinerU JSON parsed as `unknown`.
  - MinerU page records with `pdf_info[].para_blocks[]`.
- Produces:
  - `renderMineruSpanText(span: unknown): string`
  - `extractMineruBlockText(block: unknown): string`
  - `normalizeCandidateText(text: string): string`
  - `isQuestionStartBlock(blockText: string): { ok: true, questionNumber: string } | { ok: false }`
  - `extractPageBlocks(mineruJson: unknown): MineruPageBlock[]`
  - `buildCandidateQuestions(input: BuildCandidateQuestionsInput): CandidateQuestionExtraction`
  - `renderCandidateMapperReport(extraction: CandidateQuestionExtraction): string`

- [ ] **Step 1: Write failing core tests**

Create `scripts/tests/rag/mineru-json-candidate-mapper-core.test.mjs`:

```js
import assert from "node:assert/strict";

import {
  buildCandidateQuestions,
  extractMineruBlockText,
  extractPageBlocks,
  isQuestionStartBlock,
  normalizeCandidateText,
  renderCandidateMapperReport,
  renderMineruSpanText,
} from "../../rag/mineru-json-candidate-mapper-core.mjs";

const mineruFixture = {
  pdf_info: [
    {
      page_idx: 0,
      para_blocks: [
        {
          type: "title",
          index: 1,
          bbox: [10, 10, 100, 30],
          lines: [
            {
              spans: [{ type: "text", content: "考点 1 导数的概念、几何意义与运算" }],
            },
          ],
        },
        {
          type: "text",
          index: 2,
          bbox: [10, 40, 500, 80],
          lines: [
            {
              spans: [
                { type: "text", content: "1.(山东潍坊素养测评)设 " },
                { type: "inline_equation", content: "f(x)" },
                { type: "text", content: " 为 R 上的可导函数,则曲线 " },
                { type: "inline_equation", content: "y=f(x)" },
                { type: "text", content: " 的切线斜率为 ()" },
              ],
            },
          ],
        },
        {
          type: "text",
          index: 3,
          bbox: [10, 90, 200, 110],
          lines: [{ spans: [{ type: "text", content: "A. 2" }] }],
        },
        {
          type: "text",
          index: 4,
          bbox: [210, 90, 400, 110],
          lines: [{ spans: [{ type: "text", content: "B. -1" }] }],
        },
        {
          type: "text",
          index: 5,
          bbox: [10, 120, 500, 150],
          lines: [
            {
              spans: [
                { type: "text", content: "2.(天津模拟)已知函数 " },
                { type: "inline_equation", content: "f(x)=\\frac{\\ln x}{x^2}" },
                { type: "text", content: ", 则 " },
                { type: "inline_equation", content: "f'(x)" },
                { type: "text", content: "= ( )" },
              ],
            },
          ],
        },
        {
          type: "list",
          index: 6,
          bbox: [10, 160, 500, 210],
          blocks: [
            {
              type: "text",
              index: 1,
              lines: [{ spans: [{ type: "text", content: "(1)求单调区间." }] }],
            },
            {
              type: "text",
              index: 2,
              lines: [
                {
                  spans: [
                    { type: "text", content: "(2)求 " },
                    { type: "inline_equation", content: "f(x)" },
                    { type: "text", content: " 的最大值." },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "title",
          index: 7,
          bbox: [10, 220, 500, 250],
          lines: [{ spans: [{ type: "text", content: "考点 2 导数与函数的单调性" }] }],
        },
        {
          type: "text",
          index: 8,
          bbox: [10, 260, 500, 300],
          lines: [{ spans: [{ type: "text", content: "A. a = \\ln 1.2, b = 5" }] }],
        },
        {
          type: "text",
          index: 9,
          bbox: [10, 310, 500, 340],
          lines: [{ spans: [{ type: "text", content: "12.(浙江宁波十校)若函数单调递增,则 a 和 b 的可能取值为()" }] }],
        },
      ],
    },
  ],
};

assert.equal(renderMineruSpanText({ type: "text", content: "设 " }), "设 ");
assert.equal(renderMineruSpanText({ type: "inline_equation", content: "f(x)" }), "$f(x)$");
assert.equal(renderMineruSpanText({ type: "unknown", content: "x" }), "x");

assert.equal(
  extractMineruBlockText(mineruFixture.pdf_info[0].para_blocks[5]),
  "(1)求单调区间.\n(2)求 $f(x)$ 的最大值.",
);

assert.equal(normalizeCandidateText("  1.  题干\\r\\n\\r\\nA. 选项  "), "1. 题干\\nA. 选项");
assert.deepEqual(isQuestionStartBlock("1.(山东潍坊)设 f(x)"), { ok: true, questionNumber: "1" });
assert.deepEqual(isQuestionStartBlock("12.(浙江宁波十校)若函数单调递增"), { ok: true, questionNumber: "12" });
assert.deepEqual(isQuestionStartBlock("1. 题干"), { ok: true, questionNumber: "1" });
assert.deepEqual(isQuestionStartBlock("12. 题干"), { ok: true, questionNumber: "12" });
assert.deepEqual(isQuestionStartBlock("A. a = \\ln 1.2, b = 5"), { ok: false });
assert.deepEqual(isQuestionStartBlock("0.2"), { ok: false });
assert.deepEqual(isQuestionStartBlock("1.2 倍"), { ok: false });
assert.deepEqual(isQuestionStartBlock("12.34"), { ok: false });

{
  const pageBlocks = extractPageBlocks(mineruFixture);
  assert.equal(pageBlocks.length, 9);
  assert.equal(pageBlocks[0].pdfPageIndex, 1);
  assert.equal(pageBlocks[0].blockIndex, 1);
  assert.equal(pageBlocks[0].text, "考点 1 导数的概念、几何意义与运算");
  assert.equal(pageBlocks[5].text.includes("(2)求 $f(x)$ 的最大值."), true);
}

{
  const extraction = buildCandidateQuestions({
    mineruJson: mineruFixture,
    sourceFile: "/tmp/导数专题.pdf",
    sourceFileSha256: "source123",
    mineruJsonFile: "/tmp/导数专题.json",
    mineruJsonSha256: "json123",
    extractedAt: "2026-06-21T00:00:00.000Z",
  });

  assert.equal(extraction.source_file, "/tmp/导数专题.pdf");
  assert.equal(extraction.source_file_sha256, "source123");
  assert.equal(extraction.mineru_json_file, "/tmp/导数专题.json");
  assert.equal(extraction.mineru_json_sha256, "json123");
  assert.equal(extraction.extractor, "mineru-json-candidate-mapper");
  assert.equal(extraction.page_count, 1);
  assert.equal(extraction.candidates.length, 3);

  assert.equal(extraction.candidates[0].id, "mineru-page-001-block-002-q-1");
  assert.equal(extraction.candidates[0].question_number, "1");
  assert.equal(extraction.candidates[0].source_ref.book_page_label, null);
  assert.equal(extraction.candidates[0].source_ref.side, "full");
  assert.deepEqual(extraction.candidates[0].source_ref.block_start_bbox, [10, 40, 500, 80]);
  assert.equal(
    extraction.candidates[0].source_ref.section_title,
    "考点 1 导数的概念、几何意义与运算",
  );
  assert.equal(extraction.candidates[0].normalized_text.includes("$f(x)$"), true);
  assert.equal(extraction.candidates[0].normalized_text.includes("A. 2"), true);
  assert.equal(extraction.candidates[0].extraction_confidence, "high");

  assert.equal(extraction.candidates[1].question_number, "2");
  assert.equal(extraction.candidates[1].normalized_text.includes("(2)求 $f(x)$ 的最大值."), true);
  assert.equal(extraction.candidates[1].warnings.includes("contains_nested_list_block"), true);
  assert.equal(extraction.candidates[1].extraction_confidence, "medium");

  assert.equal(extraction.candidates[2].question_number, "12");
  assert.equal(
    extraction.candidates[2].source_ref.section_title,
    "考点 2 导数与函数的单调性",
  );
  assert.equal(extraction.candidates[2].normalized_text.includes("A. a ="), false);
  assert.equal(extraction.candidates[2].warnings.includes("missing_options_or_solution"), true);
}

{
  const restartedFixture = {
    pdf_info: [
      {
        page_idx: 0,
        para_blocks: [
          {
            type: "title",
            index: 1,
            lines: [{ spans: [{ type: "text", content: "考点 1 导数的概念" }] }],
          },
          {
            type: "text",
            index: 2,
            lines: [{ spans: [{ type: "text", content: "1.(测试一)题干 ()" }] }],
          },
          {
            type: "text",
            index: 3,
            lines: [{ spans: [{ type: "text", content: "A. 1" }] }],
          },
          {
            type: "title",
            index: 4,
            lines: [{ spans: [{ type: "text", content: "考点 2 导数与单调性" }] }],
          },
          {
            type: "text",
            index: 5,
            lines: [{ spans: [{ type: "text", content: "1.(测试二)题干 ()" }] }],
          },
          {
            type: "text",
            index: 6,
            lines: [{ spans: [{ type: "text", content: "A. 2" }] }],
          },
        ],
      },
    ],
  };

  const extraction = buildCandidateQuestions({
    mineruJson: restartedFixture,
    sourceFile: "/tmp/导数专题.pdf",
    sourceFileSha256: "source123",
    mineruJsonFile: "/tmp/导数专题.json",
    mineruJsonSha256: "json123",
    extractedAt: "2026-06-21T00:00:00.000Z",
  });

  assert.equal(extraction.candidates.length, 2);
  assert.notEqual(extraction.candidates[0].id, extraction.candidates[1].id);
  assert.equal(
    extraction.warnings.some((warning) => warning.startsWith("question_number_restarted")),
    true,
  );
}

{
  const report = renderCandidateMapperReport(
    buildCandidateQuestions({
      mineruJson: mineruFixture,
      sourceFile: "/tmp/导数专题.pdf",
      sourceFileSha256: "source123",
      mineruJsonFile: "/tmp/导数专题.json",
      mineruJsonSha256: "json123",
      extractedAt: "2026-06-21T00:00:00.000Z",
    }),
  );

  assert.equal(report.includes("# P2.0 MinerU JSON 候选题映射报告"), true);
  assert.equal(report.includes("- PDF 页数：1"), true);
  assert.equal(report.includes("- 候选题数量：3"), true);
  assert.equal(report.includes("考点 1 导数的概念、几何意义与运算"), true);
  assert.equal(report.includes("MINERU_API_TOKEN"), false);
}

console.log("mineru json candidate mapper core tests passed");
```

- [ ] **Step 2: Run core test and verify it fails**

Run:

```bash
node scripts/tests/rag/mineru-json-candidate-mapper-core.test.mjs
```

Expected:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module ... mineru-json-candidate-mapper-core.mjs
```

- [ ] **Step 3: Implement the pure helper module**

Create `scripts/rag/mineru-json-candidate-mapper-core.mjs`:

```js
const QUESTION_START_PATTERN = /^([1-9]\d{0,2})[.．、](?!\d)\s*\S/;
const OPTION_PATTERN = /(?:^|\n)\s*[A-D][.．、]\s*\S/;

export function renderMineruSpanText(span) {
  const content = typeof span?.content === "string" ? span.content : "";
  if (!content) {
    return "";
  }
  if (span?.type === "inline_equation") {
    return `$${content}$`;
  }
  return content;
}

export function extractMineruBlockText(block) {
  const childBlocks = Array.isArray(block?.blocks) ? block.blocks : [];
  if (childBlocks.length > 0) {
    return childBlocks
      .map(extractMineruBlockText)
      .map((text) => text.trim())
      .filter(Boolean)
      .join("\n");
  }

  const lines = Array.isArray(block?.lines) ? block.lines : [];
  return lines
    .map((line) => {
      const spans = Array.isArray(line?.spans) ? line.spans : [];
      return spans.map(renderMineruSpanText).join("");
    })
    .map((text) => text.trim())
    .filter(Boolean)
    .join("\n");
}

export function normalizeCandidateText(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function isQuestionStartBlock(blockText) {
  const normalizedText = normalizeCandidateText(blockText);
  const match = normalizedText.match(QUESTION_START_PATTERN);
  if (!match) {
    return { ok: false };
  }
  return { ok: true, questionNumber: match[1] };
}

export function extractPageBlocks(mineruJson) {
  const pages = Array.isArray(mineruJson?.pdf_info) ? mineruJson.pdf_info : [];
  return pages.flatMap((page, pageIndex) => {
    const blocks = Array.isArray(page?.para_blocks) ? page.para_blocks : [];
    return blocks.map((block, localIndex) => {
      const blockIndex =
        Number.isInteger(block?.index) && block.index > 0 ? block.index : localIndex + 1;
      return {
        pdfPageIndex: pageIndex + 1,
        blockIndex,
        type: typeof block?.type === "string" ? block.type : "unknown",
        bbox: Array.isArray(block?.bbox) ? block.bbox : null,
        text: normalizeCandidateText(extractMineruBlockText(block)),
        hasNestedBlocks: Array.isArray(block?.blocks) && block.blocks.length > 0,
      };
    });
  });
}

export function buildCandidateQuestions({
  mineruJson,
  sourceFile,
  sourceFileSha256,
  mineruJsonFile,
  mineruJsonSha256,
  extractedAt,
  warnings: inputWarnings = [],
}) {
  const pageBlocks = extractPageBlocks(mineruJson);
  const candidates = [];
  const warnings = [...inputWarnings];
  const ignoredBlockCounts = {};
  let currentSectionTitle = null;
  let currentCandidate = null;

  for (const block of pageBlocks) {
    if (!block.text) {
      continue;
    }

    if (isSectionTitleBlock(block)) {
      currentSectionTitle = block.text;
      continue;
    }

    const questionStart = isQuestionStartBlock(block.text);
    if (questionStart.ok) {
      if (currentCandidate) {
        candidates.push(finalizeCandidate(currentCandidate));
      }
      currentCandidate = {
        id: buildCandidateId(block.pdfPageIndex, block.blockIndex, questionStart.questionNumber),
        source_ref: {
          pdf_page_index: block.pdfPageIndex,
          book_page_label: null,
          side: "full",
          block_start_index: block.blockIndex,
          block_start_bbox: block.bbox,
          block_end_pdf_page_index: block.pdfPageIndex,
          block_end_index: block.blockIndex,
          block_end_bbox: block.bbox,
          section_title: currentSectionTitle,
          crop_image_path: null,
        },
        question_number: questionStart.questionNumber,
        raw_ocr_text: block.text,
        normalized_text: block.text,
        answer_or_solution_candidate: null,
        extraction_confidence: "high",
        warnings: [],
      };
      appendBlockWarnings(currentCandidate, block);
      continue;
    }

    if (!currentCandidate) {
      const key = `ignored_${block.type}_blocks`;
      ignoredBlockCounts[key] = (ignoredBlockCounts[key] ?? 0) + 1;
      continue;
    }

    currentCandidate.raw_ocr_text = `${currentCandidate.raw_ocr_text}\n${block.text}`;
    currentCandidate.normalized_text = normalizeCandidateText(currentCandidate.raw_ocr_text);
    currentCandidate.source_ref.block_end_pdf_page_index = block.pdfPageIndex;
    currentCandidate.source_ref.block_end_index = block.blockIndex;
    currentCandidate.source_ref.block_end_bbox = block.bbox;
    appendBlockWarnings(currentCandidate, block);
  }

  if (currentCandidate) {
    candidates.push(finalizeCandidate(currentCandidate));
  }

  if (candidates.length === 0) {
    warnings.push("question_split_failed");
  }

  warnings.push(...buildQuestionNumberWarnings(candidates));
  for (const [key, count] of Object.entries(ignoredBlockCounts)) {
    warnings.push(`${key}:${count}`);
  }

  return {
    source_file: sourceFile,
    source_file_sha256: sourceFileSha256,
    mineru_json_file: mineruJsonFile,
    mineru_json_sha256: mineruJsonSha256,
    extractor: "mineru-json-candidate-mapper",
    extracted_at: extractedAt,
    page_count: Array.isArray(mineruJson?.pdf_info) ? mineruJson.pdf_info.length : 0,
    candidates,
    warnings: [...new Set(warnings)],
  };
}

export function renderCandidateMapperReport(extraction) {
  const confidenceCounts = countBy(extraction.candidates, (candidate) => candidate.extraction_confidence);
  const sections = [...new Set(
    extraction.candidates
      .map((candidate) => candidate.source_ref.section_title)
      .filter(Boolean),
  )];
  const warningCandidates = extraction.candidates.filter((candidate) => candidate.warnings.length > 0);

  return [
    "# P2.0 MinerU JSON 候选题映射报告",
    "",
    "## 输入",
    "",
    `- 文件：${extraction.source_file}`,
    `- SHA256：${extraction.source_file_sha256}`,
    `- MinerU JSON：${extraction.mineru_json_file}`,
    `- MinerU JSON SHA256：${extraction.mineru_json_sha256}`,
    `- PDF 页数：${extraction.page_count}`,
    `- 抽取时间：${extraction.extracted_at}`,
    "",
    "## 结果",
    "",
    `- 候选题数量：${extraction.candidates.length}`,
    `- high：${confidenceCounts.high ?? 0}`,
    `- medium：${confidenceCounts.medium ?? 0}`,
    `- low：${confidenceCounts.low ?? 0}`,
    "",
    "## 章节上下文",
    "",
    ...formatList(sections),
    "",
    "## 全局 Warnings",
    "",
    ...formatList(extraction.warnings),
    "",
    "## 需要人工审核的候选",
    "",
    ...formatList(
      warningCandidates.slice(0, 20).map((candidate) => {
        return `${candidate.id} ${candidate.warnings.join(", ")}`;
      }),
    ),
    "",
    "## 下一步",
    "",
    "- 人工抽查题号连续性、公式、选项和跨页题。",
    "- 只把人工校对后的题目提升为 practice_corpus。",
    "- 如果候选层稳定，再做 metadata/text search；暂不上 pgvector。",
    "",
  ].join("\n");
}

function isSectionTitleBlock(block) {
  return block.type === "title";
}

function buildCandidateId(pdfPageIndex, blockIndex, questionNumber) {
  return `mineru-page-${String(pdfPageIndex).padStart(3, "0")}-block-${String(blockIndex).padStart(
    3,
    "0",
  )}-q-${questionNumber}`;
}

function appendBlockWarnings(candidate, block) {
  if (block.hasNestedBlocks) {
    candidate.warnings.push("contains_nested_list_block");
  }
  if (block.type === "image") {
    candidate.warnings.push("contains_image_block");
  }
}

function finalizeCandidate(candidate) {
  candidate.normalized_text = normalizeCandidateText(candidate.raw_ocr_text);
  if (!OPTION_PATTERN.test(candidate.normalized_text)) {
    candidate.warnings.push("missing_options_or_solution");
  }
  if (candidate.normalized_text.length < 30) {
    candidate.warnings.push("short_candidate_text");
  }
  candidate.warnings = [...new Set(candidate.warnings)];
  candidate.extraction_confidence = chooseConfidence(candidate);
  return candidate;
}

function chooseConfidence(candidate) {
  if (candidate.warnings.includes("short_candidate_text")) {
    return "low";
  }
  if (candidate.warnings.length > 0) {
    return "medium";
  }
  return "high";
}

function buildQuestionNumberWarnings(candidates) {
  const warnings = [];
  let previousGlobalNumber = null;
  let previousGlobalSection = null;

  for (const candidate of candidates) {
    const number = Number(candidate.question_number);
    if (!Number.isInteger(number)) {
      continue;
    }
    const section = candidate.source_ref.section_title ?? "<no_section>";
    if (previousGlobalNumber !== null && number <= previousGlobalNumber) {
      warnings.push(
        `question_number_restarted:${previousGlobalSection ?? "<no_section>"}->${section}:${previousGlobalNumber}->${number}`,
      );
    }
    previousGlobalNumber = number;
    previousGlobalSection = section;
  }

  const sectionMap = new Map();
  for (const candidate of candidates) {
    const section = candidate.source_ref.section_title ?? "<no_section>";
    const list = sectionMap.get(section) ?? [];
    list.push(Number(candidate.question_number));
    sectionMap.set(section, list);
  }

  for (const [section, numbers] of sectionMap.entries()) {
    let previous = null;
    for (const number of numbers) {
      if (!Number.isInteger(number)) {
        continue;
      }
      if (previous !== null && number <= previous) {
        warnings.push(`question_number_restarted:${section}:${previous}->${number}`);
      } else if (previous !== null && number > previous + 1) {
        warnings.push(`question_number_gap:${section}:${previous}->${number}`);
      }
      previous = number;
    }
  }

  return warnings;
}

function countBy(items, getKey) {
  const counts = {};
  for (const item of items) {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function formatList(items) {
  if (!items || items.length === 0) {
    return ["- 无"];
  }
  return items.map((item) => `- ${item}`);
}
```

- [ ] **Step 4: Add mapper tests to default suite**

Modify `scripts/run-tests.mjs` by inserting the new core test near the other RAG tests:

```js
const suites = {
  default: [
    "scripts/tests/architecture/architecture-boundaries.test.mjs",
    "scripts/tests/rag/derivative-pdf-ocr-core.test.mjs",
    "scripts/tests/rag/ocr-derivative-pdf-cli.test.mjs",
    "scripts/tests/rag/mineru-precise-smoke-core.test.mjs",
    "scripts/tests/rag/mineru-precise-smoke-cli.test.mjs",
    "scripts/tests/rag/mineru-json-candidate-mapper-core.test.mjs",
    "scripts/tests/image-diagnosis/vision-extraction-parser.test.mjs",
  ],
};
```

Keep all existing suite entries; only add the new file.

- [ ] **Step 5: Run core test and default tests**

Run:

```bash
node scripts/tests/rag/mineru-json-candidate-mapper-core.test.mjs
node scripts/run-tests.mjs default
```

Expected:

```text
mineru json candidate mapper core tests passed
```

and the default suite exits with status `0`.

- [ ] **Step 6: Commit Task 1**

Before committing, run:

```bash
git status --short
```

Stage only:

```bash
git add scripts/rag/mineru-json-candidate-mapper-core.mjs scripts/tests/rag/mineru-json-candidate-mapper-core.test.mjs scripts/run-tests.mjs
git commit -m "test: add mineru json candidate mapper helpers"
```

Do not stage `.nvmrc`, `.env.local`, `artifacts/`, or `docs/reviews/*.md`.

---

### Task 2: Offline Mapper CLI

**Files:**
- Create: `scripts/rag/map-mineru-json-to-candidates.mjs`
- Create: `scripts/tests/rag/mineru-json-candidate-mapper-cli.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes from Task 1:
  - `buildCandidateQuestions(input)`
  - `renderCandidateMapperReport(extraction)`
- Produces:
  - CLI command:

```bash
node scripts/rag/map-mineru-json-to-candidates.mjs \
  --input artifacts/rag/MinerU-test/导数专题.json \
  --source-file /Users/kk/Documents/导数专题.pdf \
  --out artifacts/rag/mineru-candidate-mapper
```

  - `candidate_questions.json`
  - `extraction_report.md`

- [ ] **Step 1: Write failing CLI tests**

Create `scripts/tests/rag/mineru-json-candidate-mapper-cli.test.mjs`:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpRoot = mkdtempSync(join(tmpdir(), "mineru-json-candidate-mapper-"));
const inputPath = join(tmpRoot, "mineru.json");
const outDir = join(tmpRoot, "out");

writeFileSync(
  inputPath,
  JSON.stringify(
    {
      pdf_info: [
        {
          page_idx: 0,
          para_blocks: [
            {
              type: "title",
              index: 1,
              lines: [{ spans: [{ type: "text", content: "考点 1 导数的概念、几何意义与运算" }] }],
            },
            {
              type: "text",
              index: 2,
              lines: [{ spans: [{ type: "text", content: "1.(测试)已知函数 f(x), 则()" }] }],
            },
            {
              type: "text",
              index: 3,
              lines: [{ spans: [{ type: "text", content: "A. 1" }] }],
            },
            {
              type: "text",
              index: 4,
              lines: [{ spans: [{ type: "text", content: "B. 2" }] }],
            },
          ],
        },
      ],
    },
    null,
    2,
  ),
);

{
  const result = spawnSync(
    process.execPath,
    [
      "scripts/rag/map-mineru-json-to-candidates.mjs",
      "--input",
      inputPath,
      "--source-file",
      join(tmpRoot, "source.pdf"),
      "--out",
      outDir,
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("candidate_questions.json"), true);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);

  const output = JSON.parse(readFileSync(join(outDir, "candidate_questions.json"), "utf8"));
  assert.equal(output.source_file, join(tmpRoot, "source.pdf"));
  assert.equal(output.mineru_json_file, inputPath);
  assert.equal(output.extractor, "mineru-json-candidate-mapper");
  assert.equal(output.page_count, 1);
  assert.equal(output.candidates.length, 1);
  assert.equal(output.candidates[0].question_number, "1");

  const report = readFileSync(join(outDir, "extraction_report.md"), "utf8");
  assert.equal(report.includes("# P2.0 MinerU JSON 候选题映射报告"), true);
  assert.equal(report.includes("- 候选题数量：1"), true);
}

{
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/map-mineru-json-to-candidates.mjs", "--input", join(tmpRoot, "missing.json")],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("input file not found"), true);
}

{
  const badPath = join(tmpRoot, "bad.json");
  writeFileSync(badPath, "{not-json");
  const result = spawnSync(
    process.execPath,
    ["scripts/rag/map-mineru-json-to-candidates.mjs", "--input", badPath, "--out", join(tmpRoot, "bad-out")],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse MinerU JSON"), true);
}

console.log("mineru json candidate mapper cli tests passed");
```

- [ ] **Step 2: Run CLI test and verify it fails**

Run:

```bash
node scripts/tests/rag/mineru-json-candidate-mapper-cli.test.mjs
```

Expected:

```text
Cannot find module ... map-mineru-json-to-candidates.mjs
```

- [ ] **Step 3: Implement the CLI**

Create `scripts/rag/map-mineru-json-to-candidates.mjs`:

```js
#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildCandidateQuestions,
  renderCandidateMapperReport,
} from "./mineru-json-candidate-mapper-core.mjs";

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
  const sourceFile = args.sourceFile ? resolve(args.sourceFile) : inputPath;
  const outputDir = resolve(args.out ?? "artifacts/rag/mineru-candidate-mapper");
  const inputText = await readInputText(inputPath);
  const mineruJson = parseMineruJson(inputText);
  const warnings = args.sourceFile ? [] : ["source_file_unknown"];
  const extraction = buildCandidateQuestions({
    mineruJson,
    sourceFile,
    sourceFileSha256: "",
    mineruJsonFile: inputPath,
    mineruJsonSha256: createHash("sha256").update(inputText).digest("hex"),
    extractedAt: new Date().toISOString(),
    warnings,
  });

  await mkdir(outputDir, { recursive: true });
  const candidatePath = resolve(outputDir, "candidate_questions.json");
  const reportPath = resolve(outputDir, "extraction_report.md");
  await writeFile(candidatePath, `${JSON.stringify(extraction, null, 2)}\n`);
  await writeFile(reportPath, `${renderCandidateMapperReport(extraction)}\n`);

  console.log(`Wrote ${candidatePath}`);
  console.log(`Wrote ${reportPath}`);
  console.log(`Candidates: ${extraction.candidates.length}`);
  console.log(`Warnings: ${extraction.warnings.length}`);
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
    } else if (arg === "--source-file") {
      args.sourceFile = readOptionValue(argv, index, arg);
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

function parseMineruJson(inputText) {
  try {
    return JSON.parse(inputText);
  } catch {
    throw new Error("failed to parse MinerU JSON");
  }
}

function printHelp() {
  console.log(`Usage:
  node scripts/rag/map-mineru-json-to-candidates.mjs --input <mineru-json> [--source-file <pdf>] [--out <dir>]

Converts local MinerU precise JSON into ignored candidate_questions.json artifacts.`);
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
"scripts/tests/rag/mineru-json-candidate-mapper-cli.test.mjs",
```

Place it immediately after `scripts/tests/rag/mineru-json-candidate-mapper-core.test.mjs`.

- [ ] **Step 5: Run mapper CLI against the real local MinerU JSON**

Run:

```bash
node scripts/rag/map-mineru-json-to-candidates.mjs \
  --input artifacts/rag/MinerU-test/导数专题.json \
  --source-file /Users/kk/Documents/导数专题.pdf \
  --out artifacts/rag/mineru-candidate-mapper
```

Expected:

```text
Wrote .../candidate_questions.json
Wrote .../extraction_report.md
Candidates: <non-zero number>
Warnings: <number>
```

Then inspect only summary-level output:

```bash
node --input-type=module - <<'NODE'
import fs from "node:fs";
const data = JSON.parse(fs.readFileSync("artifacts/rag/mineru-candidate-mapper/candidate_questions.json", "utf8"));
console.log({
  page_count: data.page_count,
  candidates: data.candidates.length,
  first_ids: data.candidates.slice(0, 5).map((candidate) => candidate.id),
  first_question_numbers: data.candidates.slice(0, 10).map((candidate) => candidate.question_number),
  warnings: data.warnings,
});
NODE
```

Expected:

```text
{
  page_count: 8,
  candidates: <non-zero number>,
  first_ids: [...],
  first_question_numbers: [...],
  warnings: [...]
}
```

Do not paste full extracted textbook text into chat or commit it.

- [ ] **Step 6: Run tests**

Run:

```bash
node scripts/tests/rag/mineru-json-candidate-mapper-cli.test.mjs
node scripts/run-tests.mjs default
npm run build
```

Expected:

```text
mineru json candidate mapper cli tests passed
```

and all commands exit with status `0`.

- [ ] **Step 7: Commit Task 2**

Before committing, run:

```bash
git status --short
```

Stage only:

```bash
git add scripts/rag/map-mineru-json-to-candidates.mjs scripts/tests/rag/mineru-json-candidate-mapper-cli.test.mjs scripts/run-tests.mjs
git commit -m "feat: add mineru json candidate mapper cli"
```

Do not stage `.nvmrc`, `.env.local`, `artifacts/`, or `docs/reviews/*.md`.

---

### Task 3: Documentation and Boundary Closeout

**Files:**
- Modify: `docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md`
- Optional modify: `interview/mathtrace-project-narrative.md`

**Interfaces:**
- Consumes:
  - CLI output summary from Task 2.
  - Current P2.0 RAG boundary: RAG is a retrieval/source-material layer, not memory writes.
- Produces:
  - Spec note describing MinerU JSON mapper and remaining manual-review gap.
  - Optional interview narrative note only if the real mapper output is strong enough to claim a completed stage.

- [ ] **Step 1: Update the OCR ingestion design spec**

Append a short section to `docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md`:

```md
## 14. MinerU JSON 到候选题映射

MinerU 精准解析输出确认可以作为 P2.0 候选题来源，但仍只进入未审核候选层。当前 mapper 读取本地 MinerU JSON，递归解析 `para_blocks`、`lines.spans` 和嵌套 `blocks`，将 `inline_equation` 保留为 LaTeX 片段，并按保守题号边界生成 `candidate_questions.json`。

MinerU mapper 沿用候选题 schema，并增加以下追溯字段：

- 顶层 `extractor: "mineru-json-candidate-mapper"`。
- 顶层 `mineru_json_file` 和 `mineru_json_sha256`，记录实际 mapper 输入。
- `source_file` 优先记录原始 PDF 路径；若原始 PDF 未知，则记录 MinerU JSON 路径并给出 `source_file_unknown` warning。
- `source_ref.side` 固定为 `"full"`，`book_page_label` 为 `null`。
- `source_ref.block_start_index`、`block_start_bbox`、`block_end_pdf_page_index`、`block_end_index`、`block_end_bbox` 和 `section_title` 用于人工审核回看。

本阶段仍不做以下事情：

- 不把候选题直接写入 `practice_corpus`。
- 不接 pgvector、embedding 或前端检索。
- 不让 OCR/RAG 结果影响 `memory_events` 或 `student_profiles`。
- 不提交原始 PDF、MinerU 原始输出或生成的候选题 artifact。

进入下一阶段前，需要人工抽查题号连续性、公式准确性、选项完整性、跨页题和图像题。只有人工校对过的题目才能提升为可检索的 `practice_corpus`。
```

- [ ] **Step 2: Keep interview narrative out of scope unless explicitly requested**

Default: do not modify `interview/mathtrace-project-narrative.md` in this mapper task. If the user explicitly asks to include this milestone in interview storytelling after reviewing the real artifact, use a separate follow-up task and add a short P2.0 subsection like this:

```md
## P2.0 导数教辅资料 RAG 入库前置验证

### 当前状态
已完成本地 MinerU JSON 到候选题的离线映射验证。结果仍是候选题层，需要人工审核后才能进入 `practice_corpus`。

### 功能价值
这一阶段证明 MathTrace 的变式练习题源可以从真实教辅资料进入可追溯候选层，而不是依赖手写题库或模型凭空生成。

### 关键设计
流程保持为 `PDF/OCR 解析结果 -> candidate_questions.json -> 人工审核 -> practice_corpus -> 检索`。RAG 只负责题源检索与 grounding，不写入画像事实层。

### 技术决策与取舍
先用 MinerU JSON 做 metadata/text-ready 的候选题结构，不提前接 pgvector。这样能优先验证 OCR 和切题质量，避免把脏数据向量化后难以排查。

### 项目中的真实证据
- 代码：`scripts/rag/map-mineru-json-to-candidates.mjs`
- 测试：`scripts/tests/rag/mineru-json-candidate-mapper-core.test.mjs`
- 文档：`docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md`
- 验证：`node scripts/run-tests.mjs default`、`npm run build`
```

If the user has not asked to update interview narrative yet, do not modify it; record in final that narrative update is deferred until the real mapper output is reviewed.

- [ ] **Step 3: Run final verification**

Run:

```bash
node scripts/run-tests.mjs default
npm run build
git diff --check
git status --short
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
```

Expected:

```text
default tests pass
build succeeds
git diff --check has no output
git ls-files ... has no output
```

`git status --short` may still show unrelated `.nvmrc`; do not stage it.

- [ ] **Step 4: Commit Task 3**

Before committing, run:

```bash
git status --short
```

Stage only the documentation files intentionally changed:

```bash
git add docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md
git commit -m "docs: document mineru json candidate mapper boundary"
```

If `interview/mathtrace-project-narrative.md` was intentionally updated, include it explicitly:

```bash
git add docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md interview/mathtrace-project-narrative.md
git commit -m "docs: document mineru json candidate mapper boundary"
```

Do not stage `.nvmrc`, `.env.local`, `artifacts/`, or `docs/reviews/*.md`.

---

## Final Review Checklist

- The mapper reads local MinerU JSON only; it never calls MinerU and never reads `MINERU_API_TOKEN`.
- The mapper recursively extracts nested `list.blocks[]`, so解答题小问 are not silently dropped.
- `inline_equation` spans are preserved as `$...$` in candidate text.
- Question starts are detected only at conservative block starts such as `1.` or `12.`, not inside options like `A. a = \ln 1.2`.
- Section titles are context, not candidate text.
- Generated `candidate_questions.json` remains an ignored artifact and is not committed.
- No frontend, database, pgvector, memory, evidence API, or sample diagnosis behavior changes.
- Default tests and build pass.
- Claude Code review should focus on false question splits, lost nested content, generated artifact leakage, and boundary creep into runtime/product paths.

## Execution Options

Plan complete when this file is saved. Recommended execution path:

1. Run Claude Code plan review on this document.
2. Fix plan findings if any.
3. Execute Task 1 and Task 2 with `superpowers:subagent-driven-development`.
4. Inspect the real `candidate_questions.json` summary.
5. Decide whether Task 3 should update only the spec or also the interview narrative.
