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
```

不要把真实 `VISION_PROVIDER_API_KEY` 写入前端代码、日志、文档或提交历史。未配置时，`sample_diagnosis` 仍可稳定演示，`image_diagnosis` 会返回可恢复错误。`VISION_PROVIDER_PROTOCOL` 支持 `anthropic` 和 `openai`；GLM-4.6V-FlashX 使用 OpenAI-compatible `chat/completions` 协议，并需要 `VISION_PROVIDER_IMAGE_FORMAT=base64`。旧的 `MIMO_*` 变量仍作为本地兼容别名保留，新配置请优先使用 `VISION_PROVIDER_*`。`VISION_PROVIDER_TIMEOUT_MS` 默认 15000，图片识别较慢时可在本地调到 60000。

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

`ANALYSIS_PROVIDER_*` 只服务 `/api/confirm` 后的文本分析增强，不接收图片 base64。未配置或请求失败时，确认流程会回退到本地确定性规则报告；DeepSeek 不能写入 `memory_delta`、`student_profile`、`mistake_history`，也不能决定是否持久化长期画像。

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
