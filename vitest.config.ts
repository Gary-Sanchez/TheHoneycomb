import { defineConfig } from "vitest/config";

// Unit tests only. e2e/*.spec.ts belongs to Playwright (`npm run test:e2e`) and must not be
// picked up here, which is why unit tests use the `.test.ts` suffix. `.claude/**` keeps out the
// agent worktrees (full repo copies with their own node_modules) under `.claude/worktrees/`.
export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "dist/**", "e2e/**", ".claude/**"],
  },
});
