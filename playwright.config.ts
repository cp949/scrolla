import { defineConfig, devices } from "@playwright/test";
import matrix from "./packages/react/test/consumer-contract/matrix.json";

// chrome83-floor project와 chrome-latest project가 공유하는 webServer.
// Playwright는 --project 필터와 무관하게 webServer 배열 전체를 항상 띄운다(geul
// 실측, Issue #123/#124와 동일 문제) — CHROME83_WEBSERVER 또는
// CHROME_LATEST_WEBSERVER 환경변수가 설정된 실행에서만 배열에 포함해 다른
// project 게이트와 결합되지 않게 한다.
const chrome83Gate = Boolean(process.env.CHROME83_WEBSERVER);
const chromeLatestGate = Boolean(process.env.CHROME_LATEST_WEBSERVER);
if (chrome83Gate && chromeLatestGate) {
  throw new Error("Chrome 83/latest browser gate를 동시에 실행할 수 없습니다.");
}
const needsSharedFixtures = chrome83Gate || chromeLatestGate;

const sharedWebServer = needsSharedFixtures
  ? [
      {
        command:
          "pnpm --filter @cp949/scrolla-react exec vite build --config test/browser-fixtures/controller-harness/vite.config.ts && pnpm --filter @cp949/scrolla-react exec vite preview --config test/browser-fixtures/controller-harness/vite.config.ts --port 4174 --strictPort --host 127.0.0.1",
        url: "http://127.0.0.1:4174",
        // 매번 새 컨테이너로 도는 1회성 검증이라 서버 재사용 이득이 없고, stale
        // preview 재사용은 거짓 통과/거짓 실패를 만든다.
        reuseExistingServer: false,
        timeout: 60_000,
      },
      ...matrix.reactConsumers.map((consumer) => ({
        command: `pnpm --dir packages/react/test/consumer-fixtures/${consumer.directory} exec vite preview --port ${consumer.browser.port} --strictPort --host 127.0.0.1`,
        url: `http://127.0.0.1:${consumer.browser.port}`,
        reuseExistingServer: false,
        timeout: 30_000,
      })),
    ]
  : [];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  reporter: "list",
  projects: [
    {
      // Chrome83(Debian snapshot 고정 바이너리, docker/chrome83) 검증 전용.
      // 공식 browser 하한 목표는 Chrome75지만 Playwright가 무조건 호출하는
      // CDP Browser.setDownloadBehavior가 Chrome82부터 존재해 83을 실제 검증
      // 가능한 최소로 사용한다.
      name: "chrome83-floor",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4174",
        launchOptions: {
          executablePath: "/usr/bin/chromium",
          args: ["--no-sandbox"],
        },
      },
    },
    {
      // 최신 Chrome Desktop 회귀 전용. executablePath를 지정하지
      // 않아 Playwright 1.62.1이 관리하는 번들 Chromium(로컬 ~/.cache/ms-playwright
      // 캐시)을 그대로 쓴다 — 이 환경에는 시스템 Google Chrome이 설치돼 있지
      // 않고, chrome83-floor와 동일하게 "실제 Chrome 대신 검증 가능한 가장
      // 가까운 Chromium"을 쓰는 이 저장소의 기존 패턴과 일관된다.
      name: "chrome-latest",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://127.0.0.1:4174",
      },
    },
  ],
  webServer: sharedWebServer,
});
