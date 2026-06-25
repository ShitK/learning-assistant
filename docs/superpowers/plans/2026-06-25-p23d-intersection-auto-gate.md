# P2.3d Intersection Auto Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the P2.3 tag merge gate so obvious Rule/AI agreement can auto-approve by tag intersection instead of strict evidence matching.

**Architecture:** Keep the merge gate as the only auto-approval authority, but reduce it to a small MVP decision rule: high-confidence AI, valid parser output, no visual dependency, and at least one overlapping `target_skills` tag. `method_tags` and non-visual `feature_flags` are additive metadata; their intersection can add review notes but must not block auto approval.

**Tech Stack:** Node.js ESM scripts, existing RAG local JSON artifacts, existing Node assertion tests, no new npm dependencies.

## Global Constraints

- Do not commit `.env*`, `artifacts/**`, `docs/reviews/*.md`, or `.superpowers/sdd/**`.
- Do not call the real AI provider from tests.
- Do not let AI create taxonomy keys at runtime.
- Preserve `sample_diagnosis` and all main app routes.
- Keep RAG as the variant-practice retrieval/source layer; do not write `memory_events`, `student_profiles`, or evidence API data.
- `needs_visual` remains conservative: if rule or AI marks `needs_visual`, the item must remain in the review queue.
- AI JSON/schema/unknown-tag parser warnings, non-high AI confidence, missing AI target skill, no Rule/AI target skill intersection, too many AI target skills, and visual dependency remain review-queue reasons.
- This task removes redundant P2.3c evidence/method/feature hard-blocking logic; it does not change taxonomy, provider prompts, review UI layout, database schema, or frontend product routes.

---

## Desired Gate Rule

Auto approval requires:

- `aiProposal.item_confidence === "high"`.
- No hard parser warnings: `unknown_tag_removed`, `empty_tag_removed`, `invalid_confidence_removed`, `invalid_ai_json`, `invalid_ai_schema`.
- AI has at least one `target_skills` tag.
- AI has at most 3 `target_skills` tags.
- Rule and AI `target_skills` have at least one intersection when rule has target skills.
- Neither Rule nor AI contains `needs_visual`.

Auto approval no longer requires:

- Every AI tag to have non-empty `evidence_terms`.
- `invalid_evidence_terms_removed` to be absent.
- `method_tags` to be derivable from target skills.
- Rule and AI `feature_flags` to match exactly.

`method_tags` and non-visual `feature_flags` should still be merged into final tags. If AI adds values, keep `ai_added_method_tags` and `ai_added_feature_flags` review notes. If AI evidence was partially removed, keep `ai_evidence_terms_partially_removed` review notes only as audit context.

---

## Task 1: Replace Evidence-Blocking Tests With Intersection-Gate Tests

**Files:**
- Modify: `scripts/tests/rag/tag-proposal-merge-core.test.mjs`

**Interfaces:**
- Consumes: `buildMergedTagProposals()` and local `buildOne()` helper.
- Produces: failing tests proving empty AI evidence no longer blocks when target skills intersect.

- [ ] **Step 1: Replace the missing-evidence blocking test**

Change the `missingEvidenceAfterCleanup` block so it expects auto approval, not review queue:

```js
{
  const missingEvidenceAfterCleanup = buildOne({
    itemId: "missing-ai-evidence",
    ruleTags: tags({ target_skills: ["tangent_slope"], method_tags: ["tangent_slope"] }),
    aiTags: {
      target_skills: [
        {
          tag: "tangent_slope",
          display_name: "tangent_slope",
          confidence: "high",
          evidence_terms: [],
          source: "llm",
        },
      ],
      method_tags: tags({ method_tags: ["tangent_slope"] }, "llm").method_tags,
      feature_flags: [],
    },
    warnings: ["invalid_evidence_terms_removed"],
  });

  assert.equal(missingEvidenceAfterCleanup.auto_review_records.length, 1);
  assert.equal(missingEvidenceAfterCleanup.review_queue.length, 0);
  assert.equal(
    missingEvidenceAfterCleanup.auto_review_records[0].review_notes.includes("ai_evidence_terms_partially_removed"),
    true,
  );
}
```

- [ ] **Step 2: Replace the AI method without evidence blocking test**

Change the `aiMethodWithoutEvidence` block so an AI-added method with empty evidence auto-approves when target skills intersect:

```js
{
  const aiMethodWithoutEvidence = buildOne({
    itemId: "ai-method-without-evidence",
    ruleTags: tags({ target_skills: ["tangent_slope"], method_tags: ["tangent_slope"] }),
    aiTags: {
      target_skills: tags({ target_skills: ["tangent_slope"] }, "llm").target_skills,
      method_tags: [
        {
          tag: "zero_count",
          display_name: "zero_count",
          confidence: "high",
          evidence_terms: [],
          source: "llm",
        },
      ],
      feature_flags: [],
    },
  });

  assert.equal(aiMethodWithoutEvidence.auto_review_records.length, 1);
  assert.equal(aiMethodWithoutEvidence.review_queue.length, 0);
  assert.equal(
    aiMethodWithoutEvidence.auto_review_records[0].review_notes.includes("ai_added_method_tags"),
    true,
  );
}
```

- [ ] **Step 3: Add a target-skill intersection protection test**

Add a test proving complete `target_skills` mismatch still requires review:

```js
{
  const noTargetIntersection = buildOne({
    itemId: "no-target-intersection",
    ruleTags: tags({ target_skills: ["tangent_slope"], method_tags: ["tangent_slope"] }),
    aiTags: tags({ target_skills: ["zero_point"], method_tags: ["zero_count"] }, "llm"),
  });

  assert.equal(noTargetIntersection.auto_review_records.length, 0);
  assert.equal(noTargetIntersection.review_queue.length, 1);
  assert.equal(noTargetIntersection.review_queue[0].gate_reasons.includes("target_skill_conflict"), true);
}
```

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```bash
node scripts/tests/rag/tag-proposal-merge-core.test.mjs
```

Expected: FAIL because current code still emits `missing_ai_evidence`.

---

## Task 2: Simplify Merge Gate Logic

**Files:**
- Modify: `scripts/rag/tag-proposal-merge-core.mjs`
- Test: `scripts/tests/rag/tag-proposal-merge-core.test.mjs`

**Interfaces:**
- Consumes: normalized rule and AI tag groups in `getGateDecision()`.
- Produces: intersection-based gate decision and final additive tags.

- [ ] **Step 1: Remove evidence as a blocking reason**

Delete this blocking branch from `getGateDecision()`:

```js
if (hasAnyAiTagWithoutEvidence(aiTags)) {
  blockingReasons.push("missing_ai_evidence");
} else if (hasWarning(aiProposal, "invalid_evidence_terms_removed")) {
  successReasons.push("ai_evidence_terms_partially_removed");
}
```

Replace it with audit-only handling:

```js
if (hasWarning(aiProposal, "invalid_evidence_terms_removed")) {
  successReasons.push("ai_evidence_terms_partially_removed");
}
```

- [ ] **Step 2: Remove the unused evidence helper**

Delete the `hasAnyAiTagWithoutEvidence()` function because evidence is no longer a hard gate.

- [ ] **Step 3: Keep additive method/feature notes**

Keep the existing `hasAiAddedValues()` logic for review notes:

```js
if (hasAiAddedValues(normalizedRuleTags.method_tags, normalizedAiTags.method_tags)) {
  successReasons.push("ai_added_method_tags");
}
```

and:

```js
successReasons.push("ai_added_feature_flags");
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
node scripts/tests/rag/tag-proposal-merge-core.test.mjs
node scripts/tests/rag/tag-proposal-merge-cli.test.mjs
```

Expected: PASS.

---

## Task 3: Update Docs and Regenerate Local Review Artifacts

**Files:**
- Modify: `docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md`
- Modify: `interview/mathtrace-project-narrative.md`
- Local ignored outputs only: `artifacts/rag/tag-review/**`

**Interfaces:**
- Consumes: existing local `candidate_ai_tag_proposals.json`.
- Produces: updated design narrative and a regenerated local review page with fewer false-positive review items.

- [ ] **Step 1: Update design spec gate rules**

In `docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md`, state that evidence is audit-only in P2.3d and no longer a hard auto-approval gate.

- [ ] **Step 2: Update interview narrative**

In `interview/mathtrace-project-narrative.md`, explain P2.3d as a simplification: Rule/AI target skill intersection is the main trust signal, while method/feature/evidence are additive audit metadata.

- [ ] **Step 3: Regenerate local ignored artifacts**

Run:

```bash
node scripts/rag/merge-tag-proposals.mjs --corpus artifacts/rag/practice-corpus/practice_corpus.json --rules artifacts/rag/tag-proposals/candidate_tag_proposals.json --ai artifacts/rag/ai-tag-proposals/candidate_ai_tag_proposals.json --out artifacts/rag/tag-review
node scripts/rag/build-tag-review-ui.mjs --queue artifacts/rag/tag-review/tag_review_queue.json --out artifacts/rag/tag-review
node --input-type=module -e "import fs from 'node:fs'; const summary=JSON.parse(fs.readFileSync('artifacts/rag/tag-review/tag_review_summary.json','utf8')); console.log(JSON.stringify({ auto_approved: summary.auto_approved_items, needs_review: summary.needs_review_items, gate_reason_distribution: summary.gate_reason_distribution }, null, 2));"
```

Expected: `needs_review` decreases from 40, and `missing_ai_evidence` no longer appears in `gate_reason_distribution`.

---

## Task 4: Final Verification and Commit

**Files:**
- Verify all modified tracked files.
- Do not stage ignored artifacts or review reports.

- [ ] **Step 1: Run full verification**

Run:

```bash
node scripts/run-tests.mjs default
npm run lint
npm run build
git diff --check
```

Expected: all commands pass.

- [ ] **Step 2: Check status and stage exact files**

Run:

```bash
git status --short
git add docs/superpowers/plans/2026-06-25-p23d-intersection-auto-gate.md docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md interview/mathtrace-project-narrative.md scripts/rag/tag-proposal-merge-core.mjs scripts/tests/rag/tag-proposal-merge-core.test.mjs
```

- [ ] **Step 3: Commit**

Run:

```bash
git commit -m "fix: simplify ai tag auto gate"
```

Expected: one local commit containing only P2.3d plan, merge gate code/tests, and directly related docs.
