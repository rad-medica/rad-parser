@echo off
setlocal

call C:\emsdk\emsdk_env.bat

cd /d "%~dp0build"

emcmake cmake .. -G "MinGW Makefiles" -DCMAKE_MAKE_PROGRAM=mingw32-make -DCMAKE_BUILD_TYPE=Release

if errorlevel 1 (
    echo CMake failed!
    exit /b 1
)

echo CMake configuration successful!
