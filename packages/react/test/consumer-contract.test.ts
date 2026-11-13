import { resolve } from "node:path";
import { env as processEnv } from "node:process";
import { describe, expect, test, vi } from "vitest";

type SpawnOptions = {
  cwd: string;
  env: Record<string, string | undefined>;
  stdio: "inherit";
};

const { spawnSync } = vi.hoisted(() => ({
  spawnSync: vi.fn<
    (
      command: string,
      args: string[],
      options: SpawnOptions,
    ) => {
      signal: null;
      status: number;
    }
  >(),
}));

vi.mock("node:child_process", () => ({ spawnSync }));

import {
  createConsumerContractVerification,
  prepareBrowserConsumers,
} from "./consumer-contract/orchestration.mjs";
import { verifySsrContract } from "./consumer-contract/verify-ssr.mjs";

type ConsumerStep = {
  consumerId: string;
  phase: string;
  command: string;
  args: string[];
  cwd: string;
};

const packageDirectory = resolve(import.meta.dirname, "..");
const fixturesDirectory = resolve(packageDirectory, "test/consumer-fixtures");

function createRecordingVerification() {
  const steps: ConsumerStep[] = [];
  const verification = createConsumerContractVerification({
    packageDirectory,
    execute(step: ConsumerStep) {
      steps.push(step);
    },
  });

  return { steps, verification };
}

describe("consumer contract orchestration", () => {
  test("audit profile이 pack 뒤 각 consumer의 install과 declared phase를 fixture cwd에서 순서대로 실행한다", () => {
    // Protects against a missing/reordered audit phase or a package-root cwd.
    const { steps, verification } = createRecordingVerification();

    verification.auditConsumerContracts();

    expect(steps.map(({ consumerId, phase }) => [consumerId, phase])).toEqual([
      ["package", "pack"],
      ["react18", "install"],
      ["react18", "check-types"],
      ["react18", "build"],
      ["react18", "verify-ssr"],
      ["react19", "install"],
      ["react19", "check-types"],
      ["react19", "build"],
      ["react19", "verify-ssr"],
      ["nextjs-rsc", "install"],
      ["nextjs-rsc", "build"],
    ]);
    expect(steps).toEqual([
      {
        consumerId: "package",
        phase: "pack",
        command: "pnpm",
        args: [
          "pack",
          "--pack-destination",
          resolve(fixturesDirectory, ".tarball"),
        ],
        cwd: packageDirectory,
      },
      {
        consumerId: "react18",
        phase: "install",
        command: "pnpm",
        args: ["install"],
        cwd: resolve(fixturesDirectory, "react18-app"),
      },
      {
        consumerId: "react18",
        phase: "check-types",
        command: "pnpm",
        args: ["run", "check-types"],
        cwd: resolve(fixturesDirectory, "react18-app"),
      },
      {
        consumerId: "react18",
        phase: "build",
        command: "pnpm",
        args: ["run", "build"],
        cwd: resolve(fixturesDirectory, "react18-app"),
      },
      {
        consumerId: "react18",
        phase: "verify-ssr",
        command: "pnpm",
        args: ["run", "verify-ssr"],
        cwd: resolve(fixturesDirectory, "react18-app"),
      },
      {
        consumerId: "react19",
        phase: "install",
        command: "pnpm",
        args: ["install"],
        cwd: resolve(fixturesDirectory, "react19-app"),
      },
      {
        consumerId: "react19",
        phase: "check-types",
        command: "pnpm",
        args: ["run", "check-types"],
        cwd: resolve(fixturesDirectory, "react19-app"),
      },
      {
        consumerId: "react19",
        phase: "build",
        command: "pnpm",
        args: ["run", "build"],
        cwd: resolve(fixturesDirectory, "react19-app"),
      },
      {
        consumerId: "react19",
        phase: "verify-ssr",
        command: "pnpm",
        args: ["run", "verify-ssr"],
        cwd: resolve(fixturesDirectory, "react19-app"),
      },
      {
        consumerId: "nextjs-rsc",
        phase: "install",
        command: "pnpm",
        args: ["install"],
        cwd: resolve(fixturesDirectory, "nextjs-rsc"),
      },
      {
        consumerId: "nextjs-rsc",
        phase: "build",
        command: "pnpm",
        args: ["run", "build"],
        cwd: resolve(fixturesDirectory, "nextjs-rsc"),
      },
    ]);
  });

  test("browser preparation은 pack과 React consumer install/build만 실행한다", () => {
    // Protects against browser setup running SSR, Next.js, or non-build audit phases.
    const { steps, verification } = createRecordingVerification();

    verification.prepareBrowserConsumers();

    expect(steps.map(({ consumerId, phase }) => [consumerId, phase])).toEqual([
      ["package", "pack"],
      ["react18", "install"],
      ["react18", "build"],
      ["react19", "install"],
      ["react19", "build"],
    ]);
  });

  test("default executor는 각 subprocess env에서 runner npm metadata를 제거하고 다른 env는 보존한다", () => {
    // Protects against fixture pnpm commands inheriting turbo's npm runner metadata.
    const previousNpmExecpath = processEnv.npm_execpath;
    const previousNpmConfigUserAgent = processEnv.npm_config_user_agent;
    const previousSentinel = processEnv.CONSUMER_CONTRACT_TEST_SENTINEL;
    processEnv.npm_execpath = "/runner/pnpm.cjs";
    processEnv.npm_config_user_agent = "pnpm/runner";
    processEnv.CONSUMER_CONTRACT_TEST_SENTINEL = "preserve-me";
    spawnSync.mockReset();
    spawnSync.mockReturnValue({ signal: null, status: 0 });

    try {
      prepareBrowserConsumers();

      expect(spawnSync).toHaveBeenCalledTimes(5);
      for (const [, , options] of spawnSync.mock.calls) {
        expect(options.env).toMatchObject({
          CONSUMER_CONTRACT_TEST_SENTINEL: "preserve-me",
        });
        expect(options.env).not.toHaveProperty("npm_execpath");
        expect(options.env).not.toHaveProperty("npm_config_user_agent");
      }
    } finally {
      restoreEnvironmentVariable("npm_execpath", previousNpmExecpath);
      restoreEnvironmentVariable(
        "npm_config_user_agent",
        previousNpmConfigUserAgent,
      );
      restoreEnvironmentVariable(
        "CONSUMER_CONTRACT_TEST_SENTINEL",
        previousSentinel,
      );
    }
  });

  test("React 19 install의 첫 failure를 fixture identity와 cwd로 감싸고 뒤 단계 실행을 중단한다", () => {
    // Protects against losing failure attribution or continuing after a failed install.
    const steps: ConsumerStep[] = [];
    const sentinel = new Error("sentinel react19 install failure");
    const verification = createConsumerContractVerification({
      packageDirectory,
      execute(step: ConsumerStep) {
        steps.push(step);
        if (step.consumerId === "react19" && step.phase === "install") {
          throw sentinel;
        }
      },
    });

    expect(() => verification.auditConsumerContracts()).toThrow(
      `consumer=react19 phase=install cwd=${resolve(fixturesDirectory, "react19-app")} 실행 실패`,
    );
    expect(steps.at(-1)).toEqual({
      consumerId: "react19",
      phase: "install",
      command: "pnpm",
      args: ["install"],
      cwd: resolve(fixturesDirectory, "react19-app"),
    });
    expect(steps).toHaveLength(6);
  });
});

type GlobalKey =
  | "window"
  | "document"
  | "navigator"
  | "requestAnimationFrame"
  | "cancelAnimationFrame"
  | "close"
  | "__scrollaSsrSessionLifetimeSentinel";

type RecordedRoot = {
  unmount: () => void;
};

type VerifierHarnessOptions = {
  closeFailure?: Error;
  hydration?: (window: FakeWindow) => void;
  installGlobalBaseline?: boolean;
  renderFailure?: Error;
  unmountFailure?: Error;
  unmountMacrotaskWarning?: string;
  unmountScheduledWarning?: string;
};

type FakeWindow = {
  cancelAnimationFrame: (handle: number) => void;
  close: () => void;
  document: FakeDocument;
  navigator: { userAgent: string };
  requestAnimationFrame: (callback: (time: number) => void) => number;
  __scrollaSsrSessionLifetimeSentinel: string;
};

type FakeDocument = {
  body: { innerHTML: string };
  getElementById: (id: string) => { id: string } | null;
};

const verifierGlobalKeys: GlobalKey[] = [
  "window",
  "document",
  "navigator",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "close",
  "__scrollaSsrSessionLifetimeSentinel",
];

describe("verifySsrContract session lifetime", () => {
  test("성공 session은 모든 global descriptor를 원상 복구하고 root와 window를 닫는다", async () => {
    // Protects against a successful verifier retaining globals, a hydration root, or JSDOM.
    const harness = createVerifierHarness();

    try {
      await verifySsrContract(harness.adapter);

      expect(harness.roots).toHaveLength(1);
      expect(harness.unmounts()).toBe(1);
      expect(harness.closes()).toBe(1);
      expect(harness.windowRafWasRestoredBeforeClose()).toBe(true);
      expectGlobalDescriptorsToEqual(harness.descriptors);
      expectConsoleErrorDescriptorToEqual(harness.consoleErrorDescriptor);
    } finally {
      harness.restore();
    }
  });

  test("같은 process에서 순차 session 두 개를 실행해도 각각 독립적으로 닫는다", async () => {
    // Protects against a first session poisoning the next verifier invocation.
    const first = createVerifierHarness();
    let second: ReturnType<typeof createVerifierHarness> | undefined;

    try {
      await verifySsrContract(first.adapter);
      expect(first.unmounts()).toBe(1);
      expect(first.closes()).toBe(1);
      expect(first.windowRafWasRestoredBeforeClose()).toBe(true);
      expectGlobalDescriptorsToEqual(first.descriptors);
      expectConsoleErrorDescriptorToEqual(first.consoleErrorDescriptor);

      second = createVerifierHarness();
      await verifySsrContract(second.adapter);

      expect(second.unmounts()).toBe(1);
      expect(second.closes()).toBe(1);
      expect(second.windowRafWasRestoredBeforeClose()).toBe(true);
      expectGlobalDescriptorsToEqual(second.descriptors);
      expectConsoleErrorDescriptorToEqual(second.consoleErrorDescriptor);
    } finally {
      second?.restore();
      first.restore();
    }
  });

  test("겹친 session은 두 번째 JSDOM 생성이나 global mutation 전에 fail-closed한다", async () => {
    // Protects against concurrent sessions overwriting each other's process-global ownership.
    let notifyHydrationStarted: (() => void) | undefined;
    const hydrationStarted = new Promise<void>((resolve) => {
      notifyHydrationStarted = resolve;
    });
    const first = createVerifierHarness({
      hydration() {
        notifyHydrationStarted?.();
      },
    });
    let second: ReturnType<typeof createVerifierHarness> | undefined;

    try {
      const firstSession = verifySsrContract(first.adapter);
      await hydrationStarted;
      second = createVerifierHarness({ installGlobalBaseline: false });
      const descriptorsBeforeSecondSession = captureGlobalDescriptors();

      const failure = await captureRejection(verifySsrContract(second.adapter));
      expect(failure).toBeInstanceOf(Error);
      expect(second.domConstructs()).toBe(0);
      expectGlobalDescriptorsToEqual(descriptorsBeforeSecondSession);

      await firstSession;
      expect(first.unmounts()).toBe(1);
      expect(first.closes()).toBe(1);
      expect(first.windowRafWasRestoredBeforeClose()).toBe(true);
      expectGlobalDescriptorsToEqual(first.descriptors);
      expectConsoleErrorDescriptorToEqual(first.consoleErrorDescriptor);
    } finally {
      second?.restore();
      first.restore();
    }
  });

  test("render 실패 뒤에도 JSDOM을 닫고 global descriptor를 복원한다", async () => {
    // Protects against render failures bypassing session cleanup before hydration starts.
    const renderFailure = new Error("sentinel render failure");
    const harness = createVerifierHarness({ renderFailure });

    try {
      await expect(verifySsrContract(harness.adapter)).rejects.toBe(
        renderFailure,
      );

      expect(harness.roots).toHaveLength(0);
      expect(harness.closes()).toBe(1);
      expect(harness.windowRafWasRestoredBeforeClose()).toBe(true);
      expectGlobalDescriptorsToEqual(harness.descriptors);
      expectConsoleErrorDescriptorToEqual(harness.consoleErrorDescriptor);
    } finally {
      harness.restore();
    }
  });

  test("hydrateRoot 실패 뒤에도 JSDOM을 닫고 global descriptor를 복원한다", async () => {
    // Protects against hydration setup failures bypassing session cleanup.
    const hydrationFailure = new Error("sentinel hydrate failure");
    const harness = createVerifierHarness({
      hydration() {
        throw hydrationFailure;
      },
    });

    try {
      await expect(verifySsrContract(harness.adapter)).rejects.toBe(
        hydrationFailure,
      );

      expect(harness.roots).toHaveLength(0);
      expect(harness.closes()).toBe(1);
      expect(harness.windowRafWasRestoredBeforeClose()).toBe(true);
      expectGlobalDescriptorsToEqual(harness.descriptors);
      expectConsoleErrorDescriptorToEqual(harness.consoleErrorDescriptor);
    } finally {
      harness.restore();
    }
  });

  test("hydration warning 실패 뒤에도 root와 JSDOM을 닫고 global descriptor를 복원한다", async () => {
    // Protects against warning verdicts being evaluated after resources already leaked.
    const harness = createVerifierHarness({
      hydration() {
        console.error("sentinel hydration warning");
      },
    });

    try {
      await expect(verifySsrContract(harness.adapter)).rejects.toThrow(
        "sentinel hydration warning",
      );

      expect(harness.unmounts()).toBe(1);
      expect(harness.closes()).toBe(1);
      expect(harness.windowRafWasRestoredBeforeClose()).toBe(true);
      expectGlobalDescriptorsToEqual(harness.descriptors);
      expectConsoleErrorDescriptorToEqual(harness.consoleErrorDescriptor);
    } finally {
      harness.restore();
    }
  });

  test("unmount 뒤 scheduled React warning도 flush해 contract failure로 판정하고 모든 자원을 닫는다", async () => {
    // Protects against restoring console.error or skipping a post-unmount frame flush.
    const harness = createVerifierHarness({
      unmountScheduledWarning: "sentinel unmount scheduled warning",
    });

    try {
      await expect(verifySsrContract(harness.adapter)).rejects.toThrow(
        "sentinel unmount scheduled warning",
      );

      expect(harness.unmounts()).toBe(1);
      expect(harness.closes()).toBe(1);
      expect(harness.windowRafWasRestoredBeforeClose()).toBe(true);
      expectGlobalDescriptorsToEqual(harness.descriptors);
      expectConsoleErrorDescriptorToEqual(harness.consoleErrorDescriptor);
    } finally {
      harness.restore();
    }
  });

  test("unmount macrotask warning을 contract failure로 판정하고 다음 순차 session으로 유출하지 않는다", async () => {
    // Protects against restoring console.error or releasing the session guard before a late unmount timer runs.
    const first = createVerifierHarness({
      unmountMacrotaskWarning: "sentinel unmount macrotask warning",
    });
    let second: ReturnType<typeof createVerifierHarness> | undefined;

    try {
      await expect(verifySsrContract(first.adapter)).rejects.toThrow(
        "sentinel unmount macrotask warning",
      );

      expect(first.unmounts()).toBe(1);
      expect(first.closes()).toBe(1);
      expect(first.windowRafWasRestoredBeforeClose()).toBe(true);
      expectGlobalDescriptorsToEqual(first.descriptors);
      expectConsoleErrorDescriptorToEqual(first.consoleErrorDescriptor);

      second = createVerifierHarness();
      await verifySsrContract(second.adapter);

      expect(second.unmounts()).toBe(1);
      expect(second.closes()).toBe(1);
      expect(second.windowRafWasRestoredBeforeClose()).toBe(true);
      expectGlobalDescriptorsToEqual(second.descriptors);
      expectConsoleErrorDescriptorToEqual(second.consoleErrorDescriptor);
    } finally {
      second?.restore();
      first.restore();
    }
  });

  test("unmount가 throw해도 window close와 global 복원을 계속하고 cleanup-only 오류를 surface한다", async () => {
    // Protects against the first cleanup error skipping later cleanup or disappearing.
    const unmountFailure = new Error("sentinel unmount failure");
    const closeFailure = new Error("sentinel close failure");
    const harness = createVerifierHarness({ unmountFailure, closeFailure });

    try {
      const failure = await captureRejection(
        verifySsrContract(harness.adapter),
      );

      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([
        unmountFailure,
        closeFailure,
      ]);
      expect(harness.unmounts()).toBe(1);
      expect(harness.closes()).toBe(1);
      expect(harness.windowRafWasRestoredBeforeClose()).toBe(true);
      expectGlobalDescriptorsToEqual(harness.descriptors);
      expectConsoleErrorDescriptorToEqual(harness.consoleErrorDescriptor);
    } finally {
      harness.restore();
    }
  });

  test("본문 sentinel은 cleanup 오류보다 primary identity를 유지하고 모든 cleanup 오류를 cause로 보존한다", async () => {
    // Protects against cleanup aggregation replacing the verifier's original contract failure.
    const bodyFailure = new Error("sentinel body failure");
    const unmountFailure = new Error("sentinel unmount failure");
    const closeFailure = new Error("sentinel close failure");
    const harness = createVerifierHarness({
      closeFailure,
      hydration(window) {
        window.requestAnimationFrame(() => {
          throw bodyFailure;
        });
      },
      unmountFailure,
    });

    try {
      const failure = await captureRejection(
        verifySsrContract(harness.adapter),
      );

      expect(failure).toBe(bodyFailure);
      expect((failure as Error & { cause?: unknown }).cause).toBeInstanceOf(
        AggregateError,
      );
      expect(
        (failure as Error & { cause: AggregateError }).cause.errors,
      ).toEqual([unmountFailure, closeFailure]);
      expect(harness.unmounts()).toBe(1);
      expect(harness.closes()).toBe(1);
      expect(harness.windowRafWasRestoredBeforeClose()).toBe(true);
      expectGlobalDescriptorsToEqual(harness.descriptors);
      expectConsoleErrorDescriptorToEqual(harness.consoleErrorDescriptor);
    } finally {
      harness.restore();
    }
  });

  test("기존 cause가 있는 extensible Error는 identity와 기존 cause를 cleanup 오류와 함께 보존한다", async () => {
    // Protects against replacing existing causal data while attaching cleanup failures.
    const existingCause = new Error("sentinel existing cause");
    const bodyFailure = new Error("sentinel body failure", {
      cause: existingCause,
    });
    const unmountFailure = new Error("sentinel unmount failure");
    const closeFailure = new Error("sentinel close failure");
    const harness = createVerifierHarness({
      closeFailure,
      hydration(window) {
        window.requestAnimationFrame(() => {
          throw bodyFailure;
        });
      },
      unmountFailure,
    });

    try {
      const failure = await captureRejection(
        verifySsrContract(harness.adapter),
      );

      expect(failure).toBe(bodyFailure);
      expect((failure as Error).cause).toBeInstanceOf(AggregateError);
      expect(((failure as Error).cause as AggregateError).errors).toEqual([
        existingCause,
        unmountFailure,
        closeFailure,
      ]);
      expect(((failure as Error).cause as AggregateError).cause).toBe(
        existingCause,
      );
    } finally {
      harness.restore();
    }
  });

  test("primitive primary는 fallback AggregateError에서 precedence와 cleanup 오류를 보존한다", async () => {
    // Protects against cause attachment throwing a TypeError that masks a primitive primary.
    const bodyFailure = "sentinel primitive body failure";
    const unmountFailure = new Error("sentinel unmount failure");
    const closeFailure = new Error("sentinel close failure");
    const harness = createVerifierHarness({
      closeFailure,
      hydration(window) {
        window.requestAnimationFrame(() => {
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- Arbitrary JavaScript throw values are the contract under test.
          throw bodyFailure;
        });
      },
      unmountFailure,
    });

    try {
      const failure = await captureRejection(
        verifySsrContract(harness.adapter),
      );

      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([
        bodyFailure,
        unmountFailure,
        closeFailure,
      ]);
      expect((failure as AggregateError).cause).toBe(bodyFailure);
    } finally {
      harness.restore();
    }
  });

  test("frozen Error primary는 fallback AggregateError에서 identity reference와 cleanup 오류를 보존한다", async () => {
    // Protects against failed mutation of a frozen Error masking every prior failure.
    const bodyFailure = new Error("sentinel frozen failure");
    Object.freeze(bodyFailure);
    const unmountFailure = new Error("sentinel unmount failure");
    const closeFailure = new Error("sentinel close failure");
    const harness = createVerifierHarness({
      closeFailure,
      hydration(window) {
        window.requestAnimationFrame(() => {
          throw bodyFailure;
        });
      },
      unmountFailure,
    });

    try {
      const failure = await captureRejection(
        verifySsrContract(harness.adapter),
      );

      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([
        bodyFailure,
        unmountFailure,
        closeFailure,
      ]);
      expect((failure as AggregateError).cause).toBe(bodyFailure);
    } finally {
      harness.restore();
    }
  });

  test("non-configurable cause를 가진 primary는 원본을 바꾸지 않고 fallback으로 모든 오류를 보존한다", async () => {
    // Protects against replacing a non-configurable cause or surfacing the attachment TypeError.
    const existingCause = new Error("sentinel immutable cause");
    const bodyFailure = new Error("sentinel body failure");
    Object.defineProperty(bodyFailure, "cause", {
      configurable: false,
      value: existingCause,
      writable: true,
    });
    const unmountFailure = new Error("sentinel unmount failure");
    const closeFailure = new Error("sentinel close failure");
    const harness = createVerifierHarness({
      closeFailure,
      hydration(window) {
        window.requestAnimationFrame(() => {
          throw bodyFailure;
        });
      },
      unmountFailure,
    });

    try {
      const failure = await captureRejection(
        verifySsrContract(harness.adapter),
      );

      expect(failure).toBeInstanceOf(AggregateError);
      expect((failure as AggregateError).errors).toEqual([
        bodyFailure,
        unmountFailure,
        closeFailure,
      ]);
      expect((failure as AggregateError).cause).toBe(bodyFailure);
      expect(bodyFailure.cause).toBe(existingCause);
    } finally {
      harness.restore();
    }
  });
});

function createVerifierHarness(options: VerifierHarnessOptions = {}) {
  const originalGlobalDescriptors = captureGlobalDescriptors();
  const originalConsoleError = Object.getOwnPropertyDescriptor(
    console,
    "error",
  );
  const roots: RecordedRoot[] = [];
  let closes = 0;
  let domConstructs = 0;
  let unmounts = 0;
  let windowRafWasRestoredBeforeClose = false;
  const container = { id: "root" };
  const document: FakeDocument = {
    body: { innerHTML: "" },
    getElementById(id) {
      return id === "root" ? container : null;
    },
  };
  const frameCallbacks = new Map<number, (time: number) => void>();
  let nextFrameHandle = 1;
  const window = {} as FakeWindow;
  const windowRequestAnimationFrame = (callback: (time: number) => void) => {
    const handle = nextFrameHandle++;
    frameCallbacks.set(handle, callback);
    return handle;
  };
  const windowCancelAnimationFrame = (handle: number) => {
    frameCallbacks.delete(handle);
  };

  Object.defineProperties(window, {
    document: { configurable: true, value: document },
    navigator: { configurable: true, value: { userAgent: "fake-jsdom" } },
    requestAnimationFrame: {
      configurable: true,
      value: windowRequestAnimationFrame,
      writable: true,
    },
    cancelAnimationFrame: {
      configurable: true,
      value: windowCancelAnimationFrame,
      writable: true,
    },
    __scrollaSsrSessionLifetimeSentinel: {
      configurable: true,
      value: "window-sentinel",
    },
    close: {
      configurable: true,
      value() {
        closes += 1;
        windowRafWasRestoredBeforeClose = windowRafDescriptorsEqual(
          window,
          originalWindowRafDescriptors,
        );
        if (options.closeFailure !== undefined) {
          throw options.closeFailure;
        }
      },
    },
  });
  const originalWindowRafDescriptors = captureWindowRafDescriptors(window);

  if (options.installGlobalBaseline !== false) {
    Object.defineProperties(globalThis, {
      window: {
        configurable: true,
        get: () => "original-window-accessor",
      },
      document: {
        configurable: true,
        enumerable: true,
        value: "original-document-non-writable",
        writable: false,
      },
      navigator: {
        configurable: true,
        get: () => "original-navigator-accessor",
      },
      requestAnimationFrame: {
        configurable: true,
        value: () => 111,
        writable: true,
      },
      cancelAnimationFrame: {
        configurable: true,
        value: () => undefined,
        writable: true,
      },
    });
    delete (globalThis as Record<string, unknown>)[
      "__scrollaSsrSessionLifetimeSentinel"
    ];
  }

  const descriptors = captureGlobalDescriptors();

  class FakeJSDOM {
    window: FakeWindow;

    constructor(_html: string, _options: Record<string, unknown>) {
      void _html;
      void _options;
      domConstructs += 1;
      this.window = window;
    }
  }

  const adapter = {
    JSDOM: FakeJSDOM,
    React: {
      createElement: (...args: unknown[]) => ({ args }),
    },
    renderToString() {
      if (options.renderFailure !== undefined) {
        throw options.renderFailure;
      }
      return "<div>server markup</div>";
    },
    hydrateRoot() {
      options.hydration?.(window);
      const root: RecordedRoot = {
        unmount() {
          unmounts += 1;
          if (options.unmountMacrotaskWarning !== undefined) {
            setTimeout(() => {
              console.error(options.unmountMacrotaskWarning);
            }, 0);
          }
          if (options.unmountScheduledWarning !== undefined) {
            window.requestAnimationFrame(() => {
              console.error(options.unmountScheduledWarning);
            });
          }
          if (options.unmountFailure !== undefined) {
            throw options.unmountFailure;
          }
        },
      };
      roots.push(root);
      return root;
    },
    Scrolla: "fake-scrolla",
  };

  return {
    adapter,
    closes: () => closes,
    consoleErrorDescriptor: originalConsoleError,
    descriptors,
    domConstructs: () => domConstructs,
    roots,
    restore() {
      restoreGlobalDescriptors(originalGlobalDescriptors);
      restorePropertyDescriptor(console, "error", originalConsoleError);
    },
    unmounts: () => unmounts,
    windowRafWasRestoredBeforeClose: () => windowRafWasRestoredBeforeClose,
  };
}

function captureGlobalDescriptors() {
  return new Map(
    verifierGlobalKeys.map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
}

function expectGlobalDescriptorsToEqual(
  expected: Map<GlobalKey, PropertyDescriptor | undefined>,
) {
  for (const [key, descriptor] of expected) {
    expect(Object.getOwnPropertyDescriptor(globalThis, key)).toEqual(
      descriptor,
    );
  }
}

function expectConsoleErrorDescriptorToEqual(
  expected: PropertyDescriptor | undefined,
) {
  expect(Object.getOwnPropertyDescriptor(console, "error")).toEqual(expected);
}

function captureWindowRafDescriptors(window: FakeWindow) {
  return new Map(
    ["requestAnimationFrame", "cancelAnimationFrame"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(window, key),
    ]),
  );
}

function windowRafDescriptorsEqual(
  window: FakeWindow,
  expected: Map<string, PropertyDescriptor | undefined>,
) {
  return [...expected].every(([key, descriptor]) =>
    propertyDescriptorsEqual(
      Object.getOwnPropertyDescriptor(window, key),
      descriptor,
    ),
  );
}

function propertyDescriptorsEqual(
  actual: PropertyDescriptor | undefined,
  expected: PropertyDescriptor | undefined,
) {
  return (
    actual?.configurable === expected?.configurable &&
    actual?.enumerable === expected?.enumerable &&
    actual?.get === expected?.get &&
    actual?.set === expected?.set &&
    actual?.value === expected?.value &&
    actual?.writable === expected?.writable
  );
}

function restoreGlobalDescriptors(
  descriptors: Map<GlobalKey, PropertyDescriptor | undefined>,
) {
  for (const [key, descriptor] of [...descriptors].reverse()) {
    restorePropertyDescriptor(globalThis, key, descriptor);
  }
}

function restorePropertyDescriptor(
  target: object,
  key: string,
  descriptor: PropertyDescriptor | undefined,
) {
  if (descriptor === undefined) {
    delete (target as Record<string, unknown>)[key];
    return;
  }
  Object.defineProperty(target, key, descriptor);
}

async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  const outcome = await promise.then(
    (value) => ({ status: "fulfilled" as const, value }),
    (reason: unknown) => ({ reason, status: "rejected" as const }),
  );

  expect(outcome.status).toBe("rejected");
  if (outcome.status === "rejected") {
    return outcome.reason;
  }
  return undefined;
}

function restoreEnvironmentVariable(key: string, value: string | undefined) {
  if (value === undefined) {
    delete processEnv[key];
    return;
  }
  processEnv[key] = value;
}
