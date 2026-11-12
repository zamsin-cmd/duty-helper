import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Design Ref: §4.2 — Vitest로 달력 계산·규칙 검사기를 자동으로 확인한다.
export default defineConfig({
  resolve: {
    // 코드의 "@/lib/..." 경로(tsconfig의 "@/*")를 시험에서도 똑같이 쓸 수 있게 한다.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    // 서버·계산 코드만 시험하므로 브라우저 환경은 필요 없다.
    environment: "node",
    // 시험 파일은 "이름.test.ts" 형태로 만든다.
    include: ["**/*.test.ts"],
    // 설치된 도구 폴더와 빌드 결과는 시험 대상에서 뺀다.
    exclude: ["node_modules/**", ".next/**", "trash-can/**"],
  },
});
