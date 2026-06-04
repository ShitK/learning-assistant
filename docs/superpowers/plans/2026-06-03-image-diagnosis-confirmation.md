# 图片诊断识别结果编辑确认入口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 图片诊断先返回可编辑的识别草稿，用户确认后才进入确定性诊断、练习/复习生成和画像写入决策。

**Architecture:** 保持 P0 `sample_diagnosis` 路径不变。`POST /api/diagnose` 的 `image_diagnosis` 分支只做服务端图片抽取并返回 `extraction_review` 草稿；新增无状态 `POST /api/confirm` 接收用户确认/编辑后的草稿，复用本地确定性 pipeline 生成完整诊断。模型仍只输出抽取字段，不直接写 `memory_delta`、`student_profile` 或覆盖画像。

**Tech Stack:** Next.js App Router Route Handler, TypeScript, React client component leaf state, existing Node script tests with `jiti`, Tailwind CSS, KaTeX rendering, browser localStorage.

---

## Assumptions And Trade-Offs

- 推荐方案：新增无状态 `/api/confirm`。PRD 已把 `/api/confirm` 放在 P1，当前任务正好进入这个阶段；相比把确认语义塞回 `/api/diagnose`，它更容易解释“抽取”和“确认后诊断”的边界。
- 不采用“前端只拦截 localStorage 写入”的更简单方案。它代码最少，但诊断已经基于未确认文本完成，用户编辑题干/步骤后不会重新计算知识点、错因和 `memory_delta`，不满足“确认后进入后续诊断”。
- 不允许用户手动提高 `extraction_confidence`。题干、学生答案、步骤和标准解法草稿可编辑；置信度作为模型/解析层安全信号只展示。低置信度即使被用户确认，也只能生成报告，不写长期画像。
- 不引入数据库、登录、老师端、支付、LangGraph、OpenAI Agents SDK 或 Vercel AI SDK。
- 本计划只描述实现；当前阶段不实现代码。实施前如需调整“置信度是否可编辑”，先向用户确认。

## File Structure

- Modify: `src/lib/diagnose-api.ts`
  - 增加 `DiagnoseImageExtractionResponse`、`ImageExtractionReviewDraft`、`ConfirmImageDiagnosisPayload` 类型和 response guard。
  - 保持 sample success/error response 兼容。
- Modify: `src/lib/diagnose-service.ts`
  - `image_diagnosis` 成功抽取后返回 review draft，不再直接调用 full pipeline。
  - 抽取失败、provider_debug 和图片输入错误保持原错误通道。
- Modify: `src/lib/image-diagnosis-pipeline.ts`
  - 让 pipeline 显式接收 `is_extraction_confirmed`，只有 `confirmed && confidence !== "low"` 才允许 `memory_delta.should_persist=true`。
  - 新增从 confirmed draft 进入 pipeline 的输入类型，避免依赖图片 base64。
- Create: `src/lib/image-confirmation.ts`
  - 校验/规范化用户确认后的草稿，限制字段、长度、步骤数量和置信度。
  - 提供 textarea 步骤拆分/合并 helper，供前端和测试复用。
- Create: `src/app/api/confirm/route.ts`
  - 无状态 Route Handler；解析 JSON，调用 confirmation service，返回 `DiagnoseImageSuccessResponse` 或稳定错误。
- Create: `src/lib/confirm-service.ts`
  - 解析确认请求，调用 `runImageMathTraceAgent`。
- Modify: `src/lib/diagnose-client.ts`
  - 增加 `requestImageExtractionReview`、`requestConfirmedImageDiagnosis`、response guard 使用。
  - `shouldPersistDiagnoseProfile` 继续作为最终 localStorage 写入 gate。
- Modify: `src/lib/diagnosis-view-model.ts`
  - 保持 full diagnosis view model；新增 extraction review view model/helper 如 UI 需要。
- Modify: `src/components/mathtrace-workbench.tsx`
  - 图片路径增加 `reviewing_extraction` 状态：上传 -> 抽取 -> 编辑/确认 -> 诊断结果。
  - 确认前不更新 `diagnosisView` 为新报告，不写 localStorage。
- Modify: `src/components/image-upload-panel.tsx`
  - 仅在必要时调整按钮文案/disabled，上传能力不重写。
- Modify: `package.json`
  - 把新增测试脚本加入 `npm test`。
- Create: `scripts/image-confirmation.test.mjs`
  - 覆盖确认草稿校验、低置信度不持久化、未确认不持久化、confirm service。
- Modify: `scripts/image-diagnosis-pipeline.test.mjs`
  - 更新 pipeline 需要确认 gate 的断言。
- Modify: `scripts/diagnose-client.test.mjs`
  - 覆盖 extraction review 和 confirm client payload。
- Modify: `scripts/diagnosis-view-model.test.mjs`
  - 覆盖图片报告仍从 confirmed diagnosis response 构建。
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - 把“本阶段仍不包含识别结果编辑、`/api/confirm`”改为当前 P1 已包含。
  - 更新 image flow、API 契约、低置信度确认语义和 localStorage gate。
- Modify: `docs/TECHNICAL_ROADMAP.md`
  - 更新当前状态和 Phase 2 交付/验收。
- Modify: `interview/mathtrace-project-narrative.md`
  - 新增阶段：图片识别结果确认边界，说明信任边界和性能/稳定性收益。

## Task 1: RED - API Contract For Extraction Review And Confirm

**Files:**
- Modify: `scripts/diagnose-client.test.mjs`
- Modify: `src/lib/diagnose-api.ts`
- Modify: `src/lib/diagnose-client.ts`

- [ ] **Step 1: Write failing response guard tests**

Add assertions like:

```js
const extractionReviewResponse = {
  diagnosis_id: "diag_image_draft_1",
  student_id: "demo_student_001",
  source: "image",
  stage: "extraction_review",
  recognized_question: {
    id: "image_draft_1",
    title: "图片识别错题",
    module: "导数",
    question_text: "求函数单调区间。",
    student_answer: "遗漏参数讨论。",
    student_solution_steps: ["求导", "直接判断"],
    standard_solution_draft: "先求导，再分类讨论。",
    extraction_confidence: "medium",
  },
  requires_confirmation: true,
  can_persist_after_confirmation: true,
  sample_diagnosis: null,
  fallback_used: false,
  warnings: [],
};

assert.equal(isDiagnoseImageExtractionResponse(extractionReviewResponse), true);
assert.equal(shouldPersistDiagnoseProfile(extractionReviewResponse), false);
```

Add an invalid case where `stage` is missing or `standard_solution_draft` is not a string and assert the guard returns `false`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node scripts/diagnose-client.test.mjs`

Expected: FAIL with `isDiagnoseImageExtractionResponse is not defined` or equivalent missing export.

- [ ] **Step 3: Add minimal types and guards**

In `src/lib/diagnose-api.ts`, add:

```ts
export interface ImageExtractionReviewDraft {
  id: string;
  title: string;
  module: string;
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  standard_solution_draft: string;
  extraction_confidence: "high" | "medium" | "low";
}

export interface DiagnoseImageExtractionResponse {
  diagnosis_id: string;
  student_id: string;
  source: "image";
  stage: "extraction_review";
  recognized_question: ImageExtractionReviewDraft;
  requires_confirmation: true;
  can_persist_after_confirmation: boolean;
  sample_diagnosis: null;
  fallback_used: false;
  warnings: string[];
}
```

Extend `DiagnoseApiResponse` with `DiagnoseImageExtractionResponse`. Add `isDiagnoseImageExtractionResponse(value: unknown)` using the same `isRecord`, string-array and confidence checks already used by `isDiagnoseImageSuccessResponse`.

In `src/lib/diagnose-client.ts`, update `shouldPersistDiagnoseProfile` input union to include `DiagnoseImageExtractionResponse` and return `false` when `response.stage === "extraction_review"`.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `node scripts/diagnose-client.test.mjs`

Expected: PASS.

## Task 2: RED - Diagnose Image Branch Returns Review Draft Only

**Files:**
- Create: `scripts/image-confirmation.test.mjs`
- Modify: `src/lib/diagnose-service.ts`
- Modify: `src/lib/image-diagnosis-pipeline.ts`

- [ ] **Step 1: Write failing service test**

Create `scripts/image-confirmation.test.mjs` with:

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { handleDiagnoseRequest } = jiti("../src/lib/diagnose-service.ts");
const { demoStudentProfile } = jiti("../src/data/mathtrace-demo.ts");

const provider = {
  async extractQuestionFromImage() {
    return {
      ok: true,
      value: {
        question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
        student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
        student_solution_steps: ["求导", "只写一个临界点"],
        standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
        extraction_confidence: "high",
        warnings: [],
      },
    };
  },
};

const result = await handleDiagnoseRequest(
  {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "iVBORw0KGgo=",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  { vision_provider: provider },
);

assert.equal(result.status, 200);
assert.equal(result.body.stage, "extraction_review");
assert.equal(result.body.requires_confirmation, true);
assert.equal(result.body.can_persist_after_confirmation, true);
assert.equal(result.body.sample_diagnosis, null);
assert.equal("memory_delta" in result.body, false);
assert.equal("student_profile" in result.body, false);
```

- [ ] **Step 2: Add script to `package.json` test command**

Add `node scripts/image-confirmation.test.mjs` immediately after `scripts/image-diagnosis-pipeline.test.mjs` so confirmation regressions run before client/view tests.

- [ ] **Step 3: Run new test and verify RED**

Run: `node scripts/image-confirmation.test.mjs`

Expected: FAIL because current `image_diagnosis` returns full diagnosis with `memory_delta`.

- [ ] **Step 4: Implement minimal extraction response builder**

In `src/lib/diagnose-service.ts`, after provider extraction succeeds, return a `DiagnoseImageExtractionResponse` instead of `runImageMathTraceAgent(...)`.

Use a small helper:

```ts
function buildImageExtractionResponse(input: {
  student_id: string;
  extraction: VisionExtractionDraft;
}): DiagnoseImageExtractionResponse {
  const id = `image_draft_${hashExtractionDraft(input.extraction)}`;

  return {
    diagnosis_id: `diag_${id}`,
    student_id: input.student_id,
    source: "image",
    stage: "extraction_review",
    recognized_question: {
      id,
      title: "图片识别错题",
      module: "待确认",
      question_text: input.extraction.question_text,
      student_answer: input.extraction.student_answer,
      student_solution_steps: input.extraction.student_solution_steps,
      standard_solution_draft: input.extraction.standard_solution_draft,
      extraction_confidence: input.extraction.extraction_confidence,
    },
    requires_confirmation: true,
    can_persist_after_confirmation:
      input.extraction.extraction_confidence !== "low",
    sample_diagnosis: null,
    fallback_used: false,
    warnings: input.extraction.warnings,
  };
}
```

Keep `hashExtractionDraft` local and deterministic; do not log or expose image base64.

- [ ] **Step 5: Run focused test and existing image pipeline test**

Run: `node scripts/image-confirmation.test.mjs`

Expected: PASS.

Run: `node scripts/image-diagnosis-pipeline.test.mjs`

Expected: still PASS until Task 3 changes the pipeline signature.

## Task 3: RED - Confirmed Pipeline Gate Controls Persistence

**Files:**
- Modify: `scripts/image-diagnosis-pipeline.test.mjs`
- Modify: `src/lib/image-diagnosis-pipeline.ts`

- [ ] **Step 1: Write failing persistence gate assertions**

Update the existing `runImageMathTraceAgent` calls to pass `is_extraction_confirmed: true`. Add:

```js
const unconfirmedResponse = runImageMathTraceAgent({
  request,
  extraction,
  is_extraction_confirmed: false,
});

assert.equal(unconfirmedResponse.memory_delta.should_persist, false);
assert.equal(
  unconfirmedResponse.student_profile.frequent_mistake_causes
    .classification_missing,
  4,
);
```

Also assert low confidence remains false even when confirmed.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node scripts/image-diagnosis-pipeline.test.mjs`

Expected: FAIL because `is_extraction_confirmed` is ignored or not accepted.

- [ ] **Step 3: Add confirmation flag to pipeline input**

Change the exported function input:

```ts
export function runImageMathTraceAgent(input: {
  request: ImageDiagnosisPipelineRequest;
  extraction: VisionExtractionDraft;
  is_extraction_confirmed: boolean;
}): DiagnoseImageSuccessResponse
```

Use `is_extraction_confirmed` inside `computeImageMemoryDelta`:

```ts
const shouldPersist =
  input.is_extraction_confirmed &&
  input.extraction.extraction_confidence !== "low";
```

Set the rationale to distinguish unconfirmed vs low confidence:

```ts
shouldPersist
  ? "用户已确认图片识别结果，且抽取置信度不是 low；由本地规则计算画像增量。"
  : input.extraction.extraction_confidence === "low"
    ? "图片抽取置信度低，本次只展示诊断建议，不写入长期画像。"
    : "图片识别结果尚未确认，本次不写入长期画像。"
```

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `node scripts/image-diagnosis-pipeline.test.mjs`

Expected: PASS.

## Task 4: RED - Confirm Request Validation And Stateless `/api/confirm`

**Files:**
- Create: `src/lib/image-confirmation.ts`
- Create: `src/lib/confirm-service.ts`
- Create: `src/app/api/confirm/route.ts`
- Modify: `scripts/image-confirmation.test.mjs`

- [ ] **Step 1: Add failing confirm service tests**

Extend `scripts/image-confirmation.test.mjs`:

```js
const { handleConfirmRequest } = jiti("../src/lib/confirm-service.ts");

const confirmResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmed_extraction: {
    question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    student_answer: "只令 $f'(x)=0$ 得 $x=\\sqrt a$。",
    student_solution_steps: ["求导", "只写一个临界点"],
    standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
    extraction_confidence: "high",
    warnings: ["用户已检查识别结果。"],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(confirmResult.status, 200);
assert.equal(confirmResult.body.source, "image");
assert.equal(confirmResult.body.memory_delta.should_persist, true);

const invalidConfirmResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmed_extraction: {
    question_text: "",
    student_answer: "学生答案",
    student_solution_steps: ["第一步"],
    standard_solution_draft: "标准解法",
    extraction_confidence: "high",
    warnings: [],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(invalidConfirmResult.status, 400);
assert.equal(invalidConfirmResult.body.error.code, "invalid_request");
```

- [ ] **Step 2: Run test and verify RED**

Run: `node scripts/image-confirmation.test.mjs`

Expected: FAIL because `confirm-service.ts` does not exist.

- [ ] **Step 3: Implement draft validation helper**

Create `src/lib/image-confirmation.ts` with:

```ts
import { isRecord } from "@/lib/utils";
import type { VisionExtractionDraft } from "@/lib/vision-extraction-parser";

export function parseConfirmedExtractionDraft(
  value: unknown,
): { ok: true; value: VisionExtractionDraft } | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "confirmed_extraction 必须是对象。" };
  }

  if (!isNonEmptyString(value.question_text)) {
    return { ok: false, message: "题干不能为空。" };
  }

  if (!isNonEmptyString(value.student_answer)) {
    return { ok: false, message: "学生答案不能为空。" };
  }

  if (!isNonEmptyString(value.standard_solution_draft)) {
    return { ok: false, message: "标准解法草稿不能为空。" };
  }

  if (!isExtractionConfidence(value.extraction_confidence)) {
    return { ok: false, message: "识别置信度不合法。" };
  }

  const steps = parseEditableLines(value.student_solution_steps, 8);
  if (!steps.ok || steps.value.length === 0) {
    return { ok: false, message: "学生解题步骤至少需要 1 条。" };
  }

  const warnings = parseEditableLines(value.warnings, 5);
  if (!warnings.ok) {
    return { ok: false, message: "warnings 必须是字符串数组。" };
  }

  return {
    ok: true,
    value: {
      question_text: value.question_text.trim(),
      student_answer: value.student_answer.trim(),
      student_solution_steps: steps.value,
      standard_solution_draft: value.standard_solution_draft.trim(),
      extraction_confidence: value.extraction_confidence,
      warnings: warnings.value,
    },
  };
}
```

Also export `splitEditableStepsText(text: string): string[]` and `joinEditableStepsText(steps: string[]): string` for the UI.

- [ ] **Step 4: Implement confirm service and route**

Create `src/lib/confirm-service.ts`:

```ts
export async function handleConfirmRequest(
  payload: unknown,
): Promise<DiagnoseServiceResult> {
  const parsed = parseConfirmImageDiagnosisRequest(payload);
  if (!parsed.ok) {
    return {
      status: 400,
      body: createDiagnoseError("invalid_request", parsed.message, true),
    };
  }

  return {
    status: 200,
    body: runImageMathTraceAgent({
      request: parsed.value.request,
      extraction: parsed.value.extraction,
      is_extraction_confirmed: true,
    }),
  };
}
```

Create `src/app/api/confirm/route.ts` mirroring `src/app/api/diagnose/route.ts`: parse JSON, return `invalid_json` on parse failure, call `handleConfirmRequest`, and return `NextResponse.json(result.body, { status: result.status })`.

- [ ] **Step 5: Run focused tests**

Run: `node scripts/image-confirmation.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: PASS.

## Task 5: RED - Client Helpers For Review And Confirm

**Files:**
- Modify: `scripts/diagnose-client.test.mjs`
- Modify: `src/lib/diagnose-client.ts`

- [ ] **Step 1: Write failing client tests**

Add tests for:

```js
const confirmPayload = buildConfirmedImageDiagnosePayload({
  confirmed_extraction: extractionReviewResponse.recognized_question,
  student_profile: demoStudentProfile,
  mistake_history: mistakeHistory,
});

assert.equal(confirmPayload.task_type, "confirmed_image_diagnosis");
assert.equal(confirmPayload.student_id, "demo_student_001");
assert.equal(confirmPayload.confirmed_extraction.standard_solution_draft, "先求导，再分类讨论。");
```

Add a fetcher test where `requestImageExtractionReview` returns the extraction review response and `requestConfirmedImageDiagnosis` returns full image diagnosis response.

- [ ] **Step 2: Run focused test and verify RED**

Run: `node scripts/diagnose-client.test.mjs`

Expected: FAIL because new helpers are missing.

- [ ] **Step 3: Implement minimal client helpers**

In `src/lib/diagnose-client.ts`:

```ts
export async function requestImageExtractionReview(input: {
  fetcher: typeof fetch;
  image_base64: string;
  image_mime_type: ImageDiagnosePayload["image_mime_type"];
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}): Promise<DiagnoseImageExtractionResponse>
```

It posts to `/api/diagnose` and validates with `isDiagnoseImageExtractionResponse`.

Add:

```ts
export async function requestConfirmedImageDiagnosis(input: {
  fetcher: typeof fetch;
  confirmed_extraction: VisionExtractionDraft;
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}): Promise<DiagnoseImageSuccessResponse>
```

It posts to `/api/confirm` and validates with `isDiagnoseImageSuccessResponse`.

- [ ] **Step 4: Run focused test and verify GREEN**

Run: `node scripts/diagnose-client.test.mjs`

Expected: PASS.

## Task 6: RED - Workbench State Prevents Unconfirmed Persistence

**Files:**
- Modify: `src/components/mathtrace-workbench.tsx`
- Modify: `src/lib/diagnosis-view-model.ts`
- Modify: `scripts/diagnosis-view-model.test.mjs`

- [ ] **Step 1: Add helper tests for editable draft state**

Add a small pure helper in `src/lib/diagnosis-view-model.ts` or `src/lib/image-confirmation.ts` and test:

```js
const draft = createEditableExtractionDraft(extractionReviewResponse);
assert.equal(draft.question_text, "求函数单调区间。");
assert.equal(draft.steps_text, "求导\n直接判断");
assert.equal(draft.can_persist_after_confirmation, true);

const lowDraft = createEditableExtractionDraft({
  ...extractionReviewResponse,
  recognized_question: {
    ...extractionReviewResponse.recognized_question,
    extraction_confidence: "low",
  },
  can_persist_after_confirmation: false,
});
assert.equal(lowDraft.can_persist_after_confirmation, false);
```

- [ ] **Step 2: Run view model test and verify RED**

Run: `node scripts/diagnosis-view-model.test.mjs`

Expected: FAIL because helper is missing.

- [ ] **Step 3: Implement helper**

Keep this helper pure and independent of React:

```ts
export interface EditableExtractionDraft {
  question_text: string;
  student_answer: string;
  steps_text: string;
  standard_solution_draft: string;
  extraction_confidence: "high" | "medium" | "low";
  warnings: string[];
  can_persist_after_confirmation: boolean;
}
```

Build it from `DiagnoseImageExtractionResponse`.

- [ ] **Step 4: Update `MathTraceWorkbench` image flow**

Change the image branch in `requestDiagnosis()`:

1. Call `requestImageExtractionReview`.
2. Store `editableExtractionDraft`.
3. Set UI state to review mode and stop timeline/request pending.
4. Do not call `setDiagnosisView(nextView)`.
5. Do not call `writeStoredStudentProfile`.

Add a new `handleConfirmExtraction()`:

1. Validate current editable draft with `parseConfirmedExtractionDraft`.
2. Call `requestConfirmedImageDiagnosis`.
3. Build `createImageDiagnosisViewModel(diagnosis)`.
4. Write localStorage only through `shouldPersistDiagnoseProfile(diagnosis)`.

Keep sample path unchanged.

- [ ] **Step 5: Run focused tests and type/lint**

Run: `node scripts/diagnosis-view-model.test.mjs`

Expected: PASS.

Run: `npm test`

Expected: PASS.

## Task 7: UI For Editing Recognized Fields

**Files:**
- Modify: `src/components/mathtrace-workbench.tsx`
- Optional Modify: `src/components/image-upload-panel.tsx`

- [ ] **Step 1: Add review panel below upload panel**

In `MistakeInputCard`, when `mode === "image"` and `editableExtractionDraft !== null`, render:

- `textarea` for `question_text`
- `textarea` for `student_answer`
- `textarea` for `steps_text`
- `textarea` for `standard_solution_draft`
- read-only confidence tag
- warnings list
- confirm button

Use existing visual language: `rounded-[16px]`, `bg-[var(--oat)]`, compact labels, no new component library.

- [ ] **Step 2: Disable unsafe actions while confirming**

Use existing `isDiagnosing` lock for both extraction and confirmation. Confirm button disabled when:

- request pending
- required text fields are empty after trim
- steps textarea has no non-empty line

- [ ] **Step 3: Preserve low confidence warning**

If confidence is `low`, render copy equivalent to:

```text
模型置信度为 low。你仍可确认生成报告，但本次不会写入长期画像。
```

Do not offer UI to raise confidence.

- [ ] **Step 4: Manual browser check before final verification**

After implementation starts later, run the dev server and verify:

- sample mode initial screen still shows sample diagnosis.
- image mode upload area still fits desktop and mobile.
- extraction review form shows all fields without overlap.
- low confidence warning is visible.
- confirmed report replaces the review state only after confirm.

## Task 8: Documentation Updates

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `interview/mathtrace-project-narrative.md`

- [ ] **Step 1: Update PRD**

Change the old P1 sentence that says this stage does not include editing/confirm. Replace with:

```md
P1 本阶段新增图片识别结果编辑与确认入口：`image_diagnosis` 先返回可编辑识别草稿，用户确认后再通过 `/api/confirm` 进入确定性诊断和画像写入决策。低置信度或未确认的图片识别结果不得写入 localStorage 学生画像。
```

Update API section to describe:

- `/api/diagnose` image returns `stage="extraction_review"`
- `/api/confirm` is stateless and returns full `DiagnoseImageSuccessResponse`
- low confidence confirmed results can generate report but `memory_delta.should_persist=false`

- [ ] **Step 2: Update TECHNICAL_ROADMAP**

Move “图片识别结果编辑和确认写入” from “当前还没有完成” to current Phase 2 in-progress/delivered wording after implementation.

Add acceptance:

```md
- 图片抽取草稿必须由用户确认后才进入后续诊断。
- 未确认草稿和 low confidence 草稿不得写入 localStorage。
```

- [ ] **Step 3: Update interview narrative**

Add a new stage with:

- 功能价值：防止一次图片识别错误污染长期画像。
- 关键设计：抽取和诊断拆成 `/api/diagnose` + `/api/confirm`。
- 技术取舍：不引入数据库和 Agent 框架；确认仍是无状态。
- 性能收益：未确认时不跑后续 pipeline 和 localStorage 写入，减少错误状态传播；确认后仍复用确定性 pipeline。
- 真实证据：source files, scripts, browser verification commands.

## Task 9: Full Verification And Claude Code Review Prompt

**Files:**
- No production files unless review finds issues.

- [ ] **Step 1: Run automated checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 2: Browser visual verification**

Run dev server:

```bash
npm run dev
```

Open local app in the in-app browser. Verify desktop and mobile:

- sample path still completes and writes localStorage.
- image path shows upload/preview.
- image extraction review form appears before any full report update.
- confirm generates full report.
- low confidence confirmed report does not write localStorage and shows warning.
- no text overlap in upload, review, report and profile sections.

- [ ] **Step 3: Prepare Claude Code review prompt**

Do not push PR. Give the user this prompt:

```md
请按 CLAUDE.md 对当前分支 `codex/image-diagnosis-confirmation` 做代码审查。

审查范围：从 `main` 到当前 HEAD 的 diff。

重点检查：
- `sample_diagnosis` P0 稳定路径是否被破坏。
- `image_diagnosis` 是否只返回可编辑识别草稿，未确认时是否不会进入画像写入。
- `/api/confirm` 是否无状态、只接收确认后的识别草稿，并复用确定性 pipeline。
- 低置信度或未确认结果是否在后端 guard、client helper、前端 localStorage 写入处都有保护。
- 模型输出是否仍被限制在抽取字段，不得直接写 `memory_delta`、`student_profile` 或 `mistake_history`。
- API Key 是否只在服务端读取，错误响应和调试信息是否不泄露图片 base64、题干全文、学生答案全文或密钥。
- 前端编辑表单在桌面/移动端是否有文本溢出、按钮状态错误、重复点击或旧报告误导问题。
- 测试是否覆盖：extraction review response、confirm request validation、confirmed high/medium persistence、confirmed low non-persistence、unconfirmed non-persistence、sample regression、client guard、localStorage gate。

请把审查意见写入 `docs/reviews/2026-06-03-image-diagnosis-confirmation-review.md`，不要修改代码，不要 stage 或 commit review 文档。
```

## Self-Review

- Spec coverage: 覆盖了编辑识别结果、确认入口、低置信度/未确认不写画像、sample 路径稳定、不引入数据库/登录/老师端/支付/Agent SDK/API key 泄露、模型不写画像字段、文档更新和浏览器验证。
- Placeholder scan: 本计划没有未决占位；每个任务都有明确文件、测试、命令和期望结果。
- Type consistency: 统一使用 `ImageExtractionReviewDraft`、`DiagnoseImageExtractionResponse`、`VisionExtractionDraft` 和现有 `DiagnoseImageSuccessResponse`；`stage="extraction_review"` 只属于抽取预览响应，完整诊断仍使用 `source="image"`。
