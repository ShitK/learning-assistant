# P2.6 RAG Artifacts Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `artifacts/rag` easier to inspect and safer to maintain by adding an inventory, committed documentation, and a dry-run-first organizer that archives obsolete experiment outputs without deleting core reviewed data.

**Architecture:** Treat `artifacts/rag` as a local ignored workspace, not as source code. Add committed scripts/tests/docs that classify known local artifacts, generate an inventory manifest, and optionally move obsolete experiment outputs into `_archive` only after an explicit `--apply --confirm organize-rag-artifacts`. Do not change the current RAG generation chain or product loader paths in P2.6.

**Tech Stack:** Node.js ESM scripts, existing `node:assert` tests, existing `scripts/run-tests.mjs` default suite, local filesystem operations under `artifacts/rag`.

## Global Constraints

- Do not commit `artifacts/**`, `docs/reviews/*.md`, `.env*`, PDF files, MinerU JSON, generated recommendation artifacts, or `.superpowers/sdd/**`.
- Do not delete `reviewed_practice_seed.json`（人工审核后的题库种子文件）, `practice_corpus.json`（正式练习题库文件）, `enriched_practice_corpus.json`（带标签增强题库文件）, or `variant-practice-agent/recommendations.json`（当前产品页读取的推荐结果文件）.
- Do not move active paths consumed by existing scripts or product code:
  - `artifacts/rag/practice-corpus/practice_corpus.json`
  - `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`
  - `artifacts/rag/variant-practice-agent/demo-query.json`
  - `artifacts/rag/variant-practice-agent/recommendations.json`
- Cleanup must be dry-run by default.
- Any mutating cleanup must require both `--apply` and `--confirm organize-rag-artifacts`.
- `derivative-pdf-spike`（早期扫描 PDF OCR spike 产物） may be archived, not deleted.
- `.DS_Store` files may be removed only in `--apply` mode.
- The plan must preserve `sample_diagnosis` and P2.5 product integration behavior.

---

## Current Artifact Snapshot

Observed on 2026-06-26:

| Path | Role | Suggested status |
|---|---|---|
| `artifacts/rag/MinerU-test/导数专题.json` | MinerU full parse JSON（原始精准解析结果） | Keep local source |
| `artifacts/rag/reviewed_practice_seed.json` | Manual reviewed seed（人工审核后的题库种子） | Keep core source |
| `artifacts/rag/practice-corpus/practice_corpus.json` | Practice corpus（正式练习题库 fixture） | Keep active output |
| `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json` | Enriched corpus（Agent 使用的带标签题库） | Keep active output |
| `artifacts/rag/variant-practice-agent/recommendations.json` | Product recommendation artifact（产品页读取的推荐结果） | Keep active output |
| `artifacts/rag/variant-practice-agent/index.html` | Local inspect page（本地检查页） | Keep regenerable output |
| `artifacts/rag/candidate-review/index.html` | Candidate review UI（题干审核静态页） | Keep useful review page |
| `artifacts/rag/tag-review/index.html` | Tag review UI（标签审核静态页） | Keep useful review page |
| `artifacts/rag/tag-proposals/*` | Rule proposal outputs（规则标签建议产物） | Keep regenerable output |
| `artifacts/rag/ai-tag-proposals/*` | AI proposal outputs（AI 标签建议产物） | Keep regenerable output |
| `artifacts/rag/tag-review/auto_tag_review_records.json` | Auto review records（自动审核记录） | Keep review evidence |
| `artifacts/rag/tag-review/tag_review_queue.json` | Review queue（人工复核队列） | Keep review evidence |
| `artifacts/rag/mineru-candidate-mapper/*` | MinerU candidate mapper output（MinerU 抽题中间产物） | Keep regenerable intermediate |
| `artifacts/rag/derivative-pdf-spike/*` | Early OCR spike output（早期 OCR spike 产物） | Archive candidate |
| `artifacts/rag/**/.DS_Store` | macOS Finder metadata（系统垃圾文件） | Remove candidate |

---

## File Structure

- Create `docs/rag-artifacts.md`
  - Committed documentation explaining each local artifact folder, whether it is source/review evidence/regenerable output/archive candidate, and which scripts consume it.
- Create `scripts/rag/rag-artifact-inventory-core.mjs`
  - Pure helpers for classifying known artifact paths and building an inventory from a file list.
- Create `scripts/rag/audit-rag-artifacts.mjs`
  - CLI to scan `artifacts/rag`, print a summary, and write `artifacts/rag/_manifest/rag_artifact_inventory.json`.
- Create `scripts/rag/organize-rag-artifacts.mjs`
  - CLI to dry-run or apply safe local cleanup: remove `.DS_Store`, archive `derivative-pdf-spike`.
- Create `scripts/tests/rag/rag-artifact-inventory-core.test.mjs`
  - Tests classification rules and summary counts using synthetic paths.
- Create `scripts/tests/rag/rag-artifact-organizer-cli.test.mjs`
  - Tests dry-run and apply behavior in a temp directory.
- Modify `scripts/run-tests.mjs`
  - Add both tests to the default suite near other RAG tooling tests.

---

## Task 1: Artifact Policy Documentation

**Files:**
- Create: `docs/rag-artifacts.md`

**Interfaces:**
- Consumes: current local `artifacts/rag` folder structure.
- Produces: committed human-readable artifact policy for future cleanup and onboarding.

- [ ] **Step 1: Create the artifact policy doc**

Create `docs/rag-artifacts.md`:

```md
# MathTrace RAG 本地 Artifacts 说明

`artifacts/rag` 是本地生成目录，已被 `.gitignore` 忽略，不进入 Git。它保存 P2.0-P2.5 的 PDF/MinerU 解析、人工审核、题库生成、标签建议、标签审核和变式练习推荐产物。

## 核心原则

- 不提交 `artifacts/**`。
- 不把真实 PDF、MinerU JSON、题库 artifact 或推荐结果放进 Git。
- 不删除人工审核成果，除非已经有明确备份。
- 可再生成的中间产物可以清理或重建，但要先 dry-run。
- 产品页当前只读取 `artifacts/rag/variant-practice-agent/recommendations.json`，缺失时会回退到预写练习题。

## 文件夹说明

| 路径 | 中文说明 | 类型 | 是否可再生成 | 处理策略 |
|---|---|---|---|---|
| `MinerU-test/导数专题.json` | MinerU 精准解析出的原始导数专题 JSON | 原始解析结果 | 需要重新上传/导出 | 保留 |
| `reviewed_practice_seed.json` | 人工审核并修正后的题库种子 | 人工审核成果 | 不应依赖重新人工生成 | 保留 |
| `practice-corpus/practice_corpus.json` | 从人工审核种子转换出的练习题库 | 活跃题库产物 | 可由 seed 再生成 | 保留 |
| `enriched-practice-corpus/enriched_practice_corpus.json` | 带标签增强题库，供 Agent 检索 | 活跃题库产物 | 可由 corpus + review records 再生成 | 保留 |
| `variant-practice-agent/recommendations.json` | 当前产品页读取的 3 道变式练习推荐 | 活跃推荐产物 | 可由 enriched corpus + demo query 再生成 | 保留 |
| `candidate-review/index.html` | 候选题题干审核静态页 | 本地审核 UI | 可再生成 | 保留或按需重建 |
| `tag-review/index.html` | 标签审核静态页 | 本地审核 UI | 可再生成 | 保留或按需重建 |
| `tag-proposals/*` | 规则标签建议 | 可再生成中间产物 | 可再生成 | 保留或按需重建 |
| `ai-tag-proposals/*` | AI 标签建议 | 可再生成中间产物 | 需要 provider 配置 | 保留 |
| `tag-review/auto_tag_review_records.json` | 自动通过的标签审核记录 | 审核证据 | 可由 proposals 再生成，但依赖当时规则 | 保留 |
| `tag-review/tag_review_queue.json` | 需要人工复核的标签队列 | 审核证据 | 可再生成，但可能随规则变化 | 保留 |
| `mineru-candidate-mapper/*` | MinerU JSON 抽题中间产物 | 可再生成中间产物 | 可由 MinerU JSON 再生成 | 保留 |
| `_manifest/*` | 本地 artifact inventory（清单元数据） | 整理元数据 | 可再生成 | 保留 |
| `_archive/*` | 已归档的历史 artifact | 历史归档 | 可手动恢复 | 保留 |
| `derivative-pdf-spike/*` | 早期 OCR spike 产物 | 历史实验产物 | 已被 MinerU 路径替代 | 可归档 |
| `**/.DS_Store` | macOS Finder 元数据 | 系统垃圾文件 | 无需保留 | 可删除 |

## 推荐整理方式

1. 先运行 `node scripts/rag/audit-rag-artifacts.mjs` 生成 inventory（清单）。
2. 再运行 `node scripts/rag/organize-rag-artifacts.mjs --dry-run` 查看将要清理的内容。
3. apply 前建议先备份 `artifacts/rag`，至少把 `artifacts/rag/derivative-pdf-spike` 复制一份到本地安全位置。
4. 确认无误后再运行 `node scripts/rag/organize-rag-artifacts.mjs --apply --confirm organize-rag-artifacts`。
5. 清理后重新跑 P2.5 product view model smoke，确认产品页仍能显示 3 道推荐题。
```

- [ ] **Step 2: Verify documentation wording**

Run:

```bash
rg -n "TODO|TBD|delete|删除" docs/rag-artifacts.md
```

Expected:

```text
```

No `TODO` or `TBD`; any `delete/删除` wording must refer only to `.DS_Store`, not core JSON artifacts.

- [ ] **Step 3: Commit**

```bash
git add docs/rag-artifacts.md
git commit -m "docs: describe rag artifact policy"
```

---

## Task 2: Artifact Inventory CLI

**Files:**
- Create: `scripts/rag/rag-artifact-inventory-core.mjs`
- Create: `scripts/rag/audit-rag-artifacts.mjs`
- Create: `scripts/tests/rag/rag-artifact-inventory-core.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Produces:
  - `classifyRagArtifactPath(relativePath: string): { status: string; role: string; action: string }`
  - `buildRagArtifactInventory(paths: string[]): { generated_at: string; item_count: number; items: Array<...>; summary: Record<string, number> }`
  - CLI output file: `artifacts/rag/_manifest/rag_artifact_inventory.json`

- [ ] **Step 1: Write failing core test**

Create `scripts/tests/rag/rag-artifact-inventory-core.test.mjs`:

```js
import assert from "node:assert/strict";
import {
  buildRagArtifactInventory,
  classifyRagArtifactPath,
} from "../../rag/rag-artifact-inventory-core.mjs";

assert.deepEqual(classifyRagArtifactPath("reviewed_practice_seed.json"), {
  status: "keep",
  role: "manual_review_source",
  action: "preserve",
});

assert.deepEqual(classifyRagArtifactPath("practice-corpus/practice_corpus.json"), {
  status: "keep",
  role: "active_practice_corpus",
  action: "preserve",
});

assert.deepEqual(
  classifyRagArtifactPath("enriched-practice-corpus/enriched_practice_corpus.json"),
  {
    status: "keep",
    role: "active_enriched_corpus",
    action: "preserve",
  },
);

assert.deepEqual(
  classifyRagArtifactPath("variant-practice-agent/recommendations.json"),
  {
    status: "keep",
    role: "active_product_recommendations",
    action: "preserve",
  },
);

assert.deepEqual(classifyRagArtifactPath("variant-practice-agent/demo-query.json"), {
  status: "keep",
  role: "active_demo_query",
  action: "preserve",
});

assert.deepEqual(classifyRagArtifactPath("_manifest/rag_artifact_inventory.json"), {
  status: "keep",
  role: "inventory_metadata",
  action: "preserve",
});

assert.deepEqual(
  classifyRagArtifactPath("_archive/legacy-ocr-spike/derivative-pdf-spike/candidate_questions.json"),
  {
    status: "keep",
    role: "archived_artifacts",
    action: "preserve",
  },
);

assert.deepEqual(classifyRagArtifactPath("mineru-derivative-smoke/result.json"), {
  status: "keep",
  role: "mineru_source_parse",
  action: "preserve",
});

assert.deepEqual(classifyRagArtifactPath("derivative-pdf-spike/candidate_questions.json"), {
  status: "archive_candidate",
  role: "legacy_ocr_spike",
  action: "archive_directory",
});

assert.deepEqual(classifyRagArtifactPath("candidate-review/index.html"), {
  status: "keep",
  role: "local_review_ui",
  action: "preserve_or_regenerate",
});

assert.deepEqual(classifyRagArtifactPath("tag-review/auto_tag_review_records.json"), {
  status: "keep",
  role: "tag_review_evidence",
  action: "preserve",
});

assert.deepEqual(classifyRagArtifactPath(".DS_Store"), {
  status: "remove_candidate",
  role: "macos_metadata",
  action: "remove_file",
});

const inventory = buildRagArtifactInventory([
  "reviewed_practice_seed.json",
  "practice-corpus/practice_corpus.json",
  "derivative-pdf-spike/candidate_questions.json",
  "_manifest/rag_artifact_inventory.json",
  "_archive/legacy-ocr-spike/README.md",
  ".DS_Store",
]);

assert.equal(inventory.item_count, 6);
assert.equal(inventory.summary.keep, 4);
assert.equal(inventory.summary.archive_candidate, 1);
assert.equal(inventory.summary.remove_candidate, 1);
assert.equal(inventory.items[0].path, ".DS_Store");

console.log("rag artifact inventory core tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/tests/rag/rag-artifact-inventory-core.test.mjs
```

Expected: FAIL with module not found for `scripts/rag/rag-artifact-inventory-core.mjs`.

- [ ] **Step 3: Implement inventory core**

Create `scripts/rag/rag-artifact-inventory-core.mjs`:

```js
const exactRules = new Map([
  ["reviewed_practice_seed.json", ["keep", "manual_review_source", "preserve"]],
  ["practice-corpus/practice_corpus.json", ["keep", "active_practice_corpus", "preserve"]],
  [
    "enriched-practice-corpus/enriched_practice_corpus.json",
    ["keep", "active_enriched_corpus", "preserve"],
  ],
  [
    "variant-practice-agent/recommendations.json",
    ["keep", "active_product_recommendations", "preserve"],
  ],
  ["variant-practice-agent/demo-query.json", ["keep", "active_demo_query", "preserve"]],
  ["tag-review/auto_tag_review_records.json", ["keep", "tag_review_evidence", "preserve"]],
  ["tag-review/tag_review_queue.json", ["keep", "tag_review_evidence", "preserve"]],
]);

const prefixRules = [
  ["derivative-pdf-spike/", "archive_candidate", "legacy_ocr_spike", "archive_directory"],
  ["_manifest/", "keep", "inventory_metadata", "preserve"],
  ["_archive/", "keep", "archived_artifacts", "preserve"],
  ["MinerU-test/", "keep", "mineru_source_parse", "preserve"],
  ["mineru-derivative-smoke/", "keep", "mineru_source_parse", "preserve"],
  ["candidate-review/", "keep", "local_review_ui", "preserve_or_regenerate"],
  ["tag-review/", "keep", "tag_review_workspace", "preserve_or_regenerate"],
  ["tag-proposals/", "keep", "rule_tag_proposals", "preserve_or_regenerate"],
  ["ai-tag-proposals/", "keep", "ai_tag_proposals", "preserve"],
  ["mineru-candidate-mapper/", "keep", "mineru_candidate_intermediate", "preserve_or_regenerate"],
  ["practice-corpus/", "keep", "practice_corpus_workspace", "preserve_or_regenerate"],
  ["enriched-practice-corpus/", "keep", "enriched_corpus_workspace", "preserve_or_regenerate"],
  ["variant-practice-agent/", "keep", "variant_practice_workspace", "preserve_or_regenerate"],
];

export function classifyRagArtifactPath(relativePath) {
  if (relativePath.endsWith(".DS_Store")) {
    return {
      status: "remove_candidate",
      role: "macos_metadata",
      action: "remove_file",
    };
  }

  const exactRule = exactRules.get(relativePath);
  if (exactRule) {
    return toClassification(exactRule);
  }

  const prefixRule = prefixRules.find(([prefix]) => relativePath.startsWith(prefix));
  if (prefixRule) {
    return toClassification(prefixRule.slice(1));
  }

  return {
    status: "unknown",
    role: "unclassified",
    action: "manual_review",
  };
}

export function buildRagArtifactInventory(paths, generatedAt = new Date().toISOString()) {
  const items = [...paths]
    .sort((left, right) => left.localeCompare(right))
    .map((path) => ({
      path,
      ...classifyRagArtifactPath(path),
    }));

  const summary = items.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    inventory_version: "rag-artifact-inventory-v0",
    generated_at: generatedAt,
    item_count: items.length,
    summary,
    items,
  };
}

function toClassification([status, role, action]) {
  return { status, role, action };
}
```

- [ ] **Step 4: Implement audit CLI**

Create `scripts/rag/audit-rag-artifacts.mjs`:

```js
#!/usr/bin/env node
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { buildRagArtifactInventory } from "./rag-artifact-inventory-core.mjs";

const artifactRoot = getArgValue("--root") ?? "artifacts/rag";
const outputPath =
  getArgValue("--out") ?? join(artifactRoot, "_manifest/rag_artifact_inventory.json");

const files = await listFiles(artifactRoot);
const relativeFiles = files.map((filePath) => relative(artifactRoot, filePath));
const inventory = buildRagArtifactInventory(relativeFiles);

await mkdir(join(artifactRoot, "_manifest"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);

console.log(`Inventory items: ${inventory.item_count}`);
console.log(`Keep: ${inventory.summary.keep ?? 0}`);
console.log(`Archive candidates: ${inventory.summary.archive_candidate ?? 0}`);
console.log(`Remove candidates: ${inventory.summary.remove_candidate ?? 0}`);
console.log(`Unknown: ${inventory.summary.unknown ?? 0}`);
console.log(`Wrote ${outputPath}`);

async function listFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
      continue;
    }
    files.push(fullPath);
  }

  return files.sort();
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
```

- [ ] **Step 5: Register test**

Modify `scripts/run-tests.mjs`, adding after `variant-practice-product-loader.test.mjs`:

```js
"scripts/tests/rag/rag-artifact-inventory-core.test.mjs",
```

- [ ] **Step 6: Run verification**

Run:

```bash
node scripts/tests/rag/rag-artifact-inventory-core.test.mjs
node scripts/rag/audit-rag-artifacts.mjs --root artifacts/rag
node scripts/run-tests.mjs default
```

Expected:

```text
rag artifact inventory core tests passed
Inventory items: ...
Archive candidates: ...
Remove candidates: ...
...
demo state regression test passed
```

- [ ] **Step 7: Commit**

```bash
git add scripts/rag/rag-artifact-inventory-core.mjs \
  scripts/rag/audit-rag-artifacts.mjs \
  scripts/tests/rag/rag-artifact-inventory-core.test.mjs \
  scripts/run-tests.mjs
git commit -m "feat: add rag artifact inventory audit"
```

---

## Task 3: Dry-Run-First Organizer CLI

**Files:**
- Create: `scripts/rag/organize-rag-artifacts.mjs`
- Create: `scripts/tests/rag/rag-artifact-organizer-cli.test.mjs`
- Modify: `scripts/run-tests.mjs`

**Interfaces:**
- Consumes:
  - `classifyRagArtifactPath(relativePath)`
- Produces:
  - CLI dry-run report.
  - Optional archive directory: `artifacts/rag/_archive/legacy-ocr-spike/derivative-pdf-spike`.
  - Optional removal of `.DS_Store` files.

- [ ] **Step 1: Write failing organizer CLI test**

Create `scripts/tests/rag/rag-artifact-organizer-cli.test.mjs`:

```js
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const tmpRoot = await mkdtemp(join(tmpdir(), "rag-artifact-organizer-"));
const artifactRoot = join(tmpRoot, "artifacts/rag");
mkdirSync(join(artifactRoot, "derivative-pdf-spike"), { recursive: true });
mkdirSync(join(artifactRoot, "practice-corpus"), { recursive: true });
mkdirSync(join(artifactRoot, "enriched-practice-corpus"), { recursive: true });
mkdirSync(join(artifactRoot, "tag-review"), { recursive: true });
mkdirSync(join(artifactRoot, "ai-tag-proposals"), { recursive: true });
writeFileSync(join(artifactRoot, "derivative-pdf-spike/candidate_questions.json"), "{}\n");
writeFileSync(join(artifactRoot, "practice-corpus/practice_corpus.json"), "{}\n");
writeFileSync(join(artifactRoot, "enriched-practice-corpus/enriched_practice_corpus.json"), "{}\n");
writeFileSync(join(artifactRoot, "tag-review/auto_tag_review_records.json"), "[]\n");
writeFileSync(join(artifactRoot, "ai-tag-proposals/candidate_ai_tag_proposals.json"), "{}\n");
writeFileSync(join(artifactRoot, ".DS_Store"), "finder");

const dryRun = spawnSync(
  process.execPath,
  ["scripts/rag/organize-rag-artifacts.mjs", "--root", artifactRoot, "--dry-run"],
  { cwd: process.cwd(), encoding: "utf8" },
);

assert.equal(dryRun.status, 0);
assert.match(dryRun.stdout, /DRY RUN/);
assert.match(dryRun.stdout, /Recognized 4 keep files/);
assert.match(dryRun.stdout, /archive_directory/);
assert.match(dryRun.stdout, /remove_file/);
assert.equal(existsSync(join(artifactRoot, "derivative-pdf-spike/candidate_questions.json")), true);
assert.equal(existsSync(join(artifactRoot, ".DS_Store")), true);

const rejectedApply = spawnSync(
  process.execPath,
  ["scripts/rag/organize-rag-artifacts.mjs", "--root", artifactRoot, "--apply"],
  { cwd: process.cwd(), encoding: "utf8" },
);
assert.notEqual(rejectedApply.status, 0);
assert.match(rejectedApply.stderr, /--confirm organize-rag-artifacts/);

const applied = spawnSync(
  process.execPath,
  [
    "scripts/rag/organize-rag-artifacts.mjs",
    "--root",
    artifactRoot,
    "--apply",
    "--confirm",
    "organize-rag-artifacts",
  ],
  { cwd: process.cwd(), encoding: "utf8" },
);

assert.equal(applied.status, 0);
assert.equal(existsSync(join(artifactRoot, "derivative-pdf-spike")), false);
assert.equal(existsSync(join(artifactRoot, ".DS_Store")), false);
assert.equal(existsSync(join(artifactRoot, "practice-corpus/practice_corpus.json")), true);
assert.equal(existsSync(join(artifactRoot, "enriched-practice-corpus/enriched_practice_corpus.json")), true);
assert.equal(existsSync(join(artifactRoot, "tag-review/auto_tag_review_records.json")), true);
assert.equal(existsSync(join(artifactRoot, "ai-tag-proposals/candidate_ai_tag_proposals.json")), true);
assert.equal(
  existsSync(join(artifactRoot, "_archive/legacy-ocr-spike/derivative-pdf-spike/candidate_questions.json")),
  true,
);
const archiveReadme = readFileSync(join(artifactRoot, "_archive/legacy-ocr-spike/README.md"), "utf8");
assert.match(archiveReadme, /legacy OCR spike/);
assert.match(archiveReadme, /archived_from: artifacts\/rag\/derivative-pdf-spike/);
assert.match(archiveReadme, /archived_at:/);

const postAudit = spawnSync(
  process.execPath,
  ["scripts/rag/audit-rag-artifacts.mjs", "--root", artifactRoot],
  { cwd: process.cwd(), encoding: "utf8" },
);
assert.equal(postAudit.status, 0);
assert.match(postAudit.stdout, /Unknown: 0/);

const missingRoot = spawnSync(
  process.execPath,
  ["scripts/rag/organize-rag-artifacts.mjs", "--root", join(tmpRoot, "missing"), "--dry-run"],
  { cwd: process.cwd(), encoding: "utf8" },
);
assert.equal(missingRoot.status, 0);
assert.match(missingRoot.stdout, /Recognized 0 keep files/);

await rm(tmpRoot, { recursive: true, force: true });

console.log("rag artifact organizer cli tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/tests/rag/rag-artifact-organizer-cli.test.mjs
```

Expected: FAIL with module not found for `scripts/rag/organize-rag-artifacts.mjs`.

- [ ] **Step 3: Implement organizer CLI**

Create `scripts/rag/organize-rag-artifacts.mjs`:

```js
#!/usr/bin/env node
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { classifyRagArtifactPath } from "./rag-artifact-inventory-core.mjs";

const artifactRoot = getArgValue("--root") ?? "artifacts/rag";
const isApply = process.argv.includes("--apply");
const isDryRun = process.argv.includes("--dry-run") || !isApply;
const confirmValue = getArgValue("--confirm");

if (isApply && confirmValue !== "organize-rag-artifacts") {
  console.error("Mutating cleanup requires --confirm organize-rag-artifacts");
  process.exit(1);
}

const files = await listFiles(artifactRoot);
const relativeFiles = files.map((filePath) => relative(artifactRoot, filePath));
const removableFiles = relativeFiles.filter(
  (filePath) => classifyRagArtifactPath(filePath).action === "remove_file",
);
const keepFileCount = relativeFiles.filter(
  (filePath) => classifyRagArtifactPath(filePath).status === "keep",
).length;
const shouldArchiveLegacySpike =
  existsSync(join(artifactRoot, "derivative-pdf-spike")) &&
  relativeFiles.some((filePath) => filePath.startsWith("derivative-pdf-spike/"));

const archiveRoot = join(artifactRoot, "_archive/legacy-ocr-spike");
const archivedAt = new Date().toISOString();

console.log(isDryRun ? "DRY RUN: no files will be changed." : "APPLY: organizing local artifacts.");
console.log(
  `Recognized ${keepFileCount} keep files; no changes to active practice-corpus, enriched-practice-corpus, tag-review, ai-tag-proposals, or variant-practice-agent outputs.`,
);

for (const filePath of removableFiles) {
  console.log(`remove_file ${filePath}`);
  if (isApply) {
    await rm(join(artifactRoot, filePath), { force: true });
  }
}

if (shouldArchiveLegacySpike) {
  console.log("archive_directory derivative-pdf-spike -> _archive/legacy-ocr-spike/derivative-pdf-spike");
  if (isApply) {
    await mkdir(archiveRoot, { recursive: true });
    await writeFile(
      join(archiveRoot, "README.md"),
      [
        "# Archived legacy OCR spike",
        "",
        "archived_from: artifacts/rag/derivative-pdf-spike",
        `archived_at: ${archivedAt}`,
        "",
        "This folder stores the early derivative PDF OCR spike output.",
        "It was archived because the current P2 RAG chain uses MinerU JSON -> candidate mapper -> reviewed seed.",
        "To restore it manually, move `_archive/legacy-ocr-spike/derivative-pdf-spike` back to `artifacts/rag/derivative-pdf-spike`.",
        "",
      ].join("\n"),
    );
    await rm(join(archiveRoot, "derivative-pdf-spike"), { recursive: true, force: true });
    await rename(
      join(artifactRoot, "derivative-pdf-spike"),
      join(archiveRoot, "derivative-pdf-spike"),
    );
  }
}

async function listFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
      continue;
    }
    files.push(fullPath);
  }

  return files.sort();
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
```

- [ ] **Step 4: Register test**

Modify `scripts/run-tests.mjs`, adding after `rag-artifact-inventory-core.test.mjs`:

```js
"scripts/tests/rag/rag-artifact-organizer-cli.test.mjs",
```

- [ ] **Step 5: Run verification**

Run:

```bash
node scripts/tests/rag/rag-artifact-organizer-cli.test.mjs
node scripts/rag/organize-rag-artifacts.mjs --root artifacts/rag --dry-run
node scripts/run-tests.mjs default
```

Expected:

```text
rag artifact organizer cli tests passed
DRY RUN: no files will be changed.
...
demo state regression test passed
```

- [ ] **Step 6: Commit**

```bash
git add scripts/rag/organize-rag-artifacts.mjs \
  scripts/tests/rag/rag-artifact-organizer-cli.test.mjs \
  scripts/run-tests.mjs
git commit -m "feat: add safe rag artifact organizer"
```

---

## Task 4: Local Cleanup Application And Product Smoke

**Files:**
- No committed code files required unless Task 4 discovers documentation drift.
- Mutates ignored local files under `artifacts/rag` only after explicit dry-run review.

**Interfaces:**
- Consumes:
  - `node scripts/rag/audit-rag-artifacts.mjs`
  - `node scripts/rag/organize-rag-artifacts.mjs`
  - P2.5 product loader `readVariantPracticeProductRecommendations()`
- Produces:
  - Updated ignored local `artifacts/rag/_manifest/rag_artifact_inventory.json`
  - Optional ignored archive folder `artifacts/rag/_archive/legacy-ocr-spike/`

- [ ] **Step 1: Generate inventory**

Run:

```bash
node scripts/rag/audit-rag-artifacts.mjs --root artifacts/rag
```

Expected:

```text
Inventory items: ...
Keep: ...
Archive candidates: ...
Remove candidates: ...
Unknown: 0
Wrote artifacts/rag/_manifest/rag_artifact_inventory.json
```

If `Unknown` is not `0`, stop and classify the unknown path before applying cleanup.

- [ ] **Step 2: Dry-run organizer**

Run:

```bash
node scripts/rag/organize-rag-artifacts.mjs --root artifacts/rag --dry-run
```

Expected:

```text
DRY RUN: no files will be changed.
remove_file .DS_Store
remove_file candidate-review/.DS_Store
remove_file derivative-pdf-spike/.DS_Store
archive_directory derivative-pdf-spike -> _archive/legacy-ocr-spike/derivative-pdf-spike
```

- [ ] **Step 3: Apply organizer only after dry-run is accepted**

Run only if the dry-run output is accepted:

Before applying, make an independent local backup of `artifacts/rag` or at least `artifacts/rag/derivative-pdf-spike`.

```bash
node scripts/rag/organize-rag-artifacts.mjs \
  --root artifacts/rag \
  --apply \
  --confirm organize-rag-artifacts
```

Expected:

```text
APPLY: organizing local artifacts.
...
```

- [ ] **Step 4: Regenerate inventory after cleanup**

Run:

```bash
node scripts/rag/audit-rag-artifacts.mjs --root artifacts/rag
```

Expected:

```text
Archive candidates: 0
Remove candidates: 0
Unknown: 0
```

If `Archive candidates`, `Remove candidates`, or `Unknown` is not `0`, stop and inspect `artifacts/rag/_manifest/rag_artifact_inventory.json`.

- [ ] **Step 5: Verify active RAG/product artifacts still work**

Run:

```bash
node --input-type=module - <<'NODE'
import { createProjectJiti } from "./scripts/test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { readVariantPracticeProductRecommendations } = jiti(
  "./src/lib/server/rag/variant-practice-product-loader.ts",
);
const viewModel = await readVariantPracticeProductRecommendations();
console.log(JSON.stringify({
  count: viewModel?.items.length ?? 0,
  titles: viewModel?.items.map((item) => item.title) ?? [],
  hasNotice: Boolean(viewModel?.notice),
}, null, 2));
NODE
```

Expected:

```json
{
  "count": 3,
  "titles": ["巩固题", "近迁移题", "补充练习题"],
  "hasNotice": true
}
```

- [ ] **Step 6: Full verification**

Run:

```bash
node scripts/run-tests.mjs default
npm run lint
npm run build
git diff --check
git status --short
git ls-files artifacts docs/reviews .env .env.local
```

Expected:

- Tests, lint, and build pass.
- `git diff --check` prints nothing.
- `git status --short` shows only committed code/docs/test files if any remain.
- `git ls-files artifacts docs/reviews .env .env.local` prints nothing.

- [ ] **Step 7: Commit only committed docs/scripts/tests if needed**

Do not stage `artifacts/**`.

```bash
git status --short
git add docs/rag-artifacts.md \
  scripts/rag/rag-artifact-inventory-core.mjs \
  scripts/rag/audit-rag-artifacts.mjs \
  scripts/rag/organize-rag-artifacts.mjs \
  scripts/tests/rag/rag-artifact-inventory-core.test.mjs \
  scripts/tests/rag/rag-artifact-organizer-cli.test.mjs \
  scripts/run-tests.mjs
git commit -m "chore: organize rag artifact tooling"
```

---

## Final Verification Checklist

Run before asking for Claude Code review:

```bash
node scripts/run-tests.mjs default
npm run lint
npm run build
git diff --check
git status --short
git ls-files artifacts docs/reviews .env .env.local
```

Manual checks:

- Open `artifacts/rag/_manifest/rag_artifact_inventory.json` and confirm all active files are `status: "keep"`.
- Confirm `artifacts/rag/reviewed_practice_seed.json` still exists.
- Confirm `artifacts/rag/practice-corpus/practice_corpus.json` still exists.
- Confirm `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json` still exists.
- Confirm `artifacts/rag/variant-practice-agent/recommendations.json` still exists.
- Confirm product page still shows 3 variant practice cards.

---

## Self-Review

- Spec coverage: This plan covers documentation, inventory generation, dry-run cleanup, guarded apply mode, local product smoke, and Git boundary checks.
- Scope check: This plan does not change RAG retrieval, P2.5 product integration, AI tag proposal, taxonomy, corpus generation, database schema, pgvector, embeddings, or image/PDF parsing.
- Safety check: No core reviewed or active artifact is deleted or moved. Only `.DS_Store` removal and `derivative-pdf-spike` archival are allowed in apply mode.
- Placeholder scan: No `TODO` / `TBD` placeholders are required for implementation.
