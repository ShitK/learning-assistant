# MathTrace 多智能体错因诊断系统

MathTrace 是一个面向高中数学错题诊断场景的 AI 学习辅助系统。它不是简单的“拍照搜题”，而是围绕一次错题建立从图片识别、错因诊断、学习记忆更新到变式练习推荐的完整闭环，帮助学生理解“为什么错、该怎么改、接下来练什么”。

项目采用轻量多智能体职责编排，将一次错题诊断拆分为图片识别、错因分析、学习记忆更新和变式练习推荐等子智能体职责。为了避免 Agent 只停留在“能跑通 demo”，项目重点设计了一套 Agent Harness：通过输入输出契约、用户确认、标签约束、证据校验、降级策略和离线评估脚本，持续检查 Agent 输出是否可信、是否越权写入、推荐结果是否命中当前错因。

![MathTrace 系统架构图](public/mathtrace-architecture.png)

技术栈：

- Next.js App Router / TypeScript / React / Tailwind CSS
- Supabase PostgreSQL / pgvector
- OCR / Vision Provider / Text Analysis Provider
- RAG 变式练习推荐
- Node.js 脚本测试、smoke test 和离线评估

## 项目链路

```text
错题上传
-> 图片识别 Agent
-> 用户确认
-> 错因分析 Agent
-> 学习记忆 Agent
-> 学生画像更新
-> 变式练习推荐 Agent
-> 离线评估复盘
```

## Agent Harness 设计

MathTrace 的 Harness 不是单纯的测试脚本，而是围绕 Agent 运行链路建立的一组约束、评估和复盘机制。它的目标是让多 Agent 链路不仅能跑通，还能回答三个问题：输出是否可信、Agent 是否越权、失败样例能否被复盘。

### 输入输出契约

每个 Agent 都有明确输入和结构化输出。模型返回结果不会直接进入业务状态，而是先经过 parser、字段白名单、类型校验和业务 schema 收口，避免模型生成未声明字段、错误标签或不可控状态变更。

### Agent 职责与权限边界

系统把图片识别、错因分析、学习记忆和变式练习推荐拆成不同职责。图片识别 Agent 只返回待确认草稿，不生成画像变化；错因分析 Agent 只生成诊断和错因候选，不直接访问数据库；学习记忆 Agent 只在用户确认和证据满足条件后更新长期学习状态。

### 可信写入 Gate

诊断结果写入错题本和学生画像前，必须经过用户确认、错因标签约束、证据可信度校验和持久化 gate。这样即使 OCR 或大模型输出不稳定，也不会直接污染长期学习画像。

### 离线评估与 Bad Case 复盘

Harness 通过固定诊断样例评估候选召回、标签命中、偏题检测、推荐数量和降级路径。当前 RAG 推荐基线覆盖 6 个诊断样例，其中 5 个通过，未出现检索降级；未通过样例主要暴露低证据表述问题，后续可通过推荐文案约束和证据分级继续优化。

## 核心能力

### 1. 多智能体错因诊断流程

系统将错题诊断拆分为多个清晰的子智能体职责：

- 图片识别 Agent：从错题图片中抽取题干、学生作答和解题步骤。
- 错因分析 Agent：根据确认后的题目信息进行知识点匹配、标准解法生成、错因标签判断和练习建议生成。
- 学习记忆 Agent：在用户确认和证据校验后，将可信诊断结果写入错题本，并更新学生画像。
- 变式练习推荐 Agent：基于诊断结果、知识点和错因标签召回候选题，并结合题型约束生成练习推荐。

当前项目采用服务端受控流程顺序编排这些职责，不是 LangGraph 或 AutoGen 式的自主多 Agent runtime。这样做的目的是在保证演示稳定性的同时，让错因诊断和长期画像写入更加可控。

### 2. 可信写入与学习记忆

图片识别结果不会直接写入数据库，也不会直接更新学生画像。系统会先返回待确认草稿，用户确认后才进入正式诊断流程。

在诊断结果写入长期记忆前，系统会进行：

- 用户确认
- 错因标签约束
- 证据可信度校验
- 持久化写入 gate
- 学生画像更新控制

只有题目信息、学生作答和错因判断足够可信时，系统才会将学习记录写入错题本，并更新当前学生画像，降低 OCR 或大模型误判对长期学习状态的影响。

### 3. Supabase 学习记忆层

项目基于 Supabase PostgreSQL 设计学习记忆层，用于保存：

- 诊断记录
- 错题本条目
- 画像变化事件
- 当前学生画像

其中画像变化事件用于记录“为什么这次诊断改变了学生画像”，当前学生画像则由这些事件投影得到。这样系统不是只保存一次性问答结果，而是能够持续积累学生的薄弱知识点、常见错因和复习优先级。

### 4. RAG 变式练习推荐

项目构建了面向变式练习推荐的 RAG 链路，基于 pgvector 召回相似候选题，并结合知识点、错因标签和题型约束生成最终练习推荐。

为了保证主诊断流程稳定，系统也设计了本地题库降级策略：当 pgvector 检索、数据库或 embedding provider 不可用时，仍然可以回退到本地题库，避免推荐链路异常影响核心诊断体验。

### 5. 工程验证与回归

项目将 Agent Harness 接入脚本测试、smoke test 和离线评估，用于持续验证诊断链路、Agent 边界、RAG 推荐质量和降级路径，避免多 Agent 链路在迭代中出现职责漂移或推荐质量退化。

## 项目特点

- 从“拍照搜题”升级为“错因诊断 + 学习记忆 + 练习推荐”的学习闭环。
- 使用轻量多智能体职责编排，让不同环节的输入输出边界更清晰。
- 模型输出不会直接写入长期学生画像，必须经过用户确认、标签约束和证据校验。
- 学习画像可追踪，能够解释每次画像变化来自哪次诊断。
- 推荐链路具备 pgvector 检索、本地降级和离线评估能力，兼顾效果和稳定性。
- 建立覆盖诊断链路、Agent 边界、RAG 推荐质量和降级路径的轻量评估 Harness，让系统具备可回归、可复盘、可持续优化的工程闭环。

## 架构边界

MathTrace 的核心边界是：模型可以辅助抽取和表达，但不能直接写入长期画像。

```text
前端工作台
  -> /api/diagnose
      sample_diagnosis: 内置样例题诊断，不依赖外部模型
      image_diagnosis: 调用 OCR / vision provider，返回待确认识别草稿
  -> /api/confirm
      用户确认后进入诊断流程，可选调用 text analysis provider 增强解题说明
      证据不足或 provider 不可用时回退本地规则报告
  -> /api/student-profile
      读取从画像事件投影得到的当前学习画像
  -> /api/variant-practice
      RAG 变式练习推荐，只返回裁剪后的学生可见练习卡片
```

数据分层：

- `diagnosis_runs`：一次诊断运行的审计快照。
- `mistake_book_items`：错题本条目。
- `memory_events`：画像变化事件，记录为什么画像发生变化。
- `student_profiles`：从画像事件投影得到的当前学习画像。
- pgvector 题源表：用于变式练习候选召回，不写学生画像。

当前项目仍是 demo-first 的求职展示项目：默认学生为 `demo_student_001`，尚未实现真实登录、多用户权限、老师端、面向用户的 RLS 策略或生产级监控。

## 快速开始

克隆项目后安装依赖：

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 进入 MathTrace 工作台。

不配置任何 API Key 时，内置样例题诊断路径仍可运行。图片诊断、确认后文本增强、Supabase 持久化和 pgvector 检索都是可选能力。

## 本地配置

所有密钥只应写入本地 `.env.local`，不要提交 `.env*`，也不要把真实 API Key 写入日志、截图、文档或提交历史。

### OCR / Vision Provider

图片诊断需要服务端 vision provider。GLM-OCR 示例：

```bash
VISION_PROVIDER_PROTOCOL=glm_ocr
VISION_PROVIDER_BASE_URL=https://open.bigmodel.cn/api/paas/v4
VISION_PROVIDER_MODEL=glm-ocr
VISION_PROVIDER_API_KEY=<local-secret>
VISION_PROVIDER_NAME=glm_ocr
VISION_PROVIDER_IMAGE_FORMAT=data_url
VISION_PROVIDER_TIMEOUT_MS=60000
MATHTRACE_CONFIRM_SECRET=<stable-local-secret>
```

OpenAI-compatible vision provider 示例：

```bash
VISION_PROVIDER_PROTOCOL=openai
VISION_PROVIDER_BASE_URL=https://open.bigmodel.cn/api/paas/v4
VISION_PROVIDER_MODEL=glm-4.6v-flashx
VISION_PROVIDER_API_KEY=<local-secret>
VISION_PROVIDER_NAME=glm_4_6v_flashx
VISION_PROVIDER_IMAGE_FORMAT=base64
VISION_PROVIDER_TIMEOUT_MS=60000
MATHTRACE_CONFIRM_SECRET=<stable-local-secret>
```

`MATHTRACE_CONFIRM_SECRET` 用于确认 token 签名。本地未配置时会使用 demo secret；生产环境必须显式配置。

### Text Analysis Provider

确认图片识别结果后，可以配置文本分析模型生成更自然的解题说明和错因分析候选。模型输出不能直接写入画像。

```bash
ANALYSIS_PROVIDER_PROTOCOL=openai
ANALYSIS_PROVIDER_BASE_URL=https://api.deepseek.com
ANALYSIS_PROVIDER_MODEL=deepseek-v4-flash
ANALYSIS_PROVIDER_API_KEY=<local-secret>
ANALYSIS_PROVIDER_NAME=deepseek_v4_flash
ANALYSIS_PROVIDER_TIMEOUT_MS=60000
```

未配置或调用失败时，确认流程会回退到本地规则报告。

### Supabase PostgreSQL

如需启用错题本、画像事件和当前画像快照：

```bash
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-secret>
```

`SUPABASE_SERVICE_ROLE_KEY` 只能在服务端读取。浏览器端只通过 Next.js API 访问错题本和画像数据，不能直连 Supabase。

需要应用的 migration 位于 `supabase/migrations/`。

### pgvector / RAG

如需启用 pgvector 变式练习候选召回，需要配置 Supabase 和 embedding provider：

```bash
RAG_EMBEDDING_PROVIDER_PROTOCOL=openai
RAG_EMBEDDING_PROVIDER_BASE_URL=https://api.openai.com/v1
RAG_EMBEDDING_PROVIDER_MODEL=text-embedding-3-small
RAG_EMBEDDING_PROVIDER_API_KEY=<local-secret>
RAG_EMBEDDING_PROVIDER_NAME=rag_embedding_provider
RAG_EMBEDDING_PROVIDER_TIMEOUT_MS=30000
RAG_PGVECTOR_QUERY_TIMEOUT_MS=10000
```

同步审核题源到 pgvector：

```bash
node scripts/rag/sync-variant-practice-pgvector.mjs --dry-run
node --env-file=.env.local scripts/rag/sync-variant-practice-pgvector.mjs --apply
```

未配置 Supabase、embedding provider 或本地题源 artifact 时，主诊断流程仍可运行；RAG 推荐能力会按当前可用资源降级。

## 常用命令

```bash
npm run dev
npm test
npm run test:smoke
npm run test:eval
npm run lint
npm run build
```

命令说明：

- `npm test`：运行默认测试并执行 smoke test。
- `npm run test:smoke`：验证核心 demo 路径和 API contract。
- `npm run test:eval`：运行评估类测试。
- `npm run build`：执行 Next.js 构建。

## 目录速览

```text
src/app/api/diagnose/route.ts              诊断入口
src/app/api/confirm/route.ts               图片识别确认入口
src/app/api/student-profile/route.ts       当前学习画像读取
src/app/api/variant-practice/route.ts      RAG 变式练习推荐
src/lib/diagnosis/                         诊断流程、证据策略、确认服务
src/lib/vision-extraction/                 OCR / 视觉抽取解析和映射
src/lib/providers/                         外部模型 provider adapter
src/lib/persistence/                       Supabase / Postgres 持久化边界
src/lib/rag/                               变式练习查询、展示模型和 embedding 文本
scripts/rag/                               题源构建、pgvector 同步和离线评估脚本
supabase/migrations/                       数据库 schema 和 RPC
interview/mathtrace-project-narrative.md   项目面试叙事与设计取舍
```

## 当前限制

- 当前固定使用 `demo_student_001`，不是完整多用户系统。
- 尚未实现登录、老师端、真实用户级 RLS 策略和生产级监控。
- pgvector 只服务变式练习候选召回，不是学生记忆系统。
- RAG 推荐不写学习画像，不影响错题本和画像事件。
- P2.10 评估是本地离线评估，不是线上 A/B 实验或生产监控。
