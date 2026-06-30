#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createProjectJiti } from "../test-support/project-jiti.mjs";
import { planVariantPracticePgvectorSync } from "./sync-variant-practice-pgvector-core.mjs";

const jiti = createProjectJiti();
const {
  createEmbeddingProvider,
  createEmbeddingProviderConfigFromEnv,
} = jiti("./src/lib/providers/embedding-provider.ts");
const {
  createDefaultVariantPracticeCorpusRepository,
} = jiti("./src/lib/persistence/variant-practice-corpus-persistence.ts");

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
const repository = createDefaultVariantPracticeCorpusRepository();

if (!repository.is_database_configured && !dryRun) {
  console.error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

let embeddingProvider = {
  async embedText() {
    throw new Error("dry-run does not embed");
  },
};
let embeddingModel = process.env.RAG_EMBEDDING_PROVIDER_MODEL || "text-embedding-3-small";
let dimensions = 1536;

if (!dryRun) {
  const config = createEmbeddingProviderConfigFromEnv(process.env);
  if (!config.ok) {
    console.error(config.error.message);
    process.exit(1);
  }
  embeddingProvider = createEmbeddingProvider(config.value);
  embeddingModel = config.value.model;
  dimensions = config.value.dimensions;
}

const existingHashes = dryRun
  ? new Map()
  : await repository.listEmbeddingHashes();

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
