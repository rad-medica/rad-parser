# Comprehensive DICOM Parser Comparison

**Date:** 2025-12-15  
**Test Files:** 254 DICOM files  
**Parsers:** rad-parser (fast, shallow, medium, full, wasm, streaming), dcmjs, dicom-parser, efferent-dicom

---

## Executive Summary

### 🏆 Overall Winner: efferent-dicom

**Key Highlights:**
- **Most Reliable:** efferent-dicom (99.6% success rate)
- **Fastest (100% success):** rad-parser-shallow (2.25 ms average)
- **Most Elements:** rad-parser-streaming (138 elements/file)

---

## Performance Comparison

### Success Rates

| Parser | Success Rate | Files Parsed | Failures |
|--------|-------------|--------------|----------|
| **efferent-dicom** | 99.6% ████████████████████ | 253/254 | 1 |
| **rad-parser-shallow** | 100.0% ████████████████████ | 254/254 | 0 |
| **rad-parser-fast** | 100.0% ████████████████████ | 254/254 | 0 |
| **rad-parser-medium** | 100.0% ████████████████████ | 254/254 | 0 |
| **rad-parser** | 100.0% ████████████████████ | 254/254 | 0 |
| **rad-parser-wasm** | 100.0% ████████████████████ | 254/254 | 0 |
| **rad-parser-streaming** | 100.0% ████████████████████ | 254/254 | 0 |
| **dicom-parser** | 88.2% ██████████████████ | 224/254 | 30 |
| **dcmjs** | 89.0% ██████████████████ | 226/254 | 28 |

### Parse Speed

| Parser | Avg Time | Min Time | Max Time | Throughput | Speed vs Fastest |
|--------|----------|----------|----------|------------|------------------|
| **efferent-dicom** | 1.18 ms | 0.90 μs | 15.17 ms | 849 files/s | 0.52x |
| **rad-parser-shallow** | 2.25 ms | 1.20 μs | 77.52 ms | 445 files/s | 1.00x |
| **rad-parser-fast** | 2.76 ms | 2.14 ms | 5.57 ms | 362 files/s | 1.23x |
| **rad-parser-medium** | 11.53 ms | 8.40 μs | 262.30 ms | 87 files/s | 5.13x |
| **rad-parser** | 11.77 ms | 9.50 μs | 304.38 ms | 85 files/s | 5.24x |
| **rad-parser-wasm** | 12.30 ms | 12.30 μs | 278.69 ms | 81 files/s | 5.47x |
| **rad-parser-streaming** | 23.75 ms | 28.50 μs | 337.03 ms | 42 files/s | 10.56x |
| **dicom-parser** | 100.63 μs | 29.10 μs | 1.38 ms | 9938 files/s | 0.04x |
| **dcmjs** | 1.49 ms | 132.70 μs | 23.99 ms | 673 files/s | 0.66x |

### Element Parsing Depth

| Parser | Avg Elements | Total Elements | Coverage |
|--------|--------------|---------------|----------|
| **efferent-dicom** | 71 | 18.037 | Good |
| **rad-parser-shallow** | 72 | 18.286 | Good |
| **rad-parser-fast** | 37 | 9.425 | Good |
| **rad-parser-medium** | 93 | 23.718 | Good |
| **rad-parser** | 93 | 23.718 | Good |
| **rad-parser-wasm** | 93 | 23.718 | Good |
| **rad-parser-streaming** | 138 | 35.036 | Good |
| **dicom-parser** | 84 | 18.916 | Good |
| **dcmjs** | 76 | 17.170 | Good |

---

## Capability Matrix

| Feature | rad-fast | rad-shallow | rad-medium | rad-full | rad-wasm | rad-streaming | dcmjs | dicom-parser | efferent |
|---------|----------|-------------|------------|----------|----------|---------------|-------|--------------|----------|
| Core Parsing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Streaming | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Serialization | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Anonymization | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Pixel Data | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| Sequences | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| 100% Reliability | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌ | ⚠️ |

---

## Detailed Statistics

### efferent-dicom

- **Success Rate:** 99.6% (253/254)
- **Average Time:** 1.18 ms
- **Min/Max Time:** 0.90 μs / 15.17 ms
- **Average Elements:** 71
- **Total Size Processed:** 288.34 MB
- **Errors:** 1 files failed
  - explicit_VR-UN.dcm: charsetTagValue.trim is not a function

### rad-parser-shallow

- **Success Rate:** 100.0% (254/254)
- **Average Time:** 2.25 ms
- **Min/Max Time:** 1.20 μs / 77.52 ms
- **Average Elements:** 72
- **Total Size Processed:** 288.34 MB

### rad-parser-fast

- **Success Rate:** 100.0% (254/254)
- **Average Time:** 2.76 ms
- **Min/Max Time:** 2.14 ms / 5.57 ms
- **Average Elements:** 37
- **Total Size Processed:** 288.34 MB

### rad-parser-medium

- **Success Rate:** 100.0% (254/254)
- **Average Time:** 11.53 ms
- **Min/Max Time:** 8.40 μs / 262.30 ms
- **Average Elements:** 93
- **Total Size Processed:** 288.34 MB

### rad-parser

- **Success Rate:** 100.0% (254/254)
- **Average Time:** 11.77 ms
- **Min/Max Time:** 9.50 μs / 304.38 ms
- **Average Elements:** 93
- **Total Size Processed:** 288.34 MB

### rad-parser-wasm

- **Success Rate:** 100.0% (254/254)
- **Average Time:** 12.30 ms
- **Min/Max Time:** 12.30 μs / 278.69 ms
- **Average Elements:** 93
- **Total Size Processed:** 288.34 MB

### rad-parser-streaming

- **Success Rate:** 100.0% (254/254)
- **Average Time:** 23.75 ms
- **Min/Max Time:** 28.50 μs / 337.03 ms
- **Average Elements:** 138
- **Total Size Processed:** 288.34 MB

### dicom-parser

- **Success Rate:** 88.2% (224/254)
- **Average Time:** 100.63 μs
- **Min/Max Time:** 29.10 μs / 1.38 ms
- **Average Elements:** 84
- **Total Size Processed:** 288.34 MB
- **Errors:** 30 files failed
  - ExplVR_BigEndNoMeta.dcm: dicomParser.readPart10Header: DICM prefix not found at location 132 - this is not a valid DICOM P10 file.
  - ExplVR_LitEndNoMeta.dcm: dicomParser.readPart10Header: DICM prefix not found at location 132 - this is not a valid DICOM P10 file.
  - image_dfl.dcm: i.copy is not a function
  - meta_missing_tsyntax.dcm: dicomParser.parseDicom: missing required meta header attribute 0002,0010
  - MR_truncated.dcm: [object Object]
  - ... and 25 more

### dcmjs

- **Success Rate:** 89.0% (226/254)
- **Average Time:** 1.49 ms
- **Min/Max Time:** 132.70 μs / 23.99 ms
- **Average Elements:** 76
- **Total Size Processed:** 288.34 MB
- **Errors:** 28 files failed
  - ExplVR_BigEndNoMeta.dcm: Invalid DICOM file, expected header is missing
  - ExplVR_LitEndNoMeta.dcm: Invalid DICOM file, expected header is missing
  - meta_missing_tsyntax.dcm: Cannot read properties of undefined (reading 'Value')
  - MR-SIEMENS-DICOM-WithOverlays.dcm: Level greater than 0 = 2
  - no_meta.dcm: Invalid DICOM file, expected header is missing
  - ... and 23 more

---

## Recommendations

### Choose rad-parser-fast when:
- ⚡ Maximum speed required
- 📋 Header/metadata extraction only
- 🎯 Tag filtering needed

### Choose rad-parser-shallow when:
- ⚡ Fast scanning/indexing
- 📊 Database indexing
- ✅ Still need 100% reliability

### Choose rad-parser-medium when:
- ⚖️ Balance speed and completeness
- 🏥 Metadata extraction (skip pixel data)
- 🔒 Anonymization workflows

### Choose rad-parser when:
- 🏆 Complete data extraction needed
- 🖼️ Pixel data required
- ✅ 100% reliability essential
- 🔧 Production systems

### Choose rad-parser-streaming when:
- 📡 Network/file streams
- 💾 Large files (>100MB)
- 🧠 Memory-efficient processing
- ⚡ Real-time parsing

### Choose dicom-parser when:
- ⚡ Maximum speed (accepts 12% failures)
- 📝 Simple use cases

### Choose dcmjs when:
- 🔄 Existing codebase integration
- 📝 Simple parsing needs
- ⚠️ 11% failure rate acceptable

---

*Report generated from comprehensive benchmark results*
