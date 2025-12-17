# Third-Party Codec Integration Examples

`rad-parser` is designed to be a lightweight core, and it uses an "adapter" pattern to integrate with powerful, third-party libraries for decoding complex compressed formats. This guide provides practical examples of how to use popular WebAssembly (WASM) and JavaScript libraries with `rad-parser`.

## The Adapter Pattern

The concept is simple:

1. You import a third-party decoding library.
2. You instantiate the corresponding `rad-parser` adapter codec (e.g., `Jpeg2000Decoder`).
3. You pass the third-party library's decoding function into the adapter's constructor.
4. You register this configured codec with the `rad-parser` registry.
5. The `rad-parser` can now decode files with that transfer syntax.

_Note: Since the dynamic loader will often load a default (unconfigured) adapter, it's best practice to instantiate your own configured version and register it manually for these cases._

---

## JPEG 2000 Examples

JPEG 2000 (Transfer Syntaxes `1.2.840.10008.1.2.4.90` and `.91`) is a common format for lossless and lossy compression in DICOM.

### Using `openjpeg-js`

`openjpeg-js` is a popular WASM-based library for JPEG 2000.

**Installation:**

```bash
bun install openjpeg-js
```

**Integration Code:**

```typescript
import { parse, registry, Jpeg2000Decoder } from "rad-parser";
import openjpeg from "openjpeg-js"; // ESM module
import * as fs from "fs";

async function configureOpenjpeg() {
    // The decoder function provided by the openjpeg-js library
    const openjpegDecoder = async (compressedBuffer: Uint8Array): Promise<Uint8Array> => {
        const decoder = new openjpeg.J2KDecoder();
        const decoded = decoder.decode(compressedBuffer);
        // The result needs to be adapted to a simple Uint8Array of pixels
        const properties = decoder.getFrameInfo();
        // This is a simplified example; you may need to handle bit depth and signedness
        return new Uint8Array(decoded.getRawPixels().buffer);
    };

    // Create a configured instance of our adapter
    const jpeg2000Codec = new Jpeg2000Decoder(openjpegDecoder);

    // Register it. It will take priority over the default dynamic loader.
    registry.register(jpeg2000Codec);

    console.log("JPEG 2000 decoder configured and registered.");
}

// You must call the configuration before you start parsing J2K files.
// await configureOpenjpeg();
// const dataset = parse(dicomBytes, ...);
```

### Using `jpeg2000-js`

`jpeg2000-js` is another JPEG 2000 library written in pure JavaScript.

**Installation:**

```bash
bun install jpeg2000-js
```

**Integration Code:**

```typescript
import { parse, registry, Jpeg2000Decoder } from "rad-parser";
import { Jpeg2000Decoder as Jpeg2000Js } from "jpeg2000-js";
import * as fs from "fs";

function configureJpeg2000js() {
    // The jpeg2000-js library has a class-based API
    const jpeg2000jsDecoder = async (compressedBuffer: Uint8Array): Promise<Uint8Array> => {
        const decoder = new Jpeg2000Js();
        decoder.parse(compressedBuffer);
        // Note: Check the library's documentation for the exact API to get raw pixels
        // This is a hypothetical example of how you might get the data.
        const decodedPixels = decoder.getPixels();
        return new Uint8Array(decodedPixels.buffer);
    };

    // Create and register the configured adapter
    const jpeg2000Codec = new Jpeg2000Decoder(jpeg2000jsDecoder);
    registry.register(jpeg2000Codec);

    console.log("jpeg2000-js decoder configured and registered.");
}
```

---

## JPEG-LS Example

JPEG-LS (Transfer Syntaxes `1.2.840.10008.1.2.4.80` and `.81`) is a standard for lossless or near-lossless compression.

### Using `charls-js`

`charls-js` is a WASM compilation of the CharLS JPEG-LS library.

**Installation:**

```bash
bun install charls-js
```

**Integration Code:**

```typescript
import { parse, registry, JpegLsDecoder } from "rad-parser";
import charls from "charls-js"; // Main export
import * as fs from "fs";

async function configureCharlsJs() {
    const wasmModule = await charls.instantiate();

    // The charls-js library has a direct decode function
    const charlsJsDecoder = async (compressedBuffer: Uint8Array): Promise<Uint8Array> => {
        const decoded = wasmModule.decode(compressedBuffer);
        // The result provides the uncompressed pixel buffer directly
        return decoded.pixelData;
    };

    // Create a configured instance of our JpegLsDecoder adapter
    const jpegLsCodec = new JpegLsDecoder(charlsJsDecoder);

    // Register it
    registry.register(jpegLsCodec);

    console.log("charls-js JPEG-LS decoder configured and registered.");
}

// Call this before parsing JPEG-LS files
// await configureCharlsJs();
```
