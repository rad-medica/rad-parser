# Build script for Emscripten WASM codecs

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildDir = Join-Path $ScriptDir "build"
$DistDir = Join-Path $ScriptDir "dist"

# Setup Emscripten environment using native PowerShell script
Write-Host "Setting up Emscripten environment..."
. "C:\emsdk\emsdk_env.ps1"

$ErrorActionPreference = "Continue"

# Add emsdk mingw to PATH
$env:PATH = "C:\emsdk\mingw\7.1.0_64bit\bin;$env:PATH"

# Create directories
if (!(Test-Path $BuildDir)) { New-Item -ItemType Directory -Path $BuildDir | Out-Null }
if (!(Test-Path $DistDir)) { New-Item -ItemType Directory -Path $DistDir | Out-Null }

# Configure if needed
Set-Location $BuildDir
if (!(Test-Path "CMakeCache.txt")) {
    Write-Host "Configuring with CMake..."
    & emcmake cmake .. -G "MinGW Makefiles" -DCMAKE_MAKE_PROGRAM=mingw32-make -DCMAKE_BUILD_TYPE=Release
    if ($LASTEXITCODE -ne 0) { throw "CMake configuration failed!" }
}

# Build
Write-Host "Building WASM modules..."
& mingw32-make -j4
if ($LASTEXITCODE -ne 0) { throw "Build failed!" }

# Copy outputs
Write-Host "Copying outputs to dist..."
Get-ChildItem -Filter "*.js" | Copy-Item -Destination $DistDir -Force
Get-ChildItem -Filter "*.wasm" | Copy-Item -Destination $DistDir -Force

Write-Host "Build complete! Outputs in $DistDir"
Get-ChildItem $DistDir
