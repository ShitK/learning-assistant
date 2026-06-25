import assert from "node:assert/strict";

import {
  buildMergedTagProposals,
  chooseFinalTags,
  summarizeMergedTagProposals,
  validateMergedTagProposals,
} from "../../rag/tag-proposal-merge-core.mjs";
import { getPracticeTagTaxonomy } from "../../rag/practice-tag-taxonomy.mjs";

const taxonomy = getPracticeTagTaxonomy();
const generatedAt = "2026-06-24T00:00:00.000Z";

{
  const merged = buildOne({
    itemId: "auto-approved",
    ruleTags: tags({
      target_skills: ["tangent_slope"],
      method_tags: ["tangent_slope"],
      feature_flags: ["has_choice_options"],
    }),
    aiTags: tags({
      target_skills: ["tangent_slope"],
      method_tags: ["derivative_definition", "tangent_slope"],
      feature_flags: ["has_choice_options"],
    }, "llm"),
  });

  assert.equal(merged.auto_review_records.length, 1);
  assert.equal(merged.review_queue.length, 0);
  assert.equal(merged.auto_review_records[0].tag_source, "llm");
  assert.equal(merged.auto_review_records[0].review_origin, "auto_gate");
  assert.equal(merged.auto_review_records[0].review_status, "approved");
  assert.deepEqual(merged.auto_review_records[0].reviewed_tags.target_skills, ["tangent_slope"]);
  assert.deepEqual(merged.auto_review_records[0].reviewed_tags.feature_flags, ["has_choice_options"]);
}

{
  const conflict = buildOne({
    itemId: "target-conflict",
    ruleTags: tags({ target_skills: ["monotonicity"], method_tags: ["monotonicity_by_derivative"] }),
    aiTags: tags({ target_skills: ["parameter_range"], method_tags: ["parameter_classification"] }, "llm"),
  });

  assert.equal(conflict.auto_review_records.length, 0);
  assert.equal(conflict.review_queue.length, 1);
  assert.equal(conflict.review_queue[0].gate_reasons.includes("target_skill_conflict"), true);
  assert.equal(conflict.review_queue[0].source_candidate_id, "candidate-target-conflict");
  assert.equal(conflict.review_queue[0].question_text, "Synthetic question target-conflict");
  assert.equal(conflict.review_queue[0].section_title, "Synthetic section target-conflict");
  assert.equal(conflict.review_queue[0].source_ref, null);
  assert.equal(conflict.review_queue[0].gate_status, "needs_review");
  assert.equal(conflict.review_queue[0].recommended_review_status, "needs_fix");
}

for (const warning of [
  "unknown_tag_removed",
  "invalid_confidence_removed",
  "invalid_ai_json",
  "invalid_ai_schema",
  "empty_tag_removed",
]) {
  const invalid = buildOne({
    itemId: `warning-${warning}`,
    ruleTags: tags({ target_skills: ["tangent_slope"], method_tags: ["tangent_slope"] }),
    aiTags: tags({ target_skills: ["tangent_slope"], method_tags: ["tangent_slope"] }, "llm"),
    warnings: [warning],
  });

  assert.equal(invalid.review_queue.length, 1);
  assert.equal(invalid.review_queue[0].gate_reasons.includes("invalid_ai_proposal"), true);
}

{
  const evidenceWarningOnly = buildOne({
    itemId: "partial-evidence-removed",
    ruleTags: tags({ target_skills: ["tangent_slope"], method_tags: ["tangent_slope"] }),
    aiTags: tags({ target_skills: ["tangent_slope"], method_tags: ["tangent_slope"] }, "llm"),
    warnings: ["invalid_evidence_terms_removed"],
  });

  assert.equal(evidenceWarningOnly.auto_review_records.length, 1);
  assert.equal(evidenceWarningOnly.review_queue.length, 0);
  assert.equal(
    evidenceWarningOnly.auto_review_records[0].review_notes.includes("ai_evidence_terms_partially_removed"),
    true,
  );
}

{
  const aiAddsMethodAndFeature = buildOne({
    itemId: "ai-adds-method-and-feature",
    ruleTags: tags({
      target_skills: ["tangent_slope"],
      method_tags: ["tangent_slope", "derivative_definition"],
      feature_flags: ["has_choice_options", "has_ln_exp"],
    }),
    aiTags: tags(
      {
        target_skills: ["tangent_slope", "derivative_geometric_meaning"],
        method_tags: ["tangent_slope", "logarithmic_derivative_formula"],
        feature_flags: ["has_choice_options", "has_ln_exp", "has_parameter"],
      },
      "llm",
    ),
  });

  assert.equal(aiAddsMethodAndFeature.auto_review_records.length, 1);
  assert.equal(aiAddsMethodAndFeature.review_queue.length, 0);
  assert.deepEqual(
    aiAddsMethodAndFeature.auto_review_records[0].reviewed_tags.target_skills,
    ["tangent_slope", "derivative_geometric_meaning"],
  );
  assert.deepEqual(
    aiAddsMethodAndFeature.auto_review_records[0].reviewed_tags.method_tags,
    ["tangent_slope", "derivative_definition", "logarithmic_derivative_formula"],
  );
  assert.deepEqual(
    aiAddsMethodAndFeature.auto_review_records[0].reviewed_tags.feature_flags,
    ["has_choice_options", "has_ln_exp", "has_parameter"],
  );
  assert.equal(
    aiAddsMethodAndFeature.auto_review_records[0].review_notes.includes("ai_added_method_tags"),
    true,
  );
  assert.equal(
    aiAddsMethodAndFeature.auto_review_records[0].review_notes.includes("ai_added_feature_flags"),
    true,
  );
}

{
  const derivativeCalculation = buildOne({
    itemId: "derivative-calculation",
    ruleTags: tags({
      target_skills: ["derivative_calculation"],
      method_tags: [
        "quotient_rule",
        "logarithmic_derivative_formula",
        "power_function_derivative",
      ],
      feature_flags: ["has_choice_options", "has_ln_exp"],
    }),
    aiTags: tags(
      {
        target_skills: ["derivative_calculation"],
        method_tags: [
          "quotient_rule",
          "logarithmic_derivative_formula",
          "power_function_derivative",
        ],
        feature_flags: ["has_choice_options", "has_ln_exp"],
      },
      "llm",
    ),
  });

  assert.equal(derivativeCalculation.auto_review_records.length, 1);
  assert.equal(derivativeCalculation.review_queue.length, 0);
  assert.deepEqual(
    derivativeCalculation.auto_review_records[0].reviewed_tags.target_skills,
    ["derivative_calculation"],
  );
  assert.deepEqual(
    derivativeCalculation.auto_review_records[0].reviewed_tags.method_tags,
    [
      "quotient_rule",
      "logarithmic_derivative_formula",
      "power_function_derivative",
    ],
  );
}

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

  assert.equal(missingEvidenceAfterCleanup.auto_review_records.length, 0);
  assert.equal(missingEvidenceAfterCleanup.review_queue.length, 1);
  assert.equal(missingEvidenceAfterCleanup.review_queue[0].gate_reasons.includes("missing_ai_evidence"), true);
}

{
  const needsVisual = buildOne({
    itemId: "ai-needs-visual",
    ruleTags: tags({ target_skills: ["zero_point"], method_tags: ["zero_count"] }),
    aiTags: tags(
      { target_skills: ["zero_point"], method_tags: ["zero_count"], feature_flags: ["needs_visual"] },
      "llm",
    ),
  });

  assert.equal(needsVisual.review_queue.length, 1);
  assert.equal(needsVisual.review_queue[0].gate_reasons.includes("needs_visual"), true);
  assert.equal(hasTag(needsVisual.review_queue[0].proposed_final_tags.feature_flags, "needs_visual"), false);
}

{
  const ruleNeedsVisual = buildOne({
    itemId: "rule-needs-visual",
    ruleTags: tags(
      { target_skills: ["zero_point"], method_tags: ["zero_count"], feature_flags: ["needs_visual"] },
      "rule",
    ),
    aiTags: tags({ target_skills: ["zero_point"], method_tags: ["zero_count"] }, "llm"),
  });

  assert.equal(ruleNeedsVisual.review_queue.length, 1);
  assert.equal(ruleNeedsVisual.review_queue[0].gate_reasons.includes("needs_visual"), true);
  assert.equal(hasTag(ruleNeedsVisual.review_queue[0].proposed_final_tags.feature_flags, "needs_visual"), false);
}

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

  assert.equal(aiMethodWithoutEvidence.auto_review_records.length, 0);
  assert.equal(aiMethodWithoutEvidence.review_queue.length, 1);
  assert.equal(aiMethodWithoutEvidence.review_queue[0].gate_reasons.includes("missing_ai_evidence"), true);
}

{
  const aiAddsFeatureFlags = buildOne({
    itemId: "ai-adds-feature-flags",
    ruleTags: tags({ target_skills: ["tangent_slope"], feature_flags: ["has_choice_options"] }),
    aiTags: tags(
      {
        target_skills: ["tangent_slope"],
        feature_flags: ["has_choice_options", "has_fill_blank", "has_parameter"],
      },
      "llm",
    ),
  });

  assert.equal(aiAddsFeatureFlags.auto_review_records.length, 1);
  assert.equal(aiAddsFeatureFlags.review_queue.length, 0);
  assert.deepEqual(
    aiAddsFeatureFlags.auto_review_records[0].reviewed_tags.feature_flags,
    ["has_choice_options", "has_fill_blank", "has_parameter"],
  );
}

{
  const aiCompletesMissingTarget = buildOne({
    itemId: "ai-completes-missing-target",
    ruleTags: tags({ method_tags: ["zero_count"] }),
    aiTags: tags({ target_skills: ["zero_point"], method_tags: ["zero_count"] }, "llm"),
  });

  assert.equal(aiCompletesMissingTarget.auto_review_records.length, 1);
  assert.equal(aiCompletesMissingTarget.auto_review_records[0].review_status, "approved");
  assert.equal(
    aiCompletesMissingTarget.auto_review_records[0].review_notes.includes("ai_completed_missing_target_skill"),
    true,
  );
  assert.deepEqual(aiCompletesMissingTarget.auto_review_records[0].reviewed_tags.target_skills, ["zero_point"]);
}

{
  const finalTags = chooseFinalTags({
    ruleTags: tags({
      target_skills: ["tangent_slope"],
      method_tags: ["tangent_slope", "zero_count"],
      feature_flags: ["has_choice_options", "needs_visual"],
    }),
    aiTags: tags(
      {
        target_skills: ["tangent_slope", "derivative_geometric_meaning"],
        method_tags: ["tangent_slope", "derivative_definition", "zero_count"],
        feature_flags: ["has_choice_options", "needs_visual"],
      },
      "llm",
    ),
    taxonomy,
  });

  assert.deepEqual(finalTags.target_skills, ["tangent_slope", "derivative_geometric_meaning"]);
  assert.deepEqual(finalTags.method_tags, ["tangent_slope", "derivative_definition", "zero_count"]);
  assert.deepEqual(finalTags.feature_flags, ["has_choice_options"]);
}

{
  const mergedArtifact = buildMergedTagProposals({
    corpus: corpus(["summary-a", "summary-b"]),
    ruleProposalArtifact: artifact("practice-tag-proposal-v0", [
      ruleProposal("summary-a", tags({ target_skills: ["tangent_slope"], method_tags: ["tangent_slope"] })),
      ruleProposal("summary-b", tags({ target_skills: ["monotonicity"], method_tags: ["monotonicity_by_derivative"] })),
    ]),
    aiProposalArtifact: artifact("practice-ai-tag-proposal-v0", [
      aiProposal("summary-a", tags({ target_skills: ["tangent_slope"], method_tags: ["tangent_slope"] }, "llm")),
      aiProposal("summary-b", tags({ target_skills: ["parameter_range"], method_tags: ["parameter_classification"] }, "llm")),
    ]),
    taxonomy,
    generatedAt,
  });
  const summary = summarizeMergedTagProposals(mergedArtifact);
  assert.equal(summary.item_count, 2);
  assert.equal(summary.auto_approved_items, 1);
  assert.equal(summary.needs_review_items, 1);
  assert.equal(summary.conflict_items, 1);

  const validation = validateMergedTagProposals(mergedArtifact, taxonomy);
  assert.equal(validation.ok, true);
}

console.log("tag proposal merge core tests passed");

function buildOne({ itemId, ruleTags, aiTags, warnings = [] }) {
  return buildMergedTagProposals({
    corpus: corpus([itemId]),
    ruleProposalArtifact: artifact("practice-tag-proposal-v0", [ruleProposal(itemId, ruleTags)]),
    aiProposalArtifact: artifact("practice-ai-tag-proposal-v0", [aiProposal(itemId, aiTags, warnings)]),
    taxonomy,
    generatedAt,
  });
}

function corpus(itemIds) {
  return {
    corpus_version: "practice-corpus-v0",
    generated_at: generatedAt,
    item_count: itemIds.length,
    items: itemIds.map((id) => ({
      id,
      source_candidate_id: `candidate-${id}`,
      question_text: `Synthetic question ${id}`,
      section_title: `Synthetic section ${id}`,
      search_text: `Synthetic question ${id}`,
      knowledge_points: ["derivative"],
      source_ref: null,
      review_meta: {},
    })),
  };
}

function artifact(proposalVersion, proposals) {
  return {
    proposal_version: proposalVersion,
    generated_at: generatedAt,
    taxonomy_id: proposalVersion.includes("ai") ? taxonomy.taxonomy_id : undefined,
    item_count: proposals.length,
    proposals,
  };
}

function ruleProposal(itemId, proposedTags) {
  return {
    item_id: itemId,
    source_candidate_id: `candidate-${itemId}`,
    source_ref: null,
    proposed_tags: proposedTags,
    warnings: [],
  };
}

function aiProposal(itemId, proposedTags, warnings = []) {
  return {
    item_id: itemId,
    taxonomy_id: taxonomy.taxonomy_id,
    source_candidate_id: `candidate-${itemId}`,
    source_ref: null,
    proposed_tags: proposedTags,
    item_confidence: "high",
    warnings,
  };
}

function tags({ target_skills = [], method_tags = [], feature_flags = [] }, source = "rule") {
  return {
    target_skills: target_skills.map((tag) => tagObject(tag, source)),
    method_tags: method_tags.map((tag) => tagObject(tag, source)),
    feature_flags: feature_flags.map((tag) => tagObject(tag, source)),
  };
}

function tagObject(tag, source) {
  return {
    tag,
    display_name: tag,
    confidence: "high",
    evidence_terms: [tag],
    source,
  };
}

function hasTag(tags, tag) {
  return tags.some((item) => item === tag || item?.tag === tag);
}
