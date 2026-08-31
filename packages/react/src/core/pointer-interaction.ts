import type { ScrollaPhysicalAxis } from "../value-types.js";
import {
  logicalPositionForCenteredTrackPointer,
  logicalPositionForThumbStart,
  resolveInteractionHit,
  type InteractionGeometry,
} from "./interaction-geometry.js";

export interface PointerInteractionProjection {
  readonly draggingAxis: ScrollaPhysicalAxis | null;
  readonly releaseActiveDrag: boolean;
}

export interface PointerInteraction {
  handlePointerDown(event: PointerEvent): void;
  getDraggingAxis(): ScrollaPhysicalAxis | null;
  projectGeometry(
    geometry: InteractionGeometry | undefined,
    horizontalDirectionChanged: boolean,
  ): PointerInteractionProjection;
  applyGeometryProjection(projection: PointerInteractionProjection): void;
  destroy(): void;
}

export interface PointerInteractionInput {
  readonly holder: HTMLDivElement;
  readonly thumbHorizontal: HTMLDivElement;
  readonly thumbVertical: HTMLDivElement;
  readonly getGeometry: () => InteractionGeometry | undefined;
  readonly moveTo: (axis: ScrollaPhysicalAxis, position: number) => boolean;
  readonly invalidateInteraction: () => void;
  readonly isHorizontalMirrored?: () => boolean;
}

interface ActiveDrag {
  phase: "pending" | "active" | "consumed";
  readonly pointerId: number;
  readonly axis: ScrollaPhysicalAxis;
  readonly grabOffset: number;
  readonly onMove: (event: PointerEvent) => void;
  readonly onEnd: (event: PointerEvent) => void;
  readonly onLostCapture: (event: PointerEvent) => void;
}

function axisTrackStart(
  axis: ScrollaPhysicalAxis,
  geometry: InteractionGeometry[ScrollaPhysicalAxis],
): number {
  return axis === "horizontal" ? geometry.track.left : geometry.track.top;
}

function axisTrackLength(
  axis: ScrollaPhysicalAxis,
  geometry: InteractionGeometry[ScrollaPhysicalAxis],
): number {
  return axis === "horizontal" ? geometry.track.width : geometry.track.height;
}

function pointerCoordinate(
  axis: ScrollaPhysicalAxis,
  event: PointerEvent,
): number {
  return axis === "horizontal" ? event.clientX : event.clientY;
}

function usableAxisGeometry(
  axis: ScrollaPhysicalAxis,
  geometry: InteractionGeometry[ScrollaPhysicalAxis],
): boolean {
  const trackLength = axisTrackLength(axis, geometry);
  return (
    geometry.overflow &&
    Number.isFinite(trackLength) &&
    trackLength > 0 &&
    Number.isFinite(geometry.thumbLength) &&
    geometry.thumbLength > 0 &&
    geometry.thumbLength <= trackLength &&
    Number.isFinite(geometry.maxPosition) &&
    geometry.maxPosition > 0
  );
}

function eligiblePointerDown(event: PointerEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.isPrimary !== false &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  );
}

export function createPointerInteraction(
  input: PointerInteractionInput,
): PointerInteraction {
  let current: ActiveDrag | undefined;
  let starting = false;
  let destroyed = false;

  function isHorizontalMirrored(): boolean {
    return input.isHorizontalMirrored?.() ?? false;
  }

  function axisMirrored(axis: ScrollaPhysicalAxis): boolean {
    return axis === "horizontal" && isHorizontalMirrored();
  }

  function removeListeners(token: ActiveDrag): void {
    input.holder.removeEventListener("pointermove", token.onMove);
    input.holder.removeEventListener("pointerup", token.onEnd);
    input.holder.removeEventListener("pointercancel", token.onEnd);
    input.holder.removeEventListener("lostpointercapture", token.onLostCapture);
  }

  function hasCapture(pointerId: number): boolean {
    try {
      return (
        typeof input.holder.hasPointerCapture === "function" &&
        input.holder.hasPointerCapture(pointerId)
      );
    } catch {
      return false;
    }
  }

  function releaseCapture(pointerId: number): void {
    try {
      if (hasCapture(pointerId)) {
        input.holder.releasePointerCapture(pointerId);
      }
    } catch {
      // Platform capture cleanup is best effort; local state is authoritative.
    }
  }

  function consume(
    token: ActiveDrag,
    release: boolean,
    invalidate: boolean,
  ): void {
    if (current !== token) {
      return;
    }
    const wasActive = token.phase === "active";
    token.phase = "consumed";
    current = undefined;
    removeListeners(token);
    if (release) {
      releaseCapture(token.pointerId);
    }
    if (invalidate && wasActive && !destroyed) {
      input.invalidateInteraction();
    }
  }

  function addListeners(token: ActiveDrag): void {
    input.holder.addEventListener("pointermove", token.onMove);
    input.holder.addEventListener("pointerup", token.onEnd);
    input.holder.addEventListener("pointercancel", token.onEnd);
    input.holder.addEventListener("lostpointercapture", token.onLostCapture);
  }

  function handleMove(token: ActiveDrag, event: PointerEvent): void {
    if (
      destroyed ||
      current !== token ||
      token.phase !== "active" ||
      event.pointerId !== token.pointerId
    ) {
      return;
    }
    const geometry = input.getGeometry();
    if (geometry === undefined) {
      return;
    }
    const axisGeometry = geometry[token.axis];
    if (!usableAxisGeometry(token.axis, axisGeometry)) {
      return;
    }

    const desiredThumbStart =
      pointerCoordinate(token.axis, event) -
      axisTrackStart(token.axis, axisGeometry) -
      token.grabOffset;
    const position = logicalPositionForThumbStart(
      desiredThumbStart,
      axisTrackLength(token.axis, axisGeometry),
      axisGeometry.thumbLength,
      axisGeometry.maxPosition,
      axisMirrored(token.axis),
    );
    input.moveTo(token.axis, position);
    event.preventDefault();
  }

  function handleEnd(token: ActiveDrag, event: PointerEvent): void {
    if (event.pointerId !== token.pointerId) {
      return;
    }
    consume(token, true, true);
  }

  function handleLostCapture(token: ActiveDrag, event: PointerEvent): void {
    if (event.pointerId !== token.pointerId) {
      return;
    }
    consume(token, false, true);
  }

  return {
    handlePointerDown(event) {
      if (
        destroyed ||
        current !== undefined ||
        starting ||
        !eligiblePointerDown(event)
      ) {
        return;
      }
      const geometry = input.getGeometry();
      if (geometry === undefined) {
        return;
      }
      const hit = resolveInteractionHit(geometry, {
        x: event.clientX,
        y: event.clientY,
      });
      if (hit?.kind === "track") {
        const axisGeometry = geometry[hit.axis];
        input.moveTo(
          hit.axis,
          logicalPositionForCenteredTrackPointer(
            hit.pointerCoordinate,
            axisTrackStart(hit.axis, axisGeometry),
            axisTrackLength(hit.axis, axisGeometry),
            axisGeometry.thumbLength,
            axisGeometry.maxPosition,
            axisMirrored(hit.axis),
          ),
        );
        event.preventDefault();
        return;
      }
      if (hit?.kind !== "thumb") {
        return;
      }
      if (typeof input.holder.setPointerCapture !== "function") {
        return;
      }
      starting = true;
      try {
        input.holder.setPointerCapture(event.pointerId);
      } catch {
        starting = false;
        return;
      }
      starting = false;
      if (destroyed) {
        releaseCapture(event.pointerId);
        return;
      }
      if (!hasCapture(event.pointerId)) {
        return;
      }

      const axisGeometry = geometry[hit.axis];
      const token: ActiveDrag = {
        phase: "pending",
        pointerId: event.pointerId,
        axis: hit.axis,
        grabOffset:
          hit.pointerCoordinate -
          axisTrackStart(hit.axis, axisGeometry) -
          axisGeometry.thumbOffset,
        onMove: (nextEvent) => handleMove(token, nextEvent),
        onEnd: (nextEvent) => handleEnd(token, nextEvent),
        onLostCapture: (nextEvent) => handleLostCapture(token, nextEvent),
      };
      current = token;
      addListeners(token);

      try {
        const thumb =
          hit.axis === "horizontal"
            ? input.thumbHorizontal
            : input.thumbVertical;
        thumb.focus({ preventScroll: true });
      } catch {
        consume(token, true, false);
        return;
      }
      if (destroyed || current !== token || token.phase !== "pending") {
        return;
      }
      if (!hasCapture(event.pointerId)) {
        consume(token, true, false);
        return;
      }

      token.phase = "active";
      event.preventDefault();
      input.invalidateInteraction();
    },
    getDraggingAxis() {
      return current?.phase === "active" ? current.axis : null;
    },
    projectGeometry(geometry, horizontalDirectionChanged) {
      const token = current?.phase === "active" ? current : undefined;
      const releaseActiveDrag =
        token !== undefined &&
        (geometry === undefined ||
          !usableAxisGeometry(token.axis, geometry[token.axis]) ||
          (token.axis === "horizontal" && horizontalDirectionChanged));
      return Object.freeze({
        draggingAxis: releaseActiveDrag ? null : (token?.axis ?? null),
        releaseActiveDrag,
      });
    },
    applyGeometryProjection(projection) {
      if (!projection.releaseActiveDrag || current?.phase !== "active") {
        return;
      }
      consume(current, true, false);
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      starting = false;
      if (current !== undefined) {
        consume(current, true, false);
      }
    },
  };
}
