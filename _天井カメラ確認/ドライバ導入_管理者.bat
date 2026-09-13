@echo off
net session >nul 2>&1
if %errorLevel% NEQ 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-zwo-driver.ps1"
echo.
echo Finished. result-driver.txt has been created in this folder.
pause
