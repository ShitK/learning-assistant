# MathTrace P0 Workbench 代码审查

**审查日期：** 2026-05-29
**审查范围：** 工作区未提交变更（`package.json`、`globals.css`、`layout.tsx`、`page.tsx`、`src/components/`、`src/data/`）
**基线：** `main` 分支（`9bf853d chore: initialize nextjs skeleton`）

---

## 验证结果

| 检查项 | 结果 |
|--------|------|
| `npm run lint` | 通过 |
| `npm run build` | 通过 |
| 测试 | 未运行：项目无测试文件 |

---

## High

### H1. XSS 风险：`dangerouslySetInnerHTML` 未做净化

**文件：** `src/components/math-text.tsx:51-52`

`katex.renderToString` 的输出直接通过 `dangerouslySetInnerHTML` 注入 DOM。虽然 `throwOnError: false` 和 `strict: "ignore"` 会降低 KaTeX 抛异常的概率，但如果 `text` 来源从 mock 数据扩展到用户输入（P1 图片上传路径），未净化的 HTML 可能导致 XSS。

**风险：** P0 当前数据全部硬编码，实际风险低。但 P1 接入用户输入后会成为真实漏洞。

**建议：** 引入 `DOMPurify` 对 KaTeX 输出做 sanitize，或在组件文档中明确标注"仅限受信数据源"。

---

### H2. `parseMathText` 正则对嵌套 `$` 和转义失效

**文件：** `src/components/math-text.tsx:58`

```ts
const mathPattern = /(\$\$?)(.+?)\1/g;
```

- `.+?` 不匹配换行符，`$$...$$` 跨行公式会解析失败。
- 文本中出现 `$5` 等非公式美元符号时会被误判为公式起始。
- 转义 `\$` 未处理。

**风险：** 如果样例题公式出现换行（如多行标准解法），渲染会异常。

**建议：** 改用支持 `s` flag 的正则 `/(\$\$?)([\s\S]+?)\1/g`，并在组件文档中注明 P0 仅支持单行公式。

---

### H3. 零测试覆盖

**文件：** 全项目无 `*.test.*` 或 `*.spec.*` 文件。

PRD P0 要求"样例题诊断闭环"可验证，AGENTS.md 要求"目标驱动执行"和"验证通过"。当前没有任何自动化测试覆盖：

- `parseMathText` 的解析逻辑
- `getStepState` 的状态机
- `clampScore` 的边界
- `getSampleById` 的 fallback
- `getConciseDiagnosis` 的拼接逻辑

**风险：** 后续修改无法检测回归。

**建议：** 至少为纯函数（`parseMathText`、`getStepState`、`clampScore`）补充单元测试。

---

### H4. PRD P0 要求 `POST /api/diagnose`，当前完全缺失

**文件：** 无 `src/app/api/` 目录。

PRD 第 10 节明确：

> P0 只保留一个核心接口：`POST /api/diagnose`

当前实现完全绕过后端，前端直接从 `mathtrace-demo.ts` 读取 mock 数据渲染。这导致：

- 样例题路径未走 `/api/diagnose`，违反 PRD "样例题路径也走 `/api/diagnose`"
- 无 `memory_delta` 后端计算逻辑
- 无 `student_profile` 后端更新逻辑
- 未来接入 Kimi 时需要重写整个数据流

**风险：** 演示闭环目前可用，但与 PRD 架构不一致，P1 扩展成本高。

**建议：** 如果 P0 只做前端演示工作台，应在 PRD 或 plan 文档中明确标注"本 task 不含 `/api/diagnose`，属于纯前端 mock 演示"，避免后续混淆。

---

## Medium

### M1. `frequencyLabels` 类型过于宽泛

**文件：** `src/components/mathtrace-workbench.tsx:35`

```ts
const frequencyLabels: Record<string, string> = {
```

`KnowledgePoint.gaokao_frequency` 已定义为 `"low" | "medium" | "high"`，但 `frequencyLabels` 用 `Record<string, string>` 允许任意 key，丢失了类型安全。

**建议：** 改为 `Record<KnowledgePoint["gaokao_frequency"], string>`。

---

### M2. 首页违反 RSC 默认原则

**文件：** `src/app/page.tsx`

`page.tsx` 只做了一件事：`return <MathTraceWorkbench />`。按 AGENTS.md 7.2：

> 默认使用 Server Components；只有需要浏览器 API 时才添加 `'use client'`。

`page.tsx` 本身不需要 `'use client'`，但因为 `MathTraceWorkbench` 是 Client Component，整个页面变成了客户端渲染。当前这是 P0 演示的合理取舍（全部交互式），但应在 plan 中标注。

---

### M3. `katex/dist/katex.min.css` 在 layout.tsx 中全局导入

**文件：** `src/app/layout.tsx:3`

```ts
import "katex/dist/katex.min.css";
```

KaTeX CSS 约 30KB+，对不使用公式的页面是不必要的负载。当前单页面应用无影响，但拆分页面后应按需加载。

---

### M4. `MistakeHistoryItem` 类型已定义但未使用

**文件：** `src/data/mathtrace-demo.ts:95-102`

`MistakeHistoryItem` 和 `mistakeHistory` 已定义并导出，但 `mathtrace-workbench.tsx` 中未引用。PRD Appendix C 包含完整 `mistake_history` mock 数据，说明这是 P0 应展示的内容。

**风险：** 可能遗漏了 PRD 要求的"硬编码 5-8 条 mock 历史错题"展示。

---

### M5. 缺少"重置画像"功能

**文件：** `src/components/mathtrace-workbench.tsx`

PRD 第 11 节：

> 提供隐藏的"重置画像"按钮或快捷键，将 localStorage 恢复为 mock 初始数据。

当前无任何重置机制。虽然 P0 尚未使用 localStorage（数据全在内存），但 plan 中提到的状态机 idle/diagnosing/result 中没有 reset 路径。

---

### M6. 工作台组件 750 行，拆分粒度可改进

**文件：** `src/components/mathtrace-workbench.tsx`

单文件包含 8 个组件 + 5 个 helper 函数。虽然都是私有的且只在此文件使用，但：

- `MathTraceWorkbench`、`HeaderBar`、`MistakeInputCard`、`DiagnosisResultCard`、`AgentTimeline`、`PracticeLab`、`ProfileInsights`、`ReviewPath` 各自独立，拆分为单独文件可提升可读性。
- AGENTS.md 7.3："文件结构规范：导出的主组件尽量靠近文件开头；私有 helper 和子组件放在后面"——当前结构符合此要求，但 750 行的单文件仍偏大。

**建议：** 非阻塞，可作为后续重构方向。

---

## Low

### L1. PracticeLab 序号硬编码 `"0{index + 1}"`

**文件：** `src/components/mathtrace-workbench.tsx:459`

```tsx
<p className="...">0{index + 1}</p>
```

当 `index >= 9` 时会显示为 `010`。P0 固定 3 道题不会触发，但属于硬编码缺陷。

---

### L2. 移除了暗色模式支持

**文件：** `src/app/globals.css`

原版有 `@media (prefers-color-scheme: dark)` 块，新版删除并固定为浅色暖调。这是设计决策，但 PRD 未提及暗色模式要求，属于合理简化。

---

### L3. `Tag` 组件 `green` tone 使用硬编码透明度

**文件：** `src/components/mathtrace-workbench.tsx:687`

```ts
green: "bg-[#2e5c55]/8 text-[var(--deep-green)]",
```

`/8` 是 Tailwind 的 8% 透明度，与 CSS 变量体系不一致。建议定义 `--deep-green-muted` 变量统一管理。

---

## Observations

1. **数据结构与 PRD 一致。** `SampleDiagnosis`、`StudentProfile`、`MemoryDelta`、`AgentStep` 等接口与 PRD Schema 吻合，`sampleDiagnoses` 三道样例题与 PRD Appendix B/C 匹配。

2. **设计系统完整。** CSS 变量（mocha/cream/oat/deep-green）、glass 效果、hover-lift 动画、`prefers-reduced-motion` 适配均已实现。

3. **TypeScript 使用规范。** 无 `any`，返回类型显式标注，具名函数 + named exports，`as const` 用于字面量对象。

4. **RSC 边界基本合理。** `'use client'` 仅在 `mathtrace-workbench.tsx` 使用，`math-text.tsx` 未标记（依赖调用方的 client 上下文）。

5. **Plan 文档质量良好。** `docs/superpowers/plans/2026-05-29-mathtrace-simplified-workbench.md` 包含 4 个 task、明确的验证步骤和文件清单。

---

## 测试缺口清单

即使非阻塞，以下场景缺少自动化测试覆盖：

| 场景 | 涉及函数 | 风险等级 |
|------|----------|----------|
| `parseMathText` 跨行 `$$...$$` | `parseMathText` | High |
| `parseMathText` 含 `$` 的非公式文本 | `parseMathText` | Medium |
| `getStepState` 边界：`completedStepCount === steps.length` | `getStepState` | Low |
| `clampScore` 负数和 >100 | `clampScore` | Low |
| `getSampleById` 不存在的 ID fallback | `getSampleById` | Low |
| `getConciseDiagnosis` 空 `step_analysis` | `getConciseDiagnosis` | Low |
| `getKnowledgeName` 不存在的知识点 ID | `getKnowledgeName` | Low |
| 切换样例题时 `completedStepCount` 重置 | `handleSelectSample` | Medium |
| `isDiagnosing` 状态下重复点击"开始诊断" | `handleStartDiagnosis` | Medium |
| `memory_delta.knowledge_mastery_changes` 为空对象 | `ProfileInsights` | Low |

---

## 总结

**未发现必须修复的阻塞问题。** Lint 和 build 均通过，数据结构与 PRD 一致，TypeScript 类型使用规范。

主要风险集中在：
1. **H4（无 `/api/diagnose`）** 是与 PRD 的最大偏差，需确认是否为有意的 P0 范围裁剪。
2. **H3（零测试）** 是维护风险，建议至少覆盖纯函数。
3. **H1/H2（MathText）** 在 P0 mock 数据下安全，但 P1 接入用户输入前必须修复。
