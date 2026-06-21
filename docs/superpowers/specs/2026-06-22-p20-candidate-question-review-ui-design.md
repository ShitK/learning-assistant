# P2.0 候选题本地审核 UI Design Spec

## 1. 背景

P2.0 已完成从 MinerU JSON 到 `candidate_questions.json` 的离线映射：

```text
artifacts/rag/MinerU-test/导数专题.json
-> artifacts/rag/mineru-candidate-mapper/candidate_questions.json
```

当前候选层已经能从 8 页导数专题中抽出候选题，但它仍是机器抽取结果。进入 `practice_corpus` 前，需要人工快速检查题号、公式、选项、跨页题和章节上下文。直接手看 JSON 可行，但效率低，也不利于稳定地产出“已审核题目种子”。

本 spec 设计一个本地静态审核页，把候选题以更接近真实题目的方式展示出来，让用户标记 `approved` / `needs_fix` / `skipped`，并导出 `reviewed_practice_seed.json` 作为后续 `practice_corpus` fixture 的输入。

## 2. 目标

构建一个离线、本地、只读候选题审核工具：

```text
candidate_questions.json
-> scripts/rag/build-candidate-review-ui.mjs
-> artifacts/rag/candidate-review/index.html
-> 浏览器人工审核
-> reviewed_practice_seed.json
```

具体目标：

- 从本地 `candidate_questions.json` 生成静态 `index.html`。
- 在浏览器中展示候选题列表、题目详情、章节、warnings、source_ref。
- 尽量用 KaTeX 渲染 `$...$` 公式；渲染失败时保留原始公式文本并提示。
- 支持标记每道题：`approved`、`needs_fix`、`skipped`。
- 支持为每道题写审核备注。
- 支持导出 `reviewed_practice_seed.json`，只包含 `approved` 题目和必要审核信息。
- 支持从浏览器 `localStorage` 恢复审核进度。

## 3. 明确不做

本阶段不做以下内容：

- 不接入 MathTrace 正式前端，不新增 Next.js route。
- 不接数据库、Supabase、登录、老师端、RLS 或服务端保存审核状态。
- 不接 pgvector、embedding、metadata/text search 或 RAG retrieval。
- 不生成最终 `practice_corpus`；只生成人工审核后的 seed。
- 不让审核结果影响 `memory_events`、`student_profiles`、错题本或 evidence API。
- 不提交 `candidate_questions.json`、`reviewed_practice_seed.json`、生成的 HTML 或任何教辅题文 artifact。
- 不修改 `sample_diagnosis` 稳定演示路径。
- 不做 PDF 原图裁剪对照；第一版只展示候选题文本和 source_ref。

## 4. 设计原则

### 4.1 本地审核工具，不是产品功能

审核页放在 ignored `artifacts/` 目录下，通过 `open artifacts/rag/candidate-review/index.html` 或浏览器打开。它只是帮助把候选题提升为可信 seed，不进入学生可见产品。

### 4.2 候选题仍是不可信输入

页面展示 `extraction_confidence`、`warnings`、`source_ref`，默认不把任何题标为通过。只有用户手动点 `approved` 的候选题才会进入导出 seed。

### 4.3 浏览器不直接写本地文件

静态 HTML 无法可靠写回项目目录。第一版使用：

- `localStorage` 保存临时审核状态。
- `下载 JSON` 按钮导出 `reviewed_practice_seed.json`。
- `复制 JSON` 按钮便于手动保存或后续脚本消费。

### 4.4 不扩大数据面

生成页面会嵌入候选题全文，因此输出必须位于 `artifacts/` 并保持 ignored。测试 fixture 只能使用假题文，不使用真实教辅内容。

## 5. 输入与输出

### 5.1 输入

默认输入：

```text
artifacts/rag/mineru-candidate-mapper/candidate_questions.json
```

输入 schema 沿用 MinerU mapper 输出：

```ts
interface CandidateQuestionExtraction {
  source_file: string;
  source_file_sha256: string;
  mineru_json_file: string;
  mineru_json_sha256: string;
  extractor: "mineru-json-candidate-mapper";
  extracted_at: string;
  page_count: number;
  candidates: CandidateQuestion[];
  warnings: string[];
}
```

### 5.2 生成输出

```text
artifacts/rag/candidate-review/
  index.html
  review_manifest.json
```

`index.html` 包含静态 UI、CSS、浏览器端 JS 和候选题数据。`review_manifest.json` 只保存输入摘要、候选题数量和生成时间，不保存额外审核状态。

### 5.3 用户导出输出

用户在页面中点击导出后得到：

```text
reviewed_practice_seed.json
```

建议结构：

```ts
interface ReviewedPracticeSeedExport {
  exported_at: string;
  source_candidate_file: string;
  source_file: string;
  mineru_json_file: string;
  approved_count: number;
  items: ReviewedPracticeSeedItem[];
}

interface ReviewedPracticeSeedItem {
  id: string;
  candidate_id: string;
  review_status: "reviewed";
  reviewer_note: string;
  question_text: string;
  solution_outline: null;
  mistake_causes: [];
  knowledge_points: string[];
  difficulty: null;
  variant_level: null;
  source_ref: CandidateQuestion["source_ref"];
  original_extraction_confidence: CandidateQuestion["extraction_confidence"];
  original_warnings: string[];
}
```

导出 schema 说明：

- 浏览器审核状态仍使用 `approved` / `needs_fix` / `skipped`，但导出的 seed 只包含 `approved` 题，并将 `review_status` 写为 `"reviewed"`，对齐后续 `practice_corpus` 语义。
- `id` 第一版复用 `candidate_id`，方便下游 fixture 保持稳定引用。
- `mistake_causes: []`、`difficulty: null`、`variant_level: null` 是显式占位符，下一阶段人工补齐。
- `knowledge_points` 第一版可默认从 `source_ref.section_title` 派生一个粗标签，如 `["导数"]` 或 `["导数", "考点 1 导数的概念、几何意义与运算"]`。这些值只是审核 seed 的临时展示标签，不是 PRD 内部 snake_case 知识点 ID。进入正式 `practice_corpus` 前必须人工映射成内部 key。
- `source_candidate_file`、`source_file`、`mineru_json_file` 优先使用相对项目路径；如果只能得到绝对路径，应在页面和文档中提示该 seed 不应提交或公开分享。

## 6. 页面设计

### 6.1 布局

第一版使用桌面优先的双栏布局：

```text
┌─────────────────────────────────────────────┐
│ 顶部工具栏：统计 / 筛选 / 搜索 / 导出        │
├───────────────┬─────────────────────────────┤
│ 候选题列表     │ 题目详情                    │
│ 题号/章节/warn │ normalized_text             │
│ 状态标记       │ warnings / source_ref        │
│               │ approved / needs_fix / skip   │
└───────────────┴─────────────────────────────┘
```

移动端不作为第一优先级，但页面不应完全不可用；窄屏可变成上下布局。

### 6.2 列表信息

每个候选题列表项展示：

- `question_number`
- `section_title`
- `extraction_confidence`
- warnings 数量
- 当前审核状态

列表支持：

- 搜索：题号、章节、题干关键词。
- 筛选：全部 / 未审核 / approved / needs_fix / skipped / 有 warnings。

### 6.3 详情信息

详情面板展示：

- 题目正文：`normalized_text`，尽量渲染公式。
- warnings：逐条列出。
- source_ref：页码、block 范围、bbox、section_title。
- 审核按钮：`approved`、`needs_fix`、`skipped`。
- 审核备注 textarea。

## 7. 数据流

```text
scripts/rag/build-candidate-review-ui.mjs
  -> read candidate_questions.json
  -> validate minimal extraction shape
  -> render math text to HTML with KaTeX where possible
  -> write artifacts/rag/candidate-review/index.html
  -> write artifacts/rag/candidate-review/review_manifest.json

browser index.html
  -> load embedded candidates
  -> localStorage["mathtrace.candidateReview.<hash>"]
  -> user marks statuses and notes
  -> export reviewed_practice_seed.json
```

生成页应内联 `katex/dist/katex.min.css`，保证以 `file://` 或本地 HTTP server 打开时都能渲染公式。`复制 JSON` 按钮优先使用 `navigator.clipboard.writeText`；如果页面在 `file://` 下不具备 clipboard 权限，则 fallback 到页面内可全选 textarea 或 `document.execCommand("copy")`。

`storage_key` 基于输入文件 hash 生成。重新生成 `candidate_questions.json` 后 hash 变化，旧审核进度不会自动迁移；用户应先导出 seed 再重新生成。

## 8. 错误处理

- 输入文件不存在：CLI exit 2，输出清晰错误。
- 输入 JSON 非法：CLI exit 1，提示 `failed to parse candidate questions JSON`。
- 输入 schema 不符合最小契约：CLI exit 1，列出缺失字段。
- candidates 为空：允许生成页面，但页面展示空状态，并在 manifest 记录 warning。
- KaTeX 渲染失败：页面保留原始 `$...$` 文本，并给该候选题附加 `math_render_warning`。
- KaTeX CSS 读取失败：CLI exit 1，提示 `failed to read KaTeX CSS`，避免生成“看似渲染但实际无样式”的页面。
- 剪贴板不可用：页面展示 fallback 文本框，不让复制按钮静默失败。
- 嵌入页面的候选题 JSON 必须转义 `</script>`、`<`、`>`、`&`、U+2028、U+2029，避免脚本注入。

## 9. 验收标准

完成后应满足：

- 能从真实 `candidate_questions.json` 生成本地静态审核页。
- 打开页面后可以逐题查看 72 个候选题。
- 审核状态可在刷新后通过 `localStorage` 恢复。
- 可以导出只包含 `approved` 题目的 `reviewed_practice_seed.json`。
- 输出 artifact 不进入 Git。
- 不修改正式前端、API、数据库、画像、错题本、RAG retrieval 或 `sample_diagnosis`。
- `npm test` 和 `npm run build` 仍通过。

## 10. 后续路线

本工具完成后，下一步才是：

```text
reviewed_practice_seed.json
-> 人工补齐 10-15 道题的 knowledge_points / difficulty / variant_level
-> practice_corpus fixture
-> metadata/text search
-> 变式题推荐模块接入
```

如果后续候选题规模变大，再考虑把审核工具升级为本地服务或受控 admin 页面。当前阶段不需要。

## 11. 实现说明

第一版实现为本地静态审核页生成器：

```bash
node scripts/rag/build-candidate-review-ui.mjs \
  --input artifacts/rag/mineru-candidate-mapper/candidate_questions.json \
  --out artifacts/rag/candidate-review
```

真实本地候选题文件可生成 72 道候选题的审核页。生成结果位于 ignored `artifacts/rag/candidate-review/`，不进入 Git。页面审核状态保存在浏览器 `localStorage`，最终通过页面按钮下载或复制 `reviewed_practice_seed.json`。

该 seed 仍不是正式 `practice_corpus`。下一阶段需要人工补齐 `knowledge_points`、`difficulty`、`variant_level` 和必要解析信息后，再进入 metadata/text search。
