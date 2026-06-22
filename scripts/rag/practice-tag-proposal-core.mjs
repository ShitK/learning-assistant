import {
  FEATURE_FLAG_DISPLAY_NAMES,
  METHOD_TAG_DISPLAY_NAMES,
  TARGET_SKILL_DISPLAY_NAMES,
} from "./practice-tag-taxonomy.mjs";

const PROPOSAL_VERSION = "practice-tag-proposal-v0";
const CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);
const TAG_SOURCE_VALUES = new Set(["rule"]);

export function buildTagProposals({ corpus, sourceCorpusFile, generatedAt }) {
  const proposals = Array.isArray(corpus?.items) ? corpus.items.map(proposeTagsForItem) : [];
  return {
    proposal_version: PROPOSAL_VERSION,
    generated_at: generatedAt,
    source_corpus_file: sourceCorpusFile,
    source_corpus_version: corpus?.corpus_version ?? null,
    item_count: proposals.length,
    proposals,
  };
}

export function proposeTagsForItem(item) {
  const sourceText = buildSourceText(item);
  const warnings = [];
  const targetSkills = [];
  const methodTags = [];
  const featureFlags = [];

  addTargetSkill(targetSkills, sourceText, {
    tag: "derivative_definition_limit",
    displayName: TARGET_SKILL_DISPLAY_NAMES.derivative_definition_limit,
    terms: ["极限"],
    confidence: hasDerivativeLimitShape(sourceText) ? "high" : "medium",
  });
  addTargetSkill(targetSkills, sourceText, {
    tag: "tangent_slope",
    displayName: TARGET_SKILL_DISPLAY_NAMES.tangent_slope,
    terms: ["切线", "斜率"],
    confidence: "high",
  });
  addTargetSkill(targetSkills, sourceText, {
    tag: "monotonicity",
    displayName: TARGET_SKILL_DISPLAY_NAMES.monotonicity,
    terms: ["单调", "递增", "递减"],
    confidence: "high",
  });
  addTargetSkill(targetSkills, sourceText, {
    tag: "extrema",
    displayName: TARGET_SKILL_DISPLAY_NAMES.extrema,
    terms: ["极值", "最值", "最大值", "最小值"],
    confidence: "high",
  });
  addTargetSkill(targetSkills, sourceText, {
    tag: "zero_point",
    displayName: TARGET_SKILL_DISPLAY_NAMES.zero_point,
    terms: ["零点", "交点"],
    confidence: "high",
  });
  addTargetSkill(targetSkills, sourceText, {
    tag: "parameter_range",
    displayName: TARGET_SKILL_DISPLAY_NAMES.parameter_range,
    terms: ["参数", "恒成立", "取值范围"],
    confidence: "high",
  });

  for (const target of targetSkills) {
    addMethodTagsForTarget(methodTags, target);
  }
  addMethodTag(methodTags, sourceText, {
    tag: "inequality_with_derivative",
    displayName: METHOD_TAG_DISPLAY_NAMES.inequality_with_derivative,
    terms: ["不等式", "恒成立"],
    confidence: "medium",
  });

  addFeatureFlag(featureFlags, sourceText, {
    tag: "has_choice_options",
    displayName: FEATURE_FLAG_DISPLAY_NAMES.has_choice_options,
    terms: ["A.", "B.", "C.", "D."],
    confidence: "medium",
  });
  addFeatureFlag(featureFlags, sourceText, {
    tag: "has_fill_blank",
    displayName: FEATURE_FLAG_DISPLAY_NAMES.has_fill_blank,
    terms: ["____", "填空", "________"],
    confidence: "medium",
  });
  addFeatureFlag(featureFlags, sourceText, {
    tag: "has_ln_exp",
    displayName: FEATURE_FLAG_DISPLAY_NAMES.has_ln_exp,
    terms: ["ln", "e^", "exp"],
    confidence: "medium",
  });
  addFeatureFlag(featureFlags, sourceText, {
    tag: "has_square_root",
    displayName: FEATURE_FLAG_DISPLAY_NAMES.has_square_root,
    terms: ["sqrt", "√", "根号"],
    confidence: "medium",
  });
  addFeatureFlag(featureFlags, sourceText, {
    tag: "has_graph",
    displayName: FEATURE_FLAG_DISPLAY_NAMES.has_graph,
    terms: ["如图", "图像", "图象"],
    confidence: "medium",
  });
  if (hasVisualDependency(item, sourceText)) {
    pushUniqueTag(featureFlags, {
      tag: "needs_visual",
      display_name: FEATURE_FLAG_DISPLAY_NAMES.needs_visual,
      confidence: "high",
      evidence_terms: ["如图"],
      source: "rule",
    });
  }

  if (targetSkills.length === 0 && methodTags.length === 0 && featureFlags.length === 0) {
    warnings.push("no_tags_proposed");
  }

  return {
    item_id: item.id,
    source_candidate_id: item.source_candidate_id,
    source_ref: item.source_ref ?? null,
    proposed_tags: {
      target_skills: targetSkills,
      method_tags: methodTags,
      feature_flags: featureFlags,
    },
    warnings,
  };
}

export function summarizeTagProposals(proposalArtifact) {
  const summary = {
    proposal_version: proposalArtifact?.proposal_version ?? null,
    item_count: Array.isArray(proposalArtifact?.proposals) ? proposalArtifact.proposals.length : 0,
    high_confidence_items: 0,
    medium_confidence_items: 0,
    low_confidence_items: 0,
    needs_visual_items: 0,
    needs_fix_items: 0,
    multi_tag_items: 0,
    target_skill_distribution: {},
    method_tag_distribution: {},
    feature_flag_distribution: {},
    warning_distribution: {},
  };

  for (const proposal of proposalArtifact?.proposals ?? []) {
    const tags = flattenProposalTags(proposal);
    const confidence = summarizeItemConfidence(tags);
    if (confidence === "high") summary.high_confidence_items += 1;
    if (confidence === "medium") summary.medium_confidence_items += 1;
    if (confidence === "low") summary.low_confidence_items += 1;
    if (tags.length > 1) summary.multi_tag_items += 1;
    if (proposal.proposed_tags?.feature_flags?.some((tag) => tag.tag === "needs_visual")) {
      summary.needs_visual_items += 1;
    }
    if ((proposal.warnings ?? []).includes("no_tags_proposed")) {
      summary.needs_fix_items += 1;
    }
    countTags(summary.target_skill_distribution, proposal.proposed_tags?.target_skills);
    countTags(summary.method_tag_distribution, proposal.proposed_tags?.method_tags);
    countTags(summary.feature_flag_distribution, proposal.proposed_tags?.feature_flags);
    for (const warning of proposal.warnings ?? []) {
      summary.warning_distribution[warning] = (summary.warning_distribution[warning] ?? 0) + 1;
    }
  }

  return summary;
}

export function validateTagProposalArtifact(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["proposal artifact must be an object"] };
  }
  if (value.proposal_version !== PROPOSAL_VERSION) {
    errors.push(`proposal_version must be ${PROPOSAL_VERSION}`);
  }
  if (!Array.isArray(value.proposals)) {
    errors.push("proposals must be an array");
  } else {
    value.proposals.forEach((proposal, index) => validateProposal(proposal, index, errors));
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, proposalArtifact: value };
}

function buildSourceText(item) {
  return [
    item?.question_text,
    item?.search_text,
    item?.section_title,
    item?.source_ref?.section_title,
  ]
    .filter((part) => typeof part === "string")
    .join("\n");
}

function hasDerivativeLimitShape(sourceText) {
  return /\blim\b|Δx|→/.test(sourceText);
}

function addTargetSkill(targetSkills, sourceText, rule) {
  const evidenceTerms = rule.terms.filter((term) => sourceText.includes(term));
  if (evidenceTerms.length === 0) return;
  pushUniqueTag(targetSkills, {
    tag: rule.tag,
    display_name: rule.displayName,
    confidence: rule.confidence,
    evidence_terms: evidenceTerms,
    source: "rule",
  });
}

function addMethodTagsForTarget(methodTags, targetTag) {
  const rules = {
    derivative_definition_limit: ["derivative_definition"],
    tangent_slope: ["derivative_definition", "tangent_slope"],
    monotonicity: ["monotonicity_by_derivative"],
    extrema: ["extremum_by_derivative"],
    zero_point: ["zero_count"],
    parameter_range: ["parameter_classification"],
  };
  for (const methodTag of rules[targetTag.tag] ?? []) {
    pushUniqueTag(methodTags, {
      tag: methodTag,
      display_name: METHOD_TAG_DISPLAY_NAMES[methodTag] ?? methodTag,
      confidence: targetTag.confidence,
      evidence_terms: targetTag.evidence_terms,
      source: "rule",
    });
  }
}

function addMethodTag(methodTags, sourceText, rule) {
  const evidenceTerms = rule.terms.filter((term) => sourceText.includes(term));
  if (evidenceTerms.length === 0) return;
  pushUniqueTag(methodTags, {
    tag: rule.tag,
    display_name: rule.displayName,
    confidence: rule.confidence,
    evidence_terms: evidenceTerms,
    source: "rule",
  });
}

function addFeatureFlag(featureFlags, sourceText, rule) {
  const evidenceTerms = rule.terms.filter((term) => sourceText.includes(term));
  if (evidenceTerms.length === 0) return;
  pushUniqueTag(featureFlags, {
    tag: rule.tag,
    display_name: rule.displayName,
    confidence: rule.confidence,
    evidence_terms: evidenceTerms,
    source: "rule",
  });
}

function hasVisualDependency(item, sourceText) {
  const warnings = Array.isArray(item?.review_meta?.warnings) ? item.review_meta.warnings : [];
  return (
    sourceText.includes("如图") ||
    warnings.includes("missing_visual_context") ||
    warnings.includes("needs_visual")
  );
}

function pushUniqueTag(tags, nextTag) {
  if (!tags.some((tag) => tag.tag === nextTag.tag)) {
    tags.push(nextTag);
  }
}

function flattenProposalTags(proposal) {
  return [
    ...(proposal?.proposed_tags?.target_skills ?? []),
    ...(proposal?.proposed_tags?.method_tags ?? []),
    ...(proposal?.proposed_tags?.feature_flags ?? []),
  ];
}

function summarizeItemConfidence(tags) {
  if (tags.some((tag) => tag.confidence === "high")) return "high";
  if (tags.some((tag) => tag.confidence === "medium")) return "medium";
  return "low";
}

function countTags(target, tags = []) {
  for (const tag of tags) {
    target[tag.tag] = (target[tag.tag] ?? 0) + 1;
  }
}

function validateProposal(proposal, index, errors) {
  const path = `proposals[${index}]`;
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (typeof proposal.item_id !== "string" || !proposal.item_id.trim()) {
    errors.push(`${path}.item_id must be a non-empty string`);
  }
  validateTagList(proposal.proposed_tags?.target_skills, `${path}.proposed_tags.target_skills`, errors);
  validateTagList(proposal.proposed_tags?.method_tags, `${path}.proposed_tags.method_tags`, errors);
  validateTagList(proposal.proposed_tags?.feature_flags, `${path}.proposed_tags.feature_flags`, errors);
}

function validateTagList(tags, path, errors) {
  if (!Array.isArray(tags)) {
    errors.push(`${path} must be an array`);
    return;
  }
  tags.forEach((tag, index) => {
    if (typeof tag?.tag !== "string" || !tag.tag.trim()) errors.push(`${path}[${index}].tag must be a non-empty string`);
    if (!CONFIDENCE_VALUES.has(tag?.confidence)) errors.push(`${path}[${index}].confidence is invalid`);
    if (!TAG_SOURCE_VALUES.has(tag?.source)) errors.push(`${path}[${index}].source is invalid`);
    if (!Array.isArray(tag?.evidence_terms)) errors.push(`${path}[${index}].evidence_terms must be an array`);
  });
}
