# P1.7 Supabase Real Database Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将已完成的 P1.7 代码连接到真实 Supabase Postgres，并完成一次从诊断到错题本读取的端到端验收。

**Architecture:** 本计划不新增业务功能，重点是把现有 server-only Supabase 持久化层接到真实云端 Postgres。前端仍只通过 Next.js API 访问错题本，`SUPABASE_SERVICE_ROLE_KEY` 只放在本地服务端环境变量中；未配置或配置错误时继续保持 demo 降级稳定。

**Tech Stack:** Supabase Postgres, Supabase SQL Editor or Supabase CLI, Next.js App Router, `.env.local`, existing SQL migration, existing Node.js regression tests, in-app browser verification.

---

## 0. Scope, Assumptions, And Boundaries

### In Scope

- 创建或确认一个真实 Supabase project。
- 执行 `supabase/migrations/20260611000000_p17_mistake_book.sql`。
- 本地配置 `.env.local` 中的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。
- 重启本地 Next.js dev server。
- 用浏览器跑通 `sample_diagnosis` 或已确认图片诊断。
- 在页面“最近错题”看到真实 DB 返回的数据。
- 在 Supabase SQL Editor 中核对 `diagnosis_runs`、`mistake_book_items`、`memory_events` 已写入。
- 运行回归命令，确认真实 DB 配置不破坏原有 demo。

### Out Of Scope

- 不新增登录、Supabase Auth、老师端、权限策略、多学生、RAG、pgvector。
- 不迁移 localStorage 中的完整 demo 画像。
- 不保存完整图片 base64。
- 不改 provider prompt、Kimi/vision provider、analysis provider 逻辑。
- 不提交 `.env.local`、真实 URL、service role key、数据库截图中的密钥或 `docs/reviews/*.md`。
- 不把本计划当作生产部署流程；这只是 P1.7 真实数据底座验收。

### Success Criteria

- Supabase project 中存在：
  - `students`
  - `diagnosis_runs`
  - `mistake_book_items`
  - `memory_events`
  - RPC `persist_mathtrace_diagnosis`
- 本地启动后，页面不再显示“数据库暂未配置，错题本暂为空。”
- 跑一次可持久化诊断后：
  - `diagnosis_runs` 增加或复用一条对应记录。
  - `mistake_book_items` 有一条最近错题。
  - `memory_events` 有一条对应画像事件。
  - 页面“最近错题”显示该条数据。
- 重复同一次 `client_diagnosis_id` 不产生重复 `diagnosis_runs`。
- 数据库记录中不包含完整 `image_base64`。
- `npm test`、`npm run lint`、`npm run build` 通过。

---

## 1. Files And Surfaces

### Read / Use

- `supabase/migrations/20260611000000_p17_mistake_book.sql`
  - 真实 Supabase project 中要执行的 migration。

- `README.md`
  - 已记录 Supabase 本地环境变量边界。

- `src/lib/supabase-admin.ts`
  - 服务端 Supabase admin client 和 env parser。

- `src/lib/diagnosis-persistence.ts`
  - 诊断响应写入 RPC 的 payload 映射。

- `src/lib/mistake-book-service.ts`
  - 错题本只读 API 的数据库读取逻辑。

- `src/app/api/mistake-book/route.ts`
  - 浏览器错题本面板实际调用的 API route。

### Modify

- `.env.local`
  - 本地手动加入 Supabase 配置。
  - 该文件不得提交。

### Do Not Modify Unless A Real Bug Is Found

- `src/**`
- `scripts/**`
- `supabase/migrations/**`
- `package.json`
- `package-lock.json`
- `docs/reviews/*.md`

如果真实接库时发现代码 bug，停止本计划的“配置验收”流程，另开修复任务：新分支、复现测试、实现、审查、回归、提交。

---

## 2. Task 1: Supabase Project Preflight

**Files:**
- Read: `README.md`
- Read: `supabase/migrations/20260611000000_p17_mistake_book.sql`
- Modify: none

- [ ] **Step 1: 确认当前仓库干净**

Run:

```bash
git status --short --branch
```

Expected:

```text
## main...origin/main
```

如果出现 `.env.local`、`docs/reviews/*.md` 或其他无关文件，不要 stage；先确认它们是否本来就是本地文件。

- [ ] **Step 2: 在 Supabase 控制台创建或选择 project**

要求：

- Region 选择离演示网络较近的区域即可。
- Database password 只保存在密码管理器或 Supabase 控制台，不写入仓库。
- Project 用途标记为 MathTrace P1.7 demo database。

Expected:

- 可以进入 Supabase project dashboard。
- 能打开 SQL Editor。
- 能打开 Project Settings -> API。

- [ ] **Step 3: 获取本地需要的两个配置值**

在 Supabase 控制台找到：

```text
Project URL
service_role key
```

安全要求：

- 不把 `service_role key` 发到聊天、文档、截图或 Git。
- 不用 `echo SUPABASE_SERVICE_ROLE_KEY=...` 这类会进入 shell history 的命令。
- 只把它放进本机 `.env.local`。

Expected:

- 手上有 `SUPABASE_URL`。
- 手上有 `SUPABASE_SERVICE_ROLE_KEY`。
- 还没有修改代码文件。

---

## 3. Task 2: Apply SQL Migration

**Files:**
- Read: `supabase/migrations/20260611000000_p17_mistake_book.sql`
- Modify: none

推荐先用 Supabase SQL Editor 手动执行，避免为了验收再引入 Supabase CLI 全局或项目安装。

- [ ] **Step 1: 打开 migration 文件**

Run:

```bash
sed -n '1,420p' supabase/migrations/20260611000000_p17_mistake_book.sql
```

Expected:

- 能看到 `create table if not exists public.students`。
- 能看到 `create or replace function public.persist_mathtrace_diagnosis`。
- 能看到 `grant execute on function public.persist_mathtrace_diagnosis`。

- [ ] **Step 2: 在 Supabase SQL Editor 执行 migration**

操作：

- 打开 Supabase Dashboard -> SQL Editor。
- 新建 query。
- 粘贴 `supabase/migrations/20260611000000_p17_mistake_book.sql` 的完整内容。
- 点击 Run。

Expected:

- SQL Editor 返回成功。
- 没有 permission error。
- 没有 syntax error。

- [ ] **Step 3: 验证四张表存在**

在 Supabase SQL Editor 执行：

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'students',
    'diagnosis_runs',
    'mistake_book_items',
    'memory_events'
  )
order by table_name;
```

Expected rows:

```text
diagnosis_runs
memory_events
mistake_book_items
students
```

- [ ] **Step 4: 验证 RLS 已开启**

在 Supabase SQL Editor 执行：

```sql
select c.relname, c.relrowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'students',
    'diagnosis_runs',
    'mistake_book_items',
    'memory_events'
  )
order by c.relname;
```

Expected:

- 四行结果。
- 每行 `relrowsecurity` 都是 `true`。

- [ ] **Step 5: 验证 RPC 存在**

在 Supabase SQL Editor 执行：

```sql
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'persist_mathtrace_diagnosis';
```

Expected:

```text
persist_mathtrace_diagnosis
```

---

## 4. Task 3: Configure Local Environment

**Files:**
- Modify: `.env.local`
- Do not stage: `.env.local`

- [ ] **Step 1: 手动编辑 `.env.local`**

加入：

```bash
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<your-local-service-role-secret>
```

安全要求：

- 用本地编辑器手动写入。
- 不提交 `.env.local`。
- 不把真实 key 贴进计划、审查报告、README、聊天或 commit message。

Expected:

- `.env.local` 中有 Supabase 两个变量。
- 文件没有被 Git 跟踪。

- [ ] **Step 2: 确认 `.env.local` 不会进入提交**

Run:

```bash
git status --short --ignored .env.local
```

Expected:

```text
!! .env.local
```

如果显示 `?? .env.local`，停止并检查 `.gitignore`，不要继续提交任何内容。

---

## 5. Task 4: Restart Local App

**Files:**
- Modify: none

- [ ] **Step 1: 停止旧 dev server**

如果当前 `npm run dev` 正在运行，在对应终端按：

```text
Ctrl-C
```

Expected:

- 旧 dev server 退出。

- [ ] **Step 2: 重新启动 dev server**

Run:

```bash
npm run dev
```

Expected:

```text
Local: http://localhost:3000
```

说明：Next.js 需要重启后才会读取新写入的 `.env.local`。

- [ ] **Step 3: 打开浏览器**

Open:

```text
http://localhost:3000/
```

Expected:

- 页面正常加载。
- 控制台没有 Supabase env 相关 fatal error。

---

## 6. Task 5: Browser End-To-End Verification

**Files:**
- Modify: none

- [ ] **Step 1: 跑一次 `sample_diagnosis`**

操作：

- 打开首页工作台。
- 使用内置样例题诊断路径。
- 等待诊断报告生成。
- 滚动到“最近错题”面板。

Expected:

- 诊断报告正常出现。
- 页面不再显示“数据库未配置”卡片。
- “最近错题”展示刚写入或最近写入的错题条目。

- [ ] **Step 2: 刷新页面验证只读错题本可恢复**

操作：

- 浏览器刷新页面。
- 滚动到“最近错题”面板。

Expected:

- 最近错题仍能从 `/api/mistake-book` 读取。
- 不依赖 localStorage 才能显示最近错题。

- [ ] **Step 3: 可选验证图片确认路径**

前提：

- 本地已配置 vision provider。
- 有可用于 demo 的非敏感数学错题图片。

操作：

- 使用图片诊断。
- 确认识别草稿。
- 让 `/api/confirm` 生成报告。
- 滚动到“最近错题”面板。

Expected:

- 如果证据等级允许持久化，错题本出现新条目。
- 如果是低证据或未确认路径，报告正常返回，但不写入错题本。

---

## 7. Task 6: Database Verification

**Files:**
- Modify: none

- [ ] **Step 1: 验证诊断记录写入**

在 Supabase SQL Editor 执行：

```sql
select id, student_id, client_diagnosis_id, source, persistence_evidence, profile_update_kind, created_at
from public.diagnosis_runs
where student_id = 'demo_student_001'
order by created_at desc
limit 5;
```

Expected:

- 至少一行。
- `student_id` 是 `demo_student_001`。
- `source` 是 `sample` 或 `image`。
- `profile_update_kind` 不是 `none`。

- [ ] **Step 2: 验证错题本条目写入**

在 Supabase SQL Editor 执行：

```sql
select id, student_id, source, left(question_text, 80) as question_preview, review_status, created_at
from public.mistake_book_items
where student_id = 'demo_student_001'
order by created_at desc
limit 5;
```

Expected:

- 至少一行。
- `review_status` 默认为 `0`。
- `question_preview` 是题目文本，不是图片 base64。

- [ ] **Step 3: 验证 memory event 写入**

在 Supabase SQL Editor 执行：

```sql
select id, student_id, event_type, profile_update_kind, created_at
from public.memory_events
where student_id = 'demo_student_001'
order by created_at desc
limit 5;
```

Expected:

- 至少一行。
- `event_type` 是 `mistake_cause` 或 `problem_type_focus`。

- [ ] **Step 4: 验证没有完整 image base64 入库**

在 Supabase SQL Editor 执行：

```sql
select id
from public.diagnosis_runs
where recognized_question::text like '%base64,%'
   or mistake_diagnosis::text like '%base64,%'
   or student_profile_snapshot::text like '%base64,%'
   or practice_questions::text like '%base64,%'
   or review_plan::text like '%base64,%'
limit 5;
```

Expected:

- 返回 0 行。

- [ ] **Step 5: 验证重复诊断不会制造重复 run**

操作：

- 在浏览器里刷新并再次触发同一个样例诊断。
- 然后在 SQL Editor 执行：

```sql
select client_diagnosis_id, count(*) as run_count
from public.diagnosis_runs
where student_id = 'demo_student_001'
group by client_diagnosis_id
having count(*) > 1;
```

Expected:

- 返回 0 行。

---

## 8. Task 7: Regression Verification

**Files:**
- Modify: none

- [ ] **Step 1: Run unit/regression tests**

Run:

```bash
npm test
```

Expected:

- All existing script tests pass.
- `diagnosis persistence test passed`
- `mistake book API regression test passed`
- `demo smoke test passed`

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected:

- ESLint exits successfully.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected:

- Build succeeds.
- Route list still includes:

```text
/api/diagnose
/api/confirm
/api/mistake-book
```

- [ ] **Step 4: Secret hygiene check**

Run:

```bash
git status --short --ignored .env.local docs/reviews
```

Expected:

- `.env.local` is ignored.
- `docs/reviews/*.md` remains ignored or untracked local-only.
- No secret-bearing file is staged.

Run:

```bash
git diff --cached --name-only
```

Expected:

- Empty output.

---

## 9. Task 8: Decision After Verification

**Files:**
- Modify: none unless a real bug was found.

- [ ] **Step 1: If all verification passes**

Outcome:

- Do not create a code commit.
- Record in final handoff:
  - Supabase migration applied.
  - Browser E2E passed.
  - DB rows verified.
  - Regression commands passed.
  - `.env.local` not committed.

- [ ] **Step 2: If migration fails**

Stop and collect:

```text
Exact SQL error message
Which statement failed
Whether this is a fresh Supabase project or an existing project
```

Then decide whether to:

- Fix the migration in a new branch, or
- Reset/recreate the Supabase project if it is a disposable demo database.

- [ ] **Step 3: If browser still says database not configured**

Check in order:

```text
.env.local contains SUPABASE_URL
.env.local contains SUPABASE_SERVICE_ROLE_KEY
dev server was restarted after editing .env.local
SUPABASE_URL is a valid https URL
service role key is not anon key
```

Do not paste the key into chat or logs.

- [ ] **Step 4: If writes fail but reads work**

Check:

```text
RPC persist_mathtrace_diagnosis exists
grant execute on function ... to service_role exists
students_demo_student_id_check only allows demo_student_001
diagnosis payload source/evidence/profile_update_kind matches allowed policy
```

If a code fix is required, stop this plan and start a bugfix branch.

---

## 10. Handoff Notes

### Recommended Execution Mode

Use **Inline Execution** for this plan because most steps require the user's Supabase dashboard, secret handling, and browser confirmation.

Use **Subagent-Driven** only if the work turns into code changes after a reproducible bug is found. In that case, split the bugfix into a new branch and let subagents review SQL/API/frontend boundaries separately.

### What To Tell The Interviewer

This step turns P1.7 from “代码支持数据库” into “真实 Supabase Postgres 已跑通”。The key engineering point is not just installing `@supabase/supabase-js`; it is proving that:

- Schema, constraints, RLS, RPC, and service role boundary work together.
- The demo remains stable when the database is absent.
- Real writes are gated by evidence policy.
- Frontend never sees the service role key.
- Stored records are queryable for later mistake-book, memory, and RAG phases.

