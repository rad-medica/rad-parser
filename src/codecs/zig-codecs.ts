/**
 * ZigCodecs - High-level API for DICOM image codec operations.
 *
 * Uses individual WASM codec modules loaded on demand for each codec type.
 * This approach reduces initial load time and memory usage by only loading
 * the codecs that are actually needed.
 */

import { CodecType, ZigWasmCodecLoader } from "./wasm-codecs-loader";

interface CodecExports {
    memory: WebAssembly.Memory;
    alloc: (size: number) => number;
    free: (ptr: number, size: number) => void;
    get_result_ptr: () => number;
    get_result_len: () => number;
    // JPEG
    decode_jpeg?: (ptr: number, len: number) => number;
    encode_jpeg?: (
        ptr: number,
        len: number,
        width: number,
        height: number,
        bits: number,
        components: number,
        quality: number
    ) => number;
    // JPEG 2000
    decode_jpeg2000?: (ptr: number, len: number) => number;
    encode_jpeg2000?: (
        ptr: number,
        len: number,
        width: number,
        height: number,
        bits: number,
        components: number
    ) => number;
    // JPEG-LS
    decode_jpegls?: (ptr: number, len: number) => number;
    encode_jpegls?: (
        ptr: number,
        len: number,
        width: number,
        height: number,
        bits: number,
        components: number
    ) => number;
    // RLE
    decode_rle?: (
        ptr: number,
        len: number,
        width: number,
        height: number,
        components: number
    ) => number;
    encode_rle?: (
        ptr: number,
        len: number,
        width: number,
        height: number,
        components: number
    ) => number;
    // HTJ2K (OpenJPH)
    decode_htj2k?: (ptr: number, len: number) => number;
    // JPEG Lossless (libjpeg-lj)
    decode_ljpeg?: (ptr: number, len: number) => number;
}

export class ZigCodecs {
    private loader: ZigWasmCodecLoader;
    private basePath?: string;

    constructor(basePath?: string) {
        this.loader = ZigWasmCodecLoader.getInstance();
        this.basePath = basePath;
        if (basePath) {
            this.loader.setBasePath(basePath);
        }
    }

    /**
     * Initialize a specific codec. Called automatically when using codec methods.
     */
    public async initCodec(codec: CodecType): Promise<void> {
        await this.loader.loadCodec(codec);
    }

    /**
     * Get codec type for a DICOM Transfer Syntax UID.
     */
    public static getCodecForTransferSyntax(
        transferSyntaxUid: string
    ): CodecType | null {
        return ZigWasmCodecLoader.getCodecForTransferSyntax(transferSyntaxUid);
    }

    private async getCodecExports(codec: CodecType): Promise<CodecExports> {
        const module = await this.loader.loadCodec(codec);
        return module.exports as unknown as CodecExports;
    }

    private getMemory(codec: CodecType): WebAssembly.Memory {
        return this.loader.getCodec(codec).memory;
    }

    private writeBuffer(
        memory: WebAssembly.Memory,
        ptr: number,
        data: Uint8Array
    ) {
        const mem = new Uint8Array(memory.buffer);
        mem.set(data, ptr);
    }

    private readBuffer(
        memory: WebAssembly.Memory,
        ptr: number,
        size: number
    ): Uint8Array {
        const mem = new Uint8Array(memory.buffer);
        return mem.slice(ptr, ptr + size);
    }

    // ==================== JPEG ====================

    public async decodeJpeg(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("jpeg");
        const memory = this.getMemory("jpeg");

        const ptr = exports.alloc(data.length);
        if (ptr === 0) throw new Error("WASM alloc failed");
        this.writeBuffer(memory, ptr, data);

        const res = exports.decode_jpeg!(ptr, data.length);
        if (res !== 0) {
            exports.free(ptr, data.length);
            throw new Error(`JPEG decode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        exports.free(ptr, data.length);
        exports.free(outPtr, outLen);
        return output;
    }

    public async encodeJpeg(
        pixels: Uint8Array,
        width: number,
        height: number,
        bits: number,
        components: number,
        quality: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("jpeg");
        const memory = this.getMemory("jpeg");

        const ptr = exports.alloc(pixels.length);
        if (ptr === 0) throw new Error("WASM alloc failed");
        this.writeBuffer(memory, ptr, pixels);

        // Param order: pixel_data, len, width, height, bits, components, quality
        const res = exports.encode_jpeg!(
            ptr,
            pixels.length,
            width,
            height,
            bits,
            components,
            quality
        );
        if (res !== 0) {
            exports.free(ptr, pixels.length);
            throw new Error(`JPEG encode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        exports.free(ptr, pixels.length);
        exports.free(outPtr, outLen);
        return output;
    }

    // ==================== JPEG 2000 ====================

    public async decodeJpeg2000(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("j2k");
        const memory = this.getMemory("j2k");

        const ptr = exports.alloc(data.length);
        if (ptr === 0) throw new Error("WASM alloc failed");
        this.writeBuffer(memory, ptr, data);

        const res = exports.decode_jpeg2000!(ptr, data.length);
        if (res !== 0) {
            exports.free(ptr, data.length);
            throw new Error(`JPEG 2000 decode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        exports.free(ptr, data.length);
        exports.free(outPtr, outLen);
        return output;
    }

    public async encodeJpeg2000(
        pixels: Uint8Array,
        width: number,
        height: number,
        bits: number,
        components: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("j2k");
        const memory = this.getMemory("j2k");

        const ptr = exports.alloc(pixels.length);
        if (ptr === 0) throw new Error("WASM alloc failed");
        this.writeBuffer(memory, ptr, pixels);

        const res = exports.encode_jpeg2000!(
            ptr,
            pixels.length,
            width,
            height,
            bits,
            components
        );
        if (res !== 0) {
            exports.free(ptr, pixels.length);
            throw new Error(`JPEG 2000 encode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        exports.free(ptr, pixels.length);
        exports.free(outPtr, outLen);
        return output;
    }

    // ==================== JPEG-LS ====================

    public async decodeJpegLs(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("jpegls");
        const memory = this.getMemory("jpegls");

        const ptr = exports.alloc(data.length);
        if (ptr === 0) throw new Error("WASM alloc failed");
        this.writeBuffer(memory, ptr, data);

        const res = exports.decode_jpegls!(ptr, data.length);
        if (res !== 0) {
            exports.free(ptr, data.length);
            throw new Error(`JPEG-LS decode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        exports.free(ptr, data.length);
        exports.free(outPtr, outLen);
        return output;
    }

    public async encodeJpegLs(
        pixels: Uint8Array,
        width: number,
        height: number,
        bits: number,
        components: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("jpegls");
        const memory = this.getMemory("jpegls");

        const ptr = exports.alloc(pixels.length);
        if (ptr === 0) throw new Error("WASM alloc failed");
        this.writeBuffer(memory, ptr, pixels);

        const res = exports.encode_jpegls!(
            ptr,
            pixels.length,
            width,
            height,
            bits,
            components
        );
        if (res !== 0) {
            exports.free(ptr, pixels.length);
            throw new Error(`JPEG-LS encode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        exports.free(ptr, pixels.length);
        exports.free(outPtr, outLen);
        return output;
    }

    // ==================== RLE ====================

    public async decodeRle(
        data: Uint8Array,
        width: number,
        height: number,
        components: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("rle");
        const memory = this.getMemory("rle");

        const ptr = exports.alloc(data.length);
        if (ptr === 0) throw new Error("WASM alloc failed");
        this.writeBuffer(memory, ptr, data);

        const res = exports.decode_rle!(
            ptr,
            data.length,
            width,
            height,
            components
        );
        if (res !== 0) {
            exports.free(ptr, data.length);
            throw new Error(`RLE decode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        exports.free(ptr, data.length);
        exports.free(outPtr, outLen);
        return output;
    }

    public async encodeRle(
        pixels: Uint8Array,
        width: number,
        height: number,
        components: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("rle");
        const memory = this.getMemory("rle");

        const ptr = exports.alloc(pixels.length);
        if (ptr === 0) throw new Error("WASM alloc failed");
        this.writeBuffer(memory, ptr, pixels);

        const res = exports.encode_rle!(
            ptr,
            pixels.length,
            width,
            height,
            components
        );
        if (res !== 0) {
            exports.free(ptr, pixels.length);
            throw new Error(`RLE encode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        exports.free(ptr, pixels.length);
        exports.free(outPtr, outLen);
        return output;
    }

    // ==================== HTJ2K ====================

    public async decodeHtj2k(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("htj2k");
        const memory = this.getMemory("htj2k");

        const ptr = exports.alloc(data.length);
        if (ptr === 0) throw new Error("WASM alloc failed");
        this.writeBuffer(memory, ptr, data);

        const res = exports.decode_htj2k!(ptr, data.length);
        if (res !== 0) {
            exports.free(ptr, data.length);
            throw new Error(`HTJ2K decode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        exports.free(ptr, data.length);
        exports.free(outPtr, outLen);
        return output;
    }

    // ==================== JPEG Lossless ====================

    public async decodeLJpeg(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("ljpeg");
        const memory = this.getMemory("ljpeg");

        const ptr = exports.alloc(data.length);
        if (ptr === 0) throw new Error("WASM alloc failed");
        this.writeBuffer(memory, ptr, data);

        const res = exports.decode_ljpeg!(ptr, data.length);
        if (res !== 0) {
            exports.free(ptr, data.length);
            throw new Error(`JPEG Lossless decode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        exports.free(ptr, data.length);
        exports.free(outPtr, outLen);
        return output;
    }

    /**
     * Unload all codec modules to free memory.
     */
    public unloadAll(): void {
        this.loader.unloadAll();
    }
}
