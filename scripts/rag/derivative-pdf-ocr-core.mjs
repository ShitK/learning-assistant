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
  text,
  idSuffix,
  warnings,
}) {
  const allWarnings = uniqueStrings([...(pageRecord.warnings ?? []), ...warnings]);

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
    extraction_confidence: determineConfidence(text, allWarnings),
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
  return [
    ...new Set(
      values.filter((value) => typeof value === "string" && value.length > 0),
    ),
  ];
}
