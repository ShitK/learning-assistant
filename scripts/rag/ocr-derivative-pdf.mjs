#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCandidateExtraction,
  renderExtractionReport,
} from "./derivative-pdf-ocr-core.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_POPPLER_BIN = process.env.CODEX_POPPLER_BIN
  ? resolve(process.env.CODEX_POPPLER_BIN)
  : null;
const BUNDLED_POPPLER_BIN =
  "/Users/kk/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/bin";
const DEFAULT_DPI = 180;
const TESSERACT_LANGUAGE = "chi_sim+eng";
const COMMAND_TIMEOUT_MS = 60_000;

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
  await assertFileExists(inputPath);
  const outDir = resolve(args.out ?? "artifacts/rag/derivative-pdf-spike");
  const pagesDir = join(outDir, "pages");
  const slicesDir = join(outDir, "page-slices");
  const warnings = [];

  await mkdir(pagesDir, { recursive: true });
  await mkdir(slicesDir, { recursive: true });

  const sourceFileSha256 = await sha256File(inputPath);
  const pdfInfo = readPdfInfo(inputPath, warnings);
  const pageCount = pdfInfo.pages ?? 0;
  const maxPages = Math.min(args.maxPages ?? pageCount, pageCount);

  const renderedPages = renderPages({
    inputPath,
    pagesDir,
    maxPages,
    dpi: args.dpi ?? DEFAULT_DPI,
    warnings,
  });

  const pageRecords = [];
  const sliceReports = [];
  for (const renderedPage of renderedPages) {
    const slices = splitRenderedPage({
      renderedPage,
      slicesDir,
      warnings,
    });

    for (const slice of slices) {
      sliceReports.push({
        pdf_page_index: renderedPage.pdfPageIndex,
        side: slice.side,
        path: relativeFromProject(slice.path),
        dimensions: readPngDimensions(slice.path),
      });
      const ocr = runOcr({
        imagePath: slice.path,
        ocrCommand: args.ocrCommand ?? "tesseract",
      });
      if (!ocr.ok) {
        warnings.push(ocr.warning);
      }

      pageRecords.push({
        pdfPageIndex: renderedPage.pdfPageIndex,
        bookPageLabel: null,
        side: slice.side,
        cropImagePath: relativeFromProject(slice.path),
        ocrText: ocr.text,
        warnings: ocr.ok ? [] : [ocr.warning],
      });
    }
  }

  const extraction = buildCandidateExtraction({
    sourceFile: inputPath,
    sourceFileSha256,
    extractedAt: new Date().toISOString(),
    pageCount,
    pageRecords,
    warnings,
  });

  await writeFile(
    join(outDir, "candidate_questions.json"),
    `${JSON.stringify(extraction, null, 2)}\n`,
  );
  await writeFile(
    join(outDir, "extraction_report.md"),
    `${renderExtractionReport(extraction)}\n${renderCliEnvironmentReport({
      sipsAvailable: findExecutableInPath("sips"),
      ocrCommand: args.ocrCommand ?? "tesseract",
      ocrLanguage: TESSERACT_LANGUAGE,
      sliceReports,
    })}`,
  );

  console.log(`Wrote ${join(outDir, "candidate_questions.json")}`);
  console.log(`Wrote ${join(outDir, "extraction_report.md")}`);
  console.log(`Candidates: ${extraction.candidates.length}`);
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
    } else if (arg === "--max-pages") {
      args.maxPages = parsePositiveInteger(
        readOptionValue(argv, index, arg),
        "--max-pages",
      );
      index += 1;
    } else if (arg === "--dpi") {
      args.dpi = parsePositiveInteger(readOptionValue(argv, index, arg), "--dpi");
      index += 1;
    } else if (arg === "--ocr-command") {
      args.ocrCommand = parseOcrCommand(readOptionValue(argv, index, arg));
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

function parseOcrCommand(value) {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new CliUsageError(
      "unsupported --ocr-command; use a command name such as tesseract",
    );
  }
  return value;
}

function printHelp() {
  console.log(`Usage:
  node scripts/rag/ocr-derivative-pdf.mjs --input <pdf> [--out <dir>] [--max-pages 2] [--dpi 180] [--ocr-command tesseract]

This offline spike renders a scanned derivative PDF and emits candidate question artifacts.
Generated artifacts are local-only and must not be committed.`);
}

async function sha256File(filePath) {
  const bytes = await readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

async function assertFileExists(filePath) {
  try {
    await access(filePath);
  } catch {
    throw new CliUsageError(`input file not found: ${filePath}`);
  }
}

function readPdfInfo(inputPath, warnings) {
  const pdfinfo = findBinary("pdfinfo");
  if (!pdfinfo) {
    warnings.push("pdfinfo_unavailable");
    return { pages: 0 };
  }

  const result = spawnSync(pdfinfo, [inputPath], {
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    warnings.push("pdfinfo_failed");
    return { pages: 0 };
  }

  const pagesMatch = result.stdout.match(/^Pages:\s+(\d+)/m);
  return {
    pages: pagesMatch ? Number(pagesMatch[1]) : 0,
  };
}

function renderPages({ inputPath, pagesDir, maxPages, dpi, warnings }) {
  const pdftoppm = findBinary("pdftoppm");
  if (!pdftoppm) {
    warnings.push("pdftoppm_unavailable");
    return [];
  }

  const outputPrefix = join(pagesDir, "page");
  const result = spawnSync(
    pdftoppm,
    [
      "-f",
      "1",
      "-l",
      String(maxPages),
      "-png",
      "-r",
      String(dpi),
      inputPath,
      outputPrefix,
    ],
    { encoding: "utf8", timeout: COMMAND_TIMEOUT_MS },
  );

  if (result.status !== 0) {
    warnings.push("pdftoppm_failed");
    return [];
  }

  return Array.from({ length: maxPages }, (_, index) => ({
    pdfPageIndex: index + 1,
    path: `${outputPrefix}-${index + 1}.png`,
  }));
}

function splitRenderedPage({ renderedPage, slicesDir, warnings }) {
  const dimensions = readPngDimensions(renderedPage.path);
  if (!dimensions || !isPillowCropAvailable()) {
    warnings.push("page_slice_fallback_full_page");
    return [
      {
        side: "full",
        path: renderedPage.path,
      },
    ];
  }

  const halfWidth = Math.floor(dimensions.width / 2);
  const leftPath = join(
    slicesDir,
    `page-${String(renderedPage.pdfPageIndex).padStart(3, "0")}-left.png`,
  );
  const rightPath = join(
    slicesDir,
    `page-${String(renderedPage.pdfPageIndex).padStart(3, "0")}-right.png`,
  );
  const leftOk = cropWithPillow({
    inputPath: renderedPage.path,
    outputPath: leftPath,
    cropBox: {
      left: 0,
      top: 0,
      right: halfWidth,
      bottom: dimensions.height,
    },
  });
  const rightOk = cropWithPillow({
    inputPath: renderedPage.path,
    outputPath: rightPath,
    cropBox: {
      left: halfWidth,
      top: 0,
      right: dimensions.width,
      bottom: dimensions.height,
    },
  });

  if (!leftOk || !rightOk) {
    warnings.push("page_slice_fallback_full_page");
    return [
      {
        side: "full",
        path: renderedPage.path,
      },
    ];
  }

  return [
    { side: "left", path: leftPath },
    { side: "right", path: rightPath },
  ];
}

function readPngDimensions(imagePath) {
  const result = spawnSync(
    "python3",
    [
      "-c",
      [
        "from PIL import Image",
        "import json, sys",
        "image = Image.open(sys.argv[1])",
        "print(json.dumps({'width': image.size[0], 'height': image.size[1]}))",
      ].join("; "),
      imagePath,
    ],
    { encoding: "utf8", timeout: COMMAND_TIMEOUT_MS },
  );
  if (result.status !== 0) {
    return null;
  }

  try {
    const dimensions = JSON.parse(result.stdout);
    if (
      !Number.isInteger(dimensions.width) ||
      !Number.isInteger(dimensions.height)
    ) {
      return null;
    }
    return dimensions;
  } catch {
    return null;
  }
}

function cropWithPillow({ inputPath, outputPath, cropBox }) {
  const result = spawnSync(
    "python3",
    [
      "-c",
      [
        "from PIL import Image",
        "import sys",
        "image = Image.open(sys.argv[1])",
        "box = tuple(map(int, sys.argv[3:7]))",
        "image.crop(box).save(sys.argv[2])",
      ].join("; "),
      inputPath,
      outputPath,
      String(cropBox.left),
      String(cropBox.top),
      String(cropBox.right),
      String(cropBox.bottom),
    ],
    { encoding: "utf8", timeout: COMMAND_TIMEOUT_MS },
  );

  return result.status === 0;
}

function isPillowCropAvailable() {
  if (!findExecutableInPath("python3")) {
    return false;
  }

  const result = spawnSync("python3", ["-c", "from PIL import Image"], {
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
  });
  return result.status === 0;
}

function runOcr({ imagePath, ocrCommand }) {
  if (!findExecutableInPath(ocrCommand)) {
    return {
      ok: false,
      text: "",
      warning: "ocr_tool_unavailable",
    };
  }

  const result = spawnSync(
    ocrCommand,
    [imagePath, "stdout", "-l", TESSERACT_LANGUAGE],
    {
      encoding: "utf8",
      timeout: COMMAND_TIMEOUT_MS,
    },
  );

  if (result.status !== 0) {
    if (/Failed loading language|Error opening data file/i.test(result.stderr)) {
      return {
        ok: false,
        text: "",
        warning: "ocr_language_pack_unavailable",
      };
    }

    return {
      ok: false,
      text: "",
      warning: "ocr_failed",
    };
  }

  return {
    ok: true,
    text: result.stdout,
  };
}

function findBinary(name) {
  if (DEFAULT_POPPLER_BIN && findExecutableInPath(join(DEFAULT_POPPLER_BIN, name))) {
    return join(DEFAULT_POPPLER_BIN, name);
  }
  const bundled = join(BUNDLED_POPPLER_BIN, name);
  if (findExecutableInPath(bundled)) {
    return bundled;
  }
  return findExecutableInPath(name) ? name : null;
}

function findExecutableInPath(command) {
  const result = spawnSync("which", [command], {
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
  });
  return result.status === 0;
}

function relativeFromProject(filePath) {
  const absolute = resolve(filePath);
  return absolute.startsWith(projectRoot)
    ? absolute.slice(projectRoot.length + 1)
    : absolute;
}

function renderCliEnvironmentReport({
  sipsAvailable,
  ocrCommand,
  ocrLanguage,
  sliceReports,
}) {
  return [
    "## CLI Environment",
    "",
    `- sips_available: ${sipsAvailable}`,
    `- python_pillow_crop_available: ${isPillowCropAvailable()}`,
    `- ocr_command: ${ocrCommand}`,
    `- ocr_language: ${ocrLanguage}`,
    "",
    "## Slice Dimensions",
    "",
    ...sliceReports.map((slice) => {
      const dimensions = slice.dimensions
        ? `${slice.dimensions.width}x${slice.dimensions.height}`
        : "unknown";
      return `- page ${slice.pdf_page_index} ${slice.side}: ${dimensions} ${slice.path}`;
    }),
    "",
  ].join("\n");
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  console.error(error);
  process.exitCode = 1;
});
