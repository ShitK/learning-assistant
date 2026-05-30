# Agent Pipeline Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `/api/diagnose` 的 P0 `sample_diagnosis` 路径经过确定性的后端 Agent Pipeline Service，而不是在 API Route 中直接拼 mock 响应。

**Architecture:** 新增一个轻量 TypeScript pipeline 模块，按 `planTask -> recognizeQuestion -> retrieveKnowledgeContext -> mapKnowledgePoints -> diagnoseMistake -> computeMemoryDelta -> generatePractice -> planReview -> buildDiagnoseResponse` 顺序组织样例题诊断。预标注样例数据仍是 P0 的事实来源，pipeline 只负责清晰拆分后端诊断流程并保持现有响应契约不变。

**Tech Stack:** Next.js App Router Route Handler, TypeScript, 内置 mock 数据, Node smoke test, no Kimi, no database, no LangGraph/OpenAI Agents SDK/Vercel AI SDK.

---

## Assumptions

- P0 只支持 `task_type="sample_diagnosis"` 的正式演示路径。
- `task_type="image_diagnosis"` 继续返回 P1 可恢复提示，不进入 pipeline。
- 前端当前依赖 `sample_diagnosis` 兼容字段渲染，本次不改前端展示结构。
- 本地 `main` ahead 1 的 `docs/TECHNICAL_ROADMAP.md` 只作为已读背景，不进入本分支和 PR。
- P0 的 `memory_delta` 仍使用样例题预标注结果，再由后端规则合并到传入的 `student_profile`。

## Boundaries

- 不引入 Kimi、数据库、RAG、老师端、登录、支付或新 Agent 框架。
- 不修改 API 成功响应字段名、错误码语义或前端请求体。
- 不新增 `/api/confirm`、SSE、多接口串行 Agent 或真实图片识别。
- 不做无关重构；只移动由本次 pipeline 接管后自然失去调用者的响应构建逻辑。

## Acceptance

- `sample_diagnosis` 请求仍返回 200、`fallback_used=false`、`source="sample"`、`steps`、`recognized_question`、`knowledge_mapping`、`mistake_diagnosis`、`memory_delta`、`student_profile`、`practice_questions`、`review_plan` 和 `sample_diagnosis`。
- `image_diagnosis` 仍返回 400，错误码为 `image_diagnosis_p1`。
- 新增 pipeline smoke test 先失败，再通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- 本地启动后 `/api/diagnose` smoke test 通过。
- PRD 已检查并同步 P0 pipeline 模块边界说明。

---

### Task 1: Add Failing Pipeline Smoke Test

**Files:**
- Create: `scripts/agent-pipeline.test.mjs`

- [ ] **Step 1: Create a Node smoke test that imports the future pipeline module**

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  planTask,
  recognizeQuestion,
  retrieveKnowledgeContext,
  mapKnowledgePoints,
  diagnoseMistake,
  computeMemoryDelta,
  generatePractice,
  planReview,
  buildDiagnoseResponse,
  runMathTraceAgent,
} = jiti("../src/lib/mathtrace-agent-pipeline.ts");

const { demoStudentProfile, sampleDiagnoses } = jiti(
  "../src/data/mathtrace-demo.ts",
);

const request = {
  student_id: "demo_student_001",
  task_type: "sample_diagnosis",
  sample_question_id: "sample_derivative_001",
  image_base64: null,
  student_profile: demoStudentProfile,
  mistake_history: [],
};

const sample = sampleDiagnoses.find(
  (item) => item.id === request.sample_question_id,
);

assert.ok(sample, "sample fixture should exist");

const plan = planTask(request);
assert.deepEqual(plan.stage_ids, [
  "task_planning",
  "question_recognition",
  "knowledge_retrieval",
  "knowledge_mapping",
  "mistake_diagnosis",
  "memory_delta",
  "practice_generation",
  "review_planning",
  "response_building",
]);

const recognizedQuestion = recognizeQuestion(plan);
assert.equal(recognizedQuestion.id, sample.id);
assert.equal(recognizedQuestion.question_text, sample.question_text);

const knowledgeContext = retrieveKnowledgeContext(recognizedQuestion);
assert.deepEqual(
  knowledgeContext.knowledge_points.map((item) => item.id),
  sample.knowledge_points,
);

const knowledgeMapping = mapKnowledgePoints(
  recognizedQuestion,
  knowledgeContext,
);
assert.deepEqual(knowledgeMapping.knowledge_points, sample.knowledge_points);
assert.equal(knowledgeMapping.difficulty, sample.difficulty);

const mistakeDiagnosis = diagnoseMistake(
  recognizedQuestion,
  knowledgeMapping,
  knowledgeContext,
);
assert.deepEqual(mistakeDiagnosis.mistake_causes, sample.mistake_causes);

const memoryDelta = computeMemoryDelta(mistakeDiagnosis, knowledgeContext);
assert.deepEqual(memoryDelta, sample.memory_delta);

const practiceQuestions = generatePractice(mistakeDiagnosis, knowledgeContext);
assert.equal(practiceQuestions.length, 3);

const reviewPlan = planReview(memoryDelta, knowledgeContext);
assert.equal(reviewPlan.seven_days.length, 7);

const manualResponse = buildDiagnoseResponse({
  request,
  recognizedQuestion,
  knowledgeMapping,
  mistakeDiagnosis,
  memoryDelta,
  practiceQuestions,
  reviewPlan,
  sample: knowledgeContext.sample,
});
const pipelineResponse = runMathTraceAgent(request);

assert.deepEqual(manualResponse, pipelineResponse);
assert.equal(pipelineResponse.diagnosis_id, "diag_sample_derivative_001");
assert.equal(pipelineResponse.source, "sample");
assert.equal(pipelineResponse.fallback_used, false);
assert.equal(pipelineResponse.warnings.length, 0);
assert.equal(
  pipelineResponse.student_profile.mastery_scores.parameter_classification,
  38,
);
assert.equal(
  pipelineResponse.student_profile.frequent_mistake_causes
    .classification_missing,
  5,
);
assert.equal(pipelineResponse.sample_diagnosis.id, sample.id);

console.log("agent pipeline smoke test passed");
```

- [ ] **Step 2: Run the smoke test and verify it fails for the expected reason**

Run:

```bash
node scripts/agent-pipeline.test.mjs
```

Expected:

```text
Cannot find module '../src/lib/mathtrace-agent-pipeline.ts'
```

### Task 2: Implement Pipeline Module

**Files:**
- Create: `src/lib/mathtrace-agent-pipeline.ts`
- Modify: `src/lib/diagnose-api.ts`

- [ ] **Step 1: Add pipeline exports and focused internal types**

Create named exports:

```ts
export function planTask(request: ParsedSampleDiagnoseRequest): AgentTaskPlan;
export function recognizeQuestion(plan: AgentTaskPlan): RecognizedQuestion;
export function retrieveKnowledgeContext(
  recognizedQuestion: RecognizedQuestion,
): KnowledgeContext;
export function mapKnowledgePoints(
  recognizedQuestion: RecognizedQuestion,
  knowledgeContext: KnowledgeContext,
): KnowledgeMapping;
export function diagnoseMistake(
  recognizedQuestion: RecognizedQuestion,
  knowledgeMapping: KnowledgeMapping,
  knowledgeContext: KnowledgeContext,
): MistakeDiagnosis;
export function computeMemoryDelta(
  mistakeDiagnosis: MistakeDiagnosis,
  knowledgeContext: KnowledgeContext,
): MemoryDelta;
export function generatePractice(
  mistakeDiagnosis: MistakeDiagnosis,
  knowledgeContext: KnowledgeContext,
): PracticeQuestion[];
export function planReview(
  memoryDelta: MemoryDelta,
  knowledgeContext: KnowledgeContext,
): ReviewPlan;
export function buildDiagnoseResponse(
  input: BuildDiagnoseResponseInput,
): DiagnoseSuccessResponse;
export function runMathTraceAgent(
  request: ParsedSampleDiagnoseRequest,
): DiagnoseSuccessResponse;
```

- [ ] **Step 2: Move response assembly into `buildDiagnoseResponse`**

Use the same field values currently produced by `buildSampleDiagnoseResponse`, including:

```ts
{
  diagnosis_id: `diag_${sample.id}`,
  student_id: request.student_id,
  source: "sample",
  steps: sample.steps,
  recognized_question: recognizedQuestion,
  knowledge_mapping: knowledgeMapping,
  mistake_diagnosis: mistakeDiagnosis,
  memory_delta: memoryDelta,
  student_profile: updatedStudentProfile,
  practice_questions: practiceQuestions,
  review_plan: reviewPlan,
  sample_diagnosis: sample,
  fallback_used: false,
  warnings: [],
}
```

- [ ] **Step 3: Keep profile merge deterministic**

Private helpers in the pipeline module:

```ts
function applyMemoryDeltaToProfile(
  profile: StudentProfile,
  memoryDelta: MemoryDelta,
): StudentProfile;

function isStudentProfile(value: unknown): value is StudentProfile;
```

The helper keeps existing behavior:

- invalid `student_profile` falls back to `demoStudentProfile`
- score changes are clamped with `clampScore`
- mistake cause counts never go below 0
- `review_priority` keeps new priorities first and removes duplicates
- `updated_at` stays `2026-05-29T22:00:00+08:00`

- [ ] **Step 4: Remove response-building code from `diagnose-api.ts`**

`src/lib/diagnose-api.ts` should keep request parsing, response types, success type guard, and error builder. Remove the now-unused `buildSampleDiagnoseResponse`, `getSampleDiagnosisById`, `applyMemoryDeltaToProfile`, and `isStudentProfile` from this file unless a remaining caller requires them.

- [ ] **Step 5: Run the smoke test and verify it passes**

Run:

```bash
node scripts/agent-pipeline.test.mjs
```

Expected:

```text
agent pipeline smoke test passed
```

### Task 3: Route `/api/diagnose` Through Pipeline

**Files:**
- Modify: `src/app/api/diagnose/route.ts`

- [ ] **Step 1: Replace direct mock response assembly**

Route flow after parsing:

```ts
if (parsedRequest.value.task_type === "image_diagnosis") {
  return NextResponse.json(
    createDiagnoseError(
      "image_diagnosis_p1",
      "图片诊断属于 P1，P0 演示请先选择内置样例题。",
      true,
    ),
    { status: 400 },
  );
}

return NextResponse.json(runMathTraceAgent(parsedRequest.value));
```

- [ ] **Step 2: Run the pipeline smoke test**

Run:

```bash
node scripts/agent-pipeline.test.mjs
```

Expected:

```text
agent pipeline smoke test passed
```

### Task 4: Update PRD Pipeline Note

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`

- [ ] **Step 1: Document the P0 deterministic backend pipeline**

Add a short note near the MVP execution strategy or Diagnose API contract:

```text
P0 `sample_diagnosis` 后端实现应走确定性的 TypeScript Pipeline Service：
planTask -> recognizeQuestion -> retrieveKnowledgeContext -> mapKnowledgePoints
-> diagnoseMistake -> computeMemoryDelta -> generatePractice -> planReview
-> buildDiagnoseResponse。
每一步使用内置样例题、知识点和错因标签数据，不调用 Kimi，不写数据库，并保持
`/api/diagnose` 响应契约不变。
```

- [ ] **Step 2: Verify the PRD does not require README, DOMAIN, ARCHITECTURE, or ADR updates**

Expected:

- README 不需要更新：启动方式和命令不变。
- DOMAIN 不需要新增：业务规则仍来自现有 PRD。
- ARCHITECTURE 不需要新增：本次是 P0 内部模块拆分，PRD 已覆盖。
- ADR 不需要新增：技术取舍已在 PRD 和 roadmap 中记录，本次不引入长期框架决策。

### Task 5: Final Verification, Commit, Push, PR

**Files:**
- No additional source files expected.

- [ ] **Step 1: Run lint**

Run:

```bash
npm run lint
```

Expected: exit code 0.

- [ ] **Step 2: Run build**

Run:

```bash
npm run build
```

Expected: exit code 0, and `/api/diagnose` appears in the build output.

- [ ] **Step 3: Start local server for API smoke test**

Run:

```bash
npm run dev
```

Expected: local Next dev server starts on an available port.

- [ ] **Step 4: Smoke test `sample_diagnosis`**

Run:

```bash
curl -s -X POST http://localhost:3000/api/diagnose \
  -H 'Content-Type: application/json' \
  -d '{"student_id":"demo_student_001","task_type":"sample_diagnosis","sample_question_id":"sample_derivative_001","image_base64":null,"student_profile":{},"mistake_history":[]}'
```

Expected response fields:

```json
{
  "diagnosis_id": "diag_sample_derivative_001",
  "student_id": "demo_student_001",
  "source": "sample",
  "fallback_used": false,
  "warnings": []
}
```

- [ ] **Step 5: Smoke test `image_diagnosis` remains P1**

Run:

```bash
curl -s -X POST http://localhost:3000/api/diagnose \
  -H 'Content-Type: application/json' \
  -d '{"student_id":"demo_student_001","task_type":"image_diagnosis","sample_question_id":null,"image_base64":null,"student_profile":{},"mistake_history":[]}'
```

Expected response fields:

```json
{
  "error": {
    "code": "image_diagnosis_p1",
    "recoverable": true
  },
  "fallback_used": false,
  "warnings": []
}
```

- [ ] **Step 6: Review git diff**

Run:

```bash
git diff --stat
git diff -- src/lib/diagnose-api.ts src/lib/mathtrace-agent-pipeline.ts src/app/api/diagnose/route.ts docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md scripts/agent-pipeline.test.mjs
```

Expected: no unrelated frontend changes and no `docs/TECHNICAL_ROADMAP.md` in the diff.

- [ ] **Step 7: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-05-30-agent-pipeline-service.md scripts/agent-pipeline.test.mjs src/lib/mathtrace-agent-pipeline.ts src/lib/diagnose-api.ts src/app/api/diagnose/route.ts docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md
git commit -m "feat: add MathTrace agent pipeline service"
```

- [ ] **Step 8: Push branch**

Run:

```bash
git push -u origin codex/agent-pipeline-service
```

- [ ] **Step 9: Create PR in Chinese**

Run:

```bash
gh pr create \
  --title "实现 P0 诊断 Agent Pipeline Service" \
  --body "## 变更内容
- 新增确定性的 MathTrace Agent Pipeline Service
- 让 /api/diagnose 的 sample_diagnosis 路径经过 planTask 到 buildDiagnoseResponse 的后端流程
- 保持现有 API 响应契约和 image_diagnosis P1 提示不变
- 补充 pipeline smoke test 和 PRD 说明

## 验证
- node scripts/agent-pipeline.test.mjs
- npm run lint
- npm run build
- /api/diagnose sample_diagnosis smoke test
- /api/diagnose image_diagnosis P1 smoke test"
```
