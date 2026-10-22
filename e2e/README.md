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
  - Fonts (Inter, Playfair Display, JetBrains Mono) are bundled with the app since US-55, so the run
    no longer needs network access. Checkouts of tags before US-55 (e.g. `v4.0.0`) still load them
    from Google Fonts and need network.
  - US-51 adds, in the same spec and app instance, the 6 tabs at 768×1024 and 375×812
    (`<slug>-768-win32.png`, `<slug>-375-win32.png`, full page) and the Progress Report / Outcome
    Report modals open at 1440, 768 and 375 (`progress-report-<width>-win32.png`,
    `outcome-report-<width>-win32.png`, viewport only). The launcher (fixture copy, DPR 1, admin
    session, `setSize`, `openTab`) lives in `fixtures/visual-app.ts`.
- `snapshot-metrics.spec.ts` — audit baseline (US-51, `docs/SNAPSHOT-4.0.md`): per tab at 1440,
  768 and 375 px counts text below 12 px, controls without an accessible name and page horizontal
  scroll, on port 3106. A measurement, not a check: skipped unless `HONEYCOMB_SNAPSHOT_METRICS=1`
  (`npm run build && HONEYCOMB_SNAPSHOT_METRICS=1 npx playwright test e2e/snapshot-metrics.spec.ts`);
  writes `test-results/snapshot-metrics.json` (or `HONEYCOMB_SNAPSHOT_METRICS_OUT`). The code counts
  of the same baseline come from `node scripts/snapshot-code-counts.mjs <tag>`.
- Add new spec files here for future QA scenarios (e.g. the ones documented in `US-03`, `US-04`,
  `US-05`) — the base Electron-launch config in `playwright.config.ts` already covers them. If a
  scenario writes or deletes attendance data, launch Electron with `HONEYCOMB_DB_PATH`/
  `HONEYCOMB_CONFIG_PATH` pointing at a temp directory (see `smoke.spec.ts`) so it doesn't touch
  the real `%APPDATA%` data.
