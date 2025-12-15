/**
 * Standard JPEG Decoder Plugin via Wasm
 * Transfer Syntaxes:
 *  - 1.2.840.10008.1.2.4.50 (JPEG Baseline)
 *  - 1.2.840.10008.1.2.4.51 (JPEG Extended 12-bit - Note: 'image' crate might map to 8-bit)
 */
import { CodecInfo, PixelDataCodec, registry } from "../core/registry";
import { concatFragments } from "../utils/bufferUtils";

export class JpegDecoder implements PixelDataCodec {
    name = "jpeg-wasm";
    priority = 30; // High priority (prefer Wasm over Browser if reliable)
    codecInfo: CodecInfo = {
        multiFrame: false,
    };

    isWasmInitialized = false;
    wasmModule: any = null;

    constructor() {
        this.initWasm();
    }

    async initWasm() {
        try {
            // @ts-ignore
            this.wasmModule =
                await import("../../src/wasm-codecs-build/rad_parser_wasm_codecs.js");
            await this.wasmModule.default();
            this.isWasmInitialized = true;
            console.log("JPEG WASM module initialized");
        } catch (e) {
            console.warn("Failed to load WASM module for JPEG", e);
        }
    }

    isSupported(): boolean {
        // Fallback to ImageDecoder (Browser) if Wasm missing?
        // Actually, for standard JPEG, Browser ImageDecoder is very fast.
        // Wasm is mainly useful for Node.js or if stricter control needed.
        return true;
    }

    canDecode(ts: string): boolean {
        return [
            "1.2.840.10008.1.2.4.50", // Baseline
            "1.2.840.10008.1.2.4.51", // Extended (Process 2 & 4)
        ].includes(ts);
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        const combined = concatFragments(encodedBuffer);

        // 1. Try Wasm
        if (this.isWasmInitialized && this.wasmModule) {
            try {
                return this.wasmModule.jpeg_decode(combined);
            } catch (e) {
                console.warn("Wasm JPEG decode failed, fallback to Browser", e);
            }
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
                image.image.displayHeight,
            );
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(image.image, 0, 0);
                return new Uint8Array(
                    ctx.getImageData(0, 0, canvas.width, canvas.height).data
                        .buffer,
                );
            }
        }

        throw new Error(
            "No JPEG decoder available (Wasm failed and no ImageDecoder)",
        );
    }
}

// Auto-register
registry.register(new JpegDecoder());
