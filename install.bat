@echo off
echo ========================================
echo   Home Video Server - Installer
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js found: 
node --version
echo.

REM Check if FFmpeg is available
where ffmpeg >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] FFmpeg found in system PATH
    set FFMPEG_PATH=ffmpeg
) else (
    echo [INFO] FFmpeg not found in PATH
    echo You can download FFmpeg from https://ffmpeg.org/download.html
    echo Or locate ffmpeg.exe manually after installation
    echo.
    set /p FFMPEG_PATH="Enter full path to ffmpeg.exe (e.g., C:\ffmpeg\bin\ffmpeg.exe): "
)

echo.
echo Installing dependencies...
call npm install

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo To start the server:
echo   1. Run: start.bat
echo   2. Open browser to http://localhost:3000
echo   3. On first run, you'll be asked for:
echo      - FFmpeg path: %FFMPEG_PATH%
echo      - Your media directory path
echo.
echo The server will be accessible from any device on your local network!
echo Find your IP address to share with other devices.
echo.

REM Save FFmpeg path for convenience
echo %FFMPEG_PATH% > config\ffmpeg_hint.txt

pause
start.bat
