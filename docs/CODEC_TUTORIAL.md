# Rad-Parser: Image Codec Tutorial

## Overview

Rad-parser includes built-in support for multiple DICOM image compression formats with automatic Wasm acceleration and JavaScript fallbacks.

## Supported Codecs

| Codec                  | Transfer Syntax        | Wasm | Status    |
| :--------------------- | :--------------------- | :--: | :-------- |
| **Uncompressed**       | 1.2.840.10008.1.2.1    |  -   | ✅ Native |
| **RLE**                | 1.2.840.10008.1.2.5    |  ✅  | ✅ Fast   |
| **JPEG Baseline**      | 1.2.840.10008.1.2.4.50 |  ✅  | ✅ Fast   |
| **JPEG 2000 Lossless** | 1.2.840.10008.1.2.4.90 |  ✅  | ✅ Fast   |
| **JPEG-LS**            | 1.2.840.10008.1.2.4.80 |  ✅  | ✅ Fast   |
| **PNG**                | Custom                 |  ✅  | ✅ Fast   |

---

## Quick Start: Extract Calibrated Pixel Values

### Get Hounsfield Units (CT) or Calibrated Values

```typescript
import { parse, extractRescaledPixelData } from "rad-parser";
import { readFileSync } from "fs";

// Load and parse DICOM
const buffer = readFileSync("ct-scan.dcm");
const dataset = parse(buffer, { type: "full" });

// Extract rescaled pixel data (Float32Array)
const pixels = extractRescaledPixelData(dataset);

// Now you have calibrated values:
// - For CT: Hounsfield units (-1000 to 3000)
// - For MR: Signal intensities
// - For PET: SUV values (if rescale params present)

console.log(`Total pixels: ${pixels.length}`);
console.log(`Min value: ${Math.min(...Array.from(pixels))}`);
console.log(`Max value: ${Math.max(...Array.from(pixels))}`);
```

**What it does:**

1. ✅ Automatically decodes compressed pixel data (JPEG, JPEG2000, RLE, etc.)
2. ✅ Applies rescale transformation: `value = stored * slope + intercept`
3. ✅ Returns consistent Float32Array regardless of source format
4. ✅ Handles 8-bit, 16-bit, signed, unsigned automatically

---

## Basic Image Decoding

### 1. Parse DICOM with Pixel Data

```typescript
import { parse } from "rad-parser";
import { readFileSync } from "fs";

// Load DICOM file
const buffer = readFileSync("image.dcm");
const dataset = parse(buffer, { type: "full" });

// Access pixel data
const pixelData = dataset.uint8("x7fe00010"); // Pixel Data tag
console.log("Pixel data length:", pixelData?.length);
```

### 2. Decode Compressed Images

```typescript
import { decodeImage } from "rad-parser";

// Get pixel data and metadata
const pixelData = dataset.uint8("x7fe00010");
const transferSyntax = dataset.string("x00020010");
const rows = dataset.uint16("x00280010");
const columns = dataset.uint16("x00280011");
const bitsAllocated = dataset.uint16("x00280100");

// Decode image
const decodedImage = await decodeImage({
    pixelData,
    transferSyntax,
    rows,
    columns,
    bitsAllocated,
    samplesPerPixel: dataset.uint16("x00280002") || 1,
    photometricInterpretation: dataset.string("x00280004") || "MONOCHROME2",
});

console.log("Decoded:", decodedImage); // Uint8Array or Uint16Array
```

---

## Codec-Specific Examples

### JPEG 2000 Decoding

```typescript
import { parse } from "rad-parser";
import { initCodecsWasm } from "rad-parser-wasm-codecs";

// Initialize Wasm codecs (optional but faster)
await initCodecsWasm();

// Parse JPEG 2000 compressed file
const dataset = parse(j2kBuffer, { type: "full" });

// Pixel data is automatically available
const pixels = dataset.uint16("x7fe00010");
```

### RLE Decoding

```typescript
import { rle_decode } from "rad-parser-wasm-core";

// RLE compressed data
const compressed = dataset.uint8("x7fe00010");

// Decode with Wasm (fast)
const decoded = rle_decode(compressed);

// Or use JS fallback
import { decodeRLE } from "rad-parser";
const decodedJS = decodeRLE(compressed);
```

### PNG Encoding

```typescript
import { encodePNG } from "rad-parser";

// Encode pixel data to PNG
const pngBuffer = await encodePNG({
    data: pixelData,
    width: columns,
    height: rows,
    bitDepth: bitsAllocated,
    colorType: samplesPerPixel === 1 ? "grayscale" : "rgb",
});

// Save to file
import { writeFileSync } from "fs";
writeFileSync("output.png", pngBuffer);
```

---

## Wasm Optimization

### Initialize Wasm Modules

```typescript
import { initCoreWasm } from "rad-parser";
import { initCodecsWasm } from "rad-parser-wasm-codecs";

// Initialize core Wasm (DS/IS/PN parsing)
await initCoreWasm();

// Initialize codec Wasm (JPEG, JPEG2000, RLE, PNG)
await initCodecsWasm();

// Now all parsing and decoding will use Wasm when possible
```

### Custom Wasm Path

```typescript
// Provide custom Wasm file path
await initCoreWasm("/custom/path/rad_parser_wasm_core.wasm");
await initCodecsWasm("/custom/path/rad_parser_wasm_codecs.wasm");
```

---

## Streaming Large Files

### Stream from Network

```typescript
import { parseFromStream } from "rad-parser";

const response = await fetch("https://example.com/large.dcm");
const stream = response.body; // ReadableStream

await parseFromStream(stream, {
    onElement: ({ dict }) => {
        // Process each element as it arrives
        const tag = Object.keys(dict)[0];
        console.log("Received:", tag, dict[tag]);
    },
    onError: (error) => {
        console.error("Stream error:", error);
    },
});
```

### Stream from File (Node.js)

```typescript
import { createReadStream } from "fs";
import { parseFromAsyncIterator } from "rad-parser";

async function* fileChunks(path: string) {
    const stream = createReadStream(path, { highWaterMark: 64 * 1024 });
    for await (const chunk of stream) {
        yield new Uint8Array(chunk);
    }
}

await parseFromAsyncIterator(fileChunks("large.dcm"), {
    onElement: ({ dict }) => {
        // Process incrementally
    },
});
```

---

## Advanced Pixel Data Handling

### Multi-frame Images

```typescript
const numberOfFrames = dataset.uint16("x00280008") || 1;
const frameSize = rows * columns * (bitsAllocated / 8);

// Extract specific frame
function getFrame(pixelData: Uint8Array, frameIndex: number) {
    const start = frameIndex * frameSize;
    return pixelData.slice(start, start + frameSize);
}

const firstFrame = getFrame(pixelData, 0);
```

### Encapsulated Pixel Data

```typescript
// For compressed transfer syntaxes
const pixelDataInfo = dataset.pixelData; // Returns detailed info

if (pixelDataInfo?.isEncapsulated) {
    console.log("Fragments:", pixelDataInfo.fragmentArrays?.length);

    // Get first fragment
    const firstFragment = pixelDataInfo.fragmentArrays?.[0];
}
```

---

## Complete Example: DICOM to PNG

```typescript
import { parse, encodePNG, initCoreWasm } from "rad-parser";
import { readFileSync, writeFileSync } from "fs";

async function dicomToPNG(inputPath: string, outputPath: string) {
    // Initialize Wasm for faster parsing
    await initCoreWasm();

    // Parse DICOM
    const buffer = readFileSync(inputPath);
    const dataset = parse(buffer, { type: "full" });

    // Extract metadata
    const rows = dataset.uint16("x00280010")!;
    const columns = dataset.uint16("x00280011")!;
    const bitsAllocated = dataset.uint16("x00280100")!;
    const samplesPerPixel = dataset.uint16("x00280002") || 1;

    // Get pixel data (automatically decoded if compressed)
    const pixelData = dataset.uint16("x7fe00010")!;

    // Encode to PNG
    const png = await encodePNG({
        data: new Uint8Array(pixelData.buffer),
        width: columns,
        height: rows,
        bitDepth: bitsAllocated,
        colorType: samplesPerPixel === 1 ? "grayscale" : "rgb",
    });

    // Save
    writeFileSync(outputPath, png);
    console.log(`Saved PNG: ${outputPath}`);
}

// Usage
await dicomToPNG("ct-scan.dcm", "output.png");
```

---

## Performance Tips

1. **Initialize Wasm** - Call `initCoreWasm()` and `initCodecsWasm()` at startup
2. **Use Streaming** - For files >50MB, use `StreamingParser`
3. **Shallow Mode** - Use `type: 'shallow'` for metadata-only workflows
4. **Batch Processing** - Reuse the same Wasm instance across multiple files

---

_For more examples, see the [test files](../tests/) in the repository._
