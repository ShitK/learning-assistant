// server-only: this file reads ignored local RAG artifacts and imports server-side Agent code.
import { searchPracticeCorpus } from "../../../../scripts/rag/practice-corpus-search-core.mjs";
import { recommendVariantPractice } from "../../../../scripts/rag/variant-practice-agent-core.mjs";
import {
  createDiagnoseError,
  type DiagnoseErrorResponse,
} from "@/lib/diagnosis/diagnose-api";
import {
  deriveDynamicVariantPracticeQuery,
  parseDynamicVariantPracticeRequest,
  type DynamicPracticeQuery,
} from "@/lib/rag/dynamic-variant-practice-query";
import {
  createVariantPracticeProductViewModel,
  type ProductVariantPractice,
  type ProductVariantPracticeItem,
} from "@/lib/rag/variant-practice-product-view-model";
import {
  readLocalDynamicPracticeCorpus,
  readPgvectorDynamicPracticeCorpus,
  type DynamicPracticeCorpus,
  type DynamicPracticeCorpusItem,
} from "@/lib/server/rag/variant-practice-corpus-source";

export interface DynamicVariantPracticeSuccessResponse {
  variant_practice: ProductVariantPractice | null;
}

export type DynamicVariantPracticeApiResponse =
  | DynamicVariantPracticeSuccessResponse
  | DiagnoseErrorResponse;

export interface DynamicVariantPracticeServiceResult {
  status: number;
  body: DynamicVariantPracticeApiResponse;
}

export interface DynamicVariantPracticeEvalResult {
  status: number;
  retrieval_source: "pgvector" | "local_json" | null;
  pgvector_attempted: boolean;
  candidate_count_before_agent: number;
  candidate_count_after_approved_filter: number;
  candidate_items_after_filter: DynamicVariantPracticeEvalCandidateItem[];
  selected_candidate_items: DynamicVariantPracticeEvalCandidateItem[];
  product_view_model: ProductVariantPractice | null;
}

export interface VariantPracticeAgent {
  // Agent artifact 来自 scripts/**，必须按不可信输入交给 product view model 校验。
  recommendVariantPractice(input: {
    corpus: DynamicPracticeCorpus;
    query: DynamicPracticeQuery;
    searchLimit?: number;
  }): unknown;
}

export interface DynamicVariantPracticeServiceDeps {
  corpusFilePath?: string;
  agent?: VariantPracticeAgent;
  searchLimit?: number;
  pgvectorCorpusSource?: typeof readPgvectorDynamicPracticeCorpus | null;
  localCorpusSource?: typeof readLocalDynamicPracticeCorpus;
}

const defaultVariantPracticeAgent: VariantPracticeAgent = {
  recommendVariantPractice,
};

export async function handleDynamicVariantPracticeRequest(
  value: unknown,
  deps: DynamicVariantPracticeServiceDeps = {},
): Promise<DynamicVariantPracticeServiceResult> {
  const parsed = parseDynamicVariantPracticeRequest(value);
  if (!parsed.ok) {
    return {
      status: 400,
      body: createDiagnoseError("invalid_request", parsed.message, true),
    };
  }

  const query = deriveDynamicVariantPracticeQuery(parsed.value);
  if (!query) {
    return success(null);
  }

  const pgvectorCorpusSource =
    deps.pgvectorCorpusSource ?? readPgvectorDynamicPracticeCorpus;
  const localCorpusSource =
    deps.localCorpusSource ?? readLocalDynamicPracticeCorpus;

  const pgvectorCorpus = await pgvectorCorpusSource(query);
  const pgvectorResult = pgvectorCorpus
    ? await buildVariantPracticeFromCorpus(pgvectorCorpus, query, deps)
    : null;
  if (pgvectorResult) {
    return success(pgvectorResult);
  }

  const localCorpus = await localCorpusSource(deps.corpusFilePath);
  const localResult = localCorpus
    ? await buildVariantPracticeFromCorpus(localCorpus, query, deps)
    : null;

  return success(localResult);
}

export async function handleDynamicVariantPracticeEvalRequest(
  value: unknown,
  deps: DynamicVariantPracticeServiceDeps = {},
): Promise<DynamicVariantPracticeEvalResult> {
  const parsed = parseDynamicVariantPracticeRequest(value);
  if (!parsed.ok) {
    return evalResult(null, false, 0, 0, [], [], null, 400);
  }

  const query = deriveDynamicVariantPracticeQuery(parsed.value);
  if (!query) {
    return evalResult(null, false, 0, 0, [], [], null);
  }

  const shouldUsePgvector = deps.pgvectorCorpusSource !== null;
  const pgvectorCorpusSource =
    deps.pgvectorCorpusSource ?? readPgvectorDynamicPracticeCorpus;
  const localCorpusSource =
    deps.localCorpusSource ?? readLocalDynamicPracticeCorpus;

  const pgvectorCorpus = shouldUsePgvector ? await pgvectorCorpusSource(query) : null;
  const pgvectorResult = pgvectorCorpus
    ? await buildVariantPracticeEvalFromCorpus(
        "pgvector",
        true,
        pgvectorCorpus,
        query,
        deps,
      )
    : null;
  if (pgvectorResult?.product_view_model) {
    return pgvectorResult;
  }

  const localCorpus = await localCorpusSource(deps.corpusFilePath);
  const localResult = localCorpus
    ? await buildVariantPracticeEvalFromCorpus(
        "local_json",
        shouldUsePgvector,
        localCorpus,
        query,
        deps,
      )
    : null;

  return localResult ?? evalResult(null, shouldUsePgvector, 0, 0, [], [], null);
}

export async function loadDefaultVariantPracticeAgent(): Promise<VariantPracticeAgent | null> {
  return defaultVariantPracticeAgent;
}

async function buildVariantPracticeFromCorpus(
  corpus: DynamicPracticeCorpus,
  query: DynamicPracticeQuery,
  deps: DynamicVariantPracticeServiceDeps,
): Promise<ProductVariantPractice | null> {
  const prepared = prepareCorpusAndQuery(corpus, query);
  if (!prepared) {
    return null;
  }

  const result = await buildVariantPracticeFromPreparedCorpus(
    prepared.corpus,
    prepared.query,
    deps,
  );
  return result?.viewModel ?? null;
}

async function buildVariantPracticeEvalFromCorpus(
  retrievalSource: "pgvector" | "local_json",
  pgvectorAttempted: boolean,
  corpus: DynamicPracticeCorpus,
  query: DynamicPracticeQuery,
  deps: DynamicVariantPracticeServiceDeps,
): Promise<DynamicVariantPracticeEvalResult> {
  const candidateCountBeforeAgent = corpus.items.length;
  const prepared = prepareCorpusAndQuery(corpus, query);
  const searchCandidateItems = prepared
    ? searchPracticeCorpus({
        corpus: prepared.corpus,
        query: prepared.query,
        limit: deps.searchLimit ?? 12,
      }).map((candidate: { item: DynamicPracticeCorpus["items"][number] }) => candidate.item)
    : [];
  const candidateCountAfterApprovedFilter = searchCandidateItems.length;
  const candidateItemsAfterFilter = toEvalCandidateItems(searchCandidateItems);
  if (!prepared) {
    return evalResult(
      retrievalSource,
      pgvectorAttempted,
      candidateCountBeforeAgent,
      candidateCountAfterApprovedFilter,
      candidateItemsAfterFilter,
      [],
      null,
    );
  }

  const productResult = await buildVariantPracticeFromPreparedCorpus(
    prepared.corpus,
    prepared.query,
    deps,
  );

  return evalResult(
    retrievalSource,
    pgvectorAttempted,
    candidateCountBeforeAgent,
    candidateCountAfterApprovedFilter,
    candidateItemsAfterFilter,
    productResult?.selectedCandidateItems ?? [],
    productResult?.viewModel ?? null,
  );
}

async function buildVariantPracticeFromPreparedCorpus(
  corpus: DynamicPracticeCorpus,
  query: DynamicPracticeQuery,
  deps: DynamicVariantPracticeServiceDeps,
): Promise<{
  viewModel: ProductVariantPractice;
  selectedCandidateItems: DynamicVariantPracticeEvalResult["selected_candidate_items"];
} | null> {
  const agent = deps.agent ?? (await loadDefaultVariantPracticeAgent());
  if (!agent) {
    return null;
  }

  try {
    const artifact = agent.recommendVariantPractice({
      corpus,
      query,
      searchLimit: deps.searchLimit ?? 12,
    });
    const viewModel = createVariantPracticeProductViewModel(artifact);
    if (!viewModel || viewModel.items.length !== 3) {
      return null;
    }

    return {
      viewModel,
      selectedCandidateItems: selectCandidateItemsFromArtifact(
        artifact,
        corpus.items,
        viewModel.items,
      ),
    };
  } catch {
    return null;
  }
}

function prepareCorpusAndQuery(
  corpus: DynamicPracticeCorpus,
  query: DynamicPracticeQuery,
): { corpus: DynamicPracticeCorpus; query: DynamicPracticeQuery } | null {
  const approvedItems = corpus.items.filter(isApprovedDynamicPracticeItem);
  if (approvedItems.length === 0) {
    return null;
  }

  const sectionTitles = new Set(
    approvedItems
      .map((item) => item.section_title)
      .filter((sectionTitle): sectionTitle is string => typeof sectionTitle === "string"),
  );
  const effectiveQuery =
    query.section_title && !sectionTitles.has(query.section_title)
      ? { ...query, section_title: null }
      : query;

  return {
    corpus: {
      ...corpus,
      item_count: approvedItems.length,
      items: approvedItems,
    },
    query: effectiveQuery,
  };
}

function isApprovedDynamicPracticeItem(item: DynamicPracticeCorpusItem): boolean {
  return item.tag_review_meta?.review_status === "approved";
}

function selectCandidateItemsFromArtifact(
  artifact: unknown,
  corpusItems: DynamicPracticeCorpus["items"],
  productItems: ProductVariantPracticeItem[],
): DynamicVariantPracticeEvalResult["selected_candidate_items"] {
  const recommendationRefs = readArtifactRecommendationRefs(artifact);
  const selectedItems = productItems
    .map((productItem) =>
      findCandidateItemByProductItem(productItem, recommendationRefs, corpusItems),
    )
    .filter((item): item is DynamicPracticeCorpus["items"][number] => Boolean(item));

  return toEvalCandidateItems(selectedItems);
}

function readArtifactRecommendationRefs(artifact: unknown): ArtifactRecommendationRef[] {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return [];
  }

  const recommendations = (artifact as { recommendations?: unknown }).recommendations;
  if (!Array.isArray(recommendations)) {
    return [];
  }

  return recommendations
    .map((recommendation) => toArtifactRecommendationRef(recommendation))
    .filter((recommendation): recommendation is ArtifactRecommendationRef => Boolean(recommendation))
    .sort((left, right) => left.rank - right.rank);
}

function toArtifactRecommendationRef(value: unknown): ArtifactRecommendationRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const recommendation = value as {
    rank?: unknown;
    item_id?: unknown;
    source_candidate_id?: unknown;
    question_text?: unknown;
  };

  if (
    typeof recommendation.rank !== "number" ||
    !Number.isInteger(recommendation.rank) ||
    typeof recommendation.item_id !== "string" ||
    !recommendation.item_id.trim() ||
    typeof recommendation.source_candidate_id !== "string" ||
    !recommendation.source_candidate_id.trim() ||
    typeof recommendation.question_text !== "string" ||
    !recommendation.question_text.trim()
  ) {
    return null;
  }

  return {
    rank: recommendation.rank,
    item_id: recommendation.item_id,
    source_candidate_id: recommendation.source_candidate_id,
    question_text: recommendation.question_text.trim(),
  };
}

function findCandidateItemByProductItem(
  productItem: ProductVariantPracticeItem,
  recommendationRefs: ArtifactRecommendationRef[],
  corpusItems: DynamicPracticeCorpus["items"],
): DynamicPracticeCorpus["items"][number] | null {
  const recommendationRef =
    recommendationRefs.find(
      (ref) =>
        ref.rank === productItem.rank &&
        ref.question_text === productItem.question_text,
    ) ?? null;

  if (!recommendationRef) {
    return null;
  }

  return findCandidateItemByRecommendationRef(recommendationRef, corpusItems);
}

function findCandidateItemByRecommendationRef(
  recommendationRef: ArtifactRecommendationRef,
  corpusItems: DynamicPracticeCorpus["items"],
): DynamicPracticeCorpus["items"][number] | null {
  const exactMatch =
    corpusItems.find(
      (item) =>
        item.id === recommendationRef.item_id &&
        item.source_candidate_id === recommendationRef.source_candidate_id,
    ) ?? null;

  if (exactMatch) {
    return exactMatch;
  }

  return corpusItems.find((item) => item.id === recommendationRef.item_id) ?? null;
}

function toEvalCandidateItems(
  items: DynamicPracticeCorpus["items"],
): DynamicVariantPracticeEvalCandidateItem[] {
  return items.map((item) => ({
    id: item.id,
    source_candidate_id: item.source_candidate_id,
    knowledge_points: item.knowledge_points,
    section_title: item.section_title,
    target_skills: item.target_skills,
    method_tags: item.method_tags,
  }));
}

function success(
  variantPractice: ProductVariantPractice | null,
): DynamicVariantPracticeServiceResult {
  return {
    status: 200,
    body: { variant_practice: variantPractice },
  };
}

function evalResult(
  retrievalSource: "pgvector" | "local_json" | null,
  pgvectorAttempted: boolean,
  candidateCountBeforeAgent: number,
  candidateCountAfterApprovedFilter: number,
  candidateItemsAfterFilter: DynamicVariantPracticeEvalCandidateItem[],
  selectedCandidateItems: DynamicVariantPracticeEvalResult["selected_candidate_items"],
  productViewModel: ProductVariantPractice | null,
  status = 200,
): DynamicVariantPracticeEvalResult {
  return {
    status,
    retrieval_source: retrievalSource,
    pgvector_attempted: pgvectorAttempted,
    candidate_count_before_agent: candidateCountBeforeAgent,
    candidate_count_after_approved_filter: candidateCountAfterApprovedFilter,
    candidate_items_after_filter: candidateItemsAfterFilter,
    selected_candidate_items: selectedCandidateItems,
    product_view_model: productViewModel,
  };
}

interface DynamicVariantPracticeEvalCandidateItem {
  id: string;
  source_candidate_id: string;
  knowledge_points: string[];
  section_title?: string | null;
  target_skills?: string[];
  method_tags?: string[];
}

interface ArtifactRecommendationRef {
  rank: number;
  item_id: string;
  source_candidate_id: string;
  question_text: string;
}
