import assert from "node:assert/strict";

import {
  buildEnrichedPracticeCorpus,
  summarizeEnrichedPracticeCorpus,
  validateEnrichedPracticeCorpus,
} from "../../rag/enriched-practice-corpus-core.mjs";

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: null,
  item_count: 3,
  items: [
    {
      id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知函数在点处可导，求曲线切线斜率.",
      search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      difficulty: null,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
      review_meta: { has_manual_correction: true },
    },
    {
      id: "practice-candidate-2",
      source_candidate_id: "candidate-2",
      question_text: "2. 如图，判断零点个数.",
      search_text: "2. 如图，判断零点个数.\n导数",
      knowledge_points: ["derivative"],
      section_title: "考点 4 导数与零点",
      difficulty: null,
      source_ref: { pdf_page_index: 4, section_title: "考点 4 导数与零点" },
      review_meta: {},
    },
    {
      id: "practice-candidate-3",
      source_candidate_id: "candidate-3",
      question_text: "3. 计算函数值.",
      search_text: "3. 计算函数值.",
      knowledge_points: ["derivative"],
      section_title: null,
      difficulty: null,
      source_ref: null,
      review_meta: {},
    },
  ],
};

const proposalArtifact = {
  proposal_version: "practice-tag-proposal-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_corpus_file: "practice_corpus.json",
  source_corpus_version: "practice-corpus-v0",
  item_count: 3,
  proposals: [
    {
      item_id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      source_ref: corpus.items[0].source_ref,
      proposed_tags: {
        target_skills: [{ tag: "tangent_slope", confidence: "high", evidence_terms: ["切线"], source: "rule" }],
        method_tags: [{ tag: "tangent_slope", confidence: "high", evidence_terms: ["切线"], source: "rule" }],
        feature_flags: [],
      },
      warnings: [],
    },
    {
      item_id: "practice-candidate-2",
      source_candidate_id: "candidate-2",
      source_ref: corpus.items[1].source_ref,
      proposed_tags: {
        target_skills: [{ tag: "zero_point", confidence: "high", evidence_terms: ["零点"], source: "rule" }],
        method_tags: [{ tag: "zero_count", confidence: "high", evidence_terms: ["零点"], source: "rule" }],
        feature_flags: [{ tag: "needs_visual", confidence: "high", evidence_terms: ["如图"], source: "rule" }],
      },
      warnings: [],
    },
    {
      item_id: "practice-candidate-3",
      source_candidate_id: "candidate-3",
      source_ref: null,
      proposed_tags: {
        target_skills: [],
        method_tags: [],
        feature_flags: [],
      },
      warnings: ["no_tags_proposed"],
    },
  ],
};

{
  const enriched = buildEnrichedPracticeCorpus({
    corpus,
    proposalArtifact,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });

  assert.equal(enriched.corpus_version, "enriched-practice-corpus-v0");
  assert.equal(enriched.item_count, 3);
  assert.equal(enriched.items[0].question_text, corpus.items[0].question_text);
  assert.deepEqual(enriched.items[0].target_skills, ["tangent_slope"]);
  assert.equal(enriched.items[0].tag_review_meta.review_status, "proposed");
  assert.equal(enriched.items[0].tag_review_meta.tag_source, "rule");
  assert.equal("variant_level" in enriched.items[0], false);
  assert.equal(enriched.items[1].feature_flags.includes("needs_visual"), true);
  assert.equal(enriched.items[2].tag_review_meta.review_status, "needs_fix");
}

{
  const enriched = buildEnrichedPracticeCorpus({
    corpus,
    proposalArtifact,
    acceptRuleProposals: true,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  assert.equal(enriched.items[0].tag_review_meta.review_status, "approved");
  assert.equal(enriched.items[0].tag_review_meta.has_manual_tag_correction, false);
  assert.equal(enriched.items[2].tag_review_meta.review_status, "needs_fix");
}

{
  const reviewRecords = [
    {
      item_id: "practice-candidate-1",
      review_status: "approved",
      reviewed_tags: {
        target_skills: ["tangent_slope", "derivative_definition_limit"],
        method_tags: ["tangent_slope", "derivative_definition"],
        feature_flags: ["has_choice_options"],
      },
      review_notes: "人工补充极限式",
      has_manual_tag_correction: true,
      tag_source: "human",
    },
    {
      item_id: "practice-candidate-2",
      review_status: "skipped",
      reviewed_tags: {
        target_skills: ["zero_point"],
        method_tags: ["zero_count"],
        feature_flags: ["needs_visual"],
      },
      review_notes: "依赖图片",
      has_manual_tag_correction: false,
      tag_source: "human",
    },
  ];
  const enriched = buildEnrichedPracticeCorpus({
    corpus,
    proposalArtifact,
    reviewRecords,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  assert.deepEqual(enriched.items[0].target_skills, ["tangent_slope", "derivative_definition_limit"]);
  assert.equal(enriched.items[0].tag_review_meta.review_status, "approved");
  assert.equal(enriched.items[0].tag_review_meta.has_manual_tag_correction, true);
  assert.equal(enriched.items[0].tag_review_meta.tag_source, "human");
  assert.equal(enriched.items[1].tag_review_meta.review_status, "skipped");
}

{
  assert.throws(
    () =>
      buildEnrichedPracticeCorpus({
        corpus,
        proposalArtifact,
        reviewRecords: [
          {
            item_id: "practice-candidate-1",
            review_status: "approved",
            reviewed_tags: {
              target_skills: ["has_root"],
              method_tags: ["unknown_method"],
              feature_flags: ["has_root"],
            },
            has_manual_tag_correction: true,
            tag_source: "human",
          },
        ],
        sourceCorpusFile: "practice_corpus.json",
        sourceTagProposalFile: "candidate_tag_proposals.json",
        generatedAt: "2026-06-23T00:00:00.000Z",
      }),
    /invalid tag review records/,
  );
  assert.throws(
    () =>
      buildEnrichedPracticeCorpus({
        corpus,
        proposalArtifact,
        reviewRecords: [
          {
            item_id: "practice-candidate-1",
            review_status: "done",
            reviewed_tags: { target_skills: [], method_tags: [], feature_flags: [] },
            has_manual_tag_correction: false,
            tag_source: "robot",
          },
        ],
        sourceCorpusFile: "practice_corpus.json",
        sourceTagProposalFile: "candidate_tag_proposals.json",
        generatedAt: "2026-06-23T00:00:00.000Z",
      }),
    /invalid tag review records/,
  );
}

{
  const enriched = buildEnrichedPracticeCorpus({
    corpus,
    proposalArtifact,
    acceptRuleProposals: true,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  const validation = validateEnrichedPracticeCorpus(enriched);
  assert.equal(validation.ok, true);

  const invalid = structuredClone(enriched);
  invalid.corpus_version = "bad";
  invalid.items[0].target_skills = "bad";
  const invalidValidation = validateEnrichedPracticeCorpus(invalid);
  assert.equal(invalidValidation.ok, false);
  assert.equal(invalidValidation.errors.some((error) => error.includes("corpus_version")), true);
  assert.equal(invalidValidation.errors.some((error) => error.includes("target_skills")), true);
}

{
  const unsafeProposalArtifact = structuredClone(proposalArtifact);
  unsafeProposalArtifact.proposals[0].proposed_tags = {
    target_skills: [{ tag: "中文标签", confidence: "high", evidence_terms: ["切线"], source: "rule" }],
    method_tags: [{ tag: "tangent_slope", confidence: "high", evidence_terms: ["切线"], source: "rule" }],
    feature_flags: [{ tag: "has_root", confidence: "high", evidence_terms: ["根"], source: "rule" }],
  };
  const enriched = buildEnrichedPracticeCorpus({
    corpus,
    proposalArtifact: unsafeProposalArtifact,
    acceptRuleProposals: true,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  const validation = validateEnrichedPracticeCorpus(enriched);
  assert.equal(validation.ok, false);
  assert.equal(validation.errors.some((error) => error.includes("target_skills contains unknown tag: 中文标签")), true);
  assert.equal(validation.errors.some((error) => error.includes("feature_flags contains unknown tag: has_root")), true);
}

{
  const llmProposalArtifact = structuredClone(proposalArtifact);
  llmProposalArtifact.proposals[0].proposed_tags.target_skills[0].source = "llm";
  const enriched = buildEnrichedPracticeCorpus({
    corpus,
    proposalArtifact: llmProposalArtifact,
    acceptRuleProposals: true,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  assert.notEqual(enriched.items[0].tag_review_meta.review_status, "approved");
  assert.equal(enriched.items[0].tag_review_meta.review_status, "needs_fix");
  assert.equal(enriched.items[0].tag_review_meta.tag_source, "llm");
}

{
  const enriched = buildEnrichedPracticeCorpus({
    corpus,
    proposalArtifact,
    acceptRuleProposals: true,
    sourceCorpusFile: "practice_corpus.json",
    sourceTagProposalFile: "candidate_tag_proposals.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  const summary = summarizeEnrichedPracticeCorpus(enriched);
  assert.equal(summary.corpus_version, "enriched-practice-corpus-v0");
  assert.equal(summary.item_count, 3);
  assert.equal(summary.approved_items, 2);
  assert.equal(summary.needs_fix_items, 1);
  assert.equal(summary.needs_visual_items, 1);
  assert.equal(summary.target_skill_distribution.tangent_slope, 1);
}
