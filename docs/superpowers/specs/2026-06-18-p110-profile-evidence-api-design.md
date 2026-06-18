# P1.10 真实画像证据接口 Design Spec

## 1. 背景

P1.8 已经把 MathTrace 的长期画像拆成两层：

```text
memory_events = 可解释的画像变化事件
student_profiles = 从 memory_events 投影出的当前画像快照
```

P1.9 又把前端画像展示从“掌握度扣分”改成“薄弱证据与复习优先级”。但 P1.9 有一个明确缺口：前端推荐依据只能使用当前 `StudentProfile`、本次 `DiagnosisViewModel.memory_delta` 和 demo `mistakeHistory`，不能读取真实 `memory_events` 历史。

P1.10 要补齐这个缺口：让页面在不暴露数据库内部结构的前提下，读取服务端整理过的画像证据摘要，用真实历史事件支撑“为什么优先复习这个知识点”。

## 2. 目标

P1.10 的目标是新增一个安全、只读、摘要型 profile evidence API，并为前端接入真实证据做好闭环。

具体目标：

- 新增服务端 `GET /api/student-profile/evidence`。
- 读取 `memory_events`，但只返回前端展示需要的摘要字段。
- 前端不直连 Supabase，不读取 service role key。
- 有云端 evidence 时，`ProfileInsights` 的“推荐依据”优先使用真实历史摘要。
- 无 evidence、数据库未配置、读取失败或响应格式无效时，保留 P1.9 fallback。
- 不改变 `student_profiles` 当前画像投影规则。
- 不改变 `memory_delta` 契约。
- 不修改数据库表结构。
- 保持 `sample_diagnosis`、错题本和当前画像读取稳定。

## 3. 明确不做

P1.10 不做以下内容：

- 不做 RAG、pgvector、Milvus、知识库召回或相似题检索。
- 不做登录、真实多用户、老师端、家长端或面向用户的 RLS 策略。
- 不新增数据库表，也不修改现有 migration。
- 不返回完整 `memory_delta`。
- 不返回完整 `diagnosis_runs`、完整题目文本、学生答案、标准答案、图片内容、原始模型输出或完整审计快照。
- 不做完整历史事件列表页、分页浏览器、趋势图或老师端解释面板。
- 不引入练习完成后的正向画像证据，不新增 `practice_attempts`。
- 不让模型、RAG 或 provider 影响画像写入。
- 不把 evidence API 当成新的事实源；事实源仍是 `memory_events`。

## 4. 方案对比

### 4.1 扩展 `/api/student-profile`

把 evidence 摘要直接加到当前画像接口里。

优点：

- 前端少一次请求。
- 当前画像和证据可以一起返回。

缺点：

- 当前画像快照和历史证据职责混在一起。
- `/api/student-profile` 响应会变大，后续趋势、分页或过滤会更难演进。
- 画像恢复路径更容易被证据查询故障拖累。

结论：不推荐。

### 4.2 新增 `/api/student-profile/evidence`

当前画像继续由 `/api/student-profile` 返回；画像证据摘要由新的 evidence API 返回。

优点：

- 职责清楚：当前快照和历史证据分离。
- 证据读取失败不会影响当前画像恢复。
- 更容易限制返回字段，避免前端依赖底层 `memory_events` schema。
- 后续可以独立扩展 limit、时间窗口、趋势摘要或老师端视图。

缺点：

- 前端多一次 best-effort 请求。
- 需要新增客户端 response guard 和 view model 输入。

结论：推荐。

### 4.3 新增完整 `/api/memory-events`

把 `memory_events` 原始事件或接近原始事件的结构暴露给前端。

优点：

- 灵活，前端可自由组合展示。

缺点：

- 太早泄漏数据库内部结构。
- 容易暴露完整 `memory_delta`、rationale、诊断审计信息或未来敏感字段。
- 前端会和持久化表结构耦合，后续迁移成本高。

结论：不做。

## 5. 推荐架构

P1.10 采用“服务端摘要 API + 前端可选 evidence 输入”的结构：

```text
Browser
  -> requestCloudStudentProfile()
  -> requestStudentProfileEvidence()

Next API
  -> GET /api/student-profile
  -> GET /api/student-profile/evidence

Service layer
  -> handleStudentProfileRequest()
  -> handleStudentProfileEvidenceRequest()

Persistence layer
  -> readCurrentProfile()
  -> listProfileEvidenceEvents()

Supabase Postgres
  -> student_profiles
  -> memory_events
```

关键原则：

- `ProfileInsights` 仍然只负责展示。
- `profile-view-model` 仍然是 browser-safe 纯函数。
- evidence fetch 放在 workbench client 层，不放进展示组件。
- persistence 层只做数据库读取和行结构收口，不做 UI 文案。
- service 层负责参数校验、fallback 响应、摘要聚合和错误收口。

## 6. API 契约

### 6.1 请求

```text
GET /api/student-profile/evidence?student_id=demo_student_001&limit=8
```

参数：

- `student_id`：可选，默认 `demo_student_001`。当前只允许 `demo_student_001`。
- `limit`：可选，默认 `8`，最小 `1`，最大 `20`。非法值使用默认值，不抛错。

P1.10 不增加时间范围、分页 cursor 或知识点过滤。后续如有真实历史面板，再单独扩展。

### 6.2 成功响应

```ts
interface StudentProfileEvidenceResponse {
  student_id: string;
  source: "cloud" | "fallback";
  is_database_configured: boolean;
  evidence: StudentProfileEvidenceSummary | null;
  warnings: string[];
}

interface StudentProfileEvidenceSummary {
  event_count: number;
  latest_event_at: string | null;
  top_knowledge_focus: KnowledgeEvidenceSummary[];
  top_mistake_causes: MistakeCauseEvidenceSummary[];
  recent_events: RecentProfileEvidenceEvent[];
}

interface KnowledgeEvidenceSummary {
  id: string;
  event_count: number;
  total_weakness_delta: number;
  latest_event_at: string;
}

interface MistakeCauseEvidenceSummary {
  id: string;
  event_count: number;
  total_delta: number;
  latest_event_at: string;
}

interface RecentProfileEvidenceEvent {
  id: string;
  created_at: string;
  event_type: "mistake_cause" | "problem_type_focus";
  evidence_level: string | null;
  persistence_evidence: string | null;
  knowledge_focus: string[];
  mistake_causes: string[];
  rationale_summary: string;
}
```

### 6.3 错误响应

非法 `student_id` 返回 400，并复用当前画像接口的错误结构：

```ts
{
  error: {
    code: "invalid_request";
    message: "当前 demo 只支持 demo_student_001。";
    recoverable: true;
  }
}
```

数据库未配置、查询失败或无 evidence 记录不返回 500；返回 200 fallback：

```ts
{
  student_id: "demo_student_001",
  source: "fallback",
  is_database_configured: false,
  evidence: null,
  warnings: ["数据库暂未配置，继续使用本地 demo 画像依据。"]
}
```

读取失败时：

```ts
{
  student_id: "demo_student_001",
  source: "fallback",
  is_database_configured: true,
  evidence: null,
  warnings: ["云端画像证据暂时读取失败，继续使用本地 demo 画像依据。"]
}
```

无事件时：

```ts
{
  student_id: "demo_student_001",
  source: "fallback",
  is_database_configured: true,
  evidence: null,
  warnings: ["云端画像证据暂未生成，继续使用本地 demo 画像依据。"]
}
```

## 7. 摘要规则

### 7.1 可读取字段

服务端只从 `memory_events` 读取以下字段：

- `id`
- `created_at`
- `event_type`
- `knowledge_mastery_changes`
- `mistake_cause_changes`
- `review_priority_changes`
- `rationale`
- `evidence_level`
- `persistence_evidence`
- `profile_update_kind`

P1.10 不 join `diagnosis_runs` 或 `mistake_book_items`。这样可以避免把题目正文、学生答案、标准答案或完整诊断快照带入 evidence API。

### 7.2 事件范围

Repository 按 `student_id` 过滤，按 `created_at desc, id desc` 读取最近 `limit` 条事件。当前 migration 已有 `memory_events_student_created_idx`，适合该读取路径。

服务端聚合摘要只基于本次返回的最近事件，不声称代表全部历史趋势。响应文案和前端文案要避免“完整历史”“长期趋势已完整统计”等表达。

### 7.3 知识点摘要

`top_knowledge_focus` 从最近事件中的 `knowledge_mastery_changes` 和 `review_priority_changes` 派生。

规则：

- 只统计数值有限的 `knowledge_mastery_changes`。
- `total_weakness_delta = sum(max(0, -mastery_delta))`。
- 如果某知识点只出现在 `review_priority_changes`，但没有负向 mastery delta，则 `total_weakness_delta = 0`，仍可作为关注证据。
- `event_count` 表示最近事件窗口中命中过该知识点的事件数。
- 排序：`total_weakness_delta desc`，再 `event_count desc`，再 `latest_event_at desc`。
- 默认最多返回 5 条。

这里的 `total_weakness_delta` 是展示层证据摘要，不写回 `student_profiles`，也不替代 P1.9 的 `weaknessIndex`。

知识点中文名由前端 view model 通过现有展示映射生成，API 只返回结构化 id 和统计值。

### 7.4 错因摘要

`top_mistake_causes` 从最近事件中的 `mistake_cause_changes` 派生。

规则：

- 只统计数值有限的 `mistake_cause_changes`。
- `total_delta = sum(max(0, cause_delta))`。
- `event_count` 表示最近事件窗口中该错因有正向新增的事件数。
- 排序：`total_delta desc`，再 `event_count desc`，再 `latest_event_at desc`。
- 默认最多返回 5 条。

错因人话标题和解释由前端 view model 通过 P1.9 已有映射生成，API 只返回结构化 id 和统计值。

### 7.5 最近事件摘要

`recent_events` 保留最近 `limit` 条事件的简化视图。

规则：

- `knowledge_focus` 返回该事件中出现的知识点 id，包含 `knowledge_mastery_changes` keys 和 `review_priority_changes`。
- `mistake_causes` 返回该事件中正向增加的错因 id。
- `rationale_summary` 来自 `rationale`，但必须 trim 并限制长度，建议上限 80 个中文字符左右。
- 如果 `rationale` 缺失、为空或格式异常，则服务端生成保守摘要，例如“本次诊断产生了可写入画像的薄弱证据。”。

`rationale_summary` 是解释文案，不参与画像计算。

## 8. 前端接入设计

P1.10 前端采用可选 evidence 输入：

```text
MathTraceWorkbench
  -> refreshCloudStudentProfile()
  -> refreshStudentProfileEvidence()
  -> <ProfileInsights evidence={studentProfileEvidence} />
  -> createProfileInsightsViewModel({ evidence })
```

设计细节：

- 新增 browser-safe client helper：`requestStudentProfileEvidence()`。
- helper 使用 `fetch("/api/student-profile/evidence?...", { method: "GET", cache: "no-store" })`。
- helper 必须有 response guard，拒绝未知结构或额外危险字段。
- workbench 用 best-effort 方式读取 evidence；失败时不显示错误，不打断诊断。
- reset 画像后应该清空当前 evidence，并触发一次刷新，避免旧 evidence 继续解释已重置的 demo 状态。
- 诊断成功持久化后、错题删除成功后，可以跟随当前画像刷新一起刷新 evidence。
- `ProfileInsights` 不直接发请求。

## 9. 推荐依据渲染规则

P1.9 的 `ProfileInsightsViewModel.recommendation` 继续存在，但输入增加可选 evidence。

推荐依据优先级：

1. 如果 evidence 存在，且能命中本次行动建议的知识点或错因，则使用真实 evidence 生成推荐依据。
2. 如果 evidence 存在但不能命中本次行动建议，则显示“云端最近证据”和当前本次诊断依据的组合文案。
3. 如果 evidence 为 null，则保持 P1.9 fallback。

推荐依据文案必须避免夸大：

- 可以说“最近 8 条画像事件中，X 多次出现”。
- 不说“完整历史证明”。
- 不说“长期趋势已确定”。
- 不说“模型判断你一直不会 X”。

示例：

```text
为什么优先复习参数分类讨论？
- 最近 8 条画像事件中，参数分类讨论出现 3 次薄弱证据。
- 相关错因“范围意识”累计在最近事件中新增 2 次。
- 当前薄弱指数 73，属于“高优先级”。
```

## 10. 安全和隐私边界

P1.10 的安全边界：

- API Route 仍在 `src/app/api/**/route.ts`，只做请求解析、状态码和调用 service。
- Supabase admin client 只能出现在 persistence 层。
- 前端不能 import persistence、Supabase admin client 或读取服务端环境变量。
- API 不返回完整图片 base64、题目正文、学生答案、标准答案或原始诊断快照。
- API 不返回完整 `memory_delta`。
- `rationale_summary` 必须长度限制，避免把过长模型文本或敏感原文透传到 UI。
- 当前仍固定 `demo_student_001`；任何其他 student_id 返回 400。

## 11. 文件范围

预计实现涉及：

- 新增：`src/app/api/student-profile/evidence/route.ts`
- 新增：`src/lib/student-profile/student-profile-evidence-service.ts`
- 修改：`src/lib/persistence/student-profile-persistence.ts`
- 新增或修改：`src/lib/student-profile/student-profile-evidence-client.ts`
- 修改：`src/components/mathtrace-workbench.tsx`
- 修改：`src/components/workbench/profile-view-model.ts`
- 修改：`src/components/workbench/profile-insights.tsx`
- 修改：`scripts/tests/persistence/student-profile-persistence.test.mjs`
- 修改：`scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
- 必要时修改：`scripts/tests/architecture/architecture-boundaries.test.mjs`
- 文档收口：PRD 和 `interview/mathtrace-project-narrative.md`

不涉及：

- `supabase/migrations/**`
- `src/lib/diagnosis/**` 的画像写入规则
- `src/lib/providers/**`
- `src/lib/vision-extraction/**`
- `memory_delta` schema

## 12. 验收标准

P1.10 完成后应满足：

- `GET /api/student-profile/evidence` 支持 `demo_student_001`。
- 非 demo student_id 返回 400。
- 数据库未配置时返回 200 fallback，不破坏页面。
- 数据库读取失败时返回 200 fallback，不破坏页面。
- API 响应不包含完整 `memory_delta`、题目正文、学生答案、标准答案或完整诊断快照。
- 前端有 evidence 时，推荐依据优先使用真实 `memory_events` 摘要。
- 前端无 evidence 时，保持 P1.9 fallback。
- `ProfileInsights` 不直接 fetch。
- `profile-view-model` 仍是 browser-safe 纯函数。
- `sample_diagnosis`、错题本、当前画像读取不回归。
- `npm test`、`npm run test:smoke`、`npm run lint`、`npm run build` 通过。

## 13. 测试建议

需要补充的测试：

- Service：invalid student_id 返回 400。
- Service：database not configured 返回 fallback。
- Service：empty events 返回 fallback。
- Service：query failure 返回 fallback。
- Service：最近事件聚合出 top knowledge focus。
- Service：最近事件聚合出 top mistake causes。
- Service：不会返回完整 `memory_delta` 或诊断原文。
- Client：response guard 接受合法响应。
- Client：response guard 拒绝额外字段或非法 evidence 结构。
- UI view model：有 evidence 时推荐依据使用真实摘要。
- UI view model：无 evidence 时保持 P1.9 fallback。
- Workbench：组件传入 evidence，但 `ProfileInsights` 不直接 fetch。
- Architecture boundary：前端不 import persistence / Supabase admin。

## 14. 后续演进

P1.10 之后可以继续演进，但不放进本阶段：

- 增加时间窗口，例如最近 7 天或最近 30 天。
- 支持 evidence 分页或历史事件面板。
- 引入练习完成后的正向证据和复习效果回升。
- 在老师端展示可审计的画像变化时间线。
- 在 RAG / pgvector 阶段把错题相似召回作为额外推荐来源。

这些能力都应该以 `memory_events` 和 `student_profiles` 结构化事实层为基础，而不是替代它。
