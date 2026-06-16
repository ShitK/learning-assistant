# Break Domain Cycles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解除 `src/lib/diagnosis/`、`src/lib/image-diagnosis/`、`src/lib/providers/` 之间由共享类型和小型 helper 造成的循环依赖，不改变诊断行为、模型调用、数据库写入或 UI。

**Architecture:** 新增中立的 `src/lib/vision-extraction/` 承载视觉抽取 prompt/parser/types；把跨 sample/image 共用的 evidence 规则、学生画像 helper、分析 provider 类型下沉到 `src/lib/shared/`。`providers/` 不再依赖 `diagnosis/` 或 `image-diagnosis/`，`image-diagnosis/` 不再运行时依赖 `diagnosis/`，诊断服务仍可作为编排层调用 provider 和 image pipeline。

**Trade-off:** `shared/` 目录会比现在更厚，这是本次重构的有意取舍：所有跨 `diagnosis` / `image-diagnosis` / `providers` 的纯类型、类型守卫和小型 helper 都下沉到中立层，以避免 domain 之间继续互相引用。

**Tech Stack:** Next.js App Router, TypeScript, Node test scripts, TypeScript Compiler API in `scripts/architecture-boundaries.test.mjs`.

---

## Non-Goals

- 不改 `POST /api/diagnose`、`POST /api/confirm`、`GET/DELETE /api/mistake-book` 的接口契约。
- 不改 prompt 文案、JSON Schema、模型 provider 行为、Supabase 写入逻辑、错题本去重/删除逻辑。
- 不拆 `src/data/mathtrace-demo.ts`。
- 不新增登录、权限、RAG、pgvector、老师端。
- 不提交 `docs/reviews/*.md`、`.env*`、`.next/`、`.DS_Store`。

## Current Cycle To Break

当前 review 指出的循环主要来自这些边：

```text
providers -> diagnosis          # analysis-provider 只为类型依赖 DiagnoseErrorCode / ConfirmationAction
providers -> image-diagnosis    # vision provider 依赖 vision-extraction-parser
image-diagnosis -> providers    # image pipeline 只为类型依赖 AnalysisEnhancementDraft
image-diagnosis -> diagnosis    # image pipeline 运行时复用 applyMemoryDeltaToProfile / evidence helper
diagnosis -> image-diagnosis    # confirm / diagnose service 编排图片确认 token、图片 pipeline
diagnosis -> providers          # diagnose / confirm service 编排 provider
```

本次要消除前四类不必要依赖。保留 `diagnosis -> image-diagnosis` 与 `diagnosis -> providers`，因为 `diagnosis` 当前是 API/service 编排层。

## Target Dependency Direction

```text
src/lib/shared/
src/lib/vision-extraction/
  ↑
  ├── src/lib/providers/
  ├── src/lib/image-diagnosis/
  └── src/lib/diagnosis/

src/lib/diagnosis/ -> src/lib/providers/
src/lib/diagnosis/ -> src/lib/image-diagnosis/
```

---

## Branch Setup

Start from latest `main`:

```bash
git switch main
git pull
git switch -c codex/break-domain-cycles
```

Expected: implementation happens on `codex/break-domain-cycles`, not directly on `main`.

---

### Task 1: Add Failing Architecture Boundary Guard

**Files:**
- Modify: `scripts/architecture-boundaries.test.mjs`

- [ ] **Step 1: Extend allowed lib prefixes**

Modify `allowedLibImportPrefixes` to include the new neutral domain:

```js
const allowedLibImportPrefixes = [
  "@/lib/shared/",
  "@/lib/math/",
  "@/lib/vision-extraction/",
  "@/lib/providers/",
  "@/lib/diagnosis/",
  "@/lib/image-diagnosis/",
  "@/lib/persistence/",
  "@/lib/mistake-book/",
  "@/lib/demo/",
];
```

- [ ] **Step 2: Add domain boundary rules**

Append this block after the existing client boundary loop:

```js
const domainBoundaryRules = [
  {
    from_dir: "src/lib/providers/",
    forbidden_prefixes: ["@/lib/diagnosis/", "@/lib/image-diagnosis/"],
    runtime_only: false,
    message:
      "providers must depend only on shared contracts, not diagnosis or image-diagnosis domains.",
  },
  {
    from_dir: "src/lib/image-diagnosis/",
    forbidden_prefixes: ["@/lib/providers/"],
    runtime_only: false,
    message:
      "image-diagnosis must depend on shared provider result types, not provider implementations.",
  },
  {
    from_dir: "src/lib/image-diagnosis/",
    forbidden_prefixes: ["@/lib/diagnosis/"],
    runtime_only: true,
    message:
      "image-diagnosis must not runtime-import diagnosis; move shared rules/helpers into shared modules.",
  },
];

for (const rule of domainBoundaryRules) {
  for (const filePath of sourceFiles.filter((item) =>
    item.startsWith(rule.from_dir),
  )) {
    const source = sourceByFilePath.get(filePath);
    const importSources = rule.runtime_only
      ? getRuntimeImportSources(source, filePath)
      : getImportSources(source, filePath);
    const forbiddenImports = importSources.filter((importSource) =>
      rule.forbidden_prefixes.some((prefix) => importSource.startsWith(prefix)),
    );

    assert.deepEqual(
      forbiddenImports,
      [],
      `${filePath}: ${rule.message} Found: ${forbiddenImports.join(", ")}`,
    );
  }
}
```

- [ ] **Step 3: Run the failing boundary test**

Run:

```bash
node scripts/architecture-boundaries.test.mjs
```

Expected: fail before implementation because current files still contain the forbidden imports listed in the final review.

- [ ] **Step 4: Commit the failing guard**

Before staging, run:

```bash
git status --short
```

Stage only:

```bash
git add scripts/architecture-boundaries.test.mjs
git commit -m "test: guard domain dependency direction"
```

---

### Task 2: Move Vision Extraction Contract To A Neutral Domain

**Files:**
- Create: `src/lib/vision-extraction/vision-extraction-types.ts`
- Move: `src/lib/image-diagnosis/vision-extraction-parser.ts` -> `src/lib/vision-extraction/vision-extraction-parser.ts`
- Modify: `src/lib/vision-extraction/vision-extraction-parser.ts`
- Modify imports in source and scripts that reference `vision-extraction-parser`

- [ ] **Step 1: Move the parser file**

Run:

```bash
mkdir -p src/lib/vision-extraction
git mv src/lib/image-diagnosis/vision-extraction-parser.ts src/lib/vision-extraction/vision-extraction-parser.ts
```

- [ ] **Step 2: Create the shared vision extraction types**

Create `src/lib/vision-extraction/vision-extraction-types.ts`:

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

export interface VisionExtractionDebugSummary {
  output_kind: "json_object" | "json_parse_error" | "non_object";
  raw_output_length: number;
  present_fields: string[];
  missing_fields: string[];
  extra_fields: string[];
  forbidden_fields: string[];
  field_lengths: {
    question_text?: number;
    student_answer?: number;
    standard_solution_draft?: number;
  };
  list_lengths: {
    student_solution_steps?: number;
    warnings?: number;
  };
}
```

- [ ] **Step 3: Update the parser imports and exports**

In `src/lib/vision-extraction/vision-extraction-parser.ts`, remove the local declarations of `ExtractionConfidence`, `VisionExtractionDraft`, and `VisionExtractionDebugSummary`, then add this import near the top:

```ts
import type {
  ExtractionConfidence,
  VisionExtractionDebugSummary,
  VisionExtractionDraft,
} from "@/lib/vision-extraction/vision-extraction-types";
```

Keep the existing `VisionExtractionParseError`, `VisionExtractionParseResult`, `VISION_STANDARD_SOLUTION_PLACEHOLDER`, parser implementation, prompt builder, and helper functions in the moved parser file.

- [ ] **Step 4: Update parser function imports**

Update these runtime imports:

```ts
// src/lib/providers/anthropic-compatible-provider.ts
import {
  createVisionExtractionPrompt,
  parseVisionExtractionText,
} from "@/lib/vision-extraction/vision-extraction-parser";

// src/lib/diagnosis/diagnosis-view-model.ts
import { VISION_STANDARD_SOLUTION_PLACEHOLDER } from "@/lib/vision-extraction/vision-extraction-parser";
import type { VisionExtractionDraft } from "@/lib/vision-extraction/vision-extraction-types";
```

Update these test imports:

```js
// scripts/vision-extraction-parser.test.mjs
const {
  parseVisionExtractionText,
  createVisionExtractionPrompt,
  VISION_STANDARD_SOLUTION_PLACEHOLDER,
} = jiti("../src/lib/vision-extraction/vision-extraction-parser.ts");

// scripts/eval-harness.test.mjs
const { parseVisionExtractionText } = jiti(
  "../src/lib/vision-extraction/vision-extraction-parser.ts",
);
```

- [ ] **Step 5: Update type imports**

Replace type imports from `@/lib/image-diagnosis/vision-extraction-parser` with:

```ts
import type {
  ExtractionConfidence,
  VisionExtractionDebugSummary,
  VisionExtractionDraft,
} from "@/lib/vision-extraction/vision-extraction-types";
```

Apply only the needed names in each file. The expected source files include:

```text
src/lib/diagnosis/confirm-service.ts
src/lib/diagnosis/diagnose-api.ts
src/lib/diagnosis/diagnose-client.ts
src/lib/diagnosis/diagnose-service.ts
src/lib/diagnosis/diagnosis-evidence.ts
src/lib/diagnosis/diagnosis-view-model.ts
src/lib/image-diagnosis/image-confirmation.ts
src/lib/image-diagnosis/image-confirmation-token.ts
src/lib/image-diagnosis/image-diagnosis-pipeline.ts
src/lib/providers/analysis-provider.ts
src/lib/providers/anthropic-compatible-provider.ts
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
node scripts/vision-extraction-parser.test.mjs
node scripts/anthropic-compatible-provider.test.mjs
node scripts/diagnosis-view-model.test.mjs
```

Expected: all three pass.

- [ ] **Step 7: Commit**

Before staging, run:

```bash
git status --short
```

Stage only:

```bash
git add scripts/vision-extraction-parser.test.mjs scripts/eval-harness.test.mjs src/lib/vision-extraction/vision-extraction-types.ts src/lib/vision-extraction/vision-extraction-parser.ts src/lib/diagnosis/confirm-service.ts src/lib/diagnosis/diagnose-api.ts src/lib/diagnosis/diagnose-client.ts src/lib/diagnosis/diagnose-service.ts src/lib/diagnosis/diagnosis-evidence.ts src/lib/diagnosis/diagnosis-view-model.ts src/lib/image-diagnosis/image-confirmation.ts src/lib/image-diagnosis/image-confirmation-token.ts src/lib/image-diagnosis/image-diagnosis-pipeline.ts src/lib/providers/analysis-provider.ts src/lib/providers/anthropic-compatible-provider.ts
git commit -m "refactor: move vision extraction contract"
```

---

### Task 3: Move Provider-Facing Shared Types Out Of Provider And Diagnosis Domains

**Files:**
- Create: `src/lib/shared/diagnose-error.ts`
- Create: `src/lib/shared/confirmation-types.ts`
- Create: `src/lib/shared/analysis-provider-types.ts`
- Modify: `src/lib/diagnosis/diagnose-api.ts`
- Modify: `src/lib/providers/analysis-provider.ts`
- Modify imports that use `AnalysisEnhancementDraft`

- [ ] **Step 1: Create shared diagnose error code**

Create `src/lib/shared/diagnose-error.ts`:

```ts
export type DiagnoseErrorCode =
  | "invalid_json"
  | "invalid_request"
  | "missing_sample_question_id"
  | "unknown_sample_question_id"
  | "missing_image"
  | "invalid_image"
  | "image_too_large"
  | "model_not_configured"
  | "model_timeout"
  | "model_request_failed"
  | "model_invalid_output";
```

- [ ] **Step 2: Re-export the API error type**

In `src/lib/diagnosis/diagnose-api.ts`, remove the local `export type DiagnoseErrorCode = ...` block and add:

```ts
import type { DiagnoseErrorCode } from "@/lib/shared/diagnose-error";

export type { DiagnoseErrorCode } from "@/lib/shared/diagnose-error";
```

Keep `DiagnoseErrorResponse` and `createDiagnoseError` behavior unchanged.

- [ ] **Step 3: Create shared confirmation types**

Create `src/lib/shared/confirmation-types.ts`:

```ts
export type ConfirmationAction =
  | "diagnose_from_student_work"
  | "skip_follow_up"
  | "submit_stuck_point"
  | "confirm_stuck_point_analysis";

export interface FollowUpAnswerDraft {
  selected_stuck_point_id: string | null;
  custom_text: string | null;
}

export type FollowUpAnswerParseResult =
  | { ok: true; value: FollowUpAnswerDraft }
  | { ok: false; message: string };
```

- [ ] **Step 4: Create shared analysis provider result types**

Create `src/lib/shared/analysis-provider-types.ts`:

```ts
import type { DiagnoseErrorCode } from "@/lib/shared/diagnose-error";
import type {
  ConfirmationAction,
  FollowUpAnswerDraft,
} from "@/lib/shared/confirmation-types";
import type { VisionExtractionDraft } from "@/lib/vision-extraction/vision-extraction-types";

export interface AnalysisEnhancementDraft {
  expected_diagnosis: string;
  step_analysis: string[];
  solution_highlights: string[];
  standard_solution: string;
  warnings: string[];
}

export interface AnalysisProviderContext {
  confirmation_action: ConfirmationAction;
  follow_up_answer?: FollowUpAnswerDraft;
}

export type AnalysisProviderResult =
  | { ok: true; value: AnalysisEnhancementDraft }
  | { ok: false; error: AnalysisProviderError };

export interface AnalysisProviderError {
  code: DiagnoseErrorCode;
  message: string;
  recoverable: boolean;
  failure_kind:
    | "not_configured"
    | "http_error"
    | "invalid_json"
    | "invalid_output"
    | "network_failed"
    | "timeout";
  provider_name?: string;
  http_status?: number;
}

export interface AnalysisProvider {
  analyzeConfirmedExtraction(
    extraction: VisionExtractionDraft,
    context?: AnalysisProviderContext,
  ): Promise<AnalysisProviderResult>;
}
```

- [ ] **Step 5: Update `analysis-provider.ts` to consume shared types**

In `src/lib/providers/analysis-provider.ts`, remove local declarations of:

```ts
AnalysisEnhancementDraft
AnalysisProvider
AnalysisProviderContext
AnalysisProviderResult
AnalysisProviderError
```

Add:

```ts
import type {
  AnalysisEnhancementDraft,
  AnalysisProvider,
  AnalysisProviderContext,
  AnalysisProviderError,
  AnalysisProviderResult,
} from "@/lib/shared/analysis-provider-types";
import type { VisionExtractionDraft } from "@/lib/vision-extraction/vision-extraction-types";

export type {
  AnalysisEnhancementDraft,
  AnalysisProvider,
  AnalysisProviderContext,
  AnalysisProviderError,
  AnalysisProviderResult,
} from "@/lib/shared/analysis-provider-types";
```

Also replace the existing imports of `DiagnoseErrorCode`, `ConfirmationAction`, and `FollowUpAnswerDraft` with:

```ts
import type {
  ConfirmationAction,
  FollowUpAnswerDraft,
} from "@/lib/shared/confirmation-types";
import type { DiagnoseErrorCode } from "@/lib/shared/diagnose-error";
```

Do not change `createAnalysisProviderConfigFromEnv`, `createAnalysisProvider`, `parseAnalysisProviderOutput`, or request body construction logic.

- [ ] **Step 6: Update image pipeline analysis type import**

In `src/lib/image-diagnosis/image-diagnosis-pipeline.ts`, replace:

```ts
import type { AnalysisEnhancementDraft } from "@/lib/providers/analysis-provider";
```

with:

```ts
import type { AnalysisEnhancementDraft } from "@/lib/shared/analysis-provider-types";
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
node scripts/analysis-provider.test.mjs
node scripts/image-diagnosis-pipeline.test.mjs
node scripts/diagnose-client.test.mjs
```

Expected: all three pass.

- [ ] **Step 8: Commit**

Before staging, run:

```bash
git status --short
```

Stage only:

```bash
git add src/lib/shared/diagnose-error.ts src/lib/shared/confirmation-types.ts src/lib/shared/analysis-provider-types.ts src/lib/diagnosis/diagnose-api.ts src/lib/providers/analysis-provider.ts src/lib/image-diagnosis/image-diagnosis-pipeline.ts
git commit -m "refactor: share provider result types"
```

---

### Task 4: Move Image-Shared Evidence And Profile Helpers Out Of Diagnosis

**Files:**
- Move: `src/lib/diagnosis/diagnosis-evidence.ts` -> `src/lib/shared/diagnosis-evidence.ts`
- Create: `src/lib/shared/student-profile.ts`
- Modify: `src/lib/diagnosis/mathtrace-agent-pipeline.ts`
- Modify: `src/lib/image-diagnosis/image-diagnosis-pipeline.ts`
- Modify imports that reference `diagnosis-evidence`

- [ ] **Step 1: Move evidence policy file**

Run:

```bash
git mv src/lib/diagnosis/diagnosis-evidence.ts src/lib/shared/diagnosis-evidence.ts
```

In the moved file, update the vision extraction type import:

```ts
import type {
  ConfirmationAction,
  FollowUpAnswerDraft,
  FollowUpAnswerParseResult,
} from "@/lib/shared/confirmation-types";
import type { VisionExtractionDraft } from "@/lib/vision-extraction/vision-extraction-types";

export type {
  ConfirmationAction,
  FollowUpAnswerDraft,
  FollowUpAnswerParseResult,
} from "@/lib/shared/confirmation-types";
```

Remove the local declarations of `ConfirmationAction`, `FollowUpAnswerDraft`, and `FollowUpAnswerParseResult` from the moved file. Keep `EvidenceLevel`, `PersistenceEvidence`, `ProfileUpdateKind`, `EvidenceAssessment`, `ProblemRiskFollowUp`, `assessExtractionEvidence`, `createProblemRiskFollowUp`, and `parseFollowUpAnswer` in this file.

- [ ] **Step 2: Update public re-exports from diagnose API**

In `src/lib/diagnosis/diagnose-api.ts`, replace imports and re-exports from:

```ts
} from "@/lib/diagnosis/diagnosis-evidence";
```

to:

```ts
} from "@/lib/shared/diagnosis-evidence";
```

Keep exported type names unchanged:

```ts
export type {
  ConfirmationAction,
  EvidenceLevel,
  FollowUpAnswerDraft,
  PersistenceEvidence,
  ProblemRiskFollowUp,
  ProfileUpdateKind,
} from "@/lib/shared/diagnosis-evidence";
```

- [ ] **Step 3: Create shared student profile helper**

Create `src/lib/shared/student-profile.ts`:

```ts
import { clampScore, isRecord } from "@/lib/shared/utils";
import type { MemoryDelta, StudentProfile } from "@/data/mathtrace-demo";

const DEMO_UPDATED_AT = "2026-05-29T22:00:00+08:00";

// 注意：此实现与 diagnose-api.ts 中的 isStudentProfile 不完全相同。
// diagnose-api.ts 额外校验 grade 字段，用于 API 请求入口的严格校验；
// 此处保留 mathtrace-agent-pipeline.ts 当前行为，不校验 grade，避免影响样本/图片诊断流程。
export function isStudentProfile(value: unknown): value is StudentProfile {
  return (
    isRecord(value) &&
    typeof value.student_id === "string" &&
    value.subject === "math" &&
    isNumberRecord(value.mastery_scores) &&
    isNumberRecord(value.frequent_mistake_causes) &&
    Array.isArray(value.weak_modules) &&
    Array.isArray(value.review_priority) &&
    typeof value.recent_trend === "string" &&
    Array.isArray(value.gaokao_focus) &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

export function applyMemoryDeltaToProfile(
  profile: StudentProfile,
  memoryDelta: MemoryDelta,
): StudentProfile {
  const masteryScores = { ...profile.mastery_scores };
  for (const [knowledgeId, change] of Object.entries(
    memoryDelta.knowledge_mastery_changes,
  )) {
    masteryScores[knowledgeId] = clampScore(
      (masteryScores[knowledgeId] ?? 70) + change,
    );
  }

  const frequentMistakeCauses = { ...profile.frequent_mistake_causes };
  for (const [causeId, change] of Object.entries(
    memoryDelta.mistake_cause_changes,
  )) {
    frequentMistakeCauses[causeId] = Math.max(
      0,
      (frequentMistakeCauses[causeId] ?? 0) + change,
    );
  }

  const reviewPriority = [
    ...memoryDelta.review_priority_changes,
    ...profile.review_priority,
  ].filter((knowledgeId, index, allKnowledgeIds) => {
    return allKnowledgeIds.indexOf(knowledgeId) === index;
  });

  return {
    ...profile,
    mastery_scores: masteryScores,
    frequent_mistake_causes: frequentMistakeCauses,
    review_priority: reviewPriority,
    updated_at: DEMO_UPDATED_AT,
  };
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === "number");
}
```

- [ ] **Step 4: Update sample pipeline to import profile helpers**

In `src/lib/diagnosis/mathtrace-agent-pipeline.ts`, remove the local `DEMO_UPDATED_AT`, `isStudentProfile`, `applyMemoryDeltaToProfile`, and `isNumberRecord` definitions.

Add:

```ts
import {
  applyMemoryDeltaToProfile,
  isStudentProfile,
} from "@/lib/shared/student-profile";
```

Also change the existing shared import from:

```ts
import { clampScore, isRecord } from "@/lib/shared/utils";
```

to:

```ts
import { isRecord } from "@/lib/shared/utils";
```

- [ ] **Step 5: Update image pipeline to import shared helpers**

In `src/lib/image-diagnosis/image-diagnosis-pipeline.ts`, replace:

```ts
import {
  applyMemoryDeltaToProfile,
  isStudentProfile,
} from "@/lib/diagnosis/mathtrace-agent-pipeline";
import {
  assessExtractionEvidence,
  createProblemRiskFollowUp,
} from "@/lib/diagnosis/diagnosis-evidence";
```

with:

```ts
import {
  assessExtractionEvidence,
  createProblemRiskFollowUp,
} from "@/lib/shared/diagnosis-evidence";
import {
  applyMemoryDeltaToProfile,
  isStudentProfile,
} from "@/lib/shared/student-profile";
```

- [ ] **Step 6: Update remaining evidence imports**

Replace imports from `@/lib/diagnosis/diagnosis-evidence` with `@/lib/shared/diagnosis-evidence` in:

```text
src/lib/diagnosis/confirm-service.ts
src/lib/diagnosis/diagnose-api.ts
scripts/diagnosis-evidence.test.mjs
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
node scripts/agent-pipeline.test.mjs
node scripts/diagnosis-evidence.test.mjs
node scripts/image-diagnosis-pipeline.test.mjs
node scripts/image-confirmation.test.mjs
```

Expected: all four pass.

- [ ] **Step 8: Commit**

Before staging, run:

```bash
git status --short
```

Stage only:

```bash
git add src/lib/shared/diagnosis-evidence.ts src/lib/shared/student-profile.ts src/lib/diagnosis/mathtrace-agent-pipeline.ts src/lib/image-diagnosis/image-diagnosis-pipeline.ts src/lib/diagnosis/confirm-service.ts src/lib/diagnosis/diagnose-api.ts scripts/diagnosis-evidence.test.mjs
git commit -m "refactor: share evidence and profile helpers"
```

---

### Task 5: Clean Imports And Prove Boundary Is Broken

**Files:**
- Modify imports in files found by `rg`
- Modify: `scripts/architecture-boundaries.test.mjs` only if line wrapping or prefix ordering needs cleanup

- [ ] **Step 1: Search for stale paths**

Run:

```bash
rg -n "@/lib/image-diagnosis/vision-extraction-parser" src scripts
rg -n "@/lib/diagnosis/diagnosis-evidence" src scripts
rg -n 'from "@/lib/providers/analysis-provider"' src scripts
rg -n 'from "@/lib/diagnosis/diagnose-api"' src/lib/providers src/lib/image-diagnosis
```

Expected: the first two commands return no stale parser/evidence paths. Imports from `@/lib/providers/analysis-provider` may remain only where code calls `createAnalysisProvider`, `createAnalysisProviderConfigFromEnv`, or `parseAnalysisProviderOutput`; provider/image-diagnosis domains must not import `diagnose-api`.

- [ ] **Step 2: Run architecture boundary test**

Run:

```bash
node scripts/architecture-boundaries.test.mjs
```

Expected: pass. In particular:

```text
providers -> diagnosis/image-diagnosis: no imports
image-diagnosis -> providers: no imports
image-diagnosis -> diagnosis: no runtime imports
```

- [ ] **Step 3: Run full automated verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 4: Browser smoke**

Start or reuse the local app on port 3000. If port 3000 is stale or locked, use the smallest safe alternative and state the URL in the final notes.

Check:

```text
1. 首页正常加载。
2. sample_diagnosis 点击“开始诊断”后展示标准解法、错因、画像、练习、复习计划。
3. 数学公式仍正常渲染。
4. “图片诊断”入口仍能打开文件选择。
5. 最近错题列表仍显示；不要在 smoke 中删除真实数据库记录。
```

- [ ] **Step 5: Commit final cleanup if needed**

If Steps 1-4 required any import cleanup, run:

```bash
git status --short
```

Stage only the files reported by `git status --short` that were changed by Task 5. The expected file is:

```bash
git add scripts/architecture-boundaries.test.mjs
git commit -m "test: verify domain dependency boundaries"
```

If no cleanup was required, do not create an empty commit.

---

### Task 6: Review, Fix, And Merge

**Files:**
- No implementation files unless review finds a real issue.
- Do not stage `docs/reviews/*.md`.

- [ ] **Step 1: Generate Claude Code review prompt**

Use this prompt:

```text
请审查 MathTrace 的“解除 diagnosis / image-diagnosis / providers 循环依赖”改动。

审查范围：当前 feature 分支相对 main 的 diff。

重点检查：
1. 是否真正消除了 providers -> diagnosis / image-diagnosis 的依赖。
2. 是否消除了 image-diagnosis -> providers 的依赖。
3. 是否消除了 image-diagnosis -> diagnosis 的运行时依赖；type-only API 类型依赖如果仍存在，请判断是否可接受。
4. 是否只移动共享类型、小 helper 和 import，没有改变诊断行为、prompt、JSON Schema、Supabase 写入或 UI。
5. `scripts/architecture-boundaries.test.mjs` 的新规则是否可靠，是否存在明显漏报或误报。
6. 是否有 `.env*`、`docs/reviews/*.md`、`.next/`、`.DS_Store` 或无关文件被纳入提交。
7. 是否需要更新 PRD、TECHNICAL_ROADMAP 或 interview 文档；如果不需要，请确认理由。

请把审查报告写入：
docs/reviews/2026-06-15-break-domain-cycles-review.md

报告请按 Critical / Important / Minor 分类，优先指出 bug、回归风险、测试缺口、安全或数据边界问题。
```

- [ ] **Step 2: Apply only verified review fixes**

For each review item:

```text
1. 先确认问题在当前代码中真实存在。
2. 如果成立，做最小修复。
3. 如果不成立，在最终说明中写明保留原因。
4. 修复后至少运行对应 focused test。
```

- [ ] **Step 3: Final verification on feature branch**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all pass.

- [ ] **Step 4: Show status and commit review fixes**

Run:

```bash
git status --short
```

Stage only verified implementation/test files. Do not stage `docs/reviews/*.md`.

Commit:

```bash
git commit -m "refactor: break diagnosis provider domain cycles"
```

If all review fixes were already committed in previous task commits, do not create an empty commit.

- [ ] **Step 5: Merge to main and push**

Run:

```bash
git switch main
git pull
git merge codex/break-domain-cycles
npm test
npm run lint
npm run build
git push origin main
git branch -d codex/break-domain-cycles
```

Expected: `main` is pushed, feature branch is deleted locally, and only unrelated local plan/review files remain untracked.

---

## Documentation Check

Expected result: no PRD, Technical Roadmap, or interview narrative update required.

Reason:

```text
This task is an internal architecture refactor. It does not change API contracts,
data schemas, model prompts, persistence semantics, UI behavior, or user-facing
demo flow.
```

### PRD

不需要更新。API 契约、学生画像 schema、`memory_delta`、错题本数据模型、模型输出边界均不变。

### TECHNICAL_ROADMAP

不需要更新。本次重构不改变长期架构目标（TypeScript Pipeline -> Supabase -> Auth/RLS -> pgvector -> Agent framework），只是清理当前 TypeScript Pipeline 内部的 domain import 方向。

### interview/mathtrace-project-narrative.md

不需要更新。本次不是用户可感知功能阶段，也不改变数据库、模型 provider、图片上传或学生画像边界。

If implementation changes any of those boundaries, stop and update the relevant document before merging.

## Self-Review

- Spec coverage: covers the review finding about `diagnosis/`, `image-diagnosis/`, and `providers/` cycles.
- Scope control: only moves shared contracts/helpers and import paths.
- Testing: starts with a failing architecture guard, then uses focused tests, full test/lint/build, and browser smoke.
- Git hygiene: one branch, small commits, explicit stage commands, no review docs or secrets.
