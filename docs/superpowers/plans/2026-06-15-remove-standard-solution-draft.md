# Remove Standard Solution Draft Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 彻底移除图片视觉抽取和确认链路中的 `standard_solution_draft` 兼容字段，让视觉模型只负责 OCR/结构化抽取，最终 `standard_solution` 只由样例数据或确认后的 text analysis provider / 本地规则生成。

**Architecture:** `src/lib/vision-extraction/` 的输出契约只保留 `question_text`、`student_answer`、`student_solution_steps`、`extraction_confidence`、`warnings`。`diagnosis` / `image-diagnosis` / client view model 不再要求、传递、哈希或展示 `standard_solution_draft`；问题不足时的 follow-up 仍可保留 `standard_solution_summary` 字段，但它只能使用固定提示或分析模型结果，不能来自视觉抽取草稿。

**Tech Stack:** Next.js App Router, TypeScript, Node `.mjs` regression tests, KaTeX-rendered final `standard_solution`.

---

## Scope

### In Scope

- 从 `VisionExtractionDraft`、`VisionExtractionDebugSummary`、视觉 parser、视觉 prompt 和视觉 provider 测试中移除 `standard_solution_draft`。
- 从 `/api/diagnose` 图片识别预览响应的 `recognized_question` 中移除 `standard_solution_draft`。
- 从 `/api/confirm` 入参校验、前端确认 payload、确认 token 指纹和 draft hash 中移除 `standard_solution_draft`。
- 从 evidence / problem-only fallback 中移除对视觉标准解法草稿的依赖。
- 更新测试脚本和 fixture，使图片抽取 JSON 示例不再包含 `standard_solution_draft`。
- 更新 PRD 和面试叙事文档：当前状态应描述为“字段已移除”，不是“过渡期仍保留”。

### Out of Scope

- 不删除样例题数据中的 `standard_solution`。
- 不删除最终诊断结果中的 `mistake_diagnosis.standard_solution`。
- 不新增 `standard_solution_steps` 或新的结构化标准解法字段。
- 不改 DeepSeek / `ANALYSIS_PROVIDER` 的输出 schema，仍要求它生成最终 `standard_solution`。
- 不改 Supabase 表结构、错题本去重/删除、localStorage 画像恢复或学生画像 schema。
- 不整理 `scripts/` 目录结构。
- 不追溯更新历史任务计划中的旧 `standard_solution_draft` 记录；历史计划保留当时语境，只更新当前 PRD、Roadmap 和面试叙事。
- 不提交 `docs/reviews/*.md`、`.env*`、`.next/`、`.DS_Store`。

## Current References To Remove Or Update

Source and scripts currently contain `standard_solution_draft` in these categories:

- Vision contract:
  - `src/lib/vision-extraction/vision-extraction-types.ts`
  - `src/lib/vision-extraction/vision-extraction-parser.ts`
- API / client contract:
  - `src/lib/diagnosis/diagnose-api.ts`
  - `src/lib/diagnosis/diagnose-client.ts`
  - `src/lib/diagnosis/diagnose-service.ts`
  - `src/lib/diagnosis/confirm-service.ts`
  - `src/lib/diagnosis/diagnosis-view-model.ts`
- Image confirmation:
  - `src/lib/image-diagnosis/image-confirmation.ts`
  - `src/lib/image-diagnosis/image-confirmation-token.ts`
  - `src/lib/image-diagnosis/image-diagnosis-pipeline.ts`
- Evidence:
  - `src/lib/shared/diagnosis-evidence.ts`
- Tests and fixtures:
  - `scripts/vision-extraction-parser.test.mjs`
  - `scripts/anthropic-compatible-provider.test.mjs`
  - `scripts/api-smoke.test.mjs`
  - `scripts/demo-smoke.test.mjs`
  - `scripts/diagnose-client.test.mjs`
  - `scripts/diagnosis-evidence.test.mjs`
  - `scripts/diagnosis-persistence.test.mjs`
  - `scripts/diagnosis-view-model.test.mjs`
  - `scripts/image-confirmation.test.mjs`
  - `scripts/image-diagnosis-pipeline.test.mjs`
  - `scripts/agent-pipeline.test.mjs`
  - `scripts/eval-harness.test.mjs`
  - `scripts/fixtures/eval/p15-trusted-diagnosis-cases.mjs`
- Docs:
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `docs/TECHNICAL_ROADMAP.md`
  - `interview/mathtrace-project-narrative.md`

## Success Criteria

- `rg -n "standard_solution_draft" src scripts docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md` returns no matches after implementation and documentation updates.
- `rg -n "标准解法草稿|视觉模型未返回标准解法草稿|标准解法将在确认后由分析模型生成" src scripts` returns no matches except intentional user-facing copy that does not refer to a visual draft.
- Image extraction preview response no longer contains `recognized_question.standard_solution_draft`.
- Confirmed image diagnosis payload no longer sends `confirmed_extraction.standard_solution_draft`.
- Confirmation token fingerprint remains stable for the remaining extraction fields and still detects tampering to question/student answer/steps/confidence.
- Final reports still display `mistake_diagnosis.standard_solution`.
- Sample diagnosis path remains unchanged.
- Verification passes:
  - `npm test`
  - `npm run lint`
  - `npm run build`

---

## Branch Setup

Start from latest `main`:

```bash
git switch main
git pull
git switch -c codex/remove-standard-solution-draft
```

Expected: implementation happens on `codex/remove-standard-solution-draft`, not directly on `main`.

---

### Task 1: Make Vision Extraction Tests Expect No Draft Field

**Files:**
- Modify: `scripts/vision-extraction-parser.test.mjs`
- Modify: `scripts/anthropic-compatible-provider.test.mjs`
- Modify: `scripts/api-smoke.test.mjs`
- Modify: `scripts/demo-smoke.test.mjs`

- [ ] **Step 1: Update valid vision extraction JSON examples**

In `scripts/vision-extraction-parser.test.mjs`, remove `standard_solution_draft` from every model-output JSON object. A valid example should look like:

```js
const validModelText = JSON.stringify({
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "$f'(x)=3x^2-3a$，只得到 $x=\\sqrt a$。",
  student_solution_steps: ["求导正确", "临界点遗漏 $-\\sqrt a$"],
  extraction_confidence: "high",
  warnings: [],
});
```

- [ ] **Step 2: Replace draft-specific parser assertions**

Delete assertions that read `parsed.value.standard_solution_draft` or import `VISION_STANDARD_SOLUTION_PLACEHOLDER`.

Replace the old missing-draft test with an extra-field rejection test:

```js
const forbiddenStandardSolutionDraft = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "学生答案",
    student_solution_steps: ["步骤"],
    standard_solution_draft: "视觉模型不应输出这个字段",
    extraction_confidence: "high",
    warnings: [],
  }),
);
assert.equal(forbiddenStandardSolutionDraft.ok, false);
assert.equal(
  forbiddenStandardSolutionDraft.error.message,
  "模型输出包含未声明字段。",
);
assert.deepEqual(forbiddenStandardSolutionDraft.error.debug_summary.extra_fields, [
  "standard_solution_draft",
]);
```

- [ ] **Step 3: Update debug summary expectations**

Where tests assert `missing_fields` or `present_fields`, remove `standard_solution_draft`.

Expected missing student answer fields should become:

```js
assert.deepEqual(missingStudentAnswer.error.debug_summary.missing_fields, [
  "student_answer",
]);
assert.deepEqual(missingStudentAnswer.error.debug_summary.present_fields, [
  "question_text",
  "student_solution_steps",
  "extraction_confidence",
  "warnings",
]);
```

- [ ] **Step 4: Update prompt assertions**

Keep the existing assertions that the prompt does not ask for `standard_solution_draft`, and add one positive assertion that the prompt explicitly separates responsibilities:

```js
assert.equal(prompt.includes('"standard_solution_draft"'), false);
assert.equal(
  prompt.includes("标准解法会在用户确认后由文本分析模型生成"),
  true,
);
```

- [ ] **Step 5: Update smoke/provider image extraction fixtures**

In `scripts/anthropic-compatible-provider.test.mjs`, `scripts/api-smoke.test.mjs`, and `scripts/demo-smoke.test.mjs`, remove `standard_solution_draft` from fake vision provider JSON and from expected `recognized_question` / `confirmed_extraction` payloads.

In `scripts/demo-smoke.test.mjs`, do not use `problemOnlyExtraction.standard_solution_draft` as the input for `createStandardSolutionDisplayText()` or `createStandardSolutionBlocks()` after removing the field. Add an independent local test string so the standard-solution formatting smoke remains meaningful:

```js
const rawStandardSolutionText =
  "**(1)** 求导得 $f'(x)=\\frac{1}{x}-a$，定义域为 $(0,+\\infty)$。\n- 当 $a\\le 0$ 时恒增。\n由 $f(\\frac{1}{a})= -\\ln a>0$ 得 $0<a<1$，即$\\ln a<0$。";
```

Then call:

```js
const displayText = createStandardSolutionDisplayText(rawStandardSolutionText);
const blocks = createStandardSolutionBlocks(rawStandardSolutionText);
```

If a test currently checks:

```js
assert.equal(
  extractionResponse.recognized_question.standard_solution_draft,
  "..."
);
```

replace it with:

```js
assert.equal(
  "standard_solution_draft" in extractionResponse.recognized_question,
  false,
);
```

- [ ] **Step 6: Run focused tests and verify failure**

Run:

```bash
node scripts/vision-extraction-parser.test.mjs
```

Expected: FAIL before implementation because parser still expects or returns `standard_solution_draft`.

---

### Task 2: Remove Draft From Vision Extraction Contract

**Files:**
- Modify: `src/lib/vision-extraction/vision-extraction-types.ts`
- Modify: `src/lib/vision-extraction/vision-extraction-parser.ts`

- [ ] **Step 1: Remove the field from `VisionExtractionDraft`**

Change `src/lib/vision-extraction/vision-extraction-types.ts` to:

```ts
export type ExtractionConfidence = "high" | "medium" | "low";

export interface VisionExtractionDraft {
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  extraction_confidence: ExtractionConfidence;
  warnings: string[];
}

export interface VisionExtractionDebugSummary {
  output_kind: "json_object" | "json_parse_error" | "non_object";
  raw_output_length: number;
  present_fields: string[];
  missing_fields: string[];
  extra_fields: string[];
  forbidden_fields: string[];
  field_lengths: {
    question_text?: number;
    student_answer?: number;
  };
  list_lengths: {
    student_solution_steps?: number;
    warnings?: number;
  };
}
```

- [ ] **Step 2: Remove the placeholder export and allowed key**

In `src/lib/vision-extraction/vision-extraction-parser.ts`:

Delete:

```ts
export const VISION_STANDARD_SOLUTION_PLACEHOLDER =
  "标准解法将在确认后由分析模型生成。";
```

Remove `"standard_solution_draft"` from `ALLOWED_KEYS`.

- [ ] **Step 3: Remove parser normalization for the draft**

Delete this block:

```ts
const standardSolutionDraft = isNonEmptyString(parsed.standard_solution_draft)
  ? normalizeExtractedMathText(parsed.standard_solution_draft.trim())
  : VISION_STANDARD_SOLUTION_PLACEHOLDER;
if (!isNonEmptyString(parsed.standard_solution_draft)) {
  parserWarnings.push(
    "视觉模型未返回标准解法草稿，确认后将由分析模型生成标准解法。",
  );
}
```

In the returned `value`, remove:

```ts
standard_solution_draft: standardSolutionDraft,
```

- [ ] **Step 4: Remove debug field length for the draft**

In `createDebugSummary()`, change `field_lengths` to only include:

```ts
field_lengths: {
  question_text: getStringLength(value, "question_text"),
  student_answer: getStringLength(value, "student_answer"),
},
```

- [ ] **Step 5: Run focused parser test**

Run:

```bash
node scripts/vision-extraction-parser.test.mjs
```

Expected: PASS.

---

### Task 3: Remove Draft From Image Preview, Confirm Payload, And Token Fingerprint

**Files:**
- Modify: `src/lib/diagnosis/diagnose-api.ts`
- Modify: `src/lib/diagnosis/diagnose-client.ts`
- Modify: `src/lib/diagnosis/diagnose-service.ts`
- Modify: `src/lib/diagnosis/confirm-service.ts`
- Modify: `src/lib/diagnosis/diagnosis-view-model.ts`
- Modify: `src/lib/image-diagnosis/image-confirmation.ts`
- Modify: `src/lib/image-diagnosis/image-confirmation-token.ts`

- [ ] **Step 1: Remove field from image extraction response type**

In `src/lib/diagnosis/diagnose-api.ts`, change `ImageExtractionReviewDraft` to:

```ts
export interface ImageExtractionReviewDraft {
  id: string;
  title: string;
  module: string;
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  extraction_confidence: "high" | "medium" | "low";
}
```

Update `isImageExtractionReviewDraft()` in the same file so it no longer requires `value.standard_solution_draft`.

- [ ] **Step 2: Stop returning draft field from `/api/diagnose` preview**

In `src/lib/diagnosis/diagnose-service.ts`, remove this field from `buildImageExtractionResponse()`:

```ts
standard_solution_draft: input.extraction.standard_solution_draft,
```

In `hashExtractionDraft()`, remove:

```ts
standard_solution_draft: extraction.standard_solution_draft,
```

- [ ] **Step 3: Stop requiring draft field in `/api/confirm` parsers**

In `src/lib/image-diagnosis/image-confirmation.ts`, delete:

```ts
if (!isNonEmptyString(value.standard_solution_draft)) {
  return { ok: false, message: "标准解法草稿不能为空。" };
}
```

and remove this returned property:

```ts
standard_solution_draft: value.standard_solution_draft.trim(),
```

In `src/lib/diagnosis/confirm-service.ts`, make the same changes inside `parseProblemOnlyExtractionDraft()`.

- [ ] **Step 4: Remove draft from editable view model**

In `src/lib/diagnosis/diagnosis-view-model.ts`, remove:

```ts
import { VISION_STANDARD_SOLUTION_PLACEHOLDER } from "@/lib/vision-extraction/vision-extraction-parser";
```

Remove `standard_solution_draft` from `EditableExtractionDraft`.

In `createEditableExtractionDraft()`, remove:

```ts
standard_solution_draft:
  response.recognized_question.standard_solution_draft.trim() ||
  VISION_STANDARD_SOLUTION_PLACEHOLDER,
```

In `createVisionExtractionDraftFromEditableDraft()`, remove:

```ts
standard_solution_draft:
  draft.standard_solution_draft.trim() ||
  VISION_STANDARD_SOLUTION_PLACEHOLDER,
```

- [ ] **Step 5: Remove draft from confirmation fingerprint**

In `src/lib/image-diagnosis/image-confirmation-token.ts`, remove from `canonicalizeExtractionDraft()`:

```ts
standard_solution_draft: extraction.standard_solution_draft,
```

Expected fingerprint input becomes:

```ts
return JSON.stringify({
  question_text: extraction.question_text,
  student_answer: extraction.student_answer,
  student_solution_steps: extraction.student_solution_steps,
  extraction_confidence: extraction.extraction_confidence,
});
```

- [ ] **Step 6: Run TypeScript-adjacent focused tests and verify failures are now test-only**

Run:

```bash
npm test
```

Expected at this point: failures may remain in tests that still construct old payloads. All remaining failures should be related to `standard_solution_draft` removal; if an unrelated failure appears, pause and investigate before continuing. There should be no production TypeScript import error for `VISION_STANDARD_SOLUTION_PLACEHOLDER` after source edits.

---

### Task 4: Remove Draft From Evidence And Analysis Copy

**Files:**
- Modify: `src/lib/shared/diagnosis-evidence.ts`
- Modify: `src/lib/image-diagnosis/image-diagnosis-pipeline.ts`
- Modify: `src/lib/providers/analysis-provider.ts`

- [ ] **Step 1: Stop deriving follow-up summary from draft**

In `src/lib/shared/diagnosis-evidence.ts`, change `createProblemRiskFollowUp()` so `standard_solution_summary` uses a fixed message:

```ts
standard_solution_summary:
  "标准解法将在确认后由文本分析模型或本地规则生成。",
```

Delete the private `summarizeStandardSolution()` function.

- [ ] **Step 2: Remove draft from image-diagnosis text joining**

In `src/lib/image-diagnosis/image-diagnosis-pipeline.ts`, change `joinExtractionText()` to:

```ts
function joinExtractionText(extraction: VisionExtractionDraft): string {
  return [
    extraction.question_text,
    extraction.student_answer,
    extraction.student_solution_steps.join("\n"),
  ].join("\n");
}
```

- [ ] **Step 3: Update analysis provider prompt copy**

In `src/lib/providers/analysis-provider.ts`, replace:

```ts
"你需要独立生成 standard_solution，不要依赖图片识别阶段的标准解法草稿。",
```

with:

```ts
"你需要独立生成 standard_solution；图片识别阶段只提供题干、学生答案和学生步骤。",
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
node scripts/diagnosis-evidence.test.mjs
node scripts/image-diagnosis-pipeline.test.mjs
node scripts/analysis-provider.test.mjs
```

Expected: tests that assert old prompt strings or old summaries fail until Task 5 updates them.

---

### Task 5: Update Remaining Tests And Fixtures

**Files:**
- Modify test files listed in "Current References To Remove Or Update"

- [ ] **Step 1: Remove draft field from every `VisionExtractionDraft` fixture**

For every object that represents a vision extraction draft, remove:

```js
standard_solution_draft: "...",
```

This includes tests in:

```text
scripts/agent-pipeline.test.mjs
scripts/analysis-provider.test.mjs
scripts/diagnosis-evidence.test.mjs
scripts/diagnosis-persistence.test.mjs
scripts/diagnosis-view-model.test.mjs
scripts/image-confirmation.test.mjs
scripts/image-diagnosis-pipeline.test.mjs
scripts/eval-harness.test.mjs
scripts/fixtures/eval/p15-trusted-diagnosis-cases.mjs
```

- [ ] **Step 2: Update confirmation token and fingerprint assertions**

In `scripts/image-confirmation.test.mjs`, after removing `standard_solution_draft` from fixtures, update tests that depend on `createImageConfirmationFingerprint()` or hard-coded token values.

Prefer semantic assertions over fixed token strings:

```js
const verifiedToken = verifyImageConfirmationToken(result.body.confirmation_token);
assert.equal(verifiedToken.ok, true);
assert.equal(verifiedToken.value.extraction_confidence, "medium");
assert.equal(verifiedToken.value.can_persist_after_confirmation, true);
assert.equal(typeof verifiedToken.value.draft_fingerprint, "string");
assert.equal(verifiedToken.value.draft_fingerprint.length > 0, true);
```

Keep tamper tests for the remaining protected fields. A mutation to any of these must still invalidate the token/fingerprint:

```text
question_text
student_answer
student_solution_steps
extraction_confidence
```

Do not add a new assertion that compares the old fingerprint string; the HMAC input intentionally changes when `standard_solution_draft` is removed.

- [ ] **Step 3: Replace old confirm payload expectations**

Where a test asserts `confirmPayload.confirmed_extraction.standard_solution_draft`, replace it with:

```js
assert.equal(
  "standard_solution_draft" in confirmPayload.confirmed_extraction,
  false,
);
```

- [ ] **Step 4: Replace old missing-draft error expectations**

Delete tests whose only purpose is to prove `standard_solution_draft` is required. If the test still needs a negative case, replace it with one of these:

```js
const missingQuestionText = { ...validPayload, question_text: "" };
const missingStudentAnswer = { ...validPayload, student_answer: "" };
const invalidConfidence = { ...validPayload, extraction_confidence: "certain" };
```

- [ ] **Step 5: Update retained-report notice examples**

In `scripts/diagnosis-view-model.test.mjs`, replace retained-report examples that mention the deleted field:

```js
createRetainedReportNotice(sampleView, "模型输出缺少 standard_solution_draft。")
```

with a still-valid current reason:

```js
createRetainedReportNotice(sampleView, "模型输出缺少 student_answer。")
```

Expected full string:

```js
"当前显示的是样例题结果，本次图片诊断未生成新报告。原因：模型输出缺少 student_answer。"
```

- [ ] **Step 6: Update debug text tests**

In `scripts/diagnose-client.test.mjs`, remove `standard_solution_draft` from expected `present_fields`, `missing_fields`, and `field_lengths` debug strings.

Expected debug strings should mention only:

```text
question_text, student_answer, student_solution_steps, extraction_confidence, warnings
```

- [ ] **Step 7: Update analysis provider prompt test**

In `scripts/analysis-provider.test.mjs`, replace the old assertion:

```js
requests[0].body.messages[0].content.includes("独立生成 standard_solution")
```

with two assertions:

```js
assert.equal(
  requests[0].body.messages[0].content.includes("独立生成 standard_solution"),
  true,
);
assert.equal(
  requests[0].body.messages[0].content.includes("图片识别阶段只提供题干、学生答案和学生步骤"),
  true,
);
```

- [ ] **Step 8: Run all tests**

Run:

```bash
npm test
```

Expected: PASS.

---

### Task 6: Update PRD And Interview Narrative

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `interview/mathtrace-project-narrative.md`

- [ ] **Step 1: Update PRD image diagnosis contract**

In `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`, replace descriptions that say the service still internally keeps `standard_solution_draft`.

The current-state wording should become:

```md
P1 `image_diagnosis` 后端通过 vision provider adapter 调用多模态接口。模型只负责图片 OCR 和结构化抽取，输出 `question_text`、`student_answer`、`student_solution_steps`、`extraction_confidence` 和 `warnings`；不要求、也不接收视觉模型生成标准解法。最终报告中的 `mistake_diagnosis.standard_solution` 由确认后的 text analysis provider 基于用户确认文本生成；provider 不可用时回退为本地保守提示。
```

- [ ] **Step 2: Update PRD extraction preview JSON**

Remove `standard_solution_draft` from the `image_diagnosis` preview response example:

```json
"recognized_question": {
  "id": "image_draft_x",
  "title": "图片识别错题",
  "module": "待确认",
  "question_text": "string",
  "student_answer": "string",
  "student_solution_steps": ["string"],
  "extraction_confidence": "high | medium | low"
}
```

Delete the paragraph saying `standard_solution_draft` is retained for compatibility.

- [ ] **Step 3: Update Technical Roadmap provider contract**

In `docs/TECHNICAL_ROADMAP.md`, remove `standard_solution_draft` from the `TextAnalysisEnhancementProvider.enhanceConfirmedDiagnosis()` input example.

Expected shape:

```ts
interface TextAnalysisEnhancementProvider {
  enhanceConfirmedDiagnosis(input: {
    question_text: string;
    student_answer: string;
    student_solution_steps: string[];
  }): Promise<DiagnosisEnhancementDraft>;
}
```

- [ ] **Step 4: Update invalid-output policy**

Replace text saying missing `standard_solution_draft` is tolerated with:

```md
如果模型返回 `standard_solution_draft`、`standard_solution`、`memory_delta`、`student_profile`、`mistake_history` 或其他未声明字段，解析层视为越权输出并返回可恢复的 `model_invalid_output`。
```

- [ ] **Step 5: Update interview narrative**

In `interview/mathtrace-project-narrative.md`, update the sections that currently say the field is still retained. The new narrative should say:

```md
后续我把过渡期的 `standard_solution_draft` 彻底移除了：视觉模型的输出契约只保留题干、学生答案、学生步骤、置信度和 warning。这样确认 payload、token fingerprint、debug summary 和前端预览都不再携带标准解法草稿，面试里可以清楚解释为“视觉模型负责看图，文本分析模型负责解题”。
```

Also keep the existing point that final `standard_solution` remains a text analysis provider responsibility.

- [ ] **Step 6: Verify documentation no longer advertises the old field**

Run:

```bash
rg -n "standard_solution_draft" src scripts docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
```

Expected: no output.

---

### Task 7: Final Verification And Commit

**Files:**
- All modified source/test/docs files from Tasks 1-6

- [ ] **Step 1: Run final scans**

Run:

```bash
rg -n "standard_solution_draft" src scripts docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
rg -n "标准解法草稿|视觉模型未返回标准解法草稿" src scripts docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
```

Expected: no output.

- [ ] **Step 2: Run full validation**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 3: Review exact status and diff**

Run:

```bash
git status --short
git diff --stat
git diff -- src scripts docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
```

Expected:
- tracked changes only in files directly related to removing `standard_solution_draft`.
- `docs/reviews/*.md` remains untracked.
- existing local plan docs not related to this task remain untracked and unstaged.

- [ ] **Step 4: Commit exact task scope**

Stage only the changed source/test/docs files. Do not use `git add .`.

Expected command shape:

```bash
git add src/lib/vision-extraction/vision-extraction-types.ts \
  src/lib/vision-extraction/vision-extraction-parser.ts \
  src/lib/diagnosis/diagnose-api.ts \
  src/lib/diagnosis/diagnose-client.ts \
  src/lib/diagnosis/diagnose-service.ts \
  src/lib/diagnosis/confirm-service.ts \
  src/lib/diagnosis/diagnosis-view-model.ts \
  src/lib/image-diagnosis/image-confirmation.ts \
  src/lib/image-diagnosis/image-confirmation-token.ts \
  src/lib/image-diagnosis/image-diagnosis-pipeline.ts \
  src/lib/shared/diagnosis-evidence.ts \
  src/lib/providers/analysis-provider.ts \
  scripts/vision-extraction-parser.test.mjs \
  scripts/anthropic-compatible-provider.test.mjs \
  scripts/api-smoke.test.mjs \
  scripts/demo-smoke.test.mjs \
  scripts/diagnose-client.test.mjs \
  scripts/diagnosis-evidence.test.mjs \
  scripts/diagnosis-persistence.test.mjs \
  scripts/diagnosis-view-model.test.mjs \
  scripts/image-confirmation.test.mjs \
  scripts/image-diagnosis-pipeline.test.mjs \
  scripts/agent-pipeline.test.mjs \
  scripts/analysis-provider.test.mjs \
  scripts/eval-harness.test.mjs \
  scripts/fixtures/eval/p15-trusted-diagnosis-cases.mjs \
  docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md \
  docs/TECHNICAL_ROADMAP.md \
  interview/mathtrace-project-narrative.md
git commit -m "refactor: remove vision standard solution draft"
```

If the actual changed file list differs, adjust the `git add` list to match `git status --short` exactly.


