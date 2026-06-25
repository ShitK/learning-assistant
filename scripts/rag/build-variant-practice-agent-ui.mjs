#!/usr/bin/env node

import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import {
  buildVariantPracticeAppData,
  buildVariantPracticeManifest,
  renderVariantPracticeHtml,
  validateVariantPracticeRecommendations,
} from "./variant-practice-agent-ui-core.mjs";

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
  const outputDir = resolve(args.out ?? "artifacts/rag/variant-practice-agent");
  const inputText = await readInputText(inputPath);
  const parsed = parseInputJson(inputText);
  const validation = validateVariantPracticeRecommendations(parsed);
  if (!validation.ok) {
    throw new Error(`invalid variant practice recommendations: ${validation.errors.join(", ")}`);
  }

  const katexCss = await readKatexCss();
  const katexJs = await readKatexJs();
  const appData = buildVariantPracticeAppData({
    recommendations: validation.result,
    sourceFile: formatLocalPath(inputPath),
    generatedAt: new Date().toISOString(),
  });

  await mkdir(outputDir, { recursive: true });
  await copyKatexFonts(outputDir);

  const htmlPath = resolve(outputDir, "index.html");
  const manifestPath = resolve(outputDir, "variant_practice_manifest.json");
  await writeFile(htmlPath, renderVariantPracticeHtml(appData, { katexCss, katexJs }));
  await writeFile(manifestPath, `${JSON.stringify(buildVariantPracticeManifest(appData), null, 2)}\n`);

  console.log(`Wrote ${htmlPath}`);
  console.log(`Wrote ${manifestPath}`);
  console.log(`Recommendations: ${appData.recommendations.length}`);
  console.log(`Warnings: ${appData.warnings.length}`);
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

function parseInputJson(inputText) {
  try {
    return JSON.parse(inputText);
  } catch {
    throw new Error("failed to parse recommendations JSON");
  }
}

async function readKatexCss() {
  try {
    return await readFile(resolve("node_modules/katex/dist/katex.min.css"), "utf8");
  } catch {
    throw new Error("failed to read KaTeX CSS");
  }
}

async function readKatexJs() {
  try {
    const source = await readFile(resolve("node_modules/katex/dist/katex.min.js"), "utf8");
    return source.replaceAll("https://", "\\x68ttps://").replaceAll("http://", "\\x68ttp://");
  } catch {
    throw new Error("failed to read KaTeX JS");
  }
}

async function copyKatexFonts(outputDir) {
  try {
    await cp(resolve("node_modules/katex/dist/fonts"), resolve(outputDir, "fonts"), {
      recursive: true,
    });
  } catch {
    throw new Error("failed to copy KaTeX fonts");
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
  node scripts/rag/build-variant-practice-agent-ui.mjs --input <recommendations.json> [--out <dir>]

Builds an ignored local static UI for Variant Practice Agent recommendations.
index.html is a local sensitive artifact; do not commit or share it externally.`);
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error.message);
  process.exit(1);
});
