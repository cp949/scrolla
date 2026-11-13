import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { PackageAuditError, auditPackage } from "../scripts/package-audit.mjs";

const fixturesDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/package-audit",
);

async function diagnosticsFor(fixtureName: string) {
  try {
    await auditPackage(resolve(fixturesDirectory, fixtureName), {
      artifactDirectory: "package-artifacts",
    });
  } catch (error) {
    expect(error).toBeInstanceOf(PackageAuditError);
    return (error as PackageAuditError).diagnostics;
  }

  throw new Error(`${fixtureName} fixture가 위반을 진단하지 않았습니다.`);
}

function expectDiagnostic(
  diagnostics: Awaited<ReturnType<typeof diagnosticsFor>>,
  code: string,
  category: string,
  path?: string,
) {
  expect(diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        category,
        code,
        ...(path === undefined ? {} : { path }),
      }),
    ]),
  );
}

describe("auditPackage", () => {
  test("ES2019 parser보다 최신인 optional chaining이 배포되면 syntax 진단을 낸다", async () => {
    const diagnostics = await diagnosticsFor("violations");
    expectDiagnostic(
      diagnostics,
      "JS_SYNTAX_UNSUPPORTED",
      "syntax",
      "package-artifacts/optional-chaining.js",
    );
  });

  test("ES2019 parser보다 최신인 nullish coalescing이 배포되면 syntax 진단을 낸다", async () => {
    const diagnostics = await diagnosticsFor("violations");
    expectDiagnostic(
      diagnostics,
      "JS_SYNTAX_UNSUPPORTED",
      "syntax",
      "package-artifacts/nullish-coalescing.mjs",
    );
  });

  test.each([
    ["JS_ARRAY_AT", "ecmascript-api"],
    ["JS_ARRAY_FIND_LAST", "ecmascript-api"],
    ["JS_CRYPTO_RANDOM_UUID", "web-api"],
    ["JS_STRUCTURED_CLONE", "web-api"],
    ["JS_SCROLLEND", "web-api"],
  ])(
    "Chrome 75에 없는 runtime 기능이 배포되면 %s 진단을 낸다",
    async (code, category) => {
      const diagnostics = await diagnosticsFor("violations");
      expectDiagnostic(
        diagnostics,
        code,
        category,
        "package-artifacts/runtime.cjs",
      );
    },
  );

  test.each([
    ["CSS_LAYER", "package-artifacts/styles.css"],
    ["CSS_APPEARANCE_PREFIX", "package-artifacts/styles.css"],
    ["CSS_MISSING_POINTER_EVENTS_NONE", "package-artifacts/styles.css"],
    ["CSS_CUSTOM_PROPERTY_FALLBACK", "package-artifacts/styles.css"],
    ["CSS_REDUCED_MOTION_FADE_DURATION", "package-artifacts/styles.css"],
  ])("Chrome 75 CSS 계약을 위반하면 %s 진단을 낸다", async (code, path) => {
    const diagnostics = await diagnosticsFor("violations");
    expectDiagnostic(diagnostics, code, "css", path);
  });

  test.each([
    ["CORE_REACT_STATIC_IMPORT", "src/core/static.ts"],
    ["CORE_REACT_DYNAMIC_IMPORT", "src/core/dynamic.ts"],
    ["CORE_REACT_REQUIRE", "src/core/require.ts"],
  ])("core에 React 의존 형식이 들어오면 %s 진단을 낸다", async (code, path) => {
    const diagnostics = await diagnosticsFor("violations");
    expectDiagnostic(diagnostics, code, "architecture", path);
  });

  test("core .mts production module의 React dynamic import를 진단한다", async () => {
    const diagnostics = await diagnosticsFor("violations");
    expectDiagnostic(
      diagnostics,
      "CORE_REACT_DYNAMIC_IMPORT",
      "architecture",
      "src/core/module.mts",
    );
  });

  test("core .cts production module의 React require를 진단한다", async () => {
    const diagnostics = await diagnosticsFor("violations");
    expectDiagnostic(
      diagnostics,
      "CORE_REACT_REQUIRE",
      "architecture",
      "src/core/common.cts",
    );
  });

  test.each([
    ["PUBLIC_CORE_DECLARATION_EXPORT", "package-artifacts/index.d.ts"],
    ["PUBLIC_CORE_PACKAGE_EXPORT", "package.json"],
  ])("core가 공개 표면에 노출되면 %s 진단을 낸다", async (code, path) => {
    const diagnostics = await diagnosticsFor("violations");
    expectDiagnostic(diagnostics, code, "architecture", path);
  });

  test.each([
    ["PUBLIC_CORE_DECLARATION_FILE", "package-artifacts/core/index.d.ts"],
    ["PUBLIC_CORE_SOURCEMAP_CONTENT", "package-artifacts/index.js.map"],
  ])(
    "core가 package artifact에 물리적으로 남으면 %s 진단을 낸다",
    async (code, path) => {
      const diagnostics = await diagnosticsFor("violations");
      expectDiagnostic(diagnostics, code, "architecture", path);
    },
  );

  test("공개 client entry 최상단에 'use client'가 없으면 PUBLIC_CLIENT_ENTRY_MISSING_USE_CLIENT 진단을 낸다", async () => {
    const diagnostics = await diagnosticsFor("violations");
    expectDiagnostic(
      diagnostics,
      "PUBLIC_CLIENT_ENTRY_MISSING_USE_CLIENT",
      "client-boundary",
      "package-artifacts/index.js",
    );
  });

  test.each([
    ["missing-js", "MISSING_JS_TARGET", "javascript"],
    ["missing-declaration", "MISSING_DECLARATION_TARGET", "declaration"],
    ["missing-css", "MISSING_CSS_TARGET", "css"],
  ])(
    "%s artifact 집합을 0개 성공으로 통과시키지 않는다",
    async (fixture, code, category) => {
      const diagnostics = await diagnosticsFor(fixture);
      expectDiagnostic(diagnostics, code, category);
    },
  );

  test("core declaration .d.mts와 .d.cts를 production source target에서 제외한다", async () => {
    await expect(
      auditPackage(resolve(fixturesDirectory, "clean"), {
        artifactDirectory: "package-artifacts",
      }),
    ).resolves.toEqual({
      diagnostics: [],
      targets: {
        core: 1,
        css: 1,
        declarations: 1,
        javascript: 1,
        sourcemaps: 1,
      },
    });
  });
});
