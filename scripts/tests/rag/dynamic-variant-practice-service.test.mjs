import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  handleDynamicVariantPracticeRequest,
  loadDefaultVariantPracticeAgent,
} = jiti("./src/lib/server/rag/dynamic-variant-practice-service.ts");

const tmpRoot = mkdtempSync(join(tmpdir(), "dynamic-variant-practice-service-"));
const corpusPath = join(tmpRoot, "enriched_practice_corpus.json");

const baseRequest = {
  student_id: "demo_student_001",
  request_source: "confirmed_image_diagnosis",
  evidence_level: "student_work_sufficient",
  persistence_evidence: "student_work",
  profile_update_kind: "mistake_cause",
  question_text: "已知函数 $f(x)=\\ln x-ax+1$，讨论函数单调性并求参数范围。",
  knowledge_points: ["derivative_monotonicity"],
  mistake_causes: ["classification_missing"],
};

writeFileSync(corpusPath, JSON.stringify(buildCorpus(), null, 2));

let capturedInput = null;
const fakeAgent = {
  recommendVariantPractice(input) {
    capturedInput = input;
    return buildAgentArtifact(input.query.id, input.corpus.items);
  },
};

{
  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    corpusFilePath: corpusPath,
    agent: fakeAgent,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice.items.length, 3);
  assert.equal(capturedInput.query.section_title, "考点 2 导数与函数的单调性");
  assert.equal(capturedInput.corpus.corpus_version, "enriched-practice-corpus-v0");
  assert.equal(capturedInput.corpus.items.length, 3);
  assert.equal(
    capturedInput.corpus.items.some(
      (item) => item.tag_review_meta.review_status !== "approved",
    ),
    false,
  );
  assert.equal(JSON.stringify(result.body).includes("score"), false);
  assert.equal(JSON.stringify(result.body).includes("source_candidate_id"), false);
  assert.equal(JSON.stringify(result.body).includes("matched_dimensions"), false);
}

{
  capturedInput = null;
  const result = await handleDynamicVariantPracticeRequest(
    {
      ...baseRequest,
      knowledge_points: ["sequence_recursion"],
      mistake_causes: ["classification_missing"],
    },
    { corpusFilePath: corpusPath, agent: fakeAgent },
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice, null);
  assert.equal(capturedInput, null);
}

{
  const noSectionCorpusPath = join(tmpRoot, "no-section.json");
  writeFileSync(noSectionCorpusPath, JSON.stringify(buildCorpusWithoutTargetSection(), null, 2));
  capturedInput = null;
  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    corpusFilePath: noSectionCorpusPath,
    agent: fakeAgent,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice.items.length, 3);
  assert.equal(capturedInput.query.section_title, null);
}

{
  const invalidVersionPath = join(tmpRoot, "invalid-version.json");
  writeFileSync(
    invalidVersionPath,
    JSON.stringify({ ...buildCorpus(), corpus_version: "enriched-practice-corpus-v1" }),
  );
  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    corpusFilePath: invalidVersionPath,
    agent: fakeAgent,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice, null);
}

{
  const badJsonPath = join(tmpRoot, "bad.json");
  writeFileSync(badJsonPath, "{");
  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    corpusFilePath: badJsonPath,
    agent: fakeAgent,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice, null);
}

{
  const result = await handleDynamicVariantPracticeRequest(
    { ...baseRequest, student_id: "student_002" },
    { corpusFilePath: corpusPath, agent: fakeAgent },
  );
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "invalid_request");
}

{
  const twoItemAgent = {
    recommendVariantPractice(input) {
      return {
        ...buildAgentArtifact(input.query.id, input.corpus.items),
        recommendations: buildAgentArtifact(
          input.query.id,
          input.corpus.items,
        ).recommendations.slice(0, 2),
      };
    },
  };
  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    corpusFilePath: corpusPath,
    agent: twoItemAgent,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice, null);
}

{
  const throwingAgent = {
    recommendVariantPractice() {
      throw new Error("agent failed");
    },
  };
  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    corpusFilePath: corpusPath,
    agent: throwingAgent,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.variant_practice, null);
}

{
  const agent = await loadDefaultVariantPracticeAgent();
  assert.notEqual(agent, null);
  assert.equal(typeof agent.recommendVariantPractice, "function");

  const result = await handleDynamicVariantPracticeRequest(baseRequest, {
    corpusFilePath: corpusPath,
    agent,
  });
  assert.equal(result.status, 200);
  assert.equal(
    result.body.variant_practice === null ||
      result.body.variant_practice.items.length === 3,
    true,
  );
}

console.log("dynamic variant practice service tests passed");

function buildCorpus() {
  return {
    corpus_version: "enriched-practice-corpus-v0",
    generated_at: "2026-06-26T00:00:00.000Z",
    item_count: 4,
    items: [
      buildItem("foundation", "考点 2 导数与函数的单调性", "monotonicity", "approved"),
      buildItem("near", "专项突破 2 利用导数研究恒(能)成立问题", "parameter_range", "approved"),
      buildItem("mixed", "考点 3 导数与函数的极值", "extrema", "approved"),
      buildItem("needs-fix", "考点 4 导数与函数的零点", "zero_point", "needs_fix"),
    ],
  };
}

function buildCorpusWithoutTargetSection() {
  return {
    ...buildCorpus(),
    items: [
      buildItem("foundation-alt", "考点 1 导数的概念、几何意义与运算", "tangent_slope", "approved"),
      buildItem("near-alt", "专项突破 2 利用导数研究恒(能)成立问题", "parameter_range", "approved"),
      buildItem("mixed-alt", "考点 3 导数与函数的极值", "extrema", "approved"),
    ],
  };
}

function buildItem(id, sectionTitle, targetSkill, reviewStatus) {
  return {
    id: `practice-${id}`,
    source_candidate_id: `candidate-${id}`,
    question_text: `${id}. 讨论导数相关问题。`,
    search_text: `${id}. 讨论导数相关问题。\\n导数\\n${sectionTitle}`,
    knowledge_points: ["derivative"],
    section_title: sectionTitle,
    target_skills: [targetSkill],
    method_tags: ["monotonicity_by_derivative", "parameter_classification"],
    feature_flags: [],
    difficulty: null,
    source_ref: { pdf_page_index: 1, section_title: sectionTitle },
    tag_review_meta: {
      review_status: reviewStatus,
      proposal_confidence: "high",
      has_manual_tag_correction: false,
      tag_source: "rule",
    },
    review_meta: {},
  };
}

function buildAgentArtifact(queryId, items) {
  return {
    agent_version: "variant-practice-agent-v0",
    query_id: queryId,
    practice_goal: {
      knowledge_points: ["derivative"],
      target_skills: ["monotonicity"],
      mistake_causes: ["classification_missing"],
      summary: "动态推荐测试。",
    },
    agent_steps: [],
    rationale: "测试推荐。",
    search_summary: {
      corpus_version: "enriched-practice-corpus-v0",
      searched_items: items.length,
      candidate_count: items.length,
    },
    recommendations: items.slice(0, 3).map((item, index) => ({
      rank: index + 1,
      recommendation_type:
        index === 0 ? "foundation" : index === 1 ? "near_transfer" : "additional_practice",
      item_id: item.id,
      source_candidate_id: item.source_candidate_id,
      question_text: item.question_text,
      reason: "同知识点 derivative，适合作为练习题。",
      matched_dimensions: ["knowledge_point", "target_skill"],
      score: 30 - index,
      source_ref: item.source_ref,
    })),
    warnings: ["demo_fill_used"],
  };
}
