import assert from "node:assert/strict";

import {
  analyzePracticeNeed,
  recommendVariantPractice,
} from "../../rag/variant-practice-agent-core.mjs";

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-22T10:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: "2026-06-22T09:00:00.000Z",
  item_count: 5,
  items: [
    {
      id: "practice-candidate-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知函数在点处可导，求曲线切线斜率.",
      search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数\n考点 1 导数的概念",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      difficulty: null,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
      review_meta: { original_question_text: "ocr text" },
      variant_level: "should_not_leak",
    },
    {
      id: "practice-candidate-2",
      source_candidate_id: "candidate-2",
      question_text: "2. 已知极限表达式，判断导数几何意义.",
      search_text: "2. 已知极限表达式，判断导数几何意义.\n导数\n考点 1 导数的概念",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      difficulty: null,
      source_ref: { pdf_page_index: 2, section_title: "考点 1 导数的概念" },
      review_meta: {},
    },
    {
      id: "practice-candidate-3",
      source_candidate_id: "candidate-3",
      question_text: "3. 结合切线斜率判断函数单调递增，求参数范围.",
      search_text:
        "3. 结合切线斜率判断函数单调递增，求参数范围.\n导数\n考点 2 导数与函数的单调性",
      knowledge_points: ["derivative"],
      section_title: "考点 2 导数与函数的单调性",
      difficulty: null,
      source_ref: { pdf_page_index: 3, section_title: "考点 2 导数与函数的单调性" },
      review_meta: {},
    },
    {
      id: "practice-candidate-4",
      source_candidate_id: "candidate-4",
      question_text: "4. 研究函数零点个数.",
      search_text: "4. 研究函数零点个数.\n函数图像\n考点 4 函数与零点",
      knowledge_points: ["derivative"],
      section_title: "考点 4 函数零点",
      difficulty: null,
      source_ref: { pdf_page_index: 4, section_title: "考点 4 函数零点" },
      review_meta: {},
    },
    {
      id: "practice-candidate-5",
      source_candidate_id: "candidate-5",
      question_text: "5. 三角函数求值.",
      search_text: "5. 三角函数求值.\n三角函数",
      knowledge_points: ["trigonometry"],
      section_title: "三角函数",
      difficulty: null,
      source_ref: { pdf_page_index: 5, section_title: "三角函数" },
      review_meta: {},
    },
  ],
};

const query = {
  id: "demo-derivative-tangent-slope",
  question_text: "设函数在点处可导，已知极限式，求切线斜率.",
  knowledge_points: ["derivative"],
  section_title: "考点 1 导数的概念",
  mistake_causes: ["derivative_definition_confusion"],
  target_skills: ["导数几何意义", "切线斜率", "极限式识别导数"],
};

{
  const practiceNeed = analyzePracticeNeed(query);
  assert.deepEqual(practiceNeed.knowledge_points, ["derivative"]);
  assert.deepEqual(practiceNeed.target_skills, ["导数几何意义", "切线斜率", "极限式识别导数"]);
  assert.deepEqual(practiceNeed.mistake_causes, ["derivative_definition_confusion"]);
  assert.equal(practiceNeed.summary.includes("导数几何意义"), true);
  assert.equal(practiceNeed.summary.includes("切线斜率"), true);
  assert.equal("section_title" in practiceNeed, false);
}

{
  const result = recommendVariantPractice({ corpus, query, searchLimit: 5 });
  assert.equal(result.agent_version, "variant-practice-agent-v0");
  assert.equal(result.query_id, "demo-derivative-tangent-slope");
  assert.equal(result.practice_goal.summary.includes("切线斜率"), true);
  assert.equal("section_title" in result.practice_goal, false);
  assert.deepEqual(
    result.agent_steps.map((step) => step.id),
    ["analyze_practice_need", "search_corpus", "rank_candidates", "build_recommendations"],
  );
  assert.equal(result.rationale.includes("同章节"), true);
  assert.equal(result.search_summary.corpus_version, "practice-corpus-v0");
  assert.equal(result.search_summary.searched_items, 5);
  assert.equal(result.search_summary.candidate_count, 4);
  assert.equal(result.recommendations.length, 3);
  assert.equal(result.rationale.includes("最后做综合应用"), true);
  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.rank),
    [1, 2, 3],
  );
  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.recommendation_type),
    ["foundation", "near_transfer", "mixed_application"],
  );
  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.item_id),
    ["practice-candidate-1", "practice-candidate-3", "practice-candidate-4"],
  );
  assert.equal(result.recommendations[0].reason.includes("第一道"), true);
  assert.equal(result.recommendations[0].matched_dimensions.includes("knowledge_point"), true);
  assert.equal(result.recommendations[0].matched_dimensions.includes("section_title"), true);
  assert.notEqual(
    result.recommendations[1].source_ref.section_title,
    result.recommendations[0].source_ref.section_title,
  );
  assert.equal(result.recommendations[1].matched_dimensions.includes("target_skill"), true);
  assert.equal(result.recommendations[2].matched_dimensions.includes("target_skill"), false);
  assert.equal("review_meta" in result.recommendations[0], false);
  assert.equal("variant_level" in result.recommendations[0], false);
}

{
  const rankTrapCorpus = {
    ...corpus,
    item_count: 3,
    items: [corpus.items[2], corpus.items[0], corpus.items[3]],
  };
  const result = recommendVariantPractice({ corpus: rankTrapCorpus, query, searchLimit: 3 });
  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.recommendation_type),
    ["foundation", "near_transfer", "mixed_application"],
  );
  assert.equal(result.recommendations[0].item_id, "practice-candidate-1");
}

{
  const tinyCorpus = {
    ...corpus,
    item_count: 1,
    items: [corpus.items[0]],
  };
  const result = recommendVariantPractice({ corpus: tinyCorpus, query, searchLimit: 4 });
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.warnings.includes("insufficient_recommendations"), true);
  assert.equal(result.rationale.includes("后续等题源足够后再补充迁移题"), true);
  assert.equal(result.rationale.includes("最后做综合应用"), false);
}

{
  const twoRecommendationCorpus = {
    ...corpus,
    item_count: 2,
    items: [corpus.items[0], corpus.items[2]],
  };
  const result = recommendVariantPractice({
    corpus: twoRecommendationCorpus,
    query,
    searchLimit: 4,
  });
  assert.equal(result.recommendations.length, 2);
  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.recommendation_type),
    ["foundation", "near_transfer"],
  );
  assert.equal(result.warnings.includes("insufficient_recommendations"), true);
  assert.equal(result.rationale.includes("综合应用题当前 corpus 还不足以稳定推荐"), true);
  assert.equal(result.rationale.includes("最后做综合应用"), false);
}

{
  const noMatchResult = recommendVariantPractice({
    corpus,
    query: {
      id: "no-match",
      question_text: "",
      knowledge_points: [],
      target_skills: [],
      mistake_causes: [],
    },
    searchLimit: 4,
  });
  assert.equal(noMatchResult.recommendations.length, 0);
  assert.equal(noMatchResult.warnings.includes("no_candidates_found"), true);
  assert.equal(noMatchResult.rationale.includes("不强行推荐"), true);
}

{
  const enrichedCorpus = {
    corpus_version: "enriched-practice-corpus-v0",
    generated_at: "2026-06-23T00:00:00.000Z",
    source_corpus_file: "practice_corpus.json",
    source_tag_proposal_file: "candidate_tag_proposals.json",
    item_count: 4,
    items: [
      buildEnrichedTestItem({
        id: "foundation",
        section_title: "考点 1 导数的概念",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope", "derivative_definition"],
      }),
      buildEnrichedTestItem({
        id: "near-transfer",
        section_title: "考点 2 导数与函数的单调性",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope", "derivative_definition"],
      }),
      buildEnrichedTestItem({
        id: "mixed-application",
        section_title: "考点 3 导数综合应用",
        target_skills: ["monotonicity"],
        method_tags: ["derivative_definition", "monotonicity_by_derivative"],
      }),
      buildEnrichedTestItem({
        id: "visual-skip",
        section_title: "考点 4 导数与零点",
        target_skills: ["zero_point"],
        method_tags: ["zero_count"],
        feature_flags: ["needs_visual"],
      }),
    ],
  };

  const result = recommendVariantPractice({
    corpus: enrichedCorpus,
    query: {
      id: "query-enriched-agent",
      question_text: "求切线斜率",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      target_skills: ["切线斜率", "极限式识别导数"],
      mistake_causes: ["derivative_definition_confusion"],
    },
    searchLimit: 10,
  });

  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.recommendation_type),
    ["foundation", "near_transfer", "mixed_application"],
  );
  assert.equal(
    result.recommendations.some((recommendation) => recommendation.item_id === "visual-skip"),
    false,
  );
  assert.equal(result.warnings.includes("skipped_visual_dependency_items"), true);
  assert.equal(result.warnings.includes("insufficient_recommendations"), false);
}

{
  const insufficientCorpus = {
    corpus_version: "enriched-practice-corpus-v0",
    generated_at: "2026-06-23T00:00:00.000Z",
    source_corpus_file: "practice_corpus.json",
    source_tag_proposal_file: "candidate_tag_proposals.json",
    item_count: 2,
    items: [
      buildEnrichedTestItem({
        id: "foundation-only",
        section_title: "考点 1 导数的概念",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
      }),
      buildEnrichedTestItem({
        id: "near-only",
        section_title: "考点 2 导数与函数的单调性",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
      }),
    ],
  };

  const result = recommendVariantPractice({
    corpus: insufficientCorpus,
    query: {
      id: "query-insufficient",
      question_text: "求切线斜率",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      target_skills: ["切线斜率"],
    },
    searchLimit: 10,
  });

  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.recommendation_type),
    ["foundation", "near_transfer"],
  );
  assert.equal(result.warnings.includes("no_mixed_application_with_related_method_tags"), true);
  assert.equal(result.warnings.includes("insufficient_approved_tagged_items"), true);
}

{
  const demoFillCorpus = {
    corpus_version: "enriched-practice-corpus-v0",
    generated_at: "2026-06-26T00:00:00.000Z",
    source_corpus_file: "practice_corpus.json",
    source_tag_proposal_file: "candidate_tag_proposals.json",
    item_count: 3,
    items: [
      buildEnrichedTestItem({
        id: "demo-fill-foundation",
        section_title: "考点 1 导数的概念",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
      }),
      buildEnrichedTestItem({
        id: "demo-fill-near",
        section_title: "考点 2 导数与函数的单调性",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
      }),
      buildEnrichedTestItem({
        id: "demo-fill-extra",
        section_title: "考点 1 导数的概念",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
      }),
    ],
  };

  const result = recommendVariantPractice({
    corpus: demoFillCorpus,
    query: {
      id: "query-demo-fill",
      question_text: "求切线斜率",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      target_skills: ["切线斜率"],
    },
    searchLimit: 10,
  });

  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.recommendation_type),
    ["foundation", "near_transfer", "additional_practice"],
  );
  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.item_id),
    ["demo-fill-extra", "demo-fill-near", "demo-fill-foundation"],
  );
  assert.equal(result.warnings.includes("demo_fill_used"), true);
  assert.equal(result.rationale.includes("补充同标签相近题"), true);
}

{
  const mixedReviewStatusCorpus = {
    corpus_version: "enriched-practice-corpus-v0",
    generated_at: "2026-06-26T00:00:00.000Z",
    source_corpus_file: "practice_corpus.json",
    source_tag_proposal_file: "candidate_tag_proposals.json",
    item_count: 4,
    items: [
      buildEnrichedTestItem({
        id: "approved-foundation",
        section_title: "考点 1 导数的概念",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
      }),
      buildEnrichedTestItem({
        id: "approved-near",
        section_title: "考点 2 导数与函数的单调性",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
      }),
      buildEnrichedTestItem({
        id: "proposed-tempting",
        section_title: "考点 1 导数的概念",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
        review_status: "proposed",
      }),
      buildEnrichedTestItem({
        id: "needs-fix-tempting",
        section_title: "考点 1 导数的概念",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
        review_status: "needs_fix",
      }),
    ],
  };

  const result = recommendVariantPractice({
    corpus: mixedReviewStatusCorpus,
    query: {
      id: "query-approved-only",
      question_text: "求切线斜率",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      target_skills: ["切线斜率"],
    },
    searchLimit: 10,
  });

  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.item_id),
    ["approved-foundation", "approved-near"],
  );
  assert.equal(
    result.recommendations.some((recommendation) => recommendation.item_id.includes("tempting")),
    false,
  );
}

{
  const noCandidateCorpus = {
    corpus_version: "enriched-practice-corpus-v0",
    generated_at: "2026-06-23T00:00:00.000Z",
    source_corpus_file: "practice_corpus.json",
    source_tag_proposal_file: "candidate_tag_proposals.json",
    item_count: 2,
    items: [
      buildEnrichedTestItem({
        id: "visual-only",
        section_title: "考点 4 导数与零点",
        target_skills: ["zero_point"],
        method_tags: ["zero_count"],
        feature_flags: ["needs_visual"],
      }),
      {
        ...buildEnrichedTestItem({
          id: "needs-fix-only",
          section_title: "考点 5 综合应用",
          target_skills: ["tangent_slope"],
          method_tags: ["tangent_slope"],
        }),
        tag_review_meta: {
          review_status: "needs_fix",
          proposal_confidence: "low",
          has_manual_tag_correction: false,
          tag_source: "rule",
        },
      },
    ],
  };

  const result = recommendVariantPractice({
    corpus: noCandidateCorpus,
    query: {
      id: "query-no-candidate",
      question_text: "求切线斜率",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念",
      target_skills: ["切线斜率"],
    },
    searchLimit: 10,
  });

  assert.deepEqual(result.recommendations, []);
  assert.equal(result.warnings.includes("no_candidates_found"), true);
  assert.equal(result.warnings.includes("skipped_visual_dependency_items"), true);
  assert.equal(result.warnings.includes("insufficient_approved_tagged_items"), false);
  assert.equal(result.warnings.includes("no_mixed_application_with_related_method_tags"), false);
}

{
  const derivativeCalculationCorpus = {
    corpus_version: "enriched-practice-corpus-v0",
    generated_at: "2026-06-25T00:00:00.000Z",
    source_corpus_file: "practice_corpus.json",
    source_tag_proposal_file: "candidate_tag_proposals.json",
    item_count: 3,
    items: [
      buildEnrichedTestItem({
        id: "derivative-calculation-foundation",
        section_title: "考点 1 导数的概念、几何意义与运算",
        target_skills: ["derivative_calculation"],
        method_tags: [
          "quotient_rule",
          "logarithmic_derivative_formula",
          "power_function_derivative",
        ],
      }),
      buildEnrichedTestItem({
        id: "derivative-calculation-near",
        section_title: "考点 2 导数与函数的单调性",
        target_skills: ["derivative_calculation"],
        method_tags: ["quotient_rule", "logarithmic_derivative_formula"],
      }),
      buildEnrichedTestItem({
        id: "derivative-calculation-mixed",
        section_title: "考点 3 导数综合应用",
        target_skills: ["monotonicity"],
        method_tags: ["quotient_rule"],
      }),
    ],
  };

  const result = recommendVariantPractice({
    corpus: derivativeCalculationCorpus,
    query: {
      id: "query-derivative-calculation",
      question_text: "已知函数 $f(x)=\\frac{\\ln x}{x^{2}}$，求导函数 $f'(x)$。",
      knowledge_points: ["derivative"],
      section_title: "考点 1 导数的概念、几何意义与运算",
      target_skills: ["求导运算"],
      mistake_causes: ["derivative_calculation_error"],
    },
    searchLimit: 10,
  });

  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.recommendation_type),
    ["foundation", "near_transfer", "mixed_application"],
  );
  assert.deepEqual(
    result.recommendations.map((recommendation) => recommendation.item_id),
    [
      "derivative-calculation-foundation",
      "derivative-calculation-near",
      "derivative-calculation-mixed",
    ],
  );
  assert.equal(result.recommendations[0].matched_dimensions.includes("target_skill"), true);
  assert.equal(result.recommendations[0].matched_dimensions.includes("method_tag"), true);
  assert.equal(result.recommendations[2].matched_dimensions.includes("method_tag"), true);
}

console.log("variant practice agent core tests passed");

function buildEnrichedTestItem({
  id,
  section_title,
  target_skills,
  method_tags,
  feature_flags = [],
  review_status = "approved",
}) {
  return {
    id,
    source_candidate_id: id,
    question_text: `${id} synthetic derivative question`,
    search_text: `${id} synthetic derivative question\n导数\n${section_title}`,
    knowledge_points: ["derivative"],
    section_title,
    target_skills,
    method_tags,
    feature_flags,
    difficulty: null,
    source_ref: { pdf_page_index: 1, section_title },
    tag_review_meta: {
      review_status,
      proposal_confidence: "high",
      has_manual_tag_correction: false,
      tag_source: "rule",
    },
    review_meta: {},
  };
}
