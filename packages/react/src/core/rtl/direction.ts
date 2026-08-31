import type { ScrollaDirection } from "../../value-types.js";

export type EffectiveDirection = "ltr" | "rtl";

export function resolveEffectiveDirection(
  direction: ScrollaDirection,
  scroller: HTMLElement,
): EffectiveDirection {
  if (direction === "ltr" || direction === "rtl") {
    return direction;
  }

  const view = scroller.ownerDocument.defaultView;
  if (view === null) {
    return "ltr";
  }

  return view.getComputedStyle(scroller).direction === "rtl" ? "rtl" : "ltr";
}
