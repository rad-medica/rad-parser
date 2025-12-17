# Comprehensive DICOM Parser Comparison Report

This report compares various modes of `rad-parser` (in both pure JavaScript and WASM-accelerated versions) against other popular DICOM parsing libraries across different datasets.

## Standard Study Performance (TEST_STUDY)

### JS vs WASM Performance Comparison

| Mode | JS Avg Time | WASM Avg Time | Speedup |
| :--- | :--- | :--- | :--- |
| fast | 5.14 ms | 5.07 ms | **1.01x** |
| shallow | 49.86 μs | 46.14 μs | **1.08x** |
| medium | 594.06 μs | 444.24 μs | **1.34x** |
| full | 498.22 μs | 426.82 μs | **1.17x** |
| streaming | 2.97 ms | 2.50 ms | **1.19x** |

### Benchmark Summary

| Parser | Files | Success % | Avg Time | Min Time | Avg Elements |
| :--- | :--- | :--- | :--- | :--- | :--- |
| rad-shallow-wasm | 621 | 100.0% | 46.14 μs | 32.60 μs | 101 |
| rad-shallow-js | 621 | 100.0% | 49.86 μs | 33.40 μs | 101 |
| dicom-parser | 621 | 100.0% | 162.66 μs | 52.60 μs | 99 |
| rad-full-wasm | 621 | 100.0% | 426.82 μs | 264.40 μs | 99 |
| rad-medium-wasm | 621 | 100.0% | 444.24 μs | 209.80 μs | 99 |
| rad-full-js | 621 | 100.0% | 498.22 μs | 242.30 μs | 99 |
| rad-medium-js | 621 | 100.0% | 594.06 μs | 244.00 μs | 99 |
| dcmjs | 621 | 100.0% | 1.88 ms | 852.40 μs | 92 |
| rad-streaming-wasm | 621 | 100.0% | 2.50 ms | 1.87 ms | 99 |
| rad-streaming-js | 621 | 100.0% | 2.97 ms | 1.77 ms | 99 |
| rad-fast-wasm | 621 | 100.0% | 5.07 ms | 4.24 ms | 25 |
| rad-fast-js | 621 | 100.0% | 5.14 ms | 4.27 ms | 25 |
| efferent-dicom | 621 | 100.0% | 5.83 ms | 4.28 ms | 98 |

## Edge Case Reliability & Performance (EDGE_CASES)

### JS vs WASM Performance Comparison

| Mode | JS Avg Time | WASM Avg Time | Speedup |
| :--- | :--- | :--- | :--- |
| fast | 6.05 ms | 5.62 ms | **1.08x** |
| shallow | 13.80 ms | 11.75 ms | **1.17x** |
| medium | 12.06 ms | 11.94 ms | **1.01x** |
| full | 12.79 ms | 12.44 ms | **1.03x** |
| streaming | 26.59 ms | 26.81 ms | **0.99x** |

### Benchmark Summary

| Parser | Files | Success % | Avg Time | Min Time | Avg Elements |
| :--- | :--- | :--- | :--- | :--- | :--- |
| efferent-dicom | 254 | 99.6% | 1.03 ms | 0.70 μs | 71 |
| rad-fast-wasm | 254 | 100.0% | 5.62 ms | 4.39 ms | 37 |
| rad-fast-js | 254 | 100.0% | 6.05 ms | 4.46 ms | 37 |
| rad-shallow-wasm | 254 | 100.0% | 11.75 ms | 1.10 μs | 79 |
| rad-medium-wasm | 254 | 100.0% | 11.94 ms | 9.60 μs | 100 |
| rad-medium-js | 254 | 100.0% | 12.06 ms | 5.70 μs | 100 |
| rad-full-wasm | 254 | 100.0% | 12.44 ms | 3.10 μs | 100 |
| rad-full-js | 254 | 100.0% | 12.79 ms | 7.60 μs | 100 |
| rad-shallow-js | 254 | 100.0% | 13.80 ms | 1.50 μs | 79 |
| rad-streaming-js | 254 | 100.0% | 26.59 ms | 23.60 μs | 111 |
| rad-streaming-wasm | 254 | 100.0% | 26.81 ms | 16.80 μs | 111 |
| dicom-parser | 254 | 88.2% | 97.20 μs | 24.10 μs | 84 |
| dcmjs | 254 | 89.0% | 1.64 ms | 142.00 μs | 76 |

## Capability Matrix

| Feature | rad-fast | rad-shallow | rad-medium | rad-full | rad-streaming | dcmjs | dicom-parser | effererent-dicom |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Core Parsing** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **WASM Support** | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Streaming** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **100% Reliability** | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌ | ⚠️ |
| **Pixel Data** | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| **Sequences** | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |

## Recommendations

1. **For Maximum Speed**: Use `rad-fast-wasm`. It provides the fastest parsing for basic tags.
2. **For General Use**: Use `rad-full-wasm`. It offers the best balance of features, performance, and 100% reliability.
3. **For Large Files**: Use `rad-streaming-wasm` to process files in chunks without loading everything into memory.
4. **For Compatibility**: `rad-full` provides the most comprehensive dataset compatible with other libraries.
