# P2.8 GLM-OCR Image Extraction Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `glm_ocr` online image extraction provider that calls Zhipu GLM-OCR, maps OCR markdown/layout output into the existing `VisionExtractionDraft`, and preserves the current confirmation, standard-solution, profile-write, and P2.7 RAG boundaries.

**Architecture:** Keep `/api/diagnose` and `VisionExtractionProvider.extractQuestionFromImage()` unchanged from callers' perspective. Add a separate GLM-OCR provider module for the `/layout_parsing` protocol, a pure OCR response parser, and a pure OCR-to-draft mapper; route `VISION_PROVIDER_PROTOCOL=glm_ocr` through the existing provider factory while leaving the unset default as `anthropic`.

**Tech Stack:** Next.js App Router, TypeScript, existing provider interfaces, existing `VisionExtractionDraft`, existing math normalizer, Node `.mjs` + jiti test harness, Zhipu GLM-OCR document parsing API. No new npm dependencies.

## Global Constraints

- `glm_ocr` is optional; if `VISION_PROVIDER_PROTOCOL` is unset, keep the existing `anthropic` default.
- Do not remove or rewrite the existing `anthropic` and `openai` chat vision paths.
- GLM-OCR calls `https://open.bigmodel.cn/api/paas/v4/layout_parsing`; it must not call `/chat/completions`.
- GLM-OCR request body contains only `model`, `file`, and safe OCR options; it must not contain `student_profile_summary`, `student_profile`, `mistake_history`, `memory_delta`, chat `messages`, or repair prompt text.
- GLM-OCR reads `md_results` as primary OCR markdown and `layout_details` as optional layout/text fallback.
- OCR output is untrusted input and must be mapped through local parser/normalizer code before becoming `VisionExtractionDraft`.
- GLM-OCR does not generate standard solution, expected diagnosis, mistake causes, profile deltas, or variant practice.
- `/api/confirm`, evidence level, fingerprint, `memory_delta`, Supabase persistence, localStorage fallback, and P2.7 RAG recommendation rules stay unchanged.
- `sample_diagnosis` stable path must not change.
- Frontend does not call GLM-OCR, read local files, read corpus artifacts, or receive provider API keys.
- Do not log or commit API keys, image base64, raw OCR response, full student answer, `.env*`, `artifacts/**`, or `docs/reviews/*.md`.
- Official request details used by this plan: `POST /api/paas/v4/layout_parsing`, `model: "glm-ocr"`, `file` supports URL/base64, image formats include JPG/PNG and single image size is `<=10MB`.

---

## File Structure

- Modify `src/lib/providers/anthropic-compatible-provider.ts`
  - Extend `VisionProviderProtocol` with `"glm_ocr"`.
  - Keep existing `anthropic` default.
  - Delegate `createVisionProvider({ protocol: "glm_ocr" })` to the new GLM-OCR provider.
- Create `src/lib/providers/glm-ocr-response-parser.ts`
  - Pure runtime parser for GLM-OCR success/error payloads.
  - Extracts safe OCR markdown and layout blocks without preserving raw provider response.
- Create `src/lib/vision-extraction/glm-ocr-draft-mapper.ts`
  - Pure mapper from OCR markdown/layout blocks to `VisionExtractionDraft`.
  - Handles question/answer split, step split, confidence, warnings, and math normalization.
- Create `src/lib/providers/glm-ocr-provider.ts`
  - Implements `VisionExtractionProvider` for the GLM-OCR `/layout_parsing` endpoint.
  - Handles request URL/body/headers, timeout/network/HTTP/JSON errors, image size guard, response parser, and mapper.
- Modify `scripts/tests/providers/anthropic-compatible-provider.test.mjs`
  - Cover protocol config and factory routing for `glm_ocr`, plus default protocol preservation.
- Create `scripts/tests/providers/glm-ocr-response-parser.test.mjs`
  - Cover `md_results`, `layout_details` fallback, empty content, ignored visualization/usage fields, and error object handling.
- Create `scripts/tests/image-diagnosis/glm-ocr-draft-mapper.test.mjs`
  - Cover题干+作答、仅题干、显式 `解：`、layout content fallback, formula preservation, long text truncation, and warning behavior.
- Create `scripts/tests/providers/glm-ocr-provider.test.mjs`
  - Cover endpoint, request body safety, response mapping, error mapping, timeout/network behavior, no chat repair retry, and image-size guard.
- Modify `scripts/tests/smoke/api-smoke.test.mjs`
  - Add one injected real GLM-OCR provider smoke through `handleDiagnoseRequest`.
- Modify `scripts/run-tests.mjs`
  - Add new test files to the default suite near existing provider/image-diagnosis tests.
- Modify docs after implementation:
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `docs/TECHNICAL_ROADMAP.md`
  - `interview/mathtrace-project-narrative.md`

---

### Task 1: Protocol Config And Factory Routing

**Files:**
- Modify: `src/lib/providers/anthropic-compatible-provider.ts`
- Modify: `scripts/tests/providers/anthropic-compatible-provider.test.mjs`

**Interfaces:**
- Consumes: existing `createVisionProviderConfigFromEnv(env)` and `createVisionProvider(config)`.
- Produces:
  - `export type VisionProviderProtocol = "anthropic" | "openai" | "glm_ocr";`
  - `createVisionProvider({ protocol: "glm_ocr", ... })` returns a GLM-OCR provider.
  - `readProviderProtocol()` recognizes only exact `glm_ocr` and `openai`; all other values keep current `anthropic` fallback.

- [ ] **Step 1: Write failing protocol tests**

Append these assertions to `scripts/tests/providers/anthropic-compatible-provider.test.mjs` after the current env config assertions:

```js
{
  const defaultConfig = createVisionProviderConfigFromEnv({
    VISION_PROVIDER_API_KEY: "secret-key-for-test",
  });
  assert.equal(defaultConfig.ok, true);
  assert.equal(defaultConfig.value.protocol, "anthropic");
}

{
  const glmOcrConfig = createVisionProviderConfigFromEnv({
    VISION_PROVIDER_API_KEY: "secret-key-for-test",
    VISION_PROVIDER_PROTOCOL: "glm_ocr",
    VISION_PROVIDER_BASE_URL: "https://open.bigmodel.cn/api/paas/v4",
    VISION_PROVIDER_MODEL: "glm-ocr",
    VISION_PROVIDER_NAME: "glm_ocr",
    VISION_PROVIDER_IMAGE_FORMAT: "data_url",
  });
  assert.equal(glmOcrConfig.ok, true);
  assert.equal(glmOcrConfig.value.protocol, "glm_ocr");
  assert.equal(glmOcrConfig.value.base_url, "https://open.bigmodel.cn/api/paas/v4");
  assert.equal(glmOcrConfig.value.model, "glm-ocr");
  assert.equal(glmOcrConfig.value.provider_name, "glm_ocr");
  assert.equal(glmOcrConfig.value.image_format, "base64");
}

{
  const unknownProtocolConfig = createVisionProviderConfigFromEnv({
    VISION_PROVIDER_API_KEY: "secret-key-for-test",
    VISION_PROVIDER_PROTOCOL: "glm-ocr",
  });
  assert.equal(unknownProtocolConfig.ok, true);
  assert.equal(unknownProtocolConfig.value.protocol, "anthropic");
}
```

- [ ] **Step 2: Run the provider test and verify failure**

Run:

```bash
node scripts/tests/providers/anthropic-compatible-provider.test.mjs
```

Expected: fails because `glm_ocr` still falls back to `anthropic`.

- [ ] **Step 3: Implement protocol recognition and factory routing**

In `src/lib/providers/anthropic-compatible-provider.ts`, add a type-only-safe runtime import near the top:

```ts
import { createGlmOcrVisionProvider } from "@/lib/providers/glm-ocr-provider";
```

Update the protocol type:

```ts
export type VisionProviderProtocol = "anthropic" | "openai" | "glm_ocr";
```

Add this guard as the first branch in `createVisionProvider`:

```ts
export function createVisionProvider(
  config: VisionProviderRuntimeConfig,
): VisionExtractionProvider {
  if (config.protocol === "glm_ocr") {
    return createGlmOcrVisionProvider(config);
  }

  const fetchImpl = config.fetch_impl ?? fetch;
  const providerName = normalizeProviderName(config.provider_name);
  // existing chat provider implementation continues unchanged
}
```

Update `readProviderProtocol`:

```ts
function readProviderProtocol(
  env: Record<string, string | undefined>,
): VisionProviderProtocol {
  const protocol = env.VISION_PROVIDER_PROTOCOL?.trim();
  if (protocol === "glm_ocr") {
    return "glm_ocr";
  }

  return protocol === "openai" ? "openai" : "anthropic";
}
```

Create a temporary minimal `src/lib/providers/glm-ocr-provider.ts` so the import compiles; Task 4 replaces its body:

```ts
import type {
  VisionExtractionProvider,
  VisionProviderConfig,
} from "@/lib/providers/anthropic-compatible-provider";

interface GlmOcrRuntimeConfig extends VisionProviderConfig {
  fetch_impl?: typeof fetch;
}

export function createGlmOcrVisionProvider(
  _config: GlmOcrRuntimeConfig,
): VisionExtractionProvider {
  return {
    async extractQuestionFromImage() {
      return {
        ok: false,
        error: {
          code: "model_request_failed",
          message: "GLM-OCR provider 尚未完成实现。",
          recoverable: true,
        },
      };
    },
  };
}
```

- [ ] **Step 4: Run the provider test**

Run:

```bash
node scripts/tests/providers/anthropic-compatible-provider.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

Stage only the touched files:

```bash
git add src/lib/providers/anthropic-compatible-provider.ts src/lib/providers/glm-ocr-provider.ts scripts/tests/providers/anthropic-compatible-provider.test.mjs
git commit -m "feat: add glm ocr provider protocol"
```

---

### Task 2: GLM-OCR Response Parser

**Files:**
- Create: `src/lib/providers/glm-ocr-response-parser.ts`
- Create: `scripts/tests/providers/glm-ocr-response-parser.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes: raw unknown GLM-OCR JSON payload.
- Produces:
  - `export interface GlmOcrLayoutBlock`
  - `export interface GlmOcrParsedContent`
  - `export type GlmOcrParseResult`
  - `export function parseGlmOcrResponse(value: unknown): GlmOcrParseResult`

- [ ] **Step 1: Write failing parser tests**

Create `scripts/tests/providers/glm-ocr-response-parser.test.mjs`:

```js
import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { parseGlmOcrResponse } = jiti(
  "./src/lib/providers/glm-ocr-response-parser.ts",
);

{
  const parsed = parseGlmOcrResponse({
    id: "task_123456789",
    model: "GLM-OCR",
    md_results: "15. 已知函数 $f(x)=x^2$。\n\n解：\n$f'(x)=2x$",
    layout_details: [
      [
        {
          index: 2,
          label: "formula",
          bbox_2d: [0.1, 0.2, 0.8, 0.3],
          content: "$f'(x)=2x$",
          height: 800,
          width: 600,
        },
        {
          index: 1,
          label: "text",
          content: "15. 已知函数 $f(x)=x^2$。",
        },
      ],
    ],
    layout_visualization: ["https://example.test/unsafe-preview.png"],
    usage: { total_tokens: 10 },
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.markdown.includes("已知函数"), true);
  assert.deepEqual(
    parsed.value.layout_blocks.map((block) => block.index),
    [1, 2],
  );
  assert.equal(JSON.stringify(parsed.value).includes("layout_visualization"), false);
  assert.equal(JSON.stringify(parsed.value).includes("total_tokens"), false);
}

{
  const parsed = parseGlmOcrResponse({
    md_results: "",
    layout_details: [
      [
        { index: 1, label: "text", content: "15. 已知函数 $f(x)=x^2$。" },
        { index: 2, label: "formula", content: "$f'(x)=2x$" },
      ],
    ],
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.markdown, "15. 已知函数 $f(x)=x^2$。\n$f'(x)=2x$");
  assert.deepEqual(parsed.value.warnings, [
    "GLM-OCR 未返回 md_results，已使用 layout_details 文本拼接。",
  ]);
}

{
  const parsed = parseGlmOcrResponse({
    md_results: "",
    layout_details: [[{ index: 1, label: "image", content: "" }]],
  });

  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure_kind, "empty_text_content");
}

{
  const parsed = parseGlmOcrResponse({
    error: {
      code: "invalid_request",
      message: "bad file",
    },
  });

  assert.equal(parsed.ok, false);
  assert.equal(parsed.failure_kind, "http_error");
  assert.equal(parsed.safe_error_message, "invalid_request: bad file");
}
```

- [ ] **Step 2: Run parser test and verify failure**

Run:

```bash
node scripts/tests/providers/glm-ocr-response-parser.test.mjs
```

Expected: fails because parser file does not exist.

- [ ] **Step 3: Implement response parser**

Create `src/lib/providers/glm-ocr-response-parser.ts`:

```ts
import { isRecord } from "@/lib/shared/utils";
import type { ProviderFailureKind } from "@/lib/shared/provider-error";

export interface GlmOcrLayoutBlock {
  index: number;
  label: string;
  content: string;
  bbox_2d?: number[];
}

export interface GlmOcrParsedContent {
  markdown: string;
  layout_blocks: GlmOcrLayoutBlock[];
  warnings: string[];
}

export type GlmOcrParseResult =
  | { ok: true; value: GlmOcrParsedContent }
  | {
      ok: false;
      failure_kind: ProviderFailureKind;
      safe_error_message?: string;
    };

export function parseGlmOcrResponse(value: unknown): GlmOcrParseResult {
  if (!isRecord(value)) {
    return { ok: false, failure_kind: "empty_text_content" };
  }

  const safeErrorMessage = extractSafeErrorMessage(value.error);
  if (safeErrorMessage) {
    return {
      ok: false,
      failure_kind: "http_error",
      safe_error_message: safeErrorMessage,
    };
  }

  const layoutBlocks = parseLayoutBlocks(value.layout_details);
  const markdown = typeof value.md_results === "string" ? value.md_results.trim() : "";
  if (markdown.length > 0) {
    return {
      ok: true,
      value: {
        markdown,
        layout_blocks: layoutBlocks,
        warnings: [],
      },
    };
  }

  const layoutText = layoutBlocks
    .map((block) => block.content.trim())
    .filter((content) => content.length > 0)
    .join("\n")
    .trim();

  if (layoutText.length === 0) {
    return { ok: false, failure_kind: "empty_text_content" };
  }

  return {
    ok: true,
    value: {
      markdown: layoutText,
      layout_blocks: layoutBlocks,
      warnings: ["GLM-OCR 未返回 md_results，已使用 layout_details 文本拼接。"],
    },
  };
}

function parseLayoutBlocks(value: unknown): GlmOcrLayoutBlock[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((page) => (Array.isArray(page) ? page : []))
    .map(parseLayoutBlock)
    .filter((block): block is GlmOcrLayoutBlock => block !== null)
    .sort((left, right) => left.index - right.index);
}

function parseLayoutBlock(value: unknown): GlmOcrLayoutBlock | null {
  if (!isRecord(value)) {
    return null;
  }

  const content = typeof value.content === "string" ? value.content.trim() : "";
  const index = typeof value.index === "number" ? value.index : Number.MAX_SAFE_INTEGER;
  const label = typeof value.label === "string" ? value.label.trim() : "unknown";
  const bbox = Array.isArray(value.bbox_2d)
    ? value.bbox_2d.filter((item): item is number => typeof item === "number")
    : undefined;

  return {
    index,
    label: label || "unknown",
    content,
    ...(bbox && bbox.length === 4 ? { bbox_2d: bbox } : {}),
  };
}

function extractSafeErrorMessage(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const code = typeof value.code === "string" ? value.code.trim() : "";
  const message = typeof value.message === "string" ? value.message.trim() : "";
  const combined = [code, message].filter(Boolean).join(": ");

  return combined.length > 0 ? combined.slice(0, 160) : undefined;
}
```

- [ ] **Step 4: Add parser test to default suite**

In `scripts/run-tests.mjs`, add this path near the provider tests:

```js
"scripts/tests/providers/glm-ocr-response-parser.test.mjs",
```

- [ ] **Step 5: Run parser test**

Run:

```bash
node scripts/tests/providers/glm-ocr-response-parser.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/providers/glm-ocr-response-parser.ts scripts/tests/providers/glm-ocr-response-parser.test.mjs scripts/run-tests.mjs
git commit -m "feat: parse glm ocr responses"
```

---

### Task 3: OCR Markdown To Draft Mapper

**Files:**
- Create: `src/lib/vision-extraction/glm-ocr-draft-mapper.ts`
- Create: `scripts/tests/image-diagnosis/glm-ocr-draft-mapper.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes: `GlmOcrParsedContent` from Task 2.
- Produces:
  - `export function mapGlmOcrContentToDraft(content: GlmOcrParsedContent): VisionExtractionDraft`

- [ ] **Step 1: Write failing mapper tests**

Create `scripts/tests/image-diagnosis/glm-ocr-draft-mapper.test.mjs`:

```js
import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { mapGlmOcrContentToDraft } = jiti(
  "./src/lib/vision-extraction/glm-ocr-draft-mapper.ts",
);

{
  const draft = mapGlmOcrContentToDraft({
    markdown:
      "15.（本小题满分13分）已知函数 $f(x)=\\frac{1}{2}x^2-a\\ln x+2a$，其中 $a\\in\\mathbb{R}$。\n（1）讨论函数 $f(x)$ 的单调性；（2）若函数 $f(x)$ 有两个零点，求 $a$ 的取值范围。\n\n解：\n$f'(x)=x-\\frac{a}{x}=\\frac{x^2-a}{x}, x\\in(0,+\\infty)$",
    layout_blocks: [],
    warnings: [],
  });

  assert.equal(draft.question_text.includes("两个零点"), true);
  assert.equal(draft.question_text.includes("解："), false);
  assert.equal(draft.student_answer.includes("f'"), true);
  assert.deepEqual(draft.student_solution_steps, [
    "$f'(x)=x-\\frac{a}{x}=\\frac{x^2-a}{x}, x\\in(0,+\\infty)$",
  ]);
  assert.equal(draft.extraction_confidence, "medium");
  assert.deepEqual(draft.warnings, []);
}

{
  const draft = mapGlmOcrContentToDraft({
    markdown:
      "15. 已知函数 f(x)=ln x-ax+1。（1）讨论函数 f(x) 的单调性；（2）若有两个零点，求 a 的范围。",
    layout_blocks: [],
    warnings: [],
  });

  assert.equal(draft.student_answer, "未识别到学生答案");
  assert.deepEqual(draft.student_solution_steps, []);
  assert.equal(draft.extraction_confidence, "low");
  assert.equal(
    draft.warnings.includes("未识别到清晰学生作答区域，请确认图片中包含学生答案或解题痕迹。"),
    true,
  );
  assert.equal(draft.question_text.includes("$f(x)=\\ln x-ax+1$"), true);
}

{
  const draft = mapGlmOcrContentToDraft({
    markdown: "15. 已知函数 $f(x)=x^3-3ax+1$，讨论单调性。",
    layout_blocks: [
      { index: 1, label: "text", content: "15. 已知函数 $f(x)=x^3-3ax+1$，讨论单调性。" },
      { index: 2, label: "formula", content: "$f'(x)=3x^2-3a$" },
      { index: 3, label: "text", content: "令 $f'(x)=0$ 得 $x=\\sqrt a$" },
    ],
    warnings: ["GLM-OCR 未返回 md_results，已使用 layout_details 文本拼接。"],
  });

  assert.equal(draft.student_answer.includes("$f'(x)=3x^2-3a$"), true);
  assert.deepEqual(draft.student_solution_steps, [
    "$f'(x)=3x^2-3a$",
    "令 $f'(x)=0$ 得 $x=\\sqrt a$",
  ]);
  assert.equal(draft.warnings.includes("GLM-OCR 未返回 md_results，已使用 layout_details 文本拼接。"), true);
}

{
  const longText = `15. 已知函数 $f(x)=x^2$，求单调性。\n\n解：\n${Array.from({ length: 12 }, (_, index) => `${index + 1}. 推导步骤 $x=${index}$`).join("\n")}`;
  const draft = mapGlmOcrContentToDraft({
    markdown: longText,
    layout_blocks: [],
    warnings: [],
  });

  assert.equal(draft.student_solution_steps.length, 8);
  assert.equal(draft.warnings.includes("GLM-OCR 识别的学生步骤超过 8 条，已截取前 8 条。"), true);
}
```

- [ ] **Step 2: Run mapper test and verify failure**

Run:

```bash
node scripts/tests/image-diagnosis/glm-ocr-draft-mapper.test.mjs
```

Expected: fails because mapper file does not exist.

- [ ] **Step 3: Implement mapper**

Create `src/lib/vision-extraction/glm-ocr-draft-mapper.ts`:

```ts
import { normalizeExtractedMathText } from "@/lib/math/math-extraction-normalizer";
import type { GlmOcrParsedContent } from "@/lib/providers/glm-ocr-response-parser";
import type { VisionExtractionDraft } from "@/lib/vision-extraction/vision-extraction-types";

const MISSING_STUDENT_ANSWER = "未识别到学生答案";
const MISSING_STUDENT_ANSWER_WARNING =
  "未识别到清晰学生作答区域，请确认图片中包含学生答案或解题痕迹。";
const MAX_STEPS = 8;

export function mapGlmOcrContentToDraft(
  content: GlmOcrParsedContent,
): VisionExtractionDraft {
  const warnings = [...content.warnings];
  const orderedLayoutText = getOrderedLayoutText(content);
  const sourceText = orderedLayoutText || content.markdown;
  const split = splitQuestionAndAnswer(sourceText);

  if (!split.answerText) {
    return {
      question_text: normalizeExtractedMathText(split.questionText),
      student_answer: MISSING_STUDENT_ANSWER,
      student_solution_steps: [],
      extraction_confidence: "low",
      warnings: appendUnique(warnings, MISSING_STUDENT_ANSWER_WARNING),
    };
  }

  const steps = splitStudentSteps(split.answerText);
  const truncatedSteps = steps.slice(0, MAX_STEPS);
  if (steps.length > MAX_STEPS) {
    warnings.push("GLM-OCR 识别的学生步骤超过 8 条，已截取前 8 条。");
  }

  return {
    question_text: normalizeExtractedMathText(split.questionText),
    student_answer: normalizeExtractedMathText(split.answerText),
    student_solution_steps: truncatedSteps.map((step) =>
      normalizeExtractedMathText(step),
    ),
    extraction_confidence: truncatedSteps.length > 0 ? "medium" : "low",
    warnings,
  };
}

function getOrderedLayoutText(content: GlmOcrParsedContent): string {
  const text = content.layout_blocks
    .filter((block) => block.content.trim().length > 0)
    .map((block) => block.content.trim())
    .join("\n")
    .trim();

  return text.length > 0 ? text : "";
}

function splitQuestionAndAnswer(text: string): {
  questionText: string;
  answerText: string;
} {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const explicitAnswerMatch = /\n\s*(?:解|证明|答|学生答案|学生作答)\s*[:：]\s*/.exec(normalized);
  if (explicitAnswerMatch) {
    const start = explicitAnswerMatch.index;
    const answerStart = start + explicitAnswerMatch[0].length;
    return {
      questionText: normalized.slice(0, start).trim(),
      answerText: normalized.slice(answerStart).trim(),
    };
  }

  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const answerStartIndex = lines.findIndex((line, index) => {
    return index > 0 && isLikelyStudentStep(line);
  });

  if (answerStartIndex > 0) {
    return {
      questionText: lines.slice(0, answerStartIndex).join("\n"),
      answerText: lines.slice(answerStartIndex).join("\n"),
    };
  }

  return {
    questionText: normalized,
    answerText: "",
  };
}

function isLikelyStudentStep(line: string): boolean {
  return (
    /(?:f'|导|令|得|所以|因此|=|\\frac|\\sqrt|\\ln)/.test(line) &&
    !/(已知|求|讨论|证明|若|其中|小题|满分)/.test(line)
  );
}

function splitStudentSteps(text: string): string[] {
  return text
    .split(/\n|；|;/)
    .map((line) => line.replace(/^\s*\d+[.、)]\s*/, "").trim())
    .filter(Boolean);
}

function appendUnique(items: string[], item: string): string[] {
  return items.includes(item) ? items : [...items, item];
}
```

- [ ] **Step 4: Add mapper test to default suite**

In `scripts/run-tests.mjs`, add:

```js
"scripts/tests/image-diagnosis/glm-ocr-draft-mapper.test.mjs",
```

- [ ] **Step 5: Run mapper test**

Run:

```bash
node scripts/tests/image-diagnosis/glm-ocr-draft-mapper.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/vision-extraction/glm-ocr-draft-mapper.ts scripts/tests/image-diagnosis/glm-ocr-draft-mapper.test.mjs scripts/run-tests.mjs
git commit -m "feat: map glm ocr output to extraction draft"
```

---

### Task 4: GLM-OCR Provider Implementation

**Files:**
- Modify: `src/lib/providers/glm-ocr-provider.ts`
- Create: `scripts/tests/providers/glm-ocr-provider.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes:
  - `createGlmOcrVisionProvider(config).extractQuestionFromImage(input)`
  - `parseGlmOcrResponse(value)`
  - `mapGlmOcrContentToDraft(content)`
- Produces:
  - Real `VisionExtractionProvider` implementation for `protocol: "glm_ocr"`.

- [ ] **Step 1: Write failing provider tests**

Create `scripts/tests/providers/glm-ocr-provider.test.mjs`:

```js
import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { createGlmOcrVisionProvider } = jiti("./src/lib/providers/glm-ocr-provider.ts");

const baseConfig = {
  protocol: "glm_ocr",
  base_url: "https://open.bigmodel.cn/api/paas/v4",
  model: "glm-ocr",
  api_key: "secret-key-for-test",
  provider_name: "glm_ocr",
  image_format: "data_url",
  timeout_ms: 1000,
};

{
  const calls = [];
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    fetch_impl: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          id: "task_123456789",
          model: "GLM-OCR",
          md_results:
            "15. 已知函数 $f(x)=x^2$，求单调性。\n\n解：\n$f'(x)=2x$",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    },
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile must not be sent",
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://open.bigmodel.cn/api/paas/v4/layout_parsing");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer secret-key-for-test");
  assert.equal(calls[0].init.headers["content-type"], "application/json");

  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "glm-ocr");
  assert.equal(body.file, "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(body.need_layout_visualization, false);
  assert.equal(body.return_crop_images, false);
  assert.equal("messages" in body, false);
  assert.equal(JSON.stringify(body).includes("demo profile"), false);
  assert.equal(JSON.stringify(body).includes("student_profile_summary"), false);
  assert.equal(result.value.question_text.includes("已知函数"), true);
  assert.equal(result.value.student_answer.includes("2x"), true);
}

{
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    fetch_impl: async () =>
      new Response(JSON.stringify({ error: { code: "bad_file", message: "bad file" } }), {
        status: 400,
      }),
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "model_request_failed");
  assert.deepEqual(result.error.provider_debug, {
    provider_name: "glm_ocr",
    provider_stage: "ocr",
    failure_kind: "http_error",
    http_status: 400,
  });
  assert.equal(result.error.message.includes("secret-key-for-test"), false);
}

{
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    fetch_impl: async () => new Response("not-json", { status: 200 }),
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "model_request_failed");
  assert.equal(result.error.provider_debug.failure_kind, "invalid_json");
  assert.equal(result.error.provider_debug.provider_stage, "ocr");
}

{
  let callCount = 0;
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    fetch_impl: async () => {
      callCount += 1;
      return new Response(JSON.stringify({ md_results: "" }), { status: 200 });
    },
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "model_invalid_output");
  assert.equal(result.error.provider_debug.failure_kind, "empty_text_content");
  assert.equal(result.error.provider_debug.provider_stage, "ocr");
  assert.equal(callCount, 1);
}

{
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    fetch_impl: async () => {
      throw new Error("network down");
    },
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: "iVBORw0KGgo=",
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "model_request_failed");
  assert.equal(result.error.provider_debug.failure_kind, "network_failed");
}

{
  const largeBase64 = Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64");
  let called = false;
  const provider = createGlmOcrVisionProvider({
    ...baseConfig,
    fetch_impl: async () => {
      called = true;
      return new Response(JSON.stringify({ md_results: "should not call" }), { status: 200 });
    },
  });

  const result = await provider.extractQuestionFromImage({
    image_base64: largeBase64,
    mime_type: "image/png",
    student_profile_summary: "demo profile",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "model_request_failed");
  assert.equal(result.error.message.includes("10MB"), true);
  assert.equal(called, false);
}
```

- [ ] **Step 2: Run provider test and verify failure**

Run:

```bash
node scripts/tests/providers/glm-ocr-provider.test.mjs
```

Expected: fails because Task 1 provider is still a stub.

- [ ] **Step 3: Implement provider**

Replace `src/lib/providers/glm-ocr-provider.ts` with:

```ts
import type {
  VisionExtractionInput,
  VisionExtractionProvider,
  VisionProviderConfig,
  VisionProviderError,
  VisionProviderResult,
} from "@/lib/providers/anthropic-compatible-provider";
import { parseGlmOcrResponse } from "@/lib/providers/glm-ocr-response-parser";
import type { ProviderFailureDebug, ProviderFailureKind } from "@/lib/shared/provider-error";
import { mapGlmOcrContentToDraft } from "@/lib/vision-extraction/glm-ocr-draft-mapper";

interface GlmOcrRuntimeConfig extends VisionProviderConfig {
  fetch_impl?: typeof fetch;
}

const MAX_GLM_OCR_IMAGE_BYTES = 10 * 1024 * 1024;

export function createGlmOcrVisionProvider(
  config: GlmOcrRuntimeConfig,
): VisionExtractionProvider {
  const fetchImpl = config.fetch_impl ?? fetch;
  const providerName = normalizeProviderName(config.provider_name);

  return {
    async extractQuestionFromImage(
      input: VisionExtractionInput,
    ): Promise<VisionProviderResult> {
      const imageSize = estimateBase64Bytes(input.image_base64);
      if (imageSize > MAX_GLM_OCR_IMAGE_BYTES) {
        return {
          ok: false,
          error: createProviderError(
            "model_request_failed",
            "上传图片超过 GLM-OCR 单图 10MB 限制，请压缩后重试。",
          ),
        };
      }

      const abortController = new AbortController();
      const timeout = setTimeout(() => {
        abortController.abort(new DOMException("timeout", "TimeoutError"));
      }, config.timeout_ms);

      try {
        const response = await fetchImpl(joinGlmOcrLayoutParsingUrl(config.base_url), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${config.api_key}`,
          },
          body: JSON.stringify(buildGlmOcrRequestBody(config, input)),
          signal: abortController.signal,
        });

        if (!response.ok) {
          return {
            ok: false,
            error: createProviderError(
              "model_request_failed",
              `GLM-OCR 服务返回 HTTP ${response.status}，请稍后重试。`,
              createProviderFailureDebug(providerName, {
                failure_kind: "http_error",
                http_status: response.status,
              }),
            ),
          };
        }

        const payload = await readJsonResponse(response, providerName);
        if (!payload.ok) {
          return payload;
        }

        const parsed = parseGlmOcrResponse(payload.value);
        if (!parsed.ok) {
          return {
            ok: false,
            error: createProviderError(
              parsed.failure_kind === "empty_text_content"
                ? "model_invalid_output"
                : "model_request_failed",
              parsed.failure_kind === "empty_text_content"
                ? "GLM-OCR 响应中没有可解析的文本内容。"
                : "GLM-OCR 响应包含错误信息，请稍后重试。",
              createProviderFailureDebug(providerName, {
                failure_kind: parsed.failure_kind,
              }),
            ),
          };
        }

        return {
          ok: true,
          value: mapGlmOcrContentToDraft(parsed.value),
        };
      } catch {
        if (abortController.signal.aborted) {
          return {
            ok: false,
            error: createProviderError(
              "model_timeout",
              "GLM-OCR 请求超时，请稍后重试。",
              createProviderFailureDebug(providerName, {
                failure_kind: "timeout",
              }),
            ),
          };
        }

        return {
          ok: false,
          error: createProviderError(
            "model_request_failed",
            "GLM-OCR 网络请求失败，请稍后重试。",
            createProviderFailureDebug(providerName, {
              failure_kind: "network_failed",
            }),
          ),
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function joinGlmOcrLayoutParsingUrl(baseUrl: string): string {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  return normalizedBaseUrl.endsWith("/layout_parsing")
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}/layout_parsing`;
}

function buildGlmOcrRequestBody(
  config: GlmOcrRuntimeConfig,
  input: VisionExtractionInput,
): Record<string, unknown> {
  return {
    model: config.model,
    file:
      config.image_format === "base64"
        ? input.image_base64
        : `data:${input.mime_type};base64,${input.image_base64}`,
    return_crop_images: false,
    need_layout_visualization: false,
  };
}

async function readJsonResponse(
  response: Response,
  providerName: string,
): Promise<{ ok: true; value: unknown } | { ok: false; error: VisionProviderError }> {
  try {
    return {
      ok: true,
      value: await response.json(),
    };
  } catch {
    return {
      ok: false,
      error: createProviderError(
        "model_request_failed",
        "GLM-OCR 响应不是合法 JSON，请稍后重试。",
        createProviderFailureDebug(providerName, {
          failure_kind: "invalid_json",
        }),
      ),
    };
  }
}

function createProviderError(
  code: VisionProviderError["code"],
  message: string,
  providerDebug?: ProviderFailureDebug,
): VisionProviderError {
  return {
    code,
    message,
    recoverable: true,
    provider_debug: providerDebug,
  };
}

function createProviderFailureDebug(
  providerName: string,
  input: {
    failure_kind: ProviderFailureKind;
    http_status?: number;
  },
): ProviderFailureDebug {
  return typeof input.http_status === "number"
    ? {
        provider_name: providerName,
        provider_stage: "ocr",
        failure_kind: input.failure_kind,
        http_status: input.http_status,
      }
    : {
        provider_name: providerName,
        provider_stage: "ocr",
        failure_kind: input.failure_kind,
      };
}

function normalizeProviderName(providerName: string | undefined): string {
  const normalized = providerName?.trim();
  return normalized || "glm_ocr";
}

function estimateBase64Bytes(value: string): number {
  const normalized = value.replace(/^data:[^,]+,/, "").replace(/\s/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}
```

- [ ] **Step 4: Add provider test to default suite**

In `scripts/run-tests.mjs`, add:

```js
"scripts/tests/providers/glm-ocr-provider.test.mjs",
```

- [ ] **Step 5: Run provider tests**

Run:

```bash
node scripts/tests/providers/glm-ocr-response-parser.test.mjs
node scripts/tests/image-diagnosis/glm-ocr-draft-mapper.test.mjs
node scripts/tests/providers/glm-ocr-provider.test.mjs
node scripts/tests/providers/anthropic-compatible-provider.test.mjs
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/providers/glm-ocr-provider.ts scripts/tests/providers/glm-ocr-provider.test.mjs scripts/run-tests.mjs
git commit -m "feat: implement glm ocr vision provider"
```

---

### Task 5: Diagnose Integration Smoke

**Files:**
- Modify: `scripts/tests/smoke/api-smoke.test.mjs`

**Interfaces:**
- Consumes: `createVisionProvider({ protocol: "glm_ocr", fetch_impl })` from Task 4.
- Produces: smoke coverage that the real GLM-OCR provider can be injected into `handleDiagnoseRequest` and return `extraction_review` without writing profile fields.

- [ ] **Step 1: Write failing smoke assertion**

Add this import near existing imports in `scripts/tests/smoke/api-smoke.test.mjs`:

```js
const { createVisionProvider } = jiti("./src/lib/providers/anthropic-compatible-provider.ts");
```

After the existing fake vision provider extraction assertions, add:

```js
const glmOcrVisionProvider = createVisionProvider({
  protocol: "glm_ocr",
  base_url: "https://open.bigmodel.cn/api/paas/v4",
  model: "glm-ocr",
  api_key: "secret-key-for-test",
  provider_name: "glm_ocr",
  image_format: "data_url",
  timeout_ms: 1000,
  fetch_impl: async () =>
    new Response(
      JSON.stringify({
        id: "task_123456789",
        model: "GLM-OCR",
        md_results:
          "15. 已知函数 $f(x)=\\ln x-ax+1$，讨论单调性。\n\n解：\n$f'(x)=1/x-a$",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
});

const glmOcrExtractionResult = await handleDiagnoseRequest(
  {
    ...samplePayload,
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: "iVBORw0KGgo=",
    image_mime_type: "image/png",
  },
  { vision_provider: glmOcrVisionProvider },
);

assert.equal(glmOcrExtractionResult.status, 200);
assert.equal(glmOcrExtractionResult.body.stage, "extraction_review");
assert.equal(isDiagnoseImageExtractionResponse(glmOcrExtractionResult.body), true);
assert.equal(
  glmOcrExtractionResult.body.recognized_question.question_text.includes("单调性"),
  true,
);
assert.equal(
  glmOcrExtractionResult.body.recognized_question.student_answer.includes("1/x-a"),
  true,
);
assert.equal("memory_delta" in glmOcrExtractionResult.body, false);
assert.equal("student_profile" in glmOcrExtractionResult.body, false);
```

- [ ] **Step 2: Run smoke test**

Run:

```bash
node scripts/tests/smoke/api-smoke.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run focused default tests**

Run:

```bash
node scripts/run-tests.mjs default
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/tests/smoke/api-smoke.test.mjs
git commit -m "test: smoke glm ocr image extraction"
```

---

### Task 6: Documentation And Narrative Closure

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `interview/mathtrace-project-narrative.md`

**Interfaces:**
- Consumes: final code behavior from Tasks 1-5.
- Produces: docs aligned with actual provider protocol, boundaries, tests, and interview narrative.

- [ ] **Step 1: Update PRD provider section**

In `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`, update the image diagnosis provider section around the current `VISION_PROVIDER_PROTOCOL` paragraph to include:

```md
P2.8 起，图片抽取 provider 支持三类协议：`anthropic`、`openai` 和 `glm_ocr`。未设置 `VISION_PROVIDER_PROTOCOL` 时仍保持原有 `anthropic` 默认行为；`glm_ocr` 需要显式配置，不自动替换现有本地 demo 配置。

`glm_ocr` 使用智谱 GLM-OCR 文档解析接口 `/api/paas/v4/layout_parsing`，请求只发送 `model`、当前上传图片的 `file` 和安全 OCR 选项，不发送 `student_profile_summary`、学生画像、错题历史、`memory_delta` 或 chat repair prompt。GLM-OCR 只负责从图片得到 OCR markdown/layout，并由本地 mapper 转成 `VisionExtractionDraft`；它不生成标准解法、错因、画像增量或变式练习。

推荐本地配置：

```text
VISION_PROVIDER_PROTOCOL=glm_ocr
VISION_PROVIDER_BASE_URL=https://open.bigmodel.cn/api/paas/v4
VISION_PROVIDER_MODEL=glm-ocr
VISION_PROVIDER_API_KEY=<local-secret>
VISION_PROVIDER_NAME=glm_ocr
VISION_PROVIDER_IMAGE_FORMAT=data_url
VISION_PROVIDER_TIMEOUT_MS=60000
```
```

- [ ] **Step 2: Update roadmap**

In `docs/TECHNICAL_ROADMAP.md`, add a P2.8 entry under the recent RAG/image diagnosis roadmap section:

```md
### P2.8 GLM-OCR Image Extraction Provider

- 状态：已实现 / 已本地验证。
- 价值：把在线上传题图片抽取从通用 vision chat 的 JSON 生成路径，补充为 OCR/layout 专用路径，降低 `empty_text_content` 对后续标准解法和 RAG 推荐的阻断概率。
- 边界：GLM-OCR 只读图片并输出确认草稿，不写画像、不写错因、不调用 RAG、不生成标准解法；MinerU 仍保留在离线 PDF/题库入库链路。
- 验证：`node scripts/tests/providers/glm-ocr-provider.test.mjs`、`node scripts/tests/image-diagnosis/glm-ocr-draft-mapper.test.mjs`、`node scripts/tests/smoke/api-smoke.test.mjs`、`node scripts/run-tests.mjs default`。
```

Replace `已实现 / 已本地验证` with `已实现，待真实 GLM-OCR smoke` if no real API smoke is run before closure.

- [ ] **Step 3: Update interview narrative**

In `interview/mathtrace-project-narrative.md`, add a new phase section using this structure:

```md
## P2.8 GLM-OCR 在线图片抽取 Provider

### 当前状态
已完成本地 fake provider 验证；真实 GLM-OCR smoke 取决于本地是否配置 `VISION_PROVIDER_API_KEY`。

### 功能价值
真实上传题链路曾出现通用视觉模型 HTTP 成功但 `content` 为空的问题，导致题干都无法进入确认表单。P2.8 把图片抽取补充为 OCR/layout 专用 provider，让系统先稳定获得题干和学生作答草稿，再交给用户确认。

### 关键设计
GLM-OCR 是 `VISION_PROVIDER_PROTOCOL=glm_ocr` 的可选分支。它只调用 `/layout_parsing`，读取 `md_results` 和 `layout_details`，再通过本地 mapper 生成 `VisionExtractionDraft`；确认、标准解法、画像写入和 RAG 推荐仍由原链路负责。

### 技术决策与取舍
我没有把 MinerU 接到在线上传题主路径，因为 MinerU 更适合离线 PDF/题库入库；在线诊断需要低延迟、少 artifact、错误可恢复。GLM-OCR 也没有取代现有 chat vision 默认配置，而是先作为显式可选 provider，等真实题 smoke 稳定后再考虑默认切换。

### 面试官可能怎么问
- 为什么不用通用视觉模型继续重试？
- 为什么不用 MinerU 做在线 OCR？
- GLM-OCR 为什么不能直接生成标准解法？
- OCR 结果不准时怎么保护画像写入？
- 怎么防止图片和学生答案泄露到日志？

### 推荐回答
我把 OCR 定位成“抽取层”，不是诊断层。它只负责把图片变成可编辑草稿，所有后续判断仍经过用户确认和确定性 evidence gate。这样即使 OCR 只识别到题干，系统也可以生成展示用标准解法和只读 RAG 推荐，但不会误写具体错因或长期画像。

### 项目中的真实证据
- 代码：`src/lib/providers/glm-ocr-provider.ts`、`src/lib/vision-extraction/glm-ocr-draft-mapper.ts`
- 测试：`scripts/tests/providers/glm-ocr-provider.test.mjs`、`scripts/tests/image-diagnosis/glm-ocr-draft-mapper.test.mjs`
- 文档：`docs/superpowers/specs/2026-06-27-p28-glm-ocr-image-extraction-design.md`
- 验证：`node scripts/run-tests.mjs default`
```

- [ ] **Step 4: Run docs self-check**

Run:

```bash
rg -n "glm_ocr|glm-ocr|GLM-OCR|layout_parsing" docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
rg -n "TB[D]|TO[D]O|待[定]" docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
```

Expected:
- First command shows the new GLM-OCR documentation in all three files.
- Second command exits with no matches.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md interview/mathtrace-project-narrative.md
git commit -m "docs: document glm ocr extraction provider"
```

---

### Task 7: Final Verification And Local Review Handoff

**Files:**
- No new source files.
- Review output remains local in `docs/reviews/*.md` and is not committed unless explicitly requested.

**Interfaces:**
- Consumes: all implementation commits from Tasks 1-6.
- Produces: verification evidence and Claude Code review prompt.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run lint
npm run build
npm test
```

Expected:
- `npm run lint` exits 0.
- `npm run build` exits 0.
- `npm test` exits 0, including default and smoke suites.

- [ ] **Step 2: Optional real GLM-OCR smoke**

Only run this if local `.env*` is already configured with a real key. Do not print the key or image base64.

Use a small test image and invoke `handleDiagnoseRequest` through the existing app/dev flow or a temporary local-only script. The expected result is:

```text
status=200
body.stage=extraction_review
body.recognized_question.question_text is non-empty
body does not contain memory_delta
body does not contain student_profile
provider_debug is absent on success
```

If no real key is configured, record: `未运行真实 GLM-OCR smoke：本地未配置 VISION_PROVIDER_API_KEY。`

- [ ] **Step 3: Prepare Claude Code implementation review prompt**

Use this prompt:

```text
请审查 P2.8 GLM-OCR Image Extraction Provider 实现。审查范围：

- spec: docs/superpowers/specs/2026-06-27-p28-glm-ocr-image-extraction-design.md
- plan: docs/superpowers/plans/2026-06-27-p28-glm-ocr-image-extraction-provider.md
- diff: 当前分支相对 main 的改动

重点检查：
1. `VISION_PROVIDER_PROTOCOL=glm_ocr` 是否只是可选第三协议，未配置时是否仍默认 `anthropic`。
2. GLM-OCR 是否调用 `/api/paas/v4/layout_parsing`，没有误走 `/chat/completions`。
3. 请求体是否只包含 `model`、`file` 和安全 OCR 选项，不包含 `student_profile_summary`、画像、错题历史、`memory_delta`、chat messages 或 repair prompt。
4. `md_results`、`layout_details`、`error` 的运行时解析是否安全，是否不会泄露 raw response、base64、API key、完整学生答案到错误响应或日志。
5. OCR markdown/layout 到 `VisionExtractionDraft` 的 mapper 是否保守、可测，是否支持只识别题干时继续进入确认表单。
6. GLM-OCR 是否不生成标准解法、错因、画像增量或变式练习；`/api/confirm`、证据等级、fingerprint、画像写入 gate、P2.7 RAG 是否保持原边界。
7. `sample_diagnosis`、现有 `anthropic`/`openai` vision provider、P2.7 Dynamic Variant Practice 是否存在回归风险。
8. 测试是否覆盖 provider config、请求体、响应解析、mapper、错误路径、API smoke、文档更新；是否有遗漏的高风险边界。

请按 Critical / Important / Minor 输出问题。只做审查，不修改代码。审查报告写入：
docs/reviews/2026-06-27-p28-glm-ocr-image-extraction-implementation-review.md
```

- [ ] **Step 4: Verify git status before review**

Run:

```bash
git status --short
```

Expected:
- No unintended tracked changes.
- `docs/reviews/*.md` may appear only after Claude Code review and must remain unstaged by default.
- `AGENTS.md` user-owned local changes, if still present, remain unstaged and out of commits.
