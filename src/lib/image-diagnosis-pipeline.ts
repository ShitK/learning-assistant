import {
  demoStudentProfile,
  knowledgePoints,
  mistakeCauses,
  sampleDiagnoses,
} from "@/data/mathtrace-demo";
import {
  applyMemoryDeltaToProfile,
  isStudentProfile,
} from "@/lib/mathtrace-agent-pipeline";
import { isRecord } from "@/lib/utils";
import type {
  AgentStep,
  MemoryDelta,
  SampleDiagnosis,
  Severity,
} from "@/data/mathtrace-demo";
import type {
  DiagnoseImageSuccessResponse,
  ImageRecognizedQuestion,
  KnowledgeMapping,
  MistakeDiagnosis,
} from "@/lib/diagnose-api";
import type { AnalysisEnhancementDraft } from "@/lib/analysis-provider";
import type { VisionExtractionDraft } from "@/lib/vision-extraction-parser";

const IMAGE_AGENT_STEPS: AgentStep[] = [
  {
    id: "extraction",
    display_name: "识别题目",
    duration_ms: 600,
    summary: "已通过多模态模型抽取题干、学生答案和解题步骤。",
  },
  {
    id: "knowledge_mapping",
    display_name: "匹配知识点",
    duration_ms: 200,
    summary: "已根据内置知识库匹配相关知识点。",
  },
  {
    id: "mistake_diagnosis",
    display_name: "分析错因",
    duration_ms: 300,
    summary: "已根据现有错因标签体系生成诊断。",
  },
  {
    id: "memory_update",
    display_name: "更新画像",
    duration_ms: 200,
    summary: "已由本地规则计算画像增量。",
  },
  {
    id: "practice_generation",
    display_name: "生成练习",
    duration_ms: 200,
    summary: "已复用知识点模板生成三类练习。",
  },
  {
    id: "review_planning",
    display_name: "规划复习",
    duration_ms: 200,
    summary: "已生成 7 天复习建议。",
  },
];

export function runImageMathTraceAgent(input: {
  request: ImageDiagnosisPipelineRequest;
  extraction: VisionExtractionDraft;
  is_extraction_confirmed: boolean;
  analysis?: AnalysisEnhancementDraft;
}): DiagnoseImageSuccessResponse {
  const knowledgeMapping = mapImageKnowledgePoints(input.extraction);
  const recognizedQuestion = recognizeImageQuestion(
    input.extraction,
    knowledgeMapping,
  );
  const localMistakeDiagnosis = diagnoseImageMistake(
    input.extraction,
    knowledgeMapping,
  );
  const memoryDelta = computeImageMemoryDelta({
    request: input.request,
    extraction: input.extraction,
    is_extraction_confirmed: input.is_extraction_confirmed,
    knowledgeMapping,
    mistakeDiagnosis: localMistakeDiagnosis,
  });
  const mistakeDiagnosis = applyAnalysisEnhancement(
    localMistakeDiagnosis,
    input.analysis,
  );
  const templateSample = selectTemplateSample(knowledgeMapping.knowledge_points);
  const baseProfile = isStudentProfile(input.request.student_profile)
    ? input.request.student_profile
    : demoStudentProfile;
  const studentProfile = memoryDelta.should_persist
    ? applyMemoryDeltaToProfile(baseProfile, memoryDelta)
    : baseProfile;

  return {
    diagnosis_id: `diag_${recognizedQuestion.id}`,
    student_id: input.request.student_id,
    source: "image",
    steps: IMAGE_AGENT_STEPS,
    recognized_question: recognizedQuestion,
    knowledge_mapping: knowledgeMapping,
    mistake_diagnosis: mistakeDiagnosis,
    memory_delta: memoryDelta,
    student_profile: studentProfile,
    practice_questions: templateSample.practice_questions,
    review_plan: templateSample.review_plan,
    sample_diagnosis: null,
    fallback_used: false,
    warnings: mergeWarnings(input.extraction.warnings, input.analysis?.warnings),
  };
}

interface ImageDiagnosisPipelineRequest {
  student_id: string;
  student_profile: unknown;
  mistake_history: unknown[];
}

function recognizeImageQuestion(
  extraction: VisionExtractionDraft,
  knowledgeMapping: KnowledgeMapping,
): ImageRecognizedQuestion {
  return {
    id: `image_${hashText(extraction.question_text + extraction.student_answer)}`,
    title: "图片识别错题",
    module: inferModuleName(knowledgeMapping.knowledge_points[0]),
    question_text: extraction.question_text,
    student_answer: extraction.student_answer,
    student_solution_steps: extraction.student_solution_steps,
    extraction_confidence: extraction.extraction_confidence,
  };
}

function mapImageKnowledgePoints(
  extraction: VisionExtractionDraft,
): KnowledgeMapping {
  const text = joinExtractionText(extraction);
  const knowledgeIds: string[] = [];

  if (matchesAny(text, ["导数", "f'", "单调"])) {
    knowledgeIds.push("derivative_monotonicity");
  }

  if (matchesAny(text, ["参数", "讨论", "a\\le", "a>", "取值范围"])) {
    knowledgeIds.push("parameter_classification");
  }

  if (matchesAny(text, ["定义域", "ln", "log"])) {
    knowledgeIds.push("function_domain");
  }

  if (matchesAny(text, ["数列", "a_n", "a_{n+1}", "递推"])) {
    knowledgeIds.push("sequence_recursion");
  }

  if (matchesAny(text, ["等比", "公比"])) {
    knowledgeIds.push("geometric_sequence");
  }

  const safeKnowledgeIds = knowledgeIds.filter((knowledgeId) => {
    return knowledgePoints[knowledgeId] !== undefined;
  });

  return {
    knowledge_points:
      safeKnowledgeIds.length > 0 ? safeKnowledgeIds : ["derivative_monotonicity"],
    difficulty: inferDifficulty(safeKnowledgeIds),
  };
}

function diagnoseImageMistake(
  extraction: VisionExtractionDraft,
  knowledgeMapping: KnowledgeMapping,
): MistakeDiagnosis {
  const text = joinExtractionText(extraction);
  const causes: string[] = [];

  if (
    knowledgeMapping.knowledge_points.includes("parameter_classification") &&
    matchesAny(text, ["遗漏", "没有讨论", "只写", "只得到", "缺少"])
  ) {
    causes.push("classification_missing");
  }

  if (
    knowledgeMapping.knowledge_points.includes("function_domain") ||
    matchesAny(text, ["取值范围", "定义域", "-\\sqrt", "a\\le 0"])
  ) {
    causes.push("domain_missing");
  }

  if (
    knowledgeMapping.knowledge_points.includes("sequence_recursion") &&
    matchesAny(text, ["误判", "等差", "递推"])
  ) {
    causes.push("method_error");
  }

  if (matchesAny(text, ["变形", "构造", "等价"])) {
    causes.push("transformation_error");
  }

  if (causes.length === 0 && extraction.student_answer.trim().length > 0) {
    causes.push("calculation_error");
  }

  const safeCauses = causes.filter((causeId, index, allCauseIds) => {
    return mistakeCauses[causeId] !== undefined && allCauseIds.indexOf(causeId) === index;
  });

  return {
    mistake_causes: safeCauses,
    severity: inferSeverity(safeCauses.length),
    expected_diagnosis: buildExpectedDiagnosis(safeCauses),
    step_analysis: extraction.student_solution_steps,
    solution_highlights: [
      "先补全题目隐含条件和分类讨论前提。",
      "再按知识点逐步检查学生步骤中的遗漏点。",
      "最后用标准解法草稿对照关键结论。",
    ],
    standard_solution: extraction.standard_solution_draft,
  };
}

function applyAnalysisEnhancement(
  mistakeDiagnosis: MistakeDiagnosis,
  analysis: AnalysisEnhancementDraft | undefined,
): MistakeDiagnosis {
  if (!analysis) {
    return mistakeDiagnosis;
  }

  return {
    ...mistakeDiagnosis,
    expected_diagnosis: analysis.expected_diagnosis,
    step_analysis: analysis.step_analysis,
    solution_highlights: analysis.solution_highlights,
    standard_solution: analysis.standard_solution,
  };
}

function computeImageMemoryDelta(input: {
  request: ImageDiagnosisPipelineRequest;
  extraction: VisionExtractionDraft;
  is_extraction_confirmed: boolean;
  knowledgeMapping: KnowledgeMapping;
  mistakeDiagnosis: MistakeDiagnosis;
}): MemoryDelta {
  const severityChange = getSeverityChange(input.mistakeDiagnosis.severity);
  const isRepeatedMistake = hasRepeatedMistake(
    input.request.mistake_history,
    input.mistakeDiagnosis.mistake_causes,
  );
  const knowledgeMasteryChanges: Record<string, number> = {};

  for (const knowledgeId of input.knowledgeMapping.knowledge_points) {
    knowledgeMasteryChanges[knowledgeId] = severityChange;
  }

  const firstKnowledgeId = input.knowledgeMapping.knowledge_points[0];
  if (isRepeatedMistake && firstKnowledgeId) {
    knowledgeMasteryChanges[firstKnowledgeId] =
      (knowledgeMasteryChanges[firstKnowledgeId] ?? 0) - 2;
  }

  const mistakeCauseChanges: Record<string, number> = {};
  for (const causeId of input.mistakeDiagnosis.mistake_causes) {
    mistakeCauseChanges[causeId] = 1;
  }

  const shouldPersist =
    input.is_extraction_confirmed &&
    input.extraction.extraction_confidence !== "low";

  return {
    knowledge_mastery_changes: knowledgeMasteryChanges,
    mistake_cause_changes: mistakeCauseChanges,
    is_repeated_mistake: isRepeatedMistake,
    review_priority_changes: input.knowledgeMapping.knowledge_points,
    should_persist: shouldPersist,
    rationale:
      shouldPersist
        ? "用户已确认图片识别结果，且抽取置信度不是 low；由本地规则计算画像增量。"
        : input.extraction.extraction_confidence === "low"
        ? "图片抽取置信度低，本次只展示诊断建议，不写入长期画像。"
        : "图片识别结果尚未确认，本次不写入长期画像。",
  };
}

function selectTemplateSample(knowledgeIds: string[]): SampleDiagnosis {
  const sample =
    sampleDiagnoses.find((item) => {
      return item.knowledge_points.some((knowledgeId) => {
        return knowledgeIds.includes(knowledgeId);
      });
    }) ?? sampleDiagnoses[0];

  if (!sample) {
    throw new Error("缺少样例题模板，无法生成练习和复习计划。");
  }

  return sample;
}

function inferModuleName(knowledgeId: string | undefined): string {
  if (!knowledgeId) {
    return "数学";
  }

  const knowledgeModule = knowledgePoints[knowledgeId]?.module;
  if (knowledgeModule === "derivative") {
    return "导数";
  }

  if (knowledgeModule === "function") {
    return "函数";
  }

  if (knowledgeModule === "sequence") {
    return "数列";
  }

  return "数学";
}

function inferDifficulty(knowledgeIds: string[]): number {
  if (knowledgeIds.includes("parameter_classification")) {
    return 4;
  }

  if (knowledgeIds.includes("function_domain")) {
    return 3;
  }

  if (knowledgeIds.includes("sequence_recursion")) {
    return 3;
  }

  return 2;
}

function inferSeverity(causeCount: number): Severity {
  if (causeCount >= 3) {
    return "severe";
  }

  if (causeCount === 2) {
    return "medium";
  }

  return "minor";
}

function getSeverityChange(severity: Severity): number {
  if (severity === "severe") {
    return -9;
  }

  if (severity === "medium") {
    return -6;
  }

  return -3;
}

function hasRepeatedMistake(
  mistakeHistory: unknown[],
  mistakeCauseIds: string[],
): boolean {
  return mistakeHistory.some((item) => {
    if (!isRecord(item) || !Array.isArray(item.mistake_causes)) {
      return false;
    }

    return item.mistake_causes.some((causeId) => {
      return typeof causeId === "string" && mistakeCauseIds.includes(causeId);
    });
  });
}

function buildExpectedDiagnosis(causeIds: string[]): string {
  const causeNames = causeIds.map((causeId) => {
    return mistakeCauses[causeId]?.display_name ?? causeId;
  });

  if (causeNames.length === 0) {
    return "本次未能稳定定位错因，需要学生补充更清晰的解题步骤。";
  }

  return `本次主要暴露 ${causeNames.join("、")}。`;
}

function joinExtractionText(extraction: VisionExtractionDraft): string {
  return [
    extraction.question_text,
    extraction.student_answer,
    extraction.student_solution_steps.join("\n"),
    extraction.standard_solution_draft,
  ].join("\n");
}

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function mergeWarnings(
  extractionWarnings: string[],
  analysisWarnings: string[] | undefined,
): string[] {
  return [...new Set([...extractionWarnings, ...(analysisWarnings ?? [])])];
}

function hashText(text: string): string {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
}
