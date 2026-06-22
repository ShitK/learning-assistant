#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  buildPracticeCorpus,
  validateReviewedPracticeSeed,
} from "./practice-corpus-core.mjs";

class CliUsageError extends Error {}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.input) {
    printHelp();
    process.exitCode = 2;
    return;
  }

  const inputPath = resolve(args.input);
  const outputDir = resolve(args.out ?? "artifacts/rag/practice-corpus");
  const inputText = await readInputText(inputPath);
  const parsed = parseSeedJson(inputText);
  const validation = validateReviewedPracticeSeed(parsed);
  if (!validation.ok) {
    throw new Error(`invalid reviewed practice seed: ${validation.errors.join(", ")}`);
  }

  const corpus = buildPracticeCorpus({
    seed: validation.seed,
    sourceSeedFile: formatLocalPath(inputPath),
    generatedAt: new Date().toISOString(),
  });

  await mkdir(outputDir, { recursive: true });
  const outputPath = resolve(outputDir, "practice_corpus.json");
  await writeFile(outputPath, `${JSON.stringify(corpus, null, 2)}\n`);

  console.log(`Wrote ${outputPath}`);
  console.log(`Items: ${corpus.item_count}`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--input") {
      args.input = readOptionValue(argv, index, arg);
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

async function readInputText(inputPath) {
  try {
    return await readFile(inputPath, "utf8");
  } catch {
    throw new CliUsageError(`input file not found: ${inputPath}`);
  }
}

function parseSeedJson(inputText) {
  try {
    return JSON.parse(inputText);
  } catch {
    throw new Error("failed to parse reviewed practice seed JSON");
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
  node scripts/rag/build-practice-corpus.mjs --input <reviewed_practice_seed.json> [--out <dir>]

Builds an ignored local practice corpus fixture from reviewed candidate questions.
practice_corpus.json is a local sensitive artifact; do not commit or share it externally.`);
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error.message);
  process.exit(1);
});
