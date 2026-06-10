# P1.5 Trusted Diagnosis Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当图片只识别到题干或学生步骤不清时，MathTrace 进入可信降级和快速追问模式，避免把题目常见易错点误写成学生具体错因，并用 eval harness 固化这些安全边界。

**Architecture:** 保持 P0 `sample_diagnosis` 和现有 `/api/diagnose` 图片抽取路径不变。P1.5 在 `/api/confirm` 后的图片诊断链路增加证据评估、写入策略和风险追问 view model：学生步骤充分时走现有具体错因诊断；只有题干时生成题型/考点风险提示和追问，并允许 DeepSeek/text analysis provider 仅做展示增强，补完整标准解法、题型解释和追问分析草稿；跳过追问只写 `profile_update_kind="problem_type_focus"`，对相关知识点做固定轻微掌握度下调并加入 `review_priority_changes`，不写 `mistake_cause_changes`；用户明确选择/输入卡点并再次确认后，才允许 `profile_update_kind="mistake_cause"`。所有模型输出仍只作为不可信输入，`evidence_level`、`persistence_evidence`、`profile_update_kind`、`memory_delta`、`student_profile`、`mistake_history` 继续由本地规则控制。

**Tech Stack:** Next.js App Router, TypeScript, React client component state, Tailwind CSS, existing Node script tests with `jiti`, localStorage demo profile, KaTeX rendering.

---

## Scope And Decisions

- 本任务必须先在分支 `codex/p15-trusted-diagnosis-fallback` 上执行，不直接在 `main` 修改。
- 不新增数据库、登录、老师端、支付、完整 RAG、LangGraph、OpenAI Agents SDK 或 Vercel AI SDK。
- 不新增 `/api/follow-up`。快速追问复用 `/api/confirm`，通过明确的 `confirmation_action` 表达用户行为。
- 不改 `confirmation_token` payload，不把题干、学生答案、标准解法或图片内容塞进 token。
- 不改 localStorage 的 `StudentProfile` schema。`problem_type_focus` 先作为响应层的 `profile_update_kind`，落到现有 `MemoryDelta.knowledge_mastery_changes` 和 `MemoryDelta.review_priority_changes`；其中 `problem_only + skip_follow_up` 固定对相关知识点轻微下调 `-2`，但不新增 `StudentProfile.problem_type_focus`。
- DeepSeek analysis provider 在 `student_work_sufficient` 和 `problem_only` 路径都可做 presentation-only 增强：补完整标准解法、报告表达、题型解释和追问分析草稿；但不得参与 `evidence_level`、`persistence_evidence`、`profile_update_kind`、`memory_delta`、画像写入或跳过策略。
- fingerprint 不匹配、analysis provider 未配置/失败/越权输出时，`/api/confirm` 必须回退本地规则；其中 fingerprint 不匹配仍不得写入长期画像。
- `sample_diagnosis` 是正式演示路径，不是失败 fallback。本任务只能增加 sample 回归测试，不能让 sample 依赖 provider/env/confirm。

## Target Contract

新增响应/内部类型使用字面量联合，不使用 TypeScript `enum`：

```ts
export type EvidenceLevel =
  | "student_work_sufficient"
  | "problem_only"
  | "insufficient";

export type PersistenceEvidence =
  | "student_work"
  | "user_confirmed"
  | "uploaded_problem_only"
  | "none";

export type ProfileUpdateKind =
  | "mistake_cause"
  | "problem_type_focus"
  | "none";

export interface EvidenceAssessment {
  evidence_level: EvidenceLevel;
  persistence_evidence: PersistenceEvidence;
  profile_update_kind: ProfileUpdateKind;
  should_prompt_for_stuck_point: boolean;
  can_write_mistake_cause: boolean;
  rationale: string;
}
```

`DiagnoseImageSuccessResponse` 增加：

```ts
evidence_level: EvidenceLevel;
persistence_evidence: PersistenceEvidence;
profile_update_kind: ProfileUpdateKind;
risk_follow_up: ProblemRiskFollowUp | null;
```

`ProblemRiskFollowUp` 最小结构：

```ts
export interface ProblemRiskFollowUp {
  problem_type: string;
  knowledge_points: string[];
  common_stuck_points: Array<{
    id: string;
    label: string;
    related_mistake_cause: string;
  }>;
  standard_solution_summary: string;
  prompt: string;
}
```

确认请求扩展：

```ts
export type ConfirmationAction =
  | "diagnose_from_student_work"
  | "skip_follow_up"
  | "submit_stuck_point"
  | "confirm_stuck_point_analysis";

export interface FollowUpAnswerDraft {
  selected_stuck_point_id: string | null;
  custom_text: string | null;
}
```

默认兼容：旧客户端未传 `confirmation_action` 时按 `"diagnose_from_student_work"` 处理。

## File Structure

- Create: `src/lib/diagnosis-evidence.ts`
  - 纯函数证据评估、题目风险追问 view model、追问回答解析和写入策略。
- Modify: `src/lib/diagnose-api.ts`
  - 增加 evidence/follow-up 类型、image success response 字段和 response guard。
- Modify: `src/lib/confirm-service.ts`
  - 解析 `confirmation_action`、`follow_up_answer`，把证据策略传入 image pipeline。
- Modify: `src/lib/image-diagnosis-pipeline.ts`
  - 使用 evidence assessment 决定 `mistake_diagnosis`、`memory_delta`、`student_profile` 和 response metadata。
- Modify: `src/lib/diagnose-client.ts`
  - 扩展 confirm payload、response guard 使用、持久化 guard。
- Modify: `src/lib/diagnosis-view-model.ts`
  - 把 evidence/follow-up 字段转成前端 view model；新增快速追问 helper。
- Modify: `src/components/mathtrace-workbench.tsx`
  - 在图片确认/结果区增加一屏追问、跳过、草稿确认交互。
- Test: `scripts/diagnosis-evidence.test.mjs`
  - 覆盖证据评估和 follow-up view model。
- Modify tests:
  - `scripts/image-diagnosis-pipeline.test.mjs`
  - `scripts/image-confirmation.test.mjs`
  - `scripts/diagnose-client.test.mjs`
  - `scripts/diagnosis-view-model.test.mjs`
  - `scripts/agent-pipeline.test.mjs`
- Create: `scripts/eval-harness.test.mjs`
- Create: `scripts/fixtures/eval/p15-trusted-diagnosis-cases.mjs`
- Modify: `package.json`
  - 增加 `test:eval`，并把核心 evidence 测试纳入 `npm test`。
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `interview/mathtrace-project-narrative.md`

## Tasks

### Task 1: Branch And Baseline

**Files:**
- No production file edits.

- [ ] **Step 1: Confirm branch and clean status**

Run:

```bash
git branch --show-current
git status --short
```

Expected:

```text
codex/p15-trusted-diagnosis-fallback
```

`git status --short` should be empty except for this plan file if it has not been committed.

- [ ] **Step 2: Run baseline tests**

Run:

```bash
npm test
```

Expected: all existing script tests pass.

- [ ] **Step 3: Run baseline lint**

Run:

```bash
npm run lint
```

Expected: pass with no new lint errors.

### Task 2: RED - Evidence Assessment Contract

**Files:**
- Create: `scripts/diagnosis-evidence.test.mjs`
- Create: `src/lib/diagnosis-evidence.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing evidence tests**

Create `scripts/diagnosis-evidence.test.mjs`:

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  assessExtractionEvidence,
  createProblemRiskFollowUp,
  parseFollowUpAnswer,
} = jiti("../src/lib/diagnosis-evidence.ts");

const sufficient = assessExtractionEvidence({
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "$f'(x)=3x^2-3a$，只得到 $x=\\sqrt a$。",
  student_solution_steps: ["求导正确", "只写一个临界点", "没有讨论 $a\\le 0$"],
  standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
  extraction_confidence: "high",
  warnings: [],
});

assert.equal(sufficient.evidence_level, "student_work_sufficient");
assert.equal(sufficient.persistence_evidence, "student_work");
assert.equal(sufficient.profile_update_kind, "mistake_cause");
assert.equal(sufficient.can_write_mistake_cause, true);
assert.equal(sufficient.should_prompt_for_stuck_point, false);

const problemOnly = assessExtractionEvidence({
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "未识别到学生答案",
  student_solution_steps: [],
  standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
  extraction_confidence: "low",
  warnings: ["没有识别到学生作答区域。"],
});

assert.equal(problemOnly.evidence_level, "problem_only");
assert.equal(problemOnly.persistence_evidence, "uploaded_problem_only");
assert.equal(problemOnly.profile_update_kind, "problem_type_focus");
assert.equal(problemOnly.can_write_mistake_cause, false);
assert.equal(problemOnly.should_prompt_for_stuck_point, true);

const insufficient = assessExtractionEvidence({
  question_text: "",
  student_answer: "未识别到学生答案",
  student_solution_steps: [],
  standard_solution_draft: "",
  extraction_confidence: "low",
  warnings: [],
});

assert.equal(insufficient.evidence_level, "insufficient");
assert.equal(insufficient.persistence_evidence, "none");
assert.equal(insufficient.profile_update_kind, "none");

const followUp = createProblemRiskFollowUp({
  extraction: {
    question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    student_answer: "未识别到学生答案",
    student_solution_steps: [],
    standard_solution_draft: "先求导，再按 $a\\le 0$ 和 $a>0$ 分类讨论。",
    extraction_confidence: "low",
    warnings: [],
  },
  knowledge_points: ["derivative_monotonicity", "parameter_classification"],
  mistake_causes: ["classification_missing", "domain_missing"],
});

assert.equal(followUp.common_stuck_points.length > 0, true);
assert.equal(followUp.knowledge_points.includes("parameter_classification"), true);
assert.equal(followUp.prompt, "你主要卡在哪里？");

const parsedChoice = parseFollowUpAnswer({
  selected_stuck_point_id: followUp.common_stuck_points[0].id,
  custom_text: "",
});

assert.equal(parsedChoice.ok, true);
assert.equal(parsedChoice.value.selected_stuck_point_id, followUp.common_stuck_points[0].id);

const parsedCustom = parseFollowUpAnswer({
  selected_stuck_point_id: null,
  custom_text: "我不知道为什么要分类讨论参数。",
});

assert.equal(parsedCustom.ok, true);
assert.equal(parsedCustom.value.custom_text, "我不知道为什么要分类讨论参数。");

console.log("diagnosis evidence test passed");
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node scripts/diagnosis-evidence.test.mjs
```

Expected: FAIL because `src/lib/diagnosis-evidence.ts` does not exist.

- [ ] **Step 3: Implement minimal evidence module**

Create `src/lib/diagnosis-evidence.ts` with:

```ts
import type { KnowledgeMapping } from "@/lib/diagnose-api";
import type { VisionExtractionDraft } from "@/lib/vision-extraction-parser";

export type EvidenceLevel =
  | "student_work_sufficient"
  | "problem_only"
  | "insufficient";

export type PersistenceEvidence =
  | "student_work"
  | "user_confirmed"
  | "uploaded_problem_only"
  | "none";

export type ProfileUpdateKind =
  | "mistake_cause"
  | "problem_type_focus"
  | "none";

export interface EvidenceAssessment {
  evidence_level: EvidenceLevel;
  persistence_evidence: PersistenceEvidence;
  profile_update_kind: ProfileUpdateKind;
  should_prompt_for_stuck_point: boolean;
  can_write_mistake_cause: boolean;
  rationale: string;
}

export interface ProblemRiskFollowUp {
  problem_type: string;
  knowledge_points: string[];
  common_stuck_points: Array<{
    id: string;
    label: string;
    related_mistake_cause: string;
  }>;
  standard_solution_summary: string;
  prompt: string;
}

export interface FollowUpAnswerDraft {
  selected_stuck_point_id: string | null;
  custom_text: string | null;
}

export function assessExtractionEvidence(
  extraction: VisionExtractionDraft,
): EvidenceAssessment {
  const hasQuestion = extraction.question_text.trim().length > 0;
  const hasStandardSolution = extraction.standard_solution_draft.trim().length > 0;
  const hasStudentAnswer =
    extraction.student_answer.trim().length > 0 &&
    !/未识别到学生答案|没有识别到学生答案|未识别/.test(
      extraction.student_answer,
    );
  const hasStudentSteps = extraction.student_solution_steps.length > 0;

  if (hasStudentAnswer && hasStudentSteps && extraction.extraction_confidence !== "low") {
    return {
      evidence_level: "student_work_sufficient",
      persistence_evidence: "student_work",
      profile_update_kind: "mistake_cause",
      should_prompt_for_stuck_point: false,
      can_write_mistake_cause: true,
      rationale: "识别到了学生答案和解题步骤，可以基于学生作答诊断具体错因。",
    };
  }

  if (hasQuestion && hasStandardSolution) {
    return {
      evidence_level: "problem_only",
      persistence_evidence: "uploaded_problem_only",
      profile_update_kind: "problem_type_focus",
      should_prompt_for_stuck_point: true,
      can_write_mistake_cause: false,
      rationale: "只识别到题目风险，暂不能判断学生真实错因。",
    };
  }

  return {
    evidence_level: "insufficient",
    persistence_evidence: "none",
    profile_update_kind: "none",
    should_prompt_for_stuck_point: false,
    can_write_mistake_cause: false,
    rationale: "题干或标准解法信息不足，不能生成可信诊断。",
  };
}

export function createProblemRiskFollowUp(input: {
  extraction: VisionExtractionDraft;
  knowledge_points: KnowledgeMapping["knowledge_points"];
  mistake_causes: string[];
}): ProblemRiskFollowUp {
  const stuckPoints = input.mistake_causes.slice(0, 4).map((causeId) => {
    return {
      id: causeId,
      label: causeId,
      related_mistake_cause: causeId,
    };
  });

  return {
    problem_type: inferProblemType(input.extraction.question_text),
    knowledge_points: input.knowledge_points,
    common_stuck_points: stuckPoints,
    standard_solution_summary: summarizeStandardSolution(
      input.extraction.standard_solution_draft,
    ),
    prompt: "你主要卡在哪里？",
  };
}

export function parseFollowUpAnswer(
  value: unknown,
): { ok: true; value: FollowUpAnswerDraft } | { ok: false; message: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, message: "follow_up_answer 必须是对象。" };
  }

  const record = value as Record<string, unknown>;
  const selected =
    typeof record.selected_stuck_point_id === "string" &&
    record.selected_stuck_point_id.trim().length > 0
      ? record.selected_stuck_point_id.trim()
      : null;
  const custom =
    typeof record.custom_text === "string" && record.custom_text.trim().length > 0
      ? record.custom_text.trim().slice(0, 80)
      : null;

  if (!selected && !custom) {
    return { ok: false, message: "请选择卡点或输入一句话。" };
  }

  return {
    ok: true,
    value: {
      selected_stuck_point_id: selected,
      custom_text: custom,
    },
  };
}
```

Add small private helpers `inferProblemType()` and `summarizeStandardSolution()` in the same file. Keep labels simple at first; Task 5 can map labels to display names.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node scripts/diagnosis-evidence.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Add to npm test**

Modify `package.json`:

```json
"test": "node scripts/vision-extraction-parser.test.mjs && node scripts/anthropic-compatible-provider.test.mjs && node scripts/analysis-provider.test.mjs && node scripts/diagnosis-evidence.test.mjs && node scripts/math-text-parser.test.mjs && node scripts/image-diagnosis-pipeline.test.mjs && node scripts/image-confirmation.test.mjs && node scripts/diagnose-client.test.mjs && node scripts/image-upload-client.test.mjs && node scripts/diagnosis-view-model.test.mjs && node scripts/agent-pipeline.test.mjs && node scripts/demo-state.test.mjs"
```

### Task 3: RED - Image Pipeline Respects Evidence

**Files:**
- Modify: `scripts/image-diagnosis-pipeline.test.mjs`
- Modify: `src/lib/image-diagnosis-pipeline.ts`
- Modify: `src/lib/diagnose-api.ts`

- [ ] **Step 1: Write failing pipeline tests**

Extend `scripts/image-diagnosis-pipeline.test.mjs`:

```js
const problemOnlyResponse = runImageMathTraceAgent({
  request,
  extraction: {
    question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    student_answer: "未识别到学生答案",
    student_solution_steps: [],
    standard_solution_draft: "应先求导，再按参数分类讨论。",
    extraction_confidence: "low",
    warnings: ["没有识别到学生作答区域。"],
  },
  is_extraction_confirmed: true,
  confirmation_action: "skip_follow_up",
});

assert.equal(problemOnlyResponse.evidence_level, "problem_only");
assert.equal(problemOnlyResponse.persistence_evidence, "uploaded_problem_only");
assert.equal(problemOnlyResponse.profile_update_kind, "problem_type_focus");
assert.deepEqual(problemOnlyResponse.mistake_diagnosis.mistake_causes, []);
assert.deepEqual(problemOnlyResponse.memory_delta.mistake_cause_changes, {});
assert.deepEqual(problemOnlyResponse.memory_delta.knowledge_mastery_changes, {
  derivative_monotonicity: -2,
  parameter_classification: -2,
});
assert.deepEqual(problemOnlyResponse.memory_delta.review_priority_changes, [
  "derivative_monotonicity",
  "parameter_classification",
]);
assert.equal(problemOnlyResponse.memory_delta.should_persist, true);
assert.equal(
  problemOnlyResponse.student_profile.frequent_mistake_causes.classification_missing,
  4,
);

const insufficientResponse = runImageMathTraceAgent({
  request,
  extraction: {
    question_text: "",
    student_answer: "未识别到学生答案",
    student_solution_steps: [],
    standard_solution_draft: "",
    extraction_confidence: "low",
    warnings: [],
  },
  is_extraction_confirmed: true,
});

assert.equal(insufficientResponse.evidence_level, "insufficient");
assert.equal(insufficientResponse.profile_update_kind, "none");
assert.equal(insufficientResponse.memory_delta.should_persist, false);
assert.deepEqual(insufficientResponse.memory_delta.mistake_cause_changes, {});
```

Add an analysis provider regression showing that `problem_only` can use analysis output for display only:

```js
const analyzedProblemOnly = runImageMathTraceAgent({
  request,
  extraction: problemOnlyExtraction,
  is_extraction_confirmed: true,
  confirmation_action: "skip_follow_up",
  analysis: {
    expected_diagnosis: "模型增强展示文本。",
    step_analysis: ["展示文本"],
    solution_highlights: ["展示文本"],
    standard_solution: "DeepSeek 补全标准解法：先求导，再按 $a\\le 0$ 与 $a>0$ 分类讨论。",
    warnings: [],
  },
});

assert.equal(
  analyzedProblemOnly.mistake_diagnosis.standard_solution,
  "DeepSeek 补全标准解法：先求导，再按 $a\\le 0$ 与 $a>0$ 分类讨论。",
);
assert.equal(analyzedProblemOnly.profile_update_kind, "problem_type_focus");
assert.deepEqual(analyzedProblemOnly.memory_delta.mistake_cause_changes, {});
assert.deepEqual(analyzedProblemOnly.memory_delta.knowledge_mastery_changes, {
  derivative_monotonicity: -2,
  parameter_classification: -2,
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node scripts/image-diagnosis-pipeline.test.mjs
```

Expected: FAIL because response fields and `confirmation_action` do not exist.

- [ ] **Step 3: Add API response types**

In `src/lib/diagnose-api.ts`, import or re-export types from `diagnosis-evidence.ts` and extend `DiagnoseImageSuccessResponse`:

```ts
evidence_level: EvidenceLevel;
persistence_evidence: PersistenceEvidence;
profile_update_kind: ProfileUpdateKind;
risk_follow_up: ProblemRiskFollowUp | null;
```

Update `isDiagnoseImageSuccessResponse` to require these fields for image success responses only.

- [ ] **Step 4: Update image pipeline input**

In `src/lib/image-diagnosis-pipeline.ts`, extend input:

```ts
confirmation_action?: ConfirmationAction;
follow_up_answer?: FollowUpAnswerDraft;
```

Use `assessExtractionEvidence(input.extraction)` before `diagnoseImageMistake()`.

- [ ] **Step 5: Gate mistake causes and memory delta**

Implement rules:

```ts
if (assessment.evidence_level === "problem_only" && action === "skip_follow_up") {
  mistake_causes = [];
  memory_delta = {
    knowledge_mastery_changes: Object.fromEntries(
      knowledgeMapping.knowledge_points.map((knowledgeId) => [knowledgeId, -2]),
    ),
    mistake_cause_changes: {},
    is_repeated_mistake: false,
    review_priority_changes: knowledgeMapping.knowledge_points,
    should_persist: true,
    rationale: "用户跳过追问，本次只基于题型/考点风险轻微下调掌握度，不记录具体错因。",
  };
}
```

For `insufficient`, return `should_persist=false` and empty delta arrays/records.

For `student_work_sufficient`, keep existing concrete mistake cause behavior.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
node scripts/image-diagnosis-pipeline.test.mjs
```

Expected: PASS.

### Task 4: RED - Confirm Service Actions

**Files:**
- Modify: `scripts/image-confirmation.test.mjs`
- Modify: `src/lib/confirm-service.ts`
- Modify: `src/lib/diagnose-client.ts`

- [ ] **Step 1: Write failing confirm service tests**

Extend `scripts/image-confirmation.test.mjs` with:

```js
const problemOnlyToken = createImageConfirmationToken({
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "未识别到学生答案",
  student_solution_steps: [],
  standard_solution_draft: "应先求导，再按参数分类讨论。",
  extraction_confidence: "low",
  warnings: ["没有识别到学生作答区域。"],
});

const skipResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: problemOnlyToken,
  confirmation_action: "skip_follow_up",
  confirmed_extraction: {
    question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    student_answer: "未识别到学生答案",
    student_solution_steps: [],
    standard_solution_draft: "应先求导，再按参数分类讨论。",
    extraction_confidence: "low",
    warnings: ["没有识别到学生作答区域。"],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(skipResult.status, 200);
assert.equal(skipResult.body.profile_update_kind, "problem_type_focus");
assert.equal(skipResult.body.persistence_evidence, "uploaded_problem_only");
assert.deepEqual(skipResult.body.memory_delta.mistake_cause_changes, {});
assert.deepEqual(skipResult.body.memory_delta.knowledge_mastery_changes, {
  derivative_monotonicity: -2,
  parameter_classification: -2,
});
assert.equal(skipResult.body.memory_delta.should_persist, true);

const userAnswerResult = await handleConfirmRequest({
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: problemOnlyToken,
  confirmation_action: "submit_stuck_point",
  follow_up_answer: {
    selected_stuck_point_id: "classification_missing",
    custom_text: null,
  },
  confirmed_extraction: {
    question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    student_answer: "未识别到学生答案",
    student_solution_steps: [],
    standard_solution_draft: "应先求导，再按参数分类讨论。",
    extraction_confidence: "low",
    warnings: ["没有识别到学生作答区域。"],
  },
  student_profile: demoStudentProfile,
  mistake_history: [],
});

assert.equal(userAnswerResult.status, 200);
assert.equal(userAnswerResult.body.persistence_evidence, "user_confirmed");
assert.equal(userAnswerResult.body.profile_update_kind, "mistake_cause");
assert.deepEqual(userAnswerResult.body.memory_delta.mistake_cause_changes, {
  classification_missing: 1,
});
assert.equal(userAnswerResult.body.memory_delta.should_persist, true);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node scripts/image-confirmation.test.mjs
```

Expected: FAIL because `confirmation_action` and empty step problem-only confirm are not supported.

- [ ] **Step 3: Relax confirmed extraction parsing for problem-only**

In `src/lib/confirm-service.ts`, parse `confirmation_action` before enforcing steps. Do not weaken `parseConfirmedExtractionDraft()` globally if that would affect existing normal confirm behavior. Add a local path for `skip_follow_up` and `submit_stuck_point` that permits `student_solution_steps: []` only when `assessExtractionEvidence()` returns `problem_only`.

- [ ] **Step 4: Pass actions to pipeline**

Keep `analysis_provider` callable for fingerprint-matched `problem_only` actions. It may enhance `expected_diagnosis`, `step_analysis`, `solution_highlights`, and `standard_solution`, including the follow-up draft shown after `submit_stuck_point`; it must not feed `memory_delta`, evidence metadata, persistence decisions, or `student_profile`.

Pass:

```ts
confirmation_action: parsed.value.confirmation_action,
follow_up_answer: parsed.value.follow_up_answer,
```

to `runImageMathTraceAgent()`.

- [ ] **Step 5: Update client payload builder**

In `src/lib/diagnose-client.ts`, extend `buildConfirmedImageDiagnosePayload()` input:

```ts
confirmation_action?: ConfirmationAction;
follow_up_answer?: FollowUpAnswerDraft;
```

Default to `"diagnose_from_student_work"` when omitted.

- [ ] **Step 6: Verify GREEN**

Run:

```bash
node scripts/image-confirmation.test.mjs
node scripts/diagnose-client.test.mjs
```

Expected: PASS.

### Task 5: RED - Client Guards And View Model

**Files:**
- Modify: `scripts/diagnose-client.test.mjs`
- Modify: `scripts/diagnosis-view-model.test.mjs`
- Modify: `src/lib/diagnose-client.ts`
- Modify: `src/lib/diagnosis-view-model.ts`

- [ ] **Step 1: Write failing client guard tests**

Extend `scripts/diagnose-client.test.mjs`:

```js
const p15ImageResponse = {
  ...highConfidenceImageResponse,
  evidence_level: "student_work_sufficient",
  persistence_evidence: "student_work",
  profile_update_kind: "mistake_cause",
  risk_follow_up: null,
};

assert.equal(isDiagnoseImageSuccessResponse(p15ImageResponse), true);
assert.equal(shouldPersistDiagnoseProfile(p15ImageResponse), true);

const inconsistentLowConfidence = {
  ...p15ImageResponse,
  recognized_question: {
    ...p15ImageResponse.recognized_question,
    extraction_confidence: "low",
  },
  profile_update_kind: "mistake_cause",
  memory_delta: {
    ...p15ImageResponse.memory_delta,
    should_persist: true,
  },
};

assert.equal(isDiagnoseImageSuccessResponse(inconsistentLowConfidence), false);
```

- [ ] **Step 2: Write failing view model tests**

Extend `scripts/diagnosis-view-model.test.mjs`:

```js
const problemOnlyView = createImageDiagnosisViewModel({
  ...imageDiagnosisResponse,
  evidence_level: "problem_only",
  persistence_evidence: "uploaded_problem_only",
  profile_update_kind: "problem_type_focus",
  risk_follow_up: {
    problem_type: "导数中的参数分类讨论",
    knowledge_points: ["parameter_classification"],
    common_stuck_points: [
      {
        id: "classification_missing",
        label: "分类讨论",
        related_mistake_cause: "classification_missing",
      },
    ],
    standard_solution_summary: "先求导，再按参数分类讨论。",
    prompt: "你主要卡在哪里？",
  },
});

assert.equal(problemOnlyView.evidence_level, "problem_only");
assert.equal(problemOnlyView.profile_update_kind, "problem_type_focus");
assert.equal(problemOnlyView.risk_follow_up.common_stuck_points[0].id, "classification_missing");
```

- [ ] **Step 3: Verify RED**

Run:

```bash
node scripts/diagnose-client.test.mjs
node scripts/diagnosis-view-model.test.mjs
```

Expected: FAIL because guards/view model do not know P1.5 fields.

- [ ] **Step 4: Update guards**

Update `isDiagnoseImageSuccessResponse()` so:

- image success requires `evidence_level`, `persistence_evidence`, `profile_update_kind`, `risk_follow_up`.
- low confidence cannot combine with `memory_delta.should_persist=true` and `profile_update_kind="mistake_cause"` unless `persistence_evidence="user_confirmed"`.
- `problem_type_focus` requires empty `mistake_cause_changes`.

- [ ] **Step 5: Update view model**

Add to `DiagnosisViewModel`:

```ts
evidence_level: EvidenceLevel | null;
persistence_evidence: PersistenceEvidence | null;
profile_update_kind: ProfileUpdateKind;
risk_follow_up: ProblemRiskFollowUp | null;
```

Sample view model uses:

```ts
evidence_level: null,
persistence_evidence: null,
profile_update_kind: "mistake_cause",
risk_follow_up: null,
```

- [ ] **Step 6: Verify GREEN**

Run:

```bash
node scripts/diagnose-client.test.mjs
node scripts/diagnosis-view-model.test.mjs
```

Expected: PASS.

### Task 6: RED - Frontend Quick Follow-Up Mode

**Files:**
- Modify: `src/components/mathtrace-workbench.tsx`
- Modify: `src/lib/diagnosis-view-model.ts`
- Modify: `scripts/diagnosis-view-model.test.mjs`

- [ ] **Step 1: Add view helper tests**

In `scripts/diagnosis-view-model.test.mjs`, add tests for helper functions:

```js
const {
  canShowRiskFollowUp,
  createFollowUpDraftFromChoice,
} = jiti("../src/lib/diagnosis-view-model.ts");

assert.equal(canShowRiskFollowUp(problemOnlyView), true);
assert.equal(canShowRiskFollowUp(createSampleDiagnosisViewModel(sampleDiagnoses[0])), false);

const choiceDraft = createFollowUpDraftFromChoice("classification_missing");
assert.deepEqual(choiceDraft, {
  selected_stuck_point_id: "classification_missing",
  custom_text: null,
});

const customDraft = createFollowUpDraftFromChoice("custom", "我卡在参数范围。");
assert.deepEqual(customDraft, {
  selected_stuck_point_id: null,
  custom_text: "我卡在参数范围。",
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node scripts/diagnosis-view-model.test.mjs
```

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement view helpers**

In `src/lib/diagnosis-view-model.ts`, export:

```ts
export function canShowRiskFollowUp(view: DiagnosisViewModel): boolean {
  return view.source === "image" && view.risk_follow_up !== null;
}

export function createFollowUpDraftFromChoice(
  selectedId: string,
  customText = "",
): FollowUpAnswerDraft {
  if (selectedId === "custom") {
    return {
      selected_stuck_point_id: null,
      custom_text: customText.trim(),
    };
  }

  return {
    selected_stuck_point_id: selectedId,
    custom_text: null,
  };
}
```

- [ ] **Step 4: Add UI state**

In `src/components/mathtrace-workbench.tsx`, add state near `editableExtractionDraft`:

```ts
const [followUpCustomText, setFollowUpCustomText] = useState("");
const [selectedFollowUpChoiceId, setSelectedFollowUpChoiceId] = useState<string | null>(null);
```

Add two handlers:

```ts
function handleSkipFollowUp(): void {
  if (editableExtractionDraft === null) {
    return;
  }

  void requestConfirmedDiagnosis(editableExtractionDraft, {
    confirmation_action: "skip_follow_up",
  });
}

function handleSubmitFollowUp(): void {
  if (editableExtractionDraft === null || selectedFollowUpChoiceId === null) {
    return;
  }

  void requestConfirmedDiagnosis(editableExtractionDraft, {
    confirmation_action: "submit_stuck_point",
    follow_up_answer: createFollowUpDraftFromChoice(
      selectedFollowUpChoiceId,
      followUpCustomText,
    ),
  });
}
```

Keep the existing normal confirm button for `student_work_sufficient`.

- [ ] **Step 5: Render one-screen follow-up**

In the extraction review panel, when the draft has problem-only evidence, render:

```tsx
<p>学生步骤不清，暂不能直接判断具体错因。</p>
<p>你主要卡在哪里？</p>
```

Render buttons from `risk_follow_up.common_stuck_points`, plus “我自己说” and “跳过”。The “跳过” button calls `handleSkipFollowUp()` and its helper text must say:

```text
跳过后只轻微下调相关考点掌握度并记录复习关注，不记录具体错因。
```

- [ ] **Step 6: Verify frontend helpers**

Run:

```bash
node scripts/diagnosis-view-model.test.mjs
npm run lint
```

Expected: PASS.

### Task 7: Eval Harness

**Files:**
- Create: `scripts/fixtures/eval/p15-trusted-diagnosis-cases.mjs`
- Create: `scripts/eval-harness.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add eval fixtures**

Create `scripts/fixtures/eval/p15-trusted-diagnosis-cases.mjs`:

```js
export const trustedDiagnosisCases = [
  {
    id: "student_work_sufficient",
    action: "diagnose_from_student_work",
    extraction: {
      question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
      student_answer: "$f'(x)=3x^2-3a$，只得到 $x=\\sqrt a$。",
      student_solution_steps: ["求导正确", "只写一个临界点", "没有讨论 $a\\le 0$"],
      standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$。",
      extraction_confidence: "high",
      warnings: [],
    },
    expected: {
      evidence_level: "student_work_sufficient",
      profile_update_kind: "mistake_cause",
      should_persist: true,
      writes_mistake_cause: true,
      mastery_change_per_knowledge_point: null,
    },
  },
  {
    id: "problem_only_skip",
    action: "skip_follow_up",
    extraction: {
      question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
      student_answer: "未识别到学生答案",
      student_solution_steps: [],
      standard_solution_draft: "应先求导，再按参数分类讨论。",
      extraction_confidence: "low",
      warnings: ["没有识别到学生作答区域。"],
    },
    expected: {
      evidence_level: "problem_only",
      profile_update_kind: "problem_type_focus",
      should_persist: true,
      writes_mistake_cause: false,
      mastery_change_per_knowledge_point: -2,
    },
  },
  {
    id: "problem_only_user_confirmed",
    action: "submit_stuck_point",
    follow_up_answer: {
      selected_stuck_point_id: "classification_missing",
      custom_text: null,
    },
    extraction: {
      question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
      student_answer: "未识别到学生答案",
      student_solution_steps: [],
      standard_solution_draft: "应先求导，再按参数分类讨论。",
      extraction_confidence: "low",
      warnings: ["没有识别到学生作答区域。"],
    },
    expected: {
      evidence_level: "problem_only",
      profile_update_kind: "mistake_cause",
      should_persist: true,
      writes_mistake_cause: true,
      mastery_change_per_knowledge_point: null,
    },
  },
  {
    id: "insufficient",
    action: "diagnose_from_student_work",
    extraction: {
      question_text: "",
      student_answer: "未识别到学生答案",
      student_solution_steps: [],
      standard_solution_draft: "",
      extraction_confidence: "low",
      warnings: [],
    },
    expected: {
      evidence_level: "insufficient",
      profile_update_kind: "none",
      should_persist: false,
      writes_mistake_cause: false,
      mastery_change_per_knowledge_point: null,
    },
  },
];
```

- [ ] **Step 2: Add eval runner**

Create `scripts/eval-harness.test.mjs`:

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { trustedDiagnosisCases } from "./fixtures/eval/p15-trusted-diagnosis-cases.mjs";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { runImageMathTraceAgent } = jiti("../src/lib/image-diagnosis-pipeline.ts");
const { demoStudentProfile, sampleDiagnoses } = jiti("../src/data/mathtrace-demo.ts");
const { runMathTraceAgent } = jiti("../src/lib/mathtrace-agent-pipeline.ts");

const request = {
  student_id: "demo_student_001",
  student_profile: demoStudentProfile,
  mistake_history: [],
};

for (const item of trustedDiagnosisCases) {
  const response = runImageMathTraceAgent({
    request,
    extraction: item.extraction,
    is_extraction_confirmed: true,
    confirmation_action: item.action,
    follow_up_answer: item.follow_up_answer,
  });

  assert.equal(response.evidence_level, item.expected.evidence_level, item.id);
  assert.equal(response.profile_update_kind, item.expected.profile_update_kind, item.id);
  assert.equal(response.memory_delta.should_persist, item.expected.should_persist, item.id);
  assert.equal(
    Object.keys(response.memory_delta.mistake_cause_changes).length > 0,
    item.expected.writes_mistake_cause,
    item.id,
  );
  if (item.expected.mastery_change_per_knowledge_point !== null) {
    for (const knowledgeId of response.knowledge_mapping.knowledge_points) {
      assert.equal(
        response.memory_delta.knowledge_mastery_changes[knowledgeId],
        item.expected.mastery_change_per_knowledge_point,
        item.id,
      );
    }
  }
}

for (const sample of sampleDiagnoses) {
  const response = runMathTraceAgent({
    student_id: "demo_student_001",
    task_type: "sample_diagnosis",
    sample_question_id: sample.id,
    image_base64: null,
    student_profile: demoStudentProfile,
    mistake_history: [],
  });

  assert.equal(response.source, "sample", sample.id);
  assert.equal(response.fallback_used, false, sample.id);
  assert.equal(response.practice_questions.length, 3, sample.id);
  assert.equal(response.review_plan.seven_days.length, 7, sample.id);
}

console.log("eval harness test passed");
```

- [ ] **Step 3: Verify eval passes**

Run:

```bash
node scripts/eval-harness.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Add npm script**

Modify `package.json`:

```json
"test:eval": "node scripts/eval-harness.test.mjs"
```

Do not add `test:eval` into `npm test` unless total runtime remains comfortable. The final verification must run both.

### Task 8: Documentation Update

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `interview/mathtrace-project-narrative.md`

- [ ] **Step 1: Update PRD**

Update the PRD sections for P1 image confirmation and persistence:

- Add P1.5 evidence fields: `evidence_level`, `persistence_evidence`, `profile_update_kind`.
- Define `student_work_sufficient`, `problem_only`, `insufficient`.
- State that `problem_only + skip_follow_up` lightly lowers related knowledge mastery by `-2`, writes `review_priority_changes`, and does not write `mistake_cause_changes`.
- State that user selected/input stuck point must be shown for review before writing concrete mistake cause.
- Keep existing model forbidden fields and provider_debug privacy rules.

- [ ] **Step 2: Update Roadmap**

Add a P1.5 milestone after current P1 provider/confirm work:

```text
Phase 2.5: 可信诊断降级与快速追问
- 证据评估层
- 题目风险追问模式
- problem_type_focus 写入策略
- fixture-driven eval harness
```

- [ ] **Step 3: Update interview narrative**

Append a new section:

```md
## 11. 可信诊断降级与快速追问模式
```

Cover:

- 功能价值：不把题目风险误写成学生错因。
- 关键设计：证据等级、追问、跳过只写关注点。
- 技术决策：不用数据库/Agent framework，不改 localStorage schema。
- 性能收益：减少不必要模型调用，eval harness 缩短回归反馈。
- 真实证据：新增文件、测试命令、浏览器验证。

### Task 9: Full Verification And Browser QA

**Files:**
- No source edits unless verification reveals issues.

- [ ] **Step 1: Run full unit/script tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run eval harness**

Run:

```bash
npm run test:eval
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Start local dev server**

Run:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Expected: local Next.js server starts.

- [ ] **Step 6: Browser visual verification**

Use the in-app browser or Playwright CLI to verify:

- `sample_diagnosis` still loads and completes.
- image extraction review still shows editable fields.
- problem-only draft shows one-screen stuck-point prompt.
- skip follow-up displays “轻微下调相关考点掌握度并记录复习关注，不记录具体错因” and does not increment mistake causes.
- user selected stuck point shows a confirmable analysis and writes concrete mistake cause only after confirmation.
- mobile width has no overlapping text in the follow-up panel.

### Task 10: Local Claude Code Review Prompt

**Files:**
- Create locally only if needed: `docs/reviews/2026-06-10-p15-trusted-diagnosis-review.md`
- Do not stage `docs/reviews/*.md`.

- [ ] **Step 1: Prepare review prompt**

Prepare a Chinese Claude Code review prompt including:

```text
请审查当前分支 codex/p15-trusted-diagnosis-fallback 相对 main 的 diff。
重点检查：
1. 没有学生步骤时是否仍可能写入具体 mistake_cause。
2. skip_follow_up 是否只写 problem_type_focus 对应的轻微知识点掌握度下调和 review_priority_changes，不改 frequent_mistake_causes。
3. submit_stuck_point 是否只有用户明确回答后才写 mistake_cause。
4. sample_diagnosis 是否保持稳定，不依赖 provider/env。
5. DeepSeek/analysis provider 是否能在 problem_only 里补完整标准解法/展示分析，但仍不能影响 evidence_level、persistence_evidence、profile_update_kind、memory_delta/student_profile。
6. response guards 是否拒绝不一致响应。
7. localStorage 是否只在服务端允许持久化时更新。
8. 文档是否与最终 API 契约一致。

已运行命令：
- npm test
- npm run test:eval
- npm run lint
- npm run build
- 浏览器视觉验证：记录实际桌面/移动端验证结果和截图路径

非目标：
- 不引入数据库/登录/RAG/LangGraph/OpenAI Agents SDK/Vercel AI SDK。
- 不提交 docs/reviews/*.md。
```

- [ ] **Step 2: Apply review fixes**

If review finds issues, fix them with focused TDD:

1. Write or extend failing test.
2. Run focused test and confirm RED.
3. Implement minimal fix.
4. Run focused test and confirm GREEN.
5. Re-run full verification from Task 9.

## Self-Review Checklist

- Spec coverage:
  - Student work sufficient path: Task 3, Task 4, Task 7.
  - Problem only follow-up path: Task 2, Task 3, Task 4, Task 6, Task 7.
  - Skip writes only topic/focus: Task 3, Task 4, Task 7.
  - User answer required before concrete mistake cause: Task 4, Task 6, Task 7.
  - Model forbidden fields unaffected: existing provider tests plus Task 9 full `npm test`.
  - Sample stability: Task 7 and Task 9.
  - Docs/narrative update: Task 8.
- Placeholder scan: no placeholder markers or unspecified implementation steps.
- Type consistency:
  - `EvidenceLevel`, `PersistenceEvidence`, `ProfileUpdateKind`, `ProblemRiskFollowUp`, `ConfirmationAction`, and `FollowUpAnswerDraft` use the same names across tasks.
  - `problem_type_focus` is a response/write-policy kind, not a new `StudentProfile` field; skip follow-up may lower related mastery by fixed `-2` but must not write mistake causes.
- Scope check:
  - No new database, auth, RAG, framework, route family, or token payload expansion.
  - `docs/reviews/*.md` remains local review material and is not staged by default.
