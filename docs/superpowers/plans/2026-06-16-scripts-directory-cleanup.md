# Scripts Directory Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 整理 `scripts/` 测试脚本目录，让测试按领域分组，并用一个 runner 维护执行顺序，保持所有测试语义不变。

**Architecture:** 当前 `scripts/` 根目录平铺 19 个 `.test.mjs` 文件，且 `package.json` 的 `npm test` 是一条很长的串行命令。本计划先新增 runner 和边界测试，再把测试文件机械移动到 `scripts/tests/<domain>/`，最后更新 `package.json` 只调用 runner。为降低迁移风险，测试内容不做业务改写，只更新路径、Jiti 引入和脚本入口。

**Tech Stack:** Node.js ESM scripts, `node:child_process`, `node:test`-free assertion scripts, `jiti`, existing `npm test` / `npm run test:smoke` / `npm run test:eval`.

---

## Current Structure Review

当前 `scripts/` 下的文件全部是测试脚本，按名称可以分为几类：

- 架构边界：`architecture-boundaries.test.mjs`
- provider：`analysis-provider.test.mjs`、`anthropic-compatible-provider.test.mjs`
- API / smoke：`api-smoke.test.mjs`、`demo-smoke.test.mjs`
- demo / client state：`demo-state.test.mjs`
- diagnosis：`agent-pipeline.test.mjs`、`diagnose-client.test.mjs`、`diagnosis-evidence.test.mjs`、`diagnosis-view-model.test.mjs`
- image diagnosis：`image-confirmation.test.mjs`、`image-diagnosis-pipeline.test.mjs`、`image-upload-client.test.mjs`、`vision-extraction-parser.test.mjs`
- persistence / mistake book：`diagnosis-persistence.test.mjs`、`mistake-book-api.test.mjs`
- UI / math / eval：`mathtrace-workbench-ui.test.mjs`、`math-text-parser.test.mjs`、`eval-harness.test.mjs`

主要问题不是测试坏，而是维护成本：

- 根目录平铺太长，Finder 和命令行都难扫描。
- `package.json` 的 `test` 命令很长，新增测试时容易忘记插入正确位置。
- 测试文件移动后会遇到大量 `jiti("../src/...")` 相对路径修正，需要一个统一 helper 降低后续成本。
- `scripts/eval-harness.test.mjs` 依赖 `scripts/fixtures/eval/p15-trusted-diagnosis-cases.mjs`。本轮保留 `scripts/fixtures/` 作为共享 fixture 目录，只更新移动后测试文件的导入路径。

---

## Non-Goals

- 不改任何 `src/` 生产代码。
- 不改变任何测试断言语义。
- 不新增测试框架，不迁移到 Vitest/Jest。
- 不把 smoke、eval、unit 测试合并成一个不可拆命令。
- 不清理 `scripts` 内部重复 helper，除非只是为了路径迁移必须做的 Jiti helper。
- 不提交 `docs/reviews/*.md`、`.env*`、`.next`、`.DS_Store` 或无关未跟踪 plan 文档。
- 不把与 scripts 整理无关的 `AGENTS.md` / `CLAUDE.md` 后续改动混进本任务提交；当前架构规则补充已作为独立提交处理。

---

## Target Structure

```text
scripts/
  run-tests.mjs
  test-support/
    project-jiti.mjs
  fixtures/
    eval/
      p15-trusted-diagnosis-cases.mjs
  tests/
    architecture/
      architecture-boundaries.test.mjs
    providers/
      analysis-provider.test.mjs
      anthropic-compatible-provider.test.mjs
    diagnosis/
      agent-pipeline.test.mjs
      diagnose-client.test.mjs
      diagnosis-evidence.test.mjs
      diagnosis-view-model.test.mjs
    image-diagnosis/
      image-confirmation.test.mjs
      image-diagnosis-pipeline.test.mjs
      image-upload-client.test.mjs
      vision-extraction-parser.test.mjs
    persistence/
      diagnosis-persistence.test.mjs
      mistake-book-api.test.mjs
    demo/
      demo-state.test.mjs
    smoke/
      api-smoke.test.mjs
      demo-smoke.test.mjs
    ui/
      mathtrace-workbench-ui.test.mjs
    math/
      math-text-parser.test.mjs
    eval/
      eval-harness.test.mjs
```

`npm test` 继续跑 default suite + smoke；`npm run test:smoke` 只跑 smoke；`npm run test:eval` 只跑 eval。

`scripts/test-support/` 只放跨测试文件共享的路径或加载 helper，不放具体测试逻辑或 fixtures；fixtures 继续放在 `scripts/fixtures/`，便于多个测试套件共享。

---

## Task 0: Preflight And Branch Hygiene

**Files:**
- Read: `git status --short --branch`
- Read: `package.json`
- Read: `scripts/*.mjs`

- [ ] **Step 1: Confirm current dirty worktree**

Run:

```bash
git status --short --branch
```

Expected:

- 本地 `main` 可能包含上一项文档规则补充提交；如果尚未 push，执行本任务前先决定是否推送或基于当前本地 `main` 创建分支。
- 多个 `docs/superpowers/plans/*.md` 可能是未跟踪本地计划。
- 本任务实现时不得 stage 上述无关文件。

- [ ] **Step 2: Create a dedicated branch**

Run:

```bash
git switch -c codex/scripts-directory-cleanup
```

Expected:

```text
Switched to a new branch 'codex/scripts-directory-cleanup'
```

- [ ] **Step 3: Baseline verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected:

- 三条命令均退出 0。
- 如果失败，先确认是否由环境或既有本地状态导致；不要在本任务中修业务代码。

---

## Task 1: Add Test Runner And Project Jiti Helper

**Files:**
- Create: `scripts/run-tests.mjs`
- Create: `scripts/test-support/project-jiti.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add project-root Jiti helper**

Create `scripts/test-support/project-jiti.mjs`:

```js
import { createJiti } from "jiti";

const projectRootUrl = new URL("../../", import.meta.url);

export function createProjectJiti(options = {}) {
  return createJiti(projectRootUrl.href, {
    tsconfigPaths: true,
    ...options,
  });
}
```

- [ ] **Step 2: Add runner with current root script paths first**

Create `scripts/run-tests.mjs`:

```js
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const suites = {
  default: [
    "scripts/architecture-boundaries.test.mjs",
    "scripts/vision-extraction-parser.test.mjs",
    "scripts/anthropic-compatible-provider.test.mjs",
    "scripts/analysis-provider.test.mjs",
    "scripts/diagnosis-evidence.test.mjs",
    "scripts/diagnosis-persistence.test.mjs",
    "scripts/mistake-book-api.test.mjs",
    "scripts/math-text-parser.test.mjs",
    "scripts/image-diagnosis-pipeline.test.mjs",
    "scripts/image-confirmation.test.mjs",
    "scripts/diagnose-client.test.mjs",
    "scripts/image-upload-client.test.mjs",
    "scripts/diagnosis-view-model.test.mjs",
    "scripts/mathtrace-workbench-ui.test.mjs",
    "scripts/agent-pipeline.test.mjs",
    "scripts/demo-state.test.mjs",
  ],
  smoke: ["scripts/api-smoke.test.mjs", "scripts/demo-smoke.test.mjs"],
  eval: ["scripts/eval-harness.test.mjs"],
};

const suiteName = process.argv[2] ?? "default";
const testFiles = suites[suiteName];

if (!testFiles) {
  console.error(`Unknown test suite: ${suiteName}`);
  console.error(`Available suites: ${Object.keys(suites).join(", ")}`);
  process.exit(1);
}

if (testFiles.length === 0) {
  console.error(`Test suite is empty: ${suiteName}`);
  process.exit(1);
}

for (const testFile of testFiles) {
  const result = spawnSync(process.execPath, [testFile], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
```

- [ ] **Step 3: Update package scripts to runner without moving files yet**

Modify `package.json`:

```json
"test": "node scripts/run-tests.mjs default && npm run test:smoke",
"test:eval": "node scripts/run-tests.mjs eval",
"test:smoke": "node scripts/run-tests.mjs smoke"
```

- [ ] **Step 4: Verify runner preserves behavior before moving files**

Run:

```bash
npm test
npm run test:eval
npm run lint
```

Expected:

- `npm test` passes.
- `npm run test:eval` passes.
- `npm run lint` passes.

---

## Task 2: Move Tests Into Domain Folders

**Files:**
- Move: all `scripts/*.test.mjs`
- Modify: moved test files that import `jiti`
- Modify: `scripts/tests/eval/eval-harness.test.mjs`
- Modify: `scripts/run-tests.mjs`

- [ ] **Step 1: Create target directories**

Run:

```bash
mkdir -p scripts/tests/architecture scripts/tests/providers scripts/tests/diagnosis scripts/tests/image-diagnosis scripts/tests/persistence scripts/tests/demo scripts/tests/smoke scripts/tests/ui scripts/tests/math scripts/tests/eval
```

- [ ] **Step 2: Move test files with git mv**

Run:

```bash
git mv scripts/architecture-boundaries.test.mjs scripts/tests/architecture/architecture-boundaries.test.mjs
git mv scripts/analysis-provider.test.mjs scripts/tests/providers/analysis-provider.test.mjs
git mv scripts/anthropic-compatible-provider.test.mjs scripts/tests/providers/anthropic-compatible-provider.test.mjs
git mv scripts/agent-pipeline.test.mjs scripts/tests/diagnosis/agent-pipeline.test.mjs
git mv scripts/diagnose-client.test.mjs scripts/tests/diagnosis/diagnose-client.test.mjs
git mv scripts/diagnosis-evidence.test.mjs scripts/tests/diagnosis/diagnosis-evidence.test.mjs
git mv scripts/diagnosis-view-model.test.mjs scripts/tests/diagnosis/diagnosis-view-model.test.mjs
git mv scripts/image-confirmation.test.mjs scripts/tests/image-diagnosis/image-confirmation.test.mjs
git mv scripts/image-diagnosis-pipeline.test.mjs scripts/tests/image-diagnosis/image-diagnosis-pipeline.test.mjs
git mv scripts/image-upload-client.test.mjs scripts/tests/image-diagnosis/image-upload-client.test.mjs
git mv scripts/vision-extraction-parser.test.mjs scripts/tests/image-diagnosis/vision-extraction-parser.test.mjs
git mv scripts/diagnosis-persistence.test.mjs scripts/tests/persistence/diagnosis-persistence.test.mjs
git mv scripts/mistake-book-api.test.mjs scripts/tests/persistence/mistake-book-api.test.mjs
git mv scripts/demo-state.test.mjs scripts/tests/demo/demo-state.test.mjs
git mv scripts/api-smoke.test.mjs scripts/tests/smoke/api-smoke.test.mjs
git mv scripts/demo-smoke.test.mjs scripts/tests/smoke/demo-smoke.test.mjs
git mv scripts/mathtrace-workbench-ui.test.mjs scripts/tests/ui/mathtrace-workbench-ui.test.mjs
git mv scripts/math-text-parser.test.mjs scripts/tests/math/math-text-parser.test.mjs
git mv scripts/eval-harness.test.mjs scripts/tests/eval/eval-harness.test.mjs
```

- [ ] **Step 3: Replace direct `createJiti` setup in moved tests**

For every moved test containing:

```js
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
```

replace with:

```js
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
```

For `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`, keep JSX support:

```js
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti({ jsx: true });
```

Then update Jiti project imports from old relative paths such as:

```js
jiti("../src/data/mathtrace-demo.ts")
```

to project-root relative paths:

```js
jiti("./src/data/mathtrace-demo.ts")
```

对于 `readFile("src/...")`、`readdir("src/...")`、`readFile("package.json")`、`readdir("scripts")` 这类基于 cwd 的文件读取调用，保持路径不变；`scripts/run-tests.mjs` 会显式把子进程 cwd 固定为项目根目录。

- [ ] **Step 4: Update eval fixture import path**

Keep shared fixtures in `scripts/fixtures/eval/`. In `scripts/tests/eval/eval-harness.test.mjs`, change:

```js
import { trustedDiagnosisCases } from "./fixtures/eval/p15-trusted-diagnosis-cases.mjs";
```

to:

```js
import { trustedDiagnosisCases } from "../../fixtures/eval/p15-trusted-diagnosis-cases.mjs";
```

- [ ] **Step 5: Update runner paths to target structure**

Modify `scripts/run-tests.mjs` suite paths:

```js
const suites = {
  default: [
    "scripts/tests/architecture/architecture-boundaries.test.mjs",
    "scripts/tests/image-diagnosis/vision-extraction-parser.test.mjs",
    "scripts/tests/providers/anthropic-compatible-provider.test.mjs",
    "scripts/tests/providers/analysis-provider.test.mjs",
    "scripts/tests/diagnosis/diagnosis-evidence.test.mjs",
    "scripts/tests/persistence/diagnosis-persistence.test.mjs",
    "scripts/tests/persistence/mistake-book-api.test.mjs",
    "scripts/tests/math/math-text-parser.test.mjs",
    "scripts/tests/image-diagnosis/image-diagnosis-pipeline.test.mjs",
    "scripts/tests/image-diagnosis/image-confirmation.test.mjs",
    "scripts/tests/diagnosis/diagnose-client.test.mjs",
    "scripts/tests/image-diagnosis/image-upload-client.test.mjs",
    "scripts/tests/diagnosis/diagnosis-view-model.test.mjs",
    "scripts/tests/ui/mathtrace-workbench-ui.test.mjs",
    "scripts/tests/diagnosis/agent-pipeline.test.mjs",
    "scripts/tests/demo/demo-state.test.mjs",
  ],
  smoke: [
    "scripts/tests/smoke/api-smoke.test.mjs",
    "scripts/tests/smoke/demo-smoke.test.mjs",
  ],
  eval: ["scripts/tests/eval/eval-harness.test.mjs"],
};
```

- [ ] **Step 6: Verify moved tests**

Run:

```bash
npm test
npm run test:eval
npm run lint
```

Expected:

- All commands pass.
- If a test fails with module resolution errors, fix only moved-file import paths.

---

## Task 3: Add Scripts Directory Boundary Guard

**Files:**
- Modify: `scripts/tests/architecture/architecture-boundaries.test.mjs`

- [ ] **Step 1: Add root scripts guard**

Append a check that `scripts/` root contains no `.test.mjs` files:

```js
const rootScriptEntries = await readdir("scripts", { withFileTypes: true });
const rootTestFiles = rootScriptEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
  .map((entry) => entry.name)
  .sort();

assert.deepEqual(
  rootTestFiles,
  [],
  "scripts 根目录不应继续平铺测试脚本；请放到 scripts/tests/<domain>/。",
);
```

这些路径基于项目根目录 cwd，不要因为测试文件已经移动到 `scripts/tests/architecture/` 而改成相对当前文件的路径。

- [ ] **Step 2: Add runner path guard**

Add a check that `package.json` does not inline every test file again:

```js
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

assert.equal(packageJson.scripts.test.includes("scripts/run-tests.mjs"), true);
assert.equal(packageJson.scripts["test:smoke"].includes("scripts/run-tests.mjs"), true);
assert.equal(packageJson.scripts["test:eval"].includes("scripts/run-tests.mjs"), true);
```

这里同样读取项目根目录下的 `package.json`；runner 已固定 cwd，因此无需使用 `../../package.json`。

- [ ] **Step 3: Verify architecture guard**

Run:

```bash
node scripts/tests/architecture/architecture-boundaries.test.mjs
npm test
```

Expected:

- Architecture guard passes.
- Full test suite passes.

---

## Task 4: Documentation And Review Handoff

**Files:**
- Modify: `interview/mathtrace-project-narrative.md` only if needed
- Check: `AGENTS.md`
- Check: `CLAUDE.md`

- [ ] **Step 1: Decide whether interview doc needs an update**

This is internal test folder architecture cleanup. If no user-visible behavior, API contract, model boundary, database boundary, or measurable verification workflow changes beyond runner cleanup, do not add a full new interview phase.

If documenting, add only one sentence to an existing architecture/testing paragraph:

```md
后续测试脚本也按领域移入 `scripts/tests/<domain>/` 并通过 `scripts/run-tests.mjs` 统一编排，降低新增回归脚本时漏改 `package.json` 长命令的风险。
```

- [ ] **Step 2: Final verification**

Run:

```bash
npm test
npm run test:eval
npm run lint
npm run build
```

Expected:

- All commands pass.

- [ ] **Step 3: Prepare Claude Code final review prompt**

Ask Claude Code to review current branch relative to `main`, focusing on:

- `scripts/` tests moved by domain without changing test semantics.
- `scripts/run-tests.mjs` preserves old execution order.
- `npm test`, `npm run test:smoke`, `npm run test:eval` still run the intended suites.
- Jiti helper resolves project-root imports reliably.
- Architecture boundary test prevents root `scripts/*.test.mjs` regression.
- No production code, API contract, database schema, provider behavior, localStorage behavior, or UI behavior changed.
- `AGENTS.md` / `CLAUDE.md` architecture-rule edits are not accidentally mixed into this commit unless intentionally included.
- `docs/reviews/*.md` and unrelated plan docs are not staged.

Suggested report path:

```text
docs/reviews/2026-06-16-scripts-directory-cleanup-final-review.md
```

---

## Acceptance Criteria

- `scripts/` root contains runner/support folders but no flat `.test.mjs` files.
- Tests are grouped under `scripts/tests/<domain>/`.
- `package.json` test scripts call `scripts/run-tests.mjs`.
- `npm test`, `npm run test:smoke`, `npm run test:eval`, `npm run lint`, and `npm run build` pass.
- No production behavior changes.
- No `docs/reviews/*.md`, `.env*`, `.next`, `.DS_Store`, unrelated local plan docs, or unrelated AGENTS/CLAUDE edits are included in the scripts cleanup commit.

---

## Self-Review

- **Spec coverage:** Plan covers current scripts flat layout, runner extraction, domain moves, path helper, boundary guard, verification, and review.
- **Placeholder scan:** No TBD/TODO placeholders.
- **Scope control:** The plan intentionally avoids rewriting test logic or introducing a new test framework.
