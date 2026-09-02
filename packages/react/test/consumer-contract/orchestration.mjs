import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env as processEnv } from "node:process";
import { fileURLToPath } from "node:url";

const matrix = JSON.parse(
  readFileSync(new URL("./matrix.json", import.meta.url), "utf8"),
);
const defaultPackageDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const tarballFileName = "cp949-scrolla-react-1.0.0.tgz";

function runStep(execute, step) {
  try {
    execute(step);
  } catch (cause) {
    throw new Error(
      `consumer=${step.consumerId} phase=${step.phase} cwd=${step.cwd} 실행 실패`,
      { cause },
    );
  }
}

function executeCommand({ command, args, cwd }) {
  const env = { ...processEnv };
  delete env.npm_execpath;
  delete env.npm_config_user_agent;

  const result = spawnSync(command, args, { cwd, stdio: "inherit", env });
  if (result.error) {
    throw new Error(`${command} ${args.join(" ")} 실행 오류`, {
      cause: result.error,
    });
  }
  if (result.signal !== null) {
    throw new Error(
      `${command} ${args.join(" ")} signal ${result.signal}로 종료했습니다.`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} (cwd: ${cwd})가 exit code ${result.status}로 실패했습니다.`,
    );
  }
}

export function createConsumerContractVerification({
  packageDirectory,
  execute,
}) {
  const fixturesDirectory = resolve(packageDirectory, "test/consumer-fixtures");
  const tarballDirectory = resolve(fixturesDirectory, ".tarball");
  const consumers = [...matrix.reactConsumers, ...matrix.buildOnlyConsumers];
  const pack = () =>
    runStep(execute, {
      consumerId: "package",
      phase: "pack",
      command: "pnpm",
      args: ["pack", "--pack-destination", tarballDirectory],
      cwd: packageDirectory,
    });
  const runConsumerPhase = (consumer, phase) =>
    runStep(execute, {
      consumerId: consumer.id,
      phase,
      command: "pnpm",
      args: phase === "install" ? ["install"] : ["run", phase],
      cwd: resolve(fixturesDirectory, consumer.directory),
    });

  return Object.freeze({
    auditConsumerContracts() {
      pack();
      for (const consumer of consumers) {
        runConsumerPhase(consumer, "install");
        for (const phase of consumer.auditScripts) {
          runConsumerPhase(consumer, phase);
        }
      }
      console.log(
        `audit-consumers: packed tarball(${tarballFileName})을 ${consumers.length}개 consumer fixture에서 검증했습니다.`,
      );
    },
    prepareBrowserConsumers() {
      pack();
      for (const consumer of matrix.reactConsumers) {
        runConsumerPhase(consumer, "install");
        runConsumerPhase(consumer, "build");
      }
    },
  });
}

const defaultVerification = createConsumerContractVerification({
  packageDirectory: defaultPackageDirectory,
  execute: executeCommand,
});

export const auditConsumerContracts = () =>
  defaultVerification.auditConsumerContracts();
export const prepareBrowserConsumers = () =>
  defaultVerification.prepareBrowserConsumers();
