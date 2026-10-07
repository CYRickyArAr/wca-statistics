@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer: https://nodejs.org/
  pause
  exit /b 1
)
if not defined PORT set PORT=5288
start "" /b cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:%PORT%"
node server.mjs
pause
