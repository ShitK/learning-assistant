# Diagnose API Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a P0 `POST /api/diagnose` shell that accepts a sample question id and returns the built-in `sample_diagnosis` result.

**Architecture:** Keep the backend stateless and deterministic. The API validates a minimal request, rejects P1 image diagnosis with a recoverable error, and returns structured mock diagnosis data plus the current `sample_diagnosis` object for the existing workbench UI.

**Tech Stack:** Next.js App Router API Route, TypeScript, local mock data, no Kimi call, no database.

---

### Task 1: Verify Missing Endpoint

**Files:**
- No file changes.

- [x] **Step 1: Run failing API smoke check**

```bash
curl -i -s -X POST http://localhost:3000/api/diagnose \
  -H 'Content-Type: application/json' \
  -d '{"student_id":"demo_student_001","task_type":"sample_diagnosis","sample_question_id":"sample_derivative_001","image_base64":null,"student_profile":{},"mistake_history":[]}'
```

- [x] **Step 2: Confirm expected failure**

Expected: `HTTP/1.1 404 Not Found`, because `/api/diagnose` has not been implemented yet.

### Task 2: Add API Contract and Route

**Files:**
- Create: `src/lib/diagnose-api.ts`
- Create: `src/app/api/diagnose/route.ts`

- [x] **Step 1: Add shared request/response types and validation helpers**

Define `DiagnoseRequest`, `DiagnoseSuccessResponse`, `DiagnoseErrorResponse`, `DiagnoseApiResponse`, `isDiagnoseSuccessResponse`, and `parseDiagnoseRequest` without `any`.

- [x] **Step 2: Add route handler**

Implement `POST` so `task_type="sample_diagnosis"` returns the matching built-in sample diagnosis, invalid input returns 400, and `image_diagnosis` returns a P1 recoverable 400.

- [x] **Step 3: Run API smoke check**

Expected: valid sample request returns 200 with `fallback_used=false` and `sample_diagnosis.id`.

### Task 3: Wire Workbench to API

**Files:**
- Modify: `src/components/mathtrace-workbench.tsx`

- [x] **Step 1: Add client fetch helper**

Call `/api/diagnose` with `student_id`, `task_type`, `sample_question_id`, current mock `student_profile`, and `mistake_history`.

- [x] **Step 2: Update start diagnosis flow**

Clicking “开始诊断” starts the timeline and requests the backend result. On success, update the displayed diagnosis from the API response. On failure, keep the selected local sample and show a recoverable message.

### Task 4: Documentation and Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`

- [x] **Step 1: Update PRD contract note**

Document that the P0 shell also returns `sample_diagnosis` for the current workbench renderer while retaining structured response fields for future replacement.

- [x] **Step 2: Run final checks**

```bash
npm run lint
npm run build
curl -i -s -X POST http://localhost:3000/api/diagnose ...
```

Expected: lint/build pass, valid API request returns 200, invalid request returns 400.
