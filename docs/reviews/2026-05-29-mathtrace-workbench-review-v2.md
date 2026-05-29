# MathTrace P0 Workbench 代码审查 v2

**审查日期：** 2026-05-29
**审查范围：** 当前分支 `codex/mathtrace-p0-workbench` 全部未跟踪/修改文件
**基线：** `main` 分支（`9bf853d`）
**前置审查：** `docs/reviews/2026-05-29-mathtrace-workbench-review.md`

---

## 验证结果

| 检查项 | 结果 |
|--------|------|
| `npm run lint` | 通过 |
| `npm run build` | 通过 |
| 测试 | 未运行：项目无测试文件 |

---

## High

### H1. `ProfileInsights` 高频错因计数未合并本次诊断增量

**文件：** `src/components/mathtrace-workbench.tsx:548-558`

```tsx
{Object.entries(demoStudentProfile.frequent_mistake_causes).map(
  ([id, count]) => (
    <div key={id} ...>
      <span>{getMistakeShortName(id)}</span>
      <span ...>{count} 次</span>
    </div>
  ),
)}
```

`frequent_mistake_causes` 直接展示 `demoStudentProfile` 的静态值，未加上 `sample.memory_delta.mistake_cause_changes`。例如 `classification_missing` 初始值为 4，本次诊断增量为 +1，应展示 5 次，但实际展示 4 次。

**风险：** 用户看到的画像数据与 "本次诊断已沉淀到长期记忆" 的产品叙事矛盾。PRD Demo Script 第 5 步要求展示"画像变化"，但错因频次未变化。

**建议：** 合并 `mistake_cause_changes` 后展示：
```tsx
const mergedCounts = Object.entries(demoStudentProfile.frequent_mistake_causes).map(
  ([id, count]) => ({
    id,
    count: count + (sample.memory_delta.mistake_cause_changes[id] ?? 0),
  })
);
```

---

### H2. `ReviewPath` 只展示 3 天复习计划，PRD 要求 7 天

**文件：** `src/components/mathtrace-workbench.tsx:582`

```tsx
const priorityPlan = sample.review_plan.seven_days.slice(0, 3);
```

PRD 第 7 节 "Review Planning" 输出包含 7 天计划；Demo Script 第 7 步明确要求 "展示轻量 7 天复习建议"。当前 `slice(0, 3)` 截断为 3 天。

**风险：** 与 PRD P0 要求不一致，演示时评委只看到 3 天而非 7 天。

**建议：** 移除 `slice(0, 3)`，完整展示 7 天。若空间不足，使用可折叠列表或横向滚动。

---

### H3. XSS 风险：`dangerouslySetInnerHTML` 未净化（遗留）

**文件：** `src/components/math-text.tsx:46-53`

`katex.renderToString` 输出直接通过 `dangerouslySetInnerHTML` 注入。虽然组件第 37 行已注释 "P0 只渲染本地受信 mock 文本；P1 接入用户/模型输入前应增加 HTML sanitize"，但 P0 到 P1 的迁移路径中这个注释容易被遗漏。

**风险：** P0 当前数据全部硬编码，实际风险低。P1 接入用户输入后必须修复。

**建议：** 当前保留注释即可，但应在组件文档或 AGENTS.md 中增加 "P1 接入 checklist" 明确标记此事项。

---

### H4. 零测试覆盖（遗留）

**文件：** 全项目无 `*.test.*` 或 `*.spec.*` 文件。

所有业务逻辑均为纯函数或简单状态机，但无任何自动化测试：
- `parseMathText` 的解析边界（空字符串、无公式、嵌套 `$`、转义 `\$`）
- `getStepState` 的状态机转换
- `clampScore` 的越界输入
- `getSampleById` 的 fallback 行为
- `getConciseDiagnosis` 的空 `step_analysis`

**风险：** 后续修改无法检测回归。AGENTS.md 要求 "目标驱动执行" 和 "验证通过"。

**建议：** 至少为以下纯函数补充单元测试：
- `parseMathText`
- `getStepState`
- `clampScore`
- `getSampleById`

---

### H5. PRD P0 核心接口 `POST /api/diagnose` 完全缺失（遗留）

**文件：** 无 `src/app/api/` 目录。

PRD 第 10 节明确："P0 只保留一个核心接口：`POST /api/diagnose`"。当前实现是前端直接从 `mathtrace-demo.ts` 读取 mock 数据渲染，完全绕过后端。这导致：
- 样例题路径未走 `/api/diagnose`，违反 PRD "样例题路径也走 `/api/diagnose`"
- 无 `memory_delta` 后端计算逻辑
- 无 `student_profile` 后端更新逻辑
- 无 HTTP 状态码和错误响应约定

**风险：** 演示闭环目前可用，但与 PRD 架构不一致，P1 接入 Kimi 时需要重写整个数据流。

**建议：** 如果本 task 确实是纯前端 mock 演示，应在 plan 文档中明确标注范围裁剪；否则需补 `/api/diagnose` 路由。

---

## Medium

### M1. `getConciseDiagnosis` 的 `slice(1)` 假设过于脆弱

**文件：** `src/components/mathtrace-workbench.tsx:740-748`

```tsx
function getConciseDiagnosis(sample: SampleDiagnosis): string {
  const deviationSteps = sample.step_analysis.slice(1);
  if (deviationSteps.length === 0) {
    return sample.expected_diagnosis;
  }
  return `偏离点：${deviationSteps.join("、")}。`;
}
```

硬编码假设 `step_analysis[0]` 永远是正确步骤（如 "求导正确"），只取后面的作为偏离点。如果未来样例题的 `step_analysis` 第一个元素不是正确步骤（例如 "概念理解不足"），这个逻辑会产生错误输出。

**建议：** 在 `SampleDiagnosis` 中显式标注哪些步骤是正确的，或在 `step_analysis` 中使用结构化对象 `{ step: string, is_correct: boolean }`。

---

### M2. `ProfileInsights` 遗漏 `memory_delta` 中不在 `review_priority` 的知识点

**文件：** `src/components/mathtrace-workbench.tsx:498-508`

```tsx
const profileRows = demoStudentProfile.review_priority.slice(0, 3).map((id) => {
  const currentScore = demoStudentProfile.mastery_scores[id] ?? 70;
  const change = sample.memory_delta.knowledge_mastery_changes[id] ?? 0;
  ...
});
```

`profileRows` 仅从 `review_priority` 中取前 3 个知识点展示。如果某次诊断的 `memory_delta.knowledge_mastery_changes` 包含了不在 `review_priority` 中的知识点，本次掌握度变化不会被展示。

**建议：** 展示 `memory_delta.knowledge_mastery_changes` 的所有 key，或至少检查是否有遗漏并给出提示。

---

### M3. 首页违反 RSC 默认原则（遗留）

**文件：** `src/app/page.tsx`

`page.tsx` 作为 Server Component 直接渲染 `MathTraceWorkbench`（Client Component），导致整页变为客户端渲染。AGENTS.md 7.2："默认使用 Server Components；只有需要浏览器 API 时才添加 `'use client'`"。

当前是 P0 演示的合理取舍（全部交互式），但应在 plan 中记录此取舍。

---

### M4. `katex/dist/katex.min.css` 全局导入（遗留）

**文件：** `src/app/layout.tsx:3`

KaTeX CSS 全局导入，对不使用公式的页面是不必要的负载。当前单页面应用无影响。

---

### M5. `MistakeHistoryItem` 和 `mistakeHistory` 已定义但未使用（遗留）

**文件：** `src/data/mathtrace-demo.ts:95-102`, `src/components/mathtrace-workbench.tsx`

`MistakeHistoryItem` 类型和 `mistakeHistory` 数组已定义并导出，但 `mathtrace-workbench.tsx` 中未引用。PRD Appendix C 包含完整的 `mistake_history` mock 数据，且 P0 要求"硬编码 5-8 条 mock 历史错题"。

当前仅在 `ProfileInsights` 的描述文案中引用了 `mistakeHistory.length`：
```tsx
description={`基于 ${mistakeHistory.length} 条 mock 历史错题...`}
```

但历史错题的具体内容（时间线、知识点、错因）没有可视化展示。

**建议：** 在画像区增加历史错题时间线或列表，或移除未使用的类型/数据以减少混淆。

---

### M6. 缺少"重置画像"功能（遗留）

**文件：** `src/components/mathtrace-workbench.tsx`

PRD 第 11 节："提供隐藏的'重置画像'按钮或快捷键，将 localStorage 恢复为 mock 初始数据。" 当前无任何重置机制，且 P0 尚未使用 localStorage（数据全在内存）。

**建议：** 至少增加一个 "重置画像" 按钮（可放在 header 的 demo 信息区），将状态恢复为初始值。

---

### M7. 工作台组件 750 行，拆分粒度可改进（遗留）

**文件：** `src/components/mathtrace-workbench.tsx`

单文件包含 8 个组件 + 5 个 helper 函数。虽然都是私有的且只在此文件使用，但 750 行仍然偏大，影响可读性和维护性。

**建议：** 后续可将 `AgentTimeline`、`PracticeLab`、`ProfileInsights`、`ReviewPath` 拆分为独立文件。

---

## Low

### L1. `Tag` 组件 `amber` tone 使用硬编码色值

**文件：** `src/components/mathtrace-workbench.tsx:687`

```tsx
amber: "bg-[#fff4df] text-[#8b634b]",
```

`amber` tone 使用硬编码 HEX 色值，与 CSS 变量体系不一致。`green` 和 `rust` 已使用 CSS 变量。

**建议：** 在 `globals.css` 中定义 `--amber-bg` 和 `--amber-text` 变量，统一使用。

---

### L2. `SectionHeader` 的 `inverted` 参数未被使用

**文件：** `src/components/mathtrace-workbench.tsx:641-676`

`inverted` 参数默认值为 `false`，所有调用处均未传递 `inverted={true}`。这是死代码或预留但未实现的功能。

**建议：** 若不需要，移除 `inverted` 参数和对应分支；若预留未来使用，添加注释说明。

---

### L3. `demoStudentContext.today_focus` 未使用

**文件：** `src/data/mathtrace-demo.ts:104-108`

```ts
export const demoStudentContext = {
  target_exam: "2027 高考数学",
  usage_count: 8,
  today_focus: "导数含参题与分类讨论",
} as const;
```

`today_focus` 字段已定义但没有任何组件引用。

---

### L4. `AgentTimeline` 的 `isDiagnosing` prop 冗余

**文件：** `src/components/mathtrace-workbench.tsx:353-361`

```tsx
function AgentTimeline({
  steps,
  completedStepCount,
  isDiagnosing,
}: { ... })
```

`isDiagnosing` 可通过 `completedStepCount < steps.length` 推导，不需要作为独立 prop 传递。

---

### L5. `knowledgePoints.module` 与 `SampleDiagnosis.module` 语言不一致

**文件：** `src/data/mathtrace-demo.ts:110-141`, `:270-458`

`knowledgePoints` 中的 `module` 是英文（`"derivative"`、`"function"`、`"sequence"`），而 `SampleDiagnosis.module` 是中文（`"导数"`、`"函数"`、`"数列"`）。两者没有映射关系，若未来需要按模块筛选或关联会有问题。

**建议：** 统一使用英文 `module` 并在展示时通过映射表转中文，或至少保持两者一致。

---

## Observations

1. **数据结构与 PRD 基本一致。** `SampleDiagnosis`、`StudentProfile`、`MemoryDelta`、`AgentStep` 等接口与 PRD Schema 吻合，三道样例题与 PRD Appendix B 匹配。

2. **设计系统完整。** CSS 变量体系（mocha/cream/oat/deep-green）、glass 效果、hover-lift 动画、`prefers-reduced-motion` 适配均已实现。

3. **TypeScript 使用规范。** 无 `any`，返回类型显式标注，具名函数 + named exports，`as const` 用于字面量对象。

4. **RSC 边界基本合理。** `'use client'` 仅在 `mathtrace-workbench.tsx` 使用，`math-text.tsx` 未标记（依赖调用方的 client 上下文）。

5. **先前审查问题已部分修复：**
   - `parseMathText` 正则已修复，支持跨行和转义（`(?<!\)`、`[\s\S]+?`）
   - `frequencyLabels` 类型已收紧为 `Record<KnowledgePoint["gaokao_frequency"], string>`
   - `PracticeLab` 序号已改为 `String(index + 1).padStart(2, "0")`
   - `Tag` green tone 已使用 CSS 变量 `--deep-green-muted`

---

## 测试缺口清单

| 场景 | 涉及函数 | 风险等级 |
|------|----------|----------|
| `parseMathText` 空字符串 | `parseMathText` | Low |
| `parseMathText` 无公式纯文本 | `parseMathText` | Low |
| `parseMathText` 含 `\$` 转义 | `parseMathText` | Medium |
| `parseMathText` `$$` 跨行公式 | `parseMathText` | Medium |
| `getStepState` 全部完成状态 | `getStepState` | Low |
| `getStepState` 初始状态（0 完成） | `getStepState` | Low |
| `clampScore` 负数输入 | `clampScore` | Low |
| `clampScore` >100 输入 | `clampScore` | Low |
| `getSampleById` 不存在的 ID | `getSampleById` | Low |
| `getConciseDiagnosis` `step_analysis` 长度为 1 | `getConciseDiagnosis` | Low |
| `getConciseDiagnosis` `step_analysis` 为空 | `getConciseDiagnosis` | Low |
| 切换样例题时动画状态重置 | `handleSelectSample` | Medium |
| 诊断中重复点击"开始诊断" | `handleStartDiagnosis` | Medium |
| `memory_delta` 包含不在 `review_priority` 的知识点 | `ProfileInsights` | Medium |
| `mistake_cause_changes` 包含新的错因 ID | `ProfileInsights` | Low |

---

## 总结

**未发现导致构建失败或崩溃的阻塞问题。** Lint 和 build 均通过，数据结构与 PRD 基本一致，TypeScript 类型使用规范。

本次审查新发现的主要问题：

1. **H1（高频错因计数未合并增量）** 是本次新发现的最严重问题，导致画像展示数据不准确。
2. **H2（7 天计划截断为 3 天）** 是与 PRD 的直接偏差。
3. **H5（无 `/api/diagnose`）** 是与 PRD 架构的最大偏差，需确认是否为有意的 P0 范围裁剪。
4. **M1（`getConciseDiagnosis` 脆弱假设）** 和 **M2（遗漏知识点变化）** 是数据展示层面的边界遗漏。

遗留未修复的问题（来自前次审查）：H3（XSS 注释已加但未实质修复）、H4（零测试）、M3-M7（RSC、CSS 全局导入、未使用数据、重置画像、组件拆分）。
