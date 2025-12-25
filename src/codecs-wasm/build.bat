@echo off
REM Build script for Emscripten-based WASM codecs (Windows)

setlocal enabledelayedexpansion

set SCRIPT_DIR=%~dp0
set BUILD_DIR=%SCRIPT_DIR%build
set OUTPUT_DIR=%SCRIPT_DIR%dist

REM Check for Emscripten
where emcc >nul 2>&1
if errorlevel 1 (
    echo Error: Emscripten ^(emcc^) not found. Please install and activate emsdk.
    echo See: https://emscripten.org/docs/getting_started/downloads.html
    exit /b 1
)

echo Using Emscripten version:
call emcc --version

REM Create build directory
if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%"
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

cd /d "%BUILD_DIR%"

REM Configure with Emscripten
echo Configuring with CMake...
call emcmake cmake .. -DCMAKE_BUILD_TYPE=Release
if errorlevel 1 (
    echo CMake configuration failed!
    exit /b 1
)

REM Build
echo Building WASM modules...
call emmake make -j4
if errorlevel 1 (
    echo Build failed!
    exit /b 1
)

REM Copy outputs to dist
echo Copying outputs to dist...
copy /Y *.js "%OUTPUT_DIR%\" 2>nul
copy /Y *.wasm "%OUTPUT_DIR%\" 2>nul

echo Build complete! Outputs in %OUTPUT_DIR%
dir "%OUTPUT_DIR%"

endlocal
