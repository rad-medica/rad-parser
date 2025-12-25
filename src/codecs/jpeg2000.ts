/**
 * JPEG 2000 Decoder Plugin
 * Transfer Syntaxes: 1.2.840.10008.1.2.4.90 (Lossless), 1.2.840.10008.1.2.4.91 (Lossy)
 */
import { CodecInfo, PixelDataCodec } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";
import { WasmCodecs } from "./wasm-codecs";

export class Jpeg2000Decoder implements PixelDataCodec {
    name = "jpeg2000-wasm";
    priority = 20;
    codecInfo: CodecInfo = {
        multiFrame: false,
    };

    private wasmCodecs: WasmCodecs | null = null;
    private initPromise: Promise<void> | null = null;
    private injectedDecode?: (data: Uint8Array) => Promise<Uint8Array>;
    private injectedEncode?: (
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number,
        quality?: number
    ) => Promise<Uint8Array[]>;

    constructor(
        injectedDecode?: (data: Uint8Array) => Promise<Uint8Array>,
        injectedEncode?: (
            pixelData: Uint8Array,
            transferSyntax: string,
            width: number,
            height: number,
            samples: number,
            bits: number,
            quality?: number
        ) => Promise<Uint8Array[]>
    ) {
        if (injectedDecode || injectedEncode) {
            this.injectedDecode = injectedDecode;
            this.injectedEncode = injectedEncode;
        } else {
            // Use WASM implementation
            this.wasmCodecs = new WasmCodecs();
        }
    }

    private async initWasm(): Promise<void> {
        try {
            await this.wasmCodecs!.initCodec("j2k");
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
        // Filter out empty fragments (typically the Basic Offset Table)
        const validFragments = encodedBuffer.filter(
            frag => frag.byteLength > 0
        );
        if (validFragments.length === 0) {
            throw new Error("No valid fragments found in encoded buffer");
        }
        const combined = concatFragments(validFragments);

        if (this.injectedDecode) {
            return await this.injectedDecode(combined);
        }

        if (!this.wasmCodecs) {
            throw new Error(
                "Codec not initialized - either provide injected functions or ensure WASM is loaded"
            );
        }

        if (!this.initPromise) {
            this.initPromise = this.initWasm();
        }
        await this.initPromise;

        return await this.wasmCodecs.decodeJpeg2000(combined);
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
        if (this.injectedEncode) {
            return await this.injectedEncode(
                pixelData,
                transferSyntax,
                width,
                height,
                samples,
                bits,
                quality
            );
        }

        if (!this.wasmCodecs) {
            throw new Error("Codec not initialized");
        }

        if (this.wasmCodecs) {
            // Check if WASM supports encoding (not yet implemented in V1 wrappers for J2K encode in this file?)
            if (!this.initPromise) {
                this.initPromise = this.initWasm();
            }
            await this.initPromise;
        }

        try {
            // Determine if lossless based on transfer syntax
            const isLossless = [
                "1.2.840.10008.1.2.4.90", // JPEG 2000 Lossless
                "1.2.840.10008.1.2.4.92", // JPEG 2000 Part 2 Lossless
            ].includes(transferSyntax);

            const encoded = await this.wasmCodecs.encodeJpeg2000(
                pixelData,
                width,
                height,
                bits,
                samples,
                isLossless,
                quality
            );
            return [encoded];
        } catch (e: any) {
            throw new Error(
                `JPEG 2000 encode failed: ${e.message || String(e)}`
            );
        }
    }
}

// Auto-register
// registry.register(new Jpeg2000Decoder());
