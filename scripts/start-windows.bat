@echo off
REM ============================================================
REM  Forensic Analyst — Frontend launcher (Windows / cmd)
REM  Started automatically at boot by the registered Scheduled
REM  Task (see install-startup-windows.bat). Can also be run
REM  manually by double-clicking.
REM
REM  Uses npm (not pnpm) so it works from the SYSTEM account at
REM  boot.
REM ============================================================

setlocal

REM Move to the project root (this script lives in <root>\scripts).
cd /d "%~dp0.."

REM Install dependencies on first run / after an update.
if not exist "node_modules" (
    echo [start-windows] Installing dependencies...
    call npm install
)

echo [start-windows] Starting frontend dev server...
call npm run dev

endlocal
