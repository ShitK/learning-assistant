# Shared Vision Boundary Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `src/lib/shared/` 和 `src/lib/vision-extraction/` 增加反向依赖边界守护，防止中立层重新依赖 `diagnosis`、`image-diagnosis` 或 `providers`。

**Architecture:** 本次只增强 `scripts/architecture-boundaries.test.mjs`，沿用现有 TypeScript Compiler API 解析 import/export 的方式，并通过 `resolveSourceFile()` 同时覆盖 alias import 和 relative import。`shared/` 与 `vision-extraction/` 作为中立底层，允许被上层 domain 使用，且本次保留现有 `shared <-> vision-extraction` 同层依赖；本任务只禁止它们反向 import 上层业务域。

**Tech Stack:** Node.js, TypeScript Compiler API, Next.js/TypeScript project structure.

---

## Scope

### In Scope

- 在 `scripts/architecture-boundaries.test.mjs` 中增加两条中立层反向依赖规则：
  - `src/lib/shared/` 不允许 import 到 `src/lib/diagnosis/`、`src/lib/image-diagnosis/`、`src/lib/providers/`。
  - `src/lib/vision-extraction/` 不允许 import 到 `src/lib/diagnosis/`、`src/lib/image-diagnosis/`、`src/lib/providers/`。
- 规则必须覆盖 runtime import、type-only import、re-export、字面量路径 dynamic import，例如 `import("@/lib/diagnosis/foo")`。
- 规则必须覆盖 alias import，例如 `@/lib/diagnosis/...`。
- 规则必须覆盖 relative import，例如 `../diagnosis/...`。
- 保留当前允许的 `shared -> vision-extraction` 依赖，因为当前 `src/lib/shared/analysis-provider-types.ts` 需要复用 `VisionExtractionDraft` 类型。
- 保留当前允许的 `vision-extraction -> shared` 依赖，因为当前 `src/lib/vision-extraction/vision-extraction-parser.ts` 复用 `shared/utils` 中的基础 helper。
- 当前假设项目 source alias 只有 `@/`；如果后续在 `tsconfig.json` 中新增其他 path alias，需要同步扩展 `resolveSourceFile()` 或改为读取 `tsconfig.json` paths。

### Out of Scope

- 不调整 `isStudentProfile` 的多个实现。
- 不继续重构目录结构。
- 不移动业务文件。
- 不改 `POST /api/diagnose`、`POST /api/confirm`、错题本 API 或 Supabase 写入逻辑。
- 不改 prompt、模型 provider、JSON Schema、KaTeX 渲染或 UI。
- 不更新 `interview/mathtrace-project-narrative.md`，因为本次是测试守护增强，不是用户可感知功能阶段。
- 不提交 `docs/reviews/*.md`、`.env*`、`.next/`、`.DS_Store`。

## Current State

当前 `scripts/architecture-boundaries.test.mjs` 已经有这些 guard：

- 禁止 `src/lib` 根目录继续平铺业务模块。
- 禁止旧的平铺 `@/lib/*` import。
- 禁止 client runtime graph 触达 `persistence/`、`providers/`、Supabase service role key。
- 禁止：
  - `providers -> diagnosis/image-diagnosis`
  - `image-diagnosis -> providers`
  - `image-diagnosis -> diagnosis`

缺口是：已经下沉出来的 `shared/` 和 `vision-extraction/` 还没有被规则保护。未来如果有人在这些中立层里 import 上层 domain，架构测试目前不会阻止。

当前 `shared <-> vision-extraction` 是同层中立模块之间的依赖，不是本任务要打破的 domain cycle。本次不移动 `isRecord`、`VisionExtractionDraft` 或相关 helper，只给“中立层不得依赖上层 domain”这条边界加测试护栏。

## Success Criteria

- `node scripts/architecture-boundaries.test.mjs` 通过。
- `npm test` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `git status --short` 中只有本任务相关文件被 stage/commit；本地 review 文档和旧的未跟踪 plan 文档不纳入提交。

---

## Branch Setup

Start from latest `main`:

```bash
git switch main
git pull
git switch -c codex/shared-vision-boundary-guards
```

Expected: implementation happens on `codex/shared-vision-boundary-guards`, not directly on `main`.

---

### Task 1: Add Neutral Layer Reverse Dependency Guards

**Files:**
- Modify: `scripts/architecture-boundaries.test.mjs`

- [ ] **Step 1: Inspect the existing boundary rule block**

Run:

```bash
sed -n '1,380p' scripts/architecture-boundaries.test.mjs
```

Expected: confirm the file already contains `domainBoundaryRules`, `resolveSourceFile()`, `getImportSources()`, and `getRuntimeImportSources()`.

- [ ] **Step 2: Add the `shared/` reverse dependency rule**

Modify the existing `domainBoundaryRules` array by adding this object after the current `image-diagnosis` rules:

```js
  {
    from_dir: "src/lib/shared/",
    forbidden_dirs: [
      "src/lib/diagnosis/",
      "src/lib/image-diagnosis/",
      "src/lib/providers/",
    ],
    runtime_only: false,
    message:
      "shared must stay domain-neutral and must not import diagnosis, image-diagnosis, or provider modules.",
  },
```

Expected: the rule uses `forbidden_dirs`, not `forbidden_prefixes`, so relative imports are caught after `resolveSourceFile()`.

- [ ] **Step 3: Add the `vision-extraction/` reverse dependency rule**

Add this object immediately after the `shared/` rule:

```js
  {
    from_dir: "src/lib/vision-extraction/",
    forbidden_dirs: [
      "src/lib/diagnosis/",
      "src/lib/image-diagnosis/",
      "src/lib/providers/",
    ],
    runtime_only: false,
    message:
      "vision-extraction must stay neutral and must not import diagnosis, image-diagnosis, or provider modules.",
  },
```

Expected: `runtime_only: false` catches runtime imports, type-only imports, re-exports, and literal dynamic imports because it uses `getImportSources()`. Type-only domain coupling can still recreate the cycles this layer was introduced to prevent.

- [ ] **Step 4: Run the focused architecture test**

Run:

```bash
node scripts/architecture-boundaries.test.mjs
```

Expected: PASS with no output. If it fails, inspect the reported `importSource -> resolvedFile` edge and remove the reverse dependency by moving any genuinely shared type/helper into `shared/` or `vision-extraction/` only if the failing import is caused by current code. Do not broaden allowed rules just to silence the guard.

- [ ] **Step 5: Run the full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 6: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS with no new lint warnings.

- [ ] **Step 7: Run build**

Run:

```bash
npm run build
```

Expected: PASS. If the build fails with a sandbox-only Turbopack permission or port binding error, record the exact error and rerun in an approved environment before treating it as a product regression.

- [ ] **Step 8: Review the exact diff**

Run:

```bash
git diff -- scripts/architecture-boundaries.test.mjs
git status --short
```

Expected: only `scripts/architecture-boundaries.test.mjs` should be a tracked modification for this implementation task. Existing local plan docs or `docs/reviews/*.md` must remain untracked and unstaged.

- [ ] **Step 9: Commit only the guard change**

Stage and commit exactly:

```bash
git add scripts/architecture-boundaries.test.mjs
git commit -m "test: guard neutral domain dependencies"
```

Expected: local commit created on `codex/shared-vision-boundary-guards`.

---

## Claude Code Review Prompt

Use this prompt after implementation and self-tests pass:

```text
请审查当前分支相对 main 的改动，重点看 scripts/architecture-boundaries.test.mjs 中新增的 shared / vision-extraction 反向依赖边界规则。

背景：
- 上一个任务已经把跨 diagnosis / image-diagnosis / providers 的共享类型和 helper 下沉到 src/lib/shared/ 与 src/lib/vision-extraction/。
- 当前任务只补强架构测试，防止中立层重新 import 上层 domain。
- 预期边界：
  - src/lib/shared/ 不应 import src/lib/diagnosis/、src/lib/image-diagnosis/、src/lib/providers/。
  - src/lib/vision-extraction/ 不应 import src/lib/diagnosis/、src/lib/image-diagnosis/、src/lib/providers/。
  - 保留 shared -> vision-extraction 的现状，不在本任务中调整。

请重点检查：
1. 新增规则是否同时覆盖 alias import 和 relative import。
2. runtime_only: false 是否合理，是否能覆盖 type-only import / re-export / dynamic import。
3. 是否误伤现有合法依赖，尤其是 shared -> vision-extraction。
4. 是否存在可以绕过规则的路径。
5. 是否有无关重构或不必要改动。

请把审查报告写入：
docs/reviews/2026-06-15-shared-vision-boundary-guards-review.md

报告请按 Critical / Important / Nice-to-have 分类；如果没有阻塞问题，请明确写“Ready to merge”。
```

---

## Merge Checklist

After Claude Code review:

- [ ] Read `docs/reviews/2026-06-15-shared-vision-boundary-guards-review.md`.
- [ ] Fix only confirmed issues that belong to this task.
- [ ] Rerun:

```bash
node scripts/architecture-boundaries.test.mjs
npm test
npm run lint
npm run build
```

- [ ] Show final status:

```bash
git status --short
```

- [ ] Keep `docs/reviews/*.md` untracked unless the user explicitly asks to commit it.
- [ ] Merge to `main` only after implementation commit, self-tests, Claude review, fixes, and retests are complete.
