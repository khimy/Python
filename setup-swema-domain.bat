@echo off
REM Adds the local domain "swema" (127.0.0.1) to the Windows hosts file.
REM Right-click this file and choose "Run as administrator".
setlocal
set "HOSTS=%SystemRoot%\System32\drivers\etc\hosts"

net session >nul 2>&1
if errorlevel 1 (
    echo This needs administrator rights.
    echo Right-click setup-swema-domain.bat and choose "Run as administrator".
    pause
    exit /b 1
)

findstr /I /R /C:"^[^#]*swema" "%HOSTS%" >nul 2>&1
if not errorlevel 1 (
    echo "swema" is already set up in the hosts file.
) else (
    echo.>>"%HOSTS%"
    echo 127.0.0.1	swema>>"%HOSTS%"
    echo Added "127.0.0.1 swema" to %HOSTS%
)

ipconfig /flushdns >nul
echo.
echo Done. Now double-click start-swema.bat and open http://swema/
pause
