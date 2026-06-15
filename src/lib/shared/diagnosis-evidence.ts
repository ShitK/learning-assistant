import type { FollowUpAnswerParseResult } from "@/lib/shared/confirmation-types";
import type { VisionExtractionDraft } from "@/lib/vision-extraction/vision-extraction-types";

export type {
  ConfirmationAction,
  FollowUpAnswerDraft,
  FollowUpAnswerParseResult,
} from "@/lib/shared/confirmation-types";

export type EvidenceLevel =
  | "student_work_sufficient"
  | "problem_only"
  | "insufficient";

export type PersistenceEvidence =
  | "student_work"
  | "user_confirmed"
  | "uploaded_problem_only"
  | "none";

export type ProfileUpdateKind =
  | "mistake_cause"
  | "problem_type_focus"
  | "none";

export interface EvidenceAssessment {
  evidence_level: EvidenceLevel;
  persistence_evidence: PersistenceEvidence;
  profile_update_kind: ProfileUpdateKind;
  should_prompt_for_stuck_point: boolean;
  can_write_mistake_cause: boolean;
  rationale: string;
}

export interface ProblemRiskFollowUp {
  problem_type: string;
  knowledge_points: string[];
  common_stuck_points: Array<{
    id: string;
    label: string;
    related_mistake_cause: string;
  }>;
  standard_solution_summary: string;
  prompt: string;
}

export function assessExtractionEvidence(
  extraction: VisionExtractionDraft,
): EvidenceAssessment {
  const hasQuestion = extraction.question_text.trim().length > 0;
  const hasStudentAnswer =
    extraction.student_answer.trim().length > 0 &&
    !isUnrecognizedStudentAnswer(extraction.student_answer);
  const hasStudentSteps = extraction.student_solution_steps.some(
    (step) => step.trim().length > 0,
  );

  if (
    hasQuestion &&
    hasStudentAnswer &&
    hasStudentSteps &&
    extraction.extraction_confidence !== "low"
  ) {
    return {
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
      should_prompt_for_stuck_point: false,
      can_write_mistake_cause: true,
      rationale: "识别到了学生答案和解题步骤，可以基于学生作答诊断具体错因。",
    };
  }

  if (hasQuestion) {
    return {
      evidence_level: "problem_only",
      persistence_evidence: "uploaded_problem_only",
      profile_update_kind: "problem_type_focus",
      should_prompt_for_stuck_point: true,
      can_write_mistake_cause: false,
      rationale: "只识别到题目风险，暂不能判断学生真实错因。",
    };
  }

  return {
    evidence_level: "insufficient",
    persistence_evidence: "none",
    profile_update_kind: "none",
    should_prompt_for_stuck_point: false,
    can_write_mistake_cause: false,
    rationale: "题干信息不足，不能生成可信诊断。",
  };
}

export function createProblemRiskFollowUp(input: {
  extraction: VisionExtractionDraft;
  knowledge_points: string[];
  mistake_causes: string[];
}): ProblemRiskFollowUp {
  const commonStuckPoints = input.mistake_causes.slice(0, 4).map((causeId) => {
    return {
      id: causeId,
      label: causeId,
      related_mistake_cause: causeId,
    };
  });

  return {
    problem_type: inferProblemType(input.extraction.question_text),
    knowledge_points: input.knowledge_points,
    common_stuck_points: commonStuckPoints,
    standard_solution_summary: summarizeStandardSolution(
      input.extraction.standard_solution_draft,
    ),
    prompt: "你主要卡在哪里？",
  };
}

export function parseFollowUpAnswer(
  value: unknown,
): FollowUpAnswerParseResult {
  if (value === null || value === undefined) {
    return {
      ok: true,
      value: { selected_stuck_point_id: null, custom_text: null },
    };
  }

  if (!isRecord(value)) {
    return { ok: false, message: "follow_up_answer 必须是对象。" };
  }

  const selected =
    typeof value.selected_stuck_point_id === "string" &&
    value.selected_stuck_point_id.trim().length > 0
      ? value.selected_stuck_point_id.trim()
      : null;
  const custom =
    typeof value.custom_text === "string" &&
    value.custom_text.trim().length > 0
      ? value.custom_text.trim().slice(0, 80)
      : null;

  return {
    ok: true,
    value: {
      selected_stuck_point_id: selected,
      custom_text: custom,
    },
  };
}

function isUnrecognizedStudentAnswer(value: string): boolean {
  return /(未识别到|未找到|无法识别|没有识别到|没有检测到).*学生.*(答案|作答)/.test(
    value,
  );
}

function inferProblemType(questionText: string): string {
  if (/函数|导数|单调/.test(questionText)) {
    return "函数与导数问题";
  }

  if (/参数/.test(questionText)) {
    return "参数讨论问题";
  }

  return "数学综合题";
}

function summarizeStandardSolution(standardSolutionDraft: string): string {
  const trimmed = standardSolutionDraft.trim();

  if (trimmed.length === 0) {
    return "标准解法将在确认后由分析模型生成。";
  }

  if (trimmed.length <= 80) {
    return trimmed;
  }

  return `${trimmed.slice(0, 80)}...`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
