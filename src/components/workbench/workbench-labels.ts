import {
  knowledgePoints,
  mistakeCauses,
} from "@/data/mathtrace-demo";
import type {
  KnowledgePoint,
  PracticeLevel,
  Severity,
} from "@/data/mathtrace-demo";

export const practiceLevelLabels: Record<PracticeLevel, string> = {
  basic: "基础巩固",
  transfer: "同类迁移",
  gaokao_style: "高考综合",
};

export const severityLabels: Record<Severity, string> = {
  minor: "轻微",
  medium: "中等",
  severe: "严重",
};

export const frequencyLabels: Record<KnowledgePoint["gaokao_frequency"], string> =
  {
    high: "高频",
    medium: "中频",
    low: "低频",
  };

export function getKnowledgeName(id: string): string {
  const knowledgePoint = knowledgePoints[id];

  if (!knowledgePoint) {
    return id;
  }

  const frequency = frequencyLabels[knowledgePoint.gaokao_frequency];
  return `${knowledgePoint.display_name} · ${frequency}`;
}

export function getMistakeShortName(id: string): string {
  return mistakeCauses[id]?.short_name ?? id;
}
