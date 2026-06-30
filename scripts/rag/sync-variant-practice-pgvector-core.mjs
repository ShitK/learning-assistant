import { createHash } from "node:crypto";
import { createProjectJiti } from "../test-support/project-jiti.mjs";

const jiti = createProjectJiti();
const {
  buildVariantPracticeEmbeddingHashInput,
  buildVariantPracticeItemEmbeddingText,
} = jiti("./src/lib/rag/variant-practice-embedding-text.ts");

export function selectSyncableVariantPracticeItems(corpus) {
  if (
    !corpus ||
    typeof corpus !== "object" ||
    corpus.corpus_version !== "enriched-practice-corpus-v0" ||
    !Array.isArray(corpus.items)
  ) {
    throw new Error("Expected enriched-practice-corpus-v0 corpus.");
  }

  return corpus.items.filter(
    (item) =>
      item?.tag_review_meta?.review_status === "approved" &&
      !asStringArray(item.feature_flags).includes("needs_visual"),
  );
}

export function buildVariantPracticePgvectorRow({
  item,
  embeddingText,
  embeddingHash,
  embeddingModel,
  embedding,
}) {
  return {
    id: item.id,
    corpus_version: "enriched-practice-corpus-v0",
    source_candidate_id: item.source_candidate_id,
    question_text: item.question_text,
    search_text: item.search_text,
    embedding_text: embeddingText,
    embedding_hash: embeddingHash,
    embedding_model: embeddingModel,
    embedding,
    knowledge_points: asStringArray(item.knowledge_points),
    section_title: typeof item.section_title === "string" ? item.section_title : null,
    difficulty: typeof item.difficulty === "string" ? item.difficulty : null,
    target_skills: asStringArray(item.target_skills),
    method_tags: asStringArray(item.method_tags),
    feature_flags: asStringArray(item.feature_flags),
    source_ref: isRecord(item.source_ref) ? item.source_ref : {},
    tag_review_meta: isRecord(item.tag_review_meta) ? item.tag_review_meta : {},
    review_status: "approved",
  };
}

export async function planVariantPracticePgvectorSync({
  corpus,
  embeddingModel,
  dimensions,
  existingHashes,
  dryRun,
  embeddingProvider,
  repository,
}) {
  const selectedItems = selectSyncableVariantPracticeItems(corpus);
  const rows = [];
  let skippedCount = 0;
  let embeddedCount = 0;

  for (const item of selectedItems) {
    const embeddingText = buildVariantPracticeItemEmbeddingText(item);
    const hashInput = buildVariantPracticeEmbeddingHashInput({
      embedding_model: embeddingModel,
      dimensions,
      embedding_text: embeddingText,
    });
    const embeddingHash = createHash("sha256").update(hashInput).digest("hex");

    if (dryRun) {
      if (existingHashes.get(item.id) === embeddingHash) {
        skippedCount += 1;
      }
      continue;
    }

    const embeddingResult = await embeddingProvider.embedText({ text: embeddingText });
    if (!embeddingResult.ok) {
      throw new Error(`Embedding failed for ${item.id}: ${embeddingResult.error.code}`);
    }

    embeddedCount += 1;
    rows.push(
      buildVariantPracticePgvectorRow({
        item,
        embeddingText,
        embeddingHash,
        embeddingModel,
        embedding: embeddingResult.value.embedding,
      }),
    );
  }

  const activeIds = selectedItems.map((item) => item.id);
  if (!dryRun) {
    await repository.upsertItems(rows);
    await repository.deactivateMissingItems(activeIds);
  }

  return {
    selected_count: selectedItems.length,
    skipped_count: skippedCount,
    embedded_count: embeddedCount,
    upserted_count: rows.length,
    deactivated_reference_count: activeIds.length,
  };
}

function asStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
