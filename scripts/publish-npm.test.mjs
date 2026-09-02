import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyRegistryVersionResult,
  getMenuItems,
  parsePublishArguments,
  planPublish,
  publishPackage,
  validatePublishLifecycle,
} from "./publish-npm.mjs";

test("인자가 없으면 단일 package 대화형 메뉴를 선택한다", () => {
  assert.deepEqual(parsePublishArguments([]), { menu: true });
});

test("명시적 실행은 dry-run을 기본값으로 사용한다", () => {
  assert.deepEqual(parsePublishArguments(["--dry-run"]), {
    dryRun: true,
    confirmed: false,
  });
});

test("실제 publish는 confirmation을 함께 요구한다", () => {
  assert.throws(
    () => parsePublishArguments(["--publish"]),
    /--confirm-publish/u,
  );
  assert.deepEqual(parsePublishArguments(["--publish", "--confirm-publish"]), {
    dryRun: false,
    confirmed: true,
  });
});

test("package 선택 인자는 거부한다", () => {
  assert.throws(
    () => parsePublishArguments(["--package", "x"]),
    /알 수 없는 인자/u,
  );
});

test("메뉴는 단일 package의 release 절차를 표시한다", () => {
  assert.deepEqual(getMenuItems("1.0.0"), [
    ["1", "빌드"],
    ["2", "release 전체 검증"],
    ["3", "dry-run 배포"],
    ["4", "실제 publish"],
    ["5", "registry 상태 새로고침"],
    ["6", "배포 결과 확인"],
    ["q", "종료"],
  ]);
});

test("registry 조회 결과를 published, missing, error로 구분한다", () => {
  assert.deepEqual(
    classifyRegistryVersionResult({ status: 0, stdout: "1.0.0\n", stderr: "" }),
    { status: "published", version: "1.0.0" },
  );
  assert.deepEqual(
    classifyRegistryVersionResult({
      status: 1,
      stdout: "",
      stderr: "npm error code E404",
    }),
    { status: "missing" },
  );
  assert.deepEqual(
    classifyRegistryVersionResult({
      status: 1,
      stdout: "",
      stderr: "npm error code EAI_AGAIN",
    }),
    { status: "error", reason: "EAI_AGAIN" },
  );
});

test("실제 publish는 이미 배포된 버전과 registry 조회 실패를 차단한다", () => {
  assert.deepEqual(
    planPublish(false, { status: "published", version: "1.0.0" }),
    { action: "abort", reason: "이미 배포되어 있습니다." },
  );
  assert.deepEqual(
    planPublish(false, { status: "error", reason: "EAI_AGAIN" }),
    { action: "abort", reason: "registry 조회 실패" },
  );
  assert.deepEqual(
    planPublish(true, { status: "error", reason: "EAI_AGAIN" }),
    {
      action: "proceed",
    },
  );
});

test("release 검증이 실패하면 publish 명령을 실행하지 않는다", () => {
  const commands = [];
  const succeeded = publishPackage(
    "1.0.0",
    true,
    { status: "missing" },
    (command, args) => {
      commands.push([command, args]);
      return { status: 1 };
    },
  );

  assert.equal(succeeded, false);
  assert.deepEqual(commands, [["pnpm", ["verify"]]]);
});

test("lifecycle direct actual은 차단하고 wrapper marker와 dry-run은 허용한다", () => {
  assert.throws(
    () => validatePublishLifecycle({}),
    /SCROLLA_PUBLISH_DIRECT_DENIED/u,
  );
  assert.doesNotThrow(() =>
    validatePublishLifecycle({ npm_config_dry_run: "true" }),
  );
  assert.doesNotThrow(() =>
    validatePublishLifecycle({ SCROLLA_PUBLISH_CONFIRMED: "1" }),
  );
});
