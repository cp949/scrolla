export interface ScrollActivity {
  activate(): void;
  didCommit(): void;
  updateDelay(): void;
  getScrolling(): boolean;
  destroy(): void;
}

interface ScrollActivityWindow extends Window {
  readonly Date: DateConstructor;
}

export function createScrollActivity(input: {
  readonly window: Window;
  readonly getDelay: () => number;
  readonly invalidate: () => void;
}): ScrollActivity {
  let destroyed = false;
  let scrolling = false;
  let committedScrolling = false;
  let lastActivity: number | undefined;
  let timerHandle: number | undefined;
  let timerGeneration = 0;
  const activityWindow = input.window as ScrollActivityWindow;

  function now(): number {
    return activityWindow.Date.now();
  }

  function cancelTimer(): void {
    timerGeneration += 1;
    if (timerHandle === undefined) {
      return;
    }
    activityWindow.clearTimeout(timerHandle);
    timerHandle = undefined;
  }

  function scheduleTimer(): void {
    cancelTimer();
    if (
      destroyed ||
      !scrolling ||
      !committedScrolling ||
      lastActivity === undefined
    ) {
      return;
    }

    const generation = timerGeneration;
    const elapsed = Math.max(now() - lastActivity, 0);
    const remaining = Math.max(input.getDelay() - elapsed, 0);
    timerHandle = activityWindow.setTimeout(() => {
      if (destroyed || generation !== timerGeneration) {
        return;
      }
      timerHandle = undefined;

      const latestElapsed = Math.max(now() - lastActivity!, 0);
      if (latestElapsed < input.getDelay()) {
        scheduleTimer();
        return;
      }
      if (!scrolling || !committedScrolling) {
        return;
      }

      scrolling = false;
      input.invalidate();
    }, remaining);
  }

  return {
    activate() {
      if (destroyed) {
        return;
      }
      lastActivity = now();
      if (scrolling) {
        scheduleTimer();
        return;
      }

      scrolling = true;
      input.invalidate();
      scheduleTimer();
    },
    didCommit() {
      if (destroyed) {
        return;
      }
      if (!scrolling) {
        committedScrolling = false;
        cancelTimer();
        return;
      }

      committedScrolling = true;
      scheduleTimer();
    },
    updateDelay() {
      if (destroyed) {
        return;
      }
      scheduleTimer();
    },
    getScrolling() {
      return scrolling;
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      cancelTimer();
    },
  };
}
