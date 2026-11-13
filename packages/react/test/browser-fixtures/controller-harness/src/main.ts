import { createScrollbarControllerRuntime } from "../../../../src/core/index.js";
import type {
  ScrollbarController,
  ScrollbarControllerCreateOptions,
  ScrollbarControllerElements,
  ScrollbarControllerIngress,
  ScrollbarControllerRuntime,
} from "../../../../src/core/index.js";
import "../../../../src/styles.scss";

function createTrackedElement(className: string): HTMLDivElement {
  const element = document.createElement("div");
  element.className = className;
  return element;
}

interface HarnessSizes {
  readonly holderWidth: number;
  readonly holderHeight: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
}

function buildMarkup(
  testId: string,
  sizes: HarnessSizes,
): ScrollbarControllerElements {
  const holder = createTrackedElement("scrolla");
  const wrapper = createTrackedElement("scrolla__wrapper");
  const scroller = createTrackedElement("scrolla__scroller");
  const content = createTrackedElement("scrolla__content");
  const trackVertical = createTrackedElement(
    "scrolla__track scrolla__track--vertical",
  );
  const thumbVertical = createTrackedElement(
    "scrolla__thumb scrolla__thumb--vertical",
  );
  const trackHorizontal = createTrackedElement(
    "scrolla__track scrolla__track--horizontal",
  );
  const thumbHorizontal = createTrackedElement(
    "scrolla__thumb scrolla__thumb--horizontal",
  );

  holder.style.width = `${sizes.holderWidth}px`;
  holder.style.height = `${sizes.holderHeight}px`;
  holder.setAttribute("data-testid", testId);

  content.style.width = `${sizes.contentWidth}px`;
  content.style.height = `${sizes.contentHeight}px`;
  content.textContent = `Scrolla controller harness content (${testId})`;

  wrapper.append(scroller);
  scroller.append(content);
  trackVertical.append(thumbVertical);
  trackHorizontal.append(thumbHorizontal);
  holder.append(wrapper, trackVertical, trackHorizontal);

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

/** Scrolla.tsx의 useLayoutEffect 배선(holder pointerenter/pointerleave/focusin/focusout,
 * holder pointerdown capture, thumb keydown)을 vanilla DOM으로 재현한다. */
function wireInteractions(
  elements: ScrollbarControllerElements,
  runtime: ScrollbarControllerRuntime,
): void {
  const { controller, ingress } = runtime;

  elements.holder.addEventListener(
    "pointerdown",
    (event) => ingress.dispatch({ type: "holder-pointer-down", event }),
    true,
  );
  elements.holder.addEventListener("pointerenter", () => {
    ingress.dispatch({ type: "holder-pointer-enter" });
  });
  elements.holder.addEventListener("pointerleave", () => {
    ingress.dispatch({ type: "holder-pointer-leave" });
  });
  elements.holder.addEventListener("focusin", () => {
    ingress.dispatch({ type: "holder-focus-in" });
  });
  elements.holder.addEventListener("focusout", (event) => {
    ingress.dispatch({ type: "holder-focus-out", event });
  });
  elements.thumbVertical.addEventListener("keydown", (event) => {
    ingress.dispatch({ type: "thumb-key-down", axis: "vertical", event });
  });
  elements.thumbHorizontal.addEventListener("keydown", (event) => {
    ingress.dispatch({ type: "thumb-key-down", axis: "horizontal", event });
  });

  function syncTabIndex(): void {
    const state = controller.getState();
    elements.thumbVertical.tabIndex = state.overflow.vertical ? 0 : -1;
    elements.thumbHorizontal.tabIndex = state.overflow.horizontal ? 0 : -1;
  }
  syncTabIndex();
  controller.subscribe(syncTabIndex);
}

function mountHarnessRuntime(
  root: HTMLElement,
  testId: string,
  sizes: HarnessSizes,
  options: ScrollbarControllerCreateOptions,
): ScrollbarControllerRuntime {
  const elements = buildMarkup(testId, sizes);
  root.append(elements.holder);
  const runtime = createScrollbarControllerRuntime(elements, options);
  wireInteractions(elements, runtime);
  return runtime;
}

function mountHarness(
  root: HTMLElement,
  testId: string,
  sizes: HarnessSizes,
  options: ScrollbarControllerCreateOptions,
): ScrollbarController {
  return mountHarnessRuntime(root, testId, sizes, options).controller;
}

const root = document.getElementById("app");
if (root === null) {
  throw new Error("app root element를 찾을 수 없습니다.");
}

// 이 harness는 internal core를 직접 구동하는 검증 전용 페이지다. 공개 API 소비자
// 산출물이 아니므로 window 전역 노출은 계약 위반이 아니다 — Playwright spec이 이
// controller들로 scrollTo/getState 등을 호출해 실제 Chrome83에서 core가 동작하는지
// 확인한다.
declare global {
  interface Window {
    __scrollaController?: ScrollbarController;
    __scrollaControllerRtl?: ScrollbarController;
    // getEffectiveDirection은 controller가 아니라 ingress에만 있다.
    __scrollaIngressRtl?: ScrollbarControllerIngress;
    __scrollaControllerNestedOuter?: ScrollbarController;
    __scrollaControllerNestedInner?: ScrollbarController;
    __scrollaControllerAutoHide?: ScrollbarController;
  }
}

window.__scrollaController = mountHarness(
  root,
  "harness-holder",
  {
    holderWidth: 300,
    holderHeight: 200,
    contentWidth: 800,
    contentHeight: 800,
  },
  { axis: "both", direction: "auto", autoHide: false },
);

const rtlHolder = document.createElement("div");
rtlHolder.style.direction = "rtl";
root.append(rtlHolder);
const rtlRuntime = mountHarnessRuntime(
  rtlHolder,
  "harness-holder-rtl",
  {
    holderWidth: 300,
    holderHeight: 200,
    contentWidth: 800,
    contentHeight: 800,
  },
  { axis: "both", direction: "rtl", autoHide: false },
);
window.__scrollaControllerRtl = rtlRuntime.controller;
window.__scrollaIngressRtl = rtlRuntime.ingress;

// nested scroll(wheel chaining) 검증 전용 구조: 안쪽 harness의 holder를 바깥
// harness의 content 안에 중첩시켜 실제 DOM 중첩 구조를 만든다. mountHarness는
// holder를 곧바로 root에 append하는 편의 함수라 부모의 content에 append해야 하는
// 안쪽 인스턴스에는 그대로 쓸 수 없어, buildMarkup + 수동 append +
// createScrollbarControllerRuntime + wireInteractions를 직접 조합한다.
// outer/inner 각각의 wireInteractions가 자기 holder에 pointerdown capture
// 리스너를 등록하는데, inner holder는 outer holder의 자손(outerElements.content
// 안에 append됨)이라 capture phase 특성상 outer의 리스너가 inner의 모든
// pointerdown보다 먼저 실행된다. pointer-interaction.ts의 hit-test가 좌표 기반이라
// outer의 track/thumb 영역과 inner의 영역이 겹치지 않는 지금은 문제가 없지만,
// 두 영역이 겹치는 좌표에서 pointer drag를 테스트하게 되면 outer가
// preventDefault()로 이벤트를 가로채 inner의 핸들러가 조용히 무시될 수 있다.
const outerHolder = document.createElement("div");
root.append(outerHolder);
const outerElements = buildMarkup("harness-holder-outer", {
  holderWidth: 320,
  holderHeight: 220,
  contentWidth: 320,
  contentHeight: 1200,
});
outerHolder.append(outerElements.holder);
const outerRuntime = createScrollbarControllerRuntime(outerElements, {
  axis: "vertical",
  direction: "auto",
  autoHide: false,
});
wireInteractions(outerElements, outerRuntime);
window.__scrollaControllerNestedOuter = outerRuntime.controller;

const innerElements = buildMarkup("harness-holder-inner", {
  holderWidth: 260,
  holderHeight: 160,
  contentWidth: 260,
  contentHeight: 700,
});
outerElements.content.append(innerElements.holder);
const innerRuntime = createScrollbarControllerRuntime(innerElements, {
  axis: "vertical",
  direction: "auto",
  autoHide: false,
});
wireInteractions(innerElements, innerRuntime);
window.__scrollaControllerNestedInner = innerRuntime.controller;

window.__scrollaControllerAutoHide = mountHarness(
  root,
  "harness-holder-auto-hide",
  {
    holderWidth: 300,
    holderHeight: 200,
    contentWidth: 800,
    contentHeight: 800,
  },
  { axis: "both", direction: "auto", autoHide: true, autoHideDelay: 300 },
);
