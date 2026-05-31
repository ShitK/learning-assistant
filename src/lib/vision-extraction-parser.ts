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

export interface VisionExtractionDebugSummary {
  output_kind: "json_object" | "json_parse_error" | "non_object";
  raw_output_length: number;
  present_fields: string[];
  missing_fields: string[];
  extra_fields: string[];
  forbidden_fields: string[];
  field_lengths: {
    question_text?: number;
    student_answer?: number;
    standard_solution_draft?: number;
  };
  list_lengths: {
    student_solution_steps?: number;
    warnings?: number;
  };
}

export interface VisionExtractionParseError {
  code: "model_invalid_output";
  message: string;
  recoverable: true;
  debug_summary: VisionExtractionDebugSummary;
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
    return invalidOutput(
      "模型输出不是合法 JSON。",
      createDebugSummary(text, null, "json_parse_error"),
    );
  }

  if (!isRecord(parsed)) {
    return invalidOutput(
      "模型输出必须是 JSON 对象。",
      createDebugSummary(text, parsed, "non_object"),
    );
  }

  const debugSummary = createDebugSummary(text, parsed, "json_object");

  for (const key of Object.keys(parsed)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return invalidOutput(
        "模型输出包含不允许由模型写入的画像字段。",
        debugSummary,
      );
    }

    if (!ALLOWED_KEYS.has(key)) {
      return invalidOutput("模型输出包含未声明字段。", debugSummary);
    }
  }

  if (!isNonEmptyString(parsed.question_text)) {
    return invalidOutput("模型输出缺少 question_text。", debugSummary);
  }

  if (!isNonEmptyString(parsed.student_answer)) {
    return invalidOutput(
      "没有识别到学生作答区域，请上传包含题干和学生解题痕迹的图片。",
      debugSummary,
    );
  }

  if (!isNonEmptyString(parsed.standard_solution_draft)) {
    return invalidOutput(
      "模型输出缺少 standard_solution_draft。",
      debugSummary,
    );
  }

  if (!isExtractionConfidence(parsed.extraction_confidence)) {
    return invalidOutput(
      "模型输出的 extraction_confidence 不合法。",
      debugSummary,
    );
  }

  const steps = parseStringList(parsed.student_solution_steps, 0, 8);
  if (!steps) {
    return invalidOutput(
      "模型输出的 student_solution_steps 不合法。",
      debugSummary,
    );
  }

  const warnings = parseStringList(parsed.warnings, 0, 5);
  if (!warnings) {
    return invalidOutput("模型输出的 warnings 不合法。", debugSummary);
  }

  const normalized = normalizeExtractionDraft({
    student_answer: parsed.student_answer.trim(),
    student_solution_steps: steps,
    extraction_confidence: parsed.extraction_confidence,
    warnings,
  });

  return {
    ok: true,
    value: {
      question_text: parsed.question_text.trim(),
      student_answer: normalized.student_answer,
      student_solution_steps: normalized.student_solution_steps,
      standard_solution_draft: parsed.standard_solution_draft.trim(),
      extraction_confidence: normalized.extraction_confidence,
      warnings: normalized.warnings,
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
    "student_solution_steps 和 warnings 必须输出为字符串数组；没有 warning 时输出空数组 []。",
    "如果没有识别到学生答案，也必须输出 student_answer=\"未识别到学生答案\"，并将 extraction_confidence 设为 \"low\"。",
    "不要输出 memory_delta、student_profile、mistake_history、错因频次或画像更新。",
    "如果图片不清晰或信息不足，请设置 extraction_confidence=\"low\"，并把需要学生确认的点写入 warnings。",
    'JSON 示例：{"question_text":"...","student_answer":"...","student_solution_steps":["..."],"standard_solution_draft":"...","extraction_confidence":"high","warnings":[]}',
    `学生画像摘要：${input.student_profile_summary}`,
  ].join("\n");
}

function invalidOutput(
  message: string,
  debugSummary: VisionExtractionDebugSummary,
): VisionExtractionParseResult {
  return {
    ok: false,
    error: {
      code: "model_invalid_output",
      message,
      recoverable: true,
      debug_summary: debugSummary,
    },
  };
}

function createDebugSummary(
  rawText: string,
  value: unknown,
  outputKind: VisionExtractionDebugSummary["output_kind"],
): VisionExtractionDebugSummary {
  // 只记录字段名和长度，不记录模型字段值，避免泄露题干、学生答案或图片内容。
  const presentFields = isRecord(value) ? Object.keys(value) : [];

  return {
    output_kind: outputKind,
    raw_output_length: rawText.length,
    present_fields: presentFields,
    missing_fields: Array.from(ALLOWED_KEYS).filter((key) => {
      return !presentFields.includes(key);
    }),
    extra_fields: presentFields.filter((key) => {
      return !ALLOWED_KEYS.has(key) && !FORBIDDEN_KEYS.has(key);
    }),
    forbidden_fields: presentFields.filter((key) => {
      return FORBIDDEN_KEYS.has(key);
    }),
    field_lengths: {
      question_text: getStringLength(value, "question_text"),
      student_answer: getStringLength(value, "student_answer"),
      standard_solution_draft: getStringLength(value, "standard_solution_draft"),
    },
    list_lengths: {
      student_solution_steps: getListLength(value, "student_solution_steps"),
      warnings: getListLength(value, "warnings"),
    },
  };
}

function getStringLength(value: unknown, key: string): number | undefined {
  if (!isRecord(value) || typeof value[key] !== "string") {
    return undefined;
  }

  return value[key].trim().length;
}

function getListLength(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (Array.isArray(value[key])) {
    return value[key].length;
  }

  if (typeof value[key] === "string") {
    const parsed = parseStringListText(value[key], 0, Number.MAX_SAFE_INTEGER);
    return parsed?.length;
  }

  return undefined;
}

function parseStringList(
  value: unknown,
  minLength: number,
  maxLength: number,
): string[] | null {
  if (typeof value === "string") {
    return parseStringListText(value, minLength, maxLength);
  }

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

function parseStringListText(
  value: string,
  minLength: number,
  maxLength: number,
): string[] | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return minLength === 0 ? [] : null;
  }

  const items = trimmed
    .split(/\r?\n/)
    .map(normalizeStringListItem)
    .filter((item) => item.length > 0);

  if (items.length < minLength || items.length > maxLength) {
    return null;
  }

  return items;
}

function normalizeStringListItem(value: string): string {
  return value
    .trim()
    .replace(/^(?:[-*]|\d+[.)、])\s*/, "")
    .trim();
}

function normalizeExtractionDraft(input: {
  student_answer: string;
  student_solution_steps: string[];
  extraction_confidence: ExtractionConfidence;
  warnings: string[];
}): {
  student_answer: string;
  student_solution_steps: string[];
  extraction_confidence: ExtractionConfidence;
  warnings: string[];
} {
  const hasUnrecognizedAnswer = isUnrecognizedStudentAnswer(input.student_answer);
  const hasEmptySteps = input.student_solution_steps.length === 0;
  const warnings = [...input.warnings];
  const studentSolutionSteps = hasEmptySteps
    ? [getEmptyStepPlaceholder(hasUnrecognizedAnswer)]
    : input.student_solution_steps;

  if (hasUnrecognizedAnswer) {
    warnings.push(
      "未识别到清晰学生作答区域，请确认图片中包含学生答案或解题痕迹。",
    );
  }

  if (hasEmptySteps) {
    warnings.push("未识别到清晰学生解题步骤，请确认图片中包含学生过程。");
  }

  return {
    student_answer: input.student_answer,
    student_solution_steps: studentSolutionSteps,
    extraction_confidence:
      hasUnrecognizedAnswer || hasEmptySteps ? "low" : input.extraction_confidence,
    warnings: dedupeStrings(warnings).slice(0, 5),
  };
}

function isUnrecognizedStudentAnswer(value: string): boolean {
  return /(未识别到|未找到|无法识别|没有检测到).*学生.*(答案|作答)/.test(
    value,
  );
}

function getEmptyStepPlaceholder(hasUnrecognizedAnswer: boolean): string {
  if (hasUnrecognizedAnswer) {
    return "模型未识别到学生答案或具体解题步骤。";
  }

  return "模型未拆分出具体步骤，仅识别到学生答案。";
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function isExtractionConfidence(
  value: unknown,
): value is ExtractionConfidence {
  return value === "high" || value === "medium" || value === "low";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
