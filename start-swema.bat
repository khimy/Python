@echo off
REM Starts the SWEMA map at http://swema/  (double-click to run; close the window to stop)
cd /d "%~dp0"
where python >nul 2>&1 && (python serve.py %* & goto :eof)
where py >nul 2>&1 && (py serve.py %* & goto :eof)
echo Python was not found. Install it from https://www.python.org/downloads/
echo (tick "Add python.exe to PATH" during installation), then run this again.
pause
