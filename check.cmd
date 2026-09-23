@echo off
rem Double-click: typecheck + lint the frontend and run every service test suite.
rem Output goes to the console AND .dev\check.log so it can be read back later.
set ROOT=%~dp0
cd /d "%ROOT%"
if not exist .dev mkdir .dev
set LOG=%ROOT%.dev\check.log
echo --- check.cmd %date% %time% > "%LOG%"

echo === frontend: npm run typecheck
echo === frontend: npm run typecheck >> "%LOG%"
cd /d "%ROOT%frontend"
call npm run typecheck >> "%LOG%" 2>&1 && echo   OK || echo   FAILED (see .dev\check.log)

echo === frontend: npm run lint
echo === frontend: npm run lint >> "%LOG%"
call npm run lint >> "%LOG%" 2>&1 && echo   OK || echo   FAILED (see .dev\check.log)

echo === services\masterdata: pytest
echo === services\masterdata: pytest >> "%LOG%"
cd /d "%ROOT%services\masterdata"
python -m pytest -q >> "%LOG%" 2>&1 && echo   OK || echo   FAILED (see .dev\check.log)

echo === services\rack: pytest
echo === services\rack: pytest >> "%LOG%"
cd /d "%ROOT%services\rack"
python -m pytest -q >> "%LOG%" 2>&1 && echo   OK || echo   FAILED (see .dev\check.log)

echo === services\status: pytest
echo === services\status: pytest >> "%LOG%"
cd /d "%ROOT%services\status"
python -m pytest -q >> "%LOG%" 2>&1 && echo   OK || echo   FAILED (see .dev\check.log)

echo === services\sap-integration: pytest
echo === services\sap-integration: pytest >> "%LOG%"
cd /d "%ROOT%services\sap-integration"
python -m pytest -q >> "%LOG%" 2>&1 && echo   OK || echo   FAILED (see .dev\check.log)

rem The backend suite spins up PostgreSQL through testcontainers, so it needs
rem Docker Desktop running; without it every test errors at setup.
echo === backend: pytest (needs Docker Desktop)
echo === backend: pytest >> "%LOG%"
cd /d "%ROOT%backend"
python -m pytest -q >> "%LOG%" 2>&1 && echo   OK || echo   FAILED (needs Docker Desktop running - see .dev\check.log)

cd /d "%ROOT%"
echo.
echo Done. Full output: .dev\check.log
pause
