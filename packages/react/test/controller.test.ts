// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createScrollbarController,
  type ScrollbarController,
  type ScrollbarControllerInput,
  type ScrollbarControllerIngress,
  type ScrollbarControllerElements,
  type ScrollbarControllerOptions,
} from "../src/core/index.js";
import type { ScrollaState } from "../src/value-types.js";
import * as publicEntry from "../src/index.js";
import {
  createControllerTestScenario,
  type ControllerTestScenario,
} from "./support/controller-test-platform.js";

const scenarios: ControllerTestScenario[] = [];

function disposeScenarios(): void {
  const errors: unknown[] = [];
  for (const scenario of scenarios.splice(0).reverse()) {
    try {
      scenario.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "controller test scenarios cleanup failed");
  }
}

afterEach(disposeScenarios);

function keyDown(
  key: string,
  modifiers: Partial<
    Pick<KeyboardEventInit, "altKey" | "ctrlKey" | "metaKey">
  > = {},
): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
}

function keyboardInput(ingress: ScrollbarControllerIngress): {
  dispatch(axis: "horizontal" | "vertical", event: KeyboardEvent): void;
} {
  return {
    dispatch(axis, event) {
      ingress.dispatch({ type: "thumb-key-down", axis, event });
    },
  };
}

function eventCaptureOption(
  options: boolean | EventListenerOptions | undefined,
): boolean {
  return typeof options === "boolean" ? options : (options?.capture ?? false);
}

const zeroState: ScrollaState = {
  position: { x: 0, y: 0 },
  maxPosition: { x: 0, y: 0 },
  viewportSize: { width: 0, height: 0 },
  contentSize: { width: 0, height: 0 },
  overflow: { horizontal: false, vertical: false },
  scrolling: false,
  draggingAxis: null,
  visibility: "visible",
};

function expectZeroThumbGeometry(elements: ScrollbarControllerElements): void {
  expect(elements.thumbHorizontal.style.width).toBe("0px");
  expect(elements.thumbHorizontal.style.transform).toBe("translateX(0px)");
  expect(elements.thumbVertical.style.height).toBe("0px");
  expect(elements.thumbVertical.style.transform).toBe("translateY(0px)");
}

describe("createScrollbarController", () => {
  test("scenario finalizer는 dispose 오류 뒤에도 역순 cleanup을 계속하고 오류를 보존한다", () => {
    const calls: string[] = [];
    const singleError = new Error("single dispose failure");
    scenarios.push(
      {
        dispose() {
          calls.push("single:first");
        },
      } as unknown as ControllerTestScenario,
      {
        dispose() {
          calls.push("single:second");
          throw singleError;
        },
      } as unknown as ControllerTestScenario,
      {
        dispose() {
          calls.push("single:third");
        },
      } as unknown as ControllerTestScenario,
    );
    let singleThrown: unknown;
    try {
      disposeScenarios();
    } catch (error) {
      singleThrown = error;
    }

    expect(calls).toEqual(["single:third", "single:second", "single:first"]);
    expect(singleThrown).toBe(singleError);

    calls.length = 0;
    const firstError = new Error("first dispose failure");
    const thirdError = new Error("third dispose failure");
    scenarios.push(
      {
        dispose() {
          calls.push("multiple:first");
          throw firstError;
        },
      } as unknown as ControllerTestScenario,
      {
        dispose() {
          calls.push("multiple:second");
        },
      } as unknown as ControllerTestScenario,
      {
        dispose() {
          calls.push("multiple:third");
          throw thirdError;
        },
      } as unknown as ControllerTestScenario,
    );
    let multipleThrown: unknown;
    try {
      disposeScenarios();
    } catch (error) {
      multipleThrown = error;
    }

    expect(calls).toEqual([
      "multiple:third",
      "multiple:second",
      "multiple:first",
    ]);
    expect(multipleThrown).toBeInstanceOf(AggregateError);
    expect((multipleThrown as AggregateError).errors).toEqual([
      thirdError,
      firstError,
    ]);
  });

  test.each([
    ["horizontal lower", 10, 195, { x: 300 }, { x: 0, y: 0 }],
    ["horizontal middle", 50, 195, undefined, { x: 150, y: 0 }],
    ["horizontal upper", 89, 195, undefined, { x: 300, y: 0 }],
    ["vertical lower", 95, 0, { y: 600 }, { x: 0, y: 0 }],
    ["vertical middle", 95, 50, undefined, { x: 0, y: 300 }],
    ["vertical upper", 95, 99, undefined, { x: 0, y: 600 }],
  ] as const)(
    "track %s hit은 thumb 중심을 pointer에 맞춰 native position을 한 번 이동한다",
    (_name, clientX, clientY, initialPosition, expectedPosition) => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, pointer, position, writes } = scenario;
      const setPointerCapture = vi.spyOn(elements.holder, "setPointerCapture");
      const focusHorizontal = vi.spyOn(elements.thumbHorizontal, "focus");
      const focusVertical = vi.spyOn(elements.thumbVertical, "focus");
      const runtime = scenario.createRuntime({
        initialPosition,
      });
      const { controller } = runtime;
      const listener = vi.fn();
      controller.subscribe(listener);
      frames.runNext();
      scenario.clearTrace();
      listener.mockClear();

      const event = pointer.event("pointerdown", {
        pointerId: 1,
        clientX,
        clientY,
      });
      runtime.ingress.dispatch({ type: "holder-pointer-down", event });

      expect(event.defaultPrevented).toBe(true);
      expect(position).toEqual(expectedPosition);
      expect(writes).toHaveLength(1);
      expect(setPointerCapture).not.toHaveBeenCalled();
      expect(focusHorizontal).not.toHaveBeenCalled();
      expect(focusVertical).not.toHaveBeenCalled();
      expect(controller.getState().draggingAxis).toBeNull();

      expect(frames.pendingCount).toBe(1);
      frames.runNext();
      expect(controller.getState()).toMatchObject({
        position: expectedPosition,
        scrolling: true,
        draggingAxis: null,
      });
      expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
        reasons: ["scroll"],
      });
      controller.destroy();
    },
  );

  test("same-position valid track hit은 prevent만 하고 native write, activity, RAF와 notification을 만들지 않는다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { frames, pointer, position, writes } = scenario;
    const runtime = scenario.createRuntime();
    const { controller } = runtime;
    const listener = vi.fn();
    controller.subscribe(listener);
    frames.runNext();
    position.y = 300;
    scenario.clearTrace();
    listener.mockClear();

    const event = pointer.event("pointerdown", {
      pointerId: 2,
      clientX: 95,
      clientY: 50,
    });
    runtime.ingress.dispatch({ type: "holder-pointer-down", event });

    expect(event.defaultPrevented).toBe(true);
    expect(writes).toEqual([]);
    expect(controller.getState()).toMatchObject({
      position: { x: 0, y: 0 },
      scrolling: false,
      draggingAxis: null,
    });
    expect(frames.pendingCount).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    controller.destroy();
  });

  test("typed pointer ingress는 pre-init, cancelled와 retained geometry 없는 input을 side effect 없이 무시한다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    scenarios.push(scenario);
    const { events, frames, writes } = scenario;
    const runtime = scenario.createRuntime();
    const { controller } = runtime;

    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: {
        defaultPrevented: false,
        clientX: 100,
        clientY: 195,
      } as PointerEvent,
    });
    expect(writes).toEqual([]);
    expect(frames.pendingCount).toBe(1);

    frames.runNext();
    const state = controller.getState();
    scenario.clearTrace();
    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: {
        defaultPrevented: false,
        isPrimary: true,
        button: 0,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        clientX: 100,
        clientY: 195,
      } as PointerEvent,
    });
    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: {
        defaultPrevented: true,
        clientX: 40,
        clientY: 195,
      } as PointerEvent,
    });
    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: {
        defaultPrevented: false,
        clientX: Number.NaN,
        clientY: 195,
      } as PointerEvent,
    });

    expect(controller.getState()).toBe(state);
    expect(writes).toEqual([]);
    expect(events).toEqual([]);
    expect(frames.pendingCount).toBe(0);
    controller.destroy();
  });

  test("typed ingress에 없는 discriminant는 internal programming error로 실패한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const runtime = scenario.createRuntime();
    const unknownInput = {
      type: "unknown-input",
    } as unknown as ScrollbarControllerInput;

    expect(() => runtime.ingress.dispatch(unknownInput)).toThrow(Error);

    runtime.controller.destroy();
  });

  test("controller와 active drag는 forbidden listener/event dispatch 없이 holder listener만 수명 관리한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { elements, frames, pointer } = scenario;
    const auditedTargets = [
      ["holder", elements.holder],
      ["trackHorizontal", elements.trackHorizontal],
      ["thumbHorizontal", elements.thumbHorizontal],
      ["trackVertical", elements.trackVertical],
      ["thumbVertical", elements.thumbVertical],
      ["document", document],
      ["window", window],
    ] as const;
    const listenerAudits = auditedTargets.map(([name, target]) => ({
      name,
      add: vi.spyOn(target, "addEventListener"),
      remove: vi.spyOn(target, "removeEventListener"),
    }));
    const dispatchEvent = vi.spyOn(EventTarget.prototype, "dispatchEvent");

    try {
      const runtime = scenario.createRuntime();
      const { controller } = runtime;
      frames.runNext();

      for (const audit of listenerAudits) {
        expect(audit.add.mock.calls, audit.name).toEqual([]);
      }

      runtime.ingress.dispatch({
        type: "holder-pointer-down",
        event: pointer.event("pointerdown", {
          pointerId: 31,
          clientX: 95,
          clientY: 10,
        }),
      });

      const holderAudit = listenerAudits[0];
      const activeListenerTypes = [
        "pointermove",
        "pointerup",
        "pointercancel",
        "lostpointercapture",
      ] as const;
      expect(holderAudit.add.mock.calls.map(([type]) => type)).toEqual(
        activeListenerTypes,
      );
      const forbiddenTypes = new Set([
        "wheel",
        "touchstart",
        "touchmove",
        "touchend",
        "touchcancel",
      ]);
      for (const audit of listenerAudits) {
        expect(
          audit.add.mock.calls.filter(([type]) =>
            forbiddenTypes.has(String(type)),
          ),
          audit.name,
        ).toEqual([]);
      }
      const forbiddenGlobalPointerTypes = new Set([
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "lostpointercapture",
      ]);
      for (const audit of listenerAudits.slice(-2)) {
        expect(
          audit.add.mock.calls.filter(([type]) =>
            forbiddenGlobalPointerTypes.has(String(type)),
          ),
          audit.name,
        ).toEqual([]);
      }

      const pointerUp = holderAudit.add.mock.calls.find(
        ([type]) => type === "pointerup",
      )?.[1] as EventListener;
      pointerUp(
        pointer.event("pointerup", {
          pointerId: 31,
          clientX: 95,
          clientY: 10,
        }),
      );

      expect(holderAudit.remove.mock.calls.map(([type]) => type)).toEqual(
        activeListenerTypes,
      );
      for (const type of activeListenerTypes) {
        const additions = holderAudit.add.mock.calls.filter(
          ([eventType]) => eventType === type,
        );
        const removals = holderAudit.remove.mock.calls.filter(
          ([eventType]) => eventType === type,
        );
        expect(additions, `${type} add`).toHaveLength(1);
        expect(removals, `${type} remove`).toHaveLength(1);
        const [, addedCallback, addedOptions] = additions[0]!;
        const [, removedCallback, removedOptions] = removals[0]!;
        expect(removedCallback, `${type} callback`).toBe(addedCallback);
        expect(eventCaptureOption(removedOptions), `${type} capture`).toBe(
          eventCaptureOption(addedOptions),
        );
      }
      expect(pointer.capturedIds.size).toBe(0);
      expect(
        dispatchEvent.mock.calls.filter(
          ([event]) => event.type === "wheel" || event.type === "scroll",
        ),
      ).toEqual([]);
      controller.destroy();
    } finally {
      dispatchEvent.mockRestore();
      for (const audit of listenerAudits) {
        audit.remove.mockRestore();
        audit.add.mockRestore();
      }
    }
  });

  test("destroy 뒤 captured pointer callback은 DOM read/write와 RAF를 만들지 않는다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    scenarios.push(scenario);
    const { elements, events, frames, pointer, writes } = scenario;
    const addListener = vi.spyOn(elements.holder, "addEventListener");
    const runtime = scenario.createRuntime();
    const { controller } = runtime;
    frames.runNext();
    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: pointer.event("pointerdown", {
        pointerId: 32,
        clientX: 95,
        clientY: 10,
      }),
    });
    frames.runNext();
    const staleMove = addListener.mock.calls.find(
      ([type]) => type === "pointermove",
    )?.[1] as EventListener;
    scenario.clearTrace();
    const requestCount = frames.requestCount;

    controller.destroy();
    const staleEvent = pointer.event("pointermove", {
      pointerId: 32,
      clientX: 95,
      clientY: 50,
    });
    const preventDefault = vi.spyOn(staleEvent, "preventDefault");
    const stopPropagation = vi.spyOn(staleEvent, "stopPropagation");
    const stopImmediatePropagation = vi.spyOn(
      staleEvent,
      "stopImmediatePropagation",
    );
    staleMove(staleEvent);

    expect(staleEvent.defaultPrevented).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(writes).toEqual([]);
    expect(frames.requestCount).toBe(requestCount);
    expect(frames.pendingCount).toBe(0);
    expect(pointer.capturedIds.size).toBe(0);
  });

  test("첫 준비 frame은 initialPosition을 clamp해 native write, state와 init notification으로 연결한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { elements, frames, metrics, position, writes } = scenario;
    metrics.clientWidth = 0;
    const controller = scenario.createController({
      initialPosition: { x: 500, y: 700 },
    });
    const listener = vi.fn();
    controller.subscribe(listener);

    frames.runNext();

    expect(controller.getState()).toEqual(zeroState);
    expect(listener).not.toHaveBeenCalled();

    metrics.clientWidth = 100;
    controller.refresh();
    frames.runNext();

    expect(position).toEqual({ x: 300, y: 600 });
    expect(writes).toEqual([
      ["x", 300],
      ["y", 600],
    ]);
    expect(controller.getState()).toEqual({
      ...zeroState,
      position: { x: 300, y: 600 },
      maxPosition: { x: 300, y: 600 },
      viewportSize: { width: 100, height: 200 },
      contentSize: { width: 400, height: 800 },
      overflow: { horizontal: true, vertical: true },
    });
    expect(elements.thumbHorizontal.style.transform).toBe("translateX(56px)");
    expect(elements.thumbVertical.style.transform).toBe("translateY(75px)");
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["init"],
    });

    metrics.scrollHeight = 1000;
    controller.refresh();
    frames.runNext();

    expect(listener).toHaveBeenLastCalledWith(controller.getState(), {
      reasons: ["geometry"],
    });
  });

  test("initialPosition native write의 후속 scroll event는 activity가 아니고 그 다음 genuine event는 activity다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { elements, frames, timers } = scenario;
    const controller = scenario.createController({
      initialPosition: { x: 120, y: 240 },
      scrollIdleDelay: 100,
    });
    const listener = vi.fn();
    controller.subscribe(listener);

    frames.runNext();
    expect(controller.getState().position).toEqual({ x: 120, y: 240 });
    expect(controller.getState().scrolling).toBe(false);
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["init"],
    });
    listener.mockClear();

    elements.scroller.dispatchEvent(new Event("scroll"));
    expect(frames.pendingCount).toBe(1);
    expect(timers.pendingCount).toBe(0);
    frames.runNext();

    expect(controller.getState().scrolling).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(timers.pendingCount).toBe(0);

    elements.scroller.dispatchEvent(new Event("scroll"));
    frames.runNext();

    expect(controller.getState().scrolling).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["scroll"],
    });
    expect(timers.pendingCount).toBe(1);
  });

  test("init 전 command는 initialPosition 위에서 순서대로 합성하고 준비 전에는 DOM write와 RAF를 만들지 않는다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { frames, metrics, position, writes } = scenario;
    metrics.clientWidth = 0;
    const controller = scenario.createController({
      initialPosition: { x: 100, y: 50 },
    });
    const listener = vi.fn();
    controller.subscribe(listener);

    frames.runNext();
    scenario.clearTrace();

    controller.scrollBy({ x: 20 });
    controller.scrollTo({ y: 80 });
    controller.scrollBy({ y: -10 });
    expect(() => controller.scrollTo({ x: Number.NaN })).toThrow(RangeError);

    expect(writes).toEqual([]);
    expect(frames.requestCount).toBe(1);
    expect(frames.pendingCount).toBe(0);
    expect(listener).not.toHaveBeenCalled();

    metrics.clientWidth = 100;
    controller.refresh();
    frames.runNext();

    expect(position).toEqual({ x: 120, y: 70 });
    expect(controller.getState().position).toEqual({ x: 120, y: 70 });
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["init"],
    });
  });

  test("init 뒤 command는 pending intent를 합성해 native를 동기 write하고 scroll RAF 하나로 commit한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { elements, frames, writes } = scenario;
    const controller = scenario.createController();
    const listener = vi.fn();
    let scrollEvents = 0;
    elements.scroller.addEventListener("scroll", () => {
      scrollEvents += 1;
    });
    controller.subscribe(listener);

    frames.runNext();
    scenario.clearTrace();
    listener.mockClear();
    const previous = controller.getState();

    controller.scrollTo({ x: 1000 });
    controller.scrollBy({ x: -50 });
    controller.scrollBy({ y: 50 });

    expect(writes).toEqual([
      ["x", 300],
      ["x", 250],
      ["y", 50],
    ]);
    expect(controller.getState()).toBe(previous);
    expect(listener).not.toHaveBeenCalled();
    expect(scrollEvents).toBe(0);
    expect(frames.requestCount).toBe(2);
    expect(frames.pendingCount).toBe(1);

    frames.runNext();

    expect(controller.getState().position).toEqual({ x: 250, y: 50 });
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["scroll"],
    });
  });

  test.each([
    {
      name: "scrollTo absolute",
      command: (controller: ScrollbarController) => {
        controller.scrollTo({ x: 0 });
      },
      expected: 0,
    },
    {
      name: "scrollBy delta",
      command: (controller: ScrollbarController) => {
        controller.scrollBy({ x: 10 });
      },
      expected: 130,
    },
  ])(
    "native event의 RAF 전 $name command는 current DOM position을 base로 쓴다",
    ({ command, expected }) => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, position, writes } = scenario;
      const controller = scenario.createController();
      const listener = vi.fn();
      let scrollEvents = 0;
      elements.scroller.addEventListener("scroll", () => {
        scrollEvents += 1;
      });
      controller.subscribe(listener);
      frames.runNext();
      scenario.clearTrace();
      listener.mockClear();
      const committed = controller.getState();

      position.x = 120;
      elements.scroller.dispatchEvent(new Event("scroll"));
      command(controller);

      expect(position.x).toBe(expected);
      expect(writes).toEqual([["x", expected]]);
      expect(controller.getState()).toBe(committed);
      expect(controller.getState().position.x).toBe(0);
      expect(controller.getState().scrolling).toBe(false);
      expect(scrollEvents).toBe(1);
      expect(frames.pendingCount).toBe(1);

      frames.runNext();

      expect(controller.getState().position.x).toBe(expected);
      expect(controller.getState().scrolling).toBe(true);
      expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
        reasons: ["scroll"],
      });
    },
  );

  test.each([
    {
      name: "scrollTo absolute",
      command: (controller: ScrollbarController) => {
        controller.scrollTo({ x: 100 });
      },
      expected: 100,
    },
    {
      name: "scrollBy delta",
      command: (controller: ScrollbarController) => {
        controller.scrollBy({ x: 10 });
      },
      expected: 130,
    },
  ])(
    "command -> native scroll -> command 순서에서 두 번째 $name command는 stale pendingPosition이 아닌 최신 native position을 base로 쓴다",
    ({ command, expected }) => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, position, writes } = scenario;
      const controller = scenario.createController();
      const listener = vi.fn();
      let scrollEvents = 0;
      elements.scroller.addEventListener("scroll", () => {
        scrollEvents += 1;
      });
      controller.subscribe(listener);
      frames.runNext();
      scenario.clearTrace();
      listener.mockClear();
      const committed = controller.getState();

      controller.scrollTo({ x: 100 });
      expect(position.x).toBe(100);
      scenario.clearTrace();

      position.x = 120;
      elements.scroller.dispatchEvent(new Event("scroll"));

      command(controller);

      expect(position.x).toBe(expected);
      expect(writes).toEqual([["x", expected]]);
      expect(controller.getState()).toBe(committed);
      expect(controller.getState().position.x).toBe(0);
      expect(controller.getState().scrolling).toBe(false);
      expect(scrollEvents).toBe(1);
      expect(frames.pendingCount).toBe(1);

      frames.runNext();

      expect(controller.getState().position.x).toBe(expected);
      expect(controller.getState().scrolling).toBe(true);
      expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
        reasons: ["scroll"],
      });
    },
  );

  test("native scroll storm은 listener에서 DOM을 읽지 않고 한 frame의 scrolling snapshot으로 합류한다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    scenarios.push(scenario);
    const { elements, events, frames, position, timers } = scenario;
    const addListener = vi.spyOn(elements.scroller, "addEventListener");
    const controller = scenario.createController({
      scrollIdleDelay: 100,
    });
    const listener = vi.fn();
    controller.subscribe(listener);

    const scrollRegistrations = addListener.mock.calls.filter(
      ([type]) => type === "scroll",
    );
    expect(scrollRegistrations).toHaveLength(1);
    frames.runNext();
    scenario.clearTrace();
    listener.mockClear();
    position.x = 120;
    position.y = 240;

    elements.scroller.dispatchEvent(new Event("scroll"));
    elements.scroller.dispatchEvent(new Event("scroll"));
    elements.scroller.dispatchEvent(new Event("scroll"));

    expect(events).toEqual([]);
    expect(frames.pendingCount).toBe(1);
    frames.runNext();

    expect(events.filter((event) => event.includes("scroll"))).toEqual([
      "read scrollLeft",
      "read scrollTop",
    ]);
    expect(controller.getState().position).toEqual({ x: 120, y: 240 });
    expect(controller.getState().scrolling).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["scroll"],
    });
    expect(timers.pendingCount).toBe(1);

    scenario.clearTrace();
    listener.mockClear();
    timers.advance(90);
    elements.scroller.dispatchEvent(new Event("scroll"));
    frames.runNext();

    expect(events.filter((event) => event.includes("scroll"))).toEqual([
      "read scrollLeft",
      "read scrollTop",
    ]);
    expect(listener).not.toHaveBeenCalled();
    timers.advance(99);
    timers.runDue();
    expect(controller.getState().scrolling).toBe(true);
    timers.advance(1);
    timers.runDue();
    expect(frames.pendingCount).toBe(1);
    frames.runNext();

    expect(controller.getState().position).toEqual({ x: 120, y: 240 });
    expect(controller.getState().scrolling).toBe(false);
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["scroll"],
    });
  });

  test("실제 command 이동은 native event 없이 activity를 시작하고 delay 0도 true snapshot 뒤 idle한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { frames, timers } = scenario;
    const controller = scenario.createController({
      scrollIdleDelay: 0,
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    frames.runNext();
    listener.mockClear();

    controller.scrollTo({ x: 50 });
    expect(timers.pendingCount).toBe(0);
    frames.runNext();

    expect(controller.getState().position).toEqual({ x: 50, y: 0 });
    expect(controller.getState().scrolling).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["scroll"],
    });
    expect(timers.pendingCount).toBe(1);

    listener.mockClear();
    timers.runDue();
    expect(controller.getState().scrolling).toBe(true);
    frames.runNext();
    expect(controller.getState().scrolling).toBe(false);
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["scroll"],
    });

    listener.mockClear();
    controller.scrollTo({ x: 50 });
    expect(frames.pendingCount).toBe(0);
    expect(timers.pendingCount).toBe(0);
    expect(listener).not.toHaveBeenCalled();
  });

  test("init 전 command의 실제 최종 이동만 init snapshot activity가 된다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { frames, metrics, timers } = scenario;
    metrics.clientWidth = 0;
    const controller = scenario.createController({
      initialPosition: { x: 100 },
      scrollIdleDelay: 100,
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    frames.runNext();

    controller.scrollBy({ x: 20 });
    metrics.clientWidth = 100;
    controller.refresh();
    frames.runNext();

    expect(controller.getState().position.x).toBe(120);
    expect(controller.getState().scrolling).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["init"],
    });
    expect(timers.pendingCount).toBe(1);
    controller.destroy();

    const unchangedScenario = createControllerTestScenario();
    scenarios.push(unchangedScenario);
    const unchanged = unchangedScenario.createController({
      initialPosition: { x: 100 },
    });
    unchanged.scrollTo({ x: 100 });
    unchangedScenario.frames.runNext();

    expect(unchanged.getState().position.x).toBe(100);
    expect(unchanged.getState().scrolling).toBe(false);
    expect(unchangedScenario.timers.pendingCount).toBe(0);
  });

  test("inactive axis initialPosition은 init에서 소비되고 re-enable 뒤 복원되지 않는다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { frames, position } = scenario;
    const controller = scenario.createController({
      axis: "vertical",
      initialPosition: { x: 150, y: 300 },
    });

    frames.runNext();
    expect(position).toEqual({ x: 0, y: 300 });
    expect(controller.getState().position).toEqual({ x: 0, y: 300 });

    controller.updateOptions({ axis: "both" });
    frames.runNext();

    expect(position).toEqual({ x: 0, y: 300 });
    expect(controller.getState().position).toEqual({ x: 0, y: 300 });
  });

  test("scrollIdleDelay 변경은 검증 성공 뒤 마지막 activity 시각에서 timer를 다시 계산한다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["captured-callbacks"],
    });
    scenarios.push(scenario);
    const { elements, frames, timers } = scenario;
    const controller = scenario.createController({
      scrollIdleDelay: 100,
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    frames.runNext();
    listener.mockClear();

    elements.scroller.dispatchEvent(new Event("scroll"));
    frames.runNext();
    listener.mockClear();
    timers.advance(40);
    const activeTimer = timers.setCount;

    expect(() => controller.updateOptions({ scrollIdleDelay: -1 })).toThrow(
      RangeError,
    );
    expect(timers.setCount).toBe(activeTimer);
    expect(timers.pendingCount).toBe(1);
    expect(controller.getState().scrolling).toBe(true);
    expect(frames.pendingCount).toBe(0);

    controller.updateOptions({ scrollIdleDelay: 50 });
    timers.runCaptured(activeTimer);
    frames.runNext();
    expect(listener).not.toHaveBeenCalled();
    timers.advance(9);
    timers.runDue();
    expect(frames.pendingCount).toBe(0);
    timers.advance(1);
    timers.runDue();
    frames.runNext();

    expect(controller.getState().scrolling).toBe(false);
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["scroll"],
    });
  });

  test("elapsed보다 짧게 scrollIdleDelay를 바꾸면 true를 보존한 뒤 later RAF에서 idle한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { elements, frames, timers } = scenario;
    const controller = scenario.createController({
      scrollIdleDelay: 100,
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    frames.runNext();
    listener.mockClear();

    elements.scroller.dispatchEvent(new Event("scroll"));
    frames.runNext();
    expect(controller.getState().scrolling).toBe(true);
    listener.mockClear();
    timers.advance(80);

    controller.updateOptions({ scrollIdleDelay: 50 });
    expect(controller.getState().scrolling).toBe(true);
    frames.runNext();
    expect(controller.getState().scrolling).toBe(true);
    expect(listener).not.toHaveBeenCalled();

    timers.runDue();
    expect(controller.getState().scrolling).toBe(true);
    expect(frames.pendingCount).toBe(1);
    frames.runNext();

    expect(controller.getState().scrolling).toBe(false);
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["scroll"],
    });
  });

  test("timer, geometry, command와 native event invalidation은 pending RAF 하나로 합류한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { elements, frames, timers } = scenario;
    const controller = scenario.createController({
      scrollIdleDelay: 10,
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    frames.runNext();

    elements.scroller.dispatchEvent(new Event("scroll"));
    frames.runNext();
    listener.mockClear();
    timers.advance(10);
    timers.runDue();
    controller.refresh();
    controller.scrollTo({ x: 80 });
    elements.scroller.dispatchEvent(new Event("scroll"));

    expect(frames.pendingCount).toBe(1);
    frames.runNext();
    expect(controller.getState().position.x).toBe(80);
    expect(controller.getState().scrolling).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["scroll", "geometry"],
    });
  });

  test("destroy는 scroll listener, timer와 RAF를 정리하고 captured callback을 무효화한다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["captured-callbacks", "resource-events"],
    });
    scenarios.push(scenario);
    const { elements, events, frames, timers } = scenario;
    const addListener = vi.spyOn(elements.scroller, "addEventListener");
    const removeListener = vi.spyOn(elements.scroller, "removeEventListener");
    const controller = scenario.createController({
      scrollIdleDelay: 100,
    });
    frames.runNext();
    elements.scroller.dispatchEvent(new Event("scroll"));
    frames.runNext();
    const staleTimer = timers.setCount;
    const staleListener = addListener.mock.calls.find(
      ([type]) => type === "scroll",
    )?.[1] as EventListener;
    controller.refresh();
    scenario.clearTrace();

    controller.destroy();
    timers.runCaptured(staleTimer);
    staleListener(new Event("scroll"));
    elements.scroller.dispatchEvent(new Event("scroll"));

    expect(
      removeListener.mock.calls.filter(([type]) => type === "scroll"),
    ).toHaveLength(1);
    expect(timers.pendingCount).toBe(0);
    expect(frames.cancelCount).toBe(1);
    expect(frames.pendingCount).toBe(0);
    expect(frames.requestCount).toBe(3);
    expect(events).toEqual([
      "raf:3",
      "listener:scroller:scroll",
      "timer:1",
      "observer:0",
    ]);
  });

  test("no-overflow와 disabled axis command는 write, RAF, notification을 만들지 않는다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { frames, metrics, position, writes } = scenario;
    metrics.scrollWidth = 100;
    metrics.scrollHeight = 200;
    const controller = scenario.createController({
      axis: "vertical",
    });
    const listener = vi.fn();
    controller.subscribe(listener);

    frames.runNext();
    scenario.clearTrace();
    listener.mockClear();

    controller.scrollTo({ x: 50, y: 50 });
    controller.scrollBy({ x: Number.MAX_VALUE, y: -Number.MAX_VALUE });

    expect(position).toEqual({ x: 0, y: 0 });
    expect(writes).toEqual([]);
    expect(frames.requestCount).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });

  test("axis disable이 pending인 동안 disabled axis absolute와 relative command를 무시한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { frames, position, timers, writes } = scenario;
    const controller = scenario.createController({
      initialPosition: { x: 150, y: 300 },
      scrollIdleDelay: 100,
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    frames.runNext();
    scenario.clearTrace();
    listener.mockClear();

    controller.updateOptions({ axis: "vertical", scrollIdleDelay: 100 });
    controller.scrollTo({ x: 250 });
    controller.scrollBy({ x: 25 });

    expect(position).toEqual({ x: 150, y: 300 });
    expect(writes).toEqual([]);
    expect(controller.getState().position).toEqual({ x: 150, y: 300 });
    expect(controller.getState().scrolling).toBe(false);
    expect(timers.pendingCount).toBe(0);
    expect(frames.pendingCount).toBe(1);

    frames.runNext();

    expect(position).toEqual({ x: 0, y: 300 });
    expect(controller.getState().position).toEqual({ x: 0, y: 300 });
    expect(controller.getState().scrolling).toBe(false);
    expect(timers.pendingCount).toBe(0);
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["geometry"],
    });
  });

  test("post-init axis disable reset 뒤 re-enable은 이전 position을 복원하지 않는다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { frames, position } = scenario;
    const controller = scenario.createController({
      initialPosition: { x: 150, y: 300 },
    });

    frames.runNext();
    controller.updateOptions({ axis: "vertical" });
    frames.runNext();
    expect(position).toEqual({ x: 0, y: 300 });
    expect(controller.getState().position).toEqual({ x: 0, y: 300 });

    controller.updateOptions({ axis: "both" });
    frames.runNext();

    expect(position).toEqual({ x: 0, y: 300 });
    expect(controller.getState().position).toEqual({ x: 0, y: 300 });
  });

  test("pending geometry refresh와 command storm은 RAF 하나에서 최종 position을 commit한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { frames, position, writes } = scenario;
    const controller = scenario.createController();
    const listener = vi.fn();
    controller.subscribe(listener);

    frames.runNext();
    scenario.clearTrace();
    listener.mockClear();

    controller.refresh();
    controller.scrollTo({ x: 150 });
    controller.scrollBy({ x: 50, y: 60 });

    expect(position).toEqual({ x: 200, y: 60 });
    expect(writes).toEqual([
      ["x", 150],
      ["x", 200],
      ["y", 60],
    ]);
    expect(frames.requestCount).toBe(2);
    expect(frames.pendingCount).toBe(1);

    frames.runNext();

    expect(controller.getState().position).toEqual({ x: 200, y: 60 });
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["scroll", "geometry"],
    });
  });

  test("axis=vertical은 horizontal zero를 무시해 첫 유효 init을 만들고 contentLength=0도 init한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { frames, metrics } = scenario;
    metrics.clientWidth = 0;
    metrics.horizontalTrack.width = 0;
    const verticalController = scenario.createController({
      axis: "vertical",
    });
    const verticalListener = vi.fn();
    verticalController.subscribe(verticalListener);

    frames.runNext();

    expect(verticalController.getState().overflow).toEqual({
      horizontal: false,
      vertical: true,
    });
    expect(verticalListener).toHaveBeenCalledExactlyOnceWith(
      verticalController.getState(),
      { reasons: ["init"] },
    );

    const noOverflowScenario = createControllerTestScenario();
    scenarios.push(noOverflowScenario);
    const noOverflowMetrics = noOverflowScenario.metrics;
    noOverflowMetrics.scrollWidth = 0;
    noOverflowMetrics.scrollHeight = 0;
    const noOverflowController = noOverflowScenario.createController();
    const noOverflowListener = vi.fn();
    noOverflowController.subscribe(noOverflowListener);

    noOverflowScenario.frames.runNext();

    expect(noOverflowController.getState()).toEqual({
      ...zeroState,
      viewportSize: { width: 100, height: 200 },
    });
    expect(noOverflowListener).toHaveBeenCalledExactlyOnceWith(
      noOverflowController.getState(),
      { reasons: ["init"] },
    );
  });

  test("geometry 변화로 overflow가 사라지면 public과 native position을 모두 zero로 reset한다", () => {
    const scenario = createControllerTestScenario({
      initialPosition: { x: 150, y: 300 },
    });
    scenarios.push(scenario);
    const { frames, metrics, position, writes } = scenario;
    const controller = scenario.createController({
      initialPosition: { x: 150, y: 300 },
    });

    frames.runNext();
    scenario.clearTrace();
    metrics.scrollWidth = 100;
    metrics.scrollHeight = 200;
    controller.refresh();
    frames.runNext();

    expect(controller.getState()).toEqual({
      ...zeroState,
      viewportSize: { width: 100, height: 200 },
      contentSize: { width: 100, height: 200 },
    });
    expect(position).toEqual({ x: 0, y: 0 });
    expect(writes).toEqual([
      ["x", 0],
      ["y", 0],
    ]);
  });

  test("detached 8-div topology에서 zero snapshot controller를 만든다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    scenario.elements.holder.remove();
    const controller = scenario.createController();

    expect(controller.getState()).toEqual(zeroState);
    expect(Object.keys(controller).sort()).toEqual([
      "destroy",
      "getState",
      "refresh",
      "scrollBy",
      "scrollTo",
      "subscribe",
      "updateOptions",
    ]);
    expect(scenario.frames.requestCount).toBe(1);
    expect(scenario.frames.cancelCount).toBe(0);
  });

  test("zero snapshot과 모든 nested value를 freeze한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    scenario.elements.holder.remove();
    const state = scenario.createController().getState();

    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.position)).toBe(true);
    expect(Object.isFrozen(state.maxPosition)).toBe(true);
    expect(Object.isFrozen(state.viewportSize)).toBe(true);
    expect(Object.isFrozen(state.contentSize)).toBe(true);
    expect(Object.isFrozen(state.overflow)).toBe(true);
  });

  describe("geometry boundary matrix", () => {
    test("detached holder는 양 axis public state와 thumb를 zero geometry로 만든다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames } = scenario;
      elements.holder.remove();
      const controller = scenario.createController();

      frames.runNext();

      expect(controller.getState()).toEqual(zeroState);
      expectZeroThumbGeometry(elements);
    });

    test("init 전 active horizontal viewport가 zero이면 readiness를 충족하지 못한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, metrics } = scenario;
      metrics.clientWidth = 0;
      const controller = scenario.createController();

      frames.runNext();

      expect(controller.getState()).toEqual(zeroState);
      expect(elements.thumbHorizontal.style.width).toBe("0px");
      expect(elements.thumbHorizontal.style.transform).toBe("translateX(0px)");
      expect(elements.thumbVertical.style.height).toBe("0px");
      expect(elements.thumbVertical.style.transform).toBe("translateY(0px)");
    });

    test("init 전 active vertical track이 zero이면 readiness를 충족하지 못한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, metrics } = scenario;
      metrics.verticalTrack.height = 0;
      const controller = scenario.createController();

      frames.runNext();

      expect(controller.getState()).toEqual(zeroState);
      expect(elements.thumbHorizontal.style.width).toBe("0px");
      expect(elements.thumbHorizontal.style.transform).toBe("translateX(0px)");
      expect(elements.thumbVertical.style.height).toBe("0px");
      expect(elements.thumbVertical.style.transform).toBe("translateY(0px)");
    });

    test("post-init horizontal이 측정 불가가 되면 vertical physical/public geometry는 유지한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, metrics } = scenario;
      const controller = scenario.createController();
      frames.runNext();

      metrics.clientWidth = 0;
      controller.refresh();
      frames.runNext();

      expect(controller.getState()).toEqual({
        ...zeroState,
        maxPosition: { x: 0, y: 600 },
        viewportSize: { width: 0, height: 200 },
        contentSize: { width: 0, height: 800 },
        overflow: { horizontal: false, vertical: true },
      });
      expect(elements.thumbHorizontal.style.width).toBe("0px");
      expect(elements.thumbVertical.style.height).toBe("25px");
    });

    test("post-init vertical이 측정 불가가 되면 horizontal physical/public geometry는 유지한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, metrics } = scenario;
      const controller = scenario.createController();
      frames.runNext();

      metrics.verticalTrack.height = 0;
      controller.refresh();
      frames.runNext();

      expect(controller.getState()).toEqual({
        ...zeroState,
        maxPosition: { x: 300, y: 0 },
        viewportSize: { width: 100, height: 0 },
        contentSize: { width: 400, height: 0 },
        overflow: { horizontal: true, vertical: false },
      });
      expect(elements.thumbHorizontal.style.width).toBe("24px");
      expect(elements.thumbVertical.style.height).toBe("0px");
    });

    test("no-overflow는 physical size를 유지하고 effective state와 thumb를 zero로 만든다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, metrics } = scenario;
      metrics.scrollWidth = 100;
      metrics.scrollHeight = 200;
      const controller = scenario.createController();

      frames.runNext();

      expect(controller.getState()).toEqual({
        ...zeroState,
        viewportSize: { width: 100, height: 200 },
        contentSize: { width: 100, height: 200 },
      });
      expectZeroThumbGeometry(elements);
    });

    test("contentLength=0은 physical viewport를 유지하고 effective state와 thumb를 zero로 만든다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, metrics } = scenario;
      metrics.scrollWidth = 0;
      metrics.scrollHeight = 0;
      const controller = scenario.createController();

      frames.runNext();

      expect(controller.getState()).toEqual({
        ...zeroState,
        viewportSize: { width: 100, height: 200 },
      });
      expectZeroThumbGeometry(elements);
    });

    test("axis=vertical은 disabled horizontal의 physical size를 유지하고 effective state와 thumb만 zero로 만든다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames } = scenario;
      const controller = scenario.createController({
        axis: "vertical",
      });

      frames.runNext();

      expect(controller.getState()).toEqual({
        ...zeroState,
        maxPosition: { x: 0, y: 600 },
        viewportSize: { width: 100, height: 200 },
        contentSize: { width: 400, height: 800 },
        overflow: { horizontal: false, vertical: true },
      });
      expect(elements.thumbHorizontal.style.width).toBe("0px");
      expect(elements.thumbHorizontal.style.transform).toBe("translateX(0px)");
      expect(elements.thumbVertical.style.height).toBe("25px");
      expect(elements.thumbVertical.style.transform).toBe("translateY(0px)");
    });

    test("fractional track보다 큰 min thumb는 track 길이 thumb와 zero offset을 쓴다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, metrics } = scenario;
      metrics.verticalTrack.height = 12.5;
      const controller = scenario.createController({
        minThumbSize: 24,
      });

      frames.runNext();

      expect(controller.getState()).toEqual({
        ...zeroState,
        maxPosition: { x: 300, y: 600 },
        viewportSize: { width: 100, height: 200 },
        contentSize: { width: 400, height: 800 },
        overflow: { horizontal: true, vertical: true },
      });
      expect(elements.thumbVertical.style.height).toBe("12.5px");
      expect(elements.thumbVertical.style.transform).toBe("translateY(0px)");
    });

    test("invalid DOM metric은 public state와 CSS에 non-finite, negative, -0을 남기지 않는다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, metrics } = scenario;
      metrics.clientWidth = Number.NaN;
      metrics.clientHeight = -0;
      metrics.scrollWidth = Number.POSITIVE_INFINITY;
      metrics.scrollHeight = -100;
      metrics.horizontalTrack.width = Number.NEGATIVE_INFINITY;
      metrics.verticalTrack.height = Number.NaN;
      const controller = scenario.createController();

      frames.runNext();

      const state = controller.getState();
      const numericValues = [
        state.position.x,
        state.position.y,
        state.maxPosition.x,
        state.maxPosition.y,
        state.viewportSize.width,
        state.viewportSize.height,
        state.contentSize.width,
        state.contentSize.height,
      ];
      expect(numericValues.every(Number.isFinite)).toBe(true);
      expect(
        numericValues.some((value) => value < 0 || Object.is(value, -0)),
      ).toBe(false);
      expect(state).toEqual(zeroState);
      expectZeroThumbGeometry(elements);
    });
  });

  test("connected 생성은 최초 geometry RAF를 하나 예약하고 첫 commit notification을 보류한다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    scenarios.push(scenario);
    const { events, frames, metrics } = scenario;
    const controller = scenario.createController();
    const listener = vi.fn();

    controller.subscribe(listener);

    expect(frames.requestCount).toBe(1);
    controller.refresh();
    controller.updateOptions({ minThumbSize: 32 });
    expect(frames.requestCount).toBe(1);
    expect(frames.pendingCount).toBe(1);

    frames.runNext();

    expect(controller.getState()).toEqual({
      position: { x: 0, y: 0 },
      maxPosition: { x: 300, y: 600 },
      viewportSize: { width: 100, height: 200 },
      contentSize: { width: 400, height: 800 },
      overflow: { horizontal: true, vertical: true },
      scrolling: false,
      draggingAxis: null,
      visibility: "visible",
    });
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["init"],
    });

    metrics.scrollHeight = 1000;
    controller.refresh();
    expect(frames.requestCount).toBe(2);
    frames.runNext();

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith(controller.getState(), {
      reasons: ["geometry"],
    });

    scenario.clearTrace();
    controller.updateOptions({ autoHide: true, minThumbSize: 32 });
    expect(frames.requestCount).toBe(3);
    frames.runNext();

    expect(events).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("detached 최초 geometry 뒤 attach와 refresh의 변경 state를 한 번 notification한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { elements, frames } = scenario;
    elements.holder.remove();
    const controller = scenario.createController();
    const listener = vi.fn();
    controller.subscribe(listener);

    frames.runNext();

    expect(controller.getState()).toEqual(zeroState);
    expect(listener).not.toHaveBeenCalled();

    document.body.append(elements.holder);
    controller.refresh();
    frames.runNext();

    expect(controller.getState()).toEqual({
      ...zeroState,
      maxPosition: { x: 300, y: 600 },
      viewportSize: { width: 100, height: 200 },
      contentSize: { width: 400, height: 800 },
      overflow: { horizontal: true, vertical: true },
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(controller.getState(), {
      reasons: ["init"],
    });
  });

  test("ResizeObserver는 네 geometry source를 관찰하고 callback과 refresh를 한 RAF에 합류시킨다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    scenarios.push(scenario);
    const { elements, events, frames, metrics, resize } = scenario;
    const controller = scenario.createController();

    expect(resize.instanceCount).toBe(1);
    expect(resize.observed(0)).toHaveLength(4);
    expect(resize.observed(0)[0]).toBe(elements.scroller);
    expect(resize.observed(0)[1]).toBe(elements.content);
    expect(resize.observed(0)[2]).toBe(elements.trackVertical);
    expect(resize.observed(0)[3]).toBe(elements.trackHorizontal);
    expect(resize.observed(0)).not.toContain(elements.thumbVertical);
    expect(resize.observed(0)).not.toContain(elements.thumbHorizontal);

    frames.runNext();
    const initialHorizontalWidth = elements.thumbHorizontal.style.width;
    scenario.clearTrace();
    metrics.horizontalTrack.width = 200;

    resize.emit();

    expect(events).toEqual([]);
    expect(elements.thumbHorizontal.style.width).toBe(initialHorizontalWidth);
    expect(frames.requestCount).toBe(2);
    expect(frames.pendingCount).toBe(1);

    controller.refresh();
    resize.emit();

    expect(frames.requestCount).toBe(2);
    expect(frames.pendingCount).toBe(1);

    frames.runNext();

    expect(
      events.filter(
        (event) =>
          event.startsWith("read ") &&
          event !== "read scrollLeft" &&
          event !== "read scrollTop",
      ),
    ).toEqual([
      "read clientWidth",
      "read clientHeight",
      "read scrollWidth",
      "read scrollHeight",
      "read horizontal rect",
      "read vertical rect",
    ]);
    expect(elements.thumbHorizontal.style.width).toBe("50px");
  });

  test("ResizeObserver가 없으면 최초 측정과 refresh 수동 복구를 유지한다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    scenarios.push(scenario);
    const { events, frames, metrics } = scenario;
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: undefined,
    });
    const controller = scenario.createController();

    expect(frames.requestCount).toBe(1);
    frames.runNext();
    expect(controller.getState().contentSize).toEqual({
      width: 400,
      height: 800,
    });

    scenario.clearTrace();
    metrics.scrollHeight = 1000;
    controller.refresh();
    frames.runNext();

    expect(
      events.filter(
        (event) =>
          event.startsWith("read ") &&
          event !== "read scrollLeft" &&
          event !== "read scrollTop",
      ),
    ).toEqual([
      "read clientWidth",
      "read clientHeight",
      "read scrollWidth",
      "read scrollHeight",
      "read horizontal rect",
      "read vertical rect",
    ]);
    expect(controller.getState().contentSize).toEqual({
      width: 400,
      height: 1000,
    });
  });

  test("destroy는 observer를 해제하고 stale callback과 refresh를 no-op으로 만든다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    scenarios.push(scenario);
    const { events, frames, resize } = scenario;
    const controller = scenario.createController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.destroy();
    controller.destroy();
    resize.emit();
    controller.refresh();

    expect(resize.disconnectCount(0)).toBe(1);
    expect(frames.cancelCount).toBe(1);
    expect(frames.pendingCount).toBe(0);
    expect(frames.requestCount).toBe(1);
    expect(events).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  test("refresh와 변경된 option dirty를 같은 RAF에 합류시킨다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    scenario.elements.holder.remove();
    const controller = scenario.createController();
    const snapshot = controller.getState();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.refresh();
    controller.updateOptions({ axis: "vertical" });
    controller.updateOptions({ axis: "vertical", autoHide: true });

    expect(scenario.frames.requestCount).toBe(1);
    expect(scenario.frames.pendingCount).toBe(1);

    scenario.frames.runNext();

    expect(scenario.frames.pendingCount).toBe(0);
    expect(controller.getState()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
  });

  test.each<{
    readonly name: string;
    readonly options: ScrollbarControllerOptions;
  }>([
    { name: "geometry", options: { axis: "vertical" } },
    { name: "interaction", options: { autoHide: true } },
  ])("$name option 변경은 RAF를 예약한다", ({ options }) => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    scenario.elements.holder.remove();
    const controller = scenario.createController();

    controller.updateOptions(options);

    expect(scenario.frames.requestCount).toBe(1);
    expect(scenario.frames.pendingCount).toBe(1);
  });

  describe("getEffectiveDirection", () => {
    test("runtime ingress direction query의 초기값은 ltr이다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const runtime = scenario.createRuntime();
      expect(runtime.ingress.getEffectiveDirection()).toBe("ltr");
    });

    test("explicit rtl option은 첫 geometry RAF 뒤 반영된다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const runtime = scenario.createRuntime({
        direction: "rtl",
      });
      scenario.frames.runNext();
      expect(runtime.ingress.getEffectiveDirection()).toBe("rtl");
    });

    test("direction option 변경은 다음 geometry RAF 뒤 반영된다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const runtime = scenario.createRuntime();
      scenario.frames.runNext();
      expect(runtime.ingress.getEffectiveDirection()).toBe("ltr");

      runtime.controller.updateOptions({ direction: "rtl" });
      scenario.frames.runNext();
      expect(runtime.ingress.getEffectiveDirection()).toBe("rtl");
    });
  });

  describe("RTL scrollLeft 정규화", () => {
    // jsdom은 실제 layout이 없어 probe의 scrollLeft가 항상 0으로 남는다.
    // 그 결과 이 describe의 모든 케이스는 결정적으로 negative 모델로 감지된다.
    // model별 정확한 산술(default/negative, clamp, round-trip)은
    // rtl-scroll-model.test.ts가 주입된 stub으로 검증한다. 여기서는 pipeline과
    // command()가 raw<->logical 변환을 올바른 시점에 연결하는지만 검증한다.

    test("explicit rtl의 initialPosition은 raw scrollLeft로 변환되어 write되고 공개 state는 logical 값을 유지한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, position } = scenario;
      const controller = scenario.createController({
        direction: "rtl",
        initialPosition: { x: 120 },
      });

      frames.runNext();

      expect(controller.getState().position.x).toBe(120);
      expect(position.x).toBe(-120);

      controller.destroy();
    });

    test("explicit rtl에서 scrollTo는 raw scrollLeft로 변환해 write하고 logical position을 반환한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, position } = scenario;
      const controller = scenario.createController({
        direction: "rtl",
      });
      frames.runNext();
      scenario.clearTrace();

      controller.scrollTo({ x: 70 });

      expect(position.x).toBe(-70);
      expect(controller.getState().position.x).toBe(0);
      frames.runNext();
      expect(controller.getState().position.x).toBe(70);

      controller.destroy();
    });

    test("direction을 rtl로 바꾸면 logical position을 보존한 채 raw scrollLeft만 새 모델로 다시 쓴다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, position } = scenario;
      const controller = scenario.createController();
      frames.runNext();

      controller.scrollTo({ x: 70 });
      frames.runNext();
      expect(controller.getState().position.x).toBe(70);
      expect(position.x).toBe(70);
      scenario.clearTrace();

      controller.updateOptions({ direction: "rtl" });
      frames.runNext();

      expect(controller.getState().position.x).toBe(70);
      expect(position.x).toBe(-70);

      controller.destroy();
    });

    test("변경 없는 rtl scroll pass는 raw scale 불일치로 인한 불필요한 재write를 만들지 않는다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, position, writes } = scenario;
      const controller = scenario.createController({
        direction: "rtl",
        initialPosition: { x: 120 },
      });
      frames.runNext();
      expect(position.x).toBe(-120);
      scenario.clearTrace();

      controller.refresh();
      frames.runNext();

      expect(writes).toEqual([]);

      controller.destroy();
    });

    test("ltr 전용 controller는 scrollLeft model probe를 위해 document.createElement를 호출하지 않는다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const createElementSpy = vi.spyOn(document, "createElement");
      const controller = scenario.createController();

      scenario.frames.runNext();
      controller.scrollTo({ x: 10 });
      scenario.frames.runNext();

      expect(createElementSpy).not.toHaveBeenCalled();

      controller.destroy();
      createElementSpy.mockRestore();
    });

    test("iframe 안의 scroller는 iframe 자신의 document로 scrollLeft model을 감지한다", () => {
      const iframe = document.createElement("iframe");
      document.body.append(iframe);
      const iframeDocument = iframe.contentDocument;
      if (iframeDocument === null) {
        throw new Error("iframe contentDocument를 사용할 수 없습니다.");
      }
      const scenario = createControllerTestScenario({ document: iframeDocument });
      scenarios.push(scenario);
      const iframeCreateElementSpy = vi.spyOn(iframeDocument, "createElement");
      const topCreateElementSpy = vi.spyOn(document, "createElement");
      topCreateElementSpy.mockClear();

      const controller = scenario.createController({
        direction: "rtl",
        initialPosition: { x: 50 },
      });
      scenario.frames.runNext();

      expect(iframeCreateElementSpy).toHaveBeenCalled();
      expect(topCreateElementSpy).not.toHaveBeenCalled();

      controller.destroy();
      iframe.remove();
      iframeCreateElementSpy.mockRestore();
      topCreateElementSpy.mockRestore();
    });
  });

  test("같은 normalized options는 RAF를 예약하지 않는다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const controller = scenario.createController({
      axis: "vertical",
      autoHide: true,
    });

    controller.updateOptions({ axis: "vertical", autoHide: true });

    expect(scenario.frames.requestCount).toBe(1);
    expect(scenario.frames.pendingCount).toBe(1);
  });

  test("destroy는 pending RAF를 한 번 cancel하고 두 번째 호출은 no-op이다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const controller = scenario.createController();
    controller.refresh();

    controller.destroy();
    controller.destroy();

    expect(scenario.frames.cancelCount).toBe(1);
    expect(scenario.frames.pendingCount).toBe(0);
  });

  test("destroy 뒤 method는 validation과 저장 없이 no-op이고 마지막 snapshot identity를 유지한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const controller = scenario.createController();
    const snapshot = controller.getState();
    const listener = vi.fn();
    const unsubscribeBeforeDestroy = controller.subscribe(listener);
    controller.destroy();

    expect(() => controller.updateOptions({ minThumbSize: 0 })).not.toThrow();
    controller.refresh();
    expect(() => controller.scrollTo({ x: Number.NaN })).not.toThrow();
    expect(() => controller.scrollBy({ y: "invalid" } as never)).not.toThrow();
    const unsubscribeAfterDestroy = controller.subscribe(listener);
    unsubscribeBeforeDestroy();
    unsubscribeBeforeDestroy();
    unsubscribeAfterDestroy();
    unsubscribeAfterDestroy();

    expect(controller.getState()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
    expect(scenario.frames.requestCount).toBe(1);
  });

  test("cleanup 오류가 나도 destroy 상태를 먼저 고정하고 남은 호출을 no-op으로 만든다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const cleanupError = new Error("cancel failure");
    scenario.frames.failCancel(1, cleanupError);
    const controller = scenario.createController();
    const snapshot = controller.getState();
    controller.refresh();

    expect(() => controller.destroy()).toThrow(cleanupError);
    expect(() => controller.updateOptions({ minThumbSize: 0 })).not.toThrow();
    expect(() => controller.refresh()).not.toThrow();
    expect(() => controller.subscribe(vi.fn())()).not.toThrow();
    expect(controller.getState()).toBe(snapshot);
    expect(() => controller.destroy()).not.toThrow();
    expect(scenario.frames.cancelCount).toBe(1);
    expect(scenario.frames.requestCount).toBe(1);
  });

  test("create option 전체를 자원 예약 전에 검증한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);

    expect(() =>
      scenario.createController({
        initialPosition: { x: Number.NaN },
      }),
    ).toThrow(RangeError);
    expect(scenario.frames.requestCount).toBe(0);
    expect(scenario.frames.cancelCount).toBe(0);
  });

  test("updateOptions는 invalid replacement를 거부하고 state와 notification을 유지한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const controller = scenario.createController({
      axis: "vertical",
      minThumbSize: 32,
    });
    const snapshot = controller.getState();
    const listener = vi.fn();
    controller.subscribe(listener);

    expect(() => controller.updateOptions({ minThumbSize: 0 })).toThrow(
      RangeError,
    );
    expect(controller.getState()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();

    controller.updateOptions({ axis: "both" });
    expect(controller.getState()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
  });

  test("runtime frame request/cancel은 holder defaultView receiver를 보존한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    let requestUsedWindow = false;
    let cancelUsedWindow = false;
    Object.defineProperties(window, {
      requestAnimationFrame: {
        configurable: true,
        value: function requestAnimationFrame(
          this: Window,
          _callback: FrameRequestCallback,
        ) {
          void _callback;
          requestUsedWindow = this === window;
          return 1;
        },
      },
      cancelAnimationFrame: {
        configurable: true,
        value: function cancelAnimationFrame(this: Window, _handle: number) {
          void _handle;
          cancelUsedWindow = this === window;
        },
      },
    });

    const controller = scenario.createController();
    controller.destroy();

    expect(requestUsedWindow).toBe(true);
    expect(cancelUsedWindow).toBe(true);
  });

  test.each([
    {
      name: "div가 아닌 element",
      arrange: (elements: ScrollbarControllerElements) => ({
        ...elements,
        wrapper: document.createElement("span") as unknown as HTMLDivElement,
      }),
    },
    {
      name: "중복 identity",
      arrange: (elements: ScrollbarControllerElements) => ({
        ...elements,
        wrapper: elements.holder,
      }),
    },
    {
      name: "다른 ownerDocument",
      arrange: (elements: ScrollbarControllerElements) => {
        const foreignDocument =
          document.implementation.createHTMLDocument("foreign");
        return { ...elements, content: foreignDocument.createElement("div") };
      },
    },
    {
      name: "직접 부모가 아닌 topology",
      arrange: (elements: ScrollbarControllerElements) => {
        elements.holder.append(elements.thumbVertical);
        return elements;
      },
    },
  ])("%s이면 자원 예약 전에 TypeError를 던진다", ({ arrange }) => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);

    expect(() => createScrollbarController(arrange(scenario.elements))).toThrow(
      TypeError,
    );
    expect(scenario.frames.requestCount).toBe(0);
    expect(scenario.frames.cancelCount).toBe(0);
  });

  test("defaultView가 없으면 자원 예약 전에 TypeError를 던진다", () => {
    const detachedDocument =
      document.implementation.createHTMLDocument("detached");
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    Object.defineProperty(scenario.elements.scroller, "ownerDocument", {
      configurable: true,
      value: detachedDocument,
    });

    expect(detachedDocument.defaultView).toBeNull();
    expect(() => createScrollbarController(scenario.elements)).toThrow(TypeError);
  });

  test.each([
    ["requestAnimationFrame", undefined],
    ["cancelAnimationFrame", undefined],
  ] as const)(
    "%s가 없으면 자원 예약 전에 TypeError를 던진다",
    (name, value) => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      Object.defineProperty(window, name, { configurable: true, value });

      expect(() => scenario.createController()).toThrow(TypeError);
    },
  );

  test("public root는 private core를 export하지 않는다", () => {
    expect(Object.keys(publicEntry)).toEqual(["Scrolla"]);
  });

  describe("autoHide", () => {
    function autoHideInput(ingress: ScrollbarControllerIngress) {
      return {
        hoverEnter() {
          ingress.dispatch({ type: "holder-pointer-enter" });
        },
        hoverLeave() {
          ingress.dispatch({ type: "holder-pointer-leave" });
        },
        focusIn() {
          ingress.dispatch({ type: "holder-focus-in" });
        },
        focusOut(event: FocusEvent) {
          ingress.dispatch({ type: "holder-focus-out", event });
        },
      };
    }

    function relatedFocusEvent(relatedTarget: Node | null): FocusEvent {
      return { relatedTarget } as unknown as FocusEvent;
    }

    test("idle delay가 지나 hidden된 뒤 hover enter는 즉시 visible로 전환하고 visibility reason을 보고한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, timers } = scenario;
      const runtime = scenario.createRuntime({
        autoHide: true,
        autoHideDelay: 100,
      });
      const { controller } = runtime;
      frames.runNext();
      expect(controller.getState().visibility).toBe("visible");

      timers.advance(100);
      timers.runDue();
      frames.runNext();
      expect(controller.getState().visibility).toBe("hidden");

      const listener = vi.fn();
      controller.subscribe(listener);
      autoHideInput(runtime.ingress).hoverEnter();
      frames.runNext();

      expect(controller.getState().visibility).toBe("visible");
      expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
        reasons: ["visibility"],
      });
    });

    test("hover leave 뒤 idle delay가 지나면 hidden으로 전환하고 visibility reason을 보고한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, timers } = scenario;
      const runtime = scenario.createRuntime({
        autoHide: true,
        autoHideDelay: 100,
      });
      const { controller } = runtime;
      frames.runNext();
      autoHideInput(runtime.ingress).hoverEnter();
      const listener = vi.fn();
      controller.subscribe(listener);

      autoHideInput(runtime.ingress).hoverLeave();
      expect(frames.pendingCount).toBe(0);

      timers.advance(100);
      timers.runDue();
      frames.runNext();

      expect(controller.getState().visibility).toBe("hidden");
      expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
        reasons: ["visibility"],
      });
    });

    test("focus가 holder 내부로 이동하면 idle timer가 새로 시작되지 않는다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, timers } = scenario;
      const runtime = scenario.createRuntime({
        autoHide: true,
        autoHideDelay: 100,
      });
      const { controller } = runtime;
      frames.runNext();
      timers.advance(100);
      timers.runDue();
      frames.runNext();
      expect(controller.getState().visibility).toBe("hidden");

      autoHideInput(runtime.ingress).focusIn();
      frames.runNext();
      expect(controller.getState().visibility).toBe("visible");

      autoHideInput(runtime.ingress).focusOut(
        relatedFocusEvent(elements.thumbVertical),
      );
      expect(frames.pendingCount).toBe(0);

      timers.advance(10_000);
      timers.runDue();
      expect(frames.pendingCount).toBe(0);
      expect(controller.getState().visibility).toBe("visible");

    });

    test("focus가 holder 바깥으로 이동하면 idle delay 뒤 hidden으로 전환한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, timers } = scenario;
      const outside = document.createElement("div");
      document.body.append(outside);
      const runtime = scenario.createRuntime({
        autoHide: true,
        autoHideDelay: 100,
      });
      const { controller } = runtime;
      frames.runNext();

      autoHideInput(runtime.ingress).focusIn();
      autoHideInput(runtime.ingress).focusOut(relatedFocusEvent(outside));

      timers.advance(100);
      timers.runDue();
      frames.runNext();

      expect(controller.getState().visibility).toBe("hidden");
      outside.remove();
    });

    test("drag은 hidden 상태를 interaction reason 안에서 visible로 전환하고, idle timer 중에는 hidden되지 않다가 release 뒤 idle delay가 지나면 hidden된다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, pointer, timers } = scenario;
      const runtime = scenario.createRuntime({
        autoHide: true,
        autoHideDelay: 100,
      });
      const { controller } = runtime;
      frames.runNext();
      timers.advance(100);
      timers.runDue();
      frames.runNext();
      expect(controller.getState().visibility).toBe("hidden");

      const listener = vi.fn();
      controller.subscribe(listener);

      runtime.ingress.dispatch({
        type: "holder-pointer-down",
        event: pointer.event("pointerdown", {
          pointerId: 41,
          clientX: 95,
          clientY: 10,
        }),
      });
      frames.runNext();

      expect(controller.getState().draggingAxis).toBe("vertical");
      expect(controller.getState().visibility).toBe("visible");
      expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
        reasons: ["interaction"],
      });
      listener.mockClear();

      timers.advance(10_000);
      timers.runDue();
      expect(frames.pendingCount).toBe(0);
      expect(controller.getState().visibility).toBe("visible");

      elements.holder.dispatchEvent(
        pointer.event("pointerup", {
          pointerId: 41,
          clientX: 95,
          clientY: 10,
        }),
      );
      frames.runNext();
      expect(controller.getState().draggingAxis).toBeNull();

      timers.advance(100);
      timers.runDue();
      frames.runNext();
      expect(controller.getState().visibility).toBe("hidden");

    });

    test("autoHide가 false면 idle delay가 지나도 항상 visible이다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, timers } = scenario;
      const controller = scenario.createController({
        autoHide: false,
        autoHideDelay: 10,
      });
      frames.runNext();

      timers.advance(10_000);
      timers.runDue();
      expect(frames.pendingCount).toBe(0);
      expect(controller.getState().visibility).toBe("visible");

    });

    test("scroll activity 중에는 hidden되지 않고, scrollIdleDelay와 autoHideDelay가 순서대로 지나야 hidden된다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, timers } = scenario;
      const controller = scenario.createController({
        autoHide: true,
        autoHideDelay: 50,
        scrollIdleDelay: 100,
      });
      frames.runNext();
      timers.advance(50);
      timers.runDue();
      frames.runNext();
      expect(controller.getState().visibility).toBe("hidden");

      elements.scroller.dispatchEvent(new Event("scroll"));
      frames.runNext();
      expect(controller.getState().scrolling).toBe(true);
      expect(controller.getState().visibility).toBe("visible");

      timers.advance(100);
      timers.runDue();
      frames.runNext();
      expect(controller.getState().scrolling).toBe(false);
      expect(controller.getState().visibility).toBe("visible");

      timers.advance(50);
      timers.runDue();
      frames.runNext();
      expect(controller.getState().visibility).toBe("hidden");

    });
  });

  describe("keyboard 명령", () => {
    test("ArrowDown/ArrowUp이 vertical logical position을 40px씩 이동한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, position } = scenario;
      const runtime = scenario.createRuntime();
      const { controller } = runtime;
      frames.runNext();
      scenario.clearTrace();

      const down = keyDown("ArrowDown");
      keyboardInput(runtime.ingress).dispatch("vertical", down);
      frames.runNext();

      expect(controller.getState().position.y).toBe(40);
      expect(position.y).toBe(40);
      expect(down.defaultPrevented).toBe(true);

      const up = keyDown("ArrowUp");
      keyboardInput(runtime.ingress).dispatch("vertical", up);
      frames.runNext();

      expect(controller.getState().position.y).toBe(0);
      expect(up.defaultPrevented).toBe(true);

      controller.destroy();
    });

    test("LTR ArrowRight/ArrowLeft가 horizontal logical position을 40px씩 이동한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, position } = scenario;
      const runtime = scenario.createRuntime();
      const { controller } = runtime;
      frames.runNext();
      scenario.clearTrace();

      keyboardInput(runtime.ingress).dispatch(
        "horizontal",
        keyDown("ArrowRight"),
      );
      frames.runNext();
      expect(controller.getState().position.x).toBe(40);
      expect(position.x).toBe(40);

      keyboardInput(runtime.ingress).dispatch(
        "horizontal",
        keyDown("ArrowLeft"),
      );
      frames.runNext();
      expect(controller.getState().position.x).toBe(0);

      controller.destroy();
    });

    test("RTL effective direction에서 ArrowRight/ArrowLeft의 logical 증감이 LTR과 반대다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames } = scenario;
      const runtime = scenario.createRuntime({
        direction: "rtl",
        initialPosition: { x: 100 },
      });
      const { controller } = runtime;
      frames.runNext();
      expect(controller.getState().position.x).toBe(100);

      keyboardInput(runtime.ingress).dispatch(
        "horizontal",
        keyDown("ArrowRight"),
      );
      frames.runNext();
      expect(controller.getState().position.x).toBe(60);

      keyboardInput(runtime.ingress).dispatch(
        "horizontal",
        keyDown("ArrowLeft"),
      );
      frames.runNext();
      expect(controller.getState().position.x).toBe(100);

      controller.destroy();
    });

    test("PageUp/PageDown이 focus된 축의 viewport 크기만큼 이동한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames } = scenario;
      const runtime = scenario.createRuntime();
      const { controller } = runtime;
      frames.runNext();
      expect(controller.getState().viewportSize).toEqual({
        width: 100,
        height: 200,
      });
      scenario.clearTrace();

      keyboardInput(runtime.ingress).dispatch("vertical", keyDown("PageDown"));
      frames.runNext();
      expect(controller.getState().position.y).toBe(200);

      keyboardInput(runtime.ingress).dispatch("vertical", keyDown("PageUp"));
      frames.runNext();
      expect(controller.getState().position.y).toBe(0);

      controller.destroy();
    });

    test("Home/End가 logical 0과 maxPosition으로 이동한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames } = scenario;
      const runtime = scenario.createRuntime({
        initialPosition: { y: 300 },
      });
      const { controller } = runtime;
      frames.runNext();
      expect(controller.getState().maxPosition.y).toBe(600);

      keyboardInput(runtime.ingress).dispatch("vertical", keyDown("End"));
      frames.runNext();
      expect(controller.getState().position.y).toBe(600);

      keyboardInput(runtime.ingress).dispatch("vertical", keyDown("Home"));
      frames.runNext();
      expect(controller.getState().position.y).toBe(0);

      controller.destroy();
    });

    test("RTL effective direction에서도 PageUp/PageDown/Home/End는 mirror 없이 logical 단위로만 이동한다", () => {
      // Arrow와 달리 Page/Home/End는 화면 방향 키가 아니라 논리적 "큰 이동/끝점" 개념이므로
      // RTL이어도 반전하지 않는다(Home/End는 계약이 이미 명시). ArrowRight/Left만 반전되는
      // 비대칭이 의도된 설계임을 회귀 방지로 고정한다.
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames } = scenario;
      const runtime = scenario.createRuntime({
        direction: "rtl",
        initialPosition: { x: 100 },
      });
      const { controller } = runtime;
      frames.runNext();
      expect(controller.getState().maxPosition.x).toBe(300);

      keyboardInput(runtime.ingress).dispatch(
        "horizontal",
        keyDown("PageDown"),
      );
      frames.runNext();
      expect(controller.getState().position.x).toBe(200);

      keyboardInput(runtime.ingress).dispatch("horizontal", keyDown("PageUp"));
      frames.runNext();
      expect(controller.getState().position.x).toBe(100);

      keyboardInput(runtime.ingress).dispatch("horizontal", keyDown("End"));
      frames.runNext();
      expect(controller.getState().position.x).toBe(300);

      keyboardInput(runtime.ingress).dispatch("horizontal", keyDown("Home"));
      frames.runNext();
      expect(controller.getState().position.x).toBe(0);

      controller.destroy();
    });

    test("Alt/Ctrl/Meta 조합은 처리하지 않는다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, writes } = scenario;
      const runtime = scenario.createRuntime();
      const { controller } = runtime;
      frames.runNext();
      scenario.clearTrace();

      for (const modifiers of [
        { altKey: true },
        { ctrlKey: true },
        { metaKey: true },
      ]) {
        const event = keyDown("ArrowDown", modifiers);
        keyboardInput(runtime.ingress).dispatch("vertical", event);
        expect(event.defaultPrevented).toBe(false);
      }
      expect(writes).toEqual([]);

      controller.destroy();
    });

    test("no-overflow 축에서는 처리하지 않고 preventDefault도 호출하지 않는다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, writes } = scenario;
      const runtime = scenario.createRuntime({
        axis: "vertical",
      });
      const { controller } = runtime;
      frames.runNext();
      scenario.clearTrace();

      const event = keyDown("ArrowRight");
      keyboardInput(runtime.ingress).dispatch("horizontal", event);

      expect(event.defaultPrevented).toBe(false);
      expect(writes).toEqual([]);

      controller.destroy();
    });

    test("인식하지 못한 key는 무시한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, writes } = scenario;
      const runtime = scenario.createRuntime();
      const { controller } = runtime;
      frames.runNext();
      scenario.clearTrace();

      const event = keyDown("Tab");
      keyboardInput(runtime.ingress).dispatch("vertical", event);

      expect(event.defaultPrevented).toBe(false);
      expect(writes).toEqual([]);

      controller.destroy();
    });

    test("destroy 뒤 typed keyboard ingress dispatch는 no-op이다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, writes } = scenario;
      const runtime = scenario.createRuntime();
      const { controller } = runtime;
      frames.runNext();
      scenario.clearTrace();
      controller.destroy();

      const event = keyDown("ArrowDown");
      keyboardInput(runtime.ingress).dispatch("vertical", event);

      expect(event.defaultPrevented).toBe(false);
      expect(writes).toEqual([]);
    });

    test("같은 축이 pointer drag 중이면 keydown을 무시해 뒤이은 pointermove가 keyboard write를 덮어쓰지 못하게 한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, pointer, writes } = scenario;
      const runtime = scenario.createRuntime();
      const { controller } = runtime;
      frames.runNext();

      // vertical thumb(x:95, y:10 — scenario verticalTrack 범위 안)를 눌러 drag를 active로 만든다.
      runtime.ingress.dispatch({
        type: "holder-pointer-down",
        event: pointer.event("pointerdown", {
          pointerId: 31,
          clientX: 95,
          clientY: 10,
        }),
      });
      frames.runNext();
      scenario.clearTrace();

      const event = keyDown("ArrowDown");
      keyboardInput(runtime.ingress).dispatch("vertical", event);

      expect(event.defaultPrevented).toBe(false);
      expect(writes).toEqual([]);

      controller.destroy();
    });
  });

  describe("thumb focus 관리", () => {
    test("thumb 축이 비활성으로 전환되면 focus를 갖고 있던 thumb를 blur한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames } = scenario;
      const controller = scenario.createController();
      frames.runNext();
      expect(controller.getState().overflow.vertical).toBe(true);

      // React adapter가 활성 축의 thumb에 부여하는 tabIndex=0을 여기서는 직접 흉내낸다.
      elements.thumbVertical.tabIndex = 0;
      elements.thumbVertical.focus();
      expect(document.activeElement).toBe(elements.thumbVertical);

      controller.updateOptions({ axis: "horizontal" });
      frames.runNext();

      expect(controller.getState().overflow.vertical).toBe(false);
      expect(document.activeElement).not.toBe(elements.thumbVertical);

      controller.destroy();
    });

    test("focus가 없는 thumb의 축이 비활성으로 전환돼도 다른 element의 focus를 건드리지 않는다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames } = scenario;
      const controller = scenario.createController();
      frames.runNext();

      const outside = document.createElement("button");
      document.body.append(outside);
      outside.focus();
      expect(document.activeElement).toBe(outside);

      controller.updateOptions({ axis: "horizontal" });
      frames.runNext();

      expect(document.activeElement).toBe(outside);

      controller.destroy();
      outside.remove();
    });
  });
});
