@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM VOP Bridge — Status Check
REM Run this to diagnose connection issues
REM ═══════════════════════════════════════════════════════════════════════

title VOP Bridge — Status Check

set "APP_DIR=%~dp0.."
set "PYTHON=%APP_DIR%\python\python.exe"

color 0B
echo.
echo  VOP Bridge — Status Check
echo  ─────────────────────────────────────────────────────────────────────
echo.

REM Check Python
echo  [1] Python Installation:
if exist "%PYTHON%" (
    echo      OK — Found at %PYTHON%
    for /f "tokens=*" %%i in ('"%PYTHON%" --version 2^>^&1') do echo      Version: %%i
) else (
    echo      MISSING — Python not found. Reinstall VOP Bridge.
)
echo.

REM Check python-can
echo  [2] Python-CAN Package:
"%PYTHON%" -c "import can; print('     OK — python-can', can.__version__)" 2>nul
if errorlevel 1 echo      MISSING — Run: "%PYTHON%" -m pip install python-can
echo.

REM Check websockets
echo  [3] WebSockets Package:
"%PYTHON%" -c "import websockets; print('     OK — websockets', websockets.__version__)" 2>nul
if errorlevel 1 echo      MISSING — Run: "%PYTHON%" -m pip install websockets
echo.

REM Check PCAN driver
echo  [4] PEAK PCAN Driver:
reg query "HKLM\SYSTEM\CurrentControlSet\Services\PCAN_USB" >nul 2>nul
if %errorlevel%==0 (
    echo      OK — PEAK PCAN-USB driver is installed
) else (
    echo      NOT FOUND — Install PEAK drivers from Start Menu ^> VOP Bridge ^> Install PEAK Drivers
)
echo.

REM Check if bridge is running
echo  [5] Bridge Process:
tasklist /fi "imagename eq python.exe" /fi "windowtitle eq *pcan*" 2>nul | find /i "python" >nul
if %errorlevel%==0 (
    echo      RUNNING — Bridge process detected
) else (
    echo      NOT RUNNING — Start VOP Bridge from desktop shortcut
)
echo.

REM Check WebSocket port
echo  [6] WebSocket Port (8765):
netstat -an | find ":8765" | find "LISTENING" >nul 2>nul
if %errorlevel%==0 (
    echo      OK — Port 8765 is listening (ws://)
) else (
    echo      NOT LISTENING — Bridge may not be running
)
echo.

echo  [7] Secure WebSocket Port (8766):
netstat -an | find ":8766" | find "LISTENING" >nul 2>nul
if %errorlevel%==0 (
    echo      OK — Port 8766 is listening (wss://)
) else (
    echo      NOT LISTENING — TLS may not be configured
)
echo.

REM Check TLS certificate
echo  [8] TLS Certificate:
if exist "%APP_DIR%\.certs\bridge.crt" (
    echo      OK — Certificate found
    echo      IMPORTANT: You must accept the certificate in your browser once.
    echo      Visit https://localhost:8766 and click Advanced ^> Proceed.
) else (
    echo      NOT GENERATED — Will be created on first bridge start
)
echo.

echo  ─────────────────────────────────────────────────────────────────────
echo  If you need help, visit https://www.ppei.ai or contact PPEI support.
echo  ─────────────────────────────────────────────────────────────────────
echo.
pause
