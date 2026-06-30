import {
  createSupabaseAdminClient,
  getSupabaseAdminConfig,
} from "@/lib/persistence/supabase-admin";

export interface VariantPracticeCorpusDbItem {
  id: string;
  source_candidate_id: string;
  question_text: string;
  search_text: string;
  knowledge_points: string[];
  section_title: string | null;
  difficulty: string | null;
  target_skills: string[];
  method_tags: string[];
  feature_flags: string[];
  source_ref: unknown;
  tag_review_meta: unknown;
  review_status: "approved";
  cosine_distance: number;
  metadata_score: number;
}

export interface VariantPracticeCorpusUpsertInput {
  id: string;
  corpus_version: "enriched-practice-corpus-v0";
  source_candidate_id: string;
  question_text: string;
  search_text: string;
  embedding_text: string;
  embedding_hash: string;
  embedding_model: string;
  embedding: number[];
  knowledge_points: string[];
  section_title: string | null;
  difficulty: string | null;
  target_skills: string[];
  method_tags: string[];
  feature_flags: string[];
  source_ref: unknown;
  tag_review_meta: unknown;
  review_status: "approved";
}

export interface VariantPracticeCorpusMatchInput {
  query_embedding: number[];
  match_count: number;
  knowledge_points: string[];
  target_skills: string[];
  section_title: string | null;
  timeout_ms: number;
}

export interface VariantPracticeCorpusRepository {
  is_database_configured: boolean;
  listEmbeddingHashes(): Promise<Map<string, string>>;
  upsertItems(items: VariantPracticeCorpusUpsertInput[]): Promise<void>;
  deactivateMissingItems(activeIds: string[]): Promise<void>;
  matchItems(
    input: VariantPracticeCorpusMatchInput,
  ): Promise<VariantPracticeCorpusDbItem[]>;
}

export interface SupabaseVariantPracticeCorpusClient {
  from(table: "variant_practice_corpus_items"): {
    select(
      columns: string,
    ): PromiseLike<{ data: unknown; error: unknown }>;
    upsert(
      payload: Record<string, unknown>[],
      options: { onConflict: string },
    ): PromiseLike<{ error: unknown }>;
    update(payload: Record<string, unknown>): {
      not(
        column: string,
        operator: "in",
        value: string[],
      ): PromiseLike<{ error: unknown }>;
    };
  };
  rpc(
    name: "match_variant_practice_corpus_items",
    params: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

const DEFAULT_QUERY_TIMEOUT_MS = 10_000;
const MIN_QUERY_TIMEOUT_MS = 2_000;
const MAX_QUERY_TIMEOUT_MS = 15_000;

export function createDefaultVariantPracticeCorpusRepository(): VariantPracticeCorpusRepository {
  const config = getSupabaseAdminConfig();
  if (!config.ok) {
    return createDisabledVariantPracticeCorpusRepository();
  }

  const client = createSupabaseAdminClient(
    config.value,
  ) as unknown as SupabaseVariantPracticeCorpusClient;
  return createSupabaseVariantPracticeCorpusRepository(client);
}

export function createSupabaseVariantPracticeCorpusRepository(
  client: SupabaseVariantPracticeCorpusClient,
): VariantPracticeCorpusRepository {
  return {
    is_database_configured: true,
    async listEmbeddingHashes(): Promise<Map<string, string>> {
      const { data, error } = await client
        .from("variant_practice_corpus_items")
        .select("id, embedding_hash");

      if (error) {
        throw error;
      }

      if (!Array.isArray(data)) {
        throw new Error("Expected variant practice hash query to return an array.");
      }

      return new Map(data.map(toEmbeddingHashEntry));
    },
    async upsertItems(items: VariantPracticeCorpusUpsertInput[]): Promise<void> {
      if (items.length === 0) {
        return;
      }

      const now = new Date().toISOString();
      const { error } = await client.from("variant_practice_corpus_items").upsert(
        items.map((item) => ({
          ...item,
          is_active: true,
          updated_at: now,
          last_synced_at: now,
        })),
        { onConflict: "id" },
      );

      if (error) {
        throw error;
      }
    },
    async deactivateMissingItems(activeIds: string[]): Promise<void> {
      const { error } = await client
        .from("variant_practice_corpus_items")
        .update({ is_active: false })
        .not("id", "in", activeIds);

      if (error) {
        throw error;
      }
    },
    async matchItems(
      input: VariantPracticeCorpusMatchInput,
    ): Promise<VariantPracticeCorpusDbItem[]> {
      try {
        const result = await withTimeout(
          client.rpc("match_variant_practice_corpus_items", {
            p_query_embedding: input.query_embedding,
            p_match_count: input.match_count,
            p_knowledge_points: input.knowledge_points,
            p_target_skills: input.target_skills,
            p_section_title: input.section_title,
          }),
          input.timeout_ms,
        );

        if (!result || result.error || !Array.isArray(result.data)) {
          return [];
        }

        return result.data.map(toVariantPracticeCorpusDbItem);
      } catch {
        return [];
      }
    },
  };
}

export function createDisabledVariantPracticeCorpusRepository(): VariantPracticeCorpusRepository {
  return {
    is_database_configured: false,
    async listEmbeddingHashes(): Promise<Map<string, string>> {
      return new Map();
    },
    async upsertItems(): Promise<void> {},
    async deactivateMissingItems(): Promise<void> {},
    async matchItems(): Promise<VariantPracticeCorpusDbItem[]> {
      return [];
    },
  };
}

export function normalizePgvectorQueryTimeoutMs(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return DEFAULT_QUERY_TIMEOUT_MS;
  }

  return Math.min(Math.max(parsed, MIN_QUERY_TIMEOUT_MS), MAX_QUERY_TIMEOUT_MS);
}

async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function toEmbeddingHashEntry(row: unknown): [string, string] {
  if (
    !row ||
    typeof row !== "object" ||
    Array.isArray(row) ||
    typeof (row as { id?: unknown }).id !== "string" ||
    typeof (row as { embedding_hash?: unknown }).embedding_hash !== "string"
  ) {
    throw new Error("Expected variant practice hash row.");
  }

  return [
    (row as { id: string }).id,
    (row as { embedding_hash: string }).embedding_hash,
  ];
}

function toVariantPracticeCorpusDbItem(row: unknown): VariantPracticeCorpusDbItem {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("Expected variant practice match row.");
  }

  const value = row as VariantPracticeCorpusDbItem;
  if (
    typeof value.id !== "string" ||
    typeof value.source_candidate_id !== "string" ||
    typeof value.question_text !== "string" ||
    typeof value.search_text !== "string" ||
    !Array.isArray(value.knowledge_points) ||
    (value.section_title !== null && typeof value.section_title !== "string") ||
    (value.difficulty !== null && typeof value.difficulty !== "string") ||
    !Array.isArray(value.target_skills) ||
    !Array.isArray(value.method_tags) ||
    !Array.isArray(value.feature_flags) ||
    value.review_status !== "approved" ||
    typeof value.cosine_distance !== "number" ||
    typeof value.metadata_score !== "number"
  ) {
    throw new Error("Expected valid variant practice match row.");
  }

  return value;
}
