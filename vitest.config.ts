import { defineConfig } from "vitest/config";

// Unit tests only. e2e/*.spec.ts belongs to Playwright (`npm run test:e2e`) and must not be
// picked up here, which is why unit tests use the `.test.ts` suffix.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", "e2e/**"],
  },
});
