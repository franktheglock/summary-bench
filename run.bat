@echo off
title Summary Arena - Interactive Benchmark
color 0F
chcp 65001 >nul

cd /d "%~dp0"

echo.
echo  ============================================================
echo   Summary Arena - Interactive Benchmark Runner
echo  ============================================================
echo.
echo   [Controls]
echo     Arrow Keys : Navigate up/down
echo     Space      : Select/deselect (checkboxes)
echo     Enter      : Confirm selection  
echo     Type       : Filter the list live
echo.

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Install from https://python.org
    pause
    exit /b 1
)

:: Check if summaryarena is installed
python -c "import summaryarena" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing Summary Arena...
    pip install -e ".\script" >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install summaryarena
        echo         Run: pip install -e .\script
        pause
        exit /b 1
    )
)

:: Check for questionary (TUI library)
python -c "import questionary" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing TUI components...
    pip install questionary >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install questionary
        pause
        exit /b 1
    )
)

:: Check for requests
python -c "import requests" >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Installing requests...
    pip install requests >nul 2>&1
)

:: Check for test cases
echo [INFO] Checking test data...
if not exist "datasets\v1\test_cases.json" (
    echo [ERROR] Test cases not found!
    echo         Expected: datasets\v1\test_cases.json
    echo.
    echo         Please ensure the test data is available.
    pause
    exit /b 1
)

:: Run the interactive benchmark
echo [INFO] Starting interactive mode...
echo.

python "script\interactive_benchmark.py"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Benchmark failed with error code %errorlevel%
    echo         Check the error message above.
    pause
    exit /b %errorlevel%
)

echo.
echo Results saved to: results\
echo.
echo Press any key to exit...
pause >nul