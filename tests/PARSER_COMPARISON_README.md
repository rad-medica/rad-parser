# Parser Comparison Tests and Benchmarks

This directory contains comprehensive tests and benchmarks comparing `rad-parser` with other DICOM parsers in the ecosystem.

## Test Files

### `parser_comparison.test.ts`

A comprehensive test suite that compares `rad-parser` with:
- **dcmjs** - A DICOM parsing library
- **dicom-parser** - Another DICOM parser
- **efferent-dicom** - A DICOM parser library

#### Test Suites

1. **Basic Parsing Compatibility**
   - Verifies that `rad-parser` can parse files that other parsers can parse
   - Checks success rates across all parsers
   - Ensures `rad-parser` has at least 90% of the success rate of the best parser

2. **Transfer Syntax Detection**
   - Compares transfer syntax detection across parsers
   - Verifies that `rad-parser` correctly identifies transfer syntaxes
   - Expects 80%+ match rate with other parsers

3. **Element Count Comparison**
   - Compares the number of elements parsed by each parser
   - Ensures `rad-parser` parses a similar number of elements (within 20% of average)

4. **Metadata Extraction**
   - Compares extraction of common metadata fields:
     - Patient Name (0010,0010)
     - Study Date (0008,0020)
     - Modality (0008,0060)
   - Verifies that extracted values match across parsers

#### Running the Tests

```bash
npm test tests/parser_comparison.test.ts
```

Or run all tests:
```bash
npm test
```

## Benchmark Script

### `scripts/benchmark.ts`

A performance benchmarking script that compares parsing speed and memory usage across parsers.

#### Features

- Tests multiple parser modes:
  - `rad-parser` (full parse)
  - `rad-parser-shallow` (shallow parse)
  - `rad-parser-medium` (light parse, skips pixel data)
  - `dcmjs`
  - `dicom-parser`
  - `efferent-dicom`

- Collects statistics:
  - Parse time (min, max, average)
  - Success rate
  - Element count
  - File size statistics
  - Error reporting

- Outputs:
  - Console summary with performance comparison
  - Detailed JSON results in `scripts/results/benchmark-summary.json`
  - Individual parser outputs in `scripts/results/{parser-name}/`

#### Running the Benchmark

```bash
npm run benchmark
```

Or directly:
```bash
tsx scripts/benchmark.ts
```

#### Test Data

The benchmark automatically searches for DICOM files in:
- `test_data/TEST/SOLO/`
- `test_data/TEST/SUBF/` (and subdirectories)
- `test_data/REAL/DICOM/`
- `test_data/patient/DICOM/` (legacy)
- `test_data/examples/` (legacy)

It recursively finds all DICOM files (minimum 132 bytes) and uses up to 100 files for benchmarking.

## Expected Results

### Performance

Based on the README, `rad-parser` should show:
- **~1.0 ms** average parse time for shallow scans
- **~1.2x faster** than `dicom-parser` for shallow scans
- **~3.5 ms** average parse time for full parses

### Compatibility

- `rad-parser` should successfully parse files that other parsers can parse
- Transfer syntax detection should match other parsers
- Element counts should be similar (within 20%)
- Metadata extraction should match other parsers

## Notes

- Tests use a subset of files (50-100) to keep execution time reasonable
- Some parsers may fail on certain edge cases or compressed formats
- The comparison focuses on correctness and compatibility, not just performance
- Benchmark results are saved to JSON for further analysis

