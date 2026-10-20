# Reference screenshots (US-50)

- `current/` — the references `e2e/visual.spec.ts` compares against (`snapshotPathTemplate` in
  `playwright.config.ts`). They change, on purpose, whenever a ticket changes the UI:
  `npm run build && npx playwright test e2e/visual.spec.ts --update-snapshots`, then attach the
  diff (`test-results/**/*-diff.png` of the failing run) to the PR.
- `vX.Y.0/` — frozen copy of `current/` taken when PRD X.Y was closed (see `docs/PRD-CLOSING.md`).
  No test reads or writes these folders and they are never regenerated: they record what each
  released version looked like, loaded with `e2e/fixtures/vX.Y.0.json`.

Screenshots are 1440 px wide, full page, taken from the Electron app on Windows (`*-win32.png`).
