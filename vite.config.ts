import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process 是 Node.js 全局变量
const host = process.env.TAURI_DEV_HOST;

// Vite 配置文档：https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // 这些 Vite 选项只服务于 `tauri dev` 和 `tauri build`。
  //
  // 1. 避免 Vite 清屏后盖住 Rust 错误。
  clearScreen: false,
  // 2. Tauri 需要固定端口；端口不可用时直接失败。
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. 避免 Vite 监听 Rust 工程目录。
      ignored: ["**/src-tauri/**"],
    },
  },
}));
