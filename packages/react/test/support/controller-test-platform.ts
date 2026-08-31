import {
  createScrollbarController,
  createScrollbarControllerRuntime,
  type ScrollbarController,
  type ScrollbarControllerCreateOptions,
  type ScrollbarControllerElements,
  type ScrollbarControllerRuntime,
} from "../../src/core/index.js";
import type { ScrollPosition } from "../../src/value-types.js";

export interface ControllerTestMetrics {
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  horizontalTrack: { left: number; top: number; width: number; height: number };
  verticalTrack: { left: number; top: number; width: number; height: number };
}

export interface ControllerTestScenarioInput {
  readonly document?: Document;
  readonly initialMetrics?: Partial<ControllerTestMetrics>;
  readonly initialPosition?: Partial<ScrollPosition>;
  readonly instrumentation?: readonly ControllerTestInstrumentation[];
}

export type ControllerTestInstrumentation =
  | "dom-events"
  | "resource-events"
  | "captured-callbacks";

export interface ControllerFrameDriver {
  readonly pendingCount: number;
  readonly requestCount: number;
  readonly cancelCount: number;
  runNext(): void;
  runAll(): void;
  runCaptured(handle: number): void;
  failCancel(handle: number, error: unknown): void;
}

export interface ControllerTimerDriver {
  readonly pendingCount: number;
  readonly setCount: number;
  readonly clearCount: number;
  advance(milliseconds: number): void;
  runDue(): void;
  runCaptured(handle: number): void;
  failClear(handle: number, error: unknown): void;
}

export interface ControllerResizeDriver {
  readonly instanceCount: number;
  observed(index: number): readonly Element[];
  emit(index?: number, entries?: readonly ResizeObserverEntry[]): void;
  disconnectCount(index: number): number;
  failDisconnect(index: number, error: unknown): void;
}

export interface ControllerPointerDriver {
  readonly capturedIds: ReadonlySet<number>;
  event(
    type: ControllerPointerEventType,
    input: ControllerPointerEventInput,
  ): PointerEvent;
  failRelease(pointerId: number, error: unknown): void;
}

export type ControllerPointerEventType =
  | "pointerdown"
  | "pointermove"
  | "pointerup"
  | "pointercancel"
  | "lostpointercapture";

export interface ControllerPointerEventInput {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly button?: number;
  readonly buttons?: number;
  readonly isPrimary?: boolean;
  readonly pointerType?: string;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
}

export interface ControllerTestScenario {
  readonly elements: ScrollbarControllerElements;
  readonly metrics: ControllerTestMetrics;
  readonly position: ScrollPosition;
  readonly writes: ReadonlyArray<readonly ["x" | "y", number]>;
  readonly events: readonly string[];
  readonly frames: ControllerFrameDriver;
  readonly timers: ControllerTimerDriver;
  readonly resize: ControllerResizeDriver;
  readonly pointer: ControllerPointerDriver;
  createController(
    options?: ScrollbarControllerCreateOptions,
  ): ScrollbarController;
  createRuntime(
    options?: ScrollbarControllerCreateOptions,
  ): ScrollbarControllerRuntime;
  clearTrace(): void;
  dispose(): void;
}

interface TimerCallback {
  readonly callback: () => void;
  readonly dueAt: number;
}

interface ResizeInstance {
  readonly callback: ResizeObserverCallback;
  readonly targets: Element[];
  disconnectCount: number;
  disconnectFailure: unknown;
}

const defaultMetrics: ControllerTestMetrics = {
  clientWidth: 100,
  clientHeight: 200,
  scrollWidth: 400,
  scrollHeight: 800,
  horizontalTrack: { left: 10, top: 190, width: 80, height: 10 },
  verticalTrack: { left: 90, top: 0, width: 10, height: 100 },
};

const defaultPosition: ScrollPosition = { x: 0, y: 0 };

function missingDriverTarget(kind: "frame" | "timer"): never {
  throw new Error(`실행할 ${kind}이 없습니다.`);
}

function appendError(errors: unknown[], operation: () => void): void {
  try {
    operation();
  } catch (error) {
    errors.push(error);
  }
}

function surfaceCleanupErrors(errors: readonly unknown[]): void {
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "controller test scenario cleanup failed");
  }
}

function rectangle(
  value: Readonly<{ left: number; top: number; width: number; height: number }>,
): DOMRect {
  return {
    left: value.left,
    top: value.top,
    width: value.width,
    height: value.height,
    right: value.left + value.width,
    bottom: value.top + value.height,
    x: value.left,
    y: value.top,
    toJSON() {
      return this;
    },
  };
}

export function createControllerTestScenario(
  input: ControllerTestScenarioInput = {},
): ControllerTestScenario {
  const targetDocument = input.document ?? document;
  const targetWindow = targetDocument.defaultView;
  if (targetWindow === null) {
    throw new TypeError("Controller test scenario document에 window가 없습니다.");
  }
  const enabled = new Set(input.instrumentation);
  const events: string[] = [];
  const writes: Array<readonly ["x" | "y", number]> = [];
  const metrics: ControllerTestMetrics = {
    ...defaultMetrics,
    ...input.initialMetrics,
    horizontalTrack: {
      ...defaultMetrics.horizontalTrack,
      ...input.initialMetrics?.horizontalTrack,
    },
    verticalTrack: {
      ...defaultMetrics.verticalTrack,
      ...input.initialMetrics?.verticalTrack,
    },
  };
  const position: ScrollPosition = { ...defaultPosition, ...input.initialPosition };
  const rollback: Array<() => void> = [];
  const controllers: ScrollbarController[] = [];
  let disposed = false;
  let now = 0;
  let mountedHolder: HTMLDivElement | undefined;

  function trace(capability: ControllerTestInstrumentation, event: string): void {
    if (enabled.has(capability)) {
      events.push(event);
    }
  }

  function replaceDescriptor(
    target: object,
    name: PropertyKey,
    descriptor: PropertyDescriptor,
  ): void {
    const previous = Object.getOwnPropertyDescriptor(target, name);
    Object.defineProperty(target, name, descriptor);
    rollback.push(() => {
      if (previous === undefined) {
        delete (target as Record<PropertyKey, unknown>)[name];
        return;
      }
      Object.defineProperty(target, name, previous);
    });
  }

  try {
  const holder = targetDocument.createElement("div");
  mountedHolder = holder;
  const wrapper = targetDocument.createElement("div");
  const scroller = targetDocument.createElement("div");
  const content = targetDocument.createElement("div");
  const trackVertical = targetDocument.createElement("div");
  const thumbVertical = targetDocument.createElement("div");
  const trackHorizontal = targetDocument.createElement("div");
  const thumbHorizontal = targetDocument.createElement("div");
  holder.append(wrapper, trackVertical, trackHorizontal);
  wrapper.append(scroller);
  scroller.append(content);
  trackVertical.append(thumbVertical);
  trackHorizontal.append(thumbHorizontal);
  targetDocument.body.append(holder);
  const elements: ScrollbarControllerElements = {
    holder,
    wrapper,
    scroller,
    content,
    trackVertical,
    thumbVertical,
    trackHorizontal,
    thumbHorizontal,
  };

  replaceDescriptor(scroller, "clientWidth", {
    configurable: true,
    get() {
      trace("dom-events", "read clientWidth");
      return metrics.clientWidth;
    },
  });
  replaceDescriptor(scroller, "clientHeight", {
    configurable: true,
    get() {
      trace("dom-events", "read clientHeight");
      return metrics.clientHeight;
    },
  });
  replaceDescriptor(scroller, "scrollWidth", {
    configurable: true,
    get() {
      trace("dom-events", "read scrollWidth");
      return metrics.scrollWidth;
    },
  });
  replaceDescriptor(scroller, "scrollHeight", {
    configurable: true,
    get() {
      trace("dom-events", "read scrollHeight");
      return metrics.scrollHeight;
    },
  });
  replaceDescriptor(scroller, "scrollLeft", {
    configurable: true,
    get() {
      trace("dom-events", "read scrollLeft");
      return position.x;
    },
    set(value: number) {
      position.x = value;
      writes.push(["x", value]);
      trace("dom-events", `write scrollLeft ${value}`);
    },
  });
  replaceDescriptor(scroller, "scrollTop", {
    configurable: true,
    get() {
      trace("dom-events", "read scrollTop");
      return position.y;
    },
    set(value: number) {
      position.y = value;
      writes.push(["y", value]);
      trace("dom-events", `write scrollTop ${value}`);
    },
  });
  replaceDescriptor(trackHorizontal, "getBoundingClientRect", {
    configurable: true,
    value: () => {
      trace("dom-events", "read horizontal rect");
      return rectangle(metrics.horizontalTrack);
    },
  });
  replaceDescriptor(trackVertical, "getBoundingClientRect", {
    configurable: true,
    value: () => {
      trace("dom-events", "read vertical rect");
      return rectangle(metrics.verticalTrack);
    },
  });
  for (const [style, property] of [
    [thumbHorizontal.style, "width"],
    [thumbHorizontal.style, "transform"],
    [thumbVertical.style, "height"],
    [thumbVertical.style, "transform"],
  ] as const) {
    let value = "";
    replaceDescriptor(style, property, {
      configurable: true,
      get() {
        return value;
      },
      set(next: string) {
        value = next;
        trace("dom-events", `write ${property} ${next}`);
      },
    });
  }

  let nextFrameHandle = 1;
  const frames = new Map<number, FrameRequestCallback>();
  const capturedFrames = new Map<number, FrameRequestCallback>();
  const frameFailures = new Map<number, unknown>();
  let requestCount = 0;
  let cancelCount = 0;
  replaceDescriptor(targetWindow, "requestAnimationFrame", {
    configurable: true,
    value(callback: FrameRequestCallback): number {
      const handle = nextFrameHandle;
      nextFrameHandle += 1;
      requestCount += 1;
      frames.set(handle, callback);
      if (enabled.has("captured-callbacks")) {
        capturedFrames.set(handle, callback);
      }
      return handle;
    },
  });
  replaceDescriptor(targetWindow, "cancelAnimationFrame", {
    configurable: true,
    value(handle: number): void {
      cancelCount += 1;
      frames.delete(handle);
      trace("resource-events", `raf:${handle}`);
      const failure = frameFailures.get(handle);
      if (failure !== undefined) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- arbitrary sentinel의 exact identity 보존이 test contract다.
        throw failure;
      }
    },
  });

  let nextTimerHandle = 1;
  const timers = new Map<number, TimerCallback>();
  const capturedTimers = new Map<number, () => void>();
  const timerFailures = new Map<number, unknown>();
  let setCount = 0;
  let clearCount = 0;
  replaceDescriptor(targetWindow, "setTimeout", {
    configurable: true,
    value(callback: () => void, delay = 0): number {
      const handle = nextTimerHandle;
      nextTimerHandle += 1;
      setCount += 1;
      timers.set(handle, { callback, dueAt: now + Number(delay) });
      if (enabled.has("captured-callbacks")) {
        capturedTimers.set(handle, callback);
      }
      return handle;
    },
  });
  replaceDescriptor(targetWindow, "clearTimeout", {
    configurable: true,
    value(handle: number): void {
      clearCount += 1;
      timers.delete(handle);
      trace("resource-events", `timer:${handle}`);
      const failure = timerFailures.get(handle);
      if (failure !== undefined) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- arbitrary sentinel의 exact identity 보존이 test contract다.
        throw failure;
      }
    },
  });
  const NativeDate = targetWindow.Date;
  class ScenarioDate extends NativeDate {
    static now(): number {
      return now;
    }
  }
  replaceDescriptor(targetWindow, "Date", {
    configurable: true,
    value: ScenarioDate,
  });

  const resizeInstances: ResizeInstance[] = [];
  class ScenarioResizeObserver {
    readonly instance: ResizeInstance;

    constructor(callback: ResizeObserverCallback) {
      this.instance = {
        callback,
        targets: [],
        disconnectCount: 0,
        disconnectFailure: undefined,
      };
      resizeInstances.push(this.instance);
    }

    observe(target: Element): void {
      this.instance.targets.push(target);
    }

    disconnect(): void {
      this.instance.disconnectCount += 1;
      const index = resizeInstances.indexOf(this.instance);
      trace("resource-events", `observer:${index}`);
      if (this.instance.disconnectFailure !== undefined) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- arbitrary sentinel의 exact identity 보존이 test contract다.
        throw this.instance.disconnectFailure;
      }
    }
  }
  replaceDescriptor(targetWindow, "ResizeObserver", {
    configurable: true,
    value: ScenarioResizeObserver,
  });

  const capturedIds = new Set<number>();
  const releaseFailures = new Map<number, unknown>();
  replaceDescriptor(holder, "setPointerCapture", {
    configurable: true,
    value(pointerId: number): void {
      capturedIds.add(pointerId);
    },
  });
  replaceDescriptor(holder, "hasPointerCapture", {
    configurable: true,
    value(pointerId: number): boolean {
      return capturedIds.has(pointerId);
    },
  });
  replaceDescriptor(holder, "releasePointerCapture", {
    configurable: true,
    value(pointerId: number): void {
      capturedIds.delete(pointerId);
      trace("resource-events", `pointer-capture:${pointerId}`);
      const failure = releaseFailures.get(pointerId);
      if (failure !== undefined) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- arbitrary sentinel의 exact identity 보존이 test contract다.
        throw failure;
      }
    },
  });

  function instrumentListenerCleanup(
    element: HTMLElement,
    role: "holder" | "scroller",
  ): void {
    const remove = element.removeEventListener.bind(element);
    replaceDescriptor(element, "removeEventListener", {
      configurable: true,
      value(
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | EventListenerOptions,
      ): void {
        trace("resource-events", `listener:${role}:${type}`);
        remove(type, listener, options);
      },
    });
  }
  instrumentListenerCleanup(holder, "holder");
  instrumentListenerCleanup(scroller, "scroller");

  const frameDriver: ControllerFrameDriver = {
    get pendingCount() {
      return frames.size;
    },
    get requestCount() {
      return requestCount;
    },
    get cancelCount() {
      return cancelCount;
    },
    runNext() {
      const entry = frames.entries().next().value as
        | readonly [number, FrameRequestCallback]
        | undefined;
      if (entry === undefined) {
        return missingDriverTarget("frame");
      }
      const [handle, callback] = entry;
      frames.delete(handle);
      callback(now);
    },
    runAll() {
      while (frames.size > 0) {
        this.runNext();
      }
    },
    runCaptured(handle) {
      const callback = capturedFrames.get(handle);
      if (callback === undefined) {
        return missingDriverTarget("frame");
      }
      callback(now);
    },
    failCancel(handle, error) {
      frameFailures.set(handle, error);
    },
  };

  function runDueTimers(): void {
    const due = [...timers.entries()]
      .filter(([, timer]) => timer.dueAt <= now)
      .sort(
        ([leftHandle, left], [rightHandle, right]) =>
          left.dueAt - right.dueAt || leftHandle - rightHandle,
      );
    for (const [handle, timer] of due) {
      if (timers.get(handle) !== timer) {
        continue;
      }
      timers.delete(handle);
      timer.callback();
    }
  }

  const timerDriver: ControllerTimerDriver = {
    get pendingCount() {
      return timers.size;
    },
    get setCount() {
      return setCount;
    },
    get clearCount() {
      return clearCount;
    },
    advance(milliseconds) {
      now += milliseconds;
    },
    runDue() {
      runDueTimers();
    },
    runCaptured(handle) {
      const callback = capturedTimers.get(handle);
      if (callback === undefined) {
        return missingDriverTarget("timer");
      }
      callback();
    },
    failClear(handle, error) {
      timerFailures.set(handle, error);
    },
  };

  const resizeDriver: ControllerResizeDriver = {
    get instanceCount() {
      return resizeInstances.length;
    },
    observed(index) {
      const instance = resizeInstances[index];
      if (instance === undefined) {
        throw new Error("대상 ResizeObserver가 없습니다.");
      }
      return instance.targets;
    },
    emit(index = 0, entries = []) {
      const instance = resizeInstances[index];
      if (instance === undefined) {
        throw new Error("대상 ResizeObserver가 없습니다.");
      }
      instance.callback(entries as ResizeObserverEntry[], {} as ResizeObserver);
    },
    disconnectCount(index) {
      return resizeInstances[index]?.disconnectCount ?? 0;
    },
    failDisconnect(index, error) {
      const instance = resizeInstances[index];
      if (instance === undefined) {
        throw new Error("대상 ResizeObserver가 없습니다.");
      }
      instance.disconnectFailure = error;
    },
  };

  const pointerDriver: ControllerPointerDriver = {
    get capturedIds() {
      return capturedIds;
    },
    event(type, eventInput) {
      const event = new targetWindow.Event(type, {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperties(event, {
        pointerId: { value: eventInput.pointerId },
        clientX: { value: eventInput.clientX },
        clientY: { value: eventInput.clientY },
        button: { value: eventInput.button ?? 0 },
        buttons: {
          value:
            eventInput.buttons ??
            (type === "pointerdown" || type === "pointermove" ? 1 : 0),
        },
        isPrimary: { value: eventInput.isPrimary ?? true },
        pointerType: { value: eventInput.pointerType ?? "mouse" },
        altKey: { value: eventInput.altKey ?? false },
        ctrlKey: { value: eventInput.ctrlKey ?? false },
        metaKey: { value: eventInput.metaKey ?? false },
        shiftKey: { value: eventInput.shiftKey ?? false },
      });
      return event as PointerEvent;
    },
    failRelease(pointerId, error) {
      releaseFailures.set(pointerId, error);
    },
  };

  function createController(
    options?: ScrollbarControllerCreateOptions,
  ): ScrollbarController {
    const controller = createScrollbarController(elements, options);
    controllers.push(controller);
    return controller;
  }

  function createRuntime(
    options?: ScrollbarControllerCreateOptions,
  ): ScrollbarControllerRuntime {
    const runtime = createScrollbarControllerRuntime(elements, options);
    controllers.push(runtime.controller);
    return runtime;
  }

  return {
    elements,
    metrics,
    position,
    writes,
    events,
    frames: frameDriver,
    timers: timerDriver,
    resize: resizeDriver,
    pointer: pointerDriver,
    createController,
    createRuntime,
    clearTrace() {
      events.length = 0;
      writes.length = 0;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      const errors: unknown[] = [];
      for (const controller of controllers.reverse()) {
        appendError(errors, () => controller.destroy());
      }
      controllers.length = 0;
      for (const pointerId of capturedIds) {
        appendError(errors, () => holder.releasePointerCapture(pointerId));
      }
      for (const [handle] of frames) {
        appendError(errors, () => targetWindow.cancelAnimationFrame(handle));
      }
      for (const [handle] of timers) {
        appendError(errors, () => targetWindow.clearTimeout(handle));
      }
      for (const restore of rollback.reverse()) {
        appendError(errors, restore);
      }
      appendError(errors, () => holder.remove());
      surfaceCleanupErrors(errors);
    },
  };
  } catch (setupError) {
    const errors: unknown[] = [setupError];
    for (const restore of rollback.reverse()) {
      appendError(errors, restore);
    }
    if (mountedHolder !== undefined) {
      appendError(errors, () => mountedHolder.remove());
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    throw new AggregateError(errors, "controller test scenario setup failed");
  }
}
