import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./integration",
  timeout: 30000,
  workers: 1,
  reporter: "list",
  use: { headless: true },
  outputDir: "/tmp/sakha-integration-playwright",
});
