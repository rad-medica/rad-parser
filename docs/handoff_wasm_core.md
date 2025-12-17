# WASM Core Module Handoff & Status

## 🎯 Objective

**Minimize the `rad-core.wasm` core size to < 10 KB.**

The goal is to replace the heavy legacy Rust implementation with a lightweight, bare-metal WASM module for critical DICOM parsing tasks (DS, IS, Date, Time), matching the efficiency of the RLE codec (5 KB).

## 🗑️ Code Removal & Cleanup Information

To achieve this goal, the following components and approaches were **permanently removed**:

1.  **Legacy Rust Codebase**:

    - _Removed_: `src/wasm-core/`, `src/wasm-codecs/`, `src/wasm-core-build/`.
    - _Reason_: Excessive binary size (~2MB+) due to Rust std lib and panic handling overhead not suitable for these small utilities.

2.  **Zig Standard Library**:

    - _Removed_: All usage of `std.fmt`, `std.mem`, `std.heap` in `core.zig`.
    - _Reason_: Even minimal Zig usage pulled in ~775KB of runtime code.

3.  **Floating Point Logic (in WASM)**:

    - _Removed_: `double` and `float` types in `core.c`.
    - _Removed_: `parse_ds` returning floats.
    - _Reason_: Float operations triggered the inclusion of `compiler-rt` soft-float libraries in WASM, adding ~300KB.
    - _Replacement_: `parse_ds` now returns fixed-point integers (scaled by 1e6) or parsing is deferred to JavaScript.

4.  **LUT Generation (in WASM)**:

    - _Removed_: Modality and VOI LUT generation functions.
    - _Reason_: Required heavy floating-point math.
    - _Replacement_: Logic moved to/kept in JavaScript.

5.  **C++ Runtime**:

    - _Removed_: `linkLibCpp()` and `.cpp` extensions.
    - _Reason_: Unnecessary overhead for this simple logic.

6.  **Libc Dependency**:
    - _Removed_: `linkLibC()` call.
    - _Reason_: Standard libc (even WASI's) adds significant weight. Replaced with custom static bump allocator.

## ⚖️ Tradeoffs Analysis (vs. Previous Rust/Zig Version)

| Feature             | Previous (Rust/Zig)        | Current (Minimal C)       | Impact                                                                     |
| :------------------ | :------------------------- | :------------------------ | :------------------------------------------------------------------------- |
| **Binary Size**     | ~1.2MB - 2MB               | **Goal: < 10KB**          | **Huge Win**: ~99% size reduction. Faster load times.                      |
| **Safety**          | High (Rust memory safety)  | Low (Manual C pointers)   | **Tradeoff**: Risk of buffer overflows, but code is simple and isolated.   |
| **Float Precision** | Full IEEE-754 in WASM      | Fixed-point / JS Deferral | **Tradeoff**: Code complexity moved to JS. `parse_ds` returns scaled ints. |
| **Feature Set**     | Complete (LUTs, Resale)    | Critical Parsing Only     | **Tradeoff**: LUTs & complex math moved to JS to avoid soft-float bloat.   |
| **Developer Exp**   | Modern Tooling (Cargo/Zig) | Raw C / Manual Build      | **Tradeoff**: Harder to debug (no stack traces in freestanding).           |

**Verdict**: The massive size reduction is necessary for the web usage context, justifying the loss of memory safety guards and floating-point convenience in the core module. The complexity has successfully been shifted to JavaScript where it belongs for this architecture.

## 🛠️ Current Implementation Status

**File**: `src/zig-core/src/core.c`

- **Language**: Pure C (C11)
- **Target**: Freestanding WASM (no OS deps)
- **Dependencies**: None (No libc, no Zig std, no C++ runtime)
- **Memory**: Custom 64KB static buffer with bump pointer allocator.

**Build Config**: `src/zig-core/build.zig`

- Target: `.cpu_arch = .wasm32`, `.os_tag = .freestanding`
- Flags: `-O3`, `-DNDEBUG`, `-fno-builtin`
- Linker: No entry point (`.entry = .disabled`), Dynamic exports (`.rdynamic = true`)

## 📉 Size Investigation: The 495KB Mystery

Despite stripping everything down to bare C code, the binary is **495 KB**.
For comparison, `rad-codecs-rle.wasm` is **5 KB**, using the same toolchain but _with_ libc linked.

| Feature       | Core (Current)      | RLE (Reference)        |
| :------------ | :------------------ | :--------------------- |
| **Size**      | **495 KB**          | **5 KB**               |
| **Source**    | Pure C              | C++                    |
| **Std Lib**   | None (Freestanding) | LibC + LibCpp          |
| **Floats**    | No                  | No                     |
| **Allocator** | Custom Static       | Malloc/Free (via LibC) |
| **OS Tag**    | `.freestanding`     | `.wasi`                |

### Hypothesis

The Zig build system's `freestanding` target for WASM might be implicitly linking a large startup or runtime shim (possibly for stack traces or error handling) that isn't being tree-shaken, whereas the WASI target used by RLE might have better linker optimization paths for "library" mode.

## 🚀 Next Steps for the Agent

To fix this and reach the < 10KB goal:

1.  **Analyze the 495KB Binary**:

    - Run `wasm-objdump -h` or `wasm2wat` to see _what_ functions are taking up space. Look for `compiler-rt` or Zig runtime symbols.

2.  **Bypass Zig Build System (Test)**:

    - Try compiling `src/core.c` directly with `clang`:
      ```bash
      clang --target=wasm32 -nostdlib -Wl,--no-entry -Wl,--export-all -O3 -o core.wasm src/core.c
      ```
    - If this produces a tiny binary (expected < 5KB), the issue is definitely in `build.zig` defaults.

3.  **Align with RLE Build**:
    - Try reverting `core.c` to use `malloc`/`free` (like RLE).
    - Switch `build.zig` back to `.os_tag = .wasi`.
    - **Crucial**: Check if RLE's specific `common.h` macros (`WASM_EXPORT` attributes) interact with the linker to allow aggressive stripping which `core.c` might be missing.
