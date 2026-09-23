@echo off
rem Restart only the masterdata service (:8002) when uvicorn's --reload gets stuck
rem on Windows. Kills the stale uvicorn tree on the port, then starts it again via
rem dev.py so env/log handling stays the same. Ctrl+C or close to stop it.
cd /d "%~dp0"
echo Stopping whatever listens on :8002 ...
powershell -NoProfile -Command "$ids=(Get-NetTCPConnection -LocalPort 8002 -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -Unique; foreach($i in $ids){ $pp=(Get-CimInstance Win32_Process -Filter ('ProcessId=' + $i)).ParentProcessId; if($pp -and $pp -ne 0){ Write-Host ('  killing parent ' + $pp); taskkill /F /T /PID $pp 2>$null | Out-Null }; Write-Host ('  killing ' + $i); taskkill /F /T /PID $i 2>$null | Out-Null }"
timeout /t 2 /nobreak >nul
python dev.py --only masterdata
echo.
echo dev.py exited. Log: .dev\stack.log
pause
