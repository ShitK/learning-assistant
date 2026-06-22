# P2.1 Variant Practice Agent MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local deterministic Variant Practice Agent MVP that uses `practice_corpus.json` as a search tool and returns up to 3 explainable practice recommendations.

**Architecture:** Keep search and agent orchestration separate. `practice-corpus-search-core.mjs` returns top-k candidates from the local corpus; `variant-practice-agent-core.mjs` analyzes a practice need, calls the search tool, ranks candidates, and returns a structured recommendation result. A small CLI reads a local corpus and query JSON, writes an ignored recommendations artifact, and prints only summary output.

**Tech Stack:** Node.js ESM scripts, `node:fs/promises`, `node:path`, existing `scripts/run-tests.mjs`, local ignored artifacts under `artifacts/rag/**`.

## Global Constraints

- Do not modify `src/app/**`, `app/api/**`, `components/**`, diagnosis pipeline, persistence, Supabase schema, `memory_events`, `student_profiles`, mistake book behavior, evidence API, pgvector, embedding, or production retrieval APIs.
- Do not commit real `practice_corpus.json`, generated recommendations, PDFs, MinerU JSON, reviewed seed, page images, or anything under `artifacts/`.
- Do not read or print `.env.local`, service role keys, model API keys, or external API credentials.
- Preserve the existing user-modified `.nvmrc`; do not stage it unless explicitly requested.
- `docs/reviews/*.md` remains local-only unless the user explicitly asks to commit a review file.
- Keep `sample_diagnosis` stable and untouched.
- Tests must use synthetic fixture text, not real教辅题文.
- First MVP is deterministic: no LLM generation, no LLM rerank, no external network, no pgvector.
- `practice_corpus.json` is an ignored local sensitive artifact and must not be committed or printed in full.
- RAG remains a retrieval/recommendation layer for variant-practice sourcing; it must not write or decide `memory_events` / `student_profiles`.
- Agent output recommendations come from corpus items; the Agent must not invent new题目.

---

## File Structure

- Create `scripts/rag/practice-corpus-search-core.mjs`
  - Validate the minimal practice corpus shape.
  - Normalize a practice query into searchable terms.
  - Score corpus items with transparent metadata/text scoring.
  - Return top-k search candidates with `matched_dimensions`.
- Create `scripts/rag/variant-practice-agent-core.mjs`
  - Analyze a practice need.
  - Call `searchPracticeCorpus`.
  - Rank and classify up to 3 recommendations.
  - Return structured Agent result with warnings.
- Create `scripts/rag/recommend-variant-practice.mjs`
  - CLI entry point.
  - Read local corpus and query JSON.
  - Call the Agent.
  - Write `artifacts/rag/variant-practice-agent/recommendations.json` by default.
  - Print only summary output.
- Create `scripts/tests/rag/practice-corpus-search-core.test.mjs`
- Create `scripts/tests/rag/variant-practice-agent-core.test.mjs`
- Create `scripts/tests/rag/variant-practice-agent-cli.test.mjs`
- Modify `scripts/run-tests.mjs`
  - Add the three new tests near existing RAG tests.
- Modify `docs/superpowers/specs/2026-06-22-p21-variant-practice-agent-mvp-design.md`
  - Add an implementation handoff section after implementation if behavior differs from this plan.
- Modify `interview/mathtrace-project-narrative.md`
  - Add a P2.1 stage after the real local Agent demo has evidence.
- Optional generated artifact, not committed:
  - `artifacts/rag/variant-practice-agent/recommendations.json`

## Data Contracts

### Practice Query

```js
{
  id: "demo-derivative-tangent-slope",
  question_text: "设函数 f(x) 在点 x=1 处可导，已知极限式，求曲线在该点处的切线斜率。",
  knowledge_points: ["derivative"],
  section_title: "考点 1 导数的概念、几何意义与运算",
  mistake_causes: ["derivative_definition_confusion"],
  target_skills: ["导数几何意义", "切线斜率", "极限式识别导数"],
  student_profile_hint: {
    weak_knowledge_points: ["derivative"],
    recent_mistake_causes: ["derivative_definition_confusion"]
  }
}
```

### Search Candidate

```js
{
  item: {
    id: "practice-candidate-1",
    source_candidate_id: "candidate-1",
    question_text: "1. ...",
    search_text: "1. ...\n导数\n考点 1 ...",
    knowledge_points: ["derivative"],
    section_title: "考点 1 导数的概念",
    difficulty: null,
    source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" }
  },
  score: 18,
  matched_dimensions: ["knowledge_point", "section_title", "target_skill", "query_term"],
  match_reasons: ["同知识点 derivative", "同章节：考点 1 导数的概念", "命中目标技能：切线斜率"]
}
```

### Agent Result

```js
{
  agent_version: "variant-practice-agent-v0",
  query_id: "demo-derivative-tangent-slope",
  practice_goal: {
    knowledge_points: ["derivative"],
    target_skills: ["导数几何意义", "切线斜率", "极限式识别导数"],
    mistake_causes: ["derivative_definition_confusion"],
    summary: "优先巩固导数几何意义，并练习从极限式识别切线斜率。"
  },
  agent_steps: [
    {
      id: "analyze_practice_need",
      status: "completed",
      summary: "识别练习目标：导数几何意义、切线斜率。"
    },
    {
      id: "search_corpus",
      status: "completed",
      summary: "从 practice_corpus 中召回 8 道候选题。"
    },
    {
      id: "rank_candidates",
      status: "completed",
      summary: "按巩固、变式、迁移筛选候选题。"
    },
    {
      id: "build_recommendations",
      status: "completed",
      summary: "生成 3 道变式练习推荐。"
    }
  ],
  rationale: "基于当前错因，先在同章节巩固导数几何意义，再用跨章节题训练迁移，最后做综合应用。",
  search_summary: {
    corpus_version: "practice-corpus-v0",
    searched_items: 69,
    candidate_count: 8
  },
  recommendations: [
    {
      rank: 1,
      recommendation_type: "foundation",
      item_id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "1. ...",
      reason: "同属导数几何意义，题干包含切线斜率，适合作为第一道巩固题。",
      matched_dimensions: ["knowledge_point", "section_title", "target_skill"],
      score: 18,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" }
    }
  ],
  warnings: []
}
```

---

### Task 1: Practice Corpus Search Tool

**Files:**
- Create: `scripts/rag/practice-corpus-search-core.mjs`
- Create: `scripts/tests/rag/practice-corpus-search-core.test.mjs`

**Interfaces:**
- Produces:
  - `validatePracticeCorpus(value): { ok: true, corpus } | { ok: false, errors: string[] }`
  - `normalizePracticeQuery(query): PracticeNeed`
  - `searchPracticeCorpus({ corpus, query, limit }): SearchCandidate[]`
- Consumed by Task 2:
  - `searchPracticeCorpus({ corpus, query, limit })`
  - `normalizePracticeQuery(query)`

- [ ] **Step 1: Write failing search core tests**

Create `scripts/tests/rag/practice-corpus-search-core.test.mjs`:

```js
import assert from "node:assert/strict";

import {
  normalizePracticeQuery,
  searchPracticeCorpus,
  validatePracticeCorpus,
} from "../../rag/practice-corpus-search-core.mjs";

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-22T10:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: "2026-06-22T09:00:00.000Z",
  item_count: 4,
  items: [
    {
      id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知函数在点处可导，求曲线切线斜率.",
      search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数\n考点 1 导数的概念",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      difficulty: null,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
      review_meta: { original_question_text: "ocr" },
    },
    {
      id: "practice-candidate-2",
      source_candidate_id: "candidate-2",
      question_text: "2. 已知函数单调递增，求参数范围.",
      search_text: "2. 已知函数单调递增，求参数范围.\n导数\n考点 2 导数与函数的单调性",
      knowledge_points: ["derivative"],
      section_title: "考点 2 导数与函数的单调性",
      difficulty: null,
      source_ref: { pdf_page_index: 2, section_title: "考点 2 导数与函数的单调性" },
      review_meta: {},
    },
    {
      id: "practice-candidate-3",
      source_candidate_id: "candidate-3",
      question_text: "3. 三角函数求值.",
      search_text: "3. 三角函数求值.\n三角函数",
      knowledge_points: ["trigonometry"],
      section_title: "三角函数",
      difficulty: null,
      source_ref: { pdf_page_index: 3, section_title: "三角函数" },
      review_meta: {},
    },
    {
      id: "practice-candidate-4",
      source_candidate_id: "candidate-4",
      question_text: "4. 利用导数研究零点个数.",
      search_text: "4. 利用导数研究零点个数.\n导数\n考点 4 导数与零点",
      knowledge_points: ["derivative"],
      section_title: "考点 4 导数与零点",
      difficulty: null,
      source_ref: { pdf_page_index: 4, section_title: "考点 4 导数与零点" },
      review_meta: {},
    },
  ],
};

const query = {
  id: "query-1",
  question_text: "设函数在点处可导，已知极限式，求切线斜率.",
  knowledge_points: ["derivative"],
  section_title: "考点 1 导数的概念",
  mistake_causes: ["derivative_definition_confusion"],
  target_skills: ["导数几何意义", "切线斜率", "极限式识别导数"],
};

{
  const validation = validatePracticeCorpus(corpus);
  assert.equal(validation.ok, true);

  const invalid = validatePracticeCorpus({ items: "bad" });
  assert.equal(invalid.ok, false);
  assert.equal(
    invalid.errors.some((error) => error.includes("items must be an array")),
    true,
  );

  const invalidItem = structuredClone(corpus);
  invalidItem.items[0].id = 123;
  invalidItem.items[0].question_text = "";
  invalidItem.items[0].source_ref = "bad";
  const invalidItemResult = validatePracticeCorpus(invalidItem);
  assert.equal(invalidItemResult.ok, false);
  assert.equal(
    invalidItemResult.errors.some((error) => error.includes("item[0].id must be a string")),
    true,
  );
  assert.equal(
    invalidItemResult.errors.some((error) =>
      error.includes("item[0].question_text must be a non-empty string"),
    ),
    true,
  );
  assert.equal(
    invalidItemResult.errors.some((error) =>
      error.includes("item[0].source_ref must be an object or null when present"),
    ),
    true,
  );
}

{
  const need = normalizePracticeQuery(query);
  assert.equal(need.id, "query-1");
  assert.deepEqual(need.knowledge_points, ["derivative"]);
  assert.equal(need.target_skills.includes("切线斜率"), true);
  assert.equal(need.search_terms.includes("切线斜率"), true);
  assert.equal(need.search_terms.includes("极限"), true);
}

{
  const results = searchPracticeCorpus({ corpus, query, limit: 3 });
  assert.equal(results.length, 3);
  assert.equal(results[0].item.id, "practice-candidate-1");
  assert.equal(results[0].matched_dimensions.includes("knowledge_point"), true);
  assert.equal(results[0].matched_dimensions.includes("section_title"), true);
  assert.equal(results[0].matched_dimensions.includes("target_skill"), true);
  assert.equal(results[0].matched_dimensions.includes("query_term"), true);
  assert.equal(
    results[0].match_reasons.some((reason) => reason.includes("切线斜率")),
    true,
  );
  assert.equal("review_meta" in results[0].item, true);
}

{
  const results = searchPracticeCorpus({ corpus, query, limit: 2 });
  assert.equal(results.length, 2);
  assert.equal(results.every((result) => result.score > 0), true);
}

{
  const trigQuery = {
    id: "query-trig",
    question_text: "三角函数求值",
    knowledge_points: ["trigonometry"],
    section_title: "三角函数",
    target_skills: ["三角函数"],
    mistake_causes: [],
  };
  const results = searchPracticeCorpus({ corpus, query: trigQuery, limit: 2 });
  assert.equal(results[0].item.id, "practice-candidate-3");
  assert.equal(results[0].score > results[1].score, true);
}

{
  const emptyResults = searchPracticeCorpus({
    corpus,
    query: { id: "empty", question_text: "", knowledge_points: [], target_skills: [] },
    limit: 5,
  });
  assert.deepEqual(emptyResults, []);
}

console.log("practice corpus search core tests passed");
```

- [ ] **Step 2: Run search core test and verify it fails**

Run:

```bash
node scripts/tests/rag/practice-corpus-search-core.test.mjs
```

Expected:

```text
Error [ERR_MODULE_NOT_FOUND]
```

- [ ] **Step 3: Implement search core**

Create `scripts/rag/practice-corpus-search-core.mjs`:

```js
const DEFAULT_LIMIT = 8;
// P2.1 only covers the derivative corpus. Chinese segmentation is intentionally
// deferred; search terms come from target_skills plus this small domain lexicon.
const DERIVATIVE_SEARCH_TERMS = [
  "导数",
  "几何意义",
  "切线",
  "斜率",
  "极限",
  "单调",
  "极值",
  "零点",
  "不等式",
  "参数",
  "恒成立",
];

export function validatePracticeCorpus(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["corpus must be an object"] };
  }
  if (value.corpus_version !== "practice-corpus-v0") {
    errors.push("corpus_version must be practice-corpus-v0");
  }
  if (!Array.isArray(value.items)) {
    errors.push("items must be an array");
  } else {
    value.items.forEach((item, index) => validateCorpusItem(item, index, errors));
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, corpus: value };
}

export function normalizePracticeQuery(query) {
  const safeQuery = query && typeof query === "object" ? query : {};
  const questionText = typeof safeQuery.question_text === "string" ? safeQuery.question_text : "";
  const targetSkills = filterStringArray(safeQuery.target_skills);
  const sectionTitle =
    typeof safeQuery.section_title === "string" && safeQuery.section_title.trim()
      ? safeQuery.section_title.trim()
      : null;
  const knowledgePoints = filterStringArray(safeQuery.knowledge_points);
  const mistakeCauses = filterStringArray(safeQuery.mistake_causes);
  const searchTerms = buildSearchTerms({
    questionText,
    targetSkills,
    sectionTitle,
  });

  return {
    id: typeof safeQuery.id === "string" && safeQuery.id.trim() ? safeQuery.id : "practice-query",
    question_text: questionText,
    knowledge_points: knowledgePoints,
    section_title: sectionTitle,
    mistake_causes: mistakeCauses,
    target_skills: targetSkills,
    search_terms: searchTerms,
  };
}

export function searchPracticeCorpus({ corpus, query, limit = DEFAULT_LIMIT }) {
  const need = normalizePracticeQuery(query);
  if (need.search_terms.length === 0 && need.knowledge_points.length === 0 && !need.section_title) {
    return [];
  }

  return corpus.items
    .map((item) => scoreCorpusItem(item, need))
    .filter((candidate) => candidate.score > 0)
    .sort(compareCandidates)
    .slice(0, normalizeLimit(limit));
}

function scoreCorpusItem(item, need) {
  const matchedDimensions = [];
  const matchReasons = [];
  let score = 0;

  const itemKnowledgePoints = filterStringArray(item.knowledge_points);
  const knowledgeMatches = need.knowledge_points.filter((point) =>
    itemKnowledgePoints.includes(point),
  );
  if (knowledgeMatches.length > 0) {
    score += 8 * knowledgeMatches.length;
    matchedDimensions.push("knowledge_point");
    matchReasons.push(`同知识点 ${knowledgeMatches.join(", ")}`);
  }

  const itemSectionTitle =
    typeof item.section_title === "string" && item.section_title.trim()
      ? item.section_title
      : null;
  if (need.section_title && itemSectionTitle === need.section_title) {
    score += 5;
    matchedDimensions.push("section_title");
    matchReasons.push(`同章节：${itemSectionTitle}`);
  } else if (need.section_title && itemSectionTitle && hasSharedSectionPrefix(need.section_title, itemSectionTitle)) {
    score += 2;
    matchedDimensions.push("section_title");
    matchReasons.push(`相关章节：${itemSectionTitle}`);
  }

  const searchable = `${item.question_text ?? ""}\n${item.search_text ?? ""}\n${itemSectionTitle ?? ""}`;
  for (const skill of need.target_skills) {
    if (searchable.includes(skill) || skillIncludesSearchableTerm(skill, searchable)) {
      score += 4;
      matchedDimensions.push("target_skill");
      matchReasons.push(`命中目标技能：${skill}`);
    }
  }

  const matchedTerms = need.search_terms.filter((term) => searchable.includes(term));
  if (matchedTerms.length > 0) {
    score += matchedTerms.length;
    matchedDimensions.push("query_term");
    matchReasons.push(`命中关键词：${[...new Set(matchedTerms)].slice(0, 5).join("、")}`);
  }

  return {
    item,
    score,
    matched_dimensions: [...new Set(matchedDimensions)],
    match_reasons: [...new Set(matchReasons)],
  };
}

function buildSearchTerms({ questionText, targetSkills, sectionTitle }) {
  const source = `${questionText}\n${targetSkills.join("\n")}\n${sectionTitle ?? ""}`;
  const terms = new Set();
  for (const skill of targetSkills) {
    if (skill.trim()) {
      terms.add(skill.trim());
    }
  }
  for (const term of DERIVATIVE_SEARCH_TERMS) {
    if (source.includes(term)) {
      terms.add(term);
    }
  }
  for (const token of source.match(/[A-Za-z][A-Za-z0-9_']*/g) ?? []) {
    if (token.length >= 2) {
      terms.add(token);
    }
  }
  return [...terms];
}

function skillIncludesSearchableTerm(skill, searchable) {
  return DERIVATIVE_SEARCH_TERMS.some((term) => skill.includes(term) && searchable.includes(term));
}

function hasSharedSectionPrefix(left, right) {
  return left.slice(0, 4) === right.slice(0, 4);
}

function compareCandidates(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  return String(left.item.id).localeCompare(String(right.item.id));
}

function normalizeLimit(limit) {
  return Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
}

function validateCorpusItem(item, index, errors) {
  const path = `item[${index}]`;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    errors.push(`${path} must be an object`);
    return;
  }
  requireString(item, "id", errors, path);
  requireString(item, "source_candidate_id", errors, path);
  requireNonEmptyString(item, "question_text", errors, path);
  requireNonEmptyString(item, "search_text", errors, path);
  if (!Array.isArray(item.knowledge_points)) {
    errors.push(`${path}.knowledge_points must be an array`);
  }
  if ("source_ref" in item && item.source_ref !== null && typeof item.source_ref !== "object") {
    errors.push(`${path}.source_ref must be an object or null when present`);
  }
}

function requireString(value, key, errors, path) {
  if (typeof value[key] !== "string") {
    errors.push(`${path}.${key} must be a string`);
  }
}

function requireNonEmptyString(value, key, errors, path) {
  if (typeof value[key] !== "string" || !value[key].trim()) {
    errors.push(`${path}.${key} must be a non-empty string`);
  }
}

function filterStringArray(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))]
    : [];
}
```

- [ ] **Step 4: Run search core test and verify it passes**

Run:

```bash
node scripts/tests/rag/practice-corpus-search-core.test.mjs
```

Expected:

```text
practice corpus search core tests passed
```

- [ ] **Step 5: Commit Task 1**

Before committing:

```bash
git status --short
```

Stage only:

```bash
git add scripts/rag/practice-corpus-search-core.mjs scripts/tests/rag/practice-corpus-search-core.test.mjs
git commit -m "feat: add practice corpus search tool"
```

Do not stage `.nvmrc`, artifacts, `docs/reviews/*.md`, `.superpowers/sdd/*`, or unrelated plan files.

---

### Task 2: Variant Practice Agent Core

**Files:**
- Create: `scripts/rag/variant-practice-agent-core.mjs`
- Create: `scripts/tests/rag/variant-practice-agent-core.test.mjs`

**Interfaces:**
- Consumes:
  - `searchPracticeCorpus({ corpus, query, limit })`
  - `normalizePracticeQuery(query)`
- Produces:
  - `recommendVariantPractice({ corpus, query, searchLimit }): VariantPracticeAgentResult`
  - `analyzePracticeNeed(query): PracticeGoal`

- [ ] **Step 1: Write failing Agent core tests**

Create `scripts/tests/rag/variant-practice-agent-core.test.mjs`:

```js
import assert from "node:assert/strict";

import {
  analyzePracticeNeed,
  recommendVariantPractice,
} from "../../rag/variant-practice-agent-core.mjs";

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-22T10:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: "2026-06-22T09:00:00.000Z",
  item_count: 4,
  items: [
    {
      id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知函数在点处可导，求曲线切线斜率.",
      search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数\n考点 1 导数的概念",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      difficulty: null,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
      review_meta: { original_question_text: "ocr text" },
      variant_level: "should_not_leak",
    },
    {
      id: "practice-candidate-2",
      source_candidate_id: "candidate-2",
      question_text: "2. 已知极限表达式，判断导数几何意义.",
      search_text: "2. 已知极限表达式，判断导数几何意义.\n导数\n考点 1 导数的概念",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      difficulty: null,
      source_ref: { pdf_page_index: 2, section_title: "考点 1 导数的概念" },
      review_meta: {},
    },
    {
      id: "practice-candidate-3",
      source_candidate_id: "candidate-3",
      question_text: "3. 结合切线斜率判断函数单调递增，求参数范围.",
      search_text: "3. 结合切线斜率判断函数单调递增，求参数范围.\n导数\n考点 2 导数与函数的单调性",
      knowledge_points: ["derivative"],
      section_title: "考点 2 导数与函数的单调性",
      difficulty: null,
      source_ref: { pdf_page_index: 3, section_title: "考点 2 导数与函数的单调性" },
      review_meta: {},
    },
    {
      id: "practice-candidate-4",
      source_candidate_id: "candidate-4",
      question_text: "4. 利用导数研究零点个数.",
      search_text: "4. 利用导数研究零点个数.\n导数\n考点 4 导数与零点",
      knowledge_points: ["derivative"],
      section_title: "考点 4 导数与零点",
      difficulty: null,
      source_ref: { pdf_page_index: 4, section_title: "考点 4 导数与零点" },
      review_meta: {},
    },
  ],
};

const query = {
  id: "demo-derivative-tangent-slope",
  question_text: "设函数在点处可导，已知极限式，求切线斜率.",
  knowledge_points: ["derivative"],
  section_title: "考点 1 导数的概念",
  mistake_causes: ["derivative_definition_confusion"],
  target_skills: ["导数几何意义", "切线斜率", "极限式识别导数"],
};

{
  const practiceNeed = analyzePracticeNeed(query);
  assert.deepEqual(practiceNeed.knowledge_points, ["derivative"]);
  assert.deepEqual(practiceNeed.mistake_causes, ["derivative_definition_confusion"]);
  assert.equal(practiceNeed.summary.includes("导数几何意义"), true);
  assert.equal(practiceNeed.summary.includes("切线斜率"), true);
  assert.equal("section_title" in practiceNeed, false);
}

{
  const result = recommendVariantPractice({ corpus, query, searchLimit: 4 });
  assert.equal(result.agent_version, "variant-practice-agent-v0");
  assert.equal(result.query_id, "demo-derivative-tangent-slope");
  assert.equal(result.practice_goal.summary.includes("切线斜率"), true);
  assert.equal("section_title" in result.practice_goal, false);
  assert.deepEqual(
    result.agent_steps.map((step) => step.id),
    ["analyze_practice_need", "search_corpus", "rank_candidates", "build_recommendations"],
  );
  assert.equal(result.rationale.includes("同章节"), true);
  assert.equal(result.search_summary.corpus_version, "practice-corpus-v0");
  assert.equal(result.search_summary.searched_items, 4);
  assert.equal(result.search_summary.candidate_count, 4);
  assert.equal(result.recommendations.length, 3);
  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.rank),
    [1, 2, 3],
  );
  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.recommendation_type),
    ["foundation", "near_transfer", "mixed_application"],
  );
  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.item_id),
    ["practice-candidate-1", "practice-candidate-3", "practice-candidate-4"],
  );
  assert.equal(result.recommendations[0].reason.includes("第一道"), true);
  assert.equal(result.recommendations[0].matched_dimensions.includes("knowledge_point"), true);
  assert.equal(result.recommendations[0].matched_dimensions.includes("section_title"), true);
  assert.notEqual(
    result.recommendations[1].source_ref.section_title,
    result.recommendations[0].source_ref.section_title,
  );
  assert.equal(result.recommendations[1].matched_dimensions.includes("target_skill"), true);
  assert.equal(result.recommendations[2].matched_dimensions.includes("target_skill"), false);
  assert.equal("review_meta" in result.recommendations[0], false);
  assert.equal("variant_level" in result.recommendations[0], false);
}

{
  const tinyCorpus = {
    ...corpus,
    item_count: 1,
    items: [corpus.items[0]],
  };
  const result = recommendVariantPractice({ corpus: tinyCorpus, query, searchLimit: 4 });
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.warnings.includes("insufficient_recommendations"), true);
}

{
  const noMatchResult = recommendVariantPractice({
    corpus,
    query: {
      id: "no-match",
      question_text: "",
      knowledge_points: [],
      target_skills: [],
      mistake_causes: [],
    },
    searchLimit: 4,
  });
  assert.equal(noMatchResult.recommendations.length, 0);
  assert.equal(noMatchResult.warnings.includes("no_candidates_found"), true);
}

console.log("variant practice agent core tests passed");
```

- [ ] **Step 2: Run Agent core test and verify it fails**

Run:

```bash
node scripts/tests/rag/variant-practice-agent-core.test.mjs
```

Expected:

```text
Error [ERR_MODULE_NOT_FOUND]
```

- [ ] **Step 3: Implement Agent core**

Create `scripts/rag/variant-practice-agent-core.mjs`:

```js
import {
  normalizePracticeQuery,
  searchPracticeCorpus,
} from "./practice-corpus-search-core.mjs";

const AGENT_VERSION = "variant-practice-agent-v0";

export function analyzePracticeNeed(query) {
  const need = normalizePracticeQuery(query);
  return {
    knowledge_points: need.knowledge_points,
    target_skills: need.target_skills,
    mistake_causes: need.mistake_causes,
    summary: buildPracticeGoalSummary(need),
  };
}

export function recommendVariantPractice({ corpus, query, searchLimit = 8 }) {
  const need = normalizePracticeQuery(query);
  const practiceGoal = analyzePracticeNeed(query);
  const candidates = searchPracticeCorpus({ corpus, query, limit: searchLimit });
  const warnings = [];
  if (candidates.length === 0) {
    warnings.push("no_candidates_found");
  }

  const rankedCandidates = rankPracticeCandidates(candidates);
  const selectedCandidates = selectRecommendationCandidates(rankedCandidates, need);
  const recommendations = selectedCandidates.map((selection, index) =>
    buildRecommendation(selection, index),
  );
  if (recommendations.length > 0 && recommendations.length < 3) {
    warnings.push("insufficient_recommendations");
  }

  const agentSteps = buildAgentSteps({ practiceGoal, candidates, recommendations });

  return {
    agent_version: AGENT_VERSION,
    query_id: need.id,
    practice_goal: practiceGoal,
    agent_steps: agentSteps,
    rationale: buildOverallRationale({ need, recommendations }),
    search_summary: {
      corpus_version: corpus.corpus_version,
      searched_items: Array.isArray(corpus.items) ? corpus.items.length : 0,
      candidate_count: candidates.length,
    },
    recommendations,
    warnings,
  };
}

function rankPracticeCandidates(candidates) {
  return [...candidates].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    const dimensionDelta =
      right.matched_dimensions.length - left.matched_dimensions.length;
    if (dimensionDelta !== 0) {
      return dimensionDelta;
    }
    return String(left.item.id).localeCompare(String(right.item.id));
  });
}

function selectRecommendationCandidates(candidates, need) {
  const selected = [];
  const usedIds = new Set();
  const addSelection = (recommendationType, candidate) => {
    if (!candidate || usedIds.has(candidate.item.id)) {
      return;
    }
    selected.push({ recommendationType, candidate });
    usedIds.add(candidate.item.id);
  };

  addSelection(
    "foundation",
    candidates.find((candidate) => isFoundationCandidate(candidate, need)),
  );
  addSelection(
    "near_transfer",
    candidates.find(
      (candidate) =>
        !usedIds.has(candidate.item.id) && isNearTransferCandidate(candidate, need),
    ),
  );
  addSelection(
    "mixed_application",
    candidates.find(
      (candidate) =>
        !usedIds.has(candidate.item.id) && isMixedApplicationCandidate(candidate, need),
    ),
  );

  return selected;
}

function isFoundationCandidate(candidate, need) {
  return (
    candidate.item.section_title === need.section_title &&
    candidate.matched_dimensions.includes("knowledge_point") &&
    candidate.matched_dimensions.includes("section_title")
  );
}

function isNearTransferCandidate(candidate, need) {
  const hasSameKnowledge = candidate.matched_dimensions.includes("knowledge_point");
  const hasDifferentSection = candidate.item.section_title !== need.section_title;
  const hasTargetSkill = candidate.matched_dimensions.includes("target_skill");
  return hasSameKnowledge && hasDifferentSection && hasTargetSkill;
}

function isMixedApplicationCandidate(candidate, need) {
  const hasSameKnowledge = candidate.matched_dimensions.includes("knowledge_point");
  const hasDifferentSection = candidate.item.section_title !== need.section_title;
  const hasTargetSkill = candidate.matched_dimensions.includes("target_skill");
  return hasSameKnowledge && hasDifferentSection && !hasTargetSkill;
}

function buildRecommendation(selection, index) {
  const { candidate, recommendationType } = selection;
  return {
    rank: index + 1,
    recommendation_type: recommendationType,
    item_id: candidate.item.id,
    source_candidate_id: candidate.item.source_candidate_id,
    question_text: candidate.item.question_text,
    reason: buildRecommendationReason(candidate, recommendationType, index),
    matched_dimensions: candidate.matched_dimensions,
    score: candidate.score,
    source_ref: candidate.item.source_ref ?? null,
  };
}

function buildRecommendationReason(candidate, recommendationType, index) {
  const orderText = ["第一道", "第二道", "第三道"][index] ?? "后续";
  const typeText = {
    foundation: "巩固题",
    near_transfer: "轻微变式题",
    mixed_application: "迁移应用题",
  }[recommendationType];
  const reasonText =
    candidate.match_reasons.length > 0
      ? candidate.match_reasons.slice(0, 2).join("；")
      : "与当前练习目标相关";
  return `${reasonText}，适合作为${orderText}${typeText}。`;
}

function buildPracticeGoalSummary(need) {
  const skillText =
    need.target_skills.length > 0 ? need.target_skills.join("、") : "当前知识点";
  const causeText =
    need.mistake_causes.length > 0 ? `针对 ${need.mistake_causes.join("、")}，` : "";
  return `${causeText}优先巩固${skillText}。`;
}

function buildAgentSteps({ practiceGoal, candidates, recommendations }) {
  return [
    {
      id: "analyze_practice_need",
      status: "completed",
      summary: `识别练习目标：${practiceGoal.target_skills.join("、") || "当前知识点"}。`,
    },
    {
      id: "search_corpus",
      status: "completed",
      summary: `从 practice_corpus 中召回 ${candidates.length} 道候选题。`,
    },
    {
      id: "rank_candidates",
      status: "completed",
      summary: "按同章节巩固、跨章节迁移和综合应用筛选候选题。",
    },
    {
      id: "build_recommendations",
      status: "completed",
      summary: `生成 ${recommendations.length} 道变式练习推荐。`,
    },
  ];
}

function buildOverallRationale({ need, recommendations }) {
  if (recommendations.length === 0) {
    return "当前 corpus 未找到足够相关的候选题，因此不强行推荐。";
  }
  const skillText =
    need.target_skills.length > 0 ? need.target_skills.join("、") : "当前知识点";
  return `基于当前错因，先围绕同章节巩固${skillText}，再用跨章节题训练迁移，最后做综合应用。`;
}
```

- [ ] **Step 4: Run focused Agent tests**

Run:

```bash
node scripts/tests/rag/practice-corpus-search-core.test.mjs
node scripts/tests/rag/variant-practice-agent-core.test.mjs
```

Expected:

```text
practice corpus search core tests passed
variant practice agent core tests passed
```

- [ ] **Step 5: Commit Task 2**

Before committing:

```bash
git status --short
```

Stage only:

```bash
git add scripts/rag/variant-practice-agent-core.mjs scripts/tests/rag/variant-practice-agent-core.test.mjs
git commit -m "feat: add variant practice agent core"
```

Do not stage `.nvmrc`, artifacts, `docs/reviews/*.md`, `.superpowers/sdd/*`, or unrelated plan files.

---

### Task 3: CLI Demo Runner, Default Suite, And Documentation Handoff

**Files:**
- Create: `scripts/rag/recommend-variant-practice.mjs`
- Create: `scripts/tests/rag/variant-practice-agent-cli.test.mjs`
- Modify: `scripts/run-tests.mjs`
- Modify: `docs/superpowers/specs/2026-06-22-p21-variant-practice-agent-mvp-design.md`
- Modify: `interview/mathtrace-project-narrative.md`

**Interfaces:**
- Consumes:
  - `validatePracticeCorpus(value)`
  - `recommendVariantPractice({ corpus, query, searchLimit })`
- Produces:
  - CLI command:
    ```bash
    node scripts/rag/recommend-variant-practice.mjs --corpus <practice_corpus.json> --query <query.json> [--out <dir>] [--limit 8]
    ```
  - Default output:
    ```text
    artifacts/rag/variant-practice-agent/recommendations.json
    ```

- [ ] **Step 1: Write failing CLI tests**

Create `scripts/tests/rag/variant-practice-agent-cli.test.mjs`:

```js
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const scriptPath = join(process.cwd(), "scripts/rag/recommend-variant-practice.mjs");
const tmpRoot = mkdtempSync(join(tmpdir(), "variant-practice-agent-"));
const corpusPath = join(tmpRoot, "practice_corpus.json");
const queryPath = join(tmpRoot, "query.json");
const outputDir = join(tmpRoot, "out");

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-22T10:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: "2026-06-22T09:00:00.000Z",
  item_count: 3,
  items: [
    {
      id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知函数在点处可导，求曲线切线斜率.",
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
      question_text: "2. 已知极限表达式，判断导数几何意义.",
      search_text: "2. 已知极限表达式，判断导数几何意义.\n导数\n考点 1 导数的概念",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      difficulty: null,
      source_ref: { pdf_page_index: 2, section_title: "考点 1 导数的概念" },
      review_meta: {},
    },
    {
      id: "practice-candidate-3",
      source_candidate_id: "candidate-3",
      question_text: "3. 已知函数单调递增，求参数范围.",
      search_text: "3. 已知函数单调递增，求参数范围.\n导数\n考点 2 导数与函数的单调性",
      knowledge_points: ["derivative"],
      section_title: "考点 2 导数与函数的单调性",
      difficulty: null,
      source_ref: { pdf_page_index: 3, section_title: "考点 2 导数与函数的单调性" },
      review_meta: {},
    },
  ],
};

const query = {
  id: "demo-query",
  question_text: "设函数在点处可导，求切线斜率.",
  knowledge_points: ["derivative"],
  section_title: "考点 1 导数的概念",
  mistake_causes: ["derivative_definition_confusion"],
  target_skills: ["导数几何意义", "切线斜率"],
};

writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`);
writeFileSync(queryPath, `${JSON.stringify(query, null, 2)}\n`);

{
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--corpus",
      corpusPath,
      "--query",
      queryPath,
      "--out",
      outputDir,
      "--limit",
      "3",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes("recommendations.json"), true);
  assert.equal(result.stdout.includes("Recommendations: 3"), true);
  assert.equal(result.stdout.includes("切线斜率"), false);
  assert.equal(result.stdout.includes("MINERU_API_TOKEN"), false);

  const output = JSON.parse(readFileSync(join(outputDir, "recommendations.json"), "utf8"));
  assert.equal(output.agent_version, "variant-practice-agent-v0");
  assert.equal(output.recommendations.length, 3);
  assert.equal(output.recommendations[0].recommendation_type, "foundation");
}

{
  const defaultOutRoot = join(tmpRoot, "default-out-root");
  mkdirSync(defaultOutRoot);
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--query", queryPath],
    { encoding: "utf8", cwd: defaultOutRoot },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(
    readFileSync(
      join(defaultOutRoot, "artifacts/rag/variant-practice-agent/recommendations.json"),
      "utf8",
    ),
  );
  assert.equal(output.recommendations.length, 3);
}

{
  const invalidLimitOut = join(tmpRoot, "invalid-limit-out");
  const result = spawnSync(
    process.execPath,
    [
      scriptPath,
      "--corpus",
      corpusPath,
      "--query",
      queryPath,
      "--out",
      invalidLimitOut,
      "--limit",
      "0",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(readFileSync(join(invalidLimitOut, "recommendations.json"), "utf8"));
  assert.equal(output.search_summary.candidate_count, 3);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout.includes("Usage:"), true);
  assert.equal(result.stdout.includes("local sensitive artifact"), true);
}

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", join(tmpRoot, "missing.json"), "--query", queryPath],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("corpus file not found"), true);
}

{
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--query", join(tmpRoot, "missing-query.json")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("query file not found"), true);
}

{
  const badCorpusPath = join(tmpRoot, "bad-corpus.json");
  writeFileSync(badCorpusPath, "{bad");
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", badCorpusPath, "--query", queryPath],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse practice corpus JSON"), true);
}

{
  const invalidCorpusPath = join(tmpRoot, "invalid-corpus.json");
  writeFileSync(invalidCorpusPath, JSON.stringify({ items: "bad" }));
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", invalidCorpusPath, "--query", queryPath],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("invalid practice corpus"), true);
}

{
  const badQueryPath = join(tmpRoot, "bad-query.json");
  writeFileSync(badQueryPath, "{bad");
  const result = spawnSync(
    process.execPath,
    [scriptPath, "--corpus", corpusPath, "--query", badQueryPath],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stderr.includes("failed to parse variant practice query JSON"), true);
}

{
  const result = spawnSync(process.execPath, [scriptPath, "--unknown"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  assert.equal(result.stderr.includes("unknown argument"), true);
}

console.log("variant practice agent cli tests passed");
```

- [ ] **Step 2: Run CLI test and verify it fails**

Run:

```bash
node scripts/tests/rag/variant-practice-agent-cli.test.mjs
```

Expected:

```text
Error: Cannot find module
```

- [ ] **Step 3: Implement CLI**

Create `scripts/rag/recommend-variant-practice.mjs`:

```js
#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validatePracticeCorpus } from "./practice-corpus-search-core.mjs";
import { recommendVariantPractice } from "./variant-practice-agent-core.mjs";

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
  if (!args.query) {
    throw new CliUsageError("--query requires a value");
  }

  const corpusPath = resolve(args.corpus);
  const queryPath = resolve(args.query);
  const outputDir = resolve(args.out ?? "artifacts/rag/variant-practice-agent");

  const corpusJson = await readJsonFile({
    filePath: corpusPath,
    missingMessage: "corpus file not found",
    parseMessage: "failed to parse practice corpus JSON",
  });
  const validation = validatePracticeCorpus(corpusJson);
  if (!validation.ok) {
    throw new Error(`invalid practice corpus: ${validation.errors.join(", ")}`);
  }

  const query = await readJsonFile({
    filePath: queryPath,
    missingMessage: "query file not found",
    parseMessage: "failed to parse variant practice query JSON",
  });

  const result = recommendVariantPractice({
    corpus: validation.corpus,
    query,
    searchLimit: normalizeLimit(args.limit),
  });

  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, "recommendations.json");
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`Wrote ${outputPath}`);
  console.log(`Recommendations: ${result.recommendations.length}`);
  console.log(`Candidates: ${result.search_summary.candidate_count}`);
  console.log(`Warnings: ${result.warnings.length}`);
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
    } else if (arg === "--query") {
      args.query = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--out") {
      args.out = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--limit") {
      args.limit = readOptionValue(argv, index, arg);
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

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 8;
}

function printHelp() {
  console.log(`Usage:
  node scripts/rag/recommend-variant-practice.mjs --corpus <practice_corpus.json> --query <query.json> [--out <dir>] [--limit 8]

Builds ignored local Variant Practice Agent recommendations.
recommendations.json is a local sensitive artifact; do not commit or share it externally.`);
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

- [ ] **Step 4: Add tests to the default suite**

Modify `scripts/run-tests.mjs` by inserting the new tests after `practice-corpus-cli.test.mjs`:

```js
    "scripts/tests/rag/practice-corpus-core.test.mjs",
    "scripts/tests/rag/practice-corpus-cli.test.mjs",
    "scripts/tests/rag/practice-corpus-search-core.test.mjs",
    "scripts/tests/rag/variant-practice-agent-core.test.mjs",
    "scripts/tests/rag/variant-practice-agent-cli.test.mjs",
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node scripts/tests/rag/practice-corpus-search-core.test.mjs
node scripts/tests/rag/variant-practice-agent-core.test.mjs
node scripts/tests/rag/variant-practice-agent-cli.test.mjs
```

Expected:

```text
practice corpus search core tests passed
variant practice agent core tests passed
variant practice agent cli tests passed
```

- [ ] **Step 6: Create a local demo query artifact**

Create an ignored local file manually or with an editor; do not commit it:

```json
{
  "id": "demo-derivative-tangent-slope",
  "question_text": "设函数在点处可导，已知极限式，求曲线在该点处的切线斜率。",
  "knowledge_points": ["derivative"],
  "section_title": "考点 1 导数的概念、几何意义与运算",
  "mistake_causes": ["derivative_definition_confusion"],
  "target_skills": ["导数几何意义", "切线斜率", "极限式识别导数"],
  "student_profile_hint": {
    "weak_knowledge_points": ["derivative"],
    "recent_mistake_causes": ["derivative_definition_confusion"]
  }
}
```

Suggested path:

```text
artifacts/rag/variant-practice-agent/demo-query.json
```

- [ ] **Step 7: Run the real local Agent demo**

Run:

```bash
node scripts/rag/recommend-variant-practice.mjs \
  --corpus artifacts/rag/practice-corpus/practice_corpus.json \
  --query artifacts/rag/variant-practice-agent/demo-query.json \
  --out artifacts/rag/variant-practice-agent \
  --limit 8
```

Expected:

```text
Wrote /Users/kk/learning-assistant/artifacts/rag/variant-practice-agent/recommendations.json
Recommendations: 1-3
Candidates: 0-8
Warnings: 0-2
```

If `Recommendations` is below 3, do not patch scoring blindly. Inspect summary first and decide whether the corpus needs tags in a future task.

- [ ] **Step 8: Inspect generated recommendations summary**

Run:

```bash
node --input-type=module <<'EOF'
import { readFile } from "node:fs/promises";
const result = JSON.parse(await readFile("artifacts/rag/variant-practice-agent/recommendations.json", "utf8"));
console.log(JSON.stringify({
  agent_version: result.agent_version,
  query_id: result.query_id,
  recommendation_count: result.recommendations.length,
  recommendation_types: result.recommendations.map((item) => item.recommendation_type),
  candidate_count: result.search_summary.candidate_count,
  warnings: result.warnings,
  leaked_review_meta: result.recommendations.some((item) => "review_meta" in item),
  leaked_variant_level: result.recommendations.some((item) => "variant_level" in item),
}, null, 2));
EOF
```

Expected for a healthy run:

```json
{
  "agent_version": "variant-practice-agent-v0",
  "query_id": "demo-derivative-tangent-slope",
  "recommendation_count": 3,
  "recommendation_types": ["foundation", "near_transfer", "mixed_application"],
  "candidate_count": 8,
  "warnings": [],
  "leaked_review_meta": false,
  "leaked_variant_level": false
}
```

- [ ] **Step 9: Update design spec handoff if real run differs**

If the real local run returns fewer than 3 recommendations or warnings, add a short section to `docs/superpowers/specs/2026-06-22-p21-variant-practice-agent-mvp-design.md`:

```md
## Implementation Handoff Notes

- Real derivative corpus run returned `<N>` recommendations from `<M>` candidates.
- This is accepted for P2.1 because the Agent returns warnings instead of forcing recommendations.
- Next improvement should be tag proposal / metadata enrichment before pgvector if recall quality is too coarse.
```

If the real run matches the healthy summary, no spec update is required.

- [ ] **Step 10: Update interview narrative**

Modify `interview/mathtrace-project-narrative.md` and add a P2.1 stage after the P2.0 RAG/corpus content.

The section should cover:

- Current status: local Variant Practice Agent MVP, not product UI yet.
- Functional value: turns reviewed teaching-material corpus into ordered variant-practice recommendations.
- Key design: Practice Query -> search tool -> ranking -> rule-based recommendation selection -> `agent_steps` / `rationale`.
- Tradeoffs: no pgvector, no embedding, no LLM rerank, no DB write, no profile write in P2.1.
- Agent interview framing:
  - Agent is not only top-k search; it has goal analysis, tool use, ranking, pedagogical selection, explanation, and warnings.
  - `agent_steps` makes the decision process observable for future tracing and UI.
  - `rationale` explains the whole practice sequence, while each recommendation still has its own reason.
- High-frequency interview Q&A:
  - Why not use LLM rerank first?
  - What is the difference between search results and 3 recommended exercises?
  - What happens when corpus recall is not enough?
  - How will `/api/diagnose` connect to this Agent later?
- Real evidence:
  - Code paths for Agent/search CLI.
  - Tests.
  - Verification commands.
  - Local artifact path, without committing artifact content.

Do not include full student mistake text, full corpus content, PDF content, API keys, or local private material.

- [ ] **Step 11: Run full verification**

Run:

```bash
node scripts/run-tests.mjs default
npm run lint
npm run build
git diff --check
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
rg -n "P2.1|Variant Practice Agent|agent_steps|rationale" interview/mathtrace-project-narrative.md
```

Expected:

```text
default suite passes
lint passes
build succeeds
git diff --check has no output
git ls-files ... has no output
interview narrative contains the P2.1 stage and Agent observability terms
```

- [ ] **Step 12: Commit Task 3**

Before committing:

```bash
git status --short
```

Stage only:

```bash
git add \
  scripts/rag/recommend-variant-practice.mjs \
  scripts/tests/rag/variant-practice-agent-cli.test.mjs \
  scripts/run-tests.mjs \
  docs/superpowers/specs/2026-06-22-p21-variant-practice-agent-mvp-design.md \
  interview/mathtrace-project-narrative.md
git commit -m "feat: add variant practice agent cli"
```

Do not stage `.nvmrc`, artifacts, `docs/reviews/*.md`, `.superpowers/sdd/*`, or unrelated plan files.

---

## Final Verification

After all tasks are complete, run:

```bash
node scripts/run-tests.mjs default
npm run lint
npm run build
node scripts/rag/recommend-variant-practice.mjs \
  --corpus artifacts/rag/practice-corpus/practice_corpus.json \
  --query artifacts/rag/variant-practice-agent/demo-query.json \
  --out artifacts/rag/variant-practice-agent \
  --limit 8
node --input-type=module <<'EOF'
import { readFile } from "node:fs/promises";
const result = JSON.parse(await readFile("artifacts/rag/variant-practice-agent/recommendations.json", "utf8"));
console.log(JSON.stringify({
  agent_version: result.agent_version,
  query_id: result.query_id,
  recommendation_count: result.recommendations.length,
  recommendation_types: result.recommendations.map((item) => item.recommendation_type),
  candidate_count: result.search_summary.candidate_count,
  warnings: result.warnings,
  leaked_review_meta: result.recommendations.some((item) => "review_meta" in item),
  leaked_variant_level: result.recommendations.some((item) => "variant_level" in item),
}, null, 2));
EOF
git diff --check
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
git status --short --branch
```

Expected:

```text
default suite passes
lint passes
build succeeds
Agent CLI writes recommendations.json
agent_version is variant-practice-agent-v0
recommendation_count is 1-3
candidate_count is 0-8
leaked_review_meta is false
leaked_variant_level is false
git diff --check has no output
git ls-files ... has no output
only known unrelated local files remain unstaged
```

## Self-Review

- Spec coverage: The plan implements local top-k search, deterministic Agent orchestration, 3 recommendation slots, warning-based fallback, CLI artifact generation, default-suite tests, and sensitive-output boundaries.
- Scope check: The plan does not add pgvector, embeddings, LLM generation, LLM rerank, database reads/writes, production APIs, product frontend changes, memory/profile writes, or committed artifacts.
- Placeholder scan: No placeholder markers or unspecified test steps remain.
- Type consistency: `validatePracticeCorpus`, `normalizePracticeQuery`, `searchPracticeCorpus`, `analyzePracticeNeed`, `recommendVariantPractice`, `variant-practice-agent-v0`, and `recommendations.json` are used consistently across tasks.
- Risk note: If the real corpus yields fewer than 3 recommendations, that is a product signal for future tag proposal / metadata enrichment, not a reason to inflate scoring without evidence.
