import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const { createVariantPracticeProductViewModel } = jiti(
  "./src/lib/rag/variant-practice-product-view-model.ts",
);

const artifact = {
  agent_version: "variant-practice-agent-v0",
  query_id: "demo-derivative-tangent-slope",
  recommendations: [
    {
      rank: 1,
      recommendation_type: "foundation",
      item_id: "practice-internal-1",
      source_candidate_id: "candidate-internal-1",
      question_text: "1. 已知 $f'(1)=2$，求切线斜率。",
      reason: "同知识点 derivative；同章节：考点 1 导数的概念、几何意义与运算，适合作为第一道巩固题。",
      matched_dimensions: ["knowledge_point", "target_skill", "method_tag"],
      score: 42,
      source_ref: { pdf_page_index: 1, section_title: "考点 1 导数的概念" },
    },
    {
      rank: 2,
      recommendation_type: "near_transfer",
      item_id: "practice-internal-2",
      source_candidate_id: "candidate-internal-2",
      question_text: "2. 跨章节切线斜率题。",
      reason: "同知识点 derivative；命中目标技能标签：derivative_geometric_meaning, tangent_slope，适合作为第二道轻微变式题。",
      matched_dimensions: ["knowledge_point", "target_skill"],
      score: 34,
      source_ref: null,
    },
    {
      rank: 3,
      recommendation_type: "additional_practice",
      item_id: "practice-internal-3",
      source_candidate_id: "candidate-internal-3",
      question_text: "3. 同标签补充练习。",
      reason: "同知识点 derivative；同章节：考点 1 导数的概念、几何意义与运算，适合作为第三道补充练习题。",
      matched_dimensions: ["knowledge_point", "target_skill"],
      score: 40,
      source_ref: null,
    },
  ],
  warnings: ["demo_fill_used"],
};

const viewModel = createVariantPracticeProductViewModel(artifact);

assert.equal(viewModel.source, "rag_variant_practice");
assert.equal(viewModel.items.length, 3);
assert.deepEqual(
  viewModel.items.map((item) => item.title),
  ["巩固题", "近迁移题", "补充练习题"],
);
assert.deepEqual(
  viewModel.items.map((item) => item.reason),
  [
    "先练一道同类型基础题，巩固当前错因对应的解题路径。",
    "再练一道变式题，训练把同一思路迁移到新场景。",
    "当前题库暂缺稳定综合应用题，已为你补充一题相近练习。",
  ],
);
assert.equal(
  viewModel.notice,
  "当前题库里暂时没有足够合适的综合练习，已为你补充一题相近练习。",
);

const serialized = JSON.stringify(viewModel);
for (const forbidden of [
  "practice-internal",
  "candidate-internal",
  "matched_dimensions",
  "knowledge_point",
  "derivative",
  "derivative_geometric_meaning",
  "tangent_slope",
  "考点",
  "命中目标技能标签",
  "target_skill",
  "method_tag",
  "score",
  "source_ref",
  "demo_fill_used",
]) {
  assert.equal(serialized.includes(forbidden), false, `${forbidden} leaked`);
}

assert.equal(createVariantPracticeProductViewModel({ agent_version: "bad" }), null);
assert.equal(
  createVariantPracticeProductViewModel({
    agent_version: "variant-practice-agent-v0",
    recommendations: [],
  }),
  null,
);
assert.equal(
  createVariantPracticeProductViewModel(artifact, { expectedQueryId: "other-sample" }),
  null,
);

const contaminatedArtifact = {
  agent_version: "variant-practice-agent-v0",
  query_id: "demo-derivative-tangent-slope",
  recommendations: [
    {
      rank: 1,
      recommendation_type: "foundation",
      question_text: "1. derivative_geometric_meaning 内部标签污染题干。",
      reason: "同标签。",
    },
    {
      rank: 2,
      recommendation_type: "near_transfer",
      question_text: "2. 已知 $f'(1)=2$，求切线斜率。",
      reason: "同标签。",
    },
  ],
  warnings: [],
};
const cleanedViewModel = createVariantPracticeProductViewModel(contaminatedArtifact);
assert.equal(cleanedViewModel.items.length, 1);
assert.equal(cleanedViewModel.items[0].rank, 2);
assert.equal(
  JSON.stringify(cleanedViewModel).includes("derivative_geometric_meaning"),
  false,
);

console.log("variant practice product view model tests passed");
