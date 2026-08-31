import { describe, expect, it } from "vitest";
import { composeRefs } from "../src/slot-composition.js";

// 이 테스트는 workspace에 실제 설치된 React(19 계열) 런타임 기준이다. React 18에서
// callback ref가 함수를 반환하면 "Unexpected return value from a callback ref" 경고가
// 나는 문제(PIT-007)는 이 workspace에 React 18 runtime이 없어 여기서 재현할 수 없고,
// `packages/react/test/consumer-fixtures/react18-app`의 `verify-ssr.mjs`(실제 React 18
// tarball consumer)가 대신 검증한다.
describe("composeRefs", () => {
  it("React 19 런타임에서는 aggregate cleanup 함수를 반환한다(consumer의 자체 cleanup을 forwarding하기 위해 필요)", () => {
    const composed = composeRefs(undefined, undefined);

    expect(typeof composed({})).toBe("function");
  });

  it("attach 시 library ref와 consumer ref 모두 값을 받는다", () => {
    const libraryCalls: unknown[] = [];
    const consumerCalls: unknown[] = [];
    const composed = composeRefs(
      (value: unknown) => {
        libraryCalls.push(value);
      },
      (value: unknown) => {
        consumerCalls.push(value);
      },
    );

    composed("value");

    expect(libraryCalls).toEqual(["value"]);
    expect(consumerCalls).toEqual(["value"]);
  });

  it("consumer ref가 자체 cleanup을 반환하면 detach 시 null 재호출 대신 그 cleanup을 호출한다", () => {
    const consumerCalls: unknown[] = [];
    const consumerCleanupCalls: number[] = [];
    const composed = composeRefs(undefined, (value: unknown) => {
      consumerCalls.push(value);
      return () => {
        consumerCleanupCalls.push(1);
      };
    });

    const cleanup = composed("value");
    cleanup?.();

    expect(consumerCleanupCalls).toEqual([1]);
    expect(consumerCalls).toEqual(["value"]);
  });

  it("consumer ref가 cleanup을 반환하지 않으면(전통적 방식) detach 시 null로 재호출한다", () => {
    const consumerCalls: unknown[] = [];
    const composed = composeRefs(undefined, (value: unknown) => {
      consumerCalls.push(value);
    });

    const cleanup = composed("value");
    cleanup?.();

    expect(consumerCalls).toEqual(["value", null]);
  });
});
