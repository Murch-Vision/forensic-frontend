# Forensic Analyst — Frontend

React / TypeScript / GraphQL frontend for the Forensic Analyst Workstation.

**Repository:** https://github.com/Murch-Vision/forensic-frontend

## Requirements

- Node.js 22.12+ (22 LTS) or 24 LTS, x64 for Windows
- [pnpm](https://pnpm.io/) 10 (`npm.cmd install -g pnpm@10.34.7` on Windows)

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

## Windows 11 Pro

See [WINDOWS.md](WINDOWS.md) for installation, repair and log collection.

The `.bat` entry points use built-in Windows PowerShell 5.1. Autostart uses a
Startup-folder `.lnk` that runs PowerShell directly; VBScript is not required.
Installation checks Node.js x64, pnpm 10 and locked dependencies. The backend
checks native SQLite/sharp modules and applies migrations before listening.
A failed install, migration or frontend build stops startup with an error in
`logs\startup.log`; it never announces a failed setup as successful.

| Script in `scripts\` | Purpose |
| --- | --- |
| `start-windows.bat` | Run this checkout and show startup failures. |
| `install-startup-windows.bat` | Prepare this checkout, replace legacy startup entries and start it at login. |
| `uninstall-startup-windows.bat` | Remove this checkout's startup entry; leave the running app alone. |
| `update-all.bat` / `self-update.bat` | Update both sibling checkouts, prepare them, restart those that were running. |

Updates stop only the selected checkout's process tree before replacing native
DLLs. They do not terminate unrelated Node.js programs. Startup builds the frontend
again when its Git commit differs from `dist/.commit`.
