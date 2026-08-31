export type ScrollaAxis = "both" | "horizontal" | "vertical";

export type ScrollaDirection = "auto" | "ltr" | "rtl";

export type ScrollaPhysicalAxis = "horizontal" | "vertical";

export interface ScrollPosition {
  readonly x: number;
  readonly y: number;
}

export interface ScrollaState {
  readonly position: ScrollPosition;
  readonly maxPosition: ScrollPosition;
  readonly viewportSize: {
    readonly width: number;
    readonly height: number;
  };
  readonly contentSize: {
    readonly width: number;
    readonly height: number;
  };
  readonly overflow: {
    readonly horizontal: boolean;
    readonly vertical: boolean;
  };
  readonly scrolling: boolean;
  readonly draggingAxis: ScrollaPhysicalAxis | null;
  readonly visibility: "visible" | "hidden";
}

export type ScrollaChangeReason =
  | "init"
  | "scroll"
  | "geometry"
  | "interaction"
  | "visibility";

export interface ScrollaChangeMeta {
  readonly reasons: readonly ScrollaChangeReason[];
}

export type ScrollaStateListener = (
  state: ScrollaState,
  meta: ScrollaChangeMeta,
) => void;

export interface ScrollaHandle {
  refresh(): void;
  scrollTo(position: Partial<ScrollPosition>): void;
  scrollBy(delta: Partial<ScrollPosition>): void;
  getState(): ScrollaState;
}
