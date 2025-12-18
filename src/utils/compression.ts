/**
 * Compression Support: Handles decompression of DICOM pixel data
 *
 * Currently supports RLE (Run-Length Encoding) lossless compression.
 * JPEG and other formats require external libraries or browser APIs.
 */

import type { PixelDataResult } from "./pixelData";

/**
 * Decompress pixel data based on transfer syntax
 */
export function decompressPixelData(
    pixelData: PixelDataResult,
    transferSyntax?: string
): Uint8Array | null {
    if (!pixelData.isEncapsulated || !transferSyntax) {
        return pixelData.pixelData;
    }

    // RLE Lossless compression
    if (transferSyntax === "1.2.840.10008.1.2.5") {
        return decompressRLE(pixelData);
    }

    // JPEG formats - would require external library or browser ImageDecoder API
    // For now, return null to indicate decompression is needed externally
    if (transferSyntax.startsWith("1.2.840.10008.1.2.4.")) {
        // JPEG variants - not implemented (requires external library)
        return null;
    }

    // JPEG-LS - not implemented
    if (transferSyntax.startsWith("1.2.840.10008.1.2.4.8")) {
        return null;
    }

    // JPEG 2000 - not implemented
    if (transferSyntax.startsWith("1.2.840.10008.1.2.4.9")) {
        return null;
    }

    // Unknown compression - return as-is
    return pixelData.pixelData;
}

/**
 * Decompress RLE (Run-Length Encoding) pixel data
 * DICOM RLE format: Header (64 bytes) + Segments
 */
function decompressRLE(pixelData: PixelDataResult): Uint8Array | null {
    try {
        const data = pixelData.pixelData;
        if (data.length < 64) {
            return null; // Invalid RLE header
        }

        // Read RLE header (64 bytes = 16 uint32 values)
        const header = new DataView(data.buffer, data.byteOffset, 64);
        const segmentCount = header.getUint32(0, true); // Little endian

        if (segmentCount < 1 || segmentCount > 15) {
            return null; // Invalid segment count
        }

        // Read segment offsets (each segment starts at offset)
        const segmentOffsets: number[] = [];
        for (let i = 0; i < segmentCount; i++) {
            segmentOffsets.push(header.getUint32(i * 4, true));
        }

        // Decompress each segment
        const decompressed: number[] = [];

        for (let seg = 0; seg < segmentCount; seg++) {
            const segmentStart = segmentOffsets[seg]!;
            const segmentEnd =
                seg < segmentCount - 1 ? segmentOffsets[seg + 1]! : data.length;

            if (segmentStart >= data.length || segmentEnd > data.length) {
                return null; // Invalid segment bounds
            }

            // Decompress this segment
            const segmentData = decompressRLESegment(
                data.slice(segmentStart, segmentEnd)
            );
            if (!segmentData) {
                return null;
            }

            decompressed.push(...Array.from(segmentData));
        }

        return new Uint8Array(decompressed);
    } catch {
        return null;
    }
}

/**
 * Decompress a single RLE segment
 */
function decompressRLESegment(segment: Uint8Array): Uint8Array | null {
    const result: number[] = [];
    let i = 0;

    while (i < segment.length) {
        const byte = segment[i++]!;

        if (byte >= 0 && byte <= 127) {
            // Literal run: copy next (byte + 1) bytes
            const count = byte + 1;
            if (i + count > segment.length) {
                return null; // Out of bounds
            }
            for (let j = 0; j < count; j++) {
                result.push(segment[i++]!);
            }
        } else if (byte >= 129 && byte <= 255) {
            // Replicate run: replicate next byte (257 - byte) times
            const count = 257 - byte;
            if (i >= segment.length) {
                return null; // Out of bounds
            }
            const value = segment[i++]!;
            for (let j = 0; j < count; j++) {
                result.push(value);
            }
        } else if (byte === 128) {
            // Reserved - skip or handle as error
            continue;
        }
    }

    return new Uint8Array(result);
}

/**
 * Check if browser supports ImageDecoder API for JPEG decompression
 */
export function supportsImageDecoder(): boolean {
    return typeof ImageDecoder !== "undefined";
}

/**
 * Decompress JPEG using browser ImageDecoder API (if available)
 */
export async function decompressJPEG(
    pixelData: PixelDataResult,
    mimeType: string = "image/jpeg"
): Promise<Uint8Array | null> {
    if (!supportsImageDecoder()) {
        return null;
    }

    try {
        const decoder = new ImageDecoder({
            data: pixelData.pixelData,
            type: mimeType,
        });

        const result = await decoder.decode();
        const videoFrame = result.image;

        // Convert VideoFrame to ImageData
        const canvas = new OffscreenCanvas(
            videoFrame.displayWidth,
            videoFrame.displayHeight
        );
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return null;
        }

        ctx.drawImage(videoFrame, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Return raw pixel data
        return new Uint8Array(imageData.data.buffer);
    } catch {
        return null;
    }
}
