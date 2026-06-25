export const TARGET_SKILL_DISPLAY_NAMES = Object.freeze({
  derivative_geometric_meaning: "导数几何意义",
  tangent_slope: "切线斜率",
  derivative_definition_limit: "极限式识别导数",
  derivative_calculation: "求导运算",
  monotonicity: "单调性",
  extrema: "极值最值",
  zero_point: "零点",
  parameter_range: "参数范围",
});

export const METHOD_TAG_DISPLAY_NAMES = Object.freeze({
  derivative_definition: "导数定义式",
  tangent_slope: "切线斜率",
  quotient_rule: "商法则",
  logarithmic_derivative_formula: "对数函数求导",
  power_function_derivative: "幂函数求导",
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
  求导运算: "derivative_calculation",
  单调性: "monotonicity",
  极值最值: "extrema",
  零点: "zero_point",
  参数范围: "parameter_range",
});

export const TARGET_SKILL_TO_METHOD_TAGS = Object.freeze({
  derivative_geometric_meaning: ["derivative_definition", "tangent_slope"],
  tangent_slope: ["tangent_slope", "derivative_definition"],
  derivative_definition_limit: ["derivative_definition"],
  derivative_calculation: [
    "quotient_rule",
    "logarithmic_derivative_formula",
    "power_function_derivative",
  ],
  monotonicity: ["monotonicity_by_derivative"],
  extrema: ["extremum_by_derivative"],
  zero_point: ["zero_count"],
  parameter_range: ["parameter_classification"],
});

export const DEFAULT_TAXONOMY_ID = "math_derivative_v0";

const MATH_DERIVATIVE_TAXONOMY = Object.freeze({
  taxonomy_id: DEFAULT_TAXONOMY_ID,
  subject: "math",
  unit: "derivative",
  display_name: "数学 / 导数",
  target_skills: Object.freeze(
    Object.entries(TARGET_SKILL_DISPLAY_NAMES).map(([key, display_name]) => ({ key, display_name })),
  ),
  method_tags: Object.freeze(
    Object.entries(METHOD_TAG_DISPLAY_NAMES).map(([key, display_name]) => ({ key, display_name })),
  ),
  feature_flags: Object.freeze(
    Object.entries(FEATURE_FLAG_DISPLAY_NAMES).map(([key, display_name]) => ({ key, display_name })),
  ),
  target_skill_to_method_tags: TARGET_SKILL_TO_METHOD_TAGS,
});

const TAXONOMY_REGISTRY = Object.freeze({
  [DEFAULT_TAXONOMY_ID]: MATH_DERIVATIVE_TAXONOMY,
});

export function getPracticeTagTaxonomy(taxonomyId = DEFAULT_TAXONOMY_ID) {
  return TAXONOMY_REGISTRY[taxonomyId] ?? null;
}

export function getAllowedTagSets(taxonomy) {
  return {
    targetSkills: new Set((taxonomy?.target_skills ?? []).map((tag) => tag.key)),
    methodTags: new Set((taxonomy?.method_tags ?? []).map((tag) => tag.key)),
    featureFlags: new Set((taxonomy?.feature_flags ?? []).map((tag) => tag.key)),
  };
}

export function validatePracticeTagTaxonomy(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["taxonomy must be an object"] };
  }

  for (const key of ["taxonomy_id", "subject", "unit", "display_name"]) {
    if (typeof value[key] !== "string" || !value[key].trim()) {
      errors.push(`${key} must be a non-empty string`);
    }
  }

  validateTagDefinitions(value.target_skills, "target_skills", errors);
  validateTagDefinitions(value.method_tags, "method_tags", errors);
  validateTagDefinitions(value.feature_flags, "feature_flags", errors);

  const targetSkillKeys = getValidTagDefinitionKeys(value.target_skills);
  const methodKeys = getValidTagDefinitionKeys(value.method_tags);

  if (
    !value.target_skill_to_method_tags ||
    typeof value.target_skill_to_method_tags !== "object" ||
    Array.isArray(value.target_skill_to_method_tags)
  ) {
    errors.push("target_skill_to_method_tags must be an object");
  } else {
    for (const [skill, methodTagsForSkill] of Object.entries(value.target_skill_to_method_tags)) {
      if (!targetSkillKeys.has(skill)) {
        errors.push(`target_skill_to_method_tags contains unknown target skill: ${skill}`);
      }
      if (!Array.isArray(methodTagsForSkill)) {
        errors.push(`target_skill_to_method_tags.${skill} must be an array`);
        continue;
      }
      for (const methodTag of methodTagsForSkill) {
        if (!methodKeys.has(methodTag)) {
          errors.push(`target_skill_to_method_tags.${skill} contains unknown method tag: ${methodTag}`);
        }
      }
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, taxonomy: value };
}

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

function validateTagDefinitions(tags, path, errors) {
  if (!Array.isArray(tags)) {
    errors.push(`${path} must be an array`);
    return;
  }
  const seen = new Set();
  for (const tag of tags) {
    if (typeof tag?.key !== "string" || !tag.key.trim()) {
      errors.push(`${path} tag key must be a non-empty string`);
      continue;
    }
    if (seen.has(tag.key)) {
      errors.push(`duplicate tag key in ${path}: ${tag.key}`);
    }
    seen.add(tag.key);
    if (typeof tag.display_name !== "string" || !tag.display_name.trim()) {
      errors.push(`${path}.${tag.key}.display_name must be a non-empty string`);
    }
  }
}

function getValidTagDefinitionKeys(tags) {
  const keys = new Set();
  if (!Array.isArray(tags)) {
    return keys;
  }
  for (const tag of tags) {
    if (typeof tag?.key === "string" && tag.key.trim()) {
      keys.add(tag.key);
    }
  }
  return keys;
}
