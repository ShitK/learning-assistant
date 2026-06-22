import assert from "node:assert/strict";

import {
  normalizePracticeQuery,
  searchPracticeCorpus,
  validatePracticeCorpus,
} from "../../rag/practice-corpus-search-core.mjs";

const corpus = {
  corpus_version: "practice-corpus-v0",
  generated_at: "2026-06-22T10:00:00.000Z",
  source_seed_file: "seed.json",
  source_seed_exported_at: "2026-06-22T09:00:00.000Z",
  item_count: 4,
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
      review_meta: { original_question_text: "ocr" },
    },
    {
      id: "practice-candidate-2",
      source_candidate_id: "candidate-2",
      question_text: "2. 已知函数单调递增，求参数范围.",
      search_text: "2. 已知函数单调递增，求参数范围.\n导数\n考点 2 导数与函数的单调性",
      knowledge_points: ["derivative"],
      section_title: "考点 2 导数与函数的单调性",
      difficulty: null,
      source_ref: { pdf_page_index: 2, section_title: "考点 2 导数与函数的单调性" },
      review_meta: {},
    },
    {
      id: "practice-candidate-3",
      source_candidate_id: "candidate-3",
      question_text: "3. 三角函数求值.",
      search_text: "3. 三角函数求值.\n三角函数",
      knowledge_points: ["trigonometry"],
      section_title: "三角函数",
      difficulty: null,
      source_ref: { pdf_page_index: 3, section_title: "三角函数" },
      review_meta: {},
    },
    {
      id: "practice-candidate-4",
      source_candidate_id: "candidate-4",
      question_text: "4. 利用导数研究零点个数.",
      search_text: "4. 利用导数研究零点个数.\n导数\n考点 4 导数与零点",
      knowledge_points: ["derivative"],
      section_title: "考点 4 导数与零点",
      difficulty: null,
      source_ref: { pdf_page_index: 4, section_title: "考点 4 导数与零点" },
      review_meta: {},
    },
  ],
};

const query = {
  id: "query-1",
  question_text: "设函数在点处可导，已知极限式，求切线斜率.",
  knowledge_points: ["derivative"],
  section_title: "考点 1 导数的概念",
  mistake_causes: ["derivative_definition_confusion"],
  target_skills: ["导数几何意义", "切线斜率", "极限式识别导数"],
};

{
  const validation = validatePracticeCorpus(corpus);
  assert.equal(validation.ok, true);

  const invalid = validatePracticeCorpus({ items: "bad" });
  assert.equal(invalid.ok, false);
  assert.equal(
    invalid.errors.some((error) => error.includes("items must be an array")),
    true,
  );

  const invalidItem = structuredClone(corpus);
  invalidItem.items[0].id = 123;
  invalidItem.items[0].question_text = "";
  invalidItem.items[0].source_ref = "bad";
  const invalidItemResult = validatePracticeCorpus(invalidItem);
  assert.equal(invalidItemResult.ok, false);
  assert.equal(
    invalidItemResult.errors.some((error) => error.includes("item[0].id must be a string")),
    true,
  );
  assert.equal(
    invalidItemResult.errors.some((error) =>
      error.includes("item[0].question_text must be a non-empty string"),
    ),
    true,
  );
  assert.equal(
    invalidItemResult.errors.some((error) =>
      error.includes("item[0].source_ref must be an object or null when present"),
    ),
    true,
  );
}

{
  const need = normalizePracticeQuery(query);
  assert.equal(need.id, "query-1");
  assert.deepEqual(need.knowledge_points, ["derivative"]);
  assert.equal(need.target_skills.includes("切线斜率"), true);
  assert.equal(need.search_terms.includes("切线斜率"), true);
  assert.equal(need.search_terms.includes("极限"), true);
}

{
  const results = searchPracticeCorpus({ corpus, query, limit: 3 });
  assert.equal(results.length, 3);
  assert.equal(results[0].item.id, "practice-candidate-1");
  assert.equal(results[0].matched_dimensions.includes("knowledge_point"), true);
  assert.equal(results[0].matched_dimensions.includes("section_title"), true);
  assert.equal(results[0].matched_dimensions.includes("target_skill"), true);
  assert.equal(results[0].matched_dimensions.includes("query_term"), true);
  assert.equal(
    results[0].match_reasons.some((reason) => reason.includes("切线斜率")),
    true,
  );
  assert.equal("review_meta" in results[0].item, true);
}

{
  const results = searchPracticeCorpus({ corpus, query, limit: 2 });
  assert.equal(results.length, 2);
  assert.equal(results.every((result) => result.score > 0), true);
}

{
  const trigQuery = {
    id: "query-trig",
    question_text: "三角函数求值",
    knowledge_points: ["trigonometry"],
    section_title: "三角函数",
    target_skills: ["三角函数"],
    mistake_causes: [],
  };
  const results = searchPracticeCorpus({ corpus, query: trigQuery, limit: 2 });
  assert.equal(results.length, 1);
  assert.equal(results[0].item.id, "practice-candidate-3");
}

{
  const emptyResults = searchPracticeCorpus({
    corpus,
    query: { id: "empty", question_text: "", knowledge_points: [], target_skills: [] },
    limit: 5,
  });
  assert.deepEqual(emptyResults, []);
}

{
  const enrichedCorpus = {
    corpus_version: "enriched-practice-corpus-v0",
    generated_at: "2026-06-23T00:00:00.000Z",
    source_corpus_file: "practice_corpus.json",
    source_tag_proposal_file: "candidate_tag_proposals.json",
    item_count: 7,
    items: [
      {
        id: "practice-enriched-1",
        source_candidate_id: "candidate-1",
        question_text: "1. 已知函数在点处可导，求曲线切线斜率.",
        search_text: "1. 已知函数在点处可导，求曲线切线斜率.\n导数",
        knowledge_points: ["derivative"],
        section_title: "考点 1 导数的概念",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope", "derivative_definition"],
        feature_flags: [],
        difficulty: null,
        source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
        tag_review_meta: {
          review_status: "approved",
          proposal_confidence: "high",
          has_manual_tag_correction: false,
          tag_source: "rule",
        },
        review_meta: {},
      },
      {
        id: "practice-enriched-2",
        source_candidate_id: "candidate-2",
        question_text: "2. 讨论函数单调性并求参数范围.",
        search_text: "2. 讨论函数单调性并求参数范围.\n导数",
        knowledge_points: ["derivative"],
        section_title: "考点 2 导数与函数的单调性",
        target_skills: ["monotonicity", "parameter_range"],
        method_tags: [
          "derivative_definition",
          "monotonicity_by_derivative",
          "parameter_classification",
        ],
        feature_flags: ["has_parameter"],
        difficulty: null,
        source_ref: { pdf_page_index: 2, section_title: "考点 2 导数与函数的单调性" },
        tag_review_meta: {
          review_status: "approved",
          proposal_confidence: "high",
          has_manual_tag_correction: false,
          tag_source: "rule",
        },
        review_meta: {},
      },
      {
        id: "practice-enriched-3",
        source_candidate_id: "candidate-3",
        question_text: "3. 如图判断零点个数.",
        search_text: "3. 如图判断零点个数.\n导数",
        knowledge_points: ["derivative"],
        section_title: "考点 4 导数与零点",
        target_skills: ["zero_point"],
        method_tags: ["zero_count"],
        feature_flags: ["needs_visual", "has_graph"],
        difficulty: null,
        source_ref: { pdf_page_index: 4, section_title: "考点 4 导数与零点" },
        tag_review_meta: {
          review_status: "approved",
          proposal_confidence: "high",
          has_manual_tag_correction: false,
          tag_source: "rule",
        },
        review_meta: {},
      },
      {
        id: "practice-enriched-4",
        source_candidate_id: "candidate-4",
        question_text: "4. 未审核导数题.",
        search_text: "4. 未审核导数题.",
        knowledge_points: ["derivative"],
        section_title: "考点 5 综合应用",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
        feature_flags: [],
        difficulty: null,
        source_ref: { pdf_page_index: 5, section_title: "考点 5 综合应用" },
        tag_review_meta: {
          review_status: "needs_fix",
          proposal_confidence: "low",
          has_manual_tag_correction: false,
          tag_source: "rule",
        },
        review_meta: {},
      },
      {
        id: "practice-enriched-5",
        source_candidate_id: "candidate-5",
        question_text: "5. draft 导数题.",
        search_text: "5. draft 导数题.\n导数",
        knowledge_points: ["derivative"],
        section_title: "考点 5 综合应用",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
        feature_flags: [],
        difficulty: null,
        source_ref: { pdf_page_index: 5, section_title: "考点 5 综合应用" },
        tag_review_meta: {
          review_status: "proposed",
          proposal_confidence: "high",
          has_manual_tag_correction: false,
          tag_source: "rule",
        },
        review_meta: {},
      },
      {
        id: "practice-enriched-6",
        source_candidate_id: "candidate-6",
        question_text: "6. skipped 导数题.",
        search_text: "6. skipped 导数题.\n导数",
        knowledge_points: ["derivative"],
        section_title: "考点 6 综合应用",
        target_skills: ["tangent_slope"],
        method_tags: ["tangent_slope"],
        feature_flags: [],
        difficulty: null,
        source_ref: { pdf_page_index: 6, section_title: "考点 6 综合应用" },
        tag_review_meta: {
          review_status: "skipped",
          proposal_confidence: "high",
          has_manual_tag_correction: false,
          tag_source: "human",
        },
        review_meta: {},
      },
      {
        id: "practice-enriched-empty-target-skills",
        source_candidate_id: "candidate-empty-target-skills",
        question_text: "7. 求曲线在某点处的切线斜率.",
        search_text: "7. 求曲线在某点处的切线斜率.\n导数",
        knowledge_points: ["derivative"],
        section_title: "考点 1 导数的概念",
        target_skills: [],
        method_tags: [],
        feature_flags: [],
        difficulty: null,
        source_ref: { pdf_page_index: 7, section_title: "考点 1 导数的概念" },
        tag_review_meta: {
          review_status: "approved",
          proposal_confidence: "low",
          has_manual_tag_correction: false,
          tag_source: "rule",
        },
        review_meta: {},
      },
    ],
  };

  const validation = validatePracticeCorpus(enrichedCorpus);
  assert.equal(validation.ok, true);

  const need = normalizePracticeQuery({
    id: "query-enriched",
    question_text: "求切线斜率",
    knowledge_points: ["derivative"],
    section_title: "考点 1 导数的概念",
    target_skills: ["切线斜率", "极限式识别导数"],
  });
  assert.deepEqual(need.target_skill_keys, ["tangent_slope", "derivative_definition_limit"]);
  assert.deepEqual(need.method_tags, ["tangent_slope", "derivative_definition"]);

  const results = searchPracticeCorpus({ corpus: enrichedCorpus, query: need, limit: 10 });
  assert.equal(results.some((candidate) => candidate.item.id === "practice-enriched-3"), false);
  assert.equal(results.some((candidate) => candidate.item.id === "practice-enriched-4"), false);
  assert.equal(results.some((candidate) => candidate.item.id === "practice-enriched-5"), false);
  assert.equal(results.some((candidate) => candidate.item.id === "practice-enriched-6"), false);
  assert.equal(results[0].matched_dimensions.includes("target_skill"), true);
  assert.equal(results[0].matched_dimensions.includes("method_tag"), true);
  const emptyTargetSkillResult = results.find(
    (candidate) => candidate.item.id === "practice-enriched-empty-target-skills",
  );
  assert.notEqual(emptyTargetSkillResult, undefined);
  assert.equal(emptyTargetSkillResult.matched_dimensions.includes("target_skill"), false);

  const includeVisualResults = searchPracticeCorpus({
    corpus: enrichedCorpus,
    query: { ...need, target_skills: ["零点"] },
    limit: 10,
    includeVisual: true,
  });
  assert.equal(
    includeVisualResults.some((candidate) => candidate.item.id === "practice-enriched-3"),
    true,
  );
}

console.log("practice corpus search core tests passed");
