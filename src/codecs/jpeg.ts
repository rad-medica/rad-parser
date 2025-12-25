/**
 * Standard JPEG Decoder Plugin via Zig WASM
 * Transfer Syntaxes:
 *  - 1.2.840.10008.1.2.4.50 (JPEG Baseline)
 *  - 1.2.840.10008.1.2.4.51 (JPEG Extended 12-bit)
 */
import { CodecInfo, PixelDataCodec, registry } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";
import { WasmCodecs } from "./wasm-codecs";

export class JpegDecoder implements PixelDataCodec {
    name = "jpeg-wasm";
    priority = 30;
    codecInfo: CodecInfo = {
        multiFrame: false,
    };

    private wasmCodecs: WasmCodecs;
    private initPromise: Promise<void> | null = null;

    constructor() {
        this.wasmCodecs = new WasmCodecs();
        this.initPromise = this.initWasm();
    }

    private async initWasm(): Promise<void> {
        try {
            await this.wasmCodecs.initCodec("jpeg");
        } catch (e) {
            console.warn("Failed to init JPEG Zig WASM codec", e);
        }
    }

    isSupported(): boolean {
        return true;
    }

    canDecode(ts: string): boolean {
        return [
            "1.2.840.10008.1.2.4.50", // Baseline
            "1.2.840.10008.1.2.4.51", // Extended
        ].includes(ts);
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        const combined = concatFragments(encodedBuffer);

        // Ensure WASM is initialized
        if (this.initPromise) {
            await this.initPromise;
        }

        // 1. Try Zig WASM
        try {
            return await this.wasmCodecs.decodeJpeg(combined);
        } catch (e) {
            console.warn("Zig WASM JPEG decode failed, fallback to Browser", e);
        }

        // 2. Fallback to Browser Native
        if (typeof ImageDecoder !== "undefined") {
            const decoder = new ImageDecoder({
                data: combined,
                type: "image/jpeg",
            });
            const image = await decoder.decode();
            const canvas = new OffscreenCanvas(
                image.image.displayWidth,
                image.image.displayHeight
            );
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(image.image, 0, 0);
                return new Uint8Array(
                    ctx.getImageData(0, 0, canvas.width, canvas.height).data
                        .buffer
                );
            }
        }

        throw new Error(
            "No JPEG decoder available (Zig WASM failed and no ImageDecoder)"
        );
    }
}

// Auto-register
registry.register(new JpegDecoder());
