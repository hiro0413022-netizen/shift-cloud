@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-camera.ps1"
echo.
echo Finished. result.txt has been created in this folder.
pause
