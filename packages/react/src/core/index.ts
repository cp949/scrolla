import { createScrollbarControllerRuntime as createRuntime } from "./runtime.js";
import type {
  ScrollaAxis,
  ScrollaDirection,
  ScrollaPhysicalAxis,
  ScrollaState,
  ScrollaStateListener,
  ScrollPosition,
} from "../value-types.js";

export interface ScrollbarControllerElements {
  readonly holder: HTMLDivElement;
  readonly wrapper: HTMLDivElement;
  readonly scroller: HTMLDivElement;
  readonly content: HTMLDivElement;
  readonly trackVertical: HTMLDivElement;
  readonly thumbVertical: HTMLDivElement;
  readonly trackHorizontal: HTMLDivElement;
  readonly thumbHorizontal: HTMLDivElement;
}

export interface ScrollbarControllerOptions {
  readonly axis?: ScrollaAxis;
  readonly direction?: ScrollaDirection;
  readonly autoHide?: boolean;
  readonly autoHideDelay?: number;
  readonly scrollIdleDelay?: number;
  readonly minThumbSize?: number;
}

export interface ScrollbarControllerCreateOptions extends ScrollbarControllerOptions {
  readonly initialPosition?: Readonly<Partial<ScrollPosition>>;
}

export interface ScrollbarController {
  updateOptions(options: ScrollbarControllerOptions): void;
  refresh(): void;
  scrollTo(position: Readonly<Partial<ScrollPosition>>): void;
  scrollBy(delta: Readonly<Partial<ScrollPosition>>): void;
  getState(): ScrollaState;
  subscribe(listener: ScrollaStateListener): () => void;
  destroy(): void;
}

export type ScrollbarControllerInput =
  | { readonly type: "holder-pointer-down"; readonly event: PointerEvent }
  | {
      readonly type: "thumb-key-down";
      readonly axis: ScrollaPhysicalAxis;
      readonly event: KeyboardEvent;
    }
  | { readonly type: "holder-pointer-enter" }
  | { readonly type: "holder-pointer-leave" }
  | { readonly type: "holder-focus-in" }
  | { readonly type: "holder-focus-out"; readonly event: FocusEvent };

export interface ScrollbarControllerIngress {
  dispatch(input: ScrollbarControllerInput): void;
  getEffectiveDirection(): "ltr" | "rtl";
}

export interface ScrollbarControllerRuntime {
  readonly controller: ScrollbarController;
  readonly ingress: ScrollbarControllerIngress;
}

export function createScrollbarController(
  elements: ScrollbarControllerElements,
  options?: ScrollbarControllerCreateOptions,
): ScrollbarController {
  return createScrollbarControllerRuntime(elements, options).controller;
}

export function createScrollbarControllerRuntime(
  elements: ScrollbarControllerElements,
  options?: ScrollbarControllerCreateOptions,
): ScrollbarControllerRuntime {
  return createRuntime(elements, options);
}
