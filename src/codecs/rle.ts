/**
 * RLE Codec Plugin
 * Supports RLE Lossless (1.2.840.10008.1.2.5) decoding and encoding.
 */
import { CodecInfo, PixelDataCodec } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";

export class RleCodec implements PixelDataCodec {
    name = "rle-typescript";
    priority = 10; // Fallback
    codecInfo: CodecInfo = {
        multiFrame: true,
    };

    isWasmInitialized = false;
    wasmModule: any = null;

    constructor() {
        this.initWasm();
    }

    async initWasm() {
        try {
            // Dynamic import to avoid hard dependency
            // @ts-ignore - Build artifact
            this.wasmModule = await import(
                "../../src/wasm-codecs-build/rad_parser_wasm_codecs.js"
            );
            await this.wasmModule.default(); // Initialize WASM
            this.isWasmInitialized = true;
            console.log("RLE WASM module initialized");
        } catch (e) {
            console.warn(
                "Failed to load RLE WASM module, falling back to JS",
                e
            );
        }
    }

    isSupported(): boolean {
        return true;
    }

    canDecode(ts: string): boolean {
        return ts === "1.2.840.10008.1.2.5";
    }

    canEncode(ts: string): boolean {
        return ts === "1.2.840.10008.1.2.5";
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        if (encodedBuffer.length === 0) {
            return new Uint8Array(0);
        }

        // RLE is per-frame, so decode each fragment and then concatenate the results.
        const decodedFrames = encodedBuffer
            .filter((frag) => frag.byteLength > 0)
            .map((frag) => this.processFrame(frag, info));

        if (decodedFrames.length === 0) {
            return new Uint8Array(0);
        }
        if (decodedFrames.length === 1) {
            return decodedFrames[0];
        }

        return concatFragments(decodedFrames);
    }

    private processFrame(buffer: Uint8Array, info: any): Uint8Array {
        const view = new DataView(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength
        );

        if (view.byteLength < 64) {
            // Not a valid RLE frame with header, try to decompress directly
            return this.decompressRle(new Uint8Array(buffer));
        }

        const numSegments = view.getUint32(0, true);
        if (numSegments === 0 || numSegments > 16) {
            // Invalid header, try to decompress directly
            return this.decompressRle(new Uint8Array(buffer));
        }

        const offsets: number[] = [];
        for (let i = 0; i < 15; i++) {
            offsets.push(view.getUint32(4 + i * 4, true));
        }

        const segments: Uint8Array[] = [];
        for (let i = 0; i < numSegments; i++) {
            const start = offsets[i];
            const end =
                i < numSegments - 1 && offsets[i + 1] > 0
                    ? offsets[i + 1]
                    : buffer.byteLength;
            if (start > 0 && start < buffer.byteLength) {
                segments.push(buffer.subarray(start, end));
            } else {
                segments.push(new Uint8Array(0)); // Handle invalid offset
            }
        }

        const decodedSegments = segments.map((s) => {
            if (this.isWasmInitialized && this.wasmModule) {
                try {
                    return this.wasmModule.rle_decode(s);
                } catch (e) {
                    console.warn("Wasm decode failed, fallback to JS", e);
                    return this.decompressRle(s);
                }
            }
            return this.decompressRle(s);
        });

        if (decodedSegments.length === 0) return new Uint8Array(0);
        if (decodedSegments.length === 1) return decodedSegments[0];

        // Interleave (Planar -> Interleaved)
        const pixelCount = decodedSegments[0].length;
        const total = pixelCount * decodedSegments.length;
        const result = new Uint8Array(total);

        const samples = info?.samplesPerPixel || decodedSegments.length;
        const bits =
            info?.bitsAllocated || (decodedSegments.length > 1 ? 16 : 8);

        if (bits === 16 && samples === 1 && decodedSegments.length >= 2) {
            // DICOM Standard PS3.5 Annex G:
            // "For 16-bit data... Segment 1: MSB... Segment 2: LSB"
            // We want Little Endian output (LSB, MSB), so we write seg1 then seg0.
            for (let p = 0; p < pixelCount; p++) {
                result[p * 2] = decodedSegments[1][p]; // LSB from Seg 1
                result[p * 2 + 1] = decodedSegments[0][p]; // MSB from Seg 0
            }
        } else if (bits === 8 && samples === 3 && decodedSegments.length >= 3) {
            // Likely RGB 8-bit.
            // Seg 0=R, Seg 1=G, Seg 2=B.
            for (let p = 0; p < pixelCount; p++) {
                result[p * 3] = decodedSegments[0][p];
                result[p * 3 + 1] = decodedSegments[1][p];
                result[p * 3 + 2] = decodedSegments[2][p];
            }
        } else {
            // Fallback: generic interleave based on segment count
            for (let p = 0; p < pixelCount; p++) {
                for (let s = 0; s < decodedSegments.length; s++) {
                    result[p * decodedSegments.length + s] =
                        decodedSegments[s][p];
                }
            }
        }

        return result;
    }

    private decompressRle(src: Uint8Array): Uint8Array {
        // Implement PackBits decompression
        const out: number[] = [];
        let i = 0;

        while (i < src.length) {
            const n = src[i++];
            if (n >= 0 && n <= 127) {
                // Literal run
                const count = n + 1;
                if (i + count > src.length) {
                    // Copy what's left
                    for (let k = 0; k < src.length - i; k++) out.push(src[i++]);
                    break;
                }
                for (let k = 0; k < count; k++) out.push(src[i++]);
            } else if (n >= 129 && n <= 255) {
                // Repeat run (-1 to -127)
                const count = 257 - n;
                if (i >= src.length) break; // formatting error
                const byte = src[i++];
                for (let k = 0; k < count; k++) out.push(byte);
            }
            // n == 128 is No-op
        }

        return new Uint8Array(out);
    }

    // --- ENCODER ---

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number
    ): Promise<Uint8Array[]> {
        // Split into segments
        // Inverse of processFrame.
        // If 8-bit Gray: 1 segment.
        // If 8-bit RGB: 3 segments.
        // If 16-bit Gray: 2 segments (MSB, LSB).

        const segments: Uint8Array[] = [];
        const numPixels = width * height;

        if (bits === 8) {
            if (samples === 1) {
                segments.push(pixelData);
            } else if (samples === 3) {
                // De-interleave: RRR... GGG... BBB...
                const r = new Uint8Array(numPixels);
                const g = new Uint8Array(numPixels);
                const b = new Uint8Array(numPixels);
                for (let i = 0; i < numPixels; i++) {
                    r[i] = pixelData[i * 3];
                    g[i] = pixelData[i * 3 + 1];
                    b[i] = pixelData[i * 3 + 2];
                }
                segments.push(r, g, b);
            }
        } else if (bits === 16 && samples === 1) {
            // De-interleave MSB/LSB. Input is Little Endian (LSB MSB).
            // Output Seg 0 = MSB, Seg 1 = LSB.
            const msb = new Uint8Array(numPixels);
            const lsb = new Uint8Array(numPixels);
            for (let i = 0; i < numPixels; i++) {
                lsb[i] = pixelData[i * 2]; // LSB
                msb[i] = pixelData[i * 2 + 1]; // MSB
            }
            segments.push(msb, lsb);
        } else {
            // Fallback: 1 segment (raw dump? RLE requires deinterleaving usually)
            // Default to raw copy
            segments.push(pixelData);
        }

        // Compress segments
        const encodedSegments = segments.map((s) => {
            if (this.isWasmInitialized && this.wasmModule) {
                try {
                    // Wasm encode
                    return this.wasmModule.rle_encode(
                        s,
                        width,
                        height,
                        samples, // samples per pixel (can be 1 or 3)
                        bits // bits allocated (8 or 16)
                    );
                } catch (e) {
                    console.warn("Wasm encode failed, fallback to JS. Error:", e);
                    // Fallback to JS if Wasm fails
                    return this.packBits(s);
                }
            }
            return this.packBits(s);
        });

        // Build Header
        // 16 offsets (64 bytes).
        const header = new Uint8Array(64);
        const view = new DataView(header.buffer);
        const numSeg = encodedSegments.length;
        view.setUint32(0, numSeg, true);

        let currentOffset = 64;
        for (let i = 0; i < numSeg; i++) {
            view.setUint32(4 + i * 4, currentOffset, true);
            currentOffset += encodedSegments[i].length;
        }

        // Concatenate everything
        const totalSize =
            64 + encodedSegments.reduce((a, b) => a + b.length, 0);
        const frame = new Uint8Array(totalSize);
        frame.set(header, 0);
        let pos = 64;
        for (const s of encodedSegments) {
            frame.set(s, pos);
            pos += s.length;
        }

        return [frame];
    }

    private packBits(src: Uint8Array): Uint8Array {
        const out: number[] = [];
        let i = 0;
        while (i < src.length) {
            // Look for run
            if (i + 1 < src.length && src[i] === src[i + 1]) {
                // Repeat run
                let runLen = 1;
                while (
                    i + runLen < src.length &&
                    src[i] === src[i + runLen] &&
                    runLen < 128
                ) {
                    runLen++;
                }
                if (runLen > 1) {
                    // Output repeat
                    // n = 257 - count.
                    out.push(257 - runLen);
                    out.push(src[i]);
                    i += runLen;
                } else {
                    // Should not happen unless end of buffer with 2 same bytes
                    // Technically repeat 1 is inefficient (2 bytes output).
                    // Better treated as literal. But logic above `i+runLen` handles it.
                    // If loop terminated because runLen hit 128.
                    // If runLen=2, output 2 bytes: (255, val). Cost 2 bytes. Literal cost 2 bytes (0, val).
                    // Same.
                    // But usually PackBits prefers literals for short runs.
                    // I'll stick to simple logic for now.
                }
                continue;
            }

            // Literal run
            let runLen = 0;
            while (i + runLen < src.length && runLen < 128) {
                if (
                    i + runLen + 1 < src.length &&
                    src[i + runLen] === src[i + runLen + 1]
                ) {
                    // Found start of a repeat run. Break literal run.
                    break;
                }
                runLen++;
            }

            if (runLen > 0) {
                out.push(runLen - 1); // 0-based
                for (let k = 0; k < runLen; k++) out.push(src[i++]);
            }
        }
        return new Uint8Array(out);
    }
}

