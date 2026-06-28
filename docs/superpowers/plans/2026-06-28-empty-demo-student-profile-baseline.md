# Empty Demo Student Profile Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 MathTrace 内置 demo 学生画像改为空历史基线，让新完成并确认写入的错题诊断成为页面上可观察到的唯一画像变化来源。

**Architecture:** 保留 `demoStudentProfile` 作为合法 `StudentProfile` fallback 对象，但清空其中的内置掌握度、错因频次、复习优先级和高考关注项。`localStorage` 和云端 `student_profiles` 仍沿用现有读写路径；云端画像投影仍是 `fold(demoStudentProfile, memory_events)`，只是 fold 的起点从“预置弱项画像”变成“空历史画像”。未知知识点应用 `memory_delta` 时继续使用现有中性起点 `70`，避免把本次任务扩大成掌握度模型重设计。`weak_modules`、`recent_trend`、`gaokao_focus` 在本次改动后保持空值；当前画像洞察 UI 由 `mastery_scores`、`frequent_mistake_causes`、`review_priority` 和本次诊断 delta 派生，不依赖这三个字段。

**Tech Stack:** Next.js App Router + TypeScript + localStorage demo fallback + Supabase server-side profile projection + Node script tests + `npm run lint` / `npm run build`。

---

## Global Constraints

- 固定学生仍是 `demo_student_001`。
- 不做登录、真实多用户、老师端、RLS 用户策略。
- 前端不直连数据库，不读取 service role key。
- `localStorage` 仍只是 demo fallback，不代表完整云端学生画像。
- RAG 不写 `memory_events` / `student_profiles`，不决定画像写入。
- `sample_diagnosis` 稳定路径不能破坏。
- 不新增云端清空画像 API，不删除 Supabase 里的历史 `memory_events`。
- `docs/reviews/*.md` 默认本地保留，不提交。
- 文档、计划和最终说明使用中文；代码标识符保持项目既有风格。

---

## Current Behavior

- `src/data/mathtrace-demo.ts` 中的 `demoStudentProfile` 目前预置了：
  - `mastery_scores`：`parameter_classification`、`derivative_monotonicity`、`function_domain` 等历史薄弱项。
  - `frequent_mistake_causes`：`classification_missing`、`domain_missing` 等历史频次。
  - `review_priority` / `gaokao_focus` / `recent_trend`：预置复习建议和叙事。
- `src/lib/demo/demo-state.ts` 在 localStorage 无缓存、缓存非法或读写失败时回退到 `demoStudentProfile`。
- `src/components/mathtrace-workbench.tsx` 的 `handleResetProfile()` 会清空 localStorage，并把本次会话画像设回 `demoStudentProfile`。
- `src/lib/student-profile/student-profile-service.ts` 的 `projectStudentProfileFromEvents()` 从 `structuredClone(demoStudentProfile)` 起步，再按时间顺序应用 `memory_events.memory_delta`。
- `src/lib/shared/student-profile.ts` 的 `applyMemoryDeltaToProfile()` 对未知知识点使用 `(masteryScores[knowledgeId] ?? 70) + change`，对未知错因使用 `(frequentMistakeCauses[causeId] ?? 0) + change`。
- `src/lib/shared/student-profile.ts` 的 `applyMemoryDeltaToProfile()` 不更新 `weak_modules`、`recent_trend`、`gaokao_focus`；清空基线后这三个字段会继续为空。
- `src/data/mathtrace-demo.ts` 的 `mistakeHistory` 和 `demoStudentContext.today_focus` 仍提供样例演示与诊断上下文，不是当前学生画像事实。

## Target Behavior

- 新浏览器、无 localStorage、无云端画像时，页面看到的是空历史学生画像：
  - 无预置知识点弱项。
  - 无预置错因累计次数。
  - 无预置复习优先级。
  - 无预置高考关注项。
- 完成一次诊断并点击“写入长期画像”后，画像页只展示本次 `memory_delta` 产生的知识点和错因变化。
- 点击“重置画像”后：
  - 仍只清空本地 localStorage 和当前页面 session。
  - 不删除云端 `memory_events` / `student_profiles`。
  - 如果云端已有 `demo_student_001` 画像，后续云端恢复仍可能把历史画像读回来。
- 云端无事件时，`projectStudentProfileFromEvents([]).profile` 等于空历史 `demoStudentProfile`。
- 云端有事件时，投影结果只来自空历史基线 + 事件增量；不会再混入内置历史薄弱项。
- `weak_modules`、`recent_trend`、`gaokao_focus` 在空基线和事件投影后保持空值；本次不派生这三个字段，避免新增第二套画像规则。

## Non-Goals

- 不修改 `memory_delta` 生成规则。
- 不把未知知识点的中性起点 `70` 改成 `0` 或 `100`。
- 不根据 `mastery_scores` 新增派生 `weak_modules` / `recent_trend` / `gaokao_focus` 的逻辑。
- 不新增“清空云端画像”按钮或 API。
- 不清理现有数据库中的 `memory_events`、`student_profiles` 或错题本记录。
- 不清空 `mistakeHistory` 或 `demoStudentContext.today_focus`；它们仍用于样例演示和诊断上下文，不作为当前画像基线。
- 不改 RAG 推荐、图片 OCR、确认链路或变式练习接口。
- 不重构画像 UI 组件结构。

## Files To Modify

- `src/data/mathtrace-demo.ts`
  - 清空 `demoStudentProfile` 的内置历史字段。
- `scripts/tests/demo/demo-state.test.mjs`
  - 断言 fallback / reset 后得到空历史画像。
- `scripts/tests/persistence/student-profile-persistence.test.mjs`
  - 断言空事件投影为空历史画像，单事件投影不继承内置历史弱项。
- `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - 更新或新增 UI 结构断言，确保重置画像仍回到 `demoStudentProfile`，且画像摘要不依赖预置历史；同时记录本地重置不删除云端画像的边界。
- `scripts/tests/diagnosis/agent-pipeline.test.mjs`
  - 如果现有断言依赖预置 mastery score，需要改为断言未知知识点以 `70` 为中性起点应用增量。
- `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - 更新 demo 画像 fallback 说明。
- `docs/superpowers/specs/2026-06-17-p18-cloud-student-profile-memory-design.md`
  - 更新投影不变式里的基线含义。
- `interview/mathtrace-project-narrative.md`
  - 补充“空历史基线让每次诊断画像变化更可解释”的叙事。

## Files Not To Modify

- 不修改 `src/lib/shared/student-profile.ts`，除非测试证明空基线破坏现有类型守卫或合并逻辑。
- 不修改 `src/lib/persistence/**` 的 Supabase schema 或 RPC。
- 不修改 `src/lib/rag/**`、`artifacts/**`、`docs/reviews/**`。

---

## Task 1: Add Empty Baseline Contract Tests

**Files:**
- Modify: `scripts/tests/demo/demo-state.test.mjs`
- Modify: `scripts/tests/persistence/student-profile-persistence.test.mjs`

**Interfaces:**
- Consumes: `demoStudentProfile` from `src/data/mathtrace-demo.ts`
- Consumes: `parseStoredStudentProfile()`, `readStoredStudentProfile()`, `clearStoredStudentProfile()` from `src/lib/demo/demo-state.ts`
- Consumes: `projectStudentProfileFromEvents()` from `src/lib/student-profile/student-profile-service.ts`
- Produces: failing tests that define the new empty baseline contract.

### Steps

- [ ] In `scripts/tests/demo/demo-state.test.mjs`, add baseline shape assertions near the existing `demoStudentProfile` fallback assertions:

```js
assert.deepEqual(demoStudentProfile.mastery_scores, {});
assert.deepEqual(demoStudentProfile.frequent_mistake_causes, {});
assert.deepEqual(demoStudentProfile.weak_modules, []);
assert.deepEqual(demoStudentProfile.review_priority, []);
assert.equal(demoStudentProfile.recent_trend, "");
assert.deepEqual(demoStudentProfile.gaokao_focus, []);
```

- [ ] In `scripts/tests/demo/demo-state.test.mjs`, add an invalid-cache fallback assertion that proves corrupt localStorage also returns the empty baseline:

```js
assert.deepEqual(parseStoredStudentProfile("{"), demoStudentProfile);
assert.deepEqual(parseStoredStudentProfile("{").mastery_scores, {});
assert.deepEqual(parseStoredStudentProfile("{").frequent_mistake_causes, {});
```

- [ ] In `scripts/tests/demo/demo-state.test.mjs`, keep the existing fallback assertions, and add a reset-specific assertion after `clearStoredStudentProfile(storage)`:

```js
clearStoredStudentProfile(storage);
const resetProfile = readStoredStudentProfile(storage);
assert.deepEqual(resetProfile, demoStudentProfile);
assert.deepEqual(resetProfile.mastery_scores, {});
assert.deepEqual(resetProfile.frequent_mistake_causes, {});
```

- [ ] In `scripts/tests/persistence/student-profile-persistence.test.mjs`, strengthen the empty projection assertion:

```js
assert.deepEqual(projectStudentProfileFromEvents([]), {
  status: "projected",
  profile: {
    ...demoStudentProfile,
    mastery_scores: {},
    frequent_mistake_causes: {},
    weak_modules: [],
    review_priority: [],
    recent_trend: "",
    gaokao_focus: [],
  },
  event_count: 0,
  last_memory_event_id: null,
});
```

- [ ] In `scripts/tests/persistence/student-profile-persistence.test.mjs`, add a single-event projection assertion that proves no old built-in weak point leaks into the projected profile:

```js
const singleEventProjection = projectStudentProfileFromEvents([
  createMemoryEvent({
    id: "00000000-0000-4000-8000-000000000101",
    created_at: "2026-06-28T09:00:00+08:00",
    memory_delta: {
      should_persist: true,
      knowledge_mastery_changes: {
        parameter_classification: -5,
      },
      mistake_cause_changes: {
        classification_missing: 1,
      },
      review_priority_changes: ["parameter_classification"],
      persistence_evidence: "user_confirmed",
    },
  }),
]);

assert.equal(singleEventProjection.status, "projected");
assert.deepEqual(singleEventProjection.profile.mastery_scores, {
  parameter_classification: 65,
});
assert.deepEqual(singleEventProjection.profile.frequent_mistake_causes, {
  classification_missing: 1,
});
assert.deepEqual(singleEventProjection.profile.review_priority, [
  "parameter_classification",
]);
assert.deepEqual(singleEventProjection.profile.weak_modules, []);
assert.equal(singleEventProjection.profile.recent_trend, "");
assert.deepEqual(singleEventProjection.profile.gaokao_focus, []);
assert.equal(
  Object.hasOwn(singleEventProjection.profile.mastery_scores, "function_domain"),
  false,
);
assert.equal(
  Object.hasOwn(singleEventProjection.profile.frequent_mistake_causes, "domain_missing"),
  false,
);
```

- [ ] Run tests and confirm they fail before implementation:

```bash
node scripts/tests/demo/demo-state.test.mjs
node scripts/tests/persistence/student-profile-persistence.test.mjs
```

Expected:

```text
AssertionError
```

The failure should show current built-in `mastery_scores` / `frequent_mistake_causes` are not empty.

Note: `persistence_evidence` must use the existing enum values from `src/lib/shared/diagnosis-evidence.ts`: `"student_work"`, `"user_confirmed"`, `"uploaded_problem_only"`, or `"none"`.

---

## Task 2: Change The Demo Profile Baseline

**Files:**
- Modify: `src/data/mathtrace-demo.ts`

**Interfaces:**
- Consumes: `StudentProfile`
- Produces: `demoStudentProfile` as an empty-history but schema-valid fallback object.

### Steps

- [ ] Replace the existing `demoStudentProfile` object in `src/data/mathtrace-demo.ts` with:

```ts
export const demoStudentProfile: StudentProfile = {
  student_id: "demo_student_001",
  grade: "高二",
  subject: "math",
  mastery_scores: {},
  frequent_mistake_causes: {},
  weak_modules: [],
  review_priority: [],
  recent_trend: "",
  gaokao_focus: [],
  created_at: "2026-03-20T08:00:00+08:00",
  updated_at: "2026-05-28T08:00:00+08:00",
};
```

- [ ] Do not change `mistakeHistory` in this task. It is still passed as `mistake_history` to `/api/diagnose` and `/api/confirm` as demo diagnosis context. It is not the current-student profile baseline, and this task intentionally does not change how diagnosis consumes historical context.

- [ ] Do not change `demoStudentContext.today_focus`. It remains a demo workbench focus label, not a persisted profile fact.

- [ ] Run the baseline tests:

```bash
node scripts/tests/demo/demo-state.test.mjs
node scripts/tests/persistence/student-profile-persistence.test.mjs
```

Expected:

```text
demo state tests passed
student profile persistence tests passed
```

If the persistence test still fails because an existing assertion expects `demoStudentProfile.mastery_scores.parameter_classification - 5`, update that assertion to use the neutral fallback value:

```js
assert.equal(
  result.profile.mastery_scores.parameter_classification,
  65,
);
```

Rationale: `applyMemoryDeltaToProfile()` intentionally uses `70` for unknown mastery scores.

---

## Task 3: Update Diagnosis And UI Tests That Assumed Built-In History

**Files:**
- Modify: `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
- Modify: `scripts/tests/diagnosis/agent-pipeline.test.mjs`
- Modify: `scripts/tests/diagnosis/diagnosis-view-model.test.mjs` if failures show baseline-specific assumptions.
- Modify: `scripts/tests/smoke/demo-smoke.test.mjs` if failures show baseline-specific assumptions.

**Interfaces:**
- Consumes: `demoStudentProfile`
- Consumes: `applyMemoryDeltaToProfile(profile, memoryDelta): StudentProfile`
- Produces: tests that assert first-diagnosis deltas are visible without requiring preloaded history.

### Steps

- [ ] Run the default script test suite once before hand-picking files, so all `demoStudentProfile` assumptions surface together:

```bash
node scripts/run-tests.mjs default
```

Expected before updates: failures, if any, should be classifiable as baseline-assumption failures. Runtime errors or unrelated failures should be investigated before continuing.

- [ ] Run the focused test set:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
node scripts/tests/diagnosis/agent-pipeline.test.mjs
node scripts/tests/diagnosis/diagnosis-view-model.test.mjs
node scripts/tests/smoke/demo-smoke.test.mjs
```

Expected before updates: any failures should be baseline-assumption failures, not runtime errors.

- [ ] In `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`, keep structure assertions for reset behavior, but update expected baseline-dependent text. If a test constructs:

```js
const afterDerivativeProfile = applyMemoryDeltaToProfile(
  demoStudentProfile,
  sampleDiagnosis.memory_delta,
);
```

then assert only keys introduced by `sampleDiagnosis.memory_delta`:

```js
for (const knowledgeId of Object.keys(
  sampleDiagnosis.memory_delta.knowledge_mastery_changes,
)) {
  assert.equal(
    Object.hasOwn(afterDerivativeProfile.mastery_scores, knowledgeId),
    true,
  );
}

assert.equal(
  Object.hasOwn(afterDerivativeProfile.mastery_scores, "sequence_recursion"),
  false,
);
```

- [ ] In `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`, update the existing `sample_derivative_001` profile insight expectations for an empty baseline. With `parameter_classification: -8` and unknown mastery starting at `70`, the resulting score is `62` and the weakness index is `38`:

```js
assert.equal(profileInsights.conclusionRows[0].id, "parameter_classification");
assert.equal(profileInsights.conclusionRows[0].nextMasteryScore, 62);
assert.equal(profileInsights.conclusionRows[0].weaknessIndex, 38);
assert.equal(profileInsights.conclusionRows[0].weaknessDelta, 8);
assert.equal(
  profileInsights.conclusionRows[0].summary,
  "本次 +8，当前薄弱指数 38",
);
assert.equal(
  profileInsights.priorityRows.some((row) => row.id === "sequence_recursion"),
  false,
);
```

- [ ] In `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`, update the mistake-cause expectations so only current-diagnosis causes are highlighted. With an empty baseline, `classification_missing` and `domain_missing` each become `1`, so neither should be high frequency:

```js
assert.equal(profileInsights.highlightedMistakeCauses.length, 2);
assert.equal(
  profileInsights.highlightedMistakeCauses.every(
    (cause) => cause.isNewInDiagnosis,
  ),
  true,
);
assert.equal(
  profileInsights.highlightedMistakeCauses.some(
    (cause) => cause.isHighFrequency,
  ),
  false,
);
assert.equal(profileInsights.otherMistakeCauses.length, 0);
```

- [ ] In `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`, add a structure assertion that reset remains local-only and does not call a cloud delete API:

```js
assert.match(
  source,
  /function handleResetProfile\(\): void \{[\s\S]*clearStoredStudentProfile\(window\.localStorage\);[\s\S]*setSessionStudentProfile\(demoStudentProfile\);/,
);
assert.equal(
  source.includes("deleteStudentProfile"),
  false,
  "重置画像不应删除云端 student_profiles 或 memory_events。",
);
```

- [ ] In `scripts/tests/diagnosis/agent-pipeline.test.mjs`, replace baseline-dependent mastery expectations such as:

```js
demoStudentProfile.mastery_scores.parameter_classification - 5
```

with the explicit neutral-start expectation:

```js
// Unknown knowledge starts from the shared neutral score 70 before applying
// the current diagnosis delta.
65
```

Only do this for knowledge points absent from the empty baseline. For knowledge points created by test-local custom profiles, continue deriving from that custom profile.

- [ ] Re-run focused tests:

```bash
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
node scripts/tests/diagnosis/agent-pipeline.test.mjs
node scripts/tests/diagnosis/diagnosis-view-model.test.mjs
node scripts/tests/smoke/demo-smoke.test.mjs
```

Expected:

```text
mathtrace workbench UI tests passed
agent pipeline tests passed
diagnosis view model tests passed
demo smoke tests passed
```

---

## Task 4: Update Product Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Modify: `docs/superpowers/specs/2026-06-17-p18-cloud-student-profile-memory-design.md`
- Modify: `interview/mathtrace-project-narrative.md`

**Interfaces:**
- Produces: documentation that matches the new baseline and reset semantics.

### Steps

- [ ] In the PRD, find the student profile / demo fallback section and update it to state:

```md
当前 `demoStudentProfile` 是空历史基线：保留 `demo_student_001`、年级和学科字段，但不预置知识点薄弱项、错因累计次数、复习优先级或高考关注项。画像变化只应来自确认写入后的 `memory_delta` / `memory_events`。

注意：前端“重置画像”只清理浏览器 localStorage 和当前页面 session，不删除云端 `memory_events` 或 `student_profiles`。如果 Supabase 中已有 `demo_student_001` 的画像，页面后续仍可能通过 `GET /api/student-profile` 读回云端画像。
```

- [ ] In `docs/superpowers/specs/2026-06-17-p18-cloud-student-profile-memory-design.md`, update the projection invariant explanation from “从 `demoStudentProfile` 起始” to:

```md
从空历史 `demoStudentProfile` 起始，按 `created_at asc, id asc` 重放当前有效 `memory_events`。因此 `student_profiles.profile` 不再包含系统内置历史弱项，只反映已确认写入的错题证据。

`weak_modules`、`recent_trend`、`gaokao_focus` 当前不由 `applyMemoryDeltaToProfile()` 派生，空基线后保持空值；画像洞察 UI 继续从 `mastery_scores`、`frequent_mistake_causes`、`review_priority` 和本次诊断 delta 展示复习优先级。
```

Keep the invariant expression itself:

```ts
student_profiles.profile
  === fold(demoStudentProfile, memory_events.orderBy(created_at asc, id asc))
```

- [ ] In `interview/mathtrace-project-narrative.md`, add a short note under the student memory / cloud profile stage:

```md
后续我把内置 demo 画像从“预置薄弱学生”改成“空历史基线”。这样做的目的不是改变诊断算法，而是让面试和演示时更容易解释：页面上新增的知识点弱项、错因累计和复习优先级都来自这次确认写入的错题，而不是系统提前塞进去的样例历史。这里有两个边界：第一，`mistakeHistory` 仍作为 demo 诊断上下文存在，但不再代表当前画像基线；第二，如果 Supabase 里已有 `demo_student_001` 的 `memory_events`，前端仍会读回云端画像，本地“重置画像”只清理 localStorage，不删除云端事件。
```

- [ ] Run a docs search to ensure no stale wording claims `demoStudentProfile` still contains preset weak modules:

```bash
rg -n "预置|内置|demoStudentProfile|fold\\(demoStudentProfile|最近 30 天导数含参题错误率上升|classification_missing" docs/superpowers/specs interview/mathtrace-project-narrative.md
```

Expected: any remaining matches are either historical descriptions with explicit old-stage context or updated wording that says the baseline is empty.

---

## Task 5: Full Verification And Local Commit

**Files:**
- Verify all files modified by Tasks 1-4.

**Interfaces:**
- Produces: tested implementation checkpoint.

### Steps

- [ ] Run focused tests:

```bash
node scripts/tests/demo/demo-state.test.mjs
node scripts/tests/persistence/student-profile-persistence.test.mjs
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
node scripts/tests/diagnosis/agent-pipeline.test.mjs
node scripts/tests/diagnosis/diagnosis-view-model.test.mjs
node scripts/tests/smoke/demo-smoke.test.mjs
```

Expected:

```text
demo state tests passed
student profile persistence tests passed
mathtrace workbench UI tests passed
agent pipeline tests passed
diagnosis view model tests passed
demo smoke tests passed
```

- [ ] Run default test suite:

```bash
npm test
```

Expected:

```text
all tests passed
```

- [ ] Run lint:

```bash
npm run lint
```

Expected:

```text
No ESLint warnings or errors
```

- [ ] Run build:

```bash
npm run build
```

Expected: Next.js production build completes successfully.

- [ ] Optional browser verification with database not configured or with an empty cloud profile:

```bash
npm run dev
```

Manual checks:
- Fresh page shows no preloaded historical weak points.
- Upload/diagnose/confirm/write profile shows only this diagnosis's new weak points and causes.
- Click “重置画像” clears the local session back to empty history.
- If Supabase still contains previous `demo_student_001` profile data, document that cloud recovery can repopulate it; do not treat this as an implementation failure.

- [ ] Review exact changed files:

```bash
git status --short
git diff -- src/data/mathtrace-demo.ts scripts/tests/demo/demo-state.test.mjs scripts/tests/persistence/student-profile-persistence.test.mjs scripts/tests/ui/mathtrace-workbench-ui.test.mjs scripts/tests/diagnosis/agent-pipeline.test.mjs scripts/tests/diagnosis/diagnosis-view-model.test.mjs scripts/tests/smoke/demo-smoke.test.mjs docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/superpowers/specs/2026-06-17-p18-cloud-student-profile-memory-design.md interview/mathtrace-project-narrative.md
```

- [ ] Commit only this task's files:

```bash
git add src/data/mathtrace-demo.ts scripts/tests/demo/demo-state.test.mjs scripts/tests/persistence/student-profile-persistence.test.mjs scripts/tests/ui/mathtrace-workbench-ui.test.mjs scripts/tests/diagnosis/agent-pipeline.test.mjs scripts/tests/diagnosis/diagnosis-view-model.test.mjs scripts/tests/smoke/demo-smoke.test.mjs docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/superpowers/specs/2026-06-17-p18-cloud-student-profile-memory-design.md interview/mathtrace-project-narrative.md
git commit -m "feat: start demo profile from empty baseline"
```

If a listed test file did not change, omit it from `git add`.

---

## Review Notes For Claude Code

Ask Claude Code to focus on:

- Whether empty `demoStudentProfile` still satisfies every `StudentProfile` guard and consumer.
- Whether any test now accidentally hides a real regression by hard-coding `65` in the wrong place.
- Whether `weak_modules` / `recent_trend` / `gaokao_focus` staying empty is clearly documented and does not break a UI consumer.
- Whether keeping `mistakeHistory` and `demoStudentContext.today_focus` is clearly separated from the current profile baseline.
- Whether the reset semantics are clear: local reset only, no cloud deletion.
- Whether `projectStudentProfileFromEvents()` still has one canonical projection path and does not duplicate profile merge logic.
- Whether documentation overstates the reset behavior when Supabase has existing `demo_student_001` data.

## Rollback Plan

If the change makes the demo worse or creates unclear profile behavior, revert only the `demoStudentProfile` object and related test/doc updates. No database migration or persisted data shape changes are involved, so rollback is a normal Git revert.

## Self-Review

- Spec coverage: covers empty local fallback, reset behavior, cloud projection, visible current-diagnosis profile changes, docs, and verification.
- Placeholder scan: no unfinished placeholder wording or unspecified test commands remain.
- Type consistency: uses existing `StudentProfile`, `MemoryDelta`, `demoStudentProfile`, `applyMemoryDeltaToProfile()`, and `projectStudentProfileFromEvents()` names exactly as they exist today.
