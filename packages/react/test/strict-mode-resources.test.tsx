// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { Scrolla } from "../src/Scrolla.js";

type ListenerSpy = MockInstance<
  (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => void
>;

/**
 * controller.test.ts의 `installFrameDriver`와 같은 패턴이다. jsdom은 기본적으로
 * `requestAnimationFrame`/`cancelAnimationFrame`을 구현하지 않으므로 결정적인 mock으로 대체한다.
 */
function installFrameDriver(targetWindow: Window) {
  let nextHandle = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback) => {
    const handle = nextHandle;
    nextHandle += 1;
    callbacks.set(handle, callback);
    return handle;
  });
  const cancel = vi.fn((handle: number) => {
    callbacks.delete(handle);
  });

  Object.defineProperties(targetWindow, {
    requestAnimationFrame: { configurable: true, value: request },
    cancelAnimationFrame: { configurable: true, value: cancel },
  });

  return {
    request,
    cancel,
    callbacks,
    runAll() {
      while (callbacks.size > 0) {
        const next = callbacks.entries().next().value;
        if (next === undefined) {
          break;
        }
        const [handle, callback] = next;
        callbacks.delete(handle);
        callback(0);
      }
    },
  };
}

/** adapter가 holder에 직접 붙이는 native listener 4종과 core가 scroller에 붙이는 "scroll"이다. */
const HOLDER_LISTENER_TYPES = [
  "pointerenter",
  "pointerleave",
  "focusin",
  "focusout",
] as const;
const SCROLLER_LISTENER_TYPES = ["scroll"] as const;

/**
 * `EventTarget.prototype`을 통째로 spy하면 React 자신의 root-level 이벤트 위임(document 등
 * 다른 target에 대한 등록)까지 섞여 들어온다. `mock.contexts`(호출 시점의 `this`)로 우리가
 * 실제로 관리하는 target(holder/scroller)에서 일어난 호출만 걸러 대칭을 확인한다.
 */
function countCallsForTarget(
  spy: ListenerSpy,
  target: EventTarget,
  types: readonly string[],
): Record<string, number> {
  const result: Record<string, number> = Object.fromEntries(
    types.map((type) => [type, 0]),
  );
  spy.mock.calls.forEach((call, index) => {
    const eventType = call[0];
    if (spy.mock.contexts[index] === target && types.includes(eventType)) {
      result[eventType] = (result[eventType] ?? 0) + 1;
    }
  });
  return result;
}

afterEach(() => {
  cleanup();
});

describe("StrictMode 반복 mount/cleanup의 실제 자원 정리", () => {
  it("mock 없는 real core로 렌더링해도 native listener가 leak 없이 add/remove 대칭을 이루고 RAF가 남지 않는다", () => {
    const frameDriver = installFrameDriver(window);
    const addSpy = vi.spyOn(
      EventTarget.prototype,
      "addEventListener",
    ) as ListenerSpy;
    const removeSpy = vi.spyOn(
      EventTarget.prototype,
      "removeEventListener",
    ) as ListenerSpy;

    const { container, unmount } = render(
      <StrictMode>
        <Scrolla />
      </StrictMode>,
    );
    // StrictMode(dev)는 render/commit은 한 번만 하고 effect만 mount -> cleanup -> mount로 두 번
    // 실행하므로, holder/scroller DOM node 자체는 두 instance가 공유하는 같은 참조다.
    const holder = container.firstElementChild as HTMLElement;
    const scroller = holder.querySelector(
      ".scrolla__scroller",
    ) as HTMLElement;

    // 첫 instance의 RAF는 그 synthetic cleanup에서 이미 취소되므로, 여기서 남은 건 두 번째
    // instance뿐이다.
    act(() => {
      frameDriver.runAll();
    });

    unmount();
    act(() => {
      frameDriver.runAll();
    });

    const adds = {
      ...countCallsForTarget(addSpy, holder, HOLDER_LISTENER_TYPES),
      ...countCallsForTarget(addSpy, scroller, SCROLLER_LISTENER_TYPES),
    };
    const removes = {
      ...countCallsForTarget(removeSpy, holder, HOLDER_LISTENER_TYPES),
      ...countCallsForTarget(removeSpy, scroller, SCROLLER_LISTENER_TYPES),
    };

    expect(removes).toEqual(adds);
    for (const type of [...HOLDER_LISTENER_TYPES, ...SCROLLER_LISTENER_TYPES]) {
      expect(adds[type], `${type} add count`).toBeGreaterThan(0);
    }
    expect(frameDriver.callbacks.size).toBe(0);

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
