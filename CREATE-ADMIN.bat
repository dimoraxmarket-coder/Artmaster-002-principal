@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instaleaza Node.js 24 sau mai nou de la https://nodejs.org
 pause
 exit /b 1
)
node scripts\windows-local.mjs admin
set "ARTMASTER_EXIT=%ERRORLEVEL%"
if not "%ARTMASTER_EXIT%"=="0" echo Contul nu a fost creat. Datele existente nu au fost suprascrise.
pause
exit /b %ARTMASTER_EXIT%
