// @vitest-environment jsdom

import { describe, expect, test } from "vitest";
import { resolveEffectiveDirection } from "../src/core/rtl/direction.js";

describe("resolveEffectiveDirection", () => {
  test("explicit ltr는 computed style과 무관하게 ltr를 반환한다", () => {
    const scroller = document.createElement("div");
    scroller.style.direction = "rtl";
    document.body.append(scroller);

    expect(resolveEffectiveDirection("ltr", scroller)).toBe("ltr");

    scroller.remove();
  });

  test("explicit rtl는 computed style과 무관하게 rtl를 반환한다", () => {
    const scroller = document.createElement("div");
    document.body.append(scroller);

    expect(resolveEffectiveDirection("rtl", scroller)).toBe("rtl");

    scroller.remove();
  });

  test("auto는 자체 inline style이 없으면 기본 ltr computed style을 따른다", () => {
    const scroller = document.createElement("div");
    document.body.append(scroller);

    expect(resolveEffectiveDirection("auto", scroller)).toBe("ltr");

    scroller.remove();
  });

  test("auto는 scroller 자체의 inline direction computed style을 따른다", () => {
    const scroller = document.createElement("div");
    scroller.style.direction = "rtl";
    document.body.append(scroller);

    expect(resolveEffectiveDirection("auto", scroller)).toBe("rtl");

    scroller.remove();
  });

  test("ownerDocument에 defaultView가 없으면 computed style을 읽지 않고 ltr로 fallback한다", () => {
    const scroller = {
      ownerDocument: { defaultView: null },
    } as unknown as HTMLElement;

    expect(resolveEffectiveDirection("auto", scroller)).toBe("ltr");
  });
});
