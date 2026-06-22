# P2.2 Metadata / Tag Proposal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local deterministic metadata enrichment loop that turns `practice_corpus.json` into tag proposals, an enriched corpus fixture, and a better Variant Practice Agent evaluation path.

**Architecture:** Keep P2.2 inside local Node.js RAG tooling. Add a shared derivative tag taxonomy, a rule-based proposal core, CLI artifact builders, enriched corpus validation/building, and a narrow upgrade to the existing P2.1 search/Agent code so it can consume enriched tags without touching product frontend, APIs, database, or memory/profile layers.

**Tech Stack:** Node.js ESM scripts, `node:fs/promises`, `node:path`, existing `scripts/run-tests.mjs`, deterministic rule matching, local ignored artifacts under `artifacts/rag/**`.

## Global Constraints

- Do not modify `src/app/**`, `app/api/**`, `components/**`, diagnosis pipeline, persistence, Supabase schema, `memory_events`, `student_profiles`, mistake book behavior, evidence API, pgvector, embedding, or production retrieval APIs.
- Do not commit real `practice_corpus.json`, `candidate_tag_proposals.json`, `enriched_practice_corpus.json`, recommendations, PDFs, MinerU JSON, reviewed seed, page images, or anything under `artifacts/`.
- Do not read or print `.env.local`, service role keys, model API keys, MinerU tokens, or external API credentials.
- Keep `sample_diagnosis` stable and untouched.
- `docs/reviews/*.md` remains local-only unless the user explicitly asks to commit a review file.
- Tests must use synthetic fixture text, not real教辅题文.
- P2.2 remains deterministic: no LLM tag finalization, no LLM rerank, no external network, no pgvector.
- Tag proposal is not final truth. Proposal tags can enter enriched corpus as `review_status: "proposed"` draft, or as `review_status: "approved"` only when explicitly accepted or supplied by review records.
- Formal corpus tags use snake_case internal keys. Chinese names are `display_name` only and do not participate in matching.
- `variant_level` must not enter corpus; it remains dynamic recommendation result metadata.
- `needs_visual` items are skipped by the text-only Variant Practice Agent.
- CLI stdout may print counts, distributions, output paths, and warning counts; it must not print full question text, full corpus, full recommendations, PDF content, `.env`, or API key names.
- RAG remains a retrieval/recommendation layer for variant-practice sourcing; it must not write or decide `memory_events` / `student_profiles`.

---

## File Structure

- Create `scripts/rag/practice-tag-taxonomy.mjs`
  - Own derivative tag constants, display names, query skill normalization, and query-skill-to-method-tag derivation.
- Create `scripts/rag/practice-tag-proposal-core.mjs`
  - Build rule-based proposals from a validated practice corpus.
  - Summarize confidence, warning, and tag distributions.
  - Validate proposal artifacts.
- Create `scripts/rag/build-practice-tag-proposals.mjs`
  - CLI entry point for `practice_corpus.json -> candidate_tag_proposals.json + tag_proposal_summary.json`.
- Create `scripts/rag/enriched-practice-corpus-core.mjs`
  - Validate enriched corpus shape.
  - Convert proposals or reviewed tag records into `enriched_practice_corpus.json`.
  - Keep original practice corpus fields and add tags / `tag_review_meta`.
- Create `scripts/rag/build-enriched-practice-corpus.mjs`
  - CLI entry point for `practice_corpus.json + candidate_tag_proposals.json -> enriched_practice_corpus.json + enrichment_summary.json`.
- Modify `scripts/rag/practice-corpus-search-core.mjs`
  - Accept both `practice-corpus-v0` and `enriched-practice-corpus-v0`.
  - Score normalized query skill keys against item `target_skills`.
  - Score query-derived `method_tags` against item `method_tags`.
  - Skip `needs_visual` items by default.
- Modify `scripts/rag/variant-practice-agent-core.mjs`
  - Use enriched metadata to classify `near_transfer` and `mixed_application`.
  - Emit more specific insufficient-recommendation warnings.
- Create tests:
  - `scripts/tests/rag/practice-tag-taxonomy.test.mjs`
  - `scripts/tests/rag/practice-tag-proposal-core.test.mjs`
  - `scripts/tests/rag/practice-tag-proposal-cli.test.mjs`
  - `scripts/tests/rag/enriched-practice-corpus-core.test.mjs`
  - `scripts/tests/rag/enriched-practice-corpus-cli.test.mjs`
- Modify existing tests:
  - `scripts/tests/rag/practice-corpus-search-core.test.mjs`
  - `scripts/tests/rag/variant-practice-agent-core.test.mjs`
  - `scripts/tests/rag/variant-practice-agent-cli.test.mjs`
- Modify `scripts/run-tests.mjs`
  - Add the five new RAG tests to the `default` suite near P2.1 RAG tests.
- Modify `docs/superpowers/specs/2026-06-23-p22-metadata-tag-proposal-design.md`
  - Add implementation handoff notes only if implementation behavior diverges from the spec.
- Modify `interview/mathtrace-project-narrative.md`
  - Add a P2.2 interview narrative stage after implementation and verification.
- Optional generated artifacts, not committed:
  - `artifacts/rag/tag-proposals/candidate_tag_proposals.json`
  - `artifacts/rag/tag-proposals/tag_proposal_summary.json`
  - `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`
  - `artifacts/rag/enriched-practice-corpus/enrichment_summary.json`
  - `artifacts/rag/variant-practice-agent/enriched-recommendations.json`

## Data Contracts

### Tag Proposal Artifact

```js
{
  proposal_version: "practice-tag-proposal-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_corpus_file: "artifacts/rag/practice-corpus/practice_corpus.json",
  source_corpus_version: "practice-corpus-v0",
  item_count: 2,
  proposals: [
    {
      item_id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
      proposed_tags: {
        target_skills: [
          {
            tag: "tangent_slope",
            display_name: "切线斜率",
            confidence: "high",
            evidence_terms: ["切线", "斜率"],
            source: "rule"
          }
        ],
        method_tags: [
          {
            tag: "tangent_slope",
            display_name: "切线斜率",
            confidence: "high",
            evidence_terms: ["切线", "斜率"],
            source: "rule"
          }
        ],
        feature_flags: [
          {
            tag: "has_choice_options",
            display_name: "选择题",
            confidence: "medium",
            evidence_terms: ["A.", "B.", "C.", "D."],
            source: "rule"
          }
        ]
      },
      warnings: []
    }
  ]
}
```

### Tag Review Record

```js
{
  item_id: "practice-candidate-1",
  review_status: "approved",
  reviewed_tags: {
    target_skills: ["tangent_slope", "derivative_definition_limit"],
    method_tags: ["tangent_slope", "derivative_definition"],
    feature_flags: ["has_choice_options"]
  },
  review_notes: "",
  has_manual_tag_correction: true,
  tag_source: "human"
}
```

### Enriched Corpus Item

```js
{
  id: "practice-candidate-1",
  source_candidate_id: "candidate-1",
  question_text: "1. 已知函数在点处可导，求曲线切线斜率.",
  search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数\n考点 1 导数的概念",
  knowledge_points: ["derivative"],
  section_title: "考点 1 导数的概念",
  target_skills: ["tangent_slope", "derivative_definition_limit"],
  method_tags: ["tangent_slope", "derivative_definition"],
  feature_flags: ["has_choice_options"],
  difficulty: null,
  source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
  tag_review_meta: {
    review_status: "approved",
    proposal_confidence: "high",
    has_manual_tag_correction: false,
    tag_source: "rule"
  },
  review_meta: {}
}
```

---

### Task 1: Derivative Tag Taxonomy And Proposal Core

**Files:**
- Create: `scripts/rag/practice-tag-taxonomy.mjs`
- Create: `scripts/rag/practice-tag-proposal-core.mjs`
- Create: `scripts/tests/rag/practice-tag-taxonomy.test.mjs`
- Create: `scripts/tests/rag/practice-tag-proposal-core.test.mjs`

**Interfaces:**
- Produces:
  - `TARGET_SKILL_DISPLAY_NAMES: Record<string, string>`
  - `METHOD_TAG_DISPLAY_NAMES: Record<string, string>`
  - `FEATURE_FLAG_DISPLAY_NAMES: Record<string, string>`
  - `normalizeTargetSkillKeys(skills: unknown): string[]`
  - `deriveMethodTagsFromTargetSkills(targetSkills: unknown): string[]`
  - `buildTagProposals({ corpus, sourceCorpusFile, generatedAt }): TagProposalArtifact`
  - `proposeTagsForItem(item): TagProposal`
  - `summarizeTagProposals(proposalArtifact): TagProposalSummary`
  - `validateTagProposalArtifact(value): { ok: true, proposalArtifact } | { ok: false, errors: string[] }`
- Consumed by Task 2:
  - `buildTagProposals`
  - `summarizeTagProposals`
  - `validateTagProposalArtifact`
- Consumed by Task 4:
  - `normalizeTargetSkillKeys`
  - `deriveMethodTagsFromTargetSkills`

- [ ] **Step 1: Write failing taxonomy tests**

Create `scripts/tests/rag/practice-tag-taxonomy.test.mjs`:

```js
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
```

- [ ] **Step 2: Run taxonomy test to verify it fails**

Run: `node scripts/tests/rag/practice-tag-taxonomy.test.mjs`

Expected: FAIL with an import/module-not-found error for `practice-tag-taxonomy.mjs`.

- [ ] **Step 3: Implement taxonomy module**

Create `scripts/rag/practice-tag-taxonomy.mjs`:

```js
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
```

- [ ] **Step 4: Run taxonomy test to verify it passes**

Run: `node scripts/tests/rag/practice-tag-taxonomy.test.mjs`

Expected: PASS with exit code 0.

- [ ] **Step 5: Write failing proposal core tests**

Create `scripts/tests/rag/practice-tag-proposal-core.test.mjs`:

```js
import assert from "node:assert/strict";

import {
  buildTagProposals,
  proposeTagsForItem,
  summarizeTagProposals,
  validateTagProposalArtifact,
} from "../../rag/practice-tag-proposal-core.mjs";

const baseItem = {
  id: "practice-candidate-1",
  source_candidate_id: "candidate-1",
  question_text: "1. 已知函数在点处可导，求曲线切线斜率. A. 1 B. 2 C. 3 D. 4",
  search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数\n考点 1 导数的概念",
  knowledge_points: ["derivative"],
  section_title: "考点 1 导数的概念",
  difficulty: null,
  source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
  review_meta: {},
};

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: null,
  item_count: 5,
  items: [
    baseItem,
    {
      ...baseItem,
      id: "practice-candidate-2",
      source_candidate_id: "candidate-2",
      question_text: "2. 讨论函数单调递增，并求参数取值范围.",
      search_text: "2. 讨论函数单调递增，并求参数取值范围.\n导数\n考点 2 导数与函数的单调性",
      section_title: "考点 2 导数与函数的单调性",
    },
    {
      ...baseItem,
      id: "practice-candidate-3",
      source_candidate_id: "candidate-3",
      question_text: "3. 已知函数 f(x)=ln x + sqrt(x)，求最小值.",
      search_text: "3. 已知函数 f(x)=ln x + sqrt(x)，求最小值.\n导数\n考点 3 导数与极值最值",
      section_title: "考点 3 导数与极值最值",
    },
    {
      ...baseItem,
      id: "practice-candidate-4",
      source_candidate_id: "candidate-4",
      question_text: "4. 如图，根据函数图像判断零点个数.",
      search_text: "4. 如图，根据函数图像判断零点个数.\n导数\n考点 4 导数与零点",
      section_title: "考点 4 导数与零点",
      review_meta: { warnings: ["missing_visual_context"] },
    },
    {
      ...baseItem,
      id: "practice-candidate-5",
      source_candidate_id: "candidate-5",
      question_text: "5. 观察函数图像信息，文字已给出所有条件.",
      search_text: "5. 观察函数图像信息，文字已给出所有条件.\n导数\n考点 5 综合应用",
      section_title: "考点 5 综合应用",
    },
    {
      ...baseItem,
      id: "practice-candidate-6",
      source_candidate_id: "candidate-6",
      question_text: "6. 计算函数值.",
      search_text: "6. 计算函数值.",
      section_title: null,
      source_ref: null,
    },
  ],
};

{
  const proposal = proposeTagsForItem(baseItem);
  assert.deepEqual(
    proposal.proposed_tags.target_skills.map((tag) => tag.tag),
    ["tangent_slope"],
  );
  assert.equal(proposal.proposed_tags.target_skills[0].display_name, "切线斜率");
  assert.deepEqual(
    proposal.proposed_tags.method_tags.map((tag) => tag.tag),
    ["derivative_definition", "tangent_slope"],
  );
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "has_choice_options"),
    true,
  );
  assert.equal(proposal.warnings.length, 0);
}

{
  const proposal = proposeTagsForItem(corpus.items[2]);
  assert.deepEqual(
    proposal.proposed_tags.target_skills.map((tag) => tag.tag),
    ["extrema"],
  );
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "has_ln_exp"),
    true,
  );
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "has_square_root"),
    true,
  );
}

{
  const proposal = proposeTagsForItem(corpus.items[3]);
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "has_graph"),
    true,
  );
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "needs_visual"),
    true,
  );
}

{
  const proposal = proposeTagsForItem(corpus.items[4]);
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "has_graph"),
    true,
  );
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "needs_visual"),
    false,
  );
}

{
  const proposal = proposeTagsForItem(corpus.items[5]);
  assert.deepEqual(proposal.proposed_tags.target_skills, []);
  assert.equal(proposal.warnings.includes("no_tags_proposed"), true);
}

{
  const artifact = buildTagProposals({
    corpus,
    sourceCorpusFile: "artifacts/rag/practice-corpus/practice_corpus.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  assert.equal(artifact.proposal_version, "practice-tag-proposal-v0");
  assert.equal(artifact.item_count, 6);
  assert.equal(artifact.proposals.length, 6);
  assert.equal(artifact.proposals[0].item_id, "practice-candidate-1");

  const validation = validateTagProposalArtifact(artifact);
  assert.equal(validation.ok, true);

  const invalid = validateTagProposalArtifact({ proposal_version: "bad", proposals: "bad" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.some((error) => error.includes("proposal_version")), true);
  assert.equal(invalid.errors.some((error) => error.includes("proposals must be an array")), true);
}

{
  const artifact = buildTagProposals({
    corpus,
    sourceCorpusFile: "practice_corpus.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  const summary = summarizeTagProposals(artifact);
  assert.equal(summary.proposal_version, "practice-tag-proposal-v0");
  assert.equal(summary.item_count, 6);
  assert.equal(summary.high_confidence_items >= 3, true);
  assert.equal(summary.needs_visual_items, 1);
  assert.equal(summary.warning_distribution.no_tags_proposed, 1);
  assert.equal(summary.target_skill_distribution.tangent_slope, 1);
  assert.equal(summary.target_skill_distribution.extrema, 1);
  assert.equal(summary.multi_tag_items >= 1, true);
}
```

- [ ] **Step 6: Run proposal core test to verify it fails**

Run: `node scripts/tests/rag/practice-tag-proposal-core.test.mjs`

Expected: FAIL with an import/module-not-found error for `practice-tag-proposal-core.mjs`.

- [ ] **Step 7: Implement proposal core**

Create `scripts/rag/practice-tag-proposal-core.mjs` with these exported functions and local helpers:

```js
import {
  FEATURE_FLAG_DISPLAY_NAMES,
  METHOD_TAG_DISPLAY_NAMES,
  TARGET_SKILL_DISPLAY_NAMES,
} from "./practice-tag-taxonomy.mjs";

const PROPOSAL_VERSION = "practice-tag-proposal-v0";
const CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);
const TAG_SOURCE_VALUES = new Set(["rule"]);

export function buildTagProposals({ corpus, sourceCorpusFile, generatedAt }) {
  const proposals = Array.isArray(corpus?.items) ? corpus.items.map(proposeTagsForItem) : [];
  return {
    proposal_version: PROPOSAL_VERSION,
    generated_at: generatedAt,
    source_corpus_file: sourceCorpusFile,
    source_corpus_version: corpus?.corpus_version ?? null,
    item_count: proposals.length,
    proposals,
  };
}

export function proposeTagsForItem(item) {
  const sourceText = buildSourceText(item);
  const warnings = [];
  const targetSkills = [];
  const methodTags = [];
  const featureFlags = [];

  addTargetSkill(targetSkills, sourceText, {
    tag: "derivative_definition_limit",
    displayName: TARGET_SKILL_DISPLAY_NAMES.derivative_definition_limit,
    terms: ["极限"],
    confidence: hasDerivativeLimitShape(sourceText) ? "high" : "medium",
  });
  addTargetSkill(targetSkills, sourceText, {
    tag: "tangent_slope",
    displayName: TARGET_SKILL_DISPLAY_NAMES.tangent_slope,
    terms: ["切线", "斜率"],
    confidence: "high",
  });
  addTargetSkill(targetSkills, sourceText, {
    tag: "monotonicity",
    displayName: TARGET_SKILL_DISPLAY_NAMES.monotonicity,
    terms: ["单调", "递增", "递减"],
    confidence: "high",
  });
  addTargetSkill(targetSkills, sourceText, {
    tag: "extrema",
    displayName: TARGET_SKILL_DISPLAY_NAMES.extrema,
    terms: ["极值", "最值", "最大值", "最小值"],
    confidence: "high",
  });
  addTargetSkill(targetSkills, sourceText, {
    tag: "zero_point",
    displayName: TARGET_SKILL_DISPLAY_NAMES.zero_point,
    terms: ["零点", "交点"],
    confidence: "high",
  });
  addTargetSkill(targetSkills, sourceText, {
    tag: "parameter_range",
    displayName: TARGET_SKILL_DISPLAY_NAMES.parameter_range,
    terms: ["参数", "恒成立", "取值范围"],
    confidence: "high",
  });

  for (const target of targetSkills) {
    addMethodTagsForTarget(methodTags, target);
  }
  addMethodTag(methodTags, sourceText, {
    tag: "inequality_with_derivative",
    displayName: METHOD_TAG_DISPLAY_NAMES.inequality_with_derivative,
    terms: ["不等式", "恒成立"],
    confidence: "medium",
  });

  addFeatureFlag(featureFlags, sourceText, {
    tag: "has_choice_options",
    displayName: FEATURE_FLAG_DISPLAY_NAMES.has_choice_options,
    terms: ["A.", "B.", "C.", "D."],
    confidence: "medium",
  });
  addFeatureFlag(featureFlags, sourceText, {
    tag: "has_fill_blank",
    displayName: FEATURE_FLAG_DISPLAY_NAMES.has_fill_blank,
    terms: ["____", "填空", "________"],
    confidence: "medium",
  });
  addFeatureFlag(featureFlags, sourceText, {
    tag: "has_ln_exp",
    displayName: FEATURE_FLAG_DISPLAY_NAMES.has_ln_exp,
    terms: ["ln", "e^", "exp"],
    confidence: "medium",
  });
  addFeatureFlag(featureFlags, sourceText, {
    tag: "has_square_root",
    displayName: FEATURE_FLAG_DISPLAY_NAMES.has_square_root,
    terms: ["sqrt", "√", "根号"],
    confidence: "medium",
  });
  addFeatureFlag(featureFlags, sourceText, {
    tag: "has_graph",
    displayName: FEATURE_FLAG_DISPLAY_NAMES.has_graph,
    terms: ["如图", "图像", "图象"],
    confidence: "medium",
  });
  if (hasVisualDependency(item, sourceText)) {
    pushUniqueTag(featureFlags, {
      tag: "needs_visual",
      display_name: FEATURE_FLAG_DISPLAY_NAMES.needs_visual,
      confidence: "high",
      evidence_terms: ["如图"],
      source: "rule",
    });
  }

  if (targetSkills.length === 0 && methodTags.length === 0 && featureFlags.length === 0) {
    warnings.push("no_tags_proposed");
  }

  return {
    item_id: item.id,
    source_candidate_id: item.source_candidate_id,
    source_ref: item.source_ref ?? null,
    proposed_tags: {
      target_skills: targetSkills,
      method_tags: methodTags,
      feature_flags: featureFlags,
    },
    warnings,
  };
}

export function summarizeTagProposals(proposalArtifact) {
  const summary = {
    proposal_version: proposalArtifact?.proposal_version ?? null,
    item_count: Array.isArray(proposalArtifact?.proposals) ? proposalArtifact.proposals.length : 0,
    high_confidence_items: 0,
    medium_confidence_items: 0,
    low_confidence_items: 0,
    needs_visual_items: 0,
    needs_fix_items: 0,
    multi_tag_items: 0,
    target_skill_distribution: {},
    method_tag_distribution: {},
    feature_flag_distribution: {},
    warning_distribution: {},
  };

  for (const proposal of proposalArtifact?.proposals ?? []) {
    const tags = flattenProposalTags(proposal);
    const confidence = summarizeItemConfidence(tags);
    if (confidence === "high") summary.high_confidence_items += 1;
    if (confidence === "medium") summary.medium_confidence_items += 1;
    if (confidence === "low") summary.low_confidence_items += 1;
    if (tags.length > 1) summary.multi_tag_items += 1;
    if (proposal.proposed_tags?.feature_flags?.some((tag) => tag.tag === "needs_visual")) {
      summary.needs_visual_items += 1;
    }
    if ((proposal.warnings ?? []).includes("no_tags_proposed")) {
      summary.needs_fix_items += 1;
    }
    countTags(summary.target_skill_distribution, proposal.proposed_tags?.target_skills);
    countTags(summary.method_tag_distribution, proposal.proposed_tags?.method_tags);
    countTags(summary.feature_flag_distribution, proposal.proposed_tags?.feature_flags);
    for (const warning of proposal.warnings ?? []) {
      summary.warning_distribution[warning] = (summary.warning_distribution[warning] ?? 0) + 1;
    }
  }

  return summary;
}

export function validateTagProposalArtifact(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["proposal artifact must be an object"] };
  }
  if (value.proposal_version !== PROPOSAL_VERSION) {
    errors.push(`proposal_version must be ${PROPOSAL_VERSION}`);
  }
  if (!Array.isArray(value.proposals)) {
    errors.push("proposals must be an array");
  } else {
    value.proposals.forEach((proposal, index) => validateProposal(proposal, index, errors));
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, proposalArtifact: value };
}

function buildSourceText(item) {
  return [
    item?.question_text,
    item?.search_text,
    item?.section_title,
    item?.source_ref?.section_title,
  ]
    .filter((part) => typeof part === "string")
    .join("\n");
}

function hasDerivativeLimitShape(sourceText) {
  return /\blim\b|Δx|→/.test(sourceText);
}

function addTargetSkill(targetSkills, sourceText, rule) {
  const evidenceTerms = rule.terms.filter((term) => sourceText.includes(term));
  if (evidenceTerms.length === 0) return;
  pushUniqueTag(targetSkills, {
    tag: rule.tag,
    display_name: rule.displayName,
    confidence: rule.confidence,
    evidence_terms: evidenceTerms,
    source: "rule",
  });
}

function addMethodTagsForTarget(methodTags, targetTag) {
  const rules = {
    derivative_definition_limit: ["derivative_definition"],
    tangent_slope: ["derivative_definition", "tangent_slope"],
    monotonicity: ["monotonicity_by_derivative"],
    extrema: ["extremum_by_derivative"],
    zero_point: ["zero_count"],
    parameter_range: ["parameter_classification"],
  };
  for (const methodTag of rules[targetTag.tag] ?? []) {
    pushUniqueTag(methodTags, {
      tag: methodTag,
      display_name: METHOD_TAG_DISPLAY_NAMES[methodTag] ?? methodTag,
      confidence: targetTag.confidence,
      evidence_terms: targetTag.evidence_terms,
      source: "rule",
    });
  }
}

function addMethodTag(methodTags, sourceText, rule) {
  const evidenceTerms = rule.terms.filter((term) => sourceText.includes(term));
  if (evidenceTerms.length === 0) return;
  pushUniqueTag(methodTags, {
    tag: rule.tag,
    display_name: rule.displayName,
    confidence: rule.confidence,
    evidence_terms: evidenceTerms,
    source: "rule",
  });
}

function addFeatureFlag(featureFlags, sourceText, rule) {
  const evidenceTerms = rule.terms.filter((term) => sourceText.includes(term));
  if (evidenceTerms.length === 0) return;
  pushUniqueTag(featureFlags, {
    tag: rule.tag,
    display_name: rule.displayName,
    confidence: rule.confidence,
    evidence_terms: evidenceTerms,
    source: "rule",
  });
}

function hasVisualDependency(item, sourceText) {
  const warnings = Array.isArray(item?.review_meta?.warnings) ? item.review_meta.warnings : [];
  return (
    sourceText.includes("如图") ||
    warnings.includes("missing_visual_context") ||
    warnings.includes("needs_visual")
  );
}

function pushUniqueTag(tags, nextTag) {
  if (!tags.some((tag) => tag.tag === nextTag.tag)) {
    tags.push(nextTag);
  }
}

function flattenProposalTags(proposal) {
  return [
    ...(proposal?.proposed_tags?.target_skills ?? []),
    ...(proposal?.proposed_tags?.method_tags ?? []),
    ...(proposal?.proposed_tags?.feature_flags ?? []),
  ];
}

function summarizeItemConfidence(tags) {
  if (tags.some((tag) => tag.confidence === "high")) return "high";
  if (tags.some((tag) => tag.confidence === "medium")) return "medium";
  return "low";
}

function countTags(target, tags = []) {
  for (const tag of tags) {
    target[tag.tag] = (target[tag.tag] ?? 0) + 1;
  }
}

function validateProposal(proposal, index, errors) {
  const path = `proposals[${index}]`;
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (typeof proposal.item_id !== "string" || !proposal.item_id.trim()) {
    errors.push(`${path}.item_id must be a non-empty string`);
  }
  validateTagList(proposal.proposed_tags?.target_skills, `${path}.proposed_tags.target_skills`, errors);
  validateTagList(proposal.proposed_tags?.method_tags, `${path}.proposed_tags.method_tags`, errors);
  validateTagList(proposal.proposed_tags?.feature_flags, `${path}.proposed_tags.feature_flags`, errors);
}

function validateTagList(tags, path, errors) {
  if (!Array.isArray(tags)) {
    errors.push(`${path} must be an array`);
    return;
  }
  tags.forEach((tag, index) => {
    if (typeof tag?.tag !== "string" || !tag.tag.trim()) errors.push(`${path}[${index}].tag must be a non-empty string`);
    if (!CONFIDENCE_VALUES.has(tag?.confidence)) errors.push(`${path}[${index}].confidence is invalid`);
    if (!TAG_SOURCE_VALUES.has(tag?.source)) errors.push(`${path}[${index}].source is invalid`);
    if (!Array.isArray(tag?.evidence_terms)) errors.push(`${path}[${index}].evidence_terms must be an array`);
  });
}
```

- [ ] **Step 8: Run proposal core test to verify it passes**

Run: `node scripts/tests/rag/practice-tag-proposal-core.test.mjs`

Expected: PASS with exit code 0.

- [ ] **Step 9: Commit Task 1**

```bash
git status --short
git add scripts/rag/practice-tag-taxonomy.mjs scripts/rag/practice-tag-proposal-core.mjs scripts/tests/rag/practice-tag-taxonomy.test.mjs scripts/tests/rag/practice-tag-proposal-core.test.mjs
git commit -m "feat: add derivative tag proposal core"
```

Expected staged files: only the four Task 1 files.

---

### Task 2: Tag Proposal CLI And Test Registration

**Files:**
- Create: `scripts/rag/build-practice-tag-proposals.mjs`
- Create: `scripts/tests/rag/practice-tag-proposal-cli.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes:
  - `validatePracticeCorpus(value)` from `scripts/rag/practice-corpus-search-core.mjs`
  - `buildTagProposals({ corpus, sourceCorpusFile, generatedAt })`
  - `summarizeTagProposals(proposalArtifact)`
- Produces:
  - CLI command:
    `node scripts/rag/build-practice-tag-proposals.mjs --corpus <practice_corpus.json> [--out <dir>]`
  - Default output files:
    - `artifacts/rag/tag-proposals/candidate_tag_proposals.json`
    - `artifacts/rag/tag-proposals/tag_proposal_summary.json`

- [ ] **Step 1: Write failing CLI tests**

Create `scripts/tests/rag/practice-tag-proposal-cli.test.mjs`:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = join(process.cwd(), "scripts/rag/build-practice-tag-proposals.mjs");
const tmpRoot = mkdtempSync(join(tmpdir(), "practice-tag-proposal-"));
const corpusPath = join(tmpRoot, "practice_corpus.json");
const outputDir = join(tmpRoot, "out");

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: null,
  item_count: 2,
  items: [
    {
      id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知函数在点处可导，求曲线切线斜率. A. 1 B. 2 C. 3 D. 4",
      search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数\n考点 1 导数的概念",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      difficulty: null,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
      review_meta: {},
    },
    {
      id: "practice-candidate-2",
      source_candidate_id: "candidate-2",
      question_text: "2. 如图，根据函数图像判断零点个数.",
      search_text: "2. 如图，根据函数图像判断零点个数.\n导数\n考点 4 导数与零点",
      knowledge_points: ["derivative"],
      section_title: "考点 4 导数与零点",
      difficulty: null,
      source_ref: { pdf_page_index: 4, section_title: "考点 4 导数与零点" },
      review_meta: { warnings: ["missing_visual_context"] },
    },
  ],
};

writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`);

{
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", corpusPath, "--out", outputDir], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("candidate_tag_proposals.json"), true);
  assert.equal(result.stdout.includes("Items: 2"), true);
  assert.equal(result.stdout.includes("Needs visual: 1"), true);
  assert.equal(result.stdout.includes("切线斜率"), false);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);

  const proposals = JSON.parse(readFileSync(join(outputDir, "candidate_tag_proposals.json"), "utf8"));
  const summary = JSON.parse(readFileSync(join(outputDir, "tag_proposal_summary.json"), "utf8"));
  assert.equal(proposals.proposal_version, "practice-tag-proposal-v0");
  assert.equal(proposals.proposals.length, 2);
  assert.equal(summary.item_count, 2);
  assert.equal(summary.needs_visual_items, 1);
}

{
  const defaultOutRoot = join(tmpRoot, "default-out-root");
  mkdirSync(defaultOutRoot);
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", corpusPath], {
    encoding: "utf8",
    cwd: defaultOutRoot,
  });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(
    readFileSync(
      join(defaultOutRoot, "artifacts/rag/tag-proposals/candidate_tag_proposals.json"),
      "utf8",
    ),
  );
  assert.equal(output.proposals.length, 2);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Usage:"), true);
  assert.equal(result.stdout.includes("local sensitive artifact"), true);
}

{
  const result = spawnSync(process.execPath, [scriptPath], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--corpus requires a value"), true);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", join(tmpRoot, "missing.json")], {
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("practice corpus file not found"), true);
}

{
  const badJsonPath = join(tmpRoot, "bad.json");
  writeFileSync(badJsonPath, "{bad");
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", badJsonPath], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse practice corpus JSON"), true);
}

{
  const invalidPath = join(tmpRoot, "invalid.json");
  writeFileSync(invalidPath, JSON.stringify({ corpus_version: "practice-corpus-v0", items: "bad" }));
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", invalidPath], {
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("invalid practice corpus"), true);
  assert.equal(result.stderr.includes("切线斜率"), false);
}
```

- [ ] **Step 2: Run CLI test to verify it fails**

Run: `node scripts/tests/rag/practice-tag-proposal-cli.test.mjs`

Expected: FAIL with module-not-found for `build-practice-tag-proposals.mjs`.

- [ ] **Step 3: Implement proposal CLI**

Create `scripts/rag/build-practice-tag-proposals.mjs`:

```js
#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { validatePracticeCorpus } from "./practice-corpus-search-core.mjs";
import { buildTagProposals, summarizeTagProposals } from "./practice-tag-proposal-core.mjs";

class CliUsageError extends Error {}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.corpus) {
    throw new CliUsageError("--corpus requires a value");
  }

  const corpusPath = resolve(args.corpus);
  const outputDir = resolve(args.out ?? "artifacts/rag/tag-proposals");
  const corpusJson = await readJsonFile({
    filePath: corpusPath,
    missingMessage: "practice corpus file not found",
    parseMessage: "failed to parse practice corpus JSON",
  });
  const validation = validatePracticeCorpus(corpusJson);
  if (!validation.ok) {
    throw new Error(`invalid practice corpus: ${validation.errors.join(", ")}`);
  }

  const proposalArtifact = buildTagProposals({
    corpus: validation.corpus,
    sourceCorpusFile: formatLocalPath(corpusPath),
    generatedAt: new Date().toISOString(),
  });
  const summary = summarizeTagProposals(proposalArtifact);

  await mkdir(outputDir, { recursive: true });
  const proposalPath = resolve(outputDir, "candidate_tag_proposals.json");
  const summaryPath = resolve(outputDir, "tag_proposal_summary.json");
  await writeFile(proposalPath, `${JSON.stringify(proposalArtifact, null, 2)}\n`);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`Wrote ${proposalPath}`);
  console.log(`Wrote ${summaryPath}`);
  console.log(`Items: ${summary.item_count}`);
  console.log(`High confidence: ${summary.high_confidence_items}`);
  console.log(`Needs visual: ${summary.needs_visual_items}`);
  console.log(`Warnings: ${Object.values(summary.warning_distribution).reduce((sum, count) => sum + count, 0)}`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--corpus") {
      args.corpus = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--out") {
      args.out = readOptionValue(argv, index, arg);
      index += 1;
    } else {
      throw new CliUsageError(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new CliUsageError(`${optionName} requires a value`);
  }
  return value;
}

async function readJsonFile({ filePath, missingMessage, parseMessage }) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    throw new CliUsageError(`${missingMessage}: ${filePath}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(parseMessage);
  }
}

function formatLocalPath(filePath) {
  const relativePath = relative(process.cwd(), filePath);
  if (relativePath && !relativePath.startsWith("..")) {
    return relativePath;
  }
  return filePath;
}

function printHelp() {
  console.log(`Usage:
  node scripts/rag/build-practice-tag-proposals.mjs --corpus <practice_corpus.json> [--out <dir>]

Builds ignored local tag proposal artifacts from a practice corpus.
candidate_tag_proposals.json is a local sensitive artifact; do not commit or share it externally.`);
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error.message);
  process.exit(1);
});
```

- [ ] **Step 4: Run CLI test to verify it passes**

Run: `node scripts/tests/rag/practice-tag-proposal-cli.test.mjs`

Expected: PASS with exit code 0.

- [ ] **Step 5: Register new tests**

Modify `scripts/run-tests.mjs` and add these files after P2.1 RAG tests or near existing RAG tests:

```js
"scripts/tests/rag/practice-tag-taxonomy.test.mjs",
"scripts/tests/rag/practice-tag-proposal-core.test.mjs",
"scripts/tests/rag/practice-tag-proposal-cli.test.mjs",
```

- [ ] **Step 6: Run registered RAG tests**

Run:

```bash
node scripts/tests/rag/practice-tag-taxonomy.test.mjs
node scripts/tests/rag/practice-tag-proposal-core.test.mjs
node scripts/tests/rag/practice-tag-proposal-cli.test.mjs
```

Expected: all PASS with exit code 0.

- [ ] **Step 7: Commit Task 2**

```bash
git status --short
git add scripts/rag/build-practice-tag-proposals.mjs scripts/tests/rag/practice-tag-proposal-cli.test.mjs scripts/run-tests.mjs
git commit -m "feat: add tag proposal CLI"
```

Expected staged files: only the two Task 2 files plus `scripts/run-tests.mjs`.

---

### Task 3: Enriched Practice Corpus Builder

**Files:**
- Create: `scripts/rag/enriched-practice-corpus-core.mjs`
- Create: `scripts/rag/build-enriched-practice-corpus.mjs`
- Create: `scripts/tests/rag/enriched-practice-corpus-core.test.mjs`
- Create: `scripts/tests/rag/enriched-practice-corpus-cli.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes:
  - `validateTagProposalArtifact(value)` from `practice-tag-proposal-core.mjs`
  - practice corpus items validated by `validatePracticeCorpus(value)`
- Produces:
  - `buildEnrichedPracticeCorpus({ corpus, proposalArtifact, reviewRecords, acceptRuleProposals, sourceCorpusFile, sourceTagProposalFile, generatedAt }): EnrichedPracticeCorpus`
  - `validateEnrichedPracticeCorpus(value): { ok: true, corpus } | { ok: false, errors: string[] }`
  - `summarizeEnrichedPracticeCorpus(corpus): EnrichmentSummary`
  - CLI command:
    `node scripts/rag/build-enriched-practice-corpus.mjs --corpus <practice_corpus.json> --proposals <candidate_tag_proposals.json> [--review <review.json>] [--accept-rule-proposals] [--out <dir>]`

- [ ] **Step 1: Write failing enriched core tests**

Create `scripts/tests/rag/enriched-practice-corpus-core.test.mjs`:

```js
import assert from "node:assert/strict";

import {
  buildEnrichedPracticeCorpus,
  summarizeEnrichedPracticeCorpus,
  validateEnrichedPracticeCorpus,
} from "../../rag/enriched-practice-corpus-core.mjs";

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: null,
  item_count: 3,
  items: [
    {
      id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知函数在点处可导，求曲线切线斜率.",
      search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      difficulty: null,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
      review_meta: { has_manual_correction: true },
    },
    {
      id: "practice-candidate-2",
      source_candidate_id: "candidate-2",
      question_text: "2. 如图，判断零点个数.",
      search_text: "2. 如图，判断零点个数.\n导数",
      knowledge_points: ["derivative"],
      section_title: "考点 4 导数与零点",
      difficulty: null,
      source_ref: { pdf_page_index: 4, section_title: "考点 4 导数与零点" },
      review_meta: {},
    },
    {
      id: "practice-candidate-3",
      source_candidate_id: "candidate-3",
      question_text: "3. 计算函数值.",
      search_text: "3. 计算函数值.",
      knowledge_points: ["derivative"],
      section_title: null,
      difficulty: null,
      source_ref: null,
      review_meta: {},
    },
  ],
};

const proposalArtifact = {
  proposal_version: "practice-tag-proposal-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_corpus_file: "practice_corpus.json",
  source_corpus_version: "practice-corpus-v0",
  item_count: 3,
  proposals: [
    {
      item_id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      source_ref: corpus.items[0].source_ref,
      proposed_tags: {
        target_skills: [{ tag: "tangent_slope", confidence: "high", evidence_terms: ["切线"], source: "rule" }],
        method_tags: [{ tag: "tangent_slope", confidence: "high", evidence_terms: ["切线"], source: "rule" }],
        feature_flags: [],
      },
      warnings: [],
    },
    {
      item_id: "practice-candidate-2",
      source_candidate_id: "candidate-2",
      source_ref: corpus.items[1].source_ref,
      proposed_tags: {
        target_skills: [{ tag: "zero_point", confidence: "high", evidence_terms: ["零点"], source: "rule" }],
        method_tags: [{ tag: "zero_count", confidence: "high", evidence_terms: ["零点"], source: "rule" }],
        feature_flags: [{ tag: "needs_visual", confidence: "high", evidence_terms: ["如图"], source: "rule" }],
      },
      warnings: [],
    },
    {
      item_id: "practice-candidate-3",
      source_candidate_id: "candidate-3",
      source_ref: null,
      proposed_tags: {
        target_skills: [],
        method_tags: [],
        feature_flags: [],
      },
      warnings: ["no_tags_proposed"],
    },
  ],
};

{
  const enriched = buildEnrichedPracticeCorpus({
    corpus,
    proposalArtifact,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });

  assert.equal(enriched.corpus_version, "enriched-practice-corpus-v0");
  assert.equal(enriched.item_count, 3);
  assert.equal(enriched.items[0].question_text, corpus.items[0].question_text);
  assert.deepEqual(enriched.items[0].target_skills, ["tangent_slope"]);
  assert.equal(enriched.items[0].tag_review_meta.review_status, "proposed");
  assert.equal(enriched.items[0].tag_review_meta.tag_source, "rule");
  assert.equal("variant_level" in enriched.items[0], false);
  assert.equal(enriched.items[1].feature_flags.includes("needs_visual"), true);
  assert.equal(enriched.items[2].tag_review_meta.review_status, "needs_fix");
}

{
  const enriched = buildEnrichedPracticeCorpus({
    corpus,
    proposalArtifact,
    acceptRuleProposals: true,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  assert.equal(enriched.items[0].tag_review_meta.review_status, "approved");
  assert.equal(enriched.items[0].tag_review_meta.has_manual_tag_correction, false);
  assert.equal(enriched.items[2].tag_review_meta.review_status, "needs_fix");
}

{
  const reviewRecords = [
    {
      item_id: "practice-candidate-1",
      review_status: "approved",
      reviewed_tags: {
        target_skills: ["tangent_slope", "derivative_definition_limit"],
        method_tags: ["tangent_slope", "derivative_definition"],
        feature_flags: ["has_choice_options"],
      },
      review_notes: "人工补充极限式",
      has_manual_tag_correction: true,
      tag_source: "human",
    },
    {
      item_id: "practice-candidate-2",
      review_status: "skipped",
      reviewed_tags: {
        target_skills: ["zero_point"],
        method_tags: ["zero_count"],
        feature_flags: ["needs_visual"],
      },
      review_notes: "依赖图片",
      has_manual_tag_correction: false,
      tag_source: "human",
    },
  ];
  const enriched = buildEnrichedPracticeCorpus({
    corpus,
    proposalArtifact,
    reviewRecords,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  assert.deepEqual(enriched.items[0].target_skills, ["tangent_slope", "derivative_definition_limit"]);
  assert.equal(enriched.items[0].tag_review_meta.review_status, "approved");
  assert.equal(enriched.items[0].tag_review_meta.has_manual_tag_correction, true);
  assert.equal(enriched.items[0].tag_review_meta.tag_source, "human");
  assert.equal(enriched.items[1].tag_review_meta.review_status, "skipped");
}

{
  assert.throws(
    () =>
      buildEnrichedPracticeCorpus({
        corpus,
        proposalArtifact,
        reviewRecords: [
          {
            item_id: "practice-candidate-1",
            review_status: "approved",
            reviewed_tags: {
              target_skills: ["has_root"],
              method_tags: ["unknown_method"],
              feature_flags: ["has_root"],
            },
            has_manual_tag_correction: true,
            tag_source: "human",
          },
        ],
        sourceCorpusFile: "practice_corpus.json",
        sourceTagProposalFile: "candidate_tag_proposals.json",
        generatedAt: "2026-06-23T00:00:00.000Z",
      }),
    /invalid tag review records/,
  );
  assert.throws(
    () =>
      buildEnrichedPracticeCorpus({
        corpus,
        proposalArtifact,
        reviewRecords: [
          {
            item_id: "practice-candidate-1",
            review_status: "done",
            reviewed_tags: { target_skills: [], method_tags: [], feature_flags: [] },
            has_manual_tag_correction: false,
            tag_source: "robot",
          },
        ],
        sourceCorpusFile: "practice_corpus.json",
        sourceTagProposalFile: "candidate_tag_proposals.json",
        generatedAt: "2026-06-23T00:00:00.000Z",
      }),
    /invalid tag review records/,
  );
}

{
  const enriched = buildEnrichedPracticeCorpus({
    corpus,
    proposalArtifact,
    acceptRuleProposals: true,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  const validation = validateEnrichedPracticeCorpus(enriched);
  assert.equal(validation.ok, true);

  const invalid = structuredClone(enriched);
  invalid.corpus_version = "bad";
  invalid.items[0].target_skills = "bad";
  const invalidValidation = validateEnrichedPracticeCorpus(invalid);
  assert.equal(invalidValidation.ok, false);
  assert.equal(invalidValidation.errors.some((error) => error.includes("corpus_version")), true);
  assert.equal(invalidValidation.errors.some((error) => error.includes("target_skills")), true);
}

{
  const enriched = buildEnrichedPracticeCorpus({
    corpus,
    proposalArtifact,
    acceptRuleProposals: true,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  const summary = summarizeEnrichedPracticeCorpus(enriched);
  assert.equal(summary.corpus_version, "enriched-practice-corpus-v0");
  assert.equal(summary.item_count, 3);
  assert.equal(summary.approved_items, 2);
  assert.equal(summary.needs_fix_items, 1);
  assert.equal(summary.needs_visual_items, 1);
  assert.equal(summary.target_skill_distribution.tangent_slope, 1);
}
```

- [ ] **Step 2: Run enriched core test to verify it fails**

Run: `node scripts/tests/rag/enriched-practice-corpus-core.test.mjs`

Expected: FAIL with module-not-found for `enriched-practice-corpus-core.mjs`.

- [ ] **Step 3: Implement enriched corpus core**

Create `scripts/rag/enriched-practice-corpus-core.mjs`. Implement exactly these exported functions:

```js
import {
  FEATURE_FLAG_DISPLAY_NAMES,
  METHOD_TAG_DISPLAY_NAMES,
  TARGET_SKILL_DISPLAY_NAMES,
} from "./practice-tag-taxonomy.mjs";

const ENRICHED_CORPUS_VERSION = "enriched-practice-corpus-v0";
const REVIEW_STATUS_VALUES = new Set(["proposed", "approved", "needs_fix", "skipped"]);
const TAG_SOURCE_VALUES = new Set(["rule", "human", "llm"]);
const TARGET_SKILL_KEYS = new Set(Object.keys(TARGET_SKILL_DISPLAY_NAMES));
const METHOD_TAG_KEYS = new Set(Object.keys(METHOD_TAG_DISPLAY_NAMES));
const FEATURE_FLAG_KEYS = new Set(Object.keys(FEATURE_FLAG_DISPLAY_NAMES));

export function buildEnrichedPracticeCorpus({
  corpus,
  proposalArtifact,
  reviewRecords = [],
  acceptRuleProposals = false,
  sourceCorpusFile,
  sourceTagProposalFile,
  generatedAt,
}) {
  const reviewErrors = validateReviewRecords(reviewRecords);
  if (reviewErrors.length > 0) {
    throw new Error(`invalid tag review records: ${reviewErrors.join(", ")}`);
  }
  const proposalsByItemId = new Map((proposalArtifact?.proposals ?? []).map((proposal) => [proposal.item_id, proposal]));
  const reviewsByItemId = new Map(reviewRecords.map((record) => [record.item_id, record]));
  const items = (corpus?.items ?? []).map((item) => {
    const proposal = proposalsByItemId.get(item.id);
    const reviewRecord = reviewsByItemId.get(item.id);
    const tagData = buildItemTagData({ proposal, reviewRecord, acceptRuleProposals });
    return {
      ...item,
      target_skills: tagData.target_skills,
      method_tags: tagData.method_tags,
      feature_flags: tagData.feature_flags,
      tag_review_meta: tagData.tag_review_meta,
    };
  });
  return {
    corpus_version: ENRICHED_CORPUS_VERSION,
    generated_at: generatedAt,
    source_corpus_file: sourceCorpusFile,
    source_tag_proposal_file: sourceTagProposalFile,
    item_count: items.length,
    items,
  };
}

export function summarizeEnrichedPracticeCorpus(corpus) {
  const summary = {
    corpus_version: corpus?.corpus_version ?? null,
    item_count: Array.isArray(corpus?.items) ? corpus.items.length : 0,
    approved_items: 0,
    proposed_items: 0,
    needs_fix_items: 0,
    skipped_items: 0,
    needs_visual_items: 0,
    target_skill_distribution: {},
    method_tag_distribution: {},
    feature_flag_distribution: {},
  };
  for (const item of corpus?.items ?? []) {
    const status = item.tag_review_meta?.review_status;
    if (status === "approved") summary.approved_items += 1;
    if (status === "proposed") summary.proposed_items += 1;
    if (status === "needs_fix") summary.needs_fix_items += 1;
    if (status === "skipped") summary.skipped_items += 1;
    if (item.feature_flags?.includes("needs_visual")) summary.needs_visual_items += 1;
    countValues(summary.target_skill_distribution, item.target_skills);
    countValues(summary.method_tag_distribution, item.method_tags);
    countValues(summary.feature_flag_distribution, item.feature_flags);
  }
  return summary;
}

export function validateEnrichedPracticeCorpus(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["enriched corpus must be an object"] };
  }
  if (value.corpus_version !== ENRICHED_CORPUS_VERSION) {
    errors.push(`corpus_version must be ${ENRICHED_CORPUS_VERSION}`);
  }
  if (!Array.isArray(value.items)) {
    errors.push("items must be an array");
  } else {
    value.items.forEach((item, index) => validateEnrichedItem(item, index, errors));
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, corpus: value };
}
```

In the same file, implement local helpers:

```js
function validateReviewRecords(records) {
  const errors = [];
  if (!Array.isArray(records)) {
    return ["review records must be an array"];
  }
  records.forEach((record, index) => {
    const path = `reviewRecords[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`${path} must be an object`);
      return;
    }
    if (typeof record.item_id !== "string" || !record.item_id.trim()) {
      errors.push(`${path}.item_id must be a non-empty string`);
    }
    if (!REVIEW_STATUS_VALUES.has(record.review_status)) {
      errors.push(`${path}.review_status is invalid`);
    }
    if (!TAG_SOURCE_VALUES.has(record.tag_source ?? "human")) {
      errors.push(`${path}.tag_source is invalid`);
    }
    validateKnownTags(record.reviewed_tags?.target_skills, TARGET_SKILL_KEYS, `${path}.reviewed_tags.target_skills`, errors);
    validateKnownTags(record.reviewed_tags?.method_tags, METHOD_TAG_KEYS, `${path}.reviewed_tags.method_tags`, errors);
    validateKnownTags(record.reviewed_tags?.feature_flags, FEATURE_FLAG_KEYS, `${path}.reviewed_tags.feature_flags`, errors);
  });
  return errors;
}

function validateKnownTags(values, allowedValues, path, errors) {
  for (const value of uniqueStrings(values)) {
    if (!allowedValues.has(value)) {
      errors.push(`${path} contains unknown tag: ${value}`);
    }
  }
}

function buildItemTagData({ proposal, reviewRecord, acceptRuleProposals }) {
  if (reviewRecord) {
    return {
      target_skills: uniqueStrings(reviewRecord.reviewed_tags?.target_skills),
      method_tags: uniqueStrings(reviewRecord.reviewed_tags?.method_tags),
      feature_flags: uniqueStrings(reviewRecord.reviewed_tags?.feature_flags),
      tag_review_meta: {
        review_status: reviewRecord.review_status,
        proposal_confidence: summarizeProposalConfidence(proposal),
        has_manual_tag_correction: Boolean(reviewRecord.has_manual_tag_correction),
        tag_source: reviewRecord.tag_source ?? "human",
      },
    };
  }

  const targetSkills = extractProposalTagKeys(proposal?.proposed_tags?.target_skills);
  const methodTags = extractProposalTagKeys(proposal?.proposed_tags?.method_tags);
  const featureFlags = extractProposalTagKeys(proposal?.proposed_tags?.feature_flags);
  const hasNoTags = targetSkills.length === 0 && methodTags.length === 0 && featureFlags.length === 0;
  return {
    target_skills: targetSkills,
    method_tags: methodTags,
    feature_flags: featureFlags,
    tag_review_meta: {
      review_status: hasNoTags ? "needs_fix" : acceptRuleProposals ? "approved" : "proposed",
      proposal_confidence: summarizeProposalConfidence(proposal),
      has_manual_tag_correction: false,
      tag_source: "rule",
    },
  };
}

function extractProposalTagKeys(tags = []) {
  return uniqueStrings(tags.map((tag) => tag.tag));
}

function summarizeProposalConfidence(proposal) {
  const tags = [
    ...(proposal?.proposed_tags?.target_skills ?? []),
    ...(proposal?.proposed_tags?.method_tags ?? []),
    ...(proposal?.proposed_tags?.feature_flags ?? []),
  ];
  if (tags.some((tag) => tag.confidence === "high")) return "high";
  if (tags.some((tag) => tag.confidence === "medium")) return "medium";
  if (tags.some((tag) => tag.confidence === "low")) return "low";
  return "low";
}

function uniqueStrings(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))]
    : [];
}

function countValues(target, values = []) {
  for (const value of values) {
    target[value] = (target[value] ?? 0) + 1;
  }
}

function validateEnrichedItem(item, index, errors) {
  const path = `items[${index}]`;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    errors.push(`${path} must be an object`);
    return;
  }
  requireString(item, "id", errors, path);
  requireString(item, "question_text", errors, path);
  requireStringArray(item.target_skills, `${path}.target_skills`, errors);
  requireStringArray(item.method_tags, `${path}.method_tags`, errors);
  requireStringArray(item.feature_flags, `${path}.feature_flags`, errors);
  if (!item.tag_review_meta || typeof item.tag_review_meta !== "object") {
    errors.push(`${path}.tag_review_meta must be an object`);
  } else {
    if (!REVIEW_STATUS_VALUES.has(item.tag_review_meta.review_status)) {
      errors.push(`${path}.tag_review_meta.review_status is invalid`);
    }
    if (!TAG_SOURCE_VALUES.has(item.tag_review_meta.tag_source)) {
      errors.push(`${path}.tag_review_meta.tag_source is invalid`);
    }
  }
  if ("variant_level" in item) {
    errors.push(`${path}.variant_level must not be present`);
  }
}

function requireString(item, key, errors, path) {
  if (typeof item[key] !== "string") {
    errors.push(`${path}.${key} must be a string`);
  }
}

function requireStringArray(value, path, errors) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    errors.push(`${path} must be an array of strings`);
  }
}
```

- [ ] **Step 4: Run enriched core test to verify it passes**

Run: `node scripts/tests/rag/enriched-practice-corpus-core.test.mjs`

Expected: PASS with exit code 0.

- [ ] **Step 5: Write failing enriched CLI tests**

Create `scripts/tests/rag/enriched-practice-corpus-cli.test.mjs`:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = join(process.cwd(), "scripts/rag/build-enriched-practice-corpus.mjs");
const tmpRoot = mkdtempSync(join(tmpdir(), "enriched-practice-corpus-"));
const corpusPath = join(tmpRoot, "practice_corpus.json");
const proposalPath = join(tmpRoot, "candidate_tag_proposals.json");
const reviewPath = join(tmpRoot, "tag_review.json");
const outputDir = join(tmpRoot, "out");

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: null,
  item_count: 1,
  items: [
    {
      id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知函数在点处可导，求曲线切线斜率.",
      search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      difficulty: null,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
      review_meta: {},
    },
  ],
};

const proposals = {
  proposal_version: "practice-tag-proposal-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_corpus_file: "practice_corpus.json",
  source_corpus_version: "practice-corpus-v0",
  item_count: 1,
  proposals: [
    {
      item_id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      source_ref: corpus.items[0].source_ref,
      proposed_tags: {
        target_skills: [{ tag: "tangent_slope", confidence: "high", evidence_terms: ["切线"], source: "rule" }],
        method_tags: [{ tag: "tangent_slope", confidence: "high", evidence_terms: ["切线"], source: "rule" }],
        feature_flags: [],
      },
      warnings: [],
    },
  ],
};

const reviewRecords = [
  {
    item_id: "practice-candidate-1",
    review_status: "approved",
    reviewed_tags: {
      target_skills: ["tangent_slope", "derivative_definition_limit"],
      method_tags: ["tangent_slope", "derivative_definition"],
      feature_flags: ["has_choice_options"],
    },
    review_notes: "",
    has_manual_tag_correction: true,
    tag_source: "human",
  },
];

writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`);
writeFileSync(proposalPath, `${JSON.stringify(proposals, null, 2)}\n`);
writeFileSync(reviewPath, `${JSON.stringify(reviewRecords, null, 2)}\n`);

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--proposals", proposalPath, "--review", reviewPath, "--out", outputDir],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("enriched_practice_corpus.json"), true);
  assert.equal(result.stdout.includes("Items: 1"), true);
  assert.equal(result.stdout.includes("Approved: 1"), true);
  assert.equal(result.stdout.includes("切线斜率"), false);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);

  const enriched = JSON.parse(readFileSync(join(outputDir, "enriched_practice_corpus.json"), "utf8"));
  const summary = JSON.parse(readFileSync(join(outputDir, "enrichment_summary.json"), "utf8"));
  assert.equal(enriched.corpus_version, "enriched-practice-corpus-v0");
  assert.deepEqual(enriched.items[0].target_skills, ["tangent_slope", "derivative_definition_limit"]);
  assert.equal(enriched.items[0].tag_review_meta.tag_source, "human");
  assert.equal(summary.approved_items, 1);
}

{
  const defaultOutRoot = join(tmpRoot, "default-out-root");
  mkdirSync(defaultOutRoot);
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--proposals", proposalPath, "--accept-rule-proposals"],
    { encoding: "utf8", cwd: defaultOutRoot },
  );

  assert.equal(result.status, 0, result.stderr);
  const enriched = JSON.parse(
    readFileSync(
      join(defaultOutRoot, "artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json"),
      "utf8",
    ),
  );
  assert.equal(enriched.items[0].tag_review_meta.review_status, "approved");
}

{
  const draftOut = join(tmpRoot, "draft-out");
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--proposals", proposalPath, "--out", draftOut],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const enriched = JSON.parse(readFileSync(join(draftOut, "enriched_practice_corpus.json"), "utf8"));
  assert.equal(enriched.items[0].tag_review_meta.review_status, "proposed");
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Usage:"), true);
  assert.equal(result.stdout.includes("local sensitive artifact"), true);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--corpus", corpusPath], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("--proposals requires a value"), true);
}

{
  const badProposalPath = join(tmpRoot, "bad-proposal.json");
  writeFileSync(badProposalPath, "{bad");
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--proposals", badProposalPath],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse tag proposal JSON"), true);
}
```

- [ ] **Step 6: Run enriched CLI test to verify it fails**

Run: `node scripts/tests/rag/enriched-practice-corpus-cli.test.mjs`

Expected: FAIL with module-not-found for `build-enriched-practice-corpus.mjs`.

- [ ] **Step 7: Implement enriched corpus CLI**

Create `scripts/rag/build-enriched-practice-corpus.mjs`. Mirror existing CLI style from `build-practice-corpus.mjs`, with these details:

```js
#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { validatePracticeCorpus } from "./practice-corpus-search-core.mjs";
import { validateTagProposalArtifact } from "./practice-tag-proposal-core.mjs";
import {
  buildEnrichedPracticeCorpus,
  summarizeEnrichedPracticeCorpus,
  validateEnrichedPracticeCorpus,
} from "./enriched-practice-corpus-core.mjs";

class CliUsageError extends Error {}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.corpus) throw new CliUsageError("--corpus requires a value");
  if (!args.proposals) throw new CliUsageError("--proposals requires a value");

  const corpusPath = resolve(args.corpus);
  const proposalPath = resolve(args.proposals);
  const outputDir = resolve(args.out ?? "artifacts/rag/enriched-practice-corpus");

  const corpusJson = await readJsonFile({
    filePath: corpusPath,
    missingMessage: "practice corpus file not found",
    parseMessage: "failed to parse practice corpus JSON",
  });
  const corpusValidation = validatePracticeCorpus(corpusJson);
  if (!corpusValidation.ok) throw new Error(`invalid practice corpus: ${corpusValidation.errors.join(", ")}`);

  const proposalJson = await readJsonFile({
    filePath: proposalPath,
    missingMessage: "tag proposal file not found",
    parseMessage: "failed to parse tag proposal JSON",
  });
  const proposalValidation = validateTagProposalArtifact(proposalJson);
  if (!proposalValidation.ok) throw new Error(`invalid tag proposal artifact: ${proposalValidation.errors.join(", ")}`);

  const reviewRecords = args.review
    ? await readJsonFile({
        filePath: resolve(args.review),
        missingMessage: "tag review file not found",
        parseMessage: "failed to parse tag review JSON",
      })
    : [];
  if (!Array.isArray(reviewRecords)) throw new Error("tag review JSON must be an array");

  const enriched = buildEnrichedPracticeCorpus({
    corpus: corpusValidation.corpus,
    proposalArtifact: proposalValidation.proposalArtifact,
    reviewRecords,
    acceptRuleProposals: Boolean(args.acceptRuleProposals),
    sourceCorpusFile: formatLocalPath(corpusPath),
    sourceTagProposalFile: formatLocalPath(proposalPath),
    generatedAt: new Date().toISOString(),
  });
  const enrichedValidation = validateEnrichedPracticeCorpus(enriched);
  if (!enrichedValidation.ok) throw new Error(`invalid enriched practice corpus: ${enrichedValidation.errors.join(", ")}`);

  const summary = summarizeEnrichedPracticeCorpus(enriched);
  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, "enriched_practice_corpus.json");
  const summaryPath = resolve(outputDir, "enrichment_summary.json");
  await writeFile(outputPath, `${JSON.stringify(enriched, null, 2)}\n`);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`Wrote ${outputPath}`);
  console.log(`Wrote ${summaryPath}`);
  console.log(`Items: ${summary.item_count}`);
  console.log(`Approved: ${summary.approved_items}`);
  console.log(`Proposed: ${summary.proposed_items}`);
  console.log(`Needs fix: ${summary.needs_fix_items}`);
  console.log(`Needs visual: ${summary.needs_visual_items}`);
}
```

Also implement local helpers `parseArgs`, `readOptionValue`, `readJsonFile`, `formatLocalPath`, and `printHelp`. `parseArgs` must support `--corpus`, `--proposals`, `--review`, `--accept-rule-proposals`, `--out`, `--help`, and unknown-argument errors. `printHelp` must mention that `enriched_practice_corpus.json` is a local sensitive artifact and should not be committed or shared externally.

- [ ] **Step 8: Run enriched CLI test to verify it passes**

Run: `node scripts/tests/rag/enriched-practice-corpus-cli.test.mjs`

Expected: PASS with exit code 0.

- [ ] **Step 9: Register enriched tests**

Modify `scripts/run-tests.mjs` and add:

```js
"scripts/tests/rag/enriched-practice-corpus-core.test.mjs",
"scripts/tests/rag/enriched-practice-corpus-cli.test.mjs",
```

- [ ] **Step 10: Run Task 3 tests**

Run:

```bash
node scripts/tests/rag/enriched-practice-corpus-core.test.mjs
node scripts/tests/rag/enriched-practice-corpus-cli.test.mjs
```

Expected: both PASS with exit code 0.

- [ ] **Step 11: Commit Task 3**

```bash
git status --short
git add scripts/rag/enriched-practice-corpus-core.mjs scripts/rag/build-enriched-practice-corpus.mjs scripts/tests/rag/enriched-practice-corpus-core.test.mjs scripts/tests/rag/enriched-practice-corpus-cli.test.mjs scripts/run-tests.mjs
git commit -m "feat: build enriched practice corpus"
```

Expected staged files: only Task 3 files plus `scripts/run-tests.mjs`.

---

### Task 4: Enriched Corpus Search And Variant Practice Agent Upgrade

**Files:**
- Modify: `scripts/rag/practice-corpus-search-core.mjs`
- Modify: `scripts/rag/variant-practice-agent-core.mjs`
- Modify: `scripts/tests/rag/practice-corpus-search-core.test.mjs`
- Modify: `scripts/tests/rag/variant-practice-agent-core.test.mjs`
- Modify: `scripts/tests/rag/variant-practice-agent-cli.test.mjs`

**Interfaces:**
- Consumes:
  - `normalizeTargetSkillKeys(skills)`
  - `deriveMethodTagsFromTargetSkills(targetSkills)`
  - enriched corpus item fields `target_skills`, `method_tags`, `feature_flags`, `tag_review_meta`
- Produces:
  - `validatePracticeCorpus(value)` accepts `practice-corpus-v0` and `enriched-practice-corpus-v0`.
  - `normalizePracticeQuery(query)` additionally returns:
    - `target_skill_keys: string[]`
    - `method_tags: string[]`
  - `searchPracticeCorpus({ corpus, query, limit, includeVisual = false })` skips `needs_visual` unless `includeVisual` is true.
  - Agent emits specific warnings:
    - `no_candidates_found`
    - `insufficient_approved_tagged_items`
    - `no_mixed_application_with_related_method_tags`
    - `skipped_visual_dependency_items`

- [ ] **Step 1: Extend failing search core tests**

Modify `scripts/tests/rag/practice-corpus-search-core.test.mjs` to add a new block with synthetic enriched corpus:

```js
const enrichedCorpus = {
  corpus_version: "enriched-practice-corpus-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_corpus_file: "practice_corpus.json",
  source_tag_proposal_file: "candidate_tag_proposals.json",
  item_count: 6,
  items: [
    {
      id: "practice-enriched-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知函数在点处可导，求曲线切线斜率.",
      search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      target_skills: ["tangent_slope"],
      method_tags: ["tangent_slope", "derivative_definition"],
      feature_flags: [],
      difficulty: null,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
      tag_review_meta: { review_status: "approved", proposal_confidence: "high", has_manual_tag_correction: false, tag_source: "rule" },
      review_meta: {},
    },
    {
      id: "practice-enriched-2",
      source_candidate_id: "candidate-2",
      question_text: "2. 讨论函数单调性并求参数范围.",
      search_text: "2. 讨论函数单调性并求参数范围.\n导数",
      knowledge_points: ["derivative"],
      section_title: "考点 2 导数与函数的单调性",
      target_skills: ["monotonicity", "parameter_range"],
      method_tags: ["derivative_definition", "monotonicity_by_derivative", "parameter_classification"],
      feature_flags: ["has_parameter"],
      difficulty: null,
      source_ref: { pdf_page_index: 2, section_title: "考点 2 导数与函数的单调性" },
      tag_review_meta: { review_status: "approved", proposal_confidence: "high", has_manual_tag_correction: false, tag_source: "rule" },
      review_meta: {},
    },
    {
      id: "practice-enriched-3",
      source_candidate_id: "candidate-3",
      question_text: "3. 如图判断零点个数.",
      search_text: "3. 如图判断零点个数.\n导数",
      knowledge_points: ["derivative"],
      section_title: "考点 4 导数与零点",
      target_skills: ["zero_point"],
      method_tags: ["zero_count"],
      feature_flags: ["needs_visual", "has_graph"],
      difficulty: null,
      source_ref: { pdf_page_index: 4, section_title: "考点 4 导数与零点" },
      tag_review_meta: { review_status: "approved", proposal_confidence: "high", has_manual_tag_correction: false, tag_source: "rule" },
      review_meta: {},
    },
    {
      id: "practice-enriched-4",
      source_candidate_id: "candidate-4",
      question_text: "4. 未审核导数题.",
      search_text: "4. 未审核导数题.",
      knowledge_points: ["derivative"],
      section_title: "考点 5 综合应用",
      target_skills: ["tangent_slope"],
      method_tags: ["tangent_slope"],
      feature_flags: [],
      difficulty: null,
      source_ref: { pdf_page_index: 5, section_title: "考点 5 综合应用" },
      tag_review_meta: { review_status: "needs_fix", proposal_confidence: "low", has_manual_tag_correction: false, tag_source: "rule" },
      review_meta: {},
    },
    {
      id: "practice-enriched-5",
      source_candidate_id: "candidate-5",
      question_text: "5. draft 导数题.",
      search_text: "5. draft 导数题.\n导数",
      knowledge_points: ["derivative"],
      section_title: "考点 5 综合应用",
      target_skills: ["tangent_slope"],
      method_tags: ["tangent_slope"],
      feature_flags: [],
      difficulty: null,
      source_ref: { pdf_page_index: 5, section_title: "考点 5 综合应用" },
      tag_review_meta: { review_status: "proposed", proposal_confidence: "high", has_manual_tag_correction: false, tag_source: "rule" },
      review_meta: {},
    },
    {
      id: "practice-enriched-6",
      source_candidate_id: "candidate-6",
      question_text: "6. skipped 导数题.",
      search_text: "6. skipped 导数题.\n导数",
      knowledge_points: ["derivative"],
      section_title: "考点 6 综合应用",
      target_skills: ["tangent_slope"],
      method_tags: ["tangent_slope"],
      feature_flags: [],
      difficulty: null,
      source_ref: { pdf_page_index: 6, section_title: "考点 6 综合应用" },
      tag_review_meta: { review_status: "skipped", proposal_confidence: "high", has_manual_tag_correction: false, tag_source: "human" },
      review_meta: {},
    },
  ],
};

{
  const validation = validatePracticeCorpus(enrichedCorpus);
  assert.equal(validation.ok, true);

  const need = normalizePracticeQuery({
    id: "query-enriched",
    question_text: "求切线斜率",
    knowledge_points: ["derivative"],
    section_title: "考点 1 导数的概念",
    target_skills: ["切线斜率", "极限式识别导数"],
  });
  assert.deepEqual(need.target_skill_keys, ["tangent_slope", "derivative_definition_limit"]);
  assert.deepEqual(need.method_tags, ["tangent_slope", "derivative_definition"]);

  const results = searchPracticeCorpus({ corpus: enrichedCorpus, query: need, limit: 10 });
  assert.equal(results.some((candidate) => candidate.item.id === "practice-enriched-3"), false);
  assert.equal(results.some((candidate) => candidate.item.id === "practice-enriched-4"), false);
  assert.equal(results.some((candidate) => candidate.item.id === "practice-enriched-5"), false);
  assert.equal(results.some((candidate) => candidate.item.id === "practice-enriched-6"), false);
  assert.equal(results[0].matched_dimensions.includes("target_skill"), true);
  assert.equal(results[0].matched_dimensions.includes("method_tag"), true);

  const includeVisualResults = searchPracticeCorpus({
    corpus: enrichedCorpus,
    query: { ...need, target_skills: ["零点"] },
    limit: 10,
    includeVisual: true,
  });
  assert.equal(includeVisualResults.some((candidate) => candidate.item.id === "practice-enriched-3"), true);
}
```

- [ ] **Step 2: Run search test to verify it fails**

Run: `node scripts/tests/rag/practice-corpus-search-core.test.mjs`

Expected: FAIL because `enriched-practice-corpus-v0`, `target_skill_keys`, `method_tags`, and `needs_visual` skip are not yet implemented.

- [ ] **Step 3: Upgrade search core**

Modify `scripts/rag/practice-corpus-search-core.mjs`:

- Import:

```js
import {
  deriveMethodTagsFromTargetSkills,
  normalizeTargetSkillKeys,
} from "./practice-tag-taxonomy.mjs";
```

- Change corpus validation to accept:

```js
const SUPPORTED_CORPUS_VERSIONS = new Set(["practice-corpus-v0", "enriched-practice-corpus-v0"]);
```

- In `normalizePracticeQuery(query)`, add:

```js
const targetSkillKeys = normalizeTargetSkillKeys(targetSkills);
const methodTags = deriveMethodTagsFromTargetSkills(targetSkills);
```

and return:

```js
target_skill_keys: targetSkillKeys,
method_tags: methodTags,
```

- Change `searchPracticeCorpus` signature:

```js
export function searchPracticeCorpus({ corpus, query, limit = DEFAULT_LIMIT, includeVisual = false }) {
```

- Before scoring, filter items:

```js
.filter((item) => includeVisual || !hasFeatureFlag(item, "needs_visual"))
.filter((item) => isApprovedOrLegacyCorpusItem(item, corpus.corpus_version))
```

- In `scoreCorpusItem`, add enriched metadata scoring:

```js
const itemTargetSkills = filterStringArray(item.target_skills);
const targetSkillMatches = need.target_skill_keys.filter((skill) => itemTargetSkills.includes(skill));
if (targetSkillMatches.length > 0) {
  score += 7 * targetSkillMatches.length;
  matchedDimensions.push("target_skill");
  matchReasons.push(`命中目标技能标签：${targetSkillMatches.join(", ")}`);
}

const itemMethodTags = filterStringArray(item.method_tags);
const methodTagMatches = need.method_tags.filter((tag) => itemMethodTags.includes(tag));
if (methodTagMatches.length > 0) {
  score += 5 * methodTagMatches.length;
  matchedDimensions.push("method_tag");
  matchReasons.push(`命中方法标签：${methodTagMatches.join(", ")}`);
}
```

- Keep legacy text-based target skill matching for `practice-corpus-v0`, but avoid double-counting enriched tag matches:

```js
if (itemTargetSkills.length === 0) {
  for (const skill of need.target_skills) {
    // existing text matching branch
  }
}
```

- Add helpers:

```js
function hasFeatureFlag(item, flag) {
  // Legacy practice-corpus-v0 items do not have feature_flags, so this returns false for them.
  return filterStringArray(item.feature_flags).includes(flag);
}

function isApprovedOrLegacyCorpusItem(item, corpusVersion) {
  if (corpusVersion !== "enriched-practice-corpus-v0") return true;
  return item.tag_review_meta?.review_status === "approved";
}
```

- Extend `validateCorpusItem` for enriched items:

```js
if (item.target_skills !== undefined) requireStringArray(item.target_skills, `${path}.target_skills`, errors);
if (item.method_tags !== undefined) requireStringArray(item.method_tags, `${path}.method_tags`, errors);
if (item.feature_flags !== undefined) requireStringArray(item.feature_flags, `${path}.feature_flags`, errors);
```

- [ ] **Step 4: Run search test to verify it passes**

Run: `node scripts/tests/rag/practice-corpus-search-core.test.mjs`

Expected: PASS with exit code 0.

- [ ] **Step 5: Extend failing Agent core tests**

Modify `scripts/tests/rag/variant-practice-agent-core.test.mjs` and add a synthetic enriched corpus case:

```js
{
  const enrichedCorpus = {
    corpus_version: "enriched-practice-corpus-v0",
    generated_at: "2026-06-23T00:00:00.000Z",
    source_corpus_file: "practice_corpus.json",
    source_tag_proposal_file: "candidate_tag_proposals.json",
    item_count: 4,
    items: [
      buildEnrichedTestItem({
        id: "foundation",
        section_title: "考点 1 导数的概念",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope", "derivative_definition"],
      }),
      buildEnrichedTestItem({
        id: "near-transfer",
        section_title: "考点 2 导数与函数的单调性",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope", "derivative_definition"],
      }),
      buildEnrichedTestItem({
        id: "mixed-application",
        section_title: "考点 3 导数综合应用",
        target_skills: ["monotonicity"],
        method_tags: ["derivative_definition", "monotonicity_by_derivative"],
      }),
      buildEnrichedTestItem({
        id: "visual-skip",
        section_title: "考点 4 导数与零点",
        target_skills: ["zero_point"],
        method_tags: ["zero_count"],
        feature_flags: ["needs_visual"],
      }),
    ],
  };

  const result = recommendVariantPractice({
    corpus: enrichedCorpus,
    query: {
      id: "query-enriched-agent",
      question_text: "求切线斜率",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      target_skills: ["切线斜率", "极限式识别导数"],
      mistake_causes: ["derivative_definition_confusion"],
    },
    searchLimit: 10,
  });

  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.recommendation_type),
    ["foundation", "near_transfer", "mixed_application"],
  );
  assert.equal(result.recommendations.some((recommendation) => recommendation.item_id === "visual-skip"), false);
  assert.equal(result.warnings.includes("skipped_visual_dependency_items"), true);
  assert.equal(result.warnings.includes("insufficient_recommendations"), false);
}

{
  const insufficientCorpus = {
    corpus_version: "enriched-practice-corpus-v0",
    generated_at: "2026-06-23T00:00:00.000Z",
    source_corpus_file: "practice_corpus.json",
    source_tag_proposal_file: "candidate_tag_proposals.json",
    item_count: 2,
    items: [
      buildEnrichedTestItem({
        id: "foundation-only",
        section_title: "考点 1 导数的概念",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
      }),
      buildEnrichedTestItem({
        id: "near-only",
        section_title: "考点 2 导数与函数的单调性",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
      }),
    ],
  };

  const result = recommendVariantPractice({
    corpus: insufficientCorpus,
    query: {
      id: "query-insufficient",
      question_text: "求切线斜率",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      target_skills: ["切线斜率"],
    },
    searchLimit: 10,
  });

  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.recommendation_type),
    ["foundation", "near_transfer"],
  );
  assert.equal(result.warnings.includes("no_mixed_application_with_related_method_tags"), true);
  assert.equal(result.warnings.includes("insufficient_approved_tagged_items"), true);
}

{
  const noCandidateCorpus = {
    corpus_version: "enriched-practice-corpus-v0",
    generated_at: "2026-06-23T00:00:00.000Z",
    source_corpus_file: "practice_corpus.json",
    source_tag_proposal_file: "candidate_tag_proposals.json",
    item_count: 2,
    items: [
      buildEnrichedTestItem({
        id: "visual-only",
        section_title: "考点 4 导数与零点",
        target_skills: ["zero_point"],
        method_tags: ["zero_count"],
        feature_flags: ["needs_visual"],
      }),
      {
        ...buildEnrichedTestItem({
          id: "needs-fix-only",
          section_title: "考点 5 综合应用",
          target_skills: ["tangent_slope"],
          method_tags: ["tangent_slope"],
        }),
        tag_review_meta: {
          review_status: "needs_fix",
          proposal_confidence: "low",
          has_manual_tag_correction: false,
          tag_source: "rule",
        },
      },
    ],
  };

  const result = recommendVariantPractice({
    corpus: noCandidateCorpus,
    query: {
      id: "query-no-candidate",
      question_text: "求切线斜率",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      target_skills: ["切线斜率"],
    },
    searchLimit: 10,
  });

  assert.deepEqual(result.recommendations, []);
  assert.equal(result.warnings.includes("no_candidates_found"), true);
  assert.equal(result.warnings.includes("skipped_visual_dependency_items"), true);
  assert.equal(result.warnings.includes("insufficient_approved_tagged_items"), false);
  assert.equal(result.warnings.includes("no_mixed_application_with_related_method_tags"), false);
}
```

Add this helper at the bottom of the test file:

```js
function buildEnrichedTestItem({
  id,
  section_title,
  target_skills,
  method_tags,
  feature_flags = [],
}) {
  return {
    id,
    source_candidate_id: id,
    question_text: `${id} synthetic derivative question`,
    search_text: `${id} synthetic derivative question\n导数\n${section_title}`,
    knowledge_points: ["derivative"],
    section_title,
    target_skills,
    method_tags,
    feature_flags,
    difficulty: null,
    source_ref: { pdf_page_index: 1, section_title },
    tag_review_meta: {
      review_status: "approved",
      proposal_confidence: "high",
      has_manual_tag_correction: false,
      tag_source: "rule",
    },
    review_meta: {},
  };
}
```

- [ ] **Step 6: Run Agent core test to verify it fails**

Run: `node scripts/tests/rag/variant-practice-agent-core.test.mjs`

Expected: FAIL because `mixed_application` and warning logic still use P2.1 text-only rules.

- [ ] **Step 7: Upgrade Agent core**

Modify `scripts/rag/variant-practice-agent-core.mjs`:

- Keep legacy behavior working for `practice-corpus-v0`.
- Update `isNearTransferCandidate`:

```js
function isNearTransferCandidate(candidate, need) {
  return (
    candidate.item.section_title !== need.section_title &&
    candidate.matched_dimensions.includes("knowledge_point") &&
    candidate.matched_dimensions.includes("target_skill")
  );
}
```

- Update `isMixedApplicationCandidate`:

```js
function isMixedApplicationCandidate(candidate, need) {
  if (candidate.item.section_title === need.section_title) return false;
  if (!candidate.matched_dimensions.includes("knowledge_point")) return false;
  if (candidate.matched_dimensions.includes("target_skill")) return false;
  if (candidate.matched_dimensions.includes("method_tag")) return true;
  return !hasEnrichedTags(candidate.item);
}
```

- Add helper:

```js
function hasEnrichedTags(item) {
  return (
    Array.isArray(item.target_skills) ||
    Array.isArray(item.method_tags) ||
    Array.isArray(item.feature_flags)
  );
}
```

- Update warnings:

```js
function buildWarnings({ corpus, candidates, recommendations }) {
  const warnings = [];
  if (candidates.length === 0) {
    warnings.push("no_candidates_found");
  } else if (isEnrichedCorpus(corpus) && recommendations.length < 3) {
    warnings.push("insufficient_approved_tagged_items");
    if (!recommendations.some((recommendation) => recommendation.recommendation_type === "mixed_application")) {
      warnings.push("no_mixed_application_with_related_method_tags");
    }
  } else if (recommendations.length < 3) {
    warnings.push("insufficient_recommendations");
  }
  if (hasSkippedVisualItems(corpus)) warnings.push("skipped_visual_dependency_items");
  return warnings;
}
```

Then update the `recommendVariantPractice` call site to pass `corpus` into `buildWarnings`.

Add the helper implementations:

```js
function isEnrichedCorpus(corpus) {
  return corpus?.corpus_version === "enriched-practice-corpus-v0";
}

function hasSkippedVisualItems(corpus) {
  return (corpus?.items ?? []).some((item) =>
    Array.isArray(item.feature_flags) && item.feature_flags.includes("needs_visual"),
  );
}
```

- [ ] **Step 8: Run Agent core test to verify it passes**

Run: `node scripts/tests/rag/variant-practice-agent-core.test.mjs`

Expected: PASS with exit code 0.

- [ ] **Step 9: Extend CLI test for enriched corpus**

Modify `scripts/tests/rag/variant-practice-agent-cli.test.mjs` to add a successful enriched corpus case with stdout safety:

```js
{
  const enrichedCorpusPath = join(tmpRoot, "enriched_practice_corpus.json");
  const enrichedOut = join(tmpRoot, "enriched-agent-out");
  const enrichedCorpus = {
    ...corpus,
    corpus_version: "enriched-practice-corpus-v0",
    source_corpus_file: "practice_corpus.json",
    source_tag_proposal_file: "candidate_tag_proposals.json",
    items: corpus.items.slice(0, 3).map((item, index) => ({
      ...item,
      target_skills: index === 2 ? ["monotonicity"] : ["tangent_slope"],
      method_tags: index === 2 ? ["derivative_definition", "monotonicity_by_derivative"] : ["tangent_slope", "derivative_definition"],
      feature_flags: [],
      tag_review_meta: {
        review_status: "approved",
        proposal_confidence: "high",
        has_manual_tag_correction: false,
        tag_source: "rule",
      },
    })),
  };
  writeFileSync(enrichedCorpusPath, `${JSON.stringify(enrichedCorpus, null, 2)}\n`);

  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", enrichedCorpusPath, "--query", queryPath, "--out", enrichedOut, "--limit", "4"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("Recommendations: 3"), true);
  assert.equal(result.stdout.includes("求函数"), false);
  const output = JSON.parse(readFileSync(join(enrichedOut, "recommendations.json"), "utf8"));
  assert.equal(output.search_summary.corpus_version, "enriched-practice-corpus-v0");
  assert.deepEqual(
    output.recommendations.map((recommendation) => recommendation.recommendation_type),
    ["foundation", "near_transfer", "mixed_application"],
  );
}
```

- [ ] **Step 10: Run Agent CLI test**

Run: `node scripts/tests/rag/variant-practice-agent-cli.test.mjs`

Expected: PASS with exit code 0.

- [ ] **Step 11: Run Task 4 RAG regression tests**

Run:

```bash
node scripts/tests/rag/practice-corpus-search-core.test.mjs
node scripts/tests/rag/variant-practice-agent-core.test.mjs
node scripts/tests/rag/variant-practice-agent-cli.test.mjs
```

Expected: all PASS with exit code 0.

- [ ] **Step 12: Commit Task 4**

```bash
git status --short
git add scripts/rag/practice-corpus-search-core.mjs scripts/rag/variant-practice-agent-core.mjs scripts/tests/rag/practice-corpus-search-core.test.mjs scripts/tests/rag/variant-practice-agent-core.test.mjs scripts/tests/rag/variant-practice-agent-cli.test.mjs
git commit -m "feat: use enriched tags in practice agent"
```

Expected staged files: only Task 4 files.

---

### Task 5: Local Artifact Smoke, Narrative, And Final Verification

**Files:**
- Modify: `interview/mathtrace-project-narrative.md`
- Optional modify: `docs/superpowers/specs/2026-06-23-p22-metadata-tag-proposal-design.md` only if implementation behavior differs from spec.
- Generated only, do not commit:
  - `artifacts/rag/tag-proposals/candidate_tag_proposals.json`
  - `artifacts/rag/tag-proposals/tag_proposal_summary.json`
  - `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`
  - `artifacts/rag/enriched-practice-corpus/enrichment_summary.json`
  - `artifacts/rag/variant-practice-agent/enriched-recommendations.json`

**Interfaces:**
- Consumes:
  - Existing local `artifacts/rag/practice-corpus/practice_corpus.json` if present.
  - Existing local query fixture if present, or a temporary synthetic query file under `/tmp`.
- Produces:
  - A narrative update explaining P2.2 as metadata enrichment before pgvector/embedding.
  - Final verification output and clean commit scope.

- [ ] **Step 1: Run full default test suite**

Run:

```bash
node scripts/run-tests.mjs default
```

Expected: PASS with exit code 0.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS with exit code 0.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS with exit code 0.

- [ ] **Step 4: Generate proposal artifact from real local corpus if available**

Run only if `artifacts/rag/practice-corpus/practice_corpus.json` exists:

```bash
node scripts/rag/build-practice-tag-proposals.mjs \
  --corpus artifacts/rag/practice-corpus/practice_corpus.json \
  --out artifacts/rag/tag-proposals
```

Expected stdout shape:

```text
Wrote .../candidate_tag_proposals.json
Wrote .../tag_proposal_summary.json
Items: <count>
High confidence: <count>
Needs visual: <count>
Warnings: <count>
```

Do not paste full artifact or full question text into final answer.

- [ ] **Step 5: Decide whether first version needs tag review UI**

Inspect only `artifacts/rag/tag-proposals/tag_proposal_summary.json` summary counts. Apply the threshold from the spec:

```text
high_confidence_items >= 80% of item_count
needs_fix_items <= 10% of item_count
needs_visual_items <= 10% of item_count
```

If the threshold passes, continue with `--accept-rule-proposals` for local evaluation. If it fails, do not build a review UI in this plan; write down in the final answer that P2.2 generated proposals but needs a separate lightweight tag review UI follow-up before accepting tags.

- [ ] **Step 6: Generate enriched corpus for local evaluation if threshold passes**

Run:

```bash
node scripts/rag/build-enriched-practice-corpus.mjs \
  --corpus artifacts/rag/practice-corpus/practice_corpus.json \
  --proposals artifacts/rag/tag-proposals/candidate_tag_proposals.json \
  --accept-rule-proposals \
  --out artifacts/rag/enriched-practice-corpus
```

Expected stdout shape:

```text
Wrote .../enriched_practice_corpus.json
Wrote .../enrichment_summary.json
Items: <count>
Approved: <count>
Proposed: 0
Needs fix: <count>
Needs visual: <count>
```

- [ ] **Step 7: Run enriched Agent local evaluation if enriched corpus was generated**

Create a temporary query JSON under `/tmp` or use an existing ignored local query file. It must not include private student identity. Example:

```json
{
  "id": "demo-derivative-tangent-slope-enriched",
  "question_text": "设函数在点处可导，已知极限式，求曲线在该点处的切线斜率。",
  "knowledge_points": ["derivative"],
  "section_title": "考点 1 导数的概念、几何意义与运算",
  "mistake_causes": ["derivative_definition_confusion"],
  "target_skills": ["导数几何意义", "切线斜率", "极限式识别导数"]
}
```

Run:

```bash
node scripts/rag/recommend-variant-practice.mjs \
  --corpus artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json \
  --query /tmp/mathtrace-p22-query.json \
  --out artifacts/rag/variant-practice-agent \
  --limit 12
```

Expected: stdout prints only summary counts. Final answer may report `Recommendations: <count>`, `Candidates: <count>`, and warning names, but not full recommended question text.

- [ ] **Step 8: Update interview narrative**

Modify `interview/mathtrace-project-narrative.md` with a new P2.2 section or an extension to the existing P2 RAG section. Include:

```md
## 19. P2.2 题源 metadata enrichment

### 当前状态
已完成本地 deterministic tag proposal / enriched corpus 工具链，并通过本地测试验证。真实教辅题源 artifact 仍保留本地，不进入 Git。

### 功能价值
P2.2 解决 P2.1 推荐不足的核心原因：题库只有全文和章节，缺少可解释的技能、方法和题型标签。它让 Variant Practice Agent 能基于结构化 metadata 选择巩固题、近迁移题和综合应用题。

### 关键设计
- `practice_corpus.json` 保持原始人工审核题源。
- `candidate_tag_proposals.json` 是机器建议，不是最终 truth。
- `enriched_practice_corpus.json` 才是 Agent 消费的本地 fixture。
- 标签使用 snake_case 内部 key，中文只作为展示名。
- `needs_visual` 题默认不进入文本推荐。

### 技术决策与取舍
我没有第一步上 pgvector 或 embedding，因为 P2.1 的问题首先不是向量召回，而是题源 metadata 太薄。先用 deterministic proposal 建立可审核标签层，可以降低人工标注成本，也能为后续 embedding_text / pgvector 提供更干净的文本和标签依据。

### 性能收益（如适用）
本阶段没有宣称线上性能提升；收益主要是本地 deterministic pipeline 可重复、无外部模型成本、无网络依赖，适合作为黑客松 demo 的稳定题源加工链路。

### 面试官可能怎么问
- 为什么 P2.2 还不接向量库？
- 为什么不用 LLM 直接给所有题打标签？
- 如何避免机器标签污染推荐结果？
- 为什么标签用英文 key 而不是中文？
- 图像题为什么跳过？
- 这和传统 RAG 的 embedding 检索有什么关系？

### 推荐回答
我会说：P2.1 已经能从题库召回候选题，但推荐只能稳定给出 2 道，说明瓶颈不在“有没有向量库”，而在“题目结构信息不够”。所以 P2.2 先做 metadata enrichment，把每道题的目标技能、解法方法、题型特征结构化出来。机器只做 proposal，最终进入 corpus 的标签必须是明确 accepted 或人工审核过的结果，这样不会让模型或规则直接污染正式题库。

### 反思与后续优化
下一步可以根据 proposal summary 决定是否做轻量标签审核页；如果标签层稳定但召回仍不足，再做 embedding_text 和 pgvector prototype。

### 项目中的真实证据
- 代码：`scripts/rag/practice-tag-proposal-core.mjs`、`scripts/rag/enriched-practice-corpus-core.mjs`
- 测试：`scripts/tests/rag/practice-tag-proposal-core.test.mjs`、`scripts/tests/rag/enriched-practice-corpus-core.test.mjs`
- 文档：`docs/superpowers/specs/2026-06-23-p22-metadata-tag-proposal-design.md`
- 验证：`node scripts/run-tests.mjs default`、`npm run lint`、`npm run build`
```

Adjust wording to fit the surrounding narrative style; do not claim real artifact counts unless Step 4-7 actually ran.

- [ ] **Step 9: Run final repository checks**

Run:

```bash
git diff --check
git status --short
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
```

Expected:

- `git diff --check` exits 0.
- `git status --short` shows only intended source/test/doc files before commit.
- `git ls-files artifacts .env.local docs/reviews .superpowers/sdd` prints no tracked local artifacts or review files. If `.env.local` is not tracked but the command exits non-zero due to unmatched paths, use `git ls-files artifacts docs/reviews .superpowers/sdd` and separately confirm `.env.local` is not in `git ls-files .env.local`.

- [ ] **Step 10: Commit Task 5**

```bash
git status --short
git add interview/mathtrace-project-narrative.md
git commit -m "docs: add p22 metadata enrichment narrative"
```

If the implementation handoff section in the spec changed, include:

```bash
git add docs/superpowers/specs/2026-06-23-p22-metadata-tag-proposal-design.md interview/mathtrace-project-narrative.md
git commit -m "docs: document p22 metadata enrichment handoff"
```

Expected staged files: narrative only, or narrative plus P2.2 spec handoff if needed. Do not stage `artifacts/**` or `docs/reviews/**`.

---

## Final Verification

Run after all task commits:

```bash
node scripts/run-tests.mjs default
npm run lint
npm run build
git diff --check
git status --short
git log --oneline -8
git ls-files artifacts docs/reviews .superpowers/sdd
git ls-files .env.local
```

Expected:

- `node scripts/run-tests.mjs default` exits 0.
- `npm run lint` exits 0.
- `npm run build` exits 0.
- `git diff --check` exits 0.
- `git status --short` is empty, except ignored generated artifacts remain absent from status.
- `git ls-files artifacts docs/reviews .superpowers/sdd` prints nothing.
- `git ls-files .env.local` prints nothing.

## Implementation Notes

- If Task 2 real summary shows proposal quality below threshold, do not silently accept rule proposals. Keep enriched corpus draft-only and report that a lightweight tag review UI is the next step.
- If Task 4 enriched Agent still returns fewer than 3 recommendations, that is acceptable only if warnings are specific enough to explain the gap, especially `no_mixed_application_with_related_method_tags`.
- If implementation needs to diverge from this plan, update the P2.2 spec handoff section before final verification.
- Do not merge to `main` until implementation self-test passes and the user has completed Claude Code implementation review.

## Self-Review Checklist

- Spec coverage:
  - Rule-based proposal core: Task 1.
  - Proposal artifact CLI and summary: Task 2.
  - Enriched corpus artifact and validation: Task 3.
  - Query skill normalization and enriched Agent evaluation: Task 4.
  - `needs_visual` skip and specific warning codes: Task 4.
  - Narrative update: Task 5.
  - No pgvector / embedding / DB / frontend / LLM: Global Constraints and file structure.
- Placeholder scan:
  - No `TBD`, no `TODO`, no unspecified future implementation steps.
- Type consistency:
  - `target_skills`, `method_tags`, `feature_flags` are arrays of snake_case strings in enriched corpus.
  - Proposal tag objects use `tag`, optional `display_name`, `confidence`, `evidence_terms`, and `source`.
  - `tag_review_meta.review_status` uses `proposed | approved | needs_fix | skipped`.
