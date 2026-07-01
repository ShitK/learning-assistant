# P2.10 Variant Practice Retrieval Quality Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local, deterministic eval CLI that measures Variant Practice retrieval/recommendation quality without changing the product API, UI, or student-memory boundaries.

**Architecture:** Add fixed eval cases, an eval-only service path that reuses the existing P2.9 dynamic variant practice flow while exposing source/candidate debug data, a small report schema/metrics core, and a CLI that writes ignored JSON reports under `artifacts/rag/evals/**`. The formal `/api/variant-practice` response stays `{ variant_practice: ProductVariantPractice | null }`; eval artifacts can contain internal fields but never enter student-facing UI.

**Tech Stack:** Next.js App Router service modules, TypeScript, Node.js ESM scripts/tests, existing Jiti test harness, existing Variant Practice Agent, existing Supabase/pgvector read-only match path. No new npm dependencies.

## Global Constraints

- Current branch may be `main` or a feature branch, but implementation should use one topic branch if substantial edits start from a clean state.
- Fixed demo student: `demo_student_001`.
- P2.10 only evaluates Variant Practice retrieval quality; it does not repair recommendation quality, tune pgvector thresholds, alter ranking, or change student-facing UI.
- `POST /api/variant-practice` external response contract stays `{ variant_practice: ProductVariantPractice | null }`.
- RAG/pgvector remains read-only at runtime and eval time: it must not write `memory_events`, `student_profiles`, `diagnosis_runs`, `mistake_book_items`, localStorage, or pgvector corpus rows.
- Eval reports may include internal debug fields only under `artifacts/rag/evals/**`; `artifacts/**` must not be staged or committed.
- `--local-only` must run without Supabase, embedding provider, API keys, or network.
- `--pgvector-preferred` may call `RAG_EMBEDDING_PROVIDER_*` and Supabase match RPC; it must fall back to local JSON when pgvector is unavailable.
- P2.10 does not implement `--strict`; warn/fail cases are report data and do not make the CLI fail.
- Do not implement login, real multi-user, teacher/admin UI, RLS user policies, multi-topic corpus expansion, LLM judge, behavior analytics, or exercise grading.
- Do not commit `.env*`, `docs/reviews/*.md`, `.superpowers/sdd/**`, generated eval reports, or any API key.

---

## File Structure

- Create `scripts/fixtures/rag/variant-practice-eval-cases.mjs`
  - Fixed P2.10 eval cases as minimal `DynamicVariantPracticeRequest`-shaped inputs plus deterministic expectations.
- Create `scripts/rag/variant-practice-eval-report-schema.mjs`
  - Runtime guard/schema for report objects and helper validation messages.
- Create `scripts/rag/evaluate-variant-practice-retrieval-core.mjs`
  - Pure-ish Node core for running cases, computing metrics, building reports, validating output paths, truncating debug text, and writing timestamp/latest reports.
- Create `scripts/rag/evaluate-variant-practice-retrieval.mjs`
  - CLI wrapper for `--local-only`, `--pgvector-preferred`, `--case`, `--output`, and `--no-latest`.
- Create tests:
  - `scripts/tests/rag/variant-practice-eval-cases.test.mjs`
  - `scripts/tests/rag/variant-practice-eval-report-schema.test.mjs`
  - `scripts/tests/rag/evaluate-variant-practice-retrieval-core.test.mjs`
  - `scripts/tests/rag/evaluate-variant-practice-retrieval-cli.test.mjs`
- Modify `src/lib/server/rag/dynamic-variant-practice-service.ts`
  - Add eval-only result type/function while preserving the public handler contract.
- Modify `scripts/run-tests.mjs`
  - Add new P2.10 tests to the default suite.
- Modify docs after implementation:
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `docs/TECHNICAL_ROADMAP.md`
  - `interview/mathtrace-project-narrative.md`

---

### Task 1: Eval Case Fixture And Report Schema

**Files:**
- Create: `scripts/fixtures/rag/variant-practice-eval-cases.mjs`
- Create: `scripts/rag/variant-practice-eval-report-schema.mjs`
- Create: `scripts/tests/rag/variant-practice-eval-cases.test.mjs`
- Create: `scripts/tests/rag/variant-practice-eval-report-schema.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Produces `variantPracticeEvalCases: VariantPracticeEvalCase[]`.
- Produces `validateVariantPracticeEvalReport(value): { ok: true; value: object } | { ok: false; errors: string[] }`.
- Later tasks consume `expected.required_target_skills`, `expected.preferred_method_tags`, and `expected.forbidden_internal_fields`.

- [ ] **Step 1: Write the failing eval case fixture test**

Create `scripts/tests/rag/variant-practice-eval-cases.test.mjs`:

```js
import assert from "node:assert/strict";
import { variantPracticeEvalCases } from "../../fixtures/rag/variant-practice-eval-cases.mjs";

assert.equal(variantPracticeEvalCases.length >= 4, true);

const ids = variantPracticeEvalCases.map((item) => item.id);
assert.equal(new Set(ids).size, ids.length);
assert.equal(ids.includes("sample_derivative_parameter_classification"), true);
assert.equal(ids.includes("upload_derivative_monotonicity"), true);
assert.equal(ids.includes("upload_problem_only_low_evidence"), true);
assert.equal(ids.includes("upload_extrema_or_maximum"), true);
assert.equal(ids.includes("unsupported_non_derivative"), true);

for (const evalCase of variantPracticeEvalCases) {
  assert.equal(typeof evalCase.id, "string");
  assert.equal(typeof evalCase.title, "string");
  assert.equal(evalCase.request.student_id, "demo_student_001");
  assert.equal(evalCase.request.request_source, "confirmed_image_diagnosis");
  assert.equal(typeof evalCase.request.question_text, "string");
  assert.equal(evalCase.request.question_text.length > 0, true);
  assert.equal(Array.isArray(evalCase.request.knowledge_points), true);
  assert.equal(Array.isArray(evalCase.request.mistake_causes), true);
  assert.equal([0, 3].includes(evalCase.expected.min_items), true);
  assert.equal(Array.isArray(evalCase.expected.required_target_skills), true);
  assert.equal(Array.isArray(evalCase.expected.preferred_method_tags), true);
  assert.deepEqual(evalCase.expected.forbidden_internal_fields, [
    "retrieval_source",
    "score",
    "item_id",
    "source_ref",
    "cosine_distance",
    "embedding_hash",
  ]);
}

const unsupported = variantPracticeEvalCases.find(
  (evalCase) => evalCase.id === "unsupported_non_derivative",
);
assert.ok(unsupported);
assert.equal(unsupported.expected.min_items, 0);
assert.deepEqual(unsupported.expected.required_target_skills, []);
assert.equal(
  unsupported.request.knowledge_points.some((point) =>
    ["derivative_monotonicity", "parameter_classification"].includes(point),
  ),
  false,
);

console.log("variant practice eval cases tests passed");
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node scripts/tests/rag/variant-practice-eval-cases.test.mjs
```

Expected: FAIL with module not found for `variant-practice-eval-cases.mjs`.

- [ ] **Step 3: Add eval cases fixture**

Create `scripts/fixtures/rag/variant-practice-eval-cases.mjs`:

```js
const forbiddenInternalFields = [
  "retrieval_source",
  "score",
  "item_id",
  "source_ref",
  "cosine_distance",
  "embedding_hash",
];

export const variantPracticeEvalCases = [
  {
    id: "sample_derivative_parameter_classification",
    title: "参数分类讨论诊断摘要",
    request: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
      question_text:
        "已知函数 f(x)=x^3-3ax 在区间上恒成立相关问题，学生分类讨论参数范围时遗漏边界。",
      knowledge_points: ["parameter_classification"],
      mistake_causes: ["classification_missing", "boundary_omission"],
    },
    expected: {
      min_items: 3,
      required_target_skills: ["parameter_range"],
      preferred_method_tags: ["parameter_range"],
      forbidden_internal_fields: forbiddenInternalFields,
    },
  },
  {
    id: "upload_derivative_monotonicity",
    title: "导数与单调性上传题",
    request: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
      question_text:
        "已知函数 f(x)=ln x-ax，讨论函数单调区间，学生没有完整分析导数符号和参数边界。",
      knowledge_points: ["derivative_monotonicity"],
      mistake_causes: ["range_boundary_omission"],
    },
    expected: {
      min_items: 3,
      required_target_skills: ["monotonicity"],
      preferred_method_tags: ["monotonicity", "parameter_range"],
      forbidden_internal_fields: forbiddenInternalFields,
    },
  },
  {
    id: "upload_tangent_slope",
    title: "切线斜率上传题",
    request: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
      // 使用 derivative_monotonicity 作为导数入口，题干中的“切线斜率”文本触发 tangent_slope / derivative_geometric_meaning。
      question_text: "已知曲线 y=f(x) 在 x=1 处的切线斜率，求切线方程。",
      knowledge_points: ["derivative_monotonicity"],
      mistake_causes: ["formula_misuse"],
    },
    expected: {
      min_items: 3,
      required_target_skills: ["tangent_slope", "derivative_geometric_meaning"],
      preferred_method_tags: ["tangent_slope", "derivative_geometric_meaning"],
      forbidden_internal_fields: forbiddenInternalFields,
    },
  },
  {
    id: "upload_extrema_or_maximum",
    title: "极值与最值上传题",
    request: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
      // 使用 derivative_monotonicity 作为导数入口，题干中的“极值与最值”文本触发 extrema target skill。
      question_text: "已知函数 f(x)=x^3-3x，讨论函数单调性并求函数的极值与最值。",
      knowledge_points: ["derivative_monotonicity"],
      mistake_causes: ["critical_point_missing"],
    },
    expected: {
      min_items: 3,
      required_target_skills: ["extrema"],
      preferred_method_tags: ["extrema"],
      forbidden_internal_fields: forbiddenInternalFields,
    },
  },
  {
    id: "upload_problem_only_low_evidence",
    title: "只有题干的低证据导数题",
    request: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: "problem_only",
      persistence_evidence: "uploaded_problem_only",
      profile_update_kind: "problem_type_focus",
      question_text: "已知函数 f(x)=x^3-3x，求函数的极值与单调区间。",
      knowledge_points: ["derivative_monotonicity"],
      mistake_causes: [],
    },
    expected: {
      min_items: 3,
      required_target_skills: ["monotonicity", "extrema"],
      preferred_method_tags: ["monotonicity", "extrema"],
      forbidden_internal_fields: forbiddenInternalFields,
    },
  },
  {
    id: "unsupported_non_derivative",
    title: "非导数题不进入导数 RAG",
    request: {
      student_id: "demo_student_001",
      request_source: "confirmed_image_diagnosis",
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
      question_text: "已知数列 an 满足递推关系，求通项公式。",
      knowledge_points: ["sequence_recursion"],
      mistake_causes: ["formula_misuse"],
    },
    expected: {
      min_items: 0,
      required_target_skills: [],
      preferred_method_tags: [],
      forbidden_internal_fields: forbiddenInternalFields,
    },
  },
];
```

- [ ] **Step 4: Run the eval case fixture test**

Run:

```bash
node scripts/tests/rag/variant-practice-eval-cases.test.mjs
```

Expected: PASS and print `variant practice eval cases tests passed`.

- [ ] **Step 5: Write the failing report schema test**

Create `scripts/tests/rag/variant-practice-eval-report-schema.test.mjs`:

```js
import assert from "node:assert/strict";
import { validateVariantPracticeEvalReport } from "../../rag/variant-practice-eval-report-schema.mjs";

const validReport = {
  eval_version: "variant-practice-retrieval-quality-v0",
  generated_at: "2026-07-01T00:00:00.000Z",
  mode: "local_only",
  corpus_version: "enriched-practice-corpus-v0",
  case_count: 1,
  summary: {
    pass: 1,
    warn: 0,
    fail: 0,
    three_item_rate: 1,
    fallback_rate: 0,
  },
  cases: [
    {
      case_id: "upload_derivative_monotonicity",
      status: "pass",
      retrieval_source: "local_json",
      display_source: "variant_practice_api",
      pgvector_attempted: false,
      candidate_count: 12,
      product_item_count: 3,
      metrics: {
        required_target_skill_matches: 2,
        unique_item_count: 3,
        recommendation_type_coverage: ["foundation", "near_transfer", "additional_practice"],
      },
      findings: [],
    },
  ],
};

assert.equal(validateVariantPracticeEvalReport(validReport).ok, true);

const invalidReport = {
  ...validReport,
  mode: "pgvector",
};
const invalidResult = validateVariantPracticeEvalReport(invalidReport);
assert.equal(invalidResult.ok, false);
assert.equal(invalidResult.errors.some((error) => error.includes("mode")), true);

const invalidSource = structuredClone(validReport);
invalidSource.cases[0].retrieval_source = "fallback_practice_questions";
const invalidSourceResult = validateVariantPracticeEvalReport(invalidSource);
assert.equal(invalidSourceResult.ok, false);
assert.equal(
  invalidSourceResult.errors.some((error) => error.includes("retrieval_source")),
  true,
);

console.log("variant practice eval report schema tests passed");
```

- [ ] **Step 6: Run the schema test and verify it fails**

Run:

```bash
node scripts/tests/rag/variant-practice-eval-report-schema.test.mjs
```

Expected: FAIL with module not found for `variant-practice-eval-report-schema.mjs`.

- [ ] **Step 7: Add report schema guard**

Create `scripts/rag/variant-practice-eval-report-schema.mjs`:

```js
const allowedModes = new Set(["local_only", "pgvector_preferred"]);
const allowedStatuses = new Set(["pass", "warn", "fail"]);
const allowedRetrievalSources = new Set(["pgvector", "local_json", null]);
const allowedDisplaySources = new Set([
  "variant_practice_api",
  "diagnosis_practice_questions",
  "none",
]);
const allowedFindingSeverities = new Set(["info", "warn", "fail"]);

export function validateVariantPracticeEvalReport(value) {
  const errors = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["report must be an object"] };
  }

  requireEqual(value.eval_version, "variant-practice-retrieval-quality-v0", "eval_version", errors);
  requireString(value.generated_at, "generated_at", errors);
  requireOneOf(value.mode, allowedModes, "mode", errors);
  requireEqual(value.corpus_version, "enriched-practice-corpus-v0", "corpus_version", errors);
  requireNumber(value.case_count, "case_count", errors);
  validateSummary(value.summary, errors);

  if (!Array.isArray(value.cases)) {
    errors.push("cases must be an array");
  } else {
    value.cases.forEach((item, index) => validateCase(item, index, errors));
  }

  return errors.length === 0 ? { ok: true, value } : { ok: false, errors };
}

function validateSummary(value, errors) {
  if (!isRecord(value)) {
    errors.push("summary must be an object");
    return;
  }
  for (const field of ["pass", "warn", "fail", "three_item_rate", "fallback_rate"]) {
    requireNumber(value[field], `summary.${field}`, errors);
  }
}

function validateCase(value, index, errors) {
  if (!isRecord(value)) {
    errors.push(`cases[${index}] must be an object`);
    return;
  }
  requireString(value.case_id, `cases[${index}].case_id`, errors);
  requireOneOf(value.status, allowedStatuses, `cases[${index}].status`, errors);
  requireOneOf(
    value.retrieval_source,
    allowedRetrievalSources,
    `cases[${index}].retrieval_source`,
    errors,
  );
  requireOneOf(
    value.display_source,
    allowedDisplaySources,
    `cases[${index}].display_source`,
    errors,
  );
  requireBoolean(value.pgvector_attempted, `cases[${index}].pgvector_attempted`, errors);
  requireNumber(value.candidate_count, `cases[${index}].candidate_count`, errors);
  requireNumber(value.product_item_count, `cases[${index}].product_item_count`, errors);
  if (!isRecord(value.metrics)) {
    errors.push(`cases[${index}].metrics must be an object`);
  }
  if (!Array.isArray(value.findings)) {
    errors.push(`cases[${index}].findings must be an array`);
  } else {
    value.findings.forEach((finding, findingIndex) =>
      validateFinding(finding, index, findingIndex, errors),
    );
  }
}

function validateFinding(value, caseIndex, findingIndex, errors) {
  if (!isRecord(value)) {
    errors.push(`cases[${caseIndex}].findings[${findingIndex}] must be an object`);
    return;
  }
  requireOneOf(
    value.severity,
    allowedFindingSeverities,
    `cases[${caseIndex}].findings[${findingIndex}].severity`,
    errors,
  );
  requireString(value.reason, `cases[${caseIndex}].findings[${findingIndex}].reason`, errors);
  requireString(value.message, `cases[${caseIndex}].findings[${findingIndex}].message`, errors);
}

function requireString(value, field, errors) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${field} must be a non-empty string`);
  }
}

function requireBoolean(value, field, errors) {
  if (typeof value !== "boolean") {
    errors.push(`${field} must be a boolean`);
  }
}

function requireNumber(value, field, errors) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${field} must be a finite number`);
  }
}

function requireEqual(value, expected, field, errors) {
  if (value !== expected) {
    errors.push(`${field} must be ${expected}`);
  }
}

function requireOneOf(value, allowedValues, field, errors) {
  if (!allowedValues.has(value)) {
    errors.push(`${field} must be one of ${Array.from(allowedValues).join(", ")}`);
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
```

- [ ] **Step 8: Run schema and fixture tests**

Run:

```bash
node scripts/tests/rag/variant-practice-eval-cases.test.mjs
node scripts/tests/rag/variant-practice-eval-report-schema.test.mjs
```

Expected: both PASS.

- [ ] **Step 9: Add tests to default suite**

Modify `scripts/run-tests.mjs`, adding the two new tests near the existing RAG tests:

```js
"scripts/tests/rag/variant-practice-eval-cases.test.mjs",
"scripts/tests/rag/variant-practice-eval-report-schema.test.mjs",
```

- [ ] **Step 10: Run default test slice**

Run:

```bash
node scripts/run-tests.mjs default
```

Expected: default suite reaches the new tests and passes through them. If later unrelated tests fail, record exact failure before continuing.

- [ ] **Step 11: Commit Task 1**

Before committing, run:

```bash
git status --short
```

Stage only Task 1 files:

```bash
git add scripts/fixtures/rag/variant-practice-eval-cases.mjs scripts/rag/variant-practice-eval-report-schema.mjs scripts/tests/rag/variant-practice-eval-cases.test.mjs scripts/tests/rag/variant-practice-eval-report-schema.test.mjs scripts/run-tests.mjs
git commit -m "feat: add variant practice eval fixtures"
```

---

### Task 2: Eval-Only Service Debug Path

**Files:**
- Modify: `src/lib/server/rag/dynamic-variant-practice-service.ts`
- Create: `scripts/tests/rag/dynamic-variant-practice-eval-service.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Produces `handleDynamicVariantPracticeEvalRequest(value, deps)`.
- Produces `DynamicVariantPracticeEvalResult` with `retrieval_source`, `pgvector_attempted`, candidate counts, candidate metadata, and `product_view_model`.
- Keeps `handleDynamicVariantPracticeRequest()` response unchanged.

- [ ] **Step 1: Write failing eval service test**

Create `scripts/tests/rag/dynamic-variant-practice-eval-service.test.mjs`:

```js
import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const service = jiti("./src/lib/server/rag/dynamic-variant-practice-service.ts");

const validRequest = {
  student_id: "demo_student_001",
  request_source: "confirmed_image_diagnosis",
  evidence_level: "student_work_sufficient",
  persistence_evidence: "student_work",
  profile_update_kind: "mistake_cause",
  question_text: "已知函数 f(x)=ln x-ax，讨论函数单调区间。",
  knowledge_points: ["derivative_monotonicity"],
  mistake_causes: ["range_boundary_omission"],
};

const corpus = {
  corpus_version: "enriched-practice-corpus-v0",
  items: [
    buildItem("a", ["monotonicity"]),
    buildItem("b", ["monotonicity"]),
    buildItem("c", ["parameter_range"]),
    { ...buildItem("d", ["monotonicity"]), tag_review_meta: { review_status: "pending" } },
  ],
};

const fakeAgent = {
  recommendVariantPractice(input) {
    assert.equal(input.corpus.items.length, 3);
    return {
      agent_version: "variant-practice-agent-v0",
      recommendations: input.corpus.items.slice(0, 3).map((item, index) => ({
        rank: index + 1,
        recommendation_type: ["foundation", "near_transfer", "additional_practice"][index],
        question_text: item.question_text,
        reason: "测试推荐",
      })),
    };
  },
};

const evalResult = await service.handleDynamicVariantPracticeEvalRequest(validRequest, {
  agent: fakeAgent,
  pgvectorCorpusSource: async () => corpus,
  localCorpusSource: async () => {
    throw new Error("local fallback should not run");
  },
});

assert.equal(evalResult.status, 200);
assert.equal(evalResult.retrieval_source, "pgvector");
assert.equal(evalResult.pgvector_attempted, true);
assert.equal(evalResult.candidate_count_before_agent, 4);
assert.equal(evalResult.candidate_count_after_approved_filter, 3);
assert.equal(evalResult.product_view_model.items.length, 3);
assert.equal(evalResult.candidate_items_after_filter.length, 3);
assert.equal(evalResult.selected_candidate_items.length, 3);
assert.deepEqual(evalResult.selected_candidate_items.map((item) => item.id), ["a", "b", "c"]);

const publicResult = await service.handleDynamicVariantPracticeRequest(validRequest, {
  agent: fakeAgent,
  pgvectorCorpusSource: async () => corpus,
});
assert.deepEqual(Object.keys(publicResult.body), ["variant_practice"]);
assert.equal("retrieval_source" in publicResult.body, false);

const unsupported = await service.handleDynamicVariantPracticeEvalRequest(
  {
    ...validRequest,
    knowledge_points: ["sequence_recursion"],
  },
  {
    pgvectorCorpusSource: async () => {
      throw new Error("pgvector should not run for unsupported scope");
    },
  },
);
assert.equal(unsupported.status, 200);
assert.equal(unsupported.retrieval_source, null);
assert.equal(unsupported.pgvector_attempted, false);
assert.equal(unsupported.candidate_count_before_agent, 0);
assert.deepEqual(unsupported.candidate_items_after_filter, []);
assert.deepEqual(unsupported.selected_candidate_items, []);
assert.equal(unsupported.product_view_model, null);

console.log("dynamic variant practice eval service tests passed");

function buildItem(id, targetSkills) {
  return {
    id,
    source_candidate_id: `candidate-${id}`,
    question_text: `测试导数题 ${id}`,
    search_text: `测试导数题 ${id}`,
    knowledge_points: ["derivative"],
    section_title: "考点 2 导数与函数的单调性",
    target_skills: targetSkills,
    method_tags: targetSkills,
    tag_review_meta: { review_status: "approved" },
  };
}
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
node scripts/tests/rag/dynamic-variant-practice-eval-service.test.mjs
```

Expected: FAIL because `handleDynamicVariantPracticeEvalRequest` is not exported.

- [ ] **Step 3: Refactor service with eval-only function**

Modify `src/lib/server/rag/dynamic-variant-practice-service.ts`:

```ts
export interface DynamicVariantPracticeEvalResult {
  status: number;
  retrieval_source: "pgvector" | "local_json" | null;
  pgvector_attempted: boolean;
  candidate_count_before_agent: number;
  candidate_count_after_approved_filter: number;
  candidate_items_after_filter: DynamicVariantPracticeEvalCandidateItem[];
  selected_candidate_items: DynamicVariantPracticeEvalCandidateItem[];
  product_view_model: ProductVariantPractice | null;
}

interface DynamicVariantPracticeEvalCandidateItem {
  id: string;
  source_candidate_id: string;
  knowledge_points: string[];
  section_title?: string | null;
  target_skills?: string[];
  method_tags?: string[];
}

export async function handleDynamicVariantPracticeEvalRequest(
  value: unknown,
  deps: DynamicVariantPracticeServiceDeps = {},
): Promise<DynamicVariantPracticeEvalResult> {
  const parsed = parseDynamicVariantPracticeRequest(value);
  if (!parsed.ok) {
    return evalResult(null, false, 0, 0, [], [], null, 400);
  }

  const query = deriveDynamicVariantPracticeQuery(parsed.value);
  if (!query) {
    return evalResult(null, false, 0, 0, [], [], null);
  }

  const shouldUsePgvector = deps.pgvectorCorpusSource !== null;
  const pgvectorCorpusSource =
    deps.pgvectorCorpusSource ?? readPgvectorDynamicPracticeCorpus;
  const localCorpusSource =
    deps.localCorpusSource ?? readLocalDynamicPracticeCorpus;

  const pgvectorCorpus = shouldUsePgvector ? await pgvectorCorpusSource(query) : null;
  const pgvectorResult = pgvectorCorpus
    ? await buildVariantPracticeEvalFromCorpus("pgvector", true, pgvectorCorpus, query, deps)
    : null;
  if (pgvectorResult?.product_view_model) {
    return pgvectorResult;
  }

  const localCorpus = await localCorpusSource(deps.corpusFilePath);
  const localResult = localCorpus
    ? await buildVariantPracticeEvalFromCorpus(
        "local_json",
        shouldUsePgvector,
        localCorpus,
        query,
        deps,
      )
    : null;

  return localResult ?? evalResult(null, shouldUsePgvector, 0, 0, [], [], null);
}
```

For eval-only local mode, widen `DynamicVariantPracticeServiceDeps.pgvectorCorpusSource` to accept `null` as a disable signal. Production callers keep omitting this dependency and continue to use the normal pgvector-preferred source order.

Add helper functions near `buildVariantPracticeFromCorpus()`:

```ts
async function buildVariantPracticeEvalFromCorpus(
  retrievalSource: "pgvector" | "local_json",
  pgvectorAttempted: boolean,
  corpus: DynamicPracticeCorpus,
  query: DynamicPracticeQuery,
  deps: DynamicVariantPracticeServiceDeps,
): Promise<DynamicVariantPracticeEvalResult> {
  const candidateCountBeforeAgent = corpus.items.length;
  const prepared = prepareCorpusAndQuery(corpus, query);
  const candidateCountAfterApprovedFilter = prepared?.corpus.items.length ?? 0;
  const candidateItemsAfterFilter = prepared
    ? toEvalCandidateItems(prepared.corpus.items)
    : [];
  if (!prepared) {
    return evalResult(
      retrievalSource,
      pgvectorAttempted,
      candidateCountBeforeAgent,
      candidateCountAfterApprovedFilter,
      candidateItemsAfterFilter,
      [],
      null,
    );
  }

  const productResult = await buildVariantPracticeFromPreparedCorpus(
    prepared.corpus,
    prepared.query,
    deps,
  );

  return evalResult(
    retrievalSource,
    pgvectorAttempted,
    candidateCountBeforeAgent,
    candidateCountAfterApprovedFilter,
    candidateItemsAfterFilter,
    productResult?.selectedCandidateItems ?? [],
    productResult?.viewModel ?? null,
  );
}

function evalResult(
  retrievalSource: "pgvector" | "local_json" | null,
  pgvectorAttempted: boolean,
  candidateCountBeforeAgent: number,
  candidateCountAfterApprovedFilter: number,
  candidateItemsAfterFilter: DynamicVariantPracticeEvalCandidateItem[],
  selectedCandidateItems: DynamicVariantPracticeEvalResult["selected_candidate_items"],
  productViewModel: ProductVariantPractice | null,
  status = 200,
): DynamicVariantPracticeEvalResult {
  return {
    status,
    retrieval_source: retrievalSource,
    pgvector_attempted: pgvectorAttempted,
    candidate_count_before_agent: candidateCountBeforeAgent,
    candidate_count_after_approved_filter: candidateCountAfterApprovedFilter,
    candidate_items_after_filter: candidateItemsAfterFilter,
    selected_candidate_items: selectedCandidateItems,
    product_view_model: productViewModel,
  };
}
```

Refactor existing `buildVariantPracticeFromCorpus()` to reuse a prepared helper:

```ts
async function buildVariantPracticeFromCorpus(
  corpus: DynamicPracticeCorpus,
  query: DynamicPracticeQuery,
  deps: DynamicVariantPracticeServiceDeps,
): Promise<ProductVariantPractice | null> {
  const prepared = prepareCorpusAndQuery(corpus, query);
  if (!prepared) {
    return null;
  }

  const result = await buildVariantPracticeFromPreparedCorpus(
    prepared.corpus,
    prepared.query,
    deps,
  );
  return result?.viewModel ?? null;
}

async function buildVariantPracticeFromPreparedCorpus(
  corpus: DynamicPracticeCorpus,
  query: DynamicPracticeQuery,
  deps: DynamicVariantPracticeServiceDeps,
): Promise<{
  viewModel: ProductVariantPractice;
  selectedCandidateItems: DynamicVariantPracticeEvalResult["selected_candidate_items"];
} | null> {
  const agent = deps.agent ?? (await loadDefaultVariantPracticeAgent());
  if (!agent) {
    return null;
  }

  try {
    const artifact = agent.recommendVariantPractice({
      corpus,
      query,
      searchLimit: deps.searchLimit ?? 12,
    });
    const viewModel = createVariantPracticeProductViewModel(artifact);
    if (!viewModel || viewModel.items.length !== 3) {
      return null;
    }

    return {
      viewModel,
      selectedCandidateItems: selectCandidateItemsForProductViewModel(
        viewModel,
        corpus.items,
      ),
    };
  } catch {
    return null;
  }
}

function selectCandidateItemsForProductViewModel(
  viewModel: ProductVariantPractice,
  corpusItems: DynamicPracticeCorpus["items"],
): DynamicVariantPracticeEvalResult["selected_candidate_items"] {
  const selectedItems = viewModel.items
    .map((productItem) =>
      corpusItems.find((item) => item.question_text === productItem.question_text),
    )
    .filter((item): item is DynamicPracticeCorpus["items"][number] => Boolean(item));

  return toEvalCandidateItems(selectedItems);
}

function toEvalCandidateItems(
  items: DynamicPracticeCorpus["items"],
): DynamicVariantPracticeEvalCandidateItem[] {
  return items.map((item) => ({
    id: item.id,
    source_candidate_id: item.source_candidate_id,
    knowledge_points: item.knowledge_points,
    section_title: item.section_title,
    target_skills: item.target_skills,
    method_tags: item.method_tags,
  }));
}
```

- [ ] **Step 4: Run eval service test**

Run:

```bash
node scripts/tests/rag/dynamic-variant-practice-eval-service.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run existing dynamic service tests**

Run:

```bash
node scripts/tests/rag/dynamic-variant-practice-service.test.mjs
node scripts/tests/rag/variant-practice-route.test.mjs
```

Expected: PASS. These prove the formal API path still hides debug fields.

- [ ] **Step 6: Add eval service test to default suite**

Modify `scripts/run-tests.mjs`:

```js
"scripts/tests/rag/dynamic-variant-practice-eval-service.test.mjs",
```

Place it near `dynamic-variant-practice-service.test.mjs`.

- [ ] **Step 7: Commit Task 2**

Run:

```bash
git status --short
git add src/lib/server/rag/dynamic-variant-practice-service.ts scripts/tests/rag/dynamic-variant-practice-eval-service.test.mjs scripts/run-tests.mjs
git commit -m "feat: expose variant practice eval diagnostics"
```

---

### Task 3: Metrics And Report Core

**Files:**
- Create: `scripts/rag/evaluate-variant-practice-retrieval-core.mjs`
- Create: `scripts/tests/rag/evaluate-variant-practice-retrieval-core.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes `variantPracticeEvalCases`.
- Consumes `handleDynamicVariantPracticeEvalRequest`.
- Produces `buildVariantPracticeRetrievalEvalReport({ cases, mode, runCase, generatedAt })`.
- Produces `writeEvalReportFiles({ report, outputDir, writeLatest })`.

- [ ] **Step 1: Write failing core metrics/report test**

Create `scripts/tests/rag/evaluate-variant-practice-retrieval-core.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildVariantPracticeRetrievalEvalReport,
  truncateDebugText,
  validateEvalOutputDir,
  writeEvalReportFiles,
} from "../../rag/evaluate-variant-practice-retrieval-core.mjs";

const cases = [
  {
    id: "good_case",
    title: "good",
    request: { knowledge_points: ["derivative_monotonicity"] },
    expected: {
      min_items: 3,
      required_target_skills: ["monotonicity"],
      preferred_method_tags: ["monotonicity"],
      forbidden_internal_fields: ["score", "source_ref"],
    },
  },
  {
    id: "unsupported_non_derivative",
    title: "unsupported",
    request: { knowledge_points: ["sequence_recursion"] },
    expected: {
      min_items: 0,
      required_target_skills: [],
      preferred_method_tags: [],
      forbidden_internal_fields: ["score", "source_ref"],
    },
  },
];

const report = await buildVariantPracticeRetrievalEvalReport({
  cases,
  mode: "local_only",
  generatedAt: "2026-07-01T00:00:00.000Z",
  runCase: async (evalCase) => {
    if (evalCase.id === "unsupported_non_derivative") {
      return {
        retrieval_source: null,
        pgvector_attempted: false,
        candidate_count_before_agent: 0,
        candidate_count_after_approved_filter: 0,
        candidate_items_after_filter: [],
        selected_candidate_items: [],
        product_view_model: null,
      };
    }
    return {
      retrieval_source: "local_json",
      pgvector_attempted: false,
      candidate_count_before_agent: 4,
      candidate_count_after_approved_filter: 3,
      candidate_items_after_filter: [
        buildDebugItem("A", ["monotonicity"]),
        buildDebugItem("B", ["monotonicity"]),
        buildDebugItem("C", ["parameter_range"]),
      ],
      product_view_model: {
        items: [
          buildProductItem("foundation", "A"),
          buildProductItem("near_transfer", "B"),
          buildProductItem("additional_practice", "C"),
        ],
      },
      selected_candidate_items: [
        buildDebugItem("A", ["monotonicity"]),
        buildDebugItem("B", ["monotonicity"]),
        buildDebugItem("C", ["parameter_range"]),
      ],
    };
  },
});

assert.equal(report.eval_version, "variant-practice-retrieval-quality-v0");
assert.equal(report.case_count, 2);
assert.equal(report.summary.pass, 2);
assert.equal(report.summary.warn, 0);
assert.equal(report.summary.fail, 0);
assert.equal(report.summary.three_item_rate, 0.5);
assert.equal(report.summary.fallback_rate, 0);
assert.equal(report.cases[0].status, "pass");
assert.equal(report.cases[0].retrieval_source, "local_json");
assert.equal(report.cases[0].pgvector_attempted, false);
assert.equal(report.cases[0].display_source, "variant_practice_api");
assert.equal(report.cases[0].metrics.required_target_skill_matches, 2);
assert.equal(report.cases[1].status, "pass");
assert.equal(report.cases[1].retrieval_source, null);
assert.equal(report.cases[1].pgvector_attempted, false);
assert.equal(report.cases[1].display_source, "diagnosis_practice_questions");

assert.equal(Array.from(truncateDebugText("abcdef", 3)).join(""), "abc");
assert.equal(truncateDebugText("短文本", 200), "短文本");

assert.equal(validateEvalOutputDir(join("artifacts", "rag", "evals", "x")).ok, true);
assert.equal(validateEvalOutputDir("src/generated").ok, false);
assert.equal(validateEvalOutputDir("public/evals").ok, false);

const outputDir = mkdtempSync(join(tmpdir(), "variant-practice-eval-"));
const writeResult = await writeEvalReportFiles({
  report,
  outputDir,
  writeLatest: true,
});
assert.equal(existsSync(writeResult.timestampPath), true);
assert.equal(existsSync(join(outputDir, "latest.json")), true);
assert.equal(JSON.parse(readFileSync(join(outputDir, "latest.json"), "utf8")).case_count, 2);

console.log("evaluate variant practice retrieval core tests passed");

function buildProductItem(type, suffix) {
  return {
    rank: suffix.charCodeAt(0) - 64,
    type,
    title: `题目 ${suffix}`,
    question_text: `题目 ${suffix}`,
    reason: "练习理由",
  };
}

function buildDebugItem(id, targetSkills) {
  return {
    id,
    knowledge_points: ["derivative"],
    section_title: "考点 2 导数与函数的单调性",
    target_skills: targetSkills,
    method_tags: targetSkills,
    question_text: `debug ${id}`,
  };
}
```

- [ ] **Step 2: Run core test and verify it fails**

Run:

```bash
node scripts/tests/rag/evaluate-variant-practice-retrieval-core.test.mjs
```

Expected: FAIL because core module is missing.

- [ ] **Step 3: Implement core module**

Create `scripts/rag/evaluate-variant-practice-retrieval-core.mjs`:

```js
import { mkdir, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { validateVariantPracticeEvalReport } from "./variant-practice-eval-report-schema.mjs";

const evalVersion = "variant-practice-retrieval-quality-v0";
const corpusVersion = "enriched-practice-corpus-v0";
const mistakeCauseMethodTagMap = {
  classification_missing: ["parameter_range"],
  boundary_omission: ["parameter_range", "monotonicity"],
  range_boundary_omission: ["parameter_range", "monotonicity"],
  formula_misuse: ["tangent_slope", "derivative_geometric_meaning"],
  critical_point_missing: ["extrema"],
};

export async function buildVariantPracticeRetrievalEvalReport({
  cases,
  mode,
  generatedAt = new Date().toISOString(),
  runCase,
}) {
  const caseReports = [];
  for (const evalCase of cases) {
    const result = await runCase(evalCase);
    caseReports.push(buildCaseReport(evalCase, result));
  }

  const summary = summarizeCases(caseReports);
  const report = {
    eval_version: evalVersion,
    generated_at: generatedAt,
    mode,
    corpus_version: corpusVersion,
    case_count: caseReports.length,
    summary,
    cases: caseReports,
  };

  const validation = validateVariantPracticeEvalReport(report);
  if (!validation.ok) {
    throw new Error(`Invalid eval report: ${validation.errors.join("; ")}`);
  }

  return report;
}

export function buildCaseReport(evalCase, result) {
  const productItems = result.product_view_model?.items ?? [];
  const selectedCandidateItems = result.selected_candidate_items ?? [];
  const metrics = buildMetrics(evalCase, productItems, selectedCandidateItems);
  const findings = buildFindings(evalCase, result, metrics);
  const status = classifyCase(evalCase, result, metrics, findings);

  return {
    case_id: evalCase.id,
    status,
    retrieval_source: result.retrieval_source,
    pgvector_attempted: result.pgvector_attempted,
    display_source:
      productItems.length > 0 ? "variant_practice_api" : "diagnosis_practice_questions",
    candidate_count: result.candidate_count_before_agent,
    product_item_count: productItems.length,
    metrics,
    findings,
    debug: {
      candidate_count_after_approved_filter:
        result.candidate_count_after_approved_filter,
      question_text_preview: truncateDebugText(evalCase.request?.question_text ?? "", 200),
    },
  };
}

export function buildMetrics(evalCase, productItems, selectedCandidateItems) {
  const expectedSkills = new Set(evalCase.expected.required_target_skills);
  const expectedMethodTags = new Set([
    ...evalCase.expected.preferred_method_tags,
    ...mapMistakeCausesToMethodTags(evalCase.request?.mistake_causes ?? []),
  ]);
  const uniqueTypes = new Set(productItems.map((item) => item.type));
  const uniqueQuestions = new Set(productItems.map((item) => item.question_text));
  let requiredTargetSkillMatches = 0;
  let mistakeCauseAlignmentMatches = 0;
  let offTopicCount = 0;

  for (const item of selectedCandidateItems) {
    const skillSet = new Set([...(item.target_skills ?? []), ...(item.method_tags ?? [])]);
    if (intersects(skillSet, expectedSkills)) {
      requiredTargetSkillMatches += 1;
    }
    if (intersects(new Set(item.method_tags ?? []), expectedMethodTags)) {
      mistakeCauseAlignmentMatches += 1;
    }
    if (!Array.isArray(item.knowledge_points) || !item.knowledge_points.includes("derivative")) {
      offTopicCount += 1;
    }
  }

  return {
    required_target_skill_matches: requiredTargetSkillMatches,
    mistake_cause_alignment_matches: mistakeCauseAlignmentMatches,
    unique_item_count: uniqueQuestions.size,
    recommendation_type_coverage: Array.from(uniqueTypes),
    off_topic_count: offTopicCount,
  };
}

export function classifyCase(evalCase, result, metrics, findings) {
  if (evalCase.expected.min_items === 0) {
    return result.product_view_model ? "fail" : "pass";
  }
  if ((result.product_view_model?.items.length ?? 0) < evalCase.expected.min_items) {
    return "fail";
  }
  if (metrics.off_topic_count > 0) {
    return "fail";
  }
  if (
    metrics.required_target_skill_matches < 2 ||
    metrics.unique_item_count < evalCase.expected.min_items ||
    metrics.recommendation_type_coverage.length < 2
  ) {
    return "warn";
  }
  return findings.some((finding) => finding.severity === "fail") ? "fail" : "pass";
}

export function buildFindings(evalCase, result, metrics) {
  const findings = [];
  const candidateTargetSkillMatches = countTargetSkillMatches(
    result.candidate_items_after_filter ?? [],
    evalCase.expected.required_target_skills,
  );
  if (
    result.pgvector_attempted &&
    result.retrieval_source === "local_json" &&
    evalCase.expected.min_items > 0
  ) {
    findings.push({
      severity: "warn",
      reason: "fallback_triggered",
      message: "pgvector 路径未返回有效结果，已回退到本地 JSON corpus。",
    });
  }
  if (result.retrieval_source === null && evalCase.expected.min_items > 0) {
    findings.push({
      severity: "warn",
      reason: result.pgvector_attempted ? "corpus_gap" : "unsupported_scope",
      message: result.pgvector_attempted
        ? "pgvector 与本地 fallback 均未返回足够候选。"
        : "当前输入没有进入支持的导数 RAG scope。",
    });
  }
  if (metrics.off_topic_count > 0) {
    findings.push({
      severity: "fail",
      reason: "unsupported_scope",
      message: "推荐题中存在非导数候选。",
    });
  }
  if (metrics.required_target_skill_matches < 2 && evalCase.expected.min_items === 3) {
    findings.push({
      severity: "warn",
      reason: "metadata_gap",
      message: "最终 3 题对目标技能覆盖不足。",
    });
  }
  if (
    result.pgvector_attempted &&
    result.candidate_count_before_agent >= 3 &&
    metrics.required_target_skill_matches < 2 &&
    evalCase.expected.min_items === 3
  ) {
    findings.push({
      severity: "warn",
      reason: "vector_too_broad",
      message: "pgvector 召回候选足够，但最终题对目标技能覆盖不足。",
    });
  }
  if (
    candidateTargetSkillMatches >= 2 &&
    metrics.required_target_skill_matches < 2 &&
    evalCase.expected.min_items === 3
  ) {
    findings.push({
      severity: "warn",
      reason: "agent_slotting_gap",
      message: "候选中存在目标技能命中题，但最终推荐未选入足够目标题。",
    });
  }
  if (metrics.unique_item_count < (result.product_view_model?.items.length ?? 0)) {
    findings.push({
      severity: "warn",
      reason: "duplicate_items",
      message: "最终推荐中存在重复题干。",
    });
  }
  return findings;
}

function countTargetSkillMatches(items, requiredTargetSkills) {
  const expectedSkills = new Set(requiredTargetSkills);
  return items.filter((item) =>
    intersects(new Set([...(item.target_skills ?? []), ...(item.method_tags ?? [])]), expectedSkills),
  ).length;
}

export function summarizeCases(cases) {
  const pass = cases.filter((item) => item.status === "pass").length;
  const warn = cases.filter((item) => item.status === "warn").length;
  const fail = cases.filter((item) => item.status === "fail").length;
  const threeItemCount = cases.filter((item) => item.product_item_count === 3).length;
  const fallbackCount = cases.filter(
    (item) => item.pgvector_attempted && item.retrieval_source === "local_json",
  ).length;
  return {
    pass,
    warn,
    fail,
    three_item_rate: cases.length === 0 ? 0 : threeItemCount / cases.length,
    fallback_rate: cases.length === 0 ? 0 : fallbackCount / cases.length,
  };
}

export function truncateDebugText(text, maxLength) {
  return Array.from(String(text)).slice(0, maxLength).join("");
}

export function validateEvalOutputDir(outputDir) {
  const normalized = isAbsolute(outputDir)
    ? relative(process.cwd(), outputDir)
    : outputDir;
  if (
    normalized === "" ||
    normalized.startsWith("src/") ||
    normalized === "src" ||
    normalized.startsWith("app/") ||
    normalized === "app" ||
    normalized.startsWith("public/") ||
    normalized === "public" ||
    normalized.includes("localStorage")
  ) {
    return { ok: false, message: "eval output must not target source, app, public, or localStorage paths" };
  }
  return { ok: true };
}

export async function writeEvalReportFiles({ report, outputDir, writeLatest }) {
  const validation = validateVariantPracticeEvalReport(report);
  if (!validation.ok) {
    throw new Error(`Invalid eval report: ${validation.errors.join("; ")}`);
  }
  const outputValidation = validateEvalOutputDir(outputDir);
  if (!outputValidation.ok) {
    throw new Error(outputValidation.message);
  }

  await mkdir(outputDir, { recursive: true });
  const timestampName = `${formatTimestampForFile(report.generated_at)}.json`;
  const timestampPath = join(outputDir, timestampName);
  const text = `${JSON.stringify(report, null, 2)}\n`;
  await writeFile(timestampPath, text, "utf8");

  if (writeLatest) {
    const latestPath = join(outputDir, "latest.json");
    const tmpPath = join(outputDir, `.latest-${process.pid}.tmp`);
    await writeFile(tmpPath, text, "utf8");
    await rename(tmpPath, latestPath);
  }

  return { timestampPath };
}

function formatTimestampForFile(value) {
  return new Date(value).toISOString().slice(0, 19).replace(/:/g, "-") + "Z";
}

function mapMistakeCausesToMethodTags(mistakeCauses) {
  return mistakeCauses.flatMap((cause) => mistakeCauseMethodTagMap[cause] ?? []);
}

function intersects(left, right) {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }
  return false;
}
```

- [ ] **Step 4: Run core test**

Run:

```bash
node scripts/tests/rag/evaluate-variant-practice-retrieval-core.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Add core test to default suite**

Modify `scripts/run-tests.mjs`:

```js
"scripts/tests/rag/evaluate-variant-practice-retrieval-core.test.mjs",
```

- [ ] **Step 6: Commit Task 3**

Run:

```bash
git status --short
git add scripts/rag/evaluate-variant-practice-retrieval-core.mjs scripts/tests/rag/evaluate-variant-practice-retrieval-core.test.mjs scripts/run-tests.mjs
git commit -m "feat: add variant practice eval report core"
```

---

### Task 4: Eval CLI

**Files:**
- Create: `scripts/rag/evaluate-variant-practice-retrieval.mjs`
- Create: `scripts/tests/rag/evaluate-variant-practice-retrieval-cli.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes `variantPracticeEvalCases`, `handleDynamicVariantPracticeEvalRequest`, and core report helpers.
- Produces CLI commands:
  - `node scripts/rag/evaluate-variant-practice-retrieval.mjs --local-only`
  - `node --env-file=.env.local scripts/rag/evaluate-variant-practice-retrieval.mjs --pgvector-preferred`

- [ ] **Step 1: Write failing CLI test**

Create `scripts/tests/rag/evaluate-variant-practice-retrieval-cli.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const outputDir = mkdtempSync(join(tmpdir(), "variant-practice-eval-cli-"));

const result = spawnSync(
  process.execPath,
  [
    "scripts/rag/evaluate-variant-practice-retrieval.mjs",
    "--local-only",
    "--case",
    "unsupported_non_derivative",
    "--output",
    outputDir,
  ],
  { cwd: process.cwd(), encoding: "utf8" },
);

assert.equal(result.status, 0, result.stderr);
assert.match(result.stdout, /variant practice retrieval eval report written/);
assert.equal(existsSync(join(outputDir, "latest.json")), true);

const report = JSON.parse(readFileSync(join(outputDir, "latest.json"), "utf8"));
assert.equal(report.mode, "local_only");
assert.equal(report.case_count, 1);
assert.equal(report.cases[0].case_id, "unsupported_non_derivative");
assert.equal(report.cases[0].retrieval_source, null);

const noLatestDir = mkdtempSync(join(tmpdir(), "variant-practice-eval-cli-no-latest-"));
const noLatest = spawnSync(
  process.execPath,
  [
    "scripts/rag/evaluate-variant-practice-retrieval.mjs",
    "--local-only",
    "--case",
    "unsupported_non_derivative",
    "--output",
    noLatestDir,
    "--no-latest",
  ],
  { cwd: process.cwd(), encoding: "utf8" },
);
assert.equal(noLatest.status, 0, noLatest.stderr);
assert.equal(existsSync(join(noLatestDir, "latest.json")), false);

const badCase = spawnSync(
  process.execPath,
  [
    "scripts/rag/evaluate-variant-practice-retrieval.mjs",
    "--local-only",
    "--case",
    "missing_case",
    "--output",
    outputDir,
  ],
  { cwd: process.cwd(), encoding: "utf8" },
);
assert.equal(badCase.status, 1);
assert.match(badCase.stderr, /Unknown eval case: missing_case/);

const badMode = spawnSync(
  process.execPath,
  ["scripts/rag/evaluate-variant-practice-retrieval.mjs", "--local-only", "--pgvector-preferred"],
  { cwd: process.cwd(), encoding: "utf8" },
);
assert.equal(badMode.status, 1);
assert.match(badMode.stderr, /Choose exactly one mode/);

const missingOutput = spawnSync(
  process.execPath,
  ["scripts/rag/evaluate-variant-practice-retrieval.mjs", "--local-only", "--output"],
  { cwd: process.cwd(), encoding: "utf8" },
);
assert.equal(missingOutput.status, 1);
assert.match(missingOutput.stderr, /--output requires a value/);

const missingCase = spawnSync(
  process.execPath,
  ["scripts/rag/evaluate-variant-practice-retrieval.mjs", "--local-only", "--case", "--no-latest"],
  { cwd: process.cwd(), encoding: "utf8" },
);
assert.equal(missingCase.status, 1);
assert.match(missingCase.stderr, /--case requires a value/);

console.log("evaluate variant practice retrieval cli tests passed");
```

- [ ] **Step 2: Run CLI test and verify it fails**

Run:

```bash
node scripts/tests/rag/evaluate-variant-practice-retrieval-cli.test.mjs
```

Expected: FAIL because CLI file is missing.

- [ ] **Step 3: Implement CLI**

Create `scripts/rag/evaluate-variant-practice-retrieval.mjs`:

```js
#!/usr/bin/env node
import { join } from "node:path";
import { variantPracticeEvalCases } from "../fixtures/rag/variant-practice-eval-cases.mjs";
import {
  buildVariantPracticeRetrievalEvalReport,
  writeEvalReportFiles,
} from "./evaluate-variant-practice-retrieval-core.mjs";
import { createProjectJiti } from "../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { handleDynamicVariantPracticeEvalRequest } = jiti(
  "./src/lib/server/rag/dynamic-variant-practice-service.ts",
);

const args = parseArgs(process.argv.slice(2));
if (!args.ok) {
  console.error(args.message);
  process.exit(1);
}

const selectedCases = args.caseId
  ? variantPracticeEvalCases.filter((evalCase) => evalCase.id === args.caseId)
  : variantPracticeEvalCases;

if (args.caseId && selectedCases.length === 0) {
  console.error(`Unknown eval case: ${args.caseId}`);
  process.exit(1);
}

const report = await buildVariantPracticeRetrievalEvalReport({
  cases: selectedCases,
  mode: args.mode,
  runCase: async (evalCase) =>
    handleDynamicVariantPracticeEvalRequest(evalCase.request, {
      pgvectorCorpusSource: args.mode === "local_only" ? null : undefined,
    }),
});

const outputDir =
  args.outputDir ??
  join("artifacts", "rag", "evals", "variant-practice-retrieval-quality");
const writeResult = await writeEvalReportFiles({
  report,
  outputDir,
  writeLatest: !args.noLatest,
});

console.log(`variant practice retrieval eval report written: ${writeResult.timestampPath}`);

function parseArgs(argv) {
  let mode = null;
  let outputDir = null;
  let caseId = null;
  let noLatest = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--local-only") {
      mode = mode ? "invalid" : "local_only";
    } else if (arg === "--pgvector-preferred") {
      mode = mode ? "invalid" : "pgvector_preferred";
    } else if (arg === "--output") {
      const consumed = consumeValue(argv, index, "--output");
      if (!consumed.ok) {
        return consumed;
      }
      outputDir = consumed.value;
      index += 1;
    } else if (arg === "--case") {
      const consumed = consumeValue(argv, index, "--case");
      if (!consumed.ok) {
        return consumed;
      }
      caseId = consumed.value;
      index += 1;
    } else if (arg === "--no-latest") {
      noLatest = true;
    } else {
      return { ok: false, message: `Unknown argument: ${arg}` };
    }
  }

  if (!mode || mode === "invalid") {
    return { ok: false, message: "Choose exactly one mode: --local-only or --pgvector-preferred" };
  }
  return { ok: true, mode, outputDir, caseId, noLatest };
}

function consumeValue(argv, index, name) {
  const next = argv[index + 1];
  if (next === undefined || next.startsWith("--")) {
    return { ok: false, message: `${name} requires a value` };
  }
  return { ok: true, value: next };
}
```

- [ ] **Step 4: Run CLI test**

Run:

```bash
node scripts/tests/rag/evaluate-variant-practice-retrieval-cli.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run a local-only manual smoke**

Run:

```bash
node scripts/rag/evaluate-variant-practice-retrieval.mjs --local-only --no-latest --output artifacts/rag/evals/mathtrace-p210-eval
```

Expected: exit 0, stdout includes `variant practice retrieval eval report written`, and the generated ignored `artifacts/rag/evals/mathtrace-p210-eval` directory is removed after the smoke.

- [ ] **Step 6: Add CLI test to default suite**

Modify `scripts/run-tests.mjs`:

```js
"scripts/tests/rag/evaluate-variant-practice-retrieval-cli.test.mjs",
```

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git status --short
git add scripts/rag/evaluate-variant-practice-retrieval.mjs scripts/tests/rag/evaluate-variant-practice-retrieval-cli.test.mjs scripts/run-tests.mjs
git commit -m "feat: add variant practice eval cli"
```

---

### Task 5: Boundary Guards And Documentation

**Files:**
- Create: `scripts/tests/rag/variant-practice-eval-boundaries.test.mjs`
- Modify: `scripts/run-tests.mjs`
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `interview/mathtrace-project-narrative.md`

**Interfaces:**
- Consumes final P2.10 CLI and service modules.
- Produces docs that accurately describe P2.10 as implemented.

- [ ] **Step 1: Write boundary import/output test**

Create `scripts/tests/rag/variant-practice-eval-boundaries.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const cli = readFileSync("scripts/rag/evaluate-variant-practice-retrieval.mjs", "utf8");
const core = readFileSync("scripts/rag/evaluate-variant-practice-retrieval-core.mjs", "utf8");
const service = readFileSync("src/lib/server/rag/dynamic-variant-practice-service.ts", "utf8");

for (const source of [cli, core, service]) {
  assert.equal(source.includes("student-profile-persistence"), false);
  assert.equal(source.includes("diagnosis-persistence"), false);
  assert.equal(source.includes("mistake-book-persistence"), false);
  assert.equal(source.includes("localStorage"), false);
}

assert.equal(cli.includes("upsertItems"), false);
assert.equal(cli.includes("deactivateMissingItems"), false);
assert.equal(core.includes("upsertItems"), false);
assert.equal(core.includes("deactivateMissingItems"), false);
assert.equal(service.includes("handleDynamicVariantPracticeRequest"), true);
assert.equal(service.includes("handleDynamicVariantPracticeEvalRequest"), true);

console.log("variant practice eval boundary tests passed");
```

- [ ] **Step 2: Run boundary test**

Run:

```bash
node scripts/tests/rag/variant-practice-eval-boundaries.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Add boundary test to default suite**

Modify `scripts/run-tests.mjs`:

```js
"scripts/tests/rag/variant-practice-eval-boundaries.test.mjs",
```

- [ ] **Step 4: Update PRD**

Modify `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`, adding after the P2.9 paragraph:

```md
P2.10 在 P2.9 基础上新增离线 Variant Practice Retrieval Quality Evaluation：本地维护者可运行 eval CLI，对固定导数诊断 cases 评估 pgvector/local fallback 推荐的覆盖率、相关性、多样性、fallback 稳定性和边界安全。P2.10 只输出 ignored 本地报告 `artifacts/rag/evals/**`，不改变 `POST /api/variant-practice` 正式响应、不改前端 UI、不写 `memory_events`、`student_profiles`、`diagnosis_runs`、`mistake_book_items` 或 localStorage，也不自动修正题库、标签、召回或排序。
```

- [ ] **Step 5: Update Technical Roadmap**

Modify `docs/TECHNICAL_ROADMAP.md`, near the RAG/pgvector status section:

```md
- P2.10 起，变式练习推荐新增本地离线 eval：固定诊断 cases，量化 pgvector/local fallback 推荐的 coverage、relevance、diversity、fallback 和安全边界，并输出 ignored `artifacts/rag/evals/**` 报告。该评估不改变学生端 API/UI，也不写画像或错题本。
```

- [ ] **Step 6: Update interview narrative**

Modify `interview/mathtrace-project-narrative.md`, adding a P2.10 section after P2.9:

```md
## 24. P2.10 Variant Practice Retrieval Quality Evaluation（变式推荐质量评估）

### 当前状态
已完成本地离线 eval MVP。它不会改变学生端推荐 UI，而是用固定导数诊断 cases 评估 pgvector、本地 fallback 和最终 3 题推荐质量。

### 功能价值
这一阶段回答的是“推荐题是不是适合当前错因”，而不只是“系统能不能返回 3 道题”。如果质量不好，报告会把问题归因到 corpus、metadata、vector retrieval、Agent slotting 或 fallback。

### 关键设计
eval CLI 只写 ignored `artifacts/rag/evals/**` 报告。正式 `/api/variant-practice` 仍不暴露 retrieval source、score 或 item id；RAG/pgvector 仍不写 `memory_events` / `student_profiles`。

### 面试表达
我没有只把 pgvector 接上就结束，而是补了离线评估。这样推荐质量下降时，我能定位是题库问题、标签问题、向量召回太泛，还是 Agent 最后三卡片选择有问题。
```

- [ ] **Step 7: Run documentation grep**

Run:

```bash
rg -n "P2.10|variant practice retrieval quality|artifacts/rag/evals|memory_events|student_profiles" docs/TECHNICAL_ROADMAP.md docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md interview/mathtrace-project-narrative.md
```

Expected: P2.10 appears in all three docs, and each mention preserves the no-memory-write boundary.

- [ ] **Step 8: Run focused and default verification**

Run:

```bash
node scripts/tests/rag/variant-practice-eval-cases.test.mjs
node scripts/tests/rag/variant-practice-eval-report-schema.test.mjs
node scripts/tests/rag/dynamic-variant-practice-eval-service.test.mjs
node scripts/tests/rag/evaluate-variant-practice-retrieval-core.test.mjs
node scripts/tests/rag/evaluate-variant-practice-retrieval-cli.test.mjs
node scripts/tests/rag/variant-practice-eval-boundaries.test.mjs
node scripts/run-tests.mjs default
npm run lint
npm run build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 9: Commit Task 5**

Run:

```bash
git status --short
git add scripts/tests/rag/variant-practice-eval-boundaries.test.mjs scripts/run-tests.mjs docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
git commit -m "docs: document variant practice eval"
```

---

## Final Verification

After all tasks are complete:

- [ ] Run `node scripts/run-tests.mjs default`
- [ ] Run `npm run test:smoke`
- [ ] Run `npm run lint`
- [ ] Run `npm run build`
- [ ] Run `git diff --check`
- [ ] Run local eval smoke:

```bash
node scripts/rag/evaluate-variant-practice-retrieval.mjs --local-only --output artifacts/rag/evals/mathtrace-p210-final-eval --no-latest
```

Expected: command exits 0 and writes an ignored JSON report under `artifacts/rag/evals/**`; remove the generated smoke directory before committing.

- [ ] Optional real pgvector smoke, only when `.env.local` is configured and cost is acceptable:

```bash
node --env-file=.env.local scripts/rag/evaluate-variant-practice-retrieval.mjs --pgvector-preferred --output artifacts/rag/evals/mathtrace-p210-pgvector-eval --no-latest
```

Expected: command exits 0. If pgvector/provider is unavailable, report records fallback instead of failing.

- [ ] Confirm no generated artifacts are staged:

```bash
git status --short
```

Expected: no `artifacts/**`, `.env*`, `docs/reviews/*.md`, or `.superpowers/sdd/**` staged.

---

## Review Handoff

After implementation and verification, request a read-only Claude Code review focused on:

- eval-only service does not change formal `/api/variant-practice` response.
- eval CLI does not write memory/profile/mistake-book/diagnosis/corpus rows.
- local-only mode works without provider keys or network.
- report schema and atomic writes prevent malformed/partial reports.
- generated artifacts remain ignored.
