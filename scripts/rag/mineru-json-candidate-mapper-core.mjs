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
  sourceFile = "source_file_unknown",
  sourceFileSha256 = null,
  mineruJsonFile = null,
  mineruJsonSha256 = null,
  extractedAt,
  warnings: inputWarnings = [],
} = {}) {
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
  const confidenceCounts = countBy(
    extraction.candidates,
    (candidate) => candidate.extraction_confidence,
  );
  const sections = [
    ...new Set(
      extraction.candidates
        .map((candidate) => candidate.source_ref.section_title)
        .filter(Boolean),
    ),
  ];
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
      if (previous !== null && number > previous + 1) {
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
