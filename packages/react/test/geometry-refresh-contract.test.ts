// @vitest-environment jsdom

import { afterEach, describe, expect, test } from "vitest";
import {
  createControllerTestScenario,
  type ControllerTestScenario,
} from "./support/controller-test-platform.js";

let scenario: ControllerTestScenario | undefined;

afterEach(() => {
  scenario?.dispose();
  scenario = undefined;
});

// image load, webfont swap과 DOM mutation으로 인한 content 크기 증가/감소가
// refresh()로 복구되는 제네릭 계약은 이미 controller.test.ts(예: "첫 준비 frame..." 및
// "geometry 변화로 overflow가 사라지면...")가 증거로 검증한다. 이 파일은 그 계약 위에서
// container box가 고정된 채 scroll extent만 바뀌는
// virtualization과, metric이 0으로 collapse했다가 원래 값으로 되돌아오는 display:none
// round-trip — 만 추가로 고정한다.
describe("geometry 자동/수동 갱신 계약", () => {
  test("virtualized content: container box(viewport/track)는 고정한 채 scroll extent만 크게 변해도 refresh() 한 번으로 정확히 반영한다", () => {
    scenario = createControllerTestScenario();
    const controller = scenario.createController();

    scenario.frames.runNext();
    expect(controller.getState().viewportSize).toEqual({
      width: 100,
      height: 200,
    });

    // 가상화 목록이 늘어나 scroll extent(scrollHeight)만 커지고 viewport/track box는 그대로다.
    scenario.metrics.scrollHeight = 50000;
    controller.refresh();
    scenario.frames.runNext();

    const state = controller.getState();
    expect(state.viewportSize).toEqual({ width: 100, height: 200 });
    expect(state.contentSize).toEqual({ width: 400, height: 50000 });
    expect(state.overflow.vertical).toBe(true);
    expect(state.maxPosition.y).toBe(49800);
    expect(scenario.elements.thumbVertical.style.height).toBe("24px");
  });

  test("display:none 복귀: hidden 구간에서 자동 갱신 없이 metric이 0으로 collapse했다가 복귀해도 refresh() 한 번으로 원래 position과 geometry를 그대로 복원한다", () => {
    scenario = createControllerTestScenario({
      initialPosition: { x: 150, y: 300 },
    });
    const controller = scenario.createController({
      initialPosition: { x: 150, y: 300 },
    });

    scenario.frames.runNext();
    const beforeHide = controller.getState();
    expect(beforeHide.position).toEqual({ x: 150, y: 300 });
    expect(beforeHide.overflow).toEqual({ horizontal: true, vertical: true });
    const transformBeforeHide = {
      horizontal: scenario.elements.thumbHorizontal.style.transform,
      vertical: scenario.elements.thumbVertical.style.transform,
    };

    // display:none은 holder.isConnected를 바꾸지 않고 client/scroll 측정값만 0으로
    // collapse시킨다. 이 구간에서 ResizeObserver가 감지하지 못했다고 가정하고 아무 것도
    // invalidate하지 않는다 — metric 변화만으로는 public state가 바뀌지 않아야 한다.
    scenario.metrics.clientWidth = 0;
    scenario.metrics.clientHeight = 0;
    scenario.metrics.scrollWidth = 0;
    scenario.metrics.scrollHeight = 0;
    expect(controller.getState()).toBe(beforeHide);

    // display:block으로 복귀 — 실제 브라우저는 scrollLeft/scrollTop을 hidden 구간에도
    // 보존하므로 native position은 손대지 않는다.
    scenario.metrics.clientWidth = 100;
    scenario.metrics.clientHeight = 200;
    scenario.metrics.scrollWidth = 400;
    scenario.metrics.scrollHeight = 800;
    controller.refresh();
    scenario.frames.runNext();

    expect(controller.getState()).toEqual(beforeHide);
    expect(scenario.elements.thumbHorizontal.style.transform).toBe(
      transformBeforeHide.horizontal,
    );
    expect(scenario.elements.thumbVertical.style.transform).toBe(
      transformBeforeHide.vertical,
    );
  });
});
