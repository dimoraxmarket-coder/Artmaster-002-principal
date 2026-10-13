@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Instaleaza Node.js 24 LTS de la https://nodejs.org apoi deschide din nou acest fisier.
 pause
 exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0])<24) process.exit(1)"
if errorlevel 1 (
 echo Este necesar Node.js 24 sau mai nou.
 pause
 exit /b 1
)
if not exist .env.local copy .env.example .env.local >nul
call npm ci
if errorlevel 1 (
 echo Instalarea dependintelor nu a reusit. Verifica mesajele de mai sus si conexiunea la internet.
 pause
 exit /b 1
)
echo Dupa pornire deschide http://localhost:3000/ro in browser.
echo Pastreaza aceasta fereastra deschisa. Ctrl+C opreste site-ul.
call npm run dev
pause
