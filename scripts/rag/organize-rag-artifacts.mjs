#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  classifyRagArtifactPath,
  CORE_RAG_ARTIFACT_PATHS,
  DEMO_MINIMAL_ARCHIVE_ENTRY_PATHS,
} from "./rag-artifact-inventory-core.mjs";

const artifactRoot = getArgValue("--root") ?? "artifacts/rag";
const isApply = process.argv.includes("--apply");
const isDryRun = process.argv.includes("--dry-run") || !isApply;
const confirmValue = getArgValue("--confirm");
const coreArtifactPaths = new Set(CORE_RAG_ARTIFACT_PATHS);

if (isApply && confirmValue !== "organize-rag-artifacts") {
  console.error("Mutating cleanup requires --confirm organize-rag-artifacts");
  process.exit(1);
}

const files = await listFiles(artifactRoot);
const relativeFiles = files.map((filePath) => relative(artifactRoot, filePath));
const removableFiles = relativeFiles.filter(
  (filePath) => classifyRagArtifactPath(filePath).action === "remove_file",
);
const coreFileCount = relativeFiles.filter((filePath) => coreArtifactPaths.has(filePath)).length;
const archiveEntries = DEMO_MINIMAL_ARCHIVE_ENTRY_PATHS.filter((entryPath) =>
  existsSync(join(artifactRoot, entryPath)),
);

const archiveRoot = join(artifactRoot, "_archive/demo-minimal");
const archivedAt = new Date().toISOString();

console.log(isDryRun ? "DRY RUN: no files will be changed." : "APPLY: organizing local artifacts.");
console.log(
  `Recognized ${coreFileCount} core files; no changes to reviewed seed, practice corpus, enriched corpus, demo query, or product recommendations.`,
);

for (const filePath of removableFiles) {
  console.log(`remove_file ${filePath}`);
  if (isApply) {
    await rm(join(artifactRoot, filePath), { force: true });
  }
}

if (archiveEntries.length > 0 && isApply) {
  await mkdir(archiveRoot, { recursive: true });
  await writeArchiveReadme(archiveRoot, archivedAt);
}

for (const entryPath of archiveEntries) {
  const sourcePath = join(artifactRoot, entryPath);
  const destinationPath = join(archiveRoot, entryPath);
  const action = files.some((filePath) => filePath === sourcePath) ? "archive_file" : "archive_directory";
  console.log(`${action} ${entryPath} -> _archive/demo-minimal/${entryPath}`);
  if (isApply) {
    await mkdir(dirname(destinationPath), { recursive: true });
    await rm(destinationPath, { recursive: true, force: true });
    await rename(sourcePath, destinationPath);
  }
}

async function listFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
      continue;
    }
    files.push(fullPath);
  }

  return files.sort();
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function writeArchiveReadme(root, archivedAtValue) {
  await writeFile(
    join(root, "README.md"),
    [
      "# Archived demo-minimal RAG artifacts",
      "",
      `archived_at: ${archivedAtValue}`,
      "",
      "This archive keeps intermediate P2 RAG artifacts that are not needed for the current demo.",
      "The demo-minimal cleanup keeps only core corpus and recommendation artifacts in active paths.",
      "",
      "Active paths kept in place:",
      "- artifacts/rag/reviewed_practice_seed.json",
      "- artifacts/rag/practice-corpus/practice_corpus.json",
      "- artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json",
      "- artifacts/rag/variant-practice-agent/demo-query.json",
      "- artifacts/rag/variant-practice-agent/recommendations.json",
      "",
      "Move files back manually from this archive if a future rebuild needs the original intermediate outputs.",
      "",
    ].join("\n"),
  );
}
