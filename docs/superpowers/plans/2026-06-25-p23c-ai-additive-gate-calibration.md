# P2.3c AI Additive Gate Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow high-confidence AI proposals with valid evidence to supplement `method_tags` and non-visual `feature_flags` without forcing otherwise safe items into the tag review queue.

**Architecture:** Keep `target_skills` conservative because they define the practice goal, but treat `method_tags` and objective `feature_flags` as additive metadata when AI output is high-confidence, taxonomy-valid, and evidence-backed. The merge gate remains the only place that decides auto approval; AI still cannot write final tags directly, bypass taxonomy, or auto-approve visual dependency risks.

**Tech Stack:** Node.js ESM scripts, existing local JSON artifacts under `artifacts/rag/**`, existing RAG merge-gate tests, no new npm dependencies.

## Global Constraints

- Do not commit `.env*`, `artifacts/**`, `docs/reviews/*.md`, or `.superpowers/sdd/**`.
- Do not call the real AI provider from tests.
- Do not let AI create taxonomy keys at runtime.
- Preserve `sample_diagnosis` and all main app routes.
- Keep RAG as the variant-practice retrieval/source layer; do not write `memory_events`, `student_profiles`, or evidence API data.
- `needs_visual` remains conservative: if rule or AI marks `needs_visual`, the item must remain in the review queue.
- `target_skill_conflict`, `missing_ai_target_skill`, `too_many_target_skills`, low AI confidence, invalid AI JSON/schema/confidence/tag warnings, and missing AI evidence remain review-queue reasons.
- This task changes only the merge/gate calibration and related docs/tests; it does not change taxonomy, provider prompts, review UI layout, database schema, or frontend product routes.

---

## Current Problem

The current `tag-proposal-merge-core.mjs` gate blocks items when AI adds a reasonable `method_tag` or `feature_flag` that the rule system missed.

Example from the local tag review page:

```text
Rule tags:
  target_skills: tangent_slope
  method_tags: tangent_slope, derivative_definition
  feature_flags: has_choice_options, has_ln_exp

AI tags:
  target_skills: tangent_slope, derivative_geometric_meaning
  method_tags: tangent_slope, logarithmic_derivative_formula
  feature_flags: has_choice_options, has_ln_exp, has_parameter

Gate reasons:
  method_tag_conflict
  feature_flag_conflict
```

The AI additions are reasonable here: the stem includes `ln x` and parameter `a`. These should not require manual review when the AI proposal is high-confidence and evidence-backed.

## Desired Behavior

Auto approval should allow AI additive metadata:

```js
{
  reviewed_tags: {
    target_skills: ["tangent_slope", "derivative_geometric_meaning"],
    method_tags: ["tangent_slope", "derivative_definition", "logarithmic_derivative_formula"],
    feature_flags: ["has_choice_options", "has_ln_exp", "has_parameter"],
  },
  review_notes: "high_confidence_rule_ai_agreement, ai_added_method_tags, ai_added_feature_flags"
}
```

But the gate must still reject:

- target skill complete conflict, for example rule says `monotonicity`, AI says `parameter_range`;
- missing AI target skill;
- more than 3 AI target skills;
- `needs_visual` from rule or AI;
- hard invalid AI warnings;
- any AI tag without effective evidence;
- AI confidence other than `high`.

---

### Task 1: Add Failing Merge-Gate Tests for AI Additive Tags

**Files:**
- Modify: `scripts/tests/rag/tag-proposal-merge-core.test.mjs`

**Interfaces:**
- Consumes: `buildMergedTagProposals`, `chooseFinalTags`, existing `tags()` test helper.
- Produces: failing tests that define the P2.3c gate behavior before implementation.

- [ ] **Step 1: Add a positive auto-approval case for AI-added method and feature tags**

Insert this block after the existing `evidenceWarningOnly` test and before the existing `derivativeCalculation` test:

```js
{
  const aiAddsMethodAndFeature = buildOne({
    itemId: "ai-adds-method-and-feature",
    ruleTags: tags({
      target_skills: ["tangent_slope"],
      method_tags: ["tangent_slope", "derivative_definition"],
      feature_flags: ["has_choice_options", "has_ln_exp"],
    }),
    aiTags: tags(
      {
        target_skills: ["tangent_slope", "derivative_geometric_meaning"],
        method_tags: ["tangent_slope", "logarithmic_derivative_formula"],
        feature_flags: ["has_choice_options", "has_ln_exp", "has_parameter"],
      },
      "llm",
    ),
  });

  assert.equal(aiAddsMethodAndFeature.auto_review_records.length, 1);
  assert.equal(aiAddsMethodAndFeature.review_queue.length, 0);
  assert.deepEqual(
    aiAddsMethodAndFeature.auto_review_records[0].reviewed_tags.target_skills,
    ["tangent_slope", "derivative_geometric_meaning"],
  );
  assert.deepEqual(
    aiAddsMethodAndFeature.auto_review_records[0].reviewed_tags.method_tags,
    ["tangent_slope", "derivative_definition", "logarithmic_derivative_formula"],
  );
  assert.deepEqual(
    aiAddsMethodAndFeature.auto_review_records[0].reviewed_tags.feature_flags,
    ["has_choice_options", "has_ln_exp", "has_parameter"],
  );
  assert.equal(
    aiAddsMethodAndFeature.auto_review_records[0].review_notes.includes("ai_added_method_tags"),
    true,
  );
  assert.equal(
    aiAddsMethodAndFeature.auto_review_records[0].review_notes.includes("ai_added_feature_flags"),
    true,
  );
}
```

- [ ] **Step 2: Replace the old method conflict expectation with a missing-evidence expectation**

Replace the existing `methodConflict` block:

```js
{
  const methodConflict = buildOne({
    itemId: "method-conflict",
    ruleTags: tags({ target_skills: ["tangent_slope"], method_tags: ["tangent_slope"] }),
    aiTags: tags({ target_skills: ["tangent_slope"], method_tags: ["zero_count"] }, "llm"),
  });

  assert.equal(methodConflict.review_queue.length, 1);
  assert.equal(methodConflict.review_queue[0].gate_reasons.includes("method_tag_conflict"), true);
}
```

with:

```js
{
  const aiMethodWithoutEvidence = buildOne({
    itemId: "ai-method-without-evidence",
    ruleTags: tags({ target_skills: ["tangent_slope"], method_tags: ["tangent_slope"] }),
    aiTags: {
      target_skills: tags({ target_skills: ["tangent_slope"] }, "llm").target_skills,
      method_tags: [
        {
          tag: "zero_count",
          display_name: "zero_count",
          confidence: "high",
          evidence_terms: [],
          source: "llm",
        },
      ],
      feature_flags: [],
    },
  });

  assert.equal(aiMethodWithoutEvidence.auto_review_records.length, 0);
  assert.equal(aiMethodWithoutEvidence.review_queue.length, 1);
  assert.equal(aiMethodWithoutEvidence.review_queue[0].gate_reasons.includes("missing_ai_evidence"), true);
}
```

- [ ] **Step 3: Replace the old feature conflict expectation with a visual-risk expectation**

Replace the existing `featureConflict` block:

```js
{
  const featureConflict = buildOne({
    itemId: "feature-conflict",
    ruleTags: tags({ target_skills: ["tangent_slope"], feature_flags: ["has_choice_options"] }),
    aiTags: tags({ target_skills: ["tangent_slope"], feature_flags: ["has_fill_blank"] }, "llm"),
  });

  assert.equal(featureConflict.review_queue.length, 1);
  assert.equal(featureConflict.review_queue[0].gate_reasons.includes("feature_flag_conflict"), true);
}
```

with:

```js
{
  const aiAddsFeatureFlags = buildOne({
    itemId: "ai-adds-feature-flags",
    ruleTags: tags({ target_skills: ["tangent_slope"], feature_flags: ["has_choice_options"] }),
    aiTags: tags(
      {
        target_skills: ["tangent_slope"],
        feature_flags: ["has_choice_options", "has_fill_blank", "has_parameter"],
      },
      "llm",
    ),
  });

  assert.equal(aiAddsFeatureFlags.auto_review_records.length, 1);
  assert.equal(aiAddsFeatureFlags.review_queue.length, 0);
  assert.deepEqual(
    aiAddsFeatureFlags.auto_review_records[0].reviewed_tags.feature_flags,
    ["has_choice_options", "has_fill_blank", "has_parameter"],
  );
}
```

- [ ] **Step 4: Run the merge-gate test to verify it fails for the intended reason**

Run:

```bash
node scripts/tests/rag/tag-proposal-merge-core.test.mjs
```

Expected: FAIL because the current gate still emits `method_tag_conflict` or `feature_flag_conflict`, and because `chooseFinalTags` currently keeps only intersected feature flags.

---

### Task 2: Implement AI Additive Merge/Gate Behavior

**Files:**
- Modify: `scripts/rag/tag-proposal-merge-core.mjs`
- Test: `scripts/tests/rag/tag-proposal-merge-core.test.mjs`

**Interfaces:**
- Consumes: normalized rule and AI tag groups in `getGateDecision()` and `chooseFinalTags()`.
- Produces: automatic acceptance of high-confidence, evidence-backed AI additions for `method_tags` and non-visual `feature_flags`.

- [ ] **Step 1: Replace the AI evidence helper**

In `scripts/rag/tag-proposal-merge-core.mjs`, replace the existing `hasAiTagWithoutEvidence` function with:

```js
function hasAnyAiTagWithoutEvidence(aiTags) {
  for (const tagList of Object.values(aiTags ?? {})) {
    if (!Array.isArray(tagList)) continue;
    for (const tag of tagList) {
      if (typeof tag === "string") {
        continue;
      }
      const evidenceTerms = tag?.evidence_terms;
      if (!Array.isArray(evidenceTerms) || evidenceTerms.length === 0) {
        return true;
      }
    }
  }
  return false;
}
```

- [ ] **Step 2: Require evidence for all AI tags during auto approval**

In `getGateDecision`, replace:

```js
if (hasWarning(aiProposal, "invalid_evidence_terms_removed")) {
  if (hasAiTagWithoutEvidence(aiTags)) {
    blockingReasons.push("missing_ai_evidence");
  } else {
    successReasons.push("ai_evidence_terms_partially_removed");
  }
}
```

with:

```js
if (hasAnyAiTagWithoutEvidence(aiTags)) {
  blockingReasons.push("missing_ai_evidence");
} else if (hasWarning(aiProposal, "invalid_evidence_terms_removed")) {
  successReasons.push("ai_evidence_terms_partially_removed");
}
```

- [ ] **Step 3: Replace method/feature hard conflicts with additive success reasons**

In `getGateDecision`, replace:

```js
const finalTargetSkills = mergeUnique(normalizedRuleTags.target_skills, normalizedAiTags.target_skills);
if (hasMethodTagConflict({ ruleTags: normalizedRuleTags, aiTags: normalizedAiTags, finalTargetSkills })) {
  blockingReasons.push("method_tag_conflict");
}
if (hasFeatureFlagConflict(normalizedRuleTags.feature_flags, normalizedAiTags.feature_flags)) {
  blockingReasons.push("feature_flag_conflict");
}
```

with:

```js
if (hasAiAddedValues(normalizedRuleTags.method_tags, normalizedAiTags.method_tags)) {
  successReasons.push("ai_added_method_tags");
}
if (hasAiAddedValues(
  normalizedRuleTags.feature_flags.filter((tag) => tag !== "needs_visual"),
  normalizedAiTags.feature_flags.filter((tag) => tag !== "needs_visual"),
)) {
  successReasons.push("ai_added_feature_flags");
}
```

Add this helper near the other small set helpers:

```js
function hasAiAddedValues(ruleValues, aiValues) {
  const ruleSet = new Set(ruleValues);
  return aiValues.some((value) => !ruleSet.has(value));
}
```

Remove `hasMethodTagConflict`, `hasFeatureFlagConflict`, `isMethodTagValidForTargets`, and `sameSet` if no code still calls them.

- [ ] **Step 4: Update final tag merge to keep AI additive metadata**

In `chooseFinalTags`, replace:

```js
const derivedMethodTags = deriveMethodTagsFromTargetSkills(target_skills, taxonomy);
const method_tags = mergeUnique(
  derivedMethodTags,
  intersect(normalizedRuleTags.method_tags, normalizedAiTags.method_tags),
  normalizedAiTags.method_tags.filter((tag) => isMethodTagValidForTargets(tag, target_skills, taxonomy)),
);
const feature_flags = intersect(normalizedRuleTags.feature_flags, normalizedAiTags.feature_flags).filter((tag) => tag !== "needs_visual");
return { target_skills, method_tags, feature_flags };
```

with:

```js
const derivedMethodTags = deriveMethodTagsFromTargetSkills(target_skills, taxonomy);
const method_tags = mergeUnique(
  normalizedRuleTags.method_tags,
  derivedMethodTags,
  normalizedAiTags.method_tags,
);
const feature_flags = mergeUnique(
  normalizedRuleTags.feature_flags,
  normalizedAiTags.feature_flags,
).filter((tag) => tag !== "needs_visual");
return { target_skills, method_tags, feature_flags };
```

After this step, run `rg -n "hasMethodTagConflict|hasFeatureFlagConflict|isMethodTagValidForTargets|sameSet|finalTargetSkills" scripts/rag/tag-proposal-merge-core.mjs`.

Expected: no matches.

- [ ] **Step 5: Run the focused merge-gate test**

Run:

```bash
node scripts/tests/rag/tag-proposal-merge-core.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run all RAG tests affected by merge output**

Run:

```bash
node scripts/tests/rag/tag-proposal-merge-cli.test.mjs
node scripts/tests/rag/tag-review-ui-core.test.mjs
node scripts/tests/rag/tag-review-ui-cli.test.mjs
node scripts/tests/rag/tag-review-record-merge-cli.test.mjs
node scripts/tests/rag/enriched-practice-corpus-core.test.mjs
node scripts/tests/rag/variant-practice-agent-core.test.mjs
```

Expected: all PASS. If a test still expects `method_tag_conflict` or `feature_flag_conflict`, update that test only if the old expectation contradicts P2.3c.

---

### Task 3: Update Design and Interview Narrative

**Files:**
- Modify: `docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md`
- Modify: `interview/mathtrace-project-narrative.md`

**Interfaces:**
- Consumes: P2.3c gate behavior from Task 2.
- Produces: repo docs that explain the new AI additive boundary without overstating AI authority.

- [ ] **Step 1: Update P2.3 design spec auto-approval rules**

In `docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md`, update section `7.2 自动通过条件`.

Replace these bullets:

```md
- `method_tags` 至少有一个重叠，或者 AI 的 method tag 能由最终 target skill 合法派生。
- 非视觉 `feature_flags` 必须一致；自动通过时最终 feature flag 等于 rule 与 AI 的共同集合。
- 规则和 AI 不在 `needs_visual` / `has_graph` / 题型 flag 上发生冲突或缺失。
```

with:

```md
- `target_skills` 仍然保守：rule 和 AI 都有目标能力标签时至少要有一个交集；完全冲突不能自动通过。
- `method_tags` 允许 AI additive merge（AI 补充合并）：当 AI 高置信、标签属于 taxonomy 且有有效 `evidence_terms` 时，AI 可以补充 rule 没打出的解题方法标签。
- 非视觉 `feature_flags` 允许 AI additive merge（AI 补充合并）：当 AI 高置信、标签属于 taxonomy 且有有效 `evidence_terms` 时，AI 可以补充 `has_parameter`、`has_ln_exp`、`has_fill_blank` 等客观题型/结构标签。
- `needs_visual` 仍然保守：rule 或 AI 任一方标出 `needs_visual` 都不能自动通过；`needs_visual` 永远不能进入自动通过记录。
```

- [ ] **Step 2: Update P2.3 design spec review-queue rules**

In section `7.3 进入 review queue 的条件`, remove these bullets:

```md
- AI 与 rule 的 `method_tags` 冲突，且不能由最终 target skill 合法派生。
- AI 与 rule 的 `feature_flags` 冲突。
```

Add this bullet after the missing-evidence bullet:

```md
- AI 为新增的 `method_tags` 或非视觉 `feature_flags` 没有保留有效 `evidence_terms`。
```

- [ ] **Step 3: Update interview narrative**

In `interview/mathtrace-project-narrative.md`, find the P2.3 技术决策与取舍 section and add this paragraph after the evidence gate calibration paragraph:

```md
P2.3c 又做了一次 gate calibration（门控校准）：`method_tags`（解题方法标签）和非视觉 `feature_flags`（题目特征标记）从“必须和 rule 完全一致”调整为“AI 高置信、有证据时可以补充”。原因是这些标签更多是题目元数据，不像 `target_skills`（目标能力标签）那样直接决定练习目标。比如一题里出现 `ln x` 和参数 `a`，AI 补出 `logarithmic_derivative_formula`（对数函数求导）和 `has_parameter`（含参数）是合理增量，不应该制造人工审核噪音。但 `target_skills`、`needs_visual`（依赖原图）和无证据 AI 标签仍然保守处理，继续进入人工审核。
```

- [ ] **Step 4: Run focused docs grep**

Run:

```bash
rg -n "method_tag_conflict|feature_flag_conflict|ai_added_method_tags|ai_added_feature_flags|AI additive|补充合并" docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md interview/mathtrace-project-narrative.md scripts/tests/rag/tag-proposal-merge-core.test.mjs
```

Expected:
- `method_tag_conflict` and `feature_flag_conflict` should not appear as required review-queue reasons in the P2.3 design spec.
- `ai_added_method_tags` and `ai_added_feature_flags` should appear in tests.
- The interview narrative should mention the P2.3c boundary in Chinese.

---

### Task 4: Verification and Local Artifact Regeneration

**Files:**
- No tracked source files required beyond Tasks 1-3.
- Writes ignored local artifacts under `artifacts/rag/**`.

**Interfaces:**
- Consumes: latest `candidate_tag_proposals.json` and `candidate_ai_tag_proposals.json` artifacts if present.
- Produces: regenerated local `tag_review_queue.json`, `tag_review_summary.json`, and `index.html` for visible inspection.

- [ ] **Step 1: Run the default test suite**

Run:

```bash
node scripts/run-tests.mjs default
```

Expected: PASS.

- [ ] **Step 2: Run lint and build**

Run:

```bash
npm run lint
npm run build
git diff --check
```

Expected: all PASS.

- [ ] **Step 3: Regenerate merge artifacts from the latest local rule and AI proposals**

Run:

```bash
node scripts/rag/merge-tag-proposals.mjs \
  --corpus artifacts/rag/practice-corpus/practice_corpus.json \
  --rules artifacts/rag/tag-proposals/candidate_tag_proposals.json \
  --ai artifacts/rag/ai-tag-proposals/candidate_ai_tag_proposals.json \
  --out artifacts/rag/tag-review
```

Expected:
- `artifacts/rag/tag-review/merged_tag_proposals.json` is written.
- `artifacts/rag/tag-review/auto_tag_review_records.json` is written.
- `artifacts/rag/tag-review/tag_review_queue.json` is written.
- `artifacts/rag/tag-review/tag_review_summary.json` is written.
- `needs_review_items` should decrease if the current AI artifact has cases where the only blockers were `method_tag_conflict` / `feature_flag_conflict`.

- [ ] **Step 4: Rebuild the visible review HTML**

Run:

```bash
node scripts/rag/build-tag-review-ui.mjs \
  --queue artifacts/rag/tag-review/tag_review_queue.json \
  --out artifacts/rag/tag-review
```

Expected:
- `artifacts/rag/tag-review/index.html` is written.
- The user can refresh `file:///Users/kk/learning-assistant/artifacts/rag/tag-review/index.html`.

- [ ] **Step 5: Summarize visible queue changes**

Run:

```bash
node --input-type=module -e "import fs from 'node:fs'; const summary=JSON.parse(fs.readFileSync('artifacts/rag/tag-review/tag_review_summary.json','utf8')); console.log(JSON.stringify({ auto_approved: summary.auto_approved_items, needs_review: summary.needs_review_items, gate_reason_distribution: summary.gate_reason_distribution }, null, 2));"
```

Expected: output shows the new `auto_approved` and `needs_review` counts. `method_tag_conflict` and `feature_flag_conflict` should be absent or materially reduced.

- [ ] **Step 6: Confirm git status before commit**

Run:

```bash
git status --short
```

Expected tracked changes only in:
- `scripts/rag/tag-proposal-merge-core.mjs`
- `scripts/tests/rag/tag-proposal-merge-core.test.mjs`
- `docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md`
- `interview/mathtrace-project-narrative.md`
- `docs/superpowers/plans/2026-06-25-p23c-ai-additive-gate-calibration.md`

Do not stage:
- `.env*`
- `artifacts/**`
- `docs/reviews/*.md`
- `.superpowers/sdd/**`

---

## Final Verification Commands

Run before local commit:

```bash
node scripts/tests/rag/tag-proposal-merge-core.test.mjs
node scripts/tests/rag/tag-proposal-merge-cli.test.mjs
node scripts/tests/rag/tag-review-ui-core.test.mjs
node scripts/tests/rag/tag-review-ui-cli.test.mjs
node scripts/tests/rag/enriched-practice-corpus-core.test.mjs
node scripts/tests/rag/variant-practice-agent-core.test.mjs
node scripts/run-tests.mjs default
npm run lint
npm run build
git diff --check
git status --short
```

## Commit Scope

Commit only the plan, merge-gate implementation, merge-gate tests, and documentation updates:

```bash
git add \
  docs/superpowers/plans/2026-06-25-p23c-ai-additive-gate-calibration.md \
  docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md \
  interview/mathtrace-project-narrative.md \
  scripts/rag/tag-proposal-merge-core.mjs \
  scripts/tests/rag/tag-proposal-merge-core.test.mjs

git commit -m "fix: allow ai additive tag gate approvals"
```

Do not commit regenerated artifacts.
