import type {
  AgentStep,
  MemoryDelta,
  PracticeQuestion,
  ReviewPlan,
  SampleDiagnosis,
  Severity,
} from "@/data/mathtrace-demo";
import type { DiagnoseImageSuccessResponse } from "@/lib/diagnose-api";

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
  warnings: string[];
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
    standard_solution: response.mistake_diagnosis.standard_solution,
    memory_delta: response.memory_delta,
    practice_questions: response.practice_questions,
    review_plan: response.review_plan,
    steps: response.steps,
    should_persist_profile: response.memory_delta.should_persist,
    warnings: response.warnings,
  };
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
