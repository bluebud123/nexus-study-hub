@echo off
title Nexus Server
cd /d "%~dp0"

:: Try to find Node.js
set "NODE_CMD=node"

:: Method 1: Check if node is in PATH
node --version >nul 2>nul
if %errorlevel% equ 0 goto :node_found

:: Method 2: Check common install locations
if exist "C:\Program Files\nodejs\node.exe" (
    set "NODE_CMD=C:\Program Files\nodejs\node.exe"
    goto :node_found
)
if exist "%APPDATA%\fnm\node-versions" (
    for /f "delims=" %%d in ('dir /b /o-n "%APPDATA%\fnm\node-versions" 2^>nul') do (
        if exist "%APPDATA%\fnm\node-versions\%%d\installation\node.exe" (
            set "NODE_CMD=%APPDATA%\fnm\node-versions\%%d\installation\node.exe"
            goto :node_found
        )
    )
)
if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE_CMD=%ProgramFiles%\nodejs\node.exe"
    goto :node_found
)
if exist "%LOCALAPPDATA%\Programs\node\node.exe" (
    set "NODE_CMD=%LOCALAPPDATA%\Programs\node\node.exe"
    goto :node_found
)

:: Method 3: Try where as last resort
for /f "delims=" %%i in ('where node 2^>nul') do (
    set "NODE_CMD=%%i"
    goto :node_found
)

:: Node not found
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

:node_found
:: Check server.js exists
if not exist "server.js" (
    echo ERROR: server.js not found in %cd%
    echo Make sure start-nexus.bat is in the same folder as server.js
    pause
    exit /b 1
)

:: Kill any existing process on port 3456
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":3456 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>nul
)
timeout /t 1 /nobreak >nul

echo.
echo ========================================
echo   Nexus starting on http://localhost:3456
echo   Keep this window open while using Nexus
echo   Press Ctrl+C to stop the server
echo ========================================
echo.

:: Delay browser open so server has time to start
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3456"

:: Start the server â€?auto-restart on unexpected crash
:restart_loop
"%NODE_CMD%" server.js
set EXIT_CODE=%errorlevel%

:: Exit code 0 = user pressed Ctrl+C (intentional stop), exit cleanly
if %EXIT_CODE% equ 0 goto :stopped

:: Any other exit code = unexpected crash, wait briefly then restart
echo.
echo [Nexus] Server stopped unexpectedly (code %EXIT_CODE%). Restarting in 3 seconds...
echo         (Press Ctrl+C to stop)
timeout /t 3 /nobreak >nul
goto :restart_loop

:stopped
echo.
echo ========================================
echo   Nexus server stopped.
echo ========================================
echo.
pause
