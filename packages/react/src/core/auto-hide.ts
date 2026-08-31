export interface AutoHideSyncInput {
  readonly scrolling: boolean;
  readonly dragging: boolean;
}

export interface AutoHideHolder {
  contains(node: Node | null): boolean;
}

export interface AutoHide {
  handleHoverEnter(): void;
  handleHoverLeave(): void;
  handleFocusIn(): void;
  handleFocusOut(event: FocusEvent): void;
  sync(input: AutoHideSyncInput): void;
  updateDelay(): void;
  getVisible(): boolean;
  destroy(): void;
}

interface AutoHideWindow extends Window {
  readonly Date: DateConstructor;
}

export function createAutoHide(input: {
  readonly window: Window;
  readonly holder: AutoHideHolder;
  readonly getAutoHide: () => boolean;
  readonly getDelay: () => number;
  readonly invalidate: () => void;
}): AutoHide {
  let destroyed = false;
  let hover = false;
  let focus = false;
  let scrolling = false;
  let dragging = false;
  let visible = true;
  let lastActiveAt: number | undefined;
  let timerHandle: number | undefined;
  let timerGeneration = 0;
  const autoHideWindow = input.window as AutoHideWindow;

  function now(): number {
    return autoHideWindow.Date.now();
  }

  function anyActive(): boolean {
    return hover || focus || scrolling || dragging;
  }

  function cancelTimer(): void {
    timerGeneration += 1;
    if (timerHandle === undefined) {
      return;
    }
    autoHideWindow.clearTimeout(timerHandle);
    timerHandle = undefined;
  }

  function scheduleTimer(): void {
    cancelTimer();
    if (destroyed || !input.getAutoHide() || anyActive()) {
      return;
    }
    if (lastActiveAt === undefined) {
      lastActiveAt = now();
    }

    const generation = timerGeneration;
    const elapsed = Math.max(now() - lastActiveAt, 0);
    const remaining = Math.max(input.getDelay() - elapsed, 0);
    timerHandle = autoHideWindow.setTimeout(() => {
      if (destroyed || generation !== timerGeneration) {
        return;
      }
      timerHandle = undefined;
      if (!input.getAutoHide() || anyActive()) {
        return;
      }

      const latestElapsed = Math.max(now() - lastActiveAt!, 0);
      if (latestElapsed < input.getDelay()) {
        scheduleTimer();
        return;
      }
      if (visible) {
        visible = false;
        input.invalidate();
      }
    }, remaining);
  }

  // 신호 조합(hover/focus/scrolling/dragging)이 바뀔 때마다 idle timer를 다시 판단한다.
  // hidden -> visible 전환이 이번 호출로 새로 일어났는지만 반환하고, 실제 invalidate 여부는
  // 호출부가 결정한다: push handler(hover/focus)는 DOM 이벤트라서 즉시 invalidate가 필요하지만,
  // sync()는 이미 진행 중인 derive() pass 안에서 호출되므로 결과를 그 자리에서 읽어가면 되고
  // 여기서 추가로 invalidate하면 같은 프레임 직후에 불필요한 RAF가 하나 더 잡힌다.
  function transition(update: () => void): boolean {
    if (destroyed) {
      return false;
    }
    const wasActive = anyActive();
    update();
    if (anyActive()) {
      const wasHidden = !visible;
      cancelTimer();
      visible = true;
      return wasHidden;
    }

    if (wasActive) {
      lastActiveAt = now();
    }
    if (!input.getAutoHide()) {
      cancelTimer();
      visible = true;
      return false;
    }
    scheduleTimer();
    return false;
  }

  return {
    handleHoverEnter() {
      if (transition(() => (hover = true))) {
        input.invalidate();
      }
    },
    handleHoverLeave() {
      transition(() => (hover = false));
    },
    handleFocusIn() {
      if (transition(() => (focus = true))) {
        input.invalidate();
      }
    },
    handleFocusOut(event) {
      const relatedTarget = event.relatedTarget as Node | null;
      if (relatedTarget !== null && input.holder.contains(relatedTarget)) {
        return;
      }
      transition(() => (focus = false));
    },
    sync(next) {
      transition(() => {
        scrolling = next.scrolling;
        dragging = next.dragging;
      });
    },
    updateDelay() {
      if (destroyed) {
        return;
      }
      scheduleTimer();
    },
    getVisible() {
      return !input.getAutoHide() || visible;
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
