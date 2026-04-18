@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM WebShop — lokalni pokretac / restart (Windows)
REM - docker compose down (samo ovaj projekat)
REM - gasi host procese na portovima (Vite / uvicorn van Dockera ako su ostali)
REM - docker compose up -d --build (db + backend + frontend u kontejnerima)
REM - ceka backend health, opciono frontend (Vite u kontejneru)
REM Opciono: set DOCKER_DESKTOP_EXE=D:\putanja\Docker Desktop.exe ako nije u Program Files

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "COMPOSE_FILE=%ROOT%\docker-compose.yml"

title WebShop Local Runner

echo.
echo === WebShop Local Runner ===
echo Root: "%ROOT%"
echo.

set "PF86=%ProgramFiles(x86)%"

set "BACKEND_HEALTH_URL=http://localhost:8000/api/health"
set "BACKEND_DOCS_URL=http://localhost:8000/docs"
set "FRONTEND_URL_5173=http://localhost:5173"
set "FRONTEND_URL_5174=http://localhost:5174"

REM --- Preflight ---
where docker >nul 2>&1
if errorlevel 1 (
  echo [ERR] Docker nije u PATH. Instaliraj/pokreni Docker Desktop pa probaj ponovo.
  exit /b 1
)

set "DOCKER_HOST="
set "DOCKER_CONTEXT="

call :EnsureDockerDaemon
if errorlevel 1 (
  echo [ERR] Docker daemon nije dostupan. Pokreni Docker Desktop i probaj ponovo.
  exit /b 1
)

where curl >nul 2>&1
if errorlevel 1 (
  echo [ERR] curl nije u PATH. Na Windows 10+ obicno postoji.
  exit /b 1
)

if not exist "%COMPOSE_FILE%" (
  echo [ERR] Ne postoji "%COMPOSE_FILE%".
  exit /b 1
)

if not exist "%ROOT%\.env" (
  if exist "%ROOT%\.env.example" (
    copy /Y "%ROOT%\.env.example" "%ROOT%\.env" >nul
    echo [OK] Kreiran .env iz .env.example
  ) else (
    echo [WARN] .env i .env.example ne postoje. Compose koristi podrazumevane vrednosti.
  )
)

echo.
echo --- 1) Gasim WebShop Docker stack ---
pushd "%ROOT%"
docker compose -f "%COMPOSE_FILE%" down --remove-orphans
if errorlevel 1 (
  echo [WARN] docker compose down nije uspeo ^(mozda nista nije radilo^). Nastavljam.
)

echo.
echo --- 2) Gasim host procese na portovima (5173-5178, 8000, 5433) ---
for %%P in (5173 5174 5175 5176 5177 5178 8000 5433) do (
  call :KillPort %%P
)

echo.
echo --- 3) Palim DB + Backend + Frontend (docker compose up -d --build) ---
docker compose -f "%COMPOSE_FILE%" up -d --build
if errorlevel 1 (
  echo [ERR] docker compose up nije uspeo.
  popd
  exit /b 1
)

echo.
echo --- 3.1) Cekam backend (%BACKEND_HEALTH_URL%) ---
call :WaitHttpOk "%BACKEND_HEALTH_URL%" 120
if errorlevel 1 (
  echo [ERR] Backend nije spreman ^(health nije 200^).
  echo [INFO] Backend logovi ^(tail 200^):
  docker compose -f "%COMPOSE_FILE%" logs --tail=200 backend
  echo.
  echo [INFO] DB logovi ^(tail 200^):
  docker compose -f "%COMPOSE_FILE%" logs --tail=200 db
  echo.
  echo [INFO] Ponavljam restart backend-a...
  docker compose -f "%COMPOSE_FILE%" restart backend >nul 2>&1
  call :WaitHttpOk "%BACKEND_HEALTH_URL%" 60
  if errorlevel 1 (
    popd
    exit /b 1
  )
)

echo.
echo --- 4) Opciono: alembic upgrade head ^(idempotentno, ako entrypoint nije stigao^) ---
docker compose -f "%COMPOSE_FILE%" exec -T backend alembic upgrade head
if errorlevel 1 (
  echo [WARN] Alembic exec nije uspeo ^(mozda backend jos nije spreman^). Proveri logove.
) else (
  echo [OK] Alembic upgrade head.
)

echo.
echo --- 4.1) Ponovo proveravam backend health ---
call :WaitHttpOk "%BACKEND_HEALTH_URL%" 30
if errorlevel 1 (
  echo [WARN] Health i dalje ne odgovara kako treba.
)

echo.
echo --- 5) Cekam frontend (Vite u kontejneru; npm install moze potrajati) ---
call :WaitFrontendUp 180
if errorlevel 1 (
  echo [WARN] Frontend jos nije odgovorio na 5173/5174. Proveri: docker compose logs -f frontend
  set "OPEN_URL=%FRONTEND_URL_5173%"
) else (
  if defined FRONTEND_READY_URL (
    set "OPEN_URL=!FRONTEND_READY_URL!"
  ) else (
    set "OPEN_URL=%FRONTEND_URL_5173%"
  )
)

popd

echo.
echo [OK] WebShop stack je podignut.
echo - API / Swagger: %BACKEND_DOCS_URL%
echo - Health:          %BACKEND_HEALTH_URL%
echo - Postgres host:   localhost:5433 ^(mapiran na 5432 u kontejneru^)
echo - Frontend:        obicno %FRONTEND_URL_5173% ^(ili %FRONTEND_URL_5174% ako je FRONTEND_HOST_PORT=5174 u .env^)
echo.
echo Otvaram frontend u browseru ^(!OPEN_URL!^)...
start "" "!OPEN_URL!"

echo.
echo Za logove: cd /d "%ROOT%" ^&^& docker compose logs -f
pause
exit /b 0

REM -------------------------
REM Helpers
REM -------------------------
:ResolveDockerDesktopExe
set "DOCKER_DESKTOP_RESOLVED="
if defined DOCKER_DESKTOP_EXE if exist "%DOCKER_DESKTOP_EXE%" (
  set "DOCKER_DESKTOP_RESOLVED=%DOCKER_DESKTOP_EXE%"
  exit /b 0
)
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
  set "DOCKER_DESKTOP_RESOLVED=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  exit /b 0
)
if exist "%PF86%\Docker\Docker\Docker Desktop.exe" (
  set "DOCKER_DESKTOP_RESOLVED=%PF86%\Docker\Docker\Docker Desktop.exe"
  exit /b 0
)
if exist "D:\Program Files\Docker\Docker\Docker Desktop.exe" (
  set "DOCKER_DESKTOP_RESOLVED=D:\Program Files\Docker\Docker\Docker Desktop.exe"
  exit /b 0
)
if exist "D:\Docker\Docker\Docker Desktop.exe" (
  set "DOCKER_DESKTOP_RESOLVED=D:\Docker\Docker\Docker Desktop.exe"
  exit /b 0
)
exit /b 0

:EnsureDockerDaemon
echo.
echo --- Docker proveravam / pokrecem (Docker Desktop) ---

docker info >nul 2>&1
if not errorlevel 1 goto :CheckLinuxMode

set "DOCKER_500_ERR="
for /f "usebackq delims=" %%L in (`docker version 2^>^&1`) do (
  echo %%L | findstr /I "500 Internal Server" >nul 2>&1
  if not errorlevel 1 set "DOCKER_500_ERR=1"
)

if defined DOCKER_500_ERR (
  echo [WARN] Docker engine vraca HTTP 500 ^(engine u neispravnom stanju^).
  echo [INFO] Gasim Docker procese i radim wsl --shutdown...
  taskkill /IM "com.docker.backend.exe" /F >nul 2>&1
  taskkill /IM "Docker Desktop.exe" /F >nul 2>&1
  taskkill /IM "docker-sandbox.exe" /F >nul 2>&1
  ping -n 4 127.0.0.1 >nul
  wsl --shutdown >nul 2>&1
  echo [INFO] WSL ugasen. Cekam 3s pa ponovo pokrecem Docker Desktop...
  ping -n 4 127.0.0.1 >nul
)

echo [INFO] Pokusavam pokrenuti Docker Desktop...
call :ResolveDockerDesktopExe
if defined DOCKER_DESKTOP_RESOLVED (
  start "" "!DOCKER_DESKTOP_RESOLVED!"
) else (
  echo [WARN] Ne nalazim Docker Desktop.exe. Pokreni Docker Desktop rucno.
)

set /a WAIT_SEC=0
:WaitDockerLoop
ping -n 4 127.0.0.1 >nul
set /a WAIT_SEC+=3
docker info >nul 2>&1
if not errorlevel 1 goto :DockerReady
if %WAIT_SEC% GEQ 150 (
  echo [ERR] Docker se nije podigao u roku od 150s.
  exit /b 1
)
echo [INFO] Cekam Docker daemon... ^(%WAIT_SEC%s^)
goto :WaitDockerLoop

:DockerReady
echo [OK] Docker daemon spreman ^(~%WAIT_SEC%s^).

:CheckLinuxMode
for /f "usebackq delims=" %%O in (`docker info --format "{{.OSType}}" 2^>nul`) do set "DOCKER_OSTYPE=%%O"
if not "%DOCKER_OSTYPE%"=="" if /I not "%DOCKER_OSTYPE%"=="linux" (
  echo [ERR] Docker je u "%DOCKER_OSTYPE%" modu. Potrebni su Linux kontejneri.
  exit /b 1
)
echo [OK] Docker ^(Linux containers^).
exit /b 0

:KillPort
set "PORT=%~1"
set "PIDS="
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING" 2^>nul') do (
  set "PID=%%a"
  if not "!PIDS!"=="!PID!" (
    set "PIDS=!PIDS! !PID!"
  )
)
if "%PIDS%"=="" (
  echo [OK] Port %PORT% slobodan.
  goto :eof
)
echo [INFO] Port %PORT% zauzet. Gasim PID-ove:%PIDS%
for %%i in (%PIDS%) do (
  taskkill /PID %%i /F >nul 2>&1
)
goto :eof

:WaitHttpOk
set "URL=%~1"
set "MAXSEC=%~2"
set /a ELAPSED=0
:WaitHttpOkLoop
curl -fsS "%URL%" >nul 2>&1
if not errorlevel 1 exit /b 0
ping -n 3 127.0.0.1 >nul
set /a ELAPSED+=2
if !ELAPSED! GEQ %MAXSEC% exit /b 1
set /a "_MOD=!ELAPSED!%%10"
if !_MOD! EQU 0 if !ELAPSED! GTR 0 echo [INFO] Cekam %URL% ... (!ELAPSED!s / %MAXSEC%s^)
goto :WaitHttpOkLoop

REM Ceka Vite na 5173 ili 5174 (FRONTEND_HOST_PORT u .env)
:WaitFrontendUp
set "MAXSEC=%~1"
set /a ELAPSED=0
set "FRONTEND_READY_URL="
:WaitFrontendUpLoop
curl -fsS "%FRONTEND_URL_5173%/" >nul 2>&1
if not errorlevel 1 (
  set "FRONTEND_READY_URL=%FRONTEND_URL_5173%"
  echo [OK] Frontend odgovara na %FRONTEND_URL_5173%
  exit /b 0
)
curl -fsS "%FRONTEND_URL_5174%/" >nul 2>&1
if not errorlevel 1 (
  set "FRONTEND_READY_URL=%FRONTEND_URL_5174%"
  echo [OK] Frontend odgovara na %FRONTEND_URL_5174%
  exit /b 0
)
ping -n 3 127.0.0.1 >nul
set /a ELAPSED+=2
if !ELAPSED! GEQ %MAXSEC% exit /b 1
set /a "_M=!ELAPSED!%%15"
if !_M! EQU 0 if !ELAPSED! GTR 0 echo [INFO] Cekam frontend (5173/5174)... (!ELAPSED!s / %MAXSEC%s^)
goto :WaitFrontendUpLoop
