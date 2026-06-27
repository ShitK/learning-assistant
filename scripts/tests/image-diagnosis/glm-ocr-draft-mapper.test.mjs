import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { mapGlmOcrContentToDraft } = jiti(
  "./src/lib/vision-extraction/glm-ocr-draft-mapper.ts",
);

{
  const draft = mapGlmOcrContentToDraft({
    markdown:
      "15.（本小题满分13分）已知函数 $f(x)=\\frac{1}{2}x^2-a\\ln x+2a$，其中 $a\\in\\mathbb{R}$。\n（1）讨论函数 $f(x)$ 的单调性；（2）若函数 $f(x)$ 有两个零点，求 $a$ 的取值范围。\n\n解：\n$f'(x)=x-\\frac{a}{x}=\\frac{x^2-a}{x}, x\\in(0,+\\infty)$",
    layout_blocks: [],
    warnings: [],
  });

  assert.equal(draft.question_text.includes("两个零点"), true);
  assert.equal(draft.question_text.includes("解："), false);
  assert.equal(draft.student_answer.includes("f'"), true);
  assert.deepEqual(draft.student_solution_steps, [
    "$f'(x)=x-\\frac{a}{x}=\\frac{x^2-a}{x}, x\\in(0,+\\infty)$",
  ]);
  assert.equal(draft.extraction_confidence, "medium");
  assert.deepEqual(draft.warnings, []);
}

{
  const draft = mapGlmOcrContentToDraft({
    markdown:
      "15. 已知函数 f(x)=ln x-ax+1。（1）讨论函数 f(x) 的单调性；（2）若有两个零点，求 a 的范围。",
    layout_blocks: [],
    warnings: [],
  });

  assert.equal(draft.student_answer, "未识别到学生答案");
  assert.deepEqual(draft.student_solution_steps, []);
  assert.equal(draft.extraction_confidence, "low");
  assert.equal(
    draft.warnings.includes("未识别到清晰学生作答区域，请确认图片中包含学生答案或解题痕迹。"),
    true,
  );
  assert.equal(draft.question_text.includes("$f(x)=\\ln x-ax+1$"), true);
}

{
  const draft = mapGlmOcrContentToDraft({
    markdown:
      "15. 已知函数 $f(x)=x^3-3ax+1$，讨论单调性。\n\n解：\n$f'(x)=3x^2-3a$",
    layout_blocks: [
      { index: 1, label: "text", content: "15. 已知函数 $g(x)=\\ln x-a$，求零点。" },
      { index: 2, label: "formula", content: "$g'(x)=\\frac{1}{x}$" },
      { index: 3, label: "text", content: "所以 $g(x)$ 单调递增" },
    ],
    warnings: [],
  });

  assert.equal(draft.student_answer.includes("$f'(x)=3x^2-3a$"), true);
  assert.equal(draft.student_answer.includes("$g'(x)=\\frac{1}{x}$"), false);
  assert.deepEqual(draft.student_solution_steps, [
    "$f'(x)=3x^2-3a$",
  ]);
}

{
  const draft = mapGlmOcrContentToDraft({
    markdown: "",
    layout_blocks: [
      { index: 1, label: "text", content: "15. 已知函数 $f(x)=x^3-3ax+1$，讨论单调性。" },
      { index: 2, label: "formula", content: "$f'(x)=3x^2-3a$" },
      { index: 3, label: "text", content: "令 $f'(x)=0$ 得 $x=\\sqrt a$" },
    ],
    warnings: ["GLM-OCR 未返回 md_results，已使用 layout_details 文本拼接。"],
  });

  assert.equal(draft.student_answer.includes("$f'(x)=3x^2-3a$"), true);
  assert.deepEqual(draft.student_solution_steps, [
    "$f'(x)=3x^2-3a$",
    "令 $f'(x)=0$ 得 $x=\\sqrt a$",
  ]);
  assert.equal(
    draft.warnings.includes("GLM-OCR 未返回 md_results，已使用 layout_details 文本拼接。"),
    true,
  );
}

{
  const longText = `15. 已知函数 $f(x)=x^2$，求单调性。\n\n解：\n${Array.from({ length: 12 }, (_, index) => `${index + 1}. 推导步骤 $x=${index}$`).join("\n")}`;
  const draft = mapGlmOcrContentToDraft({
    markdown: longText,
    layout_blocks: [],
    warnings: [],
  });

  assert.equal(draft.student_solution_steps.length, 8);
  assert.equal(draft.warnings.includes("GLM-OCR 识别的学生步骤超过 8 条，已截取前 8 条。"), true);
}
