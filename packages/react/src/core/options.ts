import type {
  ScrollaAxis,
  ScrollaDirection,
  ScrollPosition,
} from "../value-types.js";
import type {
  ScrollbarControllerCreateOptions,
  ScrollbarControllerOptions,
} from "./index.js";

export type SchedulerDirty =
  | "scroll"
  | "geometry"
  | "interaction"
  | "visibility";

export interface NormalizedScrollbarControllerOptions {
  readonly axis: ScrollaAxis;
  readonly direction: ScrollaDirection;
  readonly autoHide: boolean;
  readonly autoHideDelay: number;
  readonly scrollIdleDelay: number;
  readonly minThumbSize: number;
}

const optionKeys = [
  "axis",
  "direction",
  "autoHide",
  "autoHideDelay",
  "scrollIdleDelay",
  "minThumbSize",
] as const;

const createOptionKeys = [...optionKeys, "initialPosition"] as const;

function failType(): never {
  throw new TypeError("Scrolla controller option이 유효하지 않습니다.");
}

function failRange(): never {
  throw new RangeError("Scrolla controller option 범위가 유효하지 않습니다.");
}

function ownEnumerableKeys(record: object): (string | symbol)[] {
  return Reflect.ownKeys(record).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(record, key),
  );
}

function optionRecord(
  raw: unknown,
  allowedKeys: readonly string[],
): Record<string, unknown> {
  if (raw === undefined) {
    return {};
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return failType();
  }

  const record = raw as Record<string, unknown>;
  for (const key of ownEnumerableKeys(record)) {
    if (typeof key !== "string" || !allowedKeys.includes(key)) {
      return failType();
    }
  }

  return record;
}

function ownValue(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined;
}

function axis(value: unknown): ScrollaAxis {
  if (value === undefined) {
    return "both";
  }
  if (value === "both" || value === "horizontal" || value === "vertical") {
    return value;
  }
  return failType();
}

function direction(value: unknown): ScrollaDirection {
  if (value === undefined) {
    return "auto";
  }
  if (value === "auto" || value === "ltr" || value === "rtl") {
    return value;
  }
  return failType();
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "boolean") {
    return failType();
  }
  return value;
}

function nonNegativeFinite(value: unknown, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number") {
    return failType();
  }
  if (!Number.isFinite(value) || value < 0) {
    return failRange();
  }
  return value;
}

function positiveFinite(value: unknown, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number") {
    return failType();
  }
  if (!Number.isFinite(value) || value <= 0) {
    return failRange();
  }
  return value;
}

function normalizedOptions(
  record: Record<string, unknown>,
): NormalizedScrollbarControllerOptions {
  return Object.freeze({
    axis: axis(ownValue(record, "axis")),
    direction: direction(ownValue(record, "direction")),
    autoHide: boolean(ownValue(record, "autoHide"), false),
    autoHideDelay: nonNegativeFinite(ownValue(record, "autoHideDelay"), 1000),
    scrollIdleDelay: nonNegativeFinite(
      ownValue(record, "scrollIdleDelay"),
      120,
    ),
    minThumbSize: positiveFinite(ownValue(record, "minThumbSize"), 24),
  });
}

function initialPosition(value: unknown): ScrollPosition {
  if (value === undefined) {
    return Object.freeze({ x: 0, y: 0 });
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return failType();
  }

  const record = value as Record<string, unknown>;
  for (const key of ownEnumerableKeys(record)) {
    if (typeof key !== "string" || (key !== "x" && key !== "y")) {
      return failType();
    }
  }

  const x = ownValue(record, "x");
  const y = ownValue(record, "y");
  if (x !== undefined) {
    if (typeof x !== "number") {
      return failType();
    }
    if (!Number.isFinite(x)) {
      return failRange();
    }
  }
  if (y !== undefined) {
    if (typeof y !== "number") {
      return failType();
    }
    if (!Number.isFinite(y)) {
      return failRange();
    }
  }

  return Object.freeze({ x: x ?? 0, y: y ?? 0 });
}

export function normalizeControllerOptions(
  raw?: ScrollbarControllerOptions,
): NormalizedScrollbarControllerOptions {
  return normalizedOptions(optionRecord(raw, optionKeys));
}

export function normalizeControllerCreateOptions(
  raw?: ScrollbarControllerCreateOptions,
): {
  readonly options: NormalizedScrollbarControllerOptions;
  readonly initialPosition: ScrollPosition;
} {
  const record = optionRecord(raw, createOptionKeys);

  return Object.freeze({
    options: normalizedOptions(record),
    initialPosition: initialPosition(ownValue(record, "initialPosition")),
  });
}

export function changedOptionDirty(
  previous: NormalizedScrollbarControllerOptions,
  next: NormalizedScrollbarControllerOptions,
): readonly SchedulerDirty[] {
  const dirty: SchedulerDirty[] = [];
  if (
    previous.axis !== next.axis ||
    previous.direction !== next.direction ||
    previous.minThumbSize !== next.minThumbSize
  ) {
    dirty.push("geometry");
  }
  if (
    previous.autoHide !== next.autoHide ||
    previous.autoHideDelay !== next.autoHideDelay ||
    previous.scrollIdleDelay !== next.scrollIdleDelay
  ) {
    dirty.push("visibility");
  }
  return Object.freeze(dirty);
}
