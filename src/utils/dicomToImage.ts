import { JpegNativeCodec } from "../codecs/jpegNative"; // Wasm Native encoder
import { encodePNG } from "../codecs/png"; // Native encoder
import { DicomDataSet } from "../core/types";
import { applyVoiLutWasm } from "../core/wasm-opt";
import { extractRescaledPixelData } from "./pixelDataExtractor"; // Reusing our handy tool

export interface ImageExportOptions {
    frame?: number;
    width?: number; // Optional resize (not implemented in v1 loop, but placeholder)
    height?: number;
    windowCenter?: number;
    windowWidth?: number;
    autoWindow?: boolean;
    format?: "image/png" | "image/jpeg";
    quality?: number; // JPEG quality
}

export async function dicomToImage(
    dataset: DicomDataSet,
    options: ImageExportOptions = {}
): Promise<Uint8Array> {
    const frameIndex = options.frame || 0;
    const format = options.format || "image/png";

    // 1. Extract Calibrated Data (Float32)
    // This handles Decoding + Rescale Slope/Intercept automatically.
    // Note: extractRescaledPixelData returns the WHOLE volume.
    // We need to slice the specific frame roughly.
    // Limitation: If file is huge, this decodes everything.
    // Optimization: We should rely on `extractPixelData` getting raw and decoding only the frame if possible.
    // But `extractRescaledPixelData` is convenient.

    // Let's improve `extractRescaledPixelData` usage or replicate logic for single frame efficiency.
    // For V1, we accept decoding full volume overhead or assume single frame commonly.

    const rows = dataset.uint16("x00280010") || 0;
    const columns = dataset.uint16("x00280011") || 0;
    const samples = dataset.uint16("x00280002") || 1;
    const bitsAllocated = dataset.uint16("x00280100") || 8;

    const frameSize = rows * columns; // Pixels per frame
    // Note: samples=3 (RGB) means frameSize * 3 values usually, but strict "pixels" is rows*cols.
    // `extractRescaledPixelData` returns flattened array.

    // Re-implementing simplified pipeline for efficiency on single frame:
    // 1. Get Codec
    // 2. Decode Single Frame
    // 3. Apply Modality LUT
    // 4. Apply VOI LUT (Windowing)

    // ... Actually, reusing `extractRescaledPixelData` is safer for correctness,
    // but let's try to be efficient if it's a multi-frame video.

    const allPixelData = extractRescaledPixelData(dataset);
    // This returns Float32 array of values (Modality LUT applied).

    // Extract Frame
    const start = frameIndex * frameSize * samples;
    const end = start + frameSize * samples;
    if (end > allPixelData.length) {
        throw new Error(`Frame ${frameIndex} out of bounds`);
    }
    const frameData = allPixelData.subarray(start, end);

    // 2. Apply Window/Level (VOI LUT) -> Convert to Uint8
    // We need 0-255 for standard image formats.

    let wc = options.windowCenter;
    let ww = options.windowWidth;

    // Auto-window if not provided
    if (wc === undefined || ww === undefined) {
        if (options.autoWindow !== false) {
            // Default to true
            let min = Infinity;
            let max = -Infinity;
            for (let i = 0; i < frameData.length; i++) {
                const v = frameData[i]!;
                if (v < min) min = v;
                if (v > max) max = v;
            }
            ww = max - min;
            wc = min + ww / 2;
        } else {
            // Fallback to tags or full range
            wc = dataset.floatString("x00281050");
            ww = dataset.floatString("x00281051");
        }
    }

    // Default fallback if still undefined
    if (wc === undefined) wc = 128;
    if (ww === undefined) ww = 256;

    let outputBuffer: Uint8Array | null = null;

    // Try Wasm integration
    outputBuffer = applyVoiLutWasm(frameData, wc, ww);

    if (!outputBuffer) {
        // JS Fallback
        outputBuffer = new Uint8Array(frameData.length);
        const halfWidth = ww / 2;
        const lower = wc - halfWidth;
        const upper = wc + halfWidth - 1; // inclusive?

        for (let i = 0; i < frameData.length; i++) {
            let val = frameData[i]!;

            // Linear Windowing
            if (val <= lower) {
                val = 0;
            } else if (val > upper) {
                val = 255;
            } else {
                val = (val - (wc - 0.5)) / (ww - 1) + 0.5;
                // Standard DICOM formula: y = ((x - (c - 0.5)) / (w - 1) + 0.5) * (ymax-ymin) + ymin
                // Assuming output range 0-255
                val = ((val - lower) / ww) * 255;
            }

            // Clamp
            outputBuffer[i] = Math.max(0, Math.min(255, val));
        }
    }

    // 3. Encode
    if (format === "image/png") {
        return encodePNG({
            data: outputBuffer,
            width: columns,
            height: rows,
            colorType: samples === 3 ? "rgb" : "grayscale",
            bitDepth: 8,
        });
    } else if (format === "image/jpeg") {
        const jpegCodec = new JpegNativeCodec();
        // Codec auto-initializes on first use
        const frags = await jpegCodec.encode!(
            outputBuffer,
            "1.2.840.10008.1.2.4.50",
            columns,
            rows,
            samples,
            8
        );
        return frags[0]!;
    }

    throw new Error(`Unsupported format: ${format}`);
}
