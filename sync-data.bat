@echo off
title Nexus Data Sync
cd /d "%~dp0"

echo.
echo ========================================
echo   Nexus Data Sync
echo ========================================
echo.

:: Check git
git --version >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Git is not installed or not in PATH.
    echo.
    echo Install Git from: https://git-scm.com/download/win
    echo.
    pause
    exit /b 1
)

:: Check git repo
if not exist ".git" (
    echo ERROR: This folder is not a Git repository.
    echo See sync.md for setup instructions.
    echo.
    pause
    exit /b 1
)

:: Step 1: Pull
echo [1/3] Pulling latest data from remote...
git pull origin main 2>&1
if %errorlevel% neq 0 (
    echo.
    echo WARNING: Pull failed or had conflicts.
    echo Check git status and resolve manually.
    echo.
    pause
    exit /b 1
)

:: Step 2: Stage nexus-data.json
echo.
echo [2/3] Checking for local changes...
git add nexus-data.json

git diff --cached --quiet --exit-code 2>nul
if %errorlevel% equ 0 (
    echo       No local changes to push.
    goto :done
)

:: Step 3: Commit and push
echo.
echo [3/3] Committing and pushing...
set "d=%date:~-4%-%date:~-7,2%-%date:~-10,2%"
set "t=%time:~0,2%:%time:~3,2%"
git commit -m "sync %d% %t%"
git push origin main 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Push failed.
    echo Try running manually: git push origin main
    echo.
    pause
    exit /b 1
)

:done
echo.
echo ========================================
echo   Sync complete!
echo.
echo   On your other device: run this script
echo   to pull the latest data before opening
echo   Nexus.
echo ========================================
echo.
pause
