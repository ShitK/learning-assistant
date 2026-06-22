#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { validatePracticeCorpus } from "./practice-corpus-search-core.mjs";
import { buildTagProposals, summarizeTagProposals } from "./practice-tag-proposal-core.mjs";

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

  const corpusPath = resolve(args.corpus);
  const outputDir = resolve(args.out ?? "artifacts/rag/tag-proposals");
  const corpusJson = await readJsonFile({
    filePath: corpusPath,
    missingMessage: "practice corpus file not found",
    parseMessage: "failed to parse practice corpus JSON",
  });
  const validation = validatePracticeCorpus(corpusJson);
  if (!validation.ok) {
    throw new Error(`invalid practice corpus: ${validation.errors.join(", ")}`);
  }

  const proposalArtifact = buildTagProposals({
    corpus: validation.corpus,
    sourceCorpusFile: formatLocalPath(corpusPath),
    generatedAt: new Date().toISOString(),
  });
  const summary = summarizeTagProposals(proposalArtifact);

  await mkdir(outputDir, { recursive: true });
  const proposalPath = resolve(outputDir, "candidate_tag_proposals.json");
  const summaryPath = resolve(outputDir, "tag_proposal_summary.json");
  await writeFile(proposalPath, `${JSON.stringify(proposalArtifact, null, 2)}\n`);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`Wrote ${proposalPath}`);
  console.log(`Wrote ${summaryPath}`);
  console.log(`Items: ${summary.item_count}`);
  console.log(`High confidence: ${summary.high_confidence_items}`);
  console.log(`Needs visual: ${summary.needs_visual_items}`);
  console.log(`Warnings: ${Object.values(summary.warning_distribution).reduce((sum, count) => sum + count, 0)}`);
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
    } else if (arg === "--out") {
      args.out = readOptionValue(argv, index, arg);
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

function formatLocalPath(filePath) {
  const relativePath = relative(process.cwd(), filePath);
  if (relativePath && !relativePath.startsWith("..")) {
    return relativePath;
  }
  return filePath;
}

function printHelp() {
  console.log(`Usage:
  node scripts/rag/build-practice-tag-proposals.mjs --corpus <practice_corpus.json> [--out <dir>]

Builds ignored local tag proposal artifacts from a practice corpus.
candidate_tag_proposals.json is a local sensitive artifact; do not commit or share it externally.`);
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error.message);
  process.exit(1);
});
