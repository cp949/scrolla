// @vitest-environment jsdom

import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ScrollbarController,
  ScrollbarControllerCreateOptions,
  ScrollbarControllerElements,
  ScrollbarControllerRuntime,
} from "../src/core/index.js";

const createScrollbarControllerRuntime = vi.fn<
  (
    elements: ScrollbarControllerElements,
    options?: ScrollbarControllerCreateOptions,
  ) => ScrollbarControllerRuntime
>();

vi.mock("../src/core/index.js", () => ({
  createScrollbarControllerRuntime: (
    elements: ScrollbarControllerElements,
    options?: ScrollbarControllerCreateOptions,
  ) => createScrollbarControllerRuntime(elements, options),
}));

const { Scrolla } = await import("../src/Scrolla.js");

/**
 * hydration mismatch 검증은 첫 commit(useLayoutEffect 이전) 단계만 다루므로, controller stub은
 * mount effect가 호출하는 method 형태만 갖추면 된다.
 */
function createControllerStub(): ScrollbarControllerRuntime {
  const controller: ScrollbarController = {
    updateOptions: vi.fn(),
    refresh: vi.fn(),
    scrollTo: vi.fn(),
    scrollBy: vi.fn(),
    getState: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    destroy: vi.fn(),
  };
  return {
    controller,
    ingress: {
      dispatch: vi.fn(),
      getEffectiveDirection: vi.fn(() => "ltr"),
    },
  };
}

function structureSignature(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>("div")).map(
    (element) => element.className,
  );
}

/**
 * `renderToString`으로 server 마크업을 만들고 같은 element로 `hydrateRoot`한다.
 * `console.error` spy를 `renderToString` 이후(=hydrate 직전)에 설치해, "useLayoutEffect does
 * nothing on the server"처럼 hydration mismatch와 무관한 SSR 경고와 섞이지 않게 한다.
 */
function renderAndHydrate(element: React.ReactElement): {
  html: string;
  container: HTMLDivElement;
} {
  const html = renderToString(element);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);

  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  act(() => {
    hydrateRoot(container, element);
  });
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();

  return { html, container };
}

afterEach(() => {
  createScrollbarControllerRuntime.mockReset();
  document.body.innerHTML = "";
});

describe("SSR과 hydration", () => {
  it("server 정적 마크업과 client hydrate 후 DOM이 같은 8-element 구조·순서를 갖고 hydration mismatch 경고가 없다", () => {
    createScrollbarControllerRuntime.mockImplementation(() =>
      createControllerStub(),
    );

    const { html, container } = renderAndHydrate(<Scrolla>본문</Scrolla>);

    const serverContainer = document.createElement("div");
    serverContainer.innerHTML = html;
    const serverStructure = structureSignature(serverContainer);

    expect(serverStructure).toEqual([
      "scrolla",
      "scrolla__wrapper",
      "scrolla__scroller",
      "scrolla__content",
      "scrolla__track scrolla__track--vertical",
      "scrolla__thumb scrolla__thumb--vertical",
      "scrolla__track scrolla__track--horizontal",
      "scrolla__thumb scrolla__thumb--horizontal",
    ]);
    expect(structureSignature(container)).toEqual(serverStructure);
    expect(container.textContent).toBe("본문");
  });

  it("direction=auto는 server render와 첫 client render 모두 provisional data-direction=ltr을 사용하고 style.direction을 강제하지 않는다", () => {
    createScrollbarControllerRuntime.mockImplementation(() =>
      createControllerStub(),
    );

    const { html, container } = renderAndHydrate(
      <Scrolla direction="auto" />,
    );

    const serverContainer = document.createElement("div");
    serverContainer.innerHTML = html;
    const serverHolder = serverContainer.firstElementChild as HTMLElement;
    expect(serverHolder.dataset.direction).toBe("ltr");
    expect(serverHolder.style.direction).toBe("");

    const clientHolder = container.firstElementChild as HTMLElement;
    expect(clientHolder.dataset.direction).toBe("ltr");
    expect(clientHolder.style.direction).toBe("");
  });

  it("explicit direction=rtl은 server render부터 data-direction과 holder style.direction을 rtl로 사용한다", () => {
    createScrollbarControllerRuntime.mockImplementation(() =>
      createControllerStub(),
    );

    const { html, container } = renderAndHydrate(
      <Scrolla direction="rtl" axis="vertical" />,
    );

    const serverContainer = document.createElement("div");
    serverContainer.innerHTML = html;
    const serverHolder = serverContainer.firstElementChild as HTMLElement;
    expect(serverHolder.dataset.direction).toBe("rtl");
    expect(serverHolder.style.direction).toBe("rtl");

    const clientHolder = container.firstElementChild as HTMLElement;
    expect(clientHolder.dataset.direction).toBe("rtl");
    expect(clientHolder.style.direction).toBe("rtl");
  });

  it("module import와 server render 자체는 browser global에 접근하지 않는다(mock controller가 호출되지 않음)", () => {
    createScrollbarControllerRuntime.mockImplementation(() =>
      createControllerStub(),
    );

    renderToString(<Scrolla axis="both" />);

    expect(createScrollbarControllerRuntime).not.toHaveBeenCalled();
  });
});
