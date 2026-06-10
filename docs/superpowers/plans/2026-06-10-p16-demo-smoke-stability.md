# P1.6a Demo Smoke Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 MathTrace 现有 P0/P1/P1.5 演示路径补一层轻量、可复现的 smoke 护栏，防止后续错题本、RAG、知识库或 UI 改动破坏样例题、图片确认、低证据追问和公式展示主路径。

**Architecture:** 不新增产品功能，不引入数据库、登录、RAG、真实 provider 调用或新的 Agent 框架。新增脚本级 smoke 测试覆盖 API Route、service contract、P1.5 低证据流和展示层文本清洗；同时新增一份手动浏览器 smoke checklist，记录真实浏览器里必须核对的 3-5 分钟 Demo 路径。

**Tech Stack:** Next.js App Router、TypeScript、Node.js `assert`、`jiti`、现有 npm scripts、现有 KaTeX/MathText 展示链路。

---

## 0. 背景与边界

### 当前状态

- `main` 已完成 P1.5，最新交付点为 `49a9740 feat: add trusted diagnosis fallback flow`。
- 当前已有：
  - `npm test`
  - `npm run test:eval`
  - `npm run lint`
  - `npm run build`
- P1.5 已覆盖“无学生证据不写具体错因”的 eval 边界，但还缺：
  - API Route 层的稳定 smoke。
  - 一条从图片识别草稿到确认/追问动作的端到端 contract smoke。
  - 展示层 Markdown/LaTeX 残留的固定回归用例。
  - 面试/演示前可照着跑的浏览器 smoke checklist。

### 本阶段不做

- 不做错题本、RAG、知识库上传、向量检索、老师端、登录、数据库或支付。
- 不调用真实 Vision Provider 或 DeepSeek Provider；所有 smoke 使用本地 fixture 或 fake provider。
- 不引入 Playwright 依赖；真实浏览器检查先作为手动 checklist。后续如果需要 CI 级 E2E，再单独评估 Playwright。
- 不改 localStorage schema。
- 不改现有诊断策略、画像写入规则或 UI 信息架构。
- 不提交 `docs/reviews/*.md`。

### 成功标准

- `npm run test:smoke` 可在无 API Key、无网络环境下稳定通过。
- `npm test` 包含新增 smoke 或至少明确串联核心 smoke，避免日常测试漏跑。
- smoke 覆盖以下契约：
  - `sample_diagnosis` 稳定返回完整报告，`fallback_used=false`。
  - `/api/diagnose` 非法 JSON、缺图、样例题成功响应稳定。
  - `/api/confirm` 非法 JSON 和确认主路径稳定。
  - 图片识别草稿响应不得包含 `memory_delta` 或 `student_profile`。
  - `problem_only` 默认进入追问，不写画像。
  - `skip_follow_up` 只写 `problem_type_focus`，不写 `mistake_cause_changes`。
  - `submit_stuck_point` 只生成草稿，不写画像。
  - `confirm_stuck_point_analysis` 才写 `user_confirmed` 的 `mistake_cause`。
  - 标准解法展示不暴露 `**(1)**`、行首 `- `、`即$\ln a` 这类残留。
- 文档同步：
  - PRD 增加 P1.6a smoke guard 说明。
  - Roadmap 增加 P1.6a 位置和命令。
  - `interview/mathtrace-project-narrative.md` 增加阶段叙事。

---

## 1. File Structure

### Create

- `scripts/api-smoke.test.mjs`
  - 负责 API Route 与 service 层最小 smoke。
  - 只使用本地 fake provider，不依赖真实 API Key。

- `scripts/demo-smoke.test.mjs`
  - 负责 P0/P1/P1.5 演示 contract smoke。
  - 聚合样例题、图片识别草稿、低证据追问、跳过、确认写入和标准解法展示残留用例。

- `docs/demo-smoke-checklist.md`
  - 负责真人演示前的浏览器检查清单。
  - 记录启动命令、浏览器路径、应看到的 UI 状态和故障切换方式。

### Modify

- `package.json`
  - 新增 `test:smoke`。
  - 将 `test:smoke` 纳入 `npm test`，或在计划执行时明确为何只独立保留。

- `src/lib/diagnosis-view-model.ts`
  - 仅当 smoke 暴露标准解法展示残留时，允许做最小展示层 normalization 修复。

- `scripts/diagnosis-view-model.test.mjs`
  - 为展示层 normalization 修复补精确回归用例。

- `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - 增加 P1.6a：Demo smoke stability guard。

- `docs/TECHNICAL_ROADMAP.md`
  - 在测试与质量保障章节补充 `npm run test:smoke`。
  - 在 Phase 列表中放到 P1.5 之后、错题本/RAG 之前。

- `interview/mathtrace-project-narrative.md`
  - 追加阶段 12：Demo smoke 稳定性收口。

### Do Not Modify

- `docs/reviews/*.md`
- `.env*`
- `src/lib/image-diagnosis-pipeline.ts`
- `src/lib/confirm-service.ts`
- `src/components/mathtrace-workbench.tsx`
- localStorage schema 相关类型

如果执行时发现必须改生产代码才能让 smoke 通过，先说明原因并只做与 smoke 暴露问题直接相关的最小修复。P1.6a 的定位是“锁住现有行为”，不是改变诊断策略或新增产品能力。

---

## 2. Implementation Tasks

### Task 1: API Route Smoke

**Files:**
- Create: `scripts/api-smoke.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing API smoke test**

Create `scripts/api-smoke.test.mjs` with this structure:

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { POST: diagnoseRoutePost } = jiti("../src/app/api/diagnose/route.ts");
const { POST: confirmRoutePost } = jiti("../src/app/api/confirm/route.ts");
const { handleDiagnoseRequest } = jiti("../src/lib/diagnose-service.ts");
const { handleConfirmRequest } = jiti("../src/lib/confirm-service.ts");
const { demoStudentProfile, mistakeHistory } = jiti(
  "../src/data/mathtrace-demo.ts",
);
const { isDiagnoseImageExtractionResponse } = jiti(
  "../src/lib/diagnose-api.ts",
);

const samplePayload = {
  student_id: "demo_student_001",
  task_type: "sample_diagnosis",
  sample_question_id: "sample_derivative_001",
  image_base64: null,
  student_profile: demoStudentProfile,
  mistake_history: mistakeHistory,
};

await assertRouteError(
  diagnoseRoutePost,
  rawRequest("{"),
  400,
  "invalid_json",
);

await assertRouteError(
  confirmRoutePost,
  rawRequest("{"),
  400,
  "invalid_json",
);

const sampleRouteResponse = await diagnoseRoutePost(jsonRequest(samplePayload));
const sampleRouteBody = await sampleRouteResponse.json();

assert.equal(sampleRouteResponse.status, 200);
assert.equal(sampleRouteBody.source, "sample");
assert.equal(sampleRouteBody.fallback_used, false);
assert.equal(sampleRouteBody.sample_diagnosis?.id, "sample_derivative_001");
assert.equal(sampleRouteBody.practice_questions.length, 3);
assert.equal(sampleRouteBody.review_plan.seven_days.length, 7);

await assertRouteError(
  diagnoseRoutePost,
  jsonRequest({
    ...samplePayload,
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: null,
    image_mime_type: "image/png",
  }),
  400,
  "missing_image",
);

const fakeVisionProvider = {
  async extractQuestionFromImage() {
    return {
      ok: true,
      value: {
        question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论单调性。",
        student_answer: "只写了求导。",
        student_solution_steps: ["求导得到 $f'(x)=1/x-a$。"],
        standard_solution_draft: "先求导，再按 $a\\le 0$ 与 $a>0$ 分类讨论。",
        extraction_confidence: "high",
        warnings: [],
      },
    };
  },
};

const extractionResult = await handleDiagnoseRequest(
  {
    ...samplePayload,
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "iVBORw0KGgo=",
    image_mime_type: "image/png",
  },
  { vision_provider: fakeVisionProvider },
);

assert.equal(extractionResult.status, 200);
assert.equal(extractionResult.body.stage, "extraction_review");
assert.equal(isDiagnoseImageExtractionResponse(extractionResult.body), true);
assert.equal("memory_delta" in extractionResult.body, false);
assert.equal("student_profile" in extractionResult.body, false);
assert.equal(typeof extractionResult.body.confirmation_token, "string");

const confirmPayload = {
  student_id: "demo_student_001",
  task_type: "confirmed_image_diagnosis",
  confirmation_token: extractionResult.body.confirmation_token,
  confirmed_extraction: createConfirmedExtractionDraft(extractionResult.body),
  student_profile: demoStudentProfile,
  mistake_history: [],
};

const confirmRouteResponse = await confirmRoutePost(jsonRequest(confirmPayload));
const confirmRouteBody = await confirmRouteResponse.json();

assert.equal(confirmRouteResponse.status, 200);
assert.equal(confirmRouteBody.source, "image");
assert.equal(confirmRouteBody.evidence_level, "student_work_sufficient");
assert.equal(confirmRouteBody.memory_delta.should_persist, true);

const confirmResult = await handleConfirmRequest(confirmPayload);

assert.equal(confirmResult.status, 200);
assert.equal(confirmResult.body.source, "image");
assert.equal(confirmResult.body.evidence_level, "student_work_sufficient");
assert.equal(confirmResult.body.memory_delta.should_persist, true);

console.log("api smoke test passed");

function rawRequest(body) {
  return new Request("http://localhost/api/test", {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
    },
  });
}

function jsonRequest(body) {
  return rawRequest(JSON.stringify(body));
}

function createConfirmedExtractionDraft(extractionResponse) {
  return {
    question_text: extractionResponse.recognized_question.question_text,
    student_answer: extractionResponse.recognized_question.student_answer,
    student_solution_steps:
      extractionResponse.recognized_question.student_solution_steps,
    standard_solution_draft:
      extractionResponse.recognized_question.standard_solution_draft,
    extraction_confidence:
      extractionResponse.recognized_question.extraction_confidence,
    warnings: extractionResponse.warnings,
  };
}

async function assertRouteError(routePost, request, expectedStatus, expectedCode) {
  const response = await routePost(request);
  const body = await response.json();

  assert.equal(response.status, expectedStatus);
  assert.equal(body.error?.code, expectedCode);
  assert.equal(body.error?.recoverable, true);
}
```

- [ ] **Step 2: Run the new test and confirm it fails before script wiring if file is absent**

Run:

```bash
node scripts/api-smoke.test.mjs
```

Expected before creation: `MODULE_NOT_FOUND` or missing file.  
Expected after Step 1: `api smoke test passed`.

- [ ] **Step 3: Wire `test:smoke` into `package.json`**

Modify scripts:

```json
{
  "scripts": {
    "test:smoke": "node scripts/api-smoke.test.mjs && node scripts/demo-smoke.test.mjs"
  }
}
```

Then append smoke to the existing `test` script so daily regression catches it:

```json
{
  "scripts": {
    "test": "node scripts/vision-extraction-parser.test.mjs && node scripts/anthropic-compatible-provider.test.mjs && node scripts/analysis-provider.test.mjs && node scripts/diagnosis-evidence.test.mjs && node scripts/math-text-parser.test.mjs && node scripts/image-diagnosis-pipeline.test.mjs && node scripts/image-confirmation.test.mjs && node scripts/diagnose-client.test.mjs && node scripts/image-upload-client.test.mjs && node scripts/diagnosis-view-model.test.mjs && node scripts/mathtrace-workbench-ui.test.mjs && node scripts/agent-pipeline.test.mjs && node scripts/demo-state.test.mjs && npm run test:smoke"
  }
}
```

This will fail until Task 2 creates `scripts/demo-smoke.test.mjs`.

---

### Task 2: Demo Contract Smoke

**Files:**
- Create: `scripts/demo-smoke.test.mjs`

- [ ] **Step 1: Write failing demo contract smoke**

Create `scripts/demo-smoke.test.mjs`:

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { demoStudentProfile, mistakeHistory, sampleDiagnoses } = jiti(
  "../src/data/mathtrace-demo.ts",
);
const { runMathTraceAgent } = jiti("../src/lib/mathtrace-agent-pipeline.ts");
const { runImageMathTraceAgent } = jiti(
  "../src/lib/image-diagnosis-pipeline.ts",
);
const {
  createStandardSolutionBlocks,
  createStandardSolutionDisplayText,
} = jiti("../src/lib/diagnosis-view-model.ts");

const baseRequest = {
  student_id: "demo_student_001",
  student_profile: demoStudentProfile,
  mistake_history: mistakeHistory,
};

for (const sample of sampleDiagnoses) {
  const response = runMathTraceAgent({
    ...baseRequest,
    task_type: "sample_diagnosis",
    sample_question_id: sample.id,
    image_base64: null,
  });

  assert.equal(response.source, "sample", sample.id);
  assert.equal(response.fallback_used, false, sample.id);
  assert.equal(response.sample_diagnosis?.id, sample.id, sample.id);
  assert.equal(response.practice_questions.length, 3, sample.id);
  assert.equal(response.review_plan.seven_days.length, 7, sample.id);
}

const problemOnlyExtraction = {
  question_text:
    "已知函数 $f(x)=\\ln x-ax+1$，求单调区间，并讨论零点个数。",
  student_answer: "未识别到学生答案",
  student_solution_steps: [],
  standard_solution_draft:
    "**(1)** 求导得 $f'(x)=\\frac{1}{x}-a$，定义域为 $(0,+\\infty)$。\n- 当 $a\\le 0$ 时恒增。\n由 $f(\\frac{1}{a})= -\\ln a>0$ 得 $0<a<1$，即$\\ln a<0$。",
  extraction_confidence: "low",
  warnings: ["未识别到清晰学生步骤。"],
};
const followUpAnswer = {
  selected_stuck_point_id: "classification_missing",
  custom_text: null,
};

const problemOnlyReport = runImageMathTraceAgent({
  request: baseRequest,
  extraction: problemOnlyExtraction,
  is_extraction_confirmed: true,
  confirmation_action: "diagnose_from_student_work",
});

assert.equal(problemOnlyReport.evidence_level, "problem_only");
assert.equal(problemOnlyReport.persistence_evidence, "none");
assert.equal(problemOnlyReport.profile_update_kind, "none");
assert.equal(problemOnlyReport.memory_delta.should_persist, false);
assert.equal(problemOnlyReport.risk_follow_up?.prompt, "你主要卡在哪里？");
assert.equal(
  Object.keys(problemOnlyReport.memory_delta.mistake_cause_changes).length,
  0,
);

const skipReport = runImageMathTraceAgent({
  request: baseRequest,
  extraction: problemOnlyExtraction,
  is_extraction_confirmed: true,
  confirmation_action: "skip_follow_up",
});

assert.equal(skipReport.persistence_evidence, "uploaded_problem_only");
assert.equal(skipReport.profile_update_kind, "problem_type_focus");
assert.equal(skipReport.memory_delta.should_persist, true);
assert.equal(
  Object.keys(skipReport.memory_delta.mistake_cause_changes).length,
  0,
);
for (const knowledgeId of skipReport.knowledge_mapping.knowledge_points) {
  assert.equal(skipReport.memory_delta.knowledge_mastery_changes[knowledgeId], -2);
}

const draftReport = runImageMathTraceAgent({
  request: baseRequest,
  extraction: problemOnlyExtraction,
  is_extraction_confirmed: true,
  confirmation_action: "submit_stuck_point",
  follow_up_answer: followUpAnswer,
});

assert.equal(draftReport.persistence_evidence, "none");
assert.equal(draftReport.profile_update_kind, "none");
assert.equal(draftReport.memory_delta.should_persist, false);
assert.equal(draftReport.risk_follow_up?.prompt, "你主要卡在哪里？");

const confirmedReport = runImageMathTraceAgent({
  request: baseRequest,
  extraction: problemOnlyExtraction,
  is_extraction_confirmed: true,
  confirmation_action: "confirm_stuck_point_analysis",
  follow_up_answer: followUpAnswer,
});

assert.equal(confirmedReport.persistence_evidence, "user_confirmed");
assert.equal(confirmedReport.profile_update_kind, "mistake_cause");
assert.equal(confirmedReport.memory_delta.should_persist, true);
assert.equal(
  Object.keys(confirmedReport.memory_delta.mistake_cause_changes).length > 0,
  true,
);

const displayText = createStandardSolutionDisplayText(
  problemOnlyExtraction.standard_solution_draft,
);
const blocks = createStandardSolutionBlocks(problemOnlyExtraction.standard_solution_draft);
const joinedBlocks = blocks.map((block) => block.text).join("\n");

assert.equal(displayText.includes("即$\\ln a"), false);
assert.equal(joinedBlocks.includes("**(1)**"), false);
assert.equal(joinedBlocks.includes("\n- 当"), false);
assert.equal(joinedBlocks.includes("(1) 求导得"), true);

console.log("demo smoke test passed");
```

- [ ] **Step 2: Run smoke command**

Run:

```bash
npm run test:smoke
```

Expected after Task 1 and Task 2: both scripts print:

```text
api smoke test passed
demo smoke test passed
```

- [ ] **Step 3: Fix display normalization only if smoke exposes a real residue**

If `scripts/demo-smoke.test.mjs` fails because `createStandardSolutionDisplayText()` still returns `即$\\ln a`, first add this regression to `scripts/diagnosis-view-model.test.mjs`:

```js
assert.equal(
  createStandardSolutionDisplayText("由条件得 0<a<1，即$\\ln a<0$。"),
  "由条件得 $0<a<1$，即 $\\ln a<0$。",
);
```

Then make the smallest display-layer fix in `src/lib/diagnosis-view-model.ts`: insert one space before inline `$...$` only when the previous character is Chinese, ASCII alphanumeric, or a closing bracket. Do not change diagnosis evidence, profile persistence, or API behavior.

- [ ] **Step 4: Remove duplication if exact assertions are already covered elsewhere**

Before finalizing, compare `scripts/demo-smoke.test.mjs` with:

```text
scripts/eval-harness.test.mjs
scripts/image-diagnosis-pipeline.test.mjs
scripts/diagnosis-view-model.test.mjs
```

Keep only contract-level assertions in smoke. Do not copy every eval assertion into smoke. The smoke test should answer: “Can the core demo still run end to end?” Eval should answer: “Are evidence policy branches correct in detail?”

---

### Task 3: Browser Demo Checklist

**Files:**
- Create: `docs/demo-smoke-checklist.md`

- [ ] **Step 1: Create manual browser checklist**

Create `docs/demo-smoke-checklist.md`:

````md
# MathTrace Demo Smoke Checklist

用途：每次合并影响诊断、图片上传、确认流程、画像写入、公式渲染或工作台 UI 的改动后，用这份清单做一次 3-5 分钟本地浏览器检查。

## 启动

```bash
npm run dev
```

浏览器打开：

```text
http://127.0.0.1:3000/
```

## 必跑自动检查

```bash
npm test
npm run test:eval
npm run lint
npm run build
```

## 主演示路径：样例题

- 首页可加载，无白屏。
- 选择或保持样例题 `sample_derivative_001`。
- 点击开始诊断后能看到完整诊断报告。
- 页面展示：
  - Agent 步骤。
  - 标准解法关键步骤。
  - 错因与知识点标签。
  - 画像变化。
  - 变式练习。
  - 7 天复习计划。
- `sample_diagnosis` 不依赖任何 API Key。

## 图片路径：未配置 provider

- 不配置 `VISION_PROVIDER_API_KEY` 时上传图片。
- 页面显示可恢复错误。
- 可点击切回样例题。
- 不覆盖当前已有样例题报告。
- 不写入长期画像。

## 图片路径：低证据追问

当前浏览器 UI 没有 fake provider 开关；低证据追问的稳定性以 `npm run test:smoke` 和 `npm run test:eval` 覆盖。若本地已配置真实 provider，浏览器只做可达状态核对：

- 学生步骤不清时显示“学生步骤不清，暂不能直接判断具体错因”。
- 题型和常见卡点在同一屏内可见。
- 卡点按钮、自己输入、跳过按钮都可见且不需要左右反复切换。
- 点击“跳过，只记复习关注”后只记录题型/考点关注，不写具体错因。
- 选择卡点或输入一句话后，先生成分析草稿。
- 只有点击“确认写入画像”后才写具体错因。

## 标准解法与公式显示

- 标准解法不截断关键步骤。
- 不出现 Markdown 残留：
  - `**(1)**`
  - 行首孤立 `-`
- 不出现裸露或贴边显示的半截 LaTeX：
  - `即$\ln a`
- 长公式可以阅读，不遮挡后续内容。

## 应急预案

- 如果真实图片模型失败，直接切回样例题路径。
- 如果 dev server 异常，重启 `npm run dev` 后再次打开首页。
- 如果演示现场网络不稳定，不展示真实图片路径，把 P1.5 可信降级作为工程能力讲解。
````

- [ ] **Step 2: Verify checklist has no false promises**

Check every checklist item can be executed with the current product. If “fake provider” cannot be used from the browser without code changes, keep that line as “使用自动 smoke 覆盖，浏览器只核对已有可达状态”，不要暗示演示者能直接在 UI 切换 fake provider。

---

### Task 4: Documentation Sync

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `interview/mathtrace-project-narrative.md`

- [ ] **Step 1: Update PRD**

Add a short P1.6a paragraph near the P1.5 section:

```md
P1.6a 增加 Demo smoke stability guard。它不改变用户功能，只把 `sample_diagnosis`、`image_diagnosis` 识别草稿、`/api/confirm`、P1.5 低证据追问、跳过追问、用户确认写入和标准解法展示残留固化为可复现脚本。`npm run test:smoke` 必须在无 API Key、无网络环境下通过；真实 provider smoke 不纳入本阶段，避免把演示稳定性绑定到外部模型可用性。
```

- [ ] **Step 2: Update Roadmap**

In testing section, add:

````md
P1.6a 增加 `npm run test:smoke`：

```text
npm run test:smoke
  -> sample_diagnosis 主演示路径稳定
  -> /api/diagnose 和 /api/confirm 基础错误响应稳定
  -> 图片识别草稿不包含画像写入字段
  -> problem_only 追问、跳过、提交草稿、确认写入四个动作稳定
  -> 标准解法展示不暴露 Markdown/LaTeX 残留
```
````

In the phase list, place P1.6a after Phase 2.5 / P1.5 and before wrong notebook or RAG:

```md
### Phase 2.6：Demo smoke 稳定性收口

目标：在扩展错题本、RAG 或知识库前，先用脚本和浏览器清单锁住现有演示闭环。

验收：

- `npm run test:smoke`、`npm test`、`npm run test:eval`、`npm run lint`、`npm run build` 通过。
- `docs/demo-smoke-checklist.md` 可指导一次 3-5 分钟浏览器检查。
```

- [ ] **Step 3: Update interview narrative**

Append a new section:

```md
## 12. Demo smoke 稳定性收口

### 当前状态

已完成 P1.6a 本地实现和脚本验证。这个阶段不新增用户功能，而是把样例题主路径、图片识别草稿、`/api/confirm`、低证据追问动作和标准解法展示清洗固化为可复现 smoke。

### 功能价值

这个阶段的价值是防止后续错题本、RAG 或知识库扩展破坏现有演示闭环。它让项目从“能跑一次”变成“每次合并前都知道核心 Demo 有没有坏”。

### 关键设计

新增脚本级 smoke 测试，不调用真实模型，不依赖 API Key。API smoke 关注 Route 和 service contract；demo smoke 关注样例题、图片识别草稿、P1.5 追问状态和公式展示残留。

### 技术决策与取舍

我没有立刻引入 Playwright，因为当前最容易回归的是服务契约和展示文本清洗，Node 脚本能用更低成本覆盖。真实浏览器检查先沉淀为 checklist，等 UI 流程进一步稳定后再考虑 CI 级 E2E。

### 性能收益（如适用）

收益主要是回归效率和演示稳定性：无 API Key、无网络也能在本地快速验证主路径，避免每次靠真实模型上传图片做慢速人工回归。

### 面试官可能怎么问

1. 为什么先做 smoke，而不是继续做新功能？
2. smoke 和 eval harness 有什么区别？
3. 为什么不直接上 Playwright？
4. 这些测试怎么防止模型污染画像？
5. 未来做 RAG 后这层 smoke 还有用吗？

### 推荐回答

P1.5 做完后，系统的关键风险已经不是“缺一个功能”，而是后续功能很容易改坏证据边界和演示路径。所以我先补了 smoke guard：eval 继续验证策略细节，smoke 验证 Demo 主路径能不能跑通。

我暂时没有引入 Playwright，因为这会增加依赖和维护成本。当前阶段先用 Node 脚本锁 API contract、service contract 和展示文本，再用手动 checklist 做浏览器视觉确认。

### 项目中的真实证据

- 代码：
  - `scripts/api-smoke.test.mjs`
  - `scripts/demo-smoke.test.mjs`
- 文档：
  - `docs/demo-smoke-checklist.md`
- 验证：
  - `npm run test:smoke`
  - `npm test`
  - `npm run test:eval`
  - `npm run lint`
  - `npm run build`
```

After implementation, make sure this section reflects the actual completed status and commands run.

---

### Task 5: Final Verification And Review Prompt

**Files:**
- No code files unless earlier tasks require corrections.

- [ ] **Step 1: Run targeted smoke**

Run:

```bash
npm run test:smoke
```

Expected:

```text
api smoke test passed
demo smoke test passed
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
npm run test:eval
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 3: Browser verification**

Run:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000/
```

Use `docs/demo-smoke-checklist.md` to verify:

- sample diagnosis main path.
- image provider recoverable error if no API Key.
- standard solution display has no Markdown/LaTeX residue.

- [ ] **Step 4: Prepare Claude Code review prompt in chat**

Do not write the prompt into `docs/reviews/*.md`. Provide it directly in the conversation:

```text
请审查 learning-assistant 的 P1.6a Demo smoke 稳定性收口改动。

分支：codex/p16-demo-smoke-stability
范围：
- 新增 API smoke / demo smoke 脚本
- 新增 demo smoke checklist
- package.json 增加 test:smoke
- 标准解法 inline math 贴边显示的最小展示层修复
- PRD / Roadmap / interview 叙事同步

重点关注：
1. smoke 是否真正覆盖 sample_diagnosis、image_diagnosis 草稿、/api/confirm、problem_only 追问、skip、submit、confirm 四类核心路径。
2. 是否误调用真实 provider、依赖 API Key 或网络。
3. 是否和 test:eval 大量重复，导致维护成本过高。
4. `src/lib/diagnosis-view-model.ts` 的展示层修复是否足够窄，是否会误改公式渲染或诊断行为。
5. package.json 脚本是否会造成递归或漏跑。
6. 文档是否准确，没有夸大已实现能力。

已运行验证：
- npm run test:smoke
- npm test
- npm run test:eval
- npm run lint
- npm run build

请按严重程度列 findings，并强制列出测试缺口。
```

- [ ] **Step 5: Review, fix, retest**

After Claude Code review:

- Fix confirmed issues only.
- Do not stage `docs/reviews/*.md`.
- Rerun the impacted test first.
- Rerun:

```bash
npm test
npm run test:eval
npm run lint
npm run build
```

- [ ] **Step 6: Commit scope check**

Before commit, show:

```bash
git status --short
```

Expected staged/commit candidates:

```text
M package.json
A scripts/api-smoke.test.mjs
A scripts/demo-smoke.test.mjs
A docs/superpowers/plans/2026-06-10-p16-demo-smoke-stability.md
A docs/demo-smoke-checklist.md
M src/lib/diagnosis-view-model.ts
M scripts/diagnosis-view-model.test.mjs
M docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md
M docs/TECHNICAL_ROADMAP.md
M interview/mathtrace-project-narrative.md
```

Do not stage:

```text
docs/reviews/*.md
.env*
```

Commit command:

```bash
git add package.json scripts/api-smoke.test.mjs scripts/demo-smoke.test.mjs docs/superpowers/plans/2026-06-10-p16-demo-smoke-stability.md docs/demo-smoke-checklist.md src/lib/diagnosis-view-model.ts scripts/diagnosis-view-model.test.mjs docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
git commit -m "test: add demo smoke stability guard"
```

---

## 3. Acceptance Checklist

- [ ] `scripts/api-smoke.test.mjs` exists and passes without API Key.
- [ ] `scripts/demo-smoke.test.mjs` exists and passes without API Key.
- [ ] `npm run test:smoke` exists.
- [ ] `npm test` includes smoke or the final note explicitly explains why smoke remains separate.
- [ ] `npm run test:eval` still passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `docs/demo-smoke-checklist.md` exists.
- [ ] PRD documents P1.6a.
- [ ] Roadmap documents `npm run test:smoke`.
- [ ] Interview narrative has a P1.6a section.
- [ ] Inline math 贴边显示有单测覆盖并通过。
- [ ] No real provider calls are required for smoke.
- [ ] No diagnosis strategy, API contract, localStorage schema, or profile persistence behavior changes are included.
- [ ] `docs/reviews/*.md` remains local-only and uncommitted.
