let verificationSessionActive = false;

export async function verifySsrContract({
  JSDOM,
  React,
  renderToString,
  hydrateRoot,
  Scrolla,
}) {
  if (verificationSessionActive) {
    throw new Error("verify-ssr: verification session이 이미 실행 중입니다.");
  }
  verificationSessionActive = true;

  const globalDescriptorLedger = [];
  const windowDescriptorLedger = [];
  const consoleDescriptorLedger = [];
  const cleanupFailures = [];
  const consoleErrors = [];
  let dom;
  let hydrationRoot;
  let runAllFrames;
  let primaryFailure;
  let hasPrimaryFailure = false;

  function createApp() {
    return React.createElement(
      Scrolla,
      {
        axis: "vertical",
        direction: "auto",
        autoHide: true,
        style: { height: 200, width: 300 },
      },
      React.createElement("div", { style: { height: 800 } }, "content"),
    );
  }

  function installJsdomGlobals() {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      pretendToBeVisual: true,
      url: "http://localhost/",
    });
    const { window } = dom;

    for (const key of Object.getOwnPropertyNames(window)) {
      if (!(key in globalThis)) {
        try {
          assignProperty(
            globalThis,
            key,
            window[key],
            globalDescriptorLedger,
          );
        } catch {
          // 일부 속성은 read-only 접근자라 대입이 실패할 수 있다. 무시한다.
        }
      }
    }
    // Node가 이미 read-only getter로 정의한 전역(navigator 등)이 있을 수 있으므로 항상
    // defineProperty로 덮어쓴다.
    for (const [key, value] of [
      ["window", window],
      ["document", window.document],
      ["navigator", window.navigator],
    ]) {
      mutateProperty(
        globalThis,
        key,
        () =>
          Object.defineProperty(globalThis, key, {
            configurable: true,
            value,
          }),
        globalDescriptorLedger,
      );
    }

    // jsdom은 requestAnimationFrame/cancelAnimationFrame을 구현하지 않는다
    // 실제 consumer 환경에서도 동일한 조건을 만들기 위해 결정적 mock으로 대체한다.
    let nextHandle = 1;
    const rafCallbacks = new Map();
    const requestAnimationFrame = (callback) => {
      const handle = nextHandle++;
      rafCallbacks.set(handle, callback);
      return handle;
    };
    const cancelAnimationFrame = (handle) => {
      rafCallbacks.delete(handle);
    };
    assignProperty(
      window,
      "requestAnimationFrame",
      requestAnimationFrame,
      windowDescriptorLedger,
    );
    assignProperty(
      globalThis,
      "requestAnimationFrame",
      requestAnimationFrame,
      globalDescriptorLedger,
    );
    assignProperty(
      window,
      "cancelAnimationFrame",
      cancelAnimationFrame,
      windowDescriptorLedger,
    );
    assignProperty(
      globalThis,
      "cancelAnimationFrame",
      cancelAnimationFrame,
      globalDescriptorLedger,
    );

    return {
      document: window.document,
      runAllFrames() {
        while (rafCallbacks.size > 0) {
          const next = rafCallbacks.entries().next().value;
          const [handle, callback] = next;
          rafCallbacks.delete(handle);
          callback(0);
        }
      },
    };
  }

  try {
    const installedGlobals = installJsdomGlobals();
    runAllFrames = installedGlobals.runAllFrames;
    const html = renderToString(createApp());
    installedGlobals.document.body.innerHTML = `<div id="root">${html}</div>`;
    const container = installedGlobals.document.getElementById("root");
    if (container === null) {
      throw new Error("verify-ssr: hydration root container를 찾을 수 없습니다.");
    }

    assignProperty(
      console,
      "error",
      (...args) => {
        consoleErrors.push(args.map(String).join(" "));
      },
      consoleDescriptorLedger,
    );
    hydrationRoot = hydrateRoot(container, createApp());
    runAllFrames();
    // React의 Scheduler는 MessageChannel/postMessage 기반 macrotask로 일부 작업을 이어서
    // 처리한다. 동기 실행과 microtask flush만으로는 늦게 도착하는 warning을 놓칠 수 있어
    // 실제 macrotask 한 tick을 흘려보낸 뒤에만 warning을 판정한다.
    await new Promise((resolve) => setTimeout(resolve, 50));
    runAllFrames();
  } catch (failure) {
    primaryFailure = failure;
    hasPrimaryFailure = true;
  } finally {
    try {
      if (hydrationRoot !== undefined) {
        attemptCleanup(() => hydrationRoot.unmount(), cleanupFailures);
      }
      // unmount가 microtask/timer에서 RAF 또는 warning을 예약할 수 있으므로 capture와
      // single-flight guard를 유지한 채 queue를 정해진 순서로 끝까지 비운다.
      await attemptAsyncCleanup(() => Promise.resolve(), cleanupFailures);
      await attemptAsyncCleanup(
        () => new Promise((resolve) => setTimeout(resolve, 0)),
        cleanupFailures,
      );
      if (runAllFrames !== undefined) {
        attemptCleanup(runAllFrames, cleanupFailures);
      }
      await attemptAsyncCleanup(() => Promise.resolve(), cleanupFailures);

      if (consoleErrors.length > 0) {
        const warningFailure = new Error(
          `verify-ssr: hydration 중 console.error가 발생했습니다:\n${consoleErrors.join("\n")}`,
        );
        if (!hasPrimaryFailure) {
          primaryFailure = warningFailure;
          hasPrimaryFailure = true;
        } else {
          cleanupFailures.push(warningFailure);
        }
      }

      restoreDescriptors(windowDescriptorLedger, cleanupFailures);
      if (dom !== undefined) {
        attemptCleanup(() => dom.window.close(), cleanupFailures);
      }
      restoreDescriptors(globalDescriptorLedger, cleanupFailures);
      restoreDescriptors(consoleDescriptorLedger, cleanupFailures);
    } finally {
      verificationSessionActive = false;
    }
  }

  if (hasPrimaryFailure) {
    if (cleanupFailures.length > 0) {
      throw combinePrimaryAndCleanupFailures(
        primaryFailure,
        cleanupFailures,
      );
    }
    throw primaryFailure;
  }
  if (cleanupFailures.length === 1) {
    throw cleanupFailures[0];
  }
  if (cleanupFailures.length > 1) {
    throw new AggregateError(
      cleanupFailures,
      "verify-ssr: cleanup 중 여러 오류가 발생했습니다.",
    );
  }

  console.log(
    "verify-ssr: packed tarball 기준 renderToString + jsdom hydrateRoot 성공, console.error 없음.",
  );
}

function assignProperty(target, key, value, ledger) {
  mutateProperty(
    target,
    key,
    () => {
      if (!Reflect.set(target, key, value)) {
        throw new TypeError(`verify-ssr: ${String(key)} property를 설정할 수 없습니다.`);
      }
    },
    ledger,
  );
}

function mutateProperty(target, key, mutation, ledger) {
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  mutation();
  ledger.push({ descriptor, key, target });
}

function attemptCleanup(cleanup, failures) {
  try {
    cleanup();
  } catch (failure) {
    failures.push(failure);
  }
}

async function attemptAsyncCleanup(cleanup, failures) {
  try {
    await cleanup();
  } catch (failure) {
    failures.push(failure);
  }
}

function restoreDescriptors(ledger, failures) {
  for (let index = ledger.length - 1; index >= 0; index -= 1) {
    const { descriptor, key, target } = ledger[index];
    attemptCleanup(() => {
      if (descriptor === undefined) {
        if (!Reflect.deleteProperty(target, key)) {
          throw new TypeError(
            `verify-ssr: ${String(key)} property를 삭제할 수 없습니다.`,
          );
        }
        return;
      }
      Object.defineProperty(target, key, descriptor);
    }, failures);
  }
}

function combinePrimaryAndCleanupFailures(primaryFailure, cleanupFailures) {
  const fallback = () =>
    new AggregateError(
      [primaryFailure, ...cleanupFailures],
      "verify-ssr: primary failure와 cleanup 오류가 함께 발생했습니다.",
      { cause: primaryFailure },
    );

  if (
    primaryFailure === null ||
    (typeof primaryFailure !== "object" &&
      typeof primaryFailure !== "function")
  ) {
    return fallback();
  }

  try {
    const causeDescriptor = Object.getOwnPropertyDescriptor(
      primaryFailure,
      "cause",
    );
    if (causeDescriptor?.configurable === false) {
      return fallback();
    }
    if (causeDescriptor === undefined && !Object.isExtensible(primaryFailure)) {
      return fallback();
    }

    const hasExistingCause = "cause" in primaryFailure;
    const existingCause = hasExistingCause
      ? Reflect.get(primaryFailure, "cause")
      : undefined;
    const combinedCause = new AggregateError(
      hasExistingCause
        ? [existingCause, ...cleanupFailures]
        : cleanupFailures,
      "verify-ssr: primary failure 뒤 cleanup 오류가 발생했습니다.",
      hasExistingCause ? { cause: existingCause } : undefined,
    );
    Object.defineProperty(primaryFailure, "cause", {
      configurable: true,
      value: combinedCause,
      writable: true,
    });
    return primaryFailure;
  } catch {
    return fallback();
  }
}
