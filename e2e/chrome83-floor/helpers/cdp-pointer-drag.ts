import type { Page } from "@playwright/test";

/**
 * Chrome83 DevTools Protocol의 setInterceptDrags 미지원 우회 헬퍼.
 * Playwright의 고수준 mouse API 대신 저수준 CDP Input.dispatchMouseEvent를 사용해
 * 신뢰할 수 있는 pointer drag 시뮬레이션을 실행한다.
 *
 * @param page Playwright page
 * @param from 드래그 시작 좌표 {x, y}
 * @param to 드래그 끝 좌표 {x, y}
 * @param steps mouseMoved 반복 단계 수 (기본값: 10)
 */
export async function cdpPointerDrag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps: number = 10,
): Promise<void> {
  const client = await page.context().newCDPSession(page);

  try {
    // mousePressed: 드래그 시작. buttons는 CDP 관례(예: puppeteer Mouse.down)를
    // 따라 눌린 버튼의 bitmask(1 = left)를 명시한다.
    await client.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: from.x,
      y: from.y,
      button: "left",
      buttons: 1,
      clickCount: 1,
    });

    // mouseMoved: 부드러운 이동 (steps단계로 보간)
    // buttons: 1을 명시하지 않으면 CDP가 기본값 0으로 처리해 브라우저가 만드는
    // 실제 pointermove 이벤트의 event.buttons(마우스가 눌린 채 움직이면 1)와
    // 어긋난다.
    for (let i = 1; i <= steps; i++) {
      const currentX = from.x + (to.x - from.x) * (i / steps);
      const currentY = from.y + (to.y - from.y) * (i / steps);
      await client.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: currentX,
        y: currentY,
        button: "left",
        buttons: 1,
      });
    }

    // mouseReleased: 드래그 종료. 버튼을 뗀 뒤이므로 buttons는 0(눌린 버튼 없음)이다.
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: to.x,
      y: to.y,
      button: "left",
      buttons: 0,
      clickCount: 1,
    });
  } finally {
    await client.detach();
  }
}
