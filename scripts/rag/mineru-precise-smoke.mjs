#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildMineruBatchPayload,
  readMineruToken,
  renderMineruSmokeReport,
  summarizeMineruBatchResult,
} from "./mineru-precise-smoke-core.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_ENDPOINT = "https://mineru.net/api/v4/file-urls/batch";
const DEFAULT_OUT_DIR = "artifacts/rag/mineru-derivative-smoke";
const DEFAULT_PAGE_RANGES = "1-2";
const DEFAULT_MODEL_VERSION = "vlm";
const DEFAULT_LANGUAGE = "ch";
const COMMAND_TIMEOUT_MS = 60_000;

class CliUsageError extends Error {}

async function main() {
  loadDotEnvLocal();

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

  const tokenResult = readMineruToken(process.env);
  if (!tokenResult.ok) {
    throw new CliUsageError(tokenResult.error);
  }

  const inputPath = resolve(args.input);
  await assertFileExists(inputPath);

  const outDir = resolve(args.out ?? DEFAULT_OUT_DIR);
  const rawDir = join(outDir, "raw");
  await mkdir(rawDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const pageRanges = args.pageRanges ?? DEFAULT_PAGE_RANGES;
  const modelVersion = args.modelVersion ?? DEFAULT_MODEL_VERSION;
  const language = args.language ?? DEFAULT_LANGUAGE;
  const fileName = basename(inputPath);
  const warnings = [];

  const payload = buildMineruBatchPayload({
    fileName,
    pageRanges,
    modelVersion,
    language,
    isOcr: true,
    enableFormula: true,
    enableTable: true,
  });

  await writeFile(
    join(outDir, "request_payload.redacted.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
  );

  const uploadPlan = await requestUploadUrl({
    endpoint: args.endpoint ?? DEFAULT_ENDPOINT,
    token: tokenResult.token,
    payload,
  });
  const uploadTarget = uploadPlan?.data?.file_urls?.[0];
  const batchId = uploadPlan?.data?.batch_id;

  if (!uploadTarget || !batchId) {
    throw new Error("MinerU did not return batch_id and file upload URL.");
  }

  await uploadFileToMineru({ uploadUrl: uploadTarget, inputPath });

  const batchResult = await pollBatchResult({
    token: tokenResult.token,
    batchId,
    pollIntervalMs: args.pollIntervalMs ?? 5000,
    maxPolls: args.maxPolls ?? 60,
  });

  await writeFile(
    join(outDir, "mineru_batch_result.json"),
    `${JSON.stringify(batchResult.raw, null, 2)}\n`,
  );

  let downloadedZipPath = null;
  if (batchResult.extractedZipUrl) {
    downloadedZipPath = join(outDir, "mineru-result.zip");
    await downloadFile(batchResult.extractedZipUrl, downloadedZipPath);
    extractZip(downloadedZipPath, rawDir, warnings);
  } else {
    warnings.push("mineru_result_zip_unavailable");
  }

  const extractedFiles = listFilesWithFind(rawDir).map(relativeFromProject);
  const finishedAt = new Date().toISOString();
  await writeFile(
    join(outDir, "mineru_smoke_report.md"),
    `${renderMineruSmokeReport({
      inputFile: inputPath,
      pageRanges,
      modelVersion,
      language,
      startedAt,
      finishedAt,
      state: batchResult.state,
      outputDir: relativeFromProject(outDir),
      downloadedZipPath: downloadedZipPath
        ? relativeFromProject(downloadedZipPath)
        : null,
      extractedFiles,
      warnings,
    })}\n`,
  );

  console.log(`Wrote ${join(outDir, "mineru_smoke_report.md")}`);
  console.log(`State: ${batchResult.state}`);
  console.log(`Batch: ${batchId}`);
  if (warnings.length > 0) {
    console.log(`Warnings: ${[...new Set(warnings)].join(", ")}`);
  }
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
    } else if (arg === "--page-ranges") {
      args.pageRanges = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--model-version") {
      args.modelVersion = parseModelVersion(readOptionValue(argv, index, arg));
      index += 1;
    } else if (arg === "--language") {
      args.language = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--endpoint") {
      args.endpoint = readOptionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--poll-interval-ms") {
      args.pollIntervalMs = parsePositiveInteger(
        readOptionValue(argv, index, arg),
        "--poll-interval-ms",
      );
      index += 1;
    } else if (arg === "--max-polls") {
      args.maxPolls = parsePositiveInteger(
        readOptionValue(argv, index, arg),
        "--max-polls",
      );
      index += 1;
    } else {
      throw new CliUsageError(`Unknown argument: ${arg}`);
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

function parsePositiveInteger(value, optionName) {
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new CliUsageError(`${optionName} must be an integer >= 1`);
  }
  return parsedValue;
}

function parseModelVersion(value) {
  if (!["pipeline", "vlm"].includes(value)) {
    throw new CliUsageError("--model-version must be pipeline or vlm");
  }
  return value;
}

function printHelp() {
  console.log(`Usage:
  node scripts/rag/mineru-precise-smoke.mjs --input <pdf> [--out <dir>] [--page-ranges 1-2] [--model-version vlm]

This local-only smoke calls MinerU precise parsing and writes ignored artifacts.
MINERU_API_TOKEN must be configured in .env.local or process env.`);
}

function loadDotEnvLocal() {
  const envPath = resolve(".env.local");
  try {
    const text = readFileSyncUtf8(envPath);
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }
      const key = trimmed.slice(0, separatorIndex);
      const value = trimmed.slice(separatorIndex + 1);
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env.local is optional; readMineruToken reports the actionable error.
  }
}

function readFileSyncUtf8(filePath) {
  return spawnSync("cat", [filePath], {
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
  }).stdout;
}

async function assertFileExists(filePath) {
  try {
    await access(filePath);
  } catch {
    throw new CliUsageError(`input file not found: ${filePath}`);
  }
}

async function requestUploadUrl({ endpoint, token, payload }) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  return readJsonResponse(response, "request_upload_url");
}

async function uploadFileToMineru({ uploadUrl, inputPath }) {
  const bytes = await readFile(inputPath);
  const response = await fetch(uploadUrl, {
    method: "PUT",
    body: bytes,
  });
  if (!response.ok) {
    throw new Error(`upload_file_failed: HTTP ${response.status}`);
  }
}

async function pollBatchResult({ token, batchId, pollIntervalMs, maxPolls }) {
  const endpoint = `https://mineru.net/api/v4/extract-results/batch/${batchId}`;
  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const raw = await readJsonResponse(response, "poll_batch_result");
    const summary = summarizeMineruBatchResult(raw);
    if (summary.state === "done" || summary.state === "failed") {
      return summary;
    }
    await sleep(pollIntervalMs);
  }
  throw new Error(`mineru_poll_timeout: batch ${batchId}`);
}

async function readJsonResponse(response, stage) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${stage}: HTTP ${response.status}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${stage}: invalid_json`);
  }
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download_result_zip_failed: HTTP ${response.status}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, bytes);
}

export function extractZip(zipPath, outputDir, warnings) {
  const zipEntries = listZipEntries(zipPath, warnings);
  if (!zipEntries) {
    return;
  }

  if (zipEntries.some(isUnsafeZipEntry)) {
    warnings.push("result_zip_unsafe_entry");
    return;
  }

  const unzip = spawnSync("unzip", ["-o", zipPath, "-d", outputDir], {
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (unzip.status === 0) {
    return;
  }

  const ditto = spawnSync("ditto", ["-x", "-k", zipPath, outputDir], {
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (ditto.status !== 0) {
    warnings.push("result_zip_extract_failed");
  }
}

function listZipEntries(zipPath, warnings) {
  const result = spawnSync("unzip", ["-Z", "-1", zipPath], {
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    warnings.push("result_zip_extract_failed");
    return null;
  }

  const stdout = result.stdout.replace(/\r?\n$/, "");
  return stdout.length > 0 ? stdout.split(/\r?\n/) : [];
}

function isUnsafeZipEntry(entry) {
  if (entry.length === 0) {
    return true;
  }

  const normalizedEntry = entry.replaceAll("\\", "/");
  if (normalizedEntry.endsWith("/")) {
    return false;
  }

  return (
    normalizedEntry.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalizedEntry) ||
    normalizedEntry.split("/").includes("..")
  );
}

function listFilesWithFind(dir) {
  const result = spawnSync("find", [dir, "-type", "f"], {
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout.split("\n").filter(Boolean).sort();
}

function relativeFromProject(filePath) {
  const absolute = resolve(filePath);
  return absolute.startsWith(projectRoot)
    ? absolute.slice(projectRoot.length + 1)
    : absolute;
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

function isMainModule() {
  const invokedPath = process.argv[1];
  return invokedPath
    ? import.meta.url === pathToFileURL(resolve(invokedPath)).href
    : false;
}

if (isMainModule()) {
  main().catch((error) => {
    if (error instanceof CliUsageError) {
      console.error(`Error: ${error.message}`);
      process.exitCode = 2;
      return;
    }

    console.error(error.message);
    process.exitCode = 1;
  });
}
