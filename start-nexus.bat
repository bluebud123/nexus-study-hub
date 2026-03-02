@echo off
title Nexus Server
cd /d "%~dp0"

:: Check Node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ============================================
    echo   Node.js is NOT installed on this computer
    echo ============================================
    echo.
    echo To run Nexus, you need Node.js installed.
    echo.
    echo 1. Go to https://nodejs.org
    echo 2. Download the LTS version
    echo 3. Install it (just click Next through the installer)
    echo 4. Restart your computer
    echo 5. Double-click this file again
    echo.
    pause
    exit /b 1
)

:: Kill any existing process on port 3456
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3456 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>nul
)

echo Starting Nexus on http://localhost:3456 ...
echo (Keep this window open while using Nexus)
echo.

:: Open in default browser
start "" "http://localhost:3456" 2>nul

:: Start the server
node server.js
pause
