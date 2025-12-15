/**
 * Native JPEG Codec Plugin
 * Uses Wasm (jpeg-encoder) for encoding and Wasm/JS for decoding.
 * Provides JPEG Baseline encoding support for Node.js environments.
 */
import { CodecInfo, PixelDataCodec } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";

export class JpegNativeCodec implements PixelDataCodec {
    name = "jpeg-native";
    priority = 20;
    codecInfo: CodecInfo = {
        multiFrame: false,
    };

    isWasmInitialized = false;
    wasmModule: any = null;

    constructor() {
        this.initWasm();
    }

    async initWasm() {
        try {
            // @ts-ignore
            this.wasmModule = await import(
                "../../src/wasm-codecs-build/rad_parser_wasm_codecs.js"
            );
            await this.wasmModule.default();
            this.isWasmInitialized = true;
            console.log("JPEG Native WASM module initialized");
        } catch (e) {
            console.warn("Failed to load JPEG WASM module", e);
        }
    }

    isSupported(): boolean {
        return true;
    }

    canDecode(ts: string): boolean {
        return ["1.2.840.10008.1.2.4.50", "1.2.840.10008.1.2.4.51"].includes(ts);
    }

    canEncode(ts: string): boolean {
        // Only Baseline (Process 1) supported by jpeg-encoder
        return ts === "1.2.840.10008.1.2.4.50";
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        // Reuse existing decode logic or delegate to another codec if needed
        // For now, simple Wasm decode
        const combined = concatFragments(encodedBuffer);
        
        if (this.isWasmInitialized && this.wasmModule) {
            try {
                return this.wasmModule.jpeg_decode(combined);
            } catch (e) {
                console.warn("Wasm JPEG decode failed", e);
            }
        }
        throw new Error("JPEG decoder Wasm not initialized");
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number
    ): Promise<Uint8Array[]> {
        if (!this.isWasmInitialized || !this.wasmModule) {
            throw new Error("JPEG Wasm module not initialized");
        }

        // Determine color type: 0 = Grayscale (Luma), 1 = RGB
        let colorType = 0;
        if (samples === 3) {
            colorType = 1;
        } else if (samples !== 1) {
            throw new Error(`Unsupported JPEG sample count: ${samples}`);
        }

        try {
            // Encode with quality 90 by default
            const quality = 90;
            const encoded = this.wasmModule.jpeg_encode(
                pixelData,
                width,
                height,
                quality,
                colorType
            );
            return [encoded];
        } catch (e) {
            console.error("JPEG Encoding failed:", e);
            throw new Error("JPEG Encoding failed");
        }
    }
}
