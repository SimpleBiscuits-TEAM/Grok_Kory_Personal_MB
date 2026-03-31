@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM VOP Bridge — One-Click Launcher
REM Double-click this to start the PCAN bridge for VOP diagnostics
REM ═══════════════════════════════════════════════════════════════════════

title VOP Bridge — PCAN-USB Connection

set "APP_DIR=%~dp0"
set "PYTHON=%APP_DIR%python\python.exe"
set "BRIDGE=%APP_DIR%pcan_bridge.py"

color 0C
echo.
echo  ██╗   ██╗ ██████╗ ██████╗     ██████╗ ██████╗ ██╗██████╗  ██████╗ ███████╗
echo  ██║   ██║██╔═══██╗██╔══██╗    ██╔══██╗██╔══██╗██║██╔══██╗██╔════╝ ██╔════╝
echo  ██║   ██║██║   ██║██████╔╝    ██████╔╝██████╔╝██║██║  ██║██║  ███╗█████╗
echo  ╚██╗ ██╔╝██║   ██║██╔═══╝     ██╔══██╗██╔══██╗██║██║  ██║██║   ██║██╔══╝
echo   ╚████╔╝ ╚██████╔╝██║         ██████╔╝██║  ██║██║██████╔╝╚██████╔╝███████╗
echo    ╚═══╝   ╚═════╝ ╚═╝         ╚═════╝ ╚═╝  ╚═╝╚═╝╚═════╝  ╚═════╝ ╚══════╝
echo.
echo  Vehicle Operating Platform — PCAN-USB Bridge v2.0
echo  PPEI Custom Tuning
echo  ─────────────────────────────────────────────────────────────────────
echo.

REM Check Python exists
if not exist "%PYTHON%" (
    color 0E
    echo  [ERROR] Python not found at: %PYTHON%
    echo  Please reinstall VOP Bridge using the installer.
    echo.
    pause
    exit /b 1
)

REM Check bridge script exists
if not exist "%BRIDGE%" (
    color 0E
    echo  [ERROR] Bridge script not found at: %BRIDGE%
    echo  Please reinstall VOP Bridge using the installer.
    echo.
    pause
    exit /b 1
)

REM Check python-can is installed
"%PYTHON%" -c "import can" 2>nul
if errorlevel 1 (
    echo  [INFO] Installing missing dependencies...
    "%PYTHON%" -m pip install python-can websockets cryptography --quiet
    echo.
)

echo  Starting VOP Bridge...
echo  ─────────────────────────────────────────────────────────────────────
echo.
echo  The bridge will auto-detect your PCAN-USB adapter.
echo  Open VOP at https://www.ppei.ai to connect.
echo.
echo  Press Ctrl+C to stop the bridge.
echo  ─────────────────────────────────────────────────────────────────────
echo.

"%PYTHON%" "%BRIDGE%"

REM If bridge exits with error, pause so user can see the message
if errorlevel 1 (
    echo.
    echo  ─────────────────────────────────────────────────────────────────────
    echo  [ERROR] Bridge exited with an error. See messages above.
    echo  ─────────────────────────────────────────────────────────────────────
    echo.
    pause
)
