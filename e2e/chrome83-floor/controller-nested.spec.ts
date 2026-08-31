import { test, expect } from "@playwright/test";

test.describe("internal controller harness — nested scroll", () => {
  test("내부 scroller가 바닥에 닿으면 이후 wheel이 외부 scroller로 chaining된다", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(
      () =>
        window.__scrollaControllerNestedInner?.getState().overflow.vertical ===
        true,
    );

    const innerScroller = page.locator(
      '[data-testid="harness-holder-inner"] .scrolla__scroller',
    );
    await innerScroller.hover();

    const innerMax = await page.evaluate(
      () => window.__scrollaControllerNestedInner?.getState().maxPosition.y ?? 0,
    );
    await page.mouse.wheel(0, innerMax + 500);

    await expect
      .poll(() =>
        page.evaluate(
          () => window.__scrollaControllerNestedInner?.getState().position.y ?? -1,
        ),
      )
      .toBe(innerMax);

    const outerBefore = await page.evaluate(
      () => window.__scrollaControllerNestedOuter?.getState().position.y ?? -1,
    );
    await page.mouse.wheel(0, 300);

    await expect
      .poll(() =>
        page.evaluate(
          () => window.__scrollaControllerNestedOuter?.getState().position.y ?? -1,
        ),
      )
      .toBeGreaterThan(outerBefore);
  });
});
