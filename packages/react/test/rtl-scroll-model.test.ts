// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";
import {
  getDocumentScrollLeftModel,
  getScrollLeftModel,
  toLogicalX,
  toRawScrollLeft,
  type ScrollProbeDocument,
  type ScrollProbeElement,
} from "../src/core/rtl/scroll-model.js";

function createStubProbeDocument(initialScrollLeft: number): {
  readonly doc: ScrollProbeDocument;
  readonly createElement: ReturnType<typeof vi.fn>;
  readonly appendChild: ReturnType<typeof vi.fn>;
  readonly removeChild: ReturnType<typeof vi.fn>;
  readonly created: ScrollProbeElement[];
} {
  const created: ScrollProbeElement[] = [];
  const createElement = vi.fn((): ScrollProbeElement => {
    const element: ScrollProbeElement = {
      dir: "",
      style: { cssText: "" },
      scrollLeft: created.length === 0 ? initialScrollLeft : 0,
      appendChild: vi.fn(),
    };
    created.push(element);
    return element;
  });
  const appendChild = vi.fn();
  const removeChild = vi.fn();
  const doc: ScrollProbeDocument = {
    createElement,
    body: { appendChild, removeChild },
  };
  return { doc, createElement, appendChild, removeChild, created };
}

describe("getScrollLeftModel", () => {
  test("초기 scrollLeft가 양수면 default 모델로 판정한다", () => {
    const { doc } = createStubProbeDocument(5);
    expect(getScrollLeftModel(doc)).toBe("default");
  });

  test("초기 scrollLeft가 0 이하면 negative 모델로 판정한다", () => {
    const { doc } = createStubProbeDocument(0);
    expect(getScrollLeftModel(doc)).toBe("negative");
  });

  test("probe element를 body에 붙였다가 측정 뒤 제거한다", () => {
    const { doc, appendChild, removeChild, created } =
      createStubProbeDocument(0);

    getScrollLeftModel(doc);

    expect(appendChild).toHaveBeenCalledExactlyOnceWith(created[0]);
    expect(removeChild).toHaveBeenCalledExactlyOnceWith(created[0]);
    expect(created[0]?.dir).toBe("rtl");
  });

  test("같은 document에 대한 반복 호출은 probe를 다시 만들지 않고 캐시된 값을 반환한다", () => {
    const { doc, createElement } = createStubProbeDocument(5);

    expect(getScrollLeftModel(doc)).toBe("default");
    expect(getScrollLeftModel(doc)).toBe("default");

    // probe는 outer/inner 2개 element를 만든다 — 캐시가 없다면 2회차 호출에서 2개 더 늘어난다.
    expect(createElement).toHaveBeenCalledTimes(2);
  });

  test("getDocumentScrollLeftModel은 실제 Document로 감지를 위임한다", () => {
    expect(getDocumentScrollLeftModel(document)).toBe("negative");
  });

  test("서로 다른 document는 독립적으로 감지한다", () => {
    const positive = createStubProbeDocument(5);
    const zero = createStubProbeDocument(0);

    expect(getScrollLeftModel(positive.doc)).toBe("default");
    expect(getScrollLeftModel(zero.doc)).toBe("negative");
  });
});

describe("toLogicalX / toRawScrollLeft", () => {
  test.each([
    ["default", 120, 0, 120],
    ["default", 0, 120, 120],
    ["default", 60, 60, 120],
    ["negative", 0, 0, 120],
    ["negative", -120, 120, 120],
    ["negative", -60, 60, 120],
  ] as const)(
    "%s 모델의 raw=%d는 maxPosition=%d 기준으로 logical=%d다",
    (model, raw, expectedLogical, maxPosition) => {
      expect(toLogicalX(raw, model, maxPosition)).toBe(expectedLogical);
    },
  );

  test.each(["default", "negative"] as const)(
    "%s 모델은 임의 logical 값을 raw로 왕복 변환해도 원래 값을 보존한다",
    (model) => {
      const maxPosition = 200;
      for (const logical of [0, 1, 87.5, 200]) {
        const raw = toRawScrollLeft(logical, model, maxPosition);
        expect(toLogicalX(raw, model, maxPosition)).toBeCloseTo(logical);
      }
    },
  );

  test.each(["default", "negative"] as const)(
    "%s 모델은 non-finite 입력을 0 기준으로 clamp한다",
    (model) => {
      expect(toLogicalX(Number.NaN, model, 100)).toBe(
        model === "default" ? 100 : 0,
      );
      expect(toRawScrollLeft(Number.POSITIVE_INFINITY, model, 100)).toBe(
        model === "default" ? 100 : 0,
      );
    },
  );
});
