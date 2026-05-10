@echo off
setlocal

set "APP_DIR=%~dp0.."
cd /d "%APP_DIR%"

set ELECTRON_RUN_AS_NODE=
call npm.cmd run build
if errorlevel 1 (
  echo.
  echo Failed to build Bachin Open Controller.
  pause
  exit /b 1
)

start "" "%APP_DIR%\node_modules\.bin\electron.cmd" .
