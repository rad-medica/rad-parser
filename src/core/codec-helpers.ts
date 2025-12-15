/**
 * This file contains high-level helper functions for interacting
 * with the codec system externally.
 */

import { registry } from "./registry";
import { DicomDataSet } from "./types";
/**
 * Decodes a compressed pixel data buffer using the rad-parser codec registry.
 *
 * This function will automatically find and use the appropriate decoder
 * for the given Transfer Syntax. For adapter-based codecs, you may need to
 * pre-register a configured instance.
 *
 * @param transferSyntax - The Transfer Syntax UID of the compressed data.
 * @param fragments - The compressed pixel data fragments (from the x7fe00010 element).
 * @param [decodeOptions] - Optional: An object containing metadata needed by the decoder (e.g., `bitsAllocated`).
 * @returns A Promise that resolves to the raw, uncompressed pixel data.
 */
export async function decodePixelData(
    transferSyntax: string,
    fragments: Uint8Array[],
    decodeOptions?: any,
): Promise<Uint8Array> {
    const decoder = await registry.getDecoder(transferSyntax);

    if (!decoder) {
        throw new Error(
            `No decoder found for Transfer Syntax: ${transferSyntax}`,
        );
    }

    return decoder.decode(fragments, decodeOptions);
}

/**
 * Encodes a raw pixel data buffer using the rad-parser codec registry.
 *
 * @param transferSyntax - The target Transfer Syntax UID for compression.
 * @param pixelData - The raw, uncompressed pixel data.
 * @param encodeOptions - An object containing all necessary metadata for encoding (width, height, samplesPerPixel, bitsAllocated).
 * @returns A Promise that resolves to an array of encoded fragments.
 */
export async function encodePixelData(
    transferSyntax: string,
    pixelData: Uint8Array,
    encodeOptions: {
        width: number;
        height: number;
        samplesPerPixel: number;
        bitsAllocated: number;
        [key: string]: any; // Allow other properties
    },
): Promise<Uint8Array[]> {
    const encoder = await registry.getEncoder(transferSyntax);

    if (!encoder || !encoder.encode) {
        throw new Error(
            `No encoder found for Transfer Syntax: ${transferSyntax}`,
        );
    }

    return encoder.encode(
        pixelData,
        transferSyntax,
        encodeOptions.width,
        encodeOptions.height,
        encodeOptions.samplesPerPixel,
        encodeOptions.bitsAllocated,
    );
}
