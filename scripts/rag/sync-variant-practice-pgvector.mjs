#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createProjectJiti } from "../test-support/project-jiti.mjs";
import { planVariantPracticePgvectorSync } from "./sync-variant-practice-pgvector-core.mjs";

const jiti = createProjectJiti();
const {
  createEmbeddingProvider,
  createEmbeddingProviderConfigFromEnv,
} = jiti("./src/lib/providers/embedding-provider.ts");

const args = new Set(process.argv.slice(2));
const dryRun = !args.has("--apply");

if (![0, 1].includes([...args].filter((arg) => arg === "--dry-run" || arg === "--apply").length)) {
  console.error("Usage: node scripts/rag/sync-variant-practice-pgvector.mjs --dry-run|--apply");
  process.exit(1);
}

const corpusPath = "artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json";
let corpus;
try {
  corpus = JSON.parse(await readFile(corpusPath, "utf8"));
} catch {
  console.error(
    "无法读取或解析 enriched corpus 文件：artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json",
  );
  process.exit(1);
}

let embeddingProvider = {
  async embedText() {
    throw new Error("dry-run does not embed");
  },
};
let embeddingModel = process.env.RAG_EMBEDDING_PROVIDER_MODEL || "text-embedding-3-small";
let dimensions = 1536;
let repository = createDryRunRepository();

const {
  createDefaultVariantPracticeCorpusRepository,
} = jiti("./src/lib/persistence/variant-practice-corpus-persistence.ts");

if (!dryRun) {
  repository = createDefaultVariantPracticeCorpusRepository();
  if (!repository.is_database_configured) {
    console.error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const config = createEmbeddingProviderConfigFromEnv(process.env);
  if (!config.ok) {
    console.error(config.error.message);
    process.exit(1);
  }
  embeddingProvider = createEmbeddingProvider(config.value);
  embeddingModel = config.value.model;
  dimensions = config.value.dimensions;
} else {
  const configuredRepository = createDefaultVariantPracticeCorpusRepository();
  if (configuredRepository.is_database_configured) {
    repository = configuredRepository;
  }
}

const existingHashes = await repository.listEmbeddingHashes();

const summary = await planVariantPracticePgvectorSync({
  corpus,
  embeddingModel,
  dimensions,
  existingHashes,
  dryRun,
  embeddingProvider,
  repository,
});

console.log(JSON.stringify({ mode: dryRun ? "dry-run" : "apply", ...summary }, null, 2));

function createDryRunRepository() {
  return {
    is_database_configured: false,
    async listEmbeddingHashes() {
      return new Map();
    },
    async upsertItems() {
      throw new Error("dry-run must not upsert");
    },
    async deactivateMissingItems() {
      throw new Error("dry-run must not deactivate");
    },
  };
}
