@echo off
title Cai dat moi truong CHATBOT
color 0B

cd /d "%~dp0"

echo ==================================================
echo       CAI DAT MOI TRUONG CHO CHATBOT
echo ==================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [LOI] Chua cai Node.js.
    echo       Tai tai: https://nodejs.org
    pause
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo [LOI] Khong tim thay npm.
    pause
    exit /b 1
)

echo [INFO] Node:
node -v
echo [INFO] npm:
npm -v
echo.

echo [1/2] Dang cai Node modules...
call npm install
if errorlevel 1 (
    echo [LOI] npm install that bai.
    pause
    exit /b 1
)
echo [OK] Node modules da cai xong.
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo [CANH BAO] Khong tim thay Python.
    echo            Bo qua pip install.
    echo            Can Python cho search_key.py va search_image.py
    goto :done
)

echo [INFO] Python:
python --version
echo.

echo [2/2] Dang cai Python packages...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo [LOI] pip install that bai.
    pause
    exit /b 1
)
echo [OK] Python packages da cai xong.
echo.

:done
echo ==================================================
echo       CAI DAT HOAN TAT
echo ==================================================
echo.
echo Chay bot:  npm start
echo        hoac  start.bat
echo.
pause
