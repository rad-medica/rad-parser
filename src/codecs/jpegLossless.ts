/**
 * JPEG Lossless Decoder Plugin
 * Transfer Syntaxes: 1.2.840.10008.1.2.4.57 (Process 14), 1.2.840.10008.1.2.4.70 (Process 14 SV1)
 *
 * Note: JPEG Lossless uses the same LibJPEG-Turbo decoder as baseline JPEG.
 */
import { CodecInfo, PixelDataCodec } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";
import { WasmCodecs } from "./wasm-codecs";

export class JpegLosslessDecoder implements PixelDataCodec {
    name = "jpeglossless-wasm";
    priority = 20;
    codecInfo: CodecInfo = {
        multiFrame: false,
    };

    private wasmCodecs: WasmCodecs;
    private initPromise: Promise<void> | null = null;

    constructor() {
        this.wasmCodecs = new WasmCodecs();
    }

    private async initWasm(): Promise<void> {
        try {
            await this.wasmCodecs.initCodec("ljpeg");
        } catch (e) {
            console.warn("Failed to init JPEG Lossless Zig WASM codec", e);
        }
    }

    isSupported(): boolean {
        return true;
    }

    canDecode(transferSyntax: string): boolean {
        return [
            "1.2.840.10008.1.2.4.57", // JPEG Lossless, Non-Hierarchical (Process 14)
            "1.2.840.10008.1.2.4.70", // JPEG Lossless, Non-Hierarchical, First-Order Prediction
        ].includes(transferSyntax);
    }

    canEncode(transferSyntax: string): boolean {
        return false; // JPEG Lossless encoding not currently supported
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        const combined = concatFragments(encodedBuffer);

        if (!this.initPromise) {
            this.initPromise = this.initWasm();
        }
        await this.initPromise;

        return await this.wasmCodecs.decodeLjpeg(combined);
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number
    ): Promise<Uint8Array[]> {
        throw new Error("JPEG Lossless encoding not implemented");
    }
}

// Auto-register
// registry.register(new JpegLosslessDecoder());
