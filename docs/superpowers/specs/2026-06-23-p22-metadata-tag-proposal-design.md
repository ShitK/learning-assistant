# P2.2 Metadata / Tag Proposal Design Spec

## 1. 背景

P2.0 已把导数专题教辅资料转成经过人工审核的本地 `practice_corpus.json`。P2.1 在此基础上实现了本地 Variant Practice Agent MVP：

```text
Practice Query
-> searchPracticeCorpus
-> rank candidates
-> rule-based recommendation selection
-> agent_steps / rationale / warnings
```

真实 P2.1 demo 的结果是：

```json
{
  "recommendation_count": 2,
  "recommendation_types": ["foundation", "near_transfer"],
  "candidate_count": 8,
  "warnings": ["insufficient_recommendations"]
}
```

这个结果说明当前 Agent 不是缺前端，也不是缺 pgvector，而是 corpus metadata 太薄。现在每道题主要只有 `knowledge_points: ["derivative"]`、`section_title` 和全文搜索字段。Agent 能知道“这题大概相关”，但很难稳定判断：

- 这题练的是切线斜率、单调性、极值最值、零点，还是参数分类？
- 这题适合作为同技能迁移，还是综合应用？
- 这题是否依赖图像、选项、填空或特定函数形式？

P2.2 要补的是这一层结构化题目标签。

## 2. 目标

P2.2 的目标是建立一个低人力的 metadata enrichment 闭环：

```text
practice_corpus.json
-> tag proposal
-> local review / correction
-> enriched_practice_corpus.json
-> rerun Variant Practice Agent evaluation
```

更具体地说：

- 用确定性规则为 69 道导数题生成第一版 tag proposals。
- 让人工审核的是“机器建议标签”，而不是从空白开始逐题手填。
- 生成一个新的 ignored enriched corpus artifact，给 P2.1 Agent 后续升级使用。
- 复跑同一个 demo query，验证推荐是否能从 2 道提升到更稳定的 3 道，或至少更清楚解释为什么仍不足。
- 保持 RAG/题源层和 `memory_events` / `student_profiles` 事实层分离。

## 3. 非目标

本阶段不做：

- 不接 pgvector、embedding、Milvus 或外部向量库。
- 不接数据库，不改 Supabase schema，不读写 `memory_events`、`student_profiles`、mistake book 或 evidence API。
- 不接正式前端，不改 `sample_diagnosis`、`app/api/**`、`components/**` 或诊断 pipeline。
- 不让 LLM 决定最终标签。若后续引入 LLM，只能作为 proposal source，最终仍要人工确认。
- 不生成新题，不做 LLM rerank，不润色推荐理由。
- 不提交真实 `practice_corpus.json`、`enriched_practice_corpus.json`、tag proposal artifact、PDF、MinerU JSON、reviewed seed 或 recommendations artifact。
- 不解决图像题 crop、图文混合题版权和正式内容授权流程；只用 feature flag 标记这类题。
- 不把 P2.2 做成面向学生的产品页面；审核页如果需要，也只是本地工具。

## 4. 核心思路

P2.2 不直接让用户手工建题库，也不要求用户逐题从零补标签。第一版先做 rule-based tag proposal：

```text
题干 / search_text / section_title / source_ref
-> 规则命中
-> proposal tags + evidence_terms + confidence
-> 人工审核修正
-> enriched corpus
```

机器只提出建议，不直接把建议当成最终 truth。人工审核后的标签才进入 enriched corpus。

这一步的价值不是“让规则很聪明”，而是把题目结构显性化，让 Agent 的推荐选择有更稳定的字段依据。

## 5. 标签体系

第一版只覆盖导数专题，不设计跨学科通用 taxonomy。标签要够用、可解释、可人工审核。

### 5.1 tag key 与展示名

P2.2 起，正式进入 corpus 的标签统一使用 snake_case 内部 key。中文只作为 `display_name`，由 display map 或后续知识库映射提供，避免推荐层同时处理中文标签和英文 key。

P2.1 query 里已有的中文 `target_skills` 视为“自然语言技能请求”。P2.2 的消费侧需要先通过映射表把 query skill 归一化成内部 key，再和 item tags 匹配。

```js
{
  derivative_geometric_meaning: "导数几何意义",
  tangent_slope: "切线斜率",
  derivative_definition_limit: "极限式识别导数",
  monotonicity: "单调性",
  extrema: "极值最值",
  zero_point: "零点",
  parameter_range: "参数范围"
}
```

### 5.2 target_skills

`target_skills` 表示这道题训练的目标能力，面向推荐匹配：

```js
[
  "derivative_geometric_meaning",
  "tangent_slope",
  "derivative_definition_limit",
  "monotonicity",
  "extrema",
  "zero_point",
  "parameter_range"
]
```

规则示例：

- 题干包含“切线”“斜率” -> `["tangent_slope"]`
- 题干包含“极限”且包含导数定义式形态 -> `["derivative_definition_limit"]`
- 题干包含“单调”“递增”“递减” -> `["monotonicity"]`
- 题干包含“极值”“最值”“最大值”“最小值” -> `["extrema"]`
- 题干包含“零点”“根”“交点” -> `["zero_point"]`
- 题干包含“参数”“恒成立”“取值范围” -> `["parameter_range"]`

### 5.3 method_tags

`method_tags` 表示解题方法或数学结构，面向 Agent 排序和后续 explainability：

```js
[
  "derivative_definition",
  "tangent_slope",
  "monotonicity_by_derivative",
  "extremum_by_derivative",
  "zero_count",
  "parameter_classification",
  "inequality_with_derivative"
]
```

`target_skills` 偏“练什么能力”，`method_tags` 偏“用什么方法”。两者会有重叠，但不完全相同。例如 `target_skills: ["tangent_slope"]` 可以对应 `method_tags: ["tangent_slope", "derivative_definition"]`，因为切线斜率题可能同时训练导数定义式识别。

### 5.4 feature_flags

`feature_flags` 表示题目形态和检索/推荐注意事项：

```js
[
  "has_parameter",
  "has_graph",
  "has_choice_options",
  "has_fill_blank",
  "has_ln_exp",
  "has_square_root",
  "needs_visual"
]
```

规则示例：

- 有 `A.` / `B.` / `C.` / `D.` -> `has_choice_options`
- 有“____”“填空”或末尾空线 -> `has_fill_blank`
- 有 `ln`、`e^x`、`exp` -> `has_ln_exp`
- 有 `sqrt`、`√`、`根号` -> `has_square_root`
- 题干提到“如图”“图像”“函数图象”等 -> `has_graph`
- 来源、warning 或人工审核显示缺少图中位置、曲线形状、标注长度等关键信息 -> `needs_visual`

`has_graph` 和 `needs_visual` 的边界：

- `has_graph` 表示题目涉及图像语义，但 OCR 文本可能已经足够解题。
- `needs_visual` 表示必须看到原图才能解题，第一版文本 Agent 默认跳过。
- 第一版 rule-based proposal 会把“如图”作为保守 visual dependency 信号处理；后续 tag review UI 应允许人工把这类题从 `needs_visual` 修正为仅 `has_graph`。

### 5.5 多标签规则

一道综合题可以同时保留多个 `target_skills`、`method_tags` 和 `feature_flags`，但推荐类型判定不能因此变成“任意标签命中都算近迁移”。第一版规则：

- proposal artifact 全量保留命中的标签，并按固定规则顺序去重。
- enriched corpus 不截断标签，但 Agent 判定 `near_transfer` 时优先使用 query 归一化后的 `target_skills` 与 item `target_skills` 的交集。
- `mixed_application` 不依赖 `target_skills` 命中，而依赖 query 派生 `method_tags` 与 item `method_tags` 的交集。
- 如果一题同时命中多个标签，CLI summary 应统计多标签题数量，implementation plan 需要覆盖对应测试。

### 5.6 暂不做 difficulty

P2.2 不把 `difficulty` 作为主要目标。当前没有真实难度标注依据，强行打难度容易制造假精确。第一版可以继续保留 `difficulty: null`，后续如果有人工标注或题库来源难度，再单独设计。

## 6. Proposal 数据契约

Tag proposal 是机器建议，不是最终 corpus。建议结构：

```js
{
  proposal_version: "practice-tag-proposal-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_corpus_file: "artifacts/rag/practice-corpus/practice_corpus.json",
  source_corpus_version: "practice-corpus-v0",
  item_count: 69,
  proposals: [
    {
      item_id: "practice-mineru-page-001-block-011-q-1",
      source_candidate_id: "mineru-page-001-block-011-q-1",
      source_ref: {
        "pdf_page_index": 1,
        "section_title": "考点 1 导数的概念、几何意义与运算"
      },
      proposed_tags: {
        target_skills: [
          {
            tag: "tangent_slope",
            display_name: "切线斜率",
            confidence: "high",
            evidence_terms: ["切线", "斜率"],
            source: "rule"
          }
        ],
        method_tags: [
          {
            tag: "tangent_slope",
            confidence: "high",
            evidence_terms: ["切线", "斜率"],
            source: "rule"
          }
        ],
        feature_flags: [
          {
            tag: "has_choice_options",
            confidence: "medium",
            evidence_terms: ["A.", "B.", "C.", "D."],
            source: "rule"
          }
        ]
      },
      warnings: []
    }
  ]
}
```

约束：

- `proposal_version` 固定为 `practice-tag-proposal-v0`。
- `confidence` 只允许 `"high" | "medium" | "low"`。
- `source` 第一版 proposal 只允许 `"rule"`；review / enriched corpus 中允许记录 `"human"`，未来 proposal source 可扩展 `"llm"`。
- `tag` 使用 snake_case 内部 key；`display_name` 可选，仅用于人工审核展示，不参与匹配。
- `evidence_terms` 必须来自题干、search_text、section_title 或 source metadata，不编造。
- Proposal artifact 保持 ignored，不提交 Git。
- Proposal stdout 只输出 summary，不打印完整题干或完整 corpus。

## 7. Review 数据契约

人工审核后的标签才是进入 enriched corpus 的依据。P2.2 可以复用“本地审核页”思路，也可以先做轻量 JSON/CLI 审核；无论界面如何，审核状态建议归一成：

```js
{
  item_id: "practice-mineru-page-001-block-011-q-1",
  review_status: "approved",
  reviewed_tags: {
    target_skills: ["tangent_slope", "derivative_definition_limit"],
    method_tags: ["tangent_slope", "derivative_definition"],
    feature_flags: ["has_choice_options"]
  },
  review_notes: "",
  has_manual_tag_correction: true,
  tag_source: "human"
}
```

状态含义：

- `proposed`：尚未人工审核，只能作为 draft enriched corpus，不能伪装成 approved。
- `approved`：接受 proposal 或人工修正后可进入 enriched corpus。
- `needs_fix`：标签仍有疑问，不进入 enriched corpus 或进入时带 warning。
- `skipped`：这道题暂不参与 enriched corpus，例如图像依赖过强。

合法转换：

```text
proposed -> approved
proposed -> needs_fix
proposed -> skipped
needs_fix -> approved
needs_fix -> skipped
```

P2.2 第一版可以不做复杂审核 UI。如果 proposal summary 满足以下阈值，可以先输出 summary + draft enriched corpus，让用户抽查 top warnings，再决定是否需要本地审核页：

- `high_confidence_items >= 80%`
- `needs_fix_items <= 10%`
- `needs_visual_items <= 10%`

若不满足阈值，implementation plan 应把轻量本地审核页列为后续 task。若要做审核页，应沿用 P2.0 本地静态工具边界，不做正式产品页面。

## 8. Enriched Corpus 数据契约

`enriched_practice_corpus.json` 是给后续 Agent 使用的新本地 fixture，不替代原始 `practice_corpus.json`。建议结构：

```js
{
  corpus_version: "enriched-practice-corpus-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_corpus_file: "artifacts/rag/practice-corpus/practice_corpus.json",
  source_tag_proposal_file: "artifacts/rag/tag-proposals/candidate_tag_proposals.json",
  item_count: 69,
  items: [
    {
      id: "practice-mineru-page-001-block-011-q-1",
      source_candidate_id: "mineru-page-001-block-011-q-1",
      question_text: "...",
      search_text: "...",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念、几何意义与运算",
      target_skills: ["tangent_slope", "derivative_definition_limit"],
      method_tags: ["tangent_slope", "derivative_definition"],
      feature_flags: ["has_choice_options"],
      difficulty: null,
      source_ref: {
        "pdf_page_index": 1,
        "section_title": "考点 1 导数的概念、几何意义与运算"
      },
      tag_review_meta: {
        review_status: "approved",
        proposal_confidence: "high",
        has_manual_tag_correction: false,
        tag_source: "rule"
      },
      review_meta: {
        "has_manual_correction": true
      }
    }
  ]
}
```

字段边界：

- `target_skills`、`method_tags`、`feature_flags` 是 P2.2 新增检索/推荐 metadata。
- `tag_review_meta` 只用于审计，不直接参与推荐排序；Agent 可读取正式 tags，但不读取 review notes。
- `tag_review_meta.tag_source` 记录当前进入 corpus 的标签来源：`"rule"` 表示直接接受规则 proposal，`"human"` 表示人工修正或确认后写入，未来可扩展 `"llm"` 作为 proposal 来源但不能直接变成正式标签。
- `review_meta` 继续保留 P2.0 的题目审核证据，但默认不参与 ranking。
- `difficulty` 保持原语义，P2.2 不强行填。
- `variant_level` 仍不进入 corpus，因为它是“当前错题 -> 推荐题”的动态关系。

## 9. 对 P2.1 Agent 的影响

P2.2 不是重写 Agent，而是让 Agent 有更多可靠字段。

后续升级点：

- `searchPracticeCorpus` 支持 `enriched-practice-corpus-v0`。
- 搜索打分增加：
  - query 中文 `target_skills` 先归一化成内部 key，再命中 item `target_skills`
  - query 内部 skill key 派生 `method_tags`，再命中 item `method_tags`
  - feature flags 可作为 tie-breaker 或 warning
- `near_transfer` 判断从“不同章节 + target_skill 文本命中”升级为“不同章节 + 目标技能/方法标签命中”。
- `mixed_application` 判断从“不同章节但未命中 target_skill”升级为更精确的规则：
  - `item.section_title !== query.section_title`
  - item `target_skills` 与 query 归一化后的 `target_skills` 无交集
  - item `method_tags` 与 query 派生的 `method_tags` 有交集，或 item `method_tags` 命中导数专题 mixed whitelist
  - item 不包含 `needs_visual`
- `needs_visual` 的题默认不推荐给文本练习 Agent，除非未来支持图片 crop。

P2.2 完成后，仍允许 Agent 返回 `insufficient_recommendations`。目标不是强行 3 道，而是让不足原因更明确：

```text
没有足够 approved mixed_application tag 的候选题
```

对应 warning code 建议：

```text
no_mixed_application_with_related_method_tags
insufficient_approved_tagged_items
skipped_visual_dependency_items
```

而不是现在的：

```text
关键词和章节信息不足
```

## 10. 文件与模块边界

建议新增本地脚本层：

```text
scripts/rag/practice-tag-proposal-core.mjs
scripts/rag/build-practice-tag-proposals.mjs
scripts/rag/build-enriched-practice-corpus.mjs
scripts/tests/rag/practice-tag-proposal-core.test.mjs
scripts/tests/rag/practice-tag-proposal-cli.test.mjs
scripts/tests/rag/enriched-practice-corpus-core.test.mjs
scripts/tests/rag/enriched-practice-corpus-cli.test.mjs
```

是否新增审核页取决于 proposal 质量：

```text
scripts/rag/build-tag-review-ui.mjs
scripts/rag/tag-review-ui-core.mjs
scripts/tests/rag/tag-review-ui-*.test.mjs
```

第一版建议先做 proposal + enriched corpus + evaluation。如果 summary 显示大量 `low_confidence` 或 `needs_visual`，再补审核页，而不是一开始就做完整 UI。

## 11. 本地 Artifact

P2.2 可能生成以下 ignored artifacts：

```text
artifacts/rag/tag-proposals/candidate_tag_proposals.json
artifacts/rag/tag-proposals/tag_proposal_summary.json
artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json
artifacts/rag/enriched-practice-corpus/enrichment_summary.json
artifacts/rag/variant-practice-agent/enriched-recommendations.json
```

这些都不提交 Git。

命令行输出只允许 summary，例如：

```json
{
  "proposal_version": "practice-tag-proposal-v0",
  "item_count": 69,
  "high_confidence_items": 42,
  "low_confidence_items": 8,
  "needs_visual_items": 3,
  "target_skill_distribution": {
    "tangent_slope": 11,
    "monotonicity": 18,
    "zero_point": 7
  }
}
```

不要输出完整题干、完整 corpus、完整 recommendations、PDF 内容、API key 或 `.env`。

## 12. 错误与降级

- corpus 缺失：CLI 退出并提示 `practice corpus file not found`。
- corpus schema 非法：输出 schema errors summary，不打印完整 item。
- proposal 为空：生成 summary，标记 `no_tags_proposed`，不生成 enriched corpus 或生成空 items。
- 某题没有任何标签：保留 item，但加 `tag_review_meta.review_status = "needs_fix"`，Agent 默认不优先推荐。
- 图像依赖题：标记 `needs_visual`，第一版文本 Agent 默认跳过。
- 审核结果缺失：可以用 proposal 生成 draft enriched corpus，但必须标记 `review_status = "proposed"`，不能伪装成人工 approved。

## 13. 测试策略

### 13.1 Core tests

覆盖：

- 规则命中 `target_skills`、`method_tags`、`feature_flags`。
- 同一标签重复命中时去重。
- confidence 计算稳定。
- evidence_terms 来自输入文本。
- 无命中题返回 warnings。
- `needs_visual` 题被正确标记。
- `has_graph` 与 `needs_visual` 的边界被分别覆盖。
- `has_square_root` 命中根号、`sqrt` 或 `√`，不与零点/方程根混淆。
- query 中文技能名能归一化为内部 key，未知技能名能安全降级。
- 多标签题全量保留标签，但推荐类型判定使用明确优先规则。
- enriched corpus 保留原 corpus 字段，同时新增 tags。
- enriched corpus 校验 `target_skills`、`method_tags`、`feature_flags`、`tag_review_meta` 的 schema。
- `variant_level` 不进入 enriched corpus。

### 13.2 CLI tests

覆盖：

- 正常生成 proposal artifact。
- 正常生成 enriched corpus artifact。
- 缺 input、bad JSON、invalid corpus 的错误码。
- stdout 不包含完整题干关键词样例、不包含 `.env` 或 API key 标识。
- 默认输出路径在 `artifacts/rag/**`。

### 13.3 Evaluation tests

用合成 enriched corpus 验证：

- Agent 可以基于 `target_skills` / `method_tags` 区分 `near_transfer` 和 `mixed_application`。
- `needs_visual` 题不会被文本 Agent 推荐。
- 如果 enriched corpus 仍不足，warning 语义比 P2.1 更具体，例如 `no_mixed_application_with_related_method_tags`。

真实本地 corpus 只做 manual summary，不进入 CI fixture。

## 14. 验收标准

- 可以从本地 `practice_corpus.json` 生成 `candidate_tag_proposals.json`。
- proposal summary 能显示标签分布、置信度分布和 warning 分布。
- 可以从 proposal / review 结果生成 `enriched_practice_corpus.json`。
- enriched corpus 不包含 `variant_level`，不提交 Git。
- P2.1 Agent 可以在不改产品前端/API 的前提下使用 enriched corpus 复跑 evaluation。
- 真实 demo 至少能解释为什么推荐不足；理想情况下从 2 道提升到 3 道。
- implementation plan 应包含 `interview/mathtrace-project-narrative.md` 的 P2.2 叙事更新任务；若最终实现不改变面试叙事，需要在最终说明中解释原因。
- `node scripts/run-tests.mjs default`、`npm run lint`、`npm run build` 通过。
- `git ls-files artifacts .env.local docs/reviews .superpowers/sdd` 无输出。

## 15. 后续演进

P2.2 完成后，再根据结果决定：

1. 如果 enriched corpus 能稳定推荐 3 道：再考虑最小前端 demo 或 API prototype。
2. 如果 tag proposal 质量高但召回仍差：设计 `embedding_text` 和 pgvector prototype。
3. 如果 rule-based proposal 覆盖不足：考虑 LLM proposal，但只作为待审核建议，不直接写正式标签。
4. 如果 `needs_visual` 占比影响推荐：单独做图像题 crop / 图文混合题处理。
5. 如果多专题扩展：把导数标签体系升级成 subject/topic scoped taxonomy。

## 16. 自查

- P2.2 仍是本地工具链，不接数据库、前端产品、pgvector、embedding 或 LLM rerank。
- Tag proposal 不等于最终标签；人工审核或明确 draft 状态才进入 enriched corpus。
- `variant_level` 仍是推荐结果元数据，不进入 corpus。
- RAG/题源层不写 `memory_events` / `student_profiles`。
- 不提交真实 corpus、proposal、enriched corpus 或 recommendations artifact。
