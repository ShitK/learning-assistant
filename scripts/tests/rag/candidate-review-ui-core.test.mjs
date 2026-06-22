import assert from "node:assert/strict";
import vm from "node:vm";

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
  mineru_json_file:
    "/Users/kk/learning-assistant/artifacts/rag/MinerU-test/导数专题.json",
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
  assert.equal(
    invalid.errors.some((error) => error.includes("source_file")),
    true,
  );
  assert.equal(invalid.errors.some((error) => error.includes("candidates")), true);

  const invalidWarnings = structuredClone(extraction);
  invalidWarnings.candidates[0].warnings = { bad: true };
  const invalidWarningsResult = validateCandidateExtraction(invalidWarnings);
  assert.equal(invalidWarningsResult.ok, false);
  assert.equal(
    invalidWarningsResult.errors.some((error) =>
      error.includes("candidate[0].warnings"),
    ),
    true,
  );

  const invalidTypes = structuredClone(extraction);
  invalidTypes.source_file = 123;
  invalidTypes.page_count = "8";
  invalidTypes.warnings = "bad";
  invalidTypes.candidates[0].id = 1;
  invalidTypes.candidates[0].normalized_text = null;
  invalidTypes.candidates[0].source_ref = "bad";
  const invalidTypesResult = validateCandidateExtraction(invalidTypes);
  assert.equal(invalidTypesResult.ok, false);
  assert.equal(
    invalidTypesResult.errors.some((error) =>
      error.includes("source_file must be a string"),
    ),
    true,
  );
  assert.equal(
    invalidTypesResult.errors.some((error) =>
      error.includes("page_count must be a number"),
    ),
    true,
  );
  assert.equal(
    invalidTypesResult.errors.some((error) =>
      error.includes("warnings must be an array"),
    ),
    true,
  );
  assert.equal(
    invalidTypesResult.errors.some((error) =>
      error.includes("candidate[0].id must be a string"),
    ),
    true,
  );
  assert.equal(
    invalidTypesResult.errors.some((error) =>
      error.includes("candidate[0].normalized_text must be a string"),
    ),
    true,
  );
  assert.equal(
    invalidTypesResult.errors.some((error) =>
      error.includes("candidate[0].source_ref must be an object or null"),
    ),
    true,
  );
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
  assert.equal(
    appData.candidates[0].section_title,
    "考点 1 导数的概念、几何意义与运算",
  );
  assert.equal(appData.candidates[0].rendered_html.includes("katex"), true);
  assert.equal(
    appData.candidates[1].warnings.includes("missing_options_or_solution"),
    true,
  );
  assert.equal(appData.candidates[1].warnings.includes("math_render_failed"), false);

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
  const correctedQuestionText = "1. 已知 $f(x)$, 则()\nA. 1\nB. 2\nC. 3";
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
  assert.equal(seed.items[0].question_text, correctedQuestionText);
  assert.equal(
    seed.items[0].original_question_text,
    "1. 已知 $f(x)$, 则()\nA. 1\nB. 2",
  );
  assert.equal(seed.items[0].has_manual_correction, true);
  assert.equal(seed.items[0].reviewer_note, "修正了 C 选项");
  assert.equal(
    seed.items.some((item) => item.candidate_id === "candidate-2"),
    false,
  );
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
  const seed = buildReviewedPracticeSeed({
    appData,
    reviewState: {
      "candidate-1": {
        status: "approved",
        corrected_text: "1. 已知 $f(x)$, 则()\nA. 1\nB. 2",
        note: "",
        updated_at: "2026-06-22T00:03:00.000Z",
      },
    },
    exportedAt: "2026-06-22T00:04:00.000Z",
  });

  assert.equal(seed.items[0].question_text, "1. 已知 $f(x)$, 则()\nA. 1\nB. 2");
  assert.equal(
    seed.items[0].original_question_text,
    "1. 已知 $f(x)$, 则()\nA. 1\nB. 2",
  );
  assert.equal(seed.items[0].has_manual_correction, false);
}

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

  assert.equal(seed.items[0].question_text, "1. 已知 $f(x)$, 则()\nA. 1\nB. 2");
  assert.equal(seed.items[0].has_manual_correction, false);
}

{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const html = renderCandidateReviewHtml(appData, {
    katexCss: ".katex{font:normal}",
    katexJs:
      "window.katex={renderToString:function(){return '<span class=\\\"katex\\\">math</span>';}};",
  });

  assert.equal(html.includes("<!doctype html>"), true);
  assert.equal(html.includes("MathTrace Candidate Review"), true);
  assert.equal(html.includes(".katex{font:normal}"), true);
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
  assert.equal(html.includes("window.__CANDIDATE_REVIEW_DATA__"), true);
  assert.equal(html.includes("localStorage"), true);
  assert.equal(html.includes('id="toggle-topbar"'), true);
  assert.equal(html.includes('data-collapsed="false"'), true);
  assert.equal(html.includes('.topbar[data-collapsed="true"] .topbar-controls { display: none; }'), true);
  assert.equal(html.includes('appData.storage_key + ".topbarCollapsed"'), true);
  assert.equal(html.includes("#app { height: 100vh;"), true);
  assert.equal(html.includes("#candidate-list { min-height: 0;"), true);
  assert.equal(html.includes("overflow-y: auto; overscroll-behavior: contain;"), true);
  assert.equal(html.includes("copy-json-fallback"), true);
  assert.equal(html.includes("reviewed_practice_seed.json"), true);
  assert.equal(html.includes("<script>alert(1)</script>"), false);
}

{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const html = renderCandidateReviewHtml(appData, {
    katexCss: ".katex{}",
    katexJs: "window.x='</script><script>alert(9)</script>';",
  });
  assert.equal(html.includes("</script><script>alert(9)</script>"), false);
  assert.equal(html.includes("<\\/script><script>alert(9)<\\/script>"), true);
}

{
  const hostileExtraction = structuredClone(extraction);
  hostileExtraction.candidates[0].id = "</script><script>alert(1)</script>";
  hostileExtraction.candidates[0].source_ref.section_title =
    "恶意 </script><script>alert(2)</script>";
  hostileExtraction.candidates[0].normalized_text =
    "1. 含有行分隔符 \u2028 和段分隔符 \u2029";
  const appData = buildReviewAppData({
    extraction: hostileExtraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const html = renderCandidateReviewHtml(appData, {
    katexCss: ".katex{}",
    katexJs: "window.katex={renderToString:function(){return '';}};",
  });
  assert.equal(html.includes("</script><script>alert"), false);
  assert.equal(html.includes("\\u003c/script\\u003e"), true);
}

{
  const hostileExtraction = structuredClone(extraction);
  hostileExtraction.candidates[0].id = 'candidate" onclick="alert(1)';
  hostileExtraction.candidates[0].extraction_confidence =
    'high</small><img src=x onerror="alert(2)">';
  const appData = buildReviewAppData({
    extraction: hostileExtraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const html = renderCandidateReviewHtml(appData, {
    katexCss: ".katex{}",
    katexJs: "window.katex={renderToString:function(){return '';}};",
  });
  const listHtml = renderBrowserListHtml(html);

  assert.equal(listHtml.includes('data-id="candidate" onclick="alert(1)"'), false);
  assert.equal(listHtml.includes("<img"), false);
  assert.equal(listHtml.includes('onerror="alert(2)"'), false);
  assert.equal(listHtml.includes("&quot; onclick=&quot;alert(1)"), true);
  assert.equal(listHtml.includes("&lt;/small&gt;&lt;img"), true);
}

{
  const appData = buildReviewAppData({
    extraction: {
      ...extraction,
      candidates: [],
      warnings: ["question_number_restarted:demo"],
    },
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
    renderCandidateReviewHtml(appData, {
      katexCss: ".katex{}",
      katexJs: "window.katex={renderToString:function(){return '';}};",
    }).includes(
      "没有候选题",
    ),
    true,
  );
  assert.equal(seed.approved_count, 0);
  assert.deepEqual(seed.items, []);
  assert.deepEqual(buildReviewManifest(appData).extraction_warnings, [
    "question_number_restarted:demo",
    "empty_candidates",
  ]);

  const duplicateWarningAppData = {
    ...appData,
    extraction: {
      ...appData.extraction,
      warnings: ["empty_candidates"],
    },
  };
  assert.deepEqual(buildReviewManifest(duplicateWarningAppData).extraction_warnings, [
    "empty_candidates",
  ]);
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

{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const editedText = "1. 修正后 $f(x)$\nA. 1\nB. 2\nC. 3";
  const result = runBrowserCorrectionScenario(appData, editedText);
  assert.equal(result.savedState["candidate-1"].corrected_text, editedText);
  assert.equal(result.previewHtml.includes("katex"), true);
}

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
  assert.equal(
    result.previewHtml.includes("&lt;script&gt;alert(1)&lt;/script&gt;"),
    true,
  );
}

{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const editedText = "1. 修正后 $f(x)$\nA. 1\nB. 2\nC. 3";
  const result = runBrowserCorrectionScenario(appData, editedText);
  const nodeSeed = buildReviewedPracticeSeed({
    appData,
    reviewState: result.savedState,
    exportedAt: result.browserSeed.exported_at,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.browserSeed.items[0])), nodeSeed.items[0]);
}

{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const result = runBrowserCorrectionScenario(appData, "   ");
  assert.equal(
    result.browserSeed.items[0].question_text,
    appData.candidates[0].normalized_text,
  );
  assert.equal(result.browserSeed.items[0].has_manual_correction, false);
}

{
  const appData = buildReviewAppData({
    extraction,
    candidateSourceFile: "/tmp/candidate_questions.json",
    candidateSourceSha256: "abc123456789",
    generatedAt: "2026-06-22T00:00:00.000Z",
  });
  const result = runBrowserCorrectionScenario(
    appData,
    "1. 已知 $f(x)$, 则()\nA. 1\nB. 2",
    {
      initialReviewState: {
        "candidate-1": {
          status: "approved",
          note: "旧 state，无 corrected_text",
          updated_at: "2026-06-22T00:00:00.000Z",
        },
      },
    },
  );
  assert.equal(result.browserSeed.items[0].has_manual_correction, false);
}

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
  assert.equal(
    result.savedState["candidate-1"].corrected_text.includes("修正关键词"),
    true,
  );
  assert.equal(result.listHtml.includes("candidate-1"), true);
}

console.log("candidate review ui core tests passed");

function extractScriptById(html, scriptId) {
  const pattern = new RegExp(
    `<script id="${scriptId}">([\\s\\S]*?)<\\/script>`,
  );
  const match = html.match(pattern);
  assert.ok(match, `missing script ${scriptId}`);
  return match[1];
}

function renderBrowserListHtml(html) {
  const katexScript = extractScriptById(html, "katex-runtime");
  const dataScript = extractScriptById(html, "candidate-review-data");
  const appScript = extractScriptById(html, "candidate-review-app");

  const nodes = new Map();
  const document = {
    addEventListener() {},
    execCommand() {
      return true;
    },
    querySelector(selector) {
      if (!nodes.has(selector)) {
        nodes.set(selector, {
          hidden: false,
          href: "",
          id: selector.startsWith("#") ? selector.slice(1) : "",
          innerHTML: "",
          textContent: "",
          value: "",
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
      getItem() {
        return null;
      },
      setItem() {},
    },
    navigator: {},
    window: {},
  };

  vm.runInNewContext(`${katexScript}\n${dataScript}\n${appScript}`, context);
  return nodes.get("#candidate-list").innerHTML;
}

function runBrowserCorrectionScenario(
  appData,
  editedText,
  { initialReviewState = null, searchText = "" } = {},
) {
  const html = renderCandidateReviewHtml(appData, {
    katexCss: ".katex{}",
    katexJs:
      'window.katex={renderToString:function(value){return \'<span class="katex">\' + value + "</span>";}};',
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
          id: selector.startsWith("#") ? selector.slice(1) : "",
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
    clearTimeout() {},
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
    setTimeout(callback) {
      callback();
      return 1;
    },
    window: {},
  };

  if (initialReviewState) {
    storage.set(appData.storage_key, JSON.stringify(initialReviewState));
  }

  vm.runInNewContext(`${katexScript}\n${dataScript}\n${appScript}`, context);
  const textarea = document.querySelector("#corrected-text");
  textarea.value = editedText;
  nodes.get("listener:input")({
    target: textarea,
  });
  if (searchText) {
    const searchInput = document.querySelector("#search");
    searchInput.value = searchText;
    nodes.get("listener:input")({
      target: searchInput,
    });
  }
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

  const savedState = JSON.parse(storage.get(appData.storage_key));
  const browserSeed = context.window.__candidateReviewTestHooks__.buildSeed();
  return {
    browserSeed,
    listHtml: nodes.get("#candidate-list").innerHTML,
    savedState,
    previewHtml: nodes.get("#corrected-preview").innerHTML,
  };
}
