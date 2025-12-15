# rad-parser

**rad-parser** is a lightweight, performant, and self-contained DICOM parser for Node.js and browsers, built with TypeScript and with **zero external dependencies**.

It is designed for safety, efficiency, and reliability in medical imaging applications, command-line utilities, and cloud-based pipelines where dependency bloat and performance are critical concerns.

[![npm version](https://img.shields.io/npm/v/rad-parser.svg)](https://www.npmjs.com/package/rad-parser)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## Features

-   ✅ **Zero Dependencies**: Pure TypeScript/JavaScript implementation.
-   ✅ **Extensive Format Support**: Handles Explicit/Implicit VR, Big/Little Endian, and all standard VR types.
-   ✅ **Automatic Codec Loading**: Compressed images (RLE, JPEG, JPEG 2000, etc.) are decoded on-demand with no extra setup.
-   ✅ **Extensible Codec System**: “Adapter” classes allow you to integrate your own decoders (e.g., from a WebAssembly library like OpenJPEG or CharLS).
-   ✅ **DICOM Manipulation**: Utilities to `anonymize` datasets and `write` them back to a file buffer.
-   ✅ **Streaming Parser**: Incremental parsing with backpressure-friendly callbacks.
-   ✅ **Multiple Parse Depths**: Fast/shallow/light/full/streaming modes to match your workload.
-   ✅ **Safe & Performant**: Designed for efficient binary parsing with strict bounds checking.

More docs:

-   [API Reference](./docs/api.md)
-   [Codec Integration Tutorial](./docs/codec-integration-tutorial.md)

## Installation

```bash
npm install rad-parser
```

---

## Command-Line Interface (CLI)

`rad-parser` includes a powerful CLI for inspecting, transcoding, and converting DICOM files.

> **[View Full CLI Documentation](./docs/CLI.md)**

### **Quick Command Summary**

| Command                               | Description                                            |
| :------------------------------------ | :----------------------------------------------------- |
| `dump <file>`                         | Parse and print all tags from a DICOM file.            |
| `transcode <in> <out> --format <fmt>` | Transcode DICOM to RLE, JPEG, JPEG-LS, J2K, or Native. |
| `image <in> <out> --frame <n>`        | Export DICOM frames to PNG or JPEG images.             |
| `help`                                | Show detailed help message.                            |

### **Examples**

**1. Dump tags:**

```bash
npx rad-parser dump "scan.dcm"
```

**2. Compress to RLE:**

```bash
npx rad-parser transcode "native.dcm" "compressed.dcm" --format rle
```

**3. Export frame to PNG:**

```bash
npx rad-parser image "scan.dcm" "output.png" --frame 0
```

---

## Benchmarks (TEST/SOLO + TEST/SUBF, 254 files)

| Parser               | Success | Avg Time | Avg Elements |
| -------------------- | ------- | -------- | ------------ |
| rad-parser-fast      | 100%    | 2.04 ms  | 37           |
| rad-parser           | 100%    | 7.47 ms  | 280          |
| rad-parser-medium    | 100%    | 7.57 ms  | 280          |
| rad-parser-shallow   | 100%    | 7.42 ms  | 69           |
| rad-parser-streaming | 100%    | 15.49 ms | 414          |
| efferent-dicom       | 99.6%   | 0.76 ms  | 71           |
| dcmjs                | 89%     | 1.11 ms  | 76           |
| dicom-parser         | 88%     | 0.10 ms  | 84           |

Notes:

-   Dataset: 254 DICOM files from `test_data/TEST/SOLO` and `test_data/TEST/SUBF`.
-   Fast mode now includes safeguards for undefined-length elements (no hangs).
-   Streaming parses more elements per file (fragments included) by design.

---

## Library Usage

### Parse Modes

-   `fast`: Ultra-fast header scan (minimal metadata; new fast-mode safeguards applied).
-   `shallow`: Tag-level scan (offsets/lengths; no values).
-   `light` / `medium`: Full metadata, skips pixel data value (best for metadata + anonymization).
-   `full`: Full dataset including pixel data.
-   `streaming`: Incremental parsing via callbacks on chunks/streams.

### **Example 1: Basic Parsing (Metadata Only)**

Use the `light` (medium) parse type to quickly read all tags without loading the bulky pixel data.

```typescript
import * as fs from "fs";
import { parse } from "rad-parser";

const dicomBytes = new Uint8Array(fs.readFileSync("test.dcm"));

// Use { type: 'light' } to skip pixel data value
const dataset = parse(dicomBytes, { type: "light" });

const patientName = dataset.string("x00100010"); // Patient's Name
const studyDate = dataset.string("x00080020"); // Study Date

console.log(`Patient: ${patientName}, Study Date: ${studyDate}`);
```

### **Example 2: Automatic Image Decoding**

Use the `parseAndDecode()` helper to automatically parse a file and decompress the pixel data.

```typescript
import * as fs from "fs";
import { parseAndDecode } from "rad-parser";

async function getRawPixels(filePath: string) {
    const dicomBytes = new Uint8Array(fs.readFileSync(filePath));

    // This function parses the file AND decodes the pixel data
    const dataset = await parseAndDecode(dicomBytes);

    const pixelDataElement = dataset.elements["x7fe00010"];
    const rawPixelData = pixelDataElement.Value as Uint8Array;

    console.log(`Decoded pixel data size: ${rawPixelData.length} bytes`);
    return rawPixelData;
}
```

### **Example 3: Streaming (Node.js)**

```typescript
import * as fs from "fs";
import { StreamingParser } from "rad-parser";

const parser = new StreamingParser({
    onElement: (el) => {
        // el.dict contains the parsed element(s) for this chunk
    },
    onError: (err) => console.error("Streaming error:", err),
    maxBufferSize: 50 * 1024 * 1024, // optional
    maxIterations: 500, // optional
});

const readStream = fs.createReadStream("large.dcm");
readStream.on("data", (chunk) => parser.processChunk(new Uint8Array(chunk)));
readStream.on("end", () => parser.finalize());
```

### **Example 4: Manual Codec Integration (Advanced)**

For custom decoders (e.g., a proprietary compression format or a specific WASM library), you can register a configured codec.

```typescript
import { registry, Jpeg2000Decoder, parseAndDecode } from "rad-parser";
import myCustomJ2kDecoder from "./my-custom-j2k-decoder";

// 1. Instantiate the adapter with your external decode function
const customCodec = new Jpeg2000Decoder(myCustomJ2kDecoder);

// 2. Register it with a high priority
registry.register(customCodec);

// 3. Now, parseAndDecode will use your custom codec for JPEG 2000 files
// const dataset = await parseAndDecode(dicomBytes);
```

## Library Comparison & Ecosystem

A head-to-head comparison of capabilities, ecosystem, and performance.

| Feature                  |      rad-parser      |     dcmjs     |  dicom-parser  | efferent-dicom |
| :----------------------- | :------------------: | :-----------: | :------------: | :------------: |
| **Dependencies**         |     ✅ **Zero**      |  ❌ Multiple  |    ✅ Zero     |  ⚠️ Multiple   |
| **Bundle Size**          |    ✅ **~390KB**     |  ⚠️ ~500KB+   |    ✅ ~30KB    |   ⚠️ ~300KB+   |
| **Core Size**            |    ✅ **~100KB**     |      N/A      |      N/A       |      N/A       |
| **Self-Contained**       |      ✅ **Yes**      |     ❌ No     |     ✅ Yes     |     ❌ No      |
| **Part 10 Support**      |      ✅ **Yes**      |    ✅ Yes     |     ✅ Yes     |     ✅ Yes     |
| **Transfer Syntax Det.** |      ✅ **Yes**      |    ✅ Yes     |     ✅ Yes     |     ✅ Yes     |
| **Implicit VR**          |      ✅ **Yes**      |    ✅ Yes     |     ✅ Yes     |   ⚠️ Limited   |
| **Explicit VR**          |      ✅ **Yes**      |    ✅ Yes     |     ✅ Yes     |     ✅ Yes     |
| **Big Endian**           |      ✅ **Yes**      |  ⚠️ Partial   |     ✅ Yes     |   ⚠️ Limited   |
| **Sequence Parsing**     |      ✅ **Yes**      |    ✅ Yes     |    ⚠️ Basic    |    ⚠️ Basic    |
| **Person Name (PN)**     |  ✅ **Structured**   | ✅ Structured | ⚠️ String only | ⚠️ String only |
| **Date/Time Parsing**    | ✅ **Date Objects**  |  ⚠️ Strings   |   ⚠️ Strings   |   ⚠️ Strings   |
| **Character Sets**       |   ✅ **Multiple**    |  ✅ Multiple  |   ⚠️ Limited   |   ⚠️ Limited   |
| **Tag Dictionary**       | ✅ **Full (5300+)**  |  ⚠️ Partial   |     ❌ No      |     ❌ No      |
| **Error Handling**       | ✅ **Comprehensive** |    ✅ Good    |    ⚠️ Basic    |    ⚠️ Basic    |
| **Safety Limits**        |      ✅ **Yes**      |  ⚠️ Limited   |   ⚠️ Limited   |   ⚠️ Limited   |
| **Bounds Checking**      |    ✅ **All Ops**    |    ⚠️ Some    |    ⚠️ Some     |    ⚠️ Some     |
| **Modular**              |      ✅ **Yes**      | ❌ Monolithic | ❌ Monolithic  | ❌ Monolithic  |
| **TypeScript**           |  ✅ **Full Types**   |  ⚠️ Partial   |   ⚠️ Partial   |   ⚠️ Partial   |
| **Reliability**          |     ✅ **100%**      |    ❌ ~89%    |    ❌ ~88%     |   ✅ ~99.6%    |
| **Performance (Scan)**   |    🚀 **~2.3 ms**    |    ~1.5 ms    |    ~0.1 ms     |    ~1.2 ms     |
| **Memory Usage**         | ✅ **Configurable**  |    ⚠️ High    |     ✅ Low     |   ⚠️ Medium    |
| **Pixel Data**           |  ✅ **Full Plugin**  |    ✅ Full    |  ❌ Raw Only   |  ❌ Raw Only   |
| **Native Codecs**        |   ✅ **RLE, PNG**    |    ❌ None    |    ❌ None     |   ⚠️ Limited   |
| **Browser Support**      |    ✅ **Modern**     |   ✅ Modern   |   ✅ Modern    |   ⚠️ Modern    |
| **Node.js Support**      |      ✅ **Yes**      |    ✅ Yes     |     ✅ Yes     |     ✅ Yes     |
| **Maintenance**          |    ✅ **Active**     |   ✅ Active   |    ⚠️ Slow     |    ⚠️ Slow     |
| **License**              |      ✅ **MIT**      |    ✅ MIT     |     ✅ MIT     |     ✅ MIT     |

## Full Documentation

-   **[API Reference](docs/api.md)** - Complete API documentation for all functions and types
-   **[Codec Tutorial](docs/CODEC_TUTORIAL.md)** - Image compression/decompression guide with examples
-   **[GitHub Repository](https://github.com/rad-medica/rad-parser)** - Source code and issues

### Quick Links

-   [Parse DICOM files](docs/api.md#parse-options)
-   [Extract pixel data](docs/api.md#extractrescaledpixeldatadataset)
-   [Streaming large files](docs/api.md#streaming-api)
-   [Image decoding examples](docs/CODEC_TUTORIAL.md#basic-image-decoding)
-   [Wasm optimization](docs/CODEC_TUTORIAL.md#wasm-optimization)

---

For a deep dive into the library's features, including advanced codec registration, encoding examples, and handling encapsulated data like PDFs and ECGs, please see our **[Full API Documentation](./docs/api.md)**.

---

## License

`rad-parser` is licensed under the MIT License.
