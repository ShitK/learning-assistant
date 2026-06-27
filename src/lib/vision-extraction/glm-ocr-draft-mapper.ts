import { normalizeExtractedMathText } from "@/lib/math/math-extraction-normalizer";
import type { VisionExtractionDraft } from "@/lib/vision-extraction/vision-extraction-types";

type GlmOcrParsedContent =
  import("@/lib/providers/glm-ocr-response-parser").GlmOcrParsedContent;

const MISSING_STUDENT_ANSWER = "未识别到学生答案";
const MISSING_STUDENT_ANSWER_WARNING =
  "未识别到清晰学生作答区域，请确认图片中包含学生答案或解题痕迹。";
const MAX_STEPS = 8;

export function mapGlmOcrContentToDraft(
  content: GlmOcrParsedContent,
): VisionExtractionDraft {
  const warnings = [...content.warnings];
  const orderedLayoutText = getOrderedLayoutText(content);
  const sourceText = content.markdown.trim() || orderedLayoutText;
  const split = splitQuestionAndAnswer(sourceText);

  if (!split.answerText) {
    return {
      question_text: normalizeExtractedMathText(split.questionText),
      student_answer: MISSING_STUDENT_ANSWER,
      student_solution_steps: [],
      extraction_confidence: "low",
      warnings: appendUnique(warnings, MISSING_STUDENT_ANSWER_WARNING),
    };
  }

  const steps = splitStudentSteps(split.answerText);
  const truncatedSteps = steps.slice(0, MAX_STEPS);
  if (steps.length > MAX_STEPS) {
    warnings.push("GLM-OCR 识别的学生步骤超过 8 条，已截取前 8 条。");
  }

  return {
    question_text: normalizeExtractedMathText(split.questionText),
    student_answer: normalizeExtractedMathText(split.answerText),
    student_solution_steps: truncatedSteps.map((step) =>
      normalizeExtractedMathText(step),
    ),
    extraction_confidence: truncatedSteps.length > 0 ? "medium" : "low",
    warnings,
  };
}

function getOrderedLayoutText(content: GlmOcrParsedContent): string {
  const text = content.layout_blocks
    .filter((block) => block.content.trim().length > 0)
    .map((block) => block.content.trim())
    .join("\n")
    .trim();

  return text.length > 0 ? text : "";
}

function splitQuestionAndAnswer(text: string): {
  questionText: string;
  answerText: string;
} {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const explicitAnswerMatch = /\n\s*(?:解|证明|答|学生答案|学生作答)\s*[:：]\s*/.exec(normalized);
  if (explicitAnswerMatch) {
    const start = explicitAnswerMatch.index;
    const answerStart = start + explicitAnswerMatch[0].length;
    return {
      questionText: normalized.slice(0, start).trim(),
      answerText: normalized.slice(answerStart).trim(),
    };
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const answerStartIndex = lines.findIndex((line, index) => {
    return index > 0 && isLikelyStudentStep(line);
  });

  if (answerStartIndex > 0) {
    return {
      questionText: lines.slice(0, answerStartIndex).join("\n"),
      answerText: lines.slice(answerStartIndex).join("\n"),
    };
  }

  return {
    questionText: normalized,
    answerText: "",
  };
}

function isLikelyStudentStep(line: string): boolean {
  return (
    /(?:f'|导|令|得|所以|因此|=|\\frac|\\sqrt|\\ln)/.test(line) &&
    !/(已知|求|讨论|证明|若|其中|小题|满分)/.test(line)
  );
}

function splitStudentSteps(text: string): string[] {
  return text
    .split(/\n|；|;/)
    .map((line) => line.replace(/^\s*\d+[.、)]\s*/, "").trim())
    .filter(Boolean);
}

function appendUnique(items: string[], item: string): string[] {
  return items.includes(item) ? items : [...items, item];
}
