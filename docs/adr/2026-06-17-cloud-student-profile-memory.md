# ADR: 云端学生画像记忆投影

## 状态

P1.8 设计阶段采纳。

## 背景

MathTrace P1.7 已经把确认后的 `diagnosis_runs`、`mistake_book_items` 和 `memory_events` 写入 Supabase Postgres。这证明系统已经有可审计的学习事实，但当前页面仍主要依赖 localStorage 恢复当前 `student_profile`。

P1.8 需要补齐云端当前画像，让页面刷新和后续诊断可以恢复学生最新的结构化长期记忆。该设计必须保持当前 demo 边界：

- 只支持 `demo_student_001`。
- 不做登录、RLS 用户策略、老师端、RAG、pgvector、Milvus、Storage 或 external memory provider。
- 不让模型生成内容直接写画像。
- localStorage 继续作为 demo fallback。

## 决策

采用组合模型：

```text
memory_events     = 画像变化的可解释事件历史
student_profiles  = 由 memory_events 投影出的当前读模型
```

`student_profiles.profile` 不直接保存 pipeline 返回的快照。每当新的非重复 `memory_event` 持久化成功，或错题删除导致事件减少时，服务端都从 `demoStudentProfile` 起始，按 `created_at asc, id asc` 顺序折叠当前 `memory_events`，生成新的当前画像：

```text
student_profiles.profile = fold(demoStudentProfile, memory_events ordered by created_at asc, id asc)
```

投影过程复用现有 TypeScript `applyMemoryDeltaToProfile` 和 `isStudentProfile`。数据库负责存储事实、约束和权限边界，不在 trigger 中重写画像合并规则。

## 备选方案

### 纯事件溯源

只保存 `memory_events`，每次读取时重建画像。

不采用。P1.8 的页面启动需要快速读取一个小的当前画像，现有前端也围绕 `StudentProfile` 对象工作。每次读取都重放事件会让 demo 阶段的 fallback 和错误处理变复杂。

### 只保存快照

只保存 `student_profiles.profile`，每次诊断后覆盖。

不采用。教育画像必须可解释。如果只有最新分数，没有事件历史，系统无法回答为什么掌握度下降、是哪一次诊断导致变化、删除错题后应该如何恢复画像。

### 直接保存 pipeline 快照

诊断成功后，直接把 `response.student_profile` 保存到 `student_profiles`。

不采用。`response.student_profile` 是基于请求传入的 `student_profile` 计算出来的，而该输入可能来自 localStorage。localStorage 可能包含云端 `memory_events` 中不存在的历史变化。直接保存会让云端快照偏离事件历史，尤其在删除错题并重建画像后暴露不一致。

### 快照基线元数据

在 `student_profiles` 中增加 `baseline_profile` 或 `baseline_event_id`，记录快照从哪个基线折叠而来。

不采用。这个方案可以保持快速写入，但会引入额外元数据和生命周期管理。P1.8 仍是单学生 MVP，直接重放当前事件更简单。

## 影响

收益：

- `student_profiles.profile` 总能由当前 `memory_events` 解释。
- 诊断写入和错题删除使用同一条投影规则。
- 删除错题本条目后，可以基于剩余事件重建当前画像，不需要额外 lineage 字段。
- 未来 RAG 或 pgvector 可以把 `student_profiles` 当作结构化事实层，把 `memory_events` 当作解释历史。

代价：

- 每次成功写入后，需要读取并折叠当前 `memory_events`。
- 可能出现半成功状态：诊断或删除已经成功，但云端画像投影失败，只能返回 warning。
- 如果历史事件数据损坏，投影应显式失败，不应静默跳过事件。

这些代价在 P1.8 可接受，因为当前仍是单学生 demo，画像正确性和可解释性比写入路径微优化更重要。

该方案依赖 P1.8 单学生 demo 的事件规模。后续进入真实多用户或长历史阶段时，需要重新评估增量投影、快照基线或后台修复任务，而不应默认把全量重放当成长期高规模方案。

## 实现约束

- `event_count` 表示最新画像实际折叠的当前 `memory_events` 数量。
- `last_memory_event_id` 指向本次投影纳入的最后一个事件。
- `student_profiles.grade` 必须和投影后的 `profile.grade` 一致。
- `GET /api/student-profile` 返回 `profile: StudentProfile | null`；fallback 响应不能覆盖 localStorage。
- P1.8 不实现通用纠错或修复入口。只有诊断持久化和错题删除会触发画像投影。
