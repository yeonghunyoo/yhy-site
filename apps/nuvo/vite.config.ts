import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  // ES 모듈 워커 → HEIC 디코더(WASM, 수 MB)는 HEIC 파일을 만났을 때만 받는다
  worker: { format: "es" },
  // 워커가 쓰는 의존성을 미리 묶어 둔다 (첫 사용 때 재최적화로 페이지가 새로고침되는 것 방지)
  optimizeDeps: { include: ["exifr", "blurhash", "heic-to", "three", "@react-three/fiber"] },
  server: {
    // 테스트 산출물이 바뀔 때 개발 서버가 페이지를 새로고침하지 않게
    watch: { ignored: ["**/test-results/**", "**/playwright-report/**", "**/e2e/.fixtures/**"] },
  },
});
