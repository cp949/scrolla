// @vitest-environment jsdom

import { afterEach, describe, expect, test } from "vitest";
import { createControllerTestScenario } from "./support/controller-test-platform.js";

const scenarios: Array<{ dispose(): void }> = [];

afterEach(() => {
  disposeScenarios(scenarios);
});

function disposeScenarios(registered: Array<{ dispose(): void }>): void {
  const errors: unknown[] = [];
  for (const scenario of registered.splice(0).reverse()) {
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
      "controller test scenario afterEach cleanup failed",
    );
  }
}

function createScenario(
  ...input: Parameters<typeof createControllerTestScenario>
) {
  const scenario = createControllerTestScenario(...input);
  scenarios.push(scenario);
  return scenario;
}

describe("controller test platform", () => {
  test("기본 scenario는 8-element topology와 첫 frame state를 만들고 dispose로 환경을 복구한다", () => {
    const beforeDescriptors = [
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "setTimeout",
      "clearTimeout",
      "Date",
      "ResizeObserver",
    ].map(
      (name) => [name, Object.getOwnPropertyDescriptor(window, name)] as const,
    );
    const scenario = createScenario();
    const controller = scenario.createController();

    expect(scenario.elements.wrapper.parentElement).toBe(
      scenario.elements.holder,
    );
    expect(scenario.elements.content.parentElement).toBe(
      scenario.elements.scroller,
    );
    expect(scenario.frames.pendingCount).toBe(1);
    scenario.frames.runNext();
    expect(controller.getState().contentSize).toEqual({
      width: 400,
      height: 800,
    });

    scenario.dispose();
    expect(scenario.elements.holder.isConnected).toBe(false);
    for (const [name, descriptor] of beforeDescriptors) {
      expect(Object.getOwnPropertyDescriptor(window, name)).toEqual(descriptor);
    }
    expect(
      Object.getOwnPropertyDescriptor(scenario.elements.scroller, "scrollLeft"),
    ).toBe(undefined);
    expect(
      Object.getOwnPropertyDescriptor(
        scenario.elements.holder,
        "setPointerCapture",
      ),
    ).toBe(undefined);
  });

  test("controller와 runtime은 같은 mutable metric과 native position environment를 사용한다", () => {
    const controllerScenario = createScenario();
    const controller = controllerScenario.createController();
    controllerScenario.frames.runNext();

    const runtimeScenario = createScenario();
    const runtime = runtimeScenario.createRuntime();

    runtimeScenario.frames.runNext();
    controllerScenario.metrics.scrollWidth = 900;
    controllerScenario.position.x = 12;
    runtimeScenario.position.y = 200;
    controller.refresh();
    controllerScenario.elements.scroller.dispatchEvent(new Event("scroll"));
    runtimeScenario.elements.scroller.dispatchEvent(new Event("scroll"));
    controllerScenario.frames.runAll();
    runtimeScenario.frames.runAll();

    expect(controller.getState().contentSize.width).toBe(900);
    expect(controller.getState().position.x).toBe(12);
    expect(runtime.controller.getState().position.y).toBe(200);
    expect(controllerScenario.writes).toContainEqual(["x", 0]);
    expect(runtimeScenario.writes).toContainEqual(["y", 0]);
  });

  test("semantic frame, timer, resize, pointer drivers operate without exposing browser doubles", () => {
    const scenario = createScenario({
      instrumentation: ["resource-events", "captured-callbacks"],
    });
    const runtime = scenario.createRuntime({
      autoHide: true,
      autoHideDelay: 10,
    });

    scenario.frames.runNext();
    runtime.ingress.dispatch({ type: "holder-pointer-enter" });
    runtime.ingress.dispatch({ type: "holder-pointer-leave" });
    scenario.timers.advance(10);
    expect(scenario.timers.setCount).toBeGreaterThan(0);
    expect(scenario.timers.pendingCount).toBeGreaterThan(0);
    scenario.timers.runDue();
    scenario.resize.emit();
    expect(scenario.resize.observed(0)).toContain(scenario.elements.scroller);
    expect(scenario.frames.pendingCount).toBe(1);
    scenario.frames.runNext();

    const event = scenario.pointer.event("pointerdown", {
      pointerId: 7,
      clientX: 95,
      clientY: 10,
    });
    runtime.ingress.dispatch({ type: "holder-pointer-down", event });
    expect(scenario.pointer.capturedIds.has(7)).toBe(true);
    scenario.dispose();
    expect(scenario.events).toContain("pointer-capture:7");
  });

  test("instrumentation은 opt-in이며 취소된 callback은 capability를 요청했을 때만 semantic driver로 재실행한다", () => {
    const quietScenario = createScenario();
    quietScenario.createController();
    expect(quietScenario.events).toEqual([]);
    expect(() => quietScenario.frames.runCaptured(1)).toThrow(
      "실행할 frame이 없습니다.",
    );

    const scenario = createScenario({
      instrumentation: ["dom-events", "resource-events", "captured-callbacks"],
    });
    scenario.createController();
    const handle = 1;
    scenario.frames.runCaptured(handle);

    expect(scenario.events.some((event) => event.startsWith("read "))).toBe(
      true,
    );

    const timerScenario = createScenario({
      instrumentation: ["captured-callbacks"],
    });
    const runtime = timerScenario.createRuntime({ autoHide: true });
    timerScenario.frames.runNext();
    runtime.ingress.dispatch({ type: "holder-pointer-enter" });
    runtime.ingress.dispatch({ type: "holder-pointer-leave" });
    expect(timerScenario.timers.setCount).toBeGreaterThan(0);
    expect(() => timerScenario.timers.runCaptured(1)).not.toThrow();
  });

  test("advance는 시계만 이동하고 runDue는 due snapshot을 한 번만 실행한다", () => {
    const scenario = createScenario({
      instrumentation: ["captured-callbacks"],
    });
    const runtime = scenario.createRuntime({
      autoHide: true,
      autoHideDelay: 10,
    });
    scenario.frames.runNext();
    runtime.ingress.dispatch({ type: "holder-pointer-enter" });
    runtime.ingress.dispatch({ type: "holder-pointer-leave" });

    const pendingBeforeAdvance = scenario.timers.pendingCount;
    scenario.timers.advance(10);
    expect(scenario.timers.pendingCount).toBe(pendingBeforeAdvance);
    expect(scenario.frames.pendingCount).toBe(0);
    scenario.timers.runDue();
    expect(scenario.timers.pendingCount).toBe(0);
    expect(scenario.frames.pendingCount).toBe(1);
  });

  test("runDue는 dueAt·handle 순서 snapshot만 실행하고 callback의 새 timer는 다음 호출로 미룬다", () => {
    const scenario = createScenario();
    const targetWindow = scenario.elements.holder.ownerDocument.defaultView!;
    const calls: string[] = [];
    targetWindow.setTimeout(() => {
      calls.push("due-20");
      targetWindow.setTimeout(() => calls.push("nested-due-20"), 0);
    }, 20);
    targetWindow.setTimeout(() => calls.push("due-10"), 10);

    scenario.timers.advance(20);
    expect(calls).toEqual([]);
    scenario.timers.runDue();
    expect(calls).toEqual(["due-10", "due-20"]);
    expect(scenario.timers.pendingCount).toBe(1);
    scenario.timers.runDue();
    expect(calls).toEqual(["due-10", "due-20", "nested-due-20"]);
  });

  test("취소된 frame과 timer callback을 늦게 실행해도 production runtime은 no-op이다", () => {
    const scenario = createScenario({
      instrumentation: ["captured-callbacks"],
    });
    const runtime = scenario.createRuntime({ autoHide: true });
    scenario.frames.runNext();
    runtime.ingress.dispatch({ type: "holder-pointer-enter" });
    runtime.ingress.dispatch({ type: "holder-pointer-leave" });
    const timerHandle = scenario.timers.setCount;

    runtime.controller.refresh();
    const frameHandle = scenario.frames.requestCount;
    runtime.controller.destroy();
    expect(scenario.frames.pendingCount).toBe(0);
    expect(scenario.timers.pendingCount).toBe(0);
    expect(() => scenario.frames.runCaptured(frameHandle)).not.toThrow();
    expect(() => scenario.timers.runCaptured(timerHandle)).not.toThrow();
    expect(scenario.frames.pendingCount).toBe(0);
  });

  test("cleanup failure injection은 다음 controller cleanup과 descriptor restoration을 계속한다", () => {
    const beforeRaf = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    const scenario = createScenario({ instrumentation: ["resource-events"] });
    scenario.createController();
    scenario.createController();
    scenario.frames.failCancel(
      2,
      new Error("second controller cancel failure"),
    );
    scenario.frames.failCancel(1, new Error("first controller cancel failure"));

    expect(() => scenario.dispose()).toThrow(AggregateError);
    expect(scenario.events.indexOf("raf:2")).toBeLessThan(
      scenario.events.indexOf("raf:1"),
    );
    expect(
      Object.getOwnPropertyDescriptor(window, "requestAnimationFrame"),
    ).toEqual(beforeRaf);
    expect(scenario.elements.holder.isConnected).toBe(false);
  });

  test("timer, observer, pointer failure도 cleanup 순서·계속 실행·error aggregation을 보존한다", () => {
    const beforeRaf = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    const scenario = createScenario({ instrumentation: ["resource-events"] });
    const first = scenario.createRuntime({ autoHide: true });
    const second = scenario.createRuntime();
    scenario.frames.runAll();
    first.ingress.dispatch({ type: "holder-pointer-enter" });
    first.ingress.dispatch({ type: "holder-pointer-leave" });
    const pointer = scenario.pointer.event("pointerdown", {
      pointerId: 3,
      clientX: 95,
      clientY: 10,
    });
    first.ingress.dispatch({ type: "holder-pointer-down", event: pointer });
    const activeFrameHandle = scenario.frames.requestCount;
    const timerError = new Error("timer clear failure");
    const observerError = new Error("observer disconnect failure");
    const pointerError = new Error("pointer release failure");
    scenario.timers.failClear(scenario.timers.setCount, timerError);
    scenario.resize.failDisconnect(0, observerError);
    scenario.pointer.failRelease(3, pointerError);
    second.controller.refresh();
    const frameHandle = scenario.frames.requestCount;
    const frameError = new Error("frame cancel failure");
    scenario.frames.failCancel(frameHandle, frameError);

    let cleanupError: unknown;
    try {
      scenario.dispose();
    } catch (error) {
      cleanupError = error;
    }
    expect(cleanupError).toBeInstanceOf(AggregateError);
    expect((cleanupError as AggregateError).errors).toEqual(
      expect.arrayContaining([frameError, timerError]),
    );
    expect(scenario.events).toEqual(
      expect.arrayContaining([
        "listener:holder:pointermove",
        "listener:holder:pointerup",
        "listener:holder:pointercancel",
        "listener:holder:lostpointercapture",
        "pointer-capture:3",
        `timer:${scenario.timers.setCount}`,
        `raf:${activeFrameHandle}`,
        `raf:${frameHandle}`,
        "listener:scroller:scroll",
        "observer:0",
      ]),
    );
    expect(
      Object.getOwnPropertyDescriptor(window, "requestAnimationFrame"),
    ).toEqual(beforeRaf);
  });

  test("primitive cleanup sentinel은 후속 cleanup과 descriptor restore 뒤 exact identity로 surface한다", () => {
    const beforeRaf = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    const scenario = createScenario({ instrumentation: ["resource-events"] });
    scenario.createController({ autoHide: true });
    scenario.frames.runNext();
    const primitiveSentinel = "primitive cleanup sentinel";
    scenario.timers.failClear(scenario.timers.setCount, primitiveSentinel);

    let cleanupError: unknown;
    try {
      scenario.dispose();
    } catch (error) {
      cleanupError = error;
    }
    expect(cleanupError).toBe(primitiveSentinel);
    expect(scenario.events).toEqual(
      expect.arrayContaining([
        `timer:${scenario.timers.setCount}`,
        "listener:scroller:scroll",
        "observer:0",
      ]),
    );
    expect(scenario.elements.holder.isConnected).toBe(false);
    expect(
      Object.getOwnPropertyDescriptor(window, "requestAnimationFrame"),
    ).toEqual(beforeRaf);
  });

  test("cross-realm Error sentinel은 후속 cleanup과 descriptor restore 뒤 exact identity로 surface한다", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    try {
      const targetWindow = iframe.contentWindow!;
      const targetDocument = iframe.contentDocument!;
      const beforeRaf = Object.getOwnPropertyDescriptor(
        targetWindow,
        "requestAnimationFrame",
      );
      const scenario = createScenario({
        document: targetDocument,
        instrumentation: ["resource-events"],
      });
      scenario.createRuntime();
      scenario.frames.runAll();
      const targetErrorConstructor = Reflect.get(
        targetWindow,
        "Error",
      ) as unknown;
      if (typeof targetErrorConstructor !== "function") {
        throw new TypeError("iframe Error constructor가 없습니다.");
      }
      const crossRealmError: unknown = Reflect.construct(
        targetErrorConstructor,
        ["cross-realm cleanup sentinel"],
      );
      expect(Object.prototype.toString.call(crossRealmError)).toBe(
        "[object Error]",
      );
      expect(crossRealmError).not.toBeInstanceOf(Error);
      scenario.resize.failDisconnect(0, crossRealmError);

      let cleanupError: unknown;
      try {
        scenario.dispose();
      } catch (error) {
        cleanupError = error;
      }
      expect(cleanupError).toBe(crossRealmError);
      expect(scenario.events).toEqual(
        expect.arrayContaining(["listener:scroller:scroll", "observer:0"]),
      );
      expect(scenario.elements.holder.isConnected).toBe(false);
      expect(
        Object.getOwnPropertyDescriptor(targetWindow, "requestAnimationFrame"),
      ).toEqual(beforeRaf);
    } finally {
      iframe.remove();
    }
  });

  test("failDisconnect sentinel은 후속 cleanup과 descriptor restore 뒤 동일 identity로 surface한다", () => {
    const beforeRaf = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    const scenario = createScenario({ instrumentation: ["resource-events"] });
    scenario.createRuntime();
    scenario.frames.runAll();
    const disconnectError = new Error("disconnect sentinel");
    scenario.resize.failDisconnect(0, disconnectError);

    let cleanupError: unknown;
    try {
      scenario.dispose();
    } catch (error) {
      cleanupError = error;
    }
    expect(cleanupError).toBe(disconnectError);
    expect(scenario.events).toEqual(
      expect.arrayContaining(["listener:scroller:scroll", "observer:0"]),
    );
    expect(scenario.elements.holder.isConnected).toBe(false);
    expect(
      Object.getOwnPropertyDescriptor(window, "requestAnimationFrame"),
    ).toEqual(beforeRaf);
  });

  test("failRelease sentinel은 scenario finalizer cleanup과 descriptor restore 뒤 동일 identity로 surface한다", () => {
    const beforeRaf = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    const scenario = createScenario({ instrumentation: ["resource-events"] });
    scenario.elements.holder.setPointerCapture(8);
    const releaseError = new Error("release sentinel");
    scenario.pointer.failRelease(8, releaseError);

    let cleanupError: unknown;
    try {
      scenario.dispose();
    } catch (error) {
      cleanupError = error;
    }
    expect(cleanupError).toBe(releaseError);
    expect(scenario.events).toContain("pointer-capture:8");
    expect(scenario.pointer.capturedIds.has(8)).toBe(false);
    expect(scenario.elements.holder.isConnected).toBe(false);
    expect(
      Object.getOwnPropertyDescriptor(window, "requestAnimationFrame"),
    ).toEqual(beforeRaf);
  });

  test("test cleanup helper는 inner failure 뒤 outer를 정리하고 모든 failure를 aggregate한다", () => {
    const calls: string[] = [];
    const innerError = new Error("inner cleanup failure");
    const outerError = new Error("outer cleanup failure");
    const registered = [
      {
        dispose() {
          calls.push("outer");
          throw outerError;
        },
      },
      {
        dispose() {
          calls.push("inner");
          throw innerError;
        },
      },
    ];

    let cleanupError: unknown;
    try {
      disposeScenarios(registered);
    } catch (error) {
      cleanupError = error;
    }
    expect(calls).toEqual(["inner", "outer"]);
    expect(registered).toEqual([]);
    expect(cleanupError).toBeInstanceOf(AggregateError);
    expect((cleanupError as AggregateError).errors).toEqual([
      innerError,
      outerError,
    ]);

    const single = [
      {
        dispose() {
          throw innerError;
        },
      },
    ];
    expect(() => disposeScenarios(single)).toThrow(innerError);
  });

  test("active drag cleanup은 pointer listener/capture 뒤 timer, RAF, listener, observer 순서를 기록한다", () => {
    const scenario = createScenario({ instrumentation: ["resource-events"] });
    const runtime = scenario.createRuntime({ autoHide: true });
    scenario.frames.runAll();
    runtime.ingress.dispatch({ type: "holder-pointer-enter" });
    runtime.ingress.dispatch({ type: "holder-pointer-leave" });
    const timerHandle = scenario.timers.setCount;
    const pointer = scenario.pointer.event("pointerdown", {
      pointerId: 4,
      clientX: 95,
      clientY: 10,
    });
    runtime.ingress.dispatch({ type: "holder-pointer-down", event: pointer });
    const frameHandle = scenario.frames.requestCount;
    scenario.clearTrace();

    scenario.dispose();

    expect(scenario.events).toEqual([
      "listener:holder:pointermove",
      "listener:holder:pointerup",
      "listener:holder:pointercancel",
      "listener:holder:lostpointercapture",
      "pointer-capture:4",
      `timer:${timerHandle}`,
      `raf:${frameHandle}`,
      "listener:scroller:scroll",
      "observer:0",
    ]);
  });

  test("중간 descriptor 설치 실패는 prior mutation과 holder를 rollback하고 setup·cleanup error를 보존한다", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const targetWindow = iframe.contentWindow!;
    const targetDocument = iframe.contentDocument!;
    const setupError = new Error("cancelAnimationFrame install failure");
    const cleanupError = new Error("requestAnimationFrame restore failure");
    const beforeRaf = Object.getOwnPropertyDescriptor(
      targetWindow,
      "requestAnimationFrame",
    );
    const beforeChildren = targetDocument.body.childElementCount;
    const defineProperty = Object.defineProperty;
    let installedRaf = false;

    Object.defineProperty = ((target, name, descriptor) => {
      if (target === targetWindow && name === "requestAnimationFrame") {
        if (installedRaf) {
          defineProperty(target, name, descriptor);
          throw cleanupError;
        }
        installedRaf = true;
      }
      if (target === targetWindow && name === "cancelAnimationFrame") {
        throw setupError;
      }
      return defineProperty(target, name, descriptor);
    }) as typeof Object.defineProperty;
    try {
      let setupFailure: unknown;
      try {
        createControllerTestScenario({ document: targetDocument });
      } catch (error) {
        setupFailure = error;
      }
      expect(setupFailure).toBeInstanceOf(AggregateError);
      expect((setupFailure as AggregateError).errors).toEqual(
        expect.arrayContaining([setupError, cleanupError]),
      );
      expect(targetDocument.body.childElementCount).toBe(beforeChildren);
      expect(
        Object.getOwnPropertyDescriptor(targetWindow, "requestAnimationFrame"),
      ).toEqual(beforeRaf);
    } finally {
      Object.defineProperty = defineProperty;
      iframe.remove();
    }
  });

  test("iframe owner document에만 substitute를 설치하고 global window를 그대로 둔다", () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const globalRaf = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    const targetWindow = iframe.contentWindow!;
    const targetDocument = iframe.contentDocument!;
    const frameRaf = Object.getOwnPropertyDescriptor(
      targetWindow,
      "requestAnimationFrame",
    );

    const scenario = createScenario({ document: targetDocument });
    expect(scenario.elements.holder.ownerDocument).toBe(targetDocument);
    expect(
      Object.getOwnPropertyDescriptor(window, "requestAnimationFrame"),
    ).toEqual(globalRaf);
    scenario.dispose();
    expect(
      Object.getOwnPropertyDescriptor(targetWindow, "requestAnimationFrame"),
    ).toEqual(frameRaf);
    iframe.remove();
  });

  test("pointer event defaults and explicit overrides preserve drag semantics", () => {
    const scenario = createScenario();
    const move = scenario.pointer.event("pointermove", {
      pointerId: 1,
      clientX: 10,
      clientY: 20,
    });
    const up = scenario.pointer.event("pointerup", {
      pointerId: 1,
      clientX: 10,
      clientY: 20,
    });
    const override = scenario.pointer.event("pointermove", {
      pointerId: 2,
      clientX: 30,
      clientY: 40,
      button: 2,
      buttons: 4,
      isPrimary: false,
      pointerType: "pen",
      shiftKey: true,
    });

    expect(move.buttons).toBe(1);
    expect(up.buttons).toBe(0);
    expect(override).toMatchObject({
      button: 2,
      buttons: 4,
      isPrimary: false,
      pointerType: "pen",
      shiftKey: true,
    });
  });

  test("nested scenarios restore descriptors in LIFO order and dispose is idempotent", () => {
    const beforeRaf = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    const outer = createScenario();
    outer.createController();
    const outerRaf = Object.getOwnPropertyDescriptor(
      window,
      "requestAnimationFrame",
    );
    const inner = createScenario();

    inner.dispose();
    expect(
      Object.getOwnPropertyDescriptor(window, "requestAnimationFrame"),
    ).toEqual(outerRaf);
    outer.dispose();
    expect(outer.frames.cancelCount).toBe(1);
    outer.dispose();
    expect(outer.frames.cancelCount).toBe(1);

    expect(
      Object.getOwnPropertyDescriptor(window, "requestAnimationFrame"),
    ).toEqual(beforeRaf);
  });
});
