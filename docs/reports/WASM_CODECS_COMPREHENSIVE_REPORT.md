# WASM Codecs Comprehensive Test Report

**Date**: Generated on test execution
**Test File**: `test_data/EDGE_CASES/ALL/CT_small.dcm` (128x128, 16-bit)
**Purpose**: Verify all WASM codecs work correctly for DICOM pixel data encoding/decoding

## Executive Summary

This report documents the status of all WASM codecs in the rad-parser project, including fixes applied for Big Endian and RLE Lossless issues, and remaining issues with JPEG 2000 codecs.

## Issues Fixed

### 1. Explicit VR Big Endian (Explicit_VR_BE)

**Problem**: Pixel values were incorrect when converting to Big Endian format. Bytes were being swapped during transcoding, but the writer was not handling the byte-swapping correctly.

**Root Cause**:

- Byte-swapping was happening in `transcode.ts` but the writer (`writer.ts`) was not applying byte-swapping for OW (16-bit) values in Big Endian files
- This caused a mismatch between what was stored and what was expected

**Fix Applied**:

1. Removed byte-swapping from `transcode.ts` - keep pixel data in native Little Endian format (JavaScript native)
2. Added byte-swapping logic in `writer.ts` for OW values when writing Big Endian files
3. The reader (`pixelData.ts`) correctly byte-swaps when reading Big Endian files to convert to Little Endian for JavaScript

**Files Modified**:

- `src/utils/transcode.ts`: Removed byte-swapping during transcoding
- `src/core/writer.ts`: Added byte-swapping for OW values in Big Endian context

**Status**: ✅ **FIXED** - Pixel values now match original

### 2. RLE Lossless

**Problem**: RLE-encoded images appeared as "static" (corrupted) with incorrect pixel values. The issue was with segment interleaving for 16-bit single-component data.

**Root Cause**:

- RLE encoding splits 16-bit pixel data into two segments: MSB (Most Significant Byte) and LSB (Least Significant Byte)
- Encoding pushes segments as `[MSB, LSB]` (seg0=MSB, seg1=LSB)
- Decoding was incorrectly assuming seg0=LSB, seg1=MSB
- This caused the bytes to be interleaved in the wrong order

**Fix Applied**:

1. Fixed TypeScript RLE decoder (`src/codecs/rle.ts`) to correctly interpret segment order:
    - seg0 = MSB (first segment)
    - seg1 = LSB (second segment)
    - Output: LSB first, MSB second (Little Endian format)
2. Verified C++ and Zig WASM decoders already had correct logic (seg0→msb_buf, seg1→lsb_buf, then interleave as lsb_buf, msb_buf)

**Files Modified**:

- `src/codecs/rle.ts`: Fixed segment order interpretation in 16-bit single-component decoding

**Status**: ✅ **FIXED** - Pixel values now match original

## Current Codec Status

### ✅ Working Codecs

1. **Explicit VR Big Endian** (`1.2.840.10008.1.2.2`)
    - Encode: ✅ Working
    - Decode: ✅ Working
    - Pixel Match: ✅ Matches original

2. **RLE Lossless** (`1.2.840.10008.1.2.5`)
    - Encode: ✅ Working
    - Decode: ✅ Working
    - Pixel Match: ✅ Matches original

3. **Explicit VR Little Endian** (`1.2.840.10008.1.2.1`)
    - Status: ✅ Working (baseline, no issues)

4. **Implicit VR Little Endian** (`1.2.840.10008.1.2`)
    - Status: ✅ Working (baseline, no issues)

### ⚠️ Codecs with Issues

1. **JPEG 2000 Lossless** (`1.2.840.10008.1.2.4.90`)
    - Encode: ❌ Failing
    - Decode: ❌ Failing with "undefined" error
    - Issue: Memory bounds checking and error handling need improvement
    - Status: **NEEDS FIX**

2. **JPEG 2000 Lossy** (`1.2.840.10008.1.2.4.91`)
    - Encode: ❌ Failing with "Out of bounds memory access"
    - Decode: ❌ Failing with "undefined" error
    - Issue: Memory allocation and bounds checking issues
    - Status: **NEEDS FIX**

## Technical Details

### Big Endian Byte-Swapping Logic

For 16-bit pixel data in Big Endian files:

- **Storage Format**: Bytes are stored as Big Endian (MSB first, LSB second)
- **JavaScript Format**: Native Little Endian (LSB first, MSB second)
- **Conversion**: When writing, swap bytes of each 16-bit word. When reading, swap back.

Example:

- Original LE value: `0xAF00` (44800) stored as bytes `[0xAF, 0x00]` = `[175, 0]`
- Big Endian storage: `0xAF00` stored as bytes `[0x00, 0xAF]` = `[0, 175]`
- When read back: Swap to get `[175, 0]` for JavaScript

### RLE 16-bit Segment Order

For 16-bit single-component RLE:

- **Encoding**: Split pixel data into MSB and LSB planes
    - MSB plane: All most significant bytes
    - LSB plane: All least significant bytes
    - Segments pushed as: `[MSB, LSB]` (seg0=MSB, seg1=LSB)
- **Decoding**:
    - Decode seg0 (MSB) and seg1 (LSB) separately
    - Interleave as: `[LSB, MSB]` to produce Little Endian format
    - Output: `result[p*2] = LSB, result[p*2+1] = MSB`

## Memory Management Improvements

Added memory bounds checking for JPEG 2000 codecs:

- Pre-allocate/grow memory before allocation
- Verify allocated pointer is within bounds before writing
- Better error messages for memory-related failures

## Recent Improvements

### JPEG 2000 Quality Support

Added quality parameter support for JPEG 2000 Lossy encoding:

- Quality parameter (0-100) is now mapped to compression rates (0.05-0.5)
- Higher quality = lower compression rate = better image quality
- Default quality: 0.75 (better quality, lower compression rate)
- Quality 100 = 0.5 rate (2:1 compression, very high quality)
- Quality 90 = 0.25 rate (4:1 compression, high quality)
- Quality 75 = 0.15 rate (6.67:1 compression, medium quality)
- Quality 50 = 0.1 rate (10:1 compression, lower quality)

### Lossless/Lossy Differentiation

Updated encoder to properly differentiate between lossless and lossy modes:

- Lossless mode: `tcp_rates[0] = 0`, `cp_disto_alloc = 1`
- Lossy mode: Uses quality-based compression rate, `cp_disto_alloc = 0`
- Transfer syntax determines mode automatically

## Recommendations

1. **JPEG 2000 Lossless Decode**:
    - Investigate WASM memory bounds checking in decode function
    - Check if lossless-encoded data format differs from lossy in a way that causes decode issues
    - Verify WASM module memory allocation for decode operations
    - Consider testing with different image sizes to isolate the issue

2. **Testing**:
    - Add visual inspection of converted images (user requested)
    - Add automated pixel-by-pixel comparison tests
    - Test with various image sizes and bit depths

3. **Documentation**:
    - Document byte-swapping requirements for Big Endian
    - Document RLE segment order conventions
    - Add codec-specific usage examples

## Test Results

```
Testing Explicit_VR_BE...
  ✓ Encode: 39020 bytes, Decode: 32768 bytes
  ✓ Pixel values match original

Testing RLE_Lossless...
  ✓ Encode: 27374 bytes, Decode: 32768 bytes
  ✓ Pixel values match original

Testing JPEG_2000_Lossless...
  ✗ Decode failed: undefined

Testing JPEG_2000_Lossy...
  ✗ Encode failed: Out of bounds memory access
  ✗ Decode failed: undefined
```

## Next Steps

1. Fix JPEG 2000 encode/decode issues
2. Add visual inspection workflow for converted images
3. Expand test coverage to include more image types
4. Verify all codecs work with 8-bit and 16-bit data
5. Test multi-frame DICOM files

## Files Modified in This Session

- `src/utils/transcode.ts` - Removed Big Endian byte-swapping
- `src/core/writer.ts` - Added Big Endian byte-swapping for OW values
- `src/codecs/rle.ts` - Fixed RLE segment order for 16-bit decoding
- `src/codecs/zig-codecs.ts` - Added memory bounds checking for JPEG 2000
- `src/zig-codecs/src/rle.cpp` - Verified correct segment handling (no changes needed)
- `src/zig-codecs/src/main.zig` - Verified correct segment handling (no changes needed)
- `scripts/test_all_wasm_codecs.ts` - Created comprehensive test script
- `scripts/compare_pixel_values.ts` - Created pixel value comparison script

---

**Note**: This report should be updated after fixing JPEG 2000 issues and after visual inspection of converted images.

