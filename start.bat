@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo === Starting dev servers ===
echo    API:  http://localhost:4010
echo    Web:  http://localhost:5173
echo.
call npm run dev
