# RAD-Parser Scripts

This directory contains utility scripts for building, testing, verification, and debugging of the `rad-parser` library.

## Build & Publishing

- **`build_package.ts`**: Main build script for the npm package.
- **`build_standalone.ts`**: Builds the standalone browser bundle.
- **`copy_wasm_package.ts`**: Helper to copy WASM assets during build.
- **`post_build_package.ts`**: Post-processing for package distribution.

## Verification & Testing

- **`verify_codecs.ts`**: The primary verification suite for the Codecs module. detailed round-trip testing (Transcode -> Write -> Read -> Decode -> Compare) for all supported transfer syntaxes.
    - Usage: `bun run scripts/verify_codecs.ts`
- **`manual_test_zig.ts`**: Manual test script for Zig/WASM codecs (formerly `src/codecs/test-zig.ts`).
- **`verify_unified_api.ts`**: Verifies the high-level unified API surface.

## Data Generation & Output

- **`generate_all_codecs.ts`**: Transcodes a base DICOM file into all supported Transfer Syntaxes (WASM and Native) to create a test dataset.
    - Usage: `bun run scripts/generate_all_codecs.ts [input_file]`
- **`export_bitmaps.ts`**: Decodes DICOM pixel data and exports it as BMP images for visual inspection. Useful for comparing output against other parsers (dcmjs, dicom-parser).

## Debugging & Inspection Tools

- **`dump_dicom.ts`**: Parses a DICOM file and dumps the dataset structure to a JSON file.
    - Usage: `bun run scripts/dump_dicom.ts <file> [output_json]`
- **`dump_header.ts`**: Dumps the DICOM File Meta Information header.
- **`hex_dump.ts`**: Provides a hex dump of specific file regions, useful for inspecting tag boundaries or pixel data info.
- **`compare_outputs.ts`**: Compares the parsing result of `rad-parser` against `dcmjs` to ensure accuracy.
- **`compare_pixel_values.ts`**: Binary comparison of pixel data between two files.
- **`ensure_utf8.ts`**: Utility to check/convert file encoding.

## Helpers

- **`bmp.ts`**: Internal helper for writing BMP files.
