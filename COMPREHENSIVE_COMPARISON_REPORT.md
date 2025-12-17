# Comprehensive DICOM Parser Comparison Report

This report compares various modes of `rad-parser` (in both pure JavaScript and WASM-accelerated versions) against other popular DICOM parsing libraries across different datasets.

## Standard Study Performance (TEST_STUDY)

### JS vs WASM Performance Comparison

| Mode      | JS Avg Time | WASM Avg Time | Reliability |
| :-------- | :---------- | :------------ | :---------- |
| fast      | 5.92 ms     | 7.23 ms       | 100%        |
| shallow   | 122.28 μs   | 271.23 μs     | 100%        |
| medium    | 609.16 μs   | 649.02 μs     | 100%        |
| full      | 809.01 μs   | 917.43 μs     | 100%        |
| streaming | 4.52 ms     | 4.68 ms       | 100%        |

### Benchmark Summary

| Parser             | Files | Success % | Avg Time  | Avg Elements |
| :----------------- | :---- | :-------- | :-------- | :----------- |
| rad-shallow-js     | 621   | 100.0%    | 122.28 μs | 99           |
| dicom-parser       | 621   | 100.0%    | 147.38 μs | 99           |
| rad-shallow-wasm   | 621   | 100.0%    | 271.23 μs | 99           |
| rad-medium-js      | 621   | 100.0%    | 609.16 μs | 99           |
| rad-medium-wasm    | 621   | 100.0%    | 649.02 μs | 99           |
| rad-full-js        | 621   | 100.0%    | 809.01 μs | 99           |
| rad-full-wasm      | 621   | 100.0%    | 917.43 μs | 99           |
| dcmjs              | 621   | 100.0%    | 3.33 ms   | 92           |
| rad-streaming-js   | 621   | 100.0%    | 4.52 ms   | 99           |
| rad-streaming-wasm | 621   | 100.0%    | 4.68 ms   | 99           |
| rad-fast-js        | 621   | 100.0%    | 5.92 ms   | 25           |
| rad-fast-wasm      | 621   | 100.0%    | 7.23 ms   | 25           |
| efferent-dicom     | 621   | 100.0%    | 9.10 ms   | 98           |

## Edge Case Reliability & Performance (EDGE_CASES)

### JS vs WASM Performance Comparison

| Mode      | JS Avg Time | WASM Avg Time | Success |
| :-------- | :---------- | :------------ | :------ |
| fast      | 9.04 ms     | 8.00 ms       | 100.0%  |
| shallow   | 20.87 ms    | 16.25 ms      | 100.0%  |
| medium    | 15.70 ms    | 16.63 ms      | 100.0%  |
| full      | 17.11 ms    | 13.97 ms      | 100.0%  |
| streaming | 35.98 ms    | 32.03 ms      | 100.0%  |

### Benchmark Summary

| Parser             | Files | Success % | Avg Time  | Avg Elements |
| :----------------- | :---- | :-------- | :-------- | :----------- |
| dicom-parser       | 254   | 88.2%     | 187.81 μs | 84           |
| efferent-dicom     | 254   | 99.6%     | 1.61 ms   | 71           |
| dcmjs              | 254   | 89.0%     | 1.97 ms   | 76           |
| rad-fast-wasm      | 254   | 100.0%    | 8.00 ms   | 37           |
| rad-fast-js        | 254   | 100.0%    | 9.04 ms   | 37           |
| rad-full-wasm      | 254   | 100.0%    | 13.97 ms  | 100          |
| rad-medium-js      | 254   | 100.0%    | 15.70 ms  | 100          |
| rad-shallow-wasm   | 254   | 100.0%    | 16.25 ms  | 76           |
| rad-medium-wasm    | 254   | 100.0%    | 16.63 ms  | 100          |
| rad-full-js        | 254   | 100.0%    | 17.11 ms  | 100          |
| rad-shallow-js     | 254   | 100.0%    | 20.87 ms  | 76           |
| rad-streaming-wasm | 254   | 100.0%    | 32.03 ms  | 111          |
| rad-streaming-js   | 254   | 100.0%    | 35.98 ms  | 111          |

## Capability Matrix

| Feature              | rad-fast | rad-shallow | rad-medium | rad-full | rad-streaming | dcmjs | dicom-parser | effererent-dicom |
| :------------------- | :------- | :---------- | :--------- | :------- | :------------ | :---- | :----------- | :--------------- |
| **Core Parsing**     | ✅       | ✅          | ✅         | ✅       | ✅            | ✅    | ✅           | ✅               |
| **WASM Support**     | ✅       | ✅          | ✅         | ✅       | ✅            | ❌    | ❌           | ❌               |
| **Streaming**        | ❌       | ❌          | ❌         | ❌       | ✅            | ❌    | ❌           | ❌               |
| **100% Reliability** | ✅       | ✅          | ✅         | ✅       | ⚠️            | ❌    | ❌           | ⚠️               |
| **Pixel Data**       | ❌       | ❌          | ❌         | ✅       | ✅            | ✅    | ⚠️           | ⚠️               |
| **Sequences**        | ⚠️       | ⚠️          | ✅         | ✅       | ✅            | ✅    | ⚠️           | ⚠️               |

## Recommendations

1. **For Maximum Speed**: Use `rad-fast-wasm`. It provides the fastest parsing for basic tags.
2. **For General Use**: Use `rad-full-wasm`. It offers the best balance of features, performance, and 100% reliability.
3. **For Large Files**: Use `rad-streaming-wasm` to process files in chunks without loading everything into memory.
4. **For Compatibility**: `rad-full` provides the most comprehensive dataset compatible with other libraries.
