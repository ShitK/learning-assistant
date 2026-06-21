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

assert.equal(normalizeCandidateText("  1.  题干\r\n\r\nA. 选项  "), "1. 题干\nA. 选项");
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
  extraction.candidates.forEach(assertCandidateShape);

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
  assert.equal(extraction.candidates[1].normalized_text.includes("A. a = \\ln 1.2"), false);
  assert.equal(extraction.candidates[1].source_ref.block_end_pdf_page_index, 1);
  assert.equal(extraction.candidates[1].source_ref.block_end_index, 6);
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
  const sameSectionRestartedFixture = {
    pdf_info: [
      {
        page_idx: 0,
        para_blocks: [
          {
            type: "text",
            index: 1,
            lines: [{ spans: [{ type: "text", content: "2.(测试二)题干 ()" }] }],
          },
          {
            type: "text",
            index: 2,
            lines: [{ spans: [{ type: "text", content: "A. 2" }] }],
          },
          {
            type: "text",
            index: 3,
            lines: [{ spans: [{ type: "text", content: "1.(测试一)题干 ()" }] }],
          },
          {
            type: "text",
            index: 4,
            lines: [{ spans: [{ type: "text", content: "A. 1" }] }],
          },
        ],
      },
    ],
  };

  const extraction = buildCandidateQuestions({
    mineruJson: sameSectionRestartedFixture,
    sourceFile: "/tmp/导数专题.pdf",
    sourceFileSha256: "source123",
    mineruJsonFile: "/tmp/导数专题.json",
    mineruJsonSha256: "json123",
    extractedAt: "2026-06-21T00:00:00.000Z",
  });
  const restartedWarnings = extraction.warnings.filter((warning) =>
    warning.startsWith("question_number_restarted"),
  );

  assert.equal(restartedWarnings.length, 1);
}

{
  const extraction = buildCandidateQuestions({
    mineruJson: mineruFixture,
    mineruJsonFile: "/tmp/导数专题.json",
    extractedAt: "2026-06-21T00:00:00.000Z",
  });

  assert.equal(extraction.source_file, "/tmp/导数专题.json");
  assert.equal(extraction.warnings.includes("source_file_unknown"), true);
}

{
  const nonZeroPageIdxFixture = {
    pdf_info: [
      {
        page_idx: 3,
        para_blocks: [
          {
            type: "text",
            index: 2,
            bbox: [10, 40, 500, 80],
            lines: [{ spans: [{ type: "text", content: "1.(测试)题干 ()" }] }],
          },
          {
            type: "text",
            index: 3,
            bbox: [10, 90, 200, 110],
            lines: [{ spans: [{ type: "text", content: "A. 1" }] }],
          },
        ],
      },
    ],
  };

  const pageBlocks = extractPageBlocks(nonZeroPageIdxFixture);
  assert.equal(pageBlocks[0].pdfPageIndex, 4);

  const extraction = buildCandidateQuestions({
    mineruJson: nonZeroPageIdxFixture,
    sourceFile: "/tmp/非零页码.pdf",
    extractedAt: "2026-06-21T00:00:00.000Z",
  });
  assert.equal(extraction.candidates[0].source_ref.pdf_page_index, 4);
  assert.equal(extraction.candidates[0].source_ref.block_end_pdf_page_index, 4);
}

{
  const extraction = buildCandidateQuestions({
    mineruJson: { pdf_info: [] },
    mineruJsonFile: "/tmp/empty.json",
    extractedAt: "2026-06-21T00:00:00.000Z",
  });

  assert.equal(extraction.source_file, "/tmp/empty.json");
  assert.equal(extraction.page_count, 0);
  assert.equal(extraction.candidates.length, 0);
  assert.equal(extraction.warnings.includes("source_file_unknown"), true);
  assert.equal(extraction.warnings.includes("question_split_failed"), true);
}

{
  const extraction = buildCandidateQuestions({
    mineruJson: {
      pdf_info: [
        {
          page_idx: 0,
          para_blocks: [
            {
              type: "text",
              index: 1,
              lines: [{ spans: [{ type: "text", content: "这不是题目起始块" }] }],
            },
          ],
        },
      ],
    },
    sourceFile: "/tmp/导数专题.pdf",
    extractedAt: "2026-06-21T00:00:00.000Z",
  });

  assert.equal(extraction.candidates.length, 0);
  assert.equal(extraction.warnings.includes("question_split_failed"), true);
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

function assertCandidateShape(candidate) {
  assert.equal(typeof candidate.id, "string");
  assert.equal(typeof candidate.question_number, "string");
  assert.equal(typeof candidate.raw_ocr_text, "string");
  assert.equal(typeof candidate.normalized_text, "string");
  assert.equal(Array.isArray(candidate.warnings), true);

  const sourceRef = candidate.source_ref;
  assert.equal(typeof sourceRef.pdf_page_index, "number");
  assert.equal(
    sourceRef.book_page_label === null || typeof sourceRef.book_page_label === "string",
    true,
  );
  assert.equal(typeof sourceRef.side, "string");
  assert.equal(typeof sourceRef.block_start_index, "number");
  assert.equal(sourceRef.block_start_bbox === null || Array.isArray(sourceRef.block_start_bbox), true);
  assert.equal(typeof sourceRef.block_end_pdf_page_index, "number");
  assert.equal(typeof sourceRef.block_end_index, "number");
  assert.equal(sourceRef.block_end_bbox === null || Array.isArray(sourceRef.block_end_bbox), true);
  assert.equal(sourceRef.section_title === null || typeof sourceRef.section_title === "string", true);
  assert.equal(sourceRef.crop_image_path === null || typeof sourceRef.crop_image_path === "string", true);
}

console.log("mineru json candidate mapper core tests passed");
