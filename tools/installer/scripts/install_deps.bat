@echo off
REM ═══════════════════════════════════════════════════════════════════════
REM VOP Bridge — Python Dependency Installer
REM Runs during Inno Setup installation to install pip + packages
REM ═══════════════════════════════════════════════════════════════════════

set "INSTALL_DIR=%~1"
if "%INSTALL_DIR%"=="" set "INSTALL_DIR=%~dp0.."

set "PYTHON=%INSTALL_DIR%\python\python.exe"
set "PIP=%INSTALL_DIR%\python\Scripts\pip.exe"

echo.
echo ══════════════════════════════════════════════════
echo   VOP Bridge — Installing Dependencies
echo ══════════════════════════════════════════════════
echo.

REM Step 1: Remove the ._pth file to enable pip/site-packages
if exist "%INSTALL_DIR%\python\python311._pth" (
    echo [1/4] Enabling pip support...
    del /f "%INSTALL_DIR%\python\python311._pth"
)

REM Step 2: Install pip
echo [2/4] Installing pip...
"%PYTHON%" "%INSTALL_DIR%\python\get-pip.py" --no-warn-script-location 2>nul
if errorlevel 1 (
    echo [WARN] pip install had warnings, continuing...
)

REM Step 3: Install required packages
echo [3/4] Installing python-can...
"%PYTHON%" -m pip install python-can --no-warn-script-location --quiet 2>nul

echo [4/4] Installing websockets + cryptography...
"%PYTHON%" -m pip install websockets cryptography --no-warn-script-location --quiet 2>nul

echo.
echo ══════════════════════════════════════════════════
echo   Dependencies installed successfully!
echo ══════════════════════════════════════════════════
echo.

exit /b 0
