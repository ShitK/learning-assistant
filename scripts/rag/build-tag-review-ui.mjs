#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import { getPracticeTagTaxonomy } from "./practice-tag-taxonomy.mjs";
import {
  buildTagReviewAppData,
  buildTagReviewManifest,
  renderTagReviewHtml,
  validateTagReviewQueue,
} from "./tag-review-ui-core.mjs";

class CliUsageError extends Error {}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.queue) {
    printHelp();
    process.exitCode = 2;
    return;
  }

  const queuePath = resolve(args.queue);
  const outputDir = resolve(args.out ?? "artifacts/rag/tag-review");
  const queueText = await readQueueText(queuePath);
  const katexCss = await readKatexCss();
  const katexJs = await readKatexJs();
  const parsed = parseQueueJson(queueText);
  const taxonomyId = inferQueueTaxonomyId(parsed);
  const taxonomy = getPracticeTagTaxonomy(taxonomyId);
  if (!taxonomy) {
    throw new Error(`unknown taxonomy_id: ${taxonomyId ?? "missing"}`);
  }
  const validation = validateTagReviewQueue(parsed, taxonomy);
  if (!validation.ok) {
    throw new Error(`invalid tag review queue: ${validation.errors.join(", ")}`);
  }

  const appData = buildTagReviewAppData({
    queue: validation.queue,
    taxonomy,
    queueSourceFile: formatLocalPath(queuePath),
    queueSourceSha256: createHash("sha256").update(queueText).digest("hex"),
    generatedAt: new Date().toISOString(),
  });

  await mkdir(outputDir, { recursive: true });
  const htmlPath = resolve(outputDir, "index.html");
  const manifestPath = resolve(outputDir, "tag_review_manifest.json");
  await copyKatexFonts(outputDir);
  await writeFile(htmlPath, renderTagReviewHtml(appData, { katexCss, katexJs }));
  await writeFile(
    manifestPath,
    `${JSON.stringify(buildTagReviewManifest(appData), null, 2)}\n`,
  );

  console.log(`Wrote ${htmlPath}`);
  console.log(`Wrote ${manifestPath}`);
  console.log(`Items: ${appData.items.length}`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--queue") {
      args.queue = readOptionValue(argv, index, arg);
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

async function readQueueText(queuePath) {
  try {
    return await readFile(queuePath, "utf8");
  } catch {
    throw new CliUsageError(`queue file not found: ${queuePath}`);
  }
}

function parseQueueJson(queueText) {
  try {
    return JSON.parse(queueText);
  } catch {
    throw new Error("failed to parse tag review queue JSON");
  }
}

function inferQueueTaxonomyId(value) {
  if (Array.isArray(value)) {
    const item = value.find((entry) => typeof entry?.taxonomy_id === "string" && entry.taxonomy_id.trim());
    return item?.taxonomy_id;
  }
  return value?.taxonomy_id;
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
    await cp(
      resolve("node_modules/katex/dist/fonts"),
      resolve(outputDir, "fonts"),
      { recursive: true },
    );
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
  node scripts/rag/build-tag-review-ui.mjs --queue <tag_review_queue.json> [--out <dir>]

Builds an ignored local static review UI for tag review queue records.`);
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error.message);
  process.exit(1);
});
