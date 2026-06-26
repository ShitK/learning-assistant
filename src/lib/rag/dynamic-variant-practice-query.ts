import type {
  EvidenceLevel,
  PersistenceEvidence,
  ProfileUpdateKind,
} from "@/lib/shared/diagnosis-evidence";
import { isRecord } from "@/lib/shared/utils";

export interface DynamicVariantPracticeRequest {
  student_id: "demo_student_001";
  request_source: "confirmed_image_diagnosis";
  evidence_level: EvidenceLevel | null;
  persistence_evidence: PersistenceEvidence | null;
  profile_update_kind: ProfileUpdateKind;
  question_text: string;
  knowledge_points: string[];
  mistake_causes: string[];
}

export interface DynamicPracticeQuery {
  id: "dynamic-confirmed-image-diagnosis";
  question_text: string;
  knowledge_points: ["derivative"];
  section_title: string | null;
  mistake_causes: string[];
  target_skills: string[];
}

export type DynamicVariantPracticeParseResult =
  | { ok: true; value: DynamicVariantPracticeRequest }
  | { ok: false; message: string };

const maxQuestionTextLength = 800;
const derivativeKnowledgePointKeys = new Set([
  "derivative_monotonicity",
  "parameter_classification",
]);

const sectionTitles = {
  geometric: "考点 1 导数的概念、几何意义与运算",
  monotonicity: "考点 2 导数与函数的单调性",
  extrema: "考点 3 导数与函数的极值",
  parameter: "专项突破 2 利用导数研究恒(能)成立问题",
  zeroPoint: "专项突破 4 利用导数研究函数的零点问题",
} as const;

export function parseDynamicVariantPracticeRequest(
  value: unknown,
): DynamicVariantPracticeParseResult {
  if (!isRecord(value)) {
    return { ok: false, message: "请求体必须是 JSON 对象。" };
  }

  if (value.student_id !== "demo_student_001") {
    return { ok: false, message: "当前阶段只支持 demo_student_001。" };
  }

  if (value.request_source !== "confirmed_image_diagnosis") {
    return { ok: false, message: "request_source 只能是 confirmed_image_diagnosis。" };
  }

  if (!isEvidenceLevelOrNull(value.evidence_level)) {
    return { ok: false, message: "evidence_level 不合法。" };
  }

  if (!isPersistenceEvidenceOrNull(value.persistence_evidence)) {
    return { ok: false, message: "persistence_evidence 不合法。" };
  }

  if (!isProfileUpdateKind(value.profile_update_kind)) {
    return { ok: false, message: "profile_update_kind 不合法。" };
  }

  if (typeof value.question_text !== "string" || !value.question_text.trim()) {
    return { ok: false, message: "question_text 不能为空。" };
  }

  if (!isStringArray(value.knowledge_points)) {
    return { ok: false, message: "knowledge_points 必须是字符串数组。" };
  }

  if (!isStringArray(value.mistake_causes)) {
    return { ok: false, message: "mistake_causes 必须是字符串数组。" };
  }

  return {
    ok: true,
    value: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: value.evidence_level,
      persistence_evidence: value.persistence_evidence,
      profile_update_kind: value.profile_update_kind,
      question_text: truncateQuestionText(value.question_text.trim()),
      knowledge_points: normalizeStringArray(value.knowledge_points),
      mistake_causes: normalizeStringArray(value.mistake_causes),
    },
  };
}

export function deriveDynamicVariantPracticeQuery(
  request: DynamicVariantPracticeRequest,
): DynamicPracticeQuery | null {
  if (!canTriggerDynamicVariantPractice(request)) {
    return null;
  }

  const derivativeKnowledgePoints = request.knowledge_points.filter((point) =>
    derivativeKnowledgePointKeys.has(point),
  );
  if (derivativeKnowledgePoints.length === 0) {
    return null;
  }

  const targetSkills: string[] = [];
  let sectionTitle: string | null = null;

  if (derivativeKnowledgePoints.includes("derivative_monotonicity")) {
    addUnique(targetSkills, "monotonicity");
    sectionTitle = sectionTitles.monotonicity;
  }

  if (derivativeKnowledgePoints.includes("parameter_classification")) {
    addUnique(targetSkills, "parameter_range");
    sectionTitle ??= sectionTitles.parameter;
  }

  if (request.mistake_causes.includes("classification_missing")) {
    addUnique(targetSkills, "parameter_range");
  }

  const questionText = request.question_text;
  if (hasAny(questionText, ["切线", "斜率", "几何意义"])) {
    addUnique(targetSkills, "tangent_slope");
    addUnique(targetSkills, "derivative_geometric_meaning");
    sectionTitle ??= sectionTitles.geometric;
  }

  if (hasAny(questionText, ["极值", "最值", "最大值", "最小值"])) {
    addUnique(targetSkills, "extrema");
    sectionTitle ??= sectionTitles.extrema;
  }

  if (questionText.includes("零点")) {
    addUnique(targetSkills, "zero_point");
    sectionTitle ??= sectionTitles.zeroPoint;
  }

  if (targetSkills.length === 0) {
    return null;
  }

  return {
    id: "dynamic-confirmed-image-diagnosis",
    question_text: truncateQuestionText(request.question_text.trim()),
    knowledge_points: ["derivative"],
    section_title: sectionTitle,
    mistake_causes: normalizeStringArray(request.mistake_causes),
    target_skills: targetSkills,
  };
}

function canTriggerDynamicVariantPractice(
  request: DynamicVariantPracticeRequest,
): boolean {
  if (
    request.evidence_level === "student_work_sufficient" &&
    request.persistence_evidence === "student_work"
  ) {
    return true;
  }

  return (
    request.evidence_level === "problem_only" &&
    request.persistence_evidence === "user_confirmed"
  );
}

function truncateQuestionText(text: string): string {
  return Array.from(text).slice(0, maxQuestionTextLength).join("");
}

function normalizeStringArray(value: string[]): string[] {
  return [
    ...new Set(value.map((item) => item.trim()).filter((item) => item.length > 0)),
  ];
}

function addUnique(items: string[], item: string): void {
  if (!items.includes(item)) {
    items.push(item);
  }
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEvidenceLevelOrNull(value: unknown): value is EvidenceLevel | null {
  return (
    value === null ||
    value === "student_work_sufficient" ||
    value === "problem_only" ||
    value === "insufficient"
  );
}

function isPersistenceEvidenceOrNull(
  value: unknown,
): value is PersistenceEvidence | null {
  return (
    value === null ||
    value === "student_work" ||
    value === "uploaded_problem_only" ||
    value === "user_confirmed" ||
    value === "none"
  );
}

function isProfileUpdateKind(value: unknown): value is ProfileUpdateKind {
  return (
    value === "mistake_cause" ||
    value === "problem_type_focus" ||
    value === "none"
  );
}
