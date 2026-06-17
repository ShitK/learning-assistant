# P1.9 学生画像展示语义重构 Design Spec（最终版）

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

P1.9 的目标是在**不改数据库、不改 `memory_delta` 契约、不改画像投影规则**的前提下，把前端展示语义从“能力扣分”重构为“薄弱证据与复习优先级”。

## 2. 设计目标

- 把“掌握度变化”弱化为“本次暴露的薄弱点”和“学习风险变化”。
- 用“薄弱指数”替代“风险分 / 掌握度”，让数字越大代表优先级越高，符合用户直觉。
- 把 `memory_delta` 解释为一次诊断产生的证据增量，而不是完整能力评价。
- 保留 `student_profiles`、`memory_events` 和现有 `StudentProfile` schema。
- 错因标签从内部 taxonomy 名改为人话标题 + 一句话解释，并默认折叠近期无变化的低频错因。
- 用“推荐依据”说明为什么给出当前行动建议，但 P1.9 只基于当前画像、本次诊断和现有 demo 历史派生，不新增真实历史证据接口。
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
- 不改变 `applyMemoryDeltaToProfile` 的数据库投影口径。
- 不实现真正的知识点图谱或“关联受影响”等需要外部数据的算法文案。
- 不新增 `/api/student-profile/evidence`、`/api/memory-events` 或扩展 `/api/student-profile` 返回完整 `memory_events` 历史。

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

## 5. 推荐展示设计（方案 A：证据叙事型）

### 5.1 整体结构

画像展示区改为四块：

```text
本次诊断结论
全部知识点优先级 [可展开]
需要关注的错因
推荐依据
```

### 5.2 本次诊断结论

只展示本次有 `knowledge_mastery_changes` 的知识点，不展示未变化的知识点。

```text
本次诊断结论
- 参数分类讨论：本次新增薄弱信号，薄弱指数 73（+8）
- 导数与函数单调性：波动但稳定，薄弱指数 58（+5）

行动建议：优先复习参数分类讨论；导数与函数单调性保持常规练习即可。
```

展示规则：

- 使用“薄弱指数”而不是“风险分”或“掌握度”。
- 薄弱指数 = 100 − `mastery_score`，数字越大代表越需要优先处理。
- 薄弱指数变化用 `（+N）` 表示上升，`（−N）` 表示下降。
- 状态标签基于薄弱指数派生：高优先级 / 待巩固 / 基本稳定 / 稳定。
- 行动建议基于本次变化最大的知识点生成，不要依赖模型生成。

### 5.3 全部知识点优先级

默认折叠，点击后展开完整排序列表。排序按薄弱指数降序。

```text
全部知识点优先级 [展开 ▼]
1. 参数分类讨论        薄弱指数 73 · 高优先级
2. 导数与函数单调性    薄弱指数 58 · 待巩固
3. 函数定义域          薄弱指数 46 · 待巩固
4. 等比数列            薄弱指数 32 · 基本稳定
```

### 5.4 需要关注的错因

采用 D1（解释型卡片）+ D3（只展示值得关注错因）组合：

```text
需要关注的错因

范围/边界遗漏          [高频] [本次新增]
累计 7 次 (+1)
“定义域、取值范围、分类讨论边界等条件考虑不全，
 导致答案缺情况或范围错误。”

步骤不完整/漏分        [高频] [本次新增]
累计 6 次 (+1)
“解题过程跳步、关键推导缺失，或最终答案没有给出
 完整形式导致扣分。”

其他错因（近期无变化） [展开 ▼]
- 解题方向选错：2 次（无变化）
- 计算失误：1 次（无变化）
```

展示规则：

- 默认展开的错因必须满足以下至少一条：
  - 本次 `mistake_cause_changes > 0`
  - 累计次数 ≥ 5（高频阈值可在实现时调整，建议配置化）
- 不满足上述条件的错因折叠在“其他错因”里。
- 每个错因展示：人话标题、累计次数、本次变化、一句话解释。
- 一句话解释从 `workbench-labels.ts` 或等错因映射表中读取。
- 如果本次没有任何错因变化，“需要关注的错因”区域显示空状态文案。

### 5.5 推荐依据

用当前可用数据解释行动建议的原因。P1.9 的前端目前只能读取当前 `student_profiles.profile`、本次 `diagnosis.memory_delta` 和已有 demo `mistakeHistory`；虽然数据库中有 `memory_events`，但本阶段不新增读取完整历史事件的前端 API。

```text
推荐依据
为什么优先复习参数分类讨论？
· 当前薄弱指数最高，优先级高于其他知识点
· 本次诊断再次新增薄弱信号
· 相关错因本次新增，且累计次数已达到高频阈值
```

生成规则：

- 推荐依据只针对行动建议中排名第一的知识点。
- P1.9 的推荐依据来自前端已有的 `StudentProfile`、`DiagnosisViewModel.memory_delta` 和 demo `mistakeHistory`，不是模型生成，也不直接读取 `memory_events`。
- 如果当前画像或本次诊断无法支持具体依据，降级显示为“本次暴露该薄弱点，建议优先巩固”。
- 后续如果需要展示“近 N 次诊断”“历史趋势”“具体事件证据”，应单独设计 profile evidence API，从服务端读取 `memory_events` 摘要。

## 6. 薄弱指数与状态分层

### 6.1 薄弱指数

```text
薄弱指数 = 100 − mastery_score
```

| mastery_score | 薄弱指数 | 状态 |
|--------------|---------|------|
| 0 - 39       | 61 - 100 | 高优先级 |
| 40 - 59      | 41 - 60  | 待巩固 |
| 60 - 79      | 21 - 40  | 基本稳定 |
| 80 - 100     | 0 - 20   | 稳定 |

说明：

- 薄弱指数只用于展示层派生，不写入数据库。
- 状态分层阈值仅服务展示，数据库仍保存原有 `mastery_scores` 数值。
- 状态分层和薄弱指数计算应放在前端纯函数中，不要混入 JSX 计算。

### 6.2 变化量换算

薄弱指数变化量 = 新薄弱指数 − 旧薄弱指数

例如：

- mastery 35 → 27，风险分下降 8，薄弱指数从 65 上升到 73，显示为 `薄弱指数 73（+8）`。
- mastery 47 → 42，风险分下降 5，薄弱指数从 53 上升到 58，显示为 `薄弱指数 58（+5）`。

## 7. 错因文案映射

内部错因 key 仍使用项目已有的 snake_case id，展示层通过映射表转为人话标题和解释。

示例映射（以当前知识库为准）：

| 内部 key | 人话标题 | 一句话解释 |
|---------|---------|-----------|
| `domain_missing` | 范围/边界遗漏 | 定义域、取值范围或分类讨论边界考虑不全，导致答案缺情况或范围错误。 |
| `classification_missing` | 分类讨论漏项 | 含参、分段或多情况题没有完整分类，导致结论缺少必要情况。 |
| `method_error` | 解题方向选错 | 审题后选择了错误的解题方法或公式，导致整题方向偏离。 |
| `transformation_error` | 变形过程失真 | 等价变形、代数整理或结构转换时丢失条件或改变原式含义。 |
| `calculation_error` | 计算失误 | 运算过程中出现符号、数值或代数计算错误。 |

映射表位置：`src/components/workbench/workbench-labels.ts`。内部 key 必须继续来自 `src/data/mathtrace-demo.ts` 的 `mistakeCauses`，不得为了展示文案新增另一套错因 taxonomy。

## 8. 数据模型决策

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

## 9. 数据流

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
-> ProfileInsights view model（薄弱指数、状态分层、错因映射、推荐依据）
-> 本次诊断结论 / 全部知识点优先级 / 需要关注的错因 / 推荐依据
```

建议把展示派生逻辑集中在前端纯函数中，避免 JSX 中继续散落数值计算。

## 10. 文件影响范围

预计 implementation plan 涉及：

- `src/components/workbench/profile-insights.tsx`
  - 改展示结构和文案。
  - 新增薄弱指数、状态分层、错因卡片、推荐依据展示。
  - 避免把负向 `memory_delta` 作为主标题信息。
- `src/components/workbench/workbench-labels.ts`
  - 新增错因人话标题和解释映射。
  - 继续复用知识点中文映射。
- `src/components/workbench/profile-view-model.ts`（新增）
  - 集中存放展示层派生逻辑：薄弱指数计算、状态分层、错因过滤排序、推荐依据生成。
- `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - 增加画像展示文案、薄弱指数、错因卡片、推荐依据的测试。
- `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - 同步补充 P1.9 展示语义边界。
- `interview/mathtrace-project-narrative.md`
  - implementation 完成后补充“为什么先改展示语义而不改数据库”的面试叙事。

P1.9 不应修改：

- `supabase/migrations/**`
- `src/lib/persistence/**`
- `src/lib/student-profile/student-profile-service.ts`
- `src/lib/shared/student-profile.ts`
- `src/lib/diagnosis/**` 的诊断和持久化规则

除非 implementation plan 中发现现有展示无法通过纯前端派生完成。

## 11. 验收标准

P1.9 完成后应满足：

- 页面不再以“掌握度变化”作为主展示标题。
- 负向 `memory_delta` 不再被主视觉表达成“能力扣分”。
- 使用“薄弱指数”替代“风险分”，数字越大代表优先级越高。
- 本次变化只突出发生变化的薄弱点和错因证据。
- 累计错因和本次错因有清晰区分；无变化低频错因默认折叠。
- 每个展示错因都有人话标题和一句话解释。
- “推荐依据”用当前画像、本次诊断增量和已有 demo 历史解释排名第一的行动建议，不声称已读取完整 `memory_events` 历史。
- 云端画像读取、错题新增、错题删除后的画像恢复仍正常。
- `sample_diagnosis` 稳定路径不依赖数据库是否可用。
- `npm test`、`npm run test:smoke`、`npm run lint`、`npm run build` 通过。

## 12. Claude Code 审查重点

后续 implementation review 应重点检查：

- 是否误改数据库表或持久化规则。
- 是否仍把 `mastery_scores` 当作完整真实能力分数展示。
- 是否混淆“本次证据”和“长期累计”。
- 是否让模型输出、RAG 或 provider 影响画像写入。
- 是否破坏 `ProfileInsights` 的空数据、重复题、未持久化诊断和 cloud fallback 状态。
- 是否补充 UI 测试覆盖新文案、薄弱指数、错因卡片和推荐依据。
- 错因文案映射是否和知识库内部 key 口径一致。
- 薄弱指数和状态分层计算是否集中在前端纯函数中，没有散落 JSX。

## 13. 推荐下一步

先基于本 spec 写 P1.9 implementation plan。计划应采用小步实现：

```text
Task 1: 提取 ProfileInsights 展示派生 view model（薄弱指数、状态分层、错因映射）。
Task 2: 重构画像区 UI 文案和结构（本次诊断结论 / 全部知识点优先级 / 需要关注的错因 / 推荐依据）。
Task 3: 更新 PRD、错因映射表与面试叙事文档。
Task 4: 运行回归验证并准备 Claude Code review。
```

实现阶段仍建议走 subagent-driven development，因为每个 task 可以独立测试和审查。

## 14. 参考草图

UI 参考草图位于 `docs/superpowers/wireframes/p19-design-options.html`（仅保留方案 A）。
