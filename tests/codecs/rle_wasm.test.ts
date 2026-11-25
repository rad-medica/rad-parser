import { describe, expect, it } from 'vitest';
import { RleCodec } from '../../src/codecs/rle';

const TS = '1.2.840.10008.1.2.5';
const WIDTH = 131; // > 128 so literal and replicate runs cross the PackBits limit
const HEIGHT = 37;

/** Mix of long flat runs and noise, so both PackBits run kinds hit their 128-byte limit. */
function makeSamples(count: number, max: number): number[] {
  let seed = 0x9e3779b9;
  return Array.from({ length: count }, (_, i) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.floor(i / 300) % 2 === 0 ? (i >> 9) % (max + 1) : (seed >>> 8) % (max + 1);
  });
}

describe('RLE Lossless (.5) via WASM', () => {
  it('round-trips 8-bit RGB with correct interleaving', async () => {
    const codec = new RleCodec();
    const input = Uint8Array.from(makeSamples(WIDTH * HEIGHT * 3, 255));
    const encoded = await codec.encode(input, TS, WIDTH, HEIGHT, 3, 8);
    const decoded = await codec.decode(encoded, {
      rows: HEIGHT,
      columns: WIDTH,
      bitsAllocated: 8,
      samplesPerPixel: 3,
    });
    expect(decoded.length).toBe(input.length);
    expect(decoded.findIndex((v, i) => v !== input[i])).toBe(-1);
  });

  it('round-trips 16-bit gray as little-endian samples', async () => {
    const codec = new RleCodec();
    const samples = makeSamples(WIDTH * HEIGHT, 65535);
    const input = new Uint8Array(samples.length * 2);
    const view = new DataView(input.buffer);
    samples.forEach((v, i) => view.setUint16(i * 2, v, true));
    const encoded = await codec.encode(input, TS, WIDTH, HEIGHT, 1, 16);
    const decoded = await codec.decode(encoded, {
      rows: HEIGHT,
      columns: WIDTH,
      bitsAllocated: 16,
      samplesPerPixel: 1,
    });
    expect(decoded.length).toBe(input.length);
    expect(decoded.findIndex((v, i) => v !== input[i])).toBe(-1);
  });
});
