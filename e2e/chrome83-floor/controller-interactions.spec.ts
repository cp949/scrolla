import { test, expect } from "@playwright/test";
import { cdpPointerDrag } from "./helpers/cdp-pointer-drag";

test.describe("internal controller harness — pointer interaction", () => {
  test("thumb pointer drag로 vertical scroll position이 바뀐다", async ({
    page,
  }) => {
    await page.goto("/");

    await page.waitForFunction(
      () => window.__scrollaController?.getState().overflow.vertical === true,
    );

    const thumb = page.locator(
      '[data-testid="harness-holder"] .scrolla__thumb--vertical',
    );
    const box = await thumb.boundingBox();
    if (box === null) {
      throw new Error("vertical thumb의 bounding box를 찾을 수 없습니다.");
    }

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    const endY = startY + 100;

    // Chrome83 DevTools Protocol setInterceptDrags 미지원 우회
    await cdpPointerDrag(page, { x: startX, y: startY }, { x: startX, y: endY });

    await expect
      .poll(() =>
        page.evaluate(() => window.__scrollaController?.getState().position.y ?? -1),
      )
      .toBeGreaterThan(0);
  });

  test("track jump 클릭으로 thumb 밖 위치가 즉시 이동한다", async ({ page }) => {
    await page.goto("/");

    await page.waitForFunction(
      () => window.__scrollaController?.getState().overflow.vertical === true,
    );

    const track = page.locator(
      '[data-testid="harness-holder"] .scrolla__track--vertical',
    );
    const trackBox = await track.boundingBox();
    if (trackBox === null) {
      throw new Error("vertical track의 bounding box를 찾을 수 없습니다.");
    }

    const thumb = page.locator(
      '[data-testid="harness-holder"] .scrolla__thumb--vertical',
    );
    const thumbBox = await thumb.boundingBox();
    if (thumbBox === null) {
      throw new Error("vertical thumb의 bounding box를 찾을 수 없습니다.");
    }

    // 세로 트랙의 중앙 x, thumb 아래 안전한 y 좌표
    const clickX = trackBox.x + trackBox.width / 2;
    const clickY = thumbBox.y + thumbBox.height + 10;

    // CDP 세션이 아니라 Playwright의 trusted page.mouse.click을 쓴다(실제 마우스
    // 이벤트로 인식되는 클릭). pointer drag 테스트만 Chrome83의 CDP
    // setInterceptDrags 미지원을 우회하려고 저수준 CDP(cdpPointerDrag)를 쓴다.
    await page.mouse.click(clickX, clickY);

    await expect
      .poll(() =>
        page.evaluate(() => window.__scrollaController?.getState().position.y ?? -1),
      )
      .toBeGreaterThan(0);
  });

  test("mouse wheel이 native scroll을 발생시키고 core가 이를 반영한다", async ({
    page,
  }) => {
    await page.goto("/");
    const scroller = page.locator(
      '[data-testid="harness-holder"] .scrolla__scroller',
    );
    await scroller.hover();
    await page.mouse.wheel(0, 300);

    await expect
      .poll(() =>
        page.evaluate(() => window.__scrollaController?.getState().position.y ?? -1),
      )
      .toBeGreaterThan(0);
  });

  test("keyboard ArrowDown/PageDown/Home/End가 focus된 vertical thumb를 이동시킨다", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForFunction(
      () => window.__scrollaController?.getState().overflow.vertical === true,
    );

    const thumb = page.locator(
      '[data-testid="harness-holder"] .scrolla__thumb--vertical',
    );
    await thumb.focus();

    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() =>
        page.evaluate(() => window.__scrollaController?.getState().position.y ?? -1),
      )
      .toBe(40);

    await page.keyboard.press("End");
    const maxY = await page.evaluate(
      () => window.__scrollaController?.getState().maxPosition.y ?? -1,
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.__scrollaController?.getState().position.y ?? -1),
      )
      .toBe(maxY);

    await page.keyboard.press("Home");
    await expect
      .poll(() =>
        page.evaluate(() => window.__scrollaController?.getState().position.y ?? -1),
      )
      .toBe(0);

    // PageDown은 viewportHeight만큼 이동한다 (ArrowDown의 고정값 40과는 다름)
    // 이 값은 core 자체 측정값(getState().viewportSize.height)이 아니라 DOM에서
    // 독립적으로 읽는다 — core의 측정 로직 자체에 버그가 있어도 이 assertion이
    // core와 "우연히 일치"해서 버그를 놓치지 않도록 의도적으로 core와 무관한
    // 소스를 쓴다.
    const viewportHeight = await page.evaluate(() => {
      const scroller = document.querySelector(
        '[data-testid="harness-holder"] .scrolla__scroller',
      ) as HTMLElement | null;
      return scroller?.getBoundingClientRect().height ?? -1;
    });

    await page.keyboard.press("PageDown");
    const expectedPositionAfterPageDown = Math.min(viewportHeight, maxY);
    await expect
      .poll(() =>
        page.evaluate(() => window.__scrollaController?.getState().position.y ?? -1),
      )
      .toBe(expectedPositionAfterPageDown);
  });
});
