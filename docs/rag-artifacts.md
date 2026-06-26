# MathTrace RAG 本地 Artifacts 说明

`artifacts/rag` 是本地生成目录，已被 `.gitignore` 忽略，不进入 Git。它保存 P2.0-P2.7 的 PDF/MinerU 解析、人工审核、题库生成、标签建议、标签审核和变式练习推荐产物。

## 核心原则

- 不提交 `artifacts/**`。
- 不把真实 PDF、MinerU JSON、题库 artifact 或推荐结果放进 Git。
- 不删除人工审核成果，除非已经有明确备份。
- 可再生成的中间产物可以归档或重建，但要先 dry-run。
- 产品页当前只读取 `artifacts/rag/variant-practice-agent/recommendations.json`，缺失时会回退到预写练习题。
- P2.7 动态变式练习 API 运行时读取 `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`，只消费已通过标签审核的题；产品页默认样例题仍可读取 `artifacts/rag/variant-practice-agent/recommendations.json`。

## 文件夹说明

| 路径 | 中文说明 | 类型 | 是否可再生成 | 处理策略 |
|---|---|---|---|---|
| `MinerU-test/导数专题.json` | MinerU 精准解析出的原始导数专题 JSON | 原始解析结果 | 需要重新上传/导出 | 可归档 |
| `reviewed_practice_seed.json` | 人工审核并修正后的题库种子 | 人工审核成果 | 不应依赖重新人工生成 | 保留 |
| `practice-corpus/practice_corpus.json` | 从人工审核种子转换出的练习题库 | 活跃题库产物 | 可由 seed 再生成 | 保留 |
| `enriched-practice-corpus/enriched_practice_corpus.json` | 带标签增强题库，供 Agent 检索 | 活跃题库产物 | 可由 corpus + review records 再生成 | 保留 |
| `variant-practice-agent/recommendations.json` | 当前产品页读取的 3 道变式练习推荐 | 活跃推荐产物 | 可由 enriched corpus + demo query 再生成 | 保留 |
| `variant-practice-agent/demo-query.json` | 当前推荐结果的 demo 查询输入 | 活跃推荐输入 | 可人工重建但不建议丢失 | 保留 |
| `candidate-review/index.html` | 候选题题干审核静态页 | 本地审核 UI | 可再生成 | 可归档 |
| `tag-review/index.html` | 标签审核静态页 | 本地审核 UI | 可再生成 | 可归档 |
| `tag-proposals/*` | 规则标签建议 | 可再生成中间产物 | 可再生成 | 可归档 |
| `ai-tag-proposals/*` | AI 标签建议 | 可再生成中间产物 | 需要 provider 配置 | 可归档 |
| `tag-review/auto_tag_review_records.json` | 自动通过的标签审核记录 | 审核证据 | 可由 proposals 再生成，但依赖当时规则 | 可归档 |
| `tag-review/tag_review_queue.json` | 需要人工复核的标签队列 | 审核证据 | 可再生成，但可能随规则变化 | 可归档 |
| `mineru-candidate-mapper/*` | MinerU JSON 抽题中间产物 | 可再生成中间产物 | 可由 MinerU JSON 再生成 | 可归档 |
| `_manifest/*` | 本地 artifact inventory（清单元数据） | 整理元数据 | 可再生成 | 保留 |
| `_archive/*` | 已归档的历史 artifact | 历史归档 | 可手动恢复 | 保留 |
| `derivative-pdf-spike/*` | 早期 OCR spike 产物 | 历史实验产物 | 已被 MinerU 路径替代 | 可归档 |
| `**/.DS_Store` | macOS Finder 元数据 | 系统垃圾文件 | 无需保留 | 可删除 |

## 推荐整理方式

1. 先运行 `node scripts/rag/audit-rag-artifacts.mjs` 生成 inventory（清单）。
2. 再运行 `node scripts/rag/organize-rag-artifacts.mjs --dry-run` 查看将要清理的内容。当前默认策略是 demo-minimal：只保留核心题库和推荐文件，其余中间产物归档到 `_archive/demo-minimal`。
3. apply 前建议先备份 `artifacts/rag`，至少把 `artifacts/rag/derivative-pdf-spike` 复制一份到本地安全位置。
4. 确认无误后再运行 `node scripts/rag/organize-rag-artifacts.mjs --apply --confirm organize-rag-artifacts`。
5. 清理后重新跑 P2.5 product view model smoke，确认产品页仍能显示 3 道推荐题。
