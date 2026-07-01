# P2.10 Variant Practice Retrieval Quality Evaluation Design Spec

## 1. 背景

当前 `main` 已完成 P2.7 和 P2.9：

```text
确认后的上传题诊断
-> POST /api/variant-practice
-> 服务端构造 DynamicPracticeQuery
-> 优先用 pgvector 召回候选题
-> pgvector 不可用时回退本地 enriched corpus
-> 复用 Variant Practice Agent 选出 3 道题
-> 返回裁剪后的 ProductVariantPractice
```

P2.9 已经证明“可以从 Supabase Postgres + pgvector 召回真实题库候选，并保持本地 JSON fallback”。但它还没有系统回答另一个问题：

```text
这 3 道题是否真的适合当前诊断？
如果推荐质量不好，问题来自题库、标签、向量召回、Agent 排序，还是 fallback？
```

P2.10 要补的是 Variant Practice Agent 的离线评估与量化。它不是新增产品功能，也不是改变学生端推荐 UI，而是给当前推荐链路增加可复现、可审查的质量评估报告。

## 2. 目标

P2.10 的目标是：

```text
固定一组诊断 eval cases
-> 对每个 case 运行 variant practice retrieval/recommendation
-> 收集 pgvector 候选、本地 fallback 候选和最终 3 题
-> 计算覆盖率、相关性、多样性、边界安全和 fallback 稳定性指标
-> 输出 ignored 本地评估 artifact
-> 如果质量不足，给出可归因的后续建议
```

验收口径：

- 能用本地 CLI 运行一组固定 eval cases，并输出 JSON 报告。
- 报告能区分 retrieval source：`pgvector`、`local_json`、`null`；如果 RAG 返回 null 后需要描述前端展示预写题，则单独记录 `display_source: "diagnosis_practice_questions"`，不要把它混入 retrieval source。
- 报告能量化每个 case 是否返回 3 道题、是否命中目标知识点/错因/target skill、是否重复、是否泄露内部字段。
- 报告能给出质量不足的原因分类：题库不足、标签不准、向量召回泛、Agent slotting 未选中好题、候选不足或 fallback 触发。
- 评估只读，不写 `memory_events`、`student_profiles`、`diagnosis_runs`、`mistake_book_items`、localStorage 或 pgvector corpus。
- 评估 artifact 输出到 `artifacts/rag/evals/**`，不提交 Git。
- `sample_diagnosis`、`POST /api/variant-practice` 正式响应和学生端 UI 不改变。

## 3. 明确假设

- 当前仍固定 `demo_student_001`，不做登录、真实多用户、老师端或 RLS 用户策略。
- 第一版评估只覆盖导数专题，继续使用 P2.9 已同步的 `enriched-practice-corpus-v0`。
- 第一版评估不调用 LLM judge。指标优先使用可解释的确定性规则和 metadata 对齐，避免把“推荐质量”再次交给模型主观判断。
- 第一版允许在本地有 Supabase + embedding provider 配置时运行 pgvector source；未配置时仍可运行 local-only eval。
- 评估报告可以包含内部字段、候选 id、source ref、matched tags、retrieval score 等 debug 信息，但只能写入 ignored artifact，不进入正式 API 响应或前端 UI。
- P2.10 不要求一次评估就证明推荐“优秀”；它要先建立可重复的测量方式和问题归因框架。

## 4. 非目标

P2.10 不做：

- 不修改 `/api/variant-practice` 的正式响应契约。
- 不在学生端展示 retrieval source、score、候选列表、debug tag 或 eval 结论。
- 不自动修正推荐算法、标签、题库或 pgvector 阈值。
- 不让评估脚本写入 `memory_events`、`student_profiles`、错题本、诊断运行或 localStorage。
- 不把 eval 结果写回 pgvector corpus 表，不改变 active row、embedding hash 或 metadata。
- 不新增登录、老师端、多用户、RLS 用户策略、多专题题库或练习作答判分。
- 不提交 `artifacts/**`、`.env*`、真实 provider key 或 `docs/reviews/*.md`。
- 不把 LLM judge 作为第一版质量来源；后续如需引入，需要单独设计 judge prompt、rubric、成本和稳定性。
- 不实现 `--strict` 或 CI 质量门禁；P2.10 第一版中 warn/fail case 只写入报告，不导致 CLI 失败。`--strict` 作为后续 CI 集成阶段单独设计。

## 5. 方案比较

### 方案 A：确定性离线 eval + ignored JSON 报告（推荐）

新增 eval case fixture 和 CLI。CLI 对每个 case 调用当前 variant practice 服务或同等 service 层函数，收集 retrieval source、候选、最终 product items 和质量指标，输出到 `artifacts/rag/evals/variant-practice-retrieval-quality/*.json`。

优点：

- 保持产品链路只读且不改变 UI。
- 指标稳定、可复跑，适合本地审查和面试讲解。
- 可以在无 Supabase/embedding provider 时运行 local-only 评估。
- 质量问题能被归因到 corpus、metadata、retrieval、slotting 或 fallback。

代价：

- 确定性指标不能完全替代老师人工判断。
- 如果题库很小，指标可能更多暴露 corpus 缺口，而不是算法优劣。
- 需要在报告中诚实说明“这是离线 smoke/eval，不是大规模推荐基准”。

### 方案 B：LLM-as-judge 自动打分

把每个 case 的题干、诊断摘要和推荐题发给 LLM，让模型按 rubric 打分。

优点：

- 可以评估更软的教学相关性，例如“迁移距离是否合适”。
- 报告更接近人工评审语言。

代价：

- 引入 provider 成本、稳定性和 prompt 漂移。
- judge 输出本身需要校验，可能掩盖 corpus/tag 的确定性问题。
- 当前第一版 eval 的核心问题是建立可复现测量，不适合先上模型 judge。

结论：不作为 P2.10 第一版，可作为后续 P2.11/P2.12 的补充。

### 方案 C：线上埋点和 A/B 实验

在产品 UI 中记录学生是否点击、完成或答对推荐练习，用真实行为评估推荐质量。

优点：

- 最接近真实学习效果。
- 可以长期优化推荐策略。

代价：

- 当前没有真实多用户、练习作答判分或行为数据链路。
- 会扩大数据采集和隐私边界。
- 不符合当前 demo-scoped 阶段。

结论：暂不采用。

## 6. Eval Cases

P2.10 第一版建议使用 4-6 个固定 eval cases，覆盖当前导数推荐的核心路径：

| case id | 诊断场景 | 主要知识点 | 错因信号 | 期望推荐方向 |
|---|---|---|---|---|
| `sample_derivative_parameter_classification` | 构造与默认样例题知识点/错因等价的诊断摘要，不依赖 `sample_diagnosis` 预写变式题 | `parameter_classification` | `classification_missing` / `boundary_omission` | 参数分类讨论、恒成立/能成立、范围边界 |
| `upload_derivative_monotonicity` | 上传题诊断为导数与单调性 | `derivative_monotonicity` | `range_boundary_omission` | 单调区间、导数符号、分类边界 |
| `upload_tangent_slope` | 题干包含切线/斜率/几何意义 | `derivative_monotonicity` 作为导数入口，题干文本触发 `tangent_slope` / `derivative_geometric_meaning` | `formula_misuse` | 导数几何意义、切线斜率、切线方程 |
| `upload_extrema_or_maximum` | 题干包含极值/最值 | `derivative_monotonicity` 作为导数入口，题干文本触发 `extrema` | `critical_point_missing` | 极值点、最值、端点比较 |
| `upload_problem_only_low_evidence` | 只有题干，学生步骤不足 | 导数专题但低证据 | 无具体错因写入 | 只评估练习推荐，不写画像；推荐不能声称具体学生错因 |
| `unsupported_non_derivative` | 非导数知识点 | 非导数 | 任意 | 返回 `variant_practice: null`；不进入 pgvector 或 local JSON 候选召回；前端保持 `diagnosis.practice_questions` fallback |

第一版不需要覆盖所有高中数学专题。更重要的是让每个 case 的输入、期望和结果都可解释。

Eval case fixture 应只包含最小诊断摘要：

```ts
interface VariantPracticeEvalCase {
  id: string;
  title: string;
  question_text: string;
  knowledge_points: string[];
  mistake_causes: string[];
  evidence_level: "student_work_sufficient" | "problem_only" | "insufficient";
  expected: {
    min_items: 0 | 3;
    required_target_skills: string[];
    preferred_method_tags: string[];
    forbidden_internal_fields: string[];
  };
}
```

`forbidden_internal_fields` 是防御性断言清单，用于捕获 product view model 意外放宽白名单的回归。测试重点仍应放在 eval artifact 与正式响应隔离，而不是重复证明已知 mapper 过滤逻辑。

字段命名可以按现有 JS fixture 风格调整，但不要携带图片 base64、完整诊断运行、学生身份或 provider payload。

## 7. 指标设计

### 7.1 Coverage

回答“能不能稳定给出推荐”：

- `requested_case_count`
- `case_count_by_source`
- `three_item_rate`
- `null_rate`
- `fallback_rate`
- `candidate_count_before_agent`
- `candidate_count_after_approved_filter`

最低验收不是“所有 case 都必须 3 道”。例如 `unsupported_non_derivative` 返回 null 是正确行为。

`fallback_rate` 只统计 `pgvector_attempted === true` 且最终 `retrieval_source === "local_json"` 的 case。`retrieval_source === null` 后前端继续展示 `diagnosis.practice_questions` 属于 display fallback，不计入 pgvector fallback。

### 7.2 Relevance

回答“推荐是否贴合诊断目标”：

- `knowledge_match_count`：最终题是否属于导数 corpus 或目标章节。
- `target_skill_match_count`：最终题的 `target_skills` 是否命中 eval case 期望技能。
- `mistake_cause_alignment_count`：最终题是否覆盖与错因相关的技能或方法标签。
- `section_alignment`：章节是否符合 query mapper 的确定性映射。
- `off_topic_flags`：题目是否偏离导数专题或目标能力。

第一版相关性不做 0-100 总分。建议输出明细和简单等级：

```text
pass: 命中必需技能，且无明显偏题
warn: 能给 3 道题，但目标技能覆盖不足或重复
fail: 候选不足、偏题、错误 fallback 或不该推荐却推荐
```

#### 7.2.1 判定规则

第一版必须使用确定性判定，避免实现者按主观感受打分：

- `knowledge_match_count`：最终题中 `knowledge_points` 包含 `derivative` 的题数；后续多专题时再扩展为章节白名单匹配。
- `target_skill_match_count`：对每道最终题，取 `target_skills ∪ method_tags`，与 eval case `expected.required_target_skills` 求交集；命中至少一个计 1。
- `mistake_cause_alignment_count`：将 eval case `mistake_causes` 按预定义映射表转成方法标签集合，再与最终题 `method_tags` 求交集；命中至少一个计 1。
- `off_topic_flags`：任意最终题 `knowledge_points` 不含 `derivative`，或章节不在导数章节白名单时触发。
- `pass`：命中必需技能且无 `off_topic_flags`；对导数 case，`product_item_count === 3` 且 `target_skill_match_count >= 2`。
- `warn`：返回 3 题，但目标技能覆盖不足、`unique_item_count < 3` 或推荐类型层次单一。
- `fail`：返回数量不足、触发 `off_topic_flags`，或非导数 case 却返回 RAG 结果。

第一版错因到方法标签的映射应放在 eval core 中作为显式常量，例如 `classification_missing -> ["parameter_range"]`、`boundary_omission -> ["parameter_range", "monotonicity"]`。不要让 LLM 或自由文本解释决定 alignment。

### 7.3 Diversity

回答“3 道题是否有层次，而不是重复题”：

- `unique_item_count`
- `unique_section_count`
- `unique_target_skill_count`
- `recommendation_type_coverage`

P2.10 只要求检查重复和基本层次，不要求复杂个性化难度曲线。

### 7.4 Safety Boundary

回答“评估和正式响应是否守住边界”：

- 正式 `ProductVariantPractice` 不包含 `retrieval_source`、`score`、`item_id`、`source_ref`、`cosine_distance`、`embedding_hash`。
- eval artifact 可以包含内部字段，但路径必须在 `artifacts/rag/evals/**`。
- eval 不写 `memory_events`、`student_profiles`、`diagnosis_runs`、`mistake_book_items` 或 localStorage。
- 低证据 `problem_only` case 的推荐说明不能声称“学生已犯某具体错因”，只能作为练习方向。

### 7.5 Failure Attribution

当某个 case 为 `warn` 或 `fail`，报告应给出至少一个原因：

| reason | 含义 | 后续动作 |
|---|---|---|
| `corpus_gap` | 题库中缺少足够相关 approved 题 | P2.11a 补题或补审核 |
| `metadata_gap` | 候选题存在但标签缺失/不准 | P2.11a 修 enriched corpus 标签 |
| `vector_too_broad` | pgvector 候选语义泛，标签约束后质量不足 | P2.11b 加强 hybrid filter/rerank |
| `agent_slotting_gap` | 候选中有好题，但最终 3 题没选中 | P2.11b 调整 Agent slotting |
| `fallback_triggered` | pgvector 不可用或不足 3 道，走 local fallback | 检查环境、RPC、provider、candidate count |
| `unsupported_scope` | 输入超出导数专题 | 返回 null；前端 fallback 不计作 RAG retrieval |

## 8. 报告 Artifact

建议输出：

```text
artifacts/rag/evals/variant-practice-retrieval-quality/
  latest.json
  2026-07-01T00-00-00.json
```

`latest.json` 方便本地查看，timestamp 文件方便比较不同策略。

写入顺序必须避免半成品报告：

1. 先构建报告对象，并用 runtime schema/guard 校验。
2. 先写入 timestamp 文件，例如 `2026-07-01T00-00-00.json`。
3. timestamp 文件写入且校验通过后，再用临时文件 + rename 原子替换 `latest.json`。
4. 写入失败时 CLI 返回 exit code 1，不保留半成品 `latest.json`。
5. 可选 `--no-latest` 参数只生成 timestamp 文件，避免覆盖。

报告 schema 建议放在 `scripts/rag/variant-practice-eval-report-schema.mjs`。如果项目实现时已有 Zod 可直接复用，可用 Zod；否则使用与现有 RAG 脚本一致的显式 runtime guard。CLI 写入前必须校验报告对象，schema 测试覆盖合法/非法输入。

报告顶层建议：

```json
{
  "eval_version": "variant-practice-retrieval-quality-v0",
  "generated_at": "2026-07-01T00:00:00.000Z",
  "mode": "local_only | pgvector_preferred",
  "corpus_version": "enriched-practice-corpus-v0",
  "case_count": 6,
  "summary": {
    "pass": 0,
    "warn": 0,
    "fail": 0,
    "three_item_rate": 0,
    "fallback_rate": 0
  },
  "cases": []
}
```

单个 case 建议：

```json
{
  "case_id": "upload_derivative_monotonicity",
  "status": "pass | warn | fail",
  "retrieval_source": "pgvector | local_json | null",
  "display_source": "variant_practice_api | diagnosis_practice_questions | none",
  "pgvector_attempted": false,
  "candidate_count": 12,
  "product_item_count": 3,
  "metrics": {
    "required_target_skill_matches": 2,
    "unique_item_count": 3,
    "recommendation_type_coverage": ["foundation", "near_transfer", "additional_practice"]
  },
  "findings": [
    {
      "severity": "info | warn | fail",
      "reason": "metadata_gap",
      "message": "候选题足够，但 method_tags 覆盖不足。"
    }
  ]
}
```

报告可以包含 `debug` 段，但必须避免写入 API key、完整图片内容或敏感学生数据。debug 段如需包含题干，仅保留前 200 个 Unicode 字符的截断文本；不写入完整学生答案、图片 base64、上传原图路径或本地临时图片路径。

## 9. 模块边界

建议后续实现保持三层：

```text
scripts/fixtures/rag/variant-practice-eval-cases.mjs
  -> 固定 eval cases

scripts/rag/evaluate-variant-practice-retrieval-core.mjs
  -> 纯函数：运行 case、计算指标、生成报告对象

scripts/rag/evaluate-variant-practice-retrieval.mjs
  -> CLI：读取 env/参数、调用 core、写 artifacts/rag/evals/**
```

为了在不破坏正式响应契约的前提下获取 `retrieval_source` 与候选计数，P2.10 建议新增 eval-only 服务函数：

```ts
handleDynamicVariantPracticeEvalRequest(input, deps): Promise<{
  retrieval_source: "pgvector" | "local_json" | null;
  pgvector_attempted: boolean;
  candidate_count_before_agent: number;
  candidate_count_after_approved_filter: number;
  candidate_items_after_filter: Array<{
    id: string;
    source_candidate_id: string;
    knowledge_points: string[];
    section_title?: string | null;
    target_skills?: string[];
    method_tags?: string[];
  }>;
  selected_candidate_items: Array<{
    id: string;
    source_candidate_id: string;
    knowledge_points: string[];
    section_title?: string | null;
    target_skills?: string[];
    method_tags?: string[];
  }>;
  product_view_model: ProductVariantPractice | null;
}>
```

正式 `handleDynamicVariantPracticeRequest` 继续只返回 `{ variant_practice: ProductVariantPractice | null }`，不得为了 eval 增加 debug 字段。eval-only 函数应复用当前 P2.9 source order、fallback 和 `buildVariantPracticeFromCorpus` 编排；如果 source 依赖通过注入替换，source 函数返回的 corpus 需要附带 source tag，便于 eval core 统一计数。

`candidate_items_after_filter` 只包含通过 approved / `needs_visual` / scope 过滤、进入 Agent 前的候选元数据，用于判断 `agent_slotting_gap` 等归因；`selected_candidate_items` 只包含最终进入 `ProductVariantPractice.items` 的候选元数据，最多 3 条，顺序与 product items 对齐。两者只写入 eval artifact，不进入正式 API 响应。相关性指标必须基于最终 3 题元数据计算，不基于全部候选，也不依赖前端展示字段。

候选计数口径：

- `candidate_count_before_agent`：source 返回并通过 corpus schema 的候选题数量。
- `candidate_count_after_approved_filter`：进入 Agent 前，经过 approved / `needs_visual` / scope 过滤后的候选题数量。
- Agent 内部如果后续新增额外过滤，必须在 eval report 中新增独立字段，不要复用上述两个计数。

实现时应避免：

- 在 CLI 中直接拼 SQL 或直接访问 Supabase 表。
- 在 route handler 中加入 eval-only 逻辑。
- 把 eval-only debug 字段加入 `ProductVariantPractice`。
- 让前端组件读取 eval artifact。

## 10. CLI 设计

建议命令：

```bash
node scripts/rag/evaluate-variant-practice-retrieval.mjs --local-only
node --env-file=.env.local scripts/rag/evaluate-variant-practice-retrieval.mjs --pgvector-preferred
```

参数：

- `--local-only`：只用本地 enriched corpus，适合无 Supabase/embedding provider 的稳定测试。
- `--pgvector-preferred`：优先走 pgvector，失败时按 P2.9 路径回退 local JSON。
- `--output <path>`：可选，默认写入 `artifacts/rag/evals/variant-practice-retrieval-quality/`。
- `--case <case_id>`：可选，只跑单个 case，便于调试。
- `--no-latest`：可选，只写 timestamp 报告，不更新 `latest.json`。

第一版不需要 `--apply`，因为 eval 不写数据库。

注意：`--pgvector-preferred` 会真实调用 `RAG_EMBEDDING_PROVIDER_*` 并请求 Supabase match RPC，运行前请确认配置与成本预期；CI 或日常回归建议使用 `--local-only`。

## 11. 错误处理

CLI 退出码建议：

| 场景 | exit code | 行为 |
|---|---:|---|
| eval 成功生成报告，即使有 warn/fail case | 0 | 报告记录质量问题 |
| fixture 非法、输出路径不可写、报告 schema 非法 | 1 | stderr 输出错误 |
| `--pgvector-preferred` 下 provider/Supabase 不可用但 local fallback 成功 | 0 | 报告记录 `fallback_triggered` |
| `--case` 指定不存在 case | 1 | stderr 输出明确 case id |

质量 `warn/fail` 不应让 CLI 失败。P2.10 的目的不是在第一天强制质量门禁，而是先把质量问题量化出来。P2.10 不实现 `--strict`；未来如果要把 eval 加入 CI，再单独设计 strict mode 和门禁阈值。

## 12. 测试策略

后续实现至少需要：

- eval case fixture schema/guard 测试。
- core metrics 测试：3 items、0 items、重复题、目标技能命中、fallback source、internal field leak。
- CLI 测试：`--local-only` 写报告到临时目录；非法 case id 返回 exit code 1。
- service boundary 测试：eval 不调用画像、错题本或 persistence 写入模块。
- 报告 schema 测试：`eval_version`、`summary`、`cases`、`findings` 结构稳定。
- source/debug 测试：eval-only service 能返回 `retrieval_source`、`candidate_count_before_agent`、`candidate_count_after_approved_filter`，正式 response 不新增这些字段。
- 写入原子性测试：先写 timestamp，再替换 `latest.json`；写入失败不留下半成品 latest。
- 持久化边界测试：断言 eval 只调用 pgvector 只读 `matchItems` 路径，不调用 `upsertItems`、`deactivateMissingItems` 或任何 corpus sync 写入。
- import 边界测试：断言 eval CLI/core 不 import `student-profile-persistence`、`diagnosis-persistence`、`mistake-book-persistence`。
- 输出路径测试：断言 eval 输出目录不能是 `src/`、`app/`、`public/` 或 localStorage 相关路径。

不要求在默认 `npm test` 中跑真实 pgvector provider。真实 provider smoke 可以作为手动验证：

```bash
node --env-file=.env.local scripts/rag/evaluate-variant-practice-retrieval.mjs --pgvector-preferred
```

## 13. 文档与面试叙事

P2.10 实现完成后需要同步检查：

- PRD：补充 P2.10 是“离线评估与量化”，不改变正式推荐 API 和画像边界。
- Roadmap：补充 RAG 推荐质量评估阶段，说明它用于定位 corpus/tag/retrieval/Agent 问题。
- `interview/mathtrace-project-narrative.md`：新增或扩展 P2.10 阶段，重点讲“不是只接上 pgvector，而是能评估 Agent 推荐质量”。

如果 P2.10 只写 spec，不实现，则暂不更新 PRD/Roadmap/面试文档，避免文档声明超过实际状态。

## 14. 后续分支

如果 P2.10 发现质量不足，后续不应直接混在 P2.10 里修。建议按归因拆成小阶段：

- P2.11a：补充或修正 enriched corpus 标签。
- P2.11b：增加 pgvector + metadata hybrid rerank。
- P2.11c：增加推荐质量 guardrail，候选不足或偏离时 fallback。
- P2.12：如有必要，引入 LLM-as-judge 辅助人工评估，但不替代确定性指标。

## 15. 验收清单

P2.10 实现完成后必须满足：

- 本地可以运行固定 eval cases 并生成 ignored JSON 报告。
- local-only 模式不依赖 Supabase、embedding provider 或网络。
- pgvector-preferred 模式能在 provider 不可用时记录 fallback，而不是破坏报告生成。
- 报告能说明每个 case 的 source、item count、主要指标和质量归因。
- 正式 `POST /api/variant-practice` 响应不新增 debug 字段。
- RAG/pgvector 仍不写 `memory_events`、`student_profiles`、错题本、诊断运行或 localStorage。
- `sample_diagnosis` 和现有 P2.7/P2.9 fallback 行为不回归。

## 16. 当前 spec 的边界

本 spec 只定义 P2.10 评估设计，不实现 CLI、fixture、测试或报告生成。下一步应先写 implementation plan，再按计划实现。
