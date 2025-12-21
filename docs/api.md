# Rad-Parser API Reference

## Core Functions

### parse(buffer, options)

<<<<<<< HEAD
Parse a DICOM file buffer into a dataset.

**Parameters:**

- `buffer: Uint8Array | Buffer` - DICOM file data

- # `options?: ParseOptions` - `type?: 'full' | 'shallow' | 'light' | 'lazy'` - Parsing mode (default: 'full')

    `rad-parser` is a lightweight, performant, and self-contained DICOM parser for JavaScript and TypeScript environments. It's designed with two core principles:

1. **Zero Dependencies:** The core parsing logic has no external dependencies, making it robust and suitable for a wide range of environments, from Node.js servers to web browsers.
2. **Modular & Extensible:** Complex features like compressed pixel data decoding are handled through a clean, extensible codec system. The library provides adapters for common formats, and you can easily inject your own decoders (e.g., from a WebAssembly library).

## Installation

```bash
bun install rad-parser
```

---

## Core API

These are the primary functions you'll use for most DICOM parsing tasks.

### `parse()`

Main entry point for parsing a DICOM file buffer. Configure parsing depth via `options.type`.

```typescript
parse(byteArray: Uint8Array, options?: UnifiedParseOptions): DicomDataSet | ShallowDicomDataSet
```

**Parameters:**

- `byteArray`: `Uint8Array` with raw DICOM bytes.
- `options` (optional):
    - `type`: - `'fast'`: Ultra-fast header scan (minimal metadata, no values; safe skipping for undefined-length data). - `'shallow'`: Tag metadata only (offset/length/VR), no values. - `'light'` (aka medium): Full metadata, skips pixel data value (best for metadata/anonymization). - `'full'` (default): Full parse including pixel data. - `'lazy'`: Returns a proxy that reads values on demand (built atop shallow scan).
        > > > > > > > 0abe5b2af341db379da260e9559e0adaf3c4af83

**Returns:** `DicomDataSet` or `ShallowDicomDataSet`

**Example:**

```typescript
const dataset = parse(buffer, { type: "full" });
```

---

### shallowParse(buffer)

Fast metadata-only parsing (alias for `parse(buffer, { type: 'shallow' })`).

**Returns:** `ShallowDicomDataSet` - Tag to offset mapping

---

### initCoreWasm(path?)

Initialize Wasm module for optimized DS/IS/PN/DA/TM parsing.

**Parameters:**

- `path?: string | URL` - Optional custom Wasm file path

**Returns:** `Promise<unknown>`

**Example:**

```typescript
await initCoreWasm(); // Uses bundled Wasm
// or
await initCoreWasm("/custom/path.wasm");
```

---

## DicomDataSet Interface

### Accessor Methods

#### string(tag: string): string | undefined

Get string value of a tag.

```typescript
const patientName = dataset.string("x00100010"); // "Doe^John"
const studyDate = dataset.string("0008,0020"); // "20230101"
```

#### uint16(tag: string): number | undefined

Get 16-bit unsigned integer.

```typescript
const rows = dataset.uint16("x00280010"); // 512
```

#### uint32(tag: string): number | undefined

Get 32-bit unsigned integer.

```typescript
const pixelDataLength = dataset.uint32("x7fe00010");
```

#### uint8(tag: string): Uint8Array | undefined

Get byte array.

```typescript
const pixelData = dataset.uint8("x7fe00010");
```

#### floats(tag: string): Float64Array | undefined

Get floating point array (DS VR).

```typescript
const sliceLocation = dataset.floats("x00201041");
```

#### ints(tag: string): Int32Array | undefined

Get integer array (IS VR).

```typescript
const pixelSpacing = dataset.ints("x00280030");
```

---

## Streaming API

### StreamingParser

Class for incremental DICOM parsing.

**Constructor:**

```typescript
new StreamingParser(options?: StreamingOptions)
```

**Methods:**

- `processChunk(chunk: Uint8Array): void` - Add data chunk
- `finalize(): void` - Complete parsing
- `initialize(chunk: Uint8Array): void` - Initialize with first chunk

**Example:**

```typescript
const parser = new StreamingParser({
    onElement: ({ dict }) => {
        console.log("Element:", dict);
    },
    onError: err => console.error(err),
});

parser.processChunk(chunk1);
parser.processChunk(chunk2);
parser.finalize();
```

---

### parseFromStream(stream, options)

Parse from ReadableStream.

**Parameters:**

- `stream: ReadableStream<Uint8Array>`
- `options?: StreamingOptions`

**Example:**

```typescript
await parseFromStream(response.body, {
    onElement: ({ dict }) => {
        /* ... */
    },
});
```

---

### parseFromAsyncIterator(iterator, options)

Parse from async iterable.

**Parameters:**

- `iterator: AsyncIterable<Uint8Array>`
- `options?: StreamingOptions`

**Example:**

```typescript
await parseFromAsyncIterator(chunks(), {
    onElement: ({ dict }) => {
        /* ... */
    },
});
```

---

## Pixel Data Utilities

### extractRescaledPixelData(dataset)

Extract and rescale pixel data to calibrated Float32 values.

**Purpose:** High-level utility that extracts pixel data (automatically decoding compressed formats), then applies DICOM rescale transformation to produce calibrated values (e.g., Hounsfield units for CT).

**Parameters:**

- `dataset: DicomDataSet` - Parsed DICOM dataset (must be parsed with `type: 'full'`)

**Returns:** `Float32Array` - Rescaled pixel values

**Formula:** `rescaled[i] = pixelData[i] * rescaleSlope + rescaleIntercept`

**Supported:**

- 8-bit and 16-bit images
- Signed and unsigned pixel representation
- All transfer syntaxes (automatically decoded via codecs)
- Multi-frame images

**Example:**

```typescript
import { parse, extractRescaledPixelData } from "rad-parser";

const dataset = parse(ctBuffer, { type: "full" });
const pixels = extractRescaledPixelData(dataset);

// pixels is Float32Array with Hounsfield units (-1000 to 3000 for CT)
console.log("Min HU:", Math.min(...pixels));
console.log("Max HU:", Math.max(...pixels));
```

**Difference from raw pixel data:**

- `dataset.uint8('x7fe00010')` - Returns raw bytes (may be compressed)
- `extractRescaledPixelData(dataset)` - Returns calibrated Float32 values

---

## Codec Functions

### decodeImage(options)

Decode compressed pixel data.

**Parameters:**

- `pixelData: Uint8Array` - Compressed pixel data
- `transferSyntax: string` - Transfer syntax UID
- `rows: number` - Image height
- `columns: number` - Image width
- `bitsAllocated: number` - Bits per pixel
- `samplesPerPixel: number` - Samples per pixel
- `photometricInterpretation: string` - Color interpretation

**Returns:** `Promise<Uint8Array | Uint16Array>`

---

### encodePNG(options)

Encode pixel data to PNG.

**Parameters:**

- `data: Uint8Array` - Pixel data
- `width: number` - Image width
- `height: number` - Image height
- `bitDepth: number` - Bits per pixel (8 or 16)
- `colorType: 'grayscale' | 'rgb'`

**Returns:** `Promise<Uint8Array>` - PNG file buffer

---

## Types

### ParseOptions

```typescript
interface ParseOptions {
    type?: "full" | "shallow" | "light" | "lazy";
}
```

### StreamingOptions

```typescript
interface StreamingOptions {
    onElement?: (element: {
        dict: Record<string, DicomElement>;
        normalizedElements: Record<string, DicomElement>;
    }) => void;
    onError?: (error: Error) => void;
    maxBufferSize?: number; // Default: 10MB
    maxIterations?: number; // Default: 1000
}
```

### DicomElement

```typescript
interface DicomElement {
    vr?: string;
    VR?: string;
    Value?: any;
    value?: any;
    length?: number;
    Length?: number;
    items?: unknown[];
    Items?: unknown[];
}
```

---

## Tag Formats

<<<<<<< HEAD
All accessors support multiple tag formats:

````typescript
dataset.string("x00100010"); // x-prefixed hex
dataset.string("0010,0010"); // comma-separated
dataset.string("00100010"); // plain hex
=======
For large files or network streams, the `StreamingParser` allows you to process DICOM data incrementally.

### `StreamingParser`

Consumes chunks of a DICOM file and fires callbacks as elements are parsed.

**Constructor options:**
- `onElement?: (el) => void`
- `onError?: (err: Error) => void`
- `maxBufferSize?: number` (default 10MB)
- `maxIterations?: number` (default 1000)

#### **Example: Streaming from a File (Node.js)**

```typescript
import * as fs from 'fs';
import { StreamingParser } from 'rad-parser';

const parser = new StreamingParser({
  onElement: (el) => {
    // el.dict contains parsed element(s) for this chunk
  },
  onError: (err) => console.error('Streaming error:', err),
  maxBufferSize: 50 * 1024 * 1024, // optional
  maxIterations: 500,              // optional
});

const readStream = fs.createReadStream('large.dcm');
readStream.on('data', (chunk) => parser.processChunk(new Uint8Array(chunk)));
readStream.on('end', () => parser.finalize());
>>>>>>> 0abe5b2af341db379da260e9559e0adaf3c4af83
````

---

_For more details, see the [source code](../src/index.ts) and [tests](../tests/)._
