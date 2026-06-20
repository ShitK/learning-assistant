# P2.0 导数扫描 PDF OCR 入库 Spike Design Spec

## 1. 背景

MathTrace 下一阶段希望把教辅资料作为变式练习的真实题源。当前已有一份本地导数专题扫描 PDF：

```text
/Users/kk/Documents/导数专题.pdf
```

本次体检结果：

- 文件大小约 8.7MB。
- 共 8 个 PDF 页面。
- `Creator` 为 `ScandAll PRO V2.1.5`，基本确认是扫描版。
- 普通文本抽取前 3 页只有控制字符，没有可用文字层。
- 页面渲染清晰，一张 PDF 页面包含左右两页书页；第一页可见题号 1-15，第二页可见题号 16-25。

因此 P2.0 的第一步不应从“前端 RAG”或 pgvector 开始，而应先验证扫描 PDF 能否稳定转成 MathTrace 可审核、可检索的候选题库。

## 2. 目标

P2.0 Task 0 的目标是完成一个离线 OCR 入库 spike：

```text
导数专题.pdf
-> page images
-> OCR text
-> question chunks
-> candidate_questions.json
-> extraction_report.md
```

具体目标：

- 渲染扫描 PDF 的全部页面为图片。
- 按扫描页中的左右书页做基础切分，保留来源页码。
- 对切分后的书页图片执行 OCR。
- 基于题号抽取候选题块。
- 输出候选题 JSON，供人工审核。
- 输出体检报告，说明可读页数、候选题数量、OCR 风险和需要人工校对的位置。
- 为后续 `practice_corpus` 建立最小数据入口。

## 3. 明确不做

本阶段不做以下内容：

- 不接前端，不替换当前预写变式题。
- 不接 pgvector、Milvus 或 embedding provider。
- 不做运行时上传 PDF/DOC。
- 不做任意教辅资料的通用解析器。
- 不承诺全自动题目和答案对齐。
- 不把 OCR 结果直接写入 `memory_events`、`student_profiles` 或错题本。
- 不改变 `/api/diagnose`、`/api/confirm`、`/api/student-profile/evidence` 契约。
- 不提交原始 PDF 文件到 Git。
- 不把未经人工审核的候选题作为学生可见练习题。

## 4. 设计原则

### 4.1 原始资料和正式题库分离

扫描 PDF 是原始资料，不是正式题库。OCR 产物先进入候选层：

```text
candidate_questions = 机器抽取、可能有错、需要审核
practice_corpus = 人工校对、补齐标签、可用于变式题检索
```

P2.0 Task 0 只产出 `candidate_questions`，不直接产出学生可见练习题。

### 4.2 OCR 结果一律视为不可信输入

OCR 可能误识别公式、上下标、根号、分式、参数范围和选项。因此候选题必须携带：

- 原始 OCR 文本。
- 来源页码。
- 置信度或质量标记。
- warnings。
- 可回看页面图片或裁剪区域的引用。

后续只有人工审核过的题目才能进入 `practice_corpus`。

### 4.3 保持现有 MathTrace 边界

本阶段只是题源入库 spike，不改变长期画像系统。`memory_events` 仍是画像事实账本，`student_profiles` 仍是当前画像 read model，RAG/OCR 结果不能决定画像写入。

## 5. 数据流

推荐离线流程：

```text
scripts/rag/ocr-derivative-pdf.mjs
  -> read PDF metadata
  -> render pages with poppler pdftoppm
  -> split each scanned page into left/right book pages when applicable
  -> run OCR on each page image
  -> normalize OCR lines
  -> split by question number pattern
  -> emit candidate_questions.json
  -> emit extraction_report.md
```

文件建议放在：

```text
artifacts/rag/derivative-pdf-spike/
  pages/
  page-slices/
  candidate_questions.json
  extraction_report.md
```

`artifacts/` 目录下的 OCR 中间产物默认不提交，除非后续明确需要保留小型 fixture。

## 6. 候选题数据契约

`candidate_questions.json` 建议使用以下结构：

```ts
interface CandidateQuestionExtraction {
  source_file: string;
  source_file_sha256: string;
  extracted_at: string;
  page_count: number;
  candidates: CandidateQuestion[];
  warnings: string[];
}

interface CandidateQuestion {
  id: string;
  source_ref: {
    pdf_page_index: number;
    book_page_label: string | null;
    side: "left" | "right" | "full";
    crop_image_path: string | null;
  };
  question_number: string | null;
  raw_ocr_text: string;
  normalized_text: string;
  answer_or_solution_candidate: string | null;
  extraction_confidence: "high" | "medium" | "low";
  warnings: string[];
}
```

进入正式 `practice_corpus` 前，人工审核需要补齐：

```ts
interface ReviewedPracticeItem {
  id: string;
  question_text: string;
  solution_outline: string | null;
  knowledge_points: string[];
  mistake_causes: string[];
  difficulty: 1 | 2 | 3 | 4 | 5;
  variant_level: "basic" | "transfer" | "gaokao_style";
  source_ref: CandidateQuestion["source_ref"];
  review_status: "reviewed";
}
```

## 7. OCR 和切题策略

### 7.1 PDF 渲染

使用 poppler 渲染页面图片，优先从 150-200 DPI 开始。当前体检中 120 DPI 已能肉眼阅读，但 OCR 可能需要更高分辨率。

### 7.2 页面切分

当前 PDF 一页包含左右两页书页。第一版可以使用简单几何切分：

```text
left = 左半部分
right = 右半部分
```

如果边缘栏、装订线或页眉干扰 OCR，再加入固定 margin crop。不要在 Task 0 引入复杂版面分析。

### 7.3 OCR

首选本地 OCR，候选方案：

- `tesseract`：适合脚本化，后续可固定为开发依赖或安装说明。
- macOS Vision OCR：可作为本机 spike 方案，但当前沙箱测试返回 `nilError`，不能作为已验证路径。
- 外部 OCR：若本地 OCR 不稳定，作为后续单独评估，不混入 Task 0 MVP。

### 7.4 题号切分

第一版用保守规则识别题号：

```text
行首或段首出现：1. / 2. / 10. / 25.
```

切分失败时保留整页 OCR 文本，并在 report 中标记 `question_split_failed`。

### 7.5 答案对齐

本阶段不强求答案 PDF 自动对齐。若同一 PDF 中出现答案或解析，可作为 `answer_or_solution_candidate`。否则先置为 `null`，人工审核时补齐。

## 8. 输出报告

`extraction_report.md` 至少包含：

- 输入文件名、大小、页数、是否有文字层。
- 渲染 DPI 和页面切分策略。
- OCR 工具和版本。
- 成功 OCR 的页面数量。
- 候选题数量。
- 题号连续性检查。
- 低置信度候选列表。
- 公式/图像/跨页/答案缺失 warnings。
- 建议进入人工审核的 10-15 道候选题。

## 9. 和后续 RAG 的关系

Task 0 完成后，下一步不是直接上 pgvector，而是：

```text
candidate_questions.json
-> 人工审核 10-15 道
-> practice_corpus fixture
-> metadata/text search
-> 诊断后检索 3 道变式题
```

当 corpus 规模扩大、metadata/text search 无法区分同标签下题目语义相似度时，再设计 pgvector。

## 10. 验收标准

Task 0 完成后应满足：

- 能确认 PDF 没有可用文本层，必须走 OCR。
- 能渲染全部 8 个 PDF 页面。
- 能从至少前 2 个扫描页中识别出可读题干或明确说明 OCR 阻塞。
- 能产出 `candidate_questions.json` 的 schema-valid 文件，哪怕部分候选为低置信度。
- 能产出 `extraction_report.md`，列出 OCR 质量、候选题数量和后续人工审核建议。
- 不修改现有诊断、画像、错题本、evidence API 和前端行为。

## 11. 风险和取舍

- 扫描 PDF 公式 OCR 不稳定：用候选层和人工审核隔离风险。
- 答案对齐缺失：Task 0 不强求全自动答案对齐。
- OCR 工具依赖不稳定：先在脚本和 report 中显式记录工具版本和失败原因。
- 版权边界：原始 PDF 不入 Git；公开展示或提交前只保留必要 demo 题和来源引用。
- 过早接入前端会污染体验：未经审核的 OCR 题目不能直接给学生练习。

## 12. 后续路线

推荐后续任务：

```text
P2.0 Task 0: 导数扫描 PDF OCR 入库 Spike
P2.0 Task 1: 人工审核后生成导数 practice_corpus fixture
P2.0 Task 2: metadata/text search 检索 3 道变式题
P2.0 Task 3: 变式题模块接入 corpus 检索，预写题作为 fallback
P2.1: 建立检索 eval，再评估 pgvector
```

