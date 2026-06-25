# P2.5 Variant Practice Product Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the current local Variant Practice Agent recommendations inside the MathTrace product workbench, using a student-facing display that hides internal RAG/debug tags.

**Architecture:** Add a small server-side loader that reads the ignored local `recommendations.json` artifact and maps it into a browser-safe product view model. Pass that view model from `src/app/page.tsx` into the existing client workbench, and let `PracticeLab` render it only for the default derivative sample; otherwise it keeps the existing `diagnosis.practice_questions` fallback.

**Tech Stack:** Next.js App Router, React Client Components, TypeScript, KaTeX through existing `MathText`, Node.js `fs/promises` only in a server-side loader, existing Node/Jiti tests. No new npm dependencies.

## Global Constraints

- Do not commit `.env*`, `artifacts/**`, `docs/reviews/*.md`, `.superpowers/sdd/**`, PDF files, MinerU JSON, real corpus artifacts, or generated recommendation artifacts.
- Do not create a new API route for P2.5.
- Do not let frontend/client components read `fs`, `artifacts/`, service role keys, Supabase, or provider env vars.
- Do not show internal fields in the product UI: `score`, `knowledge_point`, `section_title`, `target_skill`, `method_tag`, `query_term`, `matched_dimensions`, `item_id`, `source_candidate_id`, raw `warnings`, or raw `demo_fill_used`.
- Convert `demo_fill_used` into student-facing Chinese copy: `当前题库里暂时没有足够合适的综合练习，已为你补充一题相近练习。`
- Preserve `sample_diagnosis` stability: if the local artifact is missing, malformed, or for a different sample, the existing prewritten `diagnosis.practice_questions` must still render.
- RAG remains a variant-practice source layer only; it must not write `memory_events`, `student_profiles`, mistake book, or evidence API data.
- This task only integrates an ignored local recommendation artifact into the demo UI. It does not add pgvector, embeddings, live retrieval, a database table, AI generation, answer submission, real grading, or teacher/admin flows.

---

## File Structure

- Create `src/lib/rag/variant-practice-product-view-model.ts`
  - Browser-safe types and pure mapping from `variant-practice-agent-v0` artifact shape to product display shape.
  - Exports `createVariantPracticeProductViewModel()` and TypeScript interfaces.
- Create `src/lib/rag/variant-practice-product-loader.ts`
  - Server-only file-reading boundary.
  - Reads `artifacts/rag/variant-practice-agent/recommendations.json`.
  - Returns `ProductVariantPractice | null`.
- Modify `src/app/page.tsx`
  - Convert `Home()` to an async Server Component and pass `initialVariantPractice` into `MathTraceWorkbench`.
- Modify `src/components/mathtrace-workbench.tsx`
  - Accept optional `initialVariantPractice`.
  - Only pass it to `PracticeLab` when the visible diagnosis is the default derivative sample.
- Modify `src/components/workbench/practice-lab.tsx`
  - Render RAG recommendations when provided.
  - Keep current prewritten practice cards as fallback.
  - Hide internal debug labels and raw warnings.
- Modify `src/components/workbench/workbench-labels.ts`
  - Add product labels for `foundation`, `near_transfer`, `mixed_application`, and `additional_practice`.
- Create `scripts/tests/rag/variant-practice-product-view-model.test.mjs`
  - Tests pure mapping and field redaction.
- Modify `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - Tests product UI source does not expose internal RAG debug fields and accepts `initialVariantPractice`.
- Modify `scripts/run-tests.mjs`
  - Add the new product view-model test to the default suite.
- Modify `interview/mathtrace-project-narrative.md`
  - Add a short P2.5 note after P2.3/P2.4 RAG paragraphs.

---

## Product Display Contract

The product UI consumes only this shape:

```ts
export interface ProductVariantPractice {
  source: "rag_variant_practice";
  query_id: string | null;
  items: ProductVariantPracticeItem[];
  notice: string | null;
}

export interface ProductVariantPracticeItem {
  rank: number;
  type: "foundation" | "near_transfer" | "mixed_application" | "additional_practice";
  title: string;
  question_text: string;
  reason: string;
}
```

It must not include `score`, `matched_dimensions`, `item_id`, `source_candidate_id`, `source_ref`, raw `warnings`, or any tag key.

---

## Task 1: Product View Model Mapper

**Files:**
- Create: `src/lib/rag/variant-practice-product-view-model.ts`
- Create: `scripts/tests/rag/variant-practice-product-view-model.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes: raw local artifact object shaped like `variant-practice-agent-v0`.
- Produces:
  - `ProductVariantPractice`
  - `createVariantPracticeProductViewModel(value: unknown): ProductVariantPractice | null`

- [ ] **Step 1: Write the failing mapper test**

Create `scripts/tests/rag/variant-practice-product-view-model.test.mjs`:

```js
import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { createVariantPracticeProductViewModel } = jiti(
  "./src/lib/rag/variant-practice-product-view-model.ts",
);

const artifact = {
  agent_version: "variant-practice-agent-v0",
  query_id: "demo-derivative-tangent-slope",
  recommendations: [
    {
      rank: 1,
      recommendation_type: "foundation",
      item_id: "practice-internal-1",
      source_candidate_id: "candidate-internal-1",
      question_text: "1. 已知 $f'(1)=2$，求切线斜率。",
      reason: "同章节同标签，适合作为第一道巩固题。",
      matched_dimensions: ["knowledge_point", "target_skill", "method_tag"],
      score: 42,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
    },
    {
      rank: 2,
      recommendation_type: "near_transfer",
      item_id: "practice-internal-2",
      source_candidate_id: "candidate-internal-2",
      question_text: "2. 跨章节切线斜率题。",
      reason: "跨章节但同目标技能，适合作为第二道近迁移题。",
      matched_dimensions: ["knowledge_point", "target_skill"],
      score: 34,
      source_ref: null,
    },
    {
      rank: 3,
      recommendation_type: "additional_practice",
      item_id: "practice-internal-3",
      source_candidate_id: "candidate-internal-3",
      question_text: "3. 同标签补充练习。",
      reason: "当前题库暂缺稳定综合应用题，补充一题同标签相近题。",
      matched_dimensions: ["knowledge_point", "target_skill"],
      score: 40,
      source_ref: null,
    },
  ],
  warnings: ["demo_fill_used"],
};

const viewModel = createVariantPracticeProductViewModel(artifact);

assert.equal(viewModel.source, "rag_variant_practice");
assert.equal(viewModel.query_id, "demo-derivative-tangent-slope");
assert.equal(viewModel.items.length, 3);
assert.deepEqual(
  viewModel.items.map((item) => item.title),
  ["巩固题", "近迁移题", "补充练习题"],
);
assert.equal(
  viewModel.notice,
  "当前题库里暂时没有足够合适的综合练习，已为你补充一题相近练习。",
);

const serialized = JSON.stringify(viewModel);
for (const forbidden of [
  "practice-internal",
  "candidate-internal",
  "matched_dimensions",
  "knowledge_point",
  "target_skill",
  "method_tag",
  "score",
  "source_ref",
  "demo_fill_used",
]) {
  assert.equal(serialized.includes(forbidden), false, `${forbidden} leaked`);
}

assert.equal(createVariantPracticeProductViewModel({ agent_version: "bad" }), null);
assert.equal(createVariantPracticeProductViewModel({ agent_version: "variant-practice-agent-v0", recommendations: [] }), null);

console.log("variant practice product view model tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/tests/rag/variant-practice-product-view-model.test.mjs
```

Expected: FAIL with module not found for `src/lib/rag/variant-practice-product-view-model.ts`.

- [ ] **Step 3: Implement the mapper**

Create `src/lib/rag/variant-practice-product-view-model.ts`:

```ts
export type ProductVariantPracticeType =
  | "foundation"
  | "near_transfer"
  | "mixed_application"
  | "additional_practice";

export interface ProductVariantPractice {
  source: "rag_variant_practice";
  query_id: string | null;
  items: ProductVariantPracticeItem[];
  notice: string | null;
}

export interface ProductVariantPracticeItem {
  rank: number;
  type: ProductVariantPracticeType;
  title: string;
  question_text: string;
  reason: string;
}

const recommendationTypeLabels: Record<ProductVariantPracticeType, string> = {
  foundation: "巩固题",
  near_transfer: "近迁移题",
  mixed_application: "综合应用题",
  additional_practice: "补充练习题",
};

const demoFillNotice =
  "当前题库里暂时没有足够合适的综合练习，已为你补充一题相近练习。";

export function createVariantPracticeProductViewModel(
  value: unknown,
): ProductVariantPractice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const artifact = value as {
    agent_version?: unknown;
    query_id?: unknown;
    recommendations?: unknown;
    warnings?: unknown;
  };

  if (artifact.agent_version !== "variant-practice-agent-v0") {
    return null;
  }

  if (!Array.isArray(artifact.recommendations)) {
    return null;
  }

  const items = artifact.recommendations
    .map(toProductItem)
    .filter((item): item is ProductVariantPracticeItem => item !== null)
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 3);

  if (items.length === 0) {
    return null;
  }

  const warnings = filterStringArray(artifact.warnings);

  return {
    source: "rag_variant_practice",
    query_id: typeof artifact.query_id === "string" ? artifact.query_id : null,
    items,
    notice: warnings.includes("demo_fill_used") ? demoFillNotice : null,
  };
}

function toProductItem(value: unknown): ProductVariantPracticeItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const item = value as {
    rank?: unknown;
    recommendation_type?: unknown;
    question_text?: unknown;
    reason?: unknown;
  };
  const type = normalizeRecommendationType(item.recommendation_type);

  if (
    type === null ||
    !Number.isInteger(item.rank) ||
    typeof item.question_text !== "string" ||
    !item.question_text.trim() ||
    typeof item.reason !== "string" ||
    !item.reason.trim()
  ) {
    return null;
  }

  return {
    rank: item.rank,
    type,
    title: recommendationTypeLabels[type],
    question_text: item.question_text.trim(),
    reason: item.reason.trim(),
  };
}

function normalizeRecommendationType(value: unknown): ProductVariantPracticeType | null {
  if (
    value === "foundation" ||
    value === "near_transfer" ||
    value === "mixed_application" ||
    value === "additional_practice"
  ) {
    return value;
  }
  return null;
}

function filterStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            .map((item) => item.trim()),
        ),
      ]
    : [];
}
```

- [ ] **Step 4: Register the test in the default suite**

Modify `scripts/run-tests.mjs`, adding this after `variant-practice-agent-ui-cli.test.mjs`:

```js
"scripts/tests/rag/variant-practice-product-view-model.test.mjs",
```

- [ ] **Step 5: Run tests**

Run:

```bash
node scripts/tests/rag/variant-practice-product-view-model.test.mjs
node scripts/run-tests.mjs default
```

Expected:

```text
variant practice product view model tests passed
...
demo state regression test passed
```

- [ ] **Step 6: Commit**

Stage only these files:

```bash
git add src/lib/rag/variant-practice-product-view-model.ts \
  scripts/tests/rag/variant-practice-product-view-model.test.mjs \
  scripts/run-tests.mjs
git commit -m "feat: add variant practice product view model"
```

---

## Task 2: Server-Side Artifact Loader

**Files:**
- Create: `src/lib/rag/variant-practice-product-loader.ts`
- Create: `scripts/tests/rag/variant-practice-product-loader.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes:
  - `createVariantPracticeProductViewModel(value: unknown): ProductVariantPractice | null`
- Produces:
  - `readVariantPracticeProductRecommendations(options?: { filePath?: string }): Promise<ProductVariantPractice | null>`

- [ ] **Step 1: Write the failing loader test**

Create `scripts/tests/rag/variant-practice-product-loader.test.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { readVariantPracticeProductRecommendations } = jiti(
  "./src/lib/rag/variant-practice-product-loader.ts",
);

const tmpRoot = mkdtempSync(join(tmpdir(), "variant-practice-product-loader-"));
const artifactPath = join(tmpRoot, "recommendations.json");

writeFileSync(
  artifactPath,
  `${JSON.stringify(
    {
      agent_version: "variant-practice-agent-v0",
      query_id: "demo-derivative-tangent-slope",
      recommendations: [
        {
          rank: 1,
          recommendation_type: "foundation",
          item_id: "internal-1",
          source_candidate_id: "candidate-1",
          question_text: "1. 已知 $f'(1)=2$，求切线斜率。",
          reason: "同章节同标签。",
          matched_dimensions: ["knowledge_point"],
          score: 42,
        },
      ],
      warnings: ["demo_fill_used"],
    },
    null,
    2,
  )}\n`,
);

const loaded = await readVariantPracticeProductRecommendations({ filePath: artifactPath });
assert.equal(loaded.items.length, 1);
assert.equal(loaded.items[0].title, "巩固题");
assert.equal(loaded.notice, "当前题库里暂时没有足够合适的综合练习，已为你补充一题相近练习。");

const missing = await readVariantPracticeProductRecommendations({
  filePath: join(tmpRoot, "missing.json"),
});
assert.equal(missing, null);

writeFileSync(join(tmpRoot, "bad.json"), "{");
const malformed = await readVariantPracticeProductRecommendations({
  filePath: join(tmpRoot, "bad.json"),
});
assert.equal(malformed, null);

console.log("variant practice product loader tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/tests/rag/variant-practice-product-loader.test.mjs
```

Expected: FAIL with module not found for `src/lib/rag/variant-practice-product-loader.ts`.

- [ ] **Step 3: Implement the loader**

Create `src/lib/rag/variant-practice-product-loader.ts`:

```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createVariantPracticeProductViewModel,
  type ProductVariantPractice,
} from "@/lib/rag/variant-practice-product-view-model";

const defaultRecommendationsPath = "artifacts/rag/variant-practice-agent/recommendations.json";

export async function readVariantPracticeProductRecommendations({
  filePath = defaultRecommendationsPath,
}: {
  filePath?: string;
} = {}): Promise<ProductVariantPractice | null> {
  try {
    const rawText = await readFile(resolve(filePath), "utf8");
    const parsed: unknown = JSON.parse(rawText);
    return createVariantPracticeProductViewModel(parsed);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Register the test**

Modify `scripts/run-tests.mjs`, adding this after the view-model test:

```js
"scripts/tests/rag/variant-practice-product-loader.test.mjs",
```

- [ ] **Step 5: Run tests**

Run:

```bash
node scripts/tests/rag/variant-practice-product-loader.test.mjs
node scripts/run-tests.mjs default
```

Expected:

```text
variant practice product loader tests passed
...
demo state regression test passed
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/rag/variant-practice-product-loader.ts \
  scripts/tests/rag/variant-practice-product-loader.test.mjs \
  scripts/run-tests.mjs
git commit -m "feat: load variant practice recommendations server side"
```

---

## Task 3: Product Workbench Integration

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/mathtrace-workbench.tsx`
- Modify: `src/components/workbench/practice-lab.tsx`
- Modify: `src/components/workbench/workbench-labels.ts`
- Modify: `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`

**Interfaces:**
- Consumes:
  - `readVariantPracticeProductRecommendations(): Promise<ProductVariantPractice | null>`
  - `ProductVariantPractice`
- Produces:
  - `MathTraceWorkbench({ initialVariantPractice?: ProductVariantPractice | null })`
  - `PracticeLab({ diagnosis, variantPractice })`

- [ ] **Step 1: Add product labels**

Modify `src/components/workbench/workbench-labels.ts`:

```ts
import type { ProductVariantPracticeType } from "@/lib/rag/variant-practice-product-view-model";
```

Add:

```ts
export const variantPracticeTypeLabels: Record<ProductVariantPracticeType, string> = {
  foundation: "巩固题",
  near_transfer: "近迁移题",
  mixed_application: "综合应用题",
  additional_practice: "补充练习题",
};
```

- [ ] **Step 2: Write UI regression assertions before implementation**

Modify `scripts/tests/ui/mathtrace-workbench-ui.test.mjs` by adding assertions after the existing Supabase/client-boundary checks:

```js
assert.match(
  source,
  /initialVariantPractice\?: ProductVariantPractice \| null/,
  "MathTraceWorkbench 应接收服务端传入的变式练习推荐 view model。",
);

assert.match(
  workbenchStructureSources["practice-lab.tsx"],
  /variantPractice\?: ProductVariantPractice \| null/,
  "PracticeLab 应能消费正式产品裁剪后的变式练习 view model。",
);

for (const forbidden of [
  "matched_dimensions",
  "knowledge_point",
  "target_skill",
  "method_tag",
  "query_term",
  "source_candidate_id",
]) {
  assert.equal(
    workbenchStructureSources["practice-lab.tsx"].includes(forbidden),
    false,
    `正式变式练习 UI 不应展示内部 RAG 字段: ${forbidden}`,
  );
}
```

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
```

Expected: FAIL because the props and rendering are not wired yet.

- [ ] **Step 3: Load recommendations in the server page**

Modify `src/app/page.tsx`:

```tsx
import type { ReactElement } from "react";
import { MathTraceWorkbench } from "@/components/mathtrace-workbench";
import { readVariantPracticeProductRecommendations } from "@/lib/rag/variant-practice-product-loader";

export default async function Home(): Promise<ReactElement> {
  const initialVariantPractice = await readVariantPracticeProductRecommendations();
  return <MathTraceWorkbench initialVariantPractice={initialVariantPractice} />;
}
```

- [ ] **Step 4: Thread the prop through the client workbench**

Modify imports in `src/components/mathtrace-workbench.tsx`:

```ts
import type { ProductVariantPractice } from "@/lib/rag/variant-practice-product-view-model";
```

Change the component signature:

```tsx
export function MathTraceWorkbench({
  initialVariantPractice = null,
}: {
  initialVariantPractice?: ProductVariantPractice | null;
}): ReactElement {
```

Before rendering `PracticeLab`, compute:

```ts
const visibleVariantPractice =
  diagnosisMode === "sample" && diagnosisView.id === DEFAULT_SAMPLE_ID
    ? initialVariantPractice
    : null;
```

Change the `PracticeLab` call:

```tsx
<PracticeLab diagnosis={diagnosisView} variantPractice={visibleVariantPractice} />
```

- [ ] **Step 5: Render product recommendations in PracticeLab**

Modify imports in `src/components/workbench/practice-lab.tsx`:

```ts
import type {
  ProductVariantPractice,
  ProductVariantPracticeItem,
} from "@/lib/rag/variant-practice-product-view-model";
import { variantPracticeTypeLabels } from "@/components/workbench/workbench-labels";
```

Change props:

```tsx
export function PracticeLab({
  diagnosis,
  variantPractice = null,
}: {
  diagnosis: DiagnosisViewModel;
  variantPractice?: ProductVariantPractice | null;
}): ReactElement {
```

Create display items inside the component:

```tsx
  const displayItems = variantPractice
    ? variantPractice.items.map(createRagPracticeDisplayItem)
    : diagnosis.practice_questions.map((practice, index) => ({
        key: `${practice.level}-${practice.question}`,
        index,
        title: practiceLevelLabels[practice.level],
        question: practice.question,
        trainingGoal: practice.training_goal,
        tone: practice.level === "gaokao_style" ? "rust" : "green",
      }));
```

Change the description:

```tsx
description={
  variantPractice
    ? "根据当前错因从本地教辅题库中推荐练习题；正式展示隐藏内部标签和检索分数。"
    : "P0 使用预写题目；后续可在这里上传作答，继续分析新的答题情况。"
}
```

Render cards from `displayItems`:

```tsx
{displayItems.map((practice) => (
  <article
    key={practice.key}
    className="flex min-h-[260px] flex-col rounded-[20px] border border-[var(--oat)] bg-white p-5"
  >
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
          {String(practice.index + 1).padStart(2, "0")}
        </p>
        <h3 className="mt-2 text-xl font-semibold">{practice.title}</h3>
      </div>
      <Tag tone={practice.tone}>不做真实批改</Tag>
    </div>
    <p className="mt-5 text-sm leading-7 text-[var(--charcoal)]">
      <MathText text={practice.question} />
    </p>
    <p className="mt-4 text-sm leading-6 text-[var(--warm-gray)]">
      {practice.trainingGoal}
    </p>
    <button
      type="button"
      disabled
      className="mt-auto min-h-10 rounded-full border border-dashed border-[var(--light-gray)] bg-[var(--oat)] px-4 text-sm font-medium text-[var(--warm-gray)] disabled:cursor-not-allowed"
    >
      上传作答继续诊断 · P1
    </button>
  </article>
))}
```

Render the notice under the grid:

```tsx
{variantPractice?.notice ? (
  <p className="border-t border-[var(--oat)] px-5 pb-5 text-sm leading-6 text-[var(--warm-gray)] sm:px-6">
    {variantPractice.notice}
  </p>
) : null}
```

Add helper at bottom of `practice-lab.tsx`:

```tsx
function createRagPracticeDisplayItem(
  item: ProductVariantPracticeItem,
  index: number,
): {
  key: string;
  index: number;
  title: string;
  question: string;
  trainingGoal: string;
  tone: "green" | "rust";
} {
  return {
    key: `${item.type}-${item.rank}-${item.question_text}`,
    index,
    title: variantPracticeTypeLabels[item.type],
    question: item.question_text,
    trainingGoal: item.reason,
    tone: item.type === "mixed_application" || item.type === "additional_practice" ? "rust" : "green",
  };
}
```

- [ ] **Step 6: Run UI and build checks**

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
node scripts/run-tests.mjs default
npm run build
```

Expected:

```text
mathtrace workbench UI regression test passed
...
demo state regression test passed
✓ Compiled successfully
```

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx \
  src/components/mathtrace-workbench.tsx \
  src/components/workbench/practice-lab.tsx \
  src/components/workbench/workbench-labels.ts \
  scripts/tests/ui/mathtrace-workbench-ui.test.mjs
git commit -m "feat: show variant practice recommendations in workbench"
```

---

## Task 4: Local Demo Verification And Narrative Closeout

**Files:**
- Modify: `interview/mathtrace-project-narrative.md`

**Interfaces:**
- Consumes: visible product behavior from Task 3.
- Produces: documented P2.5 narrative and final verification evidence.

- [ ] **Step 1: Regenerate the local recommendations and static inspect page**

Run:

```bash
node scripts/rag/recommend-variant-practice.mjs \
  --corpus artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json \
  --query artifacts/rag/variant-practice-agent/demo-query.json \
  --out artifacts/rag/variant-practice-agent \
  --limit 12

node scripts/rag/build-variant-practice-agent-ui.mjs \
  --input artifacts/rag/variant-practice-agent/recommendations.json \
  --out artifacts/rag/variant-practice-agent
```

Expected:

```text
Recommendations: 3
Warnings: 1
Wrote /Users/kk/learning-assistant/artifacts/rag/variant-practice-agent/index.html
```

- [ ] **Step 2: Inspect the product view model summary without leaking题干 in stdout**

Run:

```bash
node --input-type=module -e "import { createJiti } from 'jiti'; const jiti = createJiti(process.cwd() + '/'); const { readVariantPracticeProductRecommendations } = jiti('./src/lib/rag/variant-practice-product-loader.ts'); const vm = await readVariantPracticeProductRecommendations(); console.log(JSON.stringify({count: vm?.items.length ?? 0, titles: vm?.items.map((item) => item.title) ?? [], hasNotice: Boolean(vm?.notice), leakedDebugKeys: JSON.stringify(vm ?? {}).includes('matched_dimensions') || JSON.stringify(vm ?? {}).includes('score') || JSON.stringify(vm ?? {}).includes('knowledge_point')}, null, 2));"
```

Expected:

```json
{
  "count": 3,
  "titles": ["巩固题", "近迁移题", "补充练习题"],
  "hasNotice": true,
  "leakedDebugKeys": false
}
```

- [ ] **Step 3: Update interview narrative**

Add a short paragraph near the P2.3/P2.4 RAG section in `interview/mathtrace-project-narrative.md`:

```md
P2.5 把本地 Variant Practice Agent（变式练习推荐 Agent）的结果接入产品工作台，但只接入经过裁剪的 product view model（产品展示模型）。服务端读取 ignored 的 `recommendations.json`（本地推荐结果文件），再把它转换成只包含题型、题干、推荐理由和自然语言提示的前端数据。正式页面不展示 `score`（检索分数）、`matched_dimensions`（命中维度）、`target_skill`（目标能力标签）、`method_tag`（方法标签）、`item_id`（内部题目 ID）或 raw warning（原始调试提示），避免把开发调试信息暴露给学生。
```

- [ ] **Step 4: Full verification**

Run:

```bash
node scripts/run-tests.mjs default
npm run lint
npm run build
git diff --check
```

Expected:

```text
variant practice product view model tests passed
variant practice product loader tests passed
mathtrace workbench UI regression test passed
✓ Compiled successfully
```

- [ ] **Step 5: Check Git boundaries**

Run:

```bash
git status --short
git diff --stat
git ls-files artifacts docs/reviews .env .env.local
```

Expected:

- `git status --short` shows only tracked code/test/docs files for this task.
- `git ls-files artifacts docs/reviews .env .env.local` prints nothing.
- No generated `artifacts/rag/**` file is staged.

- [ ] **Step 6: Commit narrative closeout**

```bash
git add interview/mathtrace-project-narrative.md
git commit -m "docs: describe variant practice product integration"
```

---

## Final Verification Checklist

Run before asking for Claude Code review:

```bash
node scripts/run-tests.mjs default
npm run lint
npm run build
git diff --check
```

Manual product checks:

- Open the product workbench and verify the 3 recommendation cards appear in `PracticeLab`.
- Verify the card titles are student-facing: `巩固题`、`近迁移题`、`补充练习题`.
- Verify raw tags do not appear anywhere in the product UI: `knowledge_point`、`target_skill`、`method_tag`、`query_term`.
- Verify raw internals do not appear: `score`、`item_id`、`source_candidate_id`、`demo_fill_used`.
- Verify the human notice appears when `demo_fill_used` exists.
- Temporarily rename `artifacts/rag/variant-practice-agent/recommendations.json` and verify the original prewritten practice cards still render.

---

## Self-Review

- Spec coverage: The plan covers server-side artifact loading, safe view-model mapping, frontend display, missing-artifact fallback, no debug tag display, tests, narrative update, and verification.
- Placeholder scan: The plan contains concrete paths, commands, expected outputs, and code snippets for each task.
- Type consistency: `ProductVariantPractice`, `ProductVariantPracticeItem`, `ProductVariantPracticeType`, `createVariantPracticeProductViewModel()`, and `readVariantPracticeProductRecommendations()` are named consistently across tasks.
- Scope check: The plan does not add live retrieval, API routes, database storage, pgvector, embeddings, or answer submission.
