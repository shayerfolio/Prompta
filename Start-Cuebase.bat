@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Local preview needs Node.js 22.12 or newer from https://nodejs.org.
  echo For your live website, follow START_HERE.txt instead.
  pause
  exit /b 1
)
if not exist node_modules\wrangler\bin\wrangler.js (
  call npm install
  if errorlevel 1 goto failed
)
call npm run setup
if errorlevel 1 goto failed
node scripts\serve.mjs --open
if errorlevel 1 goto failed
exit /b 0
:failed
pause
exit /b 1
