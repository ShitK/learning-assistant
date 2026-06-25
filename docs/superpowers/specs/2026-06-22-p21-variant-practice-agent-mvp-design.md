# P2.1 Variant Practice Agent MVP Design Spec

## 1. 背景

P2.0 已经完成“教辅资料 -> 候选题 -> 人工审核 -> 本地 practice corpus fixture”的题源前置闭环。当前可用的本地 artifact 是：

```text
artifacts/rag/practice-corpus/practice_corpus.json
```

它包含 69 道人工审核后的导数题，每道题都有 `question_text`、`search_text`、`knowledge_points: ["derivative"]`、`section_title`、`difficulty`、`source_ref` 和 `review_meta`。

P2.1 的目标不是继续做一个孤立搜索脚本，而是把 corpus 检索包装成一个最小 Variant Practice Agent：Agent 根据当前错题诊断上下文，调用本地题库搜索工具，筛选 top-k 候选题，最终推荐 3 道变式练习，并解释推荐理由和练习顺序。

## 2. 目标

P2.1 要证明：

```text
当前错题诊断上下文
-> 分析练习目标
-> 调用 searchPracticeCorpus 工具
-> 筛选和排序候选题
-> 输出 3 道推荐练习和推荐理由
```

更具体地说：

- 输入一个本地 demo query，模拟当前错题的题干、知识点、错因和练习目标。
- 从 `practice_corpus.json` 中召回 8-10 道候选题。
- Agent 从候选题中挑出最多 3 道题，按“先巩固，再变式，再迁移”的顺序输出。
- 每道推荐题必须包含推荐类型、推荐理由、匹配维度和 source ref。
- 如果候选题不足或质量不够，Agent 不硬凑，返回降级说明和可检查 warning。

## 3. 非目标

本阶段不做：

- 不接 pgvector、embedding、Milvus 或外部向量库。
- 不接数据库，不读写 Supabase，不改 `memory_events`、`student_profiles`、mistake book 或 evidence API。
- 不接正式前端，不改 `sample_diagnosis`、`app/api/**`、`components/**` 或诊断 pipeline。
- 不让 LLM 生成新题，也不做 LLM rerank。
- 不把 `practice_corpus.json` 或真实 PDF/MinerU JSON/审核 seed 提交到 Git。
- 不处理图像题 crop 或图文混合题召回；P2.0 中已排除的 3 道图像依赖题继续留到后续。
- 不设计真实用户、多学生权限、老师端、RLS 或生产级内容版权流程。

## 4. 核心产品区别

### 4.1 Top-k 搜索结果

`searchPracticeCorpus()` 只回答：

```text
题库里哪些题可能相关？
```

它输出 top-k candidates，包含 search score、命中的字段和基础匹配理由。它是 Agent 的工具，不是最终用户结果。

### 4.2 Agent 推荐结果

`recommendVariantPractice()` 回答：

```text
基于这次错因和练习目标，学生下一步最该练哪几道题，为什么？
```

它会基于 top-k 做二次筛选和教学编排。最终推荐最多 3 道题：

- `foundation`：同 `knowledge_points` 且同 `section_title`，优先处理基础概念或刚错过的定义。
- `near_transfer`：同 `knowledge_points` 但不同 `section_title`，并命中 `target_skill`，训练把同一方法迁移到新表述。
- `mixed_application`：仍命中 `knowledge_points` 且不同 `section_title`，但未命中 `target_skill`，用于最后做综合迁移；如果候选不足则少返回并给 warning。

推荐类型不能只按 top-k 排名贴标签。如果无法按规则找到 3 种类型，就返回 1-2 道并带 warning，不强行凑满 3 道。

## 5. 输入数据契约

P2.1 先使用本地 demo query，不接真实诊断 API。建议输入结构：

```js
{
  id: "demo-derivative-tangent-slope",
  question_text: "设函数 f(x) 在点 x=1 处可导，已知极限式，求曲线在该点处的切线斜率。",
  knowledge_points: ["derivative"],
  section_title: "考点 1 导数的概念、几何意义与运算",
  mistake_causes: ["derivative_definition_confusion"],
  target_skills: ["导数几何意义", "切线斜率", "极限式识别导数"],
  student_profile_hint: {
    weak_knowledge_points: ["derivative"],
    recent_mistake_causes: ["derivative_definition_confusion"]
  }
}
```

说明：

- `question_text` 是当前错题或诊断摘要，不需要真实用户数据。
- `knowledge_points` 使用内部 key，第一版只支持 `["derivative"]`。
- `section_title` 用于 metadata boost。
- `mistake_causes` 和 `target_skills` 用于推荐理由和排序，不写入画像。
- `student_profile_hint` 只是本地 demo 输入，不读取 `student_profiles`。

## 6. 输出数据契约

建议输出结构：

```js
{
  agent_version: "variant-practice-agent-v0",
  query_id: "demo-derivative-tangent-slope",
  practice_goal: {
    knowledge_points: ["derivative"],
    target_skills: ["导数几何意义", "切线斜率", "极限式识别导数"],
    mistake_causes: ["derivative_definition_confusion"],
    summary: "优先巩固导数几何意义，并练习从极限式识别切线斜率。"
  },
  agent_steps: [
    {
      id: "analyze_practice_need",
      status: "completed",
      summary: "识别练习目标：导数几何意义、切线斜率。"
    },
    {
      id: "search_corpus",
      status: "completed",
      summary: "从 practice_corpus 中召回 8 道候选题。"
    },
    {
      id: "rank_candidates",
      status: "completed",
      summary: "按同章节巩固、跨章节迁移和综合应用筛选候选题。"
    },
    {
      id: "build_recommendations",
      status: "completed",
      summary: "生成 3 道变式练习推荐。"
    }
  ],
  rationale: "基于当前错因，先在同章节巩固导数几何意义，再用跨章节题训练迁移，最后做综合应用。",
  search_summary: {
    corpus_version: "practice-corpus-v0",
    searched_items: 69,
    candidate_count: 8
  },
  recommendations: [
    {
      rank: 1,
      recommendation_type: "foundation",
      item_id: "practice-mineru-page-001-block-011-q-1",
      source_candidate_id: "mineru-page-001-block-011-q-1",
      question_text: "...",
      reason: "同属导数几何意义，题干包含切线斜率，适合作为第一道巩固题。",
      matched_dimensions: ["knowledge_point", "section_title", "target_skill"],
      score: 18,
      source_ref: {
        pdf_page_index: 1,
        section_title: "考点 1 导数的概念、几何意义与运算"
      }
    }
  ],
  warnings: []
}
```

输出约束：

- `recommendations.length <= 3`。
- 推荐题来自 `practice_corpus.json`，不生成新题。
- 推荐理由只能基于 corpus 字段和 query 字段，不编造“学生曾做过这道题”。
- `agent_steps` 是确定性 trace，用于后续前端展示 Agent 过程；它不包含完整题干。
- `rationale` 是整体推荐解释，不能包含超出 query/corpus 的事实。
- `review_meta` 不进入最终推荐输出，除非未来做调试模式；P2.1 默认不展示审核元数据。
- 如果候选不足，返回 `warnings: ["insufficient_candidates"]`。
- 如果严格的 `foundation` / `near_transfer` / `mixed_application` 三类候选不足 3 道，demo 阶段允许从已通过审核的相近标签候选中补 1 道 `additional_practice`（补充练习题），同时返回 `demo_fill_used` warning，避免把补位题伪装成综合应用题。
- 如果 corpus 缺失或非法，CLI 失败并输出稳定错误，不打印完整 corpus 内容。

## 7. Agent 流程

```text
analyzePracticeNeed(query)
-> searchPracticeCorpus(corpus, practiceNeed)
-> rankPracticeCandidates(practiceNeed, candidates)
-> buildPracticeRecommendations(practiceNeed, rankedCandidates)
-> return structured result
```

### 7.1 analyzePracticeNeed

把 query 归一化为练习目标：

- `knowledge_points`
- `target_skills`
- `mistake_causes`
- `summary`

`section_title` 只作为检索和分类时的内部上下文，不进入 `practice_goal` 输出契约。

第一版只做确定性映射，不调用模型。

### 7.2 searchPracticeCorpus

本地 text/metadata search 工具：

- metadata 命中：`knowledge_points`、`section_title`。
- text 命中：`question_text`、`search_text` 与 query / target skills 的关键词重合。
- 输出 top-k candidates，默认 `limit=8`。

第一版可以用简单可解释 scoring，不需要 embedding。`DERIVATIVE_SEARCH_TERMS` 是 P2.1 导数专题的临时领域词表；当前不做中文分词，主要依赖 `target_skills`、领域词表和章节 metadata。后续扩展到多专题时，应把领域词表迁移到 corpus meta 或知识点配置。

### 7.3 rankPracticeCandidates

Agent 对 top-k 做二次排序和类型选择：

- 排序以 `score` 为主，`matched_dimensions.length` 作为 tie-breaker。
- `foundation` 优先选择同 `section_title` 且命中 `knowledge_point` / `section_title` 的题。
- `near_transfer` 优先选择同 `knowledge_points`、不同 `section_title`，且命中 `target_skill` 的题。
- `mixed_application` 优先选择仍然命中 `knowledge_points`、不同 `section_title`，但没有命中 `target_skill` 的题；如果无法满足则少返回并给 warning。
- `additional_practice` 只作为演示兜底：前三类不足 3 道时，从剩余 approved 候选里优先选择命中 `target_skill` 或 `method_tag` 的相近题补位。
- 优先匹配 `target_skills`。
- 避免重复推荐几乎相同的题号/题干。
- 保留 score 和 matched dimensions，方便解释。

### 7.4 buildPracticeRecommendations

把 ranked candidates 编排成最多 3 道题：

1. `foundation`
2. `near_transfer`
3. `mixed_application`

第一版没有真实难度标签，因此推荐类型主要由 `section_title`、`knowledge_points`、`matched_dimensions` 和 score 决定。后续如果补 difficulty、题型、方法标签，再升级推荐类型判断。

### 7.5 buildAgentTraceAndRationale

Agent 结果要包含轻量可观测 trace：

- `analyze_practice_need`
- `search_corpus`
- `rank_candidates`
- `build_recommendations`

这些步骤只记录摘要和状态，不记录完整题干或完整 corpus。顶层 `rationale` 解释为什么按这个顺序推荐，而不是只拼接每道题自己的 reason。

## 8. 未来从诊断结果接入 Agent 的映射

P2.1 不接正式 API，但后续可以从当前诊断结果构造 Practice Query：

- `question_text`：来自确认后的题干或诊断摘要。
- `knowledge_points`：来自 `knowledge_mapping` 的内部知识点 key。
- `mistake_causes`：来自 `mistake_diagnosis` 的受控错因标签。
- `target_skills`：由知识点 + 错因规则派生，例如导数定义混淆 -> `["导数几何意义", "切线斜率"]`。
- `student_profile_hint`：未来可由当前画像或 evidence API 摘要派生，但 P2.1 不读取真实画像。

这个映射说明后续如何接入真实诊断 pipeline，但本阶段仍保持本地 CLI demo。

## 9. 数据流和文件边界

P2.1 新增脚本层，不改产品代码：

```text
artifacts/rag/practice-corpus/practice_corpus.json
-> scripts/rag/practice-corpus-search-core.mjs
-> scripts/rag/variant-practice-agent-core.mjs
-> scripts/rag/recommend-variant-practice.mjs
-> artifacts/rag/variant-practice-agent/recommendations.json
```

建议文件职责：

- `practice-corpus-search-core.mjs`：纯搜索工具，输入 corpus + practice need，输出 top-k candidates。
- `variant-practice-agent-core.mjs`：Agent orchestrator，负责 analyze / search / rank / recommend。
- `recommend-variant-practice.mjs`：CLI demo runner，读取 corpus 和 query，输出 recommendations artifact。
- `scripts/tests/rag/*`：覆盖 search、agent 和 CLI。

生成的 `recommendations.json` 是 ignored artifact，不提交 Git。

## 10. 错误和降级

- 输入 corpus 文件不存在：CLI exit code 2，提示 `corpus file not found`。
- corpus JSON 非法：CLI exit code 1，提示 `failed to parse practice corpus JSON`。
- corpus schema 非法：CLI exit code 1，提示 `invalid practice corpus`。
- query JSON 非法：CLI exit code 1，提示 `failed to parse variant practice query JSON`。
- 搜索候选为空：Agent 返回空 recommendations 和 `no_candidates_found` warning。
- 推荐不足 3 道：返回已有推荐和 `insufficient_recommendations` warning。

错误输出不能包含完整题干、完整 corpus、PDF 内容、API Key 或 `.env` 内容。

## 11. 测试策略

### Search core tests

使用合成 corpus，覆盖：

- metadata match 提升分数。
- target skill 关键词命中进入 `matched_dimensions`。
- `limit` 限制 top-k 数量。
- 非 derivative knowledge point 不应误召回为高分。
- 空 query 不崩溃，返回低分或空结果。

### Agent core tests

使用合成 corpus 和 demo query，覆盖：

- 输出 `agent_version`。
- 输出最多 3 道 recommendations。
- recommendations 不是简单 top-3 passthrough，而是包含 recommendation type、reason、matched dimensions 和 rank。
- `foundation` 必须来自同章节高相关候选；`near_transfer` 应与 foundation 有章节差异且命中 `target_skill`；`mixed_application` 应来自不同章节、仍相关但未命中 `target_skill` 的候选。
- 输出包含 `agent_steps` 和顶层 `rationale`。
- 候选不足时返回 warning，不硬凑。
- 不输出 `review_meta`。
- 不包含 `variant_level`。

### CLI tests

覆盖：

- 显式 `--corpus`、`--query`、`--out` 成功生成 artifact。
- 默认输出路径为 `artifacts/rag/variant-practice-agent/recommendations.json`。
- 缺 corpus / 缺 query / bad JSON / unknown arg。
- stdout 只输出路径、数量和 warning summary，不打印完整题干。

### Manual summary verification

用真实本地 `practice_corpus.json` 跑一次 demo query，检查：

```json
{
  "agent_version": "variant-practice-agent-v0",
  "recommendation_count": 3,
  "candidate_count": 8,
  "warnings": []
}
```

如果真实 corpus 只能稳定推荐 1-2 道，也可以接受，但必须明确 warning 和原因。

## 12. 验收标准

- 本地 CLI 可以从 `practice_corpus.json` 生成 recommendations artifact。
- recommendations 来自 corpus，不是 LLM 生成。
- 输出包含推荐类型、理由、匹配维度和练习顺序。
- 输出包含 `agent_steps` 和顶层 `rationale`，用于后续展示 Agent 过程。
- Agent 和 search 工具有独立测试。
- `node scripts/run-tests.mjs default` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `git diff --check` 无输出。
- `git ls-files artifacts .env.local docs/reviews .superpowers/sdd` 无输出。
- 不修改 `sample_diagnosis`、产品前端、API、数据库或画像事实层。

## 13. 后续演进

P2.1 完成后，下一步根据推荐质量决定：

1. 如果 69 道 corpus 已能稳定给出合理推荐：P2.2 再做一个最小前端页面，展示“当前错题 -> Agent 步骤 -> 3 道推荐题”。
2. 如果召回太粗：先做机器预标注 + 人工审核的 tag proposal，而不是马上 pgvector。
3. 如果文本差异大但数学结构相似召回不到：再设计 embedding_text 和 pgvector 原型。
4. 如果推荐理由不够像老师：再考虑 LLM rerank / reason polish，但仍不能让 LLM 写画像或生成未经校验的新题。

## 14. 自查

- 无 pgvector、embedding、数据库、正式前端或 LLM 生成新题。
- RAG 被限定为变式题源检索和推荐工具，不进入 `memory_events` / `student_profiles` 事实层。
- Top-k search 和最终 3 道推荐题职责分离。
- 输出包含 Agent trace、整体 rationale 和推荐类型规则，是 Agent 决策结果，而不是裸搜索结果。
- 真实教辅资料 artifact 仍保持本地 ignored，不进入 Git。

## Implementation Handoff Notes

- Real derivative corpus run returned 2 recommendations from 8 candidates.
- This is accepted for P2.1 because the Agent returns `insufficient_recommendations` instead of forcing recommendations.
- The generated summary confirmed `leaked_review_meta=false` and `leaked_variant_level=false`.
- Next improvement should be tag proposal / metadata enrichment before pgvector if recall quality is too coarse.
