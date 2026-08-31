import { describe, expect, test } from "vitest";
import {
  changedOptionDirty,
  normalizeControllerCreateOptions,
  normalizeControllerOptions,
} from "../src/core/options.js";

describe("normalizeControllerOptions", () => {
  test("생략한 option을 frozen 기본값으로 정규화한다", () => {
    const options = normalizeControllerOptions();

    expect(options).toEqual({
      axis: "both",
      direction: "auto",
      autoHide: false,
      autoHideDelay: 1000,
      scrollIdleDelay: 120,
      minThumbSize: 24,
    });
    expect(Object.isFrozen(options)).toBe(true);
  });

  test.each([
    [null, TypeError],
    [[], TypeError],
    [() => {}, TypeError],
    [{ unsupported: true }, TypeError],
    [{ axis: "diagonal" }, TypeError],
    [{ autoHide: "false" }, TypeError],
    [{ autoHideDelay: "1000" }, TypeError],
    [{ minThumbSize: null }, TypeError],
    [{ autoHideDelay: -1 }, RangeError],
    [{ autoHideDelay: Number.POSITIVE_INFINITY }, RangeError],
    [{ scrollIdleDelay: Number.NaN }, RangeError],
    [{ minThumbSize: 0 }, RangeError],
    [{ minThumbSize: Number.NEGATIVE_INFINITY }, RangeError],
  ] as const)("%o는 %p를 던진다", (raw, ErrorClass) => {
    expect(() => normalizeControllerOptions(raw as never)).toThrow(ErrorClass);
  });

  test("enumerable symbol own key를 거부한다", () => {
    const unsupported = Symbol("unsupported");

    expect(() =>
      normalizeControllerOptions({ [unsupported]: true } as never),
    ).toThrow(TypeError);
  });
});

describe("normalizeControllerCreateOptions", () => {
  test("create-only initialPosition을 axis 기본값과 함께 frozen 결과로 정규화한다", () => {
    const normalized = normalizeControllerCreateOptions({
      axis: "vertical",
      initialPosition: { x: 18 },
    });

    expect(normalized).toEqual({
      options: {
        axis: "vertical",
        direction: "auto",
        autoHide: false,
        autoHideDelay: 1000,
        scrollIdleDelay: 120,
        minThumbSize: 24,
      },
      initialPosition: { x: 18, y: 0 },
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.options)).toBe(true);
    expect(Object.isFrozen(normalized.initialPosition)).toBe(true);
  });

  test.each([
    [{ initialPosition: null }, TypeError],
    [{ initialPosition: [] }, TypeError],
    [{ initialPosition: () => {} }, TypeError],
    [{ initialPosition: { z: 1 } }, TypeError],
    [{ initialPosition: { x: "1" } }, TypeError],
    [{ initialPosition: { x: Number.NaN } }, RangeError],
    [{ initialPosition: { y: Number.POSITIVE_INFINITY } }, RangeError],
  ] as const)("%o create option은 %p를 던진다", (raw, ErrorClass) => {
    expect(() => normalizeControllerCreateOptions(raw)).toThrow(ErrorClass);
  });

  test("initialPosition의 enumerable symbol own key를 거부한다", () => {
    const unsupported = Symbol("unsupported");

    expect(() =>
      normalizeControllerCreateOptions({
        initialPosition: { [unsupported]: 1 },
      } as never),
    ).toThrow(TypeError);
  });
});

describe("changedOptionDirty", () => {
  test("변경 없는 정규화 option은 dirty를 만들지 않는다", () => {
    const previous = normalizeControllerOptions({ axis: "horizontal" });
    const next = normalizeControllerOptions({ axis: "horizontal" });

    expect(changedOptionDirty(previous, next)).toEqual([]);
  });

  test("geometry와 visibility 변경을 canonical 순서로 중복 없이 반환한다", () => {
    const previous = normalizeControllerOptions();
    const next = normalizeControllerOptions({
      axis: "vertical",
      direction: "rtl",
      autoHide: true,
      autoHideDelay: 40,
      scrollIdleDelay: 20,
      minThumbSize: 30,
    });
    const dirty = changedOptionDirty(previous, next);

    expect(dirty).toEqual(["geometry", "visibility"]);
    expect(Object.isFrozen(dirty)).toBe(true);
  });
});
