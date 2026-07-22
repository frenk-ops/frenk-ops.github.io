@echo off
cd /d "%~dp0"
py tools\arcane_server.py --port 8000 --open
pause
