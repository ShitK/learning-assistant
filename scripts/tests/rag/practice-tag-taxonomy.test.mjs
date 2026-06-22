import assert from "node:assert/strict";

import {
  deriveMethodTagsFromTargetSkills,
  FEATURE_FLAG_DISPLAY_NAMES,
  METHOD_TAG_DISPLAY_NAMES,
  normalizeTargetSkillKeys,
  TARGET_SKILL_TO_METHOD_TAGS,
  TARGET_SKILL_DISPLAY_NAMES,
} from "../../rag/practice-tag-taxonomy.mjs";

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
