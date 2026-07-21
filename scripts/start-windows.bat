@echo off
REM ============================================================
REM  Forensic Analyst — Frontend launcher (Windows)
REM  Started automatically at boot by the registered Scheduled
REM  Task (see install-startup-windows.ps1). Can also be run
REM  manually by double-clicking.
REM ============================================================

setlocal

REM Move to the project root (this script lives in <root>\scripts).
cd /d "%~dp0.."

REM Locate pnpm; fall back to "corepack pnpm" if not on PATH.
where pnpm >nul 2>&1
if %errorlevel%==0 (
    set "PNPM=pnpm"
) else (
    set "PNPM=corepack pnpm"
)

REM Install dependencies on first run / after an update.
if not exist "node_modules" (
    echo [start-windows] Installing dependencies...
    call %PNPM% install --frozen-lockfile
)

echo [start-windows] Starting frontend dev server...
call %PNPM% dev

endlocal
