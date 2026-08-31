import { expect, test } from "@playwright/test";
import matrix from "../../../packages/react/test/consumer-contract/matrix.json";
import { cdpPointerDrag } from "./cdp-pointer-drag.js";

export function registerReactConsumerContracts(): void {
  for (const consumer of matrix.reactConsumers) {
    const baseURL = `http://127.0.0.1:${consumer.browser.port}`;

    test.describe(`packed tarball 기준 ${consumer.id} consumer contract`, () => {
      test("packed tarball consumer가 로드된다", async ({ page }) => {
        await page.goto(baseURL);
        await expect(
          page.locator(`[aria-label="${consumer.browser.ariaLabel}"]`),
        ).toBeVisible();
      });

      test("scrollTo 뒤 onStateChange가 position 200을 반영한다", async ({
        page,
      }) => {
        await page.goto(baseURL);
        await page.getByTestId("scroll-to-200").click();
        await expect
          .poll(async () =>
            Number(await page.getByTestId("last-position-y").textContent()),
          )
          .toBe(200);
      });

      test("thumb pointer drag가 실제 scroll에 반영된다", async ({ page }) => {
        await page.goto(baseURL);
        const holder = page.locator(
          `[aria-label="${consumer.browser.ariaLabel}"]`,
        );
        await expect(holder).toBeVisible();
        const thumb = holder.locator(".scrolla__thumb--vertical");
        const box = await thumb.boundingBox();
        if (box === null) {
          throw new Error("vertical thumb의 bounding box를 찾을 수 없습니다.");
        }
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;
        // Chrome83 DevTools Protocol setInterceptDrags 미지원 우회
        await cdpPointerDrag(
          page,
          { x: startX, y: startY },
          { x: startX, y: startY + 100 },
        );
        await expect(page.getByTestId("last-position-y")).not.toHaveText("0");
      });
    });
  }
}
