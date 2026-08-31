// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  type ScrollbarController,
  type ScrollbarControllerElements,
} from "../src/core/index.js";
import { createPointerInteraction } from "../src/core/pointer-interaction.js";
import {
  logicalPositionForCenteredTrackPointer,
  logicalPositionForThumbStart,
  normalizeInteractionRectangle,
  type InteractionGeometry,
} from "../src/core/interaction-geometry.js";
import type { ScrollaPhysicalAxis } from "../src/value-types.js";
import {
  createControllerTestScenario,
  type ControllerTestMetrics,
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

function pointerEvent(
  type: string,
  input: Partial<PointerEvent> &
    Pick<PointerEvent, "pointerId" | "clientX" | "clientY">,
): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: input.pointerId },
    clientX: { value: input.clientX },
    clientY: { value: input.clientY },
    button: { value: input.button ?? 0 },
    isPrimary: { value: input.isPrimary ?? true },
    altKey: { value: input.altKey ?? false },
    ctrlKey: { value: input.ctrlKey ?? false },
    metaKey: { value: input.metaKey ?? false },
    shiftKey: { value: input.shiftKey ?? false },
    buttons: { value: input.buttons ?? 1 },
    pointerType: { value: input.pointerType ?? "mouse" },
  });
  return event as PointerEvent;
}

function createElements(): ScrollbarControllerElements {
  const holder = document.createElement("div");
  const wrapper = document.createElement("div");
  const scroller = document.createElement("div");
  const content = document.createElement("div");
  const trackVertical = document.createElement("div");
  const thumbVertical = document.createElement("div");
  const trackHorizontal = document.createElement("div");
  const thumbHorizontal = document.createElement("div");

  holder.append(wrapper, trackVertical, trackHorizontal);
  wrapper.append(scroller);
  scroller.append(content);
  trackVertical.append(thumbVertical);
  trackHorizontal.append(thumbHorizontal);
  document.body.append(holder);

  return {
    holder,
    wrapper,
    scroller,
    content,
    trackVertical,
    thumbVertical,
    trackHorizontal,
    thumbHorizontal,
  };
}

function installCaptureAndFocus(
  elements: ScrollbarControllerElements,
  events: string[],
) {
  const captured = new Set<number>();
  const setPointerCapture = vi.fn((pointerId: number) => {
    events.push(`capture ${pointerId}`);
    captured.add(pointerId);
  });
  const hasPointerCapture = vi.fn((pointerId: number) =>
    captured.has(pointerId),
  );
  const releasePointerCapture = vi.fn((pointerId: number) => {
    events.push(`release ${pointerId}`);
    captured.delete(pointerId);
  });
  Object.defineProperties(elements.holder, {
    setPointerCapture: { configurable: true, value: setPointerCapture },
    hasPointerCapture: { configurable: true, value: hasPointerCapture },
    releasePointerCapture: {
      configurable: true,
      value: releasePointerCapture,
    },
  });
  const focusHorizontal = vi
    .spyOn(elements.thumbHorizontal, "focus")
    .mockImplementation(() => events.push("focus horizontal"));
  const focusVertical = vi
    .spyOn(elements.thumbVertical, "focus")
    .mockImplementation(() => events.push("focus vertical"));
  return {
    setPointerCapture,
    hasPointerCapture,
    releasePointerCapture,
    focusHorizontal,
    focusVertical,
  };
}

function geometryReads(events: readonly string[]): readonly string[] {
  return events.filter(
    (event) =>
      event === "read clientWidth" ||
      event === "read clientHeight" ||
      event === "read scrollWidth" ||
      event === "read scrollHeight" ||
      event === "read horizontal rect" ||
      event === "read vertical rect",
  );
}

const directGeometry: InteractionGeometry = Object.freeze({
  horizontal: Object.freeze({
    track: Object.freeze({
      left: 10,
      top: 190,
      right: 90,
      bottom: 200,
      width: 80,
      height: 10,
    }),
    thumbLength: 24,
    thumbOffset: 0,
    maxPosition: 300,
    overflow: true,
  }),
  vertical: Object.freeze({
    track: Object.freeze({
      left: 90,
      top: 0,
      right: 100,
      bottom: 100,
      width: 10,
      height: 100,
    }),
    thumbLength: 25,
    thumbOffset: 0,
    maxPosition: 600,
    overflow: true,
  }),
});

function createDirectHarness(
  geometry: InteractionGeometry | undefined = directGeometry,
) {
  const elements = createElements();
  const events: string[] = [];
  const capture = installCaptureAndFocus(elements, events);
  let retainedGeometry = geometry;
  const moveTo = vi.fn(() => true);
  const invalidateInteraction = vi.fn();
  const interaction = createPointerInteraction({
    holder: elements.holder,
    thumbHorizontal: elements.thumbHorizontal,
    thumbVertical: elements.thumbVertical,
    getGeometry: () => retainedGeometry,
    moveTo,
    invalidateInteraction,
  });
  return {
    elements,
    events,
    capture,
    moveTo,
    invalidateInteraction,
    interaction,
    setGeometry(next: InteractionGeometry | undefined) {
      retainedGeometry = next;
    },
  };
}

describe("thumb pointer interaction", () => {
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

  test.each<{
    axis: ScrollaPhysicalAxis;
    down: { readonly x: number; readonly y: number };
    move: { readonly x: number; readonly y: number };
    expectedPosition: number;
  }>([
    {
      axis: "vertical",
      down: { x: 95, y: 10 },
      move: { x: 500, y: 50 },
      expectedPosition: 320,
    },
    {
      axis: "horizontal",
      down: { x: 20, y: 195 },
      move: { x: 50, y: -500 },
      expectedPosition: 1125 / 7,
    },
  ])(
    "$axis thumb는 capture, semantic focus, interaction frame 순서로 시작하고 grab offset을 보존해 이동한다",
    ({ axis, down, move, expectedPosition }) => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, pointer, position, writes } = scenario;
      const events: string[] = [];
      const requestFrame = window.requestAnimationFrame.bind(window);
      vi.spyOn(window, "requestAnimationFrame").mockImplementation(
        (callback) => {
          events.push("interaction frame");
          return requestFrame(callback);
        },
      );
      const setPointerCapture = elements.holder.setPointerCapture.bind(
        elements.holder,
      );
      const capture = vi
        .spyOn(elements.holder, "setPointerCapture")
        .mockImplementation((pointerId) => {
          events.push(`capture ${pointerId}`);
          setPointerCapture(pointerId);
        });
      const focusHorizontal = vi
        .spyOn(elements.thumbHorizontal, "focus")
        .mockImplementation(() => events.push("focus horizontal"));
      const focusVertical = vi
        .spyOn(elements.thumbVertical, "focus")
        .mockImplementation(() => events.push("focus vertical"));
      const runtime = scenario.createRuntime();
      const { controller } = runtime;
      const listener = vi.fn();
      controller.subscribe(listener);
      frames.runNext();
      events.length = 0;
      scenario.clearTrace();
      listener.mockClear();

      const downEvent = pointer.event("pointerdown", {
        pointerId: 7,
        clientX: down.x,
        clientY: down.y,
      });
      runtime.ingress.dispatch({
        type: "holder-pointer-down",
        event: downEvent,
      });

      expect(events).toEqual([
        "capture 7",
        `focus ${axis}`,
        "interaction frame",
      ]);
      expect(downEvent.defaultPrevented).toBe(true);
      expect(downEvent.cancelBubble).toBe(false);
      expect(capture).toHaveBeenCalledExactlyOnceWith(7);
      expect(
        axis === "horizontal" ? focusHorizontal : focusVertical,
      ).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });

      frames.runNext();
      expect(controller.getState().draggingAxis).toBe(axis);
      expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
        reasons: ["interaction"],
      });
      listener.mockClear();

      elements.holder.dispatchEvent(
        pointer.event("pointermove", {
          pointerId: 7,
          clientX: move.x,
          clientY: move.y,
        }),
      );

      const coordinate = axis === "horizontal" ? "x" : "y";
      expect(position[coordinate]).toBe(expectedPosition);
      expect(writes).toEqual([[coordinate, expectedPosition]]);
      frames.runNext();
      expect(controller.getState().position[coordinate]).toBe(expectedPosition);
      expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
        reasons: ["scroll"],
      });

      controller.destroy();
    },
  );

  test("captured move는 최초 grab offset을 유지하며 최신 retained track start, travel과 range를 사용한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { elements, frames, metrics, pointer, position, writes } = scenario;
    const runtime = scenario.createRuntime();
    const { controller } = runtime;
    frames.runNext();

    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: pointer.event("pointerdown", {
        pointerId: 11,
        clientX: 95,
        clientY: 10,
      }),
    });
    frames.runNext();

    metrics.clientHeight = 100;
    metrics.scrollHeight = 1000;
    metrics.verticalTrack = { left: 90, top: 20, width: 10, height: 200 };
    controller.refresh();
    frames.runNext();
    scenario.clearTrace();

    elements.holder.dispatchEvent(
      pointer.event("pointermove", {
        pointerId: 11,
        clientX: 95,
        clientY: 110,
      }),
    );

    expect(position.y).toBe(4500 / 11);
    expect(writes).toEqual([["y", 4500 / 11]]);

    controller.destroy();
  });

  test.each([
    ["secondary pointer", { isPrimary: false }],
    ["non-zero button", { button: 1 }],
    ["Alt", { altKey: true }],
    ["Ctrl", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
  ] as const)(
    "%s pointerdown은 capture와 public state를 만들지 않는다",
    (_name, input) => {
      const harness = createDirectHarness();
      const event = pointerEvent("pointerdown", {
        pointerId: 1,
        clientX: 95,
        clientY: 10,
        ...input,
      });

      harness.interaction.handlePointerDown(event);

      expect(event.defaultPrevented).toBe(false);
      expect(harness.capture.setPointerCapture).not.toHaveBeenCalled();
      expect(harness.capture.focusVertical).not.toHaveBeenCalled();
      expect(harness.interaction.getDraggingAxis()).toBeNull();
      expect(harness.invalidateInteraction).not.toHaveBeenCalled();
      harness.elements.holder.remove();
    },
  );

  test("defaultPrevented, pre-init geometry와 no-overflow는 no-op이다", () => {
    const cases = [
      {
        geometry: directGeometry,
        before(event: PointerEvent) {
          event.preventDefault();
        },
      },
      { geometry: undefined, before() {} },
      {
        geometry: {
          ...directGeometry,
          vertical: { ...directGeometry.vertical, overflow: false },
        },
        before() {},
      },
    ] as const;

    for (const current of cases) {
      const harness = createDirectHarness();
      harness.setGeometry(current.geometry);
      const event = pointerEvent("pointerdown", {
        pointerId: 2,
        clientX: 95,
        clientY: 10,
      });
      current.before(event);
      const alreadyPrevented = event.defaultPrevented;

      harness.interaction.handlePointerDown(event);

      expect(event.defaultPrevented).toBe(alreadyPrevented);
      expect(harness.capture.setPointerCapture).not.toHaveBeenCalled();
      expect(harness.invalidateInteraction).not.toHaveBeenCalled();
      harness.elements.holder.remove();
    }
  });

  test("thumb region down은 drag만 시작하고 track moveTo를 만들지 않는다", () => {
    const harness = createDirectHarness();
    const event = pointerEvent("pointerdown", {
      pointerId: 27,
      clientX: 95,
      clientY: 10,
    });

    harness.interaction.handlePointerDown(event);

    expect(event.defaultPrevented).toBe(true);
    expect(harness.interaction.getDraggingAxis()).toBe("vertical");
    expect(harness.moveTo).not.toHaveBeenCalled();
    harness.interaction.destroy();
    harness.elements.holder.remove();
  });

  test("track hit은 capture, focus, interaction 없이 centered target을 정확히 한 번 이동한다", () => {
    const harness = createDirectHarness();
    const event = pointerEvent("pointerdown", {
      pointerId: 28,
      clientX: 95,
      clientY: 50,
    });

    harness.interaction.handlePointerDown(event);

    expect(event.defaultPrevented).toBe(true);
    expect(harness.moveTo).toHaveBeenCalledExactlyOnceWith("vertical", 300);
    expect(harness.capture.setPointerCapture).not.toHaveBeenCalled();
    expect(harness.capture.focusVertical).not.toHaveBeenCalled();
    expect(harness.interaction.getDraggingAxis()).toBeNull();
    expect(harness.invalidateInteraction).not.toHaveBeenCalled();
    harness.elements.holder.remove();
  });

  test.each([
    ["one thumb and the other track", "thumb"],
    ["two thumbs", "none"],
    ["two tracks", "none"],
  ] as const)(
    "%s overlap은 deterministic hit policy 외의 move를 만들지 않는다",
    (name, expected) => {
      const verticalTrack = normalizeInteractionRectangle({
        left: name === "two tracks" ? 50 : 20,
        top: 190,
        width: 10,
        height: 100,
      });
      const geometry: InteractionGeometry = {
        horizontal: directGeometry.horizontal,
        vertical: {
          ...directGeometry.vertical,
          track: verticalTrack,
          thumbOffset:
            name === "two thumbs" ? 0 : name === "two tracks" ? 50 : 50,
        },
      };
      const harness = createDirectHarness(geometry);
      const event = pointerEvent("pointerdown", {
        pointerId: 29,
        clientX: name === "two tracks" ? 55 : 25,
        clientY: 195,
      });

      harness.interaction.handlePointerDown(event);

      if (expected === "thumb") {
        expect(event.defaultPrevented).toBe(true);
        expect(harness.interaction.getDraggingAxis()).toBe("horizontal");
      } else {
        expect(event.defaultPrevented).toBe(false);
        expect(harness.interaction.getDraggingAxis()).toBeNull();
      }
      expect(harness.moveTo).not.toHaveBeenCalled();
      expect(harness.capture.setPointerCapture).toHaveBeenCalledTimes(
        expected === "thumb" ? 1 : 0,
      );
      expect(harness.invalidateInteraction).toHaveBeenCalledTimes(
        expected === "thumb" ? 1 : 0,
      );
      harness.interaction.destroy();
      harness.elements.holder.remove();
    },
  );

  test.each([
    ["Shift", { shiftKey: true }, true],
    ["Alt", { altKey: true }, false],
    ["Ctrl", { ctrlKey: true }, false],
    ["Meta", { metaKey: true }, false],
    ["secondary", { isPrimary: false }, false],
    ["non-left", { button: 1 }, false],
  ] as const)(
    "track %s pointerdown은 modifier policy에 맞게 한 번 jump하거나 no-op이다",
    (_name, input, handled) => {
      const harness = createDirectHarness();
      const event = pointerEvent("pointerdown", {
        pointerId: 30,
        clientX: 95,
        clientY: 50,
        ...input,
      });

      harness.interaction.handlePointerDown(event);

      expect(event.defaultPrevented).toBe(handled);
      expect(harness.moveTo).toHaveBeenCalledTimes(handled ? 1 : 0);
      if (handled) {
        expect(harness.moveTo).toHaveBeenCalledWith("vertical", 300);
      }
      expect(harness.capture.setPointerCapture).not.toHaveBeenCalled();
      expect(harness.invalidateInteraction).not.toHaveBeenCalled();
      harness.elements.holder.remove();
    },
  );

  test("invalid coordinate, no-overflow와 destroy 뒤 track input은 event와 transaction을 변경하지 않는다", () => {
    const cases: Array<{
      readonly prepare: (
        harness: ReturnType<typeof createDirectHarness>,
      ) => void;
      readonly clientY: number;
    }> = [
      { prepare() {}, clientY: Number.NaN },
      {
        prepare(harness) {
          harness.setGeometry({
            ...directGeometry,
            vertical: { ...directGeometry.vertical, overflow: false },
          });
        },
        clientY: 50,
      },
      {
        prepare(harness) {
          harness.interaction.destroy();
        },
        clientY: 50,
      },
    ];

    for (const current of cases) {
      const harness = createDirectHarness();
      current.prepare(harness);
      const event = pointerEvent("pointerdown", {
        pointerId: 31,
        clientX: 95,
        clientY: current.clientY,
      });

      harness.interaction.handlePointerDown(event);

      expect(event.defaultPrevented).toBe(false);
      expect(harness.moveTo).not.toHaveBeenCalled();
      expect(harness.capture.setPointerCapture).not.toHaveBeenCalled();
      expect(harness.invalidateInteraction).not.toHaveBeenCalled();
      harness.elements.holder.remove();
    }
  });

  test.each([
    ["shift mouse", { shiftKey: true, pointerType: "mouse" }],
    ["pen", { pointerType: "pen" }],
    ["touch", { pointerType: "touch" }],
  ] as const)(
    "%s primary pointerdown은 thumb drag를 시작한다",
    (_name, input) => {
      const harness = createDirectHarness();
      const event = pointerEvent("pointerdown", {
        pointerId: 3,
        clientX: 95,
        clientY: 10,
        ...input,
      });

      harness.interaction.handlePointerDown(event);

      expect(event.defaultPrevented).toBe(true);
      expect(event.cancelBubble).toBe(false);
      expect(harness.interaction.getDraggingAxis()).toBe("vertical");
      harness.interaction.destroy();
      harness.elements.holder.remove();
    },
  );

  test("active drag 중 repeated와 competing down, 다른 pointer move는 event와 transaction을 변경하지 않는다", () => {
    const harness = createDirectHarness();
    harness.interaction.handlePointerDown(
      pointerEvent("pointerdown", {
        pointerId: 4,
        clientX: 95,
        clientY: 10,
      }),
    );
    harness.capture.setPointerCapture.mockClear();
    harness.capture.focusVertical.mockClear();
    harness.invalidateInteraction.mockClear();
    const repeated = pointerEvent("pointerdown", {
      pointerId: 4,
      clientX: 95,
      clientY: 10,
    });
    const competing = pointerEvent("pointerdown", {
      pointerId: 5,
      clientX: 95,
      clientY: 10,
    });
    const otherMove = pointerEvent("pointermove", {
      pointerId: 5,
      clientX: 95,
      clientY: 50,
    });

    harness.interaction.handlePointerDown(repeated);
    harness.interaction.handlePointerDown(competing);
    harness.elements.holder.dispatchEvent(otherMove);

    expect(repeated.defaultPrevented).toBe(false);
    expect(competing.defaultPrevented).toBe(false);
    expect(otherMove.defaultPrevented).toBe(false);
    expect(harness.capture.setPointerCapture).not.toHaveBeenCalled();
    expect(harness.capture.focusVertical).not.toHaveBeenCalled();
    expect(harness.moveTo).not.toHaveBeenCalled();
    expect(harness.invalidateInteraction).not.toHaveBeenCalled();
    expect(harness.interaction.getDraggingAxis()).toBe("vertical");
    harness.elements.holder.remove();
  });

  test("matching move는 buttons, modifier와 isPrimary를 다시 판정하지 않는다", () => {
    const harness = createDirectHarness();
    harness.interaction.handlePointerDown(
      pointerEvent("pointerdown", {
        pointerId: 6,
        clientX: 95,
        clientY: 10,
      }),
    );
    const move = pointerEvent("pointermove", {
      pointerId: 6,
      clientX: 95,
      clientY: 50,
      buttons: 0,
      altKey: true,
      ctrlKey: true,
      metaKey: true,
      isPrimary: false,
    });

    harness.elements.holder.dispatchEvent(move);

    expect(move.defaultPrevented).toBe(true);
    expect(harness.moveTo).toHaveBeenCalledExactlyOnceWith("vertical", 320);
    harness.elements.holder.remove();
  });

  test.each(["missing", "throw", "not-owned"] as const)(
    "setPointerCapture $0은 focus, listener, state, preventDefault와 invalidation을 만들지 않는다",
    (mode) => {
      const harness = createDirectHarness();
      const addListener = vi.spyOn(harness.elements.holder, "addEventListener");
      if (mode === "missing") {
        Object.defineProperty(harness.elements.holder, "setPointerCapture", {
          configurable: true,
          value: undefined,
        });
      } else if (mode === "throw") {
        harness.capture.setPointerCapture.mockImplementation(() => {
          throw new Error("capture failure");
        });
      } else {
        harness.capture.hasPointerCapture.mockReturnValue(false);
      }
      const event = pointerEvent("pointerdown", {
        pointerId: 7,
        clientX: 95,
        clientY: 10,
      });

      expect(() => harness.interaction.handlePointerDown(event)).not.toThrow();

      expect(event.defaultPrevented).toBe(false);
      expect(harness.capture.focusVertical).not.toHaveBeenCalled();
      expect(addListener).not.toHaveBeenCalled();
      expect(harness.interaction.getDraggingAxis()).toBeNull();
      expect(harness.invalidateInteraction).not.toHaveBeenCalled();
      harness.elements.holder.remove();
    },
  );

  test("focus 실패는 acquired capture를 정리하고 drag를 commit하지 않는다", () => {
    const harness = createDirectHarness();
    harness.capture.focusVertical.mockImplementation(() => {
      throw new Error("focus failure");
    });
    const event = pointerEvent("pointerdown", {
      pointerId: 8,
      clientX: 95,
      clientY: 10,
    });

    expect(() => harness.interaction.handlePointerDown(event)).not.toThrow();

    expect(
      harness.capture.releasePointerCapture,
    ).toHaveBeenCalledExactlyOnceWith(8);
    expect(event.defaultPrevented).toBe(false);
    expect(harness.interaction.getDraggingAxis()).toBeNull();
    expect(harness.invalidateInteraction).not.toHaveBeenCalled();
    const staleMove = pointerEvent("pointermove", {
      pointerId: 8,
      clientX: 95,
      clientY: 50,
    });
    harness.elements.holder.dispatchEvent(staleMove);
    expect(staleMove.defaultPrevented).toBe(false);
    expect(harness.moveTo).not.toHaveBeenCalled();
    harness.elements.holder.remove();
  });

  test("focus 중 reentrant competing down은 capture transaction을 교체하지 않는다", () => {
    const harness = createDirectHarness();
    let reentered = false;
    harness.capture.focusVertical.mockImplementation(() => {
      if (reentered) {
        return;
      }
      reentered = true;
      harness.interaction.handlePointerDown(
        pointerEvent("pointerdown", {
          pointerId: 23,
          clientX: 95,
          clientY: 10,
        }),
      );
    });
    const event = pointerEvent("pointerdown", {
      pointerId: 22,
      clientX: 95,
      clientY: 10,
    });

    harness.interaction.handlePointerDown(event);

    expect(harness.capture.setPointerCapture).toHaveBeenCalledExactlyOnceWith(
      22,
    );
    expect(harness.interaction.getDraggingAxis()).toBe("vertical");
    expect(event.defaultPrevented).toBe(true);
    harness.interaction.destroy();
    harness.elements.holder.remove();
  });

  test("focus 중 reentrant destroy는 pending capture를 정리하고 drag를 commit하지 않는다", () => {
    const harness = createDirectHarness();
    harness.capture.focusVertical.mockImplementation(() => {
      harness.interaction.destroy();
    });
    const event = pointerEvent("pointerdown", {
      pointerId: 24,
      clientX: 95,
      clientY: 10,
    });

    harness.interaction.handlePointerDown(event);

    expect(
      harness.capture.releasePointerCapture,
    ).toHaveBeenCalledExactlyOnceWith(24);
    expect(harness.interaction.getDraggingAxis()).toBeNull();
    expect(event.defaultPrevented).toBe(false);
    expect(harness.invalidateInteraction).not.toHaveBeenCalled();
    const move = pointerEvent("pointermove", {
      pointerId: 24,
      clientX: 95,
      clientY: 50,
    });
    harness.elements.holder.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);
    expect(harness.moveTo).not.toHaveBeenCalled();
    harness.elements.holder.remove();
  });

  test.each([
    ["pointerup", 1],
    ["pointercancel", 1],
    ["lostpointercapture", 0],
    ["release", 1],
    ["release-only", 1],
  ] as const)(
    "focus 중 matching %s은 pending transaction을 종료하고 public drag를 commit하지 않는다",
    (termination, expectedReleaseCalls) => {
      const harness = createDirectHarness();
      if (termination === "release") {
        harness.capture.releasePointerCapture.mockImplementation(
          (pointerId) => {
            harness.elements.holder.dispatchEvent(
              pointerEvent("lostpointercapture", {
                pointerId,
                clientX: 0,
                clientY: 0,
              }),
            );
          },
        );
      }
      harness.capture.focusVertical.mockImplementation(() => {
        if (termination === "release" || termination === "release-only") {
          harness.elements.holder.releasePointerCapture(25);
          return;
        }
        harness.elements.holder.dispatchEvent(
          pointerEvent(termination, {
            pointerId: 25,
            clientX: 95,
            clientY: 10,
          }),
        );
      });
      const down = pointerEvent("pointerdown", {
        pointerId: 25,
        clientX: 95,
        clientY: 10,
      });

      harness.interaction.handlePointerDown(down);

      expect(down.defaultPrevented).toBe(false);
      expect(harness.interaction.getDraggingAxis()).toBeNull();
      expect(harness.invalidateInteraction).not.toHaveBeenCalled();
      expect(harness.capture.releasePointerCapture).toHaveBeenCalledTimes(
        expectedReleaseCalls,
      );
      const staleMove = pointerEvent("pointermove", {
        pointerId: 25,
        clientX: 95,
        clientY: 50,
      });
      harness.elements.holder.dispatchEvent(staleMove);
      harness.elements.holder.dispatchEvent(
        pointerEvent("pointercancel", {
          pointerId: 25,
          clientX: 95,
          clientY: 10,
        }),
      );
      expect(staleMove.defaultPrevented).toBe(false);
      expect(harness.moveTo).not.toHaveBeenCalled();
      expect(harness.invalidateInteraction).not.toHaveBeenCalled();
      expect(harness.capture.releasePointerCapture).toHaveBeenCalledTimes(
        expectedReleaseCalls,
      );
      harness.elements.holder.remove();
    },
  );

  test("focus 중 matching move는 pending transaction에서 move와 prevent 없이 무시되고 focus 성공 뒤 한 번 commit한다", () => {
    const harness = createDirectHarness();
    let pendingMove: PointerEvent | undefined;
    harness.capture.focusVertical.mockImplementation(() => {
      pendingMove = pointerEvent("pointermove", {
        pointerId: 26,
        clientX: 95,
        clientY: 50,
      });
      harness.elements.holder.dispatchEvent(pendingMove);
    });
    const down = pointerEvent("pointerdown", {
      pointerId: 26,
      clientX: 95,
      clientY: 10,
    });

    harness.interaction.handlePointerDown(down);

    expect(pendingMove?.defaultPrevented).toBe(false);
    expect(harness.moveTo).not.toHaveBeenCalled();
    expect(down.defaultPrevented).toBe(true);
    expect(harness.interaction.getDraggingAxis()).toBe("vertical");
    expect(harness.invalidateInteraction).toHaveBeenCalledOnce();
    harness.interaction.destroy();
    harness.elements.holder.remove();
  });

  test.each(["pointerup", "pointercancel", "lostpointercapture"] as const)(
    "%s은 matching active token을 한 번만 소진하고 stale callback을 no-op으로 만든다",
    (type) => {
      const harness = createDirectHarness();
      const addListener = vi.spyOn(harness.elements.holder, "addEventListener");
      harness.interaction.handlePointerDown(
        pointerEvent("pointerdown", {
          pointerId: 9,
          clientX: 95,
          clientY: 10,
        }),
      );
      const staleMove = addListener.mock.calls.find(
        ([eventType]) => eventType === "pointermove",
      )?.[1] as EventListener;
      const staleEnd = addListener.mock.calls.find(
        ([eventType]) => eventType === type,
      )?.[1] as EventListener;
      harness.invalidateInteraction.mockClear();
      harness.capture.releasePointerCapture.mockClear();

      harness.elements.holder.dispatchEvent(
        pointerEvent(type, {
          pointerId: 9,
          clientX: 95,
          clientY: 10,
        }),
      );

      expect(harness.interaction.getDraggingAxis()).toBeNull();
      expect(harness.invalidateInteraction).toHaveBeenCalledOnce();
      if (type === "lostpointercapture") {
        expect(harness.capture.releasePointerCapture).not.toHaveBeenCalled();
      } else {
        expect(harness.capture.releasePointerCapture).toHaveBeenCalledOnce();
      }

      const staleMoveEvent = pointerEvent("pointermove", {
        pointerId: 9,
        clientX: 95,
        clientY: 50,
      });
      staleMove.call(harness.elements.holder, staleMoveEvent);
      staleEnd.call(
        harness.elements.holder,
        pointerEvent(type, {
          pointerId: 9,
          clientX: 95,
          clientY: 10,
        }),
      );
      expect(staleMoveEvent.defaultPrevented).toBe(false);
      expect(harness.moveTo).not.toHaveBeenCalled();
      expect(harness.invalidateInteraction).toHaveBeenCalledOnce();
      harness.elements.holder.remove();
    },
  );

  test.each(["pointerup", "pointercancel", "lostpointercapture"] as const)(
    "다른 pointer의 %s은 active drag와 event를 변경하지 않는다",
    (type) => {
      const harness = createDirectHarness();
      harness.interaction.handlePointerDown(
        pointerEvent("pointerdown", {
          pointerId: 19,
          clientX: 95,
          clientY: 10,
        }),
      );
      harness.invalidateInteraction.mockClear();
      harness.capture.releasePointerCapture.mockClear();
      const event = pointerEvent(type, {
        pointerId: 20,
        clientX: 0,
        clientY: 0,
      });

      harness.elements.holder.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(harness.interaction.getDraggingAxis()).toBe("vertical");
      expect(harness.invalidateInteraction).not.toHaveBeenCalled();
      expect(harness.capture.releasePointerCapture).not.toHaveBeenCalled();
      harness.interaction.destroy();
      harness.elements.holder.remove();
    },
  );

  test("active scope는 holder의 네 pointer listener만 등록한다", () => {
    const harness = createDirectHarness();
    const holderAdd = vi.spyOn(harness.elements.holder, "addEventListener");
    const documentAdd = vi.spyOn(document, "addEventListener");
    const windowAdd = vi.spyOn(window, "addEventListener");

    harness.interaction.handlePointerDown(
      pointerEvent("pointerdown", {
        pointerId: 21,
        clientX: 95,
        clientY: 10,
      }),
    );

    expect(holderAdd.mock.calls.map(([type]) => type)).toEqual([
      "pointermove",
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ]);
    expect(documentAdd).not.toHaveBeenCalled();
    expect(windowAdd).not.toHaveBeenCalled();
    harness.interaction.destroy();
    harness.elements.holder.remove();
  });

  test("explicit release가 만든 lost capture 재진입은 cleanup과 invalidation을 중복하지 않는다", () => {
    const harness = createDirectHarness();
    harness.interaction.handlePointerDown(
      pointerEvent("pointerdown", {
        pointerId: 10,
        clientX: 95,
        clientY: 10,
      }),
    );
    harness.invalidateInteraction.mockClear();
    harness.capture.releasePointerCapture.mockImplementation((pointerId) => {
      harness.elements.holder.dispatchEvent(
        pointerEvent("lostpointercapture", {
          pointerId,
          clientX: 0,
          clientY: 0,
        }),
      );
    });

    harness.elements.holder.dispatchEvent(
      pointerEvent("pointerup", {
        pointerId: 10,
        clientX: 95,
        clientY: 10,
      }),
    );

    expect(harness.capture.releasePointerCapture).toHaveBeenCalledOnce();
    expect(harness.invalidateInteraction).toHaveBeenCalledOnce();
    expect(harness.interaction.getDraggingAxis()).toBeNull();
    harness.elements.holder.remove();
  });

  test.each(["has", "release"] as const)(
    "%sPointerCapture throw는 listener와 local state cleanup을 막지 않는다",
    (method) => {
      const harness = createDirectHarness();
      harness.interaction.handlePointerDown(
        pointerEvent("pointerdown", {
          pointerId: 12,
          clientX: 95,
          clientY: 10,
        }),
      );
      if (method === "has") {
        harness.capture.hasPointerCapture.mockImplementation(() => {
          throw new Error("has failure");
        });
      } else {
        harness.capture.releasePointerCapture.mockImplementation(() => {
          throw new Error("release failure");
        });
      }

      expect(() =>
        harness.elements.holder.dispatchEvent(
          pointerEvent("pointercancel", {
            pointerId: 12,
            clientX: 95,
            clientY: 10,
          }),
        ),
      ).not.toThrow();

      expect(harness.interaction.getDraggingAxis()).toBeNull();
      const stale = pointerEvent("pointermove", {
        pointerId: 12,
        clientX: 95,
        clientY: 50,
      });
      harness.elements.holder.dispatchEvent(stale);
      expect(stale.defaultPrevented).toBe(false);
      expect(harness.moveTo).not.toHaveBeenCalled();
      harness.elements.holder.remove();
    },
  );

  test.each([
    {
      name: "option axis disable",
      invalidate: (
        controller: ScrollbarController,
        elements: ScrollbarControllerElements,
        metrics: ControllerTestMetrics,
      ) => {
        void elements;
        void metrics;
        controller.updateOptions({ axis: "horizontal" });
      },
    },
    {
      name: "no-overflow geometry",
      invalidate: (
        controller: ScrollbarController,
        elements: ScrollbarControllerElements,
        metrics: ControllerTestMetrics,
      ) => {
        void elements;
        metrics.scrollHeight = 200;
        controller.refresh();
      },
    },
    {
      name: "detached geometry",
      invalidate: (
        controller: ScrollbarController,
        elements: ScrollbarControllerElements,
        metrics: ControllerTestMetrics,
      ) => {
        void metrics;
        elements.holder.remove();
        controller.refresh();
      },
    },
  ])(
    "$name frame은 overflow=false와 draggingAxis=null을 한 snapshot에 commit한다",
    ({ invalidate }) => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, metrics, pointer } = scenario;
      const releasePointerCapture = vi.spyOn(
        elements.holder,
        "releasePointerCapture",
      );
      const runtime = scenario.createRuntime();
      const { controller } = runtime;
      const listener = vi.fn();
      controller.subscribe(listener);
      frames.runNext();
      runtime.ingress.dispatch({
        type: "holder-pointer-down",
        event: pointer.event("pointerdown", {
          pointerId: 13,
          clientX: 95,
          clientY: 10,
        }),
      });
      frames.runNext();
      listener.mockClear();
      releasePointerCapture.mockClear();

      invalidate(controller, elements, metrics);
      frames.runNext();

      const snapshot = controller.getState();
      expect(snapshot.overflow.vertical).toBe(false);
      expect(snapshot.draggingAxis).toBeNull();
      expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(13);
      expect(listener).toHaveBeenCalledExactlyOnceWith(snapshot, {
        reasons: ["geometry"],
      });
      controller.destroy();
    },
  );

  test("clamped same-position move는 write, scroll activity와 RAF 없이 active drag를 유지한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { elements, frames, pointer, writes } = scenario;
    const runtime = scenario.createRuntime();
    const { controller } = runtime;
    const listener = vi.fn();
    controller.subscribe(listener);
    frames.runNext();
    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: pointer.event("pointerdown", {
        pointerId: 14,
        clientX: 95,
        clientY: 10,
      }),
    });
    frames.runNext();
    scenario.clearTrace();
    listener.mockClear();

    elements.holder.dispatchEvent(
      pointer.event("pointermove", {
        pointerId: 14,
        clientX: 95,
        clientY: 10,
      }),
    );

    expect(writes).toEqual([]);
    expect(controller.getState().scrolling).toBe(false);
    expect(controller.getState().draggingAxis).toBe("vertical");
    expect(frames.pendingCount).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    controller.destroy();
  });

  test("start와 move가 같은 frame이면 scroll, interaction canonical reason으로 commit한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { elements, frames, pointer } = scenario;
    const runtime = scenario.createRuntime();
    const { controller } = runtime;
    const listener = vi.fn();
    controller.subscribe(listener);
    frames.runNext();
    listener.mockClear();

    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: pointer.event("pointerdown", {
        pointerId: 15,
        clientX: 95,
        clientY: 10,
      }),
    });
    elements.holder.dispatchEvent(
      pointer.event("pointermove", {
        pointerId: 15,
        clientX: 95,
        clientY: 50,
      }),
    );
    frames.runNext();

    expect(controller.getState()).toMatchObject({
      position: { x: 0, y: 320 },
      scrolling: true,
      draggingAxis: "vertical",
    });
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["scroll", "interaction"],
    });
    controller.destroy();
  });

  test("pointerdown, interaction frame과 matching move는 rectangle과 extent를 다시 읽지 않는다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    scenarios.push(scenario);
    const { elements, events, frames, pointer } = scenario;
    const runtime = scenario.createRuntime();
    const { controller } = runtime;
    frames.runNext();
    scenario.clearTrace();

    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: pointer.event("pointerdown", {
        pointerId: 18,
        clientX: 95,
        clientY: 10,
      }),
    });
    expect(geometryReads(events)).toEqual([]);
    frames.runNext();
    expect(geometryReads(events)).toEqual([]);

    elements.holder.dispatchEvent(
      pointer.event("pointermove", {
        pointerId: 18,
        clientX: 95,
        clientY: 50,
      }),
    );
    expect(geometryReads(events)).toEqual([]);
    controller.destroy();
  });

  test("start와 up이 movement 없이 같은 frame에 끝나면 snapshot과 notification이 unchanged다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { elements, frames, pointer } = scenario;
    const runtime = scenario.createRuntime();
    const { controller } = runtime;
    const listener = vi.fn();
    controller.subscribe(listener);
    frames.runNext();
    const snapshot = controller.getState();
    listener.mockClear();

    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: pointer.event("pointerdown", {
        pointerId: 16,
        clientX: 95,
        clientY: 10,
      }),
    });
    elements.holder.dispatchEvent(
      pointer.event("pointerup", {
        pointerId: 16,
        clientX: 95,
        clientY: 10,
      }),
    );
    frames.runNext();

    expect(controller.getState()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
    controller.destroy();
  });

  test("destroy는 active resources만 정리하고 snapshot identity와 callback을 보존한다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const { elements, frames, pointer, writes } = scenario;
    const releasePointerCapture = vi.spyOn(
      elements.holder,
      "releasePointerCapture",
    );
    const runtime = scenario.createRuntime();
    const { controller } = runtime;
    const listener = vi.fn();
    controller.subscribe(listener);
    frames.runNext();
    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: pointer.event("pointerdown", {
        pointerId: 17,
        clientX: 95,
        clientY: 10,
      }),
    });
    frames.runNext();
    const snapshot = controller.getState();
    listener.mockClear();
    scenario.clearTrace();
    releasePointerCapture.mockClear();

    controller.destroy();

    expect(releasePointerCapture).toHaveBeenCalledExactlyOnceWith(17);
    expect(controller.getState()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
    const staleMove = pointer.event("pointermove", {
      pointerId: 17,
      clientX: 95,
      clientY: 50,
    });
    elements.holder.dispatchEvent(staleMove);
    expect(staleMove.defaultPrevented).toBe(false);
    expect(writes).toEqual([]);
    expect(frames.pendingCount).toBe(0);
  });

  describe("RTL mirror", () => {
    test("direction=rtl는 horizontal track jump을 반대쪽 끝 기준으로 mapping한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { frames, pointer, position } = scenario;
      const runtime = scenario.createRuntime({
        direction: "rtl",
      });
      const { controller } = runtime;
      frames.runNext();
      scenario.clearTrace();

      // mirrored thumb(logical 0)는 물리적으로 [66,90]에 있다. 물리적 왼쪽 끝
      // 근처를 누르면 logical은 반대쪽 끝(max)이 되어야 한다.
      const expectedLogical = logicalPositionForCenteredTrackPointer(
        15,
        10,
        80,
        24,
        300,
        true,
      );
      expect(expectedLogical).toBe(300);
      const event = pointer.event("pointerdown", {
        pointerId: 21,
        clientX: 15,
        clientY: 195,
      });
      runtime.ingress.dispatch({ type: "holder-pointer-down", event });

      expect(event.defaultPrevented).toBe(true);
      expect(position.x).toBe(-300);
      frames.runNext();
      expect(controller.getState().position.x).toBe(300);

      controller.destroy();
    });

    test("direction=rtl는 horizontal thumb drag move를 반대쪽 끝 기준으로 mapping한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, pointer, position } = scenario;
      const setPointerCapture = vi.spyOn(elements.holder, "setPointerCapture");
      const runtime = scenario.createRuntime({
        direction: "rtl",
      });
      const { controller } = runtime;
      frames.runNext();
      scenario.clearTrace();

      runtime.ingress.dispatch({
        type: "holder-pointer-down",
        event: pointer.event("pointerdown", {
          pointerId: 22,
          clientX: 70,
          clientY: 195,
        }),
      });
      expect(setPointerCapture).toHaveBeenCalledExactlyOnceWith(22);
      frames.runNext();
      expect(controller.getState().draggingAxis).toBe("horizontal");

      const grabOffset = 70 - 10 - 56; // trackStart=10, mirrored thumbOffset=56
      const expectedLogical = logicalPositionForThumbStart(
        50 - 10 - grabOffset,
        80,
        24,
        300,
        true,
      );
      const nonMirroredLogical = logicalPositionForThumbStart(
        50 - 10 - grabOffset,
        80,
        24,
        300,
        false,
      );
      expect(expectedLogical).not.toBeCloseTo(nonMirroredLogical);
      elements.holder.dispatchEvent(
        pointer.event("pointermove", {
          pointerId: 22,
          clientX: 50,
          clientY: 195,
        }),
      );

      expect(position.x).toBeCloseTo(0 - expectedLogical);
      frames.runNext();
      expect(controller.getState().position.x).toBeCloseTo(expectedLogical);

      controller.destroy();
    });

    test("horizontal drag 중 direction을 rtl로 바꾸면 axis geometry 유효성과 무관하게 즉시 drag를 종료한다", () => {
      const scenario = createControllerTestScenario();
      scenarios.push(scenario);
      const { elements, frames, pointer } = scenario;
      const releasePointerCapture = vi.spyOn(
        elements.holder,
        "releasePointerCapture",
      );
      const runtime = scenario.createRuntime();
      const { controller } = runtime;
      frames.runNext();

      runtime.ingress.dispatch({
        type: "holder-pointer-down",
        event: pointer.event("pointerdown", {
          pointerId: 23,
          clientX: 20,
          clientY: 195,
        }),
      });
      frames.runNext();
      expect(controller.getState().draggingAxis).toBe("horizontal");
      expect(pointer.capturedIds.has(23)).toBe(true);

      controller.updateOptions({ direction: "rtl" });
      frames.runNext();

      expect(controller.getState().draggingAxis).toBeNull();
      expect(releasePointerCapture).toHaveBeenCalledWith(23);

      controller.destroy();
    });
  });

  describe("projectGeometry의 direction 전환 해제", () => {
    test("horizontal active drag + directionChanged=true는 axis geometry가 유효해도 해제한다", () => {
      const harness = createDirectHarness();
      harness.interaction.handlePointerDown(
        pointerEvent("pointerdown", {
          pointerId: 40,
          clientX: 20,
          clientY: 195,
        }),
      );
      expect(harness.interaction.getDraggingAxis()).toBe("horizontal");

      const projection = harness.interaction.projectGeometry(
        directGeometry,
        true,
      );

      expect(projection).toEqual({
        draggingAxis: null,
        releaseActiveDrag: true,
      });
      harness.interaction.applyGeometryProjection(projection);
      expect(harness.interaction.getDraggingAxis()).toBeNull();
      expect(harness.capture.releasePointerCapture).toHaveBeenCalledWith(40);
      harness.elements.holder.remove();
    });

    test("vertical active drag는 horizontal directionChanged의 영향을 받지 않는다", () => {
      const harness = createDirectHarness();
      harness.interaction.handlePointerDown(
        pointerEvent("pointerdown", {
          pointerId: 41,
          clientX: 95,
          clientY: 10,
        }),
      );
      expect(harness.interaction.getDraggingAxis()).toBe("vertical");

      const projection = harness.interaction.projectGeometry(
        directGeometry,
        true,
      );

      expect(projection).toEqual({
        draggingAxis: "vertical",
        releaseActiveDrag: false,
      });
      harness.elements.holder.remove();
    });

    test("directionChanged=false는 기존 axis-usable 판정만 따른다", () => {
      const harness = createDirectHarness();
      harness.interaction.handlePointerDown(
        pointerEvent("pointerdown", {
          pointerId: 42,
          clientX: 20,
          clientY: 195,
        }),
      );

      const projection = harness.interaction.projectGeometry(
        directGeometry,
        false,
      );

      expect(projection).toEqual({
        draggingAxis: "horizontal",
        releaseActiveDrag: false,
      });
      harness.elements.holder.remove();
    });
  });
});
