# The Honeycomb — Attendance & Cross-Referencing

Internal tool for tracking colleague ("Caserits") attendance across 4 voluntary English-learning
activities, with AI-assisted import of attendance logs from uploaded files.

Full functional spec (UI copy, business rules, expected results per screen) lives in
[`../Guía de Uso del Sistema_ The Honeycomb (Attendance & Cross-Referencing).docx`](../Guía%20de%20Uso%20del%20Sistema_%20The%20Honeycomb%20(Attendance%20&%20Cross-Referencing).docx).
It's written in Spanish for business rules, but every UI string (tab names, button labels, badges,
messages) is quoted verbatim in English exactly as it must appear in code — match those strings
exactly when implementing or testing a flow described there.

**⚠️ One correction to that doc:** it describes persistence as browser `localStorage` keyed by
`english_tracker_*`. That's not what the code does — see Architecture below. Trust the code over
the doc for anything persistence-related.

## Stack & commands

- Vite + React 19 + TypeScript frontend, Express backend (`server.ts`), bundled together and also
  shippable as an Electron desktop app.
- `npm run dev` — runs `server.ts` via `tsx` (Express serves the API; Vite handles the frontend in dev).
- `npm run build` — Vite build + esbuild bundles `server.ts` to `dist/server.cjs`.
- `npm start` — runs the built server (`node dist/server.cjs`).
- `npm run lint` — `tsc --noEmit`.
- `npm test` — Vitest unit tests (`*.test.ts`, e.g. `parser.test.ts`). `npm run test:e2e` runs the
  Playwright suite in `e2e/` (`*.spec.ts`) against the Electron build; the two are kept apart by suffix.
- A `husky` pre-commit hook runs `lint-staged` (config in `lint-staged.config.js`), which runs
  `tsc --noEmit` over the whole project whenever a staged `.ts`/`.tsx` file is present — blocking
  the commit on type errors. Skip it exceptionally with `git commit --no-verify` (see README).
- `npm run electron:start` / `electron:build` — desktop packaging via electron-builder.

## Dependencies (US-13 — `npm audit` at 0)

Full record in [`docs/US-13-npm-audit.md`](docs/US-13-npm-audit.md). Keep these or audit regresses:

- `xlsx` comes from the **SheetJS CDN** (`https://cdn.sheetjs.com/xlsx-0.20.3/...tgz`), not npm —
  npm's last `xlsx` (0.18.5) is vulnerable with no fix. Never `npm i xlsx`; upgrade via the CDN URL.
- Electron 44 / electron-builder 26. electron-builder 26 drops anything listed in `devDependencies`
  from `app.asar`, so runtime deps (e.g. `vite`, imported by `server.ts`) must be **only** in
  `dependencies` — a duplicate in `devDependencies` breaks the packaged app at startup.
- npm ≥ 11 blocks dependency install scripts unless listed in `package.json` → `allowScripts`.
  After a bump, run `npm install-scripts ls` and approve the new versions (esbuild needs it).

## Architecture

- **Persistence is server-side**, not browser localStorage: `db.ts` uses `lowdb` (`JSONFilePreset`)
  against a single JSON file (`honeycomb-data.json` by default, path overridable via
  `HONEYCOMB_DB_PATH`). It stores `{ attendees, records, notes, imports }` (`imports` = US-26
  `.csv` fingerprints). `lowdb` is loaded via a lazy
  dynamic `import()` — see the comment in `db.ts` for why (Electron's bundled Node breaks on a
  static ESM-in-CJS `require`).
- **Graceful shutdown (US-15)**: `server.ts` exports `shutdown()` (also wired to `SIGTERM`/`SIGINT`):
  stops accepting connections, waits for in-flight requests, then awaits `db.flush()` (pending
  `lowdb` writes tracked in `db.ts`) and force-closes any remaining connections, capped at 5s.
  Don't make completion wait on `server.close()`'s callback — Chromium's preconnected sockets
  keep it pending and every Electron close would end by timeout (covered by `e2e/shutdown.spec.ts`).
  `electron/main.js` calls it from `before-quit` (7s cap). `SIGKILL` / Task Manager "End task" / `taskkill /F` can't be intercepted — those are
  **not** covered, so an abrupt kill can still lose the write in flight.
- Mock/seed data (`src/mockData.ts`) seeds the DB on first run, filtered through `isInvalidName`
  (`src/utils.ts`) to strip configured host/facilitator names.
- `server.ts` exposes the Express API; the "Smart Doc Parser" (Import Forage Logs tab) is a
  deterministic offline parser in `parser.ts` — no external AI/LLM call and no API key involved.
  It reuses `isInvalidName` from `src/utils.ts` (same host/facilitator exclusion `db.ts` uses for
  seed filtering) plus its own parser-local heuristics for dates, activities, statuses, and
  meeting metadata. `.csv` files take their own path, `parseCsvAttendance` (US-18): it never falls
  back to the reference date, and returns `dateDetected: false` so the UI requires a date. It also
  drops attendees under 10 minutes when the file has a duration column (US-25, summed per table
  section, max across sections so Teams' two tables aren't double counted).
- **CSV batches (US-27)**: `POST /api/parse-attendance-batch` parses 1–20 `.csv` of one activity
  and rejects the whole batch (too many files, non-.csv, or a file declaring another activity);
  identical files come back as `duplicateOf`. The confirmed batch is one `POST /api/records/import`,
  and `importParsedData` rolls back in-memory state if the write fails — all or nothing.
- **Duplicate `.csv` across imports (US-26)**: every imported `.csv` leaves a fingerprint in
  `imports` (SHA-256, filename, activity, date, attendee count + names, `importedAt`), saved in the
  same `POST /api/records/import` write (that's the fingerprint route — `requireAdmin` +
  `importFingerprintSchema`). `findPreviousImport` (`db.ts`) flags a file whose hash matches, or
  whose activity + date + filtered attendee set match a stored fingerprint. The parse routes return
  it as `alreadyImported` (no records); the import route re-checks (409) because the date may be
  picked by the user. Records joining an existing date+activity event skip colleagues already in
  it. `POST /api/reset` clears `imports`.
- Frontend state lives in `src/App.tsx`, which owns the handlers (`handleAddAttendee`,
  `handleSaveRecords`, `handleImportParsedData`, `handleResetDatabase`, etc.) that `db.ts`'s
  functions mirror 1:1 — check the "Mirrors handleX" comments in `db.ts` when changing either side.
- Components (`src/components/`): `AttendanceLogger`, `AttendeeDirectory`, `CrossReferenceHub`,
  `DashboardStats`, `DocumentParser`, `ProgressReportModal`, `SettingsPanel` (Admin Access only)
  — map roughly 1:1 to the tabs in the doc (Manual Check-In, Caserits & Progress, Overlap
  Cross-Referencer, Dashboard, Import Forage Logs, Progress Report modal).
- **Content-Security-Policy (US-14)**: the strict production CSP lives in `index.html`; in dev,
  `cspDevServerPlugin` (`vite.config.ts`) swaps in a relaxed one (inline script for React Fast
  Refresh, HMR websocket). Any new external origin (CDN, fonts, images) must be added to **both**.
  Dev HMR is only allowed via `localhost` / `127.0.0.1` — with `HONEYCOMB_ALLOW_LAN=true` and a LAN
  IP the page loads but HMR is CSP-blocked (reload manually). Electron's `webPreferences`
  (`contextIsolation`, `nodeIntegration: false`, `sandbox`) are set explicitly in `electron/main.js`.

## Security: server bind & admin auth (US-11)

Don't revert either of these — they protect coaching notes and stop LAN devices from resetting the DB.

- **Bind**: `server.ts` listens on `127.0.0.1` by default. `HONEYCOMB_ALLOW_LAN=true` opts into
  `0.0.0.0` and logs a `[WARNING]` at startup. Never hardcode `0.0.0.0` in `app.listen`.
- **Admin auth**: a single admin password. Source, in priority order: `HONEYCOMB_ADMIN_PASSWORD`
  env var, then `adminPasswordHash` (scrypt) in `honeycomb-config.json`. If neither exists,
  Settings → **Admin Access** offers first-run setup (`POST /api/auth/setup`), accepted only from
  loopback and only while no credential exists. Never hardcode a password.
- Sessions: random token held in memory (lost on server restart), cookie `honeycomb_session`
  (`HttpOnly; SameSite=Strict`), 12h TTL. Endpoints: `GET /api/auth/status`,
  `POST /api/auth/login|logout|setup`.
- **Every mutating route uses the `requireAdmin` middleware** (401 JSON without a session):
  `POST /api/attendees`, `PUT /api/attendees/:id/enrollment`,
  `DELETE /api/attendees/:id`, `POST /api/records`, `POST /api/records/manual`, `POST /api/records/import`,
  `PUT /api/notes/:attendeeId`, `POST /api/reset`. Any new mutating route must add it too.
  `GET`s, `/api/parse-attendance-file` and `/api/parse-attendance-batch` (don't persist) stay public.
- **Input validation (US-10)**: every mutating route with a body also runs
  `validateBody(<zod schema>)` from `validation.ts` after `requireAdmin` → 400
  `{ error, details }` before anything reaches `db.ts`. Schemas mirror `src/types.ts`; keep them in
  sync, and give any new mutating route with a body its own schema.
- Frontend: `App.tsx` holds `auth` (from `/api/auth/status`) and passes `canEdit` to the tabs,
  which disable mutating controls and show `ReadOnlyNotice`. Mutations go through `persist()`,
  which on a 401 drops to read-only and reloads server state to undo the optimistic update.

## Business rules to keep in mind

- 4 fixed activities: **Speakeasy** (weekly), **Reading Club**, **Music Room**, **Writing Hood**
  (all biweekly).
- System reference date is fixed at **June 24, 2026** — dashboards/charts and default session dates
  key off this, not the real current date.
- Hive Status engagement tiers by attendance rate: Dormant (0–25%), Hatcher (26–50%),
  Forager (51–75%), Busy Bee (76–100%).
- Import flow (see [`US-03 Importar Registros de Asisten.txt`](../US-03%20Importar%20Registros%20de%20Asisten.txt)
  for the full user story/QA scenarios): accepts `.xlsx .xls .docx .doc .txt .csv`; strips
  meeting metadata and configured host names; normalizes valid names to Title Case; lets the user
  edit/bulk-apply dates and delete rows before confirming; matches names against the existing
  directory to distinguish new vs. existing colleagues.
- Removing a colleague cascades: deletes their attendance records and coaching notes too
  (`removeAttendee` in `db.ts`).

## Guardrails de Claude Code

`.claude/settings.json` define una allow/deny list de comandos (`Bash(...)` y sus equivalentes
`PowerShell(...)` — las reglas `Bash` no aplican a la tool `PowerShell`) y dos hooks `PreToolUse`:
`guard-writes.cjs` (Edit/Write/NotebookEdit) pide confirmación antes de escribir fuera del árbol del
proyecto o sobre `honeycomb-data.json`/`honeycomb-config.json` (sin distinguir mayúsculas en
Windows/macOS); `guard-bash.cjs` (Bash y PowerShell) bloquea de forma dura `rm -rf`,
`Remove-Item -Recurse -Force` (y alias/prefijos), `git reset --hard`, `git clean -f*` y los push
forzados en cualquier statement del comando — también tras saltos de línea, wrappers (`sudo`, `env`,
`xargs`, `find -exec`) y shells anidados (`bash -c`, `pwsh -Command`, `$(...)`). Tests:
`node --test .claude/hooks/*.test.cjs` (correrlos al tocar un hook). Ver
[`.claude/README.md`](.claude/README.md) para el detalle de cada regla, sus límites y por qué existe
(US-07).
