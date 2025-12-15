/**
 * JPEG 2000 Decoder Plugin (Adapter)
 * Transfer Syntaxes: 1.2.840.10008.1.2.4.90 (Lossless), 1.2.840.10008.1.2.4.91 (Lossy)
 */

/**
 * JPEG 2000 Decoder Plugin (Adapter)
 * Transfer Syntaxes: 1.2.840.10008.1.2.4.90 (Lossless), 1.2.840.10008.1.2.4.91 (Lossy)
 */

import { concatFragments } from "../utils/bufferUtils";
import { CodecInfo, PixelDataCodec } from "../core/registry";

export class Jpeg2000Decoder implements PixelDataCodec {
    name = "jpeg2000-adapter";
    priority = 20;
    codecInfo: CodecInfo = {
        multiFrame: false,
    };

    isWasmInitialized = false;
    wasmModule: any = null;

    constructor(
        private externalDecoder?: (buffer: Uint8Array) => Promise<Uint8Array>,
        private externalEncoder?: (
            pixelData: Uint8Array,
            ts: string,
            w: number,
            h: number,
            s: number,
            b: number,
        ) => Promise<Uint8Array[]>,
    ) {
        this.initWasm();
    }

    async initWasm() {
        try {
            // @ts-ignore
            this.wasmModule =
                await import("../../src/wasm-codecs-build/rad_parser_wasm_codecs.js");
            await this.wasmModule.default();
            this.isWasmInitialized = true;
            console.log("JPEG 2000 WASM module initialized (Stub)");
        } catch (e) {
            console.warn("Failed to load WASM module", e);
        }
    }

    canEncode(transferSyntax: string): boolean {
        return !!this.externalEncoder && this.canDecode(transferSyntax);
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number,
    ): Promise<Uint8Array[]> {
        if (!this.externalEncoder)
            throw new Error("JPEG 2000 encoder not configured.");
        return this.externalEncoder(
            pixelData,
            transferSyntax,
            width,
            height,
            samples,
            bits,
        );
    }

    isSupported(): boolean {
        // Supported if external decoder provided
        return !!this.externalDecoder;
    }

    canDecode(transferSyntax: string): boolean {
        return [
            "1.2.840.10008.1.2.4.90", // JPEG 2000 Image Compression (Lossless Only)
            "1.2.840.10008.1.2.4.91", // JPEG 2000 Image Compression
            "1.2.840.10008.1.2.4.92", // JPEG 2000 Part 2 Multicomponent Compression (Lossless Only)
            "1.2.840.10008.1.2.4.93", // JPEG 2000 Part 2 Multicomponent Compression
        ].includes(transferSyntax);
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        const combined = concatFragments(encodedBuffer);

        // 1. Try Wasm
        if (this.isWasmInitialized && this.wasmModule) {
            try {
                // Use wasm decoder
                return this.wasmModule.jpeg2000_decode(combined);
            } catch (e) {
                console.warn("Wasm J2K decode failed, falling back", e);
            }
        }

        // 2. Fallback to external decoder
        if (!this.externalDecoder) {
            throw new Error(
                "JPEG 2000 decoder not configured. Please inject a decoder (e.g. OpenJPEG).",
            );
        }

        return this.externalDecoder(combined);
    }
}
