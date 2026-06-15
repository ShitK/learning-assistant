import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";

const allowedRootLibFiles = new Set([]);

async function listFiles(dir, predicate = () => true) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath, predicate)));
      continue;
    }

    if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

const rootLibEntries = await readdir("src/lib", { withFileTypes: true });
const rootLibFiles = rootLibEntries
  .filter(
    (entry) =>
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")),
  )
  .map((entry) => entry.name)
  .filter((fileName) => !allowedRootLibFiles.has(fileName))
  .sort();

assert.deepEqual(
  rootLibFiles,
  [],
  "src/lib 根目录不应继续平铺业务模块；请移动到 domain 子目录。",
);

const allowedLibImportPrefixes = [
  "@/lib/shared/",
  "@/lib/math/",
  "@/lib/providers/",
  "@/lib/diagnosis/",
  "@/lib/image-diagnosis/",
  "@/lib/persistence/",
  "@/lib/mistake-book/",
  "@/lib/demo/",
];

const sourceFiles = await listFiles("src", (filePath) =>
  /\.(ts|tsx)$/.test(filePath),
);

function createSourceFile(filePath, source) {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function isStringLike(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function getImportSources(source, filePath) {
  const sourceFile = createSourceFile(filePath, source);
  const importSources = [];

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      isStringLike(node.moduleSpecifier)
    ) {
      importSources.push(node.moduleSpecifier.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      isStringLike(node.arguments[0])
    ) {
      importSources.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return importSources;
}

function isClientComponentSource(source, filePath) {
  const sourceFile = createSourceFile(filePath, source);
  const firstStatement = sourceFile.statements[0];

  return (
    Boolean(firstStatement) &&
    ts.isExpressionStatement(firstStatement) &&
    isStringLike(firstStatement.expression) &&
    firstStatement.expression.text === "use client"
  );
}

for (const filePath of sourceFiles) {
  const source = await readFile(filePath, "utf8");
  const oldFlatLibImports = getImportSources(source, filePath).filter((importSource) => {
    if (!importSource.startsWith("@/lib/")) {
      return false;
    }

    return !allowedLibImportPrefixes.some((prefix) =>
      importSource.startsWith(prefix),
    );
  });

  assert.deepEqual(
    oldFlatLibImports,
    [],
    `${filePath} contains old flat @/lib imports: ${oldFlatLibImports.join(", ")}`,
  );
}

const clientComponentFiles = [];

for (const filePath of sourceFiles) {
  const source = await readFile(filePath, "utf8");
  if (isClientComponentSource(source, filePath)) {
    clientComponentFiles.push(filePath);
  }
}

for (const filePath of clientComponentFiles) {
  const source = await readFile(filePath, "utf8");
  const importSources = getImportSources(source, filePath);
  const uncommentedSource = stripComments(source);

  assert.equal(
    importSources.some((importSource) =>
      importSource.startsWith("@/lib/persistence/"),
    ),
    false,
    `${filePath} must not import persistence modules.`,
  );
  assert.equal(
    importSources.some((importSource) =>
      importSource.startsWith("@/lib/providers/"),
    ),
    false,
    `${filePath} must not import provider modules.`,
  );
  assert.equal(
    importSources.includes("@supabase/supabase-js"),
    false,
    `${filePath} must not import Supabase directly.`,
  );
  assert.equal(
    /\bSUPABASE_SERVICE_ROLE_KEY\b/.test(uncommentedSource),
    false,
    `${filePath} must not read service role key.`,
  );
}
