# Forensic Analyst — Frontend

React / TypeScript / GraphQL frontend for the Forensic Analyst Workstation.

**Repository:** https://github.com/Murch-Vision/forensic-frontend

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/) (`corepack enable` provides it)

## Setup

```bash
pnpm install
pnpm dev          # Vite dev server
pnpm build        # type-check + production build
```

The dev server talks to the backend API — see
[`forensic-api`](https://github.com/Murch-Vision/forensic-api).

## Pointing at the API

`API_URL` says where the backend is. Copy [`env.example`](env.example) to
`.env` next to `package.json` and edit it, or set it in the environment:

```bash
API_URL=http://localhost:4000        # backend on this machine (the default)
API_URL=http://192.168.1.50:4000     # backend on another machine
```

| Variable | Purpose |
| --- | --- |
| `API_URL` / `VITE_API_URL` | API host. Unset ⇒ `http://localhost:4000`. |
| `VITE_GRAPHQL_URL` | Full endpoint override, if GraphQL is not at the host root. |

> It is read at **build** time, so re-run `npm run build` (or `self-update.bat`,
> which rebuilds) after changing it.
>
> When it is unset the app calls same-origin `/graphql` and the dev/preview
> server proxies that to `API_URL`, so the built files stay portable. Nothing
> falls back to a hardcoded remote host: an install with no configuration talks
> to its own machine, never to someone else's server.

## Windows: start automatically

Autostart is a plain batch file in your **Startup folder**. No Task Scheduler,
no service, no administrator. Everything lives in [`scripts/`](scripts/):

| Script | Purpose |
| --- | --- |
| `start-windows.bat` | Launcher — `npm install` (first run) then `npm run start`, which serves the built app. |
| `install-startup-windows.bat` | Builds the app, then adds the launcher to your Startup folder. |
| `uninstall-startup-windows.bat` | Removes it. |
| `self-update.bat` | `git pull` + `npm install` + rebuild + restart the launcher. |
| `update-all.bat` | Updates **both** repos — pull, install, build, restart whatever was running. |

### Install (run once)

**Double-click** `scripts\install-startup-windows.bat`. That is the whole
install. It builds the app (~30s), writes `ForensicAnalystFrontend.bat` into

```
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
```

and starts it straight away so you can see it work.

To remove it later, double-click `scripts\uninstall-startup-windows.bat`.

> **It starts when you log in, not at boot.** That is the deliberate trade-off:
> it runs as *you*, with *your* `PATH`, in *your* session — the same environment
> where starting it by hand already works. A boot-time Scheduled Task runs as
> `SYSTEM`, which cannot see a per-user Node install, is blocked by the default
> laptop battery policy, and is killed after 3 days. That is why the old task
> reported success and then did nothing. If nobody logs in, nothing runs.
>
> The build happens at install and on self-update, never at startup — `npm run
> start` only serves `dist\`, so logging in is not delayed by a build.
>
> If the app does not come up, read `logs\startup.log` — the launcher records
> every step there, including exactly where it failed.

## Self-update

Run `scripts\self-update.bat` (manually or on a schedule) to pull the latest
code, rebuild, and restart the launcher. Requires the `origin` remote above.
