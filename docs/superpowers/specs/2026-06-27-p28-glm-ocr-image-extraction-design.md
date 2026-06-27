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

- 第一版 `glm_ocr` 作为 `VISION_PROVIDER_PROTOCOL` 的可选值，与现有 `anthropic` / `openai` 并列；未设置 `VISION_PROVIDER_PROTOCOL` 时继续保持当前默认 `anthropic`，避免破坏已有本地 demo 和 legacy `MIMO_*` 配置。
- P2.8 不下线 chat vision provider。是否把 GLM-OCR 切为默认，需要在实现完成后基于真实上传题 smoke 再决定。
- `VISION_PROVIDER_PROTOCOL=glm_ocr` 明确区分 GLM-OCR 与 `openai` chat/completions。
- `VISION_PROVIDER_PROTOCOL` 使用下划线 `glm_ocr` 作为项目内部协议标识；`VISION_PROVIDER_MODEL` 使用官方模型名 `glm-ocr`，请求体原样传入。
- `VISION_PROVIDER_MODEL` 的具体值以智谱官方文档当前要求为准；实现前必须核对官方模型名、endpoint 和请求字段。
- 前端现有图片压缩策略继续生效；GLM-OCR provider 在服务端可额外校验 base64 解码后图片大小不超过官方单图限制，超限时返回可恢复错误，不调用 provider。
- 不复用 `ANALYSIS_PROVIDER_*`；OCR 抽取和标准解法生成继续分离。
- 不读取 service role key、不访问数据库。

## 7. GLM-OCR Provider Contract

实现时需要在 `src/lib/providers/**` 中新增或扩展 provider 分支：

- 请求 endpoint 使用智谱文档解析接口，而不是 `/chat/completions`。
- 请求体只包含官方文档要求的必要字段：`model`、承载图片 base64 或 URL 的 `file` 字段，以及必要的解析选项；`mime_type` 只用于构造官方要求的图片输入格式或本地校验，不额外写入调试日志。
- 不发送 `student_profile_summary`、学生完整画像、错题历史、service role key 或图片以外的敏感内容；GLM-OCR 是 OCR/layout 接口，不依赖画像上下文。
- 响应只读取官方返回中的 OCR markdown / layout 结果，并通过运行时校验收口。
- 不保存原始 provider 响应。

响应字段校验策略：

| 字段 | 是否必填 | 用途 | 缺失/异常处理 |
|---|---|---|---|
| `md_results` | 主要字段 | 读取 OCR markdown 文本，作为 mapper 的主输入 | 为空时尝试从 `layout_details` 中可识别文本字段拼接，并加入 warning；两者都无文本时返回 `empty_text_content` |
| `layout_details` | 可选 | 辅助判断版面元素顺序、手写/印刷区域、公式/表格/段落类型 | 缺失时仅依赖 `md_results`；不把缺失本身视为失败 |
| `error` | 错误响应字段 | 读取官方错误码/信息用于本地分类 | 映射为 recoverable `model_request_failed`，只保留安全 `provider_debug` |
| `usage` / `data_info` / `layout_visualization` | 可忽略 | 可用于 provider 侧统计或可视化，但 P2.8 不消费 | 不进入 API 响应，不写日志，不影响草稿生成 |

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

- 文本顺序优先使用 `layout_details` 的版面顺序；没有可用 layout 时使用 `md_results` 原始顺序。
- 题干起点优先按题号、大题号或小问标记定位，例如 `15.`、`（1）`、`(1)`、`已知`、`求`、`证明`。
- 作答区域起点按以下优先级判断：
  1. `layout_details` 标记为手写、answer、solution、note 等作答类区域。
  2. markdown 中出现 `解：`、`证明：`、`答：`、`学生答案`、`学生作答` 等显式标记。
  3. 题干结束后连续多行公式、推导符号或明显不是题目条件的文本。
- `question_text`：保留题号、题干、条件和所有小问；如果无法稳定定位作答区域，则保留 OCR 文本中最像题干的前段或全文，并加 `question_answer_split_uncertain` warning。
- `student_answer`：只有定位到作答区域时才填入作答文本；否则填 `"未识别到学生答案"`。
- `student_solution_steps`：从作答区域按换行、分号、步骤编号或公式推导行切分，过滤空行，最多保留 8 条。
- `extraction_confidence`：
  - 题干和作答步骤都较完整：`medium` 或 `high`。
  - 只识别到题干：`low`。
  - 版面顺序不确定、公式破损、学生作答区域不清：`low`。
- `warnings`：记录需要用户确认的点，例如题干可能截断、未识别到学生答案、公式可能不完整、版面顺序不确定。

第一版不追求自动完美分离题干和学生步骤。确认表单仍是正式边界，用户可以编辑。

示例：

GLM-OCR markdown：

```md
15.（本小题满分13分）已知函数 $f(x)=\frac{1}{2}x^2-a\ln x+2a$，其中 $a\in\mathbb{R}$。
（1）讨论函数 $f(x)$ 的单调性；（2）若函数 $f(x)$ 有两个零点，求 $a$ 的取值范围。

解：
$f'(x)=x-\frac{a}{x}=\frac{x^2-a}{x}, x\in(0,+\infty)$
```

期望映射：

```json
{
  "question_text": "15.（本小题满分13分）已知函数 $f(x)=\\frac{1}{2}x^2-a\\ln x+2a$，其中 $a\\in\\mathbb{R}$。（1）讨论函数 $f(x)$ 的单调性；（2）若函数 $f(x)$ 有两个零点，求 $a$ 的取值范围。",
  "student_answer": "$f'(x)=x-\\frac{a}{x}=\\frac{x^2-a}{x}, x\\in(0,+\\infty)$",
  "student_solution_steps": ["$f'(x)=x-\\frac{a}{x}=\\frac{x^2-a}{x}, x\\in(0,+\\infty)$"],
  "extraction_confidence": "medium",
  "warnings": []
}
```

如果没有 `解：`、手写区域或其他作答信号，则同一段文本应映射为：

```json
{
  "student_answer": "未识别到学生答案",
  "student_solution_steps": [],
  "extraction_confidence": "low",
  "warnings": ["未识别到清晰学生作答区域，请确认图片中包含学生答案或解题痕迹。"]
}
```

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
- GLM-OCR 不复用 chat vision 的模型级 repair retry：不把上一次错误输出拼进 prompt，也不发送 `student_profile_summary`。可选重试只限网络错误或 timeout 的一次性有限重试；HTTP 4xx、OCR 空结果和 mapper 解析失败不做模型级重试。

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
- `md_results` 为空但 `layout_details` 有可用文本时可以降级拼接；两者都为空时返回 `empty_text_content`。
- OCR 响应为空时返回 `empty_text_content`，且不泄露原始响应。
- HTTP error、invalid JSON、timeout、network failure 都保持现有 recoverable 语义。
- GLM-OCR 请求不携带 `student_profile_summary`，不走 chat vision 的 repair prompt。

### Mapper tests

新增纯函数测试：

- 题干 + 学生步骤都存在时生成 `student_work_sufficient` 所需草稿。
- 只有题干时生成 `student_answer="未识别到学生答案"`、`extraction_confidence="low"` 和 warning。
- 多行公式和小问不会被粗暴删除。
- GLM-OCR markdown 中的行内公式/块级公式能正确保留为 LaTeX 包裹文本，便于前端 KaTeX 渲染。
- 裸数字、参数范围符号和中文小问在 mapper 后仍保持可读，不引入非法 LaTeX。
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
2. 实现 GLM-OCR response -> OCR markdown 提取，并写提取逻辑单元测试。
3. 实现 OCR markdown -> `VisionExtractionDraft` 的保守 mapper，并写 mapper 单元测试，覆盖题干+步骤、仅题干、公式、超长文本。
4. 接入 `createVisionProvider()` protocol 分支。
5. 跑 fake provider 的 API smoke。
6. 本地用一张真实上传题做可选 smoke，确认不打印敏感内容。

## 15. 参考

- 智谱 GLM-OCR 文档解析 API：<https://docs.bigmodel.cn/api-reference/%E6%A8%A1%E5%9E%8B-api/%E6%96%87%E6%A1%A3%E8%A7%A3%E6%9E%90>
- 当前在线图片抽取 provider：`src/lib/providers/anthropic-compatible-provider.ts`
- 当前视觉抽取 parser：`src/lib/vision-extraction/vision-extraction-parser.ts`
- 现有 MinerU 离线入库边界：`docs/superpowers/specs/2026-06-21-p20-derivative-pdf-ocr-ingestion-design.md`
