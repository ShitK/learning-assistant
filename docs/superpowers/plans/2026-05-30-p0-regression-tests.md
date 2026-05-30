# P0 Regression Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补强 P0 `/api/diagnose` 和确定性 Agent Pipeline 的回归测试，锁住样例题、错误分支和画像更新边界。

**Architecture:** 继续使用现有 `scripts/agent-pipeline.test.mjs` 作为轻量 Node smoke 测试入口，通过 `jiti` 加载 TypeScript 模块。测试只调用现有 pipeline 函数和 API Route，不新增测试框架、不改变 API 契约、不改前端。

**Tech Stack:** Node.js `node:assert/strict`、`jiti`、Next.js Route Handler、TypeScript。

---

## 改动边界

- 修改：`scripts/agent-pipeline.test.mjs`
- 可选修改：`src/lib/mathtrace-agent-pipeline.ts`，仅当新增测试暴露真实边界问题时做最小修复
- 不修改：前端组件、API 响应字段、样例题数据、PRD
- 不处理：未跟踪的 `docs/reviews/2026-05-30-agent-pipeline-service-review.md`

## 验收方式

- `node scripts/agent-pipeline.test.mjs`
- `npm run lint`
- `npm run build`
- `/api/diagnose` sample smoke 返回 200 且 `fallback_used=false`
- `/api/diagnose` image smoke 返回 400 且 `error.code=image_diagnosis_p1`

---

### Task 1: 扩展 Pipeline 样例题覆盖

**Files:**
- Modify: `scripts/agent-pipeline.test.mjs`

- [ ] **Step 1: 写失败测试**

把单一样例断言改成遍历 `sampleDiagnoses`，并断言每道样例都经过完整 pipeline 后保持核心契约：

```js
for (const sample of sampleDiagnoses) {
  const request = createSampleRequest(sample.id);
  const response = runMathTraceAgent(request);

  assert.equal(response.diagnosis_id, `diag_${sample.id}`);
  assert.equal(response.source, "sample");
  assert.equal(response.fallback_used, false);
  assert.deepEqual(response.knowledge_mapping.knowledge_points, sample.knowledge_points);
  assert.deepEqual(response.mistake_diagnosis.mistake_causes, sample.mistake_causes);
  assert.equal(response.practice_questions.length, 3);
  assert.equal(response.review_plan.seven_days.length, 7);
  assert.equal(response.sample_diagnosis.id, sample.id);
}
```

- [ ] **Step 2: 运行测试确认失败或覆盖缺口暴露**

Run: `node scripts/agent-pipeline.test.mjs`

Expected: 如果脚本还没有遍历三道样例，先看到新增断言覆盖当前缺口；若现有实现已经满足，测试通过也可接受，因为这是纯回归覆盖扩展。

- [ ] **Step 3: 最小整理测试脚本**

增加 `createSampleRequest(sampleQuestionId)` helper，避免复制请求体；保持 `unknown` 输入由现有 route/parser 处理。

```js
function createSampleRequest(sampleQuestionId, overrides = {}) {
  return {
    student_id: "demo_student_001",
    task_type: "sample_diagnosis",
    sample_question_id: sampleQuestionId,
    image_base64: null,
    student_profile: demoStudentProfile,
    mistake_history: [],
    ...overrides,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node scripts/agent-pipeline.test.mjs`

Expected: `agent pipeline regression test passed`

---

### Task 2: 补 API Route 错误分支覆盖

**Files:**
- Modify: `scripts/agent-pipeline.test.mjs`

- [ ] **Step 1: 写 Route helper 和错误断言**

新增 `postDiagnoseJson`、`postDiagnoseRaw`、`assertDiagnoseError`，覆盖 Route 层而不是只测 parser：

```js
async function postDiagnoseJson(body) {
  return POST(
    new Request("http://localhost/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function postDiagnoseRaw(body) {
  return POST(
    new Request("http://localhost/api/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
  );
}

async function assertDiagnoseError(responsePromise, expectedStatus, expectedCode) {
  const response = await responsePromise;
  const responseBody = await response.json();

  assert.equal(response.status, expectedStatus);
  assert.equal(responseBody.error.code, expectedCode);
  assert.equal(responseBody.error.recoverable, true);
  assert.equal(responseBody.fallback_used, false);
}
```

- [ ] **Step 2: 覆盖 P0 关键错误路径**

新增断言：

```js
await assertDiagnoseError(postDiagnoseRaw("{"), 400, "invalid_json");
await assertDiagnoseError(postDiagnoseJson(null), 400, "invalid_request");
await assertDiagnoseError(
  postDiagnoseJson(createSampleRequest("sample_derivative_001", { task_type: "unsupported_task" })),
  400,
  "invalid_request",
);
await assertDiagnoseError(
  postDiagnoseJson(createSampleRequest("sample_derivative_001", { sample_question_id: null })),
  400,
  "missing_sample_question_id",
);
await assertDiagnoseError(
  postDiagnoseJson(createSampleRequest("sample_derivative_001", { image_base64: 123 })),
  400,
  "invalid_request",
);
await assertDiagnoseError(
  postDiagnoseJson({
    ...createSampleRequest("sample_derivative_001"),
    task_type: "image_diagnosis",
    sample_question_id: null,
  }),
  400,
  "image_diagnosis_p1",
);
```

- [ ] **Step 3: 运行测试确认通过**

Run: `node scripts/agent-pipeline.test.mjs`

Expected: `agent pipeline regression test passed`

---

### Task 3: 补画像边界覆盖

**Files:**
- Modify: `scripts/agent-pipeline.test.mjs`
- Optional Modify: `src/lib/mathtrace-agent-pipeline.ts`

- [ ] **Step 1: 写画像 fallback 和 clamp 断言**

新增测试：非法 `student_profile` 应回退到 `demoStudentProfile`；掌握度增量应 clamp 到 `0-100`；错因频次不能低于 0；`review_priority` 去重且 delta 项排在前面。

```js
const fallbackProfileResponse = runMathTraceAgent(
  createSampleRequest("sample_derivative_001", {
    student_profile: "bad-profile",
  }),
);
assert.equal(
  fallbackProfileResponse.student_profile.mastery_scores.parameter_classification,
  38,
);

const boundaryProfileResponse = runMathTraceAgent(
  createSampleRequest("sample_derivative_001", {
    student_profile: {
      ...demoStudentProfile,
      mastery_scores: {
        parameter_classification: 3,
        derivative_monotonicity: 101,
      },
      frequent_mistake_causes: {
        classification_missing: 0,
        domain_missing: 0,
      },
      review_priority: ["derivative_monotonicity", "function_domain"],
    },
  }),
);

assert.equal(
  boundaryProfileResponse.student_profile.mastery_scores.parameter_classification,
  0,
);
assert.equal(
  boundaryProfileResponse.student_profile.mastery_scores.derivative_monotonicity,
  96,
);
assert.equal(
  boundaryProfileResponse.student_profile.frequent_mistake_causes.classification_missing,
  1,
);
assert.deepEqual(boundaryProfileResponse.student_profile.review_priority, [
  "parameter_classification",
  "derivative_monotonicity",
  "function_domain",
]);
```

- [ ] **Step 2: 运行测试确认失败点**

Run: `node scripts/agent-pipeline.test.mjs`

Expected: 如果现有实现已处理这些边界则通过；如果失败，只修对应边界，不扩展新功能。

- [ ] **Step 3: 必要时最小修复生产代码**

仅当 Step 2 暴露真实失败时修改 `applyMemoryDeltaToProfile` 或 profile 校验 helper。不得改变响应契约。

- [ ] **Step 4: 运行测试确认通过**

Run: `node scripts/agent-pipeline.test.mjs`

Expected: `agent pipeline regression test passed`

---

### Task 4: 全量验证和提交

**Files:**
- Modify: `scripts/agent-pipeline.test.mjs`
- Create: `docs/superpowers/plans/2026-05-30-p0-regression-tests.md`
- Optional Modify: `src/lib/mathtrace-agent-pipeline.ts`

- [ ] **Step 1: 运行脚本测试**

Run: `node scripts/agent-pipeline.test.mjs`

Expected: `agent pipeline regression test passed`

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`

Expected: exit code 0

- [ ] **Step 3: 运行 build**

Run: `npm run build`

Expected: exit code 0

- [ ] **Step 4: 做 `/api/diagnose` smoke test**

启动 dev server 后分别请求：

```bash
curl -s -X POST http://127.0.0.1:3000/api/diagnose \
  -H 'Content-Type: application/json' \
  -d '{"student_id":"demo_student_001","task_type":"sample_diagnosis","sample_question_id":"sample_derivative_001","image_base64":null,"student_profile":null,"mistake_history":[]}'
```

Expected: HTTP 200，响应中 `source="sample"`、`fallback_used=false`。

```bash
curl -s -X POST http://127.0.0.1:3000/api/diagnose \
  -H 'Content-Type: application/json' \
  -d '{"student_id":"demo_student_001","task_type":"image_diagnosis","sample_question_id":null,"image_base64":null,"student_profile":null,"mistake_history":[]}'
```

Expected: HTTP 400，响应中 `error.code="image_diagnosis_p1"`。

- [ ] **Step 5: 提交并推送分支**

```bash
git add docs/superpowers/plans/2026-05-30-p0-regression-tests.md scripts/agent-pipeline.test.mjs
git commit -m "test: add P0 diagnose regression coverage"
git push -u origin codex/p0-regression-tests
```

Expected: GitHub 上出现分支，可创建中文 PR。

