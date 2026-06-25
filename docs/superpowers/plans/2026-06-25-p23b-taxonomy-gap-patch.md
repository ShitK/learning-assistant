# P2.3b Taxonomy Gap Patch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patch the `math_derivative_v0` taxonomy so basic derivative-calculation questions can receive stable `target_skills` and `method_tags` instead of falling into `missing_ai_target_skill`.

**Architecture:** Keep `taxonomy` as the controlled source of valid tag keys. AI may propose tags only from the taxonomy; it must not freely invent final tags. Deterministic rules get a narrow derivative-calculation detector, while non-derivative contamination in the current corpus remains a corpus-quality issue, not a reason to broaden the derivative taxonomy.

**Tech Stack:** Node.js ESM scripts, local JSON artifacts under `artifacts/rag/**`, existing RAG tag proposal tests, no new npm dependencies.

## Global Constraints

- Before P2.3b implementation starts, commit the existing P2.3a evidence gate calibration changes as a separate local commit.
- Do not commit `.env*`, `artifacts/**`, `docs/reviews/*.md`, or `.superpowers/sdd/**`.
- Do not call the real AI provider from tests.
- Do not let AI create taxonomy keys at runtime.
- Do not expand this patch into multi-subject taxonomy governance.
- Preserve `sample_diagnosis` and all main app routes.
- Keep RAG as the variant-practice retrieval/source layer; do not write `memory_events`, `student_profiles`, or evidence API data.
- Treat current non-derivative questions in the derivative corpus as corpus contamination, not as taxonomy expansion requirements.

---

## Context From Current Artifact

After P2.3a evidence gate calibration, the regenerated tag review queue has:

```text
item_count: 69
auto_approved_items: 21
needs_review_items: 48
missing_ai_target_skill: 9
```

The `missing_ai_target_skill` cases are mixed:

- True derivative taxonomy gap:
  - `practice-mineru-page-001-block-016-q-2`: asks for `f'(x)` where `f(x)=\ln x/x^2`.
  - `practice-mineru-page-001-block-042-q-7`: n-th derivative definition/calculation question.
- Corpus contamination or non-derivative topic:
  - set/log equation, proposition logic, necessary/sufficient condition, exponential comparison, temperature model, combinatorics.
- Existing tag issue not solved by this patch:
  - a large derivative inequality/monotonicity proof where AI returned invalid/empty tags.

Therefore this patch should add only derivative-calculation tags and narrow rules. It should not make the derivative taxonomy absorb unrelated high-school math topics.

## Proposed Taxonomy Additions

Add one target skill:

```js
derivative_calculation: "求导运算"
```

Add method tags:

```js
quotient_rule: "商法则"
logarithmic_derivative_formula: "对数函数求导"
power_function_derivative: "幂函数求导"
```

Add target-to-method mapping:

```js
derivative_calculation: [
  "quotient_rule",
  "logarithmic_derivative_formula",
  "power_function_derivative",
]
```

This mapping is intentionally narrow for P2.3b. `basic_derivative_formula`, `product_rule`, and `chain_rule` are deferred until the corpus contains clear examples and tests for them.

---

### Task 1: Extend Taxonomy With Derivative Calculation Tags

**Files:**
- Modify: `scripts/rag/practice-tag-taxonomy.mjs`
- Modify: `scripts/tests/rag/practice-tag-taxonomy.test.mjs`

**Interfaces:**
- Consumes: `TARGET_SKILL_DISPLAY_NAMES`, `METHOD_TAG_DISPLAY_NAMES`, `TARGET_SKILL_ALIASES`, `TARGET_SKILL_TO_METHOD_TAGS`
- Produces: stable allowed keys for rule proposal, AI proposal parsing, and merge gate validation

- [ ] **Step 1: Write failing taxonomy tests**

Add these assertions to `scripts/tests/rag/practice-tag-taxonomy.test.mjs`:

```js
assert.equal(TARGET_SKILL_DISPLAY_NAMES.derivative_calculation, "求导运算");
assert.equal(METHOD_TAG_DISPLAY_NAMES.quotient_rule, "商法则");
assert.equal(METHOD_TAG_DISPLAY_NAMES.logarithmic_derivative_formula, "对数函数求导");
assert.equal(METHOD_TAG_DISPLAY_NAMES.power_function_derivative, "幂函数求导");
assert.equal(tagSets.targetSkills.has("derivative_calculation"), true);
assert.equal(tagSets.methodTags.has("quotient_rule"), true);
assert.deepEqual(
  normalizeTargetSkillKeys(["求导运算", "derivative_calculation"]),
  ["derivative_calculation"],
);
assert.deepEqual(
  deriveMethodTagsFromTargetSkills(["求导运算"]),
  [
    "quotient_rule",
    "logarithmic_derivative_formula",
    "power_function_derivative",
  ],
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/tests/rag/practice-tag-taxonomy.test.mjs
```

Expected: FAIL because `derivative_calculation` and the new method tags do not exist.

- [ ] **Step 3: Add taxonomy keys**

Modify `scripts/rag/practice-tag-taxonomy.mjs`:

```js
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
```

```js
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
```

```js
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
```

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node scripts/tests/rag/practice-tag-taxonomy.test.mjs
```

Expected: PASS.

---

### Task 2: Add Narrow Rule Proposal Coverage for Basic Derivative Calculation

**Files:**
- Modify: `scripts/rag/practice-tag-proposal-core.mjs`
- Modify: `scripts/tests/rag/practice-tag-proposal-core.test.mjs`

**Interfaces:**
- Consumes: new taxonomy keys from Task 1
- Produces: rule proposal tags for obvious derivative-calculation questions

- [ ] **Step 1: Write failing rule tests**

In `scripts/tests/rag/practice-tag-proposal-core.test.mjs`, add a new item:

```js
const derivativeCalculationItem = {
  ...baseItem,
  id: "practice-candidate-7",
  source_candidate_id: "candidate-7",
  question_text:
    "7. 已知函数 $f(x)=\\frac{\\ln x}{x^{2}}$, $f'(x)$ 为 $f(x)$ 的导函数, 则 $f'(x)=$ ( ) A. $\\frac{\\ln x}{x^3}$ B. $\\frac{1}{x^{3}}$ C. $\\frac{1 - \\ln x}{x^3}$ D. $\\frac{1-2\\ln x}{x^{3}}$",
  search_text:
    "7. 已知函数 $f(x)=\\frac{\\ln x}{x^{2}}$, $f'(x)$ 为 $f(x)$ 的导函数, 则 $f'(x)=$ ( )\\n导数\\n考点 1 导数的概念、几何意义与运算",
  section_title: "考点 1 导数的概念、几何意义与运算",
};
```

Add assertions:

```js
{
  const proposal = proposeTagsForItem(derivativeCalculationItem);
  assert.deepEqual(
    proposal.proposed_tags.target_skills.map((tag) => tag.tag),
    ["derivative_calculation"],
  );
  assert.equal(
    proposal.proposed_tags.method_tags.some((tag) => tag.tag === "quotient_rule"),
    true,
  );
  assert.equal(
    proposal.proposed_tags.method_tags.some((tag) => tag.tag === "logarithmic_derivative_formula"),
    true,
  );
  assert.equal(
    proposal.proposed_tags.method_tags.some((tag) => tag.tag === "power_function_derivative"),
    true,
  );
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "has_ln_exp"),
    true,
  );
}
```

Add a negative case to avoid over-tagging non-derivative logarithm/set questions:

```js
const nonDerivativeLogItem = {
  ...baseItem,
  id: "practice-candidate-8",
  source_candidate_id: "candidate-8",
  question_text: "8. 已知集合 $A = \\{x \\mid \\log_3(2x + 1) = 2\\}$, 集合 $B = \\{2, a\\}$, 若 $A \\cup B = B$, 则 $a =$ （） A. 1 B. 2 C. 3 D. 4",
  search_text: "8. 已知集合 $A = \\{x \\mid \\log_3(2x + 1) = 2\\}$, 集合 $B = \\{2, a\\}$",
  section_title: "非导数混入题",
};

{
  const proposal = proposeTagsForItem(nonDerivativeLogItem);
  assert.equal(
    proposal.proposed_tags.target_skills.some((tag) => tag.tag === "derivative_calculation"),
    false,
  );
}
```

Add a boundary case where the section title contains "导数" but the question stem has no derivative-calculation signal:

```js
const derivativeSectionNonCalculationItem = {
  ...baseItem,
  id: "practice-candidate-9",
  source_candidate_id: "candidate-9",
  question_text: "9. 已知集合 $A=\\{1,2\\}$, 集合 $B=\\{2,a\\}$, 若 $A \\cup B = B$, 则 $a =$ （） A. 1 B. 2 C. 3 D. 4",
  search_text: "9. 已知集合 $A=\\{1,2\\}$, 集合 $B=\\{2,a\\}$, 若 $A \\cup B = B$",
  section_title: "考点 1 导数的概念、几何意义与运算",
};

{
  const proposal = proposeTagsForItem(derivativeSectionNonCalculationItem);
  assert.equal(
    proposal.proposed_tags.target_skills.some((tag) => tag.tag === "derivative_calculation"),
    false,
  );
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/tests/rag/practice-tag-proposal-core.test.mjs
```

Expected: FAIL because no rule proposes `derivative_calculation`.

- [ ] **Step 3: Implement narrow detector**

In `scripts/rag/practice-tag-proposal-core.mjs`, add this helper:

```js
function hasDerivativeCalculationShape(sourceText) {
  return (
    /f'\(x\)\s*=/.test(sourceText) ||
    /导函数/.test(sourceText) ||
    /求[^。；\n]*导数/.test(sourceText) ||
    /求[^。；\n]*导函数/.test(sourceText)
  );
}
```

Add target skill after `derivative_definition_limit`:

```js
if (hasDerivativeCalculationShape(sourceText)) {
  addTargetSkill(targetSkills, sourceText, {
    tag: "derivative_calculation",
    displayName: TARGET_SKILL_DISPLAY_NAMES.derivative_calculation,
    terms: ["导函数", "f'(x)="],
    confidence: "high",
  });
}
```

Add method tags only when derivative calculation was detected:

```js
if (hasDerivativeCalculationShape(sourceText)) {
  addMethodTag(methodTags, sourceText, {
    tag: "quotient_rule",
    displayName: METHOD_TAG_DISPLAY_NAMES.quotient_rule,
    terms: ["\\frac"],
    confidence: "high",
  });
  addMethodTag(methodTags, sourceText, {
    tag: "logarithmic_derivative_formula",
    displayName: METHOD_TAG_DISPLAY_NAMES.logarithmic_derivative_formula,
    terms: ["ln", "\\ln"],
    confidence: "high",
  });
  addMethodTag(methodTags, sourceText, {
    tag: "power_function_derivative",
    displayName: METHOD_TAG_DISPLAY_NAMES.power_function_derivative,
    terms: ["x^", "x^{"],
    confidence: "high",
  });
}
```

Important: do not tag `log`, `ln`, or `\frac` by themselves as derivative calculation. They are only method evidence after the derivative-calculation shape is present.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node scripts/tests/rag/practice-tag-proposal-core.test.mjs
```

Expected: PASS.

---

### Task 3: Verify AI Proposal Parser And Merge Gate Accept New Tags

**Files:**
- Modify: `scripts/tests/rag/ai-tag-proposal-core.test.mjs`
- Modify: `scripts/tests/rag/tag-proposal-merge-core.test.mjs`

**Interfaces:**
- Consumes: new taxonomy keys and method mapping
- Produces: test coverage that AI proposals using new tags can pass parser and auto gate

- [ ] **Step 1: Add AI parser test for new tags**

In `scripts/tests/rag/ai-tag-proposal-core.test.mjs`, add:

```js
const derivativeCalculationResponse = parseAiTagProposalResponse({
  item: {
    ...item,
    question_text:
      "已知函数 $f(x)=\\frac{\\ln x}{x^{2}}$, $f'(x)$ 为 $f(x)$ 的导函数, 则 $f'(x)=$",
  },
  text: JSON.stringify({
    target_skills: [
      {
        tag: "derivative_calculation",
        confidence: "high",
        evidence_terms: ["f'(x)=", "导函数"],
        rationale: "题目要求计算导函数。",
      },
    ],
    method_tags: [
      {
        tag: "quotient_rule",
        confidence: "high",
        evidence_terms: ["\\frac"],
        rationale: "函数是分式形式。",
      },
      {
        tag: "logarithmic_derivative_formula",
        confidence: "medium",
        evidence_terms: ["\\ln x"],
        rationale: "含对数函数。",
      },
    ],
    feature_flags: [
      {
        tag: "has_ln_exp",
        confidence: "medium",
        evidence_terms: ["\\ln x"],
        rationale: "含对数。",
      },
    ],
    item_confidence: "high",
  }),
  taxonomy,
});
assert.equal(derivativeCalculationResponse.warnings.length, 0);
assert.deepEqual(
  derivativeCalculationResponse.proposed_tags.target_skills.map((tag) => tag.tag),
  ["derivative_calculation"],
);
```

- [ ] **Step 2: Add merge gate test**

In `scripts/tests/rag/tag-proposal-merge-core.test.mjs`, add:

```js
{
  const derivativeCalculation = buildOne({
    itemId: "derivative-calculation",
    ruleTags: tags({
      target_skills: ["derivative_calculation"],
      method_tags: ["quotient_rule", "logarithmic_derivative_formula"],
      feature_flags: ["has_choice_options", "has_ln_exp"],
    }),
    aiTags: tags(
      {
        target_skills: ["derivative_calculation"],
        method_tags: ["quotient_rule", "logarithmic_derivative_formula"],
        feature_flags: ["has_choice_options", "has_ln_exp"],
      },
      "llm",
    ),
  });

  assert.equal(derivativeCalculation.auto_review_records.length, 1);
  assert.deepEqual(derivativeCalculation.auto_review_records[0].reviewed_tags.target_skills, [
    "derivative_calculation",
  ]);
}
```

- [ ] **Step 3: Run tests to verify they fail before Task 1 and Task 2 implementation**

Run:

```bash
node scripts/tests/rag/ai-tag-proposal-core.test.mjs
node scripts/tests/rag/tag-proposal-merge-core.test.mjs
```

Expected before implementation: FAIL on unknown new taxonomy keys.

- [ ] **Step 4: Run tests after Task 1 and Task 2**

Run:

```bash
node scripts/tests/rag/ai-tag-proposal-core.test.mjs
node scripts/tests/rag/tag-proposal-merge-core.test.mjs
```

Expected after implementation: PASS.

---

### Task 4: Verify Enriched Corpus And Variant Practice Agent Integration

**Files:**
- Modify: `scripts/tests/rag/enriched-practice-corpus-core.test.mjs`
- Modify: `scripts/tests/rag/variant-practice-agent-core.test.mjs`

**Interfaces:**
- Consumes: new taxonomy keys from Tasks 1-3
- Produces: regression coverage that downstream corpus enrichment and recommendation can consume `derivative_calculation`

- [ ] **Step 1: Add enriched corpus tests**

In `scripts/tests/rag/enriched-practice-corpus-core.test.mjs`, add a proposal item with `derivative_calculation`:

```js
const derivativeCalculationProposal = {
  item_id: "practice-candidate-1",
  source_candidate_id: "candidate-1",
  source_ref: corpus.items[0].source_ref,
  proposed_tags: {
    target_skills: [
      { tag: "derivative_calculation", confidence: "high", evidence_terms: ["导函数"], source: "rule" },
    ],
    method_tags: [
      { tag: "quotient_rule", confidence: "high", evidence_terms: ["\\frac"], source: "rule" },
      { tag: "logarithmic_derivative_formula", confidence: "high", evidence_terms: ["\\ln"], source: "rule" },
      { tag: "power_function_derivative", confidence: "high", evidence_terms: ["x^"], source: "rule" },
    ],
    feature_flags: [{ tag: "has_ln_exp", confidence: "medium", evidence_terms: ["ln"], source: "rule" }],
  },
  warnings: [],
};
```

Add assertions:

```js
{
  const derivativeCalculationArtifact = {
    ...proposalArtifact,
    item_count: 1,
    proposals: [derivativeCalculationProposal],
  };
  const proposed = buildEnrichedPracticeCorpus({
    corpus: { ...corpus, item_count: 1, items: [corpus.items[0]] },
    proposalArtifact: derivativeCalculationArtifact,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  assert.deepEqual(proposed.items[0].target_skills, ["derivative_calculation"]);
  assert.deepEqual(proposed.items[0].method_tags, [
    "quotient_rule",
    "logarithmic_derivative_formula",
    "power_function_derivative",
  ]);
  assert.equal(proposed.items[0].tag_review_meta.review_status, "proposed");

  const approved = buildEnrichedPracticeCorpus({
    corpus: { ...corpus, item_count: 1, items: [corpus.items[0]] },
    proposalArtifact: derivativeCalculationArtifact,
    acceptRuleProposals: true,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  assert.equal(approved.items[0].tag_review_meta.review_status, "approved");
}
```

- [ ] **Step 2: Add Variant Practice Agent regression**

In `scripts/tests/rag/variant-practice-agent-core.test.mjs`, add:

```js
{
  const derivativeCalculationCorpus = {
    corpus_version: "enriched-practice-corpus-v0",
    generated_at: "2026-06-23T00:00:00.000Z",
    source_corpus_file: "practice_corpus.json",
    source_tag_proposal_file: "candidate_tag_proposals.json",
    item_count: 3,
    items: [
      buildEnrichedTestItem({
        id: "calculation-foundation",
        section_title: "考点 1 导数的概念、几何意义与运算",
        target_skills: ["derivative_calculation"],
        method_tags: ["quotient_rule", "logarithmic_derivative_formula", "power_function_derivative"],
        feature_flags: ["has_ln_exp"],
      }),
      buildEnrichedTestItem({
        id: "calculation-near-transfer",
        section_title: "考点 1 导数的概念、几何意义与运算",
        target_skills: ["derivative_calculation"],
        method_tags: ["quotient_rule", "logarithmic_derivative_formula"],
        feature_flags: ["has_ln_exp"],
      }),
      buildEnrichedTestItem({
        id: "monotonicity-mixed",
        section_title: "考点 2 导数与函数的单调性",
        target_skills: ["monotonicity"],
        method_tags: ["quotient_rule", "monotonicity_by_derivative"],
        feature_flags: ["has_ln_exp"],
      }),
    ],
  };

  const result = recommendVariantPractice({
    corpus: derivativeCalculationCorpus,
    query: {
      id: "query-derivative-calculation",
      question_text: "已知函数 $f(x)=\\frac{\\ln x}{x^2}$，求 $f'(x)$",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念、几何意义与运算",
      target_skills: ["求导运算"],
      mistake_causes: ["derivative_rule_confusion"],
    },
    searchLimit: 10,
  });

  assert.equal(result.recommendations.length >= 2, true);
  assert.equal(result.recommendations[0].item_id, "calculation-foundation");
  assert.equal(result.recommendations[0].matched_dimensions.includes("target_skill"), true);
  assert.equal(result.warnings.includes("no_candidates_found"), false);
}
```

- [ ] **Step 3: Run integration tests to verify they fail before implementation**

Run:

```bash
node scripts/tests/rag/enriched-practice-corpus-core.test.mjs
node scripts/tests/rag/variant-practice-agent-core.test.mjs
```

Expected before implementation: FAIL on unknown `derivative_calculation` or method tags.

- [ ] **Step 4: Run integration tests after Tasks 1-3**

Run:

```bash
node scripts/tests/rag/enriched-practice-corpus-core.test.mjs
node scripts/tests/rag/variant-practice-agent-core.test.mjs
```

Expected after implementation: PASS.

---

### Task 5: Regenerate Local Tag Review Artifacts For Manual Inspection

**Files:**
- Read: `artifacts/rag/practice-corpus/practice_corpus.json`
- Read/Overwrite ignored artifact: `artifacts/rag/tag-proposals/candidate_tag_proposals.json`
- Read/Overwrite ignored artifact: `artifacts/rag/ai-tag-proposals/candidate_ai_tag_proposals.json`
- Read/Overwrite ignored artifact: `artifacts/rag/tag-review/index.html`

**Interfaces:**
- Consumes: updated taxonomy and rule proposals
- Produces: local static review page reflecting P2.3b taxonomy changes

- [ ] **Step 1: Rebuild rule proposals**

Run:

```bash
node scripts/rag/build-practice-tag-proposals.mjs \
  --corpus artifacts/rag/practice-corpus/practice_corpus.json \
  --out artifacts/rag/tag-proposals
```

Expected: command exits 0 and writes `artifacts/rag/tag-proposals/candidate_tag_proposals.json`.

- [ ] **Step 2: Rebuild AI proposals with provider only after user approval**

Because taxonomy changed, the old `candidate_ai_tag_proposals.json` cannot propose `derivative_calculation`. Re-run the real provider only after explicitly confirming with the user that network/model cost is acceptable.

Run after approval:

```bash
node --env-file=.env.local scripts/rag/build-ai-tag-proposals.mjs \
  --corpus artifacts/rag/practice-corpus/practice_corpus.json \
  --rules artifacts/rag/tag-proposals/candidate_tag_proposals.json \
  --taxonomy math_derivative_v0 \
  --out artifacts/rag/ai-tag-proposals
```

Expected: command exits 0 and writes 69 AI proposals. Do not print API keys or provider raw responses.

- [ ] **Step 3: Rebuild merged proposals and review page**

Run:

```bash
node scripts/rag/merge-tag-proposals.mjs \
  --corpus artifacts/rag/practice-corpus/practice_corpus.json \
  --rules artifacts/rag/tag-proposals/candidate_tag_proposals.json \
  --ai artifacts/rag/ai-tag-proposals/candidate_ai_tag_proposals.json \
  --out artifacts/rag/tag-review
```

Run:

```bash
node scripts/rag/build-tag-review-ui.mjs \
  --queue artifacts/rag/tag-review/tag_review_queue.json \
  --out artifacts/rag/tag-review
```

Expected: `artifacts/rag/tag-review/index.html` is regenerated.

- [ ] **Step 4: Inspect summary**

Run:

```bash
node --input-type=module -e 'import fs from "node:fs"; const s=JSON.parse(fs.readFileSync("artifacts/rag/tag-review/tag_review_summary.json","utf8")); console.log(JSON.stringify(s,null,2));'
```

Expected: `missing_ai_target_skill` should drop for the true derivative-calculation cases. It does not need to reach zero because several current queue items are non-derivative corpus contamination.

---

If the user does not approve a real provider call, use a synthetic provider response only to verify merge/review UI plumbing:

```bash
MATHTRACE_FAKE_RAG_TAG_RESPONSE='{"target_skills":[{"tag":"derivative_calculation","confidence":"high","evidence_terms":["导函数"],"rationale":"fixture"}],"method_tags":[{"tag":"quotient_rule","confidence":"high","evidence_terms":["\\\\frac"],"rationale":"fixture"}],"feature_flags":[{"tag":"has_ln_exp","confidence":"medium","evidence_terms":["ln"],"rationale":"fixture"}],"item_confidence":"high"}' \
node scripts/rag/build-ai-tag-proposals.mjs \
  --corpus artifacts/rag/practice-corpus/practice_corpus.json \
  --rules artifacts/rag/tag-proposals/candidate_tag_proposals.json \
  --taxonomy math_derivative_v0 \
  --limit 3 \
  --out artifacts/rag/ai-tag-proposals-p23b-fixture
```

This fallback is only for local plumbing verification. It must not be represented as real AI quality and must not be committed.

### Task 6: Update Design Spec, Interview Narrative, And Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md`
- Modify: `interview/mathtrace-project-narrative.md`

**Interfaces:**
- Consumes: final code behavior and local summary
- Produces: design-spec and interview explanation for taxonomy gap patch

- [ ] **Step 1: Update P2.3 design spec**

In `docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md`, update the taxonomy section that lists `math_derivative_v0` tags:

```md
P2.3b extends `math_derivative_v0` with `derivative_calculation`（求导运算） and the first three calculation method tags: `quotient_rule`（商法则）, `logarithmic_derivative_formula`（对数函数求导）, and `power_function_derivative`（幂函数求导）. `product_rule`（乘积法则）, `chain_rule`（链式法则）, and broad `basic_derivative_formula`（基本求导公式） are intentionally deferred until the corpus contains verified examples.
```

- [ ] **Step 2: Update P2.3 narrative**

Add a paragraph explaining:

```md
P2.3b 补的是 taxonomy coverage（标签体系覆盖范围），不是放手让 AI 自由创建标签。真实审核页发现基础求导运算题触发 `missing_ai_target_skill`，原因是 `math_derivative_v0`（导数专题第一版标签体系）缺少 `derivative_calculation`（求导运算）这类稳定 target skill。最终做法是：AI 可以暴露缺口，但新增 tag key 必须人工确认后写入 taxonomy，并由测试锁住。
```

Mention the distinction:

```md
当前 `missing_ai_target_skill` 中并非全部是导数 taxonomy 缺口。部分题其实是 PDF 导数切片中混入的集合、命题、组合或指数应用题，这些应作为 corpus contamination（题库污染）处理，而不是扩展导数 taxonomy 去覆盖所有数学内容。
```

Also add:

```md
`target_skills`（目标能力标签） are not mutually exclusive. A future question may validly combine `derivative_definition_limit`（极限式识别导数） with `derivative_calculation`（求导运算） if the task requires both recognizing a derivative definition and performing derivative calculation.
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
node scripts/tests/rag/practice-tag-taxonomy.test.mjs
node scripts/tests/rag/practice-tag-proposal-core.test.mjs
node scripts/tests/rag/ai-tag-proposal-core.test.mjs
node scripts/tests/rag/tag-proposal-merge-core.test.mjs
node scripts/tests/rag/enriched-practice-corpus-core.test.mjs
node scripts/tests/rag/variant-practice-agent-core.test.mjs
```

Expected: all pass.

- [ ] **Step 4: Run project verification**

Run:

```bash
node scripts/run-tests.mjs default
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Show exact status**

Run:

```bash
git status --short
git diff --stat
```

Expected: only P2.3a/P2.3b code, tests, plan, and interview narrative files are modified. `artifacts/**` and `.env.local` remain ignored and untracked.

---

## Self-Review

- Spec coverage: The plan covers taxonomy keys, deterministic rule coverage, AI parser acceptance, merge gate acceptance, artifact regeneration, and interview narrative.
- Scope check: This is one bounded taxonomy patch. It does not implement multi-subject taxonomy governance or database storage.
- Risk check: The plan explicitly avoids over-tagging non-derivative log/set questions and treats mixed-in non-derivative corpus items as corpus contamination.
- Test strategy: TDD is required for taxonomy, rules, parser, and merge gate before implementation.
