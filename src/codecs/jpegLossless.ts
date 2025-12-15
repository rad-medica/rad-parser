/**
 * JPEG Lossless Decoder Plugin (Adapter)
 * Transfer Syntaxes: 1.2.840.10008.1.2.4.57 (Process 14), 1.2.840.10008.1.2.4.70 (Process 14 SV1)
 */

/**
 * JPEG Lossless Decoder Plugin (Adapter)
 * Transfer Syntaxes: 1.2.840.10008.1.2.4.57 (Process 14), 1.2.840.10008.1.2.4.70 (Process 14 SV1)
 */

import { CodecInfo, PixelDataCodec } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";

export class JpegLosslessDecoder implements PixelDataCodec {
    name = "jpeglossless-adapter";
    priority = 10; // Fallback
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
            console.log("JPEG Lossless WASM module initialized");
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
            throw new Error("JPEG Lossless encoder not configured.");
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
            "1.2.840.10008.1.2.4.57", // JPEG Lossless, Non-Hierarchical (Process 14)
            "1.2.840.10008.1.2.4.70", // JPEG Lossless, Non-Hierarchical, First-Order Prediction (Process 14 [Selection Value 1])
        ].includes(transferSyntax);
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        const combined = concatFragments(encodedBuffer);

        // 1. Try Wasm
        if (this.isWasmInitialized && this.wasmModule) {
            try {
                return this.wasmModule.jpeg_lossless_decode(combined);
            } catch (e) {
                console.warn(
                    "Wasm JPEG Lossless decode failed, falling back",
                    e,
                );
            }
        }

        // 2. Fallback
        if (!this.externalDecoder) {
            throw new Error("JPEG Lossless decoder not configured.");
        }

        return this.externalDecoder(combined);
    }
}
