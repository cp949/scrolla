import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import ts from "typescript";

const packageDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const diagnostics = [];

const execFileAsync = promisify(execFile);
// exports에 bin이 없으므로 package.json 위치에서 CLI 진입점을 계산한다.
const oxlintBinPath = path.join(
  path.dirname(createRequire(import.meta.url).resolve("oxlint/package.json")),
  "bin/oxlint",
);
const oxlintConfigPath = path.resolve(packageDirectory, "../../.oxlintrc.json");
const unsafeAssignmentCode = "typescript(no-unsafe-assignment)";
// any 값을 타입이 있는 변수에 대입하므로 typed 규칙이 켜진 경우에만 진단이 나온다.
const probeSource =
  'export const probe = JSON.parse("{}");\nexport const typed: string = probe;\n';

const lintProbeFiles = async (filePaths) => {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        oxlintBinPath,
        "--type-aware",
        "--format=json",
        "-c",
        oxlintConfigPath,
        ...filePaths,
      ],
      { cwd: packageDirectory },
    );

    return JSON.parse(stdout).diagnostics;
  } catch (error) {
    // 진단이 있으면 oxlint가 비정상 종료하지만 stdout에는 JSON이 남는다.
    if (typeof error.stdout === "string" && error.stdout.startsWith("{")) {
      return JSON.parse(error.stdout).diagnostics;
    }

    throw error;
  }
};

const auditOxlintCoverage = async () => {
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
  const createdFiles = [];

  try {
    for (const filePath of [...typedPaths, ...untypedPaths]) {
      const absolutePath = path.join(packageDirectory, filePath);
      await writeFile(absolutePath, probeSource, { flag: "wx" });
      createdFiles.push(absolutePath);
    }

    const diagnosticsByFile = new Map();

    for (const diagnostic of await lintProbeFiles([
      ...typedPaths,
      ...untypedPaths,
    ])) {
      const fileDiagnostics = diagnosticsByFile.get(diagnostic.filename) ?? [];
      fileDiagnostics.push(diagnostic);
      diagnosticsByFile.set(diagnostic.filename, fileDiagnostics);
    }

    for (const filePath of typedPaths) {
      const fileDiagnostics = diagnosticsByFile.get(filePath) ?? [];
      const unsafeAssignments = fileDiagnostics.filter(
        ({ code }) => code === unsafeAssignmentCode,
      );

      if (unsafeAssignments.length === 0) {
        diagnostics.push(
          `CONFIG_OXLINT_TYPED_COVERAGE ${filePath}: expected typescript/no-unsafe-assignment=error diagnostic from type-aware linting`,
        );
      }
    }

    for (const filePath of untypedPaths) {
      const fileDiagnostics = diagnosticsByFile.get(filePath) ?? [];

      if (fileDiagnostics.some(({ code }) => code === unsafeAssignmentCode)) {
        diagnostics.push(
          `CONFIG_OXLINT_UNTYPED_COVERAGE ${filePath}: expected typescript/no-unsafe-assignment=off`,
        );
      }
    }
  } finally {
    await Promise.all(createdFiles.map((filePath) => rm(filePath)));
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

await auditOxlintCoverage();
await auditTypescriptCoverage();

if (diagnostics.length > 0) {
  console.error(diagnostics.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    "Config coverage audit passed: typed .mts/.cts oxlint rules, untyped tooling, and TypeScript production includes.",
  );
}
