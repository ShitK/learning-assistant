# ADR: pgvector-backed Variant Practice Retrieval

## 状态

P2.9 实现阶段采纳。

## 背景

P2.7 已经让确认后的上传题诊断通过 `/api/variant-practice` 从本地 enriched corpus 返回真实题库中的 3 道变式练习。该路径仍依赖 ignored JSON artifact。P2.9 需要把运行时候选召回推进到服务端 PostgreSQL + pgvector，同时保持 MathTrace 的演示稳定性和画像事实层边界。

## 决策

采用“pgvector 候选源 + 本地 JSON fallback”：

- 本地 CLI 将审核通过的 `enriched-practice-corpus-v0` 导数题同步到 `variant_practice_corpus_items`。
- 运行时 `/api/variant-practice` 优先用 query embedding 和 pgvector RPC 召回候选题。
- 召回候选仍交给现有 Variant Practice Agent 和 `ProductVariantPractice` mapper。
- pgvector 不可用、embedding provider 失败、RPC 超时或候选不足时，回退到 P2.7 本地 JSON corpus。

## 备选方案

### pgvector-only

不采用。它会让 Supabase、migration、embedding provider 或 RPC 失败直接破坏动态练习推荐，不符合当前 demo 稳定优先。

### Milvus

不采用。当前 corpus 很小，Supabase/Postgres 已经存在，pgvector 可以在同一个数据库体系中验证产品价值；Milvus 留到大规模多机构 RAG 阶段。

### RAG 写入学生画像

不采用。RAG 是题源检索层，不是学生事实层。学生画像继续由确认后的 `memory_events` 投影成 `student_profiles`。

## 影响

收益：

- 动态练习候选召回从本地文件推进到在线数据库检索。
- 继续保留已验证的本地 fallback，演示稳定。
- 复用现有 API、Agent 和产品展示模型，避免重写前端。

代价：

- 运行时 pgvector 路径需要一次 query embedding 调用。
- 需要维护本地同步 CLI 和 embedding provider 配置。
- 第一版固定 1536 维 embedding，未来更换模型需要 migration/spec 评估。

## 实现约束

- `variant_practice_corpus_items` 不存学生数据。
- Runtime RAG 不写 `memory_events`、`student_profiles`、错题本、诊断运行或 localStorage。
- `SUPABASE_SERVICE_ROLE_KEY` 和 `RAG_EMBEDDING_PROVIDER_API_KEY` 只在服务端读取。
- 正式响应不返回 cosine distance、metadata score、embedding hash、source ref 或内部 item id。
