@echo off
REM ============================================================
REM  Forensic Analyst — Frontend launcher (Windows / cmd)
REM  Started automatically at boot by the registered Scheduled
REM  Task (see install-startup-windows.bat). Can also be run
REM  manually by double-clicking.
REM
REM  Uses pnpm — these are pnpm projects and npm would install a
REM  different tree than the one that was tested.
REM
REM  Everything is logged to logs\startup.log — at boot there is
REM  no console to read, so that file is the only way to see why
REM  a start failed.
REM ============================================================

setlocal enabledelayedexpansion

REM Move to the project root (this script lives in <root>\scripts).
cd /d "%~dp0.."

if not exist "logs" mkdir "logs"
set "LOG=%CD%\logs\startup.log"

call :log "=========================================================="
call :log "start-windows: booting (user=%USERNAME%, cwd=%CD%)"

REM --- Locate pnpm ------------------------------------------------------
REM pnpm, NOT npm: these are pnpm projects (pnpm-lock.yaml) and an npm install
REM resolves fresh from package.json instead of the locked tree — the versions
REM that were tested are not the versions that end up installed.
REM
REM At boot this may run as another account whose PATH is the MACHINE path
REM only. A per-user install (npm -g, corepack, the standalone installer) is
REM invisible there, which is the usual reason autostart works when clicked but
REM not after a restart — so look in the usual places by hand as well.
set "PNPM="
for /f "delims=" %%i in ('where pnpm.cmd 2^>nul') do if not defined PNPM set "PNPM=%%i"
if not defined PNPM if exist "%APPDATA%\npm\pnpm.cmd" set "PNPM=%APPDATA%\npm\pnpm.cmd"
if not defined PNPM if exist "%ProgramFiles%\nodejs\pnpm.cmd" set "PNPM=%ProgramFiles%\nodejs\pnpm.cmd"
if not defined PNPM if exist "%ProgramFiles(x86)%\nodejs\pnpm.cmd" set "PNPM=%ProgramFiles(x86)%\nodejs\pnpm.cmd"
if not defined PNPM if exist "%LOCALAPPDATA%\pnpm\pnpm.exe" set "PNPM=%LOCALAPPDATA%\pnpm\pnpm.exe"
if not defined PNPM if exist "%LOCALAPPDATA%\Programs\nodejs\pnpm.cmd" set "PNPM=%LOCALAPPDATA%\Programs\nodejs\pnpm.cmd"

if not defined PNPM (
    call :log "FATAL: pnpm not found. Install it for ALL USERS:"
    call :log "         npm install -g pnpm"
    call :log "       then re-run scripts\install-startup-windows.bat"
    exit /b 9009
)
call :log "using pnpm: !PNPM!"

REM No TTY here: pnpm ABORTS instead of assuming yes when it wants to confirm
REM something (e.g. purging a node_modules an npm install left behind).
set "CI=true"

REM ALWAYS install, not just when node_modules is missing — a pull that adds a
REM dependency otherwise leaves the tree incomplete and the build fails.
call :log "installing dependencies..."
call "!PNPM!" install >> "%LOG%" 2>&1
if !errorlevel! neq 0 call :log "WARNING: pnpm install exited !errorlevel!"

REM Serve the app built at install/update time. Building here would add half a
REM minute to every boot; this only fires as a safety net if dist is missing.
if not exist "dist\index.html" (
    call :log "no build found — building once..."
    call "!PNPM!" run build >> "%LOG%" 2>&1
    if !errorlevel! neq 0 (
        call :log "WARNING: build exited !errorlevel!"
    ) else (
        call :stamp
    )
)

call :log "starting frontend..."
call "!PNPM!" run start >> "%LOG%" 2>&1
set "CODE=!errorlevel!"
call :log "frontend exited with code !CODE!"

endlocal & exit /b %CODE%

:log
echo [%date% %time%] %~1
echo [%date% %time%] %~1 >> "%LOG%"
goto :eof

REM Record WHICH commit the build in dist\ was made from. The Settings page
REM compares this marker against the checked-out commit to say whether the
REM screen is current; a build made without writing it reads as permanently
REM stale, and the in-app Update button then rebuilds on every single click.
:stamp
for /f "delims=" %%i in ('git rev-parse HEAD 2^>nul') do >"dist\.commit" echo %%i
goto :eof
