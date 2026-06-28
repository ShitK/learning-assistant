# P1.8 云端学生画像记忆系统 MVP Design Spec

## 1. 背景

MathTrace 的核心卖点是“越用越懂你”的长期学习画像。P1.7 已经把确认后的诊断运行、错题本条目和画像变化事件写入 Supabase Postgres，但当前仍缺少云端“当前学生画像”恢复闭环：

```text
P1.7 已有：
诊断确认 -> diagnosis_runs / mistake_book_items / memory_events

P1.8 要补齐：
memory_events -> student_profiles 当前快照 -> 页面启动可恢复
```

当前页面仍主要依赖 localStorage 恢复 demo 画像。P1.8 的目标不是替换全部 demo fallback，而是让 Postgres 开始承担“当前长期画像”的事实层，并保持无数据库配置时演示路径稳定。

## 2. 设计目标

P1.8 将 MathTrace 的长期记忆从“已保存画像变化事件”推进到“可从云端恢复当前学生画像”。

具体目标：

- 新增云端 `student_profiles` 当前画像快照。
- 每次允许持久化且非重复的诊断写入后，基于当前 `memory_events` 重放生成 `student_profiles`。
- 页面启动时优先尝试读取云端画像；云端不可用时继续使用 localStorage / mock fallback。
- 删除错题本条目后，基于剩余 `memory_events` 重建云端画像，避免当前快照和解释事件长期分裂。
- 保持 `sample_diagnosis` 稳定路径：数据库未配置、读取失败或写入失败时，诊断报告仍正常返回。
- 复用现有 `StudentProfile` 运行时校验和 `applyMemoryDeltaToProfile` 合并口径，不引入第二套画像规则。
- 保证 `student_profiles.profile` 可以由当前 `memory_events` 从空历史 `demoStudentProfile` 重放得到。

## 3. 明确不做

P1.8 不做以下内容：

- 不做登录、真实多用户、老师端、家长端或 RLS 用户策略。
- 不做 RAG、pgvector、Milvus 或 external memory provider。
- 不存完整图片 base64，不引入 Supabase Storage。
- 不做练习完成后的画像回升规则，不新增 `practice_attempts`。
- 不做通用纠错入口或人工回滚工具；P1.8 只有诊断持久化和错题删除会触发画像投影。
- 不让视觉模型、文本分析模型或通用 Agent 直接写 `memory_delta` 或覆盖 `student_profile`。
- 不移除 localStorage；它继续作为 demo fallback。
- 不把学生画像改写成自然语言 Markdown 记忆。

## 4. 参考原则

P1.8 可以参考通用 Agent memory 系统，但只吸收原则，不照搬实现。

### 4.1 Hermes Agent 的参考意义

NousResearch Hermes Agent 的 memory 设计把 persistent memory、session search 和 memory provider 分开。对 MathTrace 有三点启发：

- 常驻记忆应该短而关键：`student_profiles` 只保存当前聚合画像，不塞入完整历史诊断。
- 记忆写入需要门控：只有通过服务端证据策略的 `memory_delta` 才能进入长期画像。
- 内置事实层和检索增强分离：未来 RAG / pgvector / Milvus 只能作为相似内容召回层，不能替代 Postgres 结构化事实。

参考链接：

- https://hermes-agent.nousresearch.com/docs/user-guide/features/memory
- https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers

### 4.2 OpenClaw 的参考意义

OpenClaw 更适合作为“本地优先、可检查、可维护上下文”的参考。它对 MathTrace 的启发是：

- 记忆和上下文应该可以被人检查、迁移和纠正。
- 外部输入要按不可信输入处理，远程渠道和工具调用需要安全门控。
- session history 可以作为按需历史层，但不应混入当前常驻画像。

参考链接：

- https://github.com/openclaw/openclaw

### 4.3 MathTrace 的落地边界

MathTrace 的记忆不是通用 Agent 自由文本记忆，而是教育场景的结构化学习画像：

```text
student_profiles = 当前关键画像
memory_events = 可解释画像变化历史
diagnosis_runs = 完整诊断审计历史
future RAG / pgvector = 按需相似错题召回
```

## 5. 当前基础

当前 repo 已具备 P1.8 所需基础：

- `students`：固定 demo 学生 `demo_student_001`。
- `diagnosis_runs`：保存一次诊断运行快照。
- `mistake_book_items`：保存错题本条目，已支持题目级去重和删除。
- `memory_events`：保存画像变化事件，包括掌握度变化、错因频次变化、复习优先级变化和 rationale。
- `src/lib/shared/student-profile.ts`：统一 `StudentProfile` guard 和 `applyMemoryDeltaToProfile`。
- `src/lib/demo/demo-state.ts`：localStorage demo 画像恢复和损坏兜底。
- `/api/diagnose` 和 `/api/confirm`：确认后才进入诊断和持久化路径。
- `/api/mistake-book`：错题本读取和删除保持服务端收口。

P1.8 不需要改变诊断 pipeline，只需要在持久化边界补齐画像快照读写。

## 6. 核心设计

### 6.1 采用“事件 + 当前快照”组合模型

推荐方案是 `memory_events` 和 `student_profiles` 组合：

- `memory_events` 是解释源，回答“为什么画像变了”。
- `student_profiles` 是当前读模型，回答“学生现在的画像是什么”。

不选择纯事件溯源作为 P1.8 唯一路径，因为页面启动时每次重放所有事件会增加实现和读取复杂度。不选择只存快照，因为删除错题后，快照会缺少可解释依据。

组合模型的取舍：

```text
正常读取：读 student_profiles，快而稳定。
解释追溯：查 memory_events，知道每次变化依据。
写入投影：用当前 memory_events 重放生成 student_profiles。
```

### 6.2 `student_profiles` 是当前快照，不是历史表

P1.8 新增一张 `student_profiles` 表：

```text
student_profiles
  student_id text primary key references students(id) on delete cascade
  subject text not null default 'math'
  grade text not null
  profile jsonb not null
  profile_version integer not null default 1
  event_count integer not null default 0
  last_memory_event_id uuid null references memory_events(id) on delete set null
  created_at timestamptz not null default now()
  updated_at timestamptz not null default now()
```

字段说明：

- `student_id`：P1.8 仍只允许 `demo_student_001`。
- `profile`：完整 `StudentProfile` JSON，用现有 shared guard 校验后才返回给前端。
- `grade`：与 `profile.grade` 保持一致；实现时以重放后生成的 `profile.grade` 为准。
- `profile_version`：当前固定为 `1`，用于后续 schema 演进。
- `event_count`：当前快照实际聚合的 `memory_events` 数量。诊断写入和删除重建后都重新计算，不表示历史累计写入总数。
- `last_memory_event_id`：记录最后一次纳入快照的事件，便于排查写入链路。

P1.8 不拆分 `mastery_scores`、`frequent_mistake_causes` 等字段为关系列。当前消费者已经围绕 `StudentProfile` JSON 工作，提前拆列会增加同步成本，收益不足。

### 6.3 云端画像只接受通过证据门控的增量

P1.8 延续当前持久化策略：

- `sample_diagnosis`：作为 demo 自动确认路径，可按现有规则写入。
- `confirmed_image_diagnosis`：必须经过 `/api/confirm`。
- `student_work`、`user_confirmed`、允许的 `uploaded_problem_only` / `problem_type_focus` 才能写入。
- `insufficient`、token mismatch、未确认 OCR 草稿、模型展示增强文本不得写入云端画像。
- 题目重复时不新增 `memory_events`，也不更新 `student_profiles`。

文本分析 provider 可以增强展示文本，但不能决定 `memory_delta`、`profile_update_kind` 或画像合并。

### 6.4 云端读取优先，localStorage 兜底

页面启动时的恢复策略：

```text
1. 首屏先用 localStorage / mock，保证 demo 不等待数据库。
2. 异步请求 GET /api/student-profile?student_id=demo_student_001。
3. 服务端读取 student_profiles.profile。
4. 服务端用 shared StudentProfile guard 校验。
5. 合法则返回云端 profile，前端覆盖 session profile 并同步写入 localStorage。
6. 未配置、无记录、读取失败或结构非法，则返回 warning，前端保留 localStorage / mock。
```

这个策略让云端画像成为优先事实来源，同时保留 demo 稳定性。

### 6.5 删除错题后重建画像

P1.7 删除错题本条目时会级联删除关联 `memory_events`，但 `diagnosis_runs` 保留。P1.8 需要在删除成功后重建 `student_profiles`：

```text
DELETE /api/mistake-book
-> 删除 mistake_book_items
-> 关联 memory_events 级联删除
-> 服务端读取该学生剩余 memory_events，按 created_at asc, id asc 重放
-> 从空历史 demoStudentProfile 起始，用 applyMemoryDeltaToProfile 逐条合并
-> upsert student_profiles
```

如果重建失败，删除结果仍返回成功，但响应附加 profile sync warning，并保留删除前的 `student_profiles` 快照。P1.8 不静默跳过损坏事件，因为跳过会让画像解释链断裂；后续可通过重新触发投影或人工处理异常事件来恢复。

### 6.6 不用数据库 trigger 实现画像合并

P1.8 不建议在 Postgres trigger 中实现画像合并。原因：

- 画像合并规则已经在 TypeScript shared helper 中存在。
- 再用 SQL/PLpgSQL 写一套规则会制造口径漂移。
- 当前 demo 只支持单学生，服务端应用层重建足够简单。

数据库只负责存储、约束和 RPC 原子写入；画像合并继续由 TypeScript 规则控制。

### 6.7 统一用事件重放生成当前快照

P1.8 的云端画像以 `memory_events` 为唯一可解释事实来源。正常诊断写入、删除错题后的重建，都使用同一个投影规则：

```text
student_profiles.profile = fold(demoStudentProfile, current memory_events ordered by created_at asc, id asc)
```

这里的 `demoStudentProfile` 是空历史基线：保留 `demo_student_001`、年级、学科和时间字段，但不预置 `mastery_scores`、`frequent_mistake_causes`、`review_priority` 或 `gaokao_focus`。`weak_modules`、`recent_trend`、`gaokao_focus` 当前不由 `applyMemoryDeltaToProfile()` 派生，空基线和事件投影后保持空值；画像洞察 UI 从 `mastery_scores`、`frequent_mistake_causes`、`review_priority` 和本次诊断 delta 展示复习优先级。

正常诊断路径仍会返回 pipeline 生成的 `response.student_profile`，用于本次报告展示和 localStorage fallback；但云端 `student_profiles` 不直接保存该快照。原因是请求中的 `student_profile` 可能来自 localStorage，localStorage 可能包含 P1.7 之前或数据库不可用期间的本地变化，未必能由云端 `memory_events` 解释。

P1.8 的云端写入策略：

```text
RPC 返回 persisted
-> 服务端读取该学生当前所有 memory_events
-> 从空历史 demoStudentProfile 起始按 created_at asc, id asc 重放
-> 用 isStudentProfile 校验重放结果
-> 合法：upsert student_profiles.profile = 重放结果
-> 非法：视为 projection failure，不 upsert，返回 warning，保留旧快照
-> event_count = 实际重放的 memory_events 数量
-> last_memory_event_id = 最后一条纳入重放的 memory_event_id
```

这个设计牺牲了一点写入路径上的读取成本，但 P1.8 仍固定单学生 demo，事件数量很小。收益是快照和事件历史始终可以互相解释，删除错题后也不会出现另一套重建口径。

## 7. 推荐数据流

### 7.1 诊断后写入

```text
/api/diagnose 或 /api/confirm
-> 确定性 pipeline 生成诊断报告
-> response.memory_delta.should_persist 判断
-> persistDiagnosisIfNeeded
-> Supabase RPC 写 diagnosis_runs / mistake_book_items / memory_events
-> RPC 返回 persisted / duplicate / disabled / failed
-> persisted：读取当前 memory_events，重放生成 student_profiles
-> duplicate：不更新 student_profiles
-> disabled/failed：返回 warning，不阻塞诊断报告
```

### 7.2 页面启动读取

```text
MathTraceWorkbench mount
-> readStoredStudentProfile(localStorage)
-> render fallback profile
-> fetch /api/student-profile
-> valid cloud profile: setSessionStudentProfile + writeStoredStudentProfile
-> unavailable/invalid cloud profile: keep fallback profile
```

### 7.3 错题删除重建

```text
DELETE /api/mistake-book
-> validate student_id and item_id
-> delete mistake_book_items
-> rebuild profile from remaining memory_events
-> response includes profile_sync_status
```

`profile_sync_status` 建议使用：

```text
synced
skipped_database_not_configured
failed
```

## 8. API 设计

### 8.1 `GET /api/student-profile`

请求：

```text
GET /api/student-profile?student_id=demo_student_001
```

成功响应：

```json
{
  "student_id": "demo_student_001",
  "profile": {},
  "is_database_configured": true,
  "source": "cloud",
  "warnings": []
}
```

降级响应：

```json
{
  "student_id": "demo_student_001",
  "profile": null,
  "is_database_configured": false,
  "source": "fallback",
  "warnings": ["数据库暂未配置，继续使用本地 demo 画像。"]
}
```

边界：

- 响应类型为 `profile: StudentProfile | null`。
- 只允许 `student_id=demo_student_001`。
- 不返回 `memory_events` 明细。
- 不暴露 Supabase error 原文、service role key 或 SQL 细节。
- `profile` 必须通过 `isStudentProfile` 后才能返回。
- 当前端收到 `source="fallback"` 或 `profile=null` 时，不覆盖 localStorage。

### 8.2 现有诊断 API 的响应变化

P1.8 不需要改变 `/api/diagnose` 和 `/api/confirm` 的成功响应主结构。只允许沿用现有 `warnings` 表达数据库同步状态。

可新增 warning：

```text
云端画像同步失败，本次诊断报告已保留。
```

### 8.3 错题删除响应的扩展

`DELETE /api/mistake-book` 可在现有响应中增加：

```json
{
  "profile_sync_status": "synced"
}
```

这个字段只描述云端画像同步，不改变删除是否成功。

## 9. 模块边界

P1.8 应保持当前模块职责：

- `src/app/api/student-profile/route.ts`：HTTP 入口，解析请求，调用 service。
- `src/lib/student-profile/student-profile-service.ts`：云端画像读取、恢复响应和重建编排。
- `src/lib/persistence/student-profile-persistence.ts`：Supabase 读写封装。
- `src/lib/shared/student-profile.ts`：继续作为唯一画像 guard 和合并规则来源。
- `src/lib/demo/demo-state.ts`：继续处理 localStorage fallback。
- `src/lib/diagnosis/diagnose-service.ts`：只在现有持久化完成后接入画像同步，不承载数据库细节。
- `src/lib/mistake-book/mistake-book-service.ts`：删除成功后调用画像重建 service。

禁止出现的依赖：

- `shared` 依赖 persistence、provider、Node-only API 或环境变量。
- 前端组件直连 Supabase。
- provider 输出直接进入画像合并。
- `sample_diagnosis` 依赖数据库可用性。

## 10. 一致性和失败策略

P1.8 的一致性目标是“演示稳定 + 可恢复一致”，不是生产级强事务多用户同步。

策略：

- 诊断报告生成优先于数据库同步。
- 数据库未配置时，云端画像读取返回 fallback 状态。
- 诊断持久化失败时，不更新云端画像。
- 重复题不更新云端画像。
- RPC 写入 `memory_events` 成功但 `student_profiles` 投影失败时，诊断仍返回成功，并附加 profile sync warning。
- 删除错题后如果画像重建失败，删除仍成功，但返回 profile sync warning。
- 下次成功诊断写入或删除错题时会再次执行投影；也可以在后续阶段增加内部修复入口，但 P1.8 不实现通用修复工具。
- 投影失败时不静默跳过损坏事件，避免当前画像与解释链不一致。

如果未来进入多用户阶段，再考虑数据库事务、RLS、冲突处理和后台修复任务。

## 11. 测试策略

P1.8 实现计划应覆盖以下测试：

- migration 文本测试：
  - 创建 `student_profiles`。
  - 只允许 `demo_student_001`。
  - service_role 有必要的 select / insert / update 权限。
- persistence 单元测试：
  - 未配置数据库时读取返回 fallback。
  - 云端 profile 合法时返回 profile。
  - 云端 profile 非法时不返回给前端。
  - 投影写入 profile 时包含 `event_count` 和 `last_memory_event_id`。
  - 核心不变式：`student_profiles.profile` 等于 `fold(demoStudentProfile, current memory_events ordered by created_at asc, id asc)`。
  - 空事件、单事件、多事件和删除后事件减少四种状态都满足该不变式。
  - 投影结果非法时不 upsert，返回 warning，并保留旧快照。
- 诊断持久化测试：
  - `persisted` 后从当前 `memory_events` 重放同步云端画像。
  - `duplicate` 不同步云端画像。
  - `disabled` / `failed` 不阻塞诊断报告。
  - RPC `persisted` 但画像投影失败时，诊断报告仍返回并包含 warning。
- 删除重建测试：
  - 删除后按剩余 `memory_events` 重建画像。
  - 重建失败时删除响应仍成功，并包含 warning。
  - 删除后 `event_count` 等于剩余可重放 `memory_events` 数量。
- API 测试：
  - `GET /api/student-profile` 只支持 `demo_student_001`。
  - 未配置数据库时返回稳定 fallback。
  - `profile=null` 时前端不覆盖 localStorage。
  - 不泄露 Supabase 错误细节。
- 前端 demo 状态测试：
  - 首屏先用 localStorage / mock。
  - 云端 profile 合法时覆盖 session 和 localStorage。
  - 云端不可用时保留现有 fallback。
- smoke 回归：
  - `sample_diagnosis` 稳定路径仍通过。
  - 图片识别草稿不写画像。
  - `/api/confirm` 低证据和 token mismatch 路径仍不写具体错因画像。
  - 相同 `created_at` 的事件按 `id` 二次排序，投影结果稳定。

## 12. 文档更新

P1.8 实现时应同步更新：

- `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - 增补 P1.8 云端 `student_profiles` 聚合 / 恢复边界。
- `docs/TECHNICAL_ROADMAP.md`
  - 把 P1.8 放在 P1.7 和未来 RAG 之间，说明先做结构化画像，再做向量检索。
- `interview/mathtrace-project-narrative.md`
  - 新增 P1.8 阶段叙事，强调从“事件已保存”到“当前画像可云端恢复”的演进。
- `docs/adr/2026-06-17-cloud-student-profile-memory.md`
  - 记录为什么选择“当前快照 + 事件历史”，以及为什么 P1.8 使用事件重放投影而不是直接保存 pipeline 快照。

P1.8 需要 ADR。`student_profiles` 会长期影响画像事实来源和后续 RAG / 多用户演进，未来维护者需要知道为什么没有选择纯事件溯源、纯快照或通用 Agent memory。

## 13. 验收标准

P1.8 完成后应满足：

- 有 `student_profiles` 云端表和对应服务端读写封装。
- 诊断成功且非重复持久化后，云端当前画像由当前 `memory_events` 重放更新。
- 页面刷新时，配置数据库且云端画像合法时能恢复云端画像。
- 数据库不可用时，页面继续使用 localStorage / mock，主 demo 不失败。
- 重复题不新增画像事件，也不更新云端画像。
- 删除错题后，云端画像能基于剩余事件重建，且 `event_count` 等于实际聚合事件数。
- `sample_diagnosis`、图片确认、低证据追问、跳过追问、token mismatch 的现有边界不回归。
- 不引入 RAG、pgvector、Milvus、Auth、RLS 或 external memory provider。

## 14. 面试表达

可以这样表达 P1.8：

> P1.7 我先把诊断运行、错题条目和画像变化事件写入 Postgres，解决“长期记忆有没有事实依据”的问题。P1.8 再补上 `student_profiles` 当前快照，解决“页面刷新或后续诊断能不能直接恢复当前画像”的问题。这里我没有直接做 RAG，因为相似内容召回不是事实来源；学生画像这种长期记忆必须先结构化、有证据、有回放路径。实现上采用当前快照加事件历史：读取时快，解释时可追溯；写入和删除后都从当前事件投影出快照，保证当前画像能被事件历史解释。

## 15. 后续演进

P1.8 之后可以继续推进：

- P1.9：真实 Supabase project 应用 migration 并做端到端验收。
- P2：Auth / RLS / 多学生权限。
- P2：`practice_attempts` 和练习完成后的画像回升。
- P3：pgvector 相似错题召回。
- P3+：Milvus / 外部 memory provider / 老师端学情检索。

这些都不进入 P1.8。
