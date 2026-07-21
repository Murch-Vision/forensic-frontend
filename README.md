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

Everything needed lives in [`scripts/`](scripts/):

| Script | Purpose |
| --- | --- |
| `start-windows.bat` | Launcher — installs deps and starts the dev server. |
| `install-startup-windows.ps1` | Registers a Scheduled Task that runs the launcher **at boot**. |
| `uninstall-startup-windows.ps1` | Removes that task. |
| `self-update.bat` | `git pull` + restart the Scheduled Task. |

### Install (run once)

Open **PowerShell as Administrator** in the project root and run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-startup-windows.ps1
```

This creates a Scheduled Task named **`ForensicAnalystFrontend`** that launches the
frontend on every system boot (runs as `SYSTEM`, auto-restarts on failure).

Handy variants:

```powershell
# Start at user logon instead of at system boot
powershell -ExecutionPolicy Bypass -File scripts\install-startup-windows.ps1 -AtLogon

# Start it now without rebooting
Start-ScheduledTask -TaskName ForensicAnalystFrontend

# Remove it
powershell -ExecutionPolicy Bypass -File scripts\uninstall-startup-windows.ps1
```

> If `pnpm` isn't on `PATH`, the launcher falls back to `corepack pnpm`
> automatically.

## Self-update

Run `scripts\self-update.bat` (manually or on a schedule) to pull the latest
code and restart the Scheduled Task. Requires the `origin` remote above.
