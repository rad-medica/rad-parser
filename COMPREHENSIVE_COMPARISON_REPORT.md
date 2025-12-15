# Comprehensive DICOM Parser Comparison

**Date:** 2025-12-11  
**Test Files:** 254 DICOM files  
**Parsers:** rad-parser (fast, shallow, medium, full, streaming), dcmjs, dicom-parser, efferent-dicom

---

## Executive Summary

### 🏆 Overall Winner: efferent-dicom

**Key Highlights:**
- **Most Reliable:** efferent-dicom (99.6% success rate)
- **Fastest (100% success):** rad-parser-fast (2.04 ms average)
- **Most Elements:** rad-parser-streaming (414 elements/file)

---

## Performance Comparison

### Success Rates

| Parser | Success Rate | Files Parsed | Failures |
|--------|-------------|--------------|----------|
| **efferent-dicom** | 99.6% ████████████████████ | 253/254 | 1 |
| **rad-parser-fast** | 100.0% ████████████████████ | 254/254 | 0 |
| **rad-parser-shallow** | 100.0% ████████████████████ | 254/254 | 0 |
| **rad-parser** | 100.0% ████████████████████ | 254/254 | 0 |
| **rad-parser-medium** | 100.0% ████████████████████ | 254/254 | 0 |
| **rad-parser-streaming** | 100.0% ████████████████████ | 254/254 | 0 |
| **dicom-parser** | 88.2% ██████████████████ | 224/254 | 30 |
| **dcmjs** | 89.0% ██████████████████ | 226/254 | 28 |

### Parse Speed

| Parser | Avg Time | Min Time | Max Time | Throughput | Speed vs Fastest |
|--------|----------|----------|----------|------------|------------------|
| **efferent-dicom** | 756.99 μs | 1.30 μs | 10.41 ms | 1321 files/s | 0.37x |
| **rad-parser-fast** | 2.04 ms | 1.38 ms | 4.66 ms | 491 files/s | 1.00x |
| **rad-parser-shallow** | 7.42 ms | 3.20 μs | 208.09 ms | 135 files/s | 3.64x |
| **rad-parser** | 7.47 ms | 9.50 μs | 169.10 ms | 134 files/s | 3.67x |
| **rad-parser-medium** | 7.57 ms | 10.80 μs | 164.68 ms | 132 files/s | 3.72x |
| **rad-parser-streaming** | 15.49 ms | 34.20 μs | 231.30 ms | 65 files/s | 7.61x |
| **dicom-parser** | 114.78 μs | 24.40 μs | 1.11 ms | 8712 files/s | 0.06x |
| **dcmjs** | 1.11 ms | 98.90 μs | 10.81 ms | 902 files/s | 0.54x |

### Element Parsing Depth

| Parser | Avg Elements | Total Elements | Coverage |
|--------|--------------|---------------|----------|
| **efferent-dicom** | 71 | 18.037 | Good |
| **rad-parser-fast** | 37 | 9.425 | Good |
| **rad-parser-shallow** | 69 | 17.472 | Good |
| **rad-parser** | 280 | 71.154 | Good |
| **rad-parser-medium** | 280 | 71.154 | Good |
| **rad-parser-streaming** | 414 | 105.108 | Good |
| **dicom-parser** | 84 | 18.916 | Good |
| **dcmjs** | 76 | 17.170 | Good |

---

## Capability Matrix

| Feature | rad-fast | rad-shallow | rad-medium | rad-full | rad-streaming | dcmjs | dicom-parser | efferent |
|---------|----------|-------------|------------|----------|---------------|-------|--------------|----------|
| Core Parsing | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Streaming | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| Serialization | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Anonymization | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Pixel Data | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| Sequences | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| 100% Reliability | ✅ | ✅ | ✅ | ✅ | ⚠️ | ❌ | ❌ | ⚠️ |

---

## Detailed Statistics

### efferent-dicom

- **Success Rate:** 99.6% (253/254)
- **Average Time:** 756.99 μs
- **Min/Max Time:** 1.30 μs / 10.41 ms
- **Average Elements:** 71
- **Total Size Processed:** 288.34 MB
- **Errors:** 1 files failed
  - explicit_VR-UN.dcm: charsetTagValue.trim is not a function

### rad-parser-fast

- **Success Rate:** 100.0% (254/254)
- **Average Time:** 2.04 ms
- **Min/Max Time:** 1.38 ms / 4.66 ms
- **Average Elements:** 37
- **Total Size Processed:** 288.34 MB

### rad-parser-shallow

- **Success Rate:** 100.0% (254/254)
- **Average Time:** 7.42 ms
- **Min/Max Time:** 3.20 μs / 208.09 ms
- **Average Elements:** 69
- **Total Size Processed:** 288.34 MB

### rad-parser

- **Success Rate:** 100.0% (254/254)
- **Average Time:** 7.47 ms
- **Min/Max Time:** 9.50 μs / 169.10 ms
- **Average Elements:** 280
- **Total Size Processed:** 288.34 MB

### rad-parser-medium

- **Success Rate:** 100.0% (254/254)
- **Average Time:** 7.57 ms
- **Min/Max Time:** 10.80 μs / 164.68 ms
- **Average Elements:** 280
- **Total Size Processed:** 288.34 MB

### rad-parser-streaming

- **Success Rate:** 100.0% (254/254)
- **Average Time:** 15.49 ms
- **Min/Max Time:** 34.20 μs / 231.30 ms
- **Average Elements:** 414
- **Total Size Processed:** 288.34 MB

### dicom-parser

- **Success Rate:** 88.2% (224/254)
- **Average Time:** 114.78 μs
- **Min/Max Time:** 24.40 μs / 1.11 ms
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
- **Average Time:** 1.11 ms
- **Min/Max Time:** 98.90 μs / 10.81 ms
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
