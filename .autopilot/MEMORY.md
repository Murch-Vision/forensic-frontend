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
- RULE: NEVER use native <select> or <input type="date"> — use `Select` and
  `DateInput` from src/components/inputs.tsx (styled trigger + popover menu /
  calendar; CSS `.select-*`/`.datepicker-*` in app.css, menu z-index 1200).
  Menus render in a document.body PORTAL (position:fixed, flip-aware, close
  on outside/scroll/resize) so overflow:hidden cards can NEVER clip them —
  that clipping once made the import-type dropdown look like only "auto".

## Layout shell (App.tsx)
Sidebar (220px) + right column = `AppHeader` (56px, `--app-header-h`) + main.
`.page-container` is height:100% (NOT 100vh). Any page-level vh math must
subtract `var(--app-header-h)`.
`src/components/AppHeader.tsx` = case SCOPE bar only (user wish): case
switcher (ACTIVE_CASE_QUERY / SET_ACTIVE_CASE), read-only status badge,
breadcrumb `Кейс › <page>` (labels from `src/nav.ts` — single source shared
with the sidebar), "КЕЙС УДИРДАХ →" link. NO mutations besides switching:
create / merge / status changes live on /cases (CasesPage.tsx,
CASE_FILES_QUERY). All pages follow the scope via the shared Apollo cache.

## Routes (post-cleanup)
/cases /dashboard /people /import /transactions /calls /timeline
/linkchart /fraud /reports /settings. REMOVED per user wish (files
deleted): map, analysis (Шинжилгээ), osint, audit, intelboard
(Мэдээллийн самбар), suspects (Хувийн мэдээлэл — merged into /people,
/suspects redirects there). Unknown paths redirect to /dashboard.

## Done
- 2026-07-02: Global case system — AppHeader case switcher on all pages,
  case status (OPEN/ACTIVE/CLOSED/ARCHIVED, api `setCaseStatus` mutation),
  removed 5 pages, per-page case pickers stripped from SuspectsPage.
- 2026-07-02: Import page rework — `.dropzone`/`.file-chip` CSS (app.css),
  drag&drop upload only (textarea removed), account picker removed (api
  auto-resolves/creates the subject's account: importService
  resolveSubjectAccount), message log removed (errors still shown).

- 2026-07-02: TransactionsPage — filter bar (данс/төрөл/туг + date range +
  гүйлгээний утга search, ЦЭВЭРЛЭХ reset; charts+stats follow all but
  type/flag), duplicate analysis cards: top-N давхардсан гүйлгээний утга
  (click row → sets desc filter) and данс↔харьцсан данс duplicated-amount
  pairs. All client-side over TRANSACTIONS_QUERY.

- 2026-07-02: TransactionsPage — "Дуудлагын дараах гүйлгээ" card: per
  filtered txn, same suspect's nearest preceding call within N min
  (5-120 select, default 30), `.correlation-badge tight/close/near`,
  row click → drilldown. Uses CALL_RECORDS_QUERY + suspectId added to
  TRANSACTIONS_QUERY bankAccounts.

- 2026-07-02: Merge cases — AppHeader "КЕЙС НЭГТГЭХ" button (shown when 2+
  cases) opens modal: target select + source checkboxes; api `mergeCases`
  moves evidence (renumbered, deduped) + notes, archives sources, session
  switches to target if it was a source.
- 2026-07-02: Import subject picker removed — rows self-attribute: CDR by
  suspect phone-number suffix match, bank rows by "Данс" column (accounts
  find-or-created, mapping field "account"/"Өөрийн данс"); fallback
  ХУУЛГА-ИМПОРТ bucket. subjectSuspectId now optional API fallback only.
- 2026-07-02: Button consistency sweep — RULE: `.btn-sm` ONLY for row-level
  actions inside tables/grids; toolbars, page/card headers and modal footers
  always full-size `.btn` (one emphasized variant max, plain `.btn` secondary,
  cancel-left/primary-right). Spacing via `.toolbar` gap / new `.modal-actions`
  class (app.css) — NO inline marginRight between buttons. Swept Reports,
  Settings, Suspects, Transactions, AppHeader modals, NetworkGraph.

- 2026-07-02: People database — /people (PeoplePage.tsx), api `globalPeople`
  (peopleService.ts): suspect records union-found into persons by normalized
  name / phone last-8 / nationalId; per person: cases (via SUSPECT evidence
  entries), phones, accounts, txn+call counts, matchedBy chips. Master-detail
  via new `.master-detail`/`.person-row`/`.person-avatar`/`.id-chip` (app.css).
- 2026-07-02: SuspectsPage deleted, merged into PeoplePage (user wish): full
  person management now lives there — create/edit/delete (modal form, photo
  resize→256px JPEG data-URI), + УТАС / + ДАНС inline forms, evidence tagging
  into active case (КЕЙСТ ТЭМДЭГЛЭХ ↔ НОТЛОХ БАРИМТ №N badge), redesigned
  profile card (risk-ringed avatar, InfoField grid, notes callout). Mutations
  from graphql/suspects.ts (CRUD) + queries.ts. Actions target the person's
  PRIMARY (first) record; multi-record persons get per-row ЗАСАХ/УСТГАХ.

- 2026-07-02: Styled Select/DateInput rolled out app-wide (user wish: no
  native selects/datepickers) — 19 selects + 2 date inputs replaced across
  AppHeader, Transactions, Import, Settings, People, Calls, Timeline.
  Import: removed "Хандалтын лог" (ACCESS_LOG) import kind (user wish).

- 2026-07-02: Case hierarchy — new /cases page (CasesPage.tsx): metrics row,
  full case table (status Select per row, priority badge, dates, activate,
  active row highlighted `.case-row-active`), create + merge modals MOVED
  here from AppHeader. AppHeader slimmed to scope bar + breadcrumb
  `Кейс › <page>` (nav.ts = shared path/label/icon meta + STATUS_LABELS/
  STATUS_BADGE). Addresses wishes "don't change case status in app header"
  + "hierarchy for all pages".

- 2026-07-03: Noise-removal suite (GOAL core, user wish) —
  lib/ignoredPairs.ts: FOUR persistent noise marks (localStorage + Apollo
  reactive vars, shared Txns page ↔ Link chart): per-txn ids
  (`forensic.ignoredTxns`), account→cp pairs, desc rules
  (starts/ends/contains), global min-amount floor
  (`forensic.minTxnAmount`). All drop from every count/chart/pair AND the
  connection graph. Txns table = Огноо|Хэнээс|→|Хэнд|Дүн|Утга|Үлдэгдэл|✕Хас
  (sender/receiver derived from credit/debit + account owner). Pair-row
  click drills via cp filter (chip clears it). 🧹 Цэвэрлэх modal =
  removal tools ONLY (floor, pair threshold, desc rule).
- 2026-07-03: On-graph noise removal (GOAL core) — NetworkGraph.tsx gained
  edge interaction: SimLink keeps `orig`, `linkAt()` point-to-segment hit
  test (~6px, skips "owns"), edge hover = highlight + label + pointer,
  `onLinkClick` prop. LinkChartPage: edge click → graph-detail-panel
  (kind, endpoints, totals) with "✕ Энэ холбоосыг хасах" on txn edges →
  removeTxnEdge() marks ALL contributing pairKeys (both directions) via
  ignorePairs — shared store, restorable at /transactions?view=removed.
  Money-floor input lives on the graph card header (badge when active).
- 2026-07-03: Edge-kind visibility chips (GOAL core — kills the purple
  hairball on demand) — LinkChartPage `.graph-filter-bar` above the canvas:
  ToggleChip per evidence kind (txn/call/intel; "owns" structural, never
  toggled) with per-kind edge counts, colors from NetworkGraph's exported
  LINK_STYLE. Hidden kinds persist (`forensic.hiddenEdgeKinds`). Keep-logic:
  flow = VISIBLE txn/call; intel carries its persons ONLY when both flow
  kinds are off (intel-only view ≠ empty graph); all kinds off → dedicated
  "Бүх холбоос нуугдсан" Empty message. ToggleChip gained optional `color`
  prop (kit.tsx) → `.toggle-chip.tinted.on` tints via `--chip-accent` +
  color-mix (app.css) — reuse for any legend-colored filter chip.
- 2026-07-03: Txns page URL state + dedicated restore view — filters ride
  the querystring (acct, cp, type, from, to, q) via useSearchParams
  patchParams; page tabs "Гүйлгээний шинжилгээ" | "↩ Хасагдсаныг сэргээх"
  = `?view=removed`: full-width restore area (stat cards, floor row, desc
  rules / pairs / txns tables, per-row ↩, confirm-gated Бүгдийг сэргээх).
  Restore lives ONLY here (user wish: never in a small modal). "Хамгийн
  томыг үлдээх" button REMOVED (user lost work to it — do not re-add).
  NOTE for screenshots: /transactions?view=removed deep-links the tab.
- 2026-07-02: Link chart = evidence network (GOAL core) —
  lib/networkGraph.ts buildEvidenceNetwork(): suspects + owned accounts/
  phones + txns aggregated per account↔counterparty pair (counterparty
  numbers matched to known accounts → inter-suspect money edges) + calls
  per phone pair (last-8 match; unmatched side falls back to person by
  direction); top-15 externals by volume, hiddenExternal reported.
  NetworkGraph.tsx: node types PERSON/GROUP/ACCOUNT/PHONE/EXTERNAL, edges
  colored by kind (txn green/call cyan/intel purple/owns gray) with hover
  midpoint labels, onNodeClick, golden-angle spawn + zero-distance repulsion
  fix (nodes used to stack at one point forever). LinkChartPage: click →
  floating detail panel (.graph-detail-*), hidden-externals note.

- 2026-07-02: New-wish batch — Select/DateInput menus portal'd to body
  (fixes: import type "only auto" + cases status dropdown clipped/unusable);
  dashboard first in NAV (landing unchanged: / → /dashboard); link chart
  reduced to case entities only per user wish (NetworkNodeType now
  PERSON|ACCOUNT|PHONE — org hubs + external counterparty/phone nodes
  REMOVED, edges only between known entities; hiddenExternal gone).

- 2026-07-02: sidebar brand bar = var(--app-header-h) (56px, matches app
  header); NetworkGraph zoomAt() must include fitRef letterbox offX/offY —
  screen = graph·(fit·k) + t + off, the offset does NOT cancel between zooms.

- 2026-07-02: CASE SCOPING made real — api evidence list queries (suspects/
  bankAccounts/transactions/callRecords/suspectLinks/correlations) now return
  ONLY the active case's records (membership = SUSPECT evidence entries; no
  case = all data). AppHeader case switch calls client.resetStore() so every
  open page refetches. New `CaseScopeBar` (components/CaseScopeBar.tsx,
  `.scope-bar*` css) under PageHeader on Transactions/Calls/Timeline/
  LinkChart: cyan strip = case id+name+counts. Dashboard stats remain global.
- 2026-07-03: HIERARCHY GATE (user wish: "clear hierarchy, no all-case
  noise") — data pages show NO data without an active case. New `CaseGate`
  (components/CaseGate.tsx, `.case-gate*` css) wraps everything below
  PageHeader on Transactions/Calls/Timeline/LinkChart (in BOTH the loading
  and main returns): no case → panel with Кейс → Өгөгдөл explanation, case
  Select (sets case + resetStore) and КЕЙС УДИРДАХ link. CaseScopeBar's
  amber "Бүх кейс" variant removed (renders null without a case).

## Ignore per user (do not touch/improve)
Settings page, Залилангийн урсгал (fraud) page.

- 2026-07-02: Хүмүүсийн сан redesigned — NO metric-card rows anymore (page
  stats folded into `.people-panel-stats` line under the list search; person
  counts = `.stat-strip` inside the profile card). Left list = `.people-panel`
  (sticky, `.person-list` scroll area). Profile: `.person-avatar.xl` (80px),
  suspectId `.id-chip`, MN risk labels (RISK_LABELS map). Add/edit modal now
  uses the standard modal-header/body/footer chrome + `.avatar-upload` round
  photo drop-well (+`.avatar-remove`), `.form-section-label` hairline section
  titles, `.form-grid-2` (collapses <640px), Хүйс + Хот fields added.

- 2026-07-02: drilldown breadcrumb — lib/drilldown.ts (`drilldownVar`
  reactive var + `useDrilldown(label)` hook, clears on unmount). AppHeader
  renders `Кейс › Хуудас › <entity>` (`.app-header-drill`, cyan). Wired:
  People (person on display), Calls + Timeline (suspect filter), LinkChart
  (selected node). Call the hook BEFORE loading early-returns.

- 2026-07-02: Timeline polish (last backlog item) — page retitled to its nav
  name "Он цагийн хэлхээ", 4 StatCards (events/txns/calls/correlations),
  filter card with new shared `ToggleChip` (kit.tsx, `.toggle-chip*` css —
  RULE: use it instead of native checkboxes in toolbars), event rows get
  TYPE_META colored inset rail + MN badges. Fraud page untouched per user.

- 2026-07-03: Cases page clarity (user wish) — scope action renamed to match
  the gate language: СОНГОХ btn / СОНГОГДСОН `.badge.accent` (was the
  confusing ИДЭВХЖҮҮЛЭХ, which collided with the Идэвхтэй STATUS), actions
  under a labeled Үйлдэл column with a per-row ЗАСАХ button → edit modal
  (name/description/priority/investigator, api updateCaseFile). Мөрдөгч
  column added, Хаагдсан column dropped (status implies it). NOTE: the
  "Болд Батбаярын удирдсан санхүүгийн сүлжээ." text the user asked about is
  CASE-0001's seeded demo description — now editable via ЗАСАХ.

- 2026-07-03: Header case UX (user wish) — cases table СОНГОХ/СОНГОГДСОН
  REMOVED as redundant (scope switching lives ONLY in the AppHeader dropdown;
  row highlight still marks the selected case; Үйлдэл = ЗАСАХ only). AppHeader
  gained a case STATUS filter Select (Бүх төлөв/…, persisted in localStorage
  "caseStatusFilter"; active case always kept in options; hidden <900px).
- 2026-07-03: plotly console spam fixed — kit Heatmap now uses NUMERIC y +
  tickvals/ticktext (NOT category labels): category c2p returned NaN during
  the first strict-mode mount → "<image> attribute height: NaN" errors on
  dashboard + calls. zmin/zmax also pinned. RULE: heatmaps get numeric axes
  with labeled ticks.

- 2026-07-03: import-works batch (user wishes) — CaseScopeBar DELETED
  (component + css; redundant with the header; CaseGate stays), header case
  filter now STRICT (menu only matching cases; new Select `triggerLabel`
  prop keeps the current case named on the trigger), ImportPage: preview
  runs AUTOMATICALLY on file/sheet pick (button removed), AUTO kind removed
  (Банк/CDR only; detected domain auto-selects the kind), SettingsPage
  stripped to a title-only placeholder (nuke button + CLEAR_ALL_DATA gone),
  apollo.ts typePolicies replace-merge root list fields (silences "cache
  data may be lost" warnings).

- 2026-07-03 (co-authored with the OWNER's uncommitted working-tree code —
  check `git status` before any reset!): TransactionsPage shows Валют column
  (mono, MNT default), Категори/Суваг/Төлөв columns + Туг filter REMOVED
  (never-imported noise), CasesPage resetStore after CLOSED/ARCHIVED status
  change (api unselects the working case).

## Backlog (user wishes, in priority order)
(empty — all user wishes shipped; FIXED BACKLOG fully done 2026-07-02)

## Parked (NOT in this run's backlog)
- Import doesn't tag suspects into the active case → freshly imported data
  stays hidden under a scoped case until the person is tagged. Candidate:
  auto-tag import-touched suspects into the active case (api importService).
