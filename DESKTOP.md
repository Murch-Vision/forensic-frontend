# Desktop app (Tauri) — Forensic Analyst Workstation

The same React/GraphQL frontend ships **two ways**:

- **Web** — `pnpm dev` / `pnpm build`, unchanged. The browser talks to a hosted
  `forensic-api`.
- **Desktop** — a [Tauri 2](https://tauri.app) app that bundles the Node/GraphQL
  API as a **sidecar** and runs everything **locally and offline**. The SQLite
  database lives in a per-user app-data directory; no forensic data leaves the
  machine.

## Architecture

```
┌─ Tauri window (native webview) ───────────────────────────────┐
│  React UI (bundled dist/)                                      │
│        │  GraphQL → http://localhost:<port>   (port injected   │
│        ▼                                        as window.__API_PORT__)
│  ┌─ sidecar: forensic-node server.cjs ─────────────────────┐   │
│  │  Apollo standalone + knex + better-sqlite3 (native)     │   │
│  │  DB_FILE   → <app-data>/forensic.sqlite                 │   │
│  │  DATA_DIR  → <app-data>/   (settings, telemetry, …)     │   │
│  │  ASSETS_DIR→ bundled resources (CSVs, sanctions sample) │   │
│  └────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

On first launch the Rust shell (`src-tauri/src/lib.rs`):
1. picks a free localhost port,
2. copies the bundled **schema-only `template.sqlite`** into the app-data dir
   (so we never run knex `.ts` migrations from a packed binary),
3. spawns `forensic-node server.cjs` with the env vars above and waits for it,
4. opens the window, injecting `window.__API_PORT__` so Apollo
   (`src/apollo.ts`) targets the local API.

In **dev** (`tauri dev`, a debug build) the sidecar is skipped — the UI talks to
the normal dev API exactly like the browser does.

### Where the sidecar comes from

`forensic-api` is packaged by `forensic-api/desktop/build-sidecar.mjs` into
`forensic-api/desktop/dist/`:

| file | what |
|------|------|
| `server.cjs` | the whole API bundled to one CommonJS file (esbuild) |
| `node_modules/better-sqlite3` (+ `bindings`, `file-uri-to-path`) | the native addon, kept unbundled so its `.node` loads from a real path |
| `assets/` | small read-only assets (localization CSVs + 2 KB sanctions sample) |
| `template.sqlite` | schema-only DB, copied to app-data on first run |

`scripts/prepare-sidecar.mjs` (here) builds that payload, copies it into
`src-tauri/sidecar/`, and stages a matching **`node` runtime** into
`src-tauri/binaries/forensic-node-<target-triple>` — which is what Tauri's
`externalBin` bundles.

> Native modules and the `node` runtime are **platform-specific**, so the
> sidecar must be built **on the OS you're shipping for**. That's why CI builds
> each installer on its own runner; you can't cross-compile a Windows installer
> from macOS.

## Prerequisites (one-time, local)

1. **Rust** — https://rustup.rs (`rustc`, `cargo` on PATH).
2. **Tauri OS deps** — macOS: Xcode CLT (`xcode-select --install`). Windows:
   WebView2 (preinstalled on Win 10/11) + MSVC Build Tools. See
   https://tauri.app/start/prerequisites/.
3. **App icons** — generate them once from a square PNG (≥ 1024×1024):
   ```
   pnpm tauri icon path/to/logo.png
   ```
   This writes the files referenced by `src-tauri/tauri.conf.json > bundle.icon`.
   Commit them. (Build fails without icons.)
4. **API location** — by default the scripts expect `../forensic-api` as a
   sibling. Override with `FORENSIC_API_DIR=/path/to/forensic-api`.

## Commands (run from `forensic-frontend/`)

| command | what it does |
|---------|--------------|
| `pnpm dev` | web dev server (unchanged) |
| `pnpm build` | web production build (unchanged) |
| `pnpm desktop` | desktop dev: stages the sidecar, then `tauri dev` (native window + HMR, talks to the dev API) |
| `pnpm build:mac` | macOS `.app` + `.dmg` (run on macOS) |
| `pnpm build:windows` | Windows NSIS + MSI installers (run on Windows) |
| `pnpm build:linux` | Linux `.deb` + AppImage (run on Linux) |

Each `build:*` runs `desktop:prepare` first. Installers land in
`src-tauri/target/release/bundle/`.

> You develop on macOS, so `pnpm build:mac` works locally. For Windows installers
> use CI (below) or a Windows machine — `build:windows` only produces a `.exe`
> when run **on Windows**.

## CI — `.github/workflows/desktop-release.yml`

Matrix build on `windows-latest` + `macos-latest`. Each runner builds the API
sidecar natively, runs `tauri build`, and uploads installers to a **draft GitHub
Release**.

- **Trigger:** push a tag `vX.Y.Z`, or run the workflow manually.
- **Repo layout:** the workflow assumes `forensic-api` is a **separate repo** and
  checks it out alongside this one (override owner/ref via the manual-run inputs;
  add a PAT for a private api repo). **Monorepo?** delete the *Checkout
  forensic-api* step and set `FORENSIC_API_DIR` to its in-repo path.
- **Code signing** is optional and off by default (installers still run, with an
  "unidentified developer"/SmartScreen warning). Uncomment the signing `env:`
  block and add the secrets to enable macOS notarization / Windows signing.

## Data & the sanctions dataset

- **User data** lives in the OS app-data dir (`mn.forensic.analyst`):
  macOS `~/Library/Application Support/mn.forensic.analyst/`,
  Windows `%APPDATA%\mn.forensic.analyst\`. Deleting it resets the app.
- The full **OpenSanctions dataset (~345 MB) is NOT bundled.** The app ships only
  the 2 KB sample; the in-app *sanctions refresh* downloads the full set
  (`SANCTIONS_URL`) into the data dir on demand. This keeps the installer small.

## What's verified vs. what you must run

✅ **Verified in this environment (Linux):** the API patches, and the packaged
sidecar end-to-end — `server.cjs` boots, the native `better-sqlite3` loads from
the staged `node_modules`, a real `dashboardStats` query returns from the
template DB, and bundled assets resolve via `ASSETS_DIR`. The web app is
unchanged (still loads data).

⏳ **Run on your Mac / in CI** (no Rust or GUI in the build sandbox, so these
couldn't be exercised here):
1. `pnpm tauri icon <logo.png>` — generate icons.
2. `pnpm desktop` — first Rust compile + native window. This is where any Tauri
   API/capability tweak would surface (most likely candidates: the
   `shell:allow-spawn` scope in `src-tauri/capabilities/default.json` and the
   `resource_dir()`/`app_data_dir()` calls in `lib.rs`).
3. `pnpm build:mac` — produce a local `.dmg` and click through it.
4. Push a `v*` tag → confirm the Windows + macOS installers appear on the draft
   Release.
