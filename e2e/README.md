# e2e tests

End-to-end tests for The Honeycomb desktop app, run with Playwright against the packaged Electron
build (see `playwright.config.ts` and `npm run test:e2e`).

- `smoke.spec.ts` — base smoke test (US-06): the app compiles, the main window opens, and the
  embedded Express server responds.
- `shutdown.spec.ts` — graceful shutdown (US-15): closing the Electron window is fast and never ends
  by the 5s timeout, saved records survive a reopen, and the standalone server (on both the system
  Node and Electron's Node) exits promptly with request-less or keep-alive connections open while
  still persisting a write in flight. `fixtures/server-harness.cjs` runs `dist/server.cjs` and
  takes `SIGINT`/`SIGTERM` over stdin, since real signals can't be sent to a child on Windows.
- `visual.spec.ts` — visual regression (US-50): copies this version's fixed database
  (`fixtures/vX.Y.0.json`, from `package.json`'s MAJOR.MINOR) into a temp dir, launches Electron on
  port 3105 with a 1440×900 content size, signs in as admin, and compares a full-page screenshot of
  each of the 6 main tabs with `snapshots/current/` — exact match, no tolerance (scrollbars hidden
  by `visual.css` so every capture is 1440 px wide).
  - Regenerate the fixture: `npx tsx e2e/fixtures/build-fixture.ts [X.Y.0]` (deterministic; demo
    seed + one demo note + one demo import fingerprint).
  - Update the references after an intended UI change: `npm run build && npx playwright test
    e2e/visual.spec.ts --update-snapshots`, review the images, and attach the diff to the PR. See
    `snapshots/README.md` for `current/` vs the frozen `vX.Y.0/` folders.
  - Baselines are Windows-only (`*-win32.png`); on another OS the spec has no reference to compare to.
  - Fonts (Inter, Playfair Display, JetBrains Mono) still load from Google Fonts until US-55, so the
    run needs network access; offline, fallback fonts would make the tabs differ from the references.
- Add new spec files here for future QA scenarios (e.g. the ones documented in `US-03`, `US-04`,
  `US-05`) — the base Electron-launch config in `playwright.config.ts` already covers them. If a
  scenario writes or deletes attendance data, launch Electron with `HONEYCOMB_DB_PATH`/
  `HONEYCOMB_CONFIG_PATH` pointing at a temp directory (see `smoke.spec.ts`) so it doesn't touch
  the real `%APPDATA%` data.
