import assert from "node:assert/strict";

import { getPracticeTagTaxonomy } from "../../rag/practice-tag-taxonomy.mjs";
import {
  buildAiTagPrompt,
  buildAiTagProposalArtifact,
  parseAiTagProposalResponse,
  summarizeAiTagProposals,
  validateAiTagProposalArtifact,
} from "../../rag/ai-tag-proposal-core.mjs";

const taxonomy = getPracticeTagTaxonomy();
const item = {
  id: "practice-candidate-1",
  source_candidate_id: "candidate-1",
  question_text: "1. 已知函数在点处可导，求曲线切线斜率. A. 1 B. 2",
  search_text: "导数\n考点 1 导数的概念",
  section_title: "考点 1 导数的概念",
  source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
};
const ruleProposal = {
  item_id: "practice-candidate-1",
  proposed_tags: {
    target_skills: [{ tag: "tangent_slope", evidence_terms: ["切线", "斜率"], confidence: "high", source: "rule" }],
    method_tags: [{ tag: "tangent_slope", evidence_terms: ["切线", "斜率"], confidence: "high", source: "rule" }],
    feature_flags: [{ tag: "has_choice_options", evidence_terms: ["A.", "B."], confidence: "medium", source: "rule" }],
  },
  warnings: [],
};

const prompt = buildAiTagPrompt({ item, ruleProposal, taxonomy });
assert.equal(prompt.system.includes("Only choose tags from the provided taxonomy"), true);
assert.equal(prompt.user.includes("practice-candidate-1"), true);
assert.equal(prompt.user.includes("VISION_PROVIDER_API_KEY"), false);

const responseText = JSON.stringify({
  target_skills: [{ tag: "tangent_slope", confidence: "high", evidence_terms: ["切线", "斜率"], rationale: "求切线斜率。" }],
  method_tags: [{ tag: "derivative_definition", confidence: "medium", evidence_terms: ["可导"], rationale: "与导数定义有关。" }],
  feature_flags: [{ tag: "has_choice_options", confidence: "medium", evidence_terms: ["A.", "B."], rationale: "有选项。" }],
  item_confidence: "high",
});

const parsed = parseAiTagProposalResponse({ item, text: responseText, taxonomy });
assert.equal(parsed.item_id, "practice-candidate-1");
assert.equal(parsed.taxonomy_id, "math_derivative_v0");
assert.equal(parsed.proposed_tags.target_skills[0].tag, "tangent_slope");
assert.equal(parsed.proposed_tags.target_skills[0].display_name, "切线斜率");
assert.equal(parsed.proposed_tags.target_skills[0].source, "llm");
assert.equal(parsed.warnings.length, 0);

const unknownTag = parseAiTagProposalResponse({
  item,
  text: JSON.stringify({
    target_skills: [{ tag: "conic_section", confidence: "high", evidence_terms: ["曲线"], rationale: "bad" }],
    method_tags: [],
    feature_flags: [],
    item_confidence: "high",
  }),
  taxonomy,
});
assert.equal(unknownTag.warnings.includes("unknown_tag_removed"), true);
assert.equal(unknownTag.proposed_tags.target_skills.length, 0);

const invalidConfidence = parseAiTagProposalResponse({
  item,
  text: JSON.stringify({
    target_skills: [{ tag: "tangent_slope", confidence: "High", evidence_terms: ["切线"], rationale: "bad" }],
    method_tags: [],
    feature_flags: [],
    item_confidence: "high",
  }),
  taxonomy,
});
assert.equal(invalidConfidence.warnings.includes("invalid_confidence_removed"), true);
assert.equal(invalidConfidence.proposed_tags.target_skills.length, 0);

const emptyTag = parseAiTagProposalResponse({
  item,
  text: JSON.stringify({
    target_skills: [{ tag: " ", confidence: "high", evidence_terms: ["切线"], rationale: "bad" }],
    method_tags: [],
    feature_flags: [],
    item_confidence: "high",
  }),
  taxonomy,
});
assert.equal(emptyTag.warnings.includes("empty_tag_removed"), true);

const malformed = parseAiTagProposalResponse({ item, text: "{bad", taxonomy });
assert.equal(malformed.warnings.includes("invalid_ai_json"), true);

const invalidSchema = parseAiTagProposalResponse({ item, text: JSON.stringify([]), taxonomy });
assert.equal(invalidSchema.warnings.includes("invalid_ai_schema"), true);

const invalidEvidenceTerms = parseAiTagProposalResponse({
  item,
  text: JSON.stringify({
    target_skills: [{ tag: "tangent_slope", confidence: "high", evidence_terms: ["切线", 7], rationale: "bad" }],
    method_tags: [],
    feature_flags: [],
    item_confidence: "certain",
  }),
  taxonomy,
});
assert.equal(invalidEvidenceTerms.warnings.includes("invalid_evidence_terms_removed"), true);
assert.equal(invalidEvidenceTerms.warnings.includes("invalid_confidence_removed"), true);
assert.deepEqual(invalidEvidenceTerms.proposed_tags.target_skills[0].evidence_terms, ["切线"]);
assert.equal(invalidEvidenceTerms.item_confidence, "low");

const unsupportedEvidenceTerms = parseAiTagProposalResponse({
  item,
  ruleProposal,
  text: JSON.stringify({
    target_skills: [
      { tag: "tangent_slope", confidence: "high", evidence_terms: ["切线", "AI新增证据词"], rationale: "bad" },
    ],
    method_tags: [
      { tag: "derivative_definition", confidence: "medium", evidence_terms: ["斜率", "可导"], rationale: "ok" },
    ],
    feature_flags: [
      { tag: "has_choice_options", confidence: "medium", evidence_terms: ["A.", "不存在的选项"], rationale: "bad" },
    ],
    item_confidence: "high",
  }),
  taxonomy,
});
assert.equal(unsupportedEvidenceTerms.warnings.includes("invalid_evidence_terms_removed"), true);
assert.deepEqual(unsupportedEvidenceTerms.proposed_tags.target_skills[0].evidence_terms, ["切线"]);
assert.deepEqual(unsupportedEvidenceTerms.proposed_tags.method_tags[0].evidence_terms, ["斜率", "可导"]);
assert.deepEqual(unsupportedEvidenceTerms.proposed_tags.feature_flags[0].evidence_terms, ["A."]);
assert.deepEqual(unsupportedEvidenceTerms.removed_evidence_terms, [
  {
    group: "target_skills",
    tag: "tangent_slope",
    term: "AI新增证据词",
    reason: "not_found_in_source",
  },
  {
    group: "feature_flags",
    tag: "has_choice_options",
    term: "不存在的选项",
    reason: "not_found_in_source",
  },
]);

const fenced = parseAiTagProposalResponse({
  item,
  text: `\`\`\`json\n${responseText}\n\`\`\``,
  taxonomy,
});
assert.equal(fenced.warnings.length, 0);
assert.equal(fenced.item_confidence, "high");

const artifact = buildAiTagProposalArtifact({
  corpus: { corpus_version: "practice-corpus-v0", items: [item] },
  ruleProposalArtifact: { proposal_version: "practice-tag-proposal-v0", proposals: [ruleProposal] },
  taxonomy,
  providerMeta: { provider_name: "fake", model: "fake-model", headers: { authorization: "secret" }, raw_response: "secret" },
  generatedAt: "2026-06-24T00:00:00.000Z",
  sourceCorpusFile: "practice_corpus.json",
  sourceRuleProposalFile: "candidate_tag_proposals.json",
  responsesByItemId: new Map([["practice-candidate-1", responseText]]),
});
const validation = validateAiTagProposalArtifact(artifact, taxonomy);
assert.equal(validation.ok, true);
assert.equal(artifact.proposals[0].taxonomy_id, "math_derivative_v0");
assert.deepEqual(artifact.proposals[0].removed_evidence_terms, []);
assert.equal("headers" in artifact.provider_meta, false);
assert.equal("raw_response" in artifact.provider_meta, false);
const summary = summarizeAiTagProposals(artifact);
assert.equal(summary.item_count, 1);
assert.equal(summary.high_confidence_items, 1);

const mismatchedProposalTaxonomy = validateAiTagProposalArtifact(
  {
    ...artifact,
    proposals: [{ ...artifact.proposals[0], taxonomy_id: "other_taxonomy" }],
  },
  taxonomy,
);
assert.equal(mismatchedProposalTaxonomy.ok, false);
assert.equal(
  mismatchedProposalTaxonomy.errors.some((error) => error.includes("taxonomy_id must match taxonomy.taxonomy_id")),
  true,
);

console.log("ai tag proposal core tests passed");
