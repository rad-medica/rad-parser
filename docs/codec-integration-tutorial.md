# Codec Integration Tutorial

This guide shows how to integrate external codecs (WASM/native) with **rad-parser** using the codec registry and functional registration helpers.

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

registry.register(new Jpeg2000Decoder(async (fragments) => decodeJ2k(fragments)));
registry.register(new JpegLsDecoder(async (fragments) => decodeJls(fragments)));
registry.register(new VideoDecoder(async (fragments, info) => decodeH264(fragments, info)));
```

Encoders (JPEG-LS) can also be injected:

```typescript
registry.register(new JpegLsDecoder(
  async (fragments) => decodeJls(fragments),
  async (pixels, ts, w, h, samples, bits) => encodeJls(pixels, ts, w, h, samples, bits)
));
```

## 3) Browser vs Node

- **Browser**: `BrowserImageCodec` can handle JPEG Baseline via `ImageDecoder` when available; otherwise, inject your own via adapters/functional.
- **Node**: Use WASM/native bindings. Guard with `isSupported` to avoid selecting a browser-only codec in Node.

Example guard:

```typescript
const isBrowser = typeof window !== 'undefined' && typeof ImageDecoder !== 'undefined';
registry.registerFunctional({
  name: 'browser-jpeg',
  transferSyntaxes: ['1.2.840.10008.1.2.4.50'],
  priority: 300,
  isSupported: () => isBrowser,
  decode: async (fragments) => decodeWithImageDecoder(fragments),
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
    const decodeCustom = vi.fn().mockResolvedValue(new Uint8Array([1,2,3]));
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
    expect(out).toEqual(new Uint8Array([1,2,3]));
  });
});
```

Run:
```bash
npm test tests/codec_integration_external.test.ts
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

## 9) Using cornerstone codecs (OpenJPEG, CharLS, libjpeg-turbo)

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

## 8) Quick Checklist

- [ ] Register functional or adapter codec with correct transfer syntaxes.
- [ ] Provide `isSupported` for environment gating.
- [ ] Set `priority` to override defaults if needed.
- [ ] Add a small Vitest to verify selection and decode call.
- [ ] Run `npm test` and your benchmark to validate end-to-end.


