import { defineConfig } from "vitest/config";

// Unit tests cover pure logic only, so they run in plain Node without the
// Cloudflare Vite plugin.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node"
  }
});
