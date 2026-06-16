import { clampScore, isRecord } from "@/lib/shared/utils";
import type { MemoryDelta, StudentProfile } from "@/data/mathtrace-demo";

export type { StudentProfile } from "@/data/mathtrace-demo";

const DEMO_UPDATED_AT = "2026-05-29T22:00:00+08:00";

export function isStudentProfile(value: unknown): value is StudentProfile {
  return (
    isRecord(value) &&
    typeof value.student_id === "string" &&
    typeof value.grade === "string" &&
    value.subject === "math" &&
    isNumberRecord(value.mastery_scores) &&
    isNumberRecord(value.frequent_mistake_causes) &&
    isStringArray(value.weak_modules) &&
    isStringArray(value.review_priority) &&
    typeof value.recent_trend === "string" &&
    isGaokaoFocus(value.gaokao_focus) &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

export function applyMemoryDeltaToProfile(
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

  return Object.values(value).every(
    (item) => typeof item === "number" && Number.isFinite(item),
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isGaokaoFocus(value: unknown): value is StudentProfile["gaokao_focus"] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.knowledge_point === "string" &&
        typeof item.reason === "string" &&
        typeof item.priority === "number" &&
        Number.isFinite(item.priority),
    )
  );
}
