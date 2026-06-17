# P1.9 学生画像展示语义重构 Design Spec

## 1. 背景

P1.8 已经把 MathTrace 的长期画像闭环推进到云端：

```text
memory_events -> student_profiles 当前快照 -> 页面启动恢复
```

但当前页面的“画像变化”区域仍把一次错题诊断直接展示为“掌握度变化”：

```text
参数分类讨论：35 -> 27 (-8)
导数与函数单调性：47 -> 42 (-5)
```

这在演示上容易造成两个误解：

- 学生只要新增错题，能力就会线性下降。
- `mastery_scores` 是完整真实掌握度，而不是当前错题证据投影出的风险信号。

代码层面已有 `clampScore`，所以分数不会低于 0 或高于 100；但产品语义仍然不够准确。当前系统只记录错题和画像变化事件，还没有练习完成、复习通过、同类题正确等正向证据。因此 P1.9 应先重构前端画像展示语义，把它从“能力扣分”改为“薄弱证据与复习优先级”。

## 2. 设计目标

P1.9 目标是让学生画像展示更符合当前数据事实：

- 把“掌握度变化”弱化为“本次暴露的薄弱点”或“学习风险变化”。
- 把 `memory_delta` 解释为一次诊断产生的证据增量，而不是完整能力评价。
- 保留 `student_profiles`、`memory_events` 和现有 `StudentProfile` schema。
- 继续让 `memory_events` 作为长期画像变化的可解释事件历史。
- 保持 `sample_diagnosis`、图片确认、错题本删除和云端画像恢复路径稳定。
- 给后续练习闭环预留空间：等有正向证据后，再重新定义真正的“掌握度”。

## 3. 明确不做

P1.9 不做以下内容：

- 不改 Supabase 表结构，不新增 migration。
- 不拆分 `student_profiles.profile` JSON 为关系列。
- 不新增 `practice_attempts`、`review_sessions` 或练习完成记录。
- 不改变 `memory_events` 写入门控。
- 不让模型、RAG 或 Agent 直接决定画像写入。
- 不改 `memory_delta` API 契约。
- 不删除 `mastery_scores` 字段。
- 不改变 `applyMemoryDeltaToProfile` 的数据库投影口径，除非后续 plan 明确只做显示层派生。

## 4. 当前数据语义

当前数据分为三层：

```text
memory_delta = 本次诊断产生的画像增量
memory_events = 已通过证据门控的画像变化事件
student_profiles = 从 memory_events 投影出的当前画像快照
```

`memory_delta.knowledge_mastery_changes` 现在常用负数表达“这次错题暴露了相关知识点风险”。它不是独立的测评结果，也不是完整掌握度估计。

`student_profiles.profile.mastery_scores` 目前是从 demo 初始画像起，按事件顺序应用 `memory_delta` 后得到的数值快照。它能稳定支持排序、复习优先级和演示恢复，但在只有错题负向证据时，不适合被直接呈现为“真实掌握度下降”。

因此 P1.9 的原则是：

```text
数据层继续保存结构化数值。
展示层改成证据、风险和优先级语言。
```

## 5. 推荐展示设计

### 5.1 原展示

当前画像区大致是：

```text
掌握度变化
- 参数分类讨论：35 -> 27 (-8)
- 导数与函数单调性：47 -> 42 (-5)

高频错因
- 方法误判：2 -> 2 次
- 范围意识：6 -> 7 次
- 计算波动：1 -> 1 次
- 漏分情况：5 -> 6 次
```

问题是它把诊断证据表现成了能力扣分。

### 5.2 新展示

推荐改成三块：

```text
本次暴露的薄弱点
- 参数分类讨论：高优先级，新增一条复发证据
- 导数与函数单调性：关联受影响，建议跟随复习

错因证据
- 范围意识：累计 6 -> 7 次
- 漏分情况：累计 5 -> 6 次

当前复习优先级
- 参数分类讨论：优先处理
- 导数与函数单调性：跟随复习
```

展示规则：

- 对有 `knowledge_mastery_changes` 的知识点，显示为“薄弱点”或“风险变化”。
- 不把负数直接作为主要视觉信息。
- 可以保留小号辅助信息，例如“风险分 35 -> 27”，但不要作为标题级表达。
- 对 `mistake_cause_changes` 为 0 的错因，默认不放在“本次错因证据”里，避免噪音。
- 如果需要展示累计错因，可以单独命名为“长期错因累计”，不要混进“本次变化”。

### 5.3 知识点状态分层

P1.9 可以基于现有 `mastery_scores` 派生状态文案，不新增数据字段：

```text
0-39   高优先级
40-59  待巩固
60-79  基本稳定
80-100 稳定
```

这个状态只服务展示。数据库仍保存原有 `mastery_scores` 数值，避免提前迁移。

### 5.4 数值展示原则

数值不是完全隐藏，而是降级为辅助解释：

```text
参数分类讨论
状态：高优先级
证据：本次新增分类讨论遗漏；累计同类风险较高
辅助：风险分 35 -> 27
```

这样仍能展示“系统有长期记忆”，但不把学生能力粗暴表达成扣分。

## 6. 数据模型决策

P1.9 推荐不改数据库。

理由：

- 当前问题主要发生在 UI 语义，而不是事实链缺失。
- `student_profiles` 已经是 read model，可以继续承载当前画像快照。
- `memory_events` 已经保存可解释增量，足够支持本次展示重构。
- 改表无法解决“只有负向错题证据”的根本问题。
- 新表应该等正向学习证据出现后再设计，否则会过早固化错误抽象。

未来如果要表达真正掌握度，需要新增正向证据来源，例如：

```text
practice_attempts：变式题作答记录
review_sessions：复习任务完成记录
learning_observations：人工或系统确认的学习观察
```

这些表不属于 P1.9。

## 7. 数据流

P1.9 不改变 P1.8 数据流：

```text
诊断成功
-> memory_delta
-> diagnosis_runs / mistake_book_items / memory_events
-> 重放 memory_events
-> student_profiles
-> GET /api/student-profile
-> 前端画像展示
```

P1.9 只改变最后一步：

```text
StudentProfile + DiagnosisViewModel
-> ProfileInsights view model
-> 薄弱点 / 错因证据 / 复习优先级展示
```

建议把展示派生逻辑集中在前端纯函数中，避免 JSX 中继续散落数值计算。

## 8. 文件影响范围

预计后续 implementation plan 涉及：

- `src/components/workbench/profile-insights.tsx`
  - 改展示结构和文案。
  - 避免把负向 `memory_delta` 作为主标题信息。
- `src/components/workbench/workbench-labels.ts`
  - 继续复用知识点和错因中文映射。
- `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - 增加画像展示文案和派生逻辑测试。
- `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - implementation 时同步补充 P1.9 边界。
- `interview/mathtrace-project-narrative.md`
  - implementation 完成后补充“为什么先改展示语义而不改数据库”的面试叙事。

P1.9 不应修改：

- `supabase/migrations/**`
- `src/lib/persistence/**`
- `src/lib/student-profile/student-profile-service.ts`
- `src/lib/shared/student-profile.ts`
- `src/lib/diagnosis/**` 的诊断和持久化规则

除非 implementation plan 中发现现有展示无法通过纯前端派生完成。

## 9. 验收标准

P1.9 完成后应满足：

- 页面不再以“掌握度变化”作为主展示标题。
- 负向 `memory_delta` 不再被主视觉表达成“能力扣分”。
- 本次变化只突出发生变化的薄弱点和错因证据。
- 累计错因和本次错因有清晰区分。
- 云端画像读取、错题新增、错题删除后的画像恢复仍正常。
- `sample_diagnosis` 稳定路径不依赖数据库是否可用。
- `npm test`、`npm run test:smoke`、`npm run lint`、`npm run build` 通过。

## 10. Claude Code 审查重点

后续 implementation review 应重点检查：

- 是否误改数据库表或持久化规则。
- 是否仍把 `mastery_scores` 当作完整真实能力分数展示。
- 是否混淆“本次证据”和“长期累计”。
- 是否让模型输出、RAG 或 provider 影响画像写入。
- 是否破坏 `ProfileInsights` 的空数据、重复题、未持久化诊断和 cloud fallback 状态。
- 是否补充 UI 测试覆盖新文案和边界。

## 11. 推荐下一步

先基于本 spec 写 P1.9 implementation plan。计划应采用小步实现：

```text
Task 1: 提取 ProfileInsights 展示派生 view model，并用测试锁定当前数据解释。
Task 2: 重构画像区 UI 文案和结构。
Task 3: 更新 PRD 与面试叙事文档。
Task 4: 运行回归验证并准备 Claude Code review。
```

实现阶段仍建议走 subagent-driven development，因为每个 task 可以独立测试和审查。
