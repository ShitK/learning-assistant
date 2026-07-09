# P2.12 Lightweight Multi-Agent Orchestration Design

## Goal

把 MathTrace 现有诊断链路从“一个诊断 pipeline 的实现表达”升级为“轻量多智能体职责编排”的代码结构。改动目标是让代码中真实存在并可测试的子智能体职责边界：`VisionExtractionAgent`、`MistakeDiagnosisAgent`、`LearningMemoryAgent`，再由现有 API service 作为受控编排入口顺序调用。

## Current Assumptions

- 当前分支是 `codex/p211-agent-chat-mvp-design`，已有 P2.11 题目会话窗口 MVP。
- 本次是代码层轻量架构重构，不改 UI。
- “真实多智能体”在本阶段定义为真实模块与接口拆分，不是 LangGraph / AutoGen / OpenAI Agents SDK 的 runtime。
- `sample_diagnosis` 仍是稳定演示路径，不能因为 agent 拆分引入 provider、数据库或网络依赖。
- 图片诊断仍必须先走视觉抽取与用户确认；未确认草稿不能写 `memory_events` 或 `student_profiles`。
- 学习记忆写入仍以现有 `memory_delta.should_persist`、证据策略、Supabase RPC 和画像投影规则为准。

## Non-Goals

- 不接入 LangGraph、AutoGen、OpenAI Agents SDK 或任何新的 agent framework。
- 不做 agent 自主决策、agent 间自由对话、长期任务 checkpoint、interrupt 或 handoff。
- 不做多题历史、聊天消息持久化、多用户登录、老师端或权限系统。
- 不改 Supabase schema、RPC payload、`memory_delta` schema、错题标签体系或 RAG/pgvector 逻辑。
- 不改前端布局、P2.11 题目会话 UI、右侧报告展示或现有 API response shape。
- 不把自由追问内容写入错题本、`memory_events`、`student_profiles` 或 localStorage 学生画像。

## Agent Responsibilities

### VisionExtractionAgent

负责图片进入诊断链路之前的结构化抽取。

- 输入：`ParsedImageDiagnoseRequest`、可选 `VisionExtractionProvider`。
- 行为：校验图片、选择 vision provider、构造 provider input、调用 `extractQuestionFromImage()`、把成功结果包装为 `stage: "extraction_review"` 的确认草稿。
- 输出：`DiagnoseImageExtractionResponse` 或 recoverable `DiagnoseApiResponse` error。
- 禁止：生成标准解法、错因标签、`memory_delta`、`student_profile`、错题本写入或画像写入。

### MistakeDiagnosisAgent

负责把已确认或预标注的题目上下文转成结构化诊断报告。

- 输入一：`ParsedSampleDiagnoseRequest`。
- 输入二：确认后的图片抽取草稿、确认 action、follow-up answer、可选 analysis enhancement。
- 行为：复用现有 `runMathTraceAgent()` 和 `runImageMathTraceAgent()` 的确定性规则，生成知识点映射、标准解法、错因、练习、复习计划和 `memory_delta`。
- 输出：`DiagnoseSuccessResponse` 或 `DiagnoseImageSuccessResponse`。
- 禁止：直接访问 Supabase、写错题本、同步 `student_profiles`、决定 provider 配置。

MVP 阶段它主要是对现有 `runMathTraceAgent()` / `runImageMathTraceAgent()` 的职责边界封装，不伪装成会自主推理或自主规划的 agent runtime。

### LearningMemoryAgent

负责确认后的结构化学习记忆写入。

- 输入：已经生成的 `DiagnoseSuccessResponse` / `DiagnoseImageSuccessResponse` 包装成 service result。
- 行为：复用 `persistDiagnosisResponse()`、`syncProjectedStudentProfile()` 和现有 warning 合并规则。
- 输出：原诊断结果，必要时追加数据库未配置、写入失败、重复题或画像同步失败 warning。
- 禁止：修改诊断内容、重新计算错因、读写前端 localStorage、处理聊天消息。

MVP 阶段它主要把既有持久化 gate、Supabase RPC 调用和 `student_profiles` 投影同步收口到单独模块，不新增写入策略。

## Orchestration Flow

### Sample Diagnosis

```text
POST /api/diagnose
-> parseDiagnoseRequest
-> MistakeDiagnosisAgent.runSample()
-> LearningMemoryAgent.persistIfNeeded()
-> return existing DiagnoseSuccessResponse
```

`sample_diagnosis` 不调用 `VisionExtractionAgent`，因为它使用预标注样例题，不涉及图片视觉抽取。

### Image Diagnosis Draft

```text
POST /api/diagnose
-> parseDiagnoseRequest
-> VisionExtractionAgent.run()
-> return extraction_review draft
```

此阶段只生成识别确认草稿，不进入 `MistakeDiagnosisAgent`，也不进入 `LearningMemoryAgent`。

### Confirmed Image Diagnosis

```text
POST /api/confirm
-> parse confirmed extraction
-> optional analysis provider display enhancement
-> MistakeDiagnosisAgent.runConfirmedImage()
-> LearningMemoryAgent.persistIfNeeded()
-> return existing DiagnoseImageSuccessResponse
```

## Files And Boundaries

Create:

- `src/lib/diagnosis/agents/diagnosis-agent-types.ts`
  - Shared lightweight service result type and dependency types for agent modules.
- `src/lib/diagnosis/agents/vision-extraction-agent.ts`
  - Owns image input validation, provider selection, provider error mapping, extraction review response creation.
- `src/lib/diagnosis/agents/mistake-diagnosis-agent.ts`
  - Owns sample and confirmed-image diagnosis role wrappers.
- `src/lib/diagnosis/agents/learning-memory-agent.ts`
  - Owns persistence gate invocation, profile projection sync and warning merging.

Modify:

- `src/lib/diagnosis/diagnose-service.ts`
  - Keep HTTP-level request parsing and route orchestration.
  - Delegate sample diagnosis to `MistakeDiagnosisAgent` and `LearningMemoryAgent`.
  - Delegate image draft extraction to `VisionExtractionAgent`.
  - Re-export `persistDiagnosisIfNeeded` if existing tests still import it, implemented as an alias to `LearningMemoryAgent`.
- `src/lib/diagnosis/confirm-service.ts`
  - Keep confirmation payload parsing and analysis-provider enhancement.
  - Delegate confirmed image diagnosis to `MistakeDiagnosisAgent`.
  - Delegate persistence to `LearningMemoryAgent`.
- `scripts/run-tests.mjs`
  - Add the new multi-agent orchestration test file to the default suite.
- `scripts/tests/diagnosis/multi-agent-orchestration.test.mjs`
  - Prove role modules exist, return equivalent results, and preserve trust boundaries.
- `scripts/tests/architecture/architecture-boundaries.test.mjs`
  - Enforce that client reachable code cannot import server-side agent modules and that each agent role does not import forbidden domains.
- `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - Add a concise P2.12 note.
- `interview/mathtrace-project-narrative.md`
  - Update from “多智能体职责包装” to “轻量多智能体职责编排已落地” with the same runtime caveat.
- `README.md`
  - Optional but recommended: update architecture wording from “受控 Agent 流程” to “轻量多智能体职责编排”.

## Data Flow And Trust Boundaries

- `VisionExtractionAgent` can see image data and provider debug metadata, but it cannot create `memory_delta` or `student_profile`.
- `MistakeDiagnosisAgent` can create structured diagnosis and `memory_delta`, but it cannot persist anything.
- `LearningMemoryAgent` can persist and sync profile projection, but only from already built diagnosis responses and existing gate logic.
- API services remain the external orchestration boundary; frontend components never import agent modules directly.
- Frontend still calls `/api/diagnose`, `/api/confirm`, `/api/mistake-book`, `/api/student-profile`, `/api/student-profile/evidence`.
- RAG/pgvector remains variant-practice retrieval only and is not part of this P2.12 refactor.

## Verification

Minimum verification after implementation:

- `node scripts/tests/diagnosis/multi-agent-orchestration.test.mjs`
- `node scripts/tests/architecture/architecture-boundaries.test.mjs`
- `node scripts/tests/diagnosis/agent-pipeline.test.mjs`
- `node scripts/tests/image-diagnosis/image-confirmation.test.mjs`
- `node scripts/tests/persistence/diagnosis-persistence.test.mjs`
- `npm test`
- `npm run build`

Expected behavioral invariants:

- `sample_diagnosis` response stays byte-for-byte equivalent for existing sample requests, except warning order must remain stable when persistence warnings are present.
- Image draft response still has `stage: "extraction_review"` and does not include `memory_delta` or `student_profile`.
- Confirmed image diagnosis still applies analysis enhancement only to display fields and does not let the analysis provider change `memory_delta`.
- Duplicate mistakes still append duplicate warning and do not update local demo profile unexpectedly.
- Supabase not configured still degrades to warning / empty reads and does not break main diagnosis flow.

## Interview Framing

After P2.12, the honest resume/interview wording becomes:

> 设计并落地轻量多智能体职责编排，将错题诊断拆分为视觉抽取 Agent、错因诊断 Agent 和学习记忆 Agent；当前使用受控顺序编排而非 LangGraph runtime，保证模型能力接入的同时，长期学习画像写入仍受用户确认、标签约束和证据校验控制。

If asked whether this is LangGraph:

> 不是。当前 MVP 没有复杂状态机、checkpoint 或 agent handoff。我先把职责边界落到代码模块和测试里，因为现阶段流程固定、稳定性和可解释性更重要。后续如果要做任务中断恢复、多 provider 路由或老师端报告 Agent，再引入 LangGraph 会更有价值。
