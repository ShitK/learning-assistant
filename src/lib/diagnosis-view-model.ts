import type {
  AgentStep,
  MemoryDelta,
  PracticeQuestion,
  ReviewPlan,
  SampleDiagnosis,
  Severity,
} from "@/data/mathtrace-demo";
import type {
  DiagnoseImageExtractionResponse,
  DiagnoseImageSuccessResponse,
  EvidenceLevel,
  FollowUpAnswerDraft,
  PersistenceEvidence,
  ProblemRiskFollowUp,
  ProfileUpdateKind,
} from "@/lib/diagnose-api";
import {
  joinEditableStepsText,
  splitEditableStepsText,
} from "@/lib/image-confirmation";
import type { VisionExtractionDraft } from "@/lib/vision-extraction-parser";

export interface DiagnosisViewModel {
  source: "sample" | "image";
  id: string;
  title: string;
  module: string;
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  extraction_confidence: "high" | "medium" | "low" | null;
  knowledge_points: string[];
  difficulty: number;
  mistake_causes: string[];
  severity: Severity;
  expected_diagnosis: string;
  step_analysis: string[];
  solution_highlights: string[];
  standard_solution: string;
  memory_delta: MemoryDelta;
  practice_questions: PracticeQuestion[];
  review_plan: ReviewPlan;
  steps: AgentStep[];
  should_persist_profile: boolean;
  evidence_level: EvidenceLevel | null;
  persistence_evidence: PersistenceEvidence | null;
  profile_update_kind: ProfileUpdateKind;
  risk_follow_up: ProblemRiskFollowUp | null;
  warnings: string[];
}

export interface EditableExtractionDraft {
  confirmation_token: string;
  question_text: string;
  student_answer: string;
  steps_text: string;
  standard_solution_draft: string;
  extraction_confidence: "high" | "medium" | "low";
  warnings: string[];
  can_persist_after_confirmation: boolean;
}

export type StandardSolutionBlock =
  | { kind: "ordered"; marker: string; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string };

interface AgentTimelineStatusInput {
  isDiagnosing: boolean;
  isAwaitingConfirmation: boolean;
  hasRetainedReportNotice: boolean;
}

export interface DiagnosisResultVisibility {
  show_image_recognition: boolean;
  show_student_answer_text: boolean;
}

export function createSampleDiagnosisViewModel(
  sample: SampleDiagnosis,
): DiagnosisViewModel {
  return {
    source: "sample",
    id: sample.id,
    title: sample.title,
    module: sample.module,
    question_text: sample.question_text,
    student_answer: sample.student_answer,
    student_solution_steps: sample.step_analysis,
    extraction_confidence: null,
    knowledge_points: sample.knowledge_points,
    difficulty: sample.difficulty,
    mistake_causes: sample.mistake_causes,
    severity: sample.severity,
    expected_diagnosis: sample.expected_diagnosis,
    step_analysis: sample.step_analysis,
    solution_highlights: sample.solution_highlights,
    standard_solution: sample.standard_solution,
    memory_delta: sample.memory_delta,
    practice_questions: sample.practice_questions,
    review_plan: sample.review_plan,
    steps: sample.steps,
    should_persist_profile: true,
    evidence_level: null,
    persistence_evidence: null,
    profile_update_kind: "mistake_cause",
    risk_follow_up: null,
    warnings: [],
  };
}

export function createImageDiagnosisViewModel(
  response: DiagnoseImageSuccessResponse,
): DiagnosisViewModel {
  return {
    source: "image",
    id: response.recognized_question.id,
    title: response.recognized_question.title,
    module: response.recognized_question.module,
    question_text: response.recognized_question.question_text,
    student_answer: response.recognized_question.student_answer,
    student_solution_steps: response.recognized_question.student_solution_steps,
    extraction_confidence: response.recognized_question.extraction_confidence,
    knowledge_points: response.knowledge_mapping.knowledge_points,
    difficulty: response.knowledge_mapping.difficulty,
    mistake_causes: response.mistake_diagnosis.mistake_causes,
    severity: response.mistake_diagnosis.severity,
    expected_diagnosis: response.mistake_diagnosis.expected_diagnosis,
    step_analysis: response.mistake_diagnosis.step_analysis,
    solution_highlights: response.mistake_diagnosis.solution_highlights,
    standard_solution: createDisplayStandardSolution({
      standardSolution: response.mistake_diagnosis.standard_solution,
      questionText: response.recognized_question.question_text,
      knowledgePoints: response.knowledge_mapping.knowledge_points,
    }),
    memory_delta: response.memory_delta,
    practice_questions: response.practice_questions,
    review_plan: response.review_plan,
    steps: response.steps,
    should_persist_profile: response.memory_delta.should_persist,
    evidence_level: response.evidence_level,
    persistence_evidence: response.persistence_evidence,
    profile_update_kind: response.profile_update_kind,
    risk_follow_up: response.risk_follow_up,
    warnings: getUserFacingWarnings(response.warnings),
  };
}

export function createEditableExtractionDraft(
  response: DiagnoseImageExtractionResponse,
): EditableExtractionDraft {
  return {
    confirmation_token: response.confirmation_token,
    question_text: response.recognized_question.question_text,
    student_answer: response.recognized_question.student_answer,
    steps_text: joinEditableStepsText(
      response.recognized_question.student_solution_steps,
    ),
    standard_solution_draft:
      response.recognized_question.standard_solution_draft,
    extraction_confidence: response.recognized_question.extraction_confidence,
    warnings: getUserFacingWarnings(response.warnings),
    can_persist_after_confirmation: response.can_persist_after_confirmation,
  };
}

export function createVisionExtractionDraftFromEditableDraft(
  draft: EditableExtractionDraft,
): VisionExtractionDraft {
  return {
    question_text: draft.question_text,
    student_answer: draft.student_answer,
    student_solution_steps: splitEditableStepsText(draft.steps_text),
    standard_solution_draft: draft.standard_solution_draft,
    extraction_confidence: draft.extraction_confidence,
    warnings: draft.warnings,
  };
}

export function canConfirmEditableExtractionDraft(
  draft: EditableExtractionDraft,
): boolean {
  return (
    draft.question_text.trim().length > 0 &&
    draft.student_answer.trim().length > 0 &&
    draft.standard_solution_draft.trim().length > 0 &&
    splitEditableStepsText(draft.steps_text).length > 0
  );
}

export function canShowRiskFollowUp(view: DiagnosisViewModel): boolean {
  return view.source === "image" && view.risk_follow_up !== null;
}

export function createFollowUpDraftFromChoice(
  selectedId: string,
  customText = "",
): FollowUpAnswerDraft {
  if (selectedId === "custom") {
    return {
      selected_stuck_point_id: null,
      custom_text: customText.trim(),
    };
  }

  return {
    selected_stuck_point_id: selectedId,
    custom_text: null,
  };
}

export function createStandardSolutionBlocks(
  text: string,
): StandardSolutionBlock[] {
  const trimmedText = normalizeStandardSolutionBlockText(text).trim();

  if (hasMultilineDisplayMath(trimmedText)) {
    return trimmedText.length > 0
      ? [{ kind: "paragraph", text: trimmedText }]
      : [];
  }

  const lines = trimmedText
    .split("\n")
    .map((line) => line.trim())
    .map(stripStandardSolutionMarkdownPrefix)
    .filter((line) => line.length > 0);

  const blocks: StandardSolutionBlock[] = lines.map((line) => {
    const orderedMatch = /^(\d+)\.\s+(.+)$/.exec(line);

    if (orderedMatch) {
      return {
        kind: "ordered",
        marker: orderedMatch[1],
        text: orderedMatch[2].trim(),
      };
    }

    const bulletMatch = /^-\s+(.+)$/.exec(line);

    if (bulletMatch) {
      return { kind: "paragraph", text: bulletMatch[1].trim() };
    }

    return { kind: "paragraph", text: line };
  });

  const hasInlineOrderedMarkers = lines.some((line) => {
    return /^\d+\.\s+/.test(line) && /(?<=[。；])\s*\d+\.\s+/.test(line);
  });

  if (blocks.some((block) => block.kind !== "paragraph") && !hasInlineOrderedMarkers) {
    return blocks;
  }

  const sentences = splitStandardSolutionSentences(trimmedText).map(
    stripStandardSolutionMarkdownPrefix,
  );

  if (sentences.length <= 1) {
    return blocks;
  }

  const sentenceBlocks: StandardSolutionBlock[] = sentences.map((sentence) => {
    const leadingMarker = extractLeadingSolutionMarker(sentence);

    if (leadingMarker) {
      return {
        kind: "ordered",
        marker: leadingMarker.marker,
        text: leadingMarker.text,
      };
    }

    return { kind: "paragraph", text: sentence };
  });

  if (
    sentenceBlocks.some((block) => block.kind === "ordered") ||
    sentenceBlocks.some(hasParagraphLeadingSolutionMarker) ||
    shouldSplitLongStandardSolution(trimmedText, sentences)
  ) {
    return sentenceBlocks;
  }

  return blocks;
}

function stripStandardSolutionMarkdownPrefix(text: string): string {
  let strippedText = text.trim();

  for (let index = 0; index < 3; index += 1) {
    const nextText = strippedText
      .replace(
        /^\*\*\s*([（(]\d+[）)]|\d+[.、]?)\s*\*\*\s*/,
        (_match, marker: string) => `${marker} `,
      )
      .replace(/^[-–—•]\s+/, "")
      .trim();

    if (nextText === strippedText) {
      return strippedText;
    }

    strippedText = nextText;
  }

  return strippedText;
}

export function createStandardSolutionDisplayText(text: string): string {
  const normalizedText = normalizeEscapedNewlines(text);
  const parts: string[] = [];
  const mathPattern = /(?<!\\)(\$\$?)[\s\S]+?(?<!\\)\1/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = mathPattern.exec(normalizedText)) !== null) {
    if (match.index > cursor) {
      parts.push(decorateLooseMathText(normalizedText.slice(cursor, match.index)));
    }

    parts.push(match[0]);
    cursor = match.index + match[0].length;
  }

  if (cursor < normalizedText.length) {
    parts.push(decorateLooseMathText(normalizedText.slice(cursor)));
  }

  return parts.join("");
}

function createDisplayStandardSolution(input: {
  standardSolution: string;
  questionText: string;
  knowledgePoints: string[];
}): string {
  const normalizedSolution = normalizeEscapedNewlines(
    input.standardSolution,
  ).trim();

  if (!isLikelyIncompleteStandardSolution(normalizedSolution)) {
    return input.standardSolution;
  }

  const stablePrefix = removeDanglingStandardSolutionLines(normalizedSolution);
  const fallback = createStandardSolutionFallback(input);

  return stablePrefix.length > 0 ? `${stablePrefix}\n${fallback}` : fallback;
}

function isLikelyIncompleteStandardSolution(text: string): boolean {
  if (text.length === 0) {
    return true;
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const lastLine = lines[lines.length - 1] ?? "";

  return (
    isDanglingStandardSolutionLine(lastLine) ||
    /[，、：:]$/.test(text.trim())
  );
}

function removeDanglingStandardSolutionLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !isDanglingStandardSolutionLine(line))
    .join("\n");
}

function isDanglingStandardSolutionLine(line: string): boolean {
  return /^[-–—•]?\s*(?:当|若|由|故|因此|所以|综上|则|分类|分情况)?\s*[：:]?$/.test(
    line,
  );
}

function createStandardSolutionFallback(input: {
  questionText: string;
  knowledgePoints: string[];
}): string {
  const text = input.questionText;
  const hasDerivative =
    input.knowledgePoints.includes("derivative_monotonicity") ||
    /导数|单调|极值|f'/.test(text);
  const hasParameter =
    input.knowledgePoints.includes("parameter_classification") ||
    /参数|取值范围|讨论/.test(text);

  if (hasDerivative && hasParameter) {
    return [
      "2. 按 $a\\le 0$ 与 $a>0$ 分类讨论导数符号。",
      "3. 若 $a>0$，先由 $f'(x)=0$ 找临界点，再判断极值点位置。",
      "4. 结合题目条件和定义域限制，整理参数范围。",
    ].join("\n");
  }

  if (hasDerivative) {
    return [
      "2. 根据 $f'(x)$ 的符号判断函数单调区间。",
      "3. 再结合题目条件检查极值、端点或零点约束。",
    ].join("\n");
  }

  return [
    "2. 补全题目隐含条件，再按知识点逐步推导。",
    "3. 用题目条件校验关键结论，整理最终答案。",
  ].join("\n");
}

function getUserFacingWarnings(warnings: string[]): string[] {
  return warnings.filter((warning) => !isTechnicalWarning(warning));
}

function isTechnicalWarning(warning: string): boolean {
  return /置信度|低置信度|warnings|JSON|字段|格式|模型未返回|模型返回|extraction_confidence|student_solution_steps|开发诊断/.test(
    warning,
  );
}

function normalizeEscapedNewlines(text: string): string {
  return text.replace(/\\n/g, "\n");
}

function normalizeStandardSolutionBlockText(text: string): string {
  return normalizeEscapedNewlines(text).replace(
    /(^|[。；\n]\s*)\\(?=(?:[（(]\d+[）)]|[①②③④⑤⑥⑦⑧⑨⑩]|当|若|要使|由|故|因此|所以|综上))/g,
    "$1",
  );
}

function hasMultilineDisplayMath(text: string): boolean {
  return /\$\$[\s\S]*\n[\s\S]*\$\$/.test(text);
}

function splitStandardSolutionSentences(text: string): string[] {
  return text
    .split(/(?<=[。；])\s*/)
    .flatMap((sentence) => splitStandardSolutionInlineMarkers(sentence))
    .flatMap((sentence) => splitStandardSolutionConditionBranches(sentence))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

function splitStandardSolutionInlineMarkers(text: string): string[] {
  const parts: string[] = [];
  const markerPattern = /(?<=[。；])\s*(?=(?:[（(]\d+[）)]|[①②③④⑤⑥⑦⑧⑨⑩])\s*)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = markerPattern.exec(text)) !== null) {
    parts.push(text.slice(cursor, match.index));
    cursor = match.index;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts.length > 0 ? parts : [text];
}

function splitStandardSolutionConditionBranches(text: string): string[] {
  const parts: string[] = [];
  const conditionBranchPattern = /，(?=当[^，。；]{1,50}时)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = conditionBranchPattern.exec(text)) !== null) {
    const nextCursor = match.index + 1;
    parts.push(text.slice(cursor, nextCursor));
    cursor = nextCursor;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return parts.length > 0 ? parts : [text];
}

function shouldSplitLongStandardSolution(
  text: string,
  sentences: string[],
): boolean {
  const hasConditionOrConclusionCue = sentences.some((sentence) => {
    return /^(当|若|要使|由|故|因此|所以|综上)/.test(sentence);
  });

  return text.length >= 140 && sentences.length > 1 && hasConditionOrConclusionCue;
}

function extractLeadingSolutionMarker(
  text: string,
): { marker: string; text: string } | null {
  const dotMarkerMatch = /^\s*(\d+)\.\s+(.+)$/.exec(text);

  if (dotMarkerMatch) {
    return {
      marker: dotMarkerMatch[1],
      text: dotMarkerMatch[2].trim(),
    };
  }

  return null;
}

function hasParagraphLeadingSolutionMarker(
  block: StandardSolutionBlock,
): boolean {
  return (
    block.kind === "paragraph" &&
    /^\s*(?:[\(（]\d+[\)）]|[①②③④⑤⑥⑦⑧⑨⑩])\s*/.test(block.text)
  );
}

function decorateLooseMathText(text: string): string {
  return decorateSimpleLooseMathText(
    decorateRawLatexText(removeDanglingInlineMathOpeners(text)),
  );
}

function removeDanglingInlineMathOpeners(text: string): string {
  return text.replace(
    /(^|[^\\])\$\s*(?=\\(?:frac|ln|leq|geq|cdot|infty|sqrt|le|ge|times)\b)/g,
    (_match, prefix: string) => {
      if (prefix.length === 0 || /\s/.test(prefix)) {
        return prefix;
      }

      return `${prefix} `;
    },
  );
}

function decorateRawLatexText(text: string): string {
  return text.replace(
    /[A-Za-z0-9'′()+\-*/=<>≤≥∈∞,.\s\\{}]+/g,
    (candidate) => decorateRawLatexCandidate(candidate),
  );
}

function decorateRawLatexCandidate(candidate: string): string {
  const leadingWhitespace = candidate.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = candidate.match(/\s*$/)?.[0] ?? "";
  const core = candidate.trim();

  if (core.length === 0 || !hasRawLatexCommand(core)) {
    return candidate;
  }

  return `${leadingWhitespace}$${core}$${trailingWhitespace}`;
}

function hasRawLatexCommand(text: string): boolean {
  return /\\(?:frac|ln|leq|geq|cdot|infty|sqrt|le|ge|times)\b/.test(text);
}

function decorateSimpleLooseMathText(text: string): string {
  const parts: string[] = [];
  const mathPattern = /(?<!\\)(\$\$?)[\s\S]+?(?<!\\)\1/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = mathPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(decorateSimpleLooseMathSegment(text.slice(cursor, match.index)));
    }

    parts.push(match[0]);
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    parts.push(decorateSimpleLooseMathSegment(text.slice(cursor)));
  }

  return parts.join("");
}

function decorateSimpleLooseMathSegment(text: string): string {
  return text.replace(
    /[A-Za-z0-9'′()+\-*/=<>≤≥∈∞,.\s]+/g,
    (candidate) => decorateLooseMathCandidate(candidate),
  );
}

function decorateLooseMathCandidate(candidate: string): string {
  const leadingWhitespace = candidate.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = candidate.match(/\s*$/)?.[0] ?? "";
  const core = candidate.trim();

  if (core.length === 0 || !isLikelyLooseMath(core)) {
    return candidate;
  }

  return `${leadingWhitespace}$${core}$${trailingWhitespace}`;
}

function isLikelyLooseMath(text: string): boolean {
  return (
    /[=<>≤≥∈∞]/.test(text) ||
    /\b[a-zA-Z][′']?\([^)]*\)/.test(text) ||
    /\bln\([^)]*\)/.test(text) ||
    /\d+\/[a-zA-Z]/.test(text) ||
    /\([^)]*,[^)]*(?:[a-zA-Z∞]|\/)[^)]*\)/.test(text)
  );
}

export function createRetainedReportNotice(
  diagnosis: DiagnosisViewModel,
  errorMessage: string,
): string {
  const prefix =
    diagnosis.source === "image"
      ? "当前显示的是上一次成功图片诊断结果，本次图片诊断未生成新报告。"
      : "当前显示的是样例题结果，本次图片诊断未生成新报告。";

  return `${prefix}原因：${errorMessage}`;
}

export function createExtractionReviewRetainedReportNotice(
  diagnosis: DiagnosisViewModel,
): string {
  const prefix =
    diagnosis.source === "image"
      ? "当前显示的是上一次成功图片诊断报告，"
      : "当前显示的是样例题结果，";

  return `${prefix}本次图片只完成识别抽取，确认后才会生成新报告。`;
}

export function createAgentTimelineStatusLabel({
  isDiagnosing,
  isAwaitingConfirmation,
  hasRetainedReportNotice,
}: AgentTimelineStatusInput): string {
  if (isDiagnosing) {
    return "正在分析";
  }

  if (isAwaitingConfirmation) {
    return "待确认识别";
  }

  if (hasRetainedReportNotice) {
    return "保留旧报告";
  }

  return "诊断完成";
}

export function createDiagnosisResultVisibility(input: {
  source: DiagnosisViewModel["source"];
  isCurrentConfirmedImageReport: boolean;
}): DiagnosisResultVisibility {
  const shouldHideConfirmedRecognition =
    input.source === "image" && input.isCurrentConfirmedImageReport;

  return {
    show_image_recognition: !shouldHideConfirmedRecognition,
    show_student_answer_text: !shouldHideConfirmedRecognition,
  };
}
