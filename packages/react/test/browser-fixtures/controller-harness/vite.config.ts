import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// vite root의 기본값은 config 파일 위치가 아니라 process.cwd()다. 이 config를
// `pnpm --filter @cp949/scrolla-react exec vite build --config ...`로 실행하면
// cwd가 packages/react가 되어 index.html을 못 찾으므로 root를 명시 고정한다.
const harnessRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: harnessRoot,
  build: {
    // chrome83-floor는 build+preview 산출물만 서빙한다 — vite dev는
    // build.target을 적용하지 않아 downlevel 결과가 반영되지 않는다.
    target: "chrome83",
    outDir: "dist",
    emptyOutDir: true,
  },
});
