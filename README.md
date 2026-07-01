# MathTrace Learning Assistant

错因地图 MathTrace 是一个 Next.js + TypeScript 的高中数学错题诊断 Demo。P0 主路径使用内置样例题，P1 图片诊断通过服务端 `/api/diagnose` 调用 vision provider 做图片抽取，再经用户确认后复用本地 Agent Pipeline；确认后可选调用 text analysis provider 增强报告表达。

## Getting Started

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 进入工作台。

## Local Vision Provider Settings

图片诊断需要在本地 `.env.local` 配置服务端 vision provider 参数：

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

GLM-OCR 图片抽取推荐配置：

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

不要把真实 `VISION_PROVIDER_API_KEY` 写入前端代码、日志、文档或提交历史。`MATHTRACE_CONFIRM_SECRET` 用于图片识别确认 token 签名，应独立于任何模型 API Key；生产环境必须配置，本地未配置时会使用稳定 demo secret，避免切换模型 key 导致未确认草稿失效。未配置 vision provider 时，`sample_diagnosis` 仍可稳定演示，`image_diagnosis` 会返回可恢复错误。`VISION_PROVIDER_PROTOCOL` 支持 `anthropic`、`openai` 和 `glm_ocr`；GLM-4.6V-FlashX 使用 OpenAI-compatible `chat/completions` 协议，并需要 `VISION_PROVIDER_IMAGE_FORMAT=base64`；GLM-OCR 使用 `/layout_parsing` 协议，当前本地验证应使用 `VISION_PROVIDER_IMAGE_FORMAT=data_url`。旧的 `MIMO_*` 变量仍作为本地兼容别名保留，新配置请优先使用 `VISION_PROVIDER_*`。`VISION_PROVIDER_TIMEOUT_MS` 默认 15000，图片识别较慢时可在本地调到 60000。

## Local Analysis Provider Settings

确认图片识别结果后，可以配置服务端 text analysis provider 增强错因说明、步骤分析和标准解法表达。当前本地推荐 DeepSeek V4 Flash：

```bash
ANALYSIS_PROVIDER_PROTOCOL=openai
ANALYSIS_PROVIDER_BASE_URL=https://api.deepseek.com
ANALYSIS_PROVIDER_MODEL=deepseek-v4-flash
ANALYSIS_PROVIDER_API_KEY=<local-secret>
ANALYSIS_PROVIDER_NAME=deepseek_v4_flash
ANALYSIS_PROVIDER_TIMEOUT_MS=60000
```

`ANALYSIS_PROVIDER_*` 只服务 `/api/confirm` 后的文本分析增强，不接收图片 base64。`ANALYSIS_PROVIDER_PROTOCOL` 当前只支持 `openai`，`ANALYSIS_PROVIDER_BASE_URL` 可以配置 provider 根地址，也可以直接配置到 `/chat/completions`。未配置或请求失败时，确认流程会回退到本地确定性规则报告；DeepSeek 不能写入 `memory_delta`、`student_profile`、`mistake_history`，也不能决定是否持久化长期画像。

## Local Supabase Settings

P1.7 引入 Supabase Postgres 作为错题本和长期记忆事件的数据底座。服务端会在确认后的诊断流程中尝试写入 `students`、`diagnosis_runs`、`mistake_book_items` 和 `memory_events`：

- `sample_diagnosis` 是 demo 自动确认路径，诊断主流程成功且 `memory_delta.should_persist=true` 时也会尝试写入。
- 图片诊断只有经过 `/api/confirm` 确认，并由服务端证据规则允许持久化时才会写入。
- 当前仍固定使用 `demo_student_001`，不做登录、老师端、真实多用户/RLS 用户策略或完整画像迁移；P2.9 的 RAG/pgvector 仅服务变式练习检索，不写入 `memory_events` / `student_profiles`。

本地如需连接 Supabase，在 `.env.local` 配置：

```bash
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-secret>
```

`SUPABASE_SERVICE_ROLE_KEY` 只能在服务端读取，前端不得直连数据库或 import Supabase admin client；浏览器只能通过 Next.js API 获取错题本数据。不要提交 `.env*`，不要把真实 Supabase key 写入文档、日志、截图或提交历史。

未配置 Supabase 时，demo 仍可运行：诊断主流程不因数据库缺失失败，错题本接口返回稳定空列表。P1.7 不保存完整图片 base64；localStorage 暂时继续用于 demo 学生画像恢复，不迁移完整画像到数据库。

### Local RAG Embedding Provider Settings

P2.9 动态变式练习可优先使用 Supabase Postgres + pgvector 召回候选题。本地如需启用 pgvector 路径或运行同步 CLI，需额外配置：

```bash
RAG_EMBEDDING_PROVIDER_PROTOCOL=openai
RAG_EMBEDDING_PROVIDER_BASE_URL=https://api.openai.com/v1
RAG_EMBEDDING_PROVIDER_MODEL=text-embedding-3-small
RAG_EMBEDDING_PROVIDER_API_KEY=<local-secret>
RAG_EMBEDDING_PROVIDER_NAME=rag_embedding_provider
RAG_EMBEDDING_PROVIDER_TIMEOUT_MS=30000
RAG_PGVECTOR_QUERY_TIMEOUT_MS=10000
```

未配置 Supabase 或 RAG embedding provider 时，`POST /api/variant-practice` 会回退到 P2.7 本地 enriched corpus fallback；前端仍不读取 Supabase、本地 artifact 或 service role key。

同步命令：

```bash
node scripts/rag/sync-variant-practice-pgvector.mjs --dry-run
node --env-file=.env.local scripts/rag/sync-variant-practice-pgvector.mjs --apply
```

## Local Smoke Tests

样例题诊断不依赖外部模型：

```bash
npm test
npm run lint
npm run build
```

图片诊断需要本地 `.env.local` 中的服务端 vision provider 配置。启动 `npm run dev` 后，在工作台切换到“图片诊断”，上传 PNG/JPEG/WebP 图片；客户端会先校验格式并压缩到约 600KB，再调用 `/api/diagnose`。后端仍保留 1MB 请求图片上限。确认识别草稿后，如果配置了 `ANALYSIS_PROVIDER_*`，`/api/confirm` 会用确认后的文本调用分析模型增强报告表达；没有配置时继续使用本地规则报告。

## Project Notes

- `sample_diagnosis` 是稳定演示路径，不是模型失败降级路径。
- `image_diagnosis` 成功后渲染模型识别结果和本地 Pipeline 输出。
- 低置信度图片结果只展示诊断建议，不写入 localStorage 学生画像。
