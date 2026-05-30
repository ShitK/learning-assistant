# P0 Demo State Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补强 P0 工作台的浏览器状态恢复能力，让样例诊断后的学生画像能在刷新后稳定恢复，并让损坏的 localStorage 数据、重复点击和重置画像都有明确表现。

**Architecture:** 新增一个不依赖 React 的 `src/lib/demo-state.ts`，集中处理 `StudentProfile` 的 localStorage key、解析、校验、序列化和恢复 fallback；`MathTraceWorkbench` 只负责在客户端挂载后读取、画像变化后写入，以及提供重置入口。新增轻量 Node 脚本 `scripts/demo-state.test.mjs` 先覆盖纯函数边界，再做组件接入，不改变 `/api/diagnose` 请求或响应契约。

**Tech Stack:** Next.js App Router、React Client Component、TypeScript、localStorage、Node.js `node:assert/strict`、`jiti`。

---

## 当前假设

- P0 正式演示仍只走 `sample_diagnosis`；`image_diagnosis` 仍返回 P1 提示。
- 后端 `/api/diagnose`、Agent Pipeline、样例题数据和 API 响应字段不改。
- localStorage 只保存 demo 学生画像，不保存真实学生身份、不保存图片、不保存完整诊断请求。
- 损坏、缺失、结构不匹配或浏览器存储读写失败的 localStorage 数据直接回退到 `demoStudentProfile`，不尝试复杂迁移。
- 计划完成后先让 Claude Code 在本地审查；根据审查修复并重新验证后，才提交、推送和开 PR。

## 改动边界

- Create: `src/lib/demo-state.ts`
- Create: `scripts/demo-state.test.mjs`
- Modify: `src/components/mathtrace-workbench.tsx`
- Modify: `package.json`
- Check/Optional Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`，仅在最终 localStorage 状态模型与 PRD 现有描述不一致时补充一句 P0 状态恢复说明
- 不修改：`src/app/api/diagnose/route.ts`
- 不修改：`src/lib/mathtrace-agent-pipeline.ts`
- 不修改：`src/data/mathtrace-demo.ts`
- 不处理：`docs/reviews/2026-05-30-agent-pipeline-service-review.md`
- 不处理：`docs/reviews/2026-05-30-p0-regression-tests-review.md`

## 验收方式

- `node scripts/demo-state.test.mjs`
- `node scripts/agent-pipeline.test.mjs`
- `npm run lint`
- `npm run build`
- `/api/diagnose` smoke test：`sample_diagnosis` 返回 200 且 `fallback_used=false`
- 浏览器手动 smoke：完成一次样例诊断后刷新页面，画像变化仍保留；写入损坏 localStorage 后刷新，页面回到默认画像且不崩溃；点击重置画像后恢复默认画像

---

### Task 1: 写 localStorage 画像状态的失败测试

**Files:**
- Create: `scripts/demo-state.test.mjs`

- [ ] **Step 1: 新增测试脚本**

创建 `scripts/demo-state.test.mjs`，先写对未来导出函数的断言。此时 `src/lib/demo-state.ts` 还不存在，运行应失败。

```js
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

const { demoStudentProfile } = jiti("../src/data/mathtrace-demo.ts");
const {
  DEMO_STUDENT_PROFILE_STORAGE_KEY,
  parseStoredStudentProfile,
  serializeStudentProfile,
  createMemoryStorage,
  readStoredStudentProfile,
  writeStoredStudentProfile,
  clearStoredStudentProfile,
} = jiti("../src/lib/demo-state.ts");

const updatedProfile = {
  ...demoStudentProfile,
  mastery_scores: {
    ...demoStudentProfile.mastery_scores,
    parameter_classification: 38,
  },
  frequent_mistake_causes: {
    ...demoStudentProfile.frequent_mistake_causes,
    classification_missing: 5,
  },
  review_priority: [
    "parameter_classification",
    "derivative_monotonicity",
    "function_domain",
  ],
  updated_at: "2026-05-30T10:00:00+08:00",
};

assert.equal(
  DEMO_STUDENT_PROFILE_STORAGE_KEY,
  "mathtrace.demoStudentProfile.v1",
);

assert.deepEqual(parseStoredStudentProfile(null), demoStudentProfile);
assert.deepEqual(parseStoredStudentProfile("{"), demoStudentProfile);
assert.deepEqual(
  parseStoredStudentProfile(JSON.stringify({ student_id: 123 })),
  demoStudentProfile,
);

assert.deepEqual(
  parseStoredStudentProfile(JSON.stringify(updatedProfile)),
  updatedProfile,
);

const serializedProfile = serializeStudentProfile(updatedProfile);
assert.deepEqual(JSON.parse(serializedProfile), updatedProfile);
assert.deepEqual(parseStoredStudentProfile(serializedProfile), updatedProfile);

const storage = createMemoryStorage();
assert.deepEqual(readStoredStudentProfile(storage), demoStudentProfile);

writeStoredStudentProfile(storage, updatedProfile);
assert.deepEqual(readStoredStudentProfile(storage), updatedProfile);

storage.setItem(DEMO_STUDENT_PROFILE_STORAGE_KEY, "{");
assert.deepEqual(readStoredStudentProfile(storage), demoStudentProfile);

writeStoredStudentProfile(storage, updatedProfile);
clearStoredStudentProfile(storage);
assert.deepEqual(readStoredStudentProfile(storage), demoStudentProfile);

const throwingStorage = {
  getItem() {
    throw new Error("storage unavailable");
  },
  setItem() {
    throw new Error("storage unavailable");
  },
  removeItem() {
    throw new Error("storage unavailable");
  },
};

assert.deepEqual(readStoredStudentProfile(throwingStorage), demoStudentProfile);
assert.doesNotThrow(() => writeStoredStudentProfile(throwingStorage, updatedProfile));
assert.doesNotThrow(() => clearStoredStudentProfile(throwingStorage));

console.log("demo state regression test passed");
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node scripts/demo-state.test.mjs`

Expected: FAIL，错误原因是 `../src/lib/demo-state.ts` 尚不存在或导出函数不存在。

---

### Task 2: 实现最小 demo-state 模块

**Files:**
- Create: `src/lib/demo-state.ts`
- Test: `scripts/demo-state.test.mjs`

- [ ] **Step 1: 新增纯函数模块**

创建 `src/lib/demo-state.ts`。模块只做 localStorage 画像读写和结构校验，不访问 `window`，方便 Node 测试。

```ts
import { demoStudentProfile } from "@/data/mathtrace-demo";
import type { StudentProfile } from "@/data/mathtrace-demo";
import { isRecord } from "@/lib/utils";

export const DEMO_STUDENT_PROFILE_STORAGE_KEY =
  "mathtrace.demoStudentProfile.v1";

interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function parseStoredStudentProfile(rawValue: string | null): StudentProfile {
  if (rawValue === null) {
    return demoStudentProfile;
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);
    return isStudentProfile(parsedValue) ? parsedValue : demoStudentProfile;
  } catch {
    return demoStudentProfile;
  }
}

export function serializeStudentProfile(profile: StudentProfile): string {
  return JSON.stringify(profile);
}

export function readStoredStudentProfile(storage: ProfileStorage): StudentProfile {
  try {
    return parseStoredStudentProfile(
      storage.getItem(DEMO_STUDENT_PROFILE_STORAGE_KEY),
    );
  } catch {
    return demoStudentProfile;
  }
}

export function writeStoredStudentProfile(
  storage: ProfileStorage,
  profile: StudentProfile,
): void {
  try {
    storage.setItem(
      DEMO_STUDENT_PROFILE_STORAGE_KEY,
      serializeStudentProfile(profile),
    );
  } catch {
    return;
  }
}

export function clearStoredStudentProfile(storage: ProfileStorage): void {
  try {
    storage.removeItem(DEMO_STUDENT_PROFILE_STORAGE_KEY);
  } catch {
    return;
  }
}

export function createMemoryStorage(): ProfileStorage {
  const values = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
  };
}

function isStudentProfile(value: unknown): value is StudentProfile {
  if (!isRecord(value)) {
    return false;
  }

  return (
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

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((item) => typeof item === "number");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isGaokaoFocus(
  value: unknown,
): value is StudentProfile["gaokao_focus"] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.knowledge_point === "string" &&
        typeof item.reason === "string" &&
        typeof item.priority === "number",
    )
  );
}
```

- [ ] **Step 2: 运行 demo-state 测试**

Run: `node scripts/demo-state.test.mjs`

Expected: PASS，输出 `demo state regression test passed`。

---

### Task 3: 接入 MathTraceWorkbench 的恢复、持久化和重置

**Files:**
- Modify: `src/components/mathtrace-workbench.tsx`
- Test: `scripts/demo-state.test.mjs`

- [ ] **Step 1: 引入 demo-state 工具**

在 `src/components/mathtrace-workbench.tsx` import 区增加：

```ts
import {
  clearStoredStudentProfile,
  readStoredStudentProfile,
  writeStoredStudentProfile,
} from "@/lib/demo-state";
```

- [ ] **Step 2: 增加 hydration-safe 画像派生状态**

在 `MathTraceWorkbench` 中使用 `useSyncExternalStore` 判断客户端水合完成，避免在 effect 里同步 `setState` 触发 React hooks lint。水合完成后从 localStorage 读取画像；诊断过程中的画像更新使用 session state 覆盖当前快照。

```ts
const hasHydrated = useHasHydrated();
const restoredStudentProfile = hasHydrated
  ? readStoredStudentProfile(window.localStorage)
  : demoStudentProfile;
const [sessionStudentProfile, setSessionStudentProfile] =
  useState<StudentProfile | null>(null);
const studentProfile = sessionStudentProfile ?? restoredStudentProfile;
const [profilePreview, setProfilePreview] = useState<ProfilePreview | null>(
  null,
);
const visibleProfilePreview = profilePreview ?? {
  beforeProfile: studentProfile,
  afterProfile: null,
};
```

- [ ] **Step 3: 增加 hydration helper**

在本文件 helper 区增加：

```ts
function useHasHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
}

function subscribeToHydration(): () => void {
  return function unsubscribe(): void {
    return;
  };
}

function getClientHydrationSnapshot(): boolean {
  return true;
}

function getServerHydrationSnapshot(): boolean {
  return false;
}
```

- [ ] **Step 4: 诊断成功后写入 localStorage**

在 `requestDiagnosis` 成功分支中同时更新 session state 和 localStorage。写入失败由 `writeStoredStudentProfile` 吞掉并保持页面状态可用。

```ts
setSessionStudentProfile(diagnosis.student_profile);
writeStoredStudentProfile(window.localStorage, diagnosis.student_profile);
```

- [ ] **Step 5: 增加重置画像 handler**

在 `MathTraceWorkbench` 内增加：

```ts
function handleResetProfile(): void {
  clearStoredStudentProfile(window.localStorage);
  setSessionStudentProfile(demoStudentProfile);
  setProfilePreview({
    beforeProfile: demoStudentProfile,
    afterProfile: null,
  });
  setApiErrorMessage(null);
}
```

- [ ] **Step 6: 防止重复请求穿透**

在 `handleStartDiagnosis` 开头加保护，确保按钮 disabled 之外也不会并发触发同一次诊断。

```ts
function handleStartDiagnosis(): void {
  if (isDiagnosing || isDiagnosisRequestLockedRef.current) {
    return;
  }

  void requestDiagnosis();
}
```

- [ ] **Step 7: 把重置入口传给 ProfileInsights**

调用处增加：

```tsx
<ProfileInsights
  sample={diagnosisSample}
  beforeProfile={visibleProfilePreview.beforeProfile}
  afterProfile={visibleProfilePreview.afterProfile}
  onResetProfile={handleResetProfile}
/>
```

`ProfileInsights` props 增加 `onResetProfile`：

```ts
function ProfileInsights({
  sample,
  beforeProfile,
  afterProfile,
  onResetProfile,
}: {
  sample: SampleDiagnosis;
  beforeProfile: StudentProfile;
  afterProfile: StudentProfile | null;
  onResetProfile: () => void;
}): ReactElement {
```

在“画像变化”标题区域增加一个低调按钮，不改变页面主流程：

```tsx
<div className="flex flex-col gap-3 border-b border-[var(--oat)] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
  <SectionHeader
    kicker="Long-term memory"
    title="画像变化"
    description={`基于 ${mistakeHistory.length} 条 mock 历史错题，展示本次 memory_delta 如何影响长期学习画像。`}
  />
  <button
    type="button"
    onClick={onResetProfile}
    className="min-h-10 w-fit rounded-full border border-[var(--light-gray)] bg-white px-4 text-sm font-medium text-[var(--warm-gray)] hover:border-[var(--mocha-light)] hover:text-[var(--mocha)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mocha)]"
  >
    重置画像
  </button>
</div>
```

- [ ] **Step 8: 运行 lint 捕捉类型和 hook 依赖问题**

Run: `npm run lint`

Expected: exit code 0。

---

### Task 4: 把 demo-state 测试纳入项目测试脚本

**Files:**
- Modify: `package.json`
- Test: `scripts/demo-state.test.mjs`
- Test: `scripts/agent-pipeline.test.mjs`

- [ ] **Step 1: 新增 test 脚本**

在 `package.json` 的 `scripts` 中增加 `test`，串行运行现有 pipeline 测试和新的 demo-state 测试。

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "node scripts/agent-pipeline.test.mjs && node scripts/demo-state.test.mjs"
  }
}
```

- [ ] **Step 2: 运行测试**

Run: `npm test`

Expected:

```text
agent pipeline regression test passed
demo state regression test passed
```

---

### Task 5: 文档收口检查

**Files:**
- Check: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- Optional Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`

- [ ] **Step 1: 检查 PRD 是否已覆盖 P0 localStorage**

Run:

```bash
rg -n "localStorage|状态|画像|刷新|恢复" docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md
```

Expected: 能看到 P0 使用 localStorage、长期画像或状态恢复的相关描述。

- [ ] **Step 2: 如 PRD 缺少状态恢复说明，补最小一句**

如果 Step 1 没有覆盖刷新恢复或损坏数据 fallback，在 P0 执行策略或状态相关段落中补充：

```md
P0 前端使用 localStorage 保存 demo 学生画像；刷新页面时恢复画像，localStorage 缺失、损坏或结构不匹配时回退到默认 `demoStudentProfile`，不影响 `/api/diagnose` 的无状态后端契约。
```

- [ ] **Step 3: 如 PRD 已覆盖，则不修改文档**

最终说明中写明：`本次改动不涉及 PRD 更新`。

---

### Task 6: 全量验证和本地 Claude Code 审查

**Files:**
- Create: `src/lib/demo-state.ts`
- Create: `scripts/demo-state.test.mjs`
- Modify: `src/components/mathtrace-workbench.tsx`
- Modify: `package.json`
- Optional Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`

- [ ] **Step 1: 运行单元/回归测试**

Run: `npm test`

Expected:

```text
agent pipeline regression test passed
demo state regression test passed
```

- [ ] **Step 2: 运行 lint**

Run: `npm run lint`

Expected: exit code 0。

- [ ] **Step 3: 运行 build**

Run: `npm run build`

Expected: exit code 0。

- [ ] **Step 4: 做 `/api/diagnose` smoke test**

启动 dev server：

```bash
npm run dev
```

请求 sample 路径：

```bash
curl -s -X POST http://127.0.0.1:3000/api/diagnose \
  -H 'Content-Type: application/json' \
  -d '{"student_id":"demo_student_001","task_type":"sample_diagnosis","sample_question_id":"sample_derivative_001","image_base64":null,"student_profile":null,"mistake_history":[]}'
```

Expected: HTTP 200，响应中 `source="sample"`、`fallback_used=false`。

请求 image 路径：

```bash
curl -s -X POST http://127.0.0.1:3000/api/diagnose \
  -H 'Content-Type: application/json' \
  -d '{"student_id":"demo_student_001","task_type":"image_diagnosis","sample_question_id":null,"image_base64":null,"student_profile":null,"mistake_history":[]}'
```

Expected: HTTP 400，响应中 `error.code="image_diagnosis_p1"`。

- [ ] **Step 5: 浏览器手动 smoke**

在浏览器打开本地 dev server：

```text
http://127.0.0.1:3000
```

检查：

- 选择 `sample_derivative_001` 并点击开始诊断，画像变更正常显示。
- 刷新页面后，画像保留诊断后的数值。
- 在 DevTools 中把 `mathtrace.demoStudentProfile.v1` 改成 `{`，刷新页面不崩溃，并回到默认画像。
- 点击“重置画像”，画像回到默认 `demoStudentProfile`。
- 连续点击“开始诊断”不会发起并发诊断，也不会让 timeline 卡住。

- [ ] **Step 6: 提供 Claude Code 本地审查提示词**

完成实现和自测后，不推 PR。先请用户让 Claude Code 审查本地分支，建议提示词：

```text
请审查 learning-assistant 项目当前分支 codex/p0-demo-state-stability 相对 main 的改动。

审查重点：
1. 是否保持 /api/diagnose 响应契约不变，sample_diagnosis 和 image_diagnosis 行为是否没有回归。
2. localStorage 画像恢复是否能处理首次加载、刷新恢复、损坏 JSON、结构不匹配、重置画像。
3. MathTraceWorkbench 的 React state / useEffect 是否存在 hydration、重复写入、闭包过期、重复点击并发请求或 timeline 卡住风险。
4. demo-state 纯函数边界是否简单、可测试，是否避免 any，是否使用 named exports。
5. 新增测试是否覆盖核心边界，是否还缺少必要场景。
6. 是否有超出 P0 的范围泄漏，例如数据库、Kimi、真实图片识别、RAG、老师端、登录、支付。
7. 是否需要同步更新 PRD，或当前文档收口说明是否足够。

请按 AGENTS.md 和 CLAUDE.md 的审查要求输出，若没有 PR，请把审查报告写入：
docs/reviews/2026-05-30-p0-demo-state-stability-review.md

验证命令请至少运行：
- npm test
- npm run lint
- npm run build
```

- [ ] **Step 7: 根据 Claude 审查修复后再进入 PR 流程**

收到审查报告后使用 `superpowers:receiving-code-review` 逐项判断：

- 明确修复必须改的问题。
- 对不采纳的建议写出原因。
- 重新运行 `npm test`、`npm run lint`、`npm run build` 和 smoke test。
- 之后再提交、推送并创建中文 PR。
