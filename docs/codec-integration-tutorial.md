# Codec Integration Tutorial

## TL;DR

- Integrating external WASM/native codecs through the codec registry; worked examples in §9.
- `registry.registerFunctional({ name, transferSyntaxes, priority, isSupported, decode })`: no class.
- Higher `priority` wins; `isSupported` returning `false` skips the codec in that environment.

## 1) Quick Start: Functional Codec

Use `registry.registerFunctional` to wire an external decoder without creating a class.

```typescript
import { registry } from 'rad-parser';
import { decodeJ2k } from './my-openjpeg-wrapper'; // your WASM/native binding

registry.registerFunctional({
  name: 'my-jpeg2000',
  transferSyntaxes: ['1.2.840.10008.1.2.4.90', '1.2.840.10008.1.2.4.91'],
  priority: 500, // higher than defaults to prefer this decoder
  isSupported: () => true, // e.g., check for WASM/Node environment
  decode: async (fragments, info) => {
    // fragments: Uint8Array[] of encapsulated pixel data
    // info: contains frame/size metadata if provided by the parser
    return decodeJ2k(fragments, info);
  },
});
```

Then decode:

```typescript
import { parseAndDecode } from 'rad-parser';
const dataset = await parseAndDecode(dicomBytes);
const pixelData = dataset.elements['x7fe00010'].Value as Uint8Array;
```

## 2) Adapter Injection (JPEG 2000 / JPEG-LS / Video)

Use the built-in adapters to inject your decoder/encoder:

```typescript
import { registry, Jpeg2000Decoder, JpegLsDecoder, VideoDecoder } from 'rad-parser';
import { decodeJ2k, decodeJls, decodeH264 } from './my-codecs';

registry.register(new Jpeg2000Decoder(async fragments => decodeJ2k(fragments)));
registry.register(new JpegLsDecoder(async fragments => decodeJls(fragments)));
registry.register(new VideoDecoder(async (fragments, info) => decodeH264(fragments, info)));
```

Encoders (JPEG-LS) can also be injected:

```typescript
registry.register(
  new JpegLsDecoder(
    async fragments => decodeJls(fragments),
    async (pixels, ts, w, h, samples, bits) => encodeJls(pixels, ts, w, h, samples, bits)
  )
);
```

## 3) Browser vs Node

- **Browser**: `BrowserImageCodec` can handle JPEG Baseline via `ImageDecoder` when available; otherwise, inject your
  own via adapters/functional.
- **Node**: Use WASM/native bindings. Guard with `isSupported` to avoid selecting a browser-only codec in Node.

Example guard:

```typescript
const isBrowser = typeof window !== 'undefined' && typeof ImageDecoder !== 'undefined';
registry.registerFunctional({
  name: 'browser-jpeg',
  transferSyntaxes: ['1.2.840.10008.1.2.4.50'],
  priority: 300,
  isSupported: () => isBrowser,
  decode: async fragments => decodeWithImageDecoder(fragments),
});
```

## 4) Priorities and Fallbacks

- Higher `priority` wins.
- `isSupported` is checked before selection; return `false` to skip incompatible environments.
- Functional codecs can override defaults by using a higher priority.

## 5) Testing Your Integration

Example Vitest test (simplified):

```typescript
import { registry, Jpeg2000Decoder } from 'rad-parser';
import { describe, it, expect, vi } from 'vitest';

describe('External codec integration', () => {
  it('prefers custom J2K', async () => {
    const decodeCustom = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const decodeDefault = vi.fn().mockResolvedValue(new Uint8Array([9]));

    const testRegistry = new (registry.constructor as any)();
    testRegistry.registerFunctional({
      name: 'custom-j2k',
      transferSyntaxes: ['1.2.840.10008.1.2.4.91'],
      priority: 500,
      decode: decodeCustom,
    });
    testRegistry.register(new Jpeg2000Decoder(decodeDefault));

    const dec = await testRegistry.getDecoder('1.2.840.10008.1.2.4.91');
    const out = await dec?.decode([new Uint8Array([0])], {});
    expect(out).toEqual(new Uint8Array([1, 2, 3]));
  });
});
```

Run:

```bash
npx vitest run tests/integration/codec_external.test.ts
```

## 6) Practical Tips

- Normalize transfer syntax UIDs exactly (no spaces).
- For encapsulated pixel data, expect `fragments: Uint8Array[]`.
- Use `multiFrame: true` in `codecInfo` if your decoder expects/handles multi-frame data per fragment.
- Keep `priority` below 1000 to leave room for future internal codecs.

## 7) Troubleshooting

- **Not selected?** Check `isSupported()` and `priority`.
- **Wrong environment?** Gate with `isSupported` (e.g., browser-only codec in Node).
- **Hangs on undefined-length data?** Ensure your decoder handles fragments; the parser now skips safely in fast mode.

## 8) Using cornerstone codecs (OpenJPEG, CharLS, libjpeg-turbo)

These packages ship WASM decoders. You can wrap them with functional codecs:

```typescript
import { registry } from 'rad-parser';
// import { decodeJ2K } from '@cornerstonejs/codec-openjpeg'; // example binding
// import { decodeJls } from '@cornerstonejs/codec-charls';
// import { decodeJpeg } from '@cornerstonejs/codec-libjpeg-turbo-8bit';

registry.registerFunctional({
  name: 'cornerstone-openjpeg',
  transferSyntaxes: ['1.2.840.10008.1.2.4.90', '1.2.840.10008.1.2.4.91'],
  priority: 500,
  decode: async (fragments, info) => {
    // Call into your OpenJPEG binding here
    return decodeJ2K(fragments, info);
  },
});

registry.registerFunctional({
  name: 'cornerstone-charls',
  transferSyntaxes: ['1.2.840.10008.1.2.4.80', '1.2.840.10008.1.2.4.81'],
  priority: 500,
  decode: async (fragments, info) => decodeJls(fragments, info),
});

registry.registerFunctional({
  name: 'cornerstone-libjpeg',
  transferSyntaxes: ['1.2.840.10008.1.2.4.50', '1.2.840.10008.1.2.4.51'],
  priority: 500,
  decode: async (fragments, info) => decodeJpeg(fragments, info),
});
```

Notes:

- The actual decode entrypoints depend on the bindings you expose from each package; wire them into `decode`.
- Set `priority` higher than defaults to prefer these decoders.
- Gate with `isSupported` if needed (e.g., skip in environments without WASM support).

## 9) Third-party library examples

### The Adapter Pattern

The concept is simple:

1. You import a third-party decoding library.
2. You instantiate the corresponding `rad-parser` adapter codec (e.g., `Jpeg2000Decoder`).
3. You pass the third-party library's decoding function into the adapter's constructor.
4. You register this configured codec with the `rad-parser` registry.
5. The `rad-parser` can now decode files with that transfer syntax.

_Note: Since the dynamic loader will often load a default (unconfigured) adapter, it's best practice to instantiate your
own configured version and register it manually for these cases._

---

### JPEG 2000 Examples

JPEG 2000 (Transfer Syntaxes `1.2.840.10008.1.2.4.90` and `.91`) is a common format for lossless and lossy compression
in DICOM.

#### Using `openjpeg-js`

`openjpeg-js` is a popular WASM-based library for JPEG 2000.

**Installation:**

```bash
npm install openjpeg-js
```

**Integration Code:**

```typescript
import { parse, registry, Jpeg2000Decoder } from 'rad-parser';
import openjpeg from 'openjpeg-js'; // ESM module
import * as fs from 'fs';

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

  console.log('JPEG 2000 decoder configured and registered.');
}

// You must call the configuration before you start parsing J2K files.
// await configureOpenjpeg();
// const dataset = parse(dicomBytes, ...);
```

#### Using `jpeg2000-js`

`jpeg2000-js` is another JPEG 2000 library written in pure JavaScript.

**Installation:**

```bash
npm install jpeg2000-js
```

**Integration Code:**

```typescript
import { parse, registry, Jpeg2000Decoder } from 'rad-parser';
import { Jpeg2000Decoder as Jpeg2000Js } from 'jpeg2000-js';
import * as fs from 'fs';

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

  console.log('jpeg2000-js decoder configured and registered.');
}
```

---

### JPEG-LS Example

JPEG-LS (Transfer Syntaxes `1.2.840.10008.1.2.4.80` and `.81`) is a standard for lossless or near-lossless compression.

#### Using `charls-js`

`charls-js` is a WASM compilation of the CharLS JPEG-LS library.

**Installation:**

```bash
npm install charls-js
```

**Integration Code:**

```typescript
import { parse, registry, JpegLsDecoder } from 'rad-parser';
import charls from 'charls-js'; // Main export
import * as fs from 'fs';

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

  console.log('charls-js JPEG-LS decoder configured and registered.');
}

// Call this before parsing JPEG-LS files
// await configureCharlsJs();
```

## 10) Quick Checklist

- [ ] Register functional or adapter codec with correct transfer syntaxes.
- [ ] Provide `isSupported` for environment gating.
- [ ] Set `priority` to override defaults if needed.
- [ ] Add a small Vitest to verify selection and decode call.
- [ ] Run `npm test` and your benchmark to validate end-to-end.
