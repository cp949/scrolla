import { describe, expect, test } from "vitest";
import {
  mirrorLogicalDelta,
  mirrorOffset,
} from "../src/core/rtl/mirror.js";

describe("mirrorOffset", () => {
  test("travel 범위 안에서 offset을 반대쪽 끝 기준으로 뒤집는다", () => {
    expect(mirrorOffset(0, 100)).toBe(100);
    expect(mirrorOffset(100, 100)).toBe(0);
    expect(mirrorOffset(30, 100)).toBe(70);
  });

  test("travel이 0 이하거나 non-finite면 0을 반환한다", () => {
    expect(mirrorOffset(30, 0)).toBe(0);
    expect(mirrorOffset(30, -10)).toBe(0);
    expect(mirrorOffset(Number.NaN, 100)).toBe(0);
    expect(mirrorOffset(30, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("mirrorLogicalDelta", () => {
  test("mirror가 아니면 physical delta를 그대로 반환한다", () => {
    expect(mirrorLogicalDelta(40, false)).toBe(40);
    expect(mirrorLogicalDelta(-40, false)).toBe(-40);
  });

  test("mirror면 부호를 반전한다 — 화면 방향은 보존하고 logical 증감만 반대가 된다", () => {
    expect(mirrorLogicalDelta(40, true)).toBe(-40);
    expect(mirrorLogicalDelta(-40, true)).toBe(40);
  });

  test("non-finite 입력은 0으로 clamp한다", () => {
    expect(mirrorLogicalDelta(Number.NaN, true)).toBe(0);
    expect(mirrorLogicalDelta(Number.POSITIVE_INFINITY, false)).toBe(0);
  });
});
