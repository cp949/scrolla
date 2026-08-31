import { config } from "@repo/eslint-config/base";

/**
 * pnpm workspace 밖에 있는 e2e/harness 코드 전용 lint 설정이다. 각 워크스페이스
 * 패키지는 자체 eslint.config.js를 갖고 있으므로(예: packages/react), 이 config는
 * turbo run lint가 다루지 않는 대상(e2e/, controller-harness)에만 명시적으로
 * 대상 경로를 지정해 실행한다(package.json의 lint:e2e 스크립트 참고).
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [...config];
