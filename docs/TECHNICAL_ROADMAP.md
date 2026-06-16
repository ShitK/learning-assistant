# 错因地图 MathTrace 技术路径文档

更新日期：2026-06-17
适用范围：从黑客松 P0 Demo 扩展到可长期使用的高中数学错题诊断产品。

## 1. 文档目标

这份文档回答一个问题：如果要把“错因地图 MathTrace”从当前可演示的 P0 工作台，逐步做成一个能长期服务学生的错题诊断 Agent，还需要哪些技术，以及这些技术应该按什么顺序引入。

核心判断：

- 当前阶段最重要的是稳定演示和清晰产品叙事，不是堆 Agent 框架。
- 长期壁垒不在“生成一道题答案”，而在结构化错因诊断、长期学习画像、复习闭环和可解释的数据沉淀。
- 技术路线应先从确定性的 TypeScript 业务流水线开始，再逐步接入模型、数据库、向量检索和复杂 Agent 编排。

## 2. 当前项目状态

当前仓库已经具备以下基础：

- Next.js App Router + TypeScript + Tailwind CSS。
- KaTeX 数学公式渲染。
- P0 单页工作台：首页、样例题选择、诊断流程时间轴、标准解法、错因报告、画像变化、变式练习、7 天复习计划。
- `POST /api/diagnose` 接口壳。
- P0 演示固定走 `sample_diagnosis`，返回内置 `sample_diagnosis`。
- 前端已经能通过接口触发诊断，并用返回的 `student_profile` 展示画像变化。
- P1 后端具备 `image_diagnosis` 服务端路径：通用 vision provider adapter，支持通过 `VISION_PROVIDER_*` 切换 Anthropic-compatible 与 OpenAI-compatible provider；模型只做图片抽取，`/api/diagnose` 先返回可编辑 `extraction_review` 草稿，用户确认后再由 `/api/confirm` 复用确定性 Pipeline。
- P1 前端具备图片上传入口、预览、客户端校验和压缩、识别结果编辑确认表单、可恢复错误态，以及未确认/低置信度/确认令牌不匹配不写入 localStorage 的保护。
- P1.7/P1.8 已引入 Supabase Postgres 数据底座：确认后的诊断可写入 `students`、`diagnosis_runs`、`mistake_book_items` 和 `memory_events`，`student_profiles` 保存从 gated `memory_events` 投影出的当前画像快照，并支持只读错题本 MVP；未配置 Supabase 时 demo 主流程仍稳定运行。

当前还没有完成：

- 非 Anthropic-compatible / OpenAI-compatible provider 的适配器实现。
- 真正的 Agent 内部编排模块。
- 用户登录、权限、老师端、班级端。
- 动态生成变式练习。
- 真实登录、RLS 用户策略、老师端、RAG、pgvector/Milvus、多用户云端画像和长期回放。

## 3. 总体架构目标

MathTrace 最终应该是一个“学习诊断系统”，不是一个“聊天机器人”。推荐的长期架构是：

```text
用户工作台
  -> /api/diagnose
    -> Learning Coach Agent Pipeline
      -> 题目识别模块
      -> 知识点检索模块
      -> 知识点映射模块
      -> 错因诊断模块
      -> 画像增量计算模块
      -> 练习生成模块
      -> 复习规划模块
      -> 用户确认与持久化模块
    -> 数据库与长期记忆
    -> 可选向量检索
    -> 可选模型服务
```

原则：

- 前端负责体验和状态展示，不直接执行诊断逻辑。
- 后端主诊断入口保持 `POST /api/diagnose`；P1 图片路径额外使用无状态 `POST /api/confirm` 作为人类确认点，避免未确认抽取直接进入画像写入决策。
- Agent 流程先由代码确定性编排，模型只作为其中某些步骤的工具。
- 长期画像不保存成聊天记录，而保存成结构化学习数据。
- 所有模型输出都必须经过 Schema 校验和业务规则收敛。

## 4. 技术分层

### 4.1 前端层

继续使用当前栈：

- Next.js App Router。
- React + TypeScript。
- Tailwind CSS。
- KaTeX。
- 必要的 client component 只放在需要交互、动画、localStorage 的组件上。

Next.js App Router 的 Route Handlers 适合继续承载 `/api/diagnose` 这类服务端接口；官方文档也明确 Route Handler 通过 `app/**/route.ts` 定义，并使用 Web Request/Response API。参考：[Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)。

前端后续重点不是多页面，而是把主工作台变成一个稳定闭环：

```text
选择或上传错题
  -> 图片识别结果确认
  -> 诊断中
  -> 标准解法
  -> 错因报告
  -> 画像变化
  -> 练习
  -> 复习计划
  -> 确认写入长期记忆
```

### 4.2 API 层

短期继续使用 Next.js Route Handler。

建议主诊断接口保持为：

```text
POST /api/diagnose
```

P1 已新增确认接口，其他接口不要太早拆散：

```text
POST /api/confirm
GET /api/mistake-book?student_id=demo_student_001
GET /api/student-profile?student_id=demo_student_001
POST /api/practice-attempts
GET /api/profile
GET /api/history
```

接口设计原则：

- P0/P1 只让前端调用后端 API，不让前端直接调用 Kimi、MiMo、OpenAI 或数据库服务密钥。
- 请求体使用 Zod 或等价类型守卫做运行时校验。
- 响应体也使用 Zod 或等价 schema 做内部校验，尤其是模型输出。
- 错误响应必须稳定，包括 `invalid_request`、`invalid_json`、`missing_image`、`invalid_image`、`image_too_large`、`model_not_configured`、`model_timeout`、`model_request_failed`、`model_invalid_output` 等。
- Provider/OCR 可观测性边界：P1 不保存原始 provider 响应，也不记录图片内容。请求失败只暴露安全元数据 `provider_debug`，用于区分 `http_error`、`invalid_json`、`empty_text_content`、`network_failed` 和 `timeout`。其中 `empty_text_content` 表示 provider HTTP/JSON 响应成功，但响应体没有可解析的文本内容。未来 OCR provider 接入时应复用这一错误结构，而不是新增一套前端不可识别的错误通道。
- 图片确认边界：`/api/diagnose` 的 `image_diagnosis` 成功响应只包含 `extraction_review` 草稿和 `confirmation_token`；`/api/confirm` 接收用户确认后的草稿并返回完整图片诊断。生产环境需要 `MATHTRACE_CONFIRM_SECRET` 签名确认令牌；未确认、低置信度或令牌指纹不匹配的结果不能写入长期画像。
- 数据库访问边界：P1.7/P1.8 前端只调用 Next API，不直连 Supabase；`SUPABASE_SERVICE_ROLE_KEY` 只允许服务端读取。Supabase 未配置或写入失败时，诊断报告仍返回，错题本接口返回稳定空列表或安全错误，`/api/student-profile` 返回 `profile=null` fallback，不泄露 secret、完整图片 base64 或 provider payload。

Zod 是 TypeScript-first 的 schema validation 工具，适合在 TypeScript 项目里同时获得运行时校验和静态类型推导。参考：[Zod](https://zod.dev/)。

### 4.3 Agent 编排层

短期推荐自研轻量 TypeScript Pipeline。

这里的 pipeline 不是框架名字，而是一组明确的 TypeScript 函数：

```text
runMathTraceAgent()
  -> planTask()
  -> recognizeQuestion()
  -> retrieveKnowledgeContext()
  -> mapKnowledgePoints()
  -> diagnoseMistake()
  -> computeMemoryDelta()
  -> generatePractice()
  -> planReview()
  -> buildDiagnoseResponse()
```

为什么先这样做：

- MathTrace 的主流程固定，不需要模型决定下一步。
- 代码可读，演示时可解释。
- 每一步都能单独测试。
- 后续接 MiMo、Kimi、OpenAI、数据库时，只替换某个模块，不重写全链路。

暂时不建议在 P0/P1 引入 LangGraph 或 OpenAI Agents SDK 作为主框架。它们适合更复杂的 Agent 后端编排，例如多 Agent 交接、长流程恢复、人类确认、tracing 和复杂工具调用。OpenAI Agents SDK 官方定位包含工具、handoff、流式输出和 trace；LangGraph 则强调 durable execution、streaming、human-in-the-loop 等 Agent 编排能力。参考：[OpenAI Agents SDK](https://platform.openai.com/docs/guides/agents-sdk)、[LangGraph overview](https://docs.langchain.com/oss/python/langgraph)。

### 4.4 模型调用层

模型调用应该是 Agent Pipeline 的工具，不是系统的主人。

推荐分阶段：

```text
P0：不调用模型，只用内置样例。
P1：多模态 provider 只负责图片识别和结构化抽取，当前通过 `VISION_PROVIDER_*` 配置切换 GLM-4.6V-FlashX、Kimi Code、MiMo 等兼容 provider。
P1：确认后 text analysis provider 可增强报告表达，当前通过 `ANALYSIS_PROVIDER_*` 配置 DeepSeek `deepseek-v4-flash`。
P2：模型 adapter 可负责结构化生成练习和计划；是否引入 Vercel AI SDK 需要单独评估。
P3：根据复杂度评估 OpenAI Agents SDK 或 LangGraph。
```

GLM、Kimi、MiMo 适合放在“题目识别模块”里，由服务端 adapter 包装成统一的 `VisionExtractionProvider`。当前实现支持 Anthropic-compatible 与 OpenAI-compatible 接口，并显式关闭 `thinking` 以确保返回可解析 text block；切换兼容 provider 时优先改本地 `VISION_PROVIDER_*` 配置，不改 route 和确定性 Pipeline。确认 token 使用独立 `MATHTRACE_CONFIRM_SECRET` 或本地 demo secret 签名，不再回退到 provider API Key，避免切模型时让已发出的确认草稿失效。

DeepSeek `deepseek-v4-flash` 当前放在“确认后文本分析增强模块”里，由 `ANALYSIS_PROVIDER_*` 配置。它只接收用户确认后的文本草稿，增强 `expected_diagnosis`、`step_analysis`、`solution_highlights` 和 `standard_solution`，不参与 `knowledge_mapping`、`mistake_causes`、`severity`、`memory_delta`、`student_profile`、练习和复习计划生成。`ANALYSIS_PROVIDER_BASE_URL` 支持 provider 根地址或完整 `/chat/completions` endpoint，但当前协议仍只支持 OpenAI-compatible。推荐链路是：

```text
GLM/Kimi/MiMo vision extraction
-> 用户检查/编辑/确认
-> DeepSeek text analysis enhancement
-> deterministic memory/profile rules
```

Vercel AI SDK 可能适合 P2 引入，因为它和 Next.js/TypeScript 生态贴近，提供统一模型调用、流式输出、工具调用和结构化输出。但当前阶段只有一个多模态 HTTP 调用，先不引入 SDK，避免扩大依赖和调试面。

建议模型 adapter 形态：

```ts
interface VisionExtractionProvider {
  extractQuestionFromImage(input: {
    image_base64: string;
    mime_type: string;
    student_profile_summary: string;
  }): Promise<RecognizedQuestionDraft>;
}

interface TextAnalysisEnhancementProvider {
  enhanceConfirmedDiagnosis(input: {
    question_text: string;
    student_answer: string;
    student_solution_steps: string[];
  }): Promise<DiagnosisEnhancementDraft>;
}

interface StructuredGenerationProvider {
  generatePractice(input: PracticeGenerationInput): Promise<PracticeQuestion[]>;
  generateReviewPlan(input: ReviewPlanInput): Promise<ReviewPlan>;
}
```

注意：

- 不要把模型返回内容直接写入长期画像。
- 不要让模型自由创造知识点 ID 或错因标签。
- 模型输出必须先转成项目内部 schema，再进入后续模块。
- 文本分析模型失败时回退到本地规则报告，不阻塞确认流程。

## 5. 长期记忆与数据库技术

长期用户画像的核心技术不是 Agent 框架，而是数据库设计、事件记录、画像更新规则和权限控制。

推荐数据库路线：

```text
P0：localStorage + mock 数据
P1.5/P1.6：继续用 localStorage 表达 demo 画像，完善可信写入边界和 smoke
P1.7：Supabase Postgres 数据底座，写入 diagnosis run、错题本条目和 memory event
P1.8：student_profiles 当前画像快照，从 gated memory_events 投影重建
P2：Supabase Auth/RLS 用户策略、多用户云端画像和对象存储
P3：加入 pgvector 做相似错题召回
```

### 5.1 数据库选择

推荐使用 Postgres。原因：

- 错题记录、学生画像、练习尝试都是结构化关系数据。
- Postgres 支持 JSONB，适合保存部分半结构化诊断结果。
- 后续可以通过 pgvector 在同一个数据库里做向量相似搜索。
- Supabase 提供托管 Postgres、Auth、Storage、Row Level Security，适合快速产品化。

Supabase RLS 用于控制行级权限。官方文档强调暴露给 API 的 schema 应启用 RLS，启用后需要策略才允许访问。参考：[Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)。

### 5.2 核心表设计

P1.7 先落四张表，覆盖确认后的诊断记录、只读错题本和画像事件；P1.8 再补当前画像快照：

```text
students
diagnosis_runs
mistake_book_items
memory_events
student_profiles
```

关键设计：

- `students` 当前固定 `demo_student_001`，不假装已经有多用户系统。
- `diagnosis_runs` 保存一次诊断运行的结构化快照，用 `client_diagnosis_id` 承接现有 API 的诊断 ID。
- `mistake_book_items` 保存只读错题本条目，字段以题干、学生答案、标准解法、知识点、错因、严重度和诊断摘要为主。
- `memory_events` 保存画像变化事件，独立记录 `knowledge_mastery_changes`、`mistake_cause_changes`、`review_priority_changes` 和 rationale，便于后续解释画像变化。
- `student_profiles` 保存当前画像快照/read model，从 `memory_events` 中 `should_persist=true` 的受控事件投影得到，附带 `event_count` 和 `last_memory_event_id` 便于追踪快照来源。
- `sample_diagnosis` 是 demo 自动确认路径，也会在 `memory_delta.should_persist=true` 时尝试写入。
- 不保存完整图片 base64；localStorage 暂时继续作为 demo fallback，云端画像读取失败或尚未生成时不破坏演示。

长期产品再补齐这些表：

```text
practice_questions
practice_attempts
review_plans
review_tasks
knowledge_points
mistake_taxonomy
```

关键设计：

- `mistake_book_items` 是当前阶段的错题本条目；长期可扩展为更完整的 `mistake_records`。
- `diagnosis_runs` 保存一次诊断过程，包括输入、输出、模型版本、置信度和错误信息。
- `memory_events` 保存画像变化的增量事件，而不是只保存最终分数；长期可按需要聚合为 `memory_deltas` 或直接驱动 profile rebuild。
- `student_profiles` 当前只服务 `demo_student_001` / `math` 的聚合画像读取；长期需要扩展为真实多用户画像，并接入 Auth/RLS 策略。
- `practice_attempts` 保存学生做变式题后的结果，用于画像回升或复发判断。

示例：

```text
mistake_book_items
  id
  student_id
  diagnosis_run_id
  source
  question_text
  student_answer
  standard_solution
  knowledge_points
  mistake_causes
  severity
  diagnosis_summary
  review_status
  created_at
  updated_at

memory_events
  id
  student_id
  diagnosis_run_id
  mistake_book_item_id
  event_type
  knowledge_mastery_changes
  mistake_cause_changes
  review_priority_changes
  is_repeated_mistake
  should_persist
  rationale
  created_at

student_profiles
  id
  student_id
  subject
  grade
  mastery_scores
  frequent_mistake_causes
  weak_modules
  review_priority
  recent_trend
  gaokao_focus
  created_at
  updated_at
```

### 5.3 事件溯源式画像

不要只存最终画像：

```json
{
  "parameter_classification": 38
}
```

还要存变化原因：

```json
{
  "knowledge_mastery_changes": {
    "parameter_classification": -8
  },
  "mistake_cause_changes": {
    "classification_missing": 1
  },
  "rationale": "导数含参题再次遗漏分类讨论，且属于高考高频知识点。"
}
```

这样未来可以做：

- 画像回放。
- 错误趋势图。
- 老师端学情解释。
- 模型误判后的回滚。
- 复习计划为什么这样安排的解释。

### 5.4 向量记忆

向量库不是第一优先级。先把结构化画像做好。

后续当需要“找相似错题”时再引入 pgvector：

```text
输入：当前错题题干、学生错误步骤、错因描述
输出：历史上最相似的 5 道错题
用途：判断复发、个性化解释、老师端共性问题分析
```

pgvector 是 Postgres 的向量相似搜索扩展，可以把向量和普通关系数据放在一起，支持精确和近似最近邻搜索。参考：[pgvector](https://github.com/pgvector/pgvector)。

建议表：

```text
mistake_embeddings
  id
  mistake_record_id
  student_id
  embedding
  embedding_model
  content_hash
  created_at
```

注意：向量检索只负责“召回相似内容”，不能替代结构化画像。

## 6. Agent 框架演进路线

### 6.1 当前不需要重框架

当前流程固定：

```text
识别 -> 映射 -> 诊断 -> 画像 -> 练习 -> 计划
```

这更像业务流水线，不是开放式多 Agent 协作。

所以当前推荐：

```text
TypeScript Pipeline + Zod + 单一 API
```

### 6.2 可逐步 Agent 化的环节

短期为了演示稳定、数据可控、画像不被模型污染，核心诊断仍由确定性 Pipeline 收口。后续可以按风险从低到高，把部分环节替换为 Agent 或工具调用：

1. 知识点映射：从规则匹配升级为“知识库检索工具 + LLM 判断 + schema 校验”。Agent 负责检索和判断候选项，但最终只能选择已有 `knowledge_point_id`。
2. 错因诊断：诊断 Agent 可以基于题目、学生步骤和知识点上下文分析错因，但输出必须限制在现有错因标签体系里，不能自由造标签。
3. 练习题生成：优先智能化。模型根据本题错因和学生历史画像生成变式题，再由 parser 校验结构、题量、难度、知识点绑定和错因绑定。
4. 7 天复习计划：Agent 可以结合历史错题、掌握度、复发错因和高考频率生成计划草稿，但最终计划仍要经过 schema 和业务规则检查。
5. `memory_delta`：长期仍由规则引擎主导。Agent 可以提供诊断依据或严重度建议，但不能直接写 `memory_delta` 或覆盖学生画像。
6. 学生画像合并：Agent 可以解释为什么建议调整画像；真正合并分数、错因频次和复习优先级，继续由代码控制。

### 6.3 什么时候用 Vercel AI SDK

当出现这些需求时引入：

- 动态生成变式练习。
- 动态生成复习计划。
- 模型输出必须符合对象 schema。
- 需要流式展示模型输出。
- 需要在 Next.js 中统一接不同模型 provider。

不建议让 `ToolLoopAgent` 直接接管核心诊断流程。核心诊断要可重复、可解释。

### 6.4 什么时候用 OpenAI Agents SDK

当产品进入 OpenAI 生态并需要这些能力时考虑：

- 一个主 Agent 和多个专业 Agent handoff。
- 内置 tracing，追踪工具调用和多轮 Agent 过程。
- guardrails，控制输出和输入风险。
- session memory，用于开放式学习对话。
- 流式 Agent 运行状态。

适合场景：

```text
学生问：“我最近导数题总错，帮我分析这 30 天的错题。”
Learning Coach Agent
  -> History Retrieval Agent
  -> Mistake Diagnosis Agent
  -> Practice Planner Agent
  -> Final Coach Response
```

### 6.5 什么时候用 LangGraph

当流程变成长任务、有分支、有用户确认、有恢复需求时考虑：

```text
上传图片
  -> 模型识别
  -> 置信度低则暂停，等待用户编辑
  -> 用户确认题干
  -> 重新诊断
  -> 用户确认错因
  -> 写入长期画像
  -> 7 天后触发复习任务
```

LangGraph 的价值在于 durable execution 和 human-in-the-loop，而不是“听起来更 Agent”。官方文档也把 durable execution 描述为保存流程进度、支持暂停和恢复，适用于人工检查、长任务和中断恢复。参考：[LangGraph durable execution](https://docs.langchain.com/oss/python/langgraph/durable-execution)。

## 7. 图片上传与文件存储

图片上传进入 P1 后需要以下技术：

- 前端图片选择和预览。
- 图片大小、格式、尺寸校验。
- 客户端压缩或服务端压缩。
- 识别结果、置信度、错误态和切回样例题入口。
- 对象存储，例如 Supabase Storage、S3、Cloudflare R2。
- 服务端只保存图片 URL、hash、元数据，不在日志里输出完整 base64。
- 图片识别失败时展示可恢复错误，不自动伪造成样例题成功；用户可以切回样例题或后续手动编辑。

推荐路径：

```text
P1：前端 base64 上传到 /api/diagnose，只做小图演示
P2：对象存储 + signed upload URL
P3：异步识别任务 + 状态轮询或通知
```

安全要求：

- 图片可能包含未成年人学习数据。
- 不要把图片 base64 打进日志。
- 不要把 MiMo/Kimi/OpenAI API Key 暴露到前端。
- 如果以后有真实用户，需要提供删除图片和删除诊断记录能力。

## 8. 练习与复习闭环

完整产品不能只停在“诊断”。要闭环到“修复”。

推荐功能路线：

```text
P0：展示 3 道预写变式练习。
P1：用户点击“做对/做错”，模拟画像变化。
P2：用户上传练习答案图片，识别是否修正原错因。
P3：根据练习结果动态调整 mastery_scores 和 review_priority。
```

练习题需要和错因绑定：

```text
practice_question
  level: basic | transfer | gaokao_style
  knowledge_points
  target_mistake_causes
  training_goal
```

练习尝试需要记录：

```text
practice_attempt
  student_id
  practice_question_id
  result
  detected_mistake_causes
  mastery_delta
  created_at
```

这样才能判断：

- 学生是否真的修正了原错因。
- 同一错因是否复发。
- 掌握度是否应该回升。
- 复习计划是否应该降优先级。

## 9. 测试与质量保障

当前项目只有 lint 和 build 还不够。完整产品需要分层测试。

推荐测试技术：

- Vitest：测试 TypeScript 纯函数、Agent pipeline、画像更新规则。
- Playwright：测试完整用户流程。
- API smoke tests：测试 `/api/diagnose` 正常和异常请求。
- Schema fixture tests：测试 mock 数据、模型输出和 PRD schema 是否一致。

Next.js 官方测试文档也把 Unit Testing、Integration Testing、E2E Testing 作为不同层次，并列出 Vitest、Playwright 等常见工具。参考：[Next.js Testing](https://nextjs.org/docs/app/guides/testing)。

关键测试清单：

```text
parseDiagnoseRequest
  -> 非 JSON
  -> 缺 student_id
  -> 未知 sample_question_id
  -> image_diagnosis P1 分支

runMathTraceAgent
  -> sample_diagnosis 成功
  -> steps 顺序正确
  -> sample_diagnosis 兼容字段存在

computeMemoryDelta
  -> 严重错误扣分
  -> 复发错误额外扣分
  -> 分数 clamp 到 0-100
  -> review_priority 去重排序

localStorage
  -> 首次进入
  -> 损坏数据恢复
  -> 重置画像

UI
  -> 首页加载
  -> 样例题选择
  -> 开始诊断
  -> 标准解法和错因报告可见
  -> 画像变化显示正确
  -> 先从 localStorage/demo 恢复画像，再通过 /api/student-profile best-effort 刷新云端画像
  -> image_diagnosis 上传、预览、识别草稿确认
  -> confirmed_image_diagnosis 成功渲染
  -> problem_only 图片显示快速追问、跳过和确认写入
  -> image_diagnosis recoverable error
  -> 未确认/确认令牌不匹配/insufficient 的图片结果不写入 localStorage
```

P1.5 新增轻量 eval harness，不评价文案“好不好看”，只评价证据策略是否正确：

```text
npm run test:eval
  -> 学生步骤充分时可写 mistake_cause
  -> 低置信度或只有题干时先进入 problem_only
  -> 跳过追问只写 problem_type_focus，不写 mistake_cause_changes
  -> 提交卡点只生成草稿，不写画像
  -> 确认卡点分析后才写 user_confirmed mistake_cause
  -> 模型夹带 memory_delta/student_profile 等 forbidden fields 会被 parser 拒绝
  -> sample_diagnosis 稳定路径仍可回归
```

P1.6a 新增轻量 demo smoke，不评价模型生成质量，只验证演示主路径和 API 契约是否仍能跑通：

```text
npm run test:smoke
  -> sample_diagnosis 主演示路径稳定
  -> /api/diagnose 和 /api/confirm 基础错误响应稳定
  -> 图片识别草稿不包含画像写入字段
  -> problem_only 追问、跳过、提交草稿、确认写入四个动作稳定
  -> 标准解法展示不暴露 Markdown/LaTeX 残留
```

P1.8 新增画像投影测试，重点不是端到端数据库性能，而是云端 read model 的边界：

```text
npm test
  -> student_profiles migration 只授予 service_role 读写权限
  -> 从 should_persist=true 的 memory_events 顺序投影 StudentProfile
  -> 无效 memory_delta 不写入 student_profiles，只返回同步 warning
  -> /api/student-profile 未配置、未生成或读取失败时返回 profile=null fallback
  -> 工作台只能通过 browser-safe HTTP client 读取云端画像，不 import Supabase
```

## 10. 可观测性与评估

AI 产品需要知道哪里失败，而不是只看“页面能打开”。

短期：

- 记录 API 错误码计数。
- 记录模型调用耗时。
- 记录模型输出校验失败率。
- 记录用户是否从图片路径回退到样例题。

长期：

- Sentry 或同类工具做前后端错误监控。
- OpenTelemetry 或平台日志做请求链路追踪。
- Agent trace 保存关键步骤，但不要保存敏感图片和完整学生隐私内容。
- 为模型输出建立 eval 集，例如 30 道手工标注错题，验证知识点和错因标签是否命中。
- P1.5 的本地 eval fixture 先覆盖“证据是否足以写画像”，为后续真实标注集提供最小安全基线。

Agent 质量评估不要只看文本好不好看，要看结构化指标：

```text
知识点命中率
错因标签命中率
标准解法完整率
画像更新是否符合规则
复习计划是否引用了真实依据
```

## 11. 部署路线

黑客松阶段：

```text
Vercel 或本地演示
P0/P1.6 可无数据库运行
无真实模型依赖
```

早期内测：

```text
Vercel
Supabase Postgres
Supabase Storage（图片长期保存阶段再引入）
服务端环境变量管理 MiMo/Kimi/OpenAI API Key
```

产品化阶段：

```text
正式域名
错误监控
日志脱敏
数据库备份
对象存储生命周期策略
限流
用户数据删除能力
```

## 12. 安全与隐私

这个产品处理的是学生学习数据，后续必须当成敏感数据处理。

必须做到：

- API Key 只在服务端环境变量中。
- 不在前端 bundle、日志、mock 数据、PR 或截图里出现 API Key。
- 图片、题干、学生答案都可能包含隐私，日志只记录 hash、长度、错误码。
- 后端限制图片大小和请求频率。
- 数据库启用 RLS 或后端强制权限检查。
- 老师端只能查看授权班级数据。
- 提供删除错题、删除账号、导出数据的长期能力。

模型安全：

- 不允许模型自由写数据库。
- 不允许模型自由定义知识点和错因标签。
- 对模型输出做 schema 校验和业务规则二次确认。
- 低置信度诊断必须进入用户确认，不直接污染长期画像。

## 13. 推荐学习顺序

如果以学习为目的，推荐按这个顺序：

1. Next.js App Router：Server Component、Client Component、Route Handler。
2. TypeScript：类型收窄、联合类型、`unknown` 输入处理、函数式模块拆分。
3. Zod：请求校验、响应校验、模型输出校验。
4. Agent Pipeline：不用框架，先手写清晰流程。
5. Vitest：测试 pipeline 和画像更新规则。
6. Playwright：测试核心用户路径。
7. MiMo / Kimi / OpenAI API：服务端模型调用、多模态输入、结构化输出。
8. Vercel AI SDK：统一模型调用、结构化生成、流式输出。
9. Postgres / Supabase：学生画像、错题记录、权限和 RLS。
10. pgvector：相似错题召回。
11. LangGraph 或 OpenAI Agents SDK：复杂 Agent 编排、人类确认、多 Agent。
12. Observability：Sentry、日志、模型 eval、trace。

## 14. 分阶段实施路线

### Phase 0：黑客松 P0 稳定演示

目标：演示完整闭环。

技术：

- Next.js。
- TypeScript。
- Tailwind。
- KaTeX。
- 本地 mock 数据。
- `/api/diagnose` sample path。

验收：

- 评委能在 3-5 分钟看懂“标准解法 -> 错因 -> 画像 -> 练习 -> 复习计划”。

### Phase 1：真实 Agent Pipeline

目标：让后端内部真的按 Agent 步骤执行。

技术：

- TypeScript pipeline。
- Zod。
- Vitest。

交付：

- `runMathTraceAgent()`。
- `computeMemoryDelta()`。
- 模块化的知识点映射、错因诊断、练习生成、复习规划。

验收：

- `/api/diagnose` 响应契约不变。
- 每个模块有单元测试。
- 前端不用大改。

### Phase 2：图片识别 P1

目标：支持真实错题图片进入诊断流程。

技术：

- Anthropic-compatible provider adapter，MiMo first。
- 后续 Kimi、DeepSeek 作为 `VisionExtractionProvider` 实现接入。
- 图片压缩和大小校验。
- Zod 或等价类型守卫校验模型输出。
- 图片诊断输出韧性：parser 对常见 MiMo 字段值漂移做有界规范化，provider 对安全的结构化失败做一次修复重试，前端明确展示保留报告状态。
- 图片识别确认：`/api/diagnose` 只返回识别草稿，前端允许编辑题干、学生答案和解题步骤；确认后通过 `/api/confirm` 生成完整报告，标准解法由文本分析模型或本地规则生成。
- OCR adapter 是后续独立扩展，不属于本次图片诊断输出韧性 hardening。

交付：

- `image_diagnosis` 分支。
- 服务端图片输入校验、MiMo 抽取、JSON 解析和边界校验。
- 前端图片上传、预览、压缩和识别结果编辑确认。
- `/api/confirm` 无状态确认入口和确认令牌校验。
- 低置信度提示用户确认但不允许写入长期画像。
- 失败时返回可恢复错误，并保留样例题入口；不自动伪造成样例题成功。

验收：

- 模型不可用时 P0 样例路径不受影响。
- 图片路径失败不会污染长期画像。
- 模型不得直接写入 `memory_delta` 或覆盖 `student_profile`。
- 图片抽取草稿未确认时不会进入后续诊断；确认令牌不匹配时只生成报告，不写画像。

### Phase 2.5：可信诊断降级与快速追问

目标：避免题干-only 或学生步骤不清的图片被误写成学生具体错因。

技术：

- `assessExtractionEvidence()` 证据评估层。
- `/api/confirm` 复用 `confirmation_action` 表达跳过追问、提交卡点和确认卡点分析。
- `profile_update_kind="problem_type_focus"` 复用现有 `MemoryDelta.knowledge_mastery_changes` 和 `review_priority_changes`，不改 localStorage profile schema。
- 前端在图片确认面板内展示一屏快速追问，不新增接口或页面。
- `scripts/eval-harness.test.mjs` 和 fixture 固化可信写入边界。

交付：

- `student_work_sufficient` 继续走现有具体错因诊断。
- `problem_only + skip_follow_up` 只轻微下调相关知识点掌握度并记录复习关注，不写具体错因。
- `problem_only + submit_stuck_point` 只生成分析草稿，不持久化。
- `problem_only + confirm_stuck_point_analysis` 才以 `user_confirmed` 写入具体错因。
- `insufficient` 不写画像，提示重新上传或改用样例题。

验收：

- 没有学生作答证据时不会写 `mistake_cause_changes`。
- 跳过追问不会增加 `frequent_mistake_causes`。
- 用户确认前不会把追问回答写入画像。
- DeepSeek/text analysis provider 不能影响 `memory_delta`、`student_profile` 或写入策略。
- `npm test`、`npm run test:eval`、`npm run lint`、`npm run build` 通过。

### Phase 2.6：Demo smoke 稳定性收口

目标：在扩展错题本、RAG 或知识库前，先用脚本和浏览器清单锁住现有演示闭环。

技术：

- `scripts/api-smoke.test.mjs` 覆盖 `/api/diagnose`、`/api/confirm` 和图片识别草稿契约。
- `scripts/demo-smoke.test.mjs` 覆盖样例题主路径、P1.5 低证据追问动作和标准解法展示残留。
- `docs/demo-smoke-checklist.md` 沉淀本地浏览器演示前检查清单。
- 所有 smoke 使用本地 fake provider 或 fixture，不依赖真实 API Key、网络或 dev server。

验收：

- `npm run test:smoke`、`npm test`、`npm run test:eval`、`npm run lint`、`npm run build` 通过。
- `docs/demo-smoke-checklist.md` 可指导一次 3-5 分钟浏览器检查。
- 不新增用户功能，不改变画像写入策略，不接入真实 provider smoke。

### Phase 3：P1.7 长期记忆与数据库底座

目标：先把确认后的诊断记录、错题本条目和画像变化事件写入 Supabase Postgres，同时保持 `sample_diagnosis` 稳定路径不依赖数据库。

技术：

- Supabase Postgres。
- SQL migration。
- Server-only Supabase admin client。
- Next API 作为唯一前端访问边界。
- service role key 只在服务端读取。

交付：

- `students`。
- `diagnosis_runs`。
- `mistake_book_items`。
- `memory_events`。
- 只读错题本 MVP。

验收：

- 诊断确认后写入 diagnosis run、错题本条目和 memory event；`sample_diagnosis` 作为 demo 自动确认路径也会写。
- 当前仍固定 `demo_student_001`，不做登录、权限、老师端、RAG 或 pgvector。
- 前端不直连数据库；未配置 Supabase 时 demo 仍可运行，错题本为空或稳定降级。
- 不存完整图片 base64；localStorage 暂时继续作为 demo 画像恢复，不迁移完整画像。
- `sample_diagnosis` 稳定路径不破坏。

### Phase 3.1：P1.8 云端当前画像快照

目标：在不引入登录、RLS 用户策略或 RAG 的前提下，把当前学生画像从纯 localStorage fallback 推进到服务端可读的结构化快照。

技术：

- `student_profiles` 表作为当前画像 read model。
- 从 `memory_events` 读取 `memory_delta.should_persist=true` 的门控事件，按时间顺序投影重建画像。
- shared `StudentProfile` guard 作为投影后的运行时校验。
- `GET /api/student-profile` 作为浏览器唯一读取入口。
- 诊断持久化成功和错题删除成功后 best-effort 同步画像；同步失败只返回 warning。

交付：

- `student_profiles`。
- `src/lib/student-profile/student-profile-service.ts`。
- `src/lib/persistence/student-profile-persistence.ts`。
- `src/app/api/student-profile/route.ts`。
- `src/lib/student-profile/student-profile-client.ts`。

验收：

- `student_profiles` 是当前画像快照，不是事实源；事实源仍是 `memory_events`、`diagnosis_runs` 和 `mistake_book_items`。
- 当前仍固定 `demo_student_001` 和 `math`，不做登录、真实多用户、老师端、RAG、pgvector 或 Milvus。
- 前端不直连 Supabase；工作台先从 localStorage/demo 恢复，再 best-effort 读取云端画像。
- 成功持久化诊断或成功删除错题后同步投影画像；同步失败不破坏诊断、删除和 `sample_diagnosis` 主路径。

后续 Phase 3.x 再补 Supabase Auth、面向用户的 RLS 策略、多用户画像、对象存储和 pgvector 相似错题召回。

### Phase 4：练习闭环

目标：从诊断走向修复。

技术：

- practice attempt 数据模型。
- 练习结果更新规则。
- 可选图片识别练习答案。

交付：

- 练习做对后掌握度回升。
- 练习做错后复发错误计数上升。
- 复习计划根据练习结果调整。

验收：

- 用户不是只看报告，而是真的能修复薄弱点。

### Phase 5：相似错题和 RAG

目标：让系统能从历史错题中召回相似模式。

技术：

- Embeddings。
- pgvector。
- hybrid search，优先结构化过滤，再向量召回。

交付：

- 相似错题推荐。
- 复发错误解释。
- 老师端班级共性错因分析。

验收：

- 当前错题能找到历史相似错题。
- 召回结果能解释为什么相似。

### Phase 6：开放式学习教练

目标：支持用户自然语言提问和长期学习规划。

技术：

- Vercel AI SDK 或 OpenAI Agents SDK。
- Agent tools。
- session memory。
- trace。

交付：

- “我最近导数为什么总错？”这类问题可以得到基于真实错题历史的回答。
- Agent 可以调用画像、历史错题、复习计划工具。

验收：

- 回答引用真实学生数据。
- 不编造不存在的历史。

### Phase 7：复杂 Agent 编排

目标：当流程需要暂停、确认、恢复、多 Agent 分工时，再引入 LangGraph 或 OpenAI Agents SDK。

技术：

- LangGraph durable execution。
- Human-in-the-loop。
- 多 Agent handoff。
- 长流程状态持久化。

交付：

- 用户确认题干后继续诊断。
- 老师确认班级报告后发布作业。
- 长任务失败后可恢复。

验收：

- 复杂流程不靠前端临时状态撑着。
- 每一步状态都可追踪、可恢复、可审计。

## 15. 技术取舍总结

推荐当前主线：

```text
Next.js + TypeScript Pipeline + Zod + mock 数据 + optional Supabase Postgres
```

推荐中期主线：

```text
Next.js + provider adapters + Supabase Postgres + Auth/RLS
```

推荐长期主线：

```text
Postgres + memory_events + pgvector + Agent framework
```

不建议现在做：

- 复杂多 Agent。
- LangGraph 主流程重构。
- 老师端和班级端。
- RAG 和向量库。
- 支付、部署流水线、商业后台。

最重要的工程判断：

```text
先把诊断链路做准。
再把画像记忆做稳。
最后才把 Agent 做开放。
```

如果顺序反了，项目会变成一个很会说话但不可信的聊天框。MathTrace 真正应该变成的是：学生每做一道错题，系统就更懂他一点。
