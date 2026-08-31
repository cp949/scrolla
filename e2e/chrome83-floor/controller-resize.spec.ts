import { test, expect } from "@playwright/test";

test.describe("internal controller harness — resize/content 변화", () => {
  test("content 높이가 viewport 이하로 줄면 vertical overflow가 재측정으로 해제된다", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(
      () => window.__scrollaController?.getState().overflow.vertical === true,
    );

    // .scrolla__content에 min-height: 100%(packages/react/src/_layout.scss)가
    // 있어서 150px는 그대로 적용되지 않고 홀더 높이(200px)로 clamp된다. 그래도
    // 이 테스트는 유효하다 — 실제로 800px에서 200px로 줄어들고, 그 결과로
    // ResizeObserver 재측정이 실제로 일어나 vertical overflow가 해제되는지를
    // 검증하기 때문이다.
    await page.evaluate(() => {
      const content = document.querySelector(
        '[data-testid="harness-holder"] .scrolla__content',
      );
      if (content instanceof HTMLElement) {
        content.style.height = "150px";
      }
    });

    await expect
      .poll(() =>
        page.evaluate(
          () => window.__scrollaController?.getState().overflow.vertical,
        ),
      )
      .toBe(false);
    await expect
      .poll(() =>
        page.evaluate(
          () => window.__scrollaController?.getState().maxPosition.y ?? -1,
        ),
      )
      .toBe(0);
  });
});
