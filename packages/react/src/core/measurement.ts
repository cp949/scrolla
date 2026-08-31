import type { ScrollaPhysicalAxis, ScrollPosition } from "../value-types.js";
import type { ScrollbarControllerElements } from "./index.js";
import {
  normalizeInteractionRectangle,
  type InteractionRectangle,
} from "./interaction-geometry.js";

export interface GeometryMeasurement {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
  readonly horizontalTrackLength: number;
  readonly verticalTrackLength: number;
  readonly horizontalTrack: InteractionRectangle;
  readonly verticalTrack: InteractionRectangle;
  readonly connected: boolean;
}

export interface ThumbGeometryWrite {
  readonly axis: ScrollaPhysicalAxis;
  readonly length?: number;
  readonly offset?: number;
}

function normalizeMeasurementMetric(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function readGeometry(
  elements: ScrollbarControllerElements,
): GeometryMeasurement {
  const connected = elements.holder.isConnected;
  const viewportWidth = normalizeMeasurementMetric(
    elements.scroller.clientWidth,
  );
  const viewportHeight = normalizeMeasurementMetric(
    elements.scroller.clientHeight,
  );
  const contentWidth = normalizeMeasurementMetric(
    elements.scroller.scrollWidth,
  );
  const contentHeight = normalizeMeasurementMetric(
    elements.scroller.scrollHeight,
  );
  const horizontalTrackRectangle =
    elements.trackHorizontal.getBoundingClientRect();
  const verticalTrackRectangle = elements.trackVertical.getBoundingClientRect();
  const horizontalTrack = normalizeInteractionRectangle({
    left: horizontalTrackRectangle.left,
    top: horizontalTrackRectangle.top,
    width: horizontalTrackRectangle.width,
    height: horizontalTrackRectangle.height,
  });
  const verticalTrack = normalizeInteractionRectangle({
    left: verticalTrackRectangle.left,
    top: verticalTrackRectangle.top,
    width: verticalTrackRectangle.width,
    height: verticalTrackRectangle.height,
  });

  return Object.freeze({
    connected,
    viewportWidth,
    viewportHeight,
    contentWidth,
    contentHeight,
    horizontalTrackLength: normalizeMeasurementMetric(horizontalTrack.width),
    verticalTrackLength: normalizeMeasurementMetric(verticalTrack.height),
    horizontalTrack,
    verticalTrack,
  });
}

export function readNativePosition(scroller: HTMLDivElement): ScrollPosition {
  return Object.freeze({
    x: scroller.scrollLeft,
    y: scroller.scrollTop,
  });
}

export function writeNativePosition(
  scroller: HTMLDivElement,
  position: ScrollPosition,
): void {
  scroller.scrollLeft = position.x;
  scroller.scrollTop = position.y;
}

function toPixels(value: number): string {
  return `${value}px`;
}

export function writeThumbGeometry(
  thumb: HTMLDivElement,
  input: ThumbGeometryWrite,
): void {
  if (input.length !== undefined) {
    if (input.axis === "horizontal") {
      thumb.style.width = toPixels(input.length);
    } else {
      thumb.style.height = toPixels(input.length);
    }
  }
  if (input.offset !== undefined) {
    const transform = input.axis === "horizontal" ? "translateX" : "translateY";
    thumb.style.transform = `${transform}(${toPixels(input.offset)})`;
  }
}
