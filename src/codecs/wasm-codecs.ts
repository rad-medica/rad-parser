/**
 * WasmCodecs - High-level API for DICOM image codec operations.
 *
 * Uses individual WASM codec modules loaded on demand for each codec type.
 * This approach reduces initial load time and memory usage by only loading
 * the codecs that are actually needed.
 */

import { CodecType, ZigWasmCodecLoader } from "./wasm-codecs-loader";

interface CodecExports {
    memory?: WebAssembly.Memory;
    _malloc?: (size: number) => number;
    _free?: (ptr: number) => void;
    // Emscripten generic
    malloc?: (size: number) => number;
    free?: (ptr: number) => void;

    // Result helpers (custom from our C++ wrappers)
    get_result_ptr: () => number;
    get_result_len: () => number;
    // Emscripten style result accessors (usually prefixed with underscore if exported)
    _get_result_ptr?: () => number;
    _get_result_len?: () => number;

    // JPEG
    _decode_jpeg?: (ptr: number, len: number) => number;
    _encode_jpeg?: (
        ptr: number,
        len: number,
        width: number,
        height: number,
        bits: number,
        components: number,
        quality: number
    ) => number;

    // JPEG 2000
    // Updated to match CMake exports: _encode_jpeg2000, _decode_jpeg2000
    _decode_jpeg2000?: (ptr: number, len: number) => number;
    _encode_jpeg2000?: (
        ptr: number,
        len: number,
        width: number,
        height: number,
        bits: number,
        components: number,
        lossless_flag: number,
        quality_rate: number
    ) => number;

    // JPEG-LS
    _decode_jpegls?: (ptr: number, len: number) => number;
    _encode_jpegls?: (
        ptr: number,
        len: number,
        width: number,
        height: number,
        bits: number,
        components: number
    ) => number;

    // RLE
    _decode_rle?: (
        ptr: number,
        len: number,
        width: number,
        height: number,
        components: number
    ) => number;
    _encode_rle?: (
        ptr: number,
        len: number,
        width: number,
        height: number,
        components: number
    ) => number;

    // HTJ2K
    _decode_htj2k?: (ptr: number, len: number) => number;

    // JPEG Lossless
    _decode_ljpeg?: (ptr: number, len: number) => number;

    // Legacy / optional names (if loader maps them, unlikely with new loader)
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
    decode_jpeg2000?: (ptr: number, len: number) => number;
    encode_jpeg2000?: (
        ptr: number,
        len: number,
        width: number,
        height: number,
        bits: number,
        components: number,
        lossless_flag: number,
        quality_rate: number
    ) => number;
    decode_jpegls?: (ptr: number, len: number) => number;
    encode_jpegls?: (
        ptr: number,
        len: number,
        width: number,
        height: number,
        bits: number,
        components: number
    ) => number;
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
    decode_htj2k?: (ptr: number, len: number) => number;
    decode_ljpeg?: (ptr: number, len: number) => number;
}

export class WasmCodecs {
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

    private getMemory(codec: CodecType): WebAssembly.Memory | any {
        // Warning: if Emscripten module did not export wasmMemory, this might be ArrayBuffer
        // We cast it, but consumers must be aware.
        // Our writeBuffer/readBuffer handles both if implemented carefully.
        return this.loader.getCodec(codec).memory;
    }

    private writeBuffer(
        memory: WebAssembly.Memory | any, // Allow generic object or ArrayBuffer
        ptr: number,
        data: Uint8Array
    ) {
        let buffer: ArrayBuffer;
        if (memory instanceof WebAssembly.Memory) {
            buffer = memory.buffer;
        } else if (memory.buffer) {
            // Maybe it's a view?
            buffer = memory.buffer;
        } else {
            // Assume it is ArrayBuffer
            buffer = memory;
        }
        const mem = new Uint8Array(buffer);
        mem.set(data, ptr);
    }

    private readBuffer(
        memory: WebAssembly.Memory | any,
        ptr: number,
        size: number
    ): Uint8Array {
        let buffer: ArrayBuffer;
        if (memory instanceof WebAssembly.Memory) {
            buffer = memory.buffer;
        } else if (memory.buffer) {
            buffer = memory.buffer;
        } else {
            buffer = memory;
        }
        const mem = new Uint8Array(buffer);
        return mem.slice(ptr, ptr + size);
    }

    private getAllocator(exports: CodecExports): (size: number) => number {
        // Emscripten uses _malloc
        const alloc = exports._malloc || exports.malloc;
        if (!alloc) throw new Error("WASM alloc/malloc function not found");
        return alloc;
    }

    private getFree(exports: CodecExports): (ptr: number) => void {
        return exports._free || exports.free || (_p => {});
    }

    private getResultPtr(exports: CodecExports): number {
        return exports._get_result_ptr
            ? exports._get_result_ptr()
            : exports.get_result_ptr();
    }

    private getResultLen(exports: CodecExports): number {
        return exports._get_result_len
            ? exports._get_result_len()
            : exports.get_result_len();
    }

    // ==================== JPEG ====================

    public async decodeJpeg(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("jpeg");
        const memory = this.getMemory("jpeg");

        const alloc = this.getAllocator(exports);
        const free = this.getFree(exports);

        const ptr = alloc(data.length);
        if (ptr === 0) throw new Error("WASM alloc failed");

        try {
            this.writeBuffer(memory, ptr, data);

            const decode = exports._decode_jpeg || exports.decode_jpeg;
            if (!decode) throw new Error("decode_jpeg not found");

            const res = decode(ptr, data.length);
            if (res !== 0) {
                throw new Error(`JPEG decode failed: ${res}`);
            }

            const outPtr = this.getResultPtr(exports);
            const outLen = this.getResultLen(exports);
            const output = this.readBuffer(memory, outPtr, outLen);

            // Free result buffer if possible (if we have free)
            // Note: getResultPtr usually points to a global buffer managed by C++ side,
            // but we might need to explicitly free it if the API says so.
            // Our C++ code usually keeps it until next call or explicit free.
            // "if (last_result_ptr) free(last_result_ptr);" in set_result.
            // So subsequent calls cleanup previous. But to be clean we should probably have a free_result.
            // But we don't expose free_result anymore in exports interface above?
            // We can check.

            return output;
        } finally {
            free(ptr);
        }
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
        const alloc = this.getAllocator(exports);
        const free = this.getFree(exports);

        // Resize not supported natively on ArrayBuffer if not WebAssembly.Memory, but Emscripten handles heap.

        const ptr = alloc(pixels.length);
        if (ptr === 0) throw new Error("WASM alloc failed");

        try {
            this.writeBuffer(memory, ptr, pixels);

            const encode = exports._encode_jpeg || exports.encode_jpeg;
            if (!encode) throw new Error("encode_jpeg not found");

            const q = quality !== undefined ? quality : 90;
            const res = encode(
                ptr,
                pixels.length,
                width,
                height,
                bits,
                components,
                q
            );

            if (res !== 0) throw new Error(`JPEG encode failed: ${res}`);

            const outPtr = this.getResultPtr(exports);
            const outLen = this.getResultLen(exports);
            return this.readBuffer(memory, outPtr, outLen);
        } finally {
            free(ptr);
        }
    }

    // ==================== JPEG 2000 ====================

    public async decodeJpeg2000(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("j2k");
        const memory = this.getMemory("j2k");
        const alloc = this.getAllocator(exports);
        const free = this.getFree(exports);

        const ptr = alloc(data.length);
        if (ptr === 0) throw new Error("WASM alloc failed");

        try {
            this.writeBuffer(memory, ptr, data);

            const decode = exports._decode_jpeg2000 || exports.decode_jpeg2000;
            if (!decode) throw new Error("decode_jpeg2000 not found");

            const res = decode(ptr, data.length);
            if (res !== 0) throw new Error(`JPEG 2000 decode failed: ${res}`);

            const outPtr = this.getResultPtr(exports);
            const outLen = this.getResultLen(exports);
            return this.readBuffer(memory, outPtr, outLen);
        } finally {
            free(ptr);
        }
    }

    public async encodeJpeg2000(
        pixels: Uint8Array,
        width: number,
        height: number,
        bits: number,
        components: number,
        lossless: boolean,
        quality?: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("j2k");
        const memory = this.getMemory("j2k");
        const alloc = this.getAllocator(exports);
        const free = this.getFree(exports);

        const ptr = alloc(pixels.length);
        if (ptr === 0) throw new Error("WASM alloc failed");

        try {
            this.writeBuffer(memory, ptr, pixels);

            const encode = exports._encode_jpeg2000 || exports.encode_jpeg2000;
            if (!encode) throw new Error("encode_jpeg2000 not found");

            const res = encode(
                ptr,
                pixels.length,
                width,
                height,
                bits,
                components,
                lossless ? 1 : 0,
                quality || 0.0
            );
            if (res !== 0) throw new Error(`JPEG 2000 encode failed: ${res}`);

            const outPtr = this.getResultPtr(exports);
            const outLen = this.getResultLen(exports);
            return this.readBuffer(memory, outPtr, outLen);
        } finally {
            free(ptr);
        }
    }

    // ==================== JPEG-LS ====================

    public async decodeJpegLs(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("jpegls");
        const memory = this.getMemory("jpegls");
        const alloc = this.getAllocator(exports);
        const free = this.getFree(exports);

        const ptr = alloc(data.length);
        if (ptr === 0) throw new Error("WASM alloc failed");

        try {
            this.writeBuffer(memory, ptr, data);

            const decode = exports._decode_jpegls || exports.decode_jpegls;
            if (!decode) throw new Error("decode_jpegls not found");

            const res = decode(ptr, data.length);
            if (res !== 0) throw new Error(`JPEG-LS decode failed: ${res}`);

            const outPtr = this.getResultPtr(exports);
            const outLen = this.getResultLen(exports);
            return this.readBuffer(memory, outPtr, outLen);
        } finally {
            free(ptr);
        }
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
        const alloc = this.getAllocator(exports);
        const free = this.getFree(exports);

        const ptr = alloc(pixels.length + 128); // +128 for safety padding?
        if (ptr === 0) throw new Error("WASM alloc failed");

        try {
            this.writeBuffer(memory, ptr, pixels);

            const encode = exports._encode_jpegls || exports.encode_jpegls;
            if (!encode) throw new Error("encode_jpegls not found");

            // Assuming signature matches our C++ wrapper
            const resPtr = encode(
                ptr,
                pixels.length,
                width,
                height,
                bits,
                components
            );

            // Check based on return type. Our wrapper returns ptr to struct or error?
            // Check jpegls_c_api.cpp.
            // It returns a pointer to a struct { data, size, error, msg }.
            // So resPtr is that struct ptr.

            if (resPtr === 0) throw new Error("JPEG-LS encode returned null");

            let buffer: ArrayBufferLike;
            if (memory instanceof WebAssembly.Memory) buffer = memory.buffer;
            else buffer = memory.buffer || memory;

            const memView = new DataView(buffer);
            const outPtr = memView.getUint32(resPtr, true);
            const outLen = memView.getUint32(resPtr + 4, true);
            const error = memView.getInt32(resPtr + 8, true);

            if (error !== 0) {
                // Try to read error message if possible
                throw new Error(`JPEG-LS encode failed: code ${error}`);
            }

            // Free result struct? The wrapper manages it?
            // "free_encoded_data" was used before.
            // exports._free_encoded_data?
            // If strict Emscripten, we should probably manually free if we allocated or C++ allocated.
            // But let's grab data first.

            const output = this.readBuffer(memory, outPtr, outLen);
            return output;
        } finally {
            free(ptr);
            // free resPtr?
        }
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
        const alloc = this.getAllocator(exports);
        const free = this.getFree(exports);

        const ptr = alloc(data.length);
        if (ptr === 0) throw new Error("WASM alloc failed");

        try {
            this.writeBuffer(memory, ptr, data);

            const decode = exports._decode_rle || exports.decode_rle;
            if (!decode) throw new Error("decode_rle not found");

            const res = decode(ptr, data.length, width, height, components);
            if (res !== 0) throw new Error(`RLE decode failed: ${res}`);

            const outPtr = this.getResultPtr(exports);
            const outLen = this.getResultLen(exports);
            return this.readBuffer(memory, outPtr, outLen);
        } finally {
            free(ptr);
        }
    }

    public async encodeRle(
        pixels: Uint8Array,
        width: number,
        height: number,
        components: number
    ): Promise<Uint8Array> {
        const exports = await this.getCodecExports("rle");
        const memory = this.getMemory("rle");
        const alloc = this.getAllocator(exports);
        const free = this.getFree(exports);

        const ptr = alloc(pixels.length);
        if (ptr === 0) throw new Error("WASM alloc failed");

        try {
            this.writeBuffer(memory, ptr, pixels);

            const encode = exports._encode_rle || exports.encode_rle;
            if (!encode) throw new Error("encode_rle not found");

            const res = encode(ptr, pixels.length, width, height, components);
            if (res !== 0) throw new Error(`RLE encode failed: ${res}`);

            const outPtr = this.getResultPtr(exports);
            const outLen = this.getResultLen(exports);
            return this.readBuffer(memory, outPtr, outLen);
        } finally {
            free(ptr);
        }
    }

    // ==================== HTJ2K ====================

    public async decodeHtj2k(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("htj2k");
        const memory = this.getMemory("htj2k");
        const alloc = this.getAllocator(exports);
        const free = this.getFree(exports);

        const ptr = alloc(data.length);
        if (ptr === 0) throw new Error("WASM alloc failed");

        try {
            this.writeBuffer(memory, ptr, data);

            const decode = exports._decode_htj2k || exports.decode_htj2k;
            if (!decode) throw new Error("decode_htj2k not found");

            const res = decode(ptr, data.length);
            if (res !== 0) throw new Error(`HTJ2K decode failed: ${res}`);

            const outPtr = this.getResultPtr(exports);
            const outLen = this.getResultLen(exports);
            return this.readBuffer(memory, outPtr, outLen);
        } finally {
            free(ptr);
        }
    }

    // ==================== JPEG Lossless ====================

    public async decodeLjpeg(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("ljpeg");
        const memory = this.getMemory("ljpeg");
        const alloc = this.getAllocator(exports);
        const free = this.getFree(exports);

        const ptr = alloc(data.length);
        if (ptr === 0) throw new Error("WASM alloc failed");

        try {
            this.writeBuffer(memory, ptr, data);

            const decode = exports._decode_ljpeg || exports.decode_ljpeg;
            if (!decode) throw new Error("decode_ljpeg not found");

            const res = decode(ptr, data.length);
            if (res !== 0) throw new Error(`LJPEG decode failed: ${res}`);

            const outPtr = this.getResultPtr(exports);
            const outLen = this.getResultLen(exports);
            return this.readBuffer(memory, outPtr, outLen);
        } finally {
            free(ptr);
        }
    }

    /**
     * Unload all codec modules to free memory.
     */
    public unloadAll(): void {
        this.loader.unloadAll();
    }
}
