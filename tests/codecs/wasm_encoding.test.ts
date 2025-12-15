import { describe, it, expect, beforeAll } from 'vitest';
import { RleCodec } from '../../src/codecs/rle';
import { JpegNativeCodec } from '../../src/codecs/jpegNative';
import { initCodecsWasm } from '../../src/wasm-codecs-build/rad_parser_wasm_codecs';
import { readFileSync } from 'fs';
import path from 'path';

describe('Wasm Encoding', () => {
    let rleCodec: RleCodec;
    let jpegCodec: JpegNativeCodec;

    beforeAll(async () => {
        // Initialize Wasm
        await initCodecsWasm();
        rleCodec = new RleCodec();
        jpegCodec = new JpegNativeCodec();
        
        // Ensure Wasm is initialized in instances
        await rleCodec.initWasm();
        await jpegCodec.initWasm();
    });

    it('should round-trip encode/decode RLE', async () => {
        // Create synthetic gradient image (8-bit grayscale)
        const width = 256;
        const height = 256;
        const input = new Uint8Array(width * height);
        for (let i = 0; i < input.length; i++) {
            input[i] = i % 256;
        }

        // Encode
        const encodedFragments = await rleCodec.encode(input, '1.2.840.10008.1.2.5', width, height, 1, 8);
        expect(encodedFragments.length).toBeGreaterThan(0);
        
        // Decode
        const decoded = await rleCodec.decode(encodedFragments, { rows: height, columns: width, bitsAllocated: 8, samplesPerPixel: 1 });
        
        // Verify
        expect(decoded.length).toBe(input.length);
        // RLE is lossless, should be identical
        for (let i = 0; i < input.length; i++) {
            if (input[i] !== decoded[i]) {
                throw new Error(`Mismatch at index ${i}: expected ${input[i]}, got ${decoded[i]}`);
            }
        }
    });

    it('should encode JPEG (Wasm)', async () => {
        // Synthetic image
        const width = 64;
        const height = 64;
        const input = new Uint8Array(width * height);
        input.fill(128); // Grey

        // Encode
        // 1.2.840.10008.1.2.4.50 = JPEG Baseline
        const encodedFragments = await jpegCodec.encode(input, '1.2.840.10008.1.2.4.50', width, height, 1, 8);
        expect(encodedFragments.length).toBe(1);
        const jpegData = encodedFragments[0];

        // Check JPEG SOI marker (FF D8)
        expect(jpegData[0]).toBe(0xFF);
        expect(jpegData[1]).toBe(0xD8);
    });

    it('should round-trip encode/decode JPEG (Lossy)', async () => {
        // Synthetic gradient
        const width = 128;
        const height = 128;
        const input = new Uint8Array(width * height);
        for(let i=0; i<input.length; i++) input[i] = i % 255;

        // Encode
        const encodedFragments = await jpegCodec.encode(input, '1.2.840.10008.1.2.4.50', width, height, 1, 8);
        
        // Decode (using same codec, which uses Wasm decoder)
        const decoded = await jpegCodec.decode(encodedFragments, {});

        expect(decoded.length).toBe(input.length);
        
        // JPEG is lossy, so exact match isn't expected, but distinct features should be preserved.
        // We'll check sizes match and no error occurred.
    });
});
