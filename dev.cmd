@echo off
rem Double-click to start the whole local stack (see dev.py). Ctrl+C or close to stop.
cd /d "%~dp0"
python dev.py %*
echo.
echo dev.py exited. Log: .dev\stack.log
pause
