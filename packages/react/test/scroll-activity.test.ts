import { describe, expect, test, vi } from "vitest";
import { createScrollActivity } from "../src/core/scroll-activity.js";

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

  captureOnlyCallback(): () => void {
    const timer = this.timers.values().next().value;
    if (timer === undefined) {
      throw new Error("captured timer가 없습니다.");
    }
    return timer.callback;
  }

  get pendingCount(): number {
    return this.timers.size;
  }
}

function createHarness(initialDelay = 100) {
  const clock = new FakeClock();
  const invalidate = vi.fn();
  let delay = initialDelay;
  const activity = createScrollActivity({
    window: clock.window,
    getDelay: () => delay,
    invalidate,
  });

  return {
    activity,
    clock,
    invalidate,
    setDelay: (next: number) => {
      delay = next;
    },
  };
}

describe("createScrollActivity", () => {
  test("첫 activity만 true invalidation을 만들고 commit 뒤 마지막 activity부터 idle을 센다", () => {
    const { activity, clock, invalidate } = createHarness();

    activity.activate();
    clock.advance(40);
    activity.activate();

    expect(activity.getScrolling()).toBe(true);
    expect(invalidate).toHaveBeenCalledOnce();
    expect(clock.pendingCount).toBe(0);

    activity.didCommit();
    clock.advance(99);
    clock.runDue();
    expect(activity.getScrolling()).toBe(true);

    clock.advance(1);
    clock.runDue();
    expect(activity.getScrolling()).toBe(false);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  test("delay 0도 true commit 전에는 false가 되지 않고 commit 뒤 timer task에서 전환한다", () => {
    const { activity, clock, invalidate } = createHarness(0);

    activity.activate();
    clock.runDue();

    expect(activity.getScrolling()).toBe(true);
    expect(clock.pendingCount).toBe(0);

    activity.didCommit();
    expect(activity.getScrolling()).toBe(true);
    expect(clock.pendingCount).toBe(1);

    clock.runDue();
    expect(activity.getScrolling()).toBe(false);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  test("delay 변경은 option 변경 시각이 아니라 마지막 activity 시각에서 rebase한다", () => {
    const { activity, clock, invalidate, setDelay } = createHarness(100);
    activity.activate();
    activity.didCommit();
    clock.advance(40);

    setDelay(50);
    activity.updateDelay();
    clock.advance(9);
    clock.runDue();
    expect(activity.getScrolling()).toBe(true);

    clock.advance(1);
    clock.runDue();
    expect(activity.getScrolling()).toBe(false);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  test("이미 만료된 delay 단축도 true commit 전 false transition을 만들지 않는다", () => {
    const { activity, clock, invalidate, setDelay } = createHarness(100);
    activity.activate();
    clock.advance(100);

    setDelay(10);
    activity.updateDelay();
    clock.runDue();
    expect(activity.getScrolling()).toBe(true);
    expect(clock.pendingCount).toBe(0);

    activity.didCommit();
    expect(activity.getScrolling()).toBe(true);
    clock.runDue();
    expect(activity.getScrolling()).toBe(false);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  test("새 activity는 timer 하나만 다시 잡고 취소된 stale callback을 거부한다", () => {
    const { activity, clock, invalidate } = createHarness();
    activity.activate();
    activity.didCommit();
    const stale = clock.captureOnlyCallback();
    clock.advance(20);

    activity.activate();
    expect(clock.pendingCount).toBe(1);
    stale();

    expect(activity.getScrolling()).toBe(true);
    expect(invalidate).toHaveBeenCalledOnce();
    expect(clock.pendingCount).toBe(1);

    clock.advance(100);
    clock.runDue();
    expect(activity.getScrolling()).toBe(false);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  test("destroy는 timer와 captured callback을 무효화하고 이후 method를 no-op으로 만든다", () => {
    const { activity, clock, invalidate, setDelay } = createHarness();
    activity.activate();
    activity.didCommit();
    const stale = clock.captureOnlyCallback();

    activity.destroy();
    expect(clock.pendingCount).toBe(0);
    stale();
    setDelay(0);
    activity.updateDelay();
    activity.activate();
    activity.didCommit();

    expect(activity.getScrolling()).toBe(true);
    expect(clock.pendingCount).toBe(0);
    expect(invalidate).toHaveBeenCalledOnce();
  });
});
