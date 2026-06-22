import assert from "node:assert/strict";

import {
  buildTagProposals,
  proposeTagsForItem,
  summarizeTagProposals,
  validateTagProposalArtifact,
} from "../../rag/practice-tag-proposal-core.mjs";

const baseItem = {
  id: "practice-candidate-1",
  source_candidate_id: "candidate-1",
  question_text: "1. 已知函数在点处可导，求曲线切线斜率. A. 1 B. 2 C. 3 D. 4",
  search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数\n考点 1 导数的概念",
  knowledge_points: ["derivative"],
  section_title: "考点 1 导数的概念",
  difficulty: null,
  source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
  review_meta: {},
};

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-23T00:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: null,
  item_count: 5,
  items: [
    baseItem,
    {
      ...baseItem,
      id: "practice-candidate-2",
      source_candidate_id: "candidate-2",
      question_text: "2. 讨论函数单调递增，并求参数取值范围.",
      search_text: "2. 讨论函数单调递增，并求参数取值范围.\n导数\n考点 2 导数与函数的单调性",
      section_title: "考点 2 导数与函数的单调性",
    },
    {
      ...baseItem,
      id: "practice-candidate-3",
      source_candidate_id: "candidate-3",
      question_text: "3. 已知函数 f(x)=ln x + sqrt(x)，求最小值.",
      search_text: "3. 已知函数 f(x)=ln x + sqrt(x)，求最小值.\n导数\n考点 3 导数与极值最值",
      section_title: "考点 3 导数与极值最值",
    },
    {
      ...baseItem,
      id: "practice-candidate-4",
      source_candidate_id: "candidate-4",
      question_text: "4. 如图，根据函数图像判断零点个数.",
      search_text: "4. 如图，根据函数图像判断零点个数.\n导数\n考点 4 导数与零点",
      section_title: "考点 4 导数与零点",
      review_meta: { warnings: ["missing_visual_context"] },
    },
    {
      ...baseItem,
      id: "practice-candidate-5",
      source_candidate_id: "candidate-5",
      question_text: "5. 观察函数图像信息，文字已给出所有条件.",
      search_text: "5. 观察函数图像信息，文字已给出所有条件.\n导数\n考点 5 综合应用",
      section_title: "考点 5 综合应用",
    },
    {
      ...baseItem,
      id: "practice-candidate-6",
      source_candidate_id: "candidate-6",
      question_text: "6. 计算函数值.",
      search_text: "6. 计算函数值.",
      section_title: null,
      source_ref: null,
    },
  ],
};

{
  const proposal = proposeTagsForItem(baseItem);
  assert.deepEqual(
    proposal.proposed_tags.target_skills.map((tag) => tag.tag),
    ["tangent_slope"],
  );
  assert.equal(proposal.proposed_tags.target_skills[0].display_name, "切线斜率");
  assert.deepEqual(
    proposal.proposed_tags.method_tags.map((tag) => tag.tag),
    ["derivative_definition", "tangent_slope"],
  );
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "has_choice_options"),
    true,
  );
  assert.equal(proposal.warnings.length, 0);
}

{
  const proposal = proposeTagsForItem(corpus.items[2]);
  assert.deepEqual(
    proposal.proposed_tags.target_skills.map((tag) => tag.tag),
    ["extrema"],
  );
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "has_ln_exp"),
    true,
  );
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "has_square_root"),
    true,
  );
}

{
  const proposal = proposeTagsForItem(corpus.items[3]);
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "has_graph"),
    true,
  );
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "needs_visual"),
    true,
  );
}

{
  const proposal = proposeTagsForItem(corpus.items[4]);
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "has_graph"),
    true,
  );
  assert.equal(
    proposal.proposed_tags.feature_flags.some((tag) => tag.tag === "needs_visual"),
    false,
  );
}

{
  const proposal = proposeTagsForItem(corpus.items[5]);
  assert.deepEqual(proposal.proposed_tags.target_skills, []);
  assert.equal(proposal.warnings.includes("no_tags_proposed"), true);
}

{
  const artifact = buildTagProposals({
    corpus,
    sourceCorpusFile: "artifacts/rag/practice-corpus/practice_corpus.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  assert.equal(artifact.proposal_version, "practice-tag-proposal-v0");
  assert.equal(artifact.item_count, 6);
  assert.equal(artifact.proposals.length, 6);
  assert.equal(artifact.proposals[0].item_id, "practice-candidate-1");

  const validation = validateTagProposalArtifact(artifact);
  assert.equal(validation.ok, true);

  const invalid = validateTagProposalArtifact({ proposal_version: "bad", proposals: "bad" });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.some((error) => error.includes("proposal_version")), true);
  assert.equal(invalid.errors.some((error) => error.includes("proposals must be an array")), true);
}

{
  const artifact = buildTagProposals({
    corpus,
    sourceCorpusFile: "practice_corpus.json",
    generatedAt: "2026-06-23T00:00:00.000Z",
  });
  const summary = summarizeTagProposals(artifact);
  assert.equal(summary.proposal_version, "practice-tag-proposal-v0");
  assert.equal(summary.item_count, 6);
  assert.equal(summary.high_confidence_items >= 3, true);
  assert.equal(summary.needs_visual_items, 1);
  assert.equal(summary.warning_distribution.no_tags_proposed, 1);
  assert.equal(summary.target_skill_distribution.tangent_slope, 1);
  assert.equal(summary.target_skill_distribution.extrema, 1);
  assert.equal(summary.multi_tag_items >= 1, true);
}
