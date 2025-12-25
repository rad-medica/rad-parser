#!/bin/bash
# Build script for Emscripten-based WASM codecs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
OUTPUT_DIR="${SCRIPT_DIR}/dist"

# Check for Emscripten
if ! command -v emcc &> /dev/null; then
    echo "Error: Emscripten (emcc) not found. Please install and activate emsdk."
    echo "See: https://emscripten.org/docs/getting_started/downloads.html"
    exit 1
fi

echo "Using Emscripten version: $(emcc --version | head -1)"

# Create build directory
mkdir -p "${BUILD_DIR}"
mkdir -p "${OUTPUT_DIR}"

cd "${BUILD_DIR}"

# Configure with Emscripten
echo "Configuring with CMake..."
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release

# Build
echo "Building WASM modules..."
emmake make -j$(nproc 2>/dev/null || echo 4)

# Copy outputs to dist
echo "Copying outputs to dist..."
cp *.js *.wasm "${OUTPUT_DIR}/" 2>/dev/null || true

echo "Build complete! Outputs in ${OUTPUT_DIR}"
ls -la "${OUTPUT_DIR}"
