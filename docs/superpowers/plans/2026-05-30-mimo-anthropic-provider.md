# MiMo Anthropic Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `/api/diagnose` 的 `image_diagnosis` 分支通过 MiMo 的 Anthropic-compatible 多模态接口完成图片题目抽取，并继续复用 MathTrace 的确定性 Agent Pipeline 生成知识点映射、错因诊断、`memory_delta`、练习和复习计划。

**Architecture:** 新增服务端 provider adapter 层，MiMo 只作为 `VisionExtractionProvider` 的一个实现；模型输出仅允许进入“题目/学生答案/解题步骤抽取”结构，经过 JSON 解析和边界校验后才传给 image pipeline。Route 只负责 HTTP JSON 读写，业务逻辑放在 service/pipeline/parser/provider 模块里，`sample_diagnosis` 保持现有稳定路径不变。

**Tech Stack:** Next.js App Router Route Handler, TypeScript, Anthropic Messages-compatible HTTP adapter, Node `assert` + `jiti` smoke tests, built-in TypeScript type guards, no database, no LangGraph/OpenAI Agents SDK/Vercel AI SDK.

---

## 已确认上下文

- 当前分支：`codex/mimo-anthropic-provider`。
- 当前 P0 正式演示路径是 `sample_diagnosis`，它必须继续返回 `source="sample"`、`fallback_used=false` 和现有 `sample_diagnosis` 兼容字段。
- 当前 `image_diagnosis` 在 `src/app/api/diagnose/route.ts` 中直接返回 `image_diagnosis_p1`，本任务要把它接入真实 AI Agent 流程。
- 当前 pipeline 位于 `src/lib/mathtrace-agent-pipeline.ts`，主要围绕样例题数据工作；新增 image pipeline 时不要破坏已有导出和测试。
- 当前项目没有 Zod 依赖。为避免本任务引入额外安装和锁文件风险，第一版使用明确的 TypeScript 类型守卫和边界校验函数；如果后续统一引入 Zod，再迁移 parser/schema。
- `.env*` 已被 `.gitignore` 忽略。实现时只读取 `.env.local` 中的 `MIMO_API_KEY`，不得输出、提交或写入文档正文。

## 方案取舍

推荐方案：Anthropic-compatible adapter + extraction-only MiMo + deterministic image pipeline。

- MiMo 只输出 `question_text`、`student_answer`、`student_solution_steps`、`standard_solution_draft`、`extraction_confidence` 和 `warnings`。
- 代码负责知识点映射、错因诊断、`memory_delta`、练习和复习计划。
- 好处：满足“模型不能写 memory_delta 或覆盖学生画像”，并为未来 Kimi/DeepSeek 复用同一个 provider interface。
- 代价：首版 image 诊断质量依赖简单规则，先覆盖导数、定义域、数列这几个现有知识库范围；低置信度时不持久化画像。

备选方案 A：让模型直接输出完整诊断。

- 好处：短期看起来更智能。
- 问题：模型会绕过错因标签体系，容易污染 `memory_delta` 和学生画像；也更难测试。
- 结论：不采用。

备选方案 B：直接引入 SDK 或 Agent 框架。

- 好处：少写 HTTP 细节。
- 问题：本任务只需要一个多模态 HTTP 调用，引入 SDK/框架会扩大依赖和抽象面；用户也明确要求不引入 LangGraph、OpenAI Agents SDK、Vercel AI SDK。
- 结论：不采用。

## 假设

- `MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/anthropic` 是 Anthropic-compatible API 根地址；adapter 会请求 `${MIMO_BASE_URL}/v1/messages`。如果 smoke test 证明 MiMo 需要不同 path，只在 provider 的 URL 组装函数中调整。
- MiMo 使用 Anthropic Messages 图片块格式：`{ type: "image", source: { type: "base64", media_type, data } }`。
- MiMo API Key 使用 Anthropic 风格 `x-api-key` 请求头。若 smoke test 证明需要 `Authorization: Bearer`，只在 provider adapter 内部修改，不影响 route 或 pipeline。
- `image_diagnosis` 请求继续使用 JSON body；新增可选 `image_mime_type` 字段。`image_base64` 可是纯 base64，也可是 `data:image/png;base64,...` data URL。
- 首版不实现前端图片上传 UI；工作台上的“图片上传 · P1 即将开放”按钮可以继续保持灰态。本任务的验收以 API image smoke test 为准。

## 改动边界

- 新增 provider/parser/service/image pipeline 和测试文件。
- 修改 `src/lib/diagnose-api.ts` 的请求/响应类型和错误码，保持 sample 成功响应不变。
- 修改 `src/app/api/diagnose/route.ts`，只保留 HTTP 外壳，不放模型调用细节。
- 修改 `src/lib/mathtrace-agent-pipeline.ts` 时只抽出可复用画像合并逻辑或保持现有 sample 导出不变。
- 同步更新 PRD、`docs/TECHNICAL_ROADMAP.md`，必要时更新 `README.md` 的服务端环境变量说明。
- 不引入数据库、登录、老师端、支付、`/api/confirm`、SSE、RAG 或 Agent 框架。
- 不提交 `.env.local`，不记录 API key，不在测试输出中打印图片 base64。
- 忽略现有未跟踪 review 文档，不纳入提交。

## 文件结构

- Create: `src/lib/anthropic-compatible-provider.ts`  
  Anthropic-compatible provider interface、MiMo config 读取、HTTP request、timeout、provider error 类型。
- Create: `src/lib/vision-extraction-parser.ts`  
  模型文本输出的 JSON 解析、结构校验、非法字段拒绝、prompt 构造。
- Create: `src/lib/image-input.ts`  
  `image_base64` / `image_mime_type` 解析、data URL 支持、大小和 MIME 校验。
- Create: `src/lib/image-diagnosis-pipeline.ts`  
  image 识别结果进入确定性 Agent 流程：知识点映射、错因诊断、画像增量、练习、复习计划、response 构建。
- Create: `src/lib/diagnose-service.ts`  
  根据 parsed request 分发 sample/image 路径，并支持测试注入 fake provider。
- Modify: `src/lib/diagnose-api.ts`  
  增加 image 请求字段、image success response、错误码和 response type guard。
- Modify: `src/lib/mathtrace-agent-pipeline.ts`  
  仅在需要共享 `applyMemoryDeltaToProfile` / `isStudentProfile` 时做具名导出，sample path 行为保持不变。
- Modify: `src/app/api/diagnose/route.ts`  
  调用 `handleDiagnoseRequest`，route 内不直接拼 image 逻辑。
- Create: `scripts/vision-extraction-parser.test.mjs`  
  parser JSON 和边界校验测试。
- Create: `scripts/anthropic-compatible-provider.test.mjs`  
  provider 请求格式、timeout、non-OK 和非法 JSON 测试。
- Create: `scripts/image-diagnosis-pipeline.test.mjs`  
  image pipeline success、低置信度、禁止模型写画像测试。
- Modify: `scripts/agent-pipeline.test.mjs`  
  更新 image route 分支期望，不再期待 `image_diagnosis_p1`。
- Modify: `package.json`  
  `npm test` 串起新增 Node tests。
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`  
  同步 MiMo/Anthropic-compatible provider、`MIMO_*`、image path P1 API 契约和错误码。
- Modify: `docs/TECHNICAL_ROADMAP.md`  
  将 Phase 2 从“Kimi-only”更新为 provider adapter + MiMo first。
- Optional Modify: `README.md`  
  记录本地 `.env.local` 需要的变量名，不写真实值。

## 响应契约

Sample 成功响应保持不变：

```json
{
  "source": "sample",
  "fallback_used": false,
  "sample_diagnosis": {}
}
```

Image 成功响应新增：

```json
{
  "diagnosis_id": "diag_image_...",
  "student_id": "demo_student_001",
  "source": "image",
  "steps": [],
  "recognized_question": {
    "id": "image_...",
    "title": "图片识别错题",
    "module": "导数",
    "question_text": "string",
    "student_answer": "string",
    "student_solution_steps": ["string"],
    "extraction_confidence": "high"
  },
  "knowledge_mapping": {
    "knowledge_points": ["derivative_monotonicity"],
    "difficulty": 4
  },
  "mistake_diagnosis": {},
  "memory_delta": {},
  "student_profile": {},
  "practice_questions": [],
  "review_plan": {},
  "sample_diagnosis": null,
  "fallback_used": false,
  "warnings": []
}
```

新增或调整错误码：

- `missing_image`：`image_diagnosis` 未提供图片，HTTP 400，recoverable。
- `invalid_image`：图片不是合法 base64/data URL 或 MIME 不支持，HTTP 400，recoverable。
- `image_too_large`：图片超过服务端限制，HTTP 413，recoverable。
- `model_not_configured`：`MIMO_API_KEY` / base URL / model 缺失，HTTP 400，recoverable。
- `model_timeout`：MiMo 超时，HTTP 502，recoverable，`fallback_used=true`。
- `model_request_failed`：MiMo HTTP 非 2xx 或网络失败，HTTP 502，recoverable，`fallback_used=true`。
- `model_invalid_output`：模型文本不是合法 JSON 或不满足内部 schema，HTTP 502，recoverable，`fallback_used=true`。

## 验收方式

- TDD 顺序：先写 provider / parser / route 错误路径测试，确认失败，再写实现。
- `npm test` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- 本地 `/api/diagnose` sample smoke：返回 200、`source="sample"`、`fallback_used=false`。
- 本地 `/api/diagnose` image smoke：配置 `.env.local` 后返回 200、`source="image"`、`fallback_used=false`；模型失败时返回稳定 recoverable error，不写入画像。
- 文档收口：PRD 和 `TECHNICAL_ROADMAP.md` 覆盖 MiMo first、Anthropic-compatible adapter、P0/P1 边界；若新增 env 说明，README 只写变量名和示例占位符。

---

### Task 1: Parser Red Tests

**Files:**
- Create: `scripts/vision-extraction-parser.test.mjs`

- [ ] **Step 1: 写模型 JSON 解析失败测试**

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  parseVisionExtractionText,
  createVisionExtractionPrompt,
} = jiti("../src/lib/vision-extraction-parser.ts");

const validModelText = JSON.stringify({
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
  student_answer: "$f'(x)=3x^2-3a$，只得到 $x=\\sqrt a$。",
  student_solution_steps: ["求导正确", "临界点遗漏 $-\\sqrt a$"],
  standard_solution_draft: "应讨论 $a\\le 0$ 与 $a>0$ 两类情况。",
  extraction_confidence: "high",
  warnings: [],
});

const parsed = parseVisionExtractionText(validModelText);
assert.equal(parsed.ok, true);
assert.equal(parsed.value.question_text.includes("x^3"), true);
assert.deepEqual(parsed.value.student_solution_steps, [
  "求导正确",
  "临界点遗漏 $-\\sqrt a$",
]);

const invalidJson = parseVisionExtractionText("```json\n{}\n```");
assert.equal(invalidJson.ok, false);
assert.equal(invalidJson.error.code, "model_invalid_output");
assert.equal(invalidJson.error.recoverable, true);

const memoryDeltaAttempt = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: ["步骤"],
    standard_solution_draft: "解法",
    extraction_confidence: "medium",
    warnings: [],
    memory_delta: { should_persist: true },
  }),
);
assert.equal(memoryDeltaAttempt.ok, false);
assert.equal(memoryDeltaAttempt.error.code, "model_invalid_output");

const prompt = createVisionExtractionPrompt({
  student_profile_summary: "demo_student_001，高二数学。",
});
assert.equal(prompt.includes("不要输出 memory_delta"), true);
assert.equal(prompt.includes("合法 JSON"), true);

console.log("vision extraction parser test passed");
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
node scripts/vision-extraction-parser.test.mjs
```

Expected:

```text
Cannot find module '../src/lib/vision-extraction-parser.ts'
```

### Task 2: Parser Implementation

**Files:**
- Create: `src/lib/vision-extraction-parser.ts`

- [ ] **Step 1: 实现模型输出内部类型和解析结果**

```ts
export type ExtractionConfidence = "high" | "medium" | "low";

export interface VisionExtractionDraft {
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  standard_solution_draft: string;
  extraction_confidence: ExtractionConfidence;
  warnings: string[];
}

export interface VisionExtractionParseError {
  code: "model_invalid_output";
  message: string;
  recoverable: true;
}

export type VisionExtractionParseResult =
  | { ok: true; value: VisionExtractionDraft }
  | { ok: false; error: VisionExtractionParseError };
```

- [ ] **Step 2: 实现 `parseVisionExtractionText`**

要求：

- 只接受纯 JSON 对象文本，不接受 Markdown fence。
- 用 `JSON.parse` 得到 `unknown`。
- 校验必填字符串非空。
- `student_solution_steps` 长度为 1-8，每项非空。
- `warnings` 最多 5 条，每项字符串。
- `extraction_confidence` 只能是 `high | medium | low`。
- 若 JSON 顶层包含 `memory_delta`、`student_profile`、`mistake_history`、`knowledge_mastery_changes`、`mistake_cause_changes`，直接返回 `model_invalid_output`。
- 不使用 `any`。

```ts
export function parseVisionExtractionText(
  text: string,
): VisionExtractionParseResult;
```

- [ ] **Step 3: 实现 `createVisionExtractionPrompt`**

```ts
export function createVisionExtractionPrompt(input: {
  student_profile_summary: string;
}): string;
```

Prompt 必须说明：

- 只输出合法 JSON。
- 只做题目、学生答案、解题步骤和标准解法草稿抽取。
- 不输出 `memory_delta`、`student_profile`、错因频次或画像更新。
- 置信度低时使用 `extraction_confidence="low"` 并写入 `warnings`。

- [ ] **Step 4: 运行 parser 测试确认通过**

Run:

```bash
node scripts/vision-extraction-parser.test.mjs
```

Expected:

```text
vision extraction parser test passed
```

### Task 3: Provider Red Tests

**Files:**
- Create: `scripts/anthropic-compatible-provider.test.mjs`

- [ ] **Step 1: 写 provider 请求格式和错误路径测试**

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  createAnthropicCompatibleVisionProvider,
  createMimoProviderConfigFromEnv,
} = jiti("../src/lib/anthropic-compatible-provider.ts");

const calls = [];
const okFetch = async (url, init) => {
  calls.push({ url: String(url), init });

  return new Response(
    JSON.stringify({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            question_text: "题干",
            student_answer: "学生答案",
            student_solution_steps: ["步骤一"],
            standard_solution_draft: "标准解法草稿",
            extraction_confidence: "medium",
            warnings: [],
          }),
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

const provider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "mimo-v2.5",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: okFetch,
});

const result = await provider.extractQuestionFromImage({
  image_base64: "iVBORw0KGgo=",
  mime_type: "image/png",
  student_profile_summary: "demo profile",
});

assert.equal(result.ok, true);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, "https://example.test/anthropic/v1/messages");
assert.equal(calls[0].init.method, "POST");
assert.equal(calls[0].init.headers["x-api-key"], "secret-key-for-test");

const requestBody = JSON.parse(calls[0].init.body);
assert.equal(requestBody.model, "mimo-v2.5");
assert.equal(requestBody.messages[0].content[0].type, "text");
assert.equal(requestBody.messages[0].content[1].type, "image");
assert.equal(
  requestBody.messages[0].content[1].source.media_type,
  "image/png",
);
assert.equal(requestBody.messages[0].content[1].source.data, "iVBORw0KGgo=");

const failedProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "mimo-v2.5",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: async () =>
    new Response(JSON.stringify({ error: "bad" }), { status: 500 }),
});

const failedResult = await failedProvider.extractQuestionFromImage({
  image_base64: "iVBORw0KGgo=",
  mime_type: "image/png",
  student_profile_summary: "demo profile",
});
assert.equal(failedResult.ok, false);
assert.equal(failedResult.error.code, "model_request_failed");
assert.equal(failedResult.error.recoverable, true);
assert.equal(failedResult.error.message.includes("secret-key-for-test"), false);

const missingEnvConfig = createMimoProviderConfigFromEnv({
  MIMO_BASE_URL: "https://token-plan-cn.xiaomimimo.com/anthropic",
  MIMO_MODEL: "mimo-v2.5",
});
assert.equal(missingEnvConfig.ok, false);
assert.equal(missingEnvConfig.error.code, "model_not_configured");

console.log("anthropic compatible provider test passed");
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
node scripts/anthropic-compatible-provider.test.mjs
```

Expected:

```text
Cannot find module '../src/lib/anthropic-compatible-provider.ts'
```

### Task 4: Provider Implementation

**Files:**
- Create: `src/lib/anthropic-compatible-provider.ts`

- [ ] **Step 1: 定义 provider interface 和错误类型**

```ts
import type { VisionExtractionDraft } from "@/lib/vision-extraction-parser";

export interface VisionExtractionInput {
  image_base64: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  student_profile_summary: string;
}

export type VisionProviderErrorCode =
  | "model_not_configured"
  | "model_timeout"
  | "model_request_failed"
  | "model_invalid_output";

export interface VisionProviderError {
  code: VisionProviderErrorCode;
  message: string;
  recoverable: true;
}

export type VisionProviderResult =
  | { ok: true; value: VisionExtractionDraft }
  | { ok: false; error: VisionProviderError };

export interface VisionExtractionProvider {
  extractQuestionFromImage(
    input: VisionExtractionInput,
  ): Promise<VisionProviderResult>;
}
```

- [ ] **Step 2: 实现 `createMimoProviderConfigFromEnv`**

```ts
export interface MimoProviderConfig {
  base_url: string;
  model: string;
  api_key: string;
  timeout_ms: number;
}

export function createMimoProviderConfigFromEnv(
  env: Record<string, string | undefined>,
): { ok: true; value: MimoProviderConfig } | { ok: false; error: VisionProviderError };
```

默认值：

- `base_url`: `env.MIMO_BASE_URL ?? "https://token-plan-cn.xiaomimimo.com/anthropic"`
- `model`: `env.MIMO_MODEL ?? "mimo-v2.5"`
- `timeout_ms`: `15000`
- `api_key`: 必须来自 `env.MIMO_API_KEY`

- [ ] **Step 3: 实现 `createAnthropicCompatibleVisionProvider`**

```ts
export function createAnthropicCompatibleVisionProvider(config: {
  base_url: string;
  model: string;
  api_key: string;
  timeout_ms: number;
  fetch_impl?: typeof fetch;
}): VisionExtractionProvider;
```

实现约束：

- URL 使用 `joinAnthropicMessagesUrl(base_url)`，确保不会产生双斜杠。
- headers 使用 `content-type: application/json`、`x-api-key`、`anthropic-version: 2023-06-01`。
- body 使用 Anthropic Messages 图片 block。
- 使用 `AbortController` 实现 timeout。
- 响应只读取 text block，不信任其他 block。
- 将 text block 交给 `parseVisionExtractionText`。
- 所有错误消息不得包含 API key 或图片 base64。

- [ ] **Step 4: 运行 provider 测试确认通过**

Run:

```bash
node scripts/anthropic-compatible-provider.test.mjs
```

Expected:

```text
anthropic compatible provider test passed
```

### Task 5: Image Input Tests And Implementation

**Files:**
- Create: `src/lib/image-input.ts`
- Modify: `scripts/agent-pipeline.test.mjs`

- [ ] **Step 1: 先在 route 测试中加入 image 输入错误路径**

在 `scripts/agent-pipeline.test.mjs` 增加：

```js
await assertDiagnoseError(
  postDiagnoseJson({
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: null,
    student_profile: demoStudentProfile,
    mistake_history: [],
  }),
  400,
  "missing_image",
);

await assertDiagnoseError(
  postDiagnoseJson({
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "not-base64",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  }),
  400,
  "invalid_image",
);
```

Expected before implementation: still returns `image_diagnosis_p1` or `invalid_request`。

- [ ] **Step 2: 实现 `parseImageInput`**

```ts
export interface ParsedImageInput {
  image_base64: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  byte_size: number;
}

export type ImageInputErrorCode =
  | "missing_image"
  | "invalid_image"
  | "image_too_large";

export function parseImageInput(input: {
  image_base64: string | null;
  image_mime_type: unknown;
  max_bytes: number;
}): { ok: true; value: ParsedImageInput } | { ok: false; error: ImageInputErrorCode };
```

校验规则：

- `image_base64` 为空时返回 `missing_image`。
- 支持 `data:image/png;base64,...`、`data:image/jpeg;base64,...`、`data:image/webp;base64,...`。
- 纯 base64 时必须通过 `image_mime_type` 指定允许 MIME。
- base64 正则只允许合法字符和 padding。
- byte size 用 `Buffer.byteLength(Buffer.from(base64, "base64"))` 计算。
- 默认 `max_bytes=1_000_000`。

- [ ] **Step 3: 扩展 `DiagnoseErrorCode` 和 `ParsedImageDiagnoseRequest`**

`src/lib/diagnose-api.ts` 中让 image request 保留：

```ts
export interface ParsedImageDiagnoseRequest {
  student_id: string;
  task_type: "image_diagnosis";
  sample_question_id: SampleQuestionId | null;
  image_base64: string | null;
  image_mime_type: unknown;
  student_profile: unknown;
  mistake_history: unknown[];
}
```

- [ ] **Step 4: 运行 route 错误路径测试**

Run:

```bash
node scripts/agent-pipeline.test.mjs
```

Expected: image 输入错误路径返回 `missing_image` / `invalid_image`，sample 既有断言仍通过。

### Task 6: Image Pipeline Red Tests

**Files:**
- Create: `scripts/image-diagnosis-pipeline.test.mjs`

- [ ] **Step 1: 写 image pipeline 成功和低置信度测试**

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { runImageMathTraceAgent } = jiti("../src/lib/image-diagnosis-pipeline.ts");
const { demoStudentProfile } = jiti("../src/data/mathtrace-demo.ts");

const request = {
  student_id: "demo_student_001",
  task_type: "image_diagnosis",
  sample_question_id: null,
  image_base64: "iVBORw0KGgo=",
  image_mime_type: "image/png",
  student_profile: demoStudentProfile,
  mistake_history: [],
};

const extraction = {
  question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论 $f(x)$ 的单调性。",
  student_answer: "$f'(x)=3x^2-3a$，令 $f'(x)=0$ 得 $x=\\sqrt a$。",
  student_solution_steps: ["求导正确", "只写出一个临界点", "没有讨论 $a\\le 0$"],
  standard_solution_draft: "应先讨论 $a\\le 0$，再讨论 $a>0$ 时两个临界点。",
  extraction_confidence: "high",
  warnings: [],
};

const response = runImageMathTraceAgent({ request, extraction });

assert.equal(response.source, "image");
assert.equal(response.fallback_used, false);
assert.equal(response.sample_diagnosis, null);
assert.deepEqual(response.knowledge_mapping.knowledge_points, [
  "derivative_monotonicity",
  "parameter_classification",
]);
assert.deepEqual(response.mistake_diagnosis.mistake_causes, [
  "classification_missing",
  "domain_missing",
]);
assert.equal(response.memory_delta.should_persist, true);
assert.equal(
  response.student_profile.frequent_mistake_causes.classification_missing,
  5,
);
assert.equal(response.practice_questions.length, 3);
assert.equal(response.review_plan.seven_days.length, 7);

const lowConfidenceResponse = runImageMathTraceAgent({
  request,
  extraction: {
    ...extraction,
    extraction_confidence: "low",
    warnings: ["图片较模糊，需要学生确认。"],
  },
});

assert.equal(lowConfidenceResponse.memory_delta.should_persist, false);
assert.equal(lowConfidenceResponse.warnings.includes("图片较模糊，需要学生确认。"), true);

console.log("image diagnosis pipeline test passed");
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
node scripts/image-diagnosis-pipeline.test.mjs
```

Expected:

```text
Cannot find module '../src/lib/image-diagnosis-pipeline.ts'
```

### Task 7: Image Pipeline Implementation

**Files:**
- Create: `src/lib/image-diagnosis-pipeline.ts`
- Modify: `src/lib/diagnose-api.ts`
- Modify: `src/lib/mathtrace-agent-pipeline.ts` if shared profile helpers are exported

- [ ] **Step 1: 增加 image success response 类型**

```ts
export interface ImageRecognizedQuestion {
  id: string;
  title: string;
  module: string;
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  extraction_confidence: "high" | "medium" | "low";
}

export interface DiagnoseImageSuccessResponse {
  diagnosis_id: string;
  student_id: string;
  source: "image";
  steps: AgentStep[];
  recognized_question: ImageRecognizedQuestion;
  knowledge_mapping: KnowledgeMapping;
  mistake_diagnosis: MistakeDiagnosis;
  memory_delta: MemoryDelta;
  student_profile: StudentProfile;
  practice_questions: PracticeQuestion[];
  review_plan: ReviewPlan;
  sample_diagnosis: null;
  fallback_used: false;
  warnings: string[];
}
```

`DiagnoseApiResponse` 改为包含 sample success、image success 和 error response。

- [ ] **Step 2: 实现 `runImageMathTraceAgent`**

```ts
import type { ParsedImageDiagnoseRequest } from "@/lib/diagnose-api";
import type { VisionExtractionDraft } from "@/lib/vision-extraction-parser";

export function runImageMathTraceAgent(input: {
  request: ParsedImageDiagnoseRequest;
  extraction: VisionExtractionDraft;
}): DiagnoseImageSuccessResponse;
```

实现规则：

- `recognized_question.id` 使用稳定 hash，例如 `image_${hashText(question_text + student_answer)}`。
- 知识点映射只从现有 `knowledgePoints` 中选择：
  - 包含 `导数`、`f'`、`单调` 时加入 `derivative_monotonicity`。
  - 包含 `参数`、`讨论`、`a\\le`、`a>`、`取值范围` 时加入 `parameter_classification`。
  - 包含 `定义域`、`ln`、`log` 时加入 `function_domain`。
  - 包含 `数列`、`a_n`、`a_{n+1}`、`递推` 时加入 `sequence_recursion`。
  - 包含 `等比`、`公比` 时加入 `geometric_sequence`。
- 错因诊断只从现有 `mistakeCauses` 中选择：
  - 参数/讨论相关且学生步骤缺少完整分类时加入 `classification_missing`。
  - 定义域/范围相关或存在根号/对数前提缺失时加入 `domain_missing`。
  - 数列递推误判等差/等比时加入 `method_error`。
  - 变形、构造、等价相关错误时加入 `transformation_error`。
  - 无其他命中但有学生答案时加入 `calculation_error`。
- `severity` 首版按命中错因数计算：1 个为 `minor`，2 个为 `medium`，3 个及以上为 `severe`。
- `memory_delta` 由 severity、知识点、错因和 `mistake_history` 计算，模型不参与：
  - `minor=-3`，`medium=-6`，`severe=-9`。
  - 复发错因额外对首个知识点扣 2 分。
  - 低置信度 `should_persist=false`，且 profile 不应用 delta。
- 练习和复习计划使用现有知识点/错因模板，不调用模型动态生成。

- [ ] **Step 3: 运行 image pipeline 测试确认通过**

Run:

```bash
node scripts/image-diagnosis-pipeline.test.mjs
```

Expected:

```text
image diagnosis pipeline test passed
```

### Task 8: Diagnose Service And Route Tests

**Files:**
- Create: `src/lib/diagnose-service.ts`
- Modify: `src/app/api/diagnose/route.ts`
- Modify: `scripts/agent-pipeline.test.mjs`

- [ ] **Step 1: 写 service 注入测试**

在 `scripts/agent-pipeline.test.mjs` 增加 fake provider 成功路径：

```js
const { handleDiagnoseRequest } = jiti("../src/lib/diagnose-service.ts");

const imageServiceResponse = await handleDiagnoseRequest(
  {
    student_id: "demo_student_001",
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "iVBORw0KGgo=",
    image_mime_type: "image/png",
    student_profile: demoStudentProfile,
    mistake_history: [],
  },
  {
    vision_provider: {
      async extractQuestionFromImage() {
        return {
          ok: true,
          value: {
            question_text: "已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
            student_answer: "只得到 $x=\\sqrt a$。",
            student_solution_steps: ["求导", "遗漏分类讨论"],
            standard_solution_draft: "需要讨论参数范围。",
            extraction_confidence: "high",
            warnings: [],
          },
        };
      },
    },
  },
);

assert.equal(imageServiceResponse.status, 200);
assert.equal(imageServiceResponse.body.source, "image");
assert.equal(imageServiceResponse.body.fallback_used, false);
```

Expected before implementation: module missing。

- [ ] **Step 2: 实现 `handleDiagnoseRequest`**

```ts
import type { DiagnoseApiResponse } from "@/lib/diagnose-api";
import type { VisionExtractionProvider } from "@/lib/anthropic-compatible-provider";

export interface DiagnoseServiceResult {
  status: number;
  body: DiagnoseApiResponse;
}

export function handleDiagnoseRequest(
  payload: unknown,
  deps?: {
    vision_provider?: VisionExtractionProvider;
  },
): Promise<DiagnoseServiceResult>;
```

分支规则：

- invalid request：沿用 parser 错误。
- sample：调用现有 `runMathTraceAgent`。
- image：
  - 先 `parseImageInput`。
  - provider 缺失或未配置时返回 `model_not_configured`。
  - provider 返回 `model_timeout` / `model_request_failed` / `model_invalid_output` 时 HTTP 502，`fallback_used=true`。
  - provider 成功后调用 `runImageMathTraceAgent`。

- [ ] **Step 3: 收敛 route**

`src/app/api/diagnose/route.ts` 保持：

```ts
export async function POST(
  request: Request,
): Promise<NextResponse<DiagnoseApiResponse>> {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      createDiagnoseError("invalid_json", "请求体不是合法 JSON。", true),
      { status: 400 },
    );
  }

  const result = await handleDiagnoseRequest(payload);
  return NextResponse.json(result.body, { status: result.status });
}
```

- [ ] **Step 4: 运行 route/service 测试确认通过**

Run:

```bash
node scripts/agent-pipeline.test.mjs
```

Expected:

```text
agent pipeline regression test passed
```

### Task 9: Wire `npm test`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 更新测试脚本**

```json
{
  "scripts": {
    "test": "node scripts/vision-extraction-parser.test.mjs && node scripts/anthropic-compatible-provider.test.mjs && node scripts/image-diagnosis-pipeline.test.mjs && node scripts/agent-pipeline.test.mjs && node scripts/demo-state.test.mjs"
  }
}
```

- [ ] **Step 2: 运行完整测试**

Run:

```bash
npm test
```

Expected:

```text
vision extraction parser test passed
anthropic compatible provider test passed
image diagnosis pipeline test passed
agent pipeline regression test passed
demo state regression test passed
```

### Task 10: Documentation Sync

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Optional Modify: `README.md`

- [ ] **Step 1: 更新 PRD P0/P1 边界**

改动内容：

- P0 正式演示仍是 `sample_diagnosis`。
- `image_diagnosis` 进入 P1 API 能力：MiMo first，Anthropic-compatible provider adapter。
- 模型只做图片抽取，不直接写 `memory_delta` 或覆盖 `student_profile`。
- 新增 `MIMO_BASE_URL`、`MIMO_MODEL`、`MIMO_API_KEY` 的服务端环境变量说明。
- 更新错误码：`model_not_configured`、`model_timeout`、`model_request_failed`、`model_invalid_output`、`missing_image`、`invalid_image`、`image_too_large`。

- [ ] **Step 2: 更新 TECHNICAL_ROADMAP Phase 2**

改动内容：

- 将“Kimi Vision API 或其他多模态模型”改成“Anthropic-compatible provider adapter，MiMo first，未来 Kimi/DeepSeek 作为 provider 实现接入”。
- 保留“不引入 LangGraph / OpenAI Agents SDK / Vercel AI SDK”的当前阶段判断。
- 明确 sample path 不受模型配置影响。

- [ ] **Step 3: 如新增 README 环境说明，只写变量名**

示例：

```text
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/anthropic
MIMO_MODEL=mimo-v2.5
MIMO_API_KEY=<local-secret>
```

不要写真实 key。

### Task 11: Verification And Smoke Tests

**Files:**
- No source edits unless verification exposes a bug.

- [ ] **Step 1: 运行静态和构建验证**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all pass。

- [ ] **Step 2: 启动本地服务**

Run:

```bash
npm run dev
```

Expected: server listens on an available local port。

- [ ] **Step 3: sample smoke**

POST `/api/diagnose`：

```json
{
  "student_id": "demo_student_001",
  "task_type": "sample_diagnosis",
  "sample_question_id": "sample_derivative_001",
  "image_base64": null,
  "student_profile": {},
  "mistake_history": []
}
```

Expected:

- HTTP 200
- `source="sample"`
- `fallback_used=false`
- `sample_diagnosis.id="sample_derivative_001"`

- [ ] **Step 4: image smoke**

使用本地 `.env.local` 中的 MiMo 配置，提交一张临时生成或本地准备的样例数学题图片。命令和输出不得打印完整 base64 或 API key。

Expected success:

- HTTP 200
- `source="image"`
- `fallback_used=false`
- `recognized_question.question_text` 非空
- `memory_delta` 由服务端规则生成

Expected recoverable failure if provider unavailable:

- HTTP 400/502
- `error.recoverable=true`
- `fallback_used` 按错误类型稳定返回
- sample smoke 仍通过

### Task 12: Final Review Handoff

**Files:**
- No source edits.

- [ ] **Step 1: 检查 git diff 范围**

Run:

```bash
git status --short
git diff --stat
```

Expected:

- 只包含本任务代码、测试、文档改动。
- 不包含 `.env.local`。
- 不包含用户要求忽略的未跟踪 review 文档。

- [ ] **Step 2: 给 Claude Code 本地审查前说明**

最终说明包括：

- 已实现的 provider/parser/service/pipeline 边界。
- 已运行的验证命令和结果。
- image smoke 是成功还是 recoverable failure。
- 明确“尚未推 PR，等待 Claude Code 本地审查”。

## 自检

- Spec coverage：计划覆盖 MiMo 接入、Anthropic-compatible adapter、图片输入、JSON/parser 校验、route 错误路径、sample path 保持、P0/P1 文档边界、TDD 和 smoke test。
- Placeholder scan：未发现占位词、未完成章节或空泛步骤。
- Scope check：不引入数据库、登录、老师端、支付、Agent 框架或前端图片上传 UI。
- Type consistency：provider 使用 `VisionExtractionProvider`，parser 使用 `VisionExtractionDraft`，route/service 返回 `DiagnoseApiResponse`。
- 风险提示：Anthropic-compatible 具体认证头和 `/v1/messages` path 需由 image smoke 验证；若 MiMo 兼容层与假设不一致，只改 provider adapter。
