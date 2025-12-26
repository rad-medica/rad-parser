# Build script for rad-core WASM

$ErrorActionPreference = "Stop"

$SourceDir = $PSScriptRoot
$BuildDir = Join-Path $SourceDir "build"
$DistDir = Join-Path $SourceDir "dist"

# Setup Emscripten environment using native PowerShell script
Write-Host "Setting up Emscripten environment..."
. "C:\emsdk\emsdk_env.ps1"

# Add emsdk mingw to PATH
$env:PATH = "C:\emsdk\mingw\7.1.0_64bit\bin;$env:PATH"

# Ensure directories exist
if (-not (Test-Path $BuildDir)) { New-Item -ItemType Directory -Path $BuildDir | Out-Null }
if (-not (Test-Path $DistDir)) { New-Item -ItemType Directory -Path $DistDir | Out-Null }

# Build directly with emcc to avoid CMake/Make issues for single-file project
Write-Host "Building rad-core with emcc..."

# Change to source directory to simplify paths or stay here
Push-Location $SourceDir

# Run emcc with explicit arguments on one line to avoid PowerShell parsing issues with backticks
& emcc src/core.c -O3 -s WASM=1 -s STANDALONE_WASM=1 -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=16777216 --no-entry -o "$DistDir/rad-core.wasm"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed!"
    exit 1
}

Pop-Location
Write-Host "Done."
