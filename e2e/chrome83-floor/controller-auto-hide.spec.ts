import { test, expect } from "@playwright/test";

test.describe("internal controller harness — auto-hide", () => {
  test("상호작용이 없으면 autoHideDelay 후 visibility가 hidden으로 전환된다", async ({
    page,
  }) => {
    await page.goto("/");

    await expect
      .poll(() =>
        page.evaluate(
          () => window.__scrollaControllerAutoHide?.getState().visibility,
        ),
      )
      .toBe("visible");

    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.__scrollaControllerAutoHide?.getState().visibility,
          ),
        { timeout: 5_000, intervals: [100] },
      )
      .toBe("hidden");
  });

  test("holder hover 중에는 hidden으로 전환되지 않는다", async ({ page }) => {
    await page.goto("/");
    const holder = page.getByTestId("harness-holder-auto-hide");
    await holder.hover();

    await page.waitForTimeout(600);

    const visibility = await page.evaluate(
      () => window.__scrollaControllerAutoHide?.getState().visibility,
    );
    expect(visibility).toBe("visible");
  });
});
