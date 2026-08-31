// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createControllerTestScenario,
  type ControllerTestScenario,
} from "./support/controller-test-platform.js";

// jsdom엔 실제 layout engine이 없어 ms 타이밍은 real reflow 비용을 반영하지
// 않는다. 그래서 "성능 기준"을 ms 대신 forced-layout 유발 DOM API 호출 횟수/순서로
// 재정의하고, 현재 구현이 실제로 수행하는 호출을 characterization baseline으로 고정한다.
// 대상 API: getBoundingClientRect, clientWidth/clientHeight, scrollWidth/scrollHeight,
// scrollLeft/scrollTop, 그리고 direction="auto"에서 매 geometry pass가 호출하는
// getComputedStyle은 RTL 자동감지가
// 추가한 비용 — 이 파일이 처음으로 예산에 편입한다).

const scenarios: ControllerTestScenario[] = [];
const nativeGetComputedStyle = window.getComputedStyle.bind(window);

function disposeScenarios(): void {
  const errors: unknown[] = [];
  for (const scenario of scenarios.splice(0).reverse()) {
    try {
      scenario.dispose();
    } catch (error) {
      errors.push(error);
    }
  }
  vi.restoreAllMocks();
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "controller test scenarios cleanup failed");
  }
}

afterEach(disposeScenarios);

function installComputedStyleSpy() {
  return vi
    .spyOn(window, "getComputedStyle")
    .mockImplementation((element: Element, pseudoElt?: string | null) =>
      nativeGetComputedStyle(element, pseudoElt),
    );
}

function isWriteTag(tag: string): boolean {
  return tag.startsWith("write ");
}

function isReadTag(tag: string): boolean {
  return tag.startsWith("read ");
}

function forcedLayoutReadTags(
  events: readonly string[],
  computedStyle: ReturnType<typeof installComputedStyleSpy>,
): string[] {
  return [
    ...events.filter(isReadTag),
    ...computedStyle.mock.calls.map(() => "read getComputedStyle"),
  ];
}

function assertReadsPrecedeWrites(events: readonly string[]): void {
  const firstWriteIndex = events.findIndex(isWriteTag);
  if (firstWriteIndex === -1) {
    return;
  }
  expect(events.slice(firstWriteIndex).some(isReadTag)).toBe(false);
}

// direction="auto"(기본값)에서 geometry dirty가 고정하는 read 순서다. 6개 measurement read
// 뒤에 native position 2회, 마지막에 derive()의 RTL 자동감지 getComputedStyle 1회가 온다.
const GEOMETRY_READ_SEQUENCE_AUTO_DIRECTION = [
  "read clientWidth",
  "read clientHeight",
  "read scrollWidth",
  "read scrollHeight",
  "read horizontal rect",
  "read vertical rect",
  "read scrollLeft",
  "read scrollTop",
  "read getComputedStyle",
] as const;

// direction을 "ltr"/"rtl"로 명시하면 resolveEffectiveDirection이 getComputedStyle 없이
// 즉시 반환해 이 8개로 끝난다.
const GEOMETRY_READ_SEQUENCE_EXPLICIT_DIRECTION = [
  "read clientWidth",
  "read clientHeight",
  "read scrollWidth",
  "read scrollHeight",
  "read horizontal rect",
  "read vertical rect",
  "read scrollLeft",
  "read scrollTop",
] as const;

describe("forced-layout read 예산", () => {
  test("direction 미지정(auto) 최초 geometry dirty는 9회 forced-layout read를 고정 순서로 수행한다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    scenarios.push(scenario);
    const computedStyle = installComputedStyleSpy();
    const lastPlatformRead = vi.spyOn(
      scenario.elements.scroller,
      "scrollTop",
      "get",
    );
    const firstStyleWrite = vi.spyOn(
      scenario.elements.thumbHorizontal.style,
      "width",
      "set",
    );

    scenario.createController();
    scenario.frames.runNext();

    expect(forcedLayoutReadTags(scenario.events, computedStyle)).toEqual(
      GEOMETRY_READ_SEQUENCE_AUTO_DIRECTION,
    );
    expect(lastPlatformRead.mock.invocationCallOrder[0]).toBeLessThan(
      computedStyle.mock.invocationCallOrder[0]!,
    );
    expect(computedStyle.mock.invocationCallOrder[0]).toBeLessThan(
      firstStyleWrite.mock.invocationCallOrder[0]!,
    );
  });

  test("direction을 ltr/rtl로 명시하면 getComputedStyle 없이 8회 read로 끝난다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    scenarios.push(scenario);
    const computedStyle = installComputedStyleSpy();

    scenario.createController({ direction: "ltr" });
    scenario.frames.runNext();

    expect(forcedLayoutReadTags(scenario.events, computedStyle)).toEqual(
      GEOMETRY_READ_SEQUENCE_EXPLICIT_DIRECTION,
    );
  });

  test("steady-state geometry refresh은 같은 read 예산을 반복하며 모든 read가 write보다 먼저 끝난다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    scenarios.push(scenario);
    const computedStyle = installComputedStyleSpy();
    const lastPlatformRead = vi.spyOn(
      scenario.elements.scroller,
      "scrollTop",
      "get",
    );
    const styleWrites = [
      vi.spyOn(scenario.elements.thumbHorizontal.style, "width", "set"),
      vi.spyOn(scenario.elements.thumbHorizontal.style, "transform", "set"),
      vi.spyOn(scenario.elements.thumbVertical.style, "height", "set"),
      vi.spyOn(scenario.elements.thumbVertical.style, "transform", "set"),
    ];
    const controller = scenario.createController();
    scenario.frames.runNext();

    scenario.clearTrace();
    computedStyle.mockClear();
    lastPlatformRead.mockClear();
    for (const write of styleWrites) {
      write.mockClear();
    }
    scenario.metrics.horizontalTrack.width = 200;
    controller.refresh();
    scenario.frames.runNext();

    expect(forcedLayoutReadTags(scenario.events, computedStyle)).toEqual(
      GEOMETRY_READ_SEQUENCE_AUTO_DIRECTION,
    );
    expect(scenario.events.some(isWriteTag)).toBe(true);
    assertReadsPrecedeWrites(scenario.events);
    const firstComputedStyle = computedStyle.mock.invocationCallOrder[0];
    const firstStyleWrite = Math.min(
      ...styleWrites.flatMap((write) => write.mock.invocationCallOrder),
    );
    expect(lastPlatformRead.mock.invocationCallOrder[0]).toBeLessThan(
      firstComputedStyle!,
    );
    expect(firstComputedStyle).toBeLessThan(firstStyleWrite);
  });

  test("scroll dirty만 발생하면 native position 2회만 읽고 extent/track/getComputedStyle은 다시 읽지 않는다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    scenarios.push(scenario);
    const computedStyle = installComputedStyleSpy();
    scenario.createController();
    scenario.frames.runNext();

    scenario.clearTrace();
    computedStyle.mockClear();
    scenario.position.x = 120;
    scenario.position.y = 240;
    scenario.elements.scroller.dispatchEvent(new Event("scroll"));
    scenario.frames.runNext();

    expect(forcedLayoutReadTags(scenario.events, computedStyle)).toEqual([
      "read scrollLeft",
      "read scrollTop",
    ]);
  });

  test("interaction dirty만 발생하면 forced-layout read가 전혀 없다", () => {
    const scenario = createControllerTestScenario({
      instrumentation: ["dom-events"],
    });
    scenarios.push(scenario);
    const computedStyle = installComputedStyleSpy();
    const runtime = scenario.createRuntime();
    scenario.frames.runNext();

    scenario.clearTrace();
    computedStyle.mockClear();
    runtime.ingress.dispatch({
      type: "holder-pointer-down",
      event: scenario.pointer.event("pointerdown", {
        pointerId: 1,
        clientX: 95,
        clientY: 10,
      }),
    });
    scenario.frames.runNext();

    expect(runtime.controller.getState().draggingAxis).toBe("vertical");
    expect(forcedLayoutReadTags(scenario.events, computedStyle)).toEqual([]);
  });
});
