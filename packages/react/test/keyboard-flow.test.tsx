// @vitest-environment jsdom

/**
 * mock 없는 real core로 `Scrolla`를 렌더링해 keyboard-only flow 전체
 * (thumb focus -> keydown -> native scroll -> ARIA 갱신 -> focus 유지)가 실제로
 * 이어지는지 검증한다. Scrolla.test.tsx(controller mock)와 controller.test.ts(React 없이
 * core만)는 각 layer를 분리해서만 확인하므로 이 통합 경로는 여기서 처음 검증한다.
 */
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Scrolla } from "../src/Scrolla.js";

function installFrameDriver(targetWindow: Window) {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback) => {
    const handle = nextHandle;
    nextHandle += 1;
    callbacks.set(handle, callback);
    return handle;
  });
  const cancel = vi.fn((handle: number) => {
    callbacks.delete(handle);
  });

  Object.defineProperties(targetWindow, {
    requestAnimationFrame: { configurable: true, value: request },
    cancelAnimationFrame: { configurable: true, value: cancel },
  });

  return {
    callbacks,
    runNext() {
      const frame = callbacks.entries().next().value;
      if (frame === undefined) {
        throw new Error("실행할 frame이 없습니다.");
      }
      const [handle, callback] = frame;
      callbacks.delete(handle);
      callback(0);
    },
  };
}

/** controller.test.ts의 installGeometryMetrics/installNativePosition과 같은 stub이다. */
function installVerticalOverflowGeometry(holder: HTMLElement) {
  const scroller = holder.querySelector(".scrolla__scroller") as HTMLElement;
  const trackVertical = holder.querySelector(
    ".scrolla__track--vertical",
  ) as HTMLElement;
  const trackHorizontal = holder.querySelector(
    ".scrolla__track--horizontal",
  ) as HTMLElement;

  Object.defineProperties(scroller, {
    clientWidth: { configurable: true, value: 100 },
    clientHeight: { configurable: true, value: 200 },
    scrollWidth: { configurable: true, value: 100 },
    scrollHeight: { configurable: true, value: 800 },
  });
  trackVertical.getBoundingClientRect = () =>
    ({
      left: 90,
      top: 0,
      right: 100,
      bottom: 100,
      width: 10,
      height: 100,
    }) as DOMRect;
  trackHorizontal.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 190,
      right: 100,
      bottom: 200,
      width: 100,
      height: 10,
    }) as DOMRect;

  let position = { x: 0, y: 0 };
  Object.defineProperties(scroller, {
    scrollLeft: {
      configurable: true,
      get: () => position.x,
      set: (value: number) => {
        position = { ...position, x: value };
      },
    },
    scrollTop: {
      configurable: true,
      get: () => position.y,
      set: (value: number) => {
        position = { ...position, y: value };
      },
    },
  });
}

afterEach(() => {
  cleanup();
});

describe("keyboard-only flow 통합 검증", () => {
  it("thumb focus 후 ArrowDown이 native scroll을 일으키고 ARIA value를 갱신하며 focus를 유지한다", () => {
    const frameDriver = installFrameDriver(window);
    const { container } = render(<Scrolla />);
    const holder = container.firstElementChild as HTMLElement;
    installVerticalOverflowGeometry(holder);

    act(() => {
      frameDriver.runNext();
    });

    const thumbVertical = holder.querySelector(
      ".scrolla__thumb--vertical",
    ) as HTMLElement;
    expect(thumbVertical.tabIndex).toBe(0);
    expect(thumbVertical.getAttribute("aria-valuenow")).toBe("0");

    act(() => {
      thumbVertical.focus();
    });
    expect(document.activeElement).toBe(thumbVertical);

    const keydown = fireEvent.keyDown(thumbVertical, { key: "ArrowDown" });
    act(() => {
      frameDriver.runNext();
    });

    expect(thumbVertical.getAttribute("aria-valuenow")).toBe("40");
    expect(thumbVertical.getAttribute("aria-valuemax")).toBe("600");
    expect(document.activeElement).toBe(thumbVertical);
    expect(keydown).toBe(false);
  });
});
