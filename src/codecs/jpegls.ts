/**
 * JPEG-LS Decoder Plugin (Adapter)
 * Transfer Syntaxes: 1.2.840.10008.1.2.4.80 (Lossless), 1.2.840.10008.1.2.4.81 (Near-lossless)
 */

/**
 * JPEG-LS Decoder Plugin (Adapter)
 * Transfer Syntaxes: 1.2.840.10008.1.2.4.80 (Lossless), 1.2.840.10008.1.2.4.81 (Near-lossless)
 */

import { CodecInfo, PixelDataCodec } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";

export class JpegLsDecoder implements PixelDataCodec {
    name = "jpegls-adapter";
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
            this.wasmModule = await import("../../src/wasm-codecs-build/rad_parser_wasm_codecs.js");
            await this.wasmModule.default();
            this.isWasmInitialized = true;
            console.log("JPEG-LS WASM module initialized");
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
            throw new Error("JPEG-LS encoder not configured.");
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
        return !!this.externalDecoder;
    }

    canDecode(transferSyntax: string): boolean {
        return [
            "1.2.840.10008.1.2.4.80", // JPEG-LS Lossless Image Compression
            "1.2.840.10008.1.2.4.81", // JPEG-LS Lossy (Near-Lossless) Image Compression
        ].includes(transferSyntax);
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        const combined = concatFragments(encodedBuffer);

        // 1. Try Wasm
        if (this.isWasmInitialized && this.wasmModule) {
            try {
                return await this.wasmModule.jpegls_decode(combined);
            } catch (e) {
                console.warn("Wasm JPEG-LS decode failed, falling back", e);
            }
        }

        // 2. Fallback
        if (!this.externalDecoder) {
            throw new Error("JPEG-LS decoder not configured.");
        }

        return this.externalDecoder(combined);
    }
}
