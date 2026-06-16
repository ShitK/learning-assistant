import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

const rootScriptEntries = await readdir("scripts", { withFileTypes: true });
const rootTestFiles = rootScriptEntries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
  .map((entry) => entry.name)
  .sort();

assert.deepEqual(
  rootTestFiles,
  [],
  "scripts 根目录不应继续平铺测试脚本；请放到 scripts/tests/<domain>/。",
);

const packageJson = JSON.parse(await readFile("package.json", "utf8"));

assert.equal(
  packageJson.scripts.test.includes("scripts/run-tests.mjs"),
  true,
  "npm test 应通过 scripts/run-tests.mjs 执行分组测试。",
);
assert.equal(
  packageJson.scripts["test:smoke"].includes("scripts/run-tests.mjs"),
  true,
  "npm run test:smoke 应通过 scripts/run-tests.mjs 执行 smoke 测试。",
);
assert.equal(
  packageJson.scripts["test:eval"].includes("scripts/run-tests.mjs"),
  true,
  "npm run test:eval 应通过 scripts/run-tests.mjs 执行 eval 测试。",
);

const allowedLibImportPrefixes = [
  "@/lib/shared/",
  "@/lib/math/",
  "@/lib/vision-extraction/",
  "@/lib/providers/",
  "@/lib/diagnosis/",
  "@/lib/image-diagnosis/",
  "@/lib/persistence/",
  "@/lib/mistake-book/",
  "@/lib/student-profile/",
  "@/lib/demo/",
];

const sourceFiles = await listFiles("src", (filePath) =>
  /\.(ts|tsx)$/.test(filePath),
);
const sourceFileSet = new Set(sourceFiles);
const sourceByFilePath = new Map(
  await Promise.all(
    sourceFiles.map(async (filePath) => [
      filePath,
      await readFile(filePath, "utf8"),
    ]),
  ),
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

function hasRuntimeImportClause(importClause) {
  if (!importClause) {
    return true;
  }

  if (importClause.isTypeOnly) {
    return false;
  }

  if (importClause.name) {
    return true;
  }

  if (!importClause.namedBindings) {
    return true;
  }

  if (ts.isNamespaceImport(importClause.namedBindings)) {
    return true;
  }

  return importClause.namedBindings.elements.some((element) => !element.isTypeOnly);
}

function getRuntimeImportSources(source, filePath) {
  const sourceFile = createSourceFile(filePath, source);
  const importSources = [];

  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      isStringLike(node.moduleSpecifier) &&
      hasRuntimeImportClause(node.importClause)
    ) {
      importSources.push(node.moduleSpecifier.text);
    }

    if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
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

function resolveSourceFile(importSource, fromFilePath) {
  if (importSource.startsWith("@/")) {
    return resolveSourceFileCandidate(join("src", importSource.slice(2)));
  }

  if (importSource.startsWith(".")) {
    return resolveSourceFileCandidate(join(dirname(fromFilePath), importSource));
  }

  return null;
}

function resolveSourceFileCandidate(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    join(basePath, "index.ts"),
    join(basePath, "index.tsx"),
  ];

  return candidates.find((candidate) => sourceFileSet.has(candidate)) ?? null;
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
  const source = sourceByFilePath.get(filePath);
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
  const source = sourceByFilePath.get(filePath);
  if (isClientComponentSource(source, filePath)) {
    clientComponentFiles.push(filePath);
  }
}

const clientReachableFiles = collectClientReachableFiles(clientComponentFiles);

function collectClientReachableFiles(clientRoots) {
  const reachableFiles = new Set();
  const pendingFiles = [...clientRoots];

  while (pendingFiles.length > 0) {
    const filePath = pendingFiles.pop();
    if (!filePath || reachableFiles.has(filePath)) {
      continue;
    }

    reachableFiles.add(filePath);

    const source = sourceByFilePath.get(filePath);
    for (const importSource of getRuntimeImportSources(source, filePath)) {
      const resolvedFile = resolveSourceFile(importSource, filePath);
      if (resolvedFile && !reachableFiles.has(resolvedFile)) {
        pendingFiles.push(resolvedFile);
      }
    }
  }

  return [...reachableFiles].sort();
}

for (const filePath of clientReachableFiles) {
  const source = sourceByFilePath.get(filePath);
  const importSources = getRuntimeImportSources(source, filePath);
  const uncommentedSource = stripComments(source);

  assert.equal(
    filePath.startsWith("src/lib/persistence/"),
    false,
    `${filePath} must not be in the client component runtime graph.`,
  );
  assert.equal(
    filePath.startsWith("src/lib/providers/"),
    false,
    `${filePath} must not be in the client component runtime graph.`,
  );
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

const domainBoundaryRules = [
  {
    from_dir: "src/lib/providers/",
    forbidden_dirs: ["src/lib/diagnosis/", "src/lib/image-diagnosis/"],
    runtime_only: false,
    message:
      "providers must depend only on shared contracts, not diagnosis or image-diagnosis domains.",
  },
  {
    from_dir: "src/lib/image-diagnosis/",
    forbidden_dirs: ["src/lib/providers/"],
    runtime_only: false,
    message:
      "image-diagnosis must depend on shared provider result types, not provider implementations.",
  },
  {
    from_dir: "src/lib/image-diagnosis/",
    forbidden_dirs: ["src/lib/diagnosis/"],
    runtime_only: false,
    message:
      "image-diagnosis must not import diagnosis; move shared types/rules/helpers into shared modules.",
  },
  {
    from_dir: "src/lib/shared/",
    forbidden_dirs: [
      "src/lib/diagnosis/",
      "src/lib/image-diagnosis/",
      "src/lib/providers/",
    ],
    runtime_only: false,
    message:
      "shared must stay domain-neutral and must not import diagnosis, image-diagnosis, or provider modules.",
  },
  {
    from_dir: "src/lib/vision-extraction/",
    forbidden_dirs: [
      "src/lib/diagnosis/",
      "src/lib/image-diagnosis/",
      "src/lib/providers/",
    ],
    runtime_only: false,
    message:
      "vision-extraction must stay neutral and must not import diagnosis, image-diagnosis, or provider modules.",
  },
];

for (const rule of domainBoundaryRules) {
  for (const filePath of sourceFiles.filter((item) =>
    item.startsWith(rule.from_dir),
  )) {
    const source = sourceByFilePath.get(filePath);
    const importSources = rule.runtime_only
      ? getRuntimeImportSources(source, filePath)
      : getImportSources(source, filePath);
    const forbiddenImports = importSources
      .map((importSource) => ({
        importSource,
        resolvedFile: resolveSourceFile(importSource, filePath),
      }))
      .filter(
        ({ resolvedFile }) =>
          resolvedFile &&
          rule.forbidden_dirs.some((dir) => resolvedFile.startsWith(dir)),
      )
      .map(
        ({ importSource, resolvedFile }) =>
          `${importSource} -> ${resolvedFile}`,
      );

    assert.deepEqual(
      forbiddenImports,
      [],
      `${filePath}: ${rule.message} Found: ${forbiddenImports.join(", ")}`,
    );
  }
}
