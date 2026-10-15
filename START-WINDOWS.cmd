@echo off
rem Compatibilitate cu lansatorul anterior: foloseste pornirea izolata pe loopback.
call "%~dp0START.bat"
exit /b %ERRORLEVEL%
