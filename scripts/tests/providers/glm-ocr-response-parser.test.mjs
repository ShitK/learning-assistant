import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { parseGlmOcrResponse } = jiti(
  "./src/lib/providers/glm-ocr-response-parser.ts",
);

{
  const parsed = parseGlmOcrResponse({
    id: "task_123456789",
    model: "GLM-OCR",
    md_results: "15. 已知函数 $f(x)=x^2$。\n\n解：\n$f'(x)=2x$",
    layout_details: [
      [
        {
          index: 2,
          label: "formula",
          bbox_2d: [0.1, 0.2, 0.8, 0.3],
          content: "$f'(x)=2x$",
          height: 800,
          width: 600,
        },
        {
          index: 1,
          label: "text",
          content: "15. 已知函数 $f(x)=x^2$。",
        },
      ],
    ],
    layout_visualization: ["https://example.test/unsafe-preview.png"],
    usage: { total_tokens: 10 },
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.markdown.includes("已知函数"), true);
  assert.deepEqual(
    parsed.value.layout_blocks.map((block) => block.index),
    [1, 2],
  );
  assert.equal(
    JSON.stringify(parsed.value).includes("layout_visualization"),
    false,
  );
  assert.equal(JSON.stringify(parsed.value).includes("total_tokens"), false);
}

{
  const parsed = parseGlmOcrResponse({
    md_results: "",
    layout_details: [
      [
        { index: 1, label: "text", content: "15. 已知函数 $f(x)=x^2$。" },
        { index: 2, label: "formula", content: "$f'(x)=2x$" },
      ],
    ],
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.markdown, "15. 已知函数 $f(x)=x^2$。\n$f'(x)=2x$");
  assert.deepEqual(parsed.value.warnings, [
    "GLM-OCR 未返回 md_results，已使用 layout_details 文本拼接。",
  ]);
}

{
  const parsed = parseGlmOcrResponse({
    md_results: "",
    layout_details: [[{ index: 1, label: "image", content: "" }]],
  });

  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure_kind, "empty_text_content");
}

{
  const parsed = parseGlmOcrResponse({
    error: {
      code: "invalid_request",
      message: "bad file",
    },
  });

  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure_kind, "http_error");
  assert.equal(parsed.safe_error_message, "invalid_request: bad file");
}
