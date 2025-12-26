cmake_minimum_required(VERSION 3.10)
project(rad-core C)

set(CMAKE_C_STANDARD 11)

# Add emscripten specific flags
add_definitions(-DEMSCRIPTEN)

add_executable(rad-core src/core.c)

# Emscripten Link Flags to match behavior
set_target_properties(rad-core PROPERTIES LINK_FLAGS " \
    -s WASM=1 \
    -s STANDALONE_WASM=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=16777216 \
    -O3 \
    --no-entry \
")
# Note: INITIAL_MEMORY=16777216 (16MB) to match the internal heap if needed,
# although our heap is static array so it lives in data segment.
# But we need stack too.
# The code defines `static uint8_t heap[16 * 1024 * 1024];` which takes 16MB of global data.
# Emscripten will put this in linear memory.
