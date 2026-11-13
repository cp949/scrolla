import { describe, expect, test, vi } from "vitest";
import { createAutoHide } from "../src/core/auto-hide.js";

class FakeClock {
  private nextHandle = 1;
  private readonly timers = new Map<
    number,
    { readonly callback: () => void; readonly due: number }
  >();
  now = 0;

  readonly window = {
    Date: { now: () => this.now },
    setTimeout: (callback: () => void, delay = 0) => {
      const handle = this.nextHandle;
      this.nextHandle += 1;
      this.timers.set(handle, {
        callback,
        due: this.now + Math.max(delay, 0),
      });
      return handle;
    },
    clearTimeout: (handle: number) => {
      this.timers.delete(handle);
    },
  } as unknown as Window;

  advance(milliseconds: number): void {
    this.now += milliseconds;
  }

  runDue(): void {
    const dueTimers = [...this.timers.entries()]
      .filter(([, timer]) => timer.due <= this.now)
      .sort((left, right) => left[1].due - right[1].due);
    for (const [handle, timer] of dueTimers) {
      if (!this.timers.delete(handle)) {
        continue;
      }
      timer.callback();
    }
  }

  get pendingCount(): number {
    return this.timers.size;
  }
}

class FakeHolder {
  contains(node: Node | null): boolean {
    return node !== null && this.members.has(node);
  }

  readonly members = new Set<Node>();
}

function focusEvent(relatedTarget: Node | null): FocusEvent {
  return { relatedTarget } as unknown as FocusEvent;
}

function createHarness(initialDelay = 100, initialAutoHide = true) {
  const clock = new FakeClock();
  const holder = new FakeHolder();
  const invalidate = vi.fn();
  let delay = initialDelay;
  let autoHide = initialAutoHide;
  const autoHideModule = createAutoHide({
    window: clock.window,
    holder,
    getAutoHide: () => autoHide,
    getDelay: () => delay,
    invalidate,
  });

  return {
    autoHide: autoHideModule,
    clock,
    holder,
    invalidate,
    setDelay: (next: number) => {
      delay = next;
    },
    setAutoHideEnabled: (next: boolean) => {
      autoHide = next;
    },
  };
}

describe("createAutoHide", () => {
  test("아무 신호 없이도 최초 pull sync 뒤 idle delay가 지나면 hidden으로 전환한다", () => {
    const { autoHide, clock, invalidate } = createHarness();

    autoHide.sync({ scrolling: false, dragging: false });
    expect(autoHide.getVisible()).toBe(true);

    clock.advance(99);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(true);

    clock.advance(1);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(false);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("hover enter는 hidden 상태를 즉시 visible로 전환하고 invalidate한다", () => {
    const { autoHide, clock, invalidate } = createHarness();
    autoHide.sync({ scrolling: false, dragging: false });
    clock.advance(100);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(false);
    invalidate.mockClear();

    autoHide.handleHoverEnter();

    expect(autoHide.getVisible()).toBe(true);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("hover leave 뒤 idle delay가 지나야 hidden으로 전환한다", () => {
    const { autoHide, clock, invalidate } = createHarness();
    autoHide.handleHoverEnter();
    invalidate.mockClear();

    autoHide.handleHoverLeave();
    expect(autoHide.getVisible()).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();

    clock.advance(99);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(true);

    clock.advance(1);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(false);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("focus in은 즉시 visible로 전환하고 focus out은 holder 내부로 이동하면 무시한다", () => {
    const { autoHide, clock, holder, invalidate } = createHarness();
    autoHide.sync({ scrolling: false, dragging: false });
    clock.advance(100);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(false);
    invalidate.mockClear();

    autoHide.handleFocusIn();
    expect(autoHide.getVisible()).toBe(true);
    expect(invalidate).toHaveBeenCalledOnce();

    const stillInsideTarget = {} as Node;
    holder.members.add(stillInsideTarget);
    autoHide.handleFocusOut(focusEvent(stillInsideTarget));

    clock.advance(1000);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(true);
  });

  test("focus out이 holder 바깥으로 이동하면 idle delay 뒤 hidden으로 전환한다", () => {
    const { autoHide, clock } = createHarness();
    autoHide.handleFocusIn();

    const outsideTarget = {} as Node;
    autoHide.handleFocusOut(focusEvent(outsideTarget));
    expect(autoHide.getVisible()).toBe(true);

    clock.advance(100);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(false);
  });

  test("scrolling과 dragging은 pull sync로 visible을 유지하고 멈추면 idle delay 뒤 hidden으로 전환한다", () => {
    const { autoHide, clock, invalidate } = createHarness();
    autoHide.sync({ scrolling: false, dragging: false });
    clock.advance(100);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(false);
    invalidate.mockClear();

    autoHide.sync({ scrolling: true, dragging: false });
    expect(autoHide.getVisible()).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();

    autoHide.sync({ scrolling: false, dragging: true });
    expect(autoHide.getVisible()).toBe(true);

    autoHide.sync({ scrolling: false, dragging: false });
    expect(autoHide.getVisible()).toBe(true);

    clock.advance(100);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(false);
  });

  test("autoHide가 false면 idle delay가 지나도 항상 visible이고 timer를 가동하지 않는다", () => {
    const { autoHide, clock, setAutoHideEnabled } = createHarness(100, false);

    autoHide.sync({ scrolling: false, dragging: false });
    clock.advance(10_000);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(true);
    expect(clock.pendingCount).toBe(0);

    autoHide.handleHoverEnter();
    autoHide.handleHoverLeave();
    clock.advance(10_000);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(true);
    expect(clock.pendingCount).toBe(0);

    setAutoHideEnabled(true);
    autoHide.sync({ scrolling: false, dragging: false });
    clock.advance(100);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(false);
  });

  test("delay 변경은 option 변경 시각이 아니라 마지막 activity 시각에서 rebase한다", () => {
    const { autoHide, clock, invalidate, setDelay } = createHarness(100);
    autoHide.handleHoverEnter();
    autoHide.handleHoverLeave();
    clock.advance(40);

    setDelay(50);
    autoHide.updateDelay();
    clock.advance(9);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(true);

    clock.advance(1);
    clock.runDue();
    expect(autoHide.getVisible()).toBe(false);
    expect(invalidate).toHaveBeenCalledOnce();
  });

  test("destroy는 timer를 무효화하고 이후 method를 no-op으로 만든다", () => {
    const { autoHide, clock, invalidate } = createHarness();
    autoHide.handleHoverEnter();
    autoHide.handleHoverLeave();

    autoHide.destroy();
    expect(clock.pendingCount).toBe(0);

    autoHide.handleHoverEnter();
    clock.advance(1000);
    clock.runDue();

    expect(invalidate).not.toHaveBeenCalled();
  });
});
