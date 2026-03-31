@echo off
TITLE AI Interview Platform (Backend)
COLOR 0A

echo ################################################
echo #                                              #
echo #      AI INTERVIEW PLATFORM STARTUP          #
echo #                                              #
echo ################################################
echo.

:: Change to the project directory
cd /d "d:\interview"

:: Check if node_modules exists
if not exist "node_modules" (
    echo [ERROR] node_modules not found. Running npm install...
    call npm install
)

:: Start the backend in a new window
echo Starting the Backend...
start "AI Interview Backend" cmd /k "npm start"

:: Wait for a few seconds for the server to initialize
echo Waiting for server to start...
timeout /t 5 /nobreak > nul

:: Open the browser
echo Opening the platform in your browser...
start http://localhost:3001

echo.
echo Platform is now running at http://localhost:3001
echo You can keep the backend window open to see logs.
echo.
pause
