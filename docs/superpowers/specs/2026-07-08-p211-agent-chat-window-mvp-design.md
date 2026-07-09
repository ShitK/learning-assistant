# P2.11 题目会话窗口 MVP Design Spec

## 1. 背景

当前 MathTrace 工作台已经具备以下能力：

```text
样例题诊断
图片上传 -> 识别草稿 -> 用户确认 -> /api/confirm -> 结构化诊断报告
低证据快速追问
标准解法、错因、画像变化、变式练习、7 天建议
```

但左侧输入区仍是表单式体验：用户先在“样例题 / 图片诊断”之间切换，再点击按钮触发诊断。这个形态能稳定演示完整 pipeline，但不像一个学习 Agent 正在围绕错题和学生对话。

P2.11 的目标是把左侧输入区升级为“题目会话窗口”MVP：学生可以在同一个窗口里上传图片、确认识别结果、确认错因或卡点，并继续追问当前题目的解法。右侧和下方的结构化结果卡片继续保留，避免把正式报告塞进聊天气泡里。

## 2. 目标

- 把左侧 `MistakeInputCard` 的主要体验改为题目会话窗口。
- 复用现有图片上传、识别草稿、确认、低证据追问和 `/api/confirm` 链路。
- 保持右侧 `DiagnosisResultCard` 作为正式“标准解法与错因”报告区。
- 保持下方 `PracticeLab`、`ProfileInsights`、`ReviewPath`、`MistakeBookPanel` 的现有信息架构。
- 支持围绕当前题目的轻量追问，例如“为什么要分类讨论”“这一步我没看懂”“换一种讲法”。
- 明确追问回答是展示增强，不直接写 `memory_events`、`student_profiles`、错题本或 localStorage。
- 保持 `sample_diagnosis` 稳定演示路径可用。

## 3. 明确不做

P2.11 MVP 不做以下内容：

- 不实现完整多题聊天历史。
- 不新增账号、登录、真实多用户 session。
- 不把聊天消息持久化到数据库。
- 不让自由聊天直接修改 `memory_delta` 或学生画像。
- 不改变 `memory_events -> student_profiles` 的事实链。
- 不改变 `/api/diagnose`、`/api/confirm` 现有核心契约，除非实现追问 API 时新增独立接口。
- 不把 `PracticeLab`、`ProfileInsights`、`ReviewPath` 全部挪到右侧一个框里。
- 不做 SSE 流式输出。
- 不引入 LangGraph、OpenAI Agents SDK、Vercel AI SDK 或新的前端组件库。
- 不把 RAG/pgvector 用作当前题目的画像写入判断。

## 4. 推荐方案

采用“单题会话窗口 MVP”。

页面结构保持：

```text
上方：Header + AgentTimeline

首屏主体：
左侧：题目会话窗口
右侧：标准解法与错因报告

下方：
变式练习
画像变化
7 天建议
错题本
```

左侧题目会话窗口只承载交互过程：

```text
上传图片 / 选择样例题
-> Agent 返回识别草稿
-> 学生编辑并确认
-> Agent 生成正式报告
-> 学生围绕当前题目继续追问
```

正式诊断结果仍由结构化卡片展示。聊天窗口可以引用“右侧报告已更新”“我根据你的确认生成了解法”，但不把完整标准解法、画像变化、变式练习和 7 天建议复制进聊天流。

## 5. 交互设计

### 5.1 会话消息类型

第一版只需要本地前端消息模型：

```ts
type ProblemChatMessage =
  | { role: "agent"; kind: "welcome"; text: string }
  | { role: "student"; kind: "sample_selected"; text: string }
  | { role: "student"; kind: "image_uploaded"; file_name: string; preview_url: string }
  | { role: "agent"; kind: "extraction_review"; text: string }
  | { role: "student"; kind: "extraction_confirmed"; text: string }
  | { role: "agent"; kind: "diagnosis_ready"; text: string }
  | { role: "student"; kind: "follow_up_question"; text: string }
  | { role: "agent"; kind: "follow_up_answer"; text: string }
  | { role: "agent"; kind: "error"; text: string };
```

MVP 可以把消息保存在 `MathTraceWorkbench` 的 React state 中。刷新页面后丢失是可接受的，因为本阶段不做持久化聊天历史。

### 5.2 左侧窗口状态

会话窗口围绕当前题目维护几个明确状态：

```text
idle
image_preparing
extracting_image
reviewing_extraction
diagnosing
report_ready
error
```

这些状态不替代现有业务状态，而是把现有状态用更像对话的方式呈现。实现时应优先复用当前 `selectedImage`、`editableExtractionDraft`、`pendingFollowUpAnswer`、`isRequestPending`、`apiErrorMessage` 等状态，避免引入一套平行状态机。

### 5.3 样例题入口

样例题入口保留，但不再像传统列表表单。第一版可以表现为会话窗口顶部的紧凑操作：

```text
选择样例题
上传图片
```

选择样例题后追加一条学生消息，例如“我想看样例题：导数与分类讨论”，然后复用现有 `requestSampleDiagnosis` 和右侧报告卡片。

### 5.4 图片上传与确认

上传图片后，左侧追加学生图片消息，展示缩略图和文件名。

识别完成后，Agent 消息中展示“我识别到了题干和学生步骤，请确认”。可编辑确认表单仍保留，但作为 Agent 消息内的交互块，而不是整张输入卡下方的表单。

确认后调用现有 `/api/confirm`，右侧报告更新。

低证据 `problem_only` 路径继续使用现有快速追问设计：学生可以跳过，也可以选择卡点或输入一句话。用户确认卡点分析前，不写具体错因画像。

### 5.5 当前题目追问

报告生成后，左侧底部出现追问输入框。MVP 追问只围绕当前诊断结果，不开启跨题上下文。

追问输入示例：

```text
为什么这里要分类讨论？
第 2 步我没看懂
能用更简单的说法解释标准解法吗？
这类题下次怎么避免？
```

追问回答可以有两种实现层级：

- MVP-A：先做本地模板回答。根据当前 `DiagnosisViewModel` 中的 `standard_solution`、`solution_highlights`、`step_analysis`、`mistake_causes` 生成保守解释。
- MVP-B：新增只读追问 API，让 text analysis provider 基于当前诊断摘要回答，但输出只用于展示，不参与画像写入。

推荐先实现 MVP-A。如果体验明显不够，再单独扩展 MVP-B。

## 6. 数据流

### 6.1 样例题

```text
student selects sample
-> append local chat message
-> requestSampleDiagnosis()
-> createSampleDiagnosisViewModel()
-> update DiagnosisResultCard / PracticeLab / ProfileInsights / ReviewPath
-> append agent "report ready" message
```

### 6.2 图片题

```text
student uploads image
-> ImageUploadPanel prepareImageForDiagnosis()
-> append image message
-> requestImageExtractionReview()
-> editable extraction draft
-> student confirms / edits
-> requestConfirmedImageDiagnosis()
-> createImageDiagnosisViewModel()
-> shouldPersistDiagnoseProfile() gate
-> update right-side and lower result cards
-> append agent "report ready" message
```

### 6.3 追问

MVP-A：

```text
student asks follow-up
-> append student message
-> local helper builds answer from current DiagnosisViewModel
-> append agent answer
```

MVP-B future extension：

```text
student asks follow-up
-> POST /api/diagnosis-follow-up
-> server validates question and diagnosis summary
-> optional text analysis provider answer
-> schema / length guard
-> return display-only answer
```

MVP-B 的 API 不写数据库，不返回 `memory_delta`，不更新 `student_profile`。

## 7. 模块边界

建议文件边界：

- `src/components/workbench/problem-chat-card.tsx`
  - 新增左侧题目会话窗口组件。
  - 只负责渲染消息、上传入口、确认表单、追问输入和按钮状态。

- `src/components/workbench/problem-chat-message.tsx`
  - 可选拆分：渲染单条消息、图片预览、Agent 状态。

- `src/lib/demo/problem-chat-state.ts`
  - 可选新增 browser-safe 的本地消息构造 helper。
  - 不访问 provider、数据库或环境变量。

- `src/lib/diagnosis/diagnosis-follow-up.ts`
  - 如果先做 MVP-A，本文件提供纯函数，根据当前 `DiagnosisViewModel` 生成本地追问回答。
  - 如果后续做 MVP-B，再新增服务端 API，不混进 provider 层。

- `src/components/mathtrace-workbench.tsx`
  - 继续负责状态编排。
  - 用 `ProblemChatCard` 替换或包裹当前 `MistakeInputCard` 的左侧位置。

不建议在 P2.11 里大拆 `MathTraceWorkbench`。可以先把原有 `MistakeInputCard` 的交互能力迁移到新组件，保留现有回调签名，减少行为回归。

## 8. 既有行为保护

实现时必须保护：

- `sample_diagnosis` 能在无 API Key、无网络时稳定跑通。
- 图片上传失败、未配置 provider、模型超时、非法 JSON、图片过大都显示 recoverable error。
- 未确认、低置信度、fingerprint 不匹配的图片结果不得写画像。
- `problem_only` 跳过追问时只能写题型关注，不能写具体错因。
- 追问回答不得写 `memory_events`、`student_profiles`、`diagnosis_runs`、`mistake_book_items` 或 localStorage。
- 前端不得读取服务端环境变量、API Key、service role key。
- 右侧和下方结构化卡片不能因为聊天窗口变更而丢失信息。

## 9. 验收标准

功能验收：

- 用户可以在左侧会话窗口选择样例题并生成报告。
- 用户可以在左侧会话窗口上传图片，并看到图片消息。
- 图片识别草稿以 Agent 消息内交互块形式确认。
- 确认后右侧报告、下方练习、画像和复习路径继续更新。
- 报告生成后用户可以输入当前题目追问，并看到 Agent 回答。
- 追问不触发画像写入。
- 切换题目或重新上传时，当前会话状态能清晰重置。

测试验收：

- 增加纯函数测试，覆盖追问回答 helper 和消息构造 helper。
- 更新 UI smoke，覆盖 sample path、image extraction review、confirm path 和追问输入。
- `npm test` 通过。
- `npm run build` 在本地环境通过；如果环境沙箱限制导致失败，需要区分环境失败和代码失败。
- 浏览器检查桌面和移动端：左侧会话窗口不挤压右侧报告，消息长文本不溢出，上传预览不遮挡按钮。

文档验收：

- PRD 更新 P2.11：题目会话窗口、追问展示边界、非持久化聊天历史。
- `interview/mathtrace-project-narrative.md` 更新一小节：从表单式 demo 进化到单题 Agent 会话，但仍保持画像写入门控。
- 如果仅实现 MVP-A 本地追问，不需要 ADR。
- 如果实现 MVP-B 新增追问 API 和 provider 调用，需要在 PRD 中写清楚 API 契约和 provider 信任边界；是否需要 ADR 视实现取舍决定。

## 10. 后续扩展

P2.11 完成后，可以按以下顺序扩展：

1. 新增只读追问 API，让 text analysis provider 基于诊断摘要回答当前题追问。
2. 支持多题会话历史，但只保存在前端 session，不进数据库。
3. 设计真实 `problem_sessions` 数据模型，持久化题目会话、消息摘要和可解释证据。
4. 支持从错题本重新打开某道题的会话上下文。
5. 支持跨题复盘提问，例如“我最近为什么总在分类讨论上错”。

扩展到第 3 步之前，聊天内容仍不应被描述为长期记忆事实层。
