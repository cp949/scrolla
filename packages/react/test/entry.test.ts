import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("공개 entry의 'use client' 경계", () => {
  test("src/index.ts는 첫 statement로 'use client'를 선언한다", () => {
    const source = readFileSync(
      resolve(packageDirectory, "src/index.ts"),
      "utf8",
    );

    expect(source.trimStart().startsWith('"use client";')).toBe(true);
  });

  test("core production code에는 'use client' directive가 없다", () => {
    const source = readFileSync(
      resolve(packageDirectory, "src/core/index.ts"),
      "utf8",
    );

    expect(source.includes("use client")).toBe(false);
  });
});
