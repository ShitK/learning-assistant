import assert from "node:assert/strict";

import {
  DEFAULT_TAXONOMY_ID,
  deriveMethodTagsFromTargetSkills,
  FEATURE_FLAG_DISPLAY_NAMES,
  getAllowedTagSets,
  getPracticeTagTaxonomy,
  METHOD_TAG_DISPLAY_NAMES,
  normalizeTargetSkillKeys,
  TARGET_SKILL_TO_METHOD_TAGS,
  TARGET_SKILL_DISPLAY_NAMES,
  validatePracticeTagTaxonomy,
} from "../../rag/practice-tag-taxonomy.mjs";

const taxonomy = getPracticeTagTaxonomy();
assert.equal(DEFAULT_TAXONOMY_ID, "math_derivative_v0");
assert.equal(taxonomy.taxonomy_id, "math_derivative_v0");
assert.equal(taxonomy.subject, "math");
assert.equal(taxonomy.unit, "derivative");
assert.equal(getPracticeTagTaxonomy("unknown_taxonomy"), null);

const tagSets = getAllowedTagSets(taxonomy);
assert.equal(tagSets.targetSkills.has("tangent_slope"), true);
assert.equal(tagSets.methodTags.has("derivative_definition"), true);
assert.equal(tagSets.featureFlags.has("needs_visual"), true);

const valid = validatePracticeTagTaxonomy(taxonomy);
assert.equal(valid.ok, true);

const invalid = validatePracticeTagTaxonomy({
  taxonomy_id: "bad",
  subject: "math",
  unit: "derivative",
  target_skills: [
    { key: "duplicated", display_name: "A" },
    { key: "duplicated", display_name: "B" },
  ],
  method_tags: [],
  feature_flags: [],
  target_skill_to_method_tags: { duplicated: ["missing_method"] },
});
assert.equal(invalid.ok, false);
assert.equal(invalid.errors.some((error) => error.includes("duplicate tag key")), true);
assert.equal(invalid.errors.some((error) => error.includes("unknown method tag")), true);

for (const invalidTags of [
  { target_skills: [null], method_tags: [], feature_flags: [] },
  { target_skills: [], method_tags: [null], feature_flags: [] },
  { target_skills: [], method_tags: [], feature_flags: [null] },
  { target_skills: [{ display_name: "x" }], method_tags: [], feature_flags: [] },
  { target_skills: [], method_tags: [{ display_name: "x" }], feature_flags: [] },
  { target_skills: [], method_tags: [], feature_flags: [{ display_name: "x" }] },
]) {
  assert.doesNotThrow(() => {
    const result = validatePracticeTagTaxonomy({
      taxonomy_id: "bad",
      subject: "math",
      unit: "derivative",
      display_name: "Bad taxonomy",
      target_skill_to_method_tags: {},
      ...invalidTags,
    });
    assert.equal(result.ok, false);
  });
}

assert.equal(TARGET_SKILL_DISPLAY_NAMES.tangent_slope, "切线斜率");
assert.equal(TARGET_SKILL_DISPLAY_NAMES.derivative_definition_limit, "极限式识别导数");
assert.equal(METHOD_TAG_DISPLAY_NAMES.derivative_definition, "导数定义式");
assert.equal(FEATURE_FLAG_DISPLAY_NAMES.has_square_root, "根号");

assert.deepEqual(
  normalizeTargetSkillKeys(["切线斜率", "tangent_slope", " 极限式识别导数 ", "未知技能", 123]),
  ["tangent_slope", "derivative_definition_limit"],
);

assert.deepEqual(
  deriveMethodTagsFromTargetSkills(["切线斜率", "极限式识别导数", "参数范围"]),
  ["tangent_slope", "derivative_definition", "parameter_classification"],
);

assert.deepEqual(normalizeTargetSkillKeys("切线斜率"), []);
assert.deepEqual(deriveMethodTagsFromTargetSkills(["未知技能"]), []);

for (const methodTags of Object.values(TARGET_SKILL_TO_METHOD_TAGS)) {
  for (const methodTag of methodTags) {
    assert.equal(
      typeof METHOD_TAG_DISPLAY_NAMES[methodTag],
      "string",
      `${methodTag} must have a display name`,
    );
  }
}

console.log("practice tag taxonomy tests passed");
