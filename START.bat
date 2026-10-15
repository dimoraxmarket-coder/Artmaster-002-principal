@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instaleaza Node.js 24 sau mai nou de la https://nodejs.org
 echo Inchide si redeschide fereastra dupa instalare.
 pause
 exit /b 1
)
node scripts\windows-local.mjs start
set "ARTMASTER_EXIT=%ERRORLEVEL%"
if not "%ARTMASTER_EXIT%"=="0" (
 echo Pornirea nu a reusit. Consulta README-WINDOWS.md si mesajul de mai sus.
 pause
)
exit /b %ARTMASTER_EXIT%
