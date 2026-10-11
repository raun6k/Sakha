import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 20000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: process.env.SAKHA_WEB_URL ?? "http://127.0.0.1:5173",
    headless: true,
  },
  outputDir: "/tmp/sakha-frontend-playwright",
});
