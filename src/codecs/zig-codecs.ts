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
    free?: (ptr: number, size: number) => void;
    free_ptr?: (ptr: number) => void;
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
    // Note: C++ signature is (ptr, len, width, height, bits, components, quality)
    // Zig signature would be (ptr, len, width, height, components, quality, bits)
    // JPEG 2000
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
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
            }
            throw new Error(`JPEG decode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        if (exports.free_ptr) {
            exports.free_ptr(ptr);
            exports.free_ptr(outPtr);
        } else if (exports.free) {
            exports.free(ptr, data.length);
            exports.free(outPtr, outLen);
        }
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

        console.log(
            `[DEBUG] encodeJpeg: Type=${pixels.constructor.name}, Len=${pixels.length}, ByteLen=${pixels.byteLength}, W=${width}, H=${height}, Bits=${bits}, Comps=${components}`
        );

        // Check if encode_jpeg function exists
        if (!exports.encode_jpeg) {
            throw new Error("JPEG encode function not found in WASM module");
        }

        // Check supported component counts validation
        if (components !== 1 && components !== 3) {
            throw new Error(
                `JPEG encoding only supports 1 or 3 components, got ${components}`
            );
        }

        // Ensure memory can grow if needed
        const estimatedNeeded = pixels.length * 3; // Input + potential output
        if (estimatedNeeded > memory.buffer.byteLength && memory.grow) {
            const pagesNeeded = Math.ceil(
                (estimatedNeeded - memory.buffer.byteLength) / (64 * 1024)
            );
            memory.grow(pagesNeeded);
        }

        const ptr = exports.alloc(pixels.length);
        if (ptr === 0) throw new Error("WASM alloc failed");

        // Verify we can write to the allocated memory
        if (ptr + pixels.length > memory.buffer.byteLength) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, pixels.length);
            }
            throw new Error(
                `Insufficient WASM memory: allocated at ${ptr}, need ${pixels.length} bytes, have ${memory.buffer.byteLength}`
            );
        }

        this.writeBuffer(memory, ptr, pixels);

        // Signature: (ptr, len, width, height, bits, components, quality)
        // Note: The JPEG codec is built from C++ (jpeg.cpp), which has signature:
        // encode_jpeg(ptr, len, width, height, bits, components, quality)
        // NOT the Zig signature: encode_jpeg(ptr, len, width, height, components, quality, bits)
        const q = quality !== undefined ? quality : 90;

        // Ensure parameters are within valid ranges
        const validBits = Math.max(1, Math.min(bits, 16));
        const validComponents = Math.max(1, Math.min(components, 4));
        const validQuality = Math.max(1, Math.min(q, 100));

        try {
            // Signature: (ptr, len, width, height, bits, components, quality)
            // Verified against jpeg.cpp
            const res = exports.encode_jpeg(
                ptr,
                pixels.length,
                width,
                height,
                validBits,
                validComponents,
                validQuality
            );

            if (res !== 0) {
                if (exports.free_ptr) {
                    exports.free_ptr(ptr);
                } else if (exports.free) {
                    exports.free(ptr, pixels.length);
                }
                throw new Error(`JPEG encode failed with error code: ${res}`);
            }

            const outPtr = exports.get_result_ptr();
            const outLen = exports.get_result_len();
            const result = new Uint8Array(
                this.getMemory("jpeg").buffer,
                outPtr,
                outLen
            ).slice(); // Copy

            return result;
        } finally {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                // @ts-ignore
                exports.free(ptr, pixels.length);
            }
        }
    }

    // ==================== JPEG 2000 ====================

    public async decodeJpeg2000(data: Uint8Array): Promise<Uint8Array> {
        const exports = await this.getCodecExports("j2k");
        let memory = this.getMemory("j2k"); // Use let to allow reassignment after memory growth

        // Ensure memory can grow if needed - grow BEFORE allocation
        // Need space for: input data + potential large output (lossless can expand significantly)
        // For lossless decode, OpenJPEG may need significant temporary buffers
        const estimatedNeeded = Math.max(
            data.length * 30, // Very conservative estimate for lossless decode (OpenJPEG uses temp buffers)
            data.length * 3 // Input + potential output
        );
        if (estimatedNeeded > memory.buffer.byteLength && memory.grow) {
            const pagesNeeded = Math.ceil(
                (estimatedNeeded - memory.buffer.byteLength) / (64 * 1024)
            );
            memory.grow(pagesNeeded);
        }

        // Re-get memory reference after potential grow (buffer might have changed)
        memory = this.getMemory("j2k");

        const ptr = exports.alloc(data.length);
        if (ptr === 0) throw new Error("WASM alloc failed");

        // Verify we can write to the allocated memory
        if (ptr + data.length > memory.buffer.byteLength) {
            // Try growing memory again if allocation is out of bounds
            if (memory.grow) {
                const neededPages = Math.ceil(
                    (ptr + data.length - memory.buffer.byteLength) / (64 * 1024)
                );
                memory.grow(neededPages);
                // Re-get memory reference after grow
                memory = this.getMemory("j2k");
            }

            // Check again after potential grow
            if (ptr + data.length > memory.buffer.byteLength) {
                if (exports.free_ptr) {
                    exports.free_ptr(ptr);
                } else if (exports.free) {
                    exports.free(ptr, data.length);
                }
                throw new Error(
                    `Insufficient WASM memory: allocated at ${ptr}, need ${data.length} bytes, have ${memory.buffer.byteLength}`
                );
            }
        }

        this.writeBuffer(memory, ptr, data);

        if (!exports.decode_jpeg2000) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
            }
            throw new Error(
                "JPEG 2000 decode function not found in WASM module"
            );
        }

        // Verify the function is callable and parameters are valid
        if (ptr === 0 || data.length === 0) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
            }
            throw new Error(
                `Invalid parameters for JPEG 2000 decode: ptr=${ptr}, len=${data.length}`
            );
        }

        // Verify pointer is within memory bounds
        if (ptr + data.length > memory.buffer.byteLength) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
            }
            throw new Error(
                `Pointer out of bounds: ptr=${ptr}, len=${data.length}, memory size=${memory.buffer.byteLength}`
            );
        }

        // Ensure we have enough memory for potential output BEFORE calling decode
        // Lossless decode can require significant memory for intermediate buffers
        const estimatedOutputSize = data.length * 20; // Very conservative for lossless
        if (estimatedOutputSize > memory.buffer.byteLength && memory.grow) {
            const pagesNeeded = Math.ceil(
                (estimatedOutputSize - memory.buffer.byteLength) / (64 * 1024)
            );
            memory.grow(pagesNeeded);
        }

        // Re-get memory reference after potential grow (buffer reference might have changed)
        memory = this.getMemory("j2k");
        if (ptr + data.length > memory.buffer.byteLength) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
            }
            throw new Error(
                `Pointer still out of bounds after memory growth: ptr=${ptr}, len=${data.length}, memory size=${memory.buffer.byteLength}`
            );
        }

        let res: number;
        try {
            // Call decode function - WASM will validate pointer bounds
            res = exports.decode_jpeg2000(ptr, data.length);
        } catch (e: any) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
            }
            throw new Error(
                `JPEG 2000 decode WASM call failed: ${e.message || String(e)}`
            );
        }

        if (res !== 0) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
            }
            throw new Error(`JPEG 2000 decode failed with code: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();

        if (outPtr === 0 || outLen === 0) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
            }
            throw new Error(
                `JPEG 2000 decode returned invalid result: ptr=${outPtr}, len=${outLen}`
            );
        }

        const output = this.readBuffer(memory, outPtr, outLen);

        if (exports.free_ptr) {
            exports.free_ptr(ptr);
            exports.free_ptr(outPtr);
        } else if (exports.free) {
            exports.free(ptr, data.length);
            exports.free(outPtr, outLen);
        }
        return output;
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

        // Ensure memory can grow if needed
        const estimatedNeeded = pixels.length * 3; // Input + potential output
        if (estimatedNeeded > memory.buffer.byteLength && memory.grow) {
            const pagesNeeded = Math.ceil(
                (estimatedNeeded - memory.buffer.byteLength) / (64 * 1024)
            );
            memory.grow(pagesNeeded);
        }

        const ptr = exports.alloc(pixels.length);
        if (ptr === 0) throw new Error("WASM alloc failed");

        // Verify we can write to the allocated memory
        if (ptr + pixels.length > memory.buffer.byteLength) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, pixels.length);
            }
            throw new Error(
                `Insufficient WASM memory: allocated at ${ptr}, need ${pixels.length} bytes, have ${memory.buffer.byteLength}`
            );
        }

        this.writeBuffer(memory, ptr, pixels);

        if (!exports.encode_jpeg2000) {
            throw new Error(
                "JPEG 2000 encode function not found in WASM module"
            );
        }
        const res = exports.encode_jpeg2000(
            ptr,
            pixels.length,
            width,
            height,
            bits,
            components,
            lossless ? 1 : 0,
            quality || 0.0
        );
        if (res !== 0) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, pixels.length);
            }
            throw new Error(`JPEG 2000 encode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        if (exports.free_ptr) {
            exports.free_ptr(ptr);
            exports.free_ptr(outPtr);
        } else if (exports.free) {
            exports.free(ptr, pixels.length);
            exports.free(outPtr, outLen);
        }
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
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
            }
            throw new Error(`JPEG-LS decode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        if (exports.free_ptr) {
            exports.free_ptr(ptr);
            exports.free_ptr(outPtr);
        } else if (exports.free) {
            exports.free(ptr, data.length);
            exports.free(outPtr, outLen);
        }
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
        console.log(
            `[DEBUG] encodeJpegLs: Type=${pixels.constructor.name}, Len=${pixels.length}, ByteLen=${pixels.byteLength}, W=${width}, H=${height}, Bits=${bits}, Comps=${components}`
        );
        const memory = this.getMemory("jpegls");

        // Check if encode_jpegls function exists
        if (!exports.encode_jpegls) {
            throw new Error("JPEG-LS encode function not found in WASM module");
        }

        // Ensure memory can grow if needed
        const estimatedNeeded = pixels.length * 3; // Input + potential output
        if (estimatedNeeded > memory.buffer.byteLength && memory.grow) {
            const pagesNeeded = Math.ceil(
                (estimatedNeeded - memory.buffer.byteLength) / (64 * 1024)
            );
            memory.grow(pagesNeeded);
        }

        const ptr = exports.alloc(pixels.length);
        if (ptr === 0) throw new Error("WASM alloc failed");

        // Ensure we have enough memory after allocation
        const finalRequiredMemory = ptr + pixels.length;
        if (finalRequiredMemory > memory.buffer.byteLength) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, pixels.length);
            }
            throw new Error(
                `Insufficient WASM memory: need ${finalRequiredMemory}, have ${memory.buffer.byteLength}`
            );
        }

        this.writeBuffer(memory, ptr, pixels);

        // JPEG-LS C++ function expects uint8_t for bits_per_sample and components
        // Ensure values fit in uint8_t range (0-255)
        const bitsPerSample = Math.min(Math.max(1, bits), 255);
        const comps = Math.min(Math.max(1, components), 255);

        const res = exports.encode_jpegls(
            ptr,
            pixels.length,
            width,
            height,
            bitsPerSample,
            comps
        );
        if (res !== 0) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, pixels.length);
            }
            throw new Error(`JPEG-LS encode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        if (exports.free_ptr) {
            exports.free_ptr(ptr);
            exports.free_ptr(outPtr);
        } else if (exports.free) {
            exports.free(ptr, pixels.length);
            exports.free(outPtr, outLen);
        }
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
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
            }
            throw new Error(`RLE decode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();

        if (outPtr === 0 || outLen === 0) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
            }
            throw new Error(
                `RLE decode returned invalid result: ptr=${outPtr}, len=${outLen}`
            );
        }

        const output = this.readBuffer(memory, outPtr, outLen);

        if (!output || output.length === 0) {
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
                exports.free_ptr(outPtr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
                exports.free(outPtr, outLen);
            }
            throw new Error(`RLE decode returned empty buffer`);
        }

        if (exports.free_ptr) {
            exports.free_ptr(ptr);
            exports.free_ptr(outPtr);
        } else if (exports.free) {
            exports.free(ptr, data.length);
            exports.free(outPtr, outLen);
        }
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
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, pixels.length);
            }
            throw new Error(`RLE encode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        if (exports.free_ptr) {
            exports.free_ptr(ptr);
            exports.free_ptr(outPtr);
        } else if (exports.free) {
            exports.free(ptr, pixels.length);
            exports.free(outPtr, outLen);
        }
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
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
            }
            throw new Error(`HTJ2K decode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        if (exports.free_ptr) {
            exports.free_ptr(ptr);
            exports.free_ptr(outPtr);
        } else if (exports.free) {
            // @ts-ignore
            exports.free(ptr, data.length);
            // @ts-ignore
            exports.free(outPtr, outLen);
        }
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
            if (exports.free_ptr) {
                exports.free_ptr(ptr);
            } else if (exports.free) {
                exports.free(ptr, data.length);
            }
            throw new Error(`JPEG Lossless decode failed: ${res}`);
        }

        const outPtr = exports.get_result_ptr();
        const outLen = exports.get_result_len();
        const output = this.readBuffer(memory, outPtr, outLen);

        if (exports.free_ptr) {
            exports.free_ptr(ptr);
            exports.free_ptr(outPtr);
        } else if (exports.free) {
            exports.free(ptr, data.length);
            exports.free(outPtr, outLen);
        }
        return output;
    }

    /**
     * Unload all codec modules to free memory.
     */
    public unloadAll(): void {
        this.loader.unloadAll();
    }
}
