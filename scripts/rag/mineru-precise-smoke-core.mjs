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
