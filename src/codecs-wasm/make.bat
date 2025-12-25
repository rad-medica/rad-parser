@echo off
setlocal

call C:\emsdk\emsdk_env.bat

cd /d "%~dp0build"

cmake --build . --config Release

if errorlevel 1 (
    echo Build failed!
    exit /b 1
)

echo Build successful!
mkdir "%~dp0dist" 2>nul
copy /Y *.js "%~dp0dist\" 2>nul
copy /Y *.wasm "%~dp0dist\" 2>nul
echo Outputs copied to dist folder.
