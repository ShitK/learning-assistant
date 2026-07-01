import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const suites = {
  default: [
    "scripts/tests/architecture/architecture-boundaries.test.mjs",
    "scripts/tests/rag/derivative-pdf-ocr-core.test.mjs",
    "scripts/tests/rag/ocr-derivative-pdf-cli.test.mjs",
    "scripts/tests/rag/mineru-precise-smoke-core.test.mjs",
    "scripts/tests/rag/mineru-precise-smoke-cli.test.mjs",
    "scripts/tests/rag/mineru-json-candidate-mapper-core.test.mjs",
    "scripts/tests/rag/mineru-json-candidate-mapper-cli.test.mjs",
    "scripts/tests/rag/candidate-review-ui-core.test.mjs",
    "scripts/tests/rag/candidate-review-ui-cli.test.mjs",
    "scripts/tests/rag/practice-corpus-core.test.mjs",
    "scripts/tests/rag/practice-corpus-cli.test.mjs",
    "scripts/tests/rag/practice-corpus-search-core.test.mjs",
    "scripts/tests/rag/practice-tag-taxonomy.test.mjs",
    "scripts/tests/rag/practice-tag-proposal-core.test.mjs",
    "scripts/tests/rag/practice-tag-proposal-cli.test.mjs",
    "scripts/tests/rag/ai-tag-proposal-core.test.mjs",
    "scripts/tests/rag/ai-tag-proposal-cli.test.mjs",
    "scripts/tests/rag/tag-proposal-merge-core.test.mjs",
    "scripts/tests/rag/tag-proposal-merge-cli.test.mjs",
    "scripts/tests/rag/tag-review-ui-core.test.mjs",
    "scripts/tests/rag/tag-review-ui-cli.test.mjs",
    "scripts/tests/rag/tag-review-record-merge-cli.test.mjs",
    "scripts/tests/rag/enriched-practice-corpus-core.test.mjs",
    "scripts/tests/rag/enriched-practice-corpus-cli.test.mjs",
    "scripts/tests/rag/variant-practice-agent-core.test.mjs",
    "scripts/tests/rag/variant-practice-agent-cli.test.mjs",
    "scripts/tests/rag/variant-practice-agent-ui-core.test.mjs",
    "scripts/tests/rag/variant-practice-agent-ui-cli.test.mjs",
    "scripts/tests/rag/variant-practice-product-view-model.test.mjs",
    "scripts/tests/rag/variant-practice-product-loader.test.mjs",
    "scripts/tests/rag/variant-practice-eval-cases.test.mjs",
    "scripts/tests/rag/variant-practice-eval-report-schema.test.mjs",
    "scripts/tests/rag/dynamic-variant-practice-query.test.mjs",
    "scripts/tests/rag/variant-practice-embedding-text.test.mjs",
    "scripts/tests/rag/variant-practice-corpus-source.test.mjs",
    "scripts/tests/rag/variant-practice-route.test.mjs",
    "scripts/tests/rag/dynamic-variant-practice-service.test.mjs",
    "scripts/tests/rag/dynamic-variant-practice-client.test.mjs",
    "scripts/tests/rag/sync-variant-practice-pgvector-core.test.mjs",
    "scripts/tests/rag/rag-artifact-inventory-core.test.mjs",
    "scripts/tests/rag/rag-artifact-organizer-cli.test.mjs",
    "scripts/tests/image-diagnosis/vision-extraction-parser.test.mjs",
    "scripts/tests/image-diagnosis/glm-ocr-draft-mapper.test.mjs",
    "scripts/tests/providers/anthropic-compatible-provider.test.mjs",
    "scripts/tests/providers/analysis-provider.test.mjs",
    "scripts/tests/providers/embedding-provider.test.mjs",
    "scripts/tests/providers/glm-ocr-response-parser.test.mjs",
    "scripts/tests/providers/glm-ocr-provider.test.mjs",
    "scripts/tests/diagnosis/diagnosis-evidence.test.mjs",
    "scripts/tests/persistence/diagnosis-persistence.test.mjs",
    "scripts/tests/persistence/student-profile-persistence.test.mjs",
    "scripts/tests/persistence/mistake-book-api.test.mjs",
    "scripts/tests/persistence/variant-practice-pgvector-migration.test.mjs",
    "scripts/tests/persistence/variant-practice-corpus-persistence.test.mjs",
    "scripts/tests/math/math-text-parser.test.mjs",
    "scripts/tests/image-diagnosis/image-diagnosis-pipeline.test.mjs",
    "scripts/tests/image-diagnosis/image-confirmation.test.mjs",
    "scripts/tests/diagnosis/diagnose-client.test.mjs",
    "scripts/tests/image-diagnosis/image-upload-client.test.mjs",
    "scripts/tests/diagnosis/diagnosis-view-model.test.mjs",
    "scripts/tests/ui/mathtrace-workbench-ui.test.mjs",
    "scripts/tests/diagnosis/agent-pipeline.test.mjs",
    "scripts/tests/demo/demo-state.test.mjs",
  ],
  smoke: [
    "scripts/tests/smoke/api-smoke.test.mjs",
    "scripts/tests/smoke/demo-smoke.test.mjs",
  ],
  eval: ["scripts/tests/eval/eval-harness.test.mjs"],
};

const suiteName = process.argv[2] ?? "default";
const testFiles = suites[suiteName];

if (!testFiles) {
  console.error(`Unknown test suite: ${suiteName}`);
  console.error(`Available suites: ${Object.keys(suites).join(", ")}`);
  process.exit(1);
}

if (testFiles.length === 0) {
  console.error(`Test suite is empty: ${suiteName}`);
  process.exit(1);
}

for (const testFile of testFiles) {
  const result = spawnSync(process.execPath, [testFile], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
