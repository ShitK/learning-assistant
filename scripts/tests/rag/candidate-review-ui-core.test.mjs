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
  const reviewState = {
    "candidate-1": {
      status: "approved",
      note: "公式和选项 OK",
      updated_at: "2026-06-22T00:01:00.000Z",
    },
    "candidate-2": {
      status: "needs_fix",
      note: "缺少选项",
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
  assert.equal(seed.items[0].question_text.includes("已知 $f(x)$"), true);
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
  const html = renderCandidateReviewHtml(appData, {
    katexCss: ".katex{font:normal}",
  });

  assert.equal(html.includes("<!doctype html>"), true);
  assert.equal(html.includes("MathTrace Candidate Review"), true);
  assert.equal(html.includes(".katex{font:normal}"), true);
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
  const html = renderCandidateReviewHtml(appData, { katexCss: ".katex{}" });
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
  const html = renderCandidateReviewHtml(appData, { katexCss: ".katex{}" });
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
    renderCandidateReviewHtml(appData, { katexCss: ".katex{}" }).includes(
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

console.log("candidate review ui core tests passed");

function renderBrowserListHtml(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (match) => match[1],
  );
  assert.equal(scripts.length, 2);

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

  vm.runInNewContext(`${scripts[0]}\n${scripts[1]}`, context);
  return nodes.get("#candidate-list").innerHTML;
}
