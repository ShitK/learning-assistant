import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  parseVisionExtractionText,
  createVisionExtractionPrompt,
} = jiti("../src/lib/vision-extraction-parser.ts");

const validModelText = JSON.stringify({
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "$f'(x)=3x^2-3a$，只得到 $x=\\sqrt a$。",
  student_solution_steps: ["求导正确", "临界点遗漏 $-\\sqrt a$"],
  standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$ 两类情况。",
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

const invalidJson = parseVisionExtractionText("```json\n{}\n```");
assert.equal(invalidJson.ok, false);
assert.equal(invalidJson.error.code, "model_invalid_output");
assert.equal(invalidJson.error.recoverable, true);

const missingSteps = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: [],
    standard_solution_draft: "解法",
    extraction_confidence: "medium",
    warnings: [],
  }),
);
assert.equal(missingSteps.ok, false);
assert.equal(missingSteps.error.code, "model_invalid_output");

const memoryDeltaAttempt = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: ["步骤"],
    standard_solution_draft: "解法",
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

console.log("vision extraction parser test passed");
