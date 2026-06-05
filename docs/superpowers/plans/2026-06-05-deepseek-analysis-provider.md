# DeepSeek Analysis Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GLM 继续负责图片识别，DeepSeek `deepseek-v4-flash` 只在用户确认识别结果后增强文本分析，且不能写入长期画像字段。

**Architecture:** 新增服务端 `ANALYSIS_PROVIDER_*` 配置和 OpenAI-compatible text provider。`/api/diagnose` 不变；`/api/confirm` 在解析确认草稿后可选调用分析 provider，再把安全的展示型分析结果传入 `runImageMathTraceAgent`。`memory_delta`、`student_profile`、`mistake_history`、知识点映射和画像持久化仍由本地确定性代码控制。

**Tech Stack:** Next.js App Router, TypeScript, Node fetch, OpenAI-compatible `/chat/completions`, DeepSeek JSON Output, existing script tests.

---

## Assumptions

- DeepSeek 使用 OpenAI-compatible base URL `https://api.deepseek.com` 和模型 `deepseek-v4-flash`。
- DeepSeek 只处理确认后的文本，不接收图片 base64。
- 分析 provider 未配置、超时、HTTP 失败或 JSON 不合规时，确认流程仍返回 200 并回退到当前本地规则分析。
- DeepSeek 输出中出现 `memory_delta`、`student_profile`、`mistake_history` 等越权字段时必须拒绝该 provider 结果并回退。
- `.env.local` 可以配置真实 API Key，但不得提交、打印或写入文档。

## Files

- Create: `src/lib/analysis-provider.ts`
- Modify: `src/lib/confirm-service.ts`
- Modify: `src/lib/image-diagnosis-pipeline.ts`
- Modify: `src/lib/diagnose-api.ts` only if type boundaries need exposing
- Test: `scripts/analysis-provider.test.mjs`
- Test: `scripts/image-confirmation.test.mjs`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `interview/mathtrace-project-narrative.md`

## Tasks

### Task 1: Analysis Provider Boundary

**Files:**
- Create: `src/lib/analysis-provider.ts`
- Test: `scripts/analysis-provider.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing provider tests**

Add `scripts/analysis-provider.test.mjs` covering:

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  createAnalysisProvider,
  createAnalysisProviderConfigFromEnv,
  parseAnalysisProviderOutput,
} = jiti("../src/lib/analysis-provider.ts");

assert.equal(
  createAnalysisProviderConfigFromEnv({}).ok,
  false,
);

const configResult = createAnalysisProviderConfigFromEnv({
  ANALYSIS_PROVIDER_PROTOCOL: "openai",
  ANALYSIS_PROVIDER_BASE_URL: "https://api.deepseek.com",
  ANALYSIS_PROVIDER_MODEL: "deepseek-v4-flash",
  ANALYSIS_PROVIDER_API_KEY: "local-secret",
  ANALYSIS_PROVIDER_NAME: "deepseek_v4_flash",
  ANALYSIS_PROVIDER_TIMEOUT_MS: "60000",
});

assert.equal(configResult.ok, true);
assert.equal(configResult.value.model, "deepseek-v4-flash");

const parsed = parseAnalysisProviderOutput(JSON.stringify({
  expected_diagnosis: "主要错在参数分类讨论缺失。",
  step_analysis: ["求导正确", "临界点讨论不完整"],
  solution_highlights: ["先确定定义域", "再分类讨论参数"],
  standard_solution: "令 $f'(x)=0$ 后讨论 $a\\le 0$ 与 $a>0$。",
  warnings: ["由模型生成，需结合确认结果理解。"],
}));

assert.equal(parsed.ok, true);
assert.equal(parsed.value.step_analysis.length, 2);

const forbidden = parseAnalysisProviderOutput(JSON.stringify({
  expected_diagnosis: "越权",
  step_analysis: ["x"],
  solution_highlights: ["x"],
  standard_solution: "x",
  memory_delta: { should_persist: true },
}));

assert.equal(forbidden.ok, false);
```

- [ ] **Step 2: Verify the test fails**

Run: `node scripts/analysis-provider.test.mjs`

Expected: fails because `src/lib/analysis-provider.ts` does not exist.

- [ ] **Step 3: Implement minimal provider**

Create `src/lib/analysis-provider.ts` with:

- `AnalysisProviderConfig`
- `createAnalysisProviderConfigFromEnv(env)`
- `parseAnalysisProviderOutput(text)`
- `createAnalysisProvider(config)`

The request body must use:

```ts
{
  model: config.model,
  messages: [
    { role: "system", content: buildAnalysisSystemPrompt() },
    { role: "user", content: buildAnalysisUserPrompt(input) }
  ],
  response_format: { type: "json_object" },
  stream: false
}
```

The parser must allow only:

- `expected_diagnosis: string`
- `step_analysis: string[]`
- `solution_highlights: string[]`
- `standard_solution: string`
- `warnings?: string[]`

It must reject raw text containing:

- `memory_delta`
- `student_profile`
- `mistake_history`
- `knowledge_mastery_changes`
- `mistake_cause_changes`

- [ ] **Step 4: Verify provider test passes**

Run: `node scripts/analysis-provider.test.mjs`

Expected: PASS.

- [ ] **Step 5: Add script to npm test**

Modify `package.json` so `npm test` runs `node scripts/analysis-provider.test.mjs` before confirmation tests.

### Task 2: Confirm Flow Integration

**Files:**
- Modify: `src/lib/confirm-service.ts`
- Modify: `src/lib/image-diagnosis-pipeline.ts`
- Test: `scripts/image-confirmation.test.mjs`

- [ ] **Step 1: Write failing confirmation tests**

Extend `scripts/image-confirmation.test.mjs` with a fake analysis provider dependency:

```js
const analysisProvider = {
  async analyzeConfirmedExtraction() {
    return {
      ok: true,
      value: {
        expected_diagnosis: "DeepSeek 增强：参数分类讨论缺失。",
        step_analysis: ["DeepSeek 增强步骤 1"],
        solution_highlights: ["DeepSeek 高亮 1"],
        standard_solution: "DeepSeek 标准解法：$f'(x)=0$ 后分类讨论。",
        warnings: ["分析模型结果已纳入报告。"],
      },
    };
  },
};

const enhancedConfirmResult = await handleConfirmRequest(
  { ...validConfirmPayload },
  { analysis_provider: analysisProvider },
);

assert.equal(
  enhancedConfirmResult.body.mistake_diagnosis.expected_diagnosis,
  "DeepSeek 增强：参数分类讨论缺失。",
);
assert.equal(
  enhancedConfirmResult.body.mistake_diagnosis.standard_solution,
  "DeepSeek 标准解法：$f'(x)=0$ 后分类讨论。",
);
assert.equal(enhancedConfirmResult.body.memory_delta.should_persist, true);
```

Add a second fake provider returning `{ ok: false }` and assert the response falls back to the existing local rule output with `status=200`.

- [ ] **Step 2: Verify the test fails**

Run: `node scripts/image-confirmation.test.mjs`

Expected: fails because `handleConfirmRequest` does not accept `analysis_provider`.

- [ ] **Step 3: Implement dependency injection**

Update `handleConfirmRequest(payload, deps?)` to accept:

```ts
deps?: {
  analysis_provider?: AnalysisProvider;
}
```

If no injected provider exists, load one from `ANALYSIS_PROVIDER_*`; if config is missing, continue without analysis provider.

- [ ] **Step 4: Pass analysis result into the pipeline**

Update `runImageMathTraceAgent` input with optional `analysis` and use it only to override display fields in `MistakeDiagnosis`:

- `expected_diagnosis`
- `step_analysis`
- `solution_highlights`
- `standard_solution`

Do not let analysis output affect:

- `knowledge_mapping`
- `mistake_causes`
- `severity`
- `memory_delta`
- `student_profile`
- `practice_questions`
- `review_plan`

- [ ] **Step 5: Verify confirmation tests pass**

Run: `node scripts/image-confirmation.test.mjs`

Expected: PASS.

### Task 3: Documentation and Local Config

**Files:**
- Modify: `.env.local` only locally
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `interview/mathtrace-project-narrative.md`

- [ ] **Step 1: Configure local `.env.local`**

Set `ANALYSIS_PROVIDER_*` locally with the user-provided DeepSeek key. Do not print it. Do not stage `.env.local`.

- [ ] **Step 2: Update README and PRD**

Document:

- GLM FlashX remains `VISION_PROVIDER_*`.
- DeepSeek Flash uses `ANALYSIS_PROVIDER_*`.
- API keys are server-only.
- analysis provider failure falls back to local rules.
- analysis provider cannot write `memory_delta` or student profile.

- [ ] **Step 3: Update Roadmap**

Record the two-model P1 chain:

```text
GLM vision extraction -> user edit/confirm -> DeepSeek text analysis enhancement -> deterministic memory/profile rules
```

- [ ] **Step 4: Update interview narrative**

Add or extend the model-provider stage with:

- Kimi Code timing out on real math OCR but succeeding on text/small image smoke.
- GLM OpenAI-compatible image input needing raw base64 for this provider.
- Parser fallback for missing auxiliary fields after key fields are present.
- Formula rendering lesson: prompt should request `$...$`/`$$...$$`; frontend is only a bounded fallback.
- Standard solution numbering lesson: preserve original markers instead of forcing artificial numbering.
- DeepSeek split: vision and text analysis are separate responsibilities.
- Trust boundary: models propose report text; local deterministic code owns `memory_delta` and long-term profile.

### Task 4: Verification

**Files:** all changed files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node scripts/analysis-provider.test.mjs
node scripts/image-confirmation.test.mjs
```

Expected: both pass.

- [ ] **Step 2: Run full checks**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all pass.

- [ ] **Step 3: Browser visual verification**

Use port 3001, not 3000:

```bash
npm run dev -- --port 3001
```

Open `http://localhost:3001`, check:

- `sample_diagnosis` still loads and produces report.
- `image_diagnosis` still shows extraction review before confirmation.
- confirmed image report uses standard solution markdown/KaTeX formatting without duplicate extraction fields.

- [ ] **Step 4: Commit gate**

Before any commit:

```bash
git status --short
```

Show exact stage scope. Do not stage `.env.local` or `docs/reviews/*.md`.
