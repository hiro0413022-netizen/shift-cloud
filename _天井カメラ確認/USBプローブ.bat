@echo off
chcp 65001 >nul
cd /d "%~dp0"
set LOG=%~dp0result-probe-console.txt
echo ==== start %DATE% %TIME% ==== > "%LOG%"

where python >> "%LOG%" 2>&1
where py >> "%LOG%" 2>&1

set PY=
python --version >> "%LOG%" 2>&1 && set PY=python
if "%PY%"=="" (py -3 --version >> "%LOG%" 2>&1 && set PY=py -3)
if "%PY%"=="" (
  echo NO PYTHON FOUND >> "%LOG%"
  echo Python が見つかりません。
  type "%LOG%"
  pause
  exit /b 1
)
echo USING: %PY% >> "%LOG%"

%PY% -c "import usb.core" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo installing pyusb... >> "%LOG%"
  %PY% -m pip install --user pyusb libusb >> "%LOG%" 2>&1
)

%PY% "%~dp0probe-usb.py" >> "%LOG%" 2>&1
echo ==== exit code %errorlevel% ==== >> "%LOG%"

echo.
echo ---- log ----
type "%LOG%"
echo.
pause
