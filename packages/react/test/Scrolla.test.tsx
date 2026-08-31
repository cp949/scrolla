// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createRef, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ScrollbarController,
  ScrollbarControllerCreateOptions,
  ScrollbarControllerElements,
  ScrollbarControllerRuntime,
} from "../src/core/index.js";
import type {
  ScrollaChangeMeta,
  ScrollaHandle,
  ScrollaState,
  ScrollaStateListener,
} from "../src/value-types.js";

const createScrollbarControllerRuntime =
  vi.fn<
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

const ZERO_STATE: ScrollaState = {
  position: { x: 0, y: 0 },
  maxPosition: { x: 0, y: 0 },
  viewportSize: { width: 0, height: 0 },
  contentSize: { width: 0, height: 0 },
  overflow: { horizontal: false, vertical: false },
  scrolling: false,
  draggingAxis: null,
  visibility: "visible",
};

/**
 * controller lifecycle과 typed ingress를 각각 관찰 가능한 mock으로 노출하고,
 * subscribe에 전달된 listener를 emit()으로 대신 호출한다.
 */
function createControllerStub() {
  let listener: ScrollaStateListener | undefined;
  const destroy = vi.fn();
  const updateOptions = vi.fn();
  const subscribe = vi.fn((nextListener: ScrollaStateListener) => {
    listener = nextListener;
    return vi.fn();
  });
  const getEffectiveDirection = vi.fn<() => "ltr" | "rtl">(() => "ltr");
  const dispatch = vi.fn<ScrollbarControllerRuntime["ingress"]["dispatch"]>();
  const refresh = vi.fn();
  const scrollTo = vi.fn();
  const scrollBy = vi.fn();
  const getState = vi.fn(() => ZERO_STATE);

  const controllerApi: ScrollbarController = {
    updateOptions,
    refresh,
    scrollTo,
    scrollBy,
    getState,
    subscribe,
    destroy,
  };
  const ingress = {
    dispatch,
    getEffectiveDirection,
  };
  const runtime: ScrollbarControllerRuntime = {
    controller: controllerApi,
    ingress,
  };

  return {
    runtime,
    ingress,
    destroy,
    updateOptions,
    subscribe,
    getEffectiveDirection,
    dispatch,
    refresh,
    scrollTo,
    scrollBy,
    getState,
    emit(state: ScrollaState, meta: ScrollaChangeMeta) {
      listener?.(state, meta);
    },
  };
}

/** holder부터 8개 required element를 계약이 정한 부모-자식 순서로 찾아 반환한다. */
function queryElements(holder: Element) {
  const [wrapper, trackVertical, trackHorizontal] = Array.from(holder.children);
  const scroller = wrapper?.firstElementChild ?? null;
  const content = scroller?.firstElementChild ?? null;
  const thumbVertical = trackVertical?.firstElementChild ?? null;
  const thumbHorizontal = trackHorizontal?.firstElementChild ?? null;
  return {
    wrapper: wrapper as HTMLElement,
    scroller: scroller as HTMLElement,
    content: content as HTMLElement,
    trackVertical: trackVertical as HTMLElement,
    thumbVertical: thumbVertical as HTMLElement,
    trackHorizontal: trackHorizontal as HTMLElement,
    thumbHorizontal: thumbHorizontal as HTMLElement,
  };
}

afterEach(() => {
  cleanup();
  createScrollbarControllerRuntime.mockReset();
});

describe("Scrolla", () => {
  it("mount 시 8개 required element를 계약이 정한 부모-자식 구조로 렌더링한다", () => {
    createScrollbarControllerRuntime.mockReturnValue(
      createControllerStub().runtime,
    );

    const { container } = render(<Scrolla />);

    const holder = container.firstElementChild;
    expect(holder).not.toBeNull();
    const {
      wrapper,
      scroller,
      content,
      trackVertical,
      thumbVertical,
      trackHorizontal,
      thumbHorizontal,
    } = queryElements(holder as Element);

    for (const element of [
      holder,
      wrapper,
      scroller,
      content,
      trackVertical,
      thumbVertical,
      trackHorizontal,
      thumbHorizontal,
    ]) {
      expect(element?.tagName).toBe("DIV");
    }
    expect(holder?.children).toHaveLength(3);
    expect(wrapper.children).toHaveLength(1);
    expect(scroller.children).toHaveLength(1);
    expect(content.children).toHaveLength(0);
    expect(trackVertical.children).toHaveLength(1);
    expect(trackHorizontal.children).toHaveLength(1);
  });

  it("8개 element에 계약이 정한 안정적 public class를 부여한다", () => {
    createScrollbarControllerRuntime.mockReturnValue(
      createControllerStub().runtime,
    );

    const { container } = render(<Scrolla />);
    const holder = container.firstElementChild as HTMLElement;
    const {
      wrapper,
      scroller,
      content,
      trackVertical,
      thumbVertical,
      trackHorizontal,
      thumbHorizontal,
    } = queryElements(holder);

    expect(holder.className).toBe("scrolla");
    expect(wrapper.className).toBe("scrolla__wrapper");
    expect(scroller.className).toBe("scrolla__scroller");
    expect(content.className).toBe("scrolla__content");
    expect(trackVertical.className.split(" ")).toEqual(
      expect.arrayContaining(["scrolla__track", "scrolla__track--vertical"]),
    );
    expect(thumbVertical.className.split(" ")).toEqual(
      expect.arrayContaining(["scrolla__thumb", "scrolla__thumb--vertical"]),
    );
    expect(trackHorizontal.className.split(" ")).toEqual(
      expect.arrayContaining(["scrolla__track", "scrolla__track--horizontal"]),
    );
    expect(thumbHorizontal.className.split(" ")).toEqual(
      expect.arrayContaining(["scrolla__thumb", "scrolla__thumb--horizontal"]),
    );
  });

  it("mount 시 8개 element ref로 createScrollbarControllerRuntime를 생성한다", () => {
    createScrollbarControllerRuntime.mockReturnValue(
      createControllerStub().runtime,
    );

    const { container } = render(<Scrolla />);

    expect(createScrollbarControllerRuntime).toHaveBeenCalledTimes(1);
    const elements = createScrollbarControllerRuntime.mock.calls[0]?.[0];
    const holder = container.firstElementChild as Element;
    const {
      wrapper,
      scroller,
      content,
      trackVertical,
      thumbVertical,
      trackHorizontal,
      thumbHorizontal,
    } = queryElements(holder);

    expect(elements?.holder).toBe(holder);
    expect(elements?.wrapper).toBe(wrapper);
    expect(elements?.scroller).toBe(scroller);
    expect(elements?.content).toBe(content);
    expect(elements?.trackVertical).toBe(trackVertical);
    expect(elements?.thumbVertical).toBe(thumbVertical);
    expect(elements?.trackHorizontal).toBe(trackHorizontal);
    expect(elements?.thumbHorizontal).toBe(thumbHorizontal);
  });

  it("unmount 시 생성한 controller를 destroy한다", () => {
    const { runtime, destroy } = createControllerStub();
    createScrollbarControllerRuntime.mockReturnValue(runtime);

    const { unmount } = render(<Scrolla />);
    expect(destroy).not.toHaveBeenCalled();

    unmount();

    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("Strict Mode의 dev-only 이중 mount를 destroy 멱등성과 재생성으로 흡수한다", () => {
    const stubs: ReturnType<typeof createControllerStub>[] = [];
    createScrollbarControllerRuntime.mockImplementation(() => {
      const stub = createControllerStub();
      stubs.push(stub);
      return stub.runtime;
    });

    const { unmount } = render(
      <StrictMode>
        <Scrolla />
      </StrictMode>,
    );

    // React 18/19 StrictMode는 dev 모드에서 effect를 mount -> cleanup -> mount 순으로 두 번 실행한다.
    expect(createScrollbarControllerRuntime).toHaveBeenCalledTimes(2);
    const [first, second] = stubs;

    expect(first?.destroy).toHaveBeenCalledTimes(1);
    expect(second?.destroy).not.toHaveBeenCalled();

    unmount();

    expect(second?.destroy).toHaveBeenCalledTimes(1);
  });

  it("children을 content element 안에 렌더링한다", () => {
    createScrollbarControllerRuntime.mockReturnValue(
      createControllerStub().runtime,
    );

    const { container } = render(<Scrolla>본문</Scrolla>);

    const { content } = queryElements(container.firstElementChild as Element);
    expect(content.textContent).toBe("본문");
  });

  describe("props -> controller options", () => {
    it("mount 시 props를 create options로 변환해 전달한다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      render(
        <Scrolla
          axis="vertical"
          direction="rtl"
          autoHide
          autoHideDelay={500}
          scrollIdleDelay={50}
          minThumbSize={30}
          initialPosition={{ x: 1, y: 2 }}
        />,
      );

      const options = createScrollbarControllerRuntime.mock.calls[0]?.[1];
      expect(options).toEqual({
        axis: "vertical",
        direction: "rtl",
        autoHide: true,
        autoHideDelay: 500,
        scrollIdleDelay: 50,
        minThumbSize: 30,
        initialPosition: { x: 1, y: 2 },
      });
    });

    it("props가 바뀌면 controller를 재생성하지 않고 updateOptions만 호출한다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);

      const { rerender } = render(<Scrolla axis="both" />);
      rerender(<Scrolla axis="vertical" />);

      expect(createScrollbarControllerRuntime).toHaveBeenCalledTimes(1);
      expect(stub.updateOptions).toHaveBeenLastCalledWith({
        axis: "vertical",
        direction: "auto",
        autoHide: false,
        autoHideDelay: 1000,
        scrollIdleDelay: 120,
        minThumbSize: 24,
      });
    });

    it("initialPosition이 바뀌어도 updateOptions에는 전달하지 않는다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);

      const { rerender } = render(<Scrolla initialPosition={{ x: 1, y: 1 }} />);
      rerender(<Scrolla initialPosition={{ x: 9, y: 9 }} />);

      expect(createScrollbarControllerRuntime).toHaveBeenCalledTimes(1);
      for (const call of stub.updateOptions.mock.calls) {
        expect(call[0]).not.toHaveProperty("initialPosition");
      }
    });
  });

  describe("state -> callback/attribute", () => {
    it("subscribe listener가 전달한 state/meta로 onStateChange를 호출한다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);
      const onStateChange = vi.fn();

      render(<Scrolla onStateChange={onStateChange} />);
      const nextState: ScrollaState = {
        ...ZERO_STATE,
        scrolling: true,
      };
      const meta: ScrollaChangeMeta = { reasons: ["scroll"] };
      act(() => {
        stub.emit(nextState, meta);
      });

      expect(onStateChange).toHaveBeenCalledWith(nextState, meta);
    });

    it("data-axis에 axis prop을 그대로 반영한다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container } = render(<Scrolla axis="horizontal" />);

      expect(
        (container.firstElementChild as Element).getAttribute("data-axis"),
      ).toBe("horizontal");
    });

    it("data-direction은 mount 전 provisional ltr이고 첫 commit 후 getEffectiveDirection 값으로 갱신된다", () => {
      const stub = createControllerStub();
      stub.getEffectiveDirection.mockReturnValue("rtl");
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);

      const { container } = render(<Scrolla direction="auto" />);
      const holder = container.firstElementChild as HTMLElement;
      expect(holder.dataset.direction).toBe("ltr");

      act(() => {
        stub.emit(ZERO_STATE, { reasons: ["init"] });
      });

      expect(holder.dataset.direction).toBe("rtl");
    });

    it("explicit direction은 holder CSS direction을 강제하고 auto는 비워둔다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container: rtlContainer } = render(<Scrolla direction="rtl" />);
      expect(
        (rtlContainer.firstElementChild as HTMLElement).style.direction,
      ).toBe("rtl");

      const { container: autoContainer } = render(<Scrolla direction="auto" />);
      expect(
        (autoContainer.firstElementChild as HTMLElement).style.direction,
      ).toBe("");
    });

    it("overflow/scrolling/dragging/visibility를 holder data-* boolean 규칙대로 반영한다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);

      const { container } = render(<Scrolla />);
      const holder = container.firstElementChild as HTMLElement;

      act(() => {
        stub.emit(
          {
            ...ZERO_STATE,
            overflow: { horizontal: true, vertical: false },
            scrolling: true,
            draggingAxis: "vertical",
            visibility: "hidden",
          },
          { reasons: ["interaction"] },
        );
      });

      expect(holder.getAttribute("data-overflow-horizontal")).toBe("");
      expect(holder.hasAttribute("data-overflow-vertical")).toBe(false);
      expect(holder.getAttribute("data-scrolling")).toBe("");
      expect(holder.getAttribute("data-dragging")).toBe("vertical");
      expect(holder.getAttribute("data-visibility")).toBe("hidden");

      act(() => {
        stub.emit(ZERO_STATE, { reasons: ["interaction"] });
      });

      expect(holder.hasAttribute("data-overflow-horizontal")).toBe(false);
      expect(holder.hasAttribute("data-scrolling")).toBe(false);
      expect(holder.hasAttribute("data-dragging")).toBe(false);
      expect(holder.getAttribute("data-visibility")).toBe("visible");
    });
  });

  describe("hover/focus listener", () => {
    it("holder pointerenter/pointerleave를 typed ingress에 연결한다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);

      const { container } = render(<Scrolla />);
      const holder = container.firstElementChild as HTMLElement;

      fireEvent.pointerEnter(holder);
      expect(stub.dispatch).toHaveBeenCalledWith({
        type: "holder-pointer-enter",
      });

      fireEvent.pointerLeave(holder);
      expect(stub.dispatch).toHaveBeenCalledWith({
        type: "holder-pointer-leave",
      });
    });

    it("holder focusin/focusout을 typed ingress에 연결한다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);

      const { container } = render(<Scrolla />);
      const holder = container.firstElementChild as HTMLElement;

      fireEvent.focusIn(holder);
      expect(stub.dispatch).toHaveBeenCalledWith({ type: "holder-focus-in" });

      const focusOutEvent = new FocusEvent("focusout", {
        bubbles: true,
        cancelable: true,
      });
      fireEvent(holder, focusOutEvent);
      expect(stub.dispatch).toHaveBeenCalledWith({
        type: "holder-focus-out",
        event: focusOutEvent,
      });
    });

    it("unmount 후에는 holder listener가 더 이상 호출되지 않는다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);

      const { container, unmount } = render(<Scrolla />);
      const holder = container.firstElementChild as HTMLElement;

      unmount();
      fireEvent.pointerEnter(holder);
      fireEvent.focusIn(holder);

      expect(stub.dispatch).not.toHaveBeenCalled();
    });
  });

  describe("ScrollaHandle", () => {
    it("refresh/scrollTo/scrollBy/getState 4개만 노출한다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );
      const ref = createRef<ScrollaHandle>();

      render(<Scrolla ref={ref} />);

      expect(ref.current).not.toBeNull();
      expect(Object.keys(ref.current as object).sort()).toEqual(
        ["getState", "refresh", "scrollBy", "scrollTo"].sort(),
      );
    });

    it("각 handle method를 controller의 동명 method로 위임한다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);
      const ref = createRef<ScrollaHandle>();

      render(<Scrolla ref={ref} />);
      ref.current?.refresh();
      ref.current?.scrollTo({ x: 1 });
      ref.current?.scrollBy({ y: 2 });
      ref.current?.getState();

      expect(stub.refresh).toHaveBeenCalledTimes(1);
      expect(stub.scrollTo).toHaveBeenCalledExactlyOnceWith({ x: 1 });
      expect(stub.scrollBy).toHaveBeenCalledExactlyOnceWith({ y: 2 });
      expect(stub.getState).toHaveBeenCalledTimes(1);
    });

    it("unmount 후 저장해둔 handle의 refresh/scrollTo/scrollBy는 no-op이고 getState는 마지막 snapshot을 반환한다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);
      const ref = createRef<ScrollaHandle>();

      const { unmount } = render(<Scrolla ref={ref} />);
      // contract: unmount되면 ref.current 자체는 null이 되므로, consumer가 미리 저장해둔 handle로 검증한다.
      const handle = ref.current;
      const lastState: ScrollaState = { ...ZERO_STATE, scrolling: true };
      act(() => {
        stub.emit(lastState, { reasons: ["scroll"] });
      });
      unmount();
      expect(ref.current).toBeNull();
      stub.refresh.mockClear();
      stub.scrollTo.mockClear();
      stub.scrollBy.mockClear();
      stub.getState.mockClear();

      handle?.refresh();
      handle?.scrollTo({ x: 1 });
      handle?.scrollBy({ y: 1 });
      const state = handle?.getState();

      expect(stub.refresh).not.toHaveBeenCalled();
      expect(stub.scrollTo).not.toHaveBeenCalled();
      expect(stub.scrollBy).not.toHaveBeenCalled();
      expect(stub.getState).not.toHaveBeenCalled();
      expect(state).toEqual(lastState);
    });
  });

  describe("slotProps ref 합성", () => {
    it("mount 시 library ref를 설정한 뒤 consumer ref를 설정한다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );
      const calls: string[] = [];
      const consumerRef = vi.fn((element: HTMLDivElement | null) => {
        calls.push(element === null ? "consumer:null" : "consumer:set");
      });

      render(<Scrolla slotProps={{ content: { ref: consumerRef } }} />);

      expect(consumerRef).toHaveBeenCalledTimes(1);
      expect(calls).toEqual(["consumer:set"]);
    });

    it("unmount 시 library ref와 consumer ref(callback) 모두 정확히 한 번 null을 받는다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );
      const consumerRef = vi.fn();

      const { unmount } = render(
        <Scrolla slotProps={{ holder: { ref: consumerRef } }} />,
      );
      consumerRef.mockClear();
      unmount();

      expect(consumerRef).toHaveBeenCalledExactlyOnceWith(null);
    });

    it("unmount 시 consumer ref(object)도 정확히 한 번 null을 받는다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );
      const consumerRef = createRef<HTMLDivElement>();

      const { container, unmount } = render(
        <Scrolla slotProps={{ wrapper: { ref: consumerRef } }} />,
      );
      const { wrapper } = queryElements(container.firstElementChild as Element);
      expect(consumerRef.current).toBe(wrapper);

      unmount();

      expect(consumerRef.current).toBeNull();
    });
  });

  describe("slotProps class/style/id 합성", () => {
    it("holder는 stable class, slot className, component className을 순서대로 합성한다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container } = render(
        <Scrolla
          className="component-class"
          slotProps={{ holder: { className: "slot-class" } }}
        />,
      );

      expect((container.firstElementChild as HTMLElement).className).toBe(
        "scrolla slot-class component-class",
      );
    });

    it("holder id는 component prop이 우선하고 없으면 slotProps.holder.id를 사용한다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container: withComponentId } = render(
        <Scrolla id="component-id" slotProps={{ holder: { id: "slot-id" } }} />,
      );
      expect((withComponentId.firstElementChild as HTMLElement).id).toBe(
        "component-id",
      );

      const { container: withSlotIdOnly } = render(
        <Scrolla slotProps={{ holder: { id: "slot-id" } }} />,
      );
      expect((withSlotIdOnly.firstElementChild as HTMLElement).id).toBe(
        "slot-id",
      );
    });

    it("holder는 slot style, component style, library-owned style을 순서대로 합성하고 library-owned이 우선한다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container } = render(
        <Scrolla
          direction="rtl"
          style={{ direction: "ltr", color: "red" }}
          slotProps={{
            holder: { style: { color: "blue", background: "green" } },
          }}
        />,
      );
      const holder = container.firstElementChild as HTMLElement;

      expect(holder.style.direction).toBe("rtl");
      expect(holder.style.color).toBe("red");
      expect(holder.style.background).toBe("green");
    });

    it("wrapper/scroller/content/track/thumb는 stable class와 slot className을 합성한다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container } = render(
        <Scrolla
          slotProps={{
            wrapper: { className: "s-wrapper" },
            scroller: { className: "s-scroller" },
            content: { className: "s-content" },
            trackVertical: { className: "s-track-v" },
            thumbVertical: { className: "s-thumb-v" },
          }}
        />,
      );
      const { wrapper, scroller, content, trackVertical, thumbVertical } =
        queryElements(container.firstElementChild as Element);

      expect(wrapper.className).toBe("scrolla__wrapper s-wrapper");
      expect(scroller.className).toBe("scrolla__scroller s-scroller");
      expect(content.className).toBe("scrolla__content s-content");
      expect(trackVertical.className).toBe(
        "scrolla__track scrolla__track--vertical s-track-v",
      );
      expect(thumbVertical.className).toBe(
        "scrolla__thumb scrolla__thumb--vertical s-thumb-v",
      );
    });

    it("slotProps의 임의 속성(aria-label, data-*)은 해당 element에 그대로 전달된다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container } = render(
        <Scrolla
          slotProps={{
            wrapper: { "aria-label": "wrapper-label" },
            content: { "data-testid": "content-slot" },
          }}
        />,
      );
      const { wrapper, content } = queryElements(
        container.firstElementChild as Element,
      );

      expect(wrapper.getAttribute("aria-label")).toBe("wrapper-label");
      expect(content.getAttribute("data-testid")).toBe("content-slot");
    });
  });

  describe("holder pointerdown capture 합성", () => {
    it("consumer handler를 먼저 호출하고 defaultPrevented가 아니면 typed ingress로 전달한다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);
      const order: string[] = [];
      const consumerHandler = vi.fn(() => order.push("consumer"));
      stub.dispatch.mockImplementation(() => order.push("core"));

      const { container } = render(
        <Scrolla
          slotProps={{ holder: { onPointerDownCapture: consumerHandler } }}
        />,
      );
      const holder = container.firstElementChild as HTMLElement;

      fireEvent.pointerDown(holder);

      expect(order).toEqual(["consumer", "core"]);
      expect(stub.dispatch).toHaveBeenCalledTimes(1);
    });

    it("consumer가 preventDefault하면 typed ingress로 전달하지 않는다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);
      const consumerHandler = vi.fn((event: { preventDefault(): void }) =>
        event.preventDefault(),
      );

      const { container } = render(
        <Scrolla
          slotProps={{ holder: { onPointerDownCapture: consumerHandler } }}
        />,
      );
      const holder = container.firstElementChild as HTMLElement;

      fireEvent.pointerDown(holder);

      expect(consumerHandler).toHaveBeenCalledTimes(1);
      expect(stub.dispatch).not.toHaveBeenCalled();
    });

    it("consumer의 stopPropagation은 typed ingress 전달을 막지 않는다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);
      const consumerHandler = vi.fn((event: { stopPropagation(): void }) =>
        event.stopPropagation(),
      );

      const { container } = render(
        <Scrolla
          slotProps={{ holder: { onPointerDownCapture: consumerHandler } }}
        />,
      );
      const holder = container.firstElementChild as HTMLElement;

      fireEvent.pointerDown(holder);

      expect(stub.dispatch).toHaveBeenCalledTimes(1);
    });

    it("pointerdown을 동일한 native event identity와 함께 typed ingress로 전달한다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);

      const { container } = render(<Scrolla />);
      const holder = container.firstElementChild as HTMLElement;

      const nativeEvent = new Event("pointerdown", {
        bubbles: true,
        cancelable: true,
      }) as PointerEvent;
      fireEvent(holder, nativeEvent);

      expect(stub.dispatch).toHaveBeenCalledWith({
        type: "holder-pointer-down",
        event: nativeEvent,
      });
    });
  });

  describe("ARIA와 focus", () => {
    it("thumb는 role=scrollbar와 축에 맞는 aria-orientation을 가진다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container } = render(<Scrolla />);
      const { thumbVertical, thumbHorizontal } = queryElements(
        container.firstElementChild as Element,
      );

      expect(thumbVertical.getAttribute("role")).toBe("scrollbar");
      expect(thumbVertical.getAttribute("aria-orientation")).toBe("vertical");
      expect(thumbHorizontal.getAttribute("role")).toBe("scrollbar");
      expect(thumbHorizontal.getAttribute("aria-orientation")).toBe(
        "horizontal",
      );
    });

    it("overflow가 있는 활성 축의 thumb만 tabIndex=0이고 aria-hidden이 없다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);

      const { container } = render(<Scrolla />);
      const { thumbVertical, thumbHorizontal } = queryElements(
        container.firstElementChild as Element,
      );

      act(() => {
        stub.emit(
          { ...ZERO_STATE, overflow: { horizontal: true, vertical: false } },
          { reasons: ["geometry"] },
        );
      });

      expect(thumbHorizontal.tabIndex).toBe(0);
      expect(thumbHorizontal.hasAttribute("aria-hidden")).toBe(false);
      expect(thumbVertical.tabIndex).toBe(-1);
      expect(thumbVertical.getAttribute("aria-hidden")).toBe("true");
    });

    it("overflow가 있어도 axis prop이 비활성화한 축의 thumb는 tabIndex=-1과 aria-hidden=true다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);

      const { container } = render(<Scrolla axis="vertical" />);
      const { thumbHorizontal } = queryElements(
        container.firstElementChild as Element,
      );

      act(() => {
        stub.emit(
          { ...ZERO_STATE, overflow: { horizontal: true, vertical: true } },
          { reasons: ["geometry"] },
        );
      });

      expect(thumbHorizontal.tabIndex).toBe(-1);
      expect(thumbHorizontal.getAttribute("aria-hidden")).toBe("true");
    });

    it("aria-valuemin/valuemax/valuenow가 logical position/maxPosition과 동기화된다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);

      const { container } = render(<Scrolla />);
      const { thumbVertical, thumbHorizontal } = queryElements(
        container.firstElementChild as Element,
      );

      act(() => {
        stub.emit(
          {
            ...ZERO_STATE,
            position: { x: 30, y: 70 },
            maxPosition: { x: 100, y: 200 },
            overflow: { horizontal: true, vertical: true },
          },
          { reasons: ["scroll"] },
        );
      });

      expect(thumbVertical.getAttribute("aria-valuemin")).toBe("0");
      expect(thumbVertical.getAttribute("aria-valuemax")).toBe("200");
      expect(thumbVertical.getAttribute("aria-valuenow")).toBe("70");
      expect(thumbHorizontal.getAttribute("aria-valuemin")).toBe("0");
      expect(thumbHorizontal.getAttribute("aria-valuemax")).toBe("100");
      expect(thumbHorizontal.getAttribute("aria-valuenow")).toBe("30");
    });

    it("thumb의 aria-controls는 자동 생성된 scroller id를 참조한다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container } = render(<Scrolla />);
      const { scroller, thumbVertical, thumbHorizontal } = queryElements(
        container.firstElementChild as Element,
      );

      expect(scroller.id).not.toBe("");
      expect(thumbVertical.getAttribute("aria-controls")).toBe(scroller.id);
      expect(thumbHorizontal.getAttribute("aria-controls")).toBe(scroller.id);
    });

    it("slotProps.scroller.id가 있으면 자동 생성 대신 그 값을 scroller id와 thumb aria-controls에 사용한다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container } = render(
        <Scrolla slotProps={{ scroller: { id: "custom-scroller-id" } }} />,
      );
      const { scroller, thumbVertical, thumbHorizontal } = queryElements(
        container.firstElementChild as Element,
      );

      expect(scroller.id).toBe("custom-scroller-id");
      expect(thumbVertical.getAttribute("aria-controls")).toBe(
        "custom-scroller-id",
      );
      expect(thumbHorizontal.getAttribute("aria-controls")).toBe(
        "custom-scroller-id",
      );
    });

    it("thumb의 기본 accessible name은 축별 고정 label이다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container } = render(<Scrolla />);
      const { thumbVertical, thumbHorizontal } = queryElements(
        container.firstElementChild as Element,
      );

      expect(thumbVertical.getAttribute("aria-label")).toBe(
        "Vertical scrollbar",
      );
      expect(thumbHorizontal.getAttribute("aria-label")).toBe(
        "Horizontal scrollbar",
      );
    });

    it("consumer의 aria-label이 기본 label보다 우선한다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container } = render(
        <Scrolla
          slotProps={{ thumbVertical: { "aria-label": "세로 스크롤" } }}
        />,
      );
      const { thumbVertical } = queryElements(
        container.firstElementChild as Element,
      );

      expect(thumbVertical.getAttribute("aria-label")).toBe("세로 스크롤");
    });

    it("consumer의 aria-labelledby가 있으면 기본 aria-label을 붙이지 않는다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container } = render(
        <Scrolla
          slotProps={{
            thumbVertical: { "aria-labelledby": "external-label" },
          }}
        />,
      );
      const { thumbVertical } = queryElements(
        container.firstElementChild as Element,
      );

      expect(thumbVertical.getAttribute("aria-labelledby")).toBe(
        "external-label",
      );
      expect(thumbVertical.hasAttribute("aria-label")).toBe(false);
    });

    // focus를 갖고 있던 thumb가 비활성 전환 시 blur되는 동작은 core controller runtime이
    // 소유한다(controller.test.ts의 "thumb focus 관리" describe). 이 파일은 controller를
    // mock하므로 그 core 동작 자체를 재현하지 않고, adapter가 tabIndex/aria-hidden만
    // 정확히 파생하는지 위 두 테스트로 확인한다.

    it("scroller에는 library가 tabIndex를 강제하지 않는다", () => {
      createScrollbarControllerRuntime.mockReturnValue(
        createControllerStub().runtime,
      );

      const { container } = render(<Scrolla />);
      const { scroller } = queryElements(
        container.firstElementChild as Element,
      );

      expect(scroller.hasAttribute("tabindex")).toBe(false);
    });
  });

  describe("thumb keydown 합성", () => {
    it("thumbVertical/thumbHorizontal keydown을 각 축의 typed ingress에 연결한다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);

      const { container } = render(<Scrolla />);
      const { thumbVertical, thumbHorizontal } = queryElements(
        container.firstElementChild as Element,
      );

      const verticalEvent = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowDown",
      });
      fireEvent(thumbVertical, verticalEvent);
      expect(stub.dispatch).toHaveBeenCalledWith({
        type: "thumb-key-down",
        axis: "vertical",
        event: verticalEvent,
      });

      const horizontalEvent = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowRight",
      });
      fireEvent(thumbHorizontal, horizontalEvent);
      expect(stub.dispatch).toHaveBeenCalledWith({
        type: "thumb-key-down",
        axis: "horizontal",
        event: horizontalEvent,
      });
    });

    it("consumer handler를 먼저 호출하고 defaultPrevented가 아니면 typed ingress로 전달한다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);
      const order: string[] = [];
      const consumerHandler = vi.fn(() => order.push("consumer"));
      stub.dispatch.mockImplementation(() => order.push("core"));

      const { container } = render(
        <Scrolla
          slotProps={{ thumbVertical: { onKeyDown: consumerHandler } }}
        />,
      );
      const { thumbVertical } = queryElements(
        container.firstElementChild as Element,
      );

      fireEvent.keyDown(thumbVertical, { key: "ArrowDown" });

      expect(order).toEqual(["consumer", "core"]);
    });

    it("consumer가 preventDefault하면 typed ingress로 전달하지 않는다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);
      const consumerHandler = vi.fn((event: { preventDefault(): void }) =>
        event.preventDefault(),
      );

      const { container } = render(
        <Scrolla
          slotProps={{ thumbVertical: { onKeyDown: consumerHandler } }}
        />,
      );
      const { thumbVertical } = queryElements(
        container.firstElementChild as Element,
      );

      fireEvent.keyDown(thumbVertical, { key: "ArrowDown" });

      expect(consumerHandler).toHaveBeenCalledTimes(1);
      expect(stub.dispatch).not.toHaveBeenCalled();
    });

    it("vertical keydown을 동일한 native event identity와 함께 typed ingress로 전달한다", () => {
      const stub = createControllerStub();
      createScrollbarControllerRuntime.mockReturnValue(stub.runtime);

      const { container } = render(<Scrolla />);
      const { thumbVertical } = queryElements(
        container.firstElementChild as Element,
      );

      const nativeEvent = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowDown",
      });
      fireEvent(thumbVertical, nativeEvent);

      expect(stub.ingress.dispatch).toHaveBeenCalledWith({
        type: "thumb-key-down",
        axis: "vertical",
        event: nativeEvent,
      });
    });
  });
});
