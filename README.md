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

## Windows: start automatically at boot

The launcher uses **`npm`** (not pnpm) and runs from the **Command Prompt**, so
it works reliably from the `SYSTEM` account at boot. Everything lives in
[`scripts/`](scripts/):

| Script | Purpose |
| --- | --- |
| `start-windows.bat` | Launcher — `npm install` (first run) then `npm run dev`. |
| `install-startup-windows.bat` | Registers the boot Scheduled Task (uses `schtasks`, no PowerShell). |
| `uninstall-startup-windows.bat` | Removes that task. |
| `self-update.bat` | `git pull` + `npm install` + restart the Scheduled Task. |

### Install (run once) — Command Prompt

Open **Command Prompt as Administrator** (right-click → *Run as administrator*),
`cd` to the project root, and run:

```bat
scripts\install-startup-windows.bat
```

This creates a Scheduled Task named **`ForensicAnalystFrontend`** that runs
`start-windows.bat` on every system boot as `SYSTEM` (elevated).

Handy commands:

```bat
schtasks /Run    /TN "ForensicAnalystFrontend"   &  :: start it now, no reboot
schtasks /End    /TN "ForensicAnalystFrontend"   &  :: stop it
scripts\uninstall-startup-windows.bat            &  :: remove it
```

> Requires Node.js (which provides `npm`) on the system `PATH`. PowerShell
> installers (`install-startup-windows.ps1`) are still included as an alternative.

## Self-update

Run `scripts\self-update.bat` (manually or on a schedule) to pull the latest
code and restart the Scheduled Task. Requires the `origin` remote above.
