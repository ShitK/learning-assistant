import { isRecord } from "@/lib/shared/utils";
import type {
  ExtractionConfidence,
  VisionExtractionDraft,
} from "@/lib/image-diagnosis/vision-extraction-parser";

export function parseConfirmedExtractionDraft(
  value: unknown,
): { ok: true; value: VisionExtractionDraft } | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "confirmed_extraction 必须是对象。" };
  }

  if (!isNonEmptyString(value.question_text)) {
    return { ok: false, message: "题干不能为空。" };
  }

  if (!isNonEmptyString(value.student_answer)) {
    return { ok: false, message: "学生答案不能为空。" };
  }

  if (!isNonEmptyString(value.standard_solution_draft)) {
    return { ok: false, message: "标准解法草稿不能为空。" };
  }

  if (!isExtractionConfidence(value.extraction_confidence)) {
    return { ok: false, message: "识别置信度不合法。" };
  }

  const steps = parseEditableLines(value.student_solution_steps, 8);
  if (!steps.ok || steps.value.length === 0) {
    return { ok: false, message: "学生解题步骤至少需要 1 条。" };
  }

  const warnings = parseEditableLines(value.warnings, 5);
  if (!warnings.ok) {
    return { ok: false, message: "warnings 必须是字符串数组。" };
  }

  return {
    ok: true,
    value: {
      question_text: value.question_text.trim(),
      student_answer: value.student_answer.trim(),
      student_solution_steps: steps.value,
      standard_solution_draft: value.standard_solution_draft.trim(),
      extraction_confidence: value.extraction_confidence,
      warnings: warnings.value,
    },
  };
}

export function splitEditableStepsText(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function joinEditableStepsText(steps: string[]): string {
  return steps.join("\n");
}

function parseEditableLines(
  value: unknown,
  maxCount: number,
): { ok: true; value: string[] } | { ok: false } {
  if (!Array.isArray(value)) {
    return { ok: false };
  }

  for (const item of value) {
    if (typeof item !== "string") {
      return { ok: false };
    }
  }

  const lines = value
    .map((item) => item.trim())
    .filter((line) => line.length > 0)
    .slice(0, maxCount);

  return { ok: true, value: lines };
}

function isExtractionConfidence(
  value: unknown,
): value is ExtractionConfidence {
  return value === "high" || value === "medium" || value === "low";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
