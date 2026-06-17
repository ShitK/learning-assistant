# P1.8 Real Supabase Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在真实 Supabase Postgres 项目中验收 P1.8 云端当前学生画像闭环，确认 `diagnosis_runs`、`mistake_book_items`、`memory_events` 和 `student_profiles` 都能按预期写入、读取、重建和降级。

**Architecture:** 本计划不新增业务功能，只验证已经合并到 `main` 的 P1.7/P1.8 数据链路。Supabase 仍只由服务端 service role 访问；浏览器只通过 Next.js API 读取错题本和云端画像。验收顺序是先 apply migration，再配置本地 env，再跑 API/浏览器/SQL 检查，最后跑完整本地回归。

**Tech Stack:** Supabase Postgres, Supabase SQL Editor, Next.js App Router, `.env.local`, existing SQL migrations, existing Node.js regression tests, browser/manual verification.

---

## 0. Scope, Assumptions, And Boundaries

### In Scope

- 在真实 Supabase project 中按顺序执行 P1.7/P1.8 migration。
- 本地配置 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。
- 启动本地 Next.js dev server。
- 跑一次 `sample_diagnosis`，确认诊断审计、错题本、画像事件和当前画像快照均写入。
- 刷新页面，确认工作台先使用 localStorage/demo fallback，再 best-effort 从 `/api/student-profile` 恢复云端画像。
- 删除一条错题，确认关联 `memory_events` 变化后 `student_profiles` 重新投影。
- 验证数据库未暴露给前端，service role key 不进入客户端、日志、文档或 Git。
- 运行本地回归命令，确认真实 Supabase 配置不破坏 demo 主路径。

### Out Of Scope

- 不做登录、真实多用户、老师端、家长端、面向用户的 RLS 策略。
- 不做 RAG、pgvector、Milvus、外部 memory provider。
- 不保存完整图片 base64。
- 不迁移现有 localStorage 历史数据。
- 不修改 provider prompt、视觉 OCR、文本分析模型或 Agent pipeline。
- 不提交 `.env*`、真实 Supabase URL、service role key、截图中的密钥或 `docs/reviews/*.md`。
- 不把本计划变成生产部署流程；它只是 P1.8 真实云端闭环验收。

### Success Criteria

- Supabase project 中存在：
  - `students`
  - `diagnosis_runs`
  - `mistake_book_items`
  - `memory_events`
  - `student_profiles`
  - RPC `persist_mathtrace_diagnosis`
- `student_profiles` 已启用 RLS，只授予 `service_role` select/insert/update。
- 本地 `GET /api/student-profile?student_id=demo_student_001` 在未生成画像前返回 `profile=null` fallback，不报 500。
- 跑一次 `sample_diagnosis` 后：
  - `diagnosis_runs` 增加一条或保持幂等记录。
  - `mistake_book_items` 有可读错题条目。
  - `memory_events` 有 `should_persist=true` 的画像事件。
  - `student_profiles` 有一条 `demo_student_001` / `math` 当前画像快照。
  - 页面“最近错题”和画像区域能正常显示。
- 删除错题后：
  - 对应 `mistake_book_items` 删除。
  - 关联 `memory_events` 级联删除。
  - `student_profiles.event_count` 和 `last_memory_event_id` 与剩余 `memory_events` 一致。
- `sample_diagnosis` smoke、lint、build 通过。

---

## 1. Files And Surfaces

### Read / Use

- `supabase/migrations/20260611000000_p17_mistake_book.sql`
  - P1.7 基础表和 `persist_mathtrace_diagnosis` RPC。

- `supabase/migrations/20260611001000_p17_mistake_book_dedupe_delete.sql`
  - 错题本题目级去重和删除相关约束/级联。

- `supabase/migrations/20260617000000_p18_student_profiles.sql`
  - P1.8 当前学生画像 read model。

- `README.md`
  - Supabase 本地环境变量和安全边界。

- `src/lib/persistence/supabase-admin.ts`
  - 服务端 Supabase admin client 和 env parser。

- `src/lib/persistence/diagnosis-persistence.ts`
  - 诊断结果写入 RPC payload 映射。

- `src/lib/persistence/student-profile-persistence.ts`
  - `memory_events` 读取和 `student_profiles` upsert/read。

- `src/lib/student-profile/student-profile-service.ts`
  - 当前画像投影和 `/api/student-profile` 服务逻辑。

- `src/lib/mistake-book/mistake-book-service.ts`
  - 删除错题后触发画像重建。

### Modify Locally

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

如果真实接库时发现代码 bug，停止验收流程，另开修复任务：新分支、复现测试、实现、审查、回归、提交、合并。

---

## 2. Task 1: Repository And Supabase Preflight

**Files:**
- Read: `README.md`
- Read: `supabase/migrations/*.sql`
- Modify: none

- [ ] **Step 1: 确认当前仓库在最新 main**

Run:

```bash
cd /Users/kk/learning-assistant
git status --short --branch
git log --oneline --decorate -3
```

Expected:

```text
## main...origin/main
520f5c8 (HEAD -> main, origin/main, origin/HEAD) test: cover p18 profile event tie breaker
```

如果 `main` 不是 `origin/main`，先执行：

```bash
git pull --ff-only origin main
```

- [ ] **Step 2: 确认 migration 文件齐全**

Run:

```bash
find supabase/migrations -maxdepth 1 -type f | sort
```

Expected includes exactly these P1.7/P1.8 files:

```text
supabase/migrations/20260611000000_p17_mistake_book.sql
supabase/migrations/20260611001000_p17_mistake_book_dedupe_delete.sql
supabase/migrations/20260617000000_p18_student_profiles.sql
```

- [ ] **Step 3: 创建或选择真实 Supabase project**

Supabase 控制台检查：

- 能打开 SQL Editor。
- 能打开 Project Settings -> API。
- 能看到 Project URL。
- 能看到 service role secret。

安全要求：

- 不把 service role key 发到聊天、文档、截图或 Git。
- 不把 key 放入 `NEXT_PUBLIC_*` 变量。
- 不用 `echo SUPABASE_SERVICE_ROLE_KEY=...` 这类会进入 shell history 的命令。

---

## 3. Task 2: Apply P1.7/P1.8 Migrations In Order

**Files:**
- Read: `supabase/migrations/20260611000000_p17_mistake_book.sql`
- Read: `supabase/migrations/20260611001000_p17_mistake_book_dedupe_delete.sql`
- Read: `supabase/migrations/20260617000000_p18_student_profiles.sql`
- Modify: none

推荐使用 Supabase SQL Editor 手动执行，避免为了验收引入 Supabase CLI 安装和登录状态。

- [ ] **Step 1: 在 SQL Editor 执行 P1.7 基础 migration**

Copy/paste and run:

```text
supabase/migrations/20260611000000_p17_mistake_book.sql
```

Expected:

- SQL Editor 返回 success。
- 没有 syntax error。
- 没有 permission error。

- [ ] **Step 2: 执行 P1.7 去重/删除 migration**

Copy/paste and run:

```text
supabase/migrations/20260611001000_p17_mistake_book_dedupe_delete.sql
```

Expected:

- SQL Editor 返回 success。
- 如果已有重复 fingerprint 数据，migration 应 fail fast 并生成审计候选；不要手动删除数据绕过审计。
- 新项目空库应直接成功。

- [ ] **Step 3: 执行 P1.8 student_profiles migration**

Copy/paste and run:

```text
supabase/migrations/20260617000000_p18_student_profiles.sql
```

Expected:

- SQL Editor 返回 success。
- `student_profiles` 表创建成功。
- 没有向 `anon`、`authenticated`、`public` 授权。

- [ ] **Step 4: 验证表和函数存在**

Run in Supabase SQL Editor:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'students',
    'diagnosis_runs',
    'mistake_book_items',
    'memory_events',
    'student_profiles'
  )
order by table_name;
```

Expected rows:

```text
diagnosis_runs
memory_events
mistake_book_items
student_profiles
students
```

Run:

```sql
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'persist_mathtrace_diagnosis';
```

Expected:

```text
persist_mathtrace_diagnosis
```

- [ ] **Step 5: 验证 RLS 和 grants**

Run:

```sql
select relname, relrowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in (
    'students',
    'diagnosis_runs',
    'mistake_book_items',
    'memory_events',
    'student_profiles'
  )
order by relname;
```

Expected:

```text
diagnosis_runs      true
memory_events       true
mistake_book_items  true
student_profiles    true
students            true
```

Run:

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'student_profiles'
order by grantee, privilege_type;
```

Expected:

- `service_role` has `SELECT`, `INSERT`, `UPDATE`.
- No `anon`.
- No `authenticated`.
- No `public`.

---

## 4. Task 3: Configure Local Server Environment

**Files:**
- Modify locally only: `.env.local`

- [ ] **Step 1: Open `.env.local` in an editor**

Do not print the secret in terminal. Add or update:

```bash
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<your-local-service-role-secret>
```

Keep existing provider variables unchanged.

- [ ] **Step 2: Confirm `.env.local` is ignored**

Run:

```bash
git status --short --ignored .env.local
```

Expected:

```text
!! .env.local
```

If `.env.local` appears as `?? .env.local`, stop and fix `.gitignore` before continuing.

- [ ] **Step 3: Start dev server**

Run:

```bash
npm run dev
```

Expected:

```text
Local: http://localhost:3000
```

If port 3000 is occupied, use the port shown by Next.js and substitute it in later curl/browser steps.

---

## 5. Task 4: API-Level Baseline Before Diagnosis

**Files:**
- Modify: none

Use a second terminal while `npm run dev` is running.

- [ ] **Step 1: Confirm mistake book API is reachable**

Run:

```bash
curl -s "http://localhost:3000/api/mistake-book?student_id=demo_student_001&limit=5" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const x=JSON.parse(s); console.log(JSON.stringify({configured:x.is_database_configured, items:x.items?.length, warnings:x.warnings}, null, 2));})'
```

Expected before diagnosis on a fresh DB:

```json
{
  "configured": true,
  "items": 0,
  "warnings": []
}
```

- [ ] **Step 2: Confirm student profile API fallback is reachable**

Run:

```bash
curl -s "http://localhost:3000/api/student-profile?student_id=demo_student_001" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const x=JSON.parse(s); console.log(JSON.stringify({source:x.source, configured:x.is_database_configured, has_profile:Boolean(x.profile), warnings:x.warnings}, null, 2));})'
```

Expected before any persisted profile:

```json
{
  "source": "fallback",
  "configured": true,
  "has_profile": false,
  "warnings": ["云端画像暂未生成，继续使用本地 demo 画像。"]
}
```

- [ ] **Step 3: Confirm invalid student_id is rejected**

Run:

```bash
curl -s -i "http://localhost:3000/api/student-profile?student_id=not_demo"
```

Expected:

```text
HTTP/1.1 400
```

Response body includes:

```json
{
  "error": {
    "code": "invalid_request",
    "recoverable": true
  }
}
```

---

## 6. Task 5: Run Sample Diagnosis And Verify Writes

**Files:**
- Modify: none

- [ ] **Step 1: Trigger sample diagnosis through API**

Run:

```bash
curl -s "http://localhost:3000/api/diagnose" \
  -H "Content-Type: application/json" \
  -d '{
    "task_type": "sample_diagnosis",
    "student_id": "demo_student_001",
    "sample_question_id": "sample_derivative_001"
  }' \
  | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const x=JSON.parse(s); console.log(JSON.stringify({source:x.source, student_id:x.student_id, warnings:x.warnings, should_persist:x.memory_delta?.should_persist, diagnosis_id:x.diagnosis_id}, null, 2));})'
```

Expected:

```json
{
  "source": "sample",
  "student_id": "demo_student_001",
  "warnings": [],
  "should_persist": true
}
```

If `warnings` includes `本题已加入错题本。`, the DB already has this sample fingerprint. Continue to SQL checks, but note that duplicate path may not create a new `memory_events` row.

- [ ] **Step 2: Verify core tables in SQL Editor**

Run:

```sql
select 'students' as table_name, count(*) from public.students
union all
select 'diagnosis_runs', count(*) from public.diagnosis_runs
union all
select 'mistake_book_items', count(*) from public.mistake_book_items
union all
select 'memory_events', count(*) from public.memory_events
union all
select 'student_profiles', count(*) from public.student_profiles
order by table_name;
```

Expected after a non-duplicate sample diagnosis:

```text
diagnosis_runs      >= 1
memory_events       >= 1
mistake_book_items  >= 1
student_profiles    1
students            1
```

- [ ] **Step 3: Verify student_profiles metadata**

Run:

```sql
select
  student_id,
  subject,
  grade,
  profile_version,
  event_count,
  last_memory_event_id is not null as has_last_event,
  jsonb_typeof(profile) as profile_json_type
from public.student_profiles
where student_id = 'demo_student_001';
```

Expected:

```text
student_id          demo_student_001
subject             math
grade               高二
profile_version     1
event_count         >= 1
has_last_event      true
profile_json_type   object
```

- [ ] **Step 4: Verify profile projection matches memory_events count**

Run:

```sql
select
  sp.event_count as profile_event_count,
  count(me.id) filter (where (me.memory_delta->>'should_persist')::boolean is true) as persistable_event_count
from public.student_profiles sp
left join public.memory_events me on me.student_id = sp.student_id
where sp.student_id = 'demo_student_001'
group by sp.event_count;
```

Expected:

```text
profile_event_count = persistable_event_count
```

- [ ] **Step 5: Verify no full image base64 persisted**

Run:

```sql
select
  bool_or(recognized_question::text ilike '%data:image%') as diagnosis_has_data_url,
  bool_or(recognized_question::text ilike '%base64%') as diagnosis_mentions_base64
from public.diagnosis_runs;
```

Expected for sample diagnosis:

```text
diagnosis_has_data_url     false
diagnosis_mentions_base64  false
```

---

## 7. Task 6: Verify Frontend Cloud Profile Recovery

**Files:**
- Modify: none

- [ ] **Step 1: Open the local app**

Open:

```text
http://localhost:3000
```

Expected:

- Workbench renders normally.
- No browser console error about Supabase or service role key.
- Recent mistake book panel is visible.

- [ ] **Step 2: Clear browser localStorage and reload**

In browser devtools console:

```js
localStorage.clear();
location.reload();
```

Expected:

- Page still renders immediately using demo fallback.
- After hydration, profile reflects cloud profile if `student_profiles` exists.
- No visible crash if cloud profile read is slow or absent.

- [ ] **Step 3: Confirm API is the only browser read path**

In browser devtools Network tab:

- Filter by `student-profile`.
- Reload page.

Expected:

- Browser calls `/api/student-profile?student_id=demo_student_001`.
- Browser does not call Supabase REST endpoint directly.
- Browser network does not include `SUPABASE_SERVICE_ROLE_KEY`.

- [ ] **Step 4: Confirm cloud profile API now returns profile**

Run:

```bash
curl -s "http://localhost:3000/api/student-profile?student_id=demo_student_001" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const x=JSON.parse(s); console.log(JSON.stringify({source:x.source, configured:x.is_database_configured, has_profile:Boolean(x.profile), grade:x.profile?.grade, warnings:x.warnings}, null, 2));})'
```

Expected:

```json
{
  "source": "cloud",
  "configured": true,
  "has_profile": true,
  "grade": "高二",
  "warnings": []
}
```

---

## 8. Task 7: Verify Mistake Delete Rebuilds Profile

**Files:**
- Modify: none

- [ ] **Step 1: Capture current mistake and profile state**

Run in SQL Editor:

```sql
select id, question_text, created_at
from public.mistake_book_items
where student_id = 'demo_student_001'
order by created_at desc
limit 1;
```

Copy the returned `id` as:

```text
<mistake_book_item_id>
```

Run:

```sql
select event_count, last_memory_event_id
from public.student_profiles
where student_id = 'demo_student_001';
```

Record:

```text
event_count_before=<number>
last_memory_event_id_before=<uuid-or-null>
```

- [ ] **Step 2: Delete through Next API**

Run:

```bash
curl -s "http://localhost:3000/api/mistake-book" \
  -X DELETE \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "demo_student_001",
    "item_id": "<mistake_book_item_id>"
  }' \
  | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const x=JSON.parse(s); console.log(JSON.stringify({deleted:x.deleted, profile_sync_status:x.profile_sync_status, warnings:x.warnings}, null, 2));})'
```

Expected:

```json
{
  "deleted": true,
  "profile_sync_status": "synced",
  "warnings": []
}
```

- [ ] **Step 3: Verify memory_events cascade and profile rebuild**

Run in SQL Editor:

```sql
select count(*) as remaining_events_for_deleted_item
from public.memory_events
where mistake_book_item_id = '<mistake_book_item_id>';
```

Expected:

```text
remaining_events_for_deleted_item = 0
```

Run:

```sql
select
  sp.event_count,
  sp.last_memory_event_id,
  count(me.id) filter (where (me.memory_delta->>'should_persist')::boolean is true) as persistable_event_count
from public.student_profiles sp
left join public.memory_events me on me.student_id = sp.student_id
where sp.student_id = 'demo_student_001'
group by sp.event_count, sp.last_memory_event_id;
```

Expected:

```text
event_count = persistable_event_count
```

If all memory events were deleted, expected:

```text
event_count = 0
last_memory_event_id = null
```

- [ ] **Step 4: Verify frontend does not show deleted item**

In browser:

- Reload `http://localhost:3000`.
- Check recent mistake book panel.

Expected:

- Deleted item is not visible.
- Profile panel still renders.
- No browser error.

---

## 9. Task 8: Failure Mode Smoke Checks

**Files:**
- Modify locally only: `.env.local`

- [ ] **Step 1: Temporarily simulate missing Supabase env**

In `.env.local`, comment out both Supabase lines:

```bash
# SUPABASE_URL=<your-supabase-project-url>
# SUPABASE_SERVICE_ROLE_KEY=<your-local-service-role-secret>
```

Restart dev server.

- [ ] **Step 2: Confirm app falls back cleanly**

Run:

```bash
curl -s "http://localhost:3000/api/student-profile?student_id=demo_student_001" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const x=JSON.parse(s); console.log(JSON.stringify({source:x.source, configured:x.is_database_configured, has_profile:Boolean(x.profile), warnings:x.warnings}, null, 2));})'
```

Expected:

```json
{
  "source": "fallback",
  "configured": false,
  "has_profile": false,
  "warnings": ["数据库暂未配置，继续使用本地 demo 画像。"]
}
```

Run:

```bash
curl -s "http://localhost:3000/api/mistake-book?student_id=demo_student_001&limit=5" | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{const x=JSON.parse(s); console.log(JSON.stringify({configured:x.is_database_configured, items:x.items?.length, warnings:x.warnings}, null, 2));})'
```

Expected:

```json
{
  "configured": false,
  "items": 0
}
```

- [ ] **Step 3: Restore Supabase env**

Restore:

```bash
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<your-local-service-role-secret>
```

Restart dev server.

Expected:

- `/api/student-profile` returns `is_database_configured=true`.
- App renders normally.

---

## 10. Task 9: Local Regression Suite

**Files:**
- Modify: none

Stop dev server if it is no longer needed.

- [ ] **Step 1: Run focused P1.8 tests**

Run:

```bash
node scripts/tests/persistence/student-profile-persistence.test.mjs
node scripts/tests/persistence/diagnosis-persistence.test.mjs
node scripts/tests/persistence/mistake-book-api.test.mjs
node scripts/tests/ui/mathtrace-workbench-ui.test.mjs
```

Expected:

```text
student profile persistence tests passed
diagnosis persistence test passed
mistake book API regression test passed
mathtrace workbench UI regression test passed
```

- [ ] **Step 2: Run full test and smoke**

Run:

```bash
npm test
npm run test:smoke
```

Expected:

```text
api smoke test passed
demo smoke test passed
```

- [ ] **Step 3: Run lint and build**

Run:

```bash
npm run lint
npm run build
```

Expected:

- `eslint` exits 0.
- `next build` exits 0.
- Route table includes:

```text
ƒ /api/student-profile
```

---

## 11. Task 10: Record Local Verification Notes

**Files:**
- Create locally only: `docs/reviews/2026-06-17-p18-real-supabase-verification-notes.md`

This file is local review evidence by default. Do not commit it unless explicitly requested.

- [ ] **Step 1: Create local notes file**

Create:

```text
docs/reviews/2026-06-17-p18-real-supabase-verification-notes.md
```

Use this template:

```md
# P1.8 Real Supabase Verification Notes

Date: 2026-06-17
Project: MathTrace

## Environment

- Supabase project: <redacted project name or initials only>
- Local app URL: http://localhost:3000
- Branch/commit: <git rev-parse --short HEAD>
- Secrets recorded in this file: none

## Migration Apply

- 20260611000000_p17_mistake_book.sql: pass/fail
- 20260611001000_p17_mistake_book_dedupe_delete.sql: pass/fail
- 20260617000000_p18_student_profiles.sql: pass/fail

## SQL Checks

- Tables present: pass/fail
- RPC present: pass/fail
- student_profiles RLS/grants: pass/fail
- No image base64 persisted: pass/fail

## API Checks

- GET /api/mistake-book configured=true: pass/fail
- GET /api/student-profile fallback before diagnosis: pass/fail
- POST /api/diagnose sample persisted: pass/fail
- GET /api/student-profile cloud after diagnosis: pass/fail
- DELETE /api/mistake-book profile_sync_status=synced: pass/fail

## Browser Checks

- Workbench loads: pass/fail
- localStorage clear then reload recovers cloud profile: pass/fail
- Network only calls Next API, not Supabase directly: pass/fail

## Regression

- node scripts/tests/persistence/student-profile-persistence.test.mjs: pass/fail
- node scripts/tests/persistence/diagnosis-persistence.test.mjs: pass/fail
- node scripts/tests/persistence/mistake-book-api.test.mjs: pass/fail
- node scripts/tests/ui/mathtrace-workbench-ui.test.mjs: pass/fail
- npm test: pass/fail
- npm run test:smoke: pass/fail
- npm run lint: pass/fail
- npm run build: pass/fail

## Issues Found

- None / list issue and link to follow-up task.

## Conclusion

P1.8 real Supabase verification: pass/fail.
```

- [ ] **Step 2: Confirm notes file is not staged**

Run:

```bash
git status --short docs/reviews/2026-06-17-p18-real-supabase-verification-notes.md
```

Expected:

```text
?? docs/reviews/2026-06-17-p18-real-supabase-verification-notes.md
```

Do not stage this file unless the user explicitly requests it.

---

## 12. Rollback / Cleanup

### Local Env Cleanup

If verification is complete and you do not want the local app connected to Supabase:

```bash
# edit .env.local manually
# comment out SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
```

Restart dev server and confirm fallback:

```bash
curl -s "http://localhost:3000/api/student-profile?student_id=demo_student_001"
```

Expected:

```json
{
  "source": "fallback",
  "is_database_configured": false
}
```

### Supabase Data Cleanup For Demo Project

Only run this in a throwaway demo Supabase project, not in a project whose data you want to keep:

```sql
delete from public.mistake_book_items where student_id = 'demo_student_001';
delete from public.diagnosis_runs where student_id = 'demo_student_001';
delete from public.student_profiles where student_id = 'demo_student_001';
delete from public.students where id = 'demo_student_001';
```

Expected:

- Related `memory_events` are removed by cascade from `mistake_book_items`.
- `student_profiles` no longer has `demo_student_001`.
- Subsequent `/api/student-profile` returns `profile=null` fallback.

---

## 13. Self-Review Checklist

- [ ] Plan verifies P1.7 and P1.8 migrations in order.
- [ ] Plan verifies `student_profiles` table, RLS and service_role-only access.
- [ ] Plan verifies `memory_events -> student_profiles` projection after diagnosis.
- [ ] Plan verifies delete cascade and profile rebuild.
- [ ] Plan verifies frontend reads through `/api/student-profile`, not Supabase.
- [ ] Plan verifies Supabase missing-env fallback.
- [ ] Plan does not ask the worker to commit secrets or `docs/reviews/*.md`.
- [ ] Plan keeps RAG, pgvector, Milvus, login, teacher and real multi-user out of scope.
