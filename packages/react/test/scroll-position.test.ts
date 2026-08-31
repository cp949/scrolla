import { describe, expect, test } from "vitest";
import {
  addFiniteScrollDelta,
  normalizeLogicalPosition,
  normalizeScrollCommand,
} from "../src/core/scroll-position.js";

describe("normalizeLogicalPosition", () => {
  test.each([
    [25, 100, true, 25],
    [-1, 100, true, 0],
    [100, 100, true, 100],
    [101, 100, true, 100],
    [25, 100, false, 0],
    [Number.NaN, 100, true, 0],
    [Number.POSITIVE_INFINITY, 100, true, 0],
    [Number.NEGATIVE_INFINITY, 100, true, 0],
    [-0, 100, true, 0],
    [25, 0, true, 0],
    [25, -1, true, 0],
    [25, Number.NaN, true, 0],
    [25, Number.POSITIVE_INFINITY, true, 0],
  ])("%o, %o, %o -> %o", (value, maxPosition, overflow, expected) => {
    const result = normalizeLogicalPosition(value, maxPosition, overflow);

    expect(result).toBe(expected);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(Object.is(result, -0)).toBe(false);
  });
});

describe("normalizeScrollCommand", () => {
  test.each([
    [{}, {}],
    [{ x: 10 }, { x: 10 }],
    [{ y: -4 }, { y: -4 }],
    [{ x: -0, y: Number.MAX_VALUE }, { x: -0, y: Number.MAX_VALUE }],
  ])("유효한 command %o를 frozen normalized result %o로 만든다", (value, expected) => {
    const result = normalizeScrollCommand(value);

    expect(result).toEqual(expected);
    expect(Object.isFrozen(result)).toBe(true);
  });

  test.each([null, [], 1, "scroll", true, () => {}])(
    "object가 아닌 command %o는 TypeError다",
    (value) => {
      expect(() => normalizeScrollCommand(value as never)).toThrow(TypeError);
    },
  );

  test("enumerable unknown own string/symbol key와 non-number axis는 TypeError다", () => {
    const unknownString = { x: 1, unexpected: 2 };
    const unknownSymbol = { x: 1, [Symbol("unexpected")]: 2 };

    expect(() => normalizeScrollCommand(unknownString)).toThrow(TypeError);
    expect(() => normalizeScrollCommand(unknownSymbol)).toThrow(TypeError);
    expect(() => normalizeScrollCommand({ x: "1" } as never)).toThrow(TypeError);
    expect(() => normalizeScrollCommand({ y: undefined })).toThrow(TypeError);
  });

  test.each([
    { x: Number.NaN },
    { x: Number.POSITIVE_INFINITY },
    { y: Number.NEGATIVE_INFINITY },
  ])("non-finite axis %o는 RangeError다", (value) => {
    expect(() => normalizeScrollCommand(value)).toThrow(RangeError);
  });

  test("inherited와 non-enumerable key는 무시한다", () => {
    const inherited = Object.create({ x: 10 }) as { y: number };
    inherited.y = -4;
    Object.defineProperty(inherited, "unexpected", {
      enumerable: false,
      value: "ignored",
    });

    expect(normalizeScrollCommand(inherited)).toEqual({ y: -4 });
  });

  test.each([
    ["x", 10],
    ["y", -4],
  ])("recognized non-enumerable %s axis도 무시한다", (axis, value) => {
    const command: Record<string, number> = {};
    Object.defineProperty(command, axis, {
      enumerable: false,
      value,
    });

    expect(normalizeScrollCommand(command)).toEqual({});
  });
});

describe("addFiniteScrollDelta", () => {
  test.each([
    [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE],
    [-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE],
    [10, -4, 6],
  ])("finite addition %o + %o를 %o로 포화한다", (base, delta, expected) => {
    expect(addFiniteScrollDelta(base, delta)).toBe(expected);
  });
});
