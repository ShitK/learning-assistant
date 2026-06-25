import {
  knowledgePoints,
  mistakeCauses,
} from "@/data/mathtrace-demo";
import type {
  KnowledgePoint,
  PracticeLevel,
  Severity,
} from "@/data/mathtrace-demo";
import type { ProductVariantPracticeType } from "@/lib/rag/variant-practice-product-view-model";

export const practiceLevelLabels: Record<PracticeLevel, string> = {
  basic: "基础巩固",
  transfer: "同类迁移",
  gaokao_style: "高考综合",
};

export const variantPracticeTypeLabels: Record<ProductVariantPracticeType, string> = {
  foundation: "巩固题",
  near_transfer: "近迁移题",
  mixed_application: "综合应用题",
  additional_practice: "补充练习题",
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

const mistakeCauseDisplayDetails: Record<
  string,
  { title: string; description: string }
> = {
  domain_missing: {
    title: "范围/边界遗漏",
    description:
      "定义域、取值范围或分类讨论边界考虑不全，导致答案缺情况或范围错误。",
  },
  classification_missing: {
    title: "分类讨论漏项",
    description: "含参、分段或多情况题没有完整分类，导致结论缺少必要情况。",
  },
  method_error: {
    title: "解题方向选错",
    description: "审题后选择了错误的解题方法或公式，导致整题方向偏离。",
  },
  transformation_error: {
    title: "变形过程失真",
    description: "等价变形、代数整理或结构转换时丢失条件或改变原式含义。",
  },
  calculation_error: {
    title: "计算失误",
    description: "运算过程中出现符号、数值或代数计算错误。",
  },
};

export function getMistakeCauseTitle(id: string): string {
  return (
    mistakeCauseDisplayDetails[id]?.title ?? mistakeCauses[id]?.display_name ?? id
  );
}

export function getMistakeCauseDescription(id: string): string {
  return (
    mistakeCauseDisplayDetails[id]?.description ??
    mistakeCauses[id]?.display_name ??
    id
  );
}
