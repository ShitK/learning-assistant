import assert from "node:assert/strict";

import {
  buildMineruBatchPayload,
  readMineruToken,
  redactSecret,
  renderMineruSmokeReport,
  summarizeMineruBatchResult,
} from "../../rag/mineru-precise-smoke-core.mjs";

{
  const missing = readMineruToken({});
  assert.equal(missing.ok, false);
  assert.equal(missing.error.includes("MINERU_API_TOKEN"), true);

  const present = readMineruToken({ MINERU_API_TOKEN: "  local-token  " });
  assert.deepEqual(present, { ok: true, token: "local-token" });
}

{
  assert.equal(redactSecret("abcdef1234567890"), "abcd...7890");
  assert.equal(redactSecret("short"), "<redacted>");
}

{
  const payload = buildMineruBatchPayload({
    fileName: "导数专题.pdf",
    pageRanges: "1-2",
    modelVersion: "vlm",
    language: "ch",
    isOcr: true,
    enableFormula: true,
    enableTable: true,
  });

  assert.deepEqual(payload, {
    enable_formula: true,
    enable_table: true,
    language: "ch",
    model_version: "vlm",
    files: [
      {
        name: "导数专题.pdf",
        is_ocr: true,
        page_ranges: "1-2",
      },
    ],
  });
}

{
  const summary = summarizeMineruBatchResult({
    code: 0,
    data: {
      extract_result: [
        {
          state: "done",
          full_zip_url: "https://example.test/result.zip",
          err_msg: "",
        },
      ],
    },
  });

  assert.equal(summary.state, "done");
  assert.equal(summary.extractedZipUrl, "https://example.test/result.zip");
  assert.equal(summary.errMsg, null);
}

{
  const report = renderMineruSmokeReport({
    inputFile: "/Users/kk/Documents/导数专题.pdf",
    pageRanges: "1-2",
    modelVersion: "vlm",
    language: "ch",
    startedAt: "2026-06-21T00:00:00.000Z",
    finishedAt: "2026-06-21T00:01:00.000Z",
    state: "done",
    outputDir: "artifacts/rag/mineru-derivative-smoke",
    downloadedZipPath: "artifacts/rag/mineru-derivative-smoke/mineru-result.zip",
    extractedFiles: [
      "artifacts/rag/mineru-derivative-smoke/raw/full.md",
      "artifacts/rag/mineru-derivative-smoke/raw/content_list.json",
    ],
    warnings: [],
  });

  assert.equal(report.includes("# P2.0 MinerU 精准解析 Smoke 报告"), true);
  assert.equal(report.includes("MINERU_API_TOKEN"), false);
  assert.equal(report.includes("- 页码范围：1-2"), true);
  assert.equal(report.includes("- 状态：done"), true);
}

console.log("mineru precise smoke core tests passed");
