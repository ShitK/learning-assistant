import {
  deriveMethodTagsFromTargetSkills,
  getAllowedTagSets,
} from "./practice-tag-taxonomy.mjs";

export const AUTO_APPROVAL_VERSION = "tag-proposal-merge-v0";

const INVALID_AI_WARNING_VALUES = new Set([
  "unknown_tag_removed",
  "empty_tag_removed",
  "invalid_confidence_removed",
  "invalid_ai_json",
  "invalid_ai_schema",
]);

export function buildMergedTagProposals({
  corpus,
  ruleProposalArtifact,
  aiProposalArtifact,
  taxonomy,
  generatedAt,
}) {
  const ruleByItemId = new Map((ruleProposalArtifact?.proposals ?? []).map((proposal) => [proposal.item_id, proposal]));
  const aiByItemId = new Map((aiProposalArtifact?.proposals ?? []).map((proposal) => [proposal.item_id, proposal]));
  const merged_proposals = [];
  const auto_review_records = [];
  const review_queue = [];

  for (const item of corpus?.items ?? []) {
    const itemId = item?.id;
    const ruleProposal = ruleByItemId.get(itemId);
    const aiProposal = aiByItemId.get(itemId) ?? buildMissingAiProposal(itemId, taxonomy);
    const rawRuleTags = ruleProposal?.proposed_tags;
    const rawAiTags = aiProposal?.proposed_tags;
    const ruleTags = normalizeProposalTags(ruleProposal?.proposed_tags);
    const aiTags = normalizeProposalTags(aiProposal?.proposed_tags);
    const gateDecision = getGateDecision({ ruleTags: rawRuleTags, aiTags: rawAiTags, aiProposal });
    const finalTags = chooseFinalTags({ ruleTags, aiTags, taxonomy });
    const mergedProposal = {
      item_id: itemId,
      source_candidate_id: item?.source_candidate_id ?? ruleProposal?.source_candidate_id ?? aiProposal?.source_candidate_id ?? null,
      taxonomy_id: taxonomy?.taxonomy_id ?? null,
      gate_status: gateDecision.status,
      gate_reasons: gateDecision.reasons,
      rule_tags: tagKeyGroups(ruleTags),
      ai_tags: tagKeyGroups(aiTags),
      proposed_final_tags: finalTags,
      ai_confidence: aiProposal?.item_confidence ?? "low",
    };
    merged_proposals.push(mergedProposal);

    if (gateDecision.status === "auto_approved") {
      auto_review_records.push(buildAutoReviewRecord({ itemId, finalTags, gateDecision, taxonomy, aiProposal }));
    } else {
      review_queue.push({
        item_id: itemId,
        source_candidate_id:
          item?.source_candidate_id ?? ruleProposal?.source_candidate_id ?? aiProposal?.source_candidate_id ?? null,
        question_text: item?.question_text ?? null,
        section_title: item?.section_title ?? item?.source_ref?.section_title ?? null,
        source_ref: item?.source_ref ?? ruleProposal?.source_ref ?? aiProposal?.source_ref ?? null,
        gate_status: "needs_review",
        review_status: "needs_review",
        recommended_review_status: "needs_fix",
        taxonomy_id: taxonomy?.taxonomy_id ?? null,
        gate_reasons: gateDecision.reasons,
        proposed_final_tags: finalTags,
        rule_tags: tagKeyGroups(ruleTags),
        ai_tags: tagKeyGroups(aiTags),
        ai_confidence: aiProposal?.item_confidence ?? "low",
        review_origin: "auto_gate",
      });
    }
  }

  return {
    proposal_version: AUTO_APPROVAL_VERSION,
    generated_at: generatedAt,
    source_corpus_version: corpus?.corpus_version ?? null,
    source_rule_proposal_version: ruleProposalArtifact?.proposal_version ?? null,
    source_ai_proposal_version: aiProposalArtifact?.proposal_version ?? null,
    taxonomy_id: taxonomy?.taxonomy_id ?? null,
    item_count: merged_proposals.length,
    merged_proposals,
    auto_review_records,
    review_queue,
  };
}

export function summarizeMergedTagProposals(merged) {
  const reviewQueue = Array.isArray(merged?.review_queue) ? merged.review_queue : [];
  const autoRecords = Array.isArray(merged?.auto_review_records) ? merged.auto_review_records : [];
  const summary = {
    proposal_version: merged?.proposal_version ?? null,
    item_count: Number.isInteger(merged?.item_count) ? merged.item_count : 0,
    auto_approved_items: autoRecords.length,
    needs_review_items: reviewQueue.length,
    needs_visual_items: 0,
    conflict_items: 0,
    gate_reason_distribution: {},
  };

  for (const item of reviewQueue) {
    const reasons = Array.isArray(item?.gate_reasons) ? item.gate_reasons : [];
    if (reasons.includes("needs_visual")) {
      summary.needs_visual_items += 1;
    }
    if (reasons.some((reason) => reason.includes("conflict"))) {
      summary.conflict_items += 1;
    }
    for (const reason of reasons) {
      summary.gate_reason_distribution[reason] = (summary.gate_reason_distribution[reason] ?? 0) + 1;
    }
  }

  return summary;
}

export function validateMergedTagProposals(value, taxonomy) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["merged tag proposals must be an object"] };
  }
  if (value.proposal_version !== AUTO_APPROVAL_VERSION) {
    errors.push(`proposal_version must be ${AUTO_APPROVAL_VERSION}`);
  }
  if (value.taxonomy_id !== (taxonomy?.taxonomy_id ?? null)) {
    errors.push("taxonomy_id must match taxonomy.taxonomy_id");
  }
  if (!Array.isArray(value.merged_proposals)) {
    errors.push("merged_proposals must be an array");
  }
  if (!Array.isArray(value.auto_review_records)) {
    errors.push("auto_review_records must be an array");
  }
  if (!Array.isArray(value.review_queue)) {
    errors.push("review_queue must be an array");
  }
  if (typeof value.item_count !== "number" || value.item_count !== (value.merged_proposals?.length ?? 0)) {
    errors.push("item_count must match merged_proposals length");
  }

  const tagSets = getAllowedTagSets(taxonomy);
  for (const [index, proposal] of (value.merged_proposals ?? []).entries()) {
    validateFinalTags(proposal?.proposed_final_tags, `merged_proposals[${index}].proposed_final_tags`, tagSets, errors);
  }
  for (const [index, record] of (value.auto_review_records ?? []).entries()) {
    if (record?.review_status !== "approved") errors.push(`auto_review_records[${index}].review_status must be approved`);
    if (record?.tag_source !== "llm") errors.push(`auto_review_records[${index}].tag_source must be llm`);
    if (record?.review_origin !== "auto_gate") errors.push(`auto_review_records[${index}].review_origin must be auto_gate`);
    validateFinalTags(record?.reviewed_tags, `auto_review_records[${index}].reviewed_tags`, tagSets, errors);
  }
  for (const [index, item] of (value.review_queue ?? []).entries()) {
    if (!Array.isArray(item?.gate_reasons)) errors.push(`review_queue[${index}].gate_reasons must be an array`);
    validateFinalTags(item?.proposed_final_tags, `review_queue[${index}].proposed_final_tags`, tagSets, errors);
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, merged: value };
}

export function getGateDecision({ ruleTags, aiTags, aiProposal }) {
  const normalizedRuleTags = normalizeTagGroups(ruleTags);
  const normalizedAiTags = normalizeTagGroups(aiTags);
  const blockingReasons = [];
  const successReasons = ["high_confidence_rule_ai_agreement"];

  if (aiProposal?.item_confidence !== "high") {
    blockingReasons.push("ai_not_high_confidence");
  }
  if (hasTag(normalizedAiTags.feature_flags, "needs_visual") || hasTag(normalizedRuleTags.feature_flags, "needs_visual")) {
    blockingReasons.push("needs_visual");
  }
  if (hasUnknownOrInvalidWarnings(aiProposal)) {
    blockingReasons.push("invalid_ai_proposal");
  }
  if (hasWarning(aiProposal, "invalid_evidence_terms_removed")) {
    if (hasAiTagWithoutEvidence(aiTags)) {
      blockingReasons.push("missing_ai_evidence");
    } else {
      successReasons.push("ai_evidence_terms_partially_removed");
    }
  }

  const targetOverlap = intersect(normalizedRuleTags.target_skills, normalizedAiTags.target_skills);
  if (normalizedRuleTags.target_skills.length > 0 && normalizedAiTags.target_skills.length > 0 && targetOverlap.length === 0) {
    blockingReasons.push("target_skill_conflict");
  }
  if (normalizedAiTags.target_skills.length === 0) {
    blockingReasons.push("missing_ai_target_skill");
  }
  if (normalizedAiTags.target_skills.length > 3) {
    blockingReasons.push("too_many_target_skills");
  }
  if (normalizedRuleTags.target_skills.length === 0 && normalizedAiTags.target_skills.length > 0) {
    successReasons.push("ai_completed_missing_target_skill");
  }

  const finalTargetSkills = mergeUnique(normalizedRuleTags.target_skills, normalizedAiTags.target_skills);
  if (hasMethodTagConflict({ ruleTags: normalizedRuleTags, aiTags: normalizedAiTags, finalTargetSkills })) {
    blockingReasons.push("method_tag_conflict");
  }
  if (hasFeatureFlagConflict(normalizedRuleTags.feature_flags, normalizedAiTags.feature_flags)) {
    blockingReasons.push("feature_flag_conflict");
  }

  return blockingReasons.length === 0
    ? { status: "auto_approved", reasons: successReasons }
    : { status: "needs_review", reasons: blockingReasons };
}

export function chooseFinalTags({ ruleTags, aiTags, taxonomy }) {
  const normalizedRuleTags = normalizeTagGroups(ruleTags);
  const normalizedAiTags = normalizeTagGroups(aiTags);
  const target_skills = mergeUnique(normalizedRuleTags.target_skills, normalizedAiTags.target_skills);
  const derivedMethodTags = deriveMethodTagsFromTargetSkills(target_skills, taxonomy);
  const method_tags = mergeUnique(
    derivedMethodTags,
    intersect(normalizedRuleTags.method_tags, normalizedAiTags.method_tags),
    normalizedAiTags.method_tags.filter((tag) => isMethodTagValidForTargets(tag, target_skills, taxonomy)),
  );
  const feature_flags = intersect(normalizedRuleTags.feature_flags, normalizedAiTags.feature_flags).filter((tag) => tag !== "needs_visual");
  return { target_skills, method_tags, feature_flags };
}

function buildAutoReviewRecord({ itemId, finalTags, gateDecision, taxonomy, aiProposal }) {
  const reasons = gateDecision.reasons.join(", ");
  return {
    item_id: itemId,
    review_status: "approved",
    reviewed_tags: {
      target_skills: finalTags.target_skills,
      method_tags: finalTags.method_tags,
      feature_flags: finalTags.feature_flags,
    },
    review_notes: reasons,
    has_manual_tag_correction: false,
    tag_source: "llm",
    taxonomy_id: taxonomy?.taxonomy_id ?? null,
    review_origin: "auto_gate",
    ai_confidence: aiProposal?.item_confidence ?? "low",
    rule_ai_agreement: reasons,
  };
}

function hasUnknownOrInvalidWarnings(aiProposal) {
  return (aiProposal?.warnings ?? []).some((warning) => INVALID_AI_WARNING_VALUES.has(warning));
}

function hasWarning(aiProposal, warning) {
  return (aiProposal?.warnings ?? []).includes(warning);
}

function hasAiTagWithoutEvidence(aiTags) {
  for (const tagList of Object.values(aiTags ?? {})) {
    if (!Array.isArray(tagList)) continue;
    for (const tag of tagList) {
      if (typeof tag === "string") continue;
      const evidenceTerms = tag?.evidence_terms;
      if (!Array.isArray(evidenceTerms) || evidenceTerms.length === 0) {
        return true;
      }
    }
  }
  return false;
}

function hasMethodTagConflict({ ruleTags, aiTags, finalTargetSkills }) {
  if (finalTargetSkills.length === 0) return false;
  const overlappingMethodTags = new Set(intersect(ruleTags.method_tags, aiTags.method_tags));
  return aiTags.method_tags.some(
    (tag) => !overlappingMethodTags.has(tag) && !isMethodTagValidForTargets(tag, finalTargetSkills),
  );
}

function hasFeatureFlagConflict(ruleFeatureFlags, aiFeatureFlags) {
  const ruleNonVisual = ruleFeatureFlags.filter((tag) => tag !== "needs_visual");
  const aiNonVisual = aiFeatureFlags.filter((tag) => tag !== "needs_visual");
  return !sameSet(ruleNonVisual, aiNonVisual);
}

function isMethodTagValidForTargets(methodTag, targetSkills) {
  return deriveMethodTagsFromTargetSkills(targetSkills).includes(methodTag);
}

function normalizeProposalTags(proposedTags) {
  return normalizeTagGroups(proposedTags);
}

function normalizeTagGroups(proposedTags) {
  return {
    target_skills: tagKeys(proposedTags?.target_skills),
    method_tags: tagKeys(proposedTags?.method_tags),
    feature_flags: tagKeys(proposedTags?.feature_flags),
  };
}

function tagKeys(tags) {
  return mergeUnique(
    (Array.isArray(tags) ? tags : [])
      .map((tag) => (typeof tag === "string" ? tag : tag?.tag))
      .filter((tag) => typeof tag === "string" && tag.trim()),
  );
}

function tagKeyGroups(tags) {
  return {
    target_skills: tags.target_skills,
    method_tags: tags.method_tags,
    feature_flags: tags.feature_flags,
  };
}

function buildMissingAiProposal(itemId, taxonomy) {
  return {
    item_id: itemId,
    taxonomy_id: taxonomy?.taxonomy_id ?? null,
    proposed_tags: {
      target_skills: [],
      method_tags: [],
      feature_flags: [],
    },
    item_confidence: "low",
    warnings: ["missing_ai_proposal"],
  };
}

function validateFinalTags(tags, path, tagSets, errors) {
  if (!tags || typeof tags !== "object" || Array.isArray(tags)) {
    errors.push(`${path} must be an object`);
    return;
  }
  validateStringTagList(tags.target_skills, `${path}.target_skills`, tagSets.targetSkills, errors);
  validateStringTagList(tags.method_tags, `${path}.method_tags`, tagSets.methodTags, errors);
  validateStringTagList(tags.feature_flags, `${path}.feature_flags`, tagSets.featureFlags, errors);
  if ((tags.feature_flags ?? []).includes("needs_visual")) {
    errors.push(`${path}.feature_flags must not include needs_visual`);
  }
}

function validateStringTagList(tags, path, allowedTags, errors) {
  if (!Array.isArray(tags)) {
    errors.push(`${path} must be an array`);
    return;
  }
  for (const tag of tags) {
    if (typeof tag !== "string" || !tag.trim()) {
      errors.push(`${path} must contain non-empty strings`);
    } else if (!allowedTags.has(tag)) {
      errors.push(`${path} contains unknown tag: ${tag}`);
    }
  }
}

function intersect(left, right) {
  const rightSet = new Set(right);
  return mergeUnique(left.filter((item) => rightSet.has(item)));
}

function mergeUnique(...groups) {
  const values = [];
  for (const group of groups) {
    for (const item of Array.isArray(group) ? group : []) {
      if (!values.includes(item)) {
        values.push(item);
      }
    }
  }
  return values;
}

function sameSet(left, right) {
  const leftUnique = mergeUnique(left);
  const rightUnique = mergeUnique(right);
  return leftUnique.length === rightUnique.length && leftUnique.every((tag) => rightUnique.includes(tag));
}

function hasTag(tags, tag) {
  return tags.includes(tag);
}
