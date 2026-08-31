import { test, expect } from "@playwright/test";

test.describe("internal controller harness", () => {
  test("core controller를 로드하고 scrollTo API로 상태가 바뀐다", async ({
    page,
  }) => {
    await page.goto("/");

    const holder = page.getByTestId("harness-holder");
    await expect(holder).toBeVisible();

    const initialTop = await page.evaluate(
      () =>
        (
          document.querySelector(
            '[data-testid="harness-holder"] .scrolla__scroller',
          ) as HTMLElement | null
        )?.scrollTop ?? -1,
    );
    expect(initialTop).toBe(0);

    await page.evaluate(() => {
      window.__scrollaController?.scrollTo({ y: 200 });
    });

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              document.querySelector(
                '[data-testid="harness-holder"] .scrolla__scroller',
              ) as HTMLElement | null
            )?.scrollTop ?? -1,
        ),
      )
      .toBeGreaterThan(0);
  });
});
