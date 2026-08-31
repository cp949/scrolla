import type * as React from "react";
import { version as reactRuntimeVersion } from "react";

// React 19부터만 callback ref의 return value(cleanup function)를 지원한다. 18에서 함수를
// 반환하면 React 18에서 "Unexpected return value from a callback ref" 경고가 난다.
// React 19에서는 반드시 반환해야 한다 —
// 그래야 consumer의 자체 cleanup-반환 ref callback을 null 재호출이 아니라 그 cleanup으로
// 정확히 detach한다.
const REF_CLEANUP_SUPPORTED = Number.parseInt(reactRuntimeVersion, 10) >= 19;

/**
 * library ref를 먼저 attach하고 consumer ref를 그 다음 attach한다. React 19의 cleanup을
 * 반환하는 callback ref와 React 18의 null 재호출 방식을 모두 각각 정확히 한 번만 처리한다.
 */
export function composeRefs<T>(
  libraryRef: React.Ref<T> | undefined,
  consumerRef: React.Ref<T> | undefined,
): React.RefCallback<T> {
  return (value) => {
    const detachLibrary = attachRef(libraryRef, value);
    const detachConsumer = attachRef(consumerRef, value);
    if (!REF_CLEANUP_SUPPORTED) {
      return undefined;
    }
    return () => {
      detachLibrary();
      detachConsumer();
    };
  };
}

function attachRef<T>(
  ref: React.Ref<T> | undefined,
  value: T | null,
): () => void {
  if (typeof ref === "function") {
    const cleanup = ref(value);
    return typeof cleanup === "function" ? cleanup : () => ref(null);
  }
  if (ref !== null && ref !== undefined) {
    // React 18 타입의 `RefObject<T>.current`는 readonly다(19는 mutable). 런타임에는 항상
    // 쓰기 가능한 일반 property이므로 두 버전 모두에서 type-check가 통과하도록 cast한다.
    const mutableRef = ref as { current: T | null };
    mutableRef.current = value;
    return () => {
      mutableRef.current = null;
    };
  }
  return () => {};
}

/**
 * consumer handler를 먼저 호출하고 `event.defaultPrevented`가 아닐 때만 library handler를
 * 호출한다. `stopPropagation()`은 `defaultPrevented`를 바꾸지 않으므로 library handler
 * 호출을 취소하지 않는다.
 */
export function composeEventHandlers<
  E extends { readonly defaultPrevented: boolean },
>(
  consumerHandler: ((event: E) => void) | undefined,
  libraryHandler: ((event: E) => void) | undefined,
): (event: E) => void {
  return (event) => {
    consumerHandler?.(event);
    if (!event.defaultPrevented) {
      libraryHandler?.(event);
    }
  };
}
