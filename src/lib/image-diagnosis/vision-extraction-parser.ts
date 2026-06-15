import { isRecord } from "@/lib/shared/utils";
import { normalizeExtractedMathText } from "@/lib/math/math-extraction-normalizer";

export type ExtractionConfidence = "high" | "medium" | "low";

export interface VisionExtractionDraft {
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  standard_solution_draft: string;
  extraction_confidence: ExtractionConfidence;
  warnings: string[];
}

export const VISION_STANDARD_SOLUTION_PLACEHOLDER =
  "标准解法将在确认后由分析模型生成。";

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

interface StringListParseOptions {
  field_name: "student_solution_steps" | "warnings";
  min_length: number;
  max_length: number;
  invalid_item_warning?: string;
  truncated_warning?: string;
}

interface StringListParseResult {
  items: string[];
  warnings: string[];
  has_invalid_item: boolean;
}

interface ParsedStringListItems {
  items: string[];
  warnings: string[];
  dropped_invalid_item: boolean;
}

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

export function parseVisionExtractionText(text: string): VisionExtractionParseResult {
  let parsed: unknown;
  const normalizedText = extractJsonObjectText(text) ?? text;

  try {
    parsed = JSON.parse(normalizedText);
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

  const parserWarnings: string[] = [];

  const standardSolutionDraft = isNonEmptyString(parsed.standard_solution_draft)
    ? normalizeExtractedMathText(parsed.standard_solution_draft.trim())
    : VISION_STANDARD_SOLUTION_PLACEHOLDER;
  if (!isNonEmptyString(parsed.standard_solution_draft)) {
    parserWarnings.push(
      "视觉模型未返回标准解法草稿，确认后将由分析模型生成标准解法。",
    );
  }

  const extractionConfidence = isExtractionConfidence(parsed.extraction_confidence)
    ? parsed.extraction_confidence
    : "low";
  if (!isExtractionConfidence(parsed.extraction_confidence)) {
    parserWarnings.push("模型未返回置信度，已按低置信度处理。");
  }

  const steps = parseStringList(parsed.student_solution_steps, {
    field_name: "student_solution_steps",
    min_length: 0,
    max_length: 8,
    invalid_item_warning: "部分学生步骤为空或格式不完整，已忽略。",
    truncated_warning: "模型返回的学生步骤超过 8 条，已截取前 8 条。",
  });
  if (!steps) {
    return invalidOutput(
      "模型输出的 student_solution_steps 不合法。",
      debugSummary,
    );
  }

  const warnings = parseStringList(parsed.warnings, {
    field_name: "warnings",
    min_length: 0,
    max_length: Number.MAX_SAFE_INTEGER,
  });
  if (!warnings) {
    parserWarnings.push("模型返回的 warnings 格式不完整，已忽略。");
  }

  const normalized = normalizeExtractionDraft({
    student_answer: parsed.student_answer.trim(),
    student_solution_steps: steps.items,
    has_partial_student_steps: steps.has_invalid_item,
    extraction_confidence: extractionConfidence,
    model_warnings: warnings?.items ?? [],
    parser_warnings: [...parserWarnings, ...steps.warnings],
  });

  return {
    ok: true,
    value: {
      question_text: normalizeExtractedMathText(parsed.question_text.trim()),
      student_answer: normalizeExtractedMathText(normalized.student_answer),
      student_solution_steps: normalized.student_solution_steps.map((step) =>
        normalizeExtractedMathText(step),
      ),
      standard_solution_draft: standardSolutionDraft,
      extraction_confidence: normalized.extraction_confidence,
      warnings: normalized.warnings,
    },
  };
}

function extractJsonObjectText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedJson = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (fencedJson?.[1]) {
    const candidate = fencedJson[1].trim();
    return candidate.startsWith("{") && candidate.endsWith("}")
      ? candidate
      : null;
  }

  return extractBalancedJsonObject(trimmed);
}

function extractBalancedJsonObject(text: string): string | null {
  const startIndex = text.indexOf("{");
  if (startIndex === -1) {
    return null;
  }

  let depth = 0;
  let isInsideString = false;
  let isEscaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      isInsideString = !isInsideString;
      continue;
    }

    if (isInsideString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

export function createVisionExtractionPrompt(input: {
  student_profile_summary: string;
}): string {
  return [
    "你是 MathTrace 的图片错题抽取器。",
    "请只做题目、学生答案和学生解题步骤抽取。",
    "只输出一个合法 JSON 对象，不要输出 Markdown、解释文字或代码块。",
    "JSON 字段必须且只能包含 question_text、student_answer、student_solution_steps、extraction_confidence、warnings。",
    "不要生成标准解法、标准答案或完整解题过程；标准解法会在用户确认后由文本分析模型生成。",
    "question_text、student_answer、student_solution_steps 中的数学表达式都必须使用 LaTeX，并用 $...$ 或 $$...$$ 包裹。",
    "包含 LaTeX 命令的表达式也必须整体包裹，例如把 \\frac{1}{a}、\\ln a、a\\leq 0 写成 $\\frac{1}{a}$、$\\ln a$、$a\\leq 0$。",
    "student_solution_steps 和 warnings 必须输出为字符串数组；没有 warning 时输出空数组 []。",
    "如果没有识别到学生答案，也必须输出 student_answer=\"未识别到学生答案\"，并将 extraction_confidence 设为 \"low\"。",
    "不要输出 memory_delta、student_profile、mistake_history、错因频次或画像更新。",
    "如果图片不清晰或信息不足，请设置 extraction_confidence=\"low\"，并把需要学生确认的点写入 warnings。",
    'JSON 示例：{"question_text":"...","student_answer":"...","student_solution_steps":["..."],"extraction_confidence":"high","warnings":[]}',
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
    const parsed = parseStringList(value[key], {
      field_name: key === "warnings" ? "warnings" : "student_solution_steps",
      min_length: 0,
      max_length: Number.MAX_SAFE_INTEGER,
    });
    return parsed?.items.length;
  }

  return undefined;
}

function parseStringList(
  value: unknown,
  options: StringListParseOptions,
): StringListParseResult | null {
  const parsedItems =
    typeof value === "string"
      ? parseStringListText(value)
      : parseStringListArray(value, options.field_name);

  if (!parsedItems) {
    return null;
  }

  const usableItems = parsedItems.items.filter((item) => item.length > 0);
  const warnings = [...parsedItems.warnings];

  if (
    parsedItems.dropped_invalid_item &&
    options.invalid_item_warning &&
    usableItems.length > 0
  ) {
    warnings.push(options.invalid_item_warning);
  }

  if (usableItems.length < options.min_length) {
    return null;
  }

  const items = usableItems.slice(0, options.max_length);
  if (usableItems.length > options.max_length && options.truncated_warning) {
    warnings.push(options.truncated_warning);
  }

  return {
    items,
    warnings,
    has_invalid_item: parsedItems.dropped_invalid_item,
  };
}

function parseStringListText(value: string): ParsedStringListItems {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      items: [],
      warnings: [],
      dropped_invalid_item: false,
    };
  }

  const items = trimmed.split(/\r?\n/).map(normalizeStringListItem);

  return {
    items,
    warnings: [],
    dropped_invalid_item: false,
  };
}

function parseStringListArray(
  value: unknown,
  fieldName: StringListParseOptions["field_name"],
): ParsedStringListItems | null {
  if (!Array.isArray(value)) {
    return null;
  }

  let droppedInvalidItem = false;
  const items: string[] = [];

  for (const item of value) {
    if (Array.isArray(item)) {
      return null;
    }

    const parsedItem = parseStringListItem(item, fieldName);
    if (!parsedItem) {
      droppedInvalidItem = true;
      continue;
    }

    items.push(parsedItem);
  }

  return {
    items,
    warnings: [],
    dropped_invalid_item: droppedInvalidItem,
  };
}

function parseStringListItem(
  value: unknown,
  fieldName: StringListParseOptions["field_name"],
): string | null {
  if (typeof value === "string") {
    return normalizeStringListItem(value);
  }

  if (fieldName !== "student_solution_steps" || !isRecord(value)) {
    return null;
  }

  for (const key of ["text", "content", "step", "value"]) {
    const fieldValue = value[key];
    if (typeof fieldValue === "string") {
      return normalizeStringListItem(fieldValue);
    }
  }

  return null;
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
  has_partial_student_steps: boolean;
  extraction_confidence: ExtractionConfidence;
  model_warnings: string[];
  parser_warnings: string[];
}): {
  student_answer: string;
  student_solution_steps: string[];
  extraction_confidence: ExtractionConfidence;
  warnings: string[];
} {
  const hasUnrecognizedAnswer = isUnrecognizedStudentAnswer(input.student_answer);
  const hasEmptySteps = input.student_solution_steps.length === 0;
  const parserWarnings = [...input.parser_warnings];
  const fallbackWarnings: string[] = [];
  const studentSolutionSteps = hasEmptySteps
    ? [getEmptyStepPlaceholder(hasUnrecognizedAnswer)]
    : input.student_solution_steps;

  if (hasUnrecognizedAnswer) {
    fallbackWarnings.push(
      "未识别到清晰学生作答区域，请确认图片中包含学生答案或解题痕迹。",
    );
  }

  if (hasEmptySteps) {
    fallbackWarnings.push("未识别到清晰学生解题步骤，请确认图片中包含学生过程。");
  }

  return {
    student_answer: input.student_answer,
    student_solution_steps: studentSolutionSteps,
    extraction_confidence:
      hasUnrecognizedAnswer || hasEmptySteps || input.has_partial_student_steps
        ? "low"
        : input.extraction_confidence,
    warnings: dedupeStrings([
      ...parserWarnings,
      ...input.model_warnings,
      ...fallbackWarnings,
    ]).slice(0, 5),
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
