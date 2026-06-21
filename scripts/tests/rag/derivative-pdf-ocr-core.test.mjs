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
  cropImagePath:
    "artifacts/rag/derivative-pdf-spike/page-slices/page-001-left.png",
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
  normalizeOcrText("  1.  题干\r\n\r\nA. 选项  "),
  "1. 题干\nA. 选项",
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
  assert.equal(
    candidates[2].warnings.includes("missing_options_or_solution"),
    true,
  );
  assert.equal(candidates[2].extraction_confidence, "medium");
}

{
  const candidates = splitQuestionCandidates({
    ...pageRecord,
    ocrText:
      "命题点\\n本专题主要考查导数的概念。\\n没有可稳定切分的题号。",
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].question_number, null);
  assert.equal(candidates[0].id, "pdf-page-001-left-chunk-001");
  assert.equal(candidates[0].warnings.includes("question_split_failed"), true);
  assert.equal(candidates[0].extraction_confidence, "low");
}

{
  const candidates = splitQuestionCandidates({
    ...pageRecord,
    ocrText: "",
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].question_number, null);
  assert.equal(candidates[0].warnings.includes("empty_ocr_text"), true);
  assert.equal(candidates[0].warnings.includes("question_split_failed"), true);
  assert.equal(candidates[0].extraction_confidence, "low");
}

{
  const candidates = splitQuestionCandidates({
    ...pageRecord,
    ocrText: "1. 设 f(x)",
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].question_number, "1");
  assert.equal(candidates[0].warnings.includes("short_candidate_text"), true);
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
  assertCandidateQuestionExtractionSchema(extraction);

  const report = renderExtractionReport(extraction);
  assert.equal(report.includes("# P2.0 导数扫描 PDF OCR 入库报告"), true);
  assert.equal(report.includes("- PDF 页数：8"), true);
  assert.equal(report.includes("- 候选题数量：3"), true);
  assert.equal(report.includes("ocr_tool_unavailable"), true);
}

console.log("derivative pdf ocr core tests passed");

function assertCandidateQuestionExtractionSchema(extraction) {
  assert.equal(typeof extraction.source_file, "string");
  assert.equal(typeof extraction.source_file_sha256, "string");
  assert.equal(typeof extraction.extracted_at, "string");
  assert.equal(typeof extraction.page_count, "number");
  assert.equal(Array.isArray(extraction.candidates), true);
  assert.equal(Array.isArray(extraction.warnings), true);

  for (const candidate of extraction.candidates) {
    assert.equal(typeof candidate.id, "string");
    assert.equal(typeof candidate.source_ref.pdf_page_index, "number");
    assert.ok(
      candidate.source_ref.book_page_label === null ||
        typeof candidate.source_ref.book_page_label === "string",
    );
    assert.ok(["left", "right", "full"].includes(candidate.source_ref.side));
    assert.ok(
      candidate.source_ref.crop_image_path === null ||
        typeof candidate.source_ref.crop_image_path === "string",
    );
    assert.ok(
      candidate.question_number === null ||
        typeof candidate.question_number === "string",
    );
    assert.equal(typeof candidate.raw_ocr_text, "string");
    assert.equal(typeof candidate.normalized_text, "string");
    assert.equal(candidate.answer_or_solution_candidate, null);
    assert.ok(["high", "medium", "low"].includes(candidate.extraction_confidence));
    assert.equal(Array.isArray(candidate.warnings), true);
    assert.equal(
      candidate.warnings.every((warning) => typeof warning === "string"),
      true,
    );
  }
}
