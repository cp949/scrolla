import { test, expect } from "@playwright/test";

test.describe("internal controller harness — RTL", () => {
  test("explicit direction=rtl은 초기 logical position.x가 0이고 effective direction이 rtl이다", async ({
    page,
  }) => {
    await page.goto("/");

    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__scrollaIngressRtl?.getEffectiveDirection(),
        ),
      )
      .toBe("rtl");

    const initialX = await page.evaluate(
      () => window.__scrollaControllerRtl?.getState().position.x ?? -1,
    );
    expect(initialX).toBe(0);
  });

  test("RTL에서 ArrowLeft는 logical position.x를 증가시킨다", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(
      () =>
        window.__scrollaControllerRtl?.getState().overflow.horizontal === true,
    );

    const thumb = page.locator(
      '[data-testid="harness-holder-rtl"] .scrolla__thumb--horizontal',
    );
    await thumb.focus();
    await page.keyboard.press("ArrowLeft");

    await expect
      .poll(() =>
        page.evaluate(
          () => window.__scrollaControllerRtl?.getState().position.x ?? -1,
        ),
      )
      .toBeGreaterThan(0);
  });
});
