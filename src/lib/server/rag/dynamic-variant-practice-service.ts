// server-only: this file reads ignored local RAG artifacts and imports server-side Agent code.
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
  pgvectorCorpusSource?: typeof readPgvectorDynamicPracticeCorpus;
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

  const agent = deps.agent ?? (await loadDefaultVariantPracticeAgent());
  if (!agent) {
    return null;
  }

  try {
    const artifact = agent.recommendVariantPractice({
      corpus: prepared.corpus,
      query: prepared.query,
      searchLimit: deps.searchLimit ?? 12,
    });
    const viewModel = createVariantPracticeProductViewModel(artifact);
    return viewModel && viewModel.items.length === 3 ? viewModel : null;
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

function success(
  variantPractice: ProductVariantPractice | null,
): DynamicVariantPracticeServiceResult {
  return {
    status: 200,
    body: { variant_practice: variantPractice },
  };
}
