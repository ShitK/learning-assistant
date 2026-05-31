# MathTrace Learning Assistant

错因地图 MathTrace 是一个 Next.js + TypeScript 的高中数学错题诊断 Demo。P0 主路径使用内置样例题，P1 图片诊断通过服务端 `/api/diagnose` 调用 MiMo Anthropic-compatible provider 做图片抽取，再复用本地 Agent Pipeline。

## Getting Started

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 进入工作台。

## Local MiMo Settings

图片诊断需要在本地 `.env.local` 配置服务端 MiMo 参数：

```bash
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/anthropic
MIMO_MODEL=mimo-v2.5
MIMO_API_KEY=<local-secret>
```

不要把真实 `MIMO_API_KEY` 写入前端代码、日志、文档或提交历史。未配置时，`sample_diagnosis` 仍可稳定演示，`image_diagnosis` 会返回可恢复错误。

## Local Smoke Tests

样例题诊断不依赖外部模型：

```bash
npm test
npm run lint
npm run build
```

图片诊断需要本地 `.env.local` 中的服务端 MiMo 配置。启动 `npm run dev` 后，在工作台切换到“图片诊断”，上传 PNG/JPEG/WebP 图片；客户端会先校验格式并压缩到 1MB 内，再调用 `/api/diagnose`。

## Project Notes

- `sample_diagnosis` 是稳定演示路径，不是模型失败降级路径。
- `image_diagnosis` 成功后渲染模型识别结果和本地 Pipeline 输出。
- 低置信度图片结果只展示诊断建议，不写入 localStorage 学生画像。
