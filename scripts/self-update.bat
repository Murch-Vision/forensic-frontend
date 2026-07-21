@echo off
REM ============================================================
REM  Forensic Analyst — Frontend self-update (Windows)
REM
REM  Pulls the latest code from git; if new commits arrived it
REM  reinstalls dependencies, rebuilds and restarts the running
REM  launcher. No-op when already up to date.
REM
REM  Run manually (double-click) whenever you want the latest code.
REM ============================================================

setlocal enabledelayedexpansion

cd /d "%~dp0.."

set "NAME=ForensicAnalystFrontend"

REM Remember the current commit, pull, then compare.
for /f %%i in ('git rev-parse HEAD') do set "BEFORE=%%i"
echo [self-update] Pulling latest code...
git pull --ff-only
for /f %%i in ('git rev-parse HEAD') do set "AFTER=%%i"

if "!BEFORE!"=="!AFTER!" (
    echo [self-update] Already up to date — nothing to restart.
    goto :eof
)

echo [self-update] New version pulled (!BEFORE:~0,7! -^> !AFTER:~0,7!).
echo [self-update] Reinstalling dependencies...
call npm install

REM Rebuild here rather than at boot — the task only serves dist\.
echo [self-update] Rebuilding...
call npm run build
if !errorlevel! neq 0 echo [self-update] WARNING: build failed, serving the OLD build.

REM Close the running launcher window (titled by the installer shim) and start
REM it again on the new build.
echo [self-update] Restarting '%NAME%'...
taskkill /FI "WINDOWTITLE eq %NAME%*" /T /F >nul 2>&1
start "%NAME%" /min cmd /c "%~dp0start-windows.bat"
echo [self-update] Done.

endlocal
