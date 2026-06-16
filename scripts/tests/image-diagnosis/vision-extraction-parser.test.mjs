import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();

const {
  parseVisionExtractionText,
  createVisionExtractionPrompt,
} = jiti("./src/lib/vision-extraction/vision-extraction-parser.ts");

const validModelText = JSON.stringify({
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "$f'(x)=3x^2-3a$，只得到 $x=\\sqrt a$。",
  student_solution_steps: ["求导正确", "临界点遗漏 $-\\sqrt a$"],
  extraction_confidence: "high",
  warnings: [],
});

const parsed = parseVisionExtractionText(validModelText);
assert.equal(parsed.ok, true);
assert.equal(parsed.value.question_text.includes("x^3"), true);
assert.deepEqual(parsed.value.student_solution_steps, [
  "求导正确",
  "临界点遗漏 $-\\sqrt a$",
]);

const stringListModelText = JSON.stringify({
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "$f'(x)=3x^2-3a$，只得到 $x=\\sqrt a$。",
  student_solution_steps:
    "1. 求导正确\n2. 临界点遗漏 $-\\sqrt a$\n3. 未讨论 $a\\le 0$",
  extraction_confidence: "high",
  warnings: "",
});
const parsedStringList = parseVisionExtractionText(stringListModelText);
assert.equal(parsedStringList.ok, true);
assert.deepEqual(parsedStringList.value.student_solution_steps, [
  "求导正确",
  "临界点遗漏 $-\\sqrt a$",
  "未讨论 $a\\le 0$",
]);
assert.deepEqual(parsedStringList.value.warnings, []);

const fencedJson = parseVisionExtractionText(`\`\`\`json
${validModelText}
\`\`\``);
assert.equal(fencedJson.ok, true);
assert.equal(fencedJson.value.question_text.includes("x^3"), true);

const wrappedJson = parseVisionExtractionText(`下面是抽取结果：\n${validModelText}`);
assert.equal(wrappedJson.ok, true);
assert.equal(wrappedJson.value.student_answer.includes("f'"), true);

const rawMathModelText = JSON.stringify({
  question_text:
    "已知函数f(x)=lnx - a x + 1. (1)求f(x)的单调区间；(2)已知f(x)在(0,e)上有两个零点。",
  student_answer: "当a > 0时，f'(x)=1/x-a。",
  student_solution_steps: ["令f'(x)=0得x=1/a", "讨论区间(0,e)"],
  extraction_confidence: "medium",
  warnings: [],
});
const rawMathParsed = parseVisionExtractionText(rawMathModelText);
assert.equal(rawMathParsed.ok, true);
assert.equal(
  rawMathParsed.value.question_text.includes("$f(x)=\\ln x - ax + 1$"),
  true,
);
assert.equal(rawMathParsed.value.question_text.includes("$(0,e)$"), true);
assert.equal(rawMathParsed.value.student_answer.includes("$a > 0$"), true);
assert.equal(
  rawMathParsed.value.student_solution_steps[0].includes("$f'(x)=0$"),
  true,
);

const invalidJson = parseVisionExtractionText("```json\n{}\n```");
assert.equal(invalidJson.ok, false);
assert.equal(invalidJson.error.code, "model_invalid_output");
assert.equal(invalidJson.error.recoverable, true);

const missingStudentAnswer = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_solution_steps: ["步骤"],
    extraction_confidence: "low",
    warnings: ["未识别到学生作答区域"],
  }),
);
assert.equal(missingStudentAnswer.ok, false);
assert.equal(missingStudentAnswer.error.code, "model_invalid_output");
assert.equal(
  missingStudentAnswer.error.message,
  "没有识别到学生作答区域，请上传包含题干和学生解题痕迹的图片。",
);
assert.deepEqual(missingStudentAnswer.error.debug_summary.missing_fields, [
  "student_answer",
]);
assert.deepEqual(missingStudentAnswer.error.debug_summary.present_fields, [
  "question_text",
  "student_solution_steps",
  "extraction_confidence",
  "warnings",
]);
assert.equal(
  missingStudentAnswer.error.debug_summary.field_lengths.question_text,
  2,
);

const forbiddenStandardSolutionDraft = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: ["步骤"],
    unexpected_field: "视觉模型不应输出这个字段",
    extraction_confidence: "high",
    warnings: [],
  }),
);
assert.equal(forbiddenStandardSolutionDraft.ok, false);
assert.equal(
  forbiddenStandardSolutionDraft.error.message,
  "模型输出包含未声明字段。",
);
assert.deepEqual(
  forbiddenStandardSolutionDraft.error.debug_summary.extra_fields,
  ["unexpected_field"],
);

const missingSteps = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: [],
    extraction_confidence: "medium",
    warnings: [],
  }),
);
assert.equal(missingSteps.ok, true);
assert.equal(missingSteps.value.extraction_confidence, "low");
assert.deepEqual(missingSteps.value.student_solution_steps, [
  "模型未拆分出具体步骤，仅识别到学生答案。",
]);
assert.deepEqual(missingSteps.value.warnings, [
  "未识别到清晰学生解题步骤，请确认图片中包含学生过程。",
]);

const overconfidentMissingAnswer = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "未识别到学生答案",
    student_solution_steps: ["求导"],
    extraction_confidence: "high",
    warnings: [],
  }),
);
assert.equal(overconfidentMissingAnswer.ok, true);
assert.equal(overconfidentMissingAnswer.value.extraction_confidence, "low");
assert.deepEqual(overconfidentMissingAnswer.value.warnings, [
  "未识别到清晰学生作答区域，请确认图片中包含学生答案或解题痕迹。",
]);

const alternateMissingAnswerText = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "未找到学生答案",
    student_solution_steps: ["求导"],
    extraction_confidence: "high",
    warnings: [],
  }),
);
assert.equal(alternateMissingAnswerText.ok, true);
assert.equal(alternateMissingAnswerText.value.extraction_confidence, "low");
assert.deepEqual(alternateMissingAnswerText.value.warnings, [
  "未识别到清晰学生作答区域，请确认图片中包含学生答案或解题痕迹。",
]);

const missingAnswerAndSteps = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "未识别到学生答案",
    student_solution_steps: [],
    extraction_confidence: "high",
    warnings: ["图片手写内容较模糊"],
  }),
);
assert.equal(missingAnswerAndSteps.ok, true);
assert.equal(missingAnswerAndSteps.value.extraction_confidence, "low");
assert.deepEqual(missingAnswerAndSteps.value.student_solution_steps, [
  "模型未识别到学生答案或具体解题步骤。",
]);
assert.deepEqual(missingAnswerAndSteps.value.warnings, [
  "图片手写内容较模糊",
  "未识别到清晰学生作答区域，请确认图片中包含学生答案或解题痕迹。",
  "未识别到清晰学生解题步骤，请确认图片中包含学生过程。",
]);

const objectStepItems = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: [
      { text: "1. 先求导" },
      { step: "2. 再讨论参数范围" },
      { content: "3. 写出单调区间" },
      { value: "4. 对照零点条件" },
    ],
    extraction_confidence: "medium",
    warnings: [],
  }),
);
assert.equal(objectStepItems.ok, true);
assert.deepEqual(objectStepItems.value.student_solution_steps, [
  "先求导",
  "再讨论参数范围",
  "写出单调区间",
  "对照零点条件",
]);

const noisyStepItems = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: [
      "1. 求导",
      "",
      "   ",
      { text: "2. 讨论参数" },
      { unsupported: "忽略这个对象" },
    ],
    extraction_confidence: "medium",
    warnings: [],
  }),
);
assert.equal(noisyStepItems.ok, true);
assert.deepEqual(noisyStepItems.value.student_solution_steps, [
  "求导",
  "讨论参数",
]);
assert.equal(noisyStepItems.value.extraction_confidence, "low");
assert.equal(
  noisyStepItems.value.warnings.includes("部分学生步骤为空或格式不完整，已忽略。"),
  true,
);

const nestedStepItems = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: ["1. 求导", ["2. 讨论参数"]],
    extraction_confidence: "medium",
    warnings: [],
  }),
);
assert.equal(nestedStepItems.ok, false);
assert.equal(
  nestedStepItems.error.message,
  "模型输出的 student_solution_steps 不合法。",
);

const duplicateWarnings = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: [
      "1. 求导",
      { unsupported: "忽略这个对象" },
      { text: "2. 讨论参数" },
    ],
    extraction_confidence: "medium",
    warnings: [
      "模型警告 A",
      "模型警告 A",
      "模型警告 B",
      "模型警告 C",
      "模型警告 D",
      "模型警告 E",
    ],
  }),
);
assert.equal(duplicateWarnings.ok, true);
assert.deepEqual(duplicateWarnings.value.warnings, [
  "部分学生步骤为空或格式不完整，已忽略。",
  "模型警告 A",
  "模型警告 B",
  "模型警告 C",
  "模型警告 D",
]);

const overlongStepItems = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: Array.from({ length: 10 }, (_item, index) => {
      return `步骤${index + 1}`;
    }),
    extraction_confidence: "medium",
    warnings: [],
  }),
);
assert.equal(overlongStepItems.ok, true);
assert.equal(overlongStepItems.value.student_solution_steps.length, 8);
assert.deepEqual(overlongStepItems.value.student_solution_steps, [
  "步骤1",
  "步骤2",
  "步骤3",
  "步骤4",
  "步骤5",
  "步骤6",
  "步骤7",
  "步骤8",
]);
assert.equal(
  overlongStepItems.value.warnings.includes(
    "模型返回的学生步骤超过 8 条，已截取前 8 条。",
  ),
  true,
);

const memoryDeltaAttempt = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: ["步骤"],
    extraction_confidence: "medium",
    warnings: [],
    memory_delta: { should_persist: true },
  }),
);
assert.equal(memoryDeltaAttempt.ok, false);
assert.equal(memoryDeltaAttempt.error.code, "model_invalid_output");

const prompt = createVisionExtractionPrompt({
  student_profile_summary: "demo_student_001，高二数学。",
});
assert.equal(prompt.includes("不要输出 memory_delta"), true);
assert.equal(prompt.includes("合法 JSON"), true);
assert.equal(prompt.includes("未识别到学生答案"), true);
assert.equal(
  prompt.includes("不要生成标准解法、标准答案或完整解题过程"),
  true,
);
assert.equal(
  prompt.includes("标准解法会在用户确认后由文本分析模型生成"),
  true,
);
assert.equal(
  prompt.includes(
    "question_text、student_answer、student_solution_steps 中的数学表达式都必须使用 LaTeX",
  ),
  true,
);
assert.equal(prompt.includes("\\frac{1}{a}"), true);
assert.equal(prompt.includes("\\ln a"), true);

console.log("vision extraction parser test passed");
