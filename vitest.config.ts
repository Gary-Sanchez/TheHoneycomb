import { readFileSync } from "fs";
import { defineConfig } from "vitest/config";

// US-49: same __APP_VERSION__ as vite.config.ts (this config is separate, so it must define it too).
const appVersion: string = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version;

// Unit tests only. e2e/*.spec.ts belongs to Playwright (`npm run test:e2e`) and must not be
// picked up here, which is why unit tests use the `.test.ts` / `.test.tsx` suffix. `.claude/**` keeps
// out the agent worktrees (full repo copies with their own node_modules) under `.claude/worktrees/`.
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  test: {
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "dist/**", "e2e/**", ".claude/**"],
  },
});
