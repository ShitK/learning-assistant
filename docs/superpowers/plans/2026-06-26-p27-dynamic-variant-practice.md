# P2.7 Dynamic Variant Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let confirmed uploaded-image diagnoses request server-side RAG and display 3 real corpus-backed variant practice questions while preserving existing fallback practice cards.

**Architecture:** Add a browser-safe query mapper, a server-only dynamic variant practice service, and a thin `POST /api/variant-practice` route. The workbench calls this API only after confirmed image diagnosis, keeps existing `practice_questions` visible while the RAG request runs, and replaces them only when a valid 3-item `ProductVariantPractice` is returned.

**Tech Stack:** Next.js App Router Route Handlers, React Client Components, TypeScript, existing Node/Jiti test harness, existing local RAG Agent `.mjs` modules, existing `ProductVariantPractice` view model. No new npm dependencies.

## Global Constraints

- 当前仍固定 `demo_student_001`，不做登录、真实多用户、老师端或 RLS 用户策略。
- 当前动态 RAG 只支持导数专题题库：`enriched-practice-corpus-v0` / `math_derivative_v0`。
- 推荐输入来自诊断结果中的题干、知识点、错因和证据等级，不读取浏览器本地文件，不让前端直接访问 corpus。
- RAG 只作为练习题源，不写 `memory_events`、`student_profiles`、错题本或 evidence API。
- `sample_diagnosis` 稳定路径不被破坏：默认样例题仍使用 P2.5 的静态 artifact 展示，缺失时仍回退到预写练习题。
- 不新增 pgvector、Milvus、embedding、数据库表或远程题库服务。
- 不让 LLM 生成新题，也不做 LLM rerank 或 reason polish。
- 不把 RAG 推荐写入 `memory_events`、`student_profiles`、`diagnosis_runs`、`mistake_book_items` 或 localStorage。
- 不改变 `/api/confirm` 的画像写入、证据等级、`memory_delta` 或持久化策略。
- 不把 `artifacts/**`、推荐结果、PDF、MinerU JSON 或 review 文档提交 Git。
- 不展示 RAG 内部字段：`score`、`matched_dimensions`、`item_id`、`source_candidate_id`、`target_skill`、`method_tag`、raw `reason`、raw `warnings`。

---

## File Structure

- Create `src/lib/rag/dynamic-variant-practice-query.ts`
  - Browser-safe request contract, request parser, evidence gate, and deterministic mapping from diagnosis summary to Practice Query.
- Create `scripts/tests/rag/dynamic-variant-practice-query.test.mjs`
  - Covers evidence gate, topic routing, `classification_missing` safety, mixed knowledge points, target skill mapping, and 800-character truncation.
- Create `src/lib/server/rag/dynamic-variant-practice-service.ts`
  - Server-only artifact reader, corpus filtering, Agent invocation, product view model enforcement, and stable success/error result.
- Create `scripts/tests/rag/dynamic-variant-practice-service.test.mjs`
  - Covers missing/bad corpus, bad corpus version, approved-item filtering, missing section fallback, 3-item enforcement, and no internal field leakage.
- Create `src/app/api/variant-practice/route.ts`
  - Thin POST route around the service.
- Create `src/lib/rag/dynamic-variant-practice-client.ts`
  - Browser-safe client helper to build the request from `DiagnoseImageSuccessResponse` and return `ProductVariantPractice | null`.
- Create `scripts/tests/rag/dynamic-variant-practice-client.test.mjs`
  - Covers payload construction, successful response parsing, non-OK fallback, null response fallback, and stale-data-safe shape.
- Modify `scripts/run-tests.mjs`
  - Add the three new RAG tests to the default suite near existing variant practice tests.
- Modify `scripts/tests/smoke/api-smoke.test.mjs`
  - Add route smoke for invalid JSON and invalid student.
- Modify `src/components/mathtrace-workbench.tsx`
  - Add dynamic variant practice state, stale request guard, reset points, and confirmed-image API trigger.
- Modify `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - Add source-level assertions for client helper import, dynamic state/ref, request call, fallback priority, stale request guard, and no internal field leakage.
- Modify docs during final task:
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `docs/TECHNICAL_ROADMAP.md`
  - `docs/rag-artifacts.md`
  - `interview/mathtrace-project-narrative.md`

---

### Task 1: Dynamic Practice Query Mapper

**Files:**
- Create: `src/lib/rag/dynamic-variant-practice-query.ts`
- Create: `scripts/tests/rag/dynamic-variant-practice-query.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes: `unknown` request body shaped like the P2.7 request contract.
- Produces:
  - `DynamicVariantPracticeRequest`
  - `DynamicPracticeQuery`
  - `parseDynamicVariantPracticeRequest(value: unknown): DynamicVariantPracticeParseResult`
  - `deriveDynamicVariantPracticeQuery(request: DynamicVariantPracticeRequest): DynamicPracticeQuery | null`

- [ ] **Step 1: Write the failing query mapper test**

Create `scripts/tests/rag/dynamic-variant-practice-query.test.mjs`:

```js
import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  deriveDynamicVariantPracticeQuery,
  parseDynamicVariantPracticeRequest,
} = jiti("./src/lib/rag/dynamic-variant-practice-query.ts");

const baseRequest = {
  student_id: "demo_student_001",
  request_source: "confirmed_image_diagnosis",
  evidence_level: "student_work_sufficient",
  persistence_evidence: "student_work",
  profile_update_kind: "mistake_cause",
  question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论函数单调性并求参数范围。",
  knowledge_points: ["derivative_monotonicity"],
  mistake_causes: ["classification_missing"],
};

{
  const parsed = parseDynamicVariantPracticeRequest(baseRequest);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.student_id, "demo_student_001");
  assert.equal(parsed.value.request_source, "confirmed_image_diagnosis");
}

{
  const query = deriveDynamicVariantPracticeQuery(baseRequest);
  assert.notEqual(query, null);
  assert.equal(query.id, "dynamic-confirmed-image-diagnosis");
  assert.deepEqual(query.knowledge_points, ["derivative"]);
  assert.equal(query.target_skills.includes("monotonicity"), true);
  assert.equal(query.target_skills.includes("parameter_range"), true);
  assert.equal(query.section_title, "考点 2 导数与函数的单调性");
  assert.deepEqual(query.mistake_causes, ["classification_missing"]);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    knowledge_points: ["parameter_classification"],
    mistake_causes: [],
  });
  assert.notEqual(query, null);
  assert.deepEqual(query.target_skills, ["parameter_range"]);
  assert.equal(query.section_title, "专项突破 2 利用导数研究恒(能)成立问题");
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    knowledge_points: ["derivative_monotonicity", "parameter_classification"],
    mistake_causes: [],
  });
  assert.notEqual(query, null);
  assert.deepEqual(query.target_skills, ["monotonicity", "parameter_range"]);
  assert.equal(query.section_title, "考点 2 导数与函数的单调性");
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    question_text: "已知曲线在某点处的切线斜率，求导数几何意义。",
    knowledge_points: ["derivative_monotonicity"],
    mistake_causes: [],
  });
  assert.notEqual(query, null);
  assert.equal(query.target_skills.includes("tangent_slope"), true);
  assert.equal(query.target_skills.includes("derivative_geometric_meaning"), true);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    question_text: "讨论函数零点个数。",
    knowledge_points: ["derivative_monotonicity"],
    mistake_causes: [],
  });
  assert.notEqual(query, null);
  assert.equal(query.target_skills.includes("zero_point"), true);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    knowledge_points: ["sequence_recursion"],
    mistake_causes: ["classification_missing"],
  });
  assert.equal(query, null);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    knowledge_points: ["function_domain", "sequence_recursion"],
    mistake_causes: [],
  });
  assert.equal(query, null);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    knowledge_points: ["function_domain", "derivative_monotonicity"],
    mistake_causes: [],
  });
  assert.notEqual(query, null);
  assert.equal(query.target_skills.includes("monotonicity"), true);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    evidence_level: "problem_only",
    persistence_evidence: "uploaded_problem_only",
    profile_update_kind: "problem_type_focus",
  });
  assert.equal(query, null);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    evidence_level: "problem_only",
    persistence_evidence: "none",
    profile_update_kind: "problem_type_focus",
  });
  assert.equal(query, null);
}

{
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    evidence_level: "problem_only",
    persistence_evidence: "user_confirmed",
    profile_update_kind: "mistake_cause",
  });
  assert.notEqual(query, null);
}

{
  const longText = "导数".repeat(500);
  const query = deriveDynamicVariantPracticeQuery({
    ...baseRequest,
    question_text: longText,
  });
  assert.notEqual(query, null);
  assert.equal(Array.from(query.question_text).length, 800);
}

for (const badRequest of [
  null,
  { ...baseRequest, student_id: "student_002" },
  { ...baseRequest, request_source: "image" },
  { ...baseRequest, question_text: "" },
  { ...baseRequest, knowledge_points: "derivative_monotonicity" },
  { ...baseRequest, mistake_causes: "classification_missing" },
]) {
  const parsed = parseDynamicVariantPracticeRequest(badRequest);
  assert.equal(parsed.ok, false);
}

console.log("dynamic variant practice query tests passed");
```

- [ ] **Step 2: Run the failing query mapper test**

Run:

```bash
node scripts/tests/rag/dynamic-variant-practice-query.test.mjs
```

Expected: FAIL with module not found for `src/lib/rag/dynamic-variant-practice-query.ts`.

- [ ] **Step 3: Implement the query mapper**

Create `src/lib/rag/dynamic-variant-practice-query.ts`:

```ts
import type {
  EvidenceLevel,
  PersistenceEvidence,
  ProfileUpdateKind,
} from "@/lib/shared/diagnosis-evidence";
import { isRecord } from "@/lib/shared/utils";

export interface DynamicVariantPracticeRequest {
  student_id: "demo_student_001";
  request_source: "confirmed_image_diagnosis";
  evidence_level: EvidenceLevel | null;
  persistence_evidence: PersistenceEvidence | null;
  profile_update_kind: ProfileUpdateKind;
  question_text: string;
  knowledge_points: string[];
  mistake_causes: string[];
}

export interface DynamicPracticeQuery {
  id: "dynamic-confirmed-image-diagnosis";
  question_text: string;
  knowledge_points: ["derivative"];
  section_title: string | null;
  mistake_causes: string[];
  target_skills: string[];
}

export type DynamicVariantPracticeParseResult =
  | { ok: true; value: DynamicVariantPracticeRequest }
  | { ok: false; message: string };

const maxQuestionTextLength = 800;
const derivativeKnowledgePointKeys = new Set([
  "derivative_monotonicity",
  "parameter_classification",
]);

const sectionTitles = {
  geometric: "考点 1 导数的概念、几何意义与运算",
  monotonicity: "考点 2 导数与函数的单调性",
  extrema: "考点 3 导数与函数的极值",
  parameter: "专项突破 2 利用导数研究恒(能)成立问题",
  zeroPoint: "专项突破 4 利用导数研究函数的零点问题",
} as const;

export function parseDynamicVariantPracticeRequest(
  value: unknown,
): DynamicVariantPracticeParseResult {
  if (!isRecord(value)) {
    return { ok: false, message: "请求体必须是 JSON 对象。" };
  }

  if (value.student_id !== "demo_student_001") {
    return { ok: false, message: "当前阶段只支持 demo_student_001。" };
  }

  if (value.request_source !== "confirmed_image_diagnosis") {
    return { ok: false, message: "request_source 只能是 confirmed_image_diagnosis。" };
  }

  if (!isEvidenceLevelOrNull(value.evidence_level)) {
    return { ok: false, message: "evidence_level 不合法。" };
  }

  if (!isPersistenceEvidenceOrNull(value.persistence_evidence)) {
    return { ok: false, message: "persistence_evidence 不合法。" };
  }

  if (!isProfileUpdateKind(value.profile_update_kind)) {
    return { ok: false, message: "profile_update_kind 不合法。" };
  }

  if (typeof value.question_text !== "string" || !value.question_text.trim()) {
    return { ok: false, message: "question_text 不能为空。" };
  }

  if (!isStringArray(value.knowledge_points)) {
    return { ok: false, message: "knowledge_points 必须是字符串数组。" };
  }

  if (!isStringArray(value.mistake_causes)) {
    return { ok: false, message: "mistake_causes 必须是字符串数组。" };
  }

  return {
    ok: true,
    value: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: value.evidence_level,
      persistence_evidence: value.persistence_evidence,
      profile_update_kind: value.profile_update_kind,
      question_text: truncateQuestionText(value.question_text.trim()),
      knowledge_points: normalizeStringArray(value.knowledge_points),
      mistake_causes: normalizeStringArray(value.mistake_causes),
    },
  };
}

export function deriveDynamicVariantPracticeQuery(
  request: DynamicVariantPracticeRequest,
): DynamicPracticeQuery | null {
  if (!canTriggerDynamicVariantPractice(request)) {
    return null;
  }

  const derivativeKnowledgePoints = request.knowledge_points.filter((point) =>
    derivativeKnowledgePointKeys.has(point),
  );
  if (derivativeKnowledgePoints.length === 0) {
    return null;
  }

  const targetSkills: string[] = [];
  let sectionTitle: string | null = null;

  if (derivativeKnowledgePoints.includes("derivative_monotonicity")) {
    addUnique(targetSkills, "monotonicity");
    sectionTitle = sectionTitles.monotonicity;
  }

  if (derivativeKnowledgePoints.includes("parameter_classification")) {
    addUnique(targetSkills, "parameter_range");
    sectionTitle ??= sectionTitles.parameter;
  }

  if (request.mistake_causes.includes("classification_missing")) {
    addUnique(targetSkills, "parameter_range");
  }

  const questionText = request.question_text;
  if (hasAny(questionText, ["切线", "斜率", "几何意义"])) {
    addUnique(targetSkills, "tangent_slope");
    addUnique(targetSkills, "derivative_geometric_meaning");
    sectionTitle ??= sectionTitles.geometric;
  }

  if (hasAny(questionText, ["极值", "最值", "最大值", "最小值"])) {
    addUnique(targetSkills, "extrema");
    sectionTitle ??= sectionTitles.extrema;
  }

  if (questionText.includes("零点")) {
    addUnique(targetSkills, "zero_point");
    sectionTitle ??= sectionTitles.zeroPoint;
  }

  if (targetSkills.length === 0) {
    return null;
  }

  return {
    id: "dynamic-confirmed-image-diagnosis",
    question_text: request.question_text,
    knowledge_points: ["derivative"],
    section_title: sectionTitle,
    mistake_causes: request.mistake_causes,
    target_skills: targetSkills,
  };
}

function canTriggerDynamicVariantPractice(
  request: DynamicVariantPracticeRequest,
): boolean {
  if (
    request.evidence_level === "student_work_sufficient" &&
    request.persistence_evidence === "student_work"
  ) {
    return true;
  }

  return (
    request.evidence_level === "problem_only" &&
    request.persistence_evidence === "user_confirmed"
  );
}

function truncateQuestionText(text: string): string {
  return Array.from(text).slice(0, maxQuestionTextLength).join("");
}

function normalizeStringArray(value: string[]): string[] {
  return [
    ...new Set(value.map((item) => item.trim()).filter((item) => item.length > 0)),
  ];
}

function addUnique(items: string[], item: string): void {
  if (!items.includes(item)) {
    items.push(item);
  }
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isEvidenceLevelOrNull(value: unknown): value is EvidenceLevel | null {
  return (
    value === null ||
    value === "student_work_sufficient" ||
    value === "problem_only" ||
    value === "insufficient"
  );
}

function isPersistenceEvidenceOrNull(
  value: unknown,
): value is PersistenceEvidence | null {
  return (
    value === null ||
    value === "student_work" ||
    value === "uploaded_problem_only" ||
    value === "user_confirmed" ||
    value === "none"
  );
}

function isProfileUpdateKind(value: unknown): value is ProfileUpdateKind {
  return (
    value === "mistake_cause" ||
    value === "problem_type_focus" ||
    value === "none"
  );
}
```

- [ ] **Step 4: Add the query mapper test to the default suite**

Modify `scripts/run-tests.mjs`, inserting this test after `variant-practice-product-loader.test.mjs`:

```js
"scripts/tests/rag/dynamic-variant-practice-query.test.mjs",
```

- [ ] **Step 5: Run query mapper tests**

Run:

```bash
node scripts/tests/rag/dynamic-variant-practice-query.test.mjs
node scripts/run-tests.mjs default
```

Expected:

```text
dynamic variant practice query tests passed
```

The default suite should pass through the new query test before continuing.

- [ ] **Step 6: Commit Task 1**

Review status first:

```bash
git status --short
```

Stage only Task 1 files:

```bash
git add src/lib/rag/dynamic-variant-practice-query.ts \
  scripts/tests/rag/dynamic-variant-practice-query.test.mjs \
  scripts/run-tests.mjs
git commit -m "feat: map diagnoses to dynamic variant queries"
```

---

### Task 2: Server-Side Dynamic Variant Practice Service

**Files:**
- Create: `src/lib/server/rag/dynamic-variant-practice-service.ts`
- Create: `scripts/tests/rag/dynamic-variant-practice-service.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes:
  - `DynamicVariantPracticeRequest` from Task 1.
  - Local enriched corpus JSON from `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`.
  - Existing `recommendVariantPractice()` Agent shape.
- Produces:
  - `DynamicVariantPracticeSuccessResponse`
  - `DynamicVariantPracticeApiResponse`
  - `handleDynamicVariantPracticeRequest(value: unknown, deps?: DynamicVariantPracticeServiceDeps): Promise<DynamicVariantPracticeServiceResult>`

- [ ] **Step 1: Write the failing service test**

Create `scripts/tests/rag/dynamic-variant-practice-service.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  handleDynamicVariantPracticeRequest,
  loadDefaultVariantPracticeAgent,
} = jiti("./src/lib/server/rag/dynamic-variant-practice-service.ts");

const tmpRoot = mkdtempSync(join(tmpdir(), "dynamic-variant-practice-service-"));
const corpusPath = join(tmpRoot, "enriched_practice_corpus.json");

const baseRequest = {
  student_id: "demo_student_001",
  request_source: "confirmed_image_diagnosis",
  evidence_level: "student_work_sufficient",
  persistence_evidence: "student_work",
  profile_update_kind: "mistake_cause",
  question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论函数单调性并求参数范围。",
  knowledge_points: ["derivative_monotonicity"],
  mistake_causes: ["classification_missing"],
};

writeFileSync(corpusPath, JSON.stringify(buildCorpus(), null, 2));

let capturedInput = null;
const fakeAgent = {
  recommendVariantPractice(input) {
    capturedInput = input;
    return buildAgentArtifact(input.query.id, input.corpus.items);
  },
};

{
  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    corpusFilePath: corpusPath,
    agent: fakeAgent,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice.items.length, 3);
  assert.equal(capturedInput.query.section_title, "考点 2 导数与函数的单调性");
  assert.equal(capturedInput.corpus.corpus_version, "enriched-practice-corpus-v0");
  assert.equal(capturedInput.corpus.items.length, 3);
  assert.equal(
    capturedInput.corpus.items.some(
      (item) => item.tag_review_meta.review_status !== "approved",
    ),
    false,
  );
  assert.equal(JSON.stringify(result.body).includes("score"), false);
  assert.equal(JSON.stringify(result.body).includes("source_candidate_id"), false);
  assert.equal(JSON.stringify(result.body).includes("matched_dimensions"), false);
}

{
  capturedInput = null;
  const result = await handleDynamicVariantPracticeRequest(
    {
      ...baseRequest,
      knowledge_points: ["sequence_recursion"],
      mistake_causes: ["classification_missing"],
    },
    { corpusFilePath: corpusPath, agent: fakeAgent },
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice, null);
  assert.equal(capturedInput, null);
}

{
  const noSectionCorpusPath = join(tmpRoot, "no-section.json");
  writeFileSync(noSectionCorpusPath, JSON.stringify(buildCorpusWithoutTargetSection(), null, 2));
  capturedInput = null;
  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    corpusFilePath: noSectionCorpusPath,
    agent: fakeAgent,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice.items.length, 3);
  assert.equal(capturedInput.query.section_title, null);
}

{
  const invalidVersionPath = join(tmpRoot, "invalid-version.json");
  writeFileSync(
    invalidVersionPath,
    JSON.stringify({ ...buildCorpus(), corpus_version: "enriched-practice-corpus-v1" }),
  );
  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    corpusFilePath: invalidVersionPath,
    agent: fakeAgent,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice, null);
}

{
  const badJsonPath = join(tmpRoot, "bad.json");
  writeFileSync(badJsonPath, "{");
  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    corpusFilePath: badJsonPath,
    agent: fakeAgent,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice, null);
}

{
  const result = await handleDynamicVariantPracticeRequest(
    { ...baseRequest, student_id: "student_002" },
    { corpusFilePath: corpusPath, agent: fakeAgent },
  );
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "invalid_request");
}

{
  const twoItemAgent = {
    recommendVariantPractice(input) {
      return {
        ...buildAgentArtifact(input.query.id, input.corpus.items),
        recommendations: buildAgentArtifact(input.query.id, input.corpus.items).recommendations.slice(0, 2),
      };
    },
  };
  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    corpusFilePath: corpusPath,
    agent: twoItemAgent,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice, null);
}

{
  const agent = await loadDefaultVariantPracticeAgent();
  assert.notEqual(agent, null);
  assert.equal(typeof agent.recommendVariantPractice, "function");

  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    corpusFilePath: corpusPath,
    agent,
  });
  assert.equal(result.status, 200);
  assert.equal(
    result.body.variant_practice === null ||
      result.body.variant_practice.items.length === 3,
    true,
  );
}

console.log("dynamic variant practice service tests passed");

function buildCorpus() {
  return {
    corpus_version: "enriched-practice-corpus-v0",
    generated_at: "2026-06-26T00:00:00.000Z",
    item_count: 4,
    items: [
      buildItem("foundation", "考点 2 导数与函数的单调性", "monotonicity", "approved"),
      buildItem("near", "专项突破 2 利用导数研究恒(能)成立问题", "parameter_range", "approved"),
      buildItem("mixed", "考点 3 导数与函数的极值", "extrema", "approved"),
      buildItem("needs-fix", "考点 4 导数与函数的零点", "zero_point", "needs_fix"),
    ],
  };
}

function buildCorpusWithoutTargetSection() {
  return {
    ...buildCorpus(),
    items: [
      buildItem("foundation-alt", "考点 1 导数的概念、几何意义与运算", "tangent_slope", "approved"),
      buildItem("near-alt", "专项突破 2 利用导数研究恒(能)成立问题", "parameter_range", "approved"),
      buildItem("mixed-alt", "考点 3 导数与函数的极值", "extrema", "approved"),
    ],
  };
}

function buildItem(id, sectionTitle, targetSkill, reviewStatus) {
  return {
    id: `practice-${id}`,
    source_candidate_id: `candidate-${id}`,
    question_text: `${id}. 讨论导数相关问题。`,
    search_text: `${id}. 讨论导数相关问题。\\n导数\\n${sectionTitle}`,
    knowledge_points: ["derivative"],
    section_title: sectionTitle,
    target_skills: [targetSkill],
    method_tags: ["monotonicity_by_derivative", "parameter_classification"],
    feature_flags: [],
    difficulty: null,
    source_ref: { pdf_page_index: 1, section_title: sectionTitle },
    tag_review_meta: {
      review_status: reviewStatus,
      proposal_confidence: "high",
      has_manual_tag_correction: false,
      tag_source: "rule",
    },
    review_meta: {},
  };
}

function buildAgentArtifact(queryId, items) {
  return {
    agent_version: "variant-practice-agent-v0",
    query_id: queryId,
    practice_goal: {
      knowledge_points: ["derivative"],
      target_skills: ["monotonicity"],
      mistake_causes: ["classification_missing"],
      summary: "动态推荐测试。",
    },
    agent_steps: [],
    rationale: "测试推荐。",
    search_summary: {
      corpus_version: "enriched-practice-corpus-v0",
      searched_items: items.length,
      candidate_count: items.length,
    },
    recommendations: items.slice(0, 3).map((item, index) => ({
      rank: index + 1,
      recommendation_type:
        index === 0 ? "foundation" : index === 1 ? "near_transfer" : "additional_practice",
      item_id: item.id,
      source_candidate_id: item.source_candidate_id,
      question_text: item.question_text,
      reason: "同知识点 derivative，适合作为练习题。",
      matched_dimensions: ["knowledge_point", "target_skill"],
      score: 30 - index,
      source_ref: item.source_ref,
    })),
    warnings: ["demo_fill_used"],
  };
}
```

- [ ] **Step 2: Run the failing service test**

Run:

```bash
node scripts/tests/rag/dynamic-variant-practice-service.test.mjs
```

Expected: FAIL with module not found for `src/lib/server/rag/dynamic-variant-practice-service.ts`.

- [ ] **Step 3: Implement the server service**

Create `src/lib/server/rag/dynamic-variant-practice-service.ts`:

```ts
// server-only: this file reads ignored local RAG artifacts and imports server-side Agent code.
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { createDiagnoseError, type DiagnoseErrorResponse } from "@/lib/diagnosis/diagnose-api";
import {
  deriveDynamicVariantPracticeQuery,
  parseDynamicVariantPracticeRequest,
  type DynamicPracticeQuery,
} from "@/lib/rag/dynamic-variant-practice-query";
import {
  createVariantPracticeProductViewModel,
  type ProductVariantPractice,
} from "@/lib/rag/variant-practice-product-view-model";

export interface DynamicVariantPracticeSuccessResponse {
  variant_practice: ProductVariantPractice | null;
}

export type DynamicVariantPracticeApiResponse =
  | DynamicVariantPracticeSuccessResponse
  | DiagnoseErrorResponse;

export interface DynamicVariantPracticeServiceResult {
  status: number;
  body: DynamicVariantPracticeApiResponse;
}

export interface VariantPracticeAgent {
  recommendVariantPractice(input: {
    corpus: DynamicPracticeCorpus;
    query: DynamicPracticeQuery;
    searchLimit?: number;
  }): unknown;
}

export interface DynamicVariantPracticeServiceDeps {
  corpusFilePath?: string;
  agent?: VariantPracticeAgent;
  searchLimit?: number;
}

interface DynamicPracticeCorpus {
  corpus_version: "enriched-practice-corpus-v0";
  items: DynamicPracticeCorpusItem[];
  item_count?: number;
  [key: string]: unknown;
}

interface DynamicPracticeCorpusItem {
  id: string;
  source_candidate_id: string;
  question_text: string;
  search_text: string;
  knowledge_points: string[];
  section_title?: string | null;
  target_skills?: string[];
  method_tags?: string[];
  feature_flags?: string[];
  source_ref?: unknown;
  tag_review_meta?: {
    review_status?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

const defaultCorpusPath =
  "artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json";
const defaultAgentModulePath =
  "../../../../scripts/rag/variant-practice-agent-core.mjs";

export async function handleDynamicVariantPracticeRequest(
  value: unknown,
  deps: DynamicVariantPracticeServiceDeps = {},
): Promise<DynamicVariantPracticeServiceResult> {
  const parsed = parseDynamicVariantPracticeRequest(value);
  if (!parsed.ok) {
    return {
      status: 400,
      body: createDiagnoseError("invalid_request", parsed.message, true),
    };
  }

  const query = deriveDynamicVariantPracticeQuery(parsed.value);
  if (!query) {
    return success(null);
  }

  const corpus = await readDynamicPracticeCorpus(
    deps.corpusFilePath ?? defaultCorpusPath,
  );
  if (!corpus) {
    return success(null);
  }

  const prepared = prepareCorpusAndQuery(corpus, query);
  if (!prepared) {
    return success(null);
  }

  const agent = deps.agent ?? (await loadDefaultVariantPracticeAgent());
  if (!agent) {
    return success(null);
  }

  let artifact: unknown;
  try {
    artifact = agent.recommendVariantPractice({
      corpus: prepared.corpus,
      query: prepared.query,
      searchLimit: deps.searchLimit ?? 12,
    });
  } catch {
    return success(null);
  }

  const viewModel = createVariantPracticeProductViewModel(artifact);

  return success(viewModel && viewModel.items.length === 3 ? viewModel : null);
}

async function readDynamicPracticeCorpus(
  filePath: string,
): Promise<DynamicPracticeCorpus | null> {
  try {
    const absoluteFilePath = isAbsolute(filePath)
      ? filePath
      : join(/* turbopackIgnore: true */ process.cwd(), filePath);
    const rawText = await readFile(absoluteFilePath, "utf8");
    const parsed: unknown = JSON.parse(rawText);
    return isDynamicPracticeCorpus(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function prepareCorpusAndQuery(
  corpus: DynamicPracticeCorpus,
  query: DynamicPracticeQuery,
): { corpus: DynamicPracticeCorpus; query: DynamicPracticeQuery } | null {
  const approvedItems = corpus.items.filter(isApprovedDynamicPracticeItem);
  if (approvedItems.length === 0) {
    return null;
  }

  const sectionTitles = new Set(
    approvedItems
      .map((item) => item.section_title)
      .filter((sectionTitle): sectionTitle is string => typeof sectionTitle === "string"),
  );
  const effectiveQuery =
    query.section_title && !sectionTitles.has(query.section_title)
      ? { ...query, section_title: null }
      : query;

  return {
    corpus: {
      ...corpus,
      item_count: approvedItems.length,
      items: approvedItems,
    },
    query: effectiveQuery,
  };
}

function isDynamicPracticeCorpus(value: unknown): value is DynamicPracticeCorpus {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const corpus = value as { corpus_version?: unknown; items?: unknown };
  return (
    corpus.corpus_version === "enriched-practice-corpus-v0" &&
    Array.isArray(corpus.items) &&
    corpus.items.every(isDynamicPracticeCorpusItem)
  );
}

function isDynamicPracticeCorpusItem(
  value: unknown,
): value is DynamicPracticeCorpusItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const item = value as {
    id?: unknown;
    source_candidate_id?: unknown;
    question_text?: unknown;
    search_text?: unknown;
    knowledge_points?: unknown;
  };

  return (
    typeof item.id === "string" &&
    typeof item.source_candidate_id === "string" &&
    typeof item.question_text === "string" &&
    item.question_text.trim().length > 0 &&
    typeof item.search_text === "string" &&
    item.search_text.trim().length > 0 &&
    Array.isArray(item.knowledge_points) &&
    item.knowledge_points.every((point) => typeof point === "string")
  );
}

function isApprovedDynamicPracticeItem(item: DynamicPracticeCorpusItem): boolean {
  return item.tag_review_meta?.review_status === "approved";
}

export async function loadDefaultVariantPracticeAgent(): Promise<VariantPracticeAgent | null> {
  try {
    const agentModule = (await import(defaultAgentModulePath)) as VariantPracticeAgent;
    return typeof agentModule.recommendVariantPractice === "function"
      ? agentModule
      : null;
  } catch {
    return null;
  }
}

function success(
  variantPractice: ProductVariantPractice | null,
): DynamicVariantPracticeServiceResult {
  return {
    status: 200,
    body: { variant_practice: variantPractice },
  };
}
```

- [ ] **Step 4: Add the service test to the default suite**

Modify `scripts/run-tests.mjs`, inserting this test after `dynamic-variant-practice-query.test.mjs`:

```js
"scripts/tests/rag/dynamic-variant-practice-service.test.mjs",
```

- [ ] **Step 5: Run service tests**

Run:

```bash
node scripts/tests/rag/dynamic-variant-practice-service.test.mjs
node scripts/run-tests.mjs default
```

Expected:

```text
dynamic variant practice service tests passed
```

The default suite should pass.

- [ ] **Step 6: Commit Task 2**

Review status first:

```bash
git status --short
```

Stage only Task 2 files:

```bash
git add src/lib/server/rag/dynamic-variant-practice-service.ts \
  scripts/tests/rag/dynamic-variant-practice-service.test.mjs \
  scripts/run-tests.mjs
git commit -m "feat: add dynamic variant practice service"
```

---

### Task 3: API Route and Browser Client

**Files:**
- Create: `src/app/api/variant-practice/route.ts`
- Create: `src/lib/rag/dynamic-variant-practice-client.ts`
- Create: `scripts/tests/rag/dynamic-variant-practice-client.test.mjs`
- Modify: `scripts/tests/smoke/api-smoke.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes:
  - `DiagnoseImageSuccessResponse`
  - `handleDynamicVariantPracticeRequest()`
- Produces:
  - `buildDynamicVariantPracticePayload(input: DiagnoseImageSuccessResponse): DynamicVariantPracticeRequest`
  - `requestDynamicVariantPractice(input: { fetcher: typeof fetch; diagnosis: DiagnoseImageSuccessResponse }): Promise<ProductVariantPractice | null>`
  - `POST /api/variant-practice`

- [ ] **Step 1: Write the failing client test**

Create `scripts/tests/rag/dynamic-variant-practice-client.test.mjs`:

```js
import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  buildDynamicVariantPracticePayload,
  requestDynamicVariantPractice,
} = jiti("./src/lib/rag/dynamic-variant-practice-client.ts");
const { demoStudentProfile } = jiti("./src/data/mathtrace-demo.ts");

const diagnosis = {
  diagnosis_id: "diag_image_dynamic",
  student_id: "demo_student_001",
  source: "image",
  steps: [],
  recognized_question: {
    id: "image_dynamic_1",
    title: "图片识别错题",
    module: "导数",
    question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论函数单调性。",
    student_answer: "遗漏参数讨论。",
    student_solution_steps: ["求导", "直接判断"],
    extraction_confidence: "high",
  },
  knowledge_mapping: {
    knowledge_points: ["derivative_monotonicity"],
    difficulty: 4,
  },
  mistake_diagnosis: {
    mistake_causes: ["classification_missing"],
    severity: "medium",
    expected_diagnosis: "分类讨论遗漏。",
    step_analysis: ["没有讨论参数范围"],
    solution_highlights: ["先讨论参数范围"],
    standard_solution: "先求导，再分类讨论。",
  },
  memory_delta: {
    knowledge_mastery_changes: { derivative_monotonicity: -6 },
    mistake_cause_changes: { classification_missing: 1 },
    is_repeated_mistake: false,
    review_priority_changes: ["derivative_monotonicity"],
    should_persist: true,
    rationale: "图片抽取通过校验后，由本地规则计算画像增量。",
  },
  student_profile: demoStudentProfile,
  practice_questions: [],
  review_plan: {
    tomorrow: "复习导数单调性。",
    seven_days: [],
    rationale: ["本次错因涉及导数。"],
  },
  sample_diagnosis: null,
  fallback_used: false,
  evidence_level: "student_work_sufficient",
  persistence_evidence: "student_work",
  profile_update_kind: "mistake_cause",
  risk_follow_up: null,
  warnings: [],
};

{
  const payload = buildDynamicVariantPracticePayload(diagnosis);
  assert.equal(payload.student_id, "demo_student_001");
  assert.equal(payload.request_source, "confirmed_image_diagnosis");
  assert.equal(payload.evidence_level, "student_work_sufficient");
  assert.equal(payload.persistence_evidence, "student_work");
  assert.equal(payload.profile_update_kind, "mistake_cause");
  assert.equal(payload.question_text, diagnosis.recognized_question.question_text);
  assert.deepEqual(payload.knowledge_points, ["derivative_monotonicity"]);
  assert.deepEqual(payload.mistake_causes, ["classification_missing"]);
}

{
  const result = await requestDynamicVariantPractice({
    fetcher: createJsonFetcher({
      ok: true,
      body: {
        variant_practice: {
          source: "rag_variant_practice",
          notice: null,
          items: [
            {
              rank: 1,
              type: "foundation",
              title: "巩固题",
              question_text: "1. 动态巩固题。",
              reason: "先巩固。",
            },
            {
              rank: 2,
              type: "near_transfer",
              title: "迁移题",
              question_text: "2. 动态迁移题。",
              reason: "再迁移。",
            },
            {
              rank: 3,
              type: "mixed_review",
              title: "综合题",
              question_text: "3. 动态综合题。",
              reason: "最后综合。",
            },
          ],
        },
      },
    }),
    diagnosis,
  });
  assert.notEqual(result, null);
  assert.equal(result.items[0].title, "巩固题");
}

{
  const result = await requestDynamicVariantPractice({
    fetcher: createJsonFetcher({
      ok: true,
      body: {
        variant_practice: {
          source: "rag_variant_practice",
          notice: null,
          items: [
            {
              rank: 1,
              type: "foundation",
              title: "不足三题",
              question_text: "1. 不足三题。",
              reason: "不应展示。",
            },
          ],
        },
      },
    }),
    diagnosis,
  });
  assert.equal(result, null);
}

{
  let didFetch = false;
  const result = await requestDynamicVariantPractice({
    fetcher: async () => {
      didFetch = true;
      throw new Error("should not fetch");
    },
    diagnosis: {
      ...diagnosis,
      recognized_question: {
        ...diagnosis.recognized_question,
        question_text: "   ",
      },
    },
  });
  assert.equal(result, null);
  assert.equal(didFetch, false);
}

{
  const result = await requestDynamicVariantPractice({
    fetcher: createJsonFetcher({ ok: true, body: { variant_practice: null } }),
    diagnosis,
  });
  assert.equal(result, null);
}

{
  const result = await requestDynamicVariantPractice({
    fetcher: createJsonFetcher({ ok: false, body: { error: { message: "bad" } } }),
    diagnosis,
  });
  assert.equal(result, null);
}

{
  const result = await requestDynamicVariantPractice({
    fetcher: async () => {
      throw new Error("network failed");
    },
    diagnosis,
  });
  assert.equal(result, null);
}

console.log("dynamic variant practice client tests passed");

function createJsonFetcher({ ok, body }) {
  return async (url, init) => {
    assert.equal(url, "/api/variant-practice");
    assert.equal(init.method, "POST");
    assert.equal(init.cache, "no-store");
    assert.equal(init.headers["Content-Type"], "application/json");
    const payload = JSON.parse(init.body);
    assert.equal(payload.request_source, "confirmed_image_diagnosis");
    return {
      ok,
      async json() {
        return body;
      },
    };
  };
}
```

- [ ] **Step 2: Run the failing client test**

Run:

```bash
node scripts/tests/rag/dynamic-variant-practice-client.test.mjs
```

Expected: FAIL with module not found for `src/lib/rag/dynamic-variant-practice-client.ts`.

- [ ] **Step 3: Implement the client helper**

Create `src/lib/rag/dynamic-variant-practice-client.ts`:

```ts
import type { DiagnoseImageSuccessResponse } from "@/lib/diagnosis/diagnose-api";
import type { DynamicVariantPracticeRequest } from "@/lib/rag/dynamic-variant-practice-query";
import type { ProductVariantPractice } from "@/lib/rag/variant-practice-product-view-model";
import { isRecord } from "@/lib/shared/utils";

export function buildDynamicVariantPracticePayload(
  input: DiagnoseImageSuccessResponse,
): DynamicVariantPracticeRequest {
  return {
    student_id: "demo_student_001",
    request_source: "confirmed_image_diagnosis",
    evidence_level: input.evidence_level,
    persistence_evidence: input.persistence_evidence,
    profile_update_kind: input.profile_update_kind,
    question_text: input.recognized_question.question_text,
    knowledge_points: input.knowledge_mapping.knowledge_points,
    mistake_causes: input.mistake_diagnosis.mistake_causes,
  };
}

export async function requestDynamicVariantPractice(input: {
  fetcher: typeof fetch;
  diagnosis: DiagnoseImageSuccessResponse;
}): Promise<ProductVariantPractice | null> {
  let response: Response;
  const questionText = input.diagnosis.recognized_question.question_text.trim();
  if (!questionText) {
    return null;
  }

  try {
    response = await input.fetcher("/api/variant-practice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify(buildDynamicVariantPracticePayload(input.diagnosis)),
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const responseBody = await readJsonResponse(response);
  if (!isRecord(responseBody)) {
    return null;
  }

  return isProductVariantPractice(responseBody.variant_practice)
    ? responseBody.variant_practice
    : null;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isProductVariantPractice(
  value: unknown,
): value is ProductVariantPractice {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.source === "rag_variant_practice" &&
    (value.notice === null || typeof value.notice === "string") &&
    Array.isArray(value.items) &&
    value.items.length === 3 &&
    value.items.every(isProductVariantPracticeItem)
  );
}

function isProductVariantPracticeItem(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.rank === "number" &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.question_text === "string" &&
    typeof value.reason === "string"
  );
}
```

- [ ] **Step 4: Create the API route**

Create `src/app/api/variant-practice/route.ts`:

P2.7 请求体只包含文本摘要和少量标签，不携带图片 base64 或本地文件内容；保持 Next.js Route Handler 默认 body size limit 即可。

```ts
import { NextResponse } from "next/server";
import { createDiagnoseError } from "@/lib/diagnosis/diagnose-api";
import {
  handleDynamicVariantPracticeRequest,
  type DynamicVariantPracticeApiResponse,
} from "@/lib/server/rag/dynamic-variant-practice-service";

export async function POST(
  request: Request,
): Promise<NextResponse<DynamicVariantPracticeApiResponse>> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      createDiagnoseError("invalid_json", "请求体不是合法 JSON。", true),
      { status: 400 },
    );
  }

  const result = await handleDynamicVariantPracticeRequest(payload);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 5: Add API route smoke coverage**

Modify `scripts/tests/smoke/api-smoke.test.mjs` near the other route imports:

```js
const { POST: variantPracticeRoutePost } = jiti(
  "./src/app/api/variant-practice/route.ts",
);
```

Add route assertions after the existing invalid JSON route assertions:

```js
await assertRouteError(
  variantPracticeRoutePost,
  rawRequest("{"),
  400,
  "invalid_json",
);

await assertRouteError(
  variantPracticeRoutePost,
  jsonRequest({
    student_id: "student_002",
    request_source: "confirmed_image_diagnosis",
    evidence_level: "student_work_sufficient",
    persistence_evidence: "student_work",
    profile_update_kind: "mistake_cause",
    question_text: "讨论导数单调性。",
    knowledge_points: ["derivative_monotonicity"],
    mistake_causes: ["classification_missing"],
  }),
  400,
  "invalid_request",
);
```

- [ ] **Step 6: Add the client test to the default suite**

Modify `scripts/run-tests.mjs`, inserting this test after `dynamic-variant-practice-service.test.mjs`:

```js
"scripts/tests/rag/dynamic-variant-practice-client.test.mjs",
```

- [ ] **Step 7: Run API/client tests**

Run:

```bash
node scripts/tests/rag/dynamic-variant-practice-client.test.mjs
node scripts/tests/smoke/api-smoke.test.mjs
node scripts/run-tests.mjs default
```

Expected:

```text
dynamic variant practice client tests passed
api smoke test passed
```

The default suite should pass.

- [ ] **Step 8: Commit Task 3**

Review status first:

```bash
git status --short
```

Stage only Task 3 files:

```bash
git add src/app/api/variant-practice/route.ts \
  src/lib/rag/dynamic-variant-practice-client.ts \
  scripts/tests/rag/dynamic-variant-practice-client.test.mjs \
  scripts/tests/smoke/api-smoke.test.mjs \
  scripts/run-tests.mjs
git commit -m "feat: expose dynamic variant practice api"
```

---

### Task 4: Workbench Dynamic Recommendation Integration

**Files:**
- Modify: `src/components/mathtrace-workbench.tsx`
- Modify: `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`

**Interfaces:**
- Consumes:
  - `requestDynamicVariantPractice({ fetcher, diagnosis })`
  - `ProductVariantPractice`
- Produces:
  - Workbench state that prefers dynamic RAG for confirmed image reports, static artifact for default sample, and `diagnosis.practice_questions` fallback otherwise.

- [ ] **Step 1: Write failing UI source assertions**

Modify `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`, adding these assertions after the existing `initialVariantPractice` / `PracticeLab` assertions:

```js
assert.match(
  source,
  /import \{ requestDynamicVariantPractice \} from "@\/lib\/rag\/dynamic-variant-practice-client";/,
  "工作台应通过 browser-safe client 请求动态变式练习。",
);

assert.match(
  source,
  /const \[dynamicVariantPractice, setDynamicVariantPractice\]/,
  "工作台应持有确认上传题后的动态 RAG 推荐状态。",
);

assert.match(
  source,
  /dynamicVariantPracticeRequestIdRef\s*=\s*useRef\(0\)/,
  "动态 RAG 请求应使用 request id ref 防止旧请求覆盖新报告。",
);

assert.match(
  source,
  /const visibleVariantPractice =[\s\S]*isCurrentConfirmedImageReport[\s\S]*dynamicVariantPractice[\s\S]*initialVariantPractice/,
  "变式练习展示优先级应为确认上传题动态推荐、默认样例静态推荐、诊断 fallback。",
);

assert.match(
  source,
  /refreshDynamicVariantPractice[\s\S]*requestDynamicVariantPractice[\s\S]*dynamicVariantPracticeRequestIdRef\.current[\s\S]*setDynamicVariantPractice/,
  "动态 RAG 请求应调用 client，并用 request id 判断后再写入状态。",
);

assert.match(
  source,
  /requestId\s*!==\s*dynamicVariantPracticeRequestIdRef\.current/,
  "动态 RAG 请求成功后只允许最新请求写入状态。",
);

assert.match(
  source,
  /void refreshDynamicVariantPractice\(diagnosis\);/,
  "确认上传题生成报告后应异步请求动态变式练习。",
);

assert.match(
  source,
  /clearDynamicVariantPractice[\s\S]*dynamicVariantPracticeRequestIdRef\.current[\s\S]*setDynamicVariantPractice\(null\)/,
  "开始新诊断或切换模式时应清空动态 RAG 推荐并废弃旧请求。",
);

assert.match(
  source,
  /handleImagePrepareError[\s\S]*clearDynamicVariantPractice\(\)/,
  "图片准备失败时应清空动态 RAG 推荐。",
);

assert.match(
  source,
  /handleClearImage[\s\S]*clearDynamicVariantPractice\(\)/,
  "清空图片时应清空动态 RAG 推荐。",
);
```

- [ ] **Step 2: Run failing UI test**

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
```

Expected: FAIL on missing `requestDynamicVariantPractice` import or missing dynamic state.

- [ ] **Step 3: Import the dynamic practice client and image response type**

Modify the import block in `src/components/mathtrace-workbench.tsx`.

Add this import near other browser-safe clients:

```ts
import { requestDynamicVariantPractice } from "@/lib/rag/dynamic-variant-practice-client";
```

Change the diagnose API type import from:

```ts
import type { FollowUpAnswerDraft } from "@/lib/diagnosis/diagnose-api";
```

to:

```ts
import type {
  DiagnoseImageSuccessResponse,
  FollowUpAnswerDraft,
} from "@/lib/diagnosis/diagnose-api";
```

- [ ] **Step 4: Add state, request id, and visible priority**

In `MathTraceWorkbench`, after `studentProfileEvidence` state, add:

```ts
const [dynamicVariantPractice, setDynamicVariantPractice] =
  useState<ProductVariantPractice | null>(null);
```

After `studentProfileEvidenceRefreshRequestIdRef`, add:

```ts
const dynamicVariantPracticeRequestIdRef = useRef(0);
```

Replace the current `visibleVariantPractice` block with:

```ts
const visibleVariantPractice =
  isCurrentConfirmedImageReport && diagnosisView.source === "image"
    ? dynamicVariantPractice
    : diagnosisMode === "sample" && diagnosisView.id === DEFAULT_SAMPLE_ID
      ? initialVariantPractice
      : null;
```

- [ ] **Step 5: Add dynamic RAG helpers**

Add these helper functions near `resetFollowUpState()`:

```ts
function clearDynamicVariantPractice(): void {
  dynamicVariantPracticeRequestIdRef.current += 1;
  setDynamicVariantPractice(null);
}

const refreshDynamicVariantPractice = useCallback(
  async (diagnosis: DiagnoseImageSuccessResponse): Promise<void> => {
    const requestId = ++dynamicVariantPracticeRequestIdRef.current;
    const variantPractice = await requestDynamicVariantPractice({
      fetcher: window.fetch.bind(window),
      diagnosis,
    });

    if (requestId !== dynamicVariantPracticeRequestIdRef.current) {
      return;
    }

    setDynamicVariantPractice(variantPractice);
  },
  [],
);
```

- [ ] **Step 6: Clear dynamic state when the visible report changes**

In these functions, add `clearDynamicVariantPractice();` before changing report mode or starting a new request:

```ts
function handleSelectSample(sampleId: SampleQuestionId): void {
  clearDynamicVariantPractice();
  const nextSample = getSampleById(sampleId);
  ...
}
```

```ts
function handleSelectMode(nextMode: DiagnosisMode): void {
  if (isDiagnosing || nextMode === diagnosisMode) {
    return;
  }

  clearDynamicVariantPractice();
  setDiagnosisMode(nextMode);
  ...
}
```

```ts
function handleImagePrepareStart(): void {
  clearDynamicVariantPractice();
  setIsImagePreparing(true);
  ...
}
```

```ts
function handleImagePrepared(image: PreparedImageUpload): void {
  clearDynamicVariantPractice();
  setSelectedImage(image);
  ...
}
```

```ts
function handleImagePrepareError(message: string): void {
  clearDynamicVariantPractice();
  setImagePrepareError(message);
  ...
}
```

```ts
function handleClearImage(): void {
  clearDynamicVariantPractice();
  setSelectedImage(null);
  ...
}
```

At the start of `requestDiagnosis()` after setting request state, add:

```ts
clearDynamicVariantPractice();
```

At the start of `requestConfirmedDiagnosis()` after setting request state, add:

```ts
clearDynamicVariantPractice();
```

- [ ] **Step 7: Trigger dynamic RAG after confirmed image diagnosis**

In `requestConfirmedDiagnosis()`, immediately after:

```ts
setDiagnosisView(nextView);
setIsCurrentConfirmedImageReport(true);
```

add:

```ts
void refreshDynamicVariantPractice(diagnosis);
```

Do not `await` this call. The diagnosis report, mistake book refresh, evidence refresh, and profile refresh should keep their existing order and should not wait for RAG.

- [ ] **Step 8: Run UI and default tests**

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
node scripts/run-tests.mjs default
```

Expected:

```text
mathtrace workbench ui tests passed
```

The default suite should pass.

- [ ] **Step 9: Commit Task 4**

Review status first:

```bash
git status --short
```

Stage only Task 4 files:

```bash
git add src/components/mathtrace-workbench.tsx \
  scripts/tests/ui/mathtrace-workbench-ui.test.mjs
git commit -m "feat: request dynamic practice after image diagnosis"
```

---

### Task 5: Documentation Updates

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `docs/rag-artifacts.md`
- Modify: `interview/mathtrace-project-narrative.md`

**Interfaces:**
- Consumes: implemented P2.7 behavior from Tasks 1-4.
- Produces: product, roadmap, artifact, and interview narrative documentation aligned with code.

- [ ] **Step 0: Keep documentation draft aligned during implementation**

During Tasks 1-4, if the implemented API contract, query mapping, fallback behavior, or UI trigger differs from this plan, update the draft snippets in this Task before committing the related implementation task. Task 5 is the final write-through and consistency check, not the first time documentation should be considered.

- [ ] **Step 1: Update PRD P2/RAG boundary**

In `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`, add this paragraph after the existing P1.10 paragraph in the MVP execution strategy section:

```md
P2.7 在确认后的上传题诊断报告之后新增只读动态变式练习 API：`POST /api/variant-practice`。该接口只接收诊断摘要，服务端从受控知识点、错因和证据等级构造 Practice Query，读取本地 `enriched_practice_corpus.json` 并调用 Variant Practice Agent，返回裁剪后的 `ProductVariantPractice`。它只替换前端练习展示来源，不改变 `/api/confirm` 诊断响应、不写 `memory_events` / `student_profiles` / 错题本、不决定 `memory_delta` 或画像持久化。非导数题、证据不足、题库 artifact 缺失、题库非法或推荐不足 3 道时，前端继续展示诊断响应自带的 `practice_questions`。
```

- [ ] **Step 2: Update technical roadmap current state**

In `docs/TECHNICAL_ROADMAP.md`, add this bullet under current project status:

```md
- P2.7 起，确认后的导数类上传题诊断可以通过只读 `POST /api/variant-practice` 请求服务端 RAG，从本地增强题库返回裁剪后的 3 道变式练习；失败或不支持时仍回退到诊断响应自带练习题。
```

- [ ] **Step 3: Update RAG artifact docs**

In `docs/rag-artifacts.md`, update the core principles section by adding:

```md
- P2.7 动态变式练习 API 运行时读取 `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`，只消费已通过标签审核的题；产品页默认样例题仍可读取 `artifacts/rag/variant-practice-agent/recommendations.json`。
```

- [ ] **Step 4: Add interview narrative section**

In `interview/mathtrace-project-narrative.md`, add this section before `## 后续可追加的阶段`:

```md
## 21. P2.7 Dynamic Variant Practice（上传题后的动态变式练习）

### 当前状态

已完成实现、审查和本地验证。这个阶段把 P2.5 的静态推荐 artifact 推进到确认上传题后的只读动态推荐 API：上传题经 `/api/confirm` 生成诊断报告后，前端再异步请求 `POST /api/variant-practice`，服务端基于诊断摘要从本地增强题库中推荐 3 道变式练习。

### 功能价值

P2.5 能在产品页展示真实教辅题库里的练习题，但推荐仍绑定默认样例题 artifact。P2.7 让“上传题诊断 -> 下一步练什么”真正形成产品闭环：同一个学生上传不同导数题，练习区可以基于本次知识点、错因和题干信号动态推荐，而不是永远展示同一份预生成结果。

### 关键设计

P2.7 没有把 RAG 合进 `/api/confirm`。诊断和画像写入仍走原来的确认链路；RAG 是独立的只读 API。这样 artifact 缺失、题库 JSON 损坏或推荐不足，都不会影响诊断报告、错题本写入、`memory_events` 或 `student_profiles`。

动态 Practice Query 的专题归属先看 `knowledge_points`，只支持导数专题。`classification_missing` 这类跨专题错因不能单独把数列或函数定义域题路由到导数题库，只能在已确认导数专题后作为辅助信号。上传题没有 `section_title`，所以服务端用受控映射推导导数章节；如果目标章节在 corpus 中不存在，就降级为只用知识点和目标能力标签搜索。

前端展示仍只消费 `ProductVariantPractice`。正式页面不展示 `score`、`matched_dimensions`、`item_id`、`source_candidate_id`、raw reason 或 raw warnings。动态请求失败时，练习区保持诊断响应自带的 `practice_questions`，避免学生看到空状态。

### 技术决策与取舍

我选择新增 `POST /api/variant-practice`，而不是扩大 `/api/confirm`，是因为 RAG 推荐不是诊断事实，也不是画像写入依据。把它放成独立只读接口，可以让主诊断路径继续稳定，RAG 失败只影响练习展示，不影响报告本身。

第一版坚持“动态 RAG 成功就展示 3 道，否则回退”，是为了保持 P2.5 三卡片演示体验一致。这个策略牺牲了一些部分可用性，但避免把 1-2 道半成品推荐包装成完整练习链路。后续题库更大或 UI 支持不满 3 道提示后，可以放宽为 1-2 道 + notice。

### 性能收益（如适用）

动态推荐不调用模型、不访问数据库、不走网络题库，只读取本地 ignored artifact 并运行确定性 Agent。前端也不等待它完成才展示诊断报告，而是先显示 fallback 练习题，RAG 成功后替换，因此不会拉长 `/api/confirm` 主流程。

### 面试官可能怎么问

1. 为什么不把 RAG 直接放进 `/api/confirm`？
2. 上传题没有章节标题，你怎么构造 RAG query？
3. 怎么避免非导数题误召回导数题库？
4. RAG 推荐会不会污染学生画像？
5. 为什么动态推荐不足 3 道就回退？
6. 前端怎么避免旧请求覆盖新报告？
7. 为什么只返回 product view model，不返回 score 和 source ref？

### 推荐回答

我会这样回答：

P2.7 的重点是把 RAG 变成“下一步练什么”的只读题源服务，而不是把它变成诊断事实来源。`/api/confirm` 仍然负责用户确认、证据等级、错因诊断、`memory_delta` 和可选持久化；`/api/variant-practice` 只负责在报告完成后，根据诊断摘要找 3 道练习题。这样 RAG artifact 坏了，学生还是能看到诊断报告和 fallback 练习题。

上传题没有章节标题，所以我没有让前端传自由章节名，而是在服务端按受控规则从知识点和题干信号推导。专题归属必须先看 `knowledge_points`，例如 `derivative_monotonicity` 或 `parameter_classification`。`classification_missing` 只是跨专题错因，不能单独决定导数路由，这避免了数列分类讨论题被错误推荐导数参数题。

RAG 输出不会写画像。它不写 `memory_events`、不改 `student_profiles`、不影响 `memory_delta.should_persist`。它返回的也不是 raw Agent artifact，而是裁剪后的 `ProductVariantPractice`：只包含题型、题干和学生可读理由，隐藏内部标签、分数和调试字段。

### 可能被继续追问

- 多专题题库接入后，query 映射如何从硬编码演进为 taxonomy registry？
- 什么时候允许返回 1-2 道动态推荐？
- 真实 corpus 足够大后，是否还需要 pgvector？
- 如何评估动态推荐质量，而不是只看是否凑满 3 道？

### 反思与后续优化

P2.7 仍然是 demo-scoped：固定 `demo_student_001`，只支持导数专题，题库来自本地 ignored artifact。下一步更合理的是增加动态推荐质量评估和多专题 taxonomy 映射，而不是马上引入登录、老师端或向量数据库。

### 项目中的真实证据

- 代码：
  - `src/app/api/variant-practice/route.ts`
  - `src/lib/rag/dynamic-variant-practice-query.ts`
  - `src/lib/server/rag/dynamic-variant-practice-service.ts`
  - `src/lib/rag/dynamic-variant-practice-client.ts`
  - `src/components/mathtrace-workbench.tsx`
- 测试：
  - `scripts/tests/rag/dynamic-variant-practice-query.test.mjs`
  - `scripts/tests/rag/dynamic-variant-practice-service.test.mjs`
  - `scripts/tests/rag/dynamic-variant-practice-client.test.mjs`
  - `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - `scripts/tests/smoke/api-smoke.test.mjs`
- 文档：
  - `docs/superpowers/specs/2026-06-26-p27-dynamic-variant-practice-design.md`
  - `docs/superpowers/plans/2026-06-26-p27-dynamic-variant-practice.md`
- 验证：
  - `node scripts/run-tests.mjs default`
  - `npm run test:smoke`
  - `npm run lint`
  - `npm run build`
  - `git diff --check`
```

- [ ] **Step 5: Verify documentation text**

Run:

```bash
rg -n "P2.7|variant-practice|memory_events|student_profiles" \
  docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md \
  docs/TECHNICAL_ROADMAP.md \
  docs/rag-artifacts.md \
  interview/mathtrace-project-narrative.md
```

Expected:

- P2.7 appears in all four docs.
- No unresolved placeholder marker appears in the added text.
- The P2.7 text says RAG does not write `memory_events` or `student_profiles`.

- [ ] **Step 6: Commit Task 5**

Review status first:

```bash
git status --short
```

Stage only documentation files:

```bash
git add docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md \
  docs/TECHNICAL_ROADMAP.md \
  docs/rag-artifacts.md \
  interview/mathtrace-project-narrative.md
git commit -m "docs: document dynamic variant practice"
```

---

### Task 6: Final Verification, Local Review, and Delivery Checkpoint

**Files:**
- No new files required.
- Review but do not stage: `docs/reviews/*.md`

**Interfaces:**
- Consumes: all implementation tasks.
- Produces: verified local branch ready for review/merge flow.

- [ ] **Step 1: Run full verification**

Run:

```bash
node scripts/run-tests.mjs default
npm run test:smoke
npm run lint
npm run build
git diff --check
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
```

Expected:

- `node scripts/run-tests.mjs default` exits 0.
- `npm run test:smoke` exits 0; this is script-level API/demo smoke and does not start a browser.
- `npm run lint` exits 0.
- `npm run build` exits 0.
- `git diff --check` prints no output.
- `git ls-files artifacts .env.local docs/reviews .superpowers/sdd` prints no output.

- [ ] **Step 2: Run required local browser smoke**

Start dev server if not already running:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Manual checks:

- Default sample still shows the P2.5 static recommendation artifact when present.
- If `artifacts/rag/variant-practice-agent/recommendations.json` is missing, default sample still shows prewritten fallback cards.
- Confirmed uploaded-image report displays immediately before dynamic RAG completes.
- When dynamic RAG returns 3 items, PracticeLab cards switch to dynamic RAG items.
- If dynamic RAG returns null, PracticeLab keeps `diagnosis.practice_questions`.
- Page text does not show `score`, `matched_dimensions`, `target_skill`, `method_tag`, `source_candidate_id`, or raw RAG reason.

- [ ] **Step 3: Ask Claude Code for local review**

Use this prompt:

```text
请按 AGENTS.md / CLAUDE.md 的审查规则，对当前 P2.7 Dynamic Variant Practice 实现做只读审查，不要修改代码。

审查范围：当前分支相对 main 的 diff，但不要审查或要求提交 docs/reviews/*.md。

重点检查：
- POST /api/variant-practice 是否保持只读，无数据库/localStorage/画像写入副作用。
- query mapping 是否只由导数 knowledge_points 决定专题归属，classification_missing 是否不会单独把非导数题路由到导数 corpus。
- persistence_evidence 是否与现有 PersistenceEvidence 枚举一致。
- corpus 读取是否 server-only，前端是否没有读取 artifacts、本地文件、Supabase 或 service role key。
- artifact 缺失、bad JSON、bad corpus version、未 approved item、证据不足、非导数题、推荐不足 3 道时是否稳定回退。
- 前端是否避免旧动态 RAG 请求覆盖新报告。
- Product UI 是否不泄露 score、matched_dimensions、item_id、source_candidate_id、target_skill、method_tag、raw reason、raw warnings。
- tests 是否覆盖关键边界和失败路径。

输出中文审查报告，按严重程度列 findings；如果没有必须修复的问题，请明确写“未发现必须修复的问题”，并列出剩余测试缺口。没有 PR，请写入 docs/reviews/2026-06-26-p27-dynamic-variant-practice-implementation-review.md。
```

- [ ] **Step 4: Triage review findings**

For each Claude Code finding:

- Verify it against code and tests.
- Fix only findings that are correct for this repo and this P2.7 scope.
- Do not commit `docs/reviews/*.md` unless the user explicitly asks.
- Re-run the focused test for each fix.

- [ ] **Step 5: Re-run verification after review fixes**

Run:

```bash
node scripts/run-tests.mjs default
npm run test:smoke
npm run lint
npm run build
git diff --check
```

Expected: all pass.

- [ ] **Step 6: Show status and stage only task files**

Run:

```bash
git status --short
```

Confirm the stage set excludes:

- `.env*`
- `artifacts/**`
- `docs/reviews/*.md`
- `.superpowers/sdd/**`
- unrelated user changes

Stage exact files from Tasks 1-5 and any review-fix source/docs files. Do not use `git add .`.

- [ ] **Step 7: Create final local checkpoint commit**

If all implementation commits already exist and review fixes are committed, skip this. If review fixes remain unstaged, stage exact files and commit:

```bash
git commit -m "fix: address p27 implementation review"
```

- [ ] **Step 8: Final branch summary**

Report:

- Changed files.
- Verification commands and pass/fail status.
- Claude Code review status and fixed/retained findings.
- Whether PRD, roadmap, artifact docs, and interview narrative were updated.
- Whether `docs/reviews/*.md` remains uncommitted.

---

## Self-Review

- Spec coverage: Tasks 1-4 cover query mapping, API, service, UI trigger, fallback, field redaction, stale request handling, and `sample_diagnosis` stability. Task 5 covers PRD/roadmap/artifact/narrative doc收口. Task 6 covers verification and local review.
- Placeholder scan: Plan contains no unresolved placeholder markers; all new files have concrete paths, code snippets, and commands.
- Type consistency: `request_source`, `persistence_evidence`, `ProductVariantPractice`, `DynamicVariantPracticeRequest`, and `DynamicPracticeQuery` names are consistent across tests, service, API, client, and UI tasks.
- Scope check: The plan does not add login, real users, teacher UI, pgvector, embeddings, LLM rerank, database tables, or RAG writes to memory/profile. It keeps P2.7 as a single dynamic practice recommendation slice.
