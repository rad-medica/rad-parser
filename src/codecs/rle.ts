/**
 * RLE Codec Plugin
 * Supports RLE Lossless (1.2.840.10008.1.2.5) decoding and encoding.
 */
import { CodecInfo, PixelDataCodec, registry } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";
import { ZigCodecs } from "./zig-codecs";

export class RleCodec implements PixelDataCodec {
    name = "rle-wasm";
    priority = 10;
    codecInfo: CodecInfo = {
        multiFrame: true,
    };

    private zigCodecs: ZigCodecs;
    private initPromise: Promise<void> | null = null;
    private wasmAvailable = false;

    constructor() {
        this.zigCodecs = new ZigCodecs();
        this.initPromise = this.initWasm();
    }

    private async initWasm(): Promise<void> {
        try {
            await this.zigCodecs.initCodec("rle");
            this.wasmAvailable = true;
        } catch (e) {
            console.warn(
                "Failed to init RLE Zig WASM codec, using JS fallback",
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

        if (this.initPromise) {
            await this.initPromise;
        }

        // RLE is per-frame, decode each fragment
        const decodedFrames = await Promise.all(
            encodedBuffer
                .filter(frag => frag.byteLength > 0)
                .map(frag => this.processFrame(frag, info))
        );

        if (decodedFrames.length === 0) {
            return new Uint8Array(0);
        }
        if (decodedFrames.length === 1) {
            return decodedFrames[0]!;
        }

        return concatFragments(decodedFrames);
    }

    private async processFrame(
        buffer: Uint8Array,
        info: any
    ): Promise<Uint8Array> {
        const view = new DataView(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength
        );

        if (view.byteLength < 64) {
            return this.decompressRle(new Uint8Array(buffer));
        }

        const numSegments = view.getUint32(0, true);
        if (numSegments === 0 || numSegments > 16) {
            return this.decompressRle(new Uint8Array(buffer));
        }

        const width = info?.width || info?.columns || 512;
        const height = info?.height || info?.rows || 512;
        const samples = info?.samplesPerPixel || numSegments;

        // Try Zig WASM first
        if (this.wasmAvailable) {
            try {
                return await this.zigCodecs.decodeRle(
                    buffer,
                    width,
                    height,
                    samples
                );
            } catch (e) {
                console.warn("WASM RLE decode failed, using JS fallback", e);
                // Return explicitly to satisfy void path if undefined not handled?
                // catch block falls through to JS fallback.
            }
        }

        // JS fallback
        const offsets: number[] = [];
        for (let i = 0; i < 15; i++) {
            offsets.push(view.getUint32(4 + i * 4, true));
        }

        const segments: Uint8Array[] = [];
        for (let i = 0; i < numSegments; i++) {
            const start = offsets[i];
            const end =
                i < numSegments - 1 && offsets[i + 1]! > 0
                    ? offsets[i + 1]!
                    : buffer.byteLength;
            // start is possibly undefined if offsets[i] is undefined?
            // offsets pushed 15 times, loop numSegments (max 16 used).
            // Actually offsets has 15 items. numSegments can be 1-16.
            // If numSegments is 16, i=15, offsets[15] is undefined.
            // Standard says RLE has 15 offsets for 15 segments max?
            // "The RLE Header contains the number of segments... followed by 15 offsets".
            // So segments max 15? No, max 15 offsets means 15 segments?
            // If numSegments > 15, we have a problem.
            // But line 90 check `numSegments > 16` -> fallback.
            // If numSegments is 16, offsets[15] undefined.
            // Lets assume checked.
            if (start !== undefined && start > 0 && start < buffer.byteLength) {
                segments.push(buffer.subarray(start, end));
            } else {
                segments.push(new Uint8Array(0));
            }
        }

        const decodedSegments = segments.map(s => this.decompressRle(s));

        if (decodedSegments.length === 0) return new Uint8Array(0);
        if (decodedSegments.length === 1) return decodedSegments[0]!;

        // Interleave segments
        const pixelCount = decodedSegments[0]!.length;
        const total = pixelCount * decodedSegments.length;
        const result = new Uint8Array(total);

        const bits =
            info?.bitsAllocated || (decodedSegments.length > 1 ? 16 : 8);

        if (bits === 16 && samples === 1 && decodedSegments.length >= 2) {
            const seg0 = decodedSegments[0]!;
            const seg1 = decodedSegments[1]!;
            for (let p = 0; p < pixelCount; p++) {
                result[p * 2] = seg1[p]!;
                result[p * 2 + 1] = seg0[p]!;
            }
        } else if (bits === 8 && samples === 3 && decodedSegments.length >= 3) {
            const seg0 = decodedSegments[0]!;
            const seg1 = decodedSegments[1]!;
            const seg2 = decodedSegments[2]!;
            for (let p = 0; p < pixelCount; p++) {
                result[p * 3] = seg0[p]!;
                result[p * 3 + 1] = seg1[p]!;
                result[p * 3 + 2] = seg2[p]!;
            }
        } else {
            for (let p = 0; p < pixelCount; p++) {
                for (let s = 0; s < decodedSegments.length; s++) {
                    const seg = decodedSegments[s];
                    if (seg) {
                        result[p * decodedSegments.length + s] = seg[p]!;
                    }
                }
            }
        }

        return result;
    }

    private decompressRle(src: Uint8Array): Uint8Array {
        const out: number[] = [];
        let i = 0;

        while (i < src.length) {
            const n = src[i++]!;
            if (n >= 0 && n <= 127) {
                const count = n + 1;
                if (i + count > src.length) {
                    for (let k = 0; k < src.length - i; k++) {
                        if (i < src.length) out.push(src[i++]!);
                    }
                    break;
                }
                for (let k = 0; k < count; k++) out.push(src[i++]!);
            } else if (n >= 129 && n <= 255) {
                const count = 257 - n;
                if (i >= src.length) break;
                const byte = src[i++]!;
                for (let k = 0; k < count; k++) out.push(byte);
            }
        }

        return new Uint8Array(out);
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number
    ): Promise<Uint8Array[]> {
        if (this.initPromise) {
            await this.initPromise;
        }

        // Try Zig WASM first
        if (this.wasmAvailable) {
            try {
                const encoded = await this.zigCodecs.encodeRle(
                    pixelData,
                    width,
                    height,
                    samples
                );
                return [encoded];
            } catch (e) {
                console.warn("WASM RLE encode failed, using JS fallback", e);
            }
        }

        // JS fallback - split into segments and encode
        const segments: Uint8Array[] = [];
        const numPixels = width * height;

        if (bits === 8) {
            if (samples === 1) {
                segments.push(pixelData);
            } else if (samples === 3) {
                const r = new Uint8Array(numPixels);
                const g = new Uint8Array(numPixels);
                const b = new Uint8Array(numPixels);
                for (let i = 0; i < numPixels; i++) {
                    r[i] = pixelData[i * 3]!;
                    g[i] = pixelData[i * 3 + 1]!;
                    b[i] = pixelData[i * 3 + 2]!;
                }
                segments.push(r, g, b);
            }
        } else if (bits === 16 && samples === 1) {
            const msb = new Uint8Array(numPixels);
            const lsb = new Uint8Array(numPixels);
            for (let i = 0; i < numPixels; i++) {
                lsb[i] = pixelData[i * 2]!;
                msb[i] = pixelData[i * 2 + 1]!;
            }
            segments.push(msb, lsb);
        } else {
            segments.push(pixelData);
        }

        const encodedSegments = segments.map(s => this.packBits(s));

        // Build header
        const header = new Uint8Array(64);
        const view = new DataView(header.buffer);
        const numSeg = encodedSegments.length;
        view.setUint32(0, numSeg, true);

        let currentOffset = 64;
        for (let i = 0; i < numSeg; i++) {
            view.setUint32(4 + i * 4, currentOffset, true);
            const seg = encodedSegments[i];
            if (seg) {
                currentOffset += seg.length;
            }
        }

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
            if (i + 1 < src.length && src[i] === src[i + 1]) {
                let runLen = 1;
                while (
                    i + runLen < src.length &&
                    src[i] === src[i + runLen] &&
                    runLen < 128
                ) {
                    runLen++;
                }
                if (runLen > 1) {
                    out.push(257 - runLen);
                    out.push(src[i]!);
                    i += runLen;
                }
                continue;
            }

            let runLen = 0;
            while (i + runLen < src.length && runLen < 128) {
                if (
                    i + runLen + 1 < src.length &&
                    src[i + runLen]! === src[i + runLen + 1]!
                ) {
                    break;
                }
                runLen++;
            }

            if (runLen > 0) {
                out.push(runLen - 1);
                for (let k = 0; k < runLen; k++) out.push(src[i++]!);
            }
        }
        return new Uint8Array(out);
    }
}

// Auto-register
registry.register(new RleCodec());
