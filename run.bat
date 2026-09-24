@echo off
title PANOPTES // Sovereign Mesh CCTNS Command Center
color 0A

:: 1. Anchor working directory to the project root
cd /d "%~dp0"

echo ================================================================
ECHO                         PANOPTES 
echo ================================================================
echo.

:: 2. Verify Python Availability
python --version >nul 2>&1
if errorlevel 1 goto :no_python

:: 3. Activate Virtual Environment if available
if exist ".venv\Scripts\activate.bat" (
    echo [*] Activating virtual environment .venv...
    call ".venv\Scripts\activate.bat"
)
if exist "venv\Scripts\activate.bat" (
    echo [*] Activating virtual environment venv...
    call "venv\Scripts\activate.bat"
)

:: 4. Free port 8000 if an orphan process is listening
echo [*] Checking port 8000 availability...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /C:":8000 "') do (
    echo [*] Terminating orphan process on PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)

:: 5. Verify & Install Python Dependencies
echo [*] Checking Python dependencies...
python -c "import fastapi, uvicorn, reportlab, pyvis, numpy, metaphone, multipart" >nul 2>&1
if errorlevel 1 (
    echo [*] Installing missing Python packages...
    python -m pip install fastapi uvicorn reportlab pyvis numpy metaphone python-multipart
)

:: 6. Build Frontend Bundle if missing
if exist "frontend\dist\index.html" goto :skip_build
if exist "dist\index.html" goto :skip_build

echo [*] Compiled React SPA bundle not detected. Checking for build tools...
where npm >nul 2>&1
if errorlevel 1 (
    echo [-] Node.js or npm is not detected in system PATH.
    echo [*] Skipping frontend compile. FastAPI will launch in fallback visualizer mode.
    goto :skip_build
)

if exist "frontend\package.json" (
    echo [*] Compiling React frontend in frontend directory...
    pushd frontend
    call npm install
    call npm run build
    popd
    goto :skip_build
)

if exist "package.json" (
    echo [*] Compiling React frontend in root directory...
    call npm install
    call npm run build
    goto :skip_build
)

:skip_build

:: 7. Native Engine & Database Pre-Flight
if exist "core_engine\bin\Graph_Engine.dll" (
    echo [*] Native C++ Graph_Engine.dll linked.
) else (
    echo [*] Note: Graph_Engine.dll not found. Using native Python fallback.
)

if exist "core_engine\data\crimenet_sovereign_mesh.db" (
    echo [*] Sovereign Mesh database anchored.
) else (
    echo [-] Note: crimenet_sovereign_mesh.db not found in core_engine\data.
)

:: 8. Launch Browser & Server
echo.
echo [*] Launching PANOPTES Forensic Terminal on http://127.0.0.1:8000 ...
echo [*] Officer Credentials: Username = turbo  ^|  Password = torpedo
echo.
echo [*] Press Ctrl+C to stop the server.
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:8000"

cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
if errorlevel 1 goto :server_error
pause
exit /b 0

:no_python
color 0C
echo [-] CRITICAL ERROR: Python 3 is not installed or not in your system PATH.
echo     Please install Python 3.10+ from python.org and check 'Add Python to PATH'.
echo.
pause
exit /b 1

:server_error
color 0C
echo.
echo [-] ERROR: Server terminated with an error code.
echo.
pause
exit /b 1