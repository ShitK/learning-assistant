#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { buildRagArtifactInventory } from "./rag-artifact-inventory-core.mjs";

const artifactRoot = getArgValue("--root") ?? "artifacts/rag";
const outputPath =
  getArgValue("--out") ?? join(artifactRoot, "_manifest/rag_artifact_inventory.json");

const files = await listFiles(artifactRoot);
const relativeFiles = files.map((filePath) => relative(artifactRoot, filePath));
const inventory = buildRagArtifactInventory(relativeFiles);

await mkdir(join(artifactRoot, "_manifest"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);

console.log(`Inventory items: ${inventory.item_count}`);
console.log(`Keep: ${inventory.summary.keep ?? 0}`);
console.log(`Archive candidates: ${inventory.summary.archive_candidate ?? 0}`);
console.log(`Remove candidates: ${inventory.summary.remove_candidate ?? 0}`);
console.log(`Unknown: ${inventory.summary.unknown ?? 0}`);
console.log(`Wrote ${outputPath}`);

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
