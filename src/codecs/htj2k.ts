/**
 * HTJ2K (High-Throughput JPEG 2000) Decoder Plugin
 * Transfer Syntaxes: 1.2.840.10008.1.2.4.178
 */
import { CodecInfo, PixelDataCodec } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";
import { ZigCodecs } from "./zig-codecs";

export class Htj2kDecoder implements PixelDataCodec {
    name = "htj2k-wasm";
    priority = 20;
    codecInfo: CodecInfo = {
        multiFrame: false,
    };

    private zigCodecs: ZigCodecs;
    private initPromise: Promise<void> | null = null;

    constructor() {
        this.zigCodecs = new ZigCodecs();
    }

    private async initWasm(): Promise<void> {
        try {
            await this.zigCodecs.initCodec("htj2k");
        } catch (e) {
            console.warn("Failed to init HTJ2K Zig WASM codec", e);
        }
    }

    isSupported(): boolean {
        return true;
    }

    canDecode(transferSyntax: string): boolean {
        return transferSyntax === "1.2.840.10008.1.2.4.178";
    }

    canEncode(transferSyntax: string): boolean {
        return false;
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        const combined = concatFragments(encodedBuffer);

        if (!this.initPromise) {
            this.initPromise = this.initWasm();
        }
        await this.initPromise;

        return await this.zigCodecs.decodeHtj2k(combined);
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number
    ): Promise<Uint8Array[]> {
        throw new Error("HTJ2K encoding not implemented");
    }
}

// Auto-register
// registry.register(new Htj2kDecoder());
