#!/usr/bin/env node

import { join } from "node:path";
import { variantPracticeEvalCases } from "../fixtures/rag/variant-practice-eval-cases.mjs";
import { createProjectJiti } from "../test-support/project-jiti.mjs";
import {
  buildVariantPracticeRetrievalEvalReport,
  writeEvalReportFiles,
} from "./evaluate-variant-practice-retrieval-core.mjs";

const jiti = createProjectJiti();
const { handleDynamicVariantPracticeEvalRequest } = jiti(
  "./src/lib/server/rag/dynamic-variant-practice-service.ts",
);

async function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  if (!parsedArgs.ok) {
    throw new Error(parsedArgs.message);
  }

  const selectedCases = parsedArgs.caseId
    ? variantPracticeEvalCases.filter((evalCase) => evalCase.id === parsedArgs.caseId)
    : variantPracticeEvalCases;

  if (parsedArgs.caseId && selectedCases.length === 0) {
    throw new Error(`Unknown eval case: ${parsedArgs.caseId}`);
  }

  const report = await buildVariantPracticeRetrievalEvalReport({
    cases: selectedCases,
    mode: parsedArgs.mode,
    runCase: async (evalCase) =>
      handleDynamicVariantPracticeEvalRequest(evalCase.request, {
        pgvectorCorpusSource: parsedArgs.mode === "local_only" ? null : undefined,
      }),
  });

  const outputDir =
    parsedArgs.outputDir ??
    join("artifacts", "rag", "evals", "variant-practice-retrieval-quality");
  const writeResult = await writeEvalReportFiles({
    report,
    outputDir,
    writeLatest: !parsedArgs.noLatest,
  });

  console.log(`variant practice retrieval eval report written: ${writeResult.timestampPath}`);
}

function parseArgs(argv) {
  let mode = null;
  let outputDir = null;
  let caseId = null;
  let noLatest = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--local-only") {
      mode = mode === null ? "local_only" : "invalid";
      continue;
    }

    if (arg === "--pgvector-preferred") {
      mode = mode === null ? "pgvector_preferred" : "invalid";
      continue;
    }

    if (arg === "--output") {
      const consumed = consumeValue(argv, index, "--output");
      if (!consumed.ok) {
        return consumed;
      }
      outputDir = consumed.value;
      index += 1;
      continue;
    }

    if (arg === "--case") {
      const consumed = consumeValue(argv, index, "--case");
      if (!consumed.ok) {
        return consumed;
      }
      caseId = consumed.value;
      index += 1;
      continue;
    }

    if (arg === "--no-latest") {
      noLatest = true;
      continue;
    }

    return { ok: false, message: `Unknown argument: ${arg}` };
  }

  if (mode === null || mode === "invalid") {
    return {
      ok: false,
      message: "Choose exactly one mode: --local-only or --pgvector-preferred",
    };
  }

  return { ok: true, mode, outputDir, caseId, noLatest };
}

function consumeValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    return { ok: false, message: `${optionName} requires a value` };
  }
  return { ok: true, value };
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
