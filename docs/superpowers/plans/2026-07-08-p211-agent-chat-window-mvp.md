# P2.11 题目会话窗口 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 MathTrace 左侧“上传/选择错题”表单升级为单题 Agent 会话窗口，同时保留右侧和下方结构化诊断结果卡片。

**Architecture:** 第一版只做本地单题会话，不新增聊天持久化、不新增追问 API、不改 `/api/diagnose` 或 `/api/confirm` 核心契约。新增 browser-safe 消息/追问纯函数，新增 `ProblemChatCard` 承载左侧交互，并在 `MathTraceWorkbench` 中复用现有图片上传、识别草稿确认、低证据追问、样例题诊断和画像写入 gate。

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, KaTeX, existing Node script tests with `jiti`.

## Global Constraints

- 不实现完整多题聊天历史。
- 不新增账号、登录、真实多用户 session。
- 不把聊天消息持久化到数据库。
- 不让自由聊天直接修改 `memory_delta` 或学生画像。
- 不改变 `memory_events -> student_profiles` 的事实链。
- 不改变 `/api/diagnose`、`/api/confirm` 现有核心契约。
- 不把 `PracticeLab`、`ProfileInsights`、`ReviewPath` 全部挪到右侧一个框里。
- 不做 SSE 流式输出。
- 不引入 LangGraph、OpenAI Agents SDK、Vercel AI SDK 或新的前端组件库。
- 不把 RAG/pgvector 用作当前题目的画像写入判断。
- 追问回答不得写 `memory_events`、`student_profiles`、`diagnosis_runs`、`mistake_book_items` 或 localStorage。
- `sample_diagnosis` 必须在无 API Key、无网络时稳定跑通。
- 前端不得读取服务端环境变量、API Key、service role key。
- 项目文档、计划和审查意见使用中文。

---

## File Structure

- Create: `src/lib/demo/problem-chat-state.ts`
  - 定义本地单题会话消息类型、状态类型和消息构造 helper。
  - Browser-safe，只依赖 demo 类型和图片上传类型，不访问 provider、数据库、环境变量或 localStorage。

- Create: `src/lib/diagnosis/diagnosis-follow-up.ts`
  - 提供 MVP-A 本地追问回答 helper。
  - 只从 `DiagnosisViewModel` 派生解释文案，不发请求、不写持久化。

- Create: `scripts/tests/ui/problem-chat-state.test.mjs`
  - 覆盖消息构造、消息修剪、追问问题校验和本地追问回答。

- Modify: `scripts/run-tests.mjs`
  - 把 `scripts/tests/ui/problem-chat-state.test.mjs` 加入 default suite，放在 `mathtrace-workbench-ui.test.mjs` 前。

- Create: `src/components/workbench/problem-chat-message.tsx`
  - 渲染单条会话消息、图片预览、Agent/学生角色样式。
  - 不承载业务状态编排。

- Create: `src/components/workbench/problem-chat-card.tsx`
  - 替代左侧 `MistakeInputCard` 的主要 UI。
  - 复用 `ImageUploadPanel`、`RiskFollowUpPanel`、识别草稿确认表单和样例题选择逻辑。
  - 新增当前题目追问输入区。

- Modify: `src/components/mathtrace-workbench.tsx`
  - 用 `ProblemChatCard` 替换 `MistakeInputCard`。
  - 新增 `problemChatMessages` 和 `problemFollowUpQuestion` state。
  - 在样例题、图片上传、识别草稿、确认诊断、错误和追问动作中追加消息。

- Modify: `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - 增加结构回归：工作台使用 `ProblemChatCard`、左侧 copy 是“题目会话”、追问不调用持久化 client、结果卡片仍独立渲染。

- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - 增加 P2.11 题目会话窗口、MVP-A 本地追问、非持久化聊天历史边界。

- Modify: `interview/mathtrace-project-narrative.md`
  - 增加一小节：从表单式 demo 到单题 Agent 会话，强调“聊天解释”和“画像事实写入”分离。

---

### Task 1: Add Browser-Safe Chat State And Local Follow-Up Helpers

**Files:**
- Create: `src/lib/demo/problem-chat-state.ts`
- Create: `src/lib/diagnosis/diagnosis-follow-up.ts`
- Create: `scripts/tests/ui/problem-chat-state.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes:
  - `SampleDiagnosis` from `@/data/mathtrace-demo`
  - `PreparedImageUpload` from `@/lib/image-diagnosis/image-upload-client`
  - `EditableExtractionDraft`, `DiagnosisViewModel` from `@/lib/diagnosis/diagnosis-view-model`
- Produces:
  - `export type ProblemChatStatus = "idle" | "image_preparing" | "extracting_image" | "reviewing_extraction" | "diagnosing" | "report_ready" | "error"`
  - `export type ProblemChatMessage = ...`
  - `export function createInitialProblemChatMessages(): ProblemChatMessage[]`
  - `export function createSampleSelectedMessage(sample: SampleDiagnosis): ProblemChatMessage`
  - `export function createImageUploadedMessage(image: PreparedImageUpload): ProblemChatMessage`
  - `export function createExtractionReviewMessage(draft: EditableExtractionDraft): ProblemChatMessage`
  - `export function createExtractionConfirmedMessage(): ProblemChatMessage`
  - `export function createDiagnosisReadyMessage(view: DiagnosisViewModel): ProblemChatMessage`
  - `export function createFollowUpQuestionMessage(text: string): ProblemChatMessage`
  - `export function createFollowUpAnswerMessage(text: string): ProblemChatMessage`
  - `export function createProblemChatErrorMessage(text: string): ProblemChatMessage`
  - `export function trimProblemChatMessages(messages: ProblemChatMessage[]): ProblemChatMessage[]`
  - `export function canSubmitProblemFollowUp(text: string, diagnosis: DiagnosisViewModel): boolean`
  - `export function createLocalDiagnosisFollowUpAnswer(input: CreateLocalDiagnosisFollowUpAnswerInput): string`

- [ ] **Step 1: Write failing tests for chat state and local follow-up**

Create `scripts/tests/ui/problem-chat-state.test.mjs`:

```js
import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti({ jsx: true });

const {
  createInitialProblemChatMessages,
  createSampleSelectedMessage,
  createImageUploadedMessage,
  createExtractionReviewMessage,
  createExtractionConfirmedMessage,
  createDiagnosisReadyMessage,
  createFollowUpQuestionMessage,
  createFollowUpAnswerMessage,
  createProblemChatErrorMessage,
  trimProblemChatMessages,
} = jiti("./src/lib/demo/problem-chat-state.ts");
const {
  canSubmitProblemFollowUp,
  createLocalDiagnosisFollowUpAnswer,
} = jiti("./src/lib/diagnosis/diagnosis-follow-up.ts");
const { sampleDiagnoses } = jiti("./src/data/mathtrace-demo.ts");
const { createSampleDiagnosisViewModel } = jiti(
  "./src/lib/diagnosis/diagnosis-view-model.ts",
);

const sample = sampleDiagnoses.find(
  (item) => item.id === "sample_derivative_001",
);
assert.ok(sample, "sample_derivative_001 should exist.");
const diagnosis = createSampleDiagnosisViewModel(sample);

const initialMessages = createInitialProblemChatMessages();
assert.equal(initialMessages.length, 1);
assert.equal(initialMessages[0].role, "agent");
assert.equal(initialMessages[0].kind, "welcome");
assert.match(initialMessages[0].text, /上传图片|样例题/);

const sampleMessage = createSampleSelectedMessage(sample);
assert.equal(sampleMessage.role, "student");
assert.equal(sampleMessage.kind, "sample_selected");
assert.match(sampleMessage.text, new RegExp(sample.title));

const imageMessage = createImageUploadedMessage({
  file_name: "wrong-question.png",
  image_base64: "abc",
  image_mime_type: "image/png",
  preview_url: "blob:http://localhost/image",
  byte_size: 32_000,
  was_compressed: false,
});
assert.equal(imageMessage.kind, "image_uploaded");
assert.equal(imageMessage.file_name, "wrong-question.png");
assert.equal(imageMessage.preview_url, "blob:http://localhost/image");

const reviewMessage = createExtractionReviewMessage({
  confirmation_token: "token",
  question_text: "已知函数，求单调区间。",
  student_answer: "少分类讨论",
  steps_text: "求导\n直接判断",
  extraction_confidence: "medium",
  warnings: [],
  can_persist_after_confirmation: true,
});
assert.equal(reviewMessage.kind, "extraction_review");
assert.match(reviewMessage.text, /确认/);

assert.equal(createExtractionConfirmedMessage().kind, "extraction_confirmed");
assert.equal(createDiagnosisReadyMessage(diagnosis).kind, "diagnosis_ready");
assert.match(createDiagnosisReadyMessage(diagnosis).text, /右侧|报告/);
assert.equal(
  createFollowUpQuestionMessage(" 为什么要分类讨论？ ").text,
  "为什么要分类讨论？",
);
assert.equal(createFollowUpAnswerMessage("先看参数范围。").kind, "follow_up_answer");
assert.equal(createProblemChatErrorMessage("模型超时").kind, "error");

const longMessages = Array.from({ length: 44 }, (_, index) =>
  createFollowUpQuestionMessage(`第 ${index} 个问题`),
);
const trimmedMessages = trimProblemChatMessages(longMessages);
assert.equal(trimmedMessages.length, 40);
assert.equal(trimmedMessages[0].text, "第 4 个问题");

assert.equal(canSubmitProblemFollowUp("", diagnosis), false);
assert.equal(canSubmitProblemFollowUp("   ", diagnosis), false);
assert.equal(canSubmitProblemFollowUp("第 1 步为什么这样做？", diagnosis), true);
assert.equal(canSubmitProblemFollowUp("第 3 步为什么这样做？", diagnosis), true);
assert.equal(canSubmitProblemFollowUp("为什么要分类讨论？", diagnosis), true);

const classificationAnswer = createLocalDiagnosisFollowUpAnswer({
  question: "为什么要分类讨论？",
  diagnosis,
});
assert.match(classificationAnswer, /分类讨论|关键判断点|标准解法/);
assert.doesNotMatch(
  classificationAnswer,
  /memory_events|student_profiles|写入画像/,
);

const stepAnswer = createLocalDiagnosisFollowUpAnswer({
  question: "第 3 步我没看懂",
  diagnosis,
});
assert.match(stepAnswer, /第 3 步|关键判断点|可以先看/);

const avoidAnswer = createLocalDiagnosisFollowUpAnswer({
  question: "这类题下次怎么避免？",
  diagnosis,
});
assert.match(avoidAnswer, /下次|避免|错因/);

console.log("problem chat state tests passed");
```

- [ ] **Step 2: Add the new test to the default suite**

Modify `scripts/run-tests.mjs` default suite near the existing UI tests:

```js
    "scripts/tests/image-diagnosis/image-upload-client.test.mjs",
    "scripts/tests/diagnosis/diagnosis-view-model.test.mjs",
    "scripts/tests/ui/problem-chat-state.test.mjs",
    "scripts/tests/ui/mathtrace-workbench-ui.test.mjs",
    "scripts/tests/diagnosis/agent-pipeline.test.mjs",
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
node scripts/tests/ui/problem-chat-state.test.mjs
```

Expected: FAIL with a missing module error for `src/lib/demo/problem-chat-state.ts` or `src/lib/diagnosis/diagnosis-follow-up.ts`.

- [ ] **Step 4: Add chat state helper implementation**

Create `src/lib/demo/problem-chat-state.ts`:

```ts
import type { SampleDiagnosis } from "@/data/mathtrace-demo";
import type { DiagnosisViewModel, EditableExtractionDraft } from "@/lib/diagnosis/diagnosis-view-model";
import type { PreparedImageUpload } from "@/lib/image-diagnosis/image-upload-client";

export type ProblemChatStatus =
  | "idle"
  | "image_preparing"
  | "extracting_image"
  | "reviewing_extraction"
  | "diagnosing"
  | "report_ready"
  | "error";

export type ProblemChatMessage =
  | { role: "agent"; kind: "welcome"; text: string }
  | { role: "student"; kind: "sample_selected"; text: string }
  | {
      role: "student";
      kind: "image_uploaded";
      text: string;
      file_name: string;
      preview_url: string;
    }
  | { role: "agent"; kind: "extraction_review"; text: string }
  | { role: "student"; kind: "extraction_confirmed"; text: string }
  | { role: "agent"; kind: "diagnosis_ready"; text: string }
  | { role: "student"; kind: "follow_up_question"; text: string }
  | { role: "agent"; kind: "follow_up_answer"; text: string }
  | { role: "agent"; kind: "error"; text: string };

const MAX_PROBLEM_CHAT_MESSAGES = 40;

export function createInitialProblemChatMessages(): ProblemChatMessage[] {
  return [
    {
      role: "agent",
      kind: "welcome",
      text: "可以选择样例题，也可以上传一张错题图片。我会先确认题目，再把正式报告放到右侧。",
    },
  ];
}

export function createSampleSelectedMessage(
  sample: SampleDiagnosis,
): ProblemChatMessage {
  return {
    role: "student",
    kind: "sample_selected",
    text: `我想看样例题：${sample.title}`,
  };
}

export function createImageUploadedMessage(
  image: PreparedImageUpload,
): ProblemChatMessage {
  return {
    role: "student",
    kind: "image_uploaded",
    text: `我上传了错题图片：${image.file_name}`,
    file_name: image.file_name,
    preview_url: image.preview_url,
  };
}

export function createExtractionReviewMessage(
  draft: EditableExtractionDraft,
): ProblemChatMessage {
  const warningText =
    draft.warnings.length > 0 ? "有几处识别不确定，请一起核对。" : "请确认题干和学生步骤是否准确。";

  return {
    role: "agent",
    kind: "extraction_review",
    text: `我识别到了题干和学生步骤，${warningText}`,
  };
}

export function createExtractionConfirmedMessage(): ProblemChatMessage {
  return {
    role: "student",
    kind: "extraction_confirmed",
    text: "我已确认识别结果，请生成诊断报告。",
  };
}

export function createDiagnosisReadyMessage(
  view: DiagnosisViewModel,
): ProblemChatMessage {
  return {
    role: "agent",
    kind: "diagnosis_ready",
    text: `报告已更新到右侧：${view.title}。你也可以继续问我这道题里的具体步骤。`,
  };
}

export function createFollowUpQuestionMessage(text: string): ProblemChatMessage {
  return {
    role: "student",
    kind: "follow_up_question",
    text: text.trim(),
  };
}

export function createFollowUpAnswerMessage(text: string): ProblemChatMessage {
  return {
    role: "agent",
    kind: "follow_up_answer",
    text,
  };
}

export function createProblemChatErrorMessage(text: string): ProblemChatMessage {
  return {
    role: "agent",
    kind: "error",
    text,
  };
}

export function trimProblemChatMessages(
  messages: ProblemChatMessage[],
): ProblemChatMessage[] {
  return messages.slice(-MAX_PROBLEM_CHAT_MESSAGES);
}
```

- [ ] **Step 5: Add local follow-up helper implementation**

Create `src/lib/diagnosis/diagnosis-follow-up.ts`:

```ts
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";

export interface CreateLocalDiagnosisFollowUpAnswerInput {
  question: string;
  diagnosis: DiagnosisViewModel;
}

export function canSubmitProblemFollowUp(
  text: string,
  diagnosis: DiagnosisViewModel,
): boolean {
  return text.trim().length > 0 && diagnosis.standard_solution.trim().length > 0;
}

export function createLocalDiagnosisFollowUpAnswer(
  input: CreateLocalDiagnosisFollowUpAnswerInput,
): string {
  const question = input.question.trim();
  const diagnosis = input.diagnosis;
  const firstHighlight = diagnosis.solution_highlights[0] ?? "先把题干条件整理清楚";
  const firstStep = diagnosis.step_analysis[0] ?? diagnosis.expected_diagnosis;

  if (/第\s*\d+\s*步|第\w+步|这一步|没看懂|不太理解/.test(question)) {
    const requestedStep = question.match(/第\s*(\d+)\s*步/)?.[1] ?? null;
    const secondHighlight = diagnosis.solution_highlights[1] ?? firstHighlight;
    const stepPrefix = requestedStep ? `第 ${requestedStep} 步可以这样看：` : "这一步可以这样看：";
    return `${stepPrefix}先看关键判断点：${secondHighlight}。这类题不要急着套结论，先把题干条件和每一步变形依据对齐，再回到右侧标准解法逐行核对。`;
  }

  if (/分类讨论|参数|情况/.test(question)) {
    return `这里强调分类讨论，是因为本题的结论会随条件变化。右侧标准解法里的关键判断点是：${firstHighlight}。如果直接合并情况，就容易漏掉边界或参数范围。`;
  }

  if (/避免|下次|怎么改|怎么练/.test(question)) {
    return `下次遇到同类题，可以先做三步检查：第一，圈出题干条件；第二，写出关键判断点；第三，对照本次错因“${diagnosis.expected_diagnosis}”检查有没有漏条件。`;
  }

  return `我先用本题报告里的信息解释：${firstStep}。更完整的正确过程在右侧标准解法里，建议你先对照关键判断点“${firstHighlight}”看一遍。`;
}
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
node scripts/tests/ui/problem-chat-state.test.mjs
```

Expected: PASS with `problem chat state tests passed`.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add src/lib/demo/problem-chat-state.ts src/lib/diagnosis/diagnosis-follow-up.ts scripts/tests/ui/problem-chat-state.test.mjs scripts/run-tests.mjs
git commit -m "feat: add problem chat state helpers"
```

---

### Task 2: Add Problem Chat Components

**Files:**
- Create: `src/components/workbench/problem-chat-message.tsx`
- Create: `src/components/workbench/problem-chat-card.tsx`
- Modify: `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`

**Interfaces:**
- Consumes:
  - `ProblemChatMessage`, `ProblemChatStatus` from `@/lib/demo/problem-chat-state`
  - `ImageUploadPanel` from `@/components/image-upload-panel`
  - `RiskFollowUpPanel`, `createEditableDraftRiskFollowUp` from `@/components/workbench/risk-follow-up-panel`
  - `canConfirmEditableExtractionDraft` from `@/lib/diagnosis/diagnosis-view-model`
  - existing props formerly used by `MistakeInputCard`
- Produces:
  - `export function ProblemChatMessageBubble(props: { message: ProblemChatMessage }): ReactElement`
  - `export function ProblemChatCard(props: ProblemChatCardProps): ReactElement`

- [ ] **Step 1: Add failing UI structure assertions**

Modify the `workbenchStructureSources` file list in `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`:

```js
      "problem-chat-card.tsx",
      "problem-chat-message.tsx",
```

Add assertions near the existing workbench structure checks:

```js
assert.match(
  workbenchStructureSources["problem-chat-card.tsx"],
  /export function ProblemChatCard\b/,
  "P2.11 应新增题目会话窗口组件。",
);
assert.match(
  workbenchStructureSources["problem-chat-message.tsx"],
  /export function ProblemChatMessageBubble\b/,
  "P2.11 应新增会话消息渲染组件。",
);
assert.equal(
  workbenchStructureSources["problem-chat-card.tsx"].includes("requestSampleDiagnosis"),
  false,
  "ProblemChatCard 只能通过回调触发诊断，不能直接请求诊断 API。",
);
assert.equal(
  workbenchStructureSources["problem-chat-card.tsx"].includes("writeStoredStudentProfile"),
  false,
  "ProblemChatCard 不能写 localStorage 学生画像。",
);
assert.equal(
  workbenchStructureSources["problem-chat-card.tsx"].includes("memory_events"),
  false,
  "题目会话 UI 不能声称直接写 memory_events。",
);
assert.match(
  workbenchStructureSources["problem-chat-card.tsx"],
  /placeholder="问问这道题，比如：为什么要分类讨论？"/,
  "题目会话窗口应提供当前题目追问输入。",
);
```

- [ ] **Step 2: Run UI structure test and verify RED**

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
```

Expected: FAIL because `problem-chat-card.tsx` and `problem-chat-message.tsx` do not exist.

- [ ] **Step 3: Create message bubble component**

Create `src/components/workbench/problem-chat-message.tsx`:

```tsx
import type { ReactElement } from "react";
import type { ProblemChatMessage } from "@/lib/demo/problem-chat-state";

export function ProblemChatMessageBubble({
  message,
}: {
  message: ProblemChatMessage;
}): ReactElement {
  const isStudent = message.role === "student";
  const bubbleClassName = isStudent
    ? "ml-auto bg-[var(--deep-green)] text-white"
    : message.kind === "error"
      ? "mr-auto bg-[var(--amber-bg)] text-[var(--amber-text)]"
      : "mr-auto bg-white text-[var(--charcoal)]";

  return (
    <div className={`max-w-[88%] rounded-[18px] px-4 py-3 ${bubbleClassName}`}>
      {message.kind === "image_uploaded" ? (
        <div className="mb-3 overflow-hidden rounded-[14px] bg-white/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={message.preview_url}
            alt={message.file_name}
            className="max-h-40 w-full object-contain"
          />
        </div>
      ) : null}
      <p className="whitespace-pre-line break-words text-sm leading-6">
        {message.text}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Create problem chat card component**

Create `src/components/workbench/problem-chat-card.tsx` by moving the interaction surface from `MistakeInputCard` into a conversation layout. Keep the prop surface explicit:

```tsx
import type { ChangeEvent, ReactElement } from "react";
import { ImageUploadPanel } from "@/components/image-upload-panel";
import { MathText } from "@/components/math-text";
import { ProblemChatMessageBubble } from "@/components/workbench/problem-chat-message";
import {
  createEditableDraftRiskFollowUp,
  RiskFollowUpPanel,
} from "@/components/workbench/risk-follow-up-panel";
import { canConfirmEditableExtractionDraft } from "@/lib/diagnosis/diagnosis-view-model";
import { sampleDiagnoses } from "@/data/mathtrace-demo";
import type { SampleDiagnosis, SampleQuestionId } from "@/data/mathtrace-demo";
import type { FollowUpAnswerDraft } from "@/lib/diagnosis/diagnose-api";
import type { EditableExtractionDraft } from "@/lib/diagnosis/diagnosis-view-model";
import type { PreparedImageUpload } from "@/lib/image-diagnosis/image-upload-client";
import type { DiagnosisMode } from "@/components/workbench/workbench-types";
import type {
  ProblemChatMessage,
  ProblemChatStatus,
} from "@/lib/demo/problem-chat-state";

export interface ProblemChatCardProps {
  mode: DiagnosisMode;
  status: ProblemChatStatus;
  messages: ProblemChatMessage[];
  selectedSample: SampleDiagnosis;
  selectedSampleId: SampleQuestionId;
  selectedImage: PreparedImageUpload | null;
  editableExtractionDraft: EditableExtractionDraft | null;
  selectedFollowUpChoiceId: string | null;
  followUpCustomText: string;
  pendingFollowUpAnswer: FollowUpAnswerDraft | null;
  problemFollowUpQuestion: string;
  canAskProblemFollowUp: boolean;
  isDiagnosing: boolean;
  isImagePreparing: boolean;
  apiErrorMessage: string | null;
  imageUploadErrorMessage: string | null;
  onSelectMode: (mode: DiagnosisMode) => void;
  onSelectSample: (sampleId: SampleQuestionId) => void;
  onStartDiagnosis: () => void;
  onUpdateEditableExtractionDraft: (draft: EditableExtractionDraft) => void;
  onConfirmExtraction: () => void;
  onSelectFollowUpChoice: (choiceId: string) => void;
  onUpdateFollowUpCustomText: (text: string) => void;
  onSkipFollowUp: () => void;
  onSubmitFollowUp: () => void;
  onConfirmFollowUpAnalysis: () => void;
  onImagePrepareStart: () => void;
  onImagePrepared: (image: PreparedImageUpload) => void;
  onImagePrepareError: (message: string) => void;
  onClearImage: () => void;
  onUpdateProblemFollowUpQuestion: (text: string) => void;
  onSubmitProblemFollowUp: () => void;
}
```

In the same file, implement `ProblemChatCard` with these required sections:

```tsx
export function ProblemChatCard(props: ProblemChatCardProps): ReactElement {
  const canStartDiagnosis =
    !props.isDiagnosing &&
    (props.mode === "sample" ||
      (props.selectedImage !== null && !props.isImagePreparing));
  const canConfirmExtraction =
    props.editableExtractionDraft !== null &&
    canConfirmEditableExtractionDraft(props.editableExtractionDraft) &&
    !props.isDiagnosing &&
    !props.isImagePreparing;
  const riskFollowUp =
    props.editableExtractionDraft === null
      ? null
      : createEditableDraftRiskFollowUp(props.editableExtractionDraft);

  function handleEditableDraftChange(
    field: "question_text" | "steps_text",
    event: ChangeEvent<HTMLTextAreaElement>,
  ): void {
    if (props.editableExtractionDraft === null) {
      return;
    }

    props.onUpdateEditableExtractionDraft({
      ...props.editableExtractionDraft,
      [field]: event.target.value,
    });
  }

  return (
    <section className="mathtrace-card flex h-full min-h-[640px] flex-col overflow-hidden">
      <div className="border-b border-[var(--oat)] p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--mocha)]">
          Problem chat
        </p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--charcoal)]">
          题目会话
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--warm-gray)]">
          在这里上传图片、确认识别结果和继续追问；正式报告仍在右侧和下方卡片中展示。
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[var(--oat)] p-4">
        {props.messages.map((message, index) => (
          <ProblemChatMessageBubble
            key={`${index}-${message.kind}-${message.text}`}
            message={message}
          />
        ))}

        {props.status === "extracting_image" || props.status === "diagnosing" ? (
          <div className="mr-auto max-w-[88%] rounded-[18px] bg-white px-4 py-3 text-sm leading-6 text-[var(--warm-gray)]">
            Agent 正在处理这道题...
          </div>
        ) : null}

        <div className="rounded-[18px] bg-white p-4">
          <div className="grid grid-cols-2 rounded-full bg-[var(--oat)] p-1">
            <button type="button">样例题</button>
            <button type="button">上传图片</button>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--oat)] bg-white p-4">
        <div className="flex gap-2">
          <input
            value={props.problemFollowUpQuestion}
            disabled={!props.canAskProblemFollowUp || props.isDiagnosing}
            onChange={(event) =>
              props.onUpdateProblemFollowUpQuestion(event.target.value)
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                props.onSubmitProblemFollowUp();
              }
            }}
            placeholder="问问这道题，比如：为什么要分类讨论？"
            className="min-h-11 min-w-0 flex-1 rounded-full border border-[var(--light-gray)] bg-[var(--oat)] px-4 text-sm text-[var(--charcoal)] outline-none focus:border-[var(--mocha)] disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            disabled={
              !props.canAskProblemFollowUp ||
              props.problemFollowUpQuestion.trim().length === 0 ||
              props.isDiagnosing
            }
            onClick={props.onSubmitProblemFollowUp}
            className="min-h-11 rounded-full bg-[var(--deep-green)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            发送
          </button>
        </div>
      </div>
    </section>
  );
}
```

The inner white controls in this component must include the same concrete controls that exist in `MistakeInputCard` today:

- The mode switch calls `props.onSelectMode("sample")` and `props.onSelectMode("image")`; button labels are `样例题` and `上传图片`.
- The primary action button calls `props.onStartDiagnosis`; its image-mode label is `识别图片`, and its sample-mode label is `开始诊断`.
- In image mode, render `ImageUploadPanel` with `props.selectedImage`, `props.isDiagnosing`, `props.isImagePreparing`, `props.imageUploadErrorMessage`, `props.onImagePrepareStart`, `props.onImagePrepared`, `props.onImagePrepareError`, and `props.onClearImage`.
- When `props.editableExtractionDraft` exists, render the existing two textarea fields for `题干` and `学生解题步骤`, wired through `handleEditableDraftChange("question_text", event)` and `handleEditableDraftChange("steps_text", event)`.
- When `riskFollowUp` exists, render `RiskFollowUpPanel` with the same props and callbacks currently used by `MistakeInputCard`.
- When `riskFollowUp` is null and `props.editableExtractionDraft` exists, render the `确认生成报告` button, disabled by `!canConfirmExtraction`, calling `props.onConfirmExtraction`.
- In sample mode, render the current `sampleDiagnoses.map(...)` chooser and the current sample preview using `<MathText text={props.selectedSample.question_text} />`.
- Keep the recoverable error box with `props.apiErrorMessage`; in image mode its fallback button calls `props.onSelectMode("sample")`.

- [ ] **Step 5: Run UI structure test and verify GREEN for new components**

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
```

Expected: PASS for component existence checks. It may still fail later workbench integration checks added in Task 3; do not add those checks before wiring.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/components/workbench/problem-chat-card.tsx src/components/workbench/problem-chat-message.tsx scripts/tests/ui/mathtrace-workbench-ui.test.mjs
git commit -m "feat: add problem chat components"
```

---

### Task 3: Wire Problem Chat Into MathTraceWorkbench

**Files:**
- Modify: `src/components/mathtrace-workbench.tsx`
- Modify: `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`

**Interfaces:**
- Consumes:
  - `ProblemChatCard` from `@/components/workbench/problem-chat-card`
  - helpers from `@/lib/demo/problem-chat-state`
  - `canSubmitProblemFollowUp`, `createLocalDiagnosisFollowUpAnswer` from `@/lib/diagnosis/diagnosis-follow-up`
- Produces:
  - Workbench renders `ProblemChatCard` instead of `MistakeInputCard`.
  - Workbench appends messages on sample selection, image upload, extraction review, confirmation, diagnosis ready, errors, and local follow-up.

- [ ] **Step 1: Add failing workbench integration assertions**

Modify `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`:

```js
assert.equal(
  source.includes('import { MistakeInputCard } from "@/components/workbench/mistake-input-card";'),
  false,
  "P2.11 后工作台首屏左侧应使用 ProblemChatCard，而不是 MistakeInputCard。",
);
assert.equal(
  source.includes('import { ProblemChatCard } from "@/components/workbench/problem-chat-card";'),
  true,
  "MathTraceWorkbench 应渲染题目会话窗口。",
);
assert.match(
  source,
  /const \[problemChatMessages, setProblemChatMessages\]/,
  "工作台应持有本地题目会话消息。",
);
assert.match(
  source,
  /createLocalDiagnosisFollowUpAnswer/,
  "MVP-A 追问应先使用本地诊断解释 helper。",
);
assert.doesNotMatch(
  source,
  /diagnosis-follow-up|requestDiagnosisFollowUp|\/api\/diagnosis-follow-up/,
  "P2.11 MVP 不应新增追问 API 调用。",
);
assert.match(
  source,
  /<ProblemChatCard[\s\S]*messages=\{problemChatMessages\}[\s\S]*onSubmitProblemFollowUp=\{handleSubmitProblemFollowUp\}/,
  "ProblemChatCard 应由 MathTraceWorkbench 传入消息和追问回调。",
);
assert.match(
  source,
  /<DiagnosisResultCard[\s\S]*diagnosis=\{diagnosisView\}/,
  "右侧标准解法与错因报告卡片应继续独立渲染。",
);
assert.match(
  source,
  /<PracticeLab[\s\S]*diagnosis=\{diagnosisView\}/,
  "变式练习应继续在下方结构化卡片渲染。",
);
assert.match(
  source,
  /function resetProblemChatMessages\(nextMessage\?: ProblemChatMessage\): void/,
  "工作台应提供统一的题目会话消息重置 helper。",
);
assert.match(
  source,
  /function handleSelectMode\(nextMode: DiagnosisMode\): void \{[\s\S]*resetProblemChatMessages\(\);/,
  "切换样例题/图片模式时应重置题目会话消息。",
);
assert.match(
  source,
  /function handleSelectSample\(sampleId: SampleQuestionId\): void \{[\s\S]*resetProblemChatMessages\(createSampleSelectedMessage\(nextSample\)\);/,
  "切换样例题时应重置会话，只保留欢迎消息和当前样例题消息。",
);
assert.match(
  source,
  /function handleImagePrepareStart\(\): void \{[\s\S]*resetProblemChatMessages\(\);/,
  "重新上传图片时应重置题目会话消息。",
);
assert.match(
  source,
  /function handleClearImage\(\): void \{[\s\S]*resetProblemChatMessages\(\);/,
  "清除图片时应重置题目会话消息。",
);
```

- [ ] **Step 2: Run UI test and verify RED**

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
```

Expected: FAIL because `MathTraceWorkbench` still imports and renders `MistakeInputCard`.

- [ ] **Step 3: Add imports and local chat state to workbench**

In `src/components/mathtrace-workbench.tsx`, replace the `MistakeInputCard` import:

```ts
import { ProblemChatCard } from "@/components/workbench/problem-chat-card";
```

Add helper imports:

```ts
import {
  createDiagnosisReadyMessage,
  createExtractionConfirmedMessage,
  createExtractionReviewMessage,
  createFollowUpAnswerMessage,
  createFollowUpQuestionMessage,
  createImageUploadedMessage,
  createInitialProblemChatMessages,
  createProblemChatErrorMessage,
  createSampleSelectedMessage,
  trimProblemChatMessages,
  type ProblemChatMessage,
  type ProblemChatStatus,
} from "@/lib/demo/problem-chat-state";
import {
  canSubmitProblemFollowUp,
  createLocalDiagnosisFollowUpAnswer,
} from "@/lib/diagnosis/diagnosis-follow-up";
```

Add state near the existing diagnosis state:

```ts
  const [problemChatMessages, setProblemChatMessages] = useState<
    ProblemChatMessage[]
  >(() => createInitialProblemChatMessages());
  const [problemFollowUpQuestion, setProblemFollowUpQuestion] = useState("");
```

Add derived values near `isDiagnosing`. Use an `if`-return helper instead of a nested ternary chain:

```ts
  const problemChatStatus = deriveProblemChatStatus();
  const canAskProblemFollowUp =
    problemChatStatus === "report_ready" &&
    diagnosisView.standard_solution.trim().length > 0;
```

Add local message helpers:

```ts
  function deriveProblemChatStatus(): ProblemChatStatus {
    if (apiErrorMessage) {
      return "error";
    }

    if (isImagePreparing) {
      return "image_preparing";
    }

    if (isRequestPending && diagnosisMode === "image" && selectedImage !== null) {
      return "extracting_image";
    }

    if (editableExtractionDraft !== null) {
      return "reviewing_extraction";
    }

    if (isRequestPending) {
      return "diagnosing";
    }

    if (
      isCurrentConfirmedImageReport ||
      (diagnosisMode === "sample" && diagnosisView.source === "sample")
    ) {
      return "report_ready";
    }

    return "idle";
  }

  function appendProblemChatMessage(message: ProblemChatMessage): void {
    setProblemChatMessages((currentMessages) =>
      trimProblemChatMessages([...currentMessages, message]),
    );
  }

  function resetProblemChatMessages(nextMessage?: ProblemChatMessage): void {
    setProblemChatMessages(
      nextMessage
        ? [...createInitialProblemChatMessages(), nextMessage]
        : createInitialProblemChatMessages(),
    );
  }
```

- [ ] **Step 4: Append messages from existing handlers**

Update `handleSelectMode` so switching between sample and image starts a fresh local conversation:

```ts
  function handleSelectMode(nextMode: DiagnosisMode): void {
    if (isDiagnosing || nextMode === diagnosisMode) {
      return;
    }

    clearDynamicVariantPractice();
    setDiagnosisMode(nextMode);
    setEditableExtractionDraft(null);
    resetFollowUpState();
    setProblemFollowUpQuestion("");
    resetProblemChatMessages();
    setApiErrorMessage(null);
    setRetainedReportNotice(null);
    setImageUploadErrorMessage(null);
    setIsTimelineAnimating(false);

    if (nextMode === "sample") {
      const nextSample = getSampleById(selectedSampleId);
      setDiagnosisView(createSampleDiagnosisViewModel(nextSample));
      setIsCurrentConfirmedImageReport(false);
      setProfilePreview(null);
      setCompletedStepCount(nextSample.steps.length);
    }
  }
```

Update existing handlers in `src/components/mathtrace-workbench.tsx`:

```ts
  function handleSelectSample(sampleId: SampleQuestionId): void {
    clearDynamicVariantPractice();
    const nextSample = getSampleById(sampleId);
    setSelectedSampleId(sampleId);
    setDiagnosisMode("sample");
    setDiagnosisView(createSampleDiagnosisViewModel(nextSample));
    setIsCurrentConfirmedImageReport(false);
    setEditableExtractionDraft(null);
    resetFollowUpState();
    setProblemFollowUpQuestion("");
    resetProblemChatMessages(createSampleSelectedMessage(nextSample));
    setApiErrorMessage(null);
    setRetainedReportNotice(null);
    setImageUploadErrorMessage(null);
    setProfilePreview(null);
    setCompletedStepCount(nextSample.steps.length);
    setIsTimelineAnimating(false);
  }
```

Update image prepare and clear handlers:

```ts
  function handleImagePrepareStart(): void {
    clearDynamicVariantPractice();
    setIsImagePreparing(true);
    setIsCurrentConfirmedImageReport(false);
    setEditableExtractionDraft(null);
    resetFollowUpState();
    setProblemFollowUpQuestion("");
    resetProblemChatMessages();
    setImageUploadErrorMessage(null);
    setApiErrorMessage(null);
    setRetainedReportNotice(null);
  }

  function handleImagePrepared(image: PreparedImageUpload): void {
    clearDynamicVariantPractice();
    setSelectedImage(image);
    setIsCurrentConfirmedImageReport(false);
    setEditableExtractionDraft(null);
    resetFollowUpState();
    setProblemFollowUpQuestion("");
    appendProblemChatMessage(createImageUploadedMessage(image));
    setIsImagePreparing(false);
    setImageUploadErrorMessage(null);
  }

  function handleClearImage(): void {
    if (isDiagnosing) {
      return;
    }

    clearDynamicVariantPractice();
    setSelectedImage(null);
    setIsCurrentConfirmedImageReport(false);
    setEditableExtractionDraft(null);
    setProblemFollowUpQuestion("");
    resetProblemChatMessages();
    setImageUploadErrorMessage(null);
  }
```

Append confirmation and follow-up messages:

```ts
  function handleConfirmExtraction(): void {
    if (
      isDiagnosing ||
      isImagePreparing ||
      isDiagnosisRequestLockedRef.current ||
      editableExtractionDraft === null ||
      !canConfirmEditableExtractionDraft(editableExtractionDraft)
    ) {
      return;
    }

    appendProblemChatMessage(createExtractionConfirmedMessage());
    void requestConfirmedDiagnosis(editableExtractionDraft);
  }

  function handleUpdateProblemFollowUpQuestion(text: string): void {
    setProblemFollowUpQuestion(text);
  }

  function handleSubmitProblemFollowUp(): void {
    if (!canSubmitProblemFollowUp(problemFollowUpQuestion, diagnosisView)) {
      return;
    }

    const question = problemFollowUpQuestion.trim();
    const answer = createLocalDiagnosisFollowUpAnswer({
      question,
      diagnosis: diagnosisView,
    });
    setProblemChatMessages((currentMessages) =>
      trimProblemChatMessages([
        ...currentMessages,
        createFollowUpQuestionMessage(question),
        createFollowUpAnswerMessage(answer),
      ]),
    );
    setProblemFollowUpQuestion("");
  }
```

- [ ] **Step 5: Append messages after async diagnosis results and errors**

Inside `requestDiagnosis`, after sample success `setRetainedReportNotice(null);`, append:

```ts
        appendProblemChatMessage(createDiagnosisReadyMessage(nextView));
```

Inside image extraction success after `setEditableExtractionDraft(...)`, store draft in a local variable:

```ts
      const nextDraft = createEditableExtractionDraft(extractionReview);
      setEditableExtractionDraft(nextDraft);
      appendProblemChatMessage(createExtractionReviewMessage(nextDraft));
```

Inside the `catch` block after `setApiErrorMessage(message);`, append:

```ts
      appendProblemChatMessage(createProblemChatErrorMessage(message));
```

Inside `requestConfirmedDiagnosis`, after `setRetainedReportNotice(null);`, append:

```ts
      appendProblemChatMessage(createDiagnosisReadyMessage(nextView));
```

Inside the confirmed diagnosis `catch` block after `setApiErrorMessage(message);`, append:

```ts
      appendProblemChatMessage(createProblemChatErrorMessage(message));
```

- [ ] **Step 6: Render ProblemChatCard**

Replace `<MistakeInputCard ... />` with:

```tsx
            <ProblemChatCard
              mode={diagnosisMode}
              status={problemChatStatus}
              messages={problemChatMessages}
              selectedSample={selectedSample}
              selectedSampleId={selectedSampleId}
              selectedImage={selectedImage}
              editableExtractionDraft={editableExtractionDraft}
              selectedFollowUpChoiceId={selectedFollowUpChoiceId}
              followUpCustomText={followUpCustomText}
              pendingFollowUpAnswer={pendingFollowUpAnswer}
              problemFollowUpQuestion={problemFollowUpQuestion}
              canAskProblemFollowUp={canAskProblemFollowUp}
              isDiagnosing={isDiagnosing}
              isImagePreparing={isImagePreparing}
              apiErrorMessage={apiErrorMessage}
              imageUploadErrorMessage={imageUploadErrorMessage}
              onSelectMode={handleSelectMode}
              onSelectSample={handleSelectSample}
              onStartDiagnosis={handleStartDiagnosis}
              onUpdateEditableExtractionDraft={handleUpdateEditableExtractionDraft}
              onConfirmExtraction={handleConfirmExtraction}
              onSelectFollowUpChoice={handleSelectFollowUpChoice}
              onUpdateFollowUpCustomText={handleUpdateFollowUpCustomText}
              onSkipFollowUp={handleSkipFollowUp}
              onSubmitFollowUp={handleSubmitFollowUp}
              onConfirmFollowUpAnalysis={handleConfirmFollowUpAnalysis}
              onImagePrepareStart={handleImagePrepareStart}
              onImagePrepared={handleImagePrepared}
              onImagePrepareError={handleImagePrepareError}
              onClearImage={handleClearImage}
              onUpdateProblemFollowUpQuestion={handleUpdateProblemFollowUpQuestion}
              onSubmitProblemFollowUp={handleSubmitProblemFollowUp}
            />
```

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
node scripts/tests/ui/problem-chat-state.test.mjs
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
```

Expected: both PASS.

- [ ] **Step 8: Commit Task 3**

Run:

```bash
git add src/components/mathtrace-workbench.tsx scripts/tests/ui/mathtrace-workbench-ui.test.mjs
git commit -m "feat: wire problem chat into workbench"
```

---

### Task 4: Document P2.11 Product And Interview Boundaries

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `interview/mathtrace-project-narrative.md`

**Interfaces:**
- Consumes:
  - Final P2.11 behavior from Tasks 1-3.
- Produces:
  - PRD states P2.11 is local single-problem chat MVP.
  - Interview narrative explains the product move without overstating persistence or model agency.

- [ ] **Step 1: Add PRD update**

In `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`, add a paragraph after the P2.10 paragraph:

```md
P2.11 把左侧输入区升级为题目会话窗口 MVP，但不改变诊断事实链。学生可以在同一个窗口中选择样例题、上传图片、确认识别草稿、处理低证据追问，并围绕当前题目的标准解法继续提问；右侧 `DiagnosisResultCard` 和下方 `PracticeLab`、`ProfileInsights`、`ReviewPath`、`MistakeBookPanel` 继续作为正式结构化结果区。P2.11 第一版追问采用本地展示增强：回答只基于当前 `DiagnosisViewModel` 的 `standard_solution`、`solution_highlights`、`step_analysis` 和错因摘要生成，不调用新的追问 API，不写 `memory_events` / `student_profiles` / `diagnosis_runs` / `mistake_book_items`，也不更新 localStorage 学生画像。后续如新增只读追问 API，必须单独校验输出 schema，并继续保持追问回答与画像写入门控分离。
```

- [ ] **Step 2: Add interview narrative section**

In `interview/mathtrace-project-narrative.md`, add a new stage section near the latest implemented UI/product stages:

```md
## N. P2.11 题目会话窗口 MVP

### 当前状态
已规划，目标是把左侧表单式输入升级为单题 Agent 会话窗口；正式诊断报告、变式练习、画像变化和 7 天建议仍保留在结构化卡片中。

### 功能价值
这个阶段把 MathTrace 从“点按钮生成报告”的 demo 体验，推进到“学生围绕一道错题和 Agent 对话”的学习体验。学生可以上传图片、确认识别结果、补充卡点，并继续追问当前题目的解法。

### 关键设计
会话窗口只承载交互过程：上传、确认、追问和错误恢复。诊断事实仍由 `/api/diagnose`、`/api/confirm`、确定性 pipeline、画像写入 gate 和结构化结果卡片负责。

### 技术决策与取舍
第一版选择本地单题会话，不做多题历史、不做数据库消息持久化、不新增追问 API。这样可以先验证 Agent 体验，同时不把自由聊天内容混入 `memory_events` 或 `student_profiles`。

### 面试官可能怎么问
- 为什么不直接做完整聊天历史？
- 追问回答为什么不写入画像？
- 怎么避免模型聊天污染长期记忆？
- 为什么右侧报告还要保留结构化卡片？
- 后续如何扩展成完整学习会话？

### 推荐回答
我没有把它做成通用 ChatGPT 式聊天，而是先收敛为单题会话窗口。聊天负责收集和解释，正式诊断报告仍由结构化 pipeline 生成；只有用户确认后的错因证据才会进入画像写入 gate。这样既能提升交互感，又不会牺牲 MathTrace 最重要的可解释记忆边界。

### 项目中的真实证据
- 设计：`docs/superpowers/specs/2026-07-08-p211-agent-chat-window-mvp-design.md`
- 计划：`docs/superpowers/plans/2026-07-08-p211-agent-chat-window-mvp.md`
- 代码：`src/lib/demo/problem-chat-state.ts`、`src/lib/diagnosis/diagnosis-follow-up.ts`、`src/components/workbench/problem-chat-card.tsx`
- 测试：`scripts/tests/ui/problem-chat-state.test.mjs`、`scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
```

Replace `N.` with the next available section number in the document.

- [ ] **Step 3: Run markdown diff check**

Run:

```bash
git diff --check -- docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md interview/mathtrace-project-narrative.md
```

Expected: PASS with no output.

- [ ] **Step 4: Commit Task 4**

Run:

```bash
git add docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md interview/mathtrace-project-narrative.md
git commit -m "docs: document p211 problem chat boundaries"
```

---

### Task 5: Final Verification And Local Review Prep

**Files:**
- Read: `git status --short`
- Read: `git log --oneline -5`
- No required code edits unless verification finds a real issue.

**Interfaces:**
- Consumes:
  - Tasks 1-4 complete.
- Produces:
  - Verified local branch ready for Claude Code review.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node scripts/tests/ui/problem-chat-state.test.mjs
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
node scripts/tests/smoke/demo-smoke.test.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run full default tests**

Run:

```bash
npm test
```

Expected: PASS. If this fails from sandbox/build environment symptoms unrelated to the changed files, record the exact error and run the focused tests again before asking for review.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS. If it fails with known Turbopack sandbox or permission errors, do not rewrite product code; record the exact environment error.

- [ ] **Step 4: Run required browser verification**

If a dev server is not already running, start it:

```bash
npm run dev
```

Open the app and verify:

```text
Desktop:
- 左侧标题是“题目会话”
- 样例题选择能更新右侧报告
- 上传区仍显示图片选择/拖拽入口
- 追问输入在报告生成后可用
- 右侧标准解法与错因没有被聊天窗口替代

Mobile:
- 会话消息长文本不溢出
- 图片预览不遮挡按钮
- 追问输入和发送按钮不互相挤压
- 切换样例题 / 重新上传图片后，聊天消息重置为当前题目上下文
```

- [ ] **Step 5: Prepare Claude Code review prompt**

Create a local review prompt for Claude Code using this scope:

```md
请 review P2.11 题目会话窗口 MVP 的设计和实现计划/代码，重点看：

1. 是否破坏 `sample_diagnosis` 稳定演示路径。
2. 追问回答是否可能绕过画像写入 gate，写入 `memory_events` / `student_profiles` / localStorage。
3. `ProblemChatCard` 是否混入 provider、数据库、环境变量或持久化职责。
4. `MathTraceWorkbench` 是否因为新增会话消息导致状态竞态或旧请求覆盖新状态。
5. 图片上传、识别草稿确认、低证据追问、确认写入画像这些旧路径是否仍然可用。
6. 右侧和下方结构化卡片是否仍承担正式报告、变式练习、画像和 7 天建议。
7. 测试是否覆盖了本地追问 helper、聊天消息、UI 结构边界和 smoke 路径。

请按严重程度列 findings，给出文件/行号，并区分必须修复和可后续优化。
```

- [ ] **Step 6: Show final status before handoff**

Run:

```bash
git status --short
git log --oneline -5
```

Expected:

- Only intended P2.11 files are modified or committed.
- Existing unrelated untracked files, such as `interview/mathtrace-interview-prep.md`, remain unstaged unless the user explicitly includes them.
