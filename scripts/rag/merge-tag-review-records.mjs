#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

class CliUsageError extends Error {}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.auto) {
    throw new CliUsageError("--auto requires a value");
  }
  if (!args.human) {
    throw new CliUsageError("--human requires a value");
  }

  const autoPath = resolve(args.auto);
  const humanPath = resolve(args.human);
  const outputDir = resolve(args.out ?? "artifacts/rag/tag-review");
  const autoRecords = await readRecordArray({
    filePath: autoPath,
    missingMessage: "auto tag review records file not found",
    parseMessage: "failed to parse auto tag review records JSON",
    invalidMessage: "invalid auto tag review records",
  });
  const humanRecords = await readRecordArray({
    filePath: humanPath,
    missingMessage: "human tag review records file not found",
    parseMessage: "failed to parse human tag review records JSON",
    invalidMessage: "invalid human tag review records",
  });

  assertNoDuplicateItemIds(autoRecords, "auto records");
  assertNoDuplicateItemIds(humanRecords, "human records");

  const finalRecords = mergeReviewRecords({ autoRecords, humanRecords });
  const summary = summarizeMerge({ autoRecords, humanRecords, finalRecords });

  await mkdir(outputDir, { recursive: true });
  await writeJsonFile(resolve(outputDir, "final_tag_review_records.json"), finalRecords);
  await writeJsonFile(resolve(outputDir, "tag_review_record_merge_summary.json"), summary);

  console.log(`Auto records: ${summary.auto_records}`);
  console.log(`Human records: ${summary.human_records}`);
  console.log(`Final records: ${summary.final_records}`);
  console.log(`Human overrides: ${summary.human_overrides}`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--auto") {
      args.auto = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--human") {
      args.human = readOptionValue(argv, index, arg);
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

async function readRecordArray({ filePath, missingMessage, parseMessage, invalidMessage }) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    throw new CliUsageError(`${missingMessage}: ${filePath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(parseMessage);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${invalidMessage}: expected an array`);
  }
  for (const record of parsed) {
    if (!record || typeof record.item_id !== "string" || !record.item_id.trim()) {
      throw new Error(`${invalidMessage}: every record requires item_id`);
    }
  }
  return parsed;
}

function assertNoDuplicateItemIds(records, label) {
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.item_id)) {
      throw new Error(`duplicate item_id in ${label}: ${record.item_id}`);
    }
    seen.add(record.item_id);
  }
}

function mergeReviewRecords({ autoRecords, humanRecords }) {
  const mergedByItemId = new Map();
  const order = [];
  for (const record of autoRecords) {
    if (!mergedByItemId.has(record.item_id)) {
      order.push(record.item_id);
    }
    mergedByItemId.set(record.item_id, record);
  }
  for (const record of humanRecords) {
    if (!mergedByItemId.has(record.item_id)) {
      order.push(record.item_id);
    }
    mergedByItemId.set(record.item_id, record);
  }
  return order.map((itemId) => mergedByItemId.get(itemId));
}

function summarizeMerge({ autoRecords, humanRecords, finalRecords }) {
  const autoItemIds = new Set(autoRecords.map((record) => record.item_id));
  let humanOverrides = 0;
  let humanOnlyRecords = 0;
  for (const record of humanRecords) {
    if (autoItemIds.has(record.item_id)) {
      humanOverrides += 1;
    } else {
      humanOnlyRecords += 1;
    }
  }
  return {
    auto_records: autoRecords.length,
    human_records: humanRecords.length,
    final_records: finalRecords.length,
    human_overrides: humanOverrides,
    human_only_records: humanOnlyRecords,
  };
}

async function writeJsonFile(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  console.log(`Usage:
  node scripts/rag/merge-tag-review-records.mjs \\
    --auto <auto_tag_review_records.json> \\
    --human <tag_review_records.json> \\
    [--out <dir>]

Merges auto and human tag review records. Human records override auto records by item_id.`);
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(error.message);
    process.exit(2);
  }
  console.error(error.message);
  process.exit(1);
});
