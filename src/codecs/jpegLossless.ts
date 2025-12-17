/**
 * JPEG Lossless Decoder Plugin
 * Transfer Syntaxes: 1.2.840.10008.1.2.4.57 (Process 14), 1.2.840.10008.1.2.4.70 (Process 14 SV1)
 *
 * Note: JPEG Lossless uses the same LibJPEG-Turbo decoder as baseline JPEG.
 */
import { CodecInfo, PixelDataCodec, registry } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";
import { ZigCodecs } from "./zig-codecs";

export class JpegLosslessDecoder implements PixelDataCodec {
    name = "jpeglossless-wasm";
    priority = 20;
    codecInfo: CodecInfo = {
        multiFrame: false,
    };

    private zigCodecs: ZigCodecs;
    private initPromise: Promise<void> | null = null;

    constructor() {
        this.zigCodecs = new ZigCodecs();
        this.initPromise = this.initWasm();
    }

    private async initWasm(): Promise<void> {
        try {
            await this.zigCodecs.initCodec("jpeg");
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

        if (this.initPromise) {
            await this.initPromise;
        }

        return await this.zigCodecs.decodeJpeg(combined);
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number,
    ): Promise<Uint8Array[]> {
        throw new Error("JPEG Lossless encoding not implemented");
    }
}

// Auto-register
registry.register(new JpegLosslessDecoder());
