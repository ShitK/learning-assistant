# P2.3 Taxonomy-aware AI-assisted Tag Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local taxonomy-aware AI-assisted tag review loop that lets AI do most tag proposal work while keeping final corpus tags gated, reviewable, and compatible with the existing enriched corpus builder.

**Architecture:** Keep P2.3 inside local Node.js RAG tooling. Extend the current derivative tag constants into a taxonomy-aware registry, add AI proposal generation with a local OpenAI-compatible provider boundary, merge rule + AI proposals through a conservative auto-approval gate, render a local static tag review UI for risky items, and feed final review records back into the existing enriched corpus and Variant Practice Agent evaluation flow.

**Tech Stack:** Node.js ESM scripts, local `fetch` injection for provider tests, KaTeX static rendering reused from candidate review UI, existing `scripts/run-tests.mjs`, local ignored artifacts under `artifacts/rag/**`.

## Global Constraints

- Do not modify `src/app/**`, `app/api/**`, `components/**`, diagnosis pipeline, persistence, Supabase schema, `memory_events`, `student_profiles`, mistake book behavior, evidence API, pgvector, embedding, or production retrieval APIs.
- Do not commit real `practice_corpus.json`, AI proposal artifacts, merged proposal artifacts, review queue artifacts, tag review records, enriched corpus, recommendations, PDFs, MinerU JSON, reviewed seed, page images, or anything under `artifacts/`.
- Do not read or print `.env.local`, service role keys, model API keys, MinerU tokens, `RAG_TAG_PROVIDER_API_KEY`, or external API credentials.
- Keep `sample_diagnosis` stable and untouched.
- `docs/reviews/*.md` remains local-only unless the user explicitly asks to commit a review file.
- Tests must use synthetic fixture text, not real教辅题文.
- P2.3 may call an AI provider only from a local CLI when explicitly configured. Tests must use fake provider responses and no network.
- AI tag output is proposal only. Final enriched corpus tags must come from auto-approval gate records or human review records.
- Formal corpus tags use taxonomy-approved snake_case internal keys. Chinese names are display metadata only and do not participate in matching.
- First taxonomy is `math_derivative_v0`; do not implement all math topics or all subjects in this plan.
- `variant_level` must not enter corpus; it remains dynamic recommendation result metadata.
- `needs_visual` items are skipped by the text-only Variant Practice Agent and must enter review queue rather than auto-approved.
- CLI stdout may print counts, distributions, output paths, and warning counts; it must not print full question text, full corpus, full recommendations, full prompts, full provider responses, PDF content, `.env`, or API key names.
- RAG remains a retrieval/recommendation layer for variant-practice sourcing; it must not write or decide `memory_events` / `student_profiles`.

---

## File Structure

- Modify `scripts/rag/practice-tag-taxonomy.mjs`
  - Add taxonomy-aware registry API while preserving existing P2.2 exports.
- Modify `scripts/tests/rag/practice-tag-taxonomy.test.mjs`
  - Add taxonomy registry tests.
- Create `scripts/rag/ai-tag-proposal-core.mjs`
  - Build sanitized AI tag proposal prompts.
  - Parse, normalize, and validate AI tag proposal artifacts.
  - Summarize confidence and warning distributions.
- Create `scripts/rag/build-ai-tag-proposals.mjs`
  - CLI for `practice_corpus.json + candidate_tag_proposals.json -> candidate_ai_tag_proposals.json + ai_tag_proposal_summary.json`.
- Create `scripts/tests/rag/ai-tag-proposal-core.test.mjs`
  - Core prompt/parser/validator tests.
- Create `scripts/tests/rag/ai-tag-proposal-cli.test.mjs`
  - CLI tests with fake provider and no network.
- Create `scripts/rag/tag-proposal-merge-core.mjs`
  - Merge rule and AI proposals.
  - Produce auto review records and review queue.
  - Validate merged artifacts.
- Create `scripts/rag/merge-tag-proposals.mjs`
  - CLI for rule + AI proposal merge/gate.
- Create `scripts/tests/rag/tag-proposal-merge-core.test.mjs`
  - Core merge/gate tests.
- Create `scripts/tests/rag/tag-proposal-merge-cli.test.mjs`
  - CLI tests.
- Create `scripts/rag/tag-review-ui-core.mjs`
  - Build app data for local static tag review page.
  - Render math text and taxonomy-driven tag controls.
  - Export compatible review records.
- Create `scripts/rag/build-tag-review-ui.mjs`
  - CLI for `tag_review_queue.json -> artifacts/rag/tag-review/index.html`.
- Create `scripts/tests/rag/tag-review-ui-core.test.mjs`
  - UI core and export tests.
- Create `scripts/tests/rag/tag-review-ui-cli.test.mjs`
  - CLI tests.
- Create `scripts/rag/merge-tag-review-records.mjs`
  - Merge auto-approved review records and human review records into one compatible final review record file.
- Create `scripts/tests/rag/tag-review-record-merge-cli.test.mjs`
  - CLI tests for review record merging.
- Modify `scripts/run-tests.mjs`
  - Add new P2.3 tests near P2.2 RAG tests.
- Modify `scripts/rag/enriched-practice-corpus-core.mjs`
  - Preserve existing review record compatibility.
  - Copy optional P2.3 audit fields into `tag_review_meta`.
- Modify `docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md`
  - Only if implementation decisions change the design.
- Modify `interview/mathtrace-project-narrative.md`
  - Add P2.3 narrative after implementation and verification.

Optional generated artifacts, not committed:

- `artifacts/rag/ai-tag-proposals/candidate_ai_tag_proposals.json`
- `artifacts/rag/ai-tag-proposals/ai_tag_proposal_summary.json`
- `artifacts/rag/tag-review/merged_tag_proposals.json`
- `artifacts/rag/tag-review/tag_review_queue.json`
- `artifacts/rag/tag-review/auto_tag_review_records.json`
- `artifacts/rag/tag-review/index.html`
- `artifacts/rag/tag-review/tag_review_records.json`
- `artifacts/rag/tag-review/final_tag_review_records.json`

---

## Data Contracts

### Taxonomy

```js
{
  taxonomy_id: "math_derivative_v0",
  subject: "math",
  unit: "derivative",
  display_name: "数学 / 导数",
  target_skills: [{ key: "tangent_slope", display_name: "切线斜率" }],
  method_tags: [{ key: "derivative_definition", display_name: "导数定义式" }],
  feature_flags: [{ key: "has_choice_options", display_name: "选择题" }],
  target_skill_to_method_tags: {
    tangent_slope: ["tangent_slope", "derivative_definition"]
  }
}
```

### AI Tag Proposal Artifact

```js
{
  proposal_version: "practice-ai-tag-proposal-v0",
  taxonomy_id: "math_derivative_v0",
  generated_at: "2026-06-24T00:00:00.000Z",
  source_corpus_file: "artifacts/rag/practice-corpus/practice_corpus.json",
  source_rule_proposal_file: "artifacts/rag/tag-proposals/candidate_tag_proposals.json",
  provider_meta: {
    provider_name: "openai_compatible",
    model: "deepseek-v4-flash"
  },
  item_count: 1,
  proposals: [
    {
      item_id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      taxonomy_id: "math_derivative_v0",
      proposed_tags: {
        target_skills: [
          {
            tag: "tangent_slope",
            display_name: "切线斜率",
            confidence: "high",
            evidence_terms: ["切线", "斜率"],
            rationale: "题干要求求曲线切线斜率。",
            source: "llm"
          }
        ],
        method_tags: [],
        feature_flags: []
      },
      item_confidence: "high",
      warnings: []
    }
  ]
}
```

`warnings` uses stable values because merge/gate consumes parser warnings:

- `unknown_tag_removed`
- `empty_tag_removed`
- `invalid_confidence_removed`
- `invalid_ai_json`
- `invalid_ai_schema`
- `invalid_evidence_terms_removed`

### Review Queue Item

```js
{
  item_id: "practice-candidate-2",
  source_candidate_id: "candidate-2",
  taxonomy_id: "math_derivative_v0",
  question_text: "synthetic fixture text",
  section_title: "考点 2 导数与函数的单调性",
  source_ref: { pdf_page_index: 1, section_title: "考点 2 导数与函数的单调性" },
  rule_tags: {
    target_skills: ["monotonicity"],
    method_tags: ["monotonicity_by_derivative"],
    feature_flags: []
  },
  ai_tags: {
    target_skills: ["parameter_range"],
    method_tags: ["parameter_classification"],
    feature_flags: []
  },
  gate_status: "needs_review",
  gate_reasons: ["target_skill_conflict"],
  recommended_review_status: "needs_fix"
}
```

`gate_reasons` uses stable values:

- `ai_not_high_confidence`
- `needs_visual`
- `invalid_ai_proposal`
- `target_skill_conflict`
- `missing_ai_target_skill`
- `too_many_target_skills`
- `method_tag_conflict`
- `feature_flag_conflict`

### Review Record

```js
{
  item_id: "practice-candidate-2",
  review_status: "approved",
  reviewed_tags: {
    target_skills: ["monotonicity"],
    method_tags: ["monotonicity_by_derivative"],
    feature_flags: []
  },
  review_notes: "人工选择规则标签。",
  has_manual_tag_correction: true,
  tag_source: "human",
  taxonomy_id: "math_derivative_v0",
  review_origin: "human_review",
  ai_confidence: "high",
  rule_ai_agreement: "target_skill_overlap"
}
```

`tag_source: "llm"` means AI proposal participated in the accepted tags; it does not mean AI alone decided final truth. Auto-approved `"llm"` records still come from the conservative gate. The optional audit fields must flow into enriched corpus `tag_review_meta` when present.

---

## Task 1: Taxonomy-aware Registry

**Files:**
- Modify: `scripts/rag/practice-tag-taxonomy.mjs`
- Modify: `scripts/tests/rag/practice-tag-taxonomy.test.mjs`

**Interfaces:**
- Produces:
  - `DEFAULT_TAXONOMY_ID: "math_derivative_v0"`
  - `getPracticeTagTaxonomy(taxonomyId?: string): PracticeTagTaxonomy | null`
  - `validatePracticeTagTaxonomy(value: unknown): { ok: true, taxonomy } | { ok: false, errors: string[] }`
  - `getAllowedTagSets(taxonomy): { targetSkills: Set<string>, methodTags: Set<string>, featureFlags: Set<string> }`
- Preserves:
  - `TARGET_SKILL_DISPLAY_NAMES`
  - `METHOD_TAG_DISPLAY_NAMES`
  - `FEATURE_FLAG_DISPLAY_NAMES`
  - `TARGET_SKILL_TO_METHOD_TAGS`
  - `normalizeTargetSkillKeys`
  - `deriveMethodTagsFromTargetSkills`
- Consumed by Tasks 2, 3, 4.

- [ ] **Step 1: Extend taxonomy tests first**

Add assertions to `scripts/tests/rag/practice-tag-taxonomy.test.mjs`:

```js
import {
  DEFAULT_TAXONOMY_ID,
  getAllowedTagSets,
  getPracticeTagTaxonomy,
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
  target_skills: [{ key: "duplicated", display_name: "A" }, { key: "duplicated", display_name: "B" }],
  method_tags: [],
  feature_flags: [],
  target_skill_to_method_tags: { duplicated: ["missing_method"] },
});
assert.equal(invalid.ok, false);
assert.equal(invalid.errors.some((error) => error.includes("duplicate tag key")), true);
assert.equal(invalid.errors.some((error) => error.includes("unknown method tag")), true);
```

- [ ] **Step 2: Run taxonomy test and confirm it fails**

Run:

```bash
node scripts/tests/rag/practice-tag-taxonomy.test.mjs
```

Expected: FAIL with missing export for `DEFAULT_TAXONOMY_ID`.

- [ ] **Step 3: Implement taxonomy registry with compatibility exports**

In `scripts/rag/practice-tag-taxonomy.mjs`, keep current exports and add:

```js
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
```

Add validators:

```js
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
  const methodKeys = new Set((value.method_tags ?? []).map((tag) => tag.key));
  for (const [skill, methodTags] of Object.entries(value.target_skill_to_method_tags ?? {})) {
    if (!(value.target_skills ?? []).some((tag) => tag.key === skill)) {
      errors.push(`target_skill_to_method_tags contains unknown target skill: ${skill}`);
    }
    for (const methodTag of methodTags ?? []) {
      if (!methodKeys.has(methodTag)) {
        errors.push(`target_skill_to_method_tags.${skill} contains unknown method tag: ${methodTag}`);
      }
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, taxonomy: value };
}
```

Add private helper:

```js
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
    if (seen.has(tag.key)) errors.push(`duplicate tag key in ${path}: ${tag.key}`);
    seen.add(tag.key);
    if (typeof tag.display_name !== "string" || !tag.display_name.trim()) {
      errors.push(`${path}.${tag.key}.display_name must be a non-empty string`);
    }
  }
}
```

- [ ] **Step 4: Verify taxonomy tests**

Run:

```bash
node scripts/tests/rag/practice-tag-taxonomy.test.mjs
```

Expected: PASS and output `practice tag taxonomy tests passed`.

- [ ] **Step 5: Commit Task 1**

```bash
git add scripts/rag/practice-tag-taxonomy.mjs scripts/tests/rag/practice-tag-taxonomy.test.mjs
git commit -m "feat: add taxonomy-aware tag registry"
```

---

## Task 2: AI Tag Proposal Core

**Files:**
- Create: `scripts/rag/ai-tag-proposal-core.mjs`
- Create: `scripts/tests/rag/ai-tag-proposal-core.test.mjs`

**Interfaces:**
- Consumes:
  - `getPracticeTagTaxonomy`
  - `getAllowedTagSets`
- Produces:
  - `buildAiTagPrompt({ item, ruleProposal, taxonomy }): { system: string, user: string }`
  - `parseAiTagProposalResponse({ item, text, taxonomy }): AiTagProposal`
  - `buildAiTagProposalArtifact({ corpus, ruleProposalArtifact, taxonomy, providerMeta, generatedAt, sourceCorpusFile, sourceRuleProposalFile, responsesByItemId }): AiTagProposalArtifact`
  - `validateAiTagProposalArtifact(value, taxonomy): { ok: true, proposalArtifact } | { ok: false, errors: string[] }`
  - `summarizeAiTagProposals(proposalArtifact): AiTagProposalSummary`
- Consumed by Task 3 CLI and Task 4 merge/gate.

- [ ] **Step 1: Write core tests**

Create `scripts/tests/rag/ai-tag-proposal-core.test.mjs` with synthetic fixture:

```js
import assert from "node:assert/strict";

import { getPracticeTagTaxonomy } from "../../rag/practice-tag-taxonomy.mjs";
import {
  buildAiTagPrompt,
  buildAiTagProposalArtifact,
  parseAiTagProposalResponse,
  summarizeAiTagProposals,
  validateAiTagProposalArtifact,
} from "../../rag/ai-tag-proposal-core.mjs";

const taxonomy = getPracticeTagTaxonomy();
const item = {
  id: "practice-candidate-1",
  source_candidate_id: "candidate-1",
  question_text: "1. 已知函数在点处可导，求曲线切线斜率. A. 1 B. 2",
  search_text: "导数\n考点 1 导数的概念",
  section_title: "考点 1 导数的概念",
  source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
};
const ruleProposal = {
  item_id: "practice-candidate-1",
  proposed_tags: {
    target_skills: [{ tag: "tangent_slope", evidence_terms: ["切线", "斜率"], confidence: "high", source: "rule" }],
    method_tags: [{ tag: "tangent_slope", evidence_terms: ["切线", "斜率"], confidence: "high", source: "rule" }],
    feature_flags: [{ tag: "has_choice_options", evidence_terms: ["A.", "B."], confidence: "medium", source: "rule" }],
  },
  warnings: [],
};

const prompt = buildAiTagPrompt({ item, ruleProposal, taxonomy });
assert.equal(prompt.system.includes("Only choose tags from the provided taxonomy"), true);
assert.equal(prompt.user.includes("practice-candidate-1"), true);
assert.equal(prompt.user.includes("VISION_PROVIDER_API_KEY"), false);

const responseText = JSON.stringify({
  target_skills: [{ tag: "tangent_slope", confidence: "high", evidence_terms: ["切线", "斜率"], rationale: "求切线斜率。" }],
  method_tags: [{ tag: "derivative_definition", confidence: "medium", evidence_terms: ["可导"], rationale: "与导数定义有关。" }],
  feature_flags: [{ tag: "has_choice_options", confidence: "medium", evidence_terms: ["A.", "B."], rationale: "有选项。" }],
  item_confidence: "high",
});

const parsed = parseAiTagProposalResponse({ item, text: responseText, taxonomy });
assert.equal(parsed.item_id, "practice-candidate-1");
assert.equal(parsed.proposed_tags.target_skills[0].tag, "tangent_slope");
assert.equal(parsed.proposed_tags.target_skills[0].source, "llm");
assert.equal(parsed.warnings.length, 0);

const unknownTag = parseAiTagProposalResponse({
  item,
  text: JSON.stringify({
    target_skills: [{ tag: "conic_section", confidence: "high", evidence_terms: ["曲线"], rationale: "bad" }],
    method_tags: [],
    feature_flags: [],
    item_confidence: "high",
  }),
  taxonomy,
});
assert.equal(unknownTag.warnings.includes("unknown_tag_removed"), true);
assert.equal(unknownTag.proposed_tags.target_skills.length, 0);

const invalidConfidence = parseAiTagProposalResponse({
  item,
  text: JSON.stringify({
    target_skills: [{ tag: "tangent_slope", confidence: "High", evidence_terms: ["切线"], rationale: "bad" }],
    method_tags: [],
    feature_flags: [],
    item_confidence: "high",
  }),
  taxonomy,
});
assert.equal(invalidConfidence.warnings.includes("invalid_confidence_removed"), true);
assert.equal(invalidConfidence.proposed_tags.target_skills.length, 0);

const emptyTag = parseAiTagProposalResponse({
  item,
  text: JSON.stringify({
    target_skills: [{ tag: " ", confidence: "high", evidence_terms: ["切线"], rationale: "bad" }],
    method_tags: [],
    feature_flags: [],
    item_confidence: "high",
  }),
  taxonomy,
});
assert.equal(emptyTag.warnings.includes("empty_tag_removed"), true);

const malformed = parseAiTagProposalResponse({ item, text: "{bad", taxonomy });
assert.equal(malformed.warnings.includes("invalid_ai_json"), true);

const artifact = buildAiTagProposalArtifact({
  corpus: { corpus_version: "practice-corpus-v0", items: [item] },
  ruleProposalArtifact: { proposal_version: "practice-tag-proposal-v0", proposals: [ruleProposal] },
  taxonomy,
  providerMeta: { provider_name: "fake", model: "fake-model" },
  generatedAt: "2026-06-24T00:00:00.000Z",
  sourceCorpusFile: "practice_corpus.json",
  sourceRuleProposalFile: "candidate_tag_proposals.json",
  responsesByItemId: new Map([["practice-candidate-1", responseText]]),
});
const validation = validateAiTagProposalArtifact(artifact, taxonomy);
assert.equal(validation.ok, true);
const summary = summarizeAiTagProposals(artifact);
assert.equal(summary.item_count, 1);
assert.equal(summary.high_confidence_items, 1);

console.log("ai tag proposal core tests passed");
```

- [ ] **Step 2: Run test and confirm it fails**

```bash
node scripts/tests/rag/ai-tag-proposal-core.test.mjs
```

Expected: FAIL with module not found for `ai-tag-proposal-core.mjs`.

- [ ] **Step 3: Implement `ai-tag-proposal-core.mjs`**

Create the module with:

```js
const AI_PROPOSAL_VERSION = "practice-ai-tag-proposal-v0";
const CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);
const TAG_SOURCE = "llm";
```

Implement prompt generation:

```js
export function buildAiTagPrompt({ item, ruleProposal, taxonomy }) {
  return {
    system: [
      "You are a MathTrace tag proposal assistant.",
      "Only choose tags from the provided taxonomy.",
      "Return strict JSON only.",
      "Do not invent tag keys.",
      "Treat your answer as a proposal, not final truth.",
    ].join(" "),
    user: JSON.stringify({
      item_id: item.id,
      question_text: item.question_text,
      section_title: item.section_title ?? null,
      source_ref: item.source_ref ?? null,
      rule_proposal: compactRuleProposal(ruleProposal),
      taxonomy: compactTaxonomy(taxonomy),
      response_schema: {
        target_skills: [{ tag: "string", confidence: "high|medium|low", evidence_terms: ["string"], rationale: "string" }],
        method_tags: [{ tag: "string", confidence: "high|medium|low", evidence_terms: ["string"], rationale: "string" }],
        feature_flags: [{ tag: "string", confidence: "high|medium|low", evidence_terms: ["string"], rationale: "string" }],
        item_confidence: "high|medium|low",
      },
    }),
  };
}
```

Implement parser rules:

- Parse JSON safely.
- Normalize missing arrays to empty arrays.
- Strip markdown code fences before JSON parse when the whole response is fenced.
- Drop unknown tags and add `unknown_tag_removed`.
- Drop empty tags and add `empty_tag_removed`.
- Drop invalid confidence tags and add `invalid_confidence_removed`.
- Keep `evidence_terms` as strings only; drop invalid entries and add `invalid_evidence_terms_removed`.
- Set `source: "llm"` on every retained tag.
- Set missing or invalid `item_confidence` to `"low"` and add `invalid_confidence_removed`.
- Set empty output with `invalid_ai_json` when parsing fails.
- Preserve parser warnings on each proposal item because Task 4 gate treats any parser warning as a sufficient reason for review queue.

- [ ] **Step 4: Verify core test**

```bash
node scripts/tests/rag/ai-tag-proposal-core.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add scripts/rag/ai-tag-proposal-core.mjs scripts/tests/rag/ai-tag-proposal-core.test.mjs
git commit -m "feat: add ai tag proposal core"
```

---

## Task 3: AI Tag Proposal CLI

**Files:**
- Create: `scripts/rag/build-ai-tag-proposals.mjs`
- Create: `scripts/tests/rag/ai-tag-proposal-cli.test.mjs`

**Interfaces:**
- Consumes:
  - `validatePracticeCorpus`
  - `validateTagProposalArtifact`
  - `buildAiTagPrompt`
  - `parseAiTagProposalResponse`
  - `buildAiTagProposalArtifact`
  - `validateAiTagProposalArtifact`
  - `summarizeAiTagProposals`
- Produces CLI:
  - `node scripts/rag/build-ai-tag-proposals.mjs --corpus <practice_corpus.json> --rules <candidate_tag_proposals.json> [--taxonomy math_derivative_v0] [--out <dir>] [--limit N]`

- [ ] **Step 1: Write CLI tests**

Create `scripts/tests/rag/ai-tag-proposal-cli.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const tmpRoot = resolve("artifacts/tmp/p23-ai-tag-proposal-cli-test");
mkdirSync(tmpRoot, { recursive: true });

const corpusPath = join(tmpRoot, "practice_corpus.json");
const rulesPath = join(tmpRoot, "candidate_tag_proposals.json");
const outDir = join(tmpRoot, "out");

writeFileSync(corpusPath, JSON.stringify({
  corpus_version: "practice-corpus-v0",
  items: [{
    id: "practice-candidate-1",
    source_candidate_id: "candidate-1",
    question_text: "1. 求切线斜率. A. 1 B. 2",
    search_text: "导数\n切线斜率",
    knowledge_points: ["derivative"],
    section_title: "考点 1 导数的概念",
  }],
}));
writeFileSync(rulesPath, JSON.stringify({
  proposal_version: "practice-tag-proposal-v0",
  generated_at: "2026-06-24T00:00:00.000Z",
  source_corpus_file: corpusPath,
  source_corpus_version: "practice-corpus-v0",
  item_count: 1,
  proposals: [{
    item_id: "practice-candidate-1",
    source_candidate_id: "candidate-1",
    source_ref: null,
    proposed_tags: {
      target_skills: [{ tag: "tangent_slope", display_name: "切线斜率", confidence: "high", evidence_terms: ["切线", "斜率"], source: "rule" }],
      method_tags: [],
      feature_flags: [],
    },
    warnings: [],
  }],
}));

const env = {
  ...process.env,
  RAG_TAG_PROVIDER_BASE_URL: "http://127.0.0.1/fake",
  RAG_TAG_PROVIDER_MODEL: "fake-model",
  RAG_TAG_PROVIDER_API_KEY: "local-secret",
  MATHTRACE_FAKE_RAG_TAG_RESPONSE: JSON.stringify({
    target_skills: [{ tag: "tangent_slope", confidence: "high", evidence_terms: ["切线", "斜率"], rationale: "synthetic" }],
    method_tags: [],
    feature_flags: [{ tag: "has_choice_options", confidence: "medium", evidence_terms: ["A.", "B."], rationale: "synthetic" }],
    item_confidence: "high",
  }),
};

const result = spawnSync(process.execPath, [
  "scripts/rag/build-ai-tag-proposals.mjs",
  "--corpus", corpusPath,
  "--rules", rulesPath,
  "--out", outDir,
], { encoding: "utf8", env });

assert.equal(result.status, 0);
assert.equal(result.stdout.includes("Items: 1"), true);
assert.equal(result.stdout.includes("local-secret"), false);
assert.equal(result.stdout.includes("求切线斜率"), false);

const artifact = JSON.parse(readFileSync(join(outDir, "candidate_ai_tag_proposals.json"), "utf8"));
assert.equal(artifact.proposal_version, "practice-ai-tag-proposal-v0");
assert.equal(artifact.proposals[0].proposed_tags.target_skills[0].tag, "tangent_slope");

const missingEnv = spawnSync(process.execPath, [
  "scripts/rag/build-ai-tag-proposals.mjs",
  "--corpus", corpusPath,
  "--rules", rulesPath,
  "--out", join(tmpRoot, "missing-env"),
], { encoding: "utf8", env: { ...process.env, RAG_TAG_PROVIDER_API_KEY: "" } });
assert.equal(missingEnv.status, 2);
assert.equal(missingEnv.stderr.includes("RAG tag provider is not configured"), true);

console.log("ai tag proposal cli tests passed");
```

- [ ] **Step 2: Run CLI test and confirm it fails**

```bash
node scripts/tests/rag/ai-tag-proposal-cli.test.mjs
```

Expected: FAIL with module not found for `build-ai-tag-proposals.mjs`.

- [ ] **Step 3: Implement CLI**

Create `scripts/rag/build-ai-tag-proposals.mjs` with:

- args: `--corpus`, `--rules`, `--taxonomy`, `--out`, `--limit`, `--help`.
- config from `RAG_TAG_PROVIDER_BASE_URL`, `RAG_TAG_PROVIDER_MODEL`, `RAG_TAG_PROVIDER_API_KEY`, `RAG_TAG_PROVIDER_TIMEOUT_MS`.
- fake response escape hatch only for tests: `MATHTRACE_FAKE_RAG_TAG_RESPONSE`.
- no stdout full prompt or question text.

Provider call shape:

```js
async function requestAiTags({ prompt, providerConfig, fetchImpl = fetch }) {
  if (process.env.MATHTRACE_FAKE_RAG_TAG_RESPONSE) {
    return process.env.MATHTRACE_FAKE_RAG_TAG_RESPONSE;
  }
  const response = await fetchImpl(joinChatCompletionsUrl(providerConfig.baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${providerConfig.apiKey}`,
    },
    body: JSON.stringify({
      model: providerConfig.model,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    }),
  });
  if (!response.ok) throw new Error(`RAG tag provider HTTP ${response.status}`);
  const json = await response.json();
  return json.choices?.[0]?.message?.content ?? "";
}
```

- [ ] **Step 4: Verify CLI test**

```bash
node scripts/tests/rag/ai-tag-proposal-cli.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add scripts/rag/build-ai-tag-proposals.mjs scripts/tests/rag/ai-tag-proposal-cli.test.mjs
git commit -m "feat: add ai tag proposal cli"
```

---

## Task 4: Proposal Merge And Auto-approval Gate

**Files:**
- Create: `scripts/rag/tag-proposal-merge-core.mjs`
- Create: `scripts/rag/merge-tag-proposals.mjs`
- Create: `scripts/tests/rag/tag-proposal-merge-core.test.mjs`
- Create: `scripts/tests/rag/tag-proposal-merge-cli.test.mjs`

**Interfaces:**
- Consumes:
  - rule proposal artifact from P2.2.
  - AI proposal artifact from Task 2/3.
  - taxonomy from Task 1.
- Produces:
  - `buildMergedTagProposals({ corpus, ruleProposalArtifact, aiProposalArtifact, taxonomy, generatedAt })`
  - `summarizeMergedTagProposals(merged)`
  - `validateMergedTagProposals(value, taxonomy)`
  - CLI output:
    - `merged_tag_proposals.json`
    - `auto_tag_review_records.json`
    - `tag_review_queue.json`
    - `tag_review_summary.json`

- [ ] **Step 1: Write core tests**

Create tests covering:

```js
assert.equal(autoApproved.auto_review_records.length, 1);
assert.equal(autoApproved.review_queue.length, 0);
assert.equal(autoApproved.auto_review_records[0].tag_source, "llm");

assert.equal(conflict.review_queue.length, 1);
assert.equal(conflict.review_queue[0].gate_reasons.includes("target_skill_conflict"), true);

assert.equal(needsVisual.review_queue[0].gate_reasons.includes("needs_visual"), true);

assert.equal(aiCompletesMissingTarget.auto_review_records[0].review_status, "approved");
assert.equal(aiCompletesMissingTarget.auto_review_records[0].review_notes.includes("ai_completed_missing_target_skill"), true);
```

Use synthetic items:

- same rule/AI `tangent_slope` high confidence -> auto approved.
- rule `monotonicity`, AI `parameter_range` -> review queue.
- AI `needs_visual` -> review queue.
- rule `needs_visual` but AI missing it -> review queue.
- rule/AI target skill overlaps but method tag conflicts -> review queue.
- rule/AI target skill overlaps but feature flag conflicts -> review queue.
- rule no target, AI high `zero_point` with evidence -> auto approved with note.
- rule has `has_choice_options`, AI has `has_fill_blank` -> review queue with `feature_flag_conflict`.

- [ ] **Step 2: Implement gate rules**

In `tag-proposal-merge-core.mjs`, implement:

```js
const AUTO_APPROVAL_VERSION = "tag-proposal-merge-v0";

function getGateDecision({ ruleTags, aiTags, aiProposal }) {
  const reasons = [];
  if (aiProposal.item_confidence !== "high") reasons.push("ai_not_high_confidence");
  if (hasTag(aiTags.feature_flags, "needs_visual") || hasTag(ruleTags.feature_flags, "needs_visual")) {
    reasons.push("needs_visual");
  }
  if (hasUnknownOrInvalidWarnings(aiProposal)) reasons.push("invalid_ai_proposal");
  const targetOverlap = intersect(ruleTags.target_skills, aiTags.target_skills);
  if (ruleTags.target_skills.length > 0 && aiTags.target_skills.length > 0 && targetOverlap.length === 0) {
    reasons.push("target_skill_conflict");
  }
  if (aiTags.target_skills.length === 0) reasons.push("missing_ai_target_skill");
  if (aiTags.target_skills.length > 3) reasons.push("too_many_target_skills");
  const finalTargetSkills = mergeUnique(ruleTags.target_skills, aiTags.target_skills);
  if (hasMethodTagConflict({ ruleTags, aiTags, finalTargetSkills })) {
    reasons.push("method_tag_conflict");
  }
  if (hasFeatureFlagConflict(ruleTags.feature_flags, aiTags.feature_flags)) {
    reasons.push("feature_flag_conflict");
  }
  return reasons.length === 0
    ? { status: "auto_approved", reasons: ["high_confidence_rule_ai_agreement"] }
    : { status: "needs_review", reasons };
}
```

`hasUnknownOrInvalidWarnings` must treat these AI parser warnings as `invalid_ai_proposal`:

- `unknown_tag_removed`
- `empty_tag_removed`
- `invalid_confidence_removed`
- `invalid_ai_json`
- `invalid_ai_schema`
- `invalid_evidence_terms_removed`

Define final tag selection conservatively:

```js
function chooseFinalTags({ ruleTags, aiTags, taxonomy }) {
  const target_skills = mergeUnique(ruleTags.target_skills, aiTags.target_skills);
  const derivedMethodTags = deriveMethodTagsFromTargetSkills(target_skills, taxonomy);
  const method_tags = mergeUnique(
    derivedMethodTags,
    intersect(ruleTags.method_tags, aiTags.method_tags),
    aiTags.method_tags.filter((tag) => isMethodTagValidForTargets(tag, target_skills, taxonomy)),
  );
  const feature_flags = intersect(ruleTags.feature_flags, aiTags.feature_flags)
    .filter((tag) => tag !== "needs_visual");
  return { target_skills, method_tags, feature_flags };
}
```

Rules:

- `target_skills`: union of rule and AI only after gate has confirmed no target conflict.
- `method_tags`: include derived method tags for final targets, plus overlapping tags, plus AI-only tags that are valid for final targets.
- `feature_flags`: rule and AI non-visual feature flags must match exactly for auto approval; final output uses the intersection, which equals both sides after this gate.
- `hasFeatureFlagConflict` compares feature flag sets after removing `needs_visual`; any difference is a conflict because it may change filtering or recommendation explanation.
- `tag_source: "llm"` means AI proposal participated in the accepted result, not that AI alone decided the final tags.

Auto record shape:

```js
{
  item_id,
  review_status: "approved",
  reviewed_tags: {
    target_skills: finalTags.target_skills,
    method_tags: finalTags.method_tags,
    feature_flags: finalTags.feature_flags,
  },
  review_notes: gateDecision.reasons.join(", "),
  has_manual_tag_correction: false,
  tag_source: "llm",
  taxonomy_id: taxonomy.taxonomy_id,
  review_origin: "auto_gate",
  ai_confidence: aiProposal.item_confidence,
  rule_ai_agreement: gateDecision.reasons.join(", ")
}
```

- [ ] **Step 3: Write CLI tests**

CLI command:

```bash
node scripts/rag/merge-tag-proposals.mjs \
  --corpus <practice_corpus.json> \
  --rules <candidate_tag_proposals.json> \
  --ai <candidate_ai_tag_proposals.json> \
  --out <dir>
```

Tests assert:

- output files exist.
- stdout has counts only.
- bad JSON returns exit 1.
- missing `--ai` returns exit 2.
- stdout does not contain fixture question text.

- [ ] **Step 4: Implement CLI**

Create `merge-tag-proposals.mjs` using existing CLI style:

- parse args manually.
- validate corpus via `validatePracticeCorpus`.
- validate rule proposals via `validateTagProposalArtifact`.
- validate AI proposals via `validateAiTagProposalArtifact`.
- write four artifacts.
- print:
  - Items
  - Auto approved
  - Needs review
  - Needs visual
  - Conflict items

- [ ] **Step 5: Verify Task 4**

```bash
node scripts/tests/rag/tag-proposal-merge-core.test.mjs
node scripts/tests/rag/tag-proposal-merge-cli.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add scripts/rag/tag-proposal-merge-core.mjs scripts/rag/merge-tag-proposals.mjs scripts/tests/rag/tag-proposal-merge-core.test.mjs scripts/tests/rag/tag-proposal-merge-cli.test.mjs
git commit -m "feat: merge ai and rule tag proposals"
```

---

## Task 5: Local Tag Review UI

**Files:**
- Create: `scripts/rag/tag-review-ui-core.mjs`
- Create: `scripts/rag/build-tag-review-ui.mjs`
- Create: `scripts/tests/rag/tag-review-ui-core.test.mjs`
- Create: `scripts/tests/rag/tag-review-ui-cli.test.mjs`

**Interfaces:**
- Consumes:
  - `tag_review_queue.json`
  - taxonomy
  - KaTeX CSS/JS from `node_modules/katex`
- Produces:
  - `renderTagReviewHtml(appData, { katexCss, katexJs })`
  - `buildTagReviewAppData({ queue, taxonomy, queueSourceFile, queueSourceSha256, generatedAt })`
  - `buildTagReviewManifest(appData)`
  - browser export: `tag_review_records.json`

- [ ] **Step 1: Write UI core tests**

Test requirements:

```js
const appData = buildTagReviewAppData({ queue, taxonomy, queueSourceFile: "tag_review_queue.json", queueSourceSha256: "abc123456789", generatedAt });
assert.equal(appData.app_version, "tag-review-ui-v1");
assert.equal(appData.storage_key, "mathtrace.tagReview.abc123456789");
assert.equal(appData.storage_notice.includes("导出前请勿重新生成"), true);
assert.equal(appData.taxonomy.taxonomy_id, "math_derivative_v0");
assert.equal(appData.items[0].rendered_html.includes("katex"), true);

const html = renderTagReviewHtml(appData, { katexCss: "", katexJs: "" });
assert.equal(html.includes("MathTrace Tag Review"), true);
assert.equal(html.includes("target_skills"), true);
assert.equal(html.includes("tangent_slope"), true);
assert.equal(html.includes("</script><script>"), false);

const records = buildCompatibleReviewRecords({
  appData,
  reviewState: {
    "practice-candidate-1": {
      status: "approved",
      target_skills: ["tangent_slope"],
      method_tags: ["derivative_definition"],
      feature_flags: ["has_choice_options"],
      note: "确认",
    },
  },
});
assert.equal(records[0].review_status, "approved");
assert.equal(records[0].tag_source, "human");
```

- [ ] **Step 2: Implement UI core**

Follow `candidate-review-ui-core.mjs` patterns:

- `renderMathTextToHtml`.
- `escapeScriptJson`.
- static HTML with embedded app data.
- `localStorage` state per queue hash.
- visible but concise notice: "导出前请勿重新生成 queue；重新生成后本页本地草稿可能不会自动恢复。"
- left list with gate reasons.
- right detail with:
  - rendered question
  - rule tags
  - AI tags
  - gate reasons
  - taxonomy-driven checkboxes
  - status buttons
  - note textarea
  - copy/download JSON

Browser export record format must match P2.2 review records:

```js
{
  item_id,
  review_status,
  reviewed_tags: { target_skills, method_tags, feature_flags },
  review_notes,
  has_manual_tag_correction: true,
  tag_source: "human"
}
```

- [ ] **Step 3: Write CLI tests**

CLI command:

```bash
node scripts/rag/build-tag-review-ui.mjs --queue <tag_review_queue.json> --out <dir>
```

Tests assert:

- `index.html` and `tag_review_manifest.json` written.
- KaTeX failure is surfaced clearly.
- missing queue returns exit 2.
- bad JSON returns exit 1.
- stdout has counts only.

- [ ] **Step 4: Implement CLI**

Use candidate review CLI patterns:

- `readKatexCss`.
- `readKatexJs`.
- `copyKatexFonts`.
- `createHash("sha256")`.
- default out: `artifacts/rag/tag-review`.

- [ ] **Step 5: Verify Task 5**

```bash
node scripts/tests/rag/tag-review-ui-core.test.mjs
node scripts/tests/rag/tag-review-ui-cli.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add scripts/rag/tag-review-ui-core.mjs scripts/rag/build-tag-review-ui.mjs scripts/tests/rag/tag-review-ui-core.test.mjs scripts/tests/rag/tag-review-ui-cli.test.mjs
git commit -m "feat: add local tag review ui"
```

---

## Task 6: Review Record Merge CLI

**Files:**
- Create: `scripts/rag/merge-tag-review-records.mjs`
- Create: `scripts/tests/rag/tag-review-record-merge-cli.test.mjs`

**Interfaces:**
- Consumes:
  - `auto_tag_review_records.json`
  - `tag_review_records.json`
- Produces:
  - `final_tag_review_records.json`
  - `tag_review_record_merge_summary.json`

- [ ] **Step 1: Write CLI test**

Create `scripts/tests/rag/tag-review-record-merge-cli.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const tmpRoot = resolve("artifacts/tmp/p23-tag-review-record-merge-cli-test");
mkdirSync(tmpRoot, { recursive: true });

const autoPath = join(tmpRoot, "auto_tag_review_records.json");
const humanPath = join(tmpRoot, "tag_review_records.json");
const outDir = join(tmpRoot, "out");

writeFileSync(autoPath, JSON.stringify([
  {
    item_id: "practice-candidate-1",
    review_status: "approved",
    reviewed_tags: {
      target_skills: ["tangent_slope"],
      method_tags: ["derivative_definition"],
      feature_flags: ["has_choice_options"],
    },
    review_notes: "auto gate",
    has_manual_tag_correction: false,
    tag_source: "llm",
  },
  {
    item_id: "practice-candidate-2",
    review_status: "approved",
    reviewed_tags: {
      target_skills: ["monotonicity"],
      method_tags: ["monotonicity_by_derivative"],
      feature_flags: [],
    },
    review_notes: "auto gate",
    has_manual_tag_correction: false,
    tag_source: "llm",
  },
]));

writeFileSync(humanPath, JSON.stringify([
  {
    item_id: "practice-candidate-2",
    review_status: "approved",
    reviewed_tags: {
      target_skills: ["parameter_range"],
      method_tags: ["parameter_classification"],
      feature_flags: [],
    },
    review_notes: "human override",
    has_manual_tag_correction: true,
    tag_source: "human",
  },
]));

const result = spawnSync(process.execPath, [
  "scripts/rag/merge-tag-review-records.mjs",
  "--auto", autoPath,
  "--human", humanPath,
  "--out", outDir,
], { encoding: "utf8" });

assert.equal(result.status, 0);
assert.equal(result.stdout.includes("Final records: 2"), true);
assert.equal(result.stdout.includes("human override"), false);

const finalRecords = JSON.parse(readFileSync(join(outDir, "final_tag_review_records.json"), "utf8"));
assert.equal(finalRecords.length, 2);
assert.equal(finalRecords.find((record) => record.item_id === "practice-candidate-2").tag_source, "human");
assert.deepEqual(
  finalRecords.find((record) => record.item_id === "practice-candidate-2").reviewed_tags.target_skills,
  ["parameter_range"],
);

const duplicateHumanPath = join(tmpRoot, "duplicate_tag_review_records.json");
writeFileSync(duplicateHumanPath, JSON.stringify([
  {
    item_id: "practice-candidate-3",
    review_status: "approved",
    reviewed_tags: { target_skills: ["zero_point"], method_tags: ["zero_count"], feature_flags: [] },
    review_notes: "duplicate a",
    has_manual_tag_correction: true,
    tag_source: "human",
  },
  {
    item_id: "practice-candidate-3",
    review_status: "needs_fix",
    reviewed_tags: { target_skills: [], method_tags: [], feature_flags: [] },
    review_notes: "duplicate b",
    has_manual_tag_correction: true,
    tag_source: "human",
  },
]));
const duplicateResult = spawnSync(process.execPath, [
  "scripts/rag/merge-tag-review-records.mjs",
  "--auto", autoPath,
  "--human", duplicateHumanPath,
  "--out", join(tmpRoot, "duplicate-out"),
], { encoding: "utf8" });
assert.equal(duplicateResult.status, 1);
assert.equal(duplicateResult.stderr.includes("duplicate item_id"), true);

console.log("tag review record merge cli tests passed");
```

- [ ] **Step 2: Implement CLI**

Create `scripts/rag/merge-tag-review-records.mjs` with:

- args: `--auto`, `--human`, `--out`, `--help`.
- default output dir: `artifacts/rag/tag-review`.
- reject duplicate `item_id` within auto records.
- reject duplicate `item_id` within human records.
- human records override auto records by `item_id`.
- stable ordering: auto order first, overridden items keep their original position, human-only records append at the end.
- output files:
  - `final_tag_review_records.json`
  - `tag_review_record_merge_summary.json`

Core merge logic:

```js
function mergeReviewRecords({ autoRecords, humanRecords }) {
  const mergedByItemId = new Map();
  const order = [];
  for (const record of autoRecords) {
    if (!mergedByItemId.has(record.item_id)) order.push(record.item_id);
    mergedByItemId.set(record.item_id, record);
  }
  for (const record of humanRecords) {
    if (!mergedByItemId.has(record.item_id)) order.push(record.item_id);
    mergedByItemId.set(record.item_id, record);
  }
  return order.map((itemId) => mergedByItemId.get(itemId));
}
```

Do not print full records or notes to stdout; print only counts:

```text
Auto records: 2
Human records: 1
Final records: 2
Human overrides: 1
```

- [ ] **Step 3: Verify CLI test**

```bash
node scripts/tests/rag/tag-review-record-merge-cli.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit Task 6**

```bash
git add scripts/rag/merge-tag-review-records.mjs scripts/tests/rag/tag-review-record-merge-cli.test.mjs
git commit -m "feat: merge tag review records"
```

---

## Task 7: Test Runner And Integration Flow

**Files:**
- Modify: `scripts/run-tests.mjs`
- Modify: `scripts/rag/enriched-practice-corpus-core.mjs`
- Modify: `scripts/tests/rag/enriched-practice-corpus-core.test.mjs`
- Modify: `scripts/tests/rag/enriched-practice-corpus-cli.test.mjs`
- Optional modify: `docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md`

**Interfaces:**
- Consumes all P2.3 tests.
- Ensures final review records remain compatible with `build-enriched-practice-corpus.mjs --review`.

- [ ] **Step 1: Add P2.3 tests to `scripts/run-tests.mjs`**

Add these near P2.2 RAG tests:

```js
"scripts/tests/rag/ai-tag-proposal-core.test.mjs",
"scripts/tests/rag/ai-tag-proposal-cli.test.mjs",
"scripts/tests/rag/tag-proposal-merge-core.test.mjs",
"scripts/tests/rag/tag-proposal-merge-cli.test.mjs",
"scripts/tests/rag/tag-review-ui-core.test.mjs",
"scripts/tests/rag/tag-review-ui-cli.test.mjs",
"scripts/tests/rag/tag-review-record-merge-cli.test.mjs",
```

- [ ] **Step 2: Add enriched corpus compatibility test**

Extend `enriched-practice-corpus-core.test.mjs` with a synthetic review record from P2.3:

```js
const p23ReviewRecords = [{
  item_id: "practice-candidate-1",
  review_status: "approved",
  reviewed_tags: {
    target_skills: ["tangent_slope"],
    method_tags: ["derivative_definition"],
    feature_flags: ["has_choice_options"],
  },
  review_notes: "auto gate accepted",
  has_manual_tag_correction: false,
  tag_source: "llm",
  taxonomy_id: "math_derivative_v0",
  review_origin: "auto_gate",
  ai_confidence: "high",
  rule_ai_agreement: "high_confidence_rule_ai_agreement",
}];
const enriched = buildEnrichedPracticeCorpus({ corpus, proposalArtifact, reviewRecords: p23ReviewRecords, generatedAt, sourceCorpusFile, sourceTagProposalFile });
assert.equal(enriched.items[0].tag_review_meta.tag_source, "llm");
assert.equal(enriched.items[0].tag_review_meta.review_status, "approved");
assert.equal(enriched.items[0].tag_review_meta.review_origin, "auto_gate");
assert.equal(enriched.items[0].tag_review_meta.ai_confidence, "high");
assert.equal(enriched.items[0].tag_review_meta.rule_ai_agreement, "high_confidence_rule_ai_agreement");
```

Update `enriched-practice-corpus-core.mjs` so optional review fields are copied into `tag_review_meta` only when present:

```js
tag_review_meta: {
  review_status: record.review_status,
  proposal_confidence,
  has_manual_tag_correction: record.has_manual_tag_correction,
  tag_source: record.tag_source,
  review_origin: record.review_origin ?? null,
  ai_confidence: record.ai_confidence ?? null,
  rule_ai_agreement: record.rule_ai_agreement ?? null,
}
```

These audit fields are not used for retrieval scoring.

- [ ] **Step 3: Run focused tests**

```bash
node scripts/tests/rag/practice-tag-taxonomy.test.mjs
node scripts/tests/rag/ai-tag-proposal-core.test.mjs
node scripts/tests/rag/ai-tag-proposal-cli.test.mjs
node scripts/tests/rag/tag-proposal-merge-core.test.mjs
node scripts/tests/rag/tag-proposal-merge-cli.test.mjs
node scripts/tests/rag/tag-review-ui-core.test.mjs
node scripts/tests/rag/tag-review-ui-cli.test.mjs
node scripts/tests/rag/tag-review-record-merge-cli.test.mjs
node scripts/tests/rag/enriched-practice-corpus-core.test.mjs
```

Expected: all PASS.

- [ ] **Step 4: Run default suite**

```bash
node scripts/run-tests.mjs default
```

Expected: all PASS.

- [ ] **Step 5: Commit Task 7**

```bash
git add scripts/run-tests.mjs scripts/tests/rag/enriched-practice-corpus-core.test.mjs scripts/tests/rag/enriched-practice-corpus-cli.test.mjs
git commit -m "test: cover p23 tag review integration"
```

---

## Task 8: Real Local Smoke, Documentation, And Final Verification

**Files:**
- Modify: `interview/mathtrace-project-narrative.md`
- Optional modify: `docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md`
- Generated, not committed:
  - `artifacts/rag/ai-tag-proposals/**`
  - `artifacts/rag/tag-review/**`
  - `artifacts/rag/enriched-practice-corpus/**`
  - `artifacts/rag/variant-practice-agent/**`

**Interfaces:**
- Consumes P2.3 CLIs.
- Produces local smoke summaries.

- [ ] **Step 1: Generate rule proposals if needed**

```bash
node scripts/rag/build-practice-tag-proposals.mjs \
  --corpus artifacts/rag/practice-corpus/practice_corpus.json \
  --out artifacts/rag/tag-proposals
```

Expected stdout:

- output paths.
- item count.
- high confidence count.
- no full question text.

- [ ] **Step 2: Generate AI proposals**

Run only when `RAG_TAG_PROVIDER_*` is configured locally:

```bash
node scripts/rag/build-ai-tag-proposals.mjs \
  --corpus artifacts/rag/practice-corpus/practice_corpus.json \
  --rules artifacts/rag/tag-proposals/candidate_tag_proposals.json \
  --taxonomy math_derivative_v0 \
  --out artifacts/rag/ai-tag-proposals
```

Expected stdout:

- `Items: 69`
- high / medium / low summary.
- no full question text.
- no API key.

If provider is not configured, do not fake a real smoke. Report that code/tests passed and real AI smoke was skipped due missing `RAG_TAG_PROVIDER_*`.

- [ ] **Step 3: Merge rule + AI proposals**

```bash
node scripts/rag/merge-tag-proposals.mjs \
  --corpus artifacts/rag/practice-corpus/practice_corpus.json \
  --rules artifacts/rag/tag-proposals/candidate_tag_proposals.json \
  --ai artifacts/rag/ai-tag-proposals/candidate_ai_tag_proposals.json \
  --out artifacts/rag/tag-review
```

Record:

- item_count.
- auto_approved_count.
- review_queue_count.
- needs_visual_count.
- conflict_count.

- [ ] **Step 4: Build review UI**

```bash
node scripts/rag/build-tag-review-ui.mjs \
  --queue artifacts/rag/tag-review/tag_review_queue.json \
  --out artifacts/rag/tag-review
```

Open locally if useful:

```bash
open artifacts/rag/tag-review/index.html
```

Do not commit generated files.

- [ ] **Step 5: Merge review records**

If the user has exported `tag_review_records.json`, merge it with auto records:

```bash
node scripts/rag/merge-tag-review-records.mjs \
  --auto artifacts/rag/tag-review/auto_tag_review_records.json \
  --human artifacts/rag/tag-review/tag_review_records.json \
  --out artifacts/rag/tag-review
```

Expected:

- `final_tag_review_records.json` exists.
- human records override auto records for the same `item_id`.
- stdout prints only counts.

- [ ] **Step 6: Generate enriched corpus from final review records**

```bash
node scripts/rag/build-enriched-practice-corpus.mjs \
  --corpus artifacts/rag/practice-corpus/practice_corpus.json \
  --proposals artifacts/rag/tag-proposals/candidate_tag_proposals.json \
  --review artifacts/rag/tag-review/final_tag_review_records.json \
  --out artifacts/rag/enriched-practice-corpus
```

Expected:

- no schema errors.
- `Approved` reflects auto + human accepted records.

- [ ] **Step 7: Run Agent evaluation**

```bash
node scripts/rag/recommend-variant-practice.mjs \
  --corpus artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json \
  --query artifacts/rag/variant-practice-agent/demo-query.json \
  --out artifacts/rag/variant-practice-agent \
  --limit 12
```

Record:

- recommendation count.
- candidate count.
- warning list.

- [ ] **Step 8: Update interview narrative**

Add a P2.3 section to `interview/mathtrace-project-narrative.md` only after implementation and verification. It must explain:

- AI does proposal, not final truth.
- taxonomy-aware design means future topics add config, not rewrite system.
- auto-approval gate conditions.
- review queue reduces manual work.
- real smoke numbers or skipped reason.

- [ ] **Step 9: Final verification**

Run:

```bash
git diff --check
node scripts/run-tests.mjs default
npm run lint
npm run build
git status --short
git ls-files artifacts docs/reviews .superpowers/sdd
git ls-files .env.local
```

Expected:

- tests/lint/build pass.
- `git diff --check` no output.
- no tracked artifacts/reviews/.env.

- [ ] **Step 10: Commit final docs**

```bash
git add interview/mathtrace-project-narrative.md docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md
git commit -m "docs: add p23 ai tag review narrative"
```

---

## Review Checklist For Implementer

Before asking for Claude Code implementation review:

- [ ] P2.3 did not modify product frontend or API routes.
- [ ] P2.3 did not touch database, memory events, student profiles, mistake book, or evidence API.
- [ ] AI provider key is never committed, printed, or embedded in artifacts.
- [ ] Tests do not require network.
- [ ] `candidate_ai_tag_proposals.json`, `tag_review_queue.json`, `tag_review_records.json`, `enriched_practice_corpus.json`, and recommendations remain ignored local artifacts.
- [ ] Unknown AI tags are rejected or removed before merge/gate.
- [ ] `needs_visual` items are not auto-approved.
- [ ] `tag_review_records.json` is compatible with existing enriched corpus builder.
- [ ] `sample_diagnosis` remains stable.

## Execution Handoff

Plan complete. Recommended implementation mode:

1. **Subagent-Driven (recommended)** - one fresh subagent per task, review after each task, especially because provider, gate, and UI are separable.
2. **Inline Execution** - acceptable only if the user wants tighter manual control.

For this codebase and task, use subagent-driven implementation with high reasoning.
