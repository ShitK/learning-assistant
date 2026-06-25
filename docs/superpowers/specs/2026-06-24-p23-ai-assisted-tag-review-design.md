# P2.3 Taxonomy-aware AI-assisted Tag Review Design Spec

## 1. 背景

P2.0 已经把导数专题扫描 PDF 通过 MinerU JSON 和人工候选题审核，整理成本地 `practice_corpus.json`（人工审核后的原始练习题库文件）。

P2.1 在 `practice_corpus.json` 上实现了本地 Variant Practice Agent MVP（变式练习推荐 Agent 最小版），能从题库里召回候选题，并输出 `foundation`（巩固题）、`near_transfer`（近迁移题）和 `mixed_application`（综合应用题）推荐。

P2.2 继续补了 `metadata enrichment`（题源元数据增强）：

```text
practice_corpus.json
-> candidate_tag_proposals.json
-> enriched_practice_corpus.json
-> Variant Practice Agent evaluation
```

当前真实本地 artifact 的状态是：

- `practice_corpus.json`：69 道导数题。
- `candidate_tag_proposals.json`：规则生成的标签建议。
- `enriched_practice_corpus.json`：68 道 `approved`（已接受，可被 Agent 使用），1 道 `needs_fix`（需要修正）。
- 但仍有 12 道没有 `target_skills`（目标能力标签），12 道没有 `method_tags`（解题方法标签），10 道没有 `feature_flags`（题目特征标记）。

这说明 P2.2 已经完成了第一版自动打标闭环，但标签仍主要来自 deterministic rules（确定性规则）。如果后续直接接 `pgvector`（Postgres 向量检索扩展）或 `embedding`（文本向量表示），底层标签错漏仍会传导到推荐结果。

P2.3 要解决的问题是：让 AI 做 50% 以上的标签判断工作，同时保留可审计、可回滚、可人工修正的标签写入边界。

## 2. 目标

P2.3 的目标是做一个本地的 taxonomy-aware AI-assisted tag review MVP（支持 taxonomy 的 AI 辅助标签审核最小版）：

```text
practice_corpus.json
-> rule proposals
-> AI proposals
-> proposal merge / auto-approval gate
-> review queue
-> tag_review_records.json
-> enriched_practice_corpus.json
-> Variant Practice Agent evaluation
```

具体目标：

- 把当前导数标签体系包装成 `math_derivative_v0` taxonomy（数学-导数专题标签配置），为未来新增数列、解析几何或其他学科预留配置边界。
- 新增 AI tag proposal CLI（AI 标签建议命令行工具），让 AI 基于题干、章节、规则建议和当前 taxonomy 提出标签建议。
- 新增 proposal merge / auto-approval gate（标签建议合并与自动通过门控），让规则建议和 AI 建议一致且高置信的题自动生成 `approved` review record。
- 只把冲突、低置信、缺标签、图像依赖或未知标签题放入 review queue（人工审核队列）。
- 新增本地 tag review UI（标签审核静态页面），只审核 review queue，而不是从 69 道题从头手工打标签。
- 导出 `tag_review_records.json`（标签审核记录文件），作为 `build-enriched-practice-corpus.mjs --review` 的输入。
- 复跑 Variant Practice Agent evaluation，观察推荐数量、warning 和候选质量是否改善。

## 3. 非目标

本阶段不做：

- 不接 `pgvector`、`embedding`、Milvus 或外部向量库。
- 不改数据库，不改 Supabase schema，不读写 `memory_events`、`student_profiles`、mistake book 或 evidence API。
- 不接正式前端，不改 `sample_diagnosis`、`app/api/**`、`components/**` 或诊断 pipeline。
- 不把标签审核页集成进学生端主页面。
- 不做完整多学科 taxonomy 平台，不一次性写完数学所有专题或其他科目。
- 不让 AI 直接写最终正式标签。AI 只能产出 proposal，最终进入 `enriched_practice_corpus.json` 的标签必须经过 gate 或人工 review record。
- 不生成新题，不做 LLM rerank，不润色推荐理由。
- 不提交真实 `practice_corpus.json`、AI proposal artifact、review queue、tag review records、enriched corpus、PDF、MinerU JSON 或 recommendations artifact。
- 不在 CLI stdout、测试 fixture、文档或提交历史中打印完整教辅题干、完整 AI 响应、API Key、MinerU token 或 `.env.local` 内容。
- 不解决图像题 crop、图文混合题版权和正式内容授权流程；只允许用 `has_graph` / `needs_visual` 标记风险。

## 4. 核心思路

P2.3 不把“让 AI 做更多工作”理解成“让 AI 全自动决定最终标签”。更稳的方式是：

```text
规则 proposal：便宜、稳定、可重复
AI proposal：更强的语义判断和遗漏补充
merge/gate：代码决定哪些可自动通过
review queue：人只看风险项
review records：最终进入 enriched corpus 的审计边界
```

这样 AI 可以完成 50% 以上普通题的判断，但不会绕过结构化门控。

## 5. Taxonomy-aware 设计

### 5.1 为什么要 taxonomy-aware

当前 P2.2 的 `practice-tag-taxonomy.mjs`（导数标签字典模块）是导数专题专用。未来如果扩展到数列、解析几何、三角函数或物理力学，每个专题都需要自己的标签集合。

P2.3 的设计原则是：

```text
一套通用工具链
多套小 taxonomy 配置
```

以后新增专题时，应该新增 taxonomy 配置，而不是重写审核页、AI proposal CLI、merge/gate 或 Agent evaluation。

### 5.2 第一版 taxonomy 结构

第一版只实现一个 taxonomy：

```js
{
  taxonomy_id: "math_derivative_v0",
  subject: "math",
  unit: "derivative",
  display_name: "数学 / 导数",
  target_skills: [
    { key: "tangent_slope", display_name: "切线斜率" },
    { key: "derivative_definition_limit", display_name: "极限式识别导数" },
    { key: "derivative_calculation", display_name: "求导运算" },
    { key: "monotonicity", display_name: "单调性" },
    { key: "extrema", display_name: "极值最值" },
    { key: "zero_point", display_name: "零点" },
    { key: "parameter_range", display_name: "参数范围" }
  ],
  method_tags: [
    { key: "derivative_definition", display_name: "导数定义式" },
    { key: "tangent_slope", display_name: "切线斜率" },
    { key: "quotient_rule", display_name: "商法则" },
    { key: "logarithmic_derivative_formula", display_name: "对数函数求导" },
    { key: "power_function_derivative", display_name: "幂函数求导" },
    { key: "monotonicity_by_derivative", display_name: "导数判断单调性" },
    { key: "extremum_by_derivative", display_name: "导数判断极值最值" },
    { key: "zero_count", display_name: "零点个数" },
    { key: "parameter_classification", display_name: "参数分类讨论" },
    { key: "inequality_with_derivative", display_name: "导数处理不等式" }
  ],
  feature_flags: [
    { key: "has_parameter", display_name: "含参数" },
    { key: "has_graph", display_name: "涉及图像" },
    { key: "has_choice_options", display_name: "选择题" },
    { key: "has_fill_blank", display_name: "填空题" },
    { key: "has_ln_exp", display_name: "含对数或指数" },
    { key: "has_square_root", display_name: "根号" },
    { key: "needs_visual", display_name: "依赖原图" }
  ],
  target_skill_to_method_tags: {
    tangent_slope: ["tangent_slope", "derivative_definition"],
    derivative_definition_limit: ["derivative_definition"],
    derivative_calculation: [
      "quotient_rule",
      "logarithmic_derivative_formula",
      "power_function_derivative"
    ],
    monotonicity: ["monotonicity_by_derivative"],
    extrema: ["extremum_by_derivative"],
    zero_point: ["zero_count"],
    parameter_range: ["parameter_classification"]
  }
}
```

### 5.3 兼容 P2.2

P2.3 不能破坏 P2.2 已有导出：

- `TARGET_SKILL_DISPLAY_NAMES`
- `METHOD_TAG_DISPLAY_NAMES`
- `FEATURE_FLAG_DISPLAY_NAMES`
- `TARGET_SKILL_TO_METHOD_TAGS`
- `normalizeTargetSkillKeys`
- `deriveMethodTagsFromTargetSkills`

可以在同一个模块里新增 taxonomy-aware API：

- `DEFAULT_TAXONOMY_ID = "math_derivative_v0"`
- `getPracticeTagTaxonomy(taxonomyId = DEFAULT_TAXONOMY_ID)`
- `validatePracticeTagTaxonomy(value)`
- `getAllowedTagSets(taxonomy)`

旧代码继续用旧导出，新代码优先使用 taxonomy-aware API。

### 5.4 P2.3b taxonomy gap patch（求导运算标签缺口修补）

P2.3a 真实 AI proposal smoke（真实 AI 标签建议冒烟验证）后发现，`missing_ai_target_skill`（AI 缺少目标能力标签）里只有少量是真正的导数 taxonomy gap（标签体系缺口），其中最典型的是“已知函数，求 `f'(x)`（导函数）”这一类基础求导题。其余很多 case 是当前导数 corpus（题库语料）混入了集合、命题、组合、指数模型等非导数题，不应该为了通过 gate（门控）而把导数 taxonomy 扩成全数学 taxonomy。

因此 P2.3b 只新增一个 `target_skill`（目标能力标签）：

- `derivative_calculation`（求导运算）：题干明确要求求导数、导函数或 `f'(x)`。

同时只新增三个 P2.3b 已有真实题例能支撑的 `method_tags`（解题方法标签）：

- `quotient_rule`（商法则）：题干函数包含分式结构，例如 `\frac`（LaTeX 分式命令）。
- `logarithmic_derivative_formula`（对数函数求导）：题干含 `ln` / `\ln`（自然对数）。
- `power_function_derivative`（幂函数求导）：题干含 `x^` / `x^{}`（幂函数形式）。

`basic_derivative_formula`（基础求导公式）、`product_rule`（乘积法则）和 `chain_rule`（链式法则）暂不加入。原因是当前 corpus 里还没有足够清楚的测试样例，过早加入会让 `method_tags`（解题方法标签）过宽，增加错误自动通过风险。

P2.3b 的 rule proposal（规则标签建议）也保持窄触发：只有题干或检索文本出现 `f'(x)=`、`导函数`、`求...导数` 或 `求...导函数` 这类明确求导信号时，才会建议 `derivative_calculation`（求导运算）。单独靠 `section_title`（章节标题）里出现“导数”不能触发该标签，避免把混入的非导数题误标为求导题。

## 6. AI Tag Proposal

### 6.1 输入

AI proposal CLI 读取：

- `practice_corpus.json`（人工审核后的原始题库）。
- `candidate_tag_proposals.json`（规则标签建议）。
- taxonomy 配置，第一版固定 `math_derivative_v0`。

每道题给 AI 的输入只包含必要字段：

```js
{
  item_id: "practice-candidate-1",
  question_text: "题干文本",
  section_title: "考点 1 导数的概念、几何意义与运算",
  source_ref: {
    pdf_page_index: 1,
    section_title: "考点 1 导数的概念、几何意义与运算"
  },
  rule_proposal: {
    target_skills: ["tangent_slope"],
    method_tags: ["tangent_slope", "derivative_definition"],
    feature_flags: ["has_choice_options"]
  },
  taxonomy: {
    taxonomy_id: "math_derivative_v0",
    allowed_target_skills: ["tangent_slope", "..."],
    allowed_method_tags: ["derivative_definition", "..."],
    allowed_feature_flags: ["has_choice_options", "..."]
  }
}
```

禁止把完整 corpus、PDF、MinerU JSON、API Key 或 `.env.local` 发给 AI。

### 6.2 输出

AI proposal artifact 建议结构：

```js
{
  proposal_version: "practice-ai-tag-proposal-v0",
  taxonomy_id: "math_derivative_v0",
  generated_at: "2026-06-24T00:00:00.000Z",
  source_corpus_file: "artifacts/rag/practice-corpus/practice_corpus.json",
  source_rule_proposal_file: "artifacts/rag/tag-proposals/candidate_tag_proposals.json",
  provider_meta: {
    provider_name: "openai_compatible",
    model: "deepseek-v4-flash"
  },
  item_count: 69,
  proposals: [
    {
      item_id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      taxonomy_id: "math_derivative_v0",
      proposed_tags: {
        target_skills: [
          {
            tag: "tangent_slope",
            display_name: "切线斜率",
            confidence: "high",
            evidence_terms: ["切线", "斜率"],
            rationale: "题干要求求曲线切线斜率，直接对应切线斜率能力。",
            source: "llm"
          }
        ],
        method_tags: [],
        feature_flags: []
      },
      item_confidence: "high",
      removed_evidence_terms: [],
      warnings: []
    }
  ]
}
```

约束：

- `source` 必须是 `"llm"`。
- `tag` 必须属于当前 taxonomy；未知标签必须被 validator 拒绝。
- `confidence` 只允许 `"high" | "medium" | "low"`。
- `evidence_terms` 优先来自题干、章节或 rule proposal；parser 会移除不在 source text（题干、章节和规则证据拼接文本）中的证据词，并记录到 `removed_evidence_terms`（被移除证据词列表）。
- `rationale` 用于审核展示，不参与检索排序。
- `provider_meta` 不得包含 API Key、完整 prompt、完整原始响应或请求 headers。
- `removed_evidence_terms` 只用于审计和审核解释，不参与检索排序，也不直接写入学生画像。
- `warnings` 使用稳定枚举，第一版包括：
  - `unknown_tag_removed`
  - `empty_tag_removed`
  - `invalid_confidence_removed`
  - `invalid_ai_json`
  - `invalid_ai_schema`
  - `invalid_evidence_terms_removed`

`parseAiTagProposalResponse`（AI 标签建议响应解析函数）负责白名单过滤：未知 tag、空 tag、非法 confidence、非法 schema 一律拒绝或降级为 warning；不匹配的 evidence term（证据词）会被删除并进入 `removed_evidence_terms`（被移除证据词列表）。后续 merge/gate 只消费过滤后的 AI proposal artifact，不允许直接消费原始 AI response。

### 6.3 Provider 边界

P2.3 第一版只设计本地 OpenAI-compatible CLI provider：

- 环境变量使用 `RAG_TAG_PROVIDER_*`，不要复用 `VISION_PROVIDER_*` 或 `ANALYSIS_PROVIDER_*`，避免混淆“图片识别”“报告表达增强”和“标签建议”三类职责。
- 推荐变量：
  - `RAG_TAG_PROVIDER_BASE_URL`
  - `RAG_TAG_PROVIDER_MODEL`
  - `RAG_TAG_PROVIDER_API_KEY`
  - `RAG_TAG_PROVIDER_TIMEOUT_MS`
- 未配置 provider 时，AI proposal CLI 应返回清晰错误，不影响 P2.2 rule proposal 和已有 enriched corpus。
- 测试必须使用 fake fetch / fixture，不依赖真实网络或真实 API Key。

## 7. Merge / Auto-approval Gate

### 7.1 Merge 输入

Merge/gate 阶段读取：

- rule proposal artifact：`candidate_tag_proposals.json`
- AI proposal artifact：`candidate_ai_tag_proposals.json`
- taxonomy：`math_derivative_v0`

这里的 AI proposal artifact 必须已经经过 parser 白名单过滤。gate 只能读取结构化 proposal 和 parser warnings，不能绕过 parser 读取原始模型响应。

### 7.2 自动通过条件

第一版自动 `approved` 的条件必须保守：

- rule proposal 和 AI proposal 使用同一个 `taxonomy_id`。
- AI proposal 没有 `unknown_tag_removed`、`empty_tag_removed`、`invalid_confidence_removed`、`invalid_ai_json` 或 `invalid_ai_schema` 这类硬错误 warning。
- `invalid_evidence_terms_removed` 不是自动通过的一票否决；P2.3d 起 evidence 只作为审计信息，gate 可以自动通过并在 `review_notes` 中记录 `ai_evidence_terms_partially_removed`。
- AI `item_confidence === "high"`。
- 至少一个 `target_skills` 与 rule proposal 一致，或者 rule proposal 原本没有 target skill 但 AI 高置信补出了合法 target skill。
- `method_tags` 不要求完全一致；AI 可以补充 rule 漏掉的解题方法，自动通过时最终 `method_tags` 取 rule、AI 和 target skill 派生标签的并集。
- 非视觉 `feature_flags` 不要求完全一致；AI 可以补充客观题型/公式特征，自动通过时最终 feature flag 取 rule 与 AI 的非视觉并集。
- rule 或 AI 的 `feature_flags` 都不能包含 `needs_visual`；`needs_visual` 永远不能进入自动通过记录。
- 规则和 AI 不在 `needs_visual` / `has_graph` 这类图像依赖信号上发生冲突或缺失。
- AI rationale 非空，但不作为 correctness 证明，只作为审核解释。

### 7.3 进入 review queue 的条件

以下题目必须进入人工审核队列：

- AI 与 rule 的 `target_skills` 完全冲突。
- AI confidence 是 `medium` 或 `low`。
- AI 或 rule 标记 `needs_visual`。
- AI proposal 带有硬错误 parser warning，例如 `unknown_tag_removed`、`empty_tag_removed`、`invalid_confidence_removed`、`invalid_ai_json`、`invalid_ai_schema`。
- AI 没有给出 target skill。
- 规则没有 target skill 且 AI 也没有 target skill。
- 多标签复杂题命中 3 个以上 target skills。
- 人工审核已有记录但和 AI/规则不一致。

### 7.4 输出

Merge/gate 输出三个本地 artifact：

```text
artifacts/rag/tag-review/merged_tag_proposals.json
artifacts/rag/tag-review/tag_review_queue.json
artifacts/rag/tag-review/auto_tag_review_records.json
artifacts/rag/tag-review/tag_review_summary.json
```

`auto_tag_review_records.json` 可以直接作为 `build-enriched-practice-corpus.mjs --review` 的输入之一，或者在 UI 导出时与人工审核记录合并。

`tag_review_queue.json` 只包含需要人工处理的题，用于本地 tag review UI。

## 8. Tag Review UI

P2.3 的 UI 是本地静态审核页，不进入主产品页面：

```text
artifacts/rag/tag-review/index.html
```

功能：

- 左侧列表显示 review queue items。
- 支持按状态筛选：`unreviewed`、`approved`、`needs_fix`、`skipped`、`conflict`、`needs_visual`。
- 右侧展示题干、章节、source_ref、rule proposal、AI proposal、merge/gate reason。
- 标签选择器从 taxonomy 读取，不写死导数标签。
- 支持修改 `target_skills`、`method_tags`、`feature_flags`。
- 支持 `approved`、`needs_fix`、`skipped`。
- 支持 reviewer note。
- 支持导出 `tag_review_records.json`。

UI 可复用 P2.0 candidate review UI 的本地静态页模式：

- 用 KaTeX 渲染数学公式。
- 用 localStorage 保存临时审核状态。
- 因为 localStorage key 绑定 queue 文件 hash，页面需要提示“导出前请勿重新生成 queue；重新生成后本页本地草稿可能不会自动恢复”。
- 下载 JSON，不调用后端。
- 不读取 `.env.local`，不接数据库。

## 9. Review Record Contract

P2.3 导出的 review record 保持兼容 P2.2 `build-enriched-practice-corpus.mjs --review`：

```js
{
  item_id: "practice-candidate-1",
  review_status: "approved",
  reviewed_tags: {
    target_skills: ["tangent_slope"],
    method_tags: ["tangent_slope", "derivative_definition"],
    feature_flags: ["has_choice_options"]
  },
  review_notes: "AI 和规则一致，已自动通过。",
  has_manual_tag_correction: false,
  tag_source: "llm"
}
```

`tag_source: "llm"` 表示最终标签经过 AI proposal 介入，并不表示完全由 AI 单独决定；自动通过记录仍然必须经过 rule/AI gate。纯规则来源继续使用 `"rule"`，人工修正使用 `"human"`。

新增字段只能作为可选 metadata，不应破坏现有 CLI：

```js
{
  taxonomy_id: "math_derivative_v0",
  review_origin: "auto_gate",
  rule_ai_agreement: "target_skill_overlap",
  ai_confidence: "high"
}
```

P2.3 采用扩展 `tag_review_meta` 的方式承接这些审计字段：`build-enriched-practice-corpus.mjs --review` 继续兼容旧 review records，同时在存在可选字段时把 `review_origin`、`ai_confidence`、`rule_ai_agreement` 写入 enriched item 的 `tag_review_meta`。这样 `enriched_practice_corpus.json` 本身就能区分 auto gate 与 human review，不需要额外拼 manifest 才能复盘。

`tag_review_meta` 的新增字段只用于审计、评估和面试叙事，不参与检索排序。

## 10. Data Flow

```text
1. practice_corpus.json
2. build-practice-tag-proposals.mjs
   -> candidate_tag_proposals.json
3. build-ai-tag-proposals.mjs
   -> candidate_ai_tag_proposals.json
4. merge-tag-proposals.mjs
   -> merged_tag_proposals.json
   -> auto_tag_review_records.json
   -> tag_review_queue.json
5. build-tag-review-ui.mjs
   -> artifacts/rag/tag-review/index.html
6. 人工审核疑难题，导出 tag_review_records.json
7. merge-tag-review-records.mjs
   -> final_tag_review_records.json
8. build-enriched-practice-corpus.mjs --review final_tag_review_records.json
   -> enriched_practice_corpus.json
9. recommend-variant-practice.mjs
   -> recommendations.json
```

## 11. Testing Strategy

P2.3 必须使用 synthetic fixture，不使用真实教辅题文。

需要覆盖：

- taxonomy registry：
  - 默认 taxonomy 是 `math_derivative_v0`。
  - unknown taxonomy id 被拒绝。
  - 所有 tag key 唯一。
  - 旧 P2.2 constants 仍兼容。
  - `derivative_calculation`（求导运算）能归一化中文名并派生 P2.3b 三个方法标签。
- rule proposal core：
  - 明确求 `f'(x)` 或导函数的题能打上 `derivative_calculation`。
  - 含分式、对数、幂函数的求导题能打上 `quotient_rule`、`logarithmic_derivative_formula`、`power_function_derivative`。
  - 非导数污染题即使 `section_title` 含“导数”，也不能只靠章节标题打上 `derivative_calculation`。
- AI proposal core：
  - 构造 prompt 时只包含必要字段。
  - AI 输出 unknown tag 被拒绝。
  - malformed JSON 被拒绝。
  - evidence_terms 不在题干/章节/rule evidence 中时被清洗到 `removed_evidence_terms`，但只作为审计信息，不决定是否进入 gate。
  - stdout 不泄漏题干全文和 API Key。
- merge/gate：
  - rule + AI 一致且 high confidence 自动 approved。
  - target skill 冲突进入 queue。
  - needs_visual 进入 queue。
  - AI 补全 rule 缺失 target skill 时可自动 approved，但必须记录 reason。
  - `invalid_evidence_terms_removed` 只写入 review notes，不触发 review queue。
  - unknown tag 不进入 auto records。
- review UI core：
  - 渲染题干数学公式。
  - taxonomy 标签选择器来自 taxonomy，不写死导数。
  - 导出 review records 兼容 P2.2 enriched builder。
  - localStorage key 绑定 queue hash。
- CLI：
  - missing file、bad JSON、invalid schema 返回稳定错误码。
  - help 文案说明 artifacts 是本地敏感产物，不提交。
  - 默认输出路径在 `artifacts/rag/tag-review/**`。
- integration：
  - final review records 可被 `build-enriched-practice-corpus.mjs --review` 消费。
  - enriched corpus 仍不含 `variant_level`。
  - `derivative_calculation` 标签可以进入 `enriched_practice_corpus.json` 并被 schema validator 接受。
  - Variant Practice Agent 默认跳过 `needs_visual`。
  - Variant Practice Agent 可以用 `求导运算` 查询生成 `foundation` / `near_transfer` / `mixed_application` 三类推荐。

## 12. 安全和隐私边界

- `RAG_TAG_PROVIDER_API_KEY` 只能从本地环境变量读取，不写入文件、不打印、不提交。
- AI prompt 不包含完整 PDF、MinerU JSON、完整 corpus 或学生画像。
- CLI stdout 只输出 counts、paths、warning distribution，不输出完整题干。
- 本地 artifact 默认 ignored，不提交。
- AI 输出视为不可信输入，必须经过 schema validation、taxonomy whitelist 和 auto-approval gate。
- RAG/题源层不写 `memory_events`、不更新 `student_profiles`，不影响 evidence API。

## 13. 成功标准

P2.3 完成后应满足：

- 可以为 69 道导数题生成 AI tag proposals。
- 可以合并 rule + AI proposals，并自动通过高一致、高置信题。
- 可以生成只包含疑难题的 review queue。
- 可以通过本地 tag review UI 导出 `tag_review_records.json`。
- 可以用 review records 重新生成 `enriched_practice_corpus.json`。
- 可以复跑 Variant Practice Agent evaluation，并看到：
  - auto approved 数量。
  - human review queue 数量。
  - needs_fix / skipped 数量。
  - recommendation_count、candidate_count、warnings。
- `sample_diagnosis`、数据库、画像、错题本和 evidence API 不受影响。

## 14. 未来演进

P2.3 不一次性做全学科 taxonomy，但它应该让未来扩展变成“新增配置”：

```text
math_derivative_v0
math_sequence_v0
math_analytic_geometry_v0
physics_mechanics_v0
```

后续可以再做：

- AI 生成 taxonomy draft（标签体系草稿），人工审核后保存为新 taxonomy。
- 多 taxonomy corpus ingestion。
- embedding_text 生成，把 question text + approved tags 拼成更干净的向量文本。
- pgvector prototype。
- 正式教师端/后台题源管理。
