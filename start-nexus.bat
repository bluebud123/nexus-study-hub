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

:: Check server.js exists
if not exist "server.js" (
    echo ERROR: server.js not found in %cd%
    echo Make sure start-nexus.bat is in the same folder as server.js
    pause
    exit /b 1
)

:: Kill any existing process on port 3456 (try multiple times)
echo Checking port 3456...
set "KILLED=0"
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3456 " ^| findstr "LISTENING"') do (
    echo Killing existing process on port 3456 (PID %%a)...
    taskkill /PID %%a /F >nul 2>nul
    set "KILLED=1"
)
if "%KILLED%"=="1" (
    echo Waiting for port to free up...
    timeout /t 2 /nobreak >nul
)

:: Verify port is now free
set "PORT_BUSY=0"
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3456 " ^| findstr "LISTENING"') do (
    set "PORT_BUSY=1"
)
if "%PORT_BUSY%"=="1" (
    echo ERROR: Port 3456 is still in use by another program.
    echo Close that program first, or restart your computer.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Nexus starting on http://localhost:3456
echo   Keep this window open while using Nexus
echo   Press Ctrl+C to stop the server
echo ========================================
echo.

:: Delay browser open so server has time to start
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3456"

:: Start the server
node server.js

:: If we get here, server crashed or was stopped
echo.
echo ========================================
echo   Nexus server stopped.
echo ========================================
echo.
echo If this was unexpected, check above for error messages.
echo Common fixes:
echo   - Make sure no other program is using port 3456
echo   - Try running: node server.js (manually)
echo.
pause
