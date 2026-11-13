// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createControllerTestScenario,
  type ControllerTestScenario,
} from "./support/controller-test-platform.js";

let scenario: ControllerTestScenario | undefined;

afterEach(() => {
  scenario?.dispose();
  scenario = undefined;
});

function firstWrite(events: readonly string[]): number {
  return events.findIndex((event) => event.startsWith("write "));
}

function translateX(styleValue: string): number {
  const match = /^translateX\(([-\d.]+)px\)$/.exec(styleValue);
  if (match === null) {
    throw new Error(`translateX style이 아닙니다: ${styleValue}`);
  }
  return Number(match[1]);
}

describe("runtime observable frame matrix", () => {
  test("scroll, geometry, interaction, visibility invalidation은 한 RAF와 canonical notification으로 합류한다", () => {
    scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    const { controller, ingress } = scenario.createRuntime();
    const listener = vi.fn();
    controller.subscribe(listener);
    scenario.frames.runNext();
    listener.mockClear();
    scenario.clearTrace();
    const requestCount = scenario.frames.requestCount;

    scenario.position.y = 300;
    scenario.elements.scroller.dispatchEvent(new Event("scroll"));
    controller.refresh();
    ingress.dispatch({
      type: "holder-pointer-down",
      event: scenario.pointer.event("pointerdown", {
        pointerId: 1,
        clientX: 95,
        clientY: 10,
      }),
    });
    controller.updateOptions({ autoHide: true });

    expect(scenario.frames.requestCount).toBe(requestCount + 1);
    expect(scenario.frames.pendingCount).toBe(1);
    scenario.frames.runNext();

    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["scroll", "geometry", "interaction", "visibility"],
    });
    const writeIndex = firstWrite(scenario.events);
    expect(writeIndex).toBeGreaterThan(0);
    expect(
      scenario.events
        .slice(0, writeIndex)
        .every((event) => event.startsWith("read ")),
    ).toBe(true);
  });

  test("notification 중 새 invalidation은 captured dirty와 섞이지 않고 다음 RAF에서 처리한다", () => {
    scenario = createControllerTestScenario();
    const { controller } = scenario.createRuntime();
    scenario.frames.runNext();
    const listener = vi.fn(() => {
      scenario!.metrics.scrollHeight = 900;
      controller.refresh();
    });
    controller.subscribe(listener);

    scenario.position.y = 300;
    scenario.elements.scroller.dispatchEvent(new Event("scroll"));
    scenario.frames.runNext();

    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["scroll"],
    });
    expect(scenario.frames.pendingCount).toBe(1);
    scenario.frames.runNext();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1]?.[1]).toEqual({ reasons: ["geometry"] });
  });

  test("geometry read 오류는 captured dirty를 재시도하지 않고 이후 invalidation을 새 RAF에서 처리한다", () => {
    scenario = createControllerTestScenario();
    const { controller } = scenario.createRuntime();
    scenario.frames.runNext();
    const committed = controller.getState();
    const listener = vi.fn();
    controller.subscribe(listener);
    const readError = new Error("clientWidth read 실패");
    let failRead = true;
    Object.defineProperty(scenario.metrics, "clientWidth", {
      configurable: true,
      get() {
        if (failRead) {
          throw readError;
        }
        return 100;
      },
    });
    scenario.metrics.scrollHeight = 1000;

    controller.refresh();
    expect(() => scenario!.frames.runNext()).toThrow(readError);

    expect(controller.getState()).toBe(committed);
    expect(listener).not.toHaveBeenCalled();
    expect(scenario.frames.pendingCount).toBe(0);

    failRead = false;
    expect(scenario.frames.pendingCount).toBe(0);
    controller.refresh();
    expect(scenario.frames.pendingCount).toBe(1);
    scenario.frames.runNext();

    expect(controller.getState().maxPosition.y).toBe(800);
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["geometry"],
    });
  });

  test("direction 전환 frame은 logical x, raw scrollLeft, thumb와 horizontal hit geometry를 함께 정렬한다", () => {
    scenario = createControllerTestScenario();
    const { controller, ingress } = scenario.createRuntime();
    scenario.frames.runNext();

    controller.scrollTo({ x: 70 });
    scenario.frames.runNext();
    expect(controller.getState().position.x).toBe(70);
    expect(scenario.position.x).toBe(70);
    const ltrThumbOffset = translateX(
      scenario.elements.thumbHorizontal.style.transform,
    );

    controller.updateOptions({ direction: "rtl" });
    scenario.frames.runNext();

    expect(controller.getState().position.x).toBe(70);
    expect(scenario.position.x).toBe(-70);
    const rtlThumbOffset = translateX(
      scenario.elements.thumbHorizontal.style.transform,
    );
    const thumbWidth = Number.parseFloat(
      scenario.elements.thumbHorizontal.style.width,
    );
    expect(ltrThumbOffset + rtlThumbOffset).toBeCloseTo(
      scenario.metrics.horizontalTrack.width - thumbWidth,
    );
    ingress.dispatch({
      type: "holder-pointer-down",
      event: scenario.pointer.event("pointerdown", {
        pointerId: 4,
        clientX: 60,
        clientY: 195,
      }),
    });
    scenario.frames.runNext();
    expect(controller.getState().draggingAxis).toBe("horizontal");
  });

  test("geometry가 horizontal direction을 바꾸면 active horizontal drag를 같은 frame에서 해제하고 geometry reason을 유지한다", () => {
    scenario = createControllerTestScenario();
    const { controller, ingress } = scenario.createRuntime();
    scenario.frames.runNext();
    const listener = vi.fn();
    controller.subscribe(listener);

    ingress.dispatch({
      type: "holder-pointer-down",
      event: scenario.pointer.event("pointerdown", {
        pointerId: 3,
        clientX: 20,
        clientY: 195,
      }),
    });
    scenario.frames.runNext();
    expect(controller.getState().draggingAxis).toBe("horizontal");
    listener.mockClear();

    controller.updateOptions({ direction: "rtl" });
    scenario.frames.runNext();

    expect(controller.getState().draggingAxis).toBeNull();
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["geometry"],
    });
  });

  test("geometry가 active drag 축을 unusable하게 만들면 drag를 해제하고 geometry reason을 유지한다", () => {
    scenario = createControllerTestScenario();
    const { controller, ingress } = scenario.createRuntime();
    scenario.frames.runNext();
    const listener = vi.fn();
    controller.subscribe(listener);

    ingress.dispatch({
      type: "holder-pointer-down",
      event: scenario.pointer.event("pointerdown", {
        pointerId: 5,
        clientX: 95,
        clientY: 10,
      }),
    });
    scenario.frames.runNext();
    expect(controller.getState().draggingAxis).toBe("vertical");
    listener.mockClear();

    scenario.metrics.scrollHeight = 200;
    controller.refresh();
    scenario.frames.runNext();

    expect(controller.getState().draggingAxis).toBeNull();
    expect(listener).toHaveBeenCalledExactlyOnceWith(controller.getState(), {
      reasons: ["geometry"],
    });
  });

  test("destroy는 pending RAF와 observer를 정리하고 captured callback, controller와 ingress를 no-op으로 만든다", () => {
    scenario = createControllerTestScenario({
      instrumentation: ["captured-callbacks", "dom-events", "resource-events"],
    });
    const { controller, ingress } = scenario.createRuntime();
    const listener = vi.fn();
    controller.subscribe(listener);

    scenario.frames.runNext();
    scenario.elements.scroller.dispatchEvent(new Event("scroll"));
    scenario.frames.runNext();
    controller.refresh();
    scenario.clearTrace();
    listener.mockClear();
    controller.destroy();
    scenario.frames.runCaptured(3);
    scenario.timers.runCaptured(1);
    scenario.resize.emit();
    controller.refresh();
    controller.scrollTo({ x: 200, y: 300 });
    ingress.dispatch({ type: "holder-pointer-enter" });
    ingress.dispatch({
      type: "holder-pointer-down",
      event: scenario.pointer.event("pointerdown", {
        pointerId: 2,
        clientX: 95,
        clientY: 10,
      }),
    });

    expect(scenario.frames.cancelCount).toBe(1);
    expect(scenario.timers.clearCount).toBe(1);
    expect(scenario.resize.disconnectCount(0)).toBe(1);
    expect(scenario.frames.pendingCount).toBe(0);
    expect(scenario.frames.requestCount).toBe(3);
    expect(scenario.events).toEqual([
      "raf:3",
      "listener:scroller:scroll",
      "timer:1",
      "observer:0",
    ]);
    expect(
      scenario.events.some(
        (event) => event.startsWith("read ") || event.startsWith("write "),
      ),
    ).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
