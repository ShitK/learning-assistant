#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  buildAiTagPrompt,
  buildAiTagProposalArtifact,
  summarizeAiTagProposals,
  validateAiTagProposalArtifact,
} from "./ai-tag-proposal-core.mjs";
import { validatePracticeCorpus } from "./practice-corpus-search-core.mjs";
import { validateTagProposalArtifact } from "./practice-tag-proposal-core.mjs";
import { getPracticeTagTaxonomy } from "./practice-tag-taxonomy.mjs";

class CliUsageError extends Error {}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.corpus) {
    throw new CliUsageError("--corpus requires a value");
  }
  if (!args.rules) {
    throw new CliUsageError("--rules requires a value");
  }

  const providerConfig = readProviderConfig(process.env);
  const taxonomy = getPracticeTagTaxonomy(args.taxonomy);
  if (!taxonomy) {
    throw new CliUsageError("unsupported taxonomy");
  }

  const corpusPath = resolve(args.corpus);
  const rulesPath = resolve(args.rules);
  const outputDir = resolve(args.out ?? "artifacts/rag/ai-tag-proposals");
  const corpusJson = await readJsonFile({
    filePath: corpusPath,
    missingMessage: "practice corpus file not found",
    parseMessage: "failed to parse practice corpus JSON",
  });
  const corpusValidation = validatePracticeCorpus(corpusJson);
  if (!corpusValidation.ok) {
    throw new Error(`invalid practice corpus: ${corpusValidation.errors.join(", ")}`);
  }

  const rulesJson = await readJsonFile({
    filePath: rulesPath,
    missingMessage: "candidate tag proposal file not found",
    parseMessage: "failed to parse candidate tag proposal JSON",
  });
  const rulesValidation = validateTagProposalArtifact(rulesJson);
  if (!rulesValidation.ok) {
    throw new Error(`invalid candidate tag proposal artifact: ${rulesValidation.errors.join(", ")}`);
  }

  const corpus = limitCorpus(corpusValidation.corpus, args.limit);
  const responsesByItemId = await buildResponsesByItemId({
    corpus,
    ruleProposalArtifact: rulesValidation.proposalArtifact,
    taxonomy,
    providerConfig,
  });
  const proposalArtifact = buildAiTagProposalArtifact({
    corpus,
    ruleProposalArtifact: rulesValidation.proposalArtifact,
    taxonomy,
    providerMeta: {
      provider_name: providerConfig.providerName,
      base_url_host: providerConfig.baseUrlHost,
      model: providerConfig.model,
      timeout_ms: providerConfig.timeoutMs,
      fake_response: Boolean(process.env.MATHTRACE_FAKE_RAG_TAG_RESPONSE),
    },
    generatedAt: new Date().toISOString(),
    sourceCorpusFile: formatLocalPath(corpusPath),
    sourceRuleProposalFile: formatLocalPath(rulesPath),
    responsesByItemId,
  });
  const proposalValidation = validateAiTagProposalArtifact(proposalArtifact, taxonomy);
  if (!proposalValidation.ok) {
    throw new Error(`invalid AI tag proposal artifact: ${proposalValidation.errors.join(", ")}`);
  }

  const summary = summarizeAiTagProposals(proposalArtifact);
  await mkdir(outputDir, { recursive: true });
  const proposalPath = resolve(outputDir, "candidate_ai_tag_proposals.json");
  const summaryPath = resolve(outputDir, "ai_tag_proposal_summary.json");
  await writeFile(proposalPath, `${JSON.stringify(proposalArtifact, null, 2)}\n`);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  printSummary({ proposalPath, summaryPath, summary });
}

async function buildResponsesByItemId({ corpus, ruleProposalArtifact, taxonomy, providerConfig }) {
  const ruleProposalsByItemId = new Map(
    (ruleProposalArtifact?.proposals ?? []).map((proposal) => [proposal.item_id, proposal]),
  );
  const responsesByItemId = new Map();
  for (const item of corpus.items ?? []) {
    const prompt = buildAiTagPrompt({
      item,
      ruleProposal: ruleProposalsByItemId.get(item.id),
      taxonomy,
    });
    const responseText = await requestAiTags({ prompt, providerConfig });
    responsesByItemId.set(item.id, responseText);
  }
  return responsesByItemId;
}

async function requestAiTags({ prompt, providerConfig, fetchImpl = fetch }) {
  if (process.env.MATHTRACE_FAKE_RAG_TAG_RESPONSE) {
    return process.env.MATHTRACE_FAKE_RAG_TAG_RESPONSE;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), providerConfig.timeoutMs);
  try {
    const response = await fetchImpl(joinChatCompletionsUrl(providerConfig.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${providerConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: providerConfig.model,
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`RAG tag provider HTTP ${response.status}`);
    }
    const json = await response.json();
    return json.choices?.[0]?.message?.content ?? "";
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("RAG tag provider request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--corpus") {
      args.corpus = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--rules") {
      args.rules = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--taxonomy") {
      args.taxonomy = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--out") {
      args.out = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--limit") {
      args.limit = parseLimit(readOptionValue(argv, index, arg));
      index += 1;
    } else {
      throw new CliUsageError(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function readOptionValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new CliUsageError(`${optionName} requires a value`);
  }
  return value;
}

function parseLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new CliUsageError("--limit requires a positive integer");
  }
  return limit;
}

function readProviderConfig(env) {
  const baseUrl = trimEnv(env.RAG_TAG_PROVIDER_BASE_URL);
  const model = trimEnv(env.RAG_TAG_PROVIDER_MODEL);
  const apiKey = trimEnv(env.RAG_TAG_PROVIDER_API_KEY);
  if (!baseUrl || !model || !apiKey) {
    throw new CliUsageError("RAG tag provider is not configured");
  }
  return {
    providerName: "rag_tag_provider",
    baseUrl,
    baseUrlHost: readUrlHost(baseUrl),
    model,
    apiKey,
    timeoutMs: normalizeTimeoutMs(env.RAG_TAG_PROVIDER_TIMEOUT_MS),
  };
}

function trimEnv(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTimeoutMs(value) {
  if (value === undefined || value === "") {
    return 30000;
  }
  const timeoutMs = Number(value);
  return Number.isInteger(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
}

function readUrlHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return "invalid-url";
  }
}

function joinChatCompletionsUrl(baseUrl) {
  return new URL("chat/completions", `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function limitCorpus(corpus, limit) {
  if (!limit) {
    return corpus;
  }
  const items = (corpus.items ?? []).slice(0, limit);
  return {
    ...corpus,
    item_count: items.length,
    items,
  };
}

async function readJsonFile({ filePath, missingMessage, parseMessage }) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    throw new CliUsageError(`${missingMessage}: ${filePath}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(parseMessage);
  }
}

function formatLocalPath(filePath) {
  const relativePath = relative(process.cwd(), filePath);
  if (relativePath && !relativePath.startsWith("..")) {
    return relativePath;
  }
  return filePath;
}

function printSummary({ proposalPath, summaryPath, summary }) {
  console.log(`Wrote ${proposalPath}`);
  console.log(`Wrote ${summaryPath}`);
  console.log(`Items: ${summary.item_count}`);
  console.log(`High confidence: ${summary.high_confidence_items}`);
  console.log(`Medium confidence: ${summary.medium_confidence_items}`);
  console.log(`Low confidence: ${summary.low_confidence_items}`);
  console.log(`Needs review: ${summary.needs_review_items}`);
  console.log(`Warnings: ${sumDistribution(summary.warning_distribution)}`);
  console.log(`Target skills: ${JSON.stringify(summary.target_skill_distribution)}`);
  console.log(`Method tags: ${JSON.stringify(summary.method_tag_distribution)}`);
  console.log(`Feature flags: ${JSON.stringify(summary.feature_flag_distribution)}`);
  console.log(`Warning distribution: ${JSON.stringify(summary.warning_distribution)}`);
}

function sumDistribution(distribution) {
  return Object.values(distribution ?? {}).reduce((sum, count) => sum + count, 0);
}

function printHelp() {
  console.log(`Usage:
  node scripts/rag/build-ai-tag-proposals.mjs --corpus <practice_corpus.json> --rules <candidate_tag_proposals.json> [--taxonomy math_derivative_v0] [--out <dir>] [--limit N]

Builds local AI-assisted tag proposal artifacts from a practice corpus and rule proposal artifact.
Configure the provider base URL, model, secret token, and optional timeout via environment variables.`);
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error.message);
  process.exit(1);
});
