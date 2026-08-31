import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
import { describe, expect, test } from "vitest";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stylesPath = resolve(packageDirectory, "src/styles.scss");

describe(".browserslistrc", () => {
  test("Chrome 75 기준만 적용하고 다른 엔진 prefix는 추가하지 않는다", async () => {
    const css = ".probe { appearance: none; }";

    const result = await postcss([autoprefixer()]).process(css, {
      from: stylesPath,
    });

    expect(result.css).toContain("-webkit-appearance: none");
    expect(result.css).not.toContain("-moz-appearance");
  });
});
