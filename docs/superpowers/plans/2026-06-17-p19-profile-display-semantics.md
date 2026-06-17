# P1.9 Profile Display Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the MathTrace student profile panel from “mastery score deduction” into “weakness evidence and review priority” without changing database schema, `memory_delta`, or cloud profile projection.

**Architecture:** Keep P1.8 storage and projection unchanged. Add a browser-safe front-end view model for `ProfileInsights`, then let the component render derived weakness index, cause explanations, collapsed low-signal causes, and recommendation rationale from existing `StudentProfile`, `DiagnosisViewModel`, and demo history. Documentation is updated after the behavior is locked by focused UI tests.

**Tech Stack:** Next.js App Router, React 19, TypeScript, existing CSS/Tailwind classes, Node-based UI regression tests with `jiti`.

## Global Constraints

- Do not modify Supabase migrations or database table shapes.
- Do not modify `memory_delta` API contract.
- Do not modify `applyMemoryDeltaToProfile` or cloud `student_profiles` projection rules.
- Do not add `/api/student-profile/evidence`, `/api/memory-events`, or extend `/api/student-profile` to return full `memory_events`.
- Do not let models, RAG, providers, or Agent output decide profile writes.
- Keep `sample_diagnosis`, image confirmation, mistake-book delete, cloud profile hydrate, and localStorage fallback behavior stable.
- Use real project mistake-cause keys: `domain_missing`, `classification_missing`, `method_error`, `transformation_error`, `calculation_error`.
- Keep derived display logic in front-end pure functions, not scattered through JSX.
- Use Chinese for product copy and project docs.

---

## File Structure

- Create: `src/components/workbench/profile-view-model.ts`
  - Owns display-only derivation for weakness index, status labels, priority sorting, mistake-cause filtering, and recommendation rationale.
  - Browser-safe: imports only demo data types/labels and pure helpers.
- Modify: `src/components/workbench/workbench-labels.ts`
  - Adds human-facing mistake-cause title and explanation helpers while preserving existing label helpers.
- Modify: `src/components/workbench/profile-insights.tsx`
  - Replaces inline score/cause calculations with the new view model.
  - Renders four sections: current diagnosis conclusion, expandable all-knowledge priority, mistake causes needing attention, recommendation rationale.
- Modify: `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - Adds regression coverage for weakness index, status tiers, cause filtering, real key mappings, recommendation rationale, and UI copy boundaries.
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - Adds P1.9 display semantics boundary.
- Modify: `interview/mathtrace-project-narrative.md`
  - Adds interview narrative for why P1.9 changes display semantics before adding evidence APIs or positive learning evidence tables.

---

### Task 1: Add Profile Display View Model

**Files:**
- Create: `src/components/workbench/profile-view-model.ts`
- Modify: `src/components/workbench/workbench-labels.ts`
- Test: `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`

**Interfaces:**
- Consumes:
  - `StudentProfile` from `@/data/mathtrace-demo`
  - `DiagnosisViewModel` from `@/lib/diagnosis/diagnosis-view-model`
  - `clampScore(score: number): number` from `@/lib/shared/utils`
  - existing `getKnowledgeName(id: string): string`
- Produces:
  - `export const HIGH_FREQUENCY_MISTAKE_CAUSE_THRESHOLD = 5`
  - `export function calculateWeaknessIndex(masteryScore: number): number`
  - `export function getWeaknessStatus(weaknessIndex: number): WeaknessStatusView`
  - `export function createProfileInsightsViewModel(input: CreateProfileInsightsViewModelInput): ProfileInsightsViewModel`
  - `export function getMistakeCauseTitle(id: string): string`
  - `export function getMistakeCauseDescription(id: string): string`

- [ ] **Step 1: Add failing tests for view-model exports**

Modify `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`:

```js
const workbenchStructureSources = Object.fromEntries(
  await Promise.all(
    [
      "agent-timeline.tsx",
      "diagnosis-result-card.tsx",
      "header-bar.tsx",
      "mistake-input-card.tsx",
      "practice-lab.tsx",
      "profile-insights.tsx",
      "profile-view-model.ts",
      "review-path.tsx",
      "risk-follow-up-panel.tsx",
      "section-header.tsx",
      "standard-solution-content.tsx",
      "tag.tsx",
      "workbench-labels.ts",
      "workbench-types.ts",
    ].map(async (fileName) => [
      fileName,
      stripComments(
        await readFile(`src/components/workbench/${fileName}`, "utf8"),
      ),
    ]),
  ),
);
```

Add imports near the existing `jiti` imports:

```js
const {
  calculateWeaknessIndex,
  createProfileInsightsViewModel,
  getWeaknessStatus,
  HIGH_FREQUENCY_MISTAKE_CAUSE_THRESHOLD,
} = jiti("./src/components/workbench/profile-view-model.ts");
const {
  getMistakeCauseDescription,
  getMistakeCauseTitle,
} = jiti("./src/components/workbench/workbench-labels.ts");
const {
  demoStudentProfile,
  sampleDiagnoses,
} = jiti("./src/data/mathtrace-demo.ts");
const { createSampleDiagnosisViewModel } = jiti(
  "./src/lib/diagnosis/diagnosis-view-model.ts",
);
const { applyMemoryDeltaToProfile } = jiti(
  "./src/lib/shared/student-profile.ts",
);
```

Add assertions after the Supabase/client boundary assertions:

```js
assert.equal(calculateWeaknessIndex(35), 65);
assert.equal(calculateWeaknessIndex(27), 73);
assert.equal(getWeaknessStatus(73).label, "高优先级");
assert.equal(getWeaknessStatus(58).label, "待巩固");
assert.equal(getWeaknessStatus(32).label, "基本稳定");
assert.equal(getWeaknessStatus(12).label, "稳定");
assert.equal(HIGH_FREQUENCY_MISTAKE_CAUSE_THRESHOLD, 5);

assert.equal(getMistakeCauseTitle("domain_missing"), "范围/边界遗漏");
assert.match(
  getMistakeCauseDescription("classification_missing"),
  /分类|情况|含参/,
);
assert.equal(getMistakeCauseTitle("unknown_cause"), "unknown_cause");

const derivativeSample = sampleDiagnoses.find(
  (sample) => sample.id === "sample_derivative_001",
);
assert.ok(derivativeSample, "测试样例 sample_derivative_001 应存在。");
const derivativeDiagnosis = createSampleDiagnosisViewModel(derivativeSample);
const afterDerivativeProfile = applyMemoryDeltaToProfile(
  demoStudentProfile,
  derivativeSample.memory_delta,
);
const profileInsights = createProfileInsightsViewModel({
  diagnosis: derivativeDiagnosis,
  beforeProfile: demoStudentProfile,
  afterProfile: afterDerivativeProfile,
  mistakeHistoryLength: 8,
});

assert.equal(profileInsights.title, "画像变化");
assert.equal(profileInsights.conclusionRows.length, 2);
assert.equal(profileInsights.conclusionRows[0].id, "parameter_classification");
assert.equal(profileInsights.conclusionRows[0].weaknessIndex, 62);
assert.equal(profileInsights.conclusionRows[0].weaknessDelta, 8);
assert.equal(profileInsights.conclusionRows[0].status.label, "高优先级");
assert.equal(profileInsights.priorityRows[0].id, "parameter_classification");
assert.equal(profileInsights.highlightedMistakeCauses.length, 2);
assert.equal(profileInsights.highlightedMistakeCauses[0].id, "classification_missing");
assert.equal(profileInsights.highlightedMistakeCauses[0].isNewInDiagnosis, true);
assert.equal(profileInsights.highlightedMistakeCauses[0].isHighFrequency, true);
assert.equal(profileInsights.otherMistakeCauses.some((cause) => cause.id === "calculation_error"), true);
assert.match(profileInsights.actionAdvice, /优先复习参数分类讨论/);
assert.match(profileInsights.recommendation.title, /为什么优先复习参数分类讨论/);
assert.equal(
  profileInsights.recommendation.bullets.some((bullet) =>
    bullet.includes("完整 memory_events"),
  ),
  false,
  "P1.9 推荐依据不能声称读取完整 memory_events 历史。",
);
```

Add named export check to the existing export loop:

```js
{
  fileName: "profile-view-model.ts",
  exportName: "createProfileInsightsViewModel",
  pattern: /^export\s+function\s+createProfileInsightsViewModel\b/m,
},
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
```

Expected: FAIL because `src/components/workbench/profile-view-model.ts` does not exist and `workbench-labels.ts` does not export the new mistake-cause helpers.

- [ ] **Step 3: Add mistake-cause label helpers**

Modify `src/components/workbench/workbench-labels.ts`:

```ts
const mistakeCauseDisplayDetails: Record<
  string,
  { title: string; description: string }
> = {
  domain_missing: {
    title: "范围/边界遗漏",
    description:
      "定义域、取值范围或分类讨论边界考虑不全，导致答案缺情况或范围错误。",
  },
  classification_missing: {
    title: "分类讨论漏项",
    description:
      "含参、分段或多情况题没有完整分类，导致结论缺少必要情况。",
  },
  method_error: {
    title: "解题方向选错",
    description: "审题后选择了错误的解题方法或公式，导致整题方向偏离。",
  },
  transformation_error: {
    title: "变形过程失真",
    description: "等价变形、代数整理或结构转换时丢失条件或改变原式含义。",
  },
  calculation_error: {
    title: "计算失误",
    description: "运算过程中出现符号、数值或代数计算错误。",
  },
};

export function getMistakeCauseTitle(id: string): string {
  return mistakeCauseDisplayDetails[id]?.title ?? mistakeCauses[id]?.display_name ?? id;
}

export function getMistakeCauseDescription(id: string): string {
  return (
    mistakeCauseDisplayDetails[id]?.description ??
    mistakeCauses[id]?.display_name ??
    id
  );
}
```

Keep existing `getMistakeShortName` unchanged so older UI/tests continue to pass until Task 2 replaces the old usage.

- [ ] **Step 4: Create the profile view model**

Create `src/components/workbench/profile-view-model.ts`:

```ts
import type { StudentProfile } from "@/data/mathtrace-demo";
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";
import { clampScore } from "@/lib/shared/utils";
import {
  getKnowledgeName,
  getMistakeCauseDescription,
  getMistakeCauseTitle,
} from "@/components/workbench/workbench-labels";

export const HIGH_FREQUENCY_MISTAKE_CAUSE_THRESHOLD = 5;

export interface CreateProfileInsightsViewModelInput {
  diagnosis: DiagnosisViewModel;
  beforeProfile: StudentProfile;
  afterProfile: StudentProfile | null;
  mistakeHistoryLength: number;
}

export interface WeaknessStatusView {
  label: "高优先级" | "待巩固" | "基本稳定" | "稳定";
  tone: "high" | "medium" | "low" | "stable";
}

export interface KnowledgePriorityRow {
  id: string;
  name: string;
  previousMasteryScore: number;
  nextMasteryScore: number;
  previousWeaknessIndex: number;
  weaknessIndex: number;
  weaknessDelta: number;
  status: WeaknessStatusView;
  summary: string;
}

export interface MistakeCauseInsight {
  id: string;
  title: string;
  description: string;
  previousCount: number;
  nextCount: number;
  delta: number;
  isHighFrequency: boolean;
  isNewInDiagnosis: boolean;
}

export interface RecommendationView {
  title: string;
  bullets: string[];
}

export interface ProfileInsightsViewModel {
  title: string;
  description: string;
  shouldPersistProfile: boolean;
  notPersistedMessage: string | null;
  conclusionRows: KnowledgePriorityRow[];
  priorityRows: KnowledgePriorityRow[];
  actionAdvice: string;
  highlightedMistakeCauses: MistakeCauseInsight[];
  otherMistakeCauses: MistakeCauseInsight[];
  emptyCauseMessage: string | null;
  recommendation: RecommendationView;
}

export function calculateWeaknessIndex(masteryScore: number): number {
  return clampScore(100 - masteryScore);
}

export function getWeaknessStatus(weaknessIndex: number): WeaknessStatusView {
  if (weaknessIndex >= 61) {
    return { label: "高优先级", tone: "high" };
  }

  if (weaknessIndex >= 41) {
    return { label: "待巩固", tone: "medium" };
  }

  if (weaknessIndex >= 21) {
    return { label: "基本稳定", tone: "low" };
  }

  return { label: "稳定", tone: "stable" };
}

export function createProfileInsightsViewModel(
  input: CreateProfileInsightsViewModelInput,
): ProfileInsightsViewModel {
  const shouldPreviewDelta =
    input.diagnosis.should_persist_profile || input.afterProfile !== null;
  const changedKnowledgeIds = Object.keys(
    input.diagnosis.memory_delta.knowledge_mastery_changes,
  );
  const allKnowledgeIds = uniqueStrings([
    ...Object.keys(input.beforeProfile.mastery_scores),
    ...Object.keys(input.afterProfile?.mastery_scores ?? {}),
    ...changedKnowledgeIds,
  ]);
  const priorityRows = allKnowledgeIds
    .map((id) =>
      createKnowledgePriorityRow({
        id,
        beforeProfile: input.beforeProfile,
        afterProfile: input.afterProfile,
        diagnosis: input.diagnosis,
        shouldPreviewDelta,
      }),
    )
    .sort(compareKnowledgePriorityRows);
  const conclusionRows = changedKnowledgeIds
    .map((id) => priorityRows.find((row) => row.id === id))
    .filter((row): row is KnowledgePriorityRow => row !== undefined)
    .sort(compareKnowledgePriorityRows);
  const actionTarget = conclusionRows[0] ?? priorityRows[0] ?? null;
  const mistakeCauses = createMistakeCauseInsights({
    beforeProfile: input.beforeProfile,
    afterProfile: input.afterProfile,
    diagnosis: input.diagnosis,
    shouldPreviewDelta,
  });
  const highlightedMistakeCauses = mistakeCauses.filter(
    (cause) => cause.isNewInDiagnosis || cause.isHighFrequency,
  );
  const otherMistakeCauses = mistakeCauses.filter(
    (cause) => !cause.isNewInDiagnosis && !cause.isHighFrequency,
  );

  return {
    title: "画像变化",
    description: `基于当前画像、本次诊断和 ${input.mistakeHistoryLength} 条 demo 历史错题，展示本次薄弱证据如何影响复习优先级。`,
    shouldPersistProfile: input.diagnosis.should_persist_profile,
    notPersistedMessage: input.diagnosis.should_persist_profile
      ? null
      : "本次仅展示诊断建议，未写入长期画像。",
    conclusionRows,
    priorityRows,
    actionAdvice: createActionAdvice(actionTarget, conclusionRows),
    highlightedMistakeCauses,
    otherMistakeCauses,
    emptyCauseMessage:
      highlightedMistakeCauses.length === 0
        ? "本次没有新增明确错因；先按知识点薄弱信号安排复习。"
        : null,
    recommendation: createRecommendation(actionTarget, highlightedMistakeCauses),
  };
}

function createKnowledgePriorityRow(input: {
  id: string;
  beforeProfile: StudentProfile;
  afterProfile: StudentProfile | null;
  diagnosis: DiagnosisViewModel;
  shouldPreviewDelta: boolean;
}): KnowledgePriorityRow {
  const previousMasteryScore = input.beforeProfile.mastery_scores[input.id] ?? 70;
  const delta =
    input.diagnosis.memory_delta.knowledge_mastery_changes[input.id] ?? 0;
  const nextMasteryScore =
    input.afterProfile?.mastery_scores[input.id] ??
    (input.shouldPreviewDelta
      ? clampScore(previousMasteryScore + delta)
      : previousMasteryScore);
  const previousWeaknessIndex = calculateWeaknessIndex(previousMasteryScore);
  const weaknessIndex = calculateWeaknessIndex(nextMasteryScore);
  const weaknessDelta = weaknessIndex - previousWeaknessIndex;
  const status = getWeaknessStatus(weaknessIndex);

  return {
    id: input.id,
    name: getKnowledgeName(input.id),
    previousMasteryScore,
    nextMasteryScore,
    previousWeaknessIndex,
    weaknessIndex,
    weaknessDelta,
    status,
    summary: createKnowledgeSummary(weaknessDelta, status),
  };
}

function createKnowledgeSummary(
  weaknessDelta: number,
  status: WeaknessStatusView,
): string {
  if (weaknessDelta > 0) {
    return "本次新增薄弱信号";
  }

  if (weaknessDelta < 0) {
    return "薄弱信号有所缓和";
  }

  return status.label === "稳定" ? "当前较稳定" : "保持关注";
}

function createMistakeCauseInsights(input: {
  beforeProfile: StudentProfile;
  afterProfile: StudentProfile | null;
  diagnosis: DiagnosisViewModel;
  shouldPreviewDelta: boolean;
}): MistakeCauseInsight[] {
  const causeIds = uniqueStrings([
    ...Object.keys(input.beforeProfile.frequent_mistake_causes),
    ...Object.keys(input.afterProfile?.frequent_mistake_causes ?? {}),
    ...Object.keys(input.diagnosis.memory_delta.mistake_cause_changes),
  ]);

  return causeIds
    .map((id) => {
      const previousCount =
        input.beforeProfile.frequent_mistake_causes[id] ?? 0;
      const delta =
        input.diagnosis.memory_delta.mistake_cause_changes[id] ?? 0;
      const nextCount =
        input.afterProfile?.frequent_mistake_causes[id] ??
        (input.shouldPreviewDelta ? Math.max(0, previousCount + delta) : previousCount);

      return {
        id,
        title: getMistakeCauseTitle(id),
        description: getMistakeCauseDescription(id),
        previousCount,
        nextCount,
        delta: nextCount - previousCount,
        isHighFrequency: nextCount >= HIGH_FREQUENCY_MISTAKE_CAUSE_THRESHOLD,
        isNewInDiagnosis: nextCount - previousCount > 0,
      };
    })
    .sort(compareMistakeCauseInsights);
}

function createActionAdvice(
  actionTarget: KnowledgePriorityRow | null,
  conclusionRows: KnowledgePriorityRow[],
): string {
  if (!actionTarget) {
    return "本次没有新增可写入的薄弱点，先按当前错题报告完成订正。";
  }

  const secondaryTarget = conclusionRows.find(
    (row) => row.id !== actionTarget.id,
  );

  if (secondaryTarget) {
    return `优先复习${stripFrequency(actionTarget.name)}；${stripFrequency(
      secondaryTarget.name,
    )}保持常规练习即可。`;
  }

  return `优先复习${stripFrequency(actionTarget.name)}，先处理本次暴露的主要薄弱点。`;
}

function createRecommendation(
  actionTarget: KnowledgePriorityRow | null,
  highlightedMistakeCauses: MistakeCauseInsight[],
): RecommendationView {
  if (!actionTarget) {
    return {
      title: "推荐依据",
      bullets: ["本次没有新增可写入的画像变化，建议先完成当前错题订正。"],
    };
  }

  const bullets = [
    `当前薄弱指数 ${actionTarget.weaknessIndex}，状态为“${actionTarget.status.label}”。`,
  ];

  if (actionTarget.weaknessDelta > 0) {
    bullets.push(`本次诊断使薄弱指数上升 ${actionTarget.weaknessDelta}。`);
  } else {
    bullets.push("本次没有继续推高该知识点薄弱指数。");
  }

  const newCause = highlightedMistakeCauses.find(
    (cause) => cause.isNewInDiagnosis,
  );
  if (newCause) {
    bullets.push(
      `相关错因“${newCause.title}”本次新增，累计 ${newCause.nextCount} 次。`,
    );
  } else {
    bullets.push("当前建议来自画像快照和本次知识点变化。");
  }

  return {
    title: `为什么优先复习${stripFrequency(actionTarget.name)}？`,
    bullets,
  };
}

function compareKnowledgePriorityRows(
  left: KnowledgePriorityRow,
  right: KnowledgePriorityRow,
): number {
  return (
    right.weaknessIndex - left.weaknessIndex ||
    right.weaknessDelta - left.weaknessDelta ||
    left.name.localeCompare(right.name, "zh-Hans-CN")
  );
}

function compareMistakeCauseInsights(
  left: MistakeCauseInsight,
  right: MistakeCauseInsight,
): number {
  return (
    Number(right.isNewInDiagnosis) - Number(left.isNewInDiagnosis) ||
    Number(right.isHighFrequency) - Number(left.isHighFrequency) ||
    right.nextCount - left.nextCount ||
    left.title.localeCompare(right.title, "zh-Hans-CN")
  );
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, allValues) => {
    return value.length > 0 && allValues.indexOf(value) === index;
  });
}

function stripFrequency(name: string): string {
  return name.split(" · ")[0] ?? name;
}
```

- [ ] **Step 5: Run focused test and verify it passes**

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
```

Expected: PASS with `mathtrace workbench UI regression test passed`.

- [ ] **Step 6: Commit Task 1**

Before committing, run:

```bash
git status --short
```

Stage exactly:

```bash
git add src/components/workbench/profile-view-model.ts src/components/workbench/workbench-labels.ts scripts/tests/ui/mathtrace-workbench-ui.test.mjs
git commit -m "feat: add profile display view model"
```

---

### Task 2: Render New Profile Insights UI

**Files:**
- Modify: `src/components/workbench/profile-insights.tsx`
- Modify: `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
- Reference only: `docs/superpowers/wireframes/p19-design-options.html`

**Interfaces:**
- Consumes:
  - `createProfileInsightsViewModel(input): ProfileInsightsViewModel`
  - `ProfileInsightsViewModel.conclusionRows`
  - `ProfileInsightsViewModel.priorityRows`
  - `ProfileInsightsViewModel.highlightedMistakeCauses`
  - `ProfileInsightsViewModel.otherMistakeCauses`
  - `ProfileInsightsViewModel.recommendation`
- Produces:
  - Updated `ProfileInsights` UI with no primary “掌握度变化” heading.
  - No new API calls and no database imports.

- [ ] **Step 1: Add failing UI copy and boundary tests**

Modify `scripts/tests/ui/mathtrace-workbench-ui.test.mjs` after the profile view-model assertions:

```js
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("掌握度变化"),
  false,
  "画像区不应再以“掌握度变化”作为主标题。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("长期价值对比"),
  false,
  "画像区不应继续使用虚泛的“长期价值对比”叙事。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("薄弱指数"),
  true,
  "画像区应使用薄弱指数表达复习优先级。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("本次诊断结论"),
  true,
  "画像区应展示本次诊断结论。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("全部知识点优先级"),
  true,
  "画像区应提供全部知识点优先级折叠区。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("需要关注的错因"),
  true,
  "画像区应展示需要关注的错因。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("推荐依据"),
  true,
  "画像区应展示推荐依据。",
);
assert.match(
  workbenchStructureSources["profile-insights.tsx"],
  /createProfileInsightsViewModel/,
  "画像区应通过纯 view model 派生展示数据。",
);
assert.equal(
  workbenchStructureSources["profile-insights.tsx"].includes("memory_events"),
  false,
  "P1.9 前端 UI 不应声称读取完整 memory_events 历史。",
);
```

- [ ] **Step 2: Run focused test and verify it fails**

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
```

Expected: FAIL because `profile-insights.tsx` still contains “掌握度变化” and “长期价值对比”, and does not yet render the new sections.

- [ ] **Step 3: Replace inline calculations with the view model**

Modify imports in `src/components/workbench/profile-insights.tsx`:

```ts
import type { ReactElement } from "react";
import { mistakeHistory, type StudentProfile } from "@/data/mathtrace-demo";
import type { DiagnosisViewModel } from "@/lib/diagnosis/diagnosis-view-model";
import { createProfileInsightsViewModel } from "@/components/workbench/profile-view-model";
import { SectionHeader } from "@/components/workbench/section-header";
```

Inside `ProfileInsights`, replace existing `changedKnowledgeIds`, `profileRows`, and `mistakeCauseRows` derivation with:

```ts
  const viewModel = createProfileInsightsViewModel({
    diagnosis,
    beforeProfile,
    afterProfile,
    mistakeHistoryLength: mistakeHistory.length,
  });
```

- [ ] **Step 4: Render the new four-section layout**

Replace the current body under the header with this structure:

```tsx
      <div className="p-5 sm:p-6">
        {viewModel.notPersistedMessage ? (
          <p className="mb-5 rounded-[16px] bg-[var(--amber-bg)] px-4 py-3 text-sm leading-6 text-[var(--amber-text)]">
            {viewModel.notPersistedMessage}
          </p>
        ) : null}

        <section>
          <p className="text-sm font-semibold text-[var(--charcoal)]">
            本次诊断结论
          </p>
          <div className="mt-4 grid gap-3">
            {viewModel.conclusionRows.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-[var(--oat)] bg-white px-4 py-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--charcoal)]">
                      {row.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--warm-gray)]">
                      {row.summary}
                    </p>
                  </div>
                  <span className={getWeaknessPillClassName(row.status.tone)}>
                    薄弱指数 {row.weaknessIndex}
                    {formatSignedDelta(row.weaknessDelta)}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 rounded-lg bg-[var(--soft-green)] px-4 py-3 text-sm leading-6 text-[var(--deep-green)]">
            {viewModel.actionAdvice}
          </p>
        </section>

        <details className="mt-6 rounded-lg border border-[var(--oat)] bg-white px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--charcoal)]">
            全部知识点优先级
          </summary>
          <div className="mt-4 grid gap-3">
            {viewModel.priorityRows.map((row, index) => (
              <div
                key={row.id}
                className="flex flex-col gap-1 border-t border-[var(--oat)] pt-3 text-sm first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="font-medium text-[var(--charcoal)]">
                  {index + 1}. {row.name}
                </span>
                <span className="text-[var(--warm-gray)]">
                  薄弱指数 {row.weaknessIndex} · {row.status.label}
                </span>
              </div>
            ))}
          </div>
        </details>

        <section className="mt-6">
          <p className="text-sm font-semibold text-[var(--charcoal)]">
            需要关注的错因
          </p>
          {viewModel.emptyCauseMessage ? (
            <p className="mt-3 rounded-lg bg-[var(--oat)] px-4 py-3 text-sm leading-6 text-[var(--warm-gray)]">
              {viewModel.emptyCauseMessage}
            </p>
          ) : (
            <div className="mt-4 grid gap-3">
              {viewModel.highlightedMistakeCauses.map((cause) => (
                <div
                  key={cause.id}
                  className="rounded-lg border border-[var(--oat)] bg-white px-4 py-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--charcoal)]">
                        {cause.title}
                        {cause.isHighFrequency ? (
                          <span className="ml-2 rounded-full bg-[var(--amber-bg)] px-2 py-0.5 text-xs text-[var(--amber-text)]">
                            高频
                          </span>
                        ) : null}
                        {cause.isNewInDiagnosis ? (
                          <span className="ml-2 rounded-full bg-[var(--soft-green)] px-2 py-0.5 text-xs text-[var(--deep-green)]">
                            本次新增
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[var(--warm-gray)]">
                        {cause.description}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-[var(--charcoal)]">
                      累计 {cause.nextCount} 次{formatSignedDelta(cause.delta)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewModel.otherMistakeCauses.length > 0 ? (
            <details className="mt-3 rounded-lg bg-[var(--oat)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-[var(--charcoal)]">
                其他错因（近期无变化）
              </summary>
              <div className="mt-3 grid gap-2">
                {viewModel.otherMistakeCauses.map((cause) => (
                  <div
                    key={cause.id}
                    className="flex items-center justify-between gap-3 text-sm text-[var(--warm-gray)]"
                  >
                    <span>{cause.title}</span>
                    <span>{cause.nextCount} 次（无变化）</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </section>

        <section className="mt-6 rounded-lg bg-[var(--soft-green)] px-4 py-4">
          <p className="text-sm font-semibold text-[var(--deep-green)]">
            推荐依据
          </p>
          <p className="mt-3 text-sm font-medium text-[var(--charcoal)]">
            {viewModel.recommendation.title}
          </p>
          <ul className="mt-2 grid gap-2 text-sm leading-6 text-[var(--warm-gray)]">
            {viewModel.recommendation.bullets.map((bullet) => (
              <li key={bullet}>· {bullet}</li>
            ))}
          </ul>
        </section>
      </div>
```

Add private helpers at the bottom of `profile-insights.tsx`:

```ts
function formatSignedDelta(delta: number): string {
  if (delta > 0) {
    return `（+${delta}）`;
  }

  if (delta < 0) {
    return `（${delta}）`;
  }

  return "";
}

function getWeaknessPillClassName(
  tone: "high" | "medium" | "low" | "stable",
): string {
  const baseClassName =
    "w-fit rounded-full px-3 py-1 text-xs font-semibold";

  if (tone === "high") {
    return `${baseClassName} bg-[var(--amber-bg)] text-[var(--amber-text)]`;
  }

  if (tone === "medium") {
    return `${baseClassName} bg-[var(--oat)] text-[var(--mocha)]`;
  }

  if (tone === "low") {
    return `${baseClassName} bg-[var(--soft-green)] text-[var(--deep-green)]`;
  }

  return `${baseClassName} bg-white text-[var(--warm-gray)]`;
}
```

- [ ] **Step 5: Update the header copy**

In the existing `SectionHeader`, keep `title="画像变化"` but replace the description with the view model description:

```tsx
        <SectionHeader
          kicker="Long-term memory"
          title={viewModel.title}
          description={viewModel.description}
        />
```

Remove unused imports: `demoStudentContext`, `clampScore`, `getKnowledgeName`, and `getMistakeShortName`.

- [ ] **Step 6: Run focused test and verify it passes**

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
```

Expected: PASS with `mathtrace workbench UI regression test passed`.

- [ ] **Step 7: Run smoke tests for user-facing route stability**

Run:

```bash
npm run test:smoke
```

Expected: PASS. This guards `sample_diagnosis`, image extraction review, `/api/confirm`, and demo-visible profile flows.

- [ ] **Step 8: Commit Task 2**

Before committing, run:

```bash
git status --short
```

Stage exactly:

```bash
git add src/components/workbench/profile-insights.tsx scripts/tests/ui/mathtrace-workbench-ui.test.mjs
git commit -m "feat: reframe profile insights display"
```

---

### Task 3: Update PRD and Interview Narrative

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `interview/mathtrace-project-narrative.md`
- Test: docs-only verification with `rg`

**Interfaces:**
- Consumes:
  - Final P1.9 design spec in `docs/superpowers/specs/2026-06-17-p19-profile-display-semantics-design.md`
  - Implemented UI copy from Task 2
- Produces:
  - PRD boundary note saying P1.9 changes display semantics only.
  - Interview narrative explaining why UI semantics changed before database/API expansion.

- [ ] **Step 1: Update PRD P1 staged scope**

Modify `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md` after the P1.8 paragraph:

```md
P1.9 在 P1.8 云端画像快照基础上重构学生画像展示语义，但不改变数据库、`memory_delta` 契约或画像投影规则。页面不再把错题诊断直接展示为“掌握度扣分”，而是基于当前 `StudentProfile`、本次 `DiagnosisViewModel.memory_delta` 和已有 demo 历史派生“薄弱指数”“本次诊断结论”“需要关注的错因”和“推荐依据”。薄弱指数仅为展示层派生值，计算方式为 `100 - mastery_score`，数字越大表示越需要优先处理；它不写入 `student_profiles`，也不替代 `mastery_scores`。P1.9 不新增 profile evidence API，不向前端暴露完整 `memory_events` 历史；后续如需展示“近 N 次趋势”或“具体事件证据”，应单独设计服务端 evidence/history 接口。
```

- [ ] **Step 2: Update API/storage boundary notes in PRD**

Find the current `student_profiles` section and add:

```md
P1.9 后，`student_profiles.profile.mastery_scores` 仍是云端画像快照的一部分。前端展示时可以派生“薄弱指数”，但不得把该派生值写回数据库，也不得让前端直接读取 Supabase 或完整 `memory_events`。当前推荐依据只使用已在前端可用的数据；真实历史证据接口留到后续阶段。
```

- [ ] **Step 3: Update interview narrative**

Append a new stage before `## 后续可追加的阶段` in `interview/mathtrace-project-narrative.md` using the document’s existing stage format. The current latest numbered stage is `## 14. P1.8 云端当前画像快照`, so use:

```md
## 15. P1.9 学生画像展示语义重构

### 当前状态
已完成设计与实现，保持 P1.8 云端 `student_profiles` 和 `memory_events` 数据流不变。

### 功能价值
我把画像区从“掌握度扣分”改成了“薄弱证据和复习优先级”。这样学生不会感觉系统在简单惩罚错误，而是能看到这次错题暴露了哪些薄弱点、哪些错因需要关注、下一步为什么优先复习某个知识点。

### 关键设计
底层仍保存 `mastery_scores` 和 `memory_delta`，展示层派生“薄弱指数 = 100 - mastery_score”。这个派生值只用于 UI，不写入数据库。错因展示也从内部 key 改为人话标题和解释，并把低频无变化错因折叠起来。

### 技术决策与取舍
我没有新增数据库表，也没有新增读取 `memory_events` 的 evidence API。原因是 P1.9 要解决的是展示语义问题，而不是历史证据接口问题。当前前端只有当前画像和本次诊断结果，所以推荐依据只基于这些可用数据；真正的历史趋势可以留到后续独立阶段做。

### 性能收益（如适用）
这次改动不增加网络请求，不新增数据库查询。画像展示派生逻辑都在前端纯函数里完成，因此不会影响 P1.8 的云端画像读取性能。

### 面试官可能怎么问
- 为什么不直接改 `mastery_scores` 数据模型？
- 为什么要引入“薄弱指数”？
- 推荐依据为什么不直接读 `memory_events`？
- 这个改动和真正的学习画像有什么差距？
- 后续如何引入练习正确率这样的正向证据？

### 推荐回答
我没有急着改数据库，因为问题首先是展示语义：当前只有错题负向证据，如果直接叫“掌握度下降”，会让用户误解系统在给能力扣分。所以我保留底层 `mastery_scores` 和 `memory_delta`，只在展示层派生“薄弱指数”，让数字越大表示越需要优先处理。真实历史证据接口和练习闭环是后续阶段，不能混在这个 UI 语义重构里。

### 可能被继续追问
面试官可能会继续问 profile evidence API、练习完成后的正向证据、历史趋势计算和多用户画像迁移。

### 反思与后续优化
P1.9 仍是 demo 级画像解释，还没有真正读取完整 `memory_events` 给出历史趋势。下一步可以做 profile evidence API，或者在练习闭环后增加 `practice_attempts` 和 `review_sessions`。

### 项目中的真实证据
- 代码：`src/components/workbench/profile-view-model.ts`
- 代码：`src/components/workbench/profile-insights.tsx`
- 测试：`scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
- 文档：`docs/superpowers/specs/2026-06-17-p19-profile-display-semantics-design.md`
```

- [ ] **Step 4: Verify docs mention the right boundaries**

Run:

```bash
rg -n "P1\\.9|薄弱指数|profile evidence|memory_events" docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md interview/mathtrace-project-narrative.md
```

Expected:
- PRD mentions P1.9.
- PRD says no complete `memory_events` exposure in P1.9.
- Interview narrative mentions “薄弱指数” and why the evidence API is deferred.

- [ ] **Step 5: Commit Task 3**

Before committing, run:

```bash
git status --short
```

Stage exactly:

```bash
git add docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md interview/mathtrace-project-narrative.md
git commit -m "docs: describe p19 profile display semantics"
```

---

### Task 4: Final Verification and Review Handoff

**Files:**
- No required source edits.
- Optional local-only review output: `docs/reviews/2026-06-17-p19-profile-display-semantics-implementation-review.md` if Claude Code review is run without a PR.

**Interfaces:**
- Consumes:
  - Task 1 view model and tests.
  - Task 2 UI.
  - Task 3 docs.
- Produces:
  - Full local validation results.
  - Clean branch ready for Claude Code review.

- [ ] **Step 1: Run focused UI regression**

Run:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
```

Expected: PASS with `mathtrace workbench UI regression test passed`.

- [ ] **Step 2: Run default tests**

Run:

```bash
npm test
```

Expected: PASS. This includes default tests and smoke tests.

- [ ] **Step 3: Run explicit smoke test**

Run:

```bash
npm run test:smoke
```

Expected: PASS. This is intentionally repeated as a visible demo contract check.

- [ ] **Step 4: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS with no ESLint errors.

- [ ] **Step 5: Run build**

Run:

```bash
npm run build
```

Expected: PASS. If build fails with a sandbox-only Turbopack port or filesystem permission error, rerun outside sandbox before treating it as a product regression.

- [ ] **Step 6: Inspect git status and recent commits**

Run:

```bash
git status --short --branch
git log --oneline -5
```

Expected:
- Branch is the P1.9 implementation branch.
- Only intended files are modified or committed.
- `docs/reviews/*.md` remains untracked/local if generated.

- [ ] **Step 7: Prepare Claude Code review prompt**

Use this prompt:

```text
请审查 MathTrace P1.9 学生画像展示语义重构实现。

范围：
- 设计 spec：docs/superpowers/specs/2026-06-17-p19-profile-display-semantics-design.md
- 实现重点：
  - src/components/workbench/profile-view-model.ts
  - src/components/workbench/profile-insights.tsx
  - src/components/workbench/workbench-labels.ts
  - scripts/tests/ui/mathtrace-workbench-ui.test.mjs
  - docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md
  - interview/mathtrace-project-narrative.md

请重点检查：
1. 是否误改数据库表、持久化规则、memory_delta 契约或 student_profiles 投影规则。
2. 是否仍把 mastery_scores 当作完整真实能力分数展示，而不是展示层薄弱指数。
3. 薄弱指数 = 100 - mastery_score、状态分层、变化量换算是否正确。
4. 推荐依据是否只基于当前画像、本次 diagnosis.memory_delta 和已有 demo 历史，不声称读取完整 memory_events。
5. 错因映射是否使用项目真实 key：domain_missing、classification_missing、method_error、transformation_error、calculation_error。
6. 低频无变化错因是否默认折叠；本次新增或累计 >= 5 的错因是否突出展示。
7. ProfileInsights 是否保持前端展示职责，没有引入 Supabase、service role key、provider 或数据库读取。
8. sample_diagnosis、图片确认、错题本删除后云端画像刷新、localStorage fallback 是否有回归风险。
9. UI 测试是否覆盖薄弱指数、状态分层、错因过滤、推荐依据和边界文案。

验证命令结果：
- node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
- npm test
- npm run test:smoke
- npm run lint
- npm run build

请按 High / Medium / Low / Observation 输出 findings。即使没有阻塞问题，也请列出测试缺口。
```

- [ ] **Step 8: Commit final verification docs only if requested**

Do not commit `docs/reviews/*.md` by default. If the user explicitly asks to commit a review document, stage that exact file only.

---

## Self-Review Checklist

- [ ] Plan does not require database schema changes.
- [ ] Plan does not add profile evidence/history API.
- [ ] Plan does not expose full `memory_events` to the browser.
- [ ] Plan uses real project mistake-cause keys.
- [ ] Plan keeps display logic in `profile-view-model.ts`.
- [ ] Plan updates PRD and interview narrative after behavior is implemented.
- [ ] Plan has test-first steps for view model and UI copy.
- [ ] Plan includes final verification commands and Claude Code review handoff.
