import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import ts from "typescript";

const packageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const diagnostics = [];

const ruleSeverity = (config, ruleName) => {
  const setting = config?.rules?.[ruleName];

  return Array.isArray(setting) ? setting[0] : setting;
};

const auditEslintCoverage = async () => {
  const typedTestPaths = [
    "test/config-coverage.test.mts",
    "test/config-coverage.test.cts",
  ];
  const typedPaths = [
    "src/core/config-coverage.mts",
    "src/core/config-coverage.cts",
    ...typedTestPaths,
  ];
  const untypedPaths = [
    "scripts/config-coverage.mts",
    "scripts/config-coverage.cts",
    "vitest.config.mts",
    "vitest.config.cts",
  ];
  const createdTestFiles = [];

  try {
    for (const filePath of typedTestPaths) {
      const absolutePath = path.join(packageDirectory, filePath);
      await writeFile(absolutePath, "export {};\n", { flag: "wx" });
      createdTestFiles.push(absolutePath);
    }

    const eslint = new ESLint({ cwd: packageDirectory });

    for (const filePath of typedPaths) {
      const config = await eslint.calculateConfigForFile(filePath);
      const projectService =
        config?.languageOptions?.parserOptions?.projectService;
      const unsafeAssignment = ruleSeverity(
        config,
        "@typescript-eslint/no-unsafe-assignment",
      );

      if (projectService !== true || unsafeAssignment !== 2) {
        diagnostics.push(
          `CONFIG_ESLINT_TYPED_COVERAGE ${filePath}: expected projectService=true and @typescript-eslint/no-unsafe-assignment=error`,
        );
      }
    }

    for (const filePath of typedTestPaths) {
      const [result] = await eslint.lintText("export {};", { filePath });
      const projectDiagnostics = result.messages.filter(
        ({ fatal, message }) =>
          fatal === true || /project service/i.test(message),
      );

      if (projectDiagnostics.length > 0) {
        diagnostics.push(
          `CONFIG_ESLINT_PROJECT_SERVICE ${filePath}: expected lintText parsing without fatal/project-resolution diagnostics; got ${projectDiagnostics.map(({ message }) => message).join(" | ")}`,
        );
      }
    }

    for (const filePath of untypedPaths) {
      const config = await eslint.calculateConfigForFile(filePath);
      const projectService =
        config?.languageOptions?.parserOptions?.projectService;
      const unsafeAssignment = ruleSeverity(
        config,
        "@typescript-eslint/no-unsafe-assignment",
      );

      if (projectService !== false || unsafeAssignment !== 0) {
        diagnostics.push(
          `CONFIG_ESLINT_UNTYPED_COVERAGE ${filePath}: expected projectService=false and @typescript-eslint/no-unsafe-assignment=off`,
        );
      }
    }
  } finally {
    await Promise.all(createdTestFiles.map((filePath) => rm(filePath)));
  }
};

const auditTypescriptCoverage = async () => {
  const configPath = path.join(packageDirectory, "tsconfig.json");
  const configResult = ts.readConfigFile(configPath, ts.sys.readFile);

  if (configResult.error) {
    diagnostics.push(
      `CONFIG_TYPESCRIPT_READ ${ts.flattenDiagnosticMessageText(configResult.error.messageText, " ")}`,
    );
    return;
  }

  const fixtureDirectory = await mkdtemp(
    path.join(tmpdir(), "scrollbars-config-coverage-"),
  );
  const expectedFiles = [
    path.join(fixtureDirectory, "src/core/config-coverage.mts"),
    path.join(fixtureDirectory, "src/core/config-coverage.cts"),
  ];

  try {
    await mkdir(path.join(fixtureDirectory, "src/core"), { recursive: true });
    await Promise.all(expectedFiles.map((filePath) => writeFile(filePath, "")));

    const parsed = ts.parseJsonConfigFileContent(
      { include: configResult.config.include },
      ts.sys,
      fixtureDirectory,
    );
    const matchedFiles = new Set(
      parsed.fileNames.map((filePath) => path.resolve(filePath)),
    );

    for (const filePath of expectedFiles) {
      if (!matchedFiles.has(path.resolve(filePath))) {
        diagnostics.push(
          `CONFIG_TYPESCRIPT_INCLUDE ${path.relative(fixtureDirectory, filePath)}: expected package tsconfig include to match this production source`,
        );
      }
    }
  } finally {
    await rm(fixtureDirectory, { recursive: true });
  }
};

await auditEslintCoverage();
await auditTypescriptCoverage();

if (diagnostics.length > 0) {
  console.error(diagnostics.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "Config coverage audit passed: resolved typed .mts/.cts config, Project Service test parsing, untyped tooling, and TypeScript production includes.",
  );
}
