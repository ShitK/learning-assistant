import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  readLocalDynamicPracticeCorpus,
  readPgvectorDynamicPracticeCorpus,
} = jiti("./src/lib/server/rag/variant-practice-corpus-source.ts");

const query = {
  id: "dynamic-confirmed-image-diagnosis",
  question_text: "讨论导数单调性",
  knowledge_points: ["derivative"],
  section_title: "考点 2 导数与函数的单调性",
  mistake_causes: ["classification_missing"],
  target_skills: ["monotonicity"],
};

const pgvectorRows = [
  {
    id: "practice-1",
    source_candidate_id: "candidate-1",
    question_text: "题干 1",
    search_text: "题干 1 导数 单调",
    knowledge_points: ["derivative"],
    section_title: "考点 2 导数与函数的单调性",
    difficulty: null,
    target_skills: ["monotonicity"],
    method_tags: ["monotonicity_by_derivative"],
    feature_flags: [],
    source_ref: { pdf_page_index: 1 },
    tag_review_meta: { review_status: "approved" },
    review_status: "approved",
    cosine_distance: 0.1,
    metadata_score: 20,
  },
];

{
  const embeddingCalls = [];
  const corpus = await readPgvectorDynamicPracticeCorpus(query, {
    repository: {
      is_database_configured: true,
      async matchItems(input) {
        assert.equal(input.knowledge_points.includes("derivative"), true);
        assert.equal(input.target_skills.includes("monotonicity"), true);
        assert.equal(input.section_title, "考点 2 导数与函数的单调性");
        assert.equal(input.timeout_ms, 10);
        return pgvectorRows;
      },
    },
    embedding_provider: {
      async embedText(input) {
        embeddingCalls.push(input.text);
        return {
          ok: true,
          value: {
            embedding: Array.from({ length: 1536 }, () => 0.01),
            model: "text-embedding-3-small",
            provider_name: "fake",
            dimensions: 1536,
          },
        };
      },
    },
    timeout_ms: 10,
  });

  assert.equal(corpus.corpus_version, "enriched-practice-corpus-v0");
  assert.equal(corpus.items.length, 1);
  assert.equal(corpus.items[0].id, "practice-1");
  assert.equal(corpus.items[0].tag_review_meta.review_status, "approved");
  assert.equal(JSON.stringify(corpus).includes("cosine_distance"), false);
  assert.equal(JSON.stringify(corpus).includes("metadata_score"), false);
  assert.equal(embeddingCalls.length, 1);
  assert.equal(embeddingCalls[0].includes("当前错题："), true);
}

{
  const corpus = await readPgvectorDynamicPracticeCorpus(query, {
    repository: {
      is_database_configured: false,
      async matchItems() {
        throw new Error("should not match when database disabled");
      },
    },
    embedding_provider: {
      async embedText() {
        throw new Error("should not embed when database disabled");
      },
    },
    timeout_ms: 10,
  });
  assert.equal(corpus, null);
}

{
  const corpus = await readPgvectorDynamicPracticeCorpus(query, {
    repository: {
      is_database_configured: true,
      async matchItems() {
        throw new Error("should not match after embedding failure");
      },
    },
    embedding_provider: {
      async embedText() {
        return {
          ok: false,
          error: {
            code: "model_not_configured",
            message: "missing",
            recoverable: true,
            failure_kind: "not_configured",
          },
        };
      },
    },
    timeout_ms: 10,
  });
  assert.equal(corpus, null);
}

{
  const corpus = await readPgvectorDynamicPracticeCorpus(query, {
    repository: {
      is_database_configured: true,
      async matchItems() {
        throw new Error("should not match after thrown embedding failure");
      },
    },
    embedding_provider: {
      async embedText() {
        throw new Error("embedding provider unavailable");
      },
    },
    timeout_ms: 10,
  });
  assert.equal(corpus, null);
}

const tmpRoot = mkdtempSync(join(tmpdir(), "variant-practice-corpus-source-"));
const corpusPath = join(tmpRoot, "enriched_practice_corpus.json");
writeFileSync(
  corpusPath,
  JSON.stringify({
    corpus_version: "enriched-practice-corpus-v0",
    items: [
      {
        id: "local-1",
        source_candidate_id: "local-candidate-1",
        question_text: "本地题干",
        search_text: "本地题干 导数",
        knowledge_points: ["derivative"],
        section_title: "考点 2 导数与函数的单调性",
        target_skills: ["monotonicity"],
        method_tags: [],
        feature_flags: [],
        source_ref: {},
        tag_review_meta: { review_status: "approved" },
      },
    ],
  }),
);

const localCorpus = await readLocalDynamicPracticeCorpus(corpusPath);
assert.equal(localCorpus.items.length, 1);
assert.equal(localCorpus.items[0].id, "local-1");

const missingLocalCorpus = await readLocalDynamicPracticeCorpus(join(tmpRoot, "missing.json"));
assert.equal(missingLocalCorpus, null);

console.log("variant practice corpus source tests passed");
