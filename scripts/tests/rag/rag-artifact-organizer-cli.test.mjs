import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpRoot = await mkdtemp(join(tmpdir(), "rag-artifact-organizer-"));
const artifactRoot = join(tmpRoot, "artifacts/rag");
mkdirSync(join(artifactRoot, "MinerU-test"), { recursive: true });
mkdirSync(join(artifactRoot, "candidate-review"), { recursive: true });
mkdirSync(join(artifactRoot, "derivative-pdf-spike"), { recursive: true });
mkdirSync(join(artifactRoot, "practice-corpus"), { recursive: true });
mkdirSync(join(artifactRoot, "enriched-practice-corpus"), { recursive: true });
mkdirSync(join(artifactRoot, "tag-review"), { recursive: true });
mkdirSync(join(artifactRoot, "ai-tag-proposals"), { recursive: true });
mkdirSync(join(artifactRoot, "variant-practice-agent/fonts"), { recursive: true });
writeFileSync(join(artifactRoot, "MinerU-test/source.json"), "{}\n");
writeFileSync(join(artifactRoot, "candidate-review/index.html"), "<!doctype html>\n");
writeFileSync(join(artifactRoot, "derivative-pdf-spike/candidate_questions.json"), "{}\n");
writeFileSync(join(artifactRoot, "practice-corpus/practice_corpus.json"), "{}\n");
writeFileSync(join(artifactRoot, "enriched-practice-corpus/enriched_practice_corpus.json"), "{}\n");
writeFileSync(join(artifactRoot, "enriched-practice-corpus/enrichment_summary.json"), "{}\n");
writeFileSync(join(artifactRoot, "tag-review/auto_tag_review_records.json"), "[]\n");
writeFileSync(join(artifactRoot, "ai-tag-proposals/candidate_ai_tag_proposals.json"), "{}\n");
writeFileSync(join(artifactRoot, "variant-practice-agent/demo-query.json"), "{}\n");
writeFileSync(join(artifactRoot, "variant-practice-agent/recommendations.json"), "{}\n");
writeFileSync(join(artifactRoot, "variant-practice-agent/index.html"), "<!doctype html>\n");
writeFileSync(join(artifactRoot, "variant-practice-agent/variant_practice_manifest.json"), "{}\n");
writeFileSync(join(artifactRoot, "variant-practice-agent/fonts/katex.woff2"), "font");
writeFileSync(join(artifactRoot, ".DS_Store"), "finder");

const dryRun = spawnSync(
  process.execPath,
  ["scripts/rag/organize-rag-artifacts.mjs", "--root", artifactRoot, "--dry-run"],
  { cwd: process.cwd(), encoding: "utf8" },
);

assert.equal(dryRun.status, 0);
assert.match(dryRun.stdout, /DRY RUN/);
assert.match(dryRun.stdout, /Recognized 4 core files/);
assert.match(dryRun.stdout, /archive_directory MinerU-test/);
assert.match(dryRun.stdout, /archive_directory candidate-review/);
assert.match(dryRun.stdout, /archive_directory ai-tag-proposals/);
assert.match(dryRun.stdout, /archive_directory tag-review/);
assert.match(dryRun.stdout, /archive_file variant-practice-agent\/index.html/);
assert.match(dryRun.stdout, /archive_file variant-practice-agent\/variant_practice_manifest.json/);
assert.match(dryRun.stdout, /archive_directory variant-practice-agent\/fonts/);
assert.match(dryRun.stdout, /archive_file enriched-practice-corpus\/enrichment_summary.json/);
assert.match(dryRun.stdout, /remove_file/);
assert.equal(existsSync(join(artifactRoot, "derivative-pdf-spike/candidate_questions.json")), true);
assert.equal(existsSync(join(artifactRoot, ".DS_Store")), true);

const rejectedApply = spawnSync(
  process.execPath,
  ["scripts/rag/organize-rag-artifacts.mjs", "--root", artifactRoot, "--apply"],
  { cwd: process.cwd(), encoding: "utf8" },
);
assert.notEqual(rejectedApply.status, 0);
assert.match(rejectedApply.stderr, /--confirm organize-rag-artifacts/);

const applied = spawnSync(
  process.execPath,
  [
    "scripts/rag/organize-rag-artifacts.mjs",
    "--root",
    artifactRoot,
    "--apply",
    "--confirm",
    "organize-rag-artifacts",
  ],
  { cwd: process.cwd(), encoding: "utf8" },
);

assert.equal(applied.status, 0);
assert.equal(existsSync(join(artifactRoot, "MinerU-test")), false);
assert.equal(existsSync(join(artifactRoot, "candidate-review")), false);
assert.equal(existsSync(join(artifactRoot, "derivative-pdf-spike")), false);
assert.equal(existsSync(join(artifactRoot, "tag-review")), false);
assert.equal(existsSync(join(artifactRoot, "ai-tag-proposals")), false);
assert.equal(existsSync(join(artifactRoot, ".DS_Store")), false);
assert.equal(existsSync(join(artifactRoot, "practice-corpus/practice_corpus.json")), true);
assert.equal(
  existsSync(join(artifactRoot, "enriched-practice-corpus/enriched_practice_corpus.json")),
  true,
);
assert.equal(existsSync(join(artifactRoot, "enriched-practice-corpus/enrichment_summary.json")), false);
assert.equal(existsSync(join(artifactRoot, "variant-practice-agent/demo-query.json")), true);
assert.equal(existsSync(join(artifactRoot, "variant-practice-agent/recommendations.json")), true);
assert.equal(existsSync(join(artifactRoot, "variant-practice-agent/index.html")), false);
assert.equal(existsSync(join(artifactRoot, "variant-practice-agent/variant_practice_manifest.json")), false);
assert.equal(existsSync(join(artifactRoot, "variant-practice-agent/fonts")), false);
assert.equal(existsSync(join(artifactRoot, "_archive/demo-minimal/MinerU-test/source.json")), true);
assert.equal(
  existsSync(join(artifactRoot, "_archive/demo-minimal/candidate-review/index.html")),
  true,
);
assert.equal(
  existsSync(join(artifactRoot, "_archive/demo-minimal/ai-tag-proposals/candidate_ai_tag_proposals.json")),
  true,
);
assert.equal(
  existsSync(join(artifactRoot, "_archive/demo-minimal/tag-review/auto_tag_review_records.json")),
  true,
);
assert.equal(
  existsSync(join(artifactRoot, "_archive/demo-minimal/derivative-pdf-spike/candidate_questions.json")),
  true,
);
assert.equal(
  existsSync(join(artifactRoot, "_archive/demo-minimal/enriched-practice-corpus/enrichment_summary.json")),
  true,
);
assert.equal(
  existsSync(join(artifactRoot, "_archive/demo-minimal/variant-practice-agent/index.html")),
  true,
);
assert.equal(
  existsSync(
    join(artifactRoot, "_archive/demo-minimal/variant-practice-agent/variant_practice_manifest.json"),
  ),
  true,
);
assert.equal(
  existsSync(join(artifactRoot, "_archive/demo-minimal/variant-practice-agent/fonts/katex.woff2")),
  true,
);
const archiveReadme = readFileSync(join(artifactRoot, "_archive/demo-minimal/README.md"), "utf8");
assert.match(archiveReadme, /demo-minimal/);
assert.match(archiveReadme, /keeps only core corpus and recommendation artifacts/);
assert.match(archiveReadme, /archived_at:/);

const postAudit = spawnSync(
  process.execPath,
  ["scripts/rag/audit-rag-artifacts.mjs", "--root", artifactRoot],
  { cwd: process.cwd(), encoding: "utf8" },
);
assert.equal(postAudit.status, 0);
assert.match(postAudit.stdout, /Unknown: 0/);

const missingRoot = spawnSync(
  process.execPath,
  ["scripts/rag/organize-rag-artifacts.mjs", "--root", join(tmpRoot, "missing"), "--dry-run"],
  { cwd: process.cwd(), encoding: "utf8" },
);
assert.equal(missingRoot.status, 0);
assert.match(missingRoot.stdout, /Recognized 0 core files/);

await rm(tmpRoot, { recursive: true, force: true });

console.log("rag artifact organizer cli tests passed");
