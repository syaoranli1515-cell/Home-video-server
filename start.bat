@echo off
echo ========================================
echo   Starting Home Video Server
echo ========================================
echo.

REM Get local IP address for network access
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do set IP=%%b
    goto :found
)
:found

echo Server will be accessible at:
echo   - Local: http://localhost:3000
echo   - Network: http://%IP%:3000
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

node src\server.js
