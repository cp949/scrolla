import type { ScrollbarControllerElements } from "./index.js";

export interface ControllerRuntime {
  readonly window: Window;
}

const elementNames = [
  "holder",
  "wrapper",
  "scroller",
  "content",
  "trackVertical",
  "thumbVertical",
  "trackHorizontal",
  "thumbHorizontal",
] as const;

const directParents = [
  ["wrapper", "holder"],
  ["scroller", "wrapper"],
  ["content", "scroller"],
  ["trackVertical", "holder"],
  ["thumbVertical", "trackVertical"],
  ["trackHorizontal", "holder"],
  ["thumbHorizontal", "trackHorizontal"],
] as const;

function failValidation(): never {
  throw new TypeError("Scrolla controller elements가 유효하지 않습니다.");
}

export function validateControllerElements(
  value: ScrollbarControllerElements,
): ControllerRuntime {
  if (value === null || typeof value !== "object") {
    return failValidation();
  }

  const holder = value.holder;
  const holderDocument = holder?.ownerDocument;
  const targetWindow = holderDocument?.defaultView;

  if (targetWindow === null || targetWindow === undefined) {
    return failValidation();
  }

  const Div = targetWindow.HTMLDivElement;
  if (typeof Div !== "function") {
    return failValidation();
  }

  for (const name of elementNames) {
    if (!(value[name] instanceof Div)) {
      return failValidation();
    }
  }

  const values = elementNames.map((name) => value[name]);
  if (new Set(values).size !== values.length) {
    return failValidation();
  }

  for (const element of values) {
    if (element.ownerDocument !== holderDocument) {
      return failValidation();
    }
  }

  for (const [childName, parentName] of directParents) {
    if (value[childName].parentElement !== value[parentName]) {
      return failValidation();
    }
  }

  if (
    typeof targetWindow.requestAnimationFrame !== "function" ||
    typeof targetWindow.cancelAnimationFrame !== "function"
  ) {
    return failValidation();
  }

  return {
    window: targetWindow,
  };
}
