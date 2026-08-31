// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import type { ScrollbarControllerCreateOptions } from "../src/core/index.js";
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

// outer.content 아래 inner.holder를 매달아 실제 위젯 중첩(예: 스크롤 가능한 모달이
// 스크롤 가능한 페이지 안에 있는 경우)을 재현한다. wheel/scroll chaining의 물리적
// 동작은 브라우저 native scroller가 책임지므로(ADR-005) jsdom에서 검증하지 않는다.
// 서로의 element, scheduler와 event를 오염시키지 않는 격리만 검증한다.
function setupNested(
  outerOptions: ScrollbarControllerCreateOptions,
  innerOptions: ScrollbarControllerCreateOptions,
) {
  const outerScenario = createControllerTestScenario({
    instrumentation: ["resource-events"],
  });
  scenarios.push(outerScenario);
  const outerController = outerScenario.createController(outerOptions);

  const innerScenario = createControllerTestScenario({
    document: outerScenario.elements.holder.ownerDocument,
    instrumentation: ["resource-events"],
  });
  scenarios.push(innerScenario);
  outerScenario.elements.content.append(innerScenario.elements.holder);
  const innerController = innerScenario.createController(innerOptions);

  outerScenario.frames.runAll();
  innerScenario.frames.runAll();

  return {
    outer: { scenario: outerScenario, controller: outerController },
    inner: { scenario: innerScenario, controller: innerController },
  };
}

describe("nested controller instance 격리", () => {
  test("same-axis(둘 다 vertical) 중첩은 observer 관찰 대상, event listener와 invalidation을 서로 오염시키지 않는다", () => {
    const { outer, inner } = setupNested(
      { axis: "vertical" },
      { axis: "vertical" },
    );

    expect(outer.scenario.resize.instanceCount).toBe(1);
    expect(inner.scenario.resize.instanceCount).toBe(1);
    const outerObserved = outer.scenario.resize.observed(0);
    const innerObserved = inner.scenario.resize.observed(0);
    const combinedObserved = new Set([...outerObserved, ...innerObserved]);
    expect(combinedObserved.size).toBe(8);
    expect(outerObserved).not.toContain(inner.scenario.elements.scroller);
    expect(innerObserved).not.toContain(outer.scenario.elements.scroller);

    const outerListener = vi.fn();
    const innerListener = vi.fn();
    outer.controller.subscribe(outerListener);
    inner.controller.subscribe(innerListener);

    // inner에서 발생한 scroll은 native scroll event가 bubbling하지 않으므로
    // outer 쪽에는 어떤 invalidation도 만들지 않는다.
    inner.scenario.elements.scroller.dispatchEvent(new Event("scroll"));
    expect(inner.scenario.frames.pendingCount).toBe(1);
    expect(outer.scenario.frames.pendingCount).toBe(0);
    inner.scenario.frames.runNext();
    expect(outerListener).not.toHaveBeenCalled();

    // outer.refresh()는 outer 자신의 RAF만 예약하고 inner state는 건드리지 않는다.
    // innerListener는 직전 inner 자신의 scroll(정상 동작)로 이미 호출됐으므로 초기화한다.
    outerListener.mockClear();
    innerListener.mockClear();
    const innerStateBefore = inner.controller.getState();
    outer.scenario.metrics.scrollHeight = 1200;
    outer.controller.refresh();
    expect(outer.scenario.frames.pendingCount).toBe(1);
    expect(inner.scenario.frames.pendingCount).toBe(0);
    outer.scenario.frames.runNext();

    expect(outer.controller.getState().contentSize.height).toBe(1200);
    expect(inner.controller.getState()).toBe(innerStateBefore);
    expect(innerListener).not.toHaveBeenCalled();
  });

  test("cross-axis(outer vertical, inner horizontal) 중첩은 축을 독립적으로 계산하고 destroy가 상대를 오염시키지 않는다", () => {
    const { outer, inner } = setupNested(
      { axis: "vertical" },
      { axis: "horizontal" },
    );

    // axis가 다르므로 overflow는 각자의 활성 축에서만 계산된다.
    expect(outer.controller.getState().overflow).toEqual({
      horizontal: false,
      vertical: true,
    });
    expect(inner.controller.getState().overflow).toEqual({
      horizontal: true,
      vertical: false,
    });

    outer.scenario.clearTrace();
    inner.scenario.clearTrace();
    inner.controller.destroy();

    // inner를 destroy해도 outer의 scroll listener와 observer는 그대로 유지된다.
    expect(outer.scenario.events).not.toContain("listener:scroller:scroll");
    expect(outer.scenario.resize.disconnectCount(0)).toBe(0);
    expect(inner.scenario.resize.disconnectCount(0)).toBe(1);

    // outer는 inner destroy 이후에도 정상 동작한다.
    outer.scenario.metrics.scrollHeight = 2000;
    outer.controller.refresh();
    outer.scenario.frames.runNext();
    expect(outer.controller.getState().contentSize.height).toBe(2000);
  });
});
