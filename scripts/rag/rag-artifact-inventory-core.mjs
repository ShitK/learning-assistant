export const CORE_RAG_ARTIFACT_PATHS = [
  "reviewed_practice_seed.json",
  "practice-corpus/practice_corpus.json",
  "enriched-practice-corpus/enriched_practice_corpus.json",
  "variant-practice-agent/demo-query.json",
  "variant-practice-agent/recommendations.json",
];

export const DEMO_MINIMAL_ARCHIVE_ENTRY_PATHS = [
  "MinerU-test",
  "ai-tag-proposals",
  "candidate-review",
  "derivative-pdf-spike",
  "enriched-practice-corpus/enrichment_summary.json",
  "mineru-candidate-mapper",
  "tag-proposals",
  "tag-review",
  "variant-practice-agent/fonts",
  "variant-practice-agent/index.html",
  "variant-practice-agent/variant_practice_manifest.json",
];

const exactRules = new Map([
  ["reviewed_practice_seed.json", ["keep", "manual_review_source", "preserve"]],
  ["practice-corpus/practice_corpus.json", ["keep", "active_practice_corpus", "preserve"]],
  [
    "enriched-practice-corpus/enriched_practice_corpus.json",
    ["keep", "active_enriched_corpus", "preserve"],
  ],
  [
    "variant-practice-agent/recommendations.json",
    ["keep", "active_product_recommendations", "preserve"],
  ],
  ["variant-practice-agent/demo-query.json", ["keep", "active_demo_query", "preserve"]],
  [
    "enriched-practice-corpus/enrichment_summary.json",
    ["archive_candidate", "enriched_corpus_summary", "archive_file"],
  ],
  [
    "variant-practice-agent/index.html",
    ["archive_candidate", "variant_practice_local_review_ui", "archive_file"],
  ],
  [
    "variant-practice-agent/variant_practice_manifest.json",
    ["archive_candidate", "variant_practice_manifest", "archive_file"],
  ],
  [
    "tag-review/auto_tag_review_records.json",
    ["archive_candidate", "tag_review_evidence", "archive_directory"],
  ],
  [
    "tag-review/tag_review_queue.json",
    ["archive_candidate", "tag_review_evidence", "archive_directory"],
  ],
]);

const prefixRules = [
  ["derivative-pdf-spike/", "archive_candidate", "legacy_ocr_spike", "archive_directory"],
  ["_manifest/", "keep", "inventory_metadata", "preserve"],
  ["_archive/", "keep", "archived_artifacts", "preserve"],
  ["MinerU-test/", "archive_candidate", "mineru_source_parse", "archive_directory"],
  ["mineru-derivative-smoke/", "archive_candidate", "mineru_source_parse", "archive_directory"],
  ["candidate-review/", "archive_candidate", "local_review_ui", "archive_directory"],
  ["tag-review/", "archive_candidate", "tag_review_workspace", "archive_directory"],
  ["tag-proposals/", "archive_candidate", "rule_tag_proposals", "archive_directory"],
  ["ai-tag-proposals/", "archive_candidate", "ai_tag_proposals", "archive_directory"],
  [
    "mineru-candidate-mapper/",
    "archive_candidate",
    "mineru_candidate_intermediate",
    "archive_directory",
  ],
  ["practice-corpus/", "keep", "practice_corpus_workspace", "preserve_or_regenerate"],
  ["enriched-practice-corpus/", "keep", "enriched_corpus_workspace", "preserve_or_regenerate"],
  ["variant-practice-agent/", "keep", "variant_practice_workspace", "preserve_or_regenerate"],
];

export function classifyRagArtifactPath(relativePath) {
  if (relativePath.endsWith(".DS_Store")) {
    return {
      status: "remove_candidate",
      role: "macos_metadata",
      action: "remove_file",
    };
  }

  const exactRule = exactRules.get(relativePath);
  if (exactRule) {
    return toClassification(exactRule);
  }

  const prefixRule = prefixRules.find(([prefix]) => relativePath.startsWith(prefix));
  if (prefixRule) {
    return toClassification(prefixRule.slice(1));
  }

  return {
    status: "unknown",
    role: "unclassified",
    action: "manual_review",
  };
}

export function buildRagArtifactInventory(paths, generatedAt = new Date().toISOString()) {
  const items = [...paths]
    .sort()
    .map((path) => ({
      path,
      ...classifyRagArtifactPath(path),
    }));

  const summary = items.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, {});

  return {
    inventory_version: "rag-artifact-inventory-v0",
    generated_at: generatedAt,
    item_count: items.length,
    summary,
    items,
  };
}

function toClassification([status, role, action]) {
  return { status, role, action };
}
