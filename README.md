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

## Windows: start automatically

Autostart is a plain batch file in your **Startup folder**. No Task Scheduler,
no service, no administrator. Everything lives in [`scripts/`](scripts/):

| Script | Purpose |
| --- | --- |
| `start-windows.bat` | Launcher — `npm install` (first run) then `npm run start`, which serves the built app. |
| `install-startup-windows.bat` | Builds the app, then adds the launcher to your Startup folder. |
| `uninstall-startup-windows.bat` | Removes it. |
| `self-update.bat` | `git pull` + `npm install` + rebuild + restart the launcher. |

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
