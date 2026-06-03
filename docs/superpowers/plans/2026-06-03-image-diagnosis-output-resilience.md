# Image Diagnosis Output Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提升 `image_diagnosis` 对 MiMo 非稳定 JSON 输出的恢复能力，让图片诊断失败原因清晰、可恢复，并避免右侧结果看起来像“没有刷新”。

**Architecture:** 保持现有 “MiMo 只做图片抽取 + MathTrace 确定性 Pipeline 做诊断” 边界。Parser 负责把模型字段值规范化到内部结构；Provider 在安全范围内对 `model_invalid_output` 做一次结构化 retry；前端只负责展示当前请求失败和保留报告状态，不把失败伪装成成功。

**Tech Stack:** Next.js App Router, TypeScript, Anthropic-compatible MiMo adapter, Node `assert` + `jiti` tests, existing type guards, no database, no OCR adapter, no LangGraph/OpenAI Agents SDK/Vercel AI SDK.

---

## Current Context

- Current branch for this work: `codex/image-diagnosis-output-resilience`.
- `sample_diagnosis` is the stable P0 path and must remain unchanged.
- `image_diagnosis` is P1 and already calls MiMo through `VisionExtractionProvider`.
- Real browser testing showed repeated `model_invalid_output` cases:
  - Missing `standard_solution_draft`.
  - `student_solution_steps` field exists, but the value is not accepted by the current parser.
- Existing parser already handles:
  - Valid string arrays.
  - Multiline strings for `student_solution_steps` and `warnings`.
  - Empty `student_solution_steps` by inserting a low-confidence placeholder.
  - `student_answer` text that means “未识别到学生答案” by forcing low confidence.
- Current parser still rejects useful model outputs when:
  - `student_solution_steps` contains empty items.
  - `student_solution_steps` contains objects such as `{ "text": "先求导" }`.
  - `student_solution_steps` contains more than 8 items.
  - `standard_solution_draft` is omitted.

## Non-Goals

- Do not add OCR provider integration in this plan.
- Do not change `sample_diagnosis` behavior or response contract.
- Do not let the model write `memory_delta`, `student_profile`, mistake history, or long-term profile changes.
- Do not introduce a new database, login, teacher dashboard, payment flow, RAG, or agent framework.
- Do not log raw model output, image base64, API keys, or sensitive student content.

## File Structure

- Modify: `scripts/vision-extraction-parser.test.mjs`
  Add red tests for object-array steps, empty step filtering, overlong step truncation, and prompt requirements for mandatory standard solution drafts.
- Modify: `src/lib/vision-extraction-parser.ts`
  Add bounded normalization for list fields while keeping field allowlist, forbidden-field rejection, and strict JSON object parsing.
- Modify: `scripts/anthropic-compatible-provider.test.mjs`
  Add red tests for one retry after recoverable `model_invalid_output`, and no retry when forbidden fields are present.
- Modify: `src/lib/anthropic-compatible-provider.ts`
  Add a single repair attempt for safe model invalid output, reusing the same provider adapter and request boundary.
- Modify: `scripts/diagnosis-view-model.test.mjs`
  Add tests for retained-report notices that include the current failure reason without exposing raw debug data.
- Modify: `src/lib/diagnosis-view-model.ts`
  Make retained report notices clearer when image diagnosis fails and the right panel keeps the previous report.
- Modify: `src/components/mathtrace-workbench.tsx`
  Pass the caught image diagnosis error into the retained-report notice.
- Modify: `scripts/diagnose-client.test.mjs`
  Add client-facing error text coverage for malformed `student_solution_steps`.
- Modify: `src/lib/diagnose-client.ts`
  Expand safe developer diagnostics with list lengths so local debugging can distinguish missing fields from malformed list values.
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  Document bounded parser normalization, one safe provider retry, and retained report behavior.
- Modify: `docs/TECHNICAL_ROADMAP.md`
  Mark image diagnosis resilience as the next P1 hardening step before OCR adapter work.
- Modify: `interview/mathtrace-project-narrative.md`
  Add a short note that real model integration required treating LLM JSON as untrusted external input and adding recovery boundaries.

## Behavior Contract

`student_solution_steps` normalization should follow these rules:

- Accept `string[]`.
- Accept multiline `string`.
- Accept object array items only when they contain a string in one of these keys: `text`, `content`, `step`, `value`.
- Trim numbering prefixes such as `1.`, `2、`, `-`, and `*`.
- Drop empty or unsupported items instead of failing the whole extraction.
- If no usable step remains, reuse the existing low-confidence placeholder behavior.
- If more than 8 usable steps remain, keep the first 8 and add a warning.
- Do not accept nested arrays or arbitrary object serialization.

`standard_solution_draft` should remain required for successful parsing. If missing, provider may retry once with the same image and a repair prompt. If the retry still fails, return the current recoverable `model_invalid_output` error.

Provider retry should follow these rules:

- Retry at most once per image diagnosis request.
- Retry only for parser errors with no forbidden fields.
- Do not retry HTTP non-2xx, timeout, missing API key, or forbidden model-written profile fields.
- Do not expose raw first-pass output to logs, browser response, docs, or tests.
- Keep API key server-only.

UI retained report behavior should follow these rules:

- If image diagnosis fails and the right panel keeps an older report, show a clear retained-report notice.
- The notice should say whether the retained report is an older image report or the sample report.
- The notice should include a short reason derived from the safe error message, not raw model output.

---

### Task 1: Parser Red Tests for Flexible Step Values

**Files:**
- Modify: `scripts/vision-extraction-parser.test.mjs`
- Test: `scripts/vision-extraction-parser.test.mjs`

- [ ] **Step 1: Add tests for object-array, empty, and overlong `student_solution_steps`**

Append this block after the existing `missingAnswerAndSteps` assertions:

```js
const objectStepItems = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: [
      { text: "1. 先求导" },
      { step: "2. 再讨论参数范围" },
      { content: "3. 写出单调区间" },
      { value: "4. 对照零点条件" },
    ],
    standard_solution_draft: "标准解法",
    extraction_confidence: "medium",
    warnings: [],
  }),
);
assert.equal(objectStepItems.ok, true);
assert.deepEqual(objectStepItems.value.student_solution_steps, [
  "先求导",
  "再讨论参数范围",
  "写出单调区间",
  "对照零点条件",
]);

const noisyStepItems = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: [
      "1. 求导",
      "",
      "   ",
      { text: "2. 讨论参数" },
      { unsupported: "忽略这个对象" },
    ],
    standard_solution_draft: "标准解法",
    extraction_confidence: "medium",
    warnings: [],
  }),
);
assert.equal(noisyStepItems.ok, true);
assert.deepEqual(noisyStepItems.value.student_solution_steps, [
  "求导",
  "讨论参数",
]);
assert.equal(
  noisyStepItems.value.warnings.includes("部分学生步骤为空或格式不完整，已忽略。"),
  true,
);

const overlongStepItems = parseVisionExtractionText(
  JSON.stringify({
    question_text: "题干",
    student_answer: "答案",
    student_solution_steps: Array.from({ length: 10 }, (_item, index) => {
      return `步骤${index + 1}`;
    }),
    standard_solution_draft: "标准解法",
    extraction_confidence: "medium",
    warnings: [],
  }),
);
assert.equal(overlongStepItems.ok, true);
assert.equal(overlongStepItems.value.student_solution_steps.length, 8);
assert.deepEqual(overlongStepItems.value.student_solution_steps, [
  "步骤1",
  "步骤2",
  "步骤3",
  "步骤4",
  "步骤5",
  "步骤6",
  "步骤7",
  "步骤8",
]);
assert.equal(
  overlongStepItems.value.warnings.includes(
    "模型返回的学生步骤超过 8 条，已截取前 8 条。",
  ),
  true,
);
```

- [ ] **Step 2: Add prompt assertion for mandatory standard solution draft**

Append this assertion near the existing prompt assertions:

```js
assert.equal(prompt.includes("standard_solution_draft 必须始终输出"), true);
```

- [ ] **Step 3: Run parser test and verify it fails**

Run:

```bash
node scripts/vision-extraction-parser.test.mjs
```

Expected:

```text
AssertionError
```

At least one failure should show that object-array steps, noisy step arrays, overlong arrays, or the new prompt assertion is not implemented yet.

### Task 2: Parser Implementation for Bounded List Normalization

**Files:**
- Modify: `src/lib/vision-extraction-parser.ts`
- Test: `scripts/vision-extraction-parser.test.mjs`

- [ ] **Step 1: Replace `parseStringList` call sites with parse result objects**

Change the two list parsing call sites in `parseVisionExtractionText` to this shape:

```ts
  const steps = parseStringList(parsed.student_solution_steps, {
    field_name: "student_solution_steps",
    min_length: 0,
    max_length: 8,
    invalid_item_warning: "部分学生步骤为空或格式不完整，已忽略。",
    truncated_warning: "模型返回的学生步骤超过 8 条，已截取前 8 条。",
  });
  if (!steps) {
    return invalidOutput(
      "模型输出的 student_solution_steps 不合法。",
      debugSummary,
    );
  }

  const warnings = parseStringList(parsed.warnings, {
    field_name: "warnings",
    min_length: 0,
    max_length: 5,
  });
  if (!warnings) {
    return invalidOutput("模型输出的 warnings 不合法。", debugSummary);
  }

  const normalized = normalizeExtractionDraft({
    student_answer: parsed.student_answer.trim(),
    student_solution_steps: steps.items,
    extraction_confidence: parsed.extraction_confidence,
    warnings: [...warnings.items, ...steps.warnings],
  });
```

- [ ] **Step 2: Replace list parser helpers with bounded normalization helpers**

Replace the existing `parseStringList`, `parseStringListText`, and `normalizeStringListItem` helpers with this implementation:

```ts
interface StringListParseOptions {
  field_name: "student_solution_steps" | "warnings";
  min_length: number;
  max_length: number;
  invalid_item_warning?: string;
  truncated_warning?: string;
}

interface StringListParseResult {
  items: string[];
  warnings: string[];
}

function parseStringList(
  value: unknown,
  options: StringListParseOptions,
): StringListParseResult | null {
  const parsedItems =
    typeof value === "string"
      ? parseStringListText(value)
      : parseStringListArray(value);

  if (!parsedItems) {
    return null;
  }

  const usableItems = parsedItems.items.filter((item) => item.length > 0);
  const warnings = [...parsedItems.warnings];

  if (
    parsedItems.dropped_invalid_item &&
    options.invalid_item_warning &&
    usableItems.length > 0
  ) {
    warnings.push(options.invalid_item_warning);
  }

  if (usableItems.length < options.min_length) {
    return null;
  }

  const items = usableItems.slice(0, options.max_length);
  if (usableItems.length > options.max_length && options.truncated_warning) {
    warnings.push(options.truncated_warning);
  }

  return {
    items,
    warnings,
  };
}

function parseStringListText(value: string): {
  items: string[];
  warnings: string[];
  dropped_invalid_item: boolean;
} {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      items: [],
      warnings: [],
      dropped_invalid_item: false,
    };
  }

  return {
    items: trimmed
      .split(/\r?\n/)
      .map(normalizeStringListItem)
      .filter((item) => item.length > 0),
    warnings: [],
    dropped_invalid_item: false,
  };
}

function parseStringListArray(value: unknown): {
  items: string[];
  warnings: string[];
  dropped_invalid_item: boolean;
} | null {
  if (!Array.isArray(value)) {
    return null;
  }

  let droppedInvalidItem = false;
  const items = value
    .map((item) => {
      const parsedItem = parseStringListItem(item);
      if (!parsedItem) {
        droppedInvalidItem = true;
        return "";
      }

      return parsedItem;
    })
    .filter((item) => item.length > 0);

  return {
    items,
    warnings: [],
    dropped_invalid_item: droppedInvalidItem,
  };
}

function parseStringListItem(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeStringListItem(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of ["text", "content", "step", "value"]) {
    const fieldValue = value[key];
    if (typeof fieldValue === "string") {
      return normalizeStringListItem(fieldValue);
    }
  }

  return null;
}

function normalizeStringListItem(value: string): string {
  return value
    .trim()
    .replace(/^(?:[-*]|\d+[.)、])\s*/, "")
    .trim();
}
```

- [ ] **Step 3: Update `getListLength` to use the new parser options**

Change the string branch inside `getListLength` to:

```ts
  if (typeof value[key] === "string") {
    const parsed = parseStringList(value[key], {
      field_name: key === "warnings" ? "warnings" : "student_solution_steps",
      min_length: 0,
      max_length: Number.MAX_SAFE_INTEGER,
    });
    return parsed?.items.length;
  }
```

- [ ] **Step 4: Strengthen prompt wording for standard solution draft**

Add this line to `createVisionExtractionPrompt` after the JSON field list line:

```ts
    "standard_solution_draft 必须始终输出；如果图片里没有标准解法，请根据题干生成一份标准解法草稿，不要省略字段。",
```

- [ ] **Step 5: Run parser test and verify it passes**

Run:

```bash
node scripts/vision-extraction-parser.test.mjs
```

Expected:

```text
vision extraction parser test passed
```

- [ ] **Step 6: Commit parser hardening**

Run:

```bash
git add src/lib/vision-extraction-parser.ts scripts/vision-extraction-parser.test.mjs
git commit -m "fix: harden image extraction parser"
```

Expected:

```text
commit succeeds with message: fix: harden image extraction parser
```

### Task 3: Provider Retry Red Tests

**Files:**
- Modify: `scripts/anthropic-compatible-provider.test.mjs`
- Test: `scripts/anthropic-compatible-provider.test.mjs`

- [ ] **Step 1: Add test for one repair retry after missing `standard_solution_draft`**

Append this block before the timeout provider test:

```js
const retryCalls = [];
const retryProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "mimo-v2.5",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: async (url, init) => {
    retryCalls.push({ url: String(url), init });

    if (retryCalls.length === 1) {
      return new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                question_text: "题干",
                student_answer: "学生答案",
                student_solution_steps: ["步骤一"],
                extraction_confidence: "medium",
                warnings: [],
              }),
            },
          ],
        }),
        { status: 200 },
      );
    }

    return new Response(
      JSON.stringify({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              question_text: "题干",
              student_answer: "学生答案",
              student_solution_steps: ["步骤一"],
              standard_solution_draft: "补齐后的标准解法草稿",
              extraction_confidence: "medium",
              warnings: [],
            }),
          },
        ],
      }),
      { status: 200 },
    );
  },
});

const retryResult = await retryProvider.extractQuestionFromImage({
  image_base64: "iVBORw0KGgo=",
  mime_type: "image/png",
  student_profile_summary: "demo profile",
});
assert.equal(retryResult.ok, true);
assert.equal(retryResult.value.standard_solution_draft, "补齐后的标准解法草稿");
assert.equal(retryCalls.length, 2);
const retryRequestBody = JSON.parse(retryCalls[1].init.body);
assert.equal(
  retryRequestBody.messages[0].content[0].text.includes("上一次模型输出未通过校验"),
  true,
);
assert.equal(
  retryRequestBody.messages[0].content[0].text.includes("secret-key-for-test"),
  false,
);
```

- [ ] **Step 2: Add test that forbidden fields do not retry**

Append this block after the retry success test:

```js
const forbiddenRetryCalls = [];
const forbiddenRetryProvider = createAnthropicCompatibleVisionProvider({
  base_url: "https://example.test/anthropic",
  model: "mimo-v2.5",
  api_key: "secret-key-for-test",
  timeout_ms: 1000,
  fetch_impl: async () => {
    forbiddenRetryCalls.push("called");

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
              memory_delta: { should_persist: true },
            }),
          },
        ],
      }),
      { status: 200 },
    );
  },
});

const forbiddenRetryResult =
  await forbiddenRetryProvider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });
assert.equal(forbiddenRetryResult.ok, false);
assert.equal(forbiddenRetryResult.error.code, "model_invalid_output");
assert.equal(forbiddenRetryCalls.length, 1);
```

- [ ] **Step 3: Run provider test and verify it fails**

Run:

```bash
node scripts/anthropic-compatible-provider.test.mjs
```

Expected:

```text
AssertionError
```

The retry success test should fail because the provider currently performs only one model request.

### Task 4: Provider One-Shot Repair Retry

**Files:**
- Modify: `src/lib/anthropic-compatible-provider.ts`
- Test: `scripts/anthropic-compatible-provider.test.mjs`

- [ ] **Step 1: Add a request mode type**

Add this interface near `AnthropicCompatibleProviderConfig`:

```ts
interface VisionExtractionRequestContext {
  input: VisionExtractionInput;
  repair?: {
    previous_output: string;
    error_message: string;
  };
}
```

- [ ] **Step 2: Extract single request execution into a helper**

Inside `createAnthropicCompatibleVisionProvider`, move the existing fetch body into a private helper in the closure:

```ts
  async function requestVisionExtraction(
    context: VisionExtractionRequestContext,
    signal: AbortSignal,
  ): Promise<VisionProviderResult & { raw_output_text?: string }> {
    const response = await fetchImpl(joinAnthropicMessagesUrl(config.base_url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.api_key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1200,
        temperature: 0,
        thinking: {
          type: "disabled",
        },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: createVisionExtractionPromptText(context),
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: context.input.mime_type,
                  data: context.input.image_base64,
                },
              },
            ],
          },
        ],
      }),
      signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: createProviderError(
          "model_request_failed",
          `MiMo 图片诊断请求失败，HTTP ${response.status}。`,
        ),
      };
    }

    const responsePayload = await readJsonResponse(response);
    if (!responsePayload.ok) {
      return responsePayload;
    }

    const outputText = extractTextContent(responsePayload.value);
    if (!outputText) {
      return {
        ok: false,
        error: createProviderError(
          "model_invalid_output",
          "模型响应中没有可解析的文本内容。",
        ),
      };
    }

    const parsed = parseVisionExtractionText(outputText);
    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error,
        raw_output_text: outputText,
      };
    }

    return {
      ok: true,
      value: parsed.value,
    };
  }
```

- [ ] **Step 3: Add repair prompt creation helper**

Add this helper near `joinAnthropicMessagesUrl`:

```ts
function createVisionExtractionPromptText(
  context: VisionExtractionRequestContext,
): string {
  const basePrompt = createVisionExtractionPrompt({
    student_profile_summary: context.input.student_profile_summary,
  });

  if (!context.repair) {
    return basePrompt;
  }

  return [
    basePrompt,
    "上一次模型输出未通过校验，请重新阅读图片并只输出修正后的合法 JSON。",
    `校验错误：${context.repair.error_message}`,
    "修正要求：补齐缺失字段；把 student_solution_steps 和 warnings 输出为字符串数组；不要输出任何画像、memory_delta 或解释文字。",
    "上一次输出仅供你理解错误类型，不能原样照抄：",
    context.repair.previous_output,
  ].join("\n");
}
```

- [ ] **Step 4: Replace extraction body with one safe retry**

Replace the `try` body in `extractQuestionFromImage` with:

```ts
        const firstAttempt = await requestVisionExtraction(
          { input },
          abortController.signal,
        );
        if (firstAttempt.ok) {
          return firstAttempt;
        }

        if (!shouldRetryInvalidOutput(firstAttempt)) {
          return firstAttempt;
        }

        const retryAttempt = await requestVisionExtraction(
          {
            input,
            repair: {
              previous_output: firstAttempt.raw_output_text,
              error_message: firstAttempt.error.message,
            },
          },
          abortController.signal,
        );

        return retryAttempt.ok ? retryAttempt : firstAttempt;
```

- [ ] **Step 5: Add retry eligibility helper**

Add this helper near `createProviderError`:

```ts
function shouldRetryInvalidOutput(
  result: VisionProviderResult & { raw_output_text?: string },
): result is {
  ok: false;
  error: VisionProviderError;
  raw_output_text: string;
} {
  return (
    !result.ok &&
    result.error.code === "model_invalid_output" &&
    typeof result.raw_output_text === "string" &&
    result.raw_output_text.trim().length > 0 &&
    (result.error.debug_summary?.forbidden_fields.length ?? 0) === 0
  );
}
```

- [ ] **Step 6: Run provider test and verify it passes**

Run:

```bash
node scripts/anthropic-compatible-provider.test.mjs
```

Expected:

```text
anthropic compatible provider test passed
```

- [ ] **Step 7: Commit provider retry**

Run:

```bash
git add src/lib/anthropic-compatible-provider.ts scripts/anthropic-compatible-provider.test.mjs
git commit -m "fix: retry repairable image extraction output"
```

Expected:

```text
commit succeeds with message: fix: retry repairable image extraction output
```

### Task 5: Retained Report Notice and Debug Text

**Files:**
- Modify: `scripts/diagnosis-view-model.test.mjs`
- Modify: `scripts/diagnose-client.test.mjs`
- Modify: `src/lib/diagnosis-view-model.ts`
- Modify: `src/lib/diagnose-client.ts`
- Modify: `src/components/mathtrace-workbench.tsx`
- Test: `scripts/diagnosis-view-model.test.mjs`
- Test: `scripts/diagnose-client.test.mjs`

- [ ] **Step 1: Add retained notice tests with error reason**

Change the two existing retained notice assertions in `scripts/diagnosis-view-model.test.mjs` to:

```js
assert.equal(
  createRetainedReportNotice(
    imageView,
    "模型输出的 student_solution_steps 不合法。",
  ),
  "当前显示的是上一次成功图片诊断结果，本次图片诊断未生成新报告。原因：模型输出的 student_solution_steps 不合法。",
);
assert.equal(
  createRetainedReportNotice(sampleView, "模型输出缺少 standard_solution_draft。"),
  "当前显示的是样例题结果，本次图片诊断未生成新报告。原因：模型输出缺少 standard_solution_draft。",
);
```

- [ ] **Step 2: Add client debug text test for malformed list values**

Append this assertion in `scripts/diagnose-client.test.mjs` after the existing `model_invalid_output` debug assertion:

```js
assert.equal(
  getDiagnoseClientErrorMessage({
    error: {
      code: "model_invalid_output",
      message: "模型输出的 student_solution_steps 不合法。",
      recoverable: true,
    },
    fallback_used: true,
    warnings: [],
    debug_summary: {
      output_kind: "json_object",
      raw_output_length: 240,
      present_fields: [
        "question_text",
        "student_answer",
        "student_solution_steps",
        "standard_solution_draft",
        "extraction_confidence",
        "warnings",
      ],
      missing_fields: [],
      extra_fields: [],
      forbidden_fields: [],
      field_lengths: {
        question_text: 30,
        student_answer: 8,
        standard_solution_draft: 120,
      },
      list_lengths: {
        student_solution_steps: 10,
        warnings: 0,
      },
    },
  }),
  [
    "模型输出的 student_solution_steps 不合法。",
    "开发诊断：模型返回 JSON；已返回字段 question_text, student_answer, student_solution_steps, standard_solution_draft, extraction_confidence, warnings；缺少字段 无；题干长度 30；学生答案长度 8；学生步骤数量 10；warning 数量 0。",
  ].join("\n"),
);
```

- [ ] **Step 3: Run notice/debug tests and verify they fail**

Run:

```bash
node scripts/diagnosis-view-model.test.mjs
node scripts/diagnose-client.test.mjs
```

Expected:

```text
AssertionError
```

- [ ] **Step 4: Update retained notice helper**

Change `createRetainedReportNotice` in `src/lib/diagnosis-view-model.ts` to:

```ts
export function createRetainedReportNotice(
  diagnosis: DiagnosisViewModel,
  errorMessage: string,
): string {
  const prefix =
    diagnosis.source === "image"
      ? "当前显示的是上一次成功图片诊断结果，本次图片诊断未生成新报告。"
      : "当前显示的是样例题结果，本次图片诊断未生成新报告。";

  return `${prefix}原因：${errorMessage}`;
}
```

- [ ] **Step 5: Pass image error reason from workbench catch branch**

In `src/components/mathtrace-workbench.tsx`, change the image catch branch line to:

```ts
        setRetainedReportNotice(createRetainedReportNotice(diagnosisView, message));
```

- [ ] **Step 6: Expand safe debug text with list lengths**

In `src/lib/diagnose-client.ts`, add these constants inside `getDebugText` after `studentAnswerLength`:

```ts
  const studentStepCount = summary.list_lengths.student_solution_steps ?? 0;
  const warningCount = summary.list_lengths.warnings ?? 0;
```

Then change the return string to:

```ts
  return `开发诊断：${outputText}；已返回字段 ${presentFields}；缺少字段 ${missingFields}；题干长度 ${questionLength}；学生答案长度 ${studentAnswerLength}；学生步骤数量 ${studentStepCount}；warning 数量 ${warningCount}。`;
```

- [ ] **Step 7: Update `isModelInvalidOutputError` to require `list_lengths`**

In `src/lib/diagnose-client.ts`, add this condition to the final return expression:

```ts
    isRecord(debugSummary.list_lengths)
```

- [ ] **Step 8: Update existing diagnose-client expected string**

The earlier missing `student_answer` test should now expect the same debug text plus:

```text
；学生步骤数量 2；warning 数量 1。
```

- [ ] **Step 9: Run notice/debug tests and verify they pass**

Run:

```bash
node scripts/diagnosis-view-model.test.mjs
node scripts/diagnose-client.test.mjs
```

Expected:

```text
diagnosis view model regression test passed
diagnose client regression test passed
```

- [ ] **Step 10: Commit UI/debug clarity**

Run:

```bash
git add src/lib/diagnosis-view-model.ts src/lib/diagnose-client.ts src/components/mathtrace-workbench.tsx scripts/diagnosis-view-model.test.mjs scripts/diagnose-client.test.mjs
git commit -m "fix: clarify retained image diagnosis failures"
```

Expected:

```text
commit succeeds with message: fix: clarify retained image diagnosis failures
```

### Task 6: Documentation and Narrative Updates

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `interview/mathtrace-project-narrative.md`

- [ ] **Step 1: Update PRD image diagnosis resilience section**

In `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`, update the P1 image diagnosis section to include:

```md
模型输出作为不可信外部输入处理。`student_solution_steps` 可以从字符串数组、多行字符串、或含 `text`/`content`/`step`/`value` 文本字段的对象数组规范化为内部字符串数组；空项和无法解释的项会被丢弃并生成 warning；超过上限的步骤会被截断。`standard_solution_draft` 仍为必填字段，缺失时 provider 可以在不包含 forbidden fields 的前提下重试一次；重试失败仍返回 recoverable `model_invalid_output`，不会进入画像持久化。
```

- [ ] **Step 2: Update Technical Roadmap P1 hardening**

In `docs/TECHNICAL_ROADMAP.md`, under Phase 2 image recognition P1, add:

```md
- 图片诊断输出韧性：parser 对常见 MiMo 字段值漂移做有界规范化，provider 对安全的结构化失败做一次修复重试，前端明确展示保留报告状态。
```

- [ ] **Step 3: Update interview narrative**

In `interview/mathtrace-project-narrative.md`, add a short paragraph to the MiMo/provider section:

```md
真实测试还暴露了一个比“能不能识别图片”更工程化的问题：模型有时字段名齐全，但字段值不稳定，例如把步骤写成对象数组、空项列表，或漏掉标准解法草稿。我把这类问题放在 provider/parser 边界处理，而不是让后续 Agent Pipeline 猜测模型意图：parser 做有界规范化，provider 对安全的非法输出只重试一次，仍然禁止模型写画像和 `memory_delta`。
```

- [ ] **Step 4: Commit docs**

Run:

```bash
git add docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
git commit -m "docs: document image diagnosis output resilience"
```

Expected:

```text
commit succeeds with message: docs: document image diagnosis output resilience
```

### Task 7: Full Verification and Local Smoke

**Files:**
- No source edits expected.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node scripts/vision-extraction-parser.test.mjs
node scripts/anthropic-compatible-provider.test.mjs
node scripts/diagnosis-view-model.test.mjs
node scripts/diagnose-client.test.mjs
```

Expected:

```text
vision extraction parser test passed
anthropic compatible provider test passed
diagnosis view model regression test passed
diagnose client regression test passed
```

- [ ] **Step 2: Run full project checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected:

```text
all tests pass
lint passes
Next.js build completes
```

- [ ] **Step 3: Run sample API smoke**

Start the dev server if none is running:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3001
```

In another terminal, send a sample request through the app UI or existing local smoke method. Expected response:

```text
HTTP 200
source = sample
fallback_used = false
sample_diagnosis is not null
```

- [ ] **Step 4: Run image API smoke with the same real test image**

Use the browser UI at `http://127.0.0.1:3001` and upload the image that previously produced malformed `student_solution_steps`.

Expected outcomes:

```text
If MiMo returns recoverable malformed steps, the parser normalizes or produces a low-confidence placeholder.
If MiMo omits standard_solution_draft once, provider retries once.
If retry succeeds, right panel updates with a new image report.
If retry fails, left panel shows recoverable error and right panel clearly says it is retaining the previous report with the failure reason.
Low-confidence image results do not persist profile changes.
```

- [ ] **Step 5: Secret and diff checks**

Run:

```bash
git diff --check main
rg "MIMO_API_KEY=(sk-|xai-|[A-Za-z0-9_-]{24,})" README.md docs interview --glob '!docs/reviews/**'
```

Expected:

```text
git diff --check exits 0
rg exits 1 with no matches
```

- [ ] **Step 6: Final commit if verification changed only generated metadata**

If verification produced no source changes, do not create another commit. If a checked-in file changed because of a necessary fix, commit only that fix with a focused message.

## Review Handoff

After implementation and verification, ask for Claude Code review before merging. Use this review focus:

```text
请审查 image diagnosis output resilience 分支，重点看：
1. parser 对 student_solution_steps 的有界规范化是否安全，是否会吞掉真正危险的模型输出；
2. provider 的一次 retry 是否会泄露 API key、图片 base64、raw output，是否可能导致重复副作用；
3. model_invalid_output / low confidence 是否仍然不会写入 memory_delta 或长期画像；
4. sample_diagnosis P0 路径是否完全不受影响；
5. 前端保留报告提示是否准确，不会让用户误以为失败请求已经更新右侧报告；
6. 测试是否覆盖真实问题：缺 standard_solution_draft、字段名齐全但 student_solution_steps 值不合法、forbidden fields 不重试。

请把发现按严重程度排序，并给出文件/行号、复现方式和建议修复。
```

## Execution Options

Plan complete. Recommended execution approach:

1. Subagent-Driven: use one high-intelligence subagent for parser/provider tasks and one high-intelligence subagent for UI/docs/tests review, then Codex integrates and verifies.
2. Inline Execution: execute tasks in this session with `superpowers:executing-plans`, committing after each task group.

Recommended choice: Subagent-Driven for faster parallel review, but Inline Execution is simpler if we want fewer moving parts.
