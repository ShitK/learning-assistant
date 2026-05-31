# P1 图片诊断前端体验 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `image_diagnosis` 从后端可用能力接到前端，形成“上传图片 -> 压缩/校验 -> 调用真实 AI 诊断 -> 渲染识别与诊断结果 -> 清晰错误态 -> Playwright 视觉验证”的 P1 体验闭环，同时保持 `sample_diagnosis` 演示路径稳定。

**Architecture:** 前端继续只调用 `POST /api/diagnose`，不读取服务端环境变量，也不直接接触 MiMo API Key。新增客户端纯函数层处理上传校验、请求 payload、错误消息和结果视图模型；`MathTraceWorkbench` 只负责状态编排与渲染，后端 Agent Pipeline 不改核心诊断逻辑。图片诊断成功后复用现有知识点映射、错因诊断、`memory_delta`、练习和复习计划；低置信度结果只展示报告，不写入 localStorage。

**Tech Stack:** Next.js App Router、React Client Component、TypeScript、Tailwind CSS、KaTeX、Node 脚本测试、Playwright/Browser 视觉验证工具。

---

## Scope

本计划实现：

- 前端上传 PNG/JPEG/WebP 图片，支持点击选择、拖拽选择、预览、移除、重新选择。
- 客户端先做格式和大小校验；超过 1MB 的图片尝试浏览器端压缩，压缩后仍超过 1MB 时阻止提交。
- `image_diagnosis` 请求调用真实 `/api/diagnose`，不在前端访问 `MIMO_API_KEY`。
- 成功后渲染图片识别出的题目、学生答案、学生步骤、置信度、标准解法、错因、画像变化、练习和 7 天计划。
- 失败时展示可恢复错误，并提供切回样例题的操作；失败不覆盖当前样例结果、不写入 localStorage。
- 低置信度图片诊断不写入 localStorage，并在结果区域展示“需要确认识别结果”的提示。
- 使用 Playwright/Browser 做桌面、移动端、上传态、成功态、错误态、长文本布局的视觉验证。
- 同步更新 PRD、TECHNICAL_ROADMAP 和 README 中 P1 前端入口、环境变量和验证方式说明。

本计划不实现：

- 识别结果手动编辑和 `/api/confirm`。
- LLM 动态生成练习题。
- Kimi/DeepSeek provider。
- 数据库、登录、老师端、支付。
- 新 Agent 框架、LangGraph、OpenAI Agents SDK、Vercel AI SDK。

## Current Context

- 当前稳定演示路径是 `sample_diagnosis`，入口和 localStorage 状态恢复已经可用。
- 后端已经有 `image_diagnosis` 路径：MiMo Anthropic-compatible provider 只做图片抽取，后续复用确定性 Agent Pipeline。
- `src/components/mathtrace-workbench.tsx` 当前只用 `SampleDiagnosis` 渲染整页，图片上传按钮仍是 P1 灰态。
- `src/lib/diagnose-api.ts` 已有 `DiagnoseImageSuccessResponse` 类型，但只有 `isDiagnoseSuccessResponse`，缺少图片成功响应的前端类型守卫。
- 当前测试是 Node 脚本串联，没有引入 React Testing Library 或 Playwright 项目依赖。

## File Structure

- Modify: `src/lib/diagnose-api.ts`
  - 增加 `isDiagnoseImageSuccessResponse`，让前端能安全收窄图片成功响应。

- Create: `src/lib/diagnose-client.ts`
  - 封装前端请求 payload、fetch 调用、错误消息读取、是否允许写入画像的判断。
  - 只依赖浏览器 `fetch` 和项目类型，不读取环境变量。

- Create: `src/lib/image-upload-client.ts`
  - 封装图片文件元数据校验、data URL 读取、浏览器 canvas 压缩、base64 字节数计算和上传错误消息。
  - 纯函数部分用 Node 测试；浏览器 API 部分通过 Playwright 视觉和交互验证。

- Create: `src/lib/diagnosis-view-model.ts`
  - 将 sample/image 两种 API 成功响应统一成前端渲染模型，避免所有展示组件都直接分支读取 API 原始结构。

- Create: `src/components/image-upload-panel.tsx`
  - 独立图片上传面板，负责文件选择、拖拽、预览、压缩中/错误/ready 状态展示。
  - 使用 named export，不使用默认导出。

- Modify: `src/components/mathtrace-workbench.tsx`
  - 增加 `DiagnosisMode` 和图片状态。
  - 把 `DiagnosisResultCard`、`PracticeLab`、`ProfileInsights`、`ReviewPath` 的输入从 `SampleDiagnosis` 调整为 `DiagnosisViewModel`。
  - `requestDiagnosis` 根据 mode 调用 sample 或 image 请求。
  - 图片失败不写入画像；低置信度成功不写入 localStorage。

- Create: `scripts/diagnose-client.test.mjs`
  - 覆盖 sample/image payload、错误响应消息、低置信度不持久化、fetch 异常消息。

- Create: `scripts/image-upload-client.test.mjs`
  - 覆盖文件类型、大小、base64/data URL 解析、错误消息。

- Create: `scripts/diagnosis-view-model.test.mjs`
  - 覆盖 sample/image 响应统一渲染模型。

- Modify: `package.json`
  - 将新增 Node 测试脚本加入 `npm test` 串联。

- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - 更新 P1 图片诊断前端入口、低置信度不持久化、错误态和 Playwright 验证边界。

- Modify: `docs/TECHNICAL_ROADMAP.md`
  - 标记 P1 前端图片诊断体验的完成范围和仍未完成的识别编辑、确认写入、动态练习。

- Modify: `README.md`
  - 补充本地体验图片诊断需要 `.env.local`，以及 sample/image smoke test 的建议命令和注意事项。

---

## Task 1: Diagnose API Client Helpers

**Files:**
- Modify: `src/lib/diagnose-api.ts`
- Create: `src/lib/diagnose-client.ts`
- Create: `scripts/diagnose-client.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for client request and response boundaries**

Create `scripts/diagnose-client.test.mjs`:

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  demoStudentProfile,
  mistakeHistory,
  sampleDiagnoses,
} = jiti("../src/data/mathtrace-demo.ts");
const {
  buildImageDiagnosePayload,
  buildSampleDiagnosePayload,
  getDiagnoseClientErrorMessage,
  shouldPersistDiagnoseProfile,
} = jiti("../src/lib/diagnose-client.ts");
const {
  isDiagnoseImageSuccessResponse,
} = jiti("../src/lib/diagnose-api.ts");

const samplePayload = buildSampleDiagnosePayload({
  sample_question_id: "sample_derivative_001",
  student_profile: demoStudentProfile,
  mistake_history: mistakeHistory,
});

assert.equal(samplePayload.task_type, "sample_diagnosis");
assert.equal(samplePayload.image_base64, null);
assert.equal(samplePayload.student_id, "demo_student_001");

const imagePayload = buildImageDiagnosePayload({
  image_base64: "YWJjZA==",
  image_mime_type: "image/jpeg",
  student_profile: demoStudentProfile,
  mistake_history: mistakeHistory,
});

assert.equal(imagePayload.task_type, "image_diagnosis");
assert.equal(imagePayload.sample_question_id, null);
assert.equal(imagePayload.image_mime_type, "image/jpeg");
assert.equal(imagePayload.image_base64, "YWJjZA==");

assert.equal(
  getDiagnoseClientErrorMessage({
    error: {
      code: "model_timeout",
      message: "模型响应较慢，请稍后重试或改用样例题。",
      recoverable: true,
    },
    fallback_used: true,
    warnings: [],
  }),
  "模型响应较慢，请稍后重试或改用样例题。",
);

assert.equal(
  getDiagnoseClientErrorMessage(null),
  "诊断接口暂时不可用，已保留当前结果。",
);

const highConfidenceImageResponse = {
  diagnosis_id: "diag_image_1",
  student_id: "demo_student_001",
  source: "image",
  steps: [],
  recognized_question: {
    id: "image_1",
    title: "图片识别错题",
    module: "导数",
    question_text: "求函数单调区间。",
    student_answer: "遗漏参数讨论。",
    student_solution_steps: ["求导", "直接判断"],
    extraction_confidence: "high",
  },
  knowledge_mapping: {
    knowledge_points: ["derivative_monotonicity"],
    difficulty: 4,
  },
  mistake_diagnosis: {
    mistake_causes: ["classification_missing"],
    severity: "medium",
    expected_diagnosis: "分类讨论遗漏。",
    step_analysis: ["没有讨论参数范围"],
    solution_highlights: ["先讨论参数范围"],
    standard_solution: "先求导，再分类讨论。",
  },
  memory_delta: {
    knowledge_mastery_changes: { derivative_monotonicity: -6 },
    mistake_cause_changes: { classification_missing: 1 },
    is_repeated_mistake: false,
    review_priority_changes: ["derivative_monotonicity"],
    should_persist: true,
    rationale: "图片抽取通过校验后，由本地规则计算画像增量。",
  },
  student_profile: demoStudentProfile,
  practice_questions: [],
  review_plan: {
    tomorrow: "复习导数单调性。",
    seven_days: [],
    rationale: ["本次错因涉及导数。"],
  },
  sample_diagnosis: null,
  fallback_used: false,
  warnings: [],
};

assert.equal(isDiagnoseImageSuccessResponse(highConfidenceImageResponse), true);
assert.equal(shouldPersistDiagnoseProfile(highConfidenceImageResponse), true);

const lowConfidenceImageResponse = {
  ...highConfidenceImageResponse,
  recognized_question: {
    ...highConfidenceImageResponse.recognized_question,
    extraction_confidence: "low",
  },
  memory_delta: {
    ...highConfidenceImageResponse.memory_delta,
    should_persist: false,
  },
};

assert.equal(isDiagnoseImageSuccessResponse(lowConfidenceImageResponse), true);
assert.equal(shouldPersistDiagnoseProfile(lowConfidenceImageResponse), false);

console.log("diagnose client regression test passed");
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
node scripts/diagnose-client.test.mjs
```

Expected: FAIL because `src/lib/diagnose-client.ts` and `isDiagnoseImageSuccessResponse` do not exist.

- [ ] **Step 3: Add image success guard**

Modify `src/lib/diagnose-api.ts` after `isDiagnoseSuccessResponse`:

```ts
export function isDiagnoseImageSuccessResponse(
  value: unknown,
): value is DiagnoseImageSuccessResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (value.fallback_used !== false || value.source !== "image") {
    return false;
  }

  if (value.sample_diagnosis !== null) {
    return false;
  }

  if (!isRecord(value.recognized_question)) {
    return false;
  }

  return (
    typeof value.recognized_question.id === "string" &&
    typeof value.recognized_question.question_text === "string" &&
    typeof value.recognized_question.student_answer === "string" &&
    Array.isArray(value.recognized_question.student_solution_steps) &&
    value.recognized_question.student_solution_steps.every(
      (item) => typeof item === "string",
    ) &&
    (value.recognized_question.extraction_confidence === "high" ||
      value.recognized_question.extraction_confidence === "medium" ||
      value.recognized_question.extraction_confidence === "low")
  );
}
```

- [ ] **Step 4: Add diagnose client helpers**

Create `src/lib/diagnose-client.ts`:

```ts
import {
  isDiagnoseImageSuccessResponse,
  isDiagnoseSuccessResponse,
} from "@/lib/diagnose-api";
import { demoStudentProfile } from "@/data/mathtrace-demo";
import { isRecord } from "@/lib/utils";
import type {
  DiagnoseApiResponse,
  DiagnoseImageSuccessResponse,
  DiagnoseSuccessResponse,
} from "@/lib/diagnose-api";
import type {
  MistakeHistoryItem,
  SampleQuestionId,
  StudentProfile,
} from "@/data/mathtrace-demo";

export interface SampleDiagnosePayload {
  student_id: string;
  task_type: "sample_diagnosis";
  sample_question_id: SampleQuestionId;
  image_base64: null;
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}

export interface ImageDiagnosePayload {
  student_id: string;
  task_type: "image_diagnosis";
  sample_question_id: null;
  image_base64: string;
  image_mime_type: "image/png" | "image/jpeg" | "image/webp";
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}

export function buildSampleDiagnosePayload(input: {
  sample_question_id: SampleQuestionId;
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}): SampleDiagnosePayload {
  return {
    student_id: demoStudentProfile.student_id,
    task_type: "sample_diagnosis",
    sample_question_id: input.sample_question_id,
    image_base64: null,
    student_profile: input.student_profile,
    mistake_history: input.mistake_history,
  };
}

export function buildImageDiagnosePayload(input: {
  image_base64: string;
  image_mime_type: ImageDiagnosePayload["image_mime_type"];
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}): ImageDiagnosePayload {
  return {
    student_id: demoStudentProfile.student_id,
    task_type: "image_diagnosis",
    sample_question_id: null,
    image_base64: input.image_base64,
    image_mime_type: input.image_mime_type,
    student_profile: input.student_profile,
    mistake_history: input.mistake_history,
  };
}

export async function requestSampleDiagnosis(input: {
  fetcher: typeof fetch;
  sample_question_id: SampleQuestionId;
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}): Promise<DiagnoseSuccessResponse> {
  const responseBody = await postDiagnose(input.fetcher, buildSampleDiagnosePayload(input));

  if (!isDiagnoseSuccessResponse(responseBody)) {
    throw new Error("诊断接口返回格式异常，已保留当前结果。");
  }

  return responseBody;
}

export async function requestImageDiagnosis(input: {
  fetcher: typeof fetch;
  image_base64: string;
  image_mime_type: ImageDiagnosePayload["image_mime_type"];
  student_profile: StudentProfile;
  mistake_history: MistakeHistoryItem[];
}): Promise<DiagnoseImageSuccessResponse> {
  const responseBody = await postDiagnose(input.fetcher, buildImageDiagnosePayload(input));

  if (!isDiagnoseImageSuccessResponse(responseBody)) {
    throw new Error("图片诊断返回格式异常，请重试或改用样例题。");
  }

  return responseBody;
}

export function shouldPersistDiagnoseProfile(
  response: DiagnoseSuccessResponse | DiagnoseImageSuccessResponse,
): boolean {
  if (response.source === "sample") {
    return true;
  }

  return response.memory_delta.should_persist;
}

export function getDiagnoseClientErrorMessage(responseBody: unknown): string {
  if (!isRecord(responseBody)) {
    return "诊断接口暂时不可用，已保留当前结果。";
  }

  const error = responseBody.error;
  if (!isRecord(error) || typeof error.message !== "string") {
    return "诊断接口暂时不可用，已保留当前结果。";
  }

  return error.message;
}

async function postDiagnose(
  fetcher: typeof fetch,
  payload: SampleDiagnosePayload | ImageDiagnosePayload,
): Promise<DiagnoseApiResponse> {
  let response: Response;

  try {
    response = await fetcher("/api/diagnose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("诊断接口暂时不可用，已保留当前结果。");
  }

  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(getDiagnoseClientErrorMessage(responseBody));
  }

  return responseBody as DiagnoseApiResponse;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Add tests to package script**

Modify `package.json`:

```json
"test": "node scripts/vision-extraction-parser.test.mjs && node scripts/anthropic-compatible-provider.test.mjs && node scripts/image-diagnosis-pipeline.test.mjs && node scripts/diagnose-client.test.mjs && node scripts/agent-pipeline.test.mjs && node scripts/demo-state.test.mjs"
```

- [ ] **Step 6: Verify Task 1**

Run:

```bash
npm test
```

Expected: PASS, including `diagnose client regression test passed`.

---

## Task 2: Image Upload Validation and Compression Helpers

**Files:**
- Create: `src/lib/image-upload-client.ts`
- Create: `scripts/image-upload-client.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for upload metadata and base64 helpers**

Create `scripts/image-upload-client.test.mjs`:

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const {
  MAX_UPLOAD_IMAGE_BYTES,
  getBase64ByteSize,
  getImageUploadErrorMessage,
  isSupportedUploadMimeType,
  stripDataUrlPrefix,
  validateImageFileMetadata,
} = jiti("../src/lib/image-upload-client.ts");

assert.equal(MAX_UPLOAD_IMAGE_BYTES, 1_000_000);
assert.equal(isSupportedUploadMimeType("image/png"), true);
assert.equal(isSupportedUploadMimeType("image/jpeg"), true);
assert.equal(isSupportedUploadMimeType("image/webp"), true);
assert.equal(isSupportedUploadMimeType("image/gif"), false);

assert.deepEqual(
  stripDataUrlPrefix("data:image/png;base64,YWJjZA=="),
  { ok: true, base64: "YWJjZA==", mime_type: "image/png" },
);
assert.deepEqual(
  stripDataUrlPrefix("data:image/gif;base64,YWJjZA=="),
  { ok: false, error: "invalid_type" },
);
assert.equal(getBase64ByteSize("YWJjZA=="), 4);

assert.deepEqual(
  validateImageFileMetadata({
    name: "mistake.png",
    type: "image/png",
    size: 900_000,
  }),
  { ok: true },
);
assert.deepEqual(
  validateImageFileMetadata({
    name: "mistake.gif",
    type: "image/gif",
    size: 10_000,
  }),
  { ok: false, error: "invalid_type" },
);
assert.deepEqual(
  validateImageFileMetadata({
    name: "huge.jpg",
    type: "image/jpeg",
    size: 8_500_001,
  }),
  { ok: false, error: "source_too_large" },
);

assert.equal(
  getImageUploadErrorMessage("invalid_type"),
  "请上传 PNG、JPEG 或 WebP 格式的图片。",
);
assert.equal(
  getImageUploadErrorMessage("compressed_too_large"),
  "图片压缩后仍超过 1MB，请裁剪题目区域后重试。",
);

console.log("image upload client regression test passed");
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
node scripts/image-upload-client.test.mjs
```

Expected: FAIL because `src/lib/image-upload-client.ts` does not exist.

- [ ] **Step 3: Implement pure upload helpers and browser compression function**

Create `src/lib/image-upload-client.ts`:

```ts
export const MAX_UPLOAD_IMAGE_BYTES = 1_000_000;
export const MAX_SOURCE_IMAGE_BYTES = 8_500_000;

export type UploadImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export type ImageUploadErrorCode =
  | "invalid_type"
  | "source_too_large"
  | "read_failed"
  | "compressed_too_large";

export interface ImageFileMetadata {
  name: string;
  type: string;
  size: number;
}

export interface PreparedImageUpload {
  file_name: string;
  image_base64: string;
  image_mime_type: UploadImageMimeType;
  preview_url: string;
  byte_size: number;
  was_compressed: boolean;
}

const DATA_URL_PATTERN =
  /^data:(image\/png|image\/jpeg|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/;

export function isSupportedUploadMimeType(
  value: string,
): value is UploadImageMimeType {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}

export function validateImageFileMetadata(
  file: ImageFileMetadata,
): { ok: true } | { ok: false; error: ImageUploadErrorCode } {
  if (!isSupportedUploadMimeType(file.type)) {
    return { ok: false, error: "invalid_type" };
  }

  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    return { ok: false, error: "source_too_large" };
  }

  return { ok: true };
}

export function stripDataUrlPrefix(
  dataUrl: string,
):
  | { ok: true; base64: string; mime_type: UploadImageMimeType }
  | { ok: false; error: ImageUploadErrorCode } {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match || !isSupportedUploadMimeType(match[1])) {
    return { ok: false, error: "invalid_type" };
  }

  return {
    ok: true,
    base64: match[2],
    mime_type: match[1],
  };
}

export function getBase64ByteSize(base64: string): number {
  const normalized = base64.trim();
  if (normalized.length === 0) {
    return 0;
  }

  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;

  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

export function getImageUploadErrorMessage(code: ImageUploadErrorCode): string {
  if (code === "invalid_type") {
    return "请上传 PNG、JPEG 或 WebP 格式的图片。";
  }

  if (code === "source_too_large") {
    return "原图超过 8.5MB，请先裁剪题目区域后再上传。";
  }

  if (code === "compressed_too_large") {
    return "图片压缩后仍超过 1MB，请裁剪题目区域后重试。";
  }

  return "图片读取失败，请重新选择一张清晰的错题图片。";
}

export async function prepareImageForDiagnosis(
  file: File,
): Promise<
  | { ok: true; value: PreparedImageUpload }
  | { ok: false; error: ImageUploadErrorCode }
> {
  const validation = validateImageFileMetadata(file);
  if (!validation.ok) {
    return validation;
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  if (!originalDataUrl) {
    return { ok: false, error: "read_failed" };
  }

  const originalParsed = stripDataUrlPrefix(originalDataUrl);
  if (!originalParsed.ok) {
    return originalParsed;
  }

  const originalByteSize = getBase64ByteSize(originalParsed.base64);
  if (originalByteSize <= MAX_UPLOAD_IMAGE_BYTES) {
    return {
      ok: true,
      value: {
        file_name: file.name,
        image_base64: originalParsed.base64,
        image_mime_type: originalParsed.mime_type,
        preview_url: originalDataUrl,
        byte_size: originalByteSize,
        was_compressed: false,
      },
    };
  }

  const compressedDataUrl = await compressImageToJpegDataUrl(file);
  if (!compressedDataUrl) {
    return { ok: false, error: "read_failed" };
  }

  const compressedParsed = stripDataUrlPrefix(compressedDataUrl);
  if (!compressedParsed.ok) {
    return compressedParsed;
  }

  const compressedByteSize = getBase64ByteSize(compressedParsed.base64);
  if (compressedByteSize > MAX_UPLOAD_IMAGE_BYTES) {
    return { ok: false, error: "compressed_too_large" };
  }

  return {
    ok: true,
    value: {
      file_name: file.name,
      image_base64: compressedParsed.base64,
      image_mime_type: compressedParsed.mime_type,
      preview_url: compressedDataUrl,
      byte_size: compressedByteSize,
      was_compressed: true,
    },
  };
}

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(typeof reader.result === "string" ? reader.result : null);
    });
    reader.addEventListener("error", () => resolve(null));
    reader.readAsDataURL(file);
  });
}

async function compressImageToJpegDataUrl(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) {
    return null;
  }

  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return null;
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const quality of [0.86, 0.78, 0.7, 0.62]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const parsed = stripDataUrlPrefix(dataUrl);
    if (parsed.ok && getBase64ByteSize(parsed.base64) <= MAX_UPLOAD_IMAGE_BYTES) {
      return dataUrl;
    }
  }

  return canvas.toDataURL("image/jpeg", 0.56);
}
```

- [ ] **Step 4: Add the upload test to package script**

Modify `package.json`:

```json
"test": "node scripts/vision-extraction-parser.test.mjs && node scripts/anthropic-compatible-provider.test.mjs && node scripts/image-diagnosis-pipeline.test.mjs && node scripts/diagnose-client.test.mjs && node scripts/image-upload-client.test.mjs && node scripts/agent-pipeline.test.mjs && node scripts/demo-state.test.mjs"
```

- [ ] **Step 5: Verify Task 2**

Run:

```bash
npm test
```

Expected: PASS, including `image upload client regression test passed`.

---

## Task 3: Unified Diagnosis View Model

**Files:**
- Create: `src/lib/diagnosis-view-model.ts`
- Create: `scripts/diagnosis-view-model.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for sample/image rendering model**

Create `scripts/diagnosis-view-model.test.mjs`:

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { demoStudentProfile, sampleDiagnoses } = jiti("../src/data/mathtrace-demo.ts");
const {
  createImageDiagnosisViewModel,
  createSampleDiagnosisViewModel,
} = jiti("../src/lib/diagnosis-view-model.ts");

const sample = sampleDiagnoses[0];
const sampleView = createSampleDiagnosisViewModel(sample);

assert.equal(sampleView.source, "sample");
assert.equal(sampleView.title, sample.title);
assert.equal(sampleView.question_text, sample.question_text);
assert.deepEqual(sampleView.knowledge_points, sample.knowledge_points);
assert.equal(sampleView.extraction_confidence, null);
assert.equal(sampleView.should_persist_profile, true);

const imageResponse = {
  diagnosis_id: "diag_image_1",
  student_id: "demo_student_001",
  source: "image",
  steps: [],
  recognized_question: {
    id: "image_1",
    title: "图片识别错题",
    module: "导数",
    question_text: "已识别题干。",
    student_answer: "学生答案。",
    student_solution_steps: ["第一步", "第二步"],
    extraction_confidence: "low",
  },
  knowledge_mapping: {
    knowledge_points: ["derivative_monotonicity"],
    difficulty: 4,
  },
  mistake_diagnosis: {
    mistake_causes: ["classification_missing"],
    severity: "medium",
    expected_diagnosis: "分类讨论遗漏。",
    step_analysis: ["第二步遗漏参数范围"],
    solution_highlights: ["先分类讨论"],
    standard_solution: "标准解法。",
  },
  memory_delta: {
    knowledge_mastery_changes: { derivative_monotonicity: -6 },
    mistake_cause_changes: { classification_missing: 1 },
    is_repeated_mistake: false,
    review_priority_changes: ["derivative_monotonicity"],
    should_persist: false,
    rationale: "图片抽取置信度低，本次只展示诊断建议，不写入长期画像。",
  },
  student_profile: demoStudentProfile,
  practice_questions: sample.practice_questions,
  review_plan: sample.review_plan,
  sample_diagnosis: null,
  fallback_used: false,
  warnings: ["请检查识别结果。"],
};

const imageView = createImageDiagnosisViewModel(imageResponse);
assert.equal(imageView.source, "image");
assert.equal(imageView.title, "图片识别错题");
assert.equal(imageView.question_text, "已识别题干。");
assert.equal(imageView.student_answer, "学生答案。");
assert.deepEqual(imageView.student_solution_steps, ["第一步", "第二步"]);
assert.deepEqual(imageView.knowledge_points, ["derivative_monotonicity"]);
assert.equal(imageView.extraction_confidence, "low");
assert.equal(imageView.should_persist_profile, false);
assert.deepEqual(imageView.warnings, ["请检查识别结果。"]);

console.log("diagnosis view model regression test passed");
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
node scripts/diagnosis-view-model.test.mjs
```

Expected: FAIL because `src/lib/diagnosis-view-model.ts` does not exist.

- [ ] **Step 3: Implement the view model**

Create `src/lib/diagnosis-view-model.ts`:

```ts
import type {
  AgentStep,
  MemoryDelta,
  PracticeQuestion,
  ReviewPlan,
  SampleDiagnosis,
  Severity,
} from "@/data/mathtrace-demo";
import type { DiagnoseImageSuccessResponse } from "@/lib/diagnose-api";

export interface DiagnosisViewModel {
  source: "sample" | "image";
  id: string;
  title: string;
  module: string;
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  extraction_confidence: "high" | "medium" | "low" | null;
  knowledge_points: string[];
  difficulty: number;
  mistake_causes: string[];
  severity: Severity;
  expected_diagnosis: string;
  step_analysis: string[];
  solution_highlights: string[];
  standard_solution: string;
  memory_delta: MemoryDelta;
  practice_questions: PracticeQuestion[];
  review_plan: ReviewPlan;
  steps: AgentStep[];
  should_persist_profile: boolean;
  warnings: string[];
}

export function createSampleDiagnosisViewModel(
  sample: SampleDiagnosis,
): DiagnosisViewModel {
  return {
    source: "sample",
    id: sample.id,
    title: sample.title,
    module: sample.module,
    question_text: sample.question_text,
    student_answer: sample.student_answer,
    student_solution_steps: sample.step_analysis,
    extraction_confidence: null,
    knowledge_points: sample.knowledge_points,
    difficulty: sample.difficulty,
    mistake_causes: sample.mistake_causes,
    severity: sample.severity,
    expected_diagnosis: sample.expected_diagnosis,
    step_analysis: sample.step_analysis,
    solution_highlights: sample.solution_highlights,
    standard_solution: sample.standard_solution,
    memory_delta: sample.memory_delta,
    practice_questions: sample.practice_questions,
    review_plan: sample.review_plan,
    steps: sample.steps,
    should_persist_profile: true,
    warnings: [],
  };
}

export function createImageDiagnosisViewModel(
  response: DiagnoseImageSuccessResponse,
): DiagnosisViewModel {
  return {
    source: "image",
    id: response.recognized_question.id,
    title: response.recognized_question.title,
    module: response.recognized_question.module,
    question_text: response.recognized_question.question_text,
    student_answer: response.recognized_question.student_answer,
    student_solution_steps: response.recognized_question.student_solution_steps,
    extraction_confidence: response.recognized_question.extraction_confidence,
    knowledge_points: response.knowledge_mapping.knowledge_points,
    difficulty: response.knowledge_mapping.difficulty,
    mistake_causes: response.mistake_diagnosis.mistake_causes,
    severity: response.mistake_diagnosis.severity,
    expected_diagnosis: response.mistake_diagnosis.expected_diagnosis,
    step_analysis: response.mistake_diagnosis.step_analysis,
    solution_highlights: response.mistake_diagnosis.solution_highlights,
    standard_solution: response.mistake_diagnosis.standard_solution,
    memory_delta: response.memory_delta,
    practice_questions: response.practice_questions,
    review_plan: response.review_plan,
    steps: response.steps,
    should_persist_profile: response.memory_delta.should_persist,
    warnings: response.warnings,
  };
}
```

- [ ] **Step 4: Add the view model test to package script**

Modify `package.json`:

```json
"test": "node scripts/vision-extraction-parser.test.mjs && node scripts/anthropic-compatible-provider.test.mjs && node scripts/image-diagnosis-pipeline.test.mjs && node scripts/diagnose-client.test.mjs && node scripts/image-upload-client.test.mjs && node scripts/diagnosis-view-model.test.mjs && node scripts/agent-pipeline.test.mjs && node scripts/demo-state.test.mjs"
```

- [ ] **Step 5: Verify Task 3**

Run:

```bash
npm test
```

Expected: PASS, including `diagnosis view model regression test passed`.

---

## Task 4: Image Upload Panel UI

**Files:**
- Create: `src/components/image-upload-panel.tsx`
- Modify: `src/components/mathtrace-workbench.tsx`

- [ ] **Step 1: Add the upload panel component**

Create `src/components/image-upload-panel.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactElement } from "react";
import {
  getImageUploadErrorMessage,
  prepareImageForDiagnosis,
} from "@/lib/image-upload-client";
import type {
  ImageUploadErrorCode,
  PreparedImageUpload,
} from "@/lib/image-upload-client";

export interface ImageUploadPanelProps {
  selectedImage: PreparedImageUpload | null;
  isDisabled: boolean;
  isPreparing: boolean;
  errorMessage: string | null;
  onPrepareStart: () => void;
  onPrepared: (image: PreparedImageUpload) => void;
  onPrepareError: (message: string) => void;
  onClear: () => void;
}

export function ImageUploadPanel({
  selectedImage,
  isDisabled,
  isPreparing,
  errorMessage,
  onPrepareStart,
  onPrepared,
  onPrepareError,
  onClear,
}: ImageUploadPanelProps): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  function openFileDialog(): void {
    if (!isDisabled) {
      inputRef.current?.click();
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (file) {
      void prepareFile(file);
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    if (!isDisabled) {
      setIsDragActive(true);
    }
  }

  function handleDragLeave(): void {
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setIsDragActive(false);
    if (isDisabled) {
      return;
    }

    const file = event.dataTransfer.files[0] ?? null;
    if (file) {
      void prepareFile(file);
    }
  }

  async function prepareFile(file: File): Promise<void> {
    onPrepareStart();
    const result = await prepareImageForDiagnosis(file);
    if (result.ok) {
      onPrepared(result.value);
      return;
    }

    onPrepareError(getImageUploadErrorMessage(result.error));
  }

  const panelClassName = isDragActive
    ? "border-[var(--mocha)] bg-[var(--mocha-muted)]"
    : "border-[var(--light-gray)] bg-[var(--oat)]";

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-[20px] border border-dashed p-4 ${panelClassName}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleInputChange}
      />

      {selectedImage ? (
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <img
            src={selectedImage.preview_url}
            alt="已选择的错题图片预览"
            className="aspect-[4/3] w-full rounded-[16px] border border-white bg-white object-contain"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--charcoal)]">
              {selectedImage.file_name}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--warm-gray)]">
              {(selectedImage.byte_size / 1024).toFixed(0)} KB
              {selectedImage.was_compressed ? " · 已压缩" : " · 原图可用"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isDisabled}
                onClick={openFileDialog}
                className="min-h-10 rounded-full border border-[var(--light-gray)] bg-white px-4 text-sm font-medium text-[var(--warm-gray)] hover:border-[var(--mocha-light)] hover:text-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                重新选择
              </button>
              <button
                type="button"
                disabled={isDisabled}
                onClick={onClear}
                className="min-h-10 rounded-full border border-[var(--light-gray)] bg-white px-4 text-sm font-medium text-[var(--warm-gray)] hover:border-[var(--mocha-light)] hover:text-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                移除
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={isDisabled || isPreparing}
          onClick={openFileDialog}
          className="flex min-h-28 w-full cursor-pointer flex-col items-center justify-center rounded-[16px] bg-white px-4 py-5 text-center text-sm font-medium text-[var(--warm-gray)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="text-base font-semibold text-[var(--charcoal)]">
            {isPreparing ? "正在压缩图片" : "选择或拖入错题图片"}
          </span>
          <span className="mt-2 leading-6">PNG / JPEG / WebP，提交前压缩到 1MB 内</span>
        </button>
      )}

      {errorMessage ? (
        <p className="mt-3 rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
```

If TypeScript flags `ImageUploadErrorCode` as unused, remove that import; do not keep unused imports.

- [ ] **Step 2: Run lint and fix component-level type/style errors**

Run:

```bash
npm run lint
```

Expected: either PASS or actionable lint errors only in the new component. Fix unused imports and JSX formatting before moving on.

---

## Task 5: Wire Workbench State, Requests, and Result Rendering

**Files:**
- Modify: `src/components/mathtrace-workbench.tsx`

- [ ] **Step 1: Replace sample-only state with mode and view model state**

Modify imports in `src/components/mathtrace-workbench.tsx`:

```ts
import { ImageUploadPanel } from "@/components/image-upload-panel";
import {
  createImageDiagnosisViewModel,
  createSampleDiagnosisViewModel,
} from "@/lib/diagnosis-view-model";
import {
  requestImageDiagnosis,
  requestSampleDiagnosis,
  shouldPersistDiagnoseProfile,
} from "@/lib/diagnose-client";
import type { DiagnosisViewModel } from "@/lib/diagnosis-view-model";
import type { PreparedImageUpload } from "@/lib/image-upload-client";
```

Remove local `requestSampleDiagnosis`, `readJsonResponse`, and `getDiagnoseErrorMessage` from the component after the new client helpers are used.

Add state near the current sample state:

```ts
type DiagnosisMode = "sample" | "image";

const [diagnosisMode, setDiagnosisMode] = useState<DiagnosisMode>("sample");
const [selectedImage, setSelectedImage] = useState<PreparedImageUpload | null>(null);
const [isImagePreparing, setIsImagePreparing] = useState(false);
const [imageUploadErrorMessage, setImageUploadErrorMessage] = useState<string | null>(null);
const [diagnosisView, setDiagnosisView] = useState<DiagnosisViewModel>(() =>
  createSampleDiagnosisViewModel(selectedSample),
);
```

Replace `diagnosisSample` reads in top-level render with `diagnosisView`:

```ts
const isTimelineRunning = completedStepCount < diagnosisView.steps.length;
```

Initialize `completedStepCount` from `diagnosisView.steps.length`.

- [ ] **Step 2: Add mode switching handlers**

Add handlers inside `MathTraceWorkbench`:

```ts
function handleSelectMode(nextMode: DiagnosisMode): void {
  if (isDiagnosing || nextMode === diagnosisMode) {
    return;
  }

  setDiagnosisMode(nextMode);
  setApiErrorMessage(null);
  setImageUploadErrorMessage(null);

  if (nextMode === "sample") {
    const nextSample = getSampleById(selectedSampleId);
    setDiagnosisView(createSampleDiagnosisViewModel(nextSample));
    setProfilePreview(null);
    setCompletedStepCount(nextSample.steps.length);
  }
}

function handleImagePrepareStart(): void {
  setIsImagePreparing(true);
  setImageUploadErrorMessage(null);
  setApiErrorMessage(null);
}

function handleImagePrepared(image: PreparedImageUpload): void {
  setSelectedImage(image);
  setIsImagePreparing(false);
  setImageUploadErrorMessage(null);
}

function handleImagePrepareError(message: string): void {
  setSelectedImage(null);
  setIsImagePreparing(false);
  setImageUploadErrorMessage(message);
}

function handleClearImage(): void {
  if (isDiagnosing) {
    return;
  }

  setSelectedImage(null);
  setImageUploadErrorMessage(null);
}
```

- [ ] **Step 3: Update sample selection to maintain sample view model**

Modify `handleSelectSample`:

```ts
function handleSelectSample(sampleId: SampleQuestionId): void {
  const nextSample = getSampleById(sampleId);
  setSelectedSampleId(sampleId);
  setDiagnosisMode("sample");
  setDiagnosisView(createSampleDiagnosisViewModel(nextSample));
  setApiErrorMessage(null);
  setImageUploadErrorMessage(null);
  setProfilePreview(null);
  setCompletedStepCount(nextSample.steps.length);
}
```

- [ ] **Step 4: Branch request logic by diagnosis mode**

Replace `requestDiagnosis` body with this flow:

```ts
async function requestDiagnosis(): Promise<void> {
  if (isDiagnosisRequestLockedRef.current) {
    return;
  }

  if (diagnosisMode === "image" && !selectedImage) {
    setImageUploadErrorMessage("请先上传一张数学错题图片。");
    return;
  }

  isDiagnosisRequestLockedRef.current = true;
  const profileBeforeDiagnosis = studentProfile;
  const fallbackSample = getSampleById(selectedSampleId);
  setProfilePreview({
    beforeProfile: profileBeforeDiagnosis,
    afterProfile: null,
  });
  setApiErrorMessage(null);
  setImageUploadErrorMessage(null);
  setCompletedStepCount(0);
  setIsRequestPending(true);

  try {
    if (diagnosisMode === "sample") {
      const diagnosis = await requestSampleDiagnosis({
        fetcher: window.fetch.bind(window),
        sample_question_id: selectedSampleId,
        student_profile: profileBeforeDiagnosis,
        mistake_history: mistakeHistory,
      });
      const nextView = createSampleDiagnosisViewModel(diagnosis.sample_diagnosis);
      setDiagnosisView(nextView);
      setSessionStudentProfile(diagnosis.student_profile);
      writeStoredStudentProfile(window.localStorage, diagnosis.student_profile);
      setProfilePreview({
        beforeProfile: profileBeforeDiagnosis,
        afterProfile: diagnosis.student_profile,
      });
      return;
    }

    if (!selectedImage) {
      throw new Error("请先上传一张数学错题图片。");
    }

    const diagnosis = await requestImageDiagnosis({
      fetcher: window.fetch.bind(window),
      image_base64: selectedImage.image_base64,
      image_mime_type: selectedImage.image_mime_type,
      student_profile: profileBeforeDiagnosis,
      mistake_history: mistakeHistory,
    });
    const nextView = createImageDiagnosisViewModel(diagnosis);
    setDiagnosisView(nextView);

    if (shouldPersistDiagnoseProfile(diagnosis)) {
      setSessionStudentProfile(diagnosis.student_profile);
      writeStoredStudentProfile(window.localStorage, diagnosis.student_profile);
      setProfilePreview({
        beforeProfile: profileBeforeDiagnosis,
        afterProfile: diagnosis.student_profile,
      });
    } else {
      setProfilePreview({
        beforeProfile: profileBeforeDiagnosis,
        afterProfile: null,
      });
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "诊断接口暂时不可用，已保留当前结果。";
    setApiErrorMessage(message);
    if (diagnosisMode === "sample") {
      setDiagnosisView(createSampleDiagnosisViewModel(fallbackSample));
    }
    setProfilePreview({
      beforeProfile: profileBeforeDiagnosis,
      afterProfile: null,
    });
  } finally {
    setIsRequestPending(false);
    isDiagnosisRequestLockedRef.current = false;
  }
}
```

- [ ] **Step 5: Update render calls**

Replace:

```tsx
<AgentTimeline
  steps={diagnosisSample.steps}
  completedStepCount={completedStepCount}
  isDiagnosing={isDiagnosing}
/>
```

with:

```tsx
<AgentTimeline
  steps={diagnosisView.steps}
  completedStepCount={completedStepCount}
  isDiagnosing={isDiagnosing}
/>
```

Replace:

```tsx
<MistakeInputCard
  selectedSample={selectedSample}
  selectedSampleId={selectedSampleId}
  isDiagnosing={isDiagnosing}
  apiErrorMessage={apiErrorMessage}
  onSelectSample={handleSelectSample}
  onStartDiagnosis={handleStartDiagnosis}
/>
<DiagnosisResultCard sample={diagnosisSample} />
```

with:

```tsx
<MistakeInputCard
  mode={diagnosisMode}
  selectedSample={selectedSample}
  selectedSampleId={selectedSampleId}
  selectedImage={selectedImage}
  isDiagnosing={isDiagnosing}
  isImagePreparing={isImagePreparing}
  apiErrorMessage={apiErrorMessage}
  imageUploadErrorMessage={imageUploadErrorMessage}
  onSelectMode={handleSelectMode}
  onSelectSample={handleSelectSample}
  onStartDiagnosis={handleStartDiagnosis}
  onImagePrepareStart={handleImagePrepareStart}
  onImagePrepared={handleImagePrepared}
  onImagePrepareError={handleImagePrepareError}
  onClearImage={handleClearImage}
/>
<DiagnosisResultCard diagnosis={diagnosisView} />
```

Replace:

```tsx
<PracticeLab sample={diagnosisSample} />
```

with:

```tsx
<PracticeLab diagnosis={diagnosisView} />
```

Replace `ProfileInsights` and `ReviewPath` props in the same way:

```tsx
<ProfileInsights
  diagnosis={diagnosisView}
  beforeProfile={visibleProfilePreview.beforeProfile}
  afterProfile={visibleProfilePreview.afterProfile}
  onResetProfile={handleResetProfile}
/>
<ReviewPath diagnosis={diagnosisView} />
```

- [ ] **Step 6: Update child component prop types**

Change `DiagnosisResultCard`, `PracticeLab`, `ProfileInsights`, and `ReviewPath` to accept `diagnosis: DiagnosisViewModel` and replace sample field reads:

```ts
diagnosis.knowledge_points
diagnosis.severity
diagnosis.standard_solution
diagnosis.solution_highlights
diagnosis.mistake_causes
diagnosis.student_answer
diagnosis.expected_diagnosis
diagnosis.step_analysis
diagnosis.practice_questions
diagnosis.memory_delta
diagnosis.review_plan
```

Update `getConciseDiagnosis`:

```ts
function getConciseDiagnosis(diagnosis: DiagnosisViewModel): string {
  if (diagnosis.mistake_causes.length === 0) {
    return diagnosis.expected_diagnosis;
  }

  return `偏离点：${diagnosis.mistake_causes.map(getMistakeName).join("、")}。`;
}
```

- [ ] **Step 7: Update `MistakeInputCard` UI**

Modify `MistakeInputCard` props to include the new mode and image handlers. Add a segmented control above the input body:

```tsx
<div className="mt-5 grid grid-cols-2 rounded-full bg-[var(--oat)] p-1">
  <button
    type="button"
    disabled={isDiagnosing}
    onClick={() => onSelectMode("sample")}
    className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
      mode === "sample"
        ? "bg-white text-[var(--charcoal)] shadow-[0_2px_12px_rgba(166,123,91,0.08)]"
        : "text-[var(--warm-gray)]"
    }`}
  >
    样例题
  </button>
  <button
    type="button"
    disabled={isDiagnosing}
    onClick={() => onSelectMode("image")}
    className={`min-h-10 rounded-full px-4 text-sm font-semibold ${
      mode === "image"
        ? "bg-white text-[var(--charcoal)] shadow-[0_2px_12px_rgba(166,123,91,0.08)]"
        : "text-[var(--warm-gray)]"
    }`}
  >
    图片诊断
  </button>
</div>
```

When `mode === "image"`, render `ImageUploadPanel` and hide the sample list. When `mode === "sample"`, render the current sample list and current sample panel.

Set the start button disabled state:

```tsx
const canStartDiagnosis =
  !isDiagnosing &&
  (mode === "sample" || (selectedImage !== null && !isImagePreparing));
```

Use:

```tsx
disabled={!canStartDiagnosis}
```

Button text:

```tsx
{isDiagnosing ? "诊断中" : mode === "image" ? "开始图片诊断" : "开始诊断"}
```

- [ ] **Step 8: Add image-specific result details**

Inside `DiagnosisResultCard`, above the standard solution panel, render this only for image results:

```tsx
{diagnosis.source === "image" ? (
  <div className="rounded-[20px] border border-[var(--oat)] bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-semibold text-[var(--charcoal)]">模型识别结果</p>
      <Tag tone={diagnosis.extraction_confidence === "low" ? "amber" : "green"}>
        置信度：{getConfidenceLabel(diagnosis.extraction_confidence)}
      </Tag>
    </div>
    {diagnosis.extraction_confidence === "low" ? (
      <p className="mt-3 rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
        识别置信度较低，本次报告不会写入长期画像。请检查题干和学生步骤后再决定是否重试。
      </p>
    ) : null}
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <div className="rounded-[16px] bg-[var(--oat)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
          recognized question
        </p>
        <p className="mt-3 text-sm leading-7 text-[var(--charcoal)]">
          <MathText text={diagnosis.question_text} />
        </p>
      </div>
      <div className="rounded-[16px] bg-[var(--oat)] p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
          recognized steps
        </p>
        <div className="mt-3 grid gap-2">
          {diagnosis.student_solution_steps.map((step, index) => (
            <p key={`${index}-${step}`} className="text-sm leading-6 text-[var(--warm-gray)]">
              <MathText text={`${index + 1}. ${step}`} />
            </p>
          ))}
        </div>
      </div>
    </div>
  </div>
) : null}
```

Add helper:

```ts
function getConfidenceLabel(
  confidence: DiagnosisViewModel["extraction_confidence"],
): string {
  if (confidence === "high") {
    return "高";
  }

  if (confidence === "medium") {
    return "中";
  }

  if (confidence === "low") {
    return "低";
  }

  return "样例";
}
```

- [ ] **Step 9: Verify Task 5**

Run:

```bash
npm test
npm run lint
```

Expected: both PASS.

---

## Task 6: Error-State UX and LocalStorage Safety

**Files:**
- Modify: `src/components/mathtrace-workbench.tsx`
- Modify: `scripts/diagnose-client.test.mjs`

- [ ] **Step 1: Add tests for non-persisting image profile logic**

Append to `scripts/diagnose-client.test.mjs`:

```js
const sampleSuccessResponse = {
  diagnosis_id: "diag_sample_1",
  student_id: "demo_student_001",
  source: "sample",
  steps: [],
  recognized_question: {
    id: "sample_derivative_001",
    title: "样例题",
    module: "导数",
    question_text: "题干",
    student_answer: "答案",
  },
  knowledge_mapping: {
    knowledge_points: ["derivative_monotonicity"],
    difficulty: 4,
  },
  mistake_diagnosis: highConfidenceImageResponse.mistake_diagnosis,
  memory_delta: lowConfidenceImageResponse.memory_delta,
  student_profile: demoStudentProfile,
  practice_questions: [],
  review_plan: highConfidenceImageResponse.review_plan,
  sample_diagnosis: {
    ...sampleDiagnoses[0],
    id: "sample_derivative_001",
  },
  fallback_used: false,
  warnings: [],
};

assert.equal(shouldPersistDiagnoseProfile(sampleSuccessResponse), true);
```

- [ ] **Step 2: Add image error action to input card**

When `apiErrorMessage` is present in image mode, render an action button next to the error:

```tsx
{apiErrorMessage ? (
  <div className="mt-3 rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
    <p>{apiErrorMessage}</p>
    {mode === "image" ? (
      <button
        type="button"
        disabled={isDiagnosing}
        onClick={() => onSelectMode("sample")}
        className="mt-3 min-h-9 rounded-full bg-white px-4 text-sm font-semibold text-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        切回样例题
      </button>
    ) : null}
  </div>
) : null}
```

- [ ] **Step 3: Ensure failed image diagnosis preserves the visible report**

In `requestDiagnosis` catch block, only reset to selected sample when current mode is `sample`. For image mode, leave `diagnosisView` as the last successful report:

```ts
if (diagnosisMode === "sample") {
  setDiagnosisView(createSampleDiagnosisViewModel(fallbackSample));
}
```

Keep this line absent for image mode so the last successful report stays visible.

- [ ] **Step 4: Verify Task 6**

Run:

```bash
npm test
npm run lint
```

Expected: both PASS.

---

## Task 7: Documentation Sync

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/TECHNICAL_ROADMAP.md`
- Modify: `README.md`

- [ ] **Step 1: Update PRD P1 frontend boundary**

In `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`, update the P1 image sections to state:

```markdown
P1 图片诊断前端入口包括：图片选择/拖拽、预览、客户端格式校验、提交前压缩到 1MB 内、调用 `/api/diagnose` 的 `image_diagnosis`、渲染模型识别结果和后续 Agent Pipeline 输出。图片识别失败、模型超时、非法 JSON、未配置 API Key、图片过大等场景必须展示 recoverable error，并提供切回样例题路径。

低置信度图片识别结果只展示诊断建议和练习计划，不写入 localStorage 学生画像。模型仍不得直接写 `memory_delta` 或覆盖学生画像，画像合并继续由本地规则控制。

P1 本阶段仍不包含识别结果编辑、`/api/confirm`、数据库持久化和 LLM 动态生成练习题。
```

- [ ] **Step 2: Update technical roadmap**

In `docs/TECHNICAL_ROADMAP.md`, update “当前还没有完成” and “前端层” sections:

```markdown
- P1 前端图片上传入口、识别结果渲染、错误态和视觉验证。
```

Move that item out of “当前还没有完成” after implementation. Keep these items unfinished:

```markdown
- 图片识别结果编辑和确认写入。
- Kimi、DeepSeek 等非 MiMo provider 实现。
- LLM 动态生成变式练习。
```

- [ ] **Step 3: Update README local smoke instructions**

Add:

```markdown
## Local Smoke Tests

Sample diagnosis does not require external model settings:

```bash
npm test
npm run lint
npm run build
```

Image diagnosis requires server-only MiMo settings in `.env.local`. Keep `MIMO_API_KEY` local and never commit it. After starting `npm run dev`, use the workbench “图片诊断” tab to upload a PNG/JPEG/WebP image. The client compresses large images before calling `/api/diagnose`.
```

- [ ] **Step 4: Verify docs do not contain secrets**

Run:

```bash
rg "MIMO_API_KEY=(sk-|xai-|[A-Za-z0-9_-]{24,})" README.md docs
```

Expected: no real key is printed. Placeholder text such as `replace-with-local-secret` is acceptable.

---

## Task 8: Playwright Visual Verification

**Files:**
- No source file changes unless verification finds a layout bug.

- [ ] **Step 1: Run full static verification before browser checks**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 2: Start local dev server**

Run:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Expected: dev server starts on `http://127.0.0.1:3000`. If port 3000 is occupied, use 3001 and record the actual URL in the final summary.

- [ ] **Step 3: Verify sample path visually**

Use Browser/Playwright at desktop `1440x1100` and mobile `390x844`:

- Open `/`.
- Confirm default mode is “样例题”.
- Click “开始诊断”.
- Confirm Agent timeline animates and completes.
- Confirm result, profile, practice, review sections have no overlapping text.
- Confirm long formula areas scroll horizontally instead of breaking layout.

- [ ] **Step 4: Verify image upload ready state visually**

Use Browser/Playwright:

- Switch to “图片诊断”.
- Upload a small PNG/JPEG/WebP fixture.
- Confirm preview appears.
- Confirm file name truncates rather than overflowing.
- Confirm size text shows KB and compression status.
- Confirm “开始图片诊断” is enabled after prepare finishes.

- [ ] **Step 5: Verify image success state visually**

Use one of these paths:

- Preferred: use local `.env.local` MiMo settings and upload a real math mistake image.
- Controlled fallback: use Playwright route interception for `/api/diagnose` and return a valid `source="image"` response shaped like `DiagnoseImageSuccessResponse`.

Verify:

- Recognized question, student answer and student steps render.
- Confidence tag renders.
- Standard solution and mistake causes render.
- Practice and review sections render from the image response.
- If `memory_delta.should_persist=false`, profile section does not show an after-profile write.

- [ ] **Step 6: Verify image error states visually**

Use Browser/Playwright:

- Upload unsupported GIF and confirm client-side error.
- Upload or simulate an over-limit image and confirm “压缩后仍超过 1MB” style error.
- Intercept `/api/diagnose` with `model_timeout` and confirm recoverable error plus “切回样例题”.
- Intercept `/api/diagnose` with `model_invalid_output` and confirm current report is preserved.

- [ ] **Step 7: Capture verification evidence**

Save screenshots outside committed source, for example:

```text
/private/tmp/mathtrace-image-ui-desktop.png
/private/tmp/mathtrace-image-ui-mobile.png
/private/tmp/mathtrace-image-ui-error.png
```

Do not commit generated screenshots unless the user explicitly asks.

---

## Task 9: Final Regression and Review Handoff

**Files:**
- No planned source changes.

- [ ] **Step 1: Run all required verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all PASS.

- [ ] **Step 2: Run API smoke tests**

Sample smoke:

```bash
curl -sS http://127.0.0.1:3000/api/diagnose \
  -H "Content-Type: application/json" \
  -d '{"student_id":"demo_student_001","task_type":"sample_diagnosis","sample_question_id":"sample_derivative_001","image_base64":null,"student_profile":{},"mistake_history":[]}'
```

Expected: JSON includes `"source":"sample"` and `"fallback_used":false`.

Image smoke with real MiMo settings:

```bash
curl -sS http://127.0.0.1:3000/api/diagnose \
  -H "Content-Type: application/json" \
  -d '{"student_id":"demo_student_001","task_type":"image_diagnosis","sample_question_id":null,"image_base64":"<local-test-image-base64>","image_mime_type":"image/png","student_profile":{},"mistake_history":[]}'
```

Expected: either `200` with `"source":"image"` or a clear recoverable model error such as `model_invalid_output`, without leaking API keys or base64.

- [ ] **Step 3: Prepare Claude Code review prompt**

Ask Claude Code to review the branch against `main` with emphasis on:

```text
请审查 codex/image-diagnosis-frontend-experience 相对 main 的改动。

重点检查：
- sample_diagnosis 稳定路径是否被破坏
- image_diagnosis 前端请求和响应类型是否与 PRD/API 契约一致
- 图片上传、压缩、错误态、重复点击、低置信度不持久化是否正确
- localStorage 是否只在允许写入时更新
- 前端是否泄露 MIMO_API_KEY、图片 base64 或敏感原文到日志/文档
- React state、异步请求和组件拆分是否存在竞态或 stale state
- 桌面/移动端布局、长公式、长文本、图片预览是否可能溢出或遮挡
- 新增测试是否覆盖 provider 不可用之外的前端错误路径和状态组合

请把审查报告写入 docs/reviews/2026-05-30-image-diagnosis-frontend-experience-review.md，不要修改源代码。
```

- [ ] **Step 4: Local commit after review fixes**

After Claude Code review fixes and retest, stage only planned files:

```bash
git status --short
git add src/lib/diagnose-api.ts src/lib/diagnose-client.ts src/lib/image-upload-client.ts src/lib/diagnosis-view-model.ts src/components/image-upload-panel.tsx src/components/mathtrace-workbench.tsx scripts/diagnose-client.test.mjs scripts/image-upload-client.test.mjs scripts/diagnosis-view-model.test.mjs package.json package-lock.json README.md docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md docs/superpowers/plans/2026-05-30-image-diagnosis-frontend-experience.md
git commit -m "feat: add image diagnosis frontend experience"
```

Do not stage `docs/reviews/*.md`.

---

## Acceptance Criteria

- `sample_diagnosis` 默认路径仍可完整诊断、更新画像、展示练习和复习计划。
- 图片上传支持 PNG/JPEG/WebP；无效格式、过大文件、读取失败、压缩失败都有中文错误态。
- 前端提交给 `/api/diagnose` 的图片请求包含 `task_type=image_diagnosis`、`sample_question_id=null`、`image_base64` 和 `image_mime_type`。
- 图片成功响应以 `source="image"` 渲染，不依赖 `sample_diagnosis`。
- 低置信度图片响应不写入 localStorage，不覆盖学生画像。
- 模型/API 错误是 recoverable UI，不自动伪造成样例题成功。
- 前端代码不读取服务端环境变量，不输出 API key 和完整 base64。
- `npm test`、`npm run lint`、`npm run build` 通过。
- Playwright/Browser 已覆盖桌面、移动端、上传态、成功态、错误态，并确认无明显遮挡或文字溢出。
- PRD、TECHNICAL_ROADMAP、README 与最终行为一致。

## Self-Review

- Spec coverage: 覆盖用户选择的“前端上传 + 结果渲染 + 错误态 + Playwright 视觉验证都做到很细”四个核心范围，并保留 sample 稳定路径。
- Placeholder scan: 本计划没有占位符式任务或未定义的未来步骤；所有延后能力均列在 Scope 的“不实现”中。
- Type consistency: 新增类型围绕现有 `DiagnoseSuccessResponse`、`DiagnoseImageSuccessResponse`、`SampleDiagnosis`、`StudentProfile`、`MemoryDelta`，不引入 `any`，所有导出函数使用 named export。
- Risk note: `src/components/mathtrace-workbench.tsx` 当前体量较大，本计划只做与图片诊断体验直接相关的拆分，不进行无关 UI 重构。
