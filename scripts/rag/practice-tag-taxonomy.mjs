export const TARGET_SKILL_DISPLAY_NAMES = Object.freeze({
  derivative_geometric_meaning: "导数几何意义",
  tangent_slope: "切线斜率",
  derivative_definition_limit: "极限式识别导数",
  monotonicity: "单调性",
  extrema: "极值最值",
  zero_point: "零点",
  parameter_range: "参数范围",
});

export const METHOD_TAG_DISPLAY_NAMES = Object.freeze({
  derivative_definition: "导数定义式",
  tangent_slope: "切线斜率",
  monotonicity_by_derivative: "导数判断单调性",
  extremum_by_derivative: "导数判断极值最值",
  zero_count: "零点个数",
  parameter_classification: "参数分类讨论",
  inequality_with_derivative: "导数处理不等式",
});

export const FEATURE_FLAG_DISPLAY_NAMES = Object.freeze({
  has_parameter: "含参数",
  has_graph: "涉及图像",
  has_choice_options: "选择题",
  has_fill_blank: "填空题",
  has_ln_exp: "含对数或指数",
  has_square_root: "根号",
  needs_visual: "依赖原图",
});

const TARGET_SKILL_ALIASES = Object.freeze({
  导数几何意义: "derivative_geometric_meaning",
  切线斜率: "tangent_slope",
  极限式识别导数: "derivative_definition_limit",
  单调性: "monotonicity",
  极值最值: "extrema",
  零点: "zero_point",
  参数范围: "parameter_range",
});

export const TARGET_SKILL_TO_METHOD_TAGS = Object.freeze({
  derivative_geometric_meaning: ["derivative_definition", "tangent_slope"],
  tangent_slope: ["tangent_slope", "derivative_definition"],
  derivative_definition_limit: ["derivative_definition"],
  monotonicity: ["monotonicity_by_derivative"],
  extrema: ["extremum_by_derivative"],
  zero_point: ["zero_count"],
  parameter_range: ["parameter_classification"],
});

export function normalizeTargetSkillKeys(skills) {
  if (!Array.isArray(skills)) {
    return [];
  }
  const knownKeys = new Set(Object.keys(TARGET_SKILL_DISPLAY_NAMES));
  const normalized = [];
  for (const value of skills) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    const key = knownKeys.has(trimmed) ? trimmed : TARGET_SKILL_ALIASES[trimmed];
    if (key && !normalized.includes(key)) {
      normalized.push(key);
    }
  }
  return normalized;
}

export function deriveMethodTagsFromTargetSkills(targetSkills) {
  const methodTags = [];
  for (const skillKey of normalizeTargetSkillKeys(targetSkills)) {
    for (const methodTag of TARGET_SKILL_TO_METHOD_TAGS[skillKey] ?? []) {
      if (!methodTags.includes(methodTag)) {
        methodTags.push(methodTag);
      }
    }
  }
  return methodTags;
}
