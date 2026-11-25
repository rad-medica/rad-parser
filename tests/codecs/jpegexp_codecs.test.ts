import { describe, expect, it } from 'vitest';
import '../../src/codecs/auto-register';
import { Htj2kDecoder } from '../../src/codecs/htj2k';
import { Jpeg2000Decoder } from '../../src/codecs/jpeg2000';
import { JpegLosslessDecoder } from '../../src/codecs/jpegLossless';
import { JpegLsDecoder } from '../../src/codecs/jpegls';
import { JpegNativeCodec } from '../../src/codecs/jpegNative';
import { WasmCodecs } from '../../src/codecs/wasm-codecs';
import { registry } from '../../src/core/registry';

const WIDTH = 67; // odd sizes catch stride and padding bugs
const HEIGHT = 45;

/** Deterministic gradient plus LCG noise, interleaved, spanning the full bit range. */
function makeImage(bits: number, components: number): Uint8Array {
  const max = (1 << bits) - 1;
  const count = WIDTH * HEIGHT * components;
  const samples = new Array<number>(count);
  let seed = 0x2545f491 ^ (bits * 31 + components);
  for (let i = 0; i < count; i++) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const pixel = Math.floor(i / components);
    const x = pixel % WIDTH;
    const y = Math.floor(pixel / WIDTH);
    const gradient = ((x + y * 2 + (i % components) * 17) / (WIDTH + HEIGHT * 2 + 34)) * max;
    const noise = (seed >>> 16) % Math.max(2, Math.floor(max / 16));
    samples[i] = Math.min(max, Math.floor(gradient) + noise);
  }
  if (bits <= 8) {
    return Uint8Array.from(samples);
  }
  const bytes = new Uint8Array(count * 2);
  const view = new DataView(bytes.buffer);
  samples.forEach((v, i) => view.setUint16(i * 2, v, true));
  return bytes;
}

function expectIdentical(actual: Uint8Array, expected: Uint8Array): void {
  expect(actual.length).toBe(expected.length);
  const firstMismatch = actual.findIndex((v, i) => v !== expected[i]);
  expect(firstMismatch).toBe(-1);
}

function psnr8(actual: Uint8Array, expected: Uint8Array): number {
  let squared = 0;
  for (let i = 0; i < expected.length; i++) {
    const d = actual[i]! - expected[i]!;
    squared += d * d;
  }
  const mse = squared / expected.length;
  return mse === 0 ? Infinity : 10 * Math.log10((255 * 255) / mse);
}

const LOSSLESS_CASES = [
  { label: 'gray 8-bit', bits: 8, components: 1 },
  { label: 'gray 12-bit', bits: 12, components: 1 },
  { label: 'gray 16-bit', bits: 16, components: 1 },
  { label: 'RGB 8-bit', bits: 8, components: 3 },
];

describe('jpegexp-rs codecs: exact lossless round-trips', () => {
  describe.each(LOSSLESS_CASES)('$label', ({ bits, components }) => {
    const input = makeImage(bits, components);

    it('JPEG-LS (.80)', async () => {
      const codec = new JpegLsDecoder();
      const ts = '1.2.840.10008.1.2.4.80';
      const encoded = await codec.encode(input, ts, WIDTH, HEIGHT, components, bits);
      expect([encoded[0]![0], encoded[0]![1]]).toEqual([0xff, 0xd8]);
      expectIdentical(await codec.decode(encoded, {}), input);
    });

    it('JPEG 2000 lossless (.90)', async () => {
      const codec = new Jpeg2000Decoder();
      const ts = '1.2.840.10008.1.2.4.90';
      const encoded = await codec.encode(input, ts, WIDTH, HEIGHT, components, bits);
      expect([encoded[0]![0], encoded[0]![1]]).toEqual([0xff, 0x4f]); // SOC
      expectIdentical(await codec.decode(encoded, {}), input);
    });

    it('HTJ2K lossless (.201)', async () => {
      const encoded = await new WasmCodecs().encodeJpeg2000(
        input,
        WIDTH,
        HEIGHT,
        bits,
        components,
        true,
        undefined,
        true
      );
      // CAP marker (FF50) is mandatory in HTJ2K codestreams and absent from Part 1.
      const cap = encoded.findIndex((v, i) => v === 0xff && encoded[i + 1] === 0x50);
      expect(cap).toBeGreaterThan(0);
      const decoded = await new Htj2kDecoder().decode([encoded], {});
      expectIdentical(decoded, input);
    });

    it('JPEG Lossless SV1 (.70)', async () => {
      const codec = new JpegLosslessDecoder();
      const ts = '1.2.840.10008.1.2.4.70';
      const encoded = await codec.encode(input, ts, WIDTH, HEIGHT, components, bits);
      const sof3 = encoded[0]!.findIndex((v, i) => v === 0xff && encoded[0]![i + 1] === 0xc3);
      expect(sof3).toBeGreaterThan(0);
      expectIdentical(await codec.decode(encoded, {}), input);
    });
  });
});

describe('jpegexp-rs codecs: lossy', () => {
  it('JPEG baseline (.50) RGB keeps colour and fidelity', async () => {
    const codec = new JpegNativeCodec();
    const ts = '1.2.840.10008.1.2.4.50';
    // Smooth RGB ramp: distinct per channel so a swapped or missing colour transform shows.
    const input = new Uint8Array(WIDTH * HEIGHT * 3);
    for (let p = 0; p < WIDTH * HEIGHT; p++) {
      const x = p % WIDTH;
      const y = Math.floor(p / WIDTH);
      input[p * 3] = Math.round((x / (WIDTH - 1)) * 255);
      input[p * 3 + 1] = Math.round((y / (HEIGHT - 1)) * 255);
      input[p * 3 + 2] = 255 - input[p * 3]!;
    }
    const encoded = await codec.encode(input, ts, WIDTH, HEIGHT, 3, 8, 95);
    // JFIF APP0 (FFE0) declares YCbCr: the round-trip below must go through RGB->YCbCr->RGB.
    const stream = encoded[0]!;
    expect(stream.findIndex((v, i) => v === 0xff && stream[i + 1] === 0xe0)).toBe(2);
    const decoded = await codec.decode(encoded, {});
    expect(decoded.length).toBe(input.length);
    expect(psnr8(decoded, input)).toBeGreaterThan(35);
  });

  it('JPEG extended (.51) 12-bit returns 16-bit samples', async () => {
    const codec = new JpegNativeCodec();
    const input = makeImage(12, 1);
    const encoded = await new WasmCodecs().encodeJpeg(input, WIDTH, HEIGHT, 12, 1, 95);
    const decoded = await codec.decode([encoded], {});
    expect(decoded.length).toBe(input.length);
    const a = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength);
    const b = new DataView(input.buffer);
    let maxError = 0;
    for (let i = 0; i < input.length; i += 2) {
      maxError = Math.max(maxError, Math.abs(a.getUint16(i, true) - b.getUint16(i, true)));
    }
    expect(maxError).toBeLessThan(4095 / 8);
  });

  it('JPEG 2000 lossy (.91) stays close', async () => {
    const codec = new Jpeg2000Decoder();
    const input = makeImage(8, 1);
    const encoded = await codec.encode(input, '1.2.840.10008.1.2.4.91', WIDTH, HEIGHT, 1, 8, 90);
    const decoded = await codec.decode(encoded, {});
    expect(decoded.length).toBe(input.length);
    expect(psnr8(decoded, input)).toBeGreaterThan(30);
  });

  it('rejects garbage instead of returning pixels', async () => {
    const garbage = Uint8Array.from({ length: 64 }, (_, i) => (i * 37) & 0xff);
    await expect(new JpegLsDecoder().decode([garbage], {})).rejects.toThrow();
    await expect(new Jpeg2000Decoder().decode([garbage], {})).rejects.toThrow();
    await expect(new JpegLosslessDecoder().decode([garbage], {})).rejects.toThrow();
  });
});

describe('transfer syntax routing', () => {
  it.each([
    ['1.2.840.10008.1.2.4.50', 'jpeg-native'],
    ['1.2.840.10008.1.2.4.51', 'jpeg-native'],
    ['1.2.840.10008.1.2.4.57', 'jpeglossless-wasm'],
    ['1.2.840.10008.1.2.4.70', 'jpeglossless-wasm'],
    ['1.2.840.10008.1.2.4.80', 'jpegls-wasm'],
    ['1.2.840.10008.1.2.4.81', 'jpegls-wasm'],
    ['1.2.840.10008.1.2.4.90', 'jpeg2000-wasm'],
    ['1.2.840.10008.1.2.4.91', 'jpeg2000-wasm'],
    ['1.2.840.10008.1.2.4.201', 'htj2k-wasm'],
    ['1.2.840.10008.1.2.4.202', 'htj2k-wasm'],
    ['1.2.840.10008.1.2.4.203', 'htj2k-wasm'],
  ])('%s decodes with %s', async (ts, name) => {
    const decoder = await registry.getDecoder(ts);
    expect(decoder?.name).toBe(name);
  });
});
