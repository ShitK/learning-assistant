# P2.8 GLM-OCR Image Extraction Provider Design Spec

## 1. 背景

P2.7 已经让上传题诊断完成后，可以基于诊断结果调用只读 RAG，从增强题库返回 3 道真实变式练习。当前上传题链路仍依赖 `VisionExtractionProvider` 调用通用视觉模型，把图片直接转成 `VisionExtractionDraft`。

近期真实上传图出现过：

```text
provider glm_4_6v_flashx；阶段 vision_llm；失败类型 empty_text_content
```

这说明 GLM-4.6V-FlashX 的 chat/completions 请求 HTTP/JSON 层成功，但响应里没有当前 parser 可解析的文本内容。它不是标准解法、确认链路或 RAG 推荐的问题，而是更早的图片抽取阶段不稳定。

用户提出两种可能方向：

- 切到智谱 GLM-OCR 文档解析接口。
- 直接使用 MinerU 做 OCR。

本 spec 选择第一步先接入 GLM-OCR 作为在线图片抽取 provider；MinerU 继续定位为离线 PDF/题库入库工具。

## 2. 目标

- 新增一个在线 GLM-OCR 图片抽取 provider，让上传图片先经过 OCR/版面解析，再映射为现有 `VisionExtractionDraft`。
- 降低通用 vision chat 模型空 `content` 导致的 `empty_text_content` 概率。
- 保持现有后续链路不变：识别草稿确认表单、`/api/confirm`、text analysis provider 标准解法、画像写入 gate、P2.7 RAG 推荐。
- 输出仍只包含 `question_text`、`student_answer`、`student_solution_steps`、`extraction_confidence`、`warnings`。
- OCR 结果仍是不可信输入，必须经过 parser/normalizer 收口。

## 3. 不做什么

- 不把 MinerU 接入在线学生上传图诊断主路径。
- 不把 OCR 结果直接写入 `memory_events`、`student_profiles`、错题本或 localStorage。
- 不改变 `/api/confirm` 的证据等级、fingerprint、`memory_delta` 或持久化策略。
- 不改变 P2.7 RAG 的职责；RAG 仍只负责从教辅题库找变式练习。
- 不让 GLM-OCR 生成标准解法、错因结论、画像增量或最终练习题。
- 不提交 OCR 原始响应、图片、base64、`.env*` 或 `artifacts/**`。

## 4. 方案选择

### 方案 A：GLM-OCR 在线 provider（推荐）

新增 `VISION_PROVIDER_PROTOCOL=glm_ocr` provider 类型，调用智谱文档解析接口。根据官方文档，该接口面向图片/PDF 文档解析，返回 Markdown OCR 结果和布局信息，适合先稳定拿到题干与手写/印刷文本，再由本地规则切分成 MathTrace 的确认草稿。

优点：

- 直接针对当前问题：chat completions 空 `content`。
- 与现有在线上传图路径契合。
- 可以复用当前 `VisionExtractionProvider` 输出契约。
- 不需要引入离线任务队列或 PDF 入库工作流。

代价：

- 返回结构与 chat completions 不同，需要新增 adapter。
- OCR markdown 到 `VisionExtractionDraft` 的切分需要保守规则和测试。
- 公式、手写步骤、版面顺序仍可能出错，必须保留用户确认表单。

### 方案 B：MinerU 在线 OCR

把学生上传图片交给 MinerU 解析。

优点：

- 项目已在 P2.0 用 MinerU JSON 做过教辅 PDF 候选题入库。
- 对结构化文档/PDF 解析能力更强。

不选原因：

- 现有 MinerU 资产主要服务离线 corpus 生产：`PDF/OCR -> candidate_questions -> 人工审核 -> practice_corpus`。
- 在线学生上传图需要低延迟、简单错误恢复和稳定表单确认；直接接 MinerU 会引入更重的异步/轮询/文件 artifact 边界。
- 容易混淆“题库入库 OCR”和“学生上传诊断 OCR”两条产品路径。

### 方案 C：继续只用 GLM-4.6V-FlashX chat completions

保留当前 provider，并对 `empty_text_content` 重试。

优点：

- 改动最小。

不选为主方案原因：

- 只能缓解偶发空内容，不能改变它不是 OCR 专用接口的问题。
- 对版面、公式和手写痕迹的稳定性收益有限。

## 5. 架构边界

现有主接口保持：

```text
POST /api/diagnose
  task_type=image_diagnosis
  -> createVisionProviderConfigFromEnv()
  -> VisionExtractionProvider.extractQuestionFromImage()
  -> DiagnoseImageExtractionResponse
  -> 前端确认草稿
```

P2.8 只替换或新增 `VisionExtractionProvider` 的实现分支：

```text
uploaded image
-> GLM-OCR layout/document parsing API
-> OCR markdown/layout result
-> local OCR-to-draft mapper
-> VisionExtractionDraft
-> existing extraction review UI
```

后续保持：

```text
confirmed extraction
-> /api/confirm
-> deterministic diagnosis pipeline
-> optional text analysis provider for standard_solution
-> optional read-only /api/variant-practice
```

## 6. 配置设计

新增推荐配置：

```text
VISION_PROVIDER_PROTOCOL=glm_ocr
VISION_PROVIDER_BASE_URL=https://open.bigmodel.cn/api/paas/v4
VISION_PROVIDER_MODEL=glm-ocr
VISION_PROVIDER_API_KEY=<local-secret>
VISION_PROVIDER_NAME=glm_ocr
VISION_PROVIDER_IMAGE_FORMAT=base64
VISION_PROVIDER_TIMEOUT_MS=60000
```

说明：

- `VISION_PROVIDER_PROTOCOL=glm_ocr` 明确区分 GLM-OCR 与 `openai` chat/completions。
- `VISION_PROVIDER_MODEL` 的具体值以智谱官方文档当前要求为准；实现前必须核对官方模型名和请求字段。
- 不复用 `ANALYSIS_PROVIDER_*`；OCR 抽取和标准解法生成继续分离。
- 不读取 service role key、不访问数据库。

## 7. GLM-OCR Provider Contract

实现时需要在 `src/lib/providers/**` 中新增或扩展 provider 分支：

- 请求 endpoint 使用智谱文档解析接口，而不是 `/chat/completions`。
- 输入只发送当前上传图片的 base64、mime type 和必要参数。
- 不发送学生完整画像、错题历史、service role key 或图片以外的敏感内容。
- 响应只读取官方返回中的 OCR markdown / layout 结果。
- 不保存原始 provider 响应。

输出统一为：

```ts
interface VisionExtractionDraft {
  question_text: string;
  student_answer: string;
  student_solution_steps: string[];
  extraction_confidence: "high" | "medium" | "low";
  warnings: string[];
}
```

## 8. OCR 到确认草稿的映射

第一版映射采用保守规则：

- `question_text`：从 OCR markdown 中提取题号、题干、条件、问题小问；无法稳定切分时保留完整 OCR 文本前段，并加 warning。
- `student_answer`：如果识别到手写区域、作答标记或题干后明显的解答内容，则填入；否则填 `"未识别到学生答案"`。
- `student_solution_steps`：从学生作答区域按换行/步骤符号切分，最多保留 8 条。
- `extraction_confidence`：
  - 题干和作答步骤都较完整：`medium` 或 `high`。
  - 只识别到题干：`low`。
  - 版面顺序不确定、公式破损、学生作答区域不清：`low`。
- `warnings`：记录需要用户确认的点，例如题干可能截断、未识别到学生答案、公式可能不完整、版面顺序不确定。

第一版不追求自动完美分离题干和学生步骤。确认表单仍是正式边界，用户可以编辑。

## 9. Error Handling

沿用当前 provider 错误结构：

```ts
ProviderFailureDebug {
  provider_name: string;
  provider_stage: "vision_llm" | "ocr";
  failure_kind: "http_error" | "invalid_json" | "empty_text_content" | "network_failed" | "timeout";
  http_status?: number;
}
```

P2.8 可以把 GLM-OCR 的 `provider_stage` 标为 `"ocr"`，方便区分 chat vision 和 OCR provider。

失败策略：

- HTTP 非 2xx：返回 recoverable `model_request_failed`。
- 非 JSON：返回 recoverable `model_request_failed` + `invalid_json`。
- 响应中没有可用 OCR markdown/layout：返回 recoverable `model_invalid_output` + `empty_text_content`。
- OCR markdown 有内容但映射不完整：尽量返回低置信度 `VisionExtractionDraft`，让用户在确认表单修正。

不得在错误响应中包含 API Key、图片 base64、原始 provider response、完整题干、学生答案或学生画像。

## 10. 与标准解法和 RAG 的关系

GLM-OCR 只负责识别题干和学生作答草稿。

标准解法仍由 `/api/confirm` 后的 text analysis provider 基于用户确认文本生成。即使 GLM-OCR 只识别到题干，确认后也可以生成展示用标准解法；是否写画像仍由证据策略决定。

P2.7 RAG 仍在诊断完成后根据 `question_text`、`knowledge_points`、`mistake_causes` 和证据字段找 3 道真实题库题。GLM-OCR 不直接调用 RAG，也不决定推荐结果是否写入任何存储。

## 11. 测试策略

### Provider tests

新增或扩展 provider 测试：

- `VISION_PROVIDER_PROTOCOL=glm_ocr` 能解析 env config。
- 请求 URL 使用文档解析 endpoint，而不是 `/chat/completions`。
- 请求体不包含 API Key、student_profile、mistake_history、memory_delta。
- 能从合成 GLM-OCR 响应中提取 OCR markdown 并生成 `VisionExtractionDraft`。
- OCR 响应为空时返回 `empty_text_content`，且不泄露原始响应。
- HTTP error、invalid JSON、timeout、network failure 都保持现有 recoverable 语义。

### Mapper tests

新增纯函数测试：

- 题干 + 学生步骤都存在时生成 `student_work_sufficient` 所需草稿。
- 只有题干时生成 `student_answer="未识别到学生答案"`、`extraction_confidence="low"` 和 warning。
- 多行公式和小问不会被粗暴删除。
- 超长 OCR 文本会被截断或保守处理，不把超长内容直接送入 UI。

### Integration/smoke

- `image_diagnosis` 使用 fake GLM-OCR provider 时返回 `extraction_review`。
- `/api/confirm` 仍可对 GLM-OCR 草稿生成报告。
- `problem_only` 上传题仍能走 P2.7 只读 RAG 推荐。
- `sample_diagnosis` 不受影响。

## 12. 验收标准

- 使用 fake GLM-OCR 响应时，`POST /api/diagnose` 的图片路径稳定返回确认草稿。
- 只识别到题干时，页面能显示可编辑题干，提示未识别到学生答案，并允许确认后生成标准解法和 RAG 推荐。
- 学生作答区域清晰时，仍能进入 `student_work_sufficient` 路径。
- GLM-OCR 失败时仍是可恢复错误，不破坏当前样例题路径。
- 全量测试、smoke、lint、build 通过。

## 13. 文档和叙事更新

实现完成时需要同步：

- PRD：补充 `VISION_PROVIDER_PROTOCOL=glm_ocr` 和 GLM-OCR 只做抽取的边界。
- Technical Roadmap：记录在线 OCR provider 与离线 MinerU corpus pipeline 的职责区分。
- Interview narrative：说明为什么用 GLM-OCR 提升上传题稳定性，同时保留人工确认和画像写入 gate。

## 14. 推荐实施顺序

1. 写 `glm_ocr` provider config 和请求/响应单元测试。
2. 实现 GLM-OCR response -> OCR text extraction。
3. 实现 OCR text -> `VisionExtractionDraft` 的保守 mapper。
4. 接入 `createVisionProvider()` protocol 分支。
5. 跑 fake provider 的 API smoke。
6. 本地用一张真实上传题做可选 smoke，确认不打印敏感内容。

## 15. 参考

- 智谱 GLM-OCR 文档解析 API：<https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E6%96%87%E6%A1%A3%E8%A7%A3%E6%9E%90>
- 当前在线图片抽取 provider：`src/lib/providers/anthropic-compatible-provider.ts`
- 当前视觉抽取 parser：`src/lib/vision-extraction/vision-extraction-parser.ts`
- 现有 MinerU 离线入库边界：`docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md`
