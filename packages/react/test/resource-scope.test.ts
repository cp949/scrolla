import { describe, expect, test, vi } from "vitest";
import { createResourceScope } from "../src/core/resource-scope.js";

describe("createResourceScope", () => {
  test("등록한 disposer를 LIFO 순서로 정확히 한 번 정리한다", () => {
    const scope = createResourceScope();
    const calls: string[] = [];
    scope.add(() => calls.push("first"));
    scope.add(() => calls.push("second"));
    scope.add(() => calls.push("third"));

    scope.destroy();
    scope.destroy();

    expect(calls).toEqual(["third", "second", "first"]);
  });

  test("disposer 오류 뒤에도 남은 정리를 시도하고 첫 오류를 다시 던진다", () => {
    const scope = createResourceScope();
    const firstError = new Error("first cleanup failure");
    const calls: string[] = [];
    scope.add(() => calls.push("last"));
    scope.add(() => {
      calls.push("later error");
      throw new Error("later cleanup failure");
    });
    scope.add(() => {
      calls.push("first error");
      throw firstError;
    });

    expect(() => scope.destroy()).toThrow(firstError);
    expect(calls).toEqual(["first error", "later error", "last"]);
    expect(() => scope.destroy()).not.toThrow();
    expect(calls).toEqual(["first error", "later error", "last"]);
  });

  test("destroy 뒤 add는 disposer를 즉시 한 번 실행하고 저장하지 않는다", () => {
    const scope = createResourceScope();
    const disposer = vi.fn();
    scope.destroy();

    scope.add(disposer);
    scope.destroy();

    expect(disposer).toHaveBeenCalledOnce();
  });
});
