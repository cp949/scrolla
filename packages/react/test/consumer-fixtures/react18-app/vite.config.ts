import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Chrome83 검증: 기본 build target으로 만든 번들이 논리 할당 연산자
  // (&&=, ||=, ??=, Chrome85+)를 포함해 Chrome83에서 파싱 실패(빈 페이지)한다.
  build: { target: "chrome83" },
});
