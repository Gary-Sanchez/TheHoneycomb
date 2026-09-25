# e2e tests

End-to-end tests for The Honeycomb desktop app, run with Playwright against the packaged Electron
build (see `playwright.config.ts` and `npm run test:e2e`).

- `smoke.spec.ts` — base smoke test (US-06): the app compiles, the main window opens, and the
  embedded Express server responds.
- Add new spec files here for future QA scenarios (e.g. the ones documented in `US-03`, `US-04`,
  `US-05`) — the base Electron-launch config in `playwright.config.ts` already covers them. If a
  scenario writes or deletes attendance data, launch Electron with `HONEYCOMB_DB_PATH`/
  `HONEYCOMB_CONFIG_PATH` pointing at a temp directory (see `smoke.spec.ts`) so it doesn't touch
  the real `%APPDATA%` data.
