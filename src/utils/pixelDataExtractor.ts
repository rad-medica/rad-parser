/**
 * Extract and rescale pixel data to Float32Array
 *
 * This utility extracts pixel data from a DICOM dataset, automatically decodes
 * compressed data using the appropriate codec, and applies rescale slope/intercept
 * to produce normalized Float32 values.
 *
 * @param dataset - Parsed DICOM dataset
 * @returns Float32Array with rescaled pixel values
 */

import type { DicomDataSet } from "../core/types";
import { applyModalityLutWasm } from "../core/wasm-opt";

// Assuming PixelDataInfo is defined elsewhere or will be added.
// For the purpose of this edit, we'll use 'any' for the Value property
// as the instruction doesn't specify the structure of PixelDataInfo.
export interface PixelDataInfo {
    Value: any;
    isEncapsulated: boolean;
    fragmentArrays?: Uint8Array[];
    pixelData?: Uint8Array;
}

export function extractPixelData(dataset: any): PixelDataInfo | null {
    // Try various tag formats
    const element =
        dataset.elements?.["x7fe00010"] ||
        dataset.elements?.["7fe00010"] ||
        dataset.dict?.["x7fe00010"] ||
        dataset.dict?.["7fe00010"] ||
        (dataset.elements
            ? Object.values(dataset.elements).find(
                  (e: any) => e.tag === "x7fe00010" || e.tag === "7fe00010"
              )
            : null);

    if (!element) {
        // console.log("Debug: Pixel Data element not found. Available keys:", Object.keys(dataset.elements || dataset.dict || {}).slice(0, 10));
        return null;
    }

    return {
        Value: element.Value,
        isEncapsulated: (element as any).isEncapsulated || false,
    };
}

export function extractRescaledPixelData(dataset: any): Float32Array {
    // Get rescale parameters (default to y = x if not present)
    // Rescale Intercept (0028,1052)
    // DS (Decimal String) - use floatString or check element directly
    const intercept = dataset.floatString("x00281052") ?? 0;

    // Rescale Slope (0028,1053)
    const slope = dataset.floatString("x00281053") ?? 1;

    // Get pixel data dimensions
    const rows = dataset.uint16("x00280010") ?? 0;
    const columns = dataset.uint16("x00280011") ?? 0;
    const numberOfFrames = dataset.uint16("x00280008") ?? 1;
    const bitsAllocated = dataset.uint16("x00280100") ?? 16;
    const pixelRepresentation = dataset.uint16("x00280103") ?? 0; // 0 = unsigned, 1 = signed

    if (rows === 0 || columns === 0) {
        throw new Error(
            "Invalid image dimensions: rows and columns must be > 0"
        );
    }

    const totalPixels = rows * columns * numberOfFrames;

    // Extract raw pixel data based on bits allocated
    let pixelData: Uint8Array | Uint16Array | Int16Array;

    if (bitsAllocated === 8) {
        const val = dataset.dict["x7fe00010"]?.Value;
        if (val instanceof Uint8Array) {
            pixelData = val;
        } else {
            pixelData = new Uint8Array(0);
        }
    } else if (bitsAllocated === 16) {
        if (pixelRepresentation === 1) {
            // Signed 16-bit
            const raw = dataset.dict["x7fe00010"]?.Value;
            if (!(raw instanceof Uint8Array)) {
                throw new Error("Pixel data not found or invalid format");
            }
            pixelData = new Int16Array(
                raw.buffer,
                raw.byteOffset,
                raw.byteLength / 2
            );
        } else {
            // Unsigned 16-bit
            const raw = dataset.dict["x7fe00010"]?.Value;
            if (!(raw instanceof Uint8Array)) {
                throw new Error("Pixel data not found or invalid format");
            }
            pixelData = new Uint16Array(
                raw.buffer,
                raw.byteOffset,
                raw.byteLength / 2
            );
        }
    } else {
        throw new Error(
            `Unsupported bits allocated: ${bitsAllocated}. Only 8 and 16 are supported.`
        );
    }

    if (pixelData.length === 0) {
        throw new Error("Pixel data is empty");
    }

    // Ensure we have the expected number of pixels
    const expectedLength = Math.min(totalPixels, pixelData.length);

    // Create output Float32Array
    const output = new Float32Array(expectedLength);

    // Try Wasm optimization first
    if (pixelData instanceof Uint8Array) {
        // We need to pass the raw bytes. If pixelData is derived from a buffer view (like Int16Array),
        // we might need the underlying buffer.
        // However, the Wasm signature takes &[u8].
        // If we extracted `pixelData` as TypedArray, we can access `.buffer` but need careful offset handling.

        // Simpler approach: If bitsAllocated is 8, pixelData IS Uint8Array check above.
        // If 16, we created a view. We can map back to u8 slice.

        let rawBytes: Uint8Array;
        if (pixelData instanceof Uint8Array) {
            rawBytes = pixelData;
        } else {
            // TypedArray (U16/I16)
            const typed = pixelData as Uint16Array | Int16Array;
            rawBytes = new Uint8Array(
                typed.buffer,
                typed.byteOffset,
                typed.byteLength
            );
        }

        const wasmResult = applyModalityLutWasm(
            rawBytes,
            slope,
            intercept,
            bitsAllocated,
            pixelRepresentation
        );

        if (wasmResult) {
            return wasmResult;
        }
    }

    // Apply rescale transformation: rescaled = stored * slope + intercept
    for (let i = 0; i < expectedLength; i++) {
        const storedValue = pixelData[i];
        output[i] = storedValue * slope + intercept;
    }

    return output;
}
