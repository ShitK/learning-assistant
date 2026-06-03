# Provider Error Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `image_diagnosis` 在 MiMo/未来 OCR/provider 失败时返回可恢复、可展示、可调试且不泄露隐私的失败原因。

**Architecture:** 在 provider 边界新增 `provider_debug` 安全元数据，只描述 provider、阶段、失败类型和 HTTP 状态；`/api/diagnose` 透传该安全摘要，前端把它拼进开发诊断文案。`sample_diagnosis`、模型输出 parser、Agent Pipeline、`memory_delta` 和学生画像规则不变。

**Tech Stack:** Next.js App Router, TypeScript, Node test scripts, existing `VisionExtractionProvider`, existing `/api/diagnose` response contract.

---

## 当前假设

- 当前真实问题是 provider 请求层失败被统一折叠成 `model_request_failed`，浏览器里无法区分 HTTP 错误、非 JSON 响应、网络异常或超时。
- 这次不接 OCR 模型，只把错误元数据设计成可被未来 OCR 阶段复用。
- `provider_debug` 可以进入 API 响应和前端错误态，因为它只包含安全字段：`provider_name`、`provider_stage`、`failure_kind`、`http_status`。
- `debug_summary` 继续只用于模型输出解析失败；`provider_debug` 用于 provider 请求层失败。两者可以同时存在，但本次常见路径通常只出现其中一个。
- 不记录、不返回 API Key、base64 图片、原始 provider response、题干全文、学生答案全文或学生画像明细。

## 不改边界

- 不改变 `sample_diagnosis` 稳定路径。
- 不让模型写 `memory_delta`、`student_profile` 或 `mistake_history`。
- 不新增数据库、登录、老师端、支付、LangGraph、OpenAI Agents SDK、Vercel AI SDK。
- 不把图片诊断失败自动替换成样例题结果；前端仍保留当前可见报告并提示本次未生成新报告。

## 文件结构

- Create: `src/lib/provider-error.ts`
  - 负责 provider 失败安全元数据类型和运行时 type guard。
- Modify: `src/lib/anthropic-compatible-provider.ts`
  - 在 MiMo Anthropic-compatible provider 中生成 `provider_debug`。
- Modify: `src/lib/diagnose-api.ts`
  - 在 `DiagnoseErrorResponse` 中加入可选 `provider_debug`。
- Modify: `src/lib/diagnose-service.ts`
  - 将 `VisionProviderError.provider_debug` 透传到 API 错误响应。
- Modify: `src/lib/diagnose-client.ts`
  - 将 `provider_debug` 转成前端开发诊断文本。
- Modify: `scripts/anthropic-compatible-provider.test.mjs`
  - 覆盖 HTTP、非 JSON、网络异常、超时、未配置 key 的 provider 错误分类。
- Modify: `scripts/agent-pipeline.test.mjs`
  - 覆盖 `/api/diagnose` image 错误响应透传 `provider_debug`。
- Modify: `scripts/diagnose-client.test.mjs`
  - 覆盖前端错误文案中的 provider 诊断信息。
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - 同步 API 错误契约。
- Modify: `docs/TECHNICAL_ROADMAP.md`
  - 同步 provider/OCR 可观测性边界。
- Modify: `interview/mathtrace-project-narrative.md`
  - 记录可面试表达：为什么错误码之外还需要安全元数据。

---

### Task 1: Provider 失败元数据类型和 MiMo 分类

**Files:**
- Create: `src/lib/provider-error.ts`
- Modify: `src/lib/anthropic-compatible-provider.ts`
- Test: `scripts/anthropic-compatible-provider.test.mjs`

- [ ] **Step 1: 写 provider 失败分类的失败测试**

在 `scripts/anthropic-compatible-provider.test.mjs` 中补充这些断言：

```js
assert.deepEqual(failedResult.error.provider_debug, {
  provider_name: "mimo",
  provider_stage: "vision_llm",
  failure_kind: "http_error",
  http_status: 500,
});

const invalidJsonProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "mimo-v2.5",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: async () => new Response("not json", { status: 200 }),
});

const invalidJsonResult = await invalidJsonProvider.extractQuestionFromImage({
  image_base64: "iVBORw0KGgo=",
  mime_type: "image/png",
  student_profile_summary: "demo profile",
});
assert.equal(invalidJsonResult.ok, false);
assert.equal(invalidJsonResult.error.code, "model_request_failed");
assert.deepEqual(invalidJsonResult.error.provider_debug, {
  provider_name: "mimo",
  provider_stage: "vision_llm",
  failure_kind: "invalid_json",
});

const networkFailedProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "mimo-v2.5",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: async () => {
    throw new TypeError("fetch failed");
  },
});

const networkFailedResult =
  await networkFailedProvider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });
assert.equal(networkFailedResult.ok, false);
assert.equal(networkFailedResult.error.code, "model_request_failed");
assert.deepEqual(networkFailedResult.error.provider_debug, {
  provider_name: "mimo",
  provider_stage: "vision_llm",
  failure_kind: "network_failed",
});

assert.deepEqual(timeoutResult.error.provider_debug, {
  provider_name: "mimo",
  provider_stage: "vision_llm",
  failure_kind: "timeout",
});

assert.equal(missingEnvConfig.error.provider_debug, undefined);
```

- [ ] **Step 2: 运行 provider 测试并确认失败**

Run:

```bash
node scripts/anthropic-compatible-provider.test.mjs
```

Expected: FAIL，至少出现 `provider_debug` 为 `undefined` 或缺少字段的断言失败。

- [ ] **Step 3: 新增 provider 失败安全类型**

创建 `src/lib/provider-error.ts`：

```ts
import { isRecord } from "@/lib/utils";

export type ProviderStage = "vision_llm" | "ocr";

export type ProviderFailureKind =
  | "http_error"
  | "invalid_json"
  | "network_failed"
  | "timeout";

export interface ProviderFailureDebug {
  provider_name: string;
  provider_stage: ProviderStage;
  failure_kind: ProviderFailureKind;
  http_status?: number;
}

export function isProviderFailureDebug(
  value: unknown,
): value is ProviderFailureDebug {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.provider_name === "string" &&
    value.provider_name.trim().length > 0 &&
    isProviderStage(value.provider_stage) &&
    isProviderFailureKind(value.failure_kind) &&
    (value.http_status === undefined || typeof value.http_status === "number")
  );
}

function isProviderStage(value: unknown): value is ProviderStage {
  return value === "vision_llm" || value === "ocr";
}

function isProviderFailureKind(value: unknown): value is ProviderFailureKind {
  return (
    value === "http_error" ||
    value === "invalid_json" ||
    value === "network_failed" ||
    value === "timeout"
  );
}
```

- [ ] **Step 4: 在 provider error 上挂安全元数据**

在 `src/lib/anthropic-compatible-provider.ts` 中引入类型：

```ts
import type { ProviderFailureDebug, ProviderFailureKind } from "@/lib/provider-error";
```

扩展 `VisionProviderError`：

```ts
export interface VisionProviderError {
  code: VisionProviderErrorCode;
  message: string;
  recoverable: true;
  debug_summary?: VisionExtractionDebugSummary;
  provider_debug?: ProviderFailureDebug;
}
```

新增常量和 helper：

```ts
const MIMO_PROVIDER_NAME = "mimo";

function createProviderFailureDebug(input: {
  failure_kind: ProviderFailureKind;
  http_status?: number;
}): ProviderFailureDebug {
  const debug: ProviderFailureDebug = {
    provider_name: MIMO_PROVIDER_NAME,
    provider_stage: "vision_llm",
    failure_kind: input.failure_kind,
  };

  return typeof input.http_status === "number"
    ? { ...debug, http_status: input.http_status }
    : debug;
}
```

扩展 `createProviderError`：

```ts
function createProviderError(
  code: VisionProviderErrorCode,
  message: string,
  debugSummary?: VisionExtractionDebugSummary,
  providerDebug?: ProviderFailureDebug,
): VisionProviderError {
  return {
    code,
    message,
    recoverable: true,
    debug_summary: debugSummary,
    provider_debug: providerDebug,
  };
}
```

修改 HTTP 非 2xx 路径：

```ts
if (!response.ok) {
  return {
    ok: false,
    error: createProviderError(
      "model_request_failed",
      `MiMo 图片诊断服务返回 HTTP ${response.status}，请稍后重试。`,
      undefined,
      createProviderFailureDebug({
        failure_kind: "http_error",
        http_status: response.status,
      }),
    ),
  };
}
```

修改 `readJsonResponse()` 的 catch：

```ts
return {
  ok: false,
  error: createProviderError(
    "model_request_failed",
    "MiMo 图片诊断响应不是合法 JSON，请稍后重试。",
    undefined,
    createProviderFailureDebug({ failure_kind: "invalid_json" }),
  ),
};
```

修改超时 catch：

```ts
error: createProviderError(
  "model_timeout",
  "MiMo 图片诊断请求超时，请稍后重试。",
  undefined,
  createProviderFailureDebug({ failure_kind: "timeout" }),
),
```

修改普通 fetch 异常 catch：

```ts
error: createProviderError(
  "model_request_failed",
  "MiMo 图片诊断网络请求失败，请稍后重试。",
  undefined,
  createProviderFailureDebug({ failure_kind: "network_failed" }),
),
```

- [ ] **Step 5: 运行 provider 测试并确认通过**

Run:

```bash
node scripts/anthropic-compatible-provider.test.mjs
```

Expected: PASS，输出 `anthropic compatible provider test passed`。

- [ ] **Step 6: 提交 provider 分类变化**

提交前核对：

```bash
git status --short
git diff -- src/lib/provider-error.ts src/lib/anthropic-compatible-provider.ts scripts/anthropic-compatible-provider.test.mjs
```

Commit:

```bash
git add src/lib/provider-error.ts src/lib/anthropic-compatible-provider.ts scripts/anthropic-compatible-provider.test.mjs
git commit -m "fix: classify provider request failures"
```

---

### Task 2: `/api/diagnose` 透传 provider_debug

**Files:**
- Modify: `src/lib/diagnose-api.ts`
- Modify: `src/lib/diagnose-service.ts`
- Test: `scripts/agent-pipeline.test.mjs`

- [ ] **Step 1: 写 API 错误响应透传失败测试**

在 `scripts/agent-pipeline.test.mjs` 中新增：

```js
const providerDebug = {
  provider_name: "mimo",
  provider_stage: "vision_llm",
  failure_kind: "http_error",
  http_status: 502,
};

const providerDebugResponse = await handleDiagnoseRequest(createImageRequest(), {
  vision_provider: createErrorVisionProvider(
    "model_request_failed",
    undefined,
    providerDebug,
  ),
});

assert.equal(providerDebugResponse.status, 502);
assert.deepEqual(providerDebugResponse.body.provider_debug, providerDebug);
assert.equal(
  JSON.stringify(providerDebugResponse.body.provider_debug).includes("iVBOR"),
  false,
);
```

把测试文件底部 helper 调整为：

```js
function createErrorVisionProvider(
  code,
  debugSummary = undefined,
  providerDebug = undefined,
) {
  return {
    async extractQuestionFromImage() {
      return {
        ok: false,
        error: {
          code,
          message: `fake ${code}`,
          recoverable: true,
          debug_summary: debugSummary,
          provider_debug: providerDebug,
        },
      };
    },
  };
}
```

- [ ] **Step 2: 运行 pipeline 测试并确认失败**

Run:

```bash
node scripts/agent-pipeline.test.mjs
```

Expected: FAIL，`provider_debug` 尚未出现在 API error body。

- [ ] **Step 3: 扩展 API 错误契约**

在 `src/lib/diagnose-api.ts` 中引入类型：

```ts
import type { ProviderFailureDebug } from "@/lib/provider-error";
```

扩展 `DiagnoseErrorResponse`：

```ts
export interface DiagnoseErrorResponse {
  error: {
    code: DiagnoseErrorCode;
    message: string;
    recoverable: boolean;
  };
  fallback_used: boolean;
  warnings: string[];
  debug_summary?: VisionExtractionDebugSummary;
  provider_debug?: ProviderFailureDebug;
}
```

扩展 `createDiagnoseError()`：

```ts
export function createDiagnoseError(
  code: DiagnoseErrorCode,
  message: string,
  recoverable: boolean,
  fallbackUsed = false,
  debugSummary?: VisionExtractionDebugSummary,
  providerDebug?: ProviderFailureDebug,
): DiagnoseErrorResponse {
  return {
    error: {
      code,
      message,
      recoverable,
    },
    fallback_used: fallbackUsed,
    warnings: [],
    debug_summary: debugSummary,
    provider_debug: providerDebug,
  };
}
```

- [ ] **Step 4: 从 diagnose service 透传 provider_debug**

在 `src/lib/diagnose-service.ts` 中，把 provider 错误响应改成：

```ts
body: createDiagnoseError(
  extractionResult.error.code,
  extractionResult.error.message,
  extractionResult.error.recoverable,
  shouldMarkFallbackUsed(extractionResult.error),
  getSafeDebugSummary(extractionResult.error),
  extractionResult.error.provider_debug,
),
```

`model_not_configured` 分支保持不传 `provider_debug`。

- [ ] **Step 5: 运行 pipeline 测试并确认通过**

Run:

```bash
node scripts/agent-pipeline.test.mjs
```

Expected: PASS，输出 `agent pipeline regression test passed`。

- [ ] **Step 6: 提交 API 透传变化**

提交前核对：

```bash
git status --short
git diff -- src/lib/diagnose-api.ts src/lib/diagnose-service.ts scripts/agent-pipeline.test.mjs
```

Commit:

```bash
git add src/lib/diagnose-api.ts src/lib/diagnose-service.ts scripts/agent-pipeline.test.mjs
git commit -m "fix: expose safe provider failure debug"
```

---

### Task 3: 前端错误文案展示 provider 失败原因

**Files:**
- Modify: `src/lib/diagnose-client.ts`
- Test: `scripts/diagnose-client.test.mjs`

- [ ] **Step 1: 写前端错误文案失败测试**

在 `scripts/diagnose-client.test.mjs` 中新增：

```js
assert.equal(
  getDiagnoseClientErrorMessage({
    error: {
      code: "model_request_failed",
      message: "MiMo 图片诊断服务返回 HTTP 502，请稍后重试。",
      recoverable: true,
    },
    fallback_used: true,
    warnings: [],
    provider_debug: {
      provider_name: "mimo",
      provider_stage: "vision_llm",
      failure_kind: "http_error",
      http_status: 502,
    },
  }),
  [
    "MiMo 图片诊断服务返回 HTTP 502，请稍后重试。",
    "开发诊断：provider mimo；阶段 vision_llm；失败类型 http_error；HTTP 502。",
  ].join("\n"),
);

assert.equal(
  getDiagnoseClientErrorMessage({
    error: {
      code: "model_request_failed",
      message: "MiMo 图片诊断网络请求失败，请稍后重试。",
      recoverable: true,
    },
    fallback_used: true,
    warnings: [],
    provider_debug: {
      provider_name: "mimo",
      provider_stage: "vision_llm",
      failure_kind: "network_failed",
    },
  }),
  [
    "MiMo 图片诊断网络请求失败，请稍后重试。",
    "开发诊断：provider mimo；阶段 vision_llm；失败类型 network_failed。",
  ].join("\n"),
);
```

- [ ] **Step 2: 运行 client 测试并确认失败**

Run:

```bash
node scripts/diagnose-client.test.mjs
```

Expected: FAIL，当前 `getDiagnoseClientErrorMessage()` 未拼接 provider 诊断文本。

- [ ] **Step 3: 拼接 provider_debug 文案**

在 `src/lib/diagnose-client.ts` 中引入 type guard：

```ts
import { isProviderFailureDebug } from "@/lib/provider-error";
```

把 `getDebugText()` 改成组合两个调试文本：

```ts
function getDebugText(responseBody: Record<string, unknown>): string {
  return [
    getModelOutputDebugText(responseBody),
    getProviderFailureDebugText(responseBody),
  ]
    .filter((message) => message.length > 0)
    .join("\n");
}
```

将当前 `getDebugText()` 里的模型输出逻辑重命名为 `getModelOutputDebugText()`，并新增：

```ts
function getProviderFailureDebugText(
  responseBody: Record<string, unknown>,
): string {
  if (!isProviderFailureDebug(responseBody.provider_debug)) {
    return "";
  }

  const debug = responseBody.provider_debug;
  const httpText =
    typeof debug.http_status === "number" ? `；HTTP ${debug.http_status}` : "";

  return `开发诊断：provider ${debug.provider_name}；阶段 ${debug.provider_stage}；失败类型 ${debug.failure_kind}${httpText}。`;
}
```

- [ ] **Step 4: 运行 client 测试并确认通过**

Run:

```bash
node scripts/diagnose-client.test.mjs
```

Expected: PASS，输出 `diagnose client regression test passed`。

- [ ] **Step 5: 提交前端错误文案变化**

提交前核对：

```bash
git status --short
git diff -- src/lib/diagnose-client.ts scripts/diagnose-client.test.mjs
```

Commit:

```bash
git add src/lib/diagnose-client.ts scripts/diagnose-client.test.mjs
git commit -m "fix: show provider failure diagnostics"
```

---

### Task 4: 文档同步

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `interview/mathtrace-project-narrative.md`

- [ ] **Step 1: 更新 PRD API 错误契约**

在 PRD 的 `/api/diagnose` 错误响应说明附近补充：

````md
图片诊断 provider 请求层失败时，错误响应可以包含 `provider_debug`：

```json
{
  "error": {
    "code": "model_request_failed",
    "message": "MiMo 图片诊断服务返回 HTTP 502，请稍后重试。",
    "recoverable": true
  },
  "fallback_used": true,
  "warnings": [],
  "provider_debug": {
    "provider_name": "mimo",
    "provider_stage": "vision_llm",
    "failure_kind": "http_error",
    "http_status": 502
  }
}
```

`provider_debug` 只能包含 provider 名称、阶段、失败类型和 HTTP 状态，不得包含 API Key、图片 base64、原始模型响应、题干、学生答案或学生画像明细。`provider_stage` 当前使用 `vision_llm`，未来接入 OCR 时可以复用同一结构使用 `ocr`。
````

- [ ] **Step 2: 更新 Technical Roadmap**

在模型调用层或 API 层补充：

```md
Provider/OCR 可观测性边界：P1 不保存原始 provider 响应，也不记录图片内容。请求失败只暴露安全元数据 `provider_debug`，用于区分 `http_error`、`invalid_json`、`network_failed` 和 `timeout`。未来 OCR provider 接入时应复用这一错误结构，而不是新增一套前端不可识别的错误通道。
```

- [ ] **Step 3: 更新面试叙事文档**

在 MiMo/provider 阶段的“技术决策与取舍”或“反思与后续优化”补充：

```md
真实浏览器测试还暴露了 provider 请求层可观测性不足：同样显示 `model_request_failed`，实际可能是 HTTP 5xx、非 JSON 响应、网络异常或超时。我把错误码继续保持稳定，但新增 `provider_debug` 安全元数据，只暴露 provider、阶段、失败类型和 HTTP 状态，方便本地调试和后续 OCR provider 复用，同时避免泄露图片内容和 API Key。
```

- [ ] **Step 4: 文档自查**

Run:

```bash
rg "provider_debug|http_error|network_failed|invalid_json|provider_stage" docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
```

Expected: 三份文档都能搜到本次新增边界。

- [ ] **Step 5: 提交文档变化**

提交前核对：

```bash
git status --short
git diff -- docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
```

Commit:

```bash
git add docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
git commit -m "docs: document provider failure observability"
```

---

### Task 5: 全量验证与本地体验检查

**Files:**
- No production edits expected.

- [ ] **Step 1: 运行全量测试**

Run:

```bash
npm test
```

Expected: 所有脚本通过。

- [ ] **Step 2: 运行 lint**

Run:

```bash
npm run lint
```

Expected: ESLint 通过。

- [ ] **Step 3: 运行 build**

Run:

```bash
npm run build
```

Expected: Next.js build 通过。

- [ ] **Step 4: 启动或复用本地 dev server**

Run:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Expected: `http://127.0.0.1:3001` 可访问。如果已有同端口 server，复用当前进程。

- [ ] **Step 5: 做 sample smoke test**

浏览器打开：

```text
http://127.0.0.1:3001
```

操作：切到样例题，开始诊断。

Expected:
- 右侧报告正常更新。
- `sample_diagnosis` 不调用 MiMo。
- 不出现 `provider_debug`。

- [ ] **Step 6: 做 image failure smoke test**

操作：切到图片诊断，上传一张本地数学错题图片，开始图片诊断。

Expected:
- 成功时：右侧生成 `source=image` 报告，低置信度不写入长期画像。
- provider 失败时：左侧和右侧保留报告提示都显示可恢复错误；如果响应带 `provider_debug`，文案包含类似 `开发诊断：provider mimo；阶段 vision_llm；失败类型 ...`。
- 浏览器 Network response 不包含 API Key、图片 base64 或原始模型响应。

- [ ] **Step 7: 检查 secret 和 review 文档未被提交**

Run:

```bash
git status --short
git diff --cached --name-only
rg "secret-key-for-test" src docs interview scripts --glob "!scripts/anthropic-compatible-provider.test.mjs" --glob "!docs/superpowers/plans/2026-06-03-provider-error-observability.md"
rg "MIMO_API_KEY=.*|sk-[A-Za-z0-9_-]{20,}" src docs interview scripts
```

Expected:
- `secret-key-for-test` 只出现在测试文件中。
- 不存在真实 API Key。
- `docs/reviews/*.md` 不在 staged 文件中。

- [ ] **Step 8: 提供 Claude Code 审查提示词**

输出给用户一段审查提示词，请 Claude Code 审查本分支相对 `main` 的 diff，重点关注：
- provider_debug 是否只含安全元数据。
- HTTP/invalid JSON/network/timeout 分类是否准确。
- API contract、client 文案、PRD/Roadmap 是否一致。
- 是否破坏 `sample_diagnosis`。
- 是否存在测试缺口。

---

## 验收标准

- `image_diagnosis` provider HTTP 失败、非 JSON 响应、网络异常和超时都有可区分的 `provider_debug.failure_kind`。
- `/api/diagnose` 错误响应保持原有 `error.code` 兼容，同时可选返回 `provider_debug`。
- 前端错误态能显示更清楚的 provider 失败原因；保留当前报告的行为不变。
- `sample_diagnosis` 行为不变。
- `provider_debug` 不包含 API Key、图片 base64、原始 provider response、题干、学生答案或学生画像明细。
- `npm test`、`npm run lint`、`npm run build` 通过。
- PRD、Technical Roadmap、面试叙事文档同步。

## Plan 自查

- Spec coverage: 覆盖 provider 分类、API 透传、前端展示、文档同步、验证和 Claude Code 审查交接。
- Placeholder scan: 未保留占位内容或空泛步骤。
- Type consistency: 统一使用 `ProviderFailureDebug`、`ProviderStage`、`ProviderFailureKind`、`provider_debug` 字段名。
- Scope check: 未接入 OCR，仅为未来 OCR 预留 `provider_stage="ocr"` 的错误元数据通道。
