import { clampScore, isRecord } from "@/lib/shared/utils";
import type { MemoryDelta, StudentProfile } from "@/data/mathtrace-demo";

const DEMO_UPDATED_AT = "2026-05-29T22:00:00+08:00";

// 注意：此实现与 diagnose-api.ts 中的 isStudentProfile 不完全相同。
// diagnose-api.ts 额外校验 grade 字段，用于 API 请求入口的严格校验；
// 此处保留 mathtrace-agent-pipeline.ts 当前行为，不校验 grade，避免影响样本/图片诊断流程。
export function isStudentProfile(value: unknown): value is StudentProfile {
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

  return Object.values(value).every((item) => typeof item === "number");
}
