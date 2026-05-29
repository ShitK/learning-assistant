# MathTrace Simplified Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the MathTrace workbench so the first screen focuses on starting a diagnosis and immediately showing the standard solution plus mistake report.

**Architecture:** Keep the current single client workbench and mock data unchanged. Recompose the existing sections into a two-screen story: first screen for input, result, and timeline; second screen for practice, profile delta, and review plan. This task intentionally stays on the front-end `sample_diagnosis` demo path and does not implement `POST /api/diagnose`; that API remains a separate P0/P1 integration task.

**Scope Notes:** The mock data retains a full 7-day review plan, but this UI intentionally displays only the top 3 priority actions to reduce demo density. The current workbench is a client component because sample selection and diagnosis-step animation are local interactive state; moving the data load behind `POST /api/diagnose` is outside this UI-only task.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, KaTeX.

---

### Task 1: Recompose First Screen

**Files:**
- Modify: `src/components/mathtrace-workbench.tsx`

- [ ] **Step 1: Replace the large hero layout with a compact first-screen grid**

Use the existing `SampleSelector`, a new compact result card, and a new timeline component:

```tsx
<AgentTimeline ... />
<section className="grid gap-5 lg:grid-cols-2">
  <SampleSelector ... />
  <DiagnosisResultCard sample={selectedSample} />
</section>
```

- [ ] **Step 2: Remove first-screen metric blocks and the large console panel**

Delete the `MetricBlock` first-screen usage and stop rendering `DiagnosticMap` in the main flow. Keep helpers only if still used elsewhere.

- [ ] **Step 3: Verify first screen behavior**

Run: `npm run lint`

Expected: ESLint exits 0.

### Task 2: Convert Agent Process To Timeline

**Files:**
- Modify: `src/components/mathtrace-workbench.tsx`

- [ ] **Step 1: Replace large step cards with a compact timeline**

Render six steps as a horizontal node-and-line timeline on desktop. On small screens, keep the timeline inside an internal horizontal scroll container so the page itself does not overflow. Use `getStepState` to keep current active/done/waiting behavior.

- [ ] **Step 2: Preserve diagnosis animation**

Keep `completedStepCount`, `isDiagnosing`, and `handleStartDiagnosis` unchanged so clicking “开始诊断” still lights steps sequentially.

- [ ] **Step 3: Verify interaction**

Open `http://localhost:3000`, click “开始诊断”, and confirm the timeline enters an active state.

### Task 3: Simplify Below-The-Fold Sections

**Files:**
- Modify: `src/components/mathtrace-workbench.tsx`

- [ ] **Step 1: Remove the old separate diagnosis report block from below the fold**

The report now lives in the first-screen `DiagnosisResultCard`.

- [ ] **Step 2: Keep practice as an independent lightweight section**

Keep three practice items and add a disabled P1 upload-action affordance per exercise.

- [ ] **Step 3: Keep profile change and review plan as separate cards**

Render `ProfileInsights` and `ReviewPath` as two equal second-screen cards.

- [ ] **Step 4: Verify page height and responsiveness**

Use browser inspection at desktop and mobile widths. Expected: no horizontal scroll, first screen shows input/result/timeline before the long-term sections.

### Task 4: Final Verification

**Files:**
- Modify: no additional files expected

- [ ] **Step 1: Run lint**

Run: `npm run lint`

Expected: exits 0.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: Next.js build exits 0.

- [ ] **Step 3: Browser smoke test**

Open `http://localhost:3000`. Confirm:
- Left and right first-screen cards are equal width on desktop.
- Result card shows standard solution before mistake report.
- Agent timeline lights up after starting diagnosis.
- Practice section, profile change, and next plan remain visible below.
