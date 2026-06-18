import type { StudentProfile } from "@/data/mathtrace-demo";
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";
import { clampScore } from "@/lib/shared/utils";
import {
  getKnowledgeName,
  getMistakeCauseDescription,
  getMistakeCauseTitle,
} from "@/components/workbench/workbench-labels";

export const HIGH_FREQUENCY_MISTAKE_CAUSE_THRESHOLD = 5;

export interface CreateProfileInsightsViewModelInput {
  diagnosis: DiagnosisViewModel;
  beforeProfile: StudentProfile;
  afterProfile: StudentProfile | null;
  mistakeHistoryLength: number;
}

export interface WeaknessStatusView {
  label: "高优先级" | "待巩固" | "基本稳定" | "稳定";
  tone: "high" | "medium" | "low" | "stable";
}

export interface KnowledgePriorityRow {
  id: string;
  name: string;
  previousMasteryScore: number;
  nextMasteryScore: number;
  previousWeaknessIndex: number;
  weaknessIndex: number;
  weaknessDelta: number;
  status: WeaknessStatusView;
  summary: string;
}

export interface MistakeCauseInsight {
  id: string;
  title: string;
  description: string;
  previousCount: number;
  nextCount: number;
  delta: number;
  isHighFrequency: boolean;
  isNewInDiagnosis: boolean;
}

export interface RecommendationView {
  title: string;
  bullets: string[];
}

export interface ProfileInsightsViewModel {
  title: string;
  description: string;
  shouldPersistProfile: boolean;
  notPersistedMessage: string | null;
  conclusionRows: KnowledgePriorityRow[];
  priorityRows: KnowledgePriorityRow[];
  actionAdvice: string;
  highlightedMistakeCauses: MistakeCauseInsight[];
  otherMistakeCauses: MistakeCauseInsight[];
  emptyCauseMessage: string | null;
  recommendation: RecommendationView;
}

export function calculateWeaknessIndex(masteryScore: number): number {
  return clampScore(100 - masteryScore);
}

export function getWeaknessStatus(weaknessIndex: number): WeaknessStatusView {
  if (weaknessIndex >= 61) {
    return { label: "高优先级", tone: "high" };
  }

  if (weaknessIndex >= 41) {
    return { label: "待巩固", tone: "medium" };
  }

  if (weaknessIndex >= 21) {
    return { label: "基本稳定", tone: "low" };
  }

  return { label: "稳定", tone: "stable" };
}

export function createProfileInsightsViewModel(
  input: CreateProfileInsightsViewModelInput,
): ProfileInsightsViewModel {
  const shouldPreviewDelta =
    input.diagnosis.should_persist_profile || input.afterProfile !== null;
  const changedKnowledgeIds = Object.keys(
    input.diagnosis.memory_delta.knowledge_mastery_changes,
  );
  const priorityRows = uniqueStrings([
    ...Object.keys(input.beforeProfile.mastery_scores),
    ...Object.keys(input.afterProfile?.mastery_scores ?? {}),
    ...changedKnowledgeIds,
  ])
    .map((id) =>
      createKnowledgePriorityRow({
        id,
        beforeProfile: input.beforeProfile,
        afterProfile: input.afterProfile,
        diagnosis: input.diagnosis,
        shouldPreviewDelta,
      }),
    )
    .sort(compareKnowledgePriorityRows);
  const conclusionRows = changedKnowledgeIds
    .map((id) => priorityRows.find((row) => row.id === id))
    .filter((row): row is KnowledgePriorityRow => row !== undefined)
    .sort(compareKnowledgePriorityRows);
  const actionTarget = conclusionRows[0] ?? priorityRows[0] ?? null;
  const mistakeCauses = createMistakeCauseInsights({
    beforeProfile: input.beforeProfile,
    afterProfile: input.afterProfile,
    diagnosis: input.diagnosis,
    shouldPreviewDelta,
  });
  const highlightedMistakeCauses = mistakeCauses.filter(
    (cause) => cause.isNewInDiagnosis || cause.isHighFrequency,
  );
  const otherMistakeCauses = mistakeCauses.filter(
    (cause) => !cause.isNewInDiagnosis && !cause.isHighFrequency,
  );

  return {
    title: "画像变化",
    description: `基于当前画像、本次诊断和 ${input.mistakeHistoryLength} 条 demo 历史错题，展示本次薄弱证据如何影响复习优先级。`,
    shouldPersistProfile: input.diagnosis.should_persist_profile,
    notPersistedMessage: input.diagnosis.should_persist_profile
      ? null
      : "本次仅展示诊断建议，未写入长期画像。",
    conclusionRows,
    priorityRows,
    actionAdvice: createActionAdvice(actionTarget, conclusionRows),
    highlightedMistakeCauses,
    otherMistakeCauses,
    emptyCauseMessage:
      highlightedMistakeCauses.length === 0
        ? "本次没有新增明确错因；先按知识点薄弱信号安排复习。"
        : null,
    recommendation: createRecommendation(actionTarget, highlightedMistakeCauses),
  };
}

function createKnowledgePriorityRow(input: {
  id: string;
  beforeProfile: StudentProfile;
  afterProfile: StudentProfile | null;
  diagnosis: DiagnosisViewModel;
  shouldPreviewDelta: boolean;
}): KnowledgePriorityRow {
  const previousMasteryScore = input.beforeProfile.mastery_scores[input.id] ?? 70;
  const delta =
    input.diagnosis.memory_delta.knowledge_mastery_changes[input.id] ?? 0;
  const nextMasteryScore =
    input.afterProfile?.mastery_scores[input.id] ??
    (input.shouldPreviewDelta
      ? clampScore(previousMasteryScore + delta)
      : previousMasteryScore);
  const previousWeaknessIndex = calculateWeaknessIndex(previousMasteryScore);
  const weaknessIndex = calculateWeaknessIndex(nextMasteryScore);
  const weaknessDelta = weaknessIndex - previousWeaknessIndex;
  const status = getWeaknessStatus(weaknessIndex);

  return {
    id: input.id,
    name: getKnowledgeName(input.id),
    previousMasteryScore,
    nextMasteryScore,
    previousWeaknessIndex,
    weaknessIndex,
    weaknessDelta,
    status,
    summary: createKnowledgeSummary(weaknessDelta, status),
  };
}

function createKnowledgeSummary(
  weaknessDelta: number,
  status: WeaknessStatusView,
): string {
  if (weaknessDelta > 0) {
    return "本次新增薄弱信号";
  }

  if (weaknessDelta < 0) {
    return "薄弱信号有所缓和";
  }

  return status.label === "稳定" ? "当前较稳定" : "保持关注";
}

function createMistakeCauseInsights(input: {
  beforeProfile: StudentProfile;
  afterProfile: StudentProfile | null;
  diagnosis: DiagnosisViewModel;
  shouldPreviewDelta: boolean;
}): MistakeCauseInsight[] {
  return uniqueStrings([
    ...Object.keys(input.beforeProfile.frequent_mistake_causes),
    ...Object.keys(input.afterProfile?.frequent_mistake_causes ?? {}),
    ...Object.keys(input.diagnosis.memory_delta.mistake_cause_changes),
  ])
    .map((id) => {
      const previousCount =
        input.beforeProfile.frequent_mistake_causes[id] ?? 0;
      const delta =
        input.diagnosis.memory_delta.mistake_cause_changes[id] ?? 0;
      const nextCount =
        input.afterProfile?.frequent_mistake_causes[id] ??
        (input.shouldPreviewDelta
          ? Math.max(0, previousCount + delta)
          : previousCount);

      return {
        id,
        title: getMistakeCauseTitle(id),
        description: getMistakeCauseDescription(id),
        previousCount,
        nextCount,
        delta: nextCount - previousCount,
        isHighFrequency: nextCount >= HIGH_FREQUENCY_MISTAKE_CAUSE_THRESHOLD,
        isNewInDiagnosis: nextCount - previousCount > 0,
      };
    })
    .sort(compareMistakeCauseInsights);
}

function createActionAdvice(
  actionTarget: KnowledgePriorityRow | null,
  conclusionRows: KnowledgePriorityRow[],
): string {
  if (!actionTarget) {
    return "本次没有新增可写入的薄弱点，先按当前错题报告完成订正。";
  }

  const secondaryTarget = conclusionRows.find(
    (row) => row.id !== actionTarget.id,
  );

  if (secondaryTarget) {
    return `优先复习${stripFrequency(actionTarget.name)}；${stripFrequency(
      secondaryTarget.name,
    )}保持常规练习即可。`;
  }

  return `优先复习${stripFrequency(actionTarget.name)}，先处理本次暴露的主要薄弱点。`;
}

function createRecommendation(
  actionTarget: KnowledgePriorityRow | null,
  highlightedMistakeCauses: MistakeCauseInsight[],
): RecommendationView {
  if (!actionTarget) {
    return {
      title: "推荐依据",
      bullets: ["本次没有新增可写入的画像变化，建议先完成当前错题订正。"],
    };
  }

  const bullets = [
    `当前薄弱指数 ${actionTarget.weaknessIndex}，状态为“${actionTarget.status.label}”。`,
  ];

  if (actionTarget.weaknessDelta > 0) {
    bullets.push(`本次诊断使薄弱指数上升 ${actionTarget.weaknessDelta}。`);
  } else {
    bullets.push("本次没有继续推高该知识点薄弱指数。");
  }

  const newCause = highlightedMistakeCauses.find(
    (cause) => cause.isNewInDiagnosis,
  );
  if (newCause) {
    bullets.push(
      `相关错因“${newCause.title}”本次新增，累计 ${newCause.nextCount} 次。`,
    );
  } else {
    bullets.push("当前建议来自画像快照和本次知识点变化。");
  }

  return {
    title: `为什么优先复习${stripFrequency(actionTarget.name)}？`,
    bullets,
  };
}

function compareKnowledgePriorityRows(
  left: KnowledgePriorityRow,
  right: KnowledgePriorityRow,
): number {
  return (
    right.weaknessIndex - left.weaknessIndex ||
    right.weaknessDelta - left.weaknessDelta ||
    left.name.localeCompare(right.name, "zh-Hans-CN")
  );
}

function compareMistakeCauseInsights(
  left: MistakeCauseInsight,
  right: MistakeCauseInsight,
): number {
  return (
    Number(right.isNewInDiagnosis) - Number(left.isNewInDiagnosis) ||
    Number(right.isHighFrequency) - Number(left.isHighFrequency) ||
    right.nextCount - left.nextCount ||
    left.title.localeCompare(right.title, "zh-Hans-CN")
  );
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, allValues) => {
    return value.length > 0 && allValues.indexOf(value) === index;
  });
}

function stripFrequency(name: string): string {
  return name.split(" · ")[0] ?? name;
}
