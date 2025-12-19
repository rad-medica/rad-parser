/**
 * JPEG-LS Decoder Plugin
 * Transfer Syntaxes: 1.2.840.10008.1.2.4.80 (Lossless), 1.2.840.10008.1.2.4.81 (Near-lossless)
 */
import { CodecInfo, PixelDataCodec, registry } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";
import { ZigCodecs } from "./zig-codecs";

export class JpegLsDecoder implements PixelDataCodec {
    name = "jpegls-wasm";
    priority = 20;
    codecInfo: CodecInfo = {
        multiFrame: false,
    };

    private zigCodecs: ZigCodecs | null = null;
    private initPromise: Promise<void> | null = null;
    private injectedDecode?: (data: Uint8Array) => Promise<Uint8Array>;
    private injectedEncode?: (
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number
    ) => Promise<Uint8Array[]>;

    constructor(
        injectedDecode?: (data: Uint8Array) => Promise<Uint8Array>,
        injectedEncode?: (
            pixelData: Uint8Array,
            transferSyntax: string,
            width: number,
            height: number,
            samples: number,
            bits: number
        ) => Promise<Uint8Array[]>
    ) {
        if (injectedDecode || injectedEncode) {
            // Use injected functions for testing
            this.injectedDecode = injectedDecode;
            this.injectedEncode = injectedEncode;
        } else {
            // Use WASM implementation
            this.zigCodecs = new ZigCodecs();
            this.initPromise = this.initWasm();
        }
    }

    private async initWasm(): Promise<void> {
        try {
            await this.zigCodecs.initCodec("jpegls");
        } catch (e) {
            console.warn("Failed to init JPEG-LS Zig WASM codec", e);
        }
    }

    isSupported(): boolean {
        return true;
    }

    canDecode(transferSyntax: string): boolean {
        return [
            "1.2.840.10008.1.2.4.80", // JPEG-LS Lossless
            "1.2.840.10008.1.2.4.81", // JPEG-LS Near-Lossless
        ].includes(transferSyntax);
    }

    canEncode(transferSyntax: string): boolean {
        return this.canDecode(transferSyntax);
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        const combined = concatFragments(encodedBuffer);

        if (this.injectedDecode) {
            return await this.injectedDecode(combined);
        }

        if (!this.zigCodecs) {
            throw new Error("Codec not initialized");
        }

        if (this.initPromise) {
            await this.initPromise;
        }

        return await this.zigCodecs.decodeJpegLs(combined);
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number
    ): Promise<Uint8Array[]> {
        if (this.injectedEncode) {
            return await this.injectedEncode(
                pixelData,
                transferSyntax,
                width,
                height,
                samples,
                bits
            );
        }

        if (!this.zigCodecs) {
            throw new Error("Codec not initialized");
        }

        if (this.initPromise) {
            await this.initPromise;
        }

        const encoded = await this.zigCodecs.encodeJpegLs(
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
registry.register(new JpegLsDecoder());
