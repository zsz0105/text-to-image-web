@echo off
chcp 65001 >nul
echo 正在启动文生图网站...
start http://localhost:8080
python "%~dp0server.py"
pause
