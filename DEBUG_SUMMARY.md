# The Case of the Persistent Error -5: A Technical Deep Dive (Ultimate Edition)

## 0. The Problem Framework (WHAT, HOW, WHY)

### **WHAT is happening?** (The Observable Symptom)

We are running a transcoding test for JPEG Baseline (`test_codecs_transcode.ts`).

- **Input**: A DICOM file (16-bit or 8-bit).
- **Operation**: The Javascript wrapper calls the WebAssembly (WASM) function `encode_jpeg`.
- **Expected Result**: Success (`0`) or a specific error code mapping to our new logic (`-11` to `-20`, or `-999`).
- **Actual Result**: The WASM module consistently returns error code `-5`.
- **Paradox**: The source code (`main.zig`) currently on disk **DOES NOT CONTAIN** the integer `-5` anywhere in its return statements.

### **HOW is it happening?** (The Mechanism)

The Runtime Environment (Node.js/Bun) is loading a **WASMBinary object** that differs from the **Source Code**.

- The test runner loads `dist/package/wasm-codecs/rad-codecs-jpeg.wasm`.
- This file is supposed to be updated by the `bun run build:wasm:codecs` command.
- The build command triggers `zig build`.
- However, due to aggressive caching or filesystem locking, the `zig build` step is **skipping** the compilation (reporting `[0/13] steps`), or the `copy` step is failing to overwrite the destination file.
- Thus, the loader resolves and executes an "Old" (Zombie) binary from hours ago, which _did_ use error code `-5`.

### **WHY is it happening?** (The Root Cause)

1.  **Immutability illusion**: We assumed running "Build" always produces a new file. Zig optimizes for speed by hashing inputs; if the inputs appear unchanged (timestamp/hash collision or race condition), it reuses the old artifact.
2.  **OS Constraints (Windows)**: Windows file locking prevents overwriting files execution-locked by zombies or lingering processes. `fs.copyFileSync` might silently fail or be ignored if wrapped in loose error handling.
3.  **Human/Tool Gap**: We edited the code but didn't verify the _timestamp_ of the output binary, trusting the "Success" exit code of the build script.

---

## 1. Executive Problem Summary

**Symptom**: The `rad-parser` WASM JPEG codec consistently returns error code `-5` (via `JPEG encode failed: -5` exception) during integration tests, despite the underlying Zig source code being modified to remove all instances of this return code.
**Root Cause Diagnosis**: The Build/Link/Copy pipeline is failing to actuate changes on the binary that is actually loaded by the runtime. The test runner is executing a "stale" or "zombie" WASM binary from a previous build state, likely due to Zig build caching or `rimraf` failures in the build script.

---

## 2. Technical Architecture & Environment

### 2.1 The Repository Structure

- **Root Folder**: `C:\Users\aroja\CODE\rad-parser`
- **Source Code (Zig)**: `src\zig-codecs\src\main.zig` (The brain)
- **Build Definition**: `src\zig-codecs\build.zig` (The recipe)
- **Build Output (Zig)**: `src\zig-codecs\zig-out\bin\rad-codecs-jpeg.wasm` (The fresh artifact)
- **Distribution (Package)**: `dist\package\wasm-codecs\rad-codecs-jpeg.wasm` (The stale artifact)
- **Loader Logic**: `src\codecs\wasm-codecs-loader.ts` (The gatekeeper)

### 2.2 The Build Pipeline (Micro-Steps)

1.  **Trigger**: User runs `bun run build:wasm:codecs`.
2.  **Process**: Bun spawns `zig build --release=fast -p zig-out` in cwd `src/zig-codecs`.
3.  **Zig Compiler**:
    - Parses `build.zig`.
    - Computes dependency graph DAG.
    - Hashes `src/main.zig` + `deps/libjpeg-turbo/...` + Build Flags.
    - Checks `.zig-cache` for matching hash.
    - **FAILURE POINT**: If hash matches (false positive), Zig outputs `[0/13] steps` and touches nothing.
4.  **Copy Script**: `bun scripts/copy_wasm_package.ts`.
    - Reads `src/zig-codecs/zig-out/bin/rad-codecs-jpeg.wasm`.
    - Writes to `dist/package/wasm-codecs/rad-codecs-jpeg.wasm`.
    - **FAILURE POINT**: `fs.copyFileSync` on Windows does NOT throw if source implies "no change", or if destination is locked (sometimes).
5.  **Runtime**: `node` (via `bun test`) loads `wasm-codecs-loader.ts`.
    - Resolves path.
    - `fs.readFileSync(resolvedPath)`.
    - **FAILURE POINT**: If path resolution prefers a cached/shadowed/locked file, it loads the Zombie Binary.

---

## 3. The Implementation Saga (Detailed Chronology)

### 3.1 Initial State (Baseline / Ancient History)

The `encode_jpeg` function signature was:

```zig
// ABI: (pixel_data: ptr, len: i32, width: i32, height: i32, quality: i32) -> i32
export fn encode_jpeg(pixel_data: [*]const u8, len: usize, width: u32, height: u32, quality: u8) c_int
```

It incorrectly assumed RGB input (`TJPF_RGB` = 0) and 3 components.

### 3.2 Change Set 1: Native Grayscale (The Formatting)

**Goal**: Support 1-component input without JS conversion.
**Diff Applied**:

```diff
- export fn encode_jpeg(pixel_data: [*]const u8, len: usize, width: u32, height: u32, quality: u8) c_int {
+ export fn encode_jpeg(pixel_data: [*]const u8, len: usize, width: u32, height: u32, components: i32, quality: u8) c_int {
...
+   // Logic added to switch pixelFormat based on components count
+    if (components == 1) {
+        pixelFormat = TJPF_GRAY; // Value 2 in TurboJPEG
+        subsamp = TJSAMP_GRAY;   // Value 3 in TurboJPEG
+    }
```

**Result**: Test failed with `-5`.

### 3.3 Change Set 2: 16-bit Downscaling (The Logic)

**Goal**: Handle 16-bit input by downscaling to 8-bit. Standard JPEG (process 1) is 8-bit only. DICOM often sends 12-16 bits.
**Diff Applied**:

```diff
- export fn encode_jpeg(..., components: i32, quality: u8) c_int {
+ export fn encode_jpeg(..., components: i32, quality: u8, bits: i32) c_int {
...
+   if (bits > 8) {
+       // 1. Calculate size: width * height * components
+       // 2. Alloc temp buffer via std.heap.wasm_allocator
+       // 3. Loop pixels: val = src[i] >> (bits - 8); dst[i] = val;
+       // 4. Update pointer to use temp buffer
+   }
```

**Result**: Test `FAILED encoding JPEG_Baseline`. Exception: `JPEG encode failed: -5`.

### 3.4 Change Set 3: Forensic Debugging (The "Canary" Build)

**Goal**: Prove that the running code is **not** the source code.
**Method**: We assigned unique, impossible-to-confuse error codes to every failure point.
**Code State (Current `main.zig`)**:

| Condition                       | Old Error | **NEW Canary Error** |
| :------------------------------ | :-------- | :------------------- |
| `tjInitCompress` == null        | ?         | **-999**             |
| `components` invalid            | -1        | **-14**              |
| `tjCompress2` != 0              | -12       | **-12**              |
| `allocator.alloc` (result) fail | -13       | **-13**              |
| `allocator.alloc` (temp) fail   | (N/A)     | **-20**              |

**Observation**: The source code logic **NEVER** returns `-5`. `-5` is effectively deleted from the source universe of `encode_jpeg`.
**Runtime Output**: `JPEG encode failed: -5`.
**Conclusion**: The runtime binary contains logic that _can_ return `-5`. The only binary that did that was the one from **before Change Set 3**.

---

## 4. Deep Analysis of the Failure Mechanism

### 4.1 The Zig Build Cache (The Silent Killer)

Zig's build system (`std.Build`) is aggressively cached.

- **Scenario**: We edited `main.zig` via `replace_file_content`.
- **Mechanism**: If the filesystem timestamp did not advance significantly (sub-second resolution issues on some FS), or if Zig's cache database (`.zig-cache`) is corrupted, it computes the input hash, finds a match, and **STOPS**.
- **Result**: It prints `[0/13] steps` (Success, Nothing to do).
- **Impact**: `zig-out/bin/rad-codecs-jpeg.wasm` remains the file from 2 hours ago.

### 4.2 The Loader Priority (The Labyrinth)

`wasm-codecs-loader.ts` has a complex resolution tree.

- Priority 0: `dist/package/wasm-codecs` (Intended for published package)
- Priority 1: `dist/wasm-codecs` (Intended for webpack bundle)
- Priority 2: `src/zig-codecs/zig-out/bin` (Dev build)

If `copy_wasm_package.ts` executes but simply blindly copies the _old_ cached file from `zig-out` to `dist/package`, the Loader picks up the old file.
Even worse: If `dist/package/...` is **LOCKED**, and `copy` fails silently (or we missed the error), Loader loads the locked execution file.

### 4.3 Windows File Locking (The OS Barrier)

On Windows, you cannot overwrite a file that is currently memory-mapped or open by a process.

- **Scenario**: A previous run of `bun test` crashed or didn't exit cleanly, leaving a zombie `bun.exe` or `node.exe` process holding a handle to `rad-codecs-jpeg.wasm`.
- **Impact**: `fs.writeFileSync` waits or fails. If the build script uses a "force" flag that ignores errors, we think we updated it, but we didn't.

### 4.4 TurboJPEG ABI Mismatch (The ABI Theory)

If WASM calls C via FFI, and signatures mismatch.

- **WASM Export**: `encode_jpeg(p, l, w, h, q)` (Old: 5 args)
- **JS Call**: `encode_jpeg(p, l, w, h, c, q, b)` (New: 7 args)
- In standard calling convention, extra args might be ignored, or stack misalignment occurs.
- If we call the Old function (5 args) with 7 args:
    - WASM receives: `ptr`, `len`, `width`, `height`, `components` (as quality).
    - If `components` (1) is interpreted as quality (1), it effectively does lowest quality.
    - But `encode_jpeg` old logic does `tjCompress2(..., quality, ...)`.
    - It does NOT explain `-5`.
    - **However**: If `allocator.alloc` fails (Error -5 in old code), that explains it.

---

## 5. The Definitive Fix Plan (Nuclear Option)

To exorcise the "Zombie Binary", we must perform a **Hard Clean** that bypasses all incremental logic.
We will invoke `cmd /c` to bypass NodeJS filesystem wrappers.

### 5.1 Step 1: Nuclear Option on Artifacts

Run the following PowerShell commands to delete all artifacts. We do not trust `zig clean`.

```powershell
# Stop all potentially lock-holding processes
taskkill /F /IM bun.exe /T
taskkill /F /IM node.exe /T

# Force delete directories
Remove-Item -Recurse -Force src/zig-codecs/zig-out
Remove-Item -Recurse -Force src/zig-codecs/.zig-cache
Remove-Item -Recurse -Force dist/package/wasm-codecs
```

### 5.2 Step 2: Verification of Absence

Verify that `dist/package/wasm-codecs/rad-codecs-jpeg.wasm` is **Gone**. If it remains, investigate file locks (Task Manager -> End Node processes).

### 5.3 Step 3: Clean Build

Run `zig build --release=fast` manually in `src/zig-codecs`.
**Success Criteria**: Output must show `Compile ...`, `Install ...`, `[X/13] steps` where X > 0.
**Verification**: `Get-Date (Get-Item src/zig-codecs/zig-out/bin/rad-codecs-jpeg.wasm).LastWriteTime` must match NOW.

### 5.4 Step 4: Fresh Copy & Test

Run the copy script and then the test.
**Prediction**: The error `-5` will disappear. We will either get success (`0`) or a "Canary" error (e.g., `-20` if out of memory, or `-12` if TurboJPEG fails).

---

## 6. Binary Forensics (If Build Fails)

If after the nuclear clean we STILL see `-5`, we inspect the binary itself:
`bun scripts/inspect_wasm_again.ts` checks exports.

- **Old Binary**: `encode_jpeg` takes 5 params (if inspected via signature) or verified by behavior.
- **New Binary**: `encode_jpeg` takes 7 params.
  We can also `grep` the WASM file for literals if we added any string log, but we are in `ReleaseFast` (stripped). We relies on the export signature and behavior.

---

## 7. Memory & Allocator Internals

The Zig code uses `std.heap.wasm_allocator`.

- This maps directly to WASM `memory.grow` opcode (brk).
- If we allocate for `bits > 8`, we double the memory usage (Input buffer + Output downscaled buffer).
- If WASM memory limit is 1024 pages (64MB) and the image is massive (e.g. 50MB), allocation fails.
- **Canary Error -20** would trigger here.
- The fact we see `-5` means we haven't even reached this new code.
