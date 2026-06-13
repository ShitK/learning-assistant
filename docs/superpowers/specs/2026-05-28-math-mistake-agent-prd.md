# 高中数学错题诊断 Agent PRD

Generated on 2026-05-28
Status: Draft
Target: Hackathon MVP with commercial expansion path

## 1. Product Positioning

产品暂定名：错因地图 MathTrace。

电梯演讲：拍照搜题告诉学生答案；本产品告诉学生为什么错、怎么改，以及高考前应该优先补什么。

本产品是一个面向高中学生的数学错题诊断 Agent。学生上传错题图片后，Agent 自动识别题目和学生解题过程，定位知识点，分析错因，生成针对性变式练习，并把每次错误沉淀为长期学习画像。长期目标是陪伴学生从高一到高三，基于三年的真实错题历史，在高考前生成个性化复习路线。

第一版以学生自学助手为主，不做完整老师后台，但数据结构保留老师端、班级端和机构端扩展能力。

## 2. Core Value

普通拍照搜题工具解决的是“这道题怎么做”。本产品解决的是：

- 我为什么错
- 我经常在哪类题上错
- 我的底层薄弱点是什么
- 我下一步应该练什么
- 临近考试时，我应该如何基于历史错题复习

核心卖点是“越用越懂你”的长期学习画像，而不是单次解题。

### Competitive Difference

| 类型 | 主要解决什么 | 本产品差异 |
| --- | --- | --- |
| 拍照搜题工具 | 给出答案和标准解析 | 进一步定位学生具体错因，并沉淀为长期画像 |
| 普通错题本 App | 保存错题、方便复习 | 自动结构化错因、知识点和复习优先级 |
| 家教老师 | 人工诊断和规划 | 用低成本方式持续记录三年错题轨迹，辅助个性化复习 |

最重要的差异化是三点：结构化错因诊断、三年长期记忆、可解释的复习规划。评委应在 1 分钟内理解：这不是“AI 解题”，而是“长期学习诊断系统”。

## 3. Target User

### MVP User

高中学生，尤其是：

- 高一到高三数学学习中等或中上，但错题复盘效率低的学生
- 有错题本习惯，但缺少系统分析能力的学生
- 临近月考、期中、期末、高考，需要快速定位薄弱点的学生

### Future Commercial Users

- 家长：购买学生个人学习诊断订阅
- 老师：查看班级共性薄弱点，生成分层作业
- 教培机构：建立机构专属题库和学情分析系统
- 学校：对接校本教材、考试和学生长期学情数据

## 4. MVP Scope

MVP 选择“错题诊断 + 长期画像 + 复习路线”版本，但黑客松实现必须收敛为稳定演示闭环。第一优先级是让评委完整看到：样例题诊断、错因报告、画像变化和变式练习。真实图片上传和多模态识别作为 P1 增强能力实现，必须保证样例题主路径不受模型配置影响。

### In Scope

- 高中数学单题诊断
- 内置 2-3 道高质量样例错题
- P1 接入 Anthropic-compatible 多模态 provider，MiMo first；未来 Kimi、DeepSeek 通过同一 adapter 接入
- 内置轻量高中数学知识库
- Agent 展示多步骤诊断过程
- 输出结构化错因报告
- 生成 3 道变式练习题；P0 使用预写变式题，P1 再接入 LLM 动态生成
- 使用硬编码 mock 历史数据展示学生长期画像
- 生成轻量 7 天复习计划，计划依据必须可解释
- 展示高考冲刺视角建议，但不做复杂动态规划
- PRD 保留老师端、机构端扩展接口；MVP 代码不提前实现完整后台

### Out of Scope

- 多学科支持
- 完整老师后台
- 完整班级管理
- 在线支付
- 大规模题库系统
- 自动批改整张试卷
- 教材/教辅 PDF 上传解析
- 真正三年真实数据训练
- 复杂多智能体通信
- 动态生成完整高考冲刺方案
- 学生社交、排行榜、社区功能

## 5. Key User Flow

1. 学生进入 Web Demo。
2. 学生选择内置样例题，或上传一张数学错题图片。
3. P0 正式演示固定走样例题路径；P1 图片路径才调用 MiMo 等 Anthropic-compatible 多模态模型抽取题干、学生答案和解题步骤。
4. Agent 查询内置知识库，匹配相关知识点、题型和常见错因。
5. Agent 输出结构化诊断结果。
6. 系统将本次错题写入长期记忆。
7. 页面更新学生画像，包括薄弱知识点、高频错因和复习优先级。
8. 系统展示 3 道变式练习题；P0 优先使用样例题中预写的变式题。
9. Agent 生成轻量 7 天复习计划，并说明计划依据。
10. 学生可以查看“高考冲刺视角”的长期复习建议。

## 6. Agent Workflow

Agent 不应表现为单次问答，而应体现多步骤任务执行、工具调用、长期记忆更新和学习规划能力。一次错题诊断不是“上传图片后直接生成答案”，而是一个可解释的诊断流程：

MVP 采用“单主 Agent 编排多个专家模块”的结构，而不是复杂多智能体架构。Learning Coach Agent 作为唯一主 Agent，负责判断任务类型、组织上下文、调用工具和汇总最终报告；图片识别、知识点映射、错因诊断、长期记忆更新、练习生成和复习规划都作为专家模块被主 Agent 调用。

```text
Learning Coach Agent
  -> Image Extraction Module
  -> Knowledge Retrieval Module
  -> Knowledge Mapping Module
  -> Mistake Diagnosis Module
  -> Memory Manager Module
  -> Practice Generator Module
  -> Review Planner Module
```

这种结构可以在黑客松阶段保证稳定和可控，同时保留后续演进为多智能体系统的空间。未来扩展到老师端、家长端、多科目 RAG 和机构知识库时，可以再拆分为学习教练 Agent、错题诊断 Agent、知识库检索 Agent、教师报告 Agent 和家长沟通 Agent。

### MVP Execution Strategy

MVP 不做流式 SSE，不做 8 个独立接口，也不让前端串行调用多个 Agent。第一版采用“后端一次性返回完整诊断结果 + 前端步骤动画模拟”的策略。

执行方式：

```text
前端提交 /api/diagnose
-> 后端完成识别、检索、诊断、memory_delta、练习和计划
-> 一次性返回完整 JSON
-> 前端按 steps 数组依次高亮展示 Agent 过程
```

前端展示 6 个用户可理解步骤：

1. 识别题目
2. 匹配知识点
3. 分析错因
4. 更新画像
5. 生成练习
6. 规划复习

后端内部仍可以保留 Step 0-8 的结构，但不要求每一步都单独展示。`Task Planning` 是内部任务路由；`Memory Delta Generation` 合并到“更新画像”步骤展示；`Confirmation and Persistence` 在 P0 中自动完成，P1 再做用户确认交互。流式 SSE 和逐步后端推送属于 P2。

P0 `sample_diagnosis` 后端实现走确定性的 TypeScript Pipeline Service：`planTask -> recognizeQuestion -> retrieveKnowledgeContext -> mapKnowledgePoints -> diagnoseMistake -> computeMemoryDelta -> generatePractice -> planReview -> buildDiagnoseResponse`。每一步使用内置样例题、知识点和错因标签数据，不调用外部模型，不写数据库，并保持 `/api/diagnose` 响应契约不变。

P1 `image_diagnosis` 后端通过 vision provider adapter 调用多模态接口。模型只负责图片 OCR 和结构化抽取，输出 `question_text`、`student_answer`、`student_solution_steps`、`extraction_confidence` 和 `warnings`；不要求视觉模型生成标准解法。当前为兼容 `/api/confirm` 既有 payload，服务端仍会在内部 `VisionExtractionDraft` 中保留 `standard_solution_draft` 字段，但缺失时只填入“确认后由分析模型生成”的占位内容。模型输出必须先经过 JSON 解析和边界校验，再返回 `extraction_review` 识别草稿；用户确认后才通过 `/api/confirm` 进入确定性 Pipeline。知识点映射、错因诊断、`memory_delta`、练习和复习计划仍由本地规则生成。

模型输出作为不可信外部输入处理。`student_solution_steps` 可以从字符串数组、多行字符串、或含 `text`/`content`/`step`/`value` 文本字段的对象数组规范化为内部字符串数组；空项和无法解释的项会被丢弃并生成 warning；超过上限的步骤会被截断。缺少 `standard_solution_draft` 不再视为视觉抽取失败，parser 会补入兼容占位并追加 warning；非法 JSON、缺少题干、缺少学生作答区域、越权字段或未声明字段仍返回 recoverable `model_invalid_output`。数学表达式应尽量使用 `$...$` 或 `$$...$$` 包裹，便于前端用 KaTeX 稳定渲染；前端可做有限裸公式兜底，但不得把兜底正则当作完整数学解析器。

P1 图片诊断前端入口包括：图片选择/拖拽、预览、客户端格式校验、提交前压缩到约 600KB、调用 `/api/diagnose` 的 `image_diagnosis` 获取识别草稿、渲染可编辑确认表单，再由用户确认后调用 `/api/confirm` 生成后续 Agent Pipeline 输出。图片识别失败、模型超时、非法 JSON、未配置 API Key、图片过大等场景必须展示 recoverable error，并提供切回样例题路径。未确认、低置信度或确认令牌与草稿不匹配的图片识别结果不得写入 localStorage 学生画像。

P1 本阶段新增识别结果编辑与 `/api/confirm` 确认入口，但仍不包含数据库持久化和 LLM 动态生成练习题。当前 `/api/confirm` 保持无状态：如果用户编辑后的草稿与服务端签发的确认令牌指纹不匹配，系统仍可生成报告，但必须强制 `memory_delta.should_persist=false`，不写长期画像。

P1.5 在 `/api/confirm` 后增加可信诊断降级路径。系统先评估证据等级：`student_work_sufficient` 表示识别到清晰学生答案和步骤，可进入具体错因诊断；`problem_only` 表示至少识别到题干但学生步骤不清，只能生成题型风险和快速追问；`insufficient` 表示题干信息不足，只提示重新上传或改用样例题。`problem_only` 不得直接写具体错因画像；用户跳过追问时只写 `profile_update_kind="problem_type_focus"`，对相关知识点固定轻微下调 `-2` 并加入 `review_priority_changes`，`mistake_cause_changes` 必须为空。用户选择/输入卡点后，系统先返回分析草稿给用户审核；只有用户再次确认后，才用 `persistence_evidence="user_confirmed"` 写入 `profile_update_kind="mistake_cause"`。

P1.5 的 DeepSeek/text analysis provider 边界是“展示增强”，不是“画像写入”。在 `problem_only` 路径中，只要确认令牌 fingerprint 匹配，后端可以可选调用 text analysis provider 补完整标准解法、题型解释、常见卡点说明或用户追问后的分析草稿；这些内容可以展示给学生，也可以作为用户审核前的草稿。但 `evidence_level`、`persistence_evidence`、`profile_update_kind`、`memory_delta`、`student_profile` 和 localStorage 写入决策必须继续由本地证据规则决定。用户未回答追问时，分析模型不得把题目常见易错点直接升级为学生具体错因；用户回答追问后，分析草稿也必须经用户确认，确认后由本地规则把已确认卡点映射到受控错因标签。

P1.6a 增加 Demo smoke stability guard。它不改变用户功能，只把 `sample_diagnosis`、`image_diagnosis` 识别草稿、`/api/confirm`、P1.5 低证据追问、跳过追问、用户确认写入和标准解法展示残留固化为可复现脚本。`npm run test:smoke` 必须在无 API Key、无网络环境下通过；真实 provider smoke 不纳入本阶段，避免把演示稳定性绑定到外部模型可用性。

P1.7 引入 Supabase Postgres 数据底座，但只覆盖确认后的诊断记录、只读错题本和可解释画像事件，不扩展为完整商业系统。新增表为 `students`、`diagnosis_runs`、`mistake_book_items` 和 `memory_events`。`sample_diagnosis` 作为 demo 自动确认路径，在 `memory_delta.should_persist=true` 时也会尝试写入；图片诊断必须经过 `/api/confirm`，并满足服务端证据策略后才写入。当前仍固定 `demo_student_001`，不做登录、权限、老师端、RAG、pgvector、Storage 或完整画像迁移。Supabase 未配置或写入失败时，诊断报告仍返回，错题本展示为空，`sample_diagnosis` 稳定路径不得被数据库依赖破坏。

### 可逐步 Agent 化的边界

为保证演示稳定、数据可控、学生画像不被模型污染，P0/P1 的确定性 Pipeline 是主线。后续可以逐步把部分环节替换为 Agent 或工具调用，但所有智能化输出都必须经过 schema 校验和业务规则收口。

1. 知识点映射：可以从当前规则匹配升级为“检索工具 + LLM 判断 + schema 校验”。Agent 可以负责调用知识库检索和判断候选知识点，但最终只能选择已有 `knowledge_point_id`，不能创造新的内部 key。
2. 错因诊断：可以让诊断 Agent 根据题目、学生步骤和知识点上下文分析错因，但输出必须限制在现有错因标签体系中。Agent 可以补充依据、严重度建议和置信度，不得自由造标签。
3. 练习题生成：这是最适合优先智能化的环节。模型可以根据本题错因和学生历史画像生成变式题，再由 parser 校验结构、题量、难度、知识点绑定和错因绑定；校验失败时回退到预写题或模板题。
4. 7 天复习计划：可以由 Agent 结合历史错题、掌握度、复发错因和高考频率生成计划草稿，但最终计划仍要经过 schema 校验和业务规则检查，确保每个安排都有可解释依据。
5. `memory_delta`：长期仍由规则引擎主导。Agent 可以提供“诊断依据”或“严重度建议”，但不要让模型直接写 `memory_delta`，也不要让模型覆盖学生画像。
6. 学生画像合并：不交给自由 Agent。Agent 可以解释为什么建议调整画像，但真正合并分数、错因频次和复习优先级，应继续由代码控制，并能追溯到本次 `mistake_record` 和 `memory_delta`。

`/api/diagnose` 响应中必须包含 steps 数组：

```json
{
  "steps": [
    {
      "id": "extraction",
      "display_name": "识别题目",
      "status": "completed",
      "duration_ms": 800,
      "summary": "已识别题干、学生答案和主要解题步骤。"
    }
  ]
}
```

P0 中 `sample_diagnosis` 是正式演示路径，不是降级路径。`fallback_used=false`。只有当用户尝试 `image_diagnosis` 且 provider 不可用、超时或返回非法结构时，才视为 recoverable error；其中模型请求失败或非法输出使用 `fallback_used=true`，但不会自动把图片请求替换为样例题结果。

```text
识别当前题
-> 查知识库找依据
-> 查历史画像找个性化背景
-> 诊断本次错误
-> 推导画像变化
-> 生成练习和计划
-> 确认后写入长期记忆
```

### Step 0: Task Planning

输入：用户操作、错题来源、当前学生画像摘要。

MVP 中 `task_type` 由前端根据用户操作传入，不需要 LLM 单独推理。后端根据 `task_type` 做规则路由，避免额外调用模型。

输出：

- 本次任务类型：样例题诊断、真实图片诊断、历史复习规划
- 需要调用的工具：图片识别、知识库检索、学生画像查询、练习生成
- 预期输出：错因报告、变式练习、7 天计划、长期画像更新建议
- 风险提示：图片可能不清晰、题干可能缺失、学生步骤可能无法识别

### Step 1: Multimodal Extraction

输入：错题图片。

输出：

- 题干文本
- 学生答案
- 学生解题步骤
- 图片识别置信度
- 待学生确认或编辑的识别结果

如果图片识别置信度较低，系统应优先提示学生检查或手动编辑识别文本，而不是直接写入长期记忆。

标准解法来源优先级：

```text
样例题预标注 standard_solution
> 确认后 text analysis provider 基于题干、学生答案和学生步骤生成的 standard_solution
> 知识库中的解法模板
> 本地保守占位提示
```

### Step 2: Knowledge Retrieval

输入：题干文本、学生答案、内置轻量知识库。

Agent 根据题目文本检索相关知识库片段，为后续诊断提供依据。MVP 阶段先使用关键词和模块匹配，后续可替换为向量检索。

输出：

- 相关知识点候选
- 相关错因标签定义
- 相关题型标签
- 相似样例题
- 可参考的标准解法模板

### Step 3: Knowledge Point Mapping

输入：题干、解题步骤、内置知识库。

输出：

- 一级知识模块
- 二级知识点
- 题型标签
- 难度等级
- 高考相关度
- 知识点定位置信度
- 需要进一步确认的知识点候选

### Step 4: Mistake Diagnosis

输入：题目、学生答案、标准解法、错因标签体系。

输出：

- 主要错因
- 次要错因
- 错误发生步骤
- 底层能力缺口
- 可执行改进建议
- 本次错误是否属于历史复发模式
- 错误严重度：`minor | medium | severe`
- `diagnosis_confidence`

诊断必须优先使用固定错因标签体系，例如 classification_missing、domain_missing、calculation_error，避免模型自由创造不可统计的错因标签。

### Step 5: Memory Delta Generation

输入：本次诊断结果、历史画像、历史错题记录。

Memory Delta 由后端规则引擎计算，不由 LLM 直接决定。Agent 不直接覆盖学生画像，而是先生成 memory_delta，描述本次错题对长期画像的影响。这样可以避免一次错误识别污染学生三年学习画像。

输出：

- 需要新增的错题记录
- 需要调整的知识点掌握度
- 需要增加的错因频次
- 需要提升的复习优先级
- 标记是否出现复发错误
- 对高考冲刺建议的影响
- 是否建议写入长期记忆

示例：

```json
{
  "knowledge_mastery_changes": {
    "parameter_classification": -8,
    "derivative_monotonicity": -5
  },
  "mistake_cause_changes": {
    "classification_missing": 1,
    "domain_missing": 1
  },
  "is_repeated_mistake": true,
  "review_priority_changes": ["parameter_classification", "function_domain"],
  "should_persist": true,
  "rationale": "P0 样例题使用预标注 delta；P1 再用 severity 和规则表动态计算。"
}
```

### Step 6: Practice Generation

输入：诊断结果、知识点、历史画像。

输出：

- 1 道基础巩固题
- 1 道同类迁移题
- 1 道高考风格综合题
- 每道题附简要训练目标
- 每道题对应的知识点和错因标签

P0 中变式练习题来自样例题 JSON 中的预写题目，保证演示稳定。P1 再接入 LLM 动态生成。练习题不应只围绕本题生成，还应参考学生历史画像。例如学生多次遗漏定义域时，变式题应刻意加入定义域或参数范围陷阱。

### Step 7: Review Planning

输入：本次错题、历史画像、复习优先级。

输出：

- 明日复习任务
- 未来 7 天复习计划
- 需要回看的历史错题
- 需要重点补的知识点
- 每日预计耗时
- 计划生成依据
- 高考冲刺视角建议

复习计划必须说明“为什么这样安排”，例如来自本次错因、历史复发频率、知识点掌握度或高考高频程度。

### Step 8: Confirmation and Persistence

输入：识别结果、诊断结果、memory_delta、学生确认状态。

P0 自动确认并在 `/api/diagnose` 内完成画像更新或返回更新后的画像。P1 图片路径提供学生确认或修改识别文本的交互；确认后才进入知识点映射、错因诊断和画像写入决策。P1.7 起，服务端在确认后的诊断成功响应后尝试写入 Supabase Postgres：

- `students`：当前只保留 demo 学生 `demo_student_001`。
- `diagnosis_runs`：保存一次诊断运行的结构化快照，包括来源、证据等级、知识点、错因、`memory_delta`、练习和复习计划。
- `mistake_book_items`：保存只读错题本条目，用于展示最近错题。
- `memory_events`：保存画像变化事件，记录 `knowledge_mastery_changes`、`mistake_cause_changes`、`review_priority_changes` 和 rationale，便于后续解释“为什么学生画像变了”。

输出：

- 持久化后的错题记录
- 更新后的学生画像
- 本次诊断报告
- 本次诊断是否已验证

MVP 阶段默认自动确认样例题诊断结果；真实图片上传场景在 P1 先展示可编辑识别草稿，再通过无状态 `/api/confirm` 生成报告。低置信度、未确认或确认令牌不匹配的结果只展示报告，不写入长期画像。

P1.7 持久化边界：

- 诊断确认后写入 diagnosis run、错题本条目和 memory event；`sample_diagnosis` 作为 demo 自动确认路径也会写。
- 错题本按 `student_id + question_fingerprint` 去重。同一道题重复确认时保留旧错题，不新增 `mistake_book_items`，不新增 `memory_events`，不报错；前端提示“本题已加入错题本。”。
- 重复题不应再次写入 localStorage demo 画像，避免本地画像变化和数据库 `memory_events` 不一致。
- `diagnosis_runs` 仍保留诊断审计记录；错题本去重只影响错题条目和画像事件，不抹掉一次诊断运行的事实。
- 错题本条目允许前端删除，但必须二次确认，并通过 Next API 在服务端删除；删除 `mistake_book_items` 后，关联 `memory_events` 通过外键级联删除，`diagnosis_runs` 保留。
- 前端不直连数据库；`SUPABASE_SERVICE_ROLE_KEY` 只允许服务端读取，浏览器只能通过 Next.js API 访问错题本。
- 未配置数据库或写入失败时，诊断主流程不失败，错题本为空或保留旧列表。
- 不保存完整图片 base64，不保存 provider secret，不把完整 provider payload 写入数据库。
- localStorage 暂时继续作为 demo 画像恢复来源，不迁移完整学生画像。
- 当前不做登录、RLS 用户策略、老师端、多学生权限、RAG、pgvector 或错题内容编辑。

### Workflow Principles

- MVP 阶段采用单主 Agent 编排专家模块，避免复杂多智能体通信带来的不稳定性。
- 所有诊断结果都应尽量结构化输出，便于长期统计和老师端扩展。
- 长期记忆只保存结构化学习画像，不保存无边界聊天记录。
- 模型输出应受知识点图谱、错因标签体系和 JSON Schema 约束。
- 低置信度识别或诊断不应直接污染学生长期画像。
- 练习和计划必须同时参考本次错题、知识库和学生历史画像。

### Error Handling and Fallback

MVP 必须优先保证演示稳定。样例题路径不依赖模型；图片路径的模型调用失败时返回可恢复错误，不自动伪造成样例题成功。

| 场景 | 处理策略 | 用户看到什么 |
| --- | --- | --- |
| Provider API 超时 | 默认 15 秒后停止等待，可通过服务端 `VISION_PROVIDER_TIMEOUT_MS` 在 5-120 秒内调整；超时返回 `model_timeout`，不写入画像 | 提示“模型响应较慢，请稍后重试或改用样例题” |
| Provider 返回非法 JSON | 返回 `model_invalid_output`，不写入画像 | Agent 过程区显示“结构化输出校验失败，可改用样例题” |
| 图片识别置信度低 | 不直接写入长期记忆，要求学生检查或编辑识别文本 | 识别结果进入可编辑状态，确认后只生成报告 |
| 知识库检索为空 | 返回通用数学诊断上下文，并标记低置信度 | 报告中显示“未找到精确知识点，按通用数学框架诊断” |
| 用户重复点击开始诊断 | 前端禁用按钮直到当前流程结束 | 按钮显示“诊断中” |
| 保存画像失败 | 保留本次报告，不更新长期画像 | 提示“报告已生成，画像稍后同步” |

Demo 降级路径：如果真实图片上传、provider API 或 JSON 校验任一环节失败，系统提示用户改用样例题；样例题路径必须能用预标注数据走完“诊断 -> 画像变化 -> 变式练习 -> 复习建议”的完整流程。

正式演示路径不依赖外部模型：演示者直接选择样例题，系统返回预标注的完整诊断 JSON。真实图片上传只作为 P1/演示后体验。

## 7. Lightweight Knowledge Base

MVP 不做教材和教辅资料上传。第一版使用内置轻量知识库，保证稳定、可控、可演示。

### Knowledge Graph

高中数学知识点图谱，至少覆盖 MVP 样例相关模块。

建议第一版重点覆盖：

- 函数
- 导数
- 数列
- 三角函数
- 解析几何
- 立体几何
- 概率统计

每个知识点包含：

- knowledge_point_id
- display_name
- aliases
- keywords
- parent_id
- grade
- module
- description
- prerequisites
- common_mistakes
- gaokao_frequency

### Mistake Taxonomy

错因标签体系：

- concept_error: 概念理解错误
- formula_error: 公式或定理误用
- calculation_error: 计算错误
- reading_error: 审题错误
- method_error: 方法选择错误
- step_gap: 解题步骤断裂
- classification_missing: 分类讨论遗漏
- domain_missing: 定义域或取值范围遗漏
- transformation_error: 等价变形错误
- strategy_missing: 缺少解题策略

### Question Type Tags

题型和能力标签：

- basic_concept: 基础概念
- standard_method: 常规方法
- transfer: 方法迁移
- comprehensive: 综合应用
- gaokao_style: 高考风格

### Sample Question Library

MVP 内置 2-3 道高质量样例题，建议覆盖：

1. 导数与参数分类讨论
2. 函数定义域与单调性
3. 数列递推或解析几何综合题

每道样例题需要手工标注：

- question_text
- standard_solution
- knowledge_points
- difficulty
- common_mistakes
- expected_diagnosis
- variant_generation_hints

### Retrieval Strategy

MVP 不使用向量数据库。知识库以 JSON 文件存放，应用启动或请求处理时加载到内存。

知识点标识符统一使用 snake_case `id` 作为系统 key，例如 `derivative_monotonicity`；前端展示使用 `display_name`，例如“导数与函数单调性”。学生画像、错题记录、检索结果和 memory_delta 内部都使用 `id`，避免中文名称变化导致数据无法合并。

存储建议：

```text
src/data/knowledge-points.json
src/data/mistake-taxonomy.json
src/data/question-types.json
src/data/sample-questions.json
src/data/mock-student-profile.json
```

检索流程：

1. 从题干和学生答案中提取关键词，例如“导数”“单调性”“参数”“定义域”“数列”“递推”。
2. 先按知识模块匹配，例如命中“导数”时优先检索导数模块。
3. 再按知识点 `display_name`、`aliases`、`keywords`、`description`、`common_mistakes` 做字符串包含匹配。
4. P0 接受基于 `String.includes()` 的简单中文子串匹配，不做中文分词。15-25 个知识点规模下误匹配可控。
5. 计算简单分数：模块命中 +4，知识点显示名命中 +3，关键词命中 +2，别名命中 +2，常见错因命中 +1。同一知识点命中多个字段时分数累加。
6. 返回 Top 5 知识点、Top 5 错因标签、Top 2 相似样例题。
7. 如果没有精确命中，返回通用高中数学诊断上下文，并把 `retrieval_confidence` 标记为 low。

`parent_id` 和 `prerequisites` 在 P0 中只存储不参与检索，P1 可用于知识图谱扩展和前置知识推荐。

检索结果格式：

```json
{
  "knowledge_candidates": ["derivative_monotonicity", "parameter_classification"],
  "mistake_candidates": ["classification_missing", "domain_missing"],
  "question_type_candidates": ["comprehensive", "gaokao_style"],
  "similar_samples": ["sample_derivative_001"],
  "retrieval_confidence": "high"
}
```

后续多科目 RAG 可以把这套 JSON 检索替换为“metadata 过滤 + 向量检索”，但字段边界保持一致。

## 8. Long-Term Memory Model

长期记忆不保存为聊天记录，而保存为结构化学习画像。

### P1.7 Supabase Data Foundation

P1.7 的数据库目标是先建立可审计的数据底座，而不是一次性做完整学习系统。当前四张表的职责如下：

```text
students
  当前固定 demo_student_001，作为所有诊断记录的学生外键。

diagnosis_runs
  保存一次诊断运行的结构化快照，包含 source、evidence_level、
  persistence_evidence、profile_update_kind、recognized_question、
  knowledge_mapping、mistake_diagnosis、memory_delta、student_profile_snapshot、
  practice_questions、review_plan 和 warnings。

mistake_book_items
  保存只读错题本条目，包括题干、学生答案、标准解法、知识点、
  错因、严重度、诊断摘要、证据等级、题目 fingerprint 和复习状态。

memory_events
  保存本次画像变化事件，包括 knowledge_mastery_changes、
  mistake_cause_changes、review_priority_changes、is_repeated_mistake、
  rationale 和证据字段。
```

`memory_events` 独立成表，是为了让后续 Agent、老师端或复习规划可以追溯“为什么这个学生画像变了”，而不是只能读取最新画像分数。当前阶段不做 `student_profiles` 云端聚合表，避免在没有登录和权限模型时迁移完整画像；localStorage 继续负责 demo 画像恢复。

数据库写入只发生在服务端确认后的路径：`sample_diagnosis` 自动确认，`confirmed_image_diagnosis` 需要 `/api/confirm` 和服务端证据策略允许。`image_diagnosis` 的识别草稿、完整图片 base64 和未确认内容不进入错题本持久化。

错题本去重由服务端从题干生成 `question_fingerprint`，数据库用 `(student_id, question_fingerprint)` 唯一索引兜底。迁移不自动删除历史重复错题；如果历史数据已经存在重复 fingerprint，先写入 `mistake_book_item_dedupe_candidates` 报告并 fail fast，避免无审计地删除学习记录。P1.7 的删除只删除错题本条目及其关联 memory event，不删除诊断运行快照。

### Mistake Record

```json
{
  "mistake_id": "string",
  "student_id": "string",
  "subject": "math",
  "grade": "高二",
  "source": "upload | sample",
  "question_text": "string",
  "student_answer": "string",
  "standard_answer": "string",
  "knowledge_points": ["derivative_monotonicity", "parameter_classification"],
  "question_type_tags": ["comprehensive", "gaokao_style"],
  "difficulty": 4,
  "mistake_causes": ["classification_missing", "domain_missing"],
  "diagnosis_summary": "string",
  "improvement_advice": "string",
  "review_status": 0,
  "is_repeated_mistake": false,
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

### Student Profile

```json
{
  "student_id": "string",
  "grade": "高二",
  "subject": "math",
  "mastery_scores": {
    "derivative_monotonicity": 62,
    "parameter_classification": 41,
    "function_domain": 58
  },
  "frequent_mistake_causes": {
    "classification_missing": 8,
    "domain_missing": 6,
    "calculation_error": 4
  },
  "weak_modules": ["derivative", "function", "sequence"],
  "review_priority": ["parameter_classification", "function_domain", "derivative_inequality"],
  "recent_trend": "导数综合题错误率上升",
  "gaokao_focus": [
    {
      "knowledge_point": "parameter_classification",
      "reason": "最近 90 天同一知识点和错因重复出现，且属于高考高频导数综合题。",
      "priority": 1
    }
  ],
  "created_at": "datetime",
  "updated_at": "datetime"
}
```

全局 ID 约定：Mistake Record、Student Profile、memory_delta、检索结果内部全部使用 snake_case `id`。前端展示时通过 `knowledge-points.json` 查找 `display_name`。前端启动时构建 `knowledgePointMap: Map<string, KnowledgePoint>`，用于 O(1) 查找中文名称、模块和高考频率。

### Mastery Score Update Rules

MVP 使用可解释的简化规则更新掌握度，避免长期画像只是静态展示。

P0 样例题路径使用预标注 `memory_delta`，并附 rationale 解释扣分原因；P1 的真实图片路径再按下面规则动态计算。这样可以保证主演示稳定，同时保留后续泛化规则。

基础规则：

- 每个知识点掌握度范围为 0-100。
- 未出现过的知识点初始值为 70。
- 本次错题涉及的主要知识点按错误严重度扣分。
- 学生完成变式练习并做对后，相关知识点加分。
- 所有分数更新后都需要 clamp 到 0-100。

扣分规则：

```text
轻微错误：-3，例如计算错误但思路正确
中等错误：-6，例如关键步骤断裂、公式误用
严重错误：-10，例如核心概念错误、完全不会分类讨论
复发错误：额外 -3
高考高频知识点：额外 -2
```

P0 只展示本次诊断导致的掌握度下降和复习优先级上升。回升规则用于 P1 的“完成练习后更新画像”，P0 不做真实答题批改。

回升规则：

```text
基础巩固题做对：+4
同类迁移题做对：+6
高考综合题做对：+8
同一知识点连续 3 次做对：额外 +5，并降低复习优先级
```

复习优先级计算：

```text
priority_score =
  (100 - mastery_score)
  + recent_mistake_count * 8
  + repeated_mistake_count * 10
  + gaokao_frequency_weight
```

其中 gaokao_frequency_weight：high = 15，medium = 8，low = 3。对高考高频知识点，系统同时提高扣分和复习优先级，是为了表达“同样的错误在高频考点上更需要立刻修复”。计算所有知识点的 priority_score，按降序排列，取 Top 5 作为 review_priority。

时间窗口和复发定义：

```text
recent_mistake_count = 最近 30 天内同一知识点相关错题数量
repeated_mistake_count = 最近 90 天内“同一知识点 + 同一错因”重复出现次数
is_repeated_mistake = 同一知识点 + 同一错因出现次数 >= 2
```

memory_delta 不直接覆盖画像，而是以增量方式合并：

```text
new_mastery_score = clamp(old_mastery_score + mastery_change, 0, 100)
new_mistake_count = old_mistake_count + delta_count
review_priority = 按 priority_score 重新排序
```

`review_status` 枚举：

```text
0 = 未复习
1 = 已加入复习计划
2 = 已复习
3 = 已掌握
```

P0 只会设置 0 和 1；2 和 3 用于 P1 的练习完成和复习反馈闭环。

### Teacher Extension Fields

第一版可以不做老师端页面，但数据结构保留：

```json
{
  "class_id": "string",
  "teacher_id": "string",
  "school_id": "string",
  "textbook_version": "string",
  "exam_batch_id": "string"
}
```

## 9. Anthropic-compatible Provider Requirements

P1 图片路径采用 Anthropic-compatible provider adapter，当前优先接入 MiMo，未来 Kimi、DeepSeek 作为新的 provider 实现接入。模型只做图片抽取，不直接生成最终错因诊断、`memory_delta`、学生画像覆盖或练习计划。

MiMo `mimo-v2.5` 在 Anthropic-compatible 接口中需要显式设置 `thinking.type="disabled"`，否则可能只返回 thinking block 而没有可解析 text block。

### Required Capabilities

- 图片理解
- 中文数学题识别
- 按约定 JSON 输出抽取结果
- 支持低置信度标记和 warnings
- 不输出画像、错因频次或 memory_delta

### Prompt Strategy

每次诊断时提供：

- 用户上传图片
- 当前学生画像摘要
- 图片抽取 JSON 格式要求
- 明确禁止输出 `memory_delta`、`student_profile`、`mistake_history`、错因频次或画像更新

### Output Contract

模型必须输出纯 JSON 对象，再由服务端校验并转换为内部结构。不要直接把自然语言长回答作为唯一结果；不要输出 Markdown 代码块。

建议输出字段：

```json
{
  "question_text": "string",
  "student_answer": "string",
  "student_solution_steps": ["string"],
  "extraction_confidence": "high | medium | low",
  "warnings": []
}
```

过渡期内部类型仍保留 `standard_solution_draft`，但它不再由视觉模型负责生成；缺失时服务端填入兼容占位，确认后由 `ANALYSIS_PROVIDER_*` 基于用户确认文本生成最终 `mistake_diagnosis.standard_solution`。

## 10. Technical Architecture

MVP 技术栈建议固定，避免开发前继续摇摆。

### Recommended Stack

- Frontend: Next.js + TypeScript
- Styling: Tailwind CSS
- Math rendering: KaTeX
- Backend: Next.js API Route
- AI Provider: Anthropic-compatible provider adapter，MiMo first，由后端代理调用
- Storage: 本地 JSON 文件 + 浏览器 localStorage
- Knowledge Base: JSON 文件内置，运行时内存检索
- Student Identity: MVP 使用匿名 `demo_student_001`

### API Design

P0 只保留一个核心接口：

```text
POST /api/diagnose
输入：sample_question_id 或 image_base64、student_id、task_type、student_profile、mistake_history
输出：结构化诊断报告、steps、memory_delta、更新后的 student_profile、练习题、复习计划
```

P1 增加无状态确认接口：

```text
POST /api/confirm
输入：confirmation_token、confirmed_extraction、student_id、student_profile、mistake_history
输出：完整图片诊断报告、memory_delta、更新后的 student_profile
```

`/api/confirm` 属于 P1。P0 中样例题诊断结果自动确认，持久化和画像更新在 `/api/diagnose` 中完成或由前端 localStorage 模拟完成。P1 图片路径中，`/api/diagnose` 只负责服务端图片抽取和签发确认令牌，`/api/confirm` 负责接收用户确认后的草稿并复用确定性 Pipeline；模型和前端都不得直接写 `memory_delta` 或覆盖学生画像。

样例题路径也走 `/api/diagnose`，不要让前端绕过后端读取本地 JSON 后单独渲染。这样正常输出和 fallback 输出可以共用同一套前端渲染逻辑。

MVP 不需要单独实现 `GET /api/samples`。前端可以直接从内置 `sample-questions.json` 读取样例列表用于选择器；点击诊断时仍提交 `sample_question_id` 到 `/api/diagnose`。

### Diagnose API Contract

#### Execution Branches

| 条件 | 执行路径 | Provider | 检索/规则 | 返回 |
| --- | --- | --- | --- | --- |
| `task_type=sample_diagnosis` | 读取 `sample-questions.json` 预标注数据 | 不调用 | 使用预标注知识点、错因、变式题；合并前端传入的 profile/history | 200，`fallback_used=false` |
| `task_type=image_diagnosis` 且 `VISION_PROVIDER_API_KEY` 已配置（或 legacy `MIMO_API_KEY` 已配置） | 执行图片抽取，返回 `extraction_review` 草稿和 `confirmation_token` | 按 `VISION_PROVIDER_PROTOCOL` 调用 vision provider | 不执行后续诊断，不写画像 | 200，`fallback_used=false` |
| `task_type=image_diagnosis` 且两套 provider API Key 均未配置 | 不做自动样例替换，返回可恢复错误 | 不调用 | 不执行 | 400，`model_not_configured` |
| Provider 超时、请求失败或非法 JSON | 返回可恢复错误，并提供样例题入口 | 调用失败 | 不写入画像 | 502，`fallback_used=true` |
| `task_type=confirmed_image_diagnosis` 经 `/api/confirm` 提交 | 校验确认令牌、草稿和 `confirmation_action`，再进入确定性 Pipeline；fingerprint 匹配时可选调用 text analysis provider 增强报告文本，`problem_only` 也可用它补完整标准解法和追问分析草稿 | 可选调用 `ANALYSIS_PROVIDER_*`；provider 失败、越权输出或 fingerprint 不匹配时回退本地规则 | 使用知识库映射、证据评估、错因规则、memory_delta 规则和现有练习/复习模板；分析模型只覆盖展示文本，不决定画像写入 | 200，`fallback_used=false` |

P0 主路径是 `sample_diagnosis`。它是设计好的演示路径，不是失败降级。

请求：

```json
{
  "student_id": "demo_student_001",
  "task_type": "sample_diagnosis",
  "sample_question_id": "sample_derivative_001",
  "image_base64": null,
  "student_profile": {},
  "mistake_history": []
}
```

`task_type` 枚举：

```text
sample_diagnosis = 样例题诊断
image_diagnosis = 真实图片诊断
```

响应：

```json
{
  "diagnosis_id": "diag_001",
  "source": "sample",
  "steps": [],
  "recognized_question": {},
  "knowledge_mapping": {},
  "mistake_diagnosis": {},
  "memory_delta": {},
  "student_profile": {},
  "practice_questions": [],
  "review_plan": {},
  "sample_diagnosis": {},
  "fallback_used": false,
  "warnings": []
}
```

P0 接口壳为兼容当前单页工作台，会额外返回 `sample_diagnosis`，内容为对应样例题的完整预标注诊断对象。前端当前可直接用该字段渲染；`image_diagnosis` 成功时 `sample_diagnosis=null`，前端后续应优先使用上面的结构化字段渲染。

`image_diagnosis` 的 `/api/diagnose` 成功响应不是完整诊断报告，而是待确认识别草稿：

```json
{
  "diagnosis_id": "diag_image_draft_x",
  "student_id": "demo_student_001",
  "source": "image",
  "stage": "extraction_review",
  "recognized_question": {
    "id": "image_draft_x",
    "title": "图片识别错题",
    "module": "待确认",
    "question_text": "string",
    "student_answer": "string",
    "student_solution_steps": ["string"],
    "standard_solution_draft": "string",
    "extraction_confidence": "high | medium | low"
  },
  "requires_confirmation": true,
  "can_persist_after_confirmation": true,
  "confirmation_token": "opaque-signed-token",
  "sample_diagnosis": null,
  "fallback_used": false,
  "warnings": []
}
```

`standard_solution_draft` 在当前响应中主要用于兼容确认 token、指纹和既有服务端 schema；前端确认区不展示该字段，也不要求用户编辑标准解法。最终报告中的 `standard_solution` 优先由确认后的 text analysis provider 生成，provider 不可用时回退为本地保守提示。

`confirmation_token` 只作为不透明字符串交给前端；token payload 不包含完整题干、学生答案、标准解法草稿或图片内容。生产环境必须配置 `MATHTRACE_CONFIRM_SECRET` 用于签名和草稿指纹校验；开发环境优先使用 `MATHTRACE_CONFIRM_SECRET`，未配置时回退到稳定本地 demo secret，不得回退到 `VISION_PROVIDER_API_KEY` 或 legacy `MIMO_API_KEY`，避免切换模型配置时让未确认草稿失效。确认后完整图片诊断响应仍使用 `source="image"`，并由服务端返回的 `memory_delta.should_persist` 决定是否允许前端写入 localStorage；前端不得再用低置信度自行否决服务端允许的 `problem_type_focus` 写入。

`/api/confirm` 支持的 `confirmation_action`：

```text
diagnose_from_student_work = 默认动作，学生步骤充分时走正常具体错因诊断
skip_follow_up = 题干可识别但学生步骤不清时，跳过追问，只写题型/考点关注
submit_stuck_point = 学生选择或输入卡点后生成分析草稿，不写画像
confirm_stuck_point_analysis = 用户审核草稿后确认写入具体错因
```

图片诊断完整响应新增证据和写入策略字段：

```json
{
  "evidence_level": "student_work_sufficient | problem_only | insufficient",
  "persistence_evidence": "student_work | user_confirmed | uploaded_problem_only | none",
  "profile_update_kind": "mistake_cause | problem_type_focus | none",
  "risk_follow_up": {
    "problem_type": "导数中的极值点与参数范围",
    "knowledge_points": ["derivative_monotonicity"],
    "common_stuck_points": [
      {
        "id": "classification_missing",
        "label": "分类讨论",
        "related_mistake_cause": "classification_missing"
      }
    ],
    "standard_solution_summary": "先求导，再分类讨论。",
    "prompt": "你主要卡在哪里？"
  }
}
```

HTTP 状态码：

```text
200 = 成功，包括 sample_diagnosis 正常返回
400 = 参数错误，例如未选择样例题、未上传图片、provider 未配置但请求 image_diagnosis
413 = 图片过大
500 = 服务端未知错误
502 = provider 超时、请求失败或返回非法结构
```

错误码：

```text
invalid_json
invalid_request
missing_sample_question_id
unknown_sample_question_id
missing_image
invalid_image
image_too_large
model_not_configured
model_timeout
model_request_failed
model_invalid_output
```

图片诊断 provider 请求层失败时，错误响应可以包含 `provider_debug`：

```json
{
  "error": {
    "code": "model_request_failed",
    "message": "图片诊断模型服务返回 HTTP 502，请稍后重试。",
    "recoverable": true
  },
  "fallback_used": true,
  "warnings": [],
  "provider_debug": {
    "provider_name": "anthropic_compatible_vision",
    "provider_stage": "vision_llm",
    "failure_kind": "http_error",
    "http_status": 502
  }
}
```

`provider_debug` 只能包含 provider 名称、阶段、失败类型和 HTTP 状态，不得包含 API Key、图片 base64、原始模型响应、题干、学生答案或学生画像明细。`provider_stage` 当前使用 `vision_llm`，未来接入 OCR 时可以复用同一结构使用 `ocr`。`failure_kind` 当前包括 `http_error`、`invalid_json`、`empty_text_content`、`network_failed` 和 `timeout`；其中 `empty_text_content` 表示 provider HTTP/JSON 响应成功，但响应体没有可解析的文本内容。

图片上传策略：

- P1 真实图片上传使用前端压缩后的 base64，放在 JSON body 的 `image_base64` 字段。
- 前端应把送入模型的图片压缩到约 600KB，降低 vision provider 超时概率；后端仍保留 1MB 请求图片上限，避免 Next.js API Route body size 风险。
- 如果图片超过限制，前端提示用户压缩或重新拍照。
- 未确认、确认令牌不匹配或证据等级为 `insufficient` 的图片识别结果只展示报告或识别草稿，不写入 localStorage 学生画像；模型仍不得直接写 `memory_delta` 或覆盖学生画像。
- `problem_only` 是可信降级路径，不等同于失败：跳过追问时允许写入题型/考点关注并轻微下调相关掌握度，但不得写具体错因；提交卡点后必须先展示分析草稿，用户确认后才允许写具体错因。
- 开发环境下，`model_invalid_output` 可返回安全诊断摘要，只包含输出类型、字段列表、缺失字段和字段长度，不包含图片 base64、完整题干或学生答案原文。
- 如果模型未识别到学生答案，prompt 要求仍输出 `student_answer="未识别到学生答案"`、`extraction_confidence="low"` 和对应 warnings；若模型仍缺字段，前端显示“没有识别到学生作答区域”的可恢复提示。
- 如果模型已返回题干和学生答案，但缺少 `standard_solution_draft`、`extraction_confidence` 或 `warnings`，解析层可做有界补齐：标准解法草稿使用“确认后由分析模型生成”的兼容占位内容，置信度按 `low` 处理，warnings 缺失按空数组处理并追加安全提醒。此类结果仍必须进入用户确认，不得直接写入长期画像。
- 后端不能完全信任模型自报置信度：当 `student_answer` 表示未识别到学生答案，或 `student_solution_steps` 为空时，解析层必须强制降级为 `extraction_confidence="low"`，补充 warning，并确保后续 `memory_delta.should_persist=false`。
- P1.5 起，低置信度不再自动等于“永不写画像”：只有服务端证据策略允许的 `problem_type_focus` 或 `user_confirmed` 才能写入；前端必须以服务端 `memory_delta.should_persist` 和响应 guard 为准。
- 图片诊断请求失败但页面保留旧报告时，前端必须标明“当前显示的是上一次成功结果或样例题结果”，并展示本次失败的安全原因，避免用户误以为旧报告来自本次失败请求。
- 若后端需要支持更大图片，再调整 API Route body size 或改为 multipart/form-data；这属于 P1 实现细节。

### Vision Provider API Key Handling

Vision provider API Key 只能放在服务端环境变量中，不允许前端直连。当前实现支持 `anthropic` 与 `openai` 两类协议：Anthropic-compatible provider 使用 Messages 格式；OpenAI-compatible provider 使用 `chat/completions` 和 `image_url` 格式，可接 GLM-4.6V-FlashX 等视觉模型。

```text
VISION_PROVIDER_PROTOCOL=openai
VISION_PROVIDER_BASE_URL=https://open.bigmodel.cn/api/paas/v4
VISION_PROVIDER_MODEL=glm-4.6v-flashx
VISION_PROVIDER_API_KEY=<local-secret>
VISION_PROVIDER_NAME=glm_4_6v_flashx
VISION_PROVIDER_IMAGE_FORMAT=base64
VISION_PROVIDER_TIMEOUT_MS=60000
MATHTRACE_CONFIRM_SECRET=<stable-local-secret>
```

旧的 `MIMO_BASE_URL`、`MIMO_MODEL`、`MIMO_API_KEY` 仍作为本地兼容别名保留；新配置优先使用 `VISION_PROVIDER_*`。`MATHTRACE_CONFIRM_SECRET` 独立于 provider API Key，只用于确认 token 和草稿指纹，不参与模型调用。`provider_debug.provider_name` 默认使用 `anthropic_compatible_vision`，如需区分本地 provider，可显式设置 `VISION_PROVIDER_NAME`，但不得包含 API Key 或私密信息。OpenAI-compatible 图片字段默认使用 data URL；GLM-4.6V-FlashX 使用裸 base64，应配置 `VISION_PROVIDER_IMAGE_FORMAT=base64`。

前端只调用本项目的 API Route。演示环境中如果没有配置 API Key，正式演示仍走 `sample_diagnosis`；`image_diagnosis` 返回可恢复错误并提示用户改用样例题。

### Text Analysis Provider API Key Handling

确认图片识别草稿后，后端可以可选调用 text analysis provider 增强报告表达。当前推荐使用 DeepSeek V4 Flash 的 OpenAI-compatible 接口：

```text
ANALYSIS_PROVIDER_PROTOCOL=openai
ANALYSIS_PROVIDER_BASE_URL=https://api.deepseek.com
ANALYSIS_PROVIDER_MODEL=deepseek-v4-flash
ANALYSIS_PROVIDER_API_KEY=<local-secret>
ANALYSIS_PROVIDER_NAME=deepseek_v4_flash
ANALYSIS_PROVIDER_TIMEOUT_MS=60000
```

`ANALYSIS_PROVIDER_*` 与 `VISION_PROVIDER_*` 分离：前者只接收用户确认后的题干、学生答案、学生步骤和追问回答（如有），不接收图片 base64，也不依赖视觉模型生成的标准解法草稿；后者只负责图片抽取。未配置、请求超时、HTTP 失败、非法 JSON 或输出越权字段时，`/api/confirm` 必须回退到本地确定性规则报告，不阻塞确认流程，也不影响 `sample_diagnosis`。

P1.5 起，text analysis provider 不只服务 `student_work_sufficient` 正常诊断，也可以服务 `problem_only` 可信降级路径：

- `problem_only + diagnose_from_student_work`：可补完整标准解法、题型解释和常见卡点展示，但 `should_persist=false`。
- `problem_only + skip_follow_up`：可补完整标准解法和题型解释；写入仍只能是本地规则生成的 `problem_type_focus`，`mistake_cause_changes` 必须为空。
- `problem_only + submit_stuck_point`：可结合用户选择/输入的卡点生成分析草稿；草稿只展示给用户审核，`should_persist=false`。
- `problem_only + confirm_stuck_point_analysis`：可增强展示文案；是否写入、写入哪些受控错因标签，仍由本地 `follow_up_answer` 映射和证据策略决定。

确认令牌 fingerprint 不匹配时，不调用 text analysis provider，也不得写入长期画像。

`ANALYSIS_PROVIDER_PROTOCOL` 当前仅支持 `openai`；`ANALYSIS_PROVIDER_BASE_URL` 可以配置 provider 根地址，也可以直接配置到 `/chat/completions`，服务端不得重复拼接 endpoint。

分析模型只能增强以下展示字段：

- `mistake_diagnosis.expected_diagnosis`
- `mistake_diagnosis.step_analysis`
- `mistake_diagnosis.solution_highlights`
- `mistake_diagnosis.standard_solution`

以下字段必须继续由本地确定性规则生成，分析模型不得直接写入、覆盖或间接决定：

- `knowledge_mapping`
- `mistake_diagnosis.mistake_causes`
- `mistake_diagnosis.severity`
- `memory_delta`
- `student_profile`
- `practice_questions`
- `review_plan`
- localStorage 持久化决策

分析模型输出必须是 JSON 对象，并禁止包含 `memory_delta`、`student_profile`、`mistake_history`、`knowledge_mastery_changes`、`mistake_cause_changes`。如果出现这些字段，本次分析增强结果应被丢弃，报告回退到本地规则版本。

### Data Storage Boundary

MVP 数据分三类：

- 内置知识库：项目 JSON 文件，只读。
- mock 学生画像：项目 JSON 文件初始化，前端首次加载时写入 localStorage。
- 本次诊断结果：前端继续用 localStorage 恢复 demo 画像；P1.7 起，确认后的诊断运行、错题本条目和画像事件可写入 Supabase Postgres。

P0/P1 采用前端 demo 画像恢复模型：

```text
页面启动
-> 从 localStorage 读取 student_profile 和 mistake_history
-> 如果不存在、不可解析或结构不匹配，则从 mock-student-profile.json 初始化
-> 调用 /api/diagnose 时把 student_profile 和 mistake_history 一起传给后端
-> 后端无状态计算 memory_delta 和 updated_student_profile
-> 前端用返回的 updated_student_profile 覆盖 localStorage
```

刷新页面不会丢失 localStorage 中的 demo 状态；localStorage 损坏、缺失或读写失败时回退到初始 mock 数据；点击“重置画像”可恢复初始 mock 数据。P1.7 的 Supabase 写入不替代这套 demo 画像恢复模型，只补充可审计的 diagnosis run、mistake book item 和 memory event。

### Database and RAG Evolution

数据库和 RAG 能力按阶段演进，不提前引入超过当前规模的基础设施。

#### Phase 1: Hackathon MVP

```text
本地 JSON + localStorage
```

用途：

- 内置知识库
- 样例题
- mock 学生画像
- 本次诊断结果

原则：优先保证演示稳定，不引入真实数据库、登录系统或远程向量检索。

#### Phase 1.7: Supabase Postgres Mistake Book Foundation

```text
Supabase PostgreSQL + server-only service role + Next API
```

用途：

- `students` 固定 demo 学生。
- `diagnosis_runs` 保存诊断运行快照。
- `mistake_book_items` 支持错题本展示、去重和删除 MVP。
- `memory_events` 保存画像变化事件和解释依据。

边界：

- 不做登录、老师端、RLS 用户策略、RAG、pgvector、Storage 或完整画像迁移。
- 前端不直连数据库，service role key 只在服务端读取。
- 重复题不新增错题或 memory event，删除错题必须二次确认且不删除 `diagnosis_runs` 审计记录。
- 未配置数据库时，demo 仍可运行，错题本为空，诊断主流程不失败。

#### Phase 2: Usable Product

```text
Supabase PostgreSQL + Storage + Auth + pgvector
```

用途：

- PostgreSQL 存储学生、错题、画像、错因、复习计划、老师/班级基础关系。
- Supabase Storage 存储错题图片、试卷图片、讲义 PDF、教材 PDF。
- Supabase Auth 支持学生、家长、老师基础账号体系。
- pgvector 支持早期 RAG：教材 chunk、讲义 chunk、题目解析和相似错题检索。

选择原因：Supabase 能用较低工程成本同时覆盖业务数据、文件存储、登录和早期向量检索，适合从黑客松 Demo 过渡到可用产品。

#### Phase 3: Institution-Scale RAG

```text
PostgreSQL + Milvus + 对象存储 + 权限系统
```

分工：

- PostgreSQL 是业务主库，存储用户、学生画像、错题记录、知识点图谱、错因标签、老师/班级/机构权限、文档元数据。
- Milvus 是向量检索库，存储教材、教辅、讲义、相似题、历史错题等 embedding。
- 对象存储保存原始文件，包括错题图片、试卷图片、教材 PDF、教辅 PDF 和老师讲义。

Milvus 不替代 PostgreSQL。Milvus 只负责相似内容召回，PostgreSQL 仍然是事实来源和权限判断中心。

典型检索流程：

```text
用户上传错题
-> PostgreSQL 读取学生画像、年级、教材版本和权限范围
-> 根据 subject / grade / organization_id / class_id 做 metadata 过滤
-> Milvus 检索相似 chunks，返回 chunk_id
-> PostgreSQL 根据 chunk_id 查文档元数据、来源、知识点和权限
-> 组装 RAG 上下文给模型
```

Milvus 适合在以下条件出现后引入：

- 文档 chunk 达到几十万或百万级
- 多学校、多机构知识库隔离变复杂
- RAG 召回质量和延迟成为核心指标
- 需要更强的向量索引、批量写入和检索扩展能力

阶段原则：先用 pgvector 验证 RAG 产品价值，再在规模上来后迁移到 Milvus。

## 11. Web Demo Pages

### Main Page

第一版可以做成一个完整工作台页面，不必拆成多页。

数学公式渲染使用 KaTeX。样例题数据中的公式统一使用 `$...$` 或 `$$...$$` 包裹；`question_text`、`student_answer`、`standard_solution`、`practice_questions[].question` 都按该格式存储。P0 不做复杂公式编辑器，只做只读渲染。

核心 UI 文案：

```text
产品名：错因地图 MathTrace
一句话定位：看见每一次错误背后的长期模式
主按钮：开始诊断
样例题按钮：使用导数样例题
加载文案：正在定位知识点与错因
fallback 文案：模型响应不稳定，请改用预标注样例以保证演示闭环
画像区标题：长期学习画像
复习区标题：接下来 7 天怎么补
```

页面区域：

1. 顶部产品区
   - 产品名
   - 一句话定位
   - 当前学生年级和目标考试

2. 错题输入区
   - 图片上传
   - 样例题选择
   - 开始诊断按钮

3. Agent 过程区
   - 展示 6 个用户可理解步骤：识别题目、匹配知识点、分析错因、更新画像、生成练习、规划复习
   - 后端内部 Step 0-8 不全部展示
   - Memory Delta 合并到“更新画像”中展示

4. 错因报告区
   - 题目识别结果
   - 知识点
   - 主要错因
   - 错误步骤
   - 改进建议

5. 变式练习区
   - 基础巩固
   - 同类迁移
   - 高考综合

6. 长期画像区
   - 薄弱知识点排行
   - 高频错因
   - 最近趋势
   - 高考冲刺建议

7. 轻量 7 天复习建议区
   - 每日任务
   - 复习重点
   - 旧错题回看建议
   - 计划依据 rationale

P0 页面可以分为上下两个屏，不要求所有信息挤在首屏。首屏优先展示输入区、Agent 过程区和错因报告；次屏展示画像、变式练习和复习建议。

前端状态机：

| 状态 | 触发 | 页面表现 |
| --- | --- | --- |
| idle | 首次进入或重置画像 | 展示产品介绍、样例题选择、开始诊断按钮 |
| diagnosing | 点击开始诊断 | 禁用按钮，逐步高亮 6 个 Agent 步骤 |
| result | `/api/diagnose` 返回 200 | 展示错因报告、画像变化、变式题和复习建议 |
| extraction_review | 图片抽取成功但未确认 | 展示可编辑识别结果；右侧保留旧报告并标明确认后才生成新报告 |
| fallback | image_diagnosis 失败 | 展示可恢复错误提示和“切回样例题”按钮，不覆盖当前可见报告 |
| error | 参数错误或服务端错误 | 展示可恢复错误信息 |

未选择样例题且未上传图片时，“开始诊断”按钮置灰，并提示“请选择样例题或上传错题图片”。

Demo 辅助功能：

- 提供隐藏的“重置画像”按钮或快捷键，将 localStorage 恢复为 mock 初始数据。
- 准备 4 个关键页面状态截图：首屏、Agent 过程、诊断报告、长期画像。如果 live demo 失败，可切换截图继续讲解。

### Optional Future Pages

- 错题本
- 学习画像详情
- 高考冲刺计划
- 老师班级看板
- 家长周报

## 12. Success Criteria

### Hackathon Demo Success

- 评委能在 1 分钟内理解产品价值
- 评委能上传或选择一道错题完成诊断
- 页面清楚展示 Agent 多步骤过程
- 输出不是泛泛讲解，而是具体错因诊断
- 能看到长期画像如何影响复习计划
- 能讲清楚为什么这个产品越用越有价值

### Product Success

- 学生愿意持续上传错题
- 学生能理解并接受错因分析
- 复习计划能减少重复错误
- 老师或家长能从画像中看到可行动建议
- 数据积累后，诊断质量和计划个性化程度持续提升

## 13. Commercial Expansion Path

### Stage 1: Student Self-Learning Assistant

- 个人错题诊断
- 长期画像
- 复习计划
- 订阅制或 freemium

### Stage 2: Parent-Facing Report

- 周报/月报
- 薄弱点总结
- 学习风险提醒
- 考前复习建议

### Stage 3: Teacher/Classroom Dashboard

- 班级共性薄弱点
- 分层作业生成
- 学生个体画像
- 考试后错因聚类

### Stage 4: Institution Knowledge Base

- 上传校本教材
- 上传机构讲义
- 建立专属题库
- 按教学进度诊断和推荐
- 技术上从 Supabase pgvector 逐步演进到 PostgreSQL + Milvus + 对象存储，支撑多机构、大规模文档 RAG 和权限隔离。

## 14. Risks and Mitigations

### OCR or Image Understanding Is Unstable

Mitigation:

- 保留 2-3 道高质量样例题
- 上传失败时允许学生手动编辑识别文本
- Demo 优先展示样例闭环

### Model Diagnosis Is Too Generic

Mitigation:

- 使用固定错因标签体系
- 使用知识点图谱约束输出
- 要求模型按 JSON Schema 输出
- 对 MVP 样例题做手工标注作为参考

### Problem-Only Images Pollute Student Memory

Mitigation:

- 在 `/api/confirm` 后增加 `evidence_level` 评估。
- 只有 `student_work_sufficient` 或 `user_confirmed` 才能写具体错因。
- `problem_only + skip_follow_up` 只写题型/考点关注，固定轻微下调相关掌握度，不写 `mistake_cause_changes`。
- text analysis provider 可以补完整标准解法和追问分析草稿，但不得决定证据等级、写入类型或画像增量。
- 用 eval harness 覆盖题干-only、空步骤、跳过追问、提交草稿、确认写入和模型夹带 forbidden fields。

### Scope Too Large

Mitigation:

- 第一版只做高中数学
- 第一版只做单题诊断
- 第一版不做完整老师端
- 第一版不做教材 PDF 上传

### Privacy and Minor Protection

Mitigation:

- 第一版不采集真实身份信息
- 学生数据用匿名 student_id
- 商业化版本需要家长授权、数据加密和删除机制

## 15. Development Priority

### P0: Must Have

- Web Demo 主页面
- 样例题诊断闭环
- Agent 步骤可视化展示
- 结构化诊断输出
- 轻量知识库
- mock 学生画像展示
- 硬编码 5-8 条 mock 历史错题
- memory_delta 画像变化展示
- 每道主演示样例题预写 3 道变式练习题
- 轻量 7 天复习建议
- P0 主路径不依赖外部模型；图片路径失败时返回可恢复错误并保留样例题入口

### P1: Should Have

- 真实图片上传、预览、客户端格式校验和压缩
- `image_diagnosis` 识别草稿渲染、编辑确认、错误态和低置信度不持久化
- Anthropic-compatible 多模态 provider adapter，MiMo first
- Kimi、DeepSeek provider 实现扩展
- LLM 动态生成变式练习题
- 识别结果手动编辑和确认入口
- `/api/confirm` 确认后诊断流程
- 错题记录保存
- 更完整的高一到高三历史时间线和趋势分析
- 更精细的 Agent 动画、真实耗时和进度反馈
- 练习完成后的掌握度回升

### P1.5: Trusted Diagnosis Fallback

- 图片确认后证据分级：`student_work_sufficient`、`problem_only`、`insufficient`
- 题干-only 或学生步骤不清时进入一屏快速追问
- `problem_only` 路径可调用 DeepSeek/text analysis provider 补完整标准解法和展示分析
- 跳过追问只写 `problem_type_focus`，轻微下调相关知识点掌握度并加入复习关注
- 用户回答追问后先生成分析草稿，确认后才写 `mistake_cause`
- eval harness 固化“无学生证据不写具体错因”的安全边界

### P2: Nice to Have

- 老师端入口占位
- 家长报告预览
- 多道错题批量上传
- 教材知识库上传入口占位
- 完整高考冲刺计划
- 老师端、家长端真实数据结构落库

## 16. Recommended MVP Build Order

1. 搭建 Web Demo 页面骨架。
2. 准备 2-3 道高质量样例题和手工标注。
3. 实现轻量知识库和错因标签体系。
4. 实现样例题诊断闭环。
5. 实现 mock 学生画像和 memory_delta 合并逻辑。
6. 实现预写变式练习和轻量 7 天复习建议。
7. 实现 Agent 步骤可视化和错误降级路径。
8. 补充第 8 次使用的长期价值对比和高考冲刺建议。
9. 接入图片抽取 provider，并通过 `VISION_PROVIDER_*` 支持切换 Anthropic-compatible / OpenAI-compatible 视觉模型。
10. 优化页面视觉和演示路径。

## 17. Demo Script

黑客松演示应控制在 3-5 分钟内，优先走稳定样例题路径。

1. 打开页面，介绍一句话定位：拍照搜题告诉你答案，我们告诉你为什么错、怎么改、高考前怎么复习。
2. 选择“导数与参数分类讨论”样例题。
3. 点击“开始诊断”，展示 Agent 过程区：识别题目、匹配知识点、分析错因、更新画像、生成练习、规划复习。屏幕上 6 个步骤逐个高亮完成。
4. 展示错因报告：学生遗漏 `a <= 0` 情况，错因标签为 `classification_missing` 和 `domain_missing`。
5. 展示画像变化：参数分类讨论掌握度下降，复习优先级上升，并标记为历史复发错误。屏幕上用“诊断前/诊断后”两列展示变化。
6. 展示 3 道变式练习题：基础巩固、同类迁移、高考综合。屏幕上以三张练习卡片展示。
7. 展示轻量 7 天复习建议，说明它来自本次错因、历史复发频率和高考高频权重。屏幕上展示 7 天任务列表和 rationale。
8. 展示长期价值对比：第 1 次使用只能看到本题错因；第 8 次使用可以看到反复错因、薄弱模块和高考冲刺优先级。屏幕上用左右对比卡片展示。
9. 最后展示商业化路线：学生长期画像、家长报告、老师班级看板、机构知识库。

正式演示固定走样例题路径，不在 3-5 分钟主演示中赌真实图片上传。真实图片上传作为展台旁或演示后的自助体验功能。

应急预案：演示前准备首屏、Agent 过程、诊断报告、长期画像 4 张本地截图。如果 live demo 白屏或 dev server 崩溃，切换截图继续讲解。

## 18. Data Preparation Checklist

MVP 开发前必须准备这些数据，避免边写代码边补内容。

### Sample Questions

- 3 道高中数学样例题
- 每道题包含题干、学生错误答案、标准解法、错因标签、知识点、难度、预期诊断
- 每道主演示样例题预写 3 道变式题：基础巩固、同类迁移、高考综合
- 至少 1 道导数含参题，优先作为主演示样例

### Knowledge Base

- 15-25 个知识点，覆盖函数、导数、数列、解析几何等常见模块
- 10 个错因标签
- 5 个题型标签
- 每个知识点至少包含 id、display_name、module、description、aliases、keywords、common_mistakes、gaokao_frequency

### Mock Student Profile

- 1 个默认学生：`demo_student_001`
- 5-8 条历史错题记录
- 3-5 个薄弱知识点
- 3 个高频错因
- 一条高考冲刺视角建议

### Prompt and Schema

- Provider 图片抽取 prompt 模板
- 结构化 JSON Schema
- 1 份合法样例输出
- 1 份 image_diagnosis 失败时使用的错误响应，必须与前端错误态约定一致

## 19. Appendix A: Vision Extraction Prompt Template

System prompt:

```text
你是 MathTrace 的图片错题抽取器。你的任务不是诊断错因，也不是生成标准解法，而是从图片中抽取题目、学生答案和学生解题步骤。

必须遵守：
1. 只输出合法 JSON 对象，不要输出 Markdown。
2. 如果信息不足，用 extraction_confidence 标记为 low，并说明需要学生确认。
3. 字段必须且只能包含约定的抽取字段。
4. question_text、student_answer、student_solution_steps 内的数学公式应使用 $...$ 或 $$...$$ 包裹。
5. 不要输出 memory_delta、student_profile、mistake_history、错因频次或画像更新。
6. 不要生成标准解法、标准答案或完整解题过程；标准解法由确认后的 text analysis provider 生成。
```

User prompt template:

```text
【任务类型】
{{task_type}}

【题目与学生答案】
{{image_input}}

【学生历史画像摘要】
{{student_profile_summary}}

请输出符合 JSON Schema 的抽取结果，包含：
- question_text
- student_answer
- student_solution_steps
- extraction_confidence
- warnings
```

Few-shot 输出示例见 Appendix B。Provider 失败时返回可恢复错误；模型请求失败或非法输出必须将 `fallback_used` 标记为 true，且不得写入画像。过渡期服务端内部仍保留 `standard_solution_draft` 兼容字段，但视觉 prompt 不要求模型输出它。

## 20. Appendix B: Main Demo Sample Question

主演示样例：`sample_derivative_001`

```json
{
  "id": "sample_derivative_001",
  "title": "导数与参数分类讨论",
  "question_text": "已知函数 $f(x)=x^3-3ax+1$，讨论 $f(x)$ 在 $R$ 上的单调性。",
  "student_answer": "$f'(x)=3x^2-3a$。令 $f'(x)=0$ 得 $x=\\sqrt a$，所以 $x<\\sqrt a$ 时递减，$x>\\sqrt a$ 时递增。",
  "standard_solution": "$f'(x)=3x^2-3a=3(x^2-a)$。当 $a\\le 0$ 时，$x^2-a\\ge 0$，故 $f'(x)\\ge 0$，$f(x)$ 在 $R$ 上单调递增。当 $a>0$ 时，临界点为 $-\\sqrt a$ 和 $\\sqrt a$，$f'(x)>0$ 在 $(-\\infty,-\\sqrt a)$ 与 $(\\sqrt a,+\\infty)$，$f'(x)<0$ 在 $(-\\sqrt a,\\sqrt a)$，故函数先增后减再增。",
  "knowledge_points": ["derivative_monotonicity", "parameter_classification"],
  "difficulty": 4,
  "mistake_causes": ["classification_missing", "domain_missing"],
  "expected_diagnosis": "学生只讨论了 a>0 的部分情况，遗漏 a<=0；同时临界点只写了 sqrt(a)，遗漏 -sqrt(a)，导致单调区间判断不完整。",
  "practice_questions": [
    {
      "level": "basic",
      "question": "已知 $f(x)=x^3-3x$，求 $f(x)$ 的单调区间。",
      "training_goal": "巩固利用导数符号判断单调区间。"
    },
    {
      "level": "transfer",
      "question": "已知 $f(x)=x^3-3ax$，讨论 $a>0$ 时 $f(x)$ 的单调性。",
      "training_goal": "训练含参导数题中的临界点完整性。"
    },
    {
      "level": "gaokao_style",
      "question": "已知 $f(x)=x^3-3ax+1$，若 $f(x)$ 在区间 $[1,+\\infty)$ 上单调递增，求实数 $a$ 的取值范围。",
      "training_goal": "训练定义域限制、参数范围和导数符号的综合判断。"
    }
  ]
}
```

另外两个内置样例：

```json
[
  {
    "id": "sample_function_domain_001",
    "title": "函数定义域与单调性",
    "question_text": "已知函数 $f(x)=\\ln(x-1)-x$，求 $f(x)$ 的定义域，并判断其在定义域内的单调性。",
    "student_answer": "$f'(x)=\\frac{1}{x-1}-1$，所以 $x<2$ 时递增，$x>2$ 时递减。",
    "standard_solution": "先确定定义域 $x>1$，再讨论 $f'(x)=\\frac{2-x}{x-1}$。在 $(1,2)$ 上递增，在 $(2,+\\infty)$ 上递减。",
    "knowledge_points": ["function_domain", "derivative_monotonicity"],
    "difficulty": 3,
    "mistake_causes": ["domain_missing"],
    "expected_diagnosis": "学生进行了导数判断，但没有先写出定义域，导致单调区间表述缺少前提。",
    "practice_questions": [
      {"level": "basic", "question": "求函数 $f(x)=\\ln x-x$ 的定义域和单调区间。", "training_goal": "巩固定义域优先意识。"},
      {"level": "transfer", "question": "已知 $f(x)=\\ln(x-a)-x$，求定义域并讨论单调性。", "training_goal": "训练含参定义域。"},
      {"level": "gaokao_style", "question": "若 $f(x)=\\ln(x-1)-ax$ 在 $(1,+\\infty)$ 上单调递减，求 $a$ 的范围。", "training_goal": "训练定义域、导数符号与参数范围综合判断。"}
    ]
  },
  {
    "id": "sample_sequence_recursive_001",
    "title": "数列递推与通项",
    "question_text": "已知数列 $a_1=1$，$a_{n+1}=2a_n+1$，求 $a_n$ 的通项公式。",
    "student_answer": "因为 $a_{n+1}-a_n=a_n+1$，所以是等差数列，$a_n=n$。",
    "standard_solution": "由 $a_{n+1}+1=2(a_n+1)$，可知 $a_n+1$ 是首项为 2、公比为 2 的等比数列，所以 $a_n=2^n-1$。",
    "knowledge_points": ["sequence_recursion", "geometric_sequence"],
    "difficulty": 3,
    "mistake_causes": ["method_error", "transformation_error"],
    "expected_diagnosis": "学生误把递推关系当作等差关系，没有识别构造 a_n+1 的等比数列方法。",
    "practice_questions": [
      {"level": "basic", "question": "已知 $b_{n+1}=2b_n$，$b_1=2$，求 $b_n$。", "training_goal": "巩固等比数列通项。"},
      {"level": "transfer", "question": "已知 $a_1=2$，$a_{n+1}=3a_n+2$，求 $a_n$。", "training_goal": "训练构造辅助数列。"},
      {"level": "gaokao_style", "question": "已知 $a_{n+1}=2a_n+1$，$a_1=1$，求 $S_n=a_1+a_2+...+a_n$。", "training_goal": "训练递推通项与求和综合。"}
    ]
  }
]
```

对应样例输出必须包含：

```json
{
  "diagnosis_id": "diag_sample_derivative_001",
  "source": "sample",
  "fallback_used": false,
  "steps": [
    {
      "id": "extraction",
      "display_name": "识别题目",
      "status": "completed",
      "duration_ms": 300,
      "summary": "已读取预标注样例题。"
    },
    {
      "id": "knowledge_mapping",
      "display_name": "匹配知识点",
      "status": "completed",
      "duration_ms": 200,
      "summary": "命中导数与函数单调性、参数分类讨论。"
    },
    {
      "id": "mistake_diagnosis",
      "display_name": "分析错因",
      "status": "completed",
      "duration_ms": 400,
      "summary": "定位到分类讨论遗漏和定义域意识不足。"
    },
    {
      "id": "memory_update",
      "display_name": "更新画像",
      "status": "completed",
      "duration_ms": 200,
      "summary": "参数分类讨论掌握度下降，复习优先级上升。"
    },
    {
      "id": "practice_generation",
      "display_name": "生成练习",
      "status": "completed",
      "duration_ms": 200,
      "summary": "已生成基础、迁移和高考综合三类变式题。"
    },
    {
      "id": "review_planning",
      "display_name": "规划复习",
      "status": "completed",
      "duration_ms": 200,
      "summary": "已生成轻量 7 天复习建议。"
    }
  ],
  "recognized_question": {
    "question_text": "已知函数 $f(x)=x^3-3ax+1$，讨论 $f(x)$ 在 $R$ 上的单调性。",
    "student_answer": "$f'(x)=3x^2-3a$。令 $f'(x)=0$ 得 $x=\\sqrt a$，所以 $x<\\sqrt a$ 时递减，$x>\\sqrt a$ 时递增。",
    "extraction_confidence": "high"
  },
  "knowledge_mapping": {
    "knowledge_points": ["derivative_monotonicity", "parameter_classification"],
    "difficulty": 4,
    "retrieval_confidence": "high",
    "knowledge_confidence": "high"
  },
  "mistake_diagnosis": {
    "mistake_causes": ["classification_missing", "domain_missing"],
    "severity": "medium",
    "diagnosis": "学生遗漏 a<=0 的讨论，并遗漏 -sqrt(a) 这个临界点。",
    "step_analysis": ["求导正确", "临界点不完整", "参数分类不完整"],
    "diagnosis_confidence": "high"
  },
  "memory_delta": {
    "knowledge_mastery_changes": {
      "parameter_classification": -8,
      "derivative_monotonicity": -5
    },
    "mistake_cause_changes": {
      "classification_missing": 1,
      "domain_missing": 1
    },
    "is_repeated_mistake": true,
    "review_priority_changes": ["parameter_classification", "derivative_monotonicity"],
    "should_persist": true,
    "rationale": "P0 样例题使用预标注 delta：参数分类讨论是主要错因且为复发问题，导数单调性为关联知识点。"
  },
  "practice_questions": [
    {
      "level": "basic",
      "question": "已知 $f(x)=x^3-3x$，求 $f(x)$ 的单调区间。",
      "training_goal": "巩固利用导数符号判断单调区间。"
    },
    {
      "level": "transfer",
      "question": "已知 $f(x)=x^3-3ax$，讨论 $a>0$ 时 $f(x)$ 的单调性。",
      "training_goal": "训练含参导数题中的临界点完整性。"
    },
    {
      "level": "gaokao_style",
      "question": "已知 $f(x)=x^3-3ax+1$，若 $f(x)$ 在区间 $[1,+\\infty)$ 上单调递增，求实数 $a$ 的取值范围。",
      "training_goal": "训练定义域限制、参数范围和导数符号的综合判断。"
    }
  ],
  "review_plan": {
    "tomorrow": "复习导数符号与单调区间判断，重做本题。",
    "seven_days": [
      {"day": 1, "topic": "导数临界点", "task": "重做本题并补全两个临界点。", "estimated_minutes": 20},
      {"day": 2, "topic": "参数分类讨论", "task": "整理 a<=0 与 a>0 两类讨论模板。", "estimated_minutes": 25},
      {"day": 3, "topic": "定义域和范围意识", "task": "完成 2 道带区间限制的导数题。", "estimated_minutes": 20},
      {"day": 4, "topic": "同类迁移", "task": "完成含参单调性迁移题。", "estimated_minutes": 25},
      {"day": 5, "topic": "高考综合", "task": "完成区间单调性与参数取值范围题。", "estimated_minutes": 30},
      {"day": 6, "topic": "旧错回看", "task": "回看最近 90 天内 classification_missing 相关错题。", "estimated_minutes": 20},
      {"day": 7, "topic": "复盘总结", "task": "总结导数含参题的分类讨论检查清单。", "estimated_minutes": 15}
    ],
    "rationale": [
      "本次错因包含 classification_missing，且 mock 历史中 90 天内重复出现。",
      "parameter_classification 属于高考高频导数综合题能力点。",
      "计划先补临界点完整性，再补参数分类，最后迁移到高考风格题。"
    ]
  },
  "warnings": []
}
```

## 21. Appendix C: Mock Student Data

P0 使用 `demo_student_001` 作为唯一学生。Mock 历史数据覆盖 60 天以上，并包含同一知识点和同一错因的复发记录，用于支撑“第 8 次使用”长期价值对比。

```json
{
  "student_profile": {
    "student_id": "demo_student_001",
    "grade": "高二",
    "subject": "math",
    "mastery_scores": {
      "parameter_classification": 46,
      "derivative_monotonicity": 58,
      "function_domain": 54,
      "sequence_recursion": 63,
      "geometric_sequence": 68
    },
    "frequent_mistake_causes": {
      "classification_missing": 4,
      "domain_missing": 3,
      "method_error": 2,
      "calculation_error": 1
    },
    "weak_modules": ["derivative", "function", "sequence"],
    "review_priority": ["parameter_classification", "function_domain", "derivative_monotonicity"],
    "recent_trend": "最近 30 天导数含参题错误率上升，主要集中在分类讨论遗漏。",
    "gaokao_focus": [
      {
        "knowledge_point": "parameter_classification",
        "reason": "最近 90 天重复出现 classification_missing，且属于高考高频导数综合题。",
        "priority": 1
      },
      {
        "knowledge_point": "function_domain",
        "reason": "定义域遗漏会影响函数、导数和不等式多个模块。",
        "priority": 2
      }
    ],
    "created_at": "2026-03-20T08:00:00+08:00",
    "updated_at": "2026-05-28T08:00:00+08:00"
  },
  "mistake_history": [
    {
      "mistake_id": "m_001",
      "created_at": "2026-03-24T20:30:00+08:00",
      "knowledge_points": ["function_domain"],
      "mistake_causes": ["domain_missing"],
      "difficulty": 3,
      "review_status": 1
    },
    {
      "mistake_id": "m_002",
      "created_at": "2026-04-03T21:10:00+08:00",
      "knowledge_points": ["derivative_monotonicity"],
      "mistake_causes": ["calculation_error"],
      "difficulty": 3,
      "review_status": 2
    },
    {
      "mistake_id": "m_003",
      "created_at": "2026-04-16T19:40:00+08:00",
      "knowledge_points": ["parameter_classification", "derivative_monotonicity"],
      "mistake_causes": ["classification_missing"],
      "difficulty": 4,
      "review_status": 1
    },
    {
      "mistake_id": "m_004",
      "created_at": "2026-04-28T20:00:00+08:00",
      "knowledge_points": ["sequence_recursion"],
      "mistake_causes": ["method_error"],
      "difficulty": 3,
      "review_status": 0
    },
    {
      "mistake_id": "m_005",
      "created_at": "2026-05-06T21:20:00+08:00",
      "knowledge_points": ["function_domain", "derivative_monotonicity"],
      "mistake_causes": ["domain_missing"],
      "difficulty": 4,
      "review_status": 1
    },
    {
      "mistake_id": "m_006",
      "created_at": "2026-05-14T20:50:00+08:00",
      "knowledge_points": ["parameter_classification"],
      "mistake_causes": ["classification_missing"],
      "difficulty": 4,
      "review_status": 0
    },
    {
      "mistake_id": "m_007",
      "created_at": "2026-05-22T19:30:00+08:00",
      "knowledge_points": ["parameter_classification", "derivative_monotonicity"],
      "mistake_causes": ["classification_missing", "domain_missing"],
      "difficulty": 4,
      "review_status": 0
    }
  ]
}
```

长期价值对比文案：

```text
第 1 次使用：系统只能告诉你这道题错在分类讨论。
第 8 次使用：系统发现你在 90 天内 3 次出现“导数含参 + 分类讨论遗漏”，因此把 parameter_classification 提升为高考冲刺优先级第一位。
```

## 22. Open Decisions

当前没有阻塞实施计划的产品决策。实现阶段可配置 `.env.local` 中的 `VISION_PROVIDER_API_KEY`；若未配置，正式演示仍走 `sample_diagnosis` 样例题路径，`image_diagnosis` 返回可恢复错误并引导用户选择样例题。
