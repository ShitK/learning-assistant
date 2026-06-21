#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  buildReviewAppData,
  buildReviewManifest,
  renderCandidateReviewHtml,
  validateCandidateExtraction,
} from "./candidate-review-ui-core.mjs";

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
  const outputDir = resolve(args.out ?? "artifacts/rag/candidate-review");
  const inputText = await readInputText(inputPath);
  const katexCss = await readKatexCss();
  const parsed = parseCandidateJson(inputText);
  const validation = validateCandidateExtraction(parsed);
  if (!validation.ok) {
    throw new Error(`invalid candidate extraction: ${validation.errors.join(", ")}`);
  }

  const appData = buildReviewAppData({
    extraction: validation.extraction,
    candidateSourceFile: formatLocalPath(inputPath),
    candidateSourceSha256: createHash("sha256").update(inputText).digest("hex"),
    generatedAt: new Date().toISOString(),
  });

  await mkdir(outputDir, { recursive: true });
  const htmlPath = resolve(outputDir, "index.html");
  const manifestPath = resolve(outputDir, "review_manifest.json");
  await writeFile(htmlPath, renderCandidateReviewHtml(appData, { katexCss }));
  await writeFile(
    manifestPath,
    `${JSON.stringify(buildReviewManifest(appData), null, 2)}\n`,
  );

  console.log(`Wrote ${htmlPath}`);
  console.log(`Wrote ${manifestPath}`);
  console.log(`Candidates: ${appData.candidates.length}`);
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

function parseCandidateJson(inputText) {
  try {
    return JSON.parse(inputText);
  } catch {
    throw new Error("failed to parse candidate questions JSON");
  }
}

async function readKatexCss() {
  try {
    return await readFile(resolve("node_modules/katex/dist/katex.min.css"), "utf8");
  } catch {
    throw new Error("failed to read KaTeX CSS");
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
  node scripts/rag/build-candidate-review-ui.mjs --input <candidate_questions.json> [--out <dir>]

Builds an ignored local static review UI for candidate questions.`);
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error.message);
  process.exit(1);
});
