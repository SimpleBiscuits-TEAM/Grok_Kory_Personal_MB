@echo off
setlocal
rem Runs the bundled bridge script from repo root.
rem Single source of truth: client\public\pcan_bridge.py
rem Prefer py -3 (Windows launcher). Plain "python" is often missing or a Store stub.
cd /d "%~dp0\.."

where py >nul 2>&1
if errorlevel 1 goto trypython
py -3 client\public\pcan_bridge.py %*
exit /b %ERRORLEVEL%

:trypython
where python >nul 2>&1
if errorlevel 1 goto nopython
python client\public\pcan_bridge.py %*
exit /b %ERRORLEVEL%

:nopython
echo.
echo ERROR: Neither "py" nor "python" was found in PATH.
echo Install Python from https://www.python.org/downloads/ ^(enable "Add to PATH"^)
echo Then run: py -3 -m pip install -r bridge\requirements.txt
echo.
pause
exit /b 1
