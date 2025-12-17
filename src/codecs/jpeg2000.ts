/**
 * JPEG 2000 Decoder Plugin
 * Transfer Syntaxes: 1.2.840.10008.1.2.4.90 (Lossless), 1.2.840.10008.1.2.4.91 (Lossy)
 */
import { concatFragments } from "../utils/bufferUtils";
import { CodecInfo, PixelDataCodec, registry } from "../core/registry";
import { ZigCodecs } from "./zig-codecs";

export class Jpeg2000Decoder implements PixelDataCodec {
    name = "jpeg2000-wasm";
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
            await this.zigCodecs.initCodec("j2k");
        } catch (e) {
            console.warn("Failed to init JPEG 2000 Zig WASM codec", e);
        }
    }

    isSupported(): boolean {
        return true;
    }

    canDecode(transferSyntax: string): boolean {
        return [
            "1.2.840.10008.1.2.4.90", // JPEG 2000 Lossless
            "1.2.840.10008.1.2.4.91", // JPEG 2000 Lossy
            "1.2.840.10008.1.2.4.92", // JPEG 2000 Part 2 Lossless
            "1.2.840.10008.1.2.4.93", // JPEG 2000 Part 2 Lossy
        ].includes(transferSyntax);
    }

    canEncode(transferSyntax: string): boolean {
        return this.canDecode(transferSyntax);
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        const combined = concatFragments(encodedBuffer);

        if (this.initPromise) {
            await this.initPromise;
        }

        return await this.zigCodecs.decodeJpeg2000(combined);
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number
    ): Promise<Uint8Array[]> {
        if (this.initPromise) {
            await this.initPromise;
        }

        const encoded = await this.zigCodecs.encodeJpeg2000(
            pixelData,
            width,
            height,
            bits,
            samples
        );
        return [encoded];
    }
}

// Auto-register
registry.register(new Jpeg2000Decoder());
