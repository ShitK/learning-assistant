# Architecture Directory Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 MathTrace 行为、不改 API 契约、不改数据库结构的前提下，整理源码目录结构，让诊断、图片识别、模型 provider、持久化、错题本和工作台 UI 的边界更清晰。

**Architecture:** 本计划分两条主线推进：先用架构边界测试锁定目标目录，再做机械移动和 import 修正；随后把 `src/components/mathtrace-workbench.tsx` 中的纯展示组件拆到 `src/components/workbench/`，主状态仍保留在工作台容器中。`src/data/mathtrace-demo.ts` 和 `scripts/` 暂不大拆，只做复查和明确暂缓原因。

**Tech Stack:** Next.js App Router, TypeScript, React, Tailwind CSS, Node-based test scripts, Supabase server-only persistence.

---

## Current Structure Review

本计划写入前已重新审查当前目录结构，结论如下：

- `src/app/api/**/route.ts` 结构健康：route 文件很薄，分别委托给 service，暂不整理。
- `src/lib` 目前有 25 个 `.ts` 文件平铺，混合了 provider、diagnosis、image diagnosis、persistence、mistake book、math text、demo state 和 shared util，应该整理。
- `src/components/mathtrace-workbench.tsx` 当前约 1996 行，是最明显的维护风险；它同时承担容器状态、输入卡片、追问卡片、结果卡片、标准解法、时间线、画像变化、复习计划和 helper。
- `src/data/mathtrace-demo.ts` 当前约 559 行，偏大但仍承担 demo 数据中心职责；由于 `sample_diagnosis` 是稳定演示路径，本轮只评估是否需要拆，不默认移动。
- `scripts/` 测试脚本平铺但可读性尚可；本轮只新增一个架构边界测试，不重排所有测试脚本。
- `.DS_Store`、`.next`、`.env.local`、`docs/reviews/` 已被 `.gitignore` 忽略，不属于架构整理范围。
- 当前工作区已有两个未跟踪 plan 文件：`docs/superpowers/plans/2026-06-11-p17-mistake-book-dedupe-delete.md` 和 `docs/superpowers/plans/2026-06-11-p17-supabase-real-db-verification.md`。执行本计划时不得误 stage 它们，除非用户另行确认。

## Non-Goals

- 不清理 `standard_solution_draft`。
- 不改 `/api/diagnose`、`/api/confirm`、`/api/mistake-book` 的请求或响应契约。
- 不改 Supabase schema、SQL migration、RLS/grant 权限。
- 不改错题去重、删除、画像写入、localStorage 恢复等业务行为。
- 不新增登录、权限、老师端、RAG、pgvector。
- 不把 service role key 暴露到前端。
- 不提交 `docs/reviews/*.md`、`.env*`、`.DS_Store`、`.next` 或无关未跟踪文件。

## Target Structure

```text
src/lib/
  shared/
    utils.ts
    persistence-warnings.ts
    provider-error.ts
  math/
    math-text-parser.ts
    math-extraction-normalizer.ts
  providers/
    analysis-provider.ts
    anthropic-compatible-provider.ts
  diagnosis/
    confirm-service.ts
    diagnose-api.ts
    diagnose-client.ts
    diagnose-service.ts
    diagnosis-evidence.ts
    diagnosis-view-model.ts
    mathtrace-agent-pipeline.ts
  image-diagnosis/
    image-confirmation.ts
    image-confirmation-token.ts
    image-diagnosis-pipeline.ts
    image-input.ts
    image-upload-client.ts
    vision-extraction-parser.ts
  persistence/
    diagnosis-persistence.ts
    supabase-admin.ts
  mistake-book/
    mistake-book-client.ts
    mistake-book-service.ts
  demo/
    demo-state.ts

src/components/workbench/
  agent-timeline.tsx
  diagnosis-result-card.tsx
  header-bar.tsx
  mistake-input-card.tsx
  practice-lab.tsx
  profile-insights.tsx
  review-path.tsx
  risk-follow-up-panel.tsx
  section-header.tsx
  standard-solution-content.tsx
  tag.tsx
  workbench-labels.ts
  workbench-types.ts
```

`src/components/mathtrace-workbench.tsx` 保留为工作台容器：管理 state、调用 API client、组织页面布局，把展示数据传给 `src/components/workbench/*`。

---

### Task 0: Branch And Baseline Check

**Files:**
- Read: `package.json`
- Read: `tsconfig.json`
- Read: `src/components/mathtrace-workbench.tsx`
- Read: `src/lib/*.ts`
- Read: `scripts/mathtrace-workbench-ui.test.mjs`

- [ ] **Step 1: Create a dedicated branch**

Run:

```bash
git switch -c codex/architecture-directory-cleanup
```

Expected:

```text
Switched to a new branch 'codex/architecture-directory-cleanup'
```

- [ ] **Step 2: Confirm the worktree only has known local plan files**

Run:

```bash
git status --short
```

Expected at minimum:

```text
?? docs/superpowers/plans/2026-06-11-p17-mistake-book-dedupe-delete.md
?? docs/superpowers/plans/2026-06-11-p17-supabase-real-db-verification.md
?? docs/superpowers/plans/2026-06-15-architecture-directory-cleanup.md
```

If extra unrelated files appear, do not stage them. Ask the user before including any file whose ownership is unclear.

- [ ] **Step 3: Run baseline verification before refactor**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected:

```text
npm test exits 0
npm run lint exits 0
npm run build exits 0
```

If `npm run build` fails with a sandbox-related Turbopack or port error, rerun outside the sandbox only if needed and record the exact error. Do not debug product code until the failure is proven not to be environmental.

---

### Task 1: Add Architecture Boundary Test

**Files:**
- Create: `scripts/architecture-boundaries.test.mjs`
- Modify: `package.json`

This task creates a focused guard before moving files. The test should fail against the current flat `src/lib/*.ts` layout and pass after Task 2.

- [ ] **Step 1: Create failing architecture boundary test**

Create `scripts/architecture-boundaries.test.mjs` with:

```js
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const allowedRootLibFiles = new Set([]);

async function listFiles(dir, predicate = () => true) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath, predicate)));
      continue;
    }

    if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

const rootLibEntries = await readdir("src/lib", { withFileTypes: true });
const rootLibFiles = rootLibEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => entry.name)
  .filter((fileName) => !allowedRootLibFiles.has(fileName));

assert.deepEqual(
  rootLibFiles,
  [],
  "src/lib 根目录不应继续平铺业务模块；请移动到 domain 子目录。",
);

const allowedLibImportPrefixes = [
  "@/lib/shared/",
  "@/lib/math/",
  "@/lib/providers/",
  "@/lib/diagnosis/",
  "@/lib/image-diagnosis/",
  "@/lib/persistence/",
  "@/lib/mistake-book/",
  "@/lib/demo/",
];

const sourceFiles = await listFiles("src", (filePath) =>
  /\.(ts|tsx)$/.test(filePath),
);

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function getImportSources(source) {
  const uncommentedSource = stripComments(source);
  const importSources = [];
  const fromImportPattern = /^import(?:[\s\S]*?)from\s+["']([^"']+)["'];?/gm;
  const sideEffectImportPattern = /^import\s+["']([^"']+)["'];?/gm;

  for (const match of uncommentedSource.matchAll(fromImportPattern)) {
    importSources.push(match[1]);
  }

  for (const match of uncommentedSource.matchAll(sideEffectImportPattern)) {
    importSources.push(match[1]);
  }

  return importSources;
}

for (const filePath of sourceFiles) {
  const source = await readFile(filePath, "utf8");
  const oldFlatLibImports = getImportSources(source).filter((importSource) => {
    if (!importSource.startsWith("@/lib/")) {
      return false;
    }

    return !allowedLibImportPrefixes.some((prefix) =>
      importSource.startsWith(prefix),
    );
  });

  assert.deepEqual(
    oldFlatLibImports,
    [],
    `${filePath} contains old flat @/lib imports: ${oldFlatLibImports.join(", ")}`,
  );
}

const clientComponentFiles = [];

for (const filePath of sourceFiles) {
  const source = await readFile(filePath, "utf8");
  if (source.startsWith('"use client";') || source.startsWith("'use client';")) {
    clientComponentFiles.push(filePath);
  }
}

for (const filePath of clientComponentFiles) {
  const source = await readFile(filePath, "utf8");
  const importSources = getImportSources(source);
  const uncommentedSource = stripComments(source);

  assert.equal(
    importSources.some((importSource) => importSource.startsWith("@/lib/persistence/")),
    false,
    `${filePath} must not import persistence modules.`,
  );
  assert.equal(
    importSources.some((importSource) => importSource.startsWith("@/lib/providers/")),
    false,
    `${filePath} must not import provider modules.`,
  );
  assert.equal(
    importSources.includes("@supabase/supabase-js"),
    false,
    `${filePath} must not import Supabase directly.`,
  );
  assert.equal(
    /\bSUPABASE_SERVICE_ROLE_KEY\b/.test(uncommentedSource),
    false,
    `${filePath} must not read service role key.`,
  );
}
```

- [ ] **Step 2: Add the new test to `npm test`**

Modify `package.json` so `scripts.test` starts with the architecture guard:

```json
"test": "node scripts/architecture-boundaries.test.mjs && node scripts/vision-extraction-parser.test.mjs && node scripts/anthropic-compatible-provider.test.mjs && node scripts/analysis-provider.test.mjs && node scripts/diagnosis-evidence.test.mjs && node scripts/diagnosis-persistence.test.mjs && node scripts/mistake-book-api.test.mjs && node scripts/math-text-parser.test.mjs && node scripts/image-diagnosis-pipeline.test.mjs && node scripts/image-confirmation.test.mjs && node scripts/diagnose-client.test.mjs && node scripts/image-upload-client.test.mjs && node scripts/diagnosis-view-model.test.mjs && node scripts/mathtrace-workbench-ui.test.mjs && node scripts/agent-pipeline.test.mjs && node scripts/demo-state.test.mjs && npm run test:smoke"
```

- [ ] **Step 3: Run the new test and verify it fails for the expected reason**

Run:

```bash
node scripts/architecture-boundaries.test.mjs
```

Expected:

```text
AssertionError: src/lib 根目录不应继续平铺业务模块；请移动到 domain 子目录。
```

- [ ] **Step 4: Commit the failing guard**

Default strategy for this plan is per-task commits. After confirming the test fails for the expected reason, stage only the guard files:

```bash
git add package.json scripts/architecture-boundaries.test.mjs
git commit -m "test: add architecture boundary guard"
```

---

### Task 2: Move `src/lib` Into Domain Folders

**Files:**
- Move: `src/lib/utils.ts` -> `src/lib/shared/utils.ts`
- Move: `src/lib/math-text-parser.ts` -> `src/lib/math/math-text-parser.ts`
- Move: `src/lib/math-extraction-normalizer.ts` -> `src/lib/math/math-extraction-normalizer.ts`
- Move: `src/lib/analysis-provider.ts` -> `src/lib/providers/analysis-provider.ts`
- Move: `src/lib/anthropic-compatible-provider.ts` -> `src/lib/providers/anthropic-compatible-provider.ts`
- Move: `src/lib/provider-error.ts` -> `src/lib/shared/provider-error.ts`
- Move: `src/lib/confirm-service.ts` -> `src/lib/diagnosis/confirm-service.ts`
- Move: `src/lib/diagnose-api.ts` -> `src/lib/diagnosis/diagnose-api.ts`
- Move: `src/lib/diagnose-client.ts` -> `src/lib/diagnosis/diagnose-client.ts`
- Move: `src/lib/diagnose-service.ts` -> `src/lib/diagnosis/diagnose-service.ts`
- Move: `src/lib/diagnosis-evidence.ts` -> `src/lib/diagnosis/diagnosis-evidence.ts`
- Move: `src/lib/diagnosis-view-model.ts` -> `src/lib/diagnosis/diagnosis-view-model.ts`
- Move: `src/lib/mathtrace-agent-pipeline.ts` -> `src/lib/diagnosis/mathtrace-agent-pipeline.ts`
- Move: `src/lib/image-confirmation.ts` -> `src/lib/image-diagnosis/image-confirmation.ts`
- Move: `src/lib/image-confirmation-token.ts` -> `src/lib/image-diagnosis/image-confirmation-token.ts`
- Move: `src/lib/image-diagnosis-pipeline.ts` -> `src/lib/image-diagnosis/image-diagnosis-pipeline.ts`
- Move: `src/lib/image-input.ts` -> `src/lib/image-diagnosis/image-input.ts`
- Move: `src/lib/image-upload-client.ts` -> `src/lib/image-diagnosis/image-upload-client.ts`
- Move: `src/lib/vision-extraction-parser.ts` -> `src/lib/image-diagnosis/vision-extraction-parser.ts`
- Move: `src/lib/diagnosis-persistence.ts` -> `src/lib/persistence/diagnosis-persistence.ts`
- Move: `src/lib/persistence-warnings.ts` -> `src/lib/shared/persistence-warnings.ts`
- Move: `src/lib/supabase-admin.ts` -> `src/lib/persistence/supabase-admin.ts`
- Move: `src/lib/mistake-book-client.ts` -> `src/lib/mistake-book/mistake-book-client.ts`
- Move: `src/lib/mistake-book-service.ts` -> `src/lib/mistake-book/mistake-book-service.ts`
- Move: `src/lib/demo-state.ts` -> `src/lib/demo/demo-state.ts`
- Modify: all imports under `src/**` and import-path string assertions under `scripts/**`

- [ ] **Step 1: Create target directories**

Run:

```bash
mkdir -p src/lib/shared src/lib/math src/lib/providers src/lib/diagnosis src/lib/image-diagnosis src/lib/persistence src/lib/mistake-book src/lib/demo
```

Expected: command exits 0.

- [ ] **Step 2: Move files using `git mv`**

Run each command:

```bash
git mv src/lib/utils.ts src/lib/shared/utils.ts
git mv src/lib/math-text-parser.ts src/lib/math/math-text-parser.ts
git mv src/lib/math-extraction-normalizer.ts src/lib/math/math-extraction-normalizer.ts
git mv src/lib/analysis-provider.ts src/lib/providers/analysis-provider.ts
git mv src/lib/anthropic-compatible-provider.ts src/lib/providers/anthropic-compatible-provider.ts
git mv src/lib/provider-error.ts src/lib/shared/provider-error.ts
git mv src/lib/confirm-service.ts src/lib/diagnosis/confirm-service.ts
git mv src/lib/diagnose-api.ts src/lib/diagnosis/diagnose-api.ts
git mv src/lib/diagnose-client.ts src/lib/diagnosis/diagnose-client.ts
git mv src/lib/diagnose-service.ts src/lib/diagnosis/diagnose-service.ts
git mv src/lib/diagnosis-evidence.ts src/lib/diagnosis/diagnosis-evidence.ts
git mv src/lib/diagnosis-view-model.ts src/lib/diagnosis/diagnosis-view-model.ts
git mv src/lib/mathtrace-agent-pipeline.ts src/lib/diagnosis/mathtrace-agent-pipeline.ts
git mv src/lib/image-confirmation.ts src/lib/image-diagnosis/image-confirmation.ts
git mv src/lib/image-confirmation-token.ts src/lib/image-diagnosis/image-confirmation-token.ts
git mv src/lib/image-diagnosis-pipeline.ts src/lib/image-diagnosis/image-diagnosis-pipeline.ts
git mv src/lib/image-input.ts src/lib/image-diagnosis/image-input.ts
git mv src/lib/image-upload-client.ts src/lib/image-diagnosis/image-upload-client.ts
git mv src/lib/vision-extraction-parser.ts src/lib/image-diagnosis/vision-extraction-parser.ts
git mv src/lib/diagnosis-persistence.ts src/lib/persistence/diagnosis-persistence.ts
git mv src/lib/persistence-warnings.ts src/lib/shared/persistence-warnings.ts
git mv src/lib/supabase-admin.ts src/lib/persistence/supabase-admin.ts
git mv src/lib/mistake-book-client.ts src/lib/mistake-book/mistake-book-client.ts
git mv src/lib/mistake-book-service.ts src/lib/mistake-book/mistake-book-service.ts
git mv src/lib/demo-state.ts src/lib/demo/demo-state.ts
```

Expected: each command exits 0.

- [ ] **Step 3: Replace imports according to this mapping**

Use exact mapping:

```text
@/lib/utils -> @/lib/shared/utils
@/lib/math-text-parser -> @/lib/math/math-text-parser
@/lib/math-extraction-normalizer -> @/lib/math/math-extraction-normalizer
@/lib/analysis-provider -> @/lib/providers/analysis-provider
@/lib/anthropic-compatible-provider -> @/lib/providers/anthropic-compatible-provider
@/lib/provider-error -> @/lib/shared/provider-error
@/lib/confirm-service -> @/lib/diagnosis/confirm-service
@/lib/diagnose-api -> @/lib/diagnosis/diagnose-api
@/lib/diagnose-client -> @/lib/diagnosis/diagnose-client
@/lib/diagnose-service -> @/lib/diagnosis/diagnose-service
@/lib/diagnosis-evidence -> @/lib/diagnosis/diagnosis-evidence
@/lib/diagnosis-view-model -> @/lib/diagnosis/diagnosis-view-model
@/lib/mathtrace-agent-pipeline -> @/lib/diagnosis/mathtrace-agent-pipeline
@/lib/image-confirmation -> @/lib/image-diagnosis/image-confirmation
@/lib/image-confirmation-token -> @/lib/image-diagnosis/image-confirmation-token
@/lib/image-diagnosis-pipeline -> @/lib/image-diagnosis/image-diagnosis-pipeline
@/lib/image-input -> @/lib/image-diagnosis/image-input
@/lib/image-upload-client -> @/lib/image-diagnosis/image-upload-client
@/lib/vision-extraction-parser -> @/lib/image-diagnosis/vision-extraction-parser
@/lib/diagnosis-persistence -> @/lib/persistence/diagnosis-persistence
@/lib/persistence-warnings -> @/lib/shared/persistence-warnings
@/lib/supabase-admin -> @/lib/persistence/supabase-admin
@/lib/mistake-book-client -> @/lib/mistake-book/mistake-book-client
@/lib/mistake-book-service -> @/lib/mistake-book/mistake-book-service
@/lib/demo-state -> @/lib/demo/demo-state
```

After replacement, run:

```bash
rg "@/lib/" src scripts
```

Expected: every result uses one of these prefixes:

```text
@/lib/shared/
@/lib/math/
@/lib/providers/
@/lib/diagnosis/
@/lib/image-diagnosis/
@/lib/persistence/
@/lib/mistake-book/
@/lib/demo/
```

If `rg` is unavailable in the execution environment, use:

```bash
grep -R "@/lib/" src scripts
```

- [ ] **Step 4: Update path-string assertions in `scripts/mathtrace-workbench-ui.test.mjs`**

Replace the old assertion:

```js
source.includes("@/lib/persistence-warnings")
```

with:

```js
source.includes("@/lib/shared/persistence-warnings")
```

Replace the assertion message if needed so it still says the workbench imports the browser-safe duplicate warning constant from a shared module.

- [ ] **Step 5: Run focused verification**

Run:

```bash
node scripts/architecture-boundaries.test.mjs
node scripts/mathtrace-workbench-ui.test.mjs
npm test
npm run lint
npm run build
```

Expected:

```text
all commands exit 0
```

- [ ] **Step 6: Commit `src/lib` directory cleanup**

Before staging, show:

```bash
git status --short
```

Stage only files touched by Task 2. Do not restage `package.json` or `scripts/architecture-boundaries.test.mjs` unless this task modified them again after the Task 1 commit.

```bash
git add scripts/mathtrace-workbench-ui.test.mjs src/app/api/confirm/route.ts src/app/api/diagnose/route.ts src/app/api/mistake-book/route.ts src/components/image-upload-panel.tsx src/components/math-text.tsx src/components/mathtrace-workbench.tsx src/components/mistake-book-panel.tsx src/lib
git commit -m "refactor: organize lib modules by domain"
```

Do not stage unrelated local plan files unless the user explicitly asks.

---

### Task 3: Extract Low-Risk Workbench Display Components

**Files:**
- Create: `src/components/workbench/section-header.tsx`
- Create: `src/components/workbench/tag.tsx`
- Create: `src/components/workbench/agent-timeline.tsx`
- Create: `src/components/workbench/standard-solution-content.tsx`
- Create: `src/components/workbench/practice-lab.tsx`
- Create: `src/components/workbench/profile-insights.tsx`
- Create: `src/components/workbench/review-path.tsx`
- Create: `src/components/workbench/workbench-labels.ts`
- Modify: `src/components/mathtrace-workbench.tsx`
- Test: `scripts/mathtrace-workbench-ui.test.mjs`

This task only extracts components that are already pure or mostly pure. Keep all main state and API calls in `MathTraceWorkbench`.

- [ ] **Step 1: Create shared label helpers**

Create `src/components/workbench/workbench-labels.ts`:

```ts
import {
  knowledgePoints,
  mistakeCauses,
} from "@/data/mathtrace-demo";
import type { KnowledgePoint, PracticeLevel, Severity } from "@/data/mathtrace-demo";

export const practiceLevelLabels: Record<PracticeLevel, string> = {
  basic: "基础巩固",
  transfer: "同类迁移",
  gaokao_style: "高考综合",
};

export const severityLabels: Record<Severity, string> = {
  minor: "轻微",
  medium: "中等",
  severe: "严重",
};

export const frequencyLabels: Record<KnowledgePoint["gaokao_frequency"], string> = {
  high: "高频",
  medium: "中频",
  low: "低频",
};

export function getKnowledgeName(id: string): string {
  const knowledgePoint = knowledgePoints[id];

  if (!knowledgePoint) {
    return id;
  }

  const frequency = frequencyLabels[knowledgePoint.gaokao_frequency];
  return `${knowledgePoint.display_name} · ${frequency}`;
}

export function getMistakeShortName(id: string): string {
  return mistakeCauses[id]?.short_name ?? id;
}
```

- [ ] **Step 2: Extract `SectionHeader`**

Create `src/components/workbench/section-header.tsx`:

```tsx
import type { ReactElement } from "react";

export function SectionHeader({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}): ReactElement {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mocha)]">
        {kicker}
      </p>
      <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-normal text-[var(--charcoal)] sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--warm-gray)]">
        {description}
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Extract `Tag`**

Create `src/components/workbench/tag.tsx`:

```tsx
import type { ReactElement, ReactNode } from "react";

export function Tag({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "green" | "amber" | "rust";
}): ReactElement {
  const toneClassName = {
    amber: "bg-[var(--amber-bg)] text-[var(--amber-text)]",
    green: "bg-[var(--deep-green-muted)] text-[var(--deep-green)]",
    rust: "bg-[var(--mocha-muted)] text-[var(--mocha)]",
  }[tone];

  return (
    <span className={`rounded px-2.5 py-1 text-xs font-semibold ${toneClassName}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Extract `AgentTimeline`**

Create `src/components/workbench/agent-timeline.tsx`:

```tsx
import type { ReactElement } from "react";
import type { AgentStep } from "@/data/mathtrace-demo";
import { createAgentTimelineStatusLabel } from "@/lib/diagnosis/diagnosis-view-model";

export function AgentTimeline({
  steps,
  completedStepCount,
  isDiagnosing,
  isAwaitingConfirmation,
  hasRetainedReportNotice,
}: {
  steps: AgentStep[];
  completedStepCount: number;
  isDiagnosing: boolean;
  isAwaitingConfirmation: boolean;
  hasRetainedReportNotice: boolean;
}): ReactElement {
  const statusLabel = createAgentTimelineStatusLabel({
    isDiagnosing,
    isAwaitingConfirmation,
    hasRetainedReportNotice,
  });

  return (
    <section className="mathtrace-card overflow-hidden p-5 text-[var(--charcoal)] sm:p-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--mocha)]">
            Learning Coach Agent
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-normal">诊断流程</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--warm-gray)]">
            识别、映射、诊断、画像、练习和复习一次完成。
          </p>
        </div>
        <span className="w-fit rounded-full bg-[var(--oat)] px-3 py-1 text-xs font-medium text-[var(--warm-gray)]">
          {statusLabel}
        </span>
      </div>

      <div className="mt-8 overflow-x-auto pb-2">
        <ol className="mx-auto grid min-w-[980px] max-w-[1220px] grid-cols-6">
          {steps.map((step, index) => {
            const stepState = getStepState(index, completedStepCount, isDiagnosing);
            const isLastStep = index === steps.length - 1;

            return (
              <li key={step.id} className="relative pr-6">
                {!isLastStep ? (
                  <span
                    className={`absolute left-12 right-0 top-6 h-px ${
                      stepState === "done"
                        ? "bg-[var(--deep-green)]"
                        : "bg-[var(--light-gray)]"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}

                <div className="relative z-10 flex h-12 items-center">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-full border text-lg font-semibold shadow-[0_8px_24px_rgba(166,123,91,0.08)] ${
                      stepState === "active"
                        ? "border-[var(--mocha)] bg-[var(--mocha)] text-white"
                        : stepState === "done"
                          ? "border-[var(--deep-green)] bg-white text-[var(--deep-green)]"
                          : "border-[var(--light-gray)] bg-white text-[var(--warm-gray)]"
                    }`}
                  >
                    {index + 1}
                  </span>
                </div>

                <div className="mt-5 min-h-28">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-lg font-semibold text-[var(--charcoal)]">
                      {step.display_name}
                    </p>
                    <p className="shrink-0 text-sm font-medium text-[var(--warm-gray)]">
                      {stepState === "active"
                        ? "进行中"
                        : stepState === "done"
                          ? `${step.duration_ms}ms`
                          : "等待"}
                    </p>
                  </div>
                  <p className="mt-3 max-w-[13rem] text-sm leading-6 text-[var(--warm-gray)]">
                    {step.summary}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function getStepState(
  index: number,
  completedStepCount: number,
  isDiagnosing: boolean,
): "active" | "done" | "pending" {
  if (index < completedStepCount) {
    return "done";
  }

  if (isDiagnosing && index === completedStepCount) {
    return "active";
  }

  return "pending";
}
```

- [ ] **Step 5: Extract `StandardSolutionContent`**

Create `src/components/workbench/standard-solution-content.tsx` by moving the existing `StandardSolutionContent` JSX unchanged. Also move its private helpers:

```text
isOrderedStandardSolutionBlock
isBulletStandardSolutionBlock
getNumericStandardSolutionMarker
```

The file should import:

```ts
import type { ReactElement } from "react";
import { MathText } from "@/components/math-text";
import {
  createStandardSolutionDisplayText,
  type StandardSolutionBlock,
} from "@/lib/diagnosis/diagnosis-view-model";
```

`createStandardSolutionDisplayText` stays in `@/lib/diagnosis/diagnosis-view-model`; do not move its definition into the component file.

- [ ] **Step 6: Extract `PracticeLab`**

Create `src/components/workbench/practice-lab.tsx` by moving the existing `PracticeLab` JSX unchanged. It should import:

```ts
import type { ReactElement } from "react";
import { MathText } from "@/components/math-text";
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";
import { practiceLevelLabels } from "@/components/workbench/workbench-labels";
import { SectionHeader } from "@/components/workbench/section-header";
```

- [ ] **Step 7: Extract `ProfileInsights`**

Create `src/components/workbench/profile-insights.tsx` by moving the existing `ProfileInsights` JSX unchanged. It should import:

```ts
import type { ReactElement } from "react";
import { demoStudentContext, mistakeHistory } from "@/data/mathtrace-demo";
import type { StudentProfile } from "@/data/mathtrace-demo";
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";
import { clampScore } from "@/lib/shared/utils";
import { getKnowledgeName, getMistakeShortName } from "@/components/workbench/workbench-labels";
import { SectionHeader } from "@/components/workbench/section-header";
```

- [ ] **Step 8: Extract `ReviewPath`**

Create `src/components/workbench/review-path.tsx` by moving the existing `ReviewPath` JSX unchanged. It should import:

```ts
import type { ReactElement } from "react";
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";
import { SectionHeader } from "@/components/workbench/section-header";
```

- [ ] **Step 9: Update `mathtrace-workbench.tsx` imports and remove moved helpers**

Update imports in `src/components/mathtrace-workbench.tsx`:

```ts
import { AgentTimeline } from "@/components/workbench/agent-timeline";
import { PracticeLab } from "@/components/workbench/practice-lab";
import { ProfileInsights } from "@/components/workbench/profile-insights";
import { ReviewPath } from "@/components/workbench/review-path";
import { SectionHeader } from "@/components/workbench/section-header";
import { StandardSolutionContent } from "@/components/workbench/standard-solution-content";
import { Tag } from "@/components/workbench/tag";
import { getKnowledgeName, severityLabels } from "@/components/workbench/workbench-labels";
```

Remove the original function definitions from `mathtrace-workbench.tsx`:

```text
AgentTimeline
PracticeLab
ProfileInsights
ReviewPath
SectionHeader
StandardSolutionContent
Tag
practiceLevelLabels
severityLabels
frequencyLabels
getKnowledgeName
isOrderedStandardSolutionBlock
isBulletStandardSolutionBlock
getNumericStandardSolutionMarker
getStepState
getMistakeShortName
```

Keep `MathTraceWorkbench`, `HeaderBar`, `MistakeInputCard`, `RiskFollowUpPanel`, `DiagnosisResultCard`, hydration helpers, `getSampleById`, `getKnowledgeName` call sites, and state logic in place for now. Delete the local `getKnowledgeName` definition from `mathtrace-workbench.tsx`; all remaining call sites should use the import from `@/components/workbench/workbench-labels`.

- [ ] **Step 10: Verify display extraction**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected:

```text
all commands exit 0
```

- [ ] **Step 11: Commit display component extraction**

Before staging, show:

```bash
git status --short
```

Stage only:

```bash
git add src/components/mathtrace-workbench.tsx src/components/workbench scripts/mathtrace-workbench-ui.test.mjs
git commit -m "refactor: split workbench display components"
```

---

### Task 4: Extract Workbench Interaction Components

**Files:**
- Create: `src/components/workbench/workbench-types.ts`
- Create: `src/components/workbench/header-bar.tsx`
- Create: `src/components/workbench/mistake-input-card.tsx`
- Create: `src/components/workbench/risk-follow-up-panel.tsx`
- Create: `src/components/workbench/diagnosis-result-card.tsx`
- Modify: `src/components/mathtrace-workbench.tsx`
- Test: `scripts/mathtrace-workbench-ui.test.mjs`

This task moves interaction UI while keeping state ownership in `MathTraceWorkbench`. Do not introduce Zustand, Context, reducers, or a new state library.

- [ ] **Step 1: Create shared workbench UI types**

Create `src/components/workbench/workbench-types.ts`:

```ts
import type { ConfirmationAction, FollowUpAnswerDraft } from "@/lib/diagnosis/diagnose-api";
import type { StudentProfile } from "@/data/mathtrace-demo";

export type DiagnosisMode = "sample" | "image";

export interface ProfilePreview {
  beforeProfile: StudentProfile;
  afterProfile: StudentProfile | null;
}

export interface ConfirmedDiagnosisOptions {
  confirmation_action?: ConfirmationAction;
  follow_up_answer?: FollowUpAnswerDraft;
}
```

- [ ] **Step 2: Extract `HeaderBar`**

Create `src/components/workbench/header-bar.tsx` by moving the existing `HeaderBar` function unchanged. Import:

```ts
import type { ReactElement } from "react";
import type { DiagnosisMode } from "@/components/workbench/workbench-types";
```

- [ ] **Step 3: Extract `RiskFollowUpPanel`**

Create `src/components/workbench/risk-follow-up-panel.tsx` by moving the existing `RiskFollowUpPanel` function and its private helpers:

```text
createEditableDraftRiskFollowUp
inferDraftKnowledgeIds
inferDraftProblemType
isUnrecognizedStudentAnswer
```

Keep all props explicit. Import types from the moved lib paths:

```ts
import type { FollowUpAnswerDraft, ProblemRiskFollowUp } from "@/lib/diagnosis/diagnose-api";
import type { EditableExtractionDraft } from "@/lib/diagnosis/diagnosis-view-model";
```

Export `createEditableDraftRiskFollowUp` from this file because `MistakeInputCard` uses it to decide whether to render the follow-up panel:

```ts
export function createEditableDraftRiskFollowUp(
  draft: EditableExtractionDraft,
): ProblemRiskFollowUp | null {
  const questionText = draft.question_text.trim();
  const hasRecognizedStudentAnswer =
    draft.student_answer.trim().length > 0 &&
    !isUnrecognizedStudentAnswer(draft.student_answer);
  const hasStudentSteps = draft.steps_text.trim().length > 0;

  if (
    questionText.length === 0 ||
    (hasRecognizedStudentAnswer &&
      hasStudentSteps &&
      draft.extraction_confidence !== "low")
  ) {
    return null;
  }

  const text = questionText;
  const knowledgeIds = inferDraftKnowledgeIds(text);

  return {
    problem_type: inferDraftProblemType(text),
    knowledge_points: knowledgeIds,
    common_stuck_points: [
      {
        id: "calculation_error",
        label: "求导",
        related_mistake_cause: "calculation_error",
      },
      {
        id: "classification_missing",
        label: "分类讨论",
        related_mistake_cause: "classification_missing",
      },
      {
        id: "domain_missing",
        label: "端点条件",
        related_mistake_cause: "domain_missing",
      },
      {
        id: "method_error",
        label: "参数范围",
        related_mistake_cause: "method_error",
      },
    ],
    standard_solution_summary: "标准解法将在确认后由分析模型生成。",
    prompt: "你主要卡在哪里？",
  };
}
```

- [ ] **Step 4: Extract `MistakeInputCard`**

Create `src/components/workbench/mistake-input-card.tsx` by moving the existing `MistakeInputCard` function unchanged. Keep callback props owned by the parent workbench. Import:

```ts
import type { ChangeEvent, ReactElement } from "react";
import { ImageUploadPanel } from "@/components/image-upload-panel";
import type { SampleDiagnosis, SampleQuestionId } from "@/data/mathtrace-demo";
import type { FollowUpAnswerDraft } from "@/lib/diagnosis/diagnose-api";
import {
  canConfirmEditableExtractionDraft,
  type EditableExtractionDraft,
} from "@/lib/diagnosis/diagnosis-view-model";
import type { PreparedImageUpload } from "@/lib/image-diagnosis/image-upload-client";
import type { DiagnosisMode } from "@/components/workbench/workbench-types";
import {
  createEditableDraftRiskFollowUp,
  RiskFollowUpPanel,
} from "@/components/workbench/risk-follow-up-panel";
```

- [ ] **Step 5: Extract `DiagnosisResultCard`**

Create `src/components/workbench/diagnosis-result-card.tsx` by moving the existing `DiagnosisResultCard` function unchanged. Import:

```ts
import type { ReactElement } from "react";
import { MathText } from "@/components/math-text";
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";
import { createDiagnosisResultVisibility, createStandardSolutionBlocks } from "@/lib/diagnosis/diagnosis-view-model";
import { getKnowledgeName, severityLabels } from "@/components/workbench/workbench-labels";
import { SectionHeader } from "@/components/workbench/section-header";
import { StandardSolutionContent } from "@/components/workbench/standard-solution-content";
import { Tag } from "@/components/workbench/tag";
```

- [ ] **Step 6: Update `mathtrace-workbench.tsx` to import extracted interaction components**

Add imports:

```ts
import { DiagnosisResultCard } from "@/components/workbench/diagnosis-result-card";
import { HeaderBar } from "@/components/workbench/header-bar";
import { MistakeInputCard } from "@/components/workbench/mistake-input-card";
import type {
  ConfirmedDiagnosisOptions,
  DiagnosisMode,
  ProfilePreview,
} from "@/components/workbench/workbench-types";
```

Remove the original function/type definitions from `mathtrace-workbench.tsx`:

```text
DiagnosisMode
ProfilePreview
ConfirmedDiagnosisOptions
HeaderBar
MistakeInputCard
RiskFollowUpPanel
createEditableDraftRiskFollowUp
inferDraftKnowledgeIds
inferDraftProblemType
isUnrecognizedStudentAnswer
DiagnosisResultCard
```

Also remove imports that become unused after `DiagnosisResultCard` moves out of `mathtrace-workbench.tsx`:

```text
import { SectionHeader } from "@/components/workbench/section-header";
import { StandardSolutionContent } from "@/components/workbench/standard-solution-content";
import { Tag } from "@/components/workbench/tag";
import { getKnowledgeName, severityLabels } from "@/components/workbench/workbench-labels";
```

Keep these workbench display imports because the main container still renders those sections directly:

```ts
import { AgentTimeline } from "@/components/workbench/agent-timeline";
import { PracticeLab } from "@/components/workbench/practice-lab";
import { ProfileInsights } from "@/components/workbench/profile-insights";
import { ReviewPath } from "@/components/workbench/review-path";
```

- [ ] **Step 7: Add structure assertions for completed component split**

Append this block to `scripts/mathtrace-workbench-ui.test.mjs` after the existing workbench source assertions:

```js
const maxWorkbenchLinesAfterSplit = 950;
assert.ok(
  source.split("\n").length <= maxWorkbenchLinesAfterSplit,
  `mathtrace-workbench.tsx 应明显瘦身，当前超过 ${maxWorkbenchLinesAfterSplit} 行。`,
);

const expectedWorkbenchComponentExports = [
  ["agent-timeline.tsx", /^export\s+function\s+AgentTimeline\b/m],
  ["diagnosis-result-card.tsx", /^export\s+function\s+DiagnosisResultCard\b/m],
  ["header-bar.tsx", /^export\s+function\s+HeaderBar\b/m],
  ["mistake-input-card.tsx", /^export\s+function\s+MistakeInputCard\b/m],
  ["practice-lab.tsx", /^export\s+function\s+PracticeLab\b/m],
  ["profile-insights.tsx", /^export\s+function\s+ProfileInsights\b/m],
  ["review-path.tsx", /^export\s+function\s+ReviewPath\b/m],
  ["risk-follow-up-panel.tsx", /^export\s+function\s+RiskFollowUpPanel\b/m],
  ["section-header.tsx", /^export\s+function\s+SectionHeader\b/m],
  ["standard-solution-content.tsx", /^export\s+function\s+StandardSolutionContent\b/m],
  ["tag.tsx", /^export\s+function\s+Tag\b/m],
  ["workbench-labels.ts", /^export\s+const\s+practiceLevelLabels\b/m],
  ["workbench-types.ts", /^export\s+type\s+DiagnosisMode\b/m],
];

for (const [fileName, expectedExportPattern] of expectedWorkbenchComponentExports) {
  const componentSource = await readFile(
    `src/components/workbench/${fileName}`,
    "utf8",
  );
  assert.equal(
    expectedExportPattern.test(componentSource),
    true,
    `${fileName} should expose expected named export.`,
  );
}
```

If the line-count threshold fails but `mathtrace-workbench.tsx` is clearly reduced and still only owns state/orchestration, inspect the remaining content before changing the threshold. Do not raise the threshold to hide an incomplete extraction.

- [ ] **Step 8: Verify interaction extraction**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected:

```text
all commands exit 0
```

- [ ] **Step 9: Browser smoke test**

Start or reuse the dev server:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000/
```

Verify manually:

```text
1. sample_diagnosis loads.
2. 样例诊断 can run.
3. 图片诊断 can reach extraction confirmation.
4. 生成分析草稿 still works when follow-up is needed.
5. 确认写入画像 still refreshes 最近错题.
6. 错题本删除 still opens second confirmation and removes the item after confirm.
7. Mathematical formulas still render in result and mistake book.
```

- [ ] **Step 10: Commit interaction component extraction**

Before staging, show:

```bash
git status --short
```

Stage only:

```bash
git add src/components/mathtrace-workbench.tsx src/components/workbench scripts/mathtrace-workbench-ui.test.mjs
git commit -m "refactor: split workbench interaction components"
```

---

### Task 5: Data And Scripts Review Gate

**Files:**
- Read: `src/data/mathtrace-demo.ts`
- Read: `scripts/*.mjs`
- Modify if needed: `interview/mathtrace-project-narrative.md`

This task decides whether further structure cleanup is justified. Default answer is "do not move" unless there is a concrete maintenance benefit.

- [ ] **Step 1: Review `src/data/mathtrace-demo.ts` after Tasks 2-4**

Run:

```bash
wc -l src/data/mathtrace-demo.ts
rg -n "export const|export interface|export type" src/data/mathtrace-demo.ts
```

If `rg` is unavailable, use:

```bash
grep -nE "export const|export interface|export type" src/data/mathtrace-demo.ts
```

Expected: file remains the central demo data and type source.

Decision:

```text
Do not split src/data/mathtrace-demo.ts in this architecture pass unless it has grown substantially or creates import cycles after previous tasks.
```

Rationale to record in final answer:

```text
sample_diagnosis is the stable demo path, and keeping sample data centralized reduces churn during this refactor.
```

- [ ] **Step 2: Review `scripts/` layout**

Run:

```bash
find scripts -maxdepth 2 -type f | sort
```

Expected: tests are still easy to locate by feature name.

Decision:

```text
Do not split scripts into nested folders in this architecture pass. Keep test command simple and avoid moving every test path at once.
```

- [ ] **Step 3: Decide whether interview narrative needs a small update**

Default decision: do not update `interview/mathtrace-project-narrative.md` for this pure refactor. If the user explicitly wants the architecture cleanup recorded for interview storytelling, append this short paragraph under the relevant architecture/engineering section:

```md
### 架构边界整理补充

在 P1.7 数据库和错题本功能稳定后，我单独做了一轮行为不变的目录结构整理：把 `src/lib` 从平铺工具目录调整为按 provider、diagnosis、image-diagnosis、persistence、mistake-book、math、demo、shared 分域存放；同时把近 2000 行的工作台组件拆成容器组件和若干展示/交互组件。这个整理没有改变 API 契约或数据库结构，主要收益是降低后续改 prompt、改错题本、改 UI 时的误伤概率，也更方便在面试中解释系统边界。
```

If the user does not explicitly request the interview narrative update, skip this edit and state in final answer:

```text
本次改动不涉及产品行为和接口契约，未更新 PRD；interview 文档也暂未更新。
```

- [ ] **Step 4: Final full verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected:

```text
all commands exit 0
```

---

### Task 6: Claude Code Review And Integration

**Files:**
- Create local only: `docs/reviews/YYYY-MM-DD-architecture-directory-cleanup-review.md`
- Do not commit: `docs/reviews/*.md`

- [ ] **Step 1: Prepare Claude Code review prompt**

Use this prompt:

```text
请审查 MathTrace 本次 architecture directory cleanup 分支。

背景：
- 本次是行为不变的架构整理，不应改变 API 契约、数据库结构、错题本去重/删除、画像写入、sample_diagnosis 稳定路径或图片诊断确认流程。
- 目标是把 src/lib 从平铺结构按业务域拆分，并把 src/components/mathtrace-workbench.tsx 中的大块展示/交互组件拆到 src/components/workbench/。
- 前端仍不得直连 Supabase，不得读取 SUPABASE_SERVICE_ROLE_KEY。
- docs/reviews/*.md 本地保留，不提交。

重点审查：
1. 是否存在 import 路径遗漏、循环依赖或错误的 client/server 边界。
2. 检查 `src/lib` 各 domain 子目录之间是否存在循环依赖，例如 diagnosis → image-diagnosis → diagnosis。
3. Client Component 是否误 import providers/persistence/server-only 模块。
4. API route 是否仍只委托 service，且响应契约未变。
5. sample_diagnosis、image_diagnosis、/api/confirm、mistake book read/delete 是否有行为回归风险。
6. mathtrace-workbench.tsx 拆分后，状态所有权是否仍清晰，是否引入了不必要抽象或 props 过度传递。
7. 新增 architecture-boundaries.test.mjs 是否真正能防止后续回到 flat lib 或前端直连数据库。
8. 是否有无关改动、格式化 churn、文档或 review 文件被误纳入提交。

请按严重程度列出问题：
- Critical：必须修复，否则不能合并
- Important：建议合并前修复
- Minor：可后续处理

如果没有阻塞问题，请明确说明可以进入最终自测和合并。
```

- [ ] **Step 2: Save review report locally**

Expected report path:

```text
docs/reviews/YYYY-MM-DD-architecture-directory-cleanup-review.md
```

Do not stage this file unless the user explicitly asks.

- [ ] **Step 3: Address review findings**

For each Critical or Important finding:

```text
1. Reproduce or inspect the issue.
2. Apply the smallest fix.
3. Run the narrow affected test.
4. Run npm test, npm run lint, npm run build.
```

Do not blindly apply review suggestions that expand scope beyond directory cleanup.

- [ ] **Step 4: Final stage scope and commit check**

Run:

```bash
git status --short
```

Expected staged/unstaged files should be limited to:

```text
package.json
scripts/architecture-boundaries.test.mjs
scripts/mathtrace-workbench-ui.test.mjs
src/app/api/**/route.ts
src/components/**/*.tsx
src/components/workbench/**
src/lib/**
interview/mathtrace-project-narrative.md only if Task 5 chose to update it
```

Must not include:

```text
.env*
.DS_Store
.next/**
docs/reviews/**
unrelated docs/superpowers/plans/*.md
```

- [ ] **Step 5: Merge flow**

If all tests pass and review has no blocking findings:

```bash
git switch main
git pull
git merge codex/architecture-directory-cleanup
npm test
npm run lint
npm run build
git push origin main
git branch -d codex/architecture-directory-cleanup
```

Expected:

```text
main updated
merge succeeds
all verification commands exit 0 on main
push succeeds
feature branch deleted
```

## Final Acceptance Criteria

- `src/lib` 根目录不再平铺业务 `.ts` 文件。
- 所有 `@/lib/*` imports 指向明确 domain 子目录。
- `src/components/mathtrace-workbench.tsx` 明显瘦身，主要保留工作台状态和编排逻辑。
- `src/components/workbench/*` 中组件职责清晰，不直接访问数据库、不读取服务端 env。
- `sample_diagnosis` 稳定路径没有破坏。
- 图片诊断、确认写入画像、错题本读取和删除行为没有回归。
- `npm test`、`npm run lint`、`npm run build` 通过。
- Claude Code review 已完成，Critical/Important 问题已处理或明确保留原因。
- `docs/reviews/*.md`、`.env*`、`.DS_Store`、无关未跟踪 plan 文件没有被提交。
