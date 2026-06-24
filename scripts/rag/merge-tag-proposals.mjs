#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  buildMergedTagProposals,
  summarizeMergedTagProposals,
  validateMergedTagProposals,
} from "./tag-proposal-merge-core.mjs";
import { validateAiTagProposalArtifact } from "./ai-tag-proposal-core.mjs";
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
  if (!args.ai) {
    throw new CliUsageError("--ai requires a value");
  }

  const taxonomy = getPracticeTagTaxonomy(args.taxonomy);
  if (!taxonomy) {
    throw new CliUsageError("unsupported taxonomy");
  }

  const corpusPath = resolve(args.corpus);
  const rulesPath = resolve(args.rules);
  const aiPath = resolve(args.ai);
  const outputDir = resolve(args.out ?? "artifacts/rag/tag-review");

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

  const aiJson = await readJsonFile({
    filePath: aiPath,
    missingMessage: "AI tag proposal file not found",
    parseMessage: "failed to parse AI tag proposal JSON",
  });
  const aiValidation = validateAiTagProposalArtifact(aiJson, taxonomy);
  if (!aiValidation.ok) {
    throw new Error(`invalid AI tag proposal artifact: ${aiValidation.errors.join(", ")}`);
  }

  const merged = buildMergedTagProposals({
    corpus: corpusValidation.corpus,
    ruleProposalArtifact: rulesValidation.proposalArtifact,
    aiProposalArtifact: aiValidation.proposalArtifact,
    taxonomy,
    generatedAt: new Date().toISOString(),
  });
  const validation = validateMergedTagProposals(merged, taxonomy);
  if (!validation.ok) {
    throw new Error(`invalid merged tag proposals: ${validation.errors.join(", ")}`);
  }

  const summary = summarizeMergedTagProposals(merged);
  await mkdir(outputDir, { recursive: true });
  const mergedPath = resolve(outputDir, "merged_tag_proposals.json");
  const autoRecordsPath = resolve(outputDir, "auto_tag_review_records.json");
  const queuePath = resolve(outputDir, "tag_review_queue.json");
  const summaryPath = resolve(outputDir, "tag_review_summary.json");
  await writeJsonFile(mergedPath, merged);
  await writeJsonFile(autoRecordsPath, merged.auto_review_records);
  await writeJsonFile(queuePath, merged.review_queue);
  await writeJsonFile(summaryPath, summary);

  printSummary({
    paths: { mergedPath, autoRecordsPath, queuePath, summaryPath },
    summary,
  });
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
    } else if (arg === "--ai") {
      args.ai = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--taxonomy") {
      args.taxonomy = readOptionValue(argv, index, arg);
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

async function writeJsonFile(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function printSummary({ paths, summary }) {
  console.log(`Wrote ${formatLocalPath(paths.mergedPath)}`);
  console.log(`Wrote ${formatLocalPath(paths.autoRecordsPath)}`);
  console.log(`Wrote ${formatLocalPath(paths.queuePath)}`);
  console.log(`Wrote ${formatLocalPath(paths.summaryPath)}`);
  console.log(`Items: ${summary.item_count}`);
  console.log(`Auto approved: ${summary.auto_approved_items}`);
  console.log(`Needs review: ${summary.needs_review_items}`);
  console.log(`Needs visual: ${summary.needs_visual_items}`);
  console.log(`Conflict items: ${summary.conflict_items}`);
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
  node scripts/rag/merge-tag-proposals.mjs \\
    --corpus <practice_corpus.json> \\
    --rules <candidate_tag_proposals.json> \\
    --ai <candidate_ai_tag_proposals.json> \\
    [--out <dir>]

Merges rule and AI tag proposal artifacts into auto-review records and review queue artifacts.`);
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error.message);
  process.exit(1);
});
