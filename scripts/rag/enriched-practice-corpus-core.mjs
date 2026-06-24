import {
  FEATURE_FLAG_DISPLAY_NAMES,
  METHOD_TAG_DISPLAY_NAMES,
  TARGET_SKILL_DISPLAY_NAMES,
} from "./practice-tag-taxonomy.mjs";

const ENRICHED_CORPUS_VERSION = "enriched-practice-corpus-v0";
const REVIEW_STATUS_VALUES = new Set(["proposed", "approved", "needs_fix", "skipped"]);
const TAG_SOURCE_VALUES = new Set(["rule", "human", "llm"]);
const TARGET_SKILL_KEYS = new Set(Object.keys(TARGET_SKILL_DISPLAY_NAMES));
const METHOD_TAG_KEYS = new Set(Object.keys(METHOD_TAG_DISPLAY_NAMES));
const FEATURE_FLAG_KEYS = new Set(Object.keys(FEATURE_FLAG_DISPLAY_NAMES));

export function buildEnrichedPracticeCorpus({
  corpus,
  proposalArtifact,
  reviewRecords = [],
  acceptRuleProposals = false,
  sourceCorpusFile,
  sourceTagProposalFile,
  generatedAt,
}) {
  const reviewErrors = validateReviewRecords(reviewRecords);
  if (reviewErrors.length > 0) {
    throw new Error(`invalid tag review records: ${reviewErrors.join(", ")}`);
  }
  const proposalsByItemId = new Map((proposalArtifact?.proposals ?? []).map((proposal) => [proposal.item_id, proposal]));
  const reviewsByItemId = new Map(reviewRecords.map((record) => [record.item_id, record]));
  const items = (corpus?.items ?? []).map((item) => {
    const proposal = proposalsByItemId.get(item.id);
    const reviewRecord = reviewsByItemId.get(item.id);
    const tagData = buildItemTagData({ proposal, reviewRecord, acceptRuleProposals });
    return {
      ...item,
      target_skills: tagData.target_skills,
      method_tags: tagData.method_tags,
      feature_flags: tagData.feature_flags,
      tag_review_meta: tagData.tag_review_meta,
    };
  });
  return {
    corpus_version: ENRICHED_CORPUS_VERSION,
    generated_at: generatedAt,
    source_corpus_file: sourceCorpusFile,
    source_tag_proposal_file: sourceTagProposalFile,
    item_count: items.length,
    items,
  };
}

export function summarizeEnrichedPracticeCorpus(corpus) {
  const summary = {
    corpus_version: corpus?.corpus_version ?? null,
    item_count: Array.isArray(corpus?.items) ? corpus.items.length : 0,
    approved_items: 0,
    proposed_items: 0,
    needs_fix_items: 0,
    skipped_items: 0,
    needs_visual_items: 0,
    target_skill_distribution: {},
    method_tag_distribution: {},
    feature_flag_distribution: {},
  };
  for (const item of corpus?.items ?? []) {
    const status = item.tag_review_meta?.review_status;
    if (status === "approved") summary.approved_items += 1;
    if (status === "proposed") summary.proposed_items += 1;
    if (status === "needs_fix") summary.needs_fix_items += 1;
    if (status === "skipped") summary.skipped_items += 1;
    if (item.feature_flags?.includes("needs_visual")) summary.needs_visual_items += 1;
    countValues(summary.target_skill_distribution, item.target_skills);
    countValues(summary.method_tag_distribution, item.method_tags);
    countValues(summary.feature_flag_distribution, item.feature_flags);
  }
  return summary;
}

export function validateEnrichedPracticeCorpus(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["enriched corpus must be an object"] };
  }
  if (value.corpus_version !== ENRICHED_CORPUS_VERSION) {
    errors.push(`corpus_version must be ${ENRICHED_CORPUS_VERSION}`);
  }
  if (!Array.isArray(value.items)) {
    errors.push("items must be an array");
  } else {
    value.items.forEach((item, index) => validateEnrichedItem(item, index, errors));
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, corpus: value };
}

function validateReviewRecords(records) {
  const errors = [];
  if (!Array.isArray(records)) {
    return ["review records must be an array"];
  }
  records.forEach((record, index) => {
    const path = `reviewRecords[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`${path} must be an object`);
      return;
    }
    if (typeof record.item_id !== "string" || !record.item_id.trim()) {
      errors.push(`${path}.item_id must be a non-empty string`);
    }
    if (!REVIEW_STATUS_VALUES.has(record.review_status)) {
      errors.push(`${path}.review_status is invalid`);
    }
    if (!TAG_SOURCE_VALUES.has(record.tag_source ?? "human")) {
      errors.push(`${path}.tag_source is invalid`);
    }
    validateKnownTags(record.reviewed_tags?.target_skills, TARGET_SKILL_KEYS, `${path}.reviewed_tags.target_skills`, errors);
    validateKnownTags(record.reviewed_tags?.method_tags, METHOD_TAG_KEYS, `${path}.reviewed_tags.method_tags`, errors);
    validateKnownTags(record.reviewed_tags?.feature_flags, FEATURE_FLAG_KEYS, `${path}.reviewed_tags.feature_flags`, errors);
  });
  return errors;
}

function validateKnownTags(values, allowedValues, path, errors) {
  for (const value of uniqueStrings(values)) {
    if (!allowedValues.has(value)) {
      errors.push(`${path} contains unknown tag: ${value}`);
    }
  }
}

function buildItemTagData({ proposal, reviewRecord, acceptRuleProposals }) {
  if (reviewRecord) {
    return {
      target_skills: uniqueStrings(reviewRecord.reviewed_tags?.target_skills),
      method_tags: uniqueStrings(reviewRecord.reviewed_tags?.method_tags),
      feature_flags: uniqueStrings(reviewRecord.reviewed_tags?.feature_flags),
      tag_review_meta: {
        review_status: reviewRecord.review_status,
        proposal_confidence: summarizeProposalConfidence(proposal),
        has_manual_tag_correction: Boolean(reviewRecord.has_manual_tag_correction),
        tag_source: reviewRecord.tag_source ?? "human",
        taxonomy_id: reviewRecord.taxonomy_id ?? null,
        review_origin: reviewRecord.review_origin ?? null,
        ai_confidence: reviewRecord.ai_confidence ?? null,
        rule_ai_agreement: reviewRecord.rule_ai_agreement ?? null,
      },
    };
  }

  const targetSkills = extractProposalTagKeys(proposal?.proposed_tags?.target_skills);
  const methodTags = extractProposalTagKeys(proposal?.proposed_tags?.method_tags);
  const featureFlags = extractProposalTagKeys(proposal?.proposed_tags?.feature_flags);
  const hasNoTags = targetSkills.length === 0 && methodTags.length === 0 && featureFlags.length === 0;
  const proposalTags = flattenProposalTags(proposal);
  const hasOnlyRuleTags = proposalTags.every((tag) => tag.source === "rule");
  const reviewStatus = getProposalReviewStatus({
    hasNoTags,
    hasOnlyRuleTags,
    acceptRuleProposals,
  });
  return {
    target_skills: targetSkills,
    method_tags: methodTags,
    feature_flags: featureFlags,
    tag_review_meta: {
      review_status: reviewStatus,
      proposal_confidence: summarizeProposalConfidence(proposal),
      has_manual_tag_correction: false,
      tag_source: summarizeProposalSource(proposalTags),
    },
  };
}

function getProposalReviewStatus({ hasNoTags, hasOnlyRuleTags, acceptRuleProposals }) {
  if (hasNoTags) return "needs_fix";
  if (!hasOnlyRuleTags) return "needs_fix";
  return acceptRuleProposals ? "approved" : "proposed";
}

function extractProposalTagKeys(tags = []) {
  return uniqueStrings(tags.map((tag) => tag.tag));
}

function flattenProposalTags(proposal) {
  return [
    ...(proposal?.proposed_tags?.target_skills ?? []),
    ...(proposal?.proposed_tags?.method_tags ?? []),
    ...(proposal?.proposed_tags?.feature_flags ?? []),
  ];
}

function summarizeProposalSource(tags) {
  const sources = uniqueStrings(tags.map((tag) => tag.source));
  if (sources.length === 1 && TAG_SOURCE_VALUES.has(sources[0])) {
    return sources[0];
  }
  return sources.some((source) => source !== "rule") ? "llm" : "rule";
}

function summarizeProposalConfidence(proposal) {
  const tags = flattenProposalTags(proposal);
  if (tags.some((tag) => tag.confidence === "high")) return "high";
  if (tags.some((tag) => tag.confidence === "medium")) return "medium";
  if (tags.some((tag) => tag.confidence === "low")) return "low";
  return "low";
}

function uniqueStrings(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()))]
    : [];
}

function countValues(target, values = []) {
  for (const value of values) {
    target[value] = (target[value] ?? 0) + 1;
  }
}

function validateEnrichedItem(item, index, errors) {
  const path = `items[${index}]`;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    errors.push(`${path} must be an object`);
    return;
  }
  requireString(item, "id", errors, path);
  requireString(item, "question_text", errors, path);
  requireStringArray(item.target_skills, `${path}.target_skills`, errors);
  requireStringArray(item.method_tags, `${path}.method_tags`, errors);
  requireStringArray(item.feature_flags, `${path}.feature_flags`, errors);
  validateKnownTags(item.target_skills, TARGET_SKILL_KEYS, `${path}.target_skills`, errors);
  validateKnownTags(item.method_tags, METHOD_TAG_KEYS, `${path}.method_tags`, errors);
  validateKnownTags(item.feature_flags, FEATURE_FLAG_KEYS, `${path}.feature_flags`, errors);
  if (!item.tag_review_meta || typeof item.tag_review_meta !== "object") {
    errors.push(`${path}.tag_review_meta must be an object`);
  } else {
    if (!REVIEW_STATUS_VALUES.has(item.tag_review_meta.review_status)) {
      errors.push(`${path}.tag_review_meta.review_status is invalid`);
    }
    if (!TAG_SOURCE_VALUES.has(item.tag_review_meta.tag_source)) {
      errors.push(`${path}.tag_review_meta.tag_source is invalid`);
    }
  }
  if ("variant_level" in item) {
    errors.push(`${path}.variant_level must not be present`);
  }
}

function requireString(item, key, errors, path) {
  if (typeof item[key] !== "string") {
    errors.push(`${path}.${key} must be a string`);
  }
}

function requireStringArray(value, path, errors) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    errors.push(`${path} must be an array of strings`);
  }
}
