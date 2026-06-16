# Unify Student Profile Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 MathTrace 中 `StudentProfile` 的运行时校验口径，让 API、localStorage demo 状态和诊断 pipeline 使用同一个 `isStudentProfile`。

**Architecture:** `src/lib/shared/student-profile.ts` 成为唯一画像校验来源，集中导出严格的 `isStudentProfile`。`src/lib/demo/demo-state.ts` 和 `src/lib/diagnosis/diagnose-api.ts` 删除本地重复 guard，改为复用 shared guard。此任务只统一校验边界，不改变单学生 demo、画像 schema、localStorage key 或数据库持久化策略。

**Tech Stack:** Next.js App Router, TypeScript, Node regression scripts, existing `jiti` test harness.

---

## 背景和当前问题

当前项目只有一个固定学生 `demo_student_001`，但 `student_profile` 会从多个入口进入系统：

- 前端 demo 恢复：`localStorage` 中读取旧画像。
- API 请求：`POST /api/diagnose` 和图片确认链路会携带当前画像。
- Pipeline 合并：诊断完成后根据 `memory_delta` 生成更新后的画像。

现在项目里存在三套 `StudentProfile` 运行时判断：

- `src/lib/shared/student-profile.ts`：共享 guard，但当前注释说明它和 API guard 不完全一致，且没有校验 `grade`。
- `src/lib/demo/demo-state.ts`：localStorage 专用 guard，校验更严格，包括 `grade`、字符串数组、有限数字。
- `src/lib/diagnosis/diagnose-api.ts`：API 专用 guard，校验 `grade`、数组项等，但数字有限性不完全一致。

这会带来维护风险：以后改画像 schema 时，可能出现 localStorage 接受、API 拒绝，或 pipeline 接受、前端展示失败的状态分裂。

---

## 假设

- 当前 `StudentProfile` schema 以 `src/data/mathtrace-demo.ts` 中的类型和 `demoStudentProfile` 结构为准。
- `grade` 是合法画像必须具备的字段；此前 shared guard 不校验 `grade` 是历史兼容，不是长期目标。
- `mastery_scores` 和 `frequent_mistake_causes` 应只接受有限数字，拒绝 `NaN` / `Infinity`。
- `weak_modules`、`review_priority` 应只接受字符串数组。
- `gaokao_focus` 每项必须包含字符串 `knowledge_point`、字符串 `reason` 和有限数字 `priority`。
- 本任务可以让少量历史损坏 localStorage 画像回退到 `demoStudentProfile`，这是安全降级，不是破坏用户数据。

---

## 明确不做

- 不新增多用户、登录、权限、RLS 或老师端。
- 不引入 Zod，不做大规模 schema 重构。
- 不迁移 localStorage key，也不改变 `mathtrace.demoStudentProfile.v1`。
- 不把完整 `student_profile` 迁移到 Supabase。
- 不改 `memory_delta` 计算逻辑。
- 不扩展 `memory_delta` 的数字校验边界；`diagnose-api.ts` 中供 `isMemoryDelta` 使用的本地 `isNumberRecord` 暂时保持现状。
- 不为 `isDiagnoseSuccessResponse` 新增 sample 响应 `student_profile` 校验；该缺口如需补齐，应作为独立任务评估。
- 不清理 `scripts/` 目录结构。
- 不顺手改目录架构、UI、公式渲染或错题本行为。

---

## 文件结构

### 修改

- `src/lib/shared/student-profile.ts`
  - 作为唯一 `isStudentProfile` 实现。
  - 增加严格字段校验：`grade`、字符串数组、`gaokao_focus` item、有限数字。
  - 删除“不完全相同”的旧注释。

- `src/lib/demo/demo-state.ts`
  - 删除本地 `isStudentProfile`、`isNumberRecord`、`isStringArray`、`isGaokaoFocus`。
  - 从 `@/lib/shared/student-profile` 导入 `isStudentProfile`。
  - 保持损坏 localStorage 回退 `demoStudentProfile` 的行为。

- `src/lib/diagnosis/diagnose-api.ts`
  - 删除本地 `isStudentProfile` 和 `isGaokaoFocusItem`。
  - 从 `@/lib/shared/student-profile` 导入 `isStudentProfile`。
  - 保持 API 响应 guard 的对外表现。

- `interview/mathtrace-project-narrative.md`
  - 若最终确实统一 guard，补一小段“画像校验边界”到架构/稳定性叙事：说明单学生 demo 不等于不需要 schema guard，guard 是为了防止 localStorage/API/模型链路传入坏画像。

### 影响面清单

- `src/lib/demo/demo-state.ts`：`parseStoredStudentProfile` 用 shared guard 判断 localStorage 中的画像是否可恢复。
- `src/lib/diagnosis/diagnose-api.ts`：`isDiagnoseImageSuccessResponse` 使用 shared guard 判断图片诊断响应中的画像是否合法。
- `src/lib/diagnosis/mathtrace-agent-pipeline.ts`：继续通过 shared guard 判断请求画像是否可用于合并，否则回退 `demoStudentProfile`。
- `src/lib/image-diagnosis/image-diagnosis-pipeline.ts`：继续通过 shared guard 判断图片诊断请求画像是否可用，否则回退 `demoStudentProfile`。
- `src/lib/shared/student-profile.ts`：`applyMemoryDeltaToProfile` 不新增内部输入校验，调用方仍负责传入合法 `StudentProfile`。

### 测试

- `scripts/demo-state.test.mjs`
  - 保留现有坏 localStorage 回退测试。
  - 增加 shared guard 后必须仍拒绝缺失 `grade`、非字符串数组、`NaN` / `Infinity`。

- `scripts/diagnose-client.test.mjs`
  - 保留图片诊断响应中 malformed `student_profile` 被拒绝的测试。
  - 增加缺失 `grade` 或 `priority: Infinity` 的 malformed response 测试，确保 API/client 响应 guard 与 localStorage 口径一致。

---

## Task 1: 先用测试锁定统一校验口径

**Files:**
- Modify: `scripts/demo-state.test.mjs`
- Modify: `scripts/diagnose-client.test.mjs`

- [ ] **Step 1: 在 demo-state 测试中补充缺失 grade 的损坏画像回退**

在 `scripts/demo-state.test.mjs` 已有损坏画像断言附近加入：

```js
assert.deepEqual(
  parseStoredStudentProfile(
    JSON.stringify({
      ...updatedProfile,
      grade: undefined,
    }),
  ),
  demoStudentProfile,
);
```

注意：如果直接序列化 `undefined` 字段会被 JSON 删除，这正好模拟旧 localStorage 缺字段。

- [ ] **Step 2: 在 demo-state 测试中确认数组项必须是字符串**

加入：

```js
assert.deepEqual(
  parseStoredStudentProfile(
    JSON.stringify({
      ...updatedProfile,
      weak_modules: ["derivative_monotonicity", 123],
    }),
  ),
  demoStudentProfile,
);

assert.deepEqual(
  parseStoredStudentProfile(
    JSON.stringify({
      ...updatedProfile,
      review_priority: ["parameter_classification", null],
    }),
  ),
  demoStudentProfile,
);
```

- [ ] **Step 3: 在 diagnose-client 测试中补充 malformed profile 口径**

在 `scripts/diagnose-client.test.mjs` 现有 `malformedProfileImageResponse` 附近加入：

```js
const missingGradeProfileImageResponse = {
  ...highConfidenceImageResponse,
  student_profile: {
    ...demoStudentProfile,
  },
};

delete missingGradeProfileImageResponse.student_profile.grade;

assert.equal(isDiagnoseImageSuccessResponse(missingGradeProfileImageResponse), false);

const infinitePriorityProfileImageResponse = {
  ...highConfidenceImageResponse,
  student_profile: {
    ...demoStudentProfile,
    gaokao_focus: [
      {
        knowledge_point: "parameter_classification",
        reason: "priority 不是有限数字。",
        priority: Number.POSITIVE_INFINITY,
      },
    ],
  },
};

assert.equal(
  isDiagnoseImageSuccessResponse(infinitePriorityProfileImageResponse),
  false,
);
```

- [ ] **Step 4: 运行最小测试，确认当前实现至少暴露 shared guard 不一致风险**

Run:

```bash
node scripts/demo-state.test.mjs
node scripts/diagnose-client.test.mjs
```

Expected:

- `demo-state` 目前大概率仍通过，因为它已有本地严格 guard。
- `diagnose-client` 中 `priority: Infinity` 相关断言可能失败，具体取决于当前 client guard 是否检查有限数字。
- 即使未出现失败，也说明测试已锁定目标口径，后续删除重复 guard 时可防止回归。

---

## Task 2: 把 shared guard 改成唯一严格实现

**Files:**
- Modify: `src/lib/shared/student-profile.ts`

- [ ] **Step 1: 更新 `isStudentProfile` 字段校验**

将 `src/lib/shared/student-profile.ts` 中的旧注释删除，把 `isStudentProfile` 改为：

```ts
export function isStudentProfile(value: unknown): value is StudentProfile {
  return (
    isRecord(value) &&
    typeof value.student_id === "string" &&
    typeof value.grade === "string" &&
    value.subject === "math" &&
    isNumberRecord(value.mastery_scores) &&
    isNumberRecord(value.frequent_mistake_causes) &&
    isStringArray(value.weak_modules) &&
    isStringArray(value.review_priority) &&
    typeof value.recent_trend === "string" &&
    isGaokaoFocus(value.gaokao_focus) &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}
```

- [ ] **Step 2: 增加 shared helper**

在同文件底部保留 `isNumberRecord`，并增加：

```ts
function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(
    (item) => typeof item === "number" && Number.isFinite(item),
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isGaokaoFocus(value: unknown): value is StudentProfile["gaokao_focus"] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.knowledge_point === "string" &&
        typeof item.reason === "string" &&
        typeof item.priority === "number" &&
        Number.isFinite(item.priority),
    )
  );
}
```

如果文件中已有同名 `isNumberRecord`，直接替换为有限数字版本，不保留两个实现。

- [ ] **Step 3: 运行 shared 影响面最小测试**

Run:

```bash
node scripts/agent-pipeline.test.mjs
node scripts/image-diagnosis-pipeline.test.mjs
node scripts/demo-state.test.mjs
```

Expected:

- 三个脚本通过。
- 如果 pipeline 中有测试依赖“缺 grade 也能接受”，应优先评估是否为旧兼容测试；本计划倾向改为回退 `demoStudentProfile`。
- 如果失败来自 fixture 缺少 `grade`、数组项不是字符串、或 `gaokao_focus` 结构不合法，应优先修复 fixture 或调整预期为回退默认画像，不应为了快速通过测试而放宽 shared guard。只有确认真实业务需要兼容旧格式时，才允许重新讨论兼容分支。

---

## Task 3: 删除 demo-state 的重复画像 guard

**Files:**
- Modify: `src/lib/demo/demo-state.ts`

- [ ] **Step 1: 替换 import**

把：

```ts
import { isRecord } from "@/lib/shared/utils";
```

替换为：

```ts
import { isStudentProfile } from "@/lib/shared/student-profile";
```

- [ ] **Step 2: 删除本地重复 helper**

从 `src/lib/demo/demo-state.ts` 删除这些私有函数：

```ts
function isStudentProfile(value: unknown): value is StudentProfile { ... }
function isNumberRecord(value: unknown): value is Record<string, number> { ... }
function isStringArray(value: unknown): value is string[] { ... }
function isGaokaoFocus(value: unknown): value is StudentProfile["gaokao_focus"] { ... }
```

保留 `parseStoredStudentProfile`、`serializeStudentProfile`、`readStoredStudentProfile`、`writeStoredStudentProfile`、`clearStoredStudentProfile`、`createMemoryStorage` 行为不变。

- [ ] **Step 3: 运行 demo-state 测试**

Run:

```bash
node scripts/demo-state.test.mjs
```

Expected:

```text
demo state regression test passed
```

---

## Task 4: 删除 diagnose-api 的重复画像 guard

**Files:**
- Modify: `src/lib/diagnosis/diagnose-api.ts`

- [ ] **Step 1: 增加 shared guard import**

在 import 区加入：

```ts
import { isStudentProfile } from "@/lib/shared/student-profile";
```

- [ ] **Step 2: 删除本地重复 helper**

从 `src/lib/diagnosis/diagnose-api.ts` 删除：

```ts
function isStudentProfile(value: unknown): value is StudentProfile { ... }
function isGaokaoFocusItem(
  value: unknown,
): value is StudentProfile["gaokao_focus"][number] { ... }
```

不要删除同文件内其他仍被使用的 helper，例如 `isNumberRecord`、`isString`、`isPracticeQuestion` 等。

备注：`diagnose-api.ts` 的本地 `isNumberRecord` 仍被 `isMemoryDelta` 使用，当前不检查有限数字；本任务不扩展 `memory_delta` 的校验边界。实现时不要误删或顺手改动这个 helper。

- [ ] **Step 3: 搜索确认没有重复定义**

Run:

```bash
rg -n "function isStudentProfile|function isGaokaoFocus|isGaokaoFocusItem|function isNumberRecord|function isStringArray" src/lib
```

Expected:

- `function isStudentProfile` 只应出现在 `src/lib/shared/student-profile.ts`。
- 不应再看到 `demo-state.ts` 或 `diagnose-api.ts` 的本地 `function isStudentProfile`。
- `src/lib/demo/demo-state.ts` 不应残留本地 `isNumberRecord`、`isStringArray` 或 `isGaokaoFocus`。
- `src/lib/diagnosis/diagnose-api.ts` 仍可能保留供 `isMemoryDelta` 使用的本地 `isNumberRecord`，这是本任务明确保留的现状。

- [ ] **Step 4: 运行 API/client 相关测试**

Run:

```bash
node scripts/diagnose-client.test.mjs
node scripts/api-smoke.test.mjs
node scripts/image-confirmation.test.mjs
```

Expected:

- 三个脚本通过。
- 图片确认、sample diagnosis 和 response guard 不因 import 替换改变行为。
- `api-smoke.test.mjs` 如覆盖 sample 响应，只需确认既有 sample 路径仍通过；由于 `isDiagnoseSuccessResponse` 本次不新增 `student_profile` 校验，不需要新增 sample malformed profile 用例。

---

## Task 5: 文档收口

**Files:**
- Modify: `interview/mathtrace-project-narrative.md`
- Check only: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Check only: `docs/TECHNICAL_ROADMAP.md`

- [ ] **Step 1: 判断 PRD / Roadmap 是否需要修改**

Run:

```bash
rg -n "student_profile|localStorage|画像" docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md
```

Expected:

- 如果只是统一内部 guard，不改变 API 字段、localStorage schema 或画像写入策略，PRD 和 Roadmap 不需要新增段落。
- 如果实现时实际收紧了对外契约，应补一句“画像运行时校验由 shared guard 统一收口”。

- [ ] **Step 2: 更新面试叙事文档**

建议放在第 3 节 `/api/diagnose` 接口与运行时边界附近，作为运行时边界的延伸；如果该位置结构不合适，再放到 P1.7 数据底座段落后。建议文案：

```md
这次清理还统一了 `StudentProfile` 的运行时校验口径。虽然当前产品仍固定 `demo_student_001`，但画像对象会从 localStorage、API 响应和诊断 pipeline 多个入口流动，所以“只有一个学生”不等于“不需要画像校验”。统一后的 shared guard 会检查 `grade`、`subject`、掌握度分数、错因频次、复习优先级和高考关注项结构；损坏的本地画像会回退到 demo 默认画像，模型或接口返回的坏画像会被 response guard 拒绝，避免长期学习状态被半截 JSON 或旧格式污染。
```

不要夸大为“已实现云端学生画像聚合”。

- [ ] **Step 3: 搜索文档是否出现过度表述**

Run:

```bash
rg -n "云端学生画像|完整画像迁移|多用户画像|student_profiles" interview/mathtrace-project-narrative.md docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md docs/TECHNICAL_ROADMAP.md
```

Expected:

- 文档仍明确当前没有完整云端 `student_profiles` 聚合。
- 本任务只描述 runtime guard，不改变 P1.7 非目标。

---

## Task 6: 全量验证和提交前检查

**Files:**
- Check: working tree

- [ ] **Step 1: 运行完整验证**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected:

- 全部通过。
- 如果 `npm run build` 因 sandbox 端口、Turbopack 或权限失败，记录原始错误，并区分环境限制和真实代码回归。

- [ ] **Step 2: 检查无重复 guard 和无无关改动**

Run:

```bash
rg -n "function isStudentProfile|function isGaokaoFocus|isGaokaoFocusItem|function isNumberRecord|function isStringArray" src/lib
git status --short
git diff -- src/lib/shared/student-profile.ts src/lib/demo/demo-state.ts src/lib/diagnosis/diagnose-api.ts scripts/demo-state.test.mjs scripts/diagnose-client.test.mjs interview/mathtrace-project-narrative.md
```

Expected:

- `function isStudentProfile` 只出现在 `src/lib/shared/student-profile.ts`。
- `src/lib/demo/demo-state.ts` 不残留本地画像 helper。
- `src/lib/diagnosis/diagnose-api.ts` 的本地 `isNumberRecord` 如仍存在，只服务于 `isMemoryDelta`，未被误改为本任务的一部分。
- diff 只包含本计划范围内文件。
- `docs/reviews/*.md` 不参与提交。

- [ ] **Step 3: Claude Code final review**

实现和自测完成后，不直接合并。先让 Claude Code 审查当前分支相对 `main` 的改动，重点看：

- shared `isStudentProfile` 是否成为唯一画像 guard。
- 是否误改 `StudentProfile` schema、localStorage key 或单学生 demo 设定。
- localStorage 损坏画像是否仍安全回退。
- API/client malformed response 是否仍被拒绝。
- 是否存在无关目录清理或架构重构。
- PRD、Roadmap、interview 文档是否没有夸大当前能力。

审查报告建议写入：

```text
docs/reviews/2026-06-16-unify-student-profile-guard-review.md
```

- [ ] **Step 4: 根据审查修复并再次验证**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected:

- 审查问题已处理或明确保留原因。
- 验证通过后再进入 commit / merge 流程。

---

## 验收标准

- `src/lib/shared/student-profile.ts` 是唯一 `isStudentProfile` 定义。
- `src/lib/demo/demo-state.ts` 复用 shared guard，损坏 localStorage 仍回退 `demoStudentProfile`。
- `src/lib/diagnosis/diagnose-api.ts` 复用 shared guard，API/client 响应 guard 行为不弱化。
- `isDiagnoseSuccessResponse` 本次不新增 sample 响应 `student_profile` 校验，保持既有行为；如未来需要，应作为独立任务评估。
- 缺失 `grade`、非字符串数组、`NaN` / `Infinity` 分数、坏 `gaokao_focus.priority` 都会被拒绝。
- 不改变 `demo_student_001` 单学生阶段边界。
- 不改变 localStorage key 或 Supabase 数据模型。
- `npm test`、`npm run lint`、`npm run build` 通过。
- `interview/mathtrace-project-narrative.md` 对“为什么单学生也需要画像校验”有可面试表达。

---

## 自审

- **Spec coverage:** 计划覆盖统一 guard、删除重复实现、测试、文档和验证；没有引入多用户或数据库画像。
- **Placeholder scan:** 无 TBD / TODO / “后续实现”式占位。
- **Type consistency:** 所有代码片段沿用现有 `StudentProfile`、`gaokao_focus`、`demoStudentProfile`、`isRecord` 命名。
