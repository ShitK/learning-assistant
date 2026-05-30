import { isRecord } from "@/lib/utils";

export type ExtractionConfidence = "high" | "medium" | "low";

export interface VisionExtractionDraft {
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  standard_solution_draft: string;
  extraction_confidence: ExtractionConfidence;
  warnings: string[];
}

export interface VisionExtractionParseError {
  code: "model_invalid_output";
  message: string;
  recoverable: true;
}

export type VisionExtractionParseResult =
  | { ok: true; value: VisionExtractionDraft }
  | { ok: false; error: VisionExtractionParseError };

const ALLOWED_KEYS = new Set([
  "question_text",
  "student_answer",
  "student_solution_steps",
  "standard_solution_draft",
  "extraction_confidence",
  "warnings",
]);

const FORBIDDEN_KEYS = new Set([
  "memory_delta",
  "student_profile",
  "mistake_history",
  "knowledge_mastery_changes",
  "mistake_cause_changes",
]);

export function parseVisionExtractionText(
  text: string,
): VisionExtractionParseResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return invalidOutput("模型输出不是合法 JSON。");
  }

  if (!isRecord(parsed)) {
    return invalidOutput("模型输出必须是 JSON 对象。");
  }

  for (const key of Object.keys(parsed)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return invalidOutput("模型输出包含不允许由模型写入的画像字段。");
    }

    if (!ALLOWED_KEYS.has(key)) {
      return invalidOutput("模型输出包含未声明字段。");
    }
  }

  if (!isNonEmptyString(parsed.question_text)) {
    return invalidOutput("模型输出缺少 question_text。");
  }

  if (!isNonEmptyString(parsed.student_answer)) {
    return invalidOutput("模型输出缺少 student_answer。");
  }

  if (!isNonEmptyString(parsed.standard_solution_draft)) {
    return invalidOutput("模型输出缺少 standard_solution_draft。");
  }

  if (!isExtractionConfidence(parsed.extraction_confidence)) {
    return invalidOutput("模型输出的 extraction_confidence 不合法。");
  }

  const steps = parseStringList(parsed.student_solution_steps, 1, 8);
  if (!steps) {
    return invalidOutput("模型输出的 student_solution_steps 不合法。");
  }

  const warnings = parseStringList(parsed.warnings, 0, 5);
  if (!warnings) {
    return invalidOutput("模型输出的 warnings 不合法。");
  }

  return {
    ok: true,
    value: {
      question_text: parsed.question_text.trim(),
      student_answer: parsed.student_answer.trim(),
      student_solution_steps: steps,
      standard_solution_draft: parsed.standard_solution_draft.trim(),
      extraction_confidence: parsed.extraction_confidence,
      warnings,
    },
  };
}

export function createVisionExtractionPrompt(input: {
  student_profile_summary: string;
}): string {
  return [
    "你是 MathTrace 的图片错题抽取器。",
    "请只做题目、学生答案、学生解题步骤和标准解法草稿抽取。",
    "只输出一个合法 JSON 对象，不要输出 Markdown、解释文字或代码块。",
    "JSON 字段必须且只能包含 question_text、student_answer、student_solution_steps、standard_solution_draft、extraction_confidence、warnings。",
    "不要输出 memory_delta、student_profile、mistake_history、错因频次或画像更新。",
    "如果图片不清晰或信息不足，请设置 extraction_confidence=\"low\"，并把需要学生确认的点写入 warnings。",
    `学生画像摘要：${input.student_profile_summary}`,
  ].join("\n");
}

function invalidOutput(message: string): VisionExtractionParseResult {
  return {
    ok: false,
    error: {
      code: "model_invalid_output",
      message,
      recoverable: true,
    },
  };
}

function parseStringList(
  value: unknown,
  minLength: number,
  maxLength: number,
): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  if (value.length < minLength || value.length > maxLength) {
    return null;
  }

  const items = value.map((item) => {
    return typeof item === "string" ? item.trim() : "";
  });

  if (items.some((item) => item.length === 0)) {
    return null;
  }

  return items;
}

function isExtractionConfidence(
  value: unknown,
): value is ExtractionConfidence {
  return value === "high" || value === "medium" || value === "low";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
