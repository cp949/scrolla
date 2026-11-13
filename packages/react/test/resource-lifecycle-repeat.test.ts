// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
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
    throw new AggregateError(
      errors,
      "controller test scenarios cleanup failed",
    );
  }
}

afterEach(disposeScenarios);

// mount/unmount 반복은 test/strict-mode-resources.test.tsx가 React
// StrictMode 이중 mount/cleanup에서 실제 core로 증거를 제공한다. 이 파일은 그 위에서
// 아직 커버되지 않은 세 가지 — drag 진행 중 destroy, 공개 API 반복 호출(Q4 결정: refresh
// /scrollTo/updateOptions로 한정), 반복 생성·파괴 cycle의 기준선 복귀 — 만 추가한다.
const ACTIVE_POINTER_LISTENER_TYPES = [
  "pointermove",
  "pointerup",
  "pointercancel",
  "lostpointercapture",
] as const;

describe("자원 수명 — 반복 경로", () => {
  test("drag가 active인 상태에서 destroy()는 holder pointer listener 4종을 제거하고 pointer capture를 해제한다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["resource-events"],
    });
    scenarios.push(scenario);
    const runtime = scenario.createRuntime();
    const addListener = vi.spyOn(scenario.elements.holder, "addEventListener");
    scenario.frames.runNext();

    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: scenario.pointer.event("pointerdown", {
        pointerId: 1,
        clientX: 95,
        clientY: 10,
      }),
    });
    expect(addListener.mock.calls.map(([type]) => type)).toEqual(
      ACTIVE_POINTER_LISTENER_TYPES,
    );
    expect(scenario.pointer.capturedIds.size).toBe(1);
    scenario.frames.runNext();
    expect(runtime.controller.getState().draggingAxis).toBe("vertical");

    scenario.clearTrace();
    runtime.controller.destroy();

    expect(
      scenario.events.filter((event) => event.startsWith("listener:holder:")),
    ).toEqual(
      ACTIVE_POINTER_LISTENER_TYPES.map((type) => `listener:holder:${type}`),
    );
    expect(scenario.events).toContain("pointer-capture:1");
    expect(scenario.pointer.capturedIds.size).toBe(0);
  });

  test("destroy는 active pointer를 pending RAF보다 먼저 정리한다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["resource-events", "captured-callbacks"],
    });
    scenarios.push(scenario);
    const runtime = scenario.createRuntime();
    scenario.frames.runNext();

    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: scenario.pointer.event("pointerdown", {
        pointerId: 1,
        clientX: 95,
        clientY: 10,
      }),
    });
    expect(scenario.pointer.capturedIds.size).toBe(1);
    const pendingHandle = scenario.frames.requestCount;
    expect(scenario.frames.pendingCount).toBe(1);

    scenario.clearTrace();
    runtime.controller.destroy();

    expect(
      scenario.events.filter(
        (event) =>
          event.startsWith("listener:holder:") ||
          event.startsWith("pointer-capture:") ||
          event.startsWith("raf:"),
      ),
    ).toEqual([
      "listener:holder:pointermove",
      "listener:holder:pointerup",
      "listener:holder:pointercancel",
      "listener:holder:lostpointercapture",
      "pointer-capture:1",
      `raf:${pendingHandle}`,
    ]);
    scenario.clearTrace();
    expect(() => scenario.frames.runCaptured(pendingHandle)).not.toThrow();
    expect(scenario.events).toEqual([]);
  });

  test("destroy는 auto-hide timer, pending RAF, listener, observer 순서로 정리한다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["resource-events", "captured-callbacks"],
    });
    scenarios.push(scenario);
    const controller = scenario.createController({ autoHide: true });
    scenario.frames.runNext();
    const autoHideHandle = scenario.timers.setCount;
    expect(scenario.timers.pendingCount).toBe(1);
    controller.refresh();
    const pendingHandle = scenario.frames.requestCount;
    expect(scenario.frames.pendingCount).toBe(1);

    scenario.clearTrace();
    controller.destroy();

    expect(scenario.events).toEqual([
      `timer:${autoHideHandle}`,
      `raf:${pendingHandle}`,
      "listener:scroller:scroll",
      "observer:0",
    ]);
    scenario.clearTrace();
    expect(() => scenario.timers.runCaptured(autoHideHandle)).not.toThrow();
    expect(() => scenario.frames.runCaptured(pendingHandle)).not.toThrow();
    expect(scenario.events).toEqual([]);
  });

  test("destroy는 여러 cleanup 오류 뒤에도 listener와 observer를 정리하고 첫 오류를 다시 던진다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["resource-events", "captured-callbacks"],
    });
    scenarios.push(scenario);
    const controller = scenario.createController({ autoHide: true });
    scenario.frames.runNext();
    const autoHideError = new Error("auto-hide cleanup failure");
    const frameError = new Error("frame cleanup failure");
    const autoHideHandle = scenario.timers.setCount;
    expect(scenario.timers.pendingCount).toBe(1);
    controller.refresh();
    const pendingHandle = scenario.frames.requestCount;
    expect(scenario.frames.pendingCount).toBe(1);
    scenario.timers.failClear(autoHideHandle, autoHideError);
    scenario.frames.failCancel(pendingHandle, frameError);

    scenario.clearTrace();
    expect(() => controller.destroy()).toThrow(autoHideError);
    expect(scenario.events).toEqual([
      `timer:${autoHideHandle}`,
      `raf:${pendingHandle}`,
      "listener:scroller:scroll",
      "observer:0",
    ]);
    expect(scenario.frames.cancelCount).toBe(1);
    expect(scenario.resize.disconnectCount(0)).toBe(1);
    scenario.clearTrace();
    expect(() => scenario.timers.runCaptured(autoHideHandle)).not.toThrow();
    expect(() => scenario.frames.runCaptured(pendingHandle)).not.toThrow();
    expect(scenario.events).toEqual([]);
    expect(() => controller.destroy()).not.toThrow();
  });

  test("refresh/scrollTo/updateOptions를 다회 연속 호출해도 RAF는 하나만 예약되고 idle timer는 commit 전까지 생성되지 않는다", () => {
    const scenario = createControllerTestScenario();
    scenarios.push(scenario);
    const controller = scenario.createController({ scrollIdleDelay: 50 });
    scenario.frames.runNext();
    const requestCount = scenario.frames.requestCount;

    for (let i = 0; i < 50; i += 1) {
      controller.refresh();
      controller.scrollTo({ y: i });
      controller.updateOptions({ minThumbSize: 24 + (i % 2) });
    }

    expect(scenario.frames.requestCount).toBe(requestCount + 1);
    expect(scenario.frames.pendingCount).toBe(1);
    expect(scenario.timers.pendingCount).toBe(0);

    scenario.frames.runNext();

    expect(scenario.timers.pendingCount).toBe(1);
  });

  test("3회 반복 생성·파괴 cycle마다 listener/observer/RAF/timer가 매번 동일한 기준 수치로 돌아온다", () => {
    const cycles: Array<{
      scrollAdds: number;
      scrollRemoves: number;
      observed: number;
      disconnectCalls: number;
      requestCalls: number;
      activeTimersBeforeDestroy: number;
      activeTimersAfterDestroy: number;
    }> = [];

    for (let cycle = 0; cycle < 3; cycle += 1) {
      const scenario = createControllerTestScenario({
        instrumentation: ["resource-events"],
      });
      const addListener = vi.spyOn(
        scenario.elements.scroller,
        "addEventListener",
      );
      try {
        const controller = scenario.createController({ scrollIdleDelay: 50 });
        scenario.frames.runNext();
        scenario.elements.scroller.dispatchEvent(new Event("scroll"));
        scenario.frames.runNext();

        const scrollAdds = addListener.mock.calls.filter(
          ([type]) => type === "scroll",
        ).length;
        const requestCalls = scenario.frames.requestCount;
        const activeTimersBeforeDestroy = scenario.timers.pendingCount;

        scenario.clearTrace();
        controller.destroy();

        cycles.push({
          scrollAdds,
          scrollRemoves: scenario.events.filter(
            (event) => event === "listener:scroller:scroll",
          ).length,
          observed: scenario.resize.observed(0).length,
          disconnectCalls: scenario.resize.disconnectCount(0),
          requestCalls,
          activeTimersBeforeDestroy,
          activeTimersAfterDestroy: scenario.timers.pendingCount,
        });
      } finally {
        scenario.dispose();
      }
    }

    for (const cycle of cycles) {
      expect(cycle.scrollAdds).toBe(1);
      expect(cycle.scrollRemoves).toBe(cycle.scrollAdds);
      expect(cycle.observed).toBe(4);
      expect(cycle.disconnectCalls).toBe(1);
      expect(cycle.activeTimersBeforeDestroy).toBe(1);
      expect(cycle.activeTimersAfterDestroy).toBe(0);
    }
    // 세 cycle의 RAF request 횟수가 모두 같다 — cycle을 거듭해도 누적되지 않는다.
    expect(new Set(cycles.map((cycle) => cycle.requestCalls)).size).toBe(1);
  });
});
