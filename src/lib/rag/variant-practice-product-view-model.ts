export type ProductVariantPracticeType =
  | "foundation"
  | "near_transfer"
  | "mixed_application"
  | "additional_practice";

export interface ProductVariantPractice {
  source: "rag_variant_practice";
  items: ProductVariantPracticeItem[];
  notice: string | null;
}

export interface ProductVariantPracticeItem {
  rank: number;
  type: ProductVariantPracticeType;
  title: string;
  question_text: string;
  reason: string;
}

const recommendationTypeLabels: Record<ProductVariantPracticeType, string> = {
  foundation: "巩固题",
  near_transfer: "近迁移题",
  mixed_application: "综合应用题",
  additional_practice: "补充练习题",
};

const demoFillNotice =
  "当前题库里暂时没有足够合适的综合练习，已为你补充一题相近练习。";

const productReasons: Record<ProductVariantPracticeType, string> = {
  foundation: "先练一道同类型基础题，巩固当前错因对应的解题路径。",
  near_transfer: "再练一道变式题，训练把同一思路迁移到新场景。",
  mixed_application: "最后做一道综合应用题，检验能否组合多个知识点。",
  additional_practice: "当前题库暂缺稳定综合应用题，已为你补充一题相近练习。",
};

const internalDebugFragments = [
  "matched_dimensions",
  "knowledge_point",
  "target_skill",
  "method_tag",
  "query_term",
  "source_candidate_id",
  "item_id",
  "demo_fill_used",
  "derivative_geometric_meaning",
  "tangent_slope",
  "命中目标技能标签",
];

export function createVariantPracticeProductViewModel(
  value: unknown,
  { expectedQueryId }: { expectedQueryId?: string } = {},
): ProductVariantPractice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const artifact = value as {
    agent_version?: unknown;
    query_id?: unknown;
    recommendations?: unknown;
    warnings?: unknown;
  };

  if (artifact.agent_version !== "variant-practice-agent-v0") {
    return null;
  }

  if (expectedQueryId && artifact.query_id !== expectedQueryId) {
    return null;
  }

  if (!Array.isArray(artifact.recommendations)) {
    return null;
  }

  const items = artifact.recommendations
    .map(toProductItem)
    .filter((item): item is ProductVariantPracticeItem => item !== null)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 3);

  if (items.length === 0) {
    return null;
  }

  const warnings = filterStringArray(artifact.warnings);

  return {
    source: "rag_variant_practice",
    items,
    notice: warnings.includes("demo_fill_used") ? demoFillNotice : null,
  };
}

function toProductItem(value: unknown): ProductVariantPracticeItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const item = value as {
    rank?: unknown;
    recommendation_type?: unknown;
    question_text?: unknown;
    reason?: unknown;
  };
  const rank = item.rank;
  const questionText = item.question_text;
  const reason = item.reason;
  const type = normalizeRecommendationType(item.recommendation_type);

  if (
    type === null ||
    typeof rank !== "number" ||
    !Number.isInteger(rank) ||
    typeof questionText !== "string" ||
    !questionText.trim() ||
    hasInternalDebugFragment(questionText) ||
    typeof reason !== "string" ||
    !reason.trim()
  ) {
    return null;
  }

  return {
    rank,
    type,
    title: recommendationTypeLabels[type],
    question_text: questionText.trim(),
    reason: productReasons[type],
  };
}

function normalizeRecommendationType(value: unknown): ProductVariantPracticeType | null {
  if (
    value === "foundation" ||
    value === "near_transfer" ||
    value === "mixed_application" ||
    value === "additional_practice"
  ) {
    return value;
  }
  return null;
}

function filterStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .map((item) => item.trim()),
        ),
      ]
    : [];
}

function hasInternalDebugFragment(text: string): boolean {
  return internalDebugFragments.some((fragment) => text.includes(fragment));
}
