# P2.7 Dynamic Variant Practice Design Spec

## 1. 背景

当前 `main` 已完成 P2.3、P2.5 和 P2.6：

- P2.3 把教辅题源加工成 `enriched_practice_corpus.json`，并用 taxonomy、AI proposal、自动门控和人工审核记录收口标签质量。
- P2.5 把本地 `artifacts/rag/variant-practice-agent/recommendations.json` 读入产品页，但只在默认样例题 `sample_derivative_001` 下展示裁剪后的 `ProductVariantPractice`。
- P2.6 把 `artifacts/rag` 整理成 demo-minimal，本地只保留核心题库和当前产品推荐 artifact；`artifacts/**` 仍不提交 Git。

这意味着产品页现在能展示真实题库里的变式练习，但推荐仍是“预生成 artifact”：它不随上传题诊断结果变化。

P2.7 要解决的问题是：

```text
上传题经 /api/confirm 生成诊断报告
-> 基于这次诊断结果构造 Practice Query
-> 服务端读取本地 enriched corpus
-> 调用 Variant Practice Agent
-> 返回真实题库里的 3 道变式练习
-> 前端展示学生可读卡片，失败时保留现有 fallback
```

## 2. 目标

P2.7 的目标是让上传题诊断完成后，也能动态显示来自真实教辅题库的 3 道变式练习。

验收口径：

- 对确认后的导数类上传题诊断，前端能异步请求服务端 RAG，并在“变式练习”区域显示 3 道来自 `enriched_practice_corpus.json` 的题。
- 推荐输入来自诊断结果中的题干、知识点、错因和证据等级，不读取浏览器本地文件，不让前端直接访问 corpus。
- RAG 只作为练习题源，不写 `memory_events`、`student_profiles`、错题本或 evidence API。
- 如果服务端 RAG 不可用、artifact 缺失、题型不支持或无法凑满 3 道真实题库题，页面继续展示诊断响应自带的 `practice_questions` fallback。
- `sample_diagnosis` 稳定路径不被破坏：默认样例题仍使用 P2.5 的静态 artifact 展示，缺失时仍回退到预写练习题。

## 3. 当前约束和假设

### 3.1 明确假设

- 当前仍固定 `demo_student_001`，不做登录、真实多用户、老师端或 RLS 用户策略。
- 当前动态 RAG 只支持导数专题题库：`enriched-practice-corpus-v0` / `math_derivative_v0`。
- 上传题诊断结果里的知识点仍使用 MathTrace 诊断知识点 key，例如 `derivative_monotonicity`、`parameter_classification`。
- RAG Agent 使用的 corpus 知识点仍是较粗的 `derivative`，并用 `target_skills` / `method_tags` 做细分。
- P2.7 不要求动态推荐写回当前诊断响应；可以在诊断完成后由前端单独异步请求。
- `ProductVariantPractice` 仍是前端展示的唯一正式数据形状，内部 RAG 字段不进入 UI。

### 3.2 不确定但先固定的取舍

上传题诊断结果目前没有 `section_title`。现有 Agent 用 `section_title` 区分 `foundation`。P2.7 采用保守映射：服务端只从受控诊断知识点推导导数题库章节，不接受前端自由传入章节。

专题归属必须先由 `knowledge_points` 决定。`mistake_causes` 只能作为已确认导数专题后的辅助信号，不能单独把非导数题路由到导数题库。

建议第一版映射：

| 诊断知识点 / 错因 | RAG query target_skills | RAG query section_title |
|---|---|---|
| `derivative_monotonicity` | `["monotonicity"]` | `考点 2 导数与函数的单调性` |
| `parameter_classification` | `["parameter_range"]` | `专项突破 2 利用导数研究恒(能)成立问题` |
| 已命中导数专题，且 `mistake_causes` 包含 `classification_missing` | 追加 `["parameter_range"]` | 不单独覆盖更强的导数章节命中 |
| 题干包含切线/斜率/几何意义 | 追加 `["tangent_slope", "derivative_geometric_meaning"]` | `考点 1 导数的概念、几何意义与运算`，仅在没有更强知识点命中时使用 |
| 题干包含极值/最值 | 追加 `["extrema"]` | `考点 3 导数与函数的极值` 或 `考点 4 导数与函数的最值`，第一版优先极值 |
| 题干包含零点 | 追加 `["zero_point"]` | `专项突破 4 利用导数研究函数的零点问题` |

多信号同时命中时，`section_title` 必须使用确定性优先级，避免后命中的弱信号覆盖主知识点。第一版优先级固定为：

```text
derivative_monotonicity
> parameter_classification
> 题干切线/斜率/几何意义
> 题干极值/最值
> 题干零点
```

`classification_missing` 只能追加 `parameter_range` 这类能力信号，不能覆盖已由 `knowledge_points` 推导出的 `section_title`。

如果 `knowledge_points` 完全不属于导数专题，或者映射后没有 `target_skills`，服务端返回 `variant_practice: null`，前端保持 fallback。

## 4. 非目标

P2.7 不做：

- 不新增 pgvector、Milvus、embedding、数据库表或远程题库服务。
- 不让 LLM 生成新题，也不做 LLM rerank 或 reason polish。
- 不把 RAG 推荐写入 `memory_events`、`student_profiles`、`diagnosis_runs`、`mistake_book_items` 或 localStorage。
- 不改变 `/api/confirm` 的画像写入、证据等级、`memory_delta` 或持久化策略。
- 不把 `artifacts/**`、推荐结果、PDF、MinerU JSON 或 review 文档提交 Git。
- 不支持非导数专题动态推荐；不支持多学生、老师端、登录或权限隔离。
- 不展示 RAG 内部字段：`score`、`matched_dimensions`、`item_id`、`source_candidate_id`、`target_skill`、`method_tag`、raw `reason`、raw `warnings`。
- 不把题库缺口包装成成功。如果无法从真实 corpus 选出 3 道题，就回退，不硬造题。

## 5. 方案比较

### 方案 A：新增 `POST /api/variant-practice`（推荐）

前端在 `/api/confirm` 成功后，把当前诊断报告的最小摘要发给新的服务端 API。API 校验请求、构造 Practice Query、读取 `enriched_practice_corpus.json`、调用 Variant Practice Agent，再返回 `ProductVariantPractice | null`。

优点：

- 不扩大 `/api/confirm` 的关键路径；RAG 失败不会影响诊断报告、画像写入或错题本刷新。
- API 边界清晰：只读、无副作用、只返回练习展示模型。
- 前端可以先展示现有 `practice_questions`，RAG 成功后替换，体验稳定。
- 易于测试缺 artifact、坏 JSON、不支持题型、推荐不足 3 道等降级路径。

代价：

- 前端会多一次请求。
- API 输入来自浏览器，需要明确它只用于只读推荐，不能当作画像事实。

### 方案 B：把动态 RAG 合入 `/api/confirm` 响应

`handleConfirmRequest()` 在生成诊断报告后立刻调用 RAG，把推荐结果塞进确认响应。

优点：

- 服务端能直接使用刚生成的诊断对象，不需要前端回传摘要。
- 前端少一次请求。

代价：

- RAG artifact 缺失、坏 JSON 或推荐不足可能拖慢或污染 `/api/confirm` 主流程。
- 会扩大 `DiagnoseApiResponse` 契约，并让“诊断与持久化”和“练习推荐”耦合。
- 更容易误导后续维护者把 RAG 输出当成诊断事实或持久化输入。

结论：暂不采用。等 P2.7 API 稳定后，未来可以评估是否在服务端内部编排，但不在第一版扩大确认接口。

### 方案 C：继续只预生成 `recommendations.json`

每次演示前用 CLI 生成新的 `recommendations.json`，产品页继续读取静态 artifact。

优点：

- 改动最小。
- 与 P2.5 完全一致。

代价：

- 不满足“上传题诊断完成后基于诊断结果动态推荐”的目标。
- 仍然只能演示固定 sample 的推荐，不是真正的产品闭环。

结论：不采用。

## 6. 推荐架构

推荐采用方案 A。

```text
Confirmed image diagnosis response
  -> Client builds DynamicVariantPracticeRequest
  -> POST /api/variant-practice
    -> parse request
    -> derive Practice Query from diagnosis summary
    -> read enriched_practice_corpus.json on server
    -> validate corpus
    -> recommendVariantPractice(...)
    -> createVariantPracticeProductViewModel(...)
  -> ProductVariantPractice | null
  -> PracticeLab renders RAG cards or keeps fallback cards
```

### 6.1 API Route

新增：

```text
src/app/api/variant-practice/route.ts
```

职责：

- 只处理 `POST`。
- 解析 JSON；非法 JSON 返回 400。
- 调用 service；service 内部不抛出可预期错误。
- 返回稳定响应：

```ts
interface DynamicVariantPracticeApiResponse {
  variant_practice: ProductVariantPractice | null;
}
```

不返回 raw RAG warnings。`demo_fill_used` 这类可展示信息继续通过 `ProductVariantPractice.notice` 表达。

### 6.2 请求契约

第一版只接收诊断摘要，不接收完整诊断报告：

```ts
interface DynamicVariantPracticeRequest {
  student_id: "demo_student_001";
  request_source: "confirmed_image_diagnosis";
  evidence_level: "student_work_sufficient" | "problem_only" | "insufficient" | null;
  persistence_evidence:
    | "student_work"
    | "uploaded_problem_only"
    | "user_confirmed"
    | "none"
    | null;
  profile_update_kind: "mistake_cause" | "problem_type_focus" | "none";
  question_text: string;
  knowledge_points: string[];
  mistake_causes: string[];
}
```

校验规则：

- `student_id` 必须是 `demo_student_001`。
- `request_source` 必须是 `confirmed_image_diagnosis`；它是 P2.7 API 请求来源标识，不复用诊断响应里的 `source: "image"` 字段。
- `question_text` 必须是非空字符串；服务端内部按 Unicode 字符数截断到 800 字符，截断文本只用于检索和推荐，不用于前端展示。
- `knowledge_points` / `mistake_causes` 必须是字符串数组。服务端只用 P2.7 已定义的 key 参与映射；未消费的合法错因不能被视为非法诊断结果。
- 请求体只包含文本摘要和少量标签，不携带图片 base64 或本地文件内容；P2.7 不需要额外配置 body size limit。
- 只有以下诊断可以触发动态 RAG：
  - `evidence_level="student_work_sufficient"` 且 `persistence_evidence="student_work"`。
  - `evidence_level="problem_only"` 且 `persistence_evidence="user_confirmed"`。
- `problem_only` 且 `persistence_evidence="uploaded_problem_only"` / `"none"` 的报告不触发动态 RAG，避免把题型风险当成学生具体错因。

### 6.3 服务层

新增服务边界建议：

```text
src/lib/server/rag/dynamic-variant-practice-service.ts
```

职责：

- 读取 `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`。
- 校验 `corpus_version === "enriched-practice-corpus-v0"` 和 item 基本字段。
- 只消费 `tag_review_meta.review_status === "approved"` 的题；未审核、`needs_fix` 或 `skipped` 的题不参与推荐。
- 检查映射出的 `section_title` 是否存在于 corpus；不存在时降级为只用 `knowledge_points` + `target_skills` 搜索，不强制同章节。
- 调用变式练习 Agent。
- Agent 模块加载或调用失败时稳定返回 `variant_practice: null`，不让只读推荐接口变成 500 或影响诊断报告。
- 要求最终 product items 恰好 3 道；不足 3 道返回 `null`，不展示半成品 RAG 结果。
- 不写文件、不写数据库、不读 env secret、不调用 provider。

“恰好 3 道或 null”是 P2.7 第一版为了保持 P2.5 三卡片产品体验的一致性。实现时应保留未来返回 1-2 道 + notice 的扩展空间，但第一版不展示半成品动态 RAG。

新增纯映射模块建议：

```text
src/lib/rag/dynamic-variant-practice-query.ts
```

职责：

- 从 `DynamicVariantPracticeRequest` 派生 Practice Query。
- 只包含 browser-safe、无副作用、可单测的映射规则。
- 不依赖 `fs`、数据库、provider 或 server-only env。

建议输出：

```ts
interface DynamicPracticeQuery {
  id: string;
  question_text: string;
  knowledge_points: ["derivative"];
  section_title: string | null;
  mistake_causes: string[];
  target_skills: string[];
}
```

如果无法派生出导数专题 query，返回 `null`。

### 6.4 Agent Core 复用方式

现有 Agent core 在：

```text
scripts/rag/practice-corpus-search-core.mjs
scripts/rag/variant-practice-agent-core.mjs
```

这些文件当前服务于本地 CLI 工具链。P2.7 有两种实现选择：

1. 短期可以在服务层复用现有确定性逻辑，但不要让 Client Component 或 browser-safe 模块 import `scripts/**`。
2. 更稳妥的实现计划是把运行时需要的纯函数提升到 `src/lib/rag/` 或 `src/lib/server/rag/`，再让 API route 使用新运行时模块；CLI 是否迁移到同一模块可在实现计划中评估。

本 spec 推荐实现计划优先采用第一种方向：先保证 P2.7 API 和产品闭环，不做大范围 RAG 脚本目录重组。只有在不扩大 P2.7 范围、且能用 focused tests 锁住行为一致性的前提下，才小范围提升运行时纯函数到 `src/lib/rag/` 或 `src/lib/server/rag/`。

## 7. 前端行为

### 7.1 触发时机

只在确认后的上传题报告成功后触发动态 RAG：

```text
requestConfirmedDiagnosis(...)
-> setDiagnosisView(createImageDiagnosisViewModel(response))
-> setIsCurrentConfirmedImageReport(true)
-> requestDynamicVariantPractice(response summary)
```

不在这些场景触发：

- 初始样例题页面。
- 切换样例题。
- `/api/diagnose` 的 `image_diagnosis` 识别草稿阶段。
- `problem_only` 且用户跳过追问的报告。
- 诊断结果不是导数专题或无法映射到 `math_derivative_v0`。

### 7.2 展示状态

`PracticeLab` 继续接收 `ProductVariantPractice | null`。

建议工作台状态：

```ts
const [dynamicVariantPractice, setDynamicVariantPractice] =
  useState<ProductVariantPractice | null>(null);
```

展示优先级：

```text
confirmed image report + dynamicVariantPractice
> default sample + initialVariantPractice
> diagnosis.practice_questions fallback
```

RAG 请求 pending 时不需要新增复杂 loading 卡片。页面可以先展示 fallback 练习题，RAG 成功后替换成真实题库推荐；失败则保持 fallback。这样避免让练习区因为一个只读推荐接口出现空白。

### 7.3 请求并发和陈旧结果

前端需要避免旧请求覆盖新报告：

- 每次开始新的诊断、切换模式、图片准备失败或清空图片时清空 `dynamicVariantPractice`。
- 为动态 RAG 请求加 request id/ref；只有最新请求可以写入 state。
- 如果用户在请求中途切回样例题或重新上传，忽略旧响应。

## 8. 数据流边界

### 8.1 RAG 只读边界

P2.7 的 RAG API 是只读服务：

- 输入：已生成诊断报告的最小摘要。
- 输出：学生可读的 3 道练习卡片数据。
- 副作用：无。

它不能：

- 改写诊断报告。
- 改写 `practice_questions` 原始响应。
- 写数据库或 localStorage。
- 决定 `memory_delta.should_persist`。
- 影响错题本去重或画像投影。

### 8.2 安全和隐私

- 不记录完整题干、完整学生答案或完整 corpus 到日志。
- 不返回完整 `source_ref`、`score`、`matched_dimensions`、审核字段或 taxonomy debug 字段给前端。
- artifact 缺失或坏 JSON 时返回 `variant_practice: null`，不把文件路径、堆栈或 corpus 内容暴露给浏览器。
- 服务端只读取固定 allowlist 路径：`artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`。

## 9. 错误和降级

| 场景 | API 行为 | 前端行为 |
|---|---|---|
| 非 JSON 请求 | 400 | 保持原练习题 |
| `student_id` 不是 `demo_student_001` | 400 | 保持原练习题 |
| `request_source` 不是 `confirmed_image_diagnosis` | 400 | 保持原练习题 |
| 证据等级不足 | 200 `{ variant_practice: null }` | 保持原练习题 |
| 非导数题或无法映射 target skills | 200 `{ variant_practice: null }` | 保持原练习题 |
| corpus 文件缺失 | 200 `{ variant_practice: null }` | 保持原练习题 |
| corpus JSON 非法或 schema 不合法 | 200 `{ variant_practice: null }` | 保持原练习题 |
| Agent 推荐不足 3 道 | 200 `{ variant_practice: null }` | 保持原练习题 |
| Agent 推荐 3 道但含内部污染字段 | 先调用 `createVariantPracticeProductViewModel` 过滤；过滤后 items 长度不是 3 则返回 `{ variant_practice: null }` | 保持原练习题 |

## 10. 测试策略

### 10.1 Query mapping tests

覆盖：

- `derivative_monotonicity` 派生 `knowledge_points=["derivative"]`、`target_skills=["monotonicity"]`。
- `parameter_classification` 派生 `target_skills=["parameter_range"]`。
- `knowledge_points=["sequence_recursion"]` 且 `mistake_causes=["classification_missing"]` 返回 `null`，证明错因标签不能单独决定导数专题归属。
- `knowledge_points=["derivative_monotonicity"]` 且 `mistake_causes=["classification_missing"]` 可以追加或保留 `parameter_range` 相关信号。
- `knowledge_points=["derivative_monotonicity", "function_domain"]` 可以触发导数推荐；`knowledge_points=["function_domain", "sequence_recursion"]` 返回 `null`。
- 题干含“切线/斜率”时追加切线相关 target skills。
- `evidence_level="student_work_sufficient"` 且 `persistence_evidence="student_work"` 可以触发。
- `evidence_level="problem_only"` 且 `persistence_evidence="uploaded_problem_only"` / `"none"` 返回 `null`。
- `evidence_level="problem_only"` 且 `persistence_evidence="user_confirmed"` 可以触发。
- 未知 `knowledge_points` / `mistake_causes` 被忽略，不透传进 query。
- `question_text` 按 800 个 Unicode 字符截断，不把超长输入送进 search。

### 10.2 Service tests

使用临时合成 corpus，覆盖：

- 支持的导数诊断请求返回 3 道 `ProductVariantPractice.items`。
- 不足 3 道候选返回 `null`。
- 缺 corpus、坏 JSON、非法 corpus schema 返回 `null`。
- `corpus_version` 不是 `enriched-practice-corpus-v0` 时返回 `null`。
- 合成 corpus 不包含目标 `section_title` 时，验证服务降级为不强制同章节，或在无法凑满 3 道时返回 `null`。
- `tag_review_meta.review_status` 不是 `approved` 的 item 不参与推荐。
- 输出不包含 `score`、`matched_dimensions`、`item_id`、`source_candidate_id`、`source_ref`、raw `warnings`。
- `createVariantPracticeProductViewModel` 过滤后 items 不等于 3 时，服务返回 `null`。
- `demo_fill_used` 只变成 `ProductVariantPractice.notice`。

### 10.3 API route tests

覆盖：

- 非 JSON 请求返回 400。
- 非 demo student 返回 400。
- 合法但不支持题型返回 200 + `variant_practice:null`。
- 合法导数诊断返回 200 + 3 道 product items。

### 10.4 UI tests

覆盖：

- 默认样例题仍只使用 `initialVariantPractice`。
- 确认上传题后会请求 `/api/variant-practice`。
- 动态 RAG 成功后 `PracticeLab` 展示动态 3 题。
- 动态 RAG 失败或返回 null 时继续展示 `diagnosis.practice_questions`。
- 开始新诊断、切换模式或旧请求晚返回时，不出现陈旧动态推荐。
- UI 源码和渲染文本不出现内部 RAG debug 字段。

### 10.5 验证命令

实现完成后至少运行：

```text
node scripts/run-tests.mjs default
npm run test:smoke
npm run lint
npm run build
git diff --check
git ls-files artifacts .env.local docs/reviews .superpowers/sdd
```

如果改动触及页面交互，还应本地打开 `http://localhost:3000`，验证：

- 默认样例题仍显示当前 P2.5 静态推荐。
- 上传题确认后，如果诊断映射为导数专题，练习区替换为真实题库 3 题。
- RAG artifact 临时缺失时，上传题报告仍显示并保留 fallback 练习题。

## 11. 文档收口

P2.7 实现阶段需要同步检查：

- PRD：补充 P2.7 动态服务端 RAG 推荐边界，说明它替代的是上传题练习展示来源，不替代画像写入或诊断事实。
- `docs/TECHNICAL_ROADMAP.md`：可补一句当前 RAG 进展已从本地 artifact 展示推进到确认后动态推荐 API。
- `docs/rag-artifacts.md`：如果默认运行时读取路径仍是 `enriched_practice_corpus.json`，需要确认文档说明与代码一致。
- `interview/mathtrace-project-narrative.md`：实现、审查和验证完成后新增 P2.7 阶段，重点说明“服务端只读 RAG API + 受控 query 映射 + fallback 保演示稳定”。

本 design spec 本身不更新 PRD，因为它是实现前设计稿；实现计划应把 PRD/叙事文档更新列为收尾任务。

## 12. 验收标准

- 新增设计不要求实现代码，但后续 P2.7 实现完成时必须满足：
  - 确认后的导数类上传题能通过服务端 RAG 返回 3 道真实 corpus 题。
  - 前端展示使用 `ProductVariantPractice`，不展示内部 debug 字段。
  - RAG 不写画像、错题本、数据库或 localStorage。
  - artifact 缺失、坏 JSON、非导数题、证据不足或推荐不足 3 道时不破坏诊断报告。
  - `sample_diagnosis` 主路径和 P2.5 静态 sample 推荐不回归。
  - 相关单测、smoke、lint、build 通过。

## 13. 自查

- 没有新增登录、多用户、老师端、RLS、pgvector、embedding、LLM rerank 或生成新题。
- 没有让前端直连数据库、读取本地文件或访问 service role key。
- 没有把 RAG 输出写入 `memory_events` / `student_profiles`。
- 保持 `sample_diagnosis` 稳定路径。
- 对“上传题没有 `section_title`”的关键不确定性做了保守映射，不默默接受前端自由输入。
- 明确了 3 道题的产品要求：成功就显示 3 道真实题库题，否则回退。
