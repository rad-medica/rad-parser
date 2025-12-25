/**
 * Native JPEG Codec Plugin
 * Uses Zig WASM for encoding and decoding.
 * Provides JPEG Baseline encoding support for Node.js environments.
 */
import { CodecInfo, PixelDataCodec } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";
import { WasmCodecs } from "./wasm-codecs";

export class JpegNativeCodec implements PixelDataCodec {
    name = "jpeg-native";
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
            await this.wasmCodecs.initCodec("jpeg");
        } catch (e) {
            console.warn("Failed to init JPEG Native Zig WASM codec", e);
        }
    }

    isSupported(): boolean {
        return true;
    }

    canDecode(ts: string): boolean {
        return ["1.2.840.10008.1.2.4.50", "1.2.840.10008.1.2.4.51"].includes(
            ts
        );
    }

    canEncode(ts: string): boolean {
        return ts === "1.2.840.10008.1.2.4.50";
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        const combined = concatFragments(encodedBuffer);

        if (!this.initPromise) {
            this.initPromise = this.initWasm();
        }
        await this.initPromise;

        return await this.wasmCodecs.decodeJpeg(combined);
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number,
        quality?: number
    ): Promise<Uint8Array[]> {
        if (!this.initPromise) {
            this.initPromise = this.initWasm();
        }
        await this.initPromise;

        const encoded = await this.wasmCodecs.encodeJpeg(
            pixelData,
            width,
            height,
            bits,
            samples,
            quality || 90
        );
        return [encoded];
    }
}
