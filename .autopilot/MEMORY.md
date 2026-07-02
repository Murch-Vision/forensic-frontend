# Autopilot Memory — forensic-frontend

## Project
Mongolian-language forensic intelligence platform ("Forensic Analyst").
React 18 + TS + Vite + Apollo (GraphQL) frontend; sibling repo
`/mnt/forensic-api` (Apollo Server + Knex/SQLite, `tsx watch`, hot-reloads).
Frontend dev server + API are ALREADY running (see RC_PREVIEW_* env vars).
Package manager: pnpm. Branch scheme: autopilot/<date>; never push.

## Baseline (recorded 2026-07-02)
- frontend: `pnpm build` = `tsc --noEmit && vite build` — PASSES, 0 errors.
- api: `pnpm build` = `tsc --noEmit` — PASSES, 0 errors.
- No test suites exist in either repo.

## Design Bible (established theme — do NOT invent new tokens)
IBM i2-inspired dark forensic workstation. All tokens in `src/styles/app.css`:
- Palette: bg #050510→#0F1125 layers, hairline borders `--border-primary`
  #1A1A3E; ONE confident accent `--accent-cyan` #00E5FF (+ semantic
  green/red/amber/purple for risk/status only).
- Type: Segoe UI; mono (`--font-mono`) for labels/ids, 10-11px uppercase
  letter-spaced section labels; page-title 20px+.
- Depth: `--shadow`/`--shadow-sm`, radius 8/4/12. Transitions `--transition`.
- Components: `.card`, `.btn btn-{primary,accent,success,sm}`, `.form-input`,
  `.badge {low,medium,high,critical,info,warning,unknown}`, `.data-grid`,
  `.modal-overlay/.modal-content`, `.page-container`, `.page-header`,
  `.toolbar`, `.metrics-grid`/`.metric-card`. Kit: `src/components/kit.tsx`
  (PageHeader, Card, StatCard, DataTable, Empty, Loading, charts via Plotly).

## Layout shell (App.tsx)
Sidebar (220px) + right column = `AppHeader` (56px, `--app-header-h`) + main.
`.page-container` is height:100% (NOT 100vh). Any page-level vh math must
subtract `var(--app-header-h)`.
`src/components/AppHeader.tsx` = GLOBAL case session bar on every page:
case switcher (ACTIVE_CASE_QUERY / SET_ACTIVE_CASE), status badge + status
select (SET_CASE_STATUS → api mutation `setCaseStatus`), "+ ШИНЭ КЕЙС" modal
(CREATE_CASE_FILE). All pages follow it via the shared Apollo cache entry.

## Routes (post-cleanup)
/dashboard /suspects /import /transactions /calls /timeline /linkchart
/fraud /reports /settings. REMOVED per user wish (files deleted): map,
analysis (Шинжилгээ), osint, audit, intelboard (Мэдээллийн самбар).
Unknown paths redirect to /dashboard.

## Done
- 2026-07-02: Global case system — AppHeader case switcher on all pages,
  case status (OPEN/ACTIVE/CLOSED/ARCHIVED, api `setCaseStatus` mutation),
  removed 5 pages, per-page case pickers stripped from SuspectsPage.
- 2026-07-02: Import page rework — `.dropzone`/`.file-chip` CSS (app.css),
  drag&drop upload only (textarea removed), account picker removed (api
  auto-resolves/creates the subject's account: importService
  resolveSubjectAccount), message log removed (errors still shown).

## Backlog (user wishes, in priority order)
1. Bank transaction page filters: date range, гүйлгээний утга filter,
   top-N duplicated гүйлгээний утга analysis.
2. Duplicated-transaction counts between accounts.
3. Call→transaction correlation filter (transactions within N min after call).
4. UI consistency sweep: uniform button sizes in every toolbar.
5. Merge cases feature.
6. Global people database (person appears across cases → full profile).
7. Hierarchy for all pages (case → suspect → …).
