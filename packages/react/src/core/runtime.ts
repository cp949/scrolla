import { createAutoHide } from "./auto-hide.js";
import { validateControllerElements } from "./elements.js";
import { calculateAxisGeometry, type AxisGeometry } from "./geometry.js";
import {
  type AxisInteractionGeometry,
  type InteractionGeometry,
  type InteractionRectangle,
} from "./interaction-geometry.js";
import {
  readGeometry,
  readNativePosition,
  writeNativePosition,
  writeThumbGeometry,
  type GeometryMeasurement,
} from "./measurement.js";
import {
  changedOptionDirty,
  normalizeControllerCreateOptions,
  normalizeControllerOptions,
  type NormalizedScrollbarControllerOptions,
  type SchedulerDirty,
} from "./options.js";
import {
  createPointerInteraction,
  type PointerInteraction,
  type PointerInteractionProjection,
} from "./pointer-interaction.js";
import { createResourceScope } from "./resource-scope.js";
import {
  resolveEffectiveDirection,
  type EffectiveDirection,
} from "./rtl/direction.js";
import { mirrorLogicalDelta, mirrorOffset } from "./rtl/mirror.js";
import {
  getDocumentScrollLeftModel,
  toLogicalX,
  toRawScrollLeft,
} from "./rtl/scroll-model.js";
import { createScrollActivity } from "./scroll-activity.js";
import {
  addFiniteScrollDelta,
  normalizeLogicalPosition,
  normalizeScrollCommand,
} from "./scroll-position.js";
import { createScrollbarStateStore } from "./state-store.js";
import type {
  ScrollbarController,
  ScrollbarControllerCreateOptions,
  ScrollbarControllerElements,
  ScrollbarControllerIngress,
  ScrollbarControllerInput,
  ScrollbarControllerRuntime,
} from "./index.js";
import type {
  ScrollaPhysicalAxis,
  ScrollaState,
  ScrollPosition,
} from "../value-types.js";

interface GeometryRead {
  readonly measurement: GeometryMeasurement | undefined;
  readonly nativePosition: ScrollPosition | undefined;
}

interface GeometryDerived {
  readonly horizontal: AxisGeometry | undefined;
  readonly vertical: AxisGeometry | undefined;
  readonly state: ScrollaState | undefined;
  readonly nativePosition: ScrollPosition | undefined;
  readonly nativePositionChanged: boolean;
  readonly writeNativePosition: boolean;
  readonly init: boolean;
  readonly interactionGeometry: InteractionGeometry | undefined;
  readonly updateInteractionGeometry: boolean;
  readonly interactionProjection: PointerInteractionProjection | undefined;
}

interface RuntimeResizeObserver {
  observe(target: Element): void;
  disconnect(): void;
}

interface RuntimeResizeObserverConstructor {
  new (callback: () => void): RuntimeResizeObserver;
}

interface RuntimeWindow extends Window {
  readonly ResizeObserver?: RuntimeResizeObserverConstructor;
}

const canonicalDirty: readonly SchedulerDirty[] = [
  "scroll",
  "geometry",
  "interaction",
  "visibility",
];

function failUnhandledControllerInput(input: never): never {
  throw new Error(`Unhandled scrollbar controller input: ${String(input)}`);
}

function createZeroState(): ScrollaState {
  return Object.freeze({
    position: Object.freeze({ x: 0, y: 0 }),
    maxPosition: Object.freeze({ x: 0, y: 0 }),
    viewportSize: Object.freeze({ width: 0, height: 0 }),
    contentSize: Object.freeze({ width: 0, height: 0 }),
    overflow: Object.freeze({ horizontal: false, vertical: false }),
    scrolling: false,
    draggingAxis: null,
    visibility: "visible",
  });
}

function axisEnabled(
  axis: NormalizedScrollbarControllerOptions["axis"],
  physicalAxis: ScrollaPhysicalAxis,
): boolean {
  if (axis === "both") {
    return true;
  }
  if (axis === "horizontal") {
    return physicalAxis === "horizontal";
  }
  return physicalAxis === "vertical";
}

function measurableAxis(
  measurement: GeometryMeasurement,
  enabled: boolean,
  viewportLength: number,
  trackLength: number,
): boolean {
  return (
    !enabled ||
    (measurement.connected &&
      Number.isFinite(viewportLength) &&
      viewportLength > 0 &&
      Number.isFinite(trackLength) &&
      trackLength > 0)
  );
}

function calculatePositionedGeometry(
  input: Omit<Parameters<typeof calculateAxisGeometry>[0], "position">,
  position: number,
  rawToLogical?: (raw: number, maxPosition: number) => number,
): AxisGeometry {
  const unpositioned = calculateAxisGeometry({ ...input, position: 0 });
  const logicalPosition = rawToLogical
    ? rawToLogical(position, unpositioned.maxPosition)
    : position;
  return calculateAxisGeometry({
    ...input,
    position: normalizeLogicalPosition(
      logicalPosition,
      unpositioned.maxPosition,
      unpositioned.overflow,
    ),
  });
}

function deriveState(
  horizontal: AxisGeometry,
  vertical: AxisGeometry,
  scrolling: boolean,
  draggingAxis: ScrollaState["draggingAxis"],
  visible: boolean,
): ScrollaState {
  return {
    position: { x: horizontal.position, y: vertical.position },
    maxPosition: { x: horizontal.maxPosition, y: vertical.maxPosition },
    viewportSize: {
      width: horizontal.viewportLength,
      height: vertical.viewportLength,
    },
    contentSize: {
      width: horizontal.contentLength,
      height: vertical.contentLength,
    },
    overflow: {
      horizontal: horizontal.overflow,
      vertical: vertical.overflow,
    },
    scrolling,
    draggingAxis,
    visibility: visible ? "visible" : "hidden",
  };
}

function deriveInteractionGeometry(
  measurement: GeometryMeasurement,
  horizontal: AxisGeometry,
  vertical: AxisGeometry,
): InteractionGeometry | undefined {
  if (!measurement.connected || (!horizontal.overflow && !vertical.overflow)) {
    return undefined;
  }
  return Object.freeze({
    horizontal: Object.freeze({
      track: measurement.horizontalTrack,
      thumbLength: horizontal.thumbLength,
      thumbOffset: horizontal.thumbOffset,
      maxPosition: horizontal.maxPosition,
      overflow: horizontal.overflow,
    }),
    vertical: Object.freeze({
      track: measurement.verticalTrack,
      thumbLength: vertical.thumbLength,
      thumbOffset: vertical.thumbOffset,
      maxPosition: vertical.maxPosition,
      overflow: vertical.overflow,
    }),
  });
}

function interactionRectangleEqual(
  left: InteractionRectangle,
  right: InteractionRectangle,
): boolean {
  return (
    Object.is(left.left, right.left) &&
    Object.is(left.top, right.top) &&
    Object.is(left.right, right.right) &&
    Object.is(left.bottom, right.bottom) &&
    Object.is(left.width, right.width) &&
    Object.is(left.height, right.height)
  );
}

function axisInteractionGeometryEqual(
  left: AxisInteractionGeometry,
  right: AxisInteractionGeometry,
): boolean {
  return (
    interactionRectangleEqual(left.track, right.track) &&
    Object.is(left.thumbLength, right.thumbLength) &&
    Object.is(left.thumbOffset, right.thumbOffset) &&
    Object.is(left.maxPosition, right.maxPosition) &&
    left.overflow === right.overflow
  );
}

function interactionGeometryEqual(
  left: InteractionGeometry | undefined,
  right: InteractionGeometry | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (left === undefined || right === undefined) {
    return false;
  }
  return (
    axisInteractionGeometryEqual(left.horizontal, right.horizontal) &&
    axisInteractionGeometryEqual(left.vertical, right.vertical)
  );
}

function toPixels(value: number): string {
  return `${value}px`;
}

export function createScrollbarControllerRuntime(
  elements: ScrollbarControllerElements,
  options?: ScrollbarControllerCreateOptions,
): ScrollbarControllerRuntime {
  const normalizedCreateOptions = normalizeControllerCreateOptions(options);
  let normalizedOptions = normalizedCreateOptions.options;
  const runtime = validateControllerElements(elements);
  const requestFrame = runtime.window.requestAnimationFrame.bind(
    runtime.window,
  );
  const cancelFrame = runtime.window.cancelAnimationFrame.bind(runtime.window);
  const stateStore = createScrollbarStateStore(createZeroState());
  const resourceScope = createResourceScope();
  const initialPosition = normalizedCreateOptions.initialPosition;
  let preInitIntent = normalizedCreateOptions.initialPosition;
  let pendingPosition: ScrollPosition | undefined;
  let pendingNativeSynchronization = false;
  let suppressActivityInvalidation = false;
  let destroyed = false;
  let queuedDirty = new Set<SchedulerDirty>();
  let pendingFrame: { handle?: number } | undefined;

  let lastHorizontalSize: string | undefined;
  let lastHorizontalTransform: string | undefined;
  let lastVerticalSize: string | undefined;
  let lastVerticalTransform: string | undefined;
  let hasProcessedInitialGeometry = false;
  let retainedMeasurement: GeometryMeasurement | undefined;
  let initialized = false;
  let notifyInit = false;
  let retainedRange: ScrollPosition | undefined;
  let retainedInteractionGeometry: InteractionGeometry | undefined;
  let retainedEffectiveDirection: EffectiveDirection = "ltr";

  function invalidate(reason: SchedulerDirty): void {
    if (destroyed) {
      return;
    }
    queuedDirty.add(reason);
    if (pendingFrame !== undefined) {
      return;
    }

    const frame: { handle?: number } = {};
    pendingFrame = frame;
    frame.handle = requestFrame(() => flushFrame(frame));
  }

  const activity = createScrollActivity({
    window: runtime.window,
    getDelay: () => normalizedOptions.scrollIdleDelay,
    invalidate: () => {
      if (!suppressActivityInvalidation) {
        invalidate("scroll");
      }
    },
  });
  const autoHide = createAutoHide({
    window: runtime.window,
    holder: elements.holder,
    getAutoHide: () => normalizedOptions.autoHide,
    getDelay: () => normalizedOptions.autoHideDelay,
    invalidate: () => invalidate("visibility"),
  });

  function readFrame(dirty: readonly SchedulerDirty[]): GeometryRead {
    const readPosition = dirty.includes("geometry") || dirty.includes("scroll");
    if (!dirty.includes("geometry")) {
      return Object.freeze({
        measurement: undefined,
        nativePosition: readPosition
          ? readNativePosition(elements.scroller)
          : undefined,
      });
    }
    return Object.freeze({
      measurement: readGeometry(elements),
      nativePosition: readPosition
        ? readNativePosition(elements.scroller)
        : undefined,
    });
  }

  function deriveFrame(
    read: GeometryRead,
    dirty: readonly SchedulerDirty[],
  ): GeometryDerived {
    if (read.measurement !== undefined) {
      retainedMeasurement = read.measurement;
    }
    const measurement = retainedMeasurement;
    const nativePosition = read.nativePosition;
    const previousEffectiveDirection = retainedEffectiveDirection;
    if (dirty.includes("geometry")) {
      retainedEffectiveDirection = resolveEffectiveDirection(
        normalizedOptions.direction,
        elements.scroller,
      );
    }
    const effectiveDirection = retainedEffectiveDirection;
    const directionChanged = previousEffectiveDirection !== effectiveDirection;
    if (
      measurement === undefined ||
      (!initialized && nativePosition === undefined)
    ) {
      return Object.freeze({
        horizontal: undefined,
        vertical: undefined,
        state: undefined,
        nativePosition: undefined,
        nativePositionChanged: false,
        writeNativePosition: false,
        init: false,
        interactionGeometry: undefined,
        updateInteractionGeometry: false,
        interactionProjection: undefined,
      });
    }

    const horizontalEnabled = axisEnabled(normalizedOptions.axis, "horizontal");
    const verticalEnabled = axisEnabled(normalizedOptions.axis, "vertical");
    if (
      !initialized &&
      (!measurableAxis(
        measurement,
        horizontalEnabled,
        measurement.viewportWidth,
        measurement.horizontalTrackLength,
      ) ||
        !measurableAxis(
          measurement,
          verticalEnabled,
          measurement.viewportHeight,
          measurement.verticalTrackLength,
        ))
    ) {
      const horizontal = calculateAxisGeometry({
        axisEnabled: horizontalEnabled,
        measurable: false,
        viewportLength: 0,
        contentLength: 0,
        trackLength: 0,
        position: 0,
        minThumbSize: normalizedOptions.minThumbSize,
      });
      const vertical = calculateAxisGeometry({
        axisEnabled: verticalEnabled,
        measurable: false,
        viewportLength: 0,
        contentLength: 0,
        trackLength: 0,
        position: 0,
        minThumbSize: normalizedOptions.minThumbSize,
      });
      return Object.freeze({
        horizontal,
        vertical,
        state: undefined,
        nativePosition: undefined,
        nativePositionChanged: false,
        writeNativePosition: false,
        init: false,
        interactionGeometry: undefined,
        updateInteractionGeometry: false,
        interactionProjection: undefined,
      });
    }

    const current = stateStore.getState();
    const horizontalRawUsable =
      initialized && nativePosition !== undefined && !directionChanged;
    const targetPosition = initialized
      ? {
          x: horizontalRawUsable ? nativePosition.x : current.position.x,
          y: nativePosition?.y ?? current.position.y,
        }
      : preInitIntent;
    const scrollLeftModel =
      effectiveDirection === "rtl" && horizontalEnabled
        ? getDocumentScrollLeftModel(elements.scroller.ownerDocument)
        : undefined;
    const horizontalRawToLogical =
      horizontalRawUsable && scrollLeftModel !== undefined
        ? (raw: number, maxPosition: number) =>
            toLogicalX(raw, scrollLeftModel, maxPosition)
        : undefined;
    const horizontalInput = {
      axisEnabled: horizontalEnabled,
      measurable: measurement.connected,
      viewportLength: measurement.viewportWidth,
      contentLength: measurement.contentWidth,
      trackLength: measurement.horizontalTrackLength,
      minThumbSize: normalizedOptions.minThumbSize,
    };
    const verticalInput = {
      axisEnabled: verticalEnabled,
      measurable: measurement.connected,
      viewportLength: measurement.viewportHeight,
      contentLength: measurement.contentHeight,
      trackLength: measurement.verticalTrackLength,
      minThumbSize: normalizedOptions.minThumbSize,
    };
    const horizontal = calculatePositionedGeometry(
      horizontalInput,
      targetPosition.x,
      horizontalRawToLogical,
    );
    const vertical = calculatePositionedGeometry(
      verticalInput,
      targetPosition.y,
    );
    if (!initialized) {
      const initialHorizontal = calculatePositionedGeometry(
        horizontalInput,
        initialPosition.x,
      );
      const initialVertical = calculatePositionedGeometry(
        verticalInput,
        initialPosition.y,
      );
      if (
        initialHorizontal.position !== horizontal.position ||
        initialVertical.position !== vertical.position
      ) {
        suppressActivityInvalidation = true;
        try {
          activity.activate();
        } finally {
          suppressActivityInvalidation = false;
        }
      }
    }
    const horizontalRawTarget =
      scrollLeftModel !== undefined && horizontal.overflow
        ? toRawScrollLeft(
            horizontal.position,
            scrollLeftModel,
            horizontal.maxPosition,
          )
        : horizontal.position;
    const rawTargetPosition = Object.freeze({
      x: horizontalRawTarget,
      y: vertical.position,
    });
    retainedRange = Object.freeze({
      x: horizontal.maxPosition,
      y: vertical.maxPosition,
    });
    const nativePositionChanged =
      nativePosition !== undefined &&
      (!Object.is(nativePosition.x, rawTargetPosition.x) ||
        !Object.is(nativePosition.y, rawTargetPosition.y));
    // RTL render와 pointer hit-test가 같은 thumbOffset을 쓰도록 여기서만 미러링한다.
    const renderedHorizontal =
      effectiveDirection === "rtl"
        ? Object.freeze({
            ...horizontal,
            thumbOffset: mirrorOffset(
              horizontal.thumbOffset,
              measurement.horizontalTrackLength - horizontal.thumbLength,
            ),
          })
        : horizontal;
    const nextInteractionGeometry = deriveInteractionGeometry(
      measurement,
      renderedHorizontal,
      vertical,
    );
    const updateInteractionGeometry = !interactionGeometryEqual(
      retainedInteractionGeometry,
      nextInteractionGeometry,
    );
    const interactionProjection = pointerInteraction?.projectGeometry(
      nextInteractionGeometry,
      directionChanged,
    );
    const scrollingNow = activity.getScrolling();
    const draggingAxisNow =
      interactionProjection === undefined
        ? current.draggingAxis
        : interactionProjection.draggingAxis;
    autoHide.sync({
      scrolling: scrollingNow,
      dragging: draggingAxisNow !== null,
    });

    return Object.freeze({
      horizontal: renderedHorizontal,
      vertical,
      state: deriveState(
        renderedHorizontal,
        vertical,
        scrollingNow,
        draggingAxisNow,
        autoHide.getVisible(),
      ),
      nativePosition:
        nativePosition === undefined ? undefined : rawTargetPosition,
      nativePositionChanged,
      writeNativePosition:
        nativePosition !== undefined && (!initialized || nativePositionChanged),
      init: !initialized,
      interactionGeometry: updateInteractionGeometry
        ? nextInteractionGeometry
        : retainedInteractionGeometry,
      updateInteractionGeometry,
      interactionProjection,
    });
  }

  function writeFrame(derived: GeometryDerived): void {
    const horizontal = derived.horizontal;
    const vertical = derived.vertical;
    if (horizontal === undefined || vertical === undefined) {
      return;
    }

    if (derived.writeNativePosition && derived.nativePosition !== undefined) {
      if (derived.nativePositionChanged) {
        pendingNativeSynchronization = true;
      }
      writeNativePosition(elements.scroller, derived.nativePosition);
    }

    const nextHorizontalSize = toPixels(horizontal.thumbLength);
    if (nextHorizontalSize !== lastHorizontalSize) {
      writeThumbGeometry(elements.thumbHorizontal, {
        axis: "horizontal",
        length: horizontal.thumbLength,
      });
      lastHorizontalSize = nextHorizontalSize;
    }
    const nextHorizontalTransform = `translateX(${toPixels(
      horizontal.thumbOffset,
    )})`;
    if (nextHorizontalTransform !== lastHorizontalTransform) {
      writeThumbGeometry(elements.thumbHorizontal, {
        axis: "horizontal",
        offset: horizontal.thumbOffset,
      });
      lastHorizontalTransform = nextHorizontalTransform;
    }
    const nextVerticalSize = toPixels(vertical.thumbLength);
    if (nextVerticalSize !== lastVerticalSize) {
      writeThumbGeometry(elements.thumbVertical, {
        axis: "vertical",
        length: vertical.thumbLength,
      });
      lastVerticalSize = nextVerticalSize;
    }
    const nextVerticalTransform = `translateY(${toPixels(
      vertical.thumbOffset,
    )})`;
    if (nextVerticalTransform !== lastVerticalTransform) {
      writeThumbGeometry(elements.thumbVertical, {
        axis: "vertical",
        offset: vertical.thumbOffset,
      });
      lastVerticalTransform = nextVerticalTransform;
    }
    if (derived.interactionProjection !== undefined) {
      pointerInteraction?.applyGeometryProjection(
        derived.interactionProjection,
      );
    }
  }

  function commitFrame(derived: GeometryDerived): boolean {
    if (derived.updateInteractionGeometry) {
      retainedInteractionGeometry = derived.interactionGeometry;
    }
    if (derived.state === undefined) {
      return false;
    }
    const next = stateStore.commit(derived.state);
    if (derived.init) {
      initialized = true;
      hasProcessedInitialGeometry = true;
      notifyInit = true;
      preInitIntent = stateStore.getState().position;
      pendingPosition = undefined;
      activity.didCommit();
      return true;
    }
    preInitIntent = stateStore.getState().position;
    pendingPosition = undefined;
    if (next !== undefined) {
      activity.didCommit();
    }
    if (!hasProcessedInitialGeometry) {
      hasProcessedInitialGeometry = true;
      return false;
    }
    return next !== undefined;
  }

  function notifyFrame(dirty: readonly SchedulerDirty[]): void {
    if (notifyInit) {
      notifyInit = false;
      stateStore.notify(stateStore.getState(), ["init"]);
      return;
    }
    stateStore.notify(stateStore.getState(), dirty);
  }

  function flushFrame(frame: { handle?: number }): void {
    if (destroyed || pendingFrame !== frame) {
      return;
    }
    pendingFrame = undefined;
    const capturedDirty = queuedDirty;
    queuedDirty = new Set<SchedulerDirty>();
    const dirty = Object.freeze(
      canonicalDirty.filter((reason) => capturedDirty.has(reason)),
    );

    const read = readFrame(dirty);
    const derived = deriveFrame(read, dirty);
    writeFrame(derived);
    if (commitFrame(derived)) {
      notifyFrame(dirty);
    }
  }

  function destroyPendingFrame(): void {
    queuedDirty.clear();
    const frame = pendingFrame;
    pendingFrame = undefined;
    if (frame?.handle !== undefined) {
      cancelFrame(frame.handle);
    }
  }

  const ResizeObserverConstructor = (runtime.window as RuntimeWindow)
    .ResizeObserver;
  if (typeof ResizeObserverConstructor === "function") {
    const observer = new ResizeObserverConstructor(() => {
      invalidate("geometry");
    });
    observer.observe(elements.scroller);
    observer.observe(elements.content);
    observer.observe(elements.trackVertical);
    observer.observe(elements.trackHorizontal);
    resourceScope.add(() => observer.disconnect());
  }

  resourceScope.add(() => activity.destroy());
  const onScroll = () => {
    if (destroyed) {
      return;
    }
    if (pendingNativeSynchronization) {
      pendingNativeSynchronization = false;
      invalidate("scroll");
      return;
    }
    pendingPosition = undefined;
    activity.activate();
    invalidate("scroll");
  };
  elements.scroller.addEventListener("scroll", onScroll);
  resourceScope.add(() => {
    elements.scroller.removeEventListener("scroll", onScroll);
  });

  function command(
    raw: Readonly<Partial<ScrollPosition>>,
    kind: "absolute" | "delta",
  ): boolean {
    if (destroyed) {
      return false;
    }
    const normalized = normalizeScrollCommand(raw);
    const horizontalEnabled = normalizedOptions.axis !== "vertical";
    const verticalEnabled = normalizedOptions.axis !== "horizontal";

    function composeIntent(base: ScrollPosition): ScrollPosition {
      return Object.freeze({
        x:
          normalized.x === undefined || !horizontalEnabled
            ? base.x
            : kind === "absolute"
              ? normalized.x
              : addFiniteScrollDelta(base.x, normalized.x),
        y:
          normalized.y === undefined || !verticalEnabled
            ? base.y
            : kind === "absolute"
              ? normalized.y
              : addFiniteScrollDelta(base.y, normalized.y),
      });
    }

    if (!initialized) {
      preInitIntent = composeIntent(preInitIntent);
      return false;
    }
    if (retainedRange === undefined) {
      return false;
    }
    const scrollLeftModel =
      retainedEffectiveDirection === "rtl"
        ? getDocumentScrollLeftModel(elements.scroller.ownerDocument)
        : undefined;
    const rawBase = pendingPosition === undefined;
    const baseSource = pendingPosition ?? {
      x: elements.scroller.scrollLeft,
      y: elements.scroller.scrollTop,
    };
    const baseLogicalX =
      rawBase && scrollLeftModel !== undefined
        ? toLogicalX(baseSource.x, scrollLeftModel, retainedRange.x)
        : baseSource.x;
    const base = Object.freeze({
      x: normalizeLogicalPosition(
        baseLogicalX,
        retainedRange.x,
        horizontalEnabled && retainedRange.x > 0,
      ),
      y: normalizeLogicalPosition(
        baseSource.y,
        retainedRange.y,
        verticalEnabled && retainedRange.y > 0,
      ),
    });
    const intended = composeIntent(base);
    const target = Object.freeze({
      x: normalizeLogicalPosition(
        intended.x,
        retainedRange.x,
        retainedRange.x > 0,
      ),
      y: normalizeLogicalPosition(
        intended.y,
        retainedRange.y,
        retainedRange.y > 0,
      ),
    });
    if (target.x === base.x && target.y === base.y) {
      return false;
    }

    pendingPosition = target;
    if (target.x !== base.x) {
      elements.scroller.scrollLeft =
        scrollLeftModel !== undefined
          ? toRawScrollLeft(target.x, scrollLeftModel, retainedRange.x)
          : target.x;
    }
    if (target.y !== base.y) {
      elements.scroller.scrollTop = target.y;
    }
    activity.activate();
    invalidate("scroll");
    return true;
  }

  const pointerInteraction: PointerInteraction = createPointerInteraction({
    holder: elements.holder,
    thumbHorizontal: elements.thumbHorizontal,
    thumbVertical: elements.thumbVertical,
    getGeometry: () => retainedInteractionGeometry,
    moveTo: (axis, position) =>
      command(
        axis === "horizontal" ? { x: position } : { y: position },
        "absolute",
      ),
    invalidateInteraction: () => invalidate("interaction"),
    isHorizontalMirrored: () => retainedEffectiveDirection === "rtl",
  });

  resourceScope.add(() => stateStore.destroy());
  resourceScope.add(() => destroyPendingFrame());
  resourceScope.add(() => autoHide.destroy());
  resourceScope.add(() => pointerInteraction.destroy());

  invalidate("geometry");

  // overflow가 사라져 thumb가 tabIndex={-1}/aria-hidden으로 바뀌면 core가 focus도 해제한다.
  let verticalFocusActive = axisOverflowActive("vertical");
  let horizontalFocusActive = axisOverflowActive("horizontal");
  function blurIfFocused(thumb: HTMLDivElement): void {
    if (thumb.ownerDocument.activeElement === thumb) {
      thumb.blur();
    }
  }
  stateStore.subscribe(() => {
    const nextVerticalActive = axisOverflowActive("vertical");
    if (verticalFocusActive && !nextVerticalActive) {
      blurIfFocused(elements.thumbVertical);
    }
    verticalFocusActive = nextVerticalActive;

    const nextHorizontalActive = axisOverflowActive("horizontal");
    if (horizontalFocusActive && !nextHorizontalActive) {
      blurIfFocused(elements.thumbHorizontal);
    }
    horizontalFocusActive = nextHorizontalActive;
  });

  function handlePointerDown(event: PointerEvent): void {
    if (destroyed || event.defaultPrevented || !initialized) {
      return;
    }
    if (
      event.isPrimary === false ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }
    pointerInteraction?.handlePointerDown(event);
  }

  const KEYBOARD_STEP = 40;

  function axisOverflowActive(physicalAxis: ScrollaPhysicalAxis): boolean {
    const enabled =
      physicalAxis === "horizontal"
        ? normalizedOptions.axis !== "vertical"
        : normalizedOptions.axis !== "horizontal";
    if (!enabled) {
      return false;
    }
    const overflow = stateStore.getState().overflow;
    return physicalAxis === "horizontal"
      ? overflow.horizontal
      : overflow.vertical;
  }

  function handleKeyDown(
    axis: ScrollaPhysicalAxis,
    event: KeyboardEvent,
  ): void {
    if (
      destroyed ||
      event.defaultPrevented ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !axisOverflowActive(axis) ||
      pointerInteraction?.getDraggingAxis() === axis
    ) {
      return;
    }

    const state = stateStore.getState();
    const viewportLength =
      axis === "horizontal"
        ? state.viewportSize.width
        : state.viewportSize.height;
    const maxPosition =
      axis === "horizontal" ? state.maxPosition.x : state.maxPosition.y;
    // Arrow는 물리 화면 방향이므로 RTL에서 반전한다. Page/Home/End는 logical 이동이다.
    const mirror =
      axis === "horizontal" && retainedEffectiveDirection === "rtl";

    let kind: "absolute" | "delta";
    let value: number;
    switch (event.key) {
      case "ArrowUp":
        if (axis !== "vertical") return;
        kind = "delta";
        value = -KEYBOARD_STEP;
        break;
      case "ArrowDown":
        if (axis !== "vertical") return;
        kind = "delta";
        value = KEYBOARD_STEP;
        break;
      case "ArrowLeft":
        if (axis !== "horizontal") return;
        kind = "delta";
        value = mirrorLogicalDelta(-KEYBOARD_STEP, mirror);
        break;
      case "ArrowRight":
        if (axis !== "horizontal") return;
        kind = "delta";
        value = mirrorLogicalDelta(KEYBOARD_STEP, mirror);
        break;
      case "PageUp":
        kind = "delta";
        value = -viewportLength;
        break;
      case "PageDown":
        kind = "delta";
        value = viewportLength;
        break;
      case "Home":
        kind = "absolute";
        value = 0;
        break;
      case "End":
        kind = "absolute";
        value = maxPosition;
        break;
      default:
        return;
    }

    command(axis === "horizontal" ? { x: value } : { y: value }, kind);
    event.preventDefault();
  }

  const controller: ScrollbarController = {
    updateOptions(nextOptions) {
      if (destroyed) {
        return;
      }
      const next = normalizeControllerOptions(nextOptions);
      const dirty = changedOptionDirty(normalizedOptions, next);
      if (dirty.length === 0) {
        return;
      }
      const idleDelayChanged =
        normalizedOptions.scrollIdleDelay !== next.scrollIdleDelay;
      const autoHideDelayChanged =
        normalizedOptions.autoHideDelay !== next.autoHideDelay;
      normalizedOptions = next;
      if (idleDelayChanged) {
        activity.updateDelay();
      }
      if (autoHideDelayChanged) {
        autoHide.updateDelay();
      }
      for (const reason of dirty) {
        invalidate(reason);
      }
    },
    refresh() {
      invalidate("geometry");
    },
    scrollTo(position) {
      command(position, "absolute");
    },
    scrollBy(delta) {
      command(delta, "delta");
    },
    getState() {
      return stateStore.getState();
    },
    subscribe(listener) {
      if (destroyed) {
        return () => {};
      }
      return stateStore.subscribe(listener);
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      resourceScope.destroy();
    },
  };
  const ingress: ScrollbarControllerIngress = {
    dispatch(input: ScrollbarControllerInput) {
      switch (input.type) {
        case "holder-pointer-down":
          handlePointerDown(input.event);
          return;
        case "thumb-key-down":
          handleKeyDown(input.axis, input.event);
          return;
        case "holder-pointer-enter":
          if (!destroyed) {
            autoHide.handleHoverEnter();
          }
          return;
        case "holder-pointer-leave":
          if (!destroyed) {
            autoHide.handleHoverLeave();
          }
          return;
        case "holder-focus-in":
          if (!destroyed) {
            autoHide.handleFocusIn();
          }
          return;
        case "holder-focus-out":
          if (!destroyed) {
            autoHide.handleFocusOut(input.event);
          }
          return;
        default:
          return failUnhandledControllerInput(input);
      }
    },
    getEffectiveDirection() {
      return retainedEffectiveDirection;
    },
  };
  return { controller, ingress };
}
