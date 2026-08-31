import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { parse } from "acorn";
import postcss from "postcss";
import ts from "typescript";

const JAVASCRIPT_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const CORE_SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
]);
const REACT_DEPENDENCIES = /^(?:react|react-dom)(?:\/|$)/u;
const CORE_PATH_SEGMENT = /(?:^|[/\\])core(?:[/\\]|$)/u;

export class PackageAuditError extends Error {
  constructor(diagnostics) {
    super(`Package audit failed with ${diagnostics.length} diagnostic(s).`);
    this.name = "PackageAuditError";
    this.diagnostics = diagnostics;
  }
}

function toPackagePath(packageDirectory, filePath) {
  return relative(packageDirectory, filePath).replaceAll("\\", "/");
}

function isDeclarationFile(path) {
  return (
    path.endsWith(".d.ts") || path.endsWith(".d.mts") || path.endsWith(".d.cts")
  );
}

async function collectFiles(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const files = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function addDiagnostic(diagnostics, code, category, path, message) {
  diagnostics.push({ category, code, message, path });
}

function memberName(node) {
  if (node.type !== "MemberExpression") {
    return undefined;
  }
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  if (
    node.computed &&
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
  ) {
    return node.property.value;
  }
  return undefined;
}

function walkJavaScript(node, visit) {
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent") {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item.type === "string") {
          walkJavaScript(item, visit);
        }
      }
    } else if (value && typeof value.type === "string") {
      walkJavaScript(value, visit);
    }
  }
}

function auditJavaScript(source, path, diagnostics) {
  let program;
  try {
    program = parse(source, { ecmaVersion: 2019, sourceType: "module" });
  } catch (error) {
    addDiagnostic(
      diagnostics,
      "JS_SYNTAX_UNSUPPORTED",
      "syntax",
      path,
      `ES2019 module로 parse할 수 없습니다: ${error.message}`,
    );
    return;
  }

  const found = new Set();
  walkJavaScript(program, (node) => {
    if (node.type === "CallExpression") {
      const calledMember = memberName(node.callee);
      if (calledMember === "at") {
        found.add("JS_ARRAY_AT");
      } else if (calledMember === "findLast") {
        found.add("JS_ARRAY_FIND_LAST");
      } else if (
        calledMember === "randomUUID" &&
        node.callee.object.type === "Identifier" &&
        node.callee.object.name === "crypto"
      ) {
        found.add("JS_CRYPTO_RANDOM_UUID");
      } else if (
        calledMember === "addEventListener" &&
        node.arguments[0]?.type === "Literal" &&
        node.arguments[0].value === "scrollend"
      ) {
        found.add("JS_SCROLLEND");
      } else if (
        node.callee.type === "Identifier" &&
        node.callee.name === "structuredClone"
      ) {
        found.add("JS_STRUCTURED_CLONE");
      }
    }

    if (memberName(node) === "onscrollend") {
      found.add("JS_SCROLLEND");
    }
  });

  const definitions = {
    JS_ARRAY_AT: [
      "ecmascript-api",
      "Array.prototype.at()은 Chrome 75에 없습니다.",
    ],
    JS_ARRAY_FIND_LAST: [
      "ecmascript-api",
      "Array.prototype.findLast()는 Chrome 75에 없습니다.",
    ],
    JS_CRYPTO_RANDOM_UUID: [
      "web-api",
      "crypto.randomUUID()는 Chrome 75에 없습니다.",
    ],
    JS_SCROLLEND: ["web-api", "scrollend event는 Chrome 75에 없습니다."],
    JS_STRUCTURED_CLONE: [
      "web-api",
      "structuredClone()은 Chrome 75에 없습니다.",
    ],
  };

  for (const code of [...found].sort()) {
    const [category, message] = definitions[code];
    addDiagnostic(diagnostics, code, category, path, message);
  }
}

function auditJavaScriptSourcemap(source, path, diagnostics) {
  let map;
  try {
    map = JSON.parse(source);
  } catch {
    return;
  }
  if (!Array.isArray(map.sources) || !Array.isArray(map.sourcesContent)) {
    return;
  }

  const leaksCoreContent = map.sources.some(
    (sourcePath, index) =>
      CORE_PATH_SEGMENT.test(sourcePath) &&
      typeof map.sourcesContent[index] === "string" &&
      map.sourcesContent[index].length > 0,
  );
  if (leaksCoreContent) {
    addDiagnostic(
      diagnostics,
      "PUBLIC_CORE_SOURCEMAP_CONTENT",
      "architecture",
      path,
      "sourcemap의 sourcesContent에 private core 원본 소스가 노출될 수 없습니다.",
    );
  }
}

function moduleSpecifierText(node) {
  return node && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function auditCoreSource(source, path, diagnostics) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const found = new Set();

  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      REACT_DEPENDENCIES.test(moduleSpecifierText(node.moduleSpecifier) ?? "")
    ) {
      found.add("CORE_REACT_STATIC_IMPORT");
    }

    if (ts.isCallExpression(node)) {
      const dependency = moduleSpecifierText(node.arguments[0]);
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        REACT_DEPENDENCIES.test(dependency ?? "")
      ) {
        found.add("CORE_REACT_DYNAMIC_IMPORT");
      }
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require" &&
        REACT_DEPENDENCIES.test(dependency ?? "")
      ) {
        found.add("CORE_REACT_REQUIRE");
      }
    }

    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  const messages = {
    CORE_REACT_DYNAMIC_IMPORT:
      "core production code에서 React dynamic import를 사용할 수 없습니다.",
    CORE_REACT_REQUIRE:
      "core production code에서 React require()를 사용할 수 없습니다.",
    CORE_REACT_STATIC_IMPORT:
      "core production code에서 React static import를 사용할 수 없습니다.",
  };
  for (const code of [...found].sort()) {
    addDiagnostic(diagnostics, code, "architecture", path, messages[code]);
  }
}

function auditDeclaration(source, path, diagnostics) {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  let exposesCore = false;

  function visit(node) {
    if ("moduleSpecifier" in node) {
      const specifier = moduleSpecifierText(node.moduleSpecifier);
      if (specifier && CORE_PATH_SEGMENT.test(specifier)) {
        exposesCore = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (exposesCore) {
    addDiagnostic(
      diagnostics,
      "PUBLIC_CORE_DECLARATION_EXPORT",
      "architecture",
      path,
      "declaration에서 private core 경로를 공개할 수 없습니다.",
    );
  }
}

function packageExportsCore(value, key = "") {
  if (CORE_PATH_SEGMENT.test(key)) {
    return true;
  }
  if (typeof value === "string") {
    return CORE_PATH_SEGMENT.test(value);
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  return Object.entries(value).some(([childKey, childValue]) =>
    packageExportsCore(childValue, childKey),
  );
}

function resolveClientEntryPath(exportsField) {
  const rootExport = exportsField?.["."];
  if (typeof rootExport === "string") {
    return rootExport;
  }
  if (rootExport && typeof rootExport === "object") {
    return typeof rootExport.import === "string" ? rootExport.import : undefined;
  }
  return undefined;
}

function stripLeadingComments(source) {
  let rest = source;
  for (;;) {
    const withoutWhitespace = rest.replace(/^\s+/u, "");
    if (withoutWhitespace.startsWith("/*")) {
      const end = withoutWhitespace.indexOf("*/");
      if (end === -1) {
        return withoutWhitespace;
      }
      rest = withoutWhitespace.slice(end + 2);
      continue;
    }
    if (withoutWhitespace.startsWith("//")) {
      const end = withoutWhitespace.indexOf("\n");
      rest = end === -1 ? "" : withoutWhitespace.slice(end + 1);
      continue;
    }
    return withoutWhitespace;
  }
}

const USE_CLIENT_DIRECTIVE = /^(["'])use client\1;/u;

function auditClientEntryDirective(source, path, diagnostics) {
  if (!USE_CLIENT_DIRECTIVE.test(stripLeadingComments(source))) {
    addDiagnostic(
      diagnostics,
      "PUBLIC_CLIENT_ENTRY_MISSING_USE_CLIENT",
      "client-boundary",
      path,
      "공개 client entry 최상단에 'use client' directive가 없습니다.",
    );
  }
}

async function auditManifest(packageDirectory, diagnostics) {
  const manifestPath = join(packageDirectory, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (packageExportsCore(manifest.exports)) {
    addDiagnostic(
      diagnostics,
      "PUBLIC_CORE_PACKAGE_EXPORT",
      "architecture",
      "package.json",
      "package exports에서 private core 경로를 공개할 수 없습니다.",
    );
  }

  const clientEntryRelativePath = resolveClientEntryPath(manifest.exports);
  if (clientEntryRelativePath === undefined) {
    return;
  }
  const clientEntryPath = join(packageDirectory, clientEntryRelativePath);
  let clientEntrySource;
  try {
    clientEntrySource = await readFile(clientEntryPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  auditClientEntryDirective(
    clientEntrySource,
    toPackagePath(packageDirectory, clientEntryPath),
    diagnostics,
  );
}

const CUSTOM_PROPERTY_VAR = /var\(\s*(--scrolla-[\w-]+)/u;
const FADE_DURATION_VAR = /--scrolla-fade-duration/u;
const ZERO_DURATION = /(?:^|\s|,)0(?:s|ms)?(?:\s|,|$)/u;

function isReducedMotionMedia(atRule) {
  return (
    atRule.name.toLowerCase() === "media" &&
    /prefers-reduced-motion\s*:\s*reduce/u.test(atRule.params)
  );
}

function insideReducedMotionMedia(node) {
  for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
    if (ancestor.type === "atrule" && isReducedMotionMedia(ancestor)) {
      return true;
    }
  }
  return false;
}

function auditCss(source, path, diagnostics) {
  const root = postcss.parse(source, { from: path });
  let hasLayer = false;
  let missesAppearancePrefix = false;
  let hasPointerEventsNone = false;
  let missesCustomPropertyFallback = false;
  let hasFadeDurationTransition = false;
  let hasReducedMotionZeroDuration = false;

  root.walkAtRules("layer", () => {
    hasLayer = true;
  });
  root.walkRules((rule) => {
    let appearanceNone = false;
    let webkitAppearanceNone = false;
    const precedingLiteralByProperty = new Map();
    rule.walkDecls((declaration) => {
      const property = declaration.prop.toLowerCase();
      const value = declaration.value.trim().toLowerCase();
      if (property === "appearance" && value === "none") {
        appearanceNone = true;
      }
      if (property === "-webkit-appearance" && value === "none") {
        webkitAppearanceNone = true;
      }
      if (property === "pointer-events" && value === "none") {
        hasPointerEventsNone = true;
      }
      const customPropertyUsage = CUSTOM_PROPERTY_VAR.exec(value);
      if (customPropertyUsage === null) {
        precedingLiteralByProperty.set(property, true);
        return;
      }
      if (precedingLiteralByProperty.get(property) !== true) {
        missesCustomPropertyFallback = true;
      }
      if (
        (property === "transition" || property === "transition-duration") &&
        FADE_DURATION_VAR.test(value) &&
        !insideReducedMotionMedia(declaration)
      ) {
        hasFadeDurationTransition = true;
      }
    });
    if (appearanceNone && !webkitAppearanceNone) {
      missesAppearancePrefix = true;
    }
  });
  root.walkAtRules((atRule) => {
    if (!isReducedMotionMedia(atRule)) {
      return;
    }
    atRule.walkDecls(
      /^transition(-duration)?$/u,
      (declaration) => {
        if (ZERO_DURATION.test(`${declaration.value.trim().toLowerCase()} `)) {
          hasReducedMotionZeroDuration = true;
        }
      },
    );
  });

  if (hasLayer) {
    addDiagnostic(
      diagnostics,
      "CSS_LAYER",
      "css",
      path,
      "@layer는 Chrome 75에 없습니다.",
    );
  }
  if (missesAppearancePrefix) {
    addDiagnostic(
      diagnostics,
      "CSS_APPEARANCE_PREFIX",
      "css",
      path,
      "appearance: none에는 -webkit-appearance: none이 함께 있어야 합니다.",
    );
  }
  if (!hasPointerEventsNone) {
    addDiagnostic(
      diagnostics,
      "CSS_MISSING_POINTER_EVENTS_NONE",
      "css",
      path,
      "pointer-events: none 선언이 없습니다.",
    );
  }
  if (missesCustomPropertyFallback) {
    addDiagnostic(
      diagnostics,
      "CSS_CUSTOM_PROPERTY_FALLBACK",
      "css",
      path,
      "--scrolla- custom property 사용에는 같은 규칙 안에 같은 property의 literal 선언이 먼저 있어야 합니다.",
    );
  }
  if (hasFadeDurationTransition && !hasReducedMotionZeroDuration) {
    addDiagnostic(
      diagnostics,
      "CSS_REDUCED_MOTION_FADE_DURATION",
      "css",
      path,
      "prefers-reduced-motion: reduce에서 fade duration을 0으로 처리해야 합니다.",
    );
  }
}

export async function auditPackage(rootPath, { artifactDirectory = "dist" } = {}) {
  const packageDirectory = resolve(rootPath);
  const artifactFiles = await collectFiles(
    join(packageDirectory, artifactDirectory),
  );
  const coreFiles = (
    await collectFiles(join(packageDirectory, "src/core"))
  ).filter(
    (path) =>
      CORE_SOURCE_EXTENSIONS.has(extname(path)) && !isDeclarationFile(path),
  );
  const javascriptFiles = artifactFiles.filter((path) =>
    JAVASCRIPT_EXTENSIONS.has(extname(path)),
  );
  const declarationFiles = artifactFiles.filter(isDeclarationFile);
  const cssFiles = artifactFiles.filter((path) => extname(path) === ".css");
  const sourcemapFiles = artifactFiles.filter((path) =>
    /\.(?:js|mjs|cjs)\.map$/u.test(path),
  );
  const diagnostics = [];

  if (javascriptFiles.length === 0) {
    addDiagnostic(
      diagnostics,
      "MISSING_JS_TARGET",
      "javascript",
      artifactDirectory,
      "JavaScript 감사 대상이 없습니다.",
    );
  }
  if (declarationFiles.length === 0) {
    addDiagnostic(
      diagnostics,
      "MISSING_DECLARATION_TARGET",
      "declaration",
      artifactDirectory,
      "declaration 감사 대상이 없습니다.",
    );
  }
  if (cssFiles.length === 0) {
    addDiagnostic(
      diagnostics,
      "MISSING_CSS_TARGET",
      "css",
      artifactDirectory,
      "CSS 감사 대상이 없습니다.",
    );
  }

  for (const filePath of javascriptFiles) {
    auditJavaScript(
      await readFile(filePath, "utf8"),
      toPackagePath(packageDirectory, filePath),
      diagnostics,
    );
  }
  for (const filePath of declarationFiles) {
    const packagePath = toPackagePath(packageDirectory, filePath);
    if (CORE_PATH_SEGMENT.test(packagePath)) {
      addDiagnostic(
        diagnostics,
        "PUBLIC_CORE_DECLARATION_FILE",
        "architecture",
        packagePath,
        "private core declaration 파일이 package artifact에 물리적으로 존재할 수 없습니다.",
      );
    }
    auditDeclaration(await readFile(filePath, "utf8"), packagePath, diagnostics);
  }
  for (const filePath of cssFiles) {
    auditCss(
      await readFile(filePath, "utf8"),
      toPackagePath(packageDirectory, filePath),
      diagnostics,
    );
  }
  for (const filePath of sourcemapFiles) {
    auditJavaScriptSourcemap(
      await readFile(filePath, "utf8"),
      toPackagePath(packageDirectory, filePath),
      diagnostics,
    );
  }
  for (const filePath of coreFiles) {
    auditCoreSource(
      await readFile(filePath, "utf8"),
      toPackagePath(packageDirectory, filePath),
      diagnostics,
    );
  }
  await auditManifest(packageDirectory, diagnostics);

  diagnostics.sort((left, right) =>
    left.path === right.path
      ? left.code.localeCompare(right.code)
      : left.path.localeCompare(right.path),
  );
  if (diagnostics.length > 0) {
    throw new PackageAuditError(diagnostics);
  }

  return {
    diagnostics,
    targets: {
      core: coreFiles.length,
      css: cssFiles.length,
      declarations: declarationFiles.length,
      javascript: javascriptFiles.length,
      sourcemaps: sourcemapFiles.length,
    },
  };
}
