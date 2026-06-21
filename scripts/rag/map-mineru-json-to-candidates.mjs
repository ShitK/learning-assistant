#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildCandidateQuestions,
  renderCandidateMapperReport,
} from "./mineru-json-candidate-mapper-core.mjs";

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
  const sourceFile = args.sourceFile ? resolve(args.sourceFile) : inputPath;
  const outputDir = resolve(args.out ?? "artifacts/rag/mineru-candidate-mapper");
  const inputText = await readInputText(inputPath);
  const mineruJson = parseMineruJson(inputText);
  const warnings = args.sourceFile ? [] : ["source_file_unknown"];
  const sourceFileSha256 = args.sourceFile
    ? await readSourceFileSha256(sourceFile, warnings)
    : "";
  const extraction = buildCandidateQuestions({
    mineruJson,
    sourceFile,
    sourceFileSha256,
    mineruJsonFile: inputPath,
    mineruJsonSha256: createHash("sha256").update(inputText).digest("hex"),
    extractedAt: new Date().toISOString(),
    warnings,
  });

  await mkdir(outputDir, { recursive: true });
  const candidatePath = resolve(outputDir, "candidate_questions.json");
  const reportPath = resolve(outputDir, "extraction_report.md");
  await writeFile(candidatePath, `${JSON.stringify(extraction, null, 2)}\n`);
  await writeFile(reportPath, `${renderCandidateMapperReport(extraction)}\n`);

  console.log(`Wrote ${candidatePath}`);
  console.log(`Wrote ${reportPath}`);
  console.log(`Candidates: ${extraction.candidates.length}`);
  console.log(formatWarningsSummary(extraction.warnings));
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
    } else if (arg === "--source-file") {
      args.sourceFile = readOptionValue(argv, index, arg);
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

async function readSourceFileSha256(sourceFile, warnings) {
  try {
    const sourceBytes = await readFile(sourceFile);
    return createHash("sha256").update(sourceBytes).digest("hex");
  } catch {
    warnings.push("source_file_sha256_unavailable");
    return "";
  }
}

function parseMineruJson(inputText) {
  try {
    return JSON.parse(inputText);
  } catch {
    throw new Error("failed to parse MinerU JSON");
  }
}

function formatWarningsSummary(warnings) {
  if (warnings.length === 0) {
    return "Warnings: 0";
  }
  return `Warnings: ${warnings.length} (${warnings.join(", ")})`;
}

function printHelp() {
  console.log(`Usage:
  node scripts/rag/map-mineru-json-to-candidates.mjs --input <mineru-json> [--source-file <pdf>] [--out <dir>]

Converts local MinerU precise JSON into ignored candidate_questions.json artifacts.`);
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error.message);
  process.exit(1);
});
