import { getAllowedTagSets } from "./practice-tag-taxonomy.mjs";

const AI_PROPOSAL_VERSION = "practice-ai-tag-proposal-v0";
const CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);
const TAG_SOURCE = "llm";
const SENSITIVE_PROVIDER_META_KEY_PARTS = [
  "api_key",
  "apikey",
  "authorization",
  "header",
  "prompt",
  "raw",
  "response",
  "secret",
  "token",
];

export function buildAiTagPrompt({ item, ruleProposal, taxonomy }) {
  return {
    system: [
      "You are a MathTrace tag proposal assistant.",
      "Only choose tags from the provided taxonomy.",
      "Return strict JSON only.",
      "Do not invent tag keys.",
      "Treat your answer as a proposal, not final truth.",
    ].join(" "),
    user: JSON.stringify({
      item_id: item?.id,
      question_text: item?.question_text,
      section_title: item?.section_title ?? null,
      source_ref: item?.source_ref ?? null,
      rule_proposal: compactRuleProposal(ruleProposal),
      taxonomy: compactTaxonomy(taxonomy),
      response_schema: {
        target_skills: [{ tag: "string", confidence: "high|medium|low", evidence_terms: ["string"], rationale: "string" }],
        method_tags: [{ tag: "string", confidence: "high|medium|low", evidence_terms: ["string"], rationale: "string" }],
        feature_flags: [{ tag: "string", confidence: "high|medium|low", evidence_terms: ["string"], rationale: "string" }],
        item_confidence: "high|medium|low",
      },
    }),
  };
}

export function parseAiTagProposalResponse({ item, text, taxonomy, ruleProposal }) {
  const warnings = [];
  const parsed = parseJsonObject(text);
  if (!parsed.ok) {
    return buildEmptyProposal({ item, taxonomy, warnings: [parsed.warning] });
  }

  const tagSets = getAllowedTagSets(taxonomy);
  const displayNames = getTaxonomyDisplayNames(taxonomy);
  const allowedEvidence = buildAllowedEvidence({ item, ruleProposal });
  const proposedTags = {
    target_skills: sanitizeTagList(
      parsed.value.target_skills,
      tagSets.targetSkills,
      displayNames.target_skills,
      allowedEvidence,
      warnings,
    ),
    method_tags: sanitizeTagList(
      parsed.value.method_tags,
      tagSets.methodTags,
      displayNames.method_tags,
      allowedEvidence,
      warnings,
    ),
    feature_flags: sanitizeTagList(
      parsed.value.feature_flags,
      tagSets.featureFlags,
      displayNames.feature_flags,
      allowedEvidence,
      warnings,
    ),
  };
  let itemConfidence = parsed.value.item_confidence;
  if (!CONFIDENCE_VALUES.has(itemConfidence)) {
    itemConfidence = "low";
    pushWarning(warnings, "invalid_confidence_removed");
  }

  return {
    item_id: item?.id ?? null,
    taxonomy_id: taxonomy?.taxonomy_id ?? null,
    source_candidate_id: item?.source_candidate_id ?? null,
    source_ref: item?.source_ref ?? null,
    proposed_tags: proposedTags,
    item_confidence: itemConfidence,
    warnings,
  };
}

export function buildAiTagProposalArtifact({
  corpus,
  ruleProposalArtifact,
  taxonomy,
  providerMeta,
  generatedAt,
  sourceCorpusFile,
  sourceRuleProposalFile,
  responsesByItemId,
}) {
  const ruleProposalsByItemId = new Map(
    (ruleProposalArtifact?.proposals ?? []).map((proposal) => [proposal.item_id, proposal]),
  );
  const proposals = (corpus?.items ?? []).map((item) => {
    const responseText = responsesByItemId?.get(item.id) ?? "";
    const ruleProposal = ruleProposalsByItemId.get(item.id);
    const proposal = parseAiTagProposalResponse({ item, text: responseText, taxonomy, ruleProposal });
    return {
      ...proposal,
      rule_proposal: compactRuleProposal(ruleProposal),
    };
  });

  return {
    proposal_version: AI_PROPOSAL_VERSION,
    generated_at: generatedAt,
    source_corpus_file: sourceCorpusFile,
    source_corpus_version: corpus?.corpus_version ?? null,
    source_rule_proposal_file: sourceRuleProposalFile,
    source_rule_proposal_version: ruleProposalArtifact?.proposal_version ?? null,
    taxonomy_id: taxonomy?.taxonomy_id ?? null,
    provider_meta: sanitizeProviderMeta(providerMeta),
    item_count: proposals.length,
    proposals,
  };
}

export function validateAiTagProposalArtifact(value, taxonomy) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["proposal artifact must be an object"] };
  }
  if (value.proposal_version !== AI_PROPOSAL_VERSION) {
    errors.push(`proposal_version must be ${AI_PROPOSAL_VERSION}`);
  }
  if (typeof value.generated_at !== "string" || !value.generated_at.trim()) {
    errors.push("generated_at must be a non-empty string");
  }
  if (value.taxonomy_id !== (taxonomy?.taxonomy_id ?? null)) {
    errors.push("taxonomy_id must match taxonomy.taxonomy_id");
  }
  validateProviderMeta(value.provider_meta, errors);
  if (!Array.isArray(value.proposals)) {
    errors.push("proposals must be an array");
  } else {
    value.proposals.forEach((proposal, index) => validateProposal(proposal, index, taxonomy, errors));
  }
  if (typeof value.item_count !== "number" || value.item_count !== (value.proposals?.length ?? 0)) {
    errors.push("item_count must match proposals length");
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, proposalArtifact: value };
}

export function summarizeAiTagProposals(proposalArtifact) {
  const summary = {
    proposal_version: proposalArtifact?.proposal_version ?? null,
    item_count: Array.isArray(proposalArtifact?.proposals) ? proposalArtifact.proposals.length : 0,
    high_confidence_items: 0,
    medium_confidence_items: 0,
    low_confidence_items: 0,
    needs_review_items: 0,
    target_skill_distribution: {},
    method_tag_distribution: {},
    feature_flag_distribution: {},
    warning_distribution: {},
  };

  for (const proposal of proposalArtifact?.proposals ?? []) {
    if (proposal.item_confidence === "high") summary.high_confidence_items += 1;
    if (proposal.item_confidence === "medium") summary.medium_confidence_items += 1;
    if (proposal.item_confidence === "low") summary.low_confidence_items += 1;
    if ((proposal.warnings ?? []).length > 0) summary.needs_review_items += 1;
    countTags(summary.target_skill_distribution, proposal.proposed_tags?.target_skills);
    countTags(summary.method_tag_distribution, proposal.proposed_tags?.method_tags);
    countTags(summary.feature_flag_distribution, proposal.proposed_tags?.feature_flags);
    for (const warning of proposal.warnings ?? []) {
      summary.warning_distribution[warning] = (summary.warning_distribution[warning] ?? 0) + 1;
    }
  }

  return summary;
}

function compactRuleProposal(ruleProposal) {
  return {
    item_id: ruleProposal?.item_id ?? null,
    proposed_tags: {
      target_skills: compactTags(ruleProposal?.proposed_tags?.target_skills),
      method_tags: compactTags(ruleProposal?.proposed_tags?.method_tags),
      feature_flags: compactTags(ruleProposal?.proposed_tags?.feature_flags),
    },
    warnings: Array.isArray(ruleProposal?.warnings) ? ruleProposal.warnings.filter((warning) => typeof warning === "string") : [],
  };
}

function compactTaxonomy(taxonomy) {
  return {
    taxonomy_id: taxonomy?.taxonomy_id ?? null,
    subject: taxonomy?.subject ?? null,
    unit: taxonomy?.unit ?? null,
    target_skills: compactTagDefinitions(taxonomy?.target_skills),
    method_tags: compactTagDefinitions(taxonomy?.method_tags),
    feature_flags: compactTagDefinitions(taxonomy?.feature_flags),
  };
}

function compactTagDefinitions(tags) {
  return Array.isArray(tags)
    ? tags.map((tag) => ({ key: tag.key, display_name: tag.display_name }))
    : [];
}

function compactTags(tags) {
  return Array.isArray(tags)
    ? tags.map((tag) => ({
        tag: tag.tag,
        confidence: tag.confidence,
        evidence_terms: Array.isArray(tag.evidence_terms) ? tag.evidence_terms.filter((term) => typeof term === "string") : [],
        source: tag.source,
      }))
    : [];
}

function parseJsonObject(text) {
  try {
    const value = JSON.parse(stripJsonFence(text));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, warning: "invalid_ai_schema" };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, warning: "invalid_ai_json" };
  }
}

function stripJsonFence(text) {
  const trimmed = typeof text === "string" ? text.trim() : "";
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function sanitizeTagList(tags, allowedTags, displayNames, allowedEvidence, warnings) {
  if (tags === undefined) {
    return [];
  }
  if (!Array.isArray(tags)) {
    pushWarning(warnings, "invalid_ai_schema");
    return [];
  }

  const sanitized = [];
  for (const tag of tags) {
    if (!tag || typeof tag !== "object" || Array.isArray(tag)) {
      pushWarning(warnings, "invalid_ai_schema");
      continue;
    }
    if (typeof tag.tag !== "string" || !tag.tag.trim()) {
      pushWarning(warnings, typeof tag.tag === "string" ? "empty_tag_removed" : "invalid_ai_schema");
      continue;
    }
    const tagKey = tag.tag.trim();
    if (!allowedTags.has(tagKey)) {
      pushWarning(warnings, "unknown_tag_removed");
      continue;
    }
    if (!CONFIDENCE_VALUES.has(tag.confidence)) {
      pushWarning(warnings, "invalid_confidence_removed");
      continue;
    }

    const evidenceTerms = sanitizeEvidenceTerms(tag.evidence_terms, allowedEvidence, warnings);
    const nextTag = {
      tag: tagKey,
      display_name: displayNames.get(tagKey) ?? tagKey,
      confidence: tag.confidence,
      evidence_terms: evidenceTerms,
      source: TAG_SOURCE,
    };
    if (typeof tag.rationale === "string" && tag.rationale.trim()) {
      nextTag.rationale = tag.rationale.trim();
    }
    pushUniqueTag(sanitized, nextTag);
  }
  return sanitized;
}

function sanitizeEvidenceTerms(evidenceTerms, allowedEvidence, warnings) {
  if (!Array.isArray(evidenceTerms)) {
    if (evidenceTerms !== undefined) pushWarning(warnings, "invalid_evidence_terms_removed");
    return [];
  }
  const sanitized = [];
  for (const term of evidenceTerms) {
    if (typeof term !== "string" || !term.trim()) {
      pushWarning(warnings, "invalid_evidence_terms_removed");
      continue;
    }
    const trimmedTerm = term.trim();
    if (!isAllowedEvidenceTerm(trimmedTerm, allowedEvidence)) {
      pushWarning(warnings, "invalid_evidence_terms_removed");
      continue;
    }
    sanitized.push(trimmedTerm);
  }
  return sanitized;
}

function buildEmptyProposal({ item, taxonomy, warnings }) {
  return {
    item_id: item?.id ?? null,
    taxonomy_id: taxonomy?.taxonomy_id ?? null,
    source_candidate_id: item?.source_candidate_id ?? null,
    source_ref: item?.source_ref ?? null,
    proposed_tags: {
      target_skills: [],
      method_tags: [],
      feature_flags: [],
    },
    item_confidence: "low",
    warnings,
  };
}

function buildAllowedEvidence({ item, ruleProposal }) {
  const sourceTexts = [
    item?.question_text,
    item?.search_text,
    item?.section_title,
    item?.source_ref?.section_title,
  ].filter((value) => typeof value === "string" && value.trim());
  const ruleTerms = new Set();
  for (const tagList of Object.values(ruleProposal?.proposed_tags ?? {})) {
    if (!Array.isArray(tagList)) continue;
    for (const tag of tagList) {
      for (const term of tag?.evidence_terms ?? []) {
        if (typeof term === "string" && term.trim()) {
          ruleTerms.add(term.trim());
        }
      }
    }
  }
  return { sourceTexts, ruleTerms };
}

function isAllowedEvidenceTerm(term, allowedEvidence) {
  if (allowedEvidence.ruleTerms.has(term)) {
    return true;
  }
  return allowedEvidence.sourceTexts.some((sourceText) => sourceText.includes(term));
}

function getTaxonomyDisplayNames(taxonomy) {
  return {
    target_skills: buildDisplayNameMap(taxonomy?.target_skills),
    method_tags: buildDisplayNameMap(taxonomy?.method_tags),
    feature_flags: buildDisplayNameMap(taxonomy?.feature_flags),
  };
}

function buildDisplayNameMap(tags) {
  return new Map(
    Array.isArray(tags)
      ? tags
          .filter((tag) => typeof tag?.key === "string" && typeof tag?.display_name === "string")
          .map((tag) => [tag.key, tag.display_name])
      : [],
  );
}

function sanitizeProviderMeta(providerMeta) {
  const sanitized = {};
  if (!providerMeta || typeof providerMeta !== "object" || Array.isArray(providerMeta)) {
    return sanitized;
  }
  for (const [key, value] of Object.entries(providerMeta)) {
    if (isSensitiveProviderMetaKey(key)) {
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function validateProviderMeta(providerMeta, errors) {
  if (!providerMeta || typeof providerMeta !== "object" || Array.isArray(providerMeta)) {
    errors.push("provider_meta must be an object");
    return;
  }
  for (const [key, value] of Object.entries(providerMeta)) {
    if (isSensitiveProviderMetaKey(key)) {
      errors.push(`provider_meta.${key} is sensitive`);
    }
    if (!(typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null)) {
      errors.push(`provider_meta.${key} must be a primitive value`);
    }
  }
}

function isSensitiveProviderMetaKey(key) {
  const normalized = key.toLowerCase().replace(/[-\s]/g, "_");
  return SENSITIVE_PROVIDER_META_KEY_PARTS.some((part) => normalized.includes(part));
}

function validateProposal(proposal, index, taxonomy, errors) {
  const path = `proposals[${index}]`;
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (typeof proposal.item_id !== "string" || !proposal.item_id.trim()) {
    errors.push(`${path}.item_id must be a non-empty string`);
  }
  if (proposal.taxonomy_id !== (taxonomy?.taxonomy_id ?? null)) {
    errors.push(`${path}.taxonomy_id must match taxonomy.taxonomy_id`);
  }
  if (!CONFIDENCE_VALUES.has(proposal.item_confidence)) {
    errors.push(`${path}.item_confidence is invalid`);
  }
  if (!Array.isArray(proposal.warnings)) {
    errors.push(`${path}.warnings must be an array`);
  }
  const tagSets = getAllowedTagSets(taxonomy);
  validateTagList(proposal.proposed_tags?.target_skills, `${path}.proposed_tags.target_skills`, tagSets.targetSkills, errors);
  validateTagList(proposal.proposed_tags?.method_tags, `${path}.proposed_tags.method_tags`, tagSets.methodTags, errors);
  validateTagList(proposal.proposed_tags?.feature_flags, `${path}.proposed_tags.feature_flags`, tagSets.featureFlags, errors);
}

function validateTagList(tags, path, allowedTags, errors) {
  if (!Array.isArray(tags)) {
    errors.push(`${path} must be an array`);
    return;
  }
  tags.forEach((tag, index) => {
    if (typeof tag?.tag !== "string" || !tag.tag.trim()) {
      errors.push(`${path}[${index}].tag must be a non-empty string`);
    } else if (!allowedTags.has(tag.tag)) {
      errors.push(`${path}[${index}].tag is not in taxonomy`);
    }
    if (!CONFIDENCE_VALUES.has(tag?.confidence)) errors.push(`${path}[${index}].confidence is invalid`);
    if (tag?.source !== TAG_SOURCE) errors.push(`${path}[${index}].source is invalid`);
    if (!Array.isArray(tag?.evidence_terms)) errors.push(`${path}[${index}].evidence_terms must be an array`);
  });
}

function pushUniqueTag(tags, nextTag) {
  if (!tags.some((tag) => tag.tag === nextTag.tag)) {
    tags.push(nextTag);
  }
}

function pushWarning(warnings, warning) {
  if (!warnings.includes(warning)) {
    warnings.push(warning);
  }
}

function countTags(target, tags = []) {
  for (const tag of tags) {
    target[tag.tag] = (target[tag.tag] ?? 0) + 1;
  }
}
