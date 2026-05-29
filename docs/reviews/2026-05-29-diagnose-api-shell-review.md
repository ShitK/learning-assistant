# Diagnose API Shell 代码审查报告

**审查日期：** 2026-05-29
**分支：** `codex/diagnose-api-shell`
**基线：** `main`
**审查范围：** 工作区全部变更（2 个已修改文件 + 3 个未跟踪文件）

---

## 验证结果

| 检查项 | 结果 |
|--------|------|
| `npm run lint` | 通过 |
| `npm run build` | 通过 |
| `/api/diagnose` 路由可见 | 是（build 输出中为 `ƒ /api/diagnose`） |
| 测试 | 未运行：项目无测试文件 |

---

## P0 — 合并前必须修复

### P0-1. `ProfileInsights` 使用静态初始数据，未使用 API 返回的 `student_profile`

**文件：** `src/components/mathtrace-workbench.tsx:542-543`

```tsx
const currentScore = demoStudentProfile.mastery_scores[id] ?? 70;
```

`ProfileInsights` 的"掌握度变化"和"高频错因"始终读取 `demoStudentProfile` 的静态数据作为"诊断前"基线。但 `requestSampleDiagnosis`（第 770 行）只取了 `responseBody.sample_diagnosis`，完全丢弃了 `responseBody.student_profile`（后端用 `applyMemoryDeltaToProfile` 计算的更新后画像）。

**影响：** 当前 P0 三道样例题的 `memory_delta` 各不同，但 `ProfileInsights` 的"诊断前"分数始终是初始 mock 值。如果用户连续诊断两道题，第二道题的"诊断前"分数不会包含第一道题的累积变化——与 PRD "越用越懂你"叙事矛盾。

**建议修复：**
1. `MathTraceWorkbench` 增加 `studentProfile` state，初始化为 `demoStudentProfile`。
2. `requestSampleDiagnosis` 成功后，同步更新 `studentProfile` 为 `responseBody.student_profile`。
3. `ProfileInsights` 接收 `studentProfile` prop 代替直接读取 `demoStudentProfile`。
4. 选中样例题时将 `studentProfile` 重置回 `demoStudentProfile`（演示用）。

---

### P0-2. API 响应和前端只消费 `sample_diagnosis`，结构化字段完全被忽略

**文件：** `src/components/mathtrace-workbench.tsx:770`

```tsx
return responseBody.sample_diagnosis;
```

`DiagnoseSuccessResponse` 包含 `recognized_question`、`knowledge_mapping`、`mistake_diagnosis`、`memory_delta`、`student_profile` 等结构化字段，但前端仅取 `sample_diagnosis`（即整份 mock 数据的完整副本）。所有结构化字段构建了但从未使用。

**影响：** 这本身不是 bug——作为 P0 兼容策略是合理的。但当前缺少一个明确的 "P1 迁移计划" 文档来说明何时切换到结构化字段。如果没有这个计划，`sample_diagnosis` 会变成永久依赖，结构化字段永远不会被使用。

**建议：** 在 `docs/superpowers/plans/` 或 PRD 中增加一行说明：P1 接入 Kimi 时，前端应从 `responseBody.sample_diagnosis` 迁移到 `responseBody.recognized_question` + `responseBody.mistake_diagnosis` 等结构化字段。当前不需要改代码。

---

## P1 — 建议在合并前或紧随其后修复

### P1-1. 诊断中切换样例题后，新请求的时序可能导致旧结果覆盖新结果

**文件：** `src/components/mathtrace-workbench.tsx:85-105`

`requestDiagnosis` 是 async 函数，没有取消机制。考虑以下场景：

1. 用户点击"开始诊断" → 发起请求 A（sample A）
2. 请求 A 返回之前，用户快速点击另一个样例题 → `handleSelectSample` 重置为 sample B
3. 但 `handleSelectSample` 不会取消请求 A
4. 请求 A 返回 → `setDiagnosisSample(sampleA)` → 覆盖了 sample B 的展示

**缓解因素：** 样例题选择按钮在 `isDiagnosing` 期间是 `disabled`（第 250 行），所以用户不能在诊断进行中切换样例。但 `isDiagnosing` 依赖 `isRequestPending || isTimelineRunning`。如果 API 返回快于 timeline 动画结束（360ms × 6 = 2160ms），则 `isRequestPending` 变为 false 但 `isTimelineRunning` 仍为 true → `isDiagnosing` 仍为 true → 按钮仍禁用。如果 API 返回慢于 2160ms，同样 `isRequestPending` 仍为 true → 按钮禁用。所以实际上竞态不会发生，但这个安全性依赖两个独立计时的隐式耦合。

**影响：** P0 演示安全，但隐式保护脆弱。

**建议修复：** 在 `requestDiagnosis` 开头增加一个递增的 `requestId`，在 `setDiagnosisSample` 前检查该 id 是否仍为最新。或更简单：使用 `AbortController`，在 `handleSelectSample` 中 abort 进行中的请求。

---

### P1-2. Timeline 动画与 API 响应时序不协调

**文件：** `src/components/mathtrace-workbench.tsx:59-71`

Timeline 固定以 360ms × 6 步 = 2160ms 播放，而 API 响应时间不可预测（本地通常 <100ms）。这导致：

- **API 快于动画：** 步骤 1-2 显示时 `diagnosisSample` 就已更新，但动画继续播放 3-6 步。展示的数据已经是最终结果但 timeline 还在"进行中"。
- **API 慢于动画：** 动画 6 步全部完成后显示"诊断完成"，但此时数据仍是本地 fallback。API 返回后数据突然切换。

**影响：** 演示时观众可能看到数据先于 timeline 完成更新，或 timeline 完成后数据突然变化。

**建议：** 理想方案是让 timeline 动画在 API 返回后再播放（即 API 返回后 `setCompletedStepCount(0)` 开始动画），但这会增加用户等待感。当前方案作为 P0 可接受，但演示前应确认常见场景下的视觉效果。

---

### P1-3. `isRecord` 和 `clampScore` 在两个文件中重复定义

**文件：**
- `src/components/mathtrace-workbench.tsx:841-843`
- `src/lib/diagnose-api.ts:372-374`（`isRecord`）
- `src/lib/diagnose-api.ts:380-382`（`clampScore`）
- `src/components/mathtrace-workbench.tsx:837-839`（`clampScore`）

`isRecord` 和 `clampScore` 在客户端组件和服务端 lib 中各有一份相同实现。AGENTS.md 第 3 条："只改必须改的地方。只清理自己造成的问题。"

**影响：** 本次改动引入了 `diagnose-api.ts`，其中的 `isRecord` 和 `clampScore` 与 workbench 中的已有函数重复。

**建议：** 将 `isRecord` 和 `clampScore` 提取到 `src/lib/utils.ts`，两端引用同一份。这是本次改动引入的问题，应在本次修复。

---

## P2 — 后续改进，不阻塞合并

### P2-1. `mistake_history` 发送到后端但完全未使用

**文件：** `src/components/mathtrace-workbench.tsx:757`，`src/lib/diagnose-api.ts:130-132`

前端发送 `mistake_history: mistakeHistory`，后端接受为 `unknown[]` 但从未在 `buildSampleDiagnoseResponse` 中使用。P0 中这是一次占位。

**影响：** 无功能影响，但增加请求体体积（7 条 mock 记录）。

**建议：** 可以保留作为 P1 占位。如果要优化，可在后端忽略该字段的解析。

---

### P2-2. `student_profile` 前端始终发送静态 mock 数据

**文件：** `src/components/mathtrace-workbench.tsx:755`

每次诊断请求都发送 `demoStudentProfile` 原始数据。后端 `applyMemoryDeltaToProfile` 会计算更新后的画像，但前端丢弃了该结果（见 P0-1），下次请求又发送原始数据。

**影响：** 后端的画像更新计算永远不会累积。P0 演示中每道题的"诊断前"分数始终相同。

**建议：** 与 P0-1 一起修复——维护前端 `studentProfile` state，每次请求发送当前画像。

---

### P2-3. API `fallback_used` 语义不一致

**文件：** `src/lib/diagnose-api.ts:248`

```tsx
fallback_used: code === "image_diagnosis_p1",
```

`fallback_used` 仅对 `image_diagnosis_p1` 错误码设为 true。其他错误（`invalid_json`、`invalid_request`、`unknown_sample_question_id`）设为 false。

PRD 约定：`fallback_used=true` 表示"使用了降级路径"。但 `image_diagnosis_p1` 不是降级，而是明确的 P1 拒绝。其他错误更不应该 `fallback_used=false`（因为根本没有 fallback 行为）。

**影响：** 语义不准确，但 P0 前端不依赖此字段做任何决策。

**建议：** 错误场景统一 `fallback_used: false`（没有真正执行 fallback）；只有当后端实际从 Kimi 失败降级到 sample 数据时才设为 true。

---

### P2-4. 无 fetch 超时

**文件：** `src/components/mathtrace-workbench.tsx:745`

`fetch("/api/diagnose", ...)` 没有 `AbortController` 超时。如果服务端挂起，UI 会无限期显示"诊断中"。

**影响：** P0 本地开发不会触发。但生产部署或 dev server 异常时可能出现。

**建议：** 增加 10 秒超时：
```tsx
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10_000);
const response = await fetch("/api/diagnose", { signal: controller.signal, ... });
clearTimeout(timeoutId);
```

---

### P2-5. 测试缺口

全项目无自动化测试。以下函数属于本次新增的纯逻辑，建议优先覆盖：

| 函数 | 文件 | 建议测试场景 |
|------|------|-------------|
| `parseDiagnoseRequest` | `diagnose-api.ts` | 合法请求、缺少字段、非法 task_type、image_diagnosis |
| `applyMemoryDeltaToProfile` | `diagnose-api.ts` | 正常合并、空 delta、超界分数（clamping） |
| `buildSampleDiagnoseResponse` | `diagnose-api.ts` | 合法 sample、非法 student_profile fallback |
| `isDiagnoseSuccessResponse` | `diagnose-api.ts` | 合法响应、缺失字段、fallback_used=true |

---

## 测试缺口清单

| 场景 | 涉及代码 | 风险 |
|------|----------|------|
| 诊断中快速连续点击"开始诊断"（按钮已禁用，但逻辑上无防护） | `handleStartDiagnosis` | Low |
| API 返回后 timeline 仍在动画中 | `useEffect` + `setDiagnosisSample` | Medium |
| `applyMemoryDeltaToProfile` 累积调用（同一 delta 应用两次） | `diagnose-api.ts:327` | Low（P0 前端总是发送原始 profile） |
| `student_profile` 字段为非法类型时的 fallback | `isStudentProfile` | Medium |
| 样例题选择按钮在 `isDiagnosing` 结束瞬间的状态转换 | `disabled={isDiagnosing}` | Low |
| `image_diagnosis` 任务类型被前端拦截还是后端拦截 | 前端 + 后端双重拦截 | Low（双重拦截是正确的防御） |

---

## 整体结论

**建议合并。** 未发现阻塞合并的硬伤。

代码质量整体良好：
- TypeScript 类型设计清晰，无 `any`，请求解析使用 `unknown` 逐步收窄。
- 后端严格校验请求，`image_diagnosis` 被明确拦截为 P1。
- 前端错误处理完备：API 失败时展示可恢复消息，保留本地样例数据。
- 样例题按钮在诊断期间禁用，防止了竞态。
- PRD 更新准确描述了 `sample_diagnosis` 兼容字段的意图。

**合并前建议修复：**
- **P0-1**（ProfileInsights 使用静态数据）：这是功能性问题，会导致画像展示数据不正确。
- **P1-3**（重复工具函数）：这是本次引入的重复，应清理。

**可作为后续任务：**
- P1-1（AbortController 取消机制）
- P1-2（timeline 动画时序优化）
- P2-1 ~ P2-5（`mistake_history` 使用、`fallback_used` 语义、fetch 超时、测试覆盖）
