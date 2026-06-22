#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { validatePracticeCorpus } from "./practice-corpus-search-core.mjs";
import { validateTagProposalArtifact } from "./practice-tag-proposal-core.mjs";
import {
  buildEnrichedPracticeCorpus,
  summarizeEnrichedPracticeCorpus,
  validateEnrichedPracticeCorpus,
} from "./enriched-practice-corpus-core.mjs";

class CliUsageError extends Error {}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.corpus) throw new CliUsageError("--corpus requires a value");
  if (!args.proposals) throw new CliUsageError("--proposals requires a value");

  const corpusPath = resolve(args.corpus);
  const proposalPath = resolve(args.proposals);
  const outputDir = resolve(args.out ?? "artifacts/rag/enriched-practice-corpus");

  const corpusJson = await readJsonFile({
    filePath: corpusPath,
    missingMessage: "practice corpus file not found",
    parseMessage: "failed to parse practice corpus JSON",
  });
  const corpusValidation = validatePracticeCorpus(corpusJson);
  if (!corpusValidation.ok) throw new Error(`invalid practice corpus: ${corpusValidation.errors.join(", ")}`);

  const proposalJson = await readJsonFile({
    filePath: proposalPath,
    missingMessage: "tag proposal file not found",
    parseMessage: "failed to parse tag proposal JSON",
  });
  const proposalValidation = validateTagProposalArtifact(proposalJson);
  if (!proposalValidation.ok) throw new Error(`invalid tag proposal artifact: ${proposalValidation.errors.join(", ")}`);

  const reviewRecords = args.review
    ? await readJsonFile({
        filePath: resolve(args.review),
        missingMessage: "tag review file not found",
        parseMessage: "failed to parse tag review JSON",
      })
    : [];
  if (!Array.isArray(reviewRecords)) throw new Error("tag review JSON must be an array");

  const enriched = buildEnrichedPracticeCorpus({
    corpus: corpusValidation.corpus,
    proposalArtifact: proposalValidation.proposalArtifact,
    reviewRecords,
    acceptRuleProposals: Boolean(args.acceptRuleProposals),
    sourceCorpusFile: formatLocalPath(corpusPath),
    sourceTagProposalFile: formatLocalPath(proposalPath),
    generatedAt: new Date().toISOString(),
  });
  const enrichedValidation = validateEnrichedPracticeCorpus(enriched);
  if (!enrichedValidation.ok) throw new Error(`invalid enriched practice corpus: ${enrichedValidation.errors.join(", ")}`);

  const summary = summarizeEnrichedPracticeCorpus(enriched);
  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, "enriched_practice_corpus.json");
  const summaryPath = resolve(outputDir, "enrichment_summary.json");
  await writeFile(outputPath, `${JSON.stringify(enriched, null, 2)}\n`);
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  console.log(`Wrote ${outputPath}`);
  console.log(`Wrote ${summaryPath}`);
  console.log(`Items: ${summary.item_count}`);
  console.log(`Approved: ${summary.approved_items}`);
  console.log(`Proposed: ${summary.proposed_items}`);
  console.log(`Needs fix: ${summary.needs_fix_items}`);
  console.log(`Needs visual: ${summary.needs_visual_items}`);
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
    } else if (arg === "--proposals") {
      args.proposals = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--review") {
      args.review = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--accept-rule-proposals") {
      args.acceptRuleProposals = true;
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
  node scripts/rag/build-enriched-practice-corpus.mjs --corpus <practice_corpus.json> --proposals <candidate_tag_proposals.json> [--review <review.json>] [--accept-rule-proposals] [--out <dir>]

Builds enriched local practice corpus artifacts from a practice corpus and tag proposals.
enriched_practice_corpus.json is a local sensitive artifact; do not commit or share it externally.`);
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error.message);
  process.exit(1);
});
