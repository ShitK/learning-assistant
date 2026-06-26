// server-only: this file reads ignored local RAG artifacts and imports server-side Agent code.
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
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
}

interface DynamicPracticeCorpus {
  corpus_version: "enriched-practice-corpus-v0";
  items: DynamicPracticeCorpusItem[];
  item_count?: number;
  [key: string]: unknown;
}

interface DynamicPracticeCorpusItem {
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

const defaultCorpusPath =
  "artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json";
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

  const corpus = await readDynamicPracticeCorpus(
    deps.corpusFilePath ?? defaultCorpusPath,
  );
  if (!corpus) {
    return success(null);
  }

  const prepared = prepareCorpusAndQuery(corpus, query);
  if (!prepared) {
    return success(null);
  }

  const agent = deps.agent ?? (await loadDefaultVariantPracticeAgent());
  if (!agent) {
    return success(null);
  }

  let artifact: unknown;
  try {
    artifact = agent.recommendVariantPractice({
      corpus: prepared.corpus,
      query: prepared.query,
      searchLimit: deps.searchLimit ?? 12,
    });
  } catch {
    return success(null);
  }

  const viewModel = createVariantPracticeProductViewModel(artifact);

  return success(viewModel && viewModel.items.length === 3 ? viewModel : null);
}

export async function loadDefaultVariantPracticeAgent(): Promise<VariantPracticeAgent | null> {
  return defaultVariantPracticeAgent;
}

async function readDynamicPracticeCorpus(
  filePath: string,
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
