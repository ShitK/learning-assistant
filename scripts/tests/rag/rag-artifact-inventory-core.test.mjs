import assert from "node:assert/strict";
import {
  buildRagArtifactInventory,
  classifyRagArtifactPath,
  CORE_RAG_ARTIFACT_PATHS,
  DEMO_MINIMAL_ARCHIVE_ENTRY_PATHS,
} from "../../rag/rag-artifact-inventory-core.mjs";

assert.deepEqual(classifyRagArtifactPath("reviewed_practice_seed.json"), {
  status: "keep",
  role: "manual_review_source",
  action: "preserve",
});

assert.deepEqual(classifyRagArtifactPath("practice-corpus/practice_corpus.json"), {
  status: "keep",
  role: "active_practice_corpus",
  action: "preserve",
});

assert.deepEqual(
  classifyRagArtifactPath("enriched-practice-corpus/enriched_practice_corpus.json"),
  {
    status: "keep",
    role: "active_enriched_corpus",
    action: "preserve",
  },
);

assert.deepEqual(classifyRagArtifactPath("variant-practice-agent/recommendations.json"), {
  status: "keep",
  role: "active_product_recommendations",
  action: "preserve",
});

assert.deepEqual(classifyRagArtifactPath("variant-practice-agent/demo-query.json"), {
  status: "keep",
  role: "active_demo_query",
  action: "preserve",
});

assert.deepEqual(classifyRagArtifactPath("_manifest/rag_artifact_inventory.json"), {
  status: "keep",
  role: "inventory_metadata",
  action: "preserve",
});

assert.deepEqual(
  classifyRagArtifactPath(
    "_archive/legacy-ocr-spike/derivative-pdf-spike/candidate_questions.json",
  ),
  {
    status: "keep",
    role: "archived_artifacts",
    action: "preserve",
  },
);

assert.deepEqual(classifyRagArtifactPath("mineru-derivative-smoke/result.json"), {
  status: "archive_candidate",
  role: "mineru_source_parse",
  action: "archive_directory",
});

assert.deepEqual(classifyRagArtifactPath("derivative-pdf-spike/candidate_questions.json"), {
  status: "archive_candidate",
  role: "legacy_ocr_spike",
  action: "archive_directory",
});

assert.deepEqual(classifyRagArtifactPath("candidate-review/index.html"), {
  status: "archive_candidate",
  role: "local_review_ui",
  action: "archive_directory",
});

assert.deepEqual(classifyRagArtifactPath("tag-review/auto_tag_review_records.json"), {
  status: "archive_candidate",
  role: "tag_review_evidence",
  action: "archive_directory",
});

assert.deepEqual(classifyRagArtifactPath("tag-review/tag_review_queue.json"), {
  status: "archive_candidate",
  role: "tag_review_evidence",
  action: "archive_directory",
});

assert.deepEqual(classifyRagArtifactPath("ai-tag-proposals/candidate_ai_tag_proposals.json"), {
  status: "archive_candidate",
  role: "ai_tag_proposals",
  action: "archive_directory",
});

assert.deepEqual(classifyRagArtifactPath("enriched-practice-corpus/enrichment_summary.json"), {
  status: "archive_candidate",
  role: "enriched_corpus_summary",
  action: "archive_file",
});

assert.deepEqual(classifyRagArtifactPath(".DS_Store"), {
  status: "remove_candidate",
  role: "macos_metadata",
  action: "remove_file",
});

const inventory = buildRagArtifactInventory([
  "reviewed_practice_seed.json",
  "practice-corpus/practice_corpus.json",
  "derivative-pdf-spike/candidate_questions.json",
  "_manifest/rag_artifact_inventory.json",
  "_archive/legacy-ocr-spike/README.md",
  ".DS_Store",
]);

assert.equal(inventory.item_count, 6);
assert.equal(inventory.summary.keep, 4);
assert.equal(inventory.summary.archive_candidate, 1);
assert.equal(inventory.summary.remove_candidate, 1);
assert.equal(inventory.items[0].path, ".DS_Store");
assert.deepEqual(CORE_RAG_ARTIFACT_PATHS, [
  "reviewed_practice_seed.json",
  "practice-corpus/practice_corpus.json",
  "enriched-practice-corpus/enriched_practice_corpus.json",
  "variant-practice-agent/demo-query.json",
  "variant-practice-agent/recommendations.json",
]);
assert.equal(DEMO_MINIMAL_ARCHIVE_ENTRY_PATHS.includes("tag-review"), true);
assert.equal(DEMO_MINIMAL_ARCHIVE_ENTRY_PATHS.includes("enriched-practice-corpus/enrichment_summary.json"), true);

console.log("rag artifact inventory core tests passed");
