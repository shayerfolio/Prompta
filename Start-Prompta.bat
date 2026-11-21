@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Prompta needs Node.js 22.12 or newer to open on your computer.
  echo Install the current LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules\wrangler\bin\wrangler.js (
  call npm install
  if errorlevel 1 goto failed
)
if not exist .prompta\setup.json (
  call npm run setup
  if errorlevel 1 goto failed
)
node scripts\serve.mjs --open
if errorlevel 1 pause
exit /b
:failed
pause
exit /b 1
