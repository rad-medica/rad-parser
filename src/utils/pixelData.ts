/**
 * Pixel Data Parser: Handles DICOM pixel data extraction
 *
 * Supports both native and encapsulated pixel data formats.
 */

import { SafeDataView } from "./SafeDataView";

/**
 * Pixel data extraction result
 */
export interface PixelDataResult {
    pixelData: Uint8Array;
    isEncapsulated: boolean;
    fragments?: Array<{ offset: number; length: number }>;
    fragmentArrays?: Uint8Array[]; // Array of fragment Uint8Arrays for encapsulated data
    transferSyntax?: string;
}

/**
 * Extract pixel data from DICOM element
 * Tag: (7FE0,0010) - Pixel Data
 */
export function extractPixelDataFromView(
    view: SafeDataView,
    length: number,
    transferSyntax?: string
): PixelDataResult | null {
    if (length === 0) {
        return null;
    }

    // Check if pixel data is encapsulated (undefined length)
    const isEncapsulated = length === 0xffffffff;

    if (isEncapsulated) {
        return extractEncapsulatedPixelData(view, transferSyntax);
    } else {
        return extractNativePixelData(view, length, transferSyntax);
    }
}

/**
 * Extract native (uncompressed) pixel data
 */
function extractNativePixelData(
    view: SafeDataView,
    length: number,
    transferSyntax?: string
): PixelDataResult | null {
    if (view.getRemainingBytes() < length) {
        return null;
    }

    try {
        const pixelData = view.readBytes(length);
        let finalPixelData = new Uint8Array(pixelData);

        // For Big Endian OW (16-bit words), byte-swap the words
        // The data is stored as Big Endian in the file, but we need Little Endian for JavaScript
        if (
            transferSyntax === "1.2.840.10008.1.2.2" && // Explicit VR Big Endian
            pixelData.length % 2 === 0 &&
            pixelData.length > 0
        ) {
            // Check if this is likely OW (16-bit) by checking if we have even length
            // For Big Endian, 16-bit words need to be byte-swapped
            const swapped = new Uint8Array(pixelData.length);
            const inputView = new DataView(
                pixelData.buffer,
                pixelData.byteOffset,
                pixelData.byteLength
            );
            const outputView = new DataView(swapped.buffer);
            for (let i = 0; i < pixelData.length; i += 2) {
                const word = inputView.getUint16(i, false); // Read as Big Endian (from file)
                outputView.setUint16(i, word, true); // Write as Little Endian (for JS)
            }
            finalPixelData = swapped;
        }

        return {
            pixelData: finalPixelData,
            isEncapsulated: false,
        };
    } catch {
        return null;
    }
}

import { concatFragments } from "./bufferUtils";
export { concatFragments };

/**
 * Extract encapsulated (compressed) pixel data
 * Format: Sequence of fragments with item tags (FFFE,E000) and lengths
 */
function extractEncapsulatedPixelData(
    view: SafeDataView,
    transferSyntax?: string
): PixelDataResult | null {
    const fragments: Array<{ offset: number; length: number }> = [];
    const fragmentArrays: Uint8Array[] = [];
    const maxFragments = 10000; // Safety limit
    let fragmentCount = 0;
    const allFragments: number[] = [];

    try {
        while (view.getRemainingBytes() >= 8 && fragmentCount < maxFragments) {
            const currentPos = view.getPosition();
            const group = view.readUint16();
            const element = view.readUint16();

            // Check for item tag (FFFE,E000)
            if (group === 0xfffe && element === 0xe000) {
                const fragLength = view.readUint32();

                if (fragLength === 0xffffffff) {
                    // Undefined length - not supported for pixel data
                    break;
                }

                if (fragLength === 0) {
                    // Empty fragment - skip
                    continue;
                }

                // Store fragment info (relative to start)
                fragments.push({
                    offset: allFragments.length,
                    length: fragLength,
                });

                // Read fragment data
                if (view.getRemainingBytes() >= fragLength) {
                    const fragData = view.readBytes(fragLength);
                    const fragArray = new Uint8Array(fragData);
                    fragmentArrays.push(fragArray);
                    // allFragments.push(...Array.from(fragData)); // Caused stack overflow
                    fragmentCount++;
                } else {
                    // Not enough data - stop
                    break;
                }
            } else if (group === 0xfffe && element === 0xe0dd) {
                // Sequence delimiter - end of pixel data
                view.readUint32(); // Read length (should be 0)
                break;
            } else {
                // Unexpected tag - back up and stop parsing
                view.setPosition(currentPos);
                break;
            }
        }

        // Check results
        if (fragments.length === 0 && fragmentArrays.length === 0) {
            return null;
        }

        // Combine fragments into one Uint8Array
        const combined = concatFragments(fragmentArrays);

        return {
            pixelData: combined,
            isEncapsulated: true,
            fragments: fragments,
            fragmentArrays: fragmentArrays,
            transferSyntax: transferSyntax,
        };
    } catch {
        return null;
    }
}

/**
 * Check if transfer syntax indicates compression
 */
export function isCompressedTransferSyntax(transferSyntax?: string): boolean {
    if (!transferSyntax) {
        return false;
    }

    const compressedSyntaxes = [
        "1.2.840.10008.1.2.4.50", // JPEG Baseline (Process 1)
        "1.2.840.10008.1.2.4.51", // JPEG Extended (Process 2 & 4)
        "1.2.840.10008.1.2.4.52", // JPEG Extended (Process 3 & 5)
        "1.2.840.10008.1.2.4.53", // JPEG Spectral Selection, Non-Hierarchical (Process 6 & 8)
        "1.2.840.10008.1.2.4.54", // JPEG Full Progression, Non-Hierarchical (Process 10 & 12)
        "1.2.840.10008.1.2.4.55", // JPEG Lossless, Non-Hierarchical (Process 14)
        "1.2.840.10008.1.2.4.57", // JPEG Lossless, Non-Hierarchical (Process 14 [Selection 1])
        "1.2.840.10008.1.2.4.70", // JPEG Lossless, Non-Hierarchical (Process 14 [Selection 2])
        "1.2.840.10008.1.2.4.80", // JPEG-LS Lossless
        "1.2.840.10008.1.2.4.81", // JPEG-LS Near-Lossless
        "1.2.840.10008.1.2.4.90", // JPEG 2000 Lossless
        "1.2.840.10008.1.2.4.91", // JPEG 2000 Lossy
        "1.2.840.10008.1.2.5", // RLE Lossless
    ];

    return compressedSyntaxes.includes(transferSyntax);
}
