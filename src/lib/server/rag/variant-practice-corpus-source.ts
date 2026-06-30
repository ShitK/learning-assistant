// server-only: this file reads ignored local RAG artifacts and may call Supabase/embedding providers.
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import type { EmbeddingProvider } from "@/lib/providers/embedding-provider";
import {
  createEmbeddingProvider,
  createEmbeddingProviderConfigFromEnv,
} from "@/lib/providers/embedding-provider";
import {
  createDefaultVariantPracticeCorpusRepository,
  normalizePgvectorQueryTimeoutMs,
  type VariantPracticeCorpusDbItem,
  type VariantPracticeCorpusRepository,
} from "@/lib/persistence/variant-practice-corpus-persistence";
import type { DynamicPracticeQuery } from "@/lib/rag/dynamic-variant-practice-query";
import { buildDynamicPracticeQueryEmbeddingText } from "@/lib/rag/variant-practice-embedding-text";

export interface DynamicPracticeCorpus {
  corpus_version: "enriched-practice-corpus-v0";
  items: DynamicPracticeCorpusItem[];
  item_count?: number;
  [key: string]: unknown;
}

export interface DynamicPracticeCorpusItem {
  id: string;
  source_candidate_id: string;
  question_text: string;
  search_text: string;
  knowledge_points: string[];
  section_title?: string | null;
  target_skills?: string[];
  method_tags?: string[];
  feature_flags?: string[];
  source_ref?: unknown;
  tag_review_meta?: {
    review_status?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface PgvectorCorpusSourceDeps {
  repository?: Pick<
    VariantPracticeCorpusRepository,
    "is_database_configured" | "matchItems"
  >;
  embedding_provider?: EmbeddingProvider;
  timeout_ms?: number;
}

const defaultLocalCorpusPath =
  "artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json";

export async function readPgvectorDynamicPracticeCorpus(
  query: DynamicPracticeQuery,
  deps: PgvectorCorpusSourceDeps = {},
): Promise<DynamicPracticeCorpus | null> {
  const repository =
    deps.repository ?? createDefaultVariantPracticeCorpusRepository();
  if (!repository.is_database_configured) {
    return null;
  }

  const embeddingProvider =
    deps.embedding_provider ?? createDefaultEmbeddingProvider();
  if (!embeddingProvider) {
    return null;
  }

  const embeddingText = buildDynamicPracticeQueryEmbeddingText(query);
  let embeddingResult: Awaited<ReturnType<EmbeddingProvider["embedText"]>>;
  try {
    embeddingResult = await embeddingProvider.embedText({ text: embeddingText });
  } catch {
    return null;
  }
  if (!embeddingResult.ok) {
    return null;
  }

  let rows: VariantPracticeCorpusDbItem[];
  try {
    rows = await repository.matchItems({
      query_embedding: embeddingResult.value.embedding,
      match_count: 12,
      knowledge_points: query.knowledge_points,
      target_skills: query.target_skills,
      section_title: query.section_title,
      timeout_ms:
        deps.timeout_ms ??
        normalizePgvectorQueryTimeoutMs(process.env.RAG_PGVECTOR_QUERY_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (rows.length === 0) {
    return null;
  }

  return {
    corpus_version: "enriched-practice-corpus-v0",
    item_count: rows.length,
    items: rows.map(toDynamicPracticeCorpusItem),
  };
}

export async function readLocalDynamicPracticeCorpus(
  filePath = defaultLocalCorpusPath,
): Promise<DynamicPracticeCorpus | null> {
  try {
    const absoluteFilePath = isAbsolute(filePath)
      ? filePath
      : join(/* turbopackIgnore: true */ process.cwd(), filePath);
    const rawText = await readFile(absoluteFilePath, "utf8");
    const parsed: unknown = JSON.parse(rawText);
    return isDynamicPracticeCorpus(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function createDefaultEmbeddingProvider(): EmbeddingProvider | null {
  const config = createEmbeddingProviderConfigFromEnv(process.env);
  return config.ok ? createEmbeddingProvider(config.value) : null;
}

function toDynamicPracticeCorpusItem(
  row: VariantPracticeCorpusDbItem,
): DynamicPracticeCorpusItem {
  return {
    id: row.id,
    source_candidate_id: row.source_candidate_id,
    question_text: row.question_text,
    search_text: row.search_text,
    knowledge_points: row.knowledge_points,
    section_title: row.section_title,
    difficulty: row.difficulty,
    target_skills: row.target_skills,
    method_tags: row.method_tags,
    feature_flags: row.feature_flags,
    source_ref: row.source_ref,
    tag_review_meta: readTagReviewMeta(row.tag_review_meta),
  };
}

function isDynamicPracticeCorpus(value: unknown): value is DynamicPracticeCorpus {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const corpus = value as { corpus_version?: unknown; items?: unknown };
  return (
    corpus.corpus_version === "enriched-practice-corpus-v0" &&
    Array.isArray(corpus.items) &&
    corpus.items.every(isDynamicPracticeCorpusItem)
  );
}

function isDynamicPracticeCorpusItem(
  value: unknown,
): value is DynamicPracticeCorpusItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const item = value as {
    id?: unknown;
    source_candidate_id?: unknown;
    question_text?: unknown;
    search_text?: unknown;
    knowledge_points?: unknown;
  };

  return (
    typeof item.id === "string" &&
    typeof item.source_candidate_id === "string" &&
    typeof item.question_text === "string" &&
    item.question_text.trim().length > 0 &&
    typeof item.search_text === "string" &&
    item.search_text.trim().length > 0 &&
    Array.isArray(item.knowledge_points) &&
    item.knowledge_points.every((point) => typeof point === "string")
  );
}

function readTagReviewMeta(
  value: unknown,
): DynamicPracticeCorpusItem["tag_review_meta"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as DynamicPracticeCorpusItem["tag_review_meta"];
}
