import type {
  ScrollaChangeMeta,
  ScrollaChangeReason,
  ScrollaState,
  ScrollaStateListener,
} from "../value-types.js";

export interface ScrollbarStateStore {
  getState(): ScrollaState;
  subscribe(listener: ScrollaStateListener): () => void;
  commit(next: ScrollaState): ScrollaState | undefined;
  notify(state: ScrollaState, reasons: readonly ScrollaChangeReason[]): void;
  destroy(): void;
}

export interface SubscriptionRegistration<Listener> {
  readonly key: object;
  readonly listener: Listener;
}

export interface SubscriptionRegistry<Listener> {
  add(listener: Listener): () => void;
  snapshot(): readonly SubscriptionRegistration<Listener>[];
  has(registration: SubscriptionRegistration<Listener>): boolean;
  clear(): void;
}

const canonicalReasons: readonly ScrollaChangeReason[] = [
  "init",
  "scroll",
  "geometry",
  "interaction",
  "visibility",
];

function createUnsubscribe<Listener>(
  registrations: Map<object, Listener>,
  key: object,
): () => void {
  return () => {
    registrations.delete(key);
  };
}

export function createSubscriptionRegistry<
  Listener,
>(): SubscriptionRegistry<Listener> {
  const registrations = new Map<object, Listener>();

  return {
    add(listener) {
      const key = {};
      registrations.set(key, listener);
      return createUnsubscribe(registrations, key);
    },
    snapshot() {
      return Array.from(registrations, ([key, listener]) => ({
        key,
        listener,
      }));
    },
    has(registration) {
      return (
        registrations.has(registration.key) &&
        registrations.get(registration.key) === registration.listener
      );
    },
    clear() {
      registrations.clear();
    },
  };
}

function freezeState(state: ScrollaState): ScrollaState {
  return Object.freeze({
    position: Object.freeze({ x: state.position.x, y: state.position.y }),
    maxPosition: Object.freeze({
      x: state.maxPosition.x,
      y: state.maxPosition.y,
    }),
    viewportSize: Object.freeze({
      width: state.viewportSize.width,
      height: state.viewportSize.height,
    }),
    contentSize: Object.freeze({
      width: state.contentSize.width,
      height: state.contentSize.height,
    }),
    overflow: Object.freeze({
      horizontal: state.overflow.horizontal,
      vertical: state.overflow.vertical,
    }),
    scrolling: state.scrolling,
    draggingAxis: state.draggingAxis,
    visibility: state.visibility,
  });
}

function equalState(left: ScrollaState, right: ScrollaState): boolean {
  return (
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.maxPosition.x === right.maxPosition.x &&
    left.maxPosition.y === right.maxPosition.y &&
    left.viewportSize.width === right.viewportSize.width &&
    left.viewportSize.height === right.viewportSize.height &&
    left.contentSize.width === right.contentSize.width &&
    left.contentSize.height === right.contentSize.height &&
    left.overflow.horizontal === right.overflow.horizontal &&
    left.overflow.vertical === right.overflow.vertical &&
    left.scrolling === right.scrolling &&
    left.draggingAxis === right.draggingAxis &&
    left.visibility === right.visibility
  );
}

function createMeta(
  reasons: readonly ScrollaChangeReason[],
): ScrollaChangeMeta {
  return Object.freeze({
    reasons: Object.freeze(
      canonicalReasons.filter((reason) => reasons.includes(reason)),
    ),
  });
}

export function createScrollbarStateStore(
  initial: ScrollaState,
): ScrollbarStateStore {
  let current = freezeState(initial);
  let destroyed = false;
  const subscriptions = createSubscriptionRegistry<ScrollaStateListener>();

  return {
    getState() {
      return current;
    },
    subscribe(listener) {
      if (destroyed) {
        return () => {};
      }

      return subscriptions.add(listener);
    },
    commit(next) {
      if (destroyed || equalState(current, next)) {
        return undefined;
      }
      current = freezeState(next);
      return current;
    },
    notify(state, reasons) {
      if (destroyed) {
        return;
      }
      if (state !== current) {
        throw new TypeError(
          "현재 committed state만 notification할 수 있습니다.",
        );
      }

      const meta = createMeta(reasons);
      const snapshot = subscriptions.snapshot();
      let hasError = false;
      let firstError: unknown;

      for (const subscription of snapshot) {
        if (destroyed) {
          break;
        }
        if (!subscriptions.has(subscription)) {
          continue;
        }
        try {
          subscription.listener(state, meta);
        } catch (error) {
          if (!hasError) {
            hasError = true;
            firstError = error;
          }
        }
      }

      if (hasError) {
        throw firstError;
      }
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;
      subscriptions.clear();
    },
  };
}
