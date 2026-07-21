@echo off
REM ============================================================
REM  Forensic Analyst — Frontend launcher (Windows / cmd)
REM  Started automatically at boot by the registered Scheduled
REM  Task (see install-startup-windows.bat). Can also be run
REM  manually by double-clicking.
REM
REM  Uses npm (not pnpm) so it works from the SYSTEM account at
REM  boot.
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

REM --- Locate npm -------------------------------------------------------
REM At boot this runs as SYSTEM, whose PATH is the MACHINE path only. A
REM per-user Node install (nvm, fnm, winget-to-user) is invisible there, which
REM is the usual reason autostart works when clicked but not after a restart.
set "NPM="
for /f "delims=" %%i in ('where npm.cmd 2^>nul') do if not defined NPM set "NPM=%%i"
if not defined NPM if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM=%ProgramFiles%\nodejs\npm.cmd"
if not defined NPM if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" set "NPM=%ProgramFiles(x86)%\nodejs\npm.cmd"
if not defined NPM if exist "%LOCALAPPDATA%\Programs\nodejs\npm.cmd" set "NPM=%LOCALAPPDATA%\Programs\nodejs\npm.cmd"
if not defined NPM if exist "%ProgramData%\chocolatey\bin\npm.cmd" set "NPM=%ProgramData%\chocolatey\bin\npm.cmd"

if not defined NPM (
    call :log "FATAL: npm not found. Node is probably installed for your user"
    call :log "       only, so the SYSTEM account cannot see it. Reinstall Node"
    call :log "       for ALL USERS from https://nodejs.org, then re-run"
    call :log "       scripts\install-startup-windows.bat"
    exit /b 9009
)
call :log "using npm: !NPM!"

REM Install dependencies on first run / after an update.
if not exist "node_modules" (
    call :log "installing dependencies..."
    call "!NPM!" install >> "%LOG%" 2>&1
    if !errorlevel! neq 0 call :log "WARNING: npm install exited !errorlevel!"
)

call :log "starting frontend dev server..."
call "!NPM!" run dev >> "%LOG%" 2>&1
set "CODE=!errorlevel!"
call :log "frontend exited with code !CODE!"

endlocal & exit /b %CODE%

:log
echo [%date% %time%] %~1
echo [%date% %time%] %~1 >> "%LOG%"
goto :eof
