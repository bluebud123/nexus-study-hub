@echo off
title Nexus Updater
cd /d "%~dp0"

echo.
echo ========================================
echo   Nexus Updater
echo ========================================
echo.

:: Check if git is available
git --version >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Git is not installed or not in PATH.
    echo.
    echo Install Git from: https://git-scm.com/download/win
    echo Then restart your computer and try again.
    echo.
    pause
    exit /b 1
)

:: Check if this is a git repo
if not exist ".git" (
    echo ERROR: This folder is not a Git repository.
    echo Cannot pull updates without Git history.
    echo.
    pause
    exit /b 1
)

:: Backup user data before updating
echo [1/4] Backing up your data...
if exist "nexus-data.json" (
    copy /y "nexus-data.json" "nexus-data.backup.json" >nul
    echo       nexus-data.json backed up.
)
if exist "nexus-config.json" (
    copy /y "nexus-config.json" "nexus-config.backup.json" >nul
    echo       nexus-config.json backed up.
)

:: Check for local changes
echo.
echo [2/4] Checking for local changes...
git diff --quiet --exit-code 2>nul
if %errorlevel% neq 0 (
    echo       You have local changes. Stashing them...
    git stash push -m "nexus-update-backup-%date:~-4%%date:~-7,2%%date:~-10,2%" >nul 2>nul
    set "STASHED=1"
) else (
    set "STASHED=0"
)

:: Pull latest from GitHub
echo.
echo [3/4] Pulling latest updates from GitHub...
git pull origin main 2>&1
if %errorlevel% neq 0 (
    echo.
    echo WARNING: Pull failed. Trying with rebase...
    git pull --rebase origin main 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: Could not pull updates.
        echo Try manually: git pull origin main
        echo.
        if "%STASHED%"=="1" (
            echo Restoring your local changes...
            git stash pop >nul 2>nul
        )
        pause
        exit /b 1
    )
)

:: Restore stashed changes if any
if "%STASHED%"=="1" (
    echo.
    echo [4/4] Restoring your local changes...
    git stash pop >nul 2>nul
    if %errorlevel% neq 0 (
        echo       Warning: Could not auto-merge local changes.
        echo       Your changes are saved in git stash. Run: git stash list
    ) else (
        echo       Local changes restored successfully.
    )
) else (
    echo.
    echo [4/4] No local changes to restore.
)

echo.
echo ========================================
echo   Update complete!
echo.
echo   Your data files (nexus-data.json,
echo   nexus-config.json) are preserved.
echo.
echo   Restart Nexus to use the new version:
echo   Double-click start-nexus.bat
echo ========================================
echo.
pause
