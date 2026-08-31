import type { ScrollPosition } from "../value-types.js";

export interface NormalizedScrollCommand {
  readonly x?: number;
  readonly y?: number;
}

function failCommandType(): never {
  throw new TypeError("scroll command가 유효하지 않습니다.");
}

function failCommandRange(): never {
  throw new RangeError("scroll command 축 값이 유효하지 않습니다.");
}

function ownEnumerableKeys(record: object): (string | symbol)[] {
  return Reflect.ownKeys(record).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(record, key),
  );
}

function normalizedAxis(
  record: Record<string, unknown>,
  key: "x" | "y",
): number | undefined {
  if (!Object.prototype.propertyIsEnumerable.call(record, key)) {
    return undefined;
  }
  const value = record[key];
  if (typeof value !== "number") {
    return failCommandType();
  }
  if (!Number.isFinite(value)) {
    return failCommandRange();
  }
  return value;
}

export function normalizeScrollCommand(
  value: Readonly<Partial<ScrollPosition>>,
): NormalizedScrollCommand {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return failCommandType();
  }

  const record = value as Record<string, unknown>;
  for (const key of ownEnumerableKeys(record)) {
    if (key !== "x" && key !== "y") {
      return failCommandType();
    }
  }

  const x = normalizedAxis(record, "x");
  const y = normalizedAxis(record, "y");
  return Object.freeze({
    ...(x === undefined ? {} : { x }),
    ...(y === undefined ? {} : { y }),
  });
}

export function addFiniteScrollDelta(base: number, delta: number): number {
  const sum = base + delta;
  if (Number.isFinite(sum)) {
    return sum;
  }
  return base < 0 ? -Number.MAX_VALUE : Number.MAX_VALUE;
}

export function normalizeLogicalPosition(
  value: number,
  maxPosition: number,
  overflow: boolean,
): number {
  if (!overflow || !Number.isFinite(maxPosition) || maxPosition <= 0) {
    return 0;
  }
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), maxPosition);
}
