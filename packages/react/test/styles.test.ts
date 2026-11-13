import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import { compile } from "sass";
import { describe, expect, test } from "vitest";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stylesPath = resolve(packageDirectory, "src/styles.scss");

function compileRoot() {
  return postcss.parse(compile(stylesPath).css, { from: stylesPath });
}

function findRule(
  root: postcss.Root,
  selector: string,
  predicate: (rule: postcss.Rule) => boolean = () => true,
): postcss.Rule {
  let found: postcss.Rule | undefined;
  root.walkRules((rule) => {
    if (
      found === undefined &&
      rule.selectors.includes(selector) &&
      predicate(rule)
    ) {
      found = rule;
    }
  });
  if (found === undefined) {
    throw new Error(`selector를 찾을 수 없습니다: ${selector}`);
  }
  return found;
}

function declarationValues(rule: postcss.Rule, property: string): string[] {
  const values: string[] = [];
  rule.walkDecls(property, (declaration) => {
    values.push(declaration.value.trim());
  });
  return values;
}

describe("library styles", () => {
  test("styles.scss는 tokens/layout/track-thumb/auto-hide partial을 사용한다", () => {
    const result = compile(stylesPath);
    const loadedFileNames = result.loadedUrls
      .map((url) => url.pathname.split("/").at(-1))
      .sort();

    expect(loadedFileNames).toEqual(
      [
        "styles.scss",
        "_tokens.scss",
        "_layout.scss",
        "_track-thumb.scss",
        "_auto-hide.scss",
      ].sort(),
    );
  });

  test("stable track과 thumb selector는 pointer input을 아래 element로 통과시킨다", () => {
    const root = postcss.parse(compile(stylesPath).css, { from: stylesPath });
    const requiredSelectors = [".scrolla__track", ".scrolla__thumb"] as const;
    const pointerEventsBySelector = new Map<string, string>();

    root.walkRules((rule) => {
      const selectors = rule.selectors.map((selector) => selector.trim());
      rule.walkDecls("pointer-events", (declaration) => {
        for (const selector of requiredSelectors) {
          if (selectors.includes(selector)) {
            pointerEventsBySelector.set(selector, declaration.value);
          }
        }
      });
    });

    expect(pointerEventsBySelector).toEqual(
      new Map(requiredSelectors.map((selector) => [selector, "none"])),
    );
  });
});

describe("custom property와 stable class 배선", () => {
  test(".scrolla가 공개 custom property 7개를 literal 기본값으로 선언한다", () => {
    const root = compileRoot();
    const rule = findRule(root, ".scrolla");
    const values = Object.fromEntries(
      [
        "--scrolla-size",
        "--scrolla-track-color",
        "--scrolla-thumb-color",
        "--scrolla-thumb-hover-color",
        "--scrolla-thumb-active-color",
        "--scrolla-radius",
        "--scrolla-fade-duration",
      ].map((name) => [name, declarationValues(rule, name)]),
    );

    expect(values).toEqual({
      "--scrolla-size": ["12px"],
      "--scrolla-track-color": ["transparent"],
      "--scrolla-thumb-color": ["rgba(0, 0, 0, 0.35)"],
      "--scrolla-thumb-hover-color": ["rgba(0, 0, 0, 0.5)"],
      "--scrolla-thumb-active-color": ["rgba(0, 0, 0, 0.65)"],
      "--scrolla-radius": ["999px"],
      "--scrolla-fade-duration": ["160ms"],
    });
  });

  test("thumb-hover-color는 holder :hover 아래 thumb에 literal-then-var 이중 선언으로 배선된다", () => {
    const root = compileRoot();
    const rule = findRule(root, ".scrolla:hover .scrolla__thumb");
    const values = declarationValues(rule, "background-color");

    expect(values).toEqual([
      "rgba(0, 0, 0, 0.5)",
      "var(--scrolla-thumb-hover-color, rgba(0, 0, 0, 0.5))",
    ]);
  });

  test("thumb-active-color는 축별 data-dragging에 literal-then-var 이중 선언으로 배선되고 다른 축 thumb에 새지 않는다", () => {
    const root = compileRoot();
    const horizontal = findRule(
      root,
      ".scrolla[data-dragging=horizontal] .scrolla__thumb--horizontal",
    );
    const vertical = findRule(
      root,
      ".scrolla[data-dragging=vertical] .scrolla__thumb--vertical",
    );
    const expectedValues = [
      "rgba(0, 0, 0, 0.65)",
      "var(--scrolla-thumb-active-color, rgba(0, 0, 0, 0.65))",
    ];

    expect(declarationValues(horizontal, "background-color")).toEqual(
      expectedValues,
    );
    expect(declarationValues(vertical, "background-color")).toEqual(
      expectedValues,
    );
    expect(() =>
      findRule(
        root,
        ".scrolla[data-dragging=horizontal] .scrolla__thumb--vertical",
      ),
    ).toThrow();
    expect(() =>
      findRule(
        root,
        ".scrolla[data-dragging=vertical] .scrolla__thumb--horizontal",
      ),
    ).toThrow();
  });

  test("trackVertical은 direction과 무관하게 항상 물리적 오른쪽에 고정되고 좌우 반전 규칙이 없다", () => {
    const root = compileRoot();
    const rule = findRule(root, ".scrolla__track--vertical");

    expect(declarationValues(rule, "right")).toEqual(["0"]);
    expect(declarationValues(rule, "left")).toEqual([]);
    root.walkRules((candidate) => {
      for (const selector of candidate.selectors) {
        expect(selector.includes("dir=")).toBe(false);
      }
    });
  });

  test(".scrolla__thumb:focus-visible은 음수 outline-offset의 inset outline을 그린다", () => {
    const root = compileRoot();
    const rule = findRule(root, ".scrolla__thumb:focus-visible");

    const outlineOffsetValues = declarationValues(rule, "outline-offset");
    expect(outlineOffsetValues).toHaveLength(1);
    expect(Number.parseFloat(outlineOffsetValues[0] ?? "0")).toBeLessThan(0);

    const outlineValues = declarationValues(rule, "outline");
    expect(outlineValues).toHaveLength(1);
    expect(outlineValues[0]).not.toBe("none");
  });

  test("layout-critical selector는 inset shorthand를 쓰지 않는다", () => {
    const root = compileRoot();
    let insetCount = 0;
    root.walkDecls("inset", () => {
      insetCount += 1;
    });
    expect(insetCount).toBe(0);
  });

  test("어떤 declaration도 !important를 쓰지 않는다", () => {
    const root = compileRoot();
    let importantCount = 0;
    root.walkDecls((declaration) => {
      if (declaration.important) {
        importantCount += 1;
      }
    });
    expect(importantCount).toBe(0);
  });
});

describe("auto-hide opacity와 reduced-motion", () => {
  test("track/thumb는 fade-duration custom property로 opacity transition을 literal-then-var 이중 선언한다", () => {
    const root = compileRoot();
    const rule = findRule(
      root,
      ".scrolla__track",
      (candidate) => declarationValues(candidate, "opacity").length > 0,
    );

    expect(declarationValues(rule, "opacity")).toEqual(["1"]);
    expect(declarationValues(rule, "transition")).toEqual([
      "opacity 160ms",
      "opacity var(--scrolla-fade-duration, 160ms)",
    ]);
  });

  test("data-visibility=hidden은 track/thumb opacity를 0으로 만들고 display나 visibility는 건드리지 않는다", () => {
    const root = compileRoot();
    const rule = findRule(
      root,
      ".scrolla[data-visibility=hidden] .scrolla__track",
    );

    expect(
      rule.selectors.includes(
        ".scrolla[data-visibility=hidden] .scrolla__thumb",
      ),
    ).toBe(true);
    expect(declarationValues(rule, "opacity")).toEqual(["0"]);
    expect(declarationValues(rule, "display")).toEqual([]);
    expect(declarationValues(rule, "visibility")).toEqual([]);
  });

  test("prefers-reduced-motion: reduce는 fade transition-duration을 0으로 만든다", () => {
    const root = compileRoot();
    let reducedMotionDurations: string[] = [];

    root.walkAtRules("media", (atRule) => {
      if (!/prefers-reduced-motion\s*:\s*reduce/.test(atRule.params)) {
        return;
      }
      const rule = atRule.nodes?.find(
        (node): node is postcss.Rule =>
          node.type === "rule" &&
          node.selectors.includes(".scrolla__track") &&
          node.selectors.includes(".scrolla__thumb"),
      );
      if (rule !== undefined) {
        reducedMotionDurations = declarationValues(rule, "transition-duration");
      }
    });

    expect(reducedMotionDurations).toEqual(["0ms"]);
  });
});
