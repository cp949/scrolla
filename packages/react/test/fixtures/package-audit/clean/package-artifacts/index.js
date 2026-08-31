"use client";

export function lastValue(values) {
  return values.length === 0 ? undefined : values[values.length - 1];
}
