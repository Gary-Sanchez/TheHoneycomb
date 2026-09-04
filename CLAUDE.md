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
- `npm run lint` — `tsc --noEmit`. No test suite currently exists.
- `npm run electron:start` / `electron:build` — desktop packaging via electron-builder.
- Requires `GEMINI_API_KEY` in `.env.local` (see `.env.example`) for the AI-powered document parser.

## Architecture

- **Persistence is server-side**, not browser localStorage: `db.ts` uses `lowdb` (`JSONFilePreset`)
  against a single JSON file (`honeycomb-data.json` by default, path overridable via
  `HONEYCOMB_DB_PATH`). It stores `{ attendees, records, notes }`. `lowdb` is loaded via a lazy
  dynamic `import()` — see the comment in `db.ts` for why (Electron's bundled Node breaks on a
  static ESM-in-CJS `require`).
- Mock/seed data (`src/mockData.ts`) seeds the DB on first run, filtered through `isInvalidName`
  (`src/utils.ts`) to strip configured host/facilitator names.
- `server.ts` exposes the Express API and calls Gemini for the "Smart Doc Parser" (Import Forage
  Logs tab); when Gemini is unavailable it falls back to a deterministic offline parser so imports
  never block on API availability.
- Frontend state lives in `src/App.tsx`, which owns the handlers (`handleAddAttendee`,
  `handleSaveRecords`, `handleImportParsedData`, `handleResetDatabase`, etc.) that `db.ts`'s
  functions mirror 1:1 — check the "Mirrors handleX" comments in `db.ts` when changing either side.
- Components (`src/components/`): `AttendanceLogger`, `AttendeeDirectory`, `CrossReferenceHub`,
  `DashboardStats`, `DocumentParser`, `ProgressReportModal`, `SettingsPanel` — map roughly 1:1 to
  the tabs in the doc (Manual Check-In, Caserits & Progress, Overlap Cross-Referencer, Dashboard,
  Import Forage Logs, Progress Report modal).

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
