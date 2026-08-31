import { describe, expect, test, vi } from "vitest";
import {
  createSubscriptionRegistry,
  createScrollbarStateStore,
} from "../src/core/state-store.js";
import type {
  ScrollaChangeMeta,
  ScrollaState,
} from "../src/value-types.js";

function state(positionX = 0): ScrollaState {
  return {
    position: { x: positionX, y: 0 },
    maxPosition: { x: 100, y: 0 },
    viewportSize: { width: 40, height: 50 },
    contentSize: { width: 140, height: 50 },
    overflow: { horizontal: true, vertical: false },
    scrolling: false,
    draggingAxis: null,
    visibility: "visible",
  };
}

describe("createScrollbarStateStore", () => {
  test("deeply equal state commit은 snapshot identity와 notification을 유지한다", () => {
    const store = createScrollbarStateStore(state());
    const listener = vi.fn();
    const snapshot = store.getState();

    store.subscribe(listener);

    expect(store.commit(state())).toBeUndefined();
    expect(store.getState()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
  });

  test("changed state commit은 새로운 deeply frozen snapshot을 만든다", () => {
    const store = createScrollbarStateStore(state());
    const previous = store.getState();
    const committed = store.commit(state(12));

    expect(committed).toEqual(state(12));
    expect(committed).toBe(store.getState());
    expect(committed).not.toBe(previous);
    expect(Object.isFrozen(committed)).toBe(true);
    expect(Object.isFrozen(committed?.position)).toBe(true);
    expect(Object.isFrozen(committed?.maxPosition)).toBe(true);
    expect(Object.isFrozen(committed?.viewportSize)).toBe(true);
    expect(Object.isFrozen(committed?.contentSize)).toBe(true);
    expect(Object.isFrozen(committed?.overflow)).toBe(true);
  });

  test("notify는 commit된 현재 snapshot만 받고 listener 전에 state를 갱신한다", () => {
    const store = createScrollbarStateStore(state());
    const next = store.commit(state(12));
    const listener = vi.fn((received: ScrollaState) => {
      expect(store.getState()).toBe(received);
    });

    store.subscribe(listener);

    expect(() => store.notify(state(12), ["scroll"])).toThrow(TypeError);
    store.notify(next!, ["scroll"]);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(next, { reasons: ["scroll"] });
  });

  test("duplicate subscription은 등록 순서와 독립 unsubscribe를 보존한다", () => {
    const store = createScrollbarStateStore(state());
    const calls: string[] = [];
    const listener = () => calls.push("same");
    const first = store.subscribe(listener);
    store.subscribe(() => calls.push("second"));
    const third = store.subscribe(listener);
    const next = store.commit(state(1));

    first();
    first();
    store.notify(next!, ["scroll"]);

    expect(calls).toEqual(["second", "same"]);
    third();
  });

  test("notification 중 등록은 다음 notification에서만 호출한다", () => {
    const store = createScrollbarStateStore(state());
    const calls: string[] = [];
    store.subscribe(() => {
      calls.push("first");
      store.subscribe(() => calls.push("late"));
    });
    const first = store.commit(state(1));

    store.notify(first!, ["scroll"]);
    const second = store.commit(state(2));
    store.notify(second!, ["scroll"]);

    expect(calls).toEqual(["first", "first", "late"]);
  });

  test("notification 중 commit해도 같은 회차 listener는 committed snapshot을 공유한다", () => {
    const store = createScrollbarStateStore(state());
    const first = store.commit(state(1));
    const received: ScrollaState[] = [];
    store.subscribe((snapshot) => {
      received.push(snapshot);
      store.commit(state(2));
    });
    store.subscribe((snapshot) => received.push(snapshot));

    store.notify(first!, ["scroll"]);

    expect(received[0]).toBe(first);
    expect(received[1]).toBe(first);
    expect(store.getState()).not.toBe(first);
  });

  test("현재 notification에서 아직 호출되지 않은 subscription 해제는 skip한다", () => {
    const store = createScrollbarStateStore(state());
    const calls: string[] = [];
    let unsubscribeSecond = () => {};
    store.subscribe(() => {
      calls.push("first");
      unsubscribeSecond();
    });
    unsubscribeSecond = store.subscribe(() => calls.push("second"));
    const next = store.commit(state(1));

    store.notify(next!, ["scroll"]);

    expect(calls).toEqual(["first"]);
  });

  test("첫 listener 오류를 보존하면서 남은 active listener를 호출한다", () => {
    const store = createScrollbarStateStore(state());
    const firstError = new Error("first");
    const calls: string[] = [];
    store.subscribe(() => {
      calls.push("first");
      throw firstError;
    });
    store.subscribe(() => calls.push("second"));
    const next = store.commit(state(1));

    expect(() => store.notify(next!, ["scroll"])).toThrow(firstError);
    expect(calls).toEqual(["first", "second"]);
  });

  test("reason을 canonical dedupe하고 frozen meta로 전달한다", () => {
    const store = createScrollbarStateStore(state());
    let receivedMeta: ScrollaChangeMeta | undefined;
    const next = store.commit(state(1));
    store.subscribe((_receivedState, meta) => {
      receivedMeta = meta;
    });

    store.notify(next!, [
      "visibility",
      "scroll",
      "init",
      "scroll",
      "geometry",
      "interaction",
    ]);

    expect(receivedMeta).toEqual({
      reasons: ["init", "scroll", "geometry", "interaction", "visibility"],
    });
    expect(Object.isFrozen(receivedMeta)).toBe(true);
    expect(Object.isFrozen(receivedMeta?.reasons)).toBe(true);
  });

  test("destroy는 현재 notification을 즉시 멈추고 이후 subscribe를 no-op으로 만든다", () => {
    const store = createScrollbarStateStore(state());
    const calls: string[] = [];
    store.subscribe(() => {
      calls.push("destroy");
      store.destroy();
    });
    store.subscribe(() => calls.push("after"));
    const next = store.commit(state(1));

    store.notify(next!, ["scroll"]);
    store.subscribe(() => calls.push("late"))();

    expect(calls).toEqual(["destroy"]);
  });
});

describe("createSubscriptionRegistry", () => {
  test("subscription registry unsubscribe는 listener registration을 제거한다", () => {
    const registry = createSubscriptionRegistry<() => void>();
    const listener = vi.fn();
    const unsubscribe = registry.add(listener);
    const [registration] = registry.snapshot();

    unsubscribe();
    unsubscribe();

    expect(registration?.listener).toBe(listener);
    expect(registration === undefined || registry.has(registration)).toBe(
      false,
    );
    expect(registry.snapshot()).toEqual([]);
  });

  test("subscription registry clear는 retained unsubscribe와 무관하게 모든 registration을 제거한다", () => {
    const registry = createSubscriptionRegistry<() => void>();
    const unsubscribeFirst = registry.add(() => {});
    const unsubscribeSecond = registry.add(() => {});
    const registrations = registry.snapshot();

    registry.clear();

    expect(registry.snapshot()).toEqual([]);
    expect(
      registrations.every((registration) => !registry.has(registration)),
    ).toBe(true);
    expect(() => {
      unsubscribeFirst();
      unsubscribeSecond();
    }).not.toThrow();
  });

  test("subscription registry snapshot은 이후 등록을 제외하고 해제된 항목을 식별한다", () => {
    const registry = createSubscriptionRegistry<() => void>();
    const calls: string[] = [];
    registry.add(() => calls.push("first"));
    const unsubscribeSecond = registry.add(() => calls.push("second"));
    const snapshot = registry.snapshot();
    registry.add(() => calls.push("late"));
    unsubscribeSecond();

    for (const registration of snapshot) {
      if (registry.has(registration)) {
        registration.listener();
      }
    }

    expect(calls).toEqual(["first"]);
    for (const registration of registry.snapshot()) {
      registration.listener();
    }
    expect(calls).toEqual(["first", "first", "late"]);
  });
});
