// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import type { ScrollbarControllerElements } from "../src/core/index.js";
import {
  readGeometry,
  readNativePosition,
  writeNativePosition,
  writeThumbGeometry,
} from "../src/core/measurement.js";

function createElements(): ScrollbarControllerElements {
  const holder = document.createElement("div");
  const wrapper = document.createElement("div");
  const scroller = document.createElement("div");
  const content = document.createElement("div");
  const trackVertical = document.createElement("div");
  const thumbVertical = document.createElement("div");
  const trackHorizontal = document.createElement("div");
  const thumbHorizontal = document.createElement("div");

  holder.append(wrapper, trackVertical, trackHorizontal);
  wrapper.append(scroller);
  scroller.append(content);
  trackVertical.append(thumbVertical);
  trackHorizontal.append(thumbHorizontal);
  document.body.append(holder);

  return {
    holder,
    wrapper,
    scroller,
    content,
    trackVertical,
    thumbVertical,
    trackHorizontal,
    thumbHorizontal,
  };
}

describe("stateless DOM measurement helpers", () => {
  test("geometry read는 metric과 track rectangle을 고정 순서로 한 번씩 읽고 normalized 값을 반환한다", () => {
    const elements = createElements();
    const events: string[] = [];
    Object.defineProperty(elements.holder, "isConnected", {
      configurable: true,
      get() {
        events.push("connection");
        return true;
      },
    });
    Object.defineProperties(elements.scroller, {
      clientWidth: {
        configurable: true,
        get() {
          events.push("clientWidth");
          return 100;
        },
      },
      clientHeight: {
        configurable: true,
        get() {
          events.push("clientHeight");
          return 200;
        },
      },
      scrollWidth: {
        configurable: true,
        get() {
          events.push("scrollWidth");
          return 400;
        },
      },
      scrollHeight: {
        configurable: true,
        get() {
          events.push("scrollHeight");
          return 800;
        },
      },
    });
    elements.trackHorizontal.getBoundingClientRect = () => {
      events.push("horizontal rect");
      return {
        left: -20,
        top: 90,
        right: 999,
        bottom: 999,
        width: 80.5,
        height: 10,
      } as DOMRect;
    };
    elements.trackVertical.getBoundingClientRect = () => {
      events.push("vertical rect");
      return {
        left: 100,
        top: -20,
        right: -999,
        bottom: -999,
        width: 10,
        height: 100.5,
      } as DOMRect;
    };

    expect(readGeometry(elements)).toEqual({
      connected: true,
      viewportWidth: 100,
      viewportHeight: 200,
      contentWidth: 400,
      contentHeight: 800,
      horizontalTrackLength: 80.5,
      verticalTrackLength: 100.5,
      horizontalTrack: {
        left: -20,
        top: 90,
        right: 60.5,
        bottom: 100,
        width: 80.5,
        height: 10,
      },
      verticalTrack: {
        left: 100,
        top: -20,
        right: 110,
        bottom: 80.5,
        width: 10,
        height: 100.5,
      },
    });
    expect(events).toEqual([
      "connection",
      "clientWidth",
      "clientHeight",
      "scrollWidth",
      "scrollHeight",
      "horizontal rect",
      "vertical rect",
    ]);
  });

  test("geometry read는 invalid metric과 rectangle을 finite non-negative 값으로 정규화한다", () => {
    const elements = createElements();
    Object.defineProperties(elements.scroller, {
      clientWidth: { configurable: true, value: Number.NaN },
      clientHeight: { configurable: true, value: -1 },
      scrollWidth: { configurable: true, value: Number.POSITIVE_INFINITY },
      scrollHeight: { configurable: true, value: -0 },
    });
    elements.trackHorizontal.getBoundingClientRect = () =>
      ({ left: Number.NaN, top: -1, width: -20, height: 5 }) as DOMRect;
    elements.trackVertical.getBoundingClientRect = () =>
      ({ left: 2, top: 3, width: 4, height: Number.NaN }) as DOMRect;

    expect(readGeometry(elements)).toMatchObject({
      viewportWidth: 0,
      viewportHeight: 0,
      contentWidth: 0,
      contentHeight: 0,
      horizontalTrackLength: 0,
      verticalTrackLength: 0,
      horizontalTrack: {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
      },
      verticalTrack: {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
      },
    });
  });

  test("native position read/write는 두 physical scroll 좌표만 snapshot하고 기록한다", () => {
    const elements = createElements();
    elements.scroller.scrollLeft = -120.5;
    elements.scroller.scrollTop = 330.25;

    const position = readNativePosition(elements.scroller);

    expect(position).toEqual({ x: -120.5, y: 330.25 });
    expect(Object.isFrozen(position)).toBe(true);

    writeNativePosition(elements.scroller, { x: 45.5, y: 90.25 });
    expect(elements.scroller.scrollLeft).toBe(45.5);
    expect(elements.scroller.scrollTop).toBe(90.25);
  });

  test("thumb write는 지정한 축과 변경 필드만 inline style에 반영한다", () => {
    const elements = createElements();

    writeThumbGeometry(elements.thumbHorizontal, {
      axis: "horizontal",
      length: 24.5,
      offset: 10.25,
    });
    writeThumbGeometry(elements.thumbVertical, {
      axis: "vertical",
      offset: 12.75,
    });

    expect(elements.thumbHorizontal.style.width).toBe("24.5px");
    expect(elements.thumbHorizontal.style.height).toBe("");
    expect(elements.thumbHorizontal.style.transform).toBe(
      "translateX(10.25px)",
    );
    expect(elements.thumbVertical.style.width).toBe("");
    expect(elements.thumbVertical.style.height).toBe("");
    expect(elements.thumbVertical.style.transform).toBe("translateY(12.75px)");
  });
});
