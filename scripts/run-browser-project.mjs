import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { argv, env } from "node:process";
import { fileURLToPath } from "node:url";
import { prepareBrowserConsumers } from "../packages/react/test/consumer-contract/orchestration.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const project = argv[2];

if (!new Set(["chrome83-floor", "chrome-latest"]).has(project)) {
  throw new Error(`지원하지 않는 Playwright project: ${String(project)}`);
}
if (env.CHROME83_WEBSERVER && env.CHROME_LATEST_WEBSERVER) {
  throw new Error(
    "Chrome 83/latest browser gate를 동시에 실행할 수 없습니다.",
  );
}

prepareBrowserConsumers();
const result = spawnSync(
  "pnpm",
  ["exec", "playwright", "test", `--project=${project}`],
  { cwd: repoRoot, stdio: "inherit" },
);
if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error(
    `Playwright ${project}가 exit=${String(result.status)} signal=${String(result.signal)}로 실패했습니다.`,
  );
}
