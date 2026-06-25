import assert from "node:assert/strict";

import {
  buildVariantPracticeAppData,
  renderVariantPracticeHtml,
  validateVariantPracticeRecommendations,
} from "../../rag/variant-practice-agent-ui-core.mjs";

const fixture = {
  agent_version: "variant-practice-agent-v0",
  query_id: "demo-query",
  practice_goal: {
    knowledge_points: ["derivative"],
    target_skills: ["切线斜率"],
    mistake_causes: ["derivative_definition_confusion"],
    summary: "优先巩固切线斜率。",
  },
  agent_steps: [
    { id: "analyze_practice_need", status: "completed", summary: "识别练习目标。" },
    { id: "search_corpus", status: "completed", summary: "召回 12 道候选题。" },
  ],
  rationale:
    "当前 corpus 暂时缺少稳定的综合应用题，因此补充同标签相近题用于演示练习链路。",
  search_summary: {
    corpus_version: "enriched-practice-corpus-v0",
    searched_items: 69,
    candidate_count: 12,
  },
  recommendations: [
    {
      rank: 1,
      recommendation_type: "foundation",
      item_id: "practice-1",
      source_candidate_id: "candidate-1",
      question_text: "1. 已知 $f'(1)=2$，求切线斜率。",
      reason: "同章节同标签，适合作为第一道巩固题。",
      matched_dimensions: ["knowledge_point", "section_title", "target_skill"],
      score: 42,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
    },
    {
      rank: 2,
      recommendation_type: "near_transfer",
      item_id: "practice-2",
      source_candidate_id: "candidate-2",
      question_text: "2. 已知 $y=f(x)$ 在不同章节求切线。",
      reason: "跨章节但同目标技能，适合作为第二道轻微变式题。",
      matched_dimensions: ["knowledge_point", "target_skill"],
      score: 34,
      source_ref: { pdf_page_index: 2, section_title: "考点 2 导数与单调性" },
    },
    {
      rank: 3,
      recommendation_type: "additional_practice",
      item_id: "practice-3",
      source_candidate_id: "candidate-3",
      question_text: "3. <script>alert(1)</script> 同标签补充练习。",
      reason: "当前题库暂缺稳定综合应用题，补充一题同标签相近题。",
      matched_dimensions: ["knowledge_point", "target_skill"],
      score: 40,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
    },
  ],
  warnings: ["demo_fill_used"],
};

{
  const validation = validateVariantPracticeRecommendations(fixture);
  assert.equal(validation.ok, true);
  assert.equal(validation.result.recommendations.length, 3);
}

{
  const validation = validateVariantPracticeRecommendations({ recommendations: [] });
  assert.equal(validation.ok, false);
  assert.equal(validation.errors.includes("agent_version must be variant-practice-agent-v0"), true);
}

{
  const appData = buildVariantPracticeAppData({
    recommendations: fixture,
    sourceFile: "/tmp/recommendations.json",
    generatedAt: "2026-06-26T00:00:00.000Z",
  });

  assert.equal(appData.recommendations.length, 3);
  assert.equal(appData.type_counts.additional_practice, 1);
  assert.equal(appData.has_demo_fill, true);

  const html = renderVariantPracticeHtml(appData, { katexCss: ".katex{}", katexJs: "window.katex={renderToString:function(value){return '<span class=\"katex\">' + value + '</span>';}};" });
  assert.equal(html.includes("MathTrace Variant Practice"), true);
  assert.equal(html.includes("补充练习题"), true);
  assert.equal(html.includes("demo_fill_used"), true);
  assert.equal(html.includes("当前题库暂缺稳定综合应用题"), true);
  assert.equal(html.includes("window.__VARIANT_PRACTICE_DATA__"), true);
  assert.equal(html.includes("katex"), true);
  assert.equal(html.includes("<script>alert(1)</script>"), false);
  assert.equal(html.includes("</script><script>alert(9)</script>"), false);
}

console.log("variant practice agent ui core tests passed");
