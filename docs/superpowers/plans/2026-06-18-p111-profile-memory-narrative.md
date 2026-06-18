# P1.11 Profile Memory Narrative Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. This is a light documentation/copy task; per user request, do not use TDD and do not add tests unless implementation scope expands beyond this plan.

**Goal:** 把 P1.8-P1.10 的云端学生画像记忆系统沉淀成清晰的面试叙事，并可选修正前端 evidence 文案中容易误解的“画像事件”口径。

**Architecture:** 不改变数据模型、API、画像投影或推荐算法。主线是文档叙事归并：把 `memory_events`、`student_profiles`、`/api/student-profile/evidence` 三层记忆链路讲成一个可验证的结构化 Agent memory 方案。可选 UI 改动只调整展示文案，不改变 evidence API 返回结构。

**Tech Stack:** Markdown 文档，Next.js/TypeScript 现有前端纯函数（仅当执行可选文案微调时）。

## Global Constraints

- 不改数据库表、migration、RLS、grant 或 Supabase RPC。
- 不改 `memory_delta` 契约。
- 不改 `student_profiles` 投影规则。
- 不新增 RAG、pgvector、Milvus、真实多用户、登录、老师端或画像详情面板。
- 不暴露完整 `memory_events`、`diagnosis_runs`、题目正文、学生答案、标准答案、图片内容或原始模型输出。
- 不补测试，不走 TDD；本计划的验证以文档审阅、精确 diff、`git diff --check` 和必要的 lint/build 为主。
- `docs/reviews/*.md` 默认本地保留，不提交。
- 保持 `sample_diagnosis` 稳定路径。

---

## File Structure

- Modify `interview/mathtrace-project-narrative.md`
  - 主文件。新增或重写一个“云端学生画像记忆系统总览”小节，把 P1.8-P1.10 串成统一叙事。
  - 保留已有 P1.8、P1.9、P1.10 阶段证据，不夸大状态。
- Optionally modify `src/components/workbench/profile-view-model.ts`
  - 仅当决定修正文案时，把“最近 N 条画像事件中”改为更准确的“最近 N 次已采信的画像记录中”或同等口径。
- Optionally modify `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - 仅当 UI 口径改动需要同步 PRD 展示文案时修改；否则不碰。

---

### Task 1: Consolidate P1.8-P1.10 Memory Narrative

**Files:**
- Modify: `interview/mathtrace-project-narrative.md`

**Goal:** 让面试叙事能一口气讲清楚 MathTrace 的 Agent memory 不是聊天记忆、不是错题本、不是 RAG，而是结构化学习画像记忆链路。

**Implementation Steps:**

- [ ] **Step 1: Locate current P1.8-P1.10 sections**

Run:

```bash
rg -n "P1\\.8|P1\\.9|P1\\.10|memory_events|student_profiles|student-profile/evidence|RAG|pgvector|Milvus" interview/mathtrace-project-narrative.md
```

Expected:

- Existing sections include `## 14. P1.8 云端当前画像快照`
- Existing sections include `## 15. P1.9 学生画像展示语义重构`
- Existing sections include `## 16. P1.10 真实画像证据接口`

- [ ] **Step 2: Add a short synthesis subsection before or inside P1.10**

Add a subsection titled:

```md
### P1.8-P1.10 记忆系统总览
```

Recommended placement: at the beginning of `## 16. P1.10 真实画像证据接口`, before `### 当前状态`, because P1.10 is the point where the memory chain becomes visible in the UI.

The subsection should include this content, adjusted only for local wording style:

````md
### P1.8-P1.10 记忆系统总览

P1.8-P1.10 可以作为 MathTrace 的“云端学生画像记忆系统”来讲，但要注意它不是通用聊天记忆，也不是 RAG。它的核心链路是：

```text
被采信的诊断证据
-> memory_events 画像变化事件
-> student_profiles 当前画像快照
-> /api/student-profile/evidence 推荐依据摘要
-> 前端画像区的复习优先级解释
```

这条链路里，`memory_events` 是事实账本，保存每次画像变化的原因和增量；`student_profiles` 是 read model，保存当前画像快照；`/api/student-profile/evidence` 是只读摘要接口，用最近画像事件解释为什么推荐某个复习重点。三者分工不同，不能互相替代。

错题本只回答“有哪些错题”；画像记忆回答“这些错题怎样长期影响学生画像”。RAG 未来可以回答“该召回哪些相似题或教材片段”；但 P1.8-P1.10 先解决的是结构化事实层和可解释画像依据。没有这个事实层，直接做 RAG 会让系统看起来更智能，却很难回答“画像为什么这么变”。

这套设计也有清晰边界：当前仍固定 `demo_student_001`，没有登录、真实多用户、老师端、用户级 RLS 策略、RAG、pgvector 或 Milvus；前端不直连数据库；service role key 只在服务端；不存完整图片 base64；不把模型输出直接当画像事实。
````

- [ ] **Step 3: Add an interview-ready answer**

In the P1.10 `### 推荐回答` section, expand the answer with this paragraph:

```md
如果面试官问“这个 Agent 的 memory 是怎么做的”，我会把它拆成三层：第一层是 `memory_events`，记录被采信诊断如何改变画像；第二层是 `student_profiles`，把事件投影成当前可读快照；第三层是 profile evidence API，把最近事件压缩成前端可展示的推荐依据。这样做的好处是，UI 可以快速读当前画像，面试时也能追溯每个建议背后的历史证据，而且不会把完整题目、答案或原始模型输出暴露给浏览器。
```

- [ ] **Step 4: Add “how to prove it is real” evidence**

In P1.10 `### 项目中的真实证据`, ensure these entries are present:

```md
- API：
  - `GET /api/student-profile`
  - `GET /api/student-profile/evidence`
- 数据：
  - `memory_events`
  - `student_profiles`
```

Keep existing code/test/doc/verification bullets. Do not remove P1.8 or P1.9 evidence.

- [ ] **Step 5: Verify narrative consistency**

Run:

```bash
rg -n "完整云端学生画像|完整历史|RAG|pgvector|Milvus|demo_student_001|service role|base64|student-profile/evidence" interview/mathtrace-project-narrative.md
```

Expected:

- Document says P1.8-P1.10 are still demo-scoped.
- Document does not claim real multi-user support.
- Document does not claim RAG/pgvector/Milvus is implemented.
- Document distinguishes `memory_events`, `student_profiles`, and evidence API.

---

### Task 2: Optional UI Copy Clarification

**Files:**
- Optionally modify: `src/components/workbench/profile-view-model.ts`
- Optionally modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`

**Goal:** 避免用户把“最近 N 条画像事件”误解成“最近 N 张上传图片”。

**Decision Gate:**

Only execute this task if the user confirms the UI copy should change now. If the user says “先不用管文案”， skip this task.

**Implementation Steps:**

- [ ] **Step 1: Find current copy**

Run:

```bash
rg -n "最近 .* 条画像事件|画像事件中|最近事件中" src/components/workbench/profile-view-model.ts docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md
```

Expected:

- `src/components/workbench/profile-view-model.ts` contains recommendation bullets using “最近 ${evidence.event_count} 条画像事件中”.

- [ ] **Step 2: Replace user-facing copy only**

In `src/components/workbench/profile-view-model.ts`, replace:

```ts
`最近 ${evidence.event_count} 条画像事件中，...`
```

with:

```ts
`结合最近 ${evidence.event_count} 次已采信的画像记录，...`
```

For cause copy, replace:

```ts
`相关错因“${matchingCause.cause.title}”在最近事件中新增 ${matchingCause.evidence.total_delta} 次。`
```

with:

```ts
`相关错因“${matchingCause.cause.title}”在这些画像记录中新增 ${matchingCause.evidence.total_delta} 次。`
```

Keep all data sources and matching logic unchanged.

- [ ] **Step 3: Decide whether PRD needs a wording note**

If PRD currently quotes the old copy, update it to the new wording. If PRD only describes behavior conceptually, do not modify it.

- [ ] **Step 4: Run lightweight verification**

Run:

```bash
npm run lint
npm run build
```

Expected:

- Both commands exit 0.
- No new tests are added for this copy-only change, per user request.

---

### Task 3: Review, Commit, And Handoff

**Files:**
- Review all files modified by Task 1 and optional Task 2.

**Goal:** Keep this P1.11 slice small and reviewable.

**Implementation Steps:**

- [ ] **Step 1: Inspect diff**

Run:

```bash
git diff -- interview/mathtrace-project-narrative.md src/components/workbench/profile-view-model.ts docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md
git diff --check
git status --short
```

Expected:

- Diff only includes the interview narrative and optional copy/PRD wording.
- No `docs/reviews/*.md`, `.env*`, generated artifacts, or unrelated files appear.
- `git diff --check` exits 0.

- [ ] **Step 2: Commit exact scope**

If only Task 1 is executed:

```bash
git add interview/mathtrace-project-narrative.md
git commit -m "docs: clarify profile memory narrative"
```

If Task 1 and Task 2 are executed:

```bash
git add interview/mathtrace-project-narrative.md src/components/workbench/profile-view-model.ts docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md
git commit -m "docs: clarify profile memory narrative"
```

Before running the second command, omit `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md` if it was not modified.

- [ ] **Step 3: Prepare Claude Code review prompt only if requested**

For this small task, Claude Code review is optional. If requested, use this prompt:

```text
请以代码/文档审查方式检查 MathTrace P1.11「画像记忆系统面试叙事与展示口径」改动。

审查范围：当前分支相对 main 的 diff。

重点检查：
1. interview/mathtrace-project-narrative.md 是否准确串联 P1.8-P1.10：memory_events、student_profiles、/api/student-profile/evidence 三层职责是否清楚。
2. 是否夸大当前能力，例如暗示已支持真实多用户、登录、老师端、RAG、pgvector、Milvus 或完整历史趋势。
3. 是否错误描述错题本、画像事件、当前画像快照、evidence API 的关系。
4. 如果有 UI 文案改动，是否只是文案口径变化，没有改变数据流、API 契约、画像投影或推荐算法。
5. 是否有无关改动、review 文档误提交、.env 或敏感信息风险。

不需要直接修改代码。请把审查意见写入：
docs/reviews/2026-06-18-p111-profile-memory-narrative-review.md

docs/reviews/*.md 默认本地保留，不提交。
```

---

## Acceptance Criteria

- `interview/mathtrace-project-narrative.md` 能把 P1.8-P1.10 讲成一条完整、诚实、可验证的云端学生画像记忆链路。
- 文档明确区分：
  - 错题本：题目列表。
  - `memory_events`：画像变化事件账本。
  - `student_profiles`：当前画像快照 read model。
  - `/api/student-profile/evidence`：推荐依据摘要。
  - RAG/pgvector/Milvus：未来检索增强，不是当前事实层。
- 文档不声称已支持真实多用户、登录、老师端、用户级 RLS、RAG、pgvector、Milvus 或完整历史趋势。
- 如果执行可选 UI 文案改动，页面文案不再容易把“画像事件”误解为“上传图片数量”。
- 不新增测试，符合用户对本小任务的加速要求。

## Execution Recommendation

推荐先只执行 Task 1 和 Task 3，不执行 Task 2。原因是用户刚说“先不用管这个文案”，当前更重要的是把面试叙事沉淀下来。Task 2 可以保留为后续一刀很小的 polish。
