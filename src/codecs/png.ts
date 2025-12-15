/**
 * PNG Encoder Plugin (Node.js Native)
 * Uses Node's 'zlib' module for DEFLATE compression.
 * No external dependencies (uses built-ins).
 */
import { CodecInfo, PixelDataCodec } from "../core/registry";

export class NodePngEncoder implements PixelDataCodec {
    name = "png-node";
    priority = 20;
    codecInfo: CodecInfo = {
        multiFrame: false, // Not applicable for an encoder, but required by interface
    };

    isWasmInitialized = false;
    wasmModule: any = null;

    constructor() {
        this.initWasm();
    }

    async initWasm() {
        try {
            // @ts-ignore - Build artifact
            this.wasmModule =
                await import("../../src/wasm-codecs-build/rad_parser_wasm_codecs.js");
            await this.wasmModule.default();
            this.isWasmInitialized = true;
            console.log("PNG WASM module initialized");
        } catch (e) {
            console.warn("Failed to load PNG WASM module", e);
        }
    }

    isSupported(): boolean {
        // Supported if Node (for fallback) or if Wasm loaded
        const isNode =
            typeof process !== "undefined" &&
            process.versions != null &&
            process.versions.node != null;
        return isNode || this.isWasmInitialized;
    }

    canDecode(ts: string): boolean {
        return false; // Encoder only
    }

    canEncode(ts: string): boolean {
        return ts === "png" || ts === "1.2.840.10008.1.2.4.50";
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        throw new Error("PNG Decoding not implemented");
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number,
    ): Promise<Uint8Array[]> {
        if (this.isWasmInitialized && this.wasmModule) {
            try {
                const result = this.wasmModule.png_encode(
                    pixelData,
                    width,
                    height,
                    bits,
                    samples,
                );
                return [result];
            } catch (e) {
                console.warn(
                    "Wasm PNG encode failed, falling back to Node.js implementation",
                    e,
                );
            }
        }

        // Fallback or Node-only path
        // Dynamic import to avoid bundling 'zlib' for browser builds
        let zlib;
        try {
            // webpack/esbuild ignore magic comment or variable trick might be needed
            // depending on the bundler. specific to esbuild:
            const zlibName = "zlib";
            zlib = await import(zlibName);
        } catch (e) {
            throw new Error("zlib not available (Node.js only)");
        }

        if (!zlib || !zlib.deflateSync) throw new Error("zlib missing");

        // 1. Prepare Scanlines (Filter 0: None)
        const bytesPerPixel = (bits / 8) * samples;
        const rowSize = width * bytesPerPixel;
        const rawBuffer = new Uint8Array(height * (rowSize + 1));

        for (let y = 0; y < height; y++) {
            const destOffset = y * (rowSize + 1);
            rawBuffer[destOffset] = 0; // Filter Type 0 (None)
            const srcOffset = y * rowSize;
            rawBuffer.set(
                pixelData.subarray(srcOffset, srcOffset + rowSize),
                destOffset + 1,
            );
        }

        // 2. Compress (Deflate)
        const compressed = zlib.deflateSync(rawBuffer);

        // 3. Construct PNG
        const chunks: Uint8Array[] = [];

        // Header
        chunks.push(
            new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );

        // IHDR
        const ihdr = new Uint8Array(13);
        const view = new DataView(ihdr.buffer);
        view.setUint32(0, width);
        view.setUint32(4, height);
        view.setUint8(8, bits); // Bit depth
        view.setUint8(9, samples === 3 ? 2 : 0); // ColorType: 2=RGB, 0=Gray
        view.setUint8(10, 0); // Compression
        view.setUint8(11, 0); // Filter
        view.setUint8(12, 0); // Interlace
        chunks.push(this.createChunk("IHDR", ihdr));

        // IDAT
        chunks.push(this.createChunk("IDAT", compressed));

        // IEND
        chunks.push(this.createChunk("IEND", new Uint8Array(0)));

        // Concat
        const totalLen = chunks.reduce((a, b) => a + b.length, 0);
        const result = new Uint8Array(totalLen);
        let pos = 0;
        for (const c of chunks) {
            result.set(c, pos);
            pos += c.length;
        }

        return [result];
    }

    private createChunk(type: string, data: Uint8Array): Uint8Array {
        const len = data.length;
        const chunk = new Uint8Array(4 + 4 + len + 4);
        const view = new DataView(chunk.buffer);

        view.setUint32(0, len);
        // Type
        for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
        // Data
        chunk.set(data, 8);

        // CRC (Type + Data)
        const crcInput = chunk.subarray(4, 8 + len);
        const crc = this.crc32(crcInput);
        view.setUint32(8 + len, crc);

        return chunk;
    }

    private crc32(buf: Uint8Array): number {
        const table = this.getCrcTable();
        let crc = 0 ^ -1;
        for (let i = 0; i < buf.length; i++) {
            crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
        }
        return (crc ^ -1) >>> 0;
    }

    private crcTable: Int32Array | null = null;
    private getCrcTable(): Int32Array {
        if (this.crcTable) return this.crcTable;
        let c;
        const table = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            }
            table[n] = c;
        }
        this.crcTable = table;
        return table;
    }
}
/**
 * Standalone PNG Encode Helper
 */
export interface EncodePngOptions {
    data: Uint8Array;
    width: number;
    height: number;
    colorType: "grayscale" | "rgb";
    bitDepth: 8 | 16;
}

export async function encodePNG(
    options: EncodePngOptions,
): Promise<Uint8Array> {
    const encoder = new NodePngEncoder();
    // Try to init wasm (best effort, non-blocking if we want sync-like behavior but this is async)
    await encoder.initWasm();

    const samples = options.colorType === "grayscale" ? 1 : 3;
    const fragments = await encoder.encode(
        options.data,
        "png",
        options.width,
        options.height,
        samples,
        options.bitDepth,
    );
    return fragments[0];
}
