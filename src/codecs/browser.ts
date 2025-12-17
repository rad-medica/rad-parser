/**
 * Browser Image Codec Plugin
 * Uses WebCodecs (ImageDecoder) for decoding and Canvas/OffscreenCanvas for encoding.
 */
import { CodecInfo, PixelDataCodec } from "../core/registry";

export class BrowserImageCodec implements PixelDataCodec {
    name = "browser-webcodecs";
    priority = 50;
    codecInfo: CodecInfo = {
        multiFrame: false,
    };

    isSupported(): boolean {
        return (
            typeof window !== "undefined" &&
            typeof window.ImageDecoder !== "undefined"
        );
    }

    canDecode(ts: string): boolean {
        return ["1.2.840.10008.1.2.4.50", "1.2.840.10008.1.2.4.51"].includes(
            ts
        );
    }

    canEncode(ts: string): boolean {
        // Browser canvas typically supports JPEG and PNG
        // 1.2.840.10008.1.2.4.50 = JPEG Baseline (Process 1)
        return ts === "1.2.840.10008.1.2.4.50";
    }

    async decode(encodedBuffer: Uint8Array[], info: any): Promise<Uint8Array> {
        const blob = new Blob(encodedBuffer as any, { type: "image/jpeg" });
        const decoder = new (window as any).ImageDecoder({
            data: blob.stream(),
            type: "image/jpeg",
        });
        const image = await decoder.decode();
        const frame = image.image;
        const size = frame.allocationSize();
        const buffer = new Uint8Array(size);
        await frame.copyTo(buffer);
        frame.close();
        return buffer;
    }

    async encode(
        pixelData: Uint8Array,
        transferSyntax: string,
        width: number,
        height: number,
        samples: number,
        bits: number
    ): Promise<Uint8Array[]> {
        // Use OffscreenCanvas or convert to ImageData -> Canvas -> Blob
        if (typeof document === "undefined")
            throw new Error("Browser encoding requires DOM");

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context failed");

        // Convert raw pixel data to ImageData (RGBA)
        // Assuming input is RGB or Grayscale. If Grayscale, need to replicate channels.
        const imageData = ctx.createImageData(width, height);
        // Simple copy loop (ignoring bits/samples complexity for demo)
        // Assume RGBA for simplicity or Gray -> RGBA
        for (let i = 0; i < pixelData.length; i++) {
            // ... pixel conversion logic ...
        }
        // ctx.putImageData(imageData, 0, 0);

        return new Promise((resolve, reject) => {
            canvas.toBlob(
                blob => {
                    if (!blob) return reject("Encoding failed");
                    blob.arrayBuffer().then(buf =>
                        resolve([new Uint8Array(buf)])
                    );
                },
                "image/jpeg",
                0.9
            );
        });
    }
}
