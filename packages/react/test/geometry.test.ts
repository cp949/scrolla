import { describe, expect, test } from "vitest";
import {
  calculateAxisGeometry,
  type AxisGeometry,
  type AxisGeometryInput,
} from "../src/core/geometry.js";

const overflowingInput: AxisGeometryInput = {
  axisEnabled: true,
  measurable: true,
  viewportLength: 100,
  contentLength: 400,
  trackLength: 80.5,
  position: 150,
  minThumbSize: 24,
};

describe("calculateAxisGeometry", () => {
  test("fractional ideal thumb와 middle position을 계산한다", () => {
    expect(
      calculateAxisGeometry({
        axisEnabled: true,
        measurable: true,
        viewportLength: 300,
        contentLength: 400,
        trackLength: 100.5,
        position: 50,
        minThumbSize: 24,
      }),
    ).toEqual({
      viewportLength: 300,
      contentLength: 400,
      position: 50,
      maxPosition: 100,
      overflow: true,
      thumbLength: 75.375,
      thumbOffset: 12.5625,
    });
  });

  test("극단적인 finite metric에서도 thumb offset을 finite로 유지한다", () => {
    const result = calculateAxisGeometry({
      axisEnabled: true,
      measurable: true,
      viewportLength: 1,
      contentLength: Number.MAX_VALUE,
      trackLength: Number.MAX_VALUE,
      position: Number.MAX_VALUE,
      minThumbSize: 0,
    });

    expect(result).toEqual({
      viewportLength: 1,
      contentLength: Number.MAX_VALUE,
      position: Number.MAX_VALUE,
      maxPosition: Number.MAX_VALUE,
      overflow: true,
      thumbLength: 1,
      thumbOffset: Number.MAX_VALUE,
    });
    expect(Number.isFinite(result.thumbOffset)).toBe(true);
  });

  test("극단적인 finite metric에서도 ideal thumb 계산을 overflow시키지 않는다", () => {
    const result = calculateAxisGeometry({
      axisEnabled: true,
      measurable: true,
      viewportLength: Number.MAX_VALUE / 4,
      contentLength: Number.MAX_VALUE / 2,
      trackLength: Number.MAX_VALUE,
      position: Number.MAX_VALUE / 8,
      minThumbSize: 0,
    });

    expect(result.thumbLength).toBe(Number.MAX_VALUE / 2);
    expect(result.thumbOffset).toBe(Number.MAX_VALUE / 4);
    expect(Number.isFinite(result.thumbLength)).toBe(true);
    expect(Number.isFinite(result.thumbOffset)).toBe(true);
  });

  test.each([
    [-10, 0, 0],
    [150, 150, 28.25],
    [500, 300, 56.5],
  ] as const)(
    "position %d를 [0, maxPosition]으로 clamp한다",
    (position, expectedPosition, expectedOffset) => {
      expect(calculateAxisGeometry({ ...overflowingInput, position })).toEqual({
        viewportLength: 100,
        contentLength: 400,
        position: expectedPosition,
        maxPosition: 300,
        overflow: true,
        thumbLength: 24,
        thumbOffset: expectedOffset,
      });
    },
  );

  test("min thumb가 track보다 크면 track 길이와 zero travel을 반환한다", () => {
    expect(
      calculateAxisGeometry({
        axisEnabled: true,
        measurable: true,
        viewportLength: 100,
        contentLength: 400,
        trackLength: 12,
        position: 150,
        minThumbSize: 24,
      }),
    ).toEqual({
      viewportLength: 100,
      contentLength: 400,
      position: 150,
      maxPosition: 300,
      overflow: true,
      thumbLength: 12,
      thumbOffset: 0,
    });
  });

  test.each([
    [
      "같은 길이",
      {
        axisEnabled: true,
        measurable: true,
        viewportLength: 100,
        contentLength: 100,
        trackLength: 80,
        position: 20,
        minThumbSize: 24,
      },
      {
        viewportLength: 100,
        contentLength: 100,
        position: 0,
        maxPosition: 0,
        overflow: false,
        thumbLength: 0,
        thumbOffset: 0,
      },
    ],
    [
      "빈 content",
      {
        axisEnabled: true,
        measurable: true,
        viewportLength: 100,
        contentLength: 0,
        trackLength: 80,
        position: 20,
        minThumbSize: 24,
      },
      {
        viewportLength: 100,
        contentLength: 0,
        position: 0,
        maxPosition: 0,
        overflow: false,
        thumbLength: 0,
        thumbOffset: 0,
      },
    ],
    [
      "disabled axis",
      {
        axisEnabled: false,
        measurable: true,
        viewportLength: 100,
        contentLength: 400,
        trackLength: 80,
        position: 150,
        minThumbSize: 24,
      },
      {
        viewportLength: 100,
        contentLength: 400,
        position: 0,
        maxPosition: 0,
        overflow: false,
        thumbLength: 0,
        thumbOffset: 0,
      },
    ],
    [
      "unmeasurable axis",
      {
        axisEnabled: true,
        measurable: false,
        viewportLength: 100,
        contentLength: 400,
        trackLength: 80,
        position: 150,
        minThumbSize: 24,
      },
      {
        viewportLength: 0,
        contentLength: 0,
        position: 0,
        maxPosition: 0,
        overflow: false,
        thumbLength: 0,
        thumbOffset: 0,
      },
    ],
    [
      "zero viewport",
      {
        axisEnabled: true,
        measurable: true,
        viewportLength: 0,
        contentLength: 400,
        trackLength: 80,
        position: 150,
        minThumbSize: 24,
      },
      {
        viewportLength: 0,
        contentLength: 0,
        position: 0,
        maxPosition: 0,
        overflow: false,
        thumbLength: 0,
        thumbOffset: 0,
      },
    ],
    [
      "zero track",
      {
        axisEnabled: true,
        measurable: true,
        viewportLength: 100,
        contentLength: 400,
        trackLength: 0,
        position: 150,
        minThumbSize: 24,
      },
      {
        viewportLength: 0,
        contentLength: 0,
        position: 0,
        maxPosition: 0,
        overflow: false,
        thumbLength: 0,
        thumbOffset: 0,
      },
    ],
  ] as const)("%s는 zero geometry 규칙을 따른다", (_name, input, expected) => {
    expect(calculateAxisGeometry(input)).toEqual(expected);
  });

  test.each([
    ["viewport", -1, 400, 80.5, 0, 0],
    ["viewport", Number.NaN, 400, 80.5, 0, 0],
    ["viewport", Number.POSITIVE_INFINITY, 400, 80.5, 0, 0],
    ["viewport", Number.NEGATIVE_INFINITY, 400, 80.5, 0, 0],
    ["viewport", -0, 400, 80.5, 0, 0],
    ["content", 100, -1, 80.5, 100, 0],
    ["content", 100, Number.NaN, 80.5, 100, 0],
    ["content", 100, Number.POSITIVE_INFINITY, 80.5, 100, 0],
    ["content", 100, Number.NEGATIVE_INFINITY, 80.5, 100, 0],
    ["content", 100, -0, 80.5, 100, 0],
    ["track", 100, 400, -1, 0, 0],
    ["track", 100, 400, Number.NaN, 0, 0],
    ["track", 100, 400, Number.POSITIVE_INFINITY, 0, 0],
    ["track", 100, 400, Number.NEGATIVE_INFINITY, 0, 0],
    ["track", 100, 400, -0, 0, 0],
  ] as const)(
    "%s의 invalid DOM metric을 canonical zero로 만든다",
    (
      _metric,
      viewportLength,
      contentLength,
      trackLength,
      expectedViewport,
      expectedContent,
    ) => {
      expect(
        calculateAxisGeometry({
          axisEnabled: true,
          measurable: true,
          viewportLength,
          contentLength,
          trackLength,
          position: 150,
          minThumbSize: 24,
        }),
      ).toMatchObject({
        viewportLength: expectedViewport,
        contentLength: expectedContent,
        position: 0,
        maxPosition: 0,
        overflow: false,
        thumbLength: 0,
        thumbOffset: 0,
      });
    },
  );

  test("axis 방향 이름 없이 동일한 입력에 동일한 frozen 결과를 반환한다", () => {
    const horizontal = calculateAxisGeometry(overflowingInput);
    const vertical = calculateAxisGeometry({ ...overflowingInput });

    expect(vertical).toEqual(horizontal);
    expect(Object.isFrozen(horizontal)).toBe(true);
  });

  test("결과의 수치와 overflow를 frozen snapshot으로 반환한다", () => {
    const result: AxisGeometry = calculateAxisGeometry(overflowingInput);

    expect(result).toEqual({
      viewportLength: 100,
      contentLength: 400,
      position: 150,
      maxPosition: 300,
      overflow: true,
      thumbLength: 24,
      thumbOffset: 28.25,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });
});
