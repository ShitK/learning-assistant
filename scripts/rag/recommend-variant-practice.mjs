#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validatePracticeCorpus } from "./practice-corpus-search-core.mjs";
import { recommendVariantPractice } from "./variant-practice-agent-core.mjs";

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
  if (!args.query) {
    throw new CliUsageError("--query requires a value");
  }

  const corpusPath = resolve(args.corpus);
  const queryPath = resolve(args.query);
  const outputDir = resolve(args.out ?? "artifacts/rag/variant-practice-agent");

  const corpusJson = await readJsonFile({
    filePath: corpusPath,
    missingMessage: "corpus file not found",
    parseMessage: "failed to parse practice corpus JSON",
  });
  const validation = validatePracticeCorpus(corpusJson);
  if (!validation.ok) {
    throw new Error(`invalid practice corpus: ${validation.errors.join(", ")}`);
  }

  const query = await readJsonFile({
    filePath: queryPath,
    missingMessage: "query file not found",
    parseMessage: "failed to parse variant practice query JSON",
  });

  const result = recommendVariantPractice({
    corpus: validation.corpus,
    query,
    searchLimit: normalizeLimit(args.limit),
  });

  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, "recommendations.json");
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`Wrote ${outputPath}`);
  console.log(`Recommendations: ${result.recommendations.length}`);
  console.log(`Candidates: ${result.search_summary.candidate_count}`);
  console.log(`Warnings: ${result.warnings.length}`);
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
    } else if (arg === "--query") {
      args.query = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--out") {
      args.out = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--limit") {
      args.limit = readOptionValue(argv, index, arg);
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

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 8;
}

function printHelp() {
  console.log(`Usage:
  node scripts/rag/recommend-variant-practice.mjs --corpus <practice_corpus.json> --query <query.json> [--out <dir>] [--limit 8]

Builds ignored local Variant Practice Agent recommendations.
recommendations.json is a local sensitive artifact; do not commit or share it externally.`);
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error.message);
  process.exit(1);
});
