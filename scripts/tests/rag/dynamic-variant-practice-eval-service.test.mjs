import assert from "node:assert/strict";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const service = jiti("./src/lib/server/rag/dynamic-variant-practice-service.ts");

const validRequest = {
  student_id: "demo_student_001",
  request_source: "confirmed_image_diagnosis",
  evidence_level: "student_work_sufficient",
  persistence_evidence: "student_work",
  profile_update_kind: "mistake_cause",
  question_text: "已知函数 f(x)=ln x-ax，讨论函数单调区间。",
  knowledge_points: ["derivative_monotonicity"],
  mistake_causes: ["range_boundary_omission"],
};

const corpus = {
  corpus_version: "enriched-practice-corpus-v0",
  items: [
    buildItem("a", ["monotonicity"]),
    buildItem("b", ["monotonicity"]),
    buildItem("c", ["parameter_range"]),
    { ...buildItem("d", ["monotonicity"]), tag_review_meta: { review_status: "pending" } },
  ],
};

const fakeAgent = {
  recommendVariantPractice(input) {
    assert.equal(input.corpus.items.length, 3);
    return buildAgentArtifact(input.corpus.items.slice(0, 3));
  },
};

const evalResult = await service.handleDynamicVariantPracticeEvalRequest(validRequest, {
  agent: fakeAgent,
  pgvectorCorpusSource: async () => corpus,
  localCorpusSource: async () => {
    throw new Error("local fallback should not run");
  },
});

assert.equal(evalResult.status, 200);
assert.equal(evalResult.retrieval_source, "pgvector");
assert.equal(evalResult.pgvector_attempted, true);
assert.equal(evalResult.candidate_count_before_agent, 4);
assert.equal(evalResult.candidate_count_after_approved_filter, 3);
assert.equal(evalResult.product_view_model.items.length, 3);
assert.equal(evalResult.candidate_items_after_filter.length, 3);
assert.equal(evalResult.selected_candidate_items.length, 3);
assert.deepEqual(evalResult.selected_candidate_items.map((item) => item.id), ["a", "b", "c"]);

const duplicateTextCorpus = {
  corpus_version: "enriched-practice-corpus-v0",
  items: [
    buildItem("dup-a", ["monotonicity"], "重复文案题"),
    buildItem("dup-b", ["parameter_range"], "重复文案题"),
    buildItem("unique-c", ["monotonicity"], "唯一文案题"),
  ],
};

const duplicateTextAgent = {
  recommendVariantPractice() {
    return buildAgentArtifact([
      duplicateTextCorpus.items[1],
      duplicateTextCorpus.items[0],
      duplicateTextCorpus.items[2],
    ]);
  },
};

const duplicateTextResult = await service.handleDynamicVariantPracticeEvalRequest(
  validRequest,
  {
    agent: duplicateTextAgent,
    pgvectorCorpusSource: async () => duplicateTextCorpus,
  },
);

assert.equal(duplicateTextResult.status, 200);
assert.equal(duplicateTextResult.retrieval_source, "pgvector");
assert.equal(duplicateTextResult.selected_candidate_items.length, 3);
assert.deepEqual(
  duplicateTextResult.selected_candidate_items.map((item) => ({
    id: item.id,
    source_candidate_id: item.source_candidate_id,
  })),
  [
    { id: "dup-b", source_candidate_id: "candidate-dup-b" },
    { id: "dup-a", source_candidate_id: "candidate-dup-a" },
    { id: "unique-c", source_candidate_id: "candidate-unique-c" },
  ],
);

const publicResult = await service.handleDynamicVariantPracticeRequest(validRequest, {
  agent: fakeAgent,
  pgvectorCorpusSource: async () => corpus,
});
assert.deepEqual(Object.keys(publicResult.body), ["variant_practice"]);
assert.equal("retrieval_source" in publicResult.body, false);

const localOnly = await service.handleDynamicVariantPracticeEvalRequest(validRequest, {
  agent: fakeAgent,
  pgvectorCorpusSource: null,
  localCorpusSource: async () => corpus,
});
assert.equal(localOnly.status, 200);
assert.equal(localOnly.retrieval_source, "local_json");
assert.equal(localOnly.pgvector_attempted, false);
assert.equal(localOnly.product_view_model.items.length, 3);

const fallbackAgent = {
  recommendVariantPractice(input) {
    return input.corpus.items[0].id.startsWith("pgvector-")
      ? buildAgentArtifact(input.corpus.items.slice(0, 2))
      : buildAgentArtifact([
          input.corpus.items[1],
          input.corpus.items[0],
          input.corpus.items[2],
        ]);
  },
};

const fallbackResult = await service.handleDynamicVariantPracticeEvalRequest(validRequest, {
  agent: fallbackAgent,
  pgvectorCorpusSource: async () => ({
    ...duplicateTextCorpus,
    items: duplicateTextCorpus.items.map((item) => ({
      ...item,
      id: `pgvector-${item.id}`,
      source_candidate_id: `pgvector-${item.source_candidate_id}`,
    })),
  }),
  localCorpusSource: async () => duplicateTextCorpus,
});

assert.equal(fallbackResult.status, 200);
assert.equal(fallbackResult.pgvector_attempted, true);
assert.equal(fallbackResult.retrieval_source, "local_json");
assert.equal(fallbackResult.product_view_model.items.length, 3);
assert.deepEqual(
  fallbackResult.selected_candidate_items.map((item) => ({
    id: item.id,
    source_candidate_id: item.source_candidate_id,
  })),
  [
    { id: "dup-b", source_candidate_id: "candidate-dup-b" },
    { id: "dup-a", source_candidate_id: "candidate-dup-a" },
    { id: "unique-c", source_candidate_id: "candidate-unique-c" },
  ],
);

const unsupported = await service.handleDynamicVariantPracticeEvalRequest(
  {
    ...validRequest,
    knowledge_points: ["sequence_recursion"],
  },
  {
    pgvectorCorpusSource: async () => {
      throw new Error("pgvector should not run for unsupported scope");
    },
  },
);
assert.equal(unsupported.status, 200);
assert.equal(unsupported.retrieval_source, null);
assert.equal(unsupported.pgvector_attempted, false);
assert.equal(unsupported.candidate_count_before_agent, 0);
assert.deepEqual(unsupported.candidate_items_after_filter, []);
assert.deepEqual(unsupported.selected_candidate_items, []);
assert.equal(unsupported.product_view_model, null);

console.log("dynamic variant practice eval service tests passed");

function buildItem(id, targetSkills, questionText = `测试导数题 ${id}`) {
  return {
    id,
    source_candidate_id: `candidate-${id}`,
    question_text: questionText,
    search_text: questionText,
    knowledge_points: ["derivative"],
    section_title: "考点 2 导数与函数的单调性",
    target_skills: targetSkills,
    method_tags: targetSkills,
    tag_review_meta: { review_status: "approved" },
  };
}

function buildAgentArtifact(items) {
  return {
    agent_version: "variant-practice-agent-v0",
    recommendations: items.map((item, index) => ({
      rank: index + 1,
      recommendation_type: ["foundation", "near_transfer", "additional_practice"][index],
      item_id: item.id,
      source_candidate_id: item.source_candidate_id,
      question_text: item.question_text,
      reason: "测试推荐",
    })),
  };
}
