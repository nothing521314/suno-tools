@echo off
echo ========================================
echo   GoLogin Profile Manager
echo ========================================
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM Kill any existing Electron processes
echo Closing any existing instances...
taskkill /F /IM electron.exe >nul 2>nul

REM Kill any process using port 3000
echo Checking port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Killing process %%a on port 3000...
    taskkill /F /PID %%a >nul 2>nul
)
echo.

echo Starting application...
echo.

REM Set working directory and environment variables
cd /d "%~dp0"
set APP_BASE_PATH=%~dp0
set APP_RESOURCES_PATH=%~dp0

REM Start Electron (it will manage the API server internally)
start "" "node_modules\electron\dist\electron.exe" .

echo Application started!
echo.
echo Note: Close the application window to stop both UI and server.
