import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createProjectJiti } from "../../test-support/project-jiti.mjs";
import {
  buildVariantPracticePgvectorRow,
  planVariantPracticePgvectorSync,
  selectSyncableVariantPracticeItems,
} from "../../rag/sync-variant-practice-pgvector-core.mjs";

const jiti = createProjectJiti();
const {
  buildVariantPracticeEmbeddingHashInput,
  buildVariantPracticeItemEmbeddingText,
} = jiti("./src/lib/rag/variant-practice-embedding-text.ts");

const corpus = {
  corpus_version: "enriched-practice-corpus-v0",
  items: [
    buildItem("approved", "approved", []),
    buildItem("visual", "approved", ["needs_visual"]),
    buildItem("needs-fix", "needs_fix", []),
  ],
};

const syncable = selectSyncableVariantPracticeItems(corpus);
assert.deepEqual(syncable.map((item) => item.id), ["practice-approved"]);

const embeddingText = "题干：\n测试";
const hashInput = "text-embedding-3-small\n1536\n题干：\n测试";
const hash = createHash("sha256").update(hashInput).digest("hex");

const row = buildVariantPracticePgvectorRow({
  item: buildItem("approved", "approved", []),
  embeddingText,
  embeddingHash: hash,
  embeddingModel: "text-embedding-3-small",
  embedding: [0.1, 0.2],
});

assert.equal(row.id, "practice-approved");
assert.equal(row.corpus_version, "enriched-practice-corpus-v0");
assert.equal(row.embedding_text, embeddingText);
assert.equal(row.embedding_hash, hash);
assert.equal(row.embedding_model, "text-embedding-3-small");
assert.equal(row.review_status, "approved");
assert.equal(row.is_active, undefined);
assert.equal("student_id" in row, false);
assert.equal("memory_delta" in row, false);

const embeddingCalls = [];
const upserted = [];
const deactivated = [];
const summary = await planVariantPracticePgvectorSync({
  corpus,
  embeddingModel: "text-embedding-3-small",
  dimensions: 1536,
  existingHashes: new Map([["practice-approved", "old-hash"]]),
  dryRun: false,
  embeddingProvider: {
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
  repository: {
    async upsertItems(items) {
      upserted.push(...items);
    },
    async deactivateMissingItems(activeIds) {
      deactivated.push(...activeIds);
    },
  },
});

assert.equal(summary.selected_count, 1);
assert.equal(summary.embedded_count, 1);
assert.equal(summary.skipped_count, 0);
assert.equal(summary.upserted_count, 1);
assert.equal(summary.deactivated_reference_count, 1);
assert.equal(embeddingCalls.length, 1);
assert.equal(upserted.length, 1);
assert.deepEqual(deactivated, ["practice-approved"]);

const unchangedHashItem = {
  ...buildItem("approved", "approved", []),
  section_title: "考点 3 函数零点",
  source_ref: { pdf_page_index: 9 },
  tag_review_meta: { review_status: "approved", reviewer: "task-6" },
};
const unchangedHashEmbeddingText =
  buildVariantPracticeItemEmbeddingText(unchangedHashItem);
const unchangedHash = createHash("sha256")
  .update(
    buildVariantPracticeEmbeddingHashInput({
      embedding_model: "text-embedding-3-small",
      dimensions: 1536,
      embedding_text: unchangedHashEmbeddingText,
    }),
  )
  .digest("hex");
const unchangedHashUpserted = [];
const unchangedHashEmbeddingCalls = [];
const unchangedHashSummary = await planVariantPracticePgvectorSync({
  corpus: {
    corpus_version: "enriched-practice-corpus-v0",
    items: [unchangedHashItem],
  },
  embeddingModel: "text-embedding-3-small",
  dimensions: 1536,
  existingHashes: new Map([["practice-approved", unchangedHash]]),
  dryRun: false,
  embeddingProvider: {
    async embedText(input) {
      unchangedHashEmbeddingCalls.push(input.text);
      throw new Error("unchanged hash must not call embedding provider");
    },
  },
  repository: {
    async upsertItems(items) {
      unchangedHashUpserted.push(...items);
    },
    async deactivateMissingItems() {},
  },
});

assert.equal(unchangedHashSummary.selected_count, 1);
assert.equal(unchangedHashSummary.skipped_count, 1);
assert.equal(unchangedHashSummary.embedded_count, 0);
assert.equal(unchangedHashSummary.upserted_count, 0);
assert.equal(unchangedHashEmbeddingCalls.length, 0);
assert.equal(unchangedHashUpserted.length, 0);

const dryRunSummary = await planVariantPracticePgvectorSync({
  corpus,
  embeddingModel: "text-embedding-3-small",
  dimensions: 1536,
  existingHashes: new Map(),
  dryRun: true,
  embeddingProvider: {
    async embedText() {
      throw new Error("dry-run must not call embedding provider");
    },
  },
  repository: {
    async upsertItems() {
      throw new Error("dry-run must not upsert");
    },
    async deactivateMissingItems() {
      throw new Error("dry-run must not deactivate");
    },
  },
});

assert.equal(dryRunSummary.selected_count, 1);
assert.equal(dryRunSummary.embedded_count, 0);
assert.equal(dryRunSummary.upserted_count, 0);

console.log("sync variant practice pgvector core tests passed");

function buildItem(id, reviewStatus, featureFlags) {
  return {
    id: `practice-${id}`,
    source_candidate_id: `candidate-${id}`,
    question_text: `${id} 题干`,
    search_text: `${id} 检索文本`,
    knowledge_points: ["derivative"],
    section_title: "考点 2 导数与函数的单调性",
    difficulty: null,
    target_skills: ["monotonicity"],
    method_tags: ["monotonicity_by_derivative"],
    feature_flags: featureFlags,
    source_ref: { pdf_page_index: 1 },
    tag_review_meta: { review_status: reviewStatus },
  };
}
