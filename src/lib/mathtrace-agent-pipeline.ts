import {
  demoStudentProfile,
  knowledgePoints,
  mistakeCauses,
  sampleDiagnoses,
} from "@/data/mathtrace-demo";
import { clampScore, isRecord } from "@/lib/utils";
import type {
  KnowledgePoint,
  MemoryDelta,
  MistakeCause,
  PracticeQuestion,
  ReviewPlan,
  SampleDiagnosis,
  SampleQuestionId,
  StudentProfile,
} from "@/data/mathtrace-demo";
import type {
  DiagnoseSuccessResponse,
  KnowledgeMapping,
  MistakeDiagnosis,
  ParsedSampleDiagnoseRequest,
  RecognizedQuestion,
} from "@/lib/diagnose-api";

export type AgentStageId =
  | "task_planning"
  | "question_recognition"
  | "knowledge_retrieval"
  | "knowledge_mapping"
  | "mistake_diagnosis"
  | "memory_delta"
  | "practice_generation"
  | "review_planning"
  | "response_building";

export interface AgentTaskPlan {
  task_type: "sample_diagnosis";
  sample_question_id: SampleQuestionId;
  stage_ids: AgentStageId[];
  expected_outputs: string[];
  risk_notes: string[];
}

export interface KnowledgeContext {
  sample: SampleDiagnosis;
  knowledge_points: KnowledgePoint[];
  mistake_causes: MistakeCause[];
}

export interface BuildDiagnoseResponseInput {
  request: ParsedSampleDiagnoseRequest;
  recognizedQuestion: RecognizedQuestion;
  knowledgeMapping: KnowledgeMapping;
  mistakeDiagnosis: MistakeDiagnosis;
  memoryDelta: MemoryDelta;
  practiceQuestions: PracticeQuestion[];
  reviewPlan: ReviewPlan;
  sample: SampleDiagnosis;
}

const DEMO_UPDATED_AT = "2026-05-29T22:00:00+08:00";

const AGENT_STAGE_IDS: AgentStageId[] = [
  "task_planning",
  "question_recognition",
  "knowledge_retrieval",
  "knowledge_mapping",
  "mistake_diagnosis",
  "memory_delta",
  "practice_generation",
  "review_planning",
  "response_building",
];

export function planTask(
  request: ParsedSampleDiagnoseRequest,
): AgentTaskPlan {
  return {
    task_type: request.task_type,
    sample_question_id: request.sample_question_id,
    stage_ids: [...AGENT_STAGE_IDS],
    expected_outputs: [
      "错因报告",
      "变式练习",
      "7 天复习计划",
      "长期画像更新建议",
    ],
    risk_notes: ["P0 样例题路径使用预标注数据，不调用图片识别或模型。"],
  };
}

export function recognizeQuestion(plan: AgentTaskPlan): RecognizedQuestion {
  const sample = getSampleDiagnosis(plan.sample_question_id);

  return {
    id: sample.id,
    title: sample.title,
    module: sample.module,
    question_text: sample.question_text,
    student_answer: sample.student_answer,
  };
}

export function retrieveKnowledgeContext(
  recognizedQuestion: RecognizedQuestion,
): KnowledgeContext {
  const sample = getSampleDiagnosis(recognizedQuestion.id);

  return {
    sample,
    knowledge_points: sample.knowledge_points.map(getKnowledgePoint),
    mistake_causes: sample.mistake_causes.map(getMistakeCause),
  };
}

export function mapKnowledgePoints(
  recognizedQuestion: RecognizedQuestion,
  knowledgeContext: KnowledgeContext,
): KnowledgeMapping {
  assertSameSample(recognizedQuestion.id, knowledgeContext.sample.id);

  return {
    knowledge_points: knowledgeContext.knowledge_points.map(
      (knowledgePoint) => knowledgePoint.id,
    ),
    difficulty: knowledgeContext.sample.difficulty,
  };
}

export function diagnoseMistake(
  recognizedQuestion: RecognizedQuestion,
  knowledgeMapping: KnowledgeMapping,
  knowledgeContext: KnowledgeContext,
): MistakeDiagnosis {
  assertSameSample(recognizedQuestion.id, knowledgeContext.sample.id);
  assertKnowledgeMapping(knowledgeMapping, knowledgeContext);

  return {
    mistake_causes: knowledgeContext.mistake_causes.map(
      (mistakeCause) => mistakeCause.id,
    ),
    severity: knowledgeContext.sample.severity,
    expected_diagnosis: knowledgeContext.sample.expected_diagnosis,
    step_analysis: knowledgeContext.sample.step_analysis,
    solution_highlights: knowledgeContext.sample.solution_highlights,
    standard_solution: knowledgeContext.sample.standard_solution,
  };
}

export function computeMemoryDelta(
  mistakeDiagnosis: MistakeDiagnosis,
  knowledgeContext: KnowledgeContext,
): MemoryDelta {
  assertMistakeCauses(mistakeDiagnosis, knowledgeContext);

  return knowledgeContext.sample.memory_delta;
}

export function generatePractice(
  mistakeDiagnosis: MistakeDiagnosis,
  knowledgeContext: KnowledgeContext,
): PracticeQuestion[] {
  assertMistakeCauses(mistakeDiagnosis, knowledgeContext);

  return knowledgeContext.sample.practice_questions;
}

export function planReview(
  memoryDelta: MemoryDelta,
  knowledgeContext: KnowledgeContext,
): ReviewPlan {
  if (
    memoryDelta.should_persist !== knowledgeContext.sample.memory_delta.should_persist
  ) {
    throw new Error("memory_delta 与样例题上下文不一致。");
  }

  return knowledgeContext.sample.review_plan;
}

export function buildDiagnoseResponse(
  input: BuildDiagnoseResponseInput,
): DiagnoseSuccessResponse {
  const baseProfile = isStudentProfile(input.request.student_profile)
    ? input.request.student_profile
    : demoStudentProfile;
  const updatedStudentProfile = applyMemoryDeltaToProfile(
    baseProfile,
    input.memoryDelta,
  );

  return {
    diagnosis_id: `diag_${input.sample.id}`,
    student_id: input.request.student_id,
    source: "sample",
    steps: input.sample.steps,
    recognized_question: input.recognizedQuestion,
    knowledge_mapping: input.knowledgeMapping,
    mistake_diagnosis: input.mistakeDiagnosis,
    memory_delta: input.memoryDelta,
    student_profile: updatedStudentProfile,
    practice_questions: input.practiceQuestions,
    review_plan: input.reviewPlan,
    sample_diagnosis: input.sample,
    fallback_used: false,
    warnings: [],
  };
}

export function runMathTraceAgent(
  request: ParsedSampleDiagnoseRequest,
): DiagnoseSuccessResponse {
  const plan = planTask(request);
  const recognizedQuestion = recognizeQuestion(plan);
  const knowledgeContext = retrieveKnowledgeContext(recognizedQuestion);
  const knowledgeMapping = mapKnowledgePoints(
    recognizedQuestion,
    knowledgeContext,
  );
  const mistakeDiagnosis = diagnoseMistake(
    recognizedQuestion,
    knowledgeMapping,
    knowledgeContext,
  );
  const memoryDelta = computeMemoryDelta(mistakeDiagnosis, knowledgeContext);
  const practiceQuestions = generatePractice(mistakeDiagnosis, knowledgeContext);
  const reviewPlan = planReview(memoryDelta, knowledgeContext);

  return buildDiagnoseResponse({
    request,
    recognizedQuestion,
    knowledgeMapping,
    mistakeDiagnosis,
    memoryDelta,
    practiceQuestions,
    reviewPlan,
    sample: knowledgeContext.sample,
  });
}

function getSampleDiagnosis(sampleQuestionId: SampleQuestionId): SampleDiagnosis {
  const sample = sampleDiagnoses.find((item) => item.id === sampleQuestionId);
  if (!sample) {
    throw new Error(`缺少样例题数据：${sampleQuestionId}`);
  }

  return sample;
}

function getKnowledgePoint(knowledgePointId: string): KnowledgePoint {
  const knowledgePoint = knowledgePoints[knowledgePointId];
  if (!knowledgePoint) {
    throw new Error(`缺少知识点定义：${knowledgePointId}`);
  }

  return knowledgePoint;
}

function getMistakeCause(mistakeCauseId: string): MistakeCause {
  const mistakeCause = mistakeCauses[mistakeCauseId];
  if (!mistakeCause) {
    throw new Error(`缺少错因标签定义：${mistakeCauseId}`);
  }

  return mistakeCause;
}

function assertSameSample(
  recognizedQuestionId: SampleQuestionId,
  sampleId: SampleQuestionId,
): void {
  if (recognizedQuestionId !== sampleId) {
    throw new Error("识别题目与知识上下文不一致。");
  }
}

function assertKnowledgeMapping(
  knowledgeMapping: KnowledgeMapping,
  knowledgeContext: KnowledgeContext,
): void {
  const contextKnowledgeIds = knowledgeContext.knowledge_points.map(
    (knowledgePoint) => knowledgePoint.id,
  );

  if (
    knowledgeMapping.difficulty !== knowledgeContext.sample.difficulty ||
    !hasSameItems(knowledgeMapping.knowledge_points, contextKnowledgeIds)
  ) {
    throw new Error("知识点映射与样例题上下文不一致。");
  }
}

function assertMistakeCauses(
  mistakeDiagnosis: MistakeDiagnosis,
  knowledgeContext: KnowledgeContext,
): void {
  const contextCauseIds = knowledgeContext.mistake_causes.map(
    (mistakeCause) => mistakeCause.id,
  );

  if (!hasSameItems(mistakeDiagnosis.mistake_causes, contextCauseIds)) {
    throw new Error("错因诊断与样例题上下文不一致。");
  }
}

function hasSameItems(firstItems: string[], secondItems: string[]): boolean {
  return (
    firstItems.length === secondItems.length &&
    firstItems.every((item, index) => item === secondItems[index])
  );
}

function isStudentProfile(value: unknown): value is StudentProfile {
  return (
    isRecord(value) &&
    typeof value.student_id === "string" &&
    value.subject === "math" &&
    isNumberRecord(value.mastery_scores) &&
    isNumberRecord(value.frequent_mistake_causes) &&
    Array.isArray(value.weak_modules) &&
    Array.isArray(value.review_priority) &&
    typeof value.recent_trend === "string" &&
    Array.isArray(value.gaokao_focus) &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

function applyMemoryDeltaToProfile(
  profile: StudentProfile,
  memoryDelta: MemoryDelta,
): StudentProfile {
  const masteryScores = { ...profile.mastery_scores };
  for (const [knowledgeId, change] of Object.entries(
    memoryDelta.knowledge_mastery_changes,
  )) {
    masteryScores[knowledgeId] = clampScore(
      (masteryScores[knowledgeId] ?? 70) + change,
    );
  }

  const frequentMistakeCauses = { ...profile.frequent_mistake_causes };
  for (const [causeId, change] of Object.entries(
    memoryDelta.mistake_cause_changes,
  )) {
    frequentMistakeCauses[causeId] = Math.max(
      0,
      (frequentMistakeCauses[causeId] ?? 0) + change,
    );
  }

  const reviewPriority = [
    ...memoryDelta.review_priority_changes,
    ...profile.review_priority,
  ].filter((knowledgeId, index, allKnowledgeIds) => {
    return allKnowledgeIds.indexOf(knowledgeId) === index;
  });

  return {
    ...profile,
    mastery_scores: masteryScores,
    frequent_mistake_causes: frequentMistakeCauses,
    review_priority: reviewPriority,
    updated_at: DEMO_UPDATED_AT,
  };
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === "number");
}
