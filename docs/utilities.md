# Rad-Parser: Utilities Reference

## Pixel Data Utilities

### extractRescaledPixelData(dataset)

Extract and rescale pixel data to calibrated Float32Array.

```typescript
import { extractRescaledPixelData } from "rad-parser";

const pixels = extractRescaledPixelData(dataset);
// Returns: Float32Array with rescaled values
```

**What it does:**

- Extracts pixel data (auto-decodes compressed formats)
- Applies: `value = stored * slope + intercept`
- Returns consistent Float32Array

**Use cases:**

- Get Hounsfield units from CT scans
- Extract calibrated MR signal intensities
- Prepare pixel data for ML/analysis

---

### extractPixelDataFromView(view, length, transferSyntax)

Low-level pixel data extraction from buffer (used internally by parser).

```typescript
import { extractPixelDataFromView } from "rad-parser";

const result = extractPixelDataFromView(view, length, "1.2.840.10008.1.2.1");
// Returns: PixelDataResult with raw bytes
```

**Returns:** `PixelDataResult`

- `pixelData: Uint8Array` - Raw pixel bytes
- `isEncapsulated: boolean` - True if compressed
- `fragments?: Array<{offset, length}>` - Fragment info
- `fragmentArrays?: Uint8Array[]` - Fragment data

---

## Transcoding & Image Utilities

### transcode(dataset, options)

Transcode a dataset to a different Transfer Syntax.

```typescript
import { transcode } from "rad-parser";

// Transcode to RLE Lossless
const newDataset = await transcode(dataset, {
    targetTransferSyntax: "1.2.840.10008.1.2.5", // RLE
});

// Transcode to JPEG 2000
const j2kDataset = await transcode(dataset, {
    targetTransferSyntax: "1.2.840.10008.1.2.4.90",
});
```

**Features:**

- Automatically decodes original pixel data.
- Re-encodes using registered Wasm codecs.
- Updates `TransferSyntaxUID` and `PixelData` tags.
- Handles fragmentation for encapsulated data.

---

### dicomToImage(options)

Convert a DICOM frame to a standard image buffer (PNG/JPEG).

```typescript
import { dicomToImage } from "rad-parser";

const buffer = await dicomToImage({
    dataset: dataset,
    frame: 0, // (Optional) Frame index, default 0
    format: "png", // "png" | "jpeg"
});

fs.writeFileSync("output.png", buffer);
```

**Features:**

- Extracts frame from multi-frame datasets.
- Decodes compressed pixel data.
- Renders to 8-bit RGB/Grayscale image buffer.

---

## Compression Utilities

### decompressPixelData(data, transferSyntax, options)

Decompress pixel data using appropriate codec.

```typescript
import { decompressPixelData } from "rad-parser";

const decompressed = await decompressPixelData(
    compressedData,
    "1.2.840.10008.1.2.4.90", // JPEG 2000
    { rows: 512, columns: 512 }
);
```

### supportsImageDecoder()

Check if browser supports ImageDecoder API.

```typescript
import { supportsImageDecoder } from "rad-parser";

if (supportsImageDecoder()) {
    // Use browser's native decoder
}
```

---

## Tag Utilities

### formatTagWithComma(group, element)

Format tag as comma-separated hex.

```typescript
import { formatTagWithComma } from "rad-parser";

const tag = formatTagWithComma(0x0010, 0x0010);
// Returns: "0010,0010"
```

### normalizeTag(tag)

Normalize tag to x-prefixed lowercase hex.

```typescript
import { normalizeTag } from "rad-parser";

normalizeTag("0010,0010"); // → 'x00100010'
normalizeTag("00100010"); // → 'x00100010'
normalizeTag("x00100010"); // → 'x00100010'
```

---

## Dictionary Utilities

### getTagName(tag)

Get human-readable tag name from dictionary.

```typescript
import { getTagName } from "rad-parser";

getTagName("x00100010"); // → "Patient's Name"
getTagName("0010,0020"); // → "Patient ID"
```

### isPrivateTag(tag)

Check if tag is a private tag.

```typescript
import { isPrivateTag } from "rad-parser";

isPrivateTag("x00100010"); // → false (standard)
isPrivateTag("x00091001"); // → true (private)
```

---

## Value Parsing Utilities

### parsePersonName(value)

Parse DICOM Person Name (PN) value.

```typescript
import { parsePersonName } from "rad-parser";

const pn = parsePersonName("Doe^John^Middle^Dr.^Jr.");
// Returns: {
//   family: 'Doe',
//   given: 'John',
//   middle: 'Middle',
//   prefix: 'Dr.',
//   suffix: 'Jr.',
//   Alphanumeric: 'Doe^John^Middle^Dr.^Jr.'
// }
```

### parseDate(value)

Parse DICOM Date (DA) value.

```typescript
import { parseDate } from "rad-parser";

parseDate("20231225");
// Returns: Date object for December 25, 2023
```

### parseTime(value)

Parse DICOM Time (TM) value.

```typescript
import { parseTime } from "rad-parser";

parseTime("143025.123456");
// Returns: Date object with time 14:30:25.123456
```

### parseDateTime(value)

Parse DICOM DateTime (DT) value.

```typescript
import { parseDateTime } from "rad-parser";

parseDateTime("20231225143025");
// Returns: Date object
```

### parseAgeString(value)

Parse DICOM Age String (AS) value.

```typescript
import { parseAgeString } from "rad-parser";

parseAgeString("050Y"); // → { value: 50, unit: 'Y' }
parseAgeString("006M"); // → { value: 6, unit: 'M' }
parseAgeString("120D"); // → { value: 120, unit: 'D' }
```

### parseValueByVR(vr, value)

Parse value based on VR type.

```typescript
import { parseValueByVR } from "rad-parser";

parseValueByVR("PN", "Doe^John"); // → Person Name object
parseValueByVR("DA", "20231225"); // → Date
parseValueByVR("DS", "1.5\\2.0"); // → [1.5, 2.0]
```

---

## VR Detection Utilities

### detectVR(group, element)

Detect VR for implicit VR transfer syntax.

```typescript
import { detectVR } from "rad-parser";

detectVR(0x0010, 0x0010); // → 'PN'
detectVR(0x0020, 0x000d); // → 'UI'
```

### requiresExplicitLength(vr)

Check if VR uses 4-byte length encoding.

```typescript
import { requiresExplicitLength } from "rad-parser";

requiresExplicitLength("OB"); // → true (uses 4 bytes)
requiresExplicitLength("US"); // → false (uses 2 bytes)
```

---

## Buffer Utilities

### SafeDataView

Safe wrapper around DataView with bounds checking.

```typescript
import { SafeDataView } from "rad-parser";

const view = new SafeDataView(buffer, 0);
view.setEndianness(true); // Little endian

const value = view.readUint16(); // Safe read with bounds check
const bytes = view.readBytes(10); // Read 10 bytes
const str = view.readString(20, "utf-8"); // Read string
```

**Methods:**

- `readUint8()`, `readUint16()`, `readUint32()`
- `readInt16()`, `readInt32()`
- `readFloat32()`, `readFloat64()`
- `readBytes(length)`
- `readString(length, charset)`
- `getRemainingBytes()`
- `getPosition()`, `setPosition(pos)`

---

## Transfer Syntax Utilities

### extractTransferSyntax(dataset)

Extract transfer syntax UID from dataset.

```typescript
import { extractTransferSyntax } from "rad-parser";

const ts = extractTransferSyntax(dataset);
// Returns: '1.2.840.10008.1.2.1' (Explicit VR Little Endian)
```

### isCompressedTransferSyntax(transferSyntax)

Check if transfer syntax indicates compression.

```typescript
import { isCompressedTransferSyntax } from "rad-parser";

isCompressedTransferSyntax("1.2.840.10008.1.2.4.90"); // → true (JPEG 2000)
isCompressedTransferSyntax("1.2.840.10008.1.2.1"); // → false (uncompressed)
```

### TRANSFER_SYNTAX constants

```typescript
import { TRANSFER_SYNTAX } from "rad-parser";

TRANSFER_SYNTAX.IMPLICIT_VR_LITTLE_ENDIAN; // '1.2.840.10008.1.2'
TRANSFER_SYNTAX.EXPLICIT_VR_LITTLE_ENDIAN; // '1.2.840.10008.1.2.1'
TRANSFER_SYNTAX.JPEG_BASELINE; // '1.2.840.10008.1.2.4.50'
TRANSFER_SYNTAX.JPEG_2000_LOSSLESS; // '1.2.840.10008.1.2.4.90'
TRANSFER_SYNTAX.RLE_LOSSLESS; // '1.2.840.10008.1.2.5'
```

---

## Sequence Utilities

### parseSequence(view, explicitVR, littleEndian, charset, undefinedLength)

Parse DICOM sequence (SQ) elements.

```typescript
import { parseSequence } from "rad-parser";

const items = parseSequence(view, true, true, "utf-8", false);
// Returns: Array of sequence items
```

---

_For complete examples, see [API.md](API.md) and [CODEC_TUTORIAL.md](CODEC_TUTORIAL.md)_
